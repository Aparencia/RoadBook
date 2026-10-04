/**
 * 伞包（主插件）结构契约。
 *
 * 这些断言的目的是让「主插件 + 四个可独立开关的子行」这个结构**可被机器验证**：
 *   - 根 package.json 真的是一个组合包（dsh.bundle.patch），且 exports 把四个子行指向的文件都暴露出来；
 *   - 根 cordis.patch.yml 真的插了一条 group 行 + 四个子行，id 与模块名与文档一致；
 *   - 子行模块真的能被 import，且导出面符合 cordis 插件契约；
 *   - 主行声明了「随包文件全在」的自检，且当前磁盘上真的全在。
 *
 * 为什么不用 YAML 解析器：本仓库零运行时依赖，插件也不带 bundle 工具；
 * 结构断言用逐行正则足够锁住「行 id / 模块名 / group 标记 / 技能根的解析方式」这几处关键字段。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    './bundle': './lib/bundle.js',
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

test('cordis.patch.yml：一条 group 行挂四个子行，id 与模块名都与文档一致', () => {
  assert.match(patch, /^- insert:/m);
  const group = rowBlock('roadbook-bundle');
  assert.match(group, /^\s+name:\s*roadbook\/bundle\s*$/m);
  assert.match(group, /^\s+group:\s*true\s*$/m);
  assert.match(group, /entry\.options\.id === 'roadbook'/, 'group 的开关必须读主行自身的 disabled');

  const rows = [
    ['roadbook', /^\s+name:\s*roadbook\s*$/m],
    ['roadbook-skills', /^\s+name:\s*'@deepseek-ai\/dsh-skill-filesystem'\s*$/m],
    ['roadbook-autoload', /^\s+name:\s*roadbook\/autoload\s*$/m],
    ['roadbook-atlas', /^\s+name:\s*roadbook\/atlas\s*$/m],
  ];
  for (const [id, namePattern] of rows) {
    assert.match(group, new RegExp(`^\\s*-\\s*id:\\s*${id}\\s*$`, 'm'), `group 里缺子行 ${id}`);
    assert.match(group, namePattern, `子行 ${id} 的模块名不对`);
  }
  assert.match(group, /bundledSkillDir/, '技能行必须声明 bundledSkillDir');
  assert.match(group, /createRequire\(baseUrl\)\.resolve\('roadbook\/package\.json'\)/, '技能根必须按伞包 npm 身份解析');
  assert.match(group, /includeDefaultRoots:\s*false/, '技能行只该暴露包内 skills/，不与默认根重复');
});

test('子行模块可 import，且导出面符合 cordis 插件契约', async () => {
  const bundle = await import('../lib/bundle.js');
  assert.equal(bundle.default[Symbol.for('cordis.group')], true, '组合容器必须标 cordis.group');
  assert.deepEqual(bundle.default.inject, ['loader']);

  const atlas = await import('../plugin/roadbook-atlas/lib/index.js');
  assert.equal(atlas.name, 'roadbook-atlas');
  assert.equal(typeof atlas.apply, 'function');
  assert.equal(atlas.umbrellaRoot(), ROOT, '子插件必须能算出伞包根（技能与客户端半都在那里）');
  assert.equal(atlas.resolveSkillRoot(), join(ROOT, 'skills'), '解析不到 profile 时必须退到文件位置推断的伞包根');

  // autoload 的入口 import 了只在 DSH 运行时注入的包（@deepseek-ai/dsh-llm 等），
  // 在裸 Node 里 import 必失败 —— 这里只静态锁导出面，行为由它自己的 test/*.test.mjs 覆盖。
  const autoloadSource = readFileSync(new URL('../plugin/roadbook-autoload/index.js', import.meta.url), 'utf8');
  assert.match(autoloadSource, /^export const inject = \[/m, '自动加载子插件要声明 inject');
  assert.match(autoloadSource, /^export function apply\(/m, '自动加载子插件要导出 apply');
});

test('主行的就绪自检：随包文件当前全在，版本号与 package.json 一致', async () => {
  const main = await import('../lib/index.js');
  assert.equal(main.name, 'roadbook');
  assert.deepEqual(main.missingBundledFiles(), [], '有随包文件缺失（装出来的插件会不可用）');
  assert.equal(main.pluginVersion(), manifest.version);
});
