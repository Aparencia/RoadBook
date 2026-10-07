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
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  { file: 'lib/client.js', lines: 2528, cap: 500, why: '分块机制（#55）已落：自进化整段 412 行已搬进 lib/client-evolve.js、装载器自增 164 行（核心 2772→2524，净减 248，不是早先误记的 2772→2359）；再把生产装载函数 loadChunk 挂进 __internals 供契约测试驱动（+4）⇒ 2528。余下 ≈2028 行（图册那半 + 两份文案表 + 详情页 + 更新条）等 #56 真机硬门禁过了再搬', until: '批 2 收尾' },
  // 2026-10-07 批 6 收尾删除一条：`plugin/roadbook-autoload/index.js` 867 → 67 行（拆成入口 + 六个
  // `autoload-*.js` 分层件，导出面 5 名逐名一致、插件套件 94/94），到期项已偿清 —— 清单里留着它
  // 就是"已达标条目"，会被下面第三条断言判红。
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
  // 豁免清单里的行数**必须等于这次扫描出来的行数**：那条数字是一次声明，不是装饰。
  // 为什么加这一条：2026-10-07 实测发现 `lib/client.js` 被记成 2359、真实 2524（差 165），
  // 而上面两条断言都没红（2359 > 500 照样算"仍然超限"）—— 假数字于是写进了 STATE.md 与回执。
  // 判据里的数字只许来自命令输出：这条断言把当前真实值直接报出来，回写时照抄即可。
  const measured = new Map(scan().map((row) => [row.file, row.lines]))
  const drifted = EXEMPT.filter((item) => measured.has(item.file) && measured.get(item.file) !== item.lines)
  assert.deepEqual(
    drifted.map((item) => `${item.file}：清单记 ${item.lines} 行，实测 ${measured.get(item.file)} 行`),
    [],
    '豁免清单记录的行数与实测不符（这几个文件一改就要同批更新这个数，别让它烂成假账）',
  )
});

/**
 * D14 强制拆分件的登记表：`docs/registry/COMPONENTS.md`「归属批次」列里的 `D14 拆分自 <父路径>`。
 *
 * 它是 `check.ps1` 双计数器（台账 #4）剔除额度的唯一依据。剔除**不能只靠自述** —— 否则
 * "因 D14 被逼拆分"就成了万能免额条：新建一个文件、写一行标记、额度白拿。下面的完整性断言
 * 让这件事可证伪：拆分是否真的被逼，用**片之和 > 上限**来证明（片之和 ≤ 原文件 ⇒ 原文件必然超限）。
 */
export function splitRegistry() {
  const text = readFileSync(join(ROOT, 'docs/registry/COMPONENTS.md'), 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = /D14 拆分自\s+([^\s）|（]+)(（([^）]*)）)?/.exec(line);
    if (!marker) continue;
    const cell = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (!cell) continue;
    rows.push({ child: cell[1].trim(), parent: marker[1], note: marker[3] ?? '' });
  }
  return rows;
}

test('D14 强制拆分件登记完整性：剔除额度这件事必须可证伪（五条断言）', () => {
  const rows = splitRegistry();
  assert.ok(rows.length >= 10, `从 COMPONENTS.md 只解析出 ${rows.length} 条「D14 拆分自」登记，疑似解析空心`);
  const tracked = new Set(trackedFiles().map((item) => item.replace(/\\/g, '/')));
  const measured = new Map(scan().map((row) => [row.file, row]));
  const childNames = new Set(rows.map((row) => row.child));

  // ① 每片真实在库，且不许把自己写成父（自己拆自己 = 一行代码都没动）
  assert.deepEqual(
    rows.filter((row) => !tracked.has(row.child)).map((row) => row.child),
    [],
    '登记的拆分件不在 git 索引里（幽灵登记 = 白拿额度）',
  );
  assert.deepEqual(
    rows.filter((row) => row.child === row.parent).map((row) => row.child),
    [],
    '拆分件把自己写成父路径',
  );

  // ② 父路径的存在性必须与标注一致：在库却标"已删除"、或不在库又没标，都是对不上
  const badParent = rows
    .filter((row) => tracked.has(row.parent) === /已随拆分删除|已删除/.test(row.note))
    .map(
      (row) =>
        `${row.child} → ${row.parent}（实测父${tracked.has(row.parent) ? '在库' : '不在库'}，标注「${row.note || '无'}」）`,
    );
  assert.deepEqual(badParent, [], `父路径的存在性与标注对不上：${badParent.join('；')}`);

  // ③ 每片自己必须过 D14 上限 —— 拆分件存在的理由就是让每片都达标
  const fat = rows
    .filter((row) => measured.has(row.child) && measured.get(row.child).lines > measured.get(row.child).cap)
    .map((row) => `${row.child} = ${measured.get(row.child).lines} 行（上限 ${measured.get(row.child).cap}）`);
  assert.deepEqual(fat, [], `拆分件自己超限，那就不是为了满足 D14 才拆的：${fat.join('；')}`);

  // ④ 同一父的所有片（含父本体）之和 > 上限 —— 这条是豁免的**证明义务**
  const families = new Map();
  for (const row of rows) {
    if (!families.has(row.parent)) families.set(row.parent, []);
    families.get(row.parent).push(row.child);
  }
  const thin = [];
  for (const [parent, children] of families) {
    const cap = /\.test\.mjs$/.test(parent) || children.some((item) => /\.test\.mjs$/.test(item)) ? TEST_CAP : CAP;
    const total =
      children.reduce((sum, item) => sum + (measured.get(item)?.lines ?? 0), 0) + (measured.get(parent)?.lines ?? 0);
    if (total <= cap) thin.push(`${parent} 的全部片只有 ${total} 行（上限 ${cap}）—— 没超限就不需要拆，这几片不该占拆分额度`);
  }
  assert.deepEqual(thin, [], thin.join('；'));

  // ⑤ 不许套娃：父自己不能再是别人的拆分件（否则同一份体积可以被反复抵扣）
  const nested = rows
    .filter((row) => childNames.has(row.parent))
    .map((row) => `${row.child} → ${row.parent}（父自己也是拆分件）`);
  assert.deepEqual(nested, [], `拆分件不许再当父：${nested.join('；')}`);
});

/**
 * ⑥ 的**判据对象**（TD-021）：`gate.ps1` 的行数段只管**源码**，文档的行数交给 ⑨
 * （`DOC_MAP.json` 的 docLimits）与项目侧 `check.ps1` 的预算表。
 *
 * 为什么这条必须**真跑 gate.ps1**，而不是断言模板里的字符串：TD-021 的症状是"任何碰
 * `CHANGELOG.md` 的批次必然假红"—— 而 `CHANGELOG.md` 的真上限（700）写在 `_qc/check.ps1`
 * 的 `$budgetRoot` 里。字符串断言只能证明"代码里有某个词"，证明不了"600 行的 .md 不再红、
 * 600 行的 .js 照样红"。探针在临时 git 仓里跑 `template/gate.ps1`（**故意不放 DOC_MAP.json**：
 * 它的 `new-file` 规则模式是 `.+`，任何新增文件都会额外触发 ⑧ 的文档义务，那就不是单变量实验了）。
 *
 * 三档缺一档等于没判：① 600 行 `.md` → 0 ② 600 行 `.js` → 1 且点名文件与阈值
 * ③ 600 行 `.test.mjs` → 0（测试豁免线在 ⑥ 里仍然生效）。
 * 第 ① 档还额外断言 `变更 1 个文件` 与 `[跳过]`：**没有这两条，①可能是"文件根本没进 scope"的假绿**
 * —— 空变更清单也是 exit 0（只给黄字）。
 */
const GATE_PS1 = join(ROOT, 'template', 'gate.ps1');
const PROBE_LINES = 600;

/** 在临时 git 仓里真跑一次 `gate.ps1`，返回 { status, out }；仓里只有一个基线提交。 */
function runGateOn(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-gate-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=probe', '-c', 'user.email=probe@local', ...args], {
        encoding: 'utf8',
      });
    git('init', '-q', '.');
    copyFileSync(GATE_PS1, join(dir, 'gate.ps1'));
    writeFileSync(join(dir, 'README.md'), '# probe\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'baseline');
    for (const file of files) {
      const body = Array.from({ length: PROBE_LINES }, (_, i) => `line ${i + 1}`).join('\n');
      writeFileSync(join(dir, file), `${body}\n`);
    }
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', join(dir, 'gate.ps1'),
        '-Anchor', 'HEAD',
        '-ScopeFiles', files.join(','),
        '-RepoRoot', '.',
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test('gate.ps1 ⑥ 只管源码：600 行的 .md 判绿、600 行的 .js 判红、600 行的 .test.mjs 判绿', () => {
  const doc = runGateOn(['big.md']);
  assert.match(doc.out, /变更 1 个文件/, `探针文件没进变更清单 ⇒ 这一档是假绿：\n${doc.out}`);
  assert.match(doc.out, /\[跳过\] ⑥ 非源码/, `⑥ 跳过了文档却没说 —— 豁免不许静默：\n${doc.out}`);
  assert.doesNotMatch(doc.out, /行数超限/, `文档不该被 500 行阈值判红（真判据在 ⑨ 与项目侧预算表）：\n${doc.out}`);
  assert.equal(doc.status, 0, `600 行的 .md 必须判绿：\n${doc.out}`);

  const src = runGateOn(['big.js']);
  assert.equal(src.status, 1, `600 行的 .js 必须判红（D14 非测试上限 ${CAP}）：\n${src.out}`);
  assert.match(src.out, /行数超限：big\.js 共 600 行 > 上限 500/, `红项要点名文件与阈值：\n${src.out}`);

  const tst = runGateOn(['big.test.mjs']);
  assert.equal(tst.status, 0, `600 行的测试文件在豁免线（${TEST_CAP}）之下，必须判绿：\n${tst.out}`);
});
