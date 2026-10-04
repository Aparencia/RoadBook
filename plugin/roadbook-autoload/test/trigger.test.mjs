import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_KEYWORDS,
  DEFAULT_SUPPRESS,
  alreadyInjected,
  buildNote,
  hasGesture,
  hasInjectedMessage,
  isSubagentHeader,
  matchIntent,
  pickUserText,
  shortDigest,
  surfaceInjectionState,
} from '../trigger.js'

const user = (text) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })

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
  assert.equal(alreadyInjected({ events }, 'roadbook'), true)
  assert.equal(alreadyInjected({ events }, 'other'), false)
  // 真实形状：user/message 事件的 data 就是消息本身。
  assert.equal(alreadyInjected({ events: [{ type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'roadbook' } } }] }, 'roadbook'), true)
  assert.equal(alreadyInjected({}, 'roadbook'), false)
  assert.equal(alreadyInjected(undefined, 'roadbook'), false)
  assert.equal(hasInjectedMessage([{ source: { kind: 'skill-invocation', name: 'roadbook' } }], 'roadbook'), true)
  assert.equal(hasInjectedMessage([], 'roadbook'), false)
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
