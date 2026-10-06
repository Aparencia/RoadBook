/**
 * scaffold CLI 的行为测试（B 类机械判据：**母版 → 项目骨架**）。
 *
 * 为什么值得单独测：这张卡的动作此前是**卡里的一段手搓 PowerShell 整目录复制**，
 * 它有三个不能靠肉眼保证的性质——① 只补缺失、绝不覆盖（覆盖用户文件是不可逆的）；
 * ② `--check` / `--plan` 一个字都不写（"只读体检"必须是字面意思）；③ 母版探不到时
 * **报人工路径并退出 2**，而不是挑一个看起来像的目录往里写（猜错 = 把模板倒进别人的仓库）。
 * 三条都是"错了才发现"的类型，所以这里各配一条反向对照。
 *
 * 断言分两类（缺第二类就是装饰）：正向（当前仓库必须判绿）+ **反向对照**（故意造场景，必须报出来）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CLI = path.join(ROOT, 'skills', 'roadbook', 'bin', 'scaffold.mjs')
const TPL = path.join(ROOT, 'template')
const TEMPLATE_FILE_COUNT = (function walk(dir) {
  let n = 0
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) n += walk(full)
    else n += 1
  }
  return n
})(TPL)

/** 跑 CLI；显式清空 ROADBOOK_MASTER，免得本机环境变量把阶梯第 2 级顶掉（那会让测试测的不是它以为的东西）。 */
function cli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ROADBOOK_MASTER: '', ...extraEnv },
  })
}
/** 目录快照：文件清单 + mtimeMs。用来证明"只读"不是嘴上说说。 */
function snapshot(dir) {
  const out = []
  const walk = (d, base) => {
    if (!existsSync(d)) return
    for (const name of readdirSync(d)) {
      const full = path.join(d, name)
      const rel = base ? `${base}/${name}` : name
      if (statSync(full).isDirectory()) walk(full, rel)
      else out.push(`${rel}@${statSync(full).mtimeMs}`)
    }
  }
  walk(dir, '')
  return out.sort().join('\n')
}
function tmp(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

test('A1 --help 退出 0 且列出三种模式', () => {
  const r = cli(['--help'])
  assert.equal(r.status, 0, r.stderr)
  for (const m of ['--check', '--plan', '--apply']) assert.match(r.stdout, new RegExp(m.replace('-', '\\-')))
})

test('A2 未知参数 / 缺取值 = 用法错（退出 2），不是"默默当默认"', () => {
  assert.equal(cli(['--bogus']).status, 2)
  assert.equal(cli(['--check']).status, 2)
})

test('A3 空目录 --check：全部算新增，退出 1', () => {
  const dir = tmp('rb-scaf-')
  try {
    const r = cli(['--check', dir])
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /新增\s+\d+/)
    assert.match(r.stdout, new RegExp(`模板：${TEMPLATE_FILE_COUNT} 个文件`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('A4 反向对照：--check 与 --plan 一个字都不写（快照逐字节一致）', () => {
  const dir = tmp('rb-scaf-ro-')
  try {
    writeFileSync(path.join(dir, 'README.md'), '# 我自己的 README\n', 'utf8')
    const before = snapshot(dir)
    assert.equal(cli(['--check', dir]).status, 1)
    assert.equal(cli(['--plan', dir]).status, 1)
    assert.equal(snapshot(dir), before, '--check/--plan 改动了目标目录 —— 只读体检必须是字面意思')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('A5 --apply 补齐后 --check 退出 0，文件数与模板一致', () => {
  const dir = tmp('rb-scaf-ap-')
  try {
    assert.equal(cli(['--apply', dir]).status, 0, '补齐成功就该退出 0（缺口算的是跑完之后剩什么）')
    const r = cli(['--check', dir])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, new RegExp(`同内容 ${TEMPLATE_FILE_COUNT}`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('A6 反向对照：内容不同 = 冲突，--apply 绝不覆盖', () => {
  const dir = tmp('rb-scaf-cf-')
  try {
    const mine = '# 我自己的 README\n用户写过的东西\n'
    writeFileSync(path.join(dir, 'README.md'), mine, 'utf8')
    const r = cli(['--check', dir])
    assert.equal(r.status, 1)
    assert.match(r.stdout, /\[冲突\]/, '内容不同必须报冲突，不能算"已存在就跳过"')
    assert.equal(cli(['--apply', dir]).status, 1, '有冲突待人裁决 → 退出 1')
    assert.equal(readFileSync(path.join(dir, 'README.md'), 'utf8'), mine, '--apply 覆盖了用户文件（不可逆）')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('A7 反向对照：--master 指到不可用根 → 拒绝该候选并落到下一级（不猜）', () => {
  const bogus = tmp('rb-scaf-bad-')
  const dir = tmp('rb-scaf-ok-')
  try {
    const r = cli(['--check', dir, '--master', bogus])
    assert.notEqual(r.status, 2, '本仓自身就是可用母版，拒绝坏候选后应当落到 self 这一级')
    assert.match(r.stdout, /source=self/, '应当明确打出实际用了哪一级来源')
  } finally {
    rmSync(bogus, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A8 反向对照：五级阶梯全失败 → 退出 2 并给三条人工路径', () => {
  const box = tmp('rb-scaf-none-')
  try {
    const bin = path.join(box, 'bin')
    mkdirSync(bin, { recursive: true })
    cpSync(CLI, path.join(bin, 'scaffold.mjs'))
    // 这份副本的 self 推导指向 box（无 template/），package 解析也够不到本仓 → 阶梯全失败
    const r = spawnSync(process.execPath, [path.join(bin, 'scaffold.mjs'), '--check', path.join(box, 'proj')], {
      cwd: box, encoding: 'utf8', env: { ...process.env, ROADBOOK_MASTER: '' },
    })
    assert.equal(r.status, 2, `全失败必须是用法/环境错（2），实得 ${r.status}\n${r.stdout}\n${r.stderr}`)
    assert.match(r.stderr, /五级阶梯全失败/)
    assert.match(r.stderr, /git clone https:\/\/github\.com\/Aparencia\/RoadBook\.git/, '要给出人工路径，而不是让用户自己想')
  } finally { rmSync(box, { recursive: true, force: true }) }
})

test('A9 红线域：AGENTS.md 冲突只出规则版本对比，不进 [新增]，也不被覆盖', () => {
  const dir = tmp('rb-scaf-rl-')
  try {
    const mine = '# 项目宪法\n> **规则版本：2026-01-01.1** ｜ 机器索引 rules/rules.json\n'
    writeFileSync(path.join(dir, 'AGENTS.md'), mine, 'utf8')
    const r = cli(['--check', dir])
    assert.equal(r.status, 1)
    assert.match(r.stdout, /\[红线域\]/)
    assert.match(r.stdout, /规则版本：项目 2026-01-01\.1 ｜ 母版 \d{4}-\d{2}-\d{2}\.\d+/)
    assert.match(r.stdout, /落后/)
    cli(['--apply', dir])
    assert.equal(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), mine, '红线域被覆盖 = 毁掉用户宪法（A6）')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('A10 --apply 复制 .ps1 保留 UTF-8 BOM（PS 5.1 无 BOM 会按 GB2312 解中文）', () => {
  const dir = tmp('rb-scaf-bom-')
  try {
    assert.equal(cli(['--apply', dir]).status, 0)
    const bytes = readFileSync(path.join(dir, 'check.ps1'))
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], '复制过去的 check.ps1 丢了 BOM')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
