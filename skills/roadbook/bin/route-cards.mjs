/**
 * roadbook route —— **读盘半**：卡目录扫描、锚点区提取、读卡正文
 *
 * 这一层只做 I/O，判据一条都不在这里（`route-core.mjs` 是纯逻辑，`route-data.mjs` 是表）。
 * 拆出来的理由与边界见 `route.mjs` 文件头。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CN_DIR } from './route-data.mjs'

/** 读一张卡的正文。纯逻辑（切片）收字符串，副作用只到这一层为止 —— 便于离线单测。 */
export function readCardText(dir, entry) {
  return readFileSync(join(dir, entry.file), 'utf8')
}

/**
 * 卡文件名：`<阶段>-<序号>-<名字>.md`。
 *
 * 两段都必须是 `\d+`：**2026-10-06 实测事故**——旧写法 `/^(\d-\d)-/` 只认一位数字，
 * 于是新增的 `7-10-*.md` 不匹配，`scanDir` 静默 `continue`，`--audit` 报「44 张 ·
 * 双语无缺份 · 判绿」，而磁盘与 design §4 表都是 45 张。一张卡对扫描器不存在 =
 * 路由永远到不了它，**而门禁与自进化信号（S6 只看退出码）双双判绿**——这正是本仓
 * 反复定义的那类假绿。放宽为多位数字，并把「认不出的文件」报出来（见 scanDir）。
 */
const ID_RE = /^(\d+-\d+)-(.+)\.md$/
/** 锚点只许取自这两类行：H1 与触发行（`> 触发：…` / `> Trigger: …`）。 */
const H1_RE = /^#\s+\S/
const TRIGGER_RE = /^>\s*(?:触发|Trigger)/

/* ───────────────────────────── 读盘 ───────────────────────────── */

/**
 * 锚点区 = H1 行 + 触发行（缺哪行就只取另一行）。
 *
 * 为什么不是「前 3 行」：4-3 卡的锚点「等用户验收」实际落在 `:120` 的正文里，
 * 头部 3 行扫不到 → 审计必然假红。**正文会随细节改动漂移，锚点只认进入条件本身**。
 */
export function anchorAreaOf(lines) {
  const h1 = lines.find((line) => H1_RE.test(line)) || ''
  const trigger = lines.find((line) => TRIGGER_RE.test(line)) || ''
  return { h1, trigger, anchorArea: [h1, trigger].filter(Boolean).join('\n') }
}

export function scanDir(dir) {
  const out = new Map()
  // 「看得见的 .md」与「认得出的卡」的差额。挂在 Map 上的 expando 数组：现有消费者
  // 只用 Map 方法（get / has / size / keys），加这个属性不影响它们；audit 读不到时
  // 用 `?? []` 兜底（测试自己造的合成 Map 因此仍然成立）。
  out.unparsed = []
  if (!existsSync(dir)) return out
  for (const file of readdirSync(dir).sort()) {
    const m = ID_RE.exec(file)
    if (!m) {
      if (file.endsWith('.md')) out.unparsed.push(file)
      continue
    }
    const text = readFileSync(join(dir, file), 'utf8')
    const lines = text.split(/\r?\n/)
    const { h1, trigger, anchorArea } = anchorAreaOf(lines)
    out.set(m[1], {
      id: m[1], file, dir: dir === CN_DIR ? 'playbook' : 'playbook_EN',
      h1, trigger, anchorArea,
      lines: lines.length,
      chars: text.length,
      checkboxes: (text.match(/^\s*- \[ \]/gm) || []).length,
      psBlocks: (text.match(/^```powershell/gm) || []).length,
      stops: (text.match(/^.*(停下等|等待你裁决|等用户(说|确认|裁决|放行)|停下升级|停下，输出|等用户处理).*$/gm) || []).length,
      actions: (text.match(/^\*\*动作/gm) || []).length,
    })
  }
  return out
}
