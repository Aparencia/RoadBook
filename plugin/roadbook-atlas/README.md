# Roadbook Atlas（路书·图册）

把一份小型 typed JSON 规格渲染成**自包含的交互式 HTML 图纸**，并在 better-sidebar 的「图册」标签页里浏览、预览、打开、导出。

这是 Roadbook 母版仓库下的一个**可独立开关**的插件（与 `plugin/roadbook-autoload/` 同级）：

- **宿主半**（`lib/index.js`）：把随包的 `roadbook-atlas` skill 挂进 DSH 的 skill 目录，agent 因此知道该走哪个 CLI。
- **客户端半**（`lib/client.js`）：向 better-sidebar 注册一个原生标签页 `roadbook-atlas:gallery`。
- **skill**（`skills/roadbook-atlas/`）：`SKILL.md` + `bin/atlas.mjs` CLI + `vendor/archify/` 渲染器。
- **契约**：规格是唯一事实源，图纸和回执都是它的派生物；CLI 非 0 退出永远不许被描述成成功。

## 安装

插件本身不含任何本机路径（`files` 白名单只收 `lib/ skills/ cordis.patch.yml README.md CHANGELOG.md`），克隆或装包之后即可运行。三条路任选：

**别填仓库根地址**：`https://github.com/Aparencia/RoadBook.git` 整仓装不了——仓库根没有 `package.json`，DSH 会判「这个包没有声明组合包，不能作为插件管理」。在「添加插件」里选 Git 地址时要带 `#path:` 指到本插件：

```text
git+https://github.com/Aparencia/RoadBook.git#path:plugin/roadbook-atlas
```


**A. 本地克隆 + 指向目录**（最稳，不需要发布）

```powershell
git clone https://github.com/Aparencia/RoadBook.git "$env:USERPROFILE/RoadBook"
cd "$env:USERPROFILE/.dsh/profiles/desktop"
pnpm add "link:$env:USERPROFILE/RoadBook/plugin/roadbook-atlas"
```

不想碰命令行也行：DSH 侧栏「插件」→「添加插件」→ 本地绝对路径 → 指向你克隆下来的 `plugin/roadbook-atlas` 目录。

**B. 直接按 git 子目录装**（pnpm 支持 `#path:`，实测可用）

```powershell
cd "$env:USERPROFILE/.dsh/profiles/desktop"
pnpm add "git+https://github.com/Aparencia/RoadBook.git#path:plugin/roadbook-atlas"
```

**C. 按包名装**：需要先发布——本包目前 `private: true` 且未上 npm（`roadbook-atlas` 这个名字在 npm 上还没被占用）。发版与打 tag 由人执行，agent 不做。

装完只差两步：把 `"roadbook-atlas"` 加进 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`，再重启 DSH（宿主半只在新会话启动时加载）。

**前置**：DSH ≥ 0.2.0-rc.1、Node ≥ 22.19（DSH 自带运行时满足）；better-sidebar ≥ 0.24.0 用于标签页——没有它时插件不报错、只是不注册标签页，skill 与 CLI 照常能用。

## 三处独立开关

| 想停掉什么 | 在哪里改 | 怎么改 |
|---|---|---|
| 整个插件（skill + 标签页） | `~/.dsh/profiles/desktop/cordis.patch.yml` | 给对应条目加 `disabled: true` |
| 只停 skill 分发，保留标签页 | 同上，改 `roadbook-atlas-skill-filesystem` 条目 | 加 `disabled: true` |
| 只停标签页 | DSH 设置页 → 侧边栏卡片 → 本插件 | 关掉标签页开关 |

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

- 清单与 SHA-256：`VENDOR-PROVENANCE.md`（58 文件 / 1,657,356 B；只排除 5 个预渲染 HTML 演示，保留 13 份 JSON 夹具）。
- 升级 = 整目录替换，然后跑 `node --test "test/*.test.mjs"` 复验。
- 上游没有可 import 的渲染 API（`bin/archify.mjs` 零 export），所以 CLI 用 `spawnSync` 调 `deliver --json`，路径从自己模块位置解析。

## 开发与验收

```bash
cd plugin/roadbook-atlas
node --test "test/*.test.mjs"     # 9 项：CLI 端到端 3 + 契约 5 + 渲染冒烟 1（内含 5 类渲染）
```

- `test/atlas-cli.test.mjs`：退出码纪律 + **项目根陷阱回归守卫**（本机 `%TEMP%` 里有游离 `.git`，`git rev-parse` 会把图纸写到项目外；CLI 拒绝家目录/临时目录做根，退回 cwd）。
- `test/client-contract.test.mjs`：在 `vm` 里跑客户端 bundle，校验 ModuleLoader 形状、`ctx.effect` 注册、标签页根节点高度契约、双语。
- `test/render-smoke.test.mjs`：五类各渲染一次，断言 9/9 校验通过、`showcase:pass`、三次运行同 SHA-256。

## 版本

`package.json` 的 `version` 是**唯一事实源**（当前 `0.1.0`）：客户端半的 `PLUGIN_VERSION`（标签页页脚显示它）
与宿主半的 `pluginVersion()`（启动日志里的 `roadbook-atlas v0.1.0: ready`）由测试强制与它一致，漏改即判红。
升版规则（加能力 → 次版本，修 bug → 修订号）与逐版本记录见 [`CHANGELOG.md`](CHANGELOG.md)：

- 本机是 `link:` 安装 ⇒ **改完文件即时生效，不需要重装**；版本号只是给人看与对账用，要按规则手升并记一笔。
- `git tag` **由人打**（agent 不打 tag）；对外发布要先去 `private` 并准备 npm 发布流程。
