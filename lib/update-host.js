/**
 * lib/update-host.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { DEFAULT_PACKAGE, SHELL_SAFE_TARGET, ENTRY_SHAPE } from './update-constants.js';
import { compareVersions, readableVersion } from './update-version.js';
import { installKindOf } from './update-repo.js';

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
export function envValue(env, key) {
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
