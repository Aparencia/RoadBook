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
`git tag`（**由人打**，agent 不打 tag）。改完从仓库根跑：

```bash
node --test "test/*.test.mjs" && node --test "plugin/roadbook-autoload/test/*.test.mjs"
```

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
