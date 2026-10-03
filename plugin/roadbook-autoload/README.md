# roadbook-autoload · Roadbook 自动加载插件

一个 Host 侧组合包（bundle）：**在 git 项目里一开口谈开发任务，就把 roadbook 技能正文注入当前回合**，不需要用户手打 `/roadbook`，也不依赖模型自己想起来。

- 注入形状与 DSH 内置「用户显式调用技能」完全一致：`source.kind = "skill-invocation"`、正文用官方 `renderSkillContent()` 渲染。
- 只注入一次、只注入给真用户会话（子代理默认不注入）、用户手打 `/roadbook` 时自动让路，不重复加载。
- 一切可判定的门控都是确定性的：不命中就不注入；注入后仍由模型按流程卡行事，插件**不替用户做裁决**。

## 触发规则（三层门控）

| 层 | 判据 | 默认 |
| --- | --- | --- |
| ① 项目 | 会话 cwd 向上能找到 `.git`（家目录自身不算项目根，也不越过家目录向上找） | 开（`requireGitRoot`） |
| ② 意图 | 用户消息命中开发意图关键词，且未命中抑制词 | 开（`mode: keyword`） |
| ③ 去重 | 本会话未注入过、本回合无同名注入、用户没手打 `/roadbook` | 开（`oncePerSession`） |

关键词与抑制词都可在配置里整体替换；`mode: always` 表示只要是 git 项目里的用户消息就注入，`mode: off` 表示完全关闭。

细则：① 家目录自身是 git 仓库（dotfiles）时**不算**项目根，而且**不越过家目录**继续向上找——否则 `%TEMP%`、家目录里一个无关的 `.git` 就会让"在项目里"判定整体失效（本机 `%TEMP%\.git` 确实存在）；② 手打 `/roadbook` 的手势允许行首与句中空白（半角空格、全角空格、Tab 都算）；③ 命中、跳过、报错都会写一行观测（见下「观测」与「升级后自检」）。

## 配置（写进本包 `cordis.patch.yml` 的 `config`）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `skills` | `["roadbook"]` | 要加载的技能名，按序取第一个能解析的 |
| `mode` | `keyword` | `keyword` / `always` / `off` |
| `keywords` | 内置开发意图词表 | 命中即注入 |
| `suppressKeywords` | 内置抑制词表 | 命中即不注入（优先于关键词） |
| `includeSubagents` | `false` | 子代理会话是否也注入 |
| `requireGitRoot` | `true` | 只在 git 项目内注入 |
| `oncePerSession` | `true` | 一次会话只注入一次 |
| `note` | `true` | 正文后附一行说明（为什么加载、怎么关） |
| `report` | `true` | 自进化 A 环：注入 / 跳过 / 报错各记一行 JSONL，`false` 完全关掉 |
| `reportPath` | `""` | 观测文件路径，空 = `<os.tmpdir()>/roadbook-autoload.jsonl`（Windows 即 `%TEMP%\roadbook-autoload.jsonl`） |
| `skillDigest` | `""` | 自进化 B 环：SKILL.md 指纹基线，变了对不上就在说明里提示 |

## 安装（GUI）

1. 侧栏打开「**插件**」页 → 「**添加插件**」。
2. 选「本地绝对路径」，填本目录（仓库里的 `plugin/roadbook-autoload`，或已 clone 的技能目录下 `roadbook/plugin/roadbook-autoload`）→ 先 `inspect` 再安装。
3. 装完点「**立即启用**」（本 profile 已开 HMR，无需重启）。
4. 新开一个会话，说一句「帮我重构一下这个模块」，当回合就应出现 roadbook 的技能正文与一行 `[roadbook-autoload]` 说明。

## 验证（四条，缺一不可）

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | git 项目里说「帮我重构一下登录模块」 | 注入 roadbook（有 `[roadbook-autoload]` 说明行） |
| 2 | 说「今天天气怎么样」 | 不注入 |
| 3 | 手打 `/roadbook 我有个想法：…` | 只注入一次（内置手势负责，插件让路） |
| 4 | 把配置改成 `mode: off` 并重新启用 | 任何消息都不再注入 |

## 升级与卸载

组合包**不会自动更新**：`git pull` 更新本仓库后，在插件页卸载再装一次即可（配置写在 `cordis.patch.yml`，重装后按需重填）。卸载即在插件页移除本组合包。

### 依赖：由宿主提供，运行时不下载

`index.js` 用到的三个宿主包写在 `package.json` 的 `peerDependencies` 里，**由 DSH 宿主提供，插件内不下载、不打包**；`peerDependenciesMeta` 全部标 `optional`，缺包只会让插件静默失效，不会把安装搞挂：

| 包 | peer 范围 | 本机取证 |
| --- | --- | --- |
| `@deepseek-ai/dsh-llm` | `0.2.0-rc.2` | 宿主 `resources/app.asar` 内 `dsh/node_modules/@deepseek-ai/dsh-llm/package.json` = `0.2.0-rc.2` |
| `@deepseek-ai/dsh-skill` | `0.2.0-rc.2` | 同上 = `0.2.0-rc.2` |
| `@deepseek-ai/schemastery` | `3.18.4` | `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/schemastery/package.json` = `3.18.4` |

范围取「本机实际安装的版本」，不写猜的版本号。

### 升级 DSH 后的自检

1. **重装依赖**：本插件在 profile 里是 `git+https` 依赖（`~/.dsh/profiles/desktop/package.json` → `"roadbook-autoload": "git+https://github.com/Aparencia/RoadBook.git"`）。宿主升级后先在 `~/.dsh/profiles/desktop` 跑一次 `pnpm install`，再重启 DSH；插件本体的更新仍走"插件页卸载 + 重装"。
2. **看观测文件**（确认注入有没有真发生）：
   ```powershell
   Get-Content "$env:TEMP\roadbook-autoload.jsonl" -Tail 5
   ```
   注入成功会出现 `{"event":"inject","skill":"roadbook","hit":"…"}`；只有 `{"event":"skip",…}` 说明被门控拦住，`reason` 直接写明是哪一层（`no-hit` / `not-git` / `once-per-session` / `subagent` / `mode-off` …）。
3. **试一轮**：在 git 项目里说「帮我重构一下这个模块」，当回合应出现技能正文 + 一行 `[roadbook-autoload]` 说明，观测文件同时多一行 `inject`。
4. **对不上时**：若启动日志报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-llm'`，就是 peer 范围与宿主版本脱节 → 按上表重新取证并改 `package.json` 后重装；若只是不注入，先在母版跑下节两个离线测试，再按「验证」四条核对门控。

## 自进化（只观测、只提示，不改卡）

| 环 | 做什么 | 默认 |
| --- | --- | --- |
| A 命中观测 | **默认写** `<os.tmpdir()>/roadbook-autoload.jsonl`（时间/会话/cwd/技能/命中词/指纹/摘要 + 每个跳过理由），供 6-6 卡体检抽样 | 开（`report: false` 关） |
| B 版本对账 | `skillDigest` 与 SKILL.md 当前指纹比对，不一致就在注入说明里提示"技能已更新" | 开（基线为空则不提示） |
| C 空转观测 | "注入了但整轮没读 playbook/*.md"记为疑似空转 | 暂不做（避免为观测加钩子） |

边界：本插件**只做注入与观测**，不自动修改流程卡、不自动改配置、不替用户裁决门禁；升级流程卡仍然走母版的 6-6 卡（流程体检）与用户确认。

## 开发与测试

```powershell
node plugin/roadbook-autoload/test/trigger.test.mjs
node plugin/roadbook-autoload/test/index.test.mjs
```

`trigger.test.mjs`：纯逻辑在 `trigger.js`（不 import 任何 dsh 包），可脱离 Harness 离线跑。`index.test.mjs`：用假 ctx / 假 skill 驱动 `agent/pre-step`，覆盖「命中关键词注入」「未命中跳过」「skills 未配置」「渲染失败不抛异常」「观测默认落盘 / `report: false` 不落盘」「oncePerSession / 子代理 / mode: off / 宿主 reject 让路」「git 门控」等分支；宿主包由 `test/dsh-stubs/` 的 loader 钩子顶替（真实运行时由宿主注入）。`index.js` 只做 Host 侧接线。DSH 升级后若 `agent/pre-step` 决策形状、`ctx.skills` 或 `renderSkillContent` 有变，先重跑本测试，再对照 DSH 自带的组合包开发指南（`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`）核对契约。
