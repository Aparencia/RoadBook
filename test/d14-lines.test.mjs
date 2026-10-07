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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * 在临时 git 仓里真跑一次 `gate.ps1`，返回 { status, out }；仓里只有一个基线提交。
 *
 * `docMap` 给了就写进**基线提交**（TD-024：⑥ 现在要读 `DOC_MAP.json` 的 `sourceLimits`）——
 * 放进基线而不是改动清单，是为了让每一档保持单变量：`DOC_MAP.json` 自己不进 ⑥ 的行数段、
 * 也不进 ⑤ 的越界判定。
 *
 * `lines` 默认 = `PROBE_LINES`（行数段的探针要够长才碰得到阈值）；⑧ 的探针要的是**小**文件
 * （600 行的 `.js` 会同时触发 ⑥ 判红，那就不是单变量实验了）。
 *
 * ⑧ 的规则面另有两条探针（见文件末 TD-026 那条）：`@($null).Count` 在 PowerShell 里是 **1**，
 * 缺 `rules` 键曾让 ⑧ 拿 `$null` 当一条规则判（`[string]$null` = 空串、空正则匹配一切）⇒
 * 任何新增文件都被判假红「文档义务未履行 []」，而那条红字连规则 id 都印不出来。
 */
function runGateOn(files, { docMap, lines = PROBE_LINES } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-gate-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=probe', '-c', 'user.email=probe@local', ...args], {
        encoding: 'utf8',
      });
    git('init', '-q', '.');
    copyFileSync(GATE_PS1, join(dir, 'gate.ps1'));
    writeFileSync(join(dir, 'README.md'), '# probe\n');
    if (docMap !== undefined) writeFileSync(join(dir, 'DOC_MAP.json'), `${JSON.stringify(docMap, null, 2)}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', 'baseline');
    for (const file of files) {
      const body = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n');
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

/**
 * ⑥ 的**项目自声明**（TD-024）：同一个文件两套上限。
 *
 * `_qc/check.ps1` 自己写着 `$selfCap = 985`（并有 `design §8` 与它同源），而 ⑥ 按 D14 判它 500
 * ⇒ 任何碰 `_qc/` 的批次**必然假红**，只剩「悄悄调大 `-LineLimit`」一条路 —— 正是 TD-021 判定
 * 最贵的那个后果。判据对象过滤（TD-021 的那一刀）救不了这一档：`_qc/check.ps1` **是**源码，
 * 只是它的上限不是 500 —— 所以这里认的是**项目自己的声明**（`DOC_MAP.json` 的 `sourceLimits`），
 * 没声明才回落到 D14 默认值。
 *
 * 四档缺一档都证明不了「声明被真的读了」：
 *   ① 600 行 `.ps1` + 声明 900 → 绿，且打出 `[声明]`（读到了声明；豁免不许静默）
 *   ② 同一文件声明 550 → 红，且阈值逐字是 **550**（不是 500）—— 「读声明值」与「有声明就免」的分界
 *   ③ 声明表为空 → 红在 **500** —— 声明面是负向的：没点名 ≠ 豁免
 *   ④ 声明**收紧**到 400 → 红在 **400** —— 声明不只是用来放宽的（只放宽时的实现会漏这一档）
 */
test('gate.ps1 ⑥ 认项目自己的源码行数声明（DOC_MAP.json 的 sourceLimits，缺省仍按 D14）', () => {
  const docMapOf = (cap) => ({ schema: 'roadbook-docmap/1', rules: [], sourceLimits: { files: { 'big.ps1': cap } } });

  const looser = runGateOn(['big.ps1'], { docMap: docMapOf(900) });
  assert.match(looser.out, /变更 1 个文件/, `探针文件没进变更清单 ⇒ 这一档是假绿：\n${looser.out}`);
  assert.match(looser.out, /\[声明\] ⑥ 行数上限取自/, `读了项目声明却不说出来 —— 豁免不许静默：\n${looser.out}`);
  assert.equal(looser.status, 0, `600 行的 .ps1 被项目声明成 900 就必须判绿（否则碰 _qc/ 的批次照旧假红）：\n${looser.out}`);

  const tighter = runGateOn(['big.ps1'], { docMap: docMapOf(550) });
  assert.equal(tighter.status, 1, `声明 550 而文件 600 行必须判红：\n${tighter.out}`);
  assert.match(tighter.out, /行数超限：big\.ps1 共 600 行 > 上限 550/, `阈值必须来自声明值：500 = 声明没被读，任何数都红 = 「有声明就免」：\n${tighter.out}`);

  const undeclared = runGateOn(['big.ps1'], { docMap: { schema: 'roadbook-docmap/1', rules: [], sourceLimits: { files: {} } } });
  assert.equal(undeclared.status, 1, `没点名就必须按 D14 的 ${CAP} 判红：\n${undeclared.out}`);
  assert.match(undeclared.out, new RegExp(`行数超限：big\\.ps1 共 600 行 > 上限 ${CAP}`), undeclared.out);

  const lowered = runGateOn(['big.ps1'], { docMap: docMapOf(400) });
  assert.equal(lowered.status, 1, `声明收紧到 400 时 600 行必须判红：\n${lowered.out}`);
  assert.match(lowered.out, /上限 400/, `阈值要跟着声明走（只放宽的实现会把这一档判成绿）：\n${lowered.out}`);
});

/**
 * `sourceLimits` 的**同源断言**：声明不许成为第二处真相。
 *
 * 这一条的存在理由与 A1c / A1d 同款：`_qc/check.ps1` 的上限已经写在它自己的 `$selfCap` 里
 * （且与 `design §8` 由既有断言锁死），`DOC_MAP.json` 那条是**抄进去给 ⑥ 读的** ⇒ 两处必须同号，
 * 否则改一处忘一处，⑥ 就按一个没人维护的数字判红/判绿。放在测试里而不是 `_qc/check.ps1` 上，
 * 沿用上一批的裁决（⑥ 会把 974 行的 `_qc/check.ps1` 判成源码超限 —— 那个裁决的翻案条件正是本批）：
 * 现在 ⑥ 认声明了，断言放哪都能跑；但两处**都跑**（`_qc/check.ps1` 的整套件 glob 会跑到本文件），
 * 所以不再搬回母版体检里制造第三处真相。
 */
test('DOC_MAP.json 的 sourceLimits 与文件自己的声明同源（母版那条 = `_qc/check.ps1` 的 $selfCap）', () => {
  const rootMap = JSON.parse(readFileSync(join(ROOT, 'DOC_MAP.json'), 'utf8'));
  const entries = Object.entries(rootMap.sourceLimits?.files ?? {});
  assert.ok(entries.length >= 1, '根 DOC_MAP.json 的 sourceLimits 是空的 —— 那 TD-024 的假红原样还在（本条会退化成恒真）');

  const tracked = new Set(trackedFiles().map((item) => item.replace(/\\/g, '/')));
  for (const [file, cap] of entries) {
    assert.ok(tracked.has(file), `sourceLimits 点名的 ${file} 不在 git 索引里（幽灵声明 = 白拿豁免）`);
    assert.match(file, /\.(js|mjs|ts|ps1)$/, `sourceLimits 只用于源码（${file}）—— 文档的上限走 docLimits / 项目侧预算表`);
    assert.ok(Number.isInteger(cap) && cap > 0, `${file} 的上限必须是正整数，实得 ${JSON.stringify(cap)}`);
  }

  const ck = readFileSync(join(ROOT, '_qc/check.ps1'), 'utf8');
  const self = /^\s*\$selfCap\s*=\s*(\d+)/m.exec(ck);
  assert.ok(self, '没从 `_qc/check.ps1` 抓到 `$selfCap`（正则或文件结构变了 ⇒ 本条会退化成恒真）');
  assert.equal(
    rootMap.sourceLimits.files['_qc/check.ps1'],
    Number(self[1]),
    `sourceLimits 那条必须等于文件自己的 $selfCap：两处不一致 = 上限出现第二处真相（改一处忘一处，⑥ 就按没人维护的数字判）`,
  );

  const tpl = JSON.parse(readFileSync(join(ROOT, 'template', 'DOC_MAP.json'), 'utf8'));
  assert.ok(tpl.sourceLimits?.files, 'template/DOC_MAP.json 没有 sourceLimits 段：这套机制没下发给生成出来的项目');
  assert.deepEqual(Object.keys(tpl.sourceLimits.files), [], '模板种子里不许预置源码豁免（空表 = 照 D14 判，要放宽必须先让文件自己声明）');
});

/**
 * ⑧ 的**规则面**（TD-026）：`DOC_MAP.json` 缺 `rules` 键 = "没有可判的规则"，不许拿 `$null` 当一条规则。
 *
 * 旧写法 `foreach ($rule in @($map.rules))` 的死法：`@($null).Count` 是 **1** ⇒ `$rule` = `$null` ⇒
 * `[string]$null` = 空串（≠ `new-line`）⇒ 池子回落到「本批新增文件」，而 `$_ -match ''` **匹配一切**
 * ⇒ 任何新增文件都被判假红「文档义务未履行 []」——方括号里连规则 id 都没有，也没提 `rules` 键。
 * 假红是本仓判定最贵的后果（TD-021）：它会训练人绕过判据。
 *
 * 三档缺一档都证明不了「⑧ 还在判」：① 缺 `rules` 键 → 绿 + 黄字点名根因 ② `rules: []` → 同上
 * ③ 有一条真规则且命中 → **红**（没有这一档，前两档的"绿"可能只是 ⑧ 整段死了）。
 */
test('gate.ps1 ⑧：缺 rules 键 = 没有可判规则（黄字点名根因），有规则且命中 = 照样红', () => {
  const missing = runGateOn(['small.js'], { docMap: { schema: 'roadbook-docmap/1' }, lines: 1 });
  assert.doesNotMatch(missing.out, /文档义务未履行/, `把 $null 当规则判了（TD-026 的假红原样还在）：\n${missing.out}`);
  assert.equal(missing.status, 0, `缺 rules 键不是判红的理由（没有规则可判 = 黄字 + 退出 0）：\n${missing.out}`);
  assert.match(missing.out, /rules/, `缺 rules 键要说出来 —— 旧版死在一条指不出根因的红项上：\n${missing.out}`);
  assert.match(missing.out, /变更 1 个文件/, `探针文件没进变更清单 ⇒ 这一档是假绿：\n${missing.out}`);

  const empty = runGateOn(['small.js'], { docMap: { schema: 'roadbook-docmap/1', rules: [] }, lines: 1 });
  assert.equal(empty.status, 0, `空规则表与缺键同口径（不许一条都不判却判红）：\n${empty.out}`);
  assert.match(empty.out, /rules/, `空规则表同样要点名：\n${empty.out}`);

  const hit = runGateOn(['small.js'], { docMap: { schema: 'roadbook-docmap/1', rules: [{ id: 'probe-rule', source: 'added-file', pattern: '.+', docs: ['docs/registry/COMPONENTS.md'] }] }, lines: 1 });
  assert.equal(hit.status, 1, `有规则且命中时必须红 —— 没有这一档，前两档的绿可能只是 ⑧ 整段没跑：\n${hit.out}`);
  assert.match(hit.out, /文档义务未履行 \[probe-rule\]/, `红项要点名是哪条规则：\n${hit.out}`);
});

/**
 * `orphans.ps1` ④ 规则的**误报边界**（TD-025）：明确写了未来时的路径不是幽灵，同样的路径写在现在时句子里必须报出来。
 *
 * 为什么这一条必须**真跑扫描器**：TD-025 的症状是"一条明确写了未来时的句子被当成幽灵"，代价不是噪音
 * ——它反过来训练人改文案去迁就工具的词表（TD-025 当天就是这么被绕过去的：补一个「待建」了事）。
 * 断言源码里有某个词证明不了这件事（本仓对 `gate.ps1` 的探针判据同款：字符串断言只能证明代码里有那个词）。
 *
 * 探针在一个**临时 git 仓**里跑真扫描器，目录里只有：`README.md`（进当前态文档面）+ 空的 `lib/`
 * （首段目录必须在盘上，否则命中跳过规则 ⑤，就不是单变量实验了）+ `lib/keep.txt`（让仓非空）。
 * 两档缺一档都不是判据：① 未来时句子 → 0 项，**且**汇总行打印标记词分布（跳过不静默）
 * ② 现在时的同一条路径 → **1 项**（没有这一档，"0 项"可能只是扫描器整段死了）。
 */
const ORPHANS_PS1 = join(ROOT, 'orphans.ps1');

/** 在临时 git 仓里真跑一次 `orphans.ps1`（它按 cwd 定 root，所以不必复制脚本本体）。 */
function runOrphansOn(rootReadme) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-orphans-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=probe', '-c', 'user.email=probe@local', ...args], {
        encoding: 'utf8',
      });
    git('init', '-q', '.');
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib', 'keep.txt'), 'placeholder\n');
    writeFileSync(join(dir, 'README.md'), rootReadme);
    git('add', '-A');
    git('commit', '-q', '-m', 'baseline');
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ORPHANS_PS1], {
      cwd: dir,
      encoding: 'utf8',
    });
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test('orphans.ps1 ④：未来时的路径不提成幽灵（且跳过不静默），现在时的同一条路径必须报出来', () => {
  const future = runOrphansOn('# 探针\n\n批 2 的 `lib/session.js`（排期在下一批）还没落地。\n');
  assert.match(
    future.out,
    /文档幽灵 0 项（另跳过 [1-9]\d* 处）/,
    `未来时的句子被报成幽灵（TD-025 的误报原样还在）：\n${future.out}`,
  );
  assert.match(
    future.out,
    /历史或规划行 \d+ 处（[^）]*×\d+/,
    `跳过了却不说被哪个标记词跳过 —— 跳过不静默才看得出词表收错：\n${future.out}`,
  );
  assert.equal(future.status, 0, `扫描器"只报不拦"：有跳过不是红：\n${future.out}`);

  const present = runOrphansOn('# 探针\n\n本批落地 `lib/session.js`（已提交）。\n');
  assert.match(
    present.out,
    /\[文档幽灵\] lib\/session\.js/,
    `现在时的同一条路径必须报出来（否则上面那条"0 项"是假绿）：\n${present.out}`,
  );
});
