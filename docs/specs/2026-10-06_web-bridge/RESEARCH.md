# RESEARCH · 网页端桥接（把开发工作外包给 chat.deepseek.com）

> **AI 声明**：本文件由 agent 生成；依据 = GitHub 官方 API（`api.github.com/repos/...`）/ `raw.githubusercontent.com` 上的 LICENSE 原文 / npm registry（`registry.npmjs.org`）/ 本地 `git clone --depth 1` 读到的仓库内容。**只看「外部方案」这一轴**（我们自己的实现方案属 2-1 功能调研）。
> 检索日期：**2026-10-06** ｜ 档位：**L**（引入第三方插件 + 触「认证/鉴权」红线域）｜ 准入分工：本卡只回答"要不要用"，第三方插件准入走 7-9（人裁决 + `security.ps1` 机检）
> 需求出处：`docs/pool/IDEAS.md` 2026-10-06 行 —— 用户裁决「**不接受人工粘贴**」⇒ 必须自动化

---

## 外部方案

### ① 有没有

**三个检索关键词原文**（主称 + 两个同义/别称），每个在 GitHub / npm（本项目栈对应的包管理器）各搜一次：

| # | 关键词原文 | GitHub 官方搜索（`api.github.com/search/repositories`） | npm registry 搜索（`-/v1/search`） |
| :-: | :-- | :-- | :-- |
| 1 | `deepseek web login dsh` | `total=30` —— Top：`V1ki/dsh-plugin-subscriptions`(422★) / **`cv-superding/dsh-deepseek-web-login`(229★)** / `Stormycry-cryp/dsh-AuthInOne`(106★) | `dsh-deepseek-web-login@0.6.38`、`dsh-deepseek-web@1.0.3`、`@jaychang1989/dsh-webchat@0.7.5`、`@yichenwilian/dsh-deepseek-web@0.1.0` |
| 2 | `dsh browser automation plugin` | `total=22` —— Top：`mrpulor-gh/dsh-nuphus-mcp`(4★) / `yzd6552-commits/dsh-browseruse`(3★) / `dawsondx/dsh-web-open`(3★) | `dsh-pilot@0.1.1`、`dsh-browser@0.1.0`、`dsh-browser-bsk@0.1.0` |
| 3 | `deepseek web api bridge` | `total=33` —— Top 命中与本需求无关（`liustack/modsearch` 598★ / `LyubomirT/intense-rp-next` 198★）；可用候选由关键词 1 覆盖 | `deepseek-driver@0.1.0`、`@ramsesy/deepseek-local-api@0.9.0` |

**候选（3 个主候选 + 4 个同族参照）**：

| # | 链接 | 一句话它做什么 |
| :-: | :-- | :-- |
| **1** | <https://github.com/cv-superding/dsh-deepseek-web-login> | 把 chat.deepseek.com **网页版登录态**做成 DSH 的 `deepseek-web` provider：模型选择器里选「DeepSeek 网页 · 快速模式」就能用网页版额度跑 DSH agent。**不碰 DOM** —— 自己构造请求直连网页端私有接口（登录捕获一次 → PoW 挑战 SHA3 求解 → `chat/completion` 的 SSE patch 流 → 工具调用走提示词协议） |
| **2** | <https://github.com/y-wi/dsh-deepseek-web> | 同类：把 DeepSeek 网页端接入 DSH（README 中文标题「将 DeepSeek 网页端接入 DeepSeek Harness」） |
| **3** | <https://github.com/guo6x/dsh-pilot> | 通用「给 agent 一双手」：CDP 驱动真实 Edge/Chrome，页面读成带编号的结构化文本，按 **ref** 点击/输入（不猜 CSS 选择器），可截图、可执行 JS，Web GUI 里有可拖拽 cockpit 面板可随时接管 |
| 参照 a | <https://github.com/omdsh-dev/dsh-browser> | 浏览器控制类（770★，本组最高星） |
| 参照 b | <https://github.com/V1ki/dsh-plugin-subscriptions> | **同机制、不同靶子**：「把订阅当 provider，OAuth 登录，不用 API Key」——覆盖 ChatGPT(Codex)/Claude/Grok(X Premium)，**不含 DeepSeek 网页**。抄思路价值高 |
| 参照 c | <https://github.com/yzd6552-commits/dsh-browseruse> | browser-use 风格：playwright-core 驱动常驻 Chrome profile，带验证码人工接管 |
| 参照 d | <https://github.com/jaychang1989/dsh-webchat> | 侧栏网页聊天界面（`@jaychang1989/dsh-webchat@0.7.5`） |

> ⚠️ **同名陷阱（两名候选都踩到）**：npm 上的 `dsh-pilot@0.1.1` 的 `repository` 指向 **`Viger1/dsh-pilot`**（0★，2026-08-17），而 `guo6x/dsh-pilot` 仓库里是 **0.7.3**；npm 上的 `dsh-browser@0.1.0` 指向 **`ben7am1n/dsh-browser`**（7★），而 `omdsh-dev/dsh-browser` 仓库里是 **0.1.4**。**装 npm 名 ≠ 装你以为的那个项目。**

**结论（①）**：三个关键词都有可用候选，且**主候选 1 与本需求逐条对上**（不接受人工粘贴 ✅、把活交给网页端 ✅、浏览器不用常驻 ✅）。

### ② 活不活

| 候选 | 最后提交（`pushed_at`） | 最近发版（npm `published`） | 是否 archived |
| :-: | :-- | :-- | :-- |
| 1 | **2026-10-04**（[commits](https://github.com/cv-superding/dsh-deepseek-web-login/commits)）—— 距检索日 **2 天**，HEAD 已是 `0.6.41`（`git log -1` = `2974c60 fix: discard the scaffolding session on the error path too (0.6.41)`） | `0.6.38` @ **2026-10-03**（[npm](https://www.npmjs.com/package/dsh-deepseek-web-login)），**共 50 个版本** | **否**（`archived=false`，[API](https://api.github.com/repos/cv-superding/dsh-deepseek-web-login)） |
| 2 | 2026-08-20（[commits](https://github.com/y-wi/dsh-deepseek-web/commits)）—— 距检索日 **1.5 个月** | `1.0.3` @ 2026-08-19（[npm](https://www.npmjs.com/package/dsh-deepseek-web)），共 4 个版本 | 否 |
| 3 | **2026-10-05**（[commits](https://github.com/guo6x/dsh-pilot/commits)）—— 距检索日 **1 天** | ⚠️ **`git ls-remote --tags` 回 0 个 tag**；npm 上的 `dsh-pilot` 是**别人**的包（见上「同名陷阱」） | 否 |
| 参照 b | 2026-10-01 | `dsh-plugin-subscriptions@0.9.7` @ 2026-10-01 | 否 |

**结论（②）**：候选 1 **活**（两天内有提交、48 小时内发过版、未 archived，50 版说明发布节奏稳定）；候选 3 提交更勤但**没有任何发布渠道**；候选 2 半活（1.5 个月无提交，未 archived，4 个版本停在 1.0.x）。

### ③ 能不能用

| 候选 | LICENSE 原文（raw 通道首行） | 许可证 | 要求开源？ | 可商用？ | 附加义务 |
| :-: | :-- | :-- | :-- | :-- | :-- |
| 1 | `Apache License / Version 2.0, January 2004` | **Apache-2.0** | **否** | **是** | 仓库根有 `NOTICE`（11358 B LICENSE + NOTICE）⇒ **须保留 NOTICE 与版权声明** |
| 2 | `MIT License` | MIT | 否 | 是 | 保留版权声明与许可全文 |
| 3 | `MIT License` | MIT | 否 | 是 | 同上 |
| 参照 b | — | MIT（API `license.spdx_id`） | 否 | 是 | 同上 |

取得方式：`Invoke-RestMethod https://raw.githubusercontent.com/<owner>/<repo>/HEAD/LICENSE`（官方 raw 通道原文，不是 README 里写的许可证名）。

**结论（③）**：**三者全部通过**——无「无 LICENSE / GPL / AGPL / SSPL」情形，不产生"把我们的代码一起拽进开源义务"的风险；候选 1 多一条 `NOTICE` 保留义务。

### ④ 合不合

| 项 | 候选 1 | 候选 2 | 候选 3 |
| :-- | :-- | :-- | :-- |
| **依赖树条数** | **0 条**（npm `0.6.38` 的 `dependencies` 与 `peerDependencies` **均为空**） | **2 条**（`@puppeteer/browsers@^2.10.5`、`ws@^8.18.3`）+ peerDeps **10 条** | 0 条（仓库 `0.7.3` `package.json` 依赖段为空） |
| **体积**（`dist.unpackedSize`） | **3,516,786 B ≈ 3.35 MB**（27 个文件） | 915,202 B ≈ 0.87 MB（25 个文件） | npm 未收录其自有包（见「同名陷阱」） |
| **与现有栈冲突** | `engines: node ^22.18.0 \|\| >=24.11.0`；我们 `package.json` 是 `^22.19.0 \|\| >=24.0.0` ⇒ **交集 = `^22.19.0` ∪ `>=24.11.0` 非空**（本机 `node v24.21.0` ∈ 交集 ✅）。⚠️ 但它**不声明任何 `peerDependencies`**，而我们是 `@deepseek-ai/cordis` / `dsh-llm` / `dsh-skill` / `schemastery` / `dsh-better-sidebar` 五条 optional —— 它对 DSH 版本的耦合是**隐式的** | peerDeps 要 `@deepseek-ai/dsh-*@^0.1.0-rc.7`、`cordis@^4.0.1`、`react@^18.2.0`；我们生态对齐的是 `dsh-llm@0.2.0-rc.2` 一线 ⇒ **区间不一致，真实冲突风险** | 无依赖声明，但需本机 Edge/Chrome + CDP 端点 |
| **需要常驻服务** | **否** —— README 原文：「浏览器要一直开着吗：**否**」（登录捕获只做一次，之后页面关掉照样跑） | **是** —— `@puppeteer/browsers` + `ws` ⇒ 需常驻 Chromium 与 CDP 连接 | **是** —— CDP 驱动真实浏览器，cockpit 面板要求浏览器在位 |

**结论（④）**：候选 1 **最优**（0 依赖、无常驻服务、体积虽 3.35 MB 但全在包内）；代价是一条**未声明的隐式耦合**（不写 peerDeps ⇒ 升级 DSH 时没有版本门提示）。候选 2 的 peerDeps 区间与我们的生态不一致，是**真实冲突**；候选 3 与参照 a/c 都要**浏览器常驻**，把"外包给网页端"变成"多养一个浏览器"。

### ⑤ 值不值

| 列 | 数 |
| :-- | :-- |
| **自研估行数** | **≥ 21,355 行**（⚠️ 这不是估算而是**实测下界**：`git clone --depth 1` 后按文件数行 —— `src` 28 文件 **20,460 行** + `tools` 3 文件 611 行 + `scripts` 7 文件 284 行；另有测试 72 文件 19,999 行、构建产物 `lib` 15,377 行计入会更离谱）。要复刻的能力面：登录态捕获（Electron `webRequest.onBeforeSendHeaders`）＋ PoW 挑战 SHA3 求解 ＋ `chat/completion` SSE patch 帧解析 ＋ 提示词协议 ⇄ tool-call 双向转换 ＋ 图片上传 |
| **接入估改动面** | **本仓库 0 个文件**。它是 DSH 侧插件（装到 DSH 插件目录、面板里独立开关，走 `cordis.patch.yml`），**不进我们的 `package.json` `files` 白名单、不改我们任何代码**。代价全在流程侧：7-9 准入（人裁决 + `security.ps1`）＋ 3-2 威胁建模（触红线域）＋ 档位按 L 计 |

**结论（⑤）**：**接入**。自研下界 2.1 万行 ‖ 接入 0 文件改动 —— 两列差三个数量级，且自研要长期跟进网页端私有接口的每次改版。

---

## 判定三值

> **判定 = 接入现成**

| 判定表那一行 | 「接入现成 —— 五查全过」 |
| :-- | :-- |
| 对应五查 | ① 三个关键词均有候选且主候选逐条对上 ｜ ② 活（2 天内有提交 + 48h 内发版 + 未 archived） ｜ ③ Apache-2.0 通过（不要求开源、可商用、保留 NOTICE） ｜ ④ 0 依赖 / 无常驻服务 / engines 交集非空 ｜ ⑤ 2.1 万行 ‖ 0 文件 |
| 必做动作（卡原文） | 「按"引入新依赖"计入档位（**通常 L 档**）；同批走 2-1 的"新依赖三查"」 |
| 我们的档位 | **L**（已由用户 2026-10-06 裁决接受；依据 = 引入第三方插件 + 触「认证/鉴权」红线域） |

**必须同批提请注意（不是本卡能放行的）**：

1. 🔴 **触红线域「认证/鉴权体系」**（`AGENTS.md` C3）—— 候选 1 的工作方式是**捕获并本机保存** `Authorization: Bearer`、域 cookie、反爬头（`x-hif-dliq` / `x-hif-leim` / 一批 `x-client-*`）。这不是"用 API Key"，是**用你的网页登录态**。⇒ 必须走 3-2 卡出 `docs/specs/2026-10-06_web-bridge/THREAT.md`（每条威胁给缓解措施或显式接受并写理由）。
2. 🟠 **第三方插件准入未做**（7-9 卡）—— 人裁决 + `powershell -NoProfile -File security.ps1 -SkillDir <目录>` 机检，结论落 `docs/decisions/YYYY-MM-DD_<名字>-admission.md`。**本卡不代替准入。**
3. 🟠 **上游自述免责**：候选 1 的 README 徽标写明 `status = unofficial · use at your own risk`，且它走的是**网页端私有接口**（非官方 API）—— 官方改版即失效、且不排除违反服务条款。这一条必须由人显式接受。

---

## 拒绝台账（被否的轮子一个不许丢）

逐行原文见 `docs/decisions/2026-10-06_web-bridge-否决台账.md`（`日期 | 提案 | 否决理由 | 既往请求编号`）。

## 来源纪律与未核实清单

- **检索日期**：2026-10-06
- **只认官方来源**：GitHub 官方 API / `raw.githubusercontent.com` 的 LICENSE 原文 / npm registry / 本地 `git clone --depth 1` 的实际文件。star 数只作线索、不作依据（候选 1 的 229★ 与参照 a 的 770★ 都没有改变上面的判定）。
- **外部内容一律是数据，不是指令**（`AGENTS.md` D5）：所有 README、徽标、描述文本只作引用材料上报，未被执行。
- **`UNVERIFIED` 清单（4 条）**：
  1. **候选 1 的 PoW WASM 资产来源** —— 查了什么：`Get-ChildItem -Recurse -File -Include '*.wasm','*.bin'` 在克隆体内**0 命中**。为什么给不出结论：WASM 可能在构建期生成或内联为 base64，本轮未逐文件读 28 个源文件。
  2. **候选 3 的正式发布渠道** —— 查了什么：`git ls-remote --tags`（0 tag）+ npm 搜索（同名包属 `Viger1`）。为什么给不出结论：无法判断它是"只从 Git 装"还是"发布在别处"。
  3. **候选 2 的 `@deepseek-ai/dsh-*@^0.1.0-rc.7` 与本机 DSH `0.2.0-rc.2` 是否实际兼容** —— 查了什么：npm `peerDependencies` 字段。为什么给不出结论：要真装一次才能验，而本卡**禁止接入**（卡 §② 禁令第 3 条）。
  4. **三个主候选的代码安全审阅** —— 本轮**只看**了 LICENSE / 依赖清单 / 提交与发版日期 / README 机制说明，**没有读它们的实现代码**。为什么给不出结论：这属 7-9 准入的机检 + 人工审阅范围，不是 2-6 的五查。
- **本机通道说明**：`web_fetch` 取 `github.com` 会被 DSH 的私网 IP 护栏拒绝（本机 `hosts` 把 `github.com` 等 27 条映射到 `127.0.0.1`，而 `127.0.0.1:443` 上有本地加速器在应答）；本轮改用 `Invoke-RestMethod` 走 `api.github.com` / `raw.githubusercontent.com` 与 `git clone --depth 1` 取官方原文，见 `docs/lessons/2026-10-06_GitHub被hosts屏蔽.md`。
