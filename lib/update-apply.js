/**
 * lib/update-apply.js —— 自动更新的**写侧**：安装命令探测 / 单飞锁 / 子进程执行。
 *
 * 2026-10-07：从 `lib/index.js` 那个 735 行的 `createUpdateService` 里切出来的一半
 * （另一半是读侧 `./update-watch.js`）。切分动因是 D14 第 1 条「单文件 ≤500 行」；
 * 「怎么装」的阶梯仍在 `./update-host.js` 的 `candidateInstallers`，这里只跑已探明的候选。
 *
 * 为什么单独一个文件：这一半会**真的改磁盘**（替换 node_modules 里的插件文件），
 * 与只读的那一半分开，读侧才能在没有写权限的场合照常工作（纯逻辑与副作用分文件）。
 *
 * 两条不变量（每条对应一次真实事故，勿省）：
 *   - **任何失败都不上抛**：更新是主行的附加能力，抛出去会让整行插件在面板上变成「未运行」；
 *   - **进程树收不掉也必须结账**：超时 → SIGTERM → 宽限 → 杀进程树 → 再宽限兜底结账，
 *     绝不把 applying 与锁永久挂着（挂住 = 之后每一次更新都 409，只有重启宿主才能恢复）。
 *
 * 共享件全部由接线层注入（D14 第 1 条）：`writeReport`（观测落盘）、`info`（日志）、
 * `spec`（本机安装形态）、两个宽限期与 `lockFile`（路径口径归接线层）。
 */
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { DEFAULT_PACKAGE, STALE_LOCK_MS, candidateInstallers, errorText, fillTemplate, readRuntimeCommands } from './update.js';

/** 安装命令输出的保留上限（尾巴）：只留证据，不留整份 pnpm 日志。 */
const OUTPUT_TAIL_BYTES = 8000;

/**
 * 建写侧。
 *
 * @param {{ ctx: object, settings: object, now: Function, root: string, profileName: string,
 *           profileDir: string, home: string, env: object, platform: string, execPath: string,
 *           execArgv: string[], argv: string[], spawnImpl: Function, sigtermGraceMs: number,
 *           finalGraceMs: number, lockFile: string, pluginVersion: Function, spec: Function,
 *           writeReport: Function, info: Function }} deps 全部显式传入（见文件头）
 * @returns {{ planOf: Function, applyNow: Function, reset: Function, operation: object|null }}
 */
export function createUpdateApply(deps) {
  const { ctx, settings, now, root, profileName, profileDir, home, env, platform, execPath, execArgv, argv, spawnImpl, sigtermGraceMs, finalGraceMs, lockFile, pluginVersion, spec, writeReport, info } = deps;

  /** 写侧自己的闭包变量：当前操作、闸、闸的起始时刻、本机自带运行时（读一次就缓存）。 */
  const state = { operation: null, applying: false, applyingSince: null, runtimes: null };
  // 锁的所有者标记：只删自己的锁（见 releaseLock 的注释）。
  const lockOwner = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  // ── 安装命令探测 ───────────────────────────────────────────────────────────
  const runtimeCommands = () => {
    if (state.runtimes === null) state.runtimes = readRuntimeCommands(home, platform);
    return state.runtimes;
  };
  const exists = (file) => {
    try {
      // 必须是**文件**：只判存在的话，PATH 里一个同名的目录会被当成可用命令（实测会盖掉真正的 dsh.cmd）。
      return statSync(file).isFile();
    } catch {
      return false;
    }
  };
  const planOf = (value = spec()) =>
    candidateInstallers({
      env,
      platform,
      execPath,
      execArgv,
      argv,
      config: { command: settings.command },
      packageName: DEFAULT_PACKAGE,
      spec: value ?? '',
      profile: profileName,
      profileDir,
      exists,
      runtimes: runtimeCommands(),
    });

  // ── 执行安装 ───────────────────────────────────────────────────────────────
  /** 运行中的 agent id：替换运行中的 node_modules 会让新旧文件在同一次输出里混用（判据同 dshmarket）。 */
  const runningAgentIds = () => {
    let service = null;
    try {
      service = typeof ctx?.get === 'function' ? ctx.get('agents') : undefined;
    } catch {
      service = undefined;
    }
    if (service === null || service === undefined || typeof service.list !== 'function') return [];
    let listed;
    try {
      listed = service.list();
    } catch {
      return [];
    }
    if (!Array.isArray(listed)) return [];
    const ids = [];
    for (const agent of listed) {
      if (agent === null || typeof agent !== 'object' || agent.status !== 'running') continue;
      const id = typeof agent.id === 'string' && agent.id !== '' ? agent.id : 'agent';
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const acquireLock = () => {
    // 陈旧阈值必须比「最长一次安装」更宽，否则一个合法但很慢的安装（applyTimeoutMs 可配到 60 分钟）
    // 会被后来者按 30 分钟的标准接管掉。
    const staleMs = Math.max(STALE_LOCK_MS, settings.applyTimeoutMs + sigtermGraceMs + finalGraceMs + 60000);
    let snapshot = null;
    try {
      snapshot = JSON.parse(readFileSync(lockFile, 'utf8'));
    } catch {
      snapshot = null; // 文件不存在或内容坏了都当作「没有锁」——陈旧锁必须能自愈
    }
    const at = Number(snapshot?.at);
    if (Number.isFinite(at)) {
      const age = now() - at;
      if (age < staleMs) {
        return {
          ok: false,
          error: 'locked',
          message: `上一次更新（pid ${snapshot?.pid ?? '?'}，${new Date(at).toISOString()}）还没结束或被中断；等它结束，或删除 ${lockFile} 后重试`,
        };
      }
      writeReport({ event: 'skip', reason: 'stale-lock', ageMs: age, pid: snapshot?.pid ?? null });
    }
    try {
      writeFileSync(lockFile, JSON.stringify({ pid: process.pid, owner: lockOwner, at: now(), label: 'roadbook-update' }), 'utf8');
    } catch (error) {
      return { ok: false, error: 'lock-failed', message: `无法创建锁文件 ${lockFile}：${errorText(error)}` };
    }
    return { ok: true, error: null, message: '' };
  };
  const releaseLock = () => {
    // 只删自己的锁：不做所有权校验时，一个从没拿到锁的实例（或一个被接管后才结束的旧实例）
    // 会把别人正在用的锁删掉，于是「单飞」等于没有。
    let owner = null;
    try {
      owner = JSON.parse(readFileSync(lockFile, 'utf8'))?.owner ?? null;
    } catch {
      return; // 读不到就当它已经不在了
    }
    if (owner !== lockOwner) return;
    try {
      rmSync(lockFile, { force: true });
    } catch {
      /* 释放失败只影响下一次，不影响本次结果 */
    }
  };

  /** 展示用的命令行（含引号还原）：写进观测与界面，排错时一眼看得出到底跑了什么。 */
  const describeCommand = (file, args) =>
    [file, ...(Array.isArray(args) ? args : [])]
      .filter((part) => part !== undefined && part !== null && part !== '')
      .map((part) => (/\s/u.test(String(part)) ? `"${part}"` : String(part)))
      .join(' ');

  const executeApply = (candidate) => {
    const templated = typeof candidate.template === 'string' && candidate.template !== '';
    // 模板命令整行交给 shell（保持引号原样）；其余候选是 argv 形式、shell: false。
    const file = templated ? fillTemplate(candidate.template, { target: candidate.target ?? '', package: DEFAULT_PACKAGE, profile: profileName }) : candidate.file;
    const args = templated ? [] : candidate.args;
    const shell = templated ? true : candidate.shell === true;
    const operation = {
      id: `apply-${now().toString(36)}`,
      state: 'running',
      label: candidate.label,
      // 模板命令整行就是命令行（别再过一遍引号还原，那会显示成「"node --version"」这种四不像）
      command: templated ? file : describeCommand(file, args),
      startedAt: new Date(now()).toISOString(),
      finishedAt: null,
      before: pluginVersion(root),
      after: null,
      exitCode: null,
      timedOut: false,
      outputTail: '',
      error: '',
    };
    state.operation = operation;
    state.applying = true;
    state.applyingSince = now();
    writeReport({ event: 'apply-start', label: candidate.label, target: candidate.target, command: operation.command, profile: profileName });

    let settled = false;
    let timedOut = false;
    let output = '';
    const settle = (code, patch = {}) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (grace !== null) clearTimeout(grace);
      if (final !== null) clearTimeout(final);
      state.applying = false;
      state.applyingSince = null;
      releaseLock();
      operation.state = code === 0 && patch.failed !== true ? 'succeeded' : 'failed';
      operation.finishedAt = new Date(now()).toISOString();
      operation.exitCode = code;
      operation.outputTail = String(patch.output ?? output).slice(-OUTPUT_TAIL_BYTES);
      operation.timedOut = patch.timedOut === true;
      operation.error = patch.error ?? '';
      operation.after = pluginVersion(root);
      writeReport({
        event: 'apply-finish',
        label: candidate.label,
        command: operation.command,
        exitCode: code,
        timedOut: operation.timedOut,
        before: operation.before,
        after: operation.after,
        error: operation.error,
        outputTail: operation.outputTail,
      });
      info(
        `[roadbook] 更新${operation.state === 'succeeded' ? '完成' : '失败'}（${candidate.label}，exit ${code}）：` +
          `${operation.before} → ${operation.after}${operation.state === 'succeeded' ? '；重启 DSH 后生效' : `；${operation.error || '输出尾巴见观测文件'}`}`,
      );
    };

    let child = null;
    let timer = null;
    let grace = null;
    let final = null;
    try {
      child = spawnImpl(file, args, {
        cwd: candidate.cwd === null || candidate.cwd === undefined ? undefined : candidate.cwd,
        shell,
        env: { ...process.env, ...(candidate.env ?? {}), CI: 'true' },
        windowsHide: true,
      });
    } catch (error) {
      settle(-1, { output: errorText(error), error: errorText(error) });
      return operation;
    }
    if (child === null || typeof child !== 'object') {
      settle(-1, { error: 'spawn 未返回子进程' });
      return operation;
    }
    const capture = (chunk) => {
      output = `${output}${String(chunk)}`.slice(-OUTPUT_TAIL_BYTES);
    };
    try {
      child.stdout?.on?.('data', capture);
      child.stderr?.on?.('data', capture);
    } catch {
      /* 拿不到输出也要能把命令跑完 */
    }
    // Windows 上 `child.kill()` 只终结直接子进程。带 shell 的候选（模板命令、`dsh.cmd`）的直接
    // 子进程是 `cmd.exe`，真正的安装器是它的孙进程 —— 只杀 cmd.exe 的话安装器会继续改
    // node_modules，而且它握着继承来的 stdout 管道，`close` 事件永远不会来。实测：SIGTERM 后 8s、
    // SIGKILL 后 3s，安装器与孙进程都还活着、`apply-finish` 一条都没写、锁还在。
    const killTree = () => {
      const pid = typeof child.pid === 'number' && child.pid > 0 ? child.pid : null;
      if (platform === 'win32' && pid !== null) {
        try {
          const killer = spawnImpl('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer?.on?.('error', () => {});
          return;
        } catch {
          /* taskkill 起不来就退回普通 kill，至少把直接子进程收掉 */
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已经退出的进程 kill 会抛，忽略 */
      }
    };
    timer = setTimeout(() => {
      timedOut = true;
      writeReport({ event: 'apply-timeout', label: candidate.label, timeoutMs: settings.applyTimeoutMs, pid: child.pid ?? null });
      try {
        child.kill('SIGTERM');
      } catch {
        /* 已经退出的进程 kill 会抛，忽略 */
      }
      grace = setTimeout(() => {
        killTree();
        // 兜底：杀掉进程树之后 `close` 仍可能永远不来（管道被别的东西握着，或 taskkill 也没收掉）。
        // 不能把 `state.applying` 与锁永久挂在「等 close」上 —— 那会让之后的每一次更新都 409，
        // 而且只有重启宿主才能恢复。到点就按超时结账，把真相（timedOut + 尾部输出）写下来。
        final = setTimeout(() => {
          settle(-1, { output, timedOut: true, error: `超时 ${settings.applyTimeoutMs}ms 后进程树未在宽限期内退出` });
        }, finalGraceMs);
        if (typeof final.unref === 'function') final.unref();
      }, sigtermGraceMs);
      if (typeof grace.unref === 'function') grace.unref();
    }, settings.applyTimeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      child.on?.('error', (error) => settle(-1, { output: `${output}\n${errorText(error)}`.trim(), error: errorText(error) }));
      child.on?.('close', (code) => settle(typeof code === 'number' ? code : -1, { output, timedOut }));
    } catch (error) {
      settle(-1, { output, error: errorText(error) });
    }
    return operation;
  };

  const runApply = async () => {
    if (settings.mode === 'off') {
      writeReport({ event: 'apply-refused', reason: 'mode-off' });
      return { ok: false, status: 403, error: 'mode-off', message: '更新能力已关闭（把主行配置的 update 改回 notify 或 auto）' };
    }
    if (state.applying) {
      // 看门狗没跑成（进程被冻住一类）时也必须能自愈：超过「超时 + 两段宽限」还挂在 applying，
      // 就按陈旧处理并放行，否则之后每一次更新都会 409，只有重启宿主才能恢复。
      const budget = settings.applyTimeoutMs + sigtermGraceMs + finalGraceMs;
      const since = state.applyingSince;
      if (typeof since === 'number' && now() - since > budget) {
        writeReport({ event: 'skip', reason: 'stale-applying', elapsedMs: now() - since });
        state.applying = false;
        state.applyingSince = null;
        releaseLock();
      } else {
        return { ok: false, status: 409, error: 'busy', message: '已有一次更新在进行，等它结束' };
      }
    }
    const value = spec();
    const plan = planOf(value);
    if (plan.available !== true) {
      writeReport({ event: 'apply-refused', reason: plan.reason ?? 'no-installer', spec: value, skipped: plan.skipped });
      return {
        ok: false,
        status: 424,
        error: plan.reason ?? 'no-installer',
        message:
          plan.reason === 'dev-install'
            ? '本条是 link:/file: 开发安装：更新随代码走，不在这里替换'
            : '找不到可用的安装命令（探测过的候选见 skipped）',
        skipped: plan.skipped,
      };
    }
    const busy = runningAgentIds();
    if (busy.length > 0) {
      writeReport({ event: 'apply-refused', reason: 'agents-busy', agents: busy });
      return {
        ok: false,
        status: 409,
        error: 'agents-busy',
        message: `有 agent 正在运行（${busy.join(', ')}）。更新会替换插件文件，运行中的 agent 可能读到新旧混合的文件；等它结束再更新`,
        agents: busy,
      };
    }
    const lock = acquireLock();
    if (lock.ok !== true) {
      writeReport({ event: 'apply-refused', reason: lock.error, message: lock.message });
      return { ok: false, status: 409, error: lock.error, message: lock.message };
    }
    const operation = executeApply(plan.candidates[0]);
    return { ok: true, status: 202, operation };
  };

  /**
   * 放开闸并释放锁（插件卸载 / 热替换时调）。
   *
   * 留着 `applying = true` 会让下一次加载后的第一次更新直接 409，所以卸载路径也必须清干净。
   */
  const reset = () => {
    state.applying = false;
    state.applyingSince = null;
    releaseLock();
  };

  return {
    planOf,
    applyNow: runApply,
    reset,
    get operation() {
      return state.operation;
    },
  };
}
