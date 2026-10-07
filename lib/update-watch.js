/**
 * lib/update-watch.js —— 自动更新的**读侧**：状态读取 / 检查 / 冷却 / 升级对账。
 *
 * 2026-10-07：从 `lib/index.js` 那个 735 行的 `createUpdateService` 里切出来的一半
 * （另一半是写侧 `./update-apply.js`）。切分动因是 D14 第 1 条「单文件 ≤500 行」；
 * 判据与纯逻辑仍在 `./update.js`，这里只做「读 + 落证据」。
 *
 * 分工与注入（D14 第 1 条：依赖显式传入，禁止函数深处直连隐式全局）：
 *   - 本模块只读：定时检查、冷却判定、状态载荷、与观测文件里的 `apply-finish` 对账；
 *   - 会改变磁盘状态的那一半（锁 / 子进程 / 安装命令探测）在 `./update-apply.js`；
 *   - 两侧共用件全部由接线层注入：`writeReport`（观测落盘）、`planOf`（安装命令探测）、
 *     `operationOf`（当前这次更新操作）、`spec`（本机安装形态）、`info`（日志）。
 *
 * 两条不变量（每条对应一次真实事故，勿省）：
 *   - **读不到就是 unknown**：绝不把「检查失败」显示成「已是最新」（假绿）；
 *   - **任何失败都不上抛**：更新是主行的附加能力，抛出去会让整行插件在面板上变成「未运行」。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkForUpdate,
  commitApiUrlOf,
  errorText,
  installKindOf,
  lastApplyTarget,
  lastCheckAt,
  lockCommitOf,
  readFileTail,
  readProfileLock,
  upgradeOutcome,
  upstreamOf,
} from './update.js';

/**
 * 建读侧。
 *
 * @param {{ ctx: object, settings: object, now: Function, root: string, profileDir: string,
 *           reportPath: string, bootVersion: string, manifestFetcher: object|null,
 *           pluginVersion: Function, spec: Function, planOf: Function, operationOf: Function,
 *           info: Function, writeReport: Function }} deps 全部显式传入（见文件头）
 * @returns {{ check: Function, status: Function }}
 */
export function createUpdateWatch(deps) {
  const { ctx, settings, now, root, profileDir, reportPath, bootVersion, manifestFetcher, pluginVersion, spec, planOf, operationOf, info, writeReport } = deps;

  /** 读侧自己的三个闭包变量：最近一次判定、进行中的检查、内存里的最后一次检查时间。 */
  const state = { status: null, checking: null, lastCheckAt: null };

  // ── 本机事实（读） ──────────────────────────────────────────────────────────
  const readOwnManifest = () => {
    try {
      return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  const upstream = () => upstreamOf(readOwnManifest(), settings.manifestUrl);
  const installedCommit = (value) => (value === null ? null : lockCommitOf(readProfileLock(profileDir), value));

  // ── 检查 ───────────────────────────────────────────────────────────────────
  const runCheck = async ({ force = false } = {}) => {
    if (settings.mode === 'off') return statusPayload();
    if (state.checking !== null) return state.checking;
    if (force !== true) {
      // 冷却时间取「内存里的最后一次」与「观测文件里的最后一次」的较大者：观测可以关
      // （`updateReport: false`），只认文件的话关掉观测就等于关掉冷却 —— 实测关掉后 5 次轮询
      // 打了 5 次远端，而客户端在更新进行中就是每秒轮询一次 /status。
      const fromFile = lastCheckAt(reportPath);
      const last = state.lastCheckAt === null ? fromFile : fromFile === null ? state.lastCheckAt : Math.max(fromFile, state.lastCheckAt);
      if (last !== null && now() - last < settings.intervalHours * 3600000) {
        writeReport({ event: 'skip', reason: 'cooldown', lastCheckAt: new Date(last).toISOString() });
        return statusPayload();
      }
    }
    state.checking = (async () => {
      try {
        const target = upstream();
        const value = spec();
        const installed = installedCommit(value);
        const verdict = await checkForUpdate({
          fetchImpl: manifestFetcher === null ? undefined : manifestFetcher.fetch,
          manifestUrl: target === null ? '' : target.manifestUrl,
          installedVersion: pluginVersion(root),
          installedCommit: installed,
          // 「推了代码没升版」这一档要找上游 HEAD 提交来对账（版本号相同时才问，省一次请求）。
          commitUrl: target === null ? null : commitApiUrlOf(target.repo, target.branch),
          installKind: value === null ? 'unknown' : installKindOf(value),
          timeoutMs: settings.timeoutMs,
          now,
        });
        state.lastCheckAt = now();
        state.status = {
          ...verdict,
          transport: manifestFetcher === null ? null : manifestFetcher.transport(),
          upstream: target === null ? null : { repo: target.repo, branch: target.branch, source: target.source },
        };
        writeReport({
          event: 'check',
          state: verdict.state,
          reason: verdict.reason,
          installed: verdict.installedVersion,
          latest: verdict.latestVersion,
          commitCheck: verdict.commitCheck,
          elapsedMs: verdict.elapsedMs,
          transport: state.status.transport,
          manifestUrl: target === null ? null : target.manifestUrl,
        });
        if (verdict.state === 'update-available') {
          info(
            `[roadbook] 有新版本 v${verdict.latestVersion}（当前 v${verdict.installedVersion}，依据 ${verdict.reason}）：` +
              `侧栏「图册」标签页点「更新」即可，或把主行配置的 update 设为 auto`,
          );
        } else if (verdict.state === 'unknown') {
          warnOnce(
            `[roadbook] 更新检查判不了（${verdict.reason}${verdict.message === undefined ? '' : `：${verdict.message}`}）：` +
              `这边不会把它当成「已是最新」；要手工核对就比对 git log，或被拦截的网络里把根 CA 装进系统信任库`,
          );
        }
      } catch (error) {
        // 兜底：检查本身出意外也只记证据，绝不上抛（它不是会话路径）。
        state.status = { state: 'unknown', reason: 'handler', message: errorText(error), checkedAt: new Date(now()).toISOString() };
        writeReport({ event: 'check', state: 'unknown', reason: 'handler', message: errorText(error) });
      } finally {
        state.checking = null;
      }
      return statusPayload();
    })();
    return state.checking;
  };

  /** 判不了的时候要留一条看得见的日志：`unknown` 只在观测文件里，用户不会去翻。 */
  const warnOnce = (() => {
    let used = false;
    return (text) => {
      if (used) return;
      used = true;
      try {
        ctx?.logger?.warn?.(text);
      } catch {
        /* 日志是旁路 */
      }
    };
  })();

  const applierInfo = () => {
    const plan = planOf();
    return {
      available: plan.available,
      reason: plan.reason,
      kind: plan.kind,
      target: plan.target,
      labels: plan.candidates.map((candidate) => candidate.label),
      skipped: plan.skipped,
    };
  };

  // ── 升级对账（状态路由每次现算） ─────────────────────────────────────────────
  /**
   * 上次更新落地了没有。`bootVersion` 是**本进程加载时**的版本（重启后才会变），观测文件里最后一条
   * `apply-finish` 是目标版本 —— 两者一对账才知道那次更新到底生效没有；在此之前界面只能说一句
   * 「重启后生效」，永远没有下文。（只认「真换了版本的成功安装」：见 `lastApplyTarget` 的四条守卫。）
   *
   * 每次状态请求多读一次观测文件尾巴（≤64 KiB）：状态路由本来就要读它判冷却
   * （`runCheck` → `lastCheckAt`），代价同量级；换缓存反而会让「刚更新完」的那次请求读到旧结论。
   */
  const upgradeInfo = () => {
    const landed = lastApplyTarget(readFileTail(reportPath));
    return {
      ...upgradeOutcome({ target: landed?.after ?? null, running: bootVersion }),
      // `before` 必须一起发出去：界面那句「上次更新已生效：v{before} → v{target}」要用它，
      // 少发一次就会恒显示成「v? → v0.7.0」（对账链上少一环，测试的假夹具补不出来）。
      before: landed?.before ?? null,
    };
  };

  const statusPayload = () => ({
    ok: true,
    mode: settings.mode,
    bootVersion,
    installedNow: pluginVersion(root),
    installed: state.status?.installedVersion ?? pluginVersion(root),
    latest: state.status?.latestVersion ?? null,
    state: state.status?.state ?? (settings.mode === 'off' ? 'off' : 'idle'),
    reason: state.status?.reason ?? '',
    checkedAt: state.status?.checkedAt ?? null,
    transport: state.status?.transport ?? null,
    upstream: state.status?.upstream ?? null,
    applier: settings.mode === 'off' ? { available: false, reason: 'mode-off', skipped: [] } : applierInfo(),
    // 当前这次更新操作由写侧持有，读侧只按接线层给的取值器读它（共享状态走显式入参）。
    operation: operationOf(),
    upgrade: upgradeInfo(),
  });

  return { check: runCheck, status: statusPayload };
}
