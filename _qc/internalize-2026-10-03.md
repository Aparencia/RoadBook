# superpowers 15 skill → Roadbook 40 卡 内化记录（2026-10-03）

口径：用户指令「将其内部的skill内化成playbook下 没有就新建，有就看看有没有值得拿走的」（superpowers = obra/superpowers）。
本文件是**一次性留痕**（同 `_qc/audit-*.md` / `_qc/sim-*.md` 的性质）：记录 15 个 skill 各自的对应卡、判定、拿走了什么、明确不拿什么。
证据全文在 `/d/Program own/aicode/dpharness/dialogue/_skillrank/internalize/<skill>.md`（每份含机制清单 file:line + 逐字原文／覆盖判定／值得拿走／反向四段，file:line 经子 agent 逐条 grep 核对，本表由 Lead 汇编）。

## 1. 结论先说

- **0 张新卡**。15 个 skill 全部有对应卡（13 个 partial、2 个 full 附近的 partial），没有一个是「无处可去」——按 `design/v6-design.md:452`「卡里每个动作都要有执行者」，每个被拿走的机制都落到了已有卡的既有段落。
- 两个最近似「无对应」的：`finishing-a-development-branch`（无对应卡，最近邻 4-1 合并附则 / 5-1 推送）与 `subagent-driven-development` + `dispatching-parallel-agents`（编排域，8-1/8-2/8-3 已于 2026-10-03 按用户裁决删除）。**都不新建卡**，理由见 §3。
- 共建卡成本（若新建 1 张卡）：`design/v6-design.md` 卡表 + §4.1 英文文件名表 + §17.3 计数 + `design/playbook-contract.md:3` + 2 个新卡文件 + `README.md` + `START-HERE.md` + `SKILL.md` + `_qc/check.ps1:63`（硬断言 40）共 11 处清单需要同批改，收益低于落到既有卡。

## 2. 映射矩阵（15 → 40）

| superpowers skill | 对应卡 | 判定 | 拿走的（落点） |
| --- | --- | --- | --- |
| brainstorming | 2-1 / 2-2 / 3-1（+1-1） | partial（2026-10-03 加深） | 2-1 §①「路径预判（先判后问）」 + 第 6 项「可分解性先判」 + 动作 5「中途发现隐藏复杂度立即停下声明升档」；2-2 范围合规「⑥ 自洽查；⑦ 步骤合格查；⑧ 批准不跨段查；⑨ 展示即开工查」（七查 → 九查）；1-1 §②「动作 0.5 探针分支」（只问"能不能/可不可行"时走） |
| writing-plans | 2-2 / 4-1 | partial | 2-2「动作 3.5 未覆盖输入五类」；4-1 批次接口契约 + 批间接口预检 |
| executing-plans | 4-1 / 4-2 / 4-3 | partial | 4-1 批次完成行（命令没过不许写「完成」） |
| test-driven-development | 3-3 / 4-1 / 4-3 / 6-4 | partial | 4-1 第一条测试先跑出红；3-3 每条单元测试必须能说出让它变红的生产改动；4-3 变异点至少覆盖三类 |
| verification-before-completion | template/AGENTS.md §6 ↔ 4-3 | partial（最接近 full） | AGENTS.md §6「完成/通过」收紧为「本轮同一条消息内真跑的输出」+「需求满足」行；4-3 证据出现前禁说满意/禁「应该」修饰；先答「哪个命令能证明」 |
| requesting-code-review | 4-2 | partial | 4-2 §① 派单输入单四项；「SCOPE 沉默 ≠ 许可」；禁审查者再派子代理 |
| receiving-code-review | 4-2 / 4-1 / 6-3 | partial | 4-2 §④ 收到审查意见动手前六步 + 禁表演性响应；「误报」必须有据 |
| systematic-debugging | 6-2 主（邻 6-3/6-4/3-3） | partial | 6-2 反向追链（禁止只修报错行）；6-3 修复尝试计数 N=3 转架构质疑；3-3 禁固定 sleep |
| using-git-worktrees | 4-1:109-112 并行车道附则 | partial | 4-1 工作区隔离探测（`--git-dir` vs `--git-common-dir`）+ `git check-ignore` 前置；单元分支第一条证据 = 基线通过数 |
| finishing-a-development-branch | **无对应卡**（4-1 / 5-1 各覆盖片段） | none | 4-1 合并前确认基分支 + 每合并一片就在**合并结果**上重跑全量；5-1 push 被拒 = 停下、禁 `--force` |
| subagent-driven-development | 4-1 附则 / 4-2 / AGENTS.md §12 | partial | 4-1 派单粒度三问；4-2「diff 之外」的唯一合法出口（命名风险定点检查）；AGENTS.md §12 子 agent 不自派 + 不继承历史 + 「完成但有疑虑」行 |
| dispatching-parallel-agents | 4-1 §② 附则 | partial | 4-1 并行准入先判相关性（同契约/同行为/同根因即禁拆）；方案五列表（含「根因域」列）；合并后返回四步（含抽查 diff 与理由）；同一条指令一次性派完 |
| writing-skills | design/playbook-contract.md + _qc/baseline | partial | contract §2②「形态选择」四类失败→四种形态；§2①「违反字面即违反精神」 |
| diagnosing-superpowers | 6-6 / 插件 A·B 环 / _qc/baseline | partial | 6-6「信号 12：卡行为 baseline 产物无人消费」；baseline README 的收方机械丢弃（无 `case.txt:行号` 即丢） |
| using-superpowers | SKILL.md / 0-1 / 插件 | partial | SKILL.md 第 5 条子 agent 边界；v6-design §15 脆弱面（`includeSubagents: false`）；baseline README 类型 5 装载失败 |

## 3. 明确不拿的（反向结论，已在案）

1. **不回收 8-1/8-2/8-3**：依据 `design/v6-design.md:482`、`:490`（用户裁决删除：「它们本就不属 SDLC 阶段，属『用什么工具跑流程』」）与 `:452`（「卡里每个动作都要有执行者」）。SDD/dispatching 的可迁移价值全部并入 4-1 附则与 AGENTS.md §12——**是补全 4-1 已有附则，不是给 8-1 发牌照**。
2. **不照搬 TDD「写错就删掉重来」**：与净增量账本（删除行=0 判红）与起点锚点冲突 → 改写为「丢弃未提交产物 + 在 STATE.md 申报丢弃了什么」。
3. **不学 `using-git-worktrees/SKILL.md:100` 的 Sandbox fallback**（工作区开不出来就原地改）：与 4-1「多单元直写同一工作树 = 禁止」正面冲突。
4. **不引进 PR 选项**（`SKILL.md:61`）：`playbook/` 全文无 "Pull Request"，Roadbook 是单人本地 git。
5. **不引进 executing-plans「任务之间不打断」**（`SKILL.md:27-30`）：与 4-1 有意的批级停顿冲突，以 Roadbook 为准；其 ledger/todo 双轨也不引进（会撞 STATE.md 唯一事实源），只保留「批次完成行」这一条机械格式。
6. **不重复已被 ②⑥ 覆盖的**：brainstorming 红旗表、`Ruling:` 格式（已落 0-1 红旗表与 4-1 自行裁决留痕）。
7. **不照抄形态**：superpowers 这三类技能全文零机械判据（无退出码、无阈值、无门禁命令）——只取判据内容与理由措辞；照抄会把 Roadbook 的机械门禁稀释成「加强意识」。

## 4. 落点索引（本轮实际改动的文件）

- 卡：`playbook/` 与 `playbook_EN/` 的 1-1、2-1、2-2、3-3、4-1、4-2、4-3、5-1、6-2、6-3、6-6（中英同批）。
- 母版层：`template/AGENTS.md`（§6 三列表 4 行 · §12 多 agent 三条）、`design/playbook-contract.md`（§2① 一句 + §2② 形态选择）、`design/v6-design.md`（§8 三条 + §15 脆弱面一条）、`SKILL.md`（第 5 条子 agent 边界）、`_qc/baseline/README.md`（对照组 · 机械丢弃 · 类型 5）。
- 门禁：`_qc/check.ps1` 增补断言（见提交信息）。

## 5. 本轮没拿、留作下一轮候选（未落，按价值排序）

1. `_qc/baseline/run.ps1` 实现 `-Arms guidance,none` 对照组（现在只有 README 口径，没有产物）；`_qc/baseline/README.md:37` 的「走 6-6」已由 6-6 信号 12 接上，但「改卡提交必须附 baseline run 目录」还没有断言。
2. 4-1 / contract 的「清单原文 → `- [ ]` 未完成条目」机械化（含把 `run.ps1` 的 `card_receipt` 指纹从字面 `清单原文|正在执行` 扩成 `- \[ \] `）。
3. 6-2 分层插桩（多组件先在各边界打日志再提修复方案）、6-4 四层防御清单、6-4 回归四次输出（写→绿→撤→红→恢复→绿）。
4. 4-2 报告结构（放行项 Declined to judge／先写通过项再写问题）+ 重审轮数上限与升级阶梯；receiving 的修复顺序（阻塞 → 简单 → 复杂）。
5. 4-1 清理归属（`.worktrees/` 移除被拒禁 `--force`，交用户三选一）与「删未合并成果需逐字口令」。
6. 4-1 批次右尺寸判据（**本条 2026-10-03 已部分落地**：1-1 探针分支、2-1 可分解性先判与中途升档、2-2 批准不跨段 / 展示即开工查均已落卡；只剩 4-1 的批次右尺寸判据未落）。
7. 0-1 红旗表补四行（用 `_qc/baseline/prompts/*.txt` 的真实原话）——**故意不现在写**：按 `design/playbook-contract.md` 的「表里写真实出现过的原话」，应等 baseline 的真实 RED 证据（`runs/<时间戳>/<case>.txt:行号`）触发后再补。
