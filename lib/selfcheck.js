/**
 * lib/selfcheck.js —— 入口就绪自检：显式清单 + 宿主入口模块的静态相对 import 闭包。
 *
 * 2026-10-07：从 `lib/index.js`（当时 1171 行）整块搬出来（D14 第 1 条 单文件 ≤500 行），
 * 纯逻辑与入口接线分文件。对外契约不变：`lib/index.js` 仍按原名再导出 `stripComments` /
 * `relativeImportClosure` / `missingBundledFiles`，调用方（测试、就绪日志）无需改。
 *
 * 随包清单（`RUNTIME_FILES` / `HOST_ENTRY_MODULES`）是**入口**的事实，由调用方显式传入 ——
 * 本模块反向 import `./index.js` 会成环（D14：依赖显式传入，禁止函数深处直连隐式全局）。
 *
 * 事故背景：`plugin/roadbook-autoload/package.json` 的 files 白名单漏了 `host-fallback.js`
 * （入口静态 import 它），装出来的插件在面板上显示「未运行」—— 而当时的手写清单恰好也漏了
 * 同一个文件，两个本该互相兜底的机制一起失明。闭包推导就是为了不再依赖手写清单。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
 * @param {string} root 伞包根（磁盘绝对路径）
 * @param {Iterable<string>} runtimeFiles 显式随运行时内容（入口的 import 闭包会自动补齐）
 * @param {Iterable<string>} entryModules 宿主入口模块（相对伞包根、正斜杠）
 */
export function missingBundledFiles(root, runtimeFiles, entryModules) {
  const required = new Set(runtimeFiles);
  for (const entry of entryModules) {
    for (const relative of relativeImportClosure(root, entry)) required.add(relative);
  }
  return [...required].filter((relative) => !existsSync(join(root, relative)));
}
