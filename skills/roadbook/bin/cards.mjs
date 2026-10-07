/**
 * cards.mjs · 卡图 CLI —— 把 49 张卡从「散文里的顺序」变成一张可查询的图（只读）。
 *
 * 用法：
 *   node skills/roadbook/bin/cards.mjs --check [--json]        # 只读对账：磁盘 / STEPS / 白名单 / 数据文件
 *   node skills/roadbook/bin/cards.mjs --table [--json]        # 卡图：每张卡的分类、序号、点名了谁
 *   node skills/roadbook/bin/cards.mjs --frontier <文件> [--done id,id] [--json]
 *   node skills/roadbook/bin/cards.mjs --write                 # 重生成 skills/roadbook/data/cards.json
 *   node skills/roadbook/bin/cards.mjs --help
 *
 * 零依赖、不 spawn 子进程；只用 node:fs / node:path / node:url 读盘。
 *
 * ── 为什么要单独一个 CLI，而不是并进 route.mjs ──
 * 两者回答的是不同的问题，合并会把「一条链」与「图的形状」搅在一处：
 *   route.mjs   = **一条链 + 事实路由**：我下一步走哪张卡（面向执行者）
 *   cards.mjs   = **图的形状**：每张卡属于哪一类、进入条件点名了谁、这批能不能开工（面向调度）
 *
 * ── 与 _qc/check.ps1 的边界（防第三处真相）──
 * `_qc/check.ps1` 已经拥有这组同源断言：design §3 总图 / §4 线表 ↔ route.mjs ↔ START-HERE/SKILL/README。
 * cards.mjs **不重述那一组**——它只断言另外三条配对的同源关系：
 *   磁盘 playbook/ ↔ playbook_EN/   ·   磁盘 ↔ route.mjs 的两张表   ·   磁盘 ↔ data/cards.json
 * 两组断言共用 route.mjs 这个枢纽，但配对不同、落点不同，互不覆盖也互不打架。
 *
 * ── 退出码 ──
 *   0 = 对账判绿（--frontier 则是「算出了前沿且无环」）
 *   1 = 判红：双语缺份 / 认不出的文件名 / 幽灵引用（点名了不存在的卡）/ 图里有环 / 数据文件漂移
 *   2 = 用法错误
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STEPS, UNREACHABLE_OK, FACTS, CN_DIR, EN_DIR, scanDir } from './route.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..') // skills/roadbook/bin → 母版根
/** 生成物：本文件的 `--write` 是它唯一的写者，`--check` 逐字节比对防漂移。 */
export const DATA_PATH = join(ROOT, 'skills', 'roadbook', 'data', 'cards.json')
export const SCHEMA = 'roadbook-cards/1'
const EXIT = { ok: 0, red: 1, usage: 2 }

/**
 * 三个词取代原来的一个词。
 *
 * 2026-10-07 实测：`design/v6-design.md:171` 把 15 张卡统称「横向卡（不占主线，随时可插入）」，
 * 而其中 9 张其实**在 `STEPS` 里、由事实驱动**（主线节点，只是条件触发），只有 6 张真在
 * `UNREACHABLE_OK` 白名单里按需插入。同一个词一半指主线、一半指插队，人和 agent 都会读错。
 * 拆成三个词之后，每一类都**由结构判定**，不再靠谁记得：
 *   chain  = 在 `STEPS` 里且**任何**事实组合下都会走到（主线必走）
 *   fact   = 在 `STEPS` 里但只在部分事实组合下走到（事实驱动）
 *   demand = 只在 `UNREACHABLE_OK` 里（按需插入，不占事实链）
 */
export const CLASS_WORD = { chain: '主线必走', fact: '事实驱动', demand: '按需插入' }
export const CLASSES = ['chain', 'fact', 'demand']

/* ───────────────────────── 事实域：把「任何事实组合」变成可枚举 ───────────────────────── */

/** 每个事实的取值域：enum 取枚举值，bool 取真假，其余取默认值。 */
export function domainOf(fact) {
  if (fact.type === 'enum') return fact.values
  if (fact.type === 'bool') return [true, false]
  return [fact.def]
}

/**
 * 穷举全部事实组合。
 *
 * 为什么要穷举而不是「拿默认事实跑一遍」：`when: () => true` 与 `when: (f) => f.hasUI === true`
 * 在默认事实（`hasUI` 默认 true）下都会返回 true——用默认值判「主线必走」会把事实驱动的卡
 * 误判成主线。12 个事实的域只有 2^10 × 5 = 5120 组，穷举的代价可以忽略，换来的是**判定可证伪**。
 */
export function factCombos(facts, index = 0, acc = {}) {
  if (index === facts.length) return [{ ...acc }]
  const fact = facts[index]
  const out = []
  for (const value of domainOf(fact)) out.push(...factCombos(facts, index + 1, { ...acc, [fact.key]: value }))
  return out
}

/** 在给定事实域上恒真的 `STEPS` 条目 = 主线必走。谓词抛错按「非恒真」处理（不吞错，见 check）。 */
export function alwaysCards(steps, combos) {
  const out = new Set()
  for (const step of steps) {
    let always = true
    for (const facts of combos) {
      let hit = false
      try { hit = step.when(facts) === true } catch { hit = false }
      if (!hit) { always = false; break }
    }
    if (always) out.add(step.card)
  }
  return out
}

/** 分类：结构判定，不读任何手写清单。 */
export function classOf(cardId, stepsIds, whitelist, always) {
  if (stepsIds.has(cardId)) return always.has(cardId) ? 'chain' : 'fact'
  if (whitelist.includes(cardId)) return 'demand'
  return null
}

/* ───────────────────────── 点名关系：进入条件里提到的其它卡 ───────────────────────── */

/** 卡号：两段都可多位数字（与 route.mjs 的 ID_RE 同一口径，`7-10` 不许被截成 `7-1`）。 */
const CARD_REF_RE = /(?<![\d-])(\d+-\d+)(?![\d-])/g

/** 触发行是**一行三格**：`> 触发：… ｜ 产物：… ｜ 下一张：…`。只取「触发」那一格。 */
export function entryClauseOf(triggerLine) {
  const body = String(triggerLine ?? '').replace(/^\s*>\s*/, '')
  const parts = body.split(/[｜|]/).map((s) => s.trim())
  return parts.find((s) => /^(触发|Trigger)\s*[:：]/.test(s)) ?? body
}

/**
 * 进入条件里点名了哪些卡（= 前置关系）。
 *
 * 三处都不能省，任何一处偷懒都会把图算错：
 *  ① **只取「触发」那一格**：同一行的「下一张：… 1-2 选型初始化」也带卡号，混进来会把**后继**
 *     当成**前置**——2026-10-07 本工具第一版就是这么写的，结果 49 张卡里有 27 张凭空多出箭头，
 *     连「顺序自相矛盾」这条观测都被撑成噪声（每张卡都在点名排在后面的卡）。**在同一行上分格，
 *     不是分词**：`触发 / 产物 / 下一张` 三格的语义完全不同，而排版把它们放在了一行。
 *  ② **不取 H1**：H1 里那张卡是自己（`# 卡 4-3 · 验证…`），混进来只会制造自环噪声。
 *  ③ 排除自己：`4-3` 的触发行里写着「…直接进 4-3（跳过 4-2）」，那是自指不是前置。
 */
export function referencesOf(triggerLine, selfId) {
  const out = new Set()
  for (const m of entryClauseOf(triggerLine).matchAll(CARD_REF_RE)) {
    if (m[1] !== selfId) out.add(m[1])
  }
  return [...out].sort(compareIds)
}

/** 卡号排序：阶段号升序，同阶段内序号按数值升序（`1-10` 要排在 `1-2` 之后）。 */
export function compareIds(a, b) {
  const [as, an] = a.split('-').map(Number)
  const [bs, bn] = b.split('-').map(Number)
  return as - bs || an - bn
}

/* ───────────────────────── 建图 ───────────────────────── */

export function buildModel({ cn, en, steps = STEPS, whitelist = UNREACHABLE_OK, facts = FACTS }) {
  const combos = factCombos(facts)
  const always = alwaysCards(steps, combos)
  const stepsIds = new Set(steps.map((s) => s.card))
  const order = new Map(steps.map((s, i) => [s.card, i]))
  const ids = [...cn.keys()].sort(compareIds)
  const cards = ids.map((id) => {
    const card = cn.get(id)
    const klass = classOf(id, stepsIds, whitelist, always)
    const refs = referencesOf(card.trigger, id)
    return {
      id,
      stage: id.split('-')[0],
      class: klass,
      order: order.has(id) ? order.get(id) : null,
      refs,
      h1: card.h1,
      bilingual: en.has(id),
    }
  })
  return {
    cards, stepsIds, whitelist, order, combos: combos.length,
    counts: CLASSES.reduce((acc, k) => ({ ...acc, [k]: cards.filter((c) => c.class === k).length }), { total: cards.length }),
  }
}

/* ───────────────────────── 对账 ───────────────────────── */

/**
 * 三条配对关系的同源断言（见文件头「边界」）。
 * 返回 `problems`（判红）与 `observations`（登记，不判红——判据是「已知且带到期条件」，不是「不存在」）。
 */
export function checkModel(model, { cn, en, steps = STEPS, whitelist = UNREACHABLE_OK, artifact = null } = {}) {
  const problems = []
  const observations = []
  const { cards, stepsIds, order } = model

  for (const file of cn.unparsed ?? []) problems.push(`认不出的卡文件名：playbook/${file}（卡号须形如 <阶段>-<序号>-<名字>.md，两段都可多位数字）`)
  for (const file of en.unparsed ?? []) problems.push(`认不出的卡文件名：playbook_EN/${file}（同上）`)
  for (const id of cn.keys()) if (!en.has(id)) problems.push(`双语缺份：playbook/${id} 有，playbook_EN/ 没有`)
  for (const id of en.keys()) if (!cn.has(id)) problems.push(`双语缺份：playbook_EN/${id} 有，playbook/ 没有`)

  const stepIds = steps.map((s) => s.card)
  const dup = [...new Set(stepIds.filter((x, i) => stepIds.indexOf(x) !== i))]
  if (dup.length) problems.push(`STEPS 里有重复卡：${dup.join(', ')}`)
  const both = stepIds.filter((id) => whitelist.includes(id))
  if (both.length) problems.push(`同一张卡同时在 STEPS 与 UNREACHABLE_OK 里（两张表必须互斥）：${both.join(', ')}`)

  const routed = new Set([...stepIds, ...whitelist])
  for (const id of cards) {
    if (!routed.has(id.id)) problems.push(`不可达卡：${id.id} 既不在任何进入条件里，也不在 UNREACHABLE_OK 白名单里——路由永远到不了它`)
    if (id.class === null) problems.push(`分类缺失：${id.id} 既不在 STEPS 也不在白名单里（分类由结构判定，落到 null 就是上面那条不可达）`)
    if (!id.bilingual) problems.push(`双语缺份：playbook/${id.id} 有，playbook_EN/ 没有`)
    const h1 = /^# 卡 (\d+-\d+) ·/.exec(id.h1 ?? '')
    if (!h1) problems.push(`H1 形态不符：playbook/${id.id} 的 H1 应形如「# 卡 ${id.id} · …」，实际「${(id.h1 ?? '').slice(0, 60)}」`)
    else if (h1[1] !== id.id) problems.push(`H1 卡号与文件名不符：文件是 ${id.id}，H1 写的是 ${h1[1]}`)
    for (const ref of id.refs) {
      if (!cn.has(ref)) problems.push(`幽灵引用：卡 ${id.id} 的进入条件点名了 ${ref}，playbook/ 里没有这张卡`)
      else if (order.has(ref) && id.order !== null && order.get(ref) > id.order) {
        observations.push(`顺序自相矛盾：卡 ${id.id}（第 ${id.order + 1} 位）的进入条件点名了排在它后面的 ${ref}（第 ${order.get(ref) + 1} 位）——要么是「之后」被写成了「依赖」，要么是顺序载体该改`)
      }
    }
  }
  for (const id of whitelist) if (!cn.has(id)) problems.push(`白名单幽灵：UNREACHABLE_OK 里的 ${id} 在 playbook/ 不存在`)
  for (const id of stepIds) if (!cn.has(id)) problems.push(`幽灵引用：STEPS 里的 ${id} 在 playbook/ 不存在`)

  if (artifact !== null && serializeModel(model) !== artifact) {
    problems.push(`数据文件漂移：skills/roadbook/data/cards.json 与重建结果不一致——跑 \`node skills/roadbook/bin/cards.mjs --write\` 重生成（它是生成物，手改必被打回）`)
  }
  return { problems, observations }
}

/* ───────────────────────── 生成物 ───────────────────────── */

/** 逐字节确定的序列化：同一份磁盘两次运行结果相同（供 --check 与回执 diff）。 */
export function serializeModel(model) {
  const payload = {
    schema: SCHEMA,
    note: '本文件由 `node skills/roadbook/bin/cards.mjs --write` 生成，不要手改；--check 会逐字节比对。',
    counts: model.counts,
    cards: model.cards.map((c) => ({ id: c.id, stage: c.stage, class: c.class, order: c.order, refs: c.refs })),
  }
  return JSON.stringify(payload, null, 2) + '\n'
}

/* ───────────────────────── 依赖表 → 前沿 ───────────────────────── */

const NONE_RE = /^(无|没有|—|–|－|-|n\/?a|不依赖)$/i
const ALL_RE = /^(全部|所有|all)$/i
const ALL = '*'
const SEP_RE = /[；;、，,/]/

/**
 * 标识列的表头决定「裸数字」是什么意思——`批` 列的 `0` 是 `批0`，而 SCOPE.md 的 `片` 列里 `0` 就是一个片号。
 * 依赖单元格必须用**同一个**归一化器，否则 `1` 依赖 `批 0` 会被算成两条互不相干的 id（实测踩过）。
 */
export function makeNormalizer(headerText) {
  const header = String(headerText ?? '').replace(/[`*\s]/g, '')
  const isBatch = /^批/.test(header)
  return (token) => {
    const text = String(token ?? '').replace(/[`*]/g, '').trim()
    const batch = /^批\s*(\d+)$/.exec(text)
    if (batch) return `批${batch[1]}`
    if (isBatch && /^\d+$/.test(text)) return `批${text}`
    return text
  }
}

/** 合法依赖 id 的两种形状：`批N` 或 `卡号`。其余一律是散文，判红。 */
export function isRefId(value) {
  return /^批\d+$/.test(value) || /^\d+-\d+$/.test(value)
}

/**
 * 一个依赖单元格 → 依赖 id 列表。
 *
 * **本函数故意严格**：只认「无」标记、`批 N`、`卡号`、`全部` 四类写法；出现散文一律进 `bad`
 * 并由此判红。理由：#38 第 1 步要的正是「把依赖**结构化**」——如果解析器对「批 0；**A1 硬门禁
 * （真机）**」这种混写睁一只眼闭一只眼，那结构化就永远做不完，而工具会一直报绿。
 */
export function depsFromCell(cell, normalize = makeNormalizer('')) {
  const raw = String(cell ?? '').trim()
  if (raw === '' || NONE_RE.test(raw)) return { deps: [], bad: [] }
  const deps = []
  const bad = []
  for (const part of raw.split(SEP_RE)) {
    const token = part.replace(/[`*]/g, '').trim()
    if (token === '' || NONE_RE.test(token)) continue
    if (ALL_RE.test(token)) { deps.push(ALL); continue }
    const ref = normalize(token)
    if (isRefId(ref)) deps.push(ref)
    else bad.push(token)
  }
  return { deps, bad }
}

/** 表格标识单元格 → id：`批 0` / `批` 列里的 `0` → `批0`；`4-3-分批编码` → `4-3`。 */
export function idFromCell(cell, normalize = makeNormalizer('')) {
  const token = normalize(cell)
  if (isRefId(token)) return token
  const card = /(\d+-\d+)/.exec(token)
  return card ? card[1] : token
}

/**
 * 解析 markdown 里的依赖表：表头必须有一列依赖（`依赖` / `depends`），另有一列标识（`批`/`片`/`项`/`卡`/`id`）。
 * 返回 { headers, rows, idIndex, depIndex, problems }。
 */
export function parseDepTable(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const tables = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) continue
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue
    const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    const headers = cells(lines[i])
    const rows = []
    let j = i + 2
    for (; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j += 1) rows.push(cells(lines[j]))
    tables.push({ headers, rows, line: i + 1 })
    i = j - 1
  }
  const pick = tables.findIndex((t) => t.headers.some((h) => /依赖|depends/i.test(h)))
  if (pick < 0) return { problems: ['找不到依赖表：表头里必须有一列写「依赖」或「depends」'], tables: tables.length }
  const table = tables[pick]
  const depIndex = table.headers.findIndex((h) => /依赖|depends/i.test(h))
  const idIndex = table.headers.findIndex((h) => /^(批|片|项|卡|单元|任务|id)$/i.test(h.replace(/[`*\s]/g, '')))
  if (idIndex < 0) return { problems: ['依赖表缺标识列：表头需有「批 / 片 / 项 / 卡 / 单元 / 任务 / id」之一'], tables: tables.length }
  const normalize = makeNormalizer(table.headers[idIndex])
  const problems = []
  const rows = []
  table.rows.forEach((cells, offset) => {
    const lineNo = table.line + 2 + offset // 表头行 + 分隔行之后
    const id = idFromCell(cells[idIndex], normalize)
    const { deps, bad } = depsFromCell(cells[depIndex], normalize)
    for (const token of bad) problems.push(`第 ${lineNo} 行：${id} 的依赖单元格写着「${token}」——不是「无」/「批 N」/「卡号」/「全部」，先把它结构化`)
    rows.push({ id, deps, line: lineNo })
  })
  return { headers: table.headers, rows, idIndex, depIndex, line: table.line, tables: tables.length, problems }
}

/**
 * 算可开工前沿。
 *
 * `done` 之外的条目里，依赖**全部**已完成的即前沿。成环 → `cycle` 给出环上的一条路径（判红依据）。
 * 依赖指向表里不存在的 id → `unknown`（判红：依赖没了主 = 永远开不了工，且不会有任何报错）。
 */
export function frontierOf(rows, done = []) {
  const doneSet = new Set(done)
  const ids = rows.map((r) => r.id)
  const idSet = new Set(ids)
  const unknown = []
  const depsOf = new Map()
  for (const row of rows) {
    const deps = new Set()
    for (const dep of row.deps) {
      if (dep === ALL) { for (const other of ids) if (other !== row.id) deps.add(other) }
      else if (!idSet.has(dep)) unknown.push(`${row.id} 依赖 ${dep}，而表里没有 ${dep} 这一行`)
      else deps.add(dep)
    }
    depsOf.set(row.id, deps)
  }
  const ready = []
  const blocked = []
  for (const id of ids) {
    if (doneSet.has(id)) continue
    const missing = [...depsOf.get(id)].filter((dep) => !doneSet.has(dep))
    if (missing.length === 0) ready.push(id)
    else blocked.push({ id, missing: missing.sort(compareIds) })
  }
  const cycle = findCycle(ids, depsOf, doneSet)
  return { ready, blocked, unknown, cycle, done: [...doneSet] }
}

/** Kahn 剥叶：剥不动 = 有环，再沿剩余节点走一条路径把环点名（不点名就等于没说）。 */
function findCycle(ids, depsOf, doneSet) {
  const alive = new Set(ids.filter((id) => !doneSet.has(id)))
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...alive]) {
      const deps = [...depsOf.get(id)].filter((dep) => alive.has(dep))
      if (deps.length === 0) { alive.delete(id); changed = true }
    }
  }
  if (alive.size === 0) return null
  const start = [...alive].sort(compareIds)[0]
  const path = []
  const seen = new Set()
  let cursor = start
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    path.push(cursor)
    const next = [...depsOf.get(cursor)].filter((dep) => alive.has(dep)).sort(compareIds)[0]
    cursor = next
  }
  return { cards: path, backTo: cursor ?? null }
}

/* ───────────────────────── 输出 ───────────────────────── */

function usage() {
  return [
    'cards.mjs · 卡图 CLI（只读；唯一的写模式是 --write 重生成自己的数据文件）',
    '',
    '  node skills/roadbook/bin/cards.mjs --check [--json]',
    '  node skills/roadbook/bin/cards.mjs --table [--json]',
    '  node skills/roadbook/bin/cards.mjs --frontier <文件> [--done id,id] [--json]',
    '  node skills/roadbook/bin/cards.mjs --write',
    '',
    '退出码：0 判绿 / 1 判红 / 2 用法错误',
  ].join('\n')
}

function loadModel() {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  return { cn, en, model: buildModel({ cn, en }) }
}

function fmtTable(model) {
  const out = [`卡图：${model.cards.length} 张（分类由结构判定，不读手写清单）`]
  out.push(`  ${CLASSES.map((k) => `${CLASS_WORD[k]} ${model.counts[k]}`).join(' · ')} · 事实组合 ${model.combos} 组`)
  for (const c of model.cards) {
    const order = c.order === null ? '  —' : String(c.order + 1).padStart(3, ' ')
    out.push(`  ${c.id.padEnd(5)} ${CLASS_WORD[c.class] ?? '未分类'}  第${order}位  点名 ${c.refs.join(', ') || '—'}`)
  }
  return out.join('\n')
}

function runCheck(opts) {
  const { cn, en, model } = loadModel()
  const artifact = existsSync(DATA_PATH) ? readFileSync(DATA_PATH, 'utf8') : null
  const { problems, observations } = checkModel(model, { cn, en, artifact })
  if (opts.json) {
    console.log(JSON.stringify({ schema: SCHEMA, mode: 'check', counts: model.counts, problems, observations }, null, 2))
  } else {
    console.log('卡图对账回执')
    console.log(`playbook/ ${cn.size} 张 · playbook_EN/ ${en.size} 张 · ${CLASSES.map((k) => `${CLASS_WORD[k]} ${model.counts[k]}`).join(' · ')}`)
    console.log(problems.length ? `判红 ${problems.length} 条：` : '判绿：双语逐张对齐，H1 形态合规，两张路由表与磁盘逐张一致，数据文件不漂移。')
    for (const p of problems) console.log(`  ✗ ${p}`)
    if (observations.length) {
      console.log(`登记 ${observations.length} 条（不判红；到期条件见 design/vnext-2026-10-07.md 台账 #32——卡文本在批 6 改）：`)
      for (const o of observations) console.log(`  · ${o}`)
    }
  }
  process.exit(problems.length ? EXIT.red : EXIT.ok)
}

function runFrontier(opts) {
  if (!opts.frontierFile) { console.error('用法错误：--frontier 需要给一个 markdown 文件路径'); process.exit(EXIT.usage) }
  if (!existsSync(opts.frontierFile)) { console.error(`用法错误：文件不存在 ${opts.frontierFile}`); process.exit(EXIT.usage) }
  const parsed = parseDepTable(readFileSync(opts.frontierFile, 'utf8'))
  if (parsed.problems.length) {
    console.log(`依赖表不可解析（${parsed.problems.length} 条）：`)
    for (const p of parsed.problems) console.log(`  ✗ ${p}`)
    process.exit(EXIT.red)
  }
  const result = frontierOf(parsed.rows, opts.done)
  if (opts.json) {
    console.log(JSON.stringify({ schema: SCHEMA, mode: 'frontier', file: opts.frontierFile, ...result }, null, 2))
  } else {
    console.log(`可开工前沿（表 ${parsed.rows.length} 行，已完成 ${result.done.length} 个）`)
    console.log(`  可开工：${result.ready.join(', ') || '（无）'}`)
    console.log(`  被挡住：${result.blocked.map((b) => `${b.id}（等 ${b.missing.join('/')}）`).join(' · ') || '（无）'}`)
    if (result.cycle) console.log(`  ✗ 成环：${[...result.cycle.cards, result.cycle.backTo].filter(Boolean).join(' → ')}`)
    for (const u of result.unknown) console.log(`  ✗ ${u}`)
  }
  process.exit(result.cycle || result.unknown.length ? EXIT.red : EXIT.ok)
}

function runWrite() {
  const { model } = loadModel()
  mkdirSync(dirname(DATA_PATH), { recursive: true })
  writeFileSync(DATA_PATH, serializeModel(model), 'utf8')
  console.log(`已生成 ${DATA_PATH}（${model.cards.length} 张卡）`)
}

export function parseArgs(argv) {
  const opts = { mode: 'table', json: false, done: [], frontierFile: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check') opts.mode = 'check'
    else if (arg === '--table') opts.mode = 'table'
    else if (arg === '--write') opts.mode = 'write'
    else if (arg === '--frontier') { opts.mode = 'frontier'; opts.frontierFile = argv[++i] ?? '' }
    else if (arg === '--done') opts.done = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (arg === '--json') opts.json = true
    else if (arg === '--help' || arg === '-h') opts.mode = 'help'
    else throw new Error(`用法错误：不认识的参数 ${arg}`)
  }
  return opts
}

function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (err) { console.error(err.message); process.exit(EXIT.usage) }
  if (opts.mode === 'help') { console.log(usage()); return }
  if (opts.mode === 'check') { runCheck(opts); return }
  if (opts.mode === 'frontier') { runFrontier(opts); return }
  if (opts.mode === 'write') { runWrite(); return }
  const { model } = loadModel()
  console.log(opts.json ? JSON.stringify({ schema: SCHEMA, mode: 'table', counts: model.counts, cards: model.cards.map((c) => ({ id: c.id, class: c.class, order: c.order, refs: c.refs })) }, null, 2) : fmtTable(model))
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked !== '' && invoked === fileURLToPath(import.meta.url)) main()
