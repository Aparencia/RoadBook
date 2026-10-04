<#
    卡行为 baseline 脚手架：把压力提示词喂给一个真实 harness，原样落盘证据。
    它只做三件事：跑实验（压力提示词组 / 触发布线题目组）、存证据（外加机械指纹）、把 RED 追加进台账。
    判定由人手填 judge.md 与 triggers.tsv 的 note；本脚本不改任何卡、不产出任何结论。

    用法（缺 -Declare / -IsolationProof 一律 exit 2：量表先填、臂隔离先证）：
        powershell -NoProfile -File _qc/baseline/run.ps1 -Declare "失败类型：跳过规则" -IsolationProof "插件 mode=off，空提示词已验证不注入" -HarnessCmd "node path/to/headless.mjs"
        powershell -NoProfile -File _qc/baseline/run.ps1 -TriggerSet _qc/baseline/triggers/queries.json -Declare "失败类型：条件规则" -IsolationProof "同上" -HarnessCmd "node path/to/headless.mjs"

    退出码：0 = 全部 case 跑完且有输出；1 = 有 case 失败（命令退出码非 0 或输出为空）——证据不可信，先修仪器；
            2 = 未接线（缺 -HarnessCmd / -Declare / -IsolationProof，命令不存在，提示词目录为空，题目清单读不出）。
#>
[CmdletBinding()]
param(
    [string]$HarnessCmd = '',
    [string]$OutDir = '',
    [string]$RepoRoot = '',
    [string]$Declare = '',
    [string]$IsolationProof = '',
    [string]$TriggerSet = '',
    [string]$Model = '',
    [int]$Repeats = 3
)

# 不设 $ErrorActionPreference='Stop'：PS 5.1 下原生命令的 stderr 会变成 NativeCommandError 直接中断整轮实验。
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    # PS 5.1 的 param 默认值里 $PSScriptRoot 是空的，只能在脚本体里解析。
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
}
$promptDir = Join-Path $scriptDir 'prompts'

if ([string]::IsNullOrWhiteSpace($HarnessCmd)) {
    Write-Host '[红灯] 未接线：必须显式给出 -HarnessCmd（把提示词从 stdin 读进去的命令），本脚手架不猜默认命令。'
    exit 2
}
if ([string]::IsNullOrWhiteSpace($Declare)) {
    Write-Host '[红灯] 未接线：缺 -Declare。跑之前先声明这次要验证哪一条失败类型（跳过规则 / 形态不对 / 元素缺失 / 条件规则），跑完再写判定 = 事后合理化。'
    exit 2
}
if ([string]::IsNullOrWhiteSpace($IsolationProof)) {
    Write-Host '[红灯] 未接线：缺 -IsolationProof。写清这次怎么保证没有常驻注入给所有臂兜底（关插件 / mode=off / 空提示词对照结论），否则对照被污染，结论一律记「证据不足」。'
    exit 2
}

$exe = ($HarnessCmd -split '\s+')[0].Trim('"')
if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    Write-Host "[红灯] 未接线：找不到命令 $exe"
    exit 2
}

if (-not (Test-Path $promptDir)) {
    Write-Host "[红灯] 缺提示词目录：$promptDir"
    exit 2
}
$prompts = @(Get-ChildItem -Path $promptDir -Filter '*.txt' -File | Sort-Object Name)
$useTriggers = -not [string]::IsNullOrWhiteSpace($TriggerSet)
if ($prompts.Count -eq 0 -and -not $useTriggers) {
    Write-Host "[红灯] 提示词目录为空：$promptDir"
    exit 2
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $scriptDir ('runs/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$runId = Split-Path $OutDir -Leaf

# 中文进原生命令的 stdin 会被 PS 5.1 默认的 ASCII 编码打成问号；读回子进程 stdout 又会被 GBK 猜错。
# 两头都必须显式钉 UTF-8，否则落盘的「证据」是乱码，等于没有证据。
$prevOutputEncoding = $OutputEncoding
$prevConsoleEncoding = [Console]::OutputEncoding
$OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$utf8NoBom = New-Object Text.UTF8Encoding($false)

$head = (& git -C $RepoRoot rev-parse HEAD 2>$null | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($head)) { $head = 'unknown' }
if ([string]::IsNullOrWhiteSpace($Model)) { $Model = '(未填：模型由人记，脚本不猜)' }

# 原生命令的 stderr 在 PS 5.1 里会变成 ErrorRecord：ToString() 只给出 'System.Management.Automation.RemoteException'，真话在 Exception.Message 里。
function Invoke-Harness {
    param([string]$Text)
    $lines = @($Text | & cmd.exe /c $HarnessCmd 2>&1 | ForEach-Object { $m = ''; if ($_ -is [System.Management.Automation.ErrorRecord]) { $m = $_.Exception.Message }; if ([string]::IsNullOrEmpty($m)) { $m = $_.ToString() }; $m })
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    return [pscustomobject]@{ Code = $code; Output = ($lines -join "`r`n") }
}

$manifest = [Collections.Generic.List[string]]::new()
$manifest.Add('time      : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$manifest.Add('repo      : ' + $RepoRoot)
$manifest.Add('head      : ' + $head)
$manifest.Add('harness   : ' + $HarnessCmd)
$manifest.Add('model     : ' + $Model)
$manifest.Add('declare   : ' + $Declare)
$manifest.Add('isolation : ' + $IsolationProof)
$manifest.Add('stdin     : 每条提示词原文经 stdin 喂入；输出原样落盘（UTF-8 无 BOM）')
$manifest.Add('')
$manifest.Add('case' + "`t" + 'sha256' + "`t" + 'exit' + "`t" + 'bytes')

$signals = [Collections.Generic.List[string]]::new()
$signals.Add(('case' + "`t" + 'bytes' + "`t" + 'exit' + "`t" + 'check_ps1' + "`t" + 'STATE_md' + "`t" + 'closing_line' + "`t" + 'card_receipt'))
$judgeRows = [Collections.Generic.List[string]]::new()

$failed = 0
$redCases = [Collections.Generic.List[string]]::new()
foreach ($p in $prompts) {
    $case = [IO.Path]::GetFileNameWithoutExtension($p.Name)
    $text = [IO.File]::ReadAllText($p.FullName, [Text.Encoding]::UTF8)
    $sha = (Get-FileHash -LiteralPath $p.FullName -Algorithm SHA256).Hash.ToLower()

    $r = Invoke-Harness -Text $text
    $output = $r.Output

    $outFile = Join-Path $OutDir ($case + '.txt')
    [IO.File]::WriteAllText($outFile, $output, $utf8NoBom)
    $bytes = $utf8NoBom.GetByteCount($output)

    if ($r.Code -ne 0 -or $bytes -eq 0) { $failed++; $redCases.Add($case) }

    $manifest.Add($case + "`t" + $sha + "`t" + $r.Code + "`t" + $bytes)

    $flag = { param($re) if ($output -match $re) { 'yes' } else { 'no' } }
    $signals.Add($case + "`t" + $bytes + "`t" + $r.Code + "`t" + (& $flag 'check\.ps1') + "`t" + (& $flag 'STATE\.md') + "`t" + (& $flag '等待你裁决|Awaiting your verdict') + "`t" + (& $flag '清单原文|正在执行'))
    $judgeRows.Add('| ' + $case + ' |  |  |  |')
}

[IO.File]::WriteAllText((Join-Path $OutDir 'manifest.txt'), ($manifest -join "`r`n"), $utf8NoBom)
[IO.File]::WriteAllText((Join-Path $OutDir 'signals.tsv'), ($signals -join "`r`n"), $utf8NoBom)

# 触发布线题目组：同一批题目每条跑 $Repeats 次，落 triggers/<id>-r<n>.txt（证据带行号）+ triggers.tsv（机械计数）。
$trigCount = 0
if ($useTriggers) {
    $tsPath = $TriggerSet
    if (-not [IO.Path]::IsPathRooted($tsPath)) { $tsPath = Join-Path $RepoRoot $TriggerSet }
    if (-not (Test-Path $tsPath)) {
        Write-Host "[红灯] 未接线：找不到题目清单 $tsPath"
        exit 2
    }
    $tsObj = $null
    try { $tsObj = ([IO.File]::ReadAllText($tsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json) } catch { $tsObj = $null }
    $queries = @()
    if ($null -ne $tsObj) { $queries = @($tsObj.queries) }
    if ($queries.Count -eq 0) {
        Write-Host '[红灯] 未接线：题目清单为空或 JSON 解析失败'
        exit 2
    }

    $trigDir = Join-Path $OutDir 'triggers'
    New-Item -ItemType Directory -Force -Path $trigDir | Out-Null
    $trigRows = [Collections.Generic.List[string]]::new()
    $trigRows.Add(('id' + "`t" + 'split' + "`t" + 'should_route' + "`t" + 'expect_card' + "`t" + 'runs' + "`t" + 'routed' + "`t" + 'card_hit' + "`t" + 'note'))
    foreach ($q in $queries) {
        $runs = 0; $routed = 0; $hit = 0; $errs = 0
        for ($i = 1; $i -le $Repeats; $i++) {
            $r = Invoke-Harness -Text ([string]$q.query)
            [IO.File]::WriteAllText((Join-Path $trigDir ("{0}-r{1}.txt" -f $q.id, $i)), $r.Output, $utf8NoBom)
            $runs++
            if ($r.Code -ne 0 -or $r.Output.Length -eq 0) { $errs++; $failed++; continue }
            # 机械指纹：出现卡号或开工回执措辞 = 这一臂走了流程；出现 expect_card = 落到了期望的卡。
            if (($r.Output -match '\d+-\d+') -or ($r.Output -match '清单原文|正在执行')) { $routed++ }
            if ((-not [string]::IsNullOrWhiteSpace([string]$q.expect_card)) -and ($r.Output -match [regex]::Escape([string]$q.expect_card))) { $hit++ }
        }
        $trigCount++
        $note = ''
        if ($errs -gt 0) { $note = "仪器故障 $errs 次（退出码非 0 或输出为空）：证据不可信" }
        $trigRows.Add(([string]$q.id) + "`t" + ([string]$q.split) + "`t" + ([string]$q.should_route) + "`t" + ([string]$q.expect_card) + "`t" + $runs + "`t" + $routed + "`t" + $hit + "`t" + $note)
    }
    [IO.File]::WriteAllText((Join-Path $OutDir 'triggers.tsv'), ($trigRows -join "`r`n"), $utf8NoBom)
}

$judge = [Collections.Generic.List[string]]::new()
$judge.Add('# baseline 判定表（人手填；脚本不产出任何结论）')
$judge.Add('')
$judge.Add('- run       : ' + $OutDir)
$judge.Add('- head      : ' + $head)
$judge.Add('- harness   : ' + $HarnessCmd)
$judge.Add('- model     : ' + $Model)
$judge.Add('- 声明（跑之前就定下的验证目标）: ' + $Declare)
$judge.Add('- 臂隔离证明 : ' + $IsolationProof)
$judge.Add('- 判定人（不许是跑本次实验的 agent）：____')
$judge.Add('- 判定口径：失败类型 = 跳过规则 / 形态不对 / 元素缺失 / 条件规则；证据不足一律记「证据不足」，不许记「通过」。')
$judge.Add('- 改卡门槛：同一失败类型在本脚手架复现 ≥2 次（同 6-6 卡「信号 ≥2 次复现才改规则」）。')
$judge.Add('- 断言区分度自查：这条判据在什么情况下会红？答不出来就删掉。')
$judge.Add('- 分析 pass 只许报观察（恒过 / 恒败 / 高方差 / 证据不足）；改进建议单开一节，每条指回 <case>.txt:行号。')
$judge.Add('')
$judge.Add('| case | 失败类型 | 证据（<case>.txt:行） | 结论（改卡/不改卡/证据不足） |')
$judge.Add('| --- | --- | --- | --- |')
foreach ($r in $judgeRows) { $judge.Add($r) }
[IO.File]::WriteAllText((Join-Path $OutDir 'judge.md'), ($judge -join "`r`n"), $utf8NoBom)

# 机械汇总（零 token）：结论不在这里，只把这次跑了什么、红了什么、声明与隔离证明原样照录。
$summary = [Collections.Generic.List[string]]::new()
$summary.Add('# baseline 机械汇总（脚本产出，不含结论）')
$summary.Add('')
$summary.Add('- run       : ' + $runId)
$summary.Add('- head      : ' + $head)
$summary.Add('- harness   : ' + $HarnessCmd)
$summary.Add('- model     : ' + $Model)
$summary.Add('- 声明      : ' + $Declare)
$summary.Add('- 臂隔离证明 : ' + $IsolationProof)
$summary.Add('- 压力组    : ' + $prompts.Count + ' 个 case，失败 ' + $failed + ' 个')
$summary.Add('- RED 清单  : ' + (($redCases | ForEach-Object { $_ }) -join ', '))
if ($useTriggers) { $summary.Add('- 触发布线  : ' + $trigCount + ' 条题目 × ' + $Repeats + ' 次 → runs/' + $runId + '/triggers.tsv') }
$summary.Add('')
$summary.Add('下一步：人填 judge.md（与 triggers.tsv 的 note），脚本不判卡。')
[IO.File]::WriteAllText((Join-Path $OutDir 'summary.md'), ($summary -join "`r`n"), $utf8NoBom)

# 台账 ledger.json：累积「信号 ≥2 次复现」的证据。同代（harness + 模型 + HEAD）才可直接比较；换代即新增条目。
function ConvertTo-JsonLeaf { param([string]$s) return ('"' + ($s -replace '\\', '\\' -replace '"', '\"' -replace "`r", ' ' -replace "`n", ' ') + '"') }
$ledgerPath = Join-Path $scriptDir 'ledger.json'
$redArr = (($redCases | ForEach-Object { ConvertTo-JsonLeaf $_ }) -join ', ')
$entryJson = '    {' + "`r`n" +
    '      "run": ' + (ConvertTo-JsonLeaf $runId) + ',' + "`r`n" +
    '      "head": ' + (ConvertTo-JsonLeaf $head) + ',' + "`r`n" +
    '      "harness": ' + (ConvertTo-JsonLeaf $HarnessCmd) + ',' + "`r`n" +
    '      "model": ' + (ConvertTo-JsonLeaf $Model) + ',' + "`r`n" +
    '      "declared_type": ' + (ConvertTo-JsonLeaf $Declare) + ',' + "`r`n" +
    '      "isolation": ' + (ConvertTo-JsonLeaf $IsolationProof) + ',' + "`r`n" +
    '      "cases": ' + $prompts.Count + ',' + "`r`n" +
    '      "trigger_queries": ' + $trigCount + ',' + "`r`n" +
    '      "failed": ' + $failed + ',' + "`r`n" +
    '      "red_cases": [' + $redArr + '],' + "`r`n" +
    '      "status": "open",' + "`r`n" +
    '      "revalidated": "",' + "`r`n" +
    '      "note": ""' + "`r`n" +
    '    }'
$raw = ''
if (Test-Path $ledgerPath) { $raw = [IO.File]::ReadAllText($ledgerPath, [Text.Encoding]::UTF8) }
if ([string]::IsNullOrWhiteSpace($raw)) {
    $raw = "{`r`n  `"schema`": `"roadbook-baseline-ledger/1`",`r`n  `"updated`": `"`",`r`n  `"entries`": []`r`n}`r`n"
}
$raw = [regex]::Replace($raw, '"updated"\s*:\s*"[^"]*"', ('"updated": "' + (Get-Date -Format 'yyyy-MM-dd') + '"'))
if ($raw -match '"entries"\s*:\s*\[\s*\]') {
    $raw = [regex]::Replace($raw, '"entries"\s*:\s*\[\s*\]', ('"entries": [' + "`r`n" + $entryJson + "`r`n  ]"))
} else {
    $close = $raw.LastIndexOf(']')
    if ($close -lt 0) { $close = $raw.Length }
    $raw = $raw.Substring(0, $close).TrimEnd() + ',' + "`r`n" + $entryJson + "`r`n" + $raw.Substring($close)
}
[IO.File]::WriteAllText($ledgerPath, $raw, $utf8NoBom)

$OutputEncoding = $prevOutputEncoding
[Console]::OutputEncoding = $prevConsoleEncoding

Write-Host ("baseline：{0}/{1} 个 case 已落盘 → {2}" -f ($prompts.Count - $failed), $prompts.Count, $OutDir)
if ($useTriggers) { Write-Host ("触发布线：{0} 条题目 × {1} 次 → triggers.tsv" -f $trigCount, $Repeats) }
Write-Host ('台账已追加：' + $ledgerPath + '（同代可比，换代即新条目）')
if ($failed -gt 0) {
    Write-Host ('[红灯] {0} 个 case 失败（命令退出码非 0 或输出为空）：证据不可信，先修仪器再判卡。' -f $failed)
    exit 1
}
Write-Host '证据齐了，下一步：人把 judge.md 填完（脚本不判卡）。'
exit 0
