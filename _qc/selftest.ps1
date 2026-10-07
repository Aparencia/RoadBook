<#
    仪器自检：先证明「仪器能区分好坏」，再拿仪器去测卡。
    为什么不能只看退出码：变异把仪器打挂（缺文件 / 启动失败 / 语法炸）与变异命中判据，退出码长得一模一样。
    所以本脚本的判据是「红的断言恰好是这一条」：
      1) 先在**未变异**的工作树上跑一遍基线，记下仪器本来就红的断言集合；
      2) 每条用例只比**相对基线新增**的红（施工期脏树、环境差异自动抵消，不再被"反正退出码是 1"糊住）；
      3) 用例声明的目标断言必红（expectFail）；新增的其它红必须在用例里**预先声明理由**（allowExtra）——
         未声明的红 = 用例没打中判据，判 FAIL（"顺便红了几条"不算命中）；
      4) 每条用例带证据行（evidence）：输出里能看见**是哪一处**在红，而不是只有一行结论；
      5) 变异前后的文件按 sha256 逐字节复原（不是"看起来复原了"）。
    用例表在 _qc/selftest-cases.json（数据与引擎分家：加用例只改 JSON，不改本脚本）。
    用法：powershell -NoProfile -ExecutionPolicy Bypass -File _qc/selftest.ps1 [-Only B6] [-Preflight]
           -Preflight = 只跑静态预检（不跑仪器，秒级）：用例表的 expectFail 必须仍是仪器源码里的真实断言名。
    退出码：0 = 全部符合预期；1 = 有仪器缺陷 / 未声明的红 / 复原失败 / 静态预检发现漂移；2 = 未接线（缺 check.ps1 或非 git 工作树）；3 = 有跳过（用例要求干净树，收工提交后必须复跑一次拿全绿）。
#>
[CmdletBinding()]
param([string]$Only = '', [switch]$Preflight)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
$repo = Split-Path -Parent $PSScriptRoot
$caseFile = Join-Path $PSScriptRoot 'selftest-cases.json'
$utf8NoBom = New-Object Text.UTF8Encoding($false)

if (-not (Test-Path (Join-Path $repo '_qc\check.ps1'))) { Write-Host '[红灯] 未接线：缺 _qc/check.ps1'; exit 2 }
if (-not (Test-Path $caseFile)) { Write-Host '[红灯] 未接线：缺 _qc/selftest-cases.json（用例表外置，不写死在脚本里）'; exit 2 }
& git -C $repo rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Write-Host '[红灯] 未接线：不是 git 工作树'; exit 2 }
# 允许脏树（施工中就应该是脏的）：基线差分已经抵消了"本来就红"的断言；
# 但要求干净树的用例（工作树干净本身就是判据的那些）只能跳过，收尾提交后必须复跑。
$before = @(& git -C $repo status --porcelain | Sort-Object)
$clean = ($before.Count -eq 0)

function Read-Lines($rel) { [IO.File]::ReadAllLines((Join-Path $repo $rel), [Text.Encoding]::UTF8) }
function Save-Lines($rel, $lines) { [IO.File]::WriteAllText((Join-Path $repo $rel), (($lines -join "`n") + "`n"), $utf8NoBom) }
function Read-Text($rel) { [IO.File]::ReadAllText((Join-Path $repo $rel), [Text.Encoding]::UTF8) }
function Save-Text($rel, $text) { [IO.File]::WriteAllText((Join-Path $repo $rel), $text, $utf8NoBom) }
function Path-Hash($p) {
    if (-not (Test-Path -LiteralPath $p)) { return 'absent' }
    if (Test-Path -LiteralPath $p -PathType Container) {
        return ((Get-ChildItem -LiteralPath $p -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($p.Length) + '=' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join ';')
    }
    return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
}

$spec = Read-Text '_qc/selftest-cases.json' | ConvertFrom-Json
# 静态预检（-Preflight；_qc/check.ps1 每次体检调用，秒级）：用例表引用的断言名必须仍是仪器里的真实字面量。
# 为什么（TD-027）：断言名改过一次、用例表还留着旧名 ⇒ 期望红永远匹配不上、用例静默失效；整跑是分钟级 ⇒
# 这一半必须便宜到能进每次体检。三条判据：① 每条 expectFail 在仪器源码里找得到（或在 expectFailDynamic 里
# 声明过）② 动态声明必须写 why ③ 动态声明必须真的静态判不了（源码里有该字面量 = 豁免已过期）。豁免不静默：
# 动态声明逐条打印。边界：只咬 node 仪器 —— ps1 仪器的 [FAIL] 文本多由变量插值拼出，那一半只能整跑（TD-028）。
if ($Preflight) {
    $drift = @(); $dyn = @(); $n = 0
    foreach ($c in @($spec.cases)) {
        $i = $spec.instruments.($c.instrument)
        if ($null -eq $i) { $drift += "$($c.id)：引用了未定义的仪器 $($c.instrument)"; continue }
        $src = ''; if ($i.kind -eq 'node') { $src = Read-Text $i.script }
        # 字段缺席时 $c.expectFailDynamic 是 $null，而 @($null).Count = 1、$null | ForEach-Object 也会走一次（实测）
        # ⇒ 先过滤，否则塞进一个匹配一切的空模式（`-match $null` 是空正则）⇒ 每条用例的期望红判据被悄悄掏空。
        $decl = @($c.expectFailDynamic | Where-Object { $_ })
        foreach ($d in $decl) {
            if (-not $d.why) { $drift += "$($c.id)：$($d.re) 声明为动态却没写 why" }
            elseif ($src -match $d.re) { $drift += "$($c.id)：$($d.re) 声明为动态，但仪器源码里有这个字面量（豁免已过期）" }
            else { $dyn += "$($c.id)：$($d.re)" }
        }
        if ($i.kind -ne 'node') { continue }
        foreach ($re in @($c.expectFail)) { $n++; if (($decl.re -notcontains $re) -and ($src -notmatch $re)) { $drift += "$($c.id)：$re" } }
    }
    Write-Host ("静态预检：受检 expectFail {0} 条（node 仪器）｜动态声明 {1} 条" -f $n, $dyn.Count)
    if ($dyn.Count -gt 0) { Write-Host ("  [动态] 断言名由模板串拼出、静态判不了（已写 why）：{0}" -f ($dyn -join ' ｜ ')) }
    if ($drift.Count -gt 0) { Write-Host ("[红灯] 用例表与仪器断言名漂移 {0} 条（改断言名 ⇒ 同批改用例表；模板串拼出的进 expectFailDynamic 并写 why）：{1}" -f $drift.Count, ($drift -join ' ｜ ')); exit 1 }
    Write-Host '静态预检通过：用例表引用的断言名都还在仪器源码里，动态声明都有理由且仍需要。'
    exit 0
}
# 上次跑崩留下的临时目录先清掉（快照是会话内产物，随时可删）
Get-ChildItem ([IO.Path]::GetTempPath()) -Directory -Filter 'rb-selftest-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('rb-selftest-' + [Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$base = @{}; $baseOk = @{}
$failCount = 0; $okCount = 0; $skipCount = 0

function Run-Instrument($name) {
    $i = $spec.instruments.$name
    if ($null -eq $i) { throw "用例引用了未定义的仪器：$name" }
    $exe = 'powershell'; $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repo $i.path))
    if ($i.kind -eq 'node') { $exe = 'node'; $argv = @('--test', '--test-reporter=tap', (Join-Path $repo $i.script)) }
    Push-Location $repo
    # 子进程往 stderr 写一行（崩了 / 被策略拦下）不该把引擎一起带走：那是「仪器没真跑」，要报出来而不是自杀。
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $text = (& $exe @argv 2>&1 | Out-String) } finally { $ErrorActionPreference = $prevEap; Pop-Location }
    $code = $LASTEXITCODE
    $hit = @([regex]::Matches($text, $i.failRe, 'Multiline') | ForEach-Object { $_.Groups[1].Value.Trim() })
    return [pscustomobject]@{ Name = $name; Code = $code; Fail = $hit; Ran = [regex]::IsMatch($text, $i.ranRe, 'Multiline'); Text = $text }
}

# 基线：未变异的工作树上仪器本来就红什么。仪器"没真跑"（输出里没有结论行）不算红得对 ——
# 这正是旧写法最大的假绿通道：启动失败 / 策略拦截同样给出非 0 退出码。
function Ensure-Base($name) {
    if ($base.ContainsKey($name)) { return $baseOk[$name] }
    $i = $spec.instruments.$name
    if ($i.clean -and -not $clean) { return $false }
    $r = Run-Instrument $name
    $base[$name] = $r.Fail
    $baseOk[$name] = ($r.Ran -and $r.Code -eq 0 -and $r.Fail.Count -eq 0)
    if (-not $r.Ran) { Write-Host ("  [红灯] 基线 {0} 没真跑：输出里找不到结论行（仪器缺陷，先修仪器）" -f $name); $failCount++ }
    elseif (-not $baseOk[$name]) { Write-Host ("  [红灯] 基线 {0} 在未变异的树上就红了（退出码 {1} / {2} 条）：{3}" -f $name, $r.Code, $r.Fail.Count, ($r.Fail -join ' | ')); $failCount++ }
    return $baseOk[$name]
}

function Save-Case($id, $paths) {
    $d = Join-Path $tmp $id
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    $want = @{}
    foreach ($rel in $paths) {
        $key = ($rel -replace '[\\/:*?"<>|]', '_')
        $p = Join-Path $repo $rel
        $want[$rel] = Path-Hash $p
        if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $d $key) -Recurse -Force }
        else { New-Item -ItemType File -Force -Path (Join-Path $d ($key + '.absent')) | Out-Null }
    }
    return $want
}
function Restore-Case($id, $paths, $want) {
    $d = Join-Path $tmp $id
    foreach ($rel in $paths) {
        $key = ($rel -replace '[\\/:*?"<>|]', '_')
        $p = Join-Path $repo $rel
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force }
        if (-not (Test-Path -LiteralPath (Join-Path $d ($key + '.absent')))) { Copy-Item -LiteralPath (Join-Path $d $key) -Destination $p -Recurse -Force }
    }
    return @($paths | Where-Object { (Path-Hash (Join-Path $repo $_)) -ne $want[$_] })
}

$cases = @($spec.cases)
Write-Host ("仪器自检：基线 {0} 台仪器 + {1} 条变异用例（用例表 _qc/selftest-cases.json）" -f @($spec.baseline).Count, $cases.Count)
if (-not $clean) { Write-Host ("  [注意] 工作树有 {0} 处改动：要求干净树的用例本轮跳过，收工提交后必须复跑" -f $before.Count) }

foreach ($n in @($spec.baseline)) {
    $i = $spec.instruments.$n
    if ($i.clean -and -not $clean) { Write-Host ("  [跳过] 基线 {0}（该仪器把「工作树干净」也算判据，脏树上跑不出干净结论）" -f $n); $skipCount++; continue }
    $ok = Ensure-Base $n
    if ($ok) { $okCount++; Write-Host ("  [OK] 基线 {0}：未变异的树上零红、退出码 0" -f $n) }
}

foreach ($c in $cases) {
    if ($Only -and $c.id -ne $Only) { continue }
    $inst = $c.instrument
    if ($spec.instruments.$inst.clean -and -not $clean) { Write-Host ("  [跳过] {0} {1}（{2} 要求干净树）" -f $c.id, $c.name, $inst); $skipCount++; continue }
    if (-not (Ensure-Base $inst)) {
        Write-Host ("  [跳过] {0} {1}：基线仪器 {2} 未判绿（先在干净树上把仪器修绿，再谈变异集）" -f $c.id, $c.name, $inst)
        $skipCount++
        continue
    }
    $touch = @($c.touch)
    $want = Save-Case $c.id $touch
    $res = $null
    $badRestore = @()
    try {
        & ([scriptblock]::Create($c.mutate))
        $res = Run-Instrument $inst
    } finally {
        if ($c.restore) { & ([scriptblock]::Create($c.restore)) }
        $badRestore = Restore-Case $c.id $touch $want
    }
    if ($badRestore.Count -gt 0) { Write-Host ("  [FAIL] {0} 复原不是逐字节一致：{1}" -f $c.id, ($badRestore -join ', ')); $failCount++; continue }
    $new = @($res.Fail | Where-Object { $base[$inst] -notcontains $_ })
    # 期望红 = expectFail + expectFailDynamic（前者静态哨兵能查，后者由模板串拼出、只能运行期核）——判据只写这一处。
    # $null 先过滤掉：$null | ForEach-Object 会走一次（实测）⇒ 会给每条用例塞一个匹配一切的空模式。
    $wantFail = @($c.expectFail) + @($c.expectFailDynamic | Where-Object { $_ } | ForEach-Object { $_.re })
    $declared = $wantFail + @($c.allowExtra | ForEach-Object { $_.re })
    $miss = @($wantFail | Where-Object { $re = $_; -not ($new | Where-Object { $_ -match $re }) })
    $extra = @($new | Where-Object { $m = $_; -not ($declared | Where-Object { $m -match $_ }) })
    $evOk = $true
    if ($c.evidence) { $evOk = [regex]::IsMatch($res.Text, $c.evidence, 'Multiline') }
    $ok = $res.Ran -and ($res.Code -ne 0) -and ($miss.Count -eq 0) -and ($extra.Count -eq 0) -and $evOk
    $tag = 'OK'
    if (-not $ok) { $tag = 'FAIL'; $failCount++ } else { $okCount++ }
    Write-Host ("  [{0}] {1} {2}（{3} → {4}）→ 新增红 {5} 条 / 退出码 {6}" -f $tag, $c.id, $c.name, $c.rule, $inst, $new.Count, $res.Code)
    if ($new.Count -gt 0) { Write-Host ("        红：{0}" -f ($new -join ' ｜ ')) }
    if ($miss.Count -gt 0) { Write-Host ("        期望红的断言没红：{0}" -f ($miss -join ' | ')) }
    if ($extra.Count -gt 0) { Write-Host ("        未声明的红（红在别处 = 用例没打中判据）：{0}" -f ($extra -join ' | ')) }
    if (-not $res.Ran) { Write-Host ("        仪器 {0} 没真跑（输出里没有结论行），退出码非 0 不算红得对" -f $inst) }
    if (-not $evOk) { Write-Host ("        证据行缺失（要匹配：{0}）" -f $c.evidence) }
    if (-not $ok) { @($res.Text -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 12) | ForEach-Object { Write-Host ("        | " + $_.TrimEnd()) } }
}

Remove-Item -LiteralPath $tmp -Recurse -Force
$after = @(& git -C $repo status --porcelain | Sort-Object)
$diff = @(Compare-Object -ReferenceObject $before -DifferenceObject $after)
if ($diff.Count -gt 0) {
    Write-Host ("[红灯] 复原失败：收尾工作树与开跑前不一致（{0} 处差异），先手工修回：" -f $diff.Count)
    $diff | ForEach-Object { Write-Host ('  ' + $_.InputObject) }
    exit 1
}
Write-Host ("仪器自检：符合预期 {0} / 未通过 {1} / 跳过 {2}（共 {3} 条用例）" -f $okCount, $failCount, $skipCount, $cases.Count)
if ($failCount -gt 0) { Write-Host '[红灯] 仪器缺陷或用例没打中判据：先修仪器 / 修用例，别急着改卡。'; exit 1 }
if ($skipCount -gt 0) { Write-Host '[注意] 有跳过：脏树上跑不全（要求干净树的用例没跑）——收工提交后复跑一次，退出码应为 0。'; exit 3 }
Write-Host '仪器自检通过：好的必过、坏的必被抓住，且红在该条断言上。'
exit 0
