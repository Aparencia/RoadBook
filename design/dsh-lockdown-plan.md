# RoadBook DSH 化改造计划（硬规则重写 · 强锁 DSH · Team 跟随 · 动作闸）

> **状态：已定稿，暂不实施。** 本文件只写计划——不改任何判据、不动任何现有文件、不建任何新目录。
> 日期：2026-10-05 ｜ 依据：`design/plugin-skill-doc-mechanism.md`（三层机制评估）+ `design/endpoint-gap-report.md`（终点差距）+ 本轮五项用户裁决
> 口径：文中 DSH 事实来自随包清单与文档（`resources/app.asar`，版本 `0.2.0-rc.2`）。**实施前必须用 `cordis_inspect_query` 或对应包 README 复核**，本文不作为 DSH 行为的事实源。

---

## 0. 裁决记录（用户已定，不再讨论）

| # | 裁决 | 对本计划的约束 |
| :-- | :-- | :-- |
| 1 | **所有硬规则真重写** | `_qc/check.ps1` 的 needle 表**允许同批修改**；重写不是措辞调整，是按违反后果重新分类 |
| 2 | **优先保证 DSH** | 可改自家宪法「没有 DSH 的机器也要能跑完这套流程」这一条；守护脚本、README、设计文档同批 |
| 3 | **Team 与官方行同步** | 采用 `disabled: !!js "!ctx.get('agentTeams')"` 门控 **RoadBook 的 team 相关那一行**（**不是**整个 `roadbook` 行——RoadBook 必须在无 Team 环境单线程跑完流程） |
| 4 | **强引用取动作闸** | 落实为 `tools/pre-execute` waterfall 的 `deny`/`ask`，不是提醒 |
| 5 | **暂不实施** | 本次只落计划；开工须另行下令 |

---

## 1. 已查证的事实（决定方案形状）

| 事实 | 证据（随包文档原话/位置） | 对方案的影响 |
| :-- | :-- | :-- |
| Agent Teams = **实验子树**四包：`dsh-experimental-agent-team`（域）/`-tool-agent-team`（工具）/`-client-ui-agent-team`（界面）/`-agent-team-profile`（档案），均为 `0.2.0-rc.2` | 随包清单 + 工具包 README「Add this package on top of … when the model should run a team through tools」 | 开关 = **是否挂载**，不是运行时标志；版本变更要**响亮降级**，不许静默失效 |
| Team 工具内部走 **`ctx.agentTeams.*`** | 工具实现 `ctx.agentTeams.createTask(...)` | **同进程可探针**（生产侧服务名待核实） |
| `disabled` 接受布尔、null，或 **`!!js` 表达式，在每次挂载决策时对 Loader 上下文求值** | Loader 方言文档：`disabled` accepts a boolean, null, or a `!!js` expression evaluated against the Loader context at every mount decision | **这就是"未挂载时开关不可设置"的原生实现** |
| DSH 自己在用同类门控 | `disabled: !!js "!ctx.get('profileContext')"`（桌面专属行）、`disabled: !!js process.platform === 'win32'`（平台行） | 照抄它的写法，不发明新形式 |
| **`disabled: !!js` 求值抛异常 = fail-open**（警告并继续，**不当作已禁用**） | 方言文档异常表：`disabled: !!js` evaluation throws → Warn; continue … Report the evaluation error rather than treating the entry as disabled | 表达式**必须不可能抛**：只许 `ctx.get('x')` 形式，**禁止** `ctx.agentTeams.yyy` 这类会炸的写法 |
| `pluginInventory` 是 **Remote-only，刻意不声明同进程 Context 合并**，只读、无变更订阅；但会报告每行的**有效启用状态**与**行自带的 `!!js` disabled 表达式**，宿主求不了值时标 `conditional` | 该包 README | ①插件**不能**读行状态、**不能**改别人的行；②但门控是**可审计**的，不会静默显示"已启用" |
| DSH 有 **`tools/pre-execute` waterfall**（= Claude Code `PreToolUse` 的同进程扩展点），决策折叠 `deny > ask > allow` | hook-protocol 文档：「`PreToolUse` 是能拒绝传入动作的 waterfall（`agent/pre-step`、`tools/pre-execute`）」 | **动作闸是硬的**：返回 `deny` 即工具不执行 |
| 同一文档的限制：`allow` 不预审批、`defer` 不支持、`additionalContext` 被忽略 | 「PreToolUse 只支持部分功能」 | 动作闸**只用 `deny`/`ask`**，不依赖被忽略的能力 |
| **`dsh-agent-instructions` 默认开**：用户全局 `$DSH_HOME/AGENTS.md` → 项目根 → cwd，按宽泛→具体注入**持久基线**，有 `maxBytes`，内容级去重，深目录新文件自动发现，移除有通知 | 该包 README | **强引用第一条腿是 DSH 原生**：规则应住 AGENTS.md，而不是每会话靠人粘贴 |
| `pwsh` 工具当前对所有命令返回 `3221225794`（`STATUS_DLL_INIT_FAILED`） | 本会话实测（连 `Get-Location`、`node --version` 都无输出） | **阶段 0 是硬门禁**，未修复前任何阶段不开工 |

---

## 2. 新架构：三层职责定稿

```
AGENTS.md 链（DSH 原生 · 每会话常驻 · 版本化）   ← 规则唯一正文（A/C/D 类）
  + 插件（同进程 · 确定性）                      ← 动作闸 tools/pre-execute（A/C 类）+ Team 探针 + STATE 校验
  + 脚本与测试（零 token）                       ← B 类机械判据（check.ps1 / rules --audit / route --audit）
  + SKILL.md（触发时载入）                       ← 只做路由 + 门禁 + 指针
  + 卡片（按需）                                 ← 判据原文（本轮不动语义）
```

**核心改动：规则从"三处各写一遍"改为"AGENTS.md 一处 + 其余指向它"。** 理由不是省字，是换投递渠道——DSH 已把 AGENTS.md 变成每会话自动加载的持久基线，`0-1` 的"每会话整卡粘贴"与 `SKILL.md` 的"六条铁律"在这个前提下是**重复投递同一批规则**。

**禁止第三真相**：新增的 `rules/rules.json` 只装**标识与机械钩子**（`id` / `class` / `trigger` / `predicate` / `judge` / `renderedIn`），**不装判据散文**；判据散文住在 `template/AGENTS.md`（随项目版本化）。`rules.json` 的唯一用途是让测试能双向断言"数据 ↔ 正文"不漂移。

---

## 3. 规则重导：按违反后果分四类

重写时每条必须写得出四样：**唯一触发词 / 可观测谓词 / 判定命令 / 违反时的机械后果**。

| 类 | 定义 | 机械后果 | 落点 | 现有对应（待重导） |
| :-- | :-- | :-- | :-- | :-- |
| **A 不可委托** | 只能人做 | `tools/pre-execute` → `deny` | 插件 | 0-1 硬规则 6；AGENTS.md §4 |
| **B 机械判据** | 脚本能判 | 退出码非 0 | `check.ps1` + 测试 | DoD、双语同批、T1、文件数基线 |
| **C 门禁** | 需人裁决 | `deny`/`ask` + STATE 字段 | 插件 + STATE | 红灯、L 档、验收、不许跨会话推断批准 |
| **D 行为纪律** | 只有模型能守 | 无机械后果 | AGENTS.md 正文 | 正说优先、红旗表、防幻觉三查 |

写不出"机械后果"的：降级为 D，或按契约自己的 `no-op 测试`（`design/playbook-contract.md:76`）删除。**重导范围**：`playbook/0-1-驱动卡.md:44-98`（13 硬规则 + 13 红旗行 + 收尾/启动/分支）、`skills/roadbook/SKILL.md:16-104`（六铁律 + 双语 4 + 预算 5 + 门禁 4 + 接入 3）、`template/AGENTS.md`（§1–§12），预计 60–80 条。

---

## 4. 阶段划分

### 阶段 0 · 仪器修复与基线钉住（无仓库写入）

- 修复 `pwsh` `3221225794`（先试 `diagnose-windows-sandbox-acl` 技能；不成则换新会话/终端；仍不通就上报，不猜）。
- `git rev-parse HEAD` 记起点。
- **改动前取证**：`powershell -NoProfile -File _qc/check.ps1`、`npm test` 各取退出码 + 输出。
- **门禁**：任一非 0 → 停，任何阶段不开工（否则无法区分"我们改红了"与"本来就红"）。
- **退出标准**：两个真实输出 + HEAD 哈希粘贴进回执。

### 阶段 1 · 规则盘点与重导（产出数据，不动正文）

**写作用域**：`rules/rules.json`（新）、`skills/roadbook/bin/rules.mjs`（新）、`test/rules-audit.test.mjs`（新）、`package.json`（`files` 加 `rules`）

- 逐条抽出并定类（范围见 §3），填 `id/class/trigger/predicate/judge/renderedIn`；A/B/C 类**必须**有可执行 `judge`。
- `rules.mjs --audit`：断言 id 唯一、A/B/C 类都有 judge、`renderedIn` 指向的文件真实存在（幽灵引用判红，退出码 1）。
- **退出标准**：`node skills/roadbook/bin/rules.mjs --audit` 退出码 0 + 粘贴输出；`npm test` 0；`git diff --name-only` 只新增文件。

### 阶段 2 · 三处正文重写 + needle 表同批改（双语同批）

**写作用域**：`template/AGENTS.md`、`skills/roadbook/SKILL.md` + 根 `SKILL.md`、`playbook/0-1-驱动卡.md` + `playbook_EN/0-1-driver-card.md`、`_qc/check.ps1`、`test/rule-parity.test.mjs`（新）、`design/playbook-contract.md`、`design/glossary-en.md`、`docs/README.md`

- **`template/AGENTS.md` = 规则唯一正文**：按 A/B/C/D 重排，新增 `规则版本：<rulesVersion>` 行；D 类保留红旗表形态，A/B/C 标注机械落点。
- **`SKILL.md`**：铁律节改为"规则在本项目 `AGENTS.md`（DSH 自动加载）+ 本文件只做路由与门禁"；**保留 41 行路由表与 ≥30 个 `playbook_EN/` 引用**（`_qc/check.ps1:308-314`）；两份保持逐字节镜像。
- **`0-1-驱动卡.md`**：去掉与 AGENTS.md 重复的规则正文，保留意图路由、启动回执、收尾语、STATE 缺失分支。
- **`_qc/check.ps1` needle 表同批改**（已获批）。必须一并处理的现有断言：`:306` SKILL.md 五关键词 · `:540` 不许从上一会话推断批准 · `:163-218` 逐卡 needle · `:334-343` 红线域措辞 · `:346-347` STATE 字段 · `:47-48` 身份文件 · `:213` 契约短语 · `:565` baseline `rank-1`/`95` · `:571-572` 术语表 · `:579-603` T1 字面近似层。
  **原则：断言换落点，不许净删护栏**；每条被删的旧断言必须在同一提交里给出新落点的等价断言。`_qc/check.ps1` 自身 ≤700 行（现 676），超限按它自己注释里的程序上调（同改本行 + `design §8`）。
- `test/rule-parity.test.mjs`：双向断言 `rules.json` ↔ 三处正文（数据里有 → 正文必须含 anchor；正文有规则条目 → 数据必须有 id）。**注释里写明局限**：能发现"只在一边存在"，不能发现语义矛盾。
- **退出标准**：`_qc/check.ps1` 0；`npm test` 0；`test/skill-mirror.test.mjs` 0；needle 表改动前后对照贴进回执。

### 阶段 3 · DSH 锁定（宪法与守护脚本同批）

**写作用域**：`template/AGENTS.md`（§10）、`template/doctor.ps1`、`template/check.ps1`、`_qc/check.ps1`、`README.md`、`START-HERE.md`、`design/v6-design.md`

- 改 §10「**没有 DSH 的机器也要能跑完这套流程**」为"**本流程以 DSH 为运行前提**"，并写清：DSH 缺失时哪些步骤转人工、哪些能力直接不可用（Team / goal / plan / 动作闸）。
- `doctor.ps1` 增加 DSH 存在性与版本探测；`check.ps1`（母版与模板）同步口径。**三态**（在/不在/读不到），读不到不得显示为"通过"（沿用母版既有 `unknown` 规矩）。
- `README.md` / `START-HERE.md` / `design/v6-design.md` 的安装前提口径同批改。
- **退出标准**：`_qc/check.ps1` 0；`doctor.ps1` 在"DSH 在/不在"两种情形下都有可读回执（手工构造第二种情形取证）。

### 阶段 4 · Team 与官方行同步（跟随，不自建开关）

**写作用域**：`cordis.patch.yml`、`package.json`（`exports` 加 `./team`）、`plugin/roadbook-team/`（新：`index.js` + `package.json` + `README.md`）、`plugin/roadbook-autoload/team.js`（新，纯逻辑）、`plugin/roadbook-autoload/index.js`、`plugin/roadbook-autoload/test/team.test.mjs`（新）、`plugin/roadbook-autoload/README.md`

1. **先核实服务名**：工具侧已见 `ctx.agentTeams.*`；用 `cordis_inspect_query` 或 `dsh-experimental-agent-team` README 核实生产侧名字，不同则以实查为准。
2. **新增独立行**（承载 team 相关配置，**不碰 `roadbook` 主行**）：

```yaml
- insert:
    - id: roadbook-team
      name: roadbook/team
      # 官方 Agent Team 未挂载 → 本行不加载：设了也不生效
      disabled: !!js "!ctx.get('agentTeams')"
```

3. **语义**：官方行开 = 工具存在 = 允许；官方行关 = 工具不存在 = 该行不挂载 = **不可设置（设了也不生效）**。RoadBook **不自建"允许/不允许"开关**——权威开关单点，消灭"两处开关不一致"。
4. `team: off`（RoadBook 自限，用于"装了但我不想用"）。**删除原方案里的 `require`**——"要求 team 存在"与"不存在就不挂载"是同一件事，门已在加载器层做掉；"必须有团队才能开工"属**项目级策略**，写 `STATE.md`/`AGENTS.md` 由门禁判。
5. 插件侧探针只用于**回执与降级说明**（"Team 未挂载，本轮单线程走"），不再承担允许/不允许判断。
6. **测试要含门表达式断言**：`cordis.patch.yml` 里 `roadbook-team` 行的 `disabled` 必须含 `ctx.get(`——防止有人改成会抛的写法而触发 **fail-open**（抛错 = 当作启用）。
7. README 写明分工、fail-open 陷阱、以及 `pluginInventory` 为何不可用（Remote-only、无 Context 合并、只读）。
8. **退出标准**：`npm test` 0；`_qc/check.ps1` 0。**运行时观察本轮取证不到**（无可跑会话）——回执必须写"仅单测验证"。

### 阶段 5 · 动作闸（强引用，取推荐档 ii）

**写作用域**：`plugin/roadbook-autoload/gate.js`（新，纯逻辑）、`plugin/roadbook-autoload/index.js`、`plugin/roadbook-autoload/test/gate.test.mjs`（新）、`plugin/roadbook-autoload/README.md`

- 接 **`tools/pre-execute` waterfall**：命中写侧工具（`write`/`edit`/`apply_patch`/`bash`/`pwsh`）且本会话**没有卡回执**（复用既有 `cardReadState`/needle 机制）时，返回 `deny` + 理由行「未按卡开工：先贴卡号与开工回执，或说明本轮不走流程」。
- **只在开发对话下开闸**：沿用现有两道门（git 项目 + 命中开发意图）；闲聊/问答/纯翻译不拦；用户明确说"不用流程"时放行（抑制词已有）。
- 只用 `deny`/`ask`；决策与理由写观测文件（`event:"gate"`）。
- 配置 `gate: 'off' | 'warn' | 'deny'`，默认 `deny`（`warn` 只回执不拦）。
- **首步做最小验证**：一次写侧调用能触达监听器（文档声明它映射 `PreToolUse`，但本部署是否接线要实测）。
- **退出标准**：`npm test` 0；三态单测（无回执→deny / 有回执→放行 / 非开发意图→放行）；`_qc/check.ps1` 0。

### 阶段 6 · 机械判据补强（把 B 类做实）

**写作用域**：`skills/roadbook/bin/route.mjs`（已存在，待修）、`test/route-cli.test.mjs`（新）、`test/fixtures/route-scenarios.json`（新）、`test/expected-annotation.test.mjs`（新）、`playbook/{2-2,4-1,4-3,5-1}` + `playbook_EN/` 四份、`_qc/check.ps1`（一个 `Observe`）

- `route.mjs`：对齐 `atlas.mjs` 形态（`usage()` + 退出码 0/1/2）；锚点规则改为"只取 H1 或触发行"（**已发现 `4-3` 的 `等用户验收` 在 `:120`，不在头部 3 行 → 必修**）；测试含**反向对照**（篡改锚点必须判红）。
- **上线闭包断言**：`goLive:true` ⇒ 链必含 4-5 / 5-2 / 5-4；`goLive:false` ⇒ 必不含。
- `Expected：` 播种：S 链四张卡的 `powershell` 块补期望值（能替换就不新增行）；硬断言只覆盖这四张卡，全库存量计数走 `Observe`（不拦红，供 6-6 读）。
- STATE 字段校验并入阶段 4/5 的插件（`stateCheck` 配置；字段**逐字取自 `template/STATE.md`**，不新增字段）。
- **退出标准**：`node skills/roadbook/bin/route.mjs --audit` 0；`npm test` 0；`_qc/check.ps1` 0 且新增 `[obs]` 行可见。

### 阶段 7 · 评测接入与文档收口

**写作用域**：`_qc/baseline/README.md`、`_qc/baseline/triggers/README.md`、`CHANGELOG.md`、`_qc/internalize-2026-10-05-dsh.md`（新）

- 在 baseline 两份 README 写明**第三个面**（编排面：项目事实 → 卡链）由 `test/route-cli.test.mjs` 零成本机械判定、**不需要 harness**，与加载面/路由面**分开计分**。**必须保留 `rank-1` 与 `95` 字符串**（`_qc/check.ps1:565` 断言它们）。
- 行为面（守卡）明确标注：**本机无可跑 harness**（`_qc/baseline/README.md:33`）；复现门槛仍是"≥2 次独立 run 才动规则"。
- `CHANGELOG.md` 未发布节 + 内化记录（外部来源 → 落点 + 明确不拿清单）。
- **退出标准**：`_qc/check.ps1` 0；`npm test` 0。

---

## 5. 明确不做（附否决理由）

| 方案 | 否决理由 |
| :-- | :-- |
| 门控整个 `roadbook` 主行 | RoadBook 必须在无 Team 环境单线程跑完流程；否则"没装 Team"会变成"流程不可用" |
| RoadBook 自建 Team 允许/不允许开关 | 与官方行构成两处开关；官方行关掉时工具根本不存在，自建开关是多余的第二真相 |
| 用 `pluginInventory` 读行状态 | 该服务 **Remote-only 且刻意不做同进程 Context 合并**；插件拿不到 |
| 把开关"变灰" | 那是 DSH 客户端（`dsh-client-ui-settings-plugins`）的渲染逻辑，不在本仓范围；本仓能做到的是"设了也不生效 + 可审计" |
| 用会抛的 `disabled` 表达式 | **fail-open**：求值抛错会被当作**启用**，正好与意图相反 |
| 在插件里"允许/改写"工具调用 | `PreToolUse` 只支持 `deny`/`ask`；`allow` 不预审批、`defer` 不支持、`updatedInput` 不生效 |
| 把判据散文塞进 `rules.json` | 第三处真相；`rules.json` 只放标识与机械钩子 |
| 用 `mode: always` 做"强引用" | 全量注入约 13 KB/轮（`plugin/roadbook-autoload/README.md:51`），对"谢谢"也付费；本仓已有两套触发题防这件事 |
| 借改 needle 表删护栏 | needle 表允许改，但断言必须换成新落点的**等价**断言，不许净删 |

---

## 6. 失败模式与回滚

| 失败模式 | 处置 |
| :-- | :-- |
| 阶段 0 门禁本来就红 | 停；先修仪器/既有红灯，任何阶段不开工 |
| needle 表改出"护栏空洞" | 每删一条旧断言，同提交给出新落点的等价断言；回执逐条对照 |
| 两份 `SKILL.md` 分叉 | `test/skill-mirror.test.mjs` 判红；按提示把根文件复制到镜像 |
| 规则搬进 AGENTS.md 后，老项目缺该文件 | 插件三态探测：缺文件或 `规则版本` 落后 → banner 一行 + 按项目策略处理；**不静默放行** |
| Team 门表达式写错（会抛） | 阶段 4 的门表达式断言拦下；fail-open 陷阱写进 README |
| 实验包改名/移除/升版 | 探针名字与版本断言取自实查；不符 → **响亮降级为单线程** |
| `tools/pre-execute` 实际不可用或语义不同 | 阶段 5 首步最小验证；不可用则退回 `warn` 并写进内化记录 |
| 任一阶段把门禁改红 | `git revert <该阶段提交>`，回上一绿点；每阶段独立一笔提交 |

---

## 7. 假设与待核实项

1. `pwsh` 故障可修复；修复后 `_qc/check.ps1` 与 `npm test` 在 HEAD 上为绿。
2. **待核实**：Team 域服务的生产侧名字（消费者侧已见 `ctx.agentTeams`）。
3. **待核实**：`ctx.get('<service>')` 在 `disabled` 求值时的可见性——DSH 自用 `!ctx.get('profileContext')`，模式成立，但 `agentTeams` 是否在 Loader 上下文可见要实查。
4. **待核实**：`tools/pre-execute` 在本部署是否已接线（文档声明映射 `PreToolUse`）。
5. `dsh-agent-instructions` 默认启用；若本部署被显式关闭，阶段 2 的"规则住 AGENTS.md"需回退为卡片投递。
6. 41 张卡的业务判据**本轮不动**（除阶段 6 的四处 `Expected：` 标注）；凡改卡片必双语同批。
7. 不升 `package.json` 版本，除非测试要求；`files` 白名单新增 `rules`。

---

## 8. 验收矩阵（每阶段收尾必跑）

| 命令 | 期望 | 生效阶段 |
| :-- | :-- | :-- |
| `powershell -NoProfile -File _qc/check.ps1` | 退出码 0 + 完整输出 | 全程（母版唯一验收口径） |
| `npm test` | 退出码 0（根套件 + 插件套件，glob 不点名） | 全程 |
| `node skills/roadbook/bin/rules.mjs --audit` | 退出码 0 | 1 起 |
| `node skills/roadbook/bin/route.mjs --audit` | 退出码 0 | 6 起 |
| `git status --porcelain` | 空 | 每阶段收尾 |
| `git log --oneline -1` | 一笔带阶段标识 | 每阶段收尾 |

---

## 9. 开工第一件事（待下令）

1. 修 shell（阶段 0）。
2. 在 HEAD 上取 `_qc/check.ps1` 与 `npm test` 的退出码与输出——**这两条不绿，后面全部不动**。
3. 只做阶段 1（规则盘点 → `rules/rules.json` + `rules.mjs --audit`），产出后先给用户过一遍分类，再进阶段 2。

**本文件至此不含任何已实施改动。**
