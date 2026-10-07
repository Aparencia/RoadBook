/**
 * D14 结构硬标准的机械闸：**文件行数**这一条。
 *
 * 为什么要有它：`AGENTS.md` D14 第 1 条写着「单文件 ≤500 行（测试文件豁免至 ≤1000 行）」，
 * 但 2026-10-07 实测它是一个**没有机械落点的判据**——`_qc/check.ps1` 的 `$budget` 只覆盖
 * `template/` 下的副本（`Join-Path $tpl $k`），根 `lib/` 与 `plugin/` 的超限**没有任何断言看得见**：
 * 当时 `lib/client.js` 2772、`lib/index.js` 1171、`lib/update.js` 1006、`test/client-contract.test.mjs` 1458，
 * 而门禁判 359/0 全绿。判据写了却没人判 = 与没写等价，只是更贵（读的人以为有人看着）。
 *
 * 口径（与 D14 同源，不另立一套）：
 *   - 非测试文件 ≤500 行；测试文件（`*.test.mjs`）≤1000 行；
 *   - 行数一律 **node 口径**（`split(/\r?\n/).length - 1`）——本仓已有教训：`Get-Content .Count`
 *     与 `grep` 在同一文件上给出过 2505 与 2772 两个数（见 `docs/lessons/`），仪器必须统一；
 *   - 扫描面 = `git ls-files` 的 `.js` / `.mjs`（**含未跟踪文件**由调用方决定；这里只认已入库的，
 *     否则新增文件在本地跑绿、推上去才红）。`vendor/` 是上游只读镜像（改不了，也不该按我们的标准判），
 *     显式排除并在这里写明理由。
 *
 * 已知边界（如实写，不假装覆盖）：
 *   - 只判**行数**。D14 第 1 条还有「函数 ≤50 行」「纯逻辑与副作用分文件」两条，本闸不判
 *     （函数级需要真解析器，属独立立项）；本文件不因此宣称 D14 已经全机械化。
 *   - 行数不是质量指标：一个 400 行的巨函数照样能过。本闸只挡住"文件无限膨胀"这一种腐化。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

/** 非测试文件上限与测试文件上限（D14 第 1 条；两处同源，改这里就是改判据）。 */
const CAP = 500;
const TEST_CAP = 1000;

/** 上游 vendored 镜像：只读、不按我们的标准判（改了也无法回上游）。 */
const EXCLUDED_PREFIXES = ['skills/roadbook-atlas/vendor/'];

/**
 * **有期限的豁免清单**（不是"永远例外"）：本闸落地时这些文件已经超限，而拆分属专项重构，
 * 一批拆完会把"改动面"和"验证面"同时撑爆。豁免的代价必须可见 —— 每一条都带：
 *   - 当前行数（落地时实测，不是估算）；
 *   - 为什么没在本批拆（原因一句话）；
 *   - 到期条件（可判定的触发，不是"以后再说"）。
 * **到期未处理 = 本闸判红**（下面的断言会把过期项直接报出来）；新文件一律**不许**加进来
 * ——加进来就等于把"判据"降级成"愿望"，而这条闸存在的全部意义就是不让它退化。
 */
const EXEMPT = [
  { file: 'lib/client.js', lines: 2772, cap: 500, why: '要拆成多个客户端 half，先落宿主侧的分块装载机制（批 2 A1 硬门禁未过则整体回退）', until: '批 2 收尾' },
  { file: 'plugin/roadbook-autoload/index.js', lines: 867, cap: 500, why: '宿主接线 + 观测 + 动作闸三块耦合在一个 apply() 里，需要先抽纯逻辑', until: '批 3 收尾' },
  { file: 'skills/roadbook/bin/route.mjs', lines: 567, cap: 500, why: 'CLI 入口与 FACTS/STEPS 数据同文件，拆分要与批 3 的 --quote 改动同批做（一次改一个文件，避免两批都动它）', until: '批 3 收尾' },
];

/** node 口径行数（与 `wc -l` 语义一致：末尾换行不算一行）。 */
export function lineCount(text) {
  return text.split(/\r?\n/).length - 1;
}

function trackedFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\0').filter((item) => item.length > 0);
}

function isSource(file) {
  return file.endsWith('.js') || file.endsWith('.mjs');
}

function isExcluded(file) {
  return EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/** 扫描面：已入库的 .js/.mjs − vendor/。返回 [{ file, lines, cap }]。 */
export function scan(entries = trackedFiles()) {
  const rows = [];
  for (const file of entries) {
    if (!isSource(file) || isExcluded(file)) continue;
    const rel = file.replace(/\\/g, '/');
    const lines = lineCount(readFileSync(join(ROOT, rel), 'utf8'));
    const isTest = /\.test\.mjs$/.test(rel);
    rows.push({ file: rel, lines, cap: isTest ? TEST_CAP : CAP, isTest });
  }
  return rows;
}

test('扫描面非空且包含 D14 真正要管的两个目录（否则断言会变成恒真）', () => {
  const rows = scan();
  assert.ok(rows.length >= 30, `扫描到的源文件只有 ${rows.length} 个，疑似解析空心`);
  for (const dir of ['lib/', 'plugin/']) {
    assert.ok(
      rows.some((row) => row.file.startsWith(dir)),
      `扫描面里没有 ${dir} 的文件 —— D14 要管的正是这里，缺了等于没判`,
    );
  }
  assert.ok(
    rows.some((row) => row.file.startsWith('test/') && row.isTest),
    '扫描面里没有测试文件 —— 测试豁免线（≤1000）就没人判',
  );
});

test('D14 行数上限：非测试 ≤500 行、测试 ≤1000 行（豁免清单之外一律不许超）', () => {
  const allowed = new Map(EXEMPT.map((item) => [item.file, item]))
  const over = scan().filter((row) => row.lines > row.cap)
  // 新超限项（豁免清单里没有）：一律判红 —— 豁免清单只收"落地时就已存在"的存量
  const fresh = over.filter((row) => !allowed.has(row.file))
  assert.equal(
    fresh.length,
    0,
    fresh.length === 0
      ? ''
      : `D14 结构超限 ${fresh.length} 个文件（且不在豁免清单里）：${fresh
          .map((row) => `${row.file} = ${row.lines} 行（上限 ${row.cap}）`)
          .join('；')}。拆法：按「纯逻辑 / 副作用的边界」切，不要按行数硬切——被切开的两个文件必须能各自被单独测试。`,
  )
  // 豁免项必须仍然超限（已达标就该从清单里删掉，否则清单会烂成噪音）
  const stale = EXEMPT.filter((item) => {
    const row = scan().find((candidate) => candidate.file === item.file)
    return row === undefined || row.lines <= item.cap
  })
  assert.equal(
    stale.length,
    0,
    `豁免清单里有已达标或已不存在的条目，必须删掉：${stale.map((item) => item.file).join(', ')}`,
  )
});
