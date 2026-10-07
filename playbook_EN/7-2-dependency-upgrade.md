# Card 7-2 · Dependency upgrade
> Trigger: a dependency needs upgrading (user request or security patch) ｜ Output: upgrade commit + compatibility conclusion ｜ Next: 5-1 Archive
> Process area: IMP, RISK

---

## ① Start confirmation

1. **One of three upgrade motives** (only the first two are worth acting on; "chasing the new" should be talked out of):
   - Security patch (there is a CVE / vulnerability advisory)
   - Needed by a new feature (some Must dependency needs a new version's API)
   - Chasing the new (❌ rejected by default: no benefit, only regression risk)
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "only this one package is touched this time", "no major version crossing"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — which **specific version number** to upgrade to ("latest" is not accepted)? Can breaking changes be accepted? How long should the rollback window be kept? Anything findable in `.tool-versions` and the lockfile must not be asked of the human.
4. **Affected-surface preview**: `Select-String` will be used to verify who currently uses the dependency (including test/config directories outside src).
5. **Quote the checklist verbatim** (paste the "four upgrade checks" from §② of this card word for word).
6. And declare: the output landing point = the upgrade commit (lockfile and code adaptation as two separate commits) + the compatibility conclusion; the next card is 5-1 (Archive).

---

## ② Execution

**Prerequisite: STACK DETECTED (receipt first, then talk about upgrading)**
```powershell
git ls-files -- 'package.json' 'pnpm-lock.yaml' 'package-lock.json' '.tool-versions' 'pyproject.toml' 'requirements*.txt' 'Cargo.toml' 'go.mod'
```
Expected: one line per manifest file that really exists (2 lines measured in this repo: `.tool-versions`, `package.json`) — missing ones print nothing and raise nothing; empty output = wrong directory, or no recognizable stack here.
Copy one receipt line verbatim out of the command output: `STACK DETECTED: <tool> <exact version> (source: <command>)` — version numbers come only from command output and lockfiles, never from memory.
**Source discipline (three checks)**: ① only official sources count — the official changelog / release notes / migration guide / the official repository's tags and diffs; ② blogs, Q&A sites, model memory and training data **do not count as evidence**; they may only be used to locate a lead, and you must go back to the official text to verify it; ③ for any item the official sources do not cover, **explicitly write `UNVERIFIED` + what you searched + why no conclusion can be given** — hedging is forbidden: "should be fine" and "probably compatible" do not count as conclusions.

**Four upgrade checks:**

**① Verify the reason**: read the official changelog / release notes / security advisory, and put a summary in the receipt (what changed / which breaking changes there are / why this project needs it).
❌ Counter-example: "the latest version performs better" (no data, no mapping to this project's pain point)
✅ Good example: "v3.2 fixed the memory leak in `parse()` that this project uses (issue #123; it appeared in the weekly report of our export API)"

**② Compatibility affected surface**:
```powershell
$dep = 'requests'          # the dependency to be upgraded this time
Get-ChildItem -Path src, tests -Recurse -File | Select-String -Pattern $dep | Select-Object Path, LineNumber, Line
```
Expected: one line per call site, with the header `Path` / `LineNumber` / `Line` (measured on this machine: `Path` is absolute); 0 hits = this dependency has no call site at all — confirm you really want to upgrade it before you do.
List all call sites, and judge "whether this project is affected" item by item against the changelog's breaking changes.
❌ Counter-example: `grep -rn "<依赖名>" src` (a bash-only command + a placeholder; it will not run on Windows, and it also misses call sites outside src)
✅ Good example: the `Get-ChildItem -Path src, tests -Recurse -File | Select-String -Pattern $dep` above (runs on PowerShell 5.1, outputs Path/LineNumber/Line)
(Note: on PowerShell 5.1 `-Recurse` is not a valid parameter of `Select-String`; only the pipeline form above runs)

**③ Prepare the upgrade changes (lockfile and code adaptation committed separately; the commit action goes in §④, this section does not commit)**:
```powershell
$dep = 'requests'; $old = '2.30.0'; $new = '2.31.0'
# Fill in the upgrade command according to the package manager in .tool-versions, e.g.: pnpm add requests@2.31.0 / pip install -U requests==2.31.0
$lock = 'pnpm-lock.yaml'          # the lockfile name changes with the actual package manager
$adapter = 'src/export_limit.py'  # the code adaptation files this time, listed one by one
```
Expected: this block only assigns, so it produces no output (empty output is correct); `$dep` / `$old` / `$new` are reused by the §④ commit messages and must match this project's real stack (copying the placeholders = a wrong commit message).
- The lockfile gets its own commit (preserving rollback granularity), and the code adaptation gets another commit
- The adaptation for breaking changes must state "behavior before the change → behavior after the change"

**④ Full verification**: `powershell -NoProfile -File check.ps1` exit code 0 + paste the output (run after the §④ commit). If it does not pass, roll back through one of the two branches below depending on what failed (a failed upgrade is also a valid conclusion):
```powershell
$lockCommit = 'abc1234'      # §④ first commit (lockfile); read it with git log --oneline -2
$adapterCommit = 'def5678'   # §④ second commit (code adaptation)
git revert $lockCommit       # the dependency itself is bad → drop the lockfile (the adaptation commit should be dropped too)
git revert $adapterCommit    # the dependency is fine, only the adaptation is wrong → drop just the adaptation, keep the upgrade
```
Expected: take exactly one branch, depending on what failed — each revert produces one revert commit (visible in `git log --oneline -3`); after reverting, re-run `check.ps1` for 0 before calling the rollback done (a failed upgrade is also a valid conclusion).
(One `git revert` handles one commit; to drop both, run the two commands in order — never put two hashes into one command.)

**Prohibitions:**
- Upgrading multiple **major versions** in one task is forbidden (mutual interference makes localization impossible)
- Skipping the separate lockfile commit is forbidden (rollback granularity is lost)
- Writing the goal as "upgrade to the latest version" is forbidden (the version number must be specific)
- A breaking major-version upgrade → is not this card's job; start a project and go through the full L-tier process

---

## ③ Evidence receipt

1. The `STACK DETECTED` line verbatim (tool + exact version + source command)
2. Version change: dependency name + old version → new version (specific numbers), motive classification
3. Compatibility conclusion: breaking changes item by item "affected / not affected" + basis (the basis must be the official text, with its source marked; list every `UNVERIFIED` item)
4. Lockfile commit + adaptation commit hashes (filled in after the §④ commit)
5. `check.ps1` output + exit code

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

Update STATE.md: `当前任务` cleared; `下一步` = 5-1 Archive; if `.tool-versions` has a version-line change it must be updated in sync and noted.

Then commit and re-run (the `$dep` / `$old` / `$new` in the commit messages reuse the assignments from §③):
```powershell
git add STATE.md .tool-versions $lock
git commit -m "7-2 chore(deps): bump $dep $old -> $new"
git add $adapter
git commit -m "7-2 fix(deps): adapt to $dep $new"
powershell -NoProfile -File check.ps1
```
Expected: the two commit messages are exactly `7-2 chore(deps): bump <dep> <old> -> <new>` (the lockfile commit) and `7-2 fix(deps): adapt to <dep> <new>` (the adaptation commit; skip it and say so in the receipt when there is no adaptation file this time); `check.ps1` exits 0 — non-zero = the upgrade failed, handle it through the §④ rollback branches.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
