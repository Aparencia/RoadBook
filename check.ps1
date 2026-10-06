# check.ps1 · 收工仪式（guardrail）
# "完成"的唯一合法定义 = 本脚本退出码 0 + 真实输出。
# 1-2-选型初始化卡会把下方 STEPS 替换为本项目真实的 typecheck/lint/test/build 命令。
# ⚠️ 口径唯一：本脚本（含 STEPS）是本项目唯一验收口径。将来加 CI/钩子必须跑与 STEPS 完全相同的命令——
#    基线口径漂移（如 CI 少带一个 --strict、clippy 不带 -D warnings）= 门禁永远假绿而无人发现。
# 退出码：0 = 全部通过；1 = 有断言/步骤失败；2 = STEPS 未配置（本项目命令没接进来，6-4 卡据此与"修复失败"区分）。
# 常见栈示例（逐条一行，全部跑完再汇总）：
#   Node:   $STEPS = @('pnpm typecheck', 'pnpm lint', 'pnpm test')
#   Python: $STEPS = @('python -m mypy .', 'python -m pytest -q')
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# 本项目真实命令（1-3 卡接入时接线；与 package.json 的 `test` 脚本**同口径**，改一处必须改两处）。
$STEPS = @(
    'node --test "test/*.test.mjs"'
    'node --test "plugin/roadbook-autoload/test/*.test.mjs"'
    'node --test "plugin/roadbook-evolve/test/*.test.mjs"'
)

# --- 结构断言：与 STEPS 无关，先跑（orphans 工具在位 + 文件数预算）---
# 文件数口径同 orphans.ps1：优先 git ls-files（-c core.quotepath=false，中文名不被转义成八进制串）；
# 无 git 时遍历并在 ReparsePoint 目录处停住（PS5.1 的 -Recurse 会穿透 junction）。
$fileBudgetGrowth = 20
$fail = 0
if (Test-Path (Join-Path $PSScriptRoot 'orphans.ps1')) { Write-Host "[OK] orphans.ps1 存在" -ForegroundColor Green }
else { Write-Host "[FAIL] orphans.ps1 存在（项目根缺孤儿、幽灵与文档七查工具）" -ForegroundColor Red; $fail++ }
$cnt = 0
if (Get-Command git -ErrorAction SilentlyContinue) { $cnt = @(git -C $PSScriptRoot -c core.quotepath=false ls-files 2>$null | Where-Object { $_ }).Count }
if ($cnt -eq 0) {
    $cnt = 0; $q = New-Object System.Collections.Queue; $q.Enqueue($PSScriptRoot)
    while ($q.Count -gt 0) {
        $d = $q.Dequeue(); $cnt += @([IO.Directory]::GetFiles($d)).Count
        foreach ($s in [IO.Directory]::GetDirectories($d)) { if ($s -notmatch '\\(\.git|node_modules|_archive)(\\|$)' -and -not ((Get-Item -LiteralPath $s -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { $q.Enqueue($s) } }
    }
}
# 文件数基线：缺失或 0 都是 FAIL——预算断言空转等于没有预算（模板默认 STATE.md 就是 0，旧版在此静默跳过）。
$sm = Join-Path $PSScriptRoot 'STATE.md'; $base = $null
if (Test-Path $sm) { $bm = [regex]::Match([IO.File]::ReadAllText($sm, [Text.Encoding]::UTF8), '(?m)^\s*[-*]?\s*文件数基线\s*[:：]\s*(\d+)'); if ($bm.Success) { $base = [int]$bm.Groups[1].Value } }
if ($null -eq $base -or $base -eq 0) { Write-Host "[FAIL] 文件数基线未初始化：STATE.md 没有「文件数基线: N」行或值为 0——预算断言无从判定（1-2 / 1-3 卡接入收尾必须写入当时的文件数）" -ForegroundColor Red; $fail++ }
elseif ($cnt -le $base + $fileBudgetGrowth) { Write-Host "[OK] 文件数 $cnt <= 基线 $base + 允许新增 $fileBudgetGrowth" -ForegroundColor Green }
else { Write-Host "[FAIL] 文件数预算超支：基线 $base / 当前 $cnt / 允许新增 $fileBudgetGrowth" -ForegroundColor Red; $fail++ }

# --- git 断言：完成 = 已提交（未提交 = 没有历史；锚点/账本/归档全部空转）---
# 非 git 仓库 = FAIL：DoD 的"已提交"失去机械真相来源（旧版在此 [--] 跳过 = 假绿）。
$gitOk = $false
if (Get-Command git -ErrorAction SilentlyContinue) {
    $wt = @(git -C $PSScriptRoot rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -eq 0 -and $wt.Count -gt 0 -and ([string]$wt[0]).Trim() -eq 'true') { $gitOk = $true }
}
if (-not $gitOk) { Write-Host "[FAIL] 非 git 仓库：提交、起点锚点、账本断言全部无从判定（1-2 / 1-3 卡的 git 起点动作未完成）" -ForegroundColor Red; $fail++ }
else {
    $dirty = @(git -C $PSScriptRoot status --porcelain 2>$null | Where-Object { $_ })
    if ($dirty.Count -gt 0) {
        Write-Host "[FAIL] 工作树不干净：$($dirty.Count) 个未提交改动（完成 = 已提交）" -ForegroundColor Red
        $dirty | Select-Object -First 10 | ForEach-Object { Write-Host "        $_" }
        $fail++
    } else { Write-Host "[OK] 工作树干净（本批改动都已提交）" -ForegroundColor Green }
    # 起点锚点为空是合法状态（归档不清空它，新任务开工时覆盖；空 = 还没开工任务），故此处仍只提示不判失败。
    $am = if (Test-Path $sm) { [regex]::Match([IO.File]::ReadAllText($sm, [Text.Encoding]::UTF8), '(?m)^\s*[-*]?\s*起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})') } else { $null }
    if ($null -eq $am -or -not $am.Success) { Write-Host "[--] STATE.md 起点锚点未填（归档后为空属正常）：跳过本批提交计数断言" -ForegroundColor Yellow }
    else {
        $a = $am.Groups[1].Value
        git -C $PSScriptRoot cat-file -e "$a^{commit}" 2>$null
        $bc = if ($LASTEXITCODE -eq 0) { [int](git -C $PSScriptRoot rev-list --count ('{0}..HEAD' -f $a) 2>$null) } else { -1 }
        if ($bc -ge 1) { Write-Host "[OK] 本批已有 $bc 个提交（起点锚点 $a 之后）" -ForegroundColor Green }
        elseif ($bc -eq 0) { Write-Host "[FAIL] 本批 0 提交：起点锚点 $a 之后的提交数为 0（锚点未前移 = 做完没落历史）" -ForegroundColor Red; $fail++ }
        else { Write-Host "[FAIL] 起点锚点无效：$a 不是本仓库的提交（核对 STATE.md）" -ForegroundColor Red; $fail++ }
    }
}

# --- 步骤断言：STEPS 为空 = 门禁空心（1-2 卡"接入完成"的机械证据就是这些命令真跑过）---
$stepsEmpty = ($STEPS.Count -eq 0)
if ($stepsEmpty) { Write-Host "[FAIL] 未配置 STEPS：本项目命令还没接进来，本脚本对代码零断言（填下方示例里的真实命令后再跑）" -ForegroundColor Red; $fail++ }
else {
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
}

if ($fail -gt 0) {
    Write-Host "收工仪式未通过：$fail 步失败。禁止宣布完成。" -ForegroundColor Red
    if ($stepsEmpty) { exit 2 }
    exit 1
}
Write-Host "全部通过（退出码 0）：完成声明成立。" -ForegroundColor Green
exit 0
