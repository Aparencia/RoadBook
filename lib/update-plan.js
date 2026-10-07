/**
 * lib/update-plan.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { tmpdir } from 'node:os';
import { getCACertificates } from 'node:tls';
import { UPDATE_MODES, DEFAULT_MODE, DEFAULT_INTERVAL_HOURS, DEFAULT_TIMEOUT_MS, DEFAULT_APPLY_TIMEOUT_MS, DEFAULT_REPORT_MAX_BYTES } from './update-constants.js';
import { compareVersions } from './update-version.js';
import { commitOfJson } from './update-repo.js';
import { errorText } from './update-transport.js';

/**
 * 五态判定。顺序即优先级，每一步都有理由：
 *   ① `dev`（link:/file: 安装）：开发副本随代码走，报「有新版」只是噪音；
 *   ② `unknown`：读不懂的输入一律判不了 —— 不许退化成「已是最新」（那是假绿）；
 *   ③ `update-available`：远端版本更高；
 *   ④ `commit` 补判：版本相同但提交不同（推了没升版）也算有更新；**只做单向补判**，
 *      绝不用它把结论降级成「已最新」（локальный checkout 与远端同版本不同提交是常态）；
 *   ⑤ `ahead`：本地比远端新（开发/回滚），不打扰；
 *   ⑥ 其余 = `up-to-date`。
 *
 * @returns {{ state: 'dev'|'unknown'|'update-available'|'ahead'|'up-to-date', reason: string }}
 */
export function decideUpdate(options = {}) {
  const {
    installedVersion = null,
    latestVersion = null,
    installedCommit = null,
    latestCommit = null,
    installKind = 'git',
  } = options;
  if (installKind === 'local') return { state: 'dev', reason: 'dev-install' };
  if (installKind === 'unknown') return { state: 'unknown', reason: 'unknown-source' };
  if (installedVersion === null || latestVersion === null) return { state: 'unknown', reason: 'no-version' };
  const order = compareVersions(latestVersion, installedVersion);
  if (order === null) return { state: 'unknown', reason: 'unparsable-version' };
  if (order > 0) return { state: 'update-available', reason: 'version' };
  if (order < 0) return { state: 'ahead', reason: 'installed-newer' };
  if (installedCommit !== null && latestCommit !== null && installedCommit !== latestCommit) {
    return { state: 'update-available', reason: 'commit' };
  }
  return { state: 'up-to-date', reason: 'same-version' };
}

// ── 清单读取的两级传输（本机实测的 TLS 坑） ──────────────────────────────────
//
// 为什么需要第二级（2026-10-05 本机实测，勿删）：这台机器上有做 TLS 拦截的中间盒，
// 它的根 CA 在 Windows 系统信任库里、**不在 Node 自带的 CA 清单里**。于是：
//   `fetch('https://raw.githubusercontent.com/…')` → `fetch failed` / `unable to verify the first
//   certificate`；`curl.exe` 同样 000；而 `git ls-remote` 与
//   `node --use-system-ca` 都正常（后者实测 200 且拿到 `"version": "0.3.0"`）。
// 插件跑在宿主进程里，改不了进程启动参数，所以第二级用 `node:https` + `tls.getCACertificates('system')`
// 手工把系统 CA 交进去。**只在证书类错误上回退**：DNS 不通、超时、代理拒连都不该白跑第二次。

/**
 * 读一次远端清单并给出判定。**任何读取失败都是 `unknown`，不是「已是最新」**。
 *
 * @param {{ fetchImpl?: Function, manifestUrl?: string, installedVersion?: string|null,
 *           installedCommit?: string|null, latestCommit?: string|null, installKind?: string,
 *           commitUrl?: string|null, timeoutMs?: number, now?: Function }} options
 */
export async function checkForUpdate(options = {}) {
  const fetchImpl = options.fetchImpl;
  const manifestUrl = typeof options.manifestUrl === 'string' ? options.manifestUrl : '';
  const installedVersion = options.installedVersion ?? null;
  const installedCommit = options.installedCommit ?? null;
  const installKind = options.installKind ?? 'git';
  const commitUrl = typeof options.commitUrl === 'string' && options.commitUrl !== '' ? options.commitUrl : null;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const startedAt = now();
  // 提交对账的三态：skipped（没上游/非 git/自己都不知道装的哪个 commit）、unknown（问了但没读懂）、
  // same / differ（问到了）。写进状态与观测，免得「已是最新」分不清是真同版本还是没查成。
  let commitCheck = 'skipped';
  let latestCommit = options.latestCommit ?? null;
  const base = () => ({
    manifestUrl,
    installedVersion,
    installedCommit,
    latestCommit,
    installKind,
    commitCheck,
    checkedAt: new Date(startedAt).toISOString(),
  });
  const finish = (patch) => ({ ...base(), ...patch, elapsedMs: Math.max(0, now() - startedAt) });

  if (manifestUrl === '') return finish({ state: 'unknown', reason: 'no-upstream', latestVersion: null });
  if (typeof fetchImpl !== 'function') return finish({ state: 'unknown', reason: 'no-fetch', latestVersion: null });

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer =
    controller === null
      ? null
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
  if (timer !== null && typeof timer.unref === 'function') timer.unref();

  let response;
  try {
    response = await fetchImpl(manifestUrl, {
      signal: controller === null ? undefined : controller.signal,
      headers: { accept: 'application/json' },
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (error) {
    return finish({ state: 'unknown', reason: timedOut ? 'timeout' : 'network', latestVersion: null, message: errorText(error) });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  if (response === null || response === undefined || response.ok !== true) {
    const status = Number(response?.status);
    return finish({
      state: 'unknown',
      reason: Number.isFinite(status) && status > 0 ? `http-${status}` : 'http',
      latestVersion: null,
    });
  }

  let payload;
  try {
    const text = typeof response.text === 'function' ? await response.text() : '';
    payload = JSON.parse(text);
  } catch (error) {
    return finish({ state: 'unknown', reason: 'bad-json', latestVersion: null, message: errorText(error) });
  }

  const latestVersion = typeof payload?.version === 'string' && payload.version.trim() !== '' ? payload.version.trim() : null;
  if (latestVersion === null) return finish({ state: 'unknown', reason: 'no-version', latestVersion: null });

  // 只有「版本号一模一样」才需要问提交；版本已经不同时问它是白花一次请求。
  const sameVersion = compareVersions(installedVersion, latestVersion) === 0;
  if (latestCommit === null && sameVersion && commitUrl !== null && installedCommit !== null) {
    try {
      const commitResponse = await fetchImpl(commitUrl, {
        headers: { accept: 'application/vnd.github+json' },
        redirect: 'follow',
        cache: 'no-store',
      });
      latestCommit =
        commitResponse !== null && commitResponse !== undefined && commitResponse.ok === true
          ? commitOfJson(typeof commitResponse.text === 'function' ? await commitResponse.text() : '')
          : null;
    } catch {
      latestCommit = null;
    }
    commitCheck = latestCommit === null ? 'unknown' : latestCommit === installedCommit ? 'same' : 'differ';
  }

  const verdict = decideUpdate({ installedVersion, latestVersion, installedCommit, latestCommit, installKind });
  return finish({ ...verdict, latestVersion });
}

// ── 配置归一化 ───────────────────────────────────────────────────────────────

/** 数字型配置：非有限数、越界一律回落默认值（配置写错不该让整行插件失效）。 */
export function clampedNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

/** 读取行配置并归一化；`reportPath` 默认留空，由宿主半解析成 `<os.tmpdir()>/roadbook-update.jsonl`（纯函数不碰环境）。 */
export function normalizeConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {};
  return {
    mode: UPDATE_MODES.includes(raw.update) ? raw.update : DEFAULT_MODE,
    intervalHours: clampedNumber(raw.updateIntervalHours, DEFAULT_INTERVAL_HOURS, 0.01, 24 * 365),
    timeoutMs: clampedNumber(raw.updateTimeoutMs, DEFAULT_TIMEOUT_MS, 200, 120000),
    applyTimeoutMs: clampedNumber(raw.updateApplyTimeoutMs, DEFAULT_APPLY_TIMEOUT_MS, 5000, 3600000),
    manifestUrl: typeof raw.updateUrl === 'string' ? raw.updateUrl.trim() : '',
    command: typeof raw.updateCommand === 'string' ? raw.updateCommand.trim() : '',
    report: raw.updateReport !== false,
    reportPath: typeof raw.updateReportPath === 'string' ? raw.updateReportPath.trim() : '',
    reportMaxBytes: clampedNumber(raw.updateReportMaxBytes, DEFAULT_REPORT_MAX_BYTES, 4096, 64 * 1024 * 1024),
  };
}

// ── 观测文件（读） ───────────────────────────────────────────────────────────
