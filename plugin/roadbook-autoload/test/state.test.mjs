/**
 * STATE.md 必填字段校验的离线测试（`state.js` 不 import 任何 dsh 包）。
 *
 * 关键一条是**对着真模板跑**：字段口径必须逐字来自 `template/STATE.md`，
 * 所以这里读磁盘上的那份模板，而不是在测试里再抄一遍字段名 —— 抄一遍就等于把
 * 「两处会漂」的隐患搬进测试，测试反而替漂移背书。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { REQUIRED_STATE_KEYS, parseState } from '../state.js'

/** 仓库根的 template/STATE.md（测试文件在 plugin/roadbook-autoload/test/ 下）。 */
const TEMPLATE = new URL('../../../template/STATE.md', import.meta.url)

test('必填字段逐字来自 template/STATE.md：模板全文齐备，且每个键都在模板里出现', () => {
  const template = readFileSync(TEMPLATE, 'utf8')

  const verdict = parseState(template)
  assert.equal(verdict.present, true)
  assert.deepEqual(verdict.missing, [], `模板自己缺字段（字段口径已漂）：${verdict.missing.join(' / ')}`)

  const absent = REQUIRED_STATE_KEYS.filter((key) => !template.includes(key))
  assert.deepEqual(absent, [], `REQUIRED_STATE_KEYS 里有模板中不存在的键（幽灵字段）：${absent.join(' / ')}`)

  // 11 个必填键：模板加字段时这条会红，提醒同批回写 state.js —— 不许单边漂。
  assert.equal(REQUIRED_STATE_KEYS.length, 11)
})

test('缺字段就点名：少了哪个键就报哪个（不多报、不漏报）', () => {
  const template = readFileSync(TEMPLATE, 'utf8')
  const damaged = template.replace('档位', '位置').replace('红线摘要', '红线段')
  const verdict = parseState(damaged)

  assert.equal(verdict.present, true)
  assert.deepEqual(verdict.missing, ['档位', '红线摘要'])
})

test('空文件 / 读不到正文 = 全缺（present: false），不假装「齐备」', () => {
  for (const empty of ['', '   \n\n', undefined, null, 42, {}]) {
    const verdict = parseState(empty)
    assert.equal(verdict.present, false, `${String(empty)} 不算有正文`)
    assert.deepEqual(verdict.missing, REQUIRED_STATE_KEYS, '读不到就按最坏情况报全部缺失')
  }
})

test('子串判据容忍排版微调：小标题与列表行两种形态都认', () => {
  // 模板里「下一步」是小标题 `## 下一步`、「当前阶段」是列表行 `- 当前阶段：`：
  // 判据按子串匹配，改冒号 / 加空格 / 换全角冒号都不该误报。
  const listing = REQUIRED_STATE_KEYS.map((key) => `- ${key}：x`).join('\n')
  assert.deepEqual(parseState(listing).missing, [])
  assert.deepEqual(parseState(`## 下一步\n- 当前阶段: y`).missing.length, 9)
})
