---
name: roadbook
description: Roadbook（路书）V6 开发流程母版：40 张流程卡（0-1 驱动卡 + 39 张动作卡），中英双语（playbook/ 中文权威版 + playbook_EN/ 英文执行版），把开发动作落到固定卡上。覆盖想法调研、选型初始化、老项目接入、需求获取与范围、非功能需求、风险与干系人、设计、威胁建模、界面与交互设计、色彩与风格、动效与微交互、测试策略、分批编码、代码审查、验证、持续集成、环境配置、归档、发布、灰度、观测、备份演练、事件响应、根因分析、修复、回归验证、复盘、流程体检、度量报告、UI 改动、依赖升级、技术债清偿、功能下线、合规隐私、国际化与可访问性、项目重构、用户文档与交接。含门禁、完成定义、红灯与红线规则。用户提到「按流程 / 继续开发 / 开工 / 收工 / 验收 / 体检 / 清理旧代码」时加载。
whenToUse: 用户要求按这套流程推进开发，或问「下一步走哪张卡 / 流程上我该做什么」时。
user-invocable: true
---

# Roadbook（路书）· skill 路由（40 张卡，中英双语）

**基目录 = 本母版根**（`playbook/` 中文权威版、`playbook_EN/` 英文执行版、`template/`、`design/`、`_qc/`）。下面所有相对路径都相对基目录解析。上游仓库：<https://github.com/Aparencia/RoadBook>。

## 先读什么

- **任何一轮开始**：`playbook_EN/0-1-driver-card.md`（同卡号中文权威版 `playbook/0-1-驱动卡.md`）——它负责把意图路由到卡，并给出硬规则。
- **项目现状**：项目根的 `STATE.md`（唯一事实源：阶段 / 下一步 / 起点锚点 / 文件数基线 / 最近归档 / 未决问题）。
- **改流程本身**：同时改 `design/v6-design.md` + 该卡中英两份，并跑 `powershell -NoProfile -File _qc/check.ps1`（退出码 0 才算改完；路径一律正斜杠）。

## 五条铁律（不可绕过）

1. **开工确认**：复述任务 + 列出假设 + ≤5 个澄清问题 + **逐字粘贴本卡「检查清单」原文**。引不出原文 = 本轮作废，重发 `playbook_EN/0-1-driver-card.md`。（同一会话内已声明读过的规则不重复粘贴全文；新会话或规则变更后必须重读。）
2. **完成的唯一定义（DoD）**：`powershell -NoProfile -File check.ps1` 退出码 0，且粘贴真实输出。其他「完成了 / 应该可以」一律视为未完成。
3. **红灯 = 停**：发现违规就输出「红灯 + 依据」，修好条件再走；不许「如果你坚持我可以继续」。
4. **回执只认三种证据**：真实命令输出、文件路径、提交哈希；声明「完成」必须逐条对应证据。
5. **子 agent 边界**：被派去执行具体任务的子 agent **不适用**第 1 条（开工确认）与第 2 条（DoD 粘贴输出）——它只拿到派单、没读卡正文；**必须遵守**第 3 条（红灯 = 停）与第 4 条（回执只认三种证据），并在返回里给出它读过的卡路径与行号（没读过卡就写「未读卡，仅按派单执行」）。

## 双语规则（40 张卡两份，agent 先读英文）

- **agent 执行任何卡时先读英文执行版**（`playbook_EN/` 目录下与本卡同卡号的那份）；中文版在 `playbook/`，是权威源与人类阅读版。
- **冲突裁决**：判据冲突以中文版为准；措辞歧义以英文版为准（英文版存在的理由就是把含糊的中文表述显式化）。
- **同批义务**：改判据必须两份同批修改；只改一份 = 红灯（`_qc/check.ps1` 按卡号逐张对齐两份，缺一张判红）。
- **唯一验收口径**：`powershell -NoProfile -File _qc/check.ps1` 是母版唯一验收口径；改母版 = 退出码 0 + 一次提交 + `git push`（不推 = 装成 skill 的机器永远停在旧版）。

## 路由点火与上下文预算

- **调用轴**：本文件与 `playbook_EN/0-1-driver-card.md` 是常驻入口，只放**一行触发词 + 路由**，判据一律留在被路由到的卡里；卡号 / 卡名 / 文件名变更必须**同批**改本文件的路由表——路由指向不存在的卡 = 路由在骗人（校验器按幽灵引用判红，6-6 信号 13 记路由漂移）。
- **上下文预算**：单会话保持在 smart zone（约 150k tokens）内，**到 75% 就主动开削**（先削已贴过结论的工具输出 / 重复读取 / 走过场的讨论；后保用户原话、当前卡清单原文、未完成待办与证据行号）；走完一张卡进下一张、或隔天 / 换机器继续时，先落证据再压缩或交接。交接条写系统临时目录、**只放指针不复述**、敏感值脱敏。
- **不许从上一会话推断批准**：会话重启 / 换机器 / 交接之后，只能从 STATE.md 记录的"已完成任务边界"继续；「上一会话里用户似乎同意了」不算批准——用户没在**本会话**说过 = 没批准，需要裁决的动作重问一句（问一句的代价远小于返工）。
- **产物寿命**：写下任何产物先声明属哪一类——持久（进仓库）/ 会话内（临时目录，随时可删）/ 永不入库（只贴回执）；**没有声明按会话内处理**（防临时报告被当成长期事实源）。
- **分发自检**：装成 DSH skill 的那份是本仓库的 clone，不会自动变新——`git -C "$env:USERPROFILE/.dsh/skills/roadbook" log --oneline -1` 与母版 `git log --oneline -1` 比对，不一致就 `git -C "$env:USERPROFILE/.dsh/skills/roadbook" pull --ff-only`（症状：skill 描述里的卡数与母版不符）。

## 路由：什么场景走哪张卡（40 张全覆盖）

| 场景 | 卡（AI 执行版） |
| :-- | :-- |
| 每轮开口先过驱动卡（意图路由 + 硬规则 + 个人档） | `playbook_EN/0-1-driver-card.md`（0-1 驱动卡） |
| 有个想法，要不要做（Go / Kill / Pivot） | `playbook_EN/1-1-idea-research.md`（1-1 想法调研） |
| 新项目从零开始（选型 + 生成骨架 + git 与远端） | `playbook_EN/1-2-stack-init.md`（1-2 选型初始化） |
| 已有项目接入这套流程（反推结构 + 定裁剪） | `playbook_EN/1-3-onboard-existing-project.md`（1-3 接入已有项目） |
| 新功能开工（方案对比 / 依赖 / 影响面 / 定档位） | `playbook_EN/2-1-feature-research.md`（2-1 功能调研） |
| 需求定边界与验收标准（MoSCoW + non-goals） | `playbook_EN/2-2-scope-definition.md`（2-2 需求范围） |
| 需求模糊 / 有真实用户（访谈 / 观察 / 问卷） | `playbook_EN/2-3-requirement-elicitation.md`（2-3 需求获取与用户研究） |
| 给非功能需求定可测阈值（六维清单） | `playbook_EN/2-4-non-functional-requirements.md`（2-4 非功能需求） |
| L 档 / 多方：风险登记册与干系人 | `playbook_EN/2-5-risk-and-stakeholders.md`（2-5 风险与干系人） |
| 动手前定方案（L 档；含改造 vs 重写判据） | `playbook_EN/3-1-design.md`（3-1 设计） |
| 触碰 auth / 支付 / 删数据 / 外部接口 | `playbook_EN/3-2-threat-modeling.md`（3-2 威胁建模） |
| 设计批准后定测试策略（金字塔与门槛） | `playbook_EN/3-3-test-strategy.md`（3-3 测试策略） |
| 有界面 / 新页面：屏幕、8 态、按钮与表单规格 | `playbook_EN/3-4-ui-and-interaction-design.md`（3-4 界面与交互设计） |
| 定色彩与风格：色阶、语义色、对比度、字号与间距 | `playbook_EN/3-5-color-and-style.md`（3-5 色彩与风格） |
| 定动效：时长、缓动、按钮动效选项与降级 | `playbook_EN/3-6-motion-and-microinteraction.md`（3-6 动效与微交互） |
| 写代码（分批 / 净增量账本 / 取代即删） | `playbook_EN/4-1-batch-coding.md`（4-1 分批编码） |
| 合入前审查（七维度 / 越界 / 废弃标记） | `playbook_EN/4-2-code-review.md`（4-2 代码审查） |
| 功能做完要验证（guardrail + 行为验收） | `playbook_EN/4-3-verification.md`（4-3 验证） |
| 首次搭 CI / 改门禁（口径与 check.ps1 唯一） | `playbook_EN/4-4-continuous-integration.md`（4-4 持续集成） |
| 需要新环境 / 配置项与密钥来源 | `playbook_EN/4-5-environments-and-config.md`（4-5 环境与配置） |
| 一段工作收尾入库（归档十查 + 孤儿五张清单） | `playbook_EN/5-1-archive.md`（5-1 归档） |
| 里程碑发版（分级部署 + 回滚预案） | `playbook_EN/5-2-release.md`（5-2 发布） |
| L 档 / 高风险发布：策略与灰度阶梯 | `playbook_EN/5-3-progressive-delivery.md`（5-3 发布策略与灰度） |
| 发布后观测窗（健康检查 + 核心指标） | `playbook_EN/5-4-observability.md`（5-4 运行期观测） |
| 定期 / 改数据结构后做恢复演练 | `playbook_EN/5-5-backup-and-dr.md`（5-5 备份与恢复演练） |
| 线上故障 / P0（先定级，止血优先于根因） | `playbook_EN/6-1-incident-response.md`（6-1 事件响应） |
| 出 bug 找原因（诊断四问 + 五问法） | `playbook_EN/6-2-root-cause-analysis.md`（6-2 根因分析） |
| 修 bug（最小改动 + 范围双维锁） | `playbook_EN/6-3-bugfix.md`（6-3 修复） |
| 修完确认没弄坏别的（负面测试 + 回归清单） | `playbook_EN/6-4-regression-verification.md`（6-4 回归验证） |
| 任务或事故后复盘（预防措施落到文件） | `playbook_EN/6-5-retrospective.md`（6-5 复盘） |
| 定期体检流程本身（每 15 次归档触发） | `playbook_EN/6-6-process-audit.md`（6-6 流程体检） |
| 每季度 / 里程碑出度量与质量报告 | `playbook_EN/6-7-metrics-and-quality-report.md`（6-7 度量与质量报告） |
| 改界面（查注册表 + 回写注册表） | `playbook_EN/7-1-ui-change.md`（7-1 UI 改动） |
| 升依赖（理由 + 兼容调研 + lockfile 单独审） | `playbook_EN/7-2-dependency-upgrade.md`（7-2 依赖升级） |
| 欠账 / 腐化要清（T 批 / P 清理批） | `playbook_EN/7-3-tech-debt-repayment.md`（7-3 债与腐化清偿） |
| 功能下线、删功能（影响面 + 数据处置） | `playbook_EN/7-4-feature-decommission.md`（7-4 功能下线） |
| 收个人数据 / 对外发布（合规口径） | `playbook_EN/7-5-compliance-and-privacy.md`（7-5 合规与隐私） |
| 多语言 / 无障碍要求 | `playbook_EN/7-6-i18n-and-accessibility.md`（7-6 国际化与可访问性） |
| 交付 / 换人（用户文档与交接清单） | `playbook_EN/7-7-user-docs-and-handover.md`（7-7 用户文档与交接） |
| 结构腐化 / 迁移 / 大改造（不动外部行为） | `playbook_EN/7-8-refactoring.md`（7-8 项目重构） |

拿不准、跨多张卡时：回到 `playbook_EN/0-1-driver-card.md` 让它判。

## 红线与门禁

- **红线（必须人在场确认）**：认证、支付、删数据、改表结构。
- **不可委托**：执行 SQL、发布、打 tag、门禁裁决、验收确认。
- 档位 S/M/L 只升不降；门禁三形态：批级知会 / 轻确认 / 裁决；**个人档默认轻确认**，L 档与红线域才用裁决。
- 并行任务（Agent Teams / 子 agent）：写作用域互斥、共享文件由主线程独占、并发写者 ≤5，**验收由主线程亲自跑门禁并抽查 diff**。

## 项目接入

- **新项目**：走 `playbook_EN/1-2-stack-init.md`，整套复制 `template/`（`AGENTS.md` 宪法、`STATE.md`、`check.ps1` / `doctor.ps1` / `gate.ps1` / `orphans.ps1` 四个守护脚本）。
- **老项目**：走 `playbook_EN/1-3-onboard-existing-project.md`；动作 5.5 有装四脚本的原文命令，不覆盖已有同名脚本。
- **接入后**：在 `STATE.md` 落「起点锚点」（`git rev-parse HEAD`）与「文件数基线」（`@(git ls-files).Count`，须在首次提交之后取），`git init` 后立刻首次提交——4-1 卡的账本与 5-1 卡的核对都以 git 为基准。

## 生成多删除少（一句话版）

改存量批次必须报净增量账本（新增/删除的行数与文件数）；被取代的实现同批删，删不掉就登记 `STATE.md` 并行态登记簿；孤儿文件必须落「删除 / 登记技术债 / 补登记」之一。判据在 3-1 / 4-1 / 4-2 / 5-1 / 6-6 / 7-3 / 7-8 卡内。

## 边界（防两处真相）

本文件只做**路由与铁律**，不含任何判据。判据一律以 `playbook/`（中文权威版）/ `playbook_EN/`（英文执行版）卡内原文为准；判据冲突时以中文版卡为准，并回来修本文件。
