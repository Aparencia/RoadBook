/**
 * roadbook route —— **渲染半**：文本回执与 `--json` 回执（纯字符串，无 I/O）
 *
 * `--json` 的键序在这里钉死：同一组事实两次运行必须逐字节相同，否则回执无法 diff、无法复核。
 */
import { FACTS, SCENARIOS, SCHEMA } from './route-data.mjs'
import { ledger, orderedFacts } from './route-core.mjs'

/* ───────────────────────────── 输出 ───────────────────────────── */

const GATE_LABEL = { notice: '轻确认', verdict: '裁决', 'human-action': '人执行' }

export function usage() {
  return [
    'Usage:',
    '  route                          # 问题清单 + 端点场景示例（默认）',
    '  route --questions [--json]     # 只出 9 个用户问题 + 2 个 agent 回填项',
    '  route --scenario <name> [--json]',
    '  route --facts \'<json>\' [--json]',
    '  route --facts-file <path> [--json]',
    '  route --audit [--json]         # 镜像锚点 / 双语缺份 / 幽灵引用自检',
    '  route --quote <卡号>[:<起>-<止>] [--lang cn|en] [--json]',
    '                                 # 卡正文逐字节切片 + 行号 + 哈希（派单内嵌用）',
    '  route --chain --facts <json>|--facts-file <path>|--scenario <name> [--done <卡号,…>] [--json]',
    '                                 # 链状态：哪几张已完结 / 当前是哪张 / 下一张派谁',
    '  route --dispatch <卡号>[:<起>-<止>] <同上事实参数> [--lang cn|en] [--out <path>] [--json]',
    '                                 # 派单包：内嵌卡正文切片 + 门禁类型化结果 + 3 行回执模板',
    '                                 # --out 落盘、stdout 只留一行指针（主线程不背卡正文）',
    '  route --help',
    '',
    `Scenarios: ${Object.keys(SCENARIOS).join(', ')}`,
    'Exit codes: 0 ok / 1 audit red or illegal facts or red chain/slice / 2 usage error',
  ].join('\n')
}

export function fmtQuestions() {
  const user = FACTS.filter((d) => d.who === 'user')
  const agent = FACTS.filter((d) => d.who === 'agent')
  const lines = [`Roadbook 路由问题（回答这 ${user.length} 个是非题就够；agent 回填 ${agent.length} 项）`, '']
  let n = 0
  for (const d of user) { n += 1; lines.push(`${n}. ${d.ask}  [默认 ${JSON.stringify(d.def)}]`) }
  lines.push('')
  for (const d of agent) lines.push(`agent·${d.key}：${d.ask}  [默认 ${JSON.stringify(d.def)}]`)
  return lines.join('\n')
}

export function fmtRoute(result, cn, opts = {}) {
  const out = []
  out.push('Roadbook route 回执')
  out.push(`事实：${JSON.stringify(orderedFacts(result.facts))}`)
  out.push(`档位：${result.tier}${result.tier === 'pending' ? `（按 ${result.effTier} 出链）` : ''} —— ${result.tierReason}`)
  out.push('')
  out.push(`链（${result.chain.length} 张；按顺序走，不许跳段）：`)
  let i = 0
  for (const s of result.chain) {
    i += 1
    const c = cn.get(s.card)
    const tag = [s.optional ? '可选' : '', s.tentative ? '档位待定' : ''].filter(Boolean).join('·')
    out.push(`  ${String(i).padStart(2)}. ${s.card}  ${(c ? c.file.replace(/\.md$/, '') : '?').slice(0, 34).padEnd(36)} 门禁=${GATE_LABEL[s.gate]}${tag ? `  [${tag}]` : ''}`)
    out.push(`      ${s.why}`)
  }
  const led = ledger(cn, result.chain)
  out.push('')
  out.push(`账本（按 playbook/ 现盘复算）：卡数 ${led.cards} · 行数 ${led.lines} · 字符 ${led.chars} · ≈${led.tokensApprox} tokens`
    + ` · 自检框 ${led.checkboxes} · 命令块 ${led.psBlocks} · 停下标记 ${led.stops} · 动作 ${led.actions}`)
  if (led.missing.length) out.push(`缺卡：${led.missing.join(', ')}`)
  const human = result.chain.filter((s) => s.gate !== 'notice')
  out.push(`需要你在场：${human.length} 处 —— ${human.map((s) => `${s.card}(${GATE_LABEL[s.gate]})`).join('、') || '无'}`)
  for (const w of result.warnings) out.push(`⚠ ${w}`)
  for (const p of result.proposals) out.push(`提案 ${p}`)
  if (opts.note) out.push(`场景：${opts.note}`)
  out.push('')
  out.push('收尾：把本回执整段贴进回复（真实命令输出 = 回执三种证据之一），作为「本次按哪条链走」的凭据。')
  return out.join('\n')
}

/** `--json` 的唯一出口：键序在这里钉死，保证同事实两次运行逐字节相同。 */
export function fmtJson(result, cn, opts = {}) {
  const led = ledger(cn, result.chain)
  return JSON.stringify({
    schema: SCHEMA,
    mode: opts.mode,
    scenario: opts.scenario === undefined ? null : opts.scenario,
    facts: orderedFacts(result.facts),
    tier: result.tier,
    tierReason: result.tierReason,
    effTier: result.effTier,
    chain: result.chain.map((s) => ({
      card: s.card, why: s.why, gate: s.gate, optional: s.optional, tentative: s.tentative,
    })),
    ledger: {
      cards: led.cards, lines: led.lines, chars: led.chars, tokensApprox: led.tokensApprox,
      checkboxes: led.checkboxes, psBlocks: led.psBlocks, stops: led.stops, actions: led.actions,
      missing: led.missing,
    },
    warnings: result.warnings,
    proposals: result.proposals,
  }, null, 2)
}

export function fmtQuestionsJson() {
  return JSON.stringify({
    schema: SCHEMA,
    mode: 'questions',
    userQuestions: FACTS.filter((d) => d.who === 'user').map((d) => ({ key: d.key, type: d.type, def: d.def, ask: d.ask })),
    agentBackfill: FACTS.filter((d) => d.who === 'agent').map((d) => ({ key: d.key, type: d.type, def: d.def, ask: d.ask })),
  }, null, 2)
}
