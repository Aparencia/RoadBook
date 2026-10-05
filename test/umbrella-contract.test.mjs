/**
 * 伞包（主插件）结构契约。
 *
 * 这些断言的目的是让「主插件 + 四个可独立开关的子行」这个结构**可被机器验证**：
 *   - 根 package.json 真的是一个组合包（dsh.bundle.patch），且 exports 把四个子行指向的文件都暴露出来；
 *   - 根 cordis.patch.yml 真的**平铺**四条顶层行（不用 group 容器行：容器行自身没有 fiber，
 *     宿主 inventory 又跳过 group 行，面板只能照字面显示「已关闭」），id 与模块名与文档一致；
 *   - 子行模块真的能被 import，且导出面符合 cordis 插件契约；
 *   - 主行声明了「随包文件全在」的自检，且当前磁盘上真的全在。
 *
 * 为什么不用 YAML 解析器：本仓库零运行时依赖，插件也不带 bundle 工具；
 * 结构断言用逐行正则足够锁住「行 id / 模块名 / group 标记 / 技能根的解析方式」这几处关键字段。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');

/** 取 patch 里某个 `- id: <id>` 行之后的整块文本（到下一个同级 `- id:` 为止）。 */
function rowBlock(id) {
  const lines = patch.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s*-\\s*id:\\s*${id}\\s*$`).test(line));
  assert.notEqual(start, -1, `cordis.patch.yml 里没有 - id: ${id} 这一行`);
  const indent = lines[start].match(/^\s*/)[0].length;
  const rest = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const lineIndent = line.match(/^\s*/)[0].length;
    if (line.trim() && lineIndent <= indent && /^\s*-\s*id:/.test(line)) break;
    rest.push(line);
  }
  return rest.join('\n');
}

test('根 package.json 是组合包：声明 dsh.bundle.patch，且客户端半声明为 web', () => {
  assert.equal(manifest.name, 'roadbook');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(existsSync(new URL('../cordis.patch.yml', import.meta.url)));
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(Array.isArray(manifest.dsh.client.inject) && manifest.dsh.client.inject.length > 0);
});

test('四个子行的模块入口都在 exports 里，且文件真的存在', () => {
  const expected = {
    '.': './lib/index.js',
    './autoload': './plugin/roadbook-autoload/index.js',
    './atlas': './plugin/roadbook-atlas/lib/index.js',
    './client': './lib/client.js',
  };
  for (const [subpath, target] of Object.entries(expected)) {
    assert.equal(manifest.exports[subpath], target, `exports["${subpath}"] 应为 ${target}`);
    const relative = target.replace(/^\.\//, '');
    assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), `${relative} 不存在`);
  }
  for (const dir of ['lib', 'skills', 'plugin']) {
    assert.ok(manifest.files.includes(dir), `files 白名单缺 ${dir}/（随包分发会漏文件）`);
  }
});

test('cordis.patch.yml：平铺四个顶层行，id 与模块名都与文档一致，且没有 group 容器行', () => {
  assert.match(patch, /^- insert:/m);
  assert.doesNotMatch(patch, /roadbook-bundle/, '不该再有 group 容器行（面板会把它显示成「已关闭」）');
  assert.doesNotMatch(patch, /^\s+group:\s*true\s*$/m, '平铺后没有任何 group 行');

  const rows = [
    ['roadbook', /^\s+name:\s*roadbook\s*$/m],
    ['roadbook-skills', /^\s+name:\s*'@deepseek-ai\/dsh-skill-filesystem'\s*$/m],
    ['roadbook-autoload', /^\s+name:\s*roadbook\/autoload\s*$/m],
    ['roadbook-atlas', /^\s+name:\s*roadbook\/atlas\s*$/m],
  ];
  for (const [id, namePattern] of rows) {
    const row = rowBlock(id);
    assert.match(patch, new RegExp(`^\\s{4}-\\s*id:\\s*${id}\\s*$`, 'm'), `四条行必须是 - insert: 的直接子项（缩进 4 空格）：缺 ${id}`);
    assert.match(row, namePattern, `子行 ${id} 的模块名不对`);
    assert.doesNotMatch(row, /^\s+group:\s*true\s*$/m, `子行 ${id} 不该是 group`);
  }

  const skills = rowBlock('roadbook-skills');
  assert.match(skills, /bundledSkillDir/, '技能行必须声明 bundledSkillDir');
  assert.match(skills, /createRequire\(baseUrl\)\.resolve\('roadbook\/package\.json'\)/, '技能根必须按伞包 npm 身份解析');
  assert.match(skills, /includeDefaultRoots:\s*false/, '技能行只该暴露包内 skills/，不与默认根重复');

  const bundle = manifest.exports['./bundle'];
  assert.equal(bundle, undefined, 'group 容器已删：exports 不该还留 ./bundle');
  assert.ok(!existsSync(new URL('../lib/bundle.js', import.meta.url)), 'lib/bundle.js 已删');
});

test('子行模块可 import，且导出面符合 cordis 插件契约', async () => {
  const atlas = await import('../plugin/roadbook-atlas/lib/index.js');
  assert.equal(atlas.name, 'roadbook-atlas');
  assert.equal(typeof atlas.apply, 'function');
  assert.equal(atlas.umbrellaRoot(), ROOT, '子插件必须能算出伞包根（技能与客户端半都在那里）');
  assert.equal(atlas.resolveSkillRoot(), join(ROOT, 'skills'), '解析不到 profile 时必须退到文件位置推断的伞包根');

  // autoload 的入口**不再静态 import 宿主包**：否则宿主解析不到 `@deepseek-ai/*` 时整个模块加载失败，
  // loader 只写一条 logger.error，面板上就只剩「未运行」。裸 Node 里它也必须 import 成功（退回兜底实现）。
  const autoload = await import('../plugin/roadbook-autoload/index.js');
  assert.equal(autoload.name, 'roadbook-autoload');
  assert.deepEqual(autoload.inject, ['agents', 'skills']);
  assert.equal(typeof autoload.apply, 'function');
  assert.ok(Array.isArray(autoload.hostFallbacks), '兜底清单必须对外可见（apply() 把它写进日志与观测文件）');
});

test('主行的就绪自检：随包文件当前全在，版本号与 package.json 一致', async () => {
  const main = await import('../lib/index.js');
  assert.equal(main.name, 'roadbook');
  assert.deepEqual(main.missingBundledFiles(), [], '有随包文件缺失（装出来的插件会不可用）');
  assert.equal(main.pluginVersion(), manifest.version);
});

// ── 2026-10-05：就绪自检改为「显式清单 + 入口模块的静态 import 闭包」 ──────────────
// 事故背景：`plugin/roadbook-autoload/package.json` 的 files 白名单漏了 host-fallback.js
// （入口静态 import 它），装出来的插件在面板上显示「未运行」；而当时手写的自检清单恰好也漏了
// 同一个文件 —— 两个本该互相兜底的机制一起失明。下面三条把闭包钉死，防止再漂。

test('就绪自检按静态 import 闭包推导：宿主入口的相对依赖一个都不能漏', async () => {
  const main = await import('../lib/index.js');
  assert.deepEqual(main.HOST_ENTRY_MODULES, ['lib/index.js', 'plugin/roadbook-autoload/index.js', 'plugin/roadbook-atlas/lib/index.js']);

  const closure = main.relativeImportClosure(ROOT, 'plugin/roadbook-autoload/index.js');
  assert.ok(closure.includes('plugin/roadbook-autoload/index.js'), '闭包含入口自身');
  // 这两个就是出过事的文件：多行 import 也必须被认出来
  assert.ok(closure.includes('plugin/roadbook-autoload/host-fallback.js'), '必须认出多行 import 的 host-fallback.js');
  assert.ok(closure.includes('plugin/roadbook-autoload/trigger.js'), '必须认出多行 import 的 trigger.js');

  for (const entry of main.HOST_ENTRY_MODULES) {
    const list = main.relativeImportClosure(ROOT, entry);
    assert.ok(list.includes(entry), `${entry} 的闭包含自身`);
    for (const relative of list) {
      assert.ok(existsSync(join(ROOT, relative)), `闭包里的 ${relative} 在磁盘上不存在（自检会误报）`);
    }
  }
});

test('注释里的 import 例子不算依赖 —— 假红比不检查更坏', async () => {
  const main = await import('../lib/index.js');
  assert.equal(main.stripComments("import a from './x.js' // 例子\n"), "import a from './x.js' \n");
  assert.equal(main.stripComments("/* import b from './y.js' */\nreal()"), '\nreal()');
  // lib/index.js 自己的注释里就写着 `import x from './a.js'` 这种例子：那些例子不许进闭包。
  // 2026-10-05 起它**真的有一个**相对依赖：./update.js（自动更新的纯逻辑层）。
  // 所以这条断言的形状从「只有自己」改成「自己 + 那一个真依赖」—— 注释里的 `./a.js` 仍然不在闭包里，
  // 这正是它要防的假红（自检报一个并不存在的文件）。
  assert.deepEqual(main.relativeImportClosure(ROOT, 'lib/index.js'), ['lib/index.js', 'lib/update.js']);
});

// ── 2026-10-05：stripComments 从「两条正则」换成单趟状态机 ──────────────────────
// 老实现先跑块注释正则、又不认识字符串与行注释：一个写在字符串 / 行注释里的块注释开头会把
// 后面直到块注释结尾的真代码整段吞掉。方向是**假绿** —— 自检悄悄不再检查一个真的必需文件，
// 正是这套自检要防的那一类错误。下面两条各钉一个方向：漏报真依赖（假绿）与幽灵依赖（假红）。

test('假绿复现：字符串 / 行注释 / 模板里的注释符不再吞掉真 import', async () => {
  const main = await import('../lib/index.js');
  const box = mkdtempSync(join(tmpdir(), 'roadbook-strip-'));
  try {
    const cases = [
      // [说明, 入口内容, 必须进闭包的真依赖]
      ['字符串里的块注释开头', 'const s = "/* not a comment"; import a from \'./real.js\'; /* block */\n', 'real.js'],
      ['行注释里的块注释开头', '// note: /* example\nimport b from \'./real2.js\';\n/* another */\n', 'real2.js'],
      ['模板里的行注释', 'const p = `${a} // x`; import z from \'./real3.js\';\n', 'real3.js'],
      ['与上一条语句同行的 import', 'const r = /a\\/b/; import t from \'./real7.js\';\n', 'real7.js'],
    ];
    for (const [label, source, real] of cases) {
      writeFileSync(join(box, 'entry.js'), source);
      writeFileSync(join(box, real), 'export default 1;\n');
      const closure = main.relativeImportClosure(box, 'entry.js');
      assert.ok(closure.includes(real), `${label}：真依赖 ${real} 没进闭包（自检对它失明 = 假绿）—— 闭包=${closure.join(', ')}`);
    }
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});

test('假红复现：写在注释 / 字符串 / 模板里的 import 变不成幽灵依赖', async () => {
  const main = await import('../lib/index.js');
  const box = mkdtempSync(join(tmpdir(), 'roadbook-phantom-'));
  try {
    writeFileSync(join(box, 'entry.js'), [
      "// import n1 from './ghost1.js'",
      "/* import n2 from './ghost2.js' */",
      'const doc = `',
      "import n3 from './ghost3.js';",
      '`;',
      'const text = "import n4 from \'./ghost4.js\'";',
      "const tpl = `import n5 from './ghost5.js'`;",
      "import ok from './real.js';",
      '',
    ].join('\n'));
    writeFileSync(join(box, 'real.js'), 'export default 1;\n');
    const closure = main.relativeImportClosure(box, 'entry.js');
    // 幽灵文件都不在磁盘上：一旦被扫出来就会被 missingBundledFiles 报成「缺」（假红比不检查更坏）
    assert.deepEqual(closure, ['entry.js', 'real.js'], `注释 / 字符串 / 模板里的 import 变成了幽灵依赖：${closure.join(', ')}`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});

test('技能行的 bundledSkillDir YAML 表达式与 resolveSkillRoot() 同口径（用同一个模拟安装验两条路）', async () => {
  const atlas = await import('../plugin/roadbook-atlas/lib/index.js');
  const expression = /bundledSkillDir:\s*!!js\s+(.+)$/m.exec(rowBlock('roadbook-skills'));
  assert.ok(expression, '技能行必须有 bundledSkillDir 的 !!js 表达式');

  // 造一个「可解析到 roadbook 包」的模拟安装：两处实现喂同一个 baseUrl，必须给出同一个技能根
  const box = mkdtempSync(join(tmpdir(), 'roadbook-skillroot-'));
  try {
    const packageDir = join(box, 'node_modules', 'roadbook');
    mkdirSync(join(packageDir, 'skills'), { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'roadbook', version: '0.0.0', type: 'module' }));
    const baseUrl = pathToFileURL(join(box, 'package.json')).href;
    const fromYaml = new Function('baseUrl', 'process', `return (${expression[1]});`)(baseUrl, process);
    assert.equal(atlas.resolveSkillRoot(baseUrl), join(packageDir, 'skills'), '子插件解析出的技能根');
    assert.equal(fromYaml, join(packageDir, 'skills'), 'YAML 表达式解析出的技能根');
    assert.equal(fromYaml, atlas.resolveSkillRoot(baseUrl), '两处实现必须给出同一个技能根');
  } finally {
    rmSync(box, { recursive: true, force: true });
  }

  // 解析不到（link: 安装的常态）时退回文件位置推断 —— 两条路都要成立
  assert.equal(atlas.resolveSkillRoot(pathToFileURL(join(tmpdir(), 'nope', 'package.json')).href), join(ROOT, 'skills'));
});
