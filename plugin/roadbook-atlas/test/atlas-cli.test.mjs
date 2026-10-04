/**
 * atlas CLI 的行为测试（端到端，真跑渲染）。
 *
 * 这个 CLI 是 agent 唯一该走的生成入口，所以它的**退出码纪律**比输出文案重要：
 *   0 = 成功 / 1 = 渲染或校验失败、环境缺件 / 2 = 用法错误
 * 另外钉住一条真实踩过的坑：本机 `%TEMP%` 里存在一个游离的 `.git`，`git rev-parse
 * --show-toplevel` 在任何临时子目录都会返回 `%TEMP%`；如果 CLI 直接信它，图纸会被写到
 * 项目外。测试在临时目录里跑 `new`，断言产物落在**当前目录**下。
 *
 * 用一个真实的 5 类渲染（architecture）验证回执，其余类型由 render-smoke 覆盖。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const CLI = path.join(PLUGIN_ROOT, 'skills', 'roadbook-atlas', 'bin', 'atlas.mjs');

function run(args, cwd) {
    return spawnSync(process.execPath, [CLI, ...args], { cwd: cwd || PLUGIN_ROOT, encoding: 'utf8' });
}

test('doctor：渲染器在位、退出码 0', () => {
    const result = run(['doctor']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /渲染器\s+在位 · archify/);
    assert.match(result.stdout, /vendored doctor 退出码 0/);
});

test('new + render：产物落在当前目录（%TEMP% 的游离 .git 不许把根提到项目外）', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-test-'));
    try {
        const created = run(['new', 'architecture', 'demo', '--title', 'CLI 测试图'], workDir);
        assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
        const specPath = path.join(workDir, 'docs', 'diagrams', 'demo.atlas.json');
        // 这一条就是陷阱的回归守卫：旧实现（直接信 git rev-parse）会写到 %TEMP%/docs/diagrams，
        // 于是下面的 existsSync(cwd/docs/diagrams/...) 必然为假。
        assert.ok(fs.existsSync(specPath), `规格应落在 cwd 下：${specPath}`);

        const rendered = run(['render', 'docs/diagrams/demo.atlas.json'], workDir);
        assert.equal(rendered.status, 0, `${rendered.stdout}\n${rendered.stderr}`);
        const htmlPath = path.join(workDir, 'docs', 'diagrams', 'demo.html');
        const receiptPath = path.join(workDir, 'docs', 'diagrams', 'demo.receipt.json');
        assert.ok(fs.existsSync(htmlPath), '应产出 HTML');
        assert.ok(fs.statSync(htmlPath).size > 100 * 1024, 'HTML 应大于 100 KB（真渲染而非空壳）');
        assert.ok(fs.existsSync(receiptPath), '应产出回执');

        const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        assert.equal(receipt.schema, 'roadbook-atlas/receipt@1');
        assert.equal(receipt.ok, true);
        assert.equal(receipt.type, 'architecture');
        assert.equal(receipt.quality, 'showcase');
        assert.equal(receipt.validation.errors, 0);
        assert.equal(receipt.validation.checksPassed, receipt.validation.checkCount);
        assert.equal(receipt.renderer.kind, 'vendored');
        assert.equal(receipt.artifact.bytes, fs.statSync(htmlPath).size);
        assert.match(receipt.spec.sha256, /^[0-9a-f]{64}$/);
        assert.match(receipt.artifact.sha256, /^[0-9a-f]{64}$/);

        const listed = run(['list', '--json'], workDir);
        assert.equal(listed.status, 0, listed.stderr);
        const catalog = JSON.parse(listed.stdout);
        assert.equal(catalog.items.length, 1);
        assert.equal(catalog.items[0].slug, 'demo');
        assert.equal(catalog.items[0].status, 'ready');
        assert.equal(catalog.items[0].type, 'architecture');
        assert.equal(catalog.items[0].hasReceipt, true);
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
});

test('失败路径：缺规格 exit 1 且不写回执；未知命令 exit 2；重复 new exit 2', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-fail-'));
    try {
        const missing = run(['render', 'docs/diagrams/nope.atlas.json'], workDir);
        assert.equal(missing.status, 1, '规格不存在应是 1（失败），不是 2（用法错误）');
        assert.ok(!fs.existsSync(path.join(workDir, 'docs', 'diagrams', 'nope.receipt.json')), '失败不许留回执');

        const unknown = run(['frobnicate'], workDir);
        assert.equal(unknown.status, 2);
        assert.match(unknown.stdout + unknown.stderr, /Usage/);

        assert.equal(run(['new', 'workflow', 'twice'], workDir).status, 0);
        assert.equal(run(['new', 'workflow', 'twice'], workDir).status, 2, '重复 new 不许覆盖已有规格');
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
});
