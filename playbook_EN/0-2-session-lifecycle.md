# Card 0-2 · Session lifecycle
> Trigger: closing a session / opening a new session / forking or dispatching a subagent / whether a long task needs goal | Output: evidence on disk + STATE.md write-back + a handover note when needed | Next: determined by STATE.md

---

## ① Start confirmation

After receiving the start instruction, give this receipt first:

1. **Restate the task**: this card governs how one session lives from start to close-out — when to close, when to open a new one, when to branch, when to use goal continuation rounds. It touches no business artifact.
2. **Assumptions (each with a confidence number; an assumption without one was never checked)**:
   - Assume the 75% threshold in D8 and "put evidence on disk before compaction" are this card's trigger lines (confidence 0.9; basis: the D8 text in `AGENTS.md` at the project root). If wrong, the session-close trigger lines do not hold.
   - Assume the three fields `起点锚点` / `最近完成` / `工作树状态` exist in `STATE.md` (confidence 0.8; basis: reading STATE.md). If wrong, fill the fields first and then follow this card.
   - Assume this round produces no business files, so every artifact is "session-only" (confidence 0.9; basis: this card only puts evidence on disk, writes back state and gives pointers).
3. **Clarifying questions (≤5, each with a recommended answer, so the user replies with one word)**:
   - Close this round or not? **Recommended: close it** — close on any session-close trigger below; do not wait for the context to fill up.
   - Write a handover note or not? **Recommended: yes** — write one when the work continues in another session or on another machine; not when the same session continues.
   - Start goal continuation rounds for a long task? **Recommended: yes** — only when it spans multiple cards and multiple sessions.
   - Dispatch a subagent for the next new session? **Recommended: no** — the same contract, the same observable behavior or the same root cause always stays on the main thread.
4. **Quote this card's §② checklist verbatim** (cannot quote it = this round is void):
   - "**Session close-out in four steps: evidence on disk → the working tree's three-way choice → STATE.md write-back → a handover note when the work crosses sessions. Walk all four steps in order.**"
   - "**Put evidence on disk before compaction**: the same command's red and green outputs are written to a file before compaction happens."
   - "**Session close-out does exactly three things: evidence on disk, state write-back, handover note. It creates no new repository document.**"
5. State: output locations = the batch notice or `docs/specs/<date>_<slug>/VERIFY.md` + `STATE.md` + `handover_<date>.md` in the system temp directory when needed; the next card is determined by the `下一步` field in `STATE.md`.

---

## ② Execution

**Red-flag table (hitting any row = stop and follow the Reality column):**

| You may think | Reality |
| --- | --- |
| "The conversation is flowing, don't interrupt" | Whether it flows has nothing to do with this card's trigger lines; close on any one of the four trigger lines |
| "The context is still enough, no need to close" | Trim at 75% (D8); once it is full, the order of trimming and putting evidence on disk is no longer yours to control |
| "It is in STATE.md anyway, I will carry on from memory" | Memory is not a source of truth; the next round recovers from `STATE.md` and git log only, and resuming from memory means redoing the previous round's work |
| "Leave the dirty working tree to the next session" | Uncommitted changes never enter history; make the three-way choice on the spot and write the outcome into STATE.md |

**Zero, the four objects (one boundary line each):**
- **One session**: one start confirmation through one close-out = one session; the close-out actions are in "two".
- **One task**: `当前任务` in `STATE.md`, from creation through archive; the archive action does not belong to this card (see "six").
- **One card**: one card is done when its four sections are walked; a card may finish inside the same session.
- **One goal round**: one automatic continuation round inside goal continuation rounds = one goal round; open it only for long tasks that span multiple cards (see "eight").

**One, triggers for closing a session (six; close on any one of them, and the agent judges them itself rather than waiting for the user to speak):**
1. The user says "先这样" ("let us leave it here") / "今天到这" ("that is it for today") / "明天继续" ("continue tomorrow") / "暂停" ("pause").
2. The context approaches its budget: per D8, trim at 75% of the smart zone, and close when trimming no longer helps.
3. One card is finished and the next card is about to start (close once, then start the next card).
4. Switching machines, or continuing the next day.
5. The task is already archived and there is no new intent.
6. The agent judges it itself: the same command is red twice in a row, or the same error appears for the second time (C2) — close out first, then start again.

**Two, session close-out in four steps: evidence on disk → the working tree's three-way choice → STATE.md write-back → a handover note when the work crosses sessions. Walk all four steps in order.**

**① Evidence on disk (before compaction)**: the same command's red and green outputs are written to a file before compaction happens — compaction folds "the same command's two results" into one, and once folded there is no evidence left to put on disk. Location = the batch notice or `docs/specs/<date>_<slug>/VERIFY.md`.
```powershell
$date = Get-Date -Format 'yyyy-MM-dd'
$slug = 'session-close'
"evidence on disk = docs/specs/${date}_$slug/VERIFY.md"
```
Expected: one location path is printed; the file holds the red output and the green output of the same command, each in its own block, with the command text above the block.

**② The working tree's three-way choice**: run `git status --short`; dirty → let the user pick one of three (commit now / log to `docs/TECH_DEBT.md` and shelve / discard the changes), and only close after it is handled.
❌ Counter-example: three changed lines show up and the receipt says "commit them together next time" | ✅ Example: three lines → the user picks "log and shelve" → three entries in `docs/TECH_DEBT.md` → `git status --short` is clean on the next run.

**③ Write back `STATE.md`**: `工作树状态` says "clean" or states the count of uncommitted items; `下一步` holds the next card number-name or "待新意图"; insert one line at the top of `最近完成` (date + one sentence + commit hash). Iron order: write back state → commit → re-run `check.ps1` for exit code 0.

**④ Write the handover note (when the work crosses sessions)**: see "seven".

**Three, triggers for opening a new session (four):** the context approaches its budget while this card is unfinished; switching machines; continuing the next day; one class of work is done and another class starts.

**Four, the new session's first action (four steps; skipping is forbidden):**
1. Read `AGENTS.md` and `STATE.md`.
2. Read `起点锚点` and `最近完成` in `STATE.md`.
3. Reconcile: read the anchor first, then check git log.
```powershell
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点').Line -replace '.*?([0-9a-f]{7,40}).*', '$1'
"anchor = $anchor"
git log --oneline "$anchor..HEAD"
```
Expected: `anchor = ` followed by a 7-to-40-character hash; then every commit after that anchor, one line each. If the two disagree, git log wins and the `最近完成` ledger is fixed on the spot.
4. Re-ask any action that needs a verdict, per "never infer approval from a previous session": what the user did not say in this session is not approved (C5).
❌ Counter-example: "you already agreed to the table change last session, so I am changing it now" | ✅ Example: "the previous session recorded 'awaiting your confirmation of the table change'; I have not heard it in this session, so asking once more: change it or not?"

**Five, the three-way split for branching (a counter-example for each):**
1. **Unrelated** independent tasks → open a new session; use `subagent` when only a condensed summary comes back. ❌ Counter-example: unrelated tasks packed into one session, where their contexts squeeze each other out.
2. **The same contract / the same observable behavior / the same root cause** → splitting into pieces is forbidden; stay on the main thread. ❌ Counter-example: the implementation and the verification of one contract given to two subagents, so each one sees only half.
3. A one-off analysis that must **inherit the current context** → `subagent_fork`. ❌ Counter-example: a one-off analysis that needs the previous session's verdict record dispatched with `subagent`, which amounts to making it guess from scratch.

**Six, session close-out ≠ task archive:**
- **Session close-out does exactly three things: evidence on disk, state write-back, handover note. It creates no new repository document.**
- **Task archive** runs on its own card (Next: 5-1 Archive): its output goes to `docs/archive/<date>_<slug>/` and it closes that task.
- The boundary in one line: session close-out closes "do not lose this round", task archive closes "this task is finished"; neither replaces the other.
❌ Counter-example: creating `docs/SESSION_LOG.md` to log the round at session close-out | ✅ Example: the evidence goes to `docs/specs/<date>_<slug>/VERIFY.md` and the pointers go to the handover note, so the repository gains no extra document.

**Seven, the handover note (six fields, written for the next session):** repository path / current card number / start anchor / next step / open questions / files to read with line numbers.
```powershell
$tmp = if ($env:TEMP) { $env:TEMP } else { '/tmp' }
$h = "$tmp/handover_$(Get-Date -Format 'yyyy-MM-dd').md"
"handover note path = $h"
Test-Path $h
```
Expected: a path such as `.../handover_2026-10-05.md` is printed; after writing, `Test-Path` returns `True`.
- Fixed location: the **system temp directory**, fixed file name `handover_<date>.md`.
- **Pointers, not copies**: give paths and line numbers for the text of `STATE.md` and `VERIFY.md`; copying paragraphs is forbidden (a copy always drifts).
- Desensitize sensitive values: token / password / phone number / email / real name are all written as "see password manager entry X / ask the user".
- **Delete the file once the handover is done**: `Remove-Item $h`; check the fields by counting the six names above and fill in any that are missing.

**Eight, when to use goal and plan mode:**
- A long task spanning multiple cards and multiple sessions → use goal continuation rounds; **with goal, every milestone still gets a receipt** (a milestone receipt = that round walks its four sections as usual).
- ❌ Counter-example: opening goal and running on without receipts, reporting only when everything is done.
- A one-off analysis that affects this session only → no goal (it ends when the session ends, so goal only adds a layer of state).
- Plan mode has two homes: the plan inside the start confirmation (this card's section ①); for a long task spanning sessions, write the plan into `未来 3 步` in `STATE.md` rather than leaving it in the conversation.

---

## ③ Evidence receipt

Give each item below; one missing item = the close-out is not done:
1. Session-close trigger: which of the six it hit (quote that line verbatim); if none, say "this round does not close".
2. The evidence location path from ② + the **red and green outputs** of the same command verbatim (red first).
3. The real `git status --short` output + the outcome of the three-way choice; then `git status --short` again after it is handled.
4. The `STATE.md` fields written back, one by one: `工作树状态` / `下一步` / the new `最近完成` line verbatim.
5. The handover note: path + `Test-Path` output (`True` / `False`) + the six fields one by one.

---

## ④ State write-back

Update `STATE.md`:
- `工作树状态` = clean (a non-empty value means this round still has changes outside history; handle them per the ② three-way choice first).
- `下一步` = the next card number-name, or "待新意图".
- Insert one line at the top of `最近完成`: date + one sentence + commit hash.
- `未决问题` = what close-out found but this round does not decide (write "none" when there is nothing).

Iron order: **write back state → `git add` + `git commit` → finally re-run `powershell -NoProfile -File check.ps1` for exit code 0.**

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
