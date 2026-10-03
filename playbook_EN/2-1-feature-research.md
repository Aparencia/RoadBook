# Card 2-1 · Feature research (the mandatory entry point for any new feature/page/API)
> Trigger: the driver card receives a new-feature intent | Output: docs/specs/<日期>_<slug>/RESEARCH.md | Next: 2-2 scope definition (after the user confirms the approach and tier; for tiers M/L with unclear requirements, run 2-3 requirement elicitation first)

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following five items, then act (a missing item means do not start):

1. **Restate the task**: in one plain sentence, say what feature is to be built.
2. **Upstream references + assumptions list**: whether this idea is already in docs/pool/IDEAS.md (yes → paste the line number); the landing constraints for this change in docs/ARCHITECTURE.md; list the default assumptions one by one (e.g. "导出格式 CSV 与 Markdown 都要支持" ("both CSV and Markdown export formats must be supported")).
3. **Clarifying questions (≤5)**: anything answerable from ARCHITECTURE / registry / IDEAS must not be asked of a human.
   ❌ Counter-example: "用什么技术实现比较好？" ("which technology would be better to implement this with?") (that is what this card has to answer)
   ✅ Example: "导出功能需要支持 Excel 吗，还是 Markdown 就够？" ("does the export feature need to support Excel, or is Markdown enough?")
4. **Quote the checklist verbatim** (paste verbatim this card's §② "the four research-compliance checks" + "the three checks for a new dependency").
5. **Path pre-judgment (judge first, ask after)**: before asking the first clarifying question, first announce that this task is handled as tier <S/M/L>, with a one-sentence criterion; and add one line "本次要改的流程在仓库里已经可读吗：是/否" ("is the flow this change touches already readable in the repo: yes/no"). If the judgment is wrong or you disagree → re-judge now, then ask.

Also state: the output lands at `docs/specs/<日期>_<slug>/RESEARCH.md`; the approach and the tier are both decided by the user's verdict.

---

## ② Execution

**Action 0: create the task workspace**
```powershell
$spec = 'docs/specs/20260912_export'   # replace with 今天日期_功能slug (assign before calling)
New-Item -ItemType Directory -Force $spec | Out-Null
```
The date uses today (YYYYMMDD), slug = a short English word for the feature (e.g. `20260912_export`).

**Action 1: read the three upstream places (check before acting, to prevent parallel creation)**
- `docs/pool/IDEAS.md`: the idea is already in the pool → cite the original line; starting a separate effort is forbidden
- `docs/ARCHITECTURE.md`: which layer this change lands in, and what constraints apply
- the three-piece set in `docs/registry/`: is there an existing component/table/API to reuse
❌ Counter-example: did not check the registry → created a button that duplicates `PrimaryButton`
✅ Example: receipt "registry 查过：无现成导出组件，需新建，落点 src/lib/export.ts" ("registry checked: no ready-made export component, a new one must be built, landing point src/lib/export.ts")

**Action 2: compare ≥2 complete approaches + 1 rejected approach**
Four columns per approach: change surface (estimated file count) / new dependencies / risk / effort (estimated lines or person-days), plus a one-line conclusion in the last column.
The rejected approach must state a concrete reason for rejection:
❌ Counter-example: "方案 C：用 WebSocket——不考虑" ("approach C: use WebSocket — not considered") (a filler entry, no reason)
✅ Example: "方案 C（被否）：WebSocket 实时同步——单人本地应用无第二客户端，且引入常驻服务进程，改动面 ×3" ("approach C (rejected): WebSocket real-time sync — a single-user local app has no second client, and it introduces an always-on service process, tripling the change surface")

**Action 3: the three checks for a new dependency (go through them item by item before introducing any package)**

```text
① Do the registry three-piece set and ARCHITECTURE already provide a similar capability? (yes → reuse it; parallel creation is forbidden)
② Does the package really exist? (open the npm/PyPI package page to verify: paste the link + latest release date / weekly downloads)
③ Is the official documentation link given? (a blog/tutorial link only = not acceptable)
```
❌ Counter-example: "装个 left-pad 处理补零" ("just install left-pad to handle zero padding") (whether the package is still maintained was never verified)
✅ Example: "date-fns（npm 官方页：https://www.npmjs.com/package/date-fns ，最近发布 <日期>）" ("date-fns (official npm page: https://www.npmjs.com/package/date-fns, latest release <日期>)")

**Action 4: first-pass impact assessment** (use `git grep`: it searches only tracked files, automatically excluding node_modules and .git)
```powershell
git grep -n "相关符号名"     # replace "相关符号名" with the real symbol; if there is no match, write "未找到引用" ("no references found")
```
List the files expected to be touched + the affected lines in the registry (paste the lines if there are any).

**Action 5: tier proposal (criteria table inlined; upgrade only, never downgrade — when unsure, propose one tier higher)**

| Tier | Criterion (meeting any one puts the task in this tier) |
| :-- | :-- |
| S | ≤3 files and ≤100 lines, no new dependency, no table schema, no new page; **single-page static app exception**: 1 entry page + no backend + no dependency → relaxed to ≤5 files and ≤400 lines (including the 3-4/3-5/3-6 design documents) |
| M | an ordinary feature: confined to 1–2 modules, no new external package, no breaking table schema |
| L | a new dependency introduced / cross-module / breaking table schema / a new page system → **3-1 design + 5-2 release are mandatory** |

❌ Counter-example: an M-tier item containing a new dependency = misclassification (writing "可能新增 1 个低风险依赖" ("possibly one new low-risk dependency") is already a misjudgment; any dependency makes it L)
❌ Counter-example: spanning 3 modules and changing the table schema, yet still judged M (meeting any one L criterion puts it in L; when unsure, propose one tier higher)
✅ Example: adding an export button to an existing page, changing 2 files for about 60 lines, no new external package → M

Give the recommended tier + the basis, then stop and let the user confirm.

**Action 6: S-tier note**
When the recommendation is S, write one line at the end of RESEARCH.md: `S 档简版链：2-2（简版）→ 4-1 → 4-3 → 5-1` ("S-tier simplified chain: 2-2 (simplified) → 4-1 → 4-3 → 5-1"). [disambiguated]

**The four research-compliance checks (self-check before wrap-up, answer each one):**

```text
① Does every approach have all four columns: change surface / dependencies / risk / effort?
② Does the rejected approach state a concrete reason for rejection (rather than being a filler entry)?
③ Have all newly added dependencies passed the "three checks for a new dependency"?
④ Was the tier recommendation made according to the criteria table?
```

**Prohibitions:**
- Skipping the reading of ARCHITECTURE / the registry and producing an approach directly is forbidden
- Recommending a package whose existence has not been verified is forbidden (a package name from memory = fabrication)
- Deciding the tier or the approach on your own is forbidden (recommendation + basis only; the verdict belongs to the human)
- Writing any business code in this card is forbidden

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. Full path of RESEARCH.md + line count
2. The approach comparison table (including the rejected approach and its reason for rejection)
3. The item-by-item result of the three checks for a new dependency + package page/documentation links
4. Impact: the list of files expected to be touched + the affected registry lines
5. The recommended tier + basis; the verbatim approach and tier the user confirmed

---

## ④ State write-back

Update STATE.md:
- `current task` = <feature name> (RESEARCH: docs/specs/<日期>_<slug>/RESEARCH.md)
- `tier` = the S/M/L the user confirmed
- `next` = 2-2 scope definition (for tier S, note that the simplified version is used)
- `open questions` = the clarifying questions the user has not answered (list them if there are any)

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
$spec = 'docs/specs/20260912_export'   # this task's directory; assign before calling
git add STATE.md $spec
git commit -m "2-1 docs(spec): add export research"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Fixed closing line:
`Research complete; recommended approach <X>, tier <S/M/L>. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
