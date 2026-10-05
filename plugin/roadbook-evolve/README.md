# roadbook-evolve · 自进化行（宿主半）

**一句话**：把自进化的证据算成一张**随时可看的信号表** —— **机器出数，人点头**。

这一行回答的是「RoadBook 在执行过程中能不能发现自己的问题」。它只做**发现与显示**，不做裁决：

| 能力 | 做 | 不做 |
| :-- | :-- | :-- |
| 采集 | 读两份观测 JSONL、`git status --porcelain`、两个既有 audit CLI 的退出码 | 不新增落盘产物、不写仓库文件 |
| 判定 | 折算成 S1–S6 六条信号，三态（`ok` / `hit` / `unknown`） | 不复刻 `rules.mjs` / `route.mjs` / `check.ps1` 的判据 |
| 反馈 | 两条**只读**本机路由 + 侧栏「自进化」标签页 | 不自动开 GitHub issue、不自动改卡 |

## 六条信号

| id | 信号 | 读数 | 越界判据 | 首次实现时的本机实测 |
| :-: | :-- | :-- | :-- | :-- |
| **S1** | 观测臂污染 | 命中测试痕量的记录数 / 总记录数 | > 0 | 65/468（`fake-installer.mjs`、哨兵版本 `9.9.9`） |
| **S2** | 注入活性 | `inject` 事件数 / `loaded` 事件数 | `inject = 0` 且 `loaded ≥ 10` | 0/35 |
| **S3** | banner 可用率 | `state:registered` / banner 总数 | < 50% | 4/33 = 12% |
| **S4** | 工作树状态 | `git status --porcelain` 行数 | > 0 | 0 |
| **S5** | 规则索引健康 | `node skills/roadbook/bin/rules.mjs --audit` 退出码 | ≠ 0 | 0（42 条判绿） |
| **S6** | 路由完整性 | `node skills/roadbook/bin/route.mjs --audit` 退出码 | ≠ 0 | 0 |

阈值常量（改一处必须同批改 `signals.js`、本表与测试）：`MIN_LOADED_SAMPLE = 10`、`BANNER_OK_RATIO = 0.5`、`STALE_TICK_HOURS = 48`。

**三态是这一行的全部意义**：读不到文件、`git` 跑不起来、audit 超时、样本不足 —— 一律判 `unknown` 并写明原因。**「判不了」和「一切正常」必须长得不一样**；把前者显示成后者，正是本仓库反复定义的那类假绿。

## 自身活性（本行第一个遵守自己提的门槛）

> **任何自进化机制必须回答：它怎么被证明还活着？**

本行每次 tick 往 `<tmpdir>/roadbook-evolve.jsonl` 写一条 `tick` 事件；标签页顶部显示「上次 tick：x 分钟前」。超过 `STALE_TICK_HOURS` 没有 tick = 判 `hit` —— **一个会静默死掉的观测机制比没有更糟，因为它让你以为有人在看着**。

## 配置（Loader 行 `roadbook-evolve`）

| 键 | 默认 | 说明 |
| :-- | :-- | :-- |
| `mode` | `on` | `off` 只登记路由与 loaded，不跑定时 tick |
| `intervalHours` | `24` | 两次自动 tick 的最小间隔（开机 5 秒后先跑一次） |
| `autoloadReport` | `<os.tmpdir()>/roadbook-autoload.jsonl` | 自动加载行的观测文件（名字的权威定义在 `plugin/roadbook-autoload/index.js`） |
| `updateReport` | `<os.tmpdir()>/roadbook-update.jsonl` | 主行更新环的观测文件（常量来自 `lib/update.js`） |
| `reportPath` | `<os.tmpdir()>/roadbook-evolve.jsonl` | 本行观测文件 |
| `reportMaxBytes` | `1048576` | 观测上限；**轮转失败就放弃这一行**（不许把上限变成摆设） |
| `auditTimeoutMs` | `30000` | 单条命令（git / audit）的超时；超时按 `unknown` 结账 |
| `repoRoot` | 空 = 从 cwd 上溯找带 `skills/roadbook/bin/rules.mjs` 的目录 | 找不到**不是错误**：生成出来的项目本来就没有 `skills/`，此时 S5/S6 判 `unknown` |

## 两条只读路由

| 路由 | 方法 | 说明 |
| :-- | :-- | :-- |
| `/roadbook/evolve/status` | GET | 信号表（没算过就现算一次，绝不返回空表） |
| `/roadbook/evolve/tick` | POST | 强制重算 |

两条都过 `trustedLocalRequest` 同源守卫（`lib/update.js` 导出），都走**可选服务** `ctx.inject(['webServer'])` —— 读不到只让路由不出现，**绝不让整行插件变成面板上的「未运行」**。

## 三档开关

1. DSH 插件面板里关 `roadbook-evolve` 这一行；
2. profile 的 `cordis.patch.yml` 里写 `- id: roadbook-evolve` + `disabled: true`；
3. 行 config 写 `mode: off`（只停定时器，路由与 loaded 仍在）。

**本子插件不单独安装**（与 atlas / team 同口径）：它相对 import 伞包的 `lib/update.js`，因此没有独立 `dsh.bundle`。

## 边界（V1 明确不做，勿当成待办）

- **不自动开 issue**：需要凭据、需要裁决「台账放公开还是私有」，装外部 CLI 还要走 7-9 准入。V1 的产物是给人看的信号表，不是自动工单。
- **不自动改卡 / 改规则**：撞 `AGENTS.md` A6（宪法与裁决字段不可委托）。
- **不写仓库文件**：默认落 `<tmpdir>`，避免脏树破坏 B9（收工工作树干净）。
- **不跑 LLM harness**：`_qc/baseline/` 的压力提示词需要模型在场，属 DSH `schedule` 唤醒的活。
- **S1 是启发式**：V1 按内容标记（`fake-` 命令、哨兵版本、显式 `arm`）分 `prod` / `suspect`，**判不出的记 `unknown` 单独显示**。V2 应由生产者直接写 `arm: prod|test` 字段。

## 验证

```powershell
node plugin/roadbook-evolve/test/signals.test.mjs    # 纯逻辑 18 例
node plugin/roadbook-evolve/test/service.test.mjs    # 接线 13 例（含那次假绿的回归守卫）
powershell -NoProfile -ExecutionPolicy Bypass -File _qc/check.ps1
```

`service.test.mjs` 存在的理由：`signals.test.mjs` 只证明「算得对」，证明不了「喂进去的是真数据」—— 本行初版 `readGit` 曾经只取退出码却写死 `porcelainLines: 0`，于是 S4 永远显示「工作树干净」，而纯逻辑测试全绿。
