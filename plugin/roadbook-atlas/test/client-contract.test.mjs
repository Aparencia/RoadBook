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
 *   7) 无 JSX（纯 React.createElement）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CLIENT_URL = new URL('../lib/client.js', import.meta.url);
const SOURCE = readFileSync(CLIENT_URL, 'utf8');
const PACKAGE_NAME = 'roadbook-atlas';
const TAB_ID = 'roadbook-atlas:gallery';

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
