# gate.ps1 · 机械门禁（零 token 检查：能脚本断言的不进对话）
# 用法（23 卡每批提交前后 / 24 卡开工）：
#   powershell -File gate.ps1 -Anchor <起点哈希> -ScopeFiles "src/a.ts","src/b.ts"
# 参数全部可选；不传则跳过对应检查。红 = exit 1；黄 = exit 0 但列出警告。
param(
    [string]$Anchor = '',
    [string[]]$ScopeFiles = @(),
    [int]$LineLimit = 500,       # 业务文件行数上限（宪法 §11）
    [int]$TestLineLimit = 1000,  # 测试文件豁免上限（宪法 §11）
    [string]$RepoRoot = '.'
)
$fail = @(); $warn = @()
function IsTest($p) { return $p -match '(?i)(test|spec|__tests__|[\\/]tests[\\/])' }

# ① 锚点有效性（单独裸跑 + 立刻读 $LASTEXITCODE，见教训卡"假 exit 码"）
if ($Anchor -ne '') {
    git -C $RepoRoot cat-file -e "$Anchor^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { $fail += "锚点无效：$Anchor 不存在（核对 STATE.md 起点 锚点）" }
}

# 变更文件清单（锚点..HEAD 或未提交变更）
$changed = @()
if ($Anchor -ne '') {
    $changed = @(git -C $RepoRoot diff --name-only "$Anchor..HEAD")
} else {
    $changed = @(git -C $RepoRoot status --porcelain | ForEach-Object { $_.Substring(3).Trim() })
}

# ② 范围合规（提供 ScopeFiles 才检查；支持精确路径与前缀）
if ($ScopeFiles.Count -gt 0 -and $changed.Count -gt 0) {
    foreach ($f in $changed) {
        $hit = $ScopeFiles | Where-Object { $f -eq $_ -or $f -like "$_*" -or $_ -like "$f*" }
        if (-not $hit) { $fail += "越界：$f 不在 SCOPE 文件清单内（顺手改 = 还原或登记 TECH_DEBT）" }
    }
}

# ③ 行数上限（500 / 测试 1000；口径 = ReadAllLines(UTF8).Count，见教训卡"数字口径与 CRLF"）
foreach ($f in $changed) {
    $full = Join-Path $RepoRoot $f
    if (Test-Path $full -PathType Leaf) {
        $n = [System.IO.File]::ReadAllLines($full, [Text.Encoding]::UTF8).Count
        $lim = if (IsTest $f) { $TestLineLimit } else { $LineLimit }
        if ($n -gt $lim) { $warn += "行数 $n > 上限 $lim ：$f（测试豁免=$([bool](IsTest $f))）" }
    }
}

# ④ lockfile 变更（需单独说明/独立提交）
$lock = $changed | Where-Object { $_ -match '(?i)(lock|package-lock|yarn\.lock|poetry\.lock|uv\.lock|Cargo\.lock)' }
if ($lock) { $warn += "lockfile 变更：$($lock -join ', ')——禁止未请求的依赖变更，需单独说明" }

if ($fail.Count -gt 0) {
    Write-Host "[RED] 机械门禁失败：" -ForegroundColor Red
    $fail | ForEach-Object { Write-Host "  - $_" }
    exit 1
}
if ($warn.Count -gt 0) {
    Write-Host "[YELLOW] 机械检查通过，但需注意：" -ForegroundColor Yellow
    $warn | ForEach-Object { Write-Host "  - $_" }
    exit 0
}
Write-Host "[GREEN] 机械门禁全部通过（exit 0）。" -ForegroundColor Green
exit 0
