# TOOLING · 工具面（DSH 版本与插件）（Tooling；8-3 卡产物；≤60 行）
> 谁写：8-3 工具面与插件适配 ｜ 谁读：8-1 并行改造、8-2 上下文预算、4-2 审查、6-6 流程体检 ｜ 何时更新：装、卸、升级插件，改 DSH 版本，改 MCP 连接或权限口径时
> 不适用时怎么写：不用 DSH 及任何插件（纯手工流程）→ 各节写一行 `N/A（理由）`，**不许整份不建**；理由要能判定，例：`N/A（不用 DSH，全部动作手工执行）`。

## 1. 版本行

- 本机 DSH：**0.2.0-rc2**（本套流程按此版本的工具面编写）。
- `dsh` **不进** `.tool-versions`，理由：`doctor.ps1` 逐行比对 `.tool-versions`，会把"工具不在 PATH"判红，而没装 DSH 的机器也必须能跑完这套流程。
- 升级路径：插件页卸载旧版再装新版（组合包不自动更新）；换 DSH 版本先跑 `powershell -NoProfile -File doctor.ps1`，把新版本号写回本节，并核对本表工具名是否还存在。

## 2. 插件用途表（8-3 卡装一个填一行；没装的写"未装"）

| 插件 | 用在哪张卡 | 何时装 | 何时卸 |
| :-- | :-- | :-- | :-- |
| Agent Teams（`dsh-experimental-agent-team-profile`：`spawn_teammate` / `send_message` / `team_task_create` / `wait_agent`） | 8-1 智能体团队编排（多文件并行改造） | 一次改动 ≥3 个互不相干文件、写作用域能切干净 | 单人顺序改更省事时 |
| `subagent` / `subagent_fork`（**内置工具，非独立插件，无需安装**） | 8-1（一次性独立任务 / 需继承上下文） | 无需安装（随 DSH 基础运行时） | 不适用（要禁就写进 AGENTS.md §2 范围四禁） |
| `workflow`（JS 脚本 fan-out，**同上为内置工具**） | 8-1（几十文件同构审计或迁移） | 无需安装（随 DSH 基础运行时） | 任务各异、无法脚本化时 |
| context（压缩） | 8-2 长任务上下文预算 | 长任务上下文吃紧 | 任务短、上下文宽裕时 |
| mnemon（热记忆 + 项目文档） | 8-2（用户偏好与稳定事实） | 需要跨会话记住偏好/稳定事实 | 只做一次性任务时 |
| schedule（定时提醒） | 5-4 / 5-5 的巡检节奏（观测窗、备份演练到期） | 定了到期日与巡检节奏 | 巡检改人工时 |
| mcp-connector | 8-3（外部数据源接入） | 需要连外部系统且凭据可留本机 | 数据源退役或改手工导入时 |
| skills-manager / `create_skill` | 分发流程（把 playbook 装成 skill） | 首次安装或升级本流程时 | 不再用本流程时 |
| cost-meter | 8-1（并发上限） | 并发 agent 数要控成本 | 单人任务、成本可忽略时 |
| code-review / auto-review | 4-2 代码审查（人审替代车道） | 每批改动要机器先过一遍 | 改动小到人眼一遍即可 |
| better-sidebar / `present` | 3-4 验收、5-1 回执（证据展示） | 要看截图/报告证据 | 纯命令行交付时 |
| roadbook-autoload | 本流程自动加载（见 §3） | 想"说到开发就自动上流程" | 嫌误命中（见 §3 关闭方式） |
| gitbash-shell | 契约 §2②（命令正斜杠 + PS 5.1 兼容） | Windows 上用 Git Bash 跑命令 | 换纯 PowerShell 外壳时 |

## 3. roadbook-autoload：触发词与关闭方式

- 机制：挂 `agent/pre-step`，三层门控（git 项目 + 开发意图关键词 + 去重/让路内置手势）；配置在 `cordis.patch.yml`。
- 关闭：`mode: off`；想改成"只要在 git 项目里就注入"用 `mode: always`。默认不注入子代理（`includeSubagents`），误命中成本约 1.2K tokens/会话。
- **未加载时跳过，不阻塞任务**：命中不了触发词就照常干活，不许为了等插件停下；离线自测 `node plugin/roadbook-autoload/test/trigger.test.mjs`。

## 4. skill 安装路径

- 安装：`git clone https://github.com/Aparencia/RoadBook.git "$env:USERPROFILE/.dsh/skills/roadbook"`；更新：`git -C "$env:USERPROFILE/.dsh/skills/roadbook" pull --ff-only`。

## 5. MCP 纪律

- 凭据只留本机（环境变量 / 本机配置），不进仓库、不进日志、不进提交信息；优先只读连接，写操作单独授权并在回执里写明。
- 新增连接先记本表：连什么、只读还是可写、凭据放哪；退役即断开并在 8-3 卡回执说明。

## 6. 权限与沙箱

- 默认最小权限：文件写作用域按任务 SCOPE 限定；删除、发布、改真实数据仍属不可委托（见 `AGENTS.md` §4）。
- 沙箱拒绝时先判断是"策略拒绝"还是"命令写法问题"；策略拒绝不绕行，改任务范围或请人授权。

## 更新义务

- 装/卸/升级任一插件或改版本行：同批回写本节与 `AGENTS.md` §10 的 DSH 版本；提交前跑 `powershell -NoProfile -File check.ps1` 取退出码 0。
