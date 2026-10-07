/**
 * roadbook-autoload —— Roadbook V6 开发流程母版的自动加载插件（Host 半区）。
 *
 * 作用：用户在一个 git 项目里开口谈开发任务时，把 roadbook 技能正文按内置
 * 「用户显式调用」的同一形状注入当前回合，使流程卡不依赖模型自觉。
 *
 * 本文件只做**装配**：把各层按宿主扩展点接起来，逻辑一律在下面这些文件里
 * （2026-10-07 批 6 按 D14 拆分，原 867 行单文件；拆法 = 按「闭包是否一起搬」切，见 TD-008）：
 *   ./autoload-host.js    宿主包守卫式解析 + 行配置 schema（缺包退回 ./host-fallback.js）
 *   ./autoload-runtime.js 运行时底座：有界记忆 / 观测落盘与轮转 / 会话侧探针（项目根·STATE·指纹·空转）
 *   ./autoload-inject.js  主路径：`agent/pre-step` 注入（含压缩后重注入判据）
 *   ./autoload-banner.js  常驻微提示（system prompt section，补「关键词没命中 = 整轮无约束」的洞）
 *   ./autoload-gate.js    动作闸接线（`tools/pre-execute`，A 类红线 + C7 未按卡开工 + Team 策略 off）
 *   ./gate.js ./state.js ./team.js ./trigger.js 四块纯逻辑（不 import dsh 包，普通 node 可单测）
 *
 * 依赖：@deepseek-ai/dsh-llm / dsh-skill / schemastery 由宿主提供，见本目录与仓库根
 * package.json 的 peerDependencies —— 插件内不下载、不打包，宿主大版本升级后要重新核对。
 * 三者都是**守卫式动态 import**（`autoload-host.js`）：解析不到就退回本地等价实现，绝不让
 * 整行插件因为缺宿主包而静默变成面板上的「未运行」。
 *
 * 观测：自进化 A 环默认开启 —— 每个分支（inject / skip / error）都往
 * <os.tmpdir()>/roadbook-autoload.jsonl 追加一行 JSONL；观测是旁路，写失败只吞自己，
 * 绝不影响会话（同理，渲染或建消息失败也只跳过该技能）。文件超上限就轮转到 `<file>.1`，
 * 且**只记用户文本的指纹与长度，不记原文**（共享临时目录、跨会话、永不清理）。
 */
import { registerBanner } from './autoload-banner.js'
import { registerGate } from './autoload-gate.js'
import { hostFallbacks } from './autoload-host.js'
import { createPreStepHandler } from './autoload-inject.js'
import { createRuntime } from './autoload-runtime.js'
import { registerTeamProbe } from './autoload-team.js'

/** 对外身份（宿主面板与伞包自检读它）。 */
export const name = 'roadbook-autoload'

/** skills 用来解析技能正文；agents 提供 agent/pre-step 事件。 */
export const inject = ['agents', 'skills']

// 行配置 schema 与兜底清单都住在 autoload-host.js；从入口再导出，保持拆分前的对外形状不变
// （测试与宿主都从 `./index.js` 取这两个名字）。
export { Config, hostFallbacks } from './autoload-host.js'

export function apply(ctx, config = {}, runtime = {}) {
  const env = createRuntime(ctx, config, runtime)
  const { reporter, gateMode } = env
  const { writeReport } = reporter

  // 就绪回执：观测文件里这一行 =「本行真的跑起来了」的可读证据（面板之外的第二条自证路径）。
  writeReport({ event: 'loaded', fallbacks: hostFallbacks.map((host) => host.specifier) })
  if (hostFallbacks.length > 0) {
    try {
      ctx.logger?.warn?.(
        `[roadbook-autoload] 宿主包解析失败，已改用本地等价实现：${hostFallbacks
          .map((host) => `${host.specifier}（${host.error}）`)
          .join('；')}`,
      )
    } catch {
      /* 日志是旁路 */
    }
  }

  registerBanner(env)
  registerTeamProbe(env)
  // 动作闸档位：off = 不注册监听器（连 next() 都不插一脚），deny / warn 走同一条接线。
  if (gateMode !== 'off') registerGate(env)
  ctx.on('agent/pre-step', createPreStepHandler(env))
}
