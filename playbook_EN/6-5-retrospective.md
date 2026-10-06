# Card 6-5 · Retrospective
> Trigger: after a P0/P1 incident or major rework (daily small pits do not trigger it; a lesson card is enough) ｜ Output: retrospective document + preventive measures landed ｜ Next: 5-1 Archive
> Process area: KNOW, QA

---

## ① Start confirmation

1. **Incident restatement**: what broke / what the impact was / how it was recovered (quoted from STATE.md and the conversation record).
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "the loss can be restored from git history", "the incident did not touch a red line domain"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — the incident's start and end times? Who is the decision maker for stopping the loss? Should the constitution also be changed this time? Anything findable in the conversation and the commits must not be asked of the human.
4. **Material list preview**: the timeline will be collected (conversation / commits / RUNBOOK).
5. **Quote the checklist verbatim** (paste the titles of questions 1~3 of the "three retrospective questions" from §② of this card word for word).
6. And declare: the output landing point is `docs/lessons/<date>_<事故名>.md` + the landing point of the preventive measures; the next card is 5-1 (Archive). Rule changes among the preventive measures are decided by you; the agent only drafts.

---

## ② Execution

**The three retrospective questions:**

**Question 1: timeline — how did the loss snowball?**
List point by point in time: occurrence → first discovery → stop the bleeding → root cause fix → retrospective. Mark two moments: where the loss-minimal stop-loss point was and where the actual stop-loss point was; the difference is the room for process improvement.

**Question 2: root cause — ≥3 layers; stopping at "carelessness / negligence" is forbidden**
❌ Counter-example: "Root cause: ran the SQL without a backup (be careful next time)" — "be careful next time" is not a mechanism
✅ Good example: "no backup → the backup step is in RUNBOOK §3 but was never drilled → retrospective card 6-5 only triggers after a P0, while nobody triggers a backup drill → prevention: card 5-1 Archive adds a check item 'remind if a backup drill is over 30 days old'"

**Question 3: preventive measures — must land on a specific file + a specific change**
Every measure answers "who will be forced to do it, and at which step". Three kinds of landing point (all must be files reachable within this project's workspace):
- Add a prohibition / check item to the constitution `AGENTS.md`
- Register one entry in `docs/TECH_DEBT.md`: a process card revision proposal (state the card number and the proposed change, marked "carry back to the master repo for execution" — process cards live in the master repo workspace, unreachable from this project's session; pretending to change a card inside this project is forbidden)
- Add operational steps to the `docs/RUNBOOK.md` process; if it is only an idea and you do not want to make a rule yet → register it in `docs/pool/IDEAS.md`
❌ Counter-example: "Retrospective conclusion: improve the check steps of some process card" (this project's workspace does not have that card, which amounts to no landing point, and the agent will go out of scope to change the master repo)
✅ Good example: "Register in `docs/TECH_DEBT.md`: process card proposal — card 5-1 Archive adds a 'reminder if a backup drill is over 30 days old' check item (carry back to the master repo for execution)"
❌ Counter-example: "back up before operating from now on" (no landing point, no enforcement, no one to execute it = empty words)
✅ Good example: "Constitution §4 non-delegable list adds one item: before any SQL execution, the RUNBOOK §3 backup command must be run first and its output put in the receipt"

**Actions:**
1. Store the retrospective document at `docs/lessons/<date>_<事故名>.md` (timeline + root cause chain + measures; if over 12 lines it can be split into two cards: a symptom card + a mechanism card)
2. **Draft on the spot** the modification draft for the target file for each preventive measure (the change = modifying rules; the agent executes after the human confirms)
3. The commit is scheduled in §④: the same commit as the state write-back and the retrospective output; this section does not commit

**Prohibitions:**
- Measures written as "raise awareness / be careful next time / be more cautious" are forbidden (rejected and rewritten without exception)
- Finishing the retrospective without changing any file is forbidden (a retrospective with no landing point = no retrospective)
- Attributing responsibility to people is forbidden (attribute it to the mechanism: which check was missing that made it easy for people to err)

---

## ③ Evidence receipt

1. Retrospective document path
2. Preventive measure list: measure → landing point file → change content → **the raw text of the user's verdict on each measure** (quote item by item; write "awaiting verdict" for those not yet decided)
3. Closing evidence (filled in after the §④ commit): commit hash + the complete output showing `check.ps1` exit code 0 + `git status --porcelain` empty

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md: `当前任务` cleared; `起点锚点` kept (this card does not clear it); `下一步` = 5-1 Archive; `未来 3 步` rolls over if the incident affected the plan.

Then commit and re-run:
```powershell
$worst = 'export-limit-overwrite'                        # incident name slug
$doc = "docs/lessons/$(Get-Date -Format 'yyyy-MM-dd')_$worst.md"
git add STATE.md $doc docs/TECH_DEBT.md
git commit -m "6-5 docs(postmortem): $worst 复盘与预防措施"
powershell -NoProfile -File check.ps1
```

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
