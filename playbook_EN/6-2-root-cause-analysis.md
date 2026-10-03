# Card 6-2 · Root cause analysis (required for all tiers)
> Trigger: Bug / error / wrong behavior ｜ Output: docs/specs/<date>_<slug>/RCA.md ｜ Next: 6-3 Bugfix (for P0, stop the bleeding first: rollback before fix)

---

## ① Start confirmation

After receiving the bug report, first send back a receipt for the following six items:

1. **Plain-language restatement and landing point**: which feature has what problem (one sentence); output = `docs/specs/<date>_<slug>/RCA.md`; next card = 6-3 Bugfix.
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line — anything that can be looked up from the code / STATE.md must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that only the user knows and that decide the direction of the localization; if there are none, write "none".
4. **Four diagnostic questions** (if the user cannot answer, help find the answers together; never skip this and guess the cause directly):
   - What is the expected behavior?
   - What is the actual behavior?
   - The raw error text (paste it in full; not one line of a screenshot may be omitted)
   - The most recent change (approximate time / content; use the "recently completed" section of STATE.md to help recall)
5. **Reproduction plan**: propose how to reproduce it (which page / what operation / what data).
6. **Quote the checklist verbatim** (paste the "five whys comparison" from §② of this card word for word).

---

## ② Execution

**Action 1: manual reproduction (skipping is forbidden)**
- The user reproduces it personally, or the user operates while the agent watches the output on the same screen.
- The agent must not claim "already reproduced based on the code".
  ❌ Counter-example: "From the code it must error here, no need to reproduce"
  ✅ Good example: "Please click the '导出' (Export) button after logging in; I will be watching the log in the terminal at the same time — did you click it? What did you see?"
- Cannot reproduce → register it in `docs/TECH_DEBT.md` (known-issue), give an information-collection plan (such as screenshot + steps + time point), and this card ends.

**Action 2: localization (try in order, stop at the first hit)**
1. File / module name in the error string → assign first, then search: `$kw = '报错关键字'; Select-String -Path src -Pattern $kw -Recurse | Select-Object Path,LineNumber`
2. UI text → search the whole repository for the text (same as above, swapping in the text keyword)
3. Look up the "plain-language identifier" column of `docs/registry/COMPONENTS.md` to reverse-map to the program name
4. Check whether a lesson card in `docs/lessons/` covers the same symptom (if yes → first try the old card's fix; on success, update the "most recent confirmation" field on the old card = date + the evidence of this confirmation; **if the old card has no such field → add the field first, then update it**; never skip the update just because the field is missing); **if an existing lesson card is hit (the same symptom occurring a second time) → after the fix is complete you must draft an "upgrade proposal": upgrade this lesson from knowledge to a rule (write it into the constitution's prohibitions or the corresponding process card's check items, landing on a specific file + a specific item), and hand it to the user for a verdict — a pit stepped into twice will come back a third time**

**Action 3: five whys comparison — ≥3 layers (ask all the way down; stopping at one layer is forbidden)**

```text
❌ Counter-example (stopping at 1 layer):
   Why the white screen? → because data is undefined. (done)
✅ Good example (4 layers all the way down):
   Why the white screen? → data is undefined
   Why is it undefined? → the API response structure changed
   Why did the structure change? → the person who changed the API last week did not know the frontend uses the old field
   Why did they not know? → this API was not registered in docs/registry/APIS.md
   → Root cause: the API was not registered (fix the APIS registration + fix the code; both must be done)
```

**Action 4: bug severity classification (criteria inline; when unsure, treat it as P2)**
- P0 system crash / data loss / security vulnerability → stop the bleeding first: rollback takes priority over fix (steps are in the rollback section of docs/RUNBOOK.md)
- P1 core functionality unusable → fix immediately
- P2 edge functionality errors / poor experience → fix normally
- P3 typo / style / non-critical → does not enter the fix process; register it in TECH_DEBT.md and accumulate it in a batch; this card ends

**Action 5: write `docs/specs/<date>_<slug>/RCA.md`**: symptoms / reproduction steps / root cause (≥3 layers) / impact surface / suggested fix. The `<slug>` in the path must be the same slug as in the card header and in STATE.md `当前任务`; it is forbidden to call it a bug name in one place and a slug in another.

---

## ③ Evidence receipt

Give, item by item:
1. Reproduction result (who did it / what was seen)
2. The raw root cause chain (≥3 layers)
3. Severity classification proposal + basis
4. RCA.md path

---

## ④ State write-back

**Write back first, commit after** (the state write-back must come before the commit; reversed order = STATE.md dangling uncommitted, and the working tree will necessarily be dirty when card 6-3 starts). Update STATE.md:
- `当前任务` = BUG-<序号> <one sentence> (RCA link)
- `下一步` = 6-3 Bugfix (P3 / known-issue = awaiting new intent, task cleared)
- `未决问题` = the parts of reproduction that need the user's cooperation

After writing back, run the closing three-step (the order cannot be changed: write back state → commit → re-run the closing ritual and get 0):

```powershell
$rca = 'docs/specs/2026-10-03_export-empty/RCA.md'   # replace with the real output path of this run
git add $rca STATE.md
git commit -m "6-2 docs(rca): 根因定位 + STATE 回写 (BUG-001)"
powershell -NoProfile -File check.ps1
```

The exit code must be 0; if it is 2 (`$STEPS` not configured, environment not initialized) or non-zero → stop and ask the user; announcing that the root cause analysis is complete is forbidden.

Fixed closing line:
`Root cause identified: <one sentence>. Awaiting your verdict. Reply "continue" to proceed to 6-3 Bugfix, or raise an objection to the root cause.`

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
