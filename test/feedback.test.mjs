/**
 * `feedback/` 回流收件箱的判据测试（台账 #23 末环；`skills/roadbook/bin/feedback.mjs`）。
 *
 * 两层断言，缺第二层就是装饰：
 *   - 正向：真仓收件箱判绿（0 条也是合法状态）、契约页与模板在两处逐字节相同；
 *   - **反向对照**：八类坏条目（缺字段 / 词表外 / landed 无落点 / 日期不同源 / 命名不合规 /
 *     缺小节 / 空小节 / 未知字段）各自**恰好红在它自己那一行**，同目录里的好条目不许被点名。
 *     没有反向对照，「判绿」退化成恒真的空函数也没人发现。
 *
 * 另一条钉住的是**模板与判据同源**：把 `TEMPLATE.md` 的占位符填成一条合规条目后，
 * 必须能被 `feedback.mjs` 自己的解析器读懂 —— 哪天判据加了必填字段而模板没跟，
 * 这条会红（模板是给人抄的，抄出来不合规 = 判据在坑人）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AXES, SECTIONS, STATUSES, parseEntry, readInbox, renderIndex, run } from '../skills/roadbook/bin/feedback.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CLI = path.join(ROOT, 'skills', 'roadbook', 'bin', 'feedback.mjs')
const INBOX = path.join(ROOT, 'feedback')
const TPL_INBOX = path.join(ROOT, 'template', 'feedback')
const CONTRACT = ['README.md', 'TEMPLATE.md']

function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' })
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
/** 一条合规条目（各字段可逐个替换，用来造「恰好一处不合规」的夹具）。 */
function entry({ date = '2026-10-07', slug = 'probe', axis = '判据', status = 'new', landing = '—', sections = SECTIONS, field = null } = {}) {
  const line = field ?? `> 日期：${date} ｜ 来源：母版会话@4384acc ｜ 轴：${axis} ｜ 状态：${status} ｜ 落点：${landing}`
  const body = sections
    .map((name) => `## ${name}\n\n${name === '命令与输出原文' ? '```\nnode -e "0"\n```' : `夹具内容：${name}`}`)
    .join('\n\n')
  return `# 反馈 · 夹具\n\n${line}\n\n${body}\n`
}
/** 临时收件箱：契约两页从真仓复制（保证夹具与真契约同源），条目按 name→正文 写进去。 */
function makeInbox(t, files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'roadbook-feedback-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const name of CONTRACT) copyFileSync(path.join(INBOX, name), path.join(dir, name))
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text, 'utf8')
  return dir
}

/* ── 正向：真仓判绿 ── */
test('A1 真仓收件箱判绿（`feedback.mjs` 默认 --check，退出码 0）', () => {
  const r = cli([])
  assert.equal(r.status, 0, `真仓应当判绿：${r.stdout}\n${r.stderr}`)
  assert.match(r.stdout, /^判绿：\d+ 条条目/, '判绿回执须带条目数与四态计数（只写"通过"= 读数不可信）')
})
test('A2 `--index` 与 `--write` 的同一条渲染口径（真仓空收件箱也渲染得出来）', (t) => {
  const dir = makeInbox(t)
  const written = cli(['--write', '--dir', dir])
  assert.equal(written.status, 0, written.stdout + written.stderr)
  const indexed = cli(['--index', '--dir', dir])
  assert.equal(indexed.status, 0, indexed.stdout + indexed.stderr)
  const onDisk = readFileSync(path.join(dir, 'INDEX.md'), 'utf8')
  // `console.log` 会再补一个换行 ⇒ stdout = 文件内容 + 1 个换行。差别写在明处，
  // 不拿 trim() 糊过去 —— 糊过去的话「写盘少了尾换行」这类真差异也会被一起吞掉。
  assert.equal(indexed.stdout, `${onDisk}\n`, '写盘内容与 --index 的 stdout 必须同源（两处渲染 = 第二处真相）')
  assert.match(onDisk, /收件箱为空/, '空收件箱渲染成一个显式句子，不是空表')
  assert.equal(renderIndex([]), renderIndex([]), '同一输入两次渲染必须逐字节相同')
})
test('A3 契约页与模板在母版与模板侧逐字节相同（单侧改 = 两份契约漂移）', () => {
  for (const name of CONTRACT) {
    assert.equal(sha256(path.join(INBOX, name)), sha256(path.join(TPL_INBOX, name)), `feedback/${name} 与 template/feedback/${name} 不同（契约出现第二处真相）`)
  }
})
test('A4 模板与判据同源：把 TEMPLATE.md 填成条目后必须判绿', () => {
  const template = readFileSync(path.join(INBOX, 'TEMPLATE.md'), 'utf8')
  const filled = template.replace(/YYYY-MM-DD/g, '2026-10-07').replace(/# 反馈 · .*/, '# 反馈 · 模板自检').replace(/^> 日期：2026-10-07/m, '> 日期：2026-10-07')
  const parsed = parseEntry(filled, '2026-10-07_template-selfcheck.md')
  assert.deepEqual(
    [parsed.axis, parsed.status],
    ['判据', 'new'],
    '模板的默认轴/状态必须落在词表内（词表改了而模板没跟 = 抄模板的人当场判红）',
  )
  assert.ok(AXES.includes(parsed.axis) && STATUSES.includes(parsed.status))
  for (const name of SECTIONS) assert.ok(filled.includes(`## ${name}`), `模板缺必填小节 ${name}`)
})
test('A5 BOM + CRLF 容忍（Windows 写文件必带 BOM 那条教训的直接回归）', (t) => {
  const dir = makeInbox(t, { '2026-10-07_bom.md': `\uFEFF${entry().replace(/\n/g, '\r\n')}` })
  const r = cli(['--check', '--dir', dir])
  assert.equal(r.status, 0, `带 BOM + CRLF 的合规条目应当判绿：${r.stdout}`)
})
test('A6 保留名不进计数：README/TEMPLATE 在位时只数条目文件', (t) => {
  const dir = makeInbox(t, { '2026-10-07_one.md': entry() })
  const r = cli(['--check', '--dir', dir])
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /判绿：1 条条目/)
})

/* ── 反向对照：八类坏条目恰好红在自己那一行 ── */
const GOOD = '2026-10-07_good.md'
const BAD_CASES = [
  ['缺字段行', '2026-10-07_no-field.md', '# 反馈 · x\n\n## 现象\n\n有\n\n## 命令与输出原文\n\n有\n\n## 期望\n\n有\n', '缺字段行'],
  ['状态不在词表', '2026-10-07_bad-status.md', entry({ slug: 'bad-status', status: 'done' }), '不在词表'],
  ['landed 无落点', '2026-10-07_landed-nolanding.md', entry({ slug: 'landed-nolanding', status: 'landed' }), 'landed 却没给落点'],
  ['日期不同源', '2026-10-07_date-mismatch.md', entry({ slug: 'date-mismatch', date: '2026-10-06' }), '与文件名日期'],
  ['命名不合规', 'badname.md', entry({ slug: 'badname' }), '命名不是'],
  ['缺必填小节', '2026-10-07_missing-section.md', entry({ slug: 'missing-section', sections: ['现象', '命令与输出原文'] }), 'missing-section.md：缺必填小节 `## 期望`'],
  ['空小节', '2026-10-07_empty-section.md', entry({ slug: 'empty-section' }).replace('夹具内容：现象', ''), '是空的'],
  ['未知字段', '2026-10-07_unknown-field.md', entry({ slug: 'unknown-field', field: '> 日期：2026-10-07 ｜ 来源：x@1a2b3c4 ｜ 轴：判据 ｜ 状态：new ｜ 落点：— ｜ 严重度：高' }), '未知字段'],
]
for (const [label, name, text, needle] of BAD_CASES) {
  test(`B ${label} → 判红且恰好点名该条`, (t) => {
    const dir = makeInbox(t, { [GOOD]: entry({ slug: 'good' }), [name]: text })
    const r = cli(['--check', '--dir', dir])
    assert.equal(r.status, 1, `${label} 应当判红：${r.stdout}`)
    assert.match(r.stdout, /^\[FAIL\] /m, '判红回执须逐条给 [FAIL] 行（只给汇总 = 找不到是哪一条）')
    assert.ok(r.stdout.includes(needle), `判红理由里应含 ${JSON.stringify(needle)}：\n${r.stdout}`)
    assert.ok(!r.stdout.includes(GOOD), `同目录里的好条目不许被点名：\n${r.stdout}`)
    assert.match(r.stdout, /判红：1 条不合规/)
  })
}
test('B9 目录不在位 / 保留文件缺失 → 判红（契约不在位时不许静默判绿）', (t) => {
  const missing = cli(['--check', '--dir', path.join(tmpdir(), 'roadbook-feedback-does-not-exist')])
  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /收件箱目录不在位/)
  const dir = makeInbox(t)
  rmSync(path.join(dir, 'TEMPLATE.md'))
  const noTemplate = cli(['--check', '--dir', dir])
  assert.equal(noTemplate.status, 1)
  assert.match(noTemplate.stdout, /TEMPLATE\.md：保留文件缺失/)
})
test('B10 判红时不渲染索引（带问题的索引会被当成事实读走）', (t) => {
  const dir = makeInbox(t, { '2026-10-07_bad.md': entry({ slug: 'bad', status: 'done' }) })
  const r = cli(['--index', '--dir', dir])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /索引未渲染/)
  assert.throws(() => readFileSync(path.join(dir, 'INDEX.md'), 'utf8'), '判红时不许留下 INDEX.md')
})

/* ── 纯函数层：排序口径与读侧一致性 ── */
test('C1 索引按日期倒序（新的在最上），同日按文件名升序', () => {
  const entries = [
    parseEntry(entry({ date: '2026-10-01', slug: 'old' }), '2026-10-01_old.md'),
    parseEntry(entry({ date: '2026-10-07', slug: 'b' }), '2026-10-07_b.md'),
    parseEntry(entry({ date: '2026-10-07', slug: 'a' }), '2026-10-07_a.md'),
  ]
  const body = renderIndex(entries).split('\n').filter((l) => l.startsWith('| 2026'))
  assert.deepEqual(body.map((l) => l.split('|')[6].trim()), ['`2026-10-07_a.md`', '`2026-10-07_b.md`', '`2026-10-01_old.md`'])
  const shuffled = renderIndex([entries[2], entries[0], entries[1]])
  assert.equal(renderIndex(entries), shuffled, '渲染结果不许依赖读目录的顺序')
})
test('C2 `run()` 与 CLI 同口径（退出码与回执不因调用方式而变）', (t) => {
  const dir = makeInbox(t, { '2026-10-07_one.md': entry({ slug: 'one', status: 'landed', landing: '4-1:88' }) })
  const r = run(['--check', '--dir', dir], ROOT)
  assert.equal(r.code, 0)
  assert.match(r.out, /landed 1/)
  assert.equal(readInbox(dir).problems.length, 0)
})
