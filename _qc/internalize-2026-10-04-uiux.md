# 内化记录：UI/UX 设计流程增强 → Roadbook V6 母版（2026-10-04，六批）

> 一次性留痕文件，不是日常工具。用户指令原文：m00436（用 top50 里的 UI/UX 技能增强 3-4/3-5/3-6 等设计卡，「该抄就抄」）+ m00486（对提案「采用推荐，全部执行」）。
> 证据全文在 `_skillrank/uiux/<仓库>/<路径>:<行>`（本机 clone，可逐行回读）；本记录只记落点与取舍理由。

## 1. 来源与口径

四个来源全部只读、只提炼判据，不引入依赖、不照抄文件形态（形态清单见 §4）：

| 来源仓库 | 星数（2026-10-03 快照） | 取用面 |
| :-- | --: | :-- |
| `nextlevelbuilder/ui-ux-pro-max-skill` | 132826 | 设计方向定位、布局族、反 AI 味清单 |
| `Leonxlnx/taste-skill` | 92355 | 排版/色彩/token 纪律、暗色模式、页面纪律 |
| `Nutlope/hallmark`（`skills/hallmark/references/*`） | 29474 | 动效与微交互、响应式、slop-test 自检、间距与 z-index |
| `vercel-labs/agent-skills` + `vercel-labs/web-interface-guidelines` | 31891 | 可访问性门禁、组件规格、触控目标 |

口径：**判据进卡、纪律进模板文档、术语进 `design/glossary-en.md`**；每条新增判据都必须可执行（命令或检查表），写不出阈值的一律不抄。中英卡同批改（`design/playbook-contract.md` §3）。

## 2. 六批落地（每批一次提交 + `git push`，提交后复跑门禁取 0）

| 批次 | 提交 | 落点文件 | 内容 |
| :-- | :-- | :-- | :-- |
| 批次 1-3 | `5fc9ca1` | `playbook/3-4-界面与交互设计.md`、`playbook/3-5-色彩与风格.md`、`playbook/3-6-动效与微交互.md` 及 EN 三份 | 布局与页面纪律、交互五态与焦点环、响应式四宽度、防溢出、反 AI 味；token 角色化、accent ≤2 面积 ≤3%、暗色六条、字体族与排版、z-index 七档；时长作用域表、降级两条、实现禁令、演示投屏档 |
| 批次 4 | `34` | `playbook/3-1-设计.md`、`playbook/7-1-UI改动.md`、`playbook/7-6-国际化与可访问性.md` 及 EN 三份 | 设计计划前置与 DESIGN.md 九节骨架、六轴预发自评；界面自检三命令与"一套制式"；可访问性实测三命令（axe / pa11y / lhci） |
| 批次 5 | `35` | `template/docs/UI.md`、`template/docs/DESIGN_TOKENS.md`、`template/docs/MOTION.md`、`_qc/check.ps1` | 四宽度验证记录表、交互五态矩阵、触控目标；暗色六条、z-index 七档、chroma 与 60-30-10；时长作用域、降级两条、性能禁令、演示档；三处上限 120/110/100 + §2b needle 组 |
| 批次 6 | 本提交 | `design/v6-design.md` §4/§5/§8、`design/glossary-en.md`、`_qc/check.ps1`、本文件 | 卡表三行补全新判据、文档上限同步、术语 16 条入表、needle 与内化记录断言 |

反向义务：卡里的判据必须能在模板文档里找到对应槽位（`template/docs/UI.md` 照抄即过 3-4 卡自查，由 `_qc/check.ps1` §7 断言）；模板文档的每一节必须能指回产出它的卡与消费它的卡（`design/v6-design.md` §5「文档↔卡对应原则」）。

## 3. 母版层与术语

- 术语表新增 16 条：AI slop / anti-slop、one house style、focus ring、`:focus-visible`、five states、touch target、skeleton screen、stagger、motion fallback、layout family、four widths、page discipline、unmet-items table、z-index tier、accent ink、UI self-check。
- `_qc/check.ps1` §2b `$intl` 新增 14 组 needle（6 张卡 × 中英 + 3 份模板文档 + 术语表），删句即红。
- 上限调整：`docs/UI.md` ≤90 → **≤120**、`docs/DESIGN_TOKENS.md` ≤80 → **≤110**、`docs/MOTION.md` ≤70 → **≤100**（`$budget` 表与 `design/v6-design.md` §5/§8 同批改，三处必须一致）。
- 卡 ≤150 行仍为观测项不拦红（用户裁决），本轮四张卡进入超限观测名单：3-4（232）、3-5（236）、3-6（184）、3-1（200）。

## 4. 明确不拿（连同理由，防止下一轮重复提案）

1. **不引入 CSS 框架或组件库**：来源里多为 Tailwind/shadcn 语境，抄进来等于给母版加依赖，违反 `README.md` 的零依赖定位。只抄判据。
2. **不抄 slop-test 的 58 条全文**：与 3-4 卡既有的反 AI 味条目重复，且不可逐条执行；只保留能写成"命令命中数 = 已解释数"的少数判据。
3. **不把 CSV/JSON 预设层（`data/motion.csv`、`ux-guidelines.csv`）搬进母版**：那是预设数据不是判据，会让卡变成查表；时长仍按作用域写在卡内。
4. **不采用 APCA 作为门禁**：来源给的是可选增强，母版统一 WCAG 2.1 AA（4.5:1 / 3:1），避免双标准并存产生歧义。
5. **不引入设计系统模板（Figma token 导出、CSS 变量生成器）**：超出"个人开发者 + 单一变更入口"的定位，且无法在 `check.ps1` 里机械验证。
6. **不照抄人格化包装与语气**：来源大量使用口号式标题与 emoji 徽章，直接违反 3-4 的"禁 emoji 图标"和 `design/playbook-contract.md` §4 的写作规范。
7. **不把星数当判据**：星数只用于选源，任何判据的采纳理由都必须写"能拦住什么错"，不写"热门所以抄"。
8. **不给每张卡强行加"仪表盘/图表"条款**：来源偏营销站与作品集场景，与个人工具类项目无关，避免把条件触发写成常设义务。

## 5. 写者与作用域

- 写者：主线程（Lead）；英文镜像由两个只读派单子 agent 完成后由主线程逐行核验（行数、行号、行类序列、数字 token 多重集四处零差异）。
- 作用域互斥：并发会话（C 档内化）只动 `_qc/check.ps1` 的 C 档断言区与 `template/AGENTS.md`，本批只动 §2b 的 `$intl` 与新增两行内化记录断言；提交一律用显式路径，禁止 `git add -A`。
- 已知摩擦：`edit` 工具会剥掉 `.ps1` 的 UTF-8 BOM，改完 `_qc/check.ps1` 必须重贴 `EF BB BF` 再跑门禁。
