/**
 * 插件运行时底座 —— 常驻集合 / 观测落盘 / 会话侧探针（D14 拆分自 index.js，批 6 收尾，TD-008）。
 *
 * 为什么单独一层：这三块都是**有状态设施**，与宿主接线无关，却原来和 `apply()` 挤在一个闭包里。
 * 拆文件最容易犯的错就是「搬了声明、没搬闭包」（本仓 `docs/lessons/` 的「测量载体脱钩」同族，
 * TD-008 记了两次因它撤回的拆分）—— 所以这里把闭包**整体搬进工厂函数**，由调用方只传参数：
 * 每一片都能被单独读、单独测，且不存在「声明在新文件、状态还在旧闭包」的中间态。
 *
 * 口径（与拆分前逐字一致，改这里就是改行为）：
 *   - 观测是旁路：任何失败只吞自己，绝不打断会话；超字节上限轮转到 `<file>.1`；
 *     只记用户文本的指纹与长度，不记原文（共享临时目录、跨会话、永不清理）。
 *   - 常驻集合一律走 remember() 的有界 FIFO：长驻宿主内存不许只增不减。
 *   - 家目录不算项目根，也不越过它继续向上找（dotfiles 仓库到处都是）。
 */
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseState } from './state.js'
import { cardReadState, shortDigest } from './trigger.js'

/** 观测文件缺省名（放在 os.tmpdir() 下，任何系统都可写）。 */
export const DEFAULT_REPORT_FILE = 'roadbook-autoload.jsonl'

/** 观测文件缺省字节上限（2 MiB）：文件在共享临时目录里、跨会话、永不清理，不轮转就是慢性泄漏。 */
export const DEFAULT_REPORT_MAX_BYTES = 2097152

/** 常驻集合的 FIFO 上限：一次会话/跳过/项目根各一条，不设上限就是常驻宿主内存的慢性泄漏。 */
export const MAX_REMEMBERED = 512

/**
 * 空转观测（自进化 C 环）的观察门槛：注入之后至少再走这么多步才判。
 * 太小会把「刚注入、还没轮到读卡」误报成空转；太大则长会话迟迟得不到读数。
 */
export const IDLE_CHECK_STEPS = 4

/**
 * 有界 FIFO 记忆：命中过的仍在（读取方先 has 再取值），超上限时淘汰最早写入的那条。
 * 覆盖写入会把该键挪到队尾 —— 刚验证过的项目根/刚记过的跳过理由最不该先掉。
 * Set 与 Map 通用：Set 走 add、Map 走 set，两者都有 has / delete / keys。
 */
export function remember(store, key, value = true) {
  if (store.has(key)) store.delete(key)
  if (typeof store.set === 'function') store.set(key, value)
  else store.add(key)
  if (store.size > MAX_REMEMBERED) store.delete(store.keys().next().value)
  return value
}

/** 报错原文：截断到 200 字符（观测文件要能一眼看完，超长堆栈留给宿主日志）。 */
export function errorText(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return text.slice(0, 200)
}

/** 路径比较用：统一分隔符、去尾部斜杠、忽略大小写（Windows 盘符与 `/` 混用）。 */
export function normalizePath(value) {
  return String(value ?? '')
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}

/** 会话 id（读不到给空串：调用方一律按「空串 = 未知会话」处理，不猜）。 */
export function sessionIdOf(event) {
  const id = event?.agent?.session?.header?.id
  return typeof id === 'string' ? id : ''
}

/** 观察对象：配置里的第一个技能名（与真正会注入的那个一致）。 */
export function primarySkillName(config) {
  return Array.isArray(config?.skills) && typeof config.skills[0] === 'string' ? config.skills[0] : ''
}

/** 动作闸档位：非法取值按最严的 deny 处理（配置写错不许静默变成「不设防」）。 */
export function gateModeOf(config) {
  return config?.gate === 'off' || config?.gate === 'warn' ? config.gate : 'deny'
}

/**
 * 观测写入器：轮转 / 去重 / 就绪回执都在这里。
 *
 * 依赖注入的是 `ctx`（只为 logger）与配置原文；所有状态（已写字节、去重表）留在本工厂的闭包里。
 */
export function createReporter({ ctx, config, reportEnabled, reportFile, reportMaxBytes, gateMode }) {
  const reportedSkips = new Set()
  /** 动作闸的拦下回执去重表：会话 + 工具 + 规则（同一会话反复撞同一条规则只记一行，不刷屏）。 */
  const reportedGates = new Set()
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

  return { writeReport, reportSkip, reportError, reportGate }
}

/**
 * 会话侧探针：项目根 / STATE.md / SKILL.md 指纹 / 空转观测 / 注入去重。
 *
 * 每个探针都有自己的缓存集合（原先散在 `apply()` 闭包里），这里收进来一起走 remember() 的有界 FIFO。
 * 对外只暴露方法，不暴露集合 —— 调用方拿不到集合就不会绕过 remember() 把内存写爆。
 */
export function createProbes({ ctx, config, home, reporter, idleSkillName, reportEnabled }) {
  const injectedSessions = new Set()
  const gitRoots = new Map()
  const digests = new Map()
  /** 项目 STATE.md 的位置缓存：cwd → 文件路径（'' = 一路找到家目录都没有）。 */
  const stateFiles = new Map()
  /** 空转观测的观察簿：sessionId → { steps, settled }（同样走 remember 的有界 FIFO）。 */
  const idleWatch = new Map()
  const { writeReport, reportSkip, reportError } = reporter
  const homeKey = normalizePath(home)

  const inGitProject = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return false
    if (gitRoots.has(cwd)) return gitRoots.get(cwd)
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
   * B10：STATE.md 缺必填字段 = 下一轮从错的地方开始。
   * 只在「文件在、但缺键」或「读不动」时落观测 —— 没有 STATE.md 的 git 项目是常态
   * （本插件不只服务 RoadBook 项目），不刷观测。字段口径见 ./state.js（逐字取自 template/STATE.md）。
   */
  const stateFileFor = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return ''
    if (stateFiles.has(cwd)) return stateFiles.get(cwd)
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

  return {
    inGitProject,
    digestOf,
    observeIdle,
    stateFileFor,
    checkState,
    wasInjected: (sessionId) => injectedSessions.has(sessionId),
    markInjected: (sessionId) => {
      if (sessionId.length > 0) remember(injectedSessions, sessionId)
    },
    startIdleWatch: (sessionId) => {
      if (sessionId.length > 0) remember(idleWatch, sessionId, { steps: 0, settled: false })
    },
  }
}

/**
 * 组装一次 `apply()` 需要的全部运行时设施（观测 + 探针 + 归一后的配置）。
 *
 * 归一放在这里而不是各调用点：`apply()` 与 `_qc/check.ps1` 都要看同一份口径，
 * 三处各写一遍就是三处真相（D12 信息阶梯）。
 */
export function createRuntime(ctx, config = {}, runtime = {}) {
  const home = typeof runtime?.home === 'string' && runtime.home.length > 0 ? runtime.home : homedir()
  const reportEnabled = config?.report !== false
  const gateMode = gateModeOf(config)
  const idleSkillName = primarySkillName(config)
  const reportFile =
    typeof config?.reportPath === 'string' && config.reportPath.trim().length > 0
      ? config.reportPath.trim()
      : join(tmpdir(), DEFAULT_REPORT_FILE)
  const reportMaxBytes =
    typeof config?.reportMaxBytes === 'number' && Number.isFinite(config.reportMaxBytes) && config.reportMaxBytes > 0
      ? config.reportMaxBytes
      : DEFAULT_REPORT_MAX_BYTES
  const reporter = createReporter({ ctx, config, reportEnabled, reportFile, reportMaxBytes, gateMode })
  const probes = createProbes({ ctx, config, home, reporter, idleSkillName, reportEnabled })
  return { ctx, config, home, gateMode, idleSkillName, reportEnabled, reportFile, reporter, probes }
}
