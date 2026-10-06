# Card 7-10 · Tech stack migration
> Trigger: swapping language / framework / storage / runtime / hosting platform (the implementation substrate is replaced wholesale; internal behavior and data shape may change) ｜ Output: docs/decisions/STACK_<date>_<topic>.md + batched switch commits (one rollback point per batch) ｜ Next: 4-2 Self-check and guardrails (per batch) / 5-1 Archive (wrap-up)
> Process area: OPS, REL

---

## ① Start confirmation

1. **Boundary against 7-8 (judge this sentence first; judge it wrong and you stop right there)**: the external behavior must stay unchanged → 7-8; swapping language / framework / storage / runtime / hosting platform (the implementation substrate is replaced wholesale) → this card; what you want to change is user-visible behavior → go back to 2-1 for scoping, and neither card takes it. [disambiguated]
2. **Plain-language restatement and landing point**: say clearly "which substrate is swapped for which, and after the swap what users see is identical"; output = one selection record (`docs/decisions/STACK_<date>_<topic>.md`, shape = STACK_ + decision date + topic; for this run, for example `docs/decisions/STACK_2026-10-05_export-service.md`) + batched switch commits; next = 4-2 Self-check and guardrails (per batch) / 5-1 Archive (wrap-up).
3. **Non-delegable declaration**: SQL / data migration / the switch / deleting data are executed by a human; the agent only produces files and commands.
4. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "every caller of the old system can be found in the repository"), each noting the verification method.
5. **Clarifying questions (≤5, delete any that can be deleted; every question carries a recommended answer)**: which stack do we move to? Recommended = the highest total on the four-dimension scorecard (see step 1), so reply "agreed" ｜ how much downtime is acceptable? Recommended = 0 minutes (dual run, no downtime) ｜ how long should the rollback window be kept? Recommended = 7 days (counted from the switch commit). Anything findable in the code and the config must not be asked of the human.
6. **Quote the checklist of this card verbatim** (paste the "eight migration steps" and the "five acceptance items" from §② word for word).

---

## ② Execution

**Red-flag table (recite it item by item when starting; any row that appears = stop and do the work this card requires)**

| You may think | Reality |
| :-- | :-- |
| The new framework runs, so the migration is done | Running is only the first step; black-box contract and golden samples at zero difference + data reconciliation at zero + no regression in the observation window — all three together count as done |
| Do not delete the old system yet, keep it as a fallback | An unregistered old system = a second source of truth; either delete it when the rollback window expires, or register it in the STATE.md `并行态登记簿` (parallel-state register), with its deletion condition and due date |
| The data mismatch is a timezone issue, let us switch first and look later | The single criterion for switching reads is zero difference; "switch first, attribute later" = experimenting on production |
| A migration is just a rewrite | A rewrite swaps the implementation while external behavior stays unchanged (that goes through 7-8); this card's equivalence evidence comes from the black-box contract with the old system as the oracle, not from "writing it once more" |

**Eight migration steps (one step per batch; a missing step means the work has not started):**

**Step 1 Settle the choice first (no implementation code before the user's verdict)**
Four-dimension scorecard, each dimension scored 1~5, and every score must carry a source link (a score without a source does not count):

| Dimension | What it asks | Where the score comes from |
| :-- | :-- | :-- |
| Ecosystem and maintenance | who maintains it, the most recent release, how long support lasts | official repository and release-notes link |
| Migration cost | how big the change surface is, how the data moves, how long the downtime is | official migration guide + the baseline readings from step 2 |
| Running cost | hosting fees or self-hosted machines, how monitoring and backups work | official pricing-page link |
| Exit cost | what it costs to move away again after two years | the official export format and open-standard documentation |

- Landing point `docs/decisions/STACK_<date>_<topic>.md`: the four-dimension score table + the source link for each dimension + the rejection reason for each rejected option (one line per option).
- ❌ Counter-example: "the new framework is popular" (no scores, no sources, no rejected options) ｜ ✅ Good example: three candidates at 17 / 14 / 9, the two rejected ones each with a one-line reason, and the user replies "go with the 17"

**Step 2 Baseline measurement (no baseline, no start)**
- Behavior baseline: golden samples of 3~5 real inputs and outputs, landing in `out/golden/` (the old system's current output saved verbatim).
- Data scale: the row count of every table and the total record count, landing in `docs/registry/DATA_DICT.md`.
- Performance readings: run the same command 3 times and take the median; paste the command and the three raw readings into the receipt.
```powershell
1..3 | ForEach-Object { Measure-Command { powershell -NoProfile -File scripts/bench.ps1 } | Select-Object -ExpandProperty TotalMilliseconds }
```
- ❌ Counter-example: "a few hundred milliseconds, fast enough" (no command, no three readings, no median) ｜ ✅ Good example: three runs at 812 / 790 / 803 ms, median 803 ms, written into the selection record

**Step 3 Safety net: use the old system as the oracle (it must run across languages too)**
- Black-box contract: send the same batch of requests to the old system (≥3 critical paths × one each of normal / empty / error) and save the responses verbatim in `out/contract/old/`; run the same batch against the new system into `out/contract/new/` and compare byte for byte.
```powershell
$r = Invoke-WebRequest 'http://127.0.0.1:3000/api/orders/42' -UseBasicParsing
$r.Content | Set-Content -Encoding UTF8 out/contract/old/orders_42.json
```
- Until the golden samples and the black-box contract are fully green, the first line of new implementation code must not be touched; "the newly written unit tests are green" does not count as a safety net (tests you wrote yourself cannot prove agreement with the old system).

**Step 4 The four data-migration items (one missing and reads must not be switched)**
1. Back up before migrating: follow the backup steps in section 5 of `docs/RUNBOOK.md` and paste the backup file path into the receipt.
2. up / down scripts: down must reverse precisely, and a human runs it as a local dry run and pastes the output back; the agent only provides commands, it does not execute them.
3. Dual-run reconciliation: row counts and key-field checksums on both sides; switch reads only when the difference is zero.
```powershell
psql -d app_old -c "select count(*), md5(string_agg(id::text || amount::text, ',' order by id)) from orders"
psql -d app_new -c "select count(*), md5(string_agg(id::text || amount::text, ',' order by id)) from orders"
```
4. Migration-file registration: every migration file path + the column-level definition of every column, written into `docs/registry/DATA_DICT.md`.
- ❌ Counter-example: letting the framework auto-generate down; reconciling only the total and not the key fields ｜ ✅ Good example: the human's dry-run output for down is pasted; both sides read 12043 = 12043 with identical checksums, difference 0

**Step 5 Switch criteria and rollback window (hard-coded, never widened on the spot)**
- Switch only when all three criteria are green: ① reconciliation difference zero ② black-box contract + golden samples difference zero ③ no regression within the observation window (24 hours by default).
- Rollback window = 7 days counted from the switch commit; inside the window the old substrate, the old data and the old config stay switchable-back, and the switch-back commands go into the batch table one per line (with the commit hash).
- The three switch-back steps are hard-coded: stop the new substrate from taking traffic → point the config back at the old substrate (commands given in full) → run the golden samples on the old data to confirm the behavior really returns.
- ❌ Counter-example: "if something goes wrong we switch back" (no window length, no switch-back command) ｜ ✅ Good example: `rollback window 2026-10-05 to 2026-10-12 ｜ switch-back command in row 3 of the batch table`

**Step 6 Drill the one-way door first (a rollback never drilled = no rollback)**
A one-way door = a step that cannot be undone once taken (for example: dropping the old table, changing an external interface, switching DNS resolution). Before running it for the first time, run the whole rollback once locally or on staging and record the command, the result and the time it took.
- ❌ Counter-example: running the one-way door straight on production, and only discovering on failure that the down script was never run ｜ ✅ Good example: one line of drill record `command in the batch table ｜ result success ｜ took 4 minutes`

**Step 7 Retire the old substrate (delete only after everything is green)**
Once the three criteria of step 5 are green, delete the old implementation, the old config and the old switches; anything that cannot be deleted is registered in the `并行态登记簿` (parallel-state register) in `STATE.md` (with its deletion condition and due date).
```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '_old|_legacy'
```

**Step 8 Batch discipline (break it and it is not a batch)**
- One batch = one commit = one rollback point; between batches `git status --short` must print nothing.
- A batch must not carry feature changes, dependency upgrades or config changes; a newly found problem → register it in `docs/TECH_DEBT.md`.
```powershell
$anchor = git rev-parse --short HEAD
git status --short
git diff --numstat "$anchor..HEAD"
```

**The five acceptance items (one missing = not done)**
1. **Behavior equivalence**: black-box contract and golden samples compared group by group, difference zero, with the comparison pasted into the receipt.
2. **Data reconciliation at zero**: row counts and key-field checksums identical on both sides.
3. **Full guardrail green**: `powershell -NoProfile -File check.ps1` exit code 0 + the output pasted.
4. **Old substrate retired**: the search returns zero leftovers, or all of them are registered in the parallel-state register.
5. **Dependency and structural constraints written back**: `docs/ARCHITECTURE.md` and the three-part set in `docs/registry/` (COMPONENTS / DATA_DICT / APIS) updated for the new substrate.

**Prohibitions (violating any one of them = this round's output is void):**
- Touching implementation code before the selection record has the user's verdict is forbidden
- Starting without a baseline (golden samples / data scale / performance readings) is forbidden
- Using "the newly written unit tests are green" as behavior-equivalence evidence is forbidden
- Switching reads while reconciliation still shows a difference is forbidden
- Running a one-way door without a drill is forbidden
- Neither deleting the old substrate nor registering it is forbidden

---

## ③ Evidence receipt

Give, item by item (only three kinds of evidence count: real command output / file paths / commit hashes):
1. The boundary verdict verbatim (this task is this card, or it goes through 7-8 / back to 2-1) + the user's verdict on the selection record, quoted verbatim + the selection-record path
2. The three baseline items: golden-sample groups and path, data-scale readings, the three raw performance readings and the median
3. Safety-net evidence: the side-by-side response comparison of the black-box contract, the group-by-group golden-sample comparison (difference zero for each)
4. The four data items: backup path, up / down paths + the human's dry-run output for down, the readings on both sides of the reconciliation, the DATA_DICT registration path
5. Switch and rollback: the actual readings for the three switch criteria, the rollback window's start and end dates, the switch-back commands verbatim, the one-way-door drill record (command / result / time taken)
6. The batch table: each batch's commit hash, net lines added and removed, rollback point
7. The five acceptance items, item by item (difference zero / reconciliation zero / check.ps1 exit code and output / retirement search output / structural-constraint write-back paths)
8. The list of un-retired old substrates with their due dates (write "none" if there are none)

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `当前任务` kept (another batch remains) or cleared (wrap-up)
- `下一步` = 4-2 Self-check and guardrails (another batch remains) / 5-1 Archive (wrap-up)
- `未决问题` = un-retired old substrates and their due dates, the rollback window's expiry date, differences awaiting the user's verdict
- `档位` = a substrate swap is always tier L, with the reason written out
- `工作树状态` = 干净 (must be clean between batches)

```powershell
$slug = 'stack-migration'; $msg = '导出服务迁到新载体（行为等价）'
git add STATE.md docs/decisions docs/registry src
git commit -m "7-10 migration(${slug}): $msg"
powershell -NoProfile -File check.ps1
```
(`git add -A` / `git add .` are forbidden; stuffing several batches into one commit is forbidden.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
