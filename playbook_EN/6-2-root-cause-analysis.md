# Card 6-2 · Root cause analysis (required for all tiers)
> Trigger: Bug / error / wrong behavior ｜ Output: docs/specs/<date>_<slug>/RCA.md ｜ Next: 6-3 Bugfix (for P0, stop the bleeding first: rollback before fix)
> Process area: OPS

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
- **Stage one is reproduction (without it, stage two must not start)**: first find a command that is "red before the change, green after the change", and paste that command's raw output into RCA.md — **with no red-capable command, there is no stage two**; if you cannot find one, stop at stage one and ask the human; changing code on a guess is forbidden.
  ❌ Counter-example: "I already know the cause, I will just change it"
  ✅ Good example: `npm test -- export` showed 1 failed (red) before the change and 0 failed (green) after — the raw output is pasted
- Cannot reproduce → register it in `docs/TECH_DEBT.md` (known-issue), give an information-collection plan (such as screenshot + steps + time point), and this card ends.

**Action 2: localization (try in order, stop at the first hit)**
1. File / module name in the error string → assign first, then search: `$kw = '报错关键字'; Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $kw | Select-Object Path,LineNumber` (Note: on PowerShell 5.1 `Select-String` has no recursion parameter; only the pipeline form above runs)
2. UI text → search the whole repository for the text (same as above, swapping in the text keyword)
3. Look up the "plain-language identifier" column of `docs/registry/COMPONENTS.md` to reverse-map to the program name
4. Check whether a lesson card in `docs/lessons/` covers the same symptom (if yes → first try the old card's fix; on success, update the "most recent confirmation" field on the old card = date + the evidence of this confirmation; **if the old card has no such field → add the field first, then update it**; never skip the update just because the field is missing); **if an existing lesson card is hit (the same symptom occurring a second time) → after the fix is complete you must draft an "upgrade proposal": upgrade this lesson from knowledge to a rule (write it into the constitution's prohibitions or the corresponding process card's check items, landing on a specific file + a specific item), and hand it to the user for a verdict — a pit stepped into twice will come back a third time**
5. **Reverse chain tracing**: from the error line, trace up the call chain until you find the layer where "the input was still correct when it arrived here" — the root cause is one layer below it; the receipt must write out this chain (error point file:line → caller file:line → … → original trigger point file:line). **Prohibition: with no reverse call chain written out, touching the code is forbidden — fixing only the erroring line = symptom fixing, and this card is void.**
6. **Host-level / environment-level failure: the five steps** (take this route when the error points at the environment, or when "the code looks fine"; the same exit as the three questions of red light C1):
   - **Multi-channel comparison matrix**: run the same thing through ≥2 independent start channels (a different host / a different account / a different data directory), downgrading "it necessarily hangs" to "it hangs under some combination"; a single-channel conclusion does not count.
   - **Minimal configuration**: first switch off every optional piece (autoload / plugins / injection parameters) and run the minimal configuration; still red ⇒ the problem is not in the configuration layer.
   - **Zero-dependency probe**: write a probe that imports nothing from this project (a few lines of script in a temp directory) — if it can go red ⇒ it has nothing to do with this project's code.
   - **System-level audit**: read ACL / integrity label / policy with a read-only reader (such as `scripts/envcheck.ps1`); **every conclusion must carry a healthy control sample** (the same probe is green in another directory or under another account) — no control sample = the conclusion does not stand.
   - **Still unsatisfiable after all five steps** → register it in `docs/TECH_DEBT.md`, or close the task with B1's third state `BLOCKED_BY_ENV` (unsatisfiable on this machine ≠ the code is unfinished); **unresolved for 2 consecutive rounds → stop trying on this machine, switch machines + a manual action list**.
7. **Four localization techniques** (the ones that save time; use them as needed): ① **the same SHA256 binary in a different location** — one sentence rules out "a code problem"; ② **2×2 stripping (path × content)** — strip "location" apart from "content"; ③ **a different access path** (`subst` / a directory symlink) — distinguish "path-string policy" from "directory object attributes"; ④ **synthetic reproduction** — see ④ of action 6.

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

**Action 6: instrument and experiment discipline (prove the instrument is trustworthy before drawing a conclusion; these are not "be more careful", they are criteria)**
- **A · experiment design (guard against "the false signal I built myself")**: ① **isolate every arm + assert the pre-state before every arm** — long-running processes / shared data directories / caches / ports must be independent per arm, and each arm must assert at its start that the pre-state is 0 (the previous arm's residue contaminates both comparison arms at once); ② **move one variable at a time** ("directory content" and "directory location" mixed into one comparison can only be stripped apart by doing a 2×2); ③ **even with >90% correlation, keep watching that one counter-example** (15 hangs out of 16 — the single pass is exactly where the mechanism comes from; writing "it necessarily hangs" as the conclusion cuts the mechanism off); ④ **synthetic reproduction is the only step that establishes causation** (build the failure yourself in a brand-new directory → remove it → it turns green).
- **B · instrument discipline (self-calibrate first, conclude after)**: ⑤ **calibrate the instrument first** — build a known state as a ruler and see whether the instrument can read it out; ⑥ **an "exclusion" must name the specific fields being excluded** (saying "ACL is excluded" when only the DACL was excluded, while the answer sits just outside the DACL); ⑦ **an outer error code is for bucketing only, never a criterion** (the same root cause can hand out three different codes; those are merely different failure points); ⑧ **injection-type parameters must first have their channel verified** (plant a visible sentinel to confirm the parameter really reached the command line, otherwise that round of experiment is void — a void experiment is not evidence).
- **C · attribution and advice discipline**: ⑨ **before saying "most likely", inventory the variables already brought under control**, and **before giving an operational suggestion, verify that it is executable on this machine** ("run it in a non-elevated terminal" equals no advice on a machine that cannot create a Medium process); ⑩ **before attributing to the outside, measure it** (runtime version / antivirus / elevation / host context, each ruled out by actual measurement; the true cause may be in no log, event or error code at all — only actively writing an instrument to read that layer makes it visible).

| You will think | The fact |
| :-- | :-- |
| "The error code says the resource is in use, so it is an occupancy problem" | That is the outer wrapper; settle the bucketing rule first, do not use it as a criterion |
| "ACL has already been excluded" | Which part was excluded? (DACL / SACL / label / owner) |
| "I replicated the ACE and it still runs, so it has nothing to do with ACL" | `Set-Acl` moves only the DACL; the label was not moved along |
| "6/6 hang, 6/6 pass — that is deterministic" | My experiment order may be contaminating the next arm |
| "Bet on the most likely cause first" | Before betting, inventory the variables already brought under control |
| "Suggest he run it in a non-elevated terminal" | Can this machine create a Medium process? Verify first |

---

## ③ Evidence receipt

Give, item by item:
1. Reproduction result (who did it / what was seen)
2. The raw root cause chain (≥3 layers)
3. Severity classification proposal + basis
4. RCA.md path
5. Evidence of instrument and experiment discipline (paste the raw text item by item when they are involved): the output of the self-calibration ruler / the naming of the excluded fields / the pre-state assertion of each arm / the command and output of the healthy control sample

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
Expected: `$rca` must be an RCA path that really exists (the ③ output of this card): with a wrong path, `git add` reports `fatal: pathspec '<path>' did not match any files` with **exit code 128** and `git commit` never runs — that is what stops "the RCA is not written yet" before it reaches history. A successful `git commit` prints `[main <short-hash>] 6-2 docs(rca): 根因定位 + STATE 回写 (BUG-001)` plus ` N files changed, M insertions(+)` and exits 0; `check.ps1` must end with `全部通过（退出码 0）：完成声明成立。` (exit code 2 = `$STEPS` not configured, i.e. an uninitialized environment — see the last line of this card).

The exit code must be 0; if it is 2 (`$STEPS` not configured, environment not initialized) or non-zero → stop and ask the user; announcing that the root cause analysis is complete is forbidden.

Root cause identified (see the RCA.md path above); next: 6-3 Bugfix (reply "continue" to run it).

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
