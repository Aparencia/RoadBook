/**
 * 宿主包解析与行配置 schema —— D14 拆分自 index.js（批 6 收尾，TD-008）。
 *
 * 为什么单独一层：「宿主给不给包」与「行配置长什么样」是两块与接线无关的设施，
 * 留在 apply() 旁边时，守卫式解析的失败路径会被接线噪声淹没 —— 而它恰是本插件最贵的一条教训。
 *
 * 守卫式解析（**不是**静态 import）：loader 对「入口模块 import 失败」只写一条 logger.error
 * 然后 return，`entry.fiber` 不赋值 ⇒ 插件面板显示「未运行」，用户看不出是缺包、缺文件还是
 * 版本不符。这里把失败原因收进 hostFallbacks，由 index.js 的 apply() 写进日志与观测文件
 * （症状 → 原因一次到手）。
 *
 * 依赖：@deepseek-ai/dsh-llm / dsh-skill / schemastery 由宿主提供，见本目录与仓库根
 * package.json 的 peerDependencies —— 插件内不下载、不打包，宿主大版本升级后要重新核对。
 * 三者都是守卫式动态 import：解析不到就退回 ./host-fallback.js 的等价实现。
 */
import {
  createUserMessage as fallbackCreateUserMessage,
  isUserInvocable as fallbackIsUserInvocable,
  renderSkillContent as fallbackRenderSkillContent,
} from './host-fallback.js'
import { DEFAULT_REPORT_MAX_BYTES } from './autoload-runtime.js'
import { DEFAULT_KEYWORDS, DEFAULT_SUPPRESS } from './trigger.js'

/** 要守卫式解析的三个宿主包（键名只在本模块用；对外一律用 specifier 原文）。 */
const HOST_PACKAGES = {
  llm: '@deepseek-ai/dsh-llm',
  skill: '@deepseek-ai/dsh-skill',
  schema: '@deepseek-ai/schemastery',
}

async function loadHostPackage(specifier) {
  try {
    return { specifier, module: await import(specifier) }
  } catch (error) {
    return { specifier, module: null, error: error instanceof Error ? error.message : String(error) }
  }
}

const hostLlm = await loadHostPackage(HOST_PACKAGES.llm)
const hostSkill = await loadHostPackage(HOST_PACKAGES.skill)
const hostSchema = await loadHostPackage(HOST_PACKAGES.schema)

/** 解析不到、已改用本地等价实现的宿主包（apply() 报到日志与观测文件；空数组 = 全部用宿主真实现）。 */
export const hostFallbacks = [hostLlm, hostSkill, hostSchema]
  .filter((host) => host.module === null)
  .map((host) => ({ specifier: host.specifier, error: host.error, replacement: './host-fallback.js' }))

/** 三个宿主能力的取值口径：宿主给了就用真的，没给就用本地等价实现（两者同形状）。 */
export const createUserMessage = hostLlm.module?.createUserMessage ?? fallbackCreateUserMessage
export const isUserInvocable = hostSkill.module?.isUserInvocable ?? fallbackIsUserInvocable
export const renderSkillContent = hostSkill.module?.renderSkillContent ?? fallbackRenderSkillContent

/**
 * 配置 schema：由宿主提供的 schemastery 构造。宿主没给（解析失败或构造抛错）时为 undefined ——
 * 此时 cordis 不校验行配置，schema 里的缺省值不生效，apply() 会打一条警告说明这件事。
 */
export const Config = buildConfig(hostSchema.module)

function buildConfig(schema) {
  const z = schema?.default ?? schema
  if (z === null || z === undefined || typeof z.object !== 'function') return undefined
  try {
    return z.object({
      /** 要自动加载的技能名（按序取第一个能解析的）。 */
      skills: z.array(z.string()).default(['roadbook']),
      /** keyword：命中关键词注入；always：只要是 git 项目里的用户消息就注入；off：完全关闭。 */
      mode: z.union([z.const('keyword'), z.const('always'), z.const('off')]).default('keyword'),
      keywords: z.array(z.string()).default(DEFAULT_KEYWORDS),
      suppressKeywords: z.array(z.string()).default(DEFAULT_SUPPRESS),
      /** 子代理会话是否也注入，默认不注入。 */
      includeSubagents: z.boolean().default(false),
      /** 只在本会话位于 git 项目内时注入。 */
      requireGitRoot: z.boolean().default(true),
      /** 一次会话只注入一次。 */
      oncePerSession: z.boolean().default(true),
      /** 在技能正文后附一行透明说明（为什么加载、怎么关）。 */
      note: z.boolean().default(true),
      /** 每轮常驻的极短微提示（system prompt section）；关掉设 false，本文本段即不贡献内容。 */
      banner: z.boolean().default(true),
      /** 自进化 A 环：观测是否落盘，默认开（注入/跳过/报错都记一行）。 */
      report: z.boolean().default(true),
      /** 自进化 A 环：观测记录（JSONL）落盘路径，空 = <os.tmpdir()>/roadbook-autoload.jsonl。 */
      reportPath: z.string().default(''),
      /** 自进化 A 环：观测文件字节上限，超了就轮转到 `<reportPath>.1`（覆盖旧的 .1）再继续写。 */
      reportMaxBytes: z.number().default(DEFAULT_REPORT_MAX_BYTES),
      /** 自进化 B 环：SKILL.md 指纹基线，对不上就在说明里提示技能已更新。 */
      skillDigest: z.string().default(''),
      /**
       * 动作闸（`tools/pre-execute`）：deny = 拦（默认）；warn = 只回执不拦；off = 不注册监听器。
       * 为什么默认拦：强引用取动作闸（用户裁决 4）——提醒不算机械后果，`deny` 才算。
       */
      gate: z.union([z.const('off'), z.const('warn'), z.const('deny')]).default('deny'),
      /**
       * STATE.md 必填字段校验（B10）：只在「文件在、但缺必填键」或「读不动」时落一条观测。
       * 没有 STATE.md 的 git 项目是常态（没接 RoadBook 的项目到处都是），不刷观测。
       */
      stateCheck: z.boolean().default(true),
    })
  } catch (error) {
    hostFallbacks.push({
      specifier: HOST_PACKAGES.schema,
      error: error instanceof Error ? error.message : String(error),
      replacement: '无 schema（行配置必须显式给出 skills / mode 等，缺省值不生效）',
    })
    return undefined
  }
}
