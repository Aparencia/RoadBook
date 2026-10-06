# Card 1-3 · Onboard an existing project (for legacy code only; run once per project)
> Trigger: the project already has code but lacks the AGENTS.md/STATE.md/docs structure | Output: constitution + STATE + docs skeleton + start anchor commit | Next: wait for a new intent
> Process area: PLAN

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following four items, then act (a missing item means do not start):

1. **Restate the task**: in one sentence, say which directory you are onboarding and roughly what the project is (the user's own words).
2. **Assumptions list**: list one by one the assumptions inferred from the directory name/README.
3. **Clarifying questions (≤5)**: anything answerable by scanning the directory must not be asked of a human.
   ❌ Counter-example: "这个项目用什么技术栈？" ("what tech stack does this project use?") (you know it by scanning package.json / requirements.txt)
   ✅ Example: "这个项目里 docs/ 下的旧文档，接入后还维护吗？" ("the old documents under docs/ in this project — will they still be maintained after onboarding?")
4. **Quote the checklist verbatim** (paste verbatim the "five trimming questions" from §② of this card).

Also state: this card only reverse-engineers documentation and does not touch business code; the output lands at the project root.

---

## ② Execution

**Action 1: scan the actual directory tree**

**Variable names must be ASCII**: when Windows PowerShell 5.1 reads a .ps1 without BOM, a Chinese variable name raises "字符串缺少终止符" ("string is missing the terminator"); scripts must be saved as UTF-8 with BOM.
```powershell
Get-ChildItem -Recurse -Depth 3 -Force | Where-Object { $_.FullName -notmatch 'node_modules|\\\.git\\|dist|build|__pycache__|\.venv|coverage' } | Select-Object FullName
```
```powershell
Get-ChildItem -Recurse -File | Group-Object Extension | Sort-Object Count -Descending | Select-Object Count,Name -First 15
```

**Action 2: probe the actual stack (evidence = files, guessing is forbidden)**
package.json exists → Node/frontend stack; requirements.txt / pyproject.toml exists → Python; go.mod exists → Go.
Open those files and read the key lines (framework name/version); write "the file used as evidence + the verbatim key line" into the receipt.
❌ Counter-example: "看目录名是个 React 项目" ("judging by the directory name, this is a React project") (memory/guess)
✅ Example: "React 18——依据 package.json 第 12 行 `"react": "^18.2.0"`" ("React 18 — according to package.json line 12, `"react": "^18.2.0"`")

**Action 3: generate AGENTS.md (≤240 lines)**
Copy the full text from the master's AGENTS.md template, then replace: §0 one-liner/tech stack (using the Action 2 evidence), §10 environment quick reference (fill the start/check/test commands per the actual stack — write commands you actually verified can run).

**Action 4: generate STATE.md (≤45 lines)**
Copy from the master's STATE.md template and replace: project name/one-liner/tech stack (when no STACK decision card can be linked, write "存量项目反推" ("reverse-engineered from a legacy project")) / current stage = onboarding complete / next = wait for a new intent.

**Action 5: run `scaffold` to inventory and fill in existing assets (fills in what is missing, never overwrites)**

The master is **resolved first, asked about second** (a five-rung ladder; the CLI prints `source=` so you can see which rung was used): `--master` → `ROADBOOK_MASTER` → **the CLI's own location** (this hits whenever the skill / plugin package is installed — the master is inside the local package, so no network and no question to the user) → npm identity `roadbook/package.json` → only when all of them fail does it print three manual paths and exit 2 (**it never guesses a directory**: guessing wrong means pouring the template into somebody else's repository).

```powershell
$scaffold = 'D:/path/to/roadbook/skills/roadbook/bin/scaffold.mjs'   # ← the agent fills in the real absolute path from this skill's base directory; only without a skill does it fall back to asking the user where the master lives
$proj = 'C:/code/myapp'   # target project root (already scanned in Action 1 of this card)
node $scaffold --check $proj    # read-only health check: added / same / conflict + `规则版本：` comparison (writes nothing)
node $scaffold --apply $proj    # fills in "added" only: the five guard scripts, the docs/ skeleton, .gitignore/.gitattributes/.tool-versions/.env.example, CHANGELOG, and the 6 seed lesson cards
```
Expected: `--apply` prints `已写入 N 个新增文件（未覆盖任何已存在文件）` and exits 0; re-running `--check` then reports `新增 0` (a non-zero conflict count or a stale rule version makes it exit 1 = **a human decision is pending, not a failure**).

**Five dispositions for existing assets** (file every `[conflict]` entry under one of them; the criterion is the relationship to a RoadBook slot, not the file type): **same-role authority** (an existing rules file such as `AGENTS.md` / `CLAUDE.md`) → **diff only, human decides** (A6 / C3 red-line domain), and the merge law is **project facts go into `AGENTS.md` §0/§10 while the rule sections come from the master wholesale** (the master already splits "facts" from "rules"); **same function, different shape** (an existing ADR / spec directory / TODO / issue tracker) → **write a pointer, never restate the content**, and register it in the `docs/README.md` table; **same-name placeholder** → a content conflict is not overwritten, but when `.gitignore` is missing the four entries `.env` / `*.pem` / `*.key` / `.env.local` **that is a pure append and must be added** (otherwise Action 8.5's `git check-ignore -v .env` inevitably goes red, and secrets can reach history); **historical sediment** (old reports / old specs) → **add one line "historical evidence, not current criteria"**, do not move them (moving breaks links and blame); **unrelated assets** (business code / `vendor/`) → **leave them alone**, but write "why it is untouched" into the STATE.md trim record (the reverse duty of D6②).

**Action 5.5: placeholders and self-checks**
- Replace `$STEPS` at the top of `check.ps1` with this project's real commands (the script counts as installed only once they run through, i.e. exit code 0) [disambiguated] — **only for the files newly installed this time**; write the real tool names and versions for this project's stack into `.tool-versions` (doctor.ps1 reads it and compares item by item; a wrong name = missing-tool red light).
- Write only the header in each registry file, adding rows on first touch: `COMPONENTS.md` = `| 页面 | 界面元素 | 人话标识 | 程序名 | 文件 | 搜索词 | 影响面 |` ｜ `DATA_DICT.md` = `| 表 | 字段 | 类型 | 校验 | 敏感度 D1~D4 |` ｜ `APIS.md` = `| 路径 | 方法 | 用途 | 错误码 | 鉴权 |`
- In this step run only `powershell -NoProfile -File orphans.ps1`: at this moment all new files are uncommitted, so it prints `[FAIL] 未跟踪 N 个文件` ("N untracked files") with exit code 1 — that means "the list is incomplete" (run `git add` first), **not orphans**; `check.ps1` will inevitably print `[FAIL] 工作树不干净` ("working tree is dirty") — **also expected**; leave it and re-run in ④ after the Action 8 commit to get 0.
- The `file-count baseline` = `@(git ls-files).Count` (including `docs/` and the five guard scripts), **sampled only after the Action 8 first commit**, then written into STATE.md; orphans.ps1's summary "file count" excludes `docs/` and the guard scripts and **must not** be written into the baseline. Onboarding the whole template raises the file count far beyond the 20 check.ps1 allows, so sampling before the commit always prints FAIL — the only legal timing is after the onboarding commit, using the measured value.
- If the user trims this mechanism away → write in the STATE.md "trim record": "孤儿与文档七张清单与文件数预算不适用 + 原因" ("the orphan/doc seven-list and the file-count budget do not apply + reason").

**Action 6: reverse-engineer a first version of ARCHITECTURE.md (≤150 lines)**
Three sections: module diagram (mermaid, boxes = actual top-level directories) + layering notes (one sentence per layer: what it does) + data flow (one sentence: user action → which layer → stored where). Every module must be labeled with its real directory path; anything you cannot state accurately gets `<!-- 待确认 -->` ("to be confirmed"), and fabricating is forbidden.
❌ Counter-example: drawing a three-layer architecture diagram when the directory has no service layer at all
✅ Example: "src/components（UI）→ src/lib（逻辑）→ IndexedDB（存储）——与目录树一致" ("src/components (UI) → src/lib (logic) → IndexedDB (storage) — consistent with the directory tree")

**Action 7: the five trimming questions (read them aloud to the user; write each answer into the STATE.md "trim record" immediately)**

```text
① Does this project have a database/table schema? (No → migration-type checks are permanently skipped; write "无" ("none") under the DATA_DICT header)
② Does this project have a graphical interface? (No → skip the 7-1 UI change card: that card only covers changes to UI elements and pages) [disambiguated]
③ Will this project be deployed to the public internet? (No → the 5-2 release card runs at the "local demo" level: verify on this machine only, do not push to production)
④ Does this project expose APIs for others to call? (No → write "无" ("none") under the APIS.md header)
⑤ Which other cards are clearly not applicable? (record everything the user names in the trim record)
```

**Action 8: git start anchor**
- .git already exists: re-running init is forbidden. Run `git status --short` first; if there are uncommitted changes → stop and ask the user "commit or shelve"; once clean, record the anchor:
```powershell
$anchor = git rev-parse HEAD
```
- No .git:
```powershell
git init
$files = @('AGENTS.md','STATE.md','docs')   # change to the entries actually generated, listing them one by one
git add $files
git commit -m "1-3 chore: onboard existing project to V6 flow"
$anchor = git rev-parse HEAD
```
Write the hash as the first entry of STATE.md "recently completed". `git add -A` / `git add .` is forbidden.

**Action 8.5: remote (criteria inlined, do not jump cards)** First run `git remote -v`: if origin exists → note the URL, `$branch = git rev-parse --abbrev-ref HEAD; git push -u origin $branch` to confirm it can push; if there is no origin → choose one of three (**private or public is the human's verdict**):
1. Create a remote and push for the first time: assign first `$owner = 'aparencia'; $name = 'my-app'` (change these to your own account/repo name), then call `gh repo create "$owner/$name" --private --source . --push` (for public change to `--public`)
2. A remote already exists: assign first `$url = 'https://github.com/aparencia/my-app.git'` (change it to your own repository URL), then call `git remote add origin $url; $branch = git rev-parse --abbrev-ref HEAD; git push -u origin $branch`
3. No remote for now: write into the STATE.md trim record "本地-only，风险：磁盘故障 = 全部历史清零" ("local-only; risk: a disk failure = all history is wiped")
Before the first push, confirm `git status --porcelain` is empty and that no tracked file holds a secret: if `git ls-files | Select-String '\.env|\.key$|\.pem$'` hits anything, stop (pushing is irreversible). **Pushing is not part of DoD**; a failure is only recorded as a trim note, not a red light.

Before the first push, also run the two git history checks (`git ls-files` only shows the current index and cannot see secrets already committed into history): `git log --all --oneline -- .env` must produce no output (output = `.env` was committed into history, the secret is already in that history, and **pushing is irreversible** — stop and report to the user); `git check-ignore -v .env` must produce output (`.env` is already in .gitignore, and an ignored file can never enter a commit).

**Prohibitions:**
- Modifying any business code is forbidden (if you find a bug, log it to docs/TECH_DEBT.md; fixing it in passing is forbidden)
- Writing unverified commands into ARCHITECTURE/AGENTS is forbidden
- Building out the registry in full is forbidden (headers only, to prevent fabrication; add rows on first touch)
- `git add -A` / `git add .` is forbidden

---

## ③ Evidence receipt

At wrap-up, give item by item:
1. A summary of the file count/directory count from the directory-tree scan + the extension statistics table
2. Stack probing evidence: the file path used as evidence + the verbatim key line
3. Generated-file list: AGENTS.md (line count ≤240) / STATE.md (line count ≤45) / ARCHITECTURE.md (line count ≤150) / the registry three-piece set / the five guard scripts (check·doctor·gate·orphans·security, with the verbatim orphans output + the check.ps1 output re-run after committing + the security.ps1 exit code)
4. The user's verbatim answers to the five trimming questions + the current content of the STATE "trim record"
5. The start anchor commit hash (or "git already existed, anchor = hash") + the remote determination (verbatim `git remote -v`, or "local-only + verbatim trim record") + the complete `git status --porcelain` output (**must be empty**)

---

## ④ State write-back

Update STATE.md: the three project identity fields, `current stage` = onboarding complete, `next` = wait for a new intent, `trim record` = the Action 7 result + **one provenance line** (`接入：母版 roadbook v<version> / 规则版本 <YYYY-MM-DD.N>`, with the version taken from the first line of the `scaffold --check` receipt), the first entry of "recently completed" = onboarding complete + hash, `remote repository` = <url or "local-only (trimmed)">, `working tree status` = clean.

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
git add STATE.md
git commit -m "1-3 docs(state): record onboarding result"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

**The four onboarding proofs (missing any one = onboarding is not complete; symmetric with the 1-2 green-light four):**
```text
① re-running scaffold --check reports "新增 0" (fill-in green)
② doctor.ps1 exits 0 (environment green; .tool-versions matches reality)
③ check.ps1 exits 0 (guardrail green; re-run after the commit to obtain 0)
④ the starting anchor is recorded in STATE.md + the remote has landed or is explicitly trimmed (anchor and remote green)
```

Next: wait for a new intent. From then on all intents are routed by the 0-1 driver card; trimmed cards are skipped directly when routing.

Fixed closing line:
`Onboarding complete: the documentation skeleton is built, start anchor = $anchor. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
