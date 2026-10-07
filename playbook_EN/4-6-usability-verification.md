# Card 4-6 · Usability verification (put what you built in front of a human and watch where they stall)
> Trigger: a deliverable is about to go in front of a human (there is a UI / there are real users) | Output: docs/specs/<date>_<slug>/USABILITY.md | Next: 5-1 Archive
> Process area: VER

---

## ① Start confirmation

After receiving the start instruction, first receipt the following four items before touching anything (do not start with an item missing); and declare this card's output = `docs/specs/<date>_<slug>/USABILITY.md`, next card = 5-1 Archive.

1. **Task restatement**: one plain sentence — "who is doing it, from what starting point, which few things they do, and how I tell whether they got it".
2. **Assumptions list**: write "I assume X; if that is wrong then Y is void" item by item (e.g. I assume the tester has never seen this UI; if that is wrong then task 1 detects nothing). Anything findable in SCOPE.md or UI.md must not be written as an assumption.
3. **Clarifying questions (≤5, delete what you can)**: ask only the hard information that decides the task design — what does he have in hand when he first opens it? why is he using it (what is his own goal)? is there a scenario that must not fail? can the screen be recorded? by when is a conclusion needed?
4. **This card's checklist verbatim (restate these five items word for word at start, tick them one by one before finishing; each item's full criterion lives in the matching §② action)**:
   - [ ] ① The boundary against `4-3 Verification` is written down: 4-3 answers "does the feature run" (command exit code), this card answers "can a human keep using it" (behaviour observation); **evidence from the two sides must not stand in for each other** (4-3's green cannot serve as this card's evidence, and this card's observations cannot overturn 4-3's red; only when both are green does pre-delivery pass) — see Action 1
   - [ ] ② 3–5 tasks designed, each with all four parts: **one-sentence scenario + starting state + success criterion + stop condition**; at least one task is the "first time using it" cold-start path (from zero, no teaching first) — see Action 2
   - [ ] ③ ≥1 participant, and **not the person writing the code**; in single-person mode with no second person, take the `冷启动自测` ("cold-start self-test") branch and declare it explicitly (see Action 3); the observation table records six columns per task, row by row: completed/abandoned, time taken, help-request count, the exact place they stalled, **verbatim quotes**, my guesses — and records **behaviour and verbatim quotes** only, never opinion questions like "do you think it is easy to use" (an answer to an opinion question does not count as evidence) — see Action 4
   - [ ] ④ Grade every problem: **阻断** (blocker: cannot finish) / **摩擦** (friction: slow, or wrong once) / **皮痛** (paper cut: complained, but completion was unaffected), and land each on one of three dispositions: fix / register as tech debt / explicit acceptance with a written reason — **a non-landing state such as "to be watched" is forbidden** — see Action 5
   - [ ] ⑤ The conclusion gives at least one **actionable change** (naming which file or which control changes), or writes "no change this round + reason"; unmet items must stay in the document and deleting them because they were fixed later is forbidden (deletion = erasing this round's conclusion); landing point `docs/specs/<date>_<slug>/USABILITY.md`, and STATE.md `下一步` set to 5-1 Archive; run the Action 8 self-check command, exit code 0

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do the missing work this card requires)**

| You may think | Reality |
| :-- | :-- |
| I clicked through it myself and it all works | The path you clicked is the path you designed yourself; you know where every button is. **Someone who knows the answer cannot test discoverability** |
| 4-3 is all green, no need to test again | 4-3's green proves "it runs", it does not prove "it is understandable". A large share of failures happen when every feature is correct and the human cannot find the entry |
| Asking "what do you think of it" is enough | An opinion question buys politeness, not data. What you need is "which step made him stop for 8 seconds" |
| He got it wrong, so the user does not know how to use it | The default criterion is the exact opposite: **when a human gets it wrong, first assume the UI did not say it clearly**, unless you can point to the correct hint he saw |
| It is one person, too small a sample to mean anything | 5 people catch ~85% of usability problems, and 1 person still catches the coarsest class; **0 people catch nothing at all** |

**Action 1: draw the line against 4-3 first (prevent evidence from standing in for each other)**

| | `4-3 Verification` | This card (4-6) |
| :-- | :-- | :-- |
| The question it asks | is the feature correct, does the command exit 0 | can a human finish it on their own |
| Evidence form | command output, assertions, coverage | behaviour records, verbatim quotes, where they stalled |
| What failure looks like | red | the human stands still, clicks repeatedly, gives up |

**Action 2: task design (3–5 tasks, with all four parts written out)**

| Field | How to write it | Counter-example |
| :-- | :-- | :-- |
| One-sentence scenario | say it in the user's goal, not the feature name | "Test the export feature" (that is a feature name, not a goal). Good example: "hand last month's records to a colleague" |
| Starting state | from which page, with how much data, signed in or not | leave it out → the results of each run are not comparable |
| Success criterion | an observable result (what appears on screen / where the file lands) | "he thought it was good" |
| Stop condition | after how many minutes / how many help requests you stop | leave it out → you sit with them until the end and detect nothing |

**Task-quota iron rule**: at least 1 cold-start task (first time using it, nobody teaching) + at least 1 **high-frequency task** (the one the user does every day) + at most 1 corner feature. **Corner features must not be the majority** — testing corners is the least work and the least useful.

**Action 3: participants (where the humans come from)**

| Branch | When to use it | How to do it | Evidence strength |
| :-- | :-- | :-- | :-- |
| Live observation | a non-developer can be found (colleague, friend, target user) | 1–3 people, **≥1 person**; read the task aloud only, never explain the UI | strong |
| `冷启动自测` ("cold-start self-test") | single-person mode with no second person to find | shut off all context (do not read the code, this round's change record, or this card), wait ≥1 day and walk it again; **record the whole session or screenshot screen by screen** | medium (must be declared explicitly; passing it off as a live human test is forbidden) |
| Remote asynchronous | schedules do not line up | hand over the task card + have them record the screen and send it back, then review it yourself against the observation table | medium |

**Hard requirements for the cold-start self-test**: never test while reading the code (that is re-review, not usability verification); every time you stall, first write "where I stalled and what I expected to see", then go and look up the cause.

**Action 4: observation table (behaviour and verbatim quotes only, six columns)**

| Task | Result | Time | Help requests | Exact place they stalled | Verbatim quotes | My guesses |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| T1 first open | completed / abandoned | seconds | count | page + control + what he was looking for | recorded word for word | finish recording before guessing |

Rules:
- **Record verbatim quotes word for word**; do not paraphrase them into "he said he could not find it" — paraphrasing loses the clue ("那个…保存的东西" — "that… the save thing" — shows he does not remember what the feature is called, which is a naming problem)
- **Guesses go in their own column**, separate from the observations; writing the two together = evidence contaminated by interpretation
- Silence is data too: **a pause of ≥8 seconds** gets an entry under "exact place they stalled", together with which block he was staring at
- Help requests split in two: asking "what does this button mean" (a copy problem) and asking "where should I go" (an information-architecture problem)

**Action 5: grading and disposition (every problem must land, one of three)**

| Severity | Criterion | Disposition tendency |
| :-- | :-- | :-- |
| 阻断 (blocker) | the task cannot be finished, or it finishes with a wrong result | must be fixed in this batch; if it cannot be fixed, register tech debt and state exactly who is affected |
| 摩擦 (friction) | finished, but slowly, by a detour, or after a retry | fix it if you can; if you cannot, register tech debt |
| 皮痛 (paper cut) | he complained, but completion was unaffected | explicit acceptance plus a written reason (do not break something else just to silence a complaint) |

How to write the disposition: `问题 → 级别 → 改哪个文件/控件 或 登记到 TECH_DEBT.md 第几行 或 接受（理由）` ("problem → severity → which file/control changes, or registered at which line of TECH_DEBT.md, or accepted (reason)").

**Action 6: conclusion (must be actionable, or an explicit no-change)**
- At least one sentence of the conclusion is a **verb-object phrase + landing point**: "change the Y button copy on page X from A to B", or "no change this round (reason: the target user is myself, and the cold-start self-test produced no blocker)"
- Put the most glaring item on the first line — the report is for your future self, so give the conclusion before the data
- Writing a conclusion with no landing point, such as "the overall experience is good", is forbidden

**Action 7: wiring to the neighbouring cards**

| Case | Where it goes |
| :-- | :-- |
| What the observation exposes is a requirement that was never pinned down (two groups of people need different things) | go back to `2-2 Scope definition` to fill in the scope; do not change it on this card |
| What it exposes is copy, hierarchy or control specs | take `7-1 UI change` (with this card's document as input) |
| What it exposes is a missing feature | go back to `2-1 Feature research` to open it as a project |
| What it exposes is an accessibility problem (keyboard traps, insufficient contrast) | take `7-6 Internationalization and accessibility` |

**Action 8: usability-verification self-check (run it at the project root; non-developers only read the exit code: exit 1 = this card is not done)** Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator); save scripts as UTF-8 with a BOM.
```powershell
$m = 'docs/specs'; $f = @(Get-ChildItem $m -Recurse -Filter 'USABILITY.md' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending); if ($f.Count -eq 0) { Write-Host '[FAIL] 找不到 USABILITY.md'; exit 1 }; $p = $f[0].FullName; $l = @(Get-Content $p -Encoding UTF8); $txt = $l -join "`n"; $task = @($l | Where-Object { $_ -match '^\|\s*T[0-9]' }).Count; $lvl = @('阻断','摩擦','皮痛') | Where-Object { $txt -match $_ }; $act = @($l | Where-Object { $_ -match '改哪个|登记到|接受（理由' }).Count; $cold = @($l | Where-Object { $_ -match '冷启动' }).Count; "USABILITY.md $p 行数 $($l.Count)"; "任务行 $task（要求 3-5）；级别命中 $($lvl.Count)/3；处置行 $act（要求 ≥1）；冷启动命中 $cold（要求 ≥1）"; if ($task -lt 3 -or $task -gt 5 -or $lvl.Count -lt 3 -or $act -lt 1 -or $cold -lt 1) { Write-Host '[FAIL] 本卡自查未过'; exit 1 } else { Write-Host '[OK] 本卡自查通过' }
```
Expected: when `$m = 'docs/specs'` **does not exist**, `-ErrorAction SilentlyContinue` swallows the error ⇒ you get the **same** result as "the directory exists but holds no such file": just `[FAIL] 找不到 USABILITY.md` and **exit code 1** (measured: 1 line of output in total) — before believing that FAIL, run `Test-Path docs/specs`; do not read it as "I wrote it but it was not found". With several copies (one per spec) it takes the **newest by LastWriteTime** (measured: it picked `…\docs\specs\2026-10-05_new\USABILITY.md` and ignored the earlier one) ⇒ verify that the `USABILITY.md <absolute path> 行数 N` line points at the copy you think it does. The four readings: `任务行` counts lines starting with `| T<digit>` and wants 3–5 (measured with thin content: `任务行 2`); `级别命中 /3` searches the whole file for `阻断` / `摩擦` / `皮痛`; `处置行` matches `改哪个|登记到|接受（理由`; `冷启动命中` matches `冷启动`. Any miss → `[FAIL] 本卡自查未过` + exit code 1; only a full pass prints `[OK] 本卡自查通过` (exit code 0).

**Prohibitions (any violation = this round's output is void):**
- Using the command output of `4-3 Verification` as usability evidence is forbidden
- Testing only yourself is forbidden (the only exception is the explicitly declared cold-start self-test branch, and it must have a screen recording or screen-by-screen screenshots)
- Leading is forbidden: never say in the task what the button is called, which column it sits in, or what to click first
- Replacing behaviour observation with "do you think it is easy to use" is forbidden
- Writing guesses in the observation columns is forbidden (guesses go only in the "my guesses" column)
- Deleting unmet items from the document is forbidden
- ❌ Counter-example: clicking through it yourself three times and writing "the experience is smooth" | ✅ Good example: 3 tasks + 1 person observing + six-column records + 2 blocker grades + 2 changes carrying a landing point

---

## ③ Evidence receipt (only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished)

1. Full path of `USABILITY.md` + line count
2. The boundary statement against `4-3 Verification` verbatim (one sentence) and the branch actually run this time (live observation / cold-start self-test / remote asynchronous)
3. The task design verbatim (3–5 tasks, each with all four parts: scenario + starting point + criterion + stop condition)
4. Participant information: how many people, their relation to the project, whether they write the code; for a cold-start self-test, attach the screen-recording or screen-by-screen screenshot paths
5. The observation table verbatim (all six columns, verbatim quotes, guesses in their own column)
6. Grading and disposition verbatim (each item lands on one of "fix / register tech debt / accept (reason)")
7. The conclusion verbatim (≥1 actionable change carrying a landing point; or no change + reason)
8. Real output of the Action 8 command (tasks 3–5, severities 3/3, dispositions ≥1, cold start ≥1; exit code 0) + this round's commit hash
9. Open-questions list (the usability trade-offs the user has not settled, item by item)

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` = this task name (link `docs/specs/<date>_<slug>/USABILITY.md`)
- `未决问题` = the usability trade-offs not yet settled (whether to fix friction-level problems, whether to re-test with someone closer to the target user, item by item)
- `裁剪记录` = when no second participant can be found, write "单人档走冷启动自测，已声明" ("single-person mode runs the cold-start self-test, and it has been declared"); `下一步` = 5-1 Archive

```powershell
$m = 'docs/specs/<日期>_<slug>/USABILITY.md'; git add STATE.md $m; git commit -m "4-6 docs(usability): 任务观测与处置"; powershell -NoProfile -File check.ps1
```
Expected: `<日期>_<slug>` inside `$m` is a **placeholder**: run it unsubstituted and `git add STATE.md docs/specs/<日期>_<slug>/USABILITY.md` prints `fatal: pathspec 'docs/specs/<日期>_<slug>/USABILITY.md' did not match any files` with **exit code 128** and **nothing at all staged** (measured: 0 files — not even `STATE.md`) ⇒ that is the mechanical proof of "the placeholder was never replaced", not of "the file is not written yet". Only after substituting a real spec directory that really holds the file does it print 0 lines and exit 0 (`git add` stages only files that really changed: with the target untouched only `STATE.md` goes in). A successful `git commit` prints `[main <short-hash>] 4-6 docs(usability): 任务观测与处置` + ` N files changed, M insertions(+)` and exits 0; an empty staging list prints `nothing to commit, working tree clean` and exits 1. `check.ps1` must end with `全部通过（退出码 0）：完成声明成立。`
The exit code must be 0; if non-0 → stop and ask the user; declaring this card done is forbidden.

Fixed closing line:
Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
