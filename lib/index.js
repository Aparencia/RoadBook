/**
 * RoadBook 主插件 —— 宿主半（host half），对应 Loader 里的主行 `roadbook`。
 *
 * 这一半只做两件事：
 *   1) 对外报告版本号（唯一事实源是根 package.json，代码里不留副本）；
 *   2) 在 apply() 里做一次就绪自检：随包的技能、CLI、渲染器、客户端半是否都在磁盘上。
 *      缺文件要看得见 —— 打一条明确警告，而不是静默降级成「插件装了但什么都不工作」。
 *
 * 流程正文在 skills/roadbook/，图纸能力在 skills/roadbook-atlas/，
 * 侧边栏「图册」标签页在客户端半 ./client；宿主半不注册工具、不碰用户数据。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Loader 行 id（profile patch 里用 id 开关本行）。 */
export const name = 'roadbook';
/** 图纸默认落点（相对项目根），与 skill 文档、侧边栏默认值三处一致。 */
export const DEFAULT_DIAGRAM_DIR = 'docs/diagrams';

/** 主插件根目录（lib/index.js 的上一级）。link: / npm / 子目录安装都不影响它。 */
export function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/** 版本号：只读 package.json；读不到报 unknown 而不抛错（一条日志不该拖垮整个 profile）。 */
export function pluginVersion(root = packageRoot()) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown';
  } catch (error) {
    return `unknown（package.json 读不到：${error && error.message ? error.message : '未知原因'}）`;
  }
}

/** 就绪自检：列出缺失的随包文件，空数组 = 一切就位。 */
export function missingBundledFiles(root = packageRoot()) {
  const required = [
    'SKILL.md',
    join('skills', 'roadbook', 'SKILL.md'),
    join('skills', 'roadbook-atlas', 'SKILL.md'),
    join('skills', 'roadbook-atlas', 'bin', 'atlas.mjs'),
    join('skills', 'roadbook-atlas', 'vendor', 'archify', 'bin', 'archify.mjs'),
    join('plugin', 'roadbook-autoload', 'index.js'),
    join('plugin', 'roadbook-atlas', 'lib', 'index.js'),
    join('lib', 'client.js'),
  ];
  return required.filter((relative) => !existsSync(join(root, relative)));
}

/**
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 * @param {{ diagrams?: string }} [config] 主行 config（`roadbook` 行），默认 docs/diagrams。
 */
export function apply(ctx, config = {}) {
  const line = (level, text) => {
    const sink = ctx && ctx.logger && typeof ctx.logger[level] === 'function' ? ctx.logger[level] : null;
    if (sink) sink.call(ctx.logger, text);
  };
  const missing = missingBundledFiles();
  if (missing.length > 0) {
    line('warn', `roadbook v${pluginVersion()}: 缺少随包文件（相关能力会不可用）：${missing.join(', ')}`);
    return;
  }
  const diagrams = typeof config?.diagrams === 'string' && config.diagrams ? config.diagrams : DEFAULT_DIAGRAM_DIR;
  line('info', `roadbook v${pluginVersion()}: ready（skill=roadbook + roadbook-atlas, diagrams=${diagrams}）`);
}
