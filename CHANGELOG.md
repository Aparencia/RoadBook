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
