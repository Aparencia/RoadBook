# Card 4-3 · Verification (mandatory for all tiers)
> Trigger: after 4-1 is green (**tier S: after 4-1 is green go straight to 4-3 (skipping 4-2); tiers M/L: after 4-2 is green and the user gives the go-ahead, go to 4-3**) ｜ Output: docs/specs/<date>_<slug>/VERIFY.md ｜ Next: 5-1 archive [disambiguated]

---

## ① Start confirmation

After receiving the start instruction, first receipt the following six items:

1. **Restate the task in plain words and the landing point**: which feature is being verified (read the current task from STATE.md, one sentence); output = `docs/specs/<date>_<slug>/VERIFY.md`; next card = 5-1 archive (awaiting the user's acceptance).
2. **Acceptance-criteria reference**: paste the acceptance criteria from SCOPE.md verbatim, item by item.
3. **Assumptions list**: write "I assume X; if that is wrong then Y is void" for each item — anything findable in the project files must not be written as an assumption; go look it up first.
4. **Clarifying questions (≤5, delete them if you can)**: ask only about things that cannot be found in SCOPE.md / STATE.md and that determine the verification standard; if there is none at all, write "none".
5. **Verification-tier declaration**: **read the tier from the `档位` field of STATE.md** (after a 4-1 card upgrade the new tier governs; watering it down according to the tier at start time is forbidden) — tier S = check.ps1 passing is enough, **a one-line receipt** (exit code + 1 acceptance item + one line of honest boundaries); tier M = 1~2 tests on the critical path + scenario walkthrough; tier L = critical path + negative tests (**zero tests are not allowed**) + scenario walkthrough.
6. **Paste the reference checklist verbatim** (paste word for word this card's §② "the only legal definition of done").

---

## ② Execution

**Action 1: run the close-out ceremony (guardrail)**

```powershell
powershell -NoProfile -File check.ps1
```

**The only legal definition of done: exit code 0 + the complete real output pasted.**
Everything else — "it is done / it should be fine" — does not count as done.
❌ Counter-example: "type-check is clean, so verification passes" (type-check ≠ verification)
✅ Good example: paste check.ps1's complete output with "all passed" on the last line, exit code 0
When the exit code is not 0, tell two cases apart: `2` = `$STEPS` not configured (**the environment is not initialized; it is not a code defect** — go back to the 1-2 / 1-3 cards to wire up STEPS); `1` = a real failure, fix item by item.

**Action 2: land the tests according to the tier**
- Tiers M/L: write tests and make them pass; paste the test output. Weakening an assertion just to make it pass is forbidden.
  ❌ Counter-example: the test asserts `expect(result).toBeDefined()` (a fake test that always passes)
  ✅ Good example: `expect(sum([1,2])).toBe(3)`, plus one failing case proving it does report an error
- **Mutant falsification ("green" needs one question: can the criterion really be driven red?)** — tier L: every test criterion; tier M: at least once per task: temporarily break the code under test → the test must turn red → restore → re-run and go back to green.
  ❌ Counter-example: change `amount * 0.9` to `amount * 0.8` and the test is still green = this is a "toothless criterion" (an ornament); rewrite the assertion and falsify it again
  ✅ Good example: inject the mutant → the named criterion turns red → restore → re-run back to green → that criterion has teeth, the evidence holds
  ⚠️ **Mutant hygiene**: when the readings look odd, suspect the runner cache first (vitest writes its cache into node_modules, and `--no-cache` is not enough) — clear the cache between the mutation and the re-run, or run in a temporary copy directory (see the lesson card `docs/lessons/<date>_测量载体脱钩.md`)
- If you find yourself "changing the test to accommodate the code" → stop immediately and declare it (that is cheating).

**Action 2.5: scenario walkthrough (tiers M/L; every scenario must carry evidence — no output/JSON/assertion pasted = it was never walked)**
The agent walks each scenario in the real running state; the results go into VERIFY.md. Scenario menu:
- □ Normal path: run SCOPE's acceptance criteria item by item
- □ Empty state / first use: open each page with no data
- □ Boundary data: empty input / overly long / 0 / negative / maximum / special characters
- □ Failure path: behavior when the backend errors / duplicate submission / network loss
- □ Data consistency: after an operation, check that the stored data is really correct (not just what the UI shows)
- □ Regression: the core old features that worked before the change still work
With browser capability, walk the UI level (paste key DOM assertions / screenshots); without it, walk the interface level + data level (paste request/response JSON, command output) and leave the button-clicking layer to the manual acceptance checklist.

**Action 3: generate the behavior acceptance checklist (3~5 items for the user to click through)**
Each item = which page to open → which action to take → what should be seen.
❌ Counter-example: "the feature works normally"
✅ Good example: "open the entry page added by this task → click the newly added 『导出』 button → a download file appears within 2 seconds, and the number of exported rows matches the number of rows visible in the list" — rewrite each of SCOPE's acceptance criteria in this pattern; it must carry a checkable number or state.
For a project with a UI, **the first checklist item must start from an existing screen entry** and walk to the new feature ("from the settings page click the 『导出』 button → see the download file") — proving the user can really reach it; using "calling the API directly succeeds" as the only evidence that the feature is done is forbidden (the component is written but the entry is not wired — exactly the accident that review and acceptance most easily miss together). For a purely backend project, give the interface call steps (copy-pasteable curl/PowerShell commands).
The checklist is written into VERIFY.md (together with the check output, test results, and the scenario walkthrough table). **The end of VERIFY.md must have an 「诚实边界」 section: list item by item "what this task did not verify / cannot do" (write "none" even when there is not a single one); merging similar items or omitting them is not allowed** — this prevents "undetermined" from being written as "all green".

**Action 4: pre-check the archive conditions**
- Did you change the UI / a table / an interface? Remind the 5-1 card to write back to the registry (self-check once and receipt it).

**Prohibitions:**
- Skipping check.ps1 and saying "verification passes" directly is forbidden
- Claiming "a scenario was walked" without evidence is forbidden (no output/JSON/assertion pasted = it was not walked)
- Declaring "acceptance passed" on the user's behalf is forbidden — you can only submit the checklist; acceptance is the human's job
- Writing operations the user cannot perform into the acceptance checklist is forbidden (anything needing SSH or needing to read logs does not count as behavior acceptance)

---

## ③ Evidence receipt

Give, item by item:
1. check.ps1's complete output + exit code
2. Test output (tiers M/L) + the mutant falsification record (what was injected / which item turned red / back to green after restore)
3. Scenario walkthrough result table (tiers M/L): scenario → evidence (JSON/output/assertion) matched item by item
4. VERIFY.md path
5. The behavior acceptance checklist text (the copy the user will click through)
6. The honest-boundaries section text (the not-verified list; write "none" if there is none)

---

## ④ State write-back

**Write back first, commit second** (the state write-back must precede the commit; reversing the order = STATE.md left uncommitted, and the 5-1 card's close-out ceremony will judge it red). Update STATE.md:
- `下一步` = 5-1 archive (awaiting the user's acceptance; tier S likewise goes to 5-1) [disambiguated]
- `未决问题` = items in the acceptance checklist that the user may not be able to perform themselves (list them if any)

After the write-back, the closing triple (the order cannot be changed: write back state → commit → re-run the close-out ceremony for a 0):

```powershell
$verify = 'docs/specs/2026-10-03_login/VERIFY.md'   # replace with this run's real output path
git add $verify STATE.md
git commit -m "4-3 docs(verify): 验证收尾——回执已出，等用户验收"
powershell -NoProfile -File check.ps1
```

The exit code must be 0; if it is 2 (`$STEPS` not configured) or non-zero → stop and ask the user; declaring verification complete is forbidden.

Fixed closing line:
`Verification complete, the acceptance checklist is ready. Please click through it item by item. Awaiting your verdict. Reply "pass" to proceed to 5-1 archive, or say which item is wrong.`
