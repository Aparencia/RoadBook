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
 */
import test from 'node:test';
import assert from 'node:assert/strict';
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

/** 按 DSH 的 ModuleLoader 契约加载 bundle，返回 { config, exports, requested }。 */
function loadBundle() {
    const captured = [];
    const sandbox = {
        window: {
            __ModuleLoader__: {
                load(config) {
                    captured.push(config);
                },
            },
        },
    };
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
