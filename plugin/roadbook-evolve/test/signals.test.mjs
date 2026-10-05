/**
 * roadbook-evolve · 纯逻辑层离线单测。
 *
 * 两条纪律（都来自本仓库踩过的坑）：
 *   1) **假数据必须照真形状**：下面的记录逐字取自本机 `%TEMP%\roadbook-update.jsonl` 与
 *      `roadbook-autoload.jsonl` 的真实行（含那次 65 条 `fake-installer.mjs` 噪声）。0.3.0 的
 *      教训是——假 session 用了真机上不存在的形状，12 条用例全绿而功能是死的。
 *   2) **不 mock 被测物**：这里只测纯函数，fs 与子进程在调用方（index.js），所以不需要造环境。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BANNER_OK_RATIO,
  MIN_LOADED_SAMPLE,
  SIGNALS,
  STALE_TICK_HOURS,
  classifyArm,
  evaluateSignals,
  parseJsonl,
  summarizeAutoload,
  summarizeEvolve,
  summarizeUpdate,
  tally,
} from '../signals.js';

// ── 真形状样本（逐字取自本机观测文件）───────────────────────────────────────

const AUTOLOAD_LOADED = '{"time":"2026-10-05T07:56:23.225Z","file":"C:\\\\Temp\\\\roadbook-autoload.jsonl","event":"loaded","fallbacks":[]}';
const AUTOLOAD_SKIP = '{"time":"2026-10-05T12:50:29.852Z","file":"C:\\\\Temp\\\\roadbook-autoload.jsonl","event":"skip","reason":"subagent","session":"dfbaf0fc","cwd":"D:\\\\Code\\\\RoadBook"}';
const AUTOLOAD_BANNER = '{"time":"2026-10-05T08:21:59.525Z","file":"C:\\\\Temp\\\\roadbook-autoload.jsonl","event":"banner","state":"unavailable"}';
const AUTOLOAD_INJECT = '{"time":"2026-10-05T13:00:00.000Z","file":"C:\\\\Temp\\\\roadbook-autoload.jsonl","event":"inject","skill":"roadbook","reason":"keyword","digest":"abcd1234"}';
const AUTOLOAD_CARD_READ = '{"time":"2026-10-05T13:01:00.000Z","file":"C:\\\\Temp\\\\roadbook-autoload.jsonl","event":"card-read","card":"playbook_EN/0-1-driver-card.md"}';

const UPDATE_FAKE_APPLY_START = '{"time":"2026-10-05T09:11:06.348Z","file":"C:\\\\Temp\\\\roadbook-update.jsonl","event":"apply-start","label":"config","target":"github:Aparencia/RoadBook","command":"fake-installer.mjs,github:Aparencia/RoadBook","profile":"desktop"}';
const UPDATE_FAKE_APPLY_FINISH = '{"time":"2026-10-05T09:11:06.354Z","file":"C:\\\\Temp\\\\roadbook-update.jsonl","event":"apply-finish","label":"config","command":"fake-installer.mjs,github:Aparencia/RoadBook","exitCode":0,"timedOut":false,"before":"0.4.0","after":"0.4.0","error":"","outputTail":"done\\n"}';
const UPDATE_FAKE_CHECK = '{"time":"2026-10-05T09:11:06.333Z","file":"C:\\\\Temp\\\\roadbook-update.jsonl","event":"check","state":"update-available","reason":"version","installed":"0.4.0","latest":"9.9.9","elapsedMs":0,"manifestUrl":"https://raw.githubusercontent.com/Aparencia/RoadBook/main/package.json"}';
const UPDATE_REAL_CHECK = '{"time":"2026-10-05T09:48:05.584Z","file":"C:\\\\Temp\\\\roadbook-update.jsonl","event":"check","state":"up-to-date","reason":"same-version","installed":"0.4.0","latest":"0.4.0","commitCheck":"unknown","elapsedMs":1247,"transport":"system-ca","manifestUrl":"https://raw.githubusercontent.com/Aparencia/RoadBook/main/package.json"}';
const UPDATE_ROUTE = '{"time":"2026-10-05T09:11:06.326Z","file":"C:\\\\Temp\\\\roadbook-update.jsonl","event":"route","state":"registered","paths":["/roadbook/update/status","/roadbook/update/apply"]}';

const lines = (...rows) => `${rows.join('\n')}\n`;
const repeat = (line, times) => Array.from({ length: times }, () => line);

// ── parseJsonl ─────────────────────────────────────────────────────────────

test('parseJsonl：坏行只计数不抛（半行写入是宿主被杀的常态，不该把整份读数判成读不到）', () => {
  const { records, badLines } = parseJsonl('{"event":"loaded"}\n\n这不是 JSON\n{"event":"banner"}\n123\n');
  assert.equal(records.length, 2);
  assert.equal(badLines, 2);
  assert.equal(records[0].event, 'loaded');
});

test('parseJsonl：空输入与 CRLF 都能处理', () => {
  assert.deepEqual(parseJsonl(undefined), { records: [], badLines: 0 });
  assert.equal(parseJsonl('{"a":1}\r\n{"a":2}\r\n').records.length, 2);
});

// ── classifyArm（三态）────────────────────────────────────────────────────

test('classifyArm：显式 arm 优先，其次是实测的测试痕量标记', () => {
  assert.equal(classifyArm({ arm: 'test', command: 'pnpm add github:x/y' }), 'suspect');
  assert.equal(classifyArm({ arm: 'prod', command: 'fake-installer.mjs' }), 'prod', '显式声明必须压过启发式');
  assert.equal(classifyArm(JSON.parse(UPDATE_FAKE_APPLY_START)), 'suspect', 'fake- 命令前缀是本机实测的噪声形状');
  assert.equal(classifyArm(JSON.parse(UPDATE_FAKE_CHECK)), 'suspect', 'latest=9.9.9 是哨兵版本');
  assert.equal(classifyArm(JSON.parse(UPDATE_REAL_CHECK)), 'prod', '真记录不带任何测试标记');
  assert.equal(classifyArm(JSON.parse(AUTOLOAD_SKIP)), 'prod');
  assert.equal(classifyArm(null), 'unknown');
  assert.equal(classifyArm('字符串不是记录'), 'unknown');
});

// ── summarize* ─────────────────────────────────────────────────────────────

test('summarizeAutoload：事件、banner 状态、skip 原因、臂分布四项都要出数', () => {
  const { records } = parseJsonl(lines(AUTOLOAD_LOADED, AUTOLOAD_BANNER, AUTOLOAD_BANNER, AUTOLOAD_SKIP, AUTOLOAD_INJECT, AUTOLOAD_CARD_READ));
  const summary = summarizeAutoload(records);
  assert.equal(summary.total, 6);
  assert.equal(summary.loaded, 1);
  assert.equal(summary.inject, 1);
  assert.equal(summary.cardRead, 1);
  assert.equal(summary.bannerStates.unavailable, 2);
  assert.equal(summary.skipReasons.subagent, 1);
  assert.equal(summary.arms.prod, 6);
});

test('summarizeUpdate：applyFailures 只算真记录，测试噪声不许算进真故障', () => {
  const { records } = parseJsonl(lines(UPDATE_FAKE_APPLY_START, UPDATE_FAKE_APPLY_FINISH, UPDATE_FAKE_CHECK, UPDATE_REAL_CHECK, UPDATE_ROUTE));
  const summary = summarizeUpdate(records);
  assert.equal(summary.applyStart, 1);
  assert.equal(summary.applyFinish, 1);
  assert.equal(summary.applyFailures, 0, 'fake 记录 exitCode=0 且是 suspect，不该进真故障计数');
  assert.equal(summary.arms.suspect, 3);
  assert.equal(summary.lastCheck.state, 'up-to-date');
});

test('summarizeUpdate：真失败的 apply 要算进去（否则这一路等于没有告警）', () => {
  const realFail = '{"time":"2026-10-05T09:20:00.000Z","event":"apply-finish","command":"node pnpm.mjs add github:Aparencia/RoadBook","exitCode":1,"timedOut":false,"error":"ERR"}';
  const summary = summarizeUpdate(parseJsonl(lines(realFail)).records);
  assert.equal(summary.applyFailures, 1);
});

// ── evaluateSignals：逐条信号的边界 ─────────────────────────────────────────

/** 一份「全绿」输入：8 次 loaded、有注入、banner 全注册、树干净、两个 audit 都 0。 */
function healthyInput(extraAutoload = []) {
  return {
    autoload: { text: lines(...repeat(AUTOLOAD_LOADED, 8), AUTOLOAD_INJECT, AUTOLOAD_INJECT, AUTOLOAD_BANNER, ...extraAutoload) },
    update: { text: lines(UPDATE_REAL_CHECK) },
    git: { porcelainLines: 0 },
    audits: { rules: { code: 0 }, route: { code: 0 } },
    evolve: [],
    now: Date.parse('2026-10-05T14:00:00.000Z'),
  };
}

const verdictOf = (result, id) => result.signals.find((s) => s.id === id).verdict;

test('S1 观测臂污染：有测试痕量就 hit，且读数写成 suspect/total', () => {
  // autoload 侧留空，好让读数只反映 update 这三条（否则 healthyInput 自带的那 11 条会进分母）
  const dirty = evaluateSignals({ ...healthyInput(), autoload: { text: '' }, update: { text: lines(UPDATE_FAKE_APPLY_START, UPDATE_FAKE_CHECK, UPDATE_REAL_CHECK) } });
  const s1 = dirty.signals.find((s) => s.id === 'S1');
  assert.equal(s1.verdict, 'hit');
  assert.equal(s1.reading, '2/3');
  assert.ok(s1.detail.includes('测试痕量'));
});

test('S2 注入活性：loaded 够多且一次没注入 = hit（本机的真实处境）', () => {
  const input = healthyInput();
  input.autoload.text = lines(...repeat(AUTOLOAD_LOADED, 35), ...repeat(AUTOLOAD_BANNER, 33));
  const result = evaluateSignals(input);
  assert.equal(verdictOf(result, 'S2'), 'hit');
  assert.equal(result.signals.find((s) => s.id === 'S2').reading, '0/35');
});

test('S2：样本不足判 unknown，不许判「有病」也不许判「健康」', () => {
  const input = healthyInput();
  input.autoload.text = lines(...repeat(AUTOLOAD_LOADED, MIN_LOADED_SAMPLE - 1));
  const result = evaluateSignals(input);
  assert.equal(verdictOf(result, 'S2'), 'unknown');
  assert.ok(result.signals.find((s) => s.id === 'S2').detail.includes('样本不足'));
});

test('S3 banner 可用率：注册率低于阈值即 hit（本机 4/33 = 12%）', () => {
  const input = healthyInput();
  input.autoload.text = lines(AUTOLOAD_LOADED, ...repeat(AUTOLOAD_BANNER, 33));
  const result = evaluateSignals(input);
  const states = result.autoload.bannerStates;
  assert.equal(states.unavailable, 33);
  assert.equal(verdictOf(result, 'S3'), 'hit');
});

test('S3：注册率达标则 ok；一条 banner 都没有则 unknown', () => {
  const input = healthyInput();
  input.autoload.text = lines(AUTOLOAD_LOADED, AUTOLOAD_BANNER, AUTOLOAD_BANNER.replace('unavailable', 'registered'));
  const ok = evaluateSignals(input);
  assert.equal(verdictOf(ok, 'S3'), 'ok');

  const none = evaluateSignals({ ...healthyInput(), autoload: { text: lines(AUTOLOAD_LOADED) } });
  assert.equal(verdictOf(none, 'S3'), 'unknown');
});

test('S4 工作树：脏树 hit，行数即读数', () => {
  const dirty = evaluateSignals({ ...healthyInput(), git: { porcelainLines: 46 } });
  assert.equal(verdictOf(dirty, 'S4'), 'hit');
  assert.equal(dirty.signals.find((s) => s.id === 'S4').reading, '46');
  assert.equal(verdictOf(evaluateSignals(healthyInput()), 'S4'), 'ok');
});

test('S5/S6：复用既有 CLI 的退出码——0 判绿、非 0 判红、跑不起来判 unknown', () => {
  const green = evaluateSignals(healthyInput());
  assert.equal(verdictOf(green, 'S5'), 'ok');
  assert.equal(verdictOf(green, 'S6'), 'ok');

  const red = evaluateSignals({ ...healthyInput(), audits: { rules: { code: 1 }, route: { code: 0 } } });
  assert.equal(verdictOf(red, 'S5'), 'hit');
  assert.equal(verdictOf(red, 'S6'), 'ok');

  const broken = evaluateSignals({ ...healthyInput(), audits: { rules: { error: 'spawn EPERM' }, route: { code: 0 } } });
  assert.equal(verdictOf(broken, 'S5'), 'unknown');
});

test('【核心不变量】读不到一律 unknown —— 六条信号没有一条会把「缺失」显示成 ok', () => {
  const blind = evaluateSignals({ autoload: { error: 'ENOENT' }, update: { error: 'ENOENT' }, git: { error: 'not a repo' }, audits: { rules: { error: 'no node' }, route: { error: 'no node' } } });
  assert.equal(blind.signals.length, SIGNALS.length);
  for (const s of blind.signals) {
    assert.equal(s.verdict, 'unknown', `${s.id} 在输入缺失时必须判 unknown，实际 ${s.verdict}`);
    assert.equal(s.reading, null, `${s.id} 没有读数时 reading 必须是 null，不许写成 0`);
  }
  const counts = tally(blind.signals);
  assert.equal(counts.ok, 0);
  assert.equal(counts.unknown, SIGNALS.length);
});

test('【核心不变量】空输入不得被读成「一切正常」', () => {
  const empty = evaluateSignals({});
  assert.equal(tally(empty.signals).ok, 0, '没有任何输入时，ok 必须是 0');
  assert.equal(tally(empty.signals).unknown, SIGNALS.length);
});

// ── 自身活性 ───────────────────────────────────────────────────────────────

test('自身活性：有新鲜 tick = ok，超期 = hit，没有 tick = unknown（静默死亡检测）', () => {
  const now = Date.parse('2026-10-05T14:00:00.000Z');
  const fresh = summarizeEvolve([{ event: 'tick', time: '2026-10-05T13:30:00.000Z' }], now);
  assert.equal(fresh.verdict, 'ok');
  assert.equal(fresh.ageMinutes, 30);

  const stale = summarizeEvolve([{ event: 'tick', time: '2026-10-03T13:30:00.000Z' }], now);
  assert.equal(stale.verdict, 'hit');
  assert.ok(stale.ageMinutes > STALE_TICK_HOURS * 60);

  assert.equal(summarizeEvolve([], now).verdict, 'unknown');
  assert.equal(summarizeEvolve([{ event: 'tick', time: '不是时间' }], now).verdict, 'unknown');
});

test('tally：三态分开计数，hit + ok + unknown = total', () => {
  const result = evaluateSignals(healthyInput());
  const counts = tally(result.signals);
  assert.equal(counts.total, SIGNALS.length);
  assert.equal(counts.hit + counts.ok + counts.unknown, counts.total);
});

test('阈值常量与 README 口径一致（改常量时这里会提醒同步文档）', () => {
  assert.equal(MIN_LOADED_SAMPLE, 10);
  assert.equal(BANNER_OK_RATIO, 0.5);
  assert.equal(STALE_TICK_HOURS, 48);
  assert.deepEqual(SIGNALS.map((s) => s.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
});
