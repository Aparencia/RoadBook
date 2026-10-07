/**
 * 动作闸接线 —— D14 拆分自 index.js（批 6 收尾，TD-008）。
 *
 * `tools/pre-execute` 是瀑布式事件 `(exec, next) => 决策`。三条纪律：
 *   ① 先 `next()`，且**不覆盖**下游已有的 deny/ask（别人已经拦下的原样返回）——
 *      自己不 owning 决策时返回 next() 是本仓与 DSH 文档的共同口径；
 *   ② 只回 `deny` 或放行：`allow` 不预审批、`defer`/`updatedInput` 不生效，不依赖被忽略的能力；
 *   ③ 插件自身出任何意外都不许打断会话：兜底返回下游决策（失败即放行，与注入路径同口径）。
 *
 * 判据本身在 ./gate.js（纯逻辑，可离线单测）；本文件只做宿主接线与回执。
 */
import { decideGate } from './gate.js'
import { errorText } from './autoload-runtime.js'

/** 注册监听器（`gate: off` 时由调用方跳过，本函数不自己判档位）。 */
export function registerGate(env) {
  const { ctx, config, gateMode, idleSkillName, reporter, probes } = env
  const { reportError, reportGate } = reporter

  ctx.on('tools/pre-execute', async (exec, next) => {
    let downstream
    try {
      downstream = await next()
    } catch (error) {
      reportError('gate-next', { message: errorText(error) }, '')
      throw error
    }
    try {
      const session = exec?.agent?.session
      const verdict = decideGate({
        tool: exec?.name,
        args: exec?.arguments,
        session,
        skill: idleSkillName,
        // requireGitRoot 关掉时那道门就不存在（与注入路径同一口径），不该当成「不在项目里」。
        inProject: config.requireGitRoot === false ? true : probes.inGitProject(session?.header?.cwd),
        team: env.team,
        intentConfig: config,
      })
      const sessionId = typeof session?.header?.id === 'string' ? session.header.id : ''
      reportGate(verdict, exec, sessionId)
      if (verdict.decision === 'allow') return downstream
      if (downstream?.kind !== 'allow') return downstream
      if (gateMode === 'warn') {
        try {
          ctx.logger?.warn?.(`[roadbook-autoload] 动作闸（warn 档：只回执不拦）：${verdict.note}`)
        } catch {
          /* 日志是旁路 */
        }
        return downstream
      }
      return { kind: 'deny', reason: verdict.reason }
    } catch (error) {
      reportError('gate', { message: errorText(error) }, '')
      return downstream
    }
  })
}
