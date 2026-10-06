/**
 * 供应商记录必须**可核对**，不是一份声明。
 *
 * 为什么需要它（2026-10-06 实测）：`skills/roadbook-atlas/vendor/archify/VENDOR-PROVENANCE.md`
 * 自带 57 行逐文件 SHA-256 表 + 一个全树聚合值，但此前**没有任何测试读过它**（test/ 里 `archify`
 * 的命中全是路径与注释）。后果两条：
 *   ① 汇总数悄悄过期 —— 总数把记录文件自身按旧尺寸（14 471 B）计入，而它已经长到 17 584 B；
 *   ② 聚合哈希无法复现 —— 文档只写 "sorted lines"，而 `sort` 在 UTF-8 locale 下是字典序，
 *      同一批文件换个 locale 就是另一个值（三种排序 × 四种行格式共 12 种组合实测全不符）。
 * 现在把它变成判据：逐文件比字节数与哈希、两个方向都比文件集合、按**写明口径**复算聚合值、
 * 并校验记录自己的汇总算术（上游 62 − 排除数 = 派生文件数）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../skills/roadbook-atlas/vendor/archify/', import.meta.url));
const RECORD = 'VENDOR-PROVENANCE.md';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const toPosix = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(toPosix(path.relative(ROOT, full)));
    }
    return out;
}

const record = fs.readFileSync(path.join(ROOT, RECORD), 'utf8');
/** 逐文件表行：| `path` | bytes | `sha256` |（汇总表是四列、排除表没有哈希，都不会命中）。 */
const tableRows = new Map();
for (const m of record.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([\d\s\u00a0\u202f]+)\s*\|\s*`([0-9a-f]{64})`\s*\|$/gm)) {
    tableRows.set(m[1], { bytes: Number(m[2].replace(/\s/g, '')), sha256: m[3] });
}
const diskFiles = walk(ROOT).filter((f) => f !== RECORD);

test('逐文件表：每个文件的字节数与 SHA-256 都与磁盘一致，且两个方向都没有孤儿', () => {
    assert.ok(tableRows.size > 50, `逐文件表应覆盖整棵树，实际只解析出 ${tableRows.size} 行`);

    const mismatched = [];
    for (const [file, row] of tableRows) {
        const full = path.join(ROOT, file);
        if (!fs.existsSync(full)) {
            mismatched.push(`${file}: 清单里有、磁盘上没有`);
            continue;
        }
        const buf = fs.readFileSync(full);
        if (buf.length !== row.bytes) mismatched.push(`${file}: 字节数 磁盘=${buf.length} 清单=${row.bytes}`);
        const actual = sha256(buf);
        if (actual !== row.sha256) mismatched.push(`${file}: sha256 磁盘=${actual} 清单=${row.sha256}`);
    }
    assert.deepEqual(mismatched, [], `清单与磁盘不一致：\n${mismatched.join('\n')}`);

    const notInTable = diskFiles.filter((f) => !tableRows.has(f));
    assert.deepEqual(notInTable, [], `磁盘上有文件不在清单里（未登记的 vendor 内容）：${notInTable.join(', ')}`);
});

test('全树聚合值可按记录写明的口径复现（字节序排序 + `<sha>␠␠<路径>` + 末尾一个换行）', () => {
    const declared = /(?:^|\n)\s*(?:Whole-tree aggregate[\s\S]{0,400}?=\s*`([0-9a-f]{64})`)/.exec(record);
    assert.ok(declared, '记录里找不到全树聚合值');
    const lines = [...diskFiles]
        .sort()
        .map((f) => `${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
    const computed = sha256(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
    assert.equal(computed, declared[1], '聚合值对不上：要么树被改过，要么记录里的口径与代码不一致');
});

test('汇总算术自洽：上游文件数 − 排除表行数 = 声明的派生文件数；声明字节数 = 逐文件表求和', () => {
    const upstream = /Upstream `skills\/archify\/` is (\d+) files/.exec(record);
    assert.ok(upstream, '记录里找不到上游文件数');
    const excludedRows = [...record.matchAll(/^\|\s*`examples\/[^`]+\.html`\s*\|\s*[\d\s\u00a0\u202f]+\s*\|/gm)].length;
    const derived = /(\d+) upstream-derived files/.exec(record);
    assert.ok(derived, '记录里找不到「upstream-derived files」声明');
    assert.equal(
        Number(upstream[1]) - excludedRows,
        Number(derived[1]),
        `算术不成立：上游 ${upstream[1]} − 排除 ${excludedRows} ≠ 派生 ${derived[1]}（4/5 之争就是这么来的）`,
    );

    const bytesDeclared = /upstream-derived files,\s*([\d\s\u00a0\u202f]+)\s*bytes/.exec(record);
    assert.ok(bytesDeclared, '记录里找不到派生文件的字节总数');
    const sum = [...tableRows.values()].reduce((n, row) => n + row.bytes, 0);
    assert.equal(
        Number(bytesDeclared[1].replace(/\s/g, '')),
        sum,
        '汇总字节数与逐文件表求和对不上（自指数字过期就是这种形态）',
    );
});
