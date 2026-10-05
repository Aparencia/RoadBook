/**
 * roadbook-autoload —— Roadbook V6 开发流程母版的自动加载插件（Host 半区）。
 *
 * 作用：用户在一个 git 项目里开口谈开发任务时，把 roadbook 技能正文按内置
 * 「用户显式调用」的同一形状注入当前回合，使流程卡不依赖模型自觉。
 *
 * 压缩感知：注入消息被上下文压缩 shadow 出可见面后，本插件会在下一次
 * agent/pre-step 重新注入（判据 = session.surface 上还在不在，不是「历史上注入过没有」）——
 * 否则长会话被压缩一次，后半程就再也拿不到流程卡。
 *
 * 分工：门控与文案等纯逻辑在 ./trigger.js（不 import dsh 包，可离线单测）；
 * 本文件只做 Host 侧接线：读会话、查技能、注入消息、落观测。
 * 另外三块纯逻辑各有自己的文件，本文件只负责把它们接到宿主扩展点上：
 *   ./gate.js  动作闸判据（`tools/pre-execute`，A 类红线 + C7 未按卡开工 + Team 策略 off）
 *   ./state.js STATE.md 必填字段（B10，字段逐字取自 template/STATE.md）
 *   ./team.js  Team 消费层（消费 roadbook-team 行提供的可选服务 `roadbookTeam`，只解释不判断）
 *
 * 依赖：@deepseek-ai/dsh-llm / dsh-skill / schemastery 由宿主提供，见本目录与仓库根
 * package.json 的 peerDependencies —— 插件内不下载、不打包，宿主大版本升级后要重新核对。
 * 三者都是**守卫式动态 import**：解析不到就退回 ./host-fallback.js 的等价实现，绝不让
 * 整行插件因为缺宿主包而静默变成面板上的「未运行」（原因见 host-fallback.js 顶部注释）。
 *
 * 常驻微提示：关键词门控必须命中才注入正文，没命中的会话此前整轮没有任何流程约束。
 * 所以另外注册一段极短的 system prompt section（不是注入 user message）：它每轮都在、
 * 不占对话历史、不受压缩影响；服务读不到就不显示，绝不让整行插件变成「未运行」。
 *
 * 观测：自进化 A 环默认开启 —— 每个分支（inject / skip / error）都往
 * <os.tmpdir()>/roadbook-autoload.jsonl 追加一行 JSONL；观测是旁路，写失败只吞自己，
 * 绝不影响会话（同理，渲染或建消息失败也只跳过该技能）。文件超上限就轮转到 `<file>.1`，
 * 且**只记用户文本的指纹与长度，不记原文**（共享临时目录、跨会话、永不清理）。
 */
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { decideGate } from './gate.js'
import {
  createUserMessage as fallbackCreateUserMessage,
  isUserInvocable as fallbackIsUserInvocable,
  renderSkillContent as fallbackRenderSkillContent,
} from './host-fallback.js'
import { parseState } from './state.js'
import { resolveTeamPolicy } from './team.js'
import {
  DEFAULT_KEYWORDS,
  DEFAULT_SUPPRESS,
  alreadyInjected,
  buildNote,
  cardReadState,
  hasGesture,
  hasInjectedMessage,
  isSubagentHeader,
  matchIntent,
  pickUserText,
  shortDigest,
  surfaceInjectionState,
} from './trigger.js'

/**
 * 守卫式解析宿主包（正常路径 = 宿主注入的 peerDependencies；兜底 = ./host-fallback.js）。
 *
 * 解析失败必须被接住：loader 对「入口模块 import 失败」只写一条 logger.error 然后 return，
 * `entry.fiber` 不赋值 ⇒ 插件面板显示「未运行」，用户看不出是缺包、缺文件还是版本不符。
 * 这里把失败原因收进 hostFallbacks，由 apply() 写进日志与观测文件（症状 → 原因一次到手）。
 */
const HOST_PACKAGES = {
  llm: '@deepseek-ai/dsh-llm',
  skill: '@deepseek-ai/dsh-skill',
  schema: '@deepseek-ai/schemastery',
}

async function loadHostPackage(specifier) {
  try {
    return { specifier, module: await import(specifier) }
  } catch (error) {
    return { specifier, module: null, error: error instanceof Error ? error.message : String(error) }
  }
}

const hostLlm = await loadHostPackage(HOST_PACKAGES.llm)
const hostSkill = await loadHostPackage(HOST_PACKAGES.skill)
const hostSchema = await loadHostPackage(HOST_PACKAGES.schema)

/** 解析不到、已改用本地等价实现的宿主包（apply() 报到日志与观测文件；空数组 = 全部用宿主真实现）。 */
export const hostFallbacks = [hostLlm, hostSkill, hostSchema]
  .filter((host) => host.module === null)
  .map((host) => ({ specifier: host.specifier, error: host.error, replacement: './host-fallback.js' }))

const createUserMessage = hostLlm.module?.createUserMessage ?? fallbackCreateUserMessage
const isUserInvocable = hostSkill.module?.isUserInvocable ?? fallbackIsUserInvocable
const renderSkillContent = hostSkill.module?.renderSkillContent ?? fallbackRenderSkillContent

export const name = 'roadbook-autoload'

/** skills 用来解析技能正文；agents 提供 agent/pre-step 事件。 */
export const inject = ['agents', 'skills']

/** 观测文件缺省名（放在 os.tmpdir() 下，任何系统都可写）。 */
const DEFAULT_REPORT_FILE = 'roadbook-autoload.jsonl'

/** 观测文件缺省字节上限（2 MiB）：文件在共享临时目录里、跨会话、永不清理，不轮转就是慢性泄漏。 */
const DEFAULT_REPORT_MAX_BYTES = 2097152

/** 常驻集合的 FIFO 上限：一次会话/跳过/项目根各一条，不设上限就是常驻宿主内存的慢性泄漏。 */
const MAX_REMEMBERED = 512

/**
 * 空转观测（自进化 C 环）的观察门槛：注入之后至少再走这么多步才判。
 * 太小会把「刚注入、还没轮到读卡」误报成空转；太大则长会话迟迟得不到读数。
 */
const IDLE_CHECK_STEPS = 4

/**
 * 常驻微提示文案（system prompt section，不是注入的 user message）。
 * 为什么要有：关键词命中率只有五到八成，没命中的会话此前整轮没有任何流程约束。
 * 为什么这么短：它每一轮都在上下文里，长正文交给命中后的全量注入，这里只留坐标与硬判据。
 */
const BANNER_TEXT =
  '[roadbook] 本机装了 RoadBook 流程（路由 skills/roadbook/SKILL.md，卡片在 playbook/ 与 playbook_EN/）。涉及开发任务时按卡推进：红灯 = 停；「完成」= check.ps1 退出码 0 且粘贴真实输出；回执只认命令输出 / 文件路径 / 提交哈希。与本轮无关时忽略本段。要关掉：把插件行的 banner 设为 false。'

/**
 * 有界 FIFO 记忆：命中过的仍在（读取方先 has 再取值），超上限时淘汰最早写入的那条。
 * 覆盖写入会把该键挪到队尾 —— 刚验证过的项目根/刚记过的跳过理由最不该先掉。
 * Set 与 Map 通用：Set 走 add、Map 走 set，两者都有 has / delete / keys。
 */
function remember(store, key, value = true) {
  if (store.has(key)) store.delete(key)
  if (typeof store.set === 'function') store.set(key, value)
  else store.add(key)
  if (store.size > MAX_REMEMBERED) store.delete(store.keys().next().value)
  return value
}

/**
 * 配置 schema：由宿主提供的 schemastery 构造。宿主没给（解析失败或构造抛错）时为 undefined ——
 * 此时 cordis 不校验行配置，schema 里的缺省值不生效，apply() 会打一条警告说明这件事。
 */
export const Config = buildConfig(hostSchema.module)

function buildConfig(schema) {
  const z = schema?.default ?? schema
  if (z === null || z === undefined || typeof z.object !== 'function') return undefined
  try {
    return z.object({
      /** 要自动加载的技能名（按序取第一个能解析的）。 */
      skills: z.array(z.string()).default(['roadbook']),
      /** keyword：命中关键词注入；always：只要是 git 项目里的用户消息就注入；off：完全关闭。 */
      mode: z.union([z.const('keyword'), z.const('always'), z.const('off')]).default('keyword'),
      keywords: z.array(z.string()).default(DEFAULT_KEYWORDS),
      suppressKeywords: z.array(z.string()).default(DEFAULT_SUPPRESS),
      /** 子代理会话是否也注入，默认不注入。 */
      includeSubagents: z.boolean().default(false),
      /** 只在本会话位于 git 项目内时注入。 */
      requireGitRoot: z.boolean().default(true),
      /** 一次会话只注入一次。 */
      oncePerSession: z.boolean().default(true),
      /** 在技能正文后附一行透明说明（为什么加载、怎么关）。 */
      note: z.boolean().default(true),
      /** 每轮常驻的极短微提示（system prompt section）；关掉设 false，本文本段即不贡献内容。 */
      banner: z.boolean().default(true),
      /** 自进化 A 环：观测是否落盘，默认开（注入/跳过/报错都记一行）。 */
      report: z.boolean().default(true),
      /** 自进化 A 环：观测记录（JSONL）落盘路径，空 = <os.tmpdir()>/roadbook-autoload.jsonl。 */
      reportPath: z.string().default(''),
      /** 自进化 A 环：观测文件字节上限，超了就轮转到 `<reportPath>.1`（覆盖旧的 .1）再继续写。 */
      reportMaxBytes: z.number().default(DEFAULT_REPORT_MAX_BYTES),
      /** 自进化 B 环：SKILL.md 指纹基线，对不上就在说明里提示技能已更新。 */
      skillDigest: z.string().default(''),
      /**
       * 动作闸（`tools/pre-execute`）：deny = 拦（默认）；warn = 只回执不拦；off = 不注册监听器。
       * 为什么默认拦：强引用取动作闸（用户裁决 4）——提醒不算机械后果，`deny` 才算。
       */
      gate: z.union([z.const('off'), z.const('warn'), z.const('deny')]).default('deny'),
      /**
       * STATE.md 必填字段校验（B10）：只在「文件在、但缺必填键」或「读不动」时落一条观测。
       * 没有 STATE.md 的 git 项目是常态（没接 RoadBook 的项目到处都是），不刷观测。
       */
      stateCheck: z.boolean().default(true),
    })
  } catch (error) {
    hostFallbacks.push({
      specifier: HOST_PACKAGES.schema,
      error: error instanceof Error ? error.message : String(error),
      replacement: '无 schema（行配置必须显式给出 skills / mode 等，缺省值不生效）',
    })
    return undefined
  }
}

export function apply(ctx, config = {}, runtime = {}) {
  // 四个常驻集合都会活到插件卸载为止：全部经 remember() 走有界 FIFO，避免长驻宿主内存只增不减。
  const injectedSessions = new Set()
  const gitRoots = new Map()
  const digests = new Map()
  const reportedSkips = new Set()
  /** 动作闸的拦下回执去重表：会话 + 工具 + 规则（同一会话反复撞同一条规则只记一行，不刷屏）。 */
  const reportedGates = new Set()
  /** 项目 STATE.md 的位置缓存：cwd → 文件路径（'' = 一路找到家目录都没有）。 */
  const stateFiles = new Map()
  /** 空转观测的观察簿：sessionId → { steps, settled }（同样走 remember 的有界 FIFO）。 */
  const idleWatch = new Map()
  /** 观察对象：配置里的第一个技能名（与真正会注入的那个一致）。 */
  const idleSkillName = Array.isArray(config?.skills) && typeof config.skills[0] === 'string' ? config.skills[0] : ''
  const home = typeof runtime?.home === 'string' && runtime.home.length > 0 ? runtime.home : homedir()
  const reportEnabled = config?.report !== false
  /** 动作闸档位：非法取值按最严的 deny 处理（配置写错不许静默变成「不设防」）。 */
  const gateMode = config?.gate === 'off' || config?.gate === 'warn' ? config.gate : 'deny'
  const reportFile =
    typeof config?.reportPath === 'string' && config.reportPath.trim().length > 0
      ? config.reportPath.trim()
      : join(tmpdir(), DEFAULT_REPORT_FILE)
  const reportMaxBytes =
    typeof config?.reportMaxBytes === 'number' && Number.isFinite(config.reportMaxBytes) && config.reportMaxBytes > 0
      ? config.reportMaxBytes
      : DEFAULT_REPORT_MAX_BYTES
  let advertised = false
  // 已写字节在内存里累计，种子取现有文件大小：每行都 stat 一次等于把观测变成 I/O 热点。
  // 读不到（首次运行、被别的进程占着）就从 0 起算，最多让本轮多写一个上限的量。
  let reportBytes = 0
  try {
    reportBytes = statSync(reportFile).size
  } catch {
    reportBytes = 0
  }

  /**
   * 观测轮转：超上限就把当前文件挪到 `<reportFile>.1`（覆盖旧的 .1）后从零继续写。
   * 挪不动（被占用、目录只读）也照样把计数归零继续写：观测是旁路，轮转失败不许打断会话。
   */
  const rotateReport = () => {
    try {
      rmSync(`${reportFile}.1`, { force: true })
      renameSync(reportFile, `${reportFile}.1`)
    } catch {
      /* 轮转失败只影响体积，不影响会话 */
    }
    reportBytes = 0
  }

  /** 观测是旁路：任何失败都只吞自己，绝不打断会话。 */
  const writeReport = (entry) => {
    if (!reportEnabled) return
    const line = `${JSON.stringify({ time: new Date().toISOString(), file: reportFile, ...entry })}\n`
    const bytes = Buffer.byteLength(line, 'utf8')
    try {
      if (reportBytes + bytes > reportMaxBytes) rotateReport()
      appendFileSync(reportFile, line, 'utf8')
    } catch {
      return
    }
    reportBytes += bytes
    if (advertised) return
    advertised = true
    try {
      ctx.logger?.info?.(`[roadbook-autoload] 观测记录 → ${reportFile}`)
    } catch {
      /* 日志同样是旁路 */
    }
  }

  /** 跳过类事件按「会话 + 理由」去重：pre-step 每步都触发，不去重会刷屏。 */
  const reportSkip = (reason, meta, sessionId) => {
    const key = `${sessionId}|${reason}`
    if (reportedSkips.has(key)) return
    remember(reportedSkips, key)
    writeReport({ event: 'skip', reason, session: sessionId, ...meta })
  }

  const reportError = (reason, meta, sessionId) => {
    writeReport({ event: 'error', reason, session: sessionId, ...meta })
  }

  // 就绪回执：观测文件里这一行 =「本行真的跑起来了」的可读证据（面板之外的第二条自证路径）。
  writeReport({ event: 'loaded', fallbacks: hostFallbacks.map((host) => host.specifier) })
  if (hostFallbacks.length > 0) {
    try {
      ctx.logger?.warn?.(
        `[roadbook-autoload] 宿主包解析失败，已改用本地等价实现：${hostFallbacks
          .map((host) => `${host.specifier}（${host.error}）`)
          .join('；')}`,
      )
    } catch {
      /* 日志是旁路 */
    }
  }

  const inGitProject = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return false
    if (gitRoots.has(cwd)) return gitRoots.get(cwd)
    const homeKey = normalizePath(home)
    let found = false
    let dir = cwd
    for (;;) {
      // 家目录自身常被初始化成 git 仓库（dotfiles）——它不算项目根，也不越过它继续向上找：
      // 否则家目录/临时目录里一个无关的 .git 会让「项目内」判定整体失效。
      if (normalizePath(dir) === homeKey) break
      if (existsSync(join(dir, '.git'))) {
        found = true
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    remember(gitRoots, cwd, found)
    return found
  }

  /**
   * SKILL.md 内容指纹（sha256 前 8 位；读不到返回 ''），用于自进化 B 环对账。
   * 缓存键带文件 stat 指纹（mtimeMs + size）：只按路径缓存的话，技能中途更新（git pull / 手改卡片）
   * 之后对账永远看不到变化 —— B 环就空转了。
   * 取证拿不到 stat（文件不存在、权限不足）时**不缓存**，直接读：这样「先缺后补」的 SKILL.md
   * 下一次调用还会重新取证，不会被记成永久的 ''。
   */
  const digestOf = (skill) => {
    const base = skill?.resourceBase
    if (base?.kind !== 'directory' || typeof base.path !== 'string') return ''
    const file = join(base.path, 'SKILL.md')
    let stat
    try {
      stat = statSync(file)
    } catch {
      try {
        return shortDigest(readFileSync(file, 'utf8'))
      } catch {
        return ''
      }
    }
    const cached = digests.get(file)
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.digest
    let digest = ''
    try {
      digest = shortDigest(readFileSync(file, 'utf8'))
    } catch {
      digest = ''
    }
    remember(digests, file, { mtimeMs: stat.mtimeMs, size: stat.size, digest })
    return digest
  }

  /**
   * 自进化 C 环：注入了流程正文，此后一路没读过卡 = 疑似空转（只观测，绝不改行为、绝不注入）。
   *
   * 为什么以前"暂不做"而现在能做：设计文档当年写的理由是「避免为观测再加钩子」——
   * 但 `agent/pre-step` 本来就挂着（注入走的就是它），会话日志本来就读得到
   * （`alreadyInjected` 已经在读），这一环缺的只是一个判据，零新增接线。
   *
   * 判据交 `cardReadState()`：只看最后一次同名注入**之后**的事件，注入正文自己写着的
   * `playbook_EN/` 不会被算成"读过"。读不到日志或超出扫描窗口都返回 `unknown`，不猜。
   * `report: false` 时整个观察不做（省钱，也与「观测开关」的语义一致）。
   */
  const observeIdle = (session, sessionId) => {
    if (!reportEnabled || sessionId.length === 0 || idleSkillName.length === 0) return
    const state = idleWatch.get(sessionId)
    if (state === undefined || state.settled) return
    state.steps += 1
    if (state.steps < IDLE_CHECK_STEPS) return
    const verdict = cardReadState(session, idleSkillName)
    if (verdict === 'unknown') return // 判不了就下一步再问，绝不写一条猜出来的读数
    state.settled = true
    writeReport({
      event: verdict === 'read' ? 'card-read' : 'idle',
      session: sessionId,
      skill: idleSkillName,
      steps: state.steps,
    })
  }

  /**
   * 常驻微提示：补掉「关键词没命中 = 整轮不受流程约束」的洞（命中率只有五到八成）。
   *
   * 注册的是 system prompt section，不是注入 user message：它在每个组装点都贡献内容，
   * 因此不占对话历史、不会被上下文压缩 shadow，也不受 oncePerSession 影响。
   *
   * systemPrompt 必须走**可选服务**：不能写进 `export const inject` —— 那里少一个服务，
   * cordis 会把整行插件判成「未运行」（原因同顶部宿主包注释：症状会指向「没装」而不是「缺服务」）。
   * 这里读不到服务只让本段不出现，整行插件照常工作。
   */

  /** 要注册的那一段（两条接线路径共用同一份文案与 order）。 */
  const bannerSection = () => ({
    name: 'roadbook',
    // 700 的依据：DSH 的 SECTION_ORDERS 里 PLAN_POLICY = 500、TEAM_POLICY = 600、PTC_ONLY = 800，
    // 700 正好落在策略段之间 —— 流程提示要排在三条策略之后、工具段（1000 起）之前。
    order: 700,
    // 关掉插值：本段是自己写死的中文提示，不含 {{变量}}，也不该被当模板解析（解析失败会抛在组装里）。
    interpolate: false,
    text: (context) => {
      if (config.banner === false || config.mode === 'off') return ''
      // 读不到 cwd 就不显示（与本插件「读不到就不猜」口径一致）：宁可少一段，也不给错坐标。
      const cwd = context?.agent?.session?.header?.cwd
      if (typeof cwd !== 'string' || cwd.length === 0) return ''
      if (config.requireGitRoot && !inGitProject(cwd)) return ''
      return BANNER_TEXT
    },
  })

  /**
   * 把 section 挂到服务上，disposer 交给**当前作用域**的 effect 保管。
   * 服务返回的 disposer 只在自己作用域里有效：包进 effect 才会随作用域卸载（含插件卸载）一并撤销 ——
   * 不包的话，服务重建一次就在 system prompt 里多留一段，越攒越多。
   */
  const mountBanner = (host, systemPrompt) => {
    const section = bannerSection()
    const attach = () => systemPrompt.section(section)
    if (typeof host?.effect === 'function') {
      host.effect(attach, 'roadbook-autoload: banner')
      return
    }
    attach()
  }

  /** 服务形状不合格（没这个服务 / 还没起来）：只让本段不出现，绝不上抛。 */
  const usableSectionService = (value) =>
    value !== undefined && value !== null && typeof value.section === 'function'

  /** 上面这一段的注册入口：有 inject 就交给作用域重试，没有才退回一次性 ctx.get。 */
  const registerBanner = () => {
    // 首选：作用域注入。一次性 ctx.get 读到 undefined 时，「宿主没有这个服务」与「服务还没起来」
    // 长得一模一样 —— 前者该永久让路，后者只该等一等；读一次就写死 unavailable，微提示会在
    // 服务晚于本插件装配的宿主上永远消失。交给 inject 的作用域 fiber：服务一可用就回调一次，
    // 全程没这个服务就一次都不回调（本插件照常工作，export const inject 也保持 ['agents','skills']）。
    if (typeof ctx.inject === 'function') {
      let settled = false
      try {
        ctx.inject(['systemPrompt'], (scope) => {
          settled = true
          let systemPrompt
          try {
            systemPrompt = scope?.systemPrompt
          } catch (error) {
            writeReport({ event: 'banner', state: 'error', message: errorText(error) })
            return
          }
          if (!usableSectionService(systemPrompt)) {
            // 作用域起来了但这个服务仍不合格：如实记 unavailable，绝不写 registered。
            writeReport({ event: 'banner', state: 'unavailable' })
            return
          }
          try {
            mountBanner(scope, systemPrompt)
            writeReport({ event: 'banner', state: 'registered' })
          } catch (error) {
            writeReport({ event: 'banner', state: 'error', message: errorText(error) })
          }
        })
      } catch (error) {
        writeReport({ event: 'banner', state: 'error', message: errorText(error) })
        return
      }
      // 回调也可能同步就跑完了（服务已经起来）：那就不补这一行，免得读观测的人以为还没注册。
      if (!settled) writeReport({ event: 'banner', state: 'deferred' })
      return
    }

    // 兜底：ctx 上没有 inject（老宿主 / 精简 ctx）时保留原样的一次性 ctx.get —— 读不到就不注册。
    let systemPrompt
    try {
      systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
    } catch (error) {
      writeReport({ event: 'banner', state: 'error', message: errorText(error) })
      return
    }
    if (!usableSectionService(systemPrompt)) {
      writeReport({ event: 'banner', state: 'unavailable' })
      return
    }
    try {
      mountBanner(ctx, systemPrompt)
      writeReport({ event: 'banner', state: 'registered' })
    } catch (error) {
      writeReport({ event: 'banner', state: 'error', message: errorText(error) })
    }
  }

  registerBanner()

  /**
   * 动作闸回执：只记**拦下的**决策 —— 放行是常态，每次都记等于把观测文件变成流水账。
   * 同一会话 + 工具 + 规则只记一行；落盘的是规则 id 与静态说明，**不含命令原文**
   * （命令行里可能有连接串/密钥，而观测文件在共享临时目录、跨会话、永不清理）。
   */
  const reportGate = (verdict, exec, sessionId) => {
    if (verdict.decision === 'allow') return
    const tool = typeof exec?.name === 'string' ? exec.name : ''
    const key = `${sessionId}|${tool}|${verdict.rule}`
    if (reportedGates.has(key)) return
    remember(reportedGates, key)
    writeReport({
      event: 'gate',
      decision: verdict.decision,
      rule: verdict.rule,
      tool,
      note: verdict.note,
      mode: gateMode,
      session: sessionId,
    })
  }

  /**
   * Team 探针：消费 `roadbook-team` 行提供的可选服务 `roadbookTeam`。
   *
   * 为什么不写进 `export const inject`：那里少一个服务，cordis 会把整行插件判成面板上的「未运行」
   * （理由与常驻提示那段完全相同）。取服务同样走**作用域注入**：服务一可用就回调一次；
   * 官方 Agent Team 没挂载 ⇒ 那一行根本不加载 ⇒ 回调一次都不跑 ⇒ 本插件照常按单线程工作。
   *
   * 这一层的结论**只用于回执与降级说明**：门在装配层（`disabled: !!js "!ctx.get('agentTeams')"`），
   * 本插件不做「允不允许」的判断，只回答「本轮到底怎么跑」。唯一的例外见 gate.js 的 team-off 分支
   * （那是「装了不用」这条**用户显式策略**的机械落点，不是自建开关）。
   */
  const teamVerdict = { ...resolveTeamPolicy({}) }

  const settleTeam = (service) => {
    Object.assign(teamVerdict, resolveTeamPolicy({ service }))
    writeReport({
      event: 'team',
      state: teamVerdict.state,
      active: teamVerdict.active,
      blocked: teamVerdict.blocked,
      note: teamVerdict.note,
    })
    try {
      if (teamVerdict.active) ctx.logger?.info?.(`[roadbook-autoload] ${teamVerdict.note}`)
      else ctx.logger?.warn?.(`[roadbook-autoload] ${teamVerdict.note}`)
    } catch {
      /* 日志是旁路 */
    }
  }

  const registerTeamProbe = () => {
    if (typeof ctx.inject === 'function') {
      let settled = false
      try {
        ctx.inject(['roadbookTeam'], (scope) => {
          settled = true
          let service
          try {
            service = scope?.roadbookTeam
          } catch (error) {
            writeReport({ event: 'team', state: 'error', message: errorText(error) })
            return
          }
          settleTeam(service)
        })
      } catch (error) {
        writeReport({ event: 'team', state: 'error', message: errorText(error) })
        return
      }
      // 回调也可能同步就跑完了（这一行已经挂载）：那就不补这一行，免得读观测的人以为还没结论。
      if (!settled) {
        writeReport({
          event: 'team',
          state: 'deferred',
          note: '已交给作用域注入，等 roadbookTeam 服务：一直不来 = roadbook-team 行未挂载，本轮单线程走',
        })
      }
      return
    }

    // 兜底：ctx 上没有 inject（老宿主 / 精简 ctx）时退回一次性 ctx.get —— 读不到就是未挂载。
    let service
    try {
      service = typeof ctx.get === 'function' ? ctx.get('roadbookTeam') : undefined
    } catch (error) {
      writeReport({ event: 'team', state: 'error', message: errorText(error) })
      return
    }
    settleTeam(service)
  }

  registerTeamProbe()

  /**
   * 动作闸接线：`tools/pre-execute` 是瀑布式事件 `(exec, next) => 决策`。
   * 三条纪律：
   *   ① 先 `next()`，且**不覆盖**下游已有的 deny/ask（别人已经拦下的原样返回）——
   *      自己不 owning 决策时返回 next() 是本仓与 DSH 文档的共同口径；
   *   ② 只回 `deny` 或放行：`allow` 不预审批、`defer`/`updatedInput` 不生效，不依赖被忽略的能力；
   *   ③ 插件自身出任何意外都不许打断会话：兜底返回下游决策（失败即放行，与注入路径同口径）。
   */
  if (gateMode !== 'off') {
    ctx.on('tools/pre-execute', async (exec, next) => {
      let downstream
      try {
        downstream = await next()
      } catch (error) {
        reportError('gate-next', { message: errorText(error) }, '')
        throw error
      }
      try {
        const session = exec?.agent?.session
        const verdict = decideGate({
          tool: exec?.name,
          args: exec?.arguments,
          session,
          skill: idleSkillName,
          // requireGitRoot 关掉时那道门就不存在（与注入路径同一口径），不该当成「不在项目里」。
          inProject: config.requireGitRoot === false ? true : inGitProject(session?.header?.cwd),
          team: teamVerdict,
          intentConfig: config,
        })
        const sessionId = typeof session?.header?.id === 'string' ? session.header.id : ''
        reportGate(verdict, exec, sessionId)
        if (verdict.decision === 'allow') return downstream
        if (downstream?.kind !== 'allow') return downstream
        if (gateMode === 'warn') {
          try {
            ctx.logger?.warn?.(`[roadbook-autoload] 动作闸（warn 档：只回执不拦）：${verdict.note}`)
          } catch {
            /* 日志是旁路 */
          }
          return downstream
        }
        return { kind: 'deny', reason: verdict.reason }
      } catch (error) {
        reportError('gate', { message: errorText(error) }, '')
        return downstream
      }
    })
  }

  /**
   * B10：STATE.md 缺必填字段 = 下一轮从错的地方开始。
   * 只在「文件在、但缺键」或「读不动」时落观测 —— 没有 STATE.md 的 git 项目是常态
   * （本插件不只服务 RoadBook 项目），不刷观测。字段口径见 ./state.js（逐字取自 template/STATE.md）。
   */
  const stateFileFor = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return ''
    if (stateFiles.has(cwd)) return stateFiles.get(cwd)
    const homeKey = normalizePath(home)
    let found = ''
    let dir = cwd
    for (;;) {
      // 与 inGitProject 同一口径：家目录自身不算项目根，也不越过家目录继续向上找。
      if (normalizePath(dir) === homeKey) break
      const candidate = join(dir, 'STATE.md')
      if (existsSync(candidate)) {
        found = candidate
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    remember(stateFiles, cwd, found)
    return found
  }

  const checkState = (cwd, sessionId) => {
    if (config.stateCheck === false) return
    const file = stateFileFor(cwd)
    if (file.length === 0) return
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      reportSkip('state-unreadable', { file, message: errorText(error) }, sessionId)
      return
    }
    const { missing } = parseState(text)
    if (missing.length === 0) return
    reportSkip('state-missing', { file, missing, missingCount: missing.length }, sessionId)
    try {
      ctx.logger?.warn?.(
        `[roadbook-autoload] STATE.md 缺必填字段：${missing.join(' / ')}（B10；字段口径见 template/STATE.md）`,
      )
    } catch {
      /* 日志是旁路 */
    }
  }

  const handle = async ({ agent, messages, signal } = {}, decision, sessionId) => {
    if (decision?.kind === 'reject') {
      reportSkip('rejected', {}, sessionId)
      return decision
    }
    if (config.mode === 'off') {
      reportSkip('mode-off', { mode: config.mode }, sessionId)
      return decision
    }

    const session = agent?.session
    const header = session?.header
    if (header === undefined || header === null) {
      reportSkip('no-header', {}, sessionId)
      return decision
    }
    if (!config.includeSubagents && isSubagentHeader(header)) {
      reportSkip('subagent', { cwd: header.cwd }, sessionId)
      return decision
    }
    // 自进化 C 环：本会话若注入过，就顺路看一眼「到底有没有读卡」（只观测，不影响任何决策）
    observeIdle(session, sessionId)
    // 压缩把之前注入的消息 shadow 出可见面之后，oncePerSession 不许再拦：拦了会话后半程就没有流程卡。
    // 判据问「模型还能不能看到」，不问「历史上有没有注入过」；只有读不到可见面时才退回旧的保守行为。
    const surface = surfaceInjectionState(session, config.skills)
    if (config.oncePerSession && surface === 'unavailable' && sessionId.length > 0 && injectedSessions.has(sessionId)) {
      reportSkip('once-per-session', { cwd: header.cwd, surface }, sessionId)
      return decision
    }

    const text = pickUserText(messages)
    if (text === undefined) {
      reportSkip('no-user-text', {}, sessionId)
      return decision
    }
    const hit = matchIntent(text, config)
    if (hit === undefined) {
      // 只记指纹与长度，不记原文：观测文件在共享临时目录、跨会话、永不清理，落原话等于把用户消息写在公共位置。
      reportSkip('no-hit', { textDigest: shortDigest(text), textLength: text.length }, sessionId)
      return decision
    }
    if (config.requireGitRoot && !inGitProject(header.cwd)) {
      reportSkip('not-git', { cwd: header.cwd }, sessionId)
      return decision
    }
    // B10：开发会话顺路核一次 STATE.md 必填字段（只观测与告警，绝不改行为、绝不注入）
    checkState(header.cwd, sessionId)

    const names = Array.isArray(config.skills) ? config.skills : []
    if (names.length === 0) {
      reportSkip('no-skill', { cwd: header.cwd, attempted: 0, mode: config.mode }, sessionId)
      return decision
    }
    if (hasGesture(text, names)) {
      reportSkip(
        'manual-gesture',
        { cwd: header.cwd, textDigest: shortDigest(text), textLength: text.length },
        sessionId,
      )
      return decision
    }

    let resolved = false
    let failed = false
    for (const skillName of names) {
      let skill
      try {
        skill = await ctx.skills.get(skillName, { cwd: header.cwd, signal, scope: agent })
      } catch (error) {
        failed = true
        reportError('skills.get', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }
      signal?.throwIfAborted?.()
      if (skill === undefined || skill === null || !isUserInvocable(skill)) continue
      resolved = true

      const skillSurface = surfaceInjectionState(session, skillName)
      const via = []
      if (hasInjectedMessage(decision.messages, skillName)) via.push('decision-messages')
      if (hasInjectedMessage(messages, skillName)) via.push('turn-messages')
      if (skillSurface === 'present') via.push('session-surface')
      // 日志兜底只在读不到可见面时生效：可见面已经说「被 shadow 掉了」时，日志里那条不算数。
      if (skillSurface === 'unavailable' && alreadyInjected(session, skillName)) via.push('session-log')
      if (via.length > 0) {
        if (sessionId.length > 0) remember(injectedSessions, sessionId)
        reportSkip('already-injected', { cwd: header.cwd, skill: skillName, via, surface: skillSurface }, sessionId)
        return decision
      }

      const digest = digestOf(skill)
      let rendered
      try {
        rendered = renderSkillContent(skill)
      } catch (error) {
        // 渲染失败只跳过这个技能：不注入，也不打断会话。
        failed = true
        reportError('render', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }

      const content = [{ type: 'text', text: rendered }]
      if (config.note) {
        const note = buildNote({ skillName, hit, digest, expectedDigest: config.skillDigest })
        if (note.length > 0) content.push({ type: 'text', text: note })
      }

      let message
      try {
        message = createUserMessage({
          content,
          source: { kind: 'skill-invocation', name: skillName, form: 'instructions' },
        })
      } catch (error) {
        failed = true
        reportError('create-message', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }

      // 第二次及以后还能走到注入，只该有一种理由：上一次注入已不在可见面上（被压缩 shadow 掉）。
      const reinjected = skillSurface === 'absent' && sessionId.length > 0 && injectedSessions.has(sessionId)
      if (sessionId.length > 0) {
        remember(injectedSessions, sessionId)
        // 起一个空转观察：从这一步开始数，看后面有没有真的读卡
        remember(idleWatch, sessionId, { steps: 0, settled: false })
      }
      writeReport({
        event: 'inject',
        reason: reinjected ? 'reinject-shadowed' : 'first',
        surface: skillSurface,
        session: sessionId,
        cwd: header.cwd,
        skill: skillName,
        hit,
        digest,
        drift:
          typeof config.skillDigest === 'string' && config.skillDigest.length > 0 && config.skillDigest !== digest,
        note: config.note !== false,
        // 同上：观测里只留用户文本的指纹与长度，原文不出本进程。
        textDigest: shortDigest(text),
        textLength: text.length,
      })
      try {
        ctx.logger?.info?.(
          `[roadbook-autoload] 命中「${hit}」→ 已${reinjected ? '（压缩后）重新' : ''}加载 ${skillName}（会话 ${sessionId || '未知'}）`,
        )
      } catch {
        /* 日志是旁路 */
      }
      return {
        ...decision,
        messages: [...(decision.messages ?? []), message],
      }
    }

    // 已经记过 error 的，不再补一条会误导的 no-skill。
    if (!resolved && !failed) reportSkip('no-skill', { cwd: header.cwd, attempted: names.length, mode: config.mode }, sessionId)
    return decision
  }

  ctx.on('agent/pre-step', async (event, next) => {
    const sessionId = sessionIdOf(event)
    let decision
    try {
      decision = await next()
    } catch (error) {
      reportError('next', { message: errorText(error) }, sessionId)
      throw error
    }
    try {
      return await handle(event ?? {}, decision, sessionId)
    } catch (error) {
      // 兜底：插件自身的任何意外都不许打断会话（失败即不注入）。
      reportError('handler', { message: errorText(error) }, sessionId)
      return decision
    }
  })
}

function sessionIdOf(event) {
  const id = event?.agent?.session?.header?.id
  return typeof id === 'string' ? id : ''
}

function errorText(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return text.slice(0, 200)
}

/** 路径比较用：统一分隔符、去尾部斜杠、忽略大小写（Windows 盘符与 `/` 混用）。 */
function normalizePath(value) {
  return String(value ?? '')
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}
