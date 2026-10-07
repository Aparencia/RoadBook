// **一次性迁移脚本（2026-10-03 卡号重编批）**：跑完即弃，不是常规入口；留档是为了留住"当时按什么映射改的"。
// D11 对零入边文件的三选一走**补登记**（`docs/registry/COMPONENTS.md` 的「一次性脚本」行）；本条标注是 TD-004 的清偿物。
// 迁移补漏：卡片 H1 标题里的旧两位数卡号（`# 卡 10 · 名称` 形态）
// 背景：renumber-2026-10-03.mjs 的规则要求「数字紧跟卡名」，而 H1 是「卡 <号> · <名>」，
//       数字后是分隔符而非卡名，因此 21 张迁移卡的 H1 全部漏改（0-1 已手工修正）。
// 本脚本只改每个 playbook/*.md 的第 1 行，且只改 `# 卡 <旧号> ·` 前缀。
// 幂等：新号形态 `# 卡 1-1 ·` 不匹配 `^# 卡 \d\d ·`，重复执行无副作用。
// 有意不改写：_qc/audit-2026-10-03.md（历史证据）、_qc/migrations/*（映射留痕）、
//             design/v6-design.md §9/§10 历史行（`> 2026-` 与 `N. ✅`）。

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MAP = {
  '10': '1-1', '11': '1-2', '12': '1-3',
  '20': '2-1', '21': '2-2',
  '22': '3-1',
  '23': '4-1', '24': '4-2', '25': '4-3',
  '30': '6-2', '31': '6-3', '32': '6-4',
  '40': '5-1', '41': '5-2', '42': '6-5', '43': '6-6',
  '50': '7-1', '51': '7-2', '52': '7-3', '53': '7-4',
};

const dir = 'playbook';
let changed = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
  const p = join(dir, f);
  const text = readFileSync(p, 'utf8');
  const lines = text.split(/\r?\n/);
  const m = /^# 卡 (\d{2}) ·/.exec(lines[0] ?? '');
  if (!m) continue;
  const to = MAP[m[1]];
  if (!to) continue;
  lines[0] = lines[0].replace(`# 卡 ${m[1]} ·`, `# 卡 ${to} ·`);
  writeFileSync(p, lines.join('\n'), 'utf8');
  console.log(`${p}: ${m[1]} -> ${to}`);
  changed++;
}
console.log(`H1 修正完成：${changed} 个文件`);
