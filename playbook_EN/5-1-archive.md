# Card 5-1 · Archive (mandatory for all tiers; after each task passes acceptance)
> Trigger: after 4-3 / 6-4 passes acceptance ｜ Output: docs/archive/<date>_<slug>/ + STATE rolling + an atomic commit ｜ Next: awaiting a new intent [disambiguated]

---

## ① Start confirmation

After receiving the start instruction, first receipt:

1. **Task restatement**: which task is being archived (read STATE.md's `当前任务` and `最近完成`) + reference the acceptance conclusion.
2. **Assumptions list**: the 3~5 default assumptions you are making on the user's behalf (e.g. "no new lessons can be distilled this time", "the registry has no un-written-back rows"), each with the way it was verified.
3. **Clarifying questions (≤5, keep them to a minimum)**: the default three questions — which slug is used for the archive? Is the remote pushed this round? Are there open questions left for the next round? Anything findable in STATE.md or the conversation must not be asked of a human.
4. **Archive-checklist preview**: the eleven checks below will be executed; list item by item the files expected to change.
5. **Paste the reference checklist verbatim** (paste word for word this card's §② "archive eleven checks" items ① ⑦ ⑧ ⑩).
6. Also declare: the output lands in `docs/archive/<date>_<slug>/`; next card = awaiting a new intent (when `体检计数` ≥15, run the 6-6 process audit first). The archive produces exactly one atomic commit, and the commit comes after the STATE.md write-back (see §④); before committing, show `git status` for your go-ahead.

---

## ② Execution

**Archive eleven checks (execute item by item, receipt item by item; for tier S tasks the eleven checks are still executed item by item, but the receipt is merged into one notice paragraph):**

**1. Registry write-back verification (diff-driven; answering "did I change it?" from memory is forbidden)**:
   - a. Read `起点锚点` from STATE.md into `$anchor`; run `git diff --name-only "$anchor..HEAD"` + changed-symbol extraction → the **change list** (ground truth)
   - b. Classify the list by domain (UI / table / interface / configuration / dependency); for each changed item → mark the corresponding registry row: written back ✓ / not applicable — (reason) / not handled ○ (**fix it on the spot**; ○ must not be left blank)
   - c. If this task came from an idea row in `docs/pool/IDEAS.md` → in the same batch set that row's `状态` to `done` and chain this commit's hash into its conclusion column; the only status words are `idea / researching / approved / done / killed`

**2. Lesson distillation**: did you step on a mine this time? If yes → write `docs/lessons/<日期>_<主题>.md` (≤12 lines: symptom → root cause → fix → how to locate it next time). **Check for duplicates first**: update the old card for the same symptom, do not create a new one.

**3. Debt rolling**: new debt / rejected options → register in `docs/TECH_DEBT.md` (open); what was paid off this time → change to closed with evidence (commit hash / file path).
- **Concession close-out (the last pass before archiving, S6)**: every concession still left in the files this task touched must be accounted for at archive time — run
```powershell
Select-String -Path <files this task touched> -Pattern 'ceiling:|upgrade:|no-trigger'
```
  Each hit must either land in `docs/TECH_DEBT.md` this batch or be written into the `open questions` field of STATE.md; **`no-trigger` (the ones with no upgrade trigger written) come first** — a concession without a trigger never resurfaces on its own and is the first to rot silently. Copy the script's final `<N> markers, <M> with no trigger.` line into the receipt + the disposition counts (registered TD x / into open questions y / closed this batch z).
  ❌ Counter-example: at archive time just say "there are some TODOs in the code" without a count or an account (next round nobody can find them) ｜ ✅ Good example: `7 markers, 3 with no trigger.` → all 3 no-trigger ones registered as TD-021~023, the other 4 into STATE.md open questions.

**4. Version record**: append one line to the "unreleased" section at the top of the root `CHANGELOG.md` (one of the four kinds: added / changed / deprecated / fixed; one line per item).

**5. Standing-document staleness and over-limit check (run item by item; update anything over the limit or inconsistent)**:
```powershell
$budget = @{ 'AGENTS.md' = 240; 'docs/ARCHITECTURE.md' = 120; 'docs/RUNBOOK.md' = 100 }
foreach ($f in $budget.Keys) { "$f = $(@(Get-Content $f).Count) lines (limit $($budget[$f]))" }
Select-String -Path README.md -Pattern 'powershell'
```
   - AGENTS.md has stale rules → delete them (hard limit 240 lines: before adding one, first ask "which real rework did this rule prevent?")
   - Run every README startup/check/test command for real; anything that does not run = fix it on the spot
   - Does docs/ARCHITECTURE.md's module diagram match the real directories in `git ls-files`?
   - Do docs/RUNBOOK.md's deploy/rollback/backup steps match this change?

**6. Anti-bloat execution (act as soon as a limit is exceeded; do not let it pile up)**:
```powershell
@(Get-ChildItem docs/lessons -Filter *.md).Count
@(Get-ChildItem docs/decisions -Filter *.md).Count
@(Get-ChildItem docs/specs -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) }).Name
```
   - lessons/ and decisions/ each over 30 cards → move the oldest with no references for 90 days into `docs/archive/`
   - **The 6 seed lesson cards do not take part in this 30-card ranking elimination** (seeds are only proposed for promotion by the 6-6 card when they recur across projects)
   - Task directories under specs/ untouched for over 30 days → prompt the user to archive them

**7. Workspace cleanup (archive with git mv; directory naming is uniformly `<日期>_<slug>`)**:
```powershell
$date = Get-Date -Format 'yyyy-MM-dd'
$slug = 'export-limit'                     # same source as this task's directory under docs/specs
$src  = "docs/specs/${date}_$slug"
$dest = "docs/archive/${date}_$slug"
git mv $src $dest
$rows    = Select-String -Path docs/TECH_DEBT.md -Pattern '^\|\s*TD-' | ForEach-Object { $_.Line }
$open    = @($rows | Where-Object { $_ -match '\|\s*open\s*\|' }).Count
$carried = @($rows | Where-Object { $_ -match '\|\s*carried\s*\|' }).Count
$closed  = @($rows | Where-Object { $_ -match '\|\s*closed\s*\|' }).Count
$keyItem = ($rows | Where-Object { $_ -match '\|\s*open\s*\|' } | Select-Object -First 1)
Set-Content -Path "$dest/tech-debt.md" -Encoding UTF8 -Value @("# 债务快照 $date", "open $open ｜ carried $carried ｜ closed $closed", "关键项：$keyItem")
```
The debt snapshot is written to `$dest/tech-debt.md` (3 lines: title / the three counts / the key item). The counts **must be derived by the command above from the `状态` column of `docs/TECH_DEBT.md`** (assign `$open`/`$carried`/`$closed`/`$keyItem` before writing the file; referencing an unassigned variable silently writes empty numbers, which is no measurement at all). Without a git environment, use Move-Item and note the "history-chain cost" in the receipt.
   - ❌ Counter-example: writing `docs/archive/2026-10-03/` (no slug; two tasks on the same day overwrite each other)
   - ✅ Good example: `docs/archive/2026-10-03_export-limit/` (date + slug, unique and searchable)

**8. The five orphan lists (file level / zero-reference exports / doc phantoms / reverse phantoms / unregistered; git is the basis, run scripts rather than relying on memory)**:

```powershell
powershell -NoProfile -File orphans.ps1
git ls-files | Measure-Object -Line | Select-Object -ExpandProperty Lines
```
(The second line is only a reference count; the measurement standard is orphans.ps1's summary line, and **the summary line is pasted into the receipt verbatim**.)

   - a. `[孤儿]` file level: files in `git ls-files` with zero references (their file name cannot be found in any .md/.ps1/.json/source file, and they are not in the entry list)
   - b. `[零引用导出]` code level: exports/functions/classes with zero references — with zero dependencies use text search first; once there are dependencies bring in knip / vulture / tsc --noUnusedLocals. **Report only, do not block; observe for two rounds before promoting it to a gate**
   - c. `[文档幽灵]`: a path mentioned by the documentation that does not exist on disk
   - d. `[反向幽灵]`: exists on disk but no document mentions it; the registry rows of touched domains still get the "row → code" existence check (APIS routes / DATA_DICT fields `Select-String`-ed in the source; zero hits = a stale document)
   - e. `[未登记]`: files not in `docs/registry/COMPONENTS.md`

**Handling rules (every orphan must land in one of the three classes below; "do nothing" is not allowed):**
   - Delete — what can be safely deleted this time goes with this archive commit
   - Register as tech debt — write it into `docs/TECH_DEBT.md`
   - Add the registration in COMPONENTS.md
   - ❌ Counter-example: a pile of orphans is scanned out and the receipt says "acknowledged, handled next round" (= nothing was done)
   - ✅ Good example: every item has an owner, and the receipt gives the counts "deleted x / registered as TD x / registered x", and asserts **the sum of the five class counts ≥ the number of deduplicated files** (the five classes are not deduplicated against each other, so one file can fall into several at once; the three handling counts are compared only against the deduplicated item count, never forced to equal the five-class sum)

**9. Rollback confirmation**: how are this task's changes reverted? (First check the scope with `git log --oneline "$anchor..HEAD"`, then decide `git revert` or `git reset`; has the migration down been dry-run?) Write a one-line conclusion into the receipt.

**10. Remote-sync readiness check (numbered separately; the receipt matches it number by number)**:
```powershell
$branch = git rev-parse --abbrev-ref HEAD
git remote -v
git check-ignore -v .env
```
   - With a remote → push at close-out `git push origin HEAD` (to pin the upstream, `git push -u origin $branch`); without a remote → record one line "local-only"
   - A rejected `git push` = the remote has moved ahead (someone else pushed): **stop and report to the user** and check `git log --oneline origin/$branch..HEAD`; **`--force` is forbidden** ("rejected, so force it" is wrong); a force push requires an explicit request from the user
   - **Reverse secret check**: `.env` / `*.key` / `*.pem` must be **ignored** (`git check-ignore -v` producing output = correct; an ignored file can never appear in porcelain); if `git status --porcelain` does list one of them = it is not ignored, **stop and report a red light**; committing and pushing are forbidden
   - Two consecutive archive cycles without a push = 6-6 card signal 10 (push lag)

**11. Security-gate final check (the archive counts as complete only on exit code 0)**:
```powershell
powershell -NoProfile -File security.ps1
```
   - The definition of "this archive is complete" is **exit code 0** here: exit code 1 = something was blocked, stop and fix it and then re-run; exit code 2 = an environment error (the script is missing / wrong arguments), fix the environment first. ❌ "commit first and fix it afterwards" while it is non-zero ｜ ✅ commit and push only once it is 0.
   - **The reverse secret check is measured by the script**: `.env` / `*.key` / `*.pem` must be ignored and a hit is red; the `git check-ignore -v` of item 10 is the manual cross-check, the script is the machine judge, and both must pass. ❌ treating item 10 "producing output" as the security gate having passed (that only proves those three file names are ignored, not that there are no plaintext secrets or dangerous execution chains) ｜ ✅ paste the script's complete output + exit code 0 into the §③ receipt, side by side with item 10.

**Close-out order (this section performs no commit or push; it only declares the numbering so that §③ can reference it number by number)**:
1. Write back STATE.md (`最近完成` / `体检计数` / `未来 3 步` / `最近归档` / `当前文件数`; field semantics in §④) + the write-back of the affected rows in the three registry tables: `COMPONENTS.md` add 文件·搜索词·影响面·最近确认 (fill in the archive date), `APIS.md` add 错误码·说明, `DATA_DICT.md` add 校验·敏感度
2. Commit: `git add $dest STATE.md docs/TECH_DEBT.md` (add the other files changed this time one by one: `docs/lessons/…`, `CHANGELOG.md`, etc.) → `git commit -m "5-1 docs(archive): archive ${date}_$slug"`
3. Re-run `powershell -NoProfile -File check.ps1` and take exit code 0
4. Remote sync: `git push origin HEAD` (record "local-only" when there is no remote)
5. Print the §③ receipt
   - ❌ Counter-example: `git commit` first, then change STATE.md (the state changes again after the commit, the close-out tree is necessarily dirty, and check.ps1 judges a dirty tree)
   - ✅ Good example: write back STATE.md → the same commit as the archive output → re-run check.ps1 for 0 → `git status --porcelain` is empty

**Prohibitions:**
- Ticking an item you have not verified is forbidden (every check needs a real action or a basis for "confirmed none")
- Pushing registry write-back to "next time" is forbidden
- Doing "nothing" about an orphan is forbidden — every item must land in one of the three classes: delete / register as tech debt / add the registration
- Mixing in files from other tasks is forbidden; `git add -A` / `git add .` are forbidden

---

## ③ Evidence receipt

Give, item by item:
1. The archive eleven checks' results item by item (1–11; each item states the action or "confirmed none" + its basis); for 8 attach the verbatim `orphans.ps1` summary line + the three-class handling counts (deleted x / registered as TD x / registered x), and assert **the sum of the five class counts ≥ the deduplicated file count** (the five classes are not deduplicated against each other, so one file can fall into several at once)
2. The archive list (source paths → `docs/archive/<date>_<slug>/`)
3. The debt-change summary (closed x / carried x / added x, with the key item on one line) + the raw line from the §3 concession close-out (`<N> markers, <M> with no trigger.` + disposition counts)
4. The real evidence for close-out steps 1–5: `git status --porcelain` (must be empty), the commit hash, the complete output of `check.ps1` with exit code 0, the `git push` output (or "no remote: local-only")

---

## ④ State write-back

**The order iron rule: write back state first → then commit → then re-run check.ps1 for a 0 → push last. State changes must land in the same commit; "commit first and change STATE afterwards" is forbidden.**

Update STATE.md:
- `最近完成` insert one entry at the top (rolling, keep 5): date + a one-line task summary + commit
- `体检计数` +1 (create it as 1 if the field does not exist; **cumulative ≥15 → `下一步` = 6-6 process audit**)
- `未来 3 步` rolled as needed (the roadmap)
- `最近归档` insert one entry at the top (rolling, keep 2; one line with **6 fields**: date / slug / commit hash / start anchor / current file count / push result — write "已 push origin HEAD" or "本地-only" as the push result; create the field if it does not exist) — the 6-6 card's signals 8, 9, 10 read only these 2 entries
- `起点锚点` **kept unchanged** (= the commit at this task's start; the archive does not clear it — the 6-6 card relies on it to judge commit cadence; a new task overwrites it in ① start confirmation, and the old value is already on record in the `最近归档` line above, so nothing is lost)
- `文件数基线` **kept unchanged** (set only once at onboarding / the first batch; the archive does not reset it, otherwise the budget mechanism idles)
- `当前任务` cleared; `工作树状态` = clean
- `下一步` = awaiting a new intent (the driver card 9 guides the user on a vague intent); if the health-check count triggers, the 6-6 card governs [disambiguated]

Then execute §② close-out order 2–4: commit (the file list includes STATE.md) → `powershell -NoProfile -File check.ps1` for a 0 → `git push origin HEAD` (or record "local-only").

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
