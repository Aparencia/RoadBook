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
Check ($selfN -le 790) "行数 $selfN <= 790 ：_qc/check.ps1 自身（2026-10-04 由 600 上调：安全批次 7-9 准入卡 + security.ps1 接线与内容断言；2026-10-05 由 650 上调到 670：门禁改跑**整套件 glob** —— 原先逐个点名 test/trigger.test.mjs 与 test/index.test.mjs，banner.test.mjs 因此漏检，本地全绿不算数；2026-10-05 由 670 上调到 700：主插件自动更新四条断言 —— 更新模块存在 / 判定必须三态（读不到 = unknown）/ 两条更新路由与 DNS rebinding 守卫 / 根 README 可发现；2026-10-05 由 700 上调到 720：自进化行 roadbook-evolve 六条断言 —— 打包白名单须含 signals.js / 三态判定 / 两条只读路由 + 同源守卫 / inject 必须为空 / umbRows 补齐此前漏登记的 roadbook-team / 测试套件 glob 增第三组；2026-10-06 由 720 上调到 730：SKILL.md frontmatter 的 YAML 安全断言 —— 值未加引号却含 ASCII「: 」会被 YAML 读成嵌套映射，宿主 parseFrontmatter 抛错后整份静默丢弃（roadbook 技能从未进技能目录、inject 事件 0 条），本节九条正则断言全绿也拦不住；2026-10-06 由 730 上调到 790：**过程域覆盖**（每张卡有过程域行 / 取值在受控词表内 / 中英同卡号一致 / 每个过程域要么有卡覆盖要么在 v6-design §18 显式点名）+ **子包 version 跟随伞包**（四个子包长期停 0.1.x 而伞包 0.7.2 = 死元数据），两组断言 + §1.1 词表与 §18 两处存在性；上调须同时改本行与 design §8）"
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
Check ($cardNo.Count -eq 45) "design §4 表解析出 45 张卡（实际 $($cardNo.Count)；改表即改校验口径）"
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
# 卡数是唯一事实源：三份活文档的卡数文案必须与 §4 表同源（改表不改文案 = 数字漂移，2026-10-05 增）
$cardCnt = $cardNo.Count
$rmCntTxt = [IO.File]::ReadAllText($rm, [Text.Encoding]::UTF8)
$shCntTxt = [IO.File]::ReadAllText($sh, [Text.Encoding]::UTF8)
$skCntTxt = [IO.File]::ReadAllText((Join-Path $root 'SKILL.md'), [Text.Encoding]::UTF8)
Check ($rmCntTxt -match "$cardCnt 张") "README.md 卡数 = §4 表 $cardCnt 张（同源，防漂移）"
Check ($shCntTxt -match "$cardCnt 张") "START-HERE.md 卡数 = §4 表 $cardCnt 张（同源，防漂移）"
Check ($skCntTxt -match "$cardCnt 张") "SKILL.md 卡数 = §4 表 $cardCnt 张（同源，防漂移）"

$sections = @('## ① 开工确认','## ② 执行','## ③ 证据回执','## ④ 状态回写')
$enSections = @('## ① Start confirmation','## ② Execution','## ③ Evidence receipt','## ④ State write-back')
$metaMarkers = @('【第一次运行','【把意图路由到卡','【规则在哪','【每轮收尾','【会话收尾')
$enMetaMarkers = @('[ First run','[ Route the intent to a card','[ Where the rules live','[ End of each round','[ Session close')
# 禁引用 design/ _archive/ playbook/ template/；下列卡例外，理由随行写明（禁止静默放宽）
$tplRefAllowed = @{
    '1-2-选型初始化'   = '施工卡：整套复制母版 template/ 生成项目'
    '1-3-接入已有项目' = '施工卡：从母版 template/ 复制宪法与 STATE'
    '1-1-想法调研'     = 'template/ 仅出现在禁令行（禁止拷贝），是负面清单不是执行引用'
}
# 注意：判定"某行是否含某个针"必须先在循环外固定 $n，不能在 Where-Object 里写
# "$_ -like \"$n*\""——脚本块里的 $_ 会被内层 Where-Object 重绑定，条件恒真，断言变假绿。
function Get-MissingNeedle {
    param([string[]]$Lines, [string[]]$Needles, [switch]$AtLineStart)
    $miss = @()
    foreach ($n in $Needles) {
        $hit = @($Lines | Where-Object { if ($AtLineStart) { $_.StartsWith($n) } else { $_.Contains($n) } })
        if ($hit.Count -eq 0) { $miss += $n }
    }
    return $miss
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
        $missing = Get-MissingNeedle -Lines $lines -Needles $metaMarkers
        if ($missing) { $badSec += "0-1 驱动卡关键段缺：$($missing -join '/')" }
    } else {
        $missing = Get-MissingNeedle -Lines $lines -Needles $sections -AtLineStart
        if ($missing) { $badSec += "$c 缺 $($missing -join '/')" }
        $hitForbidden = @('design/','_archive/','playbook/','template/') | Where-Object { $lines -match [regex]::Escape($_) }
        $hitReal = @($hitForbidden | Where-Object { $_ -ne 'template/' -or -not $tplRefAllowed.ContainsKey($c) })
        if ($hitReal) { $badRef += "$c 命中 $($hitReal -join '/')" }
        if ($txt -notmatch [regex]::Escape('等待你裁决。回复"继续"执行下一张卡，或说新指令。')) { $badTail += $c }
    }
}
$badEn = @(); $badRefEn = @(); $enTail = [regex]::Escape('Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.')
foreach ($c in $cards) {
    $no = [regex]::Match($c, '^(\d+-\d+)-').Groups[1].Value
    $ep = Join-Path $pen $enMap[$no]
    if (-not (Test-Path $ep)) { continue }
    $el = [System.IO.File]::ReadAllLines($ep, [Text.Encoding]::UTF8)
    $etxt = [IO.File]::ReadAllText($ep, [Text.Encoding]::UTF8)
    if ($el[0] -notmatch ('^# Card ' + [regex]::Escape($no) + ' ·')) { $badEn += "$no H1" }
    if ($no -eq '0-1') {
        $miss = Get-MissingNeedle -Lines $el -Needles $enMetaMarkers
        if ($miss) { $badEn += "0-1 关键段缺 $($miss.Count)" }
    } else {
        $miss = Get-MissingNeedle -Lines $el -Needles $enSections -AtLineStart
        if ($miss) { $badEn += "$no 四段缺 $($miss.Count)" }
    }
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
# ── 过程域覆盖（2026-10-06 增；判据 = design/playbook-contract.md §1.1 词表 + v6-design.md §18）──
# 三层分工：**词表定义在 contract、数据在卡头第 3 行、汇总在本脚本**。这里不读任何手写矩阵——
# 手抄一份必然与卡漂移（矩阵说有覆盖、卡里没有）。缺口的唯一合法出口是「§18 显式点名」。
$paVocab = @('REQ','DES','ARCH','IMP','VER','REL','OPS','CM','QA','RISK','PLAN','KNOW','AGENT')
$paContract = [IO.File]::ReadAllText((Join-Path $root 'design\playbook-contract.md'), [Text.Encoding]::UTF8)
Check ($paContract.Contains('### 1.1 受控过程域词表')) '写作契约含 §1.1 受控过程域词表（卡头第 3 行的取值域）'
$paDesign = [IO.File]::ReadAllText((Join-Path $root 'design\v6-design.md'), [Text.Encoding]::UTF8)
$paAt = $paDesign.IndexOf('## 18. 过程域覆盖矩阵')
$paSection = if ($paAt -ge 0) { $paDesign.Substring($paAt) } else { '' }
Check ($paSection.Length -gt 0) 'design/v6-design.md 含 §18 过程域覆盖矩阵（派生视图说明 + 缺口登记）'
$paMissing = @(); $paBad = @(); $paMismatch = @(); $paUsed = @{}
foreach ($c in $cards) {
    if ($c -eq '0-1-驱动卡') { continue }   # 驱动卡是常驻入口、无四段结构，与 H1/四段同款豁免
    $no = [regex]::Match($c, '^(\d+-\d+)-').Groups[1].Value
    $zhTags = @(); $enTags = @()
    $p = Join-Path $pb "$c.md"
    if (Test-Path $p) {
        $zl = @([System.IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8) | Where-Object { $_.StartsWith('> 过程域：') })
        # '> 过程域：' = 6 个字符（> / 空格 / 过 / 程 / 域 / ：）——少算一位会把全角冒号带进取值
        if ($zl.Count -eq 0) { $paMissing += $c } else { $zhTags = @(($zl[0].Substring(6)).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) }
    }
    $ep = Join-Path $pen $enMap[$no]
    if (Test-Path $ep) {
        $el2 = @([System.IO.File]::ReadAllLines($ep, [Text.Encoding]::UTF8) | Where-Object { $_.StartsWith('> Process area:') })
        if ($el2.Count -eq 0) { $paMissing += "$no EN" } else { $enTags = @(($el2[0].Substring(15)).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) }
    }
    foreach ($t in $zhTags) { if ($paVocab -notcontains $t) { $paBad += "$no=$t" } else { $paUsed[$t] = $true } }
    foreach ($t in $enTags) { if ($paVocab -notcontains $t) { $paBad += "$no EN=$t" } }
    if (($zhTags -join ',') -ne ($enTags -join ',')) { $paMismatch += $no }
}
Check (-not $paMissing) "每张动作卡有过程域行（缺：$($paMissing -join ', ')）"
Check (-not $paBad) "过程域取值在受控词表内（越界：$($paBad -join ', ')）"
Check (-not $paMismatch) "中英同卡号过程域取值一致（不一致：$($paMismatch -join ', ')）"
$paCovered = @($paVocab | Where-Object { $paUsed.ContainsKey($_) })
$paDeclared = @($paVocab | Where-Object { -not $paUsed.ContainsKey($_) -and $paSection.Contains('`' + $_ + '`') })
$paHole = @($paVocab | Where-Object { -not $paUsed.ContainsKey($_) -and -not ($paSection.Contains('`' + $_ + '`')) })
Check (-not $paHole) "每个过程域要么有卡覆盖、要么在 §18 被显式点名（无人认领：$($paHole -join ', ')）"
Observe "过程域覆盖：$($paCovered.Count)/$($paVocab.Count) 项有卡覆盖；待补/裁剪 $($paDeclared.Count) 项（$($paDeclared -join ', ')）"
# ── 子包 version 跟随伞包（配置管理的第一个症状：四个子包长期停 0.1.x 而伞包已 0.7.2）──
$rootVer = ([regex]'"version"\s*:\s*"([^"]+)"').Match([IO.File]::ReadAllText((Join-Path $root 'package.json'), [Text.Encoding]::UTF8)).Groups[1].Value
$subDrift = @()
foreach ($sp in @('roadbook-autoload','roadbook-atlas','roadbook-evolve','roadbook-team')) {
    $spf = Join-Path $root "plugin\$sp\package.json"
    if (-not (Test-Path $spf)) { continue }
    $v = ([regex]'"version"\s*:\s*"([^"]+)"').Match([IO.File]::ReadAllText($spf, [Text.Encoding]::UTF8)).Groups[1].Value
    if ($v -ne $rootVer) { $subDrift += "$sp=$v" }
}
Check (-not $subDrift) "子包 version 跟随伞包 $rootVer（不一致：$($subDrift -join ', ')；子包都不独立发行 —— 版本不跟随就是死元数据）"
# 合理化红旗表：规则唯一正文是 AGENTS.md（D3），英文口径在 glossary-en；段标记只保证标题在，表头断言保证表本身在（中英同批）
$rfZh = [IO.File]::ReadAllText((Join-Path $root 'template\AGENTS.md'), [Text.Encoding]::UTF8)
$rfEn = [IO.File]::ReadAllText((Join-Path $root 'design\glossary-en.md'), [Text.Encoding]::UTF8)
Check (($rfZh -match [regex]::Escape('| 你会想 | 事实 |')) -and ($rfEn -match [regex]::Escape('| You may think | Reality |'))) '规则唯一正文与英文口径都有合理化红旗表表头（中英同批；落点 2026-10-05 由 0-1 卡搬到 AGENTS.md D3）'
Observe ($longCards.Count -eq 0) "本轮观测项（不拦红）：卡 ≤150 行，超限 $($longCards.Count) 张 $($longCards -join ', ')"
$extra = @(Get-ChildItem $pb -Filter *.md | Where-Object { $cards -notcontains $_.BaseName })
Check ($extra.Count -eq 0) "playbook/ 无未注册卡（多出：$($extra.BaseName -join ', ')）"
$extraEn = @(Get-ChildItem $pen -Filter *.md | Where-Object { $enFiles -notcontains $_.Name })
Check ($extraEn.Count -eq 0) "playbook_EN/ 无未注册卡（多出：$($extraEn.BaseName -join ', ')）"

Write-Host "== 2b. 内化机制在位（2026-10-03 superpowers 15 个 skill → 10 张卡 + 母版层；2026-10-04 mattpocock/skills → 14 张卡 + 母版层；2026-10-04 UI/UX 设计流程增强 → 6 张卡 + 3 份模板文档；2026-10-04 安全批次 → 7-9 准入卡 + security.ps1 + 六条铁律；删句即红）=="
$intl = [ordered]@{
    'playbook/0-1-驱动卡.md'                = @('自带推荐答案', '规则在哪', '规则版本')
    'playbook_EN/0-1-driver-card.md'        = @('Where the rules live', 'rule version', 'recommended answer')
    'playbook/1-1-想法调研.md'              = @('动作 0.5', '探针分支')
    'playbook_EN/1-1-idea-research.md'      = @('Action 0.5', 'probe branch')
    'playbook/2-1-功能调研.md'              = @('路径预判', '可分解性先判', '立即停下声明升档', '拒绝台账')
    'playbook_EN/2-1-feature-research.md'   = @('Path pre-judgment', 'Decomposability pre-judgment', 'announce the upgrade', 'rejection ledger')
    'playbook/2-2-需求范围.md'              = @('范围合规九查', '自洽查', '动作 3.5', '批准不跨段查', '展示即开工查', '阻塞依赖显式登记', '用户故事给人看，验收命令给 agent 跑')
    'playbook_EN/2-2-scope-definition.md'   = @('nine scope-compliance checks', 'Self-consistency check', 'Action 3.5', 'Approval does not carry across stages', 'Presenting and starting in the same breath', 'blocking dependencies are registered explicitly', 'Stories are for humans, acceptance commands are for agents')
    'playbook/3-1-设计.md'                  = @('难以回退', '被否方案', '设计计划前置', '九节骨架', '预发六轴自评')
    'playbook_EN/3-1-design.md'             = @('hard to reverse', 'Rejected options', 'Action 0', 'nine-section', 'six-axis')
    'playbook/3-3-测试策略.md'              = @('轮询条件', '接缝先约定', '同义反复测试', '横向切片')
    'playbook_EN/3-3-test-strategy.md'      = @('polling condition', 'agree the seam first', 'tautological test', 'horizontal slicing')
    'playbook/4-1-分批编码.md'              = @('批次接口契约', '每批必念六查', '批次完成行', 'TDD 红先行', '可开工前沿', '快进合并', '批量机械改写之后必须跑全量门禁')
    'playbook_EN/4-1-batch-coding.md'       = @('Batch interface contract', 'six checks to recite every batch', 'Batch completion line', 'TDD red first', 'ready frontier', 'fast-forward', 'after a bulk mechanical rewrite, run the full gate')
    'playbook/4-2-代码审查.md'              = @('派单输入单', '命名风险定点检查', 'SCOPE 沉默', '双轴并行审查', '气味基线', 'AI 生成')
    'playbook_EN/4-2-code-review.md'        = @('Dispatch input sheet', 'named-risk targeted check', 'SCOPE silence is not permission', 'two-axis parallel review', 'smell baseline', 'AI-generated')
    'playbook/4-3-验证.md'                  = @('变异点至少覆盖三类', '禁止在证据出现前表达满意', '证据分档', '没有能变红的命令')
    'playbook_EN/4-3-verification.md'       = @('Mutant points must cover at least three classes', 'before the evidence appears', 'Evidence tiers', 'No red-capable command')
    'playbook/4-5-环境与配置.md'            = @('只有人能做的步骤')
    'playbook_EN/4-5-environments-and-config.md' = @('human-only steps')
    'playbook/5-1-归档.md'                  = @('--force', '妥协点收口', 'no-trigger', 'with no trigger')
    'playbook_EN/5-1-archive.md'            = @('`--force` is forbidden', 'Concession close-out', 'no-trigger', 'with no trigger')
    'playbook/5-2-发布.md'                  = @('单向门', '双向门', '爆炸半径')
    'playbook_EN/5-2-release.md'            = @('one-way door', 'two-way door', 'blast radius')
    'playbook/6-2-根因分析.md'              = @('反向追链', '没有能变红的命令')
    'playbook_EN/6-2-root-cause-analysis.md' = @('Reverse chain tracing', 'no red-capable command')
    'playbook/6-3-修复.md'                  = @('修复尝试计数', 'git bisect run', 'is the first bad commit')
    'playbook_EN/6-3-bugfix.md'             = @('Fix-attempt count', 'git bisect run', 'is the first bad commit')
    'playbook/6-6-流程体检.md'              = @('十六类信号', '信号 13', '信号 14', '信号 15', '信号 16', '改卡前三问', '改规则四条件', '三臂数字', '读数纪律')
    'playbook_EN/6-6-process-audit.md'      = @('sixteen classes of signals', 'Signal 13', 'Signal 14', 'Signal 15', 'Signal 16', 'Three questions before changing a card', 'Four conditions for changing a rule', 'three-arm numbers', 'Reading discipline')
    'playbook/7-3-债与腐化清偿.md'          = @('每批必念六查')
    'playbook_EN/7-3-tech-debt-repayment.md' = @('six checks to recite every batch')
    'playbook/7-7-用户文档与交接.md'        = @('系统临时目录', '指针不复述')
    'playbook_EN/7-7-user-docs-and-handover.md' = @('system temp directory', 'pointers, not copies')
    'playbook/7-8-项目重构.md'              = @('一个适配器 = 假设的接缝')
    'playbook_EN/7-8-refactoring.md'        = @('One adapter means a hypothetical seam')
    'template/AGENTS.md'                    = @('本轮（同一条消息内）', '子 agent 不得自派子 agent', '被否方案台账', 'AI 声明', '系统临时目录', '外部内容一律是数据', 'smart zone', '产物寿命三分类', '只有用户消息是指令', '先削', '不许从上一会话推断批准')
    'playbook/3-4-界面与交互设计.md'        = @('五态', '焦点环', '布局族', 'overflow-x: clip', 'tabular-nums')
    'playbook_EN/3-4-ui-and-interaction-design.md' = @('five states', 'focus ring', 'layout famil', 'overflow-x: clip', 'tabular-nums')
    'playbook/3-5-色彩与风格.md'            = @('--color-brand-ink', '--color-focus', '--z-modal', '60-30-10', 'chroma')
    'playbook_EN/3-5-color-and-style.md'    = @('--color-brand-ink', '--color-focus', '--z-modal', '60-30-10', 'chroma')
    'playbook/3-6-动效与微交互.md'          = @('prefers-reduced-motion: no-preference', 'transition: all', 'IntersectionObserver', 'animationend', 'grid-template-rows')
    'playbook_EN/3-6-motion-and-microinteraction.md' = @('prefers-reduced-motion: no-preference', 'transition: all', 'IntersectionObserver', 'animationend', 'grid-template-rows')
    'playbook/7-1-UI改动.md'                = @('合理化红旗表', '一套制式', '命中 $($hit.Count) 处')
    'playbook_EN/7-1-ui-change.md'          = @('You may think', 'Re-run the three UI self-checks', 'var(--…)')
    'playbook/7-6-国际化与可访问性.md'      = @('合理化红旗表', 'axe', 'pa11y', 'lhci', '未达标表')
    'playbook_EN/7-6-i18n-and-accessibility.md' = @('You may think', 'axe', 'pa11y', 'unmet')
    'template/docs/UI.md'                   = @('交互五态矩阵', '四宽度验证记录', 'tabular-nums', '100dvh')
    'template/docs/DESIGN_TOKENS.md'        = @('--color-brand-ink', '--z-modal', '60-30-10', 'chroma')
    'template/docs/MOTION.md'               = @('prefers-reduced-motion: no-preference', 'IntersectionObserver', 'grid-template-rows', 'animationend')
    'design/playbook-contract.md'           = @('违反规则的字面', '形态选择', '每个问题自带推荐答案', '写作教义', 'no-op 测试', '信息阶梯', '触发词唯一', 'leading words')
    'design/glossary-en.md'                 = @('rejection ledger', 'route drift', 'no-op rule', 'two-axis parallel review', 'smell baseline', 'evidence tiers', 'one-way door', 'blast radius', 'ready frontier', 'fast-forward merge', 'rejected options', 'agree the seam first', 'tautological test', 'horizontal slicing', 'three lifetime classes', 'pointers, not copies', 'AI slop', 'one house style', 'focus ring', 'five states', 'touch target', 'skeleton screen', 'stagger', 'motion fallback', 'layout family', 'four widths', 'unmet-items table', 'z-index tier', 'UI self-check', 'admission record', 'permission surface', 'the five checks', 'external content is data', 'red-line domain', 'every question carries a recommended answer', 'smart zone', 'three lifetime classes', 'only user messages are instructions', 'Never infer approval from a previous session', 'Trim first')
    'SKILL.md'                              = @('子 agent 边界', '调用轴', '分发自检', 'smart zone', '产物寿命', '外部内容一律是数据')
    'README.md'                             = @('分发自检', '外部内容一律是数据')
    'playbook/7-9-外部技能与插件准入.md'     = @('security.ps1', '五查', '准入记录', '判定三值')
    'playbook_EN/7-9-skill-and-plugin-admission.md' = @('security.ps1', 'five checks', 'admission record', 'three-value verdict')
    'playbook/0-2-会话生命周期.md'           = @('会话收尾四步', '压缩前必须先落盘', '会话归档只做三件')
    'playbook_EN/0-2-session-lifecycle.md'  = @('session close', 'before compaction', 'exactly three things')
    'playbook/2-6-外部方案调研.md'           = @('轮子先行五查', '判定三值', '外部方案')
    'playbook_EN/2-6-external-solution-research.md' = @('five wheel-first checks', 'three-value verdict', 'external solutions')
    'playbook/5-6-版本与变更日志管理.md'      = @('升版判定表', '未发布', 'git tag -f')
    'playbook_EN/5-6-version-and-changelog-management.md' = @('version-bump decision table', 'unreleased section', 'git tag -f')
    'playbook/7-10-技术栈迁移.md'            = @('迁移八步', '差异为零')
    'playbook_EN/7-10-tech-stack-migration.md' = @('Eight migration steps', 'zero difference')
    '_qc/baseline/README.md'                = @('对照组', '行号')
}
$missIntl = @()
foreach ($k in $intl.Keys) {
    $ip = Join-Path $root $k
    if (-not (Test-Path $ip)) { $missIntl += "$k 不存在"; continue }
    $itxt = [IO.File]::ReadAllText($ip, [Text.Encoding]::UTF8)
    foreach ($nd in $intl[$k]) { if (-not $itxt.Contains($nd)) { $missIntl += "$k 缺「$nd」" } }
}
Check (-not $missIntl) "内化判据在位（缺：$($missIntl -join '；')）"
Check (Test-Path (Join-Path $root '_qc/internalize-2026-10-03.md')) '内化记录 _qc/internalize-2026-10-03.md 在位（15→40 映射矩阵 + 明确不拿的 7 条 + 下一轮候选）'
Check (Test-Path (Join-Path $root '_qc/internalize-2026-10-04.md')) '内化记录 _qc/internalize-2026-10-04.md 在位（mattpocock/skills → 14 张卡 + 母版层：来源、落点、needle 清单、写者裁决）'
Check (Test-Path (Join-Path $root '_qc/internalize-2026-10-04-security.md')) '内化记录 _qc/internalize-2026-10-04-security.md 在位（安全批次：来源星数表、落点、明确不拿、写者与作用域、证据全文路径）'

Write-Host "== 3. 模板 template/ =="
$tpl = Join-Path $root 'template'
$budget = @{ 'README.md' = 40; 'AGENTS.md' = 240; 'STATE.md' = 45; 'CHANGELOG.md' = 40; 'docs/README.md' = 55; 'docs/registry/COMPONENTS.md' = 50; 'docs/ARCHITECTURE.md' = 120; 'docs/RUNBOOK.md' = 100; 'docs/OBSERVABILITY.md' = 80; 'docs/PRIVACY.md' = 80; 'docs/I18N.md' = 60; 'docs/USER_GUIDE.md' = 60; 'docs/UI.md' = 120; 'docs/DESIGN_TOKENS.md' = 110; 'docs/MOTION.md' = 100; 'docs/refactor/README.md' = 40; 'check.ps1' = 110; 'doctor.ps1' = 80; 'gate.ps1' = 110; 'orphans.ps1' = 90; 'security.ps1' = 130 }
foreach ($k in @('README.md','AGENTS.md','STATE.md','CHANGELOG.md','.tool-versions','check.ps1','doctor.ps1','gate.ps1','orphans.ps1','security.ps1','.env.example','.gitignore','.gitattributes','docs/README.md','docs/ARCHITECTURE.md','docs/RUNBOOK.md','docs/OBSERVABILITY.md','docs/PRIVACY.md','docs/I18N.md','docs/USER_GUIDE.md','docs/registry/COMPONENTS.md','docs/registry/DATA_DICT.md','docs/registry/APIS.md','docs/pool/IDEAS.md','docs/TECH_DEBT.md','docs/UI.md','docs/DESIGN_TOKENS.md','docs/MOTION.md','docs/refactor/README.md')) {
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
Check (([IO.File]::ReadAllText((Join-Path $tpl 'AGENTS.md'), [Text.Encoding]::UTF8)).Contains('| 你会主张 | 需要什么（才算数） | 不算数 |')) 'template/AGENTS.md 回执契约含「主张｜需要什么｜不算数」三列表（挡住「我完成了」这类空口主张）'
foreach ($f in @('当前文件数','工作树状态','远端仓库','起点锚点','档位','体检计数','风险摘要','最近完成','未决问题','下一步','最近归档','裁剪记录')) {
    Check ($smTxt -match ("(?m)^[\s#\-*|]*" + [regex]::Escape($f))) "STATE.md 含 design §7 字段「$f」（须是行首字段；正文里提一句不算——防字段被静默删掉）"
}
$drmTxt = ''
$drm = Join-Path $tpl 'docs\README.md'
if (Test-Path $drm) { $drmTxt = [IO.File]::ReadAllText($drm, [Text.Encoding]::UTF8) }
Check ($drmTxt -match '产出卡' -and $drmTxt -match '消费卡') 'docs/README.md 是「文档↔卡」对应表（每份文档能指回产出卡与消费卡，无对应 = 分裂文档）'
# 新增体验/工具文档：必须同时出现在 docs/README.md 对应表与 design §5 目录树，否则 = 孤儿文档或幽灵引用
$newDocs = @('UI.md','DESIGN_TOKENS.md','MOTION.md','refactor/')
$missDrm = @($newDocs | Where-Object { $drmTxt -notmatch [regex]::Escape($_) })
Check (-not $missDrm) "docs/README.md 对应表含新增文档（缺：$($missDrm -join ', ')）"
$designRaw = [IO.File]::ReadAllText((Join-Path $root 'design/v6-design.md'), [Text.Encoding]::UTF8)
$missDsn = @($newDocs | Where-Object { $designRaw -notmatch [regex]::Escape($_) })
Check (-not $missDsn) "design §5 目录树含新增文档（缺：$($missDsn -join ', ')）"
$ckTxt = ''
$ckp = Join-Path $tpl 'check.ps1'
if (Test-Path $ckp) { $ckTxt = [IO.File]::ReadAllText($ckp, [Text.Encoding]::UTF8) }
Check ($ckTxt -match '\$fileBudgetGrowth') 'template/check.ps1 有文件数预算断言（$fileBudgetGrowth）'
$wired = @('4-1-分批编码','5-1-归档','6-6-流程体检','7-3-债与腐化清偿') | Where-Object { $p2 = Join-Path $pb "$_.md"; -not (Test-Path $p2) -or ([IO.File]::ReadAllText($p2, [Text.Encoding]::UTF8) -notmatch 'orphans\.ps1') }
Check (-not $wired) "死代码治理四卡均引用 orphans.ps1（缺：$wired）"
$secWired = @((Join-Path $pb '1-2-选型初始化.md'), (Join-Path $pen $enMap['1-2']), (Join-Path $pb '1-3-接入已有项目.md'), (Join-Path $pen $enMap['1-3']), (Join-Path $pb '7-9-外部技能与插件准入.md'), (Join-Path $pen $enMap['7-9'])) | Where-Object { -not (Test-Path $_) -or ([IO.File]::ReadAllText($_, [Text.Encoding]::UTF8) -notmatch 'security\.ps1') }
Check (-not $secWired) "security.ps1 接线：1-2 / 1-3 / 7-9 中英均引用（缺：$($secWired -join ', ')）"
$p23 = Join-Path $pb '4-1-分批编码.md'
Check ((Test-Path $p23) -and ([IO.File]::ReadAllText($p23, [Text.Encoding]::UTF8) -match '文件数基线')) '4-1 卡有「文件数基线」回写义务（防预算机制空转）'
Check ((([IO.File]::ReadAllText((Join-Path $pb '4-1-分批编码.md'), [Text.Encoding]::UTF8)).Contains('自行裁决留痕')) -and (([IO.File]::ReadAllText((Join-Path $pen '4-1-batch-coding.md'), [Text.Encoding]::UTF8)).Contains('Verdict trail'))) '4-1 卡：自行裁决留痕格式在位（中英同批；不停下问人时也必须留一行）'
foreach ($d in @('decisions','specs','reviews','versions','lessons','archive')) {
    Check (Test-Path (Join-Path $tpl "docs\$d")) "模板目录存在：docs/$d"
}
# 种子教训卡：张数与体例（6-2 卡动作要写「最近确认」、6-6 卡信号 3 读它；张数漂移 = design §5/§10 与 5-1 卡「6 张种子卡不参加淘汰」口径失配）
$seed = @(Get-ChildItem (Join-Path $tpl 'docs\lessons') -Filter '*.md' -File -ErrorAction SilentlyContinue)
Check ($seed.Count -eq 6) "模板种子教训卡 6 张（实际 $($seed.Count) 张；增删须同步 design §5 目录树 / §10 记录 / 5-1 卡豁免句）"
foreach ($s in $seed) {
    $sl = [System.IO.File]::ReadAllLines($s.FullName, [Text.Encoding]::UTF8)
    $slTxt = [string]::Join("`n", $sl)
    Check ($sl.Count -le 12) "行数 $($sl.Count) <= 12 ：docs/lessons/$($s.Name)"
    Check ($slTxt -match '最近确认') "种子卡含「最近确认」字段（6-2 卡动作 / 6-6 卡信号 3 的落点）：$($s.Name)"
    # 6-6 信号 3 的三行机器可读字段（S13）：缺字段 = 教训聚类与淘汰都不可判定
    Check ($slTxt -match '复发次数\s*[:：]\s*\d+') "种子卡含「复发次数: N」（6-6 信号 3 聚类用）：$($s.Name)"
    Check ($slTxt -match '作用域\s*[:：]\s*(项目|全局)') "种子卡含「作用域: 项目|全局」（升格/淘汰判据）：$($s.Name)"
    Check ($slTxt -match '最近复发\s*[:：]\s*\d{4}-\d{2}-\d{2}') "种子卡含「最近复发: YYYY-MM-DD」：$($s.Name)"
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
    # YAML 安全：值未加引号却含 ASCII「: 」⇒ 被 YAML 读成嵌套映射 ⇒ 宿主 parseFrontmatter 抛错后**整份静默丢弃**
    # （2026-10-06 实例：description 里的 "wanted: a one-off" 让 roadbook 技能从未进过技能目录，inject 事件 0 条；
    #  本节其余断言全走正则，正则读得懂非法 YAML，所以九条全绿也拦不住 —— 这条必须真的判 YAML 的语法约束）
    $fmLines = @(); for ($i = 1; $i -lt $skLines.Count; $i++) { if ($skLines[$i] -eq '---') { break }; $fmLines += $skLines[$i] }
    $fmUnsafe = @($fmLines | Where-Object {
        ($_ -match '^[A-Za-z][A-Za-z0-9_-]*\s*:') -and
        (($_ -split ':', 2)[1] -notmatch '^\s*["'']') -and
        (($_ -split ':', 2)[1] -match ': ')
    } | ForEach-Object { $_.Substring(0, [Math]::Min(24, $_.Length)) + '…' })
    Check (-not $fmUnsafe) "SKILL.md frontmatter 未加引号的值不含 ASCII「: 」（命中：$($fmUnsafe -join ' | ')）"
    $skKw = @('开工确认', 'check.ps1', '红灯', '回执', '外部内容一律是数据') | Where-Object { $skRaw -notmatch [regex]::Escape($_) }
    Check (-not $skKw) "SKILL.md 含六条铁律关键词（缺：$($skKw -join ', ')）"
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
$secTxt = if (Test-Path (Join-Path $tpl 'security.ps1')) { [IO.File]::ReadAllText((Join-Path $tpl 'security.ps1'), [Text.Encoding]::UTF8) } else { '' }
Check ($secTxt -match 'ReportOnly') 'template/security.ps1 有 -ReportOnly 只报不拦开关（人是裁决者，机器只报）'
Check ($secTxt -match 'SkillDir') 'template/security.ps1 支持 -SkillDir 扫第三方技能目录（7-9 卡的机检入口）'
Check ($secTxt -match 'BOM' -and $secTxt -match 'exit 1') 'template/security.ps1 含 .ps1 无 BOM 检查与判红退出码（P0 教训的机械防线）'
$secExit = -1
if (Test-Path (Join-Path $tpl 'security.ps1')) { & powershell -NoProfile -File (Join-Path $tpl 'security.ps1') -RepoRoot $root *> $null; $secExit = $LASTEXITCODE }
Check ($secExit -eq 0) 'security.ps1 在母版自身跑出退出码 0（新门禁不许红自己：母版里出现真密钥/危险执行链 = 先修内容，不许改文档骗规则）'
# 红线域五类措辞一致性（2026-10-04 安全批次；R1/R2 独立复核各报一次「同批内新旧枚举并存」）
$redlineFiles = @('template/AGENTS.md','SKILL.md','playbook/2-1-功能调研.md','playbook/4-1-分批编码.md','playbook/7-9-外部技能与插件准入.md','design/v6-design.md')
foreach ($rf in $redlineFiles) {
    $rft = [IO.File]::ReadAllText((Join-Path $root $rf), [Text.Encoding]::UTF8)
    $missRl = @('改表结构','对外接口') | Where-Object { $rft -notmatch [regex]::Escape($_) }
    Check (-not $missRl) "$rf 红线域五类措辞在位（缺：$($missRl -join ', ')）"
}
foreach ($rf in @('template/AGENTS.md','playbook/4-1-分批编码.md')) {
    $rft = [IO.File]::ReadAllText((Join-Path $root $rf), [Text.Encoding]::UTF8)
    Check ($rft -notmatch '认证/支付') "$rf 无旧三枚举残留（认证/支付）"
}
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
Check ($t43 -match '提交节奏' -and $t43 -match '推送滞后' -and $t43 -match '十六类' -and $t43 -match '信号 13' -and $t43 -match '信号 14' -and $t43 -match '信号 15' -and $t43 -match '信号 16') '6-6 卡有提交节奏与推送滞后信号 + 十六类信号（信号 13 路由漂移 / 14 no-op 规则 / 15 证据臂污染 / 16 审查可行动率）'
$t43e = [IO.File]::ReadAllText((Join-Path $pen '6-6-process-audit.md'), [Text.Encoding]::UTF8)
Check ($t43e -match 'sixteen classes' -and $t43e -match 'Signal 15' -and $t43e -match 'Signal 16') '6-6 英文卡同步十六类信号（Signal 15/16）'
Check ($t43 -match 'inject_events') '6-6 信号 15 读真实字段 inject_events（证据臂污染可判定，不靠印象）'
Check ($t43 -match '三臂数字' -and $t43 -match '副作用声明' -and $t43 -match '复现门槛' -and $t43 -match '陈旧读数') '6-6 改规则四条件齐（三臂数字 / 副作用声明 / 复现门槛 / 读数纪律）'
Check ($t43e -match 'three-arm numbers' -and $t43e -match 'Side-effect statement' -and $t43e -match 'Recurrence threshold' -and $t43e -match 'stale reading') '6-6 英文卡改规则四条件齐'
Check ($t43 -match '可行动' -and $t43e -match 'actionable') '6-6 信号 16 审查可行动率中英在位（N>0 且可行动=0 连续两轮 = 质疑剧场）'
$t63 = [IO.File]::ReadAllText((Join-Path $pb '6-3-修复.md'), [Text.Encoding]::UTF8)
$t63e = [IO.File]::ReadAllText((Join-Path $pen '6-3-bugfix.md'), [Text.Encoding]::UTF8)
Check ($t63 -match 'git bisect run' -and $t63 -match 'git bisect reset') '6-3 卡有二分定位（F1）：bisect run + 收尾 reset'
Check ($t63e -match 'git bisect run' -and $t63e -match 'is the first bad commit') '6-3 英文卡同步二分定位'
$t51 = [IO.File]::ReadAllText((Join-Path $pb '5-1-归档.md'), [Text.Encoding]::UTF8)
$t51e = [IO.File]::ReadAllText((Join-Path $pen '5-1-archive.md'), [Text.Encoding]::UTF8)
Check ($t51 -match '妥协点收口' -and $t51 -match 'no-trigger' -and $t51 -match 'with no trigger') '5-1 卡归档前做妥协点收口（S6）：未闭合的必须落 TD 或未决问题'
Check ($t51e -match 'Concession close-out' -and $t51e -match 'with no trigger') '5-1 英文卡同步妥协点收口'
$commitCards = [ordered]@{ '1-2-选型初始化' = '1-2'; '1-3-接入已有项目' = '1-3'; '4-1-分批编码' = '4-1'; '6-3-修复' = '6-3'; '5-1-归档' = '5-1'; '6-5-复盘' = '6-5'; '7-1-UI改动' = '7-1'; '7-2-依赖升级' = '7-2'; '7-4-功能下线' = '7-4' }
$noNum = @($commitCards.Keys | Where-Object { ([IO.File]::ReadAllText((Join-Path $pb "$_.md"), [Text.Encoding]::UTF8)) -notmatch ('git commit -m "' + $commitCards[$_] + ' ') })
Check (-not $noNum) "提交信息统一带卡号（缺：$($noNum -join ', ')）"

Write-Host "== 6. 自动加载插件 plugin/roadbook-autoload =="
$plg = Join-Path $root 'plugin\roadbook-autoload'
foreach ($k in @('package.json','cordis.patch.yml','index.js','trigger.js','host-fallback.js','icon.svg','README.md','locale\zh.json','locale\en.json','test\trigger.test.mjs','test\index.test.mjs','test\banner.test.mjs','test\host-fallback.test.mjs')) {
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
Check (($plgIdx -match 'loadHostPackage') -and ($plgIdx -notmatch "(?m)^import[^\n]*from '@deepseek-ai/") -and ($plgIdx -match 'hostFallbacks')) '插件的宿主包走守卫式解析（静态 import 宿主包 = 解析不到时整行静默变「未运行」，禁止回退）'
Check (($plgIdx -match "event: 'loaded'") -and ($plgIdx -match 'host-fallback\.js')) '插件 apply() 写就绪回执 loaded（面板外的「本行跑起来了」自证）且带本地兜底实现'
$plgBad = @('locale\zh.json','locale\en.json') | Where-Object { $t = [IO.File]::ReadAllText((Join-Path $plg $_), [Text.Encoding]::UTF8); ($t -notmatch '"title"\s*:') -or ($t -notmatch '"description"\s*:') }
Check (-not $plgBad) "插件中英文展示元信息齐（缺：$($plgBad -join ', ')）"
$plgRdm = [IO.File]::ReadAllText((Join-Path $plg 'README.md'), [Text.Encoding]::UTF8)
Check ($plgRdm -match 'trigger\.test\.mjs') '插件 README 写了离线单测命令'
Check ($plgIdx -match 'surfaceInjectionState') '插件：压缩后重注入的可见面判据在位（禁止静默退回「只认日志去重」）'
Check (([IO.File]::ReadAllText((Join-Path $root 'README.md'), [Text.Encoding]::UTF8)) -match 'plugin/roadbook-autoload') '根 README 指向自动加载插件（可发现）'
Write-Host "== 6b. 主插件伞包（仓库根 = roadbook）=="
$umbPkgPath = Join-Path $root 'package.json'
$umb = $null
try { $umb = [IO.File]::ReadAllText($umbPkgPath, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { $umb = $null }
Check ($null -ne $umb) '主插件 package.json 可解析（JSON 合法）'
if ($null -ne $umb) {
    Check (($umb.name -eq 'roadbook') -and ($umb.type -eq 'module') -and ([bool]$umb.private)) "主插件身份：roadbook / ESM / private（实际：$($umb.name) / $($umb.type)）"
    Check ($umb.dsh.bundle.patch -eq './cordis.patch.yml') '主插件声明 dsh.bundle.patch（DSH 的 reconcile 才把它登记为组合包）'
    Check (($umb.dsh.client.platform -eq 'web') -and (@($umb.dsh.client.inject).Count -gt 0)) '主插件声明客户端半（platform: web + inject 非空）'
    $umbSub = [ordered]@{ '.' = './lib/index.js'; './autoload' = './plugin/roadbook-autoload/index.js'; './atlas' = './plugin/roadbook-atlas/lib/index.js'; './team' = './plugin/roadbook-team/index.js'; './evolve' = './plugin/roadbook-evolve/index.js'; './client' = './lib/client.js' }
    $umbMiss = @($umbSub.Keys | Where-Object { ([string]$umb.exports.$_) -ne $umbSub[$_] -or (-not (Test-Path (Join-Path $root ($umbSub[$_] -replace '^\./','')))) })
    Check (-not $umbMiss) "伞包 exports 六个入口齐且文件存在（缺/错：$($umbMiss -join ', ')）"
    Check ((-not $umb.exports.'./bundle') -and (-not (Test-Path (Join-Path $root 'lib\bundle.js')))) 'group 容器已删（exports 无 ./bundle、lib/bundle.js 不存在）'
    $umbFiles = @($umb.files)
    Check (($umbFiles -contains 'lib') -and ($umbFiles -contains 'skills') -and ($umbFiles -contains 'plugin')) '伞包 files 白名单含 lib/ skills/ plugin/（随包分发不漏）'
    Check (($umbFiles -contains 'playbook') -and ($umbFiles -contains 'playbook_EN') -and ($umbFiles -contains 'template')) '伞包 files 白名单含 playbook/ playbook_EN/ template/（随包分发漏了它们 = 装出来的插件没有流程卡：skills/roadbook/SKILL.md 第一件事就是让 agent 读 playbook_EN/0-1-driver-card.md）'
    Check ((@($plgPkg.files) -contains 'host-fallback.js')) '插件 files 白名单含 host-fallback.js（index.js 静态 import 它；漏包 = 解包后 import 报 ERR_MODULE_NOT_FOUND，面板显示未运行）'
}
$ciPath = Join-Path $root '.github\workflows\ci.yml'; $ciTxt = if (Test-Path $ciPath) { [IO.File]::ReadAllText($ciPath, [Text.Encoding]::UTF8) } else { '' }
Check ((Test-Path $ciPath) -and ($ciTxt -match '_qc/check\.ps1') -and ($ciTxt -notmatch 'continue-on-error')) 'CI 工作流 .github/workflows/ci.yml 在位：只跑与本地相同的 _qc/check.ps1，且无 continue-on-error（口径唯一：design §16 第 6 行）'
Check (([IO.File]::ReadAllText((Join-Path $root '.gitignore'), [Text.Encoding]::UTF8)) -match '\.dsh-code-index') '.gitignore 覆盖 .dsh-code-index/（DSH 代码索引本地缓存；未忽略会让工作树永远不干净，5-1 卡「工作树必须干净」判据失效）'
$umbIgnore = [IO.File]::ReadAllText((Join-Path $root '.gitignore'), [Text.Encoding]::UTF8)
Check (($umbIgnore -match '(?m)^\.env\s*$') -and ($umbIgnore -match '(?m)^\*\.pem\s*$') -and ($umbIgnore -match '(?m)^\*\.key\s*$')) '母版 .gitignore 挡 .env / *.pem / *.key（design §14 第 5 行要求推送前 git check-ignore -v .env 自证：母版此前一条都不命中，而 template/.gitignore 早有这几条，属口径不齐；密钥推出去不可逆）'
foreach ($k in @('cordis.patch.yml','lib\index.js','lib\client.js','skills\roadbook\SKILL.md','skills\roadbook-atlas\SKILL.md','test\skill-mirror.test.mjs','test\umbrella-contract.test.mjs','test\packaging.test.mjs')) { Check (Test-Path (Join-Path $root $k)) "伞包文件存在：$k" }
$umbYml = [IO.File]::ReadAllText((Join-Path $root 'cordis.patch.yml'), [Text.Encoding]::UTF8)
Check (($umbYml -match '(?m)^- insert:') -and ($umbYml -notmatch 'roadbook-bundle') -and ($umbYml -notmatch '(?m)^\s+group:\s*true\s*$')) '伞包 patch：- insert: 平铺（不再有 group 容器行 —— 容器行自己在面板上显示成「已关闭」）'
$umbRows = [ordered]@{ 'roadbook' = 'roadbook'; 'roadbook-skills' = '@deepseek-ai/dsh-skill-filesystem'; 'roadbook-autoload' = 'roadbook/autoload'; 'roadbook-atlas' = 'roadbook/atlas'; 'roadbook-team' = 'roadbook/team'; 'roadbook-evolve' = 'roadbook/evolve' }
$umbRowBad = @($umbRows.Keys | Where-Object { ($umbYml -notmatch ("(?m)^\s{4}-\s*id:\s*" + [regex]::Escape($_) + '\s*$')) -or ($umbYml -notmatch ("(?m)^\s+name:\s*'?" + [regex]::Escape($umbRows[$_]) + "'?\s*$")) })
Check (-not $umbRowBad) "六行（1 主行 + 5 子行）都是 - insert: 的直接子项（缩进 4 空格；id/模块名缺或缩进错：$($umbRowBad -join ', ')）"
Check (($umbYml -match 'bundledSkillDir') -and ($umbYml -match "createRequire\(baseUrl\)\.resolve\('roadbook/package\.json'\)") -and ($umbYml -match 'includeDefaultRoots:\s*false')) '技能行按伞包 npm 身份解析 bundledSkillDir，且不与默认根重复'
Check ((Get-FileHash (Join-Path $root 'SKILL.md') -Algorithm SHA256).Hash -eq (Get-FileHash (Join-Path $root 'skills\roadbook\SKILL.md') -Algorithm SHA256).Hash) 'skills/roadbook/SKILL.md 是根 SKILL.md 的逐字节镜像（改一份必须同步另一份）'
# ── 2026-10-05：主插件自动更新（判定 / 取证 / 执行 / 两条本机路由） ──────────────
# 为什么每条都要有断言：这套能力有三个「静默失效」方向，光靠人眼看不出来 ——
#   ① 判定退化成真假两值（读不到就显示「已是最新」= 假绿）；② 变更路由少了同源守卫（本机页面可触发安装命令）；
#   ③ 模块被漏进发布白名单（装出来的副本没有 lib/update.js，整条链路在真机上不存在）。
$umbUpd = Join-Path $root 'lib\update.js'
Check (Test-Path $umbUpd) '更新能力模块存在：lib/update.js（纯逻辑层，主行静态 import 它）'
if (Test-Path $umbUpd) {
    $umbUpdTxt = [IO.File]::ReadAllText($umbUpd, [Text.Encoding]::UTF8)
    Check (($umbUpdTxt -match "state:\s*'unknown'") -and ($umbUpdTxt -match "'no-upstream'") -and ($umbUpdTxt -match 'update-available')) '更新判定是三态以上（读不到 = unknown，不许退化成「已是最新」）'
    Check (($umbUpdTxt -match 'trustedLocalRequest') -and ($umbUpdTxt -match 'sec-fetch-site') -and ($umbUpdTxt -match 'loopbackAuthority')) '本机请求守卫在位（DNS rebinding：Host 必须是 loopback、跨站与不同源 Origin 一律拒）'
    # 0.7.0：升级是否真的生效 = 「重启后的运行版本 ↔ 观测文件里最后一条 apply-finish 的目标版本」对账。
    # 断言锚到**代码行**：只写 -match 'upgradeOutcome' 会被 import 行与 JSDoc 满足（恒真空断言，复核实测过）。
    Check (($umbUpdTxt -match 'export function lastApplyTarget') -and ($umbUpdTxt -match 'export function upgradeOutcome') -and ($umbUpdTxt -match "state: order > 0 \? 'newer' : 'pending'") -and ($umbUpdTxt -match 'entry\.exitCode !== 0') -and ($umbUpdTxt -match 'after === before') -and ($umbUpdTxt -match 'function readableVersion')) '升级生效对账在位（四态；只认最后一条「真换了版本的成功安装」：失败 / 空转 / 读不到都不算落地）'
}
$umbLineTxt = [IO.File]::ReadAllText((Join-Path $root 'lib\index.js'), [Text.Encoding]::UTF8)
Check (($umbLineTxt -match '/roadbook/update/status') -and ($umbLineTxt -match '/roadbook/update/apply') -and ($umbLineTxt -match 'candidateInstallers')) '主行注册两条更新路由并走命令探测（找不到可用命令就拒绝，不许随便挑一条）'
Check (($umbLineTxt -match 'upgrade: upgradeInfo\(\)') -and ($umbLineTxt -match 'before: landed\?\.before')) '状态路由把升级对账发出去且带上 before（界面那句「已生效：v{before} → v{target}」靠它，缺了恒显示 v?）'
Check (([IO.File]::ReadAllText((Join-Path $root 'README.md'), [Text.Encoding]::UTF8)) -match '自动更新') '根 README 写明主插件自带自动更新（可发现）'
$umbCli = [IO.File]::ReadAllText((Join-Path $root 'lib\client.js'), [Text.Encoding]::UTF8)
Check (($umbCli -match 'id:\s*"roadbook"') -and ($umbCli -match 'roadbook:gallery') -and ($umbCli -match 'roadbook:evolve') -and ($umbCli -notmatch 'roadbook-atlas:gallery')) '客户端半 id = 包名、标签页 id = roadbook:gallery + roadbook:evolve（旧 id 不许残留）'
# 0.7.1：插件详情页（DSH 侧栏「插件」→ roadbook 组合包详情）的检查更新入口。三条断言各挡一个方向：
#   ① slot 名/注册行写错 = 静默不出现；② 顶层 inject 里放服务 = 服务缺席/迟到时本行 PENDING 或根本没
#      有 fiber，DSH 把任一未激活条目判死（0.7.0「应用无法启动」的成因）；③ 不按 subject 认领 = 跑到别人的详情页上说话。
Check (($umbCli -match '\[DETAIL_ACTION_SLOT, "roadbook-update-action"') -and ($umbCli -match '\[DETAIL_BADGE_SLOT, "roadbook-update-badge"') -and ($umbCli -match '\[DETAIL_SECTION_SLOT, "roadbook-update-section"')) '客户端半把三处贡献注册进插件详情页三个 slot（锚到注册表那一行；只 match slot 名会被注释满足 = 恒真）'
Check (($umbCli -match '(?m)^\t\tvar inject = \[\];\s*$') -and ($umbCli -match "ctx\.inject\(\[.slots.\]") -and ($umbCli -match '(?m)^\t+ctx\.inject\(\["betterSidebar"\], function \(scope\) \{') -and ($umbCli -match 'detailIsOurs\(props\.subject\)')) '客户端半顶层 inject 必须是空数组、slots 与 betterSidebar 都走作用域注入、且按 subject 认领（顶层 inject 缺服务 ⇒ 本行 PENDING / 没有 fiber ⇒ DSH 判死整个应用）'
$umbAtlas = [IO.File]::ReadAllText((Join-Path $root 'plugin\roadbook-atlas\package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
Check (((-not $umbAtlas.dsh.bundle) -and (-not $umbAtlas.dsh.client)) -and (@($umbAtlas.exports.PSObject.Properties.Name) -contains './package.json')) 'atlas 子插件已降级：无 dsh.bundle / dsh.client（不单独安装，避免第二个状态源）'
# ── 2026-10-05：自进化行 roadbook-evolve ────────────────────────────────────────
# 三条断言各挡一个静默失效方向：① 打包漏 signals.js（入口静态 import 它，漏了 = 面板「未运行」，
# 与 0.2.1 的 host-fallback 事故同型）；② 判定退化成真假两值（读不到显示成 ok = 假绿，本行存在的
# 全部理由就是不许这样）；③ 把 webServer 写进 inject（服务缺席时整行被判不可用，而它注册的路由
# 本来就是「服务在才有」的可选能力）。
$umbEvolve = [IO.File]::ReadAllText((Join-Path $root 'plugin\roadbook-evolve\package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
Check (((-not $umbEvolve.dsh.bundle) -and (-not $umbEvolve.dsh.client)) -and (@($umbEvolve.exports.PSObject.Properties.Name) -contains './package.json')) 'evolve 子插件不单独安装：无 dsh.bundle / dsh.client'
Check ((@($umbEvolve.files) -contains 'index.js') -and (@($umbEvolve.files) -contains 'signals.js')) 'evolve files 白名单含 index.js 与 signals.js（入口静态 import 后者；漏包 = ERR_MODULE_NOT_FOUND）'
$umbEvoTxt = [IO.File]::ReadAllText((Join-Path $root 'plugin\roadbook-evolve\signals.js'), [Text.Encoding]::UTF8)
Check (($umbEvoTxt -match 'VERDICTS') -and ($umbEvoTxt -match "'unknown'") -and ($umbEvoTxt -match '读不到')) '自进化信号表是三态（ok/hit/unknown）：读不到判 unknown，不许显示成 ok'
$umbEvoIdx = [IO.File]::ReadAllText((Join-Path $root 'plugin\roadbook-evolve\index.js'), [Text.Encoding]::UTF8)
Check (($umbEvoIdx -match '/roadbook/evolve/status') -and ($umbEvoIdx -match '/roadbook/evolve/tick') -and ($umbEvoIdx -match 'trustedLocalRequest')) '自进化行注册两条只读路由并过同源守卫'
Check ($umbEvoIdx -match '(?m)^export const inject = \[\];\s*$') '自进化行 inject 必须是空数组（写进 inject 会让缺 webServer 时整行被判「未运行」）'
$umbRd = [IO.File]::ReadAllText((Join-Path $root 'README.md'), [Text.Encoding]::UTF8)
Check (($umbRd -match '主插件') -and ($umbRd -match 'roadbook-skills') -and ($umbRd -match '不单独安装')) '根 README 写明「一个主插件 + 可独立开关的子行、子插件不单独安装」'
$blDir = Join-Path $root '_qc/baseline'
$blPrompts = @(Get-ChildItem (Join-Path $blDir 'prompts') -Filter '*.txt' -File -ErrorAction SilentlyContinue)
$blFiles = @('run.ps1', 'README.md') | Where-Object { Test-Path (Join-Path $blDir $_) }
$blTxt = ($blFiles | ForEach-Object { [IO.File]::ReadAllText((Join-Path $blDir $_), [Text.Encoding]::UTF8) }) -join "`n"
Check (($blPrompts.Count -ge 8) -and ($blFiles.Count -eq 2) -and ($blTxt -match 'exit 2') -and ($blTxt -match '不改卡') -and ($blTxt -match '-HarnessCmd') -and ($blTxt -match '证据不足')) '卡行为 baseline 脚手架在位（≥8 条压力提示词 + run.ps1 未接线即 exit 2 + README 写明 -HarnessCmd 契约、判定口径与「只记证据不改卡」）'
$blRd = [IO.File]::ReadAllText((Join-Path $blDir 'README.md'), [Text.Encoding]::UTF8)
Check (($blRd -match '臂隔离') -and ($blRd -match '区分度') -and ($blRd -match '桩文件') -and ($blRd -match '量表先填') -and ($blRd -match 'ledger\.json')) 'baseline README 写明四条硬口径（臂隔离 / 断言区分度与观察分离 / 桩文件 / 量表先填 + 台账）'
$blRun = [IO.File]::ReadAllText((Join-Path $blDir 'run.ps1'), [Text.Encoding]::UTF8)
Check (($blRun -match '-Declare') -and ($blRun -match '-IsolationProof') -and ($blRun -match '-TriggerSet') -and ($blRun -match 'ledger\.json') -and ($blRun -match 'summary\.md') -and ($blRun -match '不含结论')) 'run.ps1 接线：-Declare / -IsolationProof / -TriggerSet / ledger.json / summary.md 且在位（缺任一即 exit 2；汇总不含结论）'
$trigDir = Join-Path $blDir 'triggers'
$trigObj = $null
if (Test-Path (Join-Path $trigDir 'queries.json')) { $trigObj = ([IO.File]::ReadAllText((Join-Path $trigDir 'queries.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json) }
$trigQ = @()
if ($null -ne $trigObj) { $trigQ = @($trigObj.queries) }
$trigY = @($trigQ | Where-Object { $_.should_route -eq $true })
$trigN = @($trigQ | Where-Object { $_.should_route -eq $false })
$trigBad = @($trigQ | Where-Object { ([string]::IsNullOrWhiteSpace($_.id)) -or ([string]::IsNullOrWhiteSpace($_.query)) -or ([string]::IsNullOrWhiteSpace($_.split)) -or (($_.should_route -eq $true) -and ([string]::IsNullOrWhiteSpace($_.expect_card))) })
Check (($trigQ.Count -ge 20) -and ($trigY.Count -ge 12) -and ($trigN.Count -ge 6) -and ($trigBad.Count -eq 0) -and ((@($trigQ | ForEach-Object { $_.id }) | Select-Object -Unique).Count -eq $trigQ.Count)) "触发布线题目在位：≥20 条（true ≥12 / false ≥6）、id 唯一、true 必给 expect_card（实际 $($trigQ.Count) 条）"
$trigRd = ''
if (Test-Path (Join-Path $trigDir 'README.md')) { $trigRd = [IO.File]::ReadAllText((Join-Path $trigDir 'README.md'), [Text.Encoding]::UTF8) }
Check (($trigRd -match '3 次') -and ($trigRd -match '指错卡') -and ($trigRd -match 'split="test"')) '触发布线判据在位（每条 3 次、指错卡与未触发分开记、只按 test 选优）'
Check (($blRd -match 'inject_events') -and ($blRd -match 'trigger-eval\.json') -and ($blRd -match '## 观察') -and ($blRd -match '## 判据命中') -and ($blRd -match '## 改动建议') -and ($blRd -match 'stub_untouched')) 'baseline README 写明机判口径（臂内 inject_events / judge.md 三区 / 桩文件 stub_untouched / 加载面评估集）'
Check (($blRun -match '-StubFile') -and ($blRun -match 'stub_untouched') -and ($blRun -match 'turns') -and ($blRun -match 'total_tokens') -and ($blRun -match 'duration_ms') -and ($blRun -match '样本量')) 'run.ps1 落盘机判列与样本量（stub_untouched / turns / total_tokens / duration_ms；拿不到留空不算失败）'
$evPath = Join-Path $plg 'test\fixtures\trigger-eval.json'
$evCases = @()
# 注意：PS 5.1 下 `@(<字符串> | ConvertFrom-Json)` 会把整个数组当成一个对象（实测 Count=1），必须先赋值再 @()。
if (Test-Path $evPath) { $evObj = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($evPath, [Text.Encoding]::UTF8)); $evCases = @($evObj) }
$evPos = @($evCases | Where-Object { $_.should_trigger -eq $true })
$evNeg = @($evCases | Where-Object { $_.should_trigger -eq $false })
$evIds = @($evCases | ForEach-Object { $_.id })
$evSplits = @($evCases | ForEach-Object { $_.split })
Check (($evCases.Count -ge 20) -and ($evPos.Count -ge 10) -and ($evNeg.Count -ge 10) -and (($evIds | Select-Object -Unique).Count -eq $evCases.Count) -and ($evSplits -contains 'train') -and ($evSplits -contains 'test')) "加载面评估集在位：≥20 条（正 ≥10 / 负 ≥10）、id 唯一、train/test 俱在（实际 $($evCases.Count) 条）"
$trgTxt = [IO.File]::ReadAllText((Join-Path $plg 'test\trigger.test.mjs'), [Text.Encoding]::UTF8)
Check (($trgTxt -match 'should_trigger') -and ($trgTxt -match 'trigger-eval\.json') -and ($trgTxt -match '误命中')) 'trigger 单测断言近失误报 = 0（正样本命中率不得靠送分题刷出来）'
$trgJs = [IO.File]::ReadAllText((Join-Path $plg 'trigger.js'), [Text.Encoding]::UTF8)
Check ($trgJs -match '是什么意思') '触发词表含问答类抑制词（含关键词的术语提问不得误触发：重构是什么意思）'
$lgObj = $null
if (Test-Path (Join-Path $blDir 'ledger.json')) { $lgObj = ([IO.File]::ReadAllText((Join-Path $blDir 'ledger.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json) }
Check (($null -ne $lgObj) -and ($lgObj.schema -match 'ledger') -and ($lgObj.comparability_rule -match '换代') -and ($null -ne $lgObj.entries)) 'baseline 台账 ledger.json 在位（同代可比、换代即新条目、旧条目不覆盖）'
$selfTest = Join-Path $root '_qc\selftest.ps1'
Check (Test-Path $selfTest) '仪器自检 _qc/selftest.ps1 在位（好的必过、坏的必被抓住）'
if (Test-Path $selfTest) {
    $stLines = [IO.File]::ReadAllLines($selfTest, [Text.Encoding]::UTF8)
    $stTxt = $stLines -join "`n"
    Check ($stLines.Count -le 110) "行数 $($stLines.Count) <= 110 ：_qc/selftest.ps1"
    Check (($stTxt -match 'good：') -and ($stTxt -match 'bad：') -and ($stTxt -match 'finally') -and ($stTxt -match 'Compare-Object')) 'selftest.ps1 含 good/bad 参照实现 + finally 复原 + porcelain 前后比对'
}

# —— C 档内化批次 3（卡组 1）：判据可执行、标准不许被悄悄改低 ——
$c24 = [IO.File]::ReadAllText((Join-Path $pb '2-4-非功能需求.md'), [Text.Encoding]::UTF8)
$c24e = [IO.File]::ReadAllText((Join-Path $pen '2-4-non-functional-requirements.md'), [Text.Encoding]::UTF8)
Check (($c24 -match '检查命令') -and ($c24 -match '跑在哪阶段') -and ($c24e -match 'Check command') -and ($c24e -match 'Which stage it runs in')) '2-4 六维表两列齐（检查命令 / 跑在哪阶段；中英同批）'
Check (($c24 -match '有数字没命令 = 愿望') -and ($c24e -match 'A number without a command is a wish')) '2-4 写明「有数字没命令 = 愿望」（每条阈值配产出裁决的命令 + 跑的阶段）'
$c43 = [IO.File]::ReadAllText((Join-Path $pb '4-3-验证.md'), [Text.Encoding]::UTF8)
$c43e = [IO.File]::ReadAllText((Join-Path $pen '4-3-verification.md'), [Text.Encoding]::UTF8)
Check (($c43 -match '外部意见') -and ($c43 -match 'osv-scanner') -and ($c43 -match 'npx axe') -and ($c43e -match 'external opinion') -and ($c43e -match 'non-circular')) '4-3 至少一条外部意见（判据非循环性，agent 争辩不了的工具；中英同批）'
$c42 = [IO.File]::ReadAllText((Join-Path $pb '4-2-代码审查.md'), [Text.Encoding]::UTF8)
$c42e = [IO.File]::ReadAllText((Join-Path $pen '4-2-code-review.md'), [Text.Encoding]::UTF8)
Check (($c42 -match '降标守卫') -and ($c42 -match 'eslint-disable') -and ($c42 -match 'noqa') -and ($c42e -match 'bar-lowering guard') -and ($c42e -match 'ts-ignore')) '4-2 降标守卫五查在位（阈值被挪/测试变简单/检查器被静音/阈值文件同批/工件放宽；中英同批）'
Check (($c42 -match '最多 3 轮') -and ($c42 -match '禁止开第 4 轮') -and ($c42 -match '可行动') -and ($c42e -match 'Bounded re-review loop') -and ($c42e -match 'fourth round')) '4-2 有界复核循环（≤3 轮 + 可行动率连续两轮为 0 即升级；中英同批）'
$glsTxt = [IO.File]::ReadAllText((Join-Path $root 'design\glossary-en.md'), [Text.Encoding]::UTF8)
$glsMissing = @('检查命令','跑在哪阶段','有界复核循环','降标守卫','判据非循环性','外部意见') | Where-Object { $glsTxt -notmatch [regex]::Escape($_) }
Check (-not $glsMissing) "术语表含批次 3 新术语（缺：$($glsMissing -join ', ')）"
$glsMissing5 = @('证据臂污染','审查可行动率','改规则四条件','三臂数字','读数纪律','二分定位','复发次数','最近复发','妥协点收口') | Where-Object { $glsTxt -notmatch [regex]::Escape($_) }
Check (-not $glsMissing5) "术语表含批次 5 新术语（缺：$($glsMissing5 -join ', ')）"

$c01 = [IO.File]::ReadAllText((Join-Path $pb '0-1-驱动卡.md'), [Text.Encoding]::UTF8)
$c01e = [IO.File]::ReadAllText((Join-Path $pen '0-1-driver-card.md'), [Text.Encoding]::UTF8)
$agTxt = [IO.File]::ReadAllText((Join-Path $root 'template\AGENTS.md'), [Text.Encoding]::UTF8)
$glTxt = [IO.File]::ReadAllText((Join-Path $root 'design\glossary-en.md'), [Text.Encoding]::UTF8)
Check (($c01 -match '置信度') -and ($c01e -match 'confidence number')) '0-1 假设必须带置信度数字（写不出置信度 = 没查过的猜想；中英同批）'
Check (($agTxt -match '只有用户消息是指令') -and ($glTxt -match 'only user messages are instructions')) '规则唯一正文含外部内容 = 数据（提示注入防线；中英同批；落点 2026-10-05 搬到 AGENTS.md D5）'
Check (($agTxt -match '75%') -and ($glTxt -match '75%') -and ($agTxt -match '先削') -and ($glTxt -match 'Trim first')) '规则唯一正文含上下文 75% 就开削 + 先削/后保（中英同批；落点搬到 AGENTS.md D8）'
Check (($agTxt -match '不许从上一会话推断批准') -and ($glTxt -match 'Never infer approval from a previous session')) '规则唯一正文含不许从上一会话推断批准（中英同批；落点搬到 AGENTS.md C5）'
$c41 = [IO.File]::ReadAllText((Join-Path $pb '4-1-分批编码.md'), [Text.Encoding]::UTF8)
$c41e = [IO.File]::ReadAllText((Join-Path $pen '4-1-batch-coding.md'), [Text.Encoding]::UTF8)
Check (($c41 -match '七级梯子') -and ($c41e -match 'seven-rung ladder')) '4-1 动作 0 七级梯子（需要存在吗 → 最小实现；中英同批）'
Check (($c41 -match 'ceiling:') -and ($c41 -match 'no-trigger') -and ($c41e -match 'ceiling:') -and ($c41e -match 'no-trigger')) '4-1 妥协点留 ceiling:/upgrade:，无触发条件标 no-trigger（中英同批）'
Check (($c41 -match 'owner') -and ($c41 -match '到期日') -and ($c41e -match 'expiry date')) '4-1 保留理由必须带 owner + 到期日（默认 90 天；中英同批）'
Check (($c41 -match '故意没碰什么') -and ($c41 -match '潜在顾虑') -and ($c41e -match 'deliberately did not touch') -and ($c41e -match 'residual concerns')) '4-1 回执两个固定槽位（故意没碰什么 / 潜在顾虑；中英同批）'
Check (($c41 -match 'Find what is wrong') -and ($c41e -match 'Find what is wrong')) '4-1 派单只给 ARTIFACT + CONTRACT + 对抗式提问模板（中英同批）'
$c72 = [IO.File]::ReadAllText((Join-Path $pb '7-2-依赖升级.md'), [Text.Encoding]::UTF8)
$c72e = [IO.File]::ReadAllText((Join-Path $pen '7-2-dependency-upgrade.md'), [Text.Encoding]::UTF8)
Check (($c72 -match 'STACK DETECTED') -and ($c72e -match 'STACK DETECTED') -and ($c72 -match 'UNVERIFIED') -and ($c72e -match 'UNVERIFIED')) '7-2 前置 STACK DETECTED + 来源纪律 UNVERIFIED（中英同批）'
$skl = [IO.File]::ReadAllText((Join-Path $root 'SKILL.md'), [Text.Encoding]::UTF8)
Check ($skl -match '不许从上一会话推断批准') 'SKILL.md 铁律含「不许从上一会话推断批准」（与 0-1 硬规则 13 同批）'
$glsMissing4 = @('七级梯子','妥协点','无触发条件','置信度数字','外部内容不是指令','不许从上一会话推断批准','故意没碰什么','潜在顾虑','派单两样（产物 + 契约）','对抗式提问','来源纪律') | Where-Object { $glsTxt -notmatch [regex]::Escape($_) }
Check (-not $glsMissing4) "术语表含批次 4 新术语（缺：$($glsMissing4 -join ', ')）"

# —— C 档内化批次 6（卡组 3）：动手删之前先证明它为什么存在；入口只回答"什么时候用" ——
$c78 = [IO.File]::ReadAllText((Join-Path $pb '7-8-项目重构.md'), [Text.Encoding]::UTF8)
$c78e = [IO.File]::ReadAllText((Join-Path $pen '7-8-refactoring.md'), [Text.Encoding]::UTF8)
Check (($c78 -match 'Chesterton') -and ($c78 -match '删除前六问') -and ($c78 -match 'git blame') -and ($c78e -match 'Chesterton') -and ($c78e -match 'Six questions before deleting') -and ($c78e -match 'git blame')) "7-8 删除前六问在位（Chesterton's Fence：职责/谁调用/它调用谁/为何这样写/历史约束/git blame；中英同批）"
$c73 = [IO.File]::ReadAllText((Join-Path $pb '7-3-债与腐化清偿.md'), [Text.Encoding]::UTF8)
$c73e = [IO.File]::ReadAllText((Join-Path $pen '7-3-tech-debt-repayment.md'), [Text.Encoding]::UTF8)
Check (($c73 -match 'Chesterton') -and ($c73 -match 'git blame') -and ($c73e -match 'Chesterton') -and ($c73e -match 'git blame')) '7-3 安全删除前过六问（"看着没用"不是删除理由；中英同批）'
$sklFm = @(); $sklFmEnd = 0
$sklLines = [IO.File]::ReadAllLines((Join-Path $root 'SKILL.md'), [Text.Encoding]::UTF8)
for ($i = 1; $i -lt $sklLines.Count; $i++) { if ($sklLines[$i] -eq '---') { $sklFmEnd = $i; break }; $sklFm += $sklLines[$i] }
$sklKeys = @($sklFm | Where-Object { $_ -match '^[A-Za-z][A-Za-z0-9_-]*\s*:' } | ForEach-Object { ($_ -split ':', 2)[0].Trim() })
Check ($sklFmEnd -gt 0) 'SKILL.md frontmatter 有闭合的 --- 行（宿主靠它识别元信息）'
Check (($sklKeys.Count -eq 2) -and ($sklKeys -contains 'name') -and ($sklKeys -contains 'description')) "SKILL.md frontmatter 只含 name + description（实际：$($sklKeys -join ', ')；宿主只注入这两项，whenToUse / user-invocable 等非标准键一律删）"
$sklDesc = @($sklFm | Where-Object { $_ -match '^description\s*:' }) -join ' '
Check ($sklDesc -match '当.{2,200}时') 'SKILL.md description 写「当…时」触发条件（说什么时候用，不是卡名清单）'
Check ($sklDesc -match 'Use when') 'SKILL.md description 含 Use when 触发面（英文路由同样可判）'
Check ($sklDesc -match 'Do not use') 'SKILL.md description 有明确的"不该触发"近失误负例（near-miss）'
Check ($sklDesc -notmatch '(?:[^、\s]{1,20}、){7,}') 'SKILL.md description 无 ≥8 个顿号连排的卡名罗列（触发靠语义，不靠名词堆）'
Check (($skl -match '渐进披露') -and ($skl -match 'metadata') -and ($skl -match '<500 行')) 'SKILL.md 写明渐进披露三级（metadata 常驻 / 正文触发时载入且 <500 行 / 资源按需）'
$pbc = [IO.File]::ReadAllText((Join-Path $root 'design\playbook-contract.md'), [Text.Encoding]::UTF8)
Check (($pbc -match '渐进披露三级') -and ($pbc -match '不许删判据腾地方')) '契约 §2 写明渐进披露三级 + 超限唯一合法处置（加一层给指针，不许删判据腾地方）'
Check (($blRd -match 'rank-1') -and ($blRd -match '95')) 'baseline README 写明路由 rank-1 命中率阈值 95%（只升不降；降阈值按 4-2 降标守卫处理）'
Check (Test-Path (Join-Path $root '_qc/internalize-2026-10-04-c-tier.md')) '内化记录 _qc/internalize-2026-10-04-c-tier.md 在位（C 档四来源 → 六批落点 + 明确不拿清单）'
$cTier = ''
$cTierPath = Join-Path $root '_qc/internalize-2026-10-04-c-tier.md'
if (Test-Path $cTierPath) { $cTier = [IO.File]::ReadAllText($cTierPath, [Text.Encoding]::UTF8) }
Check (($cTier -match '批次 1') -and ($cTier -match '批次 6') -and ($cTier -match '不拿')) 'C 档内化记录含六批落点与「明确不拿」清单（可审计：每条给落点文件或否决理由）'
$glsMissing6 = @('切斯特顿栅栏','渐进披露','常设 DoD','单任务验收','字面近似层','rank-1') | Where-Object { $glsTxt -notmatch [regex]::Escape($_) }
Check (-not $glsMissing6) "术语表含批次 6 新术语（缺：$($glsMissing6 -join ', ')）"
Check (Test-Path (Join-Path $root '_qc/internalize-2026-10-04-uiux.md')) '内化记录 _qc/internalize-2026-10-04-uiux.md 在位（UI/UX 设计流程增强四来源 → 六批落点 + 明确不拿清单）'
$uiux = ''
$uiuxPath = Join-Path $root '_qc/internalize-2026-10-04-uiux.md'
if (Test-Path $uiuxPath) { $uiux = [IO.File]::ReadAllText($uiuxPath, [Text.Encoding]::UTF8) }
Check (($uiux -match '批次 1') -and (($uiux -match '批次 6') -or ($uiux -match '批次 4')) -and ($uiux -match '不拿')) 'UI/UX 增强记录含分批落点与「明确不拿」清单（可审计：每条给源路径或否决理由）'

# —— 零成本字面近似层（T1）：两张卡的"什么时候用"撞车 = 路由必指错卡。纯字符串，零 token ——
function Get-BigramDice([string]$a, [string]$b) {
    $na = ($a -replace '\s', ''); $nb = ($b -replace '\s', '')
    if ($na.Length -lt 2 -or $nb.Length -lt 2) { return 0.0 }
    $ga = @{}; for ($i = 0; $i -lt $na.Length - 1; $i++) { $k = $na.Substring($i, 2); $ga[$k] = 1 + $ga[$k] }
    $gb = @{}; for ($i = 0; $i -lt $nb.Length - 1; $i++) { $k = $nb.Substring($i, 2); $gb[$k] = 1 + $gb[$k] }
    $inter = 0; foreach ($k in $ga.Keys) { if ($gb.ContainsKey($k)) { $inter += [Math]::Min($ga[$k], $gb[$k]) } }
    return (2.0 * $inter) / (($na.Length - 1) + ($nb.Length - 1))
}
$descList = @()
foreach ($f in (Get-ChildItem $pb -File -Filter '*.md' | Sort-Object Name)) {
    $ls = [IO.File]::ReadAllLines($f.FullName, [Text.Encoding]::UTF8)
    $h1 = @($ls | Where-Object { $_ -match '^# ' })[0]
    $trg = @($ls | Where-Object { $_ -match '^>\s*触发' })[0]
    $descList += [pscustomobject]@{ Name = $f.BaseName; Text = (($h1 -replace '^#\s*卡\s*', '') + ' ' + ($trg -replace '^>\s*触发[:：]?', '')) }
}
$dupErr = @(); $dupWarn = @()
for ($i = 0; $i -lt $descList.Count; $i++) {
    for ($j = $i + 1; $j -lt $descList.Count; $j++) {
        $s = Get-BigramDice $descList[$i].Text $descList[$j].Text
        if ($s -ge 0.75) { $dupErr += "$($descList[$i].Name)~$($descList[$j].Name)=$([Math]::Round($s, 2))" }
        elseif ($s -ge 0.50) { $dupWarn += "$($descList[$i].Name)~$($descList[$j].Name)=$([Math]::Round($s, 2))" }
    }
}
Check (-not $dupErr) "零成本字面近似层：任意两张卡的「什么时候用」字面碰撞 < 75%（>=75% 即路由必指错卡：$($dupErr -join ', ')）"
Observe ($dupWarn.Count -eq 0) "本轮观测项（不拦红）：字面近似 50%~75% 的卡对 $($dupWarn.Count) 组 $($dupWarn -join ', ')"

Write-Host "== 7. 脚本可执行性与口径统一 =="
$ps1s = @('_qc\check.ps1','_qc\selftest.ps1','_qc/baseline/run.ps1','template\check.ps1','template\doctor.ps1','template\gate.ps1','template\orphans.ps1','template\security.ps1')
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
$fenceScan = @()
foreach ($f in $scanUni) {
    if (-not (Test-Path $f)) { continue }
    $inFence = $false
    foreach ($ln in [IO.File]::ReadAllLines($f, [Text.Encoding]::UTF8)) {
        if ($ln -match '^\s*```') { $inFence = -not $inFence; continue }
        if ($inFence) { $fenceScan += [pscustomobject]@{ File = (Split-Path $f -Leaf); Line = $ln.Trim() } }
    }
}
$badVar = @($fenceScan | Where-Object { $_.Line -match '\$[^\x00-\x7F]' })
Check (-not $badVar) "命令代码块内无中文变量名（PS 5.1 无 BOM 会 ParserError：$(($badVar | ForEach-Object { "$($_.File):$($_.Line)" }) -join ' | ')）"
# 盘符判定必须要求「单个字母 + 冒号 + 反斜杠」出现在记号开头（前一字符不是字母/数字/下划线）：
# 旧写法 [A-Za-z]:\\ 会把 PowerShell 正则串当路径——例 'height:\s*100vh' 里的 t:\s 命中，属假红（2026-10-04 实测）。
$badSlash = @($fenceScan | Where-Object { $_.Line -match '(?<![A-Za-z0-9_])[A-Za-z]:\\' })
Check (-not $badSlash) "命令代码块内无盘符反斜杠路径（契约 §2② 要求正斜杠：$(($badSlash | ForEach-Object { "$($_.File):$($_.Line)" }) -join ' | ')）"
$uiTpl = Join-Path $tpl 'docs\UI.md'
if (Test-Path $uiTpl) {
    $uiTxt = [IO.File]::ReadAllText($uiTpl, [Text.Encoding]::UTF8)
    $uiMiss = @('S1','S2','S3','S4','S5','S6','S7','S8','32','40','48','640','1024') | Where-Object { $uiTxt -notmatch [regex]::Escape($_) }
    Check (-not $uiMiss) "template/docs/UI.md 直接照抄即过 3-4 卡自查（缺 token：$($uiMiss -join ',')）"
}
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeExe) {
    Write-Host "  [--] 未装 node，跳过插件离线单测"
} else {
    # 跑整个套件（glob），**不逐个文件点名**：点名清单一定会漏掉新加的文件 ——
    # banner.test.mjs 就是这么漏的（CI 跑得到、本地门禁跑不到，于是本地全绿也不算数）。
    $suites = @(
        @{ Glob = ((Join-Path $root 'test') -replace '\\', '/') + '/*.test.mjs'; Label = '仓库自测全绿（node --test "test/*.test.mjs"）' },
        @{ Glob = ((Join-Path $plg 'test') -replace '\\', '/') + '/*.test.mjs'; Label = '插件离线单测全绿（node --test "plugin/roadbook-autoload/test/*.test.mjs"）' },
        @{ Glob = ((Join-Path $root 'plugin\roadbook-evolve\test') -replace '\\', '/') + '/*.test.mjs'; Label = '自进化插件离线单测全绿（node --test "plugin/roadbook-evolve/test/*.test.mjs"）' }
    )
    foreach ($suite in $suites) {
        $out = & node --test $suite.Glob 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0) {
            # 红了必须看得见是哪几条：只报「失败」等于把证据丢掉
            $tail = @($out | Select-Object -Last 15)
            foreach ($line in $tail) { Write-Host "    $line" -ForegroundColor DarkYellow }
        }
        Check ($code -eq 0) $suite.Label
    }
}

Write-Host "== 8. 结论 =="
Write-Host "通过 $pass 项；失败 $($fail.Count) 项"
if ($obs.Count -gt 0) { Write-Host "观测项（不拦红）：$($obs.Count) 条，见上文 [obs] OVER" -ForegroundColor DarkYellow }
if ($fail.Count -gt 0) { $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }; exit 1 }
Write-Host "Roadbook（路书）V6 母版完整性校验：全部通过" -ForegroundColor Green
exit 0
