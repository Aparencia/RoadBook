/**
 * roadbook-evolve —— 自进化信号表的**纯逻辑层**。
 *
 * 为什么单独一个文件：宿主半（index.js）的定位是「只做接线」——读文件、起进程、注册路由；
 * 而解析、判定、阈值一律留在这里，因为它们是**可离线单测**的。混进接线里就只能靠真机肉眼验
 * （与 lib/update.js / plugin/roadbook-autoload/trigger.js 同一条分工口径）。
 *
 * 本文件不 import 任何外部模块、不碰 fs、不起子进程：输入是**已经读进来的文本与退出码**，
 * 输出是信号表；副作用全在调用方。这样测试不需要造文件系统。
 *
 * 两条口径（沿用母版一贯做法，勿省）：
 *   1) **读不到 ≠ 通过**：文件读不到、命令跑不起来、样本不足，一律判 `unknown` 并把原因写进
 *      detail，绝不显示成 `ok`（假绿比不检查更坏）。
 *   2) **怀疑不等于事实**：观测记录分三态 `prod` / `suspect` / `unknown`，只把命中测试痕量的
 *      记为 suspect 并**单独报数**；判不了的记 unknown，绝不并进 prod。
 */

/** 信号 id 与标题（对外契约：标签页、路由、README 三处引用同一份）。 */
export const SIGNALS = [
  { id: 'S1', title: '观测臂污染', unit: 'suspect/total' },
  { id: 'S2', title: '注入活性', unit: 'inject/loaded' },
  { id: 'S3', title: 'banner 可用率', unit: 'registered/banner' },
  { id: 'S4', title: '工作树状态', unit: 'porcelain 行数' },
  { id: 'S5', title: '规则索引健康', unit: 'rules.mjs --audit 退出码' },
  { id: 'S6', title: '路由完整性', unit: 'route.mjs --audit 退出码' },
];

/** 判定三态：ok = 未越界；hit = 越界；unknown = 判不了（读不到 / 样本不足），不是通过。 */
export const VERDICTS = ['ok', 'hit', 'unknown'];

/** S2 判「注入活性」所需的最小样本：loaded 太少时判 unknown，而不是判「0 次注入 = 有病」。 */
export const MIN_LOADED_SAMPLE = 10;
/** S3 阈值：banner 注册成功率低于此值即越界。 */
export const BANNER_OK_RATIO = 0.5;
/** 自身活性：超过这么久没有 tick 记录，就认为本插件可能已经不在跑（静默死亡检测）。 */
export const STALE_TICK_HOURS = 48;

/**
 * 测试痕量标记（**依据本机实测的真实噪声写的**，不是猜的）。
 *
 * 起因：test/update.test.mjs 的用例不传 `updateReportPath`，于是真实的观测文件里混进了
 * 65 条 `apply-start/apply-finish`，它们的 `command` 是 `fake-installer.mjs`、`latest` 是哨兵
 * 版本 `9.9.9`。真假同文件 ⇒ 6-6 体检抽样抽到的是混合物。
 *
 * V2 修法是让生产者直接写 `arm` 字段；在那之前这里用内容标记做启发式，并把**判不出的记为
 * unknown 单独显示**，而不是假装分干净了。
 */
export const TEST_MARKERS = [
  { key: 'explicit-arm', test: (r) => r.arm === 'test' },
  { key: 'fake-command', test: (r) => typeof r.command === 'string' && /(^|[\\/\s,])fake[-.\w]*/i.test(r.command) },
  { key: 'sentinel-version', test: (r) => r.latest === '9.9.9' || r.after === '9.9.9' || r.before === '9.9.9' },
  { key: 'test-file', test: (r) => typeof r.file === 'string' && /roadbook-test[-.]/i.test(r.file) },
];

/** 命中任一测试标记 → 'suspect'；显式声明 prod → 'prod'；都没有 → 'prod'（该文件本就是生产观测口）。 */
export function classifyArm(record) {
  if (record === null || typeof record !== 'object') return 'unknown';
  if (record.arm === 'prod') return 'prod';
  for (const marker of TEST_MARKERS) {
    let hit = false;
    try {
      hit = marker.test(record) === true;
    } catch {
      hit = false; // 标记函数不该抛；真抛了也不许把整份读数带崩，按未命中处理
    }
    if (hit) return 'suspect';
  }
  return 'prod';
}

/**
 * 逐行解析 JSONL。**坏行只计数不抛**：一份观测文件里出现半行写入（宿主被杀）是常态，
 * 因为半行把整份读数判成「读不到」，等于把已有的证据也丢了。
 *
 * @returns {{ records: object[], badLines: number }}
 */
export function parseJsonl(text) {
  const records = [];
  let badLines = 0;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const value = JSON.parse(trimmed);
      if (value !== null && typeof value === 'object') records.push(value);
      else badLines += 1; // 合法 JSON 但不是对象（数字/字符串）——不是我们写的记录形状
    } catch {
      badLines += 1;
    }
  }
  return { records, badLines };
}

/** 计数辅助：把事件名映射成出现次数。 */
function countEvents(records) {
  const events = {};
  for (const record of records) {
    const name = typeof record.event === 'string' ? record.event : '(no-event)';
    events[name] = (events[name] ?? 0) + 1;
  }
  return events;
}

/** 计数辅助：按某个字段值分组计数（字段缺失记 '(none)'）。 */
function countBy(records, field) {
  const buckets = {};
  for (const record of records) {
    const key = typeof record[field] === 'string' && record[field] !== '' ? record[field] : '(none)';
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

/** 臂分布：把 suspect / unknown 单独报出来，供 S1 使用。 */
function armBreakdown(records) {
  const arms = { prod: 0, suspect: 0, unknown: 0 };
  for (const record of records) arms[classifyArm(record)] += 1;
  return arms;
}

/**
 * roadbook-autoload 的观测摘要（事件名取自 index.js 的既有写法）。
 *
 * `inject` / `card-read` / `idle` 三环是设计文档 §15 的自进化三环；本机实测它们**一条都没有**
 * （138 条记录里只有 loaded / skip / banner），所以 S2 的意义就是把这件事显式化。
 */
export function summarizeAutoload(records) {
  const list = Array.isArray(records) ? records : [];
  const events = countEvents(list);
  return {
    total: list.length,
    events,
    loaded: events.loaded ?? 0,
    inject: events.inject ?? 0,
    cardRead: events['card-read'] ?? 0,
    idle: events.idle ?? 0,
    bannerStates: countBy(list.filter((r) => r.event === 'banner'), 'state'),
    skipReasons: countBy(list.filter((r) => r.event === 'skip'), 'reason'),
    arms: armBreakdown(list),
  };
}

/** roadbook-update 的观测摘要；`applyFailures` 只统计**非测试**的失败，避免把假记录算进真故障。 */
export function summarizeUpdate(records) {
  const list = Array.isArray(records) ? records : [];
  const events = countEvents(list);
  const failures = list.filter(
    (r) => r.event === 'apply-finish' && r.exitCode !== 0 && classifyArm(r) === 'prod',
  );
  const lastCheck = [...list].reverse().find((r) => r.event === 'check') ?? null;
  return {
    total: list.length,
    events,
    checks: events.check ?? 0,
    applyStart: events['apply-start'] ?? 0,
    applyFinish: events['apply-finish'] ?? 0,
    applyRefused: events['apply-refused'] ?? 0,
    refuseReasons: countBy(list.filter((r) => r.event === 'apply-refused'), 'reason'),
    applyFailures: failures.length,
    lastCheck: lastCheck === null ? null : { state: lastCheck.state ?? null, reason: lastCheck.reason ?? null, installed: lastCheck.installed ?? null, latest: lastCheck.latest ?? null },
    arms: armBreakdown(list),
  };
}

/** 本插件自己的观测：tick 记录 = 它还活着的证据（一个会静默死掉的自进化机制比没有更糟）。 */
export function summarizeEvolve(records, now = Date.now()) {
  const list = Array.isArray(records) ? records : [];
  const ticks = list.filter((r) => r.event === 'tick' && typeof r.time === 'string');
  const last = ticks.length > 0 ? ticks[ticks.length - 1].time : null;
  const parsed = last === null ? NaN : Date.parse(last);
  const ageMinutes = Number.isFinite(parsed) ? Math.max(0, Math.round((now - parsed) / 60000)) : null;
  let verdict = 'unknown';
  if (ageMinutes !== null) verdict = ageMinutes > STALE_TICK_HOURS * 60 ? 'hit' : 'ok';
  return { ticks: ticks.length, lastTickAt: last, ageMinutes, verdict };
}

/** 组装一条信号。reading 为 null 一律判 unknown —— 「没有读数」不许被读成「读数是 0」。 */
function signal(id, reading, threshold, verdict, detail) {
  const meta = SIGNALS.find((s) => s.id === id);
  return { id, title: meta.title, unit: meta.unit, reading, threshold, verdict, detail };
}

/**
 * 把各路输入折算成信号表。
 *
 * @param {{
 *   autoload?: { text?: string, error?: string },
 *   update?: { text?: string, error?: string },
 *   git?: { porcelainLines?: number, error?: string },
 *   audits?: { rules?: { code?: number, error?: string }, route?: { code?: number, error?: string } },
 *   evolve?: object[],
 *   now?: number,
 * }} input 每路都可以只带 error：读不到就是 unknown，不许退化成 ok。
 */
export function evaluateSignals(input = {}) {
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const autoload = summarizeAutoload(input.autoload?.text === undefined ? [] : parseJsonl(input.autoload.text).records);
  const update = summarizeUpdate(input.update?.text === undefined ? [] : parseJsonl(input.update.text).records);

  const out = [];

  // ── S1 观测臂污染：命中测试痕量的记录占比 ──────────────────────────────────
  if (input.autoload?.error !== undefined || input.update?.error !== undefined) {
    out.push(signal('S1', null, '> 0', 'unknown', `观测文件读不到（${input.autoload?.error ?? input.update?.error}）`));
  } else {
    const total = autoload.total + update.total;
    const suspect = autoload.arms.suspect + update.arms.suspect;
    out.push(
      signal('S1', `${suspect}/${total}`, '> 0', total === 0 ? 'unknown' : suspect > 0 ? 'hit' : 'ok',
        total === 0 ? '两份观测文件都是空的' : suspect > 0 ? '存在测试痕量：真假同文件，抽样结论不可信' : '未发现测试痕量'),
    );
  }

  // ── S2 注入活性：注入了没有？样本不足判 unknown，不判「有病」 ─────────────
  if (input.autoload?.error !== undefined) {
    out.push(signal('S2', null, `inject = 0 且 loaded ≥ ${MIN_LOADED_SAMPLE}`, 'unknown', `观测文件读不到（${input.autoload.error}）`));
  } else if (autoload.loaded < MIN_LOADED_SAMPLE) {
    out.push(signal('S2', `${autoload.inject}/${autoload.loaded}`, `inject = 0 且 loaded ≥ ${MIN_LOADED_SAMPLE}`, 'unknown', `样本不足（loaded=${autoload.loaded}）`));
  } else {
    const dead = autoload.inject === 0;
    out.push(signal('S2', `${autoload.inject}/${autoload.loaded}`, `inject = 0 且 loaded ≥ ${MIN_LOADED_SAMPLE}`, dead ? 'hit' : 'ok',
      dead ? `本行已加载 ${autoload.loaded} 次却一次都没注入过——三环（注入/指纹/空转）结构上不可能有读数` : '有注入记录'));
  }

  // ── S3 banner 可用率：补「关键词没命中」的那块补丁在不在岗 ─────────────────
  const bannerTotal = Object.values(autoload.bannerStates).reduce((a, b) => a + b, 0);
  if (input.autoload?.error !== undefined) {
    out.push(signal('S3', null, `< ${BANNER_OK_RATIO * 100}%`, 'unknown', `观测文件读不到（${input.autoload.error}）`));
  } else if (bannerTotal === 0) {
    out.push(signal('S3', null, `< ${BANNER_OK_RATIO * 100}%`, 'unknown', '没有 banner 记录'));
  } else {
    const registered = autoload.bannerStates.registered ?? 0;
    const ratio = registered / bannerTotal;
    out.push(signal('S3', `${registered}/${bannerTotal}`, `< ${BANNER_OK_RATIO * 100}%`, ratio < BANNER_OK_RATIO ? 'hit' : 'ok',
      ratio < BANNER_OK_RATIO ? `注册成功率 ${Math.round(ratio * 100)}%：常驻铁律大部分时间不在岗` : '注册成功率正常'));
  }

  // ── S4 工作树状态（脏树会让「完成」与「提交」脱钩）─────────────────────────
  if (input.git?.error !== undefined || typeof input.git?.porcelainLines !== 'number') {
    out.push(signal('S4', null, '> 0', 'unknown', `git 读不到（${input.git?.error ?? '未提供'}）`));
  } else {
    const dirty = input.git.porcelainLines;
    out.push(signal('S4', String(dirty), '> 0', dirty > 0 ? 'hit' : 'ok', dirty > 0 ? '工作树不干净：先回写状态再提交' : '工作树干净'));
  }

  // ── S5 / S6：复用既有 CLI 的退出码，**不复刻它们的判据**（防第二处真相）────
  for (const [id, audit, label] of [['S5', input.audits?.rules, 'rules.mjs --audit'], ['S6', input.audits?.route, 'route.mjs --audit']]) {
    if (audit?.error !== undefined || typeof audit?.code !== 'number') {
      out.push(signal(id, null, '退出码 ≠ 0', 'unknown', `${label} 跑不起来（${audit?.error ?? '未提供'}）`));
    } else {
      out.push(signal(id, String(audit.code), '退出码 ≠ 0', audit.code === 0 ? 'ok' : 'hit', audit.code === 0 ? `${label} 判绿` : `${label} 判红`));
    }
  }

  return { signals: out, autoload, update, liveness: summarizeEvolve(input.evolve ?? [], now), generatedAt: new Date(now).toISOString() };
}

/** 汇总：越界数 / 判不了数（unknown 单独报，不混进 ok）。 */
export function tally(signals) {
  const list = Array.isArray(signals) ? signals : [];
  return {
    total: list.length,
    hit: list.filter((s) => s.verdict === 'hit').length,
    ok: list.filter((s) => s.verdict === 'ok').length,
    unknown: list.filter((s) => s.verdict === 'unknown').length,
  };
}
