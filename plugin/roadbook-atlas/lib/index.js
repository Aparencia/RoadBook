/**
 * roadbook-atlas —— 图纸子插件的宿主半（Loader 行 `roadbook/atlas`，模块名 `roadbook/atlas`）。
 *
 * 定位：这是主插件 roadbook 的一个**子插件**，不是独立可装的包 ——
 *   技能与 CLI 在伞包 `skills/roadbook-atlas/`，客户端半（侧栏「图册」标签页）在伞包 `lib/client.js`，
 *   本文件只负责这一个 Loader 行的就绪日志与「技能根在哪」这一个算法。
 *
 * 为什么不在这里做自检：随包文件的完整性由主行的 `lib/index.js` 一次查全（一处事实源），
 * 子行再查一遍只会多出两份会漂移的清单。
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Loader 行 id（profile patch 用 id 开关本行：`- id: roadbook-atlas`）。 */
export const name = 'roadbook-atlas';
/** 随包分发的 skill 名（= 伞包 skills/ 下的目录名）。 */
export const SKILL_NAME = 'roadbook-atlas';
/** 图纸默认落点（相对项目根），与 skill 文档、侧边栏默认值三处一致。 */
export const DEFAULT_DIAGRAM_DIR = 'docs/diagrams';
/** 伞包（主插件）的 npm 身份：解析随包资源一律走它，不拼相对路径。 */
export const UMBRELLA_PACKAGE = 'roadbook';

/**
 * 伞包根目录：本文件在 `<伞包根>/plugin/roadbook-atlas/lib/` 下，从 lib 上溯三级即伞包根。
 * 为什么用文件位置而不是 createRequire：`link:` 安装时 Node 解析到真实路径（仓库内），
 * 从那里往上找不到 profile 的 node_modules —— 只有文件位置在 link: / npm / git 子目录三种安装下都稳定。
 */
export function umbrellaRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/**
 * 解析随包分发的 skill 根目录（伞包的 `skills/`）。
 *
 * @param {string | URL | undefined} profileBaseUrl DSH profile 的 Loader baseUrl。
 * @returns {string} skills 目录的绝对路径。
 */
export function resolveSkillRoot(profileBaseUrl) {
  if (profileBaseUrl) {
    try {
      const manifestPath = createRequire(profileBaseUrl).resolve(`${UMBRELLA_PACKAGE}/package.json`);
      return join(dirname(manifestPath), 'skills');
    } catch {
      // 解析不到是 link: 安装的常态（profile 的 node_modules 不在本文件的祖先链上），退到文件位置推断。
    }
  }
  return join(umbrellaRoot(), 'skills');
}

/**
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 * @param {{ diagrams?: string }} [config] 本行 config（`roadbook-atlas` 行），默认 docs/diagrams。
 */
export function apply(ctx, config = {}) {
  const line = (level, text) => {
    const sink = ctx && ctx.logger && typeof ctx.logger[level] === 'function' ? ctx.logger[level] : null;
    if (sink) sink.call(ctx.logger, text);
  };
  const diagrams = typeof config?.diagrams === 'string' && config.diagrams ? config.diagrams : DEFAULT_DIAGRAM_DIR;
  line('info', `roadbook-atlas: ready（skill=${SKILL_NAME}, diagrams=${diagrams}）`);
}
