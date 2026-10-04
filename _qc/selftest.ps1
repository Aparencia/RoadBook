<#
    仪器自检：先证明「仪器能区分好坏」，再拿仪器去测卡。
    _qc/check.ps1 是母版唯一的验收仪器。它自己会不会假绿（该红不红）？本脚本用同一份仪器跑一组参照实现：
      good：当前仓库原样 → 必须退出码 0
      bad ：四类已知破坏（缺必需文件 / 脚本丢 BOM / 卡 H1 形态被改 / 出现 _archive/）→ 必须退出码非 0
    任何一条不符合预期 = 仪器缺陷：先修仪器，别急着改卡（ponytail 的 benchmarks/agentic/tasks.py:8-21 是同一做法）。

    用法：powershell -NoProfile -File _qc/selftest.ps1
    退出码：0 = 全部用例符合预期；1 = 有仪器缺陷（假绿或假红），或复原失败；2 = 未接线（缺 check.ps1 / 非 git 工作树 / 工作树不干净）。
    本脚本会临时改动工作树文件，每个用例都在 finally 里按原字节复原，收尾再验 porcelain 与开跑前完全一致（施工中允许工作树是脏的）。
#>
[CmdletBinding()]
param()
$repoRoot = Split-Path -Parent $PSScriptRoot
$checkPs1 = Join-Path $repoRoot '_qc/check.ps1'

if (-not (Test-Path $checkPs1)) { Write-Host '[红灯] 未接线：缺 _qc/check.ps1'; exit 2 }
& git -C $repoRoot rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Write-Host '[红灯] 未接线：不是 git 工作树'; exit 2 }
# 允许脏树（施工中就应该是脏的），但收尾必须与开跑前的 porcelain 完全一致：
# 否则分不清「本来就有改动」和「哪个用例没复原」。
$before = @(& git -C $repoRoot status --porcelain | Sort-Object)

$utf8Bom = New-Object Text.UTF8Encoding($true)
$utf8NoBom = New-Object Text.UTF8Encoding($false)

function Get-CheckExit {
    & powershell -NoProfile -File $checkPs1 *> $null
    return $LASTEXITCODE
}

$script:uiPath = Join-Path $repoRoot 'template\docs\UI.md'
$script:gatePath = Join-Path $repoRoot 'template\gate.ps1'
$script:cardPath = Join-Path $repoRoot 'playbook\4-1-分批编码.md'
$script:cardText = [IO.File]::ReadAllText($script:cardPath, [Text.Encoding]::UTF8)
$script:archiveDir = Join-Path $repoRoot '_archive'

$cases = @(
    [pscustomobject]@{
        Name = 'good：当前仓库原样'
        Expect = 0
        Break = { }
        Restore = { }
    },
    [pscustomobject]@{
        Name = 'bad：必需文件缺失（template/docs/UI.md 改名）'
        Expect = 1
        Break = { Move-Item -LiteralPath $script:uiPath -Destination ($script:uiPath + '.bak') -Force }
        Restore = { if (Test-Path ($script:uiPath + '.bak')) { Move-Item -LiteralPath ($script:uiPath + '.bak') -Destination $script:uiPath -Force } }
    },
    [pscustomobject]@{
        Name = 'bad：脚本丢 BOM（template/gate.ps1）'
        Expect = 1
        Break = { [IO.File]::WriteAllText($script:gatePath, [IO.File]::ReadAllText($script:gatePath, [Text.Encoding]::UTF8), $utf8NoBom) }
        Restore = { [IO.File]::WriteAllText($script:gatePath, [IO.File]::ReadAllText($script:gatePath, [Text.Encoding]::UTF8), $utf8Bom) }
    },
    [pscustomobject]@{
        Name = 'bad：卡 H1 形态被改（playbook/4-1 批编码 去掉「# 卡 」）'
        Expect = 1
        Break = { [IO.File]::WriteAllText($script:cardPath, $script:cardText.Replace('# 卡 4-1 ·', '# 4-1 ·'), $utf8NoBom) }
        Restore = { [IO.File]::WriteAllText($script:cardPath, $script:cardText, $utf8NoBom) }
    },
    [pscustomobject]@{
        Name = 'bad：出现 _archive/（V5 残件反向断言）'
        Expect = 1
        Break = { New-Item -ItemType Directory -Force -Path $script:archiveDir | Out-Null }
        Restore = { if (Test-Path $script:archiveDir) { Remove-Item -LiteralPath $script:archiveDir -Recurse -Force } }
    }
)

Write-Host '仪器自检：同一份 _qc/check.ps1 跑 1 个 good + 4 个 bad 参照实现'
$bad = 0
foreach ($c in $cases) {
    $code = -1
    try {
        & $c.Break
        $code = Get-CheckExit
    } finally {
        & $c.Restore
    }
    $ok = ($code -eq $c.Expect)
    if (-not $ok) { $bad++ }
    $tag = 'FAIL'
    if ($ok) { $tag = 'OK' }
    Write-Host ("  [{0}] {1} → 退出码 {2}（期望 {3}）" -f $tag, $c.Name, $code, $c.Expect)
}

$after = @(& git -C $repoRoot status --porcelain | Sort-Object)
$diff = @(Compare-Object -ReferenceObject $before -DifferenceObject $after)
if ($diff.Count -gt 0) {
    Write-Host ("[红灯] 复原失败：收尾工作树与开跑前不一致（{0} 处差异），先手工修回：" -f $diff.Count)
    $diff | ForEach-Object { Write-Host ('  ' + $_.InputObject) }
    exit 1
}
if ($bad -gt 0) {
    Write-Host ("[红灯] 仪器缺陷 {0}/{1}：该红的没红、或该绿的没绿，先修 _qc/check.ps1。" -f $bad, $cases.Count)
    exit 1
}
Write-Host ("仪器自检通过：{0}/{0} 用例符合预期（好的必过、坏的必被抓住）。" -f $cases.Count)
exit 0
