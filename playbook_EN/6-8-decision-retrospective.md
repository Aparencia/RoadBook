# Card 6-8 · Decision retrospective (revisit decisions even when nothing went wrong: does the original reasoning still hold?)
> Trigger: 5 decision cards accumulated / after a milestone release / a decision card's review date arrives | Output: docs/decisions/REVIEW_<date>.md | Next: 6-6 Process audit or back to 2-1 Feature research
> Process area: RISK

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — which past decisions to dig up, what counts as today's reality, and what conclusion counts as done.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume the decision card recorded the original reasoning; if wrong, this card writes the reasoning first and retrospects afterwards).
3. **Clarifying questions (≤5, delete what you can)**: ask only the hard facts that fix the retrospective's scope — which period of decisions does this round cover? Whose review dates have arrived? Is anything already visibly broken and needing immediate action?
4. **This card's checklist, quoted verbatim at start and ticked before finishing (thirteen items)**:
   - [ ] ① The boundary with `6-5 Retrospective` is written out: 6-5 opens only **after something went wrong** and checks the **process**; this card **opens even when nothing went wrong** and checks **decision quality**
   - [ ] ② **Inventory**: list every decision card in this period (including the rejected-options ledger), each marked "already reviewed ｜ reviewed this round ｜ skipped + reason"
   - [ ] ③ Every decision **quotes the reasoning and assumptions written at the time, word for word**; retelling them from today's impression is forbidden
   - [ ] ④ Every decision gets **one of the four verdicts**: Holds / **Right by luck** / Broken but costless / Broken and already paid for
   - [ ] ⑤ For every **"Right by luck"**, write out **where the reasoning was wrong** (right conclusion, wrong inference = copying it next time is guaranteed to hit the pit)
   - [ ] ⑥ Every "broken" item lands one of three: fix it / register it as tech debt / explicitly accept it with a written reason
   - [ ] ⑦ Conclusions must **land on a specific file** (lesson card / constitution diff / card change / to-do entry), otherwise this card is not done
   - [ ] ⑧ Produce at least one **change the next round can execute** (verb + object plus landing point); if there is none, write "no change needed this round + reason"
   - [ ] ⑨ Review-date backfill: for every decision card reviewed this round, write the next review date back into the card
   - [ ] ⑩ Landing point `docs/decisions/REVIEW_<date>.md`, and STATE.md `下一步` [disambiguated: next step] set to 6-6 or back to 2-1
   - [ ] ⑪ Run the Action 7 self-check command, exit code 0
   - [ ] ⑫ Open questions (the trade-offs the user has not settled) go into STATE.md, one line each
   - [ ] ⑬ Read-only: this round **must not** change product code in passing (to change it, go through 2-1 Feature research)
5. **Landing declaration**: output = `docs/decisions/REVIEW_<date>.md`; next card = 6-6 Process audit (when there is a process-level signal) or back to 2-1 Feature research (when there is something to change).

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do the missing work this card requires)**

| You may think | Reality |
| :-- | :-- |
| No incident means no retrospective needed | This is exactly why this card exists: **when something goes wrong, 6-5 catches it; when nothing goes wrong, nobody checks**. And **"Right by luck"** decisions only pile up risk while nothing goes wrong |
| I remember why we decided it that way | Memory is rewritten by today's outcome (hindsight bias). **The decision card must be quoted word for word**; if the original sentence cannot be produced, the reasoning was never written |
| A right conclusion means a right decision | A coin can land right three times in a row. Decision quality is about **whether the reasoning stands up**, not this one outcome |
| The retrospective conclusion can read "communicate better from now on" | A conclusion with no landing point = no retrospective. The conclusion must point at a file name or one line of to-do |
| Only the ones that went wrong need digging up | Retrospecting only the wrong ones = picking the soft targets. **The most expensive of the four verdicts is "Right by luck"**, and it looks perfectly normal |
| Fix the problems found along the way | This round is read-only. A change with no project initiation has no acceptance, which means bypassing the process — the problems found go on the list and through 2-1 |

**Action 1: Draw the boundary with 6-5 first (both cards produce lessons, but from different sources)**

| | `6-5 Retrospective` | This card (6-8) |
| :-- | :-- | :-- |
| When it opens | After something went wrong (P0 / major rework) | When due (it opens even when nothing went wrong) |
| What it checks | Which process step failed | How good the original decision was |
| Input | Timeline, incident record | The decision card's original text, the rejected-options ledger |
| Output landing point | Lesson card + constitution diff | Decision review record + decision card backfill |
| Typical output | "the gate missed X kind of assertion" | "the reason for choosing A no longer holds today; switch to B" |

**Action 2: Inventory (list everything first, then pick the important ones)**

```powershell
Get-ChildItem docs/decisions -Filter '*.md' -File | Sort-Object Name |
  Select-Object Name, LastWriteTime, @{ n = '复核日'; e = { if ((Get-Content $_.FullName -Raw -Encoding UTF8) -match '复核[:：]\s*(\d{4}-\d{2}-\d{2})') { $Matches[1] } else { '未登记' } } } |
  Format-Table -AutoSize
```

The inventory table has three columns: **decision card / status (already reviewed ｜ reviewed this round ｜ skipped + reason) / due date**. A skip must state its reason — "no time" is not a reason; write clearly why digging into this one now means nothing.

**Action 3: Reconcile item by item (the core action of this card; all three columns must be present at once)**

| Decision card | Original assumption (quoted word for word) | Today's reality (verifiable evidence) | Four-value verdict |
| :-- | :-- | :-- | :-- |
| DEC-003 choose local file storage | "there is only one writer, no concurrency" | a second writer appeared (a background job) — see commit `<hash>` | **Right by luck** |

Requirements:
- **The "original assumption" must be the card's own sentence**, in quotes; if the sentence cannot be found, write "no reasoning was recorded at the time" in this table and list "write the reasoning" as this round's change
- **"Today's reality" must carry something verifiable**: command output, commit hash, file path, measured numbers. **"feels fine" is forbidden**
- **The four-value verdict admits no fifth value** (there is no "cannot tell") — if you cannot tell, classify it as "Broken but costless" and write clearly in the note where it is unclear

**Action 4: The four-value verdict and the "Right by luck" special (the most valuable passage of this card)**

| Verdict | Criterion | Disposition |
| :-- | :-- | :-- |
| **Holds** | the assumption still holds and the reasoning stands up | backfill the next review date, change nothing |
| **Right by luck** | the conclusion is right, but the **reasoning has been falsified or never held** | must write "where the reasoning was wrong" + give one change that blocks this class of error |
| Broken but costless | the assumption is broken, but no loss has been caused yet | one of three: fix it / register tech debt / accept it (with a reason) |
| Broken and already paid for | the assumption is broken and there is real loss | one of three + add one line "which signal could have been seen earlier" |

**The three questions of the "Right by luck" special** (answer all of them for every item):
1. Why did the conclusion look right? (which step happened to cancel out the wrong reasoning)
2. What happens if it is run again with the conditions slightly changed? (write out what that "slight change" is)
3. Is there a check a **machine can decide** that would block this class of reasoning? (if yes, write it as an assertion; if no, write it as a checklist item)

**Action 5: Land on specific files (a conclusion must not stop inside a document)**

Write each change as one line: `action → which file it lands on → who reads it and when`.

| Change type | Lands on | When it takes effect |
| :-- | :-- | :-- |
| Lesson (reused across tasks) | `docs/lessons/<date>_<slug>.md` | before the next decision of the same kind |
| Hard rule (kept every round) | the matching entry of the constitution AGENTS.md | in force as soon as the next round starts |
| Criterion / process | the matching process card (changed through 2-1 Feature research) | after the initiation is approved |
| To-do | STATE.md open questions or TECH_DEBT.md | re-read at the close of the next round |
| Assertion | the check script | in force the next time the gate runs |

**No landing on a file = this card is not done**. Writing "be careful about X from now on" is not a change — it has no landing point, no reader and no due date.

**Action 6: Backfill the review dates**
- For every decision card reviewed this round, add or change one line in the card: `复核：YYYY-MM-DD` [disambiguated: the literal that the Action 2 regex matches; its value is the next review date]
- How the due date is chosen: high-risk decisions (red-line domain, one-off and irreversible, spending money) ≤1 month; ordinary decisions ≤3 months; frozen decisions get "no further review (reason)"
- After backfilling, run the Action 2 inventory command once more and confirm nothing is left as "未登记" ("unregistered")

**Action 7: A runnable decision-retrospective self-check (run from the project root; non-developers only need the exit code: exit 1 = this card is not done)**
Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator); save scripts as UTF-8 with a BOM.
```powershell
$f = @(Get-ChildItem docs/decisions -Filter 'REVIEW_*.md' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
if ($f.Count -eq 0) { Write-Host '[FAIL] 找不到 REVIEW_<日期>.md'; exit 1 }
$l = @(Get-Content $f[0].FullName -Encoding UTF8)
$txt = $l -join "`n"
$four = @('成立','侥幸成立','不成立' ) | Where-Object { $txt -match $_ }
$rows = @($l | Where-Object { $_ -match '^\|' -and $_ -match 'DEC-|决策' }).Count
$land = @($l | Where-Object { $_ -match 'docs/lessons/|AGENTS\.md|TECH_DEBT\.md|STATE\.md' }).Count
$lucky= @($l | Where-Object { $_ -match '侥幸成立' }).Count
"复核记录 $($f[0].Name) 行数 $($l.Count)（要求 ≤120）"
"四值命中 $($four.Count)/3；决策行 $rows（要求 ≥1）；落点行 $land（要求 ≥1）；侥幸成立命中 $lucky（要求 ≥1）"
if ($l.Count -gt 120 -or $four.Count -lt 3 -or $rows -lt 1 -or $land -lt 1 -or $lucky -lt 1) { Write-Host '[FAIL] 本卡自查未过'; exit 1 } else { Write-Host '[OK] 本卡自查通过' }
```

**Prohibitions (any violation voids this round's output):**
- Retrospecting only the decisions "that went wrong" is forbidden — **every one of them is dug up, with priority on the ones that look normal**
- Replacing the original sentence with today's impression is forbidden (if the original cannot be quoted, write "no reasoning was recorded at the time" and write it now)
- A fifth verdict is forbidden ("cannot tell", "watch it a while longer"); if you cannot tell, classify it as "Broken but costless" and write clearly where it is unclear
- Conclusions written as landing-point-free phrases such as "be careful about X from now on" are forbidden
- Judgements with no evidence in the "Today's reality" column are forbidden (command output / commit hash / file path / measured numbers are required)
- Changing product code in passing this round is forbidden (to change it, go through `2-1 Feature research`)
- ❌ Counter-example: writing a summary that says "the decisions were executed well" ｜ ✅ Good example: the original assumptions quoted item by item + evidence-backed reality + four-value verdicts + 2 lines on where a "Right by luck" reasoning was wrong + 3 changes landed on files

---

## ③ Evidence receipt

Only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished.

1. Full path of `docs/decisions/REVIEW_<date>.md` + line count
2. The boundary statement with `6-5 Retrospective`, verbatim (one sentence)
3. The **real output** of the Action 2 inventory command (decision card list + status + due date)
4. The item-by-item reconciliation table verbatim (decision card / original assumption quoted word for word / evidence-backed reality / four-value verdict)
5. The "Right by luck" special verbatim (all three questions answered for each item, including "where the reasoning was wrong")
6. The one-of-three disposition verbatim for every broken item
7. The change list landed on specific files, verbatim (every line carrying the landing-point file and the moment it takes effect)
8. The inventory output after the decision cards' review dates are backfilled (no "未登记" ("unregistered"))
9. The real output of the Action 7 command (all three verdict values hit, decision rows ≥1, landing-point rows ≥1, "Right by luck" hits ≥1; exit code 0) + this round's commit hash
10. Open-questions list (the trade-offs the user has not settled, one line each)

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/decisions/REVIEW_<date>.md`)
- `未决问题` [disambiguated: open questions] = the trade-offs that are not settled (whether to change a given decision, whether a "Right by luck" item needs immediate action — one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip the decision review meeting, write one line of reason; `下一步` [disambiguated: next step] = 6-6 Process audit or back to 2-1 Feature research

```powershell
$m = 'docs/decisions/REVIEW_<日期>.md'
git add STATE.md docs/decisions docs/lessons TECH_DEBT.md $m
git commit -m "6-8 docs(decision): 决策复核与侥幸成立专项"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
