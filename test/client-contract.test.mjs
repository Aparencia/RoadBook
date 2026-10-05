/**
 * 客户端半的离线契约测试。
 *
 * 浏览器半是手写的 ModuleLoader bundle，没有构建步骤 —— 所以形状错误只会在真实页面里
 * 才暴露。这个测试在 Node 里用假 window.__ModuleLoader__.load 把 bundle 收下来，再按
 * DSH 的加载契约（factory(require) → { apply, inject }）跑一遍，把能提前发现的东西全钉住：
 *   1) 全文件只有一次 load，id 等于包名；
 *   2) require 只取基线模块（react），不 import 任何宿主内部路径；
 *   3) 导出 apply/inject，inject 声明 betterSidebar 服务依赖；
 *   4) better-sidebar 缺席时静默跳过（不抛错）；
 *   5) 注册的是一个 single tab，且注册动作包在 ctx.effect 里（卸载能撤销）；
 *   6) 标签页根节点满足原生 tab 的高度契约（flex:1 / height:100% / min-height:0）；
 *   7) 无 JSX（纯 React.createElement）；
 *   8) 版本号三处一致（package.json = 客户端常量 = 宿主半 pluginVersion()），且页脚真的显示它。
 *
 * 2026-10-05 追加四条（只能靠真机肉眼验的口径，必须先在 Node 里钉死）：
 *   9) 预览走 /sidebar/html 路由且 URL 与 better-sidebar 的 encodeHtmlUrl 同算法（绝对路径、逐段编码）；
 *      `srcDoc` 这条被 512 KB readLimit 静默截断的老路不许回来；
 *  10) 活动语言读 `locale.getSnapshot().active`（旧代码读的 `.current` 在真机上不存在）；
 *  11) 自动刷新的目录指纹只看名称集合与截断标记；
 *  12) 「规格比图纸新」的三态判据（changed/same/unknown）：字节数由客户端按 UTF-8 自己折算
 *      （宿主文本读**不回** size），算不出哈希时必须回 unknown，不许静默退化成「没变」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CLIENT_URL = new URL('../lib/client.js', import.meta.url);
const SOURCE = readFileSync(CLIENT_URL, 'utf8');
const PACKAGE_NAME = 'roadbook';
const TAB_ID = 'roadbook:gallery';

/** 假 React：只要够组件首帧渲染一次。 */
function fakeReact() {
    return {
        createElement(type, props, ...children) {
            return { type, props: props || {}, children };
        },
        useState(initial) {
            return [typeof initial === 'function' ? initial() : initial, () => {}];
        },
        useEffect() {},
        useCallback(fn) {
            return fn;
        },
    };
}

/** 按 DSH 的 ModuleLoader 契约加载 bundle，返回 { config, exports, requested }。
 *
 * options.fetch —— 给沙箱装一个假的 /sidebar API 端点（默认**不装**：任何意外的网络调用
 *   都会因 ReferenceError 立刻暴露，而不是悄悄成功）。
 * options.crypto: false —— 不装 WebCrypto，用来复现「非安全上下文」（非 localhost 的 http 打开界面）。
 */
function loadBundle(options = {}) {
    const captured = [];
    const sandbox = {
        window: {
            __ModuleLoader__: {
                load(config) {
                    captured.push(config);
                },
            },
        },
        TextEncoder,
    };
    // 预览与「规格是否过期」都要用真 crypto：默认给沙箱补上，否则只有 fallback 分支被测到
    if (options.crypto !== false) sandbox.crypto = globalThis.crypto;
    if (typeof options.fetch === 'function') sandbox.fetch = options.fetch;
    vm.runInNewContext(SOURCE, sandbox, { filename: 'lib/client.js' });
    assert.equal(captured.length, 1, 'client.js 必须且只能调用一次 window.__ModuleLoader__.load');
    const config = captured[0];
    const requested = [];
    const exports = config.factory((id) => {
        requested.push(id);
        if (id === 'react') return fakeReact();
        throw new Error(`客户端半 require 了非基线模块：${id}`);
    });
    return { config, exports, requested };
}

test('bundle 形状：id 等于包名、只 require 基线模块、导出 apply/inject', () => {
    const { config, exports, requested } = loadBundle();
    assert.equal(config.id, PACKAGE_NAME);
    assert.equal(typeof config.factory, 'function');
    assert.deepEqual(requested, ['react'], '只允许 require("react")');
    assert.equal(typeof exports.apply, 'function', '客户端半必须导出 apply');
    assert.ok(Array.isArray(exports.inject), '客户端半必须导出 inject 数组');
    assert.ok(exports.inject.includes('betterSidebar'), 'inject 必须声明 betterSidebar 服务依赖');
    assert.equal(exports.TAB_ID, TAB_ID);
    assert.ok(!/<\/[a-zA-Z]/.test(SOURCE), '手写 bundle 不许出现 JSX 闭合标签');
});

test('better-sidebar 缺席时静默跳过（不抛错、不注册）', () => {
    const { exports } = loadBundle();
    let effected = 0;
    exports.apply({ effect: () => effected += 1 });
    assert.equal(effected, 0);
});

test('apply 通过 ctx.effect 注册一个 single tab，disposer 被 fiber 持有', () => {
    const { exports } = loadBundle();
    const registered = [];
    const disposer = () => {};
    const ctx = {
        locale: 'zh-CN',
        betterSidebar: {
            features: ['openFile', 'pluginSettings'],
            registerTab(descriptor) {
                registered.push(descriptor);
                return disposer;
            },
        },
        effect: (factory) => factory(),
    };
    exports.apply(ctx);
    assert.equal(registered.length, 1);
    const descriptor = registered[0];
    assert.equal(descriptor.id, TAB_ID);
    assert.equal(descriptor.single, true, '一个会话只该有一个图册标签页');
    assert.equal(typeof descriptor.order, 'number');
    assert.equal(typeof descriptor.component, 'function');
    assert.equal(typeof descriptor.title, 'function');
    assert.equal(typeof descriptor.icon, 'function');
    assert.ok(descriptor.settings && Array.isArray(descriptor.settings.pluginToggles));
    // vm 沙箱里的数组宿主 realm 不同，Array.from 转成宿主数组再比（否则 deepStrictEqual 会挑原型）
    const toggleKeys = Array.from(descriptor.settings.pluginToggles, (row) => row.key);
    assert.deepEqual(toggleKeys, ['dir']);
    // 图标必须能在两种尺寸下渲染出元素
    assert.ok(descriptor.icon(16));
    assert.ok(descriptor.icon(20));
});

test('tab 根节点满足原生 tab 高度契约，且列表/空态都能首帧渲染', () => {
    const { exports } = loadBundle();
    const descriptor = (() => {
        let found = null;
        exports.apply({
            locale: 'zh-CN',
            betterSidebar: { features: [], registerTab: (d) => { found = d; return () => {}; } },
            effect: (factory) => factory(),
        });
        return found;
    })();
    const props = {
        ctx: { locale: 'zh-CN', betterSidebar: { features: [] } },
        store: { getPrefs: () => ({ pluginSettings: {} }) },
        scope: { sessionId: 'session-1', cwd: '/repo' },
        tab: { type: TAB_ID },
        visible: true,
        onReferenceFile() {},
    };
    const tree = descriptor.component(props);
    assert.ok(tree && tree.props, '组件必须返回元素');
    assert.equal(tree.props.style.flex, '1 1 auto');
    assert.equal(tree.props.style.height, '100%');
    assert.equal(tree.props.style.minHeight, 0);
    assert.equal(tree.props.style.overflow, 'hidden');

    // 英文 locale 下标题走英文词典
    const en = descriptor.component({ ...props, ctx: { locale: 'en-US', betterSidebar: { features: [] } } });
    // 假 React 把 children 存成 rest 参数数组（元素本身可能又是数组），所以遍历要能展平
    const labels = [];
    const walk = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (typeof node === 'string' || typeof node === 'number') {
            labels.push(String(node));
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node === 'object') (node.children || []).forEach(walk);
    };
    walk(en);
    assert.ok(labels.includes('Atlas'), `英文 locale 应显示 Atlas，实际：${labels.slice(0, 8).join(' | ')}`);
});

test('版本号三处一致，且页脚真的显示它', async () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const { exports } = loadBundle();
    // 客户端 bundle 读不到 package.json（ModuleLoader 的 require 只有白名单），所以常量是手写的 ——
    // 这条断言就是防它悄悄漂移：升版本时漏改 client.js 会在这里红。
    assert.equal(exports.PLUGIN_VERSION, manifest.version, '客户端常量必须等于 package.json 的 version');

    const host = await import(new URL('../lib/index.js', import.meta.url).href);
    assert.equal(host.pluginVersion(), manifest.version, '宿主半 pluginVersion() 必须等于 package.json 的 version');

    let descriptor = null;
    exports.apply({
        locale: 'zh-CN',
        betterSidebar: { features: [], registerTab: (d) => { descriptor = d; return () => {}; } },
        effect: (factory) => factory(),
    });
    const tree = descriptor.component({
        ctx: { locale: 'zh-CN', betterSidebar: { features: [] } },
        store: { getPrefs: () => ({ pluginSettings: {} }) },
        scope: { sessionId: 'session-1', cwd: '/repo' },
        tab: { type: TAB_ID },
        visible: true,
        onReferenceFile() {},
    });
    const labels = [];
    const walk = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (typeof node === 'string' || typeof node === 'number') {
            labels.push(String(node));
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node === 'object') (node.children || []).forEach(walk);
    };
    walk(tree);
    assert.ok(
        labels.some((label) => label.endsWith(`v${manifest.version}`)),
        `页脚应显示 v${manifest.version}，实际尾部文案：${labels.slice(-4).join(' | ')}`,
    );
});

// ── 2026-10-04 实机事故回归：客户端半注册失败曾把整个 DSH 启动判死 ──────────────
// DSH 的 web boot 收集所有非 active 的客户端条目后直接 throw（"web boot: N entries did not
// activate"），而 better-sidebar 的 registerTab 对重复 id 是直接 throw。两者一叠加，
// 「重复注册」就从「一个标签页没出来」升级成「应用起不来」。下面四条钉住收口行为。

test('重复注册不再判死：better-sidebar 对重复 id 抛错时 apply 不上抛', () => {
    const { exports } = loadBundle();
    const ctx = {
        locale: 'zh-CN',
        // 照抄 dsh-better-sidebar/lib/client-registry.js 的真实行为：同一个 id 再来一次就 throw
        betterSidebar: {
            registerTab() {
                throw new Error('[dsh-better-sidebar] tab type "roadbook:gallery" already registered');
            },
        },
        effect: (factory) => factory(),
    };
    assert.doesNotThrow(() => exports.apply(ctx), '注册失败必须就地吞成警告 —— 抛出去 = DSH 无法启动');
});

test('同一页面内 apply 跑两次只注册一次（幂等）', () => {
    const { exports } = loadBundle();
    const registered = [];
    const ctx = {
        locale: 'zh-CN',
        betterSidebar: {
            registerTab(descriptor) {
                registered.push(descriptor);
                return () => {};
            },
        },
        effect: (factory) => factory(),
    };
    exports.apply(ctx);
    exports.apply(ctx);
    assert.equal(registered.length, 1, '第二次 apply 不许再注册（否则真实 better-sidebar 会 throw）');
});

test('服务注册表里已有同 id 的 tab 时跳过注册，且不调用 registerTab', () => {
    const { exports } = loadBundle();
    let calls = 0;
    const ctx = {
        locale: 'zh-CN',
        betterSidebar: {
            getTabs: () => [{ id: TAB_ID }],
            registerTab() {
                calls += 1;
                return () => {};
            },
        },
        effect: (factory) => factory(),
    };
    exports.apply(ctx);
    assert.equal(calls, 0, '上一代实例留下的同 id 注册应被识别并跳过');
});

test('effect 撤销后标记复位，下一次 apply 仍能注册（热更新不留死角）', () => {
    const { exports } = loadBundle();
    const registered = [];
    let disposer = null;
    const ctx = {
        locale: 'zh-CN',
        betterSidebar: {
            registerTab(descriptor) {
                registered.push(descriptor);
                return () => {};
            },
        },
        effect: (factory) => {
            disposer = factory();
        },
    };
    exports.apply(ctx);
    assert.equal(registered.length, 1);
    assert.equal(typeof disposer, 'function', '注册必须返回 disposer 交给 fiber');
    disposer();
    exports.apply(ctx);
    assert.equal(registered.length, 2, '撤销后应能重新注册');
});

// ── 2026-10-05 第二批：预览截断、语言快照、自动刷新指纹、规格过期判定 ──────────
// 这四条钉住的都是「只能靠真机肉眼验」的口径，所以必须在 Node 里先钉死。

/** 从元素树里收集所有字符串叶子（假 React 存的是 rest 参数数组）。 */
function collectLabels(tree) {
    const labels = [];
    const walk = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (typeof node === 'string' || typeof node === 'number') {
            labels.push(String(node));
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node === 'object') (node.children || []).forEach(walk);
    };
    walk(tree);
    return labels;
}

/** 用给定 ctx 注册一次标签页并取回描述符。 */
function descriptorOf(exports, ctx) {
    let descriptor = null;
    exports.apply({
        ...ctx,
        betterSidebar: { features: [], registerTab: (d) => { descriptor = d; return () => {}; }, ...(ctx.betterSidebar || {}) },
        effect: (factory) => factory(),
    });
    return descriptor;
}

/** 渲染一次标签页组件（假 React 只跑首帧）。 */
function renderTab(exports, ctx) {
    const descriptor = descriptorOf(exports, ctx);
    return descriptor.component({
        ctx,
        store: { getPrefs: () => ({ pluginSettings: {} }) },
        scope: { sessionId: 'session-1', cwd: '/repo' },
        tab: { type: TAB_ID },
        visible: true,
        onReferenceFile() {},
    });
}

test('预览 URL 与 better-sidebar 的 encodeHtmlUrl 同算法：整份文件走 /sidebar/html，不再经 fs.read', () => {
    const { exports } = loadBundle();
    const { htmlUrl, archiveUrl } = exports.__internals;
    const scope = { sessionId: 'session-1' };
    // 绝对路径是硬要求：/sidebar/html 路由没有 cwd 参数，相对路径会被服务端补成盘根
    assert.equal(htmlUrl(scope, 'C:/repo/docs/diagrams/pay flow.html'), '/sidebar/html/session-1/C%3A/repo/docs/diagrams/pay%20flow.html');
    assert.equal(htmlUrl(scope, 'C:\\repo\\docs\\diagrams\\a.html'), '/sidebar/html/session-1/C%3A/repo/docs/diagrams/a.html', 'Windows 反斜杠与正斜杠等价');
    assert.equal(htmlUrl(scope, '/home/u/repo/docs/diagrams/a.html'), '/sidebar/html/session-1/home/u/repo/docs/diagrams/a.html');
    assert.equal(archiveUrl(scope, 'job-9'), '/sidebar/archive?sessionId=session-1&id=job-9');
    // 顺手钉住：srcDoc 这条被截断的老路不许回来（只测「当属性用」，注释里提到不算）
    assert.ok(!/\bsrcDoc\s*:/.test(SOURCE), '预览不许再回到 srcDoc（fs.read 的 512 KB 上限会把图纸截断）');
});

test('语言快照读 getSnapshot().active —— 旧代码读的 .current 在真机上不存在（界面恒中文）', () => {
    const { exports } = loadBundle();
    const { localeTagOf, LOCALE_NS } = exports.__internals;
    assert.equal(LOCALE_NS, 'roadbook');
    assert.equal(localeTagOf({ locale: 'en-US' }), 'en-US');
    assert.equal(localeTagOf({ locale: { getSnapshot: () => ({ active: 'en-US' }) } }), 'en-US');
    assert.equal(localeTagOf({ locale: { getSnapshot: () => ({ active: 'zh-CN' }) } }), 'zh-CN');
    assert.equal(localeTagOf({ locale: { getLocale: () => ({ active: 'en' }) } }), 'en');
    assert.equal(localeTagOf({ locale: { current: 'en-GB' } }), 'en-GB');
    assert.equal(localeTagOf({}), '');
});

test('locale 服务形状（真机形状）下英文标题生效；bind 查不到时回退本地表', () => {
    const { exports } = loadBundle();
    const tree = renderTab(exports, {
        locale: {
            getSnapshot: () => ({ active: 'en-US' }),
            register: () => () => {},
            bind: () => (key) => key,
        },
    });
    const labels = collectLabels(tree);
    assert.ok(labels.includes('Atlas'), `英文 locale 应显示 Atlas，实际：${labels.slice(0, 8).join(' | ')}`);
});

test('双语表注册进 locale 注册表：命名空间 roadbook，zh 与 en 各一次', () => {
    const { exports } = loadBundle();
    const calls = [];
    exports.apply({
        locale: {
            register(ns, locale, dict) {
                calls.push([ns, locale, Object.keys(dict).length]);
                return () => {};
            },
        },
        betterSidebar: { features: [], registerTab: () => () => {} },
        effect: (factory) => factory(),
    });
    assert.deepEqual(calls.map((row) => [row[0], row[1]]), [['roadbook', 'zh'], ['roadbook', 'en']]);
    assert.ok(calls[0][2] > 20, '中文表应覆盖全部界面文案');
    assert.equal(calls[0][2], calls[1][2], '中英两份必须逐键对齐（缺键会在界面里回显键名）');
});

test('目录指纹只看名称集合与截断标记 —— 顺序不同不算变化，集合变了才算', () => {
    const { exports } = loadBundle();
    const { signatureOf } = exports.__internals;
    const a = signatureOf({ entries: [{ name: 'b.html' }, { name: 'a.atlas.json' }, { name: 'dir', isDir: true }] });
    const b = signatureOf({ entries: [{ name: 'a.atlas.json' }, { name: 'b.html' }] });
    assert.equal(a, b, '同一集合不同顺序 = 同一个指纹');
    assert.notEqual(a, signatureOf({ entries: [{ name: 'b.html' }] }), '少了文件 = 指纹变了');
    assert.notEqual(a, signatureOf({ entries: [{ name: 'b.html' }, { name: 'a.atlas.json' }], truncated: true }), '截断标记也要进指纹');
});

test('规格字节数走生产路径读出来：宿主文本读不回 size，客户端按 UTF-8 自己折算', async () => {
    const requests = [];
    const { exports } = loadBundle({
        fetch: async (url, init) => {
            requests.push({ url, body: JSON.parse(init.body) });
            // 宿主 fs.read 文本分支的真实形状：只有 content 与 truncated，**没有 size**
            return { ok: true, status: 200, json: async () => ({ ok: true, value: { kind: 'text', content: '{"a":1}', truncated: false } }) };
        },
    });
    const scope = { sessionId: 's1', cwd: 'C:/proj' };
    const read = await exports.__internals.readText(scope, 'C:/proj/docs/a.atlas.json');
    assert.equal(requests.length, 1, '读一个文件只该发一次请求');
    assert.equal(requests[0].url, '/sidebar/api/fs.read');
    assert.equal(requests[0].body.path, 'C:/proj/docs/a.atlas.json');
    assert.equal(read.text, '{"a":1}');
    assert.equal(read.bytes, Buffer.byteLength('{"a":1}', 'utf8'), '字节数必须由客户端自己算出来（以前读 value.size 恒为 null，比字节数是死分支）');
    assert.equal(read.truncated, false);

    const truncated = loadBundle({
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: { kind: 'text', content: 'xx', truncated: true } }) }),
    });
    const cut = await truncated.exports.__internals.readText(scope, 'C:/proj/docs/a.atlas.json');
    assert.equal(cut.truncated, true, '截断标记必须原样透传（调用方要靠它丢弃不可用的回执/规格）');
});

test('UTF-8 字节折算与 TextEncoder/Buffer 逐个一致（含代理对与落单代理）', () => {
    const { utf8Bytes } = loadBundle().exports.__internals;
    const samples = ['', 'abc', '中文图纸', '{"a":"路书"}', 'emoji 🗺️ 地图', '\ud800', '\udfff', 'a\ud800b', '\ud83d\uddfa'];
    for (const sample of samples) {
        assert.equal(utf8Bytes(sample), Buffer.byteLength(sample, 'utf8'), `折算错了：${JSON.stringify(sample)}`);
    }
});

test('规格比图纸新：changed / same / unknown 三态，字节数不同就是一定过期', async () => {
    const { specChangedAfterRender } = loadBundle().exports.__internals;
    const text = '{"a":1}';
    const bytes = Buffer.byteLength(text, 'utf8');
    const sha = createHash('sha256').update(text, 'utf8').digest('hex');
    const read = { text, bytes };

    assert.equal(await specChangedAfterRender({ spec: { bytes, sha256: sha } }, read), 'same', '完全一致 = 没变');
    assert.equal(await specChangedAfterRender({ spec: { bytes, sha256: 'f'.repeat(64) } }, read), 'changed', '字节数相同但哈希不同 = 过期');
    assert.equal(await specChangedAfterRender({ spec: { bytes: bytes + 1, sha256: sha } }, read), 'changed', '字节数不同 = 一定过期');
    assert.equal(await specChangedAfterRender({ spec: { bytes } }, read), 'same', '老回执没有哈希：没有可比材料，不打扰');
    assert.equal(await specChangedAfterRender(null, read), 'same', '没有回执就谈不上过期');
    assert.equal(await specChangedAfterRender({ spec: { bytes, sha256: sha } }, null), 'same', '规格读不到时不下结论');
});

test('非安全上下文（没有 crypto.subtle）：判不了过期必须回 unknown，不许说成「没变」', async () => {
    const text = '{"a":1}';
    const bytes = Buffer.byteLength(text, 'utf8');
    const sha = createHash('sha256').update(text, 'utf8').digest('hex');
    const { specChangedAfterRender } = loadBundle({ crypto: false }).exports.__internals;

    assert.equal(await specChangedAfterRender({ spec: { bytes, sha256: sha } }, { text, bytes }), 'unknown', '算不出哈希 = 判不了；静默回「没变」正是漏报过期图纸的方向');
    assert.equal(await specChangedAfterRender({ spec: { bytes: bytes + 1, sha256: sha } }, { text, bytes }), 'changed', '没有 WebCrypto 时字节数这条判据仍要工作（这正是它存在的理由）');
});
