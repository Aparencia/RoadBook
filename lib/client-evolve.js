/**
 * Roadbook 客户端分块 —— 「自进化」标签页（分块名 `evolve`，路由 `GET /roadbook/bundle/evolve.js`）。
 *
 * 分块契约（三行，别破）：
 *   ① 首两行把自己登记进 `globalThis.__roadbookChunks__`（普通同源脚本，不是 ESM）；
 *   ② 工厂签名是 `(require) => exports` —— 与 DSH 手写客户端半同形；
 *   ③ `require` 除基线模块（react）外，还能取核心注入的虚拟模块 `roadbook/host`。
 *      **这是 RoadBook 与 dsh-better-sidebar 的差异点**：它用自有全局 `__dshSidebarModuleSystem__`
 *      跨 bundle 传外部件，本仓改用 require 里的一个虚拟 id —— 依赖显式、且少一个全局。
 *      理由与实测依据写在 design/vnext-2026-10-07.md §11.2。
 *
 * 为什么值得分块：这一段（412 行）是自进化标签页的全部界面与判定，只有切到那张标签页才需要；
 * 分块后核心 bundle 首屏不再为它付代价，且单文件行数满足 D14 第 1 条。
 * 宿主注入什么由 `lib/client.js` 的 chunkHost 决定 —— 本文件不直连任何核心作用域变量。
 */
globalThis.__roadbookChunks__ = globalThis.__roadbookChunks__ || {};
globalThis.__roadbookChunks__["evolve"] = (require) => {
	var host = require("roadbook/host");
	var E = host.E;
	var useState = host.useState;
	var useEffect = host.useEffect;
	var useCallback = host.useCallback;
	var format = host.format;
	var formatTime = host.formatTime;
	var messageOf = host.messageOf;
	var requestJson = host.requestJson;
	var useLocaleRevision = host.useLocaleRevision;
	var dict = host.dict;
	// 下面这个是**当值用**的依赖（页脚拼 "v" + 版本号），不是被调用的函数 ——
	// 第一版依赖扫描只找 `名字(` 的调用形态，于是漏了它，一直到运行期才炸 ReferenceError。
	// 教训：搬代码时按**标识符本体**核依赖，别按调用形态核。
	var PLUGIN_VERSION = host.PLUGIN_VERSION;
	var TOKEN = host.styles.TOKEN;
	var buttonStyle = host.styles.buttonStyle;
	var badgeStyle = host.styles.badgeStyle;
	var sectionStyle = host.styles.sectionStyle;
	var EVOLVE_STATUS_PATH = host.routes.evolveStatus;
	var EVOLVE_TICK_PATH = host.routes.evolveTick;

	// ── 以下 412 行由 lib/client.js 原样搬来（会话内脚本 migrate-evolve.mjs，仅整体缩进减一级） ──

	// ── 自进化（宿主半判定 + 本机路由；这一半只显示与发指令） ────────────────
	/**
	 * 三态判定的唯一入口：**只有字面量 'ok' 与 'hit' 被承认，其余一律 'unknown'**。
	 *
	 * 这条「默认拒绝」是本仓库最在意的一条口径（读不到 ≠ 通过）：verdict 缺失、大小写不同、
	 * 或者宿主将来加的新取值，都不许被界面顺手读成「正常」——假绿比不检查更坏。
	 */
	function evolveVerdictOf(value) {
		if (value === "ok") return "ok";
		if (value === "hit") return "hit";
		return "unknown";
	}
	/** 三态 → 文案键：三态必须是三句不同的话，unknown 不许复用 ok 那一句。 */
	function evolveVerdictKey(verdict) {
		if (verdict === "ok") return "evolve.tally.ok";
		if (verdict === "hit") return "evolve.tally.hit";
		return "evolve.tally.unknown";
	}
	/**
	 * 三态 → 徽标色调。ok = 中性实线、hit = 警告色、unknown = **中性虚线**：
	 * 与「正常」同色但不同框、不同字，既肉眼可分，又不把「判不了」渲染成故障。
	 */
	function evolveToneOf(verdict) {
		if (verdict === "hit") return "warn";
		if (verdict === "ok") return "muted";
		return "unknown";
	}
	/** 读数 → 文本；空读数给空串，由渲染层补「无读数」（**不补 0**：0 是读数，没有是另一回事）。 */
	function evolveReadingText(value) {
		if (value === undefined || value === null) return "";
		return String(value);
	}
	/** 计数 → 数字或 null：非有限数一律当「没有」，界面不许把 NaN 印出来。 */
	function countOf(value) {
		return typeof value === "number" && isFinite(value) ? value : null;
	}
	/** 计数 → 文案值：缺失给 '?'（宁可显示问号，也不要把 `{placeholder}` 漏到界面上）。 */
	function countText(value) {
		return value === null ? "?" : String(value);
	}
	/** 自身活性：没有 tick 记录时 verdict 一律降成 unknown —— 自相矛盾的读数不许当正常。 */
	function evolveLivenessOf(raw) {
		if (!raw || typeof raw !== "object") return null;
		var ticks = countOf(raw.ticks);
		var verdict = evolveVerdictOf(raw.verdict);
		if (ticks === null || ticks <= 0) verdict = "unknown";
		return {
			ticks: ticks,
			lastTickAt: typeof raw.lastTickAt === "string" ? raw.lastTickAt : "",
			ageMinutes: countOf(raw.ageMinutes),
			verdict: verdict
		};
	}
	/** autoload 观测摘要（宿主 summarizeAutoload）→ 界面只取要显示的计数。 */
	function evolveAutoloadOf(raw) {
		if (!raw || typeof raw !== "object") return null;
		var arms = raw.arms && typeof raw.arms === "object" ? raw.arms : {};
		return {
			total: countOf(raw.total),
			loaded: countOf(raw.loaded),
			inject: countOf(raw.inject),
			cardRead: countOf(raw.cardRead),
			idle: countOf(raw.idle),
			suspect: countOf(arms.suspect)
		};
	}
	/** update 观测摘要（宿主 summarizeUpdate）→ 同上。 */
	function evolveUpdateOf(raw) {
		if (!raw || typeof raw !== "object") return null;
		return {
			total: countOf(raw.total),
			checks: countOf(raw.checks),
			applyStart: countOf(raw.applyStart),
			applyFailures: countOf(raw.applyFailures)
		};
	}
	/**
	 * 载荷 → 界面视图（纯函数，可离线钉住）。
	 *
	 * 返回 `null` = 这一整块不渲染：不是对象、`ok !== true`、或 signals 不是数组。
	 * 其余返回 `{ signals, tally, liveness, autoload, update, generatedAt }`。
	 *
	 * 两条口径写在**类型转换**里，不写在 JSX 里：
	 *   1) verdict 只认 'ok' / 'hit'，其余（含 undefined）一律 'unknown'；
	 *   2) 没有读数的信号**不许**显示成正常 —— 就算宿主写了 'ok' 也降成 'unknown'。
	 * 另外 tally 由这些行自己数出来，不采信宿主给的那一份：宿主把 unknown 数进 ok 的那种错，
	 * 必须能在界面上数得出来，而不是被它自己那份汇总盖住。
	 */
	function evolveView(payload) {
		if (!payload || typeof payload !== "object" || payload.ok !== true) return null;
		if (!Array.isArray(payload.signals)) return null;
		var signals = [];
		payload.signals.forEach(function (row) {
			if (!row || typeof row !== "object") return;
			var reading = evolveReadingText(row.reading);
			var verdict = evolveVerdictOf(row.verdict);
			if (verdict === "ok" && reading === "") verdict = "unknown";
			signals.push({
				id: typeof row.id === "string" ? row.id : "",
				title: typeof row.title === "string" && row.title !== "" ? row.title : typeof row.id === "string" ? row.id : "?",
				unit: typeof row.unit === "string" ? row.unit : "",
				reading: reading,
				threshold: typeof row.threshold === "string" ? row.threshold : evolveReadingText(row.threshold),
				detail: typeof row.detail === "string" ? row.detail : "",
				verdict: verdict
			});
		});
		var tally = { total: signals.length, hit: 0, ok: 0, unknown: 0 };
		signals.forEach(function (signal) {
			tally[signal.verdict] += 1;
		});
		return {
			signals: signals,
			tally: tally,
			liveness: evolveLivenessOf(payload.liveness),
			autoload: evolveAutoloadOf(payload.autoload),
			update: evolveUpdateOf(payload.update),
			generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : ""
		};
	}
	/** 宿主 200 但不是我们的形状时给一句可看的原因（error 可能是串，也可能是 {code,message}）。 */
	function evolveReasonOf(data) {
		if (!data || typeof data !== "object") return "bad-response";
		var error = data.error;
		if (typeof error === "string" && error !== "") return error;
		if (error && typeof error === "object") return String(error.message || error.code || "bad-response");
		return "bad-response";
	}
	/**
	 * 两条 evolve 路由共用的读取：**读不到不是「一切正常」**。
	 *
	 * 路由不在（404，本行没起/旧宿主）或宿主连不上（status 0）时给 `unavailable: true`，
	 * 界面据此整块降级；其余的失败（403 未受信来源、500）是「路由在但拒绝了」，要显示原因。
	 */
	async function fetchEvolve(url, init) {
		try {
			var data = await requestJson(url, init);
			if (!data || data.ok !== true) return { ok: false, unavailable: false, reason: evolveReasonOf(data) };
			return data;
		} catch (error) {
			var status = error && typeof error.status === "number" ? error.status : 0;
			if (status === 404 || status === 0) return { ok: false, unavailable: true, reason: messageOf(error) };
			return { ok: false, unavailable: false, reason: messageOf(error) };
		}
	}
	/** 读当前信号表（只读路由）。 */
	function fetchEvolveStatus() {
		return fetchEvolve(EVOLVE_STATUS_PATH, { method: "GET", headers: { accept: "application/json" } });
	}
	/** 强制重算（宿主半同步跑完再回同一形状；进度由宿主自己维护，这里不造第二份）。 */
	function fetchEvolveTick() {
		return fetchEvolve(EVOLVE_TICK_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
	}
	/** 「自进化」图标：闭环箭头 + 中心刻度（自测、自改、自回写）。 */
	function evolveIcon(size) {
		var px = typeof size === "number" ? size : 16;
		return E(
			"svg",
			{ width: px, height: px, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" },
			E("path", { key: "loop", d: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3" }),
			E("path", { key: "head", d: "M17.6 3.4v3.6h-3.6" }),
			E("path", { key: "hand", d: "M12 8.6V12l2.6 1.7" })
		);
	}
	/** 一条信号：标题 + 三态徽标 + 读数/阈值 + 宿主给的 detail（判不了的原因就写在里面）。 */
	function evolveSignalRow(signal, t) {
		var facts = signal.reading === "" ? t("evolve.noReading") : signal.reading + (signal.unit ? " " + signal.unit : "");
		if (signal.threshold !== "") facts += " · " + t("evolve.threshold") + " " + signal.threshold;
		return E(
			"div",
			{
				key: signal.id || signal.title,
				style: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface }
			},
			E(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
				E("span", { key: "title", style: { fontSize: "12px", fontWeight: 600, color: TOKEN.text } }, signal.title),
				signal.id ? E("span", { key: "id", style: { fontSize: "11px", color: TOKEN.muted } }, signal.id) : null,
				E("span", { key: "verdict", style: badgeStyle(evolveToneOf(signal.verdict)) }, t(evolveVerdictKey(signal.verdict)))
			),
			E("div", { key: "facts", style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, facts),
			signal.detail ? E("div", { key: "detail", style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, signal.detail) : null
		);
	}
	/** 自身活性一行：没有 tick 记录就直说「还没有 tick 记录」，不显示成正常。 */
	function evolveLivenessRow(liveness, t) {
		var facts = liveness.ticks === null || liveness.ticks <= 0 ? t("evolve.livenessNever") : format(t("evolve.livenessTicks"), { count: String(liveness.ticks) });
		if (liveness.lastTickAt) facts += " · " + format(t("evolve.livenessLast"), { time: formatTime(liveness.lastTickAt) });
		if (liveness.ageMinutes !== null) facts += " · " + format(t("evolve.livenessAge"), { minutes: String(liveness.ageMinutes) });
		return E(
			"div",
			{
				key: "liveness",
				style: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px", border: "1px solid " + TOKEN.border, borderRadius: "8px", background: TOKEN.surface }
			},
			E(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
				E("span", { key: "title", style: { fontSize: "12px", fontWeight: 600, color: TOKEN.text } }, t("evolve.liveness")),
				E("span", { key: "verdict", style: badgeStyle(evolveToneOf(liveness.verdict)) }, t(evolveVerdictKey(liveness.verdict)))
			),
			E("div", { key: "facts", style: { fontSize: "11px", color: TOKEN.muted, wordBreak: "break-all" } }, facts)
		);
	}
	/** 观测摘要一行（autoload / update 共用）：标题 + 计数句 + 可选的一枚痕量徽标。 */
	function evolveObservationLine(key, title, text, suspect) {
		return E(
			"div",
			{ key: key, style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "11px", color: TOKEN.muted } },
			E("span", { key: "title", style: { fontWeight: 600, color: TOKEN.text } }, title),
			E("span", { key: "text" }, text),
			suspect ? E("span", { key: "suspect", style: badgeStyle("warn") }, suspect) : null
		);
	}
	/**
	 * 一帧的纯渲染：状态进、元素树出（与「判定口径不进 JSX」同一条分工）。
	 *
	 * 为什么单独抽出来：这一页最要命的口径是「unknown 显示成判不了，绝不显示成正常」，
	 * 而离线契约测试里的假 React 跑不了 effect / setState —— 驱动不到「加载完成」那一帧。
	 * 抽成纯函数后，任意一帧都能在 Node 里逐字钉住，而不是只钉住一张映射表。
	 *
	 * @param {{ t: Function, view: object|null, error: string, unavailable: boolean,
	 *           busy: boolean, onRefresh: Function, onTick: Function }} model
	 */
	function evolveFrame(model) {
		var t = model.t;
		var view = model.view || null;
		var unavailable = model.unavailable === true;
		var busy = model.busy === true;
		var header = E(
			"div",
			{ key: "head", style: sectionStyle() },
			E("span", { key: "title", style: { fontSize: "13px", fontWeight: 600 } }, t("evolve.tabTitle")),
			view ? E("span", { key: "hit", style: badgeStyle(view.tally.hit > 0 ? "warn" : "muted") }, t("evolve.tally.hit") + " " + view.tally.hit) : null,
			view ? E("span", { key: "ok", style: badgeStyle("muted") }, t("evolve.tally.ok") + " " + view.tally.ok) : null,
			// 判不了的计数与「正常」的计数**分开显示**：把 unknown 并进 ok 正是要防的那种假绿。
			view ? E("span", { key: "unknown", style: badgeStyle("unknown") }, t("evolve.tally.unknown") + " " + view.tally.unknown) : null,
			E("span", { key: "spacer", style: { flex: "1 1 auto" } }),
			view && view.generatedAt ? E("span", { key: "at", style: { fontSize: "11px", color: TOKEN.muted } }, t("evolve.generatedAt") + " " + formatTime(view.generatedAt)) : null,
			view ? E("button", { key: "refresh", type: "button", style: buttonStyle(false), onClick: model.onRefresh }, t("action.refresh")) : null,
			view ? E("button", { key: "tick", type: "button", style: buttonStyle(true), disabled: busy, onClick: model.onTick }, busy ? t("evolve.ticking") : t("evolve.tick")) : null
		);
		var body = null;
		if (unavailable) {
			// 宿主路由不在：整块降级成一句说明，**一个按钮都不留** —— 点了必然 404 的按钮等于死按钮。
			body = E(
				"div",
				{ key: "unavailable", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: TOKEN.muted } },
				E("div", { key: "text", style: { color: TOKEN.warn } }, t("evolve.unavailable")),
				E("div", { key: "hint" }, t("evolve.unavailableHint"))
			);
		} else if (!view) {
			body = model.error
				? E(
						"div",
						{ key: "error", style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" } },
						E("div", { key: "text", style: { color: TOKEN.warn } }, t("evolve.error") + "：" + model.error),
						E("div", { key: "row", style: sectionStyle() }, E("button", { key: "retry", type: "button", style: buttonStyle(false), onClick: model.onRefresh }, t("evolve.retry")))
					)
				: E("div", { key: "loading", style: { fontSize: "12px", color: TOKEN.muted } }, t("evolve.loading"));
		} else {
			body = E(
				"div",
				{ key: "list", style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: "6px", overflowY: "auto" } },
				// 刷新失败时旧读数仍然显示，但必须顶着一条警告：不能让人以为它是刚读到的。
				model.error ? E("div", { key: "stale", style: { fontSize: "11px", color: TOKEN.warn, wordBreak: "break-all" } }, t("evolve.error") + "：" + model.error) : null,
				view.liveness ? evolveLivenessRow(view.liveness, t) : null,
				view.signals.length === 0
					? E("div", { key: "empty", style: { fontSize: "12px", color: TOKEN.muted } }, t("evolve.empty"))
					: view.signals.map(function (signal) {
							return evolveSignalRow(signal, t);
						}),
				view.autoload
					? evolveObservationLine(
							"autoload",
							t("evolve.autoload"),
							format(t("evolve.autoloadLine"), {
								total: countText(view.autoload.total),
								loaded: countText(view.autoload.loaded),
								inject: countText(view.autoload.inject),
								cardRead: countText(view.autoload.cardRead),
								idle: countText(view.autoload.idle)
							}),
							view.autoload.suspect ? format(t("evolve.suspect"), { suspect: countText(view.autoload.suspect), total: countText(view.autoload.total) }) : ""
						)
					: null,
				view.update
					? evolveObservationLine(
							"update",
							t("evolve.update"),
							format(t("evolve.updateLine"), {
								total: countText(view.update.total),
								checks: countText(view.update.checks),
								applyStart: countText(view.update.applyStart),
								applyFailures: countText(view.update.applyFailures)
							}),
							""
						)
					: null
			);
		}
		return E(
			"div",
			{
				style: { display: "flex", flexDirection: "column", flex: "1 1 auto", height: "100%", minHeight: 0, gap: "8px", padding: "10px", boxSizing: "border-box", overflow: "hidden", color: TOKEN.text }
			},
			header,
			body,
			E("div", { style: { fontSize: "11px", color: TOKEN.muted, flex: "0 0 auto" } }, t("evolve.verdictNote") + " · v" + PLUGIN_VERSION)
		);
	}
	/**
	 * 「自进化」标签页：宿主半把信号判成 ok / hit / unknown，这一半**只显示**。
	 *
	 * 三条接线约定：
	 *   - `unknown` 一律显示成「判不了」（中性虚线徽标），**绝不显示成正常** —— 读不到 ≠ 通过；
	 *   - 宿主路由不在时整块降级、不留死按钮（判定与降级都写在 evolveView / evolveFrame 里）；
	 *   - 不自动轮询：状态路由背后是 CLI 审计，常驻轮询会把审计变成常驻负载；标签页每次变为
	 *     可见时读一次，另有「刷新」与「重算」两个手动入口。
	 */
	function EvolvePanel(props) {
		var ctx = props.ctx;
		var visible = props.visible;
		useLocaleRevision(ctx);
		var t = dict(ctx);
		var statePair = useState({ view: null, error: "", unavailable: false });
		var state = statePair[0];
		var setState = statePair[1];
		var busyPair = useState(false);
		var busy = busyPair[0];
		var setBusy = busyPair[1];

		/**
		 * 失败一律走这里：**手里已有读数就留着**（顶一条警告，说明它可能不是刚读到的），
		 * 手里什么都没有才把整块判成读不到。`unavailable` 是例外：路由都没了，页面上的旧
		 * 读数就不该再被当成现状，整块降级。
		 */
		var applyFailure = useCallback(function (reason, unavailable) {
			setState(function (previous) {
				if (unavailable === true) return { view: null, error: reason || "", unavailable: true };
				return { view: previous.view, error: reason || "", unavailable: false };
			});
		}, []);

		var adopt = useCallback(
			function (payload) {
				if (payload && payload.unavailable === true) {
					applyFailure(payload.reason || "", true);
					return;
				}
				if (!payload || payload.ok !== true) {
					applyFailure((payload && payload.reason) || "", false);
					return;
				}
				var next = evolveView(payload);
				if (next === null) {
					applyFailure("bad-payload", false);
					return;
				}
				setState({ view: next, error: "", unavailable: false });
			},
			[applyFailure]
		);

		var load = useCallback(
			function () {
				return fetchEvolveStatus().then(adopt, function (error) {
					applyFailure(messageOf(error), false);
				});
			},
			[adopt, applyFailure]
		);

		var recompute = useCallback(
			function () {
				setBusy(true);
				return fetchEvolveTick().then(
					function (payload) {
						setBusy(false);
						adopt(payload);
					},
					function (error) {
						setBusy(false);
						applyFailure(messageOf(error), false);
					}
				);
			},
			[adopt, applyFailure]
		);

		useEffect(
			function () {
				if (!visible) return undefined;
				var alive = true;
				fetchEvolveStatus().then(
					function (payload) {
						if (alive) adopt(payload);
					},
					function (error) {
						if (alive) applyFailure(messageOf(error), false);
					}
				);
				return function () {
					alive = false;
				};
			},
			[visible, adopt, applyFailure]
		);

		return evolveFrame({ t: t, view: state.view, error: state.error, unavailable: state.unavailable, busy: busy, onRefresh: load, onTick: recompute });
	}

	// 分块的对外面：核心只用到 EvolvePanel（描述符的 component）与 evolveIcon（图标），
	// 其余是契约测试直接钉住的纯函数（判定 / 三态 / 帧），一并给出来。
	return {
		EvolvePanel: EvolvePanel,
		evolveIcon: evolveIcon,
		evolveFrame: evolveFrame,
		evolveView: evolveView,
		evolveVerdictOf: evolveVerdictOf,
		evolveVerdictKey: evolveVerdictKey,
		evolveToneOf: evolveToneOf,
		evolveReasonOf: evolveReasonOf,
		fetchEvolveStatus: fetchEvolveStatus,
		fetchEvolveTick: fetchEvolveTick
	};
};
