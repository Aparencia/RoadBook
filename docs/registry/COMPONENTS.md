# COMPONENTS · 组件注册表（界面 ↔ 代码 的地图）
> 最近核对 —（骨架未核对；核对后填 <日期> @ <提交哈希>）
> 用法：agent 改 UI 前先查这张表定位；改完同批回写（5-1 归档卡会查）。**新建文件不登记 = 孤儿（5-1 卡第 ⑧ 查会报）**。
> **两节分工（2026-10-07 定，解 TD-001）**：①「**文件登记**」节管 **D13 的登记义务**——每新增一个文件就往里加一行（**四列：路径 / 用途 / 归属批次 / 可访问性**）；②「**界面组件**」节管**给人定位 UI**（"人话标识"那一列在这里，页面分节）。**同一份文件只进它该进的那一节**：纯逻辑/脚本/文档登记进 ①，界面元素进 ②。
> 分节规则（界面组件节）：每个页面一节，标题写「页面名 路由」（如 `## 统计页 /stats`）；单节 ≤30 行，超了说明该拆组件了。

## 文件登记（D13：路径 / 用途 / 归属批次）

| 路径 | 用途 | 归属批次 | 可访问性 |
| :-- | :-- | :-- | :-- |
| `AGENTS.md`（根） | 硬规则唯一正文（A/B/C/D 四类） | 1-3 接入 · 规则版本随母版 | `N/A（纯文本）` |
| `STATE.md`（根） | 状态仪表盘（唯一事实源；只留一行摘要，单行 ≤500 字符） | 1-3 接入 | `N/A（纯文本）` |
| `RISK.md`（根） | 风险与未决问题的**明细外置层**（证据生命周期链：摘要 → 本文件 → 入库 → `feedback/`；台账 #3 / #23） | 批 6（台账 #3 / #23） | `N/A（纯文本）` |
| `check.ps1` | 项目自检门禁（"完成"的唯一定义） | 1-2 / 1-3 生成 | `N/A（脚本）` |
| `doctor.ps1` | 环境自检（`.tool-versions` 逐行比对 + DSH 在位） | 1-2 / 1-3 生成 | `N/A（脚本）` |
| `gate.ps1` | 提交前拦截（`-Anchor` 必填；文档义务按 `DOC_MAP.json` 判） | 1-2 / 1-3 生成 | `N/A（脚本）` |
| `orphans.ps1` | 孤儿/幽灵/文档七查（只报不拦） | 1-2 / 1-3 生成 | `N/A（脚本）` |
| `security.ps1` | 安全终检（红 0 / 黄 N；退出码 0 = 无红项） | 1-2 / 1-3 生成 | `N/A（脚本）` |
| `scripts/envcheck.ps1` | 只读环境读取器（ACL / 完整性标签 / 进程对照；只读不改） | 批 0（2026-10-07） | `N/A（脚本）` |
| `design/vnext-2026-10-07.md` | v0.10.0 升级方案与 63 条修复点台账（母版私有，不进包） | 批 0（2026-10-07） | `N/A（纯文本）` |
| `lib/session.js` | 会话生命周期读数纯逻辑（预算/三提醒判据） | 批 2（规划） | `N/A（纯函数）` |
| `lib/update.js` | 更新检查与应用的**公开入口**（barrel：只再导出，调用方无需改） | 批 1（2026-10-07 D14 拆分；本行是 barrel 父件，按判据不带拆分标记） | `N/A（宿主半）` |
| `lib/update-constants.js` | 更新模块共享常量（模式/间隔/超时/重定向与体积上限/安全正则） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/update-version.js` | 版本号解析与比较（纯函数，无副作用） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（纯函数）` |
| `lib/update-repo.js` | 仓库身份推导（slug / manifest / lock 解析 / 上游提交 API） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/update-transport.js` | 两级传输（fetch → https+系统 CA）、本机请求守卫、错误文案 | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/update-plan.js` | 更新判定与检查编排（`decideUpdate` / `checkForUpdate` / 配置归一） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/update-host.js` | 宿主安装面探测（profile / lock / PATH 候选 / 命令模板 / 升级对账） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/update-report.js` | 观测文件读数（尾部读取 / 最近检查事件 / 最近应用目标 / 默认报告路径） | 批 1（2026-10-07 D14 拆分自 lib/update.js） | `N/A（宿主半）` |
| `lib/selfcheck.js` | 「随包文件全在」自检的纯逻辑（注释剥离状态机 + 相对 import 闭包 + 缺失清单） | 批 1（2026-10-07 D14 拆分自 lib/index.js） | `N/A（纯函数）` |
| `lib/update-watch.js` | 更新服务的**读侧**（状态读取 / 检查 / 冷却 / 升级生效对账） | 批 1（2026-10-07 D14 拆分自 lib/index.js） | `N/A（宿主半）` |
| `lib/update-apply.js` | 更新服务的**写侧**（安装命令探测阶梯 / 锁 / 子进程与结账） | 批 1（2026-10-07 D14 拆分自 lib/index.js） | `N/A（宿主半）` |
| `test/client-contract-shell.test.mjs` | 客户端契约·外壳面（ModuleLoader 形状 / 注册与生命周期 / 服务降级 / 双语与版本常量） | 批 1（2026-10-07 D14 拆分自 test/client-contract.test.mjs（父文件已随拆分删除）） | `N/A（测试）` |
| `test/client-contract-gallery.test.mjs` | 客户端契约·图册面（预览与归档 URL / 目录与规格 / 空态生成 / 路径折算） | 批 1（2026-10-07 D14 拆分自 test/client-contract.test.mjs（父文件已随拆分删除）） | `N/A（测试）` |
| `test/client-contract-panels.test.mjs` | 客户端契约·面板面（更新条 / 自进化标签页 / 插件详情页三处贡献） | 批 1（2026-10-07 D14 拆分自 test/client-contract.test.mjs（父文件已随拆分删除）） | `N/A（测试）` |
| `test/helpers/client-contract-harness.mjs` | 上述三份共用的夹具（假 React / bundle 加载器 / 假 ctx / 元素收集；不复制三份） | 批 1（2026-10-07 D14 拆分自 test/client-contract.test.mjs（父文件已随拆分删除）） | `N/A（测试）` |
| `lib/chunks.js` | 客户端分块的**宿主半**：`GET /roadbook/bundle/<名>.js` 路由（名字白名单 / 固定目录 / 同源守卫 / ETag 记忆化 + 304） | 批 1（#55 分块机制） | `N/A（宿主半）` |
| `lib/client-evolve.js` | 客户端分块「自进化」：标签页界面与三态判定（核心 bundle 按需注入 `<script>` 装载） | 批 1（#55；D14 拆分自 lib/client.js（412 行原样搬来）） | `N/A（客户端分块；无独立可达性面，随标签页验）` |
| `test/chunks.test.mjs` | 分块契约（白名单与穿越四种写法 / 路由四态与缓存三件套 / 两半常量一致 / 分块文件 ⊆ 白名单 / 宿主件无缺项 / 边界组件） | 批 1（#55 分块机制） | `N/A（测试）` |
| `skills/roadbook/bin/cards.mjs` | 卡图 CLI（只读）：分类判定 / 进入条件点名关系 / 依赖表 → 可开工前沿（成环退 1）/ `--check` 三条配对关系对账 | 批 3（台账 #36 #37 #38） | `N/A（CLI）` |
| `skills/roadbook/bin/route.mjs` | 路由 CLI + barrel（参数/事实/回执/退出码；对外导出面按原名再导出，调用方零改动） | 批 3（2026-10-07 D14 拆分；本行是 barrel 父件，按判据不带拆分标记） | `N/A（CLI）` |
| `skills/roadbook/bin/route-data.mjs` | 路由**数据表**：事实问题（FACTS）/ 进入条件（STEPS）/ 档位判据（L_JUDGE + `tierOf`）/ 门禁集合 / 不可达标白名单 / 预设场景 | 批 3（2026-10-07 D14 拆分自 skills/roadbook/bin/route.mjs） | `N/A（纯数据 + 纯函数）` |
| `skills/roadbook/bin/route-cards.mjs` | 路由**读盘半**：卡目录扫描（认不出的文件名收进 `unparsed`）/ 锚点区提取（H1 + 触发行）/ 读卡正文 | 批 3（2026-10-07 D14 拆分自 skills/roadbook/bin/route.mjs） | `N/A（宿主半）` |
| `skills/roadbook/bin/route-core.mjs` | 路由**纯逻辑**：门禁判定 / 事实校验与归一 / 出链 / 账本 / 审计（锚点失配 · 双语缺份 · 幽灵引用 · 不可达） | 批 3（2026-10-07 D14 拆分自 skills/roadbook/bin/route.mjs） | `N/A（纯函数）` |
| `skills/roadbook/bin/route-format.mjs` | 路由**渲染半**：文本回执与 `--json` 回执（键序钉死，同事实两次运行逐字节相同） | 批 3（2026-10-07 D14 拆分自 skills/roadbook/bin/route.mjs） | `N/A（纯函数）` |
| `skills/roadbook/bin/route-quote.mjs` | 卡正文**逐字节切片**（`--quote`）：行号 + sha256 + 可机械剥离的前缀 —— 台账 #27 的派单内嵌件（**新功能，不是拆分件**） | 批 3（台账 #27 前置） | `N/A（纯函数）` |
| `skills/roadbook/bin/route-dispatch.mjs` | **链状态 + 派单包**（`--chain` / `--dispatch`）：done/current/todo 标记、内嵌卡正文切片、门禁类型化 `needVerdict` + 停点行号、3 行回执模板 —— 台账 #25~#28 的 P0 机械面（**新功能，不是拆分件**） | 批 4（台账 #25~#28） | `N/A（纯函数）` |
| `skills/roadbook/data/cards.json` | 卡图数据文件（**生成物**，`cards.mjs --write` 唯一写者；49 张卡的分类 / 序号 / 点名关系） | 批 3（台账 #33） | `N/A（数据）` |
| `test/cards.test.mjs` | 卡图属性测试（分类成划分 / 恒真判定健全且完备 / 触发行分三格 / 随机 DAG 前沿双向不变式 / 回边必成环 / CLI 退出码） | 批 3（台账 #36 #37 #38） | `N/A（测试）` |
| `_qc/selftest-cases.json` | 仪器自检的**用例表**（15 条：`rule` / `instrument` / `touch` / `mutate` / `expectFail` / `allowExtra` / `evidence`）——数据与引擎分家，脚本 `_qc/selftest.ps1` 不随用例变 | 批 3（成功标准 4：变异集覆盖 B 类 13 条 + A/C 各 1 条） | `N/A（数据）` |

<!-- 上面是母版仓自己的登记行（表头 2026-10-07 由 TD-001 定：路径/用途/归属批次/可访问性）。生成出来的项目照同一表头填自己的文件；纯逻辑/脚本/文档一律 `N/A（纯文本|脚本）`，界面元素才有可访问性验证方式 -->

### 补登记 · 批 6「77 项清偿」（台账 #34 / #54，2026-10-07）

> 上面那张表是**逐批随手登记**的产物；本节是**存量一次性补齐**（`orphans.ps1` 的 `[未登记]` 实测 65 项 → 0）。
> 判据口径（`orphans.ps1:86`）：文件 basename 在本文件出现过即算登记 —— 启发式，会误判（如 `cli` 撞词），
> 故本节逐文件按 D13 四列补齐，不靠撞词。归属批次列取**该文件在 git 里首次出现的提交日**（`git log --diff-filter=A`），不是回忆。

| 路径 | 用途 | 归属批次 | 可访问性 |
| :-- | :-- | :-- | :-- |
| `_qc/check-docs.ps1` | 文档域断言（固定槽位 ↔ `docs/README.md` 对应表双向核对 / A1d 上限同源；可由 `_qc/check.ps1` 调用，也可单跑） | 母版（2026-10-06 文档双向断言批） | `N/A（脚本）` |
| `_qc/baseline/run.ps1` | 卡行为 baseline 脚手架（跑压力提示词组 / 原样落盘证据 + 机械指纹 / RED 追加台账；不改卡、不出结论） | 母版（2026-10-03 卡行为自测批） | `N/A（脚本）` |
| `_qc/loader-accept.mjs` | 真 Loader 验收（拿 DSH 安装里那份真 cordis 当接收点，判 `lib/client.js` 的导出能否收成 ACTIVE fiber） | 母版（2026-10-05 真机根因批） | `N/A（脚本）` |
| `_qc/migrations/fix-card-headers-2026-10-03.mjs` | 一次性迁移补漏（卡片 H1 里的旧两位数卡号）—— 用完即弃 | 母版（2026-10-03 卡号重编批） | `N/A（一次性脚本）` |
| `_qc/migrations/fix-stale-card-numbers-2026-10-03.mjs` | 一次性修补（漏网的裸两位旧卡号 + 与 §4 链不一致的「下一张」头部行）—— 用完即弃 | 母版（2026-10-03 卡号重编批） | `N/A（一次性脚本）` |
| `_qc/migrations/renumber-2026-10-03.mjs` | 一次性迁移留痕（卡号两位序号 → 阶段-行为序号；第一步）—— 用完即弃 | 母版（2026-10-03 卡号重编批） | `N/A（一次性脚本）` |
| `_qc/migrations/renumber-2026-10-03.sh` | 同上（bash 版第一步）—— 用完即弃 | 母版（2026-10-03 卡号重编批） | `N/A（一次性脚本）` |
| `plugin/roadbook-autoload/trigger.js` | 门控三层纯逻辑（不 import dsh 包，普通 node 可单测） | 母版（2026-10-03 插件首版） | `N/A（纯逻辑）` |
| `plugin/roadbook-autoload/team.js` | Team 消费层纯逻辑（三层分工开关；不 import dsh 包） | 母版 0.5.0（2026-10-05 硬规则唯一化） | `N/A（纯逻辑）` |
| `plugin/roadbook-autoload/host-fallback.js` | 宿主包的本地等价实现（只在 `@deepseek-ai/*` 真解析不到时启用） | 母版（2026-10-04 子行平铺批） | `N/A（宿主兜底）` |
| `plugin/roadbook-autoload/test/trigger.test.mjs` | 门控三层行为测试 | 母版（2026-10-03 插件首版） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/index.test.mjs` | 子行入口装配测试（含宿主 peer 缺失时的降级） | 母版（2026-10-03 审计修复批） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/host-fallback.test.mjs` | 宿主兜底实现测试 | 母版（2026-10-04 子行平铺批） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/banner.test.mjs` | 常驻微提示（banner）行为测试 | 母版 0.3.0（2026-10-05） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/gate.test.mjs` | 动作闸（`pre-execute` 判 deny / ask）行为测试 | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/state.test.mjs` | 状态检查（`stateCheck` 字段）行为测试 | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/team.test.mjs` | Team 消费层行为测试 | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `plugin/roadbook-autoload/test/dsh-stubs/dsh-llm.mjs` | 测试桩：宿主 llm 子行（免装宿主即可单测） | 母版（2026-10-03 审计修复批） | `N/A（测试桩）` |
| `plugin/roadbook-autoload/test/dsh-stubs/dsh-skill.mjs` | 测试桩：宿主 skill 子行 | 母版（2026-10-03 审计修复批） | `N/A（测试桩）` |
| `plugin/roadbook-autoload/test/dsh-stubs/hooks.mjs` | 测试用 ESM loader 钩子（把宿主 peerDependencies 换成本目录的桩） | 母版（2026-10-03 审计修复批） | `N/A（测试桩）` |
| `plugin/roadbook-autoload/test/dsh-stubs/schemastery.mjs` | 测试桩：宿主配置 schema 库 | 母版（2026-10-03 审计修复批） | `N/A（测试桩）` |
| `plugin/roadbook-evolve/signals.js` | 自进化信号表纯逻辑层（S1–S6 分类与统计；不 import dsh 包） | 母版 0.6.0（2026-10-05 自进化行） | `N/A（纯逻辑）` |
| `plugin/roadbook-evolve/test/signals.test.mjs` | 信号分类与统计测试 | 母版 0.6.0（2026-10-05） | `N/A（测试）` |
| `plugin/roadbook-evolve/test/service.test.mjs` | 自进化服务接线测试（路由 + handler） | 母版 0.6.0（2026-10-05） | `N/A（测试）` |
| `skills/roadbook/bin/rules.mjs` | 硬规则索引机械审计 CLI（结构 / 分类 / 判定钩子 / 落点；零依赖、不 spawn 子进程） | 母版 0.5.0（2026-10-05） | `N/A（CLI）` |
| `skills/roadbook/bin/scaffold.mjs` | 项目接入 CLI（五级母版解析 + 三分类写入） | 母版 0.9.0（2026-10-06） | `N/A（CLI）` |
| `test/route-cli.test.mjs` | route CLI 行为测试（项目事实 → 卡片链） | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `test/expected-annotation.test.mjs` | S 链四卡命令块后的 `Expected：` 标注测试（B13） | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `test/rules-audit.test.mjs` | 规则索引（`rules/rules.json`）机械审计测试 | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `test/rule-parity.test.mjs` | 规则索引 ↔ 正文锚点双向对齐测试（B11） | 母版 0.5.0（2026-10-05） | `N/A（测试）` |
| `test/packaging.test.mjs` | 随包白名单 ↔ 运行时路径（B8）+ `SKILL.md` 相对路径可从包根解析（台账 #6） | 母版 0.3.0（2026-10-05）· 批 6 扩展 | `N/A（测试）` |
| `test/scaffold-cli.test.mjs` | scaffold CLI 行为测试（母版 → 项目骨架） | 母版 0.9.0（2026-10-06） | `N/A（测试）` |
| `test/skill-mirror.test.mjs` | `SKILL.md` 双份逐字节镜像（B4） | 母版（2026-10-04 主插件化批） | `N/A（测试）` |
| `test/skill-frontmatter.test.mjs` | `SKILL.md` 前置元信息能被真 YAML 读出（BUG-001 仪器） | 母版（2026-10-06 6-4 回归批） | `N/A（测试）` |
| `test/umbrella-contract.test.mjs` | 伞包（主插件）结构契约 | 母版（2026-10-04 主插件化批） | `N/A（测试）` |
| `test/update.test.mjs` | 自动更新判定与两级传输测试 | 母版 0.4.0（2026-10-05） | `N/A（测试）` |
| `test/atlas-cli.test.mjs` | atlas CLI 端到端行为测试（真跑渲染） | 母版（2026-10-04 主插件化批） | `N/A（测试）` |
| `test/render-smoke.test.mjs` | archify vendor 冒烟测试（vendored 渲染器可跑） | 母版（2026-10-04 主插件化批） | `N/A（测试）` |
| `test/vendor-provenance.test.mjs` | 供应商记录可核对性测试（清单 ↔ 逐文件哈希） | 母版（2026-10-06 atlas 修复批） | `N/A（测试）` |
| `test/d14-lines.test.mjs` | D14 行数闸（非测试 ≤500 / 测试 ≤1000）+ 豁免清单完整性（台账 #59） | 批 1（2026-10-07 D14 闸） | `N/A（测试）` |
| `skills/roadbook-atlas/vendor/archify/bin/archify.mjs` | archify 主 CLI：把 typed JSON 规格渲染成自包含 HTML | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/bin/open-artifact.mjs` | 把渲染产物交给宿主打开 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/bin/preview.mjs` | 产物预览（取预览 URL / 本地起服务） | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/bin/visual-check.mjs` | 渲染产物视觉自检 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/delta/architecture-delta.mjs` | 架构差异（base / head 两图对比） | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/recipes/scenarios.mjs` | 场景配方（示例与引导数据） | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/architecture/render-architecture.mjs` | 架构图渲染器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/architecture/grid.mjs` | 架构图网格布局 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/dataflow/render-dataflow.mjs` | 数据流图渲染器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/lifecycle/render-lifecycle.mjs` | 生命周期图渲染器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/sequence/render-sequence.mjs` | 时序图渲染器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/workflow/render-workflow.mjs` | 流程图渲染器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/diagnostics.mjs` | 渲染共享层：诊断输出 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/engineering-profiles.mjs` | 渲染共享层：工程档位与预设 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/generated-validators.mjs` | 渲染共享层：生成式校验器 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/geometry.mjs` | 渲染共享层：几何计算 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/layout-report.mjs` | 渲染共享层：布局报告 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/legend.mjs` | 渲染共享层：图例 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/output-path.mjs` | 渲染共享层：输出路径折算 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/repository-evidence.mjs` | 渲染共享层：仓库证据采集 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/text-fit.mjs` | 渲染共享层：文本适配与截断 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/utils.mjs` | 渲染共享层：通用工具 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/renderers/shared/validator.mjs` | 渲染共享层：规格校验入口 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/scripts/check-render-output.mjs` | 渲染产物检查脚本 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |
| `skills/roadbook-atlas/vendor/archify/scripts/render-examples.mjs` | 示例批量渲染脚本 | 母版（2026-10-04 主插件化批随包；vendored 逐字节） | `N/A（第三方 vendored；MIT）` |

## 界面组件（3-4 卡的产品面；"人话标识"列在这里）

| 界面元素 | 人话标识 | 程序名 | 文件 | 搜索词 | 影响面 | 最近确认 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 「图册」标签页 | "画图纸那个标签页" | AtlasGallery | lib/client.js | `roadbook:gallery` | 侧栏第 1 张（order 45）；读 `docs/diagrams`；键盘可达 | 2026-10-07 |
| 「自进化」标签页 | "看信号表那个标签页" | EvolvePanel（分块导出；核心经 `chunkBoundary("evolve", "EvolvePanel")` 挂载，描述符在 lib/client.js:1853） | lib/client-evolve.js | `roadbook:evolve` · `EvolvePanel` · `chunkBoundary` | 侧栏第 2 张（order 46）；读 `/roadbook/evolve/*`；未装载时分块边界显示「加载中／加载失败」 | 2026-10-07 |
| 插件详情页三处贡献 | "插件设置页上的更新条" | registerPluginDetailSlots | lib/client.js | `plugins.detail` · `roadbook` 详情页门 | 只认 `pkg.name === 'roadbook'` 的详情页 | 2026-10-07 |

<!-- 搜索词 = 下次 3 秒找到你的关键词组合：组件名/文案/路由。改完行不回写 = 卡片过期比没有更毒 -->

## 「影响面 / 非功能标注」四列怎么写（4-1 卡每批登记时填；7-1 卡改 UI 时复核）

| 要标什么 | 什么时候填 | 谁填 | 写法（照着抄） |
| :-- | :-- | :-- | :-- |
| 影响面（谁被牵连） | 新建或改动同一批、提交前 | 4-1 卡（改 UI 由 7-1 卡） | 列引用它的页面/接口与处数，如「首页也引用（4 处）」；没有别的引用写「无」 |
| 性能 | 组件会发请求、渲染长列表、跑定时任务时 | 填表的人 | 写可测数字，如「首屏 ≤1.5s；列表 500 行分页」；无关写 `N/A（纯静态展示）` |
| 安全与隐私 | 显示、提交、外发个人数据时 | 填表的人（涉及 D3/D4 字段先问 7-5 卡口径） | 写处置，如「手机号只显示后 4 位；不进日志」；无关写 `N/A（无个人数据）` |
| 可访问性 | 有交互控件（按钮、表单、弹窗、图表）时 | 填表的人 | 写验证方式，如「Tab 走查：全部控件可达且焦点可见」；无关写 `N/A（纯文本）` |

- 四列宁可写 `N/A（理由）`，不许留空——留空 = 没人知道这行还准不准；「最近确认」填最近一次改这行或复核这行的日期。
- 登记与清理：新增文件当批登记本表；文件删了同批删行；删不掉的登记根 STATE.md 并行态登记簿。
