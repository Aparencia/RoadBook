# Card 4-1 · Batch coding (mandatory for all tiers; batch-level notice + requirement-level gate)
> Trigger: after 2-2 requirement scope is confirmed by the user (tier L goes through 3-1 design first) ｜ Output: code + per-batch commits ｜ Next: 4-2 code review (tier S: after 4-1 is green go straight to 4-3 (skipping 4-2); tiers M/L: after 4-2 is green and the user gives the go-ahead, go to 4-3) [disambiguated]

---

## ① Start confirmation

After receiving the start instruction, first receipt the following nine items before doing anything:

1. **Restate the task and landing point**: which Must items of SCOPE this implementation covers (list them one by one); output = code + per-batch commits; next card = 4-2 code review (tier S: after 4-1 is green go straight to 4-3, skipping 4-2). [disambiguated]
2. **Assumptions list**: write "I assume X; if that is wrong then Y is void" for each item — anything findable in the project files must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete them if you can)**: ask only about things that cannot be found in SCOPE.md / STATE.md and that determine the direction of the implementation; if there is none at all, write "none".
4. **Start anchor declaration**: run `git rev-parse HEAD` and echo the hash verbatim (this hash line is the baseline for reviewing the diff and for rollback).
5. **Batching plan**: cut the Must items into batches, each batch ≤300 lines or 1 Must item; receipt the list. **Batch interface contract**: each batch writes two lines — `Consumes: which batch's exact signatures this batch uses (function name / parameters / return type)` / `Produces: the function names, parameters and return types that later batches depend on`; if there is no shared interface between batches → write one line `no shared interface between batches`. **Cross-batch interface pre-check**: before starting work, produce one line of check result for every Consumes/Produces pair (consistent / conflict + verdict) and write it into this batch's notice or STATE.md; fix mismatches now and do not carry them into coding. **Dispatch granularity (before the parallel decision)**: several small same-shaped items (one one-line change in the same place / one constant replacement / one field completed across files) **are merged into a single dispatch**; multiple dispatches are forbidden — the criterion is these three questions, and only if any one is "yes" may it be dispatched separately: ① does it need its own judgment? ② does it need its own tests? ③ does it need its own independent review surface? All three "no" = merge into one. **Parallel decision (decided mechanically by task volume; improvising on the spot is forbidden)**: estimated total change ≥500 lines AND ≥2 mutually exclusive units can be cut along Files domains (**each unit ≥250 lines**) AND each unit has an independently verifiable criterion → propose a parallel dispatch plan (a fixed five-column table, one row per shard: `shard no. | Files (mutual-exclusion declaration) | root-cause domain (one sentence, and proof that it differs from the other shards' root cause) | independently verifiable criterion (how to verify it on its own) | expected output (how many lines, containing what)`; **if the root-cause-domain column cannot be filled in with a difference from the other shards → cutting shards is forbidden**; if the expected output is left empty → the dispatch is void) and wait for a one-shot confirmation from the user; if any one condition is not met → serial. **Arithmetic (show the numbers to the human)**: unit threshold × minimum unit count = 250 × 2 = 500 = the lower bound on total change 500 (with the old threshold of 150, 150 × 2 = 300 < 500, so two units could never reach the lower bound, which is why it was raised to 250).
6. **Paste the reference checklist verbatim** (paste this card's §② "six checks to recite every batch" + "condition-triggered pause list" word for word).
7. **Declare the generation standard**: every piece of generated code in this task is self-checked item by item against constitution §11 "hard standards for code generation" — structure (≤500 lines / **test files exempt up to ≤1000 lines** / pure logic separated from side effects / dependencies passed in explicitly), naming (business terms consistent / inputs and outputs have type contracts / `any` forbidden), comments say Why, defense (external calls have timeouts and failure branches / empty catch forbidden), core logic is pure functions, hard-coded configuration is forbidden.
8. **Baseline bookkeeping (the 0 point of the net-increment ledger)**: receipt three baseline numbers — the short hash from `git rev-parse --short HEAD`, the file count from `(git ls-files).Count`, and empty `git status --porcelain` output (working tree clean; `git diff --numstat` prints nothing for untracked new files, so it would misjudge). If the baseline is not clean → ask the user what to do first; opening the ledger on a dirty tree is forbidden.
9. **Lesson retrieval (JIT)**: assign first, `$kw = 'checkout'` (replace with the module or keyword this task touches), then run `Select-String -Path docs/lessons/*.md -Pattern $kw -List` (if that directory does not exist, declare "no historical lessons"); on a hit, receipt the card name + one line on the key point — these are the known minefields of this module, compare against them item by item while writing code.

Also declare the pause rule (execute this sentence; no improvising): **tier S: write the three batches in one go and report once (paste the three ledgers), then wait for the user to say "continue" before entering 4-3; tiers M/L: report after every batch and wait for the user to say "continue"; any item of the condition-triggered pause list fires → stop immediately and wait for a verdict**. (**Tier S is exempt from review**: after 4-1 is green go straight to 4-3, with the 4-3 guardrail as the fallback.)

---

## ② Execution

**Step 0 (skipping it is forbidden): record the start anchor**

```powershell
$anchor = git rev-parse HEAD
```

Write `$anchor`'s output into the `起点锚点` field of STATE.md. Losing it = 4-2 cannot review the diff and problems cannot be rolled back precisely.

**Action 0: the seven-rung ladder (run it after you understand the problem; it does not replace understanding)**
Before writing any new code, ask these rungs from top to bottom and stop at the first rung that satisfies you: ① does this thing need to exist at all (can we not do it)? ② does this repository already have something usable (search before you answer)? ③ can the standard library do it? ④ can a platform-native capability do it? ⑤ is it in a dependency already installed? ⑥ can it be written in one line? ⑦ what does the minimal implementation look like (cut everything that can be cut)?
❌ Counter-example: pulling in a new dependency for a 3-line feature (skips ② and ⑤)
✅ Good example: first `Select-String` for a same-named or near-named implementation in this repository and reuse it if it hits; if there really is none → write in the receipt "the seven-rung ladder stopped at rung ③ (the standard library has no such capability) + the reason"
**Understand first, then run the ladder**: the ladder is a ruler against over-engineering, not an excuse to skip reading the code — if you do not understand the problem and cut with the ladder, what you cut is correctness.

**Action 1: write code, advance batch by batch (parallel lanes in the appendix)**
- Each batch does only one batch from the plan.
- Landing rules: for where new files go, first check the "new code landing table" in `docs/ARCHITECTURE.md`; to create a new component/module, first check the three-part set in `docs/registry/` — **if a close equivalent already exists, reuse it; parallel creation is forbidden**.
  ❌ Counter-example: the old button component cannot be found → create `Button2.tsx`
  ✅ Good example: searching finds `PrimaryButton`, reuse it; if it really does not fit → write "why the existing component was not used" in the receipt and then create it
- **TDD red first (tiers M/L)**: the first test for a new feature must first run red — `<test command> <file>` outputs a failure, and the failure reason = that behavior does not exist yet; a test that is green on its first run = what you tested is existing behavior, so change the test, not the code; write the implementation only after it is green.
  ❌ Counter-example: write `retryOperation()` first and add the test afterwards → it passes immediately, which equals no test at all
  ✅ Good example: write `expect(attempts).toBe(3)` first → red (`retryOperation is not defined`) → then write the implementation → green
- **After the first batch lands**: replace check.ps1's `$STEPS` zero-dependency placeholder check with the real build/test command (the placeholder is placed during onboarding and must be replaced here; leaving it means the close-out ceremony validates document format only, not code).
- **Leave markers on compromise points (S6)**: for any "do it this way for now, revisit later" simplification, leave two lines in place — `ceiling:` (the upper bound this version can reach) and `upgrade:` (what to switch to, under what condition); **if there is no trigger condition, mark it `no-trigger`** (a compromise point with no trigger condition rots silently first). Collect the ledger with one line: `Select-String -Path <files in this batch> -Pattern 'ceiling:|upgrade:|no-trigger'`, then copy the line `<N> markers, <M> with no trigger.` verbatim at the end of the receipt; when `M > 0`, explain item by item why no trigger condition was given.

**Six checks to recite every batch (after reciting them, write the results into this batch's notice)**: ① did you touch only the files SCOPE involves (`git status`, verified file by file) ｜ ② did you change anything outside SCOPE while you were at it (restore it if found; if you want it fixed, register it in `docs/TECH_DEBT.md`) ｜ ③ is there a "why an existing file could not be used" for every new file ｜ ④ did dependencies change (a changed lockfile must be explained separately; unrequested dependency upgrades are forbidden) ｜ ⑤ did you run into anything on the Won't Have list (if so, stop — that is out of scope) ｜ ⑥ has an `Expected:` line been written first for every command this batch will run (when the real output disagrees with Expected, attribute the cause first: a code error → go back to 6-2 root cause analysis; a plan error → follow the "verdict trail" and continue — **changing the output to make it pass is forbidden**).

**Action 2: commit each batch + progress notice**
**The first thing at the start of this batch**: `$prevBatch = git rev-parse HEAD` (= the previous batch's last commit; for the first batch it equals the start anchor) — action 3's "this batch's denominator" depends on it; forget to record it and the only option left is to fake the ledger.
Before committing: if this batch touches UI/tables/interfaces → **update the corresponding registry rows (COMPONENTS/DATA_DICT/APIS) on the spot, and commit them together with this batch**. Write-backs travel with the batch; saving them up until archive time and catching up from memory is forbidden.

```powershell
$batchFiles = @('src/a.ts','src/b.ts')   # replace with this batch's real file list; git add -A / git add . are forbidden
git add $batchFiles
$slug = 'checkout'; $what = '实现购物车结算接口'   # scope short name + what this batch did (one sentence)
git commit -m "4-1 feat($slug): $what"
```

After committing, send a one-line **progress notice** (batch number + a summary of the six-check results + the registry write-back status), then follow the pause rule declared above (tier S: one report at the end; tiers M/L: wait for the user to say "continue").

**Batch completion line (fixed format; write the verbatim text into the notice and `STATE.md`)**: `本批 N：complete（提交 <prevBatch 短哈希7>..<HEAD 短哈希7>，测试：<命令原文> → <输出末行>）`; **if the test/build command was not run or did not pass → do not write the word "complete", write only "not complete + where it is stuck"**.

**Commit message format (uniform across the whole repository)**: `<卡号> <type>(<scope>): <摘要>` — type ∈ feat/fix/docs/chore/style/refactor/test; the card number lets 5-1 trace batches back by commit (in `git log --oneline`, the entries starting with `4-1 ` are this task's batch list). [disambiguated]

Before and after committing, run the **mechanical gate** (a zero-token check that replaces manually verifying checks ① and ④ item by item):

```powershell
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})').Matches[0].Groups[1].Value   # $anchor is read from the 「起点锚点」 field of STATE.md; typing it by hand is forbidden
git rev-parse --verify "$anchor^{commit}"; if ($LASTEXITCODE -ne 0) { throw "锚点无效：停下问用户（禁止硬跑）" }
$scopeFiles = @('src/a.ts','src/b.ts')   # replace with the SCOPE file list
powershell -NoProfile -File gate.ps1 -Anchor $anchor -ScopeFiles ($scopeFiles -join ',') -RepoRoot .
```

Red (exit 1) → stop and fix (**an over-limit line count and a lockfile change are also red**); amber (renamed entries, empty change list) → relay it to the user with the notice, still exit 0.

**Action 3: net-increment ledger (computed on the spot after each batch commit; saving it up until close-out and reconstructing from memory is forbidden)**
Report five numbers at once: **files added / files deleted / lines added / lines deleted / net lines** (net lines = lines added − lines deleted), and paste the command's real output. **The two lines have different purposes and their denominators must never be mixed**: the **this-batch line** (denominator = the previous batch's last commit) judges "this batch modified existing code but deleted nothing"; the **task-cumulative line** (denominator = the start anchor) judges whether the whole requirement has touched the scope-creep trigger line.

```powershell
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})').Matches[0].Groups[1].Value
git rev-parse --verify "$anchor^{commit}"; if ($LASTEXITCODE -ne 0) { throw "起点锚点无效：停下问用户" }
$prev = 'a1b2c3d'   # paste the real value of $prevBatch from the start of this batch (first batch = $anchor); do not copy the example
git rev-parse --verify "$prev^{commit}"; if ($LASTEXITCODE -ne 0) { throw "上一批末提交无效：停下问用户" }
$s = git diff --numstat "$prev..HEAD" -- .; if (@($s).Count -eq 0) { throw "本批 numstat 空输出：核对 $prev..HEAD，禁止当成新增 0 行" }
$a=0;$d=0;$f=0;$b=0; foreach ($l in $s) { $p = $l -split "`t"; if ($p[0] -eq '-') { $b++; continue }; $a += [int]$p[0]; $d += [int]$p[1]; $f++ }
"本批 $prev..HEAD ｜文件 $f（二进制 $b）｜新增 $a 行｜删除 $d 行｜净 $($a-$d) 行"
if ($d -eq 0 -and $a -gt 50) { "红灯：改存量批次删除行 = 0（停下补删再提交）" }
$ns = git diff --name-status "$prev..HEAD" -- .; "本批新增文件 $(@($ns | Where-Object { $_ -like 'A*' }).Count)｜删除文件 $(@($ns | Where-Object { $_ -like 'D*' }).Count)"
$c = git diff --numstat "$anchor..HEAD" -- .; if (@($c).Count -eq 0) { throw "累计 numstat 空输出：停下问用户" }
$ca=0;$cd=0; foreach ($l in $c) { $p = $l -split "`t"; if ($p[0] -eq '-') { continue }; $ca += [int]$p[0]; $cd += [int]$p[1] }
"任务累计 $anchor..HEAD ｜新增 $ca 行｜删除 $cd 行｜净 $($ca-$cd) 行（范围蔓延触发线对照用）"
```

Red-light criteria (inlined; explanatory exemptions are forbidden): **this-batch line "lines deleted = 0 and lines added > 50" → red light**, stop and add the deletions before committing; batches of purely new files are exempt, but the receipt must say "this batch is purely additive". `$prev..HEAD` covers every commit in this batch; looking only at `HEAD~1` misses the earlier commits of this batch, which equals faking the ledger.

**Action 4: replacement means deletion + the parallel-state register**
The rule in one sentence: **the batch in which the new implementation lands must delete the replaced old implementation** (old file / old function / old branch / old constant all go together).
If that cannot be done (progressive delivery / rollback / compatibility contract) → it must be registered in the "parallel-state register" of `STATE.md`, with fixed columns:
`并行态 | 旧实现 | 新实现 | 删除条件（可判定） | 到期 | 登记批次`
There are only three legitimate retention reasons (there is no fourth; everything else is deleted), and **each one must carry an `owner` (who is responsible for clearing it) and an `expiry date` (90 days by default, written as a real date, never "later")**:
① **progressive delivery / rollback** — must carry a deadline (which batch, what condition expires it)
② **external compatibility contract** — must carry a deprecation period
③ **evidence retention** — the answer is git history; the working tree must not keep a second copy; `.bak`, `旧版/`, `副本 2` are the **single example source** (other cards do not repeat the examples)
**An ownerless exception = the rule has been deleted by fact**: a retention reason with no owner or no expiry date counts as no reason at all and is deleted.
❌ Counter-example: create `xxx_v2.ts` and implement it again, keeping the old `xxx.ts` around "just in case"
✅ Good example: delete the old one in the same batch + paste the deleted-line evidence in the receipt + no new rows in the parallel-state register

**Action 5: file registration and bloat (registering new files is not optional)**
Creating any file (including scripts/documents/tests) → must register `path + purpose + owning batch` in `docs/registry/COMPONENTS.md` within this batch, and commit it together with this batch.
The receipt must paste the summary line of `powershell -NoProfile -File orphans.ps1` (full format: `孤儿 X 项｜零引用导出 Y 项｜文档幽灵 Z 项｜反向幽灵 W 项｜未登记 V 项｜未跟踪 U 项｜读取失败 R 项｜文件数 N`; **when untracked U or read-failure R is non-zero the exit code is 1** — `git add` first and re-run; do not treat an "incomplete list" as orphans).
Red light: more than 20 new files in this batch → stop and merge them first, or explain why so many have to be split out (the explanation goes into this batch's notice).

**Action 6: batches come from the task graph's "ready frontier"**
Batches are not cut by file order; they come from the task graph's **ready frontier**: before each batch starts, write two lines into this batch's notice — `what this batch depends on: the batch number or "none"` / `what depends on this batch: the batch number or "none"`; a batch whose dependencies are unfinished must not start, and this criterion is used together with item 5's parallel decision (only mutually exclusive batches on the frontier qualify as parallel; see the appendix).
❌ Counter-example: batch 2 needs an identifier that only batch 3 produces → write batch 2 first and guess the interface
✅ Good example: batch 2 depends only on an identifier already merged from batch 1 → start it, and the notice says "what this batch depends on: batch 1"

**Action 7: merge discipline (fast-forward)**
Every time a shard is finished on a branch, first merge the integration branch's tip into this branch before closing out (`$base = 'main'` then `git merge $base`; change the integration branch name to the project's real one); the integrating side uses only `git merge --ff-only` — this guarantees later integration is a **fast-forward** that produces no meaningless merge commit; when a fast-forward is impossible = this branch is behind, so merge the tip in first and then close out.
❌ Counter-example: the branch sits for three days without merging the tip, integration hits a pile of unrelated conflicts, and the only way out is a "Merge branch 'main'" commit
✅ Good example: before each shard closes out, `git merge $base` keeps up with the integration branch, and integration runs `git merge --ff-only` straight through, leaving history a single line

**Action 8: after a bulk mechanical rewrite, run the full gate**
For batches that are "only mechanical changes" — renames, card-number changes, bulk wording replacement, i18n sweeps — the close-out must run the **full gate command** (`powershell -NoProfile -File check.ps1`, or the gate's full mode), not just the few assertions covering the changed files: a mechanical sweep is what most easily and silently breaks strings other people depend on.
❌ Counter-example: replaced wording across the whole repository but ran only the tests of the two files that changed → an assertion elsewhere that depends on that string is already red and nobody knows
✅ Good example: a mechanical-rewrite batch closes out by pasting the full output of `powershell -NoProfile -File check.ps1` + exit code 0

**Condition-triggered pause list (if any item occurs, stop immediately and wait for the user; "finish this batch first and then deal with it" is forbidden)**: ① touching a red-line domain (authentication / payment / deleting data) ｜ ② the stop-and-ask rule triggers (the same error appears a second time) ｜ ③ cumulative changed lines > `预估改动行数` × 1.5 (`预估改动行数` is the field name in SCOPE, quoted verbatim; the quantified signal of scope creep) ｜ ④ a new dependency is needed or shared configuration must be modified ｜ ⑤ touching the Won't Have list (out of scope). **Verdict trail (every verdict you made instead of stopping to ask gets one line)**: fixed format `Verdict: [what you decided] — [why] — [what it costs if wrong]`; it goes into this batch's notice and into the unresolved-questions field of `STATE.md`; if the cost is half a day or more of rework, call it out in the receipt so the user can review it. Purely mechanical actions (renames / formatting) are not recorded; one verdict stays within 1 line.

**Prohibitions (violating one = this batch is void)**: `git add -A` / `git add .` are forbidden; upgrading dependencies, changing global configuration, or touching the constitution (AGENTS.md) is forbidden; "incidental refactoring" is forbidden (see a problem elsewhere → register it in `docs/TECH_DEBT.md`, fixing it while you are there is not allowed); skipping a condition-triggered pause is forbidden ("I am almost done" is not a reason); landing a new implementation while leaving the replaced old implementation in the tree is forbidden (not registered in the parallel-state register = a violation); keeping a second evidence copy in the working tree is forbidden (the example is the single example source in action 4; the evidence lives in git history); writing the implementation first and adding the test afterwards is forbidden — a test added afterwards is immediately all green and proves nothing; "keeping it as a reference" also counts as a violation: an implementation already written must be discarded (uncommitted artifacts), and what was discarded must be declared in STATE.md.

**Parallel lane appendix (it may only start after ① item 5's decision passes and the user confirms the dispatch):**
- **Judge relatedness first, then the file domain**: even when two shards' Files do not overlap at all, if they **share the same contract** (one shard changes the callee, the other changes the caller), **share the same observable behavior** (the same acceptance criterion), or **have the same root cause**, cutting them into two shards is forbidden — merge them into one unit. The one-sentence criterion: "if one shard is fixed, will the other shard's problem disappear by itself?" Yes → merge.
- **If you do not yet know how to change it, parallel lanes must not start**: parallel lanes open only when "every shard already knows what to change"; being in the "first find out where it is broken" stage → serial, or do root cause analysis per the 6-2 card first.
- Open a **git worktree** for each unit (its own directory and its own branch) and implement + commit there separately; **multiple units writing directly into the same working tree = forbidden** (to prevent stepping on each other; evaluated and not adopted)
- Before opening a unit workspace, run two probe commands first and paste the verbatim output into the start receipt: `git rev-parse --git-dir` and `git rev-parse --git-common-dir` — the two outputs are **different**, and `git rev-parse --show-superproject-working-tree` **prints nothing** = you are already inside an isolated workspace → **opening another layer is forbidden**, do the work in the existing workspace; the two outputs are identical = an ordinary repository, opening is allowed.
- Before opening, run `git check-ignore -q .worktrees` (**no output = not ignored**) → when it is not ignored, first write `.worktrees/` into `.gitignore` and make **a separate commit**, then open the workspace. Paste the real output of `git check-ignore -v .worktrees` in the receipt. Reason, fixed: opening without ignoring = the whole working tree will get committed into the repository.
- Shared files (registry / STATE / constitution / CHANGELOG) **are written only by the main agent** — if a unit finds it needs a shared-file change → stop and report to the main agent
- The main agent merges the unit branches in order; on a conflict → STOP and ask a human; **after merging, first do the four-step return verification**: ① read each unit's receipt one by one (do not read a summary) ② check whether two shards touched the same file ③ run the full guardrail once ④ **spot-check the diff** — subagents make systematic errors (the same error model repeats in every shard), and "all green" does not replace a human opening the diff. Only after these four steps go through 4-2 (review everything at once).
- Before merging, confirm the base branch first: paste the output of `git log --oneline <base branch>..<unit branch>` and ask "this unit branch was branched off <base branch>, right?" — **merging into the wrong base branch is very expensive to undo**; merging is forbidden until confirmation is obtained.
- Every time a unit branch is merged, **re-run the full test suite on the merge result** (single command standard: `AGENTS.md` §10 and `$STEPS` at the top of `check.ps1`), pasting the command verbatim + the complete output. If it does not pass → stop, keep the unit branch and the workspace untouched and investigate in place (nothing has been pushed yet; the merge is local and reversible); only on a pass continue merging the next one. **"Green" only proves the one tree it ran on — an earlier green light in this session does not count.**
- How concurrency actually happens: parallel shards must be **dispatched all at once in the same instruction** (one shard per instruction = serial). Once dispatched, wait for the receipts; do not poll, do not chase.
- **A dispatch carries exactly two things: ARTIFACT + CONTRACT (A4)** — the artifact (file paths / the current text) and the contract (interface signatures / criterion text / expected output). **CLAIMs and reasoning are forbidden in a dispatch**: "I think…", "my own self-check conclusion", the session history, and how you located the problem must all stay out — hand over a conclusion and the reviewer only reviews your conclusion. When you want a second opinion the question template is fixed: `Find what is wrong. Do NOT validate.` ("please confirm this is fine" — a question that fishes for agreement — is forbidden); require the receipt to be written as "N problems found + an evidence line number for each"; if it can find no problem it must write "none found", not "looks fine".

---

## ③ Evidence receipt

Every batch notice contains: batch number / the batch completion line (fixed format, verbatim) / commit hash / a summary of the six-check results / the registry write-back status / the five net-increment numbers (files added · files deleted · lines added · lines deleted · net lines) / the verdict-trail line (verbatim if there is one, otherwise "none"); after all batches (or the merge of parallel units) are done:
1. The full output of `git diff --stat $anchor..HEAD`
2. Cumulative lines vs `预估改动行数` (whether the ×1.5 trigger line was ever touched)
3. When parallel lanes were used: the list of unit branches + the merge order; the **first piece of evidence after each unit branch is created = the baseline test pass count** (command verbatim + the `N tests, 0 failures` output); if the baseline does not pass → report the failure and ask the user whether to continue; starting work on a dirty baseline is forbidden.
4. The net-increment ledger summary table: one row per batch + a total row (all five numbers present; batches that modified existing code paste the command's real output, batches of purely new files write "this batch is purely additive")
5. The registration row for this batch's new files in `docs/registry/COMPONENTS.md` + the verbatim summary line of `powershell -NoProfile -File orphans.ps1`
6. All current rows of the parallel-state register (write "none" if there are none) + the list of old implementations deleted in this batch (file:line or function name)
7. The verbatim `git status --porcelain` after the close-out commit (must be empty)
8. Two fixed slots that may be neither left blank nor waved away with "none": **what you deliberately did not touch** (adjacent items still inside scope that this batch explicitly leaves alone — for each, write "why not now") / **residual concerns** (places you are still uneasy about after the fix — write the trigger condition and what to watch). If both are genuinely empty, write "none" and give one reason for each.

---

## ④ State write-back

**Write back first, commit second** (the state write-back must precede the commit; reversing the order = STATE.md left uncommitted, and the next card's close-out ceremony will judge it red). Update STATE.md:
- `起点锚点` = the start hash (unchanged within this task; do not rewrite it); **the resume ledger depends on it, not on recollection** — at every batch close-out append one line to `最近完成`: "batch no. | this batch's last commit hash | what it did"; when the session is compacted, handed over, or the user says "continue", first read `起点锚点` and `最近完成`, then reconcile with `git log --oneline` from the start anchor to HEAD — **if the two disagree, git log wins and you fix the ledger on the spot** (resuming from memory = redoing finished batches)
- `文件数基线` = **set only once, at first initialization** (= the onboarding baseline written at the close-out of the 1-2 / 1-3 cards); from this card on, **rewriting the baseline is forbidden in every batch**
- `当前文件数` = `(git ls-files).Count` at this batch's close-out (**update only this one each batch**); the bloat criterion = `当前文件数` − `文件数基线` > 20 → red light, first ask the user whether to split the batch or move to the 7-3 card P batch cleanup. If STATE.md has no `当前文件数` field → add the field first, then update
- `工作树状态` = the result of `git status --short` at this batch's close-out (it must be "clean"; not clean = there are still changes that have not landed in history)
- `下一步` = 4-2 code review — **tier S: after 4-1 is green go straight to 4-3 (skipping 4-2); tiers M/L: after 4-2 is green and the user gives the go-ahead, go to 4-3**; if this task touches authentication/payment/deleting data → forced upgrade to M, still go through 4-2; on an upgrade write the new tier into `档位` (otherwise leave it unchanged) — 4-3 / 6-4 read the tier from this field. [disambiguated]
- `未决问题` = things discovered during coding that need a decision from the user (list them if any)

After the write-back, the closing triple (the order cannot be changed: write back state → commit → re-run the close-out ceremony for a 0):

```powershell
git add STATE.md
git commit -m "4-1 docs(state): 分批编码收尾——基线未动，当前文件数已更新"
powershell -NoProfile -File check.ps1
```

The exit code must be 0; if it is 2 (`$STEPS` not configured) or non-zero → stop and ask the user; declaring coding complete is forbidden.

Fixed closing line (the receipt's last line first states "Coding complete, N batches in total (of which M are parallel units)", then this sentence):
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
