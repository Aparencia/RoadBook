# Card 8-1 · Agent Teams Orchestration (read before multi-file or parallel work)
> Trigger: one change spans several files, the task splits into non-overlapping chunks, or a command runs long. | Output: task-board receipts + the `STATE.md` parallel-state ledger. | Next: back to the current tier's main line (S→4-1 / M→2-x or 4-1 / L→3-1; incident line→6-1).

---

## ① Start confirmation

Confirm in five lines before touching anything; a missing line blocks the work:

1. Task restated with landing points: which files change (full paths) and who owns each.
2. Form chosen: from the table in Action 1, name one primary form (single thread / subagent / subagent_fork / teammate / workflow / background job) plus one line of reasoning.
3. Parallel chunks: chunk name + write scope (file or directory prefix) + dependencies.
4. Open questions (≤5): write-scope collisions, shared-file ownership, acceptance command.
5. Deliverables and next card: task-board receipts + the `STATE.md` parallel-state ledger.

A confirmation containing "probably", "should be fine" or "let me look" means no form was chosen — rewrite it.

---

## ② Execution

### Action 1 · Choose the form (one primary form per task)

| Form | Use when | Do not use when |
| :-- | :-- | :-- |
| Single thread | One file changes, or the edits constrain each other | Two or more independent files exist (you just wait) |
| `subagent` | One-shot independent work: research, a single audit, an unrelated report | You will follow up on the same topic (it forgets the previous turn) |
| `subagent_fork` | It must inherit this conversation to continue analysis or review | The task is unrelated to this conversation (wasted context) |
| `teammate` | Durable role: multiple rework rounds, collects receipts, needs the task board | Work finishes in one shot (setup costs more than the work) |
| `workflow` | One process fanned out over many items (audit per file, batch migration) | Fewer than 5 items, or the steps are strictly sequential |
| Background job | One long command (full test run, build, dependency install) | Short commands (starting a job is slower than running it) |

❌ Spawning a `teammate` to edit one file. ✅ Edit one file yourself.
❌ Handing the same report to three agents to "look parallel". ✅ Give each agent one non-overlapping write scope.

### Action 2 · Build the team and set write scopes (only when using `teammate`)

Criteria: at most 5 concurrent writers; one non-overlapping write scope per writer; shared files (`STATE.md`, `AGENTS.md`, `README.md`, gate scripts, design docs) belong to the Lead alone, writers may only request changes.

Build the team with `spawn_teammate`, dispatch and follow up with `send_message`, wait for replies with `wait_agent`; the task board follows in Action 3.

The dispatch message must carry five fields: task id / goal and acceptance command / write scope (path list) / contract file path (the spec text) / receipt format. A missing field voids that agent's output.

A write scope is advisory, not a lock: when two writers edit one file, the later write silently overwrites the earlier one — so list every file before dispatching.

### Action 3 · Task-board flow (create, then claim with a revision)

```powershell
# Lead creates: team_task_create (state acceptance command and write scope)
# Writer claims: team_task_get for the current revision, then team_task_update(action=claim, expected_revision)
# Writer completes: fetch the current revision again, then team_task_update(action=complete, expected_revision)
# Inspect: team_task_list; dependencies: record prerequisite task ids in blocked_by; never start a task whose ready is false
```

❌ Claiming without a revision (overwrites another writer's state under concurrency). ✅ Re-fetch the current revision before every action.
❌ Agreeing on dependencies in chat only. ✅ Record them in the task's `blocked_by`.

### Action 4 · Receipts (≤10 lines per task, failures included)

Five fixed fields: task id / status (done | blocked | failed) / changed files (full path + line count) / evidence (key lines of real command output, commit hash) / blocker (one line plus who must do what). Send the receipt to the dispatcher with `send_message`.

❌ Dispatching the next task before a receipt arrives. ✅ Confirm "receipt received", then dispatch the next item.
❌ Treating "sent" as "received". ✅ It counts only when the other side's receipt arrives.
❌ Retrying silently after a failure. ✅ Record the blocker, switch form, or stop and ask.

### Action 5 · Acceptance (the Lead runs it; self-reports do not count)

1. Run the full gate: `powershell -NoProfile -File check.ps1`; exit code 0 is the only pass (paste the real output).
2. Sample the diff: `git diff --stat`, then read at least two files written by someone other than the Lead, line by line.
3. Reconcile the list: name every changed file and match it to the dispatched write scope.
4. Any failure → send the task back to its author; do not fix it for them.

❌ Trusting "I finished, should be fine". ✅ Gate output plus a line-by-line diff read.
❌ Running only the checks related to changed files. ✅ Full gate plus sampled diff.

### Action 6 · Context budget and cost

- Each teammate has its own context; the Lead keeps summaries and receipts only, never raw text.
- Compress once at the end of each phase before starting the next; a compression summary must contain full paths with line numbers, key source sentences, decisions with reasons, and open items.
- Read `cost-meter` before setting concurrency: more writers burn tokens faster; stop idle teammates when a phase ends.
- Model choice: cheap fast models for mechanical rewrites and checks, strong models for design and adjudication.

### Action 7 · Anti-patterns (hitting any one forces a phase redo)

1. Two writers editing one file (the later write overwrites the earlier one silently).
2. Dispatching more work before receipts arrive.
3. Treating "sent" as "received".
4. The Lead only aggregates and never verifies (self-reports treated as done).
5. Using a team for single-file work (coordination costs more than the work).
6. Handing shared files to a writer.
7. Dispatch messages without an acceptance command (nobody knows when it is right).

**Prohibitions (violating any one voids this round's output)**

- Never treat overlapping write scopes as "more hands, more speed".
- Never replace the Lead's full gate with "it passed on my side".
- Never put secrets or credentials into dispatch messages or receipts.

Boundary: this card selects no tier and reorders no main line; it is walked only when multi-file parallel work is possible.

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give each one:

1. Form and reasoning (one line).
2. Task board: task id + status (key lines from `team_task_list`).
3. Per writer: write scope + the five receipt fields.
4. Gate: `check.ps1` exit code + key output lines.
5. Diff sampling: file paths + which lines were read.
6. Parallel-state ledger: rows added or cleared.

---

## ④ State write-back

1. Write back first: when an old and a new implementation coexist, add a row to the `STATE.md` parallel-state ledger (parallel state / old implementation / new implementation / deletion condition (decidable) / due / registration batch); delete the row for any parallel state cleared in this phase.
2. This card does not move the main-line pointer unless it changed main-line deliverables; `STATE.md` only updates the `最近完成` (rolling 5) section and the parallel-state ledger, leaving `下一步` on the same card as before.
3. Then commit: `git add -A`, `git commit -m "8-1 chore(team): agent-team receipts and parallel-state ledger"`.
4. Finally re-run `powershell -NoProfile -File check.ps1` and take exit code 0.

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
