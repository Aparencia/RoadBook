<#
    卡行为 baseline 脚手架：把压力提示词喂给一个真实 harness，原样落盘证据。
    它只做两件事：跑实验、存证据（外加机械指纹）。判定由人填 judge.md，本脚本不改任何卡。

    用法（提示词原文经 stdin 喂入 harness）：
        powershell -NoProfile -File _qc/baseline/run.ps1 -HarnessCmd "node path/to/headless.mjs"

    退出码：0 = 全部 case 跑完且有输出；1 = 有 case 失败（命令退出码非 0 或输出为空）；
            2 = 未接线（没给 -HarnessCmd，或命令不存在，或提示词目录为空）——不猜默认命令。
#>
[CmdletBinding()]
param(
    [string]$HarnessCmd = '',
    [string]$OutDir = '',
    [string]$RepoRoot = ''
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
if ($prompts.Count -eq 0) {
    Write-Host "[红灯] 提示词目录为空：$promptDir"
    exit 2
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $scriptDir ('runs/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# 中文进原生命令的 stdin 会被 PS 5.1 默认的 ASCII 编码打成问号；读回子进程 stdout 又会被 GBK 猜错。
# 两头都必须显式钉 UTF-8，否则落盘的「证据」是乱码，等于没有证据。
$prevOutputEncoding = $OutputEncoding
$prevConsoleEncoding = [Console]::OutputEncoding
$OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$utf8NoBom = New-Object Text.UTF8Encoding($false)

$head = (& git -C $RepoRoot rev-parse HEAD 2>$null | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($head)) { $head = 'unknown' }

$manifest = [Collections.Generic.List[string]]::new()
$manifest.Add('time    : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$manifest.Add('repo    : ' + $RepoRoot)
$manifest.Add('head    : ' + $head)
$manifest.Add('harness : ' + $HarnessCmd)
$manifest.Add('stdin   : 每条提示词原文经 stdin 喂入；输出原样落盘（UTF-8 无 BOM）')
$manifest.Add('')
$manifest.Add('case' + "`t" + 'sha256' + "`t" + 'exit' + "`t" + 'bytes')

$signals = [Collections.Generic.List[string]]::new()
$signals.Add(('case' + "`t" + 'bytes' + "`t" + 'exit' + "`t" + 'check_ps1' + "`t" + 'STATE_md' + "`t" + 'closing_line' + "`t" + 'card_receipt'))
$judgeRows = [Collections.Generic.List[string]]::new()

$failed = 0
foreach ($p in $prompts) {
    $case = [IO.Path]::GetFileNameWithoutExtension($p.Name)
    $text = [IO.File]::ReadAllText($p.FullName, [Text.Encoding]::UTF8)
    $sha = (Get-FileHash -LiteralPath $p.FullName -Algorithm SHA256).Hash.ToLower()

    # 原生命令的 stderr 在 PS 5.1 里会变成 ErrorRecord：ToString() 只给出 'System.Management.Automation.RemoteException'，真话在 Exception.Message 里。
    $lines = @($text | & cmd.exe /c $HarnessCmd 2>&1 | ForEach-Object { $m = ''; if ($_ -is [System.Management.Automation.ErrorRecord]) { $m = $_.Exception.Message }; if ([string]::IsNullOrEmpty($m)) { $m = $_.ToString() }; $m })
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    $output = ($lines -join "`r`n")

    $outFile = Join-Path $OutDir ($case + '.txt')
    [IO.File]::WriteAllText($outFile, $output, $utf8NoBom)
    $bytes = $utf8NoBom.GetByteCount($output)

    if ($code -ne 0 -or $bytes -eq 0) { $failed++ }

    $manifest.Add($case + "`t" + $sha + "`t" + $code + "`t" + $bytes)

    $flag = { param($re) if ($output -match $re) { 'yes' } else { 'no' } }
    $signals.Add($case + "`t" + $bytes + "`t" + $code + "`t" + (& $flag 'check\.ps1') + "`t" + (& $flag 'STATE\.md') + "`t" + (& $flag '等待你裁决|Awaiting your verdict') + "`t" + (& $flag '清单原文|正在执行'))
    $judgeRows.Add('| ' + $case + ' |  |  |  |')
}

[IO.File]::WriteAllText((Join-Path $OutDir 'manifest.txt'), ($manifest -join "`r`n"), $utf8NoBom)
[IO.File]::WriteAllText((Join-Path $OutDir 'signals.tsv'), ($signals -join "`r`n"), $utf8NoBom)

$judge = [Collections.Generic.List[string]]::new()
$judge.Add('# baseline 判定表（人手填；脚本不产出任何结论）')
$judge.Add('')
$judge.Add('- run     : ' + $OutDir)
$judge.Add('- head    : ' + $head)
$judge.Add('- harness : ' + $HarnessCmd)
$judge.Add('- 判定人（不许是跑本次实验的 agent）：____')
$judge.Add('- 判定口径：失败类型 = 跳过规则 / 形态不对 / 元素缺失 / 条件规则；证据不足一律记「证据不足」，不许记「通过」。')
$judge.Add('- 改卡门槛：同一失败类型在本脚手架复现 ≥2 次（同 6-6 卡「信号 ≥2 次复现才改规则」）。')
$judge.Add('')
$judge.Add('| case | 失败类型 | 证据（<case>.txt:行） | 结论（改卡/不改卡/证据不足） |')
$judge.Add('| --- | --- | --- | --- |')
foreach ($r in $judgeRows) { $judge.Add($r) }
[IO.File]::WriteAllText((Join-Path $OutDir 'judge.md'), ($judge -join "`r`n"), $utf8NoBom)

$OutputEncoding = $prevOutputEncoding
[Console]::OutputEncoding = $prevConsoleEncoding

Write-Host ("baseline：{0}/{1} 个 case 已落盘 → {2}" -f ($prompts.Count - $failed), $prompts.Count, $OutDir)
if ($failed -gt 0) {
    Write-Host ('[红灯] {0} 个 case 失败（命令退出码非 0 或输出为空）：证据不可信，先修仪器再判卡。' -f $failed)
    exit 1
}
Write-Host '证据齐了，下一步：人把 judge.md 填完（脚本不判卡）。'
exit 0
