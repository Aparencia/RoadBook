# Roadbook playbook_EN · 翻译规范与术语表

> 本文件是 `playbook_EN/` 的唯一翻译口径。改术语 = 改本文件 + 重跑受影响卡。
> 行数上限 200 行。术语表之外的词按「原则」自行判断。

## 1. 三条原则（按优先级）

1. **判据不许变**：数字、阈值、命令、路径、卡号、清单条目数量，逐字对应。英文版只允许把中文的含糊表述**显式化**（消歧），不允许增删规则、放宽或收紧判据。
2. **结构逐段对应**：中文卡有什么段，英文版就有什么段；段序、段号、段标题一一对应，便于机器逐段比对（见 §3）。
3. **准确优先于优雅**：宁可读起来生硬，也不要为了通顺牺牲精度。出现无法直译的判据词，用术语表；术语表没有的，保留中文原词并加括号注释 `（<中文原词>）`，**不许自造近义词**。

## 2. 消歧规则（英文版存在的理由）

中文表述有两种以上合理理解时，英文版必须选一种并显式写出，同时在该行末尾加 `[disambiguated]` 标记，便于中文版回头对齐：

- 「查一下」→ 指明查什么命令、看哪一列
- 「尽快」→ 给出具体时长（如 within 5 minutes）
- 「相关文件」→ 列出具体路径
- 「测试通过」→ 指明哪条命令、退出码几算通过

反向义务：中文版若被英文版消歧后修正，两份必须**同一批提交**。

## 3. 结构映射（机器比对用，必须逐字一致）

| 中文 | 英文 |
| :-- | :-- |
| `# 卡 <卡号> · <卡名>` | `# Card <卡号> · <Card name>` |
| `> 触发：… ｜ 产物：… ｜ 下一张：…` | `> Trigger: … \| Output: … \| Next: …` |
| `## ① 开工确认` | `## ① Start confirmation` |
| `## ② 执行` | `## ② Execution` |
| `## ③ 证据回执` | `## ③ Evidence receipt` |
| `## ④ 状态回写` | `## ④ State write-back` |
| `等待你裁决。回复"继续"执行下一张卡，或说新指令。` | `Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.` |
| `❌` / `✅` | 原样保留 |
| `【…】` 段标记 | `[ … ]` |

## 4. 术语表

| 中文 | English（唯一写法） |
| :-- | :-- |
| 路书 / Roadbook | Roadbook |
| 母版 | master repo / master |
| 卡 / 卡片 | card |
| 驱动卡 | driver card |
| 动作卡 | action card |
| 判据 | criterion (pl. criteria) |
| 检查清单 | checklist |
| 开工确认 | start confirmation |
| 复述任务 | restate the task |
| 假设 | assumptions |
| 澄清问题 | clarifying questions |
| 证据回执 | evidence receipt |
| 回执 | receipt |
| 真实命令输出 | real command output |
| 文件路径 | file path |
| 提交哈希 | commit hash |
| 状态回写 | state write-back |
| 回写义务 | write-back obligation |
| 唯一事实源 | single source of truth |
| 门禁 | gate |
| 红灯 / 黄灯 / 绿灯 | red light / amber light / green light |
| 停问规则 | stop-and-ask rule |
| 档位 S/M/L | tier S / M / L |
| 红线 | red line |
| 不可委托 | non-delegable |
| 裁决 | verdict |
| 轻确认 | light confirmation |
| 信号（成本最低的知会） | signal |
| 起点锚点 | start anchor |
| 工作树（干净 / 不干净） | working tree (clean / dirty) |
| 文件数基线 | file-count baseline |
| 文件数预算 | file-count budget |
| 净增量账本 | net-increment ledger |
| 孤儿（未登记文件） | orphan |
| 幽灵引用 | phantom reference |
| 技术债 / 欠债 | tech debt / debt |
| 并行态登记簿 | parallel-state register |
| 归档 | archive |
| 交接 | handover |
| 场景走查 | scenario walkthrough |
| 变异体证伪 | mutant falsification |
| 负面测试 | negative test |
| 核心路径 | critical path |
| 覆盖率门槛 | coverage threshold |
| 测试金字塔 | test pyramid |
| 灰度 / 放量阶梯 | progressive delivery / rollout ladder |
| 特性开关 | feature flag |
| 回滚 | rollback |
| 观测窗 | observation window |
| 健康检查 | health check |
| 告警 | alert |
| 定级（P0/P1/P2） | severity classification |
| 止血 | stop the bleeding |
| 根因分析 | root cause analysis |
| 非功能需求 | non-functional requirements (NFR) |
| 可测阈值 | measurable threshold |
| 数据字典 | data dictionary |
| 敏感度分级 D1~D4 | sensitivity tier D1–D4 |
| 威胁建模 | threat modeling |
| 信任边界 | trust boundary |
| 干系人 | stakeholder |
| 风险登记册 | risk register |
| 触发信号 | trigger signal |
| 缓解 | mitigation |
| 显式接受 | explicit acceptance |
| 度量 | metrics |
| 部署频率 | deployment frequency |
| 变更前置时间 | lead time for changes |
| 变更失败率 | change failure rate |
| 恢复时间 | time to restore |
| 缺陷逃逸率 | defect escape rate |
| 门禁绿率 | gate green rate |
| 停问热点 | stop-and-ask hot spots |
| 教训复发 | lesson recurrence |
| 文档孤儿行率 | doc orphan line rate |
| 并行态到期未清 | expired parallel state |
| 提交节奏 | commit cadence |
| 推送滞后 | push lag |
| 宪法沉默项 | silent constitutional items |
| 防幻觉三查 | the three anti-hallucination checks |
| 范围四禁 | the four scope prohibitions |
| 收尾顺序铁律 | the closing-order iron rule |
| 会话内已读声明制 | in-session already-read declaration |
| 生成多删除少 | generate more, delete less |
| 取代即删 | replace means delete |
| 回写 | write back |
| 起点（本批） | batch start |
| 本批 | this batch |
| 验收 | acceptance |
| 行为验收清单 | behavior acceptance checklist |
| 环境分层 | environment tiers |
| 配置注入 | configuration injection |
| 备份与恢复演练 | backup and restore drill |
| 恢复演练 | restore drill |
| 用户文档 | user documentation |
| 国际化 | internationalization (i18n) |
| 可访问性 | accessibility (a11y) |
| 界面与交互设计 | UI and interaction design |
| 状态矩阵（8 态） | state matrix (8 states) |
| 色彩与风格 | color and style |
| 设计令牌 | design tokens |
| 中性色阶 | neutral color ramp |
| 语义色 | semantic color |
| 对比度 | contrast ratio |
| 动效 | motion |
| 微交互 | microinteraction |
| 缓动曲线 | easing curve |
| 降级策略（减少动态效果） | reduced-motion fallback |
| 项目重构 | refactoring |
| 外部行为不变 | external behavior unchanged |
| 净减目标 | net-reduction target |
| 智能体团队 | Agent Teams |
| 任务板 | shared task board |
| 写作用域 | write scope |
| 并行写者 | concurrent writer |
| 上下文预算 | context budget |
| 热记忆 | hot memory |
| 交接三件 | handover triad |

## 5. 禁止翻译（原样保留）

- 所有命令、路径、文件名、卡号（`2-1`、`4-3`）、`.ps1` 脚本名、退出码、`STATE.md` / `AGENTS.md` / `TECH_DEBT.md` / `COMPONENTS.md` / `DATA_DICT.md` / `APIS.md` / `RUNBOOK.md` / `ARCHITECTURE.md` / `CHANGELOG.md` / `.env.example` / `.tool-versions`
- `Roadbook`、`DoD`、`SCOPE`、`gate`（作为门禁义时统一写 gate，不写 checkpoint）
- 反例块里的中文原话（保留中文 + 英文说明，例：`"把它弄好" ("just make it work")`）
