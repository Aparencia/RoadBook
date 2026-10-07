/**
 * Roadbook Atlas —— 浏览器半（hand-written ModuleLoader bundle）。
 *
 * 规则（照 DSH 手写客户端半的既定约定，勿破）：
 *   - 全文件只有一次 window.__ModuleLoader__.load({...})，id 必须等于包名；
 *   - require 只允许取基线模块（这里只用 react），外加**一个**核心自己注入的虚拟 id
 *     `roadbook/host`（分块用；宿主不会去解析它，是本半的 require 包装器接的）；
 *   - 纯 React.createElement，无 JSX / TS，无构建步骤；
 *   - 组件定义在模块层，工厂内不做副作用；
 *   - 只用 useState / useEffect / useCallback（契约测试的假 React 只提供这三个）；
 *   - 导出的 inject **必须是空数组**：顶层 inject 里的服务缺席或迟到，本行的 fiber 就是
 *     「未激活 / 没有 fiber」，而 DSH 的 web boot 把任一未激活条目判成致命错误
 *     （`web boot: N entry did not activate` → 应用打不开）。两个外部服务
 *     （`slots` / `betterSidebar`）一律走 `ctx.inject([...], …)` 作用域注入。
 *
 * 这一半只读图纸、不改图纸：列表 + 内嵌预览 + 打开 + 导出 + 打包导出。
 * 生成与校验在 skill + CLI（skills/roadbook-atlas/）里做，agent 负责跑。
 *
 * 2026-10-05 四件事改法（都有实测依据，勿回退）：
 *   1) 预览改走 better-sidebar 的 `/sidebar/html` 预览路由（服务端已带 CSP sandbox），
 *      不再把整份 HTML 经 `fs.read` 搬进 srcDoc —— `fs.read` 的 readLimit 默认 512 KB，
 *      而实测五类图纸产物是 608.4–611.7 KB，旧路径**每次预览都被静默截断到 83.9%**。
 *   2) `fs.tree` 的 `entry.path` 是绝对路径，必须用它：`/sidebar/html` 路由没有 cwd 参数，
 *      相对路径会被解成盘根（`decodeHtmlUrl` 会补成 `/…`）。
 *   3) 元信息读取改为有界并发（原来是最多 40 次串行 HTTP），并按 fs.tree 名称指纹轮询自动刷新。
 *   4) 语言走 `ctx.locale.register/bind`：真实服务里活动语言是 `getSnapshot().active`，
 *      旧代码读的 `ctx.locale.current` 在真机上不存在 —— 界面恒为中文。
 */
window.__ModuleLoader__.load({
	id: "roadbook",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var E = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useCallback = React.useCallback;

		/** 标签页 id：同时是 SidebarTab.type，也是本插件设置的持久化键。 */
		var TAB_ID = "roadbook:gallery";
		/** 图纸默认目录（相对项目根）；与宿主半 DEFAULT_DIAGRAM_DIR、SKILL.md 三处一致。 */
		var DEFAULT_DIR = "docs/diagrams";
		var SPEC_EXT = ".atlas.json";
		var HTML_EXT = ".html";
		var RECEIPT_EXT = ".receipt.json";
		/** 列表里最多自动读多少份回执/规格元信息（防止大目录把标签页拖死）。 */
		var MAX_META_READS = 40;
		/** 元信息读取的并发上限（有界并发：既压掉串行排队，又不把宿主打爆）。 */
		var META_CONCURRENCY = 6;
		/** 目录轮询间隔：只比 fs.tree 的名称指纹，变了才重新读元信息。 */
		var POLL_INTERVAL_MS = 15000;
		/** 打包导出的轮询间隔（与 better-sidebar 自己的导出用同一个节奏）。 */
		var ZIP_POLL_MS = 250;
		/** 本插件在 DSH locale 注册表里的命名空间。 */
		var LOCALE_NS = "roadbook";
		/** better-sidebar 的 HTML 预览路由前缀（与服务端 `HTML_ROUTE_PREFIX` 一致）。 */
		var HTML_ROUTE_PREFIX = "/sidebar/html/";
		/**
		 * 宿主半（lib/index.js）注册的两条本机路由：读状态与发起更新。
		 * 两条都是同源相对路径，浏览器直接 fetch；宿主半没有它们（旧版本 / webServer 服务没起来）时
		 * 更新条整条不渲染 —— 不留一个点了必然报错的死按钮。
		 */
		var UPDATE_STATUS_PATH = "/roadbook/update/status";
		var UPDATE_APPLY_PATH = "/roadbook/update/apply";
		/** 更新进行中的轮询间隔（与宿主半的安装命令超时无关，只影响界面刷新频率）。 */
		var UPDATE_POLL_MS = 1000;
		/**
		 * 宿主半（lib/index.js）为「自进化」标签页注册的两条本机路由：
		 *   GET  /roadbook/evolve/status —— 读当前信号表（只读）
		 *   POST /roadbook/evolve/tick   —— 强制重算，回**同一形状**
		 * 与更新条同一条口径：宿主没起 / webServer 服务缺席时整块降级显示，不留死按钮。
		 */
		var EVOLVE_STATUS_PATH = "/roadbook/evolve/status";
		var EVOLVE_TICK_PATH = "/roadbook/evolve/tick";
		/** 第二个标签页的 id（同时是 SidebarTab.type）。 */
		var EVOLVE_TAB_ID = "roadbook:evolve";
		/** 标签页排序：图册 45，自进化紧随其后 46。 */
		var EVOLVE_ORDER = 46;
		/**
		 * auto 模式的自动发起是否已经用掉（模块层，不随重渲染重置）：
		 * 每次页面加载最多自动发起一次，否则轮询会把同一个更新反复提交。
		 */
		var autoApplied = false;
		/**
		 * 插件版本，显示在标签页页脚，方便一眼看出界面里跑的是哪一版。
		 * 必须与 package.json 的 version 一致 —— test/client-contract-shell.test.mjs 会逐字核对，
		 * 因为客户端 bundle 不能用 require 读 package.json（ModuleLoader 的 require 只有白名单）。
		 */
		var PLUGIN_VERSION = "0.9.1";

		// ── 客户端分块（chunk）：自建装载器 + 自建注册表 ────────────────────────────
		/**
		 * 分块路由前缀。**必须与宿主半 `lib/chunks.js` 的 `CHUNK_ROUTE_PREFIX` 逐字一致**
		 * （`test/chunks.test.mjs` 拿两边的取值逐字比对 —— 改一处忘另一处 = 全是 404）。
		 */
		var CHUNK_ROUTE_PREFIX = "/roadbook/bundle";
		/** 分块注册表：分块脚本自己往里登记工厂（脚本首两行），核心只读它。 */
		var CHUNK_REGISTRY_KEY = "__roadbookChunks__";
		/** 宿主件（样式 / 文案 / 工具 / 路由词）挂在这个自有全局上，分块用 `require("roadbook/host")` 取。 */
		var CHUNK_HOST_KEY = "__roadbookChunkHost__";
		/** 已装载的分块（名字 → exports）｜装载中的 promise（同一分块只注入一次脚本）。 */
		var chunkModules = {};
		var chunkLoads = {};
		/** 装载失败的原因（名字 → 一句话）：界面据此把「加载中」换成「加载失败」，不留死转圈。 */
		var chunkFailures = {};

		/** 分块脚本的 URL（纯函数，契约测试直接钉住）。 */
		function chunkUrlOf(name) {
			return CHUNK_ROUTE_PREFIX + "/" + name + ".js";
		}

		/** 已装载的分块模块；没有则 null（描述符的 icon 走这条**同步**读法）。 */
		function chunkModuleOf(name) {
			return chunkModules[name] || null;
		}

		/**
		 * 从注册表取工厂并调用它 —— 分块装载的**纯逻辑部分**（不碰 DOM，Node 里可整条钉住）。
		 *
		 * 失败一律抛错而不回 undefined：分块没登记（路由没起 / 文件没落盘 / 名字与宿主白名单不一致）
		 * 与「工厂返回空表」是两种不同的故障，都必须看得见 —— 静默降级成一片空白正是本仓最恨的假绿。
		 */
		function resolveChunk(registry, name, requireOf) {
			var factory = registry && typeof registry[name] === "function" ? registry[name] : null;
			if (factory === null) throw new Error("分块 " + name + " 没有登记工厂（" + chunkUrlOf(name) + " 没加载成功，或名字与宿主半白名单不一致）");
			var loaded = factory(requireOf);
			if (!loaded || typeof loaded !== "object") throw new Error("分块 " + name + " 的工厂没有返回导出表");
			chunkModules[name] = loaded;
			return loaded;
		}

		/** 分块拿到的 require：基线模块照旧交给 ModuleLoader，另有**唯一一个**虚拟 id `roadbook/host`。 */
		function chunkRequireOf(id) {
			if (id === "roadbook/host") return globalThis[CHUNK_HOST_KEY];
			return require(id);
		}

		/** 生产形状的取分块：注册表取自自有全局 —— `loadChunk` 与契约测试**共用这一条路径**。 */
		function takeChunk(name) {
			return resolveChunk(globalThis[CHUNK_REGISTRY_KEY], name, chunkRequireOf);
		}

		/** 注入 `<script>` 并等它登记工厂；同一分块只注入一次（重复调用拿同一个 promise）。 */
		function loadChunk(name) {
			if (chunkModules[name]) return Promise.resolve(chunkModules[name]);
			if (chunkLoads[name]) return chunkLoads[name];
			chunkLoads[name] = new Promise(function (resolve, reject) {
				var script = document.createElement("script");
				script.src = chunkUrlOf(name);
				script.async = true;
				script.onload = function () {
					try {
						resolve(takeChunk(name));
					} catch (error) {
						reject(error);
					}
				};
				script.onerror = function () {
					reject(new Error("分块 " + name + " 加载失败：" + chunkUrlOf(name)));
				};
				document.head.appendChild(script);
			});
			// 失败的 promise 不许留在表里：下次挂载还要能重试（否则一次网络抖动就永久空白）。
			chunkLoads[name].catch(function (error) {
				chunkFailures[name] = String((error && error.message) || error);
				delete chunkLoads[name];
			});
			return chunkLoads[name];
		}

		/** 等分块到位；在 `useEffect` 里调，装载完成后 setState 触发重渲染。 */
		function useChunk(name) {
			var pair = useState(chunkModuleOf(name));
			var loaded = pair[0];
			var setLoaded = pair[1];
			useEffect(function () {
				if (loaded) return undefined;
				var alive = true;
				loadChunk(name).then(function (module) {
					if (alive) setLoaded(module);
				}, function () {
					/* 失败已记进 chunkFailures；这里不 setState，避免失败也重渲染成环 */
				});
				return function () {
					alive = false;
				};
			}, [name]);
			return loaded;
		}

		/**
		 * 分块边界组件：分块没到位时渲染「加载中 / 加载失败」，到位后渲染真组件。
		 *
		 * 为什么要有它，而不是「等分块到了再注册标签页」：注册发生在 better-sidebar 的注入回调里，
		 * 在那里等网络的话，`webServer` 缺席（分块 404）会让**整张标签页消失**；而现在这张标签页
		 * 在宿主半缺席时会显示「这条路由没有」。边界组件把那条降级路径原样保住。
		 */
		function chunkBoundary(name, exportName) {
			return function ChunkBoundary(props) {
				var loaded = useChunk(name);
				var component = loaded && typeof loaded[exportName] === "function" ? loaded[exportName] : null;
				if (component) return E(component, props);
				var failure = chunkFailures[name] || "";
				return E(
					"div",
					{ style: { padding: "12px", fontSize: "12px", lineHeight: "1.6", color: failure ? TOKEN.warn : TOKEN.muted } },
					dict(props.ctx)(failure ? "chunk.failed" : "chunk.loading")
				);
			};
		}

		/**
		 * 目录列表指纹（缓存键 → 上一次看到的名称集合）。
		 *
		 * 为什么放模块层而不是组件 state：轮询 effect 要在不重新订阅的前提下比较两次快照，
		 * 而本半只允许用 useState / useEffect / useCallback（没有 useRef）。
		 * 键里带 sessionId 与目录，所以跨会话、跨目录互不干扰。
		 */
		var seenListings = {};

		// ── 文案 ──────────────────────────────────────────────────────────────
		var zh = {
			"tab.title": "图册",
			"tab.desc": "JSON 规格渲染成的图纸：预览、打开、导出",
			"action.refresh": "刷新",
			"action.back": "返回列表",
			"action.preview": "预览",
			"action.open": "打开",
			"action.export": "导出",
			"action.exportAll": "打包导出",
			"action.spec": "引用规格",
			"action.copy": "复制路径",
			"action.copied": "已复制",
			"action.copyPrompt": "复制提示词",
			"action.generate": "让 agent 生成架构图",
			"action.generating": "已交给 agent…",
			"state.generateHint": "会在侧聊会话里跑，不占用当前这段对话；图纸画好后这里会自动出现。",
			"state.generateFailed": "没能唤起 agent：",
			"state.generatePrompt": "用 roadbook-atlas 技能给当前项目画一张架构图：先读仓库结构与关键目录，把 architecture 规格写到 {dir}/<slug>.atlas.json，再跑 node skills/roadbook-atlas/bin/atlas.mjs render <规格路径>；退出码 0 才算完成，把回执三行贴给我。",
			"state.loading": "正在读取图纸…",
			"state.empty": "这个目录里还没有图纸",
			"state.emptyHint": "对 agent 说下面这句，规格会落在目录里的 *.atlas.json，图纸是同名 *.html。",
			"state.emptyPrompt": "用 roadbook-atlas 画一张 <主题> 的架构图。",
			"state.error": "读取失败",
			"state.missingDir": "目录不存在（首次生成图纸时会自动创建）",
			"state.zipBuilding": "正在打包…",
			"state.zipFailed": "打包失败",
			"badge.ready": "图纸已生成",
			"badge.specOnly": "仅规格",
			"badge.orphan": "缺规格",
			"badge.receipt": "有回执",
			"badge.noReceipt": "无回执",
			"badge.stale": "规格已改",
			"badge.staleUnknown": "规格无法比对",
			"label.quality": "档位",
			"label.renderedAt": "生成于",
			"label.size": "大小",
			"hint.settings": "目录在 设置 → 侧边卡片 → 图册 里改",
			"hint.stale": "规格比图纸新：让 agent 重跑 atlas render 才是最新图纸。",
			"hint.staleUnknown": "本机拿不到 WebCrypto（界面不是从 localhost / https 打开）：只能确认规格字节数没变，比不了内容。",
			"hint.metaCapped": "条目过多，仅读了前 40 张的元信息（列表仍完整）。",
			"settings.dir.title": "图纸目录",
			"settings.dir.desc": "相对项目根目录；默认 docs/diagrams",
			"update.check": "检查更新",
			"update.apply": "更新",
			"update.checking": "正在检查更新…",
			"update.available": "有新版本 v{latest}（当前 v{installed}）",
			"update.upToDate": "已是最新（v{installed}）",
			"update.ahead": "本地领先远端（v{installed}）",
			"update.dev": "开发安装，不在这里更新",
			"update.unknown": "检查失败：{reason}",
			"update.idle": "暂未检查（距上次不到设定的间隔）",
			"update.noReason": "未知原因",
			"update.applyFailed": "更新没发起：{reason}",
			"update.applying": "正在更新（{label}）…",
			"update.applied": "已更新 v{before} → v{after}",
			"update.noChange": "已是最新（v{installed}），无需重启",
			"update.failed": "更新失败（exit {code}）",
			"update.restartHint": "重启 DSH 后生效",
			"update.noApplier": "本机找不到可用的安装命令",
			"detail.check": "检查更新",
			"detail.apply": "更新",
			"detail.checking": "正在检查…",
			"detail.badgeUpdate": "可更新 v{latest}",
			"detail.badgeRestart": "待重启",
			"detail.running": "运行版本",
			"detail.onDisk": "磁盘版本",
			"detail.upstream": "上游版本",
			"detail.notChecked": "还没有检查过",
			"detail.checkedAt": "上次检查 {at}",
			"detail.upgradeApplied": "上次更新已生效：v{before} → v{target}",
			"detail.upgradePending": "上次更新未生效：目标 v{target}，当前仍运行 v{running}",
			"detail.upgradeNewer": "当前运行 v{running}，已比上次更新的目标 v{target} 新",
			"evolve.tabTitle": "自进化",
			"chunk.loading": "正在加载这个标签页的脚本…",
			"chunk.failed": "这个标签页的脚本没加载成功（宿主半的 bundle 路由没起，或分块文件缺失）。",
			"evolve.tabDesc": "自进化信号表：越界 / 正常 / 判不了，三态分开报",
			"evolve.tick": "重算",
			"evolve.ticking": "正在重算…",
			"evolve.retry": "重试",
			"evolve.loading": "正在读取信号…",
			"evolve.unavailable": "宿主半没有这条路由（本行没起，或 webServer 服务缺席）",
			"evolve.unavailableHint": "切走再切回这个标签页会重试；这里不放假按钮。",
			"evolve.error": "读取失败",
			"evolve.empty": "没有信号",
			"evolve.generatedAt": "生成于",
			"evolve.tally.hit": "越界",
			"evolve.tally.ok": "正常",
			"evolve.tally.unknown": "判不了",
			"evolve.verdictNote": "判不了 ≠ 通过：读不到就是不通过",
			"evolve.noReading": "无读数",
			"evolve.threshold": "阈值",
			"evolve.liveness": "自身活性",
			"evolve.livenessTicks": "tick {count} 次",
			"evolve.livenessLast": "最近 {time}",
			"evolve.livenessNever": "还没有 tick 记录",
			"evolve.livenessAge": "距今 {minutes} 分钟",
			"evolve.autoload": "自动加载观测",
			"evolve.autoloadLine": "记录 {total} · 加载 {loaded} · 注入 {inject} · 指纹 {cardRead} · 空转 {idle}",
			"evolve.suspect": "测试痕量 {suspect}/{total}",
			"evolve.update": "更新观测",
			"evolve.updateLine": "记录 {total} · 检查 {checks} · 发起 {applyStart} · 失败 {applyFailures}"
		};
		var en = {
			"tab.title": "Atlas",
			"tab.desc": "Diagrams rendered from JSON specs: preview, open, export",
			"action.refresh": "Refresh",
			"action.back": "Back to list",
			"action.preview": "Preview",
			"action.open": "Open",
			"action.export": "Export",
			"action.exportAll": "Export all",
			"action.spec": "Reference spec",
			"action.copy": "Copy path",
			"action.copied": "Copied",
			"action.copyPrompt": "Copy prompt",
			"action.generate": "Ask the agent to draw it",
			"action.generating": "Handed to the agent…",
			"state.generateHint": "Runs in a side chat, so this conversation stays clean; the diagram shows up here when it is ready.",
			"state.generateFailed": "Could not start the agent: ",
			"state.generatePrompt": "Use the roadbook-atlas skill to draw an architecture diagram of this project: read the repository structure first, write the architecture spec to {dir}/<slug>.atlas.json, then run node skills/roadbook-atlas/bin/atlas.mjs render <spec path>; exit code 0 is the only definition of done — paste the three receipt lines back to me.",
			"state.loading": "Loading diagrams…",
			"state.empty": "No diagrams in this directory yet",
			"state.emptyHint": "Ask the agent with the sentence below; specs land as *.atlas.json and artifacts as the matching *.html.",
			"state.emptyPrompt": "Draw an architecture diagram of <topic> with roadbook-atlas.",
			"state.error": "Read failed",
			"state.missingDir": "Directory does not exist yet (created on first render)",
			"state.zipBuilding": "Packaging…",
			"state.zipFailed": "Packaging failed",
			"badge.ready": "rendered",
			"badge.specOnly": "spec only",
			"badge.orphan": "no spec",
			"badge.receipt": "receipt",
			"badge.noReceipt": "no receipt",
			"badge.stale": "spec changed",
			"badge.staleUnknown": "spec unverified",
			"label.quality": "Quality",
			"label.renderedAt": "Rendered",
			"label.size": "Size",
			"hint.settings": "Directory is configurable in Settings → Side cards → Atlas",
			"hint.stale": "The spec is newer than the artifact: ask the agent to re-run atlas render.",
			"hint.staleUnknown": "WebCrypto is unavailable here (the UI is not served from localhost or https): only the spec byte count could be checked, not its content.",
			"hint.metaCapped": "Too many entries; metadata was read for the first 40 only (the list is complete).",
			"settings.dir.title": "Diagram directory",
			"settings.dir.desc": "Relative to the project root; defaults to docs/diagrams",
			"update.check": "Check",
			"update.apply": "Update",
			"update.checking": "Checking for updates…",
			"update.available": "v{latest} available (current v{installed})",
			"update.upToDate": "Up to date (v{installed})",
			"update.ahead": "Local is ahead of upstream (v{installed})",
			"update.dev": "Development install; not updated here",
			"update.unknown": "Check failed: {reason}",
			"update.idle": "Not checked yet (within the configured interval)",
			"update.noReason": "unknown reason",
			"update.applyFailed": "Update not started: {reason}",
			"update.applying": "Updating ({label})…",
			"update.applied": "Updated v{before} → v{after}",
			"update.noChange": "Already up to date (v{installed}); no restart needed",
			"update.failed": "Update failed (exit {code})",
			"update.restartHint": "Restart DSH to apply",
			"update.noApplier": "No usable installer command on this machine",
			"detail.check": "Check",
			"detail.apply": "Update",
			"detail.checking": "Checking…",
			"detail.badgeUpdate": "v{latest} available",
			"detail.badgeRestart": "Restart needed",
			"detail.running": "Running",
			"detail.onDisk": "On disk",
			"detail.upstream": "Upstream",
			"detail.notChecked": "Not checked yet",
			"detail.checkedAt": "Last check {at}",
			"detail.upgradeApplied": "Last update applied: v{before} → v{target}",
			"detail.upgradePending": "Last update did not take effect: target v{target}, still running v{running}",
			"detail.upgradeNewer": "Running v{running}, newer than the last update target v{target}",
			"evolve.tabTitle": "Evolution",
			"chunk.loading": "Loading this tab's script…",
			"chunk.failed": "This tab's script did not load (the host bundle route is not up, or the chunk file is missing).",
			"evolve.tabDesc": "Self-evolution signals: breach / OK / undecided, reported as three separate states",
			"evolve.tick": "Recompute",
			"evolve.ticking": "Recomputing…",
			"evolve.retry": "Retry",
			"evolve.loading": "Loading signals…",
			"evolve.unavailable": "The host half does not expose this route (the host entry is not loaded, or the webServer service is missing)",
			"evolve.unavailableHint": "Switch away and back to this tab to retry; no dead buttons are shown here.",
			"evolve.error": "Read failed",
			"evolve.empty": "No signals",
			"evolve.generatedAt": "Generated",
			"evolve.tally.hit": "breach",
			"evolve.tally.ok": "OK",
			"evolve.tally.unknown": "undecided",
			"evolve.verdictNote": "\"Undecided\" is not \"passed\": no reading is not a pass",
			"evolve.noReading": "no reading",
			"evolve.threshold": "threshold",
			"evolve.liveness": "Own liveness",
			"evolve.livenessTicks": "{count} ticks",
			"evolve.livenessLast": "last {time}",
			"evolve.livenessNever": "no tick recorded yet",
			"evolve.livenessAge": "{minutes} min ago",
			"evolve.autoload": "Autoload observations",
			"evolve.autoloadLine": "records {total} · loaded {loaded} · inject {inject} · card-read {cardRead} · idle {idle}",
			"evolve.suspect": "test traces {suspect}/{total}",
			"evolve.update": "Update observations",
			"evolve.updateLine": "records {total} · checks {checks} · apply-start {applyStart} · failures {applyFailures}"
		};
		function looksEnglish(value) {
			return typeof value === "string" && value.toLowerCase().indexOf("en") === 0;
		}
		function lookup(tag, key) {
			var table = looksEnglish(tag) ? en : zh;
			var value = table[key];
			// 缺键时回显键名（截图里一眼能看出漏翻译）
			return typeof value === "string" ? value : key;
		}
		/**
		 * 读一个 cordis 服务，**保证永不抛错**。
		 *
		 * 背景（2026-10-05 实机事故，勿回退）：cordis 的服务访问是**严格**的。`ctx.locale`
		 * 这种「没写进 inject 的服务」不是返回 undefined，而是**直接 throw**：
		 *     cannot get property "locale" without inject
		 * 这个 throw 只要发生在 `apply()` 里，cordis 就把本行 fiber 置为 `failed`，
		 * 前端 boot 审计随即判死整个应用：
		 *     web boot: 1 entry did not activate / roadbook: failed →「应用无法启动或已意外停止」
		 * 0.2.3 之所以没事，是因为它只在**渲染期**读 locale，而渲染期的 ctx 是
		 * better-sidebar 传进组件的 `props.ctx`（那个 ctx 自己 inject 过 locale），
		 * 不是本插件自己的 ctx。凡是 `apply()` 这条**激活路径**上的服务读取，
		 * 一律必须走这里。
		 *
		 * 两条路都要有，顺序也不能反：
		 *   ① 先试属性访问 —— inject 过的服务（betterSidebar）走这条，语义最正（严格、可追踪）；
		 *   ② 属性访问抛错（未 inject）或为空 → 退回 `ctx.get(name, false)`：cordis 官方
		 *      「不带 inject 要求」的读法，服务不在时返回 undefined 而不抛。
		 *
		 * @param {object} ctx cordis 上下文（插件 ctx 或组件拿到的 props.ctx）
		 * @param {string} name 服务名
		 * @returns {*} 服务对象，读不到时 undefined
		 */
		function readService(ctx, name) {
			if (!ctx) return undefined;
			try {
				var direct = ctx[name];
				if (direct !== undefined && direct !== null) return direct;
			} catch (error) {
				// 未 inject 的服务：预期内，继续走 ②
			}
			try {
				if (typeof ctx.get === "function") {
					var viaGet = ctx.get(name, false);
					if (viaGet !== undefined && viaGet !== null) return viaGet;
				}
			} catch (error) {
				// 服务不存在 / get 签名不同：当作没有
			}
			return undefined;
		}
		/**
		 * 当前活动语言标签。
		 * 真实客户端 locale 服务的快照字段是 `active`（`getSnapshot().active`），
		 * 不是 `current` —— 只读 `current` 会让界面恒为中文。三种形状都认，读不到返回空串。
		 */
		function localeTagOf(ctx) {
			var service = readService(ctx, "locale");
			if (typeof service === "string") return service;
			if (!service) return "";
			try {
				if (typeof service.getSnapshot === "function") {
					var snapshot = service.getSnapshot();
					if (snapshot && typeof snapshot.active === "string") return snapshot.active;
				}
				if (typeof service.getLocale === "function") {
					var live = service.getLocale();
					if (live && typeof live.active === "string") return live.active;
				}
				if (typeof service.current === "string") return service.current;
			} catch (error) {
				return "";
			}
			return "";
		}
		/**
		 * 查表函数：优先走 DSH 的 locale 服务（`bind` 返回的翻译函数），
		 * 服务缺席或查不到时回退到本文件的双语表 —— 两条路都通，且只有一份文案。
		 */
		function dict(ctx) {
			var service = readService(ctx, "locale");
			var tag = localeTagOf(ctx);
			// 注意 `typeof service !== "string"`：字符串也继承 Function.prototype.bind，
			// 不排掉就会把 'zh-CN'.bind(...) 当成 locale 服务调。
			if (service && typeof service !== "string" && typeof service.bind === "function") {
				try {
					var bound = service.bind(LOCALE_NS);
					if (typeof bound === "function") {
						return function (key) {
							var value = bound(key);
							return typeof value === "string" && value !== key ? value : lookup(tag, key);
						};
					}
				} catch (error) {
					/* 服务坏了不该让标签页崩掉：直接回退本地表 */
				}
			}
			return function (key) {
				return lookup(tag, key);
			};
		}
		/**
		 * 语言变化要重渲染：组件只订阅、不轮询。
		 *
		 * 刻意**没有返回值**：重渲染由下面的 setState 触发，调用方并不需要 revision
		 * （以前把它返回出去，读代码的人会以为调用处漏用了）。
		 */
		function useLocaleRevision(ctx) {
			var bump = useState(0)[1];
			useEffect(
				function () {
					var service = readService(ctx, "locale");
					if (!service || typeof service.subscribe !== "function") return undefined;
					return service.subscribe(function () {
						bump(function (n) {
							return n + 1;
						});
					});
				},
				[ctx]
			);
		}

		// ── /sidebar API（照 fetch 模式自己写，不 value-import 内置 api） ──────
		function sessionBody(scope, payload) {
			var body = { sessionId: scope && scope.sessionId };
			if (scope && scope.cwd) body.cwd = scope.cwd;
			if (payload) {
				Object.keys(payload).forEach(function (key) {
					body[key] = payload[key];
				});
			}
			return body;
		}
		async function callSidebar(scope, method, payload) {
			var response = await fetch("/sidebar/api/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(sessionBody(scope, payload))
			});
			var data = null;
			try {
				data = await response.json();
			} catch (error) {
				data = null;
			}
			if (!response.ok || !data || data.ok === false) {
				var detail = data && data.error ? data.error.message || data.error.code : "HTTP " + response.status;
				throw new Error(String(detail || "sidebar request failed"));
			}
			return data && Object.prototype.hasOwnProperty.call(data, "value") ? data.value : data;
		}
		function joinPath(dir, name) {
			return String(dir).replace(/[\\/]+$/, "") + "/" + name;
		}
		/**
		 * 是不是宿主认的绝对路径 —— **与 better-sidebar 同判据**（照抄语义，勿自创）：
		 * `dsh-better-sidebar/lib/client.js:848` 的 `isAbsolutePath`。POSIX 根 / 盘符 / UNC（反斜杠与
		 * 正斜杠两种写法）都算绝对 —— 上游原文说这是"故意的超集"，这样产出的 UNC 才不会被拼到 cwd 后面。
		 */
		function isAbsolutePath(value) {
			var text = String(value == null ? "" : value);
			return text.indexOf("/") === 0 || /^[A-Za-z]:[\\/]/.test(text) || /^[\\/]{2}[^\\/]/.test(text);
		}
		/**
		 * 把「相对项目根」的配置折算成宿主 fs API 认的绝对路径 —— **与 better-sidebar 同算法**：
		 * `dsh-better-sidebar/lib/client.js:912` 的 `resolveSidebarPath(cwd, path)`，逐字语义
		 * （已是绝对 → 原样返回，连分隔符都不动；没有 cwd → 原样返回；分隔符跟随 base）。
		 *
		 * 为什么必须由这一半折算（2026-10-06 真机 BUG-002，`_qc/rca-2026-10-06-atlas-relative-dir.md`）：
		 * `fs.tree` / `fs.read` 落在宿主侧 `requireAbsolute()`
		 * （`dsh-better-sidebar/lib/index.js:363`）上，**相对路径直接 400**
		 * （`"docs/diagrams" is not an absolute path`）—— 请求体里那个 cwd 只是作用域，宿主不会拿它补；
		 * 平台自己的每个页面都先折算再调（同文件 `:11909` 即一例），我们此前漏了这一步。
		 */
		function resolveSidebarPath(cwd, value) {
			var path = String(value == null ? "" : value);
			if (isAbsolutePath(path)) return path;
			var base = cwd == null ? "" : String(cwd);
			if (base === "") return path;
			var separator = base.indexOf("\\") >= 0 ? "\\" : "/";
			return base.replace(/[\\/]+$/, "") + separator + path;
		}
		function baseName(path) {
			var parts = String(path).split(/[\\/]/);
			return parts[parts.length - 1] || String(path);
		}
		/** 拼接查询串：值一律 encodeURIComponent，避免盘符与空格把 URL 弄坏。 */
		function queryOf(pairs) {
			var parts = [];
			Object.keys(pairs).forEach(function (key) {
				var value = pairs[key];
				if (value === undefined || value === null || value === "") return;
				parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
			});
			return parts.join("&");
		}
		function downloadUrl(scope, path) {
			return "/sidebar/file?" + queryOf({ sessionId: scope.sessionId, path: path, download: "1", cwd: scope.cwd });
		}
		/**
		 * HTML 预览路由 URL —— 与 better-sidebar `encodeHtmlUrl(sessionId, path)` 同一算法：
		 * `/sidebar/html/<sessionId>/<逐段编码的绝对路径>`。该路由没有 cwd 参数，
		 * 传相对路径会被服务端补成 `/…`（盘根）而 400／读错文件，所以这里**必须**吃绝对路径。
		 */
		function htmlUrl(scope, path) {
			var segments = String(path)
				.split(/[\\/]+/)
				.filter(function (segment) {
					return segment !== "";
				});
			var unc = /^[\\/]{2}[^\\/]/.test(String(path));
			return (
				HTML_ROUTE_PREFIX +
				encodeURIComponent(scope.sessionId) +
				"/" +
				(unc ? "/" : "") +
				segments
					.map(function (segment) {
						return encodeURIComponent(segment);
					})
					.join("/")
			);
		}
		/** 打包导出完成后的下载地址（会话作用域由 better-sidebar 侧核对）。 */
		function archiveUrl(scope, id) {
			return "/sidebar/archive?" + queryOf({ sessionId: scope.sessionId, id: id });
		}
		/**
		 * 下载一个已就绪的 zip。
		 *
		 * 为什么先 fetch 成 blob 再点锚点，而不是把 `window.location.href` 指过去：
		 * 顶层导航到附件地址虽然通常只触发下载，但**一旦服务端返回错误**（zip 有存活期，
		 * 过期就是 404 JSON），整个应用会被导航到那个错误页 —— 一个下载失败不该把界面掀掉。
		 * 这里与 better-sidebar 自己导出时的写法一致：先判 `response.ok`，再落盘。
		 */
		function saveArchive(scope, id, name) {
			return fetch(archiveUrl(scope, id))
				.then(function (response) {
					if (!response.ok) throw new Error("HTTP " + response.status);
					return response.blob();
				})
				.then(function (blob) {
					var objectUrl = URL.createObjectURL(blob);
					var anchor = document.createElement("a");
					anchor.href = objectUrl;
					anchor.download = name;
					anchor.style.display = "none";
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					window.setTimeout(function () {
						URL.revokeObjectURL(objectUrl);
					}, 0);
				});
		}
		function hasFeature(service, feature) {
			try {
				return !!service && Array.isArray(service.features) && service.features.indexOf(feature) >= 0;
			} catch (error) {
				return false;
			}
		}
		function messageOf(error) {
			if (!error) return "unknown error";
			return String(error.message || error);
		}
		function isMissingPath(error) {
			var text = messageOf(error).toLowerCase();
			return text.indexOf("cannot list") >= 0 || text.indexOf("enoent") >= 0 || text.indexOf("fs-error") >= 0;
		}
		function formatBytes(size) {
			if (typeof size !== "number" || !isFinite(size) || size < 0) return "";
			if (size < 1024) return size + " B";
			if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
			return (size / (1024 * 1024)).toFixed(2) + " MB";
		}
		function formatTime(value) {
			if (typeof value !== "string" || value.length === 0) return "";
			var date = new Date(value);
			if (isNaN(date.getTime())) return value;
			var pad = function (n) {
				return n < 10 ? "0" + n : String(n);
			};
			return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
		}
		function endsWith(value, suffix) {
			return String(value).slice(-suffix.length) === suffix;
		}

		// ── 更新（宿主半判定 + 本机路由；这一半只显示与发指令） ──────────────
		/** 文案占位符替换：`{key}` 用 values 里的值补，缺键原样留着（截图里一眼能看出漏补）。 */
		function format(text, values) {
			return String(text).replace(/\{(\w+)\}/g, function (whole, key) {
				var value = values && values[key];
				return value === undefined || value === null || value === "" ? whole : String(value);
			});
		}
		/**
		 * 同源 JSON 请求。失败时抛出的 error 上带 `status` 与 `payload`：
		 * 调用方要区分「宿主半没有这条路由（404）」与「路由在但拒绝了」—— 两者在界面上完全不同。
		 */
		async function requestJson(url, init) {
			var response = await fetch(url, init || {});
			var data = null;
			try {
				data = await response.json();
			} catch (error) {
				data = null;
			}
			if (!response.ok) {
				var detail = data && typeof data === "object" ? data.message || data.error : "";
				var failure = new Error(String(detail || "HTTP " + response.status));
				failure.status = response.status;
				failure.payload = data;
				throw failure;
			}
			return data;
		}
		/**
		 * 取更新状态。**读不到不是「已是最新」**：宿主路由不在（404）或宿主连不上时返回
		 * `unavailable: true`，界面据此整条不渲染 —— 与宿主半「读不到就是 unknown」同一口径。
		 */
		async function fetchUpdateStatus(force) {
			try {
				var data = await requestJson(UPDATE_STATUS_PATH + (force ? "?force=1" : ""), {
					method: "GET",
					headers: { accept: "application/json" }
				});
				if (!data || data.ok !== true) return { ok: false, unavailable: false, reason: (data && data.error) || "bad-response" };
				return data;
			} catch (error) {
				var status = error && typeof error.status === "number" ? error.status : 0;
				if (status === 404 || status === 0) return { ok: false, unavailable: true, reason: messageOf(error) };
				return { ok: false, unavailable: false, reason: messageOf(error) };
			}
		}
		/** 发起更新（宿主半 202 后异步跑安装命令，进度靠 status 轮询）。 */
		function applyUpdate() {
			return requestJson(UPDATE_APPLY_PATH, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}"
			});
		}
		/**
		 * 状态 → 界面描述（纯函数，可离线钉住）。
		 *
		 * 返回 `null` 表示**整条不渲染**：能力关闭（`mode: off`）、宿主路由不在、或状态里没有可说的东西。
		 * 其余返回 `{ tone, key, values, canCheck, canApply, busy, restart, detail }`，
		 * 组件只负责把它翻成元素 —— 判定口径不进 JSX，这样它能在 Node 里被逐字测。
		 */
		function updateStripState(status) {
			if (status === undefined || status === null) {
				return { tone: "muted", key: "update.checking", values: {}, canCheck: false, canApply: false, busy: false, restart: false, detail: "" };
			}
			if (status.unavailable === true) return null;
			if (status.ok === true && status.mode === "off") return null;
			if (status.ok !== true) {
				// 发起更新失败（409/424 一类）与「检查失败」是两件事：前者不许顶着「检查失败」的
				// 标题，也不许把宿主的 reason 码原样当句子给用户看。
				var failed = status.applyFailed === true;
				return {
					tone: "warn",
					key: failed ? "update.applyFailed" : "update.unknown",
					values: { reason: status.reason || "" },
					canCheck: true,
					canApply: false,
					busy: false,
					restart: false,
					detail: ""
				};
			}
			var operation = status.operation || null;
			if (operation && operation.state === "running") {
				return { tone: "muted", key: "update.applying", values: { label: operation.label || "" }, canCheck: false, canApply: false, busy: true, restart: false, detail: "" };
			}
			if (operation && operation.state === "succeeded") {
				var before = operation.before || "";
				var after = operation.after || before;
				// 空转的安装（pnpm「Already up to date」）也是 exit 0：这时候说「已更新 vX → vX」
				// 再加一句「重启后生效」是假话，重启也不会变。
				if (before !== "" && before === after) {
					return { tone: "muted", key: "update.noChange", values: { installed: after }, canCheck: true, canApply: false, busy: false, restart: false, detail: operation.outputTail || "" };
				}
				return { tone: "good", key: "update.applied", values: { before: before, after: after }, canCheck: true, canApply: false, busy: false, restart: true, detail: operation.outputTail || "" };
			}
			if (operation && operation.state === "failed") {
				return {
					tone: "warn",
					key: "update.failed",
					values: { code: operation.exitCode === null || operation.exitCode === undefined ? "?" : String(operation.exitCode), error: operation.error || "" },
					canCheck: true,
					canApply: status.applier && status.applier.available === true,
					busy: false,
					restart: false,
					detail: operation.outputTail || operation.error || ""
				};
			}
			var applier = status.applier || {};
			var canApply = applier.available === true;
			// 版本串缺失时给 '?'：宁可显示一个问号，也不要把 `{installed}` 这种占位符原样丢到界面上
			var installedText = status.installed || status.installedNow || status.bootVersion || "?";
			if (status.state === "update-available") {
				return {
					tone: "accent",
					key: "update.available",
					values: { installed: installedText, latest: status.latest || "?" },
					canCheck: true,
					canApply: canApply,
					busy: false,
					restart: false,
					detail: canApply ? "" : "update.noApplier"
				};
			}
			if (status.state === "up-to-date") {
				return { tone: "muted", key: "update.upToDate", values: { installed: installedText }, canCheck: true, canApply: false, busy: false, restart: false, detail: "" };
			}
			if (status.state === "dev") {
				return { tone: "muted", key: "update.dev", values: {}, canCheck: true, canApply: false, busy: false, restart: false, detail: "" };
			}
			if (status.state === "ahead") {
				return { tone: "muted", key: "update.ahead", values: { installed: installedText }, canCheck: true, canApply: false, busy: false, restart: false, detail: "" };
			}
			if (status.state === "idle") {
				// 宿主半在冷却期内跳过一次检查时会如实报 idle —— 这不是失败，别拿 warn 吓人，
				// 更不许把 `{reason}` 占位符原样丢到界面上（它会一直挂着直到用户手动检查）。
				return { tone: "muted", key: "update.idle", values: {}, canCheck: true, canApply: false, busy: false, restart: false, detail: "" };
			}
			return { tone: "warn", key: "update.unknown", values: { reason: status.reason || "" }, canCheck: true, canApply: false, busy: false, restart: false, detail: "" };
		}
		function readPluginSettings(store) {
			try {
				var prefs = store && typeof store.getPrefs === "function" ? store.getPrefs() : null;
				var all = prefs && prefs.pluginSettings;
				var mine = all && all[TAB_ID];
				return mine && typeof mine === "object" ? mine : {};
			} catch (error) {
				return {};
			}
		}
		function usePrefsRevision(store) {
			var pair = useState(0);
			var bump = pair[1];
			useEffect(
				function () {
					if (!store || typeof store.subscribe !== "function") return undefined;
					return store.subscribe(function () {
						bump(function (n) {
							return n + 1;
						});
					});
				},
				[store]
			);
			return pair[0];
		}
		/** 复制到剪贴板；返回是否成功（不支持时界面照常可用）。 */
		function copyText(text) {
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text);
					return true;
				}
			} catch (error) {
				return false;
			}
			return false;
		}
		/**
		 * 有界并发 map：保持输入顺序。
		 * 为什么要有界：元信息是 N 个 HTTP 往返，串行会排队，无界会把宿主打爆。
		 */
		async function mapWithLimit(items, limit, worker) {
			var results = new Array(items.length);
			var cursor = 0;
			var width = Math.max(1, Math.min(limit, items.length));
			var runner = async function () {
				for (;;) {
					var index = cursor;
					cursor += 1;
					if (index >= items.length) return;
					results[index] = await worker(items[index], index);
				}
			};
			var running = [];
			for (var started = 0; started < width; started += 1) running.push(runner());
			await Promise.all(running);
			return results;
		}
		/**
		 * 一段文本按 UTF-8 编码后的字节数。
		 *
		 * 为什么自己折算：宿主的 `fs.read` **只在二进制分支回 `size`**，文本分支只回
		 * `{ kind:'text', content, truncated }`（better-sidebar 的 `FsTextResult`），
		 * 所以「先比字节数」这条判据在客户端拿不到文件大小，只能按读到的文本自己算。
		 * 回执里的 `spec.bytes` 是**文件原始字节数**（atlas 写的是 `specification.byteLength`），
		 * 对 CLI 写出的合法 UTF-8 而言两者相等；真碰上非法字节序列，折算会偏大 ——
		 * 那是「宁可多报一次改动」，方向与漏报过期图纸相反，可以接受。
		 */
		function utf8Bytes(text) {
			var source = String(text === undefined || text === null ? "" : text);
			var total = 0;
			for (var index = 0; index < source.length; index += 1) {
				var code = source.charCodeAt(index);
				if (code < 0x80) total += 1;
				else if (code < 0x800) total += 2;
				else if (code >= 0xd800 && code <= 0xdbff) {
					var next = source.charCodeAt(index + 1);
					if (next >= 0xdc00 && next <= 0xdfff) {
						total += 4; // 合法代理对 = 一个 4 字节码点
						index += 1;
					} else total += 3; // 落单的高代理：TextEncoder 会编成 U+FFFD（3 字节）
				} else total += 3; // 其它 BMP 码点与落单的低代理都按 3 字节
			}
			return total;
		}
		/** SHA-256（十六进制）；浏览器不给 crypto.subtle 时返回空串表示「算不了，别猜」。 */
		async function sha256Hex(text) {
			try {
				var host = typeof crypto !== "undefined" && crypto ? crypto : typeof window !== "undefined" ? window.crypto : null;
				var subtle = host && host.subtle;
				if (!subtle || typeof TextEncoder === "undefined") return "";
				var digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
				return Array.prototype.map
					.call(new Uint8Array(digest), function (byte) {
						return (byte < 16 ? "0" : "") + byte.toString(16);
					})
					.join("");
			} catch (error) {
				return "";
			}
		}
		/** fs.tree 的名称指纹：只比名字集合与目录截断标记，不读文件内容。 */
		function signatureOf(tree) {
			var entries = (tree && tree.entries) || [];
			var names = entries
				.filter(function (entry) {
					return entry && !entry.isDir;
				})
				.map(function (entry) {
					return entry.name;
				});
			names.sort();
			return (tree && tree.truncated ? "1|" : "0|") + names.join("\u0000");
		}

		// ── 读目录：*.atlas.json 为主，顺带收下没有规格的孤儿 *.html ─────────
		/** 读一个文本文件：返回 { text, bytes, truncated }；读不到返回 null。 */
		async function readText(scope, path) {
			var value = await callSidebar(scope, "fs.read", { path: path });
			if (!value || value.kind !== "text" || typeof value.content !== "string") return null;
			return {
				text: value.content,
				// 字节数按读到的文本自己折算 —— 宿主文本分支不回 size（只有二进制分支才有），
				// 这里不写 `value.size` 的兜底分支：那是永远走不到的死代码，会把「比字节数」伪装成已实现。
				bytes: utf8Bytes(value.content),
				// 超过宿主 readLimit（默认 512 KB）时 content 只是前一段：调用方必须自己判断能不能用。
				truncated: value.truncated === true
			};
		}
		async function readJson(scope, path) {
			var read;
			try {
				read = await readText(scope, path);
			} catch (error) {
				return null;
			}
			if (!read) return null;
			// 截断**不许**被当成「读不到」（2026-10-06 修）：规格一旦超过宿主 readLimit（默认 512 KB），
			// 旧实现返回 null，调用方于是静默丢 title/type、并把「规格已改」恒判为没变 ——
			// 那是把「判不了」显示成「没问题」。这里把 truncated 原样带出去，由调用方决定怎么显示。
			if (read.truncated) return { value: null, truncated: true };
			try {
				return { value: JSON.parse(read.text), bytes: read.bytes, text: read.text };
			} catch (error) {
				return null;
			}
		}
		/**
		 * 规格是否比图纸新（回执里存了规格的 sha256 与字节数，是现成的判据）。
		 *
		 * 返回三个值，而不是真假两值 —— 因为「算不出来」和「没变」必须分开：
		 * 非安全上下文（用非 localhost 的 http 地址打开界面）里 `crypto.subtle` 不存在，
		 * 哈希算不出来；此时若返回 false，界面就会把「无法判定」静默显示成「没变」，
		 * 过期图纸正好从这条缝里漏过去。所以这种情况返回 `'unknown'`，由界面明说判不了。
		 *
		 * 判据顺序：字节数不同 → 一定过期；字节数相同再比 sha256。
		 * 两个判据都没有（老回执只有 bytes）时按「没变」处理：没有可比材料，不打扰用户。
		 *
		 * @returns 'changed' 已过期 | 'same' 没变 | 'unknown' 有材料但算不出来
		 */
		async function specChangedAfterRender(receipt, specRead) {
			var expected = receipt && receipt.spec ? receipt.spec : null;
			if (!expected || !specRead) return "same";
			// 读被截断时**没有可比材料**：字节数是截断长度（不是规格长度），sha256 也算不出来
			// ⇒ 只能是 unknown。若按下面两行继续走，会拿截断长度比出个 "changed" 或对空文本算哈希，
			// 两个方向都是编出来的结论（2026-10-06 修）。
			if (specRead.truncated) return "unknown";
			if (typeof expected.bytes === "number" && typeof specRead.bytes === "number" && expected.bytes !== specRead.bytes) return "changed";
			if (typeof expected.sha256 === "string" && expected.sha256.length > 0) {
				var actual = await sha256Hex(specRead.text);
				if (actual.length === 0) return "unknown";
				return actual === expected.sha256 ? "same" : "changed";
			}
			return "same";
		}
		async function describeDiagram(scope, dir, slug, names, withMeta) {
			var specName = slug + SPEC_EXT;
			var htmlName = slug + HTML_EXT;
			var receiptName = slug + RECEIPT_EXT;
			var item = {
				slug: slug,
				dir: dir,
				specPath: joinPath(dir, specName),
				artifactPath: joinPath(dir, htmlName),
				receiptPath: joinPath(dir, receiptName),
				hasSpec: !!names[specName],
				hasArtifact: !!names[htmlName],
				hasReceipt: !!names[receiptName],
				type: "",
				title: "",
				quality: "",
				bytes: null,
				renderedAt: "",
				stale: false,
				// 「有回执与哈希、但本机算不出哈希」= 判不了过期，界面必须与「确认没变」区分开。
				staleUnknown: false,
				metaError: ""
			};
			if (!withMeta) return item;
			if (names[receiptName] && names[receiptName].path) item.receiptPath = names[receiptName].path;
			if (names[specName] && names[specName].path) item.specPath = names[specName].path;
			if (names[htmlName] && names[htmlName].path) item.artifactPath = names[htmlName].path;
			var receiptRead = null;
			if (item.hasReceipt) {
				receiptRead = await readJson(scope, item.receiptPath);
				var receipt = receiptRead && receiptRead.value;
				if (receipt) {
					item.type = typeof receipt.type === "string" ? receipt.type : "";
					item.quality = typeof receipt.quality === "string" ? receipt.quality : "";
					item.renderedAt = typeof receipt.renderedAt === "string" ? receipt.renderedAt : "";
					if (receipt.artifact && typeof receipt.artifact.bytes === "number") item.bytes = receipt.artifact.bytes;
					if (receipt.spec && typeof receipt.spec.title === "string") item.title = receipt.spec.title;
				} else {
					item.metaError = "receipt unreadable";
				}
			}
			// 有规格就一定读：回执给不全的元信息要补，回执给全了也要拿它做「规格比图纸新」的判定。
			if (item.hasSpec) {
				try {
					var specRead = await readJson(scope, item.specPath);
					// 规格被截断时说清楚：否则这一行的 title/type 会空着、徽标也不提示，用户只会觉得「没画好」。
					if (specRead && specRead.truncated && !item.metaError) item.metaError = "spec truncated (>512 KB read limit)";
					var spec = specRead && specRead.value;
					var meta = spec && spec.meta;
					if (!item.type) {
						if (spec && typeof spec.diagram_type === "string") item.type = spec.diagram_type;
						else if (meta && typeof meta.diagram_type === "string") item.type = meta.diagram_type;
						else if (meta && typeof meta.type === "string") item.type = meta.type;
					}
					if (!item.title && meta && typeof meta.title === "string") item.title = meta.title;
					// 只有「有回执」时才谈得上过期；规格本身读不到不算过期，只算元信息缺。
					if (receiptRead && receiptRead.value) {
						var verdict = await specChangedAfterRender(receiptRead.value, specRead);
						item.stale = verdict === "changed";
						item.staleUnknown = verdict === "unknown";
					}
				} catch (error) {
					item.metaError = messageOf(error);
				}
			}
			return item;
		}
		/**
		 * 列目录 → 每张图纸一条元信息。
		 * 返回 { items, dir, metaCapped }：dir 是宿主给的**绝对**目录（预览路由需要绝对路径）。
		 */
		async function listDiagrams(scope, dir) {
			// dir 是**配置原文**（可能是「相对项目根」）：进 fs API 前必须折算，宿主只收绝对路径。
			var path = resolveSidebarPath(scope && scope.cwd, dir);
			var tree = await callSidebar(scope, "fs.tree", { path: path });
			var entries = (tree && tree.entries) || [];
			var absoluteDir = typeof tree?.path === "string" && tree.path.length > 0 ? tree.path : dir;
			var names = {};
			var slugs = [];
			entries.forEach(function (entry) {
				if (!entry || entry.isDir) return;
				names[entry.name] = entry;
			});
			Object.keys(names).forEach(function (name) {
				if (endsWith(name, SPEC_EXT)) {
					var slug = name.slice(0, -SPEC_EXT.length);
					if (slugs.indexOf(slug) < 0) slugs.push(slug);
				}
			});
			Object.keys(names).forEach(function (name) {
				if (endsWith(name, HTML_EXT)) {
					var orphan = name.slice(0, -HTML_EXT.length);
					if (slugs.indexOf(orphan) < 0) slugs.push(orphan);
				}
			});
			slugs.sort();
			var metaCount = Math.min(slugs.length, MAX_META_READS);
			var items = await mapWithLimit(slugs, META_CONCURRENCY, function (slug, index) {
				return describeDiagram(scope, absoluteDir, slug, names, index < metaCount);
			});
			// signature 一并回传：自动刷新要拿「这次看到的名称指纹」做基线，
			// 由组件自己从 items 反推会漏掉回执文件，第一次轮询必然误判成「有变化」。
			return { items: items, dir: absoluteDir, metaCapped: Math.max(0, slugs.length - metaCount), signature: signatureOf(tree) };
		}

		// ── 样式（只用 DSH 令牌，不碰 CSS Modules 类名）｜名字必须是宿主真名 —— TD-014：宿主在 body / body[data-ds-dark-theme] 上声明这些别名，探针要查 document.body（查 documentElement 恒为空），6 条冻结在 test/chunks.test.mjs
		var TOKEN = {
			text: "var(--dsw-alias-label-primary, inherit)",
			muted: "var(--dsw-alias-label-secondary, #8a8a8a)",
			border: "var(--dsw-alias-border-l1, rgba(127,127,127,0.28))",
			surface: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.06))",
			accent: "var(--dsw-alias-link, #3b82f6)",
			warn: "var(--dsw-alias-state-warn-label, #d97706)"
		};
		function buttonStyle(primary) {
			return {
				display: "inline-flex",
				alignItems: "center",
				gap: "4px",
				padding: "2px 8px",
				fontSize: "12px",
				lineHeight: "18px",
				color: primary ? TOKEN.accent : TOKEN.text,
				background: "transparent",
				border: "1px solid " + (primary ? TOKEN.accent : TOKEN.border),
				borderRadius: "6px",
				cursor: "pointer",
				whiteSpace: "nowrap",
				textDecoration: "none"
			};
		}
		function badgeStyle(tone) {
			return {
				display: "inline-block",
				padding: "0 6px",
				fontSize: "11px",
				lineHeight: "16px",
				borderRadius: "999px",
				// tone 'unknown' 是自进化那页专用的「判不了」：中性虚线框 —— 与「正常」的实线框
				// 肉眼可分，又不至于把「判不了」渲染成故障（它既不是通过，也不是越界）。
				border: tone === "unknown" ? "1px dashed " + TOKEN.border : "1px solid " + TOKEN.border,
				color: tone === "warn" ? TOKEN.warn : TOKEN.muted,
				background: TOKEN.surface,
				whiteSpace: "nowrap"
			};
		}
		function sectionStyle() {
			return { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto", flexWrap: "wrap" };
		}
		function atlasIcon(size) {
			var px = typeof size === "number" ? size : 16;
			return E(
				"svg",
				{ width: px, height: px, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" },
				E("path", { key: "frame", d: "M3 5.5h18v13H3z" }),
				E("path", { key: "fold", d: "M9 5.5v13M3 9.5h6" }),
				E("path", { key: "pin", d: "M15.5 10.5v4M13.5 12.5h4" })
			);
		}

		// ── 组件 ─────────────────────────────────────────────────────────────
		function DiagramRow(props) {
			var item = props.item;
			var t = props.t;
			var onPreview = props.onPreview;
			var onOpen = props.onOpen;
			var onReference = props.onReference;
			var scope = props.scope;
			var pair = useState(false);
			var copied = pair[0];
			var setCopied = pair[1];
			var state = item.hasArtifact ? t("badge.ready") : item.hasSpec ? t("badge.specOnly") : t("badge.orphan");
			var stateTone = item.hasArtifact ? "muted" : "warn";
			var facts = [];
			if (item.type) facts.push(item.type);
			if (item.bytes) facts.push(t("label.size") + " " + formatBytes(item.bytes));
			if (item.renderedAt) facts.push(t("label.renderedAt") + " " + formatTime(item.renderedAt));
			var copy = function () {
				setCopied(copyText(item.hasArtifact ? item.artifactPath : item.specPath));
			};
			return E(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface } },
				E(
					"div",
					{ style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
					E("span", { key: "name", style: { fontSize: "13px", fontWeight: 600, color: TOKEN.text, wordBreak: "break-all" } }, item.title || item.slug),
					E("span", { key: "state", style: badgeStyle(stateTone) }, state),
					item.stale ? E("span", { key: "stale", style: badgeStyle("warn") }, t("badge.stale")) : null,
					item.staleUnknown ? E("span", { key: "staleUnknown", style: badgeStyle("muted") }, t("badge.staleUnknown")) : null,
					item.hasReceipt ? E("span", { key: "receipt", style: badgeStyle("muted") }, t("badge.receipt")) : E("span", { key: "noreceipt", style: badgeStyle("warn") }, t("badge.noReceipt"))
				),
				E("div", { style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, item.hasArtifact ? item.artifactPath : item.specPath),
				facts.length > 0 ? E("div", { style: { fontSize: "11px", color: TOKEN.muted } }, facts.join(" · ")) : null,
				item.stale ? E("div", { style: { fontSize: "11px", color: TOKEN.warn } }, t("hint.stale")) : null,
				item.staleUnknown ? E("div", { style: { fontSize: "11px", color: TOKEN.muted } }, t("hint.staleUnknown")) : null,
				item.metaError ? E("div", { style: { fontSize: "11px", color: TOKEN.warn } }, item.metaError) : null,
				E(
					"div",
					{ style: sectionStyle() },
					item.hasArtifact ? E("button", { key: "preview", type: "button", style: buttonStyle(true), onClick: function () { onPreview(item); } }, t("action.preview")) : null,
					item.hasArtifact && props.canOpen ? E("button", { key: "open", type: "button", style: buttonStyle(false), onClick: function () { onOpen(item); } }, t("action.open")) : null,
					item.hasArtifact ? E("a", { key: "export", href: downloadUrl(scope, item.artifactPath), download: baseName(item.artifactPath), style: buttonStyle(false) }, t("action.export")) : null,
					item.hasSpec && props.canReference ? E("button", { key: "spec", type: "button", style: buttonStyle(false), onClick: function () { onReference(item); } }, t("action.spec")) : null,
					E("button", { key: "copy", type: "button", style: buttonStyle(false), onClick: copy }, copied ? t("action.copied") : t("action.copy"))
				)
			);
		}

		/**
		 * 预览面板：iframe 直接吃 better-sidebar 的 `/sidebar/html` 路由。
		 *
		 * 为什么不再自己读文件：`fs.read` 有 512 KB 上限，而实测图纸产物 608–612 KB，
		 * 旧写法把截断后的残文档塞进 srcDoc，界面看起来"渲染坏了"却没有任何报错。
		 * 走路由后由服务端流式返回整份文件，并自带
		 * `content-security-policy: sandbox allow-scripts allow-popups allow-downloads allow-modals`。
		 */
		function PreviewPane(props) {
			var item = props.item;
			var t = props.t;
			var scope = props.scope;
			return E(
				"div",
				{ style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px" } },
				E(
					"div",
					{ style: sectionStyle() },
					E("button", { key: "back", type: "button", style: buttonStyle(false), onClick: props.onBack }, "← " + t("action.back")),
					E("span", { key: "name", style: { fontSize: "12px", fontWeight: 600, color: TOKEN.text, flex: "1 1 auto", wordBreak: "break-all" } }, item.title || item.slug),
					props.canOpen ? E("button", { key: "open", type: "button", style: buttonStyle(false), onClick: function () { props.onOpen(item); } }, t("action.open")) : null,
					E("a", { key: "export", href: downloadUrl(scope, item.artifactPath), download: baseName(item.artifactPath), style: buttonStyle(false) }, t("action.export"))
				),
				E("iframe", {
					key: item.artifactPath + "#" + props.nonce,
					title: item.slug,
					src: htmlUrl(scope, item.artifactPath),
					// 服务端已加 CSP sandbox；这里的属性是第二道闸，两边都不给 allow-same-origin。
					sandbox: "allow-scripts allow-popups allow-downloads allow-forms",
					style: { flex: "1 1 auto", minHeight: 0, width: "100%", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface }
				})
			);
		}

		/**
		 * `updateStripState()` 的产物 → 可直接显示的三件东西（label / detail / tone）。
		 *
		 * 抽出来是因为**现在有两个地方**显示同一份宿主状态：图册页脚的更新条，以及插件详情页的
		 * 更新区块。两处各写一遍措辞，改一处漏一处，同一个状态就会在界面上说两句不一样的话。
		 */
		function updateStripText(view, t) {
			// 空 reason 用兜底文案补上：`{reason}` 占位符原样留在界面上，等于把内部字段漏给用户。
			var values = view.values && view.values.reason === "" ? { reason: t("update.noReason") } : view.values;
			var label = format(t(view.key), values);
			// detail 只会是「安装命令输出尾巴」或一个文案键（宿主路由判不出安装命令时给的提示）。
			var detail = view.detail ? (view.detail === "update.noApplier" ? t("update.noApplier") : view.detail) : "";
			var tone = view.tone === "warn" ? TOKEN.warn : view.tone === "muted" ? TOKEN.muted : TOKEN.accent;
			return { label: label, detail: detail, tone: tone };
		}

		/**
		 * 更新条：宿主半（lib/index.js）判定，客户端半只显示与发指令。
		 *
		 * 三条约定（与宿主半同一口径）：
		 *   - `updateStripState()` 返回 null 时整条不渲染（能力关闭 / 宿主路由不在）；
		 *   - 「正在更新」用 1s 轮询读同一份宿主状态，界面不自己维护第二份进度；
		 *   - `mode: auto` 判到有新版时自动发起**一次**（模块层 flag 兜住，页面加载内不重复提交）。
		 */
		function UpdateStrip(props) {
			var t = props.t;
			var statusPair = useState(null);
			var status = statusPair[0];
			var setStatus = statusPair[1];
			var busyPair = useState(false);
			var working = busyPair[0];
			var setWorking = busyPair[1];

			var load = useCallback(function (force) {
				return fetchUpdateStatus(force).then(function (next) {
					setStatus(next);
					return next;
				});
			}, []);
			var start = useCallback(function () {
				setWorking(true);
				applyUpdate().then(
					function () {
						return load(false);
					},
					function (error) {
						setWorking(false);
						// 标记来源：界面上「更新没发起」与「检查失败」是两句话，不许混用标题。
						setStatus({ ok: false, unavailable: false, applyFailed: true, reason: messageOf(error) });
					}
				);
			}, [load]);

			useEffect(
				function () {
					var alive = true;
					load(false).then(function (next) {
						if (!alive || autoApplied || !next || next.ok !== true || next.mode !== "auto") return;
						var auto = updateStripState(next);
						if (!auto || auto.canApply !== true) return;
						autoApplied = true;
						start();
					});
					return function () {
						alive = false;
					};
				},
				[load, start]
			);

			useEffect(
				function () {
					if (!working) return undefined;
					var alive = true;
					var timer = window.setInterval(function () {
						load(false).then(function (next) {
							if (!alive) return;
							if (next && next.unavailable === true) {
								setWorking(false); // 路由真的没了（旧宿主）——停止轮询
								return;
							}
							// 传输层失败（宿主忙/瞬间断连）不算终态：继续轮询，别把用户刚发起的
							// 那次更新的结果丢掉（丢掉之后界面上连个可点的东西都不剩）。
							if (!next || next.ok !== true) return;
							var operation = next.operation;
							if (!operation || operation.state !== "running") setWorking(false);
						});
					}, UPDATE_POLL_MS);
					return function () {
						alive = false;
						window.clearInterval(timer);
					};
				},
				[working, load]
			);

			var view = updateStripState(status);
			if (view === null) return null;
			var text = updateStripText(view, t);
			var label = text.label;
			var detail = text.detail;
			var tone = text.tone;
			return E(
				"div",
				{ key: "update", style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", padding: "6px 8px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface, flex: "0 0 auto" } },
				E("span", { key: "label", style: { fontSize: "12px", color: tone, wordBreak: "break-all" } }, label),
				view.restart ? E("span", { key: "restart", style: { fontSize: "11px", color: TOKEN.muted } }, t("update.restartHint")) : null,
				detail ? E("span", { key: "detail", style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, detail) : null,
				view.canCheck
					? E(
							"button",
							{
								key: "check",
								type: "button",
								style: buttonStyle(false),
								onClick: function () {
									load(true);
								}
							},
							t("update.check")
						)
					: null,
				view.canApply ? E("button", { key: "apply", type: "button", style: buttonStyle(true), onClick: start }, t("update.apply")) : null
			);
		}

		// ── 插件详情页（DSH 侧栏「插件」→ roadbook 组合包详情） ─────────────────────
		//
		// 为什么有这一块：更新能力此前只有「图册」标签页页脚一个落点 —— 不看图册的用户永远不知道
		// 有新版本。DSH 内置的插件页给外部插件留了三个 list slot（页面自己声明、按 order 排）：
		//   `plugins.detail.actions` —— 页头控件，在页面自己的开关与卸载之前
		//   `plugins.detail.badge`   —— 标题旁一枚标签
		//   `plugins.detail.section` —— 页面自身内容之下的区块
		// 每个条目都收到该页面的 `subject`；**对无话可说的 subject 必须返回 null** —— 这三个 slot
		// 在**每一个**插件的详情页上都会渲染，不做门就等于跑到别人的页面上说话。
		/** 三个 slot 名（页面声明、这里注册；名字写错 = 静默不出现）。 */
		var DETAIL_ACTION_SLOT = "plugins.detail.actions";
		var DETAIL_BADGE_SLOT = "plugins.detail.badge";
		var DETAIL_SECTION_SLOT = "plugins.detail.section";
		/** 本包在 profile 依赖表里的名字：详情页上据它认领自己的页面。 */
		var SELF_PACKAGE = "roadbook";

		/**
		 * 这个详情页是不是本组合包的。`subject` 的形状由宿主页面给：
		 * `{ kind: 'bundle', pkg: { name, version, installed, enabled, rows } }`。
		 * 只认 `bundle`：行页（`kind: 'row'`）与官方插件页（`kind: 'item'`）都不是本包的主页。
		 */
		function detailIsOurs(subject) {
			if (subject === null || subject === undefined || subject.kind !== "bundle") return false;
			var pkg = subject.pkg;
			return pkg !== null && pkg !== undefined && pkg.name === SELF_PACKAGE;
		}

		/**
		 * 详情页三处贡献共用**一份**状态。
		 *
		 * 三处 slot 条目各自挂载；各拉各的话，更新进行中就是 3 份 1s 轮询打同一台宿主（宿主每次
		 * 还要读一遍观测文件尾巴）。本文件已经有一条同源口径：界面不许自己维护第二份进度。
		 */
		var detailStore = {
			status: null,
			checking: false,
			working: false,
			inflight: null,
			timer: null,
			listeners: []
		};

		/** 通知订阅者重渲染；一个订阅者坏了不许连累别的（客户端半没有抛错的权力）。 */
		function detailNotify() {
			var list = detailStore.listeners.slice();
			for (var i = 0; i < list.length; i += 1) {
				try {
					list[i]();
				} catch (error) {
					/* 单个订阅者失败不影响其余 */
				}
			}
		}

		/**
		 * 读一次宿主状态；并发合并成一次请求（`force` 只在第一次生效 —— 手动检查要穿透宿主冷却，
		 * 但同一时刻不需要打两次）。
		 */
		function detailRead(force) {
			if (detailStore.inflight !== null) return detailStore.inflight;
			detailStore.checking = true;
			detailNotify();
			detailStore.inflight = fetchUpdateStatus(force === true).then(
				function (next) {
					detailStore.status = next;
					return next;
				},
				function (error) {
					// `fetchUpdateStatus` 内部已把传输错误收成对象；这里兜它自己抛出来的意外。
					detailStore.status = { ok: false, unavailable: false, reason: messageOf(error) };
					return detailStore.status;
				}
			).then(function (next) {
				detailStore.inflight = null;
				detailStore.checking = false;
				detailNotify();
				return next;
			});
			return detailStore.inflight;
		}

		/** 停掉更新进度轮询（幂等）；停完通知一次，界面才知道进度停了。 */
		function detailStopWatch() {
			if (detailStore.timer !== null) {
				window.clearInterval(detailStore.timer);
				detailStore.timer = null;
			}
			detailNotify();
		}

		/** 更新进行中用 1s 轮询读同一份宿主状态（与图册页脚同一条节奏，宿主那边是异步跑命令）。 */
		function detailWatch() {
			if (detailStore.timer !== null) return;
			detailStore.timer = window.setInterval(function () {
				detailRead(false).then(function (next) {
					// 路由真的没了（旧宿主）→ 停止轮询；传输层失败不算终态，继续等下一条。
					if (!next || next.unavailable === true) {
						detailStore.working = false;
						detailStopWatch();
						return;
					}
					if (next.ok !== true) return;
					var operation = next.operation;
					if (!operation || operation.state !== "running") {
						detailStore.working = false;
						detailStopWatch();
					}
				});
			}, UPDATE_POLL_MS);
		}

		/** 发起更新（宿主半 202 后异步跑安装命令，进度靠轮询；与图册页脚同一套函数）。 */
		function detailApply() {
			if (detailStore.working === true) return;
			detailStore.working = true;
			detailNotify();
			applyUpdate().then(
				function () {
					detailWatch();
				},
				function (error) {
					detailStore.working = false;
					// 与图册页脚同一条区分：「更新没发起」不是「检查失败」，两句话不许混用标题。
					detailStore.status = { ok: false, unavailable: false, applyFailed: true, reason: messageOf(error) };
					detailNotify();
				}
			);
		}

		/** 订阅共用状态；首个订阅者触发一次读取，最后一个走掉就停掉轮询。 */
		function useDetailStore() {
			var pair = useState(0);
			var bump = pair[1];
			useEffect(function () {
				var listener = function () {
					bump(function (n) {
						return n + 1;
					});
				};
				detailStore.listeners.push(listener);
				if (detailStore.status === null) detailRead(false);
				return function () {
					var at = detailStore.listeners.indexOf(listener);
					if (at >= 0) detailStore.listeners.splice(at, 1);
					if (detailStore.listeners.length === 0) detailStopWatch();
				};
			}, []);
			return detailStore;
		}

		/**
		 * 详情页三处贡献的判定（纯函数，可离线钉住）：只回答「显不显示 / 说什么键 / 什么色调」，
		 * 翻成元素是组件的事 —— 与 `updateStripState` 同一条分工。
		 *
		 * 返回 `null` = **三处一起不出现**：能力关闭（`mode: off`）或宿主路由不在（旧宿主）。
		 * 不这么收口的话，页头会出现一个点了必然报错的死按钮。
		 *
		 * @returns {{ badge: object|null, action: object, section: object } | null}
		 */
		function detailViews(status, checking) {
			var view = updateStripState(status);
			if (view === null) return null;
			var upgrade = (status && status.upgrade) || {};
			// 升级对账只在**有结论**时才说：unknown 表示没有可对账的落地记录，不该在界面上占一行。
			var upgradeKey = "";
			if (upgrade.state === "applied") upgradeKey = "detail.upgradeApplied";
			else if (upgrade.state === "pending") upgradeKey = "detail.upgradePending";
			else if (upgrade.state === "newer") upgradeKey = "detail.upgradeNewer";
			var upgradeValues = {
				before: upgrade.before || "?",
				target: upgrade.target || "?",
				running: upgrade.running || "?"
			};
			var available = status && status.ok === true && status.state === "update-available";
			return {
				// 徽标只在「真的有事要说」时出现：有新版本，或上次更新还没生效。
				badge: available
					? { key: "detail.badgeUpdate", values: { latest: (status && status.latest) || "?" }, tone: "accent" }
					: upgrade.state === "pending"
						? { key: "detail.badgeRestart", values: {}, tone: "warn" }
						: null,
				action: {
					labelKey: checking === true ? "detail.checking" : "detail.check",
					canCheck: checking !== true,
					canApply: view.canApply === true && checking !== true,
					busy: checking === true || view.busy === true
				},
				section: {
					view: view,
					// 三个版本号分开报：运行中 / 磁盘上 / 上游。它们**可以不相同**（装完没重启时
					// 磁盘已经是新版、内存里还是旧的），合成一个数字就是把这件事藏起来。
					running: (status && status.bootVersion) || "?",
					onDisk: (status && (status.installedNow || status.installed)) || "?",
					upstream: (status && status.latest) || "?",
					checkedAt: (status && status.checkedAt) || "",
					upgrade: upgradeKey === "" ? null : { key: upgradeKey, values: upgradeValues, tone: upgrade.state === "pending" ? "warn" : "muted" }
				}
			};
		}

		/**
		 * 页头控件（薄外壳）：**不调任何 hook**。
		 *
		 * 三个 slot 在**每一个**插件的详情页上都会渲染，所以外壳必须先按 subject 把别人的页面挡掉；
		 * hooks（订阅 + 取数）留在内层组件里，只有本包自己的详情页才会挂载它 —— 否则打开任何一个
		 * 插件的详情页都会替 roadbook 发一次状态请求。
		 */
		function RoadbookUpdateAction(props) {
			if (!detailIsOurs(props.subject)) return null;
			return E(RoadbookUpdateActionInner, { t: props.t });
		}

		/** 页头控件实体：检查更新 / 更新。 */
		function RoadbookUpdateActionInner(props) {
			var t = props.t;
			var store = useDetailStore();
			var views = detailViews(store.status, store.checking);
			if (views === null) return null;
			var action = views.action;
			return E(
				"span",
				{ key: "roadbook-update", style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
				E(
					"button",
					{
						key: "check",
						type: "button",
						disabled: action.canCheck !== true,
						style: buttonStyle(false),
						onClick: function () {
							detailRead(true);
						}
					},
					t(action.labelKey)
				),
				action.canApply
					? E(
							"button",
							{
								key: "apply",
								type: "button",
								disabled: action.busy === true,
								style: buttonStyle(true),
								onClick: function () {
									detailApply();
								}
							},
							t("detail.apply")
						)
					: null
			);
		}

		/** 标题旁的徽标（薄外壳：同样不调 hook，先挡掉别人的页面）。 */
		function RoadbookUpdateBadge(props) {
			if (!detailIsOurs(props.subject)) return null;
			return E(RoadbookUpdateBadgeInner, { t: props.t });
		}

		/** 徽标实体：有新版本 / 待重启。 */
		function RoadbookUpdateBadgeInner(props) {
			var t = props.t;
			var store = useDetailStore();
			var views = detailViews(store.status, store.checking);
			if (views === null || views.badge === null) return null;
			var badge = views.badge;
			var tone = badge.tone === "warn" ? TOKEN.warn : TOKEN.accent;
			return E(
				"span",
				{
					key: "roadbook-badge",
					style: {
						display: "inline-block",
						marginLeft: "8px",
						padding: "1px 6px",
						border: "1px solid " + tone,
						borderRadius: "999px",
						fontSize: "11px",
						color: tone
					}
				},
				format(t(badge.key), badge.values)
			);
		}

		/** 内容之下的区块（薄外壳：同样不调 hook）。 */
		function RoadbookUpdateSection(props) {
			if (!detailIsOurs(props.subject)) return null;
			return E(RoadbookUpdateSectionInner, { t: props.t });
		}

		/** 区块实体：状态一句话 + 三个版本号 + 升级对账 + 细节证据。 */
		function RoadbookUpdateSectionInner(props) {
			var t = props.t;
			var store = useDetailStore();
			var views = detailViews(store.status, store.checking);
			if (views === null) return null;
			var section = views.section;
			var text = updateStripText(section.view, t);
			var line = function (key, value) {
				return E("div", { key: key, style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, value);
			};
			var at = section.checkedAt === "" ? t("detail.notChecked") : format(t("detail.checkedAt"), { at: section.checkedAt });
			return E(
				"section",
				{
					key: "roadbook-update",
					style: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "10px", padding: "8px 10px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface }
				},
				E("div", { key: "label", style: { fontSize: "12px", color: text.tone, wordBreak: "break-all" } }, text.label),
				text.detail ? line("detail", text.detail) : null,
				line(
					"versions",
					t("detail.running") + " v" + section.running + " · " + t("detail.onDisk") + " v" + section.onDisk + " · " + t("detail.upstream") + " v" + section.upstream
				),
				section.upgrade === null ? null : E("div", { key: "upgrade", style: { fontSize: "11px", color: section.upgrade.tone === "warn" ? TOKEN.warn : TOKEN.muted } }, format(t(section.upgrade.key), section.upgrade.values)),
				line("checkedAt", at)
			);
		}

		/**
		 * 把三处贡献注册进插件详情页的三个 slot。
		 *
		 * 走**作用域注入**（`ctx.inject(['slots'], …)`），`export const inject` 保持空数组：把 `slots`
		 * 写进顶层 inject，服务缺席/迟到时本行的 fiber 会停在「未激活」，而 DSH 的 web boot 把任一
		 * 未激活条目判成致命错误 —— 那是 2026-10-05「应用无法启动」的同一类事故，也正是 0.7.0 那次
		 * 真机崩溃的机制（真 cordis 4.0.4 实测：顶层 inject 缺服务 ⇒ fiber = PENDING ⇒ 审计判死）。
		 * 作用域注入下 `slots` 不在（或 slot 永不被声明）就什么都不发生，标签页照常注册。
		 *
		 * 每一个注册动作都各有 try/catch：详情页的贡献失败不许连累标签页，更不许把 web boot 判死。
		 */
		function registerPluginDetailSlots(ctx) {
			// 连 `ctx.inject` 这一下读属性都要包在 try 里：cordis 的 ctx 是严格代理，读一个没写进
			// `inject` 的成员**直接 throw**（`cannot get property "inject" without inject` 这种 ctx
			// 在本文件的契约测试里就有一个）。它抛出去 = 后面的标签页注册一起没了。
			try {
				if (typeof ctx.inject !== "function") return;
				ctx.inject(["slots"], function (scope) {
					var slots = null;
					try {
						slots = scope === null || scope === undefined ? null : scope.slots;
					} catch (error) {
						slots = null;
					}
					if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return undefined;
					var contributions = [
						[DETAIL_ACTION_SLOT, "roadbook-update-action", RoadbookUpdateAction],
						[DETAIL_BADGE_SLOT, "roadbook-update-badge", RoadbookUpdateBadge],
						[DETAIL_SECTION_SLOT, "roadbook-update-section", RoadbookUpdateSection]
					];
					var disposers = [];
					for (var i = 0; i < contributions.length; i += 1) {
						(function (slotName, id, component) {
							try {
								disposers.push(
									slots.inject(slotName, function () {
										return slots.register({ name: slotName, id: id, order: 20, locale: LOCALE_NS }, component);
									})
								);
							} catch (error) {
								warnRegistration(ctx, id, error);
							}
						})(contributions[i][0], contributions[i][1], contributions[i][2]);
					}
					return function () {
						for (var index = 0; index < disposers.length; index += 1) {
							try {
								if (typeof disposers[index] === "function") disposers[index]();
							} catch (error) {
								/* 撤销失败不影响启动 */
							}
						}
						detailStopWatch();
					};
				});
			} catch (error) {
				warnRegistration(ctx, "plugins.detail", error);
			}
		}

		/**
		 * 用**作用域注入**等 better-sidebar，再挂两个标签页。
		 *
		 * 顶层 `inject` 里不许出现 `betterSidebar`（见文件头规则）：那条依赖缺席或迟到时，本行的
		 * fiber 就是 PENDING（或压根没有 fiber），而 DSH 的 web boot 把任一未激活条目判成致命错误
		 * —— 也就是「用户关掉 better-sidebar」这种完全正常的状态会让整个 DSH 打不开。
		 * 真 cordis 4.0.4 实测：顶层 inject 缺服务 ⇒ `ctx.plugin(...)` 的 fiber 恒为 PENDING。
		 * 作用域注入只产生子 fiber，不是 Loader 条目，不参与那一次审计（已复核确认）。
		 *
		 * 服务到位前什么都不发生：没有 better-sidebar 就没有这两个标签页，但 DSH 照常启动。
		 */
		function registerSidebarTabs(ctx) {
			try {
				if (typeof ctx.inject !== "function") return;
				ctx.inject(["betterSidebar"], function (scope) {
					var service = null;
					try {
						service = scope === null || scope === undefined ? null : scope.betterSidebar;
					} catch (error) {
						service = null;
					}
					if (!service || typeof service.registerTab !== "function") return undefined;
					registerOne(scope, service, {
						id: TAB_ID,
						title: function () {
							return dict(ctx)("tab.title");
						},
						description: function () {
							return dict(ctx)("tab.desc");
						},
						icon: function (size) {
							return atlasIcon(size);
						},
						order: 45,
						single: true,
						component: AtlasGallery,
						settings: settingsDeclaration(ctx)
					});
					registerOne(scope, service, evolveDescriptor(ctx));
				});
			} catch (error) {
				warnRegistration(ctx, "betterSidebar", error);
			}
		}

		/**
		 * 「自进化」标签页描述符：宿主半那两条路由是只读的，这里没有设置项。
		 *
		 * 界面与判定已搬进分块 `lib/client-evolve.js`（`component` 是分块边界组件）——
		 * 描述符自己留在核心，因为它必须**同步**产出：better-sidebar 拿它画标签栏，
		 * 那一刻分块很可能还在路上。
		 */
		function evolveDescriptor(ctx) {
			return {
				id: EVOLVE_TAB_ID,
				title: function () {
					return dict(ctx)("evolve.tabTitle");
				},
				description: function () {
					return dict(ctx)("evolve.tabDesc");
				},
				icon: function (size) {
					// 分块到位前画一个中性占位：不画错图标（那也是假绿），也不留空位。
					var loaded = chunkModuleOf("evolve");
					if (loaded && typeof loaded.evolveIcon === "function") return loaded.evolveIcon(size);
					return E("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none" });
				},
				order: EVOLVE_ORDER,
				single: true,
				component: chunkBoundary("evolve", "EvolvePanel")
			};
		}

		/**
		 * 空态生成块（**纯函数**，便于在 Node 里钉住任意一帧）。
		 *
		 * 为什么抽出来：假 React 不跑 effect / setState，「目录读完了」那一帧在契约测试里驱动不到
		 * —— 同 `evolveFrame` 的理由。判定与渲染都是纯的，就能逐帧钉住：空目录显示、只有非架构图
		 * 时显示、**已有架构图时不显示**（不打扰）、生成中禁用、失败说出原因。
		 *
		 * @param {{status: string, items: Array}} view 列表状态
		 * @param {{status: string, error: string}} gen 生成按钮状态（idle / starting / started / error）
		 * @param {(key: string) => string} t 查表
		 * @param {Function} onGenerate 点击回调
		 * @returns {object|null} 元素；不该出现时返回 null
		 */
		function generateBlockFor(view, gen, t, onGenerate) {
			var items = (view && view.items) || [];
			var hasArchitecture = items.some(function (entry) {
				return entry && entry.type === "architecture";
			});
			// 「还没有架构图」有两种形态，两种都要给入口：
			//   ① ready 且一张 architecture 都没有；
			//   ② **目录还不存在**（首次使用 / 新项目就是这种，`missingDir`）——只认 ① 的话，
			//      最需要它的时刻（还没画过任何图）按钮反而不出现。
			// 其余读取失败不给：那时该先修环境，放个按钮会把人引到错方向。
			var noDiagramDirYet = !!view && view.status === "error" && view.missingDir === true;
			if (!view || (view.status !== "ready" && !noDiagramDirYet) || hasArchitecture) return null;
			var status = gen && gen.status ? gen.status : "idle";
			var generating = status === "starting" || status === "started";
			return E(
				"div",
				{ key: "generate", style: { display: "flex", flexDirection: "column", gap: "4px" } },
				E(
					"div",
					{ key: "row", style: sectionStyle() },
					E(
						"button",
						{ key: "generate", type: "button", style: buttonStyle(true), disabled: generating, onClick: onGenerate },
						generating ? t("action.generating") : t("action.generate")
					)
				),
				status === "error"
					? E("div", { key: "genError", style: { fontSize: "11px", color: TOKEN.warn } }, t("state.generateFailed") + ((gen && gen.error) || ""))
					: null,
				status === "idle" ? E("div", { key: "genHint", style: { fontSize: "11px", color: TOKEN.muted } }, t("state.generateHint")) : null
			);
		}

		/**
		 * 发一次「让 agent 生成架构图」的请求：走 better-sidebar **现成的** `sidechat.start`。
		 *
		 * 抽成纯函数是为了能在 Node 里钉住**请求的形状**（方法名 + body 里的 sessionId / cwd / question）
		 * —— 假 React 驱动不到点击，写在 onClick 里的请求体没人验得了。
		 * `call` 缺省是 callSidebar，测试可注入替身。
		 */
		function startSidechatGenerate(scope, dir, t, call) {
			var send = typeof call === "function" ? call : callSidebar;
			return send(scope, "sidechat.start", { question: format(t("state.generatePrompt"), { dir: dir }) });
		}

		function AtlasGallery(props) {
			var ctx = props.ctx;
			var store = props.store;
			var scope = props.scope;
			var visible = props.visible;
			useLocaleRevision(ctx);
			var t = dict(ctx);
			var revision = usePrefsRevision(store);
			var settings = readPluginSettings(store);
			var dir = typeof settings.dir === "string" && settings.dir.trim() !== "" ? settings.dir.trim() : DEFAULT_DIR;
			var list = useState({ status: "idle", items: [], error: "", missingDir: false, metaCapped: 0 });
			var view = list[0];
			var setView = list[1];
			var selection = useState(null);
			var selected = selection[0];
			var setSelected = selection[1];
			var noncePair = useState(0);
			var nonce = noncePair[0];
			var setNonce = noncePair[1];
			var tickPair = useState(0);
			var tick = tickPair[0];
			var setTick = tickPair[1];
			var zipPair = useState({ status: "idle", error: "", id: "" });
			var zip = zipPair[0];
			var setZip = zipPair[1];
			// 空态生成按钮的状态（idle / starting / started / error）。
			var genPair = useState({ status: "idle", error: "" });
			var gen = genPair[0];
			var setGen = genPair[1];
			var sessionId = scope && scope.sessionId;
			var cwd = scope && scope.cwd;
			var generation = sessionId + "|" + dir;

			useEffect(
				function () {
					setView({ status: "idle", items: [], error: "", missingDir: false, metaCapped: 0 });
					setSelected(null);
				},
				[sessionId]
			);

			useEffect(
				function () {
					if (!visible || !sessionId) return undefined;
					var alive = true;
					setView(function (previous) {
						return { status: "loading", items: previous.items, error: "", missingDir: false, metaCapped: previous.metaCapped };
					});
					listDiagrams({ sessionId: sessionId, cwd: cwd }, dir).then(
						function (result) {
							if (!alive) return;
							// 记下这次看到的名称指纹：自动刷新拿它做基线，避免「刚加载完就判成变化」
							seenListings[generation] = result.signature;
							setView({ status: "ready", items: result.items, error: "", missingDir: false, metaCapped: result.metaCapped });
						},
						function (error) {
							if (!alive) return;
							setView({ status: "error", items: [], error: messageOf(error), missingDir: isMissingPath(error), metaCapped: 0 });
						}
					);
					return function () {
						alive = false;
					};
				},
				[visible, sessionId, cwd, dir, tick, revision]
			);

			/**
			 * 自动刷新：agent 刚渲染完一张图，用户不该还要手点「刷新」。
			 * 只轮询 fs.tree 的名称指纹（一次轻量请求），指纹变了才重新读元信息。
			 * 标签页不可见、或页面被隐藏时不动 —— 后台不该有网络活动。
			 */
			useEffect(
				function () {
					if (!visible || !sessionId) return undefined;
					var alive = true;
					var timer = window.setInterval(function () {
						try {
							if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
						} catch (error) {
							/* 读不到可见性就照常轮询 */
						}
						callSidebar({ sessionId: sessionId, cwd: cwd }, "fs.tree", { path: resolveSidebarPath(cwd, dir) }).then(
							function (tree) {
								if (!alive) return;
								var signature = signatureOf(tree);
								var previous = seenListings[generation];
								seenListings[generation] = signature;
								if (previous !== undefined && previous !== signature) {
									setTick(function (n) {
										return n + 1;
									});
								}
							},
							function () {
								/* 轮询失败是常态（目录可能刚被删）：静默，等下一次 */
							}
						);
					}, POLL_INTERVAL_MS);
					return function () {
						alive = false;
						window.clearInterval(timer);
					};
				},
				[visible, sessionId, cwd, dir, generation]
			);

			/** 打包导出：开始 → 每 250ms 问一次状态 → ready 后跳到下载地址。 */
			useEffect(
				function () {
					if (zip.status !== "building" || !zip.id || !sessionId) return undefined;
					var alive = true;
					var timer = null;
					var poll = function () {
						callSidebar({ sessionId: sessionId, cwd: cwd }, "archive.status", { id: zip.id }).then(
							function (status) {
								if (!alive) return;
								if (status && status.state === "ready") {
									setZip({ status: "ready", error: "", id: zip.id });
									saveArchive({ sessionId: sessionId }, zip.id, "atlas-diagrams.zip").catch(function (error) {
										if (alive) setZip({ status: "error", error: messageOf(error), id: "" });
									});
									return;
								}
								if (status && status.state === "error") {
									setZip({ status: "error", error: String(status.error || "zip failed"), id: "" });
									return;
								}
								timer = window.setTimeout(poll, ZIP_POLL_MS);
							},
							function (error) {
								if (alive) setZip({ status: "error", error: messageOf(error), id: "" });
							}
						);
					};
					poll();
					return function () {
						alive = false;
						if (timer) window.clearTimeout(timer);
					};
				},
				// 依赖里不放 `t`：dict() 每次渲染都返回新函数，放进来会让打包轮询每次渲染都重启
				[zip.status, zip.id, sessionId, cwd]
			);

			var service = readService(ctx, "betterSidebar");
			var canOpen = hasFeature(service, "openFile") && typeof service.openFile === "function";
			// 先把函数本身取出来再进依赖数组：直接写 `props` 的话每次渲染都是新对象，
			// useCallback 等于每次重建（虽然当前没进 effect 依赖，仍不该留着这个假缓存）。
			var onReferenceFile = props.onReferenceFile;
			var canReference = typeof onReferenceFile === "function";
			var openItem = useCallback(
				function (item) {
					if (!canOpen) return;
					try {
						service.openFile({ sessionId: sessionId, cwd: cwd }, item.artifactPath, baseName(item.artifactPath));
					} catch (error) {
						/* openFile 失败不该让标签页崩掉 */
					}
				},
				[canOpen, service, sessionId, cwd]
			);
			var referenceItem = useCallback(
				function (item) {
					if (!canReference) return;
					try {
						onReferenceFile(item.hasSpec ? item.specPath : item.artifactPath);
					} catch (error) {
						/* 同上 */
					}
				},
				[canReference, onReferenceFile]
			);
			var exportAll = useCallback(
				function () {
					if (zip.status === "building") return;
					// 三件套一起打包：图纸 + 规格 + 回执（回执是"这张图是怎么来的"的唯一证据）
					var paths = [];
					view.items.forEach(function (item) {
						if (item.hasArtifact) paths.push(item.artifactPath);
						if (item.hasSpec) paths.push(item.specPath);
						if (item.hasReceipt) paths.push(item.receiptPath);
					});
					if (paths.length === 0) return;
					setZip({ status: "building", error: "", id: "" });
					callSidebar({ sessionId: sessionId, cwd: cwd }, "archive.build", { paths: paths, name: "atlas-diagrams.zip" }).then(
						function (job) {
							if (!job || !job.id) {
								setZip({ status: "error", error: t("state.zipFailed"), id: "" });
								return;
							}
							setZip({ status: "building", error: "", id: job.id });
						},
						function (error) {
							setZip({ status: "error", error: messageOf(error), id: "" });
						}
					);
				},
				[zip.status, view.items, sessionId, cwd, t]
			);
			var copyPrompt = useCallback(function () {
				copyText(t("state.emptyPrompt"));
			}, [t]);

			/**
			 * 「让 agent 生成架构图」——走 better-sidebar **现成的** `sidechat.start`，不新增宿主接口。
			 *
			 * 为什么用 sidechat 而不是往主会话塞一条消息：生成一张架构图要读仓库、写规格、跑渲染，
			 * 是重活；sidechat 开的是继承当前会话上下文的**子会话**（`origin: subagent`，不进主会话
			 * 列表），过程在侧聊里看得见，主对话不受污染。代价是子会话默认拿不到 RoadBook 流程正文
			 * （autoload 的 `includeSubagents: false`），但 `roadbook-atlas` 技能本身是全局可用的。
			 *
			 * 失败必须说出来，不许静默：`sidechat.start` 在父会话不在 `agents` 注册表里时返回 409，
			 * 侧聊服务缺席时 404，两种都经 callSidebar 抛错通道上来。
			 */
			var startGenerate = useCallback(
				function () {
					if (!sessionId) return;
					setGen({ status: "starting", error: "" });
					startSidechatGenerate({ sessionId: sessionId, cwd: cwd }, dir, t, callSidebar).then(
						function () {
							setGen({ status: "started", error: "" });
						},
						function (error) {
							setGen({ status: "error", error: messageOf(error) });
						}
					);
				},
				[sessionId, cwd, dir, t]
			);
			var generateBlock = generateBlockFor(view, gen, t, startGenerate);

			var body = null;
			if (selected) {
				body = E(PreviewPane, {
					key: "preview",
					item: selected,
					t: t,
					nonce: nonce,
					scope: { sessionId: sessionId, cwd: cwd },
					canOpen: canOpen,
					onOpen: openItem,
					onBack: function () {
						setSelected(null);
					}
				});
			} else if (view.status === "error") {
				body = E(
					"div",
					{ key: "error", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: TOKEN.muted } },
					E("div", { key: "title", style: { color: TOKEN.warn } }, t("state.error") + "：" + view.error),
					view.missingDir ? E("div", { key: "dir" }, t("state.missingDir")) : null,
					E("div", { key: "hint" }, t("state.emptyHint")),
					E("code", { key: "prompt", style: { fontSize: "11px", color: TOKEN.text, wordBreak: "break-all" } }, t("state.emptyPrompt")),
					generateBlock
				);
			} else if (view.status === "ready" && view.items.length === 0) {
				body = E(
					"div",
					{ key: "empty", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: TOKEN.muted } },
					E("div", { key: "title", style: { color: TOKEN.text } }, t("state.empty")),
					E("div", { key: "dir" }, dir),
					E("div", { key: "hint" }, t("state.emptyHint")),
					E("code", { key: "prompt", style: { fontSize: "11px", color: TOKEN.text, wordBreak: "break-all" } }, t("state.emptyPrompt")),
					generateBlock,
					E("div", { key: "row", style: sectionStyle() }, E("button", { key: "copy", type: "button", style: buttonStyle(true), onClick: copyPrompt }, t("action.copyPrompt")))
				);
			} else {
				body = E(
					"div",
					{ key: "list", style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px", overflowY: "auto" } },
					generateBlock,
					view.status === "loading" && view.items.length === 0 ? E("div", { key: "loading", style: { fontSize: "12px", color: TOKEN.muted } }, t("state.loading")) : null,
					view.metaCapped > 0 ? E("div", { key: "capped", style: { fontSize: "11px", color: TOKEN.muted } }, t("hint.metaCapped")) : null,
					view.items.map(function (item) {
						return E(DiagramRow, {
							key: item.slug,
							item: item,
							t: t,
							scope: { sessionId: sessionId, cwd: cwd },
							canOpen: canOpen,
							canReference: canReference,
							onPreview: function (picked) {
								setSelected(picked);
								setNonce(function (n) {
									return n + 1;
								});
							},
							onOpen: openItem,
							onReference: referenceItem
						});
					})
				);
			}

			return E(
				"div",
				{
					style: { display: "flex", flexDirection: "column", flex: "1 1 auto", height: "100%", minHeight: 0, gap: "8px", padding: "10px", boxSizing: "border-box", overflow: "hidden", color: TOKEN.text }
				},
				E(
					"div",
					{ style: sectionStyle() },
					E("span", { key: "title", style: { fontSize: "13px", fontWeight: 600 } }, t("tab.title")),
					E("span", { key: "count", style: badgeStyle("muted") }, String(view.items.length)),
					E("span", { key: "dir", style: { fontSize: "11px", color: TOKEN.muted, flex: "1 1 auto", wordBreak: "break-all" } }, dir),
					zip.status === "building" ? E("span", { key: "zip", style: badgeStyle("muted") }, t("state.zipBuilding")) : null,
					zip.status === "error" ? E("span", { key: "ziperr", style: badgeStyle("warn"), title: zip.error }, t("state.zipFailed")) : null,
					// 失败原因必须看得见：宿主对**每一个**路径做 stat，一个读不到就整单失败（fs-error），
					// 而列表快照可能是 15 秒轮询/上次加载时的旧数据（图纸刚被删或改名）。
					// 只显示「打包失败」等于把已经采到的证据丢掉，用户无从知道该刷新一下。
					zip.status === "error" && zip.error && zip.error !== t("state.zipFailed")
						? E("span", { key: "ziperrDetail", style: { fontSize: "11px", color: TOKEN.warn, wordBreak: "break-all" } }, zip.error)
						: null,
					view.items.length > 0 ? E("button", { key: "exportAll", type: "button", style: buttonStyle(false), onClick: exportAll }, t("action.exportAll")) : null,
					E(
						"button",
						{
							key: "refresh",
							type: "button",
							style: buttonStyle(false),
							onClick: function () {
								setTick(function (n) {
									return n + 1;
								});
								setNonce(function (n) {
									return n + 1;
								});
							}
						},
						t("action.refresh")
					)
				),
				E(UpdateStrip, { key: "update", t: t }),
				body,
				E("div", { style: { fontSize: "11px", color: TOKEN.muted, flex: "0 0 auto" } }, t("hint.settings") + " · v" + PLUGIN_VERSION)
			);
		}

		function settingsDeclaration(ctx) {
			return {
				pluginToggles: [
					{
						key: "dir",
						title: dict(ctx)("settings.dir.title"),
						desc: dict(ctx)("settings.dir.desc"),
						type: "text",
						placeholder: DEFAULT_DIR
					}
				]
			};
		}

		/**
		 * 顶层 cordis 服务依赖：**必须是空的**（2026-10-05 真机事故后定的硬规则）。
		 *
		 * 顶层 inject 里的服务只要缺席或稍晚到位，本行的 fiber 就是 PENDING 或不存在，
		 * 而 DSH 的 web boot 审计（`entry.fiber === undefined` / `state !== ACTIVE` 都算）
		 * 会把它升级成「应用无法启动」。客户端半没有把整个应用拖下水的权力 ——
		 * 所以 `slots` 与 `betterSidebar` 都走作用域注入（`registerPluginDetailSlots` /
		 * `registerSidebarTabs`），缺谁就少谁的功能，DSH 照常起来。
		 *
		 * 同一条规则在仓库里已写过两遍：宿主半读 `webServer`（lib/index.js）、自进化行
		 * 的空 inject（_qc/check.ps1 有断言）。这里是第三处。
		 */
		var inject = [];

		/**
		 * 本页面里每个标签页是否已有**活着的注册**（键 = 标签页 id）。
		 *
		 * 背景（2026-10-04 实机事故）：DSH 的 web boot 把「任一客户端条目未激活」判成致命错误
		 * （`web boot: N entries did not activate` → 应用无法启动），而 better-sidebar 的
		 * `registerTab` 对重复 id 是**直接 throw**。于是「同一 bundle 被 Loader 实例化两次」
		 * 或「热重载后旧注册还在」都会把 roadbook 变成整个应用的启动故障。
		 * 客户端半没有这种权力：注册失败只留一条警告，绝不上抛。
		 *
		 * 键是 id 而不是一个布尔：本半现在挂**两个**标签页，一个的注册失败或撤销不许连累另一个。
		 */
		var registered = {};

		/** 服务里是否已经存在同 id 的 tab（重载/热更新后旧注册可能仍在注册表里）。 */
		function tabExists(service, id) {
			try {
				var tabs = typeof service.getTabs === "function" ? service.getTabs() : null;
				if (!tabs) return false;
				var list = Array.prototype.slice.call(tabs);
				for (var i = 0; i < list.length; i += 1) {
					if (list[i] && list[i].id === id) return true;
				}
				return false;
			} catch (error) {
				return false;
			}
		}

		/**
		 * 失败只留警告：客户端半抛错 = 整个 web boot 判死，插件不该有这种权力。
		 *
		 * 文案不写死「标签页」：这条通道现在也接插件详情页的 slot 注册（id 形如
		 * `plugins.detail` / `roadbook-update-action`），写死会把排错指向错误的对象。
		 */
		function warnRegistration(ctx, id, error) {
			var detail = error && error.message ? error.message : String(error);
			var text = "roadbook: 注册失败（" + String(id) + "，不影响 DSH 启动）：" + detail;
			try {
				if (ctx && ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn(text);
				else if (typeof console !== "undefined" && console && typeof console.warn === "function") console.warn(text);
			} catch (ignored) {
				// 连日志都失败也不许影响启动
			}
		}

		/**
		 * 把双语表注册进 DSH 的 locale 注册表（命名空间 `roadbook`）。
		 * 注册是锦上添花：服务不在、签名不同、抛错 —— 都只回退到本文件自带的查表。
		 */
		function registerLocale(ctx) {
			var service = readService(ctx, "locale");
			if (!service || typeof service.register !== "function") return;
			try {
				var offZh = service.register(LOCALE_NS, "zh", zh);
				var offEn = service.register(LOCALE_NS, "en", en);
				if (typeof ctx.effect === "function") {
					ctx.effect(function () {
						return function () {
							try {
								if (typeof offZh === "function") offZh();
								if (typeof offEn === "function") offEn();
							} catch (error) {
								/* 撤销失败不影响启动 */
							}
						};
					});
				}
			} catch (error) {
				/* 注册不上就用本地表，界面照常可用 */
			}
		}

		/**
		 * cordis 的 `apply`：**整段包一层**，任何意外都只留警告。
		 *
		 * 不是防御式编程的洁癖，是一条实机教训（2026-10-05）：客户端半抛出的异常会被
		 * cordis 记成本行 fiber 的 `failed`，前端 boot 审计再把它升级成整个应用打不开 ——
		 * 一个画图纸的标签页不该有这种权力。所以接线写在 `activate()` 里，
		 * `apply()` 只负责兜住它。
		 */
		function apply(ctx) {
			try {
				activate(ctx);
			} catch (error) {
				warnRegistration(ctx, "?", error);
			}
		}

		/**
		 * 注册**一个**标签页，永不抛。
		 *
		 * 三层收口缺一不可：
		 *   ① 模块级 `registered[id]` —— 同一页面内 apply 跑两次只登记一次；
		 *   ② `tabExists` —— 上一代实例（热重载）留下的同 id 注册仍在服务注册表里，再注册必 throw；
		 *   ③ 每个标签页**各自** try/catch —— 一个注册失败不许连累另一个，更不许把 web boot 判死。
		 */
		function registerOne(ctx, service, descriptor) {
			var id = descriptor && descriptor.id;
			if (!id) return;
			try {
				if (registered[id] === true || tabExists(service, id)) {
					registered[id] = true;
					return;
				}
				var register = function () {
					var disposer = service.registerTab(descriptor);
					registered[id] = true;
					return function () {
						registered[id] = false;
						if (typeof disposer === "function") disposer();
					};
				};
				// 照旧把注册动作交给 ctx.effect：卸载时 fiber 能撤销这次注册。
				if (typeof ctx.effect === "function") ctx.effect(register);
				else register();
			} catch (error) {
				warnRegistration(ctx, id, error);
			}
		}

		/**
		 * 真正的接线：注册语言表 + 插件详情页三处贡献 + 把「图册」「自进化」两个标签页挂进 better-sidebar。
		 *
		 * 顺序有讲究：详情页贡献排在标签页**之前** —— 它吃的是 DSH 内置插件页的 `slots`，
		 * 与 better-sidebar 无关，不该因为后者缺席就一起消失。
		 * 两处外部服务都是作用域注入，所以本半在自己的服务全缺时**照样 ACTIVE**：
		 * 没有 better-sidebar 就没有这两个标签页，但 DSH 一定起得来（2026-10-05 真机事故的成因）。
		 */
		function activate(ctx) {
			registerLocale(ctx);
			registerPluginDetailSlots(ctx);
			registerSidebarTabs(ctx);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.TAB_ID = TAB_ID;
		exports.EVOLVE_TAB_ID = EVOLVE_TAB_ID;
		exports.PLUGIN_VERSION = PLUGIN_VERSION;
		// 给契约测试用：这几个内部算法必须能在 Node 里单独钉住（预览路由的 URL 口径、
		// 语言快照字段、名称指纹），否则只能靠真机肉眼验。
		exports.__internals = {
			// 服务读取的口径必须能单独钉住：它踩过一次「属性访问 throw → fiber failed → DSH 打不开」
			// （2026-10-05），而假 ctx 太宽松时整套测试会是绿的。
			readService: readService,
			htmlUrl: htmlUrl,
			archiveUrl: archiveUrl,
			localeTagOf: localeTagOf,
			signatureOf: signatureOf,
			specChangedAfterRender: specChangedAfterRender,
			// 空态生成块：判定 + 渲染都是纯的，任何一帧都能在 Node 里钉住（假 React 跑不了 effect）。
			generateBlockFor: generateBlockFor,
			// 生成按钮发出的请求形状（方法名 / body）同样要能钉住；callSidebar 一起暴露以便走生产路径。
			startSidechatGenerate: startSidechatGenerate,
			callSidebar: callSidebar,
			// 图册列目录这条**生产路径**必须能被单独钉住：2026-10-06 真机踩到「配置里的相对目录
			// 被 better-sidebar 的 requireAbsolute() 直接 400 拒掉」，而契约测试的假 /sidebar API
			// 从不执行那道校验 —— 整条链路可以全绿而真机全坏（接线层必须有自己的测试）。
			listDiagrams: listDiagrams,
			// 折算算法与宿主必须同判据（同 htmlUrl 与 encodeHtmlUrl 的关系）：边界表由契约测试逐值钉住。
			isAbsolutePath: isAbsolutePath,
			resolveSidebarPath: resolveSidebarPath,
			// 读文本这条生产路径必须能被钉住：宿主文本分支不回 size，「字节数」是客户端自己折算的，
			// 只测 specChangedAfterRender 的话就会拿手搓的 {text, bytes} 把死分支测成绿的。
			readText: readText,
			utf8Bytes: utf8Bytes,
			LOCALE_NS: LOCALE_NS,
			MAX_META_READS: MAX_META_READS,
			// 更新这条链路的判定与请求也必须能在 Node 里钉住：状态三态、404 静默、POST 路由词
			UPDATE_STATUS_PATH: UPDATE_STATUS_PATH,
			UPDATE_APPLY_PATH: UPDATE_APPLY_PATH,
			updateStripState: updateStripState,
			updateStripText: updateStripText,
			fetchUpdateStatus: fetchUpdateStatus,
			applyUpdate: applyUpdate,
			// 插件详情页三处贡献同样要能在 Node 里钉住：subject 门（别人的页面必须返回 null）、
			// 判定纯函数（能力关闭时三处一起不出现）、以及注册走的是作用域注入而不是 inject。
			DETAIL_ACTION_SLOT: DETAIL_ACTION_SLOT,
			DETAIL_BADGE_SLOT: DETAIL_BADGE_SLOT,
			DETAIL_SECTION_SLOT: DETAIL_SECTION_SLOT,
			detailIsOurs: detailIsOurs,
			detailViews: detailViews,
			registerPluginDetailSlots: registerPluginDetailSlots,
			// 标签页那条接线同样要在 Node 里钉住：它现在也必须走作用域注入（顶层 inject 为空），
			// 否则「better-sidebar 不在 ⇒ 本行 PENDING ⇒ DSH 打不开」会重新长回来。
			registerSidebarTabs: registerSidebarTabs,
			RoadbookUpdateAction: RoadbookUpdateAction,
			RoadbookUpdateBadge: RoadbookUpdateBadge,
			RoadbookUpdateSection: RoadbookUpdateSection,
			format: format,
			// 假 React 不会调用嵌套的函数组件（它只创建一个 { type: fn } 元素），所以更新条要能被
			// **直接调用**一次来做首帧断言 —— 真 React 里它由 AtlasGallery 渲染，路径不变。
			UpdateStrip: UpdateStrip,
			// 自进化这条链路的**路由词**仍由核心给（它是核心与宿主半之间的契约常量）；
			// 但界面与判定已搬进分块 `lib/client-evolve.js`，那几个名字从这里**撤掉** ——
			// 留着只会诱使测试去核心找一样已经不在那儿的东西。契约测试改从分块取：
			// `test/helpers/client-contract-harness.mjs` 的 `loadChunk()`，走的是生产路径。
			EVOLVE_STATUS_PATH: EVOLVE_STATUS_PATH,
			EVOLVE_TICK_PATH: EVOLVE_TICK_PATH,
			// 分块装载器：纯逻辑（URL 口径 / 工厂解析 / 宿主注入）必须能在 Node 里整条钉住 ——
			// 「分块契约」是最容易悄悄坏掉的一层，而它坏了只有真机能看出来。
			CHUNK_ROUTE_PREFIX: CHUNK_ROUTE_PREFIX,
			chunkUrlOf: chunkUrlOf,
			chunkModuleOf: chunkModuleOf,
			resolveChunk: resolveChunk,
			takeChunk: takeChunk,
			chunkRequireOf: chunkRequireOf,
			// 生产装载那条路（注入 <script> → 浏览器取分块 → onload 再回 takeChunk）**只有真机能跑**，
			// 而它恰恰是真机硬门禁盯的那一层。给测试一个入口，让假 document 至少把三件事钉住：
			// 注入的是什么形状、重复调用会不会注入第二次、失败之后还能不能重试 —— 否则这一层只剩肉眼。
			loadChunk: loadChunk,
			chunkBoundary: chunkBoundary,
			// 两份文案表原样给测试：只有这样才能断言「中英逐键对齐」，
			// 而不是只比两个长度（长度相同但键名漂移，界面里就会回显键名）。
			dictionaries: { zh: zh, en: en }
		};

		/**
		 * 核心造好的共享件，分块用 `require("roadbook/host")` 取（分块不直连本作用域的任何变量）。
		 *
		 * 为什么走自有全局：跨 bundle 传递只有两条路 —— 要么经宿主 `ctx.modules.import`（多接一个
		 * 服务、多一层对宿主契约的假设），要么走自有全局。dsh-better-sidebar 用的
		 * `__dshSidebarModuleSystem__` 就是后者；本仓跟后者，并且把入口收在 require 的一个虚拟 id 上
		 * （依赖在文件头显式列出，不在函数深处直连全局）。差异与依据见 design/vnext-2026-10-07.md §11.2。
		 *
		 * **必须挂在 `return module.exports` 之前**：分块工厂随时可能被调用，晚一行就是 undefined。
		 * 这里给的全是函数声明与 `var TOKEN`（已在上文赋值），没有靠提升取值的隐患。
		 */
		globalThis[CHUNK_HOST_KEY] = {
			E: E,
			useState: useState,
			useEffect: useEffect,
			useCallback: useCallback,
			format: format,
			formatTime: formatTime,
			messageOf: messageOf,
			requestJson: requestJson,
			useLocaleRevision: useLocaleRevision,
			dict: dict,
			styles: { TOKEN: TOKEN, buttonStyle: buttonStyle, badgeStyle: badgeStyle, sectionStyle: sectionStyle },
			routes: { evolveStatus: EVOLVE_STATUS_PATH, evolveTick: EVOLVE_TICK_PATH },
			// 版本号是分块页脚要用的**值**（不是函数）：漏给它的后果是运行期 ReferenceError。
			PLUGIN_VERSION: PLUGIN_VERSION
		};
		return module.exports;
	}
});
