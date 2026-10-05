/**
 * index.js（Host 侧接线）的离线测试：用假 ctx / 假 skill 驱动 agent/pre-step 注入路径。
 *
 * 宿主包（@deepseek-ai/dsh-llm / dsh-skill / schemastery）由 test/dsh-stubs/ 的 loader 钩子顶替，
 * 见 hooks.mjs 的说明。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { shortDigest } from '../trigger.js'

register('./dsh-stubs/hooks.mjs', import.meta.url)

const { Config, apply, inject, name } = await import('../index.js')

const TMP = mkdtempSync(join(tmpdir(), 'roadbook-autoload-test-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

const skill = (over = {}) => ({ name: 'roadbook', userInvocable: true, __content: 'ROADBOOK_BODY', ...over })
const user = (text) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const next = async () => ({ kind: 'continue', messages: [] })

/** 观测文件里的**全部**记录（含就绪回执与常驻提示注册回执，两者不是会话事件）。 */
const readAll = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line))
    : []

/**
 * 读观测文件里的**会话事件**。
 * `apply()` 会先写一行就绪回执（`event: 'loaded'`，面板之外的「本行真的跑起来了」自证），
 * 再写一行常驻提示注册回执（`event: 'banner'`）；两者都不是会话事件，
 * 分别由「就绪回执」与 banner.test.mjs 断言。
 */
const readReport = (file) => readAll(file).filter((entry) => entry.event !== 'loaded' && entry.event !== 'banner')

/** 观测文件里常驻提示（banner）的注册回执。 */
const bannerLines = (file) => readAll(file).filter((entry) => entry.event === 'banner')

/** 假 ctx：只实现插件真正用到的 on / skills.get / logger。 */
const setup = ({ skills = {}, skillsGet, config = {}, home, logger } = {}) => {
  const handlers = new Map()
  const ctx = {
    on: (event, handler) => handlers.set(event, handler),
    skills: { get: skillsGet ?? (async (skillName) => skills[skillName]) },
    logger,
  }
  apply(
    ctx,
    {
      skills: ['roadbook'],
      mode: 'keyword',
      requireGitRoot: false,
      includeSubagents: false,
      oncePerSession: true,
      note: true,
      report: true,
      reportPath: '',
      skillDigest: '',
      ...config,
    },
    { home },
  )
  const handler = handlers.get('agent/pre-step')
  assert.equal(typeof handler, 'function', 'apply 必须注册 agent/pre-step')
  return handler
}

const step = (handler, { text = '帮我重构登录模块', id = 'session-test', cwd = TMP, header = {}, decide = next, session } = {}) =>
  handler(
    {
      agent: { session: session ?? { header: { id, cwd, ...header } } },
      messages: [user(text)],
      signal: { throwIfAborted: () => {} },
    },
    decide,
  )

/**
 * 造一个带「模型可见面」的假会话：messages = 当前还看得见的消息来源（压缩后变短）。
 * 这就是真实 Session 的面：`get surface()` 给 SurfaceManager（有 nodes），`eventAt(seq)` 取事件。
 */
const visibleSession = ({ id = 'session-surface', cwd = TMP, messages = [] } = {}) => {
  const events = messages.map((source) => ({ type: 'user/message', data: { source } }))
  return { header: { id, cwd }, surface: { nodes: events.map((_, index) => index) }, eventAt: (seq) => events[seq] }
}

/**
 * 带**私有事件日志**的真实形状会话：日志只能经 snapshotEvents() 读（宿主自己的会话控制器也这么读），
 * **没有 `events` 属性** —— 用 `{ events }` 造假会把「真实会话读不到日志」的分支测成绿的。
 */
const loggedSession = ({ id = 'session-log', cwd = TMP, events = [] } = {}) => ({
  header: { id, cwd },
  snapshotEvents: () => Object.freeze(events),
})

const invocation = { kind: 'skill-invocation', name: 'roadbook' }

test('模块形状：name / inject / Config', () => {
  assert.equal(name, 'roadbook-autoload')
  assert.deepEqual(inject, ['agents', 'skills'])
  assert.ok(Config, 'Config 必须导出')
})

// 常驻微提示的接线在 banner.test.mjs（那里的假 ctx 有 get / effect）；但那个 ctx **没有 inject**，
// 走不到「服务还没起来就等作用域」的路径 —— 这条补上，且钉死 export const inject 不被这一段带偏。
test('常驻提示：宿主有 inject 时经作用域重试注册，服务晚到不再等于「没有这个服务」', () => {
  const file = join(TMP, 'banner-retry.jsonl')
  const sections = []
  const pending = []
  const disposers = []
  const ctx = {
    on: () => {},
    skills: { get: async () => undefined },
    logger: {},
    // 服务「还没起来」：ctx.get 只认已激活的实现，读到的是 undefined（真实宿主里这是常态）。
    get: () => undefined,
    inject: (deps, callback) => {
      assert.deepEqual(deps, ['systemPrompt'], '只按需注入 systemPrompt')
      pending.push(() =>
        callback({
          systemPrompt: {
            section: (section) => {
              sections.push(section)
              return () => {}
            },
          },
          // 作用域上的 effect：section 的 disposer 要挂到作用域，作用域卸载/重建时一并撤销。
          effect: (execute) => {
            const disposer = execute()
            disposers.push(disposer)
            return disposer
          },
        }),
      )
      return { dispose: () => {} }
    },
  }
  apply(ctx, { requireGitRoot: false, report: true, reportPath: file }, { home: TMP })

  assert.deepEqual(sections, [], '服务还没起来：先不注册')
  const waiting = bannerLines(file)
  assert.equal(waiting.length, 1, '等作用域时只记一行')
  assert.equal(waiting[0].state, 'deferred', '不许谎报 registered')

  for (const run of pending) run() // 服务起来了：作用域回调跑一次
  assert.equal(sections.length, 1, '服务起来就注册上')
  assert.equal(sections[0].name, 'roadbook')
  assert.equal(sections[0].order, 700)
  assert.equal(typeof disposers[0], 'function', 'section 的 disposer 必须交给作用域保管')
  const done = bannerLines(file)
  assert.equal(done.length, 2, '先 deferred 后 registered，各一行')
  assert.equal(done.at(-1).state, 'registered', '真注册了才写 registered')
  assert.deepEqual(inject, ['agents', 'skills'], 'systemPrompt 不许进 inject 数组：缺服务会把整行打成「未运行」')
})

test('常驻提示：作用域回调同步跑完时不再补 deferred；注册抛错只记 error、不上抛', () => {
  const file = join(TMP, 'banner-immediate.jsonl')
  const sections = []
  const syncCtx = {
    on: () => {},
    skills: { get: async () => undefined },
    logger: {},
    inject: (deps, callback) => {
      callback({
        systemPrompt: {
          section: (section) => {
            sections.push(section)
            return () => {}
          },
        },
        effect: (execute) => execute(),
      })
      return {}
    },
  }
  apply(syncCtx, { requireGitRoot: false, report: true, reportPath: file }, { home: TMP })
  assert.equal(sections.length, 1)
  assert.deepEqual(
    bannerLines(file).map((line) => line.state),
    ['registered'],
    '同步注册成功时不许再补一行 deferred',
  )

  const badFile = join(TMP, 'banner-inject-error.jsonl')
  const badCtx = {
    on: () => {},
    skills: { get: async () => undefined },
    logger: {},
    inject: (deps, callback) => {
      callback({
        systemPrompt: {
          section: () => {
            throw new Error('systemPrompt rejected the section')
          },
        },
        effect: (execute) => execute(),
      })
      return {}
    },
  }
  apply(badCtx, { requireGitRoot: false, report: true, reportPath: badFile }, { home: TMP })
  const lines = bannerLines(badFile)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].state, 'error')
  assert.match(lines[0].message, /systemPrompt rejected the section/)
})

test('就绪回执：apply() 往观测文件写一行 loaded（面板之外的自证）', () => {
  const file = join(TMP, 'loaded.jsonl')
  setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const [first] = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line))
  assert.equal(first.event, 'loaded')
  assert.deepEqual(first.fallbacks, [], '宿主包在桩环境里可解析 ⇒ 不该走兜底')
})

test('命中关键词：注入 skill-invocation 并记一行 inject', async () => {
  const file = join(TMP, 'hit.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const kept = { source: { kind: 'agent-instructions' } }
  const decision = { kind: 'continue', messages: [kept] }
  const result = await step(handler, { decide: async () => decision })

  assert.notEqual(result, decision, '命中时必须返回新的决策')
  assert.equal(result.messages.length, 2, '原有决策消息要保留')
  assert.equal(result.messages[0], kept)
  const message = result.messages[1]
  assert.equal(message.source.kind, 'skill-invocation')
  assert.equal(message.source.name, 'roadbook')
  assert.equal(message.source.form, 'instructions')
  assert.equal(message.content[0].text, 'ROADBOOK_BODY')
  assert.match(message.content[1].text, /命中「重构」/)

  const lines = readReport(file)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].event, 'inject')
  assert.equal(lines[0].session, 'session-test')
  assert.equal(lines[0].skill, 'roadbook')
  assert.equal(lines[0].hit, '重构')
  assert.equal(lines[0].note, true)
  assert.equal(lines[0].file, file)
})

test('未命中关键词：不注入，记 skip/no-hit', async () => {
  const file = join(TMP, 'no-hit.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { text: '今天天气怎么样', decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.event, 'skip')
  assert.equal(line.reason, 'no-hit')
})

test('skills 未配置（空数组）：不注入，记 skip/no-skill', async () => {
  const file = join(TMP, 'no-skill.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { skills: [], reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.reason, 'no-skill')
  assert.equal(line.attempted, 0)
})

test('技能解析不到：不注入，记 skip/no-skill', async () => {
  const file = join(TMP, 'unresolved.jsonl')
  const handler = setup({ skills: {}, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.reason, 'no-skill')
  assert.equal(line.attempted, 1)
})

test('渲染失败：不抛异常、不注入，记 error/render', async () => {
  const file = join(TMP, 'render.jsonl')
  const handler = setup({ skills: { roadbook: skill({ __renderThrows: true }) }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.event, 'error')
  assert.equal(line.reason, 'render')
  assert.match(line.message, /renderSkillContent failed/)
})

test('skills.get 抛异常：不抛异常、不注入，记 error/skills.get', async () => {
  const file = join(TMP, 'skills-get.jsonl')
  const handler = setup({
    skillsGet: async () => {
      throw new Error('skills service exploded')
    },
    config: { reportPath: file },
  })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.event, 'error')
  assert.equal(line.reason, 'skills.get')
})

test('reportPath 缺省：默认写 <os.tmpdir()>/roadbook-autoload.jsonl（并且不碰真实 %TEMP%）', async () => {
  // 真实 %TEMP% 里那个文件是 README 教用户查「注入到底发生没有」的诊断入口（跨会话、永不清理）：
  // 测试往里灌假会话会把这条诊断毁掉。所以把临时目录整个指到新建的沙箱，用完在 finally 里换回去。
  const realFile = join(tmpdir(), 'roadbook-autoload.jsonl')
  const realText = () => (existsSync(realFile) ? readFileSync(realFile, 'utf8') : '')
  const fakeLines = (text) => (text.match(/session-default-report/g) ?? []).length
  const realBefore = fakeLines(realText())

  const sandbox = mkdtempSync(join(TMP, 'default-tmpdir-'))
  const previous = { TEMP: process.env.TEMP, TMP: process.env.TMP }
  process.env.TEMP = sandbox
  process.env.TMP = sandbox
  try {
    const file = join(tmpdir(), 'roadbook-autoload.jsonl')
    assert.equal(file, join(sandbox, 'roadbook-autoload.jsonl'), '沙箱生效：os.tmpdir() 已指向新目录')
    assert.equal(existsSync(file), false, '沙箱是新建的：这个文件只可能由本用例写出')

    const handler = setup({ skills: { roadbook: skill() } })
    await step(handler, { id: 'session-default-report' })

    assert.equal(existsSync(file), true, '缺省路径必须落盘：<os.tmpdir()>/roadbook-autoload.jsonl')
    const lines = readReport(file)
    assert.ok(
      lines.some((line) => line.event === 'inject' && line.session === 'session-default-report'),
      '默认观测路径必须落盘 inject 行',
    )
  } finally {
    if (previous.TEMP === undefined) delete process.env.TEMP
    else process.env.TEMP = previous.TEMP
    if (previous.TMP === undefined) delete process.env.TMP
    else process.env.TMP = previous.TMP
  }

  // 只比假会话行数，不比整文件：并发跑着的真实会话可能顺路往真实文件里写 skip 行，那不算本用例的锅。
  assert.equal(fakeLines(realText()), realBefore, '真实 %TEMP% 的观测文件里不许新增本用例的假会话行')
})

test('report: false 时完全不落盘', async () => {
  const file = join(TMP, 'report-off.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { report: false, reportPath: file } })
  await step(handler, { id: 'session-report-off' })
  assert.equal(existsSync(file), false)
})

test('oncePerSession 与子代理会话都不注入', async () => {
  const file = join(TMP, 'gates.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  await step(handler, { id: 'session-once' })
  const second = await step(handler, { id: 'session-once', decide: async () => decision })
  assert.equal(second, decision)

  const sub = await step(handler, { id: 'session-sub', header: { parentSession: 'session-parent' }, decide: async () => decision })
  assert.equal(sub, decision)

  const reasons = readReport(file).map((line) => line.reason)
  assert.ok(reasons.includes('once-per-session'))
  assert.ok(reasons.includes('subagent'))
})

test('mode: off 直接让路', async () => {
  const file = join(TMP, 'mode-off.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { mode: 'off', reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  assert.equal(readReport(file).at(-1).reason, 'mode-off')
})

test('宿主 reject 决策原样返回', async () => {
  const file = join(TMP, 'reject.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'reject', reason: 'blocked-by-host' }
  const result = await step(handler, { decide: async () => decision })

  assert.equal(result, decision)
  assert.equal(readReport(file).at(-1).reason, 'rejected')
})

test('requireGitRoot：项目内注入、项目外让路，家目录自身与家目录之上都不算项目', async () => {
  const project = join(TMP, 'project')
  const plain = join(TMP, 'plain')
  mkdirSync(join(project, '.git'), { recursive: true })
  mkdirSync(plain, { recursive: true })

  const file = join(TMP, 'git.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, home: TMP, config: { requireGitRoot: true, reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  const injected = await step(handler, { id: 'session-git', cwd: project, decide: async () => decision })
  assert.notEqual(injected, decision, '项目内必须注入')

  // 家目录之上不找：本机 %TEMP%\.git 真实存在（祖先误判的活样本），
  // home=TMP 时 plain 的祖先里就有它，仍然必须判成「不在项目里」。
  const skipped = await step(handler, { id: 'session-plain', cwd: plain, decide: async () => decision })
  assert.equal(skipped, decision, '项目外不许注入')
  assert.equal(readReport(file).at(-1).reason, 'not-git')

  // 家目录自身是 git 仓库（dotfiles）时不算项目根，避免误判。
  mkdirSync(join(TMP, '.git'), { recursive: true })
  const homeFile = join(TMP, 'git-home.jsonl')
  const homeHandler = setup({
    skills: { roadbook: skill() },
    home: TMP,
    config: { requireGitRoot: true, reportPath: homeFile },
  })
  const atHome = await step(homeHandler, { id: 'session-home', cwd: TMP, decide: async () => decision })
  assert.equal(atHome, decision)
  assert.equal(readReport(homeFile).at(-1).reason, 'not-git')
})

test('已注入过：记 skip/already-injected，并标注可见面读不到', async () => {
  const file = join(TMP, 'dedupe.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = {
    kind: 'continue',
    messages: [{ source: { kind: 'skill-invocation', name: 'roadbook' } }],
  }
  const result = await step(handler, { id: 'session-dedupe', decide: async () => decision })

  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.reason, 'already-injected')
  assert.deepEqual(line.via, ['decision-messages'])
  assert.equal(line.surface, 'unavailable')
})

test('压缩后重新注入：注入消息不在可见面就再注入，仍在可见面就跳过', async () => {
  const file = join(TMP, 'reinject.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  // 第一次：可见面里没有本技能的注入 → 正常注入。
  const first = await step(handler, { session: visibleSession({ id: 'session-compact' }), decide: async () => decision })
  assert.notEqual(first, decision, '第一次必须注入')
  assert.equal(readReport(file).at(-1).reason, 'first')

  // 压缩把注入消息 shadow 掉了：可见面仍为空 → 必须重注入（oncePerSession 不许拦）。
  const second = await step(handler, { session: visibleSession({ id: 'session-compact' }), decide: async () => decision })
  assert.notEqual(second, decision, '注入消息已出可见面时必须重注入')
  const line = readReport(file).at(-1)
  assert.equal(line.event, 'inject')
  assert.equal(line.reason, 'reinject-shadowed')
  assert.equal(line.surface, 'absent')

  // 注入消息还在可见面：跳过，且理由指向可见面。
  const kept = visibleSession({ id: 'session-compact', messages: [invocation] })
  const third = await step(handler, { session: kept, decide: async () => decision })
  assert.equal(third, decision)
  const skip = readReport(file).at(-1)
  assert.equal(skip.reason, 'already-injected')
  assert.deepEqual(skip.via, ['session-surface'])
  assert.equal(skip.surface, 'present')
})

test('会话日志里有注入记录、可见面已空：仍然重注入（判据是可见面不是历史）', async () => {
  const file = join(TMP, 'log-vs-surface.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const session = visibleSession({ id: 'session-shadow' })
  session.snapshotEvents = () => [{ type: 'user/message', data: { source: invocation } }]

  const result = await step(handler, { session, decide: async () => decision })
  assert.notEqual(result, decision, '日志里那条已被压缩 shadow，不许当成「还在」')
  assert.equal(readReport(file).at(-1).reason, 'first')
})

test('读不到可见面时回退到会话日志去重', async () => {
  const file = join(TMP, 'log-fallback.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const session = loggedSession({
    id: 'session-log',
    events: [{ type: 'user/message', data: { source: invocation } }],
  })

  const result = await step(handler, { session, decide: async () => decision })
  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.reason, 'already-injected')
  assert.deepEqual(line.via, ['session-log'])
  assert.equal(line.surface, 'unavailable')
})

// 兼容兜底：**只有这一条**钉 `{ events: [...] }` 旧形状（真实 Session 没有这个属性，其余用例一律走 snapshotEvents()）。
// 哪天有人顺手删掉这条兼容分支，这条会红着提醒：它是**有意**留的，不是漏改。
test('兼容兜底：旧形状 { events } 仍走会话日志去重', async () => {
  const file = join(TMP, 'log-fallback-legacy.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const session = {
    header: { id: 'session-log-legacy', cwd: TMP },
    events: [{ type: 'user/message', data: { source: invocation } }],
  }

  const result = await step(handler, { session, decide: async () => decision })
  assert.equal(result, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.reason, 'already-injected')
  assert.deepEqual(line.via, ['session-log'])
  assert.equal(line.surface, 'unavailable')
})

test('边界：空文本不注入、超长文本只记指纹与长度（不落原文）、未知 mode 仍按 keyword 走', async () => {
  const file = join(TMP, 'edges.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  const empty = await step(handler, { id: 'session-empty', text: '   ', decide: async () => decision })
  assert.equal(empty, decision)
  assert.equal(readReport(file).at(-1).reason, 'no-user-text')

  const long = `帮我重构${'很长'.repeat(200)}`
  const injected = await step(handler, { id: 'session-long', text: long, decide: async () => decision })
  assert.notEqual(injected, decision)
  const line = readReport(file).at(-1)
  assert.equal(line.event, 'inject')
  assert.equal(line.textDigest, shortDigest(long), '观测里只有用户文本的指纹')
  assert.equal(line.textLength, long.length, '观测里只有用户文本的长度')
  assert.equal('text' in line, false, '任何事件都不许再落用户原话片段')

  const oddMode = setup({
    skills: { roadbook: skill() },
    config: { mode: 'weird', reportPath: join(TMP, 'mode-weird.jsonl') },
  })
  const odd = await step(oddMode, { id: 'session-weird-mode', decide: async () => decision })
  assert.notEqual(odd, decision, '未知 mode 按 keyword 处理，不静默失效')
})

test('同一理由的 skip 每会话只记一次', async () => {
  const file = join(TMP, 'dedupe-skip.jsonl')
  const handler = setup({ skills: {}, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  await step(handler, { id: 'session-repeat', decide: async () => decision })
  await step(handler, { id: 'session-repeat', decide: async () => decision })
  await step(handler, { id: 'session-repeat', decide: async () => decision })

  const skips = readReport(file).filter((line) => line.reason === 'no-skill')
  assert.equal(skips.length, 1)
})

test('指纹缓存随文件变化失效：SKILL.md 中途更新后对账看得见（自进化 B 环不许空转）', async () => {
  const dir = join(TMP, 'digest-skill')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  const first = '第一版卡片：红灯 = 停。'
  writeFileSync(file, first, 'utf8')

  const report = join(TMP, 'digest.jsonl')
  const handler = setup({
    skills: { roadbook: skill({ resourceBase: { kind: 'directory', path: dir } }) },
    config: { reportPath: report, skillDigest: shortDigest(first) },
  })
  const decision = { kind: 'continue', messages: [] }

  await step(handler, { id: 'session-digest-1', decide: async () => decision })
  const before = readReport(report).at(-1)
  assert.equal(before.digest, shortDigest(first))
  assert.equal(before.drift, false, '基线一致时不该报 drift')

  // 同一插件实例、同一进程内改卡：mtimeMs 与 size 都变了 ⇒ 缓存必须失效（只按路径缓存会永远读第一版）。
  const second = '第二版卡片：绿卡要跑 check.ps1 并粘贴真实输出。'
  writeFileSync(file, second, 'utf8')
  assert.notEqual(shortDigest(second), shortDigest(first))

  const result = await step(handler, { id: 'session-digest-2', decide: async () => decision })
  assert.notEqual(result, decision, '技能更新后照常注入')
  const after = readReport(report).at(-1)
  assert.equal(after.digest, shortDigest(second), 'SKILL.md 变了，指纹必须重新取证')
  assert.equal(after.drift, true, '与基线对不上要报 drift')
  assert.match(result.messages.at(-1).content.at(-1).text, /技能内容已更新/, '说明行要提示技能已更新')
})

test('观测只记用户文本的指纹与长度：原文一个字都不落盘', async () => {
  const file = join(TMP, 'privacy.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  const hitText = '帮我重构 PAYLOAD-INJECT-SENTINEL 这个模块'
  await step(handler, { id: 'session-privacy-hit', text: hitText, decide: async () => decision })

  const missText = '今天天气怎么样 PAYLOAD-MISS-SENTINEL'
  await step(handler, { id: 'session-privacy-miss', text: missText, decide: async () => decision })

  const gestureText = '/roadbook PAYLOAD-GESTURE-SENTINEL 开工'
  await step(handler, { id: 'session-privacy-gesture', text: gestureText, decide: async () => decision })

  const raw = readFileSync(file, 'utf8')
  for (const sentinel of ['PAYLOAD-INJECT-SENTINEL', 'PAYLOAD-MISS-SENTINEL', 'PAYLOAD-GESTURE-SENTINEL']) {
    assert.equal(raw.includes(sentinel), false, `观测文件里不许出现用户原话（${sentinel}）`)
  }

  const lines = readReport(file)
  const injectLine = lines.find((line) => line.event === 'inject')
  assert.equal(injectLine.textDigest, shortDigest(hitText))
  assert.equal(injectLine.textLength, hitText.length)

  const noHit = lines.find((line) => line.reason === 'no-hit')
  assert.equal(noHit.textDigest, shortDigest(missText))
  assert.equal(noHit.textLength, missText.length)

  const gesture = lines.find((line) => line.reason === 'manual-gesture')
  assert.equal(gesture.textDigest, shortDigest(gestureText))
  assert.equal(gesture.textLength, gestureText.length)

  assert.ok(lines.every((line) => !('text' in line)), '任何事件都不许再带 text 原文片段')
  assert.equal(injectLine.hit, '重构', '命中词来自插件自己的词表，保留（它不是用户原文）')
})

test('观测文件超上限轮转到 <file>.1：文件不再无限增长，且每行仍是完整 JSON', async () => {
  const file = join(TMP, 'rotate.jsonl')
  const rotated = `${file}.1`
  const handler = setup({ skills: {}, config: { reportPath: file, reportMaxBytes: 600 } })
  const decision = { kind: 'continue', messages: [] }

  for (let index = 0; index < 12; index += 1) {
    await step(handler, { id: `session-rotate-${index}`, decide: async () => decision })
  }

  assert.equal(existsSync(rotated), true, '超过上限必须轮转出 .1（旧行为：同一个文件无限追加）')
  const current = readFileSync(file, 'utf8')
  // 轮转点是「写入前超限」：当前文件最多比上限多出刚写下的那一行。
  assert.ok(Buffer.byteLength(current, 'utf8') < 1200, `当前文件必须被上限钉住，实际 ${Buffer.byteLength(current, 'utf8')} 字节`)

  for (const target of [file, rotated]) {
    for (const line of readFileSync(target, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      JSON.parse(line) // 轮转不许把某一行截断
    }
  }

  // 边界：上限比第一行还小、文件又还不存在 —— 轮转的 rename 注定失败，也必须照常写下去（观测是旁路）。
  const tinyFile = join(TMP, 'rotate-tiny.jsonl')
  const tiny = setup({ skills: {}, config: { reportPath: tinyFile, reportMaxBytes: 10 } })
  await step(tiny, { id: 'session-rotate-tiny', decide: async () => decision })
  assert.equal(readReport(tinyFile).at(-1).reason, 'no-skill', '轮转失败不许吞掉观测，更不许打断会话')
})

test('常驻集合有界（跳过去重表）：超过 512 条后淘汰最早的键，内存不再只增不减', async () => {
  const file = join(TMP, 'fifo-skip.jsonl')
  const handler = setup({ skills: {}, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }
  const countOf = (id) => readReport(file).filter((line) => line.session === id && line.reason === 'no-skill').length

  await step(handler, { id: 'session-fifo-0', decide: async () => decision })
  assert.equal(countOf('session-fifo-0'), 1)

  // 同一理由、不同会话来灌：去重表被推过 512 上限，最早的键必然被淘汰。
  for (let index = 1; index <= 513; index += 1) {
    await step(handler, { id: `session-fifo-${index}`, decide: async () => decision })
  }

  await step(handler, { id: 'session-fifo-0', decide: async () => decision })
  assert.equal(countOf('session-fifo-0'), 2, '最老的键必须已被淘汰；上限之外不许再「只增不减」')
})

test('常驻集合有界（注入会话表）：淘汰后旧会话不再被 oncePerSession 拦住', async () => {
  const file = join(TMP, 'fifo-injected.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file } })
  const decision = { kind: 'continue', messages: [] }

  const first = await step(handler, { id: 'session-fifo-inject-0', decide: async () => decision })
  assert.notEqual(first, decision)
  const again = await step(handler, { id: 'session-fifo-inject-0', decide: async () => decision })
  assert.equal(again, decision, '上限之内：oncePerSession 照旧拦得住')

  for (let index = 1; index <= 513; index += 1) {
    await step(handler, { id: `session-fifo-inject-${index}`, decide: async () => decision })
  }

  const after = await step(handler, { id: 'session-fifo-inject-0', decide: async () => decision })
  assert.notEqual(after, decision, '被 FIFO 淘汰后重新判定：注入会话表不再无限增长')
})

// ── 自进化 C 环：空转观测（接线部分；判据本身在 trigger.test.mjs 里离线钉住） ──
// 「注入了但整轮没读 playbook/*.md」= 疑似空转。只观测：不改行为、不注入、不影响任何决策。

/** 造一个「注入过 + 之后发生了什么」的会话：snapshotEvents() 决定 C 环读到什么。 */
const injectionEvents = (after = []) => [
  { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'roadbook' }, content: [{ type: 'text', text: '任何一轮开始：playbook_EN/0-1-driver-card.md' }] } },
  ...after,
]

test('空转观测：注入后一路没读过卡 → 记一行 idle（门限 4 步，只记一次）', async () => {
  const file = join(TMP, 'idle.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file, requireGitRoot: false } })
  const session = loggedSession({
    id: 'session-idle',
    events: injectionEvents([{ type: 'assistant/message', data: { text: '我先把代码看一遍' } }]),
  })

  await step(handler, { id: 'session-idle', session: loggedSession({ id: 'session-idle' }) })
  for (let index = 0; index < 4; index += 1) await step(handler, { id: 'session-idle', session })

  const watched = readReport(file).filter((line) => line.event === 'idle' || line.event === 'card-read')
  assert.equal(watched.length, 1, '同一会话只记一次读数')
  assert.equal(watched[0].event, 'idle')
  assert.equal(watched[0].steps, 4, '门限步数如实记录')
  assert.equal(watched[0].skill, 'roadbook')
})

test('空转观测：读了卡就记 card-read，不记 idle', async () => {
  const file = join(TMP, 'card-read.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file, requireGitRoot: false } })
  const session = loggedSession({
    id: 'session-read',
    events: injectionEvents([
      { type: 'tool/call', data: { name: 'read', input: { file_path: 'playbook_EN/4-1-batch-coding.md' } } },
    ]),
  })

  await step(handler, { id: 'session-read', session: loggedSession({ id: 'session-read' }) })
  for (let index = 0; index < 4; index += 1) await step(handler, { id: 'session-read', session })

  const watched = readReport(file).filter((line) => line.event === 'idle' || line.event === 'card-read')
  assert.equal(watched.length, 1)
  assert.equal(watched[0].event, 'card-read', '有读卡痕迹就不算空转')
})

test('空转观测：判不了时不写读数（读不到会话日志 = 不猜）', async () => {
  const file = join(TMP, 'idle-unknown.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file, requireGitRoot: false } })
  // 既没有 snapshotEvents() 也没有 events：判据返回 unknown（真实会话读失败时也是这条路径）
  const session = { header: { id: 'session-unknown', cwd: TMP } }

  await step(handler, { id: 'session-unknown', session: loggedSession({ id: 'session-unknown' }) })
  for (let index = 0; index < 6; index += 1) await step(handler, { id: 'session-unknown', session })

  const watched = readReport(file).filter((line) => line.event === 'idle' || line.event === 'card-read')
  assert.deepEqual(watched, [], '判不了就一条都不许写')
})

test('空转观测：report: false 时整个观察不做（观测开关说了算）', async () => {
  const file = join(TMP, 'idle-report-off.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file, report: false, requireGitRoot: false } })
  const session = loggedSession({
    id: 'session-off',
    events: injectionEvents([{ type: 'assistant/message', data: { text: '继续' } }]),
  })

  await step(handler, { id: 'session-off', session: loggedSession({ id: 'session-off' }) })
  for (let index = 0; index < 6; index += 1) await step(handler, { id: 'session-off', session })

  assert.ok(!existsSync(file) || readReport(file).length === 0, 'report: false 时观测文件里不该有会话事件')
})

test('空转观测不改行为：读数出现的那一步，注入与去重判定与之前完全一致', async () => {
  const file = join(TMP, 'idle-no-behaviour.jsonl')
  const handler = setup({ skills: { roadbook: skill() }, config: { reportPath: file, requireGitRoot: false } })
  const session = loggedSession({
    id: 'session-noop',
    events: injectionEvents([{ type: 'assistant/message', data: { text: '继续' } }]),
  })
  const decision = { kind: 'continue', messages: [] }

  const first = await step(handler, { id: 'session-noop', session: loggedSession({ id: 'session-noop' }) })
  assert.equal(first.messages.length, 1, '第一次照常注入')
  const later = []
  for (let index = 0; index < 4; index += 1) later.push(await step(handler, { id: 'session-noop', session, decide: async () => decision }))
  for (const result of later) assert.equal(result, decision, 'C 环只在旁边记账，不改任何决策')
})
