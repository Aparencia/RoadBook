/**
 * 客户端契约测试 · 面板面（2026-10-07 D14 拆分）。
 *
 * 本文件装的是「宿主半判定、客户端半只负责显示」的三块面：
 *   - 更新条（updateStripState 各态判定、请求路由、宿主路由不在时整条降级、首帧接线）；
 *   - 自进化标签页（三态判据、evolveView 的数数口径、一帧渲染、请求路由、路由不在的降级）；
 *   - 插件详情页三处贡献（作用域注入注册三个 slot、subject 门、能力关闭时三处一起不出现、
 *     别人的页面一个 hook 都不调、有新版与待重启两档判定）。
 *
 * 来源：test/client-contract.test.mjs（拆前 1457 行 > D14 测试豁免线 1000；2026-10-07 按被测面切三份）。
 * 同批：client-contract-shell.test.mjs（外壳面）、client-contract-gallery.test.mjs（图册面）。
 * 共享夹具：test/helpers/client-contract-harness.mjs（显式 import，不复制）。
 * 用例一字未改，只搬位置 + 按本文件实际用到的标识符重建 import 清单。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EVOLVE_TAB_ID,
    TAB_ID,
    collectElements,
    collectLabels,
    descriptorOf,
    fakeReact,
    loadBundle,
    loadChunk,
    renderTab,
} from './helpers/client-contract-harness.mjs';

/**
 * 一次取齐两半：自进化的**界面与判定**在分块里（`lib/client-evolve.js`），
 * **路由词与文案表**仍在核心里 —— 分块就是靠 `require("roadbook/host")` 拿后者的。
 * 走 `loadChunk` 而不是自己取工厂调用：那一段（注入宿主 → 调工厂 → 落槽）正是被测的真代码。
 */
function evolveBundle(options) {
    const bundle = loadBundle(options);
    return { exports: bundle.exports, evolve: loadChunk(bundle, 'evolve') };
}

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
    const { evolveVerdictOf, evolveVerdictKey } = evolveBundle().evolve;
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
    const { evolveView } = evolveBundle().evolve;
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
    const { exports, evolve } = evolveBundle();
    const { dictionaries } = exports.__internals;
    const { evolveView, evolveFrame } = evolve;
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
    const { exports, evolve } = evolveBundle();
    const { dictionaries } = exports.__internals;
    const { evolveView, evolveFrame } = evolve;
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
    const { exports, evolve } = evolveBundle({
        fetch: async (url, init) => {
            requests.push({ url, method: init && init.method, body: init && init.body });
            return { ok: true, status: 200, json: async () => ({ ok: true, signals: [] }) };
        },
    });
    // 请求函数搬进了分块，路由词仍留在核心 —— 分块也是从 host 里读这两个词的，
    // 所以这一条同时钉住了「分块与核心指同一条路由」。
    const { fetchEvolveStatus, fetchEvolveTick } = evolve;
    const { EVOLVE_STATUS_PATH, EVOLVE_TICK_PATH } = exports.__internals;
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
    const missing = evolveBundle({ fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) }) });
    const gone = await missing.evolve.fetchEvolveStatus();
    assert.equal(gone.ok, false);
    assert.equal(gone.unavailable, true);
    assert.equal(missing.evolve.evolveView(gone), null, '读不到 = 整块不渲染（不是空表，更不是全绿）');

    const offline = evolveBundle({
        fetch: async () => {
            throw new Error('Failed to fetch');
        },
    });
    assert.equal((await offline.evolve.fetchEvolveStatus()).unavailable, true);

    const refused = evolveBundle({
        fetch: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'untrusted-origin' }) }),
    });
    const denied = await refused.evolve.fetchEvolveStatus();
    assert.equal(denied.unavailable, false, '403 是「路由在但拒绝了」：要显示原因，不能静默');
    assert.equal(denied.reason, 'untrusted-origin');

    // 200 但 ok !== true（宿主自己的兜底形状）也不许被当成一份读数
    const odd = evolveBundle({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'handler', message: 'boom' }) }) });
    const bad = await odd.evolve.fetchEvolveStatus();
    assert.equal(bad.ok, false);
    assert.equal(bad.unavailable, false);
    assert.equal(bad.reason, 'handler');
});

test('自进化标签页：分块就位后首帧渲染「正在读取信号…」，根节点满足原生 tab 高度契约，标题双语', () => {
    const { exports, evolve } = evolveBundle();
    const descriptor = descriptorOf(exports, { locale: 'zh-CN' }, EVOLVE_TAB_ID);
    assert.equal(descriptor.id, EVOLVE_TAB_ID);
    assert.equal(exports.EVOLVE_TAB_ID, EVOLVE_TAB_ID);
    assert.equal(descriptor.title(), '自进化');
    // 英文标题要另起一个 bundle：同一个 bundle 的模块级幂等标记不会让第二次注册生效
    const enBundle = evolveBundle();
    const en = descriptorOf(enBundle.exports, { locale: 'en-US' }, EVOLVE_TAB_ID);
    assert.equal(en.title(), 'Evolution');
    assert.equal(en.description(), 'Self-evolution signals: breach / OK / undecided, reported as three separate states');
    // 分块必须真的交出界面：否则边界组件会永远停在「加载中」，而上面这些标题照样是对的
    // （那正是「注册对了但界面打不开」的假绿）。
    assert.equal(typeof evolve.EvolvePanel, 'function', '分块必须导出 EvolvePanel');
    assert.equal(typeof evolve.evolveIcon, 'function', '分块必须导出 evolveIcon（描述符的图标读它）');

    const tabProps = {
        ctx: { locale: 'zh-CN', betterSidebar: { features: [] } },
        store: { getPrefs: () => ({ pluginSettings: {} }) },
        scope: { sessionId: 'session-1', cwd: '/repo' },
        tab: { type: EVOLVE_TAB_ID },
        visible: true,
        onReferenceFile() {},
    };
    // 描述符的 component 是分块边界：先把 props 交给真组件这条接线本身也要钉住 ——
    // 否则「标签页在、内容永远停在加载中」会是一种全绿的坏法。
    const boundary = descriptor.component(tabProps);
    assert.equal(boundary.type, evolve.EvolvePanel, '分块就位后边界必须渲染真组件');
    assert.equal(boundary.props, tabProps, 'props 必须原样透传');

    const tree = evolve.EvolvePanel(tabProps);
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
