# Card 7-4 · Feature decommission
> Trigger: a feature reaches end of life, or the user says "decommission / delete X" ｜ Output: deletion commit + decommission record (registry row / CHANGELOG deprecation line / the decommission line in `docs/versions/<版本>.md`) ｜ Next: 5-1 Archive
> Process area: OPS

---

## ① Start confirmation

1. **Restate the decommission target**: which feature / API / page is being decommissioned (quoted from the user's own words), and which user-visible things are involved.
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "this feature has no external callers", "the data can be exported before deletion"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the data handling must be asked — should the related data be kept (exported then deleted), should only the entry point be hidden, or should it be deleted entirely? The other two questions — how long is the notice period? What is the replacement? Anything findable in the code and the RUNBOOK must not be asked of the human.
4. **Affected-surface preview**: `Select-String` will be used to verify "who calls it"; put the list in the receipt before acting.
5. **Quote the checklist verbatim** (paste the "four steps of decommissioning" from §② of this card word for word).
6. And declare: the output landing point = the deletion commit + the decommission record (registry row / CHANGELOG deprecation line / the decommission line in `docs/versions/<版本>.md`); the next card is 5-1 (Archive).

---

## ② Execution

**Four steps of decommissioning:**

**Step 1 Affected-surface inventory (look before deleting)**
```powershell
$target = 'GET /api/export'      # API path / component name / table name; try them one by one
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $target | Select-Object Path, LineNumber, Line
```
List: which frontends call the API / which pages reference the component / which code reads and writes the table. Any omission = it blows up somewhere else after deletion.
❌ Counter-example: `grep -rn "<接口路径/组件名/表名>" src` (a bash-only command + placeholders; it will not run on Windows, and a missed check means deleting for nothing)
✅ Good example: the `Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $target` above (runs on PowerShell 5.1, outputs Path/LineNumber/Line)
   (Note: on PowerShell 5.1 `-Recurse` is not a valid parameter of `Select-String`; only the pipeline form above runs)
❌ Counter-example: only the page file is deleted while the API is still standing → it becomes a naked API nobody uses (a security surface)
✅ Good example: frontend entry point, backend API, table, error codes and documentation are listed together as five lines and struck off item by item

**Step 2 Announce before deleting** (needed only when there are real users; recorded in docs/RUNBOOK.md §5 or the decommission entry of `docs/versions/<版本>.md`)
- Give a draft decommission notice (when it goes offline / what the replacement is / how to reclaim the data).
- Do not act before the notice period ends.

**Step 3 Data handling (executed as the user decides)**
- Keep and export: give a draft export command; **the human executes** the export and confirms the file exists before deletion proceeds.
- Delete the table/column entirely: this is a breaking change; the agent only generates the migration draft, and **the human executes the SQL** (constitution: non-delegable).
- Hide the entry point only (no data deleted): turn the entry switch off + mark the corresponding row in `docs/registry/COMPONENTS.md` as "hidden (date)" + keep a 30-day observation window (write its start/end and the expiry handling into the decommission entry of `docs/versions/<版本>.md`; delete the code only if there are still zero calls when it expires).

**Step 4 Deletion and synchronization** (the commit action goes in §④: write back state first, then commit; this step only prepares the changes)
- Delete the code + clean up in sync: the corresponding rows of `docs/registry/APIS.md` (delete the row, or annotate a 503 negative contract) / `COMPONENTS.md` / `DATA_DICT.md`
- Append one line to the "deprecated" section of the root `CHANGELOG.md` (including the replacement and how to claim the data)
- Append one line to the "decommissioned" section of `docs/versions/<版本>.md` (feature name / decommission date / replacement / how to claim the data)
- The parts that cannot be deleted (external references / notice period not yet over) → register them in the `STATE.md` parallel-state register or `docs/TECH_DEBT.md`

**Prohibitions:**
- "Delete first and talk later" is forbidden — the first line of code must not be touched before the affected surface is fully checked
- Deciding the data handling method on the user's behalf is forbidden
- Deleting a shared component / utility function is forbidden (confirm first that nobody else references it)

---

## ③ Evidence receipt

1. Affected-surface list (what was deleted / what was kept + why)
2. Data handling result (the action executed by the human, with the human's confirmation quoted)
3. Commit hash + CHANGELOG deprecation line + the decommission line in `docs/versions/<版本>.md`
4. Registry cleanup result

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md: `当前任务` cleared; `下一步` = 5-1 Archive; `未决问题` = leftover items (such as a notice period that has not ended).

Then commit and re-run:
```powershell
$slug = 'export-v1'; $feature = '导出 v1 接口'; $ver = 'v0.4.0'
git add STATE.md CHANGELOG.md docs/versions/$ver.md docs/registry/APIS.md docs/registry/COMPONENTS.md docs/registry/DATA_DICT.md src/api/export.py
git commit -m "7-4 feat($slug): remove $feature"
powershell -NoProfile -File check.ps1
```
(`git add -A` / `git add .` are forbidden; the code deletions, the registry rows, the CHANGELOG deprecation line, the versions decommission line and STATE.md must be in the same commit.)
❌ Counter-example: committing only the code deletion and leaving the registry and CHANGELOG for "the next archive" (documentation pointing at a deleted API = a phantom line)
✅ Good example: the deletions, the three registry rows, the CHANGELOG deprecation line, the versions decommission line and STATE.md in one commit, with the commit hash pasted into the receipt

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
