/**
 * 根 `SKILL.md` 与伞包镜像 `skills/roadbook/SKILL.md` 必须逐字节一致。
 *
 * 为什么必须有两份：DSH 的 skill 发现只认 `<root>/<name>/SKILL.md`（不递归、不接受根本身就是 skill），
 * 所以插件要分发流程技能，镜像必须落在 `skills/roadbook/`；而根 `SKILL.md` 是母版给人看的入口，
 * 也是 `_qc/check.ps1` 断言的对象。两份一分叉，agent 加载到的正文就不是母版正文了。
 * 守卫方式：逐字节比对 + 锁住 frontmatter 的 name（路由键改名会让 `/roadbook` 手势失效）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT_SKILL = new URL('../SKILL.md', import.meta.url);
const MIRROR = new URL('../skills/roadbook/SKILL.md', import.meta.url);

test('skills/roadbook/SKILL.md 是根 SKILL.md 的逐字节镜像', () => {
  const root = readFileSync(ROOT_SKILL);
  const mirror = readFileSync(MIRROR);
  assert.ok(root.length > 1000, '根 SKILL.md 不该是空文件');
  assert.equal(
    mirror.equals(root),
    true,
    '镜像与根 SKILL.md 不一致：改完根 SKILL.md 后执行 cp SKILL.md skills/roadbook/SKILL.md',
  );
});

test('镜像的 frontmatter 首行严格为 ---、name 为 roadbook（路由键不能被改名）', () => {
  const text = readFileSync(MIRROR, 'utf8');
  assert.ok(text.startsWith('---\n'), 'frontmatter 首行必须严格是 ---（前面有 BOM 或空行会被 DSH 静默忽略）');
  assert.match(text, /^name: roadbook$/m);
  assert.match(text, /^description: \S/m);
});
