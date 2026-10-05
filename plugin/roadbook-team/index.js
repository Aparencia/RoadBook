/**
 * roadbook-team —— RoadBook 的 Team 策略行（**只在官方 Agent Teams 已挂载时存在**）
 *
 * 为什么单独一行、而不是并进 roadbook-autoload：
 *   用户裁决「Agent Team 未挂载时，这个开关不可设置」。实现方式是**装配层门控**——
 *   `cordis.patch.yml` 里这一行带 `disabled: !!js "!ctx.get('agentTeams')"`：
 *   官方 Team 不在 → 这一行根本不加载 → 面板里设了也不生效。
 *   而 roadbook-autoload 必须常开（无 Team 环境也要能单线程跑完流程），所以两者不能合并。
 *
 * 为什么还要自己再探一次 `agentTeams`：
 *   门是**用户可见的开关**，探针是**回执要说真话**的依据。两种失配都要能如实报出来：
 *     - 服务在、`agentTeams` 在 → `available: true`，按 policy 走；
 *     - 服务在、`agentTeams` 不在（有人手工挂载了这一行）→ `available: false` + 警告，退回单线程；
 *     - 服务不在（门把它关了）→ 消费方按「Team 未挂载」处理，如实说明。
 *
 * 本文件不 import 任何 dsh 包：裸 Node 下也必须 import 成功（宿主缺件时不让整行判成「未运行」）。
 */

export const name = 'roadbook-team'

/** 本行不依赖任何服务：它存在的意义就是「官方 Team 在不在」。 */
export const inject = []

/** 允许的策略值：follow = 跟随官方行；off = 装了也不用（RoadBook 侧自限）。 */
const POLICIES = ['follow', 'off']

/**
 * 读取本行的策略配置。
 *
 * 刻意不导出 schemastery `Config`：本行只有一个键，为一个键引入宿主 schema 依赖
 * 会把「裸 Node 也能 import」这条底线搭进去。配置非法时**退回 follow 并告警**，
 * 不静默采用一个用户没选过的值。
 * @param {{policy?: unknown}} config - 行配置
 * @param {(message: string) => void} [warn] - 告警回调
 */
export function resolvePolicy(config = {}, warn = () => {}) {
  const raw = config?.policy
  if (raw === undefined) return 'follow'
  if (typeof raw === 'string' && POLICIES.includes(raw)) return raw
  warn(`policy 取值非法（${JSON.stringify(raw)}），已退回 follow；允许值：${POLICIES.join(' / ')}`)
  return 'follow'
}

/**
 * 装配入口。
 *
 * 提供同名服务 `roadbookTeam`，消费方（roadbook-autoload）走可选服务注入：
 * 服务在 = 这一行挂载了；服务里的 `available` = 官方 Team 到底在不在。
 * @param {object} ctx - cordis 上下文
 * @param {{policy?: string}} [config] - 行配置
 */
export function apply(ctx, config = {}) {
  const policy = resolvePolicy(config, (message) => ctx.logger?.warn?.(`[roadbook-team] ${message}`))
  const agentTeams = typeof ctx.get === 'function' ? ctx.get('agentTeams') : undefined
  const available = agentTeams !== undefined && agentTeams !== null

  const face = { policy, available, row: name }
  if (typeof ctx.provide === 'function') {
    ctx.provide('roadbookTeam', face)
  } else {
    // 老宿主 / 精简 ctx：不 provide 就只是这一行不起作用，但绝不能让插件加载失败。
    ctx.logger?.warn?.('[roadbook-team] 宿主 ctx 没有 provide()，本行不提供道路服务（流程退回单线程）')
  }

  if (available) {
    ctx.logger?.info?.(`[roadbook-team] Agent Teams 已挂载，RoadBook 侧策略 policy=${policy}`)
  } else {
    // 门应当拦住这种情况；真出现说明有人手工挂载了这一行 —— 如实告警，不假装可用。
    ctx.logger?.warn?.('[roadbook-team] 这一行被挂载了，但宿主没有 agentTeams 服务：流程按单线程走（检查 cordis.patch.yml 的 disabled 门是否被绕过）')
  }
}
