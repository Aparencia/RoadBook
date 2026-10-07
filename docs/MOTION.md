# MOTION · 动效与微交互（Motion and Micro-interactions；3-6 卡产物；≤100 行）
> 最近核对 2026-10-07 @ 95068bc
> 谁写：3-6 动效与微交互 ｜ 谁读：3-4 界面设计、4-1 每批编码、4-2 审查、7-1 UI 改动 ｜ 何时更新：加或改动效、改时长/缓动、加微交互、改降级策略时
> 不适用时怎么写：界面不需要动效 → 各节写一行 `N/A（理由）`，**不许整份不建**；理由要能判定，例：`N/A（纯命令行工具，无界面动效）`。

## 1. 主结论：本项目界面零动效（含证据）

- 界面 = DSH better-sidebar 侧边栏的两张标签页「图册」「自进化」（`lib/client.js` 2528 行 + `lib/client-evolve.js` 469 行，全部用内联 `style` 对象建 DOM；全仓无 `.css` 文件）。
- 证据（2026-10-07 @ 95068bc，项目根执行）：

```powershell
Select-String -Path lib\client.js,lib\client-evolve.js -Pattern 'transition|animation|prefers-reduced'
Get-ChildItem -Path lib -Recurse -File -Filter *.js | Select-String -Pattern 'hover|:active|:focus|boxShadow|transform|opacity'
```

- 两条输出都是空（零匹配行）：本项目不只是没有过渡与动画，连 hover/active 的视觉态也没有。
- 为什么定成零动效：面板是密集信息面（一屏要列完目录下全部图纸与全部信号行），动效只增加等待；标签页切换由宿主 better-sidebar 绘制（`lib/client.js:1805` 只调 `registerTab`，`lib/client.js:1833` 注释「better-sidebar 拿它画标签栏」），那层动效属宿主，不记在本项目账上。
- 所以本文件的有效内容只有两条：§3 现有反馈形态不许被"顺手加动效"改掉；§5 新增第一条动效时必须同批做什么。

## 2. 时长与缓动

- `N/A（当前零动效：全仓无 transition/animation 声明，没有时长与缓动可填）`。
- 将来新增时的唯一取值出处 = `playbook/3-6-动效与微交互.md`（动作 4 给时长与缓动、动作 5 给降级）；**本文件不复制那套数值**（一处事实源），3-6 卡取值后再写回本节。
- 没有现成的宿主档可沿用：本项目样式只读宿主 alias 令牌（`lib/client.js:1141-1148`），而宿主 alias 族里查不到动效档——把 DSH 本体 `resources/app.asar` 整份读入后对 `dsw-alias-[a-z0-9-]+` 去重计数：3053 处、120 个不同名，无一含 duration/motion/ease/transition/timing/anim。
- 未核对项：better-sidebar 插件本机未安装，它是否自带动效档未查（真要用宿主档，先补这一次核对再落值）。
- 曲线不新造：用 3-6 卡给的那一套 `cubic-bezier`；时长令牌 `--duration-n` 归本文件（约定的出处 = `template/docs/DESIGN_TOKENS.md:88`，那一条是模板侧的命名规则）——新增令牌先在本节写定值。本项目的令牌事实（色彩/字号/间距/圆角）在 `docs/DESIGN_TOKENS.md`，那一节没有时长档，别去那儿找。

## 3. 微交互：反馈靠文字与描边，不靠动效

| 交互 | 现有反馈 | 出处 |
| :-- | :-- | :-- |
| 按钮可点 | 主按钮 accent 描边 + accent 文字；次按钮 border 描边 + 常规文字；`cursor: pointer` | `lib/client.js:1149-1165` |
| 复制 | 按钮文字在「复制 / 已复制」间原地切换（无 Toast、无动画） | `lib/client.js:1239` |
| 图纸过期 / 判不了 / 元数据错 | 一行 11px 文字（warn 或 muted 色） | `lib/client.js:1229-1231` |
| 状态徽章 | 文字 + 描边底色；`unknown` 用虚线框与「正常」的实线框区分 | `lib/client.js:1166-1179`、`1206-1225` |
| 键盘焦点 | 真 `<button type="button">` / `<a>`，未覆盖 `outline`，用浏览器默认焦点环 | `lib/client.js:1235-1239` |

- 上表第一行是**静止态差异**，不是悬停/按下态：本项目没有 hover/active 反馈（见 §1 第二条证据）。
- 其余微交互 `N/A（触发它们的控件或状态在本项目不存在）`：loading、骨架屏、Toast 进出、列表增删、折叠展开、数字变化、提示气泡。

## 4. 动效选项与会话内开关

- `N/A（无动效可关：代码里没有 prefers-reduced-motion 分支，也没有动效相关设置项）`。
- 本项目唯一的设置项是「图纸目录」（`lib/client.js:2254-2266` 的 `settingsDeclaration`，只有一个 `type: "text"` 的 `dir`），与动效无关。

## 5. 降级策略：零动效天然满足；新增第一条动效时必须同批做四件事

- 现状：`prefers-reduced-motion` 在代码里零命中，没有动画就没有可降级的对象；这不是"漏做降级"。
- 谁批准：动效属 UI 改动，按 `playbook/7-1-UI改动.md:54` 停手回 3-6 立项，3-6 的门禁裁决由人做。
- 同批四件事（缺一条 = 本文件作废）：
  1. 把时长、缓动与选定的按钮动效写进本文件 §2/§3（从 3-6 卡取值，不许在代码里随手定）。
  2. 同批实现降级：`@media (prefers-reduced-motion: no-preference)` 正向前置 + `reduce` 分支，两条都要（3-6 卡动作 5：缺一条 = 本卡未完成）。
  3. 同批回写 `docs/UI.md` 的交互描述与 `docs/registry/COMPONENTS.md` 对应行（D13 回写义务）。
  4. 跑 3-6 卡动作 9 的自查并让它 exit 0：它要求本文件里按钮选项 ≥6 行、时长 ≥6 行、`cubic-bezier` ≥4 行、`no-preference` ≥1 行、`reduce` ≥1 行，且总行数 ≤100。零动效项目跑那条自查必然 exit 1（没有可数的行），新增第一条动效后它必须转绿。
- 判定线：代码里出现 `transition`/`animation` 而本文件仍写"零动效" = 本文件已失效；`prefers-reduced-motion` 仍零命中 = 降级未做，判不合格。

## 6. 验收方式与更新义务

- 当前验收（零动效）：§1 的两条命令零命中 + 本文件 ≤100 行 = 文档与代码一致，不需要录屏或 DevTools 帧率证据。
- 本文件任一改动：同批回写 `docs/UI.md` 的交互描述与 `docs/registry/COMPONENTS.md` 对应行；提交前跑 `powershell -NoProfile -File check.ps1` 取退出码 0。
