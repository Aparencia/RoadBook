/**
 * lib/update-constants.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { tmpdir } from 'node:os';

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
export const ENTRY_SHAPE = /[\\/](?:bin\.(?:js|ts)|cli\.(?:js|mjs))$/u;

// ── 版本 ─────────────────────────────────────────────────────────────────────
