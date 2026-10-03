# Card 8-2 · Context and Memory (read for long tasks or when context runs tight)
> Trigger: a task spans several turns, context is nearly full, memory is written, or work must be handed to a new session. | Output: the `STATE.md` handover trio + memory entries. | Next: back to the current tier's main line (S→4-1 / M→2-x or 4-1 / L→3-1; incident line→6-1).

---

## ① Start confirmation

Confirm in four lines; a missing line blocks the work:

1. Current task and card (one sentence) + how many rounds have run.
2. Context level: estimate a percentage; above half, finish Action 2 first.
3. Memory entries to write this round (one per line, or "none") and where they belong (user preference / project fact).
4. Handover target: the same session continues, or a new session starts (a new session needs all three handover items).

---

## ② Execution

### Action 1 · Know the four fact layers (decide who wins before reading)

| Layer | Holds | Authority | How to use |
| :-- | :-- | :-- | :-- |
| Conversation window | This turn's words and tool output | Most perishable | Draft only; conclusions must land in one of the layers below |
| Hot memory (`USER.md` / `MEMORY.md`, read and written by `mnemon_runtime_memory`) | User preferences, stable facts | Preferences defer to the user; facts may be stale | Readable at start; write rules in Action 3 |
| Project documents (mnemon documents) | Reusable project knowledge | Historical, not guaranteed current | Search old decisions and rules with `mnemon_recall` / `mnemon_document_search` |
| Repository files (code, `STATE.md`, `docs/`) | The actual current state | **The only source of truth** | Open and confirm before claiming; on conflict, the repository wins |

❌ Claiming "the function was fixed" from last turn's chat. ✅ Open the file, confirm, then claim.
❌ Following memory when it conflicts with the repository. ✅ Trust the repository, then correct or remove the stale entry.

### Action 2 · Compression (compress when due; all four summary items are mandatory)

Compress when: context passes half; a phase (a file batch or a card) ends; the topic changes; a long-output command finishes.

A compression summary must contain:

1. Full paths with line numbers (every key file down to the line).
2. Key source sentences (criteria, error text, command wording copied verbatim, not paraphrased).
3. Decisions and reasons (why A over B).
4. Open items (unfinished work, who owes a reply, the next action).

```powershell
# Persist key evidence before compressing; do not leave it only in the session
Get-ChildItem -Path 'docs' -Filter '*.md' | Select-Object -First 5 Name, Length
```

❌ Writing "changed a few files roughly". ✅ Writing locations like `docs/RUNBOOK.md:31` that can be re-checked.
❌ Scrolling back for raw output after compressing (it is gone). ✅ Persist evidence into files first.

### Action 3 · Memory write rules (rather too few than too many)

Write only two kinds: ① user preferences and hard rules (who the user is, how to communicate, explicit musts and must-nots); ② stable facts (project conventions, environment traps, decisions with reasons, reusable lessons).

Never write: questions, guesses, temporary progress, completion logs, evidence read out of memory or documents, secrets.

De-duplicate before writing: update an existing entry instead of adding a new one; replace to correct, remove to withdraw. Mark one-off facts low priority and explicit must-follow rules high.

Tool split: session-level hot memory goes to `mnemon_runtime_memory`; insights worth keeping long-term go to `mnemon_remember`; large reusable knowledge becomes a project document via `mnemon_document_create`. Never write credentials or tokens.

❌ Writing "finished reading the spec" into memory (temporary progress). ✅ Writing only conventions that stay useful.
❌ Copying retrieved evidence back into memory. ✅ Use it and move on.

### Action 4 · The handover trio (mandatory before switching sessions or machines)

1. `STATE.md` `下一步`: name the card to run ("run card X-Y, name"), never "continue the previous work".
2. `STATE.md` `最近归档`: the last wrap-up's date + what was done + commit hash.
3. `STATE.md` `未决问题`: each item awaiting the user's verdict with options and impact.

All three in place before you stop; the new session's first move is "read `STATE.md` and start from the `下一步` card".

❌ Handing over with "I explained it in context". ✅ Put all three in `STATE.md` so any session can read them.
❌ Leaving `下一步` empty or "TBD". ✅ Write a concrete card number and name.

### Action 5 · Long tasks (a goal's continuation rounds + milestone receipts)

For work beyond one round: create a goal (one-sentence objective + completion criteria), then work milestone by milestone, giving a receipt at each milestone (what was done / evidence / next milestone / whether the completion criteria still hold).

Mark the goal complete when achieved; if the same blocker persists for three consecutive rounds, mark it blocked and name that blocker instead of grinding on.

❌ Using a goal as auto-continue to skip per-round receipts. ✅ Leave a milestone receipt every round.
❌ Keeping an old goal after the objective changed. ✅ Change the goal first, then continue.

### Action 6 · Privacy and credentials

- Secrets, tokens and connection strings live only in `.env` (already ignored); never in the conversation, memory or commits.
- Never paste real credentials into logs, screenshots or receipts; rotate anything that leaked.
- Memory entries record where a credential lives, never the credential itself.

### Action 7 · Self-check command (copy and run)

```powershell
$s = Get-Content 'STATE.md' -Encoding UTF8
foreach ($k in @('## 下一步','## 最近归档','## 未决问题')) {
  if ($s -match [regex]::Escape($k)) { "OK $k" } else { "MISS $k" }
}
$s | Select-String -Pattern '执行哪张卡' | Select-Object -First 1
powershell -NoProfile -File check.ps1
```

Criteria: three `OK` lines + a `下一步` line naming the card + `check.ps1` exit code 0. A missing one means the handover is unfinished.

**Prohibitions (violating any one voids this round's output)**

- Never let session memory replace opening and confirming a file.
- Never put secrets or tokens into context, memory or the repository.
- Never use "context is nearly full" as an excuse to skip the four summary items.

Boundary: this card selects no tier and reorders no main line; it is walked only for long tasks, tight context, or handovers.

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give each one:

1. The basis for the context-level judgement + where compression happened.
2. The compression summary's landing point (file path + line count) or the summary itself.
3. Memory entries: which ones, in which file, and why they are not temporary progress.
4. The handover trio: line numbers of the three `STATE.md` spots + key content lines.
5. Self-check output (three `OK` lines and the `check.ps1` exit code).

---

## ④ State write-back

1. Write back first: add one line to `STATE.md` `最近归档` (date + what was done + commit hash); update each `未决问题` item; point `下一步` at the card that will actually run.
2. This card does not move the main-line pointer unless it changed main-line deliverables; beyond the trio, do not rewrite other fields in passing.
3. Then commit: `git add -A`, `git commit -m "8-2 docs(memory): handover trio and memory entries"`.
4. Finally re-run `powershell -NoProfile -File check.ps1` and take exit code 0.

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
