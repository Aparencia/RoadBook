/**
 * lib/update.js —— 更新检查与应用的**公开入口**（barrel）。
 *
 * 2026-10-07：原 1006 行单文件按关注点切成 `lib/update-*.js` 六个模块（D14 第 1 条），
 * 本文件只做再导出 —— 对外名字与切分前逐名一致，调用方（`lib/index.js`、插件、测试）无需改。
 */
export { UPDATE_MODES, DEFAULT_MODE, DEFAULT_INTERVAL_HOURS, DEFAULT_TIMEOUT_MS, DEFAULT_APPLY_TIMEOUT_MS, DEFAULT_REPORT_FILE, DEFAULT_REPORT_MAX_BYTES, DEFAULT_BRANCH, DEFAULT_PACKAGE, REPORT_TAIL_BYTES, STALE_LOCK_MS, DEFAULT_BODY_MAX_BYTES, DEFAULT_MAX_REDIRECTS, SHELL_SAFE_TARGET } from './update-constants.js';
export { parseVersion, compareVersions } from './update-version.js';
export { repoSlug, repoOfManifest, upstreamOf, installKindOf, repoKeyOfSpec, lockCommitOf, commitApiUrlOf, commitOfJson } from './update-repo.js';
export { systemCaCertificates, isCertificateError, httpsGetText, createManifestFetcher, loopbackAuthority, trustedLocalRequest, errorText } from './update-transport.js';
export { decideUpdate, checkForUpdate, normalizeConfig } from './update-plan.js';
export { upgradeOutcome, homeOf, profileDirOf, readProfileSpec, readProfileLock, readRuntimeCommands, whichInPath, candidateInstallers, fillTemplate } from './update-host.js';
export { readFileTail, lastCheckEvent, lastCheckAt, lastApplyTarget, defaultReportPath } from './update-report.js';
