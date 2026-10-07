/**
 * RoadBook 主插件 —— 宿主半（host half），对应 Loader 里的主行 `roadbook`。
 *
 * 这一半做三件事：
 *   1) 对外报告版本号（唯一事实源是根 package.json，代码里不留副本）；
 *   2) 在 apply() 里做一次就绪自检：随包的技能、CLI、渲染器、客户端半是否都在磁盘上。
 *      缺文件要看得见 —— 打一条明确警告，而不是静默降级成「插件装了但什么都不工作」；
 *   3) 2026-10-05 起：自动更新（判定 / 取证 / 执行 / 两条本机路由）。纯逻辑在 ./update.js，
 *      本文件只做接线 —— 与 `roadbook-autoload` 的 trigger.js / index.js 同一条分工口径。
 *
 * 流程正文在 skills/roadbook/，图纸能力在 skills/roadbook-atlas/，
 * 侧边栏「图册」标签页在客户端半 ./client；宿主半不注册工具、不碰用户数据。
 *
 * 2026-10-05：清单改为「显式路径 + 入口模块的静态相对 import 闭包」两段合成。
 * 起因是一次实测事故：`plugin/roadbook-autoload/package.json` 的 files 白名单漏了
 * `host-fallback.js`（入口静态 import 它），装出来的插件在面板上显示「未运行」——
 * 而当时的自检清单是手写的，恰好也漏了同一个文件，于是两个本该互相兜底的机制一起失明。
 * 手写清单还会漂：谁新增一个入口模块，就得记得回来补一行。现在 import 闭包自动覆盖这类文件
 * （`./update.js` 就是这么进自检的，`test/umbrella-contract.test.mjs` 钉住了它）。
 *
 * 2026-10-07：按 D14 第 1 条（单文件 ≤500 行）拆出三个新文件，本文件从此只当接线层与公开入口：
 *   - `./selfcheck.js`：就绪自检的纯逻辑（剥注释 / import 闭包 / 缺件清单）；
 *   - `./update-watch.js`：自动更新的**读侧**（检查 / 冷却 / 状态 / 升级对账）；
 *   - `./update-apply.js`：自动更新的**写侧**（安装命令探测 / 锁 / 子进程）。
 * 对外导出名逐名不变（`test/update.test.mjs`、`test/umbrella-contract.test.mjs`、
 * `test/packaging.test.mjs`、`test/client-contract.test.mjs` 都直接 import 本文件）；
 * 两侧共享件（观测落盘 / 安装形态 / 操作句柄）在这里显式注入，不在函数深处直连闭包。
 */

import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PACKAGE, DEFAULT_REPORT_FILE, createManifestFetcher, errorText, homeOf, normalizeConfig, profileDirOf, readProfileSpec, trustedLocalRequest } from './update.js';
import { createUpdateWatch } from './update-watch.js';
import { createUpdateApply } from './update-apply.js';
import { missingBundledFiles as collectMissingBundledFiles } from './selfcheck.js';

// `stripComments` / `relativeImportClosure` 已搬去 ./selfcheck.js；这里只做再导出 ——
// 外部（测试）仍从本文件取它们，对外名字与切分前逐名一致。
export { relativeImportClosure, stripComments } from './selfcheck.js';

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

/**
 * 宿主入口模块（相对伞包根，一律正斜杠）——它们的静态 import 闭包必须全在。
 * 只列真正的「loader 行入口」：这几条 import 失败 = 面板上那一行显示「未运行」。
 */
export const HOST_ENTRY_MODULES = [
  'lib/index.js',
  'plugin/roadbook-autoload/index.js',
  'plugin/roadbook-atlas/lib/index.js',
  'plugin/roadbook-team/index.js',
  'plugin/roadbook-evolve/index.js',
];

/**
 * 随运行时内容（技能正文路由指向的文件 + 客户端半）。
 *
 * 注意：只列**运行时真正需要**的文件。根 `SKILL.md` 是母版的路由文件，不在 package.json 的
 * `files` 白名单里 ⇒ git / npm 装出来的副本里没有它（运行时要的是 skills/roadbook/SKILL.md 镜像）。
 * 把它列进来会让每一次 git 安装都误报「缺少随包文件」并吞掉 ready 日志。
 *
 * `playbook/`、`playbook_EN/`、`template/` 三个是 2026-10-05 补进来的：注入给模型的
 * skills/roadbook/SKILL.md 第一条就要求读 `playbook_EN/0-1-driver-card.md`，1-2 卡要整套复制
 * `template/` —— 这三个目录当初没进 `files` 白名单（实测：npm 打包 88 项里一个都没有、
 * 本机 github 安装副本里也全缺），于是插件在真实安装形态下只是一张指向空气的路由表。
 */
export const RUNTIME_FILES = [
  'skills/roadbook/SKILL.md',
  'skills/roadbook-atlas/SKILL.md',
  'skills/roadbook-atlas/bin/atlas.mjs',
  'skills/roadbook-atlas/vendor/archify/bin/archify.mjs',
  // 1-2 / 1-3 两卡的施工动作靠它：装出来的副本缺这个文件 = 接入卡第一步就断（agent 只能手搓复制）
  'skills/roadbook/bin/scaffold.mjs',
  'plugin/roadbook-atlas/lib/index.js',
  'lib/client.js',
  // 流程卡与模板：不是「随包」而是「随流程」，缺了等于装了个空壳
  'playbook/0-1-驱动卡.md',
  'playbook_EN/0-1-driver-card.md',
  'template/check.ps1',
  // 硬规则的机器可读索引：rules.mjs --audit 与插件机制（Team 探针 / 动作闸 / 状态校验）读它
  'rules/rules.json',
];

/**
 * 就绪自检：列出缺失的随包文件，空数组 = 一切就位。
 *
 * 纯逻辑在 `./selfcheck.js`（剥注释 / import 闭包）；随包清单是本文件的事实，显式传进去 ——
 * 反过来让 selfcheck 去 import 本文件会成环（D14：依赖显式传入）。对外签名与切分前一致。
 *
 * @param {string} [root] 伞包根，默认本文件所在包的根。
 */
export function missingBundledFiles(root = packageRoot()) {
  return collectMissingBundledFiles(root, RUNTIME_FILES, HOST_ENTRY_MODULES);
}

/** 更新能力的两条本机路由（客户端半按这两个路径取状态 / 发起更新）。 */
export const UPDATE_STATUS_PATH = '/roadbook/update/status';
export const UPDATE_APPLY_PATH = '/roadbook/update/apply';
/** 开机后多久做第一次检查（毫秒）：让启动日志先落地，别跟自检抢时序。 */
const FIRST_CHECK_DELAY_MS = 3000;
/** 安装命令输出的保留上限（尾巴）：只留证据，不留整份 pnpm 日志。 */
const OUTPUT_TAIL_BYTES = 8000;
/** 超时后先 SIGTERM，宽限这么久再动进程树（与 dsh-plugin-mgr 的 SIGTERM_GRACE_MS 同口径）。 */
const SIGTERM_GRACE_MS = 10000;
/** 杀完进程树再等这么久：`close` 还不来就按超时结账，绝不把 applying/锁永久挂着。 */
const FINAL_GRACE_MS = 5000;
/** 观测文件里出现这些字样时，值被替换成 `***`（配置里的命令可能带注册表 token）。 */
const SECRET_HINT = /(token|password|passwd|secret|_auth|apikey|api[_-]?key|bearer)/iu;
/** 落盘前的脱敏：`--token=xxx` / `TOKEN: xxx` 这类「键 + 值」把值抹掉，URL 里的 `user:pass@` 也抹掉。 */
function redactSecrets(text) {
  const value = typeof text === 'string' ? text : '';
  if (value === '' || !SECRET_HINT.test(value)) return value;
  return value
    .replace(
      /((?:token|password|passwd|secret|_auth|apikey|api[_-]?key|bearer)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/giu,
      '$1***',
    )
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/gu, '//***:***@');
}
/** 观测文件的默认路径（`<os.tmpdir()>/roadbook-update.jsonl`）。 */
const DEFAULT_REPORT_PATH = () => join(tmpdir(), DEFAULT_REPORT_FILE);

/**
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 * @param {{ diagrams?: string, update?: 'off'|'notify'|'auto', updateIntervalHours?: number,
 *           updateTimeoutMs?: number, updateUrl?: string, updateCommand?: string,
 *           updateReport?: boolean, updateReportPath?: string, updateReportMaxBytes?: number }} [config]
 *        主行 config（`roadbook` 行），默认 docs/diagrams。
 * @param {{ fetch?: Function, now?: Function, env?: object, platform?: string, execPath?: string,
 *           execArgv?: string[], argv?: string[], packageRoot?: string, spawn?: Function,
 *           schedule?: boolean }} [runtime] 注入点（测试替身用；不传即用真实环境）。
 */
export function apply(ctx, config = {}, runtime = {}) {
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
  // 更新能力排在 ready 之后接线：它坏掉不许影响上面那条自证日志（缺随包文件时连它也不启）。
  try {
    createUpdateService(ctx, config, runtime).start();
  } catch (error) {
    line('warn', `roadbook: 更新能力接线失败（不影响插件本体）：${errorText(error)}`);
  }
}

/**
 * 自动更新的宿主半接线：装配读侧（./update-watch.js）与写侧（./update-apply.js），只做四件事：
 *   ① 解析注入点（runtime 里的替身优先，缺省即真实环境）与本机事实（profile 目录、安装形态）；
 *   ② 持有两侧共用件：观测落盘（脱敏 + 轮转 + 上限）、日志、当前操作句柄；
 *   ③ 注册两条本机路由给客户端半（状态 GET / 应用 POST，变更那条必须过同源守卫）；
 *   ④ 起生命周期：定时检查、卸载时清定时器并把闸放开。
 *
 * 三条不变量（每一条都对应一次真实事故，勿省）：
 *   - **读不到就是 unknown**：绝不把「检查失败」显示成「已是最新」（假绿）。
 *   - **任何一侧失败都不上抛**：更新能力是主行的附加能力，抛出去会把整行插件变成面板上的「未运行」。
 *   - **变更路由必须过同源守卫**：`POST` 会真的执行安装命令，DNS rebinding 页面必须被挡住。
 *
 * @returns {{ start: Function, dispose: Function, check: Function, applyNow: Function, status: Function }}
 */
export function createUpdateService(ctx, config = {}, runtime = {}) {
  const settings = normalizeConfig(config);
  const env = runtime.env !== null && typeof runtime.env === 'object' ? runtime.env : process.env;
  const platform = typeof runtime.platform === 'string' ? runtime.platform : process.platform;
  const execPath = typeof runtime.execPath === 'string' ? runtime.execPath : process.execPath;
  const execArgv = Array.isArray(runtime.execArgv) ? runtime.execArgv : process.execArgv;
  const argv = Array.isArray(runtime.argv) ? runtime.argv : process.argv;
  const spawnImpl = typeof runtime.spawn === 'function' ? runtime.spawn : spawn;
  const fetchImpl = typeof runtime.fetch === 'function' ? runtime.fetch : globalThis.fetch;
  // 清单读取走两级传输：先 fetch，证书类错误再用 `node:https` + 系统 CA 重试一次
  // （本机实测：TLS 拦截的根 CA 只在系统库里，`fetch` 与 `curl.exe` 都验不过，`--use-system-ca` 才通）。
  const manifestFetcher =
    typeof fetchImpl === 'function'
      ? createManifestFetcher({
          fetchImpl,
          timeoutMs: settings.timeoutMs,
          httpsImpl: typeof runtime.httpsGet === 'function' ? runtime.httpsGet : undefined,
        })
      : null;
  const now = typeof runtime.now === 'function' ? runtime.now : Date.now;
  // 两段宽限期可注入：默认值就是生产值，测试用毫秒级的值把「超时 → 杀树 → 兜底结账」这条
  // 路径跑完（真按 10s + 5s 跑，一条用例要 20 秒）。
  const sigtermGraceMs = Number.isFinite(runtime.sigtermGraceMs) ? runtime.sigtermGraceMs : SIGTERM_GRACE_MS;
  const finalGraceMs = Number.isFinite(runtime.finalGraceMs) ? runtime.finalGraceMs : FINAL_GRACE_MS;
  const root = typeof runtime.packageRoot === 'string' ? runtime.packageRoot : packageRoot();
  const schedule = runtime.schedule !== false;

  const reportPath = settings.reportPath !== '' ? settings.reportPath : DEFAULT_REPORT_PATH();
  const profileDir = profileDirOf(env, root);
  const profileName = typeof env.DSH_PROFILE === 'string' ? env.DSH_PROFILE : '';
  const bootVersion = pluginVersion(root);
  const lockDir = profileDir !== '' ? profileDir : tmpdir();
  const lockFile = join(lockDir, '.roadbook-update.lock');
  const home = homeOf(env);

  // 观测落盘的两个半边共用（读侧记检查，写侧记申请 / 超时 / 结账），所以留在接线层：
  // 字节计数是这里的变量，两条模块只拿到 writeReport 这个显式入口（D14：共享状态显式传入）。
  let reportBytes = 0;
  try {
    reportBytes = statSync(reportPath).size;
  } catch {
    reportBytes = 0;
  }

  // ── 观测（旁路：任何失败都只吞自己，绝不打断会话） ──────────────────────────
  /** @returns {boolean} 是否轮转成功（失败时调用方必须放弃这次写入，理由见下）。 */
  const rotateReport = () => {
    let rotated = false;
    try {
      rmSync(`${reportPath}.1`, { force: true });
      renameSync(reportPath, `${reportPath}.1`);
      rotated = true;
    } catch {
      /* 轮转失败只影响体积 */
    }
    if (rotated) {
      reportBytes = 0;
      return true;
    }
    // 轮转失败时**不能**假装文件空了：那样上限形同虚设，文件会一直涨
    // （实测：把 `.1` 做成目录让轮转必失败，300 次写入涨到上限的 25.9 倍）。
    try {
      reportBytes = statSync(reportPath).size;
    } catch {
      /* 读不到就保持原值，下次还会再试 */
    }
    return false;
  };
  const writeReport = (entry) => {
    if (settings.report !== true) return;
    // 观测文件是给排错用的，但 `updateCommand` 是人写的一整行命令，里面可能嵌注册表 token；
    // 安装器输出也可能回显它。落盘前把「值」抹掉（键名留着，免得看不出发生过什么）。
    const safe = { ...entry };
    for (const key of ['command', 'outputTail', 'message']) {
      if (typeof safe[key] === 'string') safe[key] = redactSecrets(safe[key]);
    }
    const line = `${JSON.stringify({ time: new Date(now()).toISOString(), file: reportPath, ...safe })}\n`;
    const bytes = Buffer.byteLength(line, 'utf8');
    if (reportBytes + bytes > settings.reportMaxBytes && rotateReport() !== true) {
      // 轮转不了就放弃这一行：宁可少一条证据，也不让观测文件无限涨到把盘写满。
      return;
    }
    try {
      // mode 只在文件被创建时生效；Windows 上基本是空操作，POSIX 上至少不是 0644。
      appendFileSync(reportPath, line, { encoding: 'utf8', mode: 0o600 });
    } catch {
      return;
    }
    reportBytes += bytes;
  };

  // ── 本机安装形态（读侧与写侧都要用：安装方式决定「更新是什么意思」） ─────────────
  const spec = () => readProfileSpec(profileDir, DEFAULT_PACKAGE);

  // ── 两侧装配（D14 第 1 条：共享件显式传入，不在函数深处直连闭包） ──────────────
  /** 日志是旁路：写不出去也绝不能把更新能力或主行拖垮。 */
  const info = (text) => {
    try {
      ctx?.logger?.info?.(text);
    } catch {
      /* 日志是旁路 */
    }
  };
  // 写侧：安装命令探测 / 锁 / 子进程 —— 会真的改磁盘，单独一个文件。
  const applier = createUpdateApply({
    ctx, settings, now, root, profileName, profileDir, home, env, platform, execPath, execArgv, argv,
    spawnImpl, sigtermGraceMs, finalGraceMs, lockFile, pluginVersion, spec, writeReport, info,
  });
  // 读侧：检查 / 冷却 / 状态载荷 —— 只读 + 落证据；它要的 planOf 与操作句柄都来自写侧。
  const watch = createUpdateWatch({
    ctx, settings, now, root, profileDir, reportPath, bootVersion, manifestFetcher, pluginVersion,
    spec, planOf: applier.planOf, operationOf: () => applier.operation, info, writeReport,
  });
  // 定时器句柄归接线层保管（dispose 要按它们清场）。
  let timers = [];

  // ── 本机路由 ───────────────────────────────────────────────────────────────
  const sendJson = (response, status, payload) => {
    try {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(payload));
    } catch {
      try {
        response.end();
      } catch {
        /* 响应写不出去就到此为止 */
      }
    }
  };
  const methodOf = (request) => String(request?.method ?? 'GET').toUpperCase();
  const forced = (request) => /(?:^|[?&])force=1(?:&|$)/u.test(String(request?.url ?? ''));

  const handleStatus = async (request, response) => {
    if (methodOf(request) !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    if (!trustedLocalRequest(request)) {
      writeReport({ event: 'route', state: 'refused', path: UPDATE_STATUS_PATH });
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    try {
      await watch.check({ force: forced(request) });
    } catch (error) {
      writeReport({ event: 'route', state: 'error', path: UPDATE_STATUS_PATH, message: errorText(error) });
    }
    sendJson(response, 200, watch.status());
  };

  const handleApply = async (request, response) => {
    if (methodOf(request) !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    // 变更请求必须过同源守卫：这条路由会真的执行安装命令。
    if (!trustedLocalRequest(request)) {
      writeReport({ event: 'apply-refused', reason: 'untrusted-origin' });
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    let result;
    try {
      result = await applier.applyNow();
    } catch (error) {
      writeReport({ event: 'apply-refused', reason: 'handler', message: errorText(error) });
      result = { ok: false, status: 500, error: 'handler', message: errorText(error) };
    }
    if (result.ok === true) sendJson(response, 202, { ok: true, operation: applier.operation });
    else sendJson(response, result.status, { ok: false, error: result.error, message: result.message, skipped: result.skipped, agents: result.agents });
  };

  /** 可选服务 `webServer`：读不到只让路由不出现，绝不让整行插件变成「未运行」。 */
  const mount = (host, webServer) => {
    const attach = () => {
      const disposers = [
        // handler 直接返回 promise：DSH 不要求，但测试与调试要能 `await` 到这一轮处理完。
        webServer.register({ kind: 'exact', path: UPDATE_STATUS_PATH, handler: (request, response) => handleStatus(request, response) }),
        webServer.register({ kind: 'exact', path: UPDATE_APPLY_PATH, handler: (request, response) => handleApply(request, response) }),
      ];
      writeReport({ event: 'route', state: 'registered', paths: [UPDATE_STATUS_PATH, UPDATE_APPLY_PATH] });
      return () => {
        for (const dispose of disposers) {
          try {
            if (typeof dispose === 'function') dispose();
          } catch {
            /* 撤销失败不影响启动 */
          }
        }
      };
    };
    if (typeof host?.effect === 'function') host.effect(attach, 'roadbook: update routes');
    else attach();
  };

  const registerRoutes = () => {
    const usable = (value) => value !== null && value !== undefined && typeof value.register === 'function';
    if (typeof ctx?.inject === 'function') {
      let settled = false;
      try {
        ctx.inject(['webServer'], (scope) => {
          settled = true;
          const service = scope?.webServer;
          if (!usable(service)) {
            writeReport({ event: 'route', state: 'unavailable' });
            return;
          }
          try {
            mount(scope, service);
          } catch (error) {
            writeReport({ event: 'route', state: 'error', message: errorText(error) });
          }
        });
      } catch (error) {
        writeReport({ event: 'route', state: 'error', message: errorText(error) });
        return;
      }
      if (!settled) writeReport({ event: 'route', state: 'deferred' });
      return;
    }
    let service;
    try {
      service = typeof ctx?.get === 'function' ? ctx.get('webServer') : undefined;
    } catch (error) {
      writeReport({ event: 'route', state: 'error', message: errorText(error) });
      return;
    }
    if (!usable(service)) {
      writeReport({ event: 'route', state: 'unavailable' });
      return;
    }
    try {
      mount(ctx, service);
    } catch (error) {
      writeReport({ event: 'route', state: 'error', message: errorText(error) });
    }
  };

  // ── 生命周期 ───────────────────────────────────────────────────────────────
  const start = () => {
    writeReport({
      event: 'loaded',
      version: bootVersion,
      mode: settings.mode,
      profile: profileName,
      profileDir,
      reportPath,
    });
    registerRoutes();
    // 定时器交给作用域的 effect 保管：插件卸载时不留下还在跑的 interval（unref 只管进程存活，不管卸载）。
    if (typeof ctx?.effect === 'function') {
      try {
        ctx.effect(() => dispose, 'roadbook: update timers');
      } catch {
        /* 拿不到 effect 就退化成「进程结束即消失」 */
      }
    }
    if (settings.mode === 'off' || schedule !== true) return api;
    const first = setTimeout(() => void watch.check({ force: false }), FIRST_CHECK_DELAY_MS);
    const interval = setInterval(() => void watch.check({ force: false }), Math.max(60000, Math.round(settings.intervalHours * 3600000)));
    // unref：定时器不该让宿主进程活着（Electron 主进程尤其不该被它拖住）。
    if (typeof first.unref === 'function') first.unref();
    if (typeof interval.unref === 'function') interval.unref();
    timers = [first, interval];
    return api;
  };

  const dispose = () => {
    for (const timer of timers) {
      try {
        clearTimeout(timer);
        clearInterval(timer);
      } catch {
        /* 清不掉也无所谓：进程结束即消失 */
      }
    }
    timers = [];
    // 插件被卸载/热替换时把闸放开并释放锁：留着 applying=true 会让下一次加载后的第一次更新直接 409。
    applier.reset();
  };

  const api = {
    start,
    dispose,
    check: watch.check,
    applyNow: applier.applyNow,
    status: watch.status,
    settings,
    reportPath,
    profileDir,
    get operation() {
      return applier.operation;
    },
  };
  return api;
}
