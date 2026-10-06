# VERIFY · 6-4 回归验证 —— 图册默认目录被宿主拒收（BUG-002）

> 卡：6-4 回归验证（全档必走）｜ slug：`atlas-relative-dir`｜ 上游：6-2 根因分析 → 6-3 修复
> （提交 `449e4c1` + `cf81c87`，修复起点锚点 `4dc796a6b0f5dd55e1eef3c1eba40eb48996acd2`）
> 落点说明：卡写的产物路径是 `docs/specs/<date>_<slug>/VERIFY.md`；本仓根即插件包、**没有 `docs/`**，
> 沿用既有先例放 `_qc/`。产物寿命：**持久（进仓库）**。

---

## 1. 人话复述

**根因一句**：「相对项目根」这个配置口径没有指明谁负责折算成绝对路径，而唯一要求绝对路径的那一层
（better-sidebar 宿主的 `requireAbsolute()`）在仓库外，两边都以为对方在做 ⇒ 默认配置开箱即坏。
**修法一句**：照抄平台自己的 `resolveSidebarPath(cwd, path)`，两处 fs 调用点（列表 / 15 秒轮询）
进 API 前先折算，显示层照旧显示配置原文。

## 2. 回归验证第①件：负面测试（防复发）

**权威命令**（本卡 §② 指定：与 `AGENTS.md` §10 和 `check.ps1` 顶部 `$STEPS` **同一口径**，
不另立命令）：

```powershell
node --test "test/*.test.mjs"
```

**加完断言、尚未修代码时（必红 —— 没有红就没有第二阶段）**：

```text
$ node --test test/client-contract.test.mjs          # 日志 %TEMP%\atlas-red.log
✖ 图册列目录：相对目录必须先按 cwd 折算成绝对路径再调 fs.tree（默认 docs/diagrams 不能开箱即坏）
  AssertionError [ERR_ASSERTION]: 相对目录必须折算成绝对路径，否则宿主 400：is not an absolute path
  + actual - expected
  + 'docs/diagrams'
  - 'C:/proj/docs/diagrams'
ℹ tests 46   ℹ pass 45   ℹ fail 1        （EXIT=1）
```

**修完之后（全绿）**：

```text
$ node --test "test/*.test.mjs"                       # 日志 %TEMP%\bug002-root-suite.log
✔ 图册列目录：相对目录必须先按 cwd 折算成绝对路径再调 fs.tree（默认 docs/diagrams 不能开箱即坏） (1.6021ms)
✔ 折算算法与 better-sidebar 同判据：isAbsolutePath 三种绝对写法 + resolveSidebarPath 边界表 (1.4141ms)
✔ 接线守卫：fs 调用的 path 不许原样透传配置原文（BUG-002 的形状） (0.332ms)
ℹ tests 163  ℹ pass 163  ℹ fail 0        （EXIT=0；本批前 160 → 现 163，+3 条）
```

三条断言的**防复发**含义：
1. **生产路径**断言（不是纯函数自嗨）：走 `listDiagrams(scope, dir)` 真发一次请求，钉住
   `body.path` 必须是绝对路径 —— 旧代码在这条上必红。
2. **算法边界表**：`isAbsolutePath` 认 POSIX 根 / 盘符 / UNC 两种写法；已绝对的**一个字符都不动**；
   没有 cwd 不硬拼。与 `dsh-better-sidebar/lib/client.js:848 / :912` 同判据（同 `htmlUrl` 与宿主
   `encodeHtmlUrl` 的关系）。
3. **接线守卫**：源码里再出现 `"fs.tree", { path: dir }` 这种原样透传即判红 ——
   把"下一处新加的 fs 调用也漏折算"这条复发路径直接堵死。

## 3. 回归验证第②件：回归清单（逐项打勾）

**先指派再搜索**（不靠印象）：

```text
$ Get-ChildItem lib,test,plugin -Recurse -File -Include *.js,*.mjs | Select-String 'listDiagrams|resolveSidebarPath'
lib\client.js:980   （定义：listDiagrams）
lib\client.js:982   （listDiagrams 内折算后发 fs.tree）
lib\client.js:2241  （调用者 1：AtlasGallery 的加载 effect）
lib\client.js:2275  （调用者 2：15 秒轮询那条 fs.tree）
lib\client.js:2718  （测试接缝：__internals 导出）
lib\client.js:2720/2721（测试接缝：isAbsolutePath / resolveSidebarPath）
test\client-contract.test.mjs:1426,1431..1455（三条新断言）
```

改动**只落在 4 个区块**（`git diff 4dc796a..HEAD -- lib/client.js | Select-String '^@@'` 实测）：

```text
@@ -454,6 +454,34 @@    新增 isAbsolutePath / resolveSidebarPath
@@ -950,7 +978,9 @@      listDiagrams 折算后发请求
@@ -2242,7 +2272,7 @@    轮询那条折算
@@ -2682,6 +2712,13 @@    __internals 导出
```

| # | 被影响面 | 可观察行为 | 证据 | ✅ |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 图册列表（**相对** dir，默认值） | `fs.tree` 收到的是 `cwd` 折算后的绝对路径 | 生产路径断言 ✔（本文件 §2） | ✅ |
| 2 | 图册列表（**绝对** dir，手填过的人） | 原样透传、一个字符不动 | 边界表 `resolveSidebarPath('C:/proj','D:/other/x') === 'D:/other/x'` ✔ | ✅ |
| 3 | 15 秒目录轮询（第二条 fs 调用） | 同样折算；漏一处即判红 | 接线守卫 ✔（源码不许出现 `path: dir`） | ✅ |
| 4 | 预览 / 打开 / 导出 | 走 `fs.tree` 回的**绝对**路径，未改（预览路由 `/sidebar/html` 无 cwd 参数） | 既有 `htmlUrl` 同算法断言全绿；diff 未触及 `:499-545` ✅ | ✅ |
| 5 | 打包导出（zip 轮询） | 未改 | diff 4 个区块不含该段；根套件 163/163 ✔ | ✅ |
| 6 | 空态生成按钮（空列表 / `missingDir` 两种入口） | 判定与渲染未改 | 既有 4 条契约断言全绿（其中 `missingDir` 一条即真机截图那种形态） | ✅ |
| 7 | 更新条 / 插件详情页三处 | 未改（同文件另一块） | 既有断言全绿；diff 区块不含该段 | ✅ |
| 8 | 自进化标签页 / 自动加载 / 规则索引 | 未改 | `plugin/roadbook-evolve` **33/33**、`plugin/roadbook-autoload` **94/94**、根 **163/163** | ✅ |

**负面用例（故意喂坏输入，看是否安静退化）**：

| 输入 | 行为 | 判定 |
| :-- | :-- | :-- |
| `resolveSidebarPath(undefined, 'docs/diagrams')` | 原样返回 `docs/diagrams` | ✅ 不硬拼；宿主报错如实冒到界面（旧行为保持） |
| `resolveSidebarPath('', 'docs/diagrams')` | 同上 | ✅ |
| `isAbsolutePath('C:foo')`（盘符相对，宿主也拒） | 判相对 → 会被拼到 cwd 后 | ⚠️ **与平台同行为**（平台也这样）；这类配置值是垃圾输入，界面会显示宿主的「找不到目录」而不是静默 —— 本轮**不额外加守卫**（最小改动），如需加固另开卡 |

## 4. 回归验证第③件：收尾三步（写回 → 提交 → 复跑门禁取 0）

**状态回写**：本仓根**没有 `STATE.md`**（`Test-Path STATE.md` → False；`STATE.md` 是 `template/` 侧
产物，由 `check.ps1` 对模板断言）。等价落点 = 本文件 + `CHANGELOG.md` 的 `[未发布]` 节（已在 6-3 那笔写入）；
`下一步` = **5-1 归档**；`未决问题` = 无。

**门禁（收尾复跑，真实输出）**：

```text
$ powershell -NoProfile -ExecutionPolicy Bypass -File _qc/check.ps1      # 本机需进程级 Bypass，见 CHANGELOG
== 8. 结论 ==
通过 352 项；失败 0 项
观测项（不拦红）：1 条，见上文 [obs] OVER
Roadbook（路书）V6 母版完整性校验：全部通过
EXIT=0        （0 = 通过；1 = 收尾失败；2 = 环境未初始化 —— 三种语义不许混）
```

**`git status --porcelain` 原文**：

```text
?? docs/
```

只有这一条，且**不是本次修复的产物**：它是**用户自己上一轮会话**让 agent 画的架构图
（`docs/diagrams/roadbook-overview.atlas.json` / `.html` / `.receipt.json`，用户在会话里已声明
「落在 docs/diagrams 但未入库，随时可删」）。本次修复的 4 个文件**全部已入库**
（`git status` 对它们零输出）。要不要把那份图纸入库 / 删掉 / 加进 `.gitignore`，由用户裁决。
