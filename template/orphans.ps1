# orphans.ps1 · 孤儿与幽灵五查（只报不拦；清单不完整时退出码非 0）
# 用途：删除腐化治理的对照清单——源码没人引用 / 导出没人调用 / 文档写的路径不存在 / 源码没进文档 / 组件没登记。
# 用法：在项目根执行 powershell -NoProfile -File orphans.ps1
# 为什么只报不拦：判据是正则启发式（必然有误报），而"删哪个"属于人的裁决（AGENTS.md §4 不可委托清单）；
#   门禁是 check.ps1 的职责，本脚本只出五张清单。
# 退出码：0=五张清单已产出且文件清单完整；1=有未跟踪文件（清单隐形，先 git add）或有文件读取/解析失败（计数不可信 = 仪器故障）。
#   五张清单本身只报不拦（判据是正则启发式，删哪个属于人的裁决），但"清单不完整"必须是红的——否则新文件能一直隐形。
# 口径（全脚本统一，不因清单不同而变）：
#   文件清单 = git -c core.quotepath=false ls-files -z（中文/特殊字符名不再被转义成八进制串）
#     ∪ 同一命令 --others --exclude-standard（未跟踪文件，否则新文件在五张清单里全部隐形）
#     ∪ 无 git 时的目录遍历兜底（显式跳过 ReparsePoint 目录，不穿透 junction）。
#   匹配一律**大小写不敏感**（[regex] 侧用 (?i) 前缀，-inotmatch 侧本就忽略大小写），按 ASCII 词边界避免被中文粘连吞掉。
#   排除 .git/ node_modules/ _archive/ docs/ 与四个守护脚本自身；"文件数"= 排除后纳入扫描的文件数。
#   孤儿=源码文件没被其他任何文本文件按文件名提及；零引用导出=导出名在源码全文只出现一次（即只有定义）。
#   文档幽灵=文档反引号路径磁盘不存在（.env/node_modules/dist/build 这类不进仓库的路径不算）。
#   反向幽灵=源码文件没被任何文档提到；未登记=不在 docs/registry/COMPONENTS.md。
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$skipDir = '(^|/)(\.git|node_modules|_archive|docs)/'
$skipFile = @('check.ps1','doctor.ps1','gate.ps1','orphans.ps1')
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
foreach ($m in [regex]::Matches($docTxt, '[^/]`([A-Za-z0-9_\-./\\]+\.[a-z][a-z0-9]{0,7})`')) { $p = $m.Groups[1].Value.Replace('\','/') -replace '^\./',''; if ($p -notmatch '^(\.env|node_modules|dist|build|\.git)(/|$)' -and -not (Test-Path -LiteralPath (Join-Path $root ($p -replace '/', $sep)))) { $ghost[$p] = 1 } }
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
foreach ($x in $orphan) { Write-Host "[孤儿] $x" }
foreach ($x in $zero) { Write-Host "[零引用导出] $x" }
foreach ($x in $ghost.Keys) { Write-Host "[文档幽灵] $x" }
foreach ($x in $rev) { Write-Host "[反向幽灵] $x" }
foreach ($x in $unreg) { Write-Host "[未登记] $x" }
foreach ($x in $bad) { Write-Host "[读取失败] $x" -ForegroundColor Red }
if ($untracked.Count -gt 0) { Write-Host ("[FAIL] 未跟踪 {0} 个文件：五张清单不完整（先 git add 再复跑）" -f $untracked.Count) -ForegroundColor Red }
Write-Host ("孤儿 {0} 项｜零引用导出 {1} 项｜文档幽灵 {2} 项｜反向幽灵 {3} 项｜未登记 {4} 项｜未跟踪 {5} 项｜读取失败 {6} 项｜文件数 {7}" -f $orphan.Count, $zero.Count, $ghost.Count, $rev.Count, $unreg.Count, $untracked.Count, $bad.Count, $rel.Count)
if ($bad.Count -gt 0 -or $untracked.Count -gt 0) { Write-Host "[FAIL] 清单不完整（未跟踪文件或读取/解析失败）：计数不可信，先修仪器/先 git add 再解读" -ForegroundColor Red; exit 1 }
exit 0
