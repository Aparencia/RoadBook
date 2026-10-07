/**
 * 客户端契约测试 · 图册面（2026-10-07 D14 拆分）。
 *
 * 本文件装的是「图册标签页与它背后那套网页端路由」这一面：
 *   - 图册标签页组件的高度契约与首帧渲染；
 *   - 预览与归档 URL（/sidebar/html、/sidebar/archive）与 better-sidebar 同算法；
 *   - 目录指纹、规格字节数与三态过期判定（changed / same / unknown）；
 *   - 空态「让 agent 生成架构图」按钮的判据、请求形状与失败显示；
 *   - 相对图纸目录的绝对化折算（真机 BUG：is not an absolute path）与接线守卫。
 *
 * 来源：test/client-contract.test.mjs（拆前 1457 行 > D14 测试豁免线 1000；2026-10-07 按被测面切三份）。
 * 同批：client-contract-shell.test.mjs（外壳面）、client-contract-panels.test.mjs（面板面）。
 * 共享夹具：test/helpers/client-contract-harness.mjs（显式 import，不复制）。
 * 用例一字未改，只搬位置 + 按本文件实际用到的标识符重建 import 清单。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    SOURCE,
    TAB_ID,
    collectElements,
    collectLabels,
    loadBundle,
    sidebarCtx,
} from './helpers/client-contract-harness.mjs';

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

// ── 2026-10-05 第二批（预览与规格这一半）：预览截断、自动刷新指纹、规格过期判定 ──
// 这些口径钉住的都是「只能靠真机肉眼验」的事，所以必须在 Node 里先钉死；同批的语言快照那一条
// 2026-10-07 拆分后落在 client-contract-shell.test.mjs。

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

// ── 2026-10-06：图册空态「让 agent 生成架构图」按钮 ──────────────────────────
// 用户诉求：侧栏图册里**还没有架构图**时，给一个能点的入口把 agent 叫起来（此前只有「复制提示词」，
// 人还得自己切窗口粘）。方案 A = 复用 better-sidebar 现成的 `sidechat.start`（开一个继承当前
// 会话上下文的子会话，不污染主对话），因此本组要钉住三件事：**什么时候出现**（判据）、
// **发出去的请求长什么样**（形状）、**失败怎么显示**（不许静默）。
// 判定与渲染都抽成了纯函数 —— 假 React 不跑 effect，「目录读完了」那一帧在 Node 里驱动不到。

/** 从语言注册里取回两份表（同「双语表注册」用例的做法）。 */
function dictionariesOf(exports) {
    const dicts = {};
    exports.apply(sidebarCtx({
        locale: { register: (ns, locale, dict) => { dicts[locale] = dict; return () => {}; } },
        betterSidebar: { features: [], registerTab: () => () => {} },
    }));
    return dicts;
}

test('空态生成按钮：没有架构图才出现（空目录 / 只有非架构图），已有架构图就不打扰', () => {
    const { exports } = loadBundle();
    const { generateBlockFor } = exports.__internals;
    const t = (key) => key;
    const ready = (items) => ({ status: 'ready', items });

    // V1 空目录 → 出现，且文案来自语言表
    const empty = generateBlockFor(ready([]), { status: 'idle' }, t, () => {});
    assert.ok(empty, '空目录必须有生成入口');
    assert.ok(collectLabels(empty).includes('action.generate'), '按钮文案要来自语言表');

    // V2 只有非架构图 → 仍然出现（用户要的是「没有架构图」，不是「目录为空」）
    const workflowOnly = generateBlockFor(ready([{ slug: 'a', type: 'workflow' }]), { status: 'idle' }, t, () => {});
    assert.ok(workflowOnly, '只有 workflow 图纸时也要能一键生成架构图');

    // V3 已有架构图 → 不出现
    assert.equal(
        generateBlockFor(ready([{ slug: 'a', type: 'architecture' }]), { status: 'idle' }, t, () => {}),
        null,
        '已有架构图不再引导'
    );

    // 目录还不存在（首次使用 / 新项目）→ **也要出现**：这正是最需要它的时刻
    const missingDir = generateBlockFor({ status: 'error', items: [], error: 'ENOENT', missingDir: true }, { status: 'idle' }, t, () => {});
    assert.ok(missingDir, '目录不存在时更要给入口（新项目就是这种）');

    // 其余读取失败不抢错误态的位置
    assert.equal(generateBlockFor({ status: 'loading', items: [] }, { status: 'idle' }, t, () => {}), null);
    assert.equal(generateBlockFor({ status: 'error', items: [], error: 'x' }, { status: 'idle' }, t, () => {}), null);
    assert.equal(generateBlockFor({ status: 'error', items: [], error: 'x', missingDir: false }, { status: 'idle' }, t, () => {}), null);
});

test('生成按钮点下去：POST /sidebar/api/sidechat.start，body 带 sessionId / cwd / question', async () => {
    const requests = [];
    const { exports } = loadBundle({
        fetch: async (url, init) => {
            requests.push({ url: String(url), method: init && init.method, body: JSON.parse(init.body) });
            return { ok: true, status: 200, json: async () => ({ ok: true, value: { childId: 'session-x' } }) };
        },
    });
    const dicts = dictionariesOf(exports);
    const t = (key) => dicts.zh[key] || key;

    const result = await exports.__internals.startSidechatGenerate({ sessionId: 'session-1', cwd: '/repo' }, 'docs/diagrams', t);
    assert.deepEqual(result, { childId: 'session-x' });
    assert.equal(requests.length, 1, '只发一次请求');
    assert.equal(requests[0].url, '/sidebar/api/sidechat.start', '走现成的侧聊 seam，不自建接口');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body.sessionId, 'session-1');
    assert.equal(requests[0].body.cwd, '/repo');
    assert.match(requests[0].body.question, /roadbook-atlas/, '提示词要点名技能');
    assert.match(requests[0].body.question, /docs\/diagrams/, '提示词要带上用户配置的图纸目录');
});

test('生成按钮失败：如实把宿主给的原因传上来并显示（409 不许静默）', async () => {
    const { exports } = loadBundle({
        fetch: async () => ({
            ok: false,
            status: 409,
            json: async () => ({ error: { code: 'sidechat-error', message: 'parent session "session-1" is not running' } }),
        }),
    });
    const dicts = dictionariesOf(exports);
    const t = (key) => dicts.zh[key] || key;

    await assert.rejects(
        () => exports.__internals.startSidechatGenerate({ sessionId: 'session-1', cwd: '/repo' }, 'docs/diagrams', t),
        /is not running/,
        '宿主的原因必须原样传上来'
    );

    const failed = exports.__internals.generateBlockFor(
        { status: 'ready', items: [] },
        { status: 'error', error: 'is not running' },
        t,
        () => {}
    );
    const labels = collectLabels(failed).join(' ');
    assert.match(labels, /没能唤起 agent/, '界面要说清是「没唤起」，不是「画失败了」');
    assert.match(labels, /is not running/, '原因要显示出来，不许吞');
});

test('生成中：同一颗按钮禁用 + 文案切换（不新开入口）', () => {
    const { exports } = loadBundle();
    const view = { status: 'ready', items: [] };

    for (const status of ['starting', 'started']) {
        const block = exports.__internals.generateBlockFor(view, { status, error: '' }, (key) => key, () => {});
        const buttons = collectElements(block, 'button');
        assert.equal(buttons.length, 1, '仍然只有一颗生成按钮');
        assert.equal(buttons[0].props.disabled, true, `${status} 时必须禁用，防连点`);
        assert.equal(buttons[0].children[0], 'action.generating');
    }

    const idle = collectElements(exports.__internals.generateBlockFor(view, { status: 'idle' }, (key) => key, () => {}), 'button');
    assert.equal(idle[0].props.disabled, false, 'idle 时可点');
    assert.equal(idle[0].children[0], 'action.generate');
});

// ── 2026-10-06 真机 BUG（用户截图）：图册默认目录是「相对项目根」，而 better-sidebar 的 fs API 只收绝对路径 ──
// 真机原文：读取失败：docs/diagrams is not an absolute path
// 宿主判据：dsh-better-sidebar/lib/index.js 的 requireAbsolute() —— !isAbsolute(path) 直接 400。
// 为什么此前全绿：契约测试的假 /sidebar API 从不执行那道校验，于是「没人做折算」在测试里是隐形的
// —— 又一次「接线层必须有自己的测试」。

test('图册列目录：相对目录必须先按 cwd 折算成绝对路径再调 fs.tree（默认 docs/diagrams 不能开箱即坏）', async () => {
    const requests = [];
    const { exports } = loadBundle({
        fetch: async (url, init) => {
            requests.push({ url: String(url), body: JSON.parse(init.body) });
            return { ok: true, status: 200, json: async () => ({ ok: true, value: { path: 'C:/proj/docs/diagrams', entries: [] } }) };
        },
    });
    await exports.__internals.listDiagrams({ sessionId: 'session-1', cwd: 'C:/proj' }, 'docs/diagrams');
    assert.equal(requests[0].url, '/sidebar/api/fs.tree');
    assert.equal(requests[0].body.path, 'C:/proj/docs/diagrams', '相对目录必须折算成绝对路径，否则宿主 400：is not an absolute path');
});

test('折算算法与 better-sidebar 同判据：isAbsolutePath 三种绝对写法 + resolveSidebarPath 边界表', () => {
    const { isAbsolutePath, resolveSidebarPath } = loadBundle().exports.__internals;
    // 绝对判据（对齐 dsh-better-sidebar/lib/client.js:848）：POSIX 根 / 盘符 / UNC 两种写法
    for (const value of ['/home/u/proj', 'C:/proj', 'C:\\proj', '\\\\srv\\share', '//srv/share']) {
        assert.equal(isAbsolutePath(value), true, `${value} 必须判成绝对，否则会被拼到 cwd 后面`);
    }
    for (const value of ['docs/diagrams', './docs', 'C:foo', '']) {
        assert.equal(isAbsolutePath(value), false, `${value} 必须判成相对（C:foo 是盘符相对，宿主同样拒收）`);
    }
    // 折算（对齐 dsh-better-sidebar/lib/client.js:912）
    assert.equal(resolveSidebarPath('C:/proj', 'docs/diagrams'), 'C:/proj/docs/diagrams');
    assert.equal(resolveSidebarPath('C:\\proj', 'docs\\diagrams'), 'C:\\proj\\docs\\diagrams', 'base 是反斜杠 → 用反斜杠连接');
    // 分隔符只由 base 决定，相对路径**原文里的**分隔符一个都不改（与宿主逐字同算法）：
    // Windows 的 isAbsolute 认混合写法，宿主随后还会 resolve() 归一，所以这里不去"顺手修正"。
    assert.equal(resolveSidebarPath('C:\\proj', 'docs/diagrams'), 'C:\\proj\\docs/diagrams', '原文分隔符不动（混合写法宿主照样认）');
    assert.equal(resolveSidebarPath('/home/u/proj/', 'docs/diagrams'), '/home/u/proj/docs/diagrams', 'base 末尾分隔符只 trim');
    assert.equal(resolveSidebarPath('C:/proj', 'D:/other/x'), 'D:/other/x', '已是绝对 → 原样返回（一个字符都不动）');
    assert.equal(resolveSidebarPath('', 'docs/diagrams'), 'docs/diagrams', '没有 cwd 不硬拼：保持旧行为，让宿主的报错如实冒上来');
    assert.equal(resolveSidebarPath(undefined, 'docs/diagrams'), 'docs/diagrams', 'cwd 缺席同理');
});

// 接线守卫：BUG-002 的形状（配置原文原样进 fs API）不许在源码里再出现 ——
// 任何一处漏折算都当场判红，而不是等真机上再看见一次「读取失败」。

test('接线守卫：fs 调用的 path 不许原样透传配置原文（BUG-002 的形状）', () => {
    assert.ok(!/"fs\.(tree|trees|read|list|write)", \{ path: dir \}/.test(SOURCE), 'fs API 的 path 必须先经 resolveSidebarPath 折算');
});
