/**
 * lib/update-version.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */

/**
 * 解析版本号：接受 `1`、`1.2`、`1.2.3`、`1.2.3-rc.2`、可选前缀 `v` 与 `+build` 后缀。
 *
 * 解析不出来**返回 null 而不是 0**：拿 0 顶替会把「读不懂」静默算成「比谁都旧」，
 * 于是提示一次并不存在的更新 —— 那是假红，和假绿一样坏。
 *
 * @returns {{ nums: number[], pre: string | null } | null}
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^v/iu, '');
  if (text === '') return null;
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(text);
  if (match === null) return null;
  return { nums: match[1].split('.').map((part) => Number(part)), pre: match[2] ?? null };
}

/**
 * 语义化比较（不引依赖，但按 semver 的预发布规则来）：不等长按 0 补齐；有预发布后缀的低于同号正式版；
 * 预发布之间**逐个标识符**比 —— 纯数字的按数值比（`rc.9 < rc.10`，字符串比会反过来），
 * 数字标识符低于字母标识符，其余按字典序（semver §11）。
 *
 * @returns {-1|0|1|null} null = 有一侧解析不出来（调用方必须当「判不了」处理，不许当相等）
 */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null || b === null) return null;
  const length = Math.max(a.nums.length, b.nums.length);
  for (let index = 0; index < length; index += 1) {
    const x = a.nums[index] ?? 0;
    const y = b.nums[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1; // 1.2.3 > 1.2.3-rc.1
  if (b.pre === null) return -1;
  return comparePrerelease(a.pre, b.pre);
}

/** 预发布标识符逐个比：`1.0.0-rc.10` 必须大于 `1.0.0-rc.9`（此前按整串比是反的）。 */
export function comparePrerelease(left, right) {
  const x = left.split('.');
  const y = right.split('.');
  const length = Math.max(x.length, y.length);
  for (let index = 0; index < length; index += 1) {
    const one = x[index];
    const two = y[index];
    if (one === undefined) return -1; // 前缀更短的更小：1.0.0-rc < 1.0.0-rc.1
    if (two === undefined) return 1;
    if (one === two) continue;
    const oneNumeric = /^\d+$/u.test(one);
    const twoNumeric = /^\d+$/u.test(two);
    if (oneNumeric && twoNumeric) {
      const oneValue = Number(one);
      const twoValue = Number(two);
      if (oneValue !== twoValue) return oneValue < twoValue ? -1 : 1;
      continue;
    }
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1; // 数字标识符低于字母标识符
    return one < two ? -1 : 1;
  }
  return 0;
}

// ── 上游身份 ─────────────────────────────────────────────────────────────────

/** 版本字段能不能用：非空串、且不是 `pluginVersion()` 读不到时的 `unknown…` 降级串。 */
export function readableVersion(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '' || /^unknown/u.test(text)) return null;
  return text;
}
