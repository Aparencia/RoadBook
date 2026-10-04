# 更新日志（roadbook-atlas）

版本号只有一处事实源：`package.json` 的 `version`。客户端半的 `PLUGIN_VERSION`（页脚显示）与宿主半的
`pluginVersion()`（启动日志）都必须与它一致 —— `test/client-contract.test.mjs` 会逐字核对，漏改即判红。

**升版规则**（agent 只提议，人裁决）：

| 改了什么 | 升哪一位 | 例子 |
| :--- | :--- | :--- |
| 加能力（新图类型、新标签页动作、新 CLI 命令、新设置项） | 次版本 `0.x.0` | 给图册加「导出 PNG」→ 0.2.0 |
| 修 bug、改文案、改文档措辞 | 修订号 `0.1.x` | 修预览遮罩 → 0.1.1 |
| 改目录约定 / 回执 schema / 命令参数（已装用户需要动作） | 次版本 + 迁移说明 | 回执加字段 → 0.2.0 |

一次升版动四处：`package.json` 的 `version`、`lib/client.js` 顶部 `PLUGIN_VERSION`、本文件顶部加一节、
`git tag`（**由人打**，agent 不打 tag）。改完跑：

```bash
cd plugin/roadbook-atlas && node --test "test/*.test.mjs"
```

## [0.1.0] - 2026-10-04

首发（提交 `bbf2fe4`）。此前的 0.1.0 只存在于本地挂载的未提交状态，没有对外发布过。

- **宿主半**：`cordis.patch.yml` 挂 `@deepseek-ai/dsh-skill-filesystem` 分发 skill（`bundledSkillDir` 按 npm 身份解析）；`apply()` 就绪自检缺件只警告不抛错。
- **客户端半**：手写 ModuleLoader bundle（一次 `load`、只 `require("react")`），注册 `roadbook-atlas:gallery`「图册」标签页 —— 列表 + 内嵌预览 + 打开 / 导出 / 引用规格 / 复制路径，目录走设置 `pluginToggles.dir`（默认 `docs/diagrams`），页脚显示版本。
- **skill + CLI**：`skills/roadbook-atlas/bin/atlas.mjs` 提供 `render / validate / list / new / guide / doctor`，退出码 0 成功、1 渲染或环境失败、2 用法错误；渲染成功才写 `docs/diagrams/<slug>.receipt.json`（schema `roadbook-atlas/receipt@1`，规格与产物双 SHA-256 + 校验计数）。
- **渲染器**：`tt-a1i/archify` v2.14.0（MIT）vendored 到 `skills/roadbook-atlas/vendor/archify/`，只 spawn 不 import（上游 CLI 零 export），来源与逐文件哈希见 `VENDOR-PROVENANCE.md`。
- **测试**：`node --test "test/*.test.mjs"` 9 项（CLI 端到端 3 + 客户端契约 5 + 渲染冒烟 1），含项目根陷阱与版本一致性的回归守卫。
