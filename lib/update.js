/**
 * RoadBook 主插件 —— 自动更新的纯逻辑层。
 *
 * 为什么单独一个文件：主行 `lib/index.js` 的定位是「只做接线」（与 `roadbook-autoload` 的
 * `trigger.js` / `index.js` 分工同一条口径）。判断、字符串解析、命令探测都是**可离线单测**的，
 * 它们一旦混进接线里，就只能靠真机肉眼验。
 *
 * 本文件只 import node 内置模块，**不 import 任何 dsh 包**：`lib/index.js` 必须能在裸 Node 里
 * import 成功（`test/umbrella-contract.test.mjs` 就是这么验的），主行也不能因为缺宿主包变成面板上的
 * 「未运行」。
 *
 * 为什么判定不能只问 dshmarket（2026-10-05 实测，勿回退成「转发市场结论」）：
 * `GET /dsh-market/api/v1/updates?name=roadbook` 返回 `updateAvailable:false` +
 * `installedVersion:"0.2.3"`（回落到版本号 ⇒ 它的 current === null），而同一时刻环境里装的确实是
 * 0.2.3、远端 main 已经是 0.3.0。根因在市场的 `lib/updates.js`：github 分支只从 spec 的 `#sha`
 * 或 `readLockCommits()` 取当前 commit，而后者只认 codeload 压缩包形状；pnpm 对 `github:` 简写写的是
 * `resolution: {commit:…, repo:…, type: git}`，于是 current 恒为 null ⇒ 永远报「无更新」。
 * 转发这种结论 = 把假绿当判据，正是本仓库最反对的一类错误。所以上游版本由本模块自己判定。
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { getCACertificates } from 'node:tls';

/** 更新模式：off = 整个能力关闭；notify = 只提示（默认，用户 2026-10-05 裁决）；auto = 判到新版本后由界面自动发起替换。 */
export const UPDATE_MODES = ['off', 'notify', 'auto'];
/** 默认模式。默认就开是有意的：不默认检查，这个能力等于没装。 */
export const DEFAULT_MODE = 'notify';
/** 两次自动检查之间的最短间隔（小时）。DSH 会频繁重启，不设冷却就是每次开机打一次 GitHub。 */
export const DEFAULT_INTERVAL_HOURS = 24;
/** 单次远端清单读取的超时（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 8000;
/** 安装命令的超时（毫秒）；超时先 SIGTERM，宽限后再 SIGKILL。 */
export const DEFAULT_APPLY_TIMEOUT_MS = 300000;
/** 观测文件缺省名（放在 os.tmpdir() 下，与 roadbook-autoload 的观测文件同一口径、不同文件）。 */
export const DEFAULT_REPORT_FILE = 'roadbook-update.jsonl';
/** 观测文件缺省字节上限（2 MiB）：文件在共享临时目录里、跨会话、永不清理，不轮转就是慢性泄漏。 */
export const DEFAULT_REPORT_MAX_BYTES = 2097152;
/** 上游清单所在分支：README 写明「main 分支 = 现行版本」。 */
export const DEFAULT_BRANCH = 'main';
/** 本伞包的 npm 身份（profile 依赖表里的键名）。 */
export const DEFAULT_PACKAGE = 'roadbook';
/** 观测文件尾部读取上限：只为了拿「上次检查时间」，读整个文件是没必要的 I/O。 */
export const REPORT_TAIL_BYTES = 65536;
/** 陈旧锁的判定阈值（毫秒）：超过它就是上次更新没跑完/进程被杀，允许覆盖。 */
export const STALE_LOCK_MS = 30 * 60 * 1000;
/** 响应体上限（清单只有几 KB；设上限是为了不让一份巨型响应把内存吃掉）。 */
export const DEFAULT_BODY_MAX_BYTES = 1024 * 1024;
/** 第二级传输最多跟几跳 3xx（与 fetch 默认行为对齐，但要有限）。 */
export const DEFAULT_MAX_REDIRECTS = 5;
/** shell 模板里允许出现的 target 字符：`github:owner/repo`、`pkg@1.2.3`、`pkg@latest`、`owner/repo#semver:^1.0.0` 全覆盖。 */
export const SHELL_SAFE_TARGET = /^[A-Za-z0-9@/._:+~^*#-]+$/u;
/** `process.argv[1]` 命中这些形状才可能是 dsh 的 CLI 入口（对齐 dsh-plugin-mgr 的 dshArgv，并补 cli.js —— 桌面版入口是 dsh-desktop-host/lib/cli.js）。 */
const ENTRY_SHAPE = /[\\/](?:bin\.(?:js|ts)|cli\.(?:js|mjs))$/u;

// ── 版本 ─────────────────────────────────────────────────────────────────────

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
function comparePrerelease(left, right) {
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

/** 从任意 GitHub 写法里取 `owner/repo`：`github:` 简写、https、git+ssh、`git@host:` 都认；其他主机返回 null。 */
export function repoSlug(url) {
  if (typeof url !== 'string') return null;
  const text = url.trim();
  if (text === '') return null;
  const shorthand = /^github:([^/\s]+)\/([^/\s#]+)$/iu.exec(text);
  if (shorthand !== null) return `${shorthand[1]}/${shorthand[2].replace(/\.git$/iu, '')}`;
  const match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?github\.com[/:]([^/\s]+)\/([^/\s#?]+)/iu.exec(text);
  if (match === null) return null;
  return `${match[1]}/${match[2].replace(/\.git$/iu, '')}`;
}

/** 本包 manifest 里声明的仓库（`repository` 可以是字符串或 `{ url }`）。 */
export function repoOfManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object') return null;
  const repository = manifest.repository;
  const url = typeof repository === 'string' ? repository : typeof repository?.url === 'string' ? repository.url : '';
  return repoSlug(url);
}

/**
 * 上游清单地址：默认从**本包** `package.json` 的 `repository` 推导（不硬编码仓库名 ——
 * 硬编码会让 fork / 改名后的副本永远对着别人的仓库报更新），可用 `updateUrl` 覆盖。
 *
 * @returns {{ repo: string|null, branch: string|null, manifestUrl: string, source: 'repository'|'config' } | null}
 */
export function upstreamOf(manifest, override) {
  const explicit = typeof override === 'string' ? override.trim() : '';
  if (explicit !== '') {
    // 覆盖值必须是一个 http(s) 地址：给个相对路径只会变成「检查失败」，不如当场判定为「没有上游」。
    if (!/^https?:\/\//iu.test(explicit)) return null;
    return { repo: repoOfManifest(manifest), branch: null, manifestUrl: explicit, source: 'config' };
  }
  const repo = repoOfManifest(manifest);
  if (repo === null) return null;
  return {
    repo,
    branch: DEFAULT_BRANCH,
    manifestUrl: `https://raw.githubusercontent.com/${repo}/${DEFAULT_BRANCH}/package.json`,
    source: 'repository',
  };
}

/** 安装来源的形状：git / registry / local（开发安装）/ unknown（压缩包链接一类，不猜）。 */
export function installKindOf(spec) {
  if (typeof spec !== 'string') return 'unknown';
  const text = spec.trim();
  if (text === '') return 'unknown';
  const lower = text.toLowerCase();
  if (lower.startsWith('link:') || lower.startsWith('file:') || lower.startsWith('.') || lower.startsWith('/')) return 'local';
  // 盘符绝对路径（`C:\repo`、`D:/repo`）也是开发副本：漏了这一类就会被当成 registry 依赖，
  // 于是判定不报 dev、`candidateInstallers` 还会拿 `roadbook@latest` 盖掉本地开发安装。
  if (/^[a-z]:[\\/]/u.test(text)) return 'local';
  if (lower.startsWith('workspace:')) return 'local';
  if (lower.startsWith('github:') || lower.startsWith('git+') || lower.startsWith('git@') || lower.startsWith('git://')) return 'git';
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'unknown';
  return 'registry';
}

/** 把任意写法归一成 `github.com/owner/repo`（小写），供 lockfile 对账用；非 GitHub 返回 null。 */
export function repoKeyOfSpec(spec) {
  const slug = repoSlug(spec);
  if (slug === null) return null;
  return `github.com/${slug.toLowerCase()}`;
}

/**
 * 从 profile 的 `pnpm-lock.yaml` 里读这条依赖**实际装的是哪个 commit**（best-effort）。
 *
 * 为什么要它：`node_modules/<pkg>` 不是 git 检出，本包自己不知道装的是哪个版本对应的哪个提交。
 * 有了它，判据就能在「版本号相同、提交不同」时补一刀（推了代码没升版是真实会发生的情形）。
 * 读不到返回 null —— 绝不拿别条依赖的 commit 顶替（市场 #632 就是同 monorepo 兄弟包串味）。
 */
export function lockCommitOf(lockText, spec) {
  const want = repoKeyOfSpec(spec);
  if (want === null || typeof lockText !== 'string') return null;
  const pattern = /resolution:\s*\{([^}]*)\}/gu;
  const seen = new Set();
  let match = pattern.exec(lockText);
  while (match !== null) {
    const body = match[1];
    const commit = /\bcommit:\s*([0-9a-f]{40})\b/iu.exec(body);
    const repo = /\brepo:\s*([^\s,}]+)/u.exec(body);
    if (commit !== null && repo !== null && repoKeyOfSpec(repo[1]) === want) seen.add(commit[1].toLowerCase());
    match = pattern.exec(lockText);
  }
  // 同一仓库在 lockfile 里出现多个不同 commit（多个 importer / 多个 ref）⇒ 判不了，
  // 返回 null 而不是「按文件顺序撞上的第一个」——撞错了会把别人的提交当成自己的。
  return seen.size === 1 ? [...seen][0] : null;
}

// ── 判定 ─────────────────────────────────────────────────────────────────────

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

/** Node 是否支持读系统 CA（`tls.getCACertificates('system')`，Node 23.2+/22.15+）。 */
export function systemCaCertificates() {
  try {
    const list = getCACertificates('system');
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

/** 这个错误是不是「证书链验不过」——只有它才值得换一条传输再试。 */
export function isCertificateError(error) {
  const text = [
    error instanceof Error ? error.message : String(error ?? ''),
    error?.cause instanceof Error ? error.cause.message : String(error?.cause ?? ''),
    error?.cause?.code ?? '',
    error?.code ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return (
    text.includes('certificate') ||
    text.includes('unable to verify') ||
    text.includes('self signed') ||
    text.includes('self-signed') ||
    text.includes('cert_') ||
    text.includes('unable_to_verify')
  );
}

/**
 * 用 `node:https` 取一份文本（第二级传输）。返回与 `fetch` 同形的 `{ ok, status, text() }`，
 * 这样 `checkForUpdate` 不需要知道自己走的是哪一级。
 *
 * 三条与第一级对齐的行为（此前只有 `fetch` 有，于是「专门为 TLS 拦截机器准备的那一级」
 * 反而更弱）：① **总时限**——`timeout` 选项只是 socket 空闲超时，慢速滴答的服务器能拖到任意长，
 * 这里用 `setTimeout` 硬销毁；② 最多跟 5 跳 3xx（fetch 默认就跟，仓库改名后这一级不能变成永久 unknown）；
 * ③ 响应体上限，别把一份巨型响应读进内存。
 */
export function httpsGetText(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const ca = options.ca === undefined ? systemCaCertificates() : options.ca;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_BODY_MAX_BYTES;
  const maxHops = Number.isFinite(options.maxHops) ? options.maxHops : DEFAULT_MAX_REDIRECTS;
  const attempt = (target, hops) =>
    new Promise((resolve, reject) => {
      const settings = { timeout: timeoutMs };
      if (Array.isArray(ca) && ca.length > 0) settings.ca = ca;
      const request = httpsRequest(target, settings, (response) => {
        const status = Number(response.statusCode);
        const location = response.headers?.location;
        if (status >= 300 && status < 400 && typeof location === 'string' && location !== '') {
          response.resume(); // 丢掉这一跳的响应体，否则 socket 不会释放
          if (hops >= maxHops) {
            reject(new Error(`redirect 次数超过 ${maxHops}：${target}`));
            return;
          }
          let next = null;
          try {
            next = new URL(location, target).toString();
          } catch {
            next = null;
          }
          if (next === null) {
            reject(new Error(`302 的 Location 读不懂：${location}`));
            return;
          }
          resolve(attempt(next, hops + 1));
          return;
        }
        let text = '';
        let bytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk, 'utf8');
          if (bytes > maxBytes) {
            request.destroy(new Error(`响应体超过 ${maxBytes} 字节`));
            return;
          }
          text += chunk;
        });
        response.on('end', () => resolve({ ok: status >= 200 && status < 300, status, text: async () => text }));
        response.on('error', reject);
      });
      const deadline = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs);
      if (typeof deadline.unref === 'function') deadline.unref();
      const done = () => clearTimeout(deadline);
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (error) => {
        done();
        reject(error);
      });
      request.on('close', done);
      request.end();
    });
  return attempt(url, 0);
}

/**
 * 造一个「先 fetch、证书类错误再换系统 CA」的清单读取器。
 *
 * 返回的 `transport()` 是**证据**：这次判定是靠哪一级拿到的（写进观测文件与状态路由的 `transport` 字段），
 * 免得日后有人看到 `unknown` 分不清是「没网」还是「CA 不对」。
 */
export function createManifestFetcher(options = {}) {
  const baseFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
  const fallback = typeof options.httpsImpl === 'function' ? options.httpsImpl : httpsGetText;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const allowSystemCa = options.systemCa !== false;
  const state = { transport: 'fetch', fallbacks: 0 };
  const fetchFn = async (url, init) => {
    if (baseFetch === null) throw new Error('fetch 不可用');
    try {
      const response = await baseFetch(url, init);
      state.transport = 'fetch';
      return response;
    } catch (error) {
      if (allowSystemCa !== true || !isCertificateError(error)) throw error;
      const response = await fallback(url, { timeoutMs, ca: systemCaCertificates() });
      state.transport = 'system-ca';
      state.fallbacks += 1;
      return response;
    }
  };
  return { fetch: fetchFn, transport: () => state.transport, fallbacks: () => state.fallbacks };
}

// ── 检查 ─────────────────────────────────────────────────────────────────────

/**
 * 上游主干 HEAD 提交的 API 地址（GitHub REST）。只在「版本号相同」时才去问它 —— 那正是
 * 「推了代码没升版」这一档唯一能判的依据，也是 `decideUpdate` 第 ④ 步存在的理由。
 */
export function commitApiUrlOf(repo, branch = DEFAULT_BRANCH) {
  if (typeof repo !== 'string' || repo.trim() === '') return null;
  const name = branch === null || branch === undefined || branch === '' ? DEFAULT_BRANCH : String(branch);
  return `https://api.github.com/repos/${repo.trim()}/${'commits'}/${encodeURIComponent(name)}`;
}

/** 从 commits API 的响应里取 40 位 sha（读不懂返回 null，绝不猜一个）。 */
export function commitOfJson(text) {
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const sha = typeof payload?.sha === 'string' ? payload.sha.trim() : '';
  return /^[0-9a-f]{40}$/iu.test(sha) ? sha.toLowerCase() : null;
}

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
function clampedNumber(value, fallback, min, max) {
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

/** 版本字段能不能用：非空串、且不是 `pluginVersion()` 读不到时的 `unknown…` 降级串。 */
function readableVersion(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '' || /^unknown/u.test(text)) return null;
  return text;
}

/**
 * 重启后对账：上次安装的目标版本，与**当前真正在跑的**版本对得上吗。
 *
 * 四态，且读不到一律 `unknown` —— 与判定层同一条口径：不许把「判不了」显示成「已生效」。
 *   - `applied`    运行版本 === 目标版本（重启后确实换过来了）
 *   - `pending`    运行版本 <  目标版本（还没重启，或重启了但没换成功）
 *   - `newer`      运行版本 >  目标版本（此后又被别的版本盖过；不对这次更新下任何结论）
 *   - `unknown`    目标或运行版本读不到（含 `unknown…` 降级串）
 *
 * 版本串解析不出来时退回**字面相等**判断：相等记 applied，不相等记 pending —— 仍然是三态之一，
 * 不会因为读不懂就升级成「已生效」。
 *
 * @returns {{ state: 'applied'|'pending'|'newer'|'unknown', target: string|null, running: string|null }}
 */
export function upgradeOutcome(options = {}) {
  const target = readableVersion(options.target);
  const running = readableVersion(options.running);
  if (target === null || running === null) return { state: 'unknown', target, running };
  const order = compareVersions(running, target);
  if (order === null) {
    return { state: running === target ? 'applied' : 'pending', target, running };
  }
  if (order === 0) return { state: 'applied', target, running };
  return { state: order > 0 ? 'newer' : 'pending', target, running };
}

// ── 本机事实（profile / 运行时） ─────────────────────────────────────────────

/** DSH 家目录：`DSH_HOME` 优先，退回 `~/.dsh`。 */
export function homeOf(env) {
  const explicit = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  return explicit !== '' ? explicit : join(homedir(), '.dsh');
}

/**
 * 本插件所在的 profile 目录。
 *
 * 三条路按可靠性排序：显式 `DSH_PROFILE_DIR` → `DSH_HOME + DSH_PROFILE` → 从 `node_modules` 布局反推
 * （`<profile>/node_modules/<pkg>`）。反推只在真的落在 node_modules 里时成立 —— `link:` 安装时它是
 * 仓库路径，推出来的「profile」是错的，所以放在最后且要求路径形状成立，否则返回空串（调用方据此拒绝更新）。
 */
export function profileDirOf(env, packageRootPath) {
  const explicit = typeof env?.DSH_PROFILE_DIR === 'string' ? env.DSH_PROFILE_DIR.trim() : '';
  if (explicit !== '') return explicit;
  const home = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  const profile = typeof env?.DSH_PROFILE === 'string' ? env.DSH_PROFILE.trim() : '';
  if (home !== '' && profile !== '') return join(home, 'profiles', profile);
  const text = typeof packageRootPath === 'string' ? packageRootPath : '';
  const marker = `${sep}node_modules${sep}`;
  const at = text.lastIndexOf(marker);
  return at > 0 ? text.slice(0, at) : '';
}

/** 读 profile 的 `package.json` 里这条依赖的声明（spec）；读不到返回 null。 */
export function readProfileSpec(profileDir, packageName = DEFAULT_PACKAGE) {
  if (typeof profileDir !== 'string' || profileDir === '') return null;
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
    const spec = manifest?.dependencies?.[packageName];
    return typeof spec === 'string' && spec.trim() !== '' ? spec.trim() : null;
  } catch {
    return null;
  }
}

/** 读 profile 的 `pnpm-lock.yaml` 正文；读不到返回空串。 */
export function readProfileLock(profileDir) {
  if (typeof profileDir !== 'string' || profileDir === '') return '';
  try {
    return readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8');
  } catch {
    return '';
  }
}

/**
 * 扫描 `$DSH_HOME/dsh-runtimes/` 下每个运行时的 `runtime.json`，给出「哪个 node 跑哪个 pnpm」。
 *
 * 为什么不用 PATH 上的 pnpm：本机实测 `dsh` 与 `pnpm` **都不在 PATH**，而 DSH 自带的运行时确实在
 * `$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/{node,pnpm}`（runtime.json 记录版本）。
 * 存在性检查交给调用方（`candidateInstallers` 的 `exists`），这里只负责「按布局说出候选路径」。
 */
export function readRuntimeCommands(home, platform = process.platform) {
  const base = join(home, 'dsh-runtimes');
  const found = [];
  let entries = [];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === null || typeof entry.isDirectory !== 'function' || !entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    let manifest = null;
    try {
      manifest = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest === null || typeof manifest !== 'object' || typeof manifest.node !== 'string') continue;
    found.push({
      label: entry.name,
      node: join(dir, 'dependencies', 'node', 'bin', platform === 'win32' ? 'node.exe' : 'node'),
      pnpm: join(dir, 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'),
      nodeVersion: manifest.node,
      pnpmVersion: typeof manifest.pnpm === 'string' ? manifest.pnpm : null,
    });
  }
  return found;
}

// ── 安装命令探测 ─────────────────────────────────────────────────────────────

/** 环境变量名大小写无关地取值（Windows 上是 `Path`，Linux 上是 `PATH`）。 */
function envValue(env, key) {
  if (env === null || typeof env !== 'object') return '';
  const lower = key.toLowerCase();
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === lower && typeof env[name] === 'string') return env[name];
  }
  return '';
}

/**
 * PATH 里找可执行文件（Windows 还要拼 PATHEXT）—— 用存在性检查代替「先跑一下试试」。
 *
 * `exists` 由调用方给，语义必须是「这里有一个**可执行文件**」：只判「路径存在」会把同名的
 * **目录**也算命中（实测：PATH 里有个叫 `dsh` 的文件夹会盖掉后面真正的 `dsh.cmd`）。
 */
export function whichInPath(name, env, platform, exists) {
  const path = envValue(env, 'PATH');
  if (path === '') return null;
  const suffixes = platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : [''];
  for (const rawDir of path.split(platform === 'win32' ? ';' : ':')) {
    const dir = rawDir.trim().replace(/^"+|"+$/gu, '');
    if (dir === '') continue;
    for (const suffix of suffixes) {
      const file = join(dir, `${name}${suffix}`);
      if (exists(file)) return file;
    }
  }
  return null;
}

/**
 * 给出「怎么装」的候选命令表，按可信度排序；每条都带 label 与（被跳过时的）理由。
 *
 * 阶梯：① 配置里的 `updateCommand`（最高优先，也是端到端演练的打桩入口）→ ② 本进程自己的 CLI 入口
 * （`process.argv[1]` 命中 bin.js/cli.js 时，用 `process.execPath` 重新调起它，对齐 dsh-plugin-mgr
 * 已验证过的做法）→ ③ `$DSH_HOME` 自带运行时的 node + pnpm.mjs → ④ PATH 上的 dsh。
 *
 * ② 在**桌面 GUI 宿主**里实测命中不了：宿主的 argv[1] 是 `…\@deepseek-ai\dsh-desktop-host\lib\
 * index.js`（用 `Win32_Process.CommandLine` 读到的原话），而真入口是同目录的 `cli.js`（`dsh.cmd`
 * 里写死的那个）。所以桌面默认落到 ③ —— ③ 已按真实形状端到端跑通：`<内置 node> <内置 pnpm.mjs>
 * add github:Aparencia/RoadBook` 在 profile 目录里 20.4s 装出 `roadbook 0.3.0`、exit 0。
 * ② 保留给「插件被 CLI 形态调起」的场景（例如 `dsh … ` 起的进程里 argv[1] 就是 cli/bin）。
 *
 * 全部不可用 ⇒ `available:false`，**拒绝执行**而不是随便挑一条（挑错会把 profile 装坏）。
 *
 * @returns {{ available: boolean, reason: string|null, target: string|null, kind: string,
 *             candidates: Array<object>, skipped: Array<{ label: string, reason: string }> }}
 */
export function candidateInstallers(options = {}) {
  const env = options.env !== null && typeof options.env === 'object' ? options.env : {};
  const platform = typeof options.platform === 'string' ? options.platform : 'win32';
  const execPath = typeof options.execPath === 'string' ? options.execPath : '';
  const execArgv = Array.isArray(options.execArgv) ? options.execArgv : [];
  const argv = Array.isArray(options.argv) ? options.argv : [];
  const config = options.config !== null && typeof options.config === 'object' ? options.config : {};
  const packageName = typeof options.packageName === 'string' && options.packageName !== '' ? options.packageName : DEFAULT_PACKAGE;
  const spec = typeof options.spec === 'string' ? options.spec.trim() : '';
  const profile = typeof options.profile === 'string' ? options.profile : '';
  const profileDir = typeof options.profileDir === 'string' ? options.profileDir : '';
  const exists = typeof options.exists === 'function' ? options.exists : () => false;
  const runtimes = Array.isArray(options.runtimes) ? options.runtimes : [];
  const kind = installKindOf(spec);
  const skipped = [];
  const candidates = [];

  if (spec === '' || kind === 'local' || kind === 'unknown') {
    return { available: false, reason: spec === '' ? 'not-installed' : kind === 'local' ? 'dev-install' : 'unknown-source', target: null, kind, candidates, skipped };
  }
  // git 来源重新解析 HEAD（这正是「更新」的语义）；registry 来源要显式说 @latest，否则原地不动。
  const target = kind === 'git' ? spec : `${packageName}@latest`;
  // `profile` 是行 `--profile <名字>` 用的 profile 名；`profileDir` 是 pnpm 必须落在的那个目录。
  // 两者不混用：混了就会把 pnpm 跑到一个不存在的工作目录里（本机实测过：cwd 变成 'desktop'）。
  const profileCwd = profileDir !== '' ? profileDir : null;

  const explicit = String(config.command ?? '').trim();
  if (explicit !== '') {
    // shell 模板会把 target 原样拼进命令行。target 来自 profile 的 package.json，正常只会是
    // `github:owner/repo` / `pkg@1.2.3`；一旦含 `"`、`&`、`|` 这类字符，模板的引号就被撑破，
    // 后面的东西会被 cmd.exe 当命令执行（实测能落地任意文件）。所以先过 allowlist，不过就
    // 跳过这条候选 —— 宁可少一条路，也不给一条能把命令注入执行的路。
    if (explicit.includes('{target}') && !SHELL_SAFE_TARGET.test(target)) {
      skipped.push({ label: 'config', reason: 'target-unsafe' });
    } else {
      candidates.push({
        label: 'config',
        template: explicit,
        file: explicit,
        args: [],
        shell: true,
        cwd: profileCwd,
        env: {},
        target,
      });
    }
  }

  const entry = typeof argv[1] === 'string' ? argv[1] : '';
  if (entry !== '' && ENTRY_SHAPE.test(entry) && execPath !== '' && exists(entry)) {
    candidates.push({
      label: 'self-entry',
      file: execPath,
      args: [...execArgv, entry, 'plugin', '--profile', profile, 'add', target],
      shell: false,
      cwd: null,
      // 桌面版就是这么调起来的（见 resources/runtime/cli/bin/dsh.cmd）：Electron 当 Node 用。
      env: { ELECTRON_RUN_AS_NODE: '1' },
      target,
    });
  } else {
    skipped.push({ label: 'self-entry', reason: entry === '' || execPath === '' ? 'no-entry' : !ENTRY_SHAPE.test(entry) ? 'entry-shape' : 'entry-missing' });
  }

  for (const runtime of runtimes) {
    if (runtime === null || typeof runtime !== 'object') continue;
    const node = typeof runtime.node === 'string' ? runtime.node : '';
    const pnpm = typeof runtime.pnpm === 'string' ? runtime.pnpm : '';
    const label = `runtime:${typeof runtime.label === 'string' ? runtime.label : 'unknown'}`;
    if (node === '' || pnpm === '' || !exists(node) || !exists(pnpm)) {
      skipped.push({ label, reason: 'runtime-missing' });
      continue;
    }
    if (profileCwd === null) {
      skipped.push({ label, reason: 'no-profile' });
      continue;
    }
    candidates.push({ label, file: node, args: [pnpm, 'add', target], shell: false, cwd: profileCwd, env: {}, target });
  }

  // 查 `dsh` 而不是 `dsh.cmd`：Windows 上 PATHEXT 由下面的后缀表负责（写死扩展名会去试
  // `dsh.cmd.cmd` 这类不存在的名字，也永远找不到 `dsh.exe` 形态的 shim）。
  const dshOnPath = whichInPath('dsh', env, platform, exists);
  if (dshOnPath !== null && platform === 'win32' && !SHELL_SAFE_TARGET.test(target)) {
    // 同 config 那条：Windows 上这条候选是 shell 整行，target 必须先过 allowlist。
    skipped.push({ label: 'path-dsh', reason: 'target-unsafe' });
  } else if (dshOnPath !== null) {
    // Windows 上 PATH 里的是 `dsh.cmd`，而 Node ≥18.20（CVE-2024-27980 之后）拒绝对 .cmd/.bat
    // 用 `shell:false` —— 本机实测：`spawn('x.cmd', [], { shell:false })` 直接 `EINVAL`，
    // `shell:true` 才 exit 0。所以这条候选在 Windows 上必须带 shell；带了 shell 就不能再传
    // args 数组（DEP0190：shell 模式不转义 args），于是给出整行模板，由 `executeApply` 的
    // templated 分支填占位符后按 `shell:true` + 空 args 起进程（与 ② 之外的 dsh-plugin-mgr
    // 做法同源：它也是 win32 用 `dsh.cmd` + `shell:true`）。路径必须带引号：本机实测 DSH
    // 就装在 `D:\AISI\Deepseek harness\…`（含空格）。
    candidates.push(
      platform === 'win32'
        ? {
            label: 'path-dsh',
            template: `"${dshOnPath}" plugin --profile "{profile}" add "{target}"`,
            file: dshOnPath,
            args: [],
            shell: true,
            cwd: null,
            env: {},
            target,
          }
        : {
            label: 'path-dsh',
            file: dshOnPath,
            args: ['plugin', '--profile', profile, 'add', target],
            shell: false,
            cwd: null,
            env: {},
            target,
          },
    );
  } else {
    skipped.push({ label: 'path-dsh', reason: 'not-on-path' });
  }

  return {
    available: candidates.length > 0,
    reason: candidates.length > 0 ? null : 'no-installer',
    target,
    kind,
    candidates,
    skipped,
  };
}

/**
 * 把命令模板里的占位符换掉（`{target}` / `{package}` / `{profile}`）。
 *
 * 返回的是**原样字符串**（引号与空格都不动），由 `shell: true` 的子进程自己解析 ——
 * 早先按空白切分成 argv 再交给 shell，会触发 Node 的 DEP0190（shell + args 不做转义），
 * 而且 `node -e "…"` 这类带引号的命令会被拆坏。只做替换、不解释语法，是这里唯一安全的做法。
 */
export function fillTemplate(template, values = {}) {
  return String(template ?? '').replace(/\{(target|package|profile)\}/gu, (whole, key) => {
    const value = values[key];
    return typeof value === 'string' ? value : whole;
  });
}

// ── 本机请求守卫 ─────────────────────────────────────────────────────────────

/** Host 头（忽略端口）是不是 loopback：`127.0.0.1` / `localhost` / `[::1]`。 */
export function loopbackAuthority(host) {
  if (typeof host !== 'string' || host.trim() === '') return false;
  const lower = host.trim().toLowerCase();
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

/** 取请求头（Node 的平对象 / 标准 Headers 两种形状都认）。 */
function headerOf(request, name) {
  const headers = request?.headers;
  if (headers === null || headers === undefined) return undefined;
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return typeof value === 'string' ? value : undefined;
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * 本机请求守卫（DNS rebinding 防线，语义对齐 dshmarket 的 `sameOrigin`）。
 *
 * 为什么必须有：本插件的 `POST /roadbook/update/apply` 会**执行安装命令**。一个恶意页面可以把
 * `evil.com` 解析到 127.0.0.1，浏览器连到本机时 `Origin` 与 `Host` 都是 `evil.com` —— 只比这两个相等的
 * 守卫看不出来。**Host 是它伪造不了的那个头**，所以只有 Host 缺失（非浏览器客户端 / 桌面代理会剥掉）
 * 或明确是 loopback 时才放行；`Origin` 出现时必须与 Host 同 authority。
 */
export function trustedLocalRequest(request) {
  const host = headerOf(request, 'host');
  if (host !== undefined && !loopbackAuthority(host)) return false;
  if (headerOf(request, 'sec-fetch-site') === 'cross-site') return false;
  const origin = headerOf(request, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 收口错误文本（观测与日志里只留一行、有上限）。 */
export function errorText(error) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return text.slice(0, 200);
}

/** 默认观测文件路径（`<os.tmpdir()>/roadbook-update.jsonl`），与配置里的空串约定一致。 */
export function defaultReportPath() {
  return join(tmpdir(), DEFAULT_REPORT_FILE);
}
