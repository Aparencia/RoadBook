/**
 * 自动更新（`lib/update.js` + 主行的 `createUpdateService`）的离线单测。
 *
 * 这些断言钉住的都是**只能靠真机肉眼验**的口径，所以必须先在 Node 里钉死：
 *   1) 判定是五态而不是真假两值 —— 「读不到」绝不许退化成「已是最新」（假绿）；
 *   2) 上游身份从本包 manifest 推导，不硬编码仓库名；
 *   3) 安装命令探测是**有证据的阶梯**（每条候选都要说清为什么被跳过），全不可用就拒绝执行；
 *   4) 变更路由必须过同源守卫 —— 它会真的执行安装命令；
 *   5) 观测/日志/路由任何一侧坏掉都不上抛（主行不能因此变成面板上的「未运行」）。
 *
 * 一律不打真网络、不跑真命令：`fetch` 与 `spawn` 都是注入的替身。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateInstallers,
  checkForUpdate,
  compareVersions,
  createManifestFetcher,
  decideUpdate,
  fillTemplate,
  installKindOf,
  isCertificateError,
  lastCheckAt,
  lastCheckEvent,
  lockCommitOf,
  loopbackAuthority,
  normalizeConfig,
  parseVersion,
  repoKeyOfSpec,
  repoOfManifest,
  repoSlug,
  systemCaCertificates,
  trustedLocalRequest,
  upstreamOf,
  whichInPath,
} from '../lib/update.js';
import { UPDATE_APPLY_PATH, UPDATE_STATUS_PATH, apply, createUpdateService, pluginVersion } from '../lib/index.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const COMMIT = '6cf04f7f655e9418717edfeba32d5992b4d81a23';

/** 建一个临时目录，跑完删掉。 */
function box(t) {
  const dir = mkdtempSync(join(tmpdir(), 'roadbook-update-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 造一个「像 profile」的目录：package.json 的依赖 + pnpm-lock.yaml 的 git 解析。 */
function profileBox(t, { spec = 'github:Aparencia/RoadBook', commit = COMMIT } = {}) {
  const dir = box(t);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-x', dependencies: { roadbook: spec } }), 'utf8');
  writeFileSync(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\n\npackages:\n\n  roadbook@git+ssh://git@github.com/Aparencia/RoadBook.git#${commit}:\n    resolution: {commit: ${commit}, repo: git@github.com:Aparencia/RoadBook.git, type: git}\n`, 'utf8');
  return dir;
}

/** 假 ctx：logger 收日志、webServer 收路由、get('agents') 给 agent 清单。 */
function fakeCtx() {
  const logs = [];
  const routes = new Map();
  const ctx = {
    logger: {
      info: (text) => logs.push({ level: 'info', text }),
      warn: (text) => logs.push({ level: 'warn', text }),
    },
    __agents: { list: () => [] },
    get(name) {
      return name === 'agents' ? ctx.__agents : undefined;
    },
    inject(names, callback) {
      if (names.includes('webServer')) {
        callback({
          webServer: {
            register(route) {
              routes.set(route.path, route.handler);
              return () => routes.delete(route.path);
            },
          },
          effect: (factory) => factory(),
        });
      }
    },
    effect: (factory) => factory(),
  };
  return { ctx, logs, routes };
}

/** 假响应：记录状态码与 JSON 正文。 */
function fakeResponse() {
  const out = { status: 0, headers: null, body: '' };
  return {
    out,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
    },
    end(body) {
      if (body !== undefined) out.body = String(body);
    },
  };
}

/** 一次成功的清单响应。 */
function manifestResponse(version) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ name: 'roadbook', version }) };
}

/** 一个会在下一 tick 退出的假子进程。 */
function fakeChild({ code = 0, output = 'done\n' } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  setTimeout(() => {
    child.stdout.emit('data', output);
    child.emit('close', code);
  }, 0);
  return child;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

// ── 版本 ─────────────────────────────────────────────────────────────────────

test('版本解析与比较：不等长按 0 补齐、预发布低于同号正式版、读不懂回 null', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { nums: [1, 2, 3], pre: null });
  assert.deepEqual(parseVersion(' 1.2.3-rc.2 '), { nums: [1, 2, 3], pre: 'rc.2' });
  assert.deepEqual(parseVersion('1.2.3+build.5'), { nums: [1, 2, 3], pre: null });
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion('nope'), null);
  assert.equal(parseVersion(null), null);

  assert.equal(compareVersions('0.3.0', '0.2.3'), 1);
  assert.equal(compareVersions('0.3', '0.3.0'), 0, '不等长按 0 补齐');
  assert.equal(compareVersions('0.2.3', '0.2.3-rc.1'), 1, '正式版 > 预发布');
  assert.equal(compareVersions('0.2.3-rc.1', '0.2.3-rc.2'), -1);
  assert.equal(compareVersions('junk', '0.2.3'), null, '读不懂必须是 null（判不了），不是 0');
});

// ── 上游身份 ─────────────────────────────────────────────────────────────────

test('上游身份从本包 manifest 推导：四种 GitHub 写法都认，非 GitHub 与空 repository 都是 null', () => {
  assert.equal(repoSlug('git+https://github.com/Aparencia/RoadBook.git'), 'Aparencia/RoadBook');
  assert.equal(repoSlug('https://github.com/Aparencia/RoadBook'), 'Aparencia/RoadBook');
  assert.equal(repoSlug('git@github.com:Aparencia/RoadBook.git'), 'Aparencia/RoadBook');
  assert.equal(repoSlug('github:Aparencia/RoadBook'), 'Aparencia/RoadBook');
  assert.equal(repoSlug('https://gitlab.com/a/b.git'), null, '别的托管站不认（不猜 raw 地址）');
  assert.equal(repoOfManifest({ repository: 'https://github.com/a/b' }), 'a/b', 'repository 允许是字符串');
  assert.equal(repoOfManifest({}), null);

  const manifest = { repository: { url: 'git+https://github.com/Aparencia/RoadBook.git' } };
  const derived = upstreamOf(manifest, '');
  assert.equal(derived.manifestUrl, 'https://raw.githubusercontent.com/Aparencia/RoadBook/main/package.json');
  assert.equal(derived.source, 'repository');
  assert.equal(upstreamOf({}, ''), null, '没有 repository 又没有覆盖 = 没有上游（不是猜一个）');
  assert.equal(upstreamOf(manifest, 'not-a-url'), null, '覆盖值不是 http(s) 一律判为没有上游');
  assert.equal(upstreamOf(manifest, 'http://127.0.0.1:9/package.json').source, 'config');
});

test('本包 manifest 真的声明了 repository —— 否则下游判定会永远停在 no-upstream', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(upstreamOf(manifest, '').repo, 'Aparencia/RoadBook');
});

// ── 来源与 lockfile 对账 ─────────────────────────────────────────────────────

test('安装来源形状：git / registry / local / unknown 四类各归各的', () => {
  assert.equal(installKindOf('github:Aparencia/RoadBook'), 'git');
  assert.equal(installKindOf('git+https://github.com/a/b.git'), 'git');
  assert.equal(installKindOf('link:../repo'), 'local');
  assert.equal(installKindOf('file:/tmp/pkg'), 'local');
  assert.equal(installKindOf('0.3.0'), 'registry');
  assert.equal(installKindOf('^0.3.0'), 'registry');
  assert.equal(installKindOf('https://codeload.github.com/a/b/tar.gz/abc'), 'unknown');
  assert.equal(installKindOf(''), 'unknown');
});

test('从 lockfile 里只认自己那条 git 解析的 commit（同 monorepo 兄弟包不许串味）', () => {
  const lock = [
    "  other@git+ssh://git@github.com/Aparencia/Other.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:",
    '    resolution: {commit: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, repo: git@github.com:Aparencia/Other.git, type: git}',
    `  roadbook@git+ssh://git@github.com/Aparencia/RoadBook.git#${COMMIT}:`,
    `    resolution: {commit: ${COMMIT}, repo: git@github.com:Aparencia/RoadBook.git, type: git}`,
    '',
  ].join('\n');
  assert.equal(lockCommitOf(lock, 'github:Aparencia/RoadBook'), COMMIT);
  assert.equal(lockCommitOf(lock, 'github:Aparencia/Other'), 'a'.repeat(40));
  assert.equal(lockCommitOf(lock, 'github:Aparencia/Missing'), null);
  assert.equal(repoKeyOfSpec('git@github.com:Aparencia/RoadBook.git'), 'github.com/aparencia/roadbook');
});

// ── 清单读取的两级传输（TLS 拦截） ──────────────────────────────────────────

test('证书类错误识别：只对验不过证书链的错误回退，网络类错误照旧直接抛', () => {
  assert.equal(isCertificateError(new Error('fetch failed')), false);
  assert.equal(isCertificateError(Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('unable to verify the first certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }) })), true);
  assert.equal(isCertificateError(Object.assign(new Error('self signed certificate in certificate chain'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' })), true);
  assert.equal(isCertificateError(new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com')), false);
  assert.equal(isCertificateError(null), false);
});

test('两级传输：证书错回退到系统 CA 那一级，网络错不回退，正常时只用第一级', async () => {
  const calls = [];
  const certError = Object.assign(new Error('fetch failed'), { cause: new Error('unable to verify the first certificate') });
  const fetcher = createManifestFetcher({
    fetchImpl: async () => {
      calls.push('fetch');
      throw certError;
    },
    httpsImpl: async (url, options) => {
      calls.push(`https:${Array.isArray(options.ca) ? 'ca' : 'no-ca'}`);
      return { ok: true, status: 200, text: async () => '{"version":"9.9.9"}' };
    },
    timeoutMs: 1234,
  });
  const response = await fetcher.fetch('https://raw.example/package.json');
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['fetch', 'https:ca'], '回退时要带上系统 CA');
  assert.equal(fetcher.transport(), 'system-ca', '这一级是证据：状态里要能看出是哪条传输答的');
  assert.equal(fetcher.fallbacks(), 1);

  const network = createManifestFetcher({
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
    httpsImpl: async () => {
      throw new Error('不该被调用');
    },
  });
  await assert.rejects(() => network.fetch('https://raw.example/package.json'), /ENOTFOUND/);
  assert.equal(network.fallbacks(), 0, 'DNS 不通不该白跑第二次');

  const healthy = createManifestFetcher({ fetchImpl: async () => manifestResponse('1.0.0'), httpsImpl: async () => { throw new Error('不该被调用'); } });
  assert.equal((await healthy.fetch('https://raw.example/package.json')).status, 200);
  assert.equal(healthy.transport(), 'fetch');
});

test('系统 CA 读取：拿不到就交给默认信任链（返回 null，不是空数组）', () => {
  const list = systemCaCertificates();
  assert.ok(list === null || (Array.isArray(list) && list.length > 0), '要么给一组 CA，要么明说没有');
});

// ── 判定 ─────────────────────────────────────────────────────────────────────

test('五态判定：dev / unknown / update-available / ahead / up-to-date 各有明确入口', () => {
  assert.deepEqual(decideUpdate({ installKind: 'local' }), { state: 'dev', reason: 'dev-install' });
  assert.deepEqual(decideUpdate({ installKind: 'unknown' }), { state: 'unknown', reason: 'unknown-source' });
  assert.deepEqual(decideUpdate({ installedVersion: null, latestVersion: '1.0.0' }), { state: 'unknown', reason: 'no-version' });
  assert.deepEqual(decideUpdate({ installedVersion: '1.0.0', latestVersion: 'junk' }), { state: 'unknown', reason: 'unparsable-version' });
  assert.deepEqual(decideUpdate({ installedVersion: '0.2.3', latestVersion: '0.3.0' }), { state: 'update-available', reason: 'version' });
  assert.deepEqual(decideUpdate({ installedVersion: '0.3.0', latestVersion: '0.2.3' }), { state: 'ahead', reason: 'installed-newer' });
  assert.deepEqual(decideUpdate({ installedVersion: '0.3.0', latestVersion: '0.3.0' }), { state: 'up-to-date', reason: 'same-version' });
});

test('提交不一致只在版本相同时补一刀，且永远只往「有更新」方向补', () => {
  const base = { installedVersion: '0.3.0', latestVersion: '0.3.0', installKind: 'git' };
  assert.deepEqual(decideUpdate({ ...base, installedCommit: 'a'.repeat(40), latestCommit: 'b'.repeat(40) }), {
    state: 'update-available',
    reason: 'commit',
  });
  assert.deepEqual(decideUpdate({ ...base, installedCommit: COMMIT, latestCommit: COMMIT }), { state: 'up-to-date', reason: 'same-version' });
  assert.deepEqual(decideUpdate({ ...base, installedCommit: COMMIT, latestCommit: null }), { state: 'up-to-date', reason: 'same-version' });
  // 本地更新时，提交不同不许把结论拉回「已是最新」
  assert.deepEqual(decideUpdate({ installedVersion: '0.4.0', latestVersion: '0.3.0', installedCommit: 'a'.repeat(40), latestCommit: 'b'.repeat(40) }), {
    state: 'ahead',
    reason: 'installed-newer',
  });
});

// ── 检查 ─────────────────────────────────────────────────────────────────────

test('检查：正常路径给出版本判定，任何读取失败都是 unknown 而不是「已是最新」', async () => {
  const ok = await checkForUpdate({
    fetchImpl: async () => manifestResponse('0.3.0'),
    manifestUrl: 'https://raw.githubusercontent.com/Aparencia/RoadBook/main/package.json',
    installedVersion: '0.2.3',
    installKind: 'git',
  });
  assert.equal(ok.state, 'update-available');
  assert.equal(ok.latestVersion, '0.3.0');
  assert.equal(ok.reason, 'version');

  const same = await checkForUpdate({ fetchImpl: async () => manifestResponse('0.2.3'), manifestUrl: 'https://x/package.json', installedVersion: '0.2.3' });
  assert.equal(same.state, 'up-to-date');

  const cases = [
    ['网络错', { fetchImpl: async () => { throw new Error('ENOTFOUND'); } }, 'network'],
    ['非 2xx', { fetchImpl: async () => ({ ok: false, status: 500, text: async () => '' }) }, 'http-500'],
    ['坏 JSON', { fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>' }) }, 'bad-json'],
    ['缺 version', { fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"name":"roadbook"}' }) }, 'no-version'],
    ['没有上游', { fetchImpl: async () => manifestResponse('9.9.9'), manifestUrl: '' }, 'no-upstream'],
    ['没有 fetch', { fetchImpl: null, manifestUrl: 'https://x/package.json' }, 'no-fetch'],
  ];
  for (const [label, options, reason] of cases) {
    const verdict = await checkForUpdate({ installedVersion: '0.2.3', manifestUrl: 'https://x/package.json', ...options });
    assert.equal(verdict.state, 'unknown', `${label} 必须判不了`);
    assert.equal(verdict.reason, reason, `${label} 的理由要能对上`);
  }
});

test('超时：AbortController 中止后记 timeout，不记 network', async () => {
  const verdict = await checkForUpdate({
    manifestUrl: 'https://x/package.json',
    installedVersion: '0.2.3',
    timeoutMs: 5,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (signal) signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  assert.equal(verdict.state, 'unknown');
  assert.equal(verdict.reason, 'timeout');
});

// ── 配置 ─────────────────────────────────────────────────────────────────────

test('配置归一化：默认 notify；越界或非法值回落默认，不许把整行插件判死', () => {
  const defaults = normalizeConfig({});
  assert.equal(defaults.mode, 'notify');
  assert.equal(defaults.intervalHours, 24);
  assert.equal(defaults.applyTimeoutMs, 300000);
  assert.equal(defaults.report, true);
  assert.equal(defaults.reportPath, '');
  assert.equal(normalizeConfig({ update: 'auto', updateIntervalHours: 6 }).mode, 'auto');
  assert.equal(normalizeConfig({ update: 'whatever' }).mode, 'notify', '非法模式回落默认');
  assert.equal(normalizeConfig({ updateIntervalHours: -3 }).intervalHours, 24);
  assert.equal(normalizeConfig({ updateIntervalMs: 1 }).timeoutMs, 8000, '没这个键就是默认值');
  assert.equal(normalizeConfig({ updateTimeoutMs: 10 ** 9 }).timeoutMs, 8000);
  assert.equal(normalizeConfig({ updateReport: false }).report, false);
  assert.equal(normalizeConfig(null).mode, 'notify');
});

// ── 观测文件 ─────────────────────────────────────────────────────────────────

test('观测文件尾部读取：坏行跳过、只认最后一条 check、大文件只读尾巴', (t) => {
  const dir = box(t);
  const file = join(dir, 'report.jsonl');
  assert.equal(lastCheckAt(file), null, '文件不存在 = 没检查过');
  assert.equal(lastCheckEvent('{"event":"skip","reason":"cooldown"}\n'), null);

  const lines = [];
  for (let index = 0; index < 4000; index += 1) lines.push(JSON.stringify({ time: new Date(1000 + index).toISOString(), event: 'skip', reason: 'noise' }));
  lines.push('{ 坏行');
  lines.push(JSON.stringify({ time: new Date(1_700_000_000_000).toISOString(), event: 'check', state: 'up-to-date', latest: '0.3.0' }));
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  assert.equal(lastCheckAt(file), 1_700_000_000_000);
  assert.equal(lastCheckEvent(readFileSync(file, 'utf8')).state, 'up-to-date');
});

// ── 命令探测 ─────────────────────────────────────────────────────────────────

test('命令探测阶梯：配置模板优先，其次是自身 CLI 入口，再是自带运行时，最后是 PATH', () => {
  const runtime = { label: 'dsh-primary-runtime', node: join('C:/rt', 'node.exe'), pnpm: join('C:/rt', 'pnpm.mjs') };
  const onPath = join('C:/path', 'dsh.cmd');
  const exists = (file) => [join('C:/', 'electron.exe'), join('C:/app', 'cli.js'), runtime.node, runtime.pnpm, onPath].includes(file);
  const plan = candidateInstallers({
    env: { PATH: 'C:/path' },
    platform: 'win32',
    execPath: join('C:/', 'electron.exe'),
    execArgv: [],
    argv: ['electron', join('C:/app', 'cli.js')],
    config: { command: 'node -e "console.log(1)"' },
    spec: 'github:Aparencia/RoadBook',
    profile: 'desktop',
    profileDir: join('C:/profiles', 'desktop'),
    exists,
    runtimes: [runtime],
  });
  assert.equal(plan.available, true);
  assert.deepEqual(
    plan.candidates.map((candidate) => candidate.label),
    ['config', 'self-entry', 'runtime:dsh-primary-runtime', 'path-dsh'],
  );
  const self = plan.candidates[1];
  assert.deepEqual(self.args, [join('C:/app', 'cli.js'), 'plugin', '--profile', 'desktop', 'add', 'github:Aparencia/RoadBook']);
  assert.equal(self.env.ELECTRON_RUN_AS_NODE, '1', '桌面版入口就是 Electron 当 Node 用');
  assert.equal(plan.candidates[2].cwd, join('C:/profiles', 'desktop'), '自带运行时要落在 profile 目录里跑 pnpm');
  assert.equal(plan.candidates[3].file, onPath);
});

test('命令探测：全不可用就拒绝执行并逐条给出跳过理由（不许随便挑一条把 profile 装坏）', () => {
  const plan = candidateInstallers({
    env: { PATH: '' },
    platform: 'win32',
    execPath: 'C:/electron.exe',
    argv: ['electron', 'C:/app/whatever.js'],
    spec: 'github:Aparencia/RoadBook',
    profile: 'desktop',
    exists: () => false,
    runtimes: [{ label: 'rt', node: 'C:/rt/node.exe', pnpm: 'C:/rt/pnpm.mjs' }],
  });
  assert.equal(plan.available, false);
  assert.equal(plan.reason, 'no-installer');
  assert.deepEqual(plan.skipped, [
    { label: 'self-entry', reason: 'entry-shape' },
    { label: 'runtime:rt', reason: 'runtime-missing' },
    { label: 'path-dsh', reason: 'not-on-path' },
  ]);
});

test('命令探测：开发安装与未知来源不生成候选；registry 来源追加 @latest', () => {
  assert.equal(candidateInstallers({ spec: 'link:../RoadBook' }).reason, 'dev-install');
  assert.equal(candidateInstallers({ spec: 'https://codeload.github.com/a/b/tar.gz/x' }).reason, 'unknown-source');
  assert.equal(candidateInstallers({ spec: '' }).reason, 'not-installed');
  const registry = candidateInstallers({ spec: '0.2.3', profile: 'desktop', exists: (file) => file === 'C:/rt/pnpm.mjs' || file === 'C:/rt/node.exe', runtimes: [{ label: 'rt', node: 'C:/rt/node.exe', pnpm: 'C:/rt/pnpm.mjs' }], env: { PATH: '' } });
  assert.equal(registry.target, 'roadbook@latest', 'registry 来源要显式 @latest，否则原地不动');
});

test('PATH 查找与命令模板替换（只换占位符、不解释语法：整行交给 shell）', () => {
  const exists = (file) => file === join('C:/bin', 'dsh.cmd');
  assert.equal(whichInPath('dsh', { Path: 'C:/other;C:/bin' }, 'win32', exists), join('C:/bin', 'dsh.cmd'), '查 dsh 由 PATHEXT 后缀表补出 .cmd，别把扩展名写死');
  assert.equal(whichInPath('dsh.cmd', { Path: 'C:/other;C:/bin' }, 'win32', exists), join('C:/bin', 'dsh.cmd'));
  assert.equal(whichInPath('dsh', { PATH: 'C:/other' }, 'win32', exists), null);
  // POSIX 分支也按 join 口径比（测试可能跑在 Windows 上，写死 `/usr/local/bin` 会被 join 弄成反斜杠）
  const posixDir = join('opt', 'dsh-bin');
  const posixExe = join(posixDir, 'dsh');
  assert.equal(whichInPath('dsh', { PATH: posixDir }, 'linux', (file) => file === posixExe), posixExe);
  assert.equal(fillTemplate('node fake.mjs {target} --profile {profile}', { target: 'github:a/b', profile: 'desktop' }), 'node fake.mjs github:a/b --profile desktop');
  assert.equal(fillTemplate('node -e "console.log({package})"', { package: 'roadbook' }), 'node -e "console.log(roadbook)"', '引号原样留着 —— 拆 argv 会把这类命令弄坏（DEP0190）');
  assert.equal(fillTemplate('echo {unknown}', {}), 'echo {unknown}', '未知占位符原样留着，不静默清空');
  assert.equal(fillTemplate('node --version', {}), 'node --version', '没有占位符就原样跑（演练打桩用得上）');
});

test('Windows 上 PATH 候选必须是 shell 整行：.cmd + shell:false 实测直接 EINVAL', () => {
  const shim = join('C:/Program Files/dsh', 'dsh.cmd');
  const plan = candidateInstallers({
    env: { PATH: 'C:/Program Files/dsh' },
    platform: 'win32',
    execPath: '',
    argv: [],
    spec: 'github:Aparencia/RoadBook',
    profile: 'desktop',
    exists: (file) => file === shim,
    runtimes: [],
  });
  const candidate = plan.candidates.at(-1);
  assert.equal(candidate.label, 'path-dsh');
  assert.equal(candidate.shell, true, 'Node ≥18.20 起 .cmd 不给 shell 就起不来（CVE-2024-27980 之后的硬规则）');
  assert.deepEqual(candidate.args, [], 'shell 模式不许再传 args —— shell + args 不转义（DEP0190），那正是本仓库修过的那类坑');
  assert.equal(
    fillTemplate(candidate.template, { target: 'github:a/b', profile: 'desktop' }),
    `"${shim}" plugin --profile "desktop" add "github:a/b"`,
    '路径必须带引号：本机实测 DSH 就装在含空格的目录里',
  );
  const posixDir = join('opt', 'dsh-bin');
  const posixExe = join(posixDir, 'dsh');
  const posix = candidateInstallers({
    env: { PATH: posixDir },
    platform: 'linux',
    execPath: '',
    argv: [],
    spec: 'github:Aparencia/RoadBook',
    profile: 'desktop',
    exists: (file) => file === posixExe,
    runtimes: [],
  });
  const last = posix.candidates.at(-1);
  assert.equal(last.shell, false, '非 Windows 上是可执行文件，走 argv 形态');
  assert.deepEqual(last.args, ['plugin', '--profile', 'desktop', 'add', 'github:Aparencia/RoadBook']);
  assert.equal(last.template, undefined);
});

test('PATH 上的 dsh.cmd 用真实 spawn 也能跑通（打桩会把这个缺陷放过去）', { skip: process.platform !== 'win32' }, async (t) => {
  const shimDir = box(t);
  const shim = join(shimDir, 'dsh.cmd');
  writeFileSync(shim, '@echo off\r\necho SHIM-OK %*\r\nexit /b 0\r\n', 'utf8');
  const profileDir = profileBox(t);
  const { ctx } = fakeCtx();
  const service = createUpdateService(ctx, { updateReportPath: join(box(t), 'obs.jsonl') }, {
    env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', DSH_HOME: join(profileDir, 'home'), PATH: shimDir },
    packageRoot: ROOT,
    schedule: false,
    platform: 'win32',
    execPath: process.execPath,
    // ② 主动让它命中不了（真实桌面宿主的 argv[1] 就是 lib/index.js，不是 cli.js），逼出 ④
    argv: [process.execPath, join(profileDir, 'not-an-entry.js')],
    fetch: async () => manifestResponse('9.9.9'),
    // 故意不给 spawn：这一条测的就是真实子进程
  });
  service.start();
  const started = await service.applyNow();
  assert.equal(started.ok, true, `探测该给出 PATH 候选，实际：${JSON.stringify(started)}`);
  const deadline = Date.now() + 15000;
  while (service.operation.state === 'running' && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(service.operation.label, 'path-dsh');
  assert.equal(service.operation.state, 'succeeded', `真实子进程该跑通，实际：${service.operation.error} ${service.operation.outputTail}`);
  assert.equal(service.operation.exitCode, 0);
  assert.match(service.operation.outputTail, /SHIM-OK/, '真实子进程的输出必须接得住');
  assert.match(service.operation.command, /dsh\.cmd/u, '证据里要能看出跑的是哪个 shim');
  assert.equal(existsSync(join(profileDir, '.roadbook-update.lock')), false);
  service.dispose();
});

// ── 同源守卫 ─────────────────────────────────────────────────────────────────

test('本机请求守卫：loopback 放行、伪造 Host 拒绝、跨站拒绝、Origin 与 Host 必须同源', () => {
  assert.equal(loopbackAuthority('127.0.0.1:19387'), true);
  assert.equal(loopbackAuthority('[::1]:19387'), true);
  assert.equal(loopbackAuthority('localhost'), true);
  assert.equal(loopbackAuthority('evil.com'), false);

  assert.equal(trustedLocalRequest({ headers: { host: '127.0.0.1:19387' } }), true, '无 Origin 的客户端请求放行（桌面代理会剥掉它）');
  assert.equal(trustedLocalRequest({ headers: { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' } }), true);
  assert.equal(trustedLocalRequest({ headers: { host: 'evil.com', origin: 'http://evil.com' } }), false, 'DNS rebinding：Host 是伪造不了的那个头');
  assert.equal(trustedLocalRequest({ headers: { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' } }), false);
  assert.equal(trustedLocalRequest({ headers: { host: '127.0.0.1:19387', origin: 'http://other.local' } }), false);
  assert.equal(trustedLocalRequest({ headers: new Headers({ host: '127.0.0.1' }) }), true, '标准 Headers 形状也要认');
});

// ── 服务接线（假 ctx / 假 fetch / 假 spawn） ────────────────────────────────

/** 起一个接了线的服务，返回句柄与假环境。 */
function serviceBox(t, options = {}) {
  const profileDir = profileBox(t, options.profile ?? {});
  const reportPath = join(box(t), 'roadbook-update.jsonl');
  const { ctx, logs, routes } = fakeCtx();
  const calls = { spawned: [], fetch: [] };
  // 观测路径必须从 config 进去（服务在创建时就把 reportPath 定死了，事后改 settings 不会生效）。
  const config = { updateReportPath: reportPath, ...(options.config ?? {}) };
  const service = createUpdateService(ctx, config, {
    env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', DSH_HOME: join(profileDir, 'home'), PATH: '' },
    packageRoot: ROOT,
    schedule: false,
    platform: 'win32',
    fetch:
      options.fetch ??
      (async (url) => {
        calls.fetch.push(url);
        return manifestResponse(options.latest ?? '9.9.9');
      }),
    spawn: (file, args, spawnOptions) => {
      calls.spawned.push({ file, args, spawnOptions });
      return fakeChild(options.child ?? {});
    },
  });
  service.start();
  return { service, ctx, logs, routes, calls, profileDir, reportPath };
}

test('服务：状态路由给出五态判定，并把检查写进观测文件', async (t) => {
  const { service, routes, reportPath, calls } = serviceBox(t, { latest: '9.9.9' });
  assert.ok(routes.has(UPDATE_STATUS_PATH), '状态路由必须注册');
  assert.ok(routes.has(UPDATE_APPLY_PATH), '应用路由必须注册');

  const response = fakeResponse();
  await routes.get(UPDATE_STATUS_PATH)({ method: 'GET', url: UPDATE_STATUS_PATH, headers: { host: '127.0.0.1:19387' } }, response);
  const payload = JSON.parse(response.out.body);
  assert.equal(response.out.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'notify');
  assert.equal(payload.state, 'update-available');
  assert.equal(payload.installed, pluginVersion(ROOT));
  assert.equal(payload.latest, '9.9.9');
  assert.equal(calls.fetch.length, 1);

  const lines = readFileSync(reportPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.some((entry) => entry.event === 'loaded'));
  assert.ok(lines.some((entry) => entry.event === 'check' && entry.state === 'update-available'));
  service.dispose();
});

test('服务：冷却期内不再打远端，但显式 force 能穿透', async (t) => {
  const { service, reportPath, calls } = serviceBox(t);
  await service.check({ force: true });
  assert.equal(calls.fetch.length, 1);
  await service.check({ force: false });
  assert.equal(calls.fetch.length, 1, '冷却期内不许再打一次远端');
  const skipped = readFileSync(reportPath, 'utf8').includes('"reason":"cooldown"');
  assert.equal(skipped, true, '跳过要留证据，不是静默');
  await service.check({ force: true });
  assert.equal(calls.fetch.length, 2);
  service.dispose();
});

test('服务：检查整个失败也不上抛，状态停在 unknown', async (t) => {
  const { service } = serviceBox(t, {
    fetch: async () => {
      throw new Error('ENOTFOUND raw.githubusercontent.com');
    },
  });
  const payload = await service.check({ force: true });
  assert.equal(payload.state, 'unknown');
  assert.equal(payload.reason, 'network');
  service.dispose();
});

test('服务：更新动作跑通 —— 命令来自探测、退出码 0、锁清掉、观测留两行证据', async (t) => {
  const { service, calls, profileDir, reportPath } = serviceBox(t, {
    config: { updateCommand: 'node fake-installer.mjs {target}' },
  });
  const result = await service.applyNow();
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(service.operation.state, 'running');
  await tick();
  assert.equal(service.operation.state, 'succeeded');
  assert.equal(service.operation.exitCode, 0);
  assert.equal(service.operation.before, pluginVersion(ROOT));
  assert.equal(calls.spawned[0].file, 'node fake-installer.mjs github:Aparencia/RoadBook', '模板命令整行交给 shell（占位符已替换）');
  assert.deepEqual(calls.spawned[0].args, [], 'shell 模式下不再传 args（DEP0190：shell + args 不做转义）');
  assert.equal(calls.spawned[0].spawnOptions.shell, true);
  assert.equal(calls.spawned[0].spawnOptions.cwd, profileDir);
  assert.equal(service.operation.command, 'node fake-installer.mjs github:Aparencia/RoadBook', '证据里要能看见到底跑了什么命令');
  assert.equal(existsSync(join(profileDir, '.roadbook-update.lock')), false, '跑完必须把锁清掉');
  const text = readFileSync(reportPath, 'utf8');
  assert.ok(text.includes('"event":"apply-start"'));
  assert.ok(text.includes('"event":"apply-finish"'));
  service.dispose();
});

test('服务：安装命令非 0 记失败并把输出尾巴留成证据', async (t) => {
  const { service, reportPath } = serviceBox(t, { config: { updateCommand: 'node fake.mjs' }, child: { code: 1, output: 'ERR_PNPM_FETCH_404\n' } });
  await service.applyNow();
  await tick();
  assert.equal(service.operation.state, 'failed');
  assert.equal(service.operation.exitCode, 1);
  assert.match(service.operation.outputTail, /ERR_PNPM_FETCH_404/);
  assert.ok(readFileSync(reportPath, 'utf8').includes('ERR_PNPM_FETCH_404'));
  service.dispose();
});

test('服务：有 agent 在跑时拒绝更新（判据与 dshmarket 一致）', async (t) => {
  const { service, ctx, calls } = serviceBox(t, { config: { updateCommand: 'node fake.mjs' } });
  ctx.__agents = { list: () => [{ id: 'session-1', status: 'running' }] };
  const result = await service.applyNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, 'agents-busy');
  assert.deepEqual(result.agents, ['session-1']);
  assert.equal(calls.spawned.length, 0, '被拒绝时一个命令都不许跑');
  service.dispose();
});

test('服务：找不到可用安装命令时拒绝（424）并列出跳过理由；开发安装单独给理由', async (t) => {
  const { service } = serviceBox(t);
  const result = await service.applyNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, 424);
  assert.equal(result.error, 'no-installer');
  assert.ok(Array.isArray(result.skipped));
  service.dispose();

  const dev = serviceBox(t, { profile: { spec: 'link:../RoadBook' } });
  const devResult = await dev.service.applyNow();
  assert.equal(devResult.error, 'dev-install');
  dev.service.dispose();
});

test('服务：并发点两次第二次被拒，锁文件是证据不是装饰', async (t) => {
  const { service } = serviceBox(t, { config: { updateCommand: 'node fake.mjs' }, child: { code: 0, output: 'slow\n' } });
  const first = await service.applyNow();
  assert.equal(first.ok, true);
  const second = await service.applyNow();
  assert.equal(second.ok, false);
  assert.equal(second.status, 409);
  assert.equal(second.error, 'busy');
  service.dispose();
});

test('服务：模式 off 时状态如实报告关闭，应用路由 403 且不跑命令', async (t) => {
  const { service, routes, calls } = serviceBox(t, { config: { update: 'off' } });
  const response = fakeResponse();
  await routes.get(UPDATE_STATUS_PATH)({ method: 'GET', url: UPDATE_STATUS_PATH, headers: {} }, response);
  const payload = JSON.parse(response.out.body);
  assert.equal(payload.mode, 'off');
  assert.equal(payload.state, 'off');
  assert.equal(payload.applier.available, false);

  const applied = fakeResponse();
  await routes.get(UPDATE_APPLY_PATH)({ method: 'POST', url: UPDATE_APPLY_PATH, headers: { host: '127.0.0.1:1' } }, applied);
  assert.equal(applied.out.status, 403);
  assert.equal(JSON.parse(applied.out.body).error, 'mode-off');
  assert.equal(calls.spawned.length, 0);
  service.dispose();
});

test('服务：变更路由拒绝跨站请求，且拒绝时不执行任何命令', async (t) => {
  const { service, routes, calls } = serviceBox(t, { config: { updateCommand: 'node fake.mjs' } });
  const response = fakeResponse();
  await routes.get(UPDATE_APPLY_PATH)({ method: 'POST', url: UPDATE_APPLY_PATH, headers: { host: 'evil.com', origin: 'http://evil.com' } }, response);
  assert.equal(response.out.status, 403);
  assert.equal(JSON.parse(response.out.body).error, 'untrusted-origin');
  assert.equal(calls.spawned.length, 0);
  service.dispose();
});

test('服务：安装命令抛异常也只记失败，不上抛（主行不许因此变「未运行」）', async (t) => {
  // 观测路径必须落在临时目录里：以前这条用例不传 updateReportPath，跑一次测试就往机器
  // 全局的 %TEMP%\roadbook-update.jsonl 里追加几行假记录。
  const reportPath = join(box(t), 'obs.jsonl');
  const profileDir = profileBox(t);
  const { ctx } = fakeCtx();
  const service = createUpdateService(ctx, { updateCommand: 'node fake.mjs', updateReportPath: reportPath }, {
    env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', PATH: '' },
    packageRoot: ROOT,
    schedule: false,
    spawn: () => {
      throw new Error('spawn EPERM');
    },
  });
  service.start();
  const result = await service.applyNow();
  assert.equal(result.ok, true, '命令起不来也是一次已发起的操作，结果由 operation 如实记录');
  assert.equal(service.operation.state, 'failed');
  assert.match(service.operation.error, /EPERM/);
  assert.equal(existsSync(join(profileDir, '.roadbook-update.lock')), false, '失败路径也必须释放锁');
  service.dispose();
});

/** 一个永远不发 'close' 的假子进程：模拟「装了安装器但进程树收不掉、管道还握着」的真机形状。 */
function stuckChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal);
    return true;
  };
  return child;
}

test('服务：子进程永远不发 close 也必须结账 —— 释放锁、闸放开，不许把更新永久挂住', async (t) => {
  const profileDir = profileBox(t);
  const reportPath = join(box(t), 'obs.jsonl');
  const { ctx } = fakeCtx();
  const spawned = [];
  const service = createUpdateService(ctx, { updateCommand: 'node fake.mjs', updateReportPath: reportPath, updateApplyTimeoutMs: 5000 }, {
    env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', PATH: '' },
    packageRoot: ROOT,
    schedule: false,
    platform: 'win32',
    // 宽限期缩到毫秒级，不然这条用例要跑 15 秒
    sigtermGraceMs: 20,
    finalGraceMs: 20,
    fetch: async () => manifestResponse('9.9.9'),
    spawn: (file, args, options) => {
      spawned.push({ file, args, options });
      return stuckChild();
    },
  });
  service.start();
  const lock = join(profileDir, '.roadbook-update.lock');

  const result = await service.applyNow();
  assert.equal(result.ok, true);
  const deadline = Date.now() + 15000;
  while (service.operation.state === 'running' && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(service.operation.state, 'failed', '看门狗到点必须结账，不许停在 running');
  assert.equal(service.operation.timedOut, true);
  assert.match(service.operation.error, /未在宽限期内退出/);
  // SIGTERM → 宽限 → taskkill /T /F（只 kill 直接子进程收不掉 cmd.exe 的孙进程）
  const killers = spawned.filter((row) => row.file === 'taskkill');
  assert.equal(killers.length, 1, 'Windows 上超时必须走 taskkill 收进程树');
  assert.deepEqual(killers[0].args, ['/pid', '4242', '/T', '/F']);
  assert.equal(existsSync(lock), false, '兜底结账也必须释放锁');
  assert.ok(readFileSync(reportPath, 'utf8').includes('"event":"apply-timeout"'), '超时本身要留证据');

  const second = await service.applyNow();
  assert.notEqual(second.error, 'busy', '结账之后闸必须放开，否则只有重启宿主才能恢复');
  service.dispose();
});

test('命令探测：PATH 里的同名**目录**不算可执行文件（它会把真正的 dsh.cmd 盖掉）', async (t) => {
  const dir = box(t);
  const bin = join(dir, 'bin');
  mkdirSync(join(bin, 'dsh'), { recursive: true });
  const profileDir = profileBox(t);
  const { ctx } = fakeCtx();
  const service = createUpdateService(ctx, { updateReportPath: join(box(t), 'obs.jsonl') }, {
    env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', DSH_HOME: join(dir, 'home'), PATH: bin },
    packageRoot: ROOT,
    schedule: false,
    platform: 'win32',
    execPath: process.execPath,
    argv: [process.execPath, join(dir, 'not-an-entry.js')],
    fetch: async () => manifestResponse('9.9.9'),
    spawn: () => fakeChild(),
  });
  service.start();
  const result = await service.applyNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, 424);
  assert.ok(
    result.skipped.some((row) => row.label === 'path-dsh' && row.reason === 'not-on-path'),
    `目录不许被当成命令，实际 skipped=${JSON.stringify(result.skipped)}`,
  );
  service.dispose();
});

test('观测脱敏：命令行里的 token 落盘前被抹掉（键留着，值变 ***）', async (t) => {
  const reportPath = join(box(t), 'obs.jsonl');
  const { service } = serviceBox(t, {
    config: { updateCommand: 'node fake.mjs --token=SUPERSECRETVALUE {target}', updateReportPath: reportPath },
  });
  await service.applyNow();
  await tick();
  const text = readFileSync(reportPath, 'utf8');
  assert.equal(text.includes('SUPERSECRETVALUE'), false, '真值不许落盘');
  assert.ok(text.includes('--token=***'), '键要留着，否则排错时看不出跑过什么');
  service.dispose();
});

test('观测上限：轮转失败时宁可丢这一行，也不让文件无限涨', async (t) => {
  const reportPath = join(box(t), 'obs.jsonl');
  // 把 `.1` 做成目录，让每次轮转都失败（真机上等价于文件被别的进程/杀软占住）
  mkdirSync(`${reportPath}.1`, { recursive: true });
  const { service } = serviceBox(t, { config: { updateReportPath: reportPath, updateReportMaxBytes: 4096 } });
  for (let index = 0; index < 60; index += 1) await service.check({ force: true });
  const size = statSync(reportPath).size;
  assert.ok(size < 8192, `轮转失败时文件也不许无限涨，实际 ${size} 字节`);
  assert.ok(size > 0, '上限之内照常写');
  service.dispose();
});

test('提交对账：版本号相同时才问上游 HEAD 提交，问到了就按「推了没升版」判有更新', async () => {
  const OTHER = 'a'.repeat(40);
  const manifestUrl = 'https://raw.githubusercontent.com/Aparencia/RoadBook/main/package.json';
  const commitUrl = 'https://api.github.com/repos/Aparencia/RoadBook/commits/main';
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url === commitUrl) return { ok: true, status: 200, text: async () => JSON.stringify({ sha: OTHER }) };
    return manifestResponse('0.4.0');
  };

  const sameVersion = await checkForUpdate({ fetchImpl, manifestUrl, commitUrl, installedVersion: '0.4.0', installedCommit: COMMIT, installKind: 'git' });
  assert.equal(sameVersion.commitCheck, 'differ');
  assert.equal(sameVersion.state, 'update-available', '版本号一样但提交不同 = 推了代码没升版，这一档必须真的能判出来');
  assert.equal(sameVersion.latestCommit, OTHER);
  assert.deepEqual(urls, [manifestUrl, commitUrl]);

  urls.length = 0;
  const newer = await checkForUpdate({ fetchImpl, manifestUrl, commitUrl, installedVersion: '0.3.0', installedCommit: COMMIT, installKind: 'git' });
  assert.equal(newer.state, 'update-available');
  assert.equal(newer.commitCheck, 'skipped');
  assert.deepEqual(urls, [manifestUrl], '版本号已经不同了就别再花一次请求去问提交');

  const broken = await checkForUpdate({
    fetchImpl: async (url) => (url === commitUrl ? { ok: false, status: 403, text: async () => '{}' } : manifestResponse('0.4.0')),
    manifestUrl,
    commitUrl,
    installedVersion: '0.4.0',
    installedCommit: COMMIT,
    installKind: 'git',
  });
  assert.equal(broken.commitCheck, 'unknown', '问不到就如实说未知，不许假装对过账');
  assert.equal(broken.state, 'up-to-date', '版本号确实相同：这是事实，但 commitCheck 把「没问成」记下来了');
});

test('主行 apply()：自检日志照旧，且缺少 webServer 服务时安静让路', (t) => {
  const profileDir = profileBox(t);
  const logs = [];
  const ctx = { logger: { info: (text) => logs.push(text), warn: (text) => logs.push(text) } };
  assert.doesNotThrow(() =>
    apply(ctx, { diagrams: 'docs/diagrams' }, {
      env: { DSH_PROFILE_DIR: profileDir, DSH_PROFILE: 'desktop', PATH: '' },
      packageRoot: ROOT,
      schedule: false,
    }),
  );
  assert.equal(logs.length, 1, '除 ready 之外不该多出日志');
  assert.match(logs[0], /roadbook v\d+\.\d+\.\d+: ready/);
});
