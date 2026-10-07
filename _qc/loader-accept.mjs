#!/usr/bin/env node
/**
 * **寿命：一次性**（2026-10-05 真机根因批的验收仪器）—— 那次验收跑完即用完，留档只为复核"当时是怎么证的"，
 * 不是常规入口（常规入口是 `test/*.test.mjs`）。D11 对零入边文件的三选一走**补登记**：`docs/registry/COMPONENTS.md`
 * 那一行的四列写明用途与归属批次；本条标注是 TD-004 的清偿物（"一次性脚本与普通脚本无从区分"）。
 *
 * 真 Loader 验收：把 DSH 安装里那份**真的** `@deepseek-ai/cordis` 取出来当接收点，
 * 判客户端半（`lib/client.js`）的导出能不能被收成一个 **ACTIVE** 的 fiber。
 *
 * 为什么必须有它：`test/client-contract.test.mjs` 用的是假 React + 假 ctx。
 * 「顶层 `inject` 里写了服务 ⇒ 服务缺席时 fiber 恒为 PENDING ⇒ DSH 的 web boot
 * 把任一未激活条目判死 ⇒ 应用打不开」这类缺陷，在假 ctx 里**整套测试全绿**
 * —— 0.7.0 真机那次「应用无法启动或已意外停止」就是这么漏出去的。
 * 这一件仪器用的是真 cordis 的真接收点，跑一次就能把它钉住。
 *
 * 用法：
 *   node _qc/loader-accept.mjs [app.asar 路径]
 *   默认路径见 DEFAULT_ASAR，也可用环境变量 DSH_ASAR。
 * 退出码：0 = 通过，或**可见地**跳过（非 DSH 机器）；1 = 被真 Loader 拒收 / 起不来。
 * 判据三条：① 导出被 `ctx.plugin()` 收下；② 零服务下 fiber 走到 ACTIVE；③ 顶层 `inject` 为空。
 */
import { existsSync, mkdirSync, mkdtempSync, openSync, readSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ASAR = 'D:\\AISI\\Deepseek harness\\resources\\app.asar';
const asar = process.argv[2] ?? process.env.DSH_ASAR ?? DEFAULT_ASAR;

/** 真 cordis 及其运行期依赖（都在 asar 的 dsh/node_modules 下）。 */
const PACKAGES = [
    ['@deepseek-ai/cordis', ['package.json', 'lib/index.js']],
    ['@deepseek-ai/cosmokit', ['package.json', 'lib/index.js']],
    ['@deepseek-ai/schemastery', ['package.json', 'lib/index.cjs']],
    ['@standard-schema/spec', ['package.json', 'dist/index.js', 'dist/index.cjs']],
];

function skip(reason) {
    console.log(`[SKIP] 真 Loader 验收未运行：${reason}`);
    console.log('       （这是可见的跳过，不是通过 —— 假 ctx 覆盖不到顶层 inject 的语义）');
    process.exit(0);
}

if (!existsSync(asar)) skip(`找不到 DSH 的 app.asar：${asar}`);

/** 极简 asar 读取：头部 JSON 在 file[8 .. 8+size)，其前 4 字节是 JSON 串长；数据基址 = 8 + size。 */
function openAsar(path) {
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(16);
    readSync(fd, head, 0, 16, 0);
    const size = head.readUInt32LE(4);
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, 8);
    const text = buf.toString('utf8');
    const header = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return {
        fd,
        base: 8 + size,
        pick(entry) {
            let node = header;
            for (const part of entry.split('/')) {
                if (!part) continue;
                node = node.files?.[part];
                if (!node) return null;
            }
            return node.files ? null : node;
        },
        read(node) {
            const out = Buffer.alloc(node.size);
            readSync(fd, out, 0, node.size, this.base + Number(node.offset ?? 0));
            return out;
        },
    };
}

const archive = openAsar(asar);
const root = mkdtempSync(join(tmpdir(), 'roadbook-loader-accept-'));
for (const [pkg, files] of PACKAGES) {
    for (const file of files) {
        const node = archive.pick(`dsh/node_modules/${pkg}/${file}`);
        if (!node) continue;
        const dest = join(root, 'node_modules', pkg, file);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, archive.read(node));
    }
}
closeSync(archive.fd);

const cordisEntry = join(root, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js');
if (!existsSync(cordisEntry)) skip('asar 里没有 @deepseek-ai/cordis（不是 0.2.x 的桌面版？）');

const { Context } = await import(pathToFileURL(cordisEntry).href);
const STATE = { 0: 'PENDING', 1: 'LOADING', 2: 'ACTIVE', 3: 'FAILED', 4: 'DISPOSED', 5: 'UNLOADING' };

const fakeReact = {
    createElement: (...args) => ({ type: args[0], props: args[1] ?? {}, children: args.slice(2) }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    Fragment: 'Fragment',
};

let spec = null;
globalThis.window = { __ModuleLoader__: { load(value) { spec = value; } } };
globalThis.document = {
    createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {}, append() {}, remove() {}, addEventListener() {}, querySelectorAll: () => [] }),
    querySelectorAll: () => [],
    head: { appendChild() {} },
    title: '',
};

await import(pathToFileURL(join(process.cwd(), 'lib', 'client.js')).href);
if (!spec) {
    console.log('[FAIL] lib/client.js 没有调用 window.__ModuleLoader__.load');
    process.exit(1);
}

const failures = [];
if (spec.id !== 'roadbook') failures.push(`load id 必须是 "roadbook"，实际 ${JSON.stringify(spec.id)}`);

let exports_;
try {
    exports_ = spec.factory((name) => {
        if (name === 'react') return fakeReact;
        throw new Error(`意外的 require(${JSON.stringify(name)})`);
    });
} catch (error) {
    console.log(`[FAIL] factory(require) 抛错：${error?.message}`);
    process.exit(1);
}

const inject = Array.from(exports_.inject ?? []);
if (inject.length !== 0) {
    failures.push(`顶层 inject 必须为空数组，实际 ${JSON.stringify(inject)} —— 写进它的服务缺席/迟到时本行是 PENDING 或没有 fiber，DSH 会把整个应用判成打不开`);
}

const ctx = new Context();
let fiber = null;
try {
    fiber = ctx.plugin(exports_);
} catch (error) {
    failures.push(`真 cordis 拒收这份导出：${error?.constructor?.name}: ${error?.message}`);
}

if (fiber) {
    const settled = await Promise.race([
        fiber.await().then(() => true, () => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    console.log(`  真 cordis 4.x：ctx.plugin() 收下，state = ${STATE[fiber.state]}${settled ? '' : '（3s 内没有落定）'}`);
    if (fiber.state !== 2) {
        failures.push(`零服务下 fiber 必须走到 ACTIVE，实际 ${STATE[fiber.state]}${fiber.state === 0 ? ' —— 顶层 inject 里有服务在等，DSH 的 web boot 会判死整个应用' : ''}`);
    }
    try { await ctx.stop(); } catch { /* 收尾失败不影响判据 */ }
}

if (failures.length > 0) {
    console.log('[FAIL] 真 Loader 验收：');
    for (const line of failures) console.log(`  - ${line}`);
    process.exit(1);
}
console.log('[OK] 真 Loader 验收：顶层 inject 为空、导出被真 cordis 收下、零服务下 fiber 到 ACTIVE');
