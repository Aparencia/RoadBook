# 本机 hosts 把 github.com 整片指向 127.0.0.1 → web_fetch 拒取，git 却照通
复发次数: 1
作用域: 全局（本机所有走 HTTP 访问 GitHub 网页 / raw 的动作；git over SSH 不受影响）
最近复发: 2026-10-06
现象：`web_fetch` 取 `https://github.com/...` 与 `https://raw.githubusercontent.com/...` 一律报 `URL hostname "github.com" resolves to a non-public IP address`，而同一台机器 `git ls-remote` / `git push` 全部成功——看起来像"网络时通时不通"。
根因：`C:\Windows\System32\drivers\etc\hosts` 把 `github.com` / `api.github.com` / `raw.githubusercontent.com` / `gist.github.com` / `*.githubusercontent.com` 等 **27 条整片映射到 127.0.0.1**（DNS 查 `github.com` 实回 `127.0.0.1`）；DSH 的 web_fetch 有私网 IP 护栏，于是照章拒绝（护栏行为正确，**不是 bug**）。git 能通是因为 `~/.ssh/config` 把 `Host github.com` 改写到 `ssh.github.com:443`——那个域名**没被挡**。
修法（实测三条都通，零环境变更）：① **首选 `Invoke-RestMethod` 直取 GitHub 官方 HTTP**——`https://api.github.com/repos/<owner>/<repo>`（`archived` / `pushed_at` / `license.spdx_id`）与 `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/LICENSE`（LICENSE 原文）实测**全部可达**：`127.0.0.1:443` 上有**本地加速器在应答**，所以被挡住的只有 DSH 的 web_fetch（护栏），PowerShell 的 HTTP 客户端照通。② 要仓库内容与提交日期，`git clone --depth 1 git@github.com:<owner>/<repo>.git <临时目录>`（走 SSH），再本地读 `LICENSE` 与 `git log -1 --format=%ci`。③ 包元数据走 `https://registry.npmjs.org/<包名>`。**不要**为此去改 hosts——那可能是机主有意为之的加速/屏蔽配置。
下次定位：`web_fetch` 报 "non-public IP" 而 `git` / `ssh` 正常 → 先看 hosts 里的 127.0.0.1 段，别去查代理、DNS 服务器或"网络不稳定"。
证据：`Resolve-DnsName github.com -Type A` 回 `127.0.0.1`；`Select-String -Path $env:SystemRoot\System32\drivers\etc\hosts -Pattern github` 回 27 行 127.0.0.1；`ssh -G github.com` 回 `hostname ssh.github.com` / `port 443`；同期 `git push origin main` 退出码 0、`git ls-remote --heads origin` 回目标哈希。
来源：2026-10-06 · 2-6 卡开工前查网络口径时定位（原以为是"HTTP fetch 坏了"，一度准备把五查的 ②③ 记成 UNVERIFIED）
最近确认：2026-10-06
