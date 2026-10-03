# Card 6-6 · Process audit (system self-evolution; triggered once every 15 archives)
> Trigger: STATE.md audit counter ≥ 15 (accumulated by card 5-1 Archive) ｜ Output: docs/decisions/PROCESS_<date>_体检.md + proposals landed ｜ Next: 5-1 Archive (this round's revisions go through archiving)

---

## ① Start confirmation

After receiving the start instruction, first send back a receipt:

1. **Trigger confirmation**: read STATE.md `体检计数` (continue only if ≥15; if the number does not match, check with the user first).
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "all proposals from the previous round have landed or been rejected", "the summary lines of the most recent 2 archives are readable"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — should the constitution be touched this round? What to do with the previous round's undecided proposals? Who decides on landing the proposals? Anything findable in STATE.md and the reports must not be asked of the human.
4. **Scan scope declaration**: ten classes of signals will be scanned (gate green rate / stop-and-ask hot spots / lesson recurrence / silent constitutional items / doc orphan line rate / expired parallel state / orphan list convergence / file count inflation / commit cadence / remote and push lag), data sources = docs/reviews/, docs/TECH_DEBT.md, docs/lessons/, docs/archive/, docs/registry/APIS.md + STATE.md (parallel-state register / file-count baseline / recent archives / start anchor) + the summary line of `orphans.ps1` + `git log --oneline`, `git status -sb`, `git remote -v`.
5. **Observation window declaration**: the window for signals 9 and 10 = **the most recent 2 archives / the most recent 2 tasks**, **decoupled** from this card's trigger period (every 15 archives) — only a short window can catch "whether the last two closings both failed to land in history".
6. **Proposal discipline declaration** (paste the "three proposal disciplines" from §② of this card word for word).
7. **Boundary declaration**: this card can only **draft proposals**; every revision of the constitution and the process is decided by the human; the agent is forbidden to modify the constitution on its own. The output landing point is `docs/decisions/PROCESS_<date>_体检.md` + proposals landed; the next card is 5-1 (Archive).

---

## ② Execution

**Signal 1: gate green rate (gate too loose or upstream too rough)**
```powershell
Select-String -Path "docs\reviews\*.md" -Pattern "建议色" | Select-Object Filename, Line
```
Count the distribution of recommended colors across all review reports:
- ≥10 consecutive greens, with rework having occurred during that period → proposal: "the review gate is too loose" (treat the cause: add criteria to the corresponding dimension)
- red/amber rate > 50% → proposal: "there is a systemic problem upstream" (treat the cause: add check items to cards 2-1 / 2-2, or the tier for that class of task should be raised)

**Signal 2: stop-and-ask hot spots (which card is the most laborious)**
```powershell
Select-String -Path "docs\TECH_DEBT.md" -Pattern '^\|\s*TD-' | ForEach-Object { ($_.Line -split '\|')[4].Trim() } | Group-Object | Where-Object { $_.Count -ge 2 } | Select-Object Count, Name
```
The criteria look only at **data rows**: numbered rows start with `| TD-`; after splitting by `|`, group by column 4 (the source column); only when the same source appears **≥2 times** does it count as a hot spot → proposal: "that card or that class of task needs a front-loaded check item".
- The header row (containing the two characters "来源") and the `（示例）` row do not take part in the count; rows with fewer than 5 columns must have their columns completed first before being counted, and must not be skipped as noise.
- ❌ Counter-example: `Select-String -Pattern "来源"` (it hits only the header, so the same source can never be counted ≥2 times)
- ✅ Good example: the column-grouping command above (output the list of sources with Count ≥2 and attach it to the report)

**Signal 3: lesson recurrence (knowledge should be upgraded)**
```powershell
$kw = '备份'          # swap the keyword topic by topic
Select-String -Path "docs\lessons\*.md" -Pattern $kw | Select-Object Filename, Line
```
Cluster topic by topic with keywords: ≥2 cards hit on the same topic, or some card's "most recent confirmation" updated ≥2 times → proposal: "upgrade it to a constitutional prohibition / a check item on the corresponding card" (the same exit as the recurrence upgrade in card 6-2).

**Signal 4: silent constitutional items (rules that should be deleted)**
Ask of every prohibition and check item in the constitution: in archive/reviews/lessons, **not a single record can be cited of it blocking or being used** → candidate for repeal.

**Signal 5: doc orphan line rate (observation item)**
The sampling rule is fixed: take the **last 10 lines each** of `docs/registry/APIS.md` and `docs/registry/DATA_DICT.md` (the newest registered entries are at the end of the file; the same rule is reproducible every round):
```powershell
@(Get-Content docs\registry\APIS.md -Tail 10) + @(Get-Content docs\registry\DATA_DICT.md -Tail 10) | Where-Object { $_ -match '\S' }
```
Assign each route / field / search term in the sampled lines to `$word` in turn and run an existence check in the source code (`Select-String -Path $srcRoot -Recurse -Pattern $word`, with `$srcRoot` set to this project's source root): the proportion of lines with zero hits > 20% → proposal: "the registry has gone stale" (treat the cause: strengthen the write-back-with-each-batch discipline of card 4-1, or add orphan line detection to check.ps1).

**Signal 6: expired parallel state (the old implementation should have died and has not)**
Read the "并行态登记簿" table of `STATE.md` (columns: `并行态 | 旧实现 | 新实现 | 删除条件（可判定） | 到期 | 登记批次`):
- There are entries **expired but not cleared** → proposal: "clean up the expired old implementation immediately" (landing point: card 7-3 opens a cleanup batch)
- The "deletion condition" is written as something undecidable (such as "confirm nobody uses it any more") → proposal: "rewrite that entry as a decidable condition"

**Signal 7: orphan list not converging (cleaned but not cleaned up)**
Run `powershell -NoProfile -File orphans.ps1` and compare with the summary line of the previous audit report: among the **five classes** orphan / zero-reference export / doc phantom / reverse phantom / unregistered, **any class that does not decrease for two consecutive rounds** → proposal: "the cleanup mechanism has failed" (treat the cause: check whether the handling rules of card 5-1 were executed, or the registration discipline of card 4-1).
- **If there is no previous round's summary line in the first round** → write this round's raw summary line into the report as the baseline, state the conclusion "the first round only records the baseline, no comparison", and propose nothing this round.

**Signal 8: file count inflation (the general ledger of AI generating more and deleting less)**
```powershell
(Select-String -Path STATE.md -Pattern '文件数基线').Line
"当前文件数 " + @(git ls-files).Count
```
Criteria: **current file count - file-count baseline > 20** → proposal: "schedule a cleanup batch to converge" (landing point: card 7-3); the file-count snapshot in `最近归档` serves as trend evidence.
- `文件数基线` is set only once, at onboarding / the first batch; card 4-1 no longer resets it batch by batch; baseline 0 (not initialized) → set it retroactively as part of onboarding closure first, and judge nothing red this round.
- ❌ Counter-example: resetting the baseline to the current file count after each coding batch (the difference is always 0, the budget mechanism spins idle and never triggers)
- ✅ Good example: set the baseline once and leave it; every audit round computes the difference and the trend, and proposes only when it exceeds 20

**Signal 9: commit cadence failure (finished work did not land in history)**
Read STATE.md's `起点锚点`, `工作树状态` and `最近归档` (rolling 2 entries), and run:
```powershell
$anchor = ((Select-String -Path STATE.md -Pattern '起点锚点').Line -replace '.*?([0-9a-f]{7,40}).*', '$1')
if ($anchor -notmatch '^[0-9a-f]{7,40}$') { $anchor = '' }
"anchor=[$anchor]"
git status --short
if ($anchor) { git rev-list --count "$anchor..HEAD" }
```
Window = **the most recent 2 archives / the most recent 2 tasks** (decoupled from the trigger period of every 15 archives):
- The start anchors of the two `最近归档` records are identical (the anchor did not move forward across two consecutive closings) → proposal: "the closing did not write the anchor"
- The anchor cannot be read as a hash (STATE.md still holds the template placeholder text, or there truly is no task in flight) → record this item as "anchor not set"; **two consecutive rounds** of this also count as "the closing did not write the anchor"
- The working tree is non-empty across sessions while STATE records "clean" → proposal: "the definition of done was bypassed" (treat the cause: check why check.ps1's git assertion did not stop it, and whether the card closing skipped the commit)
- ❌ Counter-example: the anchor has not moved across two tasks, `git status` has uncommitted files, and the receipt still says "commit cadence normal"
- ✅ Good example: the start anchors of the two `最近归档` entries differ, and `git status --short` is empty → no proposal

**Signal 10: remote and push lag (history exists only on this machine)**
```powershell
git remote -v
git status -sb
```
Window = **the most recent 2 archives**: `git remote -v` is empty, or STATE.md `远端仓库` says "本地-only", or `git status -sb` shows `ahead N` and neither of the two `最近归档` entries has a push record → proposal: "the remote and push cadence has not landed" (landing point: the remote synchronization at the closing of cards 1-2 / 1-3 onboarding and at the closing of card 5-1 archiving).
- ❌ Counter-example: treating a clean porcelain as pushed (clean only means there are no uncommitted changes, not that it was pushed; for the remote, look at the ahead count of `git status -sb`)
- ✅ Good example: `git status -sb` shows no ahead, and every `最近归档` entry carries a push result → no proposal

**Three proposal disciplines (every proposal must pass them):**
1. **A signal must occur ≥2 times to qualify for a proposal** — changing a rule on a single red light = overfitting to a single incident, and the rules will explode
2. **At least 1 repeal-type proposal** — additions and deletions must be symmetric; if not one can be raised → explicitly write "no repeal candidates this round" and explain what was scanned
3. **Land on a specific file + a specific item** — ❌ "coding should be more careful from now on" ✅ "constitution §2 adds: writing an API must first register its error codes in APIS.md"

Produce `docs/decisions/PROCESS_<date>_体检.md`: raw signal statistics + proposal table (signal / evidence / proposal / landing point / type).
**Landing falls into two classes**:
- Constitutional revisions (this project's AGENTS.md) → changed on the spot after the human decides item by item (constitutional changes require the human to be present to confirm)
- **Master card-set revisions** → written only into the proposal file, marked "carry back to the master repo for execution" — the cards live in the master repo workspace, unreachable from this project's session; changing this project's documents to pass it off as landed is forbidden

**Prohibitions:**
- The agent modifying the constitution on its own or declaring a proposal passed is forbidden (the verdict belongs to the human)
- Proposals without signal support are forbidden ("I feel" does not qualify)
- An audit that produces no written conclusion at all is forbidden (even if the conclusion is "the system is healthy, no revision needed", state the basis)

---

## ③ Evidence receipt

Give, item by item:
1. Audit report path
2. Raw signal statistics (excerpts of command output): **signals 1–10 item by item** (signal 7 with the comparison of this round's and the previous round's `orphans.ps1` summary lines; signal 8 with the baseline and the current file count; signal 9 with the raw `git status --short` and `git rev-list --count`; signal 10 with `git remote -v` and the ahead count)
3. Proposal list: each with type (add / modify / repeal) / landing point / signal evidence
4. The raw text of the user's verdict (item by item: adopted / rejected / deferred)

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md:
- `体检计数` reset to zero (accumulate from 0 again)
- `最近完成` insert one entry: process audit complete + number of proposals adopted
- `工作树状态` = clean (the audit itself must also land one commit, see below)
- `下一步` = 5-1 Archive (if the constitution / documents were changed this round); **if no file was changed this round** → `下一步` = awaiting new intent

Then commit and re-run:
```powershell
$fdate = Get-Date -Format 'yyyy-MM-dd'
git add STATE.md "docs/decisions/PROCESS_${fdate}_体检.md" AGENTS.md
git commit -m "6-6 chore(体检): 本轮体检与提案落地"
powershell -NoProfile -File check.ps1
```
(`AGENTS.md` is added to `git add` only when a constitutional revision was adopted this round; the report file and STATE.md must go into the same commit.)

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
