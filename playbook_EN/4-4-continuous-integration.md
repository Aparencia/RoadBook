# Card 4-4 · Continuous integration (run additionally when CI is first set up or the gate is changed)
> Trigger: first CI setup, or a change to check.ps1 / the workflow ｜ Output: `.github/workflows/ci.yml` (or an equivalent) + one line in `docs/RUNBOOK.md` ｜ Next: awaiting a new intent (incident → 6-1 incident response; periodic restore drill → 5-5 backup and restore drill)
> Process area: IMP, QA

---

## ① Start confirmation

After receiving the start instruction, first return the following five items before doing anything:

1. **Restate the task and its landing point**: is this the first CI setup or a gate change? (read `当前任务` in `STATE.md`, one sentence); output = the CI workflow file + the CI line in `docs/RUNBOOK.md`; next card = awaiting a new intent.
2. **Assumptions**: write down, one per line, "I assume X; if wrong, Y becomes invalid" — anything findable in `check.ps1` and `docs/RUNBOOK.md` must not be written as an assumption.
3. **Clarifying questions (≤5, drop whatever can be dropped)**: three defaults — where is it hosted (GitHub Actions / something else / no hosted CI)? which OS and which shell does it run on? who is the first owner of a CI failure (write it into RUNBOOK)? Anything findable in `check.ps1` and `docs/RUNBOOK.md` must not be asked.
4. **Quote the checklist verbatim** (paste, word for word, the "single-mirror iron rule + minimal pipeline + five prohibitions" of §② of this card).
5. And declare: the actual command list of `check.ps1` (one per line, serving as the comparison baseline); whether hosted CI is introduced this time.

---

## ② Execution

**Single-mirror iron rule (this card's first criterion): what runs in CI must be exactly the same commands as `check.ps1` — one step fewer = something is never checked; one step more = CI green while local is red; a changed parameter = the two sides are not judging the same thing. All three are called mirror drift, and drift = the gate is forever false green (worse than no CI: you think it is guarding).**

**Action 1: Copy out the local mirror (the comparison baseline; do this step before anything else)**
```powershell
$steps = [regex]::Match((Get-Content check.ps1 -Raw), '(?m)^\s*\$STEPS\s*=\s*@\(([^)]*)\)').Groups[1].Value
$steps -split ',' | ForEach-Object { $_.Trim().Trim("'") } | Where-Object { $_ }
```
An empty `$steps` = check.ps1 has not yet been wired to this project's commands per card 1-2 (do not guess the mirror; go back to 1-2); when it is non-empty, copy every line verbatim into the receipt to form the "local mirror list".
- ❌ Counter-example (measured on this machine): the line-start command grab `Select-String -Pattern '^\s*(npm|pnpm|yarn|...)'` → prints **0 lines** — in a real check.ps1 the commands live inside `$STEPS = @('…')`, so the line starts with `$STEPS`; those 0 lines get read as "this project has no local mirror" → the whole mirror comparison idles and drift goes unnoticed
- ✅ Good example (measured on this machine): for a check.ps1 with `$STEPS = @('pnpm typecheck', 'pnpm lint', 'pnpm test')` the two lines above print exactly three lines — `pnpm typecheck` / `pnpm lint` / `pnpm test`; copied into the receipt one by one, the CI `run:` lines are exactly those three

**Action 2: Get it passing locally first (skipping this is prohibited)**
```powershell
powershell -NoProfile -File check.ps1
```
The exit code must be 0. **Going to CI while local does not pass = going to CI to watch red, burning time for nothing**; if the exit code is not 0, fix local first.

**Action 3: Minimal pipeline (only these four steps; every extra step needs a written reason)**

| # | Step | Criterion |
| :-: | :--- | :--- |
| 1 | Install dependencies | install from the lockfile (`npm ci` / `pnpm install --frozen-lockfile`); upgrading dependencies inside CI is prohibited |
| 2 | typecheck / lint / test / build | **matches the list copied out in §Action 1 line by line** (one line fewer = drift) |
| 3 | Artifact archiving | upload the output directory + the test report as build artifacts (so red runs can be downloaded and inspected) |
| 4 | Trigger and notification | trigger = push to the main branch + PR; a failure notifies the owner (written into one line of `docs/RUNBOOK.md`) |

**Action 4: Write the workflow**
Output path `.github/workflows/ci.yml` (another hosting platform = an equivalent file; write its path into `docs/RUNBOOK.md`).
Fixed workflow skeleton (fill the values with the project's reality; every step's command comes from the Action 1 list):

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```
(Hook the output directory of the last `build` step into `actions/upload-artifact` for archiving; if `check.ps1` runs other commands as well, add them from the Action 1 list.)

**Action 5: Mirror comparison (machine check, not an eyeball impression)**
```powershell
if (Test-Path '.github/workflows/ci.yml') { Select-String -Path .github/workflows/ci.yml -Pattern 'run:' | ForEach-Object { $_.Line.Trim() } } else { Write-Host '本地-only：无 CI 文件，口径对照 N/A（理由已按动作 6 写进 RUNBOOK）' }
```
Align the "local mirror list" you copied out against this output **line by line**: one line more / one line fewer / a different parameter → fix it on the spot until they agree. Paste the comparison result into the §③ receipt; on the local-only branch → write `N/A（本地-only）` in all three columns of the comparison table + attach the verbatim RUNBOOK line from Action 6.

**Action 6: RUNBOOK registration (write it for both outcomes; silence is not allowed)**
- Hosted CI introduced → write three lines in `docs/RUNBOOK.md`: CI file path / trigger conditions / who gets failure notifications.
- Not introduced (local-only) → write one explicit line in `docs/RUNBOOK.md`, with the reason replaced by the real reason: `CI：本地-only（已裁剪）＋理由：单人项目、尚无远端仓库，改由每次提交前手跑 check.ps1 兜底` ("CI: local-only (trimmed) + reason: solo project, no remote repository yet, covered by manually running check.ps1 before every commit"). **Not writing it = silent omission, and this card fails.**

**Action 7: three CI checks + two release-surface checks (run them item by item before committing the workflow; any red = committing is forbidden)**
- ① Every third-party action must be pinned to a **commit SHA**: ❌ `uses: actions/checkout@v4` / `uses: actions/checkout@main` (a tag can be moved upstream: measured, `refs/tags/v4` already points at the commit of v4.4.0, which hands execution authority to someone else) ｜ ✅ `uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (the 40-character commit SHA of v4.2.2); the `@v4` in the Action 4 skeleton is the to-be-replaced form — get a SHA with `git ls-remote https://github.com/actions/checkout refs/tags/v4.2.2`
- ② Keep the workflow `permissions:` minimal: default `contents: read`; ❌ omitting `permissions:` (which takes the repository's maximum default) / ❌ `permissions: write-all` ｜ ✅ declare `permissions: contents: read` at the top level and raise it only inside the one job that truly needs to write
- ③ Running untrusted code inside a PR / issue-triggered workflow is forbidden: ❌ one file combining `on: pull_request_target` + a reference to `secrets.` + checking out the PR code (`ref: ${{ github.event.pull_request.head.sha }}`) = red (code from a fork runs with your secrets) ｜ ✅ use `on: pull_request` (which gets no secrets), or use `pull_request_target` for read-only labelling only, without checking out PR code and without referencing secrets
- ④ Secret scanning **blocks only what is newly added (baseline diff)**: existing secrets stay in history untouched this round, and **anything newly added is red** — look only at the lines this change introduces, not at the whole history. ❌ a full scan that reports hundreds of historical hits and is waved through as a batch (the newly added one drowns among them, which equals not scanning at all) ｜ ✅ pass only when the diff has 0 hits; on a hit → stop, void the work and rotate the credential (deleting the file does not count as handling it)
- ⑤ Build-context smuggling: the publish/image manifest (`.dockerignore` / `.npmignore` / the `files` field of `package.json`) must exclude `.env`, credential files (`*.pem` / `*.key` / `credentials.json`) and test fixtures — once a package or image is published it can be downloaded forever. ❌ treating `.gitignore` as if it also cleaned the publish manifest (npm and docker each have their own manifest and neither inherits the other) ｜ ✅ the publish manifest has zero hits for `.env` / `.pem` / `fixtures`, and `.dockerignore` carries the corresponding exclusion lines
```powershell
Select-String -Path .github/workflows/*.yml -Pattern 'uses:\s+\S+@(?![0-9a-f]{40})'                      # (1) a hit = an action not pinned to a 40-char SHA
Select-String -Path .github/workflows/*.yml -Pattern 'permissions:'                                      # (2) no output = permissions not declared, red
Select-String -Path .github/workflows/*.yml -Pattern 'pull_request_target|head\.sha|secrets\.'           # (3) all three in the same file = red
$anchor = (Select-String -Path STATE.md -Pattern '起点锚点\s*[:：]\s*([0-9a-fA-F]{7,40})').Matches[0].Groups[1].Value; git diff "$anchor..HEAD" | Select-String -Pattern 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|BEGIN [A-Z ]*PRIVATE KEY'   # (4) scans only what was added; 0 hits required
npm pack --dry-run 2>&1 | Select-String -Pattern '\.env|\.pem|\.key|\.p12|credentials|fixtures|__tests__'  # (5) a hit = the published package smuggles files, red
```

**Prohibitions (violating any one = this round's output is void):**
- `continue-on-error: true` is prohibited, `|| true` is prohibited, and marking any check step as "allowed to fail" is prohibited (= red does not block, which equals not running at all)
- "Run one extra step in CI just to be safe" and "this step can just run locally" are prohibited — the commands on both sides must match line by line
- Caching and parallelism changing the criteria is prohibited: caching may only save time (its key must include the lockfile hash), parallelism may only save time (sharding must guarantee every command still runs); **a skipped check = drift**
- Writing secrets into the workflow file is prohibited; secrets go only into CI secrets (key names aligned with `.env.example`), and the workflow references variable names only
- Skipping "get it passing locally first" and opening a PR directly is prohibited (local red = CI will be red)

**Boundary (no overlap with the 5-2 release pipeline)**: this card governs **post-commit verification** (one thing: can the code pass the gate); 5-2 release governs **producing artifacts and going live** (version, tag, deploy, rollback). CI passing ≠ ready to release.

---

## ③ Evidence receipt

Give these one by one (only three kinds of evidence count: real command output / file paths / commit hashes):

1. **Local mirror list** (the verbatim real output of Action 1)
2. **Local rehearsal**: the complete `check.ps1` output + exit code 0
3. **Mirror comparison table**: the line-by-line alignment of the local mirror list vs the CI `run:` list (write "none" for all three of: more / fewer / different parameter)
4. CI file path + the conclusion of its first run (run it once if a remote exists; if there is no remote, write "not hosted, registered as local-only")
5. Artifact archiving list (which paths/files were uploaded); local-only has no upload channel → write "not uploaded, kept locally in `dist/` instead", and state it even when nothing is kept
6. The verbatim CI line of `docs/RUNBOOK.md` (the three hosted lines, or "local-only (trimmed) + reason")

---

## ④ State write-back

**The closing-order iron rule: write back the state first → then commit → then re-run check.ps1 for 0.**

Update `STATE.md`: `下一步` = awaiting a new intent (**do not write "CI setup complete" as the task's closing line**); `未决问题` = items in the mirror comparison that are not yet aligned, or things on the hosting-platform side (secrets / permissions / notifications) that need the user's decision; roll `未来 3 步` as needed.

```powershell
git add docs/RUNBOOK.md STATE.md
if (Test-Path '.github/workflows/ci.yml') { git add '.github/workflows/ci.yml' }   # the local-only branch has no such file; a bare git add exits 128 (pathspec did not match)
git commit -m "4-4 ci(build): CI 口径与 check.ps1 对齐"
powershell -NoProfile -File check.ps1
```

- ❌ Counter-example (measured on this machine): in a local-only repository, a bare `git add .github/workflows/ci.yml docs.md` → stderr `fatal: pathspec '.github/workflows/ci.yml' did not match any files`, **exit code 128**, and not one file in that batch gets staged
- ✅ Good example (measured on this machine): the `if (Test-Path …) { git add … }` guard above → the entry is skipped when the file is absent, **exit code 0**, and `docs/RUNBOOK.md` / `STATE.md` are committed as usual; on a hosted branch the CI file goes in with them

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
