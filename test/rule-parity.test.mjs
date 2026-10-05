/**
 * rule-parity —— 规则索引（rules/rules.json）↔ 规则正文（template/AGENTS.md + design/glossary-en.md）双向对齐
 *
 * 存在理由：规则原本散在五处（AGENTS.md 宪法 / SKILL.md 铁律 / 0-1 卡硬规则 / 卡内判据 / design），
 * 靠人读发现不了「只在一边存在」。规则唯一化之后，索引与正文必须能被机器对上。
 *
 * 断言四条：
 *   ① 索引 → 正文：rules.json 每条规则的 anchors.zh 必须在 anchorTargets.zh 里**逐字命中**；
 *   ② 索引 → 正文：每条规则的 anchors.en 必须在 anchorTargets.en 里**逐字命中**；
 *   ③ 正文 → 索引：AGENTS.md 里每个 `- **A1**` 形式的规则条目、glossary §6 锚点表里每个 id，
 *      都必须在 rules.json 里存在（反之亦然——只在一侧出现的规则判红）；
 *   ④ 版本一致：AGENTS.md 的 `规则版本：` 与 rules.json 的 `version` 同号。
 *
 * ★ 本测试的局限（明写，防被当成语义保证）★
 *   它能发现的只有「某条规则**只在一边存在**」「锚点字符串被改动到对不上」「版本号漂移」。
 *   它**发现不了语义矛盾**：正文写「deny」而索引 judge 写「ask」、正文说「≤20」而索引写「≤30」、
 *   正文把触发条件写反——只要锚点字符串还在，四条断言全绿。
 *   判据语义的正确性只能由人复核（6-6 流程体检 / 4-2 代码审查），本文件不提供该保证。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const RULES_PATH = join(ROOT, 'rules', 'rules.json')

const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'))
const targets = rules.anchorTargets ?? {}
const ZH_FILE = targets.zh
const EN_FILE = targets.en
const ZH_TEXT = readFileSync(join(ROOT, ZH_FILE), 'utf8')
const EN_TEXT = readFileSync(join(ROOT, EN_FILE), 'utf8')

/** 规则条目在正文里的形态：行首的 `- **A1**`。这是「正文里的规则条目」的机械定义。 */
const RULE_ENTRY_RE = /^- \*\*([ABCD]\d+)\*\*/gm
/** 英文锚点表形态：`| A1 | … |` 的表格行首单元格。 */
const ANCHOR_ROW_RE = /^\|\s*([ABCD]\d+)\s*\|/gm

const idsOf = (text, re) => [...text.matchAll(re)].map((m) => m[1])
const sorted = (xs) => [...xs].sort()

const indexIds = rules.rules.map((r) => r.id)
const bodyIds = idsOf(ZH_TEXT, RULE_ENTRY_RE)
const anchorRowIds = idsOf(EN_TEXT, ANCHOR_ROW_RE)

test('① 索引 → 正文：每条规则的 zh 锚点在正文里逐字命中', () => {
  const missed = []
  for (const rule of rules.rules) {
    const anchor = rule.anchors?.zh
    if (typeof anchor !== 'string' || anchor.length === 0) {
      missed.push(`${rule.id}：缺 anchors.zh`)
      continue
    }
    if (!ZH_TEXT.includes(anchor)) missed.push(`${rule.id}：正文里找不到 anchors.zh「${anchor}」`)
  }
  assert.deepEqual(missed, [], `zh 锚点未命中（改正文就必须同批改 rules.json 的 anchors.zh）：\n  ${missed.join('\n  ')}`)
})

test('② 索引 → 正文：每条规则的 en 锚点在英文索引里逐字命中', () => {
  const missed = []
  for (const rule of rules.rules) {
    const anchor = rule.anchors?.en
    if (typeof anchor !== 'string' || anchor.length === 0) {
      missed.push(`${rule.id}：缺 anchors.en`)
      continue
    }
    if (!EN_TEXT.includes(anchor)) missed.push(`${rule.id}：${EN_FILE} 里找不到 anchors.en「${anchor}」`)
  }
  assert.deepEqual(missed, [], `en 锚点未命中（改英文索引就必须同批改 rules.json 的 anchors.en）：\n  ${missed.join('\n  ')}`)
})

test('③ 正文 → 索引：规则条目与索引 id 一一对应（只在一侧存在即判红）', () => {
  const onlyInBody = sorted(bodyIds.filter((id) => !indexIds.includes(id)))
  const onlyInIndex = sorted(indexIds.filter((id) => !bodyIds.includes(id)))
  assert.deepEqual(onlyInBody, [], `这些规则条目只出现在 ${ZH_FILE}，索引里没有：${onlyInBody.join(', ')}`)
  assert.deepEqual(onlyInIndex, [], `这些规则只在索引里，${ZH_FILE} 正文没有条目：${onlyInIndex.join(', ')}`)
})

test('③b 英文锚点表与索引 id 一一对应', () => {
  const onlyInTable = sorted(anchorRowIds.filter((id) => !indexIds.includes(id)))
  const onlyInIndex = sorted(indexIds.filter((id) => !anchorRowIds.includes(id)))
  assert.deepEqual(onlyInTable, [], `${EN_FILE} 锚点表里这些 id 索引里没有：${onlyInTable.join(', ')}`)
  assert.deepEqual(onlyInIndex, [], `这些规则在 ${EN_FILE} 锚点表里没有行：${onlyInIndex.join(', ')}`)
})

test('③c 英文锚点节自报身份（不得被读成第二份规则正文）', () => {
  assert.ok(EN_TEXT.includes('硬规则英文锚点索引'), `${EN_FILE} 缺少「硬规则英文锚点索引」节标题`)
  assert.ok(EN_TEXT.includes('只用于逐字匹配，不是规则正文'), `${EN_FILE} 未声明本节只用于逐字匹配`)
  assert.ok(EN_TEXT.includes('唯一正文是 `template/AGENTS.md`'), `${EN_FILE} 未指向规则唯一正文 template/AGENTS.md`)
})

test('④ 版本一致：正文 `规则版本：` 与 rules.json 的 version 同号', () => {
  const match = /规则版本：\s*([0-9A-Za-z.\-]+)/.exec(ZH_TEXT)
  assert.ok(match, `${ZH_FILE} 里找不到「规则版本：<version>」行`)
  assert.equal(match[1], rules.version, `版本号不一致：${ZH_FILE} 写 ${match[1]}，rules.json 写 ${rules.version}`)
})

test('⑤ 锚点落点声明的文件真实存在且非空', () => {
  assert.ok(typeof ZH_FILE === 'string' && ZH_FILE.length > 0, 'rules.json 缺 anchorTargets.zh')
  assert.ok(typeof EN_FILE === 'string' && EN_FILE.length > 0, 'rules.json 缺 anchorTargets.en')
  assert.ok(ZH_TEXT.length > 0, `${ZH_FILE} 为空`)
  assert.ok(EN_TEXT.length > 0, `${EN_FILE} 为空`)
})

/**
 * ⑥ 红旗表落点（D3）。
 * 背景：0-1 驱动卡的红旗表已并入 template/AGENTS.md；英文表头记在 glossary-en.md §6。
 * 原来的护栏在 `_qc/check.ps1:154`，用的是 `-match '| 你会想 | 事实 |'`——`|` 在正则里是「或」，
 * 空分支匹配一切，该断言对任何内容都返回真（实测：空字符串也判真），是一条**假绿护栏**。
 * 这里用字面 .includes 重新钉住两个落点，避免「护栏空洞」。
 */
test('⑥ D3 红旗表落点：中文表头在正文、英文表头在英文索引（字面匹配）', () => {
  assert.ok(ZH_TEXT.includes('| 你会想 | 事实 |'), `${ZH_FILE} 缺中文红旗表表头「| 你会想 | 事实 |」`)
  assert.ok(EN_TEXT.includes('| You may think | Reality |'), `${EN_FILE} 缺英文红旗表表头「| You may think | Reality |」`)
})
