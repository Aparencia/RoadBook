# Card 6-6 · Process audit (system self-evolution; triggered once every 15 archives)
> Trigger: STATE.md audit counter ≥ 15 (accumulated by card 5-1 Archive) ｜ Output: docs/decisions/PROCESS_<date>_体检.md + proposals landed ｜ Next: 5-1 Archive (this round's revisions go through archiving)
> Process area: QA, KNOW

---

## ① Start confirmation

After receiving the start instruction, first send back a receipt:

1. **Trigger confirmation**: read STATE.md `体检计数` (continue only if ≥15; if the number does not match, check with the user first).
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "all proposals from the previous round have landed or been rejected", "the summary lines of the most recent 2 archives are readable"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — should the constitution be touched this round? What to do with the previous round's undecided proposals? Who decides on landing the proposals? Anything findable in STATE.md and the reports must not be asked of the human.
4. **Scan scope declaration**: sixteen classes of signals will be scanned (gate green rate / stop-and-ask hot spots / lesson recurrence / silent constitutional items / doc orphan line rate / expired parallel state / orphan list convergence / file count inflation / commit cadence / remote and push lag / expired drill record / card-behavior baseline artifacts unconsumed / route drift / no-op rule / evidence-arm contamination / review actionable-finding rate), data sources = docs/reviews/, docs/TECH_DEBT.md, docs/lessons/, docs/archive/, docs/registry/ + STATE.md (parallel-state register / file-count baseline / recent archives / start anchor) + the summary line of `orphans.ps1` + `git log --oneline`, `git status -sb`, `git remote -v`.
5. **Observation window declaration**: the window for signals 9 and 10 = **the most recent 2 archives / the most recent 2 tasks**, **decoupled** from this card's trigger period (every 15 archives) — only a short window can catch "whether the last two closings both failed to land in history"; 6. **Proposal discipline declaration** (paste the "three proposal disciplines" and the "four conditions for changing a rule" from §② of this card word for word).
7. **Boundary declaration**: this card can only **draft proposals**; every revision of the constitution and the process is decided by the human; the agent is forbidden to modify the constitution on its own. The output landing point is `docs/decisions/PROCESS_<date>_体检.md` + proposals landed; the next card is 5-1 (Archive).

---

## ② Execution
**Signal 1: gate green rate (gate too loose or upstream too rough)** — count the distribution of recommended colors across all review reports:
```powershell
Select-String -Path "docs/reviews/*.md" -Pattern "建议色" | Select-Object Filename, Line
```
- ≥10 consecutive greens, with rework having occurred during that period → proposal: "the review gate is too loose" (treat the cause: add criteria to the corresponding dimension); red/amber rate > 50% → proposal: "there is a systemic problem upstream" (treat the cause: add check items to cards 2-1 / 2-2, or the tier for that class of task should be raised)
**Signal 2: stop-and-ask hot spots (which card is the most laborious) — two-stage: location column → card number**
```powershell
Select-String -Path "docs/TECH_DEBT.md" -Pattern '^\|\s*TD-' | ForEach-Object {
  $p = (([string]$_.Line -split '\|')[3] -split ':')[0].Trim(' `')   # stage 1: the location column = column 3
  $c = ((git log -1 --format=%s -- $p) -split ' ')[0]                # stage 2: location → the card number of its most recent commit
  [pscustomobject]@{ 位置 = $p; 卡号 = $(if ($c -match '^\d+-\d+$') { $c } else { '未标注卡号' }) }
} | Group-Object 卡号 | Where-Object { $_.Count -ge 2 } | Select-Object Count, Name
```
The criteria look only at **data rows**: numbered rows start with `| TD-`; after splitting by `|`, **column 3 is the location column** (`[4]` is the type column — taking the wrong column only ever outputs type hot spots such as "rot, design, test" and has nothing to do with "which card is laborious"); only when the same **card number** appears **≥2 times** does it count as a hot spot → proposal: "that card or that class of task needs a front-loaded check item". When the location column holds several paths or a note, take the first path that can be reverse-mapped to a card number; if none can be reverse-mapped → put it under 「未标注卡号」 and name it in the report (a commit message without a card number = the ledger format is substandard, see the commit convention in B1).
- The header row (containing the two characters "位置") and the `（示例）` row do not take part in the count; rows with fewer than 8 columns must have their columns completed first before being counted, and must not be skipped as noise.
- ❌ Counter-example: `($_.Line -split '\|')[4]` (it takes the type column) ｜ ✅ Good example: the two-stage command above (output the list of card numbers with Count ≥2 and attach it to the report)
**Signal 3: lesson recurrence (knowledge should be upgraded)**
Every lesson card must carry three machine-readable fields in its header: `复发次数: N` (recurrence count) / `作用域: 项目 | 全局` (scope: project | global) / `最近复发: YYYY-MM-DD` (most recent recurrence) — **`作用域` is an enum, not free text**: the only legal values are `项目` or `全局` (a parenthetical note may follow the word, e.g. `全局（跨 3 个项目）`); **a missing field or an illegal enum value → that card does not take part in clustering this round and must be named in the report** (writing a "looks right" value such as `本项目` / `Project` = neither of the two additional criteria below ever matches, and that card silently drops out of the clustering).
```powershell
$kw = '备份'; <# swap the keyword topic by topic #> Select-String -Path "docs/lessons/*.md" -Pattern $kw | Select-Object Filename, Line
```
Cluster topic by topic with keywords: ≥2 cards hit on the same topic, or some card's "most recent confirmation" updated ≥2 times → proposal: "upgrade it to a constitutional prohibition / a check item on the corresponding card" (the same exit as the recurrence upgrade in card 6-2). Two additional criteria: **recurrence across ≥2 projects (`作用域: 全局`) → upgrade first** (it is no longer just this project's problem); **`复发次数` unchanged for 30 days and `作用域: 项目` → candidate for retirement** (even this project no longer hits it; keeping it only adds resident volume).
**Signal 4: silent constitutional items (rules that should be deleted)**: ask of every prohibition and check item in the constitution — in archive/reviews/lessons, **not a single record can be cited of it blocking or being used** → candidate for repeal.
**Signal 5: doc orphan line rate (observation item)**
The sampling rule is fixed: take the **last 10 lines each** of `docs/registry/APIS.md` and `docs/registry/DATA_DICT.md` (the newest registered entries are at the end of the file; the same rule is reproducible every round):
```powershell
@([IO.File]::ReadAllLines('docs/registry/APIS.md',[Text.Encoding]::UTF8) | Select-Object -Last 10) + @([IO.File]::ReadAllLines('docs/registry/DATA_DICT.md',[Text.Encoding]::UTF8) | Select-Object -Last 10) | Where-Object { $_ -match '\S' }
```
Assign each route / field / search term in the sampled lines to `$word` in turn and run an existence check in the source code (`Get-ChildItem -Path $srcRoot -Recurse -File | Select-String -Pattern $word`, with `$srcRoot` set to this project's source root; note that on PowerShell 5.1 `Select-String` has no recursion parameter, so only the pipeline form above runs): the proportion of lines with zero hits > 20% → proposal: "the registry has gone stale" (treat the cause: strengthen the write-back-with-each-batch discipline of card 4-1, or add orphan line detection to check.ps1).
**Signal 6: expired parallel state (the old implementation should have died and has not)**: read the "并行态登记簿" table of `STATE.md` (columns: `并行态 | 旧实现 | 新实现 | 删除条件（可判定） | 到期 | 登记批次`):
- There are entries **expired but not cleared** → proposal: "clean up the expired old implementation immediately" (landing point: card 7-3 opens a cleanup batch); the "deletion condition" is written as something undecidable (such as "confirm nobody uses it any more") → proposal: "rewrite that entry as a decidable condition"
**Signal 7: orphan list not converging (cleaned but not cleaned up)**: run `powershell -NoProfile -File orphans.ps1` and compare with the summary line of the previous audit report: among the **seven classes** orphan / zero-reference export / doc phantom / reverse phantom / unregistered / unregistered docs / archive candidates, **any class that does not decrease for two consecutive rounds** → proposal: "the cleanup mechanism has failed" (treat the cause: check whether the handling rules of card 5-1 were executed, or the registration discipline of card 4-1); **if there is no previous round's summary line in the first round** → write this round's raw summary line into the report as the baseline, state the conclusion "the first round only records the baseline, no comparison", and propose nothing this round.
**Signal 8: file count inflation (the general ledger of AI generating more and deleting less)**
```powershell
(Select-String -Path STATE.md -Pattern '文件数基线').Line; "当前文件数 " + @(git ls-files).Count
```
Criteria: **current file count - file-count baseline > 20** → proposal: "schedule a cleanup batch to converge" (landing point: card 7-3); the file-count snapshot in `最近归档` serves as trend evidence.
- `文件数基线` is set only once, at onboarding / the first batch; card 4-1 no longer resets it batch by batch; baseline 0 (not initialized) → set it retroactively as part of onboarding closure first, and judge nothing red this round.
- ❌ Counter-example: resetting the baseline to the current file count after each coding batch (the difference is always 0, the budget mechanism spins idle and never triggers) ｜ ✅ Good example: set the baseline once and leave it; every audit round computes the difference and the trend, and proposes only when it exceeds 20
**Signal 9: commit cadence failure (finished work did not land in history)**
Read STATE.md's `起点锚点`, `工作树状态` and `最近归档` (6 fields: date / slug / commit hash / start anchor / current file count / push result; rolling 2 entries), and run:
```powershell
$anchor = ((Select-String -Path STATE.md -Pattern '起点锚点').Line -replace '.*?([0-9a-f]{7,40}).*', '$1'); if ($anchor -notmatch '^[0-9a-f]{7,40}$') { $anchor = '' }; "anchor=[$anchor]"; git status --short; if ($anchor) { git rev-list --count "$anchor..HEAD" }
```
Window = **the most recent 2 archives / the most recent 2 tasks** (decoupled from the trigger period of every 15 archives):
- The start anchors of the two `最近归档` records are identical (the anchor did not move forward across two consecutive closings) → proposal: "the closing did not write the anchor"
- The anchor cannot be read as a hash (STATE.md still holds the template placeholder text, or it was never set) → record this item as "anchor not set"; **two consecutive rounds** of this also count as "the closing did not write the anchor" (`起点锚点` is not cleared by archiving and keeps the previous task's value, so a live project always yields a hash)
- The working tree is non-empty across sessions while STATE records "clean" → proposal: "the definition of done was bypassed" (treat the cause: check why check.ps1's git assertion did not stop it, and whether the card closing skipped the commit)
- ❌ Counter-example: the anchor has not moved across two tasks, `git status` has uncommitted files, and the receipt still says "commit cadence normal" ｜ ✅ Good example: the start anchors of the two `最近归档` entries differ, and `git status --short` is empty → no proposal
**Signal 10: remote and push lag (history exists only on this machine)**
```powershell
git remote -v; git status -sb
```
Window = **the most recent 2 archives**: `git remote -v` is empty, or STATE.md `远端仓库` says "本地-only", or `git status -sb` shows `ahead N` and the `推送结果` field of both `最近归档` entries records no successful push → proposal: "the remote and push cadence has not landed" (landing point: the remote synchronization at the closing of cards 1-2 / 1-3 onboarding and at the closing of card 5-1 archiving).
- ❌ Counter-example: treating a clean porcelain as pushed (clean only means there are no uncommitted changes, not that it was pushed; for the remote, look at the ahead count of `git status -sb`) ｜ ✅ Good example: `git status -sb` shows no ahead, and every `最近归档` entry's `推送结果` says it was pushed → no proposal
**Signal 11: expired drill record (carrying the 90-day look-back of card 5-5)**: read the `下次到期` field of `docs/RUNBOOK.md` §5 and STATE.md `最近归档` (6 fields: date / slug / commit hash / start anchor / current file count / push result):
```powershell
Select-String -Path docs/RUNBOOK.md -Pattern '下次到期'; (Select-String -Path STATE.md -Pattern '最近归档').Line
```
If `下次到期` has already passed, is empty, or still holds the template placeholder → proposal: "the drill record is expired and was not re-drilled" (landing point: run card 5-5 once to re-drill and write the new due date back into RUNBOOK §5); ❌ Counter-example: `下次到期` says 2026-01-01 and is long overdue, yet the report still says "backup drill normal"; ✅ Good example: state the number of overdue days + propose the re-drill + write back the new due date.
**Signal 12: card-behavior baseline artifacts unconsumed** (**master applies**; no `_qc/` in this project = N/A for derived projects → write "this project has no baseline artifacts" and raise no proposal): if run directories exist under `_qc/baseline/runs/` while this audit report cites none of their line numbers → record "baseline spinning idle"; proposal: "merge that run's failure types and conclusions into this audit".
**Signal 13: route drift** — the card numbers, file names and commands pointed to by the resident entry points (`SKILL.md` and the driver card) do not match what is on disk = the routing is lying. Audit action: reconcile every entry-point item against disk (commands below), list the items that do not match, and require them to be fixed in the same batch.
```powershell
$entry = 'SKILL.md'; <# replace with the resident entry file; run it once per file if there are several #> [IO.File]::ReadAllLines($entry, [Text.Encoding]::UTF8) | Select-String -Pattern '\d+-\d+'
```
Criteria: the card number / file name / command written in an entry-point item makes `Test-Path` false on disk, or the card number actually points to a different card → record one "route drift"; ≥2 → proposal: "fix the entry point and the cards in the same batch" (landing point: the entry file + the card pointed at wrongly, in one and the same commit; fixing only one side is forbidden). ❌ the card was renamed while the entry point still writes the old name, yet the report says "entry point normal" ｜ ✅ all 14 entry items make `Test-Path` true → no proposal
**Signal 14: no-op rule** — a rule whose deletion leaves behavior completely unchanged (relative to the model's default it changed nothing) = it should be deleted, or rewritten as an executable criterion. "It reads sensible" does not count; the criterion is to delete it and run one comparison — no change in behavior means it is a no-op. Audit action: pick a candidate rule, delete it temporarily and run one task of the same class, comparing against the run with the rule kept.
Criteria: that task's behavior after deleting the rule is **completely identical** to the behavior with the rule kept → record one "no-op rule"; the same rule recorded in ≥2 rounds → proposal: "repeal it, or rewrite it as an executable criterion (command + expected output)" (landing point: the specific item in the file where that rule lives). ❌ "this one reads sensible, keep it for now" (no deletion comparison run) ｜ ✅ delete it, run once, the two behaviors are identical → record the no-op with both raw outputs attached
**Signal 15: evidence-arm contamination (that round's conclusion is void)** — read the most recent baseline run's `_qc/baseline/runs/<timestamp>/manifest.txt`: if an arm declared as the control group has `inject_events > 0` (the plugin injected a roadbook card at `agent/pre-step`), or its declared `plugin_mode` does not match reality → **mark that round's conclusion "unusable" outright, not "a point of attention"** (the control group was also running the thing under test = the gap gets flattened, structurally the same accident as ponytail flattening 80–94% into 4% on 2026-06-17).
```powershell
Get-ChildItem "_qc/baseline/runs/*/manifest.txt" -ErrorAction SilentlyContinue | Select-String -Pattern 'arm|plugin_mode|inject_events'
```
No run directory → write "no baseline artifacts this round" and raise no proposal (that belongs to signal 12's observation surface); **N/A for derived projects**: a derived project has no `_qc/`, so it always takes this degraded exit — **never write "cannot read the manifest" as "the evidence arm is clean"**.
**Signal 16: actionable-finding rate (theater of critique)** — count the findings in the last ≥2 rounds of review reports and how many of them are **actionable** (an `actionable finding` = has a file:line plus can be landed as an action):
```powershell
Select-String -Path "docs/reviews/*.md" -Pattern '本轮发现|可行动'
```
Two consecutive rounds with "findings N > 0 and actionable M = 0" → proposal: "the review is going through the motions (theater of critique)": first ask the agent that was reviewed "how should the card be written so that you could not have chosen wrong", then change only the card surface or the review question template without touching the conclusion; **closing it with "be more careful from now on" is forbidden**.

**Three proposal disciplines (every proposal must pass them):**
1. **A signal must occur ≥2 times to qualify for a proposal** — changing a rule on a single red light = overfitting to a single incident, and the rules will explode
2. **At least 1 repeal-type proposal** — additions and deletions must be symmetric; if not one can be raised → explicitly write "no repeal candidates this round" and explain what was scanned
3. **Land on a specific file + a specific item** — ❌ "coding should be more careful from now on" ✅ "constitution §2 adds: writing an API must first register its error codes in APIS.md"

**Four conditions for changing a rule (S5; all must hold before a card change may be proposed — any one missing makes the proposal invalid):**
1. **Three-arm numbers**: no rule / current rule / changed rule, **same task and same model, ≥6 runs per arm** — "it got much better after the change" without the raw three-arm numbers = invalid; when this machine cannot run the baseline (no headless, **or this project has no `_qc/` at all — N/A for derived projects**), substitute **two comparison outputs this project can re-run (the command text + the output text, both pasted)** and explicitly write "no three-arm numbers this round"; a project that has `_qc/baseline/ledger.json` should **prefer** the two rows already recorded there (master applies)
2. **Side-effect statement**: name at least one **existing task that could be broken**, and give the evidence that it was not broken (failing to name one = you only looked where you wanted to look)
3. **Recurrence threshold**: the same failure type reproduced ≥2 times (two rows can be cited from `_qc/baseline/ledger.json` or review reports; if you cannot cite them the threshold has not been met)
4. **Reading discipline (T7)**: every number cited must come from this round or be re-verifiable in this round — **a stale reading must never be presented as current fact** (last audit's summary line or last round's green rate may only be cited as a "baseline", never stated as "the current state"; numbers from a cache or from memory must be re-run before they go into the report)

Produce `docs/decisions/PROCESS_<date>_体检.md`: raw signal statistics + proposal table (signal / evidence / proposal / landing point / type).
**Landing falls into two classes**:
- Constitutional revisions (this project's AGENTS.md) → changed on the spot after the human decides item by item (constitutional changes require the human to be present to confirm); **master card-set revisions** → written only into the proposal file, marked "carry back to the master repo for execution" — the cards live in the master repo workspace, unreachable from this project's session; changing this project's documents to pass it off as landed is forbidden

**Three questions before changing a card (mandatory before touching a card; from the baseline meta-test)**: before changing a card, first ask the agent that was bypassed — "How could that skill have been written differently to make it crystal clear that Option A was the only acceptable answer?" Three kinds of answer → three kinds of fix: ① the card was clear but I ignored it → add a root principle; ② it should have said X → write its suggestion into the card verbatim; ③ I did not see section Y → raise that section's prominence. The judge fills these three kinds of answer into the 「结论」 column of `judge.md`.

**Prohibitions:**
- The agent modifying the constitution on its own or declaring a proposal passed is forbidden (the verdict belongs to the human)
- Proposals without signal support are forbidden ("I feel" does not qualify)
- An audit that produces no written conclusion at all is forbidden (even if the conclusion is "the system is healthy, no revision needed", state the basis)

---

## ③ Evidence receipt

Give, item by item:
1. Audit report path
2. Raw signal statistics (excerpts of command output): **signals 1–16 item by item** (signal 7 with the comparison of this round's and the previous round's `orphans.ps1` summary lines; signal 8 with the baseline and the current file count; signal 9 with the raw `git status --short` and `git rev-list --count`; signal 10 with `git remote -v` and the ahead count; signal 11 with the raw `下次到期` text and the number of overdue days; signal 13 with the item-by-item entry-point reconciliation result; signal 14 with the two comparison outputs, before and after deleting the rule; signal 15 with the raw `inject_events` from `manifest.txt`; signal 16 with the raw "findings N / actionable M" from two consecutive rounds)
3. Proposal list: each with type (add / modify / repeal) / landing point / signal evidence; 4. The raw text of the user's verdict (item by item: adopted / rejected / deferred)

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md:
- `体检计数` reset to zero (accumulate from 0 again); `最近完成` insert one entry: process audit complete + number of proposals adopted
- `工作树状态` = clean (the audit itself must also land one commit, see below); `下一步` = 5-1 Archive (an audit always produces the PROCESS report and this commit, so "no file was changed this round" cannot happen)

Then commit and re-run:
```powershell
$fdate = Get-Date -Format 'yyyy-MM-dd'; git add STATE.md "docs/decisions/PROCESS_${fdate}_体检.md" AGENTS.md; git commit -m "6-6 chore(体检): 本轮体检与提案落地"; powershell -NoProfile -File check.ps1
```
(`AGENTS.md` is added to `git add` only when a constitutional revision was adopted this round; the report file and STATE.md must go into the same commit.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
