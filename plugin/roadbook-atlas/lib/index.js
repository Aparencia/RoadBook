/**
 * Roadbook Atlas —— 宿主半（host half）。
 *
 * 这一半只做两件事：
 *   1) 提供 `resolveSkillRoot()`：按安装在 DSH profile 上的 npm 身份解析本插件自带的
 *      skill 根目录（cordis.patch.yml 里的 skill provider 用它同一套算法，保证一致）。
 *   2) 在 apply() 里做一次就绪自检：确认 skills/roadbook-atlas/SKILL.md 与 vendored 渲染器
 *      真的在磁盘上，缺任何一项就打一条明确的警告 —— 缺文件时要看得见，而不是静默降级。
 *
 * 图纸的生成、校验、回执全部在 skill + CLI（skills/roadbook-atlas/）里完成；
 * 侧边栏「图册」标签页在客户端半（./client）。宿主半不注册任何工具，也不碰用户数据。
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Loader 行 id / 包名（profile bundles 列表里就是这个字符串）。 */
export const name = 'roadbook-atlas';
/** 本插件的 npm 身份：解析自身资源一律走它，不写相对 baseUrl 的路径拼接。 */
export const PACKAGE_NAME = 'roadbook-atlas';
/** 随包分发的 skill 名（= skills/ 下的目录名）。 */
export const SKILL_NAME = 'roadbook-atlas';
/** 图纸默认落点（相对项目根），与 skill 文档、侧边栏默认值三处一致。 */
export const DEFAULT_DIAGRAM_DIR = 'docs/diagrams';

/**
 * 本插件目录（lib/index.js 的上一级）。安装方式（link: / npm / 聚合包）不影响它：
 * ESM 会解析到真实文件路径。
 */
export function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * 解析随包分发的 skill 根目录（即 skills/）。
 *
 * @param {string | URL | undefined} profileBaseUrl DSH profile 的 Loader baseUrl。
 * @returns {string} skills 目录的绝对路径。
 */
export function resolveSkillRoot(profileBaseUrl) {
  if (!profileBaseUrl) {
    throw new Error('roadbook-atlas: missing DSH profile baseUrl for package resolution');
  }
  let manifestPath;
  try {
    manifestPath = createRequire(profileBaseUrl).resolve(`${PACKAGE_NAME}/package.json`);
  } catch (error) {
    throw new Error(
      `roadbook-atlas: cannot resolve ${PACKAGE_NAME}/package.json from the DSH profile`,
      { cause: error },
    );
  }
  return join(dirname(manifestPath), 'skills');
}

/**
 * 就绪自检：列出缺失的关键文件。空数组 = 一切就位。
 * 不抛错 —— 插件半途抛错会连带整个 profile 的加载，缺文件只该是一条警告。
 */
export function missingBundledFiles(root = packageRoot()) {
  const required = [
    join('skills', SKILL_NAME, 'SKILL.md'),
    join('skills', SKILL_NAME, 'bin', 'atlas.mjs'),
    join('skills', SKILL_NAME, 'vendor', 'archify', 'bin', 'archify.mjs'),
    join('lib', 'client.js'),
  ];
  return required.filter((relative) => !existsSync(join(root, relative)));
}

/**
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 */
export function apply(ctx) {
  const missing = missingBundledFiles();
  const line = (level, text) => {
    const sink = ctx && ctx.logger && typeof ctx.logger[level] === 'function' ? ctx.logger[level] : null;
    if (sink) sink.call(ctx.logger, text);
  };
  if (missing.length > 0) {
    line('warn', `roadbook-atlas: 缺少随包文件（图册会不可用）：${missing.join(', ')}`);
    return;
  }
  line('info', `roadbook-atlas: ready（skill=${SKILL_NAME}, diagrams=${DEFAULT_DIAGRAM_DIR}）`);
}
