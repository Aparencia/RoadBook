/**
 * 规则索引（`rules/rules.json`）的机械审计。
 *
 * 这一层存在的理由：硬规则原先散在 `template/AGENTS.md`（宪法）、`skills/roadbook/SKILL.md`（铁律）、
 * `playbook/0-1-驱动卡.md`（硬规则）三处，靠人读发现不了「只在一边存在」。
 * `skills/roadbook/bin/rules.mjs --audit` 把索引拉直检查，本文件钉住它**真的会红**。
 *
 * 断言分两类（缺第二类就是装饰）：
 *   - 正向：当前索引必须判绿；
 *   - **反向对照**：故意改坏一份副本，审计必须报出对应问题。
 *     没有反向对照，`auditRules` 退化成恒真的空函数也没人发现。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRules, loadRules } from '../skills/roadbook/bin/rules.mjs';

const { data } = loadRules();
const clone = () => JSON.parse(JSON.stringify(data));
/** 取第一条 A 类规则（不可委托）——这类必须带机械判定。 */
const firstOfClass = (source, cls) => source.rules.find((rule) => rule.class === cls);

test('当前规则索引判绿：标识唯一、分类与判定钩子匹配、落点与命令引用都在磁盘上、触发词无冲突', () => {
  assert.deepEqual(auditRules(data), [], '索引自身不自洽（跑 node skills/roadbook/bin/rules.mjs --audit 看逐条）');
});

test('索引规模与四分类都不空：规则唯一化之后不该只剩一类', () => {
  assert.ok(data.rules.length >= 30, `规则条数 ${data.rules.length} 少于 30：要么真删了规则，要么索引被截断`);
  for (const cls of ['A', 'B', 'C', 'D']) {
    const count = data.rules.filter((rule) => rule.class === cls).length;
    assert.ok(count > 0, `${cls} 类为空：分类是为了分派机械后果，空类说明分类没落地`);
  }
});

test('反向对照 ①：A 类规则被摘掉判定钩子必须判红（否则"必须有机械后果"是空话）', () => {
  const broken = clone();
  const target = firstOfClass(broken, 'A');
  target.judge = { kind: 'none' };
  const problems = auditRules(broken);
  assert.ok(
    problems.some((line) => line.includes(target.id) && line.includes('必须有机械判定')),
    `摘掉 ${target.id} 的判定钩子后审计仍判绿，问题清单：${JSON.stringify(problems)}`,
  );
});

test('反向对照 ②：D 类规则挂上机械判定必须判红（有机械后果就不该归 D）', () => {
  const broken = clone();
  const target = firstOfClass(broken, 'D');
  target.judge = { kind: 'command', cmd: 'git status --porcelain', status: 'existing' };
  const problems = auditRules(broken);
  assert.ok(
    problems.some((line) => line.includes(target.id) && line.includes('不该有机械判定')),
    `给 ${target.id} 挂上判定后仍判绿，问题清单：${JSON.stringify(problems)}`,
  );
});

test('反向对照 ③：id 重复必须判红（重复 id 会让台账与证据对不上号）', () => {
  const broken = clone();
  broken.rules[1].id = broken.rules[0].id;
  broken.rules[1].class = broken.rules[0].class;
  const problems = auditRules(broken);
  assert.ok(problems.some((line) => line.includes('id 重复')), `重复 id 未被报出：${JSON.stringify(problems)}`);
});

test('反向对照 ④：触发词撞车必须判红（契约要求一个分支只留一个触发词）', () => {
  const broken = clone();
  broken.rules[1].trigger = [...broken.rules[0].trigger];
  const problems = auditRules(broken);
  assert.ok(problems.some((line) => line.includes('同时占用')), `触发词撞车未被报出：${JSON.stringify(problems)}`);
});

test('反向对照 ⑤：落点指向不存在的文件必须判红（幽灵引用 = 索引在骗人）', () => {
  const broken = clone();
  broken.rules[0].renderedIn = ['template/不存在的文件.md'];
  const problems = auditRules(broken);
  assert.ok(problems.some((line) => line.includes('不存在')), `幽灵落点未被报出：${JSON.stringify(problems)}`);
});

test('反向对照 ⑥：planned 判定不写落点阶段必须判红（不许写成"以后再说"）', () => {
  const broken = clone();
  const target = broken.rules.find((rule) => rule.judge?.status === 'planned');
  assert.ok(target, '索引里应当至少有一条 planned 判定（动作闸 / 状态校验等尚未落地的机械后果）');
  delete target.judge.phase;
  const problems = auditRules(broken);
  assert.ok(
    problems.some((line) => line.includes(target.id) && line.includes('phase')),
    `planned 缺 phase 未被报出：${JSON.stringify(problems)}`,
  );
});
