# Card 6-4 · Regression verification (required for all tiers)
> Trigger: after the 6-3 Bugfix is complete ｜ Output: docs/specs/<date>_<slug>/VERIFY.md ｜ Next: 5-1 Archive

---

## ① Start confirmation

After receiving the start instruction, first send back a receipt for the following six items:

1. **Plain-language restatement and landing point**: which bug's fix is being verified (root cause in one sentence + fix in one sentence); output = `docs/specs/<date>_<slug>/VERIFY.md` (the same slug as 6-2/6-3); next card = 5-1 Archive.
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line — anything that can be looked up from the code / commit history must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that only the user knows and that decide the regression scope; if there are none, write "none".
4. **Regression scope declaration**: the source of the list of affected callers (verified with `Select-String`, not from impression).
5. **Verification tier declaration**: the tier is read from the `档位` field of STATE.md (after card 6-3 raises the tier, the new tier prevails; watering it down according to the old tier is forbidden).
6. **Quote the checklist verbatim** (paste the "three things of regression verification" from §② of this card word for word).

---

## ② Execution

**The three things of regression verification (not one may be missing):**

**Thing one: negative test (anti-recurrence; this is what distinguishes fix verification from feature verification)**
Write a test that "makes the original bug reproduce" — input the conditions that trigger the bug and assert the correct result (the old code fails, the new code must pass).
Run it and paste the output: **the single authoritative source for the test command = the test command already agreed in `AGENTS.md` §10 and in the `$STEPS` at the top of `check.ps1`** (this card establishes no separate command, to avoid drift in the authoritative source).
❌ Counter-example: trying it in the console and saying "it works now" (no anti-recurrence test; the next code change will blow up again)
✅ Good example: `test_bugfix_export_empty_data` asserts that exporting empty data returns an empty file instead of crashing

**Thing two: regression checklist (walk through the affected surface item by item)**
1. Assign first, then search: `$sym = '被改函数或接口名'; Select-String -Path src -Pattern $sym -Recurse | Select-Object Path,LineNumber` lists all callers
2. For each caller, write "how to verify it was not broken" (one observable behavior)
3. Execute item by item and tick them off on the checklist
❌ Counter-example: "The change is only inside the export function, the other callers are certainly unaffected" (from impression = not verified)
✅ Good example: 3 callers, each given an observable behavior, each ticked off after pasting the execution output

All results are written into `docs/specs/<date>_<slug>/VERIFY.md` (negative test output / regression checklist ticks / check output).

**Thing three: the closing three-step (the order cannot be changed: write back state → commit → re-run the closing ritual and get 0)**
First write back STATE.md according to the fields listed in ④, then run:

```powershell
$scopeFiles = @('tests/test_bugfix_export_empty_data.py','docs/specs/2026-10-03_export-empty/VERIFY.md')   # replace with the real output paths of this run
git add $scopeFiles STATE.md
git commit -m "6-4 test(<slug>): 负面测试 + 回归验证收尾 (BUG-001)"
powershell -NoProfile -File check.ps1
```

Criteria (**exit code zones; do not mix them up**): `0` = pass; `1` = the closing ritual failed (dirty working tree / some step in `$STEPS` failed / file count over budget; fix item by item according to the output); `2` = **environment not initialized** (`$STEPS` not configured, **not a fix failure**; go back to card 1-2 / 1-3 to hook up STEPS; judging "regression failed" is forbidden). If it does not pass → go back to 6-3 and fix; archiving while broken is forbidden.

**Prohibitions:**
- Skipping the negative test is forbidden ("the change is tiny so there will be no regression" is the most common excuse)
- Weakening assertions to make tests pass is forbidden (if you find yourself doing this → stop immediately and declare it)
- Announcing acceptance on the user's behalf is forbidden
- Reporting completion while `git status --porcelain` has output is forbidden

---

## ③ Evidence receipt

Give, item by item:
1. Negative test command and complete output
2. The item-by-item tick results of the regression checklist
3. check.ps1 output + exit code (`0`/`1`/`2` correspond to pass / closing ritual failure / environment not initialized)
4. VERIFY.md path
5. The raw `git status --porcelain` — **it must be empty** (output = there are still changes that have not landed in history; commit first, then report completion)

---

## ④ State write-back

**Write back first, commit after** (thing three of ② is executed as "write back state → commit → re-run the closing ritual and get 0"; reversed order = STATE.md dangling uncommitted, and the closing ritual of card 5-1 will necessarily be judged red). Update STATE.md:
- `下一步` = 5-1 Archive
- `未决问题` = none (if any, explain)

Fixed closing line:
`Regression verification complete, all evidence ready. Please review VERIFY.md. Awaiting your verdict. Reply "pass" to proceed to 5-1 Archive, or point out problems.`

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
