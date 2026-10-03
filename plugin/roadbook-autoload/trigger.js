/**
 * roadbook-autoload 的纯逻辑层：不 import 任何 dsh 包，可用普通 node 直接单测。
 *
 * 门控三层（在 index.js 里合成）：
 *   ① 当前会话在一个 git 项目里（requireGitRoot，默认开）
 *   ② 本回合用户消息命中开发意图关键词（mode: keyword）
 *   ③ 未命中抑制词，且用户没有手打 /roadbook（那条走内置手势，避免重复注入）
 */

import { createHash } from 'node:crypto'

/** 默认开发意图关键词：多字符优先，不用单字，降低误命中。 */
export const DEFAULT_KEYWORDS = [
  // 中文 · 开发动作
  '实现', '开发', '新增', '添加功能', '加功能', '重构', '修复', '排查', '定位问题', '报错',
  '跑不起来', '不工作', '失效', '优化', '迁移', '升级依赖', '清理', '删除旧', '下线',
  '归档', '发布', '验收', '复盘', '体检', '写测试', '补测试', '改代码', '改一下代码',
  '接需求', '迭代', '继续开发', '开工', '收工',
  // 中文 · 流程
  '按流程', '走流程', '流程卡', '路书', 'roadbook',
  // English
  'implement', 'refactor', 'migrate', 'deprecate', 'add feature', 'write tests', 'unit test',
  'fix bug', 'bug fix', 'release', 'code review', 'clean up', 'tech debt',
]

/** 默认抑制词：命中即不注入（讨论、问答、明确说不要动代码）。 */
export const DEFAULT_SUPPRESS = [
  '只讨论', '只进行讨论', '只是讨论', '先讨论', '不要动代码', '别动代码', '不改代码', '不要改代码',
  '不用流程', '不需要流程', '关闭流程', '跳过流程', '不要按流程', '不用按流程',
  '只回答', '别动手', '不要动手', '先别写代码', '不要实现',
]

const asList = (value, fallback) => (Array.isArray(value) ? value : fallback)

const lower = (value) => String(value ?? '').toLowerCase()

/**
 * 判定本回合是否该自动加载。
 * @returns 命中的关键词；mode: always 时返回 'always'；不该加载时返回 undefined。
 */
export function matchIntent(text, config = {}) {
  const mode = config.mode ?? 'keyword'
  if (mode === 'off') return undefined
  const source = lower(text)
  if (source.trim().length === 0) return undefined
  for (const word of asList(config.suppressKeywords, DEFAULT_SUPPRESS)) {
    if (word && source.includes(lower(word))) return undefined
  }
  if (mode === 'always') return 'always'
  // 取「在文本里出现得最早」的关键词；同样早则取更长的那个（口径可复现，便于观测）。
  let best
  let bestIndex = Number.POSITIVE_INFINITY
  for (const word of asList(config.keywords, DEFAULT_KEYWORDS)) {
    if (!word) continue
    const index = source.indexOf(lower(word))
    if (index < 0) continue
    if (index < bestIndex || (index === bestIndex && word.length > (best?.length ?? 0))) {
      best = word
      bestIndex = index
    }
  }
  return best
}

/** 取最后一条「用户亲手发的」消息文本；运行时上下文等注入消息不算。 */
export function pickUserText(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.source?.kind !== 'user') continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
    if (text.trim().length > 0) return text
  }
  return undefined
}

/** 用户是否已经手打了 /<skill>（内置手势会自己注入，插件让路）。 */
export function hasGesture(text, names) {
  const source = String(text ?? '')
  for (const name of asList(names, [])) {
    if (typeof name !== 'string' || name.length === 0) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 手势前面必须是行首或空白（半角空格、全角空格 U+3000、Tab 都算），后面是行尾、空白或常见中英标点：
    // 「  /roadbook 开工」「那先\u3000/roadbook，开始」算手势，而「/roadbook-x」「https://x/roadbook」不算。
    if (new RegExp(`(?:^|[\\s\\u3000])/${escaped}(?=$|[\\s\\u3000，。！？；：、,.!?;:])`).test(source)) return true
  }
  return false
}

/** 子代理会话默认不注入（它们的上下文里已经带着流程）。 */
export function isSubagentHeader(header) {
  if (header === null || typeof header !== 'object') return false
  if (typeof header.parentSession === 'string' && header.parentSession.length > 0) return true
  return typeof header.delegationDepth === 'number' && header.delegationDepth > 0
}

/** 本回合已在决策里带了同名注入消息。 */
export function hasInjectedMessage(messages, name) {
  if (!Array.isArray(messages)) return false
  return messages.some((message) => message?.source?.kind === 'skill-invocation' && message?.source?.name === name)
}

/**
 * 会话日志里已有同名注入（会话恢复、插件重载时兜底去重）。
 * 事件形状按 `{ type, data: { message: { source } } }` 防御式读取。
 */
export function alreadyInjected(session, name) {
  const events = session?.events
  if (!Array.isArray(events)) return false
  return events.some((event) => {
    const source = event?.data?.message?.source
    return source?.kind === 'skill-invocation' && source?.name === name
  })
}

/** SKILL.md 内容指纹（前 8 位），用于自进化的版本对账。 */
export function shortDigest(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 8)
}

/** 注入消息末尾的透明说明：为什么会出现、怎么关掉、版本是否变了。 */
export function buildNote({ skillName, hit, digest, expectedDigest }) {
  const lines = [
    `[roadbook-autoload] 本回合由插件自动加载了 ${skillName} 流程（命中「${hit}」）。不需要流程可以忽略这条；要关掉自动加载：把插件 config 的 mode 设为 off。`,
  ]
  if (expectedDigest && digest && expectedDigest !== digest) {
    lines.push(
      `[roadbook-autoload] 技能内容已更新（SKILL.md sha256 前 8 位 ${digest}，记录值 ${expectedDigest}）：若流程卡有变化，以最新卡为准。`,
    )
  }
  return lines.join('\n')
}
