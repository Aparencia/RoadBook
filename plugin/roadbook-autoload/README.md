# roadbook-autoload · Roadbook 自动加载插件

一个 Host 侧组合包（bundle）：**在 git 项目里一开口谈开发任务，就把 roadbook 技能正文注入当前回合**，不需要用户手打 `/roadbook`，也不依赖模型自己想起来。

- 注入形状与 DSH 内置「用户显式调用技能」完全一致：`source.kind = "skill-invocation"`、正文用官方 `renderSkillContent()` 渲染。
- 只注入一次、只注入给真用户会话（子代理默认不注入）、用户手打 `/roadbook` 时自动让路，不重复加载。
- **压缩感知**：注入消息被上下文压缩 shadow 出可见面后，下一次 `agent/pre-step` 会重新注入——判据是 `session.surface`（模型还能不能看到），不是"历史上注入过没有"；否则长会话被压缩一次，后半程就再也拿不到流程卡。
- **常驻微提示**：另有一段极短的 `[roadbook]` 提示以 system prompt section 形式**每轮常驻**，补掉"关键词没命中 = 整轮不受约束"的洞；它不占对话历史、不受压缩影响，读不到会话 cwd 时就不显示（见下「常驻提示与全量注入的分工」）。
- **动作闸**：命中 A 类红线命令、或「开发对话里未按卡开工就动写侧工具」时，在 `tools/pre-execute` 上**拦下**这次工具调用（不是提醒）；`gate` 配置可降为 `warn` / `off`（见下「动作闸」）。
- 一切可判定的门控都是确定性的：不命中就不注入；注入后仍由模型按流程卡行事，插件**不替用户做裁决** —— 它只拦下**规则里写死的**那几类动作（A 类红线 / C7 未按卡开工 / Team 策略 off），拦下之后怎么走由人和模型决定。

## 触发规则（三层门控）

| 层 | 判据 | 默认 |
| --- | --- | --- |
| ① 项目 | 会话 cwd 向上能找到 `.git`（家目录自身不算项目根，也不越过家目录向上找） | 开（`requireGitRoot`） |
| ② 意图 | 用户消息命中开发意图关键词，且未命中抑制词 | 开（`mode: keyword`） |
| ③ 去重 | 本回合无同名注入、本会话可见面上没有同名注入（被压缩 shadow 掉则重注入）、用户没手打 `/roadbook` | 开（`oncePerSession`） |

关键词与抑制词都可在配置里整体替换；`mode: always` 表示只要是 git 项目里的用户消息就注入，`mode: off` 表示完全关闭。

细则：① 家目录自身是 git 仓库（dotfiles）时**不算**项目根，而且**不越过家目录**继续向上找——否则 `%TEMP%`、家目录里一个无关的 `.git` 就会让"在项目里"判定整体失效（本机 `%TEMP%\.git` 确实存在）；② 手打 `/roadbook` 的手势允许行首与句中空白（半角空格、全角空格、Tab 都算）；③ 命中、跳过、报错都会写一行观测（见下「观测」与「升级后自检」）。

## 配置（写进本包 `cordis.patch.yml` 的 `config`）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `skills` | `["roadbook"]` | 要加载的技能名，按序取第一个能解析的 |
| `mode` | `keyword` | `keyword` / `always` / `off` |
| `keywords` | 内置开发意图词表 | 命中即注入 |
| `suppressKeywords` | 内置抑制词表 | 命中即不注入（优先于关键词） |
| `includeSubagents` | `false` | 子代理会话是否也注入 |
| `requireGitRoot` | `true` | 只在 git 项目内注入 |
| `oncePerSession` | `true` | 一次会话只注入一次；**注入消息被压缩 shadow 掉后仍会重注入**（判据是可见面，读不到可见面时才退回"一次会话一次"） |
| `note` | `true` | 正文后附一行说明（为什么加载、怎么关） |
| `banner` | `true` | 每轮常驻的极短微提示（system prompt section，`order: 700`）；`false` 即不贡献内容 |
| `report` | `true` | 自进化 A 环：注入 / 跳过 / 报错各记一行 JSONL，`false` 完全关掉 |
| `reportPath` | `""` | 观测文件路径，空 = `<os.tmpdir()>/roadbook-autoload.jsonl`（Windows 即 `%TEMP%\roadbook-autoload.jsonl`） |
| `reportMaxBytes` | `2097152` | 观测文件字节上限，超了就轮转到 `<reportPath>.1`（覆盖旧的 `.1`）再继续写 |
| `skillDigest` | `""` | 自进化 B 环：SKILL.md 指纹基线，变了对不上就在说明里提示 |
| `gate` | `deny` | 动作闸（`tools/pre-execute`）：`deny` 拦 / `warn` 只回执不拦 / `off` 连监听器都不注册 |
| `stateCheck` | `true` | STATE.md 必填字段校验（B10）；`false` 关掉。**只在缺字段或读不动时**落观测 |

**观测文件只存用户文本的指纹（sha256 前 8 位）与长度，不存原文**：它落在共享临时目录、跨会话、永不清理，落原话等于把用户消息写在公共位置。命中词（`hit`）是插件自己词表里的词，不是用户原文，照旧保留。

## 常驻提示与全量注入的分工

两段东西、两条路径，别混：

| | 常驻微提示（`banner`） | 全量注入（技能正文） |
| --- | --- | --- |
| 何时出现 | **每一轮**都贡献内容（读得到会话 cwd；`requireGitRoot` 时还要求会话在 git 项目内） | 只在三层门控全过的那一轮 |
| 走哪条路 | system prompt section（作用域注入 `ctx.inject(['systemPrompt'], …)` 拿到服务，`order: 700`、`interpolate: false`） | `agent/pre-step` 里追加一条 `skill-invocation` user 消息 |
| 体积 | 一行（实测 195 字，见 `banner.test.mjs` 的逐字断言） | 13 KB 上下 |
| 与压缩的关系 | 每个组装点重新渲染，压缩 shadow 不到它 | 被 shadow 出可见面后由下一次 pre-step 重新注入 |
| 怎么关 | 插件行 `banner: false` | `mode: off`（此时 `banner` 也一并返回空串） |

为什么 `order: 700`：DSH 的 `SECTION_ORDERS` 里 `PLAN_POLICY = 500`、`TEAM_POLICY = 600`、`PTC_ONLY = 800`，700 正好落在策略段之间——流程提示排在三条策略之后、工具段（1000 起）之前。

`systemPrompt` 是**可选服务**，刻意**不写进 `export const inject`**：那里少一个服务，cordis 会把整行插件判成面板上的「未运行」，而读不到服务其实只该让这一段不出现。取服务走**作用域注入** `ctx.inject(['systemPrompt'], scope => …)`（服务一可用就回调一次，宿主没这个服务就一次都不回调；`ctx` 上没有 `inject` 的老宿主退回一次性 `ctx.get`）：一次性 `ctx.get` 读到 `undefined` 时，「宿主没有这个服务」与「服务还没装配好」长得一模一样——前者该永久让路，后者只该等一等，读一次就写死 `unavailable` 会让微提示在服务晚起的宿主上**永远消失**。注册结果只落一行观测：`{"event":"banner","state":"registered"}`（成功）、`"deferred"`（已交给作用域注入、等回调）、`"unavailable"`（服务不在或形状不合格）、`"error"`（注册抛错）——只有真注册上才写 `registered`。`text` 是每个组装点都会调用的 provider，返回**空串表示「本条不贡献任何内容」**；以下情况返回空串：`banner: false`、`mode: off`、读不到会话 cwd、`requireGitRoot` 且不在 git 项目内。

## 动作闸（`tools/pre-execute`，0.5.0 起）

强引用不能只靠提醒：命中判据时**拦下**工具调用才算机械后果。本插件的判据挂在 DSH 的 `tools/pre-execute` waterfall 上（= Claude Code `PreToolUse` 的同进程扩展点），判据本身在 [`gate.js`](gate.js)（纯逻辑、离线可测），接线在 `index.js`。

三条规则，按优先级：

| # | 规则 | 结论 |
| --- | --- | --- |
| ① | **Team 类工具**（`spawn_teammate` / `send_message` / `interrupt_agent` / `wait_agent` / `team_task_*`）且 `roadbook-team` 行的 `policy: off` | `deny`（「装了不用」的机械落点） |
| ② | **A 类红线**命令：`gh release` / `psql`·`mysql`·`sqlcmd`·`mysqldump` / `migrate`·`prisma migrate`·`alembic` / `deploy` / `publish` / `rsync`→生产 / `terraform apply`·`kubectl apply`·`docker push`（**打 tag 自 `2026-10-05.2` 起不在红线里**，由发布卡执行） | `deny`（与走不走流程**无关**：不可委托动作不该因为「这轮在闲聊」就放过去） |
| ③ | **C7 未按卡开工**：写侧工具（`write` / `edit` / `apply_patch` / `bash` / `pwsh`）+ 开发意图 + 本会话**没有卡回执** | `deny` +「先贴卡号与开工回执，或说明本轮不走流程」 |

**只在开发对话下开闸**：沿用注入那两道门（git 项目 + 命中开发意图关键词且未命中抑制词）；闲聊 / 问答 / 纯翻译 / 用户说了「不用流程」一律放行。**子代理会话不拦**（`includeSubagents` 默认 `false` ⇒ 那里根本没有注入，判据若照跑会把队友的每次写入都拦下）。**判不了就放行**：读不到会话日志、注入之后还没有事件、事件多到超出 `cardReadState` 的扫描窗口 —— 这三种都是 `unknown`，沿用本仓「不猜」口径放行，不拿猜出来的结论挡人。

「卡回执」复用既有的 `cardReadState()` needle 机制（只看**最后一次注入之后**有没有 `playbook/` 痕迹），注入正文自己写着的 `playbook_EN/` 不算数。

- 只用 `deny` / 放行：`allow` 不预审批、`defer` 不支持、`updatedInput` 不生效，所以本闸**不改写参数**。
- 观测：拦下时写一行 `{"event":"gate","decision":"deny","rule":"…","tool":"…","note":"…","mode":"…"}`；**同一会话 + 工具 + 规则只记一行**（模型反复撞同一条规则不刷屏），且**不记命令原文 / 用户原话**（命令行里可能有连接串，观测文件在共享临时目录、跨会话、永不清理）。
- `gate: warn` 的产物就是这行回执（一个都不拦，但每一次都留证）；`gate: off` 连监听器都不注册。
- 已知边界：引号内的文本按「参数/文案」处理（`git commit -m "migrate X"` 不该拦），只有数据库客户端名那一组额外回扫原文（`bash -c "psql …"` 仍拦得住）。判据是**模式不是解析器**：它提高红线动作的成本，不替代 `AGENTS.md` 里的人工自查。
- **仅单测验证**：本机没有可跑的真实会话，`tools/pre-execute` 是否真被触发只有离线测试覆盖（判定形状已按 DSH 源码核对：`(exec, next) => PreToolDecision`，`exec.name` / `exec.arguments` / `exec.agent.session`，决策联合类型 `allow | deny{reason} | cancel | ask{reason?, displayReason?}`）。

## Team：跟随官方行，不自建开关（0.5.0 起）

**RoadBook 没有「允许 / 不允许 Team」这个开关。** 权威开关单点，就是官方那一行：

```
官方 Agent Teams 未挂载 → ctx.get('agentTeams') 为空
    → cordis.patch.yml 里 roadbook-team 行的 disabled: !!js "!ctx.get('agentTeams')" 为真
    → 这一行不加载 → 本插件注入不到 roadbookTeam 服务 → 本轮单线程走
```

| 层 | 谁 | 做什么 |
| --- | --- | --- |
| 装配层 | `cordis.patch.yml` 的 `roadbook-team` 行 | **门**：官方没挂载时这一行根本不加载（面板里设了也不生效） |
| 策略行 | `plugin/roadbook-team/index.js` | 提供 `roadbookTeam` 服务面 `{policy, available, row}`；`policy: follow` = 跟随官方行，`off` = 装了不用 |
| 本插件 | `team.js` + `index.js` | **只解释**：消费注入进来的服务，把结论写进观测（`{"event":"team","state":"…"}`）与日志，并据此决定要不要拦 Team 类工具 |

取服务走**作用域注入** `ctx.inject(['roadbookTeam'], scope => …)`，**不写进 `export const inject`**：那里少一个服务，cordis 会把整行插件判成面板上的「未运行」（与 `systemPrompt` 那条同一个理由）。服务一直不来 ⇒ 只留一行 `{"event":"team","state":"deferred"}`（措辞与常驻提示的 `deferred` 同义：等回调，一直不来就是未挂载）。

三态（`team.js` 的 `resolveTeamPolicy`，逐态可测）：

| 输入 | state | active | blocked | 含义 |
| --- | --- | --- | --- | --- |
| 服务未注入 | `unmounted` | false | false | Team 未挂载，本轮单线程走 |
| `{policy:'follow', available:true}` | `follow` | **true** | false | 官方行已挂载，Team 类工具可用 |
| `{policy:'off'}` | `off` | false | **true** | 装了不用：动作闸拦 Team 类工具 |
| `{available:false}` | `unavailable` | false | false | 行在但宿主没有 `agentTeams`（疑似绕过门手工挂载） |
| 对象缺 `policy` / 取值非法 / 根本不是对象 | `degraded` | false | false | **响亮降级**，不静默当可用 |

为什么 `degraded` 不拦：`blocked` 只该在**用户明确选了 off** 时为真。读不到结论时 fail-open —— 拿猜出来的结论去挡用户的正常协作，比少拦一次更坏。

### fail-open 陷阱（写 `disabled` 表达式前必读）

`disabled: !!js` 的求值**抛异常 = 当作启用**（宿主只记一条 Warn 然后继续，不当作已禁用）—— 正好与「没挂载就关掉这一行」的意图**相反**。所以表达式必须**不可能抛**：只许 `ctx.get('x')` 形式，**禁止** `ctx.agentTeams.yyy` 这种会炸的写法。本行的门表达式由 `cordis.patch.yml` 的断言与 `test/` 里的门表达式检查盯住。

### 为什么不用 `pluginInventory`

它是 **Remote-only、刻意不做同进程 Context 合并**、只读、无变更订阅：插件拿不到行状态，也就无法据此判断「官方 Team 在不在」。它能做的是把每行的**有效启用状态**与行自带的 `!!js` 表达式报给界面（宿主求不了值时标 `conditional`）—— 那是**给人看的可审计性**，不是插件可用的接口。

## STATE.md 字段校验（B10，0.5.0 起）

`stateCheck: true`（默认）时，开发会话在 `agent/pre-step` 顺路核一次项目根的 `STATE.md`：必填键**逐字取自** [`template/STATE.md`](../../template/STATE.md)（当前阶段 / 当前任务 / 档位 / 起点锚点 / 工作树状态 / 体检计数 / 文件数基线 / 当前文件数 / 下一步 / 未决问题 / 红线摘要），口径在 [`state.js`](state.js)。

- **只观测与告警，绝不改行为、绝不注入**：缺键时落一行 `{"event":"skip","reason":"state-missing","file":"…","missing":[…],"missingCount":N}` + 一条宿主日志（同一个会话只记一次）。
- **不刷观测**：没有 `STATE.md` 的 git 项目是常态（本插件不只服务 RoadBook 项目），「文件不在」与「字段齐备」都不落行 —— 无消息 = 无异常。
- 只判「在不在」这一层：值写得对不对（档位是不是 S/M/L、锚点是不是 40 位哈希）属于卡的判据，不是插件的活。判据越浅越不会误报，而一个爱误报的门会被关掉，等于没有门。

## 安装（GUI）

**推荐路径：装主插件（仓库根）**——Git 地址填 `https://github.com/Aparencia/RoadBook.git`（或本地绝对路径指向仓库根）。根 `package.json` 声明了组合包，装完在插件面板里能看到四个**可独立开关**的子行，本行 `roadbook-autoload` 是其中之一（模块名 `roadbook/autoload`）。

**只想装自动加载**也行：本目录自带组合包 patch，可以单独安装——Git 地址带 `#path:` 指到本目录，或选「本地绝对路径」填本目录：

```text
git+https://github.com/Aparencia/RoadBook.git#path:plugin/roadbook-autoload
```

> 2026-10-05 修正：本文原先写「整仓**装不了**——仓库根没有 `package.json`」，那是 **0.2.0 主插件化之前**的实情。根现在是组合包 `roadbook`，整仓就是推荐装法（见根 `README.md` 的插件一节）；本目录仍可单独安装，但两条路只该走一条，别装两份。

1. 侧栏打开「**插件**」页 → 「**添加插件**」。
2. 选「本地绝对路径」，填本目录（仓库里的 `plugin/roadbook-autoload`，或已 clone 的技能目录下 `roadbook/plugin/roadbook-autoload`）→ 先 `inspect` 再安装。
3. 装完点「**立即启用**」（本 profile 已开 HMR，无需重启）。
4. 新开一个会话，说一句「帮我重构一下这个模块」，当回合就应出现 roadbook 的技能正文与一行 `[roadbook-autoload]` 说明。

## 验证（五条，缺一不可）

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | git 项目里说「帮我重构一下登录模块」 | 注入 roadbook（有 `[roadbook-autoload]` 说明行） |
| 2 | 说「今天天气怎么样」 | 不注入 |
| 3 | 手打 `/roadbook 我有个想法：…` | 只注入一次（内置手势负责，插件让路） |
| 4 | 把配置改成 `mode: off` 并重新启用 | 任何消息都不再注入 |
| 5 | 新会话里说一句不命中关键词的话 | **不注入**，但系统提示里出现一行 `[roadbook] …`（常驻微提示走 section，不进对话历史） |

## 升级与卸载

**主插件自带自动更新（2026-10-05 起，0.4.0）**：主行 `roadbook` 每次开机向本包 `package.json` 的 `repository` 指向的上游清单查一次版本（默认**只提示**，不自动替换），判定与证据落在 `<os.tmpdir()>/roadbook-update.jsonl`；在侧栏「图册」标签页页脚点「更新」，由插件自己跑安装命令（`dsh plugin add` → 退到 `$DSH_HOME/dsh-runtimes/*` 自带的 node + pnpm）替换磁盘文件，**重启 DSH 生效**。本子行是随包的一部分，跟着主插件一起更新，不需要单独动。

- 关掉：主行配置写 `update: off`；改成发现新版本自动替换写 `update: auto`（默认 `notify` 只提示）。其余键（`updateIntervalHours` / `updateUrl` / `updateCommand` / `updateReportPath` …）见 `lib/update.js` 顶部注释。
- 上游判定为什么不由别人代劳：本机实测 dshmarket 对本条 `github:` 来源**恒报「无更新」**（它的 `current` commit 读不出来 ⇒ `updateAvailable:false`），而同一时刻装的确实是 0.2.3、远端 main 已是 0.3.0。转发这种结论就是把假绿当判据，所以版本判定由 `lib/update.js` 自己做：**读不到一律 `unknown`**，绝不显示成「已是最新」。
- 兜底路径没删：`git pull` 更新本仓库后，在插件页卸载再装一次仍然有效（配置写在 `cordis.patch.yml`，重装后按需重填）。卸载即在插件页移除本组合包。

### 自动更新的三条验证

1. 重启 DSH 后看宿主日志与观测文件：`Get-Content "$env:TEMP\roadbook-update.jsonl" -Tail 3` —— 应出现一行 `{"event":"check","state":"…"}`（`update-available` / `up-to-date` / `unknown`）。
2. 打开侧栏「图册」标签页：更新条显示当前版本与上游判定；`update-available` 时才出现［更新］按钮（找不到可用安装命令时按钮收起并写明原因）。
3. 点一次「更新」：观测文件出现 `apply-start` 与 `apply-finish`（含退出码与输出尾巴），界面显示「已更新 v… → v…」并提示重启；**别在 agent 跑任务时点**（运行中的 agent 会读到新旧混合的文件，宿主半会直接拒绝并说明理由）。

### 依赖：由宿主提供，运行时不下载

`index.js` 用到的三个宿主包写在 `package.json` 的 `peerDependencies` 里，**由 DSH 宿主提供，插件内不下载、不打包**；`peerDependenciesMeta` 全部标 `optional`。主插件（仓库根）的 `package.json` 里也声明了同样三个包 —— 宿主对 `link:` / 本地路径安装的插件，只给「自己 manifest 的 `peerDependencies` 声明过该名字」的包做拦截注入，不声明就解析不到。

**解析不到也不会让整行变「未运行」**（0.2.1 起）：这三个包走**守卫式动态 import**，宿主里解析不到就降级用 [`host-fallback.js`](host-fallback.js) 的本地等价实现（`createUserMessage` / `isUserInvocable` / `renderSkillContent`），并把原因写进宿主日志（`[roadbook-autoload] 宿主包解析失败…`）与观测文件的 `{"event":"loaded","fallbacks":[…]}` 行。**为什么以前会静默失效**：入口静态 import 失败 ⇒ cordis loader 的 `_init()` 只写一条 `logger.error` 就 return、不给 `entry.fiber` 赋值 ⇒ 面板上该行显示「**未运行**」（而不是「异常」），看起来像没装。

| 包 | peer 范围 | 本机取证 |
| --- | --- | --- |
| `@deepseek-ai/dsh-llm` | `0.2.0-rc.2` | 宿主 `resources/app.asar` 内 `dsh/node_modules/@deepseek-ai/dsh-llm/package.json` = `0.2.0-rc.2` |
| `@deepseek-ai/dsh-skill` | `0.2.0-rc.2` | 同上 = `0.2.0-rc.2` |
| `@deepseek-ai/schemastery` | `3.18.4` | `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/schemastery/package.json` = `3.18.4` |

范围取「本机实际安装的版本」，不写猜的版本号。

### 升级 DSH 后的自检

1. **重装依赖**：本插件随**主插件**一起装（`~/.dsh/profiles/desktop/package.json` → `"roadbook": "github:Aparencia/RoadBook"`，包名是 `roadbook` 而不是 `roadbook-autoload` —— 本行是它下面的子行）。宿主升级后先在 `~/.dsh/profiles/desktop` 跑一次 `pnpm install`，再重启 DSH；插件本体的更新仍走"插件页卸载 + 重装"。
2. **看观测文件**（确认注入有没有真发生）：
   ```powershell
   Get-Content "$env:TEMP\roadbook-autoload.jsonl" -Tail 5
   ```
   注入成功会出现 `{"event":"inject","skill":"roadbook","hit":"…","reason":"first"}`；压缩后重注入的那次是 `"reason":"reinject-shadowed"`（`surface` 字段写明可见面判据读到的是 `present` / `absent` / `unavailable`）；只有 `{"event":"skip",…}` 说明被门控拦住，`reason` 直接写明是哪一层（`no-hit` / `not-git` / `once-per-session` / `already-injected` / `subagent` / `mode-off` …）。用户消息只留 `textDigest`（指纹）与 `textLength`（长度），**没有原文**；常驻微提示的注册结果在 `{"event":"banner","state":"registered" | "deferred" | "unavailable" | "error"}` 这一行；Team 探针的结论在 `{"event":"team","state":"follow" | "off" | "unmounted" | "unavailable" | "degraded" | "deferred" | "error"}` 这一行（`deferred` = 已交给作用域注入、等 `roadbookTeam` 服务，一直不来就是未挂载）；动作闸拦下时是 `{"event":"gate","rule":"…","tool":"…"}`（只记拦下的，同一会话+工具+规则一行），STATE.md 缺字段是 `{"event":"skip","reason":"state-missing","missing":[…]}`；文件超过 `reportMaxBytes` 后旧内容轮转到 `<reportPath>.1`。
3. **试一轮**：在 git 项目里说「帮我重构一下这个模块」，当回合应出现技能正文 + 一行 `[roadbook-autoload]` 说明，观测文件同时多一行 `inject`。
4. **对不上时**：若启动日志报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-llm'`，就是 peer 范围与宿主版本脱节 → 按上表重新取证并改 `package.json` 后重装；若只是不注入，先在母版跑下节三个离线测试，再按「验证」五条核对门控。

## 自进化（只观测、只提示，不改卡）

| 环 | 做什么 | 默认 |
| --- | --- | --- |
| A 命中观测 | **默认写** `<os.tmpdir()>/roadbook-autoload.jsonl`（时间/会话/cwd/技能/命中词/SKILL.md 指纹 + 每个跳过理由 + 用户文本的**指纹与长度**，不存原文；超 `reportMaxBytes` 轮转到 `.1`），供 6-6 卡体检抽样 | 开（`report: false` 关） |
| B 版本对账 | `skillDigest` 与 SKILL.md 当前指纹比对，不一致就在注入说明里提示"技能已更新"（缓存按文件 `mtimeMs + size` 失效，中途更新也能看见） | 开（基线为空则不提示） |
| C 空转观测 | 「注入了但此后一路没读 `playbook*/**.md`」记为疑似空转（`{"event":"idle"}`），读到卡记 `{"event":"card-read"}`；**判据不需要新钩子** —— `agent/pre-step` 本来就挂着，缺的只是一个判据。会话事件必须用 `session.snapshotEvents()` 读：真实 `Session` **没有 `events` 属性**（内部日志是私有字段 `log`），读错形状会让这一环恒判 `unknown`、白开一个能力；注入正文里自带的 `playbook_EN/` 不算痕迹（只扫最后一次注入**之后**的事件） | 开（跟随 `report` 开关） |

边界：本插件**只做三件事** —— 注入正文、落观测、在写死的判据上拦下工具调用（A 类红线 / C7 未按卡开工 / Team 策略 off）。它不自动修改流程卡、不自动改配置、不改写工具参数、不替用户裁决门禁；升级流程卡仍然走母版的 6-6 卡（流程体检）与用户确认。

## 开发与测试

```powershell
node --test "plugin/roadbook-autoload/test/*.test.mjs"
```

（单文件也可以直接跑，例如 `node plugin/roadbook-autoload/test/gate.test.mjs`；`_qc/check.ps1` 与 `npm test` 走的是上面那条 glob，新测试文件不需要点名。）

`trigger.test.mjs` / `gate.test.mjs` / `team.test.mjs` / `state.test.mjs`：四个纯逻辑层（`trigger.js` / `gate.js` / `team.js` / `state.js` 都不 import 任何 dsh 包），可脱离 Harness 离线跑 —— 门控与文案、动作闸判据（红线 / 未按卡开工 / Team off）、Team 三态（未注入 / 注入正常 / 注入对象缺字段）、STATE.md 必填字段（对着真模板跑，字段口径不许两处漂）。`index.test.mjs`：用假 ctx / 假 skill 驱动 `agent/pre-step` 与 `tools/pre-execute` 两条接线，覆盖「命中关键词注入」「未命中跳过」「skills 未配置」「渲染失败不抛异常」「观测默认落盘 / `report: false` 不落盘」「观测只记指纹与长度（不落原文）」「超上限轮转到 `.1`」「常驻集合的 512 条 FIFO 淘汰」「SKILL.md 中途更新后指纹重新取证」「oncePerSession / 子代理 / mode: off / 宿主 reject 让路」「git 门控」「压缩后重注入（可见面 present / absent / unavailable 三态）」等分支，以及三条新接线的**接线本身**：动作闸真的挂上 `tools/pre-execute`、拦下时返回 `deny`、下游已有的 deny/ask 原样返回不被覆盖、`gate: off` 连监听器都不注册、`warn` 只回执不拦、判据抛错兜底放行；Team 探针的 `deferred → follow/off/unmounted` 回执与 `off` 时拦 Team 类工具；STATE.md 缺字段落一行 `skip/state-missing`（齐备与「没有这个文件」都不落）。`banner.test.mjs`：常驻微提示的 section 接线（注册形状 name / `order: 700` / `interpolate: false`、注册回执三态、服务缺失与注册抛错都不上抛、文案逐字固定、读不到 cwd 与 `requireGitRoot` / `banner: false` / `mode: off` 一律返回空串）。宿主包由 `test/dsh-stubs/` 的 loader 钩子顶替（真实运行时由宿主注入）。`index.js` 只做 Host 侧接线。DSH 升级后若 `agent/pre-step` 决策形状、`session.surface` / `session.eventAt` / `session.snapshotEvents`、`ctx.skills` / `renderSkillContent`、`ctx.inject(['systemPrompt'])` / `ctx.inject(['roadbookTeam'])` 的作用域注入与 `section()` 契约、`SECTION_ORDERS` 的取值、`tools/pre-execute` 的 `(exec, next)` 形状与 `PreToolDecision` 联合类型（`exec.name` / `exec.arguments` / `exec.agent.session`）有变，先重跑本测试，再对照 DSH 自带的组合包开发指南（`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`）核对契约。
