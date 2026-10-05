#!/usr/bin/env node
/**
 * roadbook rules —— 硬规则索引的机械审计（零依赖，不 spawn 子进程）
 *
 * 为什么存在：规则散在三处（`template/AGENTS.md` 宪法、`skills/roadbook/SKILL.md` 铁律、
 * `playbook/0-1-驱动卡.md` 硬规则），靠人读发现不了「只在一边存在」与「分类与判定命令不匹配」。
 * 本工具把 `rules/rules.json` 的每条规则拉直检查，红则退出码 1。
 *
 * 三条自我约束：
 *   1. **不装判据散文**：索引里只有标识与机械钩子，判据正文在 AGENTS.md 与卡内。
 *   2. **判定命令必须真存在**：`renderedIn` 指向的文件与 `judge.cmd` 引用的脚本，审计时回读磁盘。
 *   3. **占位与真判据分开**：`status: planned` 的判定命令必须写清落点阶段，不许写成"以后再说"。
 *
 * 用法：
 *   node skills/roadbook/bin/rules.mjs --audit      # 退出码 0 = 索引自洽
 *   node skills/roadbook/bin/rules.mjs --list       # 人读清单（分类 / 判定命令 / 落点）
 *   node skills/roadbook/bin/rules.mjs --json       # 机器读
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..') // skills/roadbook/bin → 母版根
const RULES_PATH = join(ROOT, 'rules', 'rules.json')
const SCHEMA = 'roadbook-rules/1'
const CLASSES = ['A', 'B', 'C', 'D']

function usage() {
  console.log(`roadbook rules —— 硬规则索引审计

用法：
  node skills/roadbook/bin/rules.mjs --audit    # 索引自洽检查（红 = 退出码 1）
  node skills/roadbook/bin/rules.mjs --list     # 人读清单
  node skills/roadbook/bin/rules.mjs --json     # 机器读

退出码：0 = 通过 ｜ 1 = 判红 ｜ 2 = 用法错误
`)
}

export function loadRules(root = ROOT) {
  const path = join(root, 'rules', 'rules.json')
  return { data: JSON.parse(readFileSync(path, 'utf8')), path }
}

/**
 * 判定命令引用的脚本文档是否真在磁盘上（只认第一个路径样式的 token）。
 *
 * `planned` 与 `existing` 的口径必须分开：planned 的判定命令**本来就指向尚未创建的文件**
 * （那正是"计划中"的含义），按文件存在性判它会得到假红；但也不能完全不查 ——
 * 所以 planned 只要求**父目录存在**（写错目录名照样判红），existing 仍要求文件存在。
 */
function commandTargetExists(cmd, root, status = 'existing') {
  const match = /(?:^|\s)((?:skills|template|test|plugin|lib|playbook|playbook_EN|_qc|rules)\/[\w./-]+)/.exec(cmd)
  if (!match) return true // 纯命令（git status / npm test）不指向仓库内文件
  const target = join(root, match[1])
  if (existsSync(target)) return true
  return status === 'planned' && existsSync(dirname(target))
}

/**
 * 审计一份规则索引。返回问题清单（空 = 通过）。
 * @param {object} data - rules.json 解析结果
 * @param {{root?: string}} [opts]
 */
export function auditRules(data, opts = {}) {
  const root = opts.root ?? ROOT
  const problems = []
  const push = (message) => problems.push(message)

  if (data?.schema !== SCHEMA) push(`schema 应为 ${SCHEMA}（实际 ${JSON.stringify(data?.schema)}）`)
  if (typeof data?.version !== 'string' || data.version.length === 0) push('缺 version 字段')
  const rules = Array.isArray(data?.rules) ? data.rules : null
  if (rules === null) {
    push('rules 必须是数组')
    return problems
  }
  if (rules.length === 0) push('rules 为空：索引存在但没有任何规则')

  const seenIds = new Set()
  const seenTriggers = new Map()
  for (const rule of rules) {
    const id = rule?.id
    const label = typeof id === 'string' && id.length > 0 ? id : '<无 id>'

    // ① 标识
    if (typeof id !== 'string' || !/^[ABCD]\d+$/.test(id)) {
      push(`${label}：id 必须形如 A1 / B12（分类字母 + 序号）`)
    } else {
      if (seenIds.has(id)) push(`${label}：id 重复`)
      seenIds.add(id)
      if (id[0] !== rule.class) push(`${label}：id 前缀与 class 不一致（class=${rule.class}）`)
    }

    // ② 分类
    if (!CLASSES.includes(rule?.class)) push(`${label}：class 必须是 ${CLASSES.join(' / ')} 之一`)

    // ③ 必备字段
    if (typeof rule?.title !== 'string' || rule.title.trim().length === 0) push(`${label}：缺 title`)
    if (typeof rule?.predicate !== 'string' || rule.predicate.trim().length === 0) {
      push(`${label}：缺 predicate（可观测谓词——写不出它就不是判据）`)
    }

    // ④ 触发词唯一（契约 §2「触发词唯一」的机械版）
    const triggers = rule?.trigger
    if (!Array.isArray(triggers) || triggers.length === 0) {
      push(`${label}：trigger 必须是非空数组`)
    } else {
      for (const word of triggers) {
        if (typeof word !== 'string' || word.trim().length === 0) {
          push(`${label}：trigger 里有空词`)
          continue
        }
        if (seenTriggers.has(word)) push(`触发词「${word}」被 ${seenTriggers.get(word)} 与 ${label} 同时占用（一个分支只留一个触发词）`)
        else seenTriggers.set(word, label)
      }
    }

    // ⑤ 分类 ↔ 判定钩子必须匹配
    const judge = rule?.judge
    const kind = judge?.kind
    if (!['command', 'gate', 'none'].includes(kind)) {
      push(`${label}：judge.kind 必须是 command / gate / none（实际 ${JSON.stringify(kind)}）`)
    } else if (rule.class === 'D') {
      if (kind !== 'none') push(`${label}：D 类（行为纪律）不该有机械判定（实际 ${kind}）—— 有机械后果就不该归 D`)
    } else {
      if (kind === 'none') push(`${label}：${rule.class} 类必须有机械判定（command / gate），写不出就该降级为 D 或删掉`)
      if (kind === 'command') {
        if (typeof judge.cmd !== 'string' || judge.cmd.trim().length === 0) push(`${label}：judge.cmd 为空`)
        else if (!commandTargetExists(judge.cmd, root, judge.status)) push(`${label}：judge.cmd 引用的路径在磁盘上不存在（${judge.cmd}；planned 判定允许文件尚未创建，但父目录必须存在）`)
      }
      if (kind === 'gate') {
        if (!['ask', 'deny'].includes(judge.action)) push(`${label}：gate.action 必须是 ask / deny（实际 ${JSON.stringify(judge.action)}）`)
      }
      if (kind === 'command' || kind === 'gate') {
        if (!['existing', 'planned'].includes(judge.status)) push(`${label}：judge.status 必须是 existing / planned`)
        if (judge.status === 'planned' && !Number.isInteger(judge.phase)) {
          push(`${label}：planned 判定必须写 phase（落点阶段号），不许写成"以后再说"`)
        }
      }
    }

    // ⑥ 落点必须真实存在（幽灵引用判红）
    const rendered = rule?.renderedIn
    if (!Array.isArray(rendered) || rendered.length === 0) {
      push(`${label}：renderedIn 至少一个落点`)
    } else {
      for (const rel of rendered) {
        if (typeof rel !== 'string' || rel.trim().length === 0) push(`${label}：renderedIn 里有空路径`)
        else if (!existsSync(join(root, rel))) push(`${label}：renderedIn 指向不存在的文件（${rel}）`)
      }
    }
  }

  const classes = new Map(CLASSES.map((c) => [c, 0]))
  for (const rule of rules) if (classes.has(rule?.class)) classes.set(rule.class, classes.get(rule.class) + 1)
  if ([...classes.values()].some((n) => n === 0)) {
    push(`分类出现空类：${[...classes.entries()].filter(([, n]) => n === 0).map(([c]) => c).join(' / ')}（分类是为了分派机械后果，空类说明分类没落地）`)
  }
  return problems
}

function summary(data) {
  const byClass = new Map(CLASSES.map((c) => [c, []]))
  for (const rule of data.rules) byClass.get(rule.class)?.push(rule)
  const lines = [`Roadbook 规则索引 · schema=${data.schema} · version=${data.version} · 共 ${data.rules.length} 条`]
  for (const cls of CLASSES) {
    const rules = byClass.get(cls) ?? []
    lines.push('', `## ${cls} ${data.classes?.[cls]?.name ?? ''}（${rules.length} 条）—— ${data.classes?.[cls]?.consequence ?? ''}`)
    for (const rule of rules) {
      const judge = rule.judge ?? {}
      const hook = judge.kind === 'command'
        ? `cmd: ${judge.cmd}${judge.status === 'planned' ? `（阶段 ${judge.phase} 落）` : ''}`
        : judge.kind === 'gate'
          ? `gate: ${judge.action}${judge.status === 'planned' ? `（阶段 ${judge.phase} 落）` : ''}`
          : '无机械后果'
      lines.push(`  ${rule.id.padEnd(4)} ${rule.title}　→ ${hook}`)
    }
  }
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) return usage()
  const unknown = args.filter((a) => !['--audit', '--list', '--json'].includes(a))
  if (unknown.length > 0) {
    console.error(`未知参数：${unknown.join(' ')}`)
    usage()
    process.exit(2)
  }
  const { data, path } = loadRules(ROOT)
  const problems = auditRules(data, { root: ROOT })

  if (args.includes('--json')) {
    console.log(JSON.stringify({ path, ok: problems.length === 0, problems, rules: data.rules }, null, 2))
    process.exit(problems.length === 0 ? 0 : 1)
  }
  if (args.includes('--list')) {
    console.log(summary(data))
    if (problems.length > 0) console.log(`\n判红 ${problems.length} 条（跑 --audit 看全部）`)
    process.exit(problems.length === 0 ? 0 : 1)
  }

  console.log('Roadbook 规则索引审计')
  console.log(`索引：${path.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '')}`)
  const counts = CLASSES.map((c) => `${c}=${data.rules.filter((r) => r.class === c).length}`).join(' · ')
  console.log(`规则：${data.rules.length} 条（${counts}）`)
  if (problems.length === 0) {
    console.log('判绿：标识唯一、分类与判定钩子匹配、落点与命令引用都在磁盘上、触发词无冲突。')
    process.exit(0)
  }
  console.log(`判红 ${problems.length} 条：`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
