// 一次性修补：迁移脚本漏网的「裸两位旧卡号」（23/24/25/30/31/32/40/43/50）
// 与 design §4 流程链不一致的「下一张」头部行。仅本轮执行一次，留痕用。
import { readFileSync, writeFileSync } from 'node:fs';

const RULES = [
  ['playbook/1-3-接入已有项目.md', [['跳过 50 UI 改动卡', '跳过 7-1 UI 改动卡']]],
  ['playbook/2-1-功能调研.md', [
    ['`S 档简版链：21（简版）→ 23 → 25 → 40`', '`S 档简版链：2-2（简版）→ 4-1 → 4-3 → 5-1`'],
    ['｜ 下一张：2-2 需求范围（方案与档位获用户确认后）', '｜ 下一张：2-2 需求范围（方案与档位获用户确认后；M/L 档需求仍模糊时先走 2-3 需求获取与用户研究）'],
  ]],
  ['playbook/2-2-需求范围.md', [
    ['下一张卡是 23（分批编码）', '下一张卡是 4-1（分批编码）'],
    ['没确认不许进入 23', '没确认不许进入 4-1'],
    ['未确认不得进入 23', '未确认不得进入 4-1'],
    ['｜ 下一张：4-1 分批编码（L 档先走 3-1 设计）', '｜ 下一张：2-4 非功能需求（M/L 档）；S 档 → 4-1 分批编码；L 档 2-4 后 → 3-1 设计'],
  ]],
  ['playbook/3-1-设计.md', [
    ['禁止设计未获人批准就进 23', '禁止设计未获人批准就进 4-1'],
    ['｜ 下一张：4-1 分批编码', '｜ 下一张：3-2 威胁建模（触碰红线域时）→ 3-3 测试策略 → 4-1 分批编码'],
  ]],
  ['playbook/4-1-分批编码.md', [
    ['S 档：23 绿灯后直接进 25（跳过 24）；M/L 档：24 绿灯且用户放行后进 25', 'S 档：4-1 绿灯后直接进 4-3（跳过 4-2）；M/L 档：4-2 绿灯且用户放行后进 4-3'],
    ['S 档：23 绿灯后直接进 25，跳过 24', 'S 档：4-1 绿灯后直接进 4-3，跳过 4-2'],
    ['进 24 审查做一次裁决', '进 4-2 审查做一次裁决'],
    ['走 24（一次审全部）', '走 4-2（一次审全部）'],
    ['仍走 24', '仍走 4-2'],
  ]],
  ['playbook/4-2-代码审查.md', [
    ['触发：23 绿灯后（', '触发：4-1 绿灯后（'],
    ['S 档：23 绿灯后直接进 25（跳过 24）；M/L 档：24 绿灯且用户放行后进 25', 'S 档：4-1 绿灯后直接进 4-3（跳过 4-2）；M/L 档：4-2 绿灯且用户放行后进 4-3'],
    ['红/黄则回 23 修复后', '红/黄则回 4-1 修复后'],
    ['红/黄回 23 修复', '红/黄回 4-1 修复'],
    ['修复回 23', '修复回 4-1'],
    ['回 23 修复', '回 4-1 修复'],
    ['"修复"回 23。', '"修复"回 4-1。'],
  ]],
  ['playbook/4-3-验证.md', [
    ['触发：23 绿灯后（', '触发：4-1 绿灯后（'],
    ['S 档：23 绿灯后直接进 25（跳过 24）；M/L 档：24 绿灯且用户放行后进 25', 'S 档：4-1 绿灯后直接进 4-3（跳过 4-2）；M/L 档：4-2 绿灯且用户放行后进 4-3'],
    ['S 档同样进 40', 'S 档同样进 5-1'],
  ]],
  ['playbook/5-1-归档.md', [
    ['触发：25/32 验收通过后', '触发：4-3/6-4 验收通过后'],
    ['若体检计数触发则以 43 为准', '若体检计数触发则以 6-6 为准'],
  ]],
  ['playbook/6-4-回归验证.md', [
    ['与 30/31 用同一个 slug', '与 6-2/6-3 用同一个 slug'],
    ['回 31 修，不许带病归档', '回 6-3 修，不许带病归档'],
  ]],
  ['playbook/6-5-复盘.md', [['下一张卡是 40（归档）', '下一张卡是 5-1（归档）']]],
  ['playbook/6-6-流程体检.md', [['下一张卡是 40（归档）', '下一张卡是 5-1（归档）']]],
  ['playbook/7-1-UI改动.md', [
    ['下一张卡是 40（归档）', '下一张卡是 5-1（归档）'],
    ['目检+check 即可，25 简化', '目检+check 即可，4-3 简化'],
  ]],
  ['playbook/7-2-依赖升级.md', [['下一张卡是 40（归档）', '下一张卡是 5-1（归档）']]],
  ['playbook/7-4-功能下线.md', [['下一张卡是 40（归档）', '下一张卡是 5-1（归档）']]],
  ['playbook_EN/6-4-regression-verification.md', [
    ['(the same slug as 30/31)', '(the same slug as 6-2/6-3)'],
    ['go back to 31 and fix', 'go back to 6-3 and fix'],
  ]],
  ['playbook_EN/2-1-feature-research.md', [
    ['| Next: 2-2 scope definition (after the user confirms the approach and tier)',
      '| Next: 2-2 scope definition (after the user confirms the approach and tier; for tiers M/L with unclear requirements, run 2-3 requirement elicitation first)'],
  ]],
  ['playbook_EN/2-2-scope-definition.md', [
    ['| Next: 4-1 batch coding (for tier L, go through 3-1 design first)',
      '| Next: 2-4 non-functional requirements (tiers M/L); tier S → 4-1 batch coding; tier L → 3-1 design after 2-4'],
  ]],
  ['playbook_EN/3-1-design.md', [
    ['｜ Next: 4-1 batch coding [disambiguated]',
      '｜ Next: 3-2 threat modeling (when touching a red-line domain) → 3-3 test strategy → 4-1 batch coding [disambiguated]'],
  ]],
];

let total = 0, bad = 0;
for (const [file, rules] of RULES) {
  let text = readFileSync(file, 'utf8');
  const applied = [];
  for (const [from, to] of rules) {
    const n = text.split(from).length - 1;
    if (n === 0) { console.log(`MISS ${file} :: ${from.slice(0, 40)}`); bad++; continue; }
    text = text.split(from).join(to);
    applied.push(`${n}x ${from.slice(0, 24)}`);
    total += n;
  }
  writeFileSync(file, text, 'utf8');
  console.log(`OK   ${file} :: ${applied.join(' | ')}`);
}
console.log(`\n替换总数 ${total}；未命中规则 ${bad}`);
process.exit(bad === 0 ? 0 : 1);
