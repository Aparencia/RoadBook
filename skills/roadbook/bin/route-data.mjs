/**
 * roadbook route —— **数据表**（事实问题 / 进入条件 / 判据 / 白名单 / 预设场景）
 *
 * 为什么单独一个文件：`route.mjs` 原本把「数据」与「CLI 副作用」写在同一个 567 行的文件里，
 * 越过 D14 第 1 条（单文件 ≤500 行）。拆法按「纯逻辑 / 副作用的边界」切 —— 本文件只有常量与表，
 * 一行 I/O、一个 process 都没有；CLI 在 `route.mjs`，读盘在 `route-cards.mjs`。
 *
 * 判据正文不在本文件（这里只装标识与机械钩子，防第三处真相）：每条 `anchor` 都指向
 * 对应卡的 H1 或触发行，`--audit` 回读卡文件核对锚点是否还在。
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..') // skills/roadbook/bin → 母版根
export const CN_DIR = join(ROOT, 'playbook')
export const EN_DIR = join(ROOT, 'playbook_EN')

/* ───────────────────── 档位代入（2-1 判据表的 L 行） ───────────────────── */

/**
 * 档位判据的**代入**：逐字镜像 `playbook/2-1-功能调研.md` 动作 5 的判据表，工具只做代入。
 *
 * 为什么它与 `L_JUDGE`、`STEPS` 同文件：`STEPS` 里近一半进入条件是 `f => tierOf(f).tier !== 'S'`
 * 这种形态 —— 判据表与它的代入分开住，卡表就依赖了另一个文件里的私有函数。拆分第一版正是这么错的：
 * 静态看只多了一个 import，报错要等到真跑出链才出现（`tierOf is not defined`，退出码 1）。
 */
export function tierOf(f) {
  for (const [key, label] of L_JUDGE) {
    if (f[key] === true) return { tier: 'L', reason: `2-1 判据表 L 行「${label}」` }
  }
  if (f.scale === 'tiny' || f.scale === 'singlepage') {
    return { tier: 'S', reason: f.scale === 'tiny'
      ? '2-1 判据表 S 行：≤3 文件且 ≤100 行，无新依赖'
      : '2-1 判据表 S 行·单页静态应用特例：1 入口页 + 无后端 + 无依赖 → ≤5 文件且 ≤400 行' }
  }
  if (f.scale === 'normal' || f.scale === 'large') {
    return { tier: 'M', reason: '2-1 判据表 M 行：限 1~2 个模块内，不新增外部包、无破坏性表结构' }
  }
  return { tier: 'pending', reason: 'S/M 分界取决于实测文件数·行数，开工前未知（2-1 判据表 S 行）' }
}

/** 输出 schema 标识：每份 `--json` 回执都带它，消费方据此判版本。 */
export const SCHEMA = 'roadbook-route/1'

/* ───────────────────────── 事实：问用户的问题 ───────────────────────── */

/** 用户能回答的 9 个是非题 + 3 个 agent 回填项。0-1 硬规则 10：问题自带推荐答案。 */
export const FACTS = [
  { key: 'greenfield', who: 'user', type: 'enum', values: ['new', 'existing'], def: 'new',
    ask: '这个项目是全新的（还没代码），还是已有一堆代码要接进来？' },
  { key: 'hasUI', who: 'user', type: 'bool', def: true,
    ask: '它有界面吗？（页面 / 窗口 / 表单——能用眼睛看的东西）' },
  { key: 'goLive', who: 'user', type: 'bool', def: false,
    ask: '做完要真的放到网上、让别人打开来用吗？' },
  { key: 'publicService', who: 'user', type: 'bool', def: false,
    ask: '上线后是「不认识的人也能访问」吗？（不是只给你自己或同事）' },
  { key: 'personalData', who: 'user', type: 'bool', def: false,
    ask: '会记下别人的个人信息吗？（手机号 / 邮箱 / 位置 / 身份）' },
  { key: 'newDependency', who: 'user', type: 'bool', def: false,
    ask: '要不要装现成的库 / 插件 / 外部工具？（图表库、UI 框架、MCP server 都算）' },
  { key: 'redLine', who: 'user', type: 'bool', def: false,
    ask: '会不会碰到：登录鉴权 / 收钱 / 删别人的数据 / 改数据库表 / 给外部系统开接口？' },
  { key: 'team', who: 'user', type: 'bool', def: false,
    ask: '除你之外还有别人参与吗？（同事 / 客户 / 外包）' },
  { key: 'vague', who: 'user', type: 'bool', def: false,
    ask: '你能一句话说清「给谁用、做什么、怎么算成功」吗？（说不清 = 是）' },
  { key: 'scale', who: 'agent', type: 'enum', values: ['tiny', 'singlepage', 'normal', 'large', 'unknown'], def: 'unknown',
    ask: '（agent 填）第一版规模：tiny=≤3 文件 ≤100 行；singlepage=1 入口页/无后端/无依赖 ≤5 文件 ≤400 行；normal=普通功能；large=多模块' },
  { key: 'hasCI', who: 'agent', type: 'bool', def: false,
    ask: '（agent 填）项目已经有自动检查（CI / check.ps1）吗？' },
  { key: 'structChange', who: 'agent', type: 'bool', def: false,
    ask: '（agent 填）这次改动会不会改变系统结构？（新增或移除模块、换存储、拆或合服务——结构变了才要回 3-7 架构定义）' },
]

/* ─────────────────── 卡表：进入条件 = 卡片自己写的触发行 ─────────────────── */

/**
 * `card` = 卡号；`anchor` = 必须出现在该卡**锚点区**（H1 行或触发行）里的原话片段（--audit 回读校验）。
 * 卡改了触发条件而这里没改 → audit 判红，逼着两边同批改。
 * 锚点**只许取自 H1 与触发行**：正文里的同名词（比如「等用户验收」）不算数——正文会随细节改动漂移。
 */
export const STEPS = [
  { card: '1-1', anchor: '立项', when: (f) => f.greenfield === 'new', why: '空的新想法 → 先做能不能做的调研' },
  { card: '1-2', anchor: '1-1', when: (f) => f.greenfield === 'new', why: 'Go 之后选型、生成骨架、连远端' },
  { card: '1-3', anchor: '已有代码', when: (f) => f.greenfield === 'existing', why: '已有代码 → 反推结构、装守护脚本' },
  { card: '2-6', anchor: '先查外面有没有现成轮子', when: (f) => tierOf(f).tier !== 'S', why: '轮子先行五查：先查外面有没有现成的，再决定自研 / 接入 / 抄思路（S 档裁剪，见 §4 外部方案线）' },
  { card: '2-1', anchor: '驱动卡收到新功能类意图', when: () => true, why: '新功能意图的固定入口（也是定档位的地方）' },
  { card: '2-3', anchor: 'S 档不走本卡', when: (f) => f.vague === true, why: '需求说不清（三种以上合理解释）' },
  { card: '2-2', anchor: 'S 档用简版', when: () => true, why: '定边界与验收标准（S 档走简版三节）' },
  { card: '2-4', anchor: '（M/L 档）', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档必走：给非功能需求定可测阈值' },
  { card: '2-5', anchor: '档位 = L', when: (f) => tierOf(f).tier === 'L' || f.team === true, why: 'L 档或不止一方参与' },
  { card: '3-7', anchor: '项目首次成型', when: (f) => tierOf(f).tier !== 'S' && (f.greenfield === 'new' || f.structChange === true), why: '首次成型或结构变更 → 边界 / 干系人关注点 / 四张视图 / 质量属性权衡（S 档裁剪：结构即文件清单）' },
  { card: '7-9', anchor: '首次运行任何第三方技能', when: (f) => f.newDependency === true, why: '装/启用外部件必须先过准入，结论由人裁决' },
  { card: '3-1', anchor: '档位 = L', when: (f) => tierOf(f).tier === 'L', why: 'L 档加走：动手前把数据/接口/组件钉死' },
  { card: '3-2', anchor: '红线域', when: (f) => f.redLine === true, why: '红线域强制升 L 并做威胁建模' },
  { card: '3-3', anchor: 'M/L 档', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档：设计批准后定测试策略' },
  { card: '3-4', anchor: '要做界面', when: (f) => f.hasUI === true, why: '有界面：屏幕、八态、按钮与表单规格' },
  { card: '3-5', anchor: '3-4', when: (f) => f.hasUI === true, why: '3-4 定稿后定视觉取值' },
  { card: '3-6', anchor: '3-5', when: (f) => f.hasUI === true, why: '3-5 定稿后定动效与降级' },
  { card: '7-5', anchor: '上线公开服务', when: (f) => f.personalData === true || f.publicService === true, why: '收个人信息或对外公开服务 → 合规与隐私' },
  { card: '7-6', anchor: '上线面向公众', when: (f) => f.publicService === true, why: '面向公众 → 多语言与可访问性' },
  { card: '4-1', anchor: '2-2 需求范围获用户确认后', when: () => true, why: '写代码（分批 + 净增量账本）' },
  { card: '4-2', anchor: 'M/L 档必走', when: (f) => tierOf(f).tier !== 'S', why: 'M/L 档：合入前审查，独立会话执行' },
  { card: '4-3', anchor: '全档必走', when: () => true, why: '验证：完成的唯一定义（check 退出码 0）' },
  { card: '4-6', anchor: '交付前要给人用', when: (f) => tierOf(f).tier !== 'S' && f.hasUI === true && f.goLive === true, why: '有界面且要给人用 → 交付前拿给人走一遍，看他在哪卡住（S 档裁剪：自己冷启动走一遍即可）' },
  { card: '4-4', anchor: '首次搭建 CI', optional: true, when: (f) => f.hasCI === false && f.goLive === true, why: '上线但没 CI → 至少把门禁接到每次提交' },
  { card: '4-5', anchor: '需要新环境', when: (f) => f.goLive === true, why: '上线 = 要有 prod 环境与配置/密钥来源' },
  { card: '7-7', anchor: '交付验收', when: (f) => f.team === true, why: '要交接给别人 → 用户文档与交接清单（在归档之前，产物才进得了这一轮的归档）' },
  { card: '5-1', anchor: '验收通过后', when: () => true, why: '收尾入库（归档十一查 + 孤儿与文档七张清单）' },
  { card: '5-6', anchor: '要定版本号', when: (f) => tierOf(f).tier === 'L', why: 'L 档发版前先定版本号与升级注意（§4 L 线：基线先行）' },
  { card: '5-7', anchor: '同一事实在两处说法不一致', when: (f) => tierOf(f).tier === 'L', why: 'L 档把号与产物钉成基线（与 5-6 同批），**然后**才发布' },
  { card: '5-2', anchor: '上线/让别人用', when: (f) => f.goLive === true, why: '里程碑发版（tag 由人打）' },
  { card: '5-3', anchor: 'L 档发布', when: (f) => f.goLive === true && tierOf(f).tier === 'L', why: 'L 档/高风险发布：放量阶梯与回滚预案' },
  { card: '5-4', anchor: '5-2 发布完成', when: (f) => f.goLive === true, why: '发完进观测窗（默认 24h）' },
  { card: '5-5', anchor: '改数据结构后', when: (f) => f.goLive === true && tierOf(f).tier === 'L', why: 'L 档或改过数据结构 → 恢复演练' },
]

/** 2-1 判据表的 L 行，逐条镜像；命中任一即入 L。 */
export const L_JUDGE = [
  ['newDependency', '引入新依赖'],
  ['redLine', '触碰红线域（认证/鉴权、支付/计费、删除真实数据、改表结构、新增对外接口）'],
  ['modulesMany', '跨模块'],
  ['breakingSchema', '破坏性表结构'],
  ['newPageSystem', '新页面体系'],
]

/** 门禁：0-1 硬规则 8 —— 个人档默认轻确认，只有 L 档与红线域用裁决。 */
const HARD_VERDICT = new Set(['2-1', '2-2', '4-3']) // 卡自带「停下等确认 / 用户说了确认 / 等用户验收」
const HUMAN_ACTION = new Set(['5-2']) // 执行发布部署在不可委托清单里（打 tag 自 2026-10-05.2 起由 agent 在发布流程内执行）
export { HARD_VERDICT, HUMAN_ACTION }

/**
 * 允许「不被任何进入条件引用」的卡：入口卡 + **事件线**（事故/治理）+ **横向卡**（按需插入）。
 *
 * 名单之外的卡不可达 = **判红**。2026-10-06 实测事故：`2-6` / `5-6` / `5-7` 三张**主线必走卡**
 * 长期躺在「正常：事故线/回访线/治理线」那一行里（`--audit` 判绿、测试也判绿），于是 L 链里
 * `5-1 归档` 之后直接跳到 `5-2 发布`，而设计 §4 写着这两张「L 档必走」——「路由到不了它」
 * 与「它本来就按需触发」在输出上长得一模一样。白名单唯一职责就是把这个区别**显式化**：
 * 名单要人写，写漏一张即红，不会再有第四张主线卡静默溜进「正常」那一行。
 */
export const UNREACHABLE_OK = [
  '0-1', '0-2', // 入口卡：驱动卡 + 会话生命周期
  '6-1', '6-2', '6-3', '6-4', '6-5', '6-6', '6-7', '6-8', // 事故线 + 治理线（事件/时间触发）
  '7-1', '7-2', '7-3', '7-4', '7-8', '7-10', // 特殊变更期：按需触发，各自闭环
]

/* ───────────────────────────── 预设场景 ───────────────────────────── */

export const SCENARIOS = {
  endpoint: {
    note: '终点举例：喝水计数 + 本周柱状图（手写 CSS 条形）',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: false, personalData: false,
      newDependency: false, redLine: false, team: false, vague: false, scale: 'singlepage', hasCI: false },
  },
  'endpoint-chart': {
    note: '同一件事，但装了图表库（npm i chart.js）',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: false, personalData: false,
      newDependency: true, redLine: false, team: false, vague: false, scale: 'singlepage', hasCI: false },
  },
  'public-saas': {
    note: '对外服务：公众可访问 + 收个人信息 + 登录',
    facts: { greenfield: 'new', hasUI: true, goLive: true, publicService: true, personalData: true,
      newDependency: true, redLine: true, team: true, vague: true, scale: 'large', hasCI: false },
  },
  'local-tool': {
    note: '只给自己用的本地小工具，不发布',
    facts: { greenfield: 'new', hasUI: true, goLive: false, publicService: false, personalData: false,
      newDependency: false, redLine: false, team: false, vague: false, scale: 'tiny', hasCI: true },
  },
}
