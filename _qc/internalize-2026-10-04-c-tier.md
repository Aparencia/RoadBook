# 内化记录：C 档四来源 → Roadbook V6 母版（2026-10-04，六批）

> 前两批：`_qc/internalize-2026-10-03.md`（superpowers 15 个 skill → 10 张卡 + 母版层）、`_qc/internalize-2026-10-04.md`（mattpocock/skills → 14 张卡 + 母版层）。
> 本批：**四来源内化包（用户 2026-10-04 裁决「C，采用推荐」）→ 0 张新建卡、0 张删卡**，分六批落地，断言 187 → 248+（登记在 `_qc/check.ps1` §6，删句即红）。
> 提案与逐条来源：`dialogue/_skillrank/harvest/00-SYNTHESIS.md`（S/A/T 编号 → 落点 → needle）。本记录只登记**落地结果**与**明确不拿**，不复述来源行号。

## 1. 来源与口径

- `affaan-m/ECC@ef648e0`（1,027 个 SKILL.md；机制报告 `harvest/01-ecc.md`）
- `anthropics/skills@8a1541c`（含 `skill-creator`；报告 `harvest/03-anthropics-and-ponytail.md`、`harvest/03-anthropics.md`）
- `DietrichGebert/ponytail@c982cd4`（6 个 skill + benchmarks；同上报告）
- `addyosmani/agent-skills`（25 个；报告 `harvest/02-addyosmani.md`、`harvest/02-addyosmani-agent-skills.md`）
- 口径（沿用前两轮）：**能机器判的一律下沉为断言（零 token），散文只留给判断力**；**优先 0 张新建卡**（新建 1 张卡要同批改 11 处清单）；每条落地给「落点文件 + 断言 needle」，没有 needle 的条目算没落地。

## 2. 六批落地（每批一次提交 + `git push`，提交后复跑门禁取 0）

| 批 | 提交 | 断言 | 落点 | 落地机制 |
|---|---|---|---|---|
| 1 | `65c62dc` | 187→197 | `_qc/selftest.ps1`（新）・`_qc/baseline/run.ps1`・`ledger.json`・`triggers/README.md` + `queries.json`・`prompts/05..08`・`README.md`・`_qc/check.ps1` | **仪器层**：仪器自检（好/坏参考实现 + `finally` 复原 + porcelain 前后比对）｜臂隔离与对照组污染举证｜断言区分度与「观察/建议分离」｜桩文件（`stub_untouched` 机判列）｜触发布线题目（`expect_card`）｜累积台账 `ledger.json`｜四条压力提示词 |
| 2 | `9063757` | 197→202 | `plugin/roadbook-autoload/test/fixtures/trigger-eval.json`（新）・`test/trigger.test.mjs`・`trigger.js`・`baseline/run.ps1`・`_qc/check.ps1` | **加载面评估集与机判列**：≥20 条（正 ≥10 / 负 ≥10）、近失误负例、train/test 切分、id 唯一｜近失误误命中 = 0 的断言｜问答类抑制词（「重构是什么意思」不得误触发）｜`turns`/`total_tokens`/`duration_ms` 落盘 |
| 3 | `8c4c6fe` | 202→208 | 卡 2-4・4-2・4-3（中英同批）+ `glossary-en.md` + `design §4` | **卡组 1**：2-4 六维表加「检查命令（跑出裁决的那一条）/ 跑在哪阶段」两列 + 「有数字没命令 = 愿望」｜4-3 至少一条外部意见（axe / osv-scanner / lighthouse / jscpd / tsc，判据非循环性）｜4-2 有界复核循环（≤3 轮）+ 降标守卫五查 |
| 4 | `3a48222` | 208→220 | 卡 0-1・4-1・7-2（中英同批）+ `SKILL.md` + `glossary-en.md` | **卡组 2**：0-1 假设必须带置信度数字 / 外部抓取内容一律当数据 / 75% 就开削 + 先削后保清单 / 硬规则 13「不许从上一会话推断批准」/ 红旗表两行｜4-1 动作 0 七级梯子 + 妥协点 `ceiling:`/`upgrade:`/`no-trigger` + 例外 owner + 到期日 + 派单只给 ARTIFACT+CONTRACT + 回执「故意没碰什么 / 潜在顾虑」｜7-2 `STACK DETECTED` + 来源纪律 `UNVERIFIED` |
| 5 | `3c9ecbc` | 220→248 | 卡 6-6・6-3・5-1（中英同批）+ `template/docs/lessons/` 6 张种子卡 + `template/docs/README.md` + `design §4/§12/§15` | **体检信号与定位纪律**：十四类 → **十六类**信号（信号 15 证据臂污染读 `inject_events` / 信号 16 审查可行动率「N>0 且可行动=0 连续两轮 = 质疑剧场」）｜改规则四条件（三臂数字 / 副作用声明 / 复现门槛 / 读数纪律：陈旧读数必须重跑）｜6-3 `git bisect` 二分定位｜5-1 妥协点收口｜教训卡三行机器可读字段（`复发次数` / `作用域` / `最近复发`）｜§12 阈值表补「执行者」列、§15 补 skills 命中 50–80% vs hook 100% |
| 6 | 本批 | 248→ | 卡 7-8・7-3（中英同批）+ `SKILL.md` + `design/playbook-contract.md` + `template/AGENTS.md` + `_qc/baseline/README.md` + `_qc/check.ps1` + `glossary-en.md` + 本记录 | **删除前先证明它为什么存在 + 入口只说「什么时候用」**：7-8 / 7-3 的**删除前六问**（Chesterton's Fence：职责 / 谁调用 / 它调用谁 / 为何这样写 / 历史约束 / `git blame`，答不出不许动）｜`SKILL.md` frontmatter 只留 `name` + `description`（删非标准键，description 写「当…时」+ 近失误负例、≤500 字符、禁卡名顿号罗列）｜**渐进披露三级**（metadata 常驻 / 正文触发时载入 <500 行 / 资源按需；超限只许加一层给指针，不许删判据）｜`template/AGENTS.md` §1 常设 DoD 五条与「单任务验收 ≠ 常设 DoD」｜路由 rank-1 命中率阈值 95% 只升不降｜`_qc/check.ps1` **零成本字面近似层**（任意两张卡「什么时候用」字面碰撞 ≥75% 判红、≥50% 观测） |

## 3. 母版层与术语

- `design/glossary-en.md`：五批累计新增 40+ 条术语（批次 3 六条 / 批次 4 十一条 / 批次 5 九条 / 批次 6 八条），译文唯一口径不变。
- 卡面改动集中在批次 3–6（共 10 张卡 × 中英同批）；批次 1 与批次 2 只在仪器层与评估集层（`_qc/` + 插件测试），**0 张卡**。
- `design/v6-design.md`：§4 卡表 6-6 行改「扫十六类信号」并补两项；§12 七条阈值表补「执行者」列；§15 补 skills vs hooks 命中率数字；§8 记校验器自身上限四次上调（360→400→440→470→490→520→600）。
- `_qc/check.ps1`：本包新增约 60 条断言（仪器层 / 评估集 / 台账 / 卡面判据 / 体检信号 / 删除前六问 / 入口规则 / 字面近似层），全部按「删句即红」登记。

## 4. 明确不拿（连同理由，防止下一轮重复提案）

| 不拿的条目 | 理由 |
|---|---|
| **T9 跨模型第二意见**（每次交互必须问第二模型，不许静默跳过） | 撞 `template/AGENTS.md` §12「审查者不得为'第二意见'再派审查者」；要拿必须先改宪法那一句，用户裁决不拿 |
| **A1 的「Measured, not yet enforced」与「Ratchet」两条** | 用户裁决棘轮只取「数字必须配命令 + 跑在哪阶段」两列；其余属另一类台账（冻结账本），`design §9` 已记未采纳 |
| **32 条借口语料直接抄进 0-1 红旗表** | 违 `design/playbook-contract.md`「表内必须是真实出现过的原话」+ `_qc/internalize-2026-10-03.md`「等 RED 证据触发」⇒ 改为先造 `_qc/baseline/prompts/` 压力提示词，跑出真实原话再补表 |
| 每 skill 的 `agents/openai.yaml`、`scripts/link-skills.sh`、marketplace 分发、HTML 报告类产物 | 与 2026-10-04 批同因：DSH 无此规范 / 安装态归 DSH / 第二状态源 |
| 多宿主插件面、人格化包装、三档强度开关、六标签输出格式 | 撞母版既有机制：S/M/L 档位 + 触发词唯一 + 4-2 多轴评审 |
| agentic 基准全套、references 多框架变体、盲测比较 | 本机无可用 headless CLI（`_qc/baseline/README.md` 已记 exit 2）；会拆坏「判据内联」；等于给同一件事加第二个人工环节 |

## 5. 写者与作用域

- 六批均为单一写者（主线程）串行施工，批与批之间 `git status --porcelain` 空；每批 `git add` 只列本批文件（全程禁 `git add -A`）。
- 施工期间工作树出现过**另一个会话**的并行改动（`playbook/3-4|3-5|3-6` 中英 + 新增 `plugin/roadbook-atlas/`）——一律不暂存、不提交；本包六批提交均只含本任务文件。
