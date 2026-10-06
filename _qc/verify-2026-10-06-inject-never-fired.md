# VERIFY · 6-4 回归验证 —— 「静默不注入」两处修复（0.7.2）

> 卡：6-4 回归验证（全档必走）｜ slug：`inject-never-fired`｜ 上游：6-2 根因分析 → 6-3 修复（commit `ddff5a7`，tag `v0.7.2`，已 push）
> 产物寿命：**持久**（进仓库；是 5-1 归档的输入）

**偏离项（母版仓与生成项目的落点不同，如实声明）**：本仓是**母版**，不是生成出来的项目——没有根 `STATE.md`、没有 `docs/specs/`、没有 `check.ps1` / `gate.ps1`（那五个守护脚本在 `template/` 里）。6-4 卡规定的产物落点 `docs/specs/<日期>_<slug>/VERIFY.md` 在本仓不存在，按本仓既有约定（`_qc/audit-2026-10-03.md`、`_qc/sim-2026-10-03.md`、`_qc/internalize-*.md`）落到 `_qc/verify-2026-10-06-inject-never-fired.md`。slug 本次首用：6-2/6-3 的产物是 CHANGELOG 节 + design 回写，不带 slug。

---

## ① 开工确认

1. **人话复述与落点**：验证 0.7.2 修的两个「静默不注入」缺陷。**根因一**：`SKILL.md` / `skills/roadbook/SKILL.md` 的 frontmatter `description` 是未加引号的 YAML 纯标量、值里含 ASCII「: 」（第 378 字符），YAML 读成嵌套映射 ⇒ 宿主 `parseFrontmatter` 抛错后被 catch 住只打 warn 就 return ⇒ 该文件被忽略、`roadbook` 从未进技能目录 ⇒ 自动加载落 `skip/no-skill` ⇒ 流程正文一次都没注入过（观测 166 行里 `inject` = 0）。**修法**：description 值加双引号（正文一字未动，解析后仍 496 字）。**根因二**：`isSubagentHeader` 先看 `parentSession` 非空就判 true ⇒ `delegationDepth=0, isSeeded=true` 的**分叉/续接用户会话**被误判成子代理 ⇒ 整轮不注入。**修法**：优先认 `delegationDepth`，宿主没给该字段才退回旧判据。**落点** = 本文件；**下一张卡** = 5-1 归档。
2. **假设清单**（能从代码/提交记录查到的不写进来）：
   - 我假设「本仓测试命令的唯一口径」= `package.json` 的 `scripts.test` 三组（root / autoload / evolve）兼 `_qc/check.ps1:705-708` 的同一组 glob；若错，则本文件的运行记录仍有效，只是「唯一口径」这句话要改。依据：`CHANGELOG.md` 顶部「改完从仓库根跑」原文 + 门禁同组 glob。
   - 我假设 `delegationDepth` 是会话头的权威字段（真子代理 ≥1、分叉用户会话 =0）；若错（宿主某版本不给该字段），则「分叉会话不注入」这条修复退化为旧判据——本卡实测那条退路仍判 true（见 §②-B 直测第 3 行）。
   - 我假设宿主 `catalogDescriptionMaxLength = 500`；若错则该长度断言的上界要跟着改（依据：6-2 复刻宿主 `dsh-skill-filesystem` 实测，`_qc/check.ps1:321` 同口径）。
3. **澄清问题**：无。（回归范围由 6-3 改动面直接决定，没有「只有用户才知道、又决定范围」的项。）
4. **回归范围声明**：调用方清单由 `Select-String` 实跑列出（见 §② 第二件 A/B/C 三张表），不凭印象。
5. **验证分级声明**：⚠️ 母版仓**没有 `STATE.md`**（`STATE.md` 是生成项目的文件，母版只有 `template/STATE.md`）⇒ 无 `档位` 字段可读。沿用 6-3 已声明的档位口径（双维锁 = 黄牌，用户已批选项 C），不按旧档位放水。
6. **逐字引用本卡 §②「回归验证三件事」**：

> **回归验证三件事（缺一不可）：**
>
> **第一件：负面测试（防复发，这是修复验证与功能验证的区别）**
> 写一个"让原 Bug 复现"的测试——输入触发 Bug 的条件，断言得到正确结果（旧代码会挂、新代码要过）。
> 运行并粘贴输出：**测试命令的唯一口径 = `AGENTS.md` §10 与 `check.ps1` 顶部 `$STEPS` 里已约定的测试命令**（本卡不另立命令，避免口径漂移）。
> ❌ 反例：只在控制台试了试说"好了"（没有防复发的测试，下次改代码还会炸）
> ✅ 正例：`test_bugfix_export_empty_data` 断言空数据导出返回空文件而非崩溃
>
> **第二件：回归清单（受影响面逐项过）**
> 1. 先赋值再搜：`$sym = '被改函数或接口名'; Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $sym | Select-Object Path,LineNumber` 列出全部调用方（注：本机 PowerShell 5.1 的 `Select-String` 没有递归形参，只有上面的管道式递归可跑）
> 2. 逐个调用方写"怎么验证它没被改坏"（一条可观察行为）
> 3. 逐项执行并在清单上打勾
> ❌ 反例："改动只在导出函数内部，其他调用方肯定没影响"（凭印象 = 没核对）
> ✅ 正例：3 处调用方逐条给出可观察行为，逐条贴执行输出后打勾
>
> **第三件：收尾三连（顺序不可换：回写状态 → 提交 → 复跑收工仪式取 0）**

---

## ② 第一件：负面测试（防复发）

**测试命令（唯一口径）**：`node --test "test/*.test.mjs" && node --test "plugin/roadbook-autoload/test/*.test.mjs" && node --test "plugin/roadbook-evolve/test/*.test.mjs"`（= `package.json` 的 `scripts.test`，= `_qc/check.ps1:705-708` 的同一组 glob）。

### A. 根因一（frontmatter 非法 YAML）——旧仪器全绿、新仪器判红

新增仪器：`test/skill-frontmatter.test.mjs`（4 例：两份文件的 frontmatter 各 2 例）。它的判据不是正则「看起来对」，而是**按 YAML 读这一行**：纯标量在第一个「: 」或「 #」处就被截断，截断了 = 值不完整 = 判红。

变异（复现原 Bug）：把两处 `description` 值两侧的双引号去掉（= 逐字还原 6-3 之前的写法）。

```text
=== A-2 施加变异：去掉 description 两侧双引号，两份同批 ===
  SKILL.md: 引号 8191 -> 8189
  skills/roadbook/SKILL.md: 8191 -> 8189
=== A-3 旧内容 + 宿主同款真 yaml 解析（这就是 Bug 复现）===
  [THROW] SKILL.md | YAMLParseError: Nested mappings are not allowed in compact mappings at line 2, column 14:
  [THROW] skills/roadbook/SKILL.md | YAMLParseError: Nested mappings are not allowed in compact mappings at line 2, column 14:
=== A-4 旧内容 + 旧仪器（test/skill-mirror.test.mjs）===
✔ skills/roadbook/SKILL.md 是根 SKILL.md 的逐字节镜像
✔ 镜像的 frontmatter 首行严格为 ---、name 为 roadbook（路由键不能被改名）
ℹ tests 2 | ℹ pass 2 | ℹ fail 0        ← 旧仪器在「非法 YAML」上全绿：方向错，拦不住
=== A-5 旧内容 + 新仪器（test/skill-frontmatter.test.mjs）===
✖ 根 SKILL.md：frontmatter 只含 name + description，每行按 YAML 读出来等于整行值
✖ 镜像 skills/roadbook/SKILL.md：frontmatter 只含 name + description，每行按 YAML 读出来等于整行值
ℹ tests 4 | ℹ pass 2 | ℹ fail 2
  AssertionError: 未加引号的值里有「: 」——YAML 在第 378 个字符处截断成 "…Do not use when no process is wanted"，
  宿主会抛 "Nested mappings are not allowed in compact mappings" 并把整份文件丢掉
```

还原后复跑（新内容）：

```text
=== A-6 还原后 + 宿主同款真 yaml 解析 ===
  [OK]    SKILL.md | keys=name,description | description=496 chars
  [OK]    skills/roadbook/SKILL.md | keys=name,description | description=496 chars
=== A-7 还原后 + 新仪器 ===
ℹ tests 4 | ℹ pass 4 | ℹ fail 0
```

**端到端（真宿主，非模拟）**：技能现已进技能目录——本会话 `skill("roadbook")` 当场加载成功并返回 45 卡路由表（基目录 `…\node_modules\roadbook\skills\roadbook`），宿主技能目录里 `roadbook` 与 `roadbook-atlas` 并列。这是「旧代码会挂、新代码要过」在真机上的一次实跑。

### B. 根因二（分叉会话被误判成子代理）

新增用例：`test('分叉/续接会话不算子代理：delegationDepth 优先于 parentSession')`（6-3 同批落的，本卡实跑并做变异证伪）。

变异（逐字换回 6-3 之前的旧实现：先看 `parentSession`）：

```text
=== B-1 变异：逐字换回旧实现（8767 -> 8775 字符）===
=== B-2 旧实现 + trigger 单测 ===
✖ 分叉/续接会话不算子代理：delegationDepth 优先于 parentSession
ℹ tests 24 | ℹ pass 23 | ℹ fail 1        ← 防复发用例恰好 1 条红（actual: true, expected: false）
=== B-3 还原 + 复跑 ===
ℹ tests 24 | ℹ pass 24 | ℹ fail 0
```

判据直测（四种会话形状，直调 `isSubagentHeader`）：

```text
  PASS | 分叉用户会话（parentSession + depth=0 + isSeeded=true） -> false（期望 false）
  PASS | 真子代理（parentSession + depth=1 + isSeeded=false） -> true（期望 true）
  PASS | 宿主没给 depth → 退回旧判据（parentSession 非空） -> true（期望 true）
  PASS | 全新会话（两个字段都没有） -> false（期望 false）
  exit=0
```

### C. 复跑：约定测试命令三组全绿（提交前，工作树含新增测试文件）

```text
=== 约定测试命令（package.json scripts.test 三组，逐组跑）===
  [1/3] exit=0 | tests 145 | pass 145 | fail 0 | skipped 0     （新增 4 例：145 = 141 + 4）
  [2/3] exit=0 | tests 94  | pass 94  | fail 0 | skipped 0
  [3/3] exit=0 | tests 33  | pass 33  | fail 0 | skipped 0
```

---

## ② 第二件：回归清单（受影响面逐项过）

### A. 被改判据 `isSubagentHeader`（`plugin/roadbook-autoload/trigger.js:105`）

引用清单来源（`$sym = 'isSubagentHeader'; Get-ChildItem -Path . -Recurse -File -Include *.js,*.mjs,*.ps1 | Select-String -Pattern $sym | Select-Object Path,LineNumber`）：`trigger.js:105`（定义）｜`index.js:51,688`｜`gate.js:23,177`｜`test/trigger.test.mjs:13,100-103,109,111`。

| # | 调用方 | 怎么验证没被改坏（可观察行为） | 实测 | 勾 |
| :-: | :-- | :-- | :-- | :-: |
| A1 | `index.js:688`（自动加载注入路径） | 该套件全绿（含会话门/注入判定 40 例） | `exit=0 tests=40 pass=40 fail=0` | ✅ |
| A2 | `gate.js:177`（纪律门） | 该套件全绿（11 例） | `exit=0 tests=11 pass=11 fail=0` | ✅ |
| A3 | `trigger.js` 本体 + 其 5 处测试引用 | 24 例全绿 + 四种会话形状直测 4/4 PASS | `exit=0 tests=24 pass=24 fail=0`；直测 `exit=0` | ✅ |

### B. 被改常量 `PLUGIN_VERSION`（`lib/client.js:91`，6-3 随版本 0.7.1→0.7.2 动过）

引用清单：`lib/client.js:91,1962,2385,2555`｜`test/client-contract.test.mjs:205,1066`。

| # | 调用方 | 可观察行为 | 实测 | 勾 |
| :-: | :-- | :-- | :-- | :-: |
| B1 | `client-contract.test.mjs:205`（严格等于 `package.json.version`） | 该套件全绿（41 例） | `exit=0 tests=41 pass=41 fail=0` | ✅ |
| B2 | `lib/client.js:1962/2385`（两处页脚显示 `v…`） | 页脚版本串存在断言（同套件 :1066）绿 | 同上 | ✅ |
| B3 | 版本三处事实源 | 三处同值 | `package.json: "version": "0.7.2"` ／ `lib/client.js: var PLUGIN_VERSION = "0.7.2"` ／ `CHANGELOG.md: ## [0.7.2] - 2026-10-06` | ✅ |

### C. 被改文件 `SKILL.md` / `skills/roadbook/SKILL.md` 的 frontmatter 消费方

引用清单来源（`$sym = 'SKILL\.md'`，含 `*.js,*.mjs,*.ps1,*.yml`）：`lib/index.js:87-98`（`RUNTIME_FILES` 白名单）｜`plugin/roadbook-autoload/index.js:118,166,309-318`｜`skills/roadbook/bin/route.mjs:5,248`｜`skills/roadbook/bin/rules.mjs:5`｜`_qc/check.ps1` §4（308-340、605-612）｜`test/` 六份。

| # | 调用方 | 可观察行为 | 实测 | 勾 |
| :-: | :-- | :-- | :-- | :-: |
| C1 | `test/skill-mirror.test.mjs`（两份逐字节镜像不破） | 2 例全绿 | `exit=0 tests=2 pass=2 fail=0` | ✅ |
| C2 | `test/skill-frontmatter.test.mjs`（新增仪器） | 4 例全绿 | `exit=0 tests=4 pass=4 fail=0` | ✅ |
| C3 | `skills/roadbook/bin/route.mjs`（CLI 读卡与文件数） | 该套件 14 例全绿 | `exit=0 tests=14 pass=14 fail=0` | ✅ |
| C4 | `skills/roadbook/bin/rules.mjs --audit`（索引↔正文双向） | 审计判绿、退出码 0 | `判绿：标识唯一、分类与判定钩子匹配、落点与命令引用都在磁盘上、触发词无冲突。 exit=0` | ✅ |
| C5 | `test/rule-parity.test.mjs` / `test/rules-audit.test.mjs` | 8 + 8 例全绿 | `exit=0 tests=8 pass=8 fail=0`（两份） | ✅ |
| C6 | `test/packaging.test.mjs`（白名单覆盖运行时路径，`RUNTIME_FILES` 含镜像） | 6 例全绿 | `exit=0 tests=6 pass=6 fail=0` | ✅ |
| C7 | `_qc/check.ps1` §4（SKILL.md 九条断言 + 新增 YAML 安全断言） | 逐条 `[OK]` | `[OK] SKILL.md frontmatter name=roadbook` / `[OK] SKILL.md frontmatter 未加引号的值不含 ASCII「: 」（命中：）` / `[OK] frontmatter 有闭合的 --- 行` / `[OK] frontmatter 只含 name + description` | ✅ |
| C8 | 真宿主技能发现（`dsh-skill-filesystem`） | 技能可被加载 | 本会话 `skill("roadbook")` 返回 45 卡路由表 | ✅ |

### D. 本次新增的 `test/skill-frontmatter.test.mjs` 自身

| # | 项 | 可观察行为 | 实测 | 勾 |
| :-: | :-- | :-- | :-- | :-: |
| D1 | 仪器有牙（不是恒绿） | 变异后必红 | 见 §②-A：旧内容 → `fail 2`；新内容 → `fail 0` | ✅ |
| D2 | 被门禁的整套件 glob 收走 | 门禁的「仓库自测全绿」含它 | `[OK] 仓库自测全绿（node --test "test/*.test.mjs"）` | ✅ |

---

## ② 第三件：收尾三连（回写状态 → 提交 → 复跑收工仪式取 0）

**回写状态**：本仓无 `STATE.md`（见「偏离项」），6-4 卡 ④ 的两个字段（`下一步` / `未决问题`）无落点；本文件即状态回写的替代载体。

**提交**：

```powershell
git add test/skill-frontmatter.test.mjs _qc/verify-2026-10-06-inject-never-fired.md
git commit -m "6-4 test(inject-never-fired): 新增 frontmatter 仪器（判 YAML 读取方向）+ 回归验证收尾 (BUG-001)"
```

**复跑收工仪式**（提交前那次实跑，退出码 0）：

```text
> powershell -NoProfile -ExecutionPolicy Bypass -File _qc/check.ps1
  [OK] 行数 727 <= 730 ：_qc/check.ps1 自身
  [OK] SKILL.md frontmatter name=roadbook（实际：roadbook）
  [OK] SKILL.md frontmatter 未加引号的值不含 ASCII「: 」（命中：）
  [OK] SKILL.md frontmatter 有闭合的 --- 行（宿主靠它识别元信息）
  [OK] SKILL.md frontmatter 只含 name + description（实际：name, description）
  [OK] 仓库自测全绿（node --test "test/*.test.mjs"）
  [OK] 插件离线单测全绿（node --test "plugin/roadbook-autoload/test/*.test.mjs"）
  [OK] 自进化插件离线单测全绿（node --test "plugin/roadbook-evolve/test/*.test.mjs"）
  == 8. 结论 ==
  通过 335 项；失败 0 项
  Roadbook（路书）V6 母版完整性校验：全部通过
```

退出码 `0` = 通过（不是 `1` 收工仪式失败，也不是 `2` 环境未初始化）。

---

## ③ 证据回执

1. **负面测试命令与输出**：见 §② A / B / C（三块均为逐字粘贴的真实输出，非摘要）。
2. **回归清单逐项勾选**：见 §② 第二件 A（3 项）/ B（3 项）/ C（8 项）/ D（2 项），共 16 项全部 ✅ 并附实测值。
3. **`check.ps1` 输出 + 退出码**：见 §② 第三件，`通过 335 项；失败 0 项`，**退出码 0**。
4. **本文件路径**：`_qc/verify-2026-10-06-inject-never-fired.md`。
5. **`git status --porcelain`**：提交后为空（见提交回执）。

## ④ 状态回写

- `下一步` = 5-1 归档（母版仓无 `STATE.md`，改由本文件 + CHANGELOG 承载）。
- `未决问题` = 无（**本轮无新增遗留**：两处根因都已闭环；`EntropyDecrease` 那条链仍缺的 `STATE.md` 4 个必填键属**别的项目**的红线文件，不在本批范围）。
