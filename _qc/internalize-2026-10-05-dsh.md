# 内化记录 · 2026-10-05（DSH 锁定批次）

> 来源 → 落点 → 明确不拿。本文件只记映射关系，**不复制外部内容**。
> 用户裁决：① 所有硬规则真重写；② 优先保证 DSH；③ Team 与官方插件开关同步；④ 强引用取「动作闸」。

## 批次 1 · DSH 官方能力面（本机随包文档与包清单，`0.2.0-rc.2`）

| 来源（包 / 文档） | 落点 |
| :-- | :-- |
| `@deepseek-ai/dsh-agent-instructions`：AGENTS.md 链（用户全局 → 项目根 → cwd，**持久基线**、`maxBytes` 预算、内容级去重、深目录自动发现） | `template/AGENTS.md` 顶部「硬规则唯一正文 + 规则版本口径」；`design/dsh-lockdown-plan.md` §2 三层架构 |
| `@deepseek-ai/dsh-experimental-agent-team` / `-tool-agent-team`：同进程服务 `ctx.agentTeams`；工具面 Lead-only | `plugin/roadbook-team/index.js`（提供 `roadbookTeam`；探针只做**解释**，不做**判断**） |
| Loader YAML 方言：`disabled` 接受 `!!js` 表达式并**在每次挂载决策求值**；**求值抛错 = fail-open**（不把条目当作已禁用） | `cordis.patch.yml` 的 `roadbook-team` 行（`disabled: !!js "!ctx.get('agentTeams')"`）+ `test/umbrella-contract.test.mjs` 的门表达式断言（必须 `ctx.get(` 形式，禁点号取属性） |
| `pluginInventory` 是 **Remote-only**、刻意不做同进程 Context 合并、只读、无变更订阅 | `design/dsh-lockdown-plan.md` §5「明确不做」；`plugin/roadbook-team/index.js` 文件头注释 |
| `tools/pre-execute` waterfall（= Claude Code `PreToolUse` 的同进程扩展点；折叠 `deny > ask > allow`；`allow` 不预审批、`defer` 不支持、`additionalContext` 被忽略） | 规则索引 A / C 类的机械落点（`rules/rules.json` 的 `judge.kind = gate`）；落地阶段 5 |
| `@deepseek-ai/dsh-hook-protocol` 与 `dsh-hooks-*` 的事件语义 | `design/dsh-lockdown-plan.md` 阶段 5（动作闸只依赖 `deny` / `ask`） |
| DSH 自身用 `disabled: !!js "!ctx.get('profileContext')"` 做平台/配置门控 | `template/doctor.ps1` 的三态探测（有宿主 / 疑似裸 CLI / 都没有）与 `-RequireDsh` |

## 明确不拿（附理由）

1. **不用 `pluginInventory` 读行状态**：该服务 Remote-only，同进程插件拿不到；「跟随官方行」改为「探同进程服务 + 装配层门控」。
2. **不做 RoadBook 自建的 Team「允许 / 不允许」开关**：与官方行构成两处开关，是第二真相。
3. **不把开关「变灰」**：那是 DSH 客户端（`dsh-client-ui-settings-plugins`）的渲染逻辑，不在本仓范围；本仓做到「设了也不生效 + 清单里可审计」。
4. **不用 `mode: always` 做「强引用」**：全量注入约 13 KB/轮，对闲聊也付费；强引用改走动作闸。
5. **不把判据散文塞进 `rules/rules.json`**：索引只装标识与机械钩子，判据正文在 `template/AGENTS.md` 与卡内（防第三处真相）。
6. **不在插件里「允许 / 改写」工具调用**：`PreToolUse` 只支持 `deny` / `ask`。
