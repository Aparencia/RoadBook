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
 *       或切片判红（卡不存在 / 行号越界 / 起止颠倒）
 *   2 = 用法错误（未知参数、参数缺取值、未知场景、切片写法不合法、`--lang` 取值非法）
 *
 * 用法：
 *   node skills/roadbook/bin/route.mjs                      # 问题清单 + 端点场景示例
 *   node skills/roadbook/bin/route.mjs --questions [--json]
 *   node skills/roadbook/bin/route.mjs --scenario endpoint-chart [--json]
 *   node skills/roadbook/bin/route.mjs --facts '{"hasUI":true,"goLive":true}' [--json]
 *   node skills/roadbook/bin/route.mjs --facts-file facts.json [--json]
 *   node skills/roadbook/bin/route.mjs --audit [--json]      # 镜像锚点/双语/幽灵引用自检
 *   node skills/roadbook/bin/route.mjs --quote 4-1[:80-120] [--lang cn|en] [--json]
 *   node skills/roadbook/bin/route.mjs --help
 *
 * 零依赖、不 spawn 子进程；只用 node:fs / node:path / node:url / node:crypto。
 * `--json` 的键序固定（同一组事实两次运行逐字节相同），供测试与回执 diff。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CN_DIR, EN_DIR, SCENARIOS, SCHEMA, STEPS, UNREACHABLE_OK } from './route-data.mjs'
import { readCardText, scanDir } from './route-cards.mjs'
import { audit, route } from './route-core.mjs'
import { fmtJson, fmtQuestions, fmtQuestionsJson, fmtRoute, usage } from './route-format.mjs'
import { fmtQuote, fmtQuoteJson, parseQuoteSpec, quoteSlice } from './route-quote.mjs'

/* ── barrel：拆分前 route.mjs 的对外导出面按原名再导出一遍（调用方零改动） ── */
export { CN_DIR, EN_DIR, FACTS, SCENARIOS, SCHEMA, STEPS, UNREACHABLE_OK, tierOf } from './route-data.mjs'
export { anchorAreaOf, readCardText, scanDir } from './route-cards.mjs'
export { audit, gateOf, ledger, normalizeFacts, orderedFacts, route } from './route-core.mjs'
export { fmtQuote, fmtQuoteJson, parseQuoteSpec, quoteSlice, stripLineNumbers } from './route-quote.mjs'

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

const MODES = ['demo', 'questions', 'audit', 'quote', 'scenario', 'facts']

/** 解析 argv：用法错误抛异常，由 main 统一转成退出码 2。 */
export function parseArgs(argv) {
  const opts = { mode: 'demo', json: false }
  const need = (i, flag) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`用法错误：${flag} 需要一个取值\n\n${usage()}`)
    return v
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--questions') opts.mode = 'questions'
    else if (a === '--audit') opts.mode = 'audit'
    else if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.mode = 'help'
    else if (a === '--scenario') { opts.mode = 'scenario'; opts.scenario = need(i, a); i += 1 }
    else if (a === '--facts') { opts.mode = 'facts'; opts.factsText = need(i, a); i += 1 }
    else if (a === '--facts-file') { opts.mode = 'facts'; opts.factsFile = need(i, a); i += 1 }
    else if (a === '--quote') { opts.mode = 'quote'; opts.quoteSpec = need(i, a); i += 1 }
    else if (a === '--lang') {
      const v = need(i, a); i += 1
      if (v !== 'cn' && v !== 'en') throw new Error(`用法错误：--lang 只能是 cn / en，实得 ${v}\n\n${usage()}`)
      opts.lang = v
    }
    else throw new Error(`用法错误：未知参数 ${a}\n\n${usage()}`)
  }
  if (!MODES.includes(opts.mode) && opts.mode !== 'help') throw new Error(`用法错误：未知模式 ${opts.mode}\n\n${usage()}`)
  return opts
}

/** 事实来源二选一：`--facts '<json>'` 或 `--facts-file <path>`；读不出/解析不出 = 事实非法（退出码 1）。 */
function loadFacts(opts) {
  let text
  if (opts.factsText !== undefined) {
    text = opts.factsText
  } else {
    if (!existsSync(opts.factsFile)) throw new Error(`事实非法：事实文件不存在 ${opts.factsFile}`)
    try { text = readFileSync(opts.factsFile, 'utf8') } catch (err) { throw new Error(`事实非法：事实文件读不出 ${opts.factsFile}（${err.message}）`) }
  }
  let parsed
  try { parsed = JSON.parse(text) } catch (err) { throw new Error(`事实非法：JSON 解析失败（${err.message}）\n原文：${text.slice(0, 200)}`) }
  return parsed
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
function runQuote(opts) {
  const lang = opts.lang === undefined ? 'cn' : opts.lang
  const dir = lang === 'en' ? EN_DIR : CN_DIR
  const dirName = lang === 'en' ? 'playbook_EN' : 'playbook'
  let spec
  try { spec = parseQuoteSpec(opts.quoteSpec) } catch (err) { fail(err.message, EXIT.usage) }
  const cards = scanDir(dir)
  const entry = cards.get(spec.card)
  if (!entry) {
    fail(`切片判红：${dirName}/ 里没有卡 ${spec.card}（现有 ${cards.size} 张，卡号形如 4-1）\n`
      + `提示：${lang === 'en' ? '去掉 --lang en 读中文权威版。' : '英文执行版加 --lang en。'}`
      + '先跑 `node skills/roadbook/bin/cards.mjs --list` 或 `route --audit` 看现有的卡', EXIT.red)
  }
  let quoted
  try {
    quoted = quoteSlice({ text: readCardText(dir, entry), card: spec.card, file: entry.file, spec: opts.quoteSpec, lang })
  } catch (err) { fail(err.message, EXIT.red) }
  console.log(opts.json ? fmtQuoteJson(quoted) : fmtQuote(quoted))
}

function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (err) { fail(err.message, EXIT.usage) }

  if (opts.mode === 'help') { console.log(usage()); return }
  if (opts.mode === 'audit') { runAudit(opts); return }
  if (opts.mode === 'quote') { runQuote(opts); return }

  const cn = scanDir(CN_DIR)

  if (opts.mode === 'questions') {
    console.log(opts.json ? fmtQuestionsJson() : fmtQuestions())
    return
  }

  let result
  let note
  try {
    if (opts.mode === 'facts') {
      result = route(loadFacts(opts))
    } else if (opts.mode === 'scenario') {
      const sc = SCENARIOS[opts.scenario]
      if (!sc) throw new Error(`用法错误：未知场景 ${opts.scenario}（可用：${Object.keys(SCENARIOS).join(', ')}）`)
      result = route(sc.facts)
      note = sc.note
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
    const usageError = err instanceof Error && err.message.startsWith('用法错误')
    fail(err.message, usageError ? EXIT.usage : EXIT.red)
  }

  const jsonOpts = { mode: opts.mode, scenario: opts.mode === 'scenario' ? opts.scenario : undefined }
  console.log(opts.json ? fmtJson(result, cn, jsonOpts) : fmtRoute(result, cn, { note }))
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked !== '' && invoked === fileURLToPath(import.meta.url)) main()
