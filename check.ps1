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
# 本项目真实命令（1-3 卡接入时接线；与 package.json 的 `test` 脚本**同口径**，改一处必须改两处）。
$STEPS = @(
    'node --test "test/*.test.mjs"'
    'node --test "plugin/roadbook-autoload/test/*.test.mjs"'
    'node --test "plugin/roadbook-evolve/test/*.test.mjs"'
)

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
# 判据执行者自身上限（$selfCap 模式，C-3 先例）+ 文档行数上限的同源断言（A1c 模式）——
# 两条都是把母版私有 _qc 里已解决问题的形态下发给项目侧；上调 $selfCap 必须同批改本行与 design §11.10，
# 理由只能是"判据真的变强了"，不是"文件写长了"。
# 2026-10-07 由 150 上调到 170：新增 STATE.md 可读性三条（台账 #3 —— 单行 ≤500 字符 / 风险摘要恰好 1 行 /
#   摘要指向的根 RISK.md 必须在位）。判据真变强，不是文件写长了；同批改 _qc/check.ps1 的 $budget 与 design §8。
$selfCap = 170
$selfN = @([IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'check.ps1'), [Text.Encoding]::UTF8)).Count
if ($selfN -le $selfCap) { Write-Host "[OK] check.ps1 自身 $selfN <= $selfCap 行（判据执行者自设上限）" -ForegroundColor Green }
else { Write-Host "[FAIL] check.ps1 自身 $selfN > $selfCap 行：判据执行者没有预算（拆函数，或写明调高理由）" -ForegroundColor Red; $fail++ }
$dlMap = Join-Path $PSScriptRoot 'DOC_MAP.json'; $dlRead = Join-Path $PSScriptRoot 'docs/README.md'
if (-not (Test-Path -LiteralPath $dlMap) -or -not (Test-Path -LiteralPath $dlRead)) {
    Write-Host "[FAIL] 文档行数上限同源断言的前提缺失：DOC_MAP.json 或 docs/README.md 不在位" -ForegroundColor Red; $fail++
} else {
    $dlj = $null; try { $dlj = [IO.File]::ReadAllText($dlMap, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { $dlj = $null }
    if ($null -eq $dlj -or $null -eq $dlj.docLimits) { Write-Host "[FAIL] DOC_MAP.json 缺 docLimits：文档行数上限没有机器判据数据源（gate.ps1 ⑨ 会空转）" -ForegroundColor Red; $fail++ }
    else {
        $want = @{}; foreach ($pp in $dlj.docLimits.files.PSObject.Properties) { $want[[string]$pp.Name] = [int]$pp.Value }
        $got = @{}
        foreach ($ln in [IO.File]::ReadAllLines($dlRead, [Text.Encoding]::UTF8)) {
            if (-not $ln.StartsWith('|')) { continue }
            $c = @($ln.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
            $nm = ($c[0] -replace '（[^）]*）', ''); $ns = @([regex]::Matches($c[-1], '≤(\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
            if ($ns.Count -eq 0 -or $nm -eq '' -or $nm -match '^[:\-\s]+$') { continue }
            if ($nm.EndsWith('/')) { $got['docs/' + $nm + '*.md'] = $ns[-1]; if ($ns.Count -ge 2) { $got['docs/' + $nm + 'README.md'] = $ns[0] } }
            elseif ($ns.Count -eq 1) { $got['docs/' + $nm] = $ns[0] }
        }
        $dd = @(); foreach ($k in $want.Keys) { if (-not $got.ContainsKey($k)) { $dd += "$k 缺对应表行" } elseif ($got[$k] -ne $want[$k]) { $dd += "$k 上限不一致（DOC_MAP $($want[$k]) / 对应表 $($got[$k])）" } }
        foreach ($k in $got.Keys) { if (-not $want.ContainsKey($k)) { $dd += "$k 只在对应表（漏进 docLimits）" } }
        if ($dd.Count -gt 0) { Write-Host "[FAIL] 文档行数上限两处不同源：$($dd -join '；')" -ForegroundColor Red; $fail++ }
        else { Write-Host "[OK] 文档行数上限同源：DOC_MAP.json 的 docLimits $($want.Count) 条 ↔ docs/README.md 对应表（A1c 同款双向核对）" -ForegroundColor Green }
    }
}
# STATE.md 可读性（台账 #3 / 反馈 U-1 + T-07）：开工必读的一页不许有超长行 —— 读取端按行截断时，
# 截掉的正是"这一轮该先处置什么"。修法不是"少写"，是分层：摘要留本文件，证据外置根 RISK.md。
# 三条判据：单行 ≤500 字符 / 「风险摘要」恰好 1 行 / 摘要指向的 RISK.md 必须真的在（否则摘要 = 空指针）。
$stLines = @()
if (Test-Path $sm) { $stLines = [System.IO.File]::ReadAllLines($sm, [Text.Encoding]::UTF8) }
$stLong = @($stLines | Where-Object { $_.Length -gt 500 }); $stMax = 0
foreach ($l in $stLines) { if ($l.Length -gt $stMax) { $stMax = $l.Length } }
if ($stLong.Count -gt 0) { Write-Host "[FAIL] STATE.md 有 $($stLong.Count) 行超过 500 字符（最长 $stMax）：明细外置根 RISK.md，本文件只留摘要行" -ForegroundColor Red; $fail++ }
else { Write-Host "[OK] STATE.md 单行 <= 500 字符（最长 $stMax；明细外置层 = 根 RISK.md）" -ForegroundColor Green }
$stRisk = @($stLines | Where-Object { $_ -match '^\s*[-*]?\s*风险摘要\s*[:：]' })
if ($stRisk.Count -eq 1) { Write-Host "[OK] STATE.md 的「风险摘要」恰好 1 行（摘要指 RISK.md，正文不在本文件）" -ForegroundColor Green }
else { Write-Host "[FAIL] STATE.md 的「风险摘要」有 $($stRisk.Count) 行：摘要限 1 行，明细写根 RISK.md" -ForegroundColor Red; $fail++ }
if (Test-Path (Join-Path $PSScriptRoot 'RISK.md')) { Write-Host "[OK] RISK.md 在位（风险与未决问题的明细外置层）" -ForegroundColor Green }
else { Write-Host "[FAIL] RISK.md 不在位：STATE.md 的摘要指了它 —— 明细层缺失 = 摘要成了空指针" -ForegroundColor Red; $fail++ }

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
