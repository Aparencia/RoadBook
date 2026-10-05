/**
 * roadbook-autoload 的 Team 消费层（纯逻辑，不 import 任何 dsh 包，可离线单测）。
 *
 * 三层分工（2026-10-05 用户裁决，别在本文件里重新发明开关）：
 *   ① 官方那一行：Agent Team 挂没挂——权威开关，只有它说了算；
 *   ② 装配层：`cordis.patch.yml` 的 `roadbook-team` 行带 `disabled: !!js "!ctx.get('agentTeams')"`，
 *      官方没挂 → 这一行根本不加载 → 它提供的 `roadbookTeam` 服务不存在；
 *   ③ 本模块：**只解释**②的结果，供回执与降级说明用。
 *
 * 为什么不去直接探 `ctx.agentTeams`：那会让「允不允许」变成两处判断（探针一处、装配层一处），
 * 而用户裁决要的是单点权威。探针只回答「本轮到底是不是单线程」，不回答「能不能用」。
 *
 * 「服务在」≠「可用」：`roadbook-team` 行的 face 里另带两个字段——
 *   available：那一行自己再探一次 `agentTeams` 的结果（有人手工挂载该行时会与门不一致）；
 *   policy：`follow`（跟随官方行）/ `off`（装了不用，RoadBook 侧自限）。
 * 本模块把这三个状态合成一个结论，交给动作闸与观测使用。
 */

/** 允许的策略值：与 roadbook-team 行的 `policy` 同字典，两处拼法必须一致。 */
export const TEAM_POLICIES = ['follow', 'off']

/** 未挂载时的标准说明：这句话会原样进观测文件与日志，措辞不许漂。 */
export const TEAM_UNMOUNTED_NOTE = 'Team 未挂载（官方 Agent Team 行未启用），本轮单线程走'

/** 取值回显用：JSON.stringify 会因循环引用抛错，而这里只用来写回执，不值得为它打断会话。 */
function describe(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * 把「注入进来的服务」+「有效策略」合成一个结论。
 *
 * @param {{service?: unknown, policy?: unknown}} [input]
 *   service —— 作用域注入拿到的 `roadbookTeam` face（`{policy, available, row}`）；undefined = 未注入。
 *   policy  —— 有效策略。省略时取 `service.policy`（**生产路径只用这一条**：
 *              策略的唯一来源是 roadbook-team 行，本插件配置里没有 team 旋钮）；
 *              显式传入只给测试与将来「调用方已经拿到权威策略」的场景用。
 * @returns {{active: boolean, blocked: boolean, state: string, note: string}}
 *   active  —— 团队能力本轮是否可用（回执用，不做门）；
 *   blocked —— 是否要**机械拦下** Team 类工具（只有明确读到 `policy: off` 才为真：
 *              读不到或形状不合格时 fail-open，不拿一个猜出来的结论去拦用户的正常协作）；
 *   state   —— follow | off | unavailable | unmounted | degraded（观测文件里按这个取值断言）；
 *   note    —— 给人看的一行说明。
 */
export function resolveTeamPolicy({ service, policy } = {}) {
  const effective = policy === undefined ? service?.policy : policy

  // ① 服务没注入：装配层的门关着（或使用者单独装了 autoload、没装 roadbook-team 行）。
  if (service === undefined || service === null) {
    return { active: false, blocked: false, state: 'unmounted', note: TEAM_UNMOUNTED_NOTE }
  }

  // ② 注入了个不是对象的东西：形状不合格要**响亮**降级，不许静默当成「可用」。
  if (typeof service !== 'object' || Array.isArray(service)) {
    return {
      active: false,
      blocked: false,
      state: 'degraded',
      note: `Team 探针形状不合格（拿到 ${describe(typeof service)}），响亮降级为单线程；检查 roadbook-team 行提供的服务面`,
    }
  }

  // ③ 装了不用：这是唯一一条会拦 Team 工具的策略（用户的显式选择）。
  if (effective === 'off') {
    return {
      active: false,
      blocked: true,
      state: 'off',
      note: 'Team 策略为 off（装了不用）：Team 类工具已被动作闸关闭',
    }
  }

  // ④ 服务在、策略缺字段或取值非法：同样是形状问题，同样只降级不拦。
  if (effective !== 'follow') {
    return {
      active: false,
      blocked: false,
      state: 'degraded',
      note: `roadbook-team 行提供的探针缺 policy 字段或取值非法（读到 ${describe(effective)}），响亮降级为单线程；允许值：${TEAM_POLICIES.join(' / ')}`,
    }
  }

  // ⑤ 行在、官方服务不在：只有手工挂载该行（绕过 disabled 门）才会走到这里——如实说，不假装可用。
  if (service.available === false) {
    return {
      active: false,
      blocked: false,
      state: 'unavailable',
      note: 'roadbook-team 行在，但宿主没有 agentTeams 服务（疑似绕过装配层的门手工挂载），退回单线程',
    }
  }

  return { active: true, blocked: false, state: 'follow', note: 'Agent Teams 已挂载，Team 类工具可用' }
}
