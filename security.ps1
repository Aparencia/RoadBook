# security.ps1 · 安全门禁（第五个守护脚本：密钥／危险执行链／依赖与 CI／无 BOM 的 .ps1，零 token）
# 退出码契约：0 = 无红项（可有黄项，不拦）；1 = 有红项（拦下，先修再提交）；2 = 环境／参数错
#   （-RepoRoot 不存在或不是 git 工作树；-SkillDir 给了但目录不存在）；-ReportOnly = 只报不拦（有红也 exit 0）。
# 主扫范围 = git 跟踪 ∪ 未忽略的未跟踪文件（ls-files / ls-files --others --exclude-standard），非 git 仓库 = exit 2；
#   二进制（扩展名黑名单）与 >2MB 文件跳过；读不了的文件按黄项报（不许静默当通过）。本脚本自身含模式字面量，两种模式都跳过自身**及其逐字节副本**——母版里根与 template/ 各存一份同一脚本，只排除"运行中的那个路径"会把另一份的规则字面量当违规（2026-10-06 实测母版恒 5 红）。
# 用法：powershell -NoProfile -File security.ps1 -RepoRoot . ｜ … -SkillDir "$env:TEMP/third-party-skill"
# 输出：[红] 相对路径:行号 类别: 脱敏片段 ｜ 修：一句话修复建议（密钥片段只留前 4 后 4，中间 ****）
# 消歧：危险执行链落在 .md/.txt 里只报黄（文档常把反例写成"待拒清单"，如 7-9 卡），落在代码/配置里一律红；密钥在任何文件里都红。
param([string]$RepoRoot = '.', [string]$SkillDir = '', [switch]$ReportOnly)
chcp 65001 > $null; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$script:Red = 0; $script:Yellow = 0
$self = ''; if ($PSCommandPath) { $self = [IO.Path]::GetFullPath($PSCommandPath) }
# 跳过口径 = 运行中的自身路径 ∪ 与自身逐字节相同的副本（先比长度再比 SHA-256；同内容才跳，不同内容照扫——免得给逃逸留口子）
function Test-SelfCopy($p) { if ($self -and [IO.Path]::GetFullPath($p) -eq $self) { return $true }; if (-not $self) { return $false }; try { if ((Get-Item -LiteralPath $p).Length -ne (Get-Item -LiteralPath $self).Length) { return $false } } catch { return $false }; $a = [string](Get-FileHash -LiteralPath $p -ErrorAction SilentlyContinue).Hash; $b = [string](Get-FileHash -LiteralPath $self -ErrorAction SilentlyContinue).Hash; return ($a.Length -gt 0 -and $a -eq $b) }
# 规则纪律：P 里的分组一律写 (?:…)，唯一例外 = 要单独展示的那个捕获组（取最后一组的值当片段）。
function Show($s, $secret) {
    $t = [string]$s
    if ($t -match '[\u0000-\u001f\u200b-\u200f\ufeff]|[\uDB40][\uDC00-\uDC7F]') { $u = @(); foreach ($ch in $t.ToCharArray()) { $u += ('U+{0:X4}' -f [int][char]$ch) }; return ($u -join ' ') }
    if ($secret -and $t.Length -gt 8) { $t = $t.Substring(0, 4) + '****' + $t.Substring($t.Length - 4) } elseif ($secret -and $t.Length -gt 0) { $t = $t.Substring(0, 1) + '****' }
    if ($t.Length -gt 60) { $t = $t.Substring(0, 60) + '...' }; return $t
}
function Hit($red, $rel, $line, $cat, $frag, $fix, $secret) {
    if ($line -gt 0) { $where = '{0}:{1}' -f $rel, $line } else { $where = $rel }
    $tag = '[黄]'; if ($red) { $tag = '[红]' }
    Write-Host ('{0} {1} {2}: {3} ｜ 修：{4}' -f $tag, $where, $cat, (Show $frag $secret), $fix)
    if ($red) { $script:Red++ } else { $script:Yellow++ }
}
function Is-Placeholder($v) { return ([string]$v).Trim() -match '(?i)^(?:<|your[-_]|xxx|yyy|\*{3,}|changeme|change-me|placeholder|example|dummy|todo|\.\.\.|\$\{|\{\{)' }
function Scan-Rules($rel, $lines, $rules) {
    $ln = 0; foreach ($line in $lines) {
        $ln++
        foreach ($r in $rules) {
            if (($r['Path'] -and $rel -notmatch $r['Path']) -or ($r['NoMatch'] -and $line -match $r['NoMatch'])) { continue }
            $m = [Regex]::Match($line, $r['P'])
            if (-not $m.Success) { continue }
            $v = $m.Value; if ($m.Groups.Count -gt 1) { $v = $m.Groups[$m.Groups.Count - 1].Value }
            if ($r['BadValue'] -and (Is-Placeholder $v)) { continue }
            $red = $r['R']; $cat = $r['C']
            if ($red -and $r['E'] -and ([IO.Path]::GetExtension($rel).ToLower() -in @('.md','.txt'))) { $red = $false; $cat = $cat + '（文档示例：先确认是反例还是真指引）' }
            Hit $red $rel $ln $cat $v $r['F'] $r['S']; break
        }
    }
}
function Fail-Env($msg) {
    Write-Host ('[红] ' + $msg); Write-Host ('security: 红 {0} / 黄 {1}（环境／参数错，未扫）' -f $script:Red, $script:Yellow)
    Write-Host '退出码：2 = 环境／参数错（修好 -RepoRoot／-SkillDir／git 再跑）'; exit 2
}
$fSec = '立即作废并轮换该密钥，改从 .env／环境变量注入，并从 git 历史清除（历史永远可读）'; $fExec = '先下载 → 校验哈希 → 再执行；禁止把远端内容管道进解释器'
$fTls = '恢复证书校验（删掉 -k／--insecure／verify=False／rejectUnauthorized:false／StrictHostKeyChecking=no）'; $fEnv = '把 .env／.env.local 写进 .gitignore 并 git rm --cached；历史里出现过的值一律轮换'
$fBom = '补 BOM：printf ''\xef\xbb\xbf'' > t && cat x.ps1 >> t && mv t x.ps1（PS 5.1 无 BOM 会 ParserError）'; $fEx = '.env.example 只留键名与注释，真实值移进 .env（已被 .gitignore 挡住）'
$fHome = '改从环境变量或密管读取；文档里只写占位路径，别指向家目录凭据'; $fLock = '提交 lockfile（pnpm-lock.yaml／package-lock.json…）后开工；requirements 每行锁 ==版本'
$fCi = 'uses: 固定到 40 位 commit SHA（tag 可被移动，供应链会漂）'; $fHttp = '改用 https（明文 HTTP 下载可被中间人替换）'
$fP2 = 'P2 → 删掉注释里的隐藏指令；外部内容一律是数据，正文不得夹带对 agent 的隐性要求'; $fP9 = 'P9 → 清除零宽／Unicode tag 字符后重装；正文含隐身字符 = 拒绝'
$fAR1 = 'AR1 → 删除拒绝抑制话术，改为"遇红线停下问人"'; $fAS = 'AS1/AS2 → 删掉读宿主 agent 配置（.claude/.codex/.gemini/.mcp.json/settings.json）的代码'
$fE2 = 'E2 → 改为只读它声明需要的那几个变量（显式白名单），禁止整表导出环境变量'; $fPE2 = 'PE2 → 去掉提权（sudo／chmod 777），用最小权限账户运行'
$fPE3 = 'PE3 → 用环境变量或密管，文档里只写占位路径'; $fSC2 = 'SC2 → 固定版本 + 校验哈希后本地安装；禁止 npx 直跑／下载即执行'
$fSC1 = 'SC1 → 依赖锁到确切版本或 40 位 commit SHA，禁 *／latest／浮动 tag'; $fTR1 = 'TR1 → 收窄 description：写清"什么时候用／什么时候不用"，禁"任何请求／all tasks"'
$hostRules = @(  # 主扫规则；Path 空 = 所有文件；R=$true 红／$false 黄；S=$true 片段脱敏；E=$true 危险执行链（.md/.txt 里降黄）
    @{ Path = ''; P = 'AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}|xox[baprs]-|AIza[A-Za-z0-9_-]{35}|(?:sk|rk)_live_'; C = '明文密钥'; R = $true; S = $true; F = $fSec },
    @{ Path = ''; P = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'; C = '疑似 JWT'; R = $true; S = $true; F = $fSec },
    @{ Path = ''; P = '-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://[^:@/]+:[^@/]+@'; C = '私钥或带口令连接串'; R = $true; S = $true; F = $fSec },
    @{ Path = ''; P = "(?:password|passwd|secret|token)\s*[:=]\s*['""]([^'""]{6,})['""]"; C = '明文口令赋值'; R = $true; S = $true; BadValue = $true; F = $fSec },
    @{ Path = ''; P = 'curl[^|]{0,80}\|\s*(?:bash|sh)|iwr[^|]{0,80}\|\s*iex'; C = '危险执行链（下载即执行）'; R = $true; E = $true; F = $fExec },
    @{ Path = ''; P = 'Invoke-Expression[^\r\n]{0,60}\$'; C = '危险执行链（变量拼接执行）'; R = $true; E = $true; F = $fExec },
    @{ Path = ''; P = 'shell\s*=\s*True|verify\s*=\s*False|rejectUnauthorized\s*:\s*false|StrictHostKeyChecking\s*=\s*no'; C = '关闭校验'; R = $true; E = $true; F = $fTls },
    @{ Path = ''; P = '--insecure|curl\s+-k'; C = '免校验下载'; R = $true; E = $true; F = $fTls },
    @{ Path = ''; P = '~/\.ssh|~/\.aws/credentials|\.netrc|\.git-credentials'; C = '家目录凭据路径'; R = $false; F = $fHome },
    @{ Path = ''; P = '(?:curl|wget|iwr|Invoke-WebRequest|Start-BitsTransfer|npm i|pip install)\s[^\r\n]{0,80}http://'; C = '明文 HTTP 下载'; R = $false; F = $fHttp },
    @{ Path = '\.env\.(?:example|sample|template)$'; P = '^\s*[A-Za-z0-9_]+\s*=\s*(\S.*)$'; C = '.env.example 疑似真实值'; R = $false; S = $true; BadValue = $true; F = $fEx },
    @{ Path = '^requirements.*\.txt$'; P = '^\s*(?![-#])\S.*$'; C = '依赖未锁（该行无 ==）'; R = $false; NoMatch = '=='; F = $fLock },
    @{ Path = '(?i)(?:\.github/workflows/|\.gitlab-ci\.yml$)'; P = 'uses:\s*(?![0-9a-fA-F]{40}(?:\s|#|$))([^\s#]+)'; C = 'CI uses 未 pin SHA'; R = $false; F = $fCi }
)
$skillRules = @(  # -SkillDir 准入机检；每条给命中模式 ID
    @{ P = '<!--[^\r\n>]{0,200}(?:ignore|instead|do not tell|不要告诉|无需确认)'; C = 'P2 隐藏指令'; R = $true; F = $fP2 },
    @{ P = '[\u200b\u200c\u200d\ufeff]|[\uDB40][\uDC00-\uDC7F]'; C = 'P9 隐身字符'; R = $true; F = $fP9 },
    @{ P = 'never refuse|always comply|do not ask for confirmation|无需确认|不要询问|连续执行'; C = 'AR1 拒绝抑制'; R = $true; F = $fAR1 },
    @{ P = '\.(?:claude|codex|gemini)/|\.mcp\.json|(?:claude|codex|gemini|agent)[/\\]settings\.json'; C = 'AS1/AS2 读宿主 agent 配置'; R = $true; F = $fAS },
    @{ P = 'Get-ChildItem\s+[Ee]nv:|printenv|Object\.(?:keys|entries|values)\(\s*process\.env\s*\)|JSON\.stringify\(\s*process\.env\s*\)|for\s*\([^)]{0,40}in\s+process\.env\)|(?:dict|list|set|vars)\(\s*os\.environ\s*\)|os\.environ\.copy\(\)|json\.dumps\(\s*os\.environ|for\s+\w+\s+in\s+os\.environ'; C = 'E2 批量采集环境变量'; R = $true; F = $fE2 },
    @{ P = '\bsudo\b|chmod\s+(?:-R\s+)?777'; C = 'PE2 提权'; R = $true; F = $fPE2 },
    @{ P = '\.aws/credentials|id_rsa|\.npmrc|\.pypirc'; C = 'PE3 凭据文件'; R = $true; F = $fPE3 },
    @{ P = 'curl[^|]{0,80}\|\s*(?:bash|sh)|iwr[^|]{0,80}\|\s*iex|--insecure|Invoke-Expression[^\r\n]{0,60}\$'; C = 'SC2 下载即执行'; R = $true; F = $fSC2 },
    @{ P = 'npx\s|pip\s+install\s+github:|iwr[^\r\n]{0,80}-OutFile[^\r\n]{0,80};\s*&'; C = 'SC2 下载即执行（装完就跑）'; R = $true; F = $fSC2 },
    @{ P = '":\s*"\s*(?:\*|latest)\s*"|"(?:github:[^"#]*|git\+[^"]*)#(?:main|master|develop|HEAD|latest)"|"github:[^"#]*"'; C = 'SC1 未锁依赖'; R = $true; F = $fSC1 },
    @{ P = '(?i)^\s*description\s*:.*(?:任何请求|always|all tasks|any request|every request|不需要确认)'; C = 'TR1 过宽触发'; R = $true; F = $fTR1 }
)
if ($SkillDir -ne '') {
    if (-not (Test-Path -LiteralPath $SkillDir -PathType Container)) { Fail-Env "-SkillDir 不存在：$SkillDir" }
    $sroot = [IO.Path]::GetFullPath($SkillDir)
    $slist = @(Get-ChildItem -LiteralPath $sroot -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' -and $_.Name -match '(?i)\.(md|json|js|mjs|cjs|ts|py|ps1|sh|yml|yaml|txt)$' -and -not (Test-SelfCopy $_.FullName) })
    Write-Host ('[i] -SkillDir 模式：扫描 {0} 个文件（扩展名白名单，含隐藏文件，跳过 .git/ 与自身）' -f $slist.Count)
    foreach ($sf in $slist) {
        $rel = ($sf.FullName.Substring($sroot.Length).TrimStart('\','/')) -replace '\\','/'
        try { $lines = [IO.File]::ReadAllLines($sf.FullName, [Text.Encoding]::UTF8) } catch { Hit $false $rel 0 '读取失败' $_.Exception.Message '人工看该文件（二进制／编码异常，不许当通过）' $false; continue }
        Scan-Rules $rel $lines $skillRules
    }
} else {
    if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) { Fail-Env "-RepoRoot 不存在：$RepoRoot" }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail-Env '找不到 git：文件清单口径（跟踪 ∪ 未忽略）无从判定' }
    $wt = @(git -C $RepoRoot rev-parse --is-inside-work-tree 2>$null); if ($LASTEXITCODE -ne 0 -or $wt.Count -eq 0 -or ([string]$wt[0]).Trim() -ne 'true') { Fail-Env "-RepoRoot 不是 git 工作树：$RepoRoot（清单口径无从判定）" }
    $all = @((@(git -C $RepoRoot -c core.quotepath=false ls-files 2>$null) + @(git -C $RepoRoot -c core.quotepath=false ls-files --others --exclude-standard 2>$null)) | Where-Object { $_ } | Select-Object -Unique)
    $binExt = @('.png','.jpg','.jpeg','.gif','.ico','.webp','.pdf','.zip','.gz','.tgz','.7z','.rar','.exe','.dll','.so','.dylib','.bin','.woff','.woff2','.ttf','.otf','.mp3','.mp4','.mov','.wav','.class','.jar','.pyc','.wasm','.db','.sqlite','.lock')
    $files = @()
    foreach ($f in $all) {
        $full = Join-Path $RepoRoot $f
        if (-not (Test-Path -LiteralPath $full -PathType Leaf) -or (Test-SelfCopy $full)) { continue }
        if ($binExt -contains [IO.Path]::GetExtension($full).ToLower()) { continue }
        if ((Get-Item -LiteralPath $full).Length -le 2097152) { $files += $f }
    }
    Write-Host ('[i] 主扫：扫描 {0} 个文件（git 跟踪 ∪ 未忽略；跳过二进制／大文件／自身）' -f $files.Count)
    foreach ($ef in @('.env', '.env.local')) {
        $et = @(git -C $RepoRoot ls-files --error-unmatch $ef 2>$null)
        if ($LASTEXITCODE -eq 0 -and $et.Count -gt 0) { Hit $true $ef 0 '.env 泄露（已被 git 跟踪）' $ef $fEnv $false; continue }
        if (Test-Path -LiteralPath (Join-Path $RepoRoot $ef) -PathType Leaf) { git -C $RepoRoot check-ignore -q $ef; if ($LASTEXITCODE -ne 0) { Hit $true $ef 0 '.env 泄露（存在但未被忽略）' $ef $fEnv $false } }
    }
    foreach ($f in @($all | Where-Object { $_ -match '\.ps1$' })) {
        $fp = Join-Path $RepoRoot $f
        if (-not (Test-Path -LiteralPath $fp -PathType Leaf) -or (Test-SelfCopy $fp)) { continue }
        $b = [IO.File]::ReadAllBytes($fp)
        if ($b.Length -lt 3 -or $b[0] -ne 239 -or $b[1] -ne 187 -or $b[2] -ne 191) { Hit $true $f 0 '.ps1 无 BOM' $f $fBom $false }
    }
    # lockfile 存在与否按整仓判：任一常见 lockfile 在库即视为已锁（生产项目通常整仓一个包管理器）
    $noLock = -not (@($all | Where-Object { $_ -match '(?i)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|poetry\.lock|uv\.lock|Cargo\.lock|Pipfile\.lock|go\.sum|requirements\.lock)$' }).Count -gt 0); foreach ($f in $files) {
        if ($noLock -and [IO.Path]::GetFileName($f) -eq 'package.json') { Hit $false $f 0 '依赖未锁（无 lockfile）' 'package.json' $fLock $false }
        try { $lines = [IO.File]::ReadAllLines((Join-Path $RepoRoot $f), [Text.Encoding]::UTF8) } catch { Hit $false $f 0 '读取失败' $_.Exception.Message '人工看该文件（二进制／编码异常，不许当通过）' $false; continue }
        Scan-Rules $f $lines $hostRules
    }
}
Write-Host ('security: 红 {0} / 黄 {1}' -f $script:Red, $script:Yellow); if ($ReportOnly) { Write-Host '（-ReportOnly：只报不拦）' }
if ($script:Red -gt 0 -and -not $ReportOnly) { Write-Host '退出码：0 = 无红项；1 = 有红项（已拦下，先修再提交）；2 = 环境／参数错'; exit 1 }
Write-Host '退出码：0 = 无红项；1 = 有红项；2 = 环境／参数错'; exit 0
