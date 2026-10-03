# Card 2-3 · Requirement elicitation (add it when the requirement is vague or there are real users; tier S skips it)
> Trigger: the requirement description is vague (three or more reasonable interpretations exist) or there are reachable real users for this task (tiers M/L; tier S skips this card) ｜ Output: docs/specs/<date>_<slug>/ELICIT.md ｜ Next: 2-2 Requirement scope

---

## ① Start confirmation

After receiving the start instruction, first receipt the following five items before acting (a missing item means do not start):

1. **Restate the task**: in one plain sentence, say "from whom, to find out what", and write down the three vaguest points as they stand. If you cannot write down three points = the requirement is not vague, this card does not run, go straight back to 2-2.
2. **Assumptions list**: write "I assume X; if that is wrong then Y is void" line by line — anything that can be looked up in `docs/specs/<date>_<slug>/SCOPE.md`, `docs/pool/IDEAS.md`, `STATE.md` must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that cannot be found in the project files and that decide the research approach.
   ❌ Counter-example: "这个功能重要吗？" ("Is this feature important?") — the user started the work, so it is important by definition
   ✅ Good example: "能接触到的是哪几个用户？他们现在怎么做这件事？" ("Which users can we reach? How do they do this today?")
   If not a single real user is reachable → write "无真实用户，本卡只做第 4 项假设显式化" ("no real users; this card only makes the assumptions explicit") [disambiguated: 第 4 项 is read as the assumptions list, item 2 above — no research method is chosen] and state who decides on the user's behalf.
4. **Paste this card's checklist verbatim (repeat these five lines word for word at start, tick them one by one before closing)**:
   - [ ] ① Every need carries the user's original words, not my paraphrase
   - [ ] ② "What the user said" and "what the user really wants" are written in two separate columns, and every conflict is flagged item by item
   - [ ] ③ Every need has a counter-example written (in what situation it does not hold, who would object)
   - [ ] ④ Frequency is written as a number ("3 times a week"); the text contains no "经常/偶尔/有时" ("often / occasionally / sometimes") anywhere
   - [ ] ⑤ All open items are written into the SCOPE open-items column; not one of them is left in the chat
5. **Landing declaration**: output = `docs/specs/<date>_<slug>/ELICIT.md`; next card = 2-2 Requirement scope (carry the open items over into the SCOPE open-items column).

---

## ② Execution

**Action 1: choose one of the five methods (pick only one; if you pick two or more, first write down why one is not enough)**

| Method | When to use it | Cost | Output |
| :-- | :-- | :-- | :-- |
| Interview (one-to-one, 30–45 minutes) | you already know 1–3 real users and want to know "why" | low | original words + concrete stories |
| On-site observation | the user cannot describe the steps, or "what they say" and "what they do" differ | medium | the real order of operations and the sticking points |
| Questionnaire | you need to cover ≥10 people and the questions can have preset options | medium | distribution and frequency |
| Usability test | a prototype or half-finished build exists; watch whether people can actually use it | medium | a record of where they get stuck |
| Prototype (clickable / paper) | the requirement is abstract and the user does not know what they want either | high | feedback and trade-offs |

Read-aloud selection criteria: fewer than 3 users and you need "why" → interview; repeated manual work → on-site observation; you need a ranking or a share → questionnaire; something clickable already exists → usability test; the user cannot even say "what to do" → prototype.
❌ Counter-example: "五法全上一遍" ("run all five methods once each") — the cost explodes and the conclusions contradict each other
✅ Good example: "先访谈 2 人 → 发现都卡在手工抄数字 → 选访谈，不追加问卷" ("interview 2 people first → both are stuck copying numbers by hand → choose the interview, do not add a questionnaire")

**Action 2: questioning discipline (three rules; violating one voids the record)**
- No leading questions: ❌ "你是不是觉得导出太慢？" ("Do you think the export is too slow?") ✅ "上次导出的时候发生了什么？" ("What happened the last time you exported?")
- Ask for the original words, not a paraphrase: ❌ "用户希望导出更快" ("the user wants the export to be faster") ✅ "我点了导出去泡了杯咖啡，回来还没好" ("I clicked export, went to make coffee, and it was still not done when I came back") (the user's own words)
- Ask "why" three times in a row (≥3 layers, until a hard constraint such as money / time / compliance shows up, or the other person answers "不知道" ("I don't know")):
  want to export → because the weekly report must go out → the weekly-report numbers are copied by hand → because the system has no shareable link

**Action 3: raw record table (one row per need, five columns; write "未获取" ("not obtained") when it cannot be obtained, leaving it blank is forbidden)**

| Original words of the need | Usage scenario | Frequency | Current workaround | Counter-example |
| :-- | :-- | :-- | :-- | :-- |
| "回来还没好" ("it was still not done when I came back") | export the monthly bill and send it to finance at the end of each month | 3 times a week | copied into Excel by hand | only finance wants a daily report; the other 3 people object to doing the export first |

Frequency only accepts numbers; for the counter-example write "who would object to this item under what circumstances" — no counter-example = this item was not asked through.

**Action 4: split "what the user said" from "what the user really wants" (the core action of this card; merging them into one column is forbidden)**

| What the user said | What the user really wants (my judgement) | Basis (original words / behaviour) | The cost if the judgement is wrong |
| :-- | :-- | :-- | :-- |
| "要导出 Excel" ("I want an Excel export") | "stop copying the weekly-report numbers by hand" | all three "why" layers landed on hand-copying | if a shareable link is given, the Excel need may disappear and the scope can be halved |

❌ Counter-example: "把「用户要导出」直接写成 Must 就开工" ("write 'the user wants an export' straight into Must and start coding")
✅ Good example: "把判断写成待裁决的假设，连「错了的代价」一起写" ("write the judgement as a hypothesis awaiting a verdict, together with the cost if it is wrong") — only then does the user know which item to watch

**Action 5: land ELICIT.md (fixed structure, four sections)**
```text
# Requirement elicitation record (<date>)
Method: <one of the five> ｜ Participants: <how many, which roles; write "user A / user B", real names are forbidden>
## 1. Raw record (the table from Action 3)
## 2. Said vs wanted (the table from Action 4)
## 3. Open items (item by item; each one says "what the user must answer")
## 4. Not asked (honest boundary: users not reached, assumptions not verified)
```

**Action 6: create the task directory (assign first, then call)**
```powershell
$spec = 'docs/specs/20261003_export'
New-Item -ItemType Directory -Force -Path $spec | Out-Null
```

**Prohibitions:**
- Filling in the user's original words from memory is forbidden; anything not written down is "未获取" ("not obtained")
- Writing "what the user said" straight into SCOPE as a requirement is forbidden (Action 4 must come first)
- Writing real names / phone numbers / ID numbers / email addresses into the record is forbidden; recording and screenshots require stating the purpose in advance and getting consent
- Producing a solution in this card is forbidden (solutions belong to 2-1 and 3-1); this card only produces needs, counter-examples and open items
- Skipping this card and saying "需求已经清楚了" ("the requirement is clear now") is forbidden — skipping while the trigger condition holds = this round is void (except for tier S)

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give, item by item:
1. ELICIT.md full path + line count (`$spec = 'docs/specs/20261003_export'; (Get-Content "$spec/ELICIT.md").Count`)
2. The method chosen + one sentence of the basis (matching Action 1's criteria)
3. Number of raw record rows + how many of them have a numeric frequency ("经常/偶尔" ("often / occasionally") appears 0 times)
4. Number of "said vs wanted" mismatches + at least 1 quoted set of original words
5. The open-items list text (item by item; these go into the SCOPE open-items column)
6. Whether the participants are anonymized (yes / no); if "no", fix it first and then receipt
7. This commit's hash (verbatim `git rev-parse HEAD`)

---

## ④ State write-back

**Write back first, commit second** (reversing the order = STATE.md left uncommitted, and the close-out will judge it red). Update STATE.md:
- `当前任务` = <feature name> (link ELICIT first while SCOPE does not exist yet)
- `未决问题` = the open items from section 3 of ELICIT.md, item by item
- `下一步` = 2-2 Requirement scope

After the write-back, the closing triple (write back state → commit → re-run the gate for a 0):
```powershell
$spec = 'docs/specs/20261003_export'
git add STATE.md $spec
git commit -m "2-3 docs(spec): 需求获取记录（原话+说的vs要的+未决项）"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = the close-out is done.

Tier note: tier S does not run this card (≤3 files, ≤100 lines and clear acceptance criteria; **single-page static app exception**: 1 entry page + no backend + no dependency → ≤5 files and ≤400 lines); tiers M/L run it whenever the requirement is vague or real users exist.

Fixed closing line:
`The elicitation record is ready and the open items are listed. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
