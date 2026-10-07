# Card 2-5 · Risk and stakeholders (tier L, or this task involves ≥2 parties)
> Trigger: tier = L, or someone other than the user — another person / a team / an external system — takes part in this task ｜ Output: docs/specs/<date>_<slug>/RISK.md + the STATE.md `风险摘要` line ｜ Next: 3-7 Architecture definition (first shaping / structural change) → 3-1 Design (tier L); non-L tiers → 3-3 Test strategy
> Process area: RISK

---

## ① Start confirmation

After receiving the start instruction, first receipt the following five items before acting (a missing item means do not start):

1. **Restate the task**: in one sentence, say "how badly this task can go wrong at worst, and who is hurt when it does".
2. **Assumptions list**: write "I assume X; if that is wrong then risk Y escalates" line by line — look up `STATE.md`, `docs/specs/<date>_<slug>/SCOPE.md`, `docs/registry/APIS.md` first.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that decide the risk level and the notification targets.
   ❌ Counter-example: "这个项目有风险吗？" ("Does this project have risks?") — nothing comes out of it, and it shows the scope was never read
   ✅ Good example: "这次改动谁必须在上线前知道？出事时谁负责接电话？" ("Who must know about this change before it goes live? Who is on the phone when it breaks?")
4. **Paste this card's checklist verbatim (repeat these five lines word for word at start, tick them one by one before closing)**:
   - [ ] ① Every risk has an observable trigger signal (a symptom + a number, so anyone can decide that it happened)
   - [ ] ② Probability × impact gives the level; the levels are only red / amber / green and the criteria are fixed in writing
   - [ ] ③ Every risk takes one of two paths: a mitigation, or explicit acceptance (acceptance must state the reason + who accepted it and when)
   - [ ] ④ The stakeholder table has all four columns: who / what they care about / how to notify / when to notify
   - [ ] ⑤ The go-live notification targets and the one-line register summary are written into STATE.md (not written = this card is not complete)
5. **Landing declaration**: output = `docs/specs/<date>_<slug>/RISK.md` + the STATE.md `风险摘要` line; next card = 3-1 Design (tier L); non-L tiers → 3-3 Test strategy.
"≥2 parties" counts the user as one party [disambiguated].

---

## ② Execution

**Action 1: risk register (six columns, one row per risk)**

| Risk | Probability | Impact | Mitigation / explicit acceptance | Trigger signal (observable) | Owner |
| :-- | :-: | :-: | :-- | :-- | :-- |
| a third-party logistics API times out and the order gets stuck | medium | high | mitigation: add a 3 s timeout to the call + degrade on failure to "check later" | within 5 minutes the 5xx rate > 5% or P95 > 3 s | agent drafts / the user gives the go-ahead |

Level criteria (read them aloud; write them into RISK.md word for word):
- Probability: high = early signs already visible or ≥50%; medium = 10–50%; low = <10%
- Impact: high = the task is void / data is corrupted / go-live slips by ≥1 week; medium = 1–3 days of rework or part of the feature is degraded; low = small rework ≤1 day
- Level: high×high = red (must be handled this round); one high = amber (all three of mitigation + trigger signal + owner must be present); everything else = green (explicit acceptance is enough)

❌ Counter-example: risk "接口不稳定" ("the API is unstable"), signal "接口可能会挂" ("the API may go down") — not observable, nobody can decide that it happened
✅ Good example: signal "连续 5 分钟 5xx 比例 > 5%" ("the 5xx rate stays > 5% for 5 minutes in a row") — anyone who opens the monitoring can decide

**Action 2: mitigation or explicit acceptance, pick one (there is no third path)**
❌ Counter-example: risk "误删账单" ("a bill is deleted by mistake"), mitigation "注意备份" ("be careful with backups") — a slogan with no action and no owner
✅ Good example one (mitigation): "删除前自动导出 snapshot 到 docs/archive/；责任 = agent 出草案、用户执行删除" ("export a snapshot to docs/archive/ automatically before deleting; owner = agent drafts, the user performs the delete")
✅ Good example two (explicit acceptance): "单机单用户，删错重录约 5 分钟，用户已于 2026-10-03 确认接受" ("single machine, single user; re-entering a wrong deletion takes about 5 minutes; the user confirmed acceptance on 2026-10-03")

**Action 3: stakeholder table (four columns)**

| Who | What they care about | How to notify | When to notify |
| :-- | :-- | :-- | :-- |
| end users (N people) | whether the feature disrupts how they work today | README change note + a group announcement | on go-live day |
| the data provider | whether the table structure changed and whether the interface needs changes | email / group + the change line in docs/registry/APIS.md | after the design is approved |

The notification method must be executable in this project (email / group chat / README change note / verbal); "适时沟通" ("communicate in due course") and "保持同步" ("stay in sync") are forbidden; "when to notify" states a concrete point in time (after design approval / when coding is done / on go-live day / within 30 minutes of an incident).
Prohibition: writing real phone numbers, private email addresses or home addresses into the repository is forbidden; write only role names + channel names.

**Action 4: go-live notification targets (write into the 「上线通告」 ("go-live notification") section of RISK.md, three lines)**
① who will use it; ② who is affected by it (people who see "no change, nothing to do" still get told); ③ who must know before it happens (for example the person who owns backups, the contact on the downstream interface).
Single-person mode (nobody other than the user — no other person / team / external system): skip the stakeholder table and the go-live notification sections, and write one line of reason in STATE.md `裁剪记录` ("trim record").

**Action 5: one summary line into STATE.md**
Write the single highest-level risk as one line in STATE.md `风险摘要` (= the biggest risk + mitigation + trigger signal; with no red or amber, write `无` ("none")); open questions (awaiting the user's verdict on acceptableness) are registered separately under `未决问题`. When a red-line area is touched, also update `红线摘要`.

**Action 6: commands (assign first, then call; a hit on one line = one unobservable signal or one slogan-style mitigation)**
```powershell
$spec = 'docs/specs/20261003_export'
New-Item -ItemType Directory -Force -Path $spec | Out-Null
Select-String -Path "$spec/RISK.md" -Pattern '注意|留意|适时|大概|尽量|可能'
```
Expected: this scan hunts slogan-style mitigation wording: a hit prints `<absolute path>:<line number>:<whole line>` (measured in a sandbox on this machine: `…\20261003_export\RISK.md:1:风险：可能延期`), one line per hit, each to be rewritten as an observable signal (threshold + observer + who gets notified). **On zero hits it prints nothing at all** (measured: 0 lines, `$?` still True) — that silence is the passing shape of "every risk has an observable", so do not read it as "the command never ran". `-Pattern` is a regex, so `|` means "or" (any of the six words hits), and when `$spec/RISK.md` does not exist it prints `Select-String : Cannot find path '<absolute path>' because it does not exist.` (a Chinese host prints `找不到路径“<绝对路径>”，因为该路径不存在。`) and flips `$?` to False while the **exit code does not move** (non-terminating error; `$LASTEXITCODE` keeps its stale value — measured: 77 survives) ⇒ judge this fence by its output only. Scanning the whole spec at once is `-Path "$spec/*.md"` (measured: hits listed per file).

**Prohibitions:**
- Writing a "risk" as a "worry" is forbidden (a sentence with no observability and no owner = not complete)
- Listing risks without changing any action is forbidden: red / amber risks must land on a batch action or a trigger signal of this task
- Declaring "accepted" on the user's behalf is forbidden — explicit acceptance requires the user's own words and a date
- Writing an overall conclusion such as "以上都是小问题" ("all of the above are minor") is forbidden (level every item; no bulk verdicts)

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give, item by item:
1. RISK.md full path + line count
2. Number of register rows + the red / amber / green counts
3. One line per red / amber risk: risk → trigger signal → owner
4. Number of explicit acceptances + the user's own words of acceptance and the date
5. Number of stakeholder table rows + the three go-live notification lines verbatim
6. The STATE.md summary line verbatim (paste the actual line)
7. The slogan self-check command output (a `Select-String` with no output is the pass)
8. This commit's hash (verbatim `git rev-parse HEAD`)

---

## ④ State write-back

**Write back first, commit second**. Update STATE.md:
- `风险摘要` = the biggest risk + mitigation + trigger signal (write `无` ("none") when there is none); `未决问题` = risks that are explicitly accepted (awaiting the user's verdict on acceptableness)
- `红线摘要` = the red-line areas touched this time (leave it alone when there are none)
- `下一步` = 3-1 Design (tier L); non-L tiers → 3-3 Test strategy

After the write-back, the closing triple (write back state → commit → re-run the gate for a 0):
```powershell
$spec = 'docs/specs/20261003_export'
git add STATE.md $spec
git commit -m "2-5 docs(spec): 风险登记册与干系人（触发信号+通告对象）"
powershell -NoProfile -File check.ps1
```
Expected: `git add STATE.md $spec` (`$spec` is a directory; measured: the whole directory is staged) prints 0 lines and exits 0; if any path is missing → `fatal: pathspec '…' did not match any files` with **exit code 128** and nothing at all staged (measured: the failure is atomic). A successful `git commit` prints `[main <short-hash>] 2-5 docs(spec): 风险登记册与干系人（触发信号+通告对象）` + ` N files changed, M insertions(+)` and exits 0; the close-out is done when `git status --porcelain` is empty and `check.ps1` ends with `全部通过（退出码 0）：完成声明成立。`
`git status --porcelain` empty + check.ps1 exit code 0 = the close-out is done.

Fixed closing line:
`The risk register and stakeholder table are ready; acceptableness awaits your verdict. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
