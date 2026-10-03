# Card 5-5 · Backup and restore drill (run additionally on a schedule / after a data-structure change)
> Trigger: on a schedule (every 90 days by default) or after a data-structure change ｜ Output: the "备份与恢复演练" (backup and restore drill) section of `docs/RUNBOOK.md` + the drill record ｜ Next: awaiting a new intent (drill record expired → 6-6 process audit; restore failed and users are already affected → 6-1 incident response)

---

## ① Start confirmation

After receiving the start instruction, first return the following five items before doing anything:

1. **Restate the task and its landing point**: is this a scheduled drill or a drill after a data-structure change? what are the backup objects? (read `当前任务` in `STATE.md` + the "备份与恢复演练" (backup and restore drill) section of `docs/RUNBOOK.md`, one sentence); output = the "备份与恢复" section of `docs/RUNBOOK.md` + the drill record; next card = awaiting a new intent.
2. **Assumptions**: write down, one per line, "I assume X; if wrong, Y becomes invalid" — anything findable in `docs/RUNBOOK.md` and `docs/registry/DATA_DICT.md` must not be written as an assumption.
3. **Clarifying questions (≤5, drop whatever can be dropped)**: three defaults — where is a restore drill allowed (a new local directory / staging / a temporary database)? how long counts as "restored to usable" (the longest downtime the business can accept)? how much data loss is acceptable (how many recent minutes)? Anything findable in `docs/RUNBOOK.md` and `docs/registry/DATA_DICT.md` must not be asked.
4. **Quote the checklist verbatim** (paste, word for word, the "five-column backup list + three restore-drill steps + verify both sides + expiry criterion + prohibitions list" of §② of this card).
5. And declare: the date of the last drill (if it cannot be found, say plainly "never drilled"), this drill's target RTO/RPO numbers, and the absolute path of the drill environment.

---

## ② Execution

**Action 1: Backup list (all five columns filled; a missing column = not knowing what to restore when it matters)**

| Backup object (down to the file/table/bucket path) | Frequency | Storage location (write the full path or the remote secret name) | Retention | Encrypted |
| :--- | :--- | :--- | :--- | :-: |
| Example: `data/app.db` | daily 03:00 | Example: `D:/backup/app/` + one off-site copy | 30 days | yes |
| Example: `.env` (secrets stored separately in the password vault) | on change | Example: the vault entry name | long term | yes |
| Example: the user upload directory `data/uploads/` | daily 03:00 | Example: the object-storage bucket name | 90 days | no (the content itself is not sensitive) |

- Objects must be **concrete**: writing "the whole project" = not written; go through `docs/registry/DATA_DICT.md` table by table, and do not miss newly added tables/fields
- Retention must be a number (not "keep forever"); state encryption or non-encryption for each row, and give a reason for anything not encrypted
- The backup job must have **failure visibility**: a backup that did not run successfully must be visible through an alert or a log (a silently failing backup = no backup)

**Action 2: Restore drill (actually run it once, not `ls` to see whether the file is there)**
```powershell
# 第 0 步：先在项目根取版本基线 —— doctor.ps1 只认项目根的 .tool-versions，演练目录里没有它
# (step 0: take the version baseline in the project root first — doctor.ps1 only recognises the project root's .tool-versions, which the drill directory does not have)
Set-Location D:/project/app
powershell -NoProfile -File doctor.ps1
# 第 1 步：取回最近一次备份并恢复到与生产隔离的演练目录（演练目录里不跑 doctor.ps1）
# (step 1: retrieve the most recent backup and restore it into a drill directory isolated from production; do not run doctor.ps1 inside the drill directory)
New-Item -ItemType Directory -Force -Path D:/restore-drill/2026-01-01 | Out-Null
Copy-Item D:/backup/app/app.db D:/restore-drill/2026-01-01/app.db
Set-Location D:/restore-drill/2026-01-01
```
All three steps are required, each with real output pasted in:
1. **Retrieve**: actually retrieve a copy from the storage location (not copying an existing local file and passing it off)
2. **Restore**: restore it into an environment **isolated from production**, following the restore steps in `docs/RUNBOOK.md`
3. **Verify**: after the restore the data must actually be usable — cross-check at least two concrete pieces of data against `docs/registry/DATA_DICT.md` (e.g. the timestamp and the row count of the newest record); if it does not cross-check, the restore failed — it is not "probably fine". To run `doctor.ps1` inside the drill directory, first copy the project root's `.tool-versions` in as well; otherwise use an equivalent self-check (start the service + query the data)

- ❌ Counter-example: running `powershell -NoProfile -File doctor.ps1` directly in an empty drill directory → it reports a missing .tool-versions (it only recognises the project root; that is running it in the wrong place, not a failed drill)
- ❌ Counter-example: `Test-Path D:/backup/app/app.db` returns `True` → declaring "restore capability verified" (it only proves the file exists, not that it can be restored)
- ✅ Positive example: first produce the doctor baseline in the project root (exit code 0), then place a copy of `.tool-versions` in the drill directory and re-run it successfully → paste both outputs into the receipt
- ✅ Positive example: the restored database starts the service, the newest records of the key tables can be queried, and the row counts match those before the backup → paste those readings

**Action 3: Measured RTO / RPO (an estimate must still be labelled an estimate)**
- **RTO (how long until restored to usable)**: the measured elapsed time from "deciding to restore" to "verification passed" (watch the clock, write the minutes)
- **RPO (how much data may be lost at most)**: computed from the backup frequency — a daily backup = up to 24 hours of data lost at worst; state the basis
- Where nothing measured exists, write real values like this: `估：45 分钟（依据：库 2.3GB、每日一备，未实测）` ("estimate: 45 minutes (basis: 2.3GB database, daily backup, not measured)"). **Leaving it blank is not allowed, and writing an estimate as if measured is not allowed either**
- Compare the measured numbers against the upper bounds the business can accept (the answers from the ① start-confirmation clarifying questions: how long counts as "restored to usable", how much data loss is acceptable): if exceeded → stop and report to the user; accepting it on your own is not allowed

**Action 4: Drill record (fixed format + validity criterion)**
Leave one line in the "备份与恢复演练" (backup and restore drill) section of `docs/RUNBOOK.md` in this format (example):
`演练日期：2026-01-01 ｜ 对象：app.db(全表) ｜ 取回：成功 ｜ 恢复耗时：6 分钟 ｜ 验证：users 表 128 条与备份前一致 ｜ RTO 实测 8 分钟 ｜ RPO 24 小时（每日一备）｜ 下次到期：2026-04-01` ("drill date: 2026-01-01 ｜ object: app.db (all tables) ｜ retrieval: success ｜ restore duration: 6 minutes ｜ verification: the users table's 128 rows match those before the backup ｜ measured RTO 8 minutes ｜ RPO 24 hours (daily backup) ｜ next due: 2026-04-01")
- **Validity 90 days**: if no further drill happens past the next due date → **red light** (an expired drill record = the backup capability is not trustworthy; this red light is carried by the process-audit item: the audit reads the "next due" field of the "备份与恢复演练" (backup and restore drill) section in `docs/RUNBOOK.md`, and an expired date makes it report a red light and schedule the drill into the next round)
- If the data structure changed (new tables/fields/migration) → the previous drill record becomes invalid immediately and this card must be re-run (the old record does not cover the new structure)

**Action 5: Verify both sides ("a successful backup ≠ restorable")**
- Backup side: evidence that the most recent backup **succeeded** (job log or backup file timestamp, paste the output)
- Restore side: evidence that this drill **succeeded** (the three steps of Action 2's output)
- Only one side = only half verified; the receipt must write the missing side as "not verified" and must not merge them into "the backup chain is normal"

**Action 6: Where the record lands and who carries the expiry (write it into files, do not rely on memory)**
- The drill record goes into the **"next due" field** of the "备份与恢复演练" (backup and restore drill) section of `docs/RUNBOOK.md` (format in Action 4) — that is the **only** read point for the expiry check
- In the same batch register the "next due date" in `STATE.md`'s `未决问题` (write "演练下次到期 YYYY-MM-DD"); the archive close-out cross-checks that section item by item, and once this drill is done that entry is cleared with the reason for clearing stated
- The 90-day red light is carried by the **process-audit item** (reading the "next due" field of `docs/RUNBOOK.md`): expired → the audit reports a red light and schedules it into the next round

**Prohibitions (violating any one = this round's output is void):**
- Replacing the restore drill with `ls` / `Test-Path` / "the backup file is there" is prohibited (this card's first red line)
- Doing a restore drill in the production environment is prohibited (use an isolated environment; production data is read-only and must not be written back to production)
- Writing an unmeasured RTO/RPO as measured is prohibited (an estimate must be labelled "estimate + basis")
- Skipping the verification step is prohibited (restored it but did not cross-check the data = not verified)
- Bringing production secrets / real personal information into the drill record is prohibited (the record lists only objects and row counts, never content)

---

## ③ Evidence receipt

Give these one by one (only three kinds of evidence count: real command output / file paths / commit hashes):

1. The five-column backup list (object / frequency / storage location / retention / encrypted)
2. The real output of the three restore-drill steps: retrieve / restore (`doctor.ps1` or an equivalent self-check output + exit code) / data verification (two concrete pieces of data)
3. The measured RTO number (with its timing basis) + the RPO number (with its basis; label estimates as "estimate")
4. Backup-side success evidence (job log or file-timestamp output)
5. The verbatim drill-record line from the "备份与恢复演练" (backup and restore drill) section of `docs/RUNBOOK.md` (including "next due")
6. Conclusion comparison: measured RTO/RPO vs the business upper bounds (if exceeded → stop and report to the user)
7. The drill environment's absolute path (proving it is isolated from production)

---

## ④ State write-back

**The closing-order iron rule: write back the state first → then commit → then re-run check.ps1 for 0.**

Update `STATE.md`: `未决问题` = clear the "backup not drilled / drill expired" items resolved by this run (stating the reason for clearing); if RTO/RPO exceeds the business upper bounds → open a new entry in `未决问题` awaiting the user's verdict; `下一步` = awaiting a new intent; roll `未来 3 步` (the next drill's due date → re-run early if the data structure changes).

```powershell
git add docs/RUNBOOK.md STATE.md
git commit -m "5-5 docs(ops): 备份清单与恢复演练记录落档"
powershell -NoProfile -File check.ps1
```

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
