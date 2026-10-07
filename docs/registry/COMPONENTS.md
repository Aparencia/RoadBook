# COMPONENTS · 组件注册表（界面 ↔ 代码 的地图）
> 最近核对 —（骨架未核对；核对后填 <日期> @ <提交哈希>）
> 用法：agent 改 UI 前先查这张表定位；改完同批回写（5-1 归档卡会查）。**新建文件不登记 = 孤儿（5-1 卡第 ⑧ 查会报）**。
> **两节分工（2026-10-07 定，解 TD-001）**：①「**文件登记**」节管 **D13 的登记义务**——每新增一个文件就往里加一行（**四列：路径 / 用途 / 归属批次 / 可访问性**）；②「**界面组件**」节管**给人定位 UI**（"人话标识"那一列在这里，页面分节）。**同一份文件只进它该进的那一节**：纯逻辑/脚本/文档登记进 ①，界面元素进 ②。
> 分节规则（界面组件节）：每个页面一节，标题写「页面名 路由」（如 `## 统计页 /stats`）；单节 ≤30 行，超了说明该拆组件了。

## 文件登记（D13：路径 / 用途 / 归属批次）

| 路径 | 用途 | 归属批次 | 可访问性 |
| :-- | :-- | :-- | :-- |
| `AGENTS.md`（根） | 硬规则唯一正文（A/B/C/D 四类） | 1-3 接入 · 规则版本随母版 | `N/A（纯文本）` |
| `STATE.md`（根） | 状态仪表盘（唯一事实源） | 1-3 接入 | `N/A（纯文本）` |
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
| `skills/roadbook/data/cards.json` | 卡图数据文件（**生成物**，`cards.mjs --write` 唯一写者；49 张卡的分类 / 序号 / 点名关系） | 批 3（台账 #33） | `N/A（数据）` |
| `test/cards.test.mjs` | 卡图属性测试（分类成划分 / 恒真判定健全且完备 / 触发行分三格 / 随机 DAG 前沿双向不变式 / 回边必成环 / CLI 退出码） | 批 3（台账 #36 #37 #38） | `N/A（测试）` |
| `_qc/selftest-cases.json` | 仪器自检的**用例表**（15 条：`rule` / `instrument` / `touch` / `mutate` / `expectFail` / `allowExtra` / `evidence`）——数据与引擎分家，脚本 `_qc/selftest.ps1` 不随用例变 | 批 3（成功标准 4：变异集覆盖 B 类 13 条 + A/C 各 1 条） | `N/A（数据）` |

<!-- 上面是母版仓自己的登记行（表头 2026-10-07 由 TD-001 定：路径/用途/归属批次/可访问性）。生成出来的项目照同一表头填自己的文件；纯逻辑/脚本/文档一律 `N/A（纯文本|脚本）`，界面元素才有可访问性验证方式 -->

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
