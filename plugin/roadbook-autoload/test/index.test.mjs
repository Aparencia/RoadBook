/**
 * index.js（Host 侧接线）的离线测试：用假 ctx / 假 skill 驱动 agent/pre-step 注入路径。
 *
 * 宿主包（@deepseek-ai/dsh-llm / dsh-skill / schemastery）由 test/dsh-stubs/ 的 loader 钩子顶替，
 * 见 hooks.mjs 的说明。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

register('./dsh-stubs/hooks.mjs', import.meta.url)

const { Config, apply, inject, name } = await import('../index.js')

const TMP = mkdtempSync(join(tmpdir(), 'roadbook-autoload-test-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

const skill = (over = {}) => ({ name: 'roadbook', userInvocable: true, __content: 'ROADBOOK_BODY', ...over })
const user = (text) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const next = async () => ({ kind: 'continue', messages: [] })

const readReport = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line))
    : []

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

const step = (handler, { text = '帮我重构登录模块', id = 'session-test', cwd = TMP, header = {}, decide = next } = {}) =>
  handler(
    {
      agent: { session: { header: { id, cwd, ...header } } },
      messages: [user(text)],
      signal: { throwIfAborted: () => {} },
    },
    decide,
  )

test('模块形状：name / inject / Config', () => {
  assert.equal(name, 'roadbook-autoload')
  assert.deepEqual(inject, ['agents', 'skills'])
  assert.ok(Config, 'Config 必须导出')
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

test('reportPath 缺省：默认写 <os.tmpdir()>/roadbook-autoload.jsonl', async () => {
  const file = join(tmpdir(), 'roadbook-autoload.jsonl')
  const existed = existsSync(file)
  const handler = setup({ skills: { roadbook: skill() } })
  await step(handler, { id: 'session-default-report' })

  const lines = readReport(file)
  assert.ok(
    lines.some((line) => line.event === 'inject' && line.session === 'session-default-report'),
    '默认观测路径必须落盘 inject 行',
  )
  if (!existed) rmSync(file, { force: true })
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

test('已注入过：记 skip/already-injected，会话日志形状未知时标注出来', async () => {
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
  assert.equal(line.sessionLog, 'unknown')
})

test('边界：空文本不注入、超长文本只截 80 字进观测、未知 mode 仍按 keyword 走', async () => {
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
  assert.equal(line.text.length, 80, '观测里的原文摘要必须截断到 80 字')

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
