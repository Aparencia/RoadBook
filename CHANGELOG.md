# 更新日志（roadbook 主插件）

版本号只有一处事实源：根 `package.json` 的 `version`。客户端半的 `PLUGIN_VERSION`（标签页页脚显示）与
宿主半的 `pluginVersion()`（启动日志）都必须与它一致 —— `test/client-contract.test.mjs` 会逐字核对，漏改即判红。

**升版规则**（agent 只提议，人裁决）：

| 改了什么 | 升哪一位 | 例子 |
| :--- | :--- | :--- |
| 加能力（新子行、新图类型、新标签页动作、新 CLI 命令、新设置项） | 次版本 `0.x.0` | 给图册加「导出 PNG」→ 0.3.0 |
| 修 bug、改文案、改文档措辞 | 修订号 `0.2.x` | 修预览遮罩 → 0.2.1 |
| 改目录约定 / 回执 schema / 命令参数 / Loader 行 id（已装用户需要动作） | 次版本 + 迁移说明 | 回执加字段 → 0.3.0 |

一次升版动四处：根 `package.json` 的 `version`、`lib/client.js` 顶部 `PLUGIN_VERSION`、本文件顶部加一节、
`git tag`（由agent 打 tag）。改完从仓库根跑：

```bash
node --test "test/*.test.mjs" && node --test "plugin/roadbook-autoload/test/*.test.mjs" && node --test "plugin/roadbook-evolve/test/*.test.mjs"
```

## [未发布]

### 修 bug

- **`route.mjs` 看不见多位数卡号，而 `--audit` 判「双语无缺份」绿（假绿）**：`ID_RE` 原为 `/^(\d-\d)-(.+)\.md$/`，第二位只认一位数字 —— 2026-10-06 新增的 `7-10-技术栈迁移` 因此对扫描器**不存在**：`--audit` 报「44 张 · 判绿」，而 `playbook/` 与 `playbook_EN/` 各有 45 个文件、`design/v6-design.md` §4 表 45 行、`_qc/check.ps1:63` 断言 45。一张卡对扫描器不存在 = 路由永远到不了它，而门禁与 `roadbook-evolve` 的 S6（只看退出码）**双双判绿**。修法：`ID_RE` 放宽为多位数字；`scanDir` 把认不出的 `*.md` 收进 `unparsed`；`audit` 逐条判红。**防线**：A1 由 `cardsCn >= 41` 改为「扫描到的卡数 = 磁盘上的 `.md` 文件数」，新增 A2b 反向对照（合成一个认不出的文件名 → 必须报红）。

## [0.7.2] - 2026-10-06

**两个「静默不注入」的根因修复：技能从来没被读进技能目录 + 分叉会话被误判成子代理。** 实测 `%TEMP%\roadbook-autoload.jsonl` 166 行里 `inject` 事件 **0** 条 —— 插件是活的（`loaded` 39 / `banner` 41 / `team` 5），但流程正文一次都没进过上下文。按「修 bug → 修订号」走 **0.7.2**。

### 根因一（P0）：`SKILL.md` 的 frontmatter 是非法 YAML，被宿主整份丢弃

`skills/roadbook/SKILL.md` 的 `description` 是**未加引号的 YAML 朴素标量**，其中第 378 字符处有一个 ASCII 冒号+空格（`…when no process is wanted: a one-off question…`）—— YAML 把它读成嵌套映射。用 profile 里同一个 `yaml` 包、按 `dsh-skill-filesystem/lib/index.js:780-806` 的 `parseFrontmatter` 逐行复刻实测：

```text
[roadbook]       parseFrontmatter THREW -> invalid YAML frontmatter
                 Nested mappings are not allowed in compact mappings at line 2, column 14
[roadbook-atlas] YAML OK | keys=name,description,license        ← 对照组
```

抛错被 `:672` 的 catch 接住、只打一条 warn 就 `return` ⇒ **该文件被忽略** ⇒ 技能目录里没有 `roadbook`（`skill("roadbook")` 当场报 `unknown`，而同 provider 分发的 `roadbook-atlas` 在）⇒ 自动加载落 `skip/no-skill`（观测里 07:58:28Z 与 10:41:25Z 两次，cwd 均为本仓）⇒ 正文永不注入。

**为什么两天没被发现**：`_qc/check.ps1` 为 frontmatter 写了**九条**断言，但**全部走正则**（`:593` 按行切 `---`、`:594` 抓键名、`:597` 切 description）——正则读得懂非法 YAML，所以九条全绿。这正是本仓最反对的**假绿**：断言看着密，方向不对。

### 根因二（P1）：分叉/续接会话被 `isSubagentHeader` 误判成子代理

`trigger.js` 的 `isSubagentHeader` 先看 `parentSession` 非空就判 true。解压真实会话头实测：**4 个真子代理**是 `delegationDepth=1, isSeeded=false`，而**分叉出来的用户会话**是 `delegationDepth=0, isSeeded=true` 且同样带着 `parentSession` ⇒ 用户会话被判成子代理、整轮不注入（本会话 02:11:07Z 那条 `skip/subagent` 即此）。DSH 早已提供权威字段 `delegationDepth`，判据不该拿 `parentSession` 代替。

### 修复

- **`SKILL.md` 与 `skills/roadbook/SKILL.md`（B4 镜像，同批）**：`description` 值**加双引号**——正文一字未动，文件字符数 8189 → 8191，解析后 description 仍 496 字（≤ `catalogDescriptionMaxLength` 500）。
- **`plugin/roadbook-autoload/trigger.js`**：`isSubagentHeader` 改为**优先认 `delegationDepth > 0`**；宿主没给该字段时才退回旧的 `parentSession` 判据（保守，不放松）。
- **`_qc/check.ps1` §4**：新增 YAML 安全断言——frontmatter **未加引号**的值不得含 ASCII「: 」；其自身上限 720 → 730（同步 `design/v6-design.md` §8）。
- **`design/v6-design.md`**：§13 机制要点②补「frontmatter 必须是合法 YAML」与本次实例；§15 补子代理判据的口径修正。

### 本轮已有证据（修复过程中实测）

- **新断言有牙**：加完断言、`SKILL.md` 尚未修时跑门禁 → `[FAIL] SKILL.md frontmatter 未加引号的值不含 ASCII「: 」`、退出码 1。
- **变异验证**：把 `isSubagentHeader` 换回旧实现放进临时副本 ⇒ 用例 `分叉/续接会话不算子代理` **恰好 1 条红**；本仓实跑 `plugin/roadbook-autoload/test/*.test.mjs` **94/94 绿**。
- 收尾门禁与三套测试的完整输出见本次提交的粘贴回执。

### 已装用户需要动作

`skills/` 随包分发，**必须更新插件**（插件面板或「图册」页脚「更新」）并重启 DSH，技能才会进技能目录；本地路径安装的机器需要重新 `pnpm add`。更新后自检一条：`skill("roadbook")` 应当可加载 —— 报 `unknown` 就是还没生效。

## [0.7.1] - 2026-10-05

**真机「应用无法启动」的根因修复：客户端半的顶层 `inject` 必须为空。** 0.7.0 装上去后 DSH 弹「应用无法启动或已意外停止」，正文是 `web boot: 1 entry did not activate / roadbook: import failed (see console for the import error)` —— 而**控制台里其实没有任何 roadbook 的错误**。按「修 bug → 修订号」走 **0.7.1**。

### 根因（三段证据，逐条可复现）

- **那句提示在误导。** DSH 前端的 boot 审计（`dsh-web-frontend/dist/assets/index-5SrrfWpU.js`）对每个 loader 条目先查 `modules.importError(id)`：**只有查不到导入错误时**才打这条「see console for the import error」兜底文案 —— 它出现恰恰等于「没有任何导入错误可看」。而 `importError` 只读 import/prefetch 失败表（`dsh-client-modules/lib/client.js:765`），`loader.create()` 与条目级的失败根本不进那张表。
- **同一句话今天已经打给过别的插件。** 14:59 那次崩的是 `dshmarket: import failed (see console for the import error)`（当时我的 0.7.0 还不存在），17:48 那次是 `roadbook: failed`（装的是 0.4.1，控制台里真凶是 `Uncaught Error: list slot "plugins.item" requires options.id`）。这条提示既不是本轮引入的，也不指向具体缺陷。
- **我的导出没有被 cordis 拒收。** 把 DSH 自带的那份真 `@deepseek-ai/cordis` 4.0.4 从 `app.asar` 取出来当接收点（`ctx.plugin(exports)`）：0.4.1 与 0.7.0 **都被接受**；`factory(require)` 干净、`apply` 在零服务下零异常零警告。区别只有一处：

  | 版本 | 顶层 `inject` | 真 cordis 里 `ctx.plugin()` 的结果 |
  | :--- | :--- | :--- |
  | 0.4.1 / 0.7.0 | `['betterSidebar']` | **PENDING**（服务没到就永远不激活） |
  | 0.7.1 | `[]` | LOADING → **ACTIVE**（零服务也起得来） |

  PENDING 在审计里**同样**算「did not activate」→ 照样 `throw` → 应用打不开。也就是说：**只要 better-sidebar 缺席或稍晚到位，RoadBook 就让整个 DSH 起不来** —— 而「用户把 better-sidebar 关掉」是完全正常的状态。根因就是这一行。

### 修复

- **`lib/client.js` 改为 `var inject = []`**，两个外部服务一律走作用域注入：`slots`（原有）与 `betterSidebar`（新增 `registerSidebarTabs`）。作用域注入只产生子 fiber、不是 loader 条目，不参与那次审计 —— 没有 better-sidebar 就没有「图册」「自进化」两个标签页，但 DSH 一定起得来。
- 同一条规则仓库里已经写过两遍（宿主半读 `webServer`、自进化行的空 inject），这次是第三处。`_qc/check.ps1` 的断言从「inject 必须含 betterSidebar」**反转**成「顶层 inject 必须是空数组 + slots/betterSidebar 都走作用域注入」，并锚到代码行（`(?m)^\t\tvar inject = \[\];`）—— 注释满足不了它（四条变异逐条实测：好=真 / 坏=假 / 注释=假 / 把接线注释掉=假）。
- 测试夹具跟着改严：`strictCordisCtx` 补上 `inject(deps, cb)` 的真实语义（服务不在 ⇒ 回调不被调用；在 ⇒ 回调拿到注入过的子 ctx），新增 `sidebarCtx` 作为生产形状的唯一来源。原先那批「假 ctx 把 betterSidebar 当普通属性直接给」的用例，正是让这个缺陷整套测试全绿的原因。

### 复核遗留（未修，属 DSH 侧）

审计把「条目还没被物化」与「条目真的坏了」判成同一件事，再配一句指向控制台的兜底文案；14:59 与 22:08 两次崩溃各自只命中**一个**条目、而且是不同的插件。0.7.1 只消掉了 RoadBook 这条确定性路径，没有修 DSH 的那条竞态。

## [0.7.0] - 2026-10-05

**更新入口升为一等公民 + 升级生效对账**：更新能力此前只有「侧栏图册标签页页脚」一个落点——不看图册的用户永远不知道有新版本，而且「安装命令退出码 0」与「新版本真的在跑」混为一谈（界面只能说一句「重启 DSH 后生效」，永远没有下文）。按「加能力 → 次版本」走 **0.7.0**。

### 新能力

- **插件详情页的「检查更新」入口**（用户裁决 Q1=A / Q2=A）：注册进 DSH 内置插件页（侧栏「插件」→ roadbook 组合包详情）声明的三个 list slot —— `plugins.detail.actions`（页头控件，在页面自己的开关与卸载**之前**）、`plugins.detail.badge`（标题旁一枚标签）、`plugins.detail.section`（页面内容之下的区块：状态一句话 + 运行/磁盘/上游三个版本 + 升级对账 + 上次检查时间）。每个条目都按页面的 `subject` 门控：**只认 `{ kind: 'bundle', pkg.name === 'roadbook' }`，其余一律返回 null** —— 这三个 slot 在**每一个**插件的详情页上都会渲染，不做门就等于跑到别人的页面上说话。
- **接线走作用域注入**：`ctx.inject(['slots'], …)`，服务缺席或 slot 永不被声明就什么都不发生。把 `slots` 写进 `inject` 会让服务缺席时本行停在「未激活」，而 DSH 的 web boot 把任一未激活条目判成致命错误 —— 那是 0.4.1 那次「应用无法启动」的同一类事故（`_qc/check.ps1` 当时按这条口径加了断言）。**→ 这条口径本身在 0.7.1 被推翻**：`inject` 里留着 `['betterSidebar']` 是同一个错误的另一半（顶层 inject 只要不为空，服务缺席/迟到就让本行 PENDING），见上节。
- **升级生效对账（闭环）**：`lib/update.js` 新增两个纯函数 —— `lastApplyTarget()` 从观测文件里取最后一次 `apply-finish` 的**目标版本**（`after` 为空串的那次不算：`pnpm` 的 "Already up to date" 没换掉任何东西），`upgradeOutcome()` 把「目标版本」与「本进程加载时的版本」（`bootVersion`）对成四态：`applied` / `pending`（还没重启）/ `newer`（此后被别的版本盖过，不对这次更新下结论）/ `unknown`（读不到）。状态路由把它作为 `status.upgrade` 发出；界面据此把徽标切成「待重启」并如实报出两个版本。
- **三个版本号分开报**：运行版本（`bootVersion`，重启才会变）／磁盘版本（`installedNow`）／上游版本（`latest`）。装完没重启时磁盘已是新版、内存里还是旧的 —— 合成一个数字就是把这件最容易被误读的事藏起来。

### 优化（对照本轮方案 O1–O5）

- **O1 手动检查穿透冷却**：详情页按钮一律走 `?force=1`（宿主冷却只约束自动轮询），请求在飞时按钮置灰（`detail.checking`），并发仍由宿主的 `state.checking` 单飞兜住。
- **O2 版本单一来源**：更新相关的界面文案只读**宿主 status** 的版本字段，不再拿客户端编译进 bundle 的常量当「当前版本」。
- **O3 提示不再依赖「打开图册」**：徽标进插件详情页标题旁。
- **O4 升级生效可见**（见上「升级生效对账」）。
- **O5 拒绝原因可见**：`agents-busy` / `no-applier` / `mode-off` 等宿主拒绝理由随状态进区块，不再只进日志。

### 边界与代价（明说）

- **客户端半整体仍 gated on `betterSidebar`**：`inject` 保持不动是有意的（见上），代价是**没有 better-sidebar 的部署上，这两个标签页与详情页贡献都不会出现**。代码里、README 与本节都写明这条耦合。
- **三个 slot 名是 DSH 内置插件页声明的**：DSH 若改名，本贡献**静默不出现**（`slots.inject` 只是在等），不会报错也不会降级显示 —— 这是它的失败形态，排查时先看 `plugins.detail.*` 是否还在。
- **详情页贡献随 `roadbook` 主行同生共死**：`dsh-client-modules` 只把一个包的浏览器半挂在说明符恰为包名的那一行 Loader 行上；关闭主行 = 这三处贡献一起消失（这是设计，不是缺陷）。
- **手动「检查更新」是真的打远端**：穿透冷却意味着每点一次就发一次请求，界面用「检查中」态与单飞合并兜住连点，不额外加静默冷却窗口（静默窗口会让用户点了没反应，正是本次要修的那类体验）。

### 提交后独立复核（只读对抗式，两条 P1 + 三条 P2，逐条已修）

复核对象 = 提交 `27a8958`；复核者不参与写，只交结论。**它打穿了本批自己的两处「假绿」**：

- **P1① 空转的安装被算成「已生效」**（`lib/update.js`）：`lastApplyTarget` 原来只挡 `after === ''`，而 `pluginVersion()` **永不返回空串**（读不到时回 `unknown（…）`），`pnpm` 的 "Already up to date" 落的是 `after === before`（非空）⇒ 界面会说「上次更新已生效：v0.7.0 → v0.7.0」，而盘上什么都没换 —— 正是图册更新条专门拦掉的那句假话。修法：只认**最后一条** `apply-finish`，且它必须 `exitCode === 0`、`after` 可读（非空且非 `unknown…`）、`after !== before`；不合格就到此为止，**不用更早的一条冒充这次**。
- **P1② `before` 从不进状态，文案恒显 `v?`**（`lib/index.js` + `lib/client.js`）：`upgradeOutcome` 只回 `state/target/running`，而界面那句「已生效：v{before} → v{target}」要用 `before` ⇒ 永远显示 `v? → v0.7.0`；而测试夹具自造了 `before` 字段，所以测不出来（**夹具比生产宽松 = 假绿**，与 0.4.1 那次同一个病）。修法：状态补 `before: landed?.before`，夹具改用宿主真实形状。
- **P2① 三条门禁断言是恒真空断言**（`_qc/check.ps1`）：只 match 标识符会被注释、JSDoc 与 import 行满足 —— 复核实测「把 `upgradeOutcome` 的 return 改成 `'unknown'`」「删掉 `upgrade:` 字段」都仍然判绿。修法：锚到代码行（`export function …` / `state: order > 0 ? 'newer' : 'pending'` / `upgrade: upgradeInfo()` / `[DETAIL_ACTION_SLOT, "roadbook-update-action"`），并逐条做变异验证。
- **P2② 读不到被算成「已生效」**：`upgradeOutcome` 的字面相等兜底会把两个相同的 `unknown…` 降级串判成 `applied`。修法：`readableVersion()` 先把 `unknown…` 归成「读不到」⇒ `unknown`。
- **P2③ 警告文案指错对象**：`warnRegistration` 固定写「标签页 X 注册失败」，详情页 slot 失败也走它。修法：文案去掉「标签页」。

**复核确认没问题的**：三个 slot 名 / `({t, subject})` 形参 / `subject` 三种形状 / 按 `order` 排序 / 对无话可说的 subject 返回 null，与 DSH 内置实现逐条一致；`inject` 仍只有 `betterSidebar`；外壳不调 hook、别人的详情页零请求；`updateStripText` 与旧内联实现逐字等价。**复核留的一处不确定已按证据消解**：`order: 20` 是官方 slot 文档明写的注册项（「带 `id`、`order` 和本地化的 `label` 注册」），内置插件页自己也用 `entry.options.order ?? 0` 读它，故保留。

### 测试与验收

- `node --test "test/*.test.mjs"`：**141/141**（`update.test.mjs` 38 → 41：新增 `lastApplyTarget` 尾部取值与空 `after` 不计、`upgradeOutcome` 四态 + 读不懂版本串时退回字面相等、状态路由带 `upgrade` 对账；`client-contract.test.mjs` 35 → 41：新增三个 slot 的注册形状与 `inject` 未被污染、`ctx.inject` 读属性即抛时标签页照注册、subject 门（别人的页面返回 null）、**壳在别人的页面上一个 hook 都不调**、能力关闭时三处一起不出现、有新版/待重启两档判定）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"`：**93/93**；`node --test "plugin/roadbook-evolve/test/*.test.mjs"`：**33/33**。
- `powershell -NoProfile -File _qc/check.ps1` 见本次提交的粘贴输出。
- 版本口径：根 `package.json` = `0.7.0` = `lib/client.js` 的 `PLUGIN_VERSION`（`client-contract` 逐字核对）。
- **真机验收需要人在场**（装新版本 + 重启 DSH 属不可委托）：本机 profile 装的是 0.4.1，上游 0.6.1 —— 这条链本身要等装到 0.7.0 之后才能在真实插件详情页上看到三处贡献。

## [0.6.1] - 2026-10-05

**独立复核后的修订批**：0.6.0 发布（commit `cb74295` + tag `v0.6.0`）之后，独立只读复核（共享任务板 task-3）报了 5 类问题，本批全部修掉。按 5-6 卡的升版规则「修 bug / 改文案 / 改文档措辞 → 修订号」走 **0.6.1**。

### 修掉的（逐条对应复核原文）

- **S1 的「本机实测」不是实现能产出的形状**（轴 5·不通过 1）：README 与 design §17.5 都写 `65/468`，而实现是「命中测试痕量的**记录数** ÷ 两份文件的**记录总数**」——`65` 是 `apply-start/apply-finish` 的**对数**（记录数是 130），`468` 是单文件总数（分母是两份之和）。三处同批改为 **`130/632`**，并标明它是**带时点的快照**（该读数随观测文件长度增长而变）。
- **悬空互引**（轴 6）：CHANGELOG 与 design §13 都指向「`[0.6.0]` 节『tag 例外』」，而那一节里没有这个条目。tag 记录改落在**本节**的「tag 例外」，两处指针同批改正。
- **「不新增落盘产物」与实现相抵**（轴 5·不通过 2）：`plugin/roadbook-evolve/README.md` 采集行的前半句与实现不符（本行确有 `<os.tmpdir()>/roadbook-evolve.jsonl`，README 自己在「自身活性」一节也承认）——改为「不写仓库文件（观测落 tmpdir）」。
- **计数口径 5 处不同步**（轴 2）：`_qc/check.ps1` 的两条断言文案（`$umbSub` 6 键、`$umbRows` 6 项，标签却写「五个」）、`cordis.patch.yml` 头注释（五条/四条/四行 → 六条/六条/六行，并把 `roadbook-evolve` 补进行清单）、根 `README.md` 插件一节（枚举漏 `roadbook-team`）、`design/v6-design.md` §17.2 表（漏 team 行）、`test/umbrella-contract.test.mjs` 文件头注释。**这几处恰是本仓库最在意的那类缺陷：机械断言更新了、给人看的清单没跟上。**
- **`signals.js` 注释写了不变量、代码没强制**（复核附注 1）：`signal()` 现在**自己**把「无读数」强制成 `unknown`；`readSource()` 把「既无 `text` 也无 `error`」判成「读不到」而不是「空文件是空的」（附注 3）。
- **`classifyArm` 的文件头口径不实**（复核附注 2）：改为如实描述——命中测试标记 → `suspect`；非记录形状 → `unknown`；其余按 `prod`（这两份文件本就是生产观测口）。

### 守备面补齐（轴 3 的守卫面缺口）

- `test/packaging.test.mjs` 的 `REQUIRED_RUNTIME_PATHS` 补 `plugin/roadbook-evolve/{index.js,signals.js}`——该表自己的注释写着「改 `lib/` 或插件的运行时引用，必须同步这张表」，0.6.0 漏了。今天不红只是因为根白名单用的是目录级条目（`lib` / `plugin`），属**守卫面缺口**而非打包缺陷。

### tag 例外（用户裁决，记录在案）

历史世代号 tag `v0.6.0`（2026-10-03，annotated，message「Roadbook V6 母版 · 首个判据版本（QC 118/118）」）由用户 2026-10-05 裁决**删除并改指插件线 v0.6.0**（`cb74295`）。这与 5-6 卡「已发布 tag 不许移动或删除（禁 `git tag -f`）」相冲突，属**经用户明确裁决的一次性例外**，不是新的通行做法——该规则继续对今后每一个 tag 生效。做法是 `git tag -d` + 重新 `git tag -a`（**没有用 `-f`**）。

> **事实更正**：`design/v6-design.md` §10 第 14 条记载「GitHub 侧建 Release `v0.6.0`」，但 2026-10-05 实测 `GET /api.github.com/repos/Aparencia/RoadBook/releases` = **0 条**、`/releases/tags/v0.6.0` = **404**——该仓库当前没有任何 Release；删 tag 之前它就不存在，不是本批删掉的。该条属历史实施记录（按本仓库口径不追改），此处留一行更正供后人核对。

### 测试

`signals` 18 → **20 例**（新增「来源形状不对判 unknown」「空文件 ≠ 没给来源」两条不变量用例）、`service` 13/13、其余套件不变；`_qc/check.ps1` 复跑结果见提交回执。

## [0.6.0] - 2026-10-05

**新增第六行 `roadbook-evolve`（自进化信号表）+ 客户端半第二个标签页「自进化」**（用户指令：「新增一个自进化 plugin」）。设计记录见 `design/v6-design.md` §17.5。

### 新能力

- **`plugin/roadbook-evolve/`**：宿主半 `index.js`（只做接线）+ 纯逻辑 `signals.js`（可离线单测）。把「流程自己有没有在正常工作」算成六条信号，**三态判定**（`ok` / `hit` / `unknown`）：S1 观测臂污染 / S2 注入活性 / S3 常驻提示可用率 / S4 工作树状态 / S5 规则索引健康 / S6 路由完整性。**判据不复刻**——S5/S6 只记 `rules.mjs --audit` 与 `route.mjs --audit` 的退出码（复刻 = 第二处真相）。
- **两条只读本机路由**：`GET /roadbook/evolve/status`、`POST /roadbook/evolve/tick`；都过 `trustedLocalRequest` 同源守卫，都走可选服务 `ctx.inject(['webServer'])`（读不到只让路由不出现，绝不让整行变「未运行」）。
- **侧栏「自进化」标签页**（id `roadbook:evolve`，order 46）：显示信号表与越界项；`unknown` 显示成「判不了」而不是「正常」。
- **自身活性判据**（本行第一个遵守它自己提的门槛「任何自进化机制必须回答：它怎么被证明还活着」）：每次 tick 写一条 `tick` 观测，超 48 小时无 tick 判 `hit`。

### 边界（V1 明确不做，见 `plugin/roadbook-evolve/README.md`）

不自动开 GitHub issue（凭据 + 台账公开性未裁决 + 外部 CLI 要走 7-9 准入）｜不自动改卡（撞 A6）｜不写仓库文件（默认落 `<tmpdir>`，避免脏树破 B9）｜不跑 LLM harness（属 `schedule` 唤醒的活）。S1 是**启发式**（`fake-` 命令 / 哨兵版本 / 显式 `arm`），判不出的记 `unknown` 单独显示；V2 应由生产者直接写 `arm: prod|test`。

### 变更

- 根 `package.json`：`exports` 增 `./evolve`；`scripts.test` 增第三组 glob。
- `cordis.patch.yml`：`- insert:` 下平铺第 6 行 `roadbook-evolve` → `roadbook/evolve`。
- `lib/index.js`：`HOST_ENTRY_MODULES` 增 `plugin/roadbook-evolve/index.js`（就绪自检的 import 闭包随之覆盖 `signals.js` 与 `lib/update.js`）。
- `test/umbrella-contract.test.mjs`：平铺行数断言 5 → 6；`HOST_ENTRY_MODULES` 断言同步；新增 evolve 导出面三条。
- `_qc/check.ps1`：`$umbSub` 4 → 5 个入口；`$umbRows` **4 → 6 行**——**顺带补齐此前漏登记的 `roadbook-team`**（它此前只在 `umbrella-contract` 里被断言，check.ps1 从没查过它）；新增 evolve 四条断言（打包白名单 / 三态判定 / 两条路由 / `inject` 必须为空）；测试套件 glob 增第三组。
- `design/v6-design.md`：§17.2 工具面表加 `roadbook-evolve` 行（并改「平铺四条」→「平铺五条」）；新增 §17.5 实施记录。
- `README.md`：插件一节「四个子行」→「五个子行」并补 evolve 一句。

### 本批沉淀的一条教训（写进 design §17.5）

宿主半初版 `readGit` 只取 `git status --porcelain` 的**退出码**却写死 `porcelainLines: 0`，S4 因此永远显示「工作树干净」——而纯逻辑测试 **18 例全绿**（它证明「算得对」，证明不了「喂进去的是真数据」）。修法是补 `plugin/roadbook-evolve/test/service.test.mjs`（13 例，注入假子进程与假文件读取），其中一条把「stdout 有行必须判 hit」钉死。**接线层必须有自己的测试。**

## [未发布]

**V6 补卡批 · 流程三处补强（2026-10-05）** —— 用户裁决三项：①想法决定实施前先调研市场成熟方案/同类产品/GitHub 现成轮子 ②版本号管理细节 ③完善项目重构流程。齐套要求：先逐项与用户确认 → 中英同批改卡（`playbook/` + `playbook_EN/`）→ 同步 `design/v6-design.md` → 跑 `check.ps1` 取退出码 0 → 提交。

### 新能力

- **新建 4 张卡，卡数 41 → 45**（中英逐张对应，`design/v6-design.md` §4/§4.1 已登记；构成改为「0-1 驱动卡 + 0-2 会话生命周期 + 43 张动作卡」）：
  - `0-2 会话生命周期` / `0-2-session-lifecycle.md`：会话收尾四步（证据落盘 → 工作树三选一 → 回写 STATE.md → 需要跨会话时写交接条）；**压缩前必须先落盘**（同一条命令的红/绿两次输出要在压缩发生前写进文件）；会话归档只做三件、不新建仓库文档。
  - `2-6 外部方案调研` / `2-6-external-solution-research.md`：**轮子先行五查**（有没有 / 活不活 / 能不能用 / 合不合 / 值不值）+ **判定三值**（接入现成 / 抄思路自研 / 自研）；许可证无 LICENSE 或 GPL·AGPL·SSPL → 停下问人。
  - `5-6 版本与变更日志管理` / `5-6-version-and-changelog-management.md`：升版判定表（只换实现、外部行为不变 → 不升版本，改走 7-8）+「未发布」节四类 + **tag 纪律**（已发布 tag 不许移动或删除，禁 `git tag -f`）。
  - `7-10 技术栈迁移` / `7-10-tech-stack-migration.md`：与 7-8 的**分界判据**（外部行为要求不变 → 7-8）+ 迁移八步（选型先行 → 黑盒契约/黄金样例 → 数据双跑对账差异为零才切读 → 删旧或登记并行态 → 观察窗）。
- **7-8 项目重构收敛**：明写「不含技术栈/框架迁移——那走 7-10」，重构线（行为不变）与迁移线（行为可变、旧系统当 oracle）在 design §4 档位表里各自成线。
- **`design/v6-design.md` §13 版本口径**：`V6` 世代号**不再用于打 tag**，标签线唯一走插件 semver（当时 `v0.4.1 → v0.5.0`）；历史 `v0.6.0` 原拟「原地保留、不作版本参考」——**该 tag 已于 2026-10-05 经用户裁决删除并改指插件线 v0.6.0**（见本文件 [0.6.1] 节「tag 例外」）。

### 变更

- **`_qc/check.ps1`**：§4 表解析张数断言 41 → 45；新增 8 条 needle（4 张新卡中英各 3 项判据）；新增 3 条「三份活文档卡数 = §4 表张数」同源断言（README / START-HERE / SKILL，数值从 `$cardNo.Count` 推导，避免三处再写死数字）。
- **`test/fixtures/route-scenarios.json` 重生成**（`expect.chain` / `expect.ledger`）：起因见 `_qc/baseline/ledger.json` 的 `note` —— 卡文本按预期变化（+4 张卡、A3 规则移除）；已复跑 `node --test test/route-cli.test.mjs` 取 14 pass / 0 fail。
- **卡内口径修复 16 个文件**（中英各 8）：日期、计数、密钥检查、`1-2` 首提交自相矛盾等；其中 `1-2` 的矛盾用两个临时 git 仓库实测复现了修复前后行为差异。
- **模板侧机制修复 5 处**（`template/`）：`docs/README.md`、`docs/USER_GUIDE.md`、`docs/registry/DATA_DICT.md`、`.gitignore`、`.tool-versions` 的既有漂移。

**打 tag 改为由 agent 执行（规则版本 `2026-10-05.1` → `2026-10-05.2`）** —— 用户裁决：「允许 agent 打 tag」。

### 变更

- **A3「打 git tag」从 A 类不可委托清单移除**（A 类 7 条 → 6 条；id 不复用，避免与历史引用混淆）：`git tag -a` 与 `git push origin <tag>` 自本版起由 agent 在发布流程内执行（**提交跑绿 + 三对齐核对通过之后**）。**执行发布部署仍是不可委托（A2）**，本次只移出打标这一个动作。
- **已发布的 tag 不许移动或删除**：禁 `git tag -f`、禁强制覆盖已推送的 tag；tag 一律用注解式（`git tag -a $ver -m "…"`）。
- 同批改动：`template/AGENTS.md`（A 类正文 + 个人档一行 + `规则版本：`）、`rules/rules.json`（删 A3 条目 + 版本号）、`design/glossary-en.md` §6 英文锚点表、`SKILL.md` 与 `skills/roadbook/SKILL.md`（逐字节镜像）、`design/v6-design.md`（§4 个人档、§5 三落点、§6 宪法要点、§13 版本口径）、`design/playbook-contract.md` §7 归属表、`playbook/5-2-发布.md` 与 `playbook_EN/5-2-release.md`、根 `README.md`、插件动作闸 `plugin/roadbook-autoload/gate.js`（红线谓词 A1–A3 → A1–A2）与其 4 条用例、插件 README 红线表。
- **项目侧动作**：项目根 `AGENTS.md` 副本的 `规则版本：` 落后于 `2026-10-05.2`、或整行缺失 = 按「缺字段」处理——先同步副本再继续；**不许拿旧副本当授权**（旧副本里"打 tag 只能人做"那条已作废）。

## [0.5.0] - 2026-10-05

**硬规则唯一化 + DSH 强锁定 + Team 跟随官方行 + 动作闸**（用户裁决四项：真重写 / 优先保证 DSH / Team 与官方开关同步 / 强引用取动作闸）。

### 新能力

- **`roadbook-team` 子行（第五行）**：只在官方 Agent Teams 已挂载时存在——`cordis.patch.yml` 里这一行带 `disabled: !!js "!ctx.get('agentTeams')"`，官方行关掉 → 本行不加载 → **面板里设了也不生效**。RoadBook **不自建**「允许 / 不允许」Team 的开关：权威开关是官方那一行，本行只跟随（`policy: follow | off`）。装配入口 `plugin/roadbook-team/index.js` 提供 `roadbookTeam` 服务，消费方走**可选服务注入**（写进 `inject` 会让缺服务时整行被判「未运行」）。
- **`rules/rules.json` + `skills/roadbook/bin/rules.mjs`**：硬规则的机器可读索引（43 条，按**违反后果**分 A 不可委托 / B 机械判据 / C 门禁 / D 行为纪律）。`--audit` 检查标识唯一、分类与判定钩子匹配、落点与命令引用在磁盘上真实存在、触发词无冲突；反向对照在 `test/rules-audit.test.mjs`（**6 条"改坏副本必须判红"**，防止审计退化成恒真空函数）。
- **`doctor.ps1` 三态探测 DSH 运行前提**：有宿主环境变量 / 疑似裸 CLI / 都没有；`-RequireDsh` 把「缺宿主」升级为红。**读不到不许显示成通过**（沿用母版对 unknown 的一贯口径）。

### 破坏性变更（已装用户需要动作）

- **硬规则搬家**：唯一正文改为项目根 `AGENTS.md`（母版 `template/AGENTS.md`），带 `规则版本：` 行；`SKILL.md` 与 0-1 驱动卡只做**路由与门禁**，不再重复规则正文。**旧项目里的副本需要重新同步 `AGENTS.md`**——副本版本落后或整行缺失按「缺字段」处理，不许拿旧副本当授权。
- **第五个子行**：装主插件后插件面板会多出 `roadbook-team` 一行；官方 Agent Teams 未挂载时它是禁用态（设了也不生效）。
- 根 `package.json` 的 `files` 新增 `rules/`，并有对应运行时自检（漏进包 = 装出来的机制没有规则源）。
- **`git tag` 由人打**（agent 不打 tag）。

## [0.4.1] - 2026-10-05

**一次把 DSH 打不开的升级事故**：0.4.0 装上去、重启 DSH 之后弹「应用无法启动或已意外停止」，诊断报告里只有一行

```
web boot: 1 entry did not activate
roadbook: failed
```

这不是「图册标签页没出来」，是**整个应用起不来**。根因在客户端半，而且是一行看起来最无辜的代码。

### 根因

cordis 的 `ctx` 是**严格**的：读一个**没写进 `inject` 的服务**不是返回 `undefined`，而是直接 throw

```
cannot get property "locale" without inject
```

（`@deepseek-ai/cordis` 的 `ReflectService.handler.get`；服务只有在某个祖先 fiber 的 `inject` 快照里才可见，走到根 fiber 还找不到就抛。）

0.4.0 为了修「界面恒为中文」，把 `registerLocale(ctx)` 加成了 `apply()` 的**第一行**，而它读的 `ctx.locale` 并不在 `inject` 里（本行只声明了 `betterSidebar`）。于是：

1. `apply()` 抛错 → cordis 把本行 fiber 记成 `failed`（`Fiber._reload` 的 catch 里 `this._error = reason`，`get state()` 随即返回 3）；
2. 前端 boot 审计遍历所有 loader entry，把非 `active` 的收成一个 `Error` 上抛（`web boot: N entries did not activate`）；
3. 桌面壳收到 `bootFailed` → 报致命错误 → 「应用无法启动」。

**为什么 0.2.3 没事**：它只在**渲染期**读 locale，而渲染期的 ctx 是 better-sidebar 传进组件的 `props.ctx`（那个 ctx 自己 inject 过 locale），不是本插件自己的 ctx。**激活路径**上读没 inject 的服务，是 0.4.0 新引入的动作。

**为什么自测没抓到**：`test/client-contract.test.mjs` 的假 ctx 是普通对象，`ctx.locale` 永远不抛 —— 假环境比真环境宽松，缺陷全绿通过。

### 修复

- **`readService(ctx, name)`（`lib/client.js`）**：两段口径 —— ① 先试属性访问（inject 过的服务走这条，语义最正）；② 属性访问抛错或为空 → 退回 `ctx.get(name, false)`，即 cordis 官方「不带 inject 要求」的读法，服务不在时返回 `undefined` 而不抛。**永不抛错**。所有服务读取（`locale` × 4、`betterSidebar` × 2）一律改走它。
- **`apply()` 整段包 try/catch**（真正的接线挪进 `activate()`）：即使将来有人再往激活路径里加一句会抛的代码，最多丢一个标签页，不会再把 DSH 判死。客户端半没有这种权力。
- **测试环境向真环境看齐**：新增 `strictCordisCtx()`，照抄 cordis 的严格语义（未 inject 的服务读属性就抛，只有 `ctx.get` 能拿到），四条新用例钉住「读不到 → 降级 → 标签页照注册 → 绝不上抛」，另有一条直接钉 `readService` 的两段口径。**变异验证**：把 `readService` 退回属性直读 → 3 条新用例变红；把 `apply` 的 try/catch 摘掉 → 第 4 条变红。两条防线各自独立可验。

### 教训（写给下一次）

假环境比真环境宽松时，测试通过只证明「假环境里能跑」。这次的真环境规则（严格服务访问）是一句能被读到的错误信息，代价是整个 DSH 打不开。**任何插进 `apply()` 的代码，都必须假设它会决定应用能不能启动。**

## [0.4.0] - 2026-10-05

**一个静默失效的事实**：组合包此前**不会自动更新**（文档原话：卸载 + 重装），而升级路径上还有一层假绿——本机实测 `GET /dsh-market/api/v1/updates?name=roadbook` 返回 `updateAvailable:false`、`installedVersion:"0.2.3"`（回落到版本号 ⇒ 它的 `current` commit 是 null），**而同一时刻环境里装的确实是 0.2.3、远端 main 已经是 0.3.0**。根因在市场的 `lib/updates.js`：github 分支只从 spec 的 `#sha` 或 `readLockCommits()` 取当前 commit，而后者只认 codeload 压缩包形状；pnpm 对 `github:` 简写写的是 `resolution: {commit:…, repo:…, type: git}`。所以本轮**不转发任何人的结论**，自己判定。

### 新增能力

- **主行自动更新（`lib/update.js` + `lib/index.js`）**：开机查一次上游版本（`repository` 推导清单地址，默认 `main` 分支），五态判定 `up-to-date / update-available / ahead / dev / unknown`；**读不到一律 `unknown`**，绝不显示成「已是最新」。默认 `update: notify` 只提示；`update: auto` 才自动替换；`update: off` 整体关闭。
- **命令探测阶梯（有证据、不猜）**：`updateCommand` 配置 → 本进程 CLI 入口（`process.argv[1]` 命中 `bin.js`/`cli.js`，用 `process.execPath` 重调，env 补 `ELECTRON_RUN_AS_NODE=1`）→ `$DSH_HOME/dsh-runtimes/*` 自带运行时的 node + `pnpm.mjs`（本机实测 `dsh` 与 `pnpm` **都不在 PATH**，而 `…/dependencies/node/bin/node.exe` + `…/pnpm/bin/pnpm.mjs --version` = `11.7.0` 可用）→ PATH 上的 `dsh`。全部不可用 ⇒ 拒绝执行（424）并逐条给出跳过理由，绝不随便挑一条把 profile 装坏。
- **三道闸**：单飞锁文件 `<profile>/.roadbook-update.lock`（30 分钟视为陈旧可接管）+ 有 agent 在跑就拒绝（`agents.list()` 里 `status === 'running'`，判据与 dshmarket 一致）+ 超时 300s（先 SIGTERM，宽限 10s 再 SIGKILL），输出保留尾巴。
- **同源守卫**：`POST /roadbook/update/apply` 会真的执行安装命令，所以 `Host` 必须 loopback（`127.0.0.1` / `localhost` / `[::1]`）、`sec-fetch-site: cross-site` 一律拒、`Origin` 出现时必须与 `Host` 同 authority——这正是 DNS rebinding 页面伪造不了的那一个头。
- **客户端更新条（`lib/client.js`）**：图册标签页里显示「v当前 → v上游」+［更新］，跑一次安装并轮询到终态，成功提示「重启 DSH 后生效」；宿主路由不在（旧版本 / `webServer` 服务没起来）时**整条不渲染**，不留死按钮。
- **观测**：`<os.tmpdir()>/roadbook-update.jsonl`（超 2 MiB 轮转 `.1`），事件 `loaded` / `check` / `skip` / `apply-start` / `apply-refused` / `apply-finish` / `route`；只写版本号、commit、命令标签、退出码与输出尾巴，不写用户消息、不写环境变量。
- **两条本机路由**：`GET /roadbook/update/status[?force=1]`、`POST /roadbook/update/apply`（走可选服务 `ctx.inject(['webServer'])`，服务缺席只让路由不出现）。

### 配置（主行 `roadbook`）

| 键 | 默认 | 说明 |
| :--- | :--- | :--- |
| `update` | `notify` | `off` / `notify`（只提示）/ `auto`（自动替换） |
| `updateIntervalHours` | `24` | 两次自动检查的最小间隔（跨重启靠观测文件里的上一条 `check` 计时） |
| `updateTimeoutMs` | `8000` | 单次远端清单读取超时 |
| `updateApplyTimeoutMs` | `300000` | 安装命令超时 |
| `updateUrl` | `""` | 空 = 从本包 `repository` 推导 `raw.githubusercontent.com/<owner>/<repo>/main/package.json` |
| `updateCommand` | `""` | 空 = 走探测阶梯；填了就按模板跑（支持 `{target}` / `{package}` / `{profile}`，也是端到端演练的打桩入口） |
| `updateReport` / `updateReportPath` / `updateReportMaxBytes` | `true` / `""` / `2 MiB` | 观测开关、路径与轮转上限 |

### 代价与脆弱面（明说）

自己跑安装命令**没有** dshmarket 的并发锁、兼容性验证与自动回滚；失败时的兜底是「保留命令输出 + 提示按原来源重装」，不承诺回滚。默认 `notify` 意味着每次开机有一次对 `raw.githubusercontent.com` 的 GET（除 URL 外不外发任何信息），断网时如实退化 `unknown`。替换后**必须重启 DSH**（桌面宿主持有重启权，插件不自己重启）。

**本机实测的 TLS 坑（已按证据处理）**：这台机器上有做 TLS 拦截的中间盒，它的根 CA 在 Windows 系统信任库里、**不在 Node 自带的 CA 清单里** —— `fetch('https://raw.githubusercontent.com/…')` 报 `fetch failed / unable to verify the first certificate`，`curl.exe` 同样 000，而 `node --use-system-ca` 实测 200。插件跑在宿主进程里、改不了启动参数，所以清单读取做成**两级传输**：先 `fetch`，只有证书类错误才用 `node:https` + `tls.getCACertificates('system')` 重试一次（DNS 不通、超时、代理拒连都不白跑第二次）。实测：`transport = system-ca`、142 ms、`installed 0.2.3 → latest 0.3.0` = `update-available`，同版本则 `up-to-date`。**安装命令那一侧不需要同样处理**（实测 `pnpm view dsh-context version` → `0.64.0`、exit 0，注册表与 git 通道都正常）。

### 提交前独立对抗式复核（四路，只读；确认后由写者落地）

复核不是走过场：这一轮**自己写的东西被自己人打穿了**，共修掉 2 个 P1 与 8 处 P2。修完每一条都补了会红的用例（变异测试：把修法还原，只有新加的那几条变红）。

**P1①：超时根本不终结安装器，而且会把更新永久挂住。** Windows 上 `child.kill()` 只是 `TerminateProcess` 直接子进程 —— 带 shell 的候选（模板命令、`dsh.cmd`）的直接子进程是 `cmd.exe`，真安装器是它的**孙进程**，继续改 `node_modules`；更要命的是孙进程握着继承来的 stdout 管道，`close` 事件**永远不来**，而 `state.applying` 只在 `settle()` 里清。实测（真实 spawn，`applyTimeoutMs=5000`）：SIGTERM 后 8s、SIGKILL 后 3s 安装器与孙进程都活着、`operation.state` 还是 `running`、`timedOut=false`、观测里只有 `apply-start` 没有 `apply-finish`、锁还在，之后每一次更新都 409（删锁文件也没用，因为 `applying` 闸在 `acquireLock` 之前），只有重启宿主才能恢复。修法：Windows 上改走 `taskkill /PID <pid> /T /F` 收整棵树；**杀完进程树再等一小段就按超时结账**，不再把闸与锁挂在 `close` 上；另加两道自愈（`applying` 超预算按陈旧放行、`dispose()` 复位闸）。

**P1②：宿主真实的 `idle` 被渲染成「检查失败：{reason}」。** 冷却期内跳过一次检查时宿主如实报 `state:"idle"`、`reason:""`，而客户端 `updateStripState` 只认五态，`idle` 掉进 unknown 兜底 ⇒ 警告色 + 把 `{reason}` 占位符原样丢到界面上，而且一挂就是 24 小时（直到用户手动检查）。这正是本模块口口声声拒绝的「假红」。修法：`idle` 单列一档（muted + 仍给「检查」入口），空 reason 由渲染层兜底成「未知原因」。

**P2 批次**：① 观测文件轮转失败时把字节计数清零 ⇒ 上限形同虚设（把 `.1` 做成目录让轮转必失败，实测涨到上限的 25.9 倍），改为「轮转不了就放弃这一行」；② 第二级传输 `httpsGetText` 没有总时限（`timeout` 只是 socket 空闲超时：慢速滴答的服务器实测 500ms 配置跑成 3094ms）、不跟 3xx（`fetch` 跟，于是「专为 TLS 拦截机器准备的那一级」反而更弱）、响应体无上限 —— 三条全部补齐；③ 冷却时间只认观测文件，`updateReport:false` 时等于关掉冷却（实测 5 次轮询打 5 次远端，而客户端在更新进行中就是每秒轮询），改为内存与文件取较大者；④ 锁没有所有权标记，`dispose()` 会删掉别人的锁 ⇒ 单飞失效，改为只删自己的；⑤ 陈旧锁阈值固定 30 分钟，而安装超时可配到 60 分钟 ⇒ 长安装会被接管，改为「超时 + 两段宽限 + 1 分钟」取大；⑥ `whichInPath` 只判存在 ⇒ PATH 里一个同名**目录**会盖掉真正的 `dsh.cmd`，改为必须是文件；⑦ shell 模板里 target 未过滤 ⇒ profile 依赖串里一个 `"` 就能撑破引号并用 `&` 执行任意命令（实测能落地文件；输入面仅限本机 profile 的 `package.json`，属本地输入，但仍是命令注入面），改为 target 过字符 allowlist，不过就跳过该候选；⑧ 观测文件把整行命令与安装器输出原样落盘 ⇒ 配置里嵌的注册表 token 会明文留档，改为落盘前脱敏（`--token=***`）并按 0600 创建。

**同时修掉两处「文档说有、实际不触发」**：① 判定第 ④ 步（版本号相同、提交不同也算有更新）在生产里**永远不触发** —— `runCheck` 传了 `installedCommit` 却没人给 `latestCommit`（变异测试：删掉 `installedCommit` 那一行，33 条用例全绿）。现在版本号相同时才去问一次上游 HEAD 提交（`api.github.com/repos/<repo>/commits/<branch>`），`commitCheck` 三态 `skipped/unknown/same/differ` 写进状态与观测，问不到就如实记 `unknown` 而不假装对过账；② 两个比较器的边角：预发布标识符原来按整串比（`1.0.0-rc.10 < 1.0.0-rc.9`，与 semver 相反，实测 147456 对里 1260 对不一致）改为逐标识符比；`installKindOf('C:\\repo')` 原来判成 registry（会被 `roadbook@latest` 盖掉开发副本）改为 local，`workspace:` 同理。

另外清掉两处测试卫生问题：`主行 apply()` 用例不传 `updateReportPath` ⇒ 跑一次测试就往机器全局观测文件追加假记录（真机文件里能看见）；一处 `assert.ok(reportDir)` 恒真。

### 提交前自查挖出的一处 P1（假绿：候选表看着全，有一条恒死）

**PATH 候选在 Windows 上是死候选**：探测阶梯的 ④ 原本写成 `dsh.cmd` + `shell:false`。Node ≥18.20（CVE-2024-27980 之后）**拒绝对 `.cmd`/`.bat` 用 `shell:false`** —— 本机实测三种口径一致：① 临时 `.cmd` 探针 `spawn(x.cmd, [], {shell:false})` → `THREW EINVAL`，`shell:true` → `exit=0 stdout="PROBE-OK"`；② 新用例走真实 spawn 的 `spawn EINVAL`；③ 变异测试（把候选还原成旧形状）后新加的两条用例**只有它们变红**，其余 31 条照旧全绿。后果：`dsh` 只出现在 PATH 的机器上，点「更新」永远得到一条 `spawn EINVAL`，而候选表与 424 文案都写着「有可用安装命令」——正是本仓库定义的那类假绿。修法：Windows 上这条候选改为**整行模板 + `shell:true` + 空 args**（带 shell 就不能再传 args，那是 DEP0190 不转义；路径带引号，因为本机 DSH 就装在 `D:\AISI\Deepseek harness\…` 这种含空格目录里），非 Windows 保持 argv + `shell:false`。同批把查找名从 `dsh.cmd` 改回 `dsh`——PATHEXT 后缀表本来就负责补 `.cmd`/`.exe`，写死扩展名会去试 `dsh.cmd.cmd` 这类不存在的名字。

**同一轮实测到的桌面宿主事实（写进注释，免得下一个人再猜）**：GUI 宿主的 `process.argv[1]` 是 `…\@deepseek-ai\dsh-desktop-host\lib\index.js`（`Win32_Process.CommandLine` 读到的原话），而真 CLI 入口是同目录的 `cli.js`（`dsh.cmd` 里写死的那个）⇒ 阶梯的 ② 在桌面上**永远命中不了**，桌面由 ③ 承担。③ 已按真实形状端到端跑通：`<内置 node> <内置 pnpm.mjs> add github:Aparencia/RoadBook` 在一次性空 profile 里 `+ roadbook 0.3.0`、20.4s、exit 0（同一时刻工作树里的 0.4.0 尚未推送，所以拉到的是远端 main 的 0.3.0 —— 这条同时证明「安装路径真的能从上游取到新版本」）。

### 测试与验收

- `node --test "test/*.test.mjs"`：**83/83**（原 40；`test/update.test.mjs` 38 例 + `client-contract` 增 5 例，`umbrella-contract` 的 import 闭包断言与 `packaging` 的运行时清单同步到 `lib/update.js`）。其中一条是**真实 spawn** 的端到端用例（起真的 `cmd.exe` 跑一个临时 `dsh.cmd`，断言退出码 0 且 stdout 被接住）——打桩的用例会把这个 P1 原样放过去，所以这条刻意不注入 `spawn`；另有一条专测「子进程永远不发 `close`」的看门狗（宽限期用注入的毫秒值跑，不然一条用例要 20 秒）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"` 与 `powershell -NoProfile -File _qc/check.ps1` 见本次提交的粘贴输出。
- 版本口径：根 `package.json` = `0.4.0` = `lib/client.js` 的 `PLUGIN_VERSION`（`client-contract` 逐字核对）。本次升版按「加能力 → 次版本」规则；`git tag` 由人打。

## [0.3.0] - 2026-10-05

**一个 P0 级事实**：插件按文档推荐的方式（Git 地址装仓库根）装出来的是**空壳**。`files` 白名单只有 `lib/skills/plugin/...`，而注入给模型的 `skills/roadbook/SKILL.md` 第一条就要求读 `playbook_EN/0-1-driver-card.md` —— 实测 `npm pack` 出来的 tarball 88 项里 `playbook/`、`playbook_EN/`、`template/` 各 0 项，本机 github 安装副本 `…/profiles/desktop/node_modules/roadbook` 里这三个目录也全缺（版本 0.2.3，就是最新形态），而本机 `~/.dsh/skills/` 下没有 roadbook clone 兜底。本轮把这个洞连同同源的三个缺陷一起修掉。

### 修掉的缺陷

- **打包白名单漏掉流程卡本体**（P0）：根 `package.json` 的 `files` 补 `playbook`、`playbook_EN`、`template`。判据固化为「**运行时引用的路径 ⊆ 发布白名单**」，由新增的 `test/packaging.test.mjs` 与 `_qc/check.ps1` 双份拦截。
- **`roadbook-autoload` 单独打包必然「未运行」**（P0，0.2.1 修过的症状复发）：`plugin/roadbook-autoload/package.json` 的 `files` 漏了 `host-fallback.js`，而入口**静态 import** 它。实测 `npm pack` 解包后 8 项无该文件、`import('./index.js')` 报 `ERR_MODULE_NOT_FOUND`。补进白名单；同时主行就绪自检改为**按入口模块的静态相对 import 闭包自动推导**（见下），两个机制不再可能同时失明。
- **图册「预览」把图纸截断 16% 且静默**（P0）：旧路径把整份 HTML 经 `fs.read` 搬进 `srcDoc`，而 `fs.read` 的 `readLimit` 默认 **512 KB**，超限只返回前一段并置 `truncated: true` —— 客户端从不读这个字段。实测五类图纸产物 **608.4–611.7 KB**，也就是**每一次预览都只显示 83.9%**（丢约 100 KB）。改为 iframe 直接吃宿主自带预览路由 `/sidebar/html/<sessionId>/<绝对路径>`（服务端已带 `content-security-policy: sandbox …`，mediaLimit 20 MB）：不截断、少一次整文件 JSON 往返、沙箱从「前端属性」升级为「服务端强制」。
- **自进化 B 环的指纹是死的**：SKILL.md 指纹按路径永久缓存，技能中途更新后 `skillDigest` 对账永远看不到变化。缓存键改为 `mtimeMs + size`；取证拿不到 stat 时不缓存（「先缺后补」的 SKILL.md 不会被记成永久空值）。
- **观测文件是隐私与体积双重敞口**：`<os.tmpdir()>/roadbook-autoload.jsonl` 无限追加、跨会话、永不清理，且把**用户消息原文片段**（`text.slice(0, 80)`）写进共享临时目录。现在只写 `textDigest`（sha256 前 8 位）与 `textLength`，原文不出本进程；新增 `reportMaxBytes`（默认 2 MiB），超限轮转到 `<reportPath>.1`。
- **三个常驻集合只增不减**：`injectedSessions` / `reportedSkips` / `gitRoots` 全部改为有界 FIFO（512 条），长驻宿主不再慢性泄漏。
- **文档自相矛盾**：`plugin/roadbook-autoload/README.md` 仍在说「整仓装不了、必须用 `#path:` 指到子目录」——那是 0.2.0 之前的实情，与根 README、atlas README 的「装一个主插件、子插件不单独安装」直接冲突。已改。
- **环境**：本机 git 因仓库「可疑所有权」拒绝工作，`template/security.ps1` 因此判「不是 git 工作树」→ `_qc/check.ps1` 恒红一项。已加 `git config --global --add safe.directory D:/Code/RoadBook`（git 自己提示的标准修法）。

### 对抗式复核后补修的七处（只读复核独立于写者，复核确认后由写者落地）

- **自进化 C 环在真机上是零产出的死能力**（严重）：`trigger.js` 读 `session.events`，而真实 `Session` **没有这个属性**（内部日志是私有字段 `log`，公开读法只有 `snapshotEvents()` / `eventAt()` / `ownEvents()`）⇒ 空转观测恒 `unknown`、`alreadyInjected` 恒 `false`（会话恢复时的日志去重兜底形同不存在）。改用 `snapshotEvents()`，并把 12 条用例的假 session 从 `{ events: [...] }` 改成真实形状——它们原先在一个真机上不存在的形状上全绿。
- **「先比字节数」是死代码**（中）：宿主 `fs.read` 的**文本分支不回 `size`**（`FsTextResult` 只有 `content`/`truncated`，`size` 只在 `FsBinaryResult`），读 `value.size` 恒 `null`；判据只剩 sha256，而 `crypto.subtle` 只在安全上下文存在 ⇒ 非 localhost 的 http 打开界面时「规格已改」徽标**静默永不出现**。字节数改为客户端按 UTF-8 自行折算，判据改成 `changed`/`same`/`unknown` 三态：算不出哈希就显示「规格无法比对」，不装作没变。
- **就绪自检的剥注释会吞掉真 import**（中）：字符串或行注释里的一个 `/*` 会一路吞到下一个 `*/`（含真 import）⇒ 方向是**漏报缺失文件**。改为单遍字符状态机，锚点放宽以覆盖同行 import。
- **门禁自己漏检了一个测试文件**（中）：`_qc/check.ps1` 逐个点名测试文件，`banner.test.mjs` 只在 CI 里跑得到 ⇒ 本地全绿不算数。改为跑整套件 glob；`check.ps1` 自身上限 650 → 670（同步 design §8）。
- **测试往生产观测文件写垃圾**（中）：不传 `reportPath` 的用例真往 `<os.tmpdir()>/roadbook-autoload.jsonl` 追加假会话，而 README 教用户看这个文件判断注入是否发生。改为把 `TEMP` 指向临时目录；实测跑完整套件该文件一字未长。
- **常驻微提示可能永远消失**（低-中）：一次性 `ctx.get('systemPrompt')` 读不到就永久 `unavailable`，分不清「宿主没有」与「还没装配好」。改走作用域注入 `ctx.inject(['systemPrompt'], …)`；`export const inject` 不变，观测态加 `deferred`。
- **打包失败原因采到却不显示**（低）：宿主对每个路径做 stat，一个读不到整单失败，而列表快照可能是 15 秒前的旧数据；现在把 `zip.error` 渲染出来。
- **另堵一处假绿**：`test/packaging.test.mjs` 的 npm 匹配器原按 basename 任意深度认「npm 永远包含」，而 npm 只对**包根**无条件包含 README/LICENSE/CHANGELOG ⇒ `template/README.md` 这类路径会被判成「反正会带上」，替真缺陷放行。已收紧为仅包根匹配并加断言。

### 新增能力

- **常驻微提示（`banner`，默认开）**：用宿主 `ctx.systemPrompt.section()` 注册一段 195 字的铁律摘要（order 700，依据是宿主 `SECTION_ORDERS` 里 `PLAN_POLICY=500` / `TEAM_POLICY=600` / `PTC_ONLY=800`）。它解决的是设计文档自己承认的洞——关键词命中率只有五到八成，**没命中的会话此前整轮没有任何流程约束**。注册走**可选服务**，且取服务必须走**作用域注入** `ctx.inject(['systemPrompt'], …)`（`ctx.get` 读到 `undefined` 分不清「宿主没这个服务」与「服务还没起来」，读一次就写死 `unavailable` 会让微提示在服务晚起的宿主上永远消失），但**绝不写进 `export const inject`**；读不到只让本段不出现、整行插件照常工作；只在 git 项目里出现（`context.agent` 由宿主 `assembleContextFor(agent, signal)` 注入）。`banner: false` 关闭。
- **图册**：预览走宿主 HTML 路由（见上）；**新图纸自动出现**（15 秒一次的 `fs.tree` 名称指纹轮询，页面隐藏时不发请求，指纹变了才重读元信息）；**「规格已改」徽标**（回执里存着规格的 `sha256` 与 `bytes`，先比字节数、字节数相同再比 sha256，规格比图纸新就提示重渲染；字节数由客户端按 UTF-8 自行折算——宿主 `fs.read` 的文本分支不回 `size`，照抄 `value.size` 会让这条判据永远是死代码；`crypto.subtle` 缺席时显示「规格无法比对」，不静默当作没变）；**「打包导出」**（宿主 `archive.build` + `archive.status` 轮询，一次拿全部图纸 + 规格 + 回执 zip）；元信息读取从**最多 40 次串行 HTTP** 改为有界并发（6），被截断的元信息在界面上明说；语言改走 `ctx.locale.register/bind` 并订阅变化（旧代码读的 `ctx.locale.current` 在真机上不存在，**界面恒为中文**）；预览底色改用主题令牌（不再硬编码白底）；空态给出可复制的提示词。
- **自进化 C 环（空转观测）补上**：设计文档 §15 当年写「暂不做（避免为观测再挂钩子）」——其实不需要新钩子：`agent/pre-step` 本来就挂着（注入走的就是它），缺的只是一个判据 —— 但**事件来源**必须用 `session.snapshotEvents()`：真实 `Session` 没有 `events` 属性（内部日志是私有字段 `log`，公开读法只有 `snapshotEvents()` / `eventAt()` / `ownEvents()`）。第一版读的是 `session.events`，于是这一环在真机上恒判 `unknown`、纯属零产出，`alreadyInjected` 的日志兜底也一起失效。现在注入之后每步顺路看一眼：读到 `playbook*/**.md` 记 `{"event":"card-read"}`，连续 4 步一路没有痕迹记 `{"event":"idle"}`（疑似空转）。三条边界都不猜：注入正文自带的 `playbook_EN/` **不算**痕迹（只扫最后一次注入之后的事件）、读不到会话日志判 `unknown`、事件多到超出扫描窗口也判 `unknown`；`report: false` 时整个观察不做。
- **工程**：新增 `.github/workflows/ci.yml`（口径与 `_qc/check.ps1` 完全一致，禁 `continue-on-error`——设计文档 §16 第 6 行早就这么要求，仓库此前没有 CI）；`.gitignore` 补 `.dsh-code-index/`（DSH 代码索引的本地缓存，未忽略会直接破坏 5-1 卡的「工作树必须干净」判据）。
- **就绪自检换代**：`missingBundledFiles()` 从手写清单改为「显式运行时清单 + 三个宿主入口模块的静态相对 import 闭包」。起因是事故复盘——手写清单与打包白名单**同时**漏了 `host-fallback.js`，两个本该互相兜底的机制一起失明。闭包扫描先剥注释再匹配（本文件注释里就写着 `import x from './a.js'` 这种例子，不剥会报一个不存在的文件：假红比不检查更坏），且支持多行 import。

### 推送前自检发现的一处（母版自身，补记）

- **母版 `.gitignore` 从未挡 `.env` / `*.pem` / `*.key`**：设计 §14 第 5 行把「首推/推送前用 `git check-ignore -v .env` 确认敏感文件确实被挡住」写成推送前置动作，照这条在推送前跑了一次自检——在母版仓库自己身上**一条都不命中**（`check-ignore` 退出码 1），而 `template/.gitignore` 早就挡着，属口径不齐。已按 template 同口径补齐四条规则，并给 `_qc/check.ps1` 加断言防回归。注意 `security.ps1` 只能扫工作树里**已存在**的密钥，挡不住「新建的 `.env` 被 `git add` 带进历史」——密钥推出去不可逆，这属于「文档说要挡、实际没挡」的假绿，与上面七处同一类。

### 测试与验收

- `node --test "test/*.test.mjs"`：**40/40**（`client-contract` 新增 6 例钉住预览 URL 算法/语言快照字段/目录指纹/规格过期判定/双语表注册，后又新增 3 例把「字节数走生产路径折算」「UTF-8 折算与 TextEncoder 逐个一致」「三态判据」钉死；`umbrella-contract` 新增 3 例钉住 import 闭包与 YAML 表达式同口径，后又新增 2 例钉住剥注释的假绿与假红两个方向；新增 `packaging.test.mjs` 6 例）。
- `node --test "plugin/roadbook-autoload/test/*.test.mjs"`：**66/66**（新增 `banner.test.mjs` 7 例：常驻提示的注册形状/门控/关闭三态；`trigger.test.mjs` 新增 7 例钉住空转判据的三条边界；`index.test.mjs` 新增 5 例钉住空转观测只记账、不改行为；复核后又把这些用例的假 session 改成真实 `snapshotEvents()` 形状，并补上「回扫只在窗口 + 1 条内、结论与全量一致」等例）。
- `_qc/check.ps1`：**316 项全绿、退出码 0**（新增发布白名单、CI、`.gitignore` 三组断言——`.gitignore` 那组同时管 `.dsh-code-index/` 与密钥三条；复核后把「逐个点名测试文件」改为「跑整套件 glob」并补 `banner.test.mjs` 入清单；BOM 与 PS 5.1 解析均 [OK]）。
- 版本升 `0.3.0`（加能力 → 次版本；三处事实源同步，见下）。

## [0.2.3] - 2026-10-04

**客户端半把 DSH 启动搞挂的缺陷**（用户实机报「应用无法启动或已意外停止 / web boot: 1 entry did not activate / roadbook: failed」）：DSH 的 web boot 把「任一客户端条目未激活」判成致命错误并拒绝启动（客户端半 `eM()` 收集所有非 active 条目后直接 `throw`），而 better-sidebar 的 `registerTab` 对重复 id 是**直接 throw**（`lib/client-registry.js`：`if (tabs.has(descriptor.id)) throw new Error('... already registered')`）—— 于是「同一 bundle 被 Loader 实例化两次」或「热重载后上一代注册仍在注册表里」都会让 roadbook 从「一个标签页没出来」升级成「整个应用起不来」。客户端半没有这种权力，三处收口：① 注册前先查 `service.getTabs()` 有没有同 id、以及模块级 `registered` 标记（本页面已注册）→ 命中即跳过；② `ctx.effect(register)` 包 try/catch，失败只留一条警告（`ctx.logger.warn`，退化为 `console.warn`），**绝不上抛**；③ effect 撤销时把标记复位，热更新后仍能重新注册。
**测试**：`test/client-contract.test.mjs` 新增 4 例（重复 id 抛错不向外抛 / 同页面 apply 两次只注册一次 / 服务里已有同 id 则跳过不调用 registerTab / disposer 撤销后能重新注册）。

## [0.2.2] - 2026-10-04

**装出来的副本不再误报缺件**（0.2.1 装机验证时发现）：主行的就绪自检把根 `SKILL.md` 也算成「随包文件」，而它**不在** `package.json` 的 `files` 白名单里 —— git / npm 安装（插件面板「Git 地址」走的就是这条路）只分发白名单内的文件，于是每一份装出来的副本都会打一条
`roadbook v0.2.1: 缺少随包文件（相关能力会不可用）：SKILL.md` 并**提前 return**，把真正的 `ready` 日志吞掉。运行时要的是 `skills/roadbook/SKILL.md`（镜像，随 `skills/` 分发）—— 自检列表改为只列运行时真正需要的文件。

## [0.2.1] - 2026-10-04

**两个面板问题**（用户看插件面板后报的）——都修在结构上，不靠修饰显示：

- **子行改为平铺**：0.2.0 用一条 `group` 容器行 `roadbook-bundle` 挂四个子行。容器行自己**没有 fiber**，宿主的 `readPluginInventory` 又 `if (entry.options.group) continue` 跳过 group 行 —— 面板只能照 `cordis.patch.yml` 的字面把它显示成「已关闭」，看上去像整个主插件被关掉。现在 `- insert:` 下平铺四条顶层行；`lib/bundle.js` 与 `exports` 的 `./bundle` 一并删除。代价明说：**没有「关一行连停四行」的祖先门**了，四行各自开关。
- **`roadbook-autoload` 从「未运行」修活**：入口静态 import 三个宿主包（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/schemastery`），而插件通常按 `link:` / 本地绝对路径安装 —— 宿主的解析拦截层只对「manifest 里 `peerDependencies` 声明过该名字」的链接根生效，于是这三个 import 解析失败；cordis loader 的 `_init()` 对 import 失败**只写一条 `logger.error` 然后 return**（`entry.fiber` 不赋值），面板上就只剩「未运行」。现在三管齐下：① 宿主包改**守卫式动态 import** + 新增 `host-fallback.js`（`createUserMessage` / `isUserInvocable` / `renderSkillContent` 的本地等价实现），解析不到时降级运行，并把失败原因写进日志与观测文件；② 三个宿主包补进根 `package.json` 的 `peerDependencies`（`optional: true`），让宿主在 `link:` 安装下也做拦截注入；③ `apply()` 往观测文件写一行 `{"event":"loaded"}` 就绪回执 —— 面板之外的「本行真的跑起来了」自证（默认 `<tmpdir>/roadbook-autoload.jsonl`）。
- **测试**：根 `test/` 16 项（`umbrella-contract.test.mjs` 换平铺断言、并**真的 import** autoload 子行）、`plugin/roadbook-autoload/test/` 37 项（新增 `host-fallback.test.mjs` 3 项 + 就绪回执 1 项）；`_qc/check.ps1` 308 项全绿。

## [0.2.0] - 2026-10-04

**主插件化**：仓库根成为 DSH 组合包 `roadbook`；原来两个独立插件变成它的子插件，每个子行仍可在插件面板里单独开关。

- **主插件（仓库根）**：根 `package.json`（`dsh.bundle.patch` + `dsh.client` + `exports` 的 `./bundle`、`./autoload`、`./atlas`）与根 `cordis.patch.yml` —— 一条 group 行 `roadbook-bundle` 挂四个子行：`roadbook`（主行，`lib/index.js`：版本号 + 随包文件就绪自检）、`roadbook-skills`（`@deepseek-ai/dsh-skill-filesystem`，`bundledSkillDir` 按 `roadbook/package.json` 的 npm 身份解析到包内 `skills/`）、`roadbook-autoload`（模块 `roadbook/autoload`）、`roadbook-atlas`（模块 `roadbook/atlas`）。group 行的 `disabled` 读主行自身的开关 ⇒ 关主行 = 四个子行一起停。
- **技能上移**：`skills/roadbook/SKILL.md`（根 `SKILL.md` 的逐字节镜像，`test/skill-mirror.test.mjs` 守卫）与 `skills/roadbook-atlas/`（原 `plugin/roadbook-atlas/skills/`）—— 一个 provider 行同时分发两个技能。
- **客户端半上移**：`lib/client.js`（原 `plugin/roadbook-atlas/lib/client.js`），ModuleLoader id 改 `roadbook`，标签页 id 改 `roadbook:gallery`，页脚显示伞包版本。
- **子插件半**：`plugin/roadbook-autoload/` 保持可单独安装（自带组合包 patch；与主插件同时装时只留一行）；`plugin/roadbook-atlas/` 变成纯宿主半（组合包 patch 撤下、技能与客户端半上移），**不再单独安装**。
- **测试**：根 `test/` 三个文件 9 项（从 `plugin/roadbook-atlas/test/` 上移并改相对路径）。

## [0.1.0] - 2026-10-04

首个可安装形态（提交 `bbf2fe4`；此前只存在于本地挂载、未提交的状态）。当时是独立插件 `roadbook-atlas`：一条 skill provider 行 + 手写 ModuleLoader 客户端半注册 `roadbook-atlas:gallery`「图册」标签页 + `skills/roadbook-atlas/` 下的 CLI 与 vendored 渲染器（`tt-a1i/archify` v2.14.0，MIT）。

- **skill + CLI**：`bin/atlas.mjs` 提供 `render / validate / list / new / guide / doctor`，退出码 0 成功、1 渲染或环境失败、2 用法错误；渲染成功才写 `docs/diagrams/<slug>.receipt.json`（schema `roadbook-atlas/receipt@1`，规格与产物双 SHA-256 + 校验计数）。
- **渲染器**：vendored 到 `skills/roadbook-atlas/vendor/archify/`，只 spawn 不 import（上游 CLI 零 export），来源与逐文件哈希见 `VENDOR-PROVENANCE.md`。
