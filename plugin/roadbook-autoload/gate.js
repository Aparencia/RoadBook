/**
 * roadbook-autoload 的动作闸判据（纯逻辑，不 import 任何 dsh 包，可离线单测）。
 *
 * 落在哪：DSH 的 `tools/pre-execute` waterfall（= Claude Code `PreToolUse` 的同进程扩展点），
 * 只支持 `deny` / `ask`（`allow` 不预审批、`defer` 不支持、`updatedInput` 不生效）——
 * 所以这里只产出「拦」与「不拦」，**不做任何参数改写**。
 *
 * 三条规则，按优先级：
 *   ① Team 类工具：只有 roadbook-team 行明确写着 `policy: off` 才拦（用户裁决「装了不用」的机械落点）；
 *      读不到或形状不合格一律放行——不拿猜出来的结论去挡用户的正常协作。
 *   ② A 类红线（不可委托）：命中即拦，**与走不走流程无关**。只能人做的动作不该因为「这轮没按卡开工」
 *      才被拦下，也不该因为「这轮在闲聊」就被放过去。
 *   ③ C7 未按卡开工：开发对话里动写侧工具，而本会话没有卡回执 → 拦。
 *
 * 为什么判据住在这里、接线住在 index.js：本文件同输入必同输出（无文件、无会话状态、无 dsh 依赖），
 * 是「先复现再修」时能离线跑红跑绿的那一层。
 *
 * 已知边界（如实写，不假装覆盖）：
 *   - 引号内的文本按「参数/文案」处理（`git commit -m "migrate X"` 不该拦）；因此
 *     `bash -c "psql …"` 这种嵌套写法只对**数据库客户端名**那一组额外回扫原文才拦得住；
 *   - 判据是**模式**不是解析器：它提高红线动作的成本，不替代 AGENTS.md 里的自查。
 */
import { cardReadState, isSubagentHeader, matchIntent, pickUserText, sessionEvents } from './trigger.js'

/** 写侧工具：会改动工作树的动作。shell 也算——它一样能写文件、动数据库。 */
export const WRITE_TOOLS = ['write', 'edit', 'apply_patch', 'bash', 'pwsh']

/**
 * Team 类工具（精确名）：`policy: off` 时整类拦下。
 * 只读的 `list_agents`（看队友名单）不在名单里 —— 它不改协作状态，拦了只会让模型读不到现状。
 */
export const TEAM_TOOLS = ['spawn_teammate', 'send_message', 'interrupt_agent', 'wait_agent']

/**
 * Team 类工具（前缀）：`team_task_*` 一律算 —— **含**只读的 `team_task_list` / `team_task_get`。
 * 口径来自用户裁决原文（「`team_task_*`」）：policy: off 是「这一轮不搞团队协作」，
 * 那时连协作状态都不该去读（读了也没用，任务板上不会有这一轮的东西）。
 */
export const TEAM_TOOL_PREFIX = 'team_task_'

/**
 * 红线域命令模式（A 类不可委托，取自 AGENTS.md A1–A3 的谓词）。
 * `raw: true` 的那几条还要在**去掉引号前**的原文里再扫一遍：数据库客户端名出现在引号里，
 * 通常正是 `bash -c "psql …"` 这种被包了一层的真执行，而不是提交信息里的一句闲聊。
 */
export const REDLINE_RULES = [
  { id: 'A3', label: '打 git tag', pattern: /\bgit\s+tag\b/i },
  { id: 'A1', label: '执行 SQL（数据库客户端）', pattern: /\b(psql|mysql|sqlcmd|mysqldump)\b/i, raw: true },
  { id: 'A1', label: '执行数据库迁移', pattern: /\b(prisma\s+migrate|alembic|flyway|liquibase|migrat\w*)\b/i },
  { id: 'A2', label: '执行发布部署', pattern: /\bdeploy\w*\b|\bgh\s+release\b|\bpublish\w*\b/i },
  { id: 'A2', label: '推送到生产 / 云平台部署', pattern: /\brsync\b(?=[^\n]*\bprod(uction)?\b)|\bterraform\s+apply\b|\bkubectl\s+apply\b|\bdocker\s+push\b|\baws\s+\S+\s+deploy\b/i },
]

/** 拦下的动作统一带上这条：理由行要让模型知道**下一步怎么走**，不只是「不行」。 */
const NO_RECEIPT_REASON =
  '未按卡开工：先贴卡号与开工回执（读 playbook/ 下对应卡并粘贴该卡开工确认要求的清单原文），或说明本轮不走流程。'

const allow = (rule, note) => ({ decision: 'allow', rule, note, reason: '' })

const deny = (rule, note, reason) => ({ decision: 'deny', rule, note, reason })

/** Team 类工具判定：精确名 + `team_task_` 前缀。 */
export function isTeamTool(tool) {
  if (typeof tool !== 'string' || tool.length === 0) return false
  return TEAM_TOOLS.includes(tool) || tool.startsWith(TEAM_TOOL_PREFIX)
}

/** 写侧工具判定。 */
export function isWriteTool(tool) {
  return typeof tool === 'string' && WRITE_TOOLS.includes(tool)
}

/**
 * 取工具调用的命令行文本。只认 `command` / `cmd` / `script` 三个键：
 * `write`/`edit` 的 `content` 里出现「deploy」是**要写的正文**，不是要执行的命令，绝不能拿它拦人。
 */
export function commandOf(args) {
  if (typeof args === 'string') return args
  if (args === null || typeof args !== 'object') return ''
  for (const key of ['command', 'cmd', 'script']) {
    const value = args[key]
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(' ')
  }
  return ''
}

/** 去掉引号内的文本（`-m "…"` 是提交信息 / 文案，不是被执行的程序名）。 */
export function stripQuoted(text) {
  return String(text ?? '')
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
}

/**
 * 命中哪条红线（没有则 undefined）。
 * @param {string} command - 命令行文本
 */
export function matchRedline(command) {
  const raw = String(command ?? '')
  if (raw.trim().length === 0) return undefined
  const stripped = stripQuoted(raw)
  for (const rule of REDLINE_RULES) {
    if (rule.pattern.test(stripped)) return rule
    if (rule.raw === true && rule.pattern.test(raw)) return rule
  }
  return undefined
}

/**
 * 本会话最后一条**用户亲手发的**消息文本（从会话事件日志里取）。
 * 判据只看会话日志：工具调用发生在回合中途，那时没有「本轮 messages」可读。
 * 读不到日志返回 undefined —— 调用方按「判不了」放行，不猜。
 */
export function sessionUserText(session) {
  const events = sessionEvents(session)
  if (events.length === 0) return undefined
  const messages = []
  for (const event of events) {
    if (event?.type !== 'user/message') continue
    const message = event.data
    if (message?.source?.kind !== 'user') continue
    messages.push(message)
  }
  return pickUserText(messages)
}

/**
 * 动作闸的唯一入口。
 *
 * @param {object} input
 *   tool        —— 工具名（`exec.name`）
 *   args        —— 工具参数（`exec.arguments`，未知形状）
 *   session     —— 会话（`exec.agent?.session`）；读不到时按「判不了」放行
 *   skill       —— 卡回执判据盯的技能名（默认 roadbook）
 *   inProject   —— 会话是否在 git 项目里；**显式 false 才关闸**（undefined = 调用方没判，不当作否）
 *   team        —— resolveTeamPolicy() 的结论（team.js）；缺省视为「未挂载」
 *   intentConfig—— 开发意图词表（沿用 autoload 的 config：keywords / suppressKeywords / mode）
 * @returns {{decision: 'deny'|'ask'|'allow', rule: string, note: string, reason: string}}
 *   当前规则集只产出 deny / allow；`ask` 是给「需要人裁决」的规则预留的同一形状，本文件不产出。
 */
export function decideGate({
  tool,
  args,
  session,
  skill = 'roadbook',
  inProject,
  team,
  intentConfig = {},
} = {}) {
  // ① Team 类工具：只在策略被明确读成 off 时拦（blocked 只由 team.js 在 off 分支置真）。
  if (isTeamTool(tool)) {
    if (team?.blocked === true) {
      return deny(
        'team-off',
        'Team 策略为 off（装了不用）',
        'Team 策略为 off：roadbook-team 行的 policy 写着 off（装了不用），本轮 Team 类工具已被动作闸关闭。要恢复：把该行 policy 改回 follow，或先说明本轮确实需要团队协作。',
      )
    }
    return allow('team-follow', 'Team 类工具，策略未关闭')
  }

  // ② A 类红线：与走不走流程无关，命中即拦。
  const redline = matchRedline(commandOf(args))
  if (redline !== undefined) {
    return deny(
      `redline-${redline.id}`,
      `红线段 ${redline.id}（${redline.label}）`,
      `红灯：命令命中 ${redline.id} 红线域（${redline.label}）。A 类不可委托动作只能人做——请由用户本人执行，或在用户明确裁决后再动。`,
    )
  }

  // ③ 写侧闸：只拦写侧工具，其余（read / glob / grep / 工具自带查询…）一律放行。
  if (!isWriteTool(tool)) return allow('not-write-tool', '非写侧工具')

  // ④ 两道门（沿用注入那一套）：git 项目 + 命中开发意图。闲聊 / 问答 / 纯翻译不拦。
  if (inProject === false) return allow('not-project', '不在 git 项目里')
  if (isSubagentHeader(session?.header)) return allow('subagent', '子代理会话：纪律由派单带进来')
  const text = sessionUserText(session)
  if (text === undefined) return allow('no-user-text', '读不到用户文本（判不了就不拦）')
  if (matchIntent(text, intentConfig) === undefined) {
    return allow('no-dev-intent', '非开发意图，或用户已声明不走流程')
  }

  // ⑤ 卡回执：cardReadState 复用 trigger.js 的 needle 机制（只看最后一次注入之后的事件）。
  const wanted = typeof skill === 'string' && skill.length > 0 ? skill : 'roadbook'
  const receipt = cardReadState(session, wanted)
  if (receipt === 'read') return allow('card-read', '本会话有读卡痕迹')
  // 'unknown' = 读不到会话日志 / 注入之后还没有事件 / 超出扫描窗口：按仓库既有口径不猜，放行。
  if (receipt === 'unknown') return allow('receipt-unknown', '卡回执判不了（读不到日志或超出扫描窗口）')
  return deny('no-card-receipt', '未按卡开工：本会话没有卡回执', NO_RECEIPT_REASON)
}
