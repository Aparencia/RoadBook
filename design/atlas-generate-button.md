# atlas 空态生成按钮 · 调研与范围（2-1 + 2-2 合并件）

> 日期：2026-10-06 ｜ 卡：2-1 功能调研 + 2-2 需求范围（合并，理由见 §0）｜ 档位：**M**（用户裁决，2026-10-06）
> 方案：**A · 复用 better-sidebar 的 `sidechat.*`**（用户裁决，2026-10-06）
> AI 声明：本文件由 agent 依据本仓现盘源码与 `dsh-better-sidebar` 源码生成，只覆盖「图册空态生成按钮」这一条功能轴；不含性能与长期架构判断。
> 产物寿命：**持久**（进仓库）——它是本次改动的判据载体，不是会话内草稿。

---

## §0 为什么把两张卡合并成一份

卡 2-1 的产物落点是 `docs/specs/<日期>_<slug>/RESEARCH.md`、卡 2-2 的落点是 SCOPE.md。**本仓是母版，根上既没有 `docs/` 也没有 `STATE.md`**（实测 `Test-Path docs` = False；母版的设计事实源是 `design/v6-design.md`），而 `docs/` 是 `template/` 给**生成出来的项目**用的目录名——在母版根新建它会与模板语义混淆。

本次改动是 **M 档、一个按钮 + 一条提示**，判据量不足以撑起两份独立文档。因此合并为一份，落 `design/`，并在本行声明合并理由；**判据内容一项不少**（§2 方案四列、§3 新依赖三查、§5 八态与按钮规格、§7 验收标准）。这是「信息阶梯」教义的用法（同一事实只写一处），不是跳卡。

---

## §1 任务复述与范围（2-2）

**一句话**：图册标签页在「项目里还没有架构图」时，显示一个按钮；用户点它，agent 在侧聊会话里按 `roadbook-atlas` 技能生成一张当前项目的架构图，成品由图册的 15 秒指纹轮询自动出现。

**MoSCoW**

| 级 | 内容 |
| :-- | :-- |
| **Must** | ① 无 architecture 图纸时出现按钮；② 点击真的唤起 agent（不是复制提示词）；③ 失败要如实说原因，不许静默；④ 中英双语逐键对齐；⑤ 不破坏既有契约测试 |
| **Should** | ⑥ 生成中给出可见反馈（按钮禁用 + 文案）；⑦ 生成完成后无需手动刷新（复用既有轮询，不新增机制） |
| **Could** | ⑧ 非 architecture 的其他类型图纸存在时，也在列表顶部给同一条入口 |
| **Won't（本次不做）** | ✗ 自动生成（无人点击就动）；✗ 主会话注入（那是方案 B，触红线）；✗ 侧聊面板本身（better-sidebar 已有）；✗ 图纸类型选择器（先只做 architecture）；✗ 生成进度条（要看进度去侧聊页） |

**non-goals**：不改 `vendor/**`；不新增对外接口；不改图册的只读定位（按钮只**发起**生成，写入仍由 CLI 完成）。

**验收标准（走 4-3 行为验收，逐条给证据）**

| # | 验收标准 | 判定方式 |
| :-- | :-- | :-- |
| V1 | 目录为空时按钮出现在空态里 | 契约测试渲染空态，断言按钮文案存在 |
| V2 | 目录里只有非 architecture 图纸时按钮仍出现 | 契约测试喂一条 `type: "workflow"` 的 item，断言按钮存在 |
| V3 | 目录里已有 architecture 图纸时按钮**不出现** | 同上，喂 `type: "architecture"`，断言按钮消失 |
| V4 | 点击后调用的是 `sidechat.start`，且 body 含 `sessionId` 与 `question` | 契约测试用假 fetch 记录请求，断言 method + body |
| V5 | 调用失败（404 / 409 / 网络错）时界面显示原因，且按钮可重试 | 契约测试让 fetch 抛错，断言出现错误文案 |
| V6 | zh / en 两份表逐键对齐 | 既有断言 `:1028-1031` 自动覆盖新增键 |
| V7 | 既有 41 项客户端契约全绿 | `node --test test/client-contract.test.mjs` |

---

## §2 方案对比（四列 + 一个被否方案）

| 方案 | 改动面 | 新依赖 | 风险 | 工作量 | 结论 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **A · 复用 `sidechat.*`** | `lib/client.js` + `test/client-contract.test.mjs` + i18n 表（3 文件） | 无 | 低：复用 better-sidebar 既有 API seam；生成发生在子会话，不污染主对话 | 小（≈80 行 + 测试） | **采用** |
| B · 自建宿主路由注入主会话 | A 的全部 + `lib/index.js` 新增 `POST` 路由 + 同源守卫（5 文件） | 无 | **触碰「新增对外接口」红线（AGENTS.md C3）** ⇒ L 档 + 3-2 威胁建模 + DNS-rebinding 守卫 | 中 | 被否（见下） |
| C（被否）· 只保留「复制提示词」 | 0 文件 | 无 | 无 | 0 | 被否：这正是本次要修的现状——用户要的是「点一下就动」，复制粘贴仍要人切窗口 |

**B 的否决理由（具体，不是填充项）**：它唯一的收益是「生成过程留在主对话里」，代价是 L 档 + 一条**新的对外 HTTP 接口**（红线域）+ 威胁建模 + 同源守卫；而 A 已经能让用户在侧聊页看到同样的过程，且图册会自己刷新。**2026-10-06 否掉 B：为一条 UI 入口引入对外接口，风险与收益不成比例（既往请求：本轮 2-1 开工确认 Q3）。**

**C 的否决理由**：现状就是这个方案，用户明确要求升级为可点击。

---

## §3 新依赖三查（Action 3）

**结论：本次零新依赖。** 三查逐条：

1. **现有能力是否已覆盖**：是——`sidechat.start` / `sidechat.prompt` 已在 `dsh-better-sidebar` 的 `/sidebar/api/` 方法表里（`src/index.ts:610` 无条件 `...buildSidechatApi(...)` 进 `buildApi`），本仓客户端半已有 `callSidebar()` 通用调用器（`lib/client.js:426`）。**复用既有 seam，禁止平行新建。**
2. **包是否存在**：不适用（不装包）。
3. **官方文档链接**：不适用（不装包）。

---

## §4 影响面（Action 4，git grep）

```text
$ git grep -n "sidechat" -- lib test        → 未找到引用（本仓此前从未用过该 API）
$ git grep -n "state.emptyPrompt"           → lib/client.js:119,214,2282,2306,2315（zh/en 表 + 错误态 + 空态）
$ git grep -n "action.copyPrompt"           → lib/client.js:210(zh 对照),2316
```

**预计触碰文件**：`lib/client.js`（空态渲染 + 新增按钮与状态）、`test/client-contract.test.mjs`（新增 V1–V5 断言）、`design/v6-design.md`（§17.2 工具面表补一行）、本文件。

**registry 影响行**：本仓无 `docs/registry/`（母版），对应物是 `design/v6-design.md` §17.2 的 `roadbook-atlas` 行——本次在其后补按钮入口说明。

---

## §5 界面规格（3-4 实质内容）

**入口位置**：图册标签页 → 空态区块内、「复制提示词」按钮**左侧**（主按钮位，`buttonStyle(true)`）；非空但无 architecture 时，同一行出现在列表**顶部**。

**按钮规格**：高度 28px（与既有行内按钮同制式，取 `buttonStyle` 既有值）、`type="button"`、圆角与配色走 DSH 令牌 + hex 兜底（既有 `TOKEN` 表）。

**八态**（本组件的实际状态面）：

| 态 | 表现 |
| :-- | :-- |
| 空（无图纸） | 空态文案 + 目录 + 提示 + 提示词 + **生成按钮（主）+ 复制按钮** |
| 有待生成（有图纸但无 architecture） | 列表顶部同一行入口 + 原有列表 |
| 有 architecture 图纸 | **不显示**生成按钮（已有架构图，不重复引导） |
| 生成中 | 按钮 `disabled`，文案切「已交给 agent…」 |
| 生成已发起 | 同「生成中」的终态文案；等轮询自动出现新图纸 |
| 生成失败 | 按钮恢复可点 + 一行红字说明原因（`TOKEN.warn`） |
| 读取失败（既有） | 既有错误态不变 |
| 目录不存在（既有） | 既有 `missingDir` 态不变 |

**失败路径**：`sidechat.start` 要求父会话在 `agents` 注册表里活着（`liveThreadAgent` = `agents.get(sessionId)`），取不到返回 **409**；侧聊服务缺席时为 404。两种都走 `callSidebar` 的抛错通道 → 界面显示真实原因，**不静默、不假装成功**。

---

## §6 修复批清单（用户第 1 项诉求的处置口径）

**口径**（用户裁决：「开始建设」= 采纳开工确认里的推荐）：**只改我们自己的代码与文档；`vendor/**` 内的上游代码一字不动（SKILL.md:51 明令），上游缺陷登记为本文件 §6.2 的技术债。**

### §6.1 本批修（我们自己的）

| # | 问题 | 落点 | 修法 |
| :-- | :-- | :-- | :-- |
| P1 | `runArchify` 把「子进程起不来」伪装成「退出码 1」，并丢弃 `result.error` | `skills/roadbook-atlas/bin/atlas.mjs:170` | 透传 `error`（spawn 失败另给一句「渲染器进程起不来」），`status` 不再从 `null` 硬转 1 |
| P3 | README 三处过期：供应商清单路径不存在、子行数 4≠6、测试清单与冒烟断言描述失实 | `plugin/roadbook-atlas/README.md:16,64,72,78` | 按实测改写 |
| P4 | atlas 的 `SKILL.md` 不在 frontmatter 仪器覆盖内；且多一个 `license` 键（纳入即红） | `test/skill-frontmatter.test.mjs:18-21`、`skills/roadbook-atlas/SKILL.md:4` | 纳入 FILES 清单 + 按断言原意删 `license` 键（宿主只注入 name+description） |
| P5 | `relativePath()` 是无包含校验的字符串切片 | `atlas.mjs:248-251` | 越界时退回绝对路径（不产出截断错路径） |
| P7 | 规格 >512 KB 被截断时静默丢 title/type，`stale` 恒 false | `lib/client.js:832,904-921` | 截断时记 `metaError`（与回执截断同一条通道） |
| P2 | 供应商清单是「声明」不是「判据」：无任何测试读它；汇总数已过期 | 新增 `test/vendor-provenance.test.mjs`；订正 `vendor/archify/VENDOR-PROVENANCE.md` 的汇总行 | 逐文件字节+SHA-256 比对表；汇总数按实测订正为 58 文件 / 1,660,469 B |

### §6.2 登记为技术债（上游 archify，本批不修）

| # | 上游缺陷 | 为什么不动 |
| :-- | :-- | :-- |
| P8 | `scripts/generate-validators.mjs` 被 `schemas/README.md:125,166` 引用但未 vendored ⇒ 383 KB 生成物无法复现漂移检查 | 需整目录替换上游才合规；修法 = 下次 vendor 升级时补进清单 |
| P10 | `assets/template.html:36-41` 有真实外链（Google Fonts）⇒「自包含」不含「零网络请求」；且 9 项产物检查**无一项查外链** | 改它 = 改上游产物 |
| P11 | `check-render-output.mjs:242` 无图例时 `legend_clearance` 无条件通过 ⇒「9/9」不是统一标尺 | 改它 = 改上游检查器 |
| P12 | `bin/archify.mjs:1444` 硬编码 `/dev/null`（Windows 隐患） | 对 atlas CLI 无实际影响（我们不传 `--layout-json`） |
| P13 | 退出码 2 语义重载（用法错误 vs visual-check 无 Chrome） | 上游约定 |
| P9 | `VENDOR-PROVENANCE.md:154` 写 "Exactly four" 而表列 5 行、`:166` 又写 "these five" | 该记录随 vendor 升级整目录替换；本批只在 P2 订正汇总数，矛盾点记于此 |

> 上游反馈不是本批范围（本仓无 issue 流）；下次 `vendor/archify` 升级时，§6.2 整表就是升级清单。

---

## §7 验收与证据要求

- **门禁**：`powershell -NoProfile -File _qc/check.ps1` 退出码 0 + 完整输出原文（同一批内粘贴）。
- **行为验收**：V1–V7 逐条给通过/不通过 + 实测证据（V4/V5 由契约测试的真实 fetch 记录与抛错路径给出）。
- **真机边界（诚实声明）**：契约测试跑在假 React + 假 fetch 上，**证明不了真机上侧聊真的起来了**。真机验证需要你在 DSH 里点一次按钮；本文件不宣称已做真机验证。
- **收尾顺序**（铁律）：回写（本文件 + `design/v6-design.md` + `CHANGELOG.md`）→ `git add` 显式路径 + `git commit` → 复跑 `_qc/check.ps1` 取 0。
