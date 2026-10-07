# 更新日志（roadbook 主插件）

版本号只有一处事实源：根 `package.json` 的 `version`。客户端半的 `PLUGIN_VERSION`（标签页页脚显示）与
宿主半的 `pluginVersion()`（启动日志）都必须与它一致 —— `test/client-contract-shell.test.mjs` 会逐字核对，漏改即判红（2026-10-07 前该断言住在单文件 `test/client-contract.test.mjs` 里，按 D14 拆三份后随「外壳面」进了 shell 那份）。

**升版规则**（agent 只提议，人裁决）：

| 改了什么 | 升哪一位 | 例子 |
| :--- | :--- | :--- |
| 加能力（新子行、新图类型、新标签页动作、新 CLI 命令、新设置项） | 次版本 `0.x.0` | 给图册加「导出 PNG」→ 0.3.0 |
| 修 bug、改文案、改文档措辞 | 修订号 `0.2.x` | 修预览遮罩 → 0.2.1 |
| 改目录约定 / 回执 schema / 命令参数 / Loader 行 id（已装用户需要动作） | 次版本 + 迁移说明 | 回执加字段 → 0.3.0 |

一次升版动**七处**：根 `package.json` 的 `version`（唯一事实源）、四个子包的 `plugin/<子包>/package.json`
（`_qc/check.ps1` 按伞包逐字核对 —— 子包都不独立发行，不跟随就是死元数据）、`lib/client.js` 顶部
`PLUGIN_VERSION`（`test/client-contract-shell.test.mjs` 逐字核对）、本文件顶部加一节；外加 `git tag -a vX.Y.Z`
（由 agent 在发布流程内打 tag，自 `2026-10-05.2` 起）。改完从仓库根跑：

```bash
node --test "test/*.test.mjs" && node --test "plugin/roadbook-autoload/test/*.test.mjs" && node --test "plugin/roadbook-evolve/test/*.test.mjs"
```

## [未发布]

**v0.10.0 升级方案（`design/vnext-2026-10-07.md`）的在办改动。版本号由批 6 的 #62 一次升到位**
（本次不动 `package.json`，所以七处对齐与 `git tag` 都不触发）。

### 判据标注批：`Expected：` 覆盖率 14% → 24%（TD-019 第二批）

- **本批覆盖 4-2 / 6-7 / 7-3 三张卡中英六份、共 30 个命令块**（中英逐卡对齐 3/3、4/4、8/8）。选这三张的理由：4-2 是**下一张卡**，6-7 与 6-6 一起构成度量→体检的回路，7-3 是这几个月一直在走的还债卡 —— 都是"高频卡"。
- **期望值不是编的**：六份卡的 **15 个命令围栏**逐个在本机真跑取样，由此订正四条判据 —— ① `docs/reviews/*.md` 一份报告都没有时是**空输出而不是报错**（"本期无样本"必须与"绿率 100%"分开写）② `git rev-parse HEAD` 打 40 位哈希，工作树脏时打的是"还不含本批"的那串 ③ 锚点写错时 `git diff --numstat` 报 `fatal: ambiguous argument` + **退出码 128**（= 范围没划出来，不是"没有改动"）④ `Select-String` 默认渲染 `<文件>:<行号>:<原文>`，接 `Select-Object Filename, Line` 时改出两列表格。
- **卡面 ≤150 行是硬约束**（`design/playbook-contract.md` §2）：4-2 已是 150 行 ⇒ 新加的 Expected 行靠把 P0/P1 与 P2/P3 两条并成一条**抵回**，卡仍 150 行；全库还有 **14 张卡落在 143–150 行**，6-6（149 行 / 12 个围栏，全库最多）必须先压行再标注。
- **联动**：4-2 中文卡文本 +201 字符 ⇒ A10 冻结账本按设计报红（五个含 4-2 的场景各 +201 字符 / +100 tokensApprox；`endpoint` 链不含 4-2，读数不变）。已按失败信息跑 `ROUTE_FIXTURE_UPDATE=1 node --test test/route-cli.test.mjs` 再生成，并在 `_qc/baseline/ledger.json` 的 note 写一行理由（台账 entries 未动 —— 本次不是新的评测 run）。
- **没有扩硬断言**：B13 从"四张卡"扩到"全库"要改 `AGENTS.md` 的 B13 正文与 `rules/rules.json` 的 predicate（**A6 面，需人在场**），所以本批只推诊断读数、不动断言的卡表。同批把 `test/expected-annotation.test.mjs` 注释里写死的旧读数删掉（它写 `46/306 = 15%`，与订正后的真读数 `46/318 = 14%` 对不上），改为只指向 `docs/TECH_DEBT.md` 的 TD-019 行。

### 判据同源批：`gate.ps1` ⑥ 认项目自己的源码上限声明 + 派单回执字符上限

- **TD-024 结案（同一个文件两套上限 ⇒ ⑥ 认项目自己的声明）**：`_qc/check.ps1` 自己写着 `$selfCap = 985`（并与 `design §8` 由既有断言锁死），而 `gate.ps1` ⑥ 按 `AGENTS.md` D14 判它 500 ⇒ **任何碰 `_qc/` 的批次必然假红**，只剩「悄悄调大 `-LineLimit`」一条路（TD-021 认定最贵的那个后果）。本批给 `DOC_MAP.json` 加 **`sourceLimits`** 段（根登记一条 `_qc/check.ps1: 985`；模板是空表 + 机制说明），⑥ 与 ⑧/⑨ **共用同一份** DOC_MAP.json（同一个事实不读两次），**逐字符相等**命中后覆盖 D14 默认值并打一行 `[声明] ⑥ 行数上限取自项目声明…`（豁免不静默）；**不开通配**（通配是白名单，一条声明就豁免一族），未点名照旧按 D14 判（负向清单 = 漏写不漏判）。**真仓 A/B**（同一棵树、同一 scope）：HEAD 那份 gate 判红「`_qc/check.ps1` 共 975 行 > 上限 500」，本批的判绿且只多出 `[声明]` 行。`gate.ps1` **174 行 ≤ 175**（**没抬上限**：把 ⑧ 的 DOC_MAP 读取块上移到 ⑥ 共用 + 压掉 6 行散文换来），根与 `template/gate.ps1` 逐字节同改（SHA-256 `DC778BA5…`、BOM 在位）。
- **TD-011 结案（回执只限行数、不限长度）**：台账 #28 的两臂回执都恰好 3 行，但 P0 臂 **249** 字符 vs 现状臂 **664** —— 「三行」挡不住「每行很长」，主线程省下的 token 又被回执吃回去。本批给 `route-dispatch.mjs` 加 `RECEIPT_CHARS = 160`（好臂均值 83 的约 1.9 倍、低于坏臂均值 221），规则串由该常量拼出（**数字只写一处**），`receiptChars` 同时进 `--json` 与文本派单包。测试**先红**（`28 pass / 1 fail`，报错点名「派单包必须把回执的字符上限以数据带出来」）**后绿**（`29 pass / 0 fail`）。
- **TD-026 新登记（⑧ 的幽灵规则）**：`@($null).Count` 在 PowerShell 里是 **1** ⇒ `DOC_MAP.json` 缺 `rules` 键时 ⑧ 会拿 `$null` 当一条规则（`[string]$null` 是空串、空正则匹配一切、规则 id 与 docs 都是空）⇒ **任何新增文件都被判假红**「文档义务未履行 []」。已用临时仓端到端复现；按登记处理（⑥ 与 ⑧ 是两条独立判据面，不顺手改）。
- **同批仪器事故（记账）**：`edit` 工具吃掉了 `gate.ps1` 的 BOM（症状 = 中文判词乱码 + `Unexpected token ')'`），按字节比对定位后**只补 BOM、内容未动** —— 与批 6 第四刀那次同类；本批收尾真跑 `security.ps1`（它有「无 BOM 的 .ps1」检查）复核。

### 缺口清偿批：`gate.ps1` ⑥ 判据对象 + A10 七场景断言 + 债务台账结构闸

- **TD-021 结案（判据对象过滤）**：`gate.ps1` ⑥ 的 500 行阈值出自 `AGENTS.md` D14「**代码**生成硬标准」，旧版却把它套在本批变更清单里的**文档**上 ⇒ 任何碰 `CHANGELOG.md`（根上限 700）或长设计文档的批次**必然假红**。本批加 `$notSource`（文档 / 数据 / 资产扩展名）显式跳过，未知扩展名**仍进本段**（白名单式"只判认识的源码"会造出新盲区）；跳过的文件打一行 `[跳过] ⑥ 非源码不判行数（D14 只管代码，文档归 ⑨）`——**豁免不静默**。根 `gate.ps1` 与 `template/gate.ps1` 逐字节同改（SHA-256 `10062E0E…`、172 行 / 预算 175、BOM 在位）。
- **TD-022 结案（A10 扩成全场景）**：`test/route-cli.test.mjs` 的 A10 此前只断言 `endpoint` 一个场景的冻结账本，其余六个漂了没人知道。现改为**七个场景逐条**断 `tier` / `effTier` / 链成员 / `expect.ledger`，并加一条 `names.length >= 7` 的**非空断言**（fixture 被清空时循环一次都不跑、断言恒绿 = 装饰）。
- **TD-023 同批开同批闭（债务台账结构）**：`docs/TECH_DEBT.md` 的表被两处空行切成三块（TD-017~020 落进一个**没有表头**的表块）、TD-021/TD-022 被两竖线粘进 TD-020 的「偿还证据」单元格 ⇒ 结构探针解析出 **20** 条债行而实际 **22** 条（静默漏两条）。本批修回**一张连续的表**（`3 insertions, 2 deletions`），并新增 `test/tech-debt.test.mjs`：连续性 / 编号连续无重复 / 8 列（**转义感知**切分）/ 状态在状态机内 / `closed` 必附偿还证据，外加**四个合成负控**（粘连 / 空行切断 / 多一列 / 转义竖线）。新断言当场又抓出本批自己写进 TD-023 行的一个未转义竖线。
- **TD-024 新登记（同一个文件两套上限）**：把上面的结构断言先写进 `_qc/check.ps1` 后，⑥ 判它 `共 983 行 > 上限 500`，而该文件 `:63` 自声明的上限是 `$selfCap = 985`（历史四次带理由上调）⇒ 碰 `_qc/` 的批次必然假红，只剩"调大 `-LineLimit`"一条路（正是 TD-021 认定最贵的后果）。本批改把断言落到 `test/`（`git checkout -- _qc/check.ps1` 回到 974 行）并登记二选一，不顺手改判据。
- **TD-025 新登记（幽灵检测器的词表是闭集）**：跑本批的 `orphans.ps1` 报 `[文档幽灵] lib/client.session.js` 1 项（TD-002 结案时是 0，属上一批的**未被发现的回归**）。根因不是漏改，而是 ④ 规则「前后 60 字符内有非现在时标记词」的**词表是闭集**（拆 / 删 / 待建 / 待填 / 规划 / 弃用 / 废弃），而 TD-020 那行写的是「…，批 2 的排期）」——**"排期"不在表里**。本批按检测器的意图**就地标注**（补「待建」）⇒ 复跑 `文档幽灵 0 项`；词表缺口登记为 TD-025，不顺手改检测器。
- **三条都先红后绿**：① 在**未改**的 gate 上红在 `行数超限：big.md 共 600 行 > 上限 500` ⇒ 改后 4/4 绿；② 把 `goLiveOff.expect.ledger.cards` 改 99（**非 endpoint** 场景）⇒ 退出码 1 且报错点名该场景；③ 把 TD-022 粘回 TD-021 ⇒ 退出码 1、解析条数掉到 21。明细与命令原文见 `docs/TECH_DEBT.md` 的核对记录。
- **教训复发记账**：`docs/lessons/2026-09-11_数字口径与CRLF.md` 的复发计数 14 → **15**、最近复发 → 2026-10-07。实例：`Get-Content test/route-cli.test.mjs` 报 **618** 行，而 `[IO.File]::ReadAllLines(UTF8)` 与字节计数都是 **653**（LF 653 / CR 0）—— 本仓所有 `.ps1` 的读法本来就对，错的只是**人顺手敲的那条命令**。

### 缺口对账批：报告证据索引 + 台账 T-08 回填 + T-06/U-9 入词汇 + U-3 观测口径

- **对账结论**：三份会话内报告的**结论**早已吸收进方案与 `design/vnext-2026-10-07.md`，但 63 条台账的「来源」列有 **55 行**指着这三份原文，而原文的路径与哈希**盘上无处可查**（`git grep` 命中 0）⇒ 三份的路径 / 字节 / SHA-256 写进 `docs/decisions/PROCESS_2026-10-07_v0.10.0-升级方案.md` 的证据索引（D7 之下唯一可核对的形态）。
- **修两处自相矛盾的指针**：`design/vnext-2026-10-07.md:16`（裁决 3 写"三份报告**入库** `docs/decisions/`"，而方案 §诚实边界写"原文不进仓库"）与 `:186`（死文件名 `PROCESS_2026-10-07_修复点台账.md` ⇒ 实际是 `PROCESS_2026-10-07_修复点批次映射.md`）。
- **台账补链**：`design/vnext-2026-10-07.md:59`（#23）的「来源」列补 **T-08** —— 报告 §5「根因 D」成员表本来就列着「T-08 提案无处可去」，台账缺这一行 ⇒ 「报告条目号 → 落点」的链在 #23 上断过。
- **T-06 + U-9 进母版词汇**：`playbook/4-1`（中英）「自行裁决留痕」的固定格式加第 4 槽 **`翻案条件`**（写不出触发信号的写 `no-trigger`）；并规定 `STATE.md` 未决问题每条冠 **`挡路 ·`** / **`可翻案 ·`**（挡路的必须在 `下一步` 顶部点名）。`template/STATE.md` 与根 `STATE.md` 同批采用该标签（根文件 50/50 行顶格 ⇒ 只加标签不加行）。
- **U-3 观测口径订正**：`test/expected-annotation.test.mjs` 的扫卡正则 `^\d-\d-.*\.md$` 把两位数卡号 `7-10` 漏在扫描面外（分母 48/49），注释里的"全库 41 张卡 / 其余 37 张"同批订正为实测值。
- **登记六条新债**：TD-017（跨文档取值对账 = 反馈 T-04）、TD-018（双语取哪一版 = U-2）、TD-019（`Expected：` 扩容 = U-3）、TD-020（「第三张标签页」的三个所指）、TD-021（`gate.ps1` ⑥ 把 D14 的源码 500 行阈值套到文档 ⇒ 碰 `CHANGELOG.md` 的批次必假红；本批按 `-LineLimit 1000` 复跑取绿，裁决与翻案条件在 `STATE.md`）、TD-022（冻结账本七个场景只有 `endpoint` 被 A10 断言 ⇒ 另外**五个场景的 `expect.ledger` 早就漂了**，本轮再生成顺带订正；HEAD 干净检出上实测 5 处 mismatch、而测试照样 29/29 全绿）。
- **冻结账本再生成**：`playbook/4-1` 的 +161 字符按设计触发 `test/route-cli.test.mjs` 的 A10 判红 ⇒ 按测试自带口径跑 `ROUTE_FIXTURE_UPDATE=1 node --test test/route-cli.test.mjs` 再生成 `test/fixtures/route-scenarios.json`（30 pass），理由逐字写进 `_qc/baseline/ledger.json` 的 `note`。

### #56 门禁措辞订正：三张 → 两张（+ U5 新意向记录，批 6 收尾后补做）

- **订正的是什么**：方案 §11.5（`:374` / `:376`）、`STATE.md` U1、`RISK.md` R2 把 #56 的目视判据写成「三张标签页」；而第三张「会话」是**批 2 的产物**，批 2 因等 #56 尚未开工 ⇒ 现在把装的那份刷到 HEAD 只会有**两张**。照原文案跑会在"张数对不上"处卡住（A 组回退的真实判据是「自进化」停在「正在加载…」或 `paths` 仍是两条，**不是**张数）。
- **改后的判据**：**两张**标签页（图册 / 自进化）正常渲染 + `GET /roadbook/bundle/app.js` 与 `GET /roadbook/bundle/evolve.js` 均 **200** + `%TEMP%\roadbook-update.jsonl` 的 `paths` 变三条；「三张」留给 §5 成功标准第 6 条（版本级，批 2 落地后才成立）。三处逐字对齐（2026-10-07 用户在本会话裁决 —— A6 / C3：`STATE.md` 裁决字段改动需人在场）。
- **怎么核的**：`lib/client.js:1806-1822` 只有两次 `registerTab`（`roadbook:gallery` order 45 / `roadbook:evolve` order 46）；`lib/` 15 个文件里没有 `client-session.js`；全仓 `roadbook:session` 只在设计文档出现 1 次（台账 #57）。
- **另记一条新意向**：用户本轮提出「想要可视化 UI 编辑能力」⇒ 落 `STATE.md` U5 + `RISK.md` §2 末条（四种解读待选一 + 一条硬约束：浏览半是只读面，凡"编辑"都要新增写回接口 = 红线域）；**不并进 v0.10.0 的 63 条闭集**。

### TD-014 结案 · 宿主令牌改用真名 + 探针元素订正（批 6 收尾后补做）

- **改的是什么**：`lib/client.js:1142-1147` 的 6 条令牌里 5 条的名字宿主**从来没有定义过**（`--dsw-alias-text-1` / `text-2` / `border-1` / `text-accent` / `text-warning`，在宿主 120 个别名里声明形态与引用形态**都是 0**）⇒ 插件一直渲染 fallback 常量、且不跟宿主明暗主题。改成宿主真名：`label-primary`（385）/ `label-secondary`（281）/ `border-l1`（62）/ `bg-layer-2`（33，唯一蒙对的）/ `link`（20）/ `state-warn-label`（25）。**fallback 一字未动** ⇒ 最坏情况与改前逐字节等价。
- **顺带订正了一处会骗人的探针**：宿主把这些别名声明在 `body`（亮）/ `body[data-ds-dark-theme]`（暗）上，**不在 `:root`/`documentElement`** ⇒ TD-014 原定的 `getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-text-2')` **恒返空串**，会把已经定义好的令牌判成"没注入"。正确探针查 `document.body`。
- **怎么证的**：③ 步全在本机真跑 —— ① 全产物扫出 120 个 `--dsw-alias-*` 名字（3053 次引用）；② 按声明形态定位到 `body`（204 条）与 `body[data-ds-dark-theme]`（205 条）两个块并逐条取到定义值；③ `setProperty(` 且窗口内含 `dsw-alias` = **0 处** ⇒ 排掉"运行时拼名注入"这个残留不确定。
- **机器判据**：`test/chunks.test.mjs` 新增 `FROZEN_ALIASES` 冻结这 6 个名字，**证伪一次**（把 `label-primary` 换回 `text-1` ⇒ 恰好红在 `TOKEN.text 必须用宿主真名 …`，还原后 18/18 绿）。
- **残余未验**：真实渲染下的颜色没被人眼看过（需重启 DSH，与 #56 同一次做）—— 台账里如实写成观察项。

### `docs/versions/` 归属卡定稿 + 两份历史回填（台账 #46 / TD-007 —— 批 6 收尾后补做）

- **定稿 = 选项 ①（归 5-6）**：判据正文在 5-6 卡 —— 产物行两处写着 `docs/versions/vX.Y.Z.md`，「三对齐」（`:75-81`）把"本目录命中 1 个 `vX.Y.Z.md`"列为**打 tag 前的机械判据**；根 `docs/README.md` 只是**索引**，索引漏了 5-6 ⇒ 修索引（产出卡补 `5-6`、维护列补 `5-6`、更新条件写实），**不删卡里的判据**（契约 §2「不许删判据腾地方」；且方案 #62 要产出 `docs/versions/v0.10.0.md`）。删判据 = 把"第三次静默跳过"变成合法，这条被否决。
- **回填两份**：`docs/versions/v0.8.0.md`（`git show --stat` = 8 文件 / +23−12）与 `docs/versions/v0.8.1.md`（7 文件 / +13−7）—— 只写能复核的事实（tag / 提交 / 文件面 / `CHANGELOG.md` 对应节指针），当时的门禁输出原文写 `N/A（当时未记录）`；`CHANGELOG.md` 的两个历史节**一字未动**（时点记录不改写）。
- **台账净减**：TD-007 **结案** ⇒ `docs/TECH_DEBT.md` **closed 8 / open 8**（7/9 → 8/8）。明细：方案 §11.18。

### `feedback/` 最小回流落地 —— 证据生命周期链的最后一跳（台账 #23 末环 —— 批 6 第六刀）

- **落点**：`feedback/README.md`（契约：谁写 / 谁读 / 字段 / 命名 / 状态词表 / 回流三步）+ `feedback/TEMPLATE.md`（条目模板）+ `skills/roadbook/bin/feedback.mjs`（`--check` 判字段·命名·三小节，退出码 0/1/2；`--index`/`--write` 渲染派生索引）；`template/feedback/` 两份**逐字节镜像**（反馈根因 D 的分发面：派生项目照同一份契约写条目，人复制一次进母版）。
- **判据**：一条反馈 = 一个文件 `YYYY-MM-DD_<slug>.md`；字段行 `> 日期：… ｜ 来源：… ｜ 轴：… ｜ 状态：… ｜ 落点：…`（全角分隔符，**不用 YAML front matter** —— 本仓零依赖，而 YAML 的 `键: 值` 撞上 ASCII 冒号加空格会被读成嵌套映射，`SKILL.md` 那条 frontmatter 教训）；轴 / 状态受控词表；`landed` 必须给落点；三个必填小节非空；**文件名日期 = 字段日期**（同源判）。
- **证伪一次**：真仓放入状态词表外的探针条目 ⇒ `--check` 退出码 **1** 且恰好点名该条、`--index` 拒绝渲染（不留 `INDEX.md`）；删掉探针 ⇒ 判绿 0 条、退出码 0。`test/feedback.test.mjs`（18 项）另做**八类坏条目反向对照**（缺字段 / 词表外 / landed 无落点 / 日期不同源 / 命名不合规 / 缺小节 / 空小节 / 未知字段，每类恰好红在自己那行且不牵连好条目）+ 模板与判据同源 + BOM·CRLF 回归。
- **登记与上限**：`docs/registry/COMPONENTS.md` 加 6 行（117 行登记 / 整页 154 ≤ 155）—— 同批**压掉六行散文**而不是抬上限（TD-012：不许再抬）。明细：方案 §11.17。

### 审查核销口径 + 体检事件入口 + `route` 事实文件剥 BOM（台账 #8 / #10 —— 批 6 第五刀）

- **#8（反馈 U-6 / U-7，中英同批）**：`4-2` 补「核销计数机械口径」——三态（已修 / 未修 / 误报）各自的判定命令形态、**「部分修」按未修计入且必须给未修行号**、**判色只吃合并后计数**（两轴分节计数降为展示）、**依据不可复现的发现单列且不计入判色**（每条发现自带「命令原文 + 退出码 + 命中行」），并写清它与 ①.7 的分界（旧条目标「误报」写不出依据 = 按未修**计入**；本轴新发现写不出依据 = 进「依据未复现」栏、**不计入**）。
- **#10（反馈 T-11 / U-5，中英同批）**：`6-6` 补**事件驱动入口**（人点名 / 重大事故 / 换机器，**不受 ≥15 限制**）+ **周期入口清零、事件驱动不清零**（计数只由「周期体检清零」与「5-1 归档 +1」两处动）；`0-1` 开机报告新增**「链序下一张 = X（`route --chain --facts-file …` 复算）」**，与 STATE.md「下一步」不一致时两条都写出来、不许静默按其中一条走；`STATE.md` 与 `template/STATE.md` 的体检计数行同步补口径。
- **落地前提 = 仪器修仪器（C1）**：样例命令第一跑就撞 Windows 编码坑 —— PS 5.1 的 `Set-Content -Encoding UTF8` 写 BOM 而 `JSON.parse` 拒收、命令行内联 JSON 又被 PS 吃双引号。`route.mjs` 的 `loadFacts` 同批**剥前置 BOM**，新增回归断言 `A15g`（带 BOM 判绿、输出逐字节等于无 BOM；坏 JSON 仍判红 1 且报解析失败）；两条报错原文落 `docs/lessons/2026-10-07_Windows写文件必带BOM.md`。**证伪一次**：撤掉剥 BOM 那行 ⇒ `A15g` 恰好红在该断言（退出码 1），还原后 `route.mjs` sha256 `C219CB30E0DF2FE6F666BD2D77CC7F66DED50D628E48E1F6920CD82CB321720F` 逐字节一致。
- **本刀附带纠正上一轮一条假绿**：`CHANGELOG.md` 根副本实测 **704 > 700**（上一轮回执里的「`_qc/check.ps1` 通过 405 / 失败 0」在本轮 HEAD 上**不可复现**）⇒ 本节按 `5-6` 卡的形态压回一行一条（判据一条没删，明细指针指向方案 §11），重复出现的第二个 `## [未发布]` 标题（0.6.0 与 0.5.0 之间那 30 行**已发布**内容）登记 **TD-013**。

### 三份设计文档核对成项目事实（台账 #29 —— 批 6 第五刀）

- `docs/UI.md`（121 → 124 行）、`docs/DESIGN_TOKENS.md`、`docs/MOTION.md`（80 → 60 行）三份**种子骨架**改成这个项目自己的界面事实：两张标签页（`roadbook:gallery` order 45 / `roadbook:evolve` order 46）+ 第三张未落地（台账 #30）、按钮实测尺寸与**触控目标 24px < 44px 的如实结论**、预览 iframe 的 sandbox 白名单、唯一表单（图纸目录，宿主渲染）、零动效（证据 = `transition|animation|prefers-reduced` 全仓零命中）；
- 三份头部的「最近核对」由 `—` 改为 `2026-10-07 @ 95068bc`（C1 口径）；不适用的节一律写 `N/A（可判定理由）`，**不留模板示例值**（模板侧 `template/docs/*` 的种子照旧，那才是给新项目用的）。明细：方案 §11.16。


## [0.9.1] - 2026-10-06

**母版仓自身接入本流程（dogfooding），外加接入时带出的两处守护脚本缺陷。** 按升版判定表「修 bug / 改文档 → 修订号」走 `0.9.0 → 0.9.1`：随包内容里**只有 `template/security.ps1` 一处行为面变化，且是放宽**（少报，不会把原本绿的判红）；其余改动全落在母版仓自身的流程文件上（根 `AGENTS.md` / 根 `STATE.md` / `docs/` / 根 `check.ps1` / 根 `security.ps1`），这些路径**不在 `package.json` 的 `files` 白名单里** —— 装走的用户拿到的包，除版本号外与 `0.9.0` 无差别。**升级注意：不适用**（无破坏性变更：命令参数、回执 schema、目录约定、Loader 行 id 全未动，重启 DSH 即生效）。

### 修复

- **`template/security.ps1`（随包分发）的自身跳过口径从「运行中的那个路径」扩到「逐字节副本」**：母版仓里 `security.ps1` 与 `template/security.ps1` 是同一份脚本的两份副本，只看运行路径时两者互为对方眼里的"自己的副本"——谁跑谁红（恒 5 条 `[红]`、退出码 1）。改为「先比长度、再比 SHA-256」，跳过「运行中的自身 ∪ 逐字节副本」，**内容不同的同名文件照扫**（不给逃逸留口子）。6-4 卡回归三样本实测：逐字节副本零命中 / 改名且改内容的副本照报 5 条红 / 真违规样本全部检出。
- **根 `check.ps1` 恢复被编辑工具丢弃的 UTF-8 BOM**（仅母版开发自用，不发包）：无 BOM 时 PowerShell 5.1 按系统码页（GBK）解码 → 中文判词乱码并报 `ParserError`，项目门禁直接跑不起来。教训落 `docs/lessons/2026-10-06_编辑工具丢BOM.md`。

### 变更（母版仓自身接入，不影响已装用户）

- 母版仓按 1-3 卡接入本流程：根 `AGENTS.md`（宪法副本，`规则版本：2026-10-05.2`）+ 根 `STATE.md` + `docs/` 骨架（含 registry 三件套、TECH_DEBT、lessons）+ 五个守护脚本（`check` / `doctor` / `gate` / `orphans` / `security.ps1`）+ `.tool-versions`；文件数基线 348。

### 测试与验收

- `powershell -NoProfile -File _qc/check.ps1`：**359 项全绿、退出码 0**（修复过程 356 通过 / 3 失败 → 358 / 1 → 359 / 0；断言总数恒为 359，账目自洽）。
- 版本口径：根 `package.json` = 四个子包 = `lib/client.js` 的 `PLUGIN_VERSION` = **0.9.1**（`_qc/check.ps1` 与 `test/client-contract.test.mjs` 双重核对）。

## [0.9.0] - 2026-10-06

**文档域 + 接入自举：把两类「只写在散文里的义务」改成机械判据。** 按升版判定表「加能力 → 次版本」走 `0.8.1 → 0.9.0`（新增 `scaffold` CLI 命令 + 新增 `DOC_MAP.json` 契约 + `gate.ps1` 新增拦截项）。**升级注意：不适用** —— 无破坏性变更（回执 schema、目录约定、Loader 行 id 全未动，重启 DSH 即生效）。

### 新能力

- **`scaffold` CLI（`skills/roadbook/bin/scaffold.mjs`）——项目接入不再要求用户手报母版路径**。五级解析阶梯：`--master` → `ROADBOOK_MASTER` → **CLI 自身位置**（装成 skill / 插件包时命中，母版就在本地包内，不必联网）→ npm 身份 `roadbook/package.json` → 全失败才报三条人工路径并退出 2；每级打 `source=` 便于审计。`--check` / `--plan` **绝不写盘**；`--apply` **只补新增、永不覆盖**；`AGENTS.md` / `STATE.md` 是红线域（A6 / C3），只出 `规则版本：` 对比。退出码 0 无缺口 / 1 待人裁决 / 2 环境或用法错。
- **`DOC_MAP.json`（`roadbook-docmap/1`）+ `gate.ps1` 文档义务拦截**：把「改了什么要同步哪些文档」从**散文表**换成**按形态判定的机器判据**——本批新增了文件 / 导出 / 路由 / `.env` 键 / 迁移，而对应文档没在同批改动里 → `gate.ps1` 判红。判据数据在项目根的 JSON 里（每条规则带 `d13` 字段逐字引用 `AGENTS.md` 的义务行，绑定由母版侧反向核对），脚本本体不随项目变。
- **`orphans.ps1` 从五张清单扩到七张**：新增 `[未登记文档]`（`docs/` 固定槽位里没进对应表的文件）与 `[归档候选]`（留存目录"多久没动"的机械读数：最后提交日 >30/90 天且无人引用）——`docs/` 此前是整体排除目录，这两个洞没有任何清单看得见。
- **`docs/archive/INDEX.md` 归档索引 + 归档头**：读归档先读索引（日期 / slug / 提交哈希 / 一句话结论 / 复活条件 / 关联卡）；归档目录内 `tech-debt.md` 首行带机器可读头。
- **`DOC` 过程域（第 14 项）**：文档**生命周期**（登记闭包 / 核对 / 归档 / 退役）此前没有归属——`KNOW` 管"文档里写什么"，`DOC` 管"这份文档还在不在、还算不算数"；承接卡 = 5-7。词表 13 → 14，且 `_qc/check.ps1` 的取值域改为**从契约 §1.1 解析**（此前是脚本里写死的一份：加域时先撞的竟是"取值越界"，把定义漂移伪装成卡写错）。
- **骨架文档「最近核对」行**：16 份固定槽位文档头部加一行（`—` = 骨架未核对 / `<YYYY-MM-DD> @ <短哈希>` = 核对后填），文档从此有了可机械判定的复核字段。

### 修掉的漂移（文档登记双向化）

- `_qc/check.ps1` 里**写死的 4 项文档清单**（`$newDocs = @('UI.md','DESIGN_TOKENS.md','MOTION.md','refactor/')`，2026-10-04 加 UI/UX 文档时钉下的）换成 `_qc/check-docs.ps1` 的三条闭包断言：卡产物里的每个 `docs/` 路径都要有对应表槽位 / 对应表每行都要在 design 全文出现 / 预算表的行数上限与对应表**同源**。卡维度早在 design §10 第 21 条就改成"从 §4 表解析、不硬编码卡名"，本次是文档维度的同一次改造。
- 实测补上的四处缺失：`docs/BASELINE.md`（5-7 卡的产物，此前**五处登记缺四处**而门禁照旧全绿）进对应表与 design §5；`docs/ARCHITECTURE.md` 上限 120 → **150**（对应表没跟上 2026-10-06 的上调）；`docs/UI.md` 120 → 125、`docs/refactor/README.md` 40 → 45（新增结构行后正好卡上限）。
- **淘汰 ≠ 归档**：`docs/decisions/` 移出"超 30 张淘汰"名单（决策卡的价值随时间上升，半年后正是要读它的时候），`docs/lessons/` 的淘汰改为"同症状合并或删除"；两者都不再搬进 `archive/`——搬进去等于永久保留，那不是淘汰。

### 已知问题（本次未修，登记备查）

- `orphans.ps1` 的 `[文档幽灵]` 在**生成出来的项目**里必然误报若干条：模板文档会引用母版侧文件（`rules/rules.json`、`START-HERE.md`、`skills/roadbook/SKILL.md` 等）。属既有行为，本次只确保自己不再新增同类引用，未做母版引用与项目路径的区分。

### 测试与验收

- `node --test "test/*.test.mjs"`：**173 项全绿**，其中新增 `test/scaffold-cli.test.mjs` 10 例（四条反向对照：`--check/--plan` 只读证明 / 内容不同不覆盖 / 坏 `--master` 落到下一级 / 五级全失败给三条人工路径）。冻结账本 `test/fixtures/route-scenarios.json` 按设计报了两次红（卡文本预期内变化），均按测试自带口径再生成，理由记在 `_qc/baseline/ledger.json` 的 note 里。
- `powershell -NoProfile -File _qc/check.ps1`：**359 项全绿、退出码 0**（新增 scaffold 接线断言 + 文档域 14 条断言 + 过程域词表解析断言）。
- 版本口径：根 `package.json` = 四个子包 = `lib/client.js` 的 `PLUGIN_VERSION` = **0.9.0**（`_qc/check.ps1` 与 `test/client-contract.test.mjs` 双重核对）。

## [0.8.1] - 2026-10-06

**图册默认目录折算修复（BUG-002）。** 按升版判定表「修 bug → 修订号」走 `0.8.0 → 0.8.1`；`vendor/**` 上游代码一字不动。本节 = `v0.8.0` 之后 `[未发布]` 节的全部条目（对照 `git log --oneline v0.8.0..HEAD`）。

**升级注意四行**：**不适用** —— 本次无破坏性变更（回执 schema、目录约定、命令参数、Loader 行 id 全都没动；新增的 `isAbsolutePath` / `resolveSidebarPath` 只改「我们发出去的请求路径」，不改任何对外形状）。

**已装用户需要动作**：本批含客户端半（`lib/client.js`），须**更新插件**并**重启 DSH** 才会生效。自检一条：更新后打开图册，列表应能正常读出图纸（不再出现「读取失败：… is not an absolute path」），页脚版本显示 `v0.8.1`。

### 修 bug

- **图册在默认设置下恒报「读取失败：`docs/diagrams is not an absolute path`」**（`lib/client.js`，真机 **BUG-002**，根因链与复现见 `_qc/rca-2026-10-06-atlas-relative-dir.md`）：图纸目录的口径是「相对项目根」（可移植，本身没错），而 `fs.tree` / `fs.read` 落在 better-sidebar **宿主侧**的 `requireAbsolute()`（`dsh-better-sidebar/lib/index.js:363`）上、**只收绝对路径** —— 请求体里那个 `cwd` 只是作用域，宿主不会拿它补 ⇒ **默认设置下列不出任何图纸**（手填一个绝对路径就能绕过，于是缺陷跟着设置一起被"个人化"了；`git blame` 实测它自 `bbf2fe4`（2026-10-04 插件初版）就在，**不是 0.8.0 的回归**）。修法：新增 `isAbsolutePath` / `resolveSidebarPath`，**与 `dsh-better-sidebar/lib/client.js:848 / :912` 同判据同算法**（同 `htmlUrl` 与宿主 `encodeHtmlUrl` 的关系），两处 fs 调用点（列表 / 15 秒轮询）先折算；显示层照旧显示配置原文。契约测试补三条：折算边界表 + `listDiagrams` **生产路径**（**加完先跑见红**：`actual 'docs/diagrams'` vs `expected 'C:/proj/docs/diagrams'`，fail 1 / pass 45）+ **接线守卫**（源码里再出现 `"fs.tree", { path: dir }` 这种原样透传即判红 —— 假 `/sidebar API` 从不执行宿主的校验，这条链路此前**零覆盖**）。

## [0.8.0] - 2026-10-06

**图册空态一键生成（新能力）+ 过程域缺口收口（45 → 49 张卡）+ atlas 修复批（P1/P2/P3/P4/P5/P7/P9）。** 按升版判定表「加能力 → 次版本」走 `0.7.2 → 0.8.0`；`vendor/**` 上游代码一字不动。本节 = `v0.7.2` 之后那个 `[未发布]` 节累积的全部条目（对照 `git log --oneline v0.7.2..HEAD`）。

**升级注意四行**：**不适用** —— 本次无破坏性变更（旧回执、旧目录约定、旧命令参数都照旧；`atlas validate --json` 与 `doctor --json` 只是多一个 `spawnError` 字段，属追加）。

**已装用户需要动作**：本批含客户端半（`lib/client.js`），须**更新插件**（插件面板或「图册」页脚「更新」）并**重启 DSH**，新按钮才会出现；`skills/` 随包分发，不更新则 4 张新卡与新标签页动作都不会出现。自检一条：图册 / 自进化页脚显示 `v0.8.0`。

**同批发现（只登记，不改历史）**：本文件里还有**第二处** `## [未发布]`（在 `[0.6.0]` 与 `[0.5.0]` 两节之间，内容是 2026-10-05「V6 补卡批 · 流程三处补强」＝ 卡数 41 → 45）—— 而那批的提交 `3dd7486` **正是 `v0.5.0` tag 指向的提交**（`git rev-list -n 1 v0.5.0` 实测），也就是那节内容**早已随 v0.5.0 发布**、标题却还自称「未发布」：5-6 卡的动作②（「未发布」转正式节）在那次发布里漏做了。**本次不改它** —— 5-6 卡禁止改写已发布条目，改标题就是动历史；处置留用户裁决（推荐**追加**一行说明，而不是改标题）。

### 2026-10-06 · 图册空态一键生成（新能力 → 次版本 0.8.0）

**需求**（用户指令「开始建设，选用方案A」）：图册里**还没有架构图**时，给一颗能点的按钮把 agent 叫起来（此前只有「复制提示词」，人还得自己切窗口粘）。调研与范围见 `design/atlas-generate-button.md`（2-1 + 2-2 合并件，档位 **M**）。

- **判据**：**两种「还没有架构图」都给入口** —— ① 目录读完了、且没有任何 `architecture` 类型图纸（空目录、以及「只有非架构图」都算）；② **目录还不存在**（`missingDir`，首次使用 / 新项目就是这种）。只认 ① 的话，最需要它的时刻（还没画过任何图、`docs/diagrams/` 尚未创建）按钮反而不出现——本仓自己就是这种形态。其余读取失败不给：那时该先修环境，放个按钮会把人引到错方向。
- **机制**：`lib/client.js` → `POST /sidebar/api/sidechat.start`，body 带 `sessionId` / `cwd` / `question`（提示词里带上用户配置的图纸目录）。它开的是 `origin: subagent` 的子会话（不进主会话列表），图纸落盘后由图册既有的 15 秒指纹轮询自动出现。**不新增宿主接口、不触「新增对外接口」红线**——被否的方案 B（自建宿主路由注入主会话）理由见该文件 §2。
- **失败如实上报**：父会话不在 `agents` 注册表时宿主回 409、侧聊服务缺席时 404，两种都把宿主原文显示出来，不许静默；生成中同一颗按钮禁用 + 文案切换。
- **可测性**：判定与渲染抽成纯函数 `generateBlockFor` / `startSidechatGenerate` 并进 `__internals`（假 React 跑不了 effect，「目录读完了」那一帧在 Node 里驱动不到），新增 4 条契约断言。**变异验证**：把「已有架构图就不再引导」改坏 → 语法正常、**恰好该条判红**、其余 44 条照旧全绿。

### 2026-10-06 · atlas 修复批（我们自己的代码；`vendor/**` 代码一字不动）

- **P1 · CLI 把「进程起不来」伪装成「渲染器判失败」**（`skills/roadbook-atlas/bin/atlas.mjs`）：旧代码把 `status: null` 压成 `1` 并丢掉 `result.error` ⇒ `doctor` 只报一句无原因的「vendored doctor 退出码 1」、`guide` 静默退出 1、`validate --json` 给出 `{"ok":false,"raw":""}` 这种**不可证伪的红**。现在 spawn 失败单列 `spawnError`，四处（doctor / render / validate / guide）都说明「这是环境问题，不是规格问题」。断言用不存在的 `--root` 确定性复现（真机沙箱曾以 EPERM 命中此路径）。
- **P5 · `relativePath()` 越界切片**：`resolve(target).slice(resolve(root).length)` 在 target 不在 root 下时产出**截断后的错路径**并写进回执。改为越界退回绝对路径；断言跑一次真实渲染，要求回执里的路径**指向真实文件**。
- **P7 · 规格 >512 KB 被截断时静默丢信息**（`lib/client.js`）：`readJson` 见截断返回 `null`，调用方于是静默丢 title/type、且「规格已改」恒判没变。现在截断单列（`{truncated:true}`）→ `specChangedAfterRender` 判 `unknown`（不许拿截断长度比出 changed、也不许对空文本算哈希），行上明说 `spec truncated (>512 KB read limit)`。
- **P3 · `plugin/roadbook-atlas/README.md` 四处与磁盘不符**：供应商清单路径写错（真身在 `vendor/archify/` 下）、「四个子行」实为六行、测试清单「34 项」只列 6 个文件（实际 12 个）、冒烟测试被描述成「断言 9/9 与三次同 SHA」（实际只断言 exit 0 + >100 KB + `ok!==false`）。全部按实测改写，并写明「条数以命令输出为准，不要手抄」。
- **P4 · atlas 的 `SKILL.md` 不在 frontmatter 仪器覆盖内**：`test/skill-frontmatter.test.mjs` 的 FILES 只列了两份 `roadbook` 的 SKILL.md，于是 atlas 多带的 `license:` 键没人拦（宿主只注入 name + description，非标准键一律删）。纳入清单 + 删该键——这道仪器正是 BUG-001（技能因非法 YAML 从未进技能目录）留下的。
- **P2 · 供应商清单从「声明」变「判据」**：新增 `test/vendor-provenance.test.mjs`——逐文件字节数 + SHA-256 双向比对（含两个方向的孤儿）、全树聚合值按写明口径复算、汇总算术自洽。同批订正记录：汇总字节数此前把**记录文件自身**按旧尺寸计入（1 657 356 → 实测 57 个派生文件 **1 642 885**），记录自身尺寸改为不记；**全树聚合值旧值 `d431d364…` 用任何常见排序 / 行格式都复现不出来**（三种排序 × 四种行格式共 12 种组合实测全不符），改为按确定性规则（字节序排序 + `<sha>␠␠<路径>` + 末尾一个换行）重算，并把规则写全、一行命令补 `LC_ALL=C`。
- **P9 · 记录自相矛盾**：`VENDOR-PROVENANCE.md` 写 "Exactly **four** upstream files are not vendored"，而紧随的表列 **5** 行、下文又写 "these **five** HTML files"；上游 62 − 5 = 57 才对得上账。已改为 five，并把这算术做成新测试的断言（4/5 之争就是这么来的）。
- **登记为技术债（上游 archify，本批不动）**：`scripts/generate-validators.mjs` 被 `schemas/README.md` 引用但未 vendored（383 KB 生成物无法复现漂移检查）；`assets/template.html` 有真实外链（Google Fonts）而 9 项产物检查**无一项查外链**；`check-render-output.mjs` 在无图例时 `legend_clearance` 无条件通过（「9/9」不是统一标尺）；`bin/archify.mjs:1444` 硬编码 `/dev/null`（Windows 隐患，对 atlas CLI 无实际影响）；退出码 2 语义重载。整表见 `design/atlas-generate-button.md` §6.2，下次 vendor 升级时即升级清单。

**本批测试与门禁**：`node --test "test/*.test.mjs"` **160/160**、`plugin/roadbook-autoload/test/*.test.mjs` **94/94**、`plugin/roadbook-evolve/test/*.test.mjs` **33/33**；`powershell -NoProfile -File _qc/check.ps1` 退出码 0（本机需 `-ExecutionPolicy Bypass`，见下）。

**环境记录（本机实测，供下一个人）**：本机 `powershell -NoProfile -File _qc/check.ps1` 被一条**路径级**执行策略挡住（`The file ... is not digitally signed`），而 `%TEMP%` 下的**同内容**脚本可以跑；该文件无 MOTW 数据流、无重解析点、`Get-ExecutionPolicy` 报 `RemoteSigned`。等价命令 = `powershell -NoProfile -ExecutionPolicy Bypass -File _qc/check.ps1`（**进程级**，不改机器状态）。CI 用的是 `pwsh`（本机 PATH 上没有）。

### 新能力

- **卡数 45 → 49：过程域缺口全部收口（4 张新卡，中英各一份）**。§18 登记的"1 项待补 + 3 项薄覆盖"**不是新发现**——它们在上一轮就已经写下；本轮只是执行 §18 自己列的合法处置之一（补卡），判据是**先有缺口登记、后有卡**。逐项对应：
  - `3-7 架构定义`（`ARCH`，补 0 张卡的空白）——边界三问 / 干系人与关注点表（每个关注点必须有视图认领）/ 四张视图（上下文·模块·运行时·数据）/ **质量属性场景 ≤5 条（刺激→响应→度量，阈值不许现编）** / 权衡记录 ≥3 条（`选了 X ｜ 换来 Y ｜ 代价 Z ｜ 何时翻案`）/ 演化口子 ≥2 条。与 `3-1 设计` 的分界：架构答"系统是什么"（半年不变），设计答"这次怎么做"。产物 `docs/ARCHITECTURE.md`。
  - `4-6 可用性验证`（`VER`，补交付前那一端）——12207 把验证（做对了吗）与确认（做的是要的吗）分成两个过程，`4-3` 只承担前者。任务设计 3–5 个（四件齐，含 ≥1 冷启动任务）/ 参与者 ≥1 人且**不是写代码的人**（单人档走"冷启动自测"分支并显式声明）/ 观测表六列（原话逐字、猜测单列）/ 问题定级三值（阻断·摩擦·皮痛）/ **禁止把 4-3 的命令输出当可用性证据**。产物 `docs/specs/.../USABILITY.md`。
  - `5-7 配置管理与基线`（`CM`，补基线/变更控制/状态记账）——**单一事实源表**（每类事实一个权威位置 + 派生位置 + 验一致方式）/ **死元数据排查**（有代码读吗·有人看吗·它对不对，三问全否只许"删除"或"接上机器检查"）/ 副本一致性检查要跑出真实输出 / 基线四要素（tag + 变更日志节 + 归档目录 + 校验和）/ 变更控制表（改门禁口径·判据·宪法·卡头格式·对外契约**必须停下问用户**）/ 状态记账。活证据正是上一轮修掉的那条：四个子包 `version` 长期停在 `0.1.x` 而伞包 `0.7.2`。产物 `docs/BASELINE.md`。
  - `6-8 决策复盘`（`RISK`，补事后复盘）——`6-5 复盘`由**故障**触发，只在出事后开；本卡由**时间**触发（决策卡满 5 张 / 里程碑后 / 复核日到期）。逐条对账三列（逐字引用的原假设 / 带证据的今天实际 / 四值结论），**四值 = 成立 / 侥幸成立 / 不成立但没代价 / 不成立且已付代价**（没有第五种）；**"侥幸成立"专项**是本卡最值钱的一段（结论对、理由错 = 下次照抄必然踩坑）；结论必须落到具体文件。产物 `docs/decisions/REVIEW_<日期>.md`。
  - **同时修掉 §18 里一处悬空引用**：`RISK` 行原写"有决策记录无事后复盘 → 见下方技术债"，而下方只有三项、没有它。
  - 反悔线保留：4 张卡各自必须有**独占的触发条件、独占的产物、独占的过程域**，三者任一与既有卡重合就该退回裁剪——这条写进 §18，用来挡住"为了让矩阵好看而批量建卡"（§12 要防的那件事）。
- **结构联动（45 → 49 全库同批）**：§4 表 + §4.1 表各 4 行 / §4 档位新增三条线（**架构线**、**可用性线**、**决策线**）/ 横向卡补 `5-7`·`6-8` / `L` 档发布链插入 `5-7`（发版前基线先行，`5-6` 定号、`5-7` 钉成基线）/ `SKILL.md` **双份镜像**路由表 45 → 49 行 / `README.md`·`START-HERE.md` 卡数与档位链 / 写作契约 §1·§3 / `_qc/check.ps1` 卡数断言 + 8 条新 needle。
- **`route.mjs` 接线**：`STEPS` 29 → 31（`3-7` 锚点「项目首次成型」、`4-6` 锚点「交付前要给人用」）；新增第 12 个事实 `structChange`（agent 回填：这次改动会不会改变系统结构）——没有它，已有项目的结构变更永远路由不到 `3-7`。`tentative` 列表补 `4-6`。
- **模板 `docs/ARCHITECTURE.md` 补 §6~§8**（边界三问 / 干系人与关注点 / 质量属性场景与权衡），行数上限 120 → 150；同批改 `1-3`（中英）与 `5-1`（中英）里的 ARCHITECTURE 预算，以及 §8 与 §5 目录树两处口径——**四个数字必须同号**。

### 修 bug

- **过程域覆盖的汇总行从来没有打印过**（仪器在、报表是空的）：上一轮写的 `Observe "过程域覆盖：…"` **漏了第一个布尔参数**——PowerShell 不报错，字符串被当成 `$ok`（真值）、`$msg` 为 `$null`，于是每次门禁只输出一行空的 `[obs] `。断言一条不少（缺行/越界/不一致/无人认领四条都在判），**只有给人看的那一行静默消失了**，而连跑两轮都没人发现——因为没人会去检查"一行空白"。修法：补上 `$true`；并给 `Observe` 加**仪器自检**（`$ok` 必须是布尔、`$msg` 不许为空，否则 `throw`），把这类"漏参数不报错"的写法永久挡在门外。修复后首行：`[obs] 过程域覆盖：13/13 项有卡覆盖；无待补、无缺口`。
- **写作契约 §1 要求"四段用 `---` 分隔"，但没有任何断言盯着它**（又一处"契约说了、机器不管"）：`3-5` / `3-6` 两张卡（以及本轮新写的四张）**全都没有分隔线而门禁一直判绿**，而其余 42 张中文卡都有。修法：六张卡补上分隔线（每段标题前一条 `---`，与既有卡逐字同形），`_qc/check.ps1` 新增断言——每张动作卡的四个段标题，**向上跳空行后的第一条非空行必须是 `---`**（`0-1` 无常驻四段，豁免）。
- **`_qc/check.ps1` 自身行数上限在两处，已经漂过一次**：§8 写着 `≤730 行`，而断言里的上限早已是 790 —— 正是本文件自己警告过的"同批改一处漏一处"，而且没有机器盯着。修法：断言的上限提取为 `$selfCap` 变量，并新增一条断言，**从 §8 正文正则读出 `自身 ≤N 行` 的 N 与 `$selfCap` 比对，不一致即判红**。（本轮 `810 → 850`，两处同批改。）
- **§18 自称"派生视图，不手抄"，却又手抄了一份 `过程域 → 承接卡` 的矩阵**：两份事实源必然有一天不一致，且不一致时没人知道信哪份。不删它的前提是**它不再能漂** —— 新增两条反向核对：① 表里列出的每张卡必须真带该过程域（读卡头第 3 行）；② 表覆盖的过程域集合必须等于卡头实际出现的集合。两处不同批改即判红。同批把 `AGENT` 行的父注移出卡格（原写法让卡的解析被静默跳过，等于那一格没被核对）。
- **`route.mjs` 看不见多位数卡号，而 `--audit` 判「双语无缺份」绿（假绿）**：`ID_RE` 原为 `/^(\d-\d)-(.+)\.md$/`，第二位只认一位数字 —— 2026-10-06 新增的 `7-10-技术栈迁移` 因此对扫描器**不存在**：`--audit` 报「44 张 · 判绿」，而 `playbook/` 与 `playbook_EN/` 各有 45 个文件、`design/v6-design.md` §4 表 45 行、`_qc/check.ps1:63` 断言 45。一张卡对扫描器不存在 = 路由永远到不了它，而门禁与 `roadbook-evolve` 的 S6（只看退出码）**双双判绿**。修法：`ID_RE` 放宽为多位数字；`scanDir` 把认不出的 `*.md` 收进 `unparsed`；`audit` 逐条判红。**防线**：A1 由 `cardsCn >= 41` 改为「扫描到的卡数 = 磁盘上的 `.md` 文件数」，新增 A2b 反向对照（合成一个认不出的文件名 → 必须报红）。
- **CI 未 pin action、未声明最小权限（违反自己的 4-4 卡）**：`actions/checkout@v4` 与 `actions/setup-node@v4` 跟随浮动 tag，且整个工作流**没有 `permissions:` 段**（不写就继承仓库最大默认权限）。实测 `refs/tags/v4` 已指向 `11d5960a…`，与 `v4.2.2` 的 `11bd7190…` 不是同一个 commit —— 跟着 tag 跑 = 把执行权交给上游。修法：两个 action 各 pin 到 40 位 commit SHA（`checkout` v4.2.2 / `setup-node` v4.4.0）+ 顶层 `permissions: contents: read`。同批把第二步的测试 glob 补齐到与根 `package.json` 的 `scripts.test` 一致 —— 原先漏了 `plugin/roadbook-evolve/test/*.test.mjs`，而那一行的注释写着「同口径」。

- **过程域维度：卡头第 3 行 `> 过程域：` + 受控词表 13 项 + 机器汇总的覆盖矩阵**（2026-10-06 第一轮）。阶段号回答"什么时候做"（时间维度），过程域回答"这是哪一种能力"（能力维度）——两个维度正交。词表定义在写作契约 §1.1（可指到 ISO/IEC/IEEE 12207:2017 / 15288 / 42010 的过程），**数据在每张卡的卡头**（随包分发、执行期可见），**矩阵由 `_qc/check.ps1` 汇总打印**（不手抄——手抄一份必然与卡漂移）。45 张卡里 `0-1` 豁免（常驻入口、无四段结构），其余 **44 张 × 中英 = 88 个文件**各加一行。
  **新增 7 条机械断言**：契约 §1.1 与 §18 存在 / 每张动作卡有过程域行 / 取值在词表内 / 中英同卡号取值一致 / 每个过程域要么有卡覆盖要么在 §18 显式点名 / 子包 `version` 跟随伞包。首轮汇总：**12/13 项有卡覆盖**，`ARCH`（架构）无卡 → 在 §18 登记为"待补：新卡 3-7"。
- **`design/v6-design.md` §18 过程域覆盖矩阵（派生视图说明）**：写清三层分工（定义 / 数据 / 视图）、判定规则、覆盖状态快照、**显式裁剪**（协议组 / Portfolio / HR / 能力建设——沿用 §16 的"单人档不补组织级"裁决，各带触发条件）与**三项技术债**（CM 的基线/变更控制/状态记账、ARCH 架构定义、VER 的可用性验证）。§16 保留为历史不改写。
- **子包 `version` 归位**：`roadbook-autoload` 0.1.1 / `atlas`·`evolve`·`team` 0.1.0 → 全部 `0.7.2`。四个子包都是 `private: true` 且不独立发行，长期停在 0.1.x 属**死元数据长得像事实**——现在由断言守着。

## [0.7.2] - 2026-10-06

**两个「静默不注入」的根因修复：技能从来没被读进技能目录 + 分叉会话被误判成子代理。** 实测 `%TEMP%\roadbook-autoload.jsonl` 166 行里 `inject` 事件 **0** 条 —— 插件是活的（`loaded` 39 / `banner` 41 / `team` 5），但流程正文一次都没进过上下文。按「修 bug → 修订号」走 **0.7.2**。

### 根因一（P0）：`SKILL.md` 的 frontmatter 是非法 YAML，被宿主整份丢弃

`skills/roadbook/SKILL.md` 的 `description` 是**未加引号的 YAML 朴素标量**，其中第 378 字符处有一个 ASCII 冒号+空格（`…when no process is wanted: a one-off question…`）—— YAML 把它读成嵌套映射。用 profile 里同一个 `yaml` 包、按 `dsh-skill-filesystem/lib/index.js:780-806` 的 `parseFrontmatter` 逐行复刻实测：

```text
[roadbook]       parseFrontmatter THREW -> invalid YAML frontmatter
                 Nested mappings are not allowed in compact mappings at line 2, column 14
[roadbook-atlas] YAML OK | keys=name,description,license        ← 对照组
```

抛错被 `:672` 的 catch 接住、只打一条 warn 就 `return` ⇒ **该文件被忽略** ⇒ 技能目录里没有 `roadbook`（`skill("roadbook")` 当场报 `unknown`，而同 provider 分发的 `roadbook-atlas` 在）⇒ 自动加载落 `skip/no-skill`（观测里 07:58:28Z 与 10:41:25Z 两次，cwd 均为本仓）⇒ 正文永不注入。

**为什么两天没被发现**：`_qc/check.ps1` 为 frontmatter 写了**九条**断言，但**全部走正则**（`:593` 按行切 `---`、`:594` 抓键名、`:597` 切 description）——正则读得懂非法 YAML，所以九条全绿。这正是本仓最反对的**假绿**：断言看着密，方向不对。

### 根因二（P1）：分叉/续接会话被 `isSubagentHeader` 误判成子代理

`trigger.js` 的 `isSubagentHeader` 先看 `parentSession` 非空就判 true。解压真实会话头实测：**4 个真子代理**是 `delegationDepth=1, isSeeded=false`，而**分叉出来的用户会话**是 `delegationDepth=0, isSeeded=true` 且同样带着 `parentSession` ⇒ 用户会话被判成子代理、整轮不注入（本会话 02:11:07Z 那条 `skip/subagent` 即此）。DSH 早已提供权威字段 `delegationDepth`，判据不该拿 `parentSession` 代替。

### 修复

- **`SKILL.md` 与 `skills/roadbook/SKILL.md`（B4 镜像，同批）**：`description` 值**加双引号**——正文一字未动，文件字符数 8189 → 8191，解析后 description 仍 496 字（≤ `catalogDescriptionMaxLength` 500）。
- **`plugin/roadbook-autoload/trigger.js`**：`isSubagentHeader` 改为**优先认 `delegationDepth > 0`**；宿主没给该字段时才退回旧的 `parentSession` 判据（保守，不放松）。
- **`_qc/check.ps1` §4**：新增 YAML 安全断言——frontmatter **未加引号**的值不得含 ASCII「: 」；其自身上限 720 → 730（同步 `design/v6-design.md` §8）。
- **`design/v6-design.md`**：§13 机制要点②补「frontmatter 必须是合法 YAML」与本次实例；§15 补子代理判据的口径修正。

### 本轮已有证据（修复过程中实测）

- **新断言有牙**：加完断言、`SKILL.md` 尚未修时跑门禁 → `[FAIL] SKILL.md frontmatter 未加引号的值不含 ASCII「: 」`、退出码 1。
- **变异验证**：把 `isSubagentHeader` 换回旧实现放进临时副本 ⇒ 用例 `分叉/续接会话不算子代理` **恰好 1 条红**；本仓实跑 `plugin/roadbook-autoload/test/*.test.mjs` **94/94 绿**。
- 收尾门禁与三套测试的完整输出见本次提交的粘贴回执。

### 已装用户需要动作

`skills/` 随包分发，**必须更新插件**（插件面板或「图册」页脚「更新」）并重启 DSH，技能才会进技能目录；本地路径安装的机器需要重新 `pnpm add`。更新后自检一条：`skill("roadbook")` 应当可加载 —— 报 `unknown` 就是还没生效。

## [0.7.1] - 2026-10-05

**真机「应用无法启动」的根因修复：客户端半的顶层 `inject` 必须为空。** 0.7.0 装上去后 DSH 弹「应用无法启动或已意外停止」，正文是 `web boot: 1 entry did not activate / roadbook: import failed (see console for the import error)` —— 而**控制台里其实没有任何 roadbook 的错误**。按「修 bug → 修订号」走 **0.7.1**。

### 根因（三段证据，逐条可复现）

- **那句提示在误导。** DSH 前端的 boot 审计（`dsh-web-frontend/dist/assets/index-5SrrfWpU.js`）对每个 loader 条目先查 `modules.importError(id)`：**只有查不到导入错误时**才打这条「see console for the import error」兜底文案 —— 它出现恰恰等于「没有任何导入错误可看」。而 `importError` 只读 import/prefetch 失败表（`dsh-client-modules/lib/client.js:765`），`loader.create()` 与条目级的失败根本不进那张表。
- **同一句话今天已经打给过别的插件。** 14:59 那次崩的是 `dshmarket: import failed (see console for the import error)`（当时我的 0.7.0 还不存在），17:48 那次是 `roadbook: failed`（装的是 0.4.1，控制台里真凶是 `Uncaught Error: list slot "plugins.item" requires options.id`）。这条提示既不是本轮引入的，也不指向具体缺陷。
- **我的导出没有被 cordis 拒收。** 把 DSH 自带的那份真 `@deepseek-ai/cordis` 4.0.4 从 `app.asar` 取出来当接收点（`ctx.plugin(exports)`）：0.4.1 与 0.7.0 **都被接受**；`factory(require)` 干净、`apply` 在零服务下零异常零警告。区别只有一处：

  | 版本 | 顶层 `inject` | 真 cordis 里 `ctx.plugin()` 的结果 |
  | :--- | :--- | :--- |
  | 0.4.1 / 0.7.0 | `['betterSidebar']` | **PENDING**（服务没到就永远不激活） |
  | 0.7.1 | `[]` | LOADING → **ACTIVE**（零服务也起得来） |

  PENDING 在审计里**同样**算「did not activate」→ 照样 `throw` → 应用打不开。也就是说：**只要 better-sidebar 缺席或稍晚到位，RoadBook 就让整个 DSH 起不来** —— 而「用户把 better-sidebar 关掉」是完全正常的状态。根因就是这一行。

### 修复

- **`lib/client.js` 改为 `var inject = []`**，两个外部服务一律走作用域注入：`slots`（原有）与 `betterSidebar`（新增 `registerSidebarTabs`）。作用域注入只产生子 fiber、不是 loader 条目，不参与那次审计 —— 没有 better-sidebar 就没有「图册」「自进化」两个标签页，但 DSH 一定起得来。
- 同一条规则仓库里已经写过两遍（宿主半读 `webServer`、自进化行的空 inject），这次是第三处。`_qc/check.ps1` 的断言从「inject 必须含 betterSidebar」**反转**成「顶层 inject 必须是空数组 + slots/betterSidebar 都走作用域注入」，并锚到代码行（`(?m)^\t\tvar inject = \[\];`）—— 注释满足不了它（四条变异逐条实测：好=真 / 坏=假 / 注释=假 / 把接线注释掉=假）。
- 测试夹具跟着改严：`strictCordisCtx` 补上 `inject(deps, cb)` 的真实语义（服务不在 ⇒ 回调不被调用；在 ⇒ 回调拿到注入过的子 ctx），新增 `sidebarCtx` 作为生产形状的唯一来源。原先那批「假 ctx 把 betterSidebar 当普通属性直接给」的用例，正是让这个缺陷整套测试全绿的原因。

### 复核遗留（未修，属 DSH 侧）

审计把「条目还没被物化」与「条目真的坏了」判成同一件事，再配一句指向控制台的兜底文案；14:59 与 22:08 两次崩溃各自只命中**一个**条目、而且是不同的插件。0.7.1 只消掉了 RoadBook 这条确定性路径，没有修 DSH 的那条竞态。

## [0.7.0] - 2026-10-05

**更新入口升为一等公民 + 升级生效对账**：更新能力此前只有「侧栏图册标签页页脚」一个落点——不看图册的用户永远不知道有新版本，而且「安装命令退出码 0」与「新版本真的在跑」混为一谈（界面只能说一句「重启 DSH 后生效」，永远没有下文）。按「加能力 → 次版本」走 **0.7.0**。

### 新能力

- **插件详情页的「检查更新」入口**（用户裁决 Q1=A / Q2=A）：注册进 DSH 内置插件页（侧栏「插件」→ roadbook 组合包详情）声明的三个 list slot —— `plugins.detail.actions`（页头控件，在页面自己的开关与卸载**之前**）、`plugins.detail.badge`（标题旁一枚标签）、`plugins.detail.section`（页面内容之下的区块：状态一句话 + 运行/磁盘/上游三个版本 + 升级对账 + 上次检查时间）。每个条目都按页面的 `subject` 门控：**只认 `{ kind: 'bundle', pkg.name === 'roadbook' }`，其余一律返回 null** —— 这三个 slot 在**每一个**插件的详情页上都会渲染，不做门就等于跑到别人的页面上说话。
- **接线走作用域注入**：`ctx.inject(['slots'], …)`，服务缺席或 slot 永不被声明就什么都不发生。把 `slots` 写进 `inject` 会让服务缺席时本行停在「未激活」，而 DSH 的 web boot 把任一未激活条目判成致命错误 —— 那是 0.4.1 那次「应用无法启动」的同一类事故（`_qc/check.ps1` 当时按这条口径加了断言）。**→ 这条口径本身在 0.7.1 被推翻**：`inject` 里留着 `['betterSidebar']` 是同一个错误的另一半（顶层 inject 只要不为空，服务缺席/迟到就让本行 PENDING），见上节。
- **升级生效对账（闭环）**：`lib/update.js` 新增两个纯函数 —— `lastApplyTarget()` 从观测文件里取最后一次 `apply-finish` 的**目标版本**（`after` 为空串的那次不算：`pnpm` 的 "Already up to date" 没换掉任何东西），`upgradeOutcome()` 把「目标版本」与「本进程加载时的版本」（`bootVersion`）对成四态：`applied` / `pending`（还没重启）/ `newer`（此后被别的版本盖过，不对这次更新下结论）/ `unknown`（读不到）。状态路由把它作为 `status.upgrade` 发出；界面据此把徽标切成「待重启」并如实报出两个版本。
- **三个版本号分开报**：运行版本（`bootVersion`，重启才会变）／磁盘版本（`installedNow`）／上游版本（`latest`）。装完没重启时磁盘已是新版、内存里还是旧的 —— 合成一个数字就是把这件最容易被误读的事藏起来。

### 优化（对照本轮方案 O1–O5）

- **O1 手动检查穿透冷却**：详情页按钮一律走 `?force=1`（宿主冷却只约束自动轮询），请求在飞时按钮置灰（`detail.checking`），并发仍由宿主的 `state.checking` 单飞兜住。
- **O2 版本单一来源**：更新相关的界面文案只读**宿主 status** 的版本字段，不再拿客户端编译进 bundle 的常量当「当前版本」。
- **O3 提示不再依赖「打开图册」**：徽标进插件详情页标题旁。
- **O4 升级生效可见**（见上「升级生效对账」）。
- **O5 拒绝原因可见**：`agents-busy` / `no-applier` / `mode-off` 等宿主拒绝理由随状态进区块，不再只进日志。

### 边界与代价（明说）

- **客户端半整体仍 gated on `betterSidebar`**：`inject` 保持不动是有意的（见上），代价是**没有 better-sidebar 的部署上，这两个标签页与详情页贡献都不会出现**。代码里、README 与本节都写明这条耦合。
- **三个 slot 名是 DSH 内置插件页声明的**：DSH 若改名，本贡献**静默不出现**（`slots.inject` 只是在等），不会报错也不会降级显示 —— 这是它的失败形态，排查时先看 `plugins.detail.*` 是否还在。
- **详情页贡献随 `roadbook` 主行同生共死**：`dsh-client-modules` 只把一个包的浏览器半挂在说明符恰为包名的那一行 Loader 行上；关闭主行 = 这三处贡献一起消失（这是设计，不是缺陷）。
- **手动「检查更新」是真的打远端**：穿透冷却意味着每点一次就发一次请求，界面用「检查中」态与单飞合并兜住连点，不额外加静默冷却窗口（静默窗口会让用户点了没反应，正是本次要修的那类体验）。

### 提交后独立复核（只读对抗式，两条 P1 + 三条 P2，逐条已修）

复核对象 = 提交 `27a8958`；复核者不参与写，只交结论。**它打穿了本批自己的两处「假绿」**：

- **P1① 空转的安装被算成「已生效」**（`lib/update.js`）：`lastApplyTarget` 原来只挡 `after === ''`，而 `pluginVersion()` **永不返回空串**（读不到时回 `unknown（…）`），`pnpm` 的 "Already up to date" 落的是 `after === before`（非空）⇒ 界面会说「上次更新已生效：v0.7.0 → v0.7.0」，而盘上什么都没换 —— 正是图册更新条专门拦掉的那句假话。修法：只认**最后一条** `apply-finish`，且它必须 `exitCode === 0`、`after` 可读（非空且非 `unknown…`）、`after !== before`；不合格就到此为止，**不用更早的一条冒充这次**。
- **P1② `before` 从不进状态，文案恒显 `v?`**（`lib/index.js` + `lib/client.js`）：`upgradeOutcome` 只回 `state/target/running`，而界面那句「已生效：v{before} → v{target}」要用 `before` ⇒ 永远显示 `v? → v0.7.0`；而测试夹具自造了 `before` 字段，所以测不出来（**夹具比生产宽松 = 假绿**，与 0.4.1 那次同一个病）。修法：状态补 `before: landed?.before`，夹具改用宿主真实形状。
- **P2① 三条门禁断言是恒真空断言**（`_qc/check.ps1`）：只 match 标识符会被注释、JSDoc 与 import 行满足 —— 复核实测「把 `upgradeOutcome` 的 return 改成 `'unknown'`」「删掉 `upgrade:` 字段」都仍然判绿。修法：锚到代码行（`export function …` / `state: order > 0 ? 'newer' : 'pending'` / `upgrade: upgradeInfo()` / `[DETAIL_ACTION_SLOT, "roadbook-update-action"`），并逐条做变异验证。
- **P2② 读不到被算成「已生效」**：`upgradeOutcome` 的字面相等兜底会把两个相同的 `unknown…` 降级串判成 `applied`。修法：`readableVersion()` 先把 `unknown…` 归成「读不到」⇒ `unknown`。
- **P2③ 警告文案指错对象**：`warnRegistration` 固定写「标签页 X 注册失败」，详情页 slot 失败也走它。修法：文案去掉「标签页」。

**复核确认没问题的**：三个 slot 名 / `({t, subject})` 形参 / `subject` 三种形状 / 按 `order` 排序 / 对无话可说的 subject 返回 null，与 DSH 内置实现逐条一致；`inject` 仍只有 `betterSidebar`；外壳不调 hook、别人的详情页零请求；`updateStripText` 与旧内联实现逐字等价。**复核留的一处不确定已按证据消解**：`order: 20` 是官方 slot 文档明写的注册项（「带 `id`、`order` 和本地化的 `label` 注册」），内置插件页自己也用 `entry.options.order ?? 0` 读它，故保留。

### 测试与验收

- `node --test "test/*.test.mjs"`：**141/141**（`update.test.mjs` 38 → 41：新增 `lastApplyTarget` 尾部取值与空 `after` 不计、`upgradeOutcome` 四态 + 读不懂版本串时退回字面相等、状态路由带 `upgrade` 对账；`client-contract.test.mjs` 35 → 41：新增三个 slot 的注册形状与 `inject` 未被污染、`ctx.inject` 读属性即抛时标签页照注册、subject 门（别人的页面返回 null）、**壳在别人的页面上一个 hook 都不调**、能力关闭时三处一起不出现、有新版/待重启两档判定）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"`：**93/93**；`node --test "plugin/roadbook-evolve/test/*.test.mjs"`：**33/33**。
- `powershell -NoProfile -File _qc/check.ps1` 见本次提交的粘贴输出。
- 版本口径：根 `package.json` = `0.7.0` = `lib/client.js` 的 `PLUGIN_VERSION`（`client-contract` 逐字核对）。
- **真机验收需要人在场**（装新版本 + 重启 DSH 属不可委托）：本机 profile 装的是 0.4.1，上游 0.6.1 —— 这条链本身要等装到 0.7.0 之后才能在真实插件详情页上看到三处贡献。

## [0.6.1] - 2026-10-05

**独立复核后的修订批**：0.6.0 发布（commit `cb74295` + tag `v0.6.0`）之后，独立只读复核（共享任务板 task-3）报了 5 类问题，本批全部修掉。按 5-6 卡的升版规则「修 bug / 改文案 / 改文档措辞 → 修订号」走 **0.6.1**。

### 修掉的（逐条对应复核原文）

- **S1 的「本机实测」不是实现能产出的形状**（轴 5·不通过 1）：README 与 design §17.5 都写 `65/468`，而实现是「命中测试痕量的**记录数** ÷ 两份文件的**记录总数**」——`65` 是 `apply-start/apply-finish` 的**对数**（记录数是 130），`468` 是单文件总数（分母是两份之和）。三处同批改为 **`130/632`**，并标明它是**带时点的快照**（该读数随观测文件长度增长而变）。
- **悬空互引**（轴 6）：CHANGELOG 与 design §13 都指向「`[0.6.0]` 节『tag 例外』」，而那一节里没有这个条目。tag 记录改落在**本节**的「tag 例外」，两处指针同批改正。
- **「不新增落盘产物」与实现相抵**（轴 5·不通过 2）：`plugin/roadbook-evolve/README.md` 采集行的前半句与实现不符（本行确有 `<os.tmpdir()>/roadbook-evolve.jsonl`，README 自己在「自身活性」一节也承认）——改为「不写仓库文件（观测落 tmpdir）」。
- **计数口径 5 处不同步**（轴 2）：`_qc/check.ps1` 的两条断言文案（`$umbSub` 6 键、`$umbRows` 6 项，标签却写「五个」）、`cordis.patch.yml` 头注释（五条/四条/四行 → 六条/六条/六行，并把 `roadbook-evolve` 补进行清单）、根 `README.md` 插件一节（枚举漏 `roadbook-team`）、`design/v6-design.md` §17.2 表（漏 team 行）、`test/umbrella-contract.test.mjs` 文件头注释。**这几处恰是本仓库最在意的那类缺陷：机械断言更新了、给人看的清单没跟上。**
- **`signals.js` 注释写了不变量、代码没强制**（复核附注 1）：`signal()` 现在**自己**把「无读数」强制成 `unknown`；`readSource()` 把「既无 `text` 也无 `error`」判成「读不到」而不是「空文件是空的」（附注 3）。
- **`classifyArm` 的文件头口径不实**（复核附注 2）：改为如实描述——命中测试标记 → `suspect`；非记录形状 → `unknown`；其余按 `prod`（这两份文件本就是生产观测口）。

### 守备面补齐（轴 3 的守卫面缺口）

- `test/packaging.test.mjs` 的 `REQUIRED_RUNTIME_PATHS` 补 `plugin/roadbook-evolve/{index.js,signals.js}`——该表自己的注释写着「改 `lib/` 或插件的运行时引用，必须同步这张表」，0.6.0 漏了。今天不红只是因为根白名单用的是目录级条目（`lib` / `plugin`），属**守卫面缺口**而非打包缺陷。

### tag 例外（用户裁决，记录在案）

历史世代号 tag `v0.6.0`（2026-10-03，annotated，message「Roadbook V6 母版 · 首个判据版本（QC 118/118）」）由用户 2026-10-05 裁决**删除并改指插件线 v0.6.0**（`cb74295`）。这与 5-6 卡「已发布 tag 不许移动或删除（禁 `git tag -f`）」相冲突，属**经用户明确裁决的一次性例外**，不是新的通行做法——该规则继续对今后每一个 tag 生效。做法是 `git tag -d` + 重新 `git tag -a`（**没有用 `-f`**）。

> **事实更正**：`design/v6-design.md` §10 第 14 条记载「GitHub 侧建 Release `v0.6.0`」，但 2026-10-05 实测 `GET /api.github.com/repos/Aparencia/RoadBook/releases` = **0 条**、`/releases/tags/v0.6.0` = **404**——该仓库当前没有任何 Release；删 tag 之前它就不存在，不是本批删掉的。该条属历史实施记录（按本仓库口径不追改），此处留一行更正供后人核对。

### 测试

`signals` 18 → **20 例**（新增「来源形状不对判 unknown」「空文件 ≠ 没给来源」两条不变量用例）、`service` 13/13、其余套件不变；`_qc/check.ps1` 复跑结果见提交回执。

## [0.6.0] - 2026-10-05

**新增第六行 `roadbook-evolve`（自进化信号表）+ 客户端半第二个标签页「自进化」**（用户指令：「新增一个自进化 plugin」）。设计记录见 `design/v6-design.md` §17.5。

### 新能力

- **`plugin/roadbook-evolve/`**：宿主半 `index.js`（只做接线）+ 纯逻辑 `signals.js`（可离线单测）。把「流程自己有没有在正常工作」算成六条信号，**三态判定**（`ok` / `hit` / `unknown`）：S1 观测臂污染 / S2 注入活性 / S3 常驻提示可用率 / S4 工作树状态 / S5 规则索引健康 / S6 路由完整性。**判据不复刻**——S5/S6 只记 `rules.mjs --audit` 与 `route.mjs --audit` 的退出码（复刻 = 第二处真相）。
- **两条只读本机路由**：`GET /roadbook/evolve/status`、`POST /roadbook/evolve/tick`；都过 `trustedLocalRequest` 同源守卫，都走可选服务 `ctx.inject(['webServer'])`（读不到只让路由不出现，绝不让整行变「未运行」）。
- **侧栏「自进化」标签页**（id `roadbook:evolve`，order 46）：显示信号表与越界项；`unknown` 显示成「判不了」而不是「正常」。
- **自身活性判据**（本行第一个遵守它自己提的门槛「任何自进化机制必须回答：它怎么被证明还活着」）：每次 tick 写一条 `tick` 观测，超 48 小时无 tick 判 `hit`。

### 边界（V1 明确不做，见 `plugin/roadbook-evolve/README.md`）

不自动开 GitHub issue（凭据 + 台账公开性未裁决 + 外部 CLI 要走 7-9 准入）｜不自动改卡（撞 A6）｜不写仓库文件（默认落 `<tmpdir>`，避免脏树破 B9）｜不跑 LLM harness（属 `schedule` 唤醒的活）。S1 是**启发式**（`fake-` 命令 / 哨兵版本 / 显式 `arm`），判不出的记 `unknown` 单独显示；V2 应由生产者直接写 `arm: prod|test`。

### 变更

- 根 `package.json`：`exports` 增 `./evolve`；`scripts.test` 增第三组 glob。
- `cordis.patch.yml`：`- insert:` 下平铺第 6 行 `roadbook-evolve` → `roadbook/evolve`。
- `lib/index.js`：`HOST_ENTRY_MODULES` 增 `plugin/roadbook-evolve/index.js`（就绪自检的 import 闭包随之覆盖 `signals.js` 与 `lib/update.js`）。
- `test/umbrella-contract.test.mjs`：平铺行数断言 5 → 6；`HOST_ENTRY_MODULES` 断言同步；新增 evolve 导出面三条。
- `_qc/check.ps1`：`$umbSub` 4 → 5 个入口；`$umbRows` **4 → 6 行**——**顺带补齐此前漏登记的 `roadbook-team`**（它此前只在 `umbrella-contract` 里被断言，check.ps1 从没查过它）；新增 evolve 四条断言（打包白名单 / 三态判定 / 两条路由 / `inject` 必须为空）；测试套件 glob 增第三组。
- `design/v6-design.md`：§17.2 工具面表加 `roadbook-evolve` 行（并改「平铺四条」→「平铺五条」）；新增 §17.5 实施记录。
- `README.md`：插件一节「四个子行」→「五个子行」并补 evolve 一句。

### 本批沉淀的一条教训（写进 design §17.5）

宿主半初版 `readGit` 只取 `git status --porcelain` 的**退出码**却写死 `porcelainLines: 0`，S4 因此永远显示「工作树干净」——而纯逻辑测试 **18 例全绿**（它证明「算得对」，证明不了「喂进去的是真数据」）。修法是补 `plugin/roadbook-evolve/test/service.test.mjs`（13 例，注入假子进程与假文件读取），其中一条把「stdout 有行必须判 hit」钉死。**接线层必须有自己的测试。**

## [未发布]

**V6 补卡批 · 流程三处补强（2026-10-05）** —— 用户裁决三项：①想法决定实施前先调研市场成熟方案/同类产品/GitHub 现成轮子 ②版本号管理细节 ③完善项目重构流程。齐套要求：先逐项与用户确认 → 中英同批改卡（`playbook/` + `playbook_EN/`）→ 同步 `design/v6-design.md` → 跑 `check.ps1` 取退出码 0 → 提交。

### 新能力

- **新建 4 张卡，卡数 41 → 45**（中英逐张对应，`design/v6-design.md` §4/§4.1 已登记；构成改为「0-1 驱动卡 + 0-2 会话生命周期 + 43 张动作卡」）：
  - `0-2 会话生命周期` / `0-2-session-lifecycle.md`：会话收尾四步（证据落盘 → 工作树三选一 → 回写 STATE.md → 需要跨会话时写交接条）；**压缩前必须先落盘**（同一条命令的红/绿两次输出要在压缩发生前写进文件）；会话归档只做三件、不新建仓库文档。
  - `2-6 外部方案调研` / `2-6-external-solution-research.md`：**轮子先行五查**（有没有 / 活不活 / 能不能用 / 合不合 / 值不值）+ **判定三值**（接入现成 / 抄思路自研 / 自研）；许可证无 LICENSE 或 GPL·AGPL·SSPL → 停下问人。
  - `5-6 版本与变更日志管理` / `5-6-version-and-changelog-management.md`：升版判定表（只换实现、外部行为不变 → 不升版本，改走 7-8）+「未发布」节四类 + **tag 纪律**（已发布 tag 不许移动或删除，禁 `git tag -f`）。
  - `7-10 技术栈迁移` / `7-10-tech-stack-migration.md`：与 7-8 的**分界判据**（外部行为要求不变 → 7-8）+ 迁移八步（选型先行 → 黑盒契约/黄金样例 → 数据双跑对账差异为零才切读 → 删旧或登记并行态 → 观察窗）。
- **7-8 项目重构收敛**：明写「不含技术栈/框架迁移——那走 7-10」，重构线（行为不变）与迁移线（行为可变、旧系统当 oracle）在 design §4 档位表里各自成线。
- **`design/v6-design.md` §13 版本口径**：`V6` 世代号**不再用于打 tag**，标签线唯一走插件 semver（当时 `v0.4.1 → v0.5.0`）；历史 `v0.6.0` 原拟「原地保留、不作版本参考」——**该 tag 已于 2026-10-05 经用户裁决删除并改指插件线 v0.6.0**（见本文件 [0.6.1] 节「tag 例外」）。

### 变更

- **`_qc/check.ps1`**：§4 表解析张数断言 41 → 45；新增 8 条 needle（4 张新卡中英各 3 项判据）；新增 3 条「三份活文档卡数 = §4 表张数」同源断言（README / START-HERE / SKILL，数值从 `$cardNo.Count` 推导，避免三处再写死数字）。
- **`test/fixtures/route-scenarios.json` 重生成**（`expect.chain` / `expect.ledger`）：起因见 `_qc/baseline/ledger.json` 的 `note` —— 卡文本按预期变化（+4 张卡、A3 规则移除）；已复跑 `node --test test/route-cli.test.mjs` 取 14 pass / 0 fail。
- **卡内口径修复 16 个文件**（中英各 8）：日期、计数、密钥检查、`1-2` 首提交自相矛盾等；其中 `1-2` 的矛盾用两个临时 git 仓库实测复现了修复前后行为差异。
- **模板侧机制修复 5 处**（`template/`）：`docs/README.md`、`docs/USER_GUIDE.md`、`docs/registry/DATA_DICT.md`、`.gitignore`、`.tool-versions` 的既有漂移。

**打 tag 改为由 agent 执行（规则版本 `2026-10-05.1` → `2026-10-05.2`）** —— 用户裁决：「允许 agent 打 tag」。

### 变更

- **A3「打 git tag」从 A 类不可委托清单移除**（A 类 7 条 → 6 条；id 不复用，避免与历史引用混淆）：`git tag -a` 与 `git push origin <tag>` 自本版起由 agent 在发布流程内执行（**提交跑绿 + 三对齐核对通过之后**）。**执行发布部署仍是不可委托（A2）**，本次只移出打标这一个动作。
- **已发布的 tag 不许移动或删除**：禁 `git tag -f`、禁强制覆盖已推送的 tag；tag 一律用注解式（`git tag -a $ver -m "…"`）。
- 同批改动：`template/AGENTS.md`（A 类正文 + 个人档一行 + `规则版本：`）、`rules/rules.json`（删 A3 条目 + 版本号）、`design/glossary-en.md` §6 英文锚点表、`SKILL.md` 与 `skills/roadbook/SKILL.md`（逐字节镜像）、`design/v6-design.md`（§4 个人档、§5 三落点、§6 宪法要点、§13 版本口径）、`design/playbook-contract.md` §7 归属表、`playbook/5-2-发布.md` 与 `playbook_EN/5-2-release.md`、根 `README.md`、插件动作闸 `plugin/roadbook-autoload/gate.js`（红线谓词 A1–A3 → A1–A2）与其 4 条用例、插件 README 红线表。
- **项目侧动作**：项目根 `AGENTS.md` 副本的 `规则版本：` 落后于 `2026-10-05.2`、或整行缺失 = 按「缺字段」处理——先同步副本再继续；**不许拿旧副本当授权**（旧副本里"打 tag 只能人做"那条已作废）。

## [0.5.0] - 2026-10-05

**硬规则唯一化 + DSH 强锁定 + Team 跟随官方行 + 动作闸**（用户裁决四项：真重写 / 优先保证 DSH / Team 与官方开关同步 / 强引用取动作闸）。

### 新能力

- **`roadbook-team` 子行（第五行）**：只在官方 Agent Teams 已挂载时存在——`cordis.patch.yml` 里这一行带 `disabled: !!js "!ctx.get('agentTeams')"`，官方行关掉 → 本行不加载 → **面板里设了也不生效**。RoadBook **不自建**「允许 / 不允许」Team 的开关：权威开关是官方那一行，本行只跟随（`policy: follow | off`）。装配入口 `plugin/roadbook-team/index.js` 提供 `roadbookTeam` 服务，消费方走**可选服务注入**（写进 `inject` 会让缺服务时整行被判「未运行」）。
- **`rules/rules.json` + `skills/roadbook/bin/rules.mjs`**：硬规则的机器可读索引（43 条，按**违反后果**分 A 不可委托 / B 机械判据 / C 门禁 / D 行为纪律）。`--audit` 检查标识唯一、分类与判定钩子匹配、落点与命令引用在磁盘上真实存在、触发词无冲突；反向对照在 `test/rules-audit.test.mjs`（**6 条"改坏副本必须判红"**，防止审计退化成恒真空函数）。
- **`doctor.ps1` 三态探测 DSH 运行前提**：有宿主环境变量 / 疑似裸 CLI / 都没有；`-RequireDsh` 把「缺宿主」升级为红。**读不到不许显示成通过**（沿用母版对 unknown 的一贯口径）。

### 破坏性变更（已装用户需要动作）

- **硬规则搬家**：唯一正文改为项目根 `AGENTS.md`（母版 `template/AGENTS.md`），带 `规则版本：` 行；`SKILL.md` 与 0-1 驱动卡只做**路由与门禁**，不再重复规则正文。**旧项目里的副本需要重新同步 `AGENTS.md`**——副本版本落后或整行缺失按「缺字段」处理，不许拿旧副本当授权。
- **第五个子行**：装主插件后插件面板会多出 `roadbook-team` 一行；官方 Agent Teams 未挂载时它是禁用态（设了也不生效）。
- 根 `package.json` 的 `files` 新增 `rules/`，并有对应运行时自检（漏进包 = 装出来的机制没有规则源）。
- **`git tag` 由人打**（agent 不打 tag）。

## [0.4.1] - 2026-10-05

**一次把 DSH 打不开的升级事故**：0.4.0 装上去、重启 DSH 之后弹「应用无法启动或已意外停止」，诊断报告里只有一行

```
web boot: 1 entry did not activate
roadbook: failed
```

这不是「图册标签页没出来」，是**整个应用起不来**。根因在客户端半，而且是一行看起来最无辜的代码。

### 根因

cordis 的 `ctx` 是**严格**的：读一个**没写进 `inject` 的服务**不是返回 `undefined`，而是直接 throw

```
cannot get property "locale" without inject
```

（`@deepseek-ai/cordis` 的 `ReflectService.handler.get`；服务只有在某个祖先 fiber 的 `inject` 快照里才可见，走到根 fiber 还找不到就抛。）

0.4.0 为了修「界面恒为中文」，把 `registerLocale(ctx)` 加成了 `apply()` 的**第一行**，而它读的 `ctx.locale` 并不在 `inject` 里（本行只声明了 `betterSidebar`）。于是：

1. `apply()` 抛错 → cordis 把本行 fiber 记成 `failed`（`Fiber._reload` 的 catch 里 `this._error = reason`，`get state()` 随即返回 3）；
2. 前端 boot 审计遍历所有 loader entry，把非 `active` 的收成一个 `Error` 上抛（`web boot: N entries did not activate`）；
3. 桌面壳收到 `bootFailed` → 报致命错误 → 「应用无法启动」。

**为什么 0.2.3 没事**：它只在**渲染期**读 locale，而渲染期的 ctx 是 better-sidebar 传进组件的 `props.ctx`（那个 ctx 自己 inject 过 locale），不是本插件自己的 ctx。**激活路径**上读没 inject 的服务，是 0.4.0 新引入的动作。

**为什么自测没抓到**：`test/client-contract.test.mjs` 的假 ctx 是普通对象，`ctx.locale` 永远不抛 —— 假环境比真环境宽松，缺陷全绿通过。

### 修复

- **`readService(ctx, name)`（`lib/client.js`）**：两段口径 —— ① 先试属性访问（inject 过的服务走这条，语义最正）；② 属性访问抛错或为空 → 退回 `ctx.get(name, false)`，即 cordis 官方「不带 inject 要求」的读法，服务不在时返回 `undefined` 而不抛。**永不抛错**。所有服务读取（`locale` × 4、`betterSidebar` × 2）一律改走它。
- **`apply()` 整段包 try/catch**（真正的接线挪进 `activate()`）：即使将来有人再往激活路径里加一句会抛的代码，最多丢一个标签页，不会再把 DSH 判死。客户端半没有这种权力。
- **测试环境向真环境看齐**：新增 `strictCordisCtx()`，照抄 cordis 的严格语义（未 inject 的服务读属性就抛，只有 `ctx.get` 能拿到），四条新用例钉住「读不到 → 降级 → 标签页照注册 → 绝不上抛」，另有一条直接钉 `readService` 的两段口径。**变异验证**：把 `readService` 退回属性直读 → 3 条新用例变红；把 `apply` 的 try/catch 摘掉 → 第 4 条变红。两条防线各自独立可验。

### 教训（写给下一次）

假环境比真环境宽松时，测试通过只证明「假环境里能跑」。这次的真环境规则（严格服务访问）是一句能被读到的错误信息，代价是整个 DSH 打不开。**任何插进 `apply()` 的代码，都必须假设它会决定应用能不能启动。**

## [0.4.0] - 2026-10-05

**一个静默失效的事实**：组合包此前**不会自动更新**（文档原话：卸载 + 重装），而升级路径上还有一层假绿——本机实测 `GET /dsh-market/api/v1/updates?name=roadbook` 返回 `updateAvailable:false`、`installedVersion:"0.2.3"`（回落到版本号 ⇒ 它的 `current` commit 是 null），**而同一时刻环境里装的确实是 0.2.3、远端 main 已经是 0.3.0**。根因在市场的 `lib/updates.js`：github 分支只从 spec 的 `#sha` 或 `readLockCommits()` 取当前 commit，而后者只认 codeload 压缩包形状；pnpm 对 `github:` 简写写的是 `resolution: {commit:…, repo:…, type: git}`。所以本轮**不转发任何人的结论**，自己判定。

### 新增能力

- **主行自动更新（`lib/update.js` + `lib/index.js`）**：开机查一次上游版本（`repository` 推导清单地址，默认 `main` 分支），五态判定 `up-to-date / update-available / ahead / dev / unknown`；**读不到一律 `unknown`**，绝不显示成「已是最新」。默认 `update: notify` 只提示；`update: auto` 才自动替换；`update: off` 整体关闭。
- **命令探测阶梯（有证据、不猜）**：`updateCommand` 配置 → 本进程 CLI 入口（`process.argv[1]` 命中 `bin.js`/`cli.js`，用 `process.execPath` 重调，env 补 `ELECTRON_RUN_AS_NODE=1`）→ `$DSH_HOME/dsh-runtimes/*` 自带运行时的 node + `pnpm.mjs`（本机实测 `dsh` 与 `pnpm` **都不在 PATH**，而 `…/dependencies/node/bin/node.exe` + `…/pnpm/bin/pnpm.mjs --version` = `11.7.0` 可用）→ PATH 上的 `dsh`。全部不可用 ⇒ 拒绝执行（424）并逐条给出跳过理由，绝不随便挑一条把 profile 装坏。
- **三道闸**：单飞锁文件 `<profile>/.roadbook-update.lock`（30 分钟视为陈旧可接管）+ 有 agent 在跑就拒绝（`agents.list()` 里 `status === 'running'`，判据与 dshmarket 一致）+ 超时 300s（先 SIGTERM，宽限 10s 再 SIGKILL），输出保留尾巴。
- **同源守卫**：`POST /roadbook/update/apply` 会真的执行安装命令，所以 `Host` 必须 loopback（`127.0.0.1` / `localhost` / `[::1]`）、`sec-fetch-site: cross-site` 一律拒、`Origin` 出现时必须与 `Host` 同 authority——这正是 DNS rebinding 页面伪造不了的那一个头。
- **客户端更新条（`lib/client.js`）**：图册标签页里显示「v当前 → v上游」+［更新］，跑一次安装并轮询到终态，成功提示「重启 DSH 后生效」；宿主路由不在（旧版本 / `webServer` 服务没起来）时**整条不渲染**，不留死按钮。
- **观测**：`<os.tmpdir()>/roadbook-update.jsonl`（超 2 MiB 轮转 `.1`），事件 `loaded` / `check` / `skip` / `apply-start` / `apply-refused` / `apply-finish` / `route`；只写版本号、commit、命令标签、退出码与输出尾巴，不写用户消息、不写环境变量。
- **两条本机路由**：`GET /roadbook/update/status[?force=1]`、`POST /roadbook/update/apply`（走可选服务 `ctx.inject(['webServer'])`，服务缺席只让路由不出现）。

### 配置（主行 `roadbook`）

| 键 | 默认 | 说明 |
| :--- | :--- | :--- |
| `update` | `notify` | `off` / `notify`（只提示）/ `auto`（自动替换） |
| `updateIntervalHours` | `24` | 两次自动检查的最小间隔（跨重启靠观测文件里的上一条 `check` 计时） |
| `updateTimeoutMs` | `8000` | 单次远端清单读取超时 |
| `updateApplyTimeoutMs` | `300000` | 安装命令超时 |
| `updateUrl` | `""` | 空 = 从本包 `repository` 推导 `raw.githubusercontent.com/<owner>/<repo>/main/package.json` |
| `updateCommand` | `""` | 空 = 走探测阶梯；填了就按模板跑（支持 `{target}` / `{package}` / `{profile}`，也是端到端演练的打桩入口） |
| `updateReport` / `updateReportPath` / `updateReportMaxBytes` | `true` / `""` / `2 MiB` | 观测开关、路径与轮转上限 |

### 代价与脆弱面（明说）

自己跑安装命令**没有** dshmarket 的并发锁、兼容性验证与自动回滚；失败时的兜底是「保留命令输出 + 提示按原来源重装」，不承诺回滚。默认 `notify` 意味着每次开机有一次对 `raw.githubusercontent.com` 的 GET（除 URL 外不外发任何信息），断网时如实退化 `unknown`。替换后**必须重启 DSH**（桌面宿主持有重启权，插件不自己重启）。

**本机实测的 TLS 坑（已按证据处理）**：这台机器上有做 TLS 拦截的中间盒，它的根 CA 在 Windows 系统信任库里、**不在 Node 自带的 CA 清单里** —— `fetch('https://raw.githubusercontent.com/…')` 报 `fetch failed / unable to verify the first certificate`，`curl.exe` 同样 000，而 `node --use-system-ca` 实测 200。插件跑在宿主进程里、改不了启动参数，所以清单读取做成**两级传输**：先 `fetch`，只有证书类错误才用 `node:https` + `tls.getCACertificates('system')` 重试一次（DNS 不通、超时、代理拒连都不白跑第二次）。实测：`transport = system-ca`、142 ms、`installed 0.2.3 → latest 0.3.0` = `update-available`，同版本则 `up-to-date`。**安装命令那一侧不需要同样处理**（实测 `pnpm view dsh-context version` → `0.64.0`、exit 0，注册表与 git 通道都正常）。

### 提交前独立对抗式复核（四路，只读；确认后由写者落地）

复核不是走过场：这一轮**自己写的东西被自己人打穿了**，共修掉 2 个 P1 与 8 处 P2。修完每一条都补了会红的用例（变异测试：把修法还原，只有新加的那几条变红）。

**P1①：超时根本不终结安装器，而且会把更新永久挂住。** Windows 上 `child.kill()` 只是 `TerminateProcess` 直接子进程 —— 带 shell 的候选（模板命令、`dsh.cmd`）的直接子进程是 `cmd.exe`，真安装器是它的**孙进程**，继续改 `node_modules`；更要命的是孙进程握着继承来的 stdout 管道，`close` 事件**永远不来**，而 `state.applying` 只在 `settle()` 里清。实测（真实 spawn，`applyTimeoutMs=5000`）：SIGTERM 后 8s、SIGKILL 后 3s 安装器与孙进程都活着、`operation.state` 还是 `running`、`timedOut=false`、观测里只有 `apply-start` 没有 `apply-finish`、锁还在，之后每一次更新都 409（删锁文件也没用，因为 `applying` 闸在 `acquireLock` 之前），只有重启宿主才能恢复。修法：Windows 上改走 `taskkill /PID <pid> /T /F` 收整棵树；**杀完进程树再等一小段就按超时结账**，不再把闸与锁挂在 `close` 上；另加两道自愈（`applying` 超预算按陈旧放行、`dispose()` 复位闸）。

**P1②：宿主真实的 `idle` 被渲染成「检查失败：{reason}」。** 冷却期内跳过一次检查时宿主如实报 `state:"idle"`、`reason:""`，而客户端 `updateStripState` 只认五态，`idle` 掉进 unknown 兜底 ⇒ 警告色 + 把 `{reason}` 占位符原样丢到界面上，而且一挂就是 24 小时（直到用户手动检查）。这正是本模块口口声声拒绝的「假红」。修法：`idle` 单列一档（muted + 仍给「检查」入口），空 reason 由渲染层兜底成「未知原因」。

**P2 批次**：① 观测文件轮转失败时把字节计数清零 ⇒ 上限形同虚设（把 `.1` 做成目录让轮转必失败，实测涨到上限的 25.9 倍），改为「轮转不了就放弃这一行」；② 第二级传输 `httpsGetText` 没有总时限（`timeout` 只是 socket 空闲超时：慢速滴答的服务器实测 500ms 配置跑成 3094ms）、不跟 3xx（`fetch` 跟，于是「专为 TLS 拦截机器准备的那一级」反而更弱）、响应体无上限 —— 三条全部补齐；③ 冷却时间只认观测文件，`updateReport:false` 时等于关掉冷却（实测 5 次轮询打 5 次远端，而客户端在更新进行中就是每秒轮询），改为内存与文件取较大者；④ 锁没有所有权标记，`dispose()` 会删掉别人的锁 ⇒ 单飞失效，改为只删自己的；⑤ 陈旧锁阈值固定 30 分钟，而安装超时可配到 60 分钟 ⇒ 长安装会被接管，改为「超时 + 两段宽限 + 1 分钟」取大；⑥ `whichInPath` 只判存在 ⇒ PATH 里一个同名**目录**会盖掉真正的 `dsh.cmd`，改为必须是文件；⑦ shell 模板里 target 未过滤 ⇒ profile 依赖串里一个 `"` 就能撑破引号并用 `&` 执行任意命令（实测能落地文件；输入面仅限本机 profile 的 `package.json`，属本地输入，但仍是命令注入面），改为 target 过字符 allowlist，不过就跳过该候选；⑧ 观测文件把整行命令与安装器输出原样落盘 ⇒ 配置里嵌的注册表 token 会明文留档，改为落盘前脱敏（`--token=***`）并按 0600 创建。

**同时修掉两处「文档说有、实际不触发」**：① 判定第 ④ 步（版本号相同、提交不同也算有更新）在生产里**永远不触发** —— `runCheck` 传了 `installedCommit` 却没人给 `latestCommit`（变异测试：删掉 `installedCommit` 那一行，33 条用例全绿）。现在版本号相同时才去问一次上游 HEAD 提交（`api.github.com/repos/<repo>/commits/<branch>`），`commitCheck` 三态 `skipped/unknown/same/differ` 写进状态与观测，问不到就如实记 `unknown` 而不假装对过账；② 两个比较器的边角：预发布标识符原来按整串比（`1.0.0-rc.10 < 1.0.0-rc.9`，与 semver 相反，实测 147456 对里 1260 对不一致）改为逐标识符比；`installKindOf('C:\\repo')` 原来判成 registry（会被 `roadbook@latest` 盖掉开发副本）改为 local，`workspace:` 同理。

另外清掉两处测试卫生问题：`主行 apply()` 用例不传 `updateReportPath` ⇒ 跑一次测试就往机器全局观测文件追加假记录（真机文件里能看见）；一处 `assert.ok(reportDir)` 恒真。

### 提交前自查挖出的一处 P1（假绿：候选表看着全，有一条恒死）

**PATH 候选在 Windows 上是死候选**：探测阶梯的 ④ 原本写成 `dsh.cmd` + `shell:false`。Node ≥18.20（CVE-2024-27980 之后）**拒绝对 `.cmd`/`.bat` 用 `shell:false`** —— 本机实测三种口径一致：① 临时 `.cmd` 探针 `spawn(x.cmd, [], {shell:false})` → `THREW EINVAL`，`shell:true` → `exit=0 stdout="PROBE-OK"`；② 新用例走真实 spawn 的 `spawn EINVAL`；③ 变异测试（把候选还原成旧形状）后新加的两条用例**只有它们变红**，其余 31 条照旧全绿。后果：`dsh` 只出现在 PATH 的机器上，点「更新」永远得到一条 `spawn EINVAL`，而候选表与 424 文案都写着「有可用安装命令」——正是本仓库定义的那类假绿。修法：Windows 上这条候选改为**整行模板 + `shell:true` + 空 args**（带 shell 就不能再传 args，那是 DEP0190 不转义；路径带引号，因为本机 DSH 就装在 `D:\AISI\Deepseek harness\…` 这种含空格目录里），非 Windows 保持 argv + `shell:false`。同批把查找名从 `dsh.cmd` 改回 `dsh`——PATHEXT 后缀表本来就负责补 `.cmd`/`.exe`，写死扩展名会去试 `dsh.cmd.cmd` 这类不存在的名字。

**同一轮实测到的桌面宿主事实（写进注释，免得下一个人再猜）**：GUI 宿主的 `process.argv[1]` 是 `…\@deepseek-ai\dsh-desktop-host\lib\index.js`（`Win32_Process.CommandLine` 读到的原话），而真 CLI 入口是同目录的 `cli.js`（`dsh.cmd` 里写死的那个）⇒ 阶梯的 ② 在桌面上**永远命中不了**，桌面由 ③ 承担。③ 已按真实形状端到端跑通：`<内置 node> <内置 pnpm.mjs> add github:Aparencia/RoadBook` 在一次性空 profile 里 `+ roadbook 0.3.0`、20.4s、exit 0（同一时刻工作树里的 0.4.0 尚未推送，所以拉到的是远端 main 的 0.3.0 —— 这条同时证明「安装路径真的能从上游取到新版本」）。

### 测试与验收

- `node --test "test/*.test.mjs"`：**83/83**（原 40；`test/update.test.mjs` 38 例 + `client-contract` 增 5 例，`umbrella-contract` 的 import 闭包断言与 `packaging` 的运行时清单同步到 `lib/update.js`）。其中一条是**真实 spawn** 的端到端用例（起真的 `cmd.exe` 跑一个临时 `dsh.cmd`，断言退出码 0 且 stdout 被接住）——打桩的用例会把这个 P1 原样放过去，所以这条刻意不注入 `spawn`；另有一条专测「子进程永远不发 `close`」的看门狗（宽限期用注入的毫秒值跑，不然一条用例要 20 秒）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"` 与 `powershell -NoProfile -File _qc/check.ps1` 见本次提交的粘贴输出。
- 版本口径：根 `package.json` = `0.4.0` = `lib/client.js` 的 `PLUGIN_VERSION`（`client-contract` 逐字核对）。本次升版按「加能力 → 次版本」规则；`git tag` 由人打。

## [0.3.0] - 2026-10-05

**一个 P0 级事实**：插件按文档推荐的方式（Git 地址装仓库根）装出来的是**空壳**。`files` 白名单只有 `lib/skills/plugin/...`，而注入给模型的 `skills/roadbook/SKILL.md` 第一条就要求读 `playbook_EN/0-1-driver-card.md` —— 实测 `npm pack` 出来的 tarball 88 项里 `playbook/`、`playbook_EN/`、`template/` 各 0 项，本机 github 安装副本 `…/profiles/desktop/node_modules/roadbook` 里这三个目录也全缺（版本 0.2.3，就是最新形态），而本机 `~/.dsh/skills/` 下没有 roadbook clone 兜底。本轮把这个洞连同同源的三个缺陷一起修掉。

### 修掉的缺陷

- **打包白名单漏掉流程卡本体**（P0）：根 `package.json` 的 `files` 补 `playbook`、`playbook_EN`、`template`。判据固化为「**运行时引用的路径 ⊆ 发布白名单**」，由新增的 `test/packaging.test.mjs` 与 `_qc/check.ps1` 双份拦截。
- **`roadbook-autoload` 单独打包必然「未运行」**（P0，0.2.1 修过的症状复发）：`plugin/roadbook-autoload/package.json` 的 `files` 漏了 `host-fallback.js`，而入口**静态 import** 它。实测 `npm pack` 解包后 8 项无该文件、`import('./index.js')` 报 `ERR_MODULE_NOT_FOUND`。补进白名单；同时主行就绪自检改为**按入口模块的静态相对 import 闭包自动推导**（见下），两个机制不再可能同时失明。
- **图册「预览」把图纸截断 16% 且静默**（P0）：旧路径把整份 HTML 经 `fs.read` 搬进 `srcDoc`，而 `fs.read` 的 `readLimit` 默认 **512 KB**，超限只返回前一段并置 `truncated: true` —— 客户端从不读这个字段。实测五类图纸产物 **608.4–611.7 KB**，也就是**每一次预览都只显示 83.9%**（丢约 100 KB）。改为 iframe 直接吃宿主自带预览路由 `/sidebar/html/<sessionId>/<绝对路径>`（服务端已带 `content-security-policy: sandbox …`，mediaLimit 20 MB）：不截断、少一次整文件 JSON 往返、沙箱从「前端属性」升级为「服务端强制」。
- **自进化 B 环的指纹是死的**：SKILL.md 指纹按路径永久缓存，技能中途更新后 `skillDigest` 对账永远看不到变化。缓存键改为 `mtimeMs + size`；取证拿不到 stat 时不缓存（「先缺后补」的 SKILL.md 不会被记成永久空值）。
- **观测文件是隐私与体积双重敞口**：`<os.tmpdir()>/roadbook-autoload.jsonl` 无限追加、跨会话、永不清理，且把**用户消息原文片段**（`text.slice(0, 80)`）写进共享临时目录。现在只写 `textDigest`（sha256 前 8 位）与 `textLength`，原文不出本进程；新增 `reportMaxBytes`（默认 2 MiB），超限轮转到 `<reportPath>.1`。
- **三个常驻集合只增不减**：`injectedSessions` / `reportedSkips` / `gitRoots` 全部改为有界 FIFO（512 条），长驻宿主不再慢性泄漏。
- **文档自相矛盾**：`plugin/roadbook-autoload/README.md` 仍在说「整仓装不了、必须用 `#path:` 指到子目录」——那是 0.2.0 之前的实情，与根 README、atlas README 的「装一个主插件、子插件不单独安装」直接冲突。已改。
- **环境**：本机 git 因仓库「可疑所有权」拒绝工作，`template/security.ps1` 因此判「不是 git 工作树」→ `_qc/check.ps1` 恒红一项。已加 `git config --global --add safe.directory D:/Code/RoadBook`（git 自己提示的标准修法）。

### 对抗式复核后补修的七处（只读复核独立于写者，复核确认后由写者落地）

- **自进化 C 环在真机上是零产出的死能力**（严重）：`trigger.js` 读 `session.events`，而真实 `Session` **没有这个属性**（内部日志是私有字段 `log`，公开读法只有 `snapshotEvents()` / `eventAt()` / `ownEvents()`）⇒ 空转观测恒 `unknown`、`alreadyInjected` 恒 `false`（会话恢复时的日志去重兜底形同不存在）。改用 `snapshotEvents()`，并把 12 条用例的假 session 从 `{ events: [...] }` 改成真实形状——它们原先在一个真机上不存在的形状上全绿。
- **「先比字节数」是死代码**（中）：宿主 `fs.read` 的**文本分支不回 `size`**（`FsTextResult` 只有 `content`/`truncated`，`size` 只在 `FsBinaryResult`），读 `value.size` 恒 `null`；判据只剩 sha256，而 `crypto.subtle` 只在安全上下文存在 ⇒ 非 localhost 的 http 打开界面时「规格已改」徽标**静默永不出现**。字节数改为客户端按 UTF-8 自行折算，判据改成 `changed`/`same`/`unknown` 三态：算不出哈希就显示「规格无法比对」，不装作没变。
- **就绪自检的剥注释会吞掉真 import**（中）：字符串或行注释里的一个 `/*` 会一路吞到下一个 `*/`（含真 import）⇒ 方向是**漏报缺失文件**。改为单遍字符状态机，锚点放宽以覆盖同行 import。
- **门禁自己漏检了一个测试文件**（中）：`_qc/check.ps1` 逐个点名测试文件，`banner.test.mjs` 只在 CI 里跑得到 ⇒ 本地全绿不算数。改为跑整套件 glob；`check.ps1` 自身上限 650 → 670（同步 design §8）。
- **测试往生产观测文件写垃圾**（中）：不传 `reportPath` 的用例真往 `<os.tmpdir()>/roadbook-autoload.jsonl` 追加假会话，而 README 教用户看这个文件判断注入是否发生。改为把 `TEMP` 指向临时目录；实测跑完整套件该文件一字未长。
- **常驻微提示可能永远消失**（低-中）：一次性 `ctx.get('systemPrompt')` 读不到就永久 `unavailable`，分不清「宿主没有」与「还没装配好」。改走作用域注入 `ctx.inject(['systemPrompt'], …)`；`export const inject` 不变，观测态加 `deferred`。
- **打包失败原因采到却不显示**（低）：宿主对每个路径做 stat，一个读不到整单失败，而列表快照可能是 15 秒前的旧数据；现在把 `zip.error` 渲染出来。
- **另堵一处假绿**：`test/packaging.test.mjs` 的 npm 匹配器原按 basename 任意深度认「npm 永远包含」，而 npm 只对**包根**无条件包含 README/LICENSE/CHANGELOG ⇒ `template/README.md` 这类路径会被判成「反正会带上」，替真缺陷放行。已收紧为仅包根匹配并加断言。

### 新增能力

- **常驻微提示（`banner`，默认开）**：用宿主 `ctx.systemPrompt.section()` 注册一段 195 字的铁律摘要（order 700，依据是宿主 `SECTION_ORDERS` 里 `PLAN_POLICY=500` / `TEAM_POLICY=600` / `PTC_ONLY=800`）。它解决的是设计文档自己承认的洞——关键词命中率只有五到八成，**没命中的会话此前整轮没有任何流程约束**。注册走**可选服务**，且取服务必须走**作用域注入** `ctx.inject(['systemPrompt'], …)`（`ctx.get` 读到 `undefined` 分不清「宿主没这个服务」与「服务还没起来」，读一次就写死 `unavailable` 会让微提示在服务晚起的宿主上永远消失），但**绝不写进 `export const inject`**；读不到只让本段不出现、整行插件照常工作；只在 git 项目里出现（`context.agent` 由宿主 `assembleContextFor(agent, signal)` 注入）。`banner: false` 关闭。
- **图册**：预览走宿主 HTML 路由（见上）；**新图纸自动出现**（15 秒一次的 `fs.tree` 名称指纹轮询，页面隐藏时不发请求，指纹变了才重读元信息）；**「规格已改」徽标**（回执里存着规格的 `sha256` 与 `bytes`，先比字节数、字节数相同再比 sha256，规格比图纸新就提示重渲染；字节数由客户端按 UTF-8 自行折算——宿主 `fs.read` 的文本分支不回 `size`，照抄 `value.size` 会让这条判据永远是死代码；`crypto.subtle` 缺席时显示「规格无法比对」，不静默当作没变）；**「打包导出」**（宿主 `archive.build` + `archive.status` 轮询，一次拿全部图纸 + 规格 + 回执 zip）；元信息读取从**最多 40 次串行 HTTP** 改为有界并发（6），被截断的元信息在界面上明说；语言改走 `ctx.locale.register/bind` 并订阅变化（旧代码读的 `ctx.locale.current` 在真机上不存在，**界面恒为中文**）；预览底色改用主题令牌（不再硬编码白底）；空态给出可复制的提示词。
- **自进化 C 环（空转观测）补上**：设计文档 §15 当年写「暂不做（避免为观测再挂钩子）」——其实不需要新钩子：`agent/pre-step` 本来就挂着（注入走的就是它），缺的只是一个判据 —— 但**事件来源**必须用 `session.snapshotEvents()`：真实 `Session` 没有 `events` 属性（内部日志是私有字段 `log`，公开读法只有 `snapshotEvents()` / `eventAt()` / `ownEvents()`）。第一版读的是 `session.events`，于是这一环在真机上恒判 `unknown`、纯属零产出，`alreadyInjected` 的日志兜底也一起失效。现在注入之后每步顺路看一眼：读到 `playbook*/**.md` 记 `{"event":"card-read"}`，连续 4 步一路没有痕迹记 `{"event":"idle"}`（疑似空转）。三条边界都不猜：注入正文自带的 `playbook_EN/` **不算**痕迹（只扫最后一次注入之后的事件）、读不到会话日志判 `unknown`、事件多到超出扫描窗口也判 `unknown`；`report: false` 时整个观察不做。
- **工程**：新增 `.github/workflows/ci.yml`（口径与 `_qc/check.ps1` 完全一致，禁 `continue-on-error`——设计文档 §16 第 6 行早就这么要求，仓库此前没有 CI）；`.gitignore` 补 `.dsh-code-index/`（DSH 代码索引的本地缓存，未忽略会直接破坏 5-1 卡的「工作树必须干净」判据）。
- **就绪自检换代**：`missingBundledFiles()` 从手写清单改为「显式运行时清单 + 三个宿主入口模块的静态相对 import 闭包」。起因是事故复盘——手写清单与打包白名单**同时**漏了 `host-fallback.js`，两个本该互相兜底的机制一起失明。闭包扫描先剥注释再匹配（本文件注释里就写着 `import x from './a.js'` 这种例子，不剥会报一个不存在的文件：假红比不检查更坏），且支持多行 import。

### 推送前自检发现的一处（母版自身，补记）

- **母版 `.gitignore` 从未挡 `.env` / `*.pem` / `*.key`**：设计 §14 第 5 行把「首推/推送前用 `git check-ignore -v .env` 确认敏感文件确实被挡住」写成推送前置动作，照这条在推送前跑了一次自检——在母版仓库自己身上**一条都不命中**（`check-ignore` 退出码 1），而 `template/.gitignore` 早就挡着，属口径不齐。已按 template 同口径补齐四条规则，并给 `_qc/check.ps1` 加断言防回归。注意 `security.ps1` 只能扫工作树里**已存在**的密钥，挡不住「新建的 `.env` 被 `git add` 带进历史」——密钥推出去不可逆，这属于「文档说要挡、实际没挡」的假绿，与上面七处同一类。

### 测试与验收

- `node --test "test/*.test.mjs"`：**40/40**（`client-contract` 新增 6 例钉住预览 URL 算法/语言快照字段/目录指纹/规格过期判定/双语表注册，后又新增 3 例把「字节数走生产路径折算」「UTF-8 折算与 TextEncoder 逐个一致」「三态判据」钉死；`umbrella-contract` 新增 3 例钉住 import 闭包与 YAML 表达式同口径，后又新增 2 例钉住剥注释的假绿与假红两个方向；新增 `packaging.test.mjs` 6 例）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"`：**66/66**（新增 `banner.test.mjs` 7 例：常驻提示的注册形状/门控/关闭三态；`trigger.test.mjs` 新增 7 例钉住空转判据的三条边界；`index.test.mjs` 新增 5 例钉住空转观测只记账、不改行为；复核后又把这些用例的假 session 改成真实 `snapshotEvents()` 形状，并补上「回扫只在窗口 + 1 条内、结论与全量一致」等例）。
- `_qc/check.ps1`：**316 项全绿、退出码 0**（新增发布白名单、CI、`.gitignore` 三组断言——`.gitignore` 那组同时管 `.dsh-code-index/` 与密钥三条；复核后把「逐个点名测试文件」改为「跑整套件 glob」并补 `banner.test.mjs` 入清单；BOM 与 PS 5.1 解析均 [OK]）。
- 版本升 `0.3.0`（加能力 → 次版本；三处事实源同步，见下）。

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
