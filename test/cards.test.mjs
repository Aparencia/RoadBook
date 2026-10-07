/**
 * 卡图 CLI（`skills/roadbook/bin/cards.mjs`）的行为与属性测试。
 *
 * 断言分两类，缺第二类就是装饰：
 *   - 正向：当前仓库的卡图必须对账判绿、分类必须成划分、数据文件必须不漂移；
 *   - **反向对照**：故意构造坏输入（成环 / 幽灵依赖 / 散文依赖 / 谓词抛错 / 后继混进前置），
 *     工具必须**恰好**报出那一条。没有反向对照，`--check` 退化成恒真的空函数也没人发现。
 *
 * 属性测试用**定种子**的伪随机图（失败可复现），不写"跑一百次随便试试"。
 *
 * 冻结的账本（分类计数、观测条数）是提示器不是锁：卡文本或 route.mjs 一变它就该红，
 * 红了按失败信息走——那是**本批故意的**，不是脆弱测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLASSES, CLASS_WORD, DATA_PATH, alwaysCards, buildModel, checkModel, classOf, compareIds,
  depsFromCell, entryClauseOf, factCombos, frontierOf, idFromCell, makeNormalizer, parseDepTable,
  referencesOf, serializeModel,
} from '../skills/roadbook/bin/cards.mjs'
import { CN_DIR, EN_DIR, STEPS, UNREACHABLE_OK, scanDir } from '../skills/roadbook/bin/route.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CLI = path.join(ROOT, 'skills', 'roadbook', 'bin', 'cards.mjs')

function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' })
}

/** 真仓的卡图（本文件里所有"正向"断言的共同底料）。 */
function realModel() {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  return { cn, en, model: buildModel({ cn, en }) }
}

/** 定种子伪随机：同一种子必得同一张图，红了能原样复现。 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 随机 DAG：第 i 行只依赖下标更小的行 ⇒ 一定无环。 */
function randomDag(seed, n) {
  const rnd = rng(seed)
  return Array.from({ length: n }, (_, i) => ({
    id: `项${i}`,
    deps: Array.from({ length: i }, (_, j) => j).filter(() => rnd() < 0.3).map((j) => `项${j}`),
  }))
}

function withTempFile(text, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'roadbook-cards-'))
  try {
    const file = path.join(dir, 'deps.md')
    writeFileSync(file, text, 'utf8')
    return fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/* ───────────────────────── 正向：当前仓库 ───────────────────────── */

test('真仓卡图对账判绿（双语 / H1 / 两张路由表 / 数据文件四条配对关系）', () => {
  const { cn, en, model } = realModel()
  const artifact = existsSync(DATA_PATH) ? readFileSync(DATA_PATH, 'utf8') : null
  assert.ok(artifact !== null, `${DATA_PATH} 不存在——跑 node skills/roadbook/bin/cards.mjs --write`)
  const { problems } = checkModel(model, { cn, en, artifact })
  assert.deepEqual(problems, [])
})

test('分类是划分：三类互斥、并集 = 磁盘 49 张、每类都非空', () => {
  const { model } = realModel()
  assert.equal(model.cards.length, 49)
  assert.deepEqual(Object.keys(model.counts).sort(), ['chain', 'demand', 'fact', 'total'])
  assert.equal(model.counts.chain + model.counts.fact + model.counts.demand, model.counts.total)
  for (const klass of CLASSES) assert.ok(model.counts[klass] > 0, `${CLASS_WORD[klass]} 一张都没有 = 分类退化`)
  for (const card of model.cards) assert.ok(CLASSES.includes(card.class), `${card.id} 分类是 ${card.class}`)
})

test('冻结账本：49 = 主线必走 5 + 事实驱动 28 + 按需插入 16', () => {
  const { model } = realModel()
  assert.deepEqual(model.counts, { total: 49, chain: 5, fact: 28, demand: 16 })
  assert.deepEqual(model.cards.filter((c) => c.class === 'chain').map((c) => c.id).sort(compareIds),
    ['2-1', '2-2', '4-1', '4-3', '5-1'])
})

test('数据文件不漂移：serializeModel 与磁盘上的 cards.json 逐字节相同', () => {
  const { model } = realModel()
  assert.equal(serializeModel(model), readFileSync(DATA_PATH, 'utf8'))
})

/**
 * 「横向卡」一词的分叉被这条断言钉住（台账 #33）：旧词把 15 张卡混成一类，
 * 真结构是 9 张在 STEPS 里（事实驱动）+ 6 张在白名单里（按需插入）。
 */
test('台账 #33：旧词「横向卡」指向的 15 张卡，现在落在两个不同的分类里', () => {
  const { model } = realModel()
  const byId = new Map(model.cards.map((c) => [c.id, c]))
  const inSteps = ['4-4', '4-5', '5-5', '5-6', '5-7', '7-5', '7-6', '7-7', '7-9']
  const onDemand = ['0-2', '6-8', '7-1', '7-2', '7-3', '7-4']
  for (const id of inSteps) assert.equal(byId.get(id).class, 'fact', `${id} 应在 STEPS 里、归事实驱动`)
  for (const id of onDemand) assert.equal(byId.get(id).class, 'demand', `${id} 应只在白名单里、归按需插入`)
})

/**
 * 台账 #32 的机械报出：`3-3` 的进入条件里写着「界面线 3-4~3-6 排在本卡之后」——
 * 「之后」被写进了「依赖」那一格，于是卡图上是两条反向箭头。卡文本在批 6 改；
 * 本条断言把**当前**这 3 条观测钉死：改完卡文本它会红，逼着同批把这里也改掉。
 */
test('台账 #32：顺序自相矛盾恰好这 3 条（卡文本改完即应改本条）', () => {
  const { cn, en, model } = realModel()
  const { observations } = checkModel(model, { cn, en, artifact: serializeModel(model) })
  const pairs = observations.map((o) => /卡 (\d+-\d+)（第 \d+ 位）的进入条件点名了排在它后面的 (\d+-\d+)/.exec(o))
  assert.ok(pairs.every(Boolean), `观测文本形态变了，解析不到：${observations.join(' / ')}`)
  assert.deepEqual(pairs.map((m) => `${m[1]}->${m[2]}`), ['3-3->3-4', '3-3->3-6', '4-2->4-3'])
})

/* ───────────────────────── 反向对照：分类判定 ───────────────────────── */

const SYNTH_FACTS = [
  { key: 'a', type: 'bool', def: false },
  { key: 'b', type: 'enum', values: ['x', 'y', 'z'], def: 'x' },
]

test('事实域穷举：域大小 = 各事实取值之积（bool 取真假、enum 取枚举）', () => {
  assert.equal(factCombos(SYNTH_FACTS).length, 6)
})

test('恒真判定既健全又完备：判进 chain 的处处为真，判不进的必有反例', () => {
  const steps = [
    { card: '1-1', when: () => true },
    { card: '1-2', when: (f) => f.a === true },
    { card: '1-3', when: (f) => f.b === 'z' },
    { card: '1-4', when: () => { throw new Error('谓词本身炸了') } },
  ]
  const combos = factCombos(SYNTH_FACTS)
  const always = alwaysCards(steps, combos)
  assert.deepEqual([...always].sort(compareIds), ['1-1'], '谓词抛错不许被当成恒真（否则它会静默挤进主线）')
  for (const step of steps) {
    const counterExample = combos.some((f) => { try { return step.when(f) !== true } catch { return true } })
    assert.equal(counterExample, !always.has(step.card), `${step.card} 的恒真判定与穷举结果不符`)
  }
})

test('分类由结构判定：STEPS 里恒真→主线必走、STEPS 里条件→事实驱动、白名单→按需插入、都不在→null', () => {
  const always = new Set(['1-1'])
  const stepsIds = new Set(['1-1', '1-2'])
  assert.equal(classOf('1-1', stepsIds, ['1-9'], always), 'chain')
  assert.equal(classOf('1-2', stepsIds, ['1-9'], always), 'fact')
  assert.equal(classOf('1-9', stepsIds, ['1-9'], always), 'demand')
  assert.equal(classOf('2-9', stepsIds, ['1-9'], always), null, '落到 null 就是"路由永远到不了它"')
})

/* ───────────────────────── 反向对照：点名关系 ───────────────────────── */

test('触发行分三格：后继（下一张）不许混进前置', () => {
  const line = '> 触发：2-1 功能调研的方案获用户批准后 ｜ 产物：SCOPE.md ｜ 下一张：2-4 非功能需求；S 档 → 4-1 分批编码'
  assert.equal(entryClauseOf(line), '触发：2-1 功能调研的方案获用户批准后')
  assert.deepEqual(referencesOf(line, '2-2'), ['2-1'], '4-1 是后继，出现在图里就是反向箭头')
})

test('点名关系排除自己，且卡号按数值排序（7-10 不许被截成 7-1）', () => {
  const line = '> 触发：4-1 绿灯后直接进 4-3（跳过 4-2）；7-10 迁移完 → 7-2 复跑 ｜ 下一张：5-1 归档'
  assert.deepEqual(referencesOf(line, '4-3'), ['4-1', '4-2', '7-2', '7-10'])
  // 序号按**数值**比，不按字典序：`7-2` 在 `7-10` 之前（字典序会把 7-10 排到 7-2 前面）
  assert.ok(compareIds('7-2', '7-10') < 0, 'compareIds 必须按数值，不按字典序')
  assert.ok(compareIds('1-3', '2-1') < 0, '先比阶段号')
})

test('无「触发」格时退回整行（不静默丢空）', () => {
  assert.deepEqual(referencesOf('> 触发：3-4 定稿后', '3-5'), ['3-4'])
  assert.equal(entryClauseOf('3-4 定稿后'), '3-4 定稿后')
})

/* ───────────────────────── 反向对照：依赖表与前沿 ───────────────────────── */

test('依赖单元格只认四种写法；散文一律判红并点名原文', () => {
  const norm = makeNormalizer('批')
  assert.deepEqual(depsFromCell('—', norm), { deps: [], bad: [] })
  assert.deepEqual(depsFromCell('无', norm), { deps: [], bad: [] })
  assert.deepEqual(depsFromCell('全部', norm), { deps: ['*'], bad: [] })
  assert.deepEqual(depsFromCell('批 0、批 2', norm), { deps: ['批0', '批2'], bad: [] })
  assert.deepEqual(depsFromCell('2-2、2-4', norm), { deps: ['2-2', '2-4'], bad: [] })
  const mixed = depsFromCell('批 0；**A1 硬门禁（真机）**', norm)
  assert.deepEqual(mixed.deps, ['批0'])
  assert.deepEqual(mixed.bad, ['A1 硬门禁（真机）'], '散文混写必须被抓住，否则"把依赖结构化"永远做不完')
})

test('归一化一致性：`批` 列里的裸数字与「批 N」是同一个 id（实测踩过的坑）', () => {
  const norm = makeNormalizer('批')
  assert.equal(idFromCell('0', norm), '批0')
  assert.equal(idFromCell('批 0', norm), '批0')
  assert.deepEqual(depsFromCell('0', norm).deps, ['批0'], '依赖格与标识格必须用同一个归一化器')
  const cardNorm = makeNormalizer('片号')
  assert.equal(idFromCell('0', cardNorm), '0', '非「批」列不许把裸数字改写成批号')
})

test('表格解析：找不到依赖表 / 缺标识列 都判红，不静默返回空图', () => {
  assert.match(parseDepTable('# 没有表格\n').problems[0], /找不到依赖表/)
  const noId = '| 名字 | 依赖 |\n| :-: | :-: |\n| 甲 | 无 |\n'
  assert.match(parseDepTable(noId).problems[0], /缺标识列/)
})

test('前沿：链式图只放出第一行；全部完成则前沿为空', () => {
  const rows = [
    { id: '项0', deps: [] },
    { id: '项1', deps: ['项0'] },
    { id: '项2', deps: ['项1'] },
  ]
  const first = frontierOf(rows)
  assert.deepEqual(first.ready, ['项0'])
  assert.deepEqual(first.blocked.map((b) => b.id), ['项1', '项2'])
  assert.equal(first.cycle, null)
  const all = frontierOf(rows, ['项0', '项1', '项2'])
  assert.deepEqual(all.ready, [])
  assert.deepEqual(all.blocked, [])
})

test('前沿：成环判红且点名环上的一条路径（不点名等于没说）', () => {
  const rows = [
    { id: '项0', deps: ['项2'] },
    { id: '项1', deps: ['项0'] },
    { id: '项2', deps: ['项1'] },
  ]
  const res = frontierOf(rows)
  assert.ok(res.cycle, '三行互指必须报环')
  assert.ok(res.cycle.cards.length >= 2, `环上至少两个节点，实得 ${JSON.stringify(res.cycle)}`)
  assert.ok(res.cycle.cards.includes(res.cycle.backTo), '环的收口节点必须在路径里')
  assert.deepEqual(res.ready, [], '有环时不许同时报出可开工项（那会让人照常开工）')
})

test('前沿：依赖指向表里没有的 id 判红（依赖没了主 = 永远开不了工且毫无报错）', () => {
  const res = frontierOf([{ id: '项0', deps: ['项9'] }])
  assert.deepEqual(res.unknown, ['项0 依赖 项9，而表里没有 项9 这一行'])
})

test('前沿：`全部` 哨兵 = 除自己以外所有行', () => {
  const rows = [{ id: '项0', deps: [] }, { id: '项1', deps: ['*'] }]
  assert.deepEqual(frontierOf(rows).ready, ['项0'])
  assert.deepEqual(frontierOf(rows, ['项0']).ready, ['项1'])
})

test('属性：随机 DAG 上「可开工」恰等于「依赖全已完成」（双向，跑 40 张图）', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const rows = randomDag(seed, 6 + (seed % 5))
    const donePrefix = rows.filter((r, i) => i % 2 === 0).map((r) => r.id)
    const depsOf = new Map(rows.map((r) => [r.id, new Set(r.deps)]))
    const doneSet = new Set(donePrefix)
    const res = frontierOf(rows, donePrefix)
    assert.equal(res.cycle, null, `种子 ${seed} 的图按构造无环`)
    assert.deepEqual(res.unknown, [])
    for (const id of res.ready) {
      assert.ok(!doneSet.has(id), `种子 ${seed}：已完成项 ${id} 又出现在前沿里`)
      for (const dep of depsOf.get(id)) assert.ok(doneSet.has(dep), `种子 ${seed}：${id} 的依赖 ${dep} 未完成却进了前沿`)
    }
    for (const row of rows) {
      if (doneSet.has(row.id)) continue
      const allDone = [...depsOf.get(row.id)].every((dep) => doneSet.has(dep))
      assert.equal(res.ready.includes(row.id), allDone, `种子 ${seed}：${row.id} 的前沿归属与依赖状态不符`)
    }
    assert.deepEqual([...res.ready, ...res.blocked.map((b) => b.id)].sort(), rows.map((r) => r.id).filter((id) => !doneSet.has(id)).sort())
  }
})

test('属性：往 DAG 里加一条回边必成环，且环一定经过那条回边', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const rows = randomDag(seed, 7)
    // 先铺一条 首行 ← … ← 末行 的路径（每行额外依赖前一行），再加回边，
    // 否则「末行恰好依赖首行」只是个概率事件，属性会时红时绿（第一版就是这么写的）。
    for (let i = 1; i < rows.length; i += 1) rows[i].deps.push(rows[i - 1].id)
    const first = rows[0]
    const last = rows[rows.length - 1]
    first.deps.push(last.id) // 首行依赖末行 ⇒ 与上面那条路径合成环
    const res = frontierOf(rows)
    assert.ok(res.cycle, `种子 ${seed}：加了回边必须报环`)
    assert.ok(res.cycle.cards.includes(first.id), `种子 ${seed}：环必须经过回边起点 ${first.id}`)
  }
})

/* ───────────────────────── 走真 CLI：退出码与 stdout ───────────────────────── */

test('CLI：--check 退出码 0 且回执里有分类计数', () => {
  const r = cli(['--check'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /判绿/)
})

test('CLI：--check --json 与内存模型一致', () => {
  const r = cli(['--check', '--json'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const payload = JSON.parse(r.stdout)
  assert.deepEqual(payload.problems, [])
  assert.deepEqual(payload.counts, realModel().model.counts)
})

test('CLI：--frontier 在干净依赖表上退出 0，在散文依赖表上退出 1 并点名', () => {
  const good = '| 批 | 内容 | 依赖 |\n| :-: | :-- | :-- |\n| 0 | 打地基 | — |\n| 1 | 接着干 | 批 0 |\n'
  withTempFile(good, (file) => {
    const r = cli(['--frontier', file, '--json'])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const payload = JSON.parse(r.stdout)
    assert.deepEqual(payload.ready, ['批0'])
    assert.deepEqual(payload.blocked.map((b) => b.id), ['批1'])
  })
  const bad = '| 批 | 内容 | 依赖 |\n| :-: | :-- | :-- |\n| 0 | 打地基 | — |\n| 1 | 接着干 | 批 0；**A1 硬门禁（真机）** |\n'
  withTempFile(bad, (file) => {
    const r = cli(['--frontier', file])
    assert.equal(r.status, 1, '混写散文的依赖列必须判红')
    assert.match(r.stdout, /A1 硬门禁（真机）/)
  })
})

test('CLI：--frontier 遇到环退出 1（`非 0 不许描述成成功`）', () => {
  const cyclic = '| 批 | 依赖 |\n| :-: | :-- |\n| 0 | 批 1 |\n| 1 | 批 0 |\n'
  withTempFile(cyclic, (file) => {
    const r = cli(['--frontier', file])
    assert.equal(r.status, 1)
    assert.match(r.stdout, /成环/)
  })
})

test('CLI：不认识的参数退出 2；--help 退出 0', () => {
  assert.equal(cli(['--nope']).status, 2)
  assert.equal(cli(['--help']).status, 0)
})
