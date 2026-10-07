#  check.ps1 · 收工仪式（guardrail）
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
$STEPS = @()

# --- 结构断言：与 STEPS 无关，先跑（orphans 工具在位 + 文件数预算）---
# 文件数口径同 orphans.ps1：优先 git ls-files（-c core.quotepath=false，中文名不被转义成八进制串）；
# 无 git 时遍历并在 ReparsePoint 目录处停住（PS5.1 的 -Recurse 会穿透 junction）。
# 双计数器（台账 #4 / 反馈 T-03，2026-10-07 用户裁决提前到批 1）：源码·资产 与 docs/**.md 各一套额度。
#   Why：B6 防的是"生成多删除少"，而 docs/**.md 是流程产物的必要载体——两者挤同一个额度时，
#   写一份 RCA 与新建一个模块等价，预算就不再量它想量的东西。
# D14 强制拆分单列（同批裁决 ④）：单文件 ≤500 行是硬标准，满足它必须拆文件，拆出来的不该再吃
#   "全新功能"的额度。豁免不靠自述——完整性断言在 test/d14-lines.test.mjs（父文件在或显式标注
#   已删除 / 每片 ≤ 上限 / 同一父的所有片之和 > 上限 ⇒ 原文件必然超限、拆分确实是被逼的）。
$fileBudgetGrowth = 20
$fail = 0
if (Test-Path (Join-Path $PSScriptRoot 'orphans.ps1')) { Write-Host "[OK] orphans.ps1 存在" -ForegroundColor Green }
else { Write-Host "[FAIL] orphans.ps1 存在（项目根缺孤儿、幽灵与文档七查工具）" -ForegroundColor Red; $fail++ }
$all = @()
if (Get-Command git -ErrorAction SilentlyContinue) { $all = @(git -C $PSScriptRoot -c core.quotepath=false ls-files 2>$null | Where-Object { $_ }) }
if ($all.Count -eq 0) {
    $q = New-Object System.Collections.Queue; $q.Enqueue($PSScriptRoot)
    while ($q.Count -gt 0) { $d = $q.Dequeue()
        foreach ($f in [IO.Directory]::GetFiles($d)) { $all += $f.Substring($PSScriptRoot.Length + 1).Replace('\', '/') }
        foreach ($s in [IO.Directory]::GetDirectories($d)) { if ($s -notmatch '\\(\.git|node_modules|_archive)(\\|$)' -and -not ((Get-Item -LiteralPath $s -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { $q.Enqueue($s) } }
    }
}
$split = @()   # D14 拆分件登记在 COMPONENTS.md「归属批次」列，标记 = D14 拆分自 <父路径>
$reg = Join-Path $PSScriptRoot 'docs/registry/COMPONENTS.md'
if (Test-Path $reg) { foreach ($ln in [IO.File]::ReadAllLines($reg, [Text.Encoding]::UTF8)) {
    if ($ln -notmatch 'D14 拆分自\s+[^\s）|（]+') { continue }
    $cm = [regex]::Match($ln, '^\|\s*`([^`]+)`\s*\|'); if ($cm.Success) { $split += $cm.Groups[1].Value.Trim() }
} }
$ghost = @($split | Where-Object { $all -notcontains $_ })
if ($ghost.Count -gt 0) { Write-Host "[FAIL] 拆分件登记了但索引里没有（幽灵 = 登记在骗人）：$($ghost -join ', ')" -ForegroundColor Red; $fail++ }
# 文件数基线：缺失或 0 都是 FAIL——预算断言空转等于没有预算（模板默认 STATE.md 就是 0，旧版在此静默跳过）。
$sm = Join-Path $PSScriptRoot 'STATE.md'; $base = $null; $baseSrc = $null; $baseDocs = $null
if (Test-Path $sm) { $txt = [IO.File]::ReadAllText($sm, [Text.Encoding]::UTF8)
    $m1 = [regex]::Match($txt, '(?m)^\s*[-*]?\s*文件数基线\s*[:：]\s*(\d+)'); if ($m1.Success) { $base = [int]$m1.Groups[1].Value }
    $m2 = [regex]::Match($txt, '(?m)^\s*[-*]?\s*文件数基线拆分\s*[:：]\s*(\d+)\s*/\s*(\d+)'); if ($m2.Success) { $baseSrc = [int]$m2.Groups[1].Value; $baseDocs = [int]$m2.Groups[2].Value }
}
if ($null -eq $base -or $base -eq 0) { Write-Host "[FAIL] 文件数基线未初始化：STATE.md 没有「文件数基线: N」行或值为 0——预算断言无从判定（1-2 / 1-3 卡接入收尾必须写入当时的文件数）" -ForegroundColor Red; $fail++ }
elseif ($null -eq $baseSrc -or $baseSrc -eq 0 -or $null -eq $baseDocs -or $baseDocs -eq 0) { Write-Host "[FAIL] 文件数基线拆分未初始化：STATE.md 缺「文件数基线拆分: <源码> / <docs>」行或值为 0——双计数器无从判定（2026-10-07 台账 #4；接入收尾要写取样时的两个数）" -ForegroundColor Red; $fail++ }
else {
    $dc = @($all | Where-Object { $_ -match '^docs/.*\.md$' }).Count; $ds = @($split | Where-Object { $_ -match '^docs/.*\.md$' }).Count
    $sc = $all.Count - $dc - ($split.Count - $ds); $sd = $dc - $ds
    if ($sc -gt $baseSrc + $fileBudgetGrowth) { Write-Host "[FAIL] 源码·资产预算超支：基线 $baseSrc / 当前 $sc / 允许新增 $fileBudgetGrowth" -ForegroundColor Red; $fail++ }
    else { Write-Host "[OK] 源码·资产 $sc <= 基线 $baseSrc + 允许新增 $fileBudgetGrowth（另有 $($split.Count - $ds) 个 D14 拆分件单列不计）" -ForegroundColor Green }
    if ($sd -gt $baseDocs + $fileBudgetGrowth) { Write-Host "[FAIL] docs/**.md 预算超支：基线 $baseDocs / 当前 $sd / 允许新增 $fileBudgetGrowth" -ForegroundColor Red; $fail++ }
    else { Write-Host "[OK] docs/**.md $sd <= 基线 $baseDocs + 允许新增 $fileBudgetGrowth" -ForegroundColor Green }
}

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
