/**
 * RoadBook 主插件 —— 宿主半（host half），对应 Loader 里的主行 `roadbook`。
 *
 * 这一半做三件事：
 *   1) 对外报告版本号（唯一事实源是根 package.json，代码里不留副本）；
 *   2) 在 apply() 里做一次就绪自检：随包的技能、CLI、渲染器、客户端半是否都在磁盘上。
 *      缺文件要看得见 —— 打一条明确警告，而不是静默降级成「插件装了但什么都不工作」；
 *   3) 2026-10-05 起：自动更新（判定 / 取证 / 执行 / 两条本机路由）。纯逻辑在 ./update.js，
 *      本文件只做接线 —— 与 `roadbook-autoload` 的 trigger.js / index.js 同一条分工口径。
 *
 * 流程正文在 skills/roadbook/，图纸能力在 skills/roadbook-atlas/，
 * 侧边栏「图册」标签页在客户端半 ./client；宿主半不注册工具、不碰用户数据。
 *
 * 2026-10-05：清单改为「显式路径 + 入口模块的静态相对 import 闭包」两段合成。
 * 起因是一次实测事故：`plugin/roadbook-autoload/package.json` 的 files 白名单漏了
 * `host-fallback.js`（入口静态 import 它），装出来的插件在面板上显示「未运行」——
 * 而当时的自检清单是手写的，恰好也漏了同一个文件，于是两个本该互相兜底的机制一起失明。
 * 手写清单还会漂：谁新增一个入口模块，就得记得回来补一行。现在 import 闭包自动覆盖这类文件
 * （`./update.js` 就是这么进自检的，`test/umbrella-contract.test.mjs` 钉住了它）。
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PACKAGE,
  DEFAULT_REPORT_FILE,
  STALE_LOCK_MS,
  candidateInstallers,
  checkForUpdate,
  commitApiUrlOf,
  createManifestFetcher,
  errorText,
  fillTemplate,
  homeOf,
  installKindOf,
  lastCheckAt,
  lockCommitOf,
  normalizeConfig,
  profileDirOf,
  readProfileLock,
  readProfileSpec,
  readRuntimeCommands,
  trustedLocalRequest,
  upstreamOf,
} from './update.js';

/** Loader 行 id（profile patch 里用 id 开关本行）。 */
export const name = 'roadbook';
/** 图纸默认落点（相对项目根），与 skill 文档、侧边栏默认值三处一致。 */
export const DEFAULT_DIAGRAM_DIR = 'docs/diagrams';

/** 主插件根目录（lib/index.js 的上一级）。link: / npm / 子目录安装都不影响它。 */
export function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/** 版本号：只读 package.json；读不到报 unknown 而不抛错（一条日志不该拖垮整个 profile）。 */
export function pluginVersion(root = packageRoot()) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown';
  } catch (error) {
    return `unknown（package.json 读不到：${error && error.message ? error.message : '未知原因'}）`;
  }
}

/**
 * 宿主入口模块（相对伞包根，一律正斜杠）——它们的静态 import 闭包必须全在。
 * 只列真正的「loader 行入口」：这几条 import 失败 = 面板上那一行显示「未运行」。
 */
export const HOST_ENTRY_MODULES = [
  'lib/index.js',
  'plugin/roadbook-autoload/index.js',
  'plugin/roadbook-atlas/lib/index.js',
  'plugin/roadbook-team/index.js',
];

/**
 * 随运行时内容（技能正文路由指向的文件 + 客户端半）。
 *
 * 注意：只列**运行时真正需要**的文件。根 `SKILL.md` 是母版的路由文件，不在 package.json 的
 * `files` 白名单里 ⇒ git / npm 装出来的副本里没有它（运行时要的是 skills/roadbook/SKILL.md 镜像）。
 * 把它列进来会让每一次 git 安装都误报「缺少随包文件」并吞掉 ready 日志。
 *
 * `playbook/`、`playbook_EN/`、`template/` 三个是 2026-10-05 补进来的：注入给模型的
 * skills/roadbook/SKILL.md 第一条就要求读 `playbook_EN/0-1-driver-card.md`，1-2 卡要整套复制
 * `template/` —— 这三个目录当初没进 `files` 白名单（实测：npm 打包 88 项里一个都没有、
 * 本机 github 安装副本里也全缺），于是插件在真实安装形态下只是一张指向空气的路由表。
 */
export const RUNTIME_FILES = [
  'skills/roadbook/SKILL.md',
  'skills/roadbook-atlas/SKILL.md',
  'skills/roadbook-atlas/bin/atlas.mjs',
  'skills/roadbook-atlas/vendor/archify/bin/archify.mjs',
  'plugin/roadbook-atlas/lib/index.js',
  'lib/client.js',
  // 流程卡与模板：不是「随包」而是「随流程」，缺了等于装了个空壳
  'playbook/0-1-驱动卡.md',
  'playbook_EN/0-1-driver-card.md',
  'template/check.ps1',
  // 硬规则的机器可读索引：rules.mjs --audit 与插件机制（Team 探针 / 动作闸 / 状态校验）读它
  'rules/rules.json',
];

/**
 * 静态相对 import 的匹配。
 *
 * 必须在**剥掉注释与字符串之后**再扫：本文件与别的文件里都有把 import 当例子写在注释里的行
 * （例如「`import x from './a.js'` 这种写法…」），不剥就会把一个并不存在的文件
 * 当成依赖，于是自检报出假缺失 —— 假红比不检查更坏。
 *
 * 锚点从 `^[ \t]*` 放宽成 `(?:^|[;{}])[ \t]*`：`import` 与上一条语句写在同一行时
 * （`const r = /a\/b/; import t from './real7.js';`）老锚点根本匹配不到，真依赖被漏掉 ——
 * 那是**假绿**：自检悄悄不再检查一个真的必需文件。放宽是安全的，因为字符串与注释里的
 * `import` 文本已经被 stripComments 抹掉 / 删掉了（下面有对应测试钉住）。
 *
 * 跨行 import 必须支持：`plugin/roadbook-autoload/index.js` 的两个 import 都是
 * `import {\n  a,\n  b,\n} from './x.js'` 这种多行写法。
 * `(?!;)` 防止把两条语句连起来匹配；区间上限是防跑飞的兜底。
 */
const IMPORT_FROM = /(?:^|[;{}])[ \t]*(?:import|export)\b((?:(?!;)[\s\S]){0,600}?)\bfrom[ \t]*['"](\.[^'"]+)['"]/gm;
const IMPORT_SIDE_EFFECT = /(?:^|[;{}])[ \t]*import[ \t]*['"](\.[^'"]+)['"]/gm;

/** `/` 前面是这些字符时，它更可能是正则字面量的开头（值的位置），而不是除号。 */
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>']);
/** 这些关键字之后同样是「值的开头」，正则可以跟在后面。 */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'case', 'yield', 'await', 'throw']);
/** 相对说明符的形状：`.` 开头、不含空白与引号 —— 只有这种字符串才可能是 import 的说明符。 */
const SPECIFIER_SHAPE = /^\.[^\s'"`]*$/;

/** `/` 是不是正则字面量的开头（只看前面那个「有意义」的字符或关键字）。 */
function mayStartRegex(previous, word) {
  if (previous === '') return true; // 文件开头
  return REGEX_KEYWORDS.has(word) || REGEX_AFTER.has(previous);
}

/** 从 start（指向开头那个 `/`）扫到闭合 `/` 与标志位，返回其后一位；跨行说明它不是正则，返回 -1。 */
function scanRegexLiteral(text, start) {
  let cursor = start + 1;
  let inClass = false;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\\') {
      const escaped = text[cursor + 1];
      if (escaped === undefined || escaped === '\n' || escaped === '\r') return -1;
      cursor += 2;
      continue;
    }
    if (char === '\n' || char === '\r') return -1; // 正则不能跨行：这是个除号
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) {
      cursor += 1;
      while (cursor < text.length && /[A-Za-z]/.test(text[cursor])) cursor += 1; // 标志位 gimsuy
      return cursor;
    }
    cursor += 1;
  }
  return -1;
}

/**
 * 剥掉注释与字符串，只留代码（够用即可：只用来找相对 import）。
 *
 * 为什么是**单趟状态机**而不是原来的两条正则：块注释正则先跑、又不认识字符串与行注释，
 * 于是一个写在字符串 / 行注释里的块注释开头（`/*`）会把后面直到块注释结尾的真代码整段吞掉。
 * 复现：`const s = "/* 假注释"; import a from './real.js';` 里的 import 直接消失 ——
 * 那是**假绿**：自检悄悄不再检查一个真的必需文件，正是这套自检要防的那一类错误。
 * 状态机按出现顺序判断「这里是注释 / 字符串 / 正则 / 代码」，不会张冠李戴。
 *
 * 输出约定（IMPORT_FROM / IMPORT_SIDE_EFFECT 的锚点依赖它）：
 *   - 注释整段删掉，其中的换行保留（行号仍然对得上）；
 *   - 字符串 / 模板的内容抹成空格（换行保留），**但形如 `'./x.js'` 的相对说明符原样留下** ——
 *     锚点要靠这一对引号找到说明符，全抹掉等于所有 import 都认不出来；反过来，写在
 *     字符串 / 模板里的 import 例子随之消失，不会变成幽灵依赖（假红）。
 *   - 正则字面量按「`/` 处在表达式可能开始的位置」这一常见启发式识别（见 REGEX_AFTER /
 *     REGEX_KEYWORDS）；跨行或识别不出的一律当除号 —— 宁可漏剥一个正则，也不误吞一行代码。
 *
 * 已知不做的：模板不解析 `${}`，直接吃到配对的结束反引号（模板不可能是模块说明符，整段抹掉
 * 即可），因此 `${}` 里再嵌反引号会提前收尾；正则的启发式在 `}` 后接除法这类边界上会误判。
 * 两者都只会多抹 / 少抹**同一行内**的一小段文本，不会把真 import 藏起来。
 */
export function stripComments(source) {
  const text = String(source);
  const out = [];
  let index = 0;
  let previous = ''; // 最近一个非空白代码字符（'' = 文件开头）：判断 `/` 是正则还是除号
  let word = ''; // 紧贴在当前位置之前的标识符（前面是不是 return / typeof 这类关键字要看它）
  /** 原样留下一个代码字符，并更新「上一个有意义的字符 / 标识符」。 */
  const keepCode = (char) => {
    out.push(char);
    if (/\s/.test(char)) return;
    previous = char;
    word = /[\w$]/.test(char) ? `${word}${char}` : '';
  };
  /** 抹掉一个字符：换行保留，其余换成空格。 */
  const wipe = (char) => {
    out.push(char === '\n' || char === '\r' ? char : ' ');
  };

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1] ?? '';

    if (char === '/' && next === '/') {
      // 行注释：整段删掉（收尾的换行留给下一轮当代码）
      index += 2;
      while (index < text.length && text[index] !== '\n' && text[index] !== '\r') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      // 块注释：整段删掉，只保留其中的换行
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n' || text[index] === '\r') out.push(text[index]);
        index += 1;
      }
      index += 2; // 跳过收尾的 `*` + `/`；没闭合时越过结尾即可，循环条件会兜住
      continue;
    }
    if (char === '"' || char === "'") {
      // 单/双引号字符串：只有「相对说明符形状」的内容留下，其余（含写在里面的 import 例子）抹掉
      const body = [];
      let cursor = index + 1;
      let closed = false;
      while (cursor < text.length) {
        const inner = text[cursor];
        if (inner === '\\') {
          body.push(inner);
          if (cursor + 1 < text.length) body.push(text[cursor + 1]);
          cursor += 2;
          continue;
        }
        if (inner === char) {
          closed = true;
          break;
        }
        if (inner === '\n' || inner === '\r') break; // 单/双引号字符串不能跨行：当作未闭合
        body.push(inner);
        cursor += 1;
      }
      const end = closed ? cursor + 1 : cursor;
      if (SPECIFIER_SHAPE.test(body.join(''))) {
        for (let at = index; at < end; at += 1) keepCode(text[at]);
      } else {
        keepCode(char);
        for (let at = index + 1; at < end; at += 1) wipe(text[at]);
        if (closed) keepCode(char);
      }
      index = end;
      continue;
    }
    if (char === '`') {
      // 模板：整段抹掉（不解析 ${}，直接吃到配对的结束反引号）
      keepCode(char);
      let cursor = index + 1;
      let closed = false;
      while (cursor < text.length) {
        const inner = text[cursor];
        if (inner === '\\') {
          wipe(inner);
          if (cursor + 1 < text.length) wipe(text[cursor + 1]);
          cursor += 2;
          continue;
        }
        if (inner === '`') {
          closed = true;
          break;
        }
        wipe(inner);
        cursor += 1;
      }
      if (closed) keepCode('`');
      index = closed ? cursor + 1 : cursor;
      continue;
    }
    if (char === '/' && mayStartRegex(previous, word)) {
      // 正则字面量：整段抹掉（扫不到闭合就当除号，走下面的普通字符分支）
      const end = scanRegexLiteral(text, index);
      if (end > index) {
        for (let at = index; at < end; at += 1) wipe(text[at]);
        previous = ')'; // 正则整体是一个值：后面再遇到 `/` 只会是除号
        word = '';
        index = end;
        continue;
      }
    }
    keepCode(char);
    index += 1;
  }
  return out.join('');
}

/** 把 `./a/b.js` 相对 base 目录归一成伞包根下的相对路径（一律正斜杠，跨平台可比）。 */
function resolveRelative(base, specifier) {
  const parts = (base === '.' ? [] : String(base).split('/')).concat(String(specifier).split('/'));
  const stack = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

/**
 * 一个入口模块的静态相对 import 闭包（相对伞包根、正斜杠、去重、含入口自身）。
 *
 * 只跟相对路径：裸包名由宿主解析（peerDependencies），不是随包文件；
 * 解析不到的相对 import 不做猜测（文件缺失由调用方统一报出来）。
 */
export function relativeImportClosure(root, entryRelative) {
  const seen = new Set();
  const queue = [resolveRelative('.', entryRelative)];
  while (queue.length > 0) {
    const relative = queue.shift();
    if (seen.has(relative)) continue;
    seen.add(relative);
    let source;
    try {
      source = readFileSync(join(root, relative), 'utf8');
    } catch {
      continue; // 文件不在：留给 missingBundledFiles 报「缺」，这里不重复判定
    }
    const code = stripComments(source);
    // relative 全部来自 resolveRelative，恒为正斜杠，不需要再做分隔符归一
    const base = dirname(relative);
    for (const pattern of [IMPORT_FROM, IMPORT_SIDE_EFFECT]) {
      pattern.lastIndex = 0;
      let match = pattern.exec(code);
      while (match !== null) {
        // 两条模式的分组数不同，取最后一个捕获组就是 specifier
        queue.push(resolveRelative(base, match[match.length - 1]));
        match = pattern.exec(code);
      }
    }
  }
  return [...seen];
}

/**
 * 就绪自检：列出缺失的随包文件，空数组 = 一切就位。
 *
 * @param {string} [root] 伞包根，默认本文件所在包的根。
 */
export function missingBundledFiles(root = packageRoot()) {
  const required = new Set(RUNTIME_FILES);
  for (const entry of HOST_ENTRY_MODULES) {
    for (const relative of relativeImportClosure(root, entry)) required.add(relative);
  }
  return [...required].filter((relative) => !existsSync(join(root, relative)));
}

/** 更新能力的两条本机路由（客户端半按这两个路径取状态 / 发起更新）。 */
export const UPDATE_STATUS_PATH = '/roadbook/update/status';
export const UPDATE_APPLY_PATH = '/roadbook/update/apply';
/** 开机后多久做第一次检查（毫秒）：让启动日志先落地，别跟自检抢时序。 */
const FIRST_CHECK_DELAY_MS = 3000;
/** 安装命令输出的保留上限（尾巴）：只留证据，不留整份 pnpm 日志。 */
const OUTPUT_TAIL_BYTES = 8000;
/** 超时后先 SIGTERM，宽限这么久再动进程树（与 dsh-plugin-mgr 的 SIGTERM_GRACE_MS 同口径）。 */
const SIGTERM_GRACE_MS = 10000;
/** 杀完进程树再等这么久：`close` 还不来就按超时结账，绝不把 applying/锁永久挂着。 */
const FINAL_GRACE_MS = 5000;
/** 观测文件里出现这些字样时，值被替换成 `***`（配置里的命令可能带注册表 token）。 */
const SECRET_HINT = /(token|password|passwd|secret|_auth|apikey|api[_-]?key|bearer)/iu;
/** 落盘前的脱敏：`--token=xxx` / `TOKEN: xxx` 这类「键 + 值」把值抹掉，URL 里的 `user:pass@` 也抹掉。 */
function redactSecrets(text) {
  const value = typeof text === 'string' ? text : '';
  if (value === '' || !SECRET_HINT.test(value)) return value;
  return value
    .replace(
      /((?:token|password|passwd|secret|_auth|apikey|api[_-]?key|bearer)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/giu,
      '$1***',
    )
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/gu, '//***:***@');
}
/** 观测文件的默认路径（`<os.tmpdir()>/roadbook-update.jsonl`）。 */
const DEFAULT_REPORT_PATH = () => join(tmpdir(), DEFAULT_REPORT_FILE);

/**
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 * @param {{ diagrams?: string, update?: 'off'|'notify'|'auto', updateIntervalHours?: number,
 *           updateTimeoutMs?: number, updateUrl?: string, updateCommand?: string,
 *           updateReport?: boolean, updateReportPath?: string, updateReportMaxBytes?: number }} [config]
 *        主行 config（`roadbook` 行），默认 docs/diagrams。
 * @param {{ fetch?: Function, now?: Function, env?: object, platform?: string, execPath?: string,
 *           execArgv?: string[], argv?: string[], packageRoot?: string, spawn?: Function,
 *           schedule?: boolean }} [runtime] 注入点（测试替身用；不传即用真实环境）。
 */
export function apply(ctx, config = {}, runtime = {}) {
  const line = (level, text) => {
    const sink = ctx && ctx.logger && typeof ctx.logger[level] === 'function' ? ctx.logger[level] : null;
    if (sink) sink.call(ctx.logger, text);
  };
  const missing = missingBundledFiles();
  if (missing.length > 0) {
    line('warn', `roadbook v${pluginVersion()}: 缺少随包文件（相关能力会不可用）：${missing.join(', ')}`);
    return;
  }
  const diagrams = typeof config?.diagrams === 'string' && config.diagrams ? config.diagrams : DEFAULT_DIAGRAM_DIR;
  line('info', `roadbook v${pluginVersion()}: ready（skill=roadbook + roadbook-atlas, diagrams=${diagrams}）`);
  // 更新能力排在 ready 之后接线：它坏掉不许影响上面那条自证日志（缺随包文件时连它也不启）。
  try {
    createUpdateService(ctx, config, runtime).start();
  } catch (error) {
    line('warn', `roadbook: 更新能力接线失败（不影响插件本体）：${errorText(error)}`);
  }
}

/**
 * 自动更新的宿主半接线。**纯判断在 ./update.js**，这里只做四件事：
 *   ① 定时执行检查（开机一次 + 每 `updateIntervalHours` 一次），结果落日志与观测文件；
 *   ② 读本机事实：profile 目录、依赖 spec、pnpm-lock 里的 commit、DSH 自带运行时；
 *   ③ 执行安装命令（带单飞锁、agent 忙闸、超时与输出尾巴）；
 *   ④ 注册两条本机路由给客户端半。
 *
 * 三条不变量（每一条都对应一次真实事故，勿省）：
 *   - **读不到就是 unknown**：绝不把「检查失败」显示成「已是最新」（假绿）。
 *   - **任何一侧失败都不上抛**：更新能力是主行的附加能力，抛出去会把整行插件变成面板上的「未运行」。
 *   - **变更路由必须过同源守卫**：`POST` 会真的执行安装命令，DNS rebinding 页面必须被挡住。
 *
 * @returns {{ start: Function, dispose: Function, check: Function, applyNow: Function, status: Function }}
 */
export function createUpdateService(ctx, config = {}, runtime = {}) {
  const settings = normalizeConfig(config);
  const env = runtime.env !== null && typeof runtime.env === 'object' ? runtime.env : process.env;
  const platform = typeof runtime.platform === 'string' ? runtime.platform : process.platform;
  const execPath = typeof runtime.execPath === 'string' ? runtime.execPath : process.execPath;
  const execArgv = Array.isArray(runtime.execArgv) ? runtime.execArgv : process.execArgv;
  const argv = Array.isArray(runtime.argv) ? runtime.argv : process.argv;
  const spawnImpl = typeof runtime.spawn === 'function' ? runtime.spawn : spawn;
  const fetchImpl = typeof runtime.fetch === 'function' ? runtime.fetch : globalThis.fetch;
  // 清单读取走两级传输：先 fetch，证书类错误再用 `node:https` + 系统 CA 重试一次
  // （本机实测：TLS 拦截的根 CA 只在系统库里，`fetch` 与 `curl.exe` 都验不过，`--use-system-ca` 才通）。
  const manifestFetcher =
    typeof fetchImpl === 'function'
      ? createManifestFetcher({
          fetchImpl,
          timeoutMs: settings.timeoutMs,
          httpsImpl: typeof runtime.httpsGet === 'function' ? runtime.httpsGet : undefined,
        })
      : null;
  const now = typeof runtime.now === 'function' ? runtime.now : Date.now;
  // 两段宽限期可注入：默认值就是生产值，测试用毫秒级的值把「超时 → 杀树 → 兜底结账」这条
  // 路径跑完（真按 10s + 5s 跑，一条用例要 20 秒）。
  const sigtermGraceMs = Number.isFinite(runtime.sigtermGraceMs) ? runtime.sigtermGraceMs : SIGTERM_GRACE_MS;
  const finalGraceMs = Number.isFinite(runtime.finalGraceMs) ? runtime.finalGraceMs : FINAL_GRACE_MS;
  const root = typeof runtime.packageRoot === 'string' ? runtime.packageRoot : packageRoot();
  const schedule = runtime.schedule !== false;

  const reportPath = settings.reportPath !== '' ? settings.reportPath : DEFAULT_REPORT_PATH();
  const profileDir = profileDirOf(env, root);
  const profileName = typeof env.DSH_PROFILE === 'string' ? env.DSH_PROFILE : '';
  const bootVersion = pluginVersion(root);
  const lockDir = profileDir !== '' ? profileDir : tmpdir();
  const lockFile = join(lockDir, '.roadbook-update.lock');
  const home = homeOf(env);

  const state = {
    status: null,
    checking: null,
    operation: null,
    applying: false,
    applyingSince: null,
    lastCheckAt: null,
    reportBytes: 0,
    timers: [],
    runtimes: null,
  };
  try {
    state.reportBytes = statSync(reportPath).size;
  } catch {
    state.reportBytes = 0;
  }
  // 锁的所有者标记：只删自己的锁（见 releaseLock 的注释）。
  const lockOwner = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  // ── 观测（旁路：任何失败都只吞自己，绝不打断会话） ──────────────────────────
  /** @returns {boolean} 是否轮转成功（失败时调用方必须放弃这次写入，理由见下）。 */
  const rotateReport = () => {
    let rotated = false;
    try {
      rmSync(`${reportPath}.1`, { force: true });
      renameSync(reportPath, `${reportPath}.1`);
      rotated = true;
    } catch {
      /* 轮转失败只影响体积 */
    }
    if (rotated) {
      state.reportBytes = 0;
      return true;
    }
    // 轮转失败时**不能**假装文件空了：那样上限形同虚设，文件会一直涨
    // （实测：把 `.1` 做成目录让轮转必失败，300 次写入涨到上限的 25.9 倍）。
    try {
      state.reportBytes = statSync(reportPath).size;
    } catch {
      /* 读不到就保持原值，下次还会再试 */
    }
    return false;
  };
  const writeReport = (entry) => {
    if (settings.report !== true) return;
    // 观测文件是给排错用的，但 `updateCommand` 是人写的一整行命令，里面可能嵌注册表 token；
    // 安装器输出也可能回显它。落盘前把「值」抹掉（键名留着，免得看不出发生过什么）。
    const safe = { ...entry };
    for (const key of ['command', 'outputTail', 'message']) {
      if (typeof safe[key] === 'string') safe[key] = redactSecrets(safe[key]);
    }
    const line = `${JSON.stringify({ time: new Date(now()).toISOString(), file: reportPath, ...safe })}\n`;
    const bytes = Buffer.byteLength(line, 'utf8');
    if (state.reportBytes + bytes > settings.reportMaxBytes && rotateReport() !== true) {
      // 轮转不了就放弃这一行：宁可少一条证据，也不让观测文件无限涨到把盘写满。
      return;
    }
    try {
      // mode 只在文件被创建时生效；Windows 上基本是空操作，POSIX 上至少不是 0644。
      appendFileSync(reportPath, line, { encoding: 'utf8', mode: 0o600 });
    } catch {
      return;
    }
    state.reportBytes += bytes;
  };

  // ── 本机事实 ───────────────────────────────────────────────────────────────
  const readOwnManifest = () => {
    try {
      return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  const upstream = () => upstreamOf(readOwnManifest(), settings.manifestUrl);
  const spec = () => readProfileSpec(profileDir, DEFAULT_PACKAGE);
  const installedCommit = (value) => (value === null ? null : lockCommitOf(readProfileLock(profileDir), value));
  const runtimeCommands = () => {
    if (state.runtimes === null) state.runtimes = readRuntimeCommands(home, platform);
    return state.runtimes;
  };
  const exists = (file) => {
    try {
      // 必须是**文件**：只判存在的话，PATH 里一个同名的目录会被当成可用命令（实测会盖掉真正的 dsh.cmd）。
      return statSync(file).isFile();
    } catch {
      return false;
    }
  };
  const planOf = (value = spec()) =>
    candidateInstallers({
      env,
      platform,
      execPath,
      execArgv,
      argv,
      config: { command: settings.command },
      packageName: DEFAULT_PACKAGE,
      spec: value ?? '',
      profile: profileName,
      profileDir,
      exists,
      runtimes: runtimeCommands(),
    });

  // ── 检查 ───────────────────────────────────────────────────────────────────
  const runCheck = async ({ force = false } = {}) => {
    if (settings.mode === 'off') return statusPayload();
    if (state.checking !== null) return state.checking;
    if (force !== true) {
      // 冷却时间取「内存里的最后一次」与「观测文件里的最后一次」的较大者：观测可以关
      // （`updateReport: false`），只认文件的话关掉观测就等于关掉冷却 —— 实测关掉后 5 次轮询
      // 打了 5 次远端，而客户端在更新进行中就是每秒轮询一次 /status。
      const fromFile = lastCheckAt(reportPath);
      const last = state.lastCheckAt === null ? fromFile : fromFile === null ? state.lastCheckAt : Math.max(fromFile, state.lastCheckAt);
      if (last !== null && now() - last < settings.intervalHours * 3600000) {
        writeReport({ event: 'skip', reason: 'cooldown', lastCheckAt: new Date(last).toISOString() });
        return statusPayload();
      }
    }
    state.checking = (async () => {
      try {
        const target = upstream();
        const value = spec();
        const installed = installedCommit(value);
        const verdict = await checkForUpdate({
          fetchImpl: manifestFetcher === null ? undefined : manifestFetcher.fetch,
          manifestUrl: target === null ? '' : target.manifestUrl,
          installedVersion: pluginVersion(root),
          installedCommit: installed,
          // 「推了代码没升版」这一档要找上游 HEAD 提交来对账（版本号相同时才问，省一次请求）。
          commitUrl: target === null ? null : commitApiUrlOf(target.repo, target.branch),
          installKind: value === null ? 'unknown' : installKindOf(value),
          timeoutMs: settings.timeoutMs,
          now,
        });
        state.lastCheckAt = now();
        state.status = {
          ...verdict,
          transport: manifestFetcher === null ? null : manifestFetcher.transport(),
          upstream: target === null ? null : { repo: target.repo, branch: target.branch, source: target.source },
        };
        writeReport({
          event: 'check',
          state: verdict.state,
          reason: verdict.reason,
          installed: verdict.installedVersion,
          latest: verdict.latestVersion,
          commitCheck: verdict.commitCheck,
          elapsedMs: verdict.elapsedMs,
          transport: state.status.transport,
          manifestUrl: target === null ? null : target.manifestUrl,
        });
        if (verdict.state === 'update-available') {
          info(
            `[roadbook] 有新版本 v${verdict.latestVersion}（当前 v${verdict.installedVersion}，依据 ${verdict.reason}）：` +
              `侧栏「图册」标签页点「更新」即可，或把主行配置的 update 设为 auto`,
          );
        } else if (verdict.state === 'unknown') {
          warnOnce(
            `[roadbook] 更新检查判不了（${verdict.reason}${verdict.message === undefined ? '' : `：${verdict.message}`}）：` +
              `这边不会把它当成「已是最新」；要手工核对就比对 git log，或被拦截的网络里把根 CA 装进系统信任库`,
          );
        }
      } catch (error) {
        // 兜底：检查本身出意外也只记证据，绝不上抛（它不是会话路径）。
        state.status = { state: 'unknown', reason: 'handler', message: errorText(error), checkedAt: new Date(now()).toISOString() };
        writeReport({ event: 'check', state: 'unknown', reason: 'handler', message: errorText(error) });
      } finally {
        state.checking = null;
      }
      return statusPayload();
    })();
    return state.checking;
  };

  const info = (text) => {
    try {
      ctx?.logger?.info?.(text);
    } catch {
      /* 日志是旁路 */
    }
  };
  /** 判不了的时候要留一条看得见的日志：`unknown` 只在观测文件里，用户不会去翻。 */
  const warnOnce = (() => {
    let used = false;
    return (text) => {
      if (used) return;
      used = true;
      try {
        ctx?.logger?.warn?.(text);
      } catch {
        /* 日志是旁路 */
      }
    };
  })();

  const applierInfo = () => {
    const plan = planOf();
    return {
      available: plan.available,
      reason: plan.reason,
      kind: plan.kind,
      target: plan.target,
      labels: plan.candidates.map((candidate) => candidate.label),
      skipped: plan.skipped,
    };
  };

  const statusPayload = () => ({
    ok: true,
    mode: settings.mode,
    bootVersion,
    installedNow: pluginVersion(root),
    installed: state.status?.installedVersion ?? pluginVersion(root),
    latest: state.status?.latestVersion ?? null,
    state: state.status?.state ?? (settings.mode === 'off' ? 'off' : 'idle'),
    reason: state.status?.reason ?? '',
    checkedAt: state.status?.checkedAt ?? null,
    transport: state.status?.transport ?? null,
    upstream: state.status?.upstream ?? null,
    applier: settings.mode === 'off' ? { available: false, reason: 'mode-off', skipped: [] } : applierInfo(),
    operation: state.operation,
  });

  // ── 执行安装 ───────────────────────────────────────────────────────────────
  /** 运行中的 agent id：替换运行中的 node_modules 会让新旧文件在同一次输出里混用（判据同 dshmarket）。 */
  const runningAgentIds = () => {
    let service = null;
    try {
      service = typeof ctx?.get === 'function' ? ctx.get('agents') : undefined;
    } catch {
      service = undefined;
    }
    if (service === null || service === undefined || typeof service.list !== 'function') return [];
    let listed;
    try {
      listed = service.list();
    } catch {
      return [];
    }
    if (!Array.isArray(listed)) return [];
    const ids = [];
    for (const agent of listed) {
      if (agent === null || typeof agent !== 'object' || agent.status !== 'running') continue;
      const id = typeof agent.id === 'string' && agent.id !== '' ? agent.id : 'agent';
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const acquireLock = () => {
    // 陈旧阈值必须比「最长一次安装」更宽，否则一个合法但很慢的安装（applyTimeoutMs 可配到 60 分钟）
    // 会被后来者按 30 分钟的标准接管掉。
    const staleMs = Math.max(STALE_LOCK_MS, settings.applyTimeoutMs + sigtermGraceMs + finalGraceMs + 60000);
    let snapshot = null;
    try {
      snapshot = JSON.parse(readFileSync(lockFile, 'utf8'));
    } catch {
      snapshot = null; // 文件不存在或内容坏了都当作「没有锁」——陈旧锁必须能自愈
    }
    const at = Number(snapshot?.at);
    if (Number.isFinite(at)) {
      const age = now() - at;
      if (age < staleMs) {
        return {
          ok: false,
          error: 'locked',
          message: `上一次更新（pid ${snapshot?.pid ?? '?'}，${new Date(at).toISOString()}）还没结束或被中断；等它结束，或删除 ${lockFile} 后重试`,
        };
      }
      writeReport({ event: 'skip', reason: 'stale-lock', ageMs: age, pid: snapshot?.pid ?? null });
    }
    try {
      writeFileSync(lockFile, JSON.stringify({ pid: process.pid, owner: lockOwner, at: now(), label: 'roadbook-update' }), 'utf8');
    } catch (error) {
      return { ok: false, error: 'lock-failed', message: `无法创建锁文件 ${lockFile}：${errorText(error)}` };
    }
    return { ok: true, error: null, message: '' };
  };
  const releaseLock = () => {
    // 只删自己的锁：不做所有权校验时，一个从没拿到锁的实例（或一个被接管后才结束的旧实例）
    // 会把别人正在用的锁删掉，于是「单飞」等于没有。
    let owner = null;
    try {
      owner = JSON.parse(readFileSync(lockFile, 'utf8'))?.owner ?? null;
    } catch {
      return; // 读不到就当它已经不在了
    }
    if (owner !== lockOwner) return;
    try {
      rmSync(lockFile, { force: true });
    } catch {
      /* 释放失败只影响下一次，不影响本次结果 */
    }
  };

  /** 展示用的命令行（含引号还原）：写进观测与界面，排错时一眼看得出到底跑了什么。 */
  const describeCommand = (file, args) =>
    [file, ...(Array.isArray(args) ? args : [])]
      .filter((part) => part !== undefined && part !== null && part !== '')
      .map((part) => (/\s/u.test(String(part)) ? `"${part}"` : String(part)))
      .join(' ');

  const executeApply = (candidate) => {
    const templated = typeof candidate.template === 'string' && candidate.template !== '';
    // 模板命令整行交给 shell（保持引号原样）；其余候选是 argv 形式、shell: false。
    const file = templated ? fillTemplate(candidate.template, { target: candidate.target ?? '', package: DEFAULT_PACKAGE, profile: profileName }) : candidate.file;
    const args = templated ? [] : candidate.args;
    const shell = templated ? true : candidate.shell === true;
    const operation = {
      id: `apply-${now().toString(36)}`,
      state: 'running',
      label: candidate.label,
      // 模板命令整行就是命令行（别再过一遍引号还原，那会显示成「"node --version"」这种四不像）
      command: templated ? file : describeCommand(file, args),
      startedAt: new Date(now()).toISOString(),
      finishedAt: null,
      before: pluginVersion(root),
      after: null,
      exitCode: null,
      timedOut: false,
      outputTail: '',
      error: '',
    };
    state.operation = operation;
    state.applying = true;
    state.applyingSince = now();
    writeReport({ event: 'apply-start', label: candidate.label, target: candidate.target, command: operation.command, profile: profileName });

    let settled = false;
    let timedOut = false;
    let output = '';
    const settle = (code, patch = {}) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (grace !== null) clearTimeout(grace);
      if (final !== null) clearTimeout(final);
      state.applying = false;
      state.applyingSince = null;
      releaseLock();
      operation.state = code === 0 && patch.failed !== true ? 'succeeded' : 'failed';
      operation.finishedAt = new Date(now()).toISOString();
      operation.exitCode = code;
      operation.outputTail = String(patch.output ?? output).slice(-OUTPUT_TAIL_BYTES);
      operation.timedOut = patch.timedOut === true;
      operation.error = patch.error ?? '';
      operation.after = pluginVersion(root);
      writeReport({
        event: 'apply-finish',
        label: candidate.label,
        command: operation.command,
        exitCode: code,
        timedOut: operation.timedOut,
        before: operation.before,
        after: operation.after,
        error: operation.error,
        outputTail: operation.outputTail,
      });
      info(
        `[roadbook] 更新${operation.state === 'succeeded' ? '完成' : '失败'}（${candidate.label}，exit ${code}）：` +
          `${operation.before} → ${operation.after}${operation.state === 'succeeded' ? '；重启 DSH 后生效' : `；${operation.error || '输出尾巴见观测文件'}`}`,
      );
    };

    let child = null;
    let timer = null;
    let grace = null;
    let final = null;
    try {
      child = spawnImpl(file, args, {
        cwd: candidate.cwd === null || candidate.cwd === undefined ? undefined : candidate.cwd,
        shell,
        env: { ...process.env, ...(candidate.env ?? {}), CI: 'true' },
        windowsHide: true,
      });
    } catch (error) {
      settle(-1, { output: errorText(error), error: errorText(error) });
      return operation;
    }
    if (child === null || typeof child !== 'object') {
      settle(-1, { error: 'spawn 未返回子进程' });
      return operation;
    }
    const capture = (chunk) => {
      output = `${output}${String(chunk)}`.slice(-OUTPUT_TAIL_BYTES);
    };
    try {
      child.stdout?.on?.('data', capture);
      child.stderr?.on?.('data', capture);
    } catch {
      /* 拿不到输出也要能把命令跑完 */
    }
    // Windows 上 `child.kill()` 只终结直接子进程。带 shell 的候选（模板命令、`dsh.cmd`）的直接
    // 子进程是 `cmd.exe`，真正的安装器是它的孙进程 —— 只杀 cmd.exe 的话安装器会继续改
    // node_modules，而且它握着继承来的 stdout 管道，`close` 事件永远不会来。实测：SIGTERM 后 8s、
    // SIGKILL 后 3s，安装器与孙进程都还活着、`apply-finish` 一条都没写、锁还在。
    const killTree = () => {
      const pid = typeof child.pid === 'number' && child.pid > 0 ? child.pid : null;
      if (platform === 'win32' && pid !== null) {
        try {
          const killer = spawnImpl('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer?.on?.('error', () => {});
          return;
        } catch {
          /* taskkill 起不来就退回普通 kill，至少把直接子进程收掉 */
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已经退出的进程 kill 会抛，忽略 */
      }
    };
    timer = setTimeout(() => {
      timedOut = true;
      writeReport({ event: 'apply-timeout', label: candidate.label, timeoutMs: settings.applyTimeoutMs, pid: child.pid ?? null });
      try {
        child.kill('SIGTERM');
      } catch {
        /* 已经退出的进程 kill 会抛，忽略 */
      }
      grace = setTimeout(() => {
        killTree();
        // 兜底：杀掉进程树之后 `close` 仍可能永远不来（管道被别的东西握着，或 taskkill 也没收掉）。
        // 不能把 `state.applying` 与锁永久挂在「等 close」上 —— 那会让之后的每一次更新都 409，
        // 而且只有重启宿主才能恢复。到点就按超时结账，把真相（timedOut + 尾部输出）写下来。
        final = setTimeout(() => {
          settle(-1, { output, timedOut: true, error: `超时 ${settings.applyTimeoutMs}ms 后进程树未在宽限期内退出` });
        }, finalGraceMs);
        if (typeof final.unref === 'function') final.unref();
      }, sigtermGraceMs);
      if (typeof grace.unref === 'function') grace.unref();
    }, settings.applyTimeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      child.on?.('error', (error) => settle(-1, { output: `${output}\n${errorText(error)}`.trim(), error: errorText(error) }));
      child.on?.('close', (code) => settle(typeof code === 'number' ? code : -1, { output, timedOut }));
    } catch (error) {
      settle(-1, { output, error: errorText(error) });
    }
    return operation;
  };

  const runApply = async () => {
    if (settings.mode === 'off') {
      writeReport({ event: 'apply-refused', reason: 'mode-off' });
      return { ok: false, status: 403, error: 'mode-off', message: '更新能力已关闭（把主行配置的 update 改回 notify 或 auto）' };
    }
    if (state.applying) {
      // 看门狗没跑成（进程被冻住一类）时也必须能自愈：超过「超时 + 两段宽限」还挂在 applying，
      // 就按陈旧处理并放行，否则之后每一次更新都会 409，只有重启宿主才能恢复。
      const budget = settings.applyTimeoutMs + sigtermGraceMs + finalGraceMs;
      const since = state.applyingSince;
      if (typeof since === 'number' && now() - since > budget) {
        writeReport({ event: 'skip', reason: 'stale-applying', elapsedMs: now() - since });
        state.applying = false;
        state.applyingSince = null;
        releaseLock();
      } else {
        return { ok: false, status: 409, error: 'busy', message: '已有一次更新在进行，等它结束' };
      }
    }
    const value = spec();
    const plan = planOf(value);
    if (plan.available !== true) {
      writeReport({ event: 'apply-refused', reason: plan.reason ?? 'no-installer', spec: value, skipped: plan.skipped });
      return {
        ok: false,
        status: 424,
        error: plan.reason ?? 'no-installer',
        message:
          plan.reason === 'dev-install'
            ? '本条是 link:/file: 开发安装：更新随代码走，不在这里替换'
            : '找不到可用的安装命令（探测过的候选见 skipped）',
        skipped: plan.skipped,
      };
    }
    const busy = runningAgentIds();
    if (busy.length > 0) {
      writeReport({ event: 'apply-refused', reason: 'agents-busy', agents: busy });
      return {
        ok: false,
        status: 409,
        error: 'agents-busy',
        message: `有 agent 正在运行（${busy.join(', ')}）。更新会替换插件文件，运行中的 agent 可能读到新旧混合的文件；等它结束再更新`,
        agents: busy,
      };
    }
    const lock = acquireLock();
    if (lock.ok !== true) {
      writeReport({ event: 'apply-refused', reason: lock.error, message: lock.message });
      return { ok: false, status: 409, error: lock.error, message: lock.message };
    }
    const operation = executeApply(plan.candidates[0]);
    return { ok: true, status: 202, operation };
  };

  // ── 本机路由 ───────────────────────────────────────────────────────────────
  const sendJson = (response, status, payload) => {
    try {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(payload));
    } catch {
      try {
        response.end();
      } catch {
        /* 响应写不出去就到此为止 */
      }
    }
  };
  const methodOf = (request) => String(request?.method ?? 'GET').toUpperCase();
  const forced = (request) => /(?:^|[?&])force=1(?:&|$)/u.test(String(request?.url ?? ''));

  const handleStatus = async (request, response) => {
    if (methodOf(request) !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    if (!trustedLocalRequest(request)) {
      writeReport({ event: 'route', state: 'refused', path: UPDATE_STATUS_PATH });
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    try {
      await runCheck({ force: forced(request) });
    } catch (error) {
      writeReport({ event: 'route', state: 'error', path: UPDATE_STATUS_PATH, message: errorText(error) });
    }
    sendJson(response, 200, statusPayload());
  };

  const handleApply = async (request, response) => {
    if (methodOf(request) !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method' });
      return;
    }
    // 变更请求必须过同源守卫：这条路由会真的执行安装命令。
    if (!trustedLocalRequest(request)) {
      writeReport({ event: 'apply-refused', reason: 'untrusted-origin' });
      sendJson(response, 403, { ok: false, error: 'untrusted-origin' });
      return;
    }
    let result;
    try {
      result = await runApply();
    } catch (error) {
      writeReport({ event: 'apply-refused', reason: 'handler', message: errorText(error) });
      result = { ok: false, status: 500, error: 'handler', message: errorText(error) };
    }
    if (result.ok === true) sendJson(response, 202, { ok: true, operation: state.operation });
    else sendJson(response, result.status, { ok: false, error: result.error, message: result.message, skipped: result.skipped, agents: result.agents });
  };

  /** 可选服务 `webServer`：读不到只让路由不出现，绝不让整行插件变成「未运行」。 */
  const mount = (host, webServer) => {
    const attach = () => {
      const disposers = [
        // handler 直接返回 promise：DSH 不要求，但测试与调试要能 `await` 到这一轮处理完。
        webServer.register({ kind: 'exact', path: UPDATE_STATUS_PATH, handler: (request, response) => handleStatus(request, response) }),
        webServer.register({ kind: 'exact', path: UPDATE_APPLY_PATH, handler: (request, response) => handleApply(request, response) }),
      ];
      writeReport({ event: 'route', state: 'registered', paths: [UPDATE_STATUS_PATH, UPDATE_APPLY_PATH] });
      return () => {
        for (const dispose of disposers) {
          try {
            if (typeof dispose === 'function') dispose();
          } catch {
            /* 撤销失败不影响启动 */
          }
        }
      };
    };
    if (typeof host?.effect === 'function') host.effect(attach, 'roadbook: update routes');
    else attach();
  };

  const registerRoutes = () => {
    const usable = (value) => value !== null && value !== undefined && typeof value.register === 'function';
    if (typeof ctx?.inject === 'function') {
      let settled = false;
      try {
        ctx.inject(['webServer'], (scope) => {
          settled = true;
          const service = scope?.webServer;
          if (!usable(service)) {
            writeReport({ event: 'route', state: 'unavailable' });
            return;
          }
          try {
            mount(scope, service);
          } catch (error) {
            writeReport({ event: 'route', state: 'error', message: errorText(error) });
          }
        });
      } catch (error) {
        writeReport({ event: 'route', state: 'error', message: errorText(error) });
        return;
      }
      if (!settled) writeReport({ event: 'route', state: 'deferred' });
      return;
    }
    let service;
    try {
      service = typeof ctx?.get === 'function' ? ctx.get('webServer') : undefined;
    } catch (error) {
      writeReport({ event: 'route', state: 'error', message: errorText(error) });
      return;
    }
    if (!usable(service)) {
      writeReport({ event: 'route', state: 'unavailable' });
      return;
    }
    try {
      mount(ctx, service);
    } catch (error) {
      writeReport({ event: 'route', state: 'error', message: errorText(error) });
    }
  };

  // ── 生命周期 ───────────────────────────────────────────────────────────────
  const start = () => {
    writeReport({
      event: 'loaded',
      version: bootVersion,
      mode: settings.mode,
      profile: profileName,
      profileDir,
      reportPath,
    });
    registerRoutes();
    // 定时器交给作用域的 effect 保管：插件卸载时不留下还在跑的 interval（unref 只管进程存活，不管卸载）。
    if (typeof ctx?.effect === 'function') {
      try {
        ctx.effect(() => dispose, 'roadbook: update timers');
      } catch {
        /* 拿不到 effect 就退化成「进程结束即消失」 */
      }
    }
    if (settings.mode === 'off' || schedule !== true) return api;
    const first = setTimeout(() => void runCheck({ force: false }), FIRST_CHECK_DELAY_MS);
    const interval = setInterval(() => void runCheck({ force: false }), Math.max(60000, Math.round(settings.intervalHours * 3600000)));
    // unref：定时器不该让宿主进程活着（Electron 主进程尤其不该被它拖住）。
    if (typeof first.unref === 'function') first.unref();
    if (typeof interval.unref === 'function') interval.unref();
    state.timers = [first, interval];
    return api;
  };

  const dispose = () => {
    for (const timer of state.timers) {
      try {
        clearTimeout(timer);
        clearInterval(timer);
      } catch {
        /* 清不掉也无所谓：进程结束即消失 */
      }
    }
    state.timers = [];
    // 插件被卸载/热替换时把闸放开：留着 applying=true 会让下一次加载后的第一次更新直接 409。
    state.applying = false;
    state.applyingSince = null;
    releaseLock();
  };

  const api = {
    start,
    dispose,
    check: runCheck,
    applyNow: runApply,
    status: statusPayload,
    settings,
    reportPath,
    profileDir,
    get operation() {
      return state.operation;
    },
  };
  return api;
}
