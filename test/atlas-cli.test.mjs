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

test('仪器故障：渲染器起不来时退出码 1 **且说出原因**，不许只报退出码', () => {
    // 确定性制造 spawnSync 的 error：把一个**不存在**的目录当 --root，spawn 的 cwd 就非法。
    // 不依赖沙箱、不依赖平台。旧实现把 status:null 压成 1 并丢掉 error.code，于是这里只会得到
    // {"ok":false,"raw":""} 与空 stderr —— 分不清「规格不过」与「渲染器根本没起来」，
    // 而 doctor 会报一句无原因的「vendored doctor 退出码 1」，把人引去查渲染器是不是缺文件。
    const spec = path.join(PLUGIN_ROOT, 'skills', 'roadbook-atlas', 'vendor', 'archify', 'examples', 'web-app.architecture.json');
    const bogusRoot = path.join(os.tmpdir(), `atlas-no-such-root-${process.pid}`);
    assert.ok(!fs.existsSync(bogusRoot), '前置条件：这个根必须不存在');

    const result = run(['validate', spec, '--root', bogusRoot, '--json']);
    assert.equal(result.status, 1, '起不来的仪器不许判绿');
    assert.match(result.stderr, /渲染器进程起不来/, '必须说出是仪器起不来');
    assert.match(result.stderr, /环境问题，不是规格问题/, '必须点明该往哪查');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.spawnError, 'ENOENT', '真相要进 JSON，机器消费者才分得清两类失败');
});

test('越界路径：--root 指到图纸目录之外时，回执写**绝对路径**而不是截断后的错路径', () => {
    // 旧实现是 resolve(target).slice(resolve(root).length)：target 不在 root 前缀下时会切出一个
    // 谁也对不上的相对路径并写进回执 —— 比报错更难查。判据：回执里的路径必须**指向真实文件**。
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-outside-'));
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-otherroot-'));
    try {
        assert.equal(run(['new', 'architecture', 'outside', '--title', '越界测试'], workDir).status, 0);
        const specPath = path.join(workDir, 'docs', 'diagrams', 'outside.atlas.json');
        const rendered = run(['render', specPath, '--root', otherRoot], workDir);
        assert.equal(rendered.status, 0, `${rendered.stdout}\n${rendered.stderr}`);

        const receipt = JSON.parse(fs.readFileSync(path.join(workDir, 'docs', 'diagrams', 'outside.receipt.json'), 'utf8'));
        assert.ok(path.isAbsolute(receipt.spec.path), `越界时必须是绝对路径，实际拿到 ${receipt.spec.path}`);
        assert.equal(receipt.spec.path, specPath);
        assert.ok(fs.existsSync(receipt.spec.path), '回执里的路径必须指向真实文件');
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
        fs.rmSync(otherRoot, { recursive: true, force: true });
    }
});
