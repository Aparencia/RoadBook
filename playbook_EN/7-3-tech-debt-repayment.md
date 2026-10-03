# Card 7-3 · Debt and rot repayment (tech debt T batch / cleanup P batch)
> Trigger: the user says "repay debt / clean up tech debt / do some cleanup", or a cleanup batch is forced after every 3–5 feature batches ｜ Output: repayment commit + ledger closed ｜ Next: 5-1 Archive

---

## ① Start confirmation

1. **Batch type decision (decide the type before acting)**:
   - **T batch (debt repayment batch)**: clear entries one by one from the ledger; scope = the number of entries the user picked
   - **P batch (cleanup batch)**: only deletion / merging / renaming / convergence are allowed, **adding features is not allowed**; the reduction target must be written down at start (see §② P1); no written target = it does not count as a P batch
   - P batch triggers (any one): forced once after every 3–5 feature batches | triggered by the card 6-6 audit | ≥5 ledger entries whose description contains "腐化/重复/上帝类" (rot / duplication / god class)
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "these debts have no hidden dependencies", "the files to be deleted have no external references"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — how many entries to clear this round? Which entries (let the human pick)? Should a P batch be opened along the way? Anything findable in the ledger and the code must not be asked of the human.
4. **Ledger view**: read `docs/TECH_DEBT.md` and output a priority view (sorted by source severity / affected surface / how long it has been sitting, one line each), and list separately the entries whose description contains those keywords — the filter is: the description column contains "腐化/重复/上帝类"; pull the list with:
```powershell
Select-String -Path docs/TECH_DEBT.md -Pattern '腐化|重复|上帝类'
```
5. **Repayment recommendation**: pick the 1~3 entries with the "best value for effort" from the view (large impact / small change first) and explain why.
6. **Quote the checklist verbatim** (paste the "three repayment rules" from §② of this card word for word; for a P batch also paste the "four steps of a P batch").

Wait for the user to pick which entries to clear (for a P batch: wait for the user to confirm the reduction target), then act.

---

## ② Execution

**Three repayment rules:**

**Rule 1: route by nature; do not force a fix**
- Code debt → follow the discipline of 4-1 batch coding (three criteria inlined: ① record the start anchor at kickoff with `git rev-parse --short HEAD`; ② one commit per batch and `git status --short` prints nothing between batches; ③ run 4-1's "每批必念五查" item by item each batch and put the result in the receipt), one task per debt entry
- Documentation debt (missing registry rows / stale RUNBOOK) → fix directly, clearing it all in one go
- "Cannot reproduce" known-issues → must not be cleared; they can only be renewed or downgraded to "under observation"

**Rule 2: closing must carry evidence**
```powershell
git rev-parse HEAD   # after fixing, fill the hash into the "repayment evidence" column of the ledger
```
❌ Counter-example: status changed to closed, evidence column says "fixed" (a bare claim)
✅ Good example: closed, evidence=`commit a1b2c3d; tests/test_export_limit.py`

**Rule 3: clearing debt is also a task; the scope is locked just the same**
- A new problem found while fixing debt → register a new TD entry; expanding the fix on the side is forbidden
- The debt entry description does not match the actual code (the debt itself is outdated) → change it to closed + write the evidence as "re-verified and confirmed no longer present: current state of file X"

**Four steps of a P batch (cleanup batch) — delete only / merge only / converge only; adding features is not allowed:**

**P1 Reduction target (written down at start, checked at closing)**
```powershell
$anchor = 'abc1234'        # start anchor, read from STATE.md
git diff --numstat "$anchor..HEAD"
```
Each line = added / deleted / file; sum the "deleted" column and compare it with the reduction target written down at start. **Hard threshold (written down at start; changing it midway is forbidden): net reduction ≥200 lines or ≥3 files**; falling short = this batch does not count as complete (it may be continued, but the target must not be changed).

**P2 Safe deletion (master repo lesson: a recursive delete that pierced a junction once caused an incident)**
- Batch deletion **must first dry-run and output the list** (list the paths only without deleting, or use `-WhatIf`), and **whitelist the paths** (delete only the exact paths inside the whitelist)
- Paste the list into the receipt, **let the human glance over it before deleting** — not one line is executed before confirmation
- ❌ Counter-example: `Remove-Item -Recurse` applied directly to an unconfirmed directory (one piercing = an irreversible incident)
- ✅ Good example: first produce the "37 files to delete" list → human confirms → delete item by item → paste the deleted line count / file count into the receipt

**P3 Convergence action whitelist**: delete dead code and orphan files / merge duplicate implementations / rename to unified terminology / converge configuration and directories. **Adding features, upgrading dependencies and changing architecture are all out of bounds** (those are dedicated tasks).

**P4 All four pieces of acceptance**
1. Reduction target met (the raw numstat comparison from P1)
2. `powershell -NoProfile -File check.ps1` exit code 0
3. Regression verification passed (card 4-3 / card 6-4)
4. The summary line of the **five lists** of `powershell -NoProfile -File orphans.ps1` (orphan / zero-reference export / doc phantom / reverse phantom / unregistered) pasted raw into the receipt

❌ Counter-example: the receipt says only "orphans.ps1 was run, no problems" (not one of the five lists pasted = not verified)
✅ Good example: paste the raw summary line + the counts of the three kinds of handling (deleted x / registered TD x / retro-registered x), summed by deduplicated entry count = the sum of the five classes in the summary line

❌ Counter-example: turning a P batch into "refactor along the way + add new features" (equivalent to not cleaning at all, and gratuitously introducing a new surface)

**Prohibitions:**
- Clearing more entries at once than the user picked is forbidden
- "Closing the whole ledger while we are at it" is forbidden — every closing needs independent evidence
- Upgrading dependencies / changing architecture while repaying debt is forbidden (those are dedicated tasks)
- Starting a P batch without writing the reduction target is forbidden ("clean as you look" is not a target)
- Batch deletion without a dry-run list and without a path whitelist is forbidden (a recursive delete piercing a junction is a real incident)

---

## ③ Evidence receipt

1. This round's repayment list: TD number → result (closed + evidence / reason for downgrade / rescheduled)
2. Every commit hash
3. A summary of the ledger file's current state (open/closed counts)
4. P batch: the `git diff --numstat` summary (net added/net deleted lines + file count vs the reduction target) + the dry-run deletion list + the raw summary lines of the five lists from `orphans.ps1`

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md: `当前任务` cleared; `下一步` = 5-1 Archive; `未决问题` = the reason for rescheduled entries.
P batch additionally: strike this round's cleared parallel-state entries from the "parallel-state register"; write the expired-but-uncleared ones back into the table (left for the next P batch).

Then commit and re-run (the ledger closings, the deletion list and STATE.md must be in the same commit):
```powershell
$files = @('docs/TECH_DEBT.md', 'STATE.md')   # then add this round's changed code/document files one by one
git add $files
git commit -m "7-3 chore(debt): 关闭 TD-00x 并同步台账"
powershell -NoProfile -File check.ps1
```
(`git add -A` / `git add .` are forbidden; fill the commit hash back into item 2 of §③.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
