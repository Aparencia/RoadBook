#!/usr/bin/env node
/**
 * roadbook route —— 「事实 → 卡片链」的确定性路由
 *
 * 为什么存在：`SKILL.md` 用 41 行散文做路由、`0-1 驱动卡` 用 11 条分支做意图路由，
 * 「触发条件成不成立」由 agent 现场裁量。本工具把触发条件变成**可复核的输入**：
 * 同一组事实必得同一条链，输出可被 diff、可被复核、可被写进 STATE.md。
 *
 * 三条自我约束（照母版既有契约，别把它变成第三处真相）：
 *   1. 不新增判据。每张卡的进入条件都带 `evidence`（卡文件 + 锚点词），
 *      `--audit` 回读该卡的**锚点区**（H1 行 + 触发行，见 `anchorAreaOf`）确认锚点仍在；
 *      卡改了而镜像没改 = 判红退出 1。
 *   2. 档位判据逐字镜像 `playbook/2-1-功能调研.md` 动作 5 的判据表；工具只做代入。
 *   3. 与现行规则不同的建议（如「实测后可降档」）只出现在 `proposals[]`，
 *      明确标注「未改卡」，不伪装成规则。
 *
 * 退出码（与 `skills/roadbook-atlas/bin/atlas.mjs` 同一套纪律：非 0 永远不许描述成成功）：
 *   0 = 正常（含 `--help`）
 *   1 = 审计判红（镜像失配 / 幽灵引用 / 双语缺份）或事实非法（JSON 读不出、未知事实键、取值越界）
 *   2 = 用法错误（未知参数、参数缺取值、未知场景）
 *
 * 用法：
 *   node skills/roadbook/bin/route.mjs                      # 问题清单 + 端点场景示例
 *   node skills/roadbook/bin/route.mjs --questions [--json]
 *   node skills/roadbook/bin/route.mjs --scenario endpoint-chart [--json]
 *   node skills/roadbook/bin/route.mjs --facts '{"hasUI":true,"goLive":true}' [--json]
 *   node skills/roadbook/bin/route.mjs --facts-file facts.json [--json]
 *   node skills/roadbook/bin/route.mjs --audit [--json]      # 镜像锚点/双语/幽灵引用自检
 *   node skills/roadbook/bin/route.mjs --help
 *
 * 零依赖、不 spawn 子进程；只用 node:fs / node:path / node:url 读盘。
 * `--json` 的键序固定（同一组事实两次运行逐字节相同），供测试与回执 diff。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..') // skills/roadbook/bin → 母版根
export const CN_DIR = join(ROOT, 'playbook')
export const EN_DIR = join(ROOT, 'playbook_EN')
/**
 * 卡文件名：`<阶段>-<序号>-<名字>.md`。
 *
 * 两段都必须是 `\d+`：**2026-10-06 实测事故**——旧写法 `/^(\d-\d)-/` 只认一位数字，
 * 于是新增的 `7-10-*.md` 不匹配，`scanDir` 静默 `continue`，`--audit` 报「44 张 ·
 * 双语无缺份 · 判绿」，而磁盘与 design §4 表都是 45 张。一张卡对扫描器不存在 =
 * 路由永远到不了它，**而门禁与自进化信号（S6 只看退出码）双双判绿**——这正是本仓
 * 反复定义的那类假绿。放宽为多位数字，并把「认不出的文件」报出来（见 scanDir）。
 */
const ID_RE = /^(\d+-\d+)-(.+)\.md$/
/** 锚点只许取自这两类行：H1 与触发行（`> 触发：…` / `> Trigger: …`）。 */
const H1_RE = /^#\s+\S/
const TRIGGER_RE = /^>\s*(?:触发|Trigger)/
export const SCHEMA = 'roadbook-route/1'
/** 退出码：0 正常 / 1 审计判红或事实非法 / 2 用法错误。 */
const EXIT = { ok: 0, red: 1, usage: 2 }

/* ───────────────────────── 事实：问用户的问题 ───────────────────────── */

/** 用户能回答的 9 个是非题 + 3 个 agent 回填项。0-1 硬规则 10：问题自带推荐答案。 */
export const FACTS = [
  { key: 'greenfield', who: 'user', type: 'enum', values: ['new', 'existing'], def: 'new',
    ask: '这个项目是全新的（还没代码），还是已有一堆代码要接进来？' },
  { key: 'hasUI', who: 'user', type: 'bool', def: true,
    ask: '它有界面吗？（页面 / 窗口 / 表单——能用眼睛看的东西）' },
  { key: 'goLive', who: 'user', type: 'bool', def: false,
    ask: '做完要真的放到网上、让别人打开来用吗？' },
  { key: 'publicService', who: 'user', type: 'bool', def: false,
    ask: '上线后是「不认识的人也能访问」吗？（不是只给你自己或同事）' },
  { key: 'personalData', who: 'user', type: 'bool', def: false,
    ask: '会记下别人的个人信息吗？（手机号 / 邮箱 / 位置 / 身份）' },
  { key: 'newDependency', who: 'user', type: 'bool', def: false,
    ask: '要不要装现成的库 / 插件 / 外部工具？（图表库、UI 框架、MCP server 都算）' },
  { key: 'redLine', who: 'user', type: 'bool', def: false,
    ask: '会不会碰到：登录鉴权 / 收钱 / 删别人的数据 / 改数据库表 / 给外部系统开接口？' },
  { key: 'team', who: 'user', type: 'bool', def: false,
    ask: '除你之外还有别人参与吗？（同事 / 客户 / 外包）' },
  { key: 'vague', who: 'user', type: 'bool', def: false,
    ask: '你能一句话说清「给谁用、做什么、怎么算成功」吗？（说不清 = 是）' },
  { key: 'scale', who: 'agent', type: 'enum', values: ['tiny', 'singlepage', 'normal', 'large', 'unknown'], def: 'unknown',
    ask: '（agent 填）第一版规模：tiny=≤3 文件 ≤100 行；singlepage=1 入口页/无后端/无依赖 ≤5 文件 ≤400 行；normal=普通功能；large=多模块' },
  { key: 'hasCI', who: 'agent', type: 'bool', def: false,
    ask: '（agent 填）项目已经有自动检查（CI / check.ps1）吗？' },
  { key: 'structChange', who: 'agent', type: 'bool', def: false,
    ask: '（agent 填）这次改动会不会改变系统结构？（新增或移除模块、换存储、拆或合服务——结构变了才要回 3-7 架构定义）' },
]

/* ─────────────────── 卡表：进入条件 = 卡片自己写的触发行 ─────────────────── */

/**
 * `card` = 卡号；`anchor` = 必须出现在该卡**锚点区**（H1 行或触发行）里的原话片段（--audit 回读校验）。
 * 卡改了触发条件而这里没改 → audit 判红，逼着两边同批改。
 * 锚点**只许取自 H1 与触发行**：正文里的同名词（比如「等用户验收」）不算数——正文会随细节改动漂移。
 */
export const STEPS = [
  { card: '1-1', anchor: '立项', when: (f) => f.greenfield === 'new', why: '空的新想法 → 先做能不能做的调研' },
  { card: '1-2', anchor: '1-1', when: (f) => f.greenfield === 'new', why: 'Go 之后选型、生成骨架、连远端' },
  { card: '1-3', anchor: '已有代码', when: (f) => f.greenfield === 'existing', why: '已有代码 → 反推结构、装守护脚本' },
  { card: '2-1', anchor: '驱动卡收到新功能类意图', when: () => true, why: '新功能意图的固定入口（也是定档位的地方）' },
  { card: '2-3', anchor: 'S 档不走本卡', when: (f) => f.vague === true, why: '需求说不清（三种以上合理解释）' },
  { card: '2-2', anchor: 'S 档用简版', when: () => true, why: '定边界与验收标准（S 档走简版三节）' },
  { card: '2-4', anchor: '（M/L 档）', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档必走：给非功能需求定可测阈值' },
  { card: '2-5', anchor: '档位 = L', when: (f) => tierOf(f).tier === 'L' || f.team === true, why: 'L 档或不止一方参与' },
  { card: '3-7', anchor: '项目首次成型', when: (f) => f.greenfield === 'new' || f.structChange === true, why: '首次成型或结构变更 → 边界 / 干系人关注点 / 四张视图 / 质量属性权衡' },
  { card: '7-9', anchor: '首次运行任何第三方技能', when: (f) => f.newDependency === true, why: '装/启用外部件必须先过准入，结论由人裁决' },
  { card: '3-1', anchor: '档位 = L', when: (f) => tierOf(f).tier === 'L', why: 'L 档加走：动手前把数据/接口/组件钉死' },
  { card: '3-2', anchor: '红线域', when: (f) => f.redLine === true, why: '红线域强制升 L 并做威胁建模' },
  { card: '3-3', anchor: 'M/L 档', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档：设计批准后定测试策略' },
  { card: '3-4', anchor: '要做界面', when: (f) => f.hasUI === true, why: '有界面：屏幕、八态、按钮与表单规格' },
  { card: '3-5', anchor: '3-4', when: (f) => f.hasUI === true, why: '3-4 定稿后定视觉取值' },
  { card: '3-6', anchor: '3-5', when: (f) => f.hasUI === true, why: '3-5 定稿后定动效与降级' },
  { card: '7-5', anchor: '上线公开服务', when: (f) => f.personalData === true || f.publicService === true, why: '收个人信息或对外公开服务 → 合规与隐私' },
  { card: '7-6', anchor: '上线面向公众', when: (f) => f.publicService === true, why: '面向公众 → 多语言与可访问性' },
  { card: '4-1', anchor: '2-2 需求范围获用户确认后', when: () => true, why: '写代码（分批 + 净增量账本）' },
  { card: '4-2', anchor: 'M/L 档必走', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档：合入前审查，独立会话执行' },
  { card: '4-3', anchor: '全档必走', when: () => true, why: '验证：完成的唯一定义（check 退出码 0）' },
  { card: '4-6', anchor: '交付前要给人用', when: (f) => f.hasUI === true && f.goLive === true, why: '有界面且要给人用 → 交付前拿给人走一遍，看他在哪卡住' },
  { card: '4-4', anchor: '首次搭建 CI', optional: true, when: (f) => f.hasCI === false && f.goLive === true, why: '上线但没 CI → 至少把门禁接到每次提交' },
  { card: '4-5', anchor: '需要新环境', when: (f) => f.goLive === true, why: '上线 = 要有 prod 环境与配置/密钥来源' },
  { card: '5-1', anchor: '验收通过后', when: () => true, why: '收尾入库（归档十一查 + 孤儿五张清单）' },
  { card: '5-2', anchor: '上线/让别人用', when: (f) => f.goLive === true, why: '里程碑发版（tag 由人打）' },
  { card: '5-3', anchor: 'L 档发布', when: (f) => f.goLive === true && tierOf(f).tier === 'L', why: 'L 档/高风险发布：放量阶梯与回滚预案' },
  { card: '5-4', anchor: '5-2 发布完成', when: (f) => f.goLive === true, why: '发完进观测窗（默认 24h）' },
  { card: '5-5', anchor: '改数据结构后', when: (f) => f.goLive === true && tierOf(f).tier === 'L', why: 'L 档或改过数据结构 → 恢复演练' },
  { card: '7-7', anchor: '交付验收', when: (f) => f.team === true, why: '要交接给别人 → 用户文档与交接清单' },
]

/** 2-1 判据表的 L 行，逐条镜像；命中任一即入 L。 */
const L_JUDGE = [
  ['newDependency', '引入新依赖'],
  ['redLine', '触碰红线域（认证/鉴权、支付/计费、删除真实数据、改表结构、新增对外接口）'],
  ['modulesMany', '跨模块'],
  ['breakingSchema', '破坏性表结构'],
  ['newPageSystem', '新页面体系'],
]

/** 门禁：0-1 硬规则 8 —— 个人档默认轻确认，只有 L 档与红线域用裁决。 */
const HARD_VERDICT = new Set(['2-1', '2-2', '4-3']) // 卡自带「停下等确认 / 用户说了确认 / 等用户验收」
const HUMAN_ACTION = new Set(['5-2']) // 执行发布部署在不可委托清单里（打 tag 自 2026-10-05.2 起由 agent 在发布流程内执行）

/* ───────────────────────────── 读盘 ───────────────────────────── */

/**
 * 锚点区 = H1 行 + 触发行（缺哪行就只取另一行）。
 *
 * 为什么不是「前 3 行」：4-3 卡的锚点「等用户验收」实际落在 `:120` 的正文里，
 * 头部 3 行扫不到 → 审计必然假红。**正文会随细节改动漂移，锚点只认进入条件本身**。
 */
export function anchorAreaOf(lines) {
  const h1 = lines.find((line) => H1_RE.test(line)) || ''
  const trigger = lines.find((line) => TRIGGER_RE.test(line)) || ''
  return { h1, trigger, anchorArea: [h1, trigger].filter(Boolean).join('\n') }
}

export function scanDir(dir) {
  const out = new Map()
  // 「看得见的 .md」与「认得出的卡」的差额。挂在 Map 上的 expando 数组：现有消费者
  // 只用 Map 方法（get / has / size / keys），加这个属性不影响它们；audit 读不到时
  // 用 `?? []` 兜底（测试自己造的合成 Map 因此仍然成立）。
  out.unparsed = []
  if (!existsSync(dir)) return out
  for (const file of readdirSync(dir).sort()) {
    const m = ID_RE.exec(file)
    if (!m) {
      if (file.endsWith('.md')) out.unparsed.push(file)
      continue
    }
    const text = readFileSync(join(dir, file), 'utf8')
    const lines = text.split(/\r?\n/)
    const { h1, trigger, anchorArea } = anchorAreaOf(lines)
    out.set(m[1], {
      id: m[1], file, dir: dir === CN_DIR ? 'playbook' : 'playbook_EN',
      h1, trigger, anchorArea,
      lines: lines.length,
      chars: text.length,
      checkboxes: (text.match(/^\s*- \[ \]/gm) || []).length,
      psBlocks: (text.match(/^```powershell/gm) || []).length,
      stops: (text.match(/^.*(停下等|等待你裁决|等用户(说|确认|裁决|放行)|停下升级|停下，输出|等用户处理).*$/gm) || []).length,
      actions: (text.match(/^\*\*动作/gm) || []).length,
    })
  }
  return out
}

/* ───────────────────────────── 路由 ───────────────────────────── */

export function tierOf(f) {
  for (const [key, label] of L_JUDGE) {
    if (f[key] === true) return { tier: 'L', reason: `2-1 判据表 L 行「${label}」` }
  }
  if (f.scale === 'tiny' || f.scale === 'singlepage') {
    return { tier: 'S', reason: f.scale === 'tiny'
      ? '2-1 判据表 S 行：≤3 文件且 ≤100 行，无新依赖'
      : '2-1 判据表 S 行·单页静态应用特例：1 入口页 + 无后端 + 无依赖 → ≤5 文件且 ≤400 行' }
  }
  if (f.scale === 'normal' || f.scale === 'large') {
    return { tier: 'M', reason: '2-1 判据表 M 行：限 1~2 个模块内，不新增外部包、无破坏性表结构' }
  }
  return { tier: 'pending', reason: 'S/M 分界取决于实测文件数·行数，开工前未知（2-1 判据表 S 行）' }
}

export function gateOf(card, f, tier) {
  if (HUMAN_ACTION.has(card)) return 'human-action'
  if (HARD_VERDICT.has(card)) return 'verdict'
  if (tier === 'L' || f.redLine === true) return 'verdict'
  return 'notice'
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
  return { problems, cardsCn: cn.size, cardsEn: en.size, unused }
}

/* ───────────────────────────── 预设场景 ───────────────────────────── */

export const SCENARIOS = {
  endpoint: {
    note: '终点举例：喝水计数 + 本周柱状图（手写 CSS 条形）',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: false, personalData: false,
      newDependency: false, redLine: false, team: false, vague: false, scale: 'singlepage', hasCI: false },
  },
  'endpoint-chart': {
    note: '同一件事，但装了图表库（npm i chart.js）',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: false, personalData: false,
      newDependency: true, redLine: false, team: false, vague: false, scale: 'singlepage', hasCI: false },
  },
  'public-saas': {
    note: '对外服务：公众可访问 + 收个人信息 + 登录',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: true, personalData: true,
      newDependency: true, redLine: true, team: true, vague: true, scale: 'large', hasCI: false },
  },
  'local-tool': {
    note: '只给自己用的本地小工具，不发布',
    facts: { greenfield: 'new', hasUI: true, goLive: false, publicService: false, personalData: false,
      newDependency: false, redLine: false, team: false, vague: false, scale: 'tiny', hasCI: true },
  },
}

/* ───────────────────────────── 输出 ───────────────────────────── */

const GATE_LABEL = { notice: '轻确认', verdict: '裁决', 'human-action': '人执行' }

function usage() {
  return [
    'Usage:',
    '  route                          # 问题清单 + 端点场景示例（默认）',
    '  route --questions [--json]     # 只出 9 个用户问题 + 2 个 agent 回填项',
    '  route --scenario <name> [--json]',
    '  route --facts \'<json>\' [--json]',
    '  route --facts-file <path> [--json]',
    '  route --audit [--json]         # 镜像锚点 / 双语缺份 / 幽灵引用自检',
    '  route --help',
    '',
    `Scenarios: ${Object.keys(SCENARIOS).join(', ')}`,
    'Exit codes: 0 ok / 1 audit red or illegal facts / 2 usage error',
  ].join('\n')
}

function fail(message, code = EXIT.red) {
  console.error(message)
  process.exit(code)
}

function fmtQuestions() {
  const user = FACTS.filter((d) => d.who === 'user')
  const agent = FACTS.filter((d) => d.who === 'agent')
  const lines = [`Roadbook 路由问题（回答这 ${user.length} 个是非题就够；agent 回填 ${agent.length} 项）`, '']
  let n = 0
  for (const d of user) { n += 1; lines.push(`${n}. ${d.ask}  [默认 ${JSON.stringify(d.def)}]`) }
  lines.push('')
  for (const d of agent) lines.push(`agent·${d.key}：${d.ask}  [默认 ${JSON.stringify(d.def)}]`)
  return lines.join('\n')
}

function fmtRoute(result, cn, opts = {}) {
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
function fmtJson(result, cn, opts = {}) {
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

function fmtQuestionsJson() {
  return JSON.stringify({
    schema: SCHEMA,
    mode: 'questions',
    userQuestions: FACTS.filter((d) => d.who === 'user').map((d) => ({ key: d.key, type: d.type, def: d.def, ask: d.ask })),
    agentBackfill: FACTS.filter((d) => d.who === 'agent').map((d) => ({ key: d.key, type: d.type, def: d.def, ask: d.ask })),
  }, null, 2)
}

/* ───────────────────────────── CLI ───────────────────────────── */

const MODES = ['demo', 'questions', 'audit', 'scenario', 'facts']

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
  const { problems, cardsCn, cardsEn, unused } = audit(cn, en)
  if (opts.json) {
    console.log(JSON.stringify({ schema: SCHEMA, mode: 'audit', cardsCn, cardsEn, mirroredSteps: STEPS.length, problems, unused }, null, 2))
  } else {
    console.log('Roadbook route 自检回执')
    console.log(`playbook/ ${cardsCn} 张 · playbook_EN/ ${cardsEn} 张 · 镜像覆盖 ${STEPS.length} 条进入条件（锚点只取 H1 与触发行）`)
    console.log(`未被任何进入条件引用的卡（正常：事故线/回访线/治理线）：${unused.join(', ') || '无'}`)
    console.log(problems.length ? `判红 ${problems.length} 条：` : '判绿：镜像锚点与卡一致，双语无缺份，无幽灵引用。')
    for (const p of problems) console.log(`  ✗ ${p}`)
  }
  process.exit(problems.length ? EXIT.red : EXIT.ok)
}

function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (err) { fail(err.message, EXIT.usage) }

  if (opts.mode === 'help') { console.log(usage()); return }
  if (opts.mode === 'audit') { runAudit(opts); return }

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
