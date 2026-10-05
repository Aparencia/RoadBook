# roadbook-autoload · Roadbook 自动加载插件

一个 Host 侧组合包（bundle）：**在 git 项目里一开口谈开发任务，就把 roadbook 技能正文注入当前回合**，不需要用户手打 `/roadbook`，也不依赖模型自己想起来。

- 注入形状与 DSH 内置「用户显式调用技能」完全一致：`source.kind = "skill-invocation"`、正文用官方 `renderSkillContent()` 渲染。
- 只注入一次、只注入给真用户会话（子代理默认不注入）、用户手打 `/roadbook` 时自动让路，不重复加载。
- **压缩感知**：注入消息被上下文压缩 shadow 出可见面后，下一次 `agent/pre-step` 会重新注入——判据是 `session.surface`（模型还能不能看到），不是"历史上注入过没有"；否则长会话被压缩一次，后半程就再也拿不到流程卡。
- **常驻微提示**：另有一段极短的 `[roadbook]` 提示以 system prompt section 形式**每轮常驻**，补掉"关键词没命中 = 整轮不受约束"的洞；它不占对话历史、不受压缩影响，读不到会话 cwd 时就不显示（见下「常驻提示与全量注入的分工」）。
- 一切可判定的门控都是确定性的：不命中就不注入；注入后仍由模型按流程卡行事，插件**不替用户做裁决**。

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

组合包**不会自动更新**：`git pull` 更新本仓库后，在插件页卸载再装一次即可（配置写在 `cordis.patch.yml`，重装后按需重填）。卸载即在插件页移除本组合包。

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
   注入成功会出现 `{"event":"inject","skill":"roadbook","hit":"…","reason":"first"}`；压缩后重注入的那次是 `"reason":"reinject-shadowed"`（`surface` 字段写明可见面判据读到的是 `present` / `absent` / `unavailable`）；只有 `{"event":"skip",…}` 说明被门控拦住，`reason` 直接写明是哪一层（`no-hit` / `not-git` / `once-per-session` / `already-injected` / `subagent` / `mode-off` …）。用户消息只留 `textDigest`（指纹）与 `textLength`（长度），**没有原文**；常驻微提示的注册结果在 `{"event":"banner","state":"registered" | "deferred" | "unavailable" | "error"}` 这一行；文件超过 `reportMaxBytes` 后旧内容轮转到 `<reportPath>.1`。
3. **试一轮**：在 git 项目里说「帮我重构一下这个模块」，当回合应出现技能正文 + 一行 `[roadbook-autoload]` 说明，观测文件同时多一行 `inject`。
4. **对不上时**：若启动日志报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-llm'`，就是 peer 范围与宿主版本脱节 → 按上表重新取证并改 `package.json` 后重装；若只是不注入，先在母版跑下节三个离线测试，再按「验证」五条核对门控。

## 自进化（只观测、只提示，不改卡）

| 环 | 做什么 | 默认 |
| --- | --- | --- |
| A 命中观测 | **默认写** `<os.tmpdir()>/roadbook-autoload.jsonl`（时间/会话/cwd/技能/命中词/SKILL.md 指纹 + 每个跳过理由 + 用户文本的**指纹与长度**，不存原文；超 `reportMaxBytes` 轮转到 `.1`），供 6-6 卡体检抽样 | 开（`report: false` 关） |
| B 版本对账 | `skillDigest` 与 SKILL.md 当前指纹比对，不一致就在注入说明里提示"技能已更新"（缓存按文件 `mtimeMs + size` 失效，中途更新也能看见） | 开（基线为空则不提示） |
| C 空转观测 | 「注入了但此后一路没读 `playbook*/**.md`」记为疑似空转（`{"event":"idle"}`），读到卡记 `{"event":"card-read"}`；**判据不需要新钩子** —— `agent/pre-step` 本来就挂着，缺的只是一个判据。会话事件必须用 `session.snapshotEvents()` 读：真实 `Session` **没有 `events` 属性**（内部日志是私有字段 `log`），读错形状会让这一环恒判 `unknown`、白开一个能力；注入正文里自带的 `playbook_EN/` 不算痕迹（只扫最后一次注入**之后**的事件） | 开（跟随 `report` 开关） |

边界：本插件**只做注入与观测**，不自动修改流程卡、不自动改配置、不替用户裁决门禁；升级流程卡仍然走母版的 6-6 卡（流程体检）与用户确认。

## 开发与测试

```powershell
node plugin/roadbook-autoload/test/trigger.test.mjs
node plugin/roadbook-autoload/test/index.test.mjs
node plugin/roadbook-autoload/test/banner.test.mjs
```

`trigger.test.mjs`：纯逻辑在 `trigger.js`（不 import 任何 dsh 包），可脱离 Harness 离线跑。`index.test.mjs`：用假 ctx / 假 skill 驱动 `agent/pre-step`，覆盖「命中关键词注入」「未命中跳过」「skills 未配置」「渲染失败不抛异常」「观测默认落盘 / `report: false` 不落盘」「观测只记指纹与长度（不落原文）」「超上限轮转到 `.1`」「常驻集合的 512 条 FIFO 淘汰」「SKILL.md 中途更新后指纹重新取证」「oncePerSession / 子代理 / mode: off / 宿主 reject 让路」「git 门控」「压缩后重注入（可见面 present / absent / unavailable 三态）」等分支。`banner.test.mjs`：常驻微提示的 section 接线（注册形状 name / `order: 700` / `interpolate: false`、注册回执三态、服务缺失与注册抛错都不上抛、文案逐字固定、读不到 cwd 与 `requireGitRoot` / `banner: false` / `mode: off` 一律返回空串）。宿主包由 `test/dsh-stubs/` 的 loader 钩子顶替（真实运行时由宿主注入）。`index.js` 只做 Host 侧接线。DSH 升级后若 `agent/pre-step` 决策形状、`session.surface` / `session.eventAt` / `session.snapshotEvents`、`ctx.skills` / `renderSkillContent`、`ctx.inject(['systemPrompt'])` 的作用域注入与 `section()` 契约或 `SECTION_ORDERS` 的取值有变，先重跑本测试，再对照 DSH 自带的组合包开发指南（`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`）核对契约。
