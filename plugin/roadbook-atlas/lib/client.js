/**
 * Roadbook Atlas —— 浏览器半（hand-written ModuleLoader bundle）。
 *
 * 规则（照 DSH 手写客户端半的既定约定，勿破）：
 *   - 全文件只有一次 window.__ModuleLoader__.load({...})，id 必须等于包名；
 *   - require 只允许取基线模块（这里只用 react）；
 *   - 纯 React.createElement，无 JSX / TS，无构建步骤；
 *   - 组件定义在模块层，工厂内不做副作用；
 *   - 导出的 inject 声明 cordis 服务依赖：better-sidebar 不在时本半静默不激活。
 *
 * 这一半只读图纸、不改图纸：列表 + 内嵌预览 + 打开 + 导出。
 * 生成与校验在 skill + CLI（skills/roadbook-atlas/）里做，agent 负责跑。
 */
window.__ModuleLoader__.load({
	id: "roadbook-atlas",
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
		var TAB_ID = "roadbook-atlas:gallery";
		/** 图纸默认目录（相对项目根）；与宿主半 DEFAULT_DIAGRAM_DIR、SKILL.md 三处一致。 */
		var DEFAULT_DIR = "docs/diagrams";
		var SPEC_EXT = ".atlas.json";
		var HTML_EXT = ".html";
		var RECEIPT_EXT = ".receipt.json";
		/** 列表里最多自动读多少份回执/规格元信息（防止大目录把标签页拖死）。 */
		var MAX_META_READS = 40;

		// ── 文案 ──────────────────────────────────────────────────────────────
		var zh = {
			"tab.title": "图册",
			"tab.desc": "JSON 规格渲染成的图纸：预览、打开、导出",
			"action.refresh": "刷新",
			"action.back": "返回列表",
			"action.preview": "预览",
			"action.open": "打开",
			"action.export": "导出",
			"action.spec": "引用规格",
			"action.copy": "复制路径",
			"action.copied": "已复制",
			"state.loading": "正在读取图纸…",
			"state.empty": "这个目录里还没有图纸",
			"state.emptyHint": "对 agent 说：用 roadbook-atlas 画一张 <主题> 的架构图。规格落在目录里的 *.atlas.json，图纸是同名 *.html。",
			"state.error": "读取失败",
			"state.missingDir": "目录不存在（首次生成图纸时会自动创建）",
			"badge.ready": "图纸已生成",
			"badge.specOnly": "仅规格",
			"badge.orphan": "缺规格",
			"badge.receipt": "有回执",
			"badge.noReceipt": "无回执",
			"label.quality": "档位",
			"label.renderedAt": "生成于",
			"label.size": "大小",
			"hint.settings": "目录在 设置 → 侧边卡片 → 图册 里改",
			"hint.previewBlocked": "浏览器拒绝内嵌预览，用「打开」在面板里看。",
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
			"action.spec": "Reference spec",
			"action.copy": "Copy path",
			"action.copied": "Copied",
			"state.loading": "Loading diagrams…",
			"state.empty": "No diagrams in this directory yet",
			"state.emptyHint": "Ask the agent: draw an architecture diagram of <topic> with roadbook-atlas. Specs land as *.atlas.json, artifacts as the matching *.html.",
			"state.error": "Read failed",
			"state.missingDir": "Directory does not exist yet (created on first render)",
			"badge.ready": "rendered",
			"badge.specOnly": "spec only",
			"badge.orphan": "no spec",
			"badge.receipt": "receipt",
			"badge.noReceipt": "no receipt",
			"label.quality": "Quality",
			"label.renderedAt": "Rendered",
			"label.size": "Size",
			"hint.settings": "Directory is configurable in Settings → Side cards → Atlas",
			"hint.previewBlocked": "Inline preview was blocked by the browser — use Open instead.",
			"settings.dir.title": "Diagram directory",
			"settings.dir.desc": "Relative to the project root; defaults to docs/diagrams"
		};
		function looksEnglish(value) {
			return typeof value === "string" && value.toLowerCase().indexOf("en") === 0;
		}
		function dict(ctx) {
			var locale = ctx && ctx.locale;
			var tag = typeof locale === "string" ? locale : locale && typeof locale.current === "string" ? locale.current : "";
			var table = looksEnglish(tag) ? en : zh;
			// 返回查表函数而不是表本身：调用点写 t("tab.title")，缺键时回显键名（截图里一眼能看出漏翻译）
			return function (key) {
				var value = table[key];
				return typeof value === "string" ? value : key;
			};
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
		function downloadUrl(scope, path) {
			var url = "/sidebar/file?sessionId=" + encodeURIComponent(scope.sessionId) + "&path=" + encodeURIComponent(path) + "&download=1";
			if (scope && scope.cwd) url += "&cwd=" + encodeURIComponent(scope.cwd);
			return url;
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

		// ── 读目录：*.atlas.json 为主，顺带收下没有规格的孤儿 *.html ─────────
		async function readJsonIfPresent(scope, path) {
			var value = await callSidebar(scope, "fs.read", { path: path });
			if (!value || value.kind !== "text" || typeof value.content !== "string") return null;
			try {
				return JSON.parse(value.content);
			} catch (error) {
				return null;
			}
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
				metaError: ""
			};
			if (!withMeta) return item;
			if (item.hasReceipt) {
				try {
					var receipt = await readJsonIfPresent(scope, item.receiptPath);
					if (receipt) {
						item.type = typeof receipt.type === "string" ? receipt.type : "";
						item.quality = typeof receipt.quality === "string" ? receipt.quality : "";
						item.renderedAt = typeof receipt.renderedAt === "string" ? receipt.renderedAt : "";
						if (receipt.artifact && typeof receipt.artifact.bytes === "number") item.bytes = receipt.artifact.bytes;
						if (receipt.spec && typeof receipt.spec.title === "string") item.title = receipt.spec.title;
					} else {
						item.metaError = "receipt unreadable";
					}
				} catch (error) {
					item.metaError = messageOf(error);
				}
			} else if (item.hasSpec) {
				try {
					var spec = await readJsonIfPresent(scope, item.specPath);
					var meta = spec && spec.meta;
					if (spec && typeof spec.diagram_type === "string") item.type = spec.diagram_type;
					else if (meta && typeof meta.diagram_type === "string") item.type = meta.diagram_type;
					else if (meta && typeof meta.type === "string") item.type = meta.type;
					if (meta && typeof meta.title === "string") item.title = meta.title;
				} catch (error) {
					item.metaError = messageOf(error);
				}
			}
			return item;
		}
		async function listDiagrams(scope, dir) {
			var tree = await callSidebar(scope, "fs.tree", { path: dir });
			var entries = (tree && tree.entries) || [];
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
			var items = [];
			for (var index = 0; index < slugs.length; index += 1) {
				items.push(await describeDiagram(scope, dir, slugs[index], names, index < MAX_META_READS));
			}
			return items;
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
				try {
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(item.hasArtifact ? item.artifactPath : item.specPath);
						setCopied(true);
					}
				} catch (error) {
					setCopied(false);
				}
			};
			return E(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface } },
				E(
					"div",
					{ style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
					E("span", { key: "name", style: { fontSize: "13px", fontWeight: 600, color: TOKEN.text, wordBreak: "break-all" } }, item.title || item.slug),
					E("span", { key: "state", style: badgeStyle(stateTone) }, state),
					item.hasReceipt ? E("span", { key: "receipt", style: badgeStyle("muted") }, t("badge.receipt")) : E("span", { key: "noreceipt", style: badgeStyle("warn") }, t("badge.noReceipt"))
				),
				E("div", { style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, item.hasArtifact ? item.artifactPath : item.specPath),
				facts.length > 0 ? E("div", { style: { fontSize: "11px", color: TOKEN.muted } }, facts.join(" · ")) : null,
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

		function PreviewPane(props) {
			var item = props.item;
			var t = props.t;
			var preview = props.preview;
			return E(
				"div",
				{ style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px" } },
				E(
					"div",
					{ style: sectionStyle() },
					E("button", { key: "back", type: "button", style: buttonStyle(false), onClick: props.onBack }, "← " + t("action.back")),
					E("span", { key: "name", style: { fontSize: "12px", fontWeight: 600, color: TOKEN.text, flex: "1 1 auto", wordBreak: "break-all" } }, item.title || item.slug),
					props.canOpen ? E("button", { key: "open", type: "button", style: buttonStyle(false), onClick: function () { props.onOpen(item); } }, t("action.open")) : null,
					E("a", { key: "export", href: downloadUrl(props.scope, item.artifactPath), download: baseName(item.artifactPath), style: buttonStyle(false) }, t("action.export"))
				),
				preview.status === "loading" ? E("div", { style: { fontSize: "12px", color: TOKEN.muted } }, t("state.loading")) : null,
				preview.status === "error" ? E("div", { style: { fontSize: "12px", color: TOKEN.warn } }, t("state.error") + "：" + preview.error) : null,
				preview.status === "ready"
					? E("iframe", {
							key: item.slug,
							title: item.slug,
							srcDoc: preview.html,
							sandbox: "allow-scripts allow-popups allow-downloads allow-forms",
							style: { flex: "1 1 auto", minHeight: 0, width: "100%", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: "#ffffff" }
						})
					: null
			);
		}

		function AtlasGallery(props) {
			var ctx = props.ctx;
			var store = props.store;
			var scope = props.scope;
			var visible = props.visible;
			var t = dict(ctx);
			var revision = usePrefsRevision(store);
			var settings = readPluginSettings(store);
			var dir = typeof settings.dir === "string" && settings.dir.trim() !== "" ? settings.dir.trim() : DEFAULT_DIR;
			var list = useState({ status: "idle", items: [], error: "", missingDir: false });
			var view = list[0];
			var setView = list[1];
			var selection = useState(null);
			var selected = selection[0];
			var setSelected = selection[1];
			var previewState = useState({ status: "idle", html: "", error: "" });
			var preview = previewState[0];
			var setPreview = previewState[1];
			var tickPair = useState(0);
			var tick = tickPair[0];
			var setTick = tickPair[1];
			var sessionId = scope && scope.sessionId;
			var cwd = scope && scope.cwd;

			useEffect(
				function () {
					setView({ status: "idle", items: [], error: "", missingDir: false });
					setSelected(null);
					setPreview({ status: "idle", html: "", error: "" });
				},
				[sessionId]
			);

			useEffect(
				function () {
					if (!visible || !sessionId) return undefined;
					var alive = true;
					setView(function (previous) {
						return { status: "loading", items: previous.items, error: "", missingDir: false };
					});
					listDiagrams({ sessionId: sessionId, cwd: cwd }, dir).then(
						function (items) {
							if (alive) setView({ status: "ready", items: items, error: "", missingDir: false });
						},
						function (error) {
							if (!alive) return;
							setView({ status: "error", items: [], error: messageOf(error), missingDir: isMissingPath(error) });
						}
					);
					return function () {
						alive = false;
					};
				},
				[visible, sessionId, cwd, dir, tick, revision]
			);

			useEffect(
				function () {
					if (!selected || !selected.hasArtifact || !sessionId) return undefined;
					var alive = true;
					setPreview({ status: "loading", html: "", error: "" });
					callSidebar({ sessionId: sessionId, cwd: cwd }, "fs.read", { path: selected.artifactPath }).then(
						function (value) {
							if (!alive) return;
							if (value && value.kind === "text" && typeof value.content === "string") {
								setPreview({ status: "ready", html: value.content, error: "" });
							} else {
								setPreview({ status: "error", html: "", error: t("hint.previewBlocked") });
							}
						},
						function (error) {
							if (alive) setPreview({ status: "error", html: "", error: messageOf(error) });
						}
					);
					return function () {
						alive = false;
					};
				},
				[selected, sessionId, cwd, tick]
			);

			var service = ctx && ctx.betterSidebar;
			var canOpen = hasFeature(service, "openFile") && typeof service.openFile === "function";
			var canReference = typeof props.onReferenceFile === "function";
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
						props.onReferenceFile(item.hasSpec ? item.specPath : item.artifactPath);
					} catch (error) {
						/* 同上 */
					}
				},
				[canReference, props]
			);

			var body = null;
			if (selected) {
				body = E(PreviewPane, {
					key: "preview",
					item: selected,
					t: t,
					preview: preview,
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
					E("div", { key: "hint" }, t("state.emptyHint"))
				);
			} else if (view.status === "ready" && view.items.length === 0) {
				body = E(
					"div",
					{ key: "empty", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: TOKEN.muted } },
					E("div", { key: "title", style: { color: TOKEN.text } }, t("state.empty")),
					E("div", { key: "dir" }, dir),
					E("div", { key: "hint" }, t("state.emptyHint"))
				);
			} else {
				body = E(
					"div",
					{ key: "list", style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px", overflowY: "auto" } },
					view.status === "loading" && view.items.length === 0 ? E("div", { key: "loading", style: { fontSize: "12px", color: TOKEN.muted } }, t("state.loading")) : null,
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
							}
						},
						t("action.refresh")
					)
				),
				body,
				E("div", { style: { fontSize: "11px", color: TOKEN.muted, flex: "0 0 auto" } }, t("hint.settings"))
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

		function apply(ctx) {
			var service = ctx && ctx.betterSidebar;
			if (!service || typeof service.registerTab !== "function") return;
			var register = function () {
				return service.registerTab({
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
			};
			if (typeof ctx.effect === "function") ctx.effect(register);
			else register();
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.TAB_ID = TAB_ID;
		return module.exports;
	}
});
