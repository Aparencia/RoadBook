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

安装只有一条路：**装主插件**（DSH 侧栏「插件」→「添加插件」→ Git 地址填本仓库根，或本地绝对路径指向仓库根）——根 `package.json` 声明了组合包，装完在插件面板里能看到**六行**（1 条主行 `roadbook` + 5 条可独立开关的子行：`roadbook-skills` / `roadbook-autoload` / `roadbook-atlas` / `roadbook-team` / `roadbook-evolve`）。

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

## 标签页里有什么（2026-10-05 起）

| 能力 | 怎么实现的 | 为什么 |
|---|---|---|
| 预览 | iframe 直接吃 better-sidebar 的 `/sidebar/html/<sessionId>/<绝对路径>` 预览路由 | 旧写法把整份 HTML 经 `fs.read` 搬进 `srcDoc`，而 `fs.read` 的 `readLimit` 默认 **512 KB**；实测五类产物 **608.4–611.7 KB** ⇒ 每次预览都只显示 83.9% 且没有任何报错。路由由服务端流式返回整份文件，且自带 `content-security-policy: sandbox …` |
| 自动刷新 | 15 秒一次 `fs.tree` **名称指纹**轮询，指纹变了才重读元信息；`document.visibilityState === 'hidden'` 时不发请求 | agent 刚渲染完一张图，用户不该还要手点「刷新」；只看名称集合，代价是一次轻量请求 |
| 「规格已改」徽标 | 回执里已存着规格的 `sha256` 与 `bytes`：先比字节数，相同再比 sha256；**算不出哈希时显示「规格无法比对」**，不装作没变 | 图纸与规格分叉是这套流程最怕的「两处真相」，回执本来就是判据载体。字节数由客户端按 UTF-8 自行折算——宿主 `fs.read` 的文本分支**不回 `size`**（只有二进制分支才有），若照抄 `value.size` 这条判据会永远是死代码；`crypto.subtle` 只在安全上下文存在，非 localhost 的 http 打开界面时哈希算不出来，此时必须明说判不了（静默回「没变」正是漏报过期图纸的方向） |
| 打包导出 | `archive.build` → 每 250 ms `archive.status` → `ready` 后先 `fetch` 成 blob 再点锚点下载（**不**把顶层导航指到 `/sidebar/archive?id=…`：zip 有存活期，过期返回 404 JSON，一次下载失败会把整个应用导航到错误页）；失败时把宿主给的原因显示出来 | 一次拿全部图纸 + 规格 + 回执（回执是「这张图怎么来的」的唯一证据）。宿主对**每个**路径做 stat，一个读不到就整单失败，而列表快照可能是上一次轮询的旧数据（图纸刚被删/改名）——只显示「打包失败」等于把已经采到的证据丢掉 |
| 元信息读取 | 有界并发 6（原为最多 40 次**串行** HTTP）；超过 40 张时在界面上明说只读了前 40 张 | 串行排队会把标签页开成转圈；静默截断会让人以为列表不全 |
| 语言 | `ctx.locale.register/bind` + 订阅变化 | 旧代码读 `ctx.locale.current`，而真机的快照字段是 `getSnapshot().active` ⇒ 界面恒为中文 |

## 渲染器边界

`skills/roadbook-atlas/vendor/archify/` 是上游 [tt-a1i/archify](https://github.com/tt-a1i/archify)（MIT）的 vendor 副本，**只读**：

- 清单与 SHA-256：`skills/roadbook-atlas/vendor/archify/VENDOR-PROVENANCE.md`（57 行逐文件表 + 上游排除清单；只排除 5 个预渲染 HTML 演示，保留 13 份 JSON 夹具）。**逐文件字节数与哈希由 `test/vendor-provenance.test.mjs` 每次门禁现算**——清单里的汇总数字不要手抄进文档，它会随记录文件自身增长而失效。
- 升级 = 整目录替换，然后从仓库根跑 `node --test "test/*.test.mjs"` 复验。
- 上游没有可 import 的渲染 API（`bin/archify.mjs` 零 export），所以 CLI 用 `spawnSync` 调 `deliver --json`，路径从自己模块位置解析。

## 开发与验收

```bash
cd <仓库根>
node --test "test/*.test.mjs"                          # 伞包侧全套件（12 个测试文件）
node --test "plugin/roadbook-autoload/test/*.test.mjs" # 自动加载子插件的离线测试
node --test "plugin/roadbook-evolve/test/*.test.mjs"   # 自进化子插件的离线测试
```
条数以命令输出为准，**不要在文档里手抄**（此前这里写「34 项」并列了 6 个文件，早已与磁盘不符）。

- `test/atlas-cli.test.mjs`：退出码纪律 + **项目根陷阱回归守卫**（本机 `%TEMP%` 里有游离 `.git`，`git rev-parse` 会把图纸写到项目外；CLI 拒绝家目录/临时目录做根，退回 cwd）。
- `test/client-contract.test.mjs`：在 `vm` 里跑客户端 bundle，校验 ModuleLoader 形状、`ctx.effect` 注册、标签页根节点高度契约、双语；2026-10-05 起另钉预览 URL 算法（`/sidebar/html`、绝对路径、逐段编码）、语言快照字段、目录指纹、规格过期判定。
- `test/render-smoke.test.mjs`：五类各渲染一次，断言 exit 0 + 回执可解析且 `ok !== false` + 产物 > 100 KB。**不**断言校验计数、也**不**做「三次运行同 SHA-256」比对（此前 README 那么写，与代码不符）。
- `test/packaging.test.mjs`：**运行时引用的路径 ⊆ 发布白名单**（`playbook/`、`playbook_EN/`、`template/` 与 `host-fallback.js` 都漏过一次）。

## 版本

伞包根 `package.json` 的 `version` 是**唯一事实源**（本文件**不手抄具体数字** —— 2026-10-06 实测手抄的那份
已漂到 `0.2.3`，而当时盘上是 `0.7.2`）：客户端半的 `PLUGIN_VERSION`（标签页页脚显示它）
与宿主半的 `pluginVersion()`（启动日志里的 `roadbook v<版本>: ready`）由测试强制与它一致，漏改即判红。
升版规则（加能力 → 次版本，修 bug → 修订号）与逐版本记录见仓库根的 [`CHANGELOG.md`](../../CHANGELOG.md)。
