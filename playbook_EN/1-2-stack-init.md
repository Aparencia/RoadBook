# Card 1-2 · Stack init (the build card after a Go verdict; run once per project)
> Trigger: 1-1 idea research gets the user's "Go" | Output: the project itself + docs/decisions/STACK_<日期>_<主题>.md | Next: wait for a new intent (the first feature goes through 2-1 feature research)

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following four items, then act (a missing item means do not start):

1. **Restate the task**: the project in one sentence + cite the IDEA decision card path (docs/decisions/IDEA_*.md).
2. **Assumptions list**: list the default assumptions one by one (e.g. "单人用、免费托管、Node 栈优先" ("single user, free hosting, Node stack preferred")).
3. **Clarifying questions (≤5, keep them to the minimum)**: anything already answered in the IDEA decision card must not be asked again.
   ❌ Counter-example: "这个项目是做什么的？" ("what does this project do?") (it is in the IDEA card)
   ✅ Example: "项目代码想放在哪个目录？" ("which directory should the project code live in?") (e.g. C:\code\<项目名>)
4. **Quote the checklist verbatim** (paste verbatim the "four green-light proofs" from §② of this card).

Also state: output = a complete project directory + the STACK decision card; the final stack choice is the user's verdict.

---

## ② Execution

**Action 1: 2–3 candidate stacks, scored on four dimensions (1–5 per dimension, 5 is best)**

| Dimension | Scoring question |
| :-- | :-- |
| Existing knowledge | Has the user ever shipped a project with this stack? Never used it = 1–2 |
| Deployment difficulty | Static hosting with one-click deploy = 5; you manage your own server = 1 |
| Cost | Free tier enough to run a single-user project for a year = 5; must pay = write the number + source link |
| AI ecosystem | Mainstream framework, plenty of AI training corpus = 5; niche framework = 1–2 |

The cost column must not be vague: if you can find it, write "free tier <number> (source link)"; if you cannot, write "未查到公开数据" ("no public data found").
❌ Counter-example: "Vercel 成本低" ("Vercel is cheap") (no source)
✅ Example: "Vercel Hobby 计划免费" ("the Vercel Hobby plan is free") (source: https://vercel.com/pricing, retrieval date <日期>)
After summarizing the scoring table, give a **recommended stack + one-line basis**, then stop and let the user choose.

**Action 2: write the STACK decision card** `docs/decisions/STACK_<日期>_<主题>.md` (≤60 lines): what was chosen / each rejected stack and the reason for rejection / the four-dimension scoring table / cost source links.

**Action 3: generate the full project from the master's template set**
```powershell
$母版 = 'D:/path/to/roadbook'   # absolute path to the master root (its template directory sits directly under it); assign before calling
$dest = 'C:\code\myapp'         # the target directory must not exist or must be empty: if it exists and is non-empty it nests as $dest\template
if (Test-Path $dest) { throw "目标目录已存在：$dest —— 确认它为空，或换一个不存在的路径" }
Copy-Item -Recurse (Join-Path $母版 'template') $dest
Set-Location $dest
Get-ChildItem -Force
```
`Get-ChildItem -Force` — verify item by item that .gitignore/.tool-versions/.env.example are all present. Then replace the placeholders file by file:

| File | What to replace |
| :-- | :-- |
| README.md | `<项目名>`, `<这个项目做什么、给谁用>`, the start-command comments |
| AGENTS.md | §0 one-liner/tech stack, the four lines of the §10 environment quick reference |
| STATE.md | project name/one-liner/tech stack (link the STACK card) / current stage = project phase / next = wait for a new intent |
| CHANGELOG.md | the first version number (e.g. 0.1.0) and the "Unreleased" section note |
| .tool-versions | asdf/mise syntax: one `<工具名> <版本>` per line; the tool name uses the asdf plugin name (nodejs/python/postgres…); doctor.ps1 compares item by item, and a wrong name = missing-tool red light |
| .env.example | fill in the real key names for the stack (key names + comments only; writing real values is forbidden) |
| check.ps1 | fill the `$STEPS` array per Action 4 |
| doctor.ps1 | no replacement needed: it reads `.tool-versions` and compares item by item (Action 5); missing tool / version mismatch / leftover placeholder are all red lights |
| orphans.ps1 | no replacement needed: the orphan and phantom five-list tool (the five lists only report, they do not block; but **untracked files** or a read failure = exit code 1 — that means the list is incomplete, run `git add` first) |
| gate.ps1 | no replacement needed: the pre-commit gate (blocks only, never fixes; exit code 1 = blocked). `-Anchor`/`-ScopeFiles` are **required**; after installation self-check once per Action 7 |
| docs/ARCHITECTURE.md | module diagram / layered directories / new-code landing table — all three blocks must hold real content; leaving placeholders = this card is not done |
| docs/registry/ the three-piece set | keeping the empty headers is enough; add rows on first touch |
**Action 4: fill check.ps1's STEPS with the stack's real commands** (an empty array = "done" can never hold)
```powershell
# Node/TS:  $STEPS = @('pnpm typecheck', 'pnpm lint', 'pnpm test')   # Python:  $STEPS = @('python -m mypy .', 'python -m pytest -q')
# Pure static page:  $STEPS = @('node --check src/index.js')   # at least one real check; if that file/command does not exist, replace it with this project's real one
```
**Action 5: doctor self-check (green-light proof one)**
```powershell
powershell -NoProfile -File doctor.ps1
```
`$REQUIRED` is deprecated: doctor.ps1 reads `.tool-versions` and compares item by item (missing file / non-UTF-8 / placeholder / version mismatch are all red lights). Only exit code 0 counts as passing; if a tool is missing, install it first — skipping is forbidden.
**Action 6: install dependencies + git init + first commit (anchor green)**
```powershell
pnpm install          # or pip install -r requirements.txt (depending on the stack)
git init
git add README.md AGENTS.md STATE.md CHANGELOG.md .tool-versions .env.example .gitignore .gitattributes check.ps1 doctor.ps1 gate.ps1 orphans.ps1 docs
$n = (git ls-files).Count    # write into STATE.md's "file-count baseline" and "current file count" (the baseline is written only this once)
git commit -m "1-2 chore(init): init project from V6 template"
$anchor = git rev-parse HEAD
```
The list = every managed file at the root (including gate.ps1, orphans.ps1, CHANGELOG.md, .gitattributes); after committing, `git status --porcelain` must be empty (non-empty = some file was never added to the repo). Record `$anchor` as the first entry of STATE.md "recently completed".
**Action 7: first run of check / gate / orphans (guardrail green)**
```powershell
powershell -NoProfile -File check.ps1
powershell -NoProfile -File gate.ps1 -Anchor HEAD -ScopeFiles "README.md,AGENTS.md,STATE.md,CHANGELOG.md,.tool-versions,.env.example,.gitignore,.gitattributes,check.ps1,doctor.ps1,gate.ps1,orphans.ps1,docs/" -RepoRoot .
powershell -NoProfile -File orphans.ps1
```
All three exit codes must be 0 (at this moment gate can only be green or amber: `-Anchor HEAD` draws an empty list, amber but still exit 0). **It must run after `git init` and after the baseline is written**: check.ps1 goes red when there is no git or the baseline is 0, so running it before `git init` in older versions = guaranteed failure. "Skip it for now and run it later" is forbidden; three non-zero codes = the guard scripts are misinstalled, fix them before continuing.
**Action 8: remote repository (choose one of three; private/public is the human's verdict)**
1. Create a remote and push for the first time: assign first `$owner = 'aparencia'; $name = 'my-app'` (change these to your own account/repo name), then call `gh repo create "$owner/$name" --private --source . --push` (for public change to `--public` — **the agent must not decide visibility itself**)
2. A remote already exists: assign first `$url = 'https://github.com/aparencia/my-app.git'` (change it to your own repository URL), then call `git remote add origin $url; $branch = git rev-parse --abbrev-ref HEAD; git push -u origin $branch`
3. No remote for now: must write into the STATE.md trim record "本地-only，风险：磁盘故障 = 全部历史清零" ("local-only; risk: a disk failure = all history is wiped")

Before the first push, run `git status --porcelain`: if `.env` / `*.key` / `*.pem` appear → stop (pushing is irreversible). **Pushing is not part of DoD** (network or credential failures would cause false red lights); it belongs to the 5-1 archive wrap-up and 6-6 signal 10.

**The four green-light proofs (missing any one = initialization not complete):**
```text
① doctor.ps1 exits 0 (environment green)
② check.ps1 exits 0 and STEPS is non-empty (guardrail green)
③ the first commit hash is recorded in STATE.md (anchor green)
④ the remote is in place or explicitly trimmed (remote green)
```

**Prohibitions:**
- Leaving `$STEPS` as an empty array / leaving `.tool-versions` empty or holding placeholders is forbidden
- Choosing a stack the user has never shipped with is forbidden (unless the user explicitly says "我就要学新栈" ("I want to learn a new stack") in the verdict)
- Skipping the first doctor / check run and starting work directly is forbidden
- `git add -A` / `git add .` is forbidden
- Writing real secret values in .env.example is forbidden

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. The four-dimension scoring table + a source link for every cost figure (or "未查到公开数据" ("no public data found"))
2. Full path of the STACK decision card
3. The complete output of `powershell -NoProfile -File doctor.ps1` (exit code)
4. The `file-count baseline`/`current file count` written in Action 6 (verbatim `$n`) + the complete output and exit codes of the three Action 7 commands (check.ps1 / gate.ps1 / orphans.ps1 summary lines; a missing or 0 file-count baseline → check.ps1 prints FAIL, `[--]` appears only when the start anchor is empty and skips this batch's commit-count assertion; gate.ps1 without `-ScopeFiles` goes straight to red)
5. The first commit hash (verbatim `$anchor`) + the remote determination (verbatim `git remote -v`, or "local-only + verbatim trim record")
6. The complete output of `git status --porcelain` after committing (**must be empty**; non-empty = some managed file was never added to the repo)
7. Placeholder checklist: every angle-bracket marker in the template set → replaced with (paste the replaced line) / reason for keeping it (must be confirmed by the user)

---

## ④ State write-back

Update the project-root STATE.md:
- `tech stack` = the chosen stack (decision card: docs/decisions/STACK_*.md)
- `current stage` = project phase; `next` = wait for a new intent
- `file-count baseline` = `$n` from Action 6 (the zero point of the anti-bloat budget; **written hard only this once**, card 4-1 no longer rewrites it afterwards, each batch only updates `current file count`)
- `current file count` = `(git ls-files).Count` at initialization wrap-up (from then on updated each batch by the 4-1 card wrap-up)
- the first entry of "recently completed" = initialization complete + commit hash
- `remote repository` = <url or "local-only (trimmed)">; `working tree status` = clean

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
git add STATE.md
git commit -m "1-2 chore(state): record init result"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Next: wait for a new intent. When the user says to build the first feature → go through 2-1 feature research.

Fixed closing line:
`Project initialization complete: $dest, all four green-light proofs in place. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
