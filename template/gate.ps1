# gate.ps1 · 机械门禁（零 token 检查：能脚本断言的不进对话；4-1 卡每批提交前后、4-2 卡开工）
# 判词：红 = exit 1（非 git 工作树 / 锚点无效 / 缺 -Anchor / 缺 -ScopeFiles / 越界 / 行数超限 / lockfile 变更）；
#   黄 = 通过但有需注意项（重命名条目、变更清单为空），仍 exit 0；绿 = exit 0。
# 用法（复制即用；缺参数或指错仓库时脚本会把这两行原样打回来）：
#   powershell -NoProfile -File gate.ps1 -Anchor HEAD~1 -ScopeFiles "src/a.ts,src/b.ts" -RepoRoot .
#   powershell -NoProfile -File gate.ps1 -Anchor <起点提交哈希> -ScopeFiles "src/" -RepoRoot .
# 参数：-Anchor 本批起点锚点（git 提交）｜-ScopeFiles 本批允许改动的文件或目录（多个用**逗号**写在同一个引号里；目录项写 "src/" 或写到已存在的目录名）
#   ｜-LineLimit/-TestLineLimit 行数硬阈值（测试文件豁免到后者）｜-RepoRoot git 工作树根，默认当前目录。
# 为什么 -Anchor 与 -ScopeFiles 必填：没有锚点划不出"本批"范围，没有 scope 判不了越界——旧版本遇到这两种情况会整段跳过检查（假绿）。
param(
    [string]$Anchor = '',
    [string[]]$ScopeFiles = @(),
    [int]$LineLimit = 500,
    [int]$TestLineLimit = 1000,
    [string]$RepoRoot = '.'
)
# -ScopeFiles 归一化：`powershell -NoProfile -File` 不支持数组传参——`-ScopeFiles "a","b"` 只落进一个元素（另一个被判越界），传数组变量直接绑定失败（Cannot process argument transformation）；规范形态 = 一个引号内的逗号串 `-ScopeFiles "src/a.ts,src/b.ts"`。进程内直接调用（`& .\gate.ps1 -ScopeFiles @('a','b')`）同样可用，这里对每个元素再切一次逗号；路径本身含逗号的项目请改把该文件所在目录写进 scope。
$ScopeFiles = @(foreach ($__s in $ScopeFiles) { foreach ($__p in ([string]$__s).Split(',')) { if ($__p.Trim() -ne '') { $__p.Trim() } } })
chcp 65001 > $null; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$fail = @(); $warn = @(); $usage = 'powershell -NoProfile -File gate.ps1 -Anchor HEAD -ScopeFiles "src/a.ts,src/b.ts" -RepoRoot .'
# 测试文件判定：一律带词边界——旧正则 (test|spec) 会把 contest/latest/spectrum/inspector 判成测试文件而豁免到 1000 行。
function IsTest($p) {
    return ($p -match '(?i)(^|[\\/])(tests?|specs?|__tests__)([\\/]|$)') -or ($p -match '(?i)\.(test|spec)\.[^.\\/]+$') -or ($p -match '(?i)(^|[\\/])test_[^\\/]+$') -or ($p -match '(?i)_test\.[^.\\/]+$')
}

# ① git 工作树校验：非 git 目录 / -RepoRoot 写错时，旧版 git 报错被 2>$null 吞成"无变更"→ 假绿。
$wt = @(git -C $RepoRoot rev-parse --is-inside-work-tree 2>$null)
if ($LASTEXITCODE -ne 0 -or $wt.Count -eq 0 -or ([string]$wt[0]).Trim() -ne 'true') {
    Write-Host "[RED] 不是 git 工作树（-RepoRoot $RepoRoot）：变更清单、锚点、行数检查全部失去判据。" -ForegroundColor Red
    Write-Host "      正确调用（在项目根）：$usage"
    exit 1
}
# ② 锚点校验：未传锚点 = 划不出本批范围（旧版整段跳过变更清单与行数检查）；锚点失效 = 判据错位。
if ($Anchor -eq '') {
    Write-Host "[RED] 未传 -Anchor：变更清单与行数检查无从界定（旧版静默跳过 = 假绿）。" -ForegroundColor Red
    Write-Host "      正确调用（在项目根）：$usage"
    exit 1
}
git -C $RepoRoot cat-file -e "$Anchor^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[RED] 锚点无效：$Anchor 在 $RepoRoot 里不是可解析的提交（重命名/amend 后锚点会失效）。" -ForegroundColor Red
    Write-Host "      正确调用（在项目根）：$usage"
    exit 1
}
# ③ 范围清单校验：未传 -ScopeFiles 时越界判定缩成空集（旧版静默跳过 = 假绿）。
if ($ScopeFiles.Count -eq 0) {
    Write-Host "[RED] 未传 -ScopeFiles：越界判定无从执行（旧版静默跳过 = 假绿）。" -ForegroundColor Red
    Write-Host "      正确调用（在项目根）：$usage"
    exit 1
}

# ④ 变更清单 = 已提交(锚点..HEAD) ∪ 未提交/未跟踪(status -z --untracked-files=all)。只取一侧就是假绿：
#   -uall 必须有：默认口径把整个未跟踪目录塌成一条 "?? src/"，其下的新文件既不进行数检查也不进范围判定。
#   -z 输出以 NUL 分隔；重命名条目格式为 "XY 新路径\0旧路径\0"，必须吃掉第二个字段，否则 "旧 -> 新" 会变成一个假路径（P0-5 假红）。
$changed = @(git -C $RepoRoot -c core.quotepath=false diff --name-only "$Anchor..HEAD" 2>$null | Where-Object { $_ })
$z = @(((git -C $RepoRoot -c core.quotepath=false status --porcelain -z --untracked-files=all 2>$null) -join '') -split "`0")
$i = 0
while ($i -lt $z.Count) {
    $e = [string]$z[$i]; $i++
    if ($e.Length -lt 4) { continue }
    $p = $e.Substring(3)
    if ($e.Substring(0,2) -match '[RC]') { $old = [string]$z[$i]; $i++; $warn += "重命名：$p（旧路径 $old 随条目一并取出，不参与范围判定）" }
    $changed += $p
}
$changed = @($changed | Where-Object { $_ } | Select-Object -Unique)
if ($changed.Count -eq 0) { $warn += "变更清单为空：锚点 $Anchor 之后没有任何改动（核对 -RepoRoot/-Anchor 是否指错批次）" }

# ⑤ 范围合规：-ScopeFiles 支持精确文件与目录——以 / 结尾或指向已存在目录的项，其下所有文件都算在范围内（真实项目常用 "src/" 当 scope）。
$sd = @(); $sf = @()
foreach ($s in $ScopeFiles) {
    $t = ([string]$s).Replace('\','/').Trim().TrimEnd('/')
    if ($t -eq '') { continue }
    if (([string]$s).Trim().EndsWith('/') -or (Test-Path -LiteralPath (Join-Path $RepoRoot ($t -replace '/', [IO.Path]::DirectorySeparatorChar)) -PathType Container)) { $sd += $t } else { $sf += $t }
}
foreach ($f in $changed) {
    if ($sf -contains $f) { continue }
    $hit = $false
    foreach ($d in $sd) { if ($f -eq $d -or $f.StartsWith($d + '/')) { $hit = $true; break } }
    if (-not $hit) { $fail += "越界：$f 不在 SCOPE 清单内（顺手改 = 还原或登记 docs/TECH_DEBT.md）" }
}

# ⑥ 行数上限（默认 500 / 测试 1000）：硬阈值，超限 = 红（旧版只给黄字 = 假绿）。
#   -LiteralPath + try/catch：中文或含通配符的路径不会再把异常吞成"检查通过"。
foreach ($f in $changed) {
    $full = Join-Path $RepoRoot ($f -replace '/', [IO.Path]::DirectorySeparatorChar)
    $isFile = $false
    try { $isFile = Test-Path -LiteralPath $full -PathType Leaf } catch { $isFile = $false }
    if (-not $isFile) { continue }
    try { $n = [System.IO.File]::ReadAllLines($full, [Text.Encoding]::UTF8).Count }
    catch { $fail += "行数读取失败：$f（$($_.Exception.Message)）"; continue }
    $t = IsTest $f
    $lim = $LineLimit; if ($t) { $lim = $TestLineLimit }
    if ($n -gt $lim) { $fail += "行数超限：$f 共 $n 行 > 上限 $lim（测试文件=$t）——拆分文件或缩范围" }
}

# ⑦ lockfile 变更 = 未请求的依赖变更（AGENTS.md §2.3）：硬红灯，必须单独说明。
$lk = @($changed | Where-Object { $_ -match '(?i)(lock|package-lock|yarn\.lock|poetry\.lock|uv\.lock|Cargo\.lock)' })
if ($lk.Count -gt 0) { $fail += "依赖变更：$($lk -join '、')——lockfile 变更必须单独说明并独立提交" }

if ($fail.Count -gt 0) {
    Write-Host "[RED] 机械门禁不通过（exit 1）：" -ForegroundColor Red
    foreach ($x in $fail) { Write-Host "  - $x" }
    exit 1
}
if ($warn.Count -gt 0) {
    Write-Host "[YELLOW] 机械检查通过，但有需注意项：" -ForegroundColor Yellow
    foreach ($x in $warn) { Write-Host "  - $x" }
}
Write-Host ("[GREEN] 机械门禁通过：变更 {0} 个文件｜锚点 {1}｜范围 {2} 项" -f $changed.Count, $Anchor, $ScopeFiles.Count) -ForegroundColor Green
exit 0
