/**
 * 宿主包的本地等价实现 —— 只在 `@deepseek-ai/*` 真的解析不到时启用。
 *
 * **为什么需要这一层**：本目录的 `index.js` 是 loader 行的入口模块。宿主正常运行时会把
 * `peerDependencies` 里的包注入（见 `package.json` 与仓库根 `package.json` 的 peers），
 * 但如果宿主的解析表里没有这些名字，**静态 import 会让整个模块加载失败** —— 而 loader
 * 对加载失败只写一条日志：`@deepseek-ai/cordis-plugin-loader` 的 `Entry._init()` 是
 * `try { exports = await tree.import(name) } catch (error) { this.ctx.logger.error(error); return }`，
 * `this.fiber` 永远不赋值 ⇒ 插件面板上只显示「未运行」，看不出原因（2026-10-04 实测，
 * 见 `design/v6-design.md` §10 第 32 条）。
 *
 * 所以 `index.js` 改为守卫式动态 import：解析得到就用宿主的真实现（形状与行为都不变），
 * 解析不到就退回这里，并把失败原因写进日志与观测文件 —— 插件降级可用，且原因可见。
 *
 * 形状对齐宿主真源：
 *   - `@deepseek-ai/dsh-llm` 的 `createMessage` / `createUserMessage`（新 id + 深冻结）
 *   - `@deepseek-ai/dsh-skill` 的 `isUserInvocable` / `renderSkillContent`（含转义与资源提示）
 */
import { randomUUID } from 'node:crypto'

/** 深冻结：与宿主 `@deepseek-ai/dsh-util-values` 的 `deepFreeze` 同义（对象图逐层冻结）。 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) deepFreeze(value[key])
  return value
}

/** 宿主 `createUserMessage` 的等价实现：`{ ...input, role: 'user', id: <新 uuid> }`，深冻结。 */
export function createUserMessage(input = {}) {
  return deepFreeze(structuredClone({ ...input, role: 'user', id: randomUUID() }))
}

/** 宿主 `isUserInvocable` 的等价实现：只有 `skill.invocation.userInvocable` 为真才算可主动调用。 */
export function isUserInvocable(skill) {
  return Boolean(skill?.invocation?.userInvocable)
}

/** 属性值转义（与宿主 `escapeAttr` 同义：`&` `"` `<`）。 */
function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
}

/** 正文转义（与宿主 `escapeText` 同义：`&` `<` `>`）。 */
function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * 资源提示行：与宿主 `renderResourceHint` 逐字一致。
 * base 缺省 → 由 provider 托管；`path` → 目录；`url` → 网址；否则按 opaque 描述。
 */
function renderResourceHint(skill) {
  const base = skill?.base
  const tail = 'Load referenced resources only as needed.'
  if (base === null || base === undefined) {
    return [`Resources for this skill are managed by provider "${escapeText(skill?.provider)}".`, tail]
  }
  if (typeof base.path === 'string') return [`Base directory for this skill: ${escapeText(base.path)}`, tail]
  if (typeof base.url === 'string') return [`Base URL for this skill: ${escapeText(base.url)}`, tail]
  return [`Resources for this skill: ${escapeText(base.description)}`, tail]
}

/** 宿主 `renderSkillContent` 的等价实现：注入给模型的技能正文标记逐字一致。 */
export function renderSkillContent(skill) {
  return [
    `<skill_content name="${escapeAttr(skill?.name)}">`,
    '<skill_resources>',
    ...renderResourceHint(skill),
    '</skill_resources>',
    '',
    '<skill_instructions>',
    skill?.content ?? '',
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n')
}
