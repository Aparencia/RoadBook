/**
 * route CLI 的行为测试（B 类机械判据：**项目事实 → 卡片链**）。
 *
 * 与 `_qc/baseline/triggers/` 的评估面**分开计分，不许合并**：
 *   - 触发面（那份 queries.json）测的是「意图 → 哪张卡」的 LLM 路由，要跑 harness、要 3 次取样；
 *   - 本文件测的是「项目事实 → 卡片链」的**确定性编排**，零成本、零模型、每次必同结果。
 * 两个面混在一起，「路由漂移」与「链不完整」就分不清是哪一层坏。
 *
 * 断言分两类（缺第二类就是装饰）：
 *   - 正向：当前仓库必须判绿 / 链必须含该含的卡；
 *   - **反向对照**：故意改坏一份副本，审计与闸门必须报出对应问题。
 *     没有反向对照，`audit()` 退化成恒真的空函数也没人发现。
 *
 * 冻结的账本（A10）是提示器不是锁：卡文本一变它就该红，红了按失败信息里的两步走。
 *
 * 再生成 fixture（只在确认卡文本变化是预期的时候跑）：
 *   ROUTE_FIXTURE_UPDATE=1 node --test test/route-cli.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CN_DIR, EN_DIR, STEPS, UNREACHABLE_OK, audit, route, scanDir } from '../skills/roadbook/bin/route.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CLI = path.join(ROOT, 'skills', 'roadbook', 'bin', 'route.mjs')
const FIXTURE_PATH = path.join(HERE, 'fixtures', 'route-scenarios.json')
const UPDATE = process.env.ROUTE_FIXTURE_UPDATE === '1'
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' })
}
function cliJson(args) {
  const r = cli(args)
  assert.equal(r.status, 0, `route.mjs ${args.join(' ')} 应退出 0，实得 ${r.status}\n${r.stdout}\n${r.stderr}`)
  return JSON.parse(r.stdout)
}
/** 场景 → CLI 实际出的链（走真 CLI，不走内存函数：退出码与 stdout 也要被测到）。 */
function chainOf(name) {
  const sc = fixture.scenarios[name]
  assert.ok(sc, `fixture 里没有场景 ${name}`)
  return cliJson(['--facts', JSON.stringify(sc.facts), '--json']).chain.map((s) => s.card)
}
function resultOf(name) {
  return cliJson(['--facts', JSON.stringify(fixture.scenarios[name].facts), '--json'])
}
const closureCards = new Set(fixture.closure.mustIncludeWhenGoLive)

/* ── 再生成：只在显式要求时写盘（卡文本变化是预期的时候） ── */
if (UPDATE) {
  test('fixture 再生成（ROUTE_FIXTURE_UPDATE=1）', () => {
    for (const sc of Object.values(fixture.scenarios)) {
      const j = cliJson(['--facts', JSON.stringify(sc.facts), '--json'])
      sc.expect = { tier: j.tier, effTier: j.effTier, chain: j.chain.map((s) => s.card), ledger: j.ledger }
    }
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
  })
}

/* ── A1 审计判绿 ── */
test('A1 审计判绿：node skills/roadbook/bin/route.mjs --audit 退出码 0', () => {
  const r = cli(['--audit'])
  assert.equal(r.status, 0, `--audit 应判绿，实得退出码 ${r.status}\n${r.stdout}\n${r.stderr}`)
  assert.match(r.stdout, /判绿/, 'audit 文本回执应写明判绿')
  assert.ok(!/✗/.test(r.stdout), `判绿时不该有 ✗ 行：\n${r.stdout}`)

  const j = cliJson(['--audit', '--json'])
  assert.deepEqual(j.problems, [], `审计问题清单应空：${JSON.stringify(j.problems)}`)
  assert.equal(j.mirroredSteps, STEPS.length, '镜像覆盖条数应等于 STEPS 条数')
  assert.equal(j.cardsCn, j.cardsEn, `双语卡数不等：${j.cardsCn} vs ${j.cardsEn}`)
  // 「扫描器看不见某张卡」这类假绿的机械防线：**认得出的卡数 = 磁盘上的 .md 文件数**。
  // 2026-10-06 实测事故：7-10 卡号两位数，旧 ID_RE 只认一位数字 → 扫到 44 张、判「双语无缺份」绿。
  // 旧断言写的是 `>= 41` —— 下界挡不住「少扫一张」，所以这里换成与磁盘对账。
  const cnFiles = readdirSync(CN_DIR).filter((f) => f.endsWith('.md'))
  const enFiles = readdirSync(EN_DIR).filter((f) => f.endsWith('.md'))
  assert.equal(j.cardsCn, cnFiles.length, `扫描到 ${j.cardsCn} 张，而 playbook/ 有 ${cnFiles.length} 个 .md —— 有文件没被认出来（假绿）`)
  assert.equal(j.cardsEn, enFiles.length, `扫描到 ${j.cardsEn} 张，而 playbook_EN/ 有 ${enFiles.length} 个 .md —— 有文件没被认出来（假绿）`)
})

test('A1b 主模块判定精确：被同名文件 import 不许执行 main（旧 endsWith 兜底会误跑）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'route-main-guard-'))
  try {
    const probe = path.join(dir, 'route.mjs') // 故意同名：松散兜底 process.argv[1].endsWith('route.mjs') 会在这里误判
    writeFileSync(probe, `import ${JSON.stringify(pathToFileURL(CLI).href)}\nconsole.log('PROBE-OK')\n`)
    const r = spawnSync(process.execPath, [probe], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`)
    assert.equal(r.stdout.trim(), 'PROBE-OK', `被 import 时不该有任何 main 输出，实得：\n${r.stdout}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A1c 契约：route.mjs 只用 node:fs / node:path / node:url，且不 spawn 子进程', () => {
  const src = readFileSync(CLI, 'utf8')
  const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(imports)].sort(), ['node:fs', 'node:path', 'node:url'], `import 超出零依赖白名单：${imports.join(', ')}`)
  assert.ok(!/child_process|spawnSync|execSync|execFile/.test(src), 'route.mjs 不许 spawn 子进程')
})

/* ── A2 反向对照：篡改卡表 head 必须判红 ── */
test('A2 反向对照：篡改一份卡表的 head（H1 与触发行）必须判红——证明断言能说不', () => {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  assert.deepEqual(audit(cn, en).problems, [], '正常态先要判绿，否则反向对照没有基线')

  const target = STEPS.find((s) => s.card === '4-3')
  const tampered = new Map([...cn].map(([id, card]) => [id, { ...card }]))
  tampered.set(target.card, { ...tampered.get(target.card), anchorArea: '# 卡 4-3 · 换了个标题\n> 触发：换了个触发行' })
  const problems = audit(tampered, en).problems
  assert.ok(
    problems.some((p) => p.includes(target.card) && p.includes('镜像失配')),
    `改掉 ${target.card} 的锚点区后仍判绿，问题清单：${JSON.stringify(problems)}`,
  )
  // 反向对照的第二种改法：把锚点从触发行挪回正文（这就是本轮修掉的原缺陷形态）
  const bodyOnly = new Map([...cn].map(([id, card]) => [id, { ...card }]))
  bodyOnly.set(target.card, { ...bodyOnly.get(target.card), anchorArea: '# 卡 4-3 · 验证（全档必走）\n> 触发：4-1 绿灯后（正文里才写「等用户验收」）' })
  assert.ok(
    audit(bodyOnly, en).problems.length === 0,
    '锚点只认 H1 与触发行：正文里出现同名词不算命中，此时应判绿（绿的是新规则本身）',
  )
})

/* ── A2b 反向对照：认不出的卡文件名必须判红（2026-10-06 假绿事故的防线） ── */
test('A2b 认不出的文件名必须判红：scanDir 的 unparsed 要进 audit 的 problems', () => {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  assert.deepEqual(cn.unparsed, [], `playbook/ 有认不出的 .md：${JSON.stringify(cn.unparsed)}`)
  assert.deepEqual(en.unparsed, [], `playbook_EN/ 有认不出的 .md：${JSON.stringify(en.unparsed)}`)

  // 反向对照：合成一份「多出一个认不出的文件」的扫描结果 —— 必须报出来，而不是静默跳过
  const dirty = new Map([...cn])
  dirty.unparsed = ['7-10x-畸形卡号.md']
  const problems = audit(dirty, en).problems
  assert.ok(
    problems.some((p) => p.includes('7-10x-畸形卡号.md') && p.includes('无法识别')),
    `认不出的文件名没被判红（那就是「少扫一张卡却报双语无缺份」的假绿），问题清单：${JSON.stringify(problems)}`,
  )

  // 向后兼容：测试自己造的、没有 unparsed 属性的旧形状 Map 不许因此炸掉或判红
  const legacy = new Map([...cn])
  assert.deepEqual(audit(legacy, en).problems, [], '没有 unparsed 属性的旧形状 Map 必须仍然判绿')
})

/* ── A3 双语缺份 / 幽灵引用 ── */
test('A3 双语缺份与幽灵引用为 0；反向对照：抽掉一张卡必须各自判红', () => {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  assert.deepEqual(audit(cn, en).problems, [])

  const noGhost = new Map([...cn])
  noGhost.delete(STEPS[0].card)
  const ghostProblems = audit(noGhost, en).problems
  assert.ok(
    ghostProblems.some((p) => p.includes('幽灵引用') && p.includes(STEPS[0].card)),
    `抽掉 ${STEPS[0].card} 后没报幽灵引用：${JSON.stringify(ghostProblems)}`,
  )

  const noEn = new Map([...en])
  noEn.delete(STEPS[0].card)
  const biProblems = audit(cn, noEn).problems
  assert.ok(
    biProblems.some((p) => p.includes('双语缺份')),
    `英文侧抽掉 ${STEPS[0].card} 后没报双语缺份：${JSON.stringify(biProblems)}`,
  )
})

/* ── A4 同事实两次 --json 逐字节相同 ── */
test('A4 同事实两次 --json 逐字节相同（键序固定，供 diff 与回执）', () => {
  const facts = JSON.stringify(fixture.scenarios.endpoint.facts)
  const first = cli(['--facts', facts, '--json'])
  const second = cli(['--facts', facts, '--json'])
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`)
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`)
  assert.equal(first.stdout, second.stdout, '同事实两次运行必须逐字节相同')
  assert.ok(first.stdout.endsWith('\n'), 'JSON 末尾应有换行')
  assert.ok(!first.stdout.includes('\r'), 'JSON 不该带 CR')
  // 键序与输入写法无关：键序打乱后仍逐字节相同
  const shuffled = { ...fixture.scenarios.endpoint.facts }
  const reversed = Object.fromEntries(Object.entries(shuffled).reverse())
  assert.equal(cli(['--facts', JSON.stringify(reversed), '--json']).stdout, first.stdout, '事实键的书写顺序不该影响输出')
  // `--scenario` 与等价 `--facts` 走同一条 route/ledger 管道（元数据 mode/scenario 本就该不同，
  // 逐字节比会红——比的是链与账本这些实质字段）
  const scen = cli(['--scenario', 'endpoint', '--json'])
  assert.equal(scen.status, 0, scen.stderr)
  const a = JSON.parse(first.stdout)
  const b = JSON.parse(scen.stdout)
  for (const key of ['facts', 'tier', 'tierReason', 'effTier', 'chain', 'ledger', 'warnings', 'proposals']) {
    assert.deepEqual(b[key], a[key], `--scenario endpoint 的 ${key} 与等价 --facts 不一致`)
  }
})

/* ── A5 上线闭包 ── */
test('A5 上线闭包：goLive:true 链 ⊇ {4-5, 5-2, 5-4}；goLive:false 链与该集合交集为空', () => {
  for (const name of fixture.closure.goLiveScenarios) {
    const cards = chainOf(name)
    for (const card of fixture.closure.mustIncludeWhenGoLive) {
      assert.ok(cards.includes(card), `场景 ${name} 的链缺 ${card}：上线必须闭包到环境/发版/观测\n链：${cards.join(' ')}`)
    }
  }
  for (const name of fixture.closure.noGoLiveScenarios) {
    const cards = chainOf(name)
    const hit = cards.filter((c) => closureCards.has(c))
    assert.deepEqual(hit, [], `场景 ${name} 不上线，链里不该出现 ${hit.join(', ')}\n链：${cards.join(' ')}`)
  }
  // 两组的 goLive 事实确实是对立的两值（防止 fixture 名不副实）
  for (const name of fixture.closure.goLiveScenarios) assert.equal(resultOf(name).facts.goLive, true, `${name} 的 goLive 应为 true`)
  for (const name of fixture.closure.noGoLiveScenarios) assert.equal(resultOf(name).facts.goLive, false, `${name} 的 goLive 应为 false`)
})

/* ── A6 新依赖 ⇒ L 档 + 3-1 / 7-9 ── */
test('A6 newDependency:true ⇒ 档位 L，且链新增 {3-1, 7-9}', () => {
  const base = resultOf('endpoint')
  const chart = resultOf('endpoint-chart')
  assert.equal(base.tier, 'S', `对照组应是 S 档，实得 ${base.tier}`)
  assert.equal(chart.tier, 'L', `装图表库应判 L（2-1 判据表 L 行「引入新依赖」），实得 ${chart.tier}`)
  const baseCards = base.chain.map((s) => s.card)
  const chartCards = chart.chain.map((s) => s.card)
  for (const card of ['3-1', '7-9']) {
    assert.ok(!baseCards.includes(card), `对照组不该已含 ${card}`)
    assert.ok(chartCards.includes(card), `装库后链应新增 ${card}，实得：${chartCards.join(' ')}`)
  }
  assert.match(chart.chain.find((s) => s.card === '7-9').why, /准入/, '7-9 的理由应写明准入')
})

/* ── A7 红线域 ⇒ L 档 + 3-2 ── */
test('A7 redLine:true ⇒ 档位 L，且链含 3-2（威胁建模）', () => {
  const j = resultOf('redline')
  assert.equal(j.tier, 'L', `碰红线域应强制升 L，实得 ${j.tier}`)
  assert.ok(j.chain.some((s) => s.card === '3-2'), `红线域链应含 3-2：${j.chain.map((s) => s.card).join(' ')}`)
  assert.equal(j.chain.find((s) => s.card === '3-2').gate, 'verdict', '红线域的门禁应是裁决，不是轻确认')
})

/* ── A8 链里每张卡双语都在 ── */
test('A8 每个场景链里的每张卡在 playbook/ 与 playbook_EN/ 都存在', () => {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  for (const [name, sc] of Object.entries(fixture.scenarios)) {
    const j = resultOf(name)
    assert.equal(j.ledger.missing.length, 0, `场景 ${name} 缺卡：${j.ledger.missing.join(', ')}`)
    assert.equal(j.ledger.cards, j.chain.length, `场景 ${name} 账本卡数与链长不等`)
    for (const step of j.chain) {
      assert.ok(cn.has(step.card), `场景 ${name}：playbook/ 缺卡 ${step.card}`)
      assert.ok(en.has(step.card), `场景 ${name}：playbook_EN/ 缺卡 ${step.card}`)
      assert.equal(step.gate, j.chain.find((s) => s.card === step.card).gate)
    }
  }
  assert.deepEqual([...cn.keys()].sort(), [...en.keys()].sort(), '双语卡号集合必须一致')
})

/* ── A9 问题清单恰好 9 + 3 ── */
test('A9 --questions 恰好 9 条用户问题 + 3 条 agent 回填', () => {
  const j = cliJson(['--questions', '--json'])
  assert.equal(j.userQuestions.length, 9, `用户问题应为 9 条，实得 ${j.userQuestions.length}`)
  assert.equal(j.agentBackfill.length, 3, `agent 回填项应为 3 条，实得 ${j.agentBackfill.length}`)
  assert.equal(new Set([...j.userQuestions, ...j.agentBackfill].map((q) => q.key)).size, 12, '12 个键必须互不重复')
  assert.ok(j.userQuestions.every((q) => q.ask && q.def !== undefined), '每条问题都要有问法与推荐答案（0-1 硬规则 10）')

  const text = cli(['--questions'])
  assert.equal(text.status, 0, text.stderr)
  assert.equal((text.stdout.match(/^\d+\. /gm) || []).length, 9, `文本回执应有 9 条编号问题：\n${text.stdout}`)
  assert.equal((text.stdout.match(/^agent·/gm) || []).length, 3, `文本回执应有 3 条 agent 项：\n${text.stdout}`)
})

/* ── A10 端点场景账本等于冻结 fixture ── */
test('A10 端点场景账本等于冻结 fixture', () => {
  const expect = fixture.scenarios.endpoint.expect
  const actual = resultOf('endpoint')
  assert.equal(actual.tier, expect.tier)
  assert.equal(actual.effTier, expect.effTier)
  assert.deepEqual(actual.chain.map((s) => s.card), expect.chain, '端点场景的链成员变了')
  assert.deepEqual(
    actual.ledger,
    expect.ledger,
    '卡文本变了 → 更新 fixture 并在 _qc/baseline/ledger.json note 写一行理由'
    + '（再生成命令：ROUTE_FIXTURE_UPDATE=1 node --test test/route-cli.test.mjs）',
  )
  assert.ok(actual.ledger.cards > 0 && actual.ledger.lines > 0, '冻结账本不该是空壳')
})

/* ── 退出码纪律：0 正常 / 1 审计判红或事实非法 / 2 用法错误 ── */
test('退出码纪律：--help 0；未知参数与未知场景 2；事实非法 1', () => {
  const help = cli(['--help'])
  assert.equal(help.status, 0, `--help 应退出 0：${help.stdout}\n${help.stderr}`)
  assert.match(help.stdout, /Usage/, '--help 应打印 usage()')

  const badFlag = cli(['--frobnicate'])
  assert.equal(badFlag.status, 2, `未知参数应是用法错误 2，实得 ${badFlag.status}`)
  assert.match(badFlag.stdout + badFlag.stderr, /Usage/)

  const badScenario = cli(['--scenario', 'no-such-scenario'])
  assert.equal(badScenario.status, 2, `未知场景应是用法错误 2，实得 ${badScenario.status}`)

  const badJson = cli(['--facts', '{"hasUI":'])
  assert.equal(badJson.status, 1, `读不出的 JSON 应是事实非法 1，实得 ${badJson.status}`)

  const badKey = cli(['--facts', '{"hasUIx":true}'])
  assert.equal(badKey.status, 1, `未知事实键应是事实非法 1，实得 ${badKey.status}`)
  assert.match(badKey.stderr, /未知事实键/)

  const badValue = cli(['--facts', '{"scale":"huge"}'])
  assert.equal(badValue.status, 1, `枚举越界应是事实非法 1，实得 ${badValue.status}`)

  const badType = cli(['--facts', '{"goLive":"yes"}'])
  assert.equal(badType.status, 1, `布尔位置给字符串应是事实非法 1，实得 ${badType.status}`)

  const missingFile = cli(['--facts-file', path.join(ROOT, 'test', 'fixtures', 'no-such-facts.json')])
  assert.equal(missingFile.status, 1, `事实文件不存在应是 1，实得 ${missingFile.status}`)

  const ok = cli(['--facts', '{}', '--json'])
  assert.equal(ok.status, 0, `全默认事实应正常退出 0：${ok.stderr}`)
})

test('反向对照：非法事实不许被静默补默认值（错的事实必须判红，不许当好事实用）', () => {
  assert.throws(() => route({ goLive: 'true' }), /事实非法/, '字符串 true 不该被当成布尔真')
  assert.throws(() => route({ nope: 1 }), /未知事实键/)
  const j = cliJson(['--facts', '{"goLive":true}', '--json'])
  assert.equal(j.facts.goLive, true)
  assert.equal(j.facts.redLine, false, '未给的事实按默认值补齐')
})

/* ── A12 顺序：卡号大小 ≠ 执行顺序（design §4 L 线 / §17.6） ── */
// 起因：2-6 / 5-6 / 5-7 是补卡，号在阶段末尾，执行位置却在 2-1 / 5-2 之前。
// 这三张一度全都不在链里：--audit 把「不可达」印成「正常」，于是 L 链里
// `5-1 归档` 之后直接 `5-2 发布`，而 design §4 写着这两张「L 档必走」。
test('A12 顺序：L 档链含 2-6 / 5-6 / 5-7，且次序 2-6 < 2-1、5-6 < 5-7 < 5-2', () => {
  const cards = chainOf('public-saas')
  for (const card of ['2-6', '5-6', '5-7']) {
    assert.ok(cards.includes(card), `L 档链缺 ${card}（design §4 L 线写着必走）\n链：${cards.join(' ')}`)
  }
  const at = (c) => cards.indexOf(c)
  assert.ok(at('2-6') < at('2-1'), `轮子先行：2-6 必须排在 2-1 之前\n链：${cards.join(' ')}`)
  assert.ok(at('5-6') < at('5-7') && at('5-7') < at('5-2'),
    `发版前基线先行：5-6 定号 → 5-7 钉基线 → 5-2 发布，不许反序\n链：${cards.join(' ')}`)
  // S 档裁剪：这三张 M/L 卡不得溜进 S 链（design §4 每条专线都写了 S 档裁剪）
  const sCards = chainOf('endpoint')
  for (const card of ['2-6', '3-7', '4-6']) {
    assert.ok(!sCards.includes(card), `S 档不该走 ${card}（§4 写着 S 档裁剪）\n链：${sCards.join(' ')}`)
  }
})

/* ── A13 反向对照：主线卡不可达必须判红（此前它被印成「正常」） ── */
test('A13 反向对照：既不在 STEPS 也不在白名单的卡 ⇒ 审计判红「不可达卡」', () => {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  assert.deepEqual(audit(cn, en).problems, [], '正常态先判绿，否则反向对照没有基线')
  assert.ok(!cn.has('9-9') && !en.has('9-9'), '夹具假设：9-9 这张卡在双语目录里不存在')
  const cn2 = new Map(cn)
  cn2.set('9-9', { id: '9-9', anchorArea: '# 卡 9-9 · 假卡\n> 触发：假' })
  const en2 = new Map(en)
  en2.set('9-9', { id: '9-9', anchorArea: '# Card 9-9 · fake' })
  const problems = audit(cn2, en2).problems
  assert.ok(
    problems.some((p) => p.includes('不可达卡') && p.includes('9-9')),
    `主线卡不可达应判红（旧行为：印成「正常：事故线/回访线/治理线」）\n实得：${JSON.stringify(problems)}`,
  )
})

test('A13b 白名单不许腐烂：白名单里的卡必须真的不在 STEPS，且实际不可达集合 ⊆ 白名单', () => {
  const ids = new Set(STEPS.map((s) => s.card))
  for (const id of UNREACHABLE_OK) {
    assert.ok(!ids.has(id), `白名单里的 ${id} 已经在 STEPS 里了——白名单该删这一行，否则它开始骗人`)
  }
  const { unreachableOk } = audit(scanDir(CN_DIR), scanDir(EN_DIR))
  const expected = UNREACHABLE_OK.filter((id) => !ids.has(id)).sort()
  assert.deepEqual(unreachableOk, expected, '白名单与实际不可达集合必须一致（多一个 = 有卡漏进「正常」那一行）')
})
