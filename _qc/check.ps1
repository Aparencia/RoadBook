# _qc/check.ps1 · Roadbook（路书）V6 母版一致性校验
# 用法：powershell -File _qc\check.ps1
# 退出码：0=全部通过；1=存在失败项（清单见输出）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fail = @()
$pass = 0
function Check($ok, $msg) {
    if ($ok) { Write-Host "  [OK] $msg"; $script:pass++ }
    else { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:fail += $msg }
}

Write-Host "== 1. 顶层文件 =="
$sh = Join-Path $root 'START-HERE.md'
Check (Test-Path $sh) 'START-HERE.md 存在'
if (Test-Path $sh) {
    $n = [System.IO.File]::ReadAllLines($sh, [Text.Encoding]::UTF8).Count
    Check ($n -le 60) "START-HERE.md 行数 $n <= 60"
}
$rm = Join-Path $root 'README.md'
Check (Test-Path $rm) 'README.md 存在'
if (Test-Path $rm) {
    $n = [System.IO.File]::ReadAllLines($rm, [Text.Encoding]::UTF8).Count
    Check ($n -le 60) "README.md 行数 $n <= 60"
    $v5Legacy = @('PROCESS\.md','01-shared/','02-skeleton/','08-docs-system/','APPENDIX/','FILE-GUIDE\.md','check-v5')
    $hitV5 = @(Select-String -Path $rm -Pattern $v5Legacy -Encoding UTF8)
    $hitWords = @($hitV5 | ForEach-Object { $_.Matches[0].Value } | Select-Object -Unique)
    Check ($hitV5.Count -eq 0) "README.md 无 V5 遗留路径引用（命中：$($hitWords -join ', ')）"
}
Check (Test-Path (Join-Path $root 'design\v6-design.md')) 'design/v6-design.md 存在'
Check (Test-Path (Join-Path $root 'design\playbook-contract.md')) 'design/playbook-contract.md 存在'
Check (Test-Path (Join-Path $root '_archive\V5')) '_archive/V5/ 封存目录存在'
$idFiles = @('README.md','START-HERE.md','design\v6-design.md','playbook\00-驱动卡.md','template\README.md','template\AGENTS.md')
$noName = @($idFiles | Where-Object { [System.IO.File]::ReadAllText((Join-Path $root $_), [Text.Encoding]::UTF8) -notmatch 'Roadbook' })
Check (-not $noName) "项目名「Roadbook（路书）」写在身份文件与项目模板（缺：$($noName -join ', ')）"

Write-Host "== 2. Playbook 卡组（21 张）=="
$cards = @('00-驱动卡','10-想法调研','11-选型初始化','12-接入已有项目','20-功能调研','21-需求范围','22-设计','23-分批编码','24-代码审查','25-验证','30-根因分析','31-修复','32-回归验证','40-归档','41-发布','42-复盘','43-流程体检','50-UI改动','51-依赖升级','52-技术债清偿','53-功能下线')
$pb = Join-Path $root 'playbook'
$sections = @('## ① 开工确认','## ② 执行','## ③ 证据回执','## ④ 状态回写')
$metaMarkers = @('【第一次运行','【把意图路由到卡','【执行任何卡时的硬规则','【每轮收尾')
# 禁引用 design/ _archive/ playbook/ template/；下列卡例外，理由随行写明（禁止静默放宽）
$tplRefAllowed = @{
    '11-选型初始化'   = '施工卡：整套复制母版 template/ 生成项目'
    '12-接入已有项目' = '施工卡：从母版 template/ 复制宪法与 STATE'
    '10-想法调研'     = 'template/ 仅出现在禁令行（禁止拷贝），是负面清单不是执行引用'
}
foreach ($c in $cards) {
    $p = Join-Path $pb "$c.md"
    if (-not (Test-Path $p)) { Check $false "卡存在：$c.md"; continue }
    $lines = [System.IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)
    $n = $lines.Count
    $okN = $n -le 150
    Check $okN "行数 $n <= 150 ：$c.md"
    if ($c -eq '00-驱动卡') {
        $missing = $metaMarkers | Where-Object { -not ($lines | Where-Object { $_ -like "*$_*" }) }
        Check (-not $missing) "00 驱动卡关键段齐全（缺：$missing）"
    } else {
        $missing = $sections | Where-Object { -not ($lines | Where-Object { $_ -like "$_*" }) }
        Check (-not $missing) "四段结构齐全（缺：$missing）：$c.md"
        $hitForbidden = @('design/','_archive/','playbook/','template/') | Where-Object { $lines -match [regex]::Escape($_) }
        $hitReal = $hitForbidden | Where-Object { $_ -ne 'template/' -or -not $tplRefAllowed.ContainsKey($c) }
        Check (-not $hitReal) "无母版内部引用（命中：$hitReal）：$c.md"
    }
}
$extra = Get-ChildItem $pb -Filter *.md | Where-Object { $cards -notcontains $_.BaseName }
Check ($null -eq $extra) "playbook/ 无未注册卡（多出：$($extra.BaseName -join ', ')）"

Write-Host "== 3. 模板 template/ =="
$tpl = Join-Path $root 'template'
$budget = @{ 'README.md' = 40; 'AGENTS.md' = 200; 'docs\ARCHITECTURE.md' = 100; 'docs\RUNBOOK.md' = 80; 'check.ps1' = 60; 'doctor.ps1' = 60; 'gate.ps1' = 70; 'orphans.ps1' = 60 }
foreach ($k in @('README.md','AGENTS.md','STATE.md','CHANGELOG.md','.tool-versions','check.ps1','doctor.ps1','gate.ps1','orphans.ps1','.env.example','.gitignore','docs\README.md','docs\ARCHITECTURE.md','docs\RUNBOOK.md','docs\registry\COMPONENTS.md','docs\registry\DATA_DICT.md','docs\registry\APIS.md','docs\pool\IDEAS.md','docs\TECH_DEBT.md')) {
    Check (Test-Path (Join-Path $tpl $k)) "模板文件存在：$k"
}
foreach ($k in $budget.Keys) {
    $p = Join-Path $tpl $k
    if (Test-Path $p) { $n = [System.IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8).Count; Check ($n -le $budget[$k]) "行数 $n <= $($budget[$k]) ：template/$k" }
}
$smTxt = ''
$smp = Join-Path $tpl 'STATE.md'
if (Test-Path $smp) { $smTxt = [IO.File]::ReadAllText($smp, [Text.Encoding]::UTF8) }
Check ($smTxt -match '(?m)^\s*[-*]?\s*文件数基线\s*[:：]\s*\d+') 'STATE.md 有「文件数基线」（check.ps1 预算断言的数据源）'
Check ($smTxt -match '## 并行态登记簿') 'STATE.md 有「并行态登记簿」（23 卡取代即删除的登记处）'
$ckTxt = ''
$ckp = Join-Path $tpl 'check.ps1'
if (Test-Path $ckp) { $ckTxt = [IO.File]::ReadAllText($ckp, [Text.Encoding]::UTF8) }
Check ($ckTxt -match '\$fileBudgetGrowth') 'template/check.ps1 有文件数预算断言（$fileBudgetGrowth）'
$wired = @('23-分批编码','40-归档','43-流程体检','52-技术债清偿') | Where-Object { $p2 = Join-Path $pb "$_.md"; -not (Test-Path $p2) -or ([IO.File]::ReadAllText($p2, [Text.Encoding]::UTF8) -notmatch 'orphans\.ps1') }
Check (-not $wired) "死代码治理四卡均引用 orphans.ps1（缺：$wired）"
$p23 = Join-Path $pb '23-分批编码.md'
Check ((Test-Path $p23) -and ([IO.File]::ReadAllText($p23, [Text.Encoding]::UTF8) -match '文件数基线')) '23 卡有「文件数基线」回写义务（防预算机制空转）'
foreach ($d in @('decisions','specs','reviews','versions','lessons','archive')) {
    Check (Test-Path (Join-Path $tpl "docs\$d")) "模板目录存在：docs/$d"
}

Write-Host "== 4. 结论 =="
Write-Host "通过 $pass 项；失败 $($fail.Count) 项"
if ($fail.Count -gt 0) { $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }; exit 1 }
Write-Host "Roadbook（路书）V6 母版完整性校验：全部通过" -ForegroundColor Green
exit 0
