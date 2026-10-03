# Card 4-2 · Code review (mandatory for tiers M/L; tier S skips this card, with the 4-3 card guardrail + constitution §11 self-check as the fallback; run it in a new session independent of coding)
> Trigger: after 4-1 is green (**tier S: after 4-1 is green go straight to 4-3 (skipping 4-2); tiers M/L: after 4-2 is green and the user gives the go-ahead, go to 4-3**) ｜ Output: docs/reviews/CODE_<date>_<slug>.md ｜ Next: 4-3 verification (on red/amber, go back to 4-1 to fix, then re-review under the "re-review scope") [disambiguated]

---

## ① Start confirmation

This card must be executed in a **new session that did not take part in coding** (or dispatched to a subagent with a fresh context) — the implementer must not re-check their own work.

**Human-review substitute lane (the user may choose it; open only for tier M and below with total changed lines ≤150 and no red-line domain touched)**: the user says "I will look at it myself" → this card degrades to: tidy `git diff $anchor..HEAD` into an easy-to-read form + a three-sentence change summary + point out the two spots most worth a human look, then wait for the user to answer "pass/fail" (the 4-3 card guardrail still runs as the fallback). Red-line domains (authentication / payment / deleting data) do not qualify for this lane.
**The mechanical criterion for "total changed lines"**: read the start anchor from STATE.md into `$anchor`, then run `git diff --shortstat "$anchor..HEAD"` — the output looks like `3 files changed, 120 insertions(+), 30 deletions(-)`, and **total changed lines = 120 + 30 = 150, that is, the sum of the insertions + deletions numbers** (not net lines: deleting 200 and changing 200 would be counted as 0 by net lines, hiding a large change); only ≤150 opens this lane.
**Exit of the human-review lane (three steps; write them exactly like this)**: ① the user answers "pass" → the four-section full report may be skipped; land only a 3-line substitute record (change summary / the two spots worth looking at / the user's verdict verbatim) in `docs/reviews/CODE_<date>_<slug>.md`, and write 4-3 verification into STATE.md `下一步`; ② the user answers "fail" → turn the spots the user named into P1/P2 items (file:line + trigger condition), write "back to 4-1 to fix" into STATE.md `下一步`, and set the suggested color 🔴/🟡; ③ when the lane is done, the text before the closing line is `下一步：4-3 验证（回复"继续"即执行）`.

If the lane is not taken, first receipt these nine items; a missing item means do not start:

1. **Restate the task in plain words and the landing point**: which feature and which batch of diff is being reviewed this time (one sentence); output = `docs/reviews/CODE_<date>_<slug>.md`; next card = 4-3 verification (on red/amber go back to 4-1 to fix). [disambiguated]
2. **Assumptions list**: write "I assume X; if that is wrong then Y is void" for each item — anything findable in the project files must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete them if you can)**: ask only about things that cannot be found in STATE.md / SCOPE.md and that determine the review standard; if there is none at all, write "none".
4. **Anchor verification**: read it from the `起点锚点` field of STATE.md and assign it to `$anchor` → `git log --oneline $anchor -1` proves that commit really exists; cannot be read / invalid → **stop and ask the user** (reviewing from STATE memory is forbidden).
5. **Diff-reading confirmation**: the full output of `git diff --stat "$anchor..HEAD"` (a receipt item) + **read `git diff "$anchor..HEAD"` in full** (the receipt only reports "read the full diff, N lines in total" — judging any dimension without having read the full diff is forbidden).
6. **Review scope declaration**: limited to this diff and its directly related calls. Code outside the diff is not reviewed at all (scope creep = an invalid review).
7. **Referenced-reports list**: the old reports under docs/reviews/ that are relevant this time (write "none" if there are none). If there are old reports → receipt the current state of their P0/P1 items (fixed / not fixed); **old P0/P1 that have not been closed keep their original numbering and count toward this review's counts**; old P2/P3 are marked item by item (fixed / not fixed / false positive).
   **"False positive" upgraded to an evidence-backed rebuttal**: marking an item "false positive" requires a rebuttal basis at the same time (a technical reason + a code location or measured output); an item you cannot back with evidence is counted as "not fixed" in this round's counts, and clearing the books with "false positive" is forbidden.
8. **Paste the reference checklist verbatim** (paste word for word this card's §② "seven fixed dimensions" name list + severity criteria + suggested-color matrix + replacement and deprecation check).
9. **Dispatch input sheet** (copy it verbatim when dispatching a subagent; one missing item means do not dispatch): `DESCRIPTION` = what was built this time (≤3 lines) ｜ `PLAN_OR_REQUIREMENTS` = the `docs/specs/<date>_<slug>/SCOPE.md` path + the acceptance criteria verbatim ｜ `BASE_SHA` = `$anchor` ｜ `HEAD_SHA` = HEAD (the verbatim `git rev-parse HEAD`). **Prohibition: never hand the reviewer this session's history, your reasoning process or your self-check conclusions — it reviews the work product only, not your thinking.**

Also declare: this card only outputs a report and a suggested color; it does not modify any code; the go-ahead is decided by a human.

---

## ② Execution

The review proceeds in three phases by dependency topology; each phase runs all applicable dimensions and gives its own conclusion independently:
Phase 1 data layer and backend → Phase 2 frontend and interface integration → Phase 3 tests, configuration, scripts, documentation sync.
**When a phase has no diff coverage → the coverage map declares "no changes, skipped", which is not a violation** (a purely backend project having no phase 2 is normal).

**The only exit for crossing the boundary — a named-risk targeted check**: when you genuinely need to look at code outside the diff, you must first write down "the risk name + what I am going to check", then check it; one risk, one spot, and the report must state both the risk name and the conclusion for that spot; checking without being able to name the risk = scope creep = an invalid review. Cross-cutting changes (lock ordering, shared mutable state, function or interface contract changes) are legitimate named risks and go through this exit.

**Seven fixed dimensions (the review object = newly added** and modified** code; for deleted symbols, confirm zero residual references across the whole repository. Each phase runs the applicable ones and gives a conclusion item by item):**

1. **Integration and wiring**: does every newly added/modified symbol have a call site (file:line)? Is the route / dependency-injection registration in place? **With a UI, walk the three-layer chain against SCOPE's UI description — ① route/mount registration ② is the entry reachable (which existing screen can reach it? If you cannot name a concrete entry = broken) ③ do the interactive elements have handlers bound and linked to business logic. A break in any layer = P1 (core feature unusable), not P2** — "the feature is written but the user cannot get in" dies right here. For frontend-backend projects also check: do the request/response structures match the contract registered in registry/APIS.md (field names / nesting / types)?
   ❌ Counter-example: the page component and the API are both written, but the route table does not mount it → judge P2 "minor issue, next batch"
   ✅ Good example: walking the three-layer chain finds layer ① broken → judge P1, write "file:line + which layer is missing" in the report
   **SCOPE silence is not permission**: for inputs / environments / boundaries that appear inside the diff but are not written in SCOPE (null values, over-length input, not logged in, slow network, duplicate submission, unauthorized access), judge by "what would a reasonable user expect" — a reasonable expectation is a requirement; grade by its actual effect on the user, and never drop it because "SCOPE did not mention it".
2. **Logic**: null values / out-of-range / concurrent duplicate submission / failure paths (not an empty catch) / input validation, go through every newly added and modified function one by one; **do multi-step write operations (such as create + deduct) have a transaction boundary — either all succeed or all fail, a half-finished state is forbidden**; asynchronous races and idempotency of write interfaces (retry / duplicate submission must not produce dirty data); time zone and date boundaries, money precision (storing money as floats is forbidden).
3. **Ripple effects**: assign first, then search — `$sym = '新符号名'; Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $sym | Select-Object Path,LineNumber` finds all callers; **for a modified symbol, confirm each existing caller is behaviorally compatible (signature changed / default value changed / return structure changed → has the caller kept up)**; for a deleted symbol confirm zero residual references; check whether the **four documents** need syncing but have not been synced: registry/APIS.md (interfaces together with error codes), CHANGELOG.md, registry/DATA_DICT.md, docs/TECH_DEBT.md — **if any does not exist → N/A + reason** (silently skipping or inventing "already checked" is forbidden).
4. **Performance**: six typical kinds — N+1 queries / unbounded queries (missing LIMIT) / IO inside loops / repeated rendering of large lists / long synchronous tasks on the request path / WHERE without an index; **resource leaks — unclosed connections/files/timers/event subscriptions, frontend effects without cleanup**.
5. **Redundant dead code**: count the usage count of every newly added and modified symbol (use the same search result, do not run it twice); copy-pasted blocks with only the name changed; branches that are always true/false. A suspected retention must state the reason.
6. **Development standards**: naming consistency / comments say Why and not What / type safety (is there any `any`) / functions >50 lines and files >500 lines must be raised (>1000 always split; **test files are exempt up to ≤1000 lines**) / commit message format; and re-check the six items of constitution §11 "hard standards for code generation" one by one (structure / naming / Why comments / defense / testability / environment injection).
   ❌ Counter-example: the page state writes `PENDING` while the API returns `pending`, the two ends disagree on spelling, and the review writes "it runs, that is enough"
   ✅ Good example: judge P2 under "frontend and backend business terms use the same dictionary", and write in the report the two file:line spots + which spelling to standardize on
7. **Security**: are all new interfaces authenticated (hiding the frontend ≠ validating on the backend, check horizontal privilege escalation) / SQL parameterization / **XSS — is user input escaped before rendering; CSRF — do write operations have token / SameSite protection** / upload type and size validation / path traversal `../` protection / passwords use strong hashing (bcrypt/argon2/scrypt), MD5/SHA1/plaintext/hard-coded secrets are forbidden / log desensitization (passwords, phone numbers, tokens) / CORS not `*` / debug off / **check new dependencies for known vulnerabilities (npm audit / pip-audit output) and the lockfile has been committed**.

**Four conditional dimensions (enabled by trigger; write N/A + reason when not applicable, leaving them blank is not allowed):**
⑧ UI accessibility (when the frontend is involved): complete states / contrast / 44px touch targets / empty state and error state
⑨ External calls (when a third party is newly changed): adapter layer / explicit timeout / degradation / webhook signature verification + idempotency
⑩ Performance budget (when a hot path changes): if a budget file exists, compare against P95 / bundle size / query time; **if the project has no budget file → judge qualitatively by dimension 4's six kinds and mark "no budget baseline"**
⑪ Data privacy (when personal information is involved): D3/D4 field encryption / log desensitization / purpose limitation

**Error-code gate**: a new error code must be findable in `docs/registry/APIS.md` and already registered; give the `Select-String` search result.

**Out-of-bounds check (a violation is a red flag):**
- A **semantic** "while I was there / by the way" optimization appears in the diff (changing logic / renaming / refactoring unrelated code) → recommend reverting all of it
- **Purely mechanical formatting** (output of prettier/black and similar tools) → do not revert: state the tool it came from and recommend splitting it into a separate formatting commit (reverting it just makes lint demand it again — a dead loop)
- A file SCOPE never discussed appears → red flag, demand an explanation

**Replacement and deprecation check (a hit is a red light, judge the suggested color 🔴 directly; this card only reviews and does not fix, fixes go back to 4-1):** [disambiguated]
1. **Parallel implementation not deleted**: an old implementation that has been replaced but not deleted (old file / old function / old branch / old constant) appears in the files this batch touches, and `STATE.md`'s parallel-state register has no corresponding registration row → red light.
   The registration row format is fixed (column names not changed by one character): `并行态 | 旧实现 | 新实现 | 删除条件（可判定） | 到期 | 登记批次`.
   Even with a registration row, check two things: is the deletion condition decidable? Has the expiry batch already passed (passed and still not deleted → red light)?
   There are only three legitimate retention reasons: ① progressive delivery / rollback (with a deadline) ② external compatibility contract (with a deprecation period) ③ evidence retention — **the answer for evidence retention is git history**; a second evidence copy in the working tree (`.bak`, `旧版/`, `副本 2`) is a violation (inlined in this card: creating `xxx_v2.ts` in this batch while keeping the old `xxx.ts`, or leaving a `.bak` copy in the same batch, both count).
   ❌ Counter-example: create `xxx_v2.ts` and implement it again, keep the old `xxx.ts` around "just in case", the register has no row → judge P2 and let it pass
   ✅ Good example: old deleted in the same batch + registration row's deletion condition decidable + expiry batch not passed → write the closing evidence in the passing items
2. **Deprecation marker not declared**: the batch's **newly added lines** hit any of `_old\b|_legacy|_v2\b|Deprecated|暂时保留|废弃|TODO[:：]\s*(删|remove|delete)` (the body and the command use exactly the same regex; inconsistent strictness is not allowed) → the report must state the retention reason and (if any) the deletion condition, otherwise red light.

```powershell
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})').Matches[0].Groups[1].Value   # $anchor is read from the 「起点锚点」 field of STATE.md; typing it by hand is forbidden
git rev-parse --verify "$anchor^{commit}"; if ($LASTEXITCODE -ne 0) { throw "锚点无效：停下问用户——空输出 ≠ 0 命中" }
git diff -U0 "$anchor..HEAD" | Select-String '^\+' | Select-String '_old\b|_legacy|_v2\b|Deprecated|暂时保留|废弃|TODO[:：]\s*(删|remove|delete)'
```
(It covers every commit in the whole batch; `HEAD~1` only looking at the last commit would miss them. **Empty output is also evidence**: paste the command text together with its output into the receipt and the report, and state "the anchor assertion passed" — otherwise "0 hits" and "the command failed" cannot be told apart. Paste hit lines into the issue list one by one, each with a "declared / not declared" verdict.)

**Severity criteria (only these four levels; when unsure use P2):**

| Level | Meaning | Handling |
| :-- | :-- | :-- |
| P0 | crash / data loss / security vulnerability | must be zeroed, merging forbidden |
| P1 | core feature unusable (including broken wiring) | must be zeroed, merging forbidden |
| P2 | edge feature errors / poor experience | register in `docs/TECH_DEBT.md` (source = this report's number); keep the number reference in the report |
| P3 | spelling / style / non-critical hints | same as above; ledger registration may be deferred |

**Suggested-color matrix (the only basis for judging the color):**
- 🔴 Red = P0≥1 or P1≥1 (**including old reports' unclosed P0/P1**) or a "replacement and deprecation check" hit (missing register row / undeclared deprecation marker)
- 🟡 Amber = P0=P1=0 but P2/P3 exist or there is a trade-off awaiting the user's verdict
- 🟢 Green = P0=P1=0 and all old reports' P0/P1 are closed

**Prohibitions:**
- Modifying any code is forbidden (this card only reviews and does not fix; fixes go back to 4-1) [disambiguated]
- Giving a conclusion without evidence is forbidden (must be file:line + trigger condition)
- Skipping a dimension or a phase is forbidden (write N/A + reason when not applicable)
- Declaring a pass on your own is forbidden (only give the suggested color; the verdict belongs to the human)
- P3 must be listed too; "the issue is too small" is not a reason to omit it
- Downgrading "replaced but not deleted" to P2 and letting it pass is forbidden (it is a red light; there are only two roads: delete it or register it)
- Seeing a deprecation marker without giving a verdict is forbidden (every hit must be written as "declared (reason X) / not declared = red light")
- The reviewer spawning a subagent is forbidden (whether to review part of the diff or to get a second opinion) — the review seat exists only this once, and a conclusion from a subagent you spawned counts for nothing; during the review, touching the working tree / the index / HEAD / branch state is forbidden

---

## ③ Evidence receipt

The report is written to `docs/reviews/CODE_<date>_<slug>.md` (on re-review create a new file and reference the previous report's path in its header), in a fixed four-section format:
1. **Coverage map**: file × dimension tick table (✓ reviewed / — N/A + reason / ○ not reviewed + a reason is mandatory; including phase-skip declarations)
2. **Issue list**: sorted P0→P3, each with number (new R-01…; old issues keep their original numbers) / level / location (file:line) / description / impact (trigger condition) / fix suggestion
3. **Passing items**: ✅ pass per dimension (with coverage), leaving it blank is not allowed
4. **Conclusion**: the four-level counts (including old-issue closing results) + the suggested color per the "suggested-color matrix" + the replacement-and-deprecation check conclusion (number of parallel-state register rows / number of deprecation-marker hits / whether each was declared)

In the conversation, receipt: report path + four-level counts + suggested color + replacement-and-deprecation check conclusion + **the deprecation-scan command text and its full output (paste it even when the output is empty, and note that the anchor assertion passed)**.

---

## ④ State write-back

**Write back first, commit second** (the state write-back must precede the commit; reversing the order = STATE.md left uncommitted, and the 4-3 card's close-out ceremony will judge it red). Update STATE.md:
- `下一步` = 4-3 verification (suggested green) or back to 4-1 to fix (suggested red/amber, naming which item numbers to fix) [disambiguated]
- `未决问题` = P2-and-above trade-offs that need the user's verdict

After the write-back, the closing triple (the order cannot be changed: write back state → commit → re-run the close-out ceremony for a 0):

```powershell
$report = 'docs/reviews/CODE_2026-10-03_login.md'   # replace with this run's real report path
$color = '绿'   # suggested color: 红/黄/绿, filled in per the suggested-color matrix
git add $report STATE.md
git commit -m "4-2 docs(review): 建议色 $color + STATE 回写"
powershell -NoProfile -File check.ps1
```

The exit code must be 0; if it is 2 (`$STEPS` not configured, environment not initialized) or non-zero → stop and ask the user; declaring the review complete is forbidden.

**Re-review scope (when reviewing again after going back to 4-1 to fix)**: [disambiguated] the fix diff runs all seven dimensions + the replacement and deprecation check + every old issue closed item by item (fixed / not fixed / newly introduced) + every row of the parallel-state register re-checked (has the deletion condition been honored, has the expiry batch passed) — not just the few fixed lines.

**Six steps before acting on review comments**: ① read them through, change no code ② restate the requirement in your own words (if you cannot restate it = ask first) ③ check the facts in the code ④ judge whether it is technically correct for this project ⑤ confirm technically or rebut with reasons ⑥ fix and test item by item; **Prohibition: "you are right / good suggestion / thanks / fixing it right away" must never replace a technical response — feedback is technical input, not a social occasion**; **if a single item is unclear, stop as a whole** and clarify the unclear ones before touching anything — "fix only the items you understood" is forbidden (items may be interconnected; partial understanding = fixing it wrong).

In the conversation, receipt: the four-level counts + suggested color + the replacement-and-deprecation check conclusion; then write `下一步：4-3 验证（回复"继续"即执行）`.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
