# 内化记录：mattpocock/skills → Roadbook V6 母版（2026-10-04）

> 上一批：`_qc/internalize-2026-10-03.md`（superpowers 15 个 skill → 10 张卡 + 母版层，提交 a7ed531）。
> 本批：**mattpocock/skills → 14 张卡 + 母版层，0 张新建卡**。断言登记在 `_qc/check.ps1` §2b（删句即红）。

## 1. 来源与目的

- 仓库：`mattpocock/skills`（GitHub 275,129★；本机素材镜像 `_skillrank/mattpocock/`，含 `README.md`、`repo.json`、`tree.json`、`files/` 下 172 个原文件）。
- 读过的部分：`skills/engineering/*`（ask-matt、code-review、codebase-design、diagnosing-bugs、domain-modeling、implement、implement-spec、pr、prototype、research、retro、triage、wayfinder、wizard、grill-with-docs、improve-codebase-architecture）、`skills/productivity/*`（grilling、grill-me、handoff、teach、to-questionnaire、wait-what、writing-for-agents）、`.agents/`（invocation.md、writing-docs.md、adr/、install-block.md）、`.out-of-scope/`、`.changeset/`、`docs/engineering/*`、`GLOSSARY.md`。
- 目的：这批经验集中在**文档怎么写、上下文怎么分配、证据怎么分档、决策怎么留痕**——全是母版层的写法问题，不是新的开发阶段。判定口径与上一批一致：**能机器判的一律下沉为断言（零 token），散文只留给需要判断力的事**；卡内判据必须给命令或可观测谓词。
- 结论：**0 张新建卡**。40 张卡已覆盖全部阶段，这批 30 余条建议全部落在既有卡的判据层与母版契约层。

## 2. 落点（14 张卡 + 母版层）

| 卡 | 新增判据 | 来源 |
|---|---|---|
| 0-1 驱动卡 | 硬规则 10 **自带推荐答案**（每个问题自带一个推荐答案与理由，用户只需点头或摇头）｜硬规则 11 **smart zone + 交接条**（单会话约 150k tokens，跨阶段/接近上限/换机先落证据；交接条只放指针、不复述、脱敏）｜硬规则 12 **产物寿命三分类**（持久 / 会话内 / 永不入库，没声明按会话内处理） | `.agents/invocation.md`、`ask-matt/PHASE-BOUNDARIES.md`、`handoff`、`writing-for-agents` |
| 2-1 功能调研 | 动作 2.5 **拒绝台账**（`日期 \| 提案 \| 否决理由 \| 既往请求编号`；重审同一提案先读台账再讨论） | `.out-of-scope/`、`domain-modeling` |
| 2-2 需求范围 | 动作 1.5 **阻塞依赖显式登记**｜动作 3.1 **用户故事给人看、验收命令给 agent 跑** | `to-tickets`、`to-spec` |
| 3-1 设计 | 动作 7 **决策记录三要件**（难以回退 + 出人意料 + 真有权衡，缺一条不写）｜动作 8 **被否方案**（属拒绝台账，已实现的 wontfix 不许混入） | `domain-modeling/ADR-FORMAT.md` |
| 3-3 测试策略 | 动作 7 **接缝先约定**（同义反复测试 / 横向切片） | `tdd` |
| 4-1 分批编码 | 动作 6 **可开工前沿**｜动作 7 **快进合并**｜动作 8 **批量机械改写之后必须跑全量门禁** | `implement-spec`、`implement`、`resolving-merge-conflicts` |
| 4-2 代码审查 | ② 段首 **双轴并行审查**（标准轴 / 规格轴，气味基线 6 行表，AI 生成声明与查重；派单双轴各抄一份，禁止把另一轴的发现塞给审查者） | `code-review` |
| 4-3 验证 | **证据分档**（S 档人看得懂 / A 档可复验，声明完成至少 A 档）｜**没有能变红的命令，就没有第二阶段** | `pr` |
| 4-5 环境与配置 | 动作 9 **只有人能做的步骤**（清单化，agent 不代劳） | `setup-matt-pocock-skills` |
| 5-2 发布 | **Merge Danger 标注**（单向门 / 双向门、爆炸半径；单向门 + 大半径 = 红线裁决，回滚预案先演练） | `pr` |
| 6-2 根因分析 | **没有能变红的命令**（第一阶段即复现） | `diagnosing-bugs` |
| 6-6 流程体检 | **信号 13 路由漂移**（入口条目与磁盘对账，卡号/文件名/命令 `Test-Path` 为假即记）｜**信号 14 no-op 规则**（删掉后行为完全不变 = 该删或改写）；十二类 → **十四类**信号 | `ask-matt`、`writing-for-agents` |
| 7-7 用户文档与交接 | 交接条三件：写系统临时目录、**指针不复述**、脱敏后删文件 | `handoff` |
| 7-8 项目重构 | **一个适配器 = 假设的接缝；两个适配器 = 真接缝**（只有一个实现时抽出的抽象层登记为技术债） | `codebase-design` |
| 母版层 `design/playbook-contract.md` | ② 段「每个问题自带推荐答案」；新增**写作教义**（正说优先 / no-op 测试 / 信息阶梯与就近放置 / 触发词唯一 / 禁用 leading words） | `writing-for-agents`、`writing-docs` |

- 术语同批入表：`design/glossary-en.md` 新增 27 行（rejection ledger、route drift、no-op rule、two-axis parallel review、smell baseline、evidence tiers、one-way door、two-way door、blast radius、Merge Danger annotation、ready frontier、fast-forward merge、rejected options、seam、agree the seam first、tautological test、horizontal slicing、three lifetime classes、blocking-dependency register、pointers, not copies、smart zone、writing doctrine、state the positive first、information ladder and proximity、one trigger phrase per behavior、no leading words、every question carries a recommended answer；172 → 199 行，上限 200）。
- `design/v6-design.md`：§8 新增 8 条（编号 16–23，2026-10-04 批；14/15 是 brainstorming 深内化，编号冲突已在提交前修掉），§4 卡表 6-6 行改「扫十四类信号」并补两项，§8 自身上限 400 → 440，§10 记 item 26。

## 3. 写者与作用域（四写者互斥，0 冲突、0 越界）

| 写者 | 作用域（中英成对） | 影响 |
|---|---|---|
| W1 | 0-1 / 2-1 / 2-2 | 96→99、125→131、103→113 行 |
| W2 | 3-1 / 3-3 / 4-1 / 4-5 | 127→137、123→133、162→177、117→123 行（零删除） |
| W3 | 4-2 / 4-3 / 5-2 | 4-2 146→149 行；严重级表/建议色矩阵/越界检查/禁令只压缩背景表述，规则与阈值逐字保留 |
| W4 | 6-2 / 6-6 / 7-7 / 7-8 | 6-6 为守 150 行把多行命令围栏并成单行（规则未删） |

- 纪律：写者只写自己的文件域、**不跑 `_qc/check.ps1`**（并发会出假红）、**不提交**；中英同批（成对文件 mtime 差约 15 ms）；Lead 独占断言、校验、提交、push。
- Lead 裁决：
  1. 2-2「九查」/ 2-1「四查」计数**不动**——新规则作为独立动作插入，不去改被 §2b 钉死的计数串（改计数要同步中英四处 + 改断言，收益低、风险高）。
  2. 6-6 压行数靠合并命令围栏，**接受**（规则一条未删）。
  3. 4-1 / 5-1 超 150 行属 `Observe` 观测项，**接受**（本轮卡行数上限仍是观测项，不拦红）。
- 只读审查子 agent 报告（2026-10-04）指出 5 项阻断，**提交前全部修掉**：① `_qc/check.ps1` 三处断言滞后（§2b 6-6 两行 + :299）；② `playbook_EN/6-6-process-audit.md` §① 把 14 类信号逐项列名删成一句（违反中英逐段对应）→ 恢复逐项；③ 术语表缺 14 个新术语 → 补 22 行；④ `design/v6-design.md` §8 编号 14/15 重复 → 2026-10-04 批改为 16–23；⑤ 4-2 英文①段缺「双轴派单各抄一份」与「另一轴的发现」→ 补齐。

## 4. 断言登记（`_qc/check.ps1` §2b）

- 新增 12 组文件行：0-1、3-1、4-5、5-2、7-7、7-8（中英各 6 行）+ `design/glossary-en.md` 行。
- 扩展 8 组既有行：2-1、2-2、3-3、4-1、4-2、4-3、6-2、6-6、`design/playbook-contract.md`。
- 本轮共 66 条 needle 全部用 shell `grep -F` 逐条核验在位；`_qc/check.ps1` 自身上限 400 → 440（本文件 + 断言增长），已同步 `design/v6-design.md` §8。
- 新增断言：`_qc/internalize-2026-10-04.md` 存在性（本文件）。

## 5. 明确不拿（带理由）

1. `.changeset/` 的 changeset 工作流——母版没有发布流水线，加了就是空转。
2. 每个 skill 的 `agents/openai.yaml`——DSH 无此规范，抄来是第二个事实源。
3. `scripts/link-skills.sh`、`scripts/sync-plugin-version.mjs`——本机安装态由 DSH 管，母版不接管。
4. `improve-codebase-architecture` 的 HTML 报告——第二个状态源（同 2026-10-03 对 Visual Companion 的裁决）。
5. `grilling` 的「无情追问到设计树每个分支解决」整流程——与 2-1「澄清问题 ≤5 个」的预算直接冲突；只取其中一条「每个问题自带推荐答案」。
6. `wait-what` 的对话重述——与 4-1 / 7-7 交接条「指针不复述」冲突，同一事实不许两处写。

## 6. 下一轮候选

1. 6-6 信号 13 的命令要真喂 `Test-Path`（审查指出当前只列行、判定靠目检，且 `\d+-\d+` 会命中日期噪声）。
2. 6-6 信号 14 的 no-op 对照不可复现（换会话/换机/换模型即不同）——要么定死对照协议，要么降级为人工审核项。
3. 6-6 ③ 回执附证清单未点名信号 12（目前点名 7–11、13、14）。
4. 4-2 中英 ① 段剩余措辞与格式偏移（`:87` 两条并成一行的 653 字符长行、§② 前 `---` 与空行）。
5. 0-1 英文卡内两种夹注风格（`("…" ("…"))` 与 `（中文词）`）统一。
6. 4-1 / 5-1 超 150 行——下一轮精简时恢复硬断言。
