# DESIGN_TOKENS · 设计令牌（Design Tokens；3-5 卡产物；≤80 行）
> 谁写：3-5 色彩与视觉规范 ｜ 谁读：3-4 界面设计、3-6 动效、4-1 每批编码、4-2 审查、7-1 UI 改动 ｜ 何时更新：改品牌色、调色阶、加字号/间距/圆角档、改明暗映射时
> 不适用时怎么写：无自绘界面（直接用组件库默认主题）→ 各节写一行 `N/A（理由）`，**不许整份不建**；理由要能判定，例：`N/A（用组件库默认主题，未自定义令牌）`。

## 1. 品牌主色与中性色阶（500 为基准，每阶亮度 ±6%；改一阶必须重跑 §3 对比度）

- 品牌主色 `--color-brand-500: #2563EB`（主按钮、链接、选中态）；hover `--color-brand-700: #1D4ED8`，按下 `--color-brand-800: #1E40AF`。

| 阶 | 用途 | 亮色 hex | 暗色 hex |
| :-- | :-- | :-- | :-- |
| 50 | 页面底、最浅填充 | #F8FAFC | #0B1220 |
| 100 | 卡片底、hover 填充 | #F1F5F9 | #111A2B |
| 200 | 分隔线、禁用底 | #E2E8F0 | #1B2739 |
| 300 | 输入边框、骨架屏 | #CBD5E1 | #273449 |
| 400 | 弱化图标、placeholder | #94A3B8 | #3A4A63 |
| 500 | 次要文字、默认图标 | #64748B | #526480 |
| 600 | 正文文字、强调边框 | #475569 | #7488A3 |
| 700 | 标题文字 | #334155 | #9BACC6 |
| 800 | 高对比标题、页脚底 | #1E293B | #C3CEDE |
| 900 | 最强文字、暗色页底 | #0F172A | #E8EDF5 |

## 2. 语义色（够用就不扩；状态必须同时有文字或图标，不能只靠颜色）

| 语义 | hex | 用途 | 暗色 hex |
| :-- | :-- | :-- | :-- |
| success | #16A34A | 成功提示、完成勾选 | #22C55E |
| warning | #D97706 | 警告、额度将满 | #F59E0B |
| danger | #DC2626 | 错误、删除、破坏性确认 | #F87171 |
| info | #0284C7 | 中性提示、帮助入口 | #38BDF8 |

## 3. 对比度门禁（WCAG 2.1 AA）

- 门槛：正文文字（<24px 常规）≥4.5:1 ｜ 大字（≥24px 或 ≥18.66px 粗体）≥3:1 ｜ UI 边界（输入框描边、图标、开关）≥3:1。
- 逐对验（无依赖，Node 即可；改色阶后全部 PASS 才提交，换命令里的色值即可）：
`node -e "const L=h=>{const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]},C=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};for(const[a,b,m]of[['#475569','#F8FAFC',4.5],['#2563EB','#FFFFFF',4.5],['#94A3B8','#F8FAFC',3]])console.log(a,b,C(a,b).toFixed(2),C(a,b)>=m?'PASS':'FAIL')"`

## 4. 字号阶梯（正文行高 1.5、标题 1.25；字重只用 400/500/600/700）

| 字号 | 行高 | 字重 | 用处 |
| :-- | :-- | :-- | :-- |
| 12px | 16px | 400 | 辅助说明、表格密集列 |
| 14px | 20px | 400 | 次要正文、表单提示 |
| 16px | 24px | 400 | 正文（默认，移动端不缩） |
| 20px | 25px | 600 | 小节标题 |
| 24px | 30px | 600 | 页面标题 |
| 32px | 40px | 700 | 大标题、弹层标题 |
| 40px | 50px | 700 | 落地页主标题 |

- 中文优先字体栈：`-apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`；等宽 `Consolas, "Cascadia Mono", monospace`。

## 5. 间距（4px 基线，只允许这 8 档；出现 10px 之类的值 = 破基线）

`--space-1: 4px`（图标与文字）｜`--space-2: 8px`（按钮内边距）｜`--space-3: 12px`（字段之间）｜`--space-4: 16px`（卡片内边距）｜`--space-6: 24px`（区块之间）｜`--space-8: 32px`（页面分区）｜`--space-12: 48px`（大区块分隔）｜`--space-16: 64px`（页头页脚留白）。

## 6. 圆角、描边与阴影（三级阴影够用，别自创第四级）

- 圆角与描边：`--radius-1: 4px`（输入、小按钮）｜`--radius-2: 8px`（卡片、按钮）｜`--radius-3: 12px`（弹层、大卡片）｜`--radius-full: 999px`（头像、胶囊标签）；描边统一 `1px solid var(--color-neutral-300)`，聚焦换品牌色 2px。
- `--shadow-1: 0 1px 2px rgba(15, 23, 42, 0.06)`（卡片默认）｜`--shadow-2: 0 4px 12px rgba(15, 23, 42, 0.10)`（悬浮卡片、下拉）｜`--shadow-3: 0 12px 32px rgba(15, 23, 42, 0.16)`（弹层、抽屉）。

## 7. 明暗模式映射表（同一语义 token 两套取值；正文与边框必须成对改）

| 语义 token | 亮色 | 暗色 |
| :-- | :-- | :-- |
| --color-bg-page | #F8FAFC | #0B1220 |
| --color-bg-surface | #FFFFFF | #111A2B |
| --color-text-primary | #0F172A | #E8EDF5 |
| --color-text-secondary | #64748B | #7488A3 |
| --color-border | #E2E8F0 | #273449 |
| --color-brand | #2563EB | #3B82F6 |
| --color-danger | #DC2626 | #F87171 |

## 8. 命名规则与禁则

- 命名：`--color-语义-层级`（如 `--color-brand-500`）、`--space-n`、`--radius-n`；时长 token `--duration-n` 归 `docs/MOTION.md`。语义只用 brand/success/warning/danger/info/text/border/bg。
- ❌ 正文纯黑 `#000000`、随手缩写 `#3a7`、组件里写死 px、只靠颜色表状态；✅ 用 `--color-text-primary` 这类 token、六位 hex 进本表、颜色 + 图标或文字。

## 更新义务

- 任一 token 改动：同批回写 `docs/UI.md` 与 `docs/registry/COMPONENTS.md` 相关行；对比度命令重跑全绿；提交前跑 `powershell -NoProfile -File check.ps1` 取退出码 0。
