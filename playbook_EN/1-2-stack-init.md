# Card 1-2 · Stack init (the build card after a Go verdict; run once per project)
> Trigger: 1-1 idea research gets the user's "Go" | Output: the project itself + docs/decisions/STACK_<日期>_<主题>.md | Next: wait for a new intent (the first feature goes through 2-1 feature research)
> Process area: PLAN

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following four items, then act (a missing item means do not start):

1. **Restate the task**: the project in one sentence + cite the IDEA decision card path (docs/decisions/IDEA_*.md).
2. **Assumptions list**: list the default assumptions one by one (e.g. "单人用、免费托管、Node 栈优先" ("single user, free hosting, Node stack preferred")).
3. **Clarifying questions (≤5, keep them to the minimum)**: answers already present in the IDEA decision card must not be asked again.
   ❌ Counter-example: "这个项目是做什么的？" ("what does this project do?") (it is in the IDEA card)
   ✅ Example: "项目代码想放在哪个目录？" ("which directory should the project code live in?") (e.g. C:/code/<项目名>)
4. **Quote the checklist verbatim** (paste verbatim the "four green-light proofs" from §② of this card).

Also state: output = a complete project directory + the STACK decision card; the final stack choice is the user's verdict.

---

## ② Execution

**Action 1: 2–3 candidate stacks, scored on four dimensions (1–5 per dimension, 5 is best)**

| Dimension | Scoring question |
| :-- | :-- |
| Existing knowledge | Has the user ever shipped a project on this stack? Never used it = 1–2 points |
| Deployment difficulty | One-click deploy on static hosting = 5; you run your own server = 1 |
| Cost | The free tier covers a single-person project for a year = 5; must pay = write the number + source link |
| AI ecosystem | Mainstream framework with plenty of AI training data = 5; niche framework = 1–2 |

The cost column must not be vague: if you can find it, write "free tier <number> (source link)"; if not, write "未查到公开数据" ("no public data found").
❌ Counter-example: "Vercel 成本低" ("Vercel is cheap") (no source)
✅ Example: "Vercel Hobby 计划免费" ("the Vercel Hobby plan is free") (source: https://vercel.com/pricing, retrieval date <日期>)
After summarizing the scoring table, give a **recommended stack + one-line basis**, then stop and let the user choose.

**Action 2: write the STACK decision card** `docs/decisions/STACK_<日期>_<主题>.md` (≤60 lines): what was chosen / each rejected stack and the reason for rejection / the four-dimension scoring table / cost source links.

**Action 3: generate the full project from the master's template/** (do this first: **the agent must ask the user "母版文件夹放在哪" ("where is the master folder"), get the real absolute path, then act; copying the sample path verbatim is forbidden**)

**Variable names must be ASCII**: when Windows PowerShell 5.1 reads a .ps1 without BOM, a Chinese variable name raises "字符串缺少终止符" ("string is missing the terminator"); scripts must be saved as UTF-8 with BOM.
```powershell
$master = 'D:/path/to/roadbook'   # ← must be changed to the real absolute path of the master folder on this machine (keep the single quotes when the path contains spaces/Chinese); the agent first asks the user where the master lives — copying this line verbatim is forbidden
$dest = 'C:/code/myapp'           # target project root; created when absent, and when present only the missing files are filled in (no existing file is overwritten)
$src = "$master/template"; New-Item -ItemType Directory -Force $dest | Out-Null; Get-ChildItem $src -Recurse -Force | ForEach-Object { $t = Join-Path $dest $_.FullName.Substring($src.Length + 1); if (-not (Test-Path $t)) { Copy-Item $_.FullName $t -Recurse -Force } }; Set-Location $dest; Get-ChildItem -Force
```
`Get-ChildItem -Force` — check item by item that .gitignore/.tool-versions/.env.example are all there. **Any file already present under `$dest` is left untouched** (this protects in particular the `docs/pool/IDEAS.md` built by 1-1 and any file the user has written); an existing `docs/` from 1-1 does not conflict with this fill-in-the-missing merge, and telling the user to delete the directory is forbidden.
If an existing file is older than the template version and you want to upgrade it, you must compare it by hand item by item first; **overwriting a whole directory with `-Force` is forbidden**. Then replace the placeholders file by file:

| File | What to replace |
| :-- | :-- |
| README.md | `<项目名>`, `<这个项目做什么、给谁用>`, the start-command comment |
| AGENTS.md | §0 one-liner/tech stack, §10 environment quick reference (four lines) |
| STATE.md | project name/one-liner/tech stack (link the STACK card) / current stage = project phase / next = wait for a new intent |
| CHANGELOG.md | the first version number (e.g. 0.1.0) and the "未发布" ("unreleased") section note |
| .tool-versions | asdf/mise syntax: one `<工具名> <版本>` per line, where the tool name is the asdf plugin name (nodejs/python/postgres…); doctor.ps1 compares item by item and a wrong name = missing-tool red light |
| .env.example | fill in the real key names for the stack (key names + comments only; real values are forbidden) |
| check.ps1 / doctor.ps1 / orphans.ps1 / gate.ps1 / security.ps1 (the five guard scripts, no placeholders) | check.ps1: fill `$STEPS` per Action 4; doctor.ps1: reads `.tool-versions` and compares item by item (missing tool / version mismatch / leftover placeholder = red light); orphans.ps1: five lists of orphans and ghosts (reports only, never blocks, but an **untracked file** or a read failure = exit code 1 — the list is incomplete, so `git add` first); gate.ps1: pre-commit gate (blocks, never fixes; exit code 1 = blocked), `-Anchor`/`-ScopeFiles` are **required**; security.ps1: machine check for plaintext secrets / `.env` leaks / dangerous execution chains / `.ps1` without BOM (= red) and unlocked dependencies / unpinned CI / plaintext HTTP (= amber), exit code 0 = no red, 1 = red light, blocked, 2 = environment or parameter error |
| docs/ARCHITECTURE.md / docs/registry/ (the three-piece set) | all three blocks of ARCHITECTURE (module diagram / layered directories / new-code placement table) need real content — leaving placeholders = this card is not complete; the registry three-piece set only needs its empty headers, add rows the first time you touch it |
| any .ps1 (especially check.ps1) | after editing you must verify the byte header `head -c 3 check.ps1 \| od -An -tx1` = `ef bb bf`; if it is gone, restore it with `printf '\xef\xbb\xbf' > t && cat check.ps1 >> t && mv t check.ps1` — PS 5.1 reports "字符串缺少终止符" ("string is missing the terminator") when it reads a script without BOM |
**Action 4: fill check.ps1's STEPS with a one-line zero-dependency placeholder check first** (this card fills the placeholder; card 4-1 swaps in the real commands)
```powershell
$STEPS = @('git status --porcelain','powershell -NoProfile -File security.ps1')   # zero-dependency placeholder: it exists only so 1-2 can wrap up; any project runs it through; once card 4-1 lands its first batch of files this must become this project's real build/test commands (card 4-1 owns that); an empty array = "done" can never hold
# the security.ps1 entry is **never swapped out**: the security gate (secrets / dangerous execution chains / dependencies and CI) enters the DoD from the very first commit; Node/TS: @('pnpm typecheck','pnpm lint','pnpm test')   Python: @('python -m mypy .','python -m pytest -q'); faking the check with always-true commands (exit 0, Write-Host) is forbidden — they stay green forever, i.e. the gate is welded shut
```
**Action 5: doctor self-check (green-light proof one)**: run `powershell -NoProfile -File doctor.ps1`.
`$REQUIRED` is deprecated: doctor.ps1 reads `.tool-versions` and compares item by item (missing file / non-UTF-8 / placeholder / version mismatch are all red lights). Only exit code 0 counts as passing; if a tool is missing, install it first and never skip. When it reports a version mismatch, **prefer changing `.tool-versions` to the version actually installed on this machine** (unless the project hard-requires a version); do not go reinstalling Node.
**Action 6: install dependencies + git init + first commit (anchor green)**
```powershell
pnpm install          # or pip install -r requirements.txt (by stack)
git init
$initFiles = @('README.md','AGENTS.md','STATE.md','CHANGELOG.md','.tool-versions','.env.example','.gitignore','.gitattributes','check.ps1','doctor.ps1','gate.ps1','orphans.ps1','security.ps1','docs')   # append the stack files the selection generates (package.json / lockfile / requirements.txt / src / tests, etc.) to this line one by one — no untracked file may fall outside this list
git add $initFiles
$n = (git ls-files).Count    # write into STATE.md's "file-count baseline" and "current file count" (the baseline is written only this once)
git commit -m "1-2 chore(init): init project from V6 template"; $anchor = git rev-parse HEAD
```
The list = every managed file at the root (including gate.ps1, orphans.ps1, security.ps1, CHANGELOG.md, .gitattributes); after committing, `git status --porcelain` must be empty (non-empty = some file was never added to the repo; no untracked file may fall outside the list, and when `pnpm install` has generated a lockfile, the lockfile must be committed along with it). Record `$anchor` as the first entry of STATE.md "recently completed".
**Action 7: first run of check / gate / orphans / security (guardrail green)**
```powershell
powershell -NoProfile -File check.ps1; powershell -NoProfile -File gate.ps1 -Anchor HEAD -ScopeFiles "README.md,AGENTS.md,STATE.md,CHANGELOG.md,.tool-versions,.env.example,.gitignore,.gitattributes,check.ps1,doctor.ps1,gate.ps1,orphans.ps1,security.ps1,docs/" -RepoRoot .; powershell -NoProfile -File orphans.ps1; powershell -NoProfile -File security.ps1
```
This card's hard gate = doctor.ps1 exit code 0 + all four commands above returning 0 (**they must return 0 even while STEPS holds the placeholder**; at this moment gate can only be green or amber: `-Anchor HEAD` draws an empty list, amber but still exit 0). **It must run after `git init` and after the baseline is written**: check.ps1 goes red when there is no git or the baseline is 0, so running it before `git init` (the old version) = guaranteed failure. "Skip it for now and run it later" is forbidden; four non-zero codes = the guard scripts are misinstalled — fix them before continuing.
**Action 8: remote repository (choose one of the three; private/public is the human's verdict)**
1. Create a remote and push for the first time: assign `$owner = 'aparencia'; $name = 'my-app'` first (change these to your own account/repo name), then call `gh repo create "$owner/$name" --private --source . --push` (for public change to `--public` — **the agent must not decide visibility itself**)
2. A remote already exists: assign `$url = 'https://github.com/aparencia/my-app.git'` first (change it to your own repository URL), then call `git remote add origin $url; $branch = git rev-parse --abbrev-ref HEAD; git push -u origin $branch`
3. No remote for now: must write into the STATE.md trim record "本地-only，风险：磁盘故障 = 全部历史清零" ("local-only; risk: a disk failure wipes all history")

Before the first push, run `git status --porcelain`: if `.env` / `*.key` / `*.pem` show up → stop (pushing is irreversible). **Pushing is not part of DoD** (network or credential failures would create false red lights); it belongs to the 5-1 archive wrap-up and 6-6 signal 10.

Before the first push, also run the two git history checks (`git status --porcelain` only shows the working tree and cannot see secrets already committed into history): `git log --all --oneline -- .env` must produce no output (output = `.env` was committed into history, the secret is already in that history, and **pushing is irreversible** — stop and report to the user); `git check-ignore -v .env` must produce output (`.env` is already in .gitignore, and an ignored file can never enter a commit).

**The four green-light proofs (missing any one = initialization not complete):**
```text
① doctor.ps1 exit code 0 (environment green)
② check.ps1 exit code 0 and STEPS non-empty (guardrail green)
③ the first commit hash is recorded in STATE.md (anchor green)
④ a remote is in place or an explicit trim is recorded (remote green)
```

**Prohibitions:**
- leaving `$STEPS` as an empty array / leaving `.tool-versions` empty or holding a placeholder is forbidden
- choosing a stack the user has never shipped on is forbidden (unless the user's verdict explicitly says "我就要学新栈" ("I want to learn a new stack"))
- skipping the first doctor / check run and starting work directly is forbidden
- `git add -A` / `git add .` are forbidden
- writing real secret values into .env.example is forbidden
- editing a .ps1 and running it without checking the BOM byte header first is forbidden (PS 5.1 will report "字符串缺少终止符" ("string is missing the terminator"))

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. the four-dimension scoring table + a source link for every cost figure (or "未查到公开数据" ("no public data found"))
2. the full path of the STACK decision card
3. the complete output of `powershell -NoProfile -File doctor.ps1` (exit code)
4. the `文件数基线`/`当前文件数` written in Action 6 (`$n` verbatim) + the complete output and exit codes of the four Action 7 commands (the check.ps1 / gate.ps1 / orphans.ps1 / security.ps1 summary lines; a missing or 0 file-count baseline → check.ps1 reports red FAIL; `[--]` only appears when the starting anchor is empty and skips this batch's commit-count assertion; gate.ps1 without `-ScopeFiles` is an immediate red light)
5. the first commit hash (`$anchor` verbatim) + the remote verdict (`git remote -v` verbatim, or "local-only + the trim record verbatim")
6. the complete output of `git status --porcelain` after the commit (**must be empty**; non-empty = some managed file was never added to the repo)
7. the placeholder checklist: every angle-bracket marker in template → replaced with (paste the resulting line) / the reason for keeping it (requires user confirmation)
8. the output of `head -c 3 check.ps1 | od -An -tx1` (must be `ef bb bf`) + the `$STEPS` verbatim from Action 4 (at this card's stage = the zero-dependency placeholder line)

---

## ④ State write-back

Update the project-root STATE.md:
- `tech stack` = the chosen stack (decision card: docs/decisions/STACK_*.md)
- `current stage` = project phase; `next` = wait for a new intent
- `file-count baseline` = `$n` from Action 6 (the zero point of the anti-bloat budget; **written hard only this once**, card 4-1 no longer rewrites it afterwards); `current file count` = `(git ls-files).Count` at initialization wrap-up (from then on updated each batch by the 4-1 card wrap-up)
- the first entry of "recently completed" = initialization complete + commit hash
- `remote repository` = <url or "local-only (trimmed)">; `working tree status` = clean

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
git add STATE.md; git commit -m "1-2 chore(state): record init result"; powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Next: wait for a new intent. When the user says to build the first feature → go through 2-1 feature research.

Fixed closing line:
`Project initialization complete: $dest, all four green-light proofs in place. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
