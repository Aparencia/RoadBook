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
Check (Test-Path (Join-Path $root 'LICENSE')) 'LICENSE 存在（MIT，README 有引用）'
$idFiles = @('README.md','START-HERE.md','SKILL.md','design\v6-design.md','playbook\00-驱动卡.md','template\README.md','template\AGENTS.md')
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
$budget = @{ 'README.md' = 40; 'AGENTS.md' = 200; 'docs\ARCHITECTURE.md' = 100; 'docs\RUNBOOK.md' = 80; 'check.ps1' = 80; 'doctor.ps1' = 60; 'gate.ps1' = 70; 'orphans.ps1' = 60 }
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

Write-Host "== 4. Skill 分发（SKILL.md）=="
$sk = Join-Path $root 'SKILL.md'
Check (Test-Path $sk) 'SKILL.md 存在（DSH skill 入口）'
if (Test-Path $sk) {
    $skRaw = [System.IO.File]::ReadAllText($sk, [Text.Encoding]::UTF8)
    $skLines = [System.IO.File]::ReadAllLines($sk, [Text.Encoding]::UTF8)
    Check ($skLines.Count -le 120) "行数 $($skLines.Count) <= 120 ：SKILL.md"
    Check ($skRaw -match '^---\r?\n') 'SKILL.md 首行严格为 ---（前置 BOM 或空行会被 DSH 静默忽略）'
    $skName = [regex]::Match($skRaw, '(?m)^name:\s*(\S+)\s*$')
    Check ($skName.Success -and $skName.Groups[1].Value -eq 'roadbook' -and $skName.Groups[1].Value -match '^[a-z0-9]+(?:-[a-z0-9]+)*$') "SKILL.md frontmatter name=roadbook（实际：$($skName.Groups[1].Value)）"
    $skDesc = [regex]::Match($skRaw, '(?m)^description:\s*(.+)$')
    $skDescLen = 0
    if ($skDesc.Success) { $skDescLen = $skDesc.Groups[1].Value.Trim().Length }
    Check ($skDescLen -gt 0 -and $skDescLen -le 500) "SKILL.md description 长度 $skDescLen（1..500，对齐 catalogDescriptionMaxLength）"
    $skKw = @('开工确认', 'check.ps1', '红灯', '回执') | Where-Object { $skRaw -notmatch [regex]::Escape($_) }
    Check (-not $skKw) "SKILL.md 含四条铁律关键词（缺：$($skKw -join ', ')）"
    $skRefs = @([regex]::Matches($skRaw, 'playbook/([^/\s|]+)\.md') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $skDead = @($skRefs | Where-Object { -not (Test-Path (Join-Path $pb "$_.md")) })
    Check ($skRefs.Count -ge 20) "SKILL.md 路由覆盖卡数 $($skRefs.Count) >= 20"
    Check (-not $skDead) "SKILL.md 引用的卡全部存在（幽灵引用：$($skDead -join ', ')）"
}

Write-Host "== 5. 版本管理主动性（git）=="
Check ($ckTxt -match 'status --porcelain' -and $ckTxt -match 'rev-list --count') 'template/check.ps1 有 git 断言（工作树干净 + 本批提交计数）'
$gtTxt = ''
$gtp = Join-Path $tpl 'gate.ps1'
if (Test-Path $gtp) { $gtTxt = [IO.File]::ReadAllText($gtp, [Text.Encoding]::UTF8) }
Check ($gtTxt -match 'diff --name-only' -and $gtTxt -match 'status --porcelain' -and $gtTxt -match 'Select-Object -Unique') 'template/gate.ps1 变更清单 = 已提交 ∪ 未提交（不再假绿）'
Check ($smTxt -match '(?m)^\s*[-*]?\s*工作树状态\s*[:：]') 'STATE.md 有「工作树状态」（收尾必须干净）'
Check ($smTxt -match '(?m)^\s*[-*]?\s*远端仓库\s*[:：]') 'STATE.md 有「远端仓库」（防历史只在本机）'
$t11 = if (Test-Path (Join-Path $pb '11-选型初始化.md')) { [IO.File]::ReadAllText((Join-Path $pb '11-选型初始化.md'), [Text.Encoding]::UTF8) } else { '' }
Check ($t11 -match 'gh repo create' -and $t11 -match 'git remote add') '11 卡有远端接入动作（三选一，可见性由人裁决）'
$t12 = [IO.File]::ReadAllText((Join-Path $pb '12-接入已有项目.md'), [Text.Encoding]::UTF8)
Check ($t12 -match 'git remote -v') '12 卡接入时查远端（防老项目无远端）'
Check (([IO.File]::ReadAllText((Join-Path $pb '40-归档.md'), [Text.Encoding]::UTF8)) -match 'git push') '40 卡归档收尾有远端同步（push）'
$t43 = [IO.File]::ReadAllText((Join-Path $pb '43-流程体检.md'), [Text.Encoding]::UTF8)
Check ($t43 -match '提交节奏' -and $t43 -match '推送滞后') '43 卡有提交节奏与推送滞后信号（十类信号）'
$commitCards = [ordered]@{ '11-选型初始化' = '11'; '12-接入已有项目' = '12'; '23-分批编码' = '23'; '31-修复' = '31'; '40-归档' = '40'; '42-复盘' = '42'; '50-UI改动' = '50'; '51-依赖升级' = '51'; '53-功能下线' = '53' }
$noNum = @($commitCards.Keys | Where-Object { ([IO.File]::ReadAllText((Join-Path $pb "$_.md"), [Text.Encoding]::UTF8)) -notmatch ('git commit -m "' + $commitCards[$_] + ' ') })
Check (-not $noNum) "提交信息统一带卡号（缺：$($noNum -join ', ')）"

Write-Host "== 6. 结论 =="
Write-Host "通过 $pass 项；失败 $($fail.Count) 项"
if ($fail.Count -gt 0) { $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }; exit 1 }
Write-Host "Roadbook（路书）V6 母版完整性校验：全部通过" -ForegroundColor Green
exit 0
