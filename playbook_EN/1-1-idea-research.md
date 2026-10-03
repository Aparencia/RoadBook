# Card 1-1 · Idea research (the only entry point of the project phase; Kill is a legitimate outcome)
> Trigger: the user says "启动/立项/调研一下" ("start / kick off / look into it") about a concrete idea | Output: docs/decisions/IDEA_<日期>_<主题>.md | Next: Go → 1-2 stack init; Pivot → re-run this card (≤2 rounds); Kill → flow ends

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following four items, then act (a missing item means do not start):

1. **Restate the task**: restate this idea in one plain sentence — for whom, and what problem it solves.
2. **Assumptions list**: list one by one the default assumptions you made on the user's behalf (e.g. "单人使用" ("single user"), "不做支付" ("no payment")).
3. **Clarifying questions (≤5, keep them to the minimum)**: ask only what the research direction requires; anything already inferable from the conversation must not be asked again.
   ❌ Counter-example: "你觉得这个想法有前途吗？" ("do you think this idea has promise?") (this is a question the research must answer, not a clarification)
   ✅ Example: "这个工具只给你自己用，还是打算给其他人用？" ("is this tool only for you, or do you plan to give it to others?") "你的投入节奏是？" ("what is your working cadence?") (weekend blocks / full days / fragmented time) "你打算给验证期多少时间预算？" ("how much time budget will you give the validation period?") (default 2 weeks)
4. **Quote the checklist verbatim** (paste verbatim the "six Kill criteria questions" from §② of this card).

Also state: the output lands at `docs/decisions/IDEA_<日期>_<主题>.md`; this card produces only a report and a recommendation, and the user decides Go/Kill/Pivot. **Time limit: record a start timestamp at ① and an end timestamp at ③; if no recommendation is possible after the time limit (>60 minutes) → stop and ask the user** — at most one clarification round, and unresolved items are marked explicitly.

---

## ② Execution

**Action 0: create the directory and the pool** (run in the target project directory — first record that absolute path in `$proj`; creating a new docs/ inside the master repo is forbidden)

**Variable names must be ASCII**: when Windows PowerShell 5.1 reads a .ps1 without BOM, a Chinese variable name raises "字符串缺少终止符" ("string is missing the terminator"); scripts must be saved as UTF-8 with BOM.
```powershell
$proj = 'C:/code/myapp'   # absolute path to the target project root; assign before calling
Set-Location $proj
New-Item -ItemType Directory -Force docs/decisions, docs/pool | Out-Null
if (-not (Test-Path docs/pool/IDEAS.md)) { Set-Content docs/pool/IDEAS.md @('# IDEAS · 需求池', '', '| 日期 | 想法 | 状态 | 复活条件 / 结论 |', '|---|---|---|---|') }
```

**Action 1: market and status-quo data (every number must be traceable)**
One rule: a number must be followed by a source link, or marked "⚠️ 估算：依据" ("estimate: basis").
- Found → write the number + source link + retrieval date (write today's date; copying a sample date verbatim is forbidden).
- Only second-hand retelling → mark ⚠️ estimate + state the derivation basis.
- Not found → write literally "未查到公开数据" ("no public data found"); no retrieval capability → mark everything "⚠️ 待验证：需联网核实" ("to be verified: requires an online check").
❌ Counter-example: "笔记市场规模达百亿级，增长迅猛" ("the note-taking market is worth tens of billions and growing fast") (no source, suspected fabrication)
✅ Example: "目标关键词月搜索量约 1.2 万" ("the target keyword gets about 12,000 monthly searches") (source: https://… , retrieval date <today>)

**Action 2: competitors ≥2** (write the table into the IDEA file)
Columns: competitor name / one-line positioning / difference from this idea / source link.
Fewer than 2 → write "未找到竞品" ("no competitors found") and attach the list of search keywords you used (proof that you really searched).

**Action 3: SWOT (1–3 items per cell, rather too few than padded; every item must be verifiable)**
❌ Counter-example: S: "技术先进，体验流畅" ("advanced technology, smooth experience") (unverifiable adjectives)
✅ Example: S: "单人本地运行、零服务器成本——与竞品 X 订阅制（$5/月，来源链接）形成差异" ("runs locally for a single user, zero server cost — differentiates from competitor X's subscription model ($5/month, source link)")
A cell with fewer than 2 verifiable items → write "仅找到 1 条可验证项" ("only 1 verifiable item found"); **inventing weak items to pad the count is forbidden**.
**Unverifiable innovation judgments are not discarded**: write them into the "⚠️ 待验证直觉" ("intuition pending verification") section at the end of the IDEA file, each noting "why it cannot be verified now + what minimal experiment could verify it". They are not evidence and do not count toward scoring — they are assumptions left for the MVP to test.

**Action 4: define the thinnest MVP slice** (slice first, then judge: the answer to question ④ depends on this step)
State in one sentence: what gets built + how the first user uses it + what is explicitly excluded.
❌ Counter-example: "一个功能完善的笔记应用" ("a full-featured note-taking app")
✅ Example: "单页网页：粘贴文本→按段落生成卡片→导出 Markdown；不做账号、不同步、不做移动端" ("a single-page web app: paste text → generate cards by paragraph → export Markdown; no accounts, no sync, no mobile")

**Action 5: the six Kill criteria questions (read them aloud to the user, record each answer verbatim)**

```text
① Is this a problem you actually hit yourself? (not an imagined "someone else might need it")
② Given your working cadence, are you willing to spend a validation budget on it?
③ Why can existing tools (including competitors) not satisfy this? Can you give one hard reason?
④ Given your working cadence, can the thinnest slice be built and put in front of real users within the validation budget?
⑤ What do you lose if it dies? (the answer may be "zero loss", but it must be honest)
⑥ Will it still be useful to you a year from now?
```
Reading (the questions mean different things; merging them into a single veto is forbidden):
- ② answered "否" ("no") → recommend Kill (insufficient willingness to invest; value cannot even be discussed)
- ③ no hard reason → recommend Kill or Pivot (switch the target audience/scenario and think again)
- ④ answered "否" ("no") → **go back to Action 4, re-slice, then judge once more**; if it is already the thinnest slice and still cannot be built → recommend Pivot (shrink scope / change form); recommend Kill only when the slice and the budget truly cannot be reconciled
- All pass → recommend Go

**Action 6: verdict (the human is the only judge)**
Summarize: recommendation (Go/Kill/Pivot) + one-line basis + IDEA file path. Then stop and wait for the user's verdict.
User says Go → this card ends; says Kill → run Action 7;
says Pivot → rewrite the idea one-liner and **re-run Actions 1–5 (including re-slicing), at most 2 rounds**; still not Go after round 2 → recommend Kill, attaching a comparison of the bases from both rounds.

**Action 7: Kill wrap-up (run only on Kill)**
In `docs/pool/IDEAS.md` find the idea's row, change its status to `killed` and append the revival condition; **if the row does not exist, append one in the header format**:
`| <日期> | <想法一句话> | killed | 复活条件：<具体条件> |` (i.e. `| <date> | <idea one-liner> | killed | revival condition: <concrete condition> |`)
❌ Counter-example: revival condition: "以后再说" ("let's see later")
✅ Example: revival condition: "出现支持本地离线同步的成熟开源库时重启" ("restart when a mature open-source library supporting local offline sync appears")

**Prohibitions:**
- Fabricating numbers, sources, or competitor features is forbidden — if you cannot find it, write "未查到公开数据" ("no public data found")
- Replacing data with adjectives ("很大" ("very big"), "很快" ("very fast"), "前景广阔" ("broad prospects")) is forbidden
- Announcing Go/Kill/Pivot yourself is forbidden (give only a recommendation + basis; the verdict is the human's)
- Creating project code, copying the template set, or running `git init` before the verdict is forbidden

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. Full path of the IDEA file + line count
2. Data traceability list: every number in the file → source link / ⚠️ estimate / "未查到公开数据" ("no public data found"), listed one by one
3. The user's verbatim answers to the six Kill criteria questions; for ④, if re-slicing was triggered, attach both the before and after slices
4. Recommendation + one-line basis; the user's verbatim verdict (Go/Kill/Pivot)
5. On Kill: the verbatim text of the modified row in `docs/pool/IDEAS.md`

---

## ④ State write-back

The project is not initialized yet (no STATE.md) — state is governed by the status of the idea's row in `docs/pool/IDEAS.md`:
- Go → set status to `approved` (the status vocabulary is exactly idea/researching/approved/done/killed; `done` is written when card 5-1 archives), append "已立项，见 decisions/IDEA_*.md" ("project approved, see decisions/IDEA_*.md")
- Kill → set status to `killed` + revival condition (Action 7)
- Pivot → keep status `idea`, update the idea one-liner to the new wording, note "Pivot 第 <n> 轮" ("Pivot round <n>")

Next:
- Go → card 1-2 stack init
- Pivot → re-run this card (≤2 rounds)
- Kill → flow ends; wait for a new intent

Fixed closing line:
`Idea research complete, recommendation: <Go/Kill/Pivot>. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
