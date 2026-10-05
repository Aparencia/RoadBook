/**
 * 动作闸判据的离线测试（`gate.js` 不 import 任何 dsh 包，直接 `node --test` 就能跑）。
 *
 * 假会话照真实形状造：事件日志只能经 `snapshotEvents()` 读（`trigger.js` 的 `sessionEvents()`
 * 就是这么读的），`user/message` 事件的 `data` 就是消息本身。
 * 注入事件自带的正文里就写着 `playbook_EN/`，所以「有回执」那条必须靠**注入之后**的读卡痕迹，
 * 不能靠注入正文自己证明自己 —— 这正是 `cardReadState()` 的既有口径，这里只验证接线正确。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandOf, decideGate, isTeamTool, isWriteTool, matchRedline, stripQuoted } from '../gate.js'

const userEvent = (text) => ({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })

const injectionEvent = () => ({
  type: 'user/message',
  data: {
    source: { kind: 'skill-invocation', name: 'roadbook' },
    content: [{ type: 'text', text: '任何一轮开始：playbook_EN/0-1-driver-card.md' }],
  },
})

const readCardEvent = () => ({ type: 'tool/call', data: { name: 'read', input: { file_path: 'playbook/0-1-驱动卡.md' } } })

const session = (events, header = { id: 'session-gate', cwd: 'D:/Code/RoadBook' }) => ({
  header,
  snapshotEvents: () => events,
})

/** 开发意图 + 注入过 + 之后没读卡 = 「未按卡开工」的标准材料。 */
const noReceipt = () => session([userEvent('帮我重构登录模块'), injectionEvent(), { type: 'assistant/message', data: { text: '我这就改' } }])

// ── 写侧闸三条：无回执 → deny / 有回执 → allow / 非开发意图 → allow ──────────

test('gate：开发对话里动写侧工具而没有卡回执 → deny（C7 未按卡开工）', () => {
  for (const tool of ['write', 'edit', 'apply_patch', 'bash', 'pwsh']) {
    const verdict = decideGate({ tool, args: { file_path: 'a.js' }, session: noReceipt() })
    assert.equal(verdict.decision, 'deny', `${tool} 必须被拦下`)
    assert.equal(verdict.rule, 'no-card-receipt')
    assert.match(verdict.reason, /未按卡开工/)
    assert.match(verdict.reason, /先贴卡号与开工回执/, '理由行要写清下一步怎么走，不只是「不行」')
    assert.doesNotMatch(verdict.note, /playbook/, '落观测的静态说明里不许带用户原文')
  }
})

test('gate：本会话读卡之后 → allow（放行是常态，不写观测）', () => {
  const withReceipt = session([userEvent('帮我重构登录模块'), injectionEvent(), readCardEvent()])
  const verdict = decideGate({ tool: 'write', args: { file_path: 'a.js' }, session: withReceipt })
  assert.equal(verdict.decision, 'allow')
  assert.equal(verdict.rule, 'card-read')
})

test('gate：非开发意图 / 用户已声明不走流程 → allow（闲聊与问答不开闸）', () => {
  const chat = session([userEvent('今天天气怎么样'), injectionEvent()])
  assert.equal(decideGate({ tool: 'write', args: {}, session: chat }).rule, 'no-dev-intent')

  // 抑制词是既有的第二道门：用户说「不用流程」= 本轮明确不走流程。
  const optedOut = session([userEvent('帮我重构登录模块，但不用流程，直接改'), injectionEvent()])
  assert.equal(decideGate({ tool: 'write', args: {}, session: optedOut }).rule, 'no-dev-intent')
})

test('gate：只在 git 项目里开闸；子代理会话交给派单管，不在这里拦', () => {
  const project = { inProject: true }
  assert.equal(decideGate({ tool: 'write', args: {}, session: noReceipt(), ...project }).decision, 'deny')
  assert.equal(decideGate({ tool: 'write', args: {}, session: noReceipt(), inProject: false }).rule, 'not-project')

  // 子代理会话（includeSubagents 默认 false ⇒ 那里根本没有注入）：判据若照跑会把队友的每次写入都拦下。
  const sub = session([userEvent('帮我重构登录模块'), injectionEvent()], { id: 'sub', cwd: 'D:/x', parentSession: 'p' })
  assert.equal(decideGate({ tool: 'write', args: {}, session: sub }).rule, 'subagent')

  // 读不到会话日志 / 注入之后还没有事件：判不了就不拦（沿用仓库既有的 unknown 口径）。
  const empty = session([])
  assert.equal(decideGate({ tool: 'write', args: {}, session: empty }).decision, 'allow')
  const justInjected = session([userEvent('帮我重构登录模块'), injectionEvent()])
  assert.equal(decideGate({ tool: 'write', args: {}, session: justInjected }).rule, 'receipt-unknown')
})

test('gate：只拦写侧工具（read / glob / grep / list_agents 一律放行）', () => {
  for (const tool of ['read', 'glob', 'grep', 'list_agents']) {
    const verdict = decideGate({ tool, args: {}, session: noReceipt() })
    assert.equal(verdict.decision, 'allow', `${tool} 不该被写侧闸拦`)
    assert.equal(verdict.rule, 'not-write-tool')
  }
  // 优先级说明（如实钉住，免得读者以为红线只对 shell 生效）：红线判据在写侧判定**之前**，
  // 因为红线管的是「这个动作能不能做」，不取决于它是从哪个工具发出来的。
  assert.equal(decideGate({ tool: 'read', args: { command: 'psql -U postgres -d app' }, session: noReceipt() }).rule, 'redline-A1')
})

// ── A 类红线：命中即拦，与走不走流程无关 ────────────────────────────────

test('gate：红线域命令 → deny（A1 SQL/迁移 · A2 发布部署；打 tag 自 2026-10-05.2 起已移出 A 类）', () => {
  const cases = [
    ['psql -U postgres -d app', 'A1'],
    ['mysql -u root -p', 'A1'],
    ['sqlcmd -S localhost -Q "select 1"', 'A1'],
    ['npm run migrate', 'A1'],
    ['npx prisma migrate dev', 'A1'],
    ['alembic upgrade head', 'A1'],
    ['npm run deploy', 'A2'],
    ['gh release create v1.0.0', 'A2'],
    ['npm publish', 'A2'],
    ['terraform apply -auto-approve', 'A2'],
    ['docker push registry/app:latest', 'A2'],
  ]
  for (const [command, id] of cases) {
    const verdict = decideGate({ tool: 'pwsh', args: { command }, session: noReceipt() })
    assert.equal(verdict.decision, 'deny', `必须拦下：${command}`)
    assert.equal(verdict.rule, `redline-${id}`, `${command} 该落在 ${id}`)
    assert.match(verdict.reason, /红灯/)
  }
})

test('gate：红线与走不走流程无关——闲聊里敲红线命令照样拦（A 类不可委托）', () => {
  const chat = session([userEvent('今天天气怎么样')])
  const verdict = decideGate({ tool: 'bash', args: { command: 'psql -U postgres -d app' }, session: chat })
  assert.equal(verdict.decision, 'deny')
  assert.equal(verdict.rule, 'redline-A1')
})

test('gate：不误伤——提交信息里的 deploy/migrate、只读命令、正文里的 psql 都不拦', () => {
  // 用**有卡回执**的会话来验红线：这样任何 deny 都只可能来自红线规则，写侧闸不会混进来。
  const withReceipt = session([userEvent('帮我重构登录模块'), injectionEvent(), readCardEvent()])
  const ok = [
    'git status',
    'node --test "plugin/roadbook-autoload/test/*.test.mjs"',
    'git commit -m "docs: describe deploy and migrate flow"',
    'pwsh -NoProfile -File _qc/check.ps1',
  ]
  for (const command of ok) {
    const verdict = decideGate({ tool: 'pwsh', args: { command }, session: withReceipt })
    assert.equal(verdict.decision, 'allow', `不该拦：${command}（落在 ${verdict.rule}）`)
  }

  // write/edit 的 content 里出现红线词是**要写的正文**，不是要执行的命令。
  const writing = decideGate({ tool: 'write', args: { file_path: 'a.md', content: 'psql / git tag / deploy' }, session: noReceipt() })
  assert.equal(writing.rule, 'no-card-receipt', '正文里的红线词不触发红线，回到写侧闸的结论')

  // 引号里包一层才算真执行：`bash -c "psql …"` 仍然拦得住（数据库客户端名回扫原文）。
  assert.equal(decideGate({ tool: 'bash', args: { command: 'bash -c "psql -c \'select 1\'"' }, session: noReceipt() }).decision, 'deny')
})

// ── Team 类工具：policy: off 时的机械落点 ─────────────────────────────

test('gate：Team 策略 off → Team 类工具 deny；未关闭 / 读不到 → 放行', () => {
  const off = { blocked: true, active: false, state: 'off' }
  for (const tool of ['spawn_teammate', 'send_message', 'interrupt_agent', 'wait_agent', 'team_task_create', 'team_task_update']) {
    const verdict = decideGate({ tool, args: {}, session: noReceipt(), team: off })
    assert.equal(verdict.decision, 'deny', `${tool} 在 policy: off 下必须被拦`)
    assert.equal(verdict.rule, 'team-off')
  }

  const follow = { blocked: false, active: true, state: 'follow' }
  for (const tool of ['spawn_teammate', 'team_task_create', 'send_message']) {
    assert.equal(decideGate({ tool, args: {}, session: noReceipt(), team: follow }).decision, 'allow')
  }
  // 读不到结论（服务没注入 / 形状不合格）一律 fail-open：不拿猜出来的结论挡用户的正常协作。
  assert.equal(decideGate({ tool: 'spawn_teammate', args: {}, session: noReceipt() }).rule, 'team-follow')
  assert.equal(decideGate({ tool: 'spawn_teammate', args: {}, session: noReceipt(), team: { blocked: false } }).decision, 'allow')

  // 只读的 Team 查询工具不算：拦它们只会让模型读不到协作状态。
  assert.equal(isTeamTool('list_agents'), false)
  assert.equal(isTeamTool('team_task_list'), true, 'team_task_* 一律算（含读取，口径见 gate.js 注释）')
})

// ── 形状工具（纯函数，单独钉住，便于接线侧复用） ──────────────────────────

test('gate：commandOf 只认 command/cmd/script，别的键一概不算命令', () => {
  assert.equal(commandOf({ command: 'git tag v1' }), 'git tag v1')
  assert.equal(commandOf({ cmd: 'ls' }), 'ls')
  assert.equal(commandOf({ script: ['a', 'b'] }), 'a b')
  assert.equal(commandOf({ content: 'psql', file_path: 'x' }), '', 'content 不是命令')
  assert.equal(commandOf(undefined), '')
  assert.equal(commandOf('git tag v1'), 'git tag v1')
})

test('gate：stripQuoted 只吃引号内文本；matchRedline 命中规则或 undefined', () => {
  assert.equal(stripQuoted('git commit -m "migrate now"'), 'git commit -m ""')
  assert.equal(matchRedline('psql -U postgres').id, 'A1')
  assert.equal(matchRedline('git tag v1'), undefined, '打 tag 自 2026-10-05.2 起已移出 A 类，不再是红线命令')
  assert.equal(matchRedline('git commit -m "deploy docs"'), undefined)
  assert.equal(matchRedline(''), undefined)
  assert.equal(matchRedline('   '), undefined)
  assert.equal(isWriteTool('write'), true)
  assert.equal(isWriteTool('read'), false)
})
