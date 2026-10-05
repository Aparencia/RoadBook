# 更新日志（roadbook 主插件）

版本号只有一处事实源：根 `package.json` 的 `version`。客户端半的 `PLUGIN_VERSION`（标签页页脚显示）与
宿主半的 `pluginVersion()`（启动日志）都必须与它一致 —— `test/client-contract.test.mjs` 会逐字核对，漏改即判红。

**升版规则**（agent 只提议，人裁决）：

| 改了什么 | 升哪一位 | 例子 |
| :--- | :--- | :--- |
| 加能力（新子行、新图类型、新标签页动作、新 CLI 命令、新设置项） | 次版本 `0.x.0` | 给图册加「导出 PNG」→ 0.3.0 |
| 修 bug、改文案、改文档措辞 | 修订号 `0.2.x` | 修预览遮罩 → 0.2.1 |
| 改目录约定 / 回执 schema / 命令参数 / Loader 行 id（已装用户需要动作） | 次版本 + 迁移说明 | 回执加字段 → 0.3.0 |

一次升版动四处：根 `package.json` 的 `version`、`lib/client.js` 顶部 `PLUGIN_VERSION`、本文件顶部加一节、
`git tag`（**由人打**，agent 不打 tag）。改完从仓库根跑：

```bash
node --test "test/*.test.mjs" && node --test "plugin/roadbook-autoload/test/*.test.mjs"
```

## [0.2.3] - 2026-10-04

**客户端半把 DSH 启动搞挂的缺陷**（用户实机报「应用无法启动或已意外停止 / web boot: 1 entry did not activate / roadbook: failed」）：DSH 的 web boot 把「任一客户端条目未激活」判成致命错误并拒绝启动（客户端半 `eM()` 收集所有非 active 条目后直接 `throw`），而 better-sidebar 的 `registerTab` 对重复 id 是**直接 throw**（`lib/client-registry.js`：`if (tabs.has(descriptor.id)) throw new Error('... already registered')`）—— 于是「同一 bundle 被 Loader 实例化两次」或「热重载后上一代注册仍在注册表里」都会让 roadbook 从「一个标签页没出来」升级成「整个应用起不来」。客户端半没有这种权力，三处收口：① 注册前先查 `service.getTabs()` 有没有同 id、以及模块级 `registered` 标记（本页面已注册）→ 命中即跳过；② `ctx.effect(register)` 包 try/catch，失败只留一条警告（`ctx.logger.warn`，退化为 `console.warn`），**绝不上抛**；③ effect 撤销时把标记复位，热更新后仍能重新注册。
**测试**：`test/client-contract.test.mjs` 新增 4 例（重复 id 抛错不向外抛 / 同页面 apply 两次只注册一次 / 服务里已有同 id 则跳过不调用 registerTab / disposer 撤销后能重新注册）。

## [0.2.2] - 2026-10-04

**装出来的副本不再误报缺件**（0.2.1 装机验证时发现）：主行的就绪自检把根 `SKILL.md` 也算成「随包文件」，而它**不在** `package.json` 的 `files` 白名单里 —— git / npm 安装（插件面板「Git 地址」走的就是这条路）只分发白名单内的文件，于是每一份装出来的副本都会打一条
`roadbook v0.2.1: 缺少随包文件（相关能力会不可用）：SKILL.md` 并**提前 return**，把真正的 `ready` 日志吞掉。运行时要的是 `skills/roadbook/SKILL.md`（镜像，随 `skills/` 分发）—— 自检列表改为只列运行时真正需要的文件。

## [0.2.1] - 2026-10-04

**两个面板问题**（用户看插件面板后报的）——都修在结构上，不靠修饰显示：

- **子行改为平铺**：0.2.0 用一条 `group` 容器行 `roadbook-bundle` 挂四个子行。容器行自己**没有 fiber**，宿主的 `readPluginInventory` 又 `if (entry.options.group) continue` 跳过 group 行 —— 面板只能照 `cordis.patch.yml` 的字面把它显示成「已关闭」，看上去像整个主插件被关掉。现在 `- insert:` 下平铺四条顶层行；`lib/bundle.js` 与 `exports` 的 `./bundle` 一并删除。代价明说：**没有「关一行连停四行」的祖先门**了，四行各自开关。
- **`roadbook-autoload` 从「未运行」修活**：入口静态 import 三个宿主包（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/schemastery`），而插件通常按 `link:` / 本地绝对路径安装 —— 宿主的解析拦截层只对「manifest 里 `peerDependencies` 声明过该名字」的链接根生效，于是这三个 import 解析失败；cordis loader 的 `_init()` 对 import 失败**只写一条 `logger.error` 然后 return**（`entry.fiber` 不赋值），面板上就只剩「未运行」。现在三管齐下：① 宿主包改**守卫式动态 import** + 新增 `host-fallback.js`（`createUserMessage` / `isUserInvocable` / `renderSkillContent` 的本地等价实现），解析不到时降级运行，并把失败原因写进日志与观测文件；② 三个宿主包补进根 `package.json` 的 `peerDependencies`（`optional: true`），让宿主在 `link:` 安装下也做拦截注入；③ `apply()` 往观测文件写一行 `{"event":"loaded"}` 就绪回执 —— 面板之外的「本行真的跑起来了」自证（默认 `<tmpdir>/roadbook-autoload.jsonl`）。
- **测试**：根 `test/` 16 项（`umbrella-contract.test.mjs` 换平铺断言、并**真的 import** autoload 子行）、`plugin/roadbook-autoload/test/` 37 项（新增 `host-fallback.test.mjs` 3 项 + 就绪回执 1 项）；`_qc/check.ps1` 308 项全绿。

## [0.2.0] - 2026-10-04

**主插件化**：仓库根成为 DSH 组合包 `roadbook`；原来两个独立插件变成它的子插件，每个子行仍可在插件面板里单独开关。

- **主插件（仓库根）**：根 `package.json`（`dsh.bundle.patch` + `dsh.client` + `exports` 的 `./bundle`、`./autoload`、`./atlas`）与根 `cordis.patch.yml` —— 一条 group 行 `roadbook-bundle` 挂四个子行：`roadbook`（主行，`lib/index.js`：版本号 + 随包文件就绪自检）、`roadbook-skills`（`@deepseek-ai/dsh-skill-filesystem`，`bundledSkillDir` 按 `roadbook/package.json` 的 npm 身份解析到包内 `skills/`）、`roadbook-autoload`（模块 `roadbook/autoload`）、`roadbook-atlas`（模块 `roadbook/atlas`）。group 行的 `disabled` 读主行自身的开关 ⇒ 关主行 = 四个子行一起停。
- **技能上移**：`skills/roadbook/SKILL.md`（根 `SKILL.md` 的逐字节镜像，`test/skill-mirror.test.mjs` 守卫）与 `skills/roadbook-atlas/`（原 `plugin/roadbook-atlas/skills/`）—— 一个 provider 行同时分发两个技能。
- **客户端半上移**：`lib/client.js`（原 `plugin/roadbook-atlas/lib/client.js`），ModuleLoader id 改 `roadbook`，标签页 id 改 `roadbook:gallery`，页脚显示伞包版本。
- **子插件半**：`plugin/roadbook-autoload/` 保持可单独安装（自带组合包 patch；与主插件同时装时只留一行）；`plugin/roadbook-atlas/` 变成纯宿主半（组合包 patch 撤下、技能与客户端半上移），**不再单独安装**。
- **测试**：根 `test/` 三个文件 9 项（从 `plugin/roadbook-atlas/test/` 上移并改相对路径）。

## [0.1.0] - 2026-10-04

首个可安装形态（提交 `bbf2fe4`；此前只存在于本地挂载、未提交的状态）。当时是独立插件 `roadbook-atlas`：一条 skill provider 行 + 手写 ModuleLoader 客户端半注册 `roadbook-atlas:gallery`「图册」标签页 + `skills/roadbook-atlas/` 下的 CLI 与 vendored 渲染器（`tt-a1i/archify` v2.14.0，MIT）。

- **skill + CLI**：`bin/atlas.mjs` 提供 `render / validate / list / new / guide / doctor`，退出码 0 成功、1 渲染或环境失败、2 用法错误；渲染成功才写 `docs/diagrams/<slug>.receipt.json`（schema `roadbook-atlas/receipt@1`，规格与产物双 SHA-256 + 校验计数）。
- **渲染器**：vendored 到 `skills/roadbook-atlas/vendor/archify/`，只 spawn 不 import（上游 CLI 零 export），来源与逐文件哈希见 `VENDOR-PROVENANCE.md`。
