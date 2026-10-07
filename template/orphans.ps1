# orphans.ps1 · 孤儿、幽灵与文档七查（只报不拦；清单不完整时退出码非 0）
# 用途：删除腐化治理 + 文档生命周期的对照清单——源码没人引用 / 导出没人调用 / 文档写的路径不存在 /
#   源码没进文档 / 组件没登记 / **文档没进对应表** / **该归档的文档**。
# 用法：在项目根执行 powershell -NoProfile -File orphans.ps1
# 为什么只报不拦：判据是正则启发式（必然有误报），而"删哪个"属于人的裁决（AGENTS.md §4 不可委托清单）；
#   门禁是 check.ps1 的职责，本脚本只出清单。
# 退出码：0=七张清单已产出且文件清单完整；1=有未跟踪文件（清单隐形，先 git add）或有文件读取/解析失败（计数不可信 = 仪器故障）。
#   七张清单本身只报不拦（判据是正则启发式，删哪个属于人的裁决），但"清单不完整"必须是红的——否则新文件能一直隐形。
# 口径（全脚本统一，不因清单不同而变）：
#   文件清单 = git -c core.quotepath=false ls-files -z（中文/特殊字符名不再被转义成八进制串）
#     ∪ 同一命令 --others --exclude-standard（未跟踪文件，否则新文件在清单里全部隐形）
#     ∪ 无 git 时的目录遍历兜底（显式跳过 ReparsePoint 目录，不穿透 junction）。
#   匹配一律**大小写不敏感**（[regex] 侧用 (?i) 前缀，-inotmatch 侧本就忽略大小写），按 ASCII 词边界避免被中文粘连吞掉。
#   排除 .git/ node_modules/ _archive/ docs/ 与五个守护脚本自身；"文件数"= 排除后纳入扫描的文件数。
#   孤儿=源码文件没被其他任何文本文件按文件名提及；零引用导出=导出名在源码全文只出现一次（即只有定义）。
#   文档幽灵=文档**反引号里带目录分隔符的路径**磁盘不存在（.env/node_modules/dist/build 这类不进仓库的路径不算）。
#     为什么要求带分隔符（2026-10-07 修 TD-002 的第一刀）：`RCA.md` / `THREAT.md` / `route.mjs` 这类**裸文件名**
#     是"产物名/工具的泛指"，不是"这个文件此刻在哪"；把它们当引用会让每一次正常引用都变成幽灵
#     （实测 21 项里绝大多数是这么来的），真幽灵因此被淹掉。带分隔符的才是"我指着某个具体位置"。
#     代价（明说）：真正的"写了 docs/x.md 但文件不在"仍会被报出（本仓实测 `docs/TOOLING.md` 就是一条真的），漏报面是"裸文件名写错"。
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
$docTxt = ''
foreach ($p in @('AGENTS.md','STATE.md','README.md')) { $fp = Join-Path $root $p; if (Test-Path -LiteralPath $fp) { $docTxt += [IO.File]::ReadAllText($fp, [Text.Encoding]::UTF8) + "`n" } }
$dc = Join-Path $root 'docs'
if (Test-Path -LiteralPath $dc) { foreach ($f in @(Get-ChildItem -LiteralPath $dc -Recurse -Filter *.md -File -Force -ErrorAction SilentlyContinue)) { $docTxt += [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) + "`n" } }
$regPath = Join-Path $root 'docs\registry\COMPONENTS.md'; $regTxt = ''
if (Test-Path -LiteralPath $regPath) { $regTxt = [IO.File]::ReadAllText($regPath, [Text.Encoding]::UTF8) }
$txt = @{}; $blob = New-Object System.Text.StringBuilder
foreach ($f in @($rel | Where-Object { $txtExt -contains [IO.Path]::GetExtension($_).ToLower() })) {
    $t = ''
    try { $t = [IO.File]::ReadAllText((Join-Path $root ($f -replace '/', $sep)), [Text.Encoding]::UTF8) } catch { $bad += "$f（读取失败：$($_.Exception.Message)）" }
    $txt[$f] = $t; [void]$blob.AppendLine($t)
}
$srcBlob = ''; foreach ($f in $src) { $srcBlob += $txt[$f] + "`n" }
$allTxt = $blob.ToString() + "`n" + $docTxt
$ghost = @{}
foreach ($m in [regex]::Matches($docTxt, '[^/]`([A-Za-z0-9_\-./\\]*[/\\][A-Za-z0-9_\-./\\]+\.[a-z][a-z0-9]{0,7})`')) { $p = $m.Groups[1].Value.Replace('\','/') -replace '^\./',''; if ($p -notmatch '^(\.env|node_modules|dist|build|\.git)(/|$)' -and -not (Test-Path -LiteralPath (Join-Path $root ($p -replace '/', $sep)))) { $ghost[$p] = 1 } }
$freq = @{}
foreach ($m in [regex]::Matches($srcBlob, '[A-Za-z_$][A-Za-z0-9_$]*')) { $k = $m.Value; $freq[$k] = 1 + $freq[$k] }
$rxExp = [regex]'(?m)^\s*(?:export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)|def|function|func\s+(?:\([^)]*\)\s*)?|pub\s+fn|public\s+(?:static\s+|sealed\s+|abstract\s+)*(?:class|interface|enum|void|[A-Z]\w*))\s+([A-Za-z_$][\w$-]*)'
$orphan = @(); $zero = @(); $rev = @(); $unreg = @()
foreach ($f in $src) {
    $b = [IO.Path]::GetFileNameWithoutExtension($f)
    if ($b.Length -ge 3 -and ([regex]::Matches($allTxt, $ci + $bd + [regex]::Escape($b) + $be)).Count - ([regex]::Matches($txt[$f], $ci + $bd + [regex]::Escape($b) + $be)).Count -le 0) { $orphan += $f }
    if ($docTxt -inotmatch [regex]::Escape($b)) { $rev += $f }
    if ($regTxt -inotmatch [regex]::Escape($b)) { $unreg += $f }
    foreach ($m in $rxExp.Matches($txt[$f])) { $n = $m.Groups[1].Value; if ($null -eq $freq[$n]) { $freq[$n] = ([regex]::Matches($srcBlob, $ci + $bd + [regex]::Escape($n) + $be)).Count }; if ($freq[$n] -le 1) { $zero += "$f : $n" } }
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
foreach ($x in $ghost.Keys) { Write-Host "[文档幽灵] $x" }
foreach ($x in $rev) { Write-Host "[反向幽灵] $x" }
foreach ($x in $unreg) { Write-Host "[未登记] $x" }
foreach ($x in $undoc) { Write-Host "[未登记文档] $x" }
foreach ($x in $arcCand) { Write-Host "[归档候选] $x" }
foreach ($x in $bad) { Write-Host "[读取失败] $x" -ForegroundColor Red }
if ($untracked.Count -gt 0) { Write-Host ("[FAIL] 未跟踪 {0} 个文件：七张清单不完整（先 git add 再复跑）" -f $untracked.Count) -ForegroundColor Red }
Write-Host ("孤儿 {0} 项｜零引用导出 {1} 项｜文档幽灵 {2} 项｜反向幽灵 {3} 项｜未登记 {4} 项｜未登记文档 {5} 项｜归档候选 {6} 项｜未跟踪 {7} 项｜读取失败 {8} 项｜文件数 {9}" -f $orphan.Count, $zero.Count, $ghost.Count, $rev.Count, $unreg.Count, $undoc.Count, $arcCand.Count, $untracked.Count, $bad.Count, $rel.Count)
if ($bad.Count -gt 0 -or $untracked.Count -gt 0) { Write-Host "[FAIL] 清单不完整（未跟踪文件或读取/解析失败）：计数不可信，先修仪器/先 git add 再解读" -ForegroundColor Red; exit 1 }
exit 0
