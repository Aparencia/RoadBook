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

## 怎么跑

```powershell
powershell -NoProfile -File _qc/baseline/run.ps1 -HarnessCmd "node path/to/headless.mjs"
```

- **接线契约**：`-HarnessCmd` 指定的命令必须从 **stdin** 读整条提示词，把会话输出打到 **stdout**。脚手架不解析参数、不猜 flag。
- **退出码**：`0` = 全部 case 跑完且有输出；`1` = 有 case 失败（退出码非 0 或输出为空）——证据不可信，先修仪器；`2` = 未接线（没给 `-HarnessCmd`、命令不存在、提示词目录为空）。
- **为什么没有默认命令**：本机探针实测 `dsh` 的 PATH shim 指向一个过期 checkout，直接跑报 `Cannot find module ...\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js`；正在运行的 GUI 走 `resources/app.asar`。探针给的结论是「没有可用的 headless CLI」，所以脚手架**不猜命令**：未接线就红（与 `template/check.ps1` 的 `$STEPS` 为空同口径）。
- `-OutDir` 可以指定到别处（例如临时目录），默认写 `runs/<时间戳>/`。

## 判定口径（人填，脚本不产出结论）

- 跑之前先写下这次要验证哪一条失败类型：**跳过规则 / 形态不对 / 元素缺失 / 条件规则**。
- 证据只认 `<case>.txt:行号`。写不出行号 = 证据不足。
- **证据不足一律记「证据不足」，不许记「通过」。**
- 判定人不许是跑本次实验的 agent（与自己复核自己同罪）。
- **改卡门槛**：同一失败类型在本脚手架复现 ≥2 次才动卡（同 6-6 卡「信号 ≥2 次复现才改规则」）；一次就改卡 = 把噪声写进规则。
- 实测教训：形态类问题上，只写禁令可能**比不给指导更差**。所以先跑 RED baseline，看清 agent 实际怎么跑偏，再决定写什么形态的规则。
- 本目录**不改任何卡**：结论要落成改动，走 6-6 → 对应卡 + `design/` 同步 + 中英同批。

## 已知坑（PowerShell 5.1，踩过）

- **提示词进 stdin**：`$OutputEncoding` 默认 ASCII，中文会变成 `?`；**读回子进程 stdout**：`[Console]::OutputEncoding` 默认按 GBK 猜，UTF-8 输出会变乱码。脚本两头都显式钉了 UTF-8——证据落成乱码等于没有证据。
- **原生命令的 stderr**：在 PS 5.1 里变成 `ErrorRecord`，`ToString()` 只给 `System.Management.Automation.RemoteException`，真话在 `Exception.Message` 里；脚本已按此取文本。
- **`$PSScriptRoot` 在 `param()` 默认值里是空的**，只能在脚本体里解析。
- **`>` / `2>` 默认写 UTF-16LE**：落盘一律走 `[IO.File]::WriteAllText(..., UTF8Encoding($false))`。
- 本目录的 `.ps1` 必须带 UTF-8 BOM，否则 PS 5.1 按码页读会 ParserError（`_qc/check.ps1` 有断言）。
