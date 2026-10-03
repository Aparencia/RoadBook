# check.ps1 · 收工仪式（guardrail）
# "完成"的唯一合法定义 = 本脚本退出码 0 + 真实输出。
# 11-选型初始化卡会把下方 STEPS 替换为本项目真实的 typecheck/lint/test/build 命令。
# ⚠️ 口径唯一：本脚本（含 STEPS）是本项目唯一验收口径。将来加 CI/钩子必须跑与 STEPS 完全相同的命令——
#    基线口径漂移（如 CI 少带一个 --strict、clippy 不带 -D warnings）= 门禁永远假绿而无人发现。
# 常见栈示例（逐条一行，失败即停不了，全部跑完再汇总）：
#   Node:   $STEPS = @('pnpm typecheck', 'pnpm lint', 'pnpm test')
#   Python: $STEPS = @('python -m mypy .', 'python -m pytest -q')
$STEPS = @()

# --- 结构断言：与 STEPS 无关，先跑（orphans 工具在位 + 文件数预算）---
# 文件数口径同 orphans.ps1：优先 git ls-files；无 git 时遍历并在 ReparsePoint 目录处停住（PS5.1 的 -Recurse 会穿透 junction）。
$fileBudgetGrowth = 20
$fail = 0
if (Test-Path (Join-Path $PSScriptRoot 'orphans.ps1')) { Write-Host "[OK] orphans.ps1 存在" -ForegroundColor Green }
else { Write-Host "[FAIL] orphans.ps1 存在（项目根缺孤儿与幽灵三查工具）" -ForegroundColor Red; $fail++ }
$cnt = 0
if (Get-Command git -ErrorAction SilentlyContinue) { $cnt = @(git -C $PSScriptRoot ls-files 2>$null | Where-Object { $_ }).Count }
if ($cnt -eq 0) {
    $cnt = 0; $q = New-Object System.Collections.Queue; $q.Enqueue($PSScriptRoot)
    while ($q.Count -gt 0) {
        $d = $q.Dequeue(); $cnt += @([IO.Directory]::GetFiles($d)).Count
        foreach ($s in [IO.Directory]::GetDirectories($d)) { if ($s -notmatch '\\(\.git|node_modules|_archive)(\\|$)' -and -not ((Get-Item -LiteralPath $s -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { $q.Enqueue($s) } }
    }
}
$sm = Join-Path $PSScriptRoot 'STATE.md'; $base = $null
if (Test-Path $sm) { $bm = [regex]::Match([IO.File]::ReadAllText($sm, [Text.Encoding]::UTF8), '(?m)^\s*[-*]?\s*文件数基线\s*[:：]\s*(\d+)'); if ($bm.Success) { $base = [int]$bm.Groups[1].Value } }
if ($null -eq $base -or $base -eq 0) { Write-Host "[--] 未设置文件数基线（STATE.md 无「文件数基线: N」行，或值为 0 = 未初始化；跳过预算断言——由 11/12 卡接入收尾写入当时的文件数）" -ForegroundColor Yellow }
elseif ($cnt -le $base + $fileBudgetGrowth) { Write-Host "[OK] 文件数 $cnt <= 基线 $base + 允许新增 $fileBudgetGrowth" -ForegroundColor Green }
else { Write-Host "[FAIL] 文件数预算超支：基线 $base / 当前 $cnt / 允许新增 $fileBudgetGrowth" -ForegroundColor Red; $fail++ }

if ($STEPS.Count -eq 0) {
    Write-Host "[未配置] check 步骤为空。" -ForegroundColor Yellow
    Write-Host "请在脚本顶部 STEPS 数组填入本项目的检查命令（参考上方注释里的常见栈示例）。"
    Write-Host "填好后再跑一次：powershell -File check.ps1"
    exit 2
}

foreach ($s in $STEPS) {
    Write-Host "== $s =="
    cmd /c "$s 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] $s (exit $LASTEXITCODE)" -ForegroundColor Red
        $fail++
    } else {
        Write-Host "[OK] $s" -ForegroundColor Green
    }
}

if ($fail -gt 0) {
    Write-Host "收工仪式未通过：$fail 步失败。禁止宣布完成。" -ForegroundColor Red
    exit 1
}
Write-Host "全部通过（退出码 0）：完成声明成立。" -ForegroundColor Green
exit 0
