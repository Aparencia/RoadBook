# Roadbook（路书）· V6「磁盘即流程」开发流程母版

**这是什么**：Roadbook（路书）是一套个人开发标准——流程知识全部放在磁盘上（`playbook/` 中文卡 + `playbook_EN/` 英文卡 + `template/` 模板），agent 按状态自己取用；你只做三件事：**表达意图、裁决门禁、行为验收**。

**远端仓库**：<https://github.com/Aparencia/RoadBook> —— 本仓库就是母版本体；`main` 分支 = 现行版本，版本历史看 git 记录（母版不写文档版本号）。
**许可**：[MIT](LICENSE) —— 可自由复制、改造、再分发，保留版权声明即可。

## 母版有什么

| 组成 | 是什么 | 谁读 |
| :--- | :--- | :--- |
| `START-HERE.md` | 人唯一要读的入口（≤60 行） | 你，读一次 |
| `playbook/` | 40 张流程卡（0-1 驱动卡 + 39 张动作卡，每张固定四段）——中文权威版 | agent 按状态自己取用 |
| `playbook_EN/` | 40 张卡的英文执行版，与中文版逐张对应（agent 先读英文；判据冲突以中文版为准，措辞歧义以英文版为准） | agent 按状态自己取用 |
| `template/` | 新项目的模板（1-2 卡初始化时整套复制，含 check/doctor/gate/orphans 四个守护脚本） | 1-2 卡 |
| `design/` | 设计事实源 `v6-design.md` + 写作契约 + 30 种失败模式报告 | 改流程时才看 |
| `_qc/check.ps1` | 母版唯一验收口径（结构校验 + 40 张卡中英逐张对齐；断言项数以脚本输出为准） | 每次改完跑一次 |
| `SKILL.md` | DSH skill 入口：路由表 40 行 + 四条铁律 + 双语规则（不含判据） | agent 自动加载，或你打 `/roadbook` |
| `plugin/roadbook-autoload/` | DSH 自动加载插件（组合包，可选安装） | 你，装一次 |
| `LICENSE` | MIT 许可（可自由复制、改造、再分发） | 复用前看一眼 |

## 四条铁律（前三条给人，第 4 条约束 agent；原文在 `SKILL.md`）

1. **红灯不是失败**，是"这一步先停"——修好条件再走。
2. **"完成"只有一个定义**：`powershell -NoProfile -File check.ps1` 退出码 0 + agent 粘贴真实输出。别的"完成了"都不算。
3. **agent 引不出卡名与检查清单原文 = 该轮作废**，重发一次 `playbook/0-1-驱动卡.md`。
4. **回执只认三种证据**：真实命令输出、文件路径、提交哈希——声明"完成"必须逐条对应证据。

## 起步三步

1. 复制 `playbook/0-1-驱动卡.md` 全文，发给你的 agent（内容永久不变，存成输入法快捷短语最好）。
2. 说一句意图：「我有个想法：<你的想法>」／「把这套流程接入我现有的项目：<项目路径>」／「继续开发，我要 <做什么>」。
3. 跟着回执走：它提问你回答，它出方案你裁决（绿/黄/红），它干活你照单验收。

具体路径与日常循环见 `START-HERE.md`；看不懂任何一步时，回 `START-HERE.md` 重读一遍即可。

## 装成 DSH skill（可选）

想让 agent 在任意会话自动带上这套流程，把本仓库装成用户级 skill：

```powershell
git clone https://github.com/Aparencia/RoadBook.git "$env:USERPROFILE/.dsh/skills/roadbook"
```

之后新会话的 skill 目录里就有 `roadbook`（说「按流程来」会自动加载），也可以直接打 `/roadbook` 主动加载；更新用 `git -C "$env:USERPROFILE/.dsh/skills/roadbook" pull --ff-only`。

## 自动加载插件（可选，让流程不靠模型自觉）

skill 是否被加载仍取决于模型判断；想 100% 自动，装这个 Host 组合包插件——在 git 项目里一开口谈开发任务，就把同一份 roadbook 正文注入当前回合（只注入一次、手打 `/roadbook` 时让路、`mode: off` 可整体关闭）：

- 装法：DSH 侧栏「插件」→「添加插件」→ 本地绝对路径 → 指向本仓库的 `plugin/roadbook-autoload` → 安装后「立即启用」。
- 说明、配置表与四条验证步骤见 [`plugin/roadbook-autoload/README.md`](plugin/roadbook-autoload/README.md)。

## 维护这套母版

- 改流程 = 改对应卡（`playbook/` 与 `playbook_EN/` 同批改，只改一份 = 判红）+ `design/v6-design.md` 同步 → 跑 `powershell -NoProfile -File _qc/check.ps1`（退出码 0 才算改完）。
- `design/v6-design.md` 是**唯一事实源**：卡、模板、脚本与它冲突时，一律以它为准。
- **改完必须 `git push`**：`~/.dsh/skills/roadbook` 是本仓库的 clone，不推 = 装成 skill 的机器永远停在旧版。
- 命令一律用正斜杠路径（`_qc/check.ps1`）；2026-10 的 71 条缺陷修复、个人档与 DSH 0.2.0-rc2 适配的决策记录见 `design/v6-design.md` §17。
