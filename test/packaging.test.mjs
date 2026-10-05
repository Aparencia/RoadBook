/**
 * 打包契约：**运行时真正读的路径 ⊆ 发布白名单（`files`）**。
 *
 * 两个已实测的打包缺陷是本文件的直接动因：
 *   ① 根 `files` 漏了 `playbook/`、`playbook_EN/`、`template/` —— 装出来的插件是空壳：
 *      随包的 `skills/roadbook/SKILL.md` 第一件事就是让 agent 去读 `playbook_EN/0-1-driver-card.md`；
 *   ② `plugin/roadbook-autoload/package.json` 的 `files` 漏了 `host-fallback.js`，而 `index.js`
 *      **静态 import** 它 —— 解包后 `import('./index.js')` 报 ERR_MODULE_NOT_FOUND，
 *      在插件面板上的表现就是那句「未运行」（0.2.1 修过一次的症状复发）。
 *
 * 为什么不用真跑 npm：本仓库零运行时依赖，测试要能在无网络、无 npm 的机器上跑。
 * npm `files` 的语义只有两条 ——「目录名/前缀 = 整棵子树」「文件名 = 该文件」，
 * 外加 npm 永远打进包的那几个名字（package.json / README / LICENSE / CHANGELOG）。
 * 这里按这两条实现匹配器；通配符按简单 glob 处理（`*` 不跨 `/`，`**` 跨），本仓库目前一个都没用。
 *
 * 附带堵一个假绿：npm 在没有 `.npmignore` 时拿 `.gitignore` 当忽略源（本仓库就是这样），
 * 所以「白名单覆盖了」还不够 —— 最后一条断言顺带盯住 `.gitignore` 别把必需目录整个吞掉。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const AUTOLOAD_DIR = join(ROOT, 'plugin', 'roadbook-autoload');
const autoloadManifest = JSON.parse(readFileSync(join(AUTOLOAD_DIR, 'package.json'), 'utf8'));

/** 包内 posix 相对路径 → 磁盘路径（测试里的相对路径一律写 posix，跨平台都能 join）。 */
function onDisk(posixPath, base = ROOT) {
  return join(base, ...posixPath.split('/'));
}

// —— npm `files` 匹配语义的最小实现（不跑 npm） ——

/** npm 无论如何都会打进包的名字（与 files 白名单无关）。 */
const ALWAYS_BUNDLED = [
  /^package\.json$/,
  /^readme(\.[^/]*)?$/i,
  /^licen[cs]e(\.[^/]*)?$/i,
  /^changelog(\.[^/]*)?$/i,
];

/** `files` 里的一项归一化成 posix 相对路径：去掉开头的 `./` 与结尾的 `/`。 */
function normalizePattern(pattern) {
  return String(pattern).trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

/** 简单 glob → 正则：`*` 不跨 `/`，`**` 跨。 */
function globToRegExp(pattern) {
  const source = pattern
    .split(/(\*\*|\*)/)
    .map((part) => {
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** 单个 pattern 是否覆盖某个包内 posix 路径。 */
function patternCovers(pattern, posixPath) {
  if (pattern.includes('*')) {
    const rule = globToRegExp(pattern);
    if (rule.test(posixPath)) return true;
    // glob 命中目录时，npm 会把整棵子树带上
    const segments = posixPath.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      if (rule.test(segments.slice(0, depth).join('/'))) return true;
    }
    return false;
  }
  return posixPath === pattern || posixPath.startsWith(`${pattern}/`);
}

/** 某个包内文件会不会被 npm 打进 tarball。 */
function isBundled(posixPath, files) {
  // npm 只对**包根**的这几个名字无条件包含，子目录里的同名文件不享受这个待遇。
  // 原来按 basename 任意深度匹配：`template/README.md` 会被判成「反正 npm 会带上」，
  // 一旦有人把它加进运行时清单、又把 template 从 files 里拿掉，这里就会替真缺陷放行。
  if (!posixPath.includes('/') && ALWAYS_BUNDLED.some((rule) => rule.test(posixPath))) return true;
  return files.map(normalizePattern).some((pattern) => patternCovers(pattern, posixPath));
}

/** 白名单里没有通配、也不是「npm 永远包含」的条目，必须在磁盘上真实存在（防白名单挂在幽灵路径上）。 */
function ghostEntries(files, base) {
  return files
    .map(normalizePattern)
    .filter((pattern) => !pattern.includes('*'))
    .filter((pattern) => pattern.includes('/') || !ALWAYS_BUNDLED.some((rule) => rule.test(pattern)))
    .filter((pattern) => !existsSync(onDisk(pattern, base)));
}

// —— 运行时真正要读的随包路径（改 lib/ 或插件的运行时引用，必须同步这张表） ——

const REQUIRED_RUNTIME_PATHS = [
  // 流程正文：skills/roadbook/SKILL.md 第一件事就是让 agent 去读它
  'playbook/0-1-驱动卡.md',
  'playbook_EN/0-1-driver-card.md',
  // 项目模板（1-2 / 1-3 卡整套复制它生成项目骨架）
  'template/check.ps1',
  // 硬规则索引：CLI 与插件机制读它；漏进包 = 装出来的机制没有规则源
  'rules/rules.json',
  // 技能与 CLI
  'skills/roadbook/SKILL.md',
  'skills/roadbook-atlas/SKILL.md',
  'skills/roadbook-atlas/bin/atlas.mjs',
  'skills/roadbook-atlas/vendor/archify/bin/archify.mjs',
  // 子行插件：cordis.patch.yml 按模块名挂载的入口与它们的静态依赖
  'plugin/roadbook-autoload/index.js',
  'plugin/roadbook-autoload/trigger.js',
  'plugin/roadbook-autoload/host-fallback.js',
  'plugin/roadbook-atlas/lib/index.js',
  // Team 策略行：只在官方 Agent Teams 已挂载时存在（装配层 disabled 门控）
  'plugin/roadbook-team/index.js',
  // 自进化行：入口静态 import ./signals.js 与伞包 lib/update.js
  'plugin/roadbook-evolve/index.js',
  'plugin/roadbook-evolve/signals.js',
  // 宿主半与客户端半
  'lib/index.js',
  'lib/update.js',
  'lib/client.js',
  'cordis.patch.yml',
];

test('根 package.json 的 files 白名单覆盖每一个运行时路径（漏一个 = 装出来的插件缺件）', async () => {
  const main = await import('../lib/index.js');
  assert.deepEqual(
    main.missingBundledFiles(),
    [],
    'lib/index.js 的随包自检报告有文件缺失（装出来的插件相关能力会不可用）',
  );

  const missingOnDisk = REQUIRED_RUNTIME_PATHS.filter((relative) => !existsSync(onDisk(relative)));
  assert.deepEqual(missingOnDisk, [], `下列运行时路径在磁盘上就不存在：${missingOnDisk.join(', ')}`);

  const notBundled = REQUIRED_RUNTIME_PATHS.filter((relative) => !isBundled(relative, rootManifest.files));
  assert.deepEqual(
    notBundled,
    [],
    `下列运行时路径没被根 package.json 的 files 白名单覆盖（npm 装出来的副本里没有它们，插件成了空壳）：${notBundled.join(', ')}`,
  );
});

test('npm 只对包根无条件包含 README/LICENSE/CHANGELOG —— 子目录里的同名文件不算', () => {
    // 这条钉住的是匹配器本身的口径：按 basename 任意深度匹配会让 template/README.md 这类
    // 真实存在的文件被判成「反正 npm 会带上」，从而替真缺陷（files 漏 template）放行。
    assert.equal(isBundled('package.json', ['lib']), true, 'package.json 永远在包里');
    assert.equal(isBundled('README.md', ['lib']), true, '包根的 README 永远在包里');
    assert.equal(isBundled('template/README.md', ['lib']), false, '子目录的 README 不享受无条件包含');
    assert.equal(isBundled('template/check.ps1', ['lib']), false, '没进白名单就是没进');
    assert.equal(isBundled('template/check.ps1', ['template']), true, '目录条目带整棵子树');
    assert.deepEqual(ghostEntries(['README.md'], ROOT), [], '包根的 README 不该被当成幽灵条目（它真在磁盘上）');
});

test('根 files 白名单含 playbook/ playbook_EN/ template/，且没有幽灵条目', () => {
  for (const dir of ['playbook', 'playbook_EN', 'template']) {
    assert.ok(
      rootManifest.files.includes(dir),
      `根 package.json 的 files 白名单缺 ${dir}/（随包分发漏了它 = 装出来的插件没有流程卡）`,
    );
  }
  assert.deepEqual(ghostEntries(rootManifest.files, ROOT), [], '根 files 里有指向不存在路径的条目（写错目录名 = 白名单以为打进去了）');
});

// —— plugin/roadbook-autoload：静态相对 import 闭包 ⊆ files（0.2.1 那个「面板显示未运行」的回归守卫） ——

/** 静态相对 import 的说明符：`from './x.js'`（含跨行）与副作用 `import './x.js'`；动态 import(变量) 不算。 */
function relativeSpecifiers(source) {
  const found = new Set();
  const rules = [/\bfrom\s+['"](\.[^'"]+)['"]/g, /(?:^|[\r\n;])\s*import\s+['"](\.[^'"]+)['"]/g];
  for (const rule of rules) {
    for (const match of source.matchAll(rule)) found.add(match[1]);
  }
  return [...found];
}

/** posix 相对路径拼接（纯字符串，不碰磁盘）。 */
function posixResolve(fromPath, specifier) {
  const stack = fromPath.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return stack.join('/');
}

/** 从入口出发做静态相对 import 闭包，返回闭包文件表与断掉的边。 */
function staticImportClosure(entry) {
  const files = [];
  const broken = [];
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift();
    if (files.includes(current)) continue;
    files.push(current);
    const source = readFileSync(onDisk(current, AUTOLOAD_DIR), 'utf8');
    for (const specifier of relativeSpecifiers(source)) {
      const target = posixResolve(current, specifier);
      if (existsSync(onDisk(target, AUTOLOAD_DIR))) queue.push(target);
      else broken.push(`${current} → ${specifier}`);
    }
  }
  return { files, broken };
}

test('plugin/roadbook-autoload 的 files 覆盖 index.js 的静态 import 闭包（漏包 = 面板显示未运行）', () => {
  const { files, broken } = staticImportClosure('index.js');
  assert.deepEqual(broken, [], `index.js 的静态相对 import 指向不存在的文件：${broken.join('; ')}`);
  assert.ok(files.includes('trigger.js'), `静态 import 闭包里应当有 trigger.js（实际：${files.join(', ')}）`);
  assert.ok(files.includes('host-fallback.js'), `静态 import 闭包里应当有 host-fallback.js（实际：${files.join(', ')}）`);

  const notBundled = files.filter((relative) => !isBundled(relative, autoloadManifest.files));
  assert.deepEqual(
    notBundled,
    [],
    `下列文件在 index.js 的静态 import 闭包里，却没进 plugin/roadbook-autoload/package.json 的 files（解包后 import 直接 ERR_MODULE_NOT_FOUND → 插件面板显示未运行）：${notBundled.join(', ')}`,
  );
  assert.deepEqual(
    ghostEntries(autoloadManifest.files, AUTOLOAD_DIR),
    [],
    '插件 files 里有指向不存在路径的条目（写错文件名 = 白名单以为打进去了）',
  );
});

// —— skills/roadbook/SKILL.md 的路由引用不能在包里指向空气 ——

/** 取正文里以某个顶层目录开头的相对路径引用（去重，保留路径原文）。 */
function referencesOf(source, root) {
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 前一个字符不能是词字符（防 `playbook` 命中 `playbook_EN` 内部），路径尾部到空白/标点为止
  const pattern = new RegExp(
    "(?:^|[^\\w/.-])(" + escaped + ")(?![\\w-])((?:/[^\\s`\"'<>()（）【】\\[\\]、，。：；|]+)?)",
    'gmu',
  );
  const hits = new Set();
  for (const match of source.matchAll(pattern)) hits.add(`${match[1]}${match[2] ?? ''}`);
  return [...hits];
}

test('skills/roadbook/SKILL.md 引用的 playbook/ playbook_EN/ template/ 不能被漏出包', () => {
  const skill = readFileSync(onDisk('skills/roadbook/SKILL.md'), 'utf8');
  for (const dir of ['playbook', 'playbook_EN', 'template']) {
    const refs = referencesOf(skill, dir);
    assert.ok(
      refs.length > 0,
      `skills/roadbook/SKILL.md 里找不到 ${dir}/ 开头的引用（路由不再指向它，或本测试的扫描正则失灵）`,
    );
    assert.ok(
      existsSync(onDisk(dir)) && statSync(onDisk(dir)).isDirectory(),
      `SKILL.md 的 ${refs[0]} 指向顶层目录 ${dir}/，但仓库里没有这个目录`,
    );
    assert.ok(
      isBundled(`${dir}/.probe`, rootManifest.files),
      `SKILL.md 的 ${refs.join('、')} 指向 ${dir}/，但根 files 白名单没覆盖这个目录（装出来的插件里这些引用全是死链）`,
    );
  }
  // _qc/ 是已知取舍：母版校验器不进 npm 包（装出来的是给项目用的那部分），所以只断「不是幽灵引用」，
  // 不断它在不在白名单 —— 白名单的口径由上面的 coverage 断言负责，不在这里偷偷放水。
  const qcRefs = referencesOf(skill, '_qc');
  if (qcRefs.length > 0) {
    assert.ok(existsSync(onDisk('_qc')), `SKILL.md 引用了 ${qcRefs[0]}，仓库里却没有 _qc/ 目录（幽灵引用）`);
  }
});

test('根 .gitignore 不会把必需目录整个吞掉（npm 在没有 .npmignore 时拿 .gitignore 当忽略源）', () => {
  const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));

  const requiredRoots = ['lib', 'skills', 'plugin', 'playbook', 'playbook_EN', 'template'];
  const swallowed = [];
  for (const line of lines) {
    if (/[*?[\]]/.test(line)) continue; // 通配形态交给 npm 语义，这里只挡字面量
    const normalized = line.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) continue;
    for (const dir of requiredRoots) {
      if (normalized === dir || dir.startsWith(`${normalized}/`)) swallowed.push(`${line} → ${dir}/`);
    }
  }
  assert.deepEqual(
    swallowed,
    [],
    `根 .gitignore 把必需目录整个忽略了（npm 会跟着 .gitignore 把它们排除出包）：${swallowed.join('; ')}`,
  );
});
