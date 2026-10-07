/**
 * roadbook route --quote —— **卡正文的逐字节切片**（台账 #27 的派单内嵌件）
 *
 * 为什么存在：`includeSubagents: false` 意味着子 agent 拿不到卡正文（`design/v6-design.md:502` ⑤），
 * 而 P0「卡片在子 agent 执行」的全部收益都建立在「子 agent 手里真有它那一张卡」之上。
 * 两条路：① 对这条路径放行 `includeSubagents`；② 派单里内嵌卡正文切片。
 * 已裁决走 ②（`design/vnext-2026-10-07.md` §11.2）：放行等于打开「子代理不受卡约束」的口子，
 * 而且派单长了以后没人核对得了「派单里那段文字到底是不是卡原文」。
 * **本文件就是那个出口**：切出来的东西自带行号与哈希，派发方与收件方都能独立复核
 * 「这段文字 = 卡文件的第 N~M 行」。
 *
 * 三条自我约束：
 *   1. **只读**：不写盘、不改卡、不 spawn。
 *   2. **逐字节**：`raw` 等于卡文件第 from..to 行按原文换行拼起来的字节串（不含末行末尾那个换行）。
 *      哈希算在 `raw` 上，**不算在带行号的渲染文本上** —— 行号前缀是给人看的，不是内容。
 *      测试用**字节偏移**独立复算一遍（不信本文件自己的说法）。
 *   3. **前缀可机械剥离**：`stripLineNumbers` 与 `LINE_PREFIX_RE` 是同一条规则；测试对
 *      **全部 49 张卡**做「剥掉前缀 = 原文」的往返断言，所以这条规则不是口头约定。
 *
 * 退出码口径（由 `route.mjs` 的 CLI 落实）：切片写法不合法 = 用法错误 2；
 * 卡不存在 / 行号越界 / 起止颠倒 = 判红 1。
 */
import { createHash } from 'node:crypto'
import { SCHEMA } from './route-data.mjs'

/** 行号前缀：`  80| 正文`。宽度按最大行号对齐；剥掉它就是原文。 */
export const LINE_PREFIX_RE = /^\s*\d+\| /

/** `<卡号>` / `<卡号>:<起>` / `<卡号>:<起>-<止>`；其余一律用法错误（不猜）。 */
const SPEC_RE = /^(\d+-\d+)(?::(\d+)(?:-(\d+))?)?$/

/**
 * 解析切片写法。**故意严格**：只认 `4-1` / `4-1:80` / `4-1:80-120`，
 * `4-1:80~120`、`4-1:`、`4-1:abc` 都判用法错误并给原文 —— 宽松解析会让
 * 「我以为切了 80-120 行」与「实际切了整张卡」在输出上长得一模一样。
 */
export function parseQuoteSpec(spec) {
  if (typeof spec !== 'string' || spec.length === 0) {
    throw new Error('用法错误：--quote 需要一个卡号，例如 4-1 或 4-1:80-120')
  }
  const m = SPEC_RE.exec(spec)
  if (!m) {
    throw new Error(`用法错误：--quote 的切片写法是 <卡号>[:<起行>[-<止行>]]，例如 4-1 / 4-1:80 / 4-1:80-120，实得 ${JSON.stringify(spec)}`)
  }
  return {
    card: m[1],
    from: m[2] === undefined ? null : Number(m[2]),
    to: m[3] === undefined ? null : Number(m[3]),
  }
}

/** 剥掉行号前缀后剩下的就是原文（render 的逆运算；测试对全部卡做往返）。 */
export function stripLineNumbers(rendered) {
  return rendered
    .split('\n')
    .filter((line) => LINE_PREFIX_RE.test(line))
    .map((line) => line.replace(LINE_PREFIX_RE, ''))
    .join('\n')
}

/**
 * 切片。入参一律显式传入（`text` 是卡正文，I/O 留在 `route-cards.mjs`）—— 同输入必同输出。
 *
 * @param {{text: string, card: string, file: string, spec: string, lang?: 'cn'|'en'}} input
 */
export function quoteSlice({ text, card, file, spec, lang = 'cn' }) {
  const parsed = parseQuoteSpec(spec)
  if (parsed.card !== card) {
    throw new Error(`用法错误：切片写法里的卡号 ${parsed.card} 与取到的卡 ${card} 对不上`)
  }
  // 按 `\n` 切、只去掉末尾那个空串：CRLF 的行会把自己的 `\r` 带在行尾，
  // 于是 join('\n') 复现出来的仍是原字节 —— 「逐字节」这句话因此成立，而不是近似。
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const total = lines.length
  if (total === 0) throw new Error(`切片判红：卡 ${card}（${file}）是空文件`)
  const from = parsed.from === null ? 1 : parsed.from
  const to = parsed.to === null ? (parsed.from === null ? total : parsed.from) : parsed.to
  if (from < 1 || to > total || from > to) {
    throw new Error(`切片判红：卡 ${card} 共 ${total} 行，要第 ${from}-${to} 行（起止须落在 1..${total} 内，且起 ≤ 止）`)
  }
  const slice = lines.slice(from - 1, to)
  const raw = slice.join('\n')
  const width = String(to).length
  return {
    card,
    lang,
    file,
    title: file.replace(/^\d+-\d+-/, '').replace(/\.md$/, ''),
    from,
    to,
    totalLines: total,
    lines: to - from + 1,
    chars: raw.length,
    bytes: Buffer.byteLength(raw, 'utf8'),
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    raw,
    rendered: slice.map((line, i) => `${String(from + i).padStart(width)}| ${line}`).join('\n'),
  }
}

export function fmtQuote(q) {
  const dirName = q.lang === 'en' ? 'playbook_EN' : 'playbook'
  const whole = q.from === 1 && q.to === q.totalLines
  return [
    'Roadbook route 切片回执（--quote）',
    `卡：${q.card} · ${q.title}`,
    `文件：${dirName}/${q.file}（共 ${q.totalLines} 行${whole ? '，本切片 = 整张卡' : ''}）`,
    `切片：第 ${q.from}-${q.to} 行（${q.lines} 行 / ${q.bytes} 字节）`,
    `sha256：${q.sha256}`,
    '哈希口径：算在上面这段**原文**上，不含行号前缀（剥离规则 = 去掉每行行首的 `行号| `，正则 /^\\s*\\d+\\| /）。',
    '派单用法：把下面这一段原样贴进派单 —— 收件方拿卡号、行号与 sha256 就能独立复核「这段文字 = 卡文件的第 N~M 行」。',
    '',
    q.rendered,
  ].join('\n')
}

/** `--json` 的唯一出口：键序在这里钉死（同一切片两次运行逐字节相同）。 */
export function fmtQuoteJson(q) {
  return JSON.stringify({
    schema: SCHEMA,
    mode: 'quote',
    lang: q.lang,
    dir: q.lang === 'en' ? 'playbook_EN' : 'playbook',
    card: q.card,
    title: q.title,
    file: q.file,
    from: q.from,
    to: q.to,
    totalLines: q.totalLines,
    lines: q.lines,
    chars: q.chars,
    bytes: q.bytes,
    sha256: q.sha256,
    text: q.raw,
  }, null, 2)
}
