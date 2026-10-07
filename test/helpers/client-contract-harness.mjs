/**
 * 客户端半离线契约测试的共享夹具（2026-10-07 D14 拆分时从 test/client-contract.test.mjs 抽出）。
 *
 * 为什么单独成文件而不是复制三份：这几个夹具（假 React、假 ModuleLoader、严格 cordis ctx）正是
 * 「假环境必须和生产一样严」的那部分 —— 复制三份的口径迟早会在三处悄悄漂开，而漂开的那一份
 * 恰恰会让「顶层 inject 里偷偷塞服务」这类回归在本地变绿。
 *
 * 三个套件显式 import 它（不让测试文件之间互相 import：那会把用例采集与模块级幂等标记耦在一起）：
 *   - client-contract-shell.test.mjs   —— 外壳面：加载契约 / 注册与生命周期 / 服务降级 / 语言
 *   - client-contract-gallery.test.mjs —— 图册面：预览与归档 URL / 目录与规格 / 空态生成 / 路径折算
 *   - client-contract-panels.test.mjs  —— 面板面：更新条 / 自进化标签页 / 插件详情页三处贡献
 *
 * 本仓教训（拆分时按此重建每个文件的 import 清单）：搬走代码却漏搬 import 时，缺失的标识符在
 * 函数体里抛 ReferenceError，一旦被 catch 吞掉就表现为「函数在、恒返回 null」，进程零报错。
 *
 * 本文件不含任何用例：它不是套件，只是被三个套件显式 import 的模块。
 */

/**
 * 客户端半的离线契约测试。
 *
 * 浏览器半是手写的 ModuleLoader bundle，没有构建步骤 —— 所以形状错误只会在真实页面里
 * 才暴露。这个测试在 Node 里用假 window.__ModuleLoader__.load 把 bundle 收下来，再按
 * DSH 的加载契约（factory(require) → { apply, inject }）跑一遍，把能提前发现的东西全钉住：
 *   1) 全文件只有一次 load，id 等于包名；
 *   2) require 只取基线模块（react），不 import 任何宿主内部路径；
 *   3) 导出 apply/inject，且顶层 inject **必须是空数组**（写进它的服务缺席/迟到 ⇒ 本行
 *      PENDING 或没有 fiber ⇒ DSH 的 web boot 判死整个应用；0.7.0 真机事故的成因）；
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CLIENT_URL = new URL('../../lib/client.js', import.meta.url);
export const SOURCE = readFileSync(CLIENT_URL, 'utf8');
export const PACKAGE_NAME = 'roadbook';
export const TAB_ID = 'roadbook:gallery';
/** 第二个标签页（2026-10-05 批 3）：宿主半判定，客户端半只显示。 */
export const EVOLVE_TAB_ID = 'roadbook:evolve';

/** 假 React：只要够组件首帧渲染一次。 */
export function fakeReact() {
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

/** 按 DSH 的 ModuleLoader 契约加载 bundle，返回 { config, exports, requested, context }。
 *
 * options.fetch —— 给沙箱装一个假的 /sidebar API 端点（默认**不装**：任何意外的网络调用
 *   都会因 ReferenceError 立刻暴露，而不是悄悄成功）。
 * options.crypto: false —— 不装 WebCrypto，用来复现「非安全上下文」（非 localhost 的 http 打开界面）。
 * options.document —— 装一个假 document（只有分块装载器会碰它；默认不装，碰了就响）。
 *
 * 返回的 `context` 必须留着：分块要在**同一个** vm 上下文里跑（注册表 `__roadbookChunks__`
 * 与宿主件 `__roadbookChunkHost__` 都挂在那个全局上，换一个上下文就什么都取不到）。
 */
export function loadBundle(options = {}) {
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
    if (options.document !== undefined) sandbox.document = options.document;
    const context = vm.createContext(sandbox);
    vm.runInContext(SOURCE, context, { filename: 'lib/client.js' });
    assert.equal(captured.length, 1, 'client.js 必须且只能调用一次 window.__ModuleLoader__.load');
    const config = captured[0];
    const requested = [];
    const exports = config.factory((id) => {
        requested.push(id);
        if (id === 'react') return options.react ?? fakeReact();
        throw new Error(`客户端半 require 了非基线模块：${id}`);
    });
    return { config, exports, requested, context };
}

/** 分块文件的路径（与宿主半 `lib/chunks.js` 的 `client-<名>.js` 同一口径）。 */
export function chunkPathOf(name) {
    return new URL(`../../lib/client-${name}.js`, import.meta.url);
}

/**
 * 按**生产路径**装载一个分块：分块脚本在核心那个 vm 上下文里跑一遍（它自己登记工厂），
 * 再由核心的 `takeChunk` 取导出表 —— 也就是 `resolveChunk` + `roadbook/host` 注入那一段真代码。
 *
 * 为什么不在这里重写一遍「取工厂 → 调用它」：那等于把被测的那一层换成测试自己写的实现。
 * 本仓吃过这个亏 —— 假 /sidebar API 从不执行 better-sidebar 的 `requireAbsolute()` 校验，
 * 于是整条链路可以全绿而真机全坏。分块契约同理，必须走核心自己那条路。
 */
export function loadChunk(bundle, name) {
    const source = readFileSync(chunkPathOf(name), 'utf8');
    vm.runInContext(source, bundle.context, { filename: `lib/client-${name}.js` });
    return bundle.exports.__internals.takeChunk(name);
}

/**
 * 照抄 cordis `ReflectService.handler.get` 的严格语义造一个 ctx：
 *   - 直接读属性：只有 inject 过的服务给值，其余**抛** `cannot get property "X" without inject`；
 *   - `ctx.get(name, false)`：cordis 官方「不带 inject 要求」的读法，服务不在时返回 undefined；
 *   - `ctx.inject(deps, cb)`：**作用域注入** —— 回调拿到的子 ctx 里 deps 就是注入过的
 *     （属性可读、`effect`/`get` 照旧），deps 有缺时回调根本不被调用（cordis 里那个子 fiber
 *     停在 pending，**不影响**本行 fiber 的状态）。
 *
 * 顶层 `injected` 在生产里是**空数组**（0.7.1 起），所以服务只能从作用域注入拿 —— 假 ctx
 * 必须和生产一样严，否则「顶层 inject 里偷偷塞服务」这种回归在本地是绿的。
 * @param {{ injected?: string[], services?: object, getThrows?: boolean, effect?: Function }} [options]
 */
export function strictCordisCtx(options = {}) {
    const injected = options.injected ?? [];
    const services = options.services ?? {};
    const reads = [];
    const scopes = [];
    const build = (injectedNames) => {
        const target = {
            effect: options.effect ?? ((factory) => factory()),
            get(name) {
                reads.push(name);
                if (options.getThrows === true) throw new Error(`cannot get property "${name}" without inject`);
                return services[name];
            },
            inject(names, callback) {
                scopes.push(Array.from(names));
                if (names.some((name) => services[name] === undefined)) return () => {};
                return callback(build(Array.from(names)));
            },
        };
        return new Proxy(target, {
            get(t, prop) {
                if (typeof prop === 'symbol' || String(prop).startsWith('_')) return Reflect.get(t, prop);
                if (Reflect.has(t, prop)) return Reflect.get(t, prop);
                if (!injectedNames.includes(prop)) throw new Error(`cannot get property "${prop}" without inject`);
                return services[prop];
            },
        });
    };
    return { ctx: build(injected), reads, scopes };
}

/**
 * 生产形状的 apply ctx（顶层 inject 为空）：`betterSidebar` / `locale` 只能从作用域注入或
 * `ctx.get` 拿到。所有「注册标签页」的测试都从这里造 ctx，口径只有一份。
 */
export function sidebarCtx({ betterSidebar, locale = 'zh-CN', effect } = {}) {
    return strictCordisCtx({ injected: [], services: { locale, betterSidebar }, effect }).ctx;
}

/** 从元素树里收集所有字符串叶子（假 React 存的是 rest 参数数组）。 */
export function collectLabels(tree) {
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

/** 用给定 ctx 注册一次标签页并取回**指定 id** 的描述符（默认图册；本半现在挂两个标签页）。 */
export function descriptorOf(exports, ctx, id = TAB_ID) {
    let descriptor = null;
    exports.apply(sidebarCtx({
        locale: ctx.locale,
        betterSidebar: { features: [], registerTab: (d) => { if (d.id === id) descriptor = d; return () => {}; }, ...(ctx.betterSidebar || {}) },
    }));
    return descriptor;
}

/** 渲染一次标签页组件（假 React 只跑首帧）。 */
export function renderTab(exports, ctx) {
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

/** 收集一帧里所有指定类型的元素。 */
export function collectElements(tree, type) {
    const out = [];
    const walk = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node !== 'object') return;
        if (node.type === type) out.push(node);
        (node.children || []).forEach(walk);
    };
    walk(tree);
    return out;
}
