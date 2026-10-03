# _qc/check.ps1 · Roadbook（路书）V6 母版一致性校验
# 用法：powershell -NoProfile -File _qc/check.ps1
# 退出码：0=全部通过；1=存在失败项（清单见输出）
# 口径唯一：卡清单的事实源 = design/v6-design.md §4 表（卡号+卡名）与 §4.1 表（英文文件名），本脚本不再硬编码卡名。
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
$root = Split-Path -Parent $PSScriptRoot
$fail = @()
$pass = 0
$obs = @()
function Check($ok, $msg) {
    if ($ok) { Write-Host "  [OK] $msg"; $script:pass++ }
    else { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:fail += $msg }
}
function Observe($ok, $msg) {
    if ($ok) { Write-Host "  [obs] $msg" }
    else { Write-Host "  [obs] OVER $msg" -ForegroundColor DarkYellow; $script:obs += $msg }
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
    $rmTxt = [IO.File]::ReadAllText($rm, [Text.Encoding]::UTF8)
    $n = [System.IO.File]::ReadAllLines($rm, [Text.Encoding]::UTF8).Count
    Check ($n -le 60) "README.md 行数 $n <= 60"
    $v5Legacy = @('PROCESS\.md','01-shared/','02-skeleton/','08-docs-system/','APPENDIX/','FILE-GUIDE\.md','check-v5')
    $hitV5 = @(Select-String -Path $rm -Pattern $v5Legacy -Encoding UTF8)
    $hitWords = @($hitV5 | ForEach-Object { $_.Matches[0].Value } | Select-Object -Unique)
    Check ($hitV5.Count -eq 0) "README.md 无 V5 遗留路径引用（命中：$($hitWords -join ', ')）"
    Check ($rmTxt -match 'playbook_EN/') 'README.md 指向 playbook_EN/（双语双份必须可发现）'
}
$dsg = Join-Path $root 'design\v6-design.md'
Check (Test-Path $dsg) 'design/v6-design.md 存在'
Check (Test-Path (Join-Path $root 'design\playbook-contract.md')) 'design/playbook-contract.md 存在'
Check (Test-Path (Join-Path $root 'design\glossary-en.md')) 'design/glossary-en.md 存在（英译唯一口径：术语表 + 结构映射 + 禁止翻译清单）'
Check (-not (Test-Path (Join-Path $root '_archive'))) '_archive/ 不存在（V5 残件已删，防死链复现）'
Check (Test-Path (Join-Path $root 'LICENSE')) 'LICENSE 存在（MIT，README 有引用）'
$selfN = [System.IO.File]::ReadAllLines((Join-Path $root '_qc\check.ps1'), [Text.Encoding]::UTF8).Count
Check ($selfN -le 340) "行数 $selfN <= 340 ：_qc/check.ps1 自身（2026-10-03 由 260 上调：卡清单改从 §4 解析 + 双语对齐；上调须同时改本行与 design §8）"
$idFiles = @('README.md','START-HERE.md','SKILL.md','design\v6-design.md','playbook\0-1-驱动卡.md','template\README.md','template\AGENTS.md')
$noName = @($idFiles | Where-Object { [System.IO.File]::ReadAllText((Join-Path $root $_), [Text.Encoding]::UTF8) -notmatch 'Roadbook' })
Check (-not $noName) "项目名「Roadbook（路书）」写在身份文件与项目模板（缺：$($noName -join ', ')）"

Write-Host "== 2. 卡清单（唯一事实源：design §4 表 + §4.1 表）=="
$designLines = [System.IO.File]::ReadAllLines($dsg, [Text.Encoding]::UTF8)
$designTxt = [string]::Join("`n", $designLines)
Check ($designTxt -match '(?m)^## 16\.') 'design 有 §16 标准 SDLC 覆盖对照（补了哪些域、落在哪张卡，可审计）'
$cardNo = @(); $cardName = @(); $enMap = @{}
foreach ($ln in $designLines) {
    $t = $ln.Trim()
    if (-not $t.StartsWith('|')) { continue }
    $cells = @($t.Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    if ($cells.Count -eq 7 -and $cells[0] -match '^\d+-\d+$') { $cardNo += $cells[0]; $cardName += $cells[1] }
    elseif ($cells.Count -eq 2 -and $cells[0] -match '^\d+-\d+$' -and $cells[1] -match '\.md$') { $enMap[$cells[0]] = $cells[1] }
}
Check ($cardNo.Count -eq 36) "design §4 表解析出 36 张卡（实际 $($cardNo.Count)；改表即改校验口径）"
Check ($enMap.Count -eq $cardNo.Count) "design §4.1 表为每张卡给出英文文件名（实际 $($enMap.Count) 条）"
$cards = @()
for ($i = 0; $i -lt $cardNo.Count; $i++) { $cards += ($cardNo[$i] + '-' + ($cardName[$i] -replace '\s', '')) }
$enFiles = @($cardNo | ForEach-Object { $enMap[$_] })
Check ((@($enFiles | Select-Object -Unique)).Count -eq $cardNo.Count) '§4.1 英文文件名无重复（一卡一文件）'
$pb = Join-Path $root 'playbook'
$pen = Join-Path $root 'playbook_EN'
Check (Test-Path $pen) 'playbook_EN/ 存在（英文执行版：agent 默认读它）'
$onDisk = @(Get-ChildItem $pb -Filter '*.md' -File -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName })
$onDiskEn = @(Get-ChildItem $pen -Filter '*.md' -File -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
Check ($onDisk.Count -eq $cards.Count) "playbook 卡片数 $($onDisk.Count) = §4 表 $($cards.Count)"
Check ($onDiskEn.Count -eq $enFiles.Count) "playbook_EN 文件数 $($onDiskEn.Count) = §4.1 表 $($enFiles.Count)"
$cardDiff = @(@($onDisk | Where-Object { $cards -notcontains $_ }) + @($cards | Where-Object { $onDisk -notcontains $_ }))
Check ($cardDiff.Count -eq 0) "中文卡文件名与 §4 表逐张对齐（不一致：$($cardDiff -join ', ')）"
$enDiff = @(@($onDiskEn | Where-Object { $enFiles -notcontains $_ }) + @($enFiles | Where-Object { $onDiskEn -notcontains $_ }))
Check ($enDiff.Count -eq 0) "英文卡文件名与 §4.1 表逐张对齐（不一致：$($enDiff -join ', ')）"

$sections = @('## ① 开工确认','## ② 执行','## ③ 证据回执','## ④ 状态回写')
$enSections = @('## ① Start confirmation','## ② Execution','## ③ Evidence receipt','## ④ State write-back')
$metaMarkers = @('【第一次运行','【把意图路由到卡','【执行任何卡时的硬规则','【每轮收尾')
# 禁引用 design/ _archive/ playbook/ template/；下列卡例外，理由随行写明（禁止静默放宽）
$tplRefAllowed = @{
    '1-2-选型初始化'   = '施工卡：整套复制母版 template/ 生成项目'
    '1-3-接入已有项目' = '施工卡：从母版 template/ 复制宪法与 STATE'
    '1-1-想法调研'     = 'template/ 仅出现在禁令行（禁止拷贝），是负面清单不是执行引用'
}
$badH1 = @(); $badSec = @(); $badRef = @(); $badTail = @(); $longCards = @()
foreach ($c in $cards) {
    $p = Join-Path $pb "$c.md"
    if (-not (Test-Path $p)) { continue }
    $lines = [System.IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)
    $txt = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    $no = [regex]::Match($c, '^(\d+-\d+)-').Groups[1].Value
    if ($lines[0] -notmatch ('^# 卡 ' + [regex]::Escape($no) + ' ·')) { $badH1 += $c }
    if ($lines.Count -gt 150) { $longCards += "$c($($lines.Count))" }
    if ($c -eq '0-1-驱动卡') {
        $missing = @($metaMarkers | Where-Object { -not ($lines | Where-Object { $_ -like "*$_*" }) })
        if ($missing) { $badSec += "0-1 驱动卡关键段缺：$($missing -join '/')" }
    } else {
        $missing = @($sections | Where-Object { -not ($lines | Where-Object { $_ -like "$_*" }) })
        if ($missing) { $badSec += "$c 缺 $($missing -join '/')" }
        $hitForbidden = @('design/','_archive/','playbook/','template/') | Where-Object { $lines -match [regex]::Escape($_) }
        $hitReal = @($hitForbidden | Where-Object { $_ -ne 'template/' -or -not $tplRefAllowed.ContainsKey($c) })
        if ($hitReal) { $badRef += "$c 命中 $($hitReal -join '/')" }
        if ($txt -notmatch '等待你裁决。回复') { $badTail += $c }
    }
}
$badEn = @(); $badRefEn = @(); $enTail = 'Awaiting your verdict\. Reply'
foreach ($c in $cards) {
    $no = [regex]::Match($c, '^(\d+-\d+)-').Groups[1].Value
    $ep = Join-Path $pen $enMap[$no]
    if (-not (Test-Path $ep)) { continue }
    $el = [System.IO.File]::ReadAllLines($ep, [Text.Encoding]::UTF8)
    $etxt = [IO.File]::ReadAllText($ep, [Text.Encoding]::UTF8)
    if ($el[0] -notmatch ('^# Card ' + [regex]::Escape($no) + ' ·')) { $badEn += "$no H1" }
    $miss = @($enSections | Where-Object { -not ($el | Where-Object { $_ -like "$_*" }) })
    if ($miss) { $badEn += "$no 四段缺 $($miss.Count)" }
    if ($c -ne '0-1-驱动卡' -and $etxt -notmatch $enTail) { $badEn += "$no 收尾语" }
    $enForbidden = @('design/','_archive/','playbook/','template/') | Where-Object { $el -match [regex]::Escape($_) }
    # 驱动卡必须点名两份卡（playbook_EN/ 英文执行版 + playbook/ 中文判据版）与 template/ 的位置；design/ 与 _archive/ 仍禁（与中文卡同一豁免理由）
    if ($no -eq '0-1') { $enForbidden = @($enForbidden | Where-Object { $_ -in @('design/','_archive/') }) }
    $enReal = @($enForbidden | Where-Object { $_ -ne 'template/' -or -not $tplRefAllowed.ContainsKey($c) })
    if ($enReal) { $badRefEn += "$no 命中 $($enReal -join '/')" }
}
Check (-not $badH1) "中文卡 H1 卡号与 §4 表一致（不一致：$($badH1 -join ', ')）"
Check (-not $badSec) "四段结构齐全（问题：$($badSec -join '；')）"
Check (-not $badRef) "中文卡无母版内部引用（问题：$($badRef -join '；')）"
Check (-not $badTail) "每张动作卡有固定收尾语（缺：$($badTail -join ', ')）"
Check (-not $badEn) "英文卡 H1/四段/收尾语与中文版逐段对应（问题：$($badEn -join '；')）"
Check (-not $badRefEn) "英文卡无母版内部引用（问题：$($badRefEn -join '；')）"
Observe ($longCards.Count -eq 0) "本轮观测项（不拦红）：卡 ≤150 行，超限 $($longCards.Count) 张 $($longCards -join ', ')"
$extra = @(Get-ChildItem $pb -Filter *.md | Where-Object { $cards -notcontains $_.BaseName })
Check ($extra.Count -eq 0) "playbook/ 无未注册卡（多出：$($extra.BaseName -join ', ')）"
$extraEn = @(Get-ChildItem $pen -Filter *.md | Where-Object { $enFiles -notcontains $_.Name })
Check ($extraEn.Count -eq 0) "playbook_EN/ 无未注册卡（多出：$($extraEn.BaseName -join ', ')）"

Write-Host "== 3. 模板 template/ =="
$tpl = Join-Path $root 'template'
$budget = @{ 'README.md' = 40; 'AGENTS.md' = 240; 'STATE.md' = 45; 'CHANGELOG.md' = 40; 'docs\README.md' = 55; 'docs\registry\COMPONENTS.md' = 50; 'docs\ARCHITECTURE.md' = 120; 'docs\RUNBOOK.md' = 100; 'docs\OBSERVABILITY.md' = 80; 'docs\PRIVACY.md' = 80; 'docs\I18N.md' = 60; 'docs\USER_GUIDE.md' = 60; 'check.ps1' = 110; 'doctor.ps1' = 80; 'gate.ps1' = 110; 'orphans.ps1' = 90 }
foreach ($k in @('README.md','AGENTS.md','STATE.md','CHANGELOG.md','.tool-versions','check.ps1','doctor.ps1','gate.ps1','orphans.ps1','.env.example','.gitignore','.gitattributes','docs\README.md','docs\ARCHITECTURE.md','docs\RUNBOOK.md','docs\OBSERVABILITY.md','docs\PRIVACY.md','docs\I18N.md','docs\USER_GUIDE.md','docs\registry\COMPONENTS.md','docs\registry\DATA_DICT.md','docs\registry\APIS.md','docs\pool\IDEAS.md','docs\TECH_DEBT.md')) {
    Check (Test-Path (Join-Path $tpl $k)) "模板文件存在：$k"
}
foreach ($k in $budget.Keys) {
    $p = Join-Path $tpl $k
    if (Test-Path $p) { $n = [System.IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8).Count; Check ($n -le $budget[$k]) "行数 $n <= $($budget[$k]) ：template/$k" }
    else { Check $false "预算表列了 $k 但文件不存在（旧版静默跳过 = 这份文件的行数无人管）" }
}
$smTxt = ''
$smp = Join-Path $tpl 'STATE.md'
if (Test-Path $smp) { $smTxt = [IO.File]::ReadAllText($smp, [Text.Encoding]::UTF8) }
Check ($smTxt -match '(?m)^\s*[-*]?\s*文件数基线\s*[:：]\s*\d+') 'STATE.md 有「文件数基线」（check.ps1 预算断言的数据源）'
Check ($smTxt -match '## 并行态登记簿') 'STATE.md 有「并行态登记簿」（4-1 卡取代即删除的登记处）'
foreach ($f in @('当前文件数','工作树状态','远端仓库','起点锚点','档位','体检计数','风险摘要','最近完成','未决问题','下一步')) {
    Check ($smTxt -match ("(?m)^[\s#\-*|]*" + [regex]::Escape($f))) "STATE.md 含 design §7 字段「$f」（须是行首字段；正文里提一句不算——防字段被静默删掉）"
}
$drmTxt = ''
$drm = Join-Path $tpl 'docs\README.md'
if (Test-Path $drm) { $drmTxt = [IO.File]::ReadAllText($drm, [Text.Encoding]::UTF8) }
Check ($drmTxt -match '产出卡' -and $drmTxt -match '消费卡') 'docs/README.md 是「文档↔卡」对应表（每份文档能指回产出卡与消费卡，无对应 = 分裂文档）'
$ckTxt = ''
$ckp = Join-Path $tpl 'check.ps1'
if (Test-Path $ckp) { $ckTxt = [IO.File]::ReadAllText($ckp, [Text.Encoding]::UTF8) }
Check ($ckTxt -match '\$fileBudgetGrowth') 'template/check.ps1 有文件数预算断言（$fileBudgetGrowth）'
$wired = @('4-1-分批编码','5-1-归档','6-6-流程体检','7-3-债与腐化清偿') | Where-Object { $p2 = Join-Path $pb "$_.md"; -not (Test-Path $p2) -or ([IO.File]::ReadAllText($p2, [Text.Encoding]::UTF8) -notmatch 'orphans\.ps1') }
Check (-not $wired) "死代码治理四卡均引用 orphans.ps1（缺：$wired）"
$p23 = Join-Path $pb '4-1-分批编码.md'
Check ((Test-Path $p23) -and ([IO.File]::ReadAllText($p23, [Text.Encoding]::UTF8) -match '文件数基线')) '4-1 卡有「文件数基线」回写义务（防预算机制空转）'
foreach ($d in @('decisions','specs','reviews','versions','lessons','archive')) {
    Check (Test-Path (Join-Path $tpl "docs\$d")) "模板目录存在：docs/$d"
}
# 种子教训卡：张数与体例（6-2 卡动作要写「最近确认」、6-6 卡信号 3 读它；张数漂移 = design §5/§10 与 5-1 卡「6 张种子卡不参加淘汰」口径失配）
$seed = @(Get-ChildItem (Join-Path $tpl 'docs\lessons') -Filter '*.md' -File -ErrorAction SilentlyContinue)
Check ($seed.Count -eq 6) "模板种子教训卡 6 张（实际 $($seed.Count) 张；增删须同步 design §5 目录树 / §10 记录 / 5-1 卡豁免句）"
foreach ($s in $seed) {
    $sl = [System.IO.File]::ReadAllLines($s.FullName, [Text.Encoding]::UTF8)
    Check ($sl.Count -le 12) "行数 $($sl.Count) <= 12 ：docs/lessons/$($s.Name)"
    Check ([string]::Join("`n", $sl) -match '最近确认') "种子卡含「最近确认」字段（6-2 卡动作 / 6-6 卡信号 3 的落点）：$($s.Name)"
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
    $skEn = @([regex]::Matches($skRaw, 'playbook_EN/([A-Za-z0-9._-]+)\.md') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $skCn = @([regex]::Matches($skRaw, '(?<!_EN/)playbook/([A-Za-z0-9._-]+)\.md') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $skEnDead = @($skEn | Where-Object { $enFiles -notcontains "$_.md" })
    $skCnDead = @($skCn | Where-Object { $cards -notcontains $_ })
    Check ($skEn.Count -ge 30) "SKILL.md 路由指向英文版卡数 $($skEn.Count) >= 30（双语双份：agent 默认读 playbook_EN/）"
    Check (-not $skEnDead) "SKILL.md 引用的英文卡全部存在（幽灵引用：$($skEnDead -join ', ')）"
    Check (-not $skCnDead) "SKILL.md 引用的中文卡全部存在（幽灵引用：$($skCnDead -join ', ')）"
}

Write-Host "== 5. 版本管理主动性（git）=="
Check ($ckTxt -match 'status --porcelain' -and $ckTxt -match 'rev-list --count') 'template/check.ps1 有 git 断言（工作树干净 + 本批提交计数）'
$gtTxt = ''
$gtp = Join-Path $tpl 'gate.ps1'
if (Test-Path $gtp) { $gtTxt = [IO.File]::ReadAllText($gtp, [Text.Encoding]::UTF8) }
Check ($gtTxt -match 'diff --name-only' -and $gtTxt -match 'status --porcelain' -and $gtTxt -match 'Select-Object -Unique') 'template/gate.ps1 变更清单 = 已提交 ∪ 未提交（不再假绿）'
Check ($gtTxt -match 'Split\(' -and $gtTxt -match '-ScopeFiles "src/a\.ts,src/b\.ts"') 'template/gate.ps1 的 -ScopeFiles 归一化（逗号串：powershell -File 不支持数组传参）'
$orpTxt = if (Test-Path (Join-Path $tpl 'orphans.ps1')) { [IO.File]::ReadAllText((Join-Path $tpl 'orphans.ps1'), [Text.Encoding]::UTF8) } else { '' }
Check ($orpTxt -match '\$untracked\.Count -gt 0') 'template/orphans.ps1 未跟踪文件计入退出码（清单不完整 = 红）'
$badScope = @(@('4-1-分批编码','6-3-修复') | Where-Object { ([IO.File]::ReadAllText((Join-Path $pb "$_.md"), [Text.Encoding]::UTF8)) -match '-ScopeFiles \$scopeFiles\b' })
Check (-not $badScope) "卡面 gate 调用不再直传数组（跑不通的形态：$($badScope -join ', ')）"
Check ($smTxt -match '(?m)^\s*[-*]?\s*工作树状态\s*[:：]') 'STATE.md 有「工作树状态」（收尾必须干净）'
Check ($smTxt -match '(?m)^\s*[-*]?\s*远端仓库\s*[:：]') 'STATE.md 有「远端仓库」（防历史只在本机）'
$t11 = if (Test-Path (Join-Path $pb '1-2-选型初始化.md')) { [IO.File]::ReadAllText((Join-Path $pb '1-2-选型初始化.md'), [Text.Encoding]::UTF8) } else { '' }
Check ($t11 -match 'gh repo create' -and $t11 -match 'git remote add') '1-2 卡有远端接入动作（三选一，可见性由人裁决）'
Check ($t11 -match 'git init' -and $t11 -match 'gate\.ps1 -Anchor HEAD -ScopeFiles "README\.md,' -and $t11 -notmatch '(?m)^powershell -NoProfile -File gate\.ps1\s*$') '1-2 卡动作顺序：先 git init 提交，再 check/gate/orphans 首跑（非 git 或基线 0 时必假红）'
$t12 = [IO.File]::ReadAllText((Join-Path $pb '1-3-接入已有项目.md'), [Text.Encoding]::UTF8)
Check ($t12 -match 'git remote -v') '1-3 卡接入时查远端（防老项目无远端）'
Check (([IO.File]::ReadAllText((Join-Path $pb '5-1-归档.md'), [Text.Encoding]::UTF8)) -match 'git push') '5-1 卡归档收尾有远端同步（push）'
$t43 = [IO.File]::ReadAllText((Join-Path $pb '6-6-流程体检.md'), [Text.Encoding]::UTF8)
Check ($t43 -match '提交节奏' -and $t43 -match '推送滞后') '6-6 卡有提交节奏与推送滞后信号（十类信号）'
$commitCards = [ordered]@{ '1-2-选型初始化' = '1-2'; '1-3-接入已有项目' = '1-3'; '4-1-分批编码' = '4-1'; '6-3-修复' = '6-3'; '5-1-归档' = '5-1'; '6-5-复盘' = '6-5'; '7-1-UI改动' = '7-1'; '7-2-依赖升级' = '7-2'; '7-4-功能下线' = '7-4' }
$noNum = @($commitCards.Keys | Where-Object { ([IO.File]::ReadAllText((Join-Path $pb "$_.md"), [Text.Encoding]::UTF8)) -notmatch ('git commit -m "' + $commitCards[$_] + ' ') })
Check (-not $noNum) "提交信息统一带卡号（缺：$($noNum -join ', ')）"

Write-Host "== 6. 自动加载插件 plugin/roadbook-autoload =="
$plg = Join-Path $root 'plugin\roadbook-autoload'
foreach ($k in @('package.json','cordis.patch.yml','index.js','trigger.js','icon.svg','README.md','locale\zh.json','locale\en.json','test\trigger.test.mjs')) {
    Check (Test-Path (Join-Path $plg $k)) "插件文件存在：plugin/roadbook-autoload/$k"
}
$plgPkg = $null
try { $plgPkg = [IO.File]::ReadAllText((Join-Path $plg 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { $plgPkg = $null }
Check ($null -ne $plgPkg) '插件 package.json 可解析（JSON 合法）'
$plgYml = ''
if ($null -ne $plgPkg) {
    Check ($plgPkg.name -eq 'roadbook-autoload') "插件包名 roadbook-autoload（实际：$($plgPkg.name)）"
    Check ($plgPkg.type -eq 'module') '插件为纯 ESM（type: module）'
    $plgPatch = [string]$plgPkg.dsh.bundle.patch
    Check ($plgPatch.Length -gt 0 -and (Test-Path (Join-Path $plg ($plgPatch -replace '^\./','')))) "插件声明 dsh.bundle.patch 且文件存在（$plgPatch）"
    $plgExp = @($plgPkg.exports.PSObject.Properties.Name)
    Check (($plgExp -contains './package.json') -and ($plgExp -contains './locale/*.json')) '插件 exports 暴露 ./package.json 与 ./locale/*.json（展示元信息）'
    $plgIcon = Join-Path $plg ([string]$plgPkg.icon)
    if (Test-Path $plgIcon) { Check ((Get-Item $plgIcon).Length -le 262144) "插件图标 ≤256KiB（$((Get-Item $plgIcon).Length) 字节）" }
    $plgYml = [IO.File]::ReadAllText((Join-Path $plg 'cordis.patch.yml'), [Text.Encoding]::UTF8)
    Check (($plgYml -match '(?m)^- insert:') -and ($plgYml -match ("(?m)^\s*-\s*id:\s*" + [regex]::Escape($plgPkg.name) + '\s*$')) -and ($plgYml -match ("(?m)^\s+name:\s*'?" + [regex]::Escape($plgPkg.name) + "'?\s*$"))) '插件 patch 形如 - insert: 且 id/name 与包名一致'
}
$plgIdx = [IO.File]::ReadAllText((Join-Path $plg 'index.js'), [Text.Encoding]::UTF8)
Check (($plgIdx -match 'agent/pre-step') -and ($plgIdx -match 'export const inject') -and ($plgIdx -match 'skill-invocation')) '插件挂 agent/pre-step、声明 inject、注入形状同内置（skill-invocation）'
Check (($plgIdx -match 'renderSkillContent') -and ($plgIdx -match 'dsh-skill')) '插件复用官方 renderSkillContent（不自造正文格式）'
$plgBad = @('locale\zh.json','locale\en.json') | Where-Object { $t = [IO.File]::ReadAllText((Join-Path $plg $_), [Text.Encoding]::UTF8); ($t -notmatch '"title"\s*:') -or ($t -notmatch '"description"\s*:') }
Check (-not $plgBad) "插件中英文展示元信息齐（缺：$($plgBad -join ', ')）"
$plgRdm = [IO.File]::ReadAllText((Join-Path $plg 'README.md'), [Text.Encoding]::UTF8)
Check ($plgRdm -match 'trigger\.test\.mjs') '插件 README 写了离线单测命令'
Check (([IO.File]::ReadAllText((Join-Path $root 'README.md'), [Text.Encoding]::UTF8)) -match 'plugin/roadbook-autoload') '根 README 指向自动加载插件（可发现）'

Write-Host "== 7. 脚本可执行性与口径统一 =="
$ps1s = @('_qc\check.ps1','template\check.ps1','template\doctor.ps1','template\gate.ps1','template\orphans.ps1')
foreach ($rel in $ps1s) {
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) { Check $false "脚本存在：$rel"; continue }
    $bytes = [IO.File]::ReadAllBytes($p)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
    Check $hasBom "UTF-8 BOM 存在（PS 5.1 无 BOM 会按 GB2312 解中文并 ParserError）：$rel"
    $parseErr = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$parseErr)
    Check ($parseErr.Count -eq 0) "语法解析零错误（$($parseErr.Count) 处）：$rel"
}
$gaTxt = ''
$gap = Join-Path $tpl '.gitattributes'
if (Test-Path $gap) { $gaTxt = [IO.File]::ReadAllText($gap, [Text.Encoding]::UTF8) }
Check ($gaTxt -match 'eol=lf') 'template/.gitattributes 锁定 LF（防 Windows 检出变 CRLF 打乱行数口径）'
$scanUni = @((Join-Path $root 'README.md'), (Join-Path $root 'START-HERE.md'), (Join-Path $root 'SKILL.md'), (Join-Path $root 'design\playbook-contract.md'), (Join-Path $root 'design\glossary-en.md'))
$scanUni += @(Get-ChildItem $pb -File | ForEach-Object { $_.FullName })
$scanUni += @(Get-ChildItem $pen -File | ForEach-Object { $_.FullName })
$scanUni += @(Get-ChildItem $tpl -Recurse -File | Where-Object { $_.Extension -in @('.md', '.ps1') } | ForEach-Object { $_.FullName })
$noPp = @($scanUni | Where-Object { (Test-Path $_) -and ([IO.File]::ReadAllText($_, [Text.Encoding]::UTF8) -match 'powershell(\.exe)?\s+-File') })
Check (-not $noPp) "命令统一 powershell -NoProfile -File（缺 -NoProfile：$(($noPp | ForEach-Object { Split-Path $_ -Leaf }) -join ', ')）"
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeExe) {
    Write-Host "  [--] 未装 node，跳过插件离线单测"
} else {
    $pTest = Join-Path $plg 'test\trigger.test.mjs'
    if (Test-Path $pTest) { & node $pTest *> $null; Check ($LASTEXITCODE -eq 0) '插件 trigger 离线单测通过（node test/trigger.test.mjs）' }
    $iTest = Join-Path $plg 'test\index.test.mjs'
    if (Test-Path $iTest) { & node $iTest *> $null; Check ($LASTEXITCODE -eq 0) '插件 Host 半区单测通过（node test/index.test.mjs）' }
}

Write-Host "== 8. 结论 =="
Write-Host "通过 $pass 项；失败 $($fail.Count) 项"
if ($obs.Count -gt 0) { Write-Host "观测项（不拦红）：$($obs.Count) 条，见上文 [obs] OVER" -ForegroundColor DarkYellow }
if ($fail.Count -gt 0) { $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }; exit 1 }
Write-Host "Roadbook（路书）V6 母版完整性校验：全部通过" -ForegroundColor Green
exit 0
