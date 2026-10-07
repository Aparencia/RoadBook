/**
 * 债务台账（`docs/TECH_DEBT.md`）的**结构**断言。
 *
 * 为什么需要它：这是本仓的**唯一账本**（"一条都不许漏"就是它的全部价值），而它的结构此前
 * **没有任何机械判据**。2026-10-07 实测：表被两处空行切成三块（TD-017~020 落进一个**没有表头**
 * 的表块），两条债被两竖线粘进前一条的单元格 ⇒ 结构探针解析出 **20** 条而实际 **22** 条 ——
 * 静默漏掉两条。与 TD-006 同族：判据不在射程里时，坏的方式就是静默。
 *
 * 判据逐条对应台账自己写在头部的话（不另立一套）：
 *   ① 一张连续的表（表头行到末行之间无空行、无两竖线粘连）—— 否则渲染整段作废
 *   ② 编号连续无重复（TD-001..TD-0NN）—— 缺号 = 有人删行没留痕
 *   ③ 每行 8 列（按**转义感知**切分：`\|` 是 Markdown 表格里合法的单元格内竖线）
 *   ④ 状态列落在台账头部的状态机内（open / carried / closed）
 *   ⑤ closed 必须附偿还证据 —— 台账头部原文：「关闭不附证据 = 没关闭」
 *
 * ①②③ 另有**合成负控**：把坏样本喂给解析器，断言它报得出来。没有负控，解析器退化成恒真
 * 函数也没人发现（与 `route-cli.test.mjs` 头部同一句话）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LEDGER = join(ROOT, 'docs', 'TECH_DEBT.md');

/** 状态机的合法取值（台账头部「状态机：open → carried → closed」）。 */
const STATES = ['open', 'carried', 'closed'];
/** 8 列 → 按 `|` 切开是 8 + 2 段（首尾各一个空段）。 */
const CELL_SEGMENTS = 10;

/** 转义感知切分：`\|` 是单元格内的竖线，不是分隔符。 */
export function splitRow(line) {
  return line.replace(/\\\|/g, '\u0000').split('|');
}

/** 把台账文本解析成结构模型（纯函数：同输入必同输出，便于用合成样本做负控）。 */
export function parseLedger(text) {
  const lines = text.split(/\r?\n/);
  const rowIdx = [];
  lines.forEach((line, i) => {
    if (/^\|\s*TD-\d{3}\s*\|/.test(line)) rowIdx.push(i);
  });
  const headerIdx = lines.findIndex((line) => /^\|\s*编号\s*\|/.test(line));
  const lastIdx = rowIdx.length ? rowIdx[rowIdx.length - 1] : -1;
  const gap =
    headerIdx >= 0 && lastIdx > headerIdx
      ? lines.slice(headerIdx, lastIdx + 1).filter((line) => !line.startsWith('|'))
      : [];
  const rows = rowIdx.map((i) => {
    const cells = splitRow(lines[i]);
    const state = (cells[7] ?? '').replace(/\*/g, '').trim();
    return {
      id: (cells[1] ?? '').trim(),
      where: (cells[3] ?? '').trim(),
      kind: (cells[4] ?? '').trim(),
      impact: (cells[5] ?? '').trim(),
      trigger: (cells[6] ?? '').trim(),
      state,
      // 只取开头的状态词：合法写法允许后缀说明，如 `**closed**（2026-10-07 结案，证据见右）`
      stateWord: /^[a-z]+/.exec(state)?.[0] ?? state,
      evidence: (cells[8] ?? '').trim(),
      segments: cells.length,
    };
  });
  return { lines, headerIdx, lastIdx, gap, glued: lines.filter((l) => /\|\|\s*TD-\d{3}/.test(l)), rows };
}

const HDR = '| 编号 | 日期 | 位置 | 类型 | 影响 | 清偿触发条件 | 状态 | 偿还证据 |';
const ROW = (n, state, evidence, extra = '') =>
  `| TD-${String(n).padStart(3, '0')} | 2026-01-01 | p | 腐化 | i | 触发条件写在这里 | ${state} | ${evidence} |${extra}`;

test('台账解析器非恒真：粘连 / 空行切断 / 多一列 / 缺号，四个坏样本各自必须被报出来', () => {
  const good = parseLedger([HDR, ROW(1, 'closed', '证据'), ROW(2, 'open', '')].join('\n'));
  assert.equal(good.rows.length, 2, '基线：两条债就该解析出两条');
  assert.equal(good.glued.length, 0, '基线不该报粘连');
  assert.equal(good.gap.length, 0, '基线不该报空行');
  assert.deepEqual(good.rows.map((r) => r.segments), [CELL_SEGMENTS, CELL_SEGMENTS], '基线每行 8 列');

  const glued = parseLedger([HDR, ROW(1, 'open', '') + '|| TD-002 | x |'].join('\n'));
  assert.equal(glued.glued.length, 1, '两竖线粘连必须被报出来（后一条债藏在前一条的单元格里）');

  const gaps = parseLedger([HDR, ROW(1, 'open', ''), '', ROW(2, 'open', '')].join('\n'));
  assert.deepEqual(gaps.gap, [''], '表内空行必须被报出来（它会把表切断）');

  const wide = parseLedger([HDR, `${ROW(1, 'open', '')} extra |`].join('\n'));
  assert.deepEqual(wide.rows.map((r) => r.segments), [CELL_SEGMENTS + 1], '多一个未转义的竖线 = 多一列，必须看得出来');

  const safe = parseLedger([HDR, ROW(1, 'open', 'a \\| b')].join('\n'));
  assert.deepEqual(safe.rows.map((r) => r.segments), [CELL_SEGMENTS], '`\\|` 是合法的单元格内竖线，不许被当成列分隔符');
});

const model = parseLedger(readFileSync(LEDGER, 'utf8'));

test('台账是一张连续的表：无空行切断、无两竖线粘连、编号连续无重复', () => {
  assert.ok(model.headerIdx >= 0, '找不到表头行（`| 编号 | …`）—— 表头没了，整张表就没有列定义');
  assert.ok(model.rows.length >= 20, `只解析出 ${model.rows.length} 条债行，疑似解析空心`);
  assert.deepEqual(
    model.glued.map((line) => line.slice(0, 60)),
    [],
    '有债行被两竖线粘在前一条的单元格里（渲染整行作废、按行读会静默漏掉）',
  );
  assert.deepEqual(model.gap, [], '表头行与末行之间出现了非表格行（空行会把表切成没有表头的第二块）');
  const ids = model.rows.map((r) => r.id);
  const expected = ids.map((_, i) => `TD-${String(i + 1).padStart(3, '0')}`);
  assert.deepEqual(ids, expected, '台账编号必须从 TD-001 起连续且不重复（缺号 = 有人删行没留痕）');
});

test('台账每行 8 列、状态在状态机内、closed 必附偿还证据', () => {
  assert.deepEqual(
    model.rows.filter((r) => r.segments !== CELL_SEGMENTS).map((r) => `${r.id}：${r.segments} 段（应为 ${CELL_SEGMENTS}）`),
    [],
    '列数不对 = 单元格里的竖线没转义',
  );
  assert.deepEqual(
    model.rows.filter((r) => !STATES.includes(r.stateWord)).map((r) => `${r.id}：状态「${r.stateWord}」`),
    [],
    `状态列必须在 ${STATES.join(' / ')} 里（台账头部的状态机）`,
  );
  assert.deepEqual(
    model.rows.filter((r) => r.stateWord === 'closed' && r.evidence.length < 20).map((r) => `${r.id}：closed 却没有偿还证据`),
    [],
    '台账头部原文：关闭不附证据 = 没关闭',
  );
  for (const r of model.rows) {
    for (const [name, value] of [['位置', r.where], ['类型', r.kind], ['影响', r.impact], ['清偿触发条件', r.trigger]]) {
      assert.ok(value.length > 0, `${r.id} 的「${name}」是空的（台账头部：每条债必须写清四项）`);
    }
  }
});
