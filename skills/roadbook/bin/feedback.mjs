/**
 * roadbook feedback —— 反馈回流收件箱的**判据 + 派生索引**（台账 #23 / 反馈根因 D）。
 *
 * 为什么存在：`RISK.md` 那条证据生命周期链的末环是「回流（`feedback/`）」，
 * 而它此前只是四个字 —— 磁盘上没有这个目录，也没有任何命令能回答
 * 「这条反馈的字段齐不齐、能不能排进某一批」。本文件只做两件事：
 *   ① `--check` 逐条判字段 / 命名 / 三小节（退出码 0/1，机械判据）；
 *   ② `--index`/`--write` 把收件箱渲染成**派生视图**（条目文件是唯一真相）。
 * 明确不做（方案 §7）：通用化成多项目反馈平台、自动同步通道、把条目塞进任何卡的判据。
 *
 * 字段行为什么不是 YAML front matter：本仓零运行时依赖，而 YAML 的 `键: 值`
 * 一旦值里出现 ASCII 冒号加空格就会被读成嵌套映射（`SKILL.md` 那条 frontmatter 教训：
 * 宿主 parseFrontmatter 抛错后整份技能被静默丢弃）。一行五格用全角 `｜` / `：` 分隔，
 * 正则就能判，不需要 YAML 解析器 —— 判据越薄，越不容易假绿。
 *
 * 三条自我约束：
 *   1. **只读**（除 `--write` 写 `INDEX.md`）：不改条目、不 spawn、不联网。
 *   2. **纯函数优先**：`parseEntry` / `renderIndex` 入参一律显式传入，I/O 只在 `readInbox` / `run`。
 *   3. **同源靠判据不靠人记**：文件名日期 = 字段 `日期`；`landed` 必须有落点；
 *      `TEMPLATE.md` 里的字段行必须能被同一个解析器读懂（`test/feedback.test.mjs` 钉住）。
 *
 * 退出码：0 判绿｜1 判红（某条不合规）｜2 用法错误。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path, { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXIT = { ok: 0, fail: 1, usage: 2 }

/** 字段行里的五格（顺序不限，但不许多、不许少、不许重名）。 */
export const FIELDS = ['日期', '来源', '轴', '状态', '落点']
/** `轴` 的受控词表：一个分支只留一个词，新增同义词 = 判据分裂。 */
export const AXES = ['卡片', '判据', '仪器', '文档', '流程', '其他']
/** `状态` 的受控词表：new（刚进箱）→ triaged（已定性）→ landed（已落地）/ killed（已否）。 */
export const STATUSES = ['new', 'triaged', 'landed', 'killed']
/** 三个必填小节（标题在位且内容非空）。 */
export const SECTIONS = ['现象', '命令与输出原文', '期望']
/** 保留名：契约页、模板页、派生索引 —— 它们不进收件箱计数。 */
export const RESERVED = ['README.md', 'TEMPLATE.md', 'INDEX.md']

/** 条目文件名：`YYYY-MM-DD_<slug>.md`（slug 小写连字符，首字符是字母或数字）。 */
const ENTRY_RE = /^(\d{4}-\d{2}-\d{2})_([a-z0-9][a-z0-9-]*)\.md$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FIELD_LINE_RE = /^>\s*日期：/
const HEADING_RE = /^##\s+(.+?)\s*$/

/**
 * 剥掉 UTF-8 BOM。不是放宽判据，是**输入卫生**：Windows PowerShell 5.1 的
 * `Set-Content -Encoding UTF8` 与 `Out-File` 默认写 BOM（`route.mjs` 的 `loadFacts`
 * 同一条口径，见 `docs/lessons/2026-10-07_Windows写文件必带BOM.md`）。
 */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** 小节切分：`## 标题` → 正文（到下一个 `##` 或文末）。标题与正文都 trim。 */
function splitSections(lines) {
  const out = new Map()
  let current = null
  for (const line of lines) {
    const m = HEADING_RE.exec(line)
    if (m) {
      current = m[1].trim()
      out.set(current, [])
      continue
    }
    if (current !== null) out.get(current).push(line)
  }
  for (const [key, body] of out) out.set(key, body.join('\n').trim())
  return out
}

/**
 * 解析一条反馈。**故意严格**：任何一处不合规都抛 `Error`，消息即判红理由原文
 * （宽松解析会让「字段写错」与「字段没写」在输出上长得一模一样）。
 *
 * @param {string} text 条目正文
 * @param {string} file 条目文件名（只用于同源核对与回显）
 */
export function parseEntry(text, file) {
  const nameMatch = ENTRY_RE.exec(file)
  if (!nameMatch) throw new Error('命名不是 `YYYY-MM-DD_<slug>.md`（日期 + 下划线 + 小写连字符 slug）')
  const lines = stripBom(text).split(/\r?\n/)
  const fieldIndex = lines.findIndex((line) => FIELD_LINE_RE.test(line.trim()))
  if (fieldIndex < 0) throw new Error('缺字段行（`> 日期：… ｜ 来源：… ｜ 轴：… ｜ 状态：… ｜ 落点：…`）')

  const fields = {}
  for (const raw of lines[fieldIndex].trim().replace(/^>\s*/, '').split('｜')) {
    const cell = raw.trim()
    if (cell === '') continue
    const at = cell.indexOf('：')
    if (at <= 0) throw new Error(`字段格不是「键：值」形态：${JSON.stringify(cell)}`)
    const key = cell.slice(0, at).trim()
    if (!FIELDS.includes(key)) throw new Error(`未知字段 ${JSON.stringify(key)}（只认 ${FIELDS.join(' / ')}）`)
    if (fields[key] !== undefined) throw new Error(`字段 ${key} 写了两次`)
    fields[key] = cell.slice(at + 1).trim()
  }
  const missing = FIELDS.filter((f) => fields[f] === undefined || fields[f] === '')
  if (missing.length) throw new Error(`字段行缺值：${missing.join(' / ')}`)

  if (!DATE_RE.test(fields['日期'])) throw new Error(`日期 ${JSON.stringify(fields['日期'])} 不是 YYYY-MM-DD`)
  if (fields['日期'] !== nameMatch[1]) throw new Error(`字段日期 ${fields['日期']} 与文件名日期 ${nameMatch[1]} 不一致（同一事实两处写，就按同源判）`)
  if (!AXES.includes(fields['轴'])) throw new Error(`轴 ${JSON.stringify(fields['轴'])} 不在词表 ${AXES.join(' / ')} 内`)
  if (!STATUSES.includes(fields['状态'])) throw new Error(`状态 ${JSON.stringify(fields['状态'])} 不在词表 ${STATUSES.join(' / ')} 内`)
  if (fields['状态'] === 'landed' && fields['落点'] === '—') throw new Error('状态是 landed 却没给落点（写卡号或 `文件:行`；落了地就必须指得出落在哪）')

  const sections = splitSections(lines)
  for (const name of SECTIONS) {
    if (!sections.has(name)) throw new Error(`缺必填小节 \`## ${name}\``)
    if (sections.get(name) === '') throw new Error(`必填小节 \`## ${name}\` 是空的（空小节 = 有形式没内容）`)
  }

  return {
    file,
    slug: nameMatch[2],
    date: fields['日期'],
    source: fields['来源'],
    axis: fields['轴'],
    status: fields['状态'],
    landing: fields['落点'],
  }
}

/**
 * 读收件箱并逐条判。返回 `{ entries, problems }`：`problems` 空 = 判绿。
 * 目录不在位、保留文件缺失也算 problem —— 少了契约页，格式就没有落点（而这正是原本的缺陷）。
 */
export function readInbox(dir) {
  const entries = []
  const problems = []
  if (!existsSync(dir)) {
    problems.push({ file: path.basename(dir) || dir, reason: '收件箱目录不在位（契约 = `README.md` + `TEMPLATE.md`）' })
    return { entries, problems }
  }
  for (const name of RESERVED.slice(0, 2)) {
    if (!existsSync(path.join(dir, name))) problems.push({ file: name, reason: '保留文件缺失（本目录的契约页 / 模板页）' })
  }
  for (const name of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md')).sort()) {
    if (RESERVED.includes(name)) continue
    let text
    try {
      text = readFileSync(path.join(dir, name), 'utf8')
    } catch (err) {
      problems.push({ file: name, reason: `读取失败：${err.message}` })
      continue
    }
    try {
      entries.push(parseEntry(text, name))
    } catch (err) {
      problems.push({ file: name, reason: err.message })
    }
  }
  return { entries, problems }
}

/** 人读回执：判绿一行（含四态计数），判红逐条点名 + 汇总。 */
export function fmtCheck({ entries, problems }) {
  if (problems.length) {
    return [
      ...problems.map((p) => `[FAIL] ${p.file}：${p.reason}`),
      `判红：${problems.length} 条不合规（收件箱共 ${entries.length + problems.length} 个候选文件）—— 字段与命名口径见 \`feedback/README.md\``,
    ].join('\n')
  }
  const stat = STATUSES.map((s) => `${s} ${entries.filter((e) => e.status === s).length}`).join(' ｜ ')
  return `判绿：${entries.length} 条条目（${stat}）—— 字段齐全、命名合规（日期与文件名同源）、三个必填小节非空。`
}

/**
 * 派生索引。**日期倒序**（新的在最上面），同日按文件名升序 —— 排序键固定，两次渲染逐字节相同。
 * 空收件箱渲染成一个显式句子而不是空表：空表看起来像渲染失败。
 */
export function renderIndex(entries) {
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? (a.file < b.file ? -1 : 1) : a.date < b.date ? 1 : -1))
  const counts = STATUSES.map((s) => `${s} ${sorted.filter((e) => e.status === s).length}`).join(' ｜ ')
  const out = [
    '# feedback/ · 回流索引（派生视图；条目文件才是唯一真相，手改这份下次渲染就没了）',
    '> 渲染：`node skills/roadbook/bin/feedback.mjs --write` ｜ 字段与命名口径：`feedback/README.md`',
    `> 计数：${counts}（总 ${sorted.length}）`,
    '',
  ]
  if (sorted.length === 0) {
    out.push('（收件箱为空：`feedback/` 下还没有条目文件。）')
    return `${out.join('\n')}\n`
  }
  out.push('| 日期 | 来源 | 轴 | 状态 | 落点 | 条目 |', '| :-- | :-- | :-- | :-- | :-- | :-- |')
  for (const e of sorted) out.push(`| ${e.date} | ${e.source} | ${e.axis} | ${e.status} | ${e.landing} | \`${e.file}\` |`)
  return `${out.join('\n')}\n`
}

export function usage() {
  return [
    'roadbook feedback —— 反馈回流收件箱的判据与派生索引',
    '用法：node skills/roadbook/bin/feedback.mjs [--check|--index|--write] [--dir <收件箱目录>]',
    '  --check  逐条校验字段 / 命名 / 三个必填小节（默认；退出码 0 判绿 / 1 判红）',
    '  --index  校验后打印派生索引（与 --write 写出的文件逐字节相同）',
    '  --write  同上，并把索引写进 <收件箱>/INDEX.md',
    '  --dir    换收件箱目录（默认 <cwd>/feedback）',
  ].join('\n')
}

export function parseArgs(argv) {
  const opts = { mode: 'check', dir: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check') opts.mode = 'check'
    else if (arg === '--index') opts.mode = 'index'
    else if (arg === '--write') opts.mode = 'write'
    else if (arg === '--dir') {
      opts.dir = argv[i + 1] ?? ''
      i += 1
      if (opts.dir === '') throw new Error('用法错误：--dir 需要一个目录路径')
    } else if (arg === '--help' || arg === '-h') opts.mode = 'help'
    else throw new Error(`用法错误：不认识的参数 ${JSON.stringify(arg)}（只认 --check / --index / --write / --dir <路径>）`)
  }
  return opts
}

/** CLI 唯一出口：返回 `{ code, out, err }`，由 `main()` 打印 —— 测试因此不必解析 stdout 才知道结果。 */
export function run(argv, cwd = process.cwd()) {
  const opts = parseArgs(argv)
  if (opts.mode === 'help') return { code: EXIT.ok, out: usage(), err: '' }
  const dir = opts.dir ? path.resolve(cwd, opts.dir) : path.join(cwd, 'feedback')
  const result = readInbox(dir)
  const verdict = fmtCheck(result)
  if (opts.mode === 'check') return { code: result.problems.length ? EXIT.fail : EXIT.ok, out: verdict, err: '' }
  if (result.problems.length) {
    // 带问题的索引会被当成事实读走 —— 所以宁可不渲染。这一条是「假绿」防线，不是洁癖。
    return { code: EXIT.fail, out: verdict, err: '索引未渲染：先修上面这些条目（渲染一份带问题的索引 = 让人读到错的事实）' }
  }
  const index = renderIndex(result.entries)
  if (opts.mode === 'index') return { code: EXIT.ok, out: index, err: '' }
  const target = path.join(dir, 'INDEX.md')
  writeFileSync(target, index, 'utf8')
  return { code: EXIT.ok, out: `${verdict}\n已写入 ${target}（${Buffer.byteLength(index, 'utf8')} 字节）`, err: '' }
}

function main() {
  let result
  try {
    result = run(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    console.log(usage())
    process.exit(EXIT.usage)
  }
  if (result.out) console.log(result.out)
  if (result.err) console.error(result.err)
  process.exit(result.code)
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked !== '' && invoked === fileURLToPath(import.meta.url)) main()
