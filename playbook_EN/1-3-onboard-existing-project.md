# Card 1-3 · Onboard an existing project (for legacy code only; run once per project)
> Trigger: the project already has code but lacks the AGENTS.md/STATE.md/docs structure | Output: constitution + STATE + docs skeleton + start anchor commit | Next: wait for a new intent

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

**Action 3: generate AGENTS.md (≤200 lines)**
Copy the full text from the master's AGENTS.md template, then replace: §0 one-liner/tech stack (using the Action 2 evidence), §10 environment quick reference (fill the start/check/test commands per the actual stack — write commands you actually verified can run).

**Action 4: generate STATE.md (≤45 lines)**
Copy from the master's STATE.md template and replace: project name/one-liner/tech stack (when no STACK decision card can be linked, write "存量项目反推" ("reverse-engineered from a legacy project")) / current stage = onboarding complete / next = wait for a new intent.

**Action 5: generate the docs/ skeleton + the registry three-piece format headers (headers only, not the full set)**
```powershell
New-Item -ItemType Directory -Force docs/registry, docs/pool, docs/specs, docs/decisions, docs/reviews, docs/versions, docs/lessons, docs/archive | Out-Null
```
Write only the header plus one hint line in each of the three registry files, and add rows only on first touch of the corresponding object:
- `docs/registry/COMPONENTS.md`: `| 页面 | 界面元素 | 人话标识 | 程序名 | 文件 | 搜索词 | 影响面 |`
- `docs/registry/DATA_DICT.md`: `| 表 | 字段 | 类型 | 校验 | 敏感度 D1~D4 |`
- `docs/registry/APIS.md`: `| 路径 | 方法 | 用途 | 错误码 | 鉴权 |`

**Action 5.5: install the four guard scripts (copy from the master's template directory into the project root)**
```powershell
$母版 = 'D:\path\to\roadbook'   # absolute path to the master root; assign before calling
$项目 = 'C:\code\myapp'         # absolute path to the target project root
$tpl = Join-Path $母版 'template'; Copy-Item "$tpl/check.ps1", "$tpl/doctor.ps1", "$tpl/gate.ps1", "$tpl/orphans.ps1" $项目
```
- Replace `$STEPS` at the top of `check.ps1` with this project's real commands (the script counts as installed only once they run through, i.e. exit code 0) [disambiguated]; write the real tool names and versions for this project's stack into `.tool-versions` (doctor.ps1 reads it and compares item by item; a wrong name = missing-tool red light).
- If the project already has a same-named script → **do not overwrite**: show the user the differences and let them decide between merging and keeping theirs.
- In this step run only `powershell -NoProfile -File orphans.ps1`: write the "file count" from its summary line into STATE.md `file-count baseline` (updated per batch by card 4-1 afterwards). At this moment all new files are uncommitted, so it prints `[FAIL] 未跟踪 N 个文件` ("N untracked files") with exit code 1 — that means "the list is incomplete" (run `git add` first), **not orphans**; `check.ps1` will inevitably print `[FAIL] 工作树不干净` ("working tree is dirty") — **also expected**; leave it and re-run in ④ after the Action 8 commit to get 0.
- If the user trims this mechanism away → write in the STATE.md "trim record": "孤儿五张清单与文件数预算不适用 + 原因" ("the orphan five-list and the file-count budget do not apply + reason").

**Action 6: reverse-engineer a first version of ARCHITECTURE.md (≤100 lines)**
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
1. Create a remote and push for the first time: `$owner='你的GitHub账号'; $name='仓库名'; gh repo create "$owner/$name" --private --source . --push` (for public change to `--public`)
2. A remote already exists: `$url='https://github.com/你/仓库.git'; git remote add origin $url; $branch = git rev-parse --abbrev-ref HEAD; git push -u origin $branch`
3. No remote for now: write into the STATE.md trim record "本地-only，风险：磁盘故障 = 全部历史清零" ("local-only; risk: a disk failure = all history is wiped")
Before the first push, confirm `git status --porcelain` is empty and that no tracked file holds a secret: if `git ls-files | Select-String '\.env|\.key$|\.pem$'` hits anything, stop (pushing is irreversible). **Pushing is not part of DoD**; a failure is only recorded as a trim note, not a red light.

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
3. Generated-file list: AGENTS.md (line count ≤200) / STATE.md (line count ≤45) / ARCHITECTURE.md (line count ≤100) / the registry three-piece set / the four guard scripts (check·doctor·gate·orphans, with the verbatim orphans output + the check.ps1 output re-run after committing)
4. The user's verbatim answers to the five trimming questions + the current content of the STATE "trim record"
5. The start anchor commit hash (or "git already existed, anchor = hash") + the remote determination (verbatim `git remote -v`, or "local-only + verbatim trim record") + the complete `git status --porcelain` output (**must be empty**)

---

## ④ State write-back

Update STATE.md: the three project identity fields, `current stage` = onboarding complete, `next` = wait for a new intent, `trim record` = the Action 7 result, the first entry of "recently completed" = onboarding complete + hash, `remote repository` = <url or "local-only (trimmed)">, `working tree status` = clean.

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
git add STATE.md
git commit -m "1-3 docs(state): record onboarding result"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Next: wait for a new intent. From then on all intents are routed by the 0-1 driver card; trimmed cards are skipped directly when routing.

Fixed closing line:
`Onboarding complete: the documentation skeleton is built, start anchor = $anchor. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
