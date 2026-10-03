# orphans.ps1 · 孤儿与幽灵三查（只报不拦，退出码恒 0）
# 用途：删除腐化治理的对照清单——源码没人引用 / 导出没人调用 / 文档写的路径不存在 / 源码没进文档 / 组件没登记。
# 用法：在项目根执行 powershell -NoProfile -File orphans.ps1
# 为什么只报不拦：判据是正则启发式（必然有误报），而"删哪个"属于人的裁决（AGENTS.md §4 不可委托清单）；
#   门禁是 check.ps1 的职责，本脚本只出清单，退出码恒 0。
# 口径：文件清单优先 git ls-files（不穿透 junction）；无 git 时退化为目录遍历并显式跳过 ReparsePoint 目录。
#   排除 .git/ node_modules/ docs/ _archive/ 与四个守护脚本自身；"文件数"= 排除后纳入扫描的文件数。
#   孤儿=源码文件没被其他任何文本文件按文件名提及；零引用导出=导出名在源码全文只出现一次（即只有定义）。
#   文档幽灵=文档反引号路径磁盘不存在（.env/node_modules/dist/build 这类不进仓库的路径不算）。
#   反向幽灵=源码文件没被任何文档提到；未登记=不在 docs/registry/COMPONENTS.md。匹配一律按 ASCII 词边界，避免被中文粘连吞掉。
$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$skipDir = '(^|/)(\.git|node_modules|_archive|docs)/'
$skipFile = @('check.ps1','doctor.ps1','gate.ps1','orphans.ps1')
$srcExt = @('.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.ps1','.go','.rs','.cs','.java','.vue','.sql','.sh')
$txtExt = $srcExt + @('.md','.json','.yml','.yaml','.toml','.txt','.html','.css','.scss','.xml','.ini','.cfg')
$bd = '(?<![A-Za-z0-9_])'; $be = '(?![A-Za-z0-9_])'
$fs = @(); if (Get-Command git -ErrorAction SilentlyContinue) { $fs = @(git ls-files 2>$null | Where-Object { $_ }) }
if ($fs.Count -eq 0) {
    $fs = @(); $q = New-Object System.Collections.Queue; $q.Enqueue($root)
    while ($q.Count -gt 0) {
        $d = $q.Dequeue()
        foreach ($f in [IO.Directory]::GetFiles($d)) { $fs += $f.Substring($root.Length).TrimStart('\','/').Replace('\','/') }
        foreach ($s in [IO.Directory]::GetDirectories($d)) { if (((Get-Item -LiteralPath $s -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { $q.Enqueue($s) } }
    }
}
$rel = @($fs | ForEach-Object { $_.Replace('\','/') } | Where-Object { $_ -notmatch $skipDir -and $skipFile -notcontains [IO.Path]::GetFileName($_) })
$src = @($rel | Where-Object { $srcExt -contains [IO.Path]::GetExtension($_).ToLower() })
$docTxt = ''
foreach ($p in @('AGENTS.md','STATE.md','README.md')) { $fp = Join-Path $root $p; if (Test-Path -LiteralPath $fp) { $docTxt += [IO.File]::ReadAllText($fp, [Text.Encoding]::UTF8) + "`n" } }
$dc = Join-Path $root 'docs'
if (Test-Path -LiteralPath $dc) { foreach ($f in @(Get-ChildItem -LiteralPath $dc -Recurse -Filter *.md -File -Force -ErrorAction SilentlyContinue)) { $docTxt += [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) + "`n" } }
$regPath = Join-Path $root 'docs\registry\COMPONENTS.md'; $regTxt = ''
if (Test-Path -LiteralPath $regPath) { $regTxt = [IO.File]::ReadAllText($regPath, [Text.Encoding]::UTF8) }
$txt = @{}; $blob = New-Object System.Text.StringBuilder
foreach ($f in @($rel | Where-Object { $txtExt -contains [IO.Path]::GetExtension($_).ToLower() })) { $t = ''; try { $t = [IO.File]::ReadAllText((Join-Path $root ($f -replace '/','\')), [Text.Encoding]::UTF8) } catch { }; $txt[$f] = $t; [void]$blob.AppendLine($t) }
$srcBlob = ''; foreach ($f in $src) { $srcBlob += $txt[$f] + "`n" }
$allTxt = $blob.ToString() + "`n" + $docTxt
$ghost = @{}
foreach ($m in [regex]::Matches($docTxt, '[^/]`([A-Za-z0-9_\-./\\]+\.[a-z][a-z0-9]{0,7})`')) { $p = $m.Groups[1].Value.Replace('\','/') -replace '^\./',''; if ($p -notmatch '^(\.env|node_modules|dist|build|\.git)(/|$)' -and -not (Test-Path -LiteralPath (Join-Path $root ($p -replace '/','\')))) { $ghost[$p] = 1 } }
$freq = @{}
foreach ($m in [regex]::Matches($srcBlob, '[A-Za-z_$][A-Za-z0-9_$]*')) { $k = $m.Value; $freq[$k] = 1 + $freq[$k] }
$rxExp = [regex]'(?m)^\s*(?:export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)|def|function|func\s+(?:\([^)]*\)\s*)?|pub\s+fn|public\s+(?:static\s+|sealed\s+|abstract\s+)*(?:class|interface|enum|void|[A-Z]\w*))\s+([A-Za-z_$][\w$-]*)'
$orphan = @(); $zero = @(); $rev = @(); $unreg = @()
foreach ($f in $src) {
    $b = [IO.Path]::GetFileNameWithoutExtension($f)
    if ($b.Length -ge 3 -and ([regex]::Matches($allTxt, $bd + [regex]::Escape($b) + $be)).Count - ([regex]::Matches($txt[$f], $bd + [regex]::Escape($b) + $be)).Count -le 0) { $orphan += $f }
    if ($docTxt -notmatch [regex]::Escape($b)) { $rev += $f }
    if ($regTxt -notmatch [regex]::Escape($b)) { $unreg += $f }
    foreach ($m in $rxExp.Matches($txt[$f])) { $n = $m.Groups[1].Value; if ($null -eq $freq[$n]) { $freq[$n] = ([regex]::Matches($srcBlob, $bd + [regex]::Escape($n) + $be)).Count }; if ($freq[$n] -le 1) { $zero += "$f : $n" } }
}
foreach ($x in $orphan) { Write-Host "[孤儿] $x" }
foreach ($x in $zero) { Write-Host "[零引用导出] $x" }
foreach ($x in $ghost.Keys) { Write-Host "[文档幽灵] $x" }
foreach ($x in $rev) { Write-Host "[反向幽灵] $x" }
foreach ($x in $unreg) { Write-Host "[未登记] $x" }
Write-Host ("孤儿 {0} 项｜零引用导出 {1} 项｜文档幽灵 {2} 项｜反向幽灵 {3} 项｜未登记 {4} 项｜文件数 {5}" -f $orphan.Count, $zero.Count, $ghost.Count, $rev.Count, $unreg.Count, $rel.Count)
exit 0
