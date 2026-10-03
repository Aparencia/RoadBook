// _qc/migrations/renumber-2026-10-03.mjs
// 迁移留痕：Roadbook V6 卡号从「两位序号」重编为「阶段-行为序号」（x-x-xxx）。
// 用法（母版根）：node _qc/migrations/renumber-2026-10-03.mjs
//
// 本脚本只做「引用重写」，不搬文件。文件搬家由下列 git mv 完成（一步一卡，可回滚）：
//   git mv playbook/00-驱动卡.md        playbook/0-1-驱动卡.md
//   git mv playbook/10-想法调研.md       playbook/1-1-想法调研.md
//   ... (21 条，见 MAP)
//
// 不处理：_qc/audit-*.md（历史审计报告，记录当时的文件名与行号）、本目录（迁移留痕）、
//        design/v6-design.md 的历史节（§9 修订 / §10 带 ✅ 的历史条目 —— 历史不改写）。

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();

// 旧两位序号 → 新「阶段-行为序号」；第二位 = 卡名
const MAP = [
  ['00-驱动卡',       '0-1-驱动卡'],
  ['10-想法调研',     '1-1-想法调研'],
  ['11-选型初始化',   '1-2-选型初始化'],
  ['12-接入已有项目', '1-3-接入已有项目'],
  ['20-功能调研',     '2-1-功能调研'],
  ['21-需求范围',     '2-2-需求范围'],
  ['22-设计',         '3-1-设计'],
  ['23-分批编码',     '4-1-分批编码'],
  ['24-代码审查',     '4-2-代码审查'],
  ['25-验证',         '4-3-验证'],
  ['30-根因分析',     '6-2-根因分析'],
  ['31-修复',         '6-3-修复'],
  ['32-回归验证',     '6-4-回归验证'],
  ['40-归档',         '5-1-归档'],
  ['41-发布',         '5-2-发布'],
  ['42-复盘',         '6-5-复盘'],
  ['43-流程体检',     '6-6-流程体检'],
  ['50-UI改动',       '7-1-UI改动'],
  ['51-依赖升级',     '7-2-依赖升级'],
  ['52-技术债清偿',   '7-3-技术债清偿'],
  ['53-功能下线',     '7-4-功能下线'],
];

const NUM = new Map(MAP.map(([o, n]) => [o.slice(0, 2), n.split('-').slice(0, 2).join('-')]));
const SKIP_DIR = new Set(['.git', 'node_modules', '_archive']);
const SKIP_FILE = [/^_qc[\\/]audit-/, /^_qc[\\/]migrations[\\/]/, /^_qc[\\/]migrations$/];
const EXTS = new Set(['.md', '.ps1', '.mjs', '.js', '.json', '.yml', '.yaml', '.txt']);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      out.push(...walk(join(dir, e.name)));
    } else if (EXTS.has(extname(e.name))) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

// design/v6-design.md 的历史节不改写：§9 的「> 2026-… 修订」引用块 + §10 的「N. ✅ …」历史条目
function isHistoryLine(rel, line) {
  if (rel !== 'design/v6-design.md') return false;
  return /^>\s*2026-/.test(line) || /^\d+\.\s*✅/.test(line);
}

function rewrite(text, isCheckPs1) {
  let t = text;
  for (const [oldName, newName] of MAP) {
    const oldNum = oldName.slice(0, 2);
    const newNum = NUM.get(oldNum);
    const rest = oldName.slice(3); // 卡名（去两位序号与连字符）

    // 1) 路径形态
    t = t.split(`playbook/${oldName}.md`).join(`playbook/${newName}.md`);
    t = t.split(`playbook\\${oldName}.md`).join(`playbook\\${newName}.md`);
    t = t.split(`playbook/${oldName}`).join(`playbook/${newName}`);

    // 2) 带引号的裸卡名（check.ps1 的清单数组、豁免表、映射表键）
    t = t.split(`'${oldName}'`).join(`'${newName}'`);
    t = t.split(`"${oldName}"`).join(`"${newName}"`);
    t = t.split(`"${oldName}.md"`).join(`"${newName}.md"`);

    // 3) 正文形态「12 接入已有项目」（无连字符）
    t = t.split(`${oldNum} ${rest}`).join(`${newNum} ${rest}`);

    // 3b) 裸连字符形态（无 playbook/ 前缀、无引号）：「00-驱动卡」「20-功能调研卡」
    t = t.split(`${oldName}卡`).join(`${newName}卡`);
    t = t.replace(new RegExp(`(?<![\\w-])${oldNum}-${rest}`, 'g'), `${newNum}-${rest}`);

    // 4) 提交信息前缀  git commit -m "23 …
    t = t.split(`-m "${oldNum} `).join(`-m "${newNum} `);
  }

  // 5) 正文形态「23 卡」「见 22 / 23 / 24 卡」「40 卡归档」
  t = t.replace(/(?<![\d-])(\d{2}(?:\s*\/\s*\d{2})*)(\s*卡)/g, (m, run, tail) => {
    const parts = run.split(/\s*\/\s*/).map((n) => (NUM.has(n) ? NUM.get(n) : n));
    return parts.join(' / ') + tail;
  });

  // 6) check.ps1 的 $commitCards 值（提交信息卡号前缀）
  if (isCheckPs1) t = t.replace(/= '(\d{2})';/g, (m, n) => (NUM.has(n) ? `= '${NUM.get(n)}';` : m));

  // 7)「11 号卡」→「1-2 号卡」
  t = t.replace(/(?<![\d-])(\d{2})(\s*号卡)/g, (m, n, tail) => (NUM.has(n) ? NUM.get(n) + tail : m));

  // 8)「24 审查卡」——卡名被简写。仅当简写确实是该卡正式名的后缀时才改写，防止误伤（如「40 张卡」）
  t = t.replace(/(?<![\d-])(\d{2})\s+([\u4e00-\u9fa5]{1,4})卡/g, (m, n, abbr) => {
    const hit = MAP.find(([o]) => o.slice(0, 2) === n && o.slice(3).endsWith(abbr));
    return hit ? `${NUM.get(n)} ${hit[0].slice(3)}卡` : m;
  });

  return t;
}

let changed = 0;
const report = [];
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (SKIP_FILE.some((re) => re.test(rel))) continue;
  const raw = readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const kept = lines.map((l) => (isHistoryLine(rel, l) ? l : rewrite(l, rel === '_qc/check.ps1')));
  const next = kept.join('\n');
  if (next !== raw) {
    writeFileSync(abs, next, 'utf8');
    const n = lines.reduce((a, l, i) => a + (l === kept[i] ? 0 : 1), 0);
    changed++;
    report.push(`${rel}  (${n} 行)`);
  }
}
console.log(`重写文件 ${changed} 个：`);
for (const r of report) console.log('  ' + r);
