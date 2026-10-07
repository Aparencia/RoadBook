/**
 * lib/update-report.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_REPORT_FILE, REPORT_TAIL_BYTES } from './update-constants.js';
import { readableVersion } from './update-version.js';

/** 读文件尾部若干字节（读不到返回空串）：观测文件会累积到 2 MiB，只为拿一行而整读是白花 I/O。 */
export function readFileTail(file, maxBytes = REPORT_TAIL_BYTES) {
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    if (length <= 0) return '';
    const descriptor = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const read = readSync(descriptor, buffer, 0, length, start);
      return buffer.subarray(0, read).toString('utf8');
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return '';
  }
}

/**
 * 从观测文件的正文里取最后一次 `check` 事件（从尾部往前找第一条）。
 * 坏行直接跳过：观测是旁路，一行坏数据不该拦住冷却判断，更不该拦住启动。
 *
 * @returns {{ at: number, state: string, latest: string|null } | null}
 */
export function lastCheckEvent(reportText) {
  const lines = String(reportText ?? '').split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line === '' || line.startsWith('{') === false) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry === null || typeof entry !== 'object' || entry.event !== 'check') continue;
    const at = Date.parse(typeof entry.time === 'string' ? entry.time : '');
    if (!Number.isFinite(at)) continue;
    return {
      at,
      state: typeof entry.state === 'string' ? entry.state : '',
      latest: typeof entry.latest === 'string' ? entry.latest : null,
    };
  }
  return null;
}

/** 上一次检查的时间戳（毫秒）；没检查过或读不到返回 null。 */
export function lastCheckAt(reportPath, maxBytes = REPORT_TAIL_BYTES) {
  const event = lastCheckEvent(readFileTail(reportPath, maxBytes));
  return event === null ? null : event.at;
}

/**
 * 从观测文件正文里取**最后一次**「更新落地」事件（`apply-finish`）的目标版本。
 *
 * 为什么需要它：「安装命令成功」与「新版本真的在跑」是**两件事**，中间隔着一次重启。
 * `apply-finish` 记的 `after` 是安装命令跑完那一刻**磁盘上**的版本（`pluginVersion()` 读的是
 * package.json），而内存里跑的仍是旧代码 —— 重启会把内存里的一切清掉，这条文件记录是重启后
 * 判断「生效了没有」的唯一凭据。没有它，界面只能说一句「重启后生效」然后永远不知道结果。
 *
 * **只看最后一条**，而且它必须是一次「真换了版本的成功安装」，否则返回 null（宁可不说，也不
 * 拿更早的一条冒充这次）：
 *   - `exitCode !== 0` —— 装失败了（`after` 照样是当时盘上的版本，不改就是没换）；
 *   - `after` 为空或是 `unknown…` 降级串 —— 读不到版本（`pluginVersion()` 读不到时回
 *     `unknown（…）`，那是「没测出来」，不是「换成了这个版本」）；
 *   - `after === before` —— `pnpm` 的 "Already up to date" 那种空转：装是装成功了，但盘上
 *     什么都没换，说成「已更新 vX → vX」正是图册更新条专门拦掉的那句假话。
 *
 * @returns {{ at: number, before: string, after: string } | null}
 */
export function lastApplyTarget(reportText) {
  const lines = String(reportText ?? '').split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line === '' || line.startsWith('{') === false) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry === null || typeof entry !== 'object' || entry.event !== 'apply-finish') continue;
    // 走到这里就是最后一条 apply-finish：合格就报，不合格就到此为止。
    if (entry.exitCode !== 0) return null;
    const after = readableVersion(entry.after);
    const before = readableVersion(entry.before);
    if (after === null || after === before) return null;
    const at = Date.parse(typeof entry.time === 'string' ? entry.time : '');
    return { at: Number.isFinite(at) ? at : 0, before: before ?? '', after };
  }
  return null;
}

/** 默认观测文件路径（`<os.tmpdir()>/roadbook-update.jsonl`），与配置里的空串约定一致。 */
export function defaultReportPath() {
  return join(tmpdir(), DEFAULT_REPORT_FILE);
}
