# Card 3-3 · Test strategy (tiers M/L; walked after the design is approved)
> Trigger: tier M/L and the design is approved (tier L = 3-1 Design has been walked; with 3-2 present, walk 3-2 first) ｜ Output: docs/specs/<date>_<slug>/TESTPLAN.md ｜ Next: 4-1 Batch coding

---

## ① Start confirmation

After receiving the start instruction, first receipt the following five items before acting (a missing item means do not start):

1. **Restate the task**: in one sentence, say "which behaviors of this task must be guaranteed by tests, and how long one full run takes".
2. **Assumptions list**: write "I assume X; if that is wrong then strategy Y fails" line by line — look up the acceptance criteria in `docs/specs/<date>_<slug>/SCOPE.md`, the thresholds in `docs/specs/<date>_<slug>/NFR.md`, and `docs/ARCHITECTURE.md`.
3. **Clarifying questions (≤5, delete any that can be deleted)**: ask only about things that decide the test scope and the thresholds.
   ❌ Counter-example: "要写多少测试？" ("How many tests should be written?") — the user cannot answer, so the responsibility is pushed back onto them
   ✅ Good example: "这个功能出错的代价是什么？哪种错你最不能接受？" ("What is the cost when this feature goes wrong? Which kind of mistake is least acceptable to you?")
4. **Paste this card's checklist verbatim (repeat these five lines word for word at start, tick them one by one before closing)**:
   - [ ] ① Each of the three pyramid layers states "what it covers", and the ratio has numbers
   - [ ] ② The critical-path list states the entry point and the expected result for every item
   - [ ] ③ The coverage thresholds are written on two separate lines (new code / whole repository), each with a number
   - [ ] ④ The fixture and test-data strategy names its sources and explicitly rules out production data
   - [ ] ⑤ "What is not tested" is listed item by item with a reason (with none, still write "无" ("none"))
5. **Landing declaration**: output = `docs/specs/<date>_<slug>/TESTPLAN.md`; next card = 4-1 Batch coding.

---

## ② Execution

**Action 1: allocate the three pyramid layers (as a table; fix the ratio as a number, which prevents "everything written as end-to-end")**

| Layer | What it covers | Rough ratio | Time for one run | Who writes it |
| :-- | :-- | :-: | :-- | :-- |
| Unit | pure functions and rules: amount calculation, state machine, validators (no network, no database) | ~70% | seconds | the agent writes them alongside each batch |
| Integration | crossing boundaries: API routes + database reads and writes + third-party mocks (including error branches) | ~20% | minutes | the agent writes them alongside each batch |
| End-to-end | the critical paths a user really walks (browser or command line, the whole chain) | ~10% | minutes | 1–3 per task |

The ratio counts test cases, not runtime [disambiguated].
If any layer is 0, the reason must be written under "what is not tested".
❌ Counter-example: "以单元测试为主，端到端适当覆盖" ("mostly unit tests, with appropriate end-to-end coverage") — no numbers, so it cannot be accepted
✅ Good example: "单元 ~70%（约 40 条，<10 s 跑完）；集成 ~20%（12 条）；端到端 3 条（登录 → 下单 → 退款）" ("unit ~70% (about 40 cases, finishing in <10 s); integration ~20% (12 cases); end-to-end 3 cases (login → order → refund)")

Every unit test must be able to name one production change that would make it red; if it cannot, or only an intentional change to a "常量值/提示文案/私有结构" ("constant value / prompt copy / private structure") would make it red → rewrite it as an assertion about **the behavior that depends on that decision** (example: do not test `MAX_RETRIES === 5`; test "a failed call is retried 5 times and does not happen again on the 6th").

**Action 2: the critical-path list (each item = entry point → action → the result that must hold)**
Draw the items from the acceptance criteria in SCOPE.md and the thresholds in NFR.md, missing none.
❌ Counter-example: "下单流程要测" ("the ordering flow must be tested") — no entry point, no expectation, so running it tells you nothing about right or wrong
✅ Good example: "`POST /orders` 带合法商品 → 201，且数据库新增 1 条订单、库存 -1" ("`POST /orders` with a valid product → 201, plus one new order row in the database and stock −1")
With 3-2 present, at least 1 privilege-escalation-refusal case (accessing B's resource with A's identity must be refused); with NFR thresholds, at least 1 threshold case (for example timing the P95 ≤ 800 ms bound).

**Action 3: coverage thresholds (written on two separate lines; merging them is forbidden)**

| Scope | Threshold | How it is measured | What to do when it is missed |
| :-- | :-- | :-- | :-- |
| New code | line coverage ≥ 80%, branch ≥ 70% | the test runner's `--coverage` report | add tests; if it really is scaffolding → write it under "what is not tested" and exclude it |
| Whole repository | line coverage ≥ 60%, rises only, never falls | same as above, compared with the previous report | a drop is judged red; restore it before entering 4-3 |

Change the numbers to fit the project; when this project has no coverage tooling, use the quantified substitute and write it into TESTPLAN.md: "critical paths 100% have test cases + each criterion gets one mutant falsification".
❌ Counter-example: "覆盖率达标即可" ("just hit the coverage threshold") — who decides what the threshold is?
✅ Good example: "新增 ≥80%，全仓 ≥60%；低于就补，禁止写'部分覆盖'放行" ("new ≥80%, whole repository ≥60%; top it up when it is below, and passing something off as 'partially covered' is forbidden")

**Action 4: fixture and test-data strategy**
- Fixture sources, pick one of three: factory functions (random but reproducible, with a fixed seed) / hand-written static JSON / redacted snapshots.
- **Using production data is forbidden** (including exported real user tables, real phone numbers, real orders); when a realistic data volume is needed, generate equivalent-scale data with a script.
- Data lives in `tests/fixtures/`, is committed with the repository and contains no personal information; every data set must be resettable with one command.
- Self-check command:
```powershell
Select-String -Path 'tests/fixtures/*' -Pattern '\d{11}|@(qq|163|gmail)\.com' | Select-Object -First 5
```
A hit = a suspected real phone number / email address; replace each one with generated data.

**Action 5: spell out "what is not tested" (a three-column table: what is not tested / why / the substitute)**

| What is not tested | Reason | Substitute |
| :-- | :-- | :-- |
| real third-party charges | it needs real money and a real account | sandbox + mocked callbacks; a small manual real charge before go-live |
| pixel-level visual differences | there is no design baseline | manual eye check, written into the behavior acceptance checklist |
| old browser versions | the user base does not use them | support is not promised, and that is written into the project README |

**Action 6: this strategy = the criteria for 4-3's verification grading (it replaces the "1~2 tests" rule of thumb)**
- Tier M: run every item of this card's critical-path list + meet the new-code coverage threshold.
- Tier L: add negative tests and privilege-escalation-refusal cases on top (zero tests is not allowed).
- At the end of TESTPLAN.md write a "commands for 4-3 to run" section, one line per command, so 4-3 can copy and execute them directly.

**Prohibitions:**
- Using production data as fixtures is forbidden ("redact it and then use it" does not work either — incomplete redaction is a leak)
- Writing "not tested" without a reason is forbidden; "the environment is not available" is not a reason — go find a substitute
- Reporting coverage numbers without pasting the report output is forbidden (numbers must be backed by command output)
- Loosening the strategy after the fact is forbidden: a strategy change must edit TESTPLAN.md in the same round and state the reason in the receipt; verbal loosening is not allowed
- Waiting for an async result with a fixed `sleep` / a fixed delay is forbidden: the wait must be written as "polling condition + explicit timeout" (the timeout message carries the condition description and the millisecond count), and the polling interval and the timeout value must have their basis written in a comment; when a test case fails intermittently, locate the source of nondeterminism first — increasing the delay to make it green is forbidden.

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give, item by item:
1. TESTPLAN.md full path + line count
2. The three-layer ratios and case counts (unit N / integration N / end-to-end N)
3. Number of critical-path items + how many are privilege-escalation-refusal cases and how many are threshold cases
4. The two coverage-threshold lines verbatim
5. Fixture sources + the production-data self-check command output (it must have no output)
6. Number of "what is not tested" items and the reason for each
7. The "commands for 4-3 to run" text verbatim
8. This commit's hash (verbatim `git rev-parse HEAD`)

---

## ④ State write-back

**Write back first, commit second**. Update STATE.md:
- `当前任务` = <feature name> (linking TESTPLAN.md)
- `未决问题` = strategy items the user has not confirmed yet (such as the coverage thresholds, and the items listed as "not tested")
- `下一步` = 4-1 Batch coding

After the write-back, the closing triple (write back state → commit → re-run the gate for a 0):
```powershell
$spec = 'docs/specs/20261003_export'
git add STATE.md $spec
git commit -m "3-3 docs(spec): 测试策略（金字塔+关键路径+覆盖率门槛+不测清单）"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = the close-out is done.

Branch note: tier M walks this card (design approved means SCOPE and NFR have been confirmed by the user); tier L walks it after 3-1 Design and 3-2 Threat modeling; tier S does not walk this card (passing the guardrail is enough).

Fixed closing line:
`The test strategy is ready and 4-3's criteria are fixed. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
