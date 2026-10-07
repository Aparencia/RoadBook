# envcheck.ps1 · 只读环境读取器（ACL / 完整性标签 / 进程对照；只读不改）
# 用途：宿主级故障排查时，读"进程能不能碰这个路径"的三类事实——**外层的错误码只用于分桶，不当判据**。
# 来源：2026-10-07 派生项目教训（WebView2 故障）：真因是目录上的 **Low 完整性标签**，而它
#   不出现在任何日志、事件或错误码里；只有主动写仪器去读那一层才看得见。本脚本把那次的一次性探针固化下来。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/envcheck.ps1 -Path <要查的路径>
# 退出码：0 = 三类读数都取到了（**不代表"没问题"**）；1 = 有一类读不到（读数不可信，先修仪器）
# 边界：本脚本**只读**——不建目录、不改归属、不写 ACL、不动标签；它的输出是给人看的对照材料。
# 教训对照（每条都在 2026-10-07 的排查里用上）：① 仪器先自校准（先读一个已知路径当标尺）
#   ② "排除"必须点名被排除的具体字段（DACL / SACL / 标签 / owner 是四段不同的事实）
#   ③ 外层错误码只用于分桶（同一根因会给 0x800700AA / 0x8000FFFF / 0x80070005）
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Reference = $env:TEMP
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
$bad = 0

function Read-Step([string]$name, [scriptblock]$body) {
    try {
        $value = & $body
        Write-Host ("[读] {0}：{1}" -f $name, $value)
    } catch {
        Write-Host ("[读不到] {0}：{1}" -f $name, $_.Exception.Message) -ForegroundColor Red
        $script:bad++
    }
}

# ① 存在性与类型：不存在的路径不是"故障"，是"你查错了对象"——先分清再往下读
Read-Step '路径存在' { if (Test-Path -LiteralPath $Path) { '是' } else { '否（后面几项对不存在的路径没有意义）' } }
Read-Step '规范化绝对路径' { (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path }
Read-Step '是否重解析点（junction/符号链接）' {
    $a = (Get-Item -LiteralPath $Path -Force).Attributes
    if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { "是（$a）—— 穿透前先确认目标" } else { "否（$a）" }
}

# ② ACL 四段分开读：DACL / owner / 组 / SACL。"ACL 已排除"必须点名排的是哪一段
Read-Step 'DACL（访问控制项逐条）' {
    $acl = Get-Acl -LiteralPath $Path
    ($acl.Access | ForEach-Object { "{0}/{1}/{2}" -f $_.IdentityReference, $_.AccessControlType, $_.FileSystemRights }) -join ' ; '
}
Read-Step 'Owner / Group（归属）' {
    $acl = Get-Acl -LiteralPath $Path
    "owner={0}；group={1}" -f $acl.Owner, $acl.Group
}
Read-Step 'SACL（审计项；需 SeSecurityPrivilege，读不到属正常）' {
    $acl = Get-Acl -LiteralPath $Path -Audit
    ($acl.Audit | ForEach-Object { "{0}/{1}" -f $_.IdentityReference, $_.AuditFlags }) -join ' ; '
}

# ③ 健康对照样本：同一条读法读 Reference（默认 %TEMP%）。没有对照样本的"读不到"无法归因
Write-Host ("---- 健康对照样本：{0} ----" -f $Reference)
Read-Step '对照样本可读' { if (Test-Path -LiteralPath $Reference) { (Resolve-Path -LiteralPath $Reference).Path } else { '对照样本自身不存在' } }

# ④ 进程与命令行走的通道（注入类参数先验通道：哨兵有没有真的进命令行）
Read-Step '宿主进程（DSH / Electron 家族）与命令行' {
    $procs = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^(dsh|electron|node)' })
    if ($procs.Count -eq 0) { '未命中（换更宽的过滤条件前先确认这是不是你要查的宿主）' }
    else { ($procs | ForEach-Object { "{0}({1})" -f $_.Name, $_.ProcessId }) -join ' ; ' }
}

Write-Host ""
Write-Host ("envcheck：{0} 类读数取到；{1} 类读不到" -f '(见上逐行)', $bad)
if ($bad -gt 0) {
    Write-Host '读数不完整：先按 C1 红灯三问确认仪器（路径对吗 / 权限对吗 / 最小复现还红吗），再下结论' -ForegroundColor Red
    exit 1
}
Write-Host '三类读数齐（**不代表"没问题"**——本脚本只报读数，判断在 6-2 卡的定位手法里）'
exit 0
