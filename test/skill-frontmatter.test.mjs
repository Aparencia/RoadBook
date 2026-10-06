/**
 * SKILL.md 的前置元信息必须能被**真的 YAML** 读出来，而不是"看起来对"。
 *
 * 为什么需要它（2026-10-06 实例）：`skills/roadbook/SKILL.md` 的 `description` 曾是未加引号的
 * YAML 纯标量，值里有一个 ASCII「: 」（`… when no process is wanted: a one-off question …`）——
 * YAML 把它读成嵌套映射，宿主的 `parseFrontmatter` 抛错后被 catch 住、只打一条 warn 就 return，
 * **整份文件被静默丢弃** ⇒ `roadbook` 从未进过技能目录（`skill("roadbook")` = unknown）
 * ⇒ 自动加载落到 `skip/no-skill` ⇒ 流程正文一次都没注入过（观测 166 行里 `inject` = 0 条）。
 *
 * 旧仪器的**方向是错的**：`skill-mirror.test.mjs` 的 `^description: \S` 与 `check.ps1` §4 的九条
 * 正则按行读，而正则读得懂非法 YAML —— 九条全绿也拦不住。本测试改判「YAML 会怎么读这一行」：
 * 纯标量在第一个「: 」或「 #」处就被截断，截断了 = 值不完整 = 判红（旧内容必红，新内容必绿）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = [
  ['根 SKILL.md', new URL('../SKILL.md', import.meta.url)],
  ['镜像 skills/roadbook/SKILL.md', new URL('../skills/roadbook/SKILL.md', import.meta.url)],
]

/** frontmatter 行：首行 `---` 到下一个 `---` 之间。 */
function frontmatter(text) {
  assert.ok(text.startsWith('---\n'), 'frontmatter 首行必须严格是 ---（前置 BOM 或空行会被宿主静默忽略）')
  const lines = text.split('\n')
  const end = lines.indexOf('---', 1)
  assert.ok(end > 1, 'frontmatter 必须有闭合的 --- 行')
  return lines.slice(1, end)
}

function descriptionOf(text) {
  const line = frontmatter(text).find((l) => l.startsWith('description:'))
  assert.ok(line, 'frontmatter 缺 description')
  return line.slice('description:'.length).trimStart()
}

for (const [label, url] of FILES) {
  test(`${label}：frontmatter 只含 name + description，每行按 YAML 读出来等于整行值`, () => {
    const lines = frontmatter(readFileSync(url, 'utf8'))
    const keys = lines.map((line) => {
      const m = /^([A-Za-z][A-Za-z0-9_-]*): (.+)$/.exec(line)
      assert.ok(m, `不是平铺的 "key: value" 形状：${line.slice(0, 48)}…`)
      return m[1]
    })
    assert.deepEqual(keys, ['name', 'description'], '宿主只注入 name + description，非标准键一律删')

    for (const line of lines) {
      const raw = line.slice(line.indexOf(': ') + 2)
      if (raw.startsWith('"') || raw.startsWith("'")) {
        assert.equal(raw.at(-1), raw[0], `引号没在同一行闭合，YAML 会抛错：${line.slice(0, 48)}…`)
        continue
      }
      const cut = /: | #/.exec(raw)
      assert.equal(
        cut,
        null,
        `未加引号的值里有「${cut?.[0]}」——YAML 在第 ${cut?.index} 个字符处截断成 ` +
          `${JSON.stringify(cut?.index === undefined ? '' : raw.slice(0, cut.index))}，` +
          '宿主会抛 "Nested mappings are not allowed in compact mappings" 并把整份文件丢掉：' +
          `${line.slice(0, 48)}…`,
      )
    }
  })

  test(`${label}：description 解析后的长度在 1..500（对齐宿主 catalogDescriptionMaxLength）`, () => {
    const raw = descriptionOf(readFileSync(url, 'utf8'))
    const value = raw.startsWith('"') ? raw.slice(1, -1).replaceAll('\\"', '"') : raw
    assert.ok(value.length > 0 && value.length <= 500, `description 解析后长度 ${value.length}，宿主上限 500`)
  })
}
