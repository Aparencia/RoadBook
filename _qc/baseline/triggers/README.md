# 触发布线题目（只写题目 + 判据，不产出结论）

流程卡有没有进上下文，`signals.tsv` 只能证明「进去了」，证明不了「进对了」。本目录用一份题目清单测两件事：

| 触发面 | 谁决定 | 判据落点 |
| --- | --- | --- |
| 加载面 | `SKILL.md` 的 `description`（宿主只注入 name + description） | 该触发的话有没有触发 |
| 路由面 | `playbook/0-1-驱动卡.md` 的意图路由表 | 触发后**落到了哪张卡** |

**指错卡比不触发更坏**：不触发是没走流程，指错卡是 agent 拿着错卡的检查清单往前冲。所以两者必须分开计分，不许合并成一条「触发失败」。

**第三个面（编排面：项目事实 → 卡链）不在本目录**：它由 `node --test test/route-cli.test.mjs` 零成本机械判定（题目在 `test/fixtures/route-scenarios.json`），**不需要 harness**，也不与上面两面合并计分——三面分工见 `../README.md`「编排面」一节。

## 怎么跑

```powershell
powershell -NoProfile -File _qc/baseline/run.ps1 -TriggerSet _qc/baseline/triggers/queries.json -Declare "失败类型：条件规则" -IsolationProof "插件 mode=off，已用空提示词验过不注入" -HarnessCmd "node path/to/headless.mjs"
```

- 每条 query **跑 3 次**（同一 harness、同一模型、同一 HEAD）。只跑一次分不清「规则没牙」和「这一次恰好抽歪」。
- 结果落 `runs/<时间戳>/triggers.tsv`，列 = `id / split / should_route / expect_card / runs / routed / card_hit / note`。`card_hit` 只统计真正路由到 `expect_card` 的次数。
- 本机没有可用 headless CLI 时（见 `../README.md`）：**只许写题目，不许编造结果**。`triggers.tsv` 只能由 `run.ps1` 真跑出来，手抄一份等于伪造证据。

## 判据（跑之前先定死，跑完再定 = 事后合理化）

- `should_route=true`：3 次里 **≥2 次注入**（`routed ≥ 2`），且 **≥2 次命中 `expect_card`**。命中别的卡单独记进 `note`，不许并进「未触发」。
- `should_route=false`：3 次**全不注入**。任何一次注入 = 误触发（把闲聊当需求是这套流程最容易犯的错）。
- 一次 run 里所有 `should_route=true` 条目的注入率就是加载面的分数；`card_hit / routed` 才是路由面的分数。

## 切分与过拟合

- `split="train"` 用来试改（改 `description`、改路由表措辞）；`split="test"` 用来决定改不改。
- **只许按 test 的分数选优**。在 test 上反复调到全绿 = 把题目背下来了，等于没测——这正是 anthropics skill-creator 用 60/40 切分的原因。
- 改判据本身（阈值、题目）要连同本文件一起改，并在 `ledger.json` 的 note 里写一行理由。

## 与台账、复验的关系

- 每次跑完由 `run.ps1` 追加一条到 `_qc/baseline/ledger.json`；**同一代**（harness 命令 + 模型 + 仓库 HEAD）的条目才可直接比较，换代即新增条目。
- 改了 `SKILL.md` 或路由表之后必须**复跑同一批题目**（T7 缓存复验）：旧 RED 不复现才把该条 `status` 置 `fixed`，并写 `revalidated` = 新 HEAD 短哈希。没复跑过不许写 `fixed`。
- 判定人不许是跑本次实验的 agent；证据只认 `runs/<时间戳>/triggers.tsv:行号`，写不出行号 = 该条不存在。
- 改卡门槛：同一误判在 **≥2 次独立 run**（跨 HEAD 或隔天，不是同一次里重试）复现才动 `SKILL.md` / 路由表——同 6-6 卡的「信号 ≥2 次复现才改规则」。
