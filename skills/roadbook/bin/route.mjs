#!/usr/bin/env node
/**
 * roadbook route —— 「事实 → 卡片链」的确定性路由（CLI + barrel）
 *
 * 本文件只做两件事：
 *   1. **CLI**：解析参数、读事实、打印回执、给退出码（副作用只在这一层）；
 *   2. **barrel**：把拆出去的四层按原名再导出一遍 —— 调用方（`test/route-cli.test.mjs`、
 *      `test/cards.test.mjs`、`bin/cards.mjs`）一行都不用改。
 *
 * 拆分历史（2026-10-07 批 3，TD-008 的到期条件）：原 567 行越过 D14 第 1 条（单文件 ≤500 行）。
 *   `route-data.mjs`    事实问题 / 进入条件 / 判据 / 白名单 / 预设场景（纯数据）
 *   `route-cards.mjs`   锚点区提取 / 卡目录扫描 / 读卡正文（读盘半）
 *   `route-core.mjs`    档位 / 门禁 / 事实校验 / 出链 / 账本 / 审计（纯逻辑）
 *   `route-format.mjs`  文本与 JSON 两种回执的渲染（纯字符串）
 *   `route-quote.mjs`   卡正文逐字节切片（**新功能，不是拆分件** —— 台账 #27 的派单内嵌件）
 *   `route-dispatch.mjs` 链状态与派单包（**新功能** —— 台账 #25~#28 的 P0 机械面）
 *
 * 三条自我约束（照母版既有契约，别把它变成第三处真相）：
 *   1. 不新增判据。每张卡的进入条件都带 `anchor`（卡文件里的原话片段），`--audit` 回读该卡的
 *      **锚点区**（H1 行 + 触发行，见 `anchorAreaOf`）确认锚点仍在；卡改了而镜像没改 = 判红退出 1。
 *   2. 档位判据逐字镜像 `playbook/2-1-功能调研.md` 动作 5 的判据表；工具只做代入。
 *   3. 与现行规则不同的建议（如「实测后可降档」）只出现在 `proposals[]`，
 *      明确标注「未改卡」，不伪装成规则。
 *
 * 退出码（与 `skills/roadbook-atlas/bin/atlas.mjs` 同一套纪律：非 0 永远不许描述成成功）：
 *   0 = 正常（含 `--help`）
 *   1 = 审计判红（镜像失配 / 幽灵引用 / 双语缺份）或事实非法（JSON 读不出、未知事实键、取值越界）
 *       或切片判红（卡不存在 / 行号越界 / 起止颠倒）或链状态判红（`--done` 里有卡不在链上）
 *   2 = 用法错误（未知参数、参数缺取值、未知场景、切片写法不合法、`--lang` 取值非法、
 *       `--chain` / `--dispatch` 缺事实、`--done` 写给了别的模式）
 *
 * 用法：
 *   node skills/roadbook/bin/route.mjs                      # 问题清单 + 端点场景示例
 *   node skills/roadbook/bin/route.mjs --questions [--json]
 *   node skills/roadbook/bin/route.mjs --scenario endpoint-chart [--json]
 *   node skills/roadbook/bin/route.mjs --facts '{"hasUI":true,"goLive":true}' [--json]
 *   node skills/roadbook/bin/route.mjs --facts-file facts.json [--json]
 *   node skills/roadbook/bin/route.mjs --audit [--json]      # 镜像锚点/双语/幽灵引用自检
 *   node skills/roadbook/bin/route.mjs --quote 4-1[:80-120] [--lang cn|en] [--json]
 *   node skills/roadbook/bin/route.mjs --chain --facts '<json>' [--done '1-1,1-2'] [--json]
 *   node skills/roadbook/bin/route.mjs --dispatch 4-1[:80-120] --facts '<json>' [--done '…'] [--lang cn|en] [--out <path>] [--json]
 *   node skills/roadbook/bin/route.mjs --help
 *
 * 零依赖、不 spawn 子进程；只用 node:fs / node:path / node:url / node:crypto。
 * `--json` 的键序固定（同一组事实两次运行逐字节相同），供测试与回执 diff。
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CN_DIR, EN_DIR, SCENARIOS, SCHEMA, STEPS, UNREACHABLE_OK } from './route-data.mjs'
import { readCardText, scanDir, stopMarksOf } from './route-cards.mjs'
import { audit, route } from './route-core.mjs'
import { fmtJson, fmtQuestions, fmtQuestionsJson, fmtRoute, usage } from './route-format.mjs'
import { fmtQuote, fmtQuoteJson, parseQuoteSpec, quoteSlice } from './route-quote.mjs'
import { chainStateOf, dispatchOf, fmtChain, fmtChainJson, fmtDispatch, fmtDispatchJson, parseDoneSpec } from './route-dispatch.mjs'

/* ── barrel：拆分前 route.mjs 的对外导出面按原名再导出一遍（调用方零改动） ── */
export { CN_DIR, EN_DIR, FACTS, SCENARIOS, SCHEMA, STEPS, UNREACHABLE_OK, tierOf } from './route-data.mjs'
export { anchorAreaOf, readCardText, scanDir, STOP_MARK_RE, stopMarksOf } from './route-cards.mjs'
export { audit, gateOf, gateWhyOf, ledger, normalizeFacts, orderedFacts, route } from './route-core.mjs'
export { fmtQuote, fmtQuoteJson, parseQuoteSpec, quoteSlice, stripLineNumbers } from './route-quote.mjs'
export { chainStateOf, dispatchOf, fmtChain, fmtDispatch, parseDoneSpec, RECEIPT_CHARS, RECEIPT_LINES } from './route-dispatch.mjs'

/** 退出码：0 正常 / 1 审计判红或事实非法 / 2 用法错误。 */
const EXIT = { ok: 0, red: 1, usage: 2 }

/**
 * 统一的失败出口。放在本层（而不是 route-format.mjs）：它是**副作用**（写 stderr + 结束进程），
 * 渲染层只许产出字符串。默认退出码取「判红」——把失败当失败，是最不该有默认值的地方。
 */
function fail(message, code = EXIT.red) {
  console.error(message)
  process.exit(code)
}

const MODES = ['demo', 'questions', 'audit', 'quote', 'scenario', 'facts', 'chain', 'dispatch']

/** 只有这三个模式会被「事实来源」参数改写：其余模式是显式点名的输出面，事实给了也不动它（旧行为不变）。 */
const FACTS_DRIVEN_MODES = ['demo', 'facts', 'scenario']

/** 需要事实输入的两个模式：链状态与派单包都由事实算出 —— 没事实就没有链，没有链就没有「当前是哪张」。 */
const NEEDS_FACTS = ['chain', 'dispatch']

/**
 * 解析 argv：用法错误抛异常，由 main 统一转成退出码 2。
 *
 * 事实来源（`--facts` / `--facts-file` / `--scenario`）与输出模式**分开记**：
 * 老写法是「后一个参数覆盖前一个的 mode」，于是 `--dispatch 4-1 --facts '…'` 里的事实会把 mode 抢走。
 * 现在的规则：事实参数只改写 `demo` / `facts` / `scenario` 这三种（老行为逐字保留），
 * 其余模式（`--audit` / `--quote` / `--chain` / `--dispatch` / `--questions`）由自己的旗标决定。
 */
export function parseArgs(argv) {
  const opts = { mode: 'demo', json: false, done: [] }
  const need = (i, flag) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`用法错误：${flag} 需要一个取值\n\n${usage()}`)
    return v
  }
  const setFactsSource = (source) => {
    opts.factsSource = source
    if (FACTS_DRIVEN_MODES.includes(opts.mode)) opts.mode = source.kind === 'scenario' ? 'scenario' : 'facts'
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--questions') opts.mode = 'questions'
    else if (a === '--audit') opts.mode = 'audit'
    else if (a === '--chain') opts.mode = 'chain'
    else if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.mode = 'help'
    else if (a === '--scenario') { setFactsSource({ kind: 'scenario', value: need(i, a) }); i += 1 }
    else if (a === '--facts') { setFactsSource({ kind: 'text', value: need(i, a) }); i += 1 }
    else if (a === '--facts-file') { setFactsSource({ kind: 'file', value: need(i, a) }); i += 1 }
    else if (a === '--quote') { opts.mode = 'quote'; opts.quoteSpec = need(i, a); i += 1 }
    else if (a === '--dispatch') { opts.mode = 'dispatch'; opts.quoteSpec = need(i, a); i += 1 }
    else if (a === '--done') { opts.doneSpec = need(i, a); i += 1 }
    else if (a === '--out') { opts.outFile = need(i, a); i += 1 }
    else if (a === '--lang') {
      const v = need(i, a); i += 1
      if (v !== 'cn' && v !== 'en') throw new Error(`用法错误：--lang 只能是 cn / en，实得 ${v}\n\n${usage()}`)
      opts.lang = v
    }
    else throw new Error(`用法错误：未知参数 ${a}\n\n${usage()}`)
  }
  if (!MODES.includes(opts.mode) && opts.mode !== 'help') throw new Error(`用法错误：未知模式 ${opts.mode}\n\n${usage()}`)
  if (opts.doneSpec !== undefined) {
    if (!['chain', 'dispatch'].includes(opts.mode)) throw new Error(`用法错误：--done 只对 --chain / --dispatch 有意义（它标的是链状态，别的模式里无所指）\n\n${usage()}`)
    opts.done = parseDoneSpec(opts.doneSpec)
  }
  if (opts.outFile !== undefined && opts.mode !== 'dispatch') {
    throw new Error(`用法错误：--out 只对 --dispatch 有意义（把派单包落盘、只在 stdout 留一行指针）\n\n${usage()}`)
  }
  if (NEEDS_FACTS.includes(opts.mode) && !opts.factsSource) {
    throw new Error(`用法错误：--${opts.mode} 需要事实（链由事实算出，没有事实就没有「当前是哪张卡」）——`
      + `用 --facts '<json>' / --facts-file <path> / --scenario <name>\n\n${usage()}`)
  }
  return opts
}

/**
 * 事实来源三选一：`--facts '<json>'` / `--facts-file <path>` / `--scenario <name>`。
 * 读不出 / 解析不出 = 事实非法（退出码 1）；场景名认不出 = 用法错误（退出码 2）。
 */
function loadFacts(opts) {
  const src = opts.factsSource
  if (!src) throw new Error('用法错误：没有事实来源（用 --facts / --facts-file / --scenario）')
  if (src.kind === 'scenario') {
    const sc = SCENARIOS[src.value]
    if (!sc) throw new Error(`用法错误：未知场景 ${src.value}（可用：${Object.keys(SCENARIOS).join(', ')}）`)
    return sc.facts
  }
  let text
  if (src.kind === 'text') {
    text = src.value
  } else {
    if (!existsSync(src.value)) throw new Error(`事实非法：事实文件不存在 ${src.value}`)
    try { text = readFileSync(src.value, 'utf8') } catch (err) { throw new Error(`事实非法：事实文件读不出 ${src.value}（${err.message}）`) }
  }
  let parsed
  // PS 5.1 的 `Set-Content -Encoding UTF8` / `Out-File -Encoding utf8` 会写 BOM，而 `JSON.parse` 直接拒绝它
  // （实测：`Unexpected token '﻿'`）。事实文件是 0-1 卡复算链序的入口（`route --chain --facts-file …`），
  // 最常用的 Windows 写法必须走得通。剥 BOM 是**输入卫生**，不是放宽判据——内容仍要真解析成 JSON 才算数。
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')) } catch (err) { throw new Error(`事实非法：JSON 解析失败（${err.message}）\n原文：${text.slice(0, 200)}`) }
  return parsed
}

/** 异常 → 退出码：以「用法错误」开头的都是 2，其余一律判红 1（把失败当失败）。 */
function exitCodeFor(err) {
  return err instanceof Error && err.message.startsWith('用法错误') ? EXIT.usage : EXIT.red
}

function runAudit(opts) {
  const cn = scanDir(CN_DIR)
  const en = scanDir(EN_DIR)
  const { problems, cardsCn, cardsEn, unreachableOk } = audit(cn, en)
  if (opts.json) {
    console.log(JSON.stringify({ schema: SCHEMA, mode: 'audit', cardsCn, cardsEn, mirroredSteps: STEPS.length, problems, unreachableOk, unreachableOkWhitelist: UNREACHABLE_OK }, null, 2))
  } else {
    console.log('Roadbook route 自检回执')
    console.log(`playbook/ ${cardsCn} 张 · playbook_EN/ ${cardsEn} 张 · 镜像覆盖 ${STEPS.length} 条进入条件（锚点只取 H1 与触发行）`)
    console.log(`按需触发、不占事实链的卡（白名单 ${UNREACHABLE_OK.length} 张）：${unreachableOk.join(', ') || '无'}`)
    console.log(problems.length ? `判红 ${problems.length} 条：` : '判绿：镜像锚点与卡一致，双语无缺份，无幽灵引用。')
    for (const p of problems) console.log(`  ✗ ${p}`)
  }
  process.exit(problems.length ? EXIT.red : EXIT.ok)
}


/**
 * `--quote` 的 CLI 侧：切片规则与渲染都在 `route-quote.mjs`（纯函数），
 * 读盘只在本层 —— 副作用留在边界，切片逻辑可以离线单测。
 */
/**
 * 取卡 + 切片的公共前半段（`--quote` 与 `--dispatch` 只差后半段）：
 * 认不出的卡 = 判红 1（幽灵派单/幽灵切片），切片写法不合法 = 用法错误 2。
 */
function resolveSlice(opts, lang, what) {
  const dir = lang === 'en' ? EN_DIR : CN_DIR
  const dirName = lang === 'en' ? 'playbook_EN' : 'playbook'
  let spec
  try { spec = parseQuoteSpec(opts.quoteSpec) } catch (err) { fail(err.message, EXIT.usage) }
  const cards = scanDir(dir)
  const entry = cards.get(spec.card)
  if (!entry) {
    fail(`${what}判红：${dirName}/ 里没有卡 ${spec.card}（现有 ${cards.size} 张，卡号形如 4-1）\n`
      + `提示：${lang === 'en' ? '去掉 --lang en 读中文权威版。' : '英文执行版加 --lang en。'}`
      + '先跑 `node skills/roadbook/bin/cards.mjs --list` 或 `route --audit` 看现有的卡', EXIT.red)
  }
  try {
    return { spec, entry, dirName, quoted: quoteSlice({ text: readCardText(dir, entry), card: spec.card, file: entry.file, spec: opts.quoteSpec, lang }) }
  } catch (err) { fail(err.message, EXIT.red) }
}

function runQuote(opts) {
  const lang = opts.lang === undefined ? 'cn' : opts.lang
  const { quoted } = resolveSlice(opts, lang, '切片')
  console.log(opts.json ? fmtQuoteJson(quoted) : fmtQuote(quoted))
}

/** 链状态的 CLI 侧：事实 → 链 → 标状态（事实与 `--done` 的错都在这里变成退出码）。 */
function runChain(opts) {
  let result
  let state
  try {
    result = route(loadFacts(opts))
    state = chainStateOf(result, opts.done)
  } catch (err) { fail(err.message, exitCodeFor(err)) }
  console.log(opts.json
    ? fmtChainJson(state, result)
    : fmtChain(state, result, { dispatchCmd: 'node skills/roadbook/bin/route.mjs', factsArg: JSON.stringify(result.facts) }))
}

/**
 * 派单包的 CLI 侧。三件事在这里合成：链状态（事实 + `--done`）、卡正文切片（读盘 + `route-quote`）、
 * 停点行号（`stopMarksOf`，与账本的 `stops` 同一份正则）。渲染与装配都在纯函数层。
 */
function runDispatch(opts) {
  const lang = opts.lang === undefined ? 'cn' : opts.lang
  let result
  let state
  try {
    result = route(loadFacts(opts))
    state = chainStateOf(result, opts.done)
  } catch (err) { fail(err.message, exitCodeFor(err)) }
  const { quoted } = resolveSlice(opts, lang, '派单')
  const stopMarks = stopMarksOf(quoted.raw, quoted.from)
  const pkg = dispatchOf({ result, card: quoted.card, lang, quote: quoted, done: opts.done, stopMarks })
  if (!pkg.inChain) {
    // 链外派单是合法动作（事件线 / 主线程点名），但必须显式说出来：否则「派了一张不该现在走的卡」看不出来。
    console.error(`提示：卡 ${pkg.card} 不在本次事实算出的链里（链 = ${state.cards.map((c) => c.card).join(', ')}）——`
      + '按需触发的卡（事故线 / 治理线 / 横向卡）与主线程点名的卡都长这样；门禁照卡自己的判据走。')
  }
  const body = opts.json ? fmtDispatchJson(pkg) : fmtDispatch(pkg)
  if (opts.outFile === undefined) { console.log(body); return }
  // `--out` 是 P0 省 token 的关键一步，不是顺手加的便利：派单包整段印到 stdout 的话，
  // **主线程自己先把卡正文读了一遍**，省下的 token 又还回去了。落盘 + 回一行指针，
  // 卡正文就只进子 agent 的上下文。一律 UTF-8 无 BOM —— PS 5.1 的 `>` 默认写 UTF-16LE，
  // 拿它当管道会让收件方读到乱码（AGENTS.md §10 那条已知坑）。
  const text = `${body}\n`
  try { writeFileSync(opts.outFile, text, 'utf8') } catch (err) { fail(`派单包写不出：${opts.outFile}（${err.message}）`, EXIT.red) }
  const receipt = {
    schema: pkg.schema, mode: 'dispatch', card: pkg.card, out: opts.outFile,
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    gate: pkg.gate, needVerdict: pkg.needVerdict.required,
    prompt: `按 ${opts.outFile} 里的派单包执行卡 ${pkg.card}，只回三行回执。`,
  }
  console.log(opts.json ? JSON.stringify(receipt, null, 2)
    : `派单包已落盘：${receipt.out}（${receipt.bytes} 字节 · sha256 ${receipt.sha256} · 门禁 ${pkg.gate}${receipt.needVerdict ? ' · 需要裁决' : ''}）\n派单提示词：${receipt.prompt}`)
}

function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (err) { fail(err.message, EXIT.usage) }

  if (opts.mode === 'help') { console.log(usage()); return }
  if (opts.mode === 'audit') { runAudit(opts); return }
  if (opts.mode === 'quote') { runQuote(opts); return }
  if (opts.mode === 'chain') { runChain(opts); return }
  if (opts.mode === 'dispatch') { runDispatch(opts); return }

  const cn = scanDir(CN_DIR)

  if (opts.mode === 'questions') {
    console.log(opts.json ? fmtQuestionsJson() : fmtQuestions())
    return
  }

  let result
  let note
  try {
    if (opts.mode === 'facts' || opts.mode === 'scenario') {
      result = route(loadFacts(opts))
      if (opts.mode === 'scenario') note = SCENARIOS[opts.factsSource.value].note
    } else {
      console.log(fmtQuestions())
      console.log('')
      console.log('─'.repeat(72))
      console.log('')
      for (const key of ['endpoint', 'endpoint-chart']) {
        console.log(fmtRoute(route(SCENARIOS[key].facts), cn, { note: SCENARIOS[key].note }))
        console.log('')
        console.log('─'.repeat(72))
        console.log('')
      }
      return
    }
  } catch (err) {
    fail(err.message, exitCodeFor(err))
  }

  const jsonOpts = { mode: opts.mode, scenario: opts.mode === 'scenario' ? opts.factsSource.value : undefined }
  console.log(opts.json ? fmtJson(result, cn, jsonOpts) : fmtRoute(result, cn, { note }))
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked !== '' && invoked === fileURLToPath(import.meta.url)) main()
