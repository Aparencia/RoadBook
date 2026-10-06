# _qc/check-docs.ps1 · 文档域断言（母版侧；由 _qc/check.ps1 调用，也可单独运行）
# 用法：powershell -NoProfile -File _qc/check-docs.ps1
# 退出码：0=全过；1=有失败项（逐条打印，可直接贴进回执）
#
# 为什么单独一个文件：_qc/check.ps1 自身有行数上限（design §8），而文档域的登记此前是
# **一份写死的 4 项清单**——`$newDocs = @('UI.md','DESIGN_TOKENS.md','MOTION.md','refactor/')`，
# 它是 2026-10-04 加 UI/UX 文档时钉下的。之后再新增文档（实测：5-7 卡的产物 docs/BASELINE.md）
# 没有任何机制会问一句，五处登记缺了四处，而门禁照旧全绿。
# 卡维度早在 design §10 第 21 条就改成了「从 §4 表解析、不硬编码卡名」；本文件是文档维度的同一次改造。
#
# 三条断言（全部零 token、纯文本层）：
#   A1a 卡产物 → 对应表：每张卡头部「产物：」里的每个 docs/ 路径，都要有对应表槽位覆盖
#   A1b 对应表 → design：对应表每一行的首段都要在 design 全文出现（§5 目录树）
#   A1c $budget ↔ 对应表：docs/ 开头的行数上限，两处必须同源
#
# 判据口径（写在这里，免得下次改断言时凭印象）：
#   「覆盖」= 取 token 去掉 docs/ 前缀后的**首段**，与对应表某行路径的首段相等。
#   已知放宽：registry/COMPONENTS.md 与 registry/APIS.md 共用首段 registry，DATA_DICT 同理——
#   松一点优于误报（假红比不检查更坏）。
#   条件文档（LICENSE / openapi.yaml / 触发才建的 BASELINE.md）不进 $budget——既有的
#   $budget 循环对「表里有、磁盘没有」是判红的，所以条件文档只有对应表行、没有预算项。

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
$root = Split-Path -Parent $PSScriptRoot
$fail = @()
$pass = 0
function Check($ok, $msg) {
    if ($ok) { Write-Host "  [docs][OK] $msg"; $script:pass++ }
    else { Write-Host "  [docs][FAIL] $msg" -ForegroundColor Red; $script:fail += $msg }
}

# ── 输入一：docs/README.md 的对应表（首列 = 槽位路径）──────────────────────────
$drmPath = Join-Path $root 'template\docs\README.md'
$rows = @()
if (Test-Path $drmPath) {
    foreach ($ln in [IO.File]::ReadAllLines($drmPath, [Text.Encoding]::UTF8)) {
        if (-not $ln.StartsWith('|')) { continue }
        $cells = @($ln.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
        if ($cells.Count -lt 2) { continue }
        $p = $cells[0] -replace '（[^）]*）', ''
        if ($p -eq '' -or $p -eq '文件路径' -or $p -match '^[:\-\s]+$') { continue }
        $seg = ($p -replace '<[^>]*>', '').Split('/')[0]
        if ($seg -eq '') { continue }
        $rows += [pscustomobject]@{ Raw = $ln; Path = $p; Seg = $seg }
    }
}
Check ($rows.Count -ge 20) "从 docs/README.md 解析出对应表槽位 $($rows.Count) 行（<20 = 解析器空心，断言会变成恒真）"
$slotSeg = @($rows | ForEach-Object { $_.Seg } | Select-Object -Unique)

# ── A1a：卡头的「产物：」字段 → 对应表必须有槽位 ────────────────────────────────
$missA1a = @()
foreach ($f in @(Get-ChildItem (Join-Path $root 'playbook') -Filter '*.md' -File -ErrorAction SilentlyContinue)) {
    $head = @([IO.File]::ReadAllLines($f.FullName, [Text.Encoding]::UTF8) | Where-Object { $_.StartsWith('> 触发') })
    if ($head.Count -eq 0) { continue }
    $m = [regex]::Match($head[0], '产物：([^｜|]*)')
    if (-not $m.Success) { continue }
    foreach ($hit in [regex]::Matches($m.Groups[1].Value, 'docs/[^\s，、。；：+＋|（）()「」【】〔〕]+')) {
        $tok = $hit.Value -replace '`', '' -replace '"', '' -replace "'", ''
        $tok = ($tok -split '「')[0]          # `docs/RUNBOOK.md「环境与配置」节` 这类：节名不是路径的一部分
        $tok = $tok -replace '[。；;、，,]+$', ''
        $seg = ($tok -replace '^docs/', '').Split('/')[0]
        if ($slotSeg -notcontains $seg) { $missA1a += "$($f.BaseName) → $tok" }
    }
}
Check (-not $missA1a) "A1a 卡产物里的每个 docs/ 路径都有对应表槽位（缺：$($missA1a -join '；')）"

# ── A1b：对应表每一行 → design 全文 ───────────────────────────────────────────
$designTxt = if (Test-Path (Join-Path $root 'design\v6-design.md')) { [IO.File]::ReadAllText((Join-Path $root 'design\v6-design.md'), [Text.Encoding]::UTF8) } else { '' }
Check ($designTxt.Length -gt 0) 'design/v6-design.md 可读（A1b 的前提）'
$missA1b = @($rows | Where-Object { $designTxt -notmatch [regex]::Escape($_.Seg) })
Check (-not $missA1b) "A1b 对应表每行的首段都在 design 全文里（缺：$(($missA1b | ForEach-Object { $_.Path }) -join ', ')）"

# ── A1c：$budget 的 docs/ 项 ↔ 对应表上限同源 ────────────────────────────────
# $budget 的事实源在 _qc/check.ps1（不在这里复制一份 —— 复制就是第二处真相）。
$ckTxt = [IO.File]::ReadAllText((Join-Path $root '_qc\check.ps1'), [Text.Encoding]::UTF8)
$budgetLine = @($ckTxt -split "`n" | Where-Object { $_ -match '\$budget\s*=\s*@\{' })
$budget = [ordered]@{}
if ($budgetLine.Count -gt 0) {
    foreach ($m in [regex]::Matches($budgetLine[0], "'([^']+)'\s*=\s*(\d+)")) { $budget[$m.Groups[1].Value] = [int]$m.Groups[2].Value }
}
Check ($budget.Count -ge 15) "从 _qc/check.ps1 解析出 `$budget $($budget.Count) 项（<15 = 解析器空心）"
$noRow = @(); $badCap = @()
foreach ($k in @($budget.Keys | Where-Object { $_.StartsWith('docs/') })) {
    $rel = $k.Substring(5)
    $row = @($rows | Where-Object { $_.Path -eq $rel -or ($_.Path.EndsWith('/') -and $rel.StartsWith($_.Path)) })
    if ($row.Count -eq 0) { $noRow += $k; continue }
    if ($row[0].Raw -notmatch ('≤' + $budget[$k])) { $badCap += "$k（check.ps1 写 $($budget[$k])，对应表行未写 ≤$($budget[$k])）" }
}
Check (-not $noRow) "A1c `$budget 的 docs/ 项都有对应表行（缺：$($noRow -join ', ')）"
Check (-not $badCap) "A1c 行数上限两处同源（不一致：$($badCap -join '；')）"

# ── B2：文档义务表 DOC_MAP.json（机器判据数据；template/gate.ps1 读它做提交前拦截）──────
# 这里只核对「判据数据自洽且不悬空」；真正拦提交的是 gate.ps1（项目侧），本脚本是母版侧。
$mapPath = Join-Path $root 'template\DOC_MAP.json'
$map = $null
if (Test-Path -LiteralPath $mapPath) { try { $map = [IO.File]::ReadAllText($mapPath, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { $map = $null } }
Check ($null -ne $map) 'template/DOC_MAP.json 存在且 JSON 合法（文档义务的机器判据数据）'
if ($null -ne $map) {
    Check ([string]$map.schema -eq 'roadbook-docmap/1') "DOC_MAP schema = roadbook-docmap/1（实际：$($map.schema)）"
    $gotIds = @($map.rules | ForEach-Object { [string]$_.id })
    $missIds = @(@('new-file', 'new-export', 'new-route', 'new-env-key', 'new-migration') | Where-Object { $gotIds -notcontains $_ })
    Check (-not $missIds) "DOC_MAP 五条硬形态齐（缺：$($missIds -join ', ')；只做能机械判定的形态——路径 glob 会把改 typo 也判红 = 假红）"
    $agTxt2 = if (Test-Path (Join-Path $root 'template\AGENTS.md')) { [IO.File]::ReadAllText((Join-Path $root 'template\AGENTS.md'), [Text.Encoding]::UTF8) } else { '' }
    $badRules = @($map.rules | Where-Object { @($_.docs).Count -eq 0 -or ($_.d13 -and $agTxt2 -notmatch [regex]::Escape([string]$_.d13)) } | ForEach-Object { [string]$_.id })
    Check (-not $badRules) "DOC_MAP 每条规则都给了 docs、且 d13 逐字引用 AGENTS.md 的义务行首（问题项：$($badRules -join ', ')；引用一条不存在的义务 = 判据悬空）"
    $dis = @($map.rules | Where-Object { $_.disabled } | ForEach-Object { [string]$_.id })
    $smTxt2 = if (Test-Path (Join-Path $root 'template\STATE.md')) { [IO.File]::ReadAllText((Join-Path $root 'template\STATE.md'), [Text.Encoding]::UTF8) } else { '' }
    $disMiss = @($dis | Where-Object { $smTxt2 -notmatch [regex]::Escape($_) })
    Check (-not $disMiss) "DOC_MAP 里 disabled 的规则在 template/STATE.md 裁剪记录可见（缺：$($disMiss -join ', ')；静默关掉义务 = 判据消失而没人知道）"
}

Write-Host "文档域：通过 $pass 项；失败 $($fail.Count) 项"
if ($fail.Count -gt 0) {
    $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host '文档域断言未过：先补对应表/design 登记，再复跑' -ForegroundColor Red
    exit 1
}
exit 0
