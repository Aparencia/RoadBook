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
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CLIENT_URL = new URL('../lib/client.js', import.meta.url);
const SOURCE = readFileSync(CLIENT_URL, 'utf8');
const PACKAGE_NAME = 'roadbook';
const TAB_ID = 'roadbook:gallery';
/** 第二个标签页（2026-10-05 批 3）：宿主半判定，客户端半只显示。 */
const EVOLVE_TAB_ID = 'roadbook:evolve';

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
        if (id === 'react') return options.react ?? fakeReact();
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
    assert.deepEqual(
        Array.from(exports.inject),
        [],
        '顶层 inject 必须为空 —— 写进它的服务缺席/迟到时本行是 PENDING 或没有 fiber，而 DSH 把任一未激活条目判成致命错误（应用打不开）。slots / betterSidebar 都走作用域注入'
    );
    assert.equal(exports.TAB_ID, TAB_ID);
    assert.ok(!/<\/[a-zA-Z]/.test(SOURCE), '手写 bundle 不许出现 JSX 闭合标签');
});

test('better-sidebar 缺席时静默跳过（不抛错、不注册）', () => {
    const { exports } = loadBundle();
    let effected = 0;
    exports.apply({ effect: () => effected += 1 });
    assert.equal(effected, 0);
});

test('apply 通过 ctx.effect 注册两个 single tab（图册 45 / 自进化 46），disposer 被 fiber 持有', () => {
    const { exports } = loadBundle();
    const registered = [];
    const disposer = () => {};
    const ctx = sidebarCtx({
        betterSidebar: {
            features: ['openFile', 'pluginSettings'],
            registerTab(descriptor) {
                registered.push(descriptor);
                return disposer;
            },
        },
    });
    exports.apply(ctx);
    assert.deepEqual(
        Array.from(registered, (row) => row.id),
        [TAB_ID, EVOLVE_TAB_ID],
        '两个标签页都要注册（图册在前：45 < 46）',
    );
    const descriptor = registered.find((row) => row.id === TAB_ID);
    assert.equal(descriptor.single, true, '一个会话只该有一个图册标签页');
    assert.equal(typeof descriptor.order, 'number');
    assert.equal(descriptor.order, 45);
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

    const evolve = registered.find((row) => row.id === EVOLVE_TAB_ID);
    assert.equal(evolve.order, 46, '自进化紧随图册之后');
    assert.equal(evolve.single, true, '一个会话只该有一个自进化标签页');
    assert.equal(typeof evolve.component, 'function');
    assert.equal(typeof evolve.title, 'function');
    assert.equal(typeof evolve.description, 'function');
    assert.ok(evolve.icon(16));
    assert.ok(evolve.icon(20));
    assert.equal(evolve.settings, undefined, '这一页没有设置项：settings 在 better-sidebar 里是可选的');
});

test('tab 根节点满足原生 tab 高度契约，且列表/空态都能首帧渲染', () => {
    const { exports } = loadBundle();
    const descriptor = (() => {
        let found = null;
        exports.apply(sidebarCtx({
            // 本半挂了两个标签页：这里只取「图册」那一个（最后一个注册的不是它）
            betterSidebar: { features: [], registerTab: (d) => { if (d.id === TAB_ID) found = d; return () => {}; } },
        }));
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

    const descriptor = descriptorOf(exports, { locale: 'zh-CN' });
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

    // 第二个标签页的页脚同样必须显示当前版本（两处手写常量，升版本时都会漂）
    const evolveFrame = exports.__internals.evolveFrame({ t: (key) => key, view: null, error: '', unavailable: false, busy: false, onRefresh() {}, onTick() {} });
    const evolveLabels = collectLabels(evolveFrame);
    assert.ok(
        evolveLabels.some((label) => label.endsWith(`v${manifest.version}`)),
        `自进化页脚也应显示 v${manifest.version}，实际：${evolveLabels.slice(-3).join(' | ')}`,
    );
});

// ── 2026-10-04 实机事故回归：客户端半注册失败曾把整个 DSH 启动判死 ──────────────
// DSH 的 web boot 收集所有非 active 的客户端条目后直接 throw（"web boot: N entries did not
// activate"），而 better-sidebar 的 registerTab 对重复 id 是直接 throw。两者一叠加，
// 「重复注册」就从「一个标签页没出来」升级成「应用起不来」。下面四条钉住收口行为。

test('重复注册不再判死：better-sidebar 对重复 id 抛错时 apply 不上抛', () => {
    const { exports } = loadBundle();
    const ctx = sidebarCtx({
        // 照抄 dsh-better-sidebar/lib/client-registry.js 的真实行为：同一个 id 再来一次就 throw
        betterSidebar: {
            registerTab() {
                throw new Error('[dsh-better-sidebar] tab type "roadbook:gallery" already registered');
            },
        },
    });
    assert.doesNotThrow(() => exports.apply(ctx), '注册失败必须就地吞成警告 —— 抛出去 = DSH 无法启动');
});

// ── 2026-10-05 实机事故回归：cordis 的**严格服务访问**把整个 DSH 启动判死 ──────────
// cordis 的 ctx 是代理：读一个**没写进 inject 的服务**不是返回 undefined，而是直接
//     cannot get property "locale" without inject
// （@deepseek-ai/cordis 的 ReflectService.handler.get；0.2.x 起就是这条语义）。
// 这个 throw 只要发生在 apply() 里，cordis 就把本行 fiber 记成 failed，前端 boot 审计
// 随即判死整个应用：
//     web boot: 1 entry did not activate / roadbook: failed →「应用无法启动或已意外停止」
// 0.4.0 的 registerLocale() 在 apply() 第一行读 ctx.locale（inject 里只有 betterSidebar），
// 本机装上去 DSH 就直接打不开。下面三条钉住收口行为，而且**故意照抄 cordis 的语义**
// 而不是用宽松的普通对象 —— 之前正是「假 ctx 太宽松」让这个缺陷整套测试全绿。

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
function strictCordisCtx(options = {}) {
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
function sidebarCtx({ betterSidebar, locale = 'zh-CN', effect } = {}) {
    return strictCordisCtx({ injected: [], services: { locale, betterSidebar }, effect }).ctx;
}

test('未 inject 的 locale 在 apply 里读属性会抛 —— 必须降级走 ctx.get，且照样把标签页注册上', () => {
    const { exports } = loadBundle();
    const registered = [];
    const localeCalls = [];
    const { ctx, reads } = strictCordisCtx({
        injected: ['betterSidebar'],
        services: {
            betterSidebar: { registerTab(descriptor) { registered.push(descriptor); return () => {}; } },
            locale: {
                register(ns, tag, dict) { localeCalls.push([ns, tag, Object.keys(dict).length]); return () => {}; },
                getSnapshot: () => ({ active: 'en-US' }),
            },
        },
    });
    assert.doesNotThrow(
        () => exports.apply(ctx),
        '读一个没 inject 的服务必须降级成「没有这个服务」—— 抛出去 = fiber failed = DSH 打不开',
    );
    assert.equal(registered.length, 2, '兜住异常之后仍要真的把两个标签页注册上');
    assert.deepEqual(Array.from(registered, (d) => d.id), [TAB_ID, EVOLVE_TAB_ID]);
    assert.deepEqual(
        localeCalls.map((row) => row[1]),
        ['zh', 'en'],
        'locale 双语表要经 ctx.get 拿到服务后照常注册（zh、en 各一次）',
    );
    assert.ok(reads.includes('locale'), 'locale 只能走 ctx.get(name, false) 这条路');
});

test('连 ctx.get 都不可用时：只丢语言表，标签页照注册，且绝不上抛', () => {
    const { exports } = loadBundle();
    const registered = [];
    const { ctx } = strictCordisCtx({
        injected: ['betterSidebar'],
        getThrows: true,
        services: { betterSidebar: { registerTab(descriptor) { registered.push(descriptor); return () => {}; } } },
    });
    assert.doesNotThrow(() => exports.apply(ctx));
    assert.equal(registered.length, 2, '语言是锦上添花：拿不到 locale 不该连标签页一起丢掉');
    assert.deepEqual(Array.from(registered, (d) => d.id), [TAB_ID, EVOLVE_TAB_ID]);
});

test('最坏情况（服务全读不到、服务对象自己也是严格代理、effect 也抛）：apply 整段兜底', () => {
    const { exports } = loadBundle();
    const { ctx } = strictCordisCtx({ injected: [], getThrows: true, services: {} });
    assert.doesNotThrow(() => exports.apply(ctx), '客户端半没有把 DSH 判死的权力');
    // 连 effect 都坏掉时也必须只留警告
    const hostile = {
        get effect() { throw new Error('effect exploded'); },
        get get() { throw new Error('get exploded'); },
    };
    assert.doesNotThrow(() => exports.apply(hostile));
    // 服务对象**本身**是严格代理：`typeof service.registerTab` 这一步就抛。
    // 这一条只有 apply 外层那圈 try 兜得住 —— readService 只保证「取服务」不抛，
    // 取到之后的每一步同样在兜底范围内。
    const proxyService = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'features') return [];
            throw new Error(`cannot get property "${String(prop)}" without inject`);
        },
    });
    const { ctx: withProxyService } = strictCordisCtx({
        injected: ['betterSidebar'],
        services: { betterSidebar: proxyService },
    });
    assert.doesNotThrow(
        () => exports.apply(withProxyService),
        '取到服务之后的每一步也必须在 apply 的兜底范围内',
    );
});

test('readService 的两段口径：先属性、抛错后退 ctx.get、都没有给 undefined', () => {
    const { exports } = loadBundle();
    const { readService } = exports.__internals;
    const service = { register() {} };
    assert.equal(readService({ locale: service }, 'locale'), service, '注入了就走属性访问（语义最正）');
    assert.equal(readService({}, 'locale'), undefined, '普通对象上没有就是 undefined');
    const { ctx } = strictCordisCtx({ injected: [], services: { locale: service } });
    assert.equal(readService(ctx, 'locale'), service, '属性访问抛错后必须退回 ctx.get');
    const { ctx: dead } = strictCordisCtx({ injected: [], getThrows: true, services: { locale: service } });
    assert.equal(readService(dead, 'locale'), undefined, '两条路都断了也只是 undefined，绝不抛');
});

test('同一页面内 apply 跑两次只注册一次（幂等）', () => {
    const { exports } = loadBundle();
    const registered = [];
    const ctx = sidebarCtx({
        betterSidebar: {
            registerTab(descriptor) {
                registered.push(descriptor);
                return () => {};
            },
        },
    });
    exports.apply(ctx);
    exports.apply(ctx);
    assert.equal(registered.length, 2, '第二次 apply 不许再注册（否则真实 better-sidebar 会对重复 id 抛错）');
    assert.deepEqual(Array.from(registered, (d) => d.id), [TAB_ID, EVOLVE_TAB_ID], '两个标签页各自只登记一次');
});

test('服务注册表里已有同 id 的 tab 时跳过注册，且不调用 registerTab', () => {
    const { exports } = loadBundle();
    let calls = 0;
    const ctx = sidebarCtx({
        betterSidebar: {
            getTabs: () => [{ id: TAB_ID }],
            registerTab(descriptor) {
                calls += 1;
                return () => {};
            },
        },
    });
    exports.apply(ctx);
    assert.equal(calls, 1, '上一代实例留下的「图册」注册应被识别并跳过，只补注册缺的那个');
    // 两个 id 都在注册表里 → 一个也不许再注册
    let both = 0;
    const ctx2 = sidebarCtx({
        betterSidebar: {
            getTabs: () => [{ id: TAB_ID }, { id: EVOLVE_TAB_ID }],
            registerTab() {
                both += 1;
                return () => {};
            },
        },
    });
    exports.apply(ctx2);
    assert.equal(both, 0, '两个 id 都已注册 → 一次 registerTab 都不许调');
});

test('effect 撤销后标记复位，下一次 apply 仍能注册（热更新不留死角）', () => {
    const { exports } = loadBundle();
    const registered = [];
    // 两个标签页各注册一次 = 两个 effect，撤销时要把两个 disposer 都收回来
    const disposers = [];
    const ctx = sidebarCtx({
        betterSidebar: {
            registerTab(descriptor) {
                registered.push(descriptor);
                return () => {};
            },
        },
        effect: (factory) => {
            disposers.push(factory());
        },
    });
    exports.apply(ctx);
    assert.equal(registered.length, 2);
    assert.deepEqual(disposers.map((fn) => typeof fn), ['function', 'function'], '每个注册都要返回 disposer 交给 fiber');
    disposers.forEach((fn) => fn());
    exports.apply(ctx);
    assert.equal(registered.length, 4, '撤销后两个都应能重新注册');
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

/** 用给定 ctx 注册一次标签页并取回**指定 id** 的描述符（默认图册；本半现在挂两个标签页）。 */
function descriptorOf(exports, ctx, id = TAB_ID) {
    let descriptor = null;
    exports.apply(sidebarCtx({
        locale: ctx.locale,
        betterSidebar: { features: [], registerTab: (d) => { if (d.id === id) descriptor = d; return () => {}; }, ...(ctx.betterSidebar || {}) },
    }));
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
    exports.apply(sidebarCtx({
        locale: {
            register(ns, locale, dict) {
                calls.push([ns, locale, Object.keys(dict).length]);
                return () => {};
            },
        },
        betterSidebar: { features: [], registerTab: () => () => {} },
    }));
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

// ── 2026-10-05：更新条（宿主半判定 → 这一半只显示与发指令） ─────────────────────
// 这些口径同样只能靠真机肉眼验，所以在 Node 里先钉死：三态文案、宿主路由不在时整条不渲染、
// 变更请求打到哪条路由、以及「读不到 ≠ 已是最新」。

test('更新条判定：有新版 / 已最新 / 更新中 / 成功 / 失败 各有明确形状', () => {
    const { updateStripState } = loadBundle().exports.__internals;
    assert.equal(updateStripState(null).key, 'update.checking', '首帧在等状态');
    assert.equal(updateStripState({ ok: false, unavailable: true }), null, '宿主路由不在 = 整条不渲染（不留死按钮）');
    assert.equal(updateStripState({ ok: true, mode: 'off' }), null, '能力关闭 = 整条不渲染');
    assert.equal(updateStripState({ ok: false, reason: 'network' }).key, 'update.unknown');
    assert.equal(updateStripState({ ok: false, reason: 'network' }).canCheck, true, '检查失败要给重试入口');

    const available = updateStripState({
        ok: true,
        mode: 'notify',
        state: 'update-available',
        installed: '0.3.0',
        latest: '0.4.0',
        applier: { available: true },
    });
    assert.equal(available.key, 'update.available');
    assert.equal(available.canApply, true);
    // 跨 realm 的对象原型不同（bundle 跑在 vm 里），逐字段比而不是 deepEqual
    assert.equal(available.values.installed, '0.3.0');
    assert.equal(available.values.latest, '0.4.0');

    const noApplier = updateStripState({ ok: true, mode: 'notify', state: 'update-available', installed: '0.3.0', latest: '0.4.0', applier: { available: false, reason: 'no-installer' } });
    assert.equal(noApplier.canApply, false, '找不到安装命令时不许给一个点了必然失败的按钮');
    assert.equal(noApplier.detail, 'update.noApplier');

    assert.equal(updateStripState({ ok: true, mode: 'notify', state: 'up-to-date', installed: '0.4.0' }).key, 'update.upToDate');
    assert.equal(updateStripState({ ok: true, mode: 'notify', state: 'dev' }).key, 'update.dev');
    assert.equal(updateStripState({ ok: true, mode: 'notify', state: 'ahead', installed: '0.5.0' }).key, 'update.ahead');
    assert.equal(updateStripState({ ok: true, mode: 'notify', state: 'unknown', reason: 'http-500' }).key, 'update.unknown');

    const running = updateStripState({ ok: true, mode: 'notify', state: 'update-available', operation: { state: 'running', label: 'runtime:rt' }, applier: { available: true } });
    assert.equal(running.key, 'update.applying');
    assert.equal(running.busy, true);
    assert.equal(running.canApply, false, '跑着的时候按钮必须收起（宿主半也会拒第二次）');

    const done = updateStripState({ ok: true, mode: 'notify', operation: { state: 'succeeded', before: '0.3.0', after: '0.4.0' } });
    assert.equal(done.key, 'update.applied');
    assert.equal(done.restart, true, '替换完必须提示重启（桌面宿主持有重启权，插件不自己重启）');
    assert.equal(done.values.before, '0.3.0');
    assert.equal(done.values.after, '0.4.0');

    const failed = updateStripState({ ok: true, mode: 'notify', operation: { state: 'failed', exitCode: 1, outputTail: 'ERR_PNPM_FETCH_404' }, applier: { available: true } });
    assert.equal(failed.key, 'update.failed');
    assert.equal(failed.detail, 'ERR_PNPM_FETCH_404', '失败原因必须看得见，不许只留一句「失败」');
});

test('更新条判定：宿主真实的 idle 不是失败；空 reason 不许把 {reason} 占位符漏到界面上', () => {
    const { updateStripState } = loadBundle().exports.__internals;
    // 冷却期内宿主的真实形状（force=false 跳过一次检查）：state=idle、reason 为空串。
    // 这条以前会掉进 unknown 兜底，界面上顶着 warn 显示「检查失败：{reason}」，而且一挂就是 24h。
    const idle = updateStripState({ ok: true, mode: 'notify', state: 'idle', reason: '', installed: '0.4.0' });
    assert.equal(idle.key, 'update.idle');
    assert.equal(idle.tone, 'muted', '跳过检查不是失败，不许用警告色');
    assert.equal(idle.canCheck, true, '仍然要给一个「检查」入口');

    const unknown = updateStripState({ ok: true, mode: 'notify', state: 'unknown', reason: '' });
    assert.equal(unknown.values.reason, '', '空 reason 交给渲染层兜底，判定层不编词');
    assert.notEqual(unknown.key, 'update.upToDate', '读不到不许说成「已是最新」');

    // 空转的安装：exit 0 但版本没变（pnpm「Already up to date」）——不许写「已更新 vX → vX」+ 重启提示
    const noChange = updateStripState({ ok: true, mode: 'notify', operation: { state: 'succeeded', before: '0.4.0', after: '0.4.0' } });
    assert.equal(noChange.key, 'update.noChange');
    assert.equal(noChange.restart, false, '版本没变还叫人重启就是假话');

    // 发起更新失败（409/424）不许顶着「检查失败」的标题，reason 码也不许直接当句子
    const refused = updateStripState({ ok: false, unavailable: false, applyFailed: true, reason: '已有一次更新在进行，等它结束' });
    assert.equal(refused.key, 'update.applyFailed');
    assert.equal(refused.values.reason, '已有一次更新在进行，等它结束');
});

test('更新请求：状态走 GET /roadbook/update/status（force 才带 ?force=1），更新走 POST /roadbook/update/apply', async () => {
    const requests = [];
    const { exports } = loadBundle({
        fetch: async (url, init) => {
            requests.push({ url, method: init && init.method, body: init && init.body });
            return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'notify', state: 'up-to-date', installed: '0.4.0' }) };
        },
    });
    const { fetchUpdateStatus, applyUpdate, UPDATE_STATUS_PATH, UPDATE_APPLY_PATH } = exports.__internals;
    assert.equal(UPDATE_STATUS_PATH, '/roadbook/update/status');
    assert.equal(UPDATE_APPLY_PATH, '/roadbook/update/apply');

    const status = await fetchUpdateStatus(false);
    assert.equal(status.state, 'up-to-date');
    await fetchUpdateStatus(true);
    await applyUpdate();
    assert.deepEqual(requests.map((row) => `${row.method} ${row.url}`), [
        'GET /roadbook/update/status',
        'GET /roadbook/update/status?force=1',
        'POST /roadbook/update/apply',
    ]);
    assert.equal(requests[2].body, '{}', '变更请求不改状态：宿主半自己读 profile 与配置');
});

test('宿主路由不在（404）或宿主连不上时：如实报「不可用」，不是「已是最新」', async () => {
    const missing = loadBundle({
        fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) }),
    });
    const gone = await missing.exports.__internals.fetchUpdateStatus(false);
    assert.equal(gone.ok, false);
    assert.equal(gone.unavailable, true);
    assert.equal(missing.exports.__internals.updateStripState(gone), null, '路由不在 = 不渲染');

    const offline = loadBundle({
        fetch: async () => {
            throw new Error('Failed to fetch');
        },
    });
    const down = await offline.exports.__internals.fetchUpdateStatus(false);
    assert.equal(down.unavailable, true);

    const refused = loadBundle({
        fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: 'untrusted-origin' }) }),
    });
    const denied = await refused.exports.__internals.fetchUpdateStatus(false);
    assert.equal(denied.unavailable, false, '403 是「路由在但拒绝了」：要显示原因，不能静默');
    assert.equal(denied.reason, 'untrusted-origin');
});

test('更新条首帧：等状态时渲染「检查中」，且图册标签页真的把它挂进了树', () => {
    const { exports } = loadBundle();
    // 假 React 不会调用嵌套的函数组件，所以这里直接调用一次取首帧（真 React 里由 AtlasGallery 渲染）。
    const tree = exports.__internals.UpdateStrip({ t: (key) => key });
    assert.ok(tree && tree.props, '首帧必须返回元素（不是 null、也不是抛错）');
    const labels = collectLabels(tree);
    assert.ok(labels.includes('update.checking'), `首帧应显示检查中，实际：${labels.join(' | ')}`);

    // 接线断言：图册标签页的树里必须有一个 type === UpdateStrip 的元素（漏挂 = 更新条永远不出现）
    const tabTree = renderTab(exports, { locale: 'zh-CN', betterSidebar: { features: [] } });
    let found = false;
    const walkTypes = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (Array.isArray(node)) {
            node.forEach(walkTypes);
            return;
        }
        if (typeof node === 'object') {
            if (node.type === exports.__internals.UpdateStrip) found = true;
            (node.children || []).forEach(walkTypes);
        }
    };
    walkTypes(tabTree);
    assert.equal(found, true, '图册标签页必须挂上更新条');
});

// ── 2026-10-05 批 3：「自进化」标签页（宿主半判定 → 这一半只显示） ──────────────
// 本仓库最在意的一条口径就落在这里：**unknown 必须显示成「判不了」，绝不能显示成正常**
// （读不到 ≠ 通过）。另外宿主路由不在时要整块降级、不留死按钮。
// 假 React 跑不了 effect / setState，所以「加载完成」那一帧驱动不到 —— 渲染因此被抽成纯函数
// evolveFrame：任意一帧都能在 Node 里逐字钉住，而不是只钉一张映射表。

/** 收集一帧里所有「徽标」样式的 span：{ text, border }（假 React 把子节点放在 children 数组里）。 */
function collectBadges(tree) {
    const out = [];
    const walk = (node) => {
        if (node === null || node === undefined || typeof node === 'boolean') return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node !== 'object') return;
        const style = node.props && node.props.style;
        if (style && typeof style === 'object' && typeof style.border === 'string' && style.borderRadius === '999px') {
            out.push({ text: (node.children || []).filter((child) => typeof child === 'string').join(''), border: style.border });
        }
        (node.children || []).forEach(walk);
    };
    walk(tree);
    return out;
}

/** 收集一帧里所有指定类型的元素。 */
function collectElements(tree, type) {
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

/** evolveFrame 用的查表函数：直接吃 bundle 里的中文表（键缺失回显键名，便于发现漏翻译）。 */
function evolveT(dictionaries) {
    return (key) => (typeof dictionaries.zh[key] === 'string' ? dictionaries.zh[key] : key);
}

/** 一条真实形状的载荷（照抄宿主半 plugin/roadbook-evolve/index.js 的 evaluateSignals 输出）。 */
function evolvePayload() {
    return {
        ok: true,
        signals: [
            { id: 'S2', title: '注入活性', unit: 'inject/loaded', reading: '0/138', threshold: 'inject = 0 且 loaded ≥ 10', verdict: 'hit', detail: '一次都没注入过' },
            { id: 'S4', title: '工作树状态', unit: 'porcelain 行数', reading: null, threshold: '> 0', verdict: 'unknown', detail: 'git 读不到' },
            { id: 'S5', title: '规则索引健康', unit: '退出码', reading: '0', threshold: '退出码 ≠ 0', verdict: 'ok', detail: 'rules.mjs 判绿' },
        ],
        tally: { total: 6, hit: 0, ok: 6, unknown: 0 },
        liveness: { ticks: 3, lastTickAt: '2026-10-05T12:00:00.000Z', ageMinutes: 5, verdict: 'ok' },
        autoload: { total: 138, loaded: 12, inject: 0, cardRead: 0, idle: 0, arms: { prod: 73, suspect: 65, unknown: 0 } },
        update: { total: 65, checks: 4, applyStart: 2, applyFailures: 0 },
        generatedAt: '2026-10-05T12:30:00.000Z',
    };
}

test('自进化三态：只有字面量 ok/hit 被承认，其余（含缺失与大小写不同）一律判不了', () => {
    const { evolveVerdictOf, evolveVerdictKey } = loadBundle().exports.__internals;
    assert.equal(evolveVerdictOf('ok'), 'ok');
    assert.equal(evolveVerdictOf('hit'), 'hit');
    assert.equal(evolveVerdictOf('unknown'), 'unknown');
    assert.equal(evolveVerdictOf(undefined), 'unknown', '缺字段 = 判不了，不是通过');
    assert.equal(evolveVerdictOf(null), 'unknown');
    assert.equal(evolveVerdictOf(''), 'unknown');
    assert.equal(evolveVerdictOf('OK'), 'unknown', '大小写不同不许蒙混成正常（宿主契约是小写）');
    assert.equal(evolveVerdictOf('warn'), 'unknown', '宿主将来加的新取值一律默认拒绝');
    assert.notEqual(evolveVerdictKey('unknown'), evolveVerdictKey('ok'), '「判不了」与「正常」必须是两句不同的话');
    assert.notEqual(evolveVerdictKey('hit'), evolveVerdictKey('ok'));
});

test('evolveView：没读数的信号不许显示成正常；tally 由行自己数，不采信宿主那一份', () => {
    const { evolveView } = loadBundle().exports.__internals;
    assert.equal(evolveView(null), null);
    assert.equal(evolveView({ ok: false, error: 'handler' }), null, 'ok !== true = 整块不渲染');
    assert.equal(evolveView({ ok: true }), null, 'signals 不是数组 = 整块不渲染');
    assert.equal(evolveView({ ok: true, signals: {} }), null);

    const view = evolveView({
        ok: true,
        signals: [
            { id: 'S2', title: '注入活性', unit: 'inject/loaded', reading: '0/138', threshold: 'x', verdict: 'hit', detail: '' },
            { id: 'S3', title: 'banner 可用率', unit: 'registered/banner', reading: null, threshold: '< 50%', verdict: 'unknown', detail: '没有 banner 记录' },
            // 宿主自相矛盾：说 ok 却没有读数 —— 界面必须降成 unknown（读不到 ≠ 通过）
            { id: 'S9', title: '矛盾样本', unit: 'x', reading: null, threshold: '> 0', verdict: 'ok', detail: '' },
            null,
        ],
        tally: { total: 99, hit: 0, ok: 99, unknown: 0 },
        liveness: { ticks: 0, lastTickAt: null, ageMinutes: null, verdict: 'ok' },
        generatedAt: '2026-10-05T12:00:00.000Z',
    });
    assert.deepEqual(Array.from(view.signals, (row) => row.id), ['S2', 'S3', 'S9'], '坏行丢掉，好行一个不少');
    assert.deepEqual(Array.from(view.signals, (row) => row.verdict), ['hit', 'unknown', 'unknown']);
    assert.equal(view.tally.total, 3);
    assert.equal(view.tally.hit, 1);
    assert.equal(view.tally.ok, 0, '没有一条真正的 ok');
    assert.equal(view.tally.unknown, 2, 'tally 由行自己数：宿主把 unknown 数进 ok 的那种错必须数得出来');
    assert.equal(view.liveness.ticks, 0);
    assert.equal(view.liveness.verdict, 'unknown', '一次 tick 都没有却说正常 = 自相矛盾，降成判不了');
    assert.equal(evolveView({ ok: true, signals: [] }).liveness, null, '没有 liveness 字段就不渲染那块');
});

test('自进化一帧：unknown 渲染成「判不了」+ 中性虚线；有读数才配「正常」', () => {
    const { evolveView, evolveFrame, dictionaries } = loadBundle().exports.__internals;
    const t = evolveT(dictionaries);
    const view = evolveView(evolvePayload());
    const tree = evolveFrame({ t, view, error: '', unavailable: false, busy: false, onRefresh() {}, onTick() {} });
    const labels = collectLabels(tree);

    // 计数三态分开显示，且是哪三句
    assert.ok(labels.includes(`${dictionaries.zh['evolve.tally.hit']} 1`), `缺越界计数：${labels.join(' | ')}`);
    assert.ok(labels.includes(`${dictionaries.zh['evolve.tally.ok']} 1`), '缺正常计数');
    assert.ok(labels.includes(`${dictionaries.zh['evolve.tally.unknown']} 1`), '缺判不了计数');
    assert.ok(labels.some((label) => label.includes('判不了 ≠ 通过：读不到就是不通过')));

    // 行级徽标：unknown 行 = 判不了 + 虚线；ok 行 = 正常 + 实线
    // （计数徽标是「词 + 空格 + 数字」，行级徽标只有词；两种都要落在同一条判据上）
    const badges = collectBadges(tree);
    const ofWord = (word) => badges.filter((badge) => badge.text === word || badge.text.indexOf(`${word} `) === 0);
    const undecided = ofWord(dictionaries.zh['evolve.tally.unknown']);
    const ok = ofWord(dictionaries.zh['evolve.tally.ok']);
    assert.equal(undecided.length, 2, '一个在计数行（「判不了 N」）、一个在那条 unknown 信号上');
    assert.equal(ok.length, 3, '计数行 + 那条 ok 信号 + 自身活性（同一份载荷里 liveness 也是 ok）');
    undecided.forEach((badge) => assert.ok(badge.border.includes('dashed'), `判不了必须用中性虚线：${badge.border}`));
    ok.forEach((badge) => assert.ok(badge.border.includes('solid'), '正常是实线：与判不了肉眼可分'));
    const hit = ofWord(dictionaries.zh['evolve.tally.hit']);
    assert.equal(hit.length, 2);

    // 没有读数的那条：显示「无读数」，且绝不许出现「0」或「正常」蒙混
    assert.ok(labels.some((label) => label.includes(dictionaries.zh['evolve.noReading'])), `缺无读数提示：${labels.join(' | ')}`);
    assert.ok(labels.includes('git 读不到'), '宿主给的 detail（判不了的原因）必须显示');
    // autoload / update 观测摘要：测试痕量必须单独报数（6-6 抽样抽到混合物的那件事）
    assert.ok(labels.some((label) => label.includes('测试痕量 65/138')), `缺痕量计数：${labels.join(' | ')}`);
    assert.ok(labels.some((label) => label.includes('记录 138')), '缺 autoload 摘要');
    assert.ok(labels.some((label) => label.includes('记录 65')), '缺 update 摘要');
    assert.equal(collectElements(tree, 'iframe').length, 0, '这一页不预览任何文件');
});

test('自进化一帧：宿主路由不在 = 整块降级、一个按钮都不留；刷新失败 = 旧读数顶警告', () => {
    const { evolveView, evolveFrame, dictionaries } = loadBundle().exports.__internals;
    const t = evolveT(dictionaries);

    // ① 路由不在：只有说明，没有按钮（点 404 的死按钮不许出现）
    const gone = evolveFrame({ t, view: null, error: 'Failed to fetch', unavailable: true, busy: false, onRefresh() {}, onTick() {} });
    const goneLabels = collectLabels(gone);
    assert.ok(goneLabels.includes(dictionaries.zh['evolve.unavailable']));
    assert.ok(goneLabels.includes(dictionaries.zh['evolve.unavailableHint']));
    assert.equal(collectElements(gone, 'button').length, 0, '路由不在时不许留任何按钮');
    assert.ok(!goneLabels.includes(dictionaries.zh['evolve.tick']), '更不许留「重算」');

    // ② 首帧（还没读到）：只说正在读，同样不给按钮
    const first = evolveFrame({ t, view: null, error: '', unavailable: false, busy: false, onRefresh() {}, onTick() {} });
    const firstLabels = collectLabels(first);
    assert.ok(firstLabels.includes(dictionaries.zh['evolve.loading']));
    assert.equal(collectElements(first, 'button').length, 0);

    // ③ 有读数 + 刷新失败：数据留着，但顶着一条警告（不能让人以为是刚读到的）
    const stale = evolveFrame({ t, view: evolveView(evolvePayload()), error: 'HTTP 500', unavailable: false, busy: false, onRefresh() {}, onTick() {} });
    const staleLabels = collectLabels(stale);
    assert.ok(staleLabels.some((label) => label.includes('读取失败：HTTP 500')));
    assert.ok(staleLabels.includes('注入活性'), '旧读数仍要显示');

    // ④ 有读数时给两个手动入口：刷新 + 重算（忙时显示「正在重算…」）
    const ready = evolveFrame({ t, view: evolveView(evolvePayload()), error: '', unavailable: false, busy: false, onRefresh() {}, onTick() {} });
    const buttons = collectElements(ready, 'button');
    assert.equal(buttons.length, 2);
    assert.deepEqual(Array.from(buttons, (node) => node.children[0]), [dictionaries.zh['action.refresh'], dictionaries.zh['evolve.tick']]);
    const busy = evolveFrame({ t, view: evolveView(evolvePayload()), error: '', unavailable: false, busy: true, onRefresh() {}, onTick() {} });
    assert.ok(collectLabels(busy).includes(dictionaries.zh['evolve.ticking']), '重算进行中要说出来');
});

test('自进化请求：状态走 GET /roadbook/evolve/status，重算走 POST /roadbook/evolve/tick', async () => {
    const requests = [];
    const { exports } = loadBundle({
        fetch: async (url, init) => {
            requests.push({ url, method: init && init.method, body: init && init.body });
            return { ok: true, status: 200, json: async () => ({ ok: true, signals: [] }) };
        },
    });
    const { fetchEvolveStatus, fetchEvolveTick, EVOLVE_STATUS_PATH, EVOLVE_TICK_PATH } = exports.__internals;
    assert.equal(EVOLVE_STATUS_PATH, '/roadbook/evolve/status');
    assert.equal(EVOLVE_TICK_PATH, '/roadbook/evolve/tick');
    const status = await fetchEvolveStatus();
    assert.equal(status.ok, true);
    await fetchEvolveTick();
    assert.deepEqual(requests.map((row) => `${row.method} ${row.url}`), [
        'GET /roadbook/evolve/status',
        'POST /roadbook/evolve/tick',
    ]);
    assert.equal(requests[1].body, '{}', '重算不改状态：宿主半自己读文件、跑审计');
});

test('自进化路由不在（404）/ 宿主连不上：如实报「不可用」，不是「全是正常」', async () => {
    const missing = loadBundle({ fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) }) });
    const gone = await missing.exports.__internals.fetchEvolveStatus();
    assert.equal(gone.ok, false);
    assert.equal(gone.unavailable, true);
    assert.equal(missing.exports.__internals.evolveView(gone), null, '读不到 = 整块不渲染（不是空表，更不是全绿）');

    const offline = loadBundle({
        fetch: async () => {
            throw new Error('Failed to fetch');
        },
    });
    assert.equal((await offline.exports.__internals.fetchEvolveStatus()).unavailable, true);

    const refused = loadBundle({
        fetch: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'untrusted-origin' }) }),
    });
    const denied = await refused.exports.__internals.fetchEvolveStatus();
    assert.equal(denied.unavailable, false, '403 是「路由在但拒绝了」：要显示原因，不能静默');
    assert.equal(denied.reason, 'untrusted-origin');

    // 200 但 ok !== true（宿主自己的兜底形状）也不许被当成一份读数
    const odd = loadBundle({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'handler', message: 'boom' }) }) });
    const bad = await odd.exports.__internals.fetchEvolveStatus();
    assert.equal(bad.ok, false);
    assert.equal(bad.unavailable, false);
    assert.equal(bad.reason, 'handler');
});

test('中英两份文案逐键对齐（不只是长度相同），自进化三态两份都在', () => {
    const { dictionaries } = loadBundle().exports.__internals;
    const zhKeys = Object.keys(dictionaries.zh).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    // 只比长度会漏掉「键名漂移」：中文有、英文没有的键，界面里会原样回显键名
    assert.deepEqual(enKeys, zhKeys, '中英两份必须逐键对齐');
    for (const key of ['evolve.tabTitle', 'evolve.tabDesc', 'evolve.tally.ok', 'evolve.tally.hit', 'evolve.tally.unknown', 'evolve.unavailable', 'evolve.noReading', 'evolve.tick', 'evolve.livenessNever']) {
        assert.ok(zhKeys.includes(key), `中文表缺 ${key}`);
    }
    assert.notEqual(dictionaries.zh['evolve.tally.unknown'], dictionaries.zh['evolve.tally.ok']);
    assert.notEqual(dictionaries.en['evolve.tally.unknown'], dictionaries.en['evolve.tally.ok']);
    assert.equal(dictionaries.zh['evolve.tally.unknown'], '判不了');
});

test('自进化标签页：首帧渲染「正在读取信号…」，根节点满足原生 tab 高度契约，标题双语', () => {
    const { exports } = loadBundle();
    const descriptor = descriptorOf(exports, { locale: 'zh-CN' }, EVOLVE_TAB_ID);
    assert.equal(descriptor.id, EVOLVE_TAB_ID);
    assert.equal(exports.EVOLVE_TAB_ID, EVOLVE_TAB_ID);
    assert.equal(descriptor.title(), '自进化');
    // 英文标题要另起一个 bundle：同一个 bundle 的模块级幂等标记不会让第二次注册生效
    const en = descriptorOf(loadBundle().exports, { locale: 'en-US' }, EVOLVE_TAB_ID);
    assert.equal(en.title(), 'Evolution');
    assert.equal(en.description(), 'Self-evolution signals: breach / OK / undecided, reported as three separate states');

    const tree = descriptor.component({
        ctx: { locale: 'zh-CN', betterSidebar: { features: [] } },
        store: { getPrefs: () => ({ pluginSettings: {} }) },
        scope: { sessionId: 'session-1', cwd: '/repo' },
        tab: { type: EVOLVE_TAB_ID },
        visible: true,
        onReferenceFile() {},
    });
    assert.ok(tree && tree.props, '组件必须返回元素');
    assert.equal(tree.props.style.flex, '1 1 auto');
    assert.equal(tree.props.style.height, '100%');
    assert.equal(tree.props.style.minHeight, 0);
    assert.equal(tree.props.style.overflow, 'hidden');
    const labels = collectLabels(tree);
    assert.ok(labels.includes('正在读取信号…'), `首帧应显示读取中，实际：${labels.join(' | ')}`);
    assert.ok(labels.some((label) => label.endsWith(`v${exports.PLUGIN_VERSION}`)), '页脚应显示当前版本');
});

// ── 插件详情页三处贡献（DSH 侧栏「插件」→ roadbook 组合包详情） ────────────────
//
// 这一组钉的是三件只能靠真机肉眼验的事：
//   ① 注册走**作用域注入**（`ctx.inject(['slots'], …)`），`export const inject` 保持**空数组**
//      —— 写进顶层 inject 的服务缺席/迟到时本行会停在「未激活」，而 DSH 把未激活条目判成致命错误
//      （0.7.0 真机事故；真 cordis 4.0.4 实测：顶层 inject 缺服务 ⇒ fiber 恒为 PENDING）；
//   ② 三个 slot 各注册一条，且**对不属于本包的 subject 返回 null**（这三个 slot 在每一个插件的
//      详情页上都会渲染，不做门就等于跑到别人的页面上说话）；
//   ③ 能力关闭 / 宿主路由不在时，三处**一起**不出现（页头不许留一个点了必然报错的死按钮）。

/** 一个只记账的假 slots 服务：`inject` 立刻回调（等同 slot 已被页面声明）。 */
function fakeSlots(log) {
    return {
        inject(name, callback) {
            log.push({ kind: 'inject', name });
            const disposer = callback();
            return () => log.push({ kind: 'dispose', name, disposer });
        },
        register(options) {
            log.push({ kind: 'register', slot: options.name, id: options.id, order: options.order, locale: options.locale });
            return () => {};
        },
    };
}

test('详情页贡献：走作用域注入注册三个 slot，且顶层 inject 是空数组', () => {
    const { exports } = loadBundle();
    // 跨 vm 边界的数组原型不同，`deepStrictEqual` 会因此判不等 —— 先搬回本 realm 再比。
    assert.deepEqual(Array.from(exports.inject), [], '顶层 inject 不许有任何服务 —— 缺席即「未激活」，那是 DSH 打不开的那类事故');

    const log = [];
    const slots = fakeSlots(log);
    const injected = [];
    const ctx = {
        inject(names, callback) {
            injected.push(names);
            return callback({ slots });
        },
    };
    exports.__internals.registerPluginDetailSlots(ctx);
    assert.equal(injected.length, 1, '只按作用域要一次服务');
    assert.deepEqual(Array.from(injected[0]), ['slots'], '只按作用域要 slots，不写进 fiber 依赖');
    assert.deepEqual(
        log.filter((entry) => entry.kind === 'register').map((entry) => [entry.slot, entry.id, entry.order, entry.locale]),
        [
            ['plugins.detail.actions', 'roadbook-update-action', 20, 'roadbook'],
            ['plugins.detail.badge', 'roadbook-update-badge', 20, 'roadbook'],
            ['plugins.detail.section', 'roadbook-update-section', 20, 'roadbook'],
        ],
        '三个 slot 各一条，名称与 id 都不许漂'
    );
});

test('作用域注入的隔离性：详情页接线炸了不许连累标签页；ctx.inject 读不到时什么都不注册也绝不抛', () => {
    // 每个恶劣 ctx 各起一个**新的 bundle**：同一个 bundle 里 apply 跑第二次时，模块级的幂等标记
    // 会让 registerTab 不再被调用（这是设计，不是缺陷），拿它当失败会误伤。

    // ① 只有 slots 那一次作用域注入抛：标签页必须照注册
    const registered = [];
    loadBundle().exports.apply({
        inject(names, callback) {
            if (names[0] === 'slots') throw new Error('cannot get property "slots" without inject');
            return callback({ betterSidebar: { registerTab: (descriptor) => (registered.push(descriptor.id), () => {}) } });
        },
        get: () => undefined,
        effect: (fn) => fn(),
    });
    assert.deepEqual(registered, [TAB_ID, EVOLVE_TAB_ID], '详情页那一次作用域注入抛错不许连累标签页');

    // ② slots 永远不到位（回调不被调用）：标签页照注册
    const second = [];
    loadBundle().exports.apply({
        inject(names, callback) {
            if (names[0] === 'slots') return () => {};
            return callback({ betterSidebar: { registerTab: (descriptor) => (second.push(descriptor.id), () => {}) } });
        },
        get: () => undefined,
        effect: (fn) => fn(),
    });
    assert.deepEqual(second, [TAB_ID, EVOLVE_TAB_ID]);

    // ③ `ctx.inject` 这个属性本身读不到（严格代理的极端情形）：两次接线一起放弃，但**绝不抛**。
    //    真 cordis 4.0.4 里它永远可读（顶层 inject 为空时 `ctx.inject` 仍是 Context 的方法，
    //    实测 apply 照跑、fiber 到 ACTIVE），所以这一格钉的只是「读不到也不许上抛」。
    const third = [];
    loadBundle().exports.apply({
        get inject() {
            throw new Error('cannot get property "inject" without inject');
        },
        get: () => undefined,
        locale: 'zh-CN',
        betterSidebar: { registerTab: (descriptor) => (third.push(descriptor.id), () => {}) },
        effect: (fn) => fn(),
    });
    assert.deepEqual(third, [], 'ctx.inject 读属性就抛：接线放弃，但绝不上抛');
});

test('详情页贡献：subject 门只认本组合包（别人的页面必须返回 null）', () => {
    const { exports } = loadBundle();
    const ours = exports.__internals.detailIsOurs;
    assert.equal(ours({ kind: 'bundle', pkg: { name: 'roadbook', version: '0.7.0' } }), true);
    assert.equal(ours({ kind: 'bundle', pkg: { name: 'dsh-plugin-mgr' } }), false, '别人的组合包不许说话');
    assert.equal(ours({ kind: 'row', pkg: { name: 'roadbook' }, row: { rowId: 'roadbook' } }), false, '行页不是本包的主页');
    assert.equal(ours({ kind: 'item', id: 'ui-chat' }), false, '官方插件页更不是');
    assert.equal(ours(null), false);
    assert.equal(ours({ kind: 'bundle' }), false, '缺 pkg 不许抛');

    const t = (key) => key;
    const foreign = { kind: 'bundle', pkg: { name: 'other' } };
    const internals = exports.__internals;
    for (const name of ['RoadbookUpdateAction', 'RoadbookUpdateBadge', 'RoadbookUpdateSection']) {
        assert.equal(internals[name]({ t, subject: foreign }), null, `${name} 在别人的页面上必须是 null`);
    }
});

test('详情页判定：能力关闭 / 宿主路由不在时三处一起不出现', () => {
    const { exports } = loadBundle();
    const views = exports.__internals.detailViews;
    assert.equal(views({ ok: true, mode: 'off' }, false), null, 'update: off = 三处都不出现');
    assert.equal(views({ ok: false, unavailable: true, reason: 'x' }, false), null, '旧宿主没有这两条路由');
    assert.equal(views(null, false).section.running, '?', '读不到版本给问号，不给 undefined');
});

test('详情页壳：别人的页面**一个 hook 都不调**（列表 slot 在每个插件的详情页上都会渲染）', () => {
    let hooks = 0;
    const base = fakeReact();
    const counting = {
        createElement: base.createElement,
        useState(initial) {
            hooks += 1;
            return base.useState(initial);
        },
        useEffect(...args) {
            hooks += 1;
            return base.useEffect(...args);
        },
        useCallback(fn) {
            hooks += 1;
            return base.useCallback(fn);
        },
    };
    const { exports } = loadBundle({ react: counting });
    const t = (key) => key;
    const internals = exports.__internals;
    const shells = ['RoadbookUpdateAction', 'RoadbookUpdateBadge', 'RoadbookUpdateSection'];

    hooks = 0;
    for (const name of shells) {
        assert.equal(internals[name]({ t, subject: { kind: 'bundle', pkg: { name: 'other' } } }), null);
    }
    // 外壳一旦在门控之前挂 hook（订阅 + 取数），打开**任何一个**插件的详情页都会替 roadbook 发请求
    assert.equal(hooks, 0, '别人的页面：壳必须直接返回 null，不许订阅、不许取数');

    const ours = { kind: 'bundle', pkg: { name: 'roadbook' } };
    const element = internals.RoadbookUpdateAction({ t, subject: ours });
    assert.ok(element && typeof element.type === 'function', '本包自己的页面：壳把实体委托给内层组件');
    element.type(element.props); // 假 React 不会自己渲染子组件，手动挂一次
    assert.ok(hooks > 0, 'hooks 住在内层组件里');
});

test('详情页判定：有新版时出徽标、能更新；待重启单列一档', () => {
    const { exports } = loadBundle();
    const views = exports.__internals.detailViews;
    const available = views(
        {
            ok: true,
            mode: 'notify',
            state: 'update-available',
            latest: '0.7.0',
            bootVersion: '0.6.1',
            installedNow: '0.6.1',
            checkedAt: '2026-10-05T10:00:00.000Z',
            applier: { available: true },
            upgrade: { state: 'unknown', target: null, running: null },
        },
        false
    );
    assert.equal(available.badge.key, 'detail.badgeUpdate');
    assert.equal(available.action.canApply, true, '有可用安装命令时页头要能直接更新');
    assert.equal(available.action.labelKey, 'detail.check');
    assert.equal(available.section.upgrade, null, '没有落地记录时不许编一句升级结论');
    assert.equal(available.section.running, '0.6.1');

    // 装完没重启：徽标改成「待重启」，区块如实报出目标与运行版本
    // （`before` 由宿主的状态一起发出来 —— 夹具按宿主真实形状写，不自造字段）
    const pending = views(
        {
            ok: true,
            mode: 'notify',
            state: 'up-to-date',
            latest: '0.7.0',
            bootVersion: '0.6.1',
            installedNow: '0.7.0',
            applier: { available: true },
            upgrade: { state: 'pending', target: '0.7.0', running: '0.6.1', before: '0.6.1' },
        },
        false
    );
    assert.equal(pending.badge.key, 'detail.badgeRestart');
    assert.equal(pending.section.upgrade.key, 'detail.upgradePending');
    assert.equal(pending.section.upgrade.tone, 'warn');
    assert.equal(pending.section.onDisk, '0.7.0', '磁盘版本与运行版本必须分开报');

    // 重启后生效：文案要用落地记录里的 before，缺了它就恒显示「v? → v0.7.0」
    const applied = views(
        {
            ok: true,
            mode: 'notify',
            state: 'up-to-date',
            latest: '0.7.0',
            bootVersion: '0.7.0',
            installedNow: '0.7.0',
            applier: { available: true },
            upgrade: { state: 'applied', target: '0.7.0', running: '0.7.0', before: '0.6.1' },
        },
        false
    );
    assert.equal(applied.badge, null, '已生效且无新版：标题旁不留东西');
    assert.equal(applied.section.upgrade.key, 'detail.upgradeApplied');
    assert.equal(applied.section.upgrade.values.before, '0.6.1', 'before 不许落成 v?');
    assert.equal(applied.section.upgrade.values.target, '0.7.0');

    // 检查进行中：按钮锁住，不许连点
    const checking = views({ ok: true, mode: 'notify', state: 'up-to-date', bootVersion: '0.6.1' }, true);
    assert.equal(checking.action.canCheck, false);
    assert.equal(checking.action.labelKey, 'detail.checking');
});

