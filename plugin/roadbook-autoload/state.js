/**
 * STATE.md 必填字段校验（纯逻辑，不 import 任何 dsh 包，可离线单测）。
 *
 * 为什么要有：B10 —— 缺字段 = 下一轮从错的地方开始。`STATE.md` 是人机共用的唯一事实源，
 * 字段少一个，下一个会话（或下一个人）就只能靠猜。这条判据是**机械的**：字段名逐字来自
 * `template/STATE.md`，本文件不新增字段、不改口径 —— 模板加字段时这里同批加，否则两处会漂。
 *
 * 只做「在不在」这一层：值写没写对（档位是不是 S/M/L、锚点是不是 40 位哈希）属于卡的判据，
 * 不是插件的活。判据越浅越不会误报 —— 一个爱误报的门会被关掉，等于没有门。
 */

/**
 * 必填键，**逐字**取自 `template/STATE.md`：
 *   当前位置（当前阶段 / 当前任务 / 档位 / 起点锚点 / 工作树状态）、
 *   计数（体检计数 / 文件数基线 / 当前文件数）、下一步、未决问题、红线摘要。
 * 顺序与模板一致，便于两边对照。
 */
export const REQUIRED_STATE_KEYS = [
  '当前阶段',
  '当前任务',
  '档位',
  '起点锚点',
  '工作树状态',
  '体检计数',
  '文件数基线',
  '当前文件数',
  '下一步',
  '未决问题',
  '红线摘要',
]

/**
 * 解析 STATE.md 正文，报出缺哪些必填键。
 *
 * 判据是**子串在不在**：模板里这些键既出现在行首（`- 当前阶段：`）也出现在小标题（`## 下一步`），
 * 逐字匹配两种形态都认，且不会因为排版微调（改冒号、加空格）误报。
 * 空文件不算「齐备」：present 为 false 时 missing 是全部键。
 *
 * @param {unknown} text - STATE.md 全文（读不到时传 undefined / ''）
 * @returns {{present: boolean, missing: string[]}} present = 正文非空（文件存在且有内容）
 */
export function parseState(text) {
  const source = typeof text === 'string' ? text : ''
  const present = source.trim().length > 0
  const missing = present
    ? REQUIRED_STATE_KEYS.filter((key) => !source.includes(key))
    : [...REQUIRED_STATE_KEYS]
  return { present, missing }
}
