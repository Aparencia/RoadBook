/**
 * 常驻微提示（system prompt section）—— D14 拆分自 index.js（批 6 收尾，TD-008）。
 *
 * 为什么要有它：关键词门控必须命中才注入正文，没命中的会话此前整轮没有任何流程约束。
 * 所以另外注册一段极短的 system prompt section（不是注入 user message）：它每轮都在、
 * 不占对话历史、不受压缩影响；服务读不到就不显示，绝不让整行插件变成「未运行」。
 *
 * 为什么单独一层：本段有两条接线路径（作用域注入 / 一次性 `ctx.get`）与四种回执状态
 * （registered / deferred / unavailable / error），是全插件分支最多的一块 —— 混在入口文件里
 * 时它把「注入正文」那条主路径挤到了 400 行之后。
 */
import { errorText } from './autoload-runtime.js'

/**
 * 常驻微提示文案（system prompt section，不是注入的 user message）。
 * 为什么要有：关键词命中率只有五到八成，没命中的会话此前整轮没有任何流程约束。
 * 为什么这么短：它每一轮都在上下文里，长正文交给命中后的全量注入，这里只留坐标与硬判据。
 */
const BANNER_TEXT =
  '[roadbook] 本机装了 RoadBook 流程（路由 skills/roadbook/SKILL.md，卡片在 playbook/ 与 playbook_EN/）。涉及开发任务时按卡推进：红灯 = 停；「完成」= check.ps1 退出码 0 且粘贴真实输出；回执只认命令输出 / 文件路径 / 提交哈希。与本轮无关时忽略本段。要关掉：把插件行的 banner 设为 false。'

/**
 * 要注册的那一段（两条接线路径共用同一份文案与 order）。
 *
 * `systemPrompt` 必须走**可选服务**：不能写进 `export const inject` —— 那里少一个服务，
 * cordis 会把整行插件判成「未运行」（原因同 autoload-host.js 顶部：症状会指向「没装」而不是「缺服务」）。
 */
function bannerSection({ config, probes }) {
  return {
    name: 'roadbook',
    // 700 的依据：DSH 的 SECTION_ORDERS 里 PLAN_POLICY = 500、TEAM_POLICY = 600、PTC_ONLY = 800，
    // 700 正好落在策略段之间 —— 流程提示要排在三条策略之后、工具段（1000 起）之前。
    order: 700,
    // 关掉插值：本段是自己写死的中文提示，不含 {{变量}}，也不该被当模板解析（解析失败会抛在组装里）。
    interpolate: false,
    text: (context) => {
      if (config.banner === false || config.mode === 'off') return ''
      // 读不到 cwd 就不显示（与本插件「读不到就不猜」口径一致）：宁可少一段，也不给错坐标。
      const cwd = context?.agent?.session?.header?.cwd
      if (typeof cwd !== 'string' || cwd.length === 0) return ''
      if (config.requireGitRoot && !probes.inGitProject(cwd)) return ''
      return BANNER_TEXT
    },
  }
}

/**
 * 把 section 挂到服务上，disposer 交给**当前作用域**的 effect 保管。
 * 服务返回的 disposer 只在自己作用域里有效：包进 effect 才会随作用域卸载（含插件卸载）一并撤销 ——
 * 不包的话，服务重建一次就在 system prompt 里多留一段，越攒越多。
 */
function mountBanner(host, systemPrompt, env) {
  const section = bannerSection(env)
  const attach = () => systemPrompt.section(section)
  if (typeof host?.effect === 'function') {
    host.effect(attach, 'roadbook-autoload: banner')
    return
  }
  attach()
}

/** 服务形状不合格（没这个服务 / 还没起来）：只让本段不出现，绝不上抛。 */
const usableSectionService = (value) => value !== undefined && value !== null && typeof value.section === 'function'

/** 本段的注册入口：有 inject 就交给作用域重试，没有才退回一次性 ctx.get。 */
export function registerBanner(env) {
  const { ctx, reporter } = env
  const { writeReport } = reporter
  // 首选：作用域注入。一次性 ctx.get 读到 undefined 时，「宿主没有这个服务」与「服务还没起来」
  // 长得一模一样 —— 前者该永久让路，后者只该等一等；读一次就写死 unavailable，微提示会在
  // 服务晚于本插件装配的宿主上永远消失。交给 inject 的作用域 fiber：服务一可用就回调一次，
  // 全程没这个服务就一次都不回调（本插件照常工作，export const inject 也保持 ['agents','skills']）。
  if (typeof ctx.inject === 'function') {
    let settled = false
    try {
      ctx.inject(['systemPrompt'], (scope) => {
        settled = true
        let systemPrompt
        try {
          systemPrompt = scope?.systemPrompt
        } catch (error) {
          writeReport({ event: 'banner', state: 'error', message: errorText(error) })
          return
        }
        if (!usableSectionService(systemPrompt)) {
          // 作用域起来了但这个服务仍不合格：如实记 unavailable，绝不写 registered。
          writeReport({ event: 'banner', state: 'unavailable' })
          return
        }
        try {
          mountBanner(scope, systemPrompt, env)
          writeReport({ event: 'banner', state: 'registered' })
        } catch (error) {
          writeReport({ event: 'banner', state: 'error', message: errorText(error) })
        }
      })
    } catch (error) {
      writeReport({ event: 'banner', state: 'error', message: errorText(error) })
      return
    }
    // 回调也可能同步就跑完了（服务已经起来）：那就不补这一行，免得读观测的人以为还没注册。
    if (!settled) writeReport({ event: 'banner', state: 'deferred' })
    return
  }

  // 兜底：ctx 上没有 inject（老宿主 / 精简 ctx）时保留原样的一次性 ctx.get —— 读不到就不注册。
  let systemPrompt
  try {
    systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
  } catch (error) {
    writeReport({ event: 'banner', state: 'error', message: errorText(error) })
    return
  }
  if (!usableSectionService(systemPrompt)) {
    writeReport({ event: 'banner', state: 'unavailable' })
    return
  }
  try {
    mountBanner(ctx, systemPrompt, env)
    writeReport({ event: 'banner', state: 'registered' })
  } catch (error) {
    writeReport({ event: 'banner', state: 'error', message: errorText(error) })
  }
}
