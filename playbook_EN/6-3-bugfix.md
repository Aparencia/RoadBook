# Card 6-3 · Bugfix (required for all tiers)
> Trigger: after the 6-2 Root cause analysis is confirmed by the user ｜ Output: fix code + commit ｜ Next: 6-4 Regression verification

---

## ① Start confirmation

After receiving the start instruction, first send back a receipt for the following seven items:

1. **Plain-language restatement and landing point**: which bug is being fixed, the root cause in one sentence (quoted from RCA.md); output = fix code + this card's closing commit; next card = 6-4 Regression verification.
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line — anything that can be looked up from RCA.md / the code must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that only the user knows and that decide the fix approach; if there are none, write "none".
4. **Root cause restatement**: one sentence (quoted from RCA.md).
5. **Fix plan**: which files are changed / how they are changed, and "why this is the minimal change".
6. **Start anchor declaration**: run `git rev-parse HEAD` and echo it (write it into STATE.md).
7. **Quote the checklist verbatim** (paste the "fix-scope two-dimension lock" threshold table from §② of this card word for word).

---

## ② Execution

**Step 0: record the start anchor (skipping is forbidden)**: `$anchor = git rev-parse HEAD`; write the output hash into the `起点锚点` field of STATE.md — this card's gate, the self-assessment of the change scope in ③, and the regression baseline of card 6-4 all use it; losing it = you cannot delimit "what this card changed", and if something goes wrong you cannot roll back precisely.

**Action 1: minimal-change fix**
- Fix only the problem the root cause points to; do not do anything "while you are at it".
- **Fix-scope two-dimension lock** (**lines = added lines + deleted lines**, that is the N+M of the `N insertions(+), M deletions(-)` line at the end of `git diff --stat "$anchor..HEAD"`; do not use net line count — "delete 200 lines and change 200 lines" would be counted as 0 by the net line count and would hide a large change):

| Signal | Verdict | Handling |
| :-- | :-- | :-- |
| ≤3 files and ≤100 lines | ✅ normal | continue fixing |
| >3 files or >100 lines | ⚠️ amber card | stop, explain to the user why the minimal fix needs to be this large, and continue only after approval |
| >600 lines or schema changes required | 🔴 red card | split it into an independent task and go back to the user for re-planning |

  ❌ Counter-example: rearranging imports while you are at it, blowing the diff up from 30 lines to 200 lines, and still continuing to fix as "normal"
  ✅ Good example: change only the 2 files the root cause points to (12 added lines + 6 deleted lines = 18 lines) → ✅ normal
- **Fix-attempt count**: this is attempt N at fixing this bug (N counts from 1). At N = 3, changing code directly is forbidden; first answer the three questions and write the conclusion as one line for the user's verdict: ① does the symptom keep surfacing in a different place each time? ② would fixing it require large-scale refactoring? ③ does fixing it break something else every time? — any single "yes" = an architecture problem, not a failed hypothesis; stop and discuss; the 4th fix requires the user's approval.
- When there are multiple fix options, list the candidates first (A/B + trade-offs) and then recommend one; the human picks.
- **Regression localization: if you do not know which commit broke it, bisect (F1)** — never guess from "what changed recently". Precondition: one command that reproduces reliably (a test/script/one-liner that also runs red on old commits).
```powershell
git bisect start
git bisect bad                     # the current HEAD is bad
git bisect good <a known-good commit>    # the start anchor or an earlier green commit
git bisect run <reproduction command>    # e.g. git bisect run npm test -- --grep "failing test"
# after it prints "is the first bad commit":
git bisect reset
```
  ① The reproduction command must produce an exit code **automatically** (0 = good / non-zero = bad); a command that needs human eyes must not be fed to `bisect run` directly; ② every `good`/`bad` verdict must be explainable (no "it looks like that one"); ③ you must finish with `git bisect reset` (forget it and you keep coding on a detached HEAD); ④ write the conclusion into the RCA: the hash of the commit that introduced the problem + what that commit changed (raw `git show --stat <hash>`) + why it was not caught at the time.
  ❌ Counter-example: roll back the last two commits on a hunch, the red disappears and you declare "root cause found" (it might be a third commit, or the red was merely masked) ｜ ✅ Good example: bisect converges on `abc1234`; paste the raw `git show --stat abc1234` + a retrospective on why the tests did not stop it

**Action 2: while-you-are-at-it issue registration rule**
When fixing A you find B has a problem → register it in `docs/TECH_DEBT.md` (TD-<序号> + source = the BUG-xxx fix process); **fixing it on the side is forbidden**.
❌ Counter-example: "I was passing through this file anyway, so I also changed that outdated pattern"
✅ Good example: "TD-012 registered: an outdated pattern exists in the same file, recommended to be repaid separately"

**Action 3: mechanical gate (run it immediately after the fix — within 5 minutes, before any other work; whichever of options A/B is chosen, it must be run once landed — the gate has teeth and does not rely on self-discipline)** `[disambiguated]`

```powershell
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})').Matches[0].Groups[1].Value   # $anchor is read from the 「起点锚点」 field of STATE.md; typing it by hand is forbidden
git rev-parse --verify "$anchor^{commit}"; if ($LASTEXITCODE -ne 0) { throw "锚点无效：停下问用户" }
$scopeFiles = @('src/a.ts','src/b.ts')   # replace with this card's real list of changed files
powershell -NoProfile -File gate.ps1 -Anchor $anchor -ScopeFiles ($scopeFiles -join ',') -RepoRoot .
```

Verdict wording: **red = exit 1** (not a git working tree / invalid anchor / missing -Anchor / missing -ScopeFiles / out-of-scope change / line count over limit / lockfile change) → stop and fix; committing is forbidden; **amber = exit 0 but with items requiring attention** (renamed entries, empty change list) → relay them to the user along with the receipt; green = exit 0. The "passed" that the gate prints itself does not count as evidence; you must paste the original command + the complete output.

**Action 4: leave the changes in the working tree; do not commit yet** — this card's commit is done in ④ together with the state write-back (iron order: write back state → commit → re-run the closing ritual and get 0), to avoid STATE.md dangling uncommitted.

**Prohibitions:**
- Skipping the Action 3 gate before committing is forbidden
- `git add -A` / `git add .` are forbidden
- Refactoring on the side / upgrading dependencies on the side / changing unrelated files are forbidden
- Skipping the "amber card confirmation" and going straight to a large change is forbidden

---

## ③ Evidence receipt

Give, item by item:
1. Commit hash + commit message
2. Change scope: the complete output of `git diff --stat "$anchor..HEAD"` + the two-dimension lock self-assessment red/amber/green using "lines = added lines + deleted lines"
3. The original mechanical gate command + the complete output + exit code (red/amber/green mapped item by item)
4. The TECH_DEBT entry numbers registered during this process
5. When bisection was used: the raw `is the first bad commit` line from the end of the `git bisect` output + the raw `git show --stat <hash>` + proof that `git bisect reset` was run; if bisection was not needed (the fix target is already known), write "no bisection needed this round, reason: …"

---

## ④ State write-back

**Write back first, commit after** (the state write-back must come before the commit; reversed order = STATE.md dangling uncommitted, and the closing ritual of card 6-4 will necessarily be judged red). Update STATE.md:
- `起点锚点` = the fix start hash
- `档位` = write the new tier after a tier upgrade (keep the old value if the tier did not change; card 6-4 reads it to set the verification strength)
- `下一步` = 6-4 Regression verification
- `未决问题` = the record of the amber card approval (if any)

After writing back, run the closing three-step (the order cannot be changed: write back state → commit → re-run the closing ritual and get 0):

```powershell
$scopeFiles = @('src/a.ts','src/b.ts')   # the exact file list changed by this card (consistent with Action 3)
$slug = 'export-empty'                   # this bug's slug (same as the RCA.md of 6-2)
$msg = 'empty-data export no longer crashes'   # what was fixed (one sentence)
git add $scopeFiles STATE.md
git commit -m "6-3 fix(${slug}): $msg (BUG-001)"
powershell -NoProfile -File check.ps1
```

The exit code must be 0; if it is 2 (`$STEPS` not configured, environment not initialized) or non-zero → stop and ask the user; announcing that the fix is complete is forbidden.

Fix complete; next: 6-4 Regression verification (reply "continue" to run it).

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
