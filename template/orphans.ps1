# orphans.ps1 · 孤儿、幽灵与文档七查（只报不拦；清单不完整时退出码非 0）
# 用途：删除腐化治理 + 文档生命周期的对照清单——源码没人引用 / 导出没人调用 / 文档写的路径不存在 /
#   源码没进文档 / 组件没登记 / **文档没进对应表** / **该归档的文档**。
# 用法：在项目根执行 powershell -NoProfile -File orphans.ps1
# 为什么只报不拦：判据是正则启发式（必然有误报），而"删哪个"属于人的裁决（AGENTS.md §4 不可委托清单）；门禁是 check.ps1 的职责。
# 退出码：0=七张清单已产出且文件清单完整；1=有未跟踪文件（清单隐形，先 git add）或有文件读取/解析失败（计数不可信 = 仪器故障）。
#   七张清单本身只报不拦，但"清单不完整"必须是红的——否则新文件能一直隐形。
# 口径（全脚本统一，不因清单不同而变）：
#   文件清单 = git -c core.quotepath=false ls-files -z（中文/特殊字符名不再被转义成八进制串）
#     ∪ --others --exclude-standard（未跟踪文件，否则新文件在清单里全部隐形）∪ 无 git 时的目录遍历兜底（跳过 ReparsePoint 目录，不穿透 junction）。
#   匹配一律**大小写不敏感**（[regex] 侧用 (?i) 前缀，-inotmatch 侧本就忽略大小写），按 ASCII 词边界避免被中文粘连吞掉。
#   排除 .git/ node_modules/ _archive/ docs/ 与五个守护脚本自身；"文件数"= 排除后纳入扫描的文件数。
#   孤儿=源码文件没被其他任何文本文件按文件名提及；零引用导出=导出名在源码全文只出现一次（即只有定义）。
#   文档幽灵=文档**反引号里带目录分隔符的路径**磁盘不存在（.env/node_modules/dist/build 这类不进仓库的路径不算）。
#     为什么要求带分隔符（2026-10-07 修 TD-002 的第一刀）：`RCA.md` / `THREAT.md` / `route.mjs` 这类**裸文件名**
#     是"产物名/工具的泛指"，不是"这个文件此刻在哪"；把它们当引用会让每一次正常引用都变成幽灵
#     （实测 21 项里绝大多数是这么来的），真幽灵因此被淹掉。带分隔符的才是"我指着某个具体位置"。
#     代价（明说）：真正的"写了 docs/x.md 但文件不在"仍会被报出（本仓实测 `docs/TOOLING.md` 就是一条真的），漏报面是"裸文件名写错"。
#   **第二刀（2026-10-07 · TD-002 逐项定性）**：幽灵口径 = **四类机械跳过**（① 以 `/` 或盘符开头 = 虚拟路径/宿主绝对路径 ② 含 `X.Y.Z`/`<`/`*`/`YYYY` = 占位符或模式 ④ 该处前后 60 字符内有非现在时标记词〈拆/删/待建/待填/待补/待做/待定/待实现/未建/未实现/未落地/尚未/还没/规划/计划/排期/后续/下一批/下一版/弃用/废弃〉= 历史或规划——**词表就是上面这一处**（不在别处复制）：TD-025 实测旧表只有 7 个词，一句明确写了「排期」的话被报了幽灵，而误报的代价是反过来训练人改文案去迁就工具（当天就是这么绕过去的）；汇总行按词打印各跳过几处（跳过不静默：收错词一眼看得出） ⑤ 首段目录不在磁盘 = 别的布局〈模板项目的 `src/`、外部包内相对路径〉）+ **文档面收窄到当前态文档**（根四份 + `docs/` 根说明文档 + `docs/registry/` + `docs/pool/`；`CHANGELOG.md` 与 `docs/{specs,versions,reviews,decisions,lessons,archive}/` 是时点记录，拿当前磁盘状态判它 = 要求改写历史，D12 禁）；零引用导出的**引用面加入数据文件**（TD-003）。**逐项定性、每条规则的理由与代价写在 `docs/TECH_DEBT.md` 的 TD-002 / TD-003 行**（含两条实测：整行口径下 113 处提及里 104 处被豁免 = 判据近乎空转；`_qc/selftest-cases.json` 托管的调用点被漏数 3 条）—— 本文件只留机制，不复制散文。
#   反向幽灵=源码文件没被任何文档提到；未登记=不在 docs/registry/COMPONENTS.md。
#   **未登记文档**=docs/ 固定槽位（docs 根 + registry/ + pool/）里没进 docs/README.md 对应表的文件
#     ——docs/ 此前是整体排除目录，原有五张清单里没有一张能发现"没人登记的文档"。
#   **归档候选**=留存目录里"多久没动"有读数的那些：单位取**归档真正搬的东西**（docs/specs 下的任务目录；
#     decisions/lessons/reviews 下的单文件），判据=最后提交日早于阈值（specs 30 天 / 其余 90 天）
#     **且**没有别的文件提到它（反向幽灵）。种子教训卡（作用域=全局）豁免，不参与淘汰。
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$skipDir = '(^|/)(\.git|node_modules|_archive|docs)/'
$skipFile = @('check.ps1','doctor.ps1','gate.ps1','orphans.ps1','security.ps1')
$srcExt = @('.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.ps1','.go','.rs','.cs','.java','.vue','.sql','.sh')
$txtExt = $srcExt + @('.md','.json','.yml','.yaml','.toml','.txt','.html','.css','.scss','.xml','.ini','.cfg')
$bd = '(?<![A-Za-z0-9_])'; $be = '(?![A-Za-z0-9_])'; $ci = '(?i)'
$sep = [IO.Path]::DirectorySeparatorChar
$tracked = @(); $untracked = @()
if (Get-Command git -ErrorAction SilentlyContinue) {
    $tracked = @(((git -c core.quotepath=false ls-files -z 2>$null) -join '') -split "`0" | Where-Object { $_ })
    $untracked = @(((git -c core.quotepath=false ls-files --others --exclude-standard -z 2>$null) -join '') -split "`0" | Where-Object { $_ })
}
$fs = @($tracked + $untracked)
if ($fs.Count -eq 0) {
    $fs = @(); $q = New-Object System.Collections.Queue; $q.Enqueue($root)
    while ($q.Count -gt 0) {
        $d = $q.Dequeue()
        foreach ($f in [IO.Directory]::GetFiles($d)) { $fs += $f.Substring($root.Length).TrimStart('\','/').Replace('\','/') }
        foreach ($s in [IO.Directory]::GetDirectories($d)) { if (((Get-Item -LiteralPath $s -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { $q.Enqueue($s) } }
    }
}
$bad = @(); $rel = @()
foreach ($f0 in $fs) {
    try {
        $f = ([string]$f0).Replace('\','/')
        if ($f -eq '' -or $f -match $skipDir -or $skipFile -contains [IO.Path]::GetFileName($f)) { continue }
        $rel += $f
    } catch { $bad += "$f0（解析失败：$($_.Exception.Message)）" }
}
# docs/ 是前五张清单的扫描排除目录，但**两张文档清单**要单独收一份它的文件（见末尾 ⑯⑰）
$docAll = @($fs | ForEach-Object { ([string]$_).Replace('\','/') } | Where-Object { $_ -match '^docs/' })
$src = @($rel | Where-Object { $srcExt -contains [IO.Path]::GetExtension($_).ToLower() })
$docTxt = ''; $ghostTxt = ''
foreach ($p in @('AGENTS.md','STATE.md','README.md','RISK.md')) { $fp = Join-Path $root $p; if (Test-Path -LiteralPath $fp) { $t2 = [IO.File]::ReadAllText($fp, [Text.Encoding]::UTF8) + "`n"; $ghostTxt += $t2; if ($p -ne 'RISK.md') { $docTxt += $t2 } } }
$dc = Join-Path $root 'docs'
if (Test-Path -LiteralPath $dc) { foreach ($f in @(Get-ChildItem -LiteralPath $dc -Recurse -Filter *.md -File -Force -ErrorAction SilentlyContinue)) { $t2 = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) + "`n"; $docTxt += $t2; if ($f.FullName.Substring($dc.Length).TrimStart('\','/').Replace('\','/') -notmatch '^(specs|versions|reviews|decisions|lessons|archive)/') { $ghostTxt += $t2 } } }
$regPath = Join-Path $root 'docs\registry\COMPONENTS.md'; $regTxt = ''
if (Test-Path -LiteralPath $regPath) { $regTxt = [IO.File]::ReadAllText($regPath, [Text.Encoding]::UTF8) }
$txt = @{}; $blob = New-Object System.Text.StringBuilder
foreach ($f in @($rel | Where-Object { $txtExt -contains [IO.Path]::GetExtension($_).ToLower() })) {
    $t = ''
    try { $t = [IO.File]::ReadAllText((Join-Path $root ($f -replace '/', $sep)), [Text.Encoding]::UTF8) } catch { $bad += "$f（读取失败：$($_.Exception.Message)）" }
    $txt[$f] = $t; [void]$blob.AppendLine($t)
}
$dataExt = @('.json','.yml','.yaml','.toml','.ini','.cfg'); $refBlob = ''; foreach ($f in @($src) + @($rel | Where-Object { $dataExt -contains [IO.Path]::GetExtension($_).ToLower() })) { $refBlob += $txt[$f] + "`n" }   # 引用面 = 源码 ∪ 数据文件（本仓惯例「数据与引擎分家」，调用点住在 .json 里 —— TD-003）
$allTxt = $blob.ToString() + "`n" + $docTxt
$ghost = @{}; $gj = @{ route = 0; ph = 0; hist = 0; alien = 0 }; $gjMark = @{}; $ghostMark = '(拆|删|待建|待填|待补|待做|待定|待实现|未建|未实现|未落地|尚未|还没|规划|计划|排期|后续|下一批|下一版|弃用|废弃)'; $ghostRx = '[^/]`([A-Za-z0-9_\-./\\]*[/\\][A-Za-z0-9_\-./\\]+\.[a-z][a-z0-9]{0,7})`'
foreach ($m in [regex]::Matches($ghostTxt, $ghostRx)) { $p = $m.Groups[1].Value.Replace('\','/') -replace '^\./',''; if ($p -match '^(\.env|node_modules|dist|build|\.git)(/|$)') { continue }; $ws = [Math]::Max(0, $m.Index - 60); $w = $ghostTxt.Substring($ws, [Math]::Min($ghostTxt.Length, $m.Index + $m.Length + 60) - $ws); if ($p -match '^(/|[A-Za-z]:)') { $gj.route++; continue }; if ($p -match 'X\.Y\.Z|<|>|\*|\bYYYY\b') { $gj.ph++; continue }; if ($w -match $ghostMark) { $gj.hist++; $mk = $Matches[1]; $gjMark[$mk] = 1 + [int]$gjMark[$mk]; continue }; if (-not (Test-Path -LiteralPath (Join-Path $root (($p -split '/')[0])))) { $gj.alien++; continue }; if (-not (Test-Path -LiteralPath (Join-Path $root ($p -replace '/', $sep)))) { $ghost[$p] = 1 } }
$freq = @{}
foreach ($m in [regex]::Matches($refBlob, '[A-Za-z_$][A-Za-z0-9_$]*')) { $k = $m.Value; $freq[$k] = 1 + $freq[$k] }
$rxExp = [regex]'(?m)^\s*(?:export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)|def|function|func\s+(?:\([^)]*\)\s*)?|pub\s+fn|public\s+(?:static\s+|sealed\s+|abstract\s+)*(?:class|interface|enum|void|[A-Z]\w*))\s+([A-Za-z_$][\w$-]*)'
$orphan = @(); $zero = @(); $ven = @(); $rev = @(); $unreg = @()
foreach ($f in $src) {
    $b = [IO.Path]::GetFileNameWithoutExtension($f)
    if ($b.Length -ge 3 -and ([regex]::Matches($allTxt, $ci + $bd + [regex]::Escape($b) + $be)).Count - ([regex]::Matches($txt[$f], $ci + $bd + [regex]::Escape($b) + $be)).Count -le 0) { $orphan += $f }
    if ($docTxt -inotmatch [regex]::Escape($b)) { $rev += $f }
    if ($regTxt -inotmatch [regex]::Escape($b)) { $unreg += $f }
    # vendor/ 是上游契约的逐字副本（ensureVendor() 生成并校验）：导出面按上游保留，"本仓没人 import"不是删除理由 ⇒ 单列一类
    foreach ($m in $rxExp.Matches($txt[$f])) { $n = $m.Groups[1].Value; if ($null -eq $freq[$n]) { $freq[$n] = ([regex]::Matches($refBlob, $ci + $bd + [regex]::Escape($n) + $be)).Count }; if ($freq[$n] -le 1) { if ($f -match '^skills/roadbook-atlas/vendor/') { $ven += "$f : $n" } else { $zero += "$f : $n" } } }
}
# ── ⑯ 未登记文档：docs/ 固定槽位里没进 docs/README.md 对应表的文件 ──────────────────
# 只扫**固定槽位**（docs 根 + registry/ + pool/）；specs/reviews/versions/lessons/decisions/archive
# 是按任务生成的，天然不在对应表里——不划这条界，清单立刻变噪音，比没有更坏。
$drmTxt = ''
$drmP = Join-Path $root 'docs/README.md'
if (Test-Path -LiteralPath $drmP) { $drmTxt = [IO.File]::ReadAllText($drmP, [Text.Encoding]::UTF8) }
$undoc = @()
if ($drmTxt -ne '') {
    $undoc = @($docAll | Where-Object { $_ -match '^docs/([^/]+\.md|(registry|pool)/[^/]+\.md)$' } | Where-Object { $drmTxt -notmatch [regex]::Escape([IO.Path]::GetFileName($_)) })
}
# ── ⑰ 归档候选：留存目录里"多久没动"的读数（单位 = 归档真正搬的东西）────────────────
# 为什么单位是"任务目录"而不是"文件"：docs/specs 下每个任务目录里都有 RESEARCH/SCOPE 这类**通用名**，
# 按文件名做反向幽灵会恒真（对应表里就写着这些名字），永远出不了候选。
$arcCand = @()
$now = Get-Date
$specD = Join-Path $root 'docs/specs'
if (Test-Path -LiteralPath $specD) {
    foreach ($d in @(Get-ChildItem -LiteralPath $specD -Directory -ErrorAction SilentlyContinue)) {
        $rel2 = "docs/specs/$($d.Name)"
        $last = [string]((git -C $root log -1 --format=%cs -- $rel2 2>$null) -join '')
        if ($last -match '^\d{4}-\d{2}-\d{2}$' -and ([datetime]$last) -lt $now.AddDays(-30)) { $arcCand += "$rel2（最后改动 $last，>30 天）" }
    }
}
foreach ($sub in @('decisions', 'lessons', 'reviews')) {
    $sd = Join-Path $root "docs/$sub"
    if (-not (Test-Path -LiteralPath $sd)) { continue }
    foreach ($f in @(Get-ChildItem -LiteralPath $sd -File -Filter *.md -ErrorAction SilentlyContinue)) {
        $rel2 = "docs/$sub/$($f.Name)"; $b = [IO.Path]::GetFileNameWithoutExtension($f.Name)
        if ($b.Length -lt 3) { continue }
        $ftxt = ''
        try { $ftxt = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) } catch { }
        if ($ftxt -match '作用域\s*[:：]\s*全局') { continue }      # 种子教训卡豁免（跨项目种子不参与淘汰）
        if ($allTxt -imatch [regex]::Escape($b)) { continue }      # 还有别的文件提到它 = 不是哑档案
        $last = [string]((git -C $root log -1 --format=%cs -- $rel2 2>$null) -join '')
        if ($last -match '^\d{4}-\d{2}-\d{2}$' -and ([datetime]$last) -lt $now.AddDays(-90)) { $arcCand += "$rel2（最后改动 $last，>90 天且无人引用）" }
    }
}
foreach ($x in $orphan) { Write-Host "[孤儿] $x" }
foreach ($x in $zero) { Write-Host "[零引用导出] $x" }
foreach ($x in $ven) { Write-Host "[零引用导出·豁免] $x（vendor 上游件：导出面按上游契约保留，不由本仓 import 决定）" }
foreach ($x in $ghost.Keys) { Write-Host "[文档幽灵] $x" }
foreach ($x in $rev) { Write-Host "[反向幽灵] $x" }
foreach ($x in $unreg) { Write-Host "[未登记] $x" }
foreach ($x in $undoc) { Write-Host "[未登记文档] $x" }
foreach ($x in $arcCand) { Write-Host "[归档候选] $x" }
foreach ($x in $bad) { Write-Host "[读取失败] $x" -ForegroundColor Red }
if ($untracked.Count -gt 0) { Write-Host ("[FAIL] 未跟踪 {0} 个文件：七张清单不完整（先 git add 再复跑）" -f $untracked.Count) -ForegroundColor Red }
$gjSum = ($gj.Values | Measure-Object -Sum).Sum
if ($gjSum -gt 0) { $markTxt = ((@($gjMark.GetEnumerator()) | Sort-Object Value, Key -Descending | ForEach-Object { "$($_.Key)×$($_.Value)" }) -join '｜'); Write-Host ("[跳过] 虚拟或宿主路径 {0} 处｜占位符 {1} 处｜历史或规划行 {2} 处（{4}）｜外部布局（首段目录不在磁盘） {3} 处" -f $gj.route, $gj.ph, $gj.hist, $gj.alien, $markTxt) }
Write-Host ("孤儿 {0} 项｜零引用导出 {1} 项（另豁免 {2} 项）｜文档幽灵 {3} 项（另跳过 {4} 处）｜反向幽灵 {5} 项｜未登记 {6} 项｜未登记文档 {7} 项｜归档候选 {8} 项｜未跟踪 {9} 项｜读取失败 {10} 项｜文件数 {11}" -f $orphan.Count, $zero.Count, $ven.Count, $ghost.Count, $gjSum, $rev.Count, $unreg.Count, $undoc.Count, $arcCand.Count, $untracked.Count, $bad.Count, $rel.Count)
if ($bad.Count -gt 0 -or $untracked.Count -gt 0) { Write-Host "[FAIL] 清单不完整（未跟踪文件或读取/解析失败）：计数不可信，先修仪器/先 git add 再解读" -ForegroundColor Red; exit 1 }
exit 0
