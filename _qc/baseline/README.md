# 卡行为 baseline（只记证据，不改卡）

流程卡写了规则，不等于规则有牙。本目录用一个可复现的脚手架，测**人在压力下说反话时，agent 还守不守卡**。

灵感来自 superpowers 的技能自测（`skills/writing-skills/testing-skills-with-subagents.md`）：技能改动要用子代理做行为测试，而不是「读起来挺对」。本目录只做**证据采集**，判定交给人和 6-6 流程体检。

## 目录

| 路径 | 是什么 |
| --- | --- |
| `prompts/*.txt` | 压力提示词（逐字人话，等于真实用户会说的反话）。一条一个文件，改提示词 = 改一个文件，改了就要重新跑 baseline。 |
| `run.ps1` | 跑实验 + 原样落盘证据 + 算机械指纹。不判卡、不改卡。 |
| `runs/<时间戳>/<case>.txt` | harness 的原始输出（UTF-8 无 BOM，逐字不加工）。这是唯一的一手证据。 |
| `runs/<时间戳>/manifest.txt` | 时间、仓库 HEAD、命令、每条提示词的 sha256 与退出码/字节数。 |
| `runs/<时间戳>/signals.tsv` | 机械指纹：输出里是否出现 `check.ps1`、`STATE.md`、固定收尾语、开工回执引清单的措辞。零 token，不会忘。 |
| `runs/<时间戳>/judge.md` | 人手填的判定表（脚本留空表，绝不代填）。 |
| `runs/<时间戳>/summary.md` | 机械汇总：case 数 / 失败数 / RED 清单 / `-Declare` 与 `-IsolationProof` 原样照录。零 token，不产出结论。 |
| `triggers/queries.json` | 触发布线题目（加载面 + 路由面）。只写题目。 |
| `triggers/README.md` | 触发判据（3 次 / 指错卡与未触发分开记 / 60-40 切分）。 |
| `ledger.json` | 累积台账：每次 run 追加一条；**同代才可比，换代即新条目**（旧条目只改 `status`，不覆盖、不合并计数）。 |

## 怎么跑

```powershell
powershell -NoProfile -File _qc/baseline/run.ps1 -Declare "失败类型：跳过规则" -IsolationProof "插件 mode=off，空提示词已验证不注入" -HarnessCmd "node path/to/headless.mjs"
```

- **接线契约**：`-HarnessCmd` 指定的命令必须从 **stdin** 读整条提示词，把会话输出打到 **stdout**。脚手架不解析参数、不猜 flag。
- **`-Declare`（量表先填）**：跑之前必须用一句话声明这次要验证哪一条失败类型（跳过规则 / 形态不对 / 元素缺失 / 条件规则）。**跑完再写判定 = 事后合理化**，所以缺它直接 `exit 2`。
- **`-IsolationProof`（臂隔离证明）**：写清这次怎么保证「所有臂都没有被常驻注入兜底」（关插件 / `mode=off` / 换不带插件的 profile），并附一条空提示词的对照结论。缺它同样 `exit 2`——理由见下「臂隔离」。
- **`-TriggerSet`**：给 `triggers/queries.json` 就跑触发布线题目，结果落 `runs/<时间戳>/triggers.tsv`（判据见 `triggers/README.md`），不跑提示词压力组。
- **退出码**：`0` = 全部 case 跑完且有输出；`1` = 有 case 失败（退出码非 0 或输出为空）——证据不可信，先修仪器；`2` = 未接线（没给 `-HarnessCmd` / `-Declare` / `-IsolationProof`、命令不存在、提示词目录为空）。
- **为什么没有默认命令**：本机探针实测 `dsh` 的 PATH shim 指向一个过期 checkout，直接跑报 `Cannot find module ...\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js`；正在运行的 GUI 走 `resources/app.asar`。探针给的结论是「没有可用的 headless CLI」，所以脚手架**不猜命令**：未接线就红（与 `template/check.ps1` 的 `$STEPS` 为空同口径）。
- `-OutDir` 可以指定到别处（例如临时目录），默认写 `runs/<时间戳>/`。

## 判定口径（人填，脚本不产出结论）

- 跑之前先写下这次要验证哪一条失败类型：**跳过规则 / 形态不对 / 元素缺失 / 条件规则**。
- **类型 5 装载失败**（2026-10-03 补）：本轮本应注入流程卡而未注入（查 `roadbook-autoload.jsonl` 有无 `event:"inject"`），或注入了但 `signals.tsv` 的 `card_receipt` 列为空。**前者是插件问题，后者是跳过规则问题，两者不许合并成一条结论**——它们的修法在不同文件里。
- 证据只认 `<case>.txt:行号`。**派发方丢弃任何不含 `<case>.txt:行号` 的返回条目**：写不出行号 = 该条不存在，不是「证据不足」。
- **证据不足一律记「证据不足」，不许记「通过」。**
- 判定人不许是跑本次实验的 agent（与自己复核自己同罪）。
- **每一臂必须有一个不给本卡指导的对照组**；对照组不出现该失败 → 本条判据无事可修，停止改卡（别把"没给指导也不出错"的事写成规则）。
- **改卡门槛**：同一失败类型在本脚手架复现 ≥2 次才动卡（同 6-6 卡「信号 ≥2 次复现才改规则」）；一次就改卡 = 把噪声写进规则。
- 实测教训：形态类问题上，只写禁令可能**比不给指导更差**。所以先跑 RED baseline，看清 agent 实际怎么跑偏，再决定写什么形态的规则。
- 本目录**不改任何卡**：结论要落成改动，走 6-6 → 对应卡 + `design/` 同步 + 中英同批。

## 臂隔离（2026-10-04 补，对照组污染）

对照污染是这套脚手架里最贵的坑。ponytail 的 `benchmarks/results/2026-06-17-agentic-safety.md:1-29` 记着：作者自己的 SessionStart hook 对**每一臂**都生效，「baseline」其实也在跑 ponytail，差距被抹平成 4%，他公开推翻了自己上一版「少 80-94% 代码」的结论，唯一活下来的是安全底线。

- 本仓同构风险：`plugin/roadbook-autoload/` 命中关键词时会往每个会话注入 `SKILL.md`——**包括你打算用来当对照的那一臂**。
- 规矩：跑之前先跑一条**空提示词 / 无关提示词**，查观测文件（默认 `<os.tmpdir()>/roadbook-autoload.jsonl`）有没有 `event:"inject"`。有 → 本轮所有臂都被污染，**只许记「证据不足」**，不许记「通过」也不许记「失败」；要么关插件重跑，要么在 `-IsolationProof` 里写明隔离方式。
- 隔离证明原样写进 `manifest.txt` 与 `summary.md`：事后可审计，不靠记忆。

## 断言区分度与观察分离（2026-10-04 补）

- **区分度**：每条判据必须能对**错的输出**说不，否则它不是判据、是装饰。反例 `file exists`——文件名在、内容全错也能过；要写成「文件存在**且**含 X 段」。自查只有一句：**这条断言在什么情况下会红？** 答不出来就删掉或改写。
- **观察与建议分离**：分析 pass **只许报观察**（恒过 / 恒败 / 高方差 / 证据不足），不许在同一 pass 里提改进建议——一旦允许提建议，分析者会开始挑「好改的」报，恒过条目被静默丢掉。建议单开一节，每条必须指回 `<case>.txt:行号`。
- 能程序化判的事（存在性、行数、字段名）一律下沉脚本：零 token 且不会忘。

## 桩文件（2026-10-04 补）

题目要预置一个**必须被改动的桩文件**（真实的坏函数、缺字段、错判据），而不是只给一句需求。三条好处：逼出真实动作（不产出改动的「嘴上做完」自动失败）、保证可评分、让「跳过规则」这类失败有落点。桩文件写在提示词目录的说明里，**不写进被注入的卡正文**（写进卡里等于把答案送出去）。

## 量表先填 / 复验 / 台账（2026-10-04 补）

- **量表先填**：见上面 `-Declare`。什么算红、这次验证哪条失败类型，跑之前定死；跑完只填结论。
- **复验（T7）**：改卡后必须复跑同一批 case。旧 RED 不复现，才把 `ledger.json` 里该条 `status` 置 `fixed` 并写 `revalidated` = 新 HEAD 短哈希；**没复跑不许写 `fixed`**。
- **台账（S21/E2/T3）**：每次 run 由脚本追加一条到 `ledger.json`（harness 命令、模型、HEAD、声明的失败类型、隔离证明、RED 清单）。「信号 ≥2 次复现才改卡」这条规则此前**没有任何累积文件撑着**；台账就是那个文件。被用户明确纠正、或被后续同代 run 打翻的结论，`status` 置 `downgraded` 并写一行反证（ECC `continuous-learning-v2`：被纠正即降置信）。

## 已知坑（PowerShell 5.1，踩过）

- **提示词进 stdin**：`$OutputEncoding` 默认 ASCII，中文会变成 `?`；**读回子进程 stdout**：`[Console]::OutputEncoding` 默认按 GBK 猜，UTF-8 输出会变乱码。脚本两头都显式钉了 UTF-8——证据落成乱码等于没有证据。
- **原生命令的 stderr**：在 PS 5.1 里变成 `ErrorRecord`，`ToString()` 只给 `System.Management.Automation.RemoteException`，真话在 `Exception.Message` 里；脚本已按此取文本。
- **`$PSScriptRoot` 在 `param()` 默认值里是空的**，只能在脚本体里解析。
- **`>` / `2>` 默认写 UTF-16LE**：落盘一律走 `[IO.File]::WriteAllText(..., UTF8Encoding($false))`。
- 本目录的 `.ps1` 必须带 UTF-8 BOM，否则 PS 5.1 按码页读会 ParserError（`_qc/check.ps1` 有断言）。
