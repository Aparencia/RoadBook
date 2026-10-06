# Card 5-7 · Configuration management and baseline (one fact, one place to write it; anything written down must have a reader)
> Trigger: before a release / a configuration item is added or deleted / the same fact is found stated differently in two places | Output: docs/BASELINE.md | Next: 5-2 Release or 5-1 Archive
> Process area: CM

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):
1. **Task restatement**: in one plain sentence, say which things count as controlled items, who has the final say on their version / definition, and which single point this round fixes them at.
2. **Assumptions list**: write "I assume X; if it is wrong then Y is void" line by line (e.g. I assume only one place writes the version number; if it is wrong the baseline must be retaken). Anything that can be looked up in repository files must not be written into the assumptions.
3. **Clarifying questions (≤5, delete whatever can be deleted)**: ask only the hard information that decides the controlled scope — which artifacts ship this round? Is the version / list written in two places? Is anybody (or any script) reading these fields?
4. **This card's checklist verbatim (quote these twelve items word for word at start; tick them one by one before finishing)**:
   - [ ] ① The configuration item list is written out with **an identification criterion per line** (changing it requires notifying others / others work by it / it has two or more copies — any hit means controlled)
   - [ ] ② **Single source of truth table**: every class of fact names its single authoritative location, and the remaining locations are marked "derived view (generated from X)"
   - [ ] ③ **Dead metadata sweep**: write out the fields that stay unchanged for a long time and that no code or process reads, each with a "delete / wire up a machine check" conclusion
   - [ ] ④ The copy-consistency check has been run, with its output listed item by item in the document (consistent / inconsistent + the actual value)
   - [ ] ⑤ All four baseline elements present: **tag + changelog section + archive directory + checksum (or a reproducible command that yields it)**
   - [ ] ⑥ The baseline declaration states plainly that "once a baseline is released it must never move" (tag it wrong and you issue a new number, leaving history alone)
   - [ ] ⑦ Change control table: list the changes that **must go through `2-1 Feature research`** (changing the gate convention / a criterion / the constitution / the card-header format / an external contract); the rest fall under "changeable directly"
   - [ ] ⑧ All three change-impact questions answered (who is reading it / how many copies / how to verify the change is right)
   - [ ] ⑨ **Status accounting**: every line of the STATE.md parallel-state register is checked (anything expired and unclosed gets a disposition); an unclosed item must never sit silently in the table
   - [ ] ⑩ The output lands on disk at `docs/BASELINE.md`, and STATE.md `下一步` states whether it goes to 5-2 or 5-1
   - [ ] ⑪ The Action 8 self-check command is run, exit code 0
   - [ ] ⑫ Open questions (the controlled scope the user has not settled) go into STATE.md, one line each
5. **Landing declaration**: output = `docs/BASELINE.md`; next card = 5-2 Release (when a version ships) or 5-1 Archive (when none ships).

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any one appearing = stop and make up the work per this card)**

| You may think | Reality |
| :-- | :-- |
| I am the only developer, so configuration management is not needed | Dead metadata is exactly the disease that runs rampant in single-person projects: **a field nobody reads stays there forever, looking very much like a fact**. This repo measured it once — four sub-package version numbers sat at `0.1.x` for a long time while the umbrella package was already `0.7.2`, and for half a year every sighting assumed they were real |
| Version numbers are written in their own files and never interfere with each other | The moment two places write the same fact, a day of disagreement is inevitable; on that day, which one do you believe? **Fix who the source is first** |
| A backup is a baseline | A baseline = one reproducible **point** (tag + changelog section + archive + checksum). A lone file copy cannot say which version it is |
| Change control is a process only teams need | Change control at single-person tier has exactly one rule: **stop and ask the user before changing a criterion**. Skip it and the criteria drift along with the implementation |
| The field is useless now, keep it in case it is useful later | "Might be useful later" = nobody reads it today. Keeping it means maintaining it, and getting the maintenance wrong once is one more false fact |

**Action 1: Configuration item list (decide "what counts" first, then "who is the source"; each item = criterion → explanation → example)**

Identification criteria (any hit means controlled; write out which one each item hits):
- Changing it requires notifying others (the outside depends on its shape — external interface contracts, configuration file field names) | Others work by it (it has to be read before you know how to do the work — gate scripts, the reading-order document, conventions) | It has multiple copies (the same fact appears in ≥2 places — version numbers, component lists, dependency lists)

**What is not a configuration item**: one-off throwaway scripts, generated artifacts, caches, drafts. Writing clearly why something is "not listed" matters more than listing it.

**Action 2: Single source of truth table (the core of this card; one table kills one class of drift; each item = fact class → single authoritative location → derived location (generated from the authority) → how consistency is verified)**
- Version number: authority = the `version` in the root package manifest; derived = sub-package manifests, the version shown in the interface; verify = run the Action 3 script and compare every place | Component list: authority = the registry COMPONENTS.md; derived = the module view of the architecture document; verify = file count vs table row count
- Data dictionary: authority = the registry DATA_DICT.md; derived = the data view of the architecture document; verify = compare entity counts | Interfaces: authority = the registry APIS.md; derived = user documentation; verify = deduplicate paths
- Gate convention: authority = the single check script; derived = the CI workflow; verify = **the two sides must be the same command** (different = permanently fake green) | Controlled vocabulary: authority = section 1.1 of the writing contract; derived = the header labels of each document; verify = whether the value falls inside the vocabulary

Three rules:
1. **Every class of fact is allowed exactly one authoritative location**; no authoritative location found = that class of fact is not yet controlled, and this card is not done
2. A derived location must be **regenerable from the authority** (a command or a script), never copied by hand
3. When the two sides disagree, **fix the derived side first, then check the authority**; only change the authority when it is genuinely wrong, and record one line of change

**Action 3: Copy-consistency check (run it, do not trust your eyes)**
```powershell
$root = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version; $rows = @(); $rows += [pscustomobject]@{ Where = 'package.json'; Value = $root }; foreach ($sp in @(Get-ChildItem -Path . -Recurse -Filter package.json -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.DirectoryName -ne (Get-Location).Path })) { $v = (Get-Content $sp.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).version; $rows += [pscustomobject]@{ Where = $sp.FullName.Replace((Get-Location).Path + '\', ''); Value = $v } }; $rows | Format-Table -AutoSize; $bad = @($rows | Where-Object { $_.Value -ne $root }); if ($bad.Count -gt 0) { Write-Host "[FAIL] 版本号副本不一致 $($bad.Count) 处"; exit 1 } else { Write-Host '[OK] 版本号单一事实源一致' }  # 版本号副本一致性（Windows PowerShell 5.1 直接可跑；变量名一律 ASCII）
```

Paste the real output item by item into `docs/BASELINE.md` — **pasting a conclusion without the evidence = this card is not done**.

**Action 4: Dead metadata sweep (the cheapest step of this card)**

Ask three questions of every "field that got written down":
1. **Does any code read it?** Search the field name once across the whole repo (build scripts, gate scripts and release scripts included)
2. **Does any human look at it?** In the last three related changes, was it ever referenced
3. **Is it correct?** Spot-check one place: does what it says match the current fact

All three answered no = dead metadata. There are exactly two dispositions:
- **Delete** (first choice) — with no reader there is no value, and deleting is cheaper than maintaining it
- **Wire up a machine check** — if it genuinely should exist (a version number shown to the outside, say), add an assertion that turns it red; anything that cannot turn red will keep being wrong

A third disposition, "keep it for now", is not allowed — that is exactly the definition of dead metadata.

**Action 5: Baseline (strike one point before release; it must never move afterwards; each item = element → content → counter-example)**
- tag: shaped like `vX.Y.Z`; **a released tag must never be moved or deleted** (`git tag -f` is forbidden) — counter-example: tag it wrong and `-f` overwrites it → history is gone | Changelog section: the four kinds of entry in that version's formal section (new / changed / fixed / upgrade notes) — counter-example: writing only "several fixes"
- Archive directory: this task's artifacts land in `archive/<date>_<slug>/` — counter-example: code only, with none of that round's artifacts | Checksum: one reproducible command or hash list (which files, which algorithm) — counter-example: storing a file copy that cannot say which version it is

Baseline declaration template (write it into the document word for word):
```
Baseline vX.Y.Z | Date YYYY-MM-DD | Authoritative commit <short hash> | Contains: <artifact list> | Verification: <command or hash> | This baseline is released: it is not moved and not deleted; a mistake issues a new number.
```

**Action 6: Change control (a thing gets one of exactly two treatments; each item = what is being changed → treatment → reason)**
- **Stop and ask the user**, five classes: changing the gate convention (assertions, thresholds, commands) — the gate is "the definition of done" itself; changing it is changing the criteria | changing a criterion / threshold / command in a card header — the criteria are the roadbed of the route | changing the constitution (the hard rules in AGENTS.md) — it governs every later round
- **Stop and ask the user**, continued: changing the card-header format (section count, section titles, tag value domain) — the whole repo is affected at once, and the validator judges by it | changing an external contract (interfaces, configuration field names, data structures) — it breaks existing users
- Everything else (internal implementation, copy, styles, tests): changeable directly, committed in the same batch — the impact surface is verifiable inside one batch

**The three change-impact questions** (every change to a controlled item answers them; write them in the commit message or the document):
1. **Who is reading it?** (list the scripts / documents / external users)
2. **How many copies are there?** (name each place from the Action 2 table)
3. **How is the change verified as correct?** (which command turns red)

**Action 7: Status accounting (an unclosed item must never lie silently in a table; each item = accounting field → where it is written → expiry rule)**
- Parallel state (old and new implementations both in the repo): written in the STATE.md parallel-state register; write the expiry batch when registering, and anything expired and unclosed must get a disposition | Tech debt: written in TECH_DEBT.md; give every item a priority and re-rate it after two rounds without movement | Open questions: written in STATE.md 未决问题; re-read once at the close of every round, never let it turn into a default value

**Action 8: Configuration management self-check (run at the project root; non-developers only read the exit code: exit 1 = this card is not done)**
Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name reports 『字符串缺少终止符』 (missing string terminator); the script must be saved as UTF-8 with a BOM.
```powershell
$m = 'docs/BASELINE.md'; if (-not (Test-Path $m)) { Write-Host '[FAIL] 缺 docs/BASELINE.md'; exit 1 }; $l = @(Get-Content $m -Encoding UTF8); $txt = $l -join "`n"; $src = @($l | Where-Object { $_ -match '唯一权威|单一事实源' }).Count; $dead = @($l | Where-Object { $_ -match '死元数据' }).Count; $chg = @($l | Where-Object { $_ -match '变更控制|停下问用户' }).Count; $base = @($l | Where-Object { $_ -match '基线' }).Count; $acc = @($l | Where-Object { $_ -match '状态记账|并行态' }).Count; "BASELINE.md 行数 $($l.Count)（要求 ≤120）"; "单一事实源行 $src（≥1）；死元数据行 $dead（≥1）；变更控制行 $chg（≥1）；基线行 $base（≥1）；记账行 $acc（≥1）"; if ($l.Count -gt 120 -or $src -lt 1 -or $dead -lt 1 -or $chg -lt 1 -or $base -lt 1 -or $acc -lt 1) { Write-Host '[FAIL] 本卡自查未过'; exit 1 } else { Write-Host '[OK] 本卡自查通过' }
```

**Prohibitions (violating any one = this round's output is void):**
- Keeping two authorities for the same fact is forbidden (either fix the source or merge them)
- Using "it might be useful later" as a reason to keep dead metadata is forbidden
- Moving or deleting a released tag is forbidden (`git tag -f` is forbidden)
- Unilaterally changing the gate convention, a criterion, the constitution, the card-header format or an external contract is forbidden — these five classes must stop and ask the user
- Pasting only a conclusion without the command output is forbidden ("checked, it is consistent" is not evidence)
- ❌ Counter-example: writing a configuration management plan nobody reads | ✅ Good example: one single source of truth table + the real output of one comparison command + one deleted dead field + one baseline that never moves

---

## ③ Evidence receipt

Only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished.

1. Full path of `docs/BASELINE.md` + line count
2. The configuration item list verbatim (each line stating which identification criterion it hits)
3. The single source of truth table verbatim (every fact class's single authoritative location + derived locations + how it is verified)
4. The **real output** of the Action 3 command (the actual value at every copy + the exit code)
5. The dead metadata sweep result verbatim (the answer to the three questions for every field + the disposition: delete / wire up a check; for a deleted field, list its location)
6. The four baseline elements verbatim (tag + changelog section + archive directory + check command or hash) and the baseline declaration verbatim
7. The change control table verbatim + the three impact questions for this round's one controlled change (if there was one)
8. The status accounting check result (every parallel-state line, and the disposition of anything expired and unclosed)
9. The real output of the Action 8 command (line count ≤120, each of the five counts ≥1; exit code 0) + this round's commit hash
10. Open-questions list (the controlled scope the user has not settled, one line each)

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` = this task name (link `docs/BASELINE.md`)
- `未决问题` = the controlled scope that is not settled (which fields should be deleted, whether the baseline includes the archive directory — one line each)
- `裁剪记录` = single-person mode: no configuration control board; write one line of the reason; `下一步` = 5-2 Release or 5-1 Archive

```powershell
$m = 'docs/BASELINE.md'; git add STATE.md $m; git commit -m "5-7 docs(config): 单一事实源与基线"; powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
