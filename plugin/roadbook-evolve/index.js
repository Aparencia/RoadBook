/**
 * roadbook-evolve —— 自进化子插件的**宿主半**（Loader 行 id `roadbook-evolve`）。
 *
 * 定位：**只做接线**。判断与解析在 ./signals.js（纯逻辑、可离线单测）；本文件只负责
 *   ① 把四路输入读进来（两份观测 JSONL / git 工作树 / 两个既有 audit CLI 的退出码）；
 *   ② 折算成信号表并缓存；
 *   ③ 注册两条**只读**本机路由给客户端半；
 *   ④ 写观测——其中 `tick` 事件是**本插件还活着的证据**。
 *
 * 三条不变量（每条都对应本仓库的一次真实事故，勿省）：
 *   - **读不到就是 unknown**：文件缺失、git 跑不起来、audit 超时，一律交给 signals.js 判
 *     `unknown`，绝不退化成 `ok`（假绿比不检查更坏）。
 *   - **任何一侧失败都不上抛**：这一行是主行的附加能力，抛出去会把整行变成面板上的「未运行」
 *     （0.4.1：`apply()` 里一句会抛的代码让整个 DSH 打不开）。
 *   - **不复刻既有判据**：S5/S6 只记 `rules.mjs` / `route.mjs` 的退出码，判据仍在它们自己手里
 *     （复刻 = 第二处真相，改一处漏一处）。
 *
 * 本子插件**不单独安装**（与 atlas / team 同口径）：它相对 import 伞包的 `lib/update.js`
 * 复用 `trustedLocalRequest` 与观测文件常量，因此没有独立 `dsh.bundle`。
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEFAULT_REPORT_FILE as UPDATE_REPORT_FILE, errorText, trustedLocalRequest } from '../../lib/update.js';
import { evaluateSignals, tally } from './signals.js';

/** Loader 行 id（profile patch 里用 id 开关本行）。 */
export const name = 'roadbook-evolve';

/**
 * **空数组**是有意的：可选服务一律走作用域注入 `ctx.inject([...])`。
 * 写进 `inject` 会让「服务缺席」被宿主编译期判成整行不可用 —— 面板上显示「未运行」
 * （0.2.1 的 root 因，见 CHANGELOG）。
 */
export const inject = [];

/** 客户端半按这两个路径取状态 / 触发重算（与 lib/client.js 的标签页共用契约）。 */
export const EVOLVE_STATUS_PATH = '/roadbook/evolve/status';
export const EVOLVE_TICK_PATH = '/roadbook/evolve/tick';

/** 与 plugin/roadbook-autoload/index.js 的 DEFAULT_REPORT_FILE 同值（那边是私有常量，这里只能同值）。 */
const AUTOLOAD_REPORT_FILE = 'roadbook-autoload.jsonl';
/** 本插件自己的观测文件名（与另两份「同口径不同文件」）。 */
const DEFAULT_REPORT_FILE = 'roadbook-evolve.jsonl';
const DEFAULT_REPORT_MAX_BYTES = 1048576;
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_AUDIT_TIMEOUT_MS = 30000;
/** 开机后多久算第一次：让启动日志先落地，别跟别的行抢时序。 */
const FIRST_TICK_DELAY_MS = 5000;
/** 被复用的两个 audit CLI（相对仓库根）；**只取退出码**，不解析它们的输出。 */
const AUDIT_SCRIPTS = { rules: 'skills/roadbook/bin/rules.mjs', route: 'skills/roadbook/bin/route.mjs' };

/** 取字符串配置项；空串按「没填」处理。 */
function text(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * 配置归一。`runtime.tmpdir` 可注入，测试不必碰真实临时目录。
 */
export function normalizeConfig(config = {}, runtime = {}) {
  const home = typeof runtime.tmpdir === 'string' ? runtime.tmpdir : tmpdir();
  const hours = Number(config?.intervalHours);
  const maxBytes = Number(config?.reportMaxBytes);
  const auditTimeout = Number(config?.auditTimeoutMs);
  return {
    mode: config?.mode === 'off' ? 'off' : 'on',
    intervalHours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_INTERVAL_HOURS,
    auditTimeoutMs: Number.isFinite(auditTimeout) && auditTimeout > 0 ? auditTimeout : DEFAULT_AUDIT_TIMEOUT_MS,
    reportMaxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_REPORT_MAX_BYTES,
    autoloadReport: text(config?.autoloadReport, join(home, AUTOLOAD_REPORT_FILE)),
    updateReport: text(config?.updateReport, join(home, UPDATE_REPORT_FILE)),
    reportPath: text(config?.reportPath, join(home, DEFAULT_REPORT_FILE)),
    repoRoot: text(config?.repoRoot, ''),
  };
}

/**
 * 找仓库根：向上找带 `skills/roadbook/bin/rules.mjs` 的目录。
 *
 * 为什么不默认用 cwd：宿主进程的 cwd 往往是 DSH 的安装目录，不是用户的项目。
 * 找不到**不是错误** —— 生成出来的项目本来就没有 `skills/`，此时 S5/S6 判 `unknown` 才对
 * （「judge 不了」和「一切正常」必须分开）。
 */
export function findRepoRoot(start, depth = 12) {
  let dir = typeof start === 'string' && start !== '' ? start : process.cwd();
  for (let i = 0; i < depth; i += 1) {
    if (existsSync(join(dir, 'skills', 'roadbook', 'bin', 'rules.mjs'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
}

/** 读一个文本文件；读不到返回 `{ error }`（调用方会把它变成 unknown，而不是空读数）。 */
export function readTextFile(path, readImpl = (p) => readFileSync(p, 'utf8')) {
  try {
    return { text: readImpl(path) };
  } catch (error) {
    return { error: errorText(error) };
  }
}

/** 捕获上限：我们只关心「有没有」与行数量级，不需要把几千行 git 输出读进内存。 */
const MAX_CAPTURE_BYTES = 262144;

/**
 * 跑一条命令。默认**只取退出码**（stdout 一律 ignore，省内存也不与宿主抢管道）；
 * `capture: true` 时才接 stdout（工作树行数需要它）。
 *
 * 超时按 D14 第 4 条显式处理：先 kill，再报 `timeout` —— 不许把这次 tick 永久挂住。
 */
function runCommand(spawnImpl, execPath, args, options) {
  const capture = options.capture === true;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(execPath, args, {
        cwd: options.cwd,
        windowsHide: true,
        stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'ignore',
      });
    } catch (error) {
      resolve({ error: errorText(error) });
      return;
    }
    let settled = false;
    let stdout = '';
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* 杀不掉也按超时结账 */
      }
      finish({ error: 'timeout' });
    }, options.timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    if (capture && child.stdout !== null && typeof child.stdout?.on === 'function') {
      child.stdout.on('data', (chunk) => {
        if (stdout.length < MAX_CAPTURE_BYTES) stdout += String(chunk);
      });
    }
    child.on('error', (error) => finish({ error: errorText(error) }));
    child.on('close', (code) => finish({ code: typeof code === 'number' ? code : -1, stdout }));
  });
}

/** 一次 tick 的完整实现；副作用全部通过 runtime 注入，便于离线跑通接线。 */
export function createEvolveService(ctx, config = {}, runtime = {}) {
  const settings = normalizeConfig(config, runtime);
  const spawnImpl = typeof runtime.spawn === 'function' ? runtime.spawn : spawn;
  const readImpl = typeof runtime.readFile === 'function' ? runtime.readFile : (p) => readFileSync(p, 'utf8');
  const now = typeof runtime.now === 'function' ? runtime.now : Date.now;
  const execPath = typeof runtime.execPath === 'string' ? runtime.execPath : process.execPath;
  const repoRoot = settings.repoRoot !== '' ? settings.repoRoot : findRepoRoot(typeof runtime.cwd === 'string' ? runtime.cwd : process.cwd());

  const state = { result: null, ticking: null, timers: [], reportBytes: 0, announced: false };
  try {
    state.reportBytes = statSync(settings.reportPath).size;
  } catch {
    state.reportBytes = 0;
  }

  const line = (level, msg) => {
    try {
      ctx?.logger?.[level]?.(msg);
    } catch {
      /* 日志是旁路 */
    }
  };

  /** 轮转失败就把这一行放弃（沿用 update 环的口径：轮转不了不许把上限变成摆设）。 */
  const writeReport = (entry) => {
    const payload = JSON.stringify({ time: new Date(now()).toISOString(), file: settings.reportPath, ...entry });
    const bytes = Buffer.byteLength(`${payload}\n`, 'utf8');
    if (state.reportBytes + bytes > settings.reportMaxBytes) {
      try {
        rmSync(`${settings.reportPath}.1`, { force: true });
        renameSync(settings.reportPath, `${settings.reportPath}.1`);
        state.reportBytes = 0;
      } catch {
        return;
      }
    }
    try {
      appendFileSync(settings.reportPath, `${payload}\n`, 'utf8');
    } catch {
      return;
    }
    state.reportBytes += bytes;
  };

  const readEvolveRecords = () => {
    const read = readTextFile(settings.reportPath, readImpl);
    if (read.error !== undefined) return [];
    // 只回读尾部：这份文件只用来判「上次 tick 是什么时候」，读全量是浪费 I/O。
    const lines = read.text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const tail = lines.slice(-200);
    const records = [];
    for (const l of tail) {
      try {
        records.push(JSON.parse(l));
      } catch {
        /* 半行写入是常态：坏行跳过，不因为一行坏掉就判「没 tick 过」 */
      }
    }
    return records;
  };

  const readGit = async () => {
    if (repoRoot === '') return { error: 'no-roadbook-root' };
    const result = await runCommand(spawnImpl, 'git', ['status', '--porcelain'], {
      cwd: repoRoot,
      timeoutMs: settings.auditTimeoutMs,
      capture: true,
    });
    if (result.error !== undefined) return { error: result.error };
    // 退出码非 0 = 不是 git 仓库 / git 缺失：判 unknown，不许显示成「树干净」。
    if (result.code !== 0) return { error: `git exit ${result.code}` };
    // 必须**数 stdout 的行**才算得出来脏不脏。早先这里只取退出码却写死 0，等于 S4 永远
    // 显示「工作树干净」——那是本仓库定义的那类假绿，故此处刻意接管道（capture）。
    // 截断只会少算行数，不会把「脏」翻成「干净」（判据是 > 0），故安全。
    const porcelainLines = result.stdout.split(/\r?\n/).filter((l) => l.trim() !== '').length;
    return { porcelainLines };
  };

  const runAudits = async () => {
    if (repoRoot === '') return { rules: { error: 'no-roadbook-root' }, route: { error: 'no-roadbook-root' } };
    const out = {};
    for (const [key, relative] of Object.entries(AUDIT_SCRIPTS)) {
      const script = join(repoRoot, relative);
      if (!existsSync(script)) {
        out[key] = { error: 'script-missing' };
        continue;
      }
      out[key] = await runCommand(spawnImpl, execPath, [script, '--audit'], {
        cwd: repoRoot,
        timeoutMs: settings.auditTimeoutMs,
      });
    }
    return out;
  };

  /**
   * 算一次。四路输入**各自独立取**：任何一路失败都只是那几条信号变 unknown，
   * 不许因为 git 不在就把观测读数也一起丢掉。
   */
  const tick = async () => {
    if (state.ticking !== null) return state.ticking;
    state.ticking = (async () => {
      const input = {
        autoload: readTextFile(settings.autoloadReport, readImpl),
        update: readTextFile(settings.updateReport, readImpl),
        audits: await runAudits(),
        evolve: readEvolveRecords(),
        now: now(),
      };
      input.git = await readGit();
      const result = evaluateSignals(input);
      const counts = tally(result.signals);
      state.result = { ...result, tally: counts, repoRoot, reportPath: settings.reportPath };
      writeReport({
        event: 'tick',
        tally: counts,
        verdicts: result.signals.map((s) => `${s.id}:${s.verdict}`).join(' '),
        liveness: result.liveness.verdict,
      });
      if (!state.announced) {
        state.announced = true;
        line('info', `[roadbook-evolve] 信号表：hit=${counts.hit} ok=${counts.ok} unknown=${counts.unknown}`);
      }
      return state.result;
    })();
    try {
      return await state.ticking;
    } finally {
      state.ticking = null;
    }
  };

  /** 状态载荷：没有算过就现算一次（客户端半不该看到「空表」）。 */
  const status = async () => {
    if (state.result !== null) return { ok: true, ...state.result };
    return { ok: true, ...(await tick()) };
  };

  const sendJson = (response, statusCode, payload) => {
    try {
      response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(payload));
    } catch {
      try {
        response.end();
      } catch {
        /* 响应写不出去就到此为止 */
      }
    }
  };

  const handleStatus = async (request, response) => {
    if (String(request?.method ?? 'GET').toUpperCase() !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    if (!trustedLocalRequest(request)) {
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    try {
      sendJson(response, 200, await status());
    } catch (error) {
      sendJson(response, 500, { ok: false, error: 'handler', message: errorText(error) });
    }
  };

  const handleTick = async (request, response) => {
    if (String(request?.method ?? 'GET').toUpperCase() !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    // 这条路由会起子进程（两个 audit），所以同样过同源守卫。
    if (!trustedLocalRequest(request)) {
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    state.result = null;
    try {
      sendJson(response, 200, await status());
    } catch (error) {
      sendJson(response, 500, { ok: false, error: 'handler', message: errorText(error) });
    }
  };

  /** 可选服务 `webServer`：读不到只让路由不出现，绝不让整行插件变「未运行」。 */
  const registerRoutes = () => {
    const usable = (value) => value !== null && value !== undefined && typeof value.register === 'function';
    const mount = (host, webServer) => {
      const attach = () => {
        const disposers = [
          webServer.register({ kind: 'exact', path: EVOLVE_STATUS_PATH, handler: (req, res) => handleStatus(req, res) }),
          webServer.register({ kind: 'exact', path: EVOLVE_TICK_PATH, handler: (req, res) => handleTick(req, res) }),
        ];
        writeReport({ event: 'route', state: 'registered', paths: [EVOLVE_STATUS_PATH, EVOLVE_TICK_PATH] });
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
      if (typeof host?.effect === 'function') host.effect(attach, 'roadbook: evolve routes');
      else attach();
    };
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
    if (!usable(service)) writeReport({ event: 'route', state: 'unavailable' });
    else mount(ctx, service);
  };

  const start = () => {
    writeReport({ event: 'loaded', repoRoot, reportPath: settings.reportPath, mode: settings.mode });
    registerRoutes();
    // 定时器交给作用域的 effect 保管：插件卸载时不留还在跑的 interval（unref 只管进程存活）。
    if (typeof ctx?.effect === 'function') {
      try {
        ctx.effect(() => dispose, 'roadbook: evolve timers');
      } catch {
        /* 拿不到 effect 就退化成「进程结束即消失」 */
      }
    }
    if (settings.mode === 'off') return api;
    const first = setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
    const interval = setInterval(() => void tick(), Math.max(60000, Math.round(settings.intervalHours * 3600000)));
    if (typeof first.unref === 'function') first.unref();
    if (typeof interval.unref === 'function') interval.unref();
    state.timers = [first, interval];
    return api;
  };

  const dispose = () => {
    for (const timer of state.timers) {
      try {
        clearTimeout(timer);
        clearInterval(timer);
      } catch {
        /* 清不掉也无所谓：进程结束即消失 */
      }
    }
    state.timers = [];
  };

  const api = { start, dispose, tick, status, settings, repoRoot, get result() { return state.result; } };
  return api;
}

/**
 * Loader 入口。**整段包 try/catch**：激活路径上任何一句抛出去，都可能让宿主把这一行记成
 * failed —— 客户端半那次的代价是整个应用打不开（0.4.1），宿主半同样不许赌。
 */
export function apply(ctx, config = {}, runtime = {}) {
  const line = (level, msg) => {
    try {
      ctx?.logger?.[level]?.(msg);
    } catch {
      /* 日志是旁路 */
    }
  };
  try {
    const service = createEvolveService(ctx, config, runtime);
    line('info', `roadbook-evolve: ready（信号 S1–S6，仓库根 ${service.repoRoot === '' ? '未找到（S5/S6 将判 unknown）' : service.repoRoot}）`);
    return service.start();
  } catch (error) {
    line('warn', `roadbook-evolve: 接线失败（不影响插件本体）：${errorText(error)}`);
    return { start: () => {}, dispose: () => {}, tick: async () => null, status: async () => ({ ok: false, error: 'not-started' }) };
  }
}
