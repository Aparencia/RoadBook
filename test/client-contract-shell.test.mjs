/**
 * 客户端契约测试 · 外壳面（2026-10-07 D14 拆分）。
 *
 * 本文件装的是「客户端半怎样被 DSH 装起来」这一面：
 *   - bundle 的 ModuleLoader 形状（id / require 白名单 / apply+inject / 无 JSX）；
 *   - 两个标签页的注册与生命周期（ctx.effect 撤销、重复注册收口、幂等、注册表已有则跳过）；
 *   - cordis 严格服务访问下的降级路径（未 inject 的 locale、ctx.get 也坏掉、服务对象本身是代理）；
 *   - 版本号三处一致与页脚显示；
 *   - 语言快照字段、双语表注册、中英逐键对齐。
 *
 * 来源：test/client-contract.test.mjs（拆前 1457 行 > D14 测试豁免线 1000；2026-10-07 按被测面切三份）。
 * 同批：client-contract-gallery.test.mjs（图册面）、client-contract-panels.test.mjs（面板面）。
 * 共享夹具：test/helpers/client-contract-harness.mjs（显式 import，不复制）。
 * 用例一字未改，只搬位置 + 按本文件实际用到的标识符重建 import 清单。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    EVOLVE_TAB_ID,
    PACKAGE_NAME,
    SOURCE,
    TAB_ID,
    collectLabels,
    descriptorOf,
    loadBundle,
    renderTab,
    sidebarCtx,
    strictCordisCtx,
} from './helpers/client-contract-harness.mjs';

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

// ── 2026-10-05 第二批（语言这一半）：语言快照字段与双语表 ─────────────────────
// 原文件里这几条与「预览截断 / 自动刷新指纹 / 规格过期判定」同属一批；2026-10-07 拆分后语言
// 这一半落在本文件，预览与规格那一半落在 client-contract-gallery.test.mjs。

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
