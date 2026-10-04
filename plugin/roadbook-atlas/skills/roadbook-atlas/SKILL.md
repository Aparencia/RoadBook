---
name: roadbook-atlas
description: 把 typed JSON 规格渲染成自包含交互式 HTML 图纸（架构 / 流程 / 时序 / 数据流 / 状态机五类），落进项目图纸目录并产出可核对的回执；成品在 better-sidebar 的「图册」标签页里预览、打开、导出。用户说「画一张架构图 / 流程图 / 时序图 / 数据流图 / 状态机」「把这条链路画出来」「把系统结构画成一张图」时使用。渲染器随包 vendored，不依赖外部安装。
license: MIT
---

# Roadbook Atlas（路书·图册）

把一段结构画成**一张能点、能缩放、能导出**的 HTML 图纸：规格是 JSON（事实源），HTML 是渲染产物，回执是可核对的证据。

## 0. 资源在哪（下文的 `<skill>` 就是本次会话告诉你的 skill base directory）

| 路径 | 是什么 |
| --- | --- |
| `<skill>/bin/atlas.mjs` | Roadbook 工作台 CLI：`render` / `validate` / `list` / `new` / `guide` / `doctor` |
| `<skill>/vendor/archify/` | vendored 渲染器（上游 tt-a1i/archify，MIT）。**只读，不许改** |
| `<skill>/vendor/archify/SKILL.md` | 完整字段契约与作者铁律（写规格前必读） |
| `<skill>/vendor/archify/references/authoring-contract.md` | 组件/关系/边距/标签的细则 |
| `<skill>/vendor/archify/examples/` | 12 份可直接跑的示例规格（五类各 1–3 份） |

本技能不启动任何服务器、不下载任何东西：渲染全程离线。

## 1. 五类图怎么选

| 类型 | 什么时候用 | 典型场景 |
| --- | --- | --- |
| `architecture` | 系统由哪些部件组成、谁调用谁、边界在哪 | 服务拓扑、模块划分、云与安全边界 |
| `workflow` | 一件事按步骤走，中间有审批/门禁/工具调用 | 发布流程、Runbook、CI/CD、审批链 |
| `sequence` | 一次请求在多个角色间来回的时序 | API 调用链、请求生命周期、异步往返 |
| `dataflow` | 数据从哪来、经过什么、落到哪 | ETL/ELT 管道、血缘、治理与脱敏 |
| `lifecycle` | 一个对象的状态与迁移，含重试与终态 | 状态机、任务状态、重试与超时 |

拿不准就先问渲染器：`node "<skill>/vendor/archify/bin/archify.mjs" guide "<你的场景>" --json`。

## 2. 标准流程（五步，别跳）

1. **判类型**：按上表选定一种；一个场景只画一条明显主路径。
2. **拿骨架**（可选但省事）：
   `node "<skill>/bin/atlas.mjs" new architecture <slug> --title "<标题>"`
   它从随包示例拷一份可跑的规格到图纸目录，改 `meta.title` 与组件即可。
3. **写规格**：落在项目图纸目录（默认 `docs/diagrams/`），文件名 `<slug>.atlas.json`。
   顶层至少要有 `schema_version`、`diagram_type`、`meta.title`；组件、关系、边界、视图的字段与铁律见 `<skill>/vendor/archify/SKILL.md`。改动面小于一半时改现有规格，不要另起一份平行图纸。
4. **渲染**：`node "<skill>/bin/atlas.mjs" render "docs/diagrams/<slug>.atlas.json"`
   同一目录产出 `<slug>.html`（自包含）与 `<slug>.receipt.json`（回执）。
   **退出码 0 才算完成**；非 0 时按打印出的 errors 逐条修规格再重跑。
5. **交付**：把命令打印的「图纸 / 规格 / 回执」三行原样贴给用户，并说明图类型与校验计数（`errors` / `warnings`）。

## 3. 硬规则

- **非 0 退出码永远不许描述成成功**；失败时说清哪一条校验没过。
- 不许改 `<skill>/vendor/**`：那是上游代码，升级时整目录替换；要改行为就改 CLI 或规格。
- **规格是事实源**，HTML 是产物：不要手改 HTML，也不要只留 HTML 不留规格（那样下次没人能重新生成）。
- 一张图一条主路径、主节点 ≤12 个；关系标签是语义数据，碰撞时先调路由与标签位置，删词是最后手段。
- 交付前必须真跑一次第 4 步；引用校验计数就引用真实输出，不要凭印象写。
- 图纸目录默认 `docs/diagrams/`，用户可在「设置 → 侧边卡片 → 图册」里改；不要硬编码别的路径。
- 侧边栏「图册」标签页是只读的浏览面：预览、打开、导出。生成永远走 CLI。
- 本技能不替用户做裁决：图纸要不要进文档、挂到哪一节，问用户。

## 4. 常用命令（把 `<skill>` 换成真实绝对路径；一律正斜杠）

```bash
node "<skill>/bin/atlas.mjs" doctor                                              # 环境自检：渲染器在位、版本、示例数
node "<skill>/bin/atlas.mjs" new architecture payment-flow --title "支付主链路"   # 拷一份可跑骨架
node "<skill>/bin/atlas.mjs" render "docs/diagrams/payment-flow.atlas.json"      # 渲染 + 写回执（验收命令）
node "<skill>/bin/atlas.mjs" validate "docs/diagrams/payment-flow.atlas.json" --json
node "<skill>/bin/atlas.mjs" list --json                                         # 图纸清单与状态，给侧边栏/脚本用
```

`render` 加 `--json` 会把回执 JSON 打到标准输出；`--quality standard` 可降到宽松档（默认 `showcase`，9 项检查全过才通过）。

## 5. 出错了怎么办

| 症状 | 处理 |
| --- | --- |
| `找不到 vendored 渲染器` | 插件安装不完整：`<skill>/vendor/archify/bin/archify.mjs` 必须在位 |
| 校验失败（exit 1） | 按 stdout 里的 errors 逐条改规格；常见是节点超 12 个、边穿过不透明节点、标签重叠 |
| `规格里没有 diagram_type` | 在规格顶层补 `"diagram_type": "<五类之一>"` |
| 图纸画出来太空/太挤 | 回第 2 步读 `references/authoring-contract.md` 的间距与净空一节 |
| 需要「视觉复核」截图 | 本技能不做截图复核；用户在侧边栏「图册」里目视即是最直接的复核 |
