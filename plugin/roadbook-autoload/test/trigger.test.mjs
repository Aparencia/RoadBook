import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
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
  sessionEvents,
  shortDigest,
  surfaceInjectionState,
} from '../trigger.js'

const user = (text) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })

/**
 * 真实 Session 形状：内部日志是私有字段（`log`），公开读法**只有** snapshotEvents()，
 * **没有 `events` 属性** —— 用 `{ events }` 造假会把「真实会话读不到日志」的分支测成绿的。
 * 数组照真实实现冻结：真实 snapshotEvents() 返回的就是冻结快照，顺手钉住「不许就地改日志」。
 */
const snapshotSession = (events) => ({ snapshotEvents: () => Object.freeze(events) })

test('命中开发意图关键词', () => {
  assert.equal(matchIntent('帮我重构一下登录模块', {}), '重构')
  assert.equal(matchIntent('修个 bug：check.ps1 报错', {}), '报错')
  assert.equal(matchIntent('按流程继续开发', {}), '按流程')
  assert.equal(matchIntent('please implement the login page', {}), 'implement')
  assert.equal(matchIntent('这个功能我要写测试', {}), '写测试')
})

test('不命中闲聊与纯问答', () => {
  assert.equal(matchIntent('今天天气怎么样', {}), undefined)
  assert.equal(matchIntent('谢谢，先这样', {}), undefined)
  assert.equal(matchIntent('帮我改个文案', {}), undefined)
})

test('抑制词优先于关键词', () => {
  assert.equal(matchIntent('只讨论，不要动代码，先说说重构是什么', {}), undefined)
  assert.equal(matchIntent('先讨论下实现思路，别动手', {}), undefined)
  assert.equal(matchIntent('不用流程，直接说结论', {}), undefined)
})

test('mode 三态', () => {
  assert.equal(matchIntent('随便聊聊', { mode: 'always' }), 'always')
  assert.equal(matchIntent('帮我重构', { mode: 'off' }), undefined)
  assert.equal(matchIntent('帮我重构', { mode: 'keyword' }), '重构')
})

test('自定义关键词与抑制词覆盖默认值', () => {
  assert.equal(matchIntent('帮我重构', { keywords: ['发布'] }), undefined)
  assert.equal(matchIntent('帮我重构', { keywords: ['重构'], suppressKeywords: [] }), '重构')
  assert.equal(matchIntent('帮我重构', { keywords: ['重构'], suppressKeywords: '坏了' }), '重构')
})

test('DEFAULT_KEYWORDS 不含单字误命中', () => {
  assert.ok(DEFAULT_KEYWORDS.every((word) => word.length >= 2))
  assert.ok(DEFAULT_SUPPRESS.every((word) => word.length >= 2))
})

test('pickUserText 只认用户亲手发的消息', () => {
  const messages = [
    { source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: '项目宪法' }] },
    user('帮我加个功能'),
    { source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '- `roadbook`: ...' }] },
  ]
  assert.equal(pickUserText(messages), '帮我加个功能')
  assert.equal(pickUserText([{ source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'x' }] }]), undefined)
  assert.equal(pickUserText(undefined), undefined)
})

test('手打 /roadbook 时让路给内置手势', () => {
  assert.equal(hasGesture('/roadbook  我有个想法：测试一下', ['roadbook']), true)
  assert.equal(hasGesture('先 /roadbook 再干活', ['roadbook']), true)
  assert.equal(hasGesture('看下 roadbook 这个目录', ['roadbook']), false)
  assert.equal(hasGesture('/roadbook-x 而已', ['roadbook']), false)
  assert.equal(hasGesture('/other', ['roadbook']), false)
})

test('/roadbook 手势容忍前导与句中空白（含全角空格 U+3000、Tab）', () => {
  assert.equal(hasGesture('/roadbook', ['roadbook']), true)
  assert.equal(hasGesture('  /roadbook 开工', ['roadbook']), true)
  assert.equal(hasGesture('\t/roadbook\t开工', ['roadbook']), true)
  assert.equal(hasGesture('\u3000/roadbook\u3000开工', ['roadbook']), true)
  assert.equal(hasGesture('那先\u3000/roadbook，开始', ['roadbook']), true)
  assert.equal(hasGesture('/roadbook：开始', ['roadbook']), true)
  assert.equal(hasGesture('见 https://example.com/roadbook', ['roadbook']), false)
  assert.equal(hasGesture('/roadbookx', ['roadbook']), false)
  assert.equal(hasGesture('', ['roadbook']), false)
  assert.equal(hasGesture(' /roadbook', []), false)
})

test('子代理会话识别', () => {
  assert.equal(isSubagentHeader({ id: 'session-a', delegationDepth: 0 }), false)
  assert.equal(isSubagentHeader({ id: 'session-a', parentSession: 'session-b' }), true)
  assert.equal(isSubagentHeader({ id: 'session-a', delegationDepth: 2 }), true)
  assert.equal(isSubagentHeader(undefined), false)
})

test('会话日志去重按 skill-invocation 形状（data.source 与 data.message.source 都认）', () => {
  const events = [
    { type: 'user/message', data: { message: { source: { kind: 'agent-instructions' } } } },
    { type: 'user/message', data: { message: { source: { kind: 'skill-invocation', name: 'roadbook' } } } },
  ]
  assert.equal(alreadyInjected(snapshotSession(events), 'roadbook'), true)
  assert.equal(alreadyInjected(snapshotSession(events), 'other'), false)
  // 真实形状：user/message 事件的 data 就是消息本身。
  assert.equal(alreadyInjected(snapshotSession([{ type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'roadbook' } } }]), 'roadbook'), true)
  assert.equal(alreadyInjected({}, 'roadbook'), false)
  assert.equal(alreadyInjected(undefined, 'roadbook'), false)
  assert.equal(hasInjectedMessage([{ source: { kind: 'skill-invocation', name: 'roadbook' } }], 'roadbook'), true)
  assert.equal(hasInjectedMessage([], 'roadbook'), false)
})

// 兼容兜底：**只有这一条**钉 `{ events: [...] }` 旧形状（真实 Session 没有这个属性，其余用例一律走 snapshotEvents()）。
// 留着它是因为旧调用方/历史会话对象可能还在传旧形状；哪天有人删掉这条兼容分支，这条会红着提醒。
test('兼容兜底：旧形状 { events } 仍认，sessionEvents() 两种形状都读得到', () => {
  const events = [{ type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'roadbook' } } }]
  assert.equal(sessionEvents({ events }), events, '旧形状原样返回')
  assert.equal(sessionEvents(snapshotSession(events)), events, '真实形状优先')
  assert.deepEqual(sessionEvents(undefined), [], '读不到返回空数组，不抛')
  assert.deepEqual(sessionEvents({ snapshotEvents: () => { throw new Error('boom') } }), [], '读失败 == 读不到')
  assert.deepEqual(
    sessionEvents({ snapshotEvents: () => 'not-an-array', events }),
    events,
    '真实读法给出非数组时退回旧形状',
  )
  assert.equal(alreadyInjected({ events }, 'roadbook'), true, '旧形状仍能去重')
  assert.equal(
    cardReadState({ events: [injected(), { type: 'tool/call', data: { input: { file_path: 'playbook/1.md' } } }] }, 'roadbook'),
    'read',
    '旧形状仍能判空转',
  )
})

test('可见面判据：present / absent / unavailable 三态', () => {
  const session = (nodes, events) => ({ surface: { nodes }, eventAt: (seq) => events[seq] })
  const injected = { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'roadbook' } } }
  const plain = { type: 'user/message', data: { source: { kind: 'user' } } }

  assert.equal(surfaceInjectionState(session([0, 1], [plain, injected]), 'roadbook'), 'present')
  assert.equal(surfaceInjectionState(session([0], [plain]), 'roadbook'), 'absent')
  assert.equal(surfaceInjectionState(session([0, 1], [plain, injected]), ['other', 'roadbook']), 'present')
  // 读不到面（没有 surface / 没有 eventAt / 事件取不到）：不判断，交给调用方走保守分支。
  assert.equal(surfaceInjectionState({}, 'roadbook'), 'unavailable')
  assert.equal(surfaceInjectionState({ surface: { nodes: [0] } }, 'roadbook'), 'unavailable')
  assert.equal(surfaceInjectionState(session([0], [undefined]), 'roadbook'), 'absent')
  assert.equal(
    surfaceInjectionState({ surface: { nodes: [0] }, eventAt: () => { throw new Error('boom') } }, 'roadbook'),
    'unavailable',
  )
  assert.equal(surfaceInjectionState(session([0], [plain]), []), 'unavailable')
  assert.equal(surfaceInjectionState(session([0], [plain]), 'roadbook'), 'absent')
})

test('指纹与说明文案', () => {
  assert.equal(shortDigest('abc'), 'ba7816bf')
  assert.match(buildNote({ skillName: 'roadbook', hit: '重构', digest: 'aaaaaaaa', expectedDigest: '' }), /命中「重构」/)
  const driftNote = buildNote({ skillName: 'roadbook', hit: '重构', digest: 'aaaaaaaa', expectedDigest: 'bbbbbbbb' })
  assert.match(driftNote, /技能内容已更新/)
})

// 加载面评估集（S7）：真实措辞的正样本 + 近似命中（near-miss）的负样本。
// 误命中 = 把整张 0-1 驱动卡塞进一次无关闲聊，代价远大于漏一次；所以负样本不许是「给 PDF 技能测 fibonacci」那种送分题。
test('加载面评估集：正样本命中 ≥8/10，负样本误命中 = 0', () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/trigger-eval.json', import.meta.url))
  const cases = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const positives = cases.filter((c) => c.should_trigger)
  const negatives = cases.filter((c) => !c.should_trigger)
  assert.ok(positives.length >= 10, `正样本至少 10 条，实际 ${positives.length}`)
  assert.ok(negatives.length >= 10, `负样本至少 10 条，实际 ${negatives.length}`)

  const hitPositive = positives.filter((c) => matchIntent(c.query, {}) !== undefined)
  const falsePositive = negatives.filter((c) => matchIntent(c.query, {}) !== undefined)
  assert.deepEqual(falsePositive.map((c) => c.id), [], '负样本误命中（near-miss 被当开发意图）')
  assert.ok(hitPositive.length >= 8, `正样本命中 ≥8/10，实际 ${hitPositive.length}/${positives.length}`)

  // 只说兼容：留出集（split=test）只允许改词表，不允许改题目本身。
  assert.ok(cases.some((c) => c.split === 'test'), '存在留出集 split=test')
  assert.ok(cases.some((c) => c.split === 'train'), '存在训练集 split=train')
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, 'id 唯一')
})

// ── 自进化 C 环：空转判据（判据在纯逻辑层，可离线钉死） ──────────────────────
// 这一环不做钩子：agent/pre-step 本来就挂着、会话日志本来就读得到，缺的只是「怎么算空转」。

const injected = (content = 'ROADBOOK_BODY') => ({
  type: 'user/message',
  data: { source: { kind: 'skill-invocation', name: 'roadbook' }, content: [{ type: 'text', text: content }] },
})

test('空转判据：没有会话日志 / 没有注入痕迹时不判（unknown，绝不猜）', () => {
  assert.equal(cardReadState(undefined, 'roadbook'), 'unknown', '读不到会话不判')
  assert.equal(cardReadState({}, 'roadbook'), 'unknown', '没有日志读法不判')
  assert.equal(cardReadState(snapshotSession([]), 'roadbook'), 'unknown', '空日志不判')
  assert.equal(cardReadState(snapshotSession([{ type: 'assistant/message', data: {} }]), 'roadbook'), 'unknown', '找不到注入消息不判')
  assert.equal(cardReadState(snapshotSession([injected()]), ''), 'unknown', '技能名没给不判')
});

test('空转判据：注入后一路没有读卡痕迹 = idle', () => {
  const session = snapshotSession([injected(), { type: 'assistant/message', data: { text: '我先把代码看一遍' } }])
  assert.equal(cardReadState(session, 'roadbook'), 'idle')
})

test('空转判据：注入正文自带的 playbook_EN/ 不算「读过」（只扫注入之后的事件）', () => {
  // 注入正文里一定写着 playbook_EN/0-1-driver-card.md；从 0 开始扫会自己证明自己
  const session = snapshotSession([
    injected('任何一轮开始：playbook_EN/0-1-driver-card.md'),
    { type: 'assistant/message', data: { text: '好' } },
  ])
  assert.equal(cardReadState(session, 'roadbook'), 'idle', '注入正文不能自证')
})

test('空转判据：注入之后出现读卡痕迹 = read（工具调用参数、工具结果、助手消息都算）', () => {
  const needles = ['playbook/', 'playbook_EN/']
  const toolCall = snapshotSession([
    injected(),
    { type: 'tool/call', data: { name: 'read', input: { file_path: 'playbook_EN/4-1-batch-coding.md' } } },
  ])
  assert.equal(cardReadState(toolCall, 'roadbook'), 'read', '工具调用参数里的路径算痕迹')
  const toolResult = snapshotSession([injected(), { type: 'tool/result', data: { content: '……见 playbook/6-6-流程体检.md……' } }])
  assert.equal(cardReadState(toolResult, 'roadbook'), 'read', '工具结果里的正文算痕迹')
  const assistant = snapshotSession([injected(), { type: 'assistant/message', data: { text: '我读了 playbook_EN/0-1-driver-card.md' } }])
  assert.equal(cardReadState(assistant, 'roadbook'), 'read', '助手自述也算痕迹（本环只观测，不判真假）')

  // 自定义 needle 生效
  assert.equal(cardReadState(assistant, 'roadbook', ['nope']), 'idle')
  assert.equal(cardReadState(assistant, 'roadbook', 'playbook_EN/'), 'read', '字符串 needle 也认')
})

test('空转判据：只看最后一次注入之后的事件（被压缩后重新注入会重置基线）', () => {
  const session = snapshotSession([
    injected(),
    { type: 'assistant/message', data: { text: '读过 playbook_EN/2-1-feature-research.md' } },
    injected(), // 压缩后重注入：基线后移，之前读过不算这一轮
    { type: 'assistant/message', data: { text: '继续' } },
  ])
  assert.equal(cardReadState(session, 'roadbook'), 'idle', '以最后一次注入为基线')
})

test('空转判据：注入之后还没有事件、或事件多到超出扫描窗口 = unknown', () => {
  assert.equal(cardReadState(snapshotSession([injected()]), 'roadbook'), 'unknown', '还没有材料可判')
  const many = [injected()]
  for (let index = 0; index < 500; index += 1) many.push({ type: 'assistant/message', data: { text: `第 ${index} 步` } })
  assert.equal(cardReadState(snapshotSession(many), 'roadbook'), 'unknown', '超出窗口不判，也不做全量序列化')
})

test('空转判据：不可序列化的事件被跳过，不影响其余事件的判定', () => {
  const circular = { type: 'tool/result', data: {} }
  circular.data.self = circular
  const session = snapshotSession([injected(), circular, { type: 'assistant/message', data: { text: '见 playbook/0-1-驱动卡.md' } }])
  assert.equal(cardReadState(session, 'roadbook'), 'read', '循环引用事件跳过，后面的痕迹照样认出来')
})

test('空转判据：回扫只在「窗口 + 1」条内找最后一次注入，边界结论与全量倒扫一致', () => {
  // gap 正好 = 窗口上限：注入仍在回扫范围内，判据照常给结论。
  const atLimit = [injected()]
  for (let index = 0; index < 400; index += 1) atLimit.push({ type: 'assistant/message', data: { text: `第 ${index} 步` } })
  assert.equal(cardReadState(snapshotSession(atLimit), 'roadbook'), 'idle', 'gap 等于窗口上限：仍要判')

  // gap = 窗口 + 1：注入落在回扫范围之外 ⇒ 算出来的 gap 本来也 > 窗口，两种实现都给 unknown。
  const overLimit = [injected()]
  for (let index = 0; index < 401; index += 1) overLimit.push({ type: 'assistant/message', data: { text: `第 ${index} 步` } })
  assert.equal(cardReadState(snapshotSession(overLimit), 'roadbook'), 'unknown', 'gap 超出窗口：判不了')

  // 注入远在窗口之外、之后一路读过卡：宁可 unknown，也不许把很久以前那次注入的痕迹算进这一轮。
  const far = [{ type: 'assistant/message', data: { text: '很久以前' } }, injected()]
  for (let index = 0; index < 500; index += 1) far.push({ type: 'tool/call', data: { input: { file_path: 'playbook/1.md' } } })
  far.push({ type: 'tool/call', data: { input: { file_path: 'playbook/2.md' } } })
  assert.equal(cardReadState(snapshotSession(far), 'roadbook'), 'unknown', '回扫窗口之外 = 判不了')
})
