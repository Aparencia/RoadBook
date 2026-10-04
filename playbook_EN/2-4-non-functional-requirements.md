# Card 2-4 · Non-functional requirements (mandatory for tiers M/L; tier S does not run it — its performance / security rows go straight into SCOPE)
> Trigger: after 2-2 Requirement scope is confirmed by the user (tiers M/L) ｜ Output: docs/specs/<date>_<slug>/NFR.md ｜ Next: 2-5 Risk and stakeholders (tier L or ≥2 parties), otherwise 3-3 Test strategy

---

## ① Start confirmation

After receiving the start instruction, first receipt the following five items before acting (a missing item means do not start):

1. **Restate the task**: in one plain sentence, say "under what conditions this feature counts as usable" (how fast, how stable, how much load it carries, who may see it).
2. **Assumptions list**: write "I assume X; if that is wrong then threshold Y is void" line by line — look up `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `docs/registry/DATA_DICT.md`, SCOPE.md first.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about the hard numbers that decide the thresholds.
   ❌ Counter-example: "性能有什么要求吗？" ("Are there any performance requirements?") — the user cannot answer, so the question is wasted
   ✅ Good example: "这个页面慢到几秒你会觉得不能接受？峰值大概几个人同时用？" ("At how many seconds would you call this page unacceptably slow? How many people use it at peak, roughly?")
   If the user cannot answer → use a measured current baseline as the basis (Action 3); picking a number out of thin air is forbidden.
4. **Paste this card's checklist verbatim (repeat these five lines word for word at start, tick them one by one before closing)**:
   - [ ] ① All six dimensions are filled in: a measurable threshold (number + unit) + how to verify it + the check command (the one that produces the verdict) + which stage it runs in; all four are required
   - [ ] ② Where no threshold can be given, `N/A（理由）` is written; nothing is left blank and there is no "尽量/差不多/待定" ("as far as possible / roughly / to be decided")
   - [ ] ③ Every threshold has one verification action 4-3 can execute directly (the text is written into this card's output)
   - [ ] ④ Thresholds are measurable boundaries (P95 ≤ 800 ms), not adjectives (the response should be fast)
   - [ ] ⑤ The user has looked at every threshold and confirmed it (quote their words; without confirmation entry into 4-1 is forbidden)
5. **Landing declaration**: output = `docs/specs/<date>_<slug>/NFR.md`; this card runs for tiers M/L — tier S does not run it (its performance / security rows go straight into SCOPE, unless the user explicitly asks); next card = 2-5 Risk and stakeholders (tier L or ≥2 parties), otherwise 3-3 Test strategy.

---

## ② Execution

**Action 1: fill in the six-dimension list dimension by dimension (in a table, one row per dimension; all six rows are required)**

| Dimension | The question it must answer | Typical threshold example (change the numbers to fit the project; copying them is forbidden) | How to verify | Check command (the one that produces the verdict) | Which stage it runs in |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Performance | how slow counts as slow? | list page P95 ≤ 800 ms; a single export ≤ 5 s | load test, or run a timing script 3 times in a row and take the median | `powershell -NoProfile -File scripts/bench.ps1 -Rows 1000` | 4-3 Verification (must run before close-out) |
| Capacity | how much data / concurrency can it still carry? | one table ≤ 100 万 rows (1 million); one uploaded file ≤ 50 MB; peak concurrency ≤ 200 | data-generation script + load test | `powershell -NoProfile -File scripts/make-data.ps1 -Rows 1000000` | 4-3 Verification (after generating data) |
| Availability | how much downtime is allowed? | monthly availability ≥ 99.5% (monthly downtime ≤ 3.6 h); start-up ≤ 3 s | health checks and runtime-log statistics | `powershell -NoProfile -File scripts/uptime.ps1 -Days 30` | 5-4 Runtime observation (run monthly) |
| Security | who can see it, who can change it? | not logged in returns 401; accessing another user's data without authorization returns 403; logs contain no phone numbers | run the test cases item by item (each threat-modeling check item lands as a test case) | `powershell -NoProfile -File scripts/security-cases.ps1` | 4-3 Verification + whenever auth or permissions are touched |
| Maintainability | how long until a newcomer can run it? | runs on a clean machine in ≤ 30 minutes; single file ≤ 500 lines | actually run it once following docs/RUNBOOK.md and time it | `Measure-Command { powershell -NoProfile -File scripts/onboard.ps1 }` | before 5-1 Archive (runnability recheck) |
| Compatibility | in which environments must it work? | Chrome/Edge latest 2 major versions; Windows 10+; installer ≤ 20 MB | visual check on each target environment | `powershell -NoProfile -File scripts/compat.ps1` | 4-3 Verification + before 5-2 Release |

"Peak concurrency ≤ 200" is read as concurrent users, not requests per second [disambiguated].
❌ Counter-example: `性能：响应要快，体验要好` ("performance: the response should be fast, the experience good") — not measurable, so it is as good as unwritten
✅ Good example: `性能：列表页 P95 ≤ 800 ms（1000 行数据）；验证：脚本连跑 3 次取中位数` ("performance: list page P95 ≤ 800 ms (1000 rows of data); verify: run the script 3 times in a row and take the median")
**A number without a command is a wish**: "how to verify" says how to measure it, the check command says which command produces the verdict — it must be one real copyable line (`powershell -NoProfile -File scripts/<script>.ps1`), never "take a look" or "seems fine"; which stage it runs in must name a concrete card or moment, otherwise nobody ever runs that threshold.

**Action 2: give every threshold one action 4-3 can execute directly**
Append one line after each threshold in NFR.md: `验证动作：<命令／打开哪页 → 做什么 → 看什么>` ("verification action: <which command / which page to open → do what → look at what>").
Criterion: pasting this line as-is into VERIFY.md makes it executable, without looking up any other file.
❌ Counter-example: `验证动作：测一下性能` ("verification action: test the performance") — cannot be executed and cannot be judged red
✅ Good example: `验证动作：起服务后跑 scripts/bench.ps1 -Rows 1000，读输出 P95 ≤ 800` ("verification action: start the service, run scripts/bench.ps1 -Rows 1000, read P95 ≤ 800 from the output")

**Action 3: a threshold may come from only three places (write the basis at minimum; gut feeling is forbidden)**
① a hard number the user gave (quote their words); ② a measured current baseline (measure first, then set it; the command goes into NFR.md); ③ a publicly documented practice in a comparable product (state the source).
❌ Counter-example: "阈值定 800 ms，因为「看着顺眼」" ("the threshold is 800 ms because it looks about right")
✅ Good example: "现状基线实测 P95 = 2.3 s，目标取 1/3 → 定 800 ms" ("measured current baseline P95 = 2.3 s; take one third → set 800 ms")

**Action 4: write `N/A（理由）` where no threshold can be given**
Example: `可用性：N/A（本地单人桌面工具，无服务端，不存在停机概念）` ("availability: N/A (local single-user desktop tool; there is no server, so downtime does not exist)").
Tier S does not run this card (its performance / security rows go straight into SCOPE, unless the user explicitly asks for this card); a dimension the user cannot give a threshold for always gets `N/A（理由）`. Writing "待定" ("to be decided") or "后续再补" ("fill it in later") is forbidden.

**Action 5: two lines of commands (assign first, then call; a hit on the second line = one non-measurable statement)**
```powershell
$spec = 'docs/specs/20261003_export'
New-Item -ItemType Directory -Force -Path $spec | Out-Null
Select-String -Path "$spec/NFR.md" -Pattern '待定|尽量|差不多|可能|应该'
```

**Prohibitions:**
- Leaving a dimension blank is forbidden: every dimension needs a threshold or `N/A（理由）` (blank = nobody owns that requirement)
- Inventing numbers and using the tier as an excuse is forbidden (the tier only decides how many rows are filled, not whether they are true; inventing = a fake threshold)
- Using "I wrote tests" as a stand-in for the verification action is forbidden (writing tests ≠ having run the threshold verification)
- Entering 4-1 before the user confirms the thresholds is forbidden

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give, item by item:
1. NFR.md full path + line count
2. The six-dimension value table (dimension → threshold or `N/A（理由）`), all six rows present
3. The number of `N/A（理由）` items and the reason text
4. One line per threshold: threshold text → verification-action text → check-command text → which stage it runs in (write `N/A` items the same way)
5. The blank-value self-check command output (a `Select-String` with no output is the pass)
6. A quote of the user's words confirming the thresholds (without that confirmation the next card must not start)
7. This commit's hash (verbatim `git rev-parse HEAD`)

---

## ④ State write-back

**Write back first, commit second**. Update STATE.md:
- `当前任务` = <feature name> (link SCOPE.md and NFR.md)
- `未决问题` = the thresholds the user has not confirmed yet (item by item)
- `docs/ARCHITECTURE.md` §5 = write back in the same batch the thresholds that "constrain how a module is built" (the performance / capacity / compatibility rows most easily become architecture constraints)
- `下一步` = 2-5 Risk and stakeholders (tier L or ≥2 parties), otherwise 3-3 Test strategy

After the write-back, the closing triple (write back state → commit → re-run the gate for a 0):
```powershell
$spec = 'docs/specs/20261003_export'
git add STATE.md $spec
git commit -m "2-4 docs(spec): 非功能需求（六维阈值+验证动作）"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = the close-out is done.

Tier note: tiers M/L fill all six dimensions; tier S does not run this card — its performance / security rows go straight into SCOPE (the other dimensions get `N/A（理由）`).

Fixed closing line:
`The NFR document is ready and every threshold is paired with a verification action. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
