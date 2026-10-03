# 卡 8-3 · DSH 工具面与插件（换机器/装插件/接 MCP 时读）
> 触发：换机器、装或卸插件、接 MCP、改 DSH 版本、写工具说明。 ｜ 产物：`docs/TOOLING.md`。 ｜ 下一张：回当前档位主线（S→4-1 / M→2-x 或 4-1 / L→3-1；事故线→6-1）。

---

## ① 开工确认

先回执四行，缺一行不许动手：

1. 版本读数：本机 DSH 版本 + `docs/TOOLING.md` 的版本行（照「动作 1」的命令取，两处必须一致）。
2. 本次动的是哪几个插件或哪个 MCP server，为什么现在动。
3. 产物落点：`docs/TOOLING.md`（版本行 / 插件用途表 / 触发词与关闭方式 / MCP 与权限口径），行数上限 60。
4. 澄清问题（≤5）：权限范围、凭据归属、要不要卸掉旧插件。

---

## ② 执行

### 动作 1 · 版本行与换版本流程

```powershell
if (Test-Path 'docs/TOOLING.md') { "行数 " + (Get-Content 'docs/TOOLING.md' -Encoding UTF8).Count } else { 'MISS docs/TOOLING.md' }
Get-Content 'docs/TOOLING.md' -Encoding UTF8 | Select-String -Pattern 'DSH' | Select-Object -First 1
Get-Content '.tool-versions' -Encoding UTF8 | Select-String -Pattern '^dsh\s'
```

判据：`docs/TOOLING.md` 存在且 ≤60 行；版本行写明「本机 DSH：**0.2.0-rc2**」（换版本后只改这一行）；第三条**无输出**（`.tool-versions` 只记项目自身依赖，不写 `dsh`——doctor.ps1 会把"工具不在 PATH"判红，而没装 DSH 的机器也要能跑完这套流程）。

换版本（升或降）顺序：先跑 `powershell -NoProfile -File doctor.ps1` 看点名 → 装目标版本 → 把新版本号写进 `docs/TOOLING.md` 版本行 → 复跑 `doctor.ps1` 与 `check.ps1`，**两者取 0 才算环境可用** → 归档回执写明"环境变更"。`.tool-versions` 只在项目自身依赖变化时才改，改它任何一行都算环境变更，不许顺手改。

❌ 版本号凭记忆写进文档。 ✅ 从命令输出抄。
❌ 把 `dsh 0.2.0-rc2` 写进 `.tool-versions`。 ✅ 版本行落在 `docs/TOOLING.md`，`.tool-versions` 里搜不到 `dsh`。

### 动作 2 · 插件用途表（每行都要能回答"什么时候装、什么时候卸"）

| 插件 | 用在哪张卡 | 什么时候装 | 什么时候卸 |
| :-- | :-- | :-- | :-- |
| Agent Teams（`dsh-experimental-agent-team-profile`） | 8-1 | 要并行改 ≥2 个互不依赖的文件、要任务板与回执 | 回到单文件活就卸（避免顺手建队） |
| subagent / subagent_fork / workflow（宿主内置，无需安装） | 8-1 | 一次性任务用 `subagent`、要继承上下文用 `subagent_fork`、批量扇出用 `workflow` | 不适用（没有插件可卸；形态选错就换形态） |
| auto-review | 4-2 | 想在提交前自动过一遍审查 | 审查节奏稳定后卸（拦截提交会拖慢小改动） |
| code-review | 4-2 | 要一份可留档的审查报告 | 同一轮审查做完即可关 |
| context（压缩与上下文账） | 8-2 | 任务跨多轮、要压缩摘要（默认装） | 只跑单轮小任务可关 |
| mnemon（热记忆 + 项目文档） | 8-2 | 要跨会话保留偏好与稳定事实、要项目文档检索 | 只在单会话干活可卸 |
| mcp-connector | 8-3 | 要接外部系统，按 server 逐个接 | 不用了立即卸（每个 server 都是一份新凭据面） |
| skills-manager（`create_skill`） | 8-3 安装与分发 | 要把流程装成用户级 skill | 只在本仓库跑母版可不用装 |
| cost-meter | 8-1 | 并发 ≥3 或长任务前，先看读数再定并发 | 单人小改动可不装 |
| schedule | 5-4 / 5-5 | 要定时提醒（演练到期、备份检查） | 一次性任务不装 |
| better-sidebar（`present`） | 3-4 / 5-1 | 要给人看界面、截图、交付物 | 纯后端项目可卸 |
| gitbash-shell | 命令口径 | Windows 上要跑 bash 风格脚本、命令统一正斜杠 | 只用 PowerShell 时可不装 |
| roadbook-autoload | 全流程（分发） | git 项目里想自动加载流程卡 | 不想被自动注入就把 config 的 `mode` 设 `off`（不用卸） |

**禁令（违反任一条 = 本轮输出作废）**：不许装没读说明的插件；不许把插件当流程（插件只提供工具，动作仍照卡走）；不许把凭据写进文档、回执或记忆。

### 动作 3 · roadbook-autoload（自动加载开关与误触发）

- 触发词（命中即注入）：实现 / 开发 / 重构 / 修复 / 优化 / 迁移 / 清理 / 归档 / 发布 / 验收 / 复盘 / 体检 / 开工 / 收工 / 按流程 / 走流程 / 流程卡 / 路书 / roadbook，以及 implement / refactor / migrate / fix bug / release / code review / clean up 一类英文词。
- 抑制词（命中即不注入，优先于触发词）：只讨论 / 先讨论 / 只回答 / 不要动代码 / 不改代码 / 不用流程 / 关闭流程 / 跳过流程 / 不要实现 一类。
- 三层门控：会话在 git 项目里 + 命中触发词 + 本会话没注入过（手打 `/roadbook` 时让路，子代理默认不注入）。
- 关闭方式：把该插件 config 的 `mode` 设为 `off`（三态 `keyword` / `always` / `off`），改完重新启用或刷新生效。
- 误触发处理：先在用户消息里带抑制词看是否让路；再查观测日志的 `reason`（`no-hit` / `not-git` / `once-per-session` / `subagent` / `mode-off`）定位是哪一层；都不想要就 `mode: off`。
- 插件本体自测（不联网、不改仓库）：`node plugin/roadbook-autoload/test/trigger.test.mjs`。

❌ 用「我以为它没生效」当结论。 ✅ 贴观测日志的 `reason`。
❌ 改完插件不跑自测就宣布可用。 ✅ 自测通过 + 一行真实输出。

### 动作 4 · skill 安装与更新路径

- 安装：把本仓库 clone 到 `~/.dsh/skills/roadbook`（目录型布局靠相对路径落回母版根）。
- 更新：母版改完必须推到远端，否则装成 skill 的机器停在旧版；更新后在目标机器拉一次。
- 分发口径：流程正文只此一份，不在别处复制；发现两份不一致，以母版为准并删掉副本。

```powershell
if (Test-Path "$HOME/.dsh/skills/roadbook") { 'OK 已装 skill' } else { 'MISS 未装 skill' }
```

❌ 母版改完不推就宣布"skill 已更新"。 ✅ 推送后在目标机器拉取并核对版本行。

### 动作 5 · MCP connector 纪律

连接、健康检查、启停与移除统一走 `mcp_connector_*` 这一族工具，不手改配置文件。

- 凭据只留本机：不进仓库、不进回执、不进记忆；文档里只写"在哪个连接器里配"。
- 优先只读工具：先按只读权限接，确需写入时单独说明写什么、影响谁。
- 接之前读厂商说明：确认数据范围、权限、速率与计费；接生产数据源先用只读账号。
- 用完即卸：临时接的连接不留着；连接状态异常先看健康检查再决定重配还是卸。

❌ 把 token 贴进回执让同事"自己配"。 ✅ 各机器各配，回执只写连接名与用途。
❌ 为了省事直接接生产库全权限。 ✅ 只读账号 + 说明要读什么。

### 动作 6 · plan / goal / schedule 的边界

- `plan`：只在动手前把方案摆给人看（只读推演）；方案定稿立刻退出，不用它改文件。
- `goal`：跨多轮的持续目标，必须带完成判据；一轮能完的事不建 goal；同一阻塞连续三轮才标 blocked。
- `schedule`：到点提醒（演练、备份、复盘），不代替流程卡——提醒到了仍照卡走。

❌ 用 `goal` 当"自动继续"跳过每轮回执。 ✅ 每轮给里程碑回执。
❌ 用 `schedule` 定时自动发布。 ✅ 发布属不可委托项，仍由人执行。

### 动作 7 · 权限与沙箱

- 默认 workspace-write：可写工作区；越界写被拒就停下向用户说明，不换路径绕。
- 只读模式（评审、勘察）：只读文件与只读命令，不提改动。
- 危险命令（删文件/删目录、改仓库历史、动真实数据、发布、打 tag）执行前先一句话说明"要做什么、影响什么、能不能恢复"，得到确认再跑；发布、打 tag、删数据始终由人执行。
- 调试信息只说结论与依据，不倒贴整段原始输出。

### 动作 8 · 反例（撞上任何一条 = 本卡返工）

1. 把插件当流程：装了 Agent Teams 就以为并行已经合规，任务板与回执都不做。
2. 凭据进仓库：把 MCP token 写进 `docs/TOOLING.md` 或提交信息。
3. 未读插件说明就装：不知道它会不会自动改文件、会不会联网就启用。
4. 只写"已装好"，不写关闭方式与触发词（下次误触发没人会关）。
5. 卸插件顺手删别人的配置（动到工作区外的文件）。

边界声明：本卡不选档位、不改主线顺序；只在换机器、装插件、接 MCP 或改版本时加走。

---

## ③ 证据回执

只认三种证据：真实命令输出 / 文件路径 / 提交哈希。逐条给：

1. 版本证据：`docs/TOOLING.md` 版本行 + `.tool-versions` 搜不到 `dsh` 的真实输出 + `doctor.ps1` 结果关键行。
2. `docs/TOOLING.md`：路径 + 行数 + 四节齐（版本行 / 插件表 / 触发词与关闭方式 / MCP 与权限口径）。
3. 插件动作：装了哪个、卸了哪个、配置文件路径。
4. 自测输出：`trigger.test.mjs` 通过行（改了插件才需要）。
5. 凭据自查：确认文档、回执、提交里没有真实凭据。

---

## ④ 状态回写

1. 先回写：`docs/TOOLING.md` 按本节四节更新（版本行写本机实测的 DSH 版本，`.tool-versions` 不写 `dsh`）；插件或版本变动同时更新根 `CHANGELOG.md`「未发布」节。
2. 本卡不改主线指针，除非它改动了主线产物；`STATE.md` 只在版本/环境变动时更新 `风险摘要` 或 `未决问题`。
3. 再提交：`git add -A`，`git commit -m "8-3 docs(tooling): DSH 版本与插件用途表"`。
4. 最后复跑 `powershell -NoProfile -File check.ps1` 取退出码 0。

---

等待你裁决。回复"继续"执行下一张卡，或说新指令。
