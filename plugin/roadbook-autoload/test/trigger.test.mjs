import assert from 'node:assert/strict'
import { test } from 'node:test'
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

test('子代理会话识别', () => {
  assert.equal(isSubagentHeader({ id: 'session-a', delegationDepth: 0 }), false)
  assert.equal(isSubagentHeader({ id: 'session-a', parentSession: 'session-b' }), true)
  assert.equal(isSubagentHeader({ id: 'session-a', delegationDepth: 2 }), true)
  assert.equal(isSubagentHeader(undefined), false)
})

test('会话日志去重按 skill-invocation 形状', () => {
  const events = [
    { type: 'user/message', data: { message: { source: { kind: 'agent-instructions' } } } },
    { type: 'user/message', data: { message: { source: { kind: 'skill-invocation', name: 'roadbook' } } } },
  ]
  assert.equal(alreadyInjected({ events }, 'roadbook'), true)
  assert.equal(alreadyInjected({ events }, 'other'), false)
  assert.equal(alreadyInjected({}, 'roadbook'), false)
  assert.equal(alreadyInjected(undefined, 'roadbook'), false)
  assert.equal(hasInjectedMessage([{ source: { kind: 'skill-invocation', name: 'roadbook' } }], 'roadbook'), true)
  assert.equal(hasInjectedMessage([], 'roadbook'), false)
})

test('指纹与说明文案', () => {
  assert.equal(shortDigest('abc'), 'ba7816bf')
  assert.match(buildNote({ skillName: 'roadbook', hit: '重构', digest: 'aaaaaaaa', expectedDigest: '' }), /命中「重构」/)
  const driftNote = buildNote({ skillName: 'roadbook', hit: '重构', digest: 'aaaaaaaa', expectedDigest: 'bbbbbbbb' })
  assert.match(driftNote, /技能内容已更新/)
})
