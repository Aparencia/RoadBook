/**
 * 客户端分块的契约测试（2026-10-07，批 1 #55）。
 *
 * 分块这一层最容易「看着对、真机全坏」：路由 404、名字对不上、宿主件没挂上、脚本登记了却没人取 ——
 * 四种坏法在浏览器里都表现为**一片空白**，而本地三套测试照样全绿。所以这里把两头都钉住：
 *
 *   宿主半（lib/chunks.js）
 *     ① 名字白名单：路径穿越的四种写法（`../` / `%2e%2e` / 子路径 / 未登记名）一律 404；
 *     ② 目录固定：文件名只由白名单 + 固定前缀拼出，请求里没有任何一段能影响目录；
 *     ③ 同源守卫：与 /roadbook/update/* 同一条 trustedLocalRequest；
 *     ④ 缓存契约：content-type / cache-control: no-cache / ETag + 304 复验；
 *     ⑤ ETag 记忆化：文件没变不重算哈希（变了必须重算 —— 否则 HMR 永远看到旧分块）。
 *
 *   客户端半（lib/client.js 的装载器 + lib/client-<名>.js）
 *     ⑥ 两半的路由前缀**逐字一致**（各写一份常量，改了这处忘那处就是满屏 404）；
 *     ⑦ 磁盘上的分块文件 ⊆ 宿主白名单，且白名单里每个名字都真有文件（两个方向都要，缺一边就漏）；
 *     ⑧ 分块脚本自己登记工厂；核心经 `takeChunk` 走生产路径取导出表，且宿主件一个都不缺；
 *     ⑨ 边界组件：分块没到位渲染「加载中」，到位后渲染真组件（不是永远停在加载中）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CHUNK_CONTENT_TYPE,
    CHUNK_NAMES,
    CHUNK_ROUTE_PREFIX,
    chunkFileOf,
    chunkNameFromUrl,
    chunkNameOf,
    createChunkHandler,
    etagOf,
    registerChunkRoutes,
} from '../lib/chunks.js';
import { collectLabels, loadBundle, loadChunk } from './helpers/client-contract-harness.mjs';

const LIB_URL = new URL('../lib/', import.meta.url);

/** 假响应：只记状态码 / 头部 / body，够断言用。 */
function fakeResponse() {
    const state = { status: 0, headers: null, body: undefined, ended: false, endCount: 0 };
    return {
        state,
        writeHead(status, headers) {
            state.status = status;
            state.headers = headers || null;
        },
        end(body) {
            state.ended = true;
            state.endCount += 1;
            if (body !== undefined) state.body = body;
        },
    };
}

/** 一次请求 → 响应状态（fence 默认放行）。 */
async function call(handler, { url = '/roadbook/bundle/evolve.js', method = 'GET', headers = {} } = {}) {
    const response = fakeResponse();
    await handler({ url, method, headers }, response);
    return response.state;
}

// ── ① 名字白名单：四种穿越写法都必须挡住 ──────────────────────────────────────

test('分块名白名单：只认「登记过的小写名 .js」，路径穿越的写法一律不认', () => {
    assert.equal(chunkNameOf('/roadbook/bundle/evolve.js'), 'evolve');
    // 白名单外的合法形状
    assert.equal(chunkNameOf('/roadbook/bundle/atlas.js'), null, '没登记的名字不许服务（哪怕文件真在磁盘上）');
    // 路径穿越的四种写法
    assert.equal(chunkNameOf('/roadbook/bundle/../chunks.js'), null, '相对路径穿越');
    assert.equal(chunkNameOf('/roadbook/bundle/..%2Fchunks.js'), null, '百分号转义的穿越');
    assert.equal(chunkNameOf('/roadbook/bundle/a/b.js'), null, '子路径');
    assert.equal(chunkNameOf('/roadbook/bundle/evolve.js/../x.js'), null, '尾部再折一层');
    // 形状不符
    assert.equal(chunkNameOf('/roadbook/bundle/evolve'), null, '没有 .js 后缀');
    assert.equal(chunkNameOf('/roadbook/bundle/evolve.js.map'), null, '后缀必须逐字对');
    assert.equal(chunkNameOf('/roadbook/bundle/EVOLVE.js'), null, '大写不算同一个名字（文件系统不区分，白名单必须区分）');
    assert.equal(chunkNameOf('/roadbook/update/status'), null, '别的路由');
    assert.equal(chunkNameOf(''), null);
    assert.equal(chunkNameOf(undefined), null);
});

test('分块名从 URL 取：查询串与哈希都不参与判定，URL 畸形不抛错', () => {
    assert.equal(chunkNameFromUrl('/roadbook/bundle/evolve.js?v=2'), 'evolve');
    assert.equal(chunkNameFromUrl('/roadbook/bundle/evolve.js#tag'), 'evolve');
    assert.equal(chunkNameFromUrl('/roadbook/bundle/evolve.js?x=/../y'), 'evolve');
    assert.equal(chunkNameFromUrl('http://127.0.0.1:19387/roadbook/bundle/evolve.js'), 'evolve');
    assert.equal(chunkNameFromUrl(undefined), null);
});

test('分块文件路径：名字已过白名单，拼出来的路径只可能落在 lib/ 下', () => {
    const path = chunkFileOf('evolve', '/tmp/chunks');
    assert.equal(path, join('/tmp/chunks', 'client-evolve.js'));
    for (const bad of ['../chunks', 'a/b', '..', '']) {
        assert.equal(chunkNameOf(`/roadbook/bundle/${bad}.js`), null, `${bad} 不该过白名单`);
    }
});

// ── ③④⑤ 路由行为 ────────────────────────────────────────────────────────────

test('路由：同源守卫不放行 = 403，不给任何内容（与 /roadbook/update/* 同一条守卫）', async () => {
    const handler = createChunkHandler({ fence: () => false });
    const state = await call(handler);
    assert.equal(state.status, 403);
    assert.equal(state.body, 'forbidden');
});

test('路由：只服务 GET / HEAD，其余 405', async () => {
    const handler = createChunkHandler({ fence: () => true });
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
        assert.equal((await call(handler, { method })).status, 405, `${method} 必须 405`);
    }
});

test('路由：未登记的名字 / 文件不在磁盘 一律 404 —— 绝不给空脚本', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadbook-chunk-'));
    try {
        const handler = createChunkHandler({ dir, fence: () => true });
        assert.equal((await call(handler, { url: '/roadbook/bundle/atlas.js' })).status, 404, '没登记的名字');
        assert.equal((await call(handler)).status, 404, '登记了但文件没落盘：响亮 404');
        assert.equal((await call(handler, { url: '/roadbook/nope' })).status, 404);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('路由：200 的头部三件套 + ETag 复验回 304（body 不带）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadbook-chunk-'));
    const body = 'globalThis.__roadbookChunks__["evolve"] = () => ({ a: 1 });\n';
    try {
        writeFileSync(join(dir, 'client-evolve.js'), body, 'utf8');
        const handler = createChunkHandler({ dir, fence: () => true });
        const first = await call(handler);
        assert.equal(first.status, 200);
        assert.equal(first.headers['content-type'], CHUNK_CONTENT_TYPE);
        assert.equal(first.headers['cache-control'], 'no-cache', 'no-cache：每次复验，别把旧分块钉在缓存里');
        assert.equal(first.headers.etag, etagOf(body));
        assert.equal(String(first.body), body, '路由直接把文件内容送出去（Buffer 形状，与 Node res.end 一致）');

        const again = await call(handler, { headers: { 'if-none-match': first.headers.etag } });
        assert.equal(again.status, 304, '内容没变必须回 304');
        assert.equal(again.body, undefined, '304 不许带 body');

        const changed = `${body}// bumped\n`;
        writeFileSync(join(dir, 'client-evolve.js'), changed, 'utf8');
        const third = await call(handler, { headers: { 'if-none-match': first.headers.etag } });
        assert.equal(third.status, 200, '内容变了不许再回 304（否则 HMR 永远看到旧分块）');
        assert.equal(third.headers.etag, etagOf(changed));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('路由：HEAD 与 GET 同头但不写体', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadbook-chunk-'));
    try {
        const body = 'x;\n';
        writeFileSync(join(dir, 'client-evolve.js'), body, 'utf8');
        const handler = createChunkHandler({ dir, fence: () => true });
        const head = await call(handler, { method: 'head' });
        assert.equal(head.status, 200, 'method 大小写不敏感');
        assert.equal(head.headers['content-type'], CHUNK_CONTENT_TYPE);
        assert.equal(head.body, undefined, 'HEAD 不带体');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('路由：ETag 按 mtime/size 记忆化 —— 没变不重读文件，变了必须重算', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadbook-chunk-'));
    let reads = 0;
    try {
        const path = join(dir, 'client-evolve.js');
        writeFileSync(path, 'a;\n', 'utf8');
        const handler = createChunkHandler({
            dir,
            fence: () => true,
            read: (target) => {
                reads += 1;
                return readFile(target);
            },
        });
        await call(handler);
        await call(handler);
        assert.equal(reads, 1, 'mtime 与 size 都没变 ⇒ 第二次不该重读（几十 KB 的脚本每请求哈希一次纯属浪费）');

        // 同尺寸、但改了内容并把 mtime 推到未来：size 相同也必须认出「变了」
        const later = new Date(Date.now() + 5000);
        writeFileSync(path, 'b;\n', 'utf8');
        utimesSync(path, later, later);
        const last = await call(handler);
        assert.equal(last.headers.etag, etagOf('b;\n'), 'mtime 变了必须重算 ETag');
        assert.equal(reads, 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('ETag：引号包裹的 sha1 前 12 位，同内容同值、不同内容不同值', () => {
    const a = etagOf('hello');
    assert.match(a, /^"[0-9a-f]{12}"$/);
    assert.equal(etagOf('hello'), a);
    assert.notEqual(etagOf('hello!'), a);
    assert.equal(etagOf(Buffer.from('hello', 'utf8')), a, 'Buffer 与字符串同值（路由读出来的是 Buffer）');
});

test('registerChunkRoutes：prefix 路由挂在 /roadbook/bundle 上，返回撤销函数', () => {
    const registered = [];
    const dispose = () => {};
    const webServer = {
        register(spec) {
            registered.push(spec);
            return dispose;
        },
    };
    assert.equal(registerChunkRoutes(webServer), dispose);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].kind, 'prefix', '前缀路由：一条管住所有分块名（官方 exact 路由服务不了任意文件名）');
    assert.equal(registered[0].path, CHUNK_ROUTE_PREFIX);
    assert.equal(typeof registered[0].handler, 'function');
});

// ── ⑥⑦⑧⑨ 两半之间的契约 ────────────────────────────────────────────────────

test('两半的路由前缀逐字一致（各写一份常量：改了这处忘那处 = 满屏 404）', () => {
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    const match = /var CHUNK_ROUTE_PREFIX = "([^"]+)"/.exec(source);
    assert.ok(match, 'lib/client.js 里必须有一份 CHUNK_ROUTE_PREFIX 常量');
    assert.equal(match[1], CHUNK_ROUTE_PREFIX);
});

test('磁盘上的分块文件 ⊆ 白名单，且白名单里每个名字都真有文件（两个方向都查）', () => {
    const names = readdirSync(LIB_URL)
        .filter((file) => /^client-[a-z0-9-]+\.js$/.test(file))
        .map((file) => file.slice('client-'.length, -'.js'.length));
    assert.ok(names.length > 0, 'lib/ 下应当已有分块文件（client-<名>.js）');
    assert.deepEqual(names.filter((name) => !CHUNK_NAMES.includes(name)), [], '磁盘上有、白名单没有 ⇒ 该文件永远不会被服务（漏登记）');
    const libDir = dirname(fileURLToPath(new URL('../lib/chunks.js', import.meta.url)));
    for (const name of CHUNK_NAMES) {
        assert.ok(names.includes(name), `白名单登记了 ${name}，但没有 lib/client-${name}.js（服务出去只会是 404）`);
        assert.equal(resolve(chunkFileOf(name)), resolve(join(libDir, `client-${name}.js`)), `${name} 的文件必须落在 lib/ 下`);
    }
});

test('分块脚本：自己登记工厂，且登记在 globalThis.__roadbookChunks__ 上（普通同源脚本，不是 ESM）', () => {
    for (const name of CHUNK_NAMES) {
        const source = readFileSync(new URL(`../lib/client-${name}.js`, import.meta.url), 'utf8');
        assert.ok(
            source.includes(`globalThis.__roadbookChunks__["${name}"]`),
            `lib/client-${name}.js 必须把自己登记成 __roadbookChunks__["${name}"]`,
        );
        assert.ok(!/^\s*(import|export)\s/m.test(source), '分块是普通脚本：不许出现 import / export');
    }
});

test('核心按生产路径取分块：宿主件一个不缺，导出表齐备（搬代码漏搬依赖的坑就在这一条）', () => {
    const bundle = loadBundle();
    const host = bundle.exports.__internals.chunkRequireOf('roadbook/host');
    // 分块文件头 destructure 的每一项都必须在宿主件里存在；缺一项的后果不是报错，
    // 而是那一处静默变成 undefined（例如 t 用不了、样式丢失），所以逐项断言。
    const required = [
        'E', 'useState', 'useEffect', 'useCallback', 'format', 'formatTime', 'messageOf',
        'requestJson', 'useLocaleRevision', 'dict',
    ];
    for (const key of required) assert.equal(typeof host[key], 'function', `宿主件缺 ${key}`);
    assert.equal(typeof host.styles.TOKEN, 'object', '宿主件缺 styles.TOKEN（分块的配色全从它取）');
    assert.ok(host.styles.TOKEN.text, 'TOKEN 里必须有 text');
    for (const key of ['buttonStyle', 'badgeStyle', 'sectionStyle']) {
        assert.equal(typeof host.styles[key], 'function', `宿主件缺 styles.${key}`);
    }
    assert.equal(host.routes.evolveStatus, '/roadbook/evolve/status');
    assert.equal(host.routes.evolveTick, '/roadbook/evolve/tick');

    const evolve = loadChunk(bundle, 'evolve');
    for (const key of ['EvolvePanel', 'evolveIcon', 'evolveFrame', 'evolveView', 'fetchEvolveStatus', 'fetchEvolveTick']) {
        assert.equal(typeof evolve[key], 'function', `分块 evolve 缺导出 ${key}`);
    }
});

test('取分块失败要说得出原因：没登记的工厂 / 工厂返回空表，都必须抛错而不是回 undefined', () => {
    const bundle = loadBundle();
    const { resolveChunk } = bundle.exports.__internals;
    assert.throws(() => resolveChunk({}, 'evolve', () => {}), /没有登记工厂/, '没登记必须抛错（不许静默空白）');
    assert.throws(() => resolveChunk({ nope: () => null }, 'nope', () => {}), /没有返回导出表/);
    assert.throws(() => resolveChunk({ nope: () => 'x' }, 'nope', () => {}), /没有返回导出表/);
});

test('边界组件：分块没到位渲染「加载中」，到位后渲染真组件', () => {
    const bundle = loadBundle();
    const { chunkBoundary } = bundle.exports.__internals;
    const Boundary = chunkBoundary('evolve', 'EvolvePanel');
    const props = { ctx: { locale: 'zh-CN' }, visible: true };

    const loading = Boundary(props);
    assert.ok(collectLabels(loading).includes('正在加载这个标签页的脚本…'), '没到位要明说在加载，不是空白');

    const evolve = loadChunk(bundle, 'evolve');
    const ready = Boundary(props);
    assert.equal(ready.type, evolve.EvolvePanel, '到位后必须把 props 原样交给真组件');
    assert.equal(ready.props, props);

    // 分块里没有那个导出名时不许当成「加载完成」：照样回加载中（否则是永久空白）
    const Missing = chunkBoundary('evolve', 'NotThere');
    assert.ok(collectLabels(Missing(props)).includes('正在加载这个标签页的脚本…'));
});

test('分块名与宿主白名单对不齐时：核心抛出的错误里带得出名字与 URL', () => {
    const bundle = loadBundle();
    const { resolveChunk, chunkUrlOf } = bundle.exports.__internals;
    assert.equal(chunkUrlOf('evolve'), `${CHUNK_ROUTE_PREFIX}/evolve.js`);
    try {
        resolveChunk({}, 'ghost', () => {});
        assert.fail('必须抛错');
    } catch (error) {
        assert.match(error.message, /ghost/);
        assert.match(error.message, /\/roadbook\/bundle\/ghost\.js/);
    }
});
