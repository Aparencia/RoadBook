/**
 * `Expected：` 标注的硬断言（B13）——**只覆盖 S 链四张卡**：2-2 / 4-1 / 4-3 / 5-1（中英各一份）。
 *
 * 为什么只咬这四张：全库 49 张卡今天有大量命令块没有 Expected 行（2026-10-07 实测覆盖 46/306 = 15%），
 * 一次性全红等于把门禁变成噪音（改一处红一片 → 没人再看）。这里先把「每条命令都要先写期望值」这条规则
 * 在 S 链上做实；其余 45 张的存量计数走 `t.diagnostic`（观测，不拦红），留给 6-6 卡读
 * —— 扩容进度与分批口径记在 `docs/TECH_DEBT.md` TD-019。
 *
 * 判据（与 `rules/rules.json` 的 B13 同口径）：
 *   每个 ```powershell 围栏**收口后 5 行内**必须有一行以 `Expected：`（英文卡 `Expected:`）开头。
 * 这一行要么是新加的，要么是把既有描述行原地加上前缀——**不许改判据语义**，只加标注。
 * 中英同批：同一卡号两份的围栏数与 Expected 行数必须相等，否则就是只改了半边。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const WINDOW = 5 // 「围栏收口后 5 行内」——与 B13 的措辞逐字对齐

const CARDS = [
  { no: '2-2', cn: 'playbook/2-2-需求范围.md', en: 'playbook_EN/2-2-scope-definition.md', marker: 'Expected：', markerEn: 'Expected:' },
  { no: '4-1', cn: 'playbook/4-1-分批编码.md', en: 'playbook_EN/4-1-batch-coding.md', marker: 'Expected：', markerEn: 'Expected:' },
  { no: '4-3', cn: 'playbook/4-3-验证.md', en: 'playbook_EN/4-3-verification.md', marker: 'Expected：', markerEn: 'Expected:' },
  { no: '5-1', cn: 'playbook/5-1-归档.md', en: 'playbook_EN/5-1-archive.md', marker: 'Expected：', markerEn: 'Expected:' },
]

const FORBIDDEN = ['design/', 'playbook/', 'template/', '_archive/'] // 卡面禁用母版内部引用（check.ps1 同款判据）

function readLines(rel) {
  const abs = path.join(ROOT, rel)
  assert.ok(existsSync(abs), `卡文件不存在：${rel}`)
  return readFileSync(abs, 'utf8').split(/\r?\n/)
}

/** 找出所有 ```powershell 围栏：1 基行号 + 该围栏的收口行号。 */
function powershellBlocks(lines) {
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^```powershell\s*$/.test(lines[i])) continue
    let close = -1
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^```/.test(lines[j])) { close = j; break }
    }
    out.push({ open: i + 1, close: close + 1, closed: close >= 0 })
    if (close < 0) break
    i = close
  }
  return out
}

/** 行内容：去掉缩进与列表符号——`   - Expected：…` 也算「Expected：行」。 */
const contentOf = (line) => line.trim().replace(/^[-*+]\s+/, '')

/** 围栏收口后 WINDOW 行内，内容以 marker 开头的那一行（找不到返回 null）。 */
function expectedLine(lines, block, marker) {
  const from = block.close // close 是 1 基行号，lines[close] 正好是收口行之后的第 1 行
  for (let i = from; i < Math.min(from + WINDOW, lines.length); i += 1) {
    if (contentOf(lines[i]).startsWith(marker)) return { line: i + 1, text: lines[i] }
  }
  return null
}

for (const card of CARDS) {
  test(`${card.no}：每个 powershell 围栏收口后 ${WINDOW} 行内有 Expected 行（中英同批）`, () => {
    const cnLines = readLines(card.cn)
    const enLines = readLines(card.en)
    const cnBlocks = powershellBlocks(cnLines)
    const enBlocks = powershellBlocks(enLines)

    assert.ok(cnBlocks.length > 0, `${card.cn} 里一个 powershell 围栏都没有，判据无从谈起`)
    assert.equal(enBlocks.length, cnBlocks.length, `${card.no} 中英围栏数不等：中文 ${cnBlocks.length} / 英文 ${enBlocks.length}`)

    const missing = []
    for (const block of cnBlocks) {
      if (!block.closed) { missing.push(`:${block.open} 围栏没有收口`); continue }
      const hit = expectedLine(cnLines, block, card.marker)
      if (!hit) missing.push(`:${block.close}（围栏 :${block.open}–:${block.close} 之后 ${WINDOW} 行内没有 ${card.marker} 行）`)
      else {
        const bad = FORBIDDEN.filter((bad) => hit.text.includes(bad))
        assert.deepEqual(bad, [], `${card.cn}:${hit.line} 的 Expected 行引用了母版内部路径 ${bad.join(', ')}`)
      }
    }
    for (const block of enBlocks) {
      if (!block.closed) { missing.push(`EN :${block.open} 围栏没有收口`); continue }
      const hit = expectedLine(enLines, block, card.markerEn)
      if (!hit) missing.push(`EN :${block.close}（围栏 :${block.open}–:${block.close} 之后 ${WINDOW} 行内没有 ${card.markerEn} 行）`)
      else {
        const bad = FORBIDDEN.filter((bad) => hit.text.includes(bad))
        assert.deepEqual(bad, [], `${card.en}:${hit.line} 的 Expected 行引用了母版内部路径 ${bad.join(', ')}`)
      }
    }
    assert.deepEqual(missing, [], `${card.no} 有命令块没写期望值：\n  ${missing.join('\n  ')}`)

    // 反向对照：把围栏再往下挪 WINDOW 行，判据必须抓得到（证明「5 行内」这个窗口是真的在判）
    const pushed = [...cnLines]
    const last = cnBlocks[cnBlocks.length - 1]
    pushed.splice(last.close, 0, ...Array.from({ length: WINDOW + 1 }, () => '（垫行）'))
    assert.equal(expectedLine(pushed, last, card.marker), null, '垫了 WINDOW+1 行后仍能命中 = 窗口判据失灵')
  })
}

test('四张卡的 Expected 行数中英相等（中英同批，逐字对应）', () => {
  for (const card of CARDS) {
    const count = (rel, marker) => readLines(rel).filter((line) => contentOf(line).startsWith(marker)).length
    const cn = count(card.cn, card.marker)
    const en = count(card.en, card.markerEn)
    assert.ok(cn > 0, `${card.cn} 一行 Expected 都没有`)
    assert.equal(en, cn, `${card.no} 中英 Expected 行数不等：中文 ${cn} / 英文 ${en}`)
  }
})

test('观测（不拦红）：全库 Expected 覆盖率，供 6-6 卡读', (t) => {
  // 卡号可以是两位数（7-10）：旧的 /^\d-\d-/ 把 `7-10-技术栈迁移.md` 与 EN 同号卡一起漏在扫描面外
  // ⇒ 分母偏小（48/49）。2026-10-07 观测口径对账时订正（TD-019）。
  const dirs = [['playbook', /^\d+-\d+-.*\.md$/], ['playbook_EN', /^\d+-\d+-.*\.md$/]]
  let blocksAll = 0
  let covered = 0
  const perCard = []
  for (const [dir, re] of dirs) {
    for (const file of readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).sort()) {
      const lines = readFileSync(path.join(ROOT, dir, file), 'utf8').split(/\r?\n/)
      const blocks = powershellBlocks(lines)
      const hit = blocks.filter((b) => b.closed && expectedLine(lines, b, 'Expected')).length
      blocksAll += blocks.length
      covered += hit
      if (blocks.length > 0 && hit < blocks.length) perCard.push(`${dir}/${file} ${hit}/${blocks.length}`)
    }
  }
  t.diagnostic(`全库 powershell 围栏 ${blocksAll} 个，其中收口后 ${WINDOW} 行内有 Expected 的 ${covered} 个（${Math.round((covered / blocksAll) * 100)}%）；未覆盖卡：${perCard.join('、') || '无'}`)
  assert.ok(blocksAll > 0, '一个 powershell 围栏都没扫到 = 扫描器坏了')
})
