/**
 * Roadbook Atlas —— 浏览器半（hand-written ModuleLoader bundle）。
 *
 * 规则（照 DSH 手写客户端半的既定约定，勿破）：
 *   - 全文件只有一次 window.__ModuleLoader__.load({...})，id 必须等于包名；
 *   - require 只允许取基线模块（这里只用 react）；
 *   - 纯 React.createElement，无 JSX / TS，无构建步骤；
 *   - 组件定义在模块层，工厂内不做副作用；
 *   - 只用 useState / useEffect / useCallback（契约测试的假 React 只提供这三个）；
 *   - 导出的 inject 声明 cordis 服务依赖：better-sidebar 不在时本半静默不激活。
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
		 * 插件版本，显示在标签页页脚，方便一眼看出界面里跑的是哪一版。
		 * 必须与 package.json 的 version 一致 —— test/client-contract.test.mjs 会逐字核对，
		 * 因为客户端 bundle 不能用 require 读 package.json（ModuleLoader 的 require 只有白名单）。
		 */
		var PLUGIN_VERSION = "0.3.0";

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
			"settings.dir.desc": "相对项目根目录；默认 docs/diagrams"
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
			"settings.dir.desc": "Relative to the project root; defaults to docs/diagrams"
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
		 * 当前活动语言标签。
		 * 真实客户端 locale 服务的快照字段是 `active`（`getSnapshot().active`），
		 * 不是 `current` —— 只读 `current` 会让界面恒为中文。三种形状都认，读不到返回空串。
		 */
		function localeTagOf(ctx) {
			var service = ctx && ctx.locale;
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
			var service = ctx && ctx.locale;
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
					var service = ctx && ctx.locale;
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
			if (!read || read.truncated) return null;
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
			var tree = await callSidebar(scope, "fs.tree", { path: dir });
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

		// ── 样式（只用 DSH 令牌，不碰 CSS Modules 类名） ─────────────────────
		var TOKEN = {
			text: "var(--dsw-alias-text-1, inherit)",
			muted: "var(--dsw-alias-text-2, #8a8a8a)",
			border: "var(--dsw-alias-border-1, rgba(127,127,127,0.28))",
			surface: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.06))",
			accent: "var(--dsw-alias-text-accent, #3b82f6)",
			warn: "var(--dsw-alias-text-warning, #d97706)"
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
				border: "1px solid " + TOKEN.border,
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
						callSidebar({ sessionId: sessionId, cwd: cwd }, "fs.tree", { path: dir }).then(
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

			var service = ctx && ctx.betterSidebar;
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
					E("code", { key: "prompt", style: { fontSize: "11px", color: TOKEN.text, wordBreak: "break-all" } }, t("state.emptyPrompt"))
				);
			} else if (view.status === "ready" && view.items.length === 0) {
				body = E(
					"div",
					{ key: "empty", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: TOKEN.muted } },
					E("div", { key: "title", style: { color: TOKEN.text } }, t("state.empty")),
					E("div", { key: "dir" }, dir),
					E("div", { key: "hint" }, t("state.emptyHint")),
					E("code", { key: "prompt", style: { fontSize: "11px", color: TOKEN.text, wordBreak: "break-all" } }, t("state.emptyPrompt")),
					E("div", { key: "row", style: sectionStyle() }, E("button", { key: "copy", type: "button", style: buttonStyle(true), onClick: copyPrompt }, t("action.copyPrompt")))
				);
			} else {
				body = E(
					"div",
					{ key: "list", style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px", overflowY: "auto" } },
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

		/** cordis 服务依赖：better-sidebar 缺席时本半不激活（静默，不报错）。 */
		var inject = ["betterSidebar"];

		/**
		 * 本页面里是否已有活着的注册。
		 * 背景（2026-10-04 实机事故）：DSH 的 web boot 把「任一客户端条目未激活」判成致命错误
		 * （`web boot: N entries did not activate` → 应用无法启动），而 better-sidebar 的
		 * `registerTab` 对重复 id 是**直接 throw**。于是「同一 bundle 被 Loader 实例化两次」
		 * 或「热重载后旧注册还在」都会把 roadbook 变成整个应用的启动故障。
		 * 客户端半没有这种权力：注册失败只留一条警告，绝不上抛。
		 */
		var registered = false;

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

		/** 失败只留警告：客户端半抛错 = 整个 web boot 判死，插件不该有这种权力。 */
		function warnRegistration(ctx, error) {
			var detail = error && error.message ? error.message : String(error);
			var text = "roadbook: 图册标签页注册失败（不影响 DSH 启动）：" + detail;
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
			var service = ctx && ctx.locale;
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

		function apply(ctx) {
			registerLocale(ctx);
			var service = ctx && ctx.betterSidebar;
			if (!service || typeof service.registerTab !== "function") return;
			// 幂等：本页面已注册过，或服务注册表里已有同 id（上一代实例留下的）→ 跳过。
			if (registered || tabExists(service, TAB_ID)) {
				registered = true;
				return;
			}
			var register = function () {
				var disposer = service.registerTab({
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
				registered = true;
				return function () {
					registered = false;
					if (typeof disposer === "function") disposer();
				};
			};
			try {
				if (typeof ctx.effect === "function") ctx.effect(register);
				else register();
			} catch (error) {
				warnRegistration(ctx, error);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.TAB_ID = TAB_ID;
		exports.PLUGIN_VERSION = PLUGIN_VERSION;
		// 给契约测试用：这几个内部算法必须能在 Node 里单独钉住（预览路由的 URL 口径、
		// 语言快照字段、名称指纹），否则只能靠真机肉眼验。
		exports.__internals = {
			htmlUrl: htmlUrl,
			archiveUrl: archiveUrl,
			localeTagOf: localeTagOf,
			signatureOf: signatureOf,
			specChangedAfterRender: specChangedAfterRender,
			// 读文本这条生产路径必须能被钉住：宿主文本分支不回 size，「字节数」是客户端自己折算的，
			// 只测 specChangedAfterRender 的话就会拿手搓的 {text, bytes} 把死分支测成绿的。
			readText: readText,
			utf8Bytes: utf8Bytes,
			LOCALE_NS: LOCALE_NS,
			MAX_META_READS: MAX_META_READS
		};
		return module.exports;
	}
});
