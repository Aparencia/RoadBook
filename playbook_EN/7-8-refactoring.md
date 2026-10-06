# Card 7-8 · Refactoring (behavior unchanged, implementation swapped)
> Trigger: duplicated code everywhere / god class / circular dependency / a performance fix that requires swapping the implementation (**switching language, framework, storage, runtime or hosting platform → go to 7-10 Tech stack migration, not this card**) ｜ Output: docs/refactor/REFACTOR_<date>_<slug>.md + batched commits (one rollback point per batch) ｜ Next: 4-2 Code review (end of each batch) / 5-1 Archive (final wrap-up)
> Process area: OPS, IMP

---

## ① Start confirmation

1. **Plain-language restatement and landing point**: say in plain words "which implementation is being swapped out, and after the swap the external behavior is identical"; output = `docs/refactor/REFACTOR_<date>_<slug>.md` (holding the unchanged items, the safety-net list, the batch table, the four acceptance items, the rollback plan); next card = 4-2 Code review (end of each batch) / 5-1 Archive (final wrap-up).
2. **Trigger check (only start when it matches)**:
   - The same logic is duplicated in three or more places, and one change means changing all of them → this card
   - One class/function carries three or more responsibilities at once (a god class) → this card
   - Modules reference each other in a cycle (A→B→A) → this card
   - Switching language / framework / storage / runtime / hosting platform (the implementation substrate is replaced wholesale) → **not this card**: go to 7-10 Tech stack migration (this card only covers code-level refactoring where the substrate stays and the external behavior stays unchanged)
   - Changing four places just to make one performance metric pass → this card
   - ❌ Counter-example: you only want to add one button / one field → that goes through 2-1 Requirement clarification, do not dress it up as a refactor
   - ✅ Good example: the rate-limiting logic is copied into 5 files and one change means changing 5 places → this card
3. **Boundary statement (written into the "unchanged items" section of the report)**: the external contract is unchanged — API paths and fields, error codes, main page paths, table and column names, commands and config keys; the behavior is unchanged — the same input gives the same output.
   - Changing behavior (even just different error text) = a new feature → go back to 2-1 for scoping; do not smuggle it into this card.
4. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "every caller of the old implementation can be found in the repository, there are no external callers"), each noting the verification method.
5. **Clarifying questions (≤5, delete any that can be deleted)**: the default three questions — who confirms the unchanged-items list item by item? How long a shadow-run / downtime window is acceptable? Which piece comes first? Anything findable in the code and the registry must not be asked of the human.
6. **Quote the checklist of this card verbatim** (paste the "six refactoring steps" from §② word for word).

---

## ② Execution

**Six refactoring steps:**

**Step 1 Size the change surface, then pick the route (measure before choosing)**
```powershell
$target = 'src/export'      # the directory/files this refactor touches
(Get-ChildItem -Path $target -Recurse -File | Measure-Object).Count
(Get-ChildItem -Path src -Recurse -File | Measure-Object).Count
```
Change surface = affected files ÷ project files:
- **<40% → change in place** (Strangler-style staged replacement; the default route of this card)
- **≥40% → write out the reason + get user confirmation** before starting (the bigger the ratio, the more batches)
- **>60% and the old implementation has no reuse value** (no other module depends on it, nothing worth keeping) → only then may you rewrite, and it still goes through steps 2–5
- ❌ Counter-example: delete first and write later, a one-shot full rewrite (no rollback point, no equivalence evidence)
- ✅ Good example: 12/180 ≈ 7% → change in place, replacing one call site first

**Six questions before deleting (Chesterton's Fence: if you cannot answer, you may not touch it)**: before deleting or replacing any piece of implementation, answer each question and give evidence for it —
1. **Responsibility**: what does it do today (one sentence; "looks useless" is not an answer)
2. **Who calls it**: which places in the repo call or reference it (paste the search command and the matching lines)
3. **What it calls**: which modules / tables / external interfaces it depends on
4. **Why it is written this way**: which concrete problem was it working around (paste the comment / issue / commit message verbatim)
5. **Historical constraints**: external users / data formats / compatibility / regulation that lock it in place (if any → write it into the "invariants" section)
6. **`git blame`**: what do the last person who changed it and the commit say:
```powershell
git log --oneline -5 -- src/export
git blame -L 1,40 -- src/export/rate_limit.py
```
❌ Counter-example: deleting it outright because "this looks useless" (it may have been added to work around a data-boundary bug)
✅ Good example: question 4 turns up a commit message saying "for IE11" → keep that branch and write it into the invariants

**Step 2 Safety net first (green before you touch anything)**
- Characterization tests: turn the old implementation's current behavior (including its odd behavior) into assertions and run them green.
- Golden samples: pick 3–5 real inputs, save the old implementation's output as the "same input, same output" baseline.
- Contract tests: verify the external contract at the API/command level (paths, field names, error codes).
- If the safety net is not green, the first line of implementation code must not be touched.
- ❌ Counter-example: swapping the implementation with no tests at all, "we will see after the change" (equivalence can no longer be proven afterwards)
- ✅ Good example: add 6 characterization tests + 1 golden sample first, and start replacing only once they are all green

**Step 3 The five Strangler phases (one phase per batch, one commit per batch)**
1. **Parallel implementation**: old and new implementations coexist; the old one keeps serving external traffic.
2. **Shadow / dual-write verification**: feed the same input to both sides, compare the outputs, and paste the difference list into the receipt.
3. **Switch reads**: move the read paths to the new implementation one by one (internal branches first, then the main path), leaving a rollback point after each switch.
4. **Delete the old**: once the new implementation is fully green and the old/new difference is zero, delete the old implementation; anything that cannot be deleted is registered in the STATE.md `并行态登记簿` (with its deletion condition and due date).
5. **Wrap up and remove the switches**: delete the dual-write/shadow code and the switch configuration, and confirm no branch is left behind.
- ❌ Counter-example: leaving the switch in the code "to be cleaned up later" (a switch = a permanent fork; half a year later nobody dares delete it)
- ✅ Good example: delete the old implementation in the same batch as the read switch, remove the switch in the next batch, and paste a zero-hit switch search into the receipt

**Step 4 Batch discipline (break it and it is not a batch)**
- One batch = one commit = one rollback point; between batches `git status --short` must print nothing.
- The net change target is negative: **net reduction ≥200 lines or ≥3 files**, proven with the command below:
```powershell
$anchor = 'abc1234'        # start anchor, read from STATE.md
git diff --numstat "$anchor..HEAD"
```
- A batch must not carry feature changes, dependency upgrades or config changes; a newly found problem → register it in `docs/TECH_DEBT.md`.
- Multi-person clause: in single-person mode skip it, and write one line of reason in the STATE.md `裁剪记录` (for example: "single-person refactor, no parallel batches").

**Step 5 The four acceptance items (one missing = not done)**
1. **Behavior-equivalence evidence**: the golden samples compared group by group, old vs new output, difference zero, with the comparison pasted into the receipt.
2. **Full guardrail green**: `powershell -NoProfile -File check.ps1` exit code 0 + the output pasted.
3. **Old implementation retired**: no `_old` / `_legacy` leftovers can be found in the repository, or all of them are registered in the `并行态登记簿`:
```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '_old|_legacy'
```
   (Note: on PowerShell 5.1 `Select-String` has no recursion parameter; only the pipeline form above runs)
4. **No dependency cycles**: no A→B→A; give the check command and paste the output:
```powershell
Get-ChildItem -Path src -Recurse -Filter *.py | Select-String -Pattern '^from |^import '
```

**Step 6 Rollback plan (written when the work starts)**
- Single-batch rollback: run `git revert` on that batch's commit hash (one hash per rollback point, written into the batch table).
- Full rollback: switch back to the old implementation + drop the new-implementation commit; any data migration must ship with a down script.
- ❌ Counter-example: the report only says "roll back if something goes wrong" (no hash, no down script)
- ✅ Good example: a 5-row batch table, each row "batch / commit hash / net lines added and removed / rollback command", with the data-migration batch carrying the down-script path

**Seam criterion (decide before the refactor whether an interface belongs here)**
- **One adapter means a hypothetical seam; two adapters mean a real seam**: an abstraction layer extracted when there is only one implementation is a guess — register it as tech debt and do it when the second implementation appears; only when two implementations exist do you extract an interface / adapter for it.
- Landing point: a speculative abstraction goes into `docs/TECH_DEBT.md` (stating "extract the interface when the second implementation appears"), not into this batch's code.
- ❌ Counter-example: "we may hook up another payment channel later, so let's extract the interface now" (with only one implementation, the shape extracted will necessarily be wrong)
- ✅ Good example: the second payment channel is confirmed → extract the interface in this batch, write both adapters in the same batch, and run the characterization tests against both

**Prohibitions (violating any one of them = this round's output is void):**
- Changing the external contract or observable behavior is forbidden (to change behavior → go back to 2-1 for scoping)
- Touching implementation code with all three safety nets (characterization tests / golden samples / contract tests) missing is forbidden
- Mixing feature changes or dependency upgrades into one batch is forbidden
- Leaving an old implementation that cannot be deleted in the repository without registering it is forbidden
- Promising "tests will be added later" in the report is forbidden

---

## ③ Evidence receipt

Give, item by item:
1. Change-surface ratio (affected files ÷ project files) + the chosen route (change in place / confirmed large change / rewrite)
2. The batch table: each batch's commit hash, net lines added and removed, rollback point
3. Safety-net evidence: the run output of the characterization and contract tests, the comparison showing the golden-sample difference is zero
4. The four acceptance items, item by item: equivalence evidence / `check.ps1` exit code and output / retirement search result / dependency-cycle command output
5. Rollback plan: the single-batch rollback command and the full rollback steps (including the data-migration down-script path)
6. The user's verdict on the "unchanged-items list", quoted word for word

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `当前任务` kept (another batch remains) or cleared (final wrap-up)
- `下一步` = 4-2 Code review (another batch remains) / 5-1 Archive (wrap-up)
- `未决问题` = old implementations not yet retired and their due dates, contract changes awaiting the user's verdict
- `档位` = change surface <40% in place → tier M; ≥40% or a rewrite → tier L with the reason written out
- `工作树状态` = 干净 (must be clean between batches)

```powershell
$slug = 'export-strangler'; $msg = '导出模块限流收敛为单一实现'
git add STATE.md docs/refactor/REFACTOR_2026-10-03_export-strangler.md src/export
git commit -m "7-8 refactor(${slug}): $msg"
powershell -NoProfile -File check.ps1
```
(`git add -A` / `git add .` are forbidden; stuffing several batches into one commit is forbidden.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
