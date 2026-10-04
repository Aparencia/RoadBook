#!/usr/bin/env node
/**
 * roadbook-atlas CLI —— Roadbook 约定的图纸工作台（薄包装，渲染器是随包 vendored 的 archify）。
 *
 * 为什么要有这一层：
 *   - 渲染器（vendor/archify）是上游代码，升级时整目录替换；Roadbook 的目录约定、回执格式、
 *     退出码纪律在这里，改这里不会和上游升级打架。
 *   - `deliver --json` 只说「渲染成功」，不落回执文件；这里补一份 <slug>.receipt.json，
 *     侧边栏「图册」标签页靠它显示类型/大小/生成时间。
 *
 * 退出码（铁律：非 0 永远不许描述成成功）：
 *   0 = 成功；1 = 渲染或校验失败 / 环境缺件；2 = 用法错误。
 *
 * 用法：
 *   atlas render   <spec.atlas.json> [--quality showcase|standard] [--dir docs/diagrams] [--root <项目根>] [--json] [--open]
 *   atlas validate <spec.atlas.json> [--quality showcase|standard] [--root <项目根>] [--json]
 *   atlas list     [--dir docs/diagrams] [--root <项目根>] [--json]
 *   atlas new      <type> <slug> [--title <标题>] [--dir docs/diagrams] [--root <项目根>]
 *   atlas guide    [场景或问题] [--json]
 *   atlas doctor   [--json]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDOR_DIR = join(SKILL_DIR, 'vendor', 'archify');
const ARCHIFY_CLI = join(VENDOR_DIR, 'bin', 'archify.mjs');
const EXAMPLES_DIR = join(VENDOR_DIR, 'examples');
const DEFAULT_DIR = 'docs/diagrams';
const TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];
const SPEC_SUFFIX = '.atlas.json';
const RECEIPT_SUFFIX = '.receipt.json';
const SCHEMA = 'roadbook-atlas/receipt@1';

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}
function usage() {
  return [
    'Usage:',
    '  atlas render   <spec.atlas.json> [--quality showcase|standard] [--dir docs/diagrams] [--root <项目根>] [--json] [--open]',
    '  atlas validate <spec.atlas.json> [--quality showcase|standard] [--root <项目根>] [--json]',
    '  atlas list     [--dir docs/diagrams] [--root <项目根>] [--json]',
    '  atlas new      <type> <slug> [--title <标题>] [--dir docs/diagrams] [--root <项目根>]',
    '  atlas guide    [场景或问题] [--json]',
    '  atlas doctor   [--json]',
    '',
    `Types: ${TYPES.join(', ')}`,
  ].join('\n');
}

/** 解析 argv：位置参数 + `--flag value` / `--flag=value` / 布尔开关。 */
function parseArgs(argv) {
  const flags = new Set(['json', 'open']);
  const values = new Set(['quality', 'dir', 'root', 'type', 'title', 'lang']);
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf('=');
    const name = equals >= 0 ? body.slice(0, equals) : body;
    if (flags.has(name)) {
      if (equals >= 0) fail(`--${name} 不接受取值`, 2);
      options[name] = true;
      continue;
    }
    if (!values.has(name)) fail(`未知参数 --${name}\n\n${usage()}`, 2);
    let value;
    if (equals >= 0) value = body.slice(equals + 1);
    else {
      value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) fail(`--${name} 需要一个取值`, 2);
      index += 1;
    }
    options[name] = value;
  }
  return { positional, options };
}

/**
 * 项目根 = 图纸目录的锚点。
 *
 * 默认信任 `git rev-parse --show-toplevel`，但**拒绝两个陷阱根**：家目录本身与系统临时目录。
 * 理由是本机实测：`%TEMP%` 里真的存在一个 `.git`（临时实验留下的），于是任何临时子目录里
 * `git rev-parse` 都会返回 `%TEMP%`，图纸被静默写到项目外。判定不成立时退回当前工作目录 ——
 * 「可预测」优先于「聪明」。
 */
function projectRoot(options) {
  if (options.root) return resolve(options.root);
  const cwd = process.cwd();
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  const detected = probe.status === 0 ? probe.stdout.trim() : '';
  if (detected && isUsableRoot(detected, cwd)) return resolve(detected);
  return cwd;
}
function isUsableRoot(candidate, cwd) {
  const root = resolve(candidate);
  if (root === resolve(homedir())) return false;
  const temp = resolve(tmpdir());
  if (root === temp || root.startsWith(temp + sep)) return false;
  const inside = relative(root, cwd);
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
}
function absoluteFrom(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}
function ensureVendor() {
  if (!existsSync(ARCHIFY_CLI)) {
    fail(`找不到 vendored 渲染器：${ARCHIFY_CLI}\n插件安装不完整，请重新检出一份完整的 plugin/roadbook-atlas（skills/roadbook-atlas/vendor/archify/ 必须在位）。`);
  }
}
function vendorVersion() {
  try {
    const manifest = JSON.parse(readFileSync(join(VENDOR_DIR, 'package.json'), 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch (error) {
    return 'unknown';
  }
}
function sha256(file) {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (error) {
    return '';
  }
}
function bytes(file) {
  try {
    return statSync(file).size;
  } catch (error) {
    return 0;
  }
}
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`读不出 JSON：${file}\n${error.message}`);
  }
}
function slugOf(specPath) {
  const name = basename(specPath);
  if (name.endsWith(SPEC_SUFFIX)) return name.slice(0, -SPEC_SUFFIX.length);
  return name.replace(/\.json$/i, '');
}
function diagramTypeOf(spec, options) {
  if (options.type) return options.type;
  if (typeof spec.diagram_type === 'string' && spec.diagram_type !== '') return spec.diagram_type;
  if (spec.meta && typeof spec.meta.diagram_type === 'string' && spec.meta.diagram_type !== '') return spec.meta.diagram_type;
  fail(`规格里没有 diagram_type，无法判断图类型：请补上 "diagram_type": "<type>" 或显式传 --type（可用：${TYPES.join(', ')}）`, 2);
}
function assertType(type) {
  if (!TYPES.includes(type)) fail(`未知图类型 "${type}"，可用：${TYPES.join(', ')}`, 2);
}

/** 跑 vendored CLI，拿它的 --json 回执；非 0 退出原样透传，绝不吞。 */
function runArchify(args, cwd) {
  ensureVendor();
  const result = spawnSync(process.execPath, [ARCHIFY_CLI, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status === null ? 1 : result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function parseJsonOutput(text) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const start = trimmed.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch (error) {
    return null;
  }
}

function commandRender(argv) {
  const { positional, options } = parseArgs(argv);
  const specArg = positional[0];
  if (!specArg) fail(usage(), 2);
  const root = projectRoot(options);
  const specPath = absoluteFrom(root, specArg);
  if (!existsSync(specPath)) fail(`规格文件不存在：${specPath}`, 1);
  const spec = readJson(specPath);
  const type = diagramTypeOf(spec, options);
  assertType(type);
  const quality = options.quality || 'showcase';
  const slug = slugOf(specPath);
  const dir = dirname(specPath);
  const outputPath = join(dir, `${slug}.html`);
  const receiptPath = join(dir, `${slug}${RECEIPT_SUFFIX}`);
  const args = ['deliver', type, specPath, outputPath, '--quality', quality, '--repo-root', root, '--json'];
  if (options.open) args.push('--open');
  const run = runArchify(args, root);
  const rendererReceipt = parseJsonOutput(run.stdout);
  if (run.status !== 0 || !rendererReceipt || rendererReceipt.ok !== true) {
    if (run.stderr.trim() !== '') console.error(run.stderr.trim());
    if (run.stdout.trim() !== '' && !rendererReceipt) console.error(run.stdout.trim());
    if (rendererReceipt && rendererReceipt.validation) {
      console.error(`校验未通过：errors=${rendererReceipt.validation.errors} warnings=${rendererReceipt.validation.warnings} status=${rendererReceipt.validation.compositionStatus}`);
    }
    console.error(`渲染失败（退出码 ${run.status}）：${specPath}`);
    console.error('没有写入回执 —— 图纸与回执都不可信，先修规格再重跑。');
    process.exit(1);
  }
  const receipt = {
    schema: SCHEMA,
    ok: true,
    slug,
    type,
    quality,
    title: (spec.meta && typeof spec.meta.title === 'string' ? spec.meta.title : '') || slug,
    spec: { path: relativePath(root, specPath), sha256: rendererReceipt.specification ? rendererReceipt.specification.sha256 : sha256(specPath), bytes: rendererReceipt.specification ? rendererReceipt.specification.bytes : bytes(specPath) },
    artifact: { path: relativePath(root, outputPath), sha256: rendererReceipt.artifact ? rendererReceipt.artifact.sha256 : sha256(outputPath), bytes: rendererReceipt.artifact ? rendererReceipt.artifact.bytes : bytes(outputPath) },
    validation: rendererReceipt.validation || null,
    renderer: {
      name: 'archify',
      kind: 'vendored',
      vendorDir: 'skills/roadbook-atlas/vendor/archify',
      upstream: 'https://github.com/tt-a1i/archify',
      version: vendorVersion(),
    },
    command: `node <skill>/bin/atlas.mjs render ${relativePath(root, specPath)} --quality ${quality}`,
    renderedAt: new Date().toISOString(),
    rendererReceipt,
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  const validation = receipt.validation || {};
  console.log('[roadbook-atlas] 渲染成功（退出码 0）');
  console.log(`  图纸   ${receipt.artifact.path}  ${receipt.artifact.bytes} B  sha256 ${short(receipt.artifact.sha256)}`);
  console.log(`  规格   ${receipt.spec.path}  ${receipt.spec.bytes} B  sha256 ${short(receipt.spec.sha256)}`);
  console.log(`  回执   ${relativePath(root, receiptPath)}`);
  console.log(`  校验   ${validation.checksPassed ?? '?'}/${validation.checkCount ?? '?'} 通过 · profile ${validation.compositionProfile ?? quality} · ${validation.errors ?? '?'} 个 error · ${validation.warnings ?? '?'} 个 warning`);
  console.log(`  图类型 ${type} · 渲染器 archify ${receipt.renderer.version}（vendored）`);
  console.log('  下一步 在侧边栏「图册」里预览/导出；需要写进文档时对 agent 说清楚挂到哪一份。');
}
function relativePath(root, target) {
  const rel = resolve(target).slice(resolve(root).length).replace(/^[\\/]+/, '');
  return rel === '' ? '.' : rel;
}
function short(hash) {
  return typeof hash === 'string' && hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : String(hash || '');
}

function commandValidate(argv) {
  const { positional, options } = parseArgs(argv);
  const specArg = positional[0];
  if (!specArg) fail(usage(), 2);
  const root = projectRoot(options);
  const specPath = absoluteFrom(root, specArg);
  if (!existsSync(specPath)) fail(`规格文件不存在：${specPath}`, 1);
  const spec = readJson(specPath);
  const type = diagramTypeOf(spec, options);
  assertType(type);
  const quality = options.quality || 'showcase';
  const run = runArchify(['validate', type, specPath, '--quality', quality, '--repo-root', root, '--json'], root);
  const parsed = parseJsonOutput(run.stdout);
  if (options.json) console.log(JSON.stringify(parsed || { ok: run.status === 0, raw: run.stdout }, null, 2));
  else if (parsed) console.log(JSON.stringify(parsed, null, 2));
  else if (run.stdout.trim() !== '') console.log(run.stdout.trim());
  if (run.stderr.trim() !== '') console.error(run.stderr.trim());
  process.exit(run.status === 0 ? 0 : 1);
}

function commandList(argv) {
  const { options } = parseArgs(argv);
  const root = projectRoot(options);
  const dir = absoluteFrom(root, options.dir || DEFAULT_DIR);
  if (!existsSync(dir)) {
    if (options.json) console.log(JSON.stringify({ dir: relativePath(root, dir), exists: false, items: [] }, null, 2));
    else console.log(`目录不存在：${relativePath(root, dir)}（首次 render 时会自动创建）`);
    return;
  }
  const names = readdirSync(dir);
  const slugs = [];
  for (const name of names) {
    if (name.endsWith(SPEC_SUFFIX)) {
      const slug = name.slice(0, -SPEC_SUFFIX.length);
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  for (const name of names) {
    if (name.endsWith('.html')) {
      const slug = name.slice(0, -'.html'.length);
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  slugs.sort();
  const items = slugs.map((slug) => {
    const specPath = join(dir, `${slug}${SPEC_SUFFIX}`);
    const artifactPath = join(dir, `${slug}.html`);
    const receiptPath = join(dir, `${slug}${RECEIPT_SUFFIX}`);
    const hasReceipt = existsSync(receiptPath);
    let receipt = null;
    if (hasReceipt) {
      try {
        receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      } catch (error) {
        receipt = null;
      }
    }
    return {
      slug,
      title: receipt && receipt.title ? receipt.title : slug,
      type: receipt && receipt.type ? receipt.type : existsSync(specPath) ? String(readJsonSafe(specPath).diagram_type || '') : '',
      status: existsSync(artifactPath) ? (existsSync(specPath) ? 'ready' : 'orphan') : 'spec-only',
      hasReceipt,
      artifactBytes: existsSync(artifactPath) ? bytes(artifactPath) : 0,
      renderedAt: receipt && receipt.renderedAt ? receipt.renderedAt : '',
      paths: { spec: relativePath(root, specPath), artifact: relativePath(root, artifactPath), receipt: relativePath(root, receiptPath) },
    };
  });
  if (options.json) {
    console.log(JSON.stringify({ dir: relativePath(root, dir), exists: true, items }, null, 2));
    return;
  }
  console.log(`[roadbook-atlas] ${relativePath(root, dir)}  ${items.length} 张`);
  for (const item of items) {
    const mark = item.status === 'ready' ? 'OK ' : item.status === 'orphan' ? '!! ' : '.. ';
    const when = item.renderedAt ? `  ${item.renderedAt.slice(0, 16).replace('T', ' ')}` : '';
    const size = item.artifactBytes ? `  ${item.artifactBytes} B` : '';
    console.log(`  ${mark}${item.slug.padEnd(28)} ${item.type.padEnd(13)} ${item.status}${size}${when}`);
  }
  if (items.some((item) => item.status === 'orphan')) console.log('  !! = 有 .html 但没有规格（孤儿图纸）；规格才是事实源。');
  if (items.some((item) => item.status === 'ready' && !item.hasReceipt)) console.log('  .. = 图纸就绪但没有回执（可能是手工放进来的）。');
}
function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return {};
  }
}

function commandNew(argv) {
  const { positional, options } = parseArgs(argv);
  const type = positional[0];
  const slug = positional[1];
  if (!type || !slug) fail(usage(), 2);
  assertType(type);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) fail(`slug 只允许小写字母/数字/点/下划线/连字符：${slug}`, 2);
  ensureVendor();
  if (!existsSync(EXAMPLES_DIR)) fail(`找不到随包的示例规格目录：${EXAMPLES_DIR}`, 1);
  const example = readdirSync(EXAMPLES_DIR).find((name) => name.endsWith(`.${type}.json`));
  if (!example) fail(`随包示例里没有 ${type} 类型的规格，无法生成骨架；请手写 ${slug}${SPEC_SUFFIX}`, 1);
  const root = projectRoot(options);
  const dir = absoluteFrom(root, options.dir || DEFAULT_DIR);
  const target = join(dir, `${slug}${SPEC_SUFFIX}`);
  if (existsSync(target)) fail(`已存在，不覆盖：${relativePath(root, target)}`, 2);
  const spec = readJson(join(EXAMPLES_DIR, example));
  spec.meta = spec.meta || {};
  spec.meta.title = options.title || slug;
  delete spec.meta.output;
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log('[roadbook-atlas] 骨架已写入（照抄自随包示例，改完再渲染）');
  console.log(`  规格   ${relativePath(root, target)}`);
  console.log(`  来源   ${join('skills/roadbook-atlas/vendor/archify/examples', example)}`);
  console.log(`  下一步 node <skill>/bin/atlas.mjs render ${relativePath(root, target)}`);
}

function commandGuide(argv) {
  const { positional, options } = parseArgs(argv);
  const args = ['guide', ...(positional.length > 0 ? [positional.join(' ')] : []), '--json'];
  if (options.lang) args.push('--lang', options.lang);
  const run = runArchify(args, process.cwd());
  if (run.stdout.trim() !== '') console.log(run.stdout.trim());
  if (run.stderr.trim() !== '') console.error(run.stderr.trim());
  process.exit(run.status === 0 ? 0 : 1);
}

function commandDoctor(argv) {
  const { options } = parseArgs(argv);
  const examples = existsSync(EXAMPLES_DIR) ? readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.json')).length : 0;
  const facts = {
    node: process.version,
    skillDir: SKILL_DIR,
    vendorDir: VENDOR_DIR,
    vendorPresent: existsSync(ARCHIFY_CLI),
    rendererVersion: vendorVersion(),
    exampleSpecs: examples,
    upstream: 'https://github.com/tt-a1i/archify',
  };
  const run = runArchify(['doctor'], process.cwd());
  if (!options.json) {
    console.log('[roadbook-atlas] 环境自检');
    console.log(`  node          ${facts.node}`);
    console.log(`  skill 目录    ${facts.skillDir}`);
    console.log(`  渲染器        ${facts.vendorPresent ? `在位 · archify ${facts.rendererVersion}` : '缺失'}`);
    console.log(`  示例规格      ${facts.exampleSpecs} 份`);
    console.log('  --- vendored 渲染器自检 ---');
    if (run.stdout.trim() !== '') console.log(run.stdout.trim());
    if (run.stderr.trim() !== '') console.error(run.stderr.trim());
    console.log(`  vendored doctor 退出码 ${run.status}`);
  } else {
    console.log(JSON.stringify({ ...facts, rendererDoctor: { status: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim() } }, null, 2));
  }
  process.exit(facts.vendorPresent && run.status === 0 ? 0 : 1);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'render':
    commandRender(rest);
    break;
  case 'validate':
    commandValidate(rest);
    break;
  case 'list':
    commandList(rest);
    break;
  case 'new':
    commandNew(rest);
    break;
  case 'guide':
    commandGuide(rest);
    break;
  case 'doctor':
    commandDoctor(rest);
    break;
  case undefined:
  case '--help':
  case '-h':
    console.log(usage());
    break;
  default:
    fail(`未知命令 "${command}"\n\n${usage()}`, 2);
}
