/**
 * Roadbook scaffold · 项目接入的机械动作（把「模板从哪来」「哪些该补」从散文里拿出来）
 *
 * 为什么有它：1-2 / 1-3 两张卡此前都要求用户手报母版绝对路径（`$master = 'D:/path/to/roadbook'`），
 * 再由卡里的一段手搓 PowerShell 整目录复制——新机器 + 新工作区里用户答不出这个路径，卡就停死；
 * 而母版其实**早就在磁盘上了**：装好的插件包（`<profile>/node_modules/roadbook`）里带着 `template/`，
 * `route.mjs` 也早就在用 `resolve(HERE,'..','..','..')` 算母版根。本文件把这件事显式化。
 *
 * 只做三件事，边界写死：
 *   1) **解析母版根**（五级阶梯，每级打出 source= 便于审计；探不到就报三条人工路径，绝不猜）；
 *   2) **三分类**（新增 / 同内容 / 冲突）——判据是字节比较，不是"看起来像"；
 *   3) **只写新增**：`--apply` 永不覆盖已存在的文件；`AGENTS.md` 与 `STATE.md` 是红线域
 *      （AGENTS.md A6 / C3：宪法与 STATE 裁决字段的修改要人在场），只出 `规则版本` 对比。
 *
 * `--check` 与 `--plan` **绝不写盘**（测试钉死：跑完目录清单与 mtime 不变）。
 *
 * 用法：
 *   node skills/roadbook/bin/scaffold.mjs --check <dir> [--json]
 *   node skills/roadbook/bin/scaffold.mjs --plan  <dir> [--json]
 *   node skills/roadbook/bin/scaffold.mjs --apply <dir> [--json]
 *   node skills/roadbook/bin/scaffold.mjs --help
 * 退出码：0 = 无缺口无冲突（或 --apply 后已补齐）；1 = 有缺口/冲突待人裁决；2 = 环境或用法错
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF_ROOT = resolve(HERE, '..', '..', '..')          // skills/roadbook/bin → 母版根（与 route.mjs 同款）
const SCHEMA = 'roadbook-scaffold/1'
const EXIT = { ok: 0, red: 1, usage: 2 }
/** 母版根必须同时有这三样，否则不算可用根（缺一个 = 装出来的空壳，见 0.3.0 的空壳事故）。 */
const ROOT_MARKERS = ['template', 'playbook', 'playbook_EN']
/** 红线域：存在时永不覆盖，只出差异与规则版本对比（AGENTS.md A6 / C3）。 */
const REDLINE = ['AGENTS.md', 'STATE.md']

function fail(message, code = EXIT.red) {
  console.error(message)
  process.exit(code)
}

function usage() {
  return [
    'Usage:',
    '  scaffold --check <dir> [--json]   # 只读体检：母版来源 + 三分类 + 规则版本对比',
    '  scaffold --plan  <dir> [--json]   # dry-run：逐项列出新增 / 同内容 / 冲突（同样不写盘）',
    '  scaffold --apply <dir> [--json]   # 只补「新增」；已存在的文件一律不动',
    '  scaffold --help',
    '',
    '环境变量：ROADBOOK_MASTER=<母版根>（等价于 --master；--master 优先）',
    'Exit codes: 0 no gap / 1 gap or conflict needs a human / 2 environment or usage error',
  ].join('\n')
}

function parseArgs(argv) {
  const opts = { mode: 'help', target: '', master: '', json: false }
  const need = (i, flag) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`用法错误：${flag} 需要一个取值\n\n${usage()}`)
    return v
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.mode = 'help'
    else if (a === '--check') { opts.mode = 'check'; opts.target = need(i, a); i += 1 }
    else if (a === '--plan') { opts.mode = 'plan'; opts.target = need(i, a); i += 1 }
    else if (a === '--apply') { opts.mode = 'apply'; opts.target = need(i, a); i += 1 }
    else if (a === '--master') { opts.master = need(i, a); i += 1 }
    else if (a === '--json') opts.json = true
    else throw new Error(`用法错误：未知参数 ${a}\n\n${usage()}`)
  }
  return opts
}

/** 一个候选根是否可用：三个标记目录齐备。 */
function isUsableRoot(dir) {
  if (!dir || !existsSync(dir)) return false
  return ROOT_MARKERS.every((m) => existsSync(join(dir, m)))
}

/**
 * 母版解析阶梯（五级）。**不猜**：每一级都验证标记目录，全失败就返回 null 让调用方报人工路径。
 * 顺序不是随意的——显式指定 > 环境变量 > 自身位置（装成 skill / 插件包时命中）> npm 身份解析 > 失败。
 */
function resolveMaster(explicit) {
  const tried = []
  const consider = (dir, source) => {
    if (!dir) return null
    const abs = resolve(dir)
    if (isUsableRoot(abs)) return { root: abs, source }
    tried.push(`${source}: ${abs}（缺 ${ROOT_MARKERS.filter((m) => !existsSync(join(abs, m))).join('/')}）`)
    return null
  }
  let hit = consider(explicit, 'flag')
  if (hit) return { ...hit, tried }
  hit = consider(process.env.ROADBOOK_MASTER, 'env')
  if (hit) return { ...hit, tried }
  hit = consider(SELF_ROOT, 'self')
  if (hit) return { ...hit, tried }
  try {
    const pkg = createRequire(import.meta.url).resolve('roadbook/package.json')
    hit = consider(dirname(pkg), 'package')
    if (hit) return { ...hit, tried }
  } catch {
    tried.push('package: 解析不到 roadbook/package.json（本机没装插件包）')
  }
  return { root: '', source: '', tried }
}

/** 模板文件清单（相对路径，正斜杠）。 */
function walk(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

function lineCount(file) {
  try { return readFileSync(file, 'utf8').split('\n').length } catch { return -1 }
}

/** `规则版本：<v>` 行（母版与项目宪法都有这一行；缺行 = 按"缺字段"处理）。
 *  值要剥掉 markdown 强调符：AGENTS.md 里写的是 `> **规则版本：2026-10-05.2** ｜ …`，
 *  不剥就会拿 `2026-10-05.2**` 去比，永远判"落后"（假红）。 */
function ruleVersionOf(file) {
  try {
    const m = readFileSync(file, 'utf8').match(/规则版本[：:]\s*([^\s｜|（()]+)/)
    return m ? m[1].replace(/[*`"'）)、，。;]+$/, '') : ''
  } catch { return '' }
}

function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (err) { fail(err.message, EXIT.usage) }
  if (opts.mode === 'help') { console.log(usage()); return }

  const target = resolve(opts.target)
  const picked = resolveMaster(opts.master)
  if (!picked.root) {
    fail([
      '母版根找不到（五级阶梯全失败）：',
      ...picked.tried.map((t) => `  - ${t}`),
      '',
      '三条人工路径（三选一，然后把路径传给 --master）：',
      '  1) 已装插件包：<profile>/node_modules/roadbook（本机 DSH profile 的 node_modules 下）',
      '  2) clone 母版：git clone https://github.com/Aparencia/RoadBook.git <目录>',
      '  3) 本机已有母版：直接把它的绝对路径写进 --master',
    ].join('\n'), EXIT.usage)
  }

  const tpl = join(picked.root, 'template')
  const files = walk(tpl)
  const added = [], same = [], conflict = []
  for (const rel of files) {
    const dst = join(target, rel.split('/').join(sep))
    if (!existsSync(dst)) { added.push(rel); continue }
    const a = readFileSync(join(tpl, rel.split('/').join(sep)))
    const b = readFileSync(dst)
    if (a.equals(b)) same.push(rel)
    else conflict.push({ rel, tplLines: lineCount(join(tpl, rel.split('/').join(sep))), dstLines: lineCount(dst) })
  }

  // 规则版本对比（只在项目已有 AGENTS.md 时有意义；红线域，只出不改）
  const tplAgents = join(tpl, 'AGENTS.md')
  const dstAgents = join(target, 'AGENTS.md')
  const masterRule = ruleVersionOf(tplAgents)
  const targetRule = existsSync(dstAgents) ? ruleVersionOf(dstAgents) : ''
  const ruleStale = Boolean(targetRule && masterRule && targetRule !== masterRule)

  let written = 0
  if (opts.mode === 'apply') {
    mkdirSync(target, { recursive: true })
    for (const rel of added) {
      const src = join(tpl, rel.split('/').join(sep))
      const dst = join(target, rel.split('/').join(sep))
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)               // 逐字节复制：.ps1 的 UTF-8 BOM 一并保留
      written += 1
    }
  }

  const version = (() => {
    try { return JSON.parse(readFileSync(join(picked.root, 'package.json'), 'utf8')).version || 'unknown' } catch { return 'unknown' }
  })()

  if (opts.json) {
    console.log(JSON.stringify({
      schema: SCHEMA, mode: opts.mode,
      master: picked.root, source: picked.source, version, target,
      counts: { template: files.length, added: added.length, same: same.length, conflict: conflict.length },
      added, conflict, ruleVersion: { master: masterRule, target: targetRule, stale: ruleStale }, written,
    }, null, 2))
  } else {
    const out = []
    out.push('Roadbook scaffold 回执')
    out.push(`母版：${picked.root}（source=${picked.source}｜v${version}）`)
    out.push(`目标：${target}`)
    out.push(`模板：${files.length} 个文件 ｜ 新增 ${added.length} ｜ 同内容 ${same.length} ｜ 冲突 ${conflict.length}`)
    if (REDLINE.some((f) => conflict.some((c) => c.rel === f)) || ruleStale) {
      out.push('')
      out.push('[红线域] AGENTS.md / STATE.md 只出对比、永不覆盖（A6 / C3：宪法与 STATE 裁决字段要人在场）')
      if (targetRule) out.push(`  规则版本：项目 ${targetRule} ｜ 母版 ${masterRule}${ruleStale ? '  ← 落后，需人裁决后手动同步' : '（一致）'}`)
      else out.push(`  规则版本：项目 AGENTS.md 缺该行（按"缺字段"处理）｜ 母版 ${masterRule}`)
    }
    if (added.length) {
      out.push('')
      out.push(`[新增] ${added.length} 项（--apply 只补这些）`)
      for (const rel of added.slice(0, 40)) out.push(`  + ${rel}`)
      if (added.length > 40) out.push(`  …（其余 ${added.length - 40} 项见 --json）`)
    }
    if (conflict.length) {
      out.push('')
      out.push(`[冲突] ${conflict.length} 项（**不动**：内容不同，逐个人工比对后再决定，禁止 -Force 整目录覆盖）`)
      for (const c of conflict) out.push(`  ! ${c.rel}（现有 ${c.dstLines} 行 / 模板 ${c.tplLines} 行）`)
    }
    if (opts.mode === 'apply') out.push('', `已写入 ${written} 个新增文件（未覆盖任何已存在文件）`)
    console.log(out.join('\n'))
  }

  // 退出码看**跑完之后**还剩什么：--apply 已把新增补齐，就不该再报"有缺口"（旧行为会让人以为没补上）；
  // 冲突与规则版本落后是「待人裁决」，任何模式下都算缺口。
  const gap = conflict.length > 0 || ruleStale || (opts.mode !== 'apply' && added.length > 0)
  process.exit(gap ? EXIT.red : EXIT.ok)
}

main()
