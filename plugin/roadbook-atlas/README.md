# Roadbook Atlas（路书·图册）· 主插件的图纸子插件

把一份小型 typed JSON 规格渲染成**自包含的交互式 HTML 图纸**，并在 better-sidebar 的原生「图册」标签页里浏览、预览、打开、导出。

它是主插件 [`roadbook`](../../README.md) 的**子插件** —— 装主插件即得到本能力，**本目录不能单独安装**：

| 部分 | 落点 | 说明 |
|---|---|---|
| 宿主半 | `plugin/roadbook-atlas/lib/index.js` | Loader 行 `roadbook/atlas`：一条就绪日志 + 「技能根在哪」的算法 |
| 客户端半 | `lib/client.js`（伞包根） | 向 better-sidebar 注册原生标签页 `roadbook:gallery` |
| 技能与 CLI | `skills/roadbook-atlas/`（伞包根） | `SKILL.md` + `bin/atlas.mjs` + `vendor/archify/` 渲染器 |
| 契约 | 规格是唯一事实源，图纸与回执是派生物 | CLI 非 0 退出**永远不许**被描述成成功 |

## 安装与开关

安装只有一条路：**装主插件**（DSH 侧栏「插件」→「添加插件」→ Git 地址填本仓库根，或本地绝对路径指向仓库根）——根 `package.json` 声明了组合包，装完在插件面板里能看到四个子行。

关掉本子插件有三种粒度，都在插件面板或 profile 里，不需要改本目录：

| 想停掉什么 | 在哪里 | 怎么改 |
|---|---|---|
| 图纸能力（宿主半 + 标签页） | 插件面板里的 `roadbook-atlas` 行 | 关掉该行；或 profile 的 `cordis.patch.yml` 写 `- id: roadbook-atlas` + `disabled: true` |
| 只停标签页、留 CLI 与技能 | DSH 设置 → 侧边卡片 → 图册 | 关掉标签页开关 |
| 技能分发 | 插件面板里的 `roadbook-skills` 行 | 关掉该行（`roadbook` 与 `roadbook-atlas` 两个技能一起停） |

## agent 怎么用（skill 契约）

```bash
# 在项目根执行；默认目录 docs/diagrams（可在设置页改）
node skills/roadbook-atlas/bin/atlas.mjs new architecture payment-flow --title "支付链路"
# 编辑 docs/diagrams/payment-flow.atlas.json 后：
node skills/roadbook-atlas/bin/atlas.mjs render docs/diagrams/payment-flow.atlas.json
node skills/roadbook-atlas/bin/atlas.mjs list --json
node skills/roadbook-atlas/bin/atlas.mjs doctor
```

退出码：`0` 成功 ／ `1` 渲染或校验失败、环境缺件 ／ `2` 用法错误。五种图类型：`architecture`、`workflow`、`sequence`、`dataflow`、`lifecycle`。

## 目录约定（每个图纸三个文件）

| 文件 | 角色 |
|---|---|
| `<slug>.atlas.json` | **规格**，人写（或 `atlas new` 生成骨架）；唯一事实源 |
| `<slug>.html` | **图纸**，自包含交互式 HTML（主题切换、缩放、搜索、导出都在里面） |
| `<slug>.receipt.json` | **回执**，`schema: roadbook-atlas/receipt@1`，记录规格/图纸的 SHA-256 与字节数、校验计数、渲染器版本、时间 |

缺图纸 ⇒ `status: spec-only`；缺规格 ⇒ `status: orphan`。图册标签页只读这些文件，不写。

## 渲染器边界

`skills/roadbook-atlas/vendor/archify/` 是上游 [tt-a1i/archify](https://github.com/tt-a1i/archify)（MIT）的 vendor 副本，**只读**：

- 清单与 SHA-256：`skills/roadbook-atlas/VENDOR-PROVENANCE.md`（58 文件 / 1,657,356 B；只排除 5 个预渲染 HTML 演示，保留 13 份 JSON 夹具）。
- 升级 = 整目录替换，然后从仓库根跑 `node --test "test/*.test.mjs"` 复验。
- 上游没有可 import 的渲染 API（`bin/archify.mjs` 零 export），所以 CLI 用 `spawnSync` 调 `deliver --json`，路径从自己模块位置解析。

## 开发与验收

```bash
cd <仓库根>
node --test "test/*.test.mjs"                          # 9 项：CLI 端到端 3 + 契约 5 + 渲染冒烟 1（内含 5 类渲染）
node --test "plugin/roadbook-autoload/test/*.test.mjs" # 自动加载子插件的离线测试
```

- `test/atlas-cli.test.mjs`：退出码纪律 + **项目根陷阱回归守卫**（本机 `%TEMP%` 里有游离 `.git`，`git rev-parse` 会把图纸写到项目外；CLI 拒绝家目录/临时目录做根，退回 cwd）。
- `test/client-contract.test.mjs`：在 `vm` 里跑客户端 bundle，校验 ModuleLoader 形状、`ctx.effect` 注册、标签页根节点高度契约、双语。
- `test/render-smoke.test.mjs`：五类各渲染一次，断言 9/9 校验通过、`showcase:pass`、三次运行同 SHA-256。

## 版本

伞包根 `package.json` 的 `version` 是**唯一事实源**（当前 `0.2.0`）：客户端半的 `PLUGIN_VERSION`（标签页页脚显示它）
与宿主半的 `pluginVersion()`（启动日志里的 `roadbook v0.2.0: ready`）由测试强制与它一致，漏改即判红。
升版规则（加能力 → 次版本，修 bug → 修订号）与逐版本记录见仓库根的 [`CHANGELOG.md`](../../CHANGELOG.md)。
