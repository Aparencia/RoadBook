# Card 4-1 · Batch coding (mandatory for all tiers; batch-level notice + requirement-level gate)
> Trigger: after 2-2 requirement scope is confirmed by the user (tier L goes through 3-1 design first) ｜ Output: code + per-batch commits ｜ Next: 4-2 code review (tier S: after 4-1 is green go straight to 4-3 (skipping 4-2); tiers M/L: after 4-2 is green and the user gives the go-ahead, go to 4-3) [disambiguated]

---

## ① Start confirmation

After receiving the start instruction, first receipt the following nine items before doing anything:

1. **Restate the task and landing point**: which Must items of SCOPE this implementation covers (list them one by one); output = code + per-batch commits; next card = 4-2 code review (tier S: after 4-1 is green go straight to 4-3, skipping 4-2). [disambiguated]
2. **Assumptions list**: write "I assume X; if that is wrong then Y is void" for each item — anything findable in the project files must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete them if you can)**: ask only about things that cannot be found in SCOPE.md / STATE.md and that determine the direction of the implementation; if there is none at all, write "none".
4. **Start anchor declaration**: run `git rev-parse HEAD` and echo the hash verbatim (this hash line is the baseline for reviewing the diff and for rollback).
5. **Batching plan**: cut the Must items into batches, each batch ≤300 lines or 1 Must item; receipt the list. **Parallel decision (decided mechanically by task volume; improvising on the spot is forbidden)**: estimated total change ≥500 lines AND ≥2 mutually exclusive units can be cut along Files domains (**each unit ≥250 lines**) AND each unit has an independently verifiable criterion → propose a parallel dispatch plan (how many shards / each shard's Files / each shard's criteria) and wait for a one-shot confirmation from the user; if any one condition is not met → serial. **Arithmetic (show the numbers to the human)**: unit threshold × minimum unit count = 250 × 2 = 500 = the lower bound on total change 500 (with the old threshold of 150, 150 × 2 = 300 < 500, so two units could never reach the lower bound, which is why it was raised to 250).
6. **Paste the reference checklist verbatim** (paste this card's §② "five checks to recite every batch" + "condition-triggered pause list" word for word).
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

**Action 1: write code, advance batch by batch (parallel lanes in the appendix)**
- Each batch does only one batch from the plan.
- Landing rules: for where new files go, first check the "new code landing table" in `docs/ARCHITECTURE.md`; to create a new component/module, first check the three-part set in `docs/registry/` — **if a close equivalent already exists, reuse it; parallel creation is forbidden**.
  ❌ Counter-example: the old button component cannot be found → create `Button2.tsx`
  ✅ Good example: searching finds `PrimaryButton`, reuse it; if it really does not fit → write "why the existing component was not used" in the receipt and then create it
- **After the first batch lands**: replace check.ps1's `$STEPS` zero-dependency placeholder check with the real build/test command (the placeholder is placed during onboarding and must be replaced here; leaving it means the close-out ceremony validates document format only, not code).

**Five checks to recite every batch (after reciting them, write the results into this batch's notice)**: ① did you touch only the files SCOPE involves (`git status`, verified file by file) ｜ ② did you change anything outside SCOPE while you were at it (restore it if found; if you want it fixed, register it in `docs/TECH_DEBT.md`) ｜ ③ is there a "why an existing file could not be used" for every new file ｜ ④ did dependencies change (a changed lockfile must be explained separately; unrequested dependency upgrades are forbidden) ｜ ⑤ did you run into anything on the Won't Have list (if so, stop — that is out of scope).

**Action 2: commit each batch + progress notice**
**The first thing at the start of this batch**: `$prevBatch = git rev-parse HEAD` (= the previous batch's last commit; for the first batch it equals the start anchor) — action 3's "this batch's denominator" depends on it; forget to record it and the only option left is to fake the ledger.
Before committing: if this batch touches UI/tables/interfaces → **update the corresponding registry rows (COMPONENTS/DATA_DICT/APIS) on the spot, and commit them together with this batch**. Write-backs travel with the batch; saving them up until archive time and catching up from memory is forbidden.

```powershell
$batchFiles = @('src/a.ts','src/b.ts')   # replace with this batch's real file list; git add -A / git add . are forbidden
git add $batchFiles
$slug = 'checkout'; $what = '实现购物车结算接口'   # scope short name + what this batch did (one sentence)
git commit -m "4-1 feat($slug): $what"
```

After committing, send a one-line **progress notice** (batch number + a summary of the five-check results + the registry write-back status), then follow the pause rule declared above (tier S: one report at the end; tiers M/L: wait for the user to say "continue").

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
There are only three legitimate retention reasons (there is no fourth; everything else is deleted):
① **progressive delivery / rollback** — must carry a deadline (which batch, what condition expires it)
② **external compatibility contract** — must carry a deprecation period
③ **evidence retention** — the answer is git history; the working tree must not keep a second copy; `.bak`, `旧版/`, `副本 2` are the **single example source** (other cards do not repeat the examples)
❌ Counter-example: create `xxx_v2.ts` and implement it again, keeping the old `xxx.ts` around "just in case"
✅ Good example: delete the old one in the same batch + paste the deleted-line evidence in the receipt + no new rows in the parallel-state register

**Action 5: file registration and bloat (registering new files is not optional)**
Creating any file (including scripts/documents/tests) → must register `path + purpose + owning batch` in `docs/registry/COMPONENTS.md` within this batch, and commit it together with this batch.
The receipt must paste the summary line of `powershell -NoProfile -File orphans.ps1` (full format: `孤儿 X 项｜零引用导出 Y 项｜文档幽灵 Z 项｜反向幽灵 W 项｜未登记 V 项｜未跟踪 U 项｜读取失败 R 项｜文件数 N`; **when untracked U or read-failure R is non-zero the exit code is 1** — `git add` first and re-run; do not treat an "incomplete list" as orphans).
Red light: more than 20 new files in this batch → stop and merge them first, or explain why so many have to be split out (the explanation goes into this batch's notice).

**Condition-triggered pause list (if any item occurs, stop immediately and wait for the user; "finish this batch first and then deal with it" is forbidden)**: ① touching a red-line domain (authentication / payment / deleting data) ｜ ② the stop-and-ask rule triggers (the same error appears a second time) ｜ ③ cumulative changed lines > `预估改动行数` × 1.5 (`预估改动行数` is the field name in SCOPE, quoted verbatim; the quantified signal of scope creep) ｜ ④ a new dependency is needed or shared configuration must be modified ｜ ⑤ touching the Won't Have list (out of scope).

**Prohibitions (violating one = this batch is void)**: `git add -A` / `git add .` are forbidden; upgrading dependencies, changing global configuration, or touching the constitution (AGENTS.md) is forbidden; "incidental refactoring" is forbidden (see a problem elsewhere → register it in `docs/TECH_DEBT.md`, fixing it while you are there is not allowed); skipping a condition-triggered pause is forbidden ("I am almost done" is not a reason); landing a new implementation while leaving the replaced old implementation in the tree is forbidden (not registered in the parallel-state register = a violation); keeping a second evidence copy in the working tree is forbidden (the example is the single example source in action 4; the evidence lives in git history).

**Parallel lane appendix (it may only start after ① item 5's decision passes and the user confirms the dispatch):**
- Open a **git worktree** for each unit (its own directory and its own branch) and implement + commit there separately; **multiple units writing directly into the same working tree = forbidden** (to prevent stepping on each other; evaluated and not adopted)
- Shared files (registry / STATE / constitution / CHANGELOG) **are written only by the main agent** — if a unit finds it needs a shared-file change → stop and report to the main agent
- The main agent merges the unit branches in order; on a conflict → STOP and ask a human; after all merges, go through 4-2 (review everything at once)

---

## ③ Evidence receipt

Every batch notice contains: batch number / commit hash / a summary of the five-check results / the registry write-back status / the five net-increment numbers (files added · files deleted · lines added · lines deleted · net lines); after all batches (or the merge of parallel units) are done:
1. The full output of `git diff --stat $anchor..HEAD`
2. Cumulative lines vs `预估改动行数` (whether the ×1.5 trigger line was ever touched)
3. When parallel lanes were used: the list of unit branches + the merge order
4. The net-increment ledger summary table: one row per batch + a total row (all five numbers present; batches that modified existing code paste the command's real output, batches of purely new files write "this batch is purely additive")
5. The registration row for this batch's new files in `docs/registry/COMPONENTS.md` + the verbatim summary line of `powershell -NoProfile -File orphans.ps1`
6. All current rows of the parallel-state register (write "none" if there are none) + the list of old implementations deleted in this batch (file:line or function name)
7. The verbatim `git status --porcelain` after the close-out commit (must be empty)

---

## ④ State write-back

**Write back first, commit second** (the state write-back must precede the commit; reversing the order = STATE.md left uncommitted, and the next card's close-out ceremony will judge it red). Update STATE.md:
- `起点锚点` = the start hash (unchanged within this task; do not rewrite it)
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
