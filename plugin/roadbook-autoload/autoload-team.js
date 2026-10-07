/**
 * Team 探针 —— D14 拆分自 index.js（批 6 收尾，TD-008）。
 *
 * 消费 `roadbook-team` 行提供的**可选服务** `roadbookTeam`，只解释不判断。
 *
 * 为什么不写进 `export const inject`：那里少一个服务，cordis 会把整行插件判成面板上的「未运行」
 * （理由与常驻提示那段完全相同）。取服务同样走**作用域注入**：服务一可用就回调一次；
 * 官方 Agent Team 没挂载 ⇒ 那一行根本不加载 ⇒ 回调一次都不跑 ⇒ 本插件照常按单线程工作。
 *
 * 这一层的结论**只用于回执与降级说明**：门在装配层（`disabled: !!js "!ctx.get('agentTeams')"`），
 * 本插件不做「允不允许」的判断，只回答「本轮到底怎么跑」。唯一的例外见 gate.js 的 team-off 分支
 * （那是「装了不用」这条**用户显式策略**的机械落点，不是自建开关）。
 */
import { errorText } from './autoload-runtime.js'
import { resolveTeamPolicy } from './team.js'

/**
 * 注册探针：结论写进观测文件，并回落到 `env.team` 供动作闸读取（`gate.js` 的 team-off 分支要用）。
 *
 * 同步回调与异步回调都要处理：宿主里这一行可能已经挂载（回调同步跑完），也可能永远不会来
 * （没装 official Agent Teams）—— 两者都必须让「本轮到底怎么跑」有一个确定读数。
 */
export function registerTeamProbe(env) {
  const { ctx, reporter } = env
  const { writeReport } = reporter
  const teamVerdict = { ...resolveTeamPolicy({}) }
  env.team = teamVerdict

  const settleTeam = (service) => {
    Object.assign(teamVerdict, resolveTeamPolicy({ service }))
    writeReport({
      event: 'team',
      state: teamVerdict.state,
      active: teamVerdict.active,
      blocked: teamVerdict.blocked,
      note: teamVerdict.note,
    })
    try {
      if (teamVerdict.active) ctx.logger?.info?.(`[roadbook-autoload] ${teamVerdict.note}`)
      else ctx.logger?.warn?.(`[roadbook-autoload] ${teamVerdict.note}`)
    } catch {
      /* 日志是旁路 */
    }
  }

  if (typeof ctx.inject === 'function') {
    let settled = false
    try {
      ctx.inject(['roadbookTeam'], (scope) => {
        settled = true
        let service
        try {
          service = scope?.roadbookTeam
        } catch (error) {
          writeReport({ event: 'team', state: 'error', message: errorText(error) })
          return
        }
        settleTeam(service)
      })
    } catch (error) {
      writeReport({ event: 'team', state: 'error', message: errorText(error) })
      return
    }
    // 回调也可能同步就跑完了（这一行已经挂载）：那就不补这一行，免得读观测的人以为还没结论。
    if (!settled) {
      writeReport({
        event: 'team',
        state: 'deferred',
        note: '已交给作用域注入，等 roadbookTeam 服务：一直不来 = roadbook-team 行未挂载，本轮单线程走',
      })
    }
    return
  }

  // 兜底：ctx 上没有 inject（老宿主 / 精简 ctx）时退回一次性 ctx.get —— 读不到就是未挂载。
  let service
  try {
    service = typeof ctx.get === 'function' ? ctx.get('roadbookTeam') : undefined
  } catch (error) {
    writeReport({ event: 'team', state: 'error', message: errorText(error) })
    return
  }
  settleTeam(service)
}
