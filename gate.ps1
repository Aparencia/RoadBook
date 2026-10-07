# gate.ps1 · 机械门禁（零 token 检查：能脚本断言的不进对话；4-1 卡每批提交前后、4-2 卡开工）
# 判词：红 = exit 1（非 git 工作树 / 锚点无效 / 缺 -Anchor / 缺 -ScopeFiles / 越界 / 行数超限 / lockfile 变更 / 文档义务未履行）；
#   黄 = 通过但有需注意项（重命名条目、变更清单为空），仍 exit 0；绿 = exit 0。
# 用法（复制即用；缺参数或指错仓库时脚本会把这两行原样打回来）：
#   powershell -NoProfile -File gate.ps1 -Anchor HEAD~1 -ScopeFiles "src/a.ts,src/b.ts" -RepoRoot .
#   powershell -NoProfile -File gate.ps1 -Anchor 9f8e7d6 -ScopeFiles "src/" -RepoRoot .   （9f8e7d6 换成你本批的起点提交哈希）
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
#   判据对象 = **源码**（500 出自 AGENTS.md D14「代码生成硬标准」）：旧版把它套到文档上 ⇒ 碰
#   CHANGELOG.md / 长设计文档的批次必然假红（TD-021），假红会训练人调大 -LineLimit 或干脆不跑 ⑥。
#   文档真判据在 ⑨（docLimits）与项目侧 check.ps1 预算表；未知扩展名仍进本段（白名单会造新盲区）。
$notSource = @('.md','.markdown','.rst','.txt','.json','.jsonl','.ndjson','.yml','.yaml','.toml','.ini','.cfg','.csv','.tsv','.lock','.log','.html','.htm','.svg','.xml'); $skipped = @()
foreach ($f in $changed) {
    $full = Join-Path $RepoRoot ($f -replace '/', [IO.Path]::DirectorySeparatorChar)
    $isFile = $false
    try { $isFile = Test-Path -LiteralPath $full -PathType Leaf } catch { $isFile = $false }
    if (-not $isFile) { continue }
    if ($notSource -contains ([IO.Path]::GetExtension($f).ToLowerInvariant())) { $skipped += $f; continue }
    try { $n = [System.IO.File]::ReadAllLines($full, [Text.Encoding]::UTF8).Count }
    catch { $fail += "行数读取失败：$f（$($_.Exception.Message)）"; continue }
    $t = IsTest $f
    $lim = $LineLimit; if ($t) { $lim = $TestLineLimit }
    if ($n -gt $lim) { $fail += "行数超限：$f 共 $n 行 > 上限 $lim（测试文件=$t）——拆分文件或缩范围" }
}
if ($skipped.Count -gt 0) { Write-Host ("[跳过] ⑥ 非源码不判行数（D14 只管代码，文档归 ⑨）：{0} 个 —— {1}" -f $skipped.Count, ($skipped -join '、')) }

# ⑦ lockfile 变更 = 未请求的依赖变更（AGENTS.md §2.3）：硬红灯，必须单独说明。
$lk = @($changed | Where-Object { $_ -match '(?i)(lock|package-lock|yarn\.lock|poetry\.lock|uv\.lock|Cargo\.lock)' })
if ($lk.Count -gt 0) { $fail += "依赖变更：$($lk -join '、')——lockfile 变更必须单独说明并独立提交" }

# ⑧ 文档义务（DOC_MAP.json）：命中形态而对应文档没在同批改动里 = 红。
#   义务此前只写在散文里（AGENTS.md 的 D13 回写义务表 + docs/README.md 的对应表），索引键是
#   "变更类型"，而手里的事实是"改了哪个路径"——路径→语义靠判断，这一步最容易漏，且漏了没有
#   痕迹（实测：5-7 卡的产物 docs/BASELINE.md 在五处登记里缺了四处，而门禁照旧全绿）。
#   判据数据在 DOC_MAP.json：source=added-file 取本批新增文件（排除 docs/，那些由 5-1 第 ⑧ 查管）
#   ｜source=new-line 取本批新增行；每条规则的 d13 字段逐字引用 AGENTS.md 的义务行首，
#   绑定由 _qc/check-docs.ps1 反向核对（防本文件引用一条不存在的义务）。
$mapFile = Join-Path $RepoRoot 'DOC_MAP.json'
if (-not (Test-Path -LiteralPath $mapFile)) {
    $warn += '无 DOC_MAP.json：文档义务没有机械检查（缺它 = 义务仍只靠记性，机器不判）'
}
else {
    $map = $null
    try { $map = [IO.File]::ReadAllText($mapFile, [Text.Encoding]::UTF8) | ConvertFrom-Json }
    catch { $fail += "DOC_MAP.json 解析失败：$($_.Exception.Message)" }
    if ($null -ne $map) {
        # 比对基准用 $Anchor（工作树 vs 锚点），不用 "$Anchor..HEAD"（只看到已提交）——
        # 4-1 卡要求"提交前后都能跑"，只认已提交 = 提交前这段永远查不到（假绿）。
        # 未跟踪文件不进 git diff，由下面的 ls-files --others 补上。
        $added = @(@(git -C $RepoRoot -c core.quotepath=false diff --name-status --diff-filter=A "$Anchor" 2>$null | ForEach-Object { $c = @([string]$_ -split "`t"); if ($c.Count -ge 2) { $c[1] } }) + @(git -C $RepoRoot -c core.quotepath=false ls-files --others --exclude-standard 2>$null) | Where-Object { $_ } | Select-Object -Unique)
        $newLines = @(git -C $RepoRoot diff -U0 "$Anchor" 2>$null | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' })
        foreach ($rule in @($map.rules)) {
            if ($rule.disabled) { continue }
            $pool = @($added | Where-Object { $_ -notmatch '^docs/' })
            if ([string]$rule.source -eq 'new-line') { $pool = $newLines }
            $hit = @($pool | Where-Object { $_ -match [string]$rule.pattern })
            if ($hit.Count -eq 0) { continue }
            $docs = @($rule.docs)
            if (@($docs | Where-Object { $changed -contains $_ }).Count -eq 0) {
                $fail += "文档义务未履行 [$($rule.id)]：本批新增 $($hit.Count) 处（如 $($hit[0])）→ 应同批更新 $($docs -join ' 或 ')（判据 DOC_MAP.json；不适用就给该条加 disabled 并写 STATE.md 裁剪记录）"
            }
        }
    }
}

# ⑨ 文档行数上限（DOC_MAP.json 的 docLimits）：本批变更清单里的文档超限 = 红。
#   与 ⑥ 同口径（只判本批动过的文件）——全仓一次性洗白会逼着"顺手改"（D6）；上限的事实源是
#   docs/README.md 的「行数上限」列，两处同源由 check.ps1 的结构断言双向核对（数字不一致 = 判据分裂）。
if ($null -ne $map -and $null -ne $map.docLimits) {
    $lim = @{}
    # `*` 只匹配同一路径段内（[^/]*）：写成 `.` 会让 docs/lessons/*.md 把子目录也算进来。
    foreach ($pr in $map.docLimits.files.PSObject.Properties) { $lim['^' + ([regex]::Escape([string]$pr.Name)).Replace('\*', '[^/]*') + '$'] = [int]$pr.Value }
    foreach ($f in $changed) {
        $hit = @($lim.Keys | Where-Object { $f -match $_ })
        if ($hit.Count -eq 0) { continue }
        $cap = ($hit | ForEach-Object { $lim[$_] } | Measure-Object -Minimum).Minimum   # 多条命中取最严
        $full9 = Join-Path $RepoRoot ($f -replace '/', [IO.Path]::DirectorySeparatorChar)
        $isFile9 = $false
        try { $isFile9 = Test-Path -LiteralPath $full9 -PathType Leaf } catch { $isFile9 = $false }
        if (-not $isFile9) { continue }
        try { $n9 = [System.IO.File]::ReadAllLines($full9, [Text.Encoding]::UTF8).Count }
        catch { $fail += "文档行数读取失败：$f（$($_.Exception.Message)）"; continue }
        if ($n9 -gt $cap) { $fail += "文档行数超限：$f 共 $n9 行 > 上限 $cap（上限数据在 DOC_MAP.json 的 docLimits，事实源 docs/README.md；按 D13 把明细外置成同级文档，不许调高上限当解法）" }
    }
}
elseif ($null -ne $map) { $warn += 'DOC_MAP.json 没有 docLimits：文档行数上限仍只是人读索引（docs/README.md 那一列），机器不判' }

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
