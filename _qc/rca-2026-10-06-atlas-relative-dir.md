# RCA · 图册标签页默认配置下恒报「读取失败」（6-2 根因分析）

> 卡：6-2 根因分析（全档必走）｜ slug：`atlas-relative-dir`｜ 缺陷号：**BUG-002**｜ 档位：**M**
> 落点说明：卡写的产物路径是 `docs/specs/<date>_<slug>/RCA.md`；本仓根即插件包、**没有 `docs/`**，
> 沿用既有先例放 `_qc/`（同 `_qc/verify-2026-10-06-inject-never-fired.md`）。
> 产物寿命：**持久（进仓库）**。

---

## 1. 症状（用户真机截图 + 逐字报错）

侧栏「图册」标签页在**默认设置**下永远列不出图纸，列表位红字：

```
读取失败：docs/diagrams is not an absolute path
```

顶部还显示「图册 0 · docs/diagrams」，而图纸其实在盘上（用户同一屏的会话里刚渲染出
`roadbook-overview.html` + `.receipt.json`：`ok: true · 9/9 · 0 error · 0 warning`）。

## 2. 复现步骤

1. 装 roadbook（任意版本，含当前 `v0.8.0`）与 `dsh-better-sidebar`。
2. 插件设置里 `dir` 保持**默认值** `docs/diagrams`（= 相对项目根）。
3. 打开侧栏「图册」标签页 → 列表位恒为「读取失败」。
   （把 `dir` 改成一个**绝对路径**能绕过 —— 这也是它一直没被发现的原因：谁手改过设置谁就看不见它。）

**机械复现（可红可绿）**：`test/client-contract.test.mjs` 新增断言走**生产路径** `listDiagrams`，
断言发给 `fs.tree` 的 `body.path` 是绝对路径。

```text
$ node --test test/client-contract.test.mjs
✖ 图册列目录：相对目录必须先按 cwd 折算成绝对路径再调 fs.tree（默认 docs/diagrams 不能开箱即坏）
  AssertionError [ERR_ASSERTION]: 相对目录必须折算成绝对路径，否则宿主 400：is not an absolute path
  + actual - expected
  + 'docs/diagrams'
  - 'C:/proj/docs/diagrams'
ℹ tests 46   ℹ pass 45   ℹ fail 1        （EXIT=1，日志 %TEMP%\atlas-red.log）
```

## 3. 反向调用链（错误点 → 触发点，逐层 file:line）

```text
宿主判据（报错点）  dsh-better-sidebar/lib/index.js:363
                    function requireAbsolute(path) { if (!isAbsolute(path)) throw new SidebarError("fs-error", `"${path}" is not an absolute path`, 400); }
        ▲ 收到相对路径
我们发的请求        lib/client.js:953   callSidebar(scope, "fs.tree", { path: dir })
        ▲ dir 原样透传
同一处轮询          lib/client.js:2245  callSidebar({sessionId, cwd}, "fs.tree", { path: dir })   ← 第二条同样的路
        ▲ dir = 配置值
配置取值（触发点）  lib/client.js:2172  dir = settings.dir || DEFAULT_DIR           （DEFAULT_DIR = "docs/diagrams"，lib/client.js:44）
        ▲ 口径声明为「相对项目根」
契约三处一致        lib/client.js:43 · plugin/roadbook-atlas/lib/index.js:20 (DEFAULT_DIAGRAM_DIR) · skills/roadbook-atlas/SKILL.md
```

**结论：`scope.cwd` 就在手上（`lib/client.js:2193`），但从没人拿它折算过。**
输入在「配置值」这一层还是对的（相对项目根是**刻意**的、可移植的口径），
到 `listDiagrams` 入口就错了 —— 所以根因在**两层之间缺了折算**，不在报错那一行。

## 4. 五问法（≥3 层，逐层向下）

```text
为什么图册列不出图纸？      → fs.tree 返回 400「is not an absolute path」
为什么宿主说不是绝对路径？  → 我们发的是 "docs/diagrams"（相对）
为什么发的是相对路径？      → 配置口径就是「相对项目根」（可移植：换机器/换目录不用改设置）
为什么没人折算？            → 请求体里同时也带了 cwd，作者以为宿主会拿 cwd 去补；
                              而宿主恰恰**不补** —— 它只认绝对路径，相对就 400
为什么这个误解没被测试拦住？→ 契约测试的假 /sidebar API 从不执行 better-sidebar 的
                              requireAbsolute()，于是「没人折算」在测试里是隐形的（假绿）
→ 根因：**「相对项目根」这个契约没有指明谁负责折算成绝对路径，而唯一要求绝对路径的那一层
        在仓库外（第三方包），两边都以为对方在做** ⇒ 默认配置开箱即坏。
        平台自己的答案是现成的：dsh-better-sidebar/lib/client.js:912 的 resolveSidebarPath(cwd, path)，
        它内置的每个页面都先折算再调 fs API（同文件 :11909 即一例），只有我们没折。
```

## 5. 影响面

| 面 | 影响 |
| :-- | :-- |
| 用户 | **默认设置下「图册」标签页等于不可用**（列表 / 预览 / 打开 / 导出 / 生成全挂在列表之后）；改绝对路径可绕过 |
| 版本链 | 缺陷自 `bbf2fe4`（2026-10-04，插件初版）就在（`git blame` 见下），**不是 0.8.0 的回归** |
| 代码 | `lib/client.js` 两处调用点（:953 列表 / :2245 轮询）＋ 组件取值（:2172） |
| 测试 | 契约测试 46 条对这条链路**零覆盖**（假 fetch 不执行宿主校验） |

逐行历史（实测）：

```text
$ git blame -L 950,956 --date=short -- lib/client.js
bbf2fe4 plugin/roadbook-atlas/lib/client.js (Aparencia 2026-10-04 952)  async function listDiagrams(scope, dir) {
bbf2fe4 plugin/roadbook-atlas/lib/client.js (Aparencia 2026-10-04 953)   var tree = await callSidebar(scope, "fs.tree", { path: dir });
$ git diff v0.7.2..HEAD -- lib/client.js | Select-String 'fs\.tree|path: dir|listDiagrams'
（空 —— 0.8.0 那批一行都没动过这两处）
```

**为什么当初没被拦住**：① 假 fetch 不执行 `requireAbsolute()`（本节第 4 问）；
② 文档口径写的是「相对项目根」，读起来像"宿主会处理"；③ 真机上只要用户手填过一次绝对路径，
症状就消失，于是缺陷跟着设置一起被"个人化"了。

## 6. 定级建议

**P1**（核心功能不可用）—— 依据：默认配置下该标签页的主功能（列图纸）**完全不可用**，
且影响每一个新用户；有绕过手段（手填绝对路径），所以不上 P0。
（自定义条：P0 崩溃/丢数据/安全；P1 核心功能不可用；P2 边缘功能出错；P3 无关紧要。）

## 7. 建议修法（6-3 执行）

**照抄平台的算法，不自创**（本仓已有同类先例：`htmlUrl` 与宿主 `encodeHtmlUrl` 同算法并做契约比对）：

1. `lib/client.js` 新增 `isAbsolutePath(value)` + `resolveSidebarPath(cwd, value)`，
   **逐字对齐** `dsh-better-sidebar/lib/client.js:848 / :912` 的判据与边界
   （POSIX 根 / 盘符 / UNC 两种写法都算绝对；无 cwd 就原样返回；分隔符跟随 base）。
2. 两处 fs 调用点先折算：`listDiagrams` 与轮询（轮询抽成 `dirSignature(scope, dir)`，让第二条路也能被测试钉住）。
3. 契约测试补三条：`resolveSidebarPath` 边界表、`listDiagrams` 生产路径（已先红）、`dirSignature` 生产路径。
4. 显示层继续显示**配置的原文**（`docs/diagrams`）—— 用户看到的是自己填的东西，折算只发生在请求里。

**范围双维锁预期**：2 个文件（`lib/client.js` + `test/client-contract.test.mjs`），
行数（新增+删除）预计 ≤100 → ✅ 常绿。**不顺手改**任何别的东西。
