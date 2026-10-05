/**
 * Team 消费层的离线测试（`team.js` 不 import 任何 dsh 包，直接 `node --test` 就能跑）。
 *
 * 这一层的存在理由：用户裁决「Agent Team 未挂载时开关不可设置」由**装配层**实现
 * （`cordis.patch.yml` 的 `roadbook-team` 行带 `disabled: !!js "!ctx.get('agentTeams')"`）。
 * 插件这边只做**解释**，所以测试盯的是「解释得对不对」——尤其是两个不许静默的方向：
 *   ① 形状不合格必须**响亮降级**，不许当成「可用」；
 *   ② 只有明确读到 `policy: off` 才允许拦 Team 工具，读不到一律 fail-open。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEAM_POLICIES, TEAM_UNMOUNTED_NOTE, resolveTeamPolicy } from '../team.js'

/** roadbook-team 行真正的服务面（`plugin/roadbook-team/index.js` 的 face）。 */
const face = (over = {}) => ({ policy: 'follow', available: true, row: 'roadbook-team', ...over })

// ── 三态：未注入 / 注入正常 / 注入对象缺字段 ──────────────────────────────

test('Team 三态之一：服务没注入 = 未挂载（单线程走，且不拦 Team 工具）', () => {
  for (const input of [{}, { service: undefined }, { service: null }]) {
    const verdict = resolveTeamPolicy(input)
    assert.equal(verdict.state, 'unmounted')
    assert.equal(verdict.active, false, '未挂载 = 本轮单线程')
    assert.equal(verdict.blocked, false, '未挂载不是「不允许」：工具根本不存在，不该由这里判')
    assert.equal(verdict.note, TEAM_UNMOUNTED_NOTE, '回执措辞固定，便于按行读观测')
  }
})

test('Team 三态之二：服务注入正常——follow 可用；off 装了不用（唯一会拦的一态）', () => {
  const follow = resolveTeamPolicy({ service: face() })
  assert.equal(follow.state, 'follow')
  assert.equal(follow.active, true)
  assert.equal(follow.blocked, false)

  const off = resolveTeamPolicy({ service: face({ policy: 'off' }) })
  assert.equal(off.state, 'off')
  assert.equal(off.active, false, 'off = 装了不用')
  assert.equal(off.blocked, true, 'off 是唯一会拦 Team 工具的策略（用户显式选择）')

  // 生产路径：策略只来自服务面（roadbook-team 行的 policy），本插件配置里没有 team 旋钮。
  assert.equal(resolveTeamPolicy({ service: face({ policy: 'off' }) }).state, 'off')
  assert.equal(resolveTeamPolicy({ service: face(), policy: 'off' }).state, 'off', '显式 policy 覆盖服务面（测试/将来覆盖用）')
})

test('Team 三态之三：注入对象缺字段 = 响亮降级（不当可用，也不拿猜的结论拦人）', () => {
  for (const service of [{ available: true, row: 'roadbook-team' }, {}, { policy: undefined }, { policy: 42 }, { policy: 'maybe' }]) {
    const verdict = resolveTeamPolicy({ service })
    assert.equal(verdict.state, 'degraded', `形状不合格必须降级：${JSON.stringify(service)}`)
    assert.equal(verdict.active, false, '读不到策略 ≠ 可用')
    assert.equal(verdict.blocked, false, '读不到策略 ≠ 拒绝：fail-open，不挡用户正常协作')
    assert.match(verdict.note, /降级为单线程/)
    assert.match(verdict.note, /roadbook-team/, '说明要指向根因（哪一行提供的面）')
  }

  // 注进来的根本不是对象（老宿主 / 提供方写错）：同样降级，且不许抛。
  for (const service of ['roadbook-team', 42, true, [], () => {}]) {
    const verdict = resolveTeamPolicy({ service })
    assert.equal(verdict.state, 'degraded')
    assert.equal(verdict.blocked, false)
  }
})

test('服务在但宿主没有 agentTeams（有人绕过装配层的门手工挂载）：如实降级，不假装可用', () => {
  const verdict = resolveTeamPolicy({ service: face({ available: false }) })
  assert.equal(verdict.state, 'unavailable')
  assert.equal(verdict.active, false)
  assert.equal(verdict.blocked, false, 'available=false 是「探针读不到」，不是用户说的 off')
  assert.match(verdict.note, /agentTeams/)
})

test('字典与常量对外可见：follow / off 两个取值，两处拼法必须一致', () => {
  assert.deepEqual(TEAM_POLICIES, ['follow', 'off'])
  assert.equal(typeof TEAM_UNMOUNTED_NOTE, 'string')
  assert.ok(TEAM_UNMOUNTED_NOTE.includes('单线程'))
})
