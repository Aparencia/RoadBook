/**
 * roadbook route —— **路由与审计的纯逻辑**：档位 / 门禁 / 事实校验 / 出链 / 账本 / 审计
 *
 * 同输入必同输出：本文件不读盘（`scanDir` 只作为 `audit` 的默认参数被调用一次）、
 * 不打印、不退出。CLI 与渲染分别在 `route.mjs` / `route-format.mjs`。
 */
import { CN_DIR, EN_DIR, FACTS, HARD_VERDICT, HUMAN_ACTION, STEPS, UNREACHABLE_OK, tierOf } from './route-data.mjs'
import { scanDir } from './route-cards.mjs'

/* ───────────────────────────── 路由 ───────────────────────────── */

/**
 * 门禁判定 **+ 它的理由**。两者在同一个分支里产出，是刻意的：派单包要告诉子 agent
 * 「这一张为什么是裁决档」，而若理由另写一张表，两处迟早对不上（改了一处忘了另一处）。
 * 理由只写**指针**（判据在哪条硬规则 / 哪份文件），不复述判据正文。
 */
export function gateWhyOf(card, f, tier) {
  if (HUMAN_ACTION.has(card)) {
    return { gate: 'human-action', why: 'AGENTS.md A 类不可委托清单：这一步的机械落点是 deny，只能人做' }
  }
  if (HARD_VERDICT.has(card)) {
    return { gate: 'verdict', why: `卡 ${card} 自带停下判据（等用户确认 / 等用户验收）—— 0-1 硬规则 8 的裁决档` }
  }
  if (tier === 'L' || f.redLine === true) {
    return { gate: 'verdict', why: tier === 'L' ? 'L 档：门禁是裁决（0-1 硬规则 8）' : '红线域：门禁是裁决（0-1 硬规则 8）' }
  }
  return { gate: 'notice', why: '个人档默认轻确认：说一句就能继续（0-1 硬规则 8）' }
}

/** 只取门禁档位（`route().chain[].gate` 用它；需要理由时用 `gateWhyOf`）。 */
export function gateOf(card, f, tier) {
  return gateWhyOf(card, f, tier).gate
}

/** 校验并补默认值：未知键、类型不符、枚举越界都算「事实非法」（CLI 退出码 1）。 */
export function normalizeFacts(rawFacts = {}) {
  if (rawFacts === null || typeof rawFacts !== 'object' || Array.isArray(rawFacts)) {
    throw new Error('事实非法：事实必须是一个 JSON 对象，例如 {"hasUI":true,"goLive":true}')
  }
  const errors = []
  const known = new Set(FACTS.map((d) => d.key))
  for (const key of Object.keys(rawFacts)) {
    if (!known.has(key)) errors.push(`未知事实键 ${JSON.stringify(key)}（可用键：${FACTS.map((d) => d.key).join(', ')}）`)
  }
  const facts = {}
  for (const d of FACTS) {
    const v = rawFacts[d.key]
    if (v === undefined) { facts[d.key] = d.def; continue }
    if (d.type === 'bool') {
      if (typeof v !== 'boolean') errors.push(`事实 ${d.key} 必须是 true / false，实得 ${JSON.stringify(v)}`)
      else facts[d.key] = v
      continue
    }
    if (!d.values.includes(v)) errors.push(`事实 ${d.key} 只能是 ${d.values.join(' / ')}，实得 ${JSON.stringify(v)}`)
    else facts[d.key] = v
  }
  if (errors.length) throw new Error(`事实非法（${errors.length} 条）：\n  - ${errors.join('\n  - ')}`)
  return facts
}

/** 按 FACTS 声明顺序重排事实键 —— `--json` 的键序必须与输入写法无关。 */
export function orderedFacts(facts) {
  const out = {}
  for (const d of FACTS) out[d.key] = facts[d.key]
  return out
}

export function route(rawFacts = {}) {
  const facts = normalizeFacts(rawFacts)
  const { tier, reason } = tierOf(facts)
  const effTier = tier === 'pending' ? 'M' : tier // 未定时按较严的一档出链，并显式标注
  const chain = []
  for (const s of STEPS) {
    if (!s.when(facts)) continue
    chain.push({
      card: s.card, why: s.why, gate: gateOf(s.card, facts, effTier),
      optional: !!s.optional,
      tentative: tier === 'pending' && ['2-4', '3-3', '4-2', '4-6'].includes(s.card),
    })
  }
  const warnings = []
  if (tier === 'pending') {
    warnings.push('档位未定（S/M 分界要实测文件数与行数）：下面按 M 出链，标 [档位待定] 的三张卡在实测够小后可去掉。')
  }
  if (facts.newDependency && facts.scale === 'singlepage') {
    warnings.push('「单页静态应用特例」与「引入新依赖」互斥：装库即判 L，S 档特例作废。')
  }
  if (facts.goLive && !facts.redLine && effTier !== 'L') {
    warnings.push('当前不是 L 档但要走发布：若发布涉及 auth/支付/删数据/对外接口，按 2-1 判据立即升 L（只升不降）。')
  }
  const proposals = []
  if (tier !== 'L') {
    proposals.push('（未改卡）实测后允许「用实测文件数·行数·依赖清单」申请降档，替代现行「只升不降」的预估锁定；现行规则见 SKILL.md 红线与门禁一节。')
  }
  proposals.push('（未改卡）门禁级别由本工具算出后写进回执，避免每张卡各自解释「轻确认 / 裁决」。')
  return { facts, tier, tierReason: reason, effTier, chain, warnings, proposals }
}

export function ledger(cn, chain) {
  const acc = { cards: 0, lines: 0, chars: 0, checkboxes: 0, psBlocks: 0, stops: 0, actions: 0 }
  const missing = []
  for (const step of chain) {
    const c = cn.get(step.card)
    if (!c) { missing.push(step.card); continue }
    acc.cards += 1
    for (const k of ['lines', 'chars', 'checkboxes', 'psBlocks', 'stops', 'actions']) acc[k] += c[k]
  }
  acc.tokensApprox = Math.round(acc.chars / 2) // dsh-dcp 的 CJK 口径：约 2 字符/token
  acc.missing = missing
  return acc
}

export function audit(cn = scanDir(CN_DIR), en = scanDir(EN_DIR)) {
  const problems = []
  for (const s of STEPS) {
    const c = cn.get(s.card)
    if (!c) { problems.push(`幽灵引用：镜像里的卡 ${s.card} 在 playbook/ 不存在`); continue }
    if (!c.anchorArea.includes(s.anchor)) {
      problems.push(`镜像失配：卡 ${s.card} 的锚点区（H1 + 触发行）找不到锚点「${s.anchor}」——卡改了而 route.mjs 没改`)
    }
  }
  for (const id of cn.keys()) if (!en.has(id)) problems.push(`双语缺份：playbook/${id} 有，playbook_EN/ 没有`)
  for (const id of en.keys()) if (!cn.has(id)) problems.push(`双语缺份：playbook_EN/${id} 有，playbook/ 没有`)
  // 认不出的文件名必须判红：它对扫描器不存在，路由永远到不了；旧行为是静默跳过，
  // 于是「少扫一张卡」被报成「双语无缺份」。判据是**看得见的文件数 = 认得出的卡数**。
  for (const file of cn.unparsed ?? []) {
    problems.push(`无法识别的卡文件名：playbook/${file} —— 扫描器看不见它（卡号须形如 <阶段>-<序号>-<名字>.md，两段都可多位数字）`)
  }
  for (const file of en.unparsed ?? []) {
    problems.push(`无法识别的卡文件名：playbook_EN/${file} —— 扫描器看不见它（同上）`)
  }
  const ids = STEPS.map((s) => s.card)
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i)
  if (dup.length) problems.push(`链里有重复卡：${[...new Set(dup)].join(', ')}`)
  const unused = [...cn.keys()].filter((id) => !ids.includes(id)).sort()
  // 「不可达」分两种，输出上必须分得开：白名单内 = 按需触发的正常态；白名单外 = 主线卡漏在链外。
  const unreachableOk = unused.filter((id) => UNREACHABLE_OK.includes(id))
  for (const id of unused) {
    if (!UNREACHABLE_OK.includes(id)) {
      problems.push(`不可达卡：${id} 既不在任何进入条件里，也不在 UNREACHABLE_OK 白名单里——主线卡漏进「正常」那一行 = 路由永远到不了它（要么补进 STEPS，要么显式登记进白名单并写理由）`)
    }
  }
  return { problems, cardsCn: cn.size, cardsEn: en.size, unused, unreachableOk }
}
