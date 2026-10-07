/**
 * 宿主包兜底 —— 「缺宿主包不许整行插件静默变成未运行」的回归守卫。
 *
 * 这个文件**故意不注册 `test/dsh-stubs/hooks.mjs`**：它跑的就是「裸 Node 直接 import 插件入口」
 * 的场景 —— 三个 `@deepseek-ai/*` 都解析不到，入口模块必须仍然加载成功并退回 ./host-fallback.js。
 * 反面教材（2026-10-04 实测）：入口里静态 import 宿主包，解析不到时 loader 的 `Entry._init()`
 * 只写一条 `logger.error` 然后 `return`，`entry.fiber` 不赋值 ⇒ 插件面板上只显示「未运行」，
 * 看不出是缺包、缺文件还是版本不符。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 从入口出发的**静态相对 import 闭包**（只看 `from './x.js'` 与副作用 `import './x.js'`）。
 * 动态 `import(变量)` 不算 —— 宿主包走的正是动态解析，那才是本文件要护的形状。
 */
function staticClosure(entry) {
  const found = []
  const queue = [entry]
  while (queue.length > 0) {
    const current = queue.shift()
    const path = fileURLToPath(current)
    if (found.includes(path)) continue
    found.push(path)
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]|(?:^|[\r\n;])\s*import\s+['"](\.[^'"]+)['"]/g)) {
      const target = new URL(match[1] ?? match[2], current)
      if (existsSync(fileURLToPath(target))) queue.push(target)
    }
  }
  return found
}

test('入口模块在缺宿主包时仍可加载：导出面齐全，且逐个记录兜底原因', async () => {
  const plugin = await import('../index.js')
  assert.equal(plugin.name, 'roadbook-autoload')
  assert.deepEqual(plugin.inject, ['agents', 'skills'])
  assert.equal(typeof plugin.apply, 'function')
  assert.equal(
    plugin.Config,
    undefined,
    '拿不到 schemastery 时 Config 必须是 undefined（行配置原样透传），不能抛错',
  )
  assert.deepEqual(
    plugin.hostFallbacks.map((host) => host.specifier).sort(),
    ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-skill', '@deepseek-ai/schemastery'],
    '裸 Node 下三个宿主包都该走兜底',
  )
  for (const host of plugin.hostFallbacks) {
    assert.match(host.error, /Cannot find package/i, `${host.specifier} 的失败原因要留住（要能报到日志与观测文件）`)
    assert.equal(host.replacement, './host-fallback.js')
  }
})

test('入口模块不许再静态 import 宿主包（那正是「未运行」的成因）', () => {
  // 判据跟着**静态 import 闭包**走，不钉死单个文件：2026-10-07 批 6 按 D14 把入口拆成
  // 入口 + 六个分层文件，宿主包解析搬进了 autoload-host.js —— 这条守卫要问的是「整行插件里
  // 有没有静态 import 宿主包」，钉死 index.js 的话，搬家之后它就变成一句空话（实际也真红了）。
  const joined = staticClosure(new URL('../index.js', import.meta.url))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  assert.doesNotMatch(joined, /^import[^\n]*from '@deepseek-ai\//m, '宿主包必须走守卫式解析')
  assert.match(joined, /loadHostPackage/, '守卫式解析函数必须在位')
  assert.match(joined, /host-fallback\.js/, '兜底实现必须被引用')
  assert.match(joined, /hostFallbacks/, '兜底原因必须对外可见（apply() 写日志与观测文件）')
})

test('兜底实现与宿主同形状：技能正文标记 / 可调用判据 / 消息 id 与冻结', async () => {
  const fallback = await import('../host-fallback.js')

  assert.equal(
    fallback.renderSkillContent({ name: 'roadbook', provider: 'roadbook-plugin', content: 'BODY' }),
    [
      '<skill_content name="roadbook">',
      '<skill_resources>',
      'Resources for this skill are managed by provider "roadbook-plugin".',
      'Load referenced resources only as needed.',
      '</skill_resources>',
      '',
      '<skill_instructions>',
      'BODY',
      '</skill_instructions>',
      '</skill_content>',
    ].join('\n'),
  )
  assert.match(
    fallback.renderSkillContent({ name: 'x', content: 'C', base: { kind: 'directory', path: 'D:/a&b' } }),
    /Base directory for this skill: D:\/a&amp;b/,
  )
  assert.match(
    fallback.renderSkillContent({ name: 'x', content: 'C', base: { kind: 'url', url: 'https://e/?a=1&b=2' } }),
    /Base URL for this skill: https:\/\/e\/\?a=1&amp;b=2/,
  )
  assert.match(
    fallback.renderSkillContent({ name: 'x', content: 'C', base: { kind: 'opaque', description: 'desc' } }),
    /Resources for this skill: desc/,
  )
  assert.match(fallback.renderSkillContent({ name: 'A&B"C<D', content: 'C' }), /^<skill_content name="A&amp;B&quot;C&lt;D">/)

  assert.equal(fallback.isUserInvocable({ invocation: { userInvocable: true } }), true)
  assert.equal(fallback.isUserInvocable({ invocation: { userInvocable: false } }), false)
  assert.equal(fallback.isUserInvocable({}), false)
  assert.equal(fallback.isUserInvocable(undefined), false)

  const message = fallback.createUserMessage({ content: 'c', source: { kind: 'skill-invocation', name: 'roadbook' } })
  assert.equal(message.role, 'user')
  assert.equal(message.content, 'c')
  assert.equal(message.source.kind, 'skill-invocation')
  assert.match(message.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, '每条消息都要有新 id')
  assert.ok(Object.isFrozen(message), '与宿主一致：消息是深冻结的')
})
