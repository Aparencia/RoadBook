/**
 * roadbook-evolve · 宿主半**接线**测试（离线，用注入的假子进程与假文件读取）。
 *
 * 为什么要有这一层：signals.test.mjs 只证明「算得对」，证明不了「喂进去的是真数据」。
 * 本文件诞生于一次真实的假绿 —— `readGit` 曾经只取退出码却写死 `porcelainLines: 0`，
 * 于是 S4「工作树状态」永远显示「干净」。纯逻辑测试全绿，接线是错的。
 */
import { EventEmitter } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { apply, createEvolveService, findRepoRoot, normalizeConfig, readTextFile } from '../index.js';

/** 本仓库根（测试文件在 <root>/plugin/roadbook-evolve/test/ ⇒ 上溯三级）。 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** 每次运行一个独立文件名：**绝不写共享的 roadbook-evolve.jsonl**（0.3.0 的测试污染教训）。 */
const REPORT = join(tmpdir(), `roadbook-evolve-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}.jsonl`);

/**
 * 假子进程：`plan(cmd, args)` 决定退出码与 stdout。
 * stdout 在 `close` 之前 emit（用 microtask 保证调用方已挂上监听器）。
 */
function fakeSpawn(plan) {
  return (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      const result = plan(cmd, args) ?? { code: 0 };
      if (result.error !== undefined) {
        child.emit('error', new Error(result.error));
        return;
      }
      if (typeof result.stdout === 'string' && result.stdout !== '') child.stdout.emit('data', result.stdout);
      child.emit('close', result.code);
    });
    return child;
  };
}

/** 造一个服务：readFile 注入成固定 JSONL，repoRoot 用真仓库根（好让 AUDIT_SCRIPTS 的 existsSync 通过）。 */
function makeService({ plan, autoload = '', update = '', now = Date.parse('2026-10-05T14:00:00.000Z') } = {}) {
  const files = { autoload, update };
  return createEvolveService(
    { logger: { info() {}, warn() {} } },
    { repoRoot: ROOT, reportPath: REPORT, auditTimeoutMs: 1000 },
    {
      spawn: fakeSpawn(plan ?? (() => ({ code: 0 }))),
      now: () => now,
      cwd: ROOT,
      readFile: (path) => {
        if (path === undefined) throw new Error('ENOENT');
        if (String(path).includes('roadbook-autoload')) return files.autoload;
        if (String(path).includes('roadbook-update')) return files.update;
        throw new Error(`ENOENT: ${path}`); // 观测文件不存在 = 真机上首跑的样子
      },
    },
  );
}

const verdictOf = (result, id) => result.signals.find((s) => s.id === id).verdict;

test.after(() => {
  for (const suffix of ['', '.1']) {
    try {
      if (existsSync(`${REPORT}${suffix}`)) rmSync(`${REPORT}${suffix}`, { force: true });
    } catch {
      /* 清理失败不影响判定 */
    }
  }
});

// ── S4：必须真的数 stdout 的行（这条用例就是为那次假绿写的）─────────────────

test('S4：git 报脏（stdout 有行）必须判 hit，读数等于行数', async () => {
  const service = makeService({
    plan: (cmd) => (cmd === 'git' ? { code: 0, stdout: ' M CHANGELOG.md\n?? plugin/new/\n' } : { code: 0 }),
  });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S4'), 'hit');
  assert.equal(result.signals.find((s) => s.id === 'S4').reading, '2');
});

test('S4：git 报干净（stdout 为空）判 ok，读数为 0', async () => {
  const service = makeService({ plan: (cmd) => (cmd === 'git' ? { code: 0, stdout: '' } : { code: 0 }) });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S4'), 'ok');
  assert.equal(result.signals.find((s) => s.id === 'S4').reading, '0');
});

test('S4：git 退出码非 0（不是仓库）判 unknown，不许显示成「树干净」', async () => {
  const service = makeService({ plan: (cmd) => (cmd === 'git' ? { code: 128 } : { code: 0 }) });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S4'), 'unknown');
  assert.equal(result.signals.find((s) => s.id === 'S4').reading, null);
});

test('S4：spawn 直接抛（git 未安装 / 沙箱 EPERM）判 unknown，整次 tick 不崩', async () => {
  const service = makeService({
    plan: (cmd) => (cmd === 'git' ? { error: 'spawn EPERM' } : { code: 0 }),
  });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S4'), 'unknown');
  assert.match(result.signals.find((s) => s.id === 'S4').detail, /EPERM/);
});

// ── S5/S6：只记既有 CLI 的退出码 ────────────────────────────────────────────

test('S5/S6：两个 audit 的退出码分别映射到各自信号', async () => {
  const service = makeService({
    plan: (cmd, args) => {
      if (cmd === 'git') return { code: 0, stdout: '' };
      const script = String(args?.[0] ?? '');
      if (script.includes('rules.mjs')) return { code: 1 };
      if (script.includes('route.mjs')) return { code: 0 };
      return { code: 0 };
    },
  });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S5'), 'hit', 'rules.mjs 退出码 1 必须判红');
  assert.equal(verdictOf(result, 'S6'), 'ok');
});

// ── 四路输入相互独立：一路失败不许带崩其余 ──────────────────────────────────

test('四路独立：git 不可用时，观测读数（S2/S3）照常出数', async () => {
  const loaded = '{"event":"loaded"}';
  const banner = '{"event":"banner","state":"registered"}';
  const autoload = `${Array.from({ length: 12 }, () => loaded).join('\n')}\n${banner}\n`;
  const service = makeService({ autoload, plan: (cmd) => (cmd === 'git' ? { error: 'ENOENT' } : { code: 0 }) });
  const result = await service.tick();
  assert.equal(verdictOf(result, 'S4'), 'unknown');
  assert.equal(verdictOf(result, 'S2'), 'hit', '12 次 loaded 且一次没注入 ⇒ 注入活性判红');
  assert.equal(verdictOf(result, 'S3'), 'ok');
});

test('两份观测文件都不存在（真机首跑）⇒ S1/S2/S3 全 unknown，不写成 0', async () => {
  const service = makeService({ plan: (cmd) => (cmd === 'git' ? { code: 0, stdout: '' } : { code: 0 }) });
  const result = await service.tick();
  for (const id of ['S1', 'S2', 'S3']) {
    assert.equal(verdictOf(result, id), 'unknown', `${id} 在文件缺失时必须 unknown`);
  }
  // 能判的只有三路：S4（git 正常）+ S5/S6（两个 audit 跑得出退出码）。
  assert.equal(result.tally.ok, 3, '可判的应恰好是 S4/S5/S6');
  assert.equal(result.tally.unknown, 3, '观测三路应恰好是 unknown');
});

// ── 自身活性：tick 必须留痕 ─────────────────────────────────────────────────

test('每次 tick 往观测文件写一条 tick 事件（这是「本插件还活着」的唯一证据）', async () => {
  const service = makeService();
  await service.tick();
  const written = readTextFile(REPORT).text;
  const record = JSON.parse(written.trim().split('\n').at(-1));
  assert.equal(record.event, 'tick');
  assert.match(record.verdicts, /^S1:\w+ S2:\w+ S3:\w+ S4:\w+ S5:\w+ S6:\w+$/);
  assert.equal(typeof record.tally.hit, 'number');
});

test('status()：没算过就现算，绝不返回空表', async () => {
  const service = makeService();
  const payload = await service.status();
  assert.equal(payload.ok, true);
  assert.equal(payload.signals.length, 6);
  assert.equal(typeof payload.tally.unknown, 'number');
});

// ── 契约与降级 ─────────────────────────────────────────────────────────────

test('findRepoRoot：从本仓库内任意深度都能上溯到根；找不到返回空串（不是抛错）', () => {
  assert.equal(findRepoRoot(join(ROOT, 'plugin', 'roadbook-evolve')), ROOT.replace(/[\\/]$/, ''));
  assert.equal(findRepoRoot(tmpdir(), 3), '');
});

test('normalizeConfig：非法值退回默认；数字字符串**有意**收下（cordis 配置来自 YAML）', () => {
  const base = normalizeConfig({}, { tmpdir: 'T' });
  assert.equal(base.intervalHours, 24);
  assert.equal(base.mode, 'on');
  assert.ok(base.autoloadReport.endsWith('roadbook-autoload.jsonl'));
  assert.ok(base.updateReport.endsWith('roadbook-update.jsonl'));
  for (const bad of [0, -5, Number.NaN, 'abc']) {
    assert.equal(normalizeConfig({ intervalHours: bad }, { tmpdir: 'T' }).intervalHours, 24, `intervalHours=${bad} 该退回默认`);
  }
  assert.equal(normalizeConfig({ intervalHours: '8' }, { tmpdir: 'T' }).intervalHours, 8, '数字字符串按可解析处理');
  assert.equal(normalizeConfig({ mode: 'off' }, { tmpdir: 'T' }).mode, 'off');
});

test('apply() 永不抛：连 logger 都坏掉时也只降级', () => {
  const hostile = {
    logger: {
      get info() {
        throw new Error('logger 坏了');
      },
      get warn() {
        throw new Error('logger 坏了');
      },
    },
  };
  let api;
  assert.doesNotThrow(() => {
    api = apply(hostile, { repoRoot: ROOT, reportPath: REPORT }, { spawn: fakeSpawn(() => ({ code: 0 })), cwd: ROOT });
  });
  assert.equal(typeof api.start, 'function');
  assert.equal(typeof api.dispose, 'function');
  assert.doesNotThrow(() => api.dispose());
});

test('inject 必须是空数组：写进 inject 会让缺服务时整行被判「未运行」', async () => {
  const mod = await import('../index.js');
  assert.deepEqual(mod.inject, []);
  assert.equal(mod.name, 'roadbook-evolve');
  assert.equal(mod.EVOLVE_STATUS_PATH, '/roadbook/evolve/status');
  assert.equal(mod.EVOLVE_TICK_PATH, '/roadbook/evolve/tick');
});
