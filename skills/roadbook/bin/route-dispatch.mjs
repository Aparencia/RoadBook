/**
 * roadbook route --chain / --dispatch —— **链状态 + 派单包**（台账 #25~#28 的机械面）
 *
 * 为什么存在（`design/plugin-skill-doc-mechanism.md` §5 的 P0）：一条链 7~26 张卡全在主上下文里跑，
 * L 链 ≈77k tokens；P0 的做法是把**卡片本体放进子 agent 的干净上下文**，主线程只留链状态 + 短回执。
 * 这条路有一道已知的墙：`includeSubagents` 默认 `false`（`plugin/roadbook-autoload/index.js:151`）
 * ⇒ 子 agent 那边没有注入，它**不知道**自己该按哪张卡干活、也不知道哪一步要停。
 * 两条路里已裁决走「派单内嵌卡正文切片」（另一条 = 对这条路径放行 `includeSubagents`，等于打开
 * 「子代理不受卡约束」的口子；被否理由与断言见 `docs/decisions/2026-10-07_P0-子代理执行卡.md`）。
 *
 * 本文件全是纯函数（I/O 只在 `route.mjs` 的 CLI 层，读盘只在 `route-cards.mjs`）：
 *   1. `chainStateOf`  链状态：哪几张已完结 / 当前是哪张 / 下一张派谁；
 *   2. `dispatchOf`    派单包：内嵌卡正文切片（逐字节 + 行号 + sha256）+ 门禁的类型化结果 + 3 行回执模板；
 *   3. `fmtDispatch` / `fmtDispatchJson`  两种回执。
 *
 * 一条口径：**本文件不产判据**。门禁与理由来自 `route-core.mjs` 的 `gateWhyOf`（同一个分支里产出，
 * 不许「门禁」与「为什么」变成两处真相），卡正文来自 `route-quote.mjs` 的切片，本文件只做装配。
 */
import { SCHEMA } from './route-data.mjs'
import { gateWhyOf } from './route-core.mjs'

/** 卡号形态：`<阶段>-<序号>`。 */
const CARD_RE = /^\d+-\d+$/

/**
 * `--done` 的取值：逗号分隔的卡号。**故意严格** —— 认不出的写法判用法错误，
 * 因为「解析不出来就当作没有」会让链状态静默回退到「一张都没做」，而输出上完全看不出来。
 */
export function parseDoneSpec(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('用法错误：--done 需要逗号分隔的卡号，例如 --done 1-1,1-2（没有已完结的卡就别写这个参数）')
  }
  const items = text.split(',').map((s) => s.trim())
  const bad = items.filter((s) => !CARD_RE.test(s))
  if (bad.length) throw new Error(`用法错误：--done 只认卡号（形如 4-1），实得 ${bad.map((s) => JSON.stringify(s)).join(', ')}`)
  const dup = [...new Set(items.filter((x, i) => items.indexOf(x) !== i))]
  if (dup.length) throw new Error(`用法错误：--done 里有重复卡号 ${dup.join(', ')}`)
  return items
}

/**
 * 链状态：把 `result.chain` 标成 done / current / todo。
 *
 * 「已完结」只由调用方显式给出（`--done`），工具**不猜**——猜的做法（去解析 STATE.md 的散文）正是
 * 方案 §落差 5 那条病：状态是自然语言，所以不可校验。这里宁可每轮多传一个参数。
 *
 * @param {{chain: Array<object>, facts: object, effTier: string}} result `route()` 的返回值
 * @param {string[]} done 已完结的卡号
 */
export function chainStateOf(result, done = []) {
  const ids = result.chain.map((s) => s.card)
  const unknown = done.filter((id) => !ids.includes(id))
  if (unknown.length) {
    throw new Error(`链状态判红：--done 里的 ${unknown.join(', ')} 不在本次事实算出的链里（链 = ${ids.join(', ')}）——`
      + '要么事实填错了，要么你记的链和工具算的链不是同一条；先对齐事实再派单')
  }
  const doneSet = new Set(done)
  const cards = result.chain.map((s, i) => ({
    index: i + 1,
    card: s.card,
    why: s.why,
    gate: s.gate,
    optional: !!s.optional,
    state: doneSet.has(s.card) ? 'done' : 'todo',
  }))
  const currentIdx = cards.findIndex((c) => c.state === 'todo')
  if (currentIdx >= 0) cards[currentIdx].state = 'current'
  return {
    total: cards.length,
    doneCount: doneSet.size,
    current: currentIdx >= 0 ? cards[currentIdx].card : null,
    // 观测项（不是判据）：已完结的卡排在当前卡之后。可选卡被跳过、或事实改了链变短，都会长这样；
    // 报出来是为了让「链漂了」看得见，判它红不红由人。
    outOfOrder: currentIdx < 0 ? [] : cards.slice(currentIdx + 1).filter((c) => c.state === 'done').map((c) => c.card),
    cards,
  }
}

/**
 * 回执的**字符上限（每行）**：三行这个约束挡不住「每行很长」—— 台账 #28 的单卡对照实测两臂回执都恰好
 * 3 行，但 P0 臂 249 字符（均值 83）vs 现状臂 664（均值 221）⇒ 主线程省下的 token 又被回执吃回去一部分。
 * 取 160 = 好臂均值的约 1.9 倍（容得下带「命令原文 ⇒ 输出行原文」的那一行），只挡「每行很长」这一种。
 * 超限 = 回执不合规，不是「内容更丰富」。数字只写在这一处：规则串由它拼出，测试钉死两者同源。
 */
export const RECEIPT_CHARS = 160

/** 子 agent 的回执**恰好三行**：多一行不收（回执变长就没人读，P0 省下的 token 又花回去了）。 */
export const RECEIPT_LINES = [
  '① 卡 <卡号> · 结论 PASS|FAIL|BLOCKED · 退出码 <n>',
  '② 证据 <命令原文> ⇒ <输出行原文>（文件:行）',
  '③ 待裁决 无 ｜ <要人回答的问题原文>',
]

/** 派单包里的纪律块：**只给指针，不复述判据**（同一事实两处写必然漂）。 */
const CONSTRAINTS = [
  '规则正文 = 上面那段卡正文（逐字节，sha256 可核）+ 项目 AGENTS.md（红线域与 A 类不可委托清单）；本包不复述判据。',
  '红灯 = 停：判据触发就停下并输出「红灯 + 依据」，禁止输出「如果你坚持我可以继续」。',
  '完成 = 门禁退出码 0 + 同一批粘贴真实输出；没跑过的测试等于没有测试。',
  '不许自判门禁与验收（A4 / A5 属人）：需要裁决时回第 ③ 行，由主线程问人。',
]

/** 每条派单都带的一句：回执形状不达标 = 这单没做完，不是「大概齐」。 */
const RECEIPT_RULE = `回执只认上面三行、且每行 ≤${RECEIPT_CHARS} 字符（超限 = 回执不合规，不是「内容更丰富」）：结论 PASS 而第 ② 行给不出真实输出 = 未完成；第 ③ 行不许留空（没有待裁决就写「无」）。`

/**
 * 派单包：把「哪张卡 + 卡正文切片 + 门禁是不是裁决 + 回执怎么写」装配成一个对象。
 *
 * @param {{result: object, card: string, lang?: 'cn'|'en', quote: object, done?: string[], stopMarks?: Array<{line:number,text:string}>}} input
 */
export function dispatchOf({ result, card, lang = 'cn', quote, done = [], stopMarks = [] }) {
  const chain = chainStateOf(result, done)
  // 「在不在链里」与「链上第几张」都取自**链状态**（`result.chain` 的元素没有序号字段，
  // 第一版写成 `step.index` 于是文本回执印出「第 undefined / 27 张」——序号只有链状态知道）。
  const entry = chain.cards.find((c) => c.card === card) || null
  const { gate, why } = gateWhyOf(card, result.facts, result.effTier)
  return {
    schema: SCHEMA,
    mode: 'dispatch',
    card,
    title: quote.title,
    lang,
    dir: lang === 'en' ? 'playbook_EN' : 'playbook',
    file: quote.file,
    inChain: !!entry,
    chainIndex: entry ? entry.index : null,
    gate,
    gateWhy: why,
    // 类型化结果：子 agent 拿不到人，所以门禁必须以**数据**返回，由主线程决定停不停。
    needVerdict: {
      required: gate !== 'notice',
      gate,
      why: entry ? why : `${why}；此卡不在本次事实算出的链里（按需触发或主线程点名），工具算不出它在该链中的位置`,
      stopLines: stopMarks.map((m) => m.line),
    },
    chain,
    receipt: RECEIPT_LINES,
    receiptChars: RECEIPT_CHARS,
    receiptRule: RECEIPT_RULE,
    constraints: CONSTRAINTS,
    // 切片台账：派发方与收件方各自都能复核「这段文字 = 卡文件的第 N~M 行」。
    slice: {
      from: quote.from, to: quote.to, totalLines: quote.totalLines,
      lines: quote.lines, chars: quote.chars, bytes: quote.bytes, sha256: quote.sha256,
      whole: quote.from === 1 && quote.to === quote.totalLines,
    },
    // 口径与 route-core 的账本同一条：CJK 约 2 字符/token（dsh-dcp）。
    tokensApprox: Math.round(quote.chars / 2),
    stopMarks,
    text: quote.raw,
    rendered: quote.rendered,
  }
}

const GATE_LABEL = { notice: '轻确认', verdict: '裁决', 'human-action': '人执行' }

export function fmtChain(state, result, opts = {}) {
  const out = []
  out.push('Roadbook route 链状态（--chain）')
  out.push(`事实：${JSON.stringify(result.facts)}`)
  out.push(`档位：${result.tier}${result.tier === 'pending' ? `（按 ${result.effTier} 出链）` : ''} —— ${result.tierReason}`)
  out.push('')
  out.push(`链（${state.total} 张；已完结 ${state.doneCount} / 未完结 ${state.total - state.doneCount}）：`)
  const MARK = { done: '[已完结]', current: '[当前]  ', todo: '[待办]  ' }
  for (const c of state.cards) {
    out.push(`  ${String(c.index).padStart(2)}. ${MARK[c.state]} ${c.card}  门禁=${GATE_LABEL[c.gate]}${c.optional ? '  [可选]' : ''}`)
    out.push(`      ${c.why}`)
  }
  out.push('')
  if (state.current) {
    const cur = state.cards.find((c) => c.card === state.current)
    out.push(`当前：${state.current}（门禁=${GATE_LABEL[cur.gate]}）`)
    out.push(`派单：${opts.dispatchCmd ? `${opts.dispatchCmd} ` : ''}--dispatch ${state.current}${opts.factsArg ? ` --facts '${opts.factsArg}'` : ''}`
      + `${state.doneCount ? ` --done '${state.cards.filter((c) => c.state === 'done').map((c) => c.card).join(',')}'` : ''}`)
  } else {
    out.push('当前：无（链已走完）—— 下一张由 STATE.md 决定（0-1 硬规则 10 的路由）。')
  }
  if (state.outOfOrder.length) out.push(`⚠ 顺序提醒（观测项，不是判红）：${state.outOfOrder.join(', ')} 已完结但排在当前卡之后 —— 链漂了、或可选卡被跳过，两种情况都值得看一眼。`)
  for (const w of result.warnings) out.push(`⚠ ${w}`)
  return out.join('\n')
}

export function fmtChainJson(state, result) {
  return JSON.stringify({
    schema: SCHEMA,
    mode: 'chain',
    facts: result.facts,
    tier: result.tier,
    tierReason: result.tierReason,
    effTier: result.effTier,
    total: state.total,
    doneCount: state.doneCount,
    current: state.current,
    outOfOrder: state.outOfOrder,
    cards: state.cards.map((c) => ({
      index: c.index, card: c.card, state: c.state, gate: c.gate, optional: c.optional, why: c.why,
    })),
    warnings: result.warnings,
  }, null, 2)
}

/** 文本派单包：给子 agent 的那一段就是「从这里往下整段贴进派单」。 */
export function fmtDispatch(pkg) {
  const out = []
  out.push('Roadbook route 派单包（--dispatch）—— 下面整段原样贴进子 agent 的派单')
  out.push(`卡：${pkg.card} · ${pkg.title}`)
  out.push(`文件：${pkg.dir}/${pkg.file}（第 ${pkg.slice.from}-${pkg.slice.to} 行${pkg.slice.whole ? '，本切片 = 整张卡' : ''} / 共 ${pkg.slice.totalLines} 行）`)
  out.push(`切片：${pkg.slice.lines} 行 · ${pkg.slice.bytes} 字节 · ≈${pkg.tokensApprox} tokens ｜ sha256：${pkg.slice.sha256}`)
  out.push(`链：第 ${pkg.chainIndex === null ? '（链外）' : pkg.chainIndex} / ${pkg.chain.total} 张 ｜ 当前 ${pkg.chain.current || '无'} ｜ 已完结 ${pkg.chain.doneCount}`)
  out.push(`门禁：${GATE_LABEL[pkg.gate]}（${pkg.gate}）—— ${pkg.gateWhy}`)
  out.push(`needVerdict：${pkg.needVerdict.required ? `true —— 到了要裁决的那一步就停，回第 ③ 行，不许自己拍` : 'false —— 轻确认档，做完回执即可'}`)
  if (pkg.needVerdict.stopLines.length) {
    out.push(`本切片里命中停下标记的行：${pkg.needVerdict.stopLines.join(', ')}（这些行是卡自己写的停点，逐字读它们，别照本行转述行动）`)
  } else {
    out.push('本切片里没有命中停下标记的行（**不等于没有门禁** —— 门禁以上面的 needVerdict 为准）。')
  }
  out.push('')
  out.push('约束（只给指针，规则正文在卡与 AGENTS.md 里）：')
  for (const c of pkg.constraints) out.push(`  · ${c}`)
  out.push('')
  out.push(`回执（恰好三行，每行 ≤${pkg.receiptChars} 字符）：`)
  for (const r of pkg.receipt) out.push(`  ${r}`)
  out.push(`  ${pkg.receiptRule}`)
  out.push('')
  out.push('── 卡正文（逐字节切片；剥掉每行行首的 `行号| ` 就是卡原文）──')
  out.push(pkg.rendered)
  return out.join('\n')
}

export function fmtDispatchJson(pkg) {
  return JSON.stringify({
    schema: pkg.schema,
    mode: pkg.mode,
    card: pkg.card,
    title: pkg.title,
    lang: pkg.lang,
    dir: pkg.dir,
    file: pkg.file,
    inChain: pkg.inChain,
    chainIndex: pkg.chainIndex,
    gate: pkg.gate,
    gateWhy: pkg.gateWhy,
    needVerdict: {
      required: pkg.needVerdict.required,
      gate: pkg.needVerdict.gate,
      why: pkg.needVerdict.why,
      stopLines: pkg.needVerdict.stopLines,
    },
    chain: {
      total: pkg.chain.total, doneCount: pkg.chain.doneCount, current: pkg.chain.current, outOfOrder: pkg.chain.outOfOrder,
    },
    receipt: pkg.receipt,
    receiptChars: pkg.receiptChars,
    receiptRule: pkg.receiptRule,
    constraints: pkg.constraints,
    slice: pkg.slice,
    tokensApprox: pkg.tokensApprox,
    stopMarks: pkg.stopMarks,
    text: pkg.text,
  }, null, 2)
}
