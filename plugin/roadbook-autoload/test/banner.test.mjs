/**
 * 常驻微提示（system prompt section）的离线测试。
 *
 * 为什么单独一个文件：这段提示不走 agent/pre-step，也不注入任何 user message，
 * 它走的是 `ctx.get('systemPrompt').section(...)` 这条**可选服务**路径 —— 假 ctx 的形状
 * 与 index.test.mjs 不同（要多给 get / effect），混在一起会把两套接线模型搅在一个 helper 里。
 *
 * 宿主契约在 DSH 源码里核实过（`@deepseek-ai/dsh-system-prompt/lib/index.js`）：
 *   - `section()` 要求 order 有限，`text` 可以是 `(context) => string`，返回 disposer；
 *   - `SECTION_ORDERS` 里 PLAN_POLICY = 500、TEAM_POLICY = 600、PTC_ONLY = 800，故本段取 700；
 *   - `interpolate: false` 的段按字面量渲染，不解析 `{{变量}}`；
 *   - 渲染时 `text.length === 0` 的段被丢掉（Empty text contributes nothing）；
 *   - `assembleContextFor(agent, signal)` 返回 `{ agent, scope: agent }`，所以 provider 拿得到 agent。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

register('./dsh-stubs/hooks.mjs', import.meta.url)

const { apply, inject } = await import('../index.js')

const TMP = mkdtempSync(join(tmpdir(), 'roadbook-autoload-banner-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

/**
 * 与 index.js 里的 BANNER_TEXT 逐字一致。
 * 刻意重复一遍：这一段是「每一轮都在模型上下文里」的产品文案，改它必须同时在两边留下痕迹。
 */
const BANNER =
  '[roadbook] 本机装了 RoadBook 流程（路由 skills/roadbook/SKILL.md，卡片在 playbook/ 与 playbook_EN/）。涉及开发任务时按卡推进：红灯 = 停；「完成」= check.ps1 退出码 0 且粘贴真实输出；回执只认命令输出 / 文件路径 / 提交哈希。与本轮无关时忽略本段。要关掉：把插件行的 banner 设为 false。'

const readAll = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line))
    : []

const bannerLines = (file) => readAll(file).filter((entry) => entry.event === 'banner')

/**
 * 假 ctx：只实现本段接线用到的部分。
 * `withService: false` 模拟宿主里没有 systemPrompt 服务（旧版本 / 精简装配）；
 * `sectionThrows` 模拟注册被服务拒绝；`effect: false` 模拟老 ctx 没有 effect。
 */
const setup = ({ config = {}, name: reportName = 'banner.jsonl', withService = true, sectionThrows = false, effect = true } = {}) => {
  const sections = []
  const file = join(TMP, reportName)
  const ctx = {
    on: () => {},
    skills: { get: async () => undefined },
    logger: {},
    effect: effect ? (execute) => execute() : undefined,
    get: withService
      ? (service) =>
          service === 'systemPrompt'
            ? {
                section: (section) => {
                  if (sectionThrows) throw new Error('systemPrompt rejected the section')
                  sections.push(section)
                  return () => {}
                },
              }
            : undefined
      : undefined,
  }
  apply(ctx, { requireGitRoot: false, report: true, reportPath: file, ...config }, { home: TMP })
  return { sections, file }
}

test('常驻提示注册为 system prompt section：name / order 700 / interpolate: false', () => {
  const { sections, file } = setup()
  assert.equal(sections.length, 1, '必须注册恰好一段')
  const [section] = sections
  assert.equal(section.name, 'roadbook')
  assert.equal(section.order, 700, '700 落在 DSH 的 PLAN_POLICY(500) 与 PTC_ONLY(800) 之间')
  assert.equal(section.interpolate, false, '本段不接受 {{变量}} 插值')
  assert.equal(typeof section.text, 'function', 'text 是每个组装点都会调用的 provider')
})

test('注册结果只写一行观测：成功 registered / 服务不可用 unavailable', () => {
  const ok = setup({ name: 'banner-ok.jsonl' })
  const registered = bannerLines(ok.file)
  assert.equal(registered.length, 1, '只写一次')
  assert.equal(registered[0].state, 'registered')

  const missing = setup({ name: 'banner-missing.jsonl', withService: false })
  const unavailable = bannerLines(missing.file)
  assert.equal(unavailable.length, 1)
  assert.equal(unavailable[0].state, 'unavailable')
  assert.deepEqual(missing.sections, [], '服务不在就不注册，但整行插件照常工作')
  assert.deepEqual(inject, ['agents', 'skills'], 'systemPrompt 不许加进 inject：服务缺失会把整行打成「未运行」')
})

test('注册抛错只写观测、不上抛', () => {
  const { sections, file } = setup({ name: 'banner-error.jsonl', sectionThrows: true })
  assert.deepEqual(sections, [])
  const lines = bannerLines(file)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].state, 'error')
  assert.match(lines[0].message, /systemPrompt rejected the section/)
})

test('没有 ctx.effect 时直接注册（老宿主也不许整段消失）', () => {
  const { sections, file } = setup({ name: 'banner-no-effect.jsonl', effect: false })
  assert.equal(sections.length, 1)
  assert.equal(bannerLines(file)[0].state, 'registered')
})

test('文案逐字固定，且只在读得到 cwd 时贡献内容', () => {
  const { sections } = setup({ name: 'banner-text.jsonl' })
  const { text } = sections[0]

  assert.equal(text({ agent: { session: { header: { cwd: TMP } } } }), BANNER)
  // 读不到 cwd 一律返回空串 =「本条不贡献任何内容」（保守：宁可少一段，也不给错坐标）。
  assert.equal(text({}), '')
  assert.equal(text(undefined), '')
  assert.equal(text(null), '')
  assert.equal(text({ agent: {} }), '')
  assert.equal(text({ agent: { session: {} } }), '')
  assert.equal(text({ agent: { session: { header: {} } } }), '')
  assert.equal(text({ agent: { session: { header: { cwd: '' } } } }), '')
  assert.equal(text({ agent: { session: { header: { cwd: 42 } } } }), '')
})

test('requireGitRoot：项目外不显示，项目内显示，家目录自身不算项目', () => {
  const project = join(TMP, 'banner-project')
  const plain = join(TMP, 'banner-plain')
  mkdirSync(join(project, '.git'), { recursive: true })
  mkdirSync(plain, { recursive: true })

  const { sections } = setup({ name: 'banner-git.jsonl', config: { requireGitRoot: true } })
  const { text } = sections[0]

  assert.equal(text({ agent: { session: { header: { cwd: project } } } }), BANNER)
  assert.equal(text({ agent: { session: { header: { cwd: plain } } } }), '', '项目外不显示')

  // 家目录自身是 git 仓库（dotfiles）时同样不显示：与 pre-step 的 git 门控同一口径。
  mkdirSync(join(TMP, '.git'), { recursive: true })
  assert.equal(text({ agent: { session: { header: { cwd: TMP } } } }), '')
})

test('banner: false 与 mode: off 都让本段不贡献内容', () => {
  const off = setup({ name: 'banner-off.jsonl', config: { banner: false } })
  assert.equal(off.sections[0].text({ agent: { session: { header: { cwd: TMP } } } }), '')
  assert.equal(bannerLines(off.file)[0].state, 'registered', '关掉文案不等于不注册：注册与否只由服务可用性决定')

  const modeOff = setup({ name: 'banner-mode-off.jsonl', config: { mode: 'off' } })
  assert.equal(modeOff.sections[0].text({ agent: { session: { header: { cwd: TMP } } } }), '')

  const on = setup({ name: 'banner-on.jsonl' })
  assert.equal(on.sections[0].text({ agent: { session: { header: { cwd: TMP } } } }), BANNER)
})
