# doctor.ps1 · 环境自检（每个必需工具输出版本号，并与 .tool-versions 的期望版本比对）
# 判词：绿 = 工具在位且与期望版本同 major；红 = 缺工具/版本不符/占位符待填/版本解析不到（exit 1）；灰 = 未被要求的探测项。
# 唯一事实源是根目录 `.tool-versions`（两种写法都认：「工具 = 版本」与「工具 版本」）——1-2 / 1-3 卡把占位符 <...> 换成真实版本，
# 所以"必需工具清单为空"不再等于"没有要求"：清单空 = 无人接线 = 红灯。
# 用法：powershell -NoProfile -File doctor.ps1
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PROBE = @('git','node','python','pip','pnpm','docker','uv','go','cargo','java','dotnet','psql')   # 探测池：谁必需由 .tool-versions 决定
# asdf/mise 插件名 ≠ 本机二进制名（.tool-versions 写 asdf 名，探测/版本比对用二进制名），故需这张映射表。
$ALIAS = @{ nodejs='node'; postgres='psql'; postgresql='psql'; python3='python'; golang='go'; rust='cargo' }
function Bin($n) { if ($ALIAS.ContainsKey($n)) { return [string]$ALIAS[$n] } return [string]$n }
$tv = Join-Path $PSScriptRoot '.tool-versions'
$want = @{}; $miss = 0
if (-not (Test-Path -LiteralPath $tv)) {
    Write-Host "[WARN] 缺 .tool-versions：必需工具与期望版本无从判定（1-2 / 1-3 卡接入必须建立该文件）" -ForegroundColor Yellow
    $miss++
} else {
    # 非 UTF-8 不许静默：WARN + 按本地编码兜底，否则一个中文注释就能把整份清单读成空表。
    $raw = ''
    try { $raw = [IO.File]::ReadAllText($tv, (New-Object Text.UTF8Encoding($false, $true))) }
    catch {
        Write-Host "[WARN] .tool-versions 不是合法 UTF-8（$($_.Exception.Message)）：已按本地编码兜底读取，请另存为 UTF-8" -ForegroundColor Yellow
        $miss++; $raw = [IO.File]::ReadAllText($tv)
    }
    foreach ($ln in ($raw -split "`r?`n")) {
        $t = $ln.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $m = [regex]::Match($t, '^([A-Za-z0-9_.\-]+)\s*=\s*(.+)$')
        if (-not $m.Success) { $m = [regex]::Match($t, '^(\S+)\s+(\S+)$') }
        if ($m.Success) { $want[$m.Groups[1].Value.ToLower()] = $m.Groups[2].Value.Trim() }
    }
    if ($want.Count -eq 0) { Write-Host "[WARN] .tool-versions 没有可解析的版本行：必需工具清单为空（等于没接线）" -ForegroundColor Yellow; $miss++ }
}
$names = @(@($PROBE) + @($want.Keys) | Select-Object -Unique)
foreach ($t in $names) {
    $need = $want[$t]; $bin = Bin $t
    if ($null -eq $need) {
        $covered = $false
        foreach ($k in @($want.Keys)) { if ((Bin $k) -eq $t) { $covered = $true; break } }
        if ($covered) { continue }   # 该二进制已被 .tool-versions 以 asdf 名要求过，别报两遍
    }
    if ($null -eq (Get-Command $bin -ErrorAction SilentlyContinue)) {
        if ($null -ne $need) { Write-Host "[FAIL] 缺必需工具 $t（本机二进制 $bin，.tool-versions 要求 $need）：先安装再继续" -ForegroundColor Red; $miss++ }
        else { Write-Host "[--] 未检测到 $t（.tool-versions 未要求，可忽略）" -ForegroundColor DarkGray }
        continue
    }
    $v = [string](cmd /c "$bin --version 2>&1" | Select-Object -First 1)
    if ($null -eq $need) { Write-Host "[OK] $t : $v（未被 .tool-versions 锁版本）" -ForegroundColor Green; continue }
    if ($need -match '[<>]') { Write-Host "[WARN] $t 期望版本仍是占位符「$need」：1-2 卡要换成真实版本（本机 $v）" -ForegroundColor Yellow; $miss++; continue }
    $mw = [regex]::Match($need, '\d+(\.\d+)*'); $ma = [regex]::Match($v, '\d+(\.\d+)*')
    if (-not $mw.Success -or -not $ma.Success) { Write-Host "[WARN] 版本解析不到：$t 期望「$need」实际「$v」——人工核对后写进 .tool-versions" -ForegroundColor Yellow; $miss++; continue }
    $mjw = ($mw.Value -split '\.')[0]; $mja = ($ma.Value -split '\.')[0]
    if ($mjw -eq $mja) { Write-Host "[OK] $t : $v（要求 $need，同 major）" -ForegroundColor Green }
    else { Write-Host "[FAIL] 版本不符：$t 期望 major $mjw（$need）实际 $mja（$v）——统一版本或更新 .tool-versions" -ForegroundColor Red; $miss++ }
}
if ($miss -gt 0) {
    Write-Host "环境自检未通过：$miss 项问题（缺工具/版本不符/占位符待填/解析不到）。" -ForegroundColor Red
    exit 1
}
Write-Host "环境自检通过（.tool-versions 要求的工具全部在位且同 major）。" -ForegroundColor Green
exit 0
