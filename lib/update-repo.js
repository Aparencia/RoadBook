/**
 * lib/update-repo.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { DEFAULT_BRANCH } from './update-constants.js';
import { decideUpdate } from './update-plan.js';
import { candidateInstallers } from './update-host.js';

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
