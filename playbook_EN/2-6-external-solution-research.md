# Card 2-6 · External solution research
> Trigger: for a new feature, page, or API, look for a ready-made wheel before comparing approaches | Output: the "external solutions" section of RESEARCH.md (docs/specs/<日期>_<slug>/) | Next: 2-1 feature research (the conclusion feeds the approach comparison)

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following five items, then act (a missing item means do not start):

1. **Restate the task + landing point**: in one sentence, say which wheel is being judged and what it does for us; output = the "external solutions" section of `docs/specs/<日期>_<slug>/RESEARCH.md`; next = 2-1 feature research.
2. **Assumptions list (each carrying a confidence number)**: write one line per assumption — "假设 X（置信 0.8，依据：读了 docs/ARCHITECTURE.md §3）；若错则 Y 失效" ("assume X (confidence 0.8, basis: read docs/ARCHITECTURE.md §3); if wrong, Y fails").
3. **Clarifying questions (≤5, each carrying a recommended answer)**: give the recommended answer and the reason first — one word from the user settles it; anything you can look up yourself must not be asked of a human.
   ❌ Counter-example: "要不要用开源库？" ("should we use an open-source library?") (an empty question with no recommended answer)
   ✅ Example: "本次按优先接入现成轮子处理（推荐：是；理由：自研要长期维护一份只有我们在用的实现）——同意吗？" ("this round prefers adopting a ready-made wheel (recommended: yes; reason: building it ourselves means maintaining an implementation only we use) — agreed?")
4. **Quote the checklist verbatim** (paste verbatim this card's §② "the five wheel-first checks（轮子先行五查）" — five items — plus "the three-value verdict（判定三值）" — three rows; being unable to quote the original text = this round is void).
5. **Tier and evidence-volume declaration**: tiers S/M/L all run this card; **"we searched" is not optional** — only the evidence volume may be trimmed (at tier S the lower bound of ② liveness — two of the three items — is enough; at tiers M/L all three items are required).

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do what the "Reality" column says)**

| You may think | Reality |
| :-- | :-- |
| I can write this myself faster | "Faster" has no number: put the estimated lines for building it yourself and the estimated change surface for adopting side by side first, then talk |
| Nothing on GitHub means it does not exist | Not finding it is one of three outcomes: it truly does not exist / the keyword was wrong / no search was run. Only after all three keywords are searched may you write "nothing there" |
| Lots of stars, so it must be fine | Stars are a lead, never evidence; with ②③④ unchecked, a big star count is still not evidence |
| Install it first, swap it out later if it does not fit | Installing it puts it in the dependency tree = the tier counts as L, and swapping it out touches the lockfile; pass the five checks before deciding whether to install |
| The license can wait until later | No LICENSE / GPL / AGPL / SSPL → stop and ask a human now; discovering it after adoption = code already distributed cannot be taken back |

**Action 0: open the "external solutions" section**
```powershell
$spec = 'docs/specs/2026-10-05_slug'   # assign before calling; replace with today's date_feature-slug
New-Item -ItemType Directory -Force $spec | Out-Null
```
The section title is verbatim `## 外部方案` ("external solutions"); inside the section write the five subsections ①~⑤, each ending with one "conclusion" line.

**The five wheel-first checks（轮子先行五查）(give judgeable evidence item by item; every number carries a link, and every estimated number is marked `⚠️ 估算：依据` (estimate: basis) [disambiguated])**

**① Does it exist**: write down 3 search keywords verbatim (the primary name + two synonyms/aliases) and run one search per keyword on GitHub / npm / PyPI (or the package manager matching the stack); give 3 candidates (fewer if fewer exist), each with a link + one sentence on what it does.
If none of the three keywords yields a usable candidate → write this subsection verbatim as "三个关键词均无可用候选" ("no usable candidate for any of the three keywords"); leaving it blank is forbidden.
❌ Counter-example: "搜了一下，没有合适的" ("I searched, nothing suitable") (no keyword verbatim, no link, no candidate count)
✅ Example: "关键词原文：markdown table formatter；候选 1：https://github.com/x/y（最后提交 2026-08-14）" ("keyword verbatim: markdown table formatter; candidate 1: https://github.com/x/y (last commit 2026-08-14)")

**② Is it alive**: for each candidate give at least two of the three items — last commit date / latest release / whether it is archived or deprecated — each with a link.
❌ Counter-example: "看起来还在维护" ("it looks maintained") (no date, no link)
✅ Example: "最后提交 2026-08-14（https://…/commits）；最近发版 v3.2.1（https://…/releases）；未 archived" ("last commit 2026-08-14 (https://…/commits); latest release v3.2.1 (https://…/releases); not archived")

**③ May we use it**: open the LICENSE text in the repository root and write the license name + two obligations: does it require open-sourcing / is commercial use allowed.
**No LICENSE / GPL / AGPL / SSPL → stop and ask a human** (these licenses drag our code into the open-source obligation with them); before asking, adopting it or writing it into the dependency list is forbidden.
❌ Counter-example: README says MIT so it is treated as MIT (the LICENSE text was never opened)
✅ Example: "LICENSE 原文 = Apache-2.0（链接）：不要求开源、可商用、需保留 NOTICE" ("LICENSE text = Apache-2.0 (link): no open-sourcing required, commercial use allowed, NOTICE must be kept")

**④ Does it fit**: give the four adoption costs item by item — dependency-tree count / size / conflicts with the current stack / whether a resident service is needed.
```powershell
$pkg = 'date-fns'   # the candidate package name for this round; assign before calling; swap the command for the real package manager
npm view $pkg dependencies dist.unpackedSize --json
```
❌ Counter-example: "应该不大" ("probably not big") (no number)
✅ Example: "依赖树 0 条、解包 1.2 MB（命令输出贴回执）、与现有栈无冲突、无常驻服务" ("dependency tree 0, unpacked 1.2 MB (command output pasted in the receipt), no conflict with the current stack, no resident service")

**⑤ Is it worth it**: two columns side by side + one concluding sentence — estimated lines to build it yourself ‖ estimated change surface to adopt.
❌ Counter-example: "接入成本低，建议用现成的" ("adoption cost is low, recommend the ready-made one") (low in which column?)
✅ Example: "自研估 320 行（⚠️ 估算：依据 = 3 个解析分支 × 约 100 行）‖ 接入估改 4 个文件、加 1 个依赖；结论：接入" ("build-it-yourself estimate 320 lines (⚠️ estimate: basis = 3 parsing branches × about 100 lines) ‖ adopt: about 4 files changed, 1 dependency added; conclusion: adopt")

**The three-value verdict (must land on exactly one; vagueness is forbidden)**

| Verdict | When this value applies | Action required |
| :-- | :-- | :-- |
| Adopt the ready-made wheel（接入现成） | all five checks pass | counts as "a new dependency introduced" for the tier (usually tier L); run 2-1's "three checks for a new dependency" in the same batch |
| Borrow the idea, build it yourself（抄思路自研） | the license allows it and only its algorithm / structure / naming is needed | write down what was borrowed, whether the license allows it, and which file the borrowed part lands in |
| Build it yourself（自研） | at least one of the five checks fails | map it item by item to which check fails (writing only "not suitable" is forbidden) |

**Source discipline (every number follows this wording)**
① Only official sources count: the official repository's tags / releases / commit history, the package page, the LICENSE text.
② Blogs, Q&A sites, model memory, and training data are not evidence — they only locate leads, and you must go back to the official text to verify.
③ Nothing official to be found → write `UNVERIFIED` + what you searched + why no conclusion can be given; vague hedging like "应该没问题" ("should be fine") is forbidden.
④ Star counts are a lead, never evidence; every number is followed by a link, and estimated numbers are marked `⚠️ 估算：依据` (estimate: basis) [disambiguated].
⑤ The search date is written as the current day (YYYY-MM-DD); when nothing is found, write "未查到公开数据" ("no public data found").

**Leaving a trace (not one rejected wheel may be dropped)**
Every rejected candidate gets one rejection-ledger line: `日期 | 提案 | 否决理由 | 既往请求编号` ("date | proposal | reason for rejection | prior request number"), written into the matching file under `docs/decisions/` or the "已否" ("rejected") section of `docs/pool/IDEAS.md`.
When the same proposal appears a second time, **read the ledger first** and paste the previous reason for rejection verbatim before discussing it; re-opening a round without the ledger is forbidden.

**Division of labour with admission**: ordinary packages / libraries / SaaS go through this card; third-party skills, plugins, MCP servers, and external CLIs still go through 7-9 admission (human verdict + machine check). This card only answers "should we use it" and does not replace admission.

**Prohibitions:**
- Skipping the search and judging "build it yourself" directly is forbidden (all three keywords unsearched = this round is void)
- Using star counts, blogs, or model memory as evidence is forbidden
- Adopting anything while the license is unclear (no LICENSE / GPL / AGPL / SSPL) is forbidden
- Writing a vague verdict is forbidden (exactly one of the three values must land)
- Writing any business code in this card is forbidden

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. Full path of RESEARCH.md + line count + the start and end line numbers of the "external solutions" section
2. The five checks item by item: ① the three keywords verbatim + candidate links; ② the two or more items given + links; ③ license name + the two obligations; ④ dependency-tree count / size / conflicts / resident service; ⑤ the two estimate columns + one concluding sentence
3. The verdict verbatim + its basis (which of the five checks it maps to)
4. The rejection-ledger line verbatim (write "无" ("none") when no candidate was rejected)
5. The search date (the current day, YYYY-MM-DD) + the list of `UNVERIFIED` items (write "无" ("none") when there are none)

---

## ④ State write-back

Update STATE.md:
- `当前任务` (current task) = the feature name (RESEARCH: docs/specs/<日期>_<slug>/RESEARCH.md)
- `下一步` (next) = 2-1 feature research (when the verdict is "adopt the ready-made wheel", note that the tier counts as L)
- `未决问题` (open questions) = the pending verdict and license questions (write "无" ("none") when there are none)
- `裁剪记录` (trim log) = one line for this card firing (e.g. "2-6 外部方案调研：三个关键词已搜，判定自研" ("2-6 external solution research: all three keywords searched, verdict build it yourself"))

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
$spec = 'docs/specs/2026-10-05_slug'   # this task's directory; assign before calling
git add STATE.md $spec
git commit -m "2-6 docs(spec): add external solution research"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
