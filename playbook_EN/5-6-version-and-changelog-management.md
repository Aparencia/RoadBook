# Card 5-6 · Version and changelog management
> Trigger: a version number must be fixed / upgrade notes must be written / an archive must append one line to the unreleased section / the tag is due | Output: the root CHANGELOG.md (the unreleased section or a formal section) + docs/versions/vX.Y.Z.md | Next: 5-2 Release (when this round deploys)

---

## ① Start confirmation

1. **Restate the task (pick one of the four; do not mix them)**: ① append one line to the unreleased section for the change just archived; ② turn the unreleased section into a formal version section; ③ decide whether this change bumps the version and which digit it bumps; ④ write this round's four lines of "upgrade notes".
2. **Assumptions list**: the 3~5 default assumptions you make on the user's behalf (e.g. "only the implementation changed this time; external behavior is unchanged"), each carrying a confidence number and its basis (which files `git diff` was read on).
3. **Clarifying questions (≤5, save any that can be saved; each carries a recommended answer)**:
   - Which concrete version number is it bumped to? (Recommended: the number the version-bump decision table produces, e.g. v0.4.0 — "latest" is not accepted)
   - Can an outsider see the difference this time? (Recommended: read the external-behavior surface with `git diff` first; cannot see it → do not bump the version)
   - Should a pre-release go out to someone for a trial? (Recommended: do not send one — with no real trial user an rc is only one more version number)
   - Anything findable in CHANGELOG and `git log` must not be asked of a human.
4. **Paste the reference checklist verbatim** (paste word for word the "version-bump decision table" four rows and the "four kinds of unreleased entry" from §② of this card).
5. Also declare: the output lands in = the root `CHANGELOG.md` (the unreleased section or a formal section) + `docs/versions/vX.Y.Z.md`; the next card = 5-2 Release (when this round deploys).

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do what the "Reality" column says)**

| You may think | Reality |
| :-- | :-- |
| It is still 0.x, so anything goes | 0.x allows interface changes, but a breaking change still requires the four lines of "upgrade notes"; without them the person receiving the new version can only guess |
| The CHANGELOG can be filled in later, all at once | Every archive appends one line to one of the four kinds; saving it up means the behavior changes are already forgotten, and what gets written is all file names |
| The tag landed in the wrong place, just delete it and tag again | A released tag must never be moved or deleted (`git tag -f` is forbidden); tag a new version number instead and leave history alone |
| It is my own project, remembering version numbers does not matter | A rollback goes back by tag (`git checkout v0.3.0`); once the version chain is broken, a rollback has no idea where to land |
| It is only a rewritten implementation, bump one digit along the way | Only the implementation changed and external behavior is unchanged → do not bump the version (take the 7-8 project refactoring route, ship nothing) |

**Version-bump decision table (judge by the table, not by feeling)**

| What the change looks like | How the version number moves | Action required |
| :-- | :-- | :-- |
| Breaking change: old data / old interfaces / old configuration cannot be used as-is | From 1.x on bump MAJOR; during the 0.x stage bump MINOR | The four lines of "upgrade notes" are required |
| Added capability: a new feature / page / command / configuration key | Bump MINOR | Append one "added" line to the unreleased section |
| A bug fix / copy change / documentation change | Bump PATCH | Append one "fixed" or "changed" line to the unreleased section |
| Only the implementation changed, external behavior is unchanged | Do not bump the version | Ship nothing; take the 7-8 project refactoring route |

❌ Counter-example: "I refactored it and shipped a v1.0.0 along the way" (the version is bumped while external behavior is unchanged = every downstream consumer follows for nothing)
✅ Good example: "the export interface parameter `path` is renamed `filePath`: old callers will error → during the 0.x stage bump MINOR (v0.3.0 → v0.4.0) and give the replacement commands in the upgrade notes"

**The 0.x stage and the criteria for promotion to 1.0.0**
- During the 0.x stage interfaces may change at any time, but every breaking change still requires the "upgrade notes"; the version number climbs from v0.1.0 by the table above.
- Two criteria for entering 1.0.0 (meeting either one is enough to nominate it, **the user makes the verdict**): ① the first real external user appears; ② you promise to stop breaking things (you accept paying MAJOR for a breaking change).
- If the criteria are not met, stay in 0.x; "it looks like it is time for 1.0" is not a criterion.

**Pre-release vX.Y.Z-rc.N**
- Used only for "sending it to someone for a trial"; the CHANGELOG gets its own section `## [X.Y.Z-rc.N] - YYYY-MM-DD`, which **does not go into a formal version section**.
- N climbs from 1 (v0.4.0-rc.1 → v0.4.0-rc.2); the trial passes → the formal section `## [0.4.0] - YYYY-MM-DD`; the trial finds problems → fix them and ship the next rc, leaving the one already out untouched.

**Maintaining the unreleased section (a fixed action at every archive)**
- Append one line to the unreleased section of the root `CHANGELOG.md`, picking one of the four kinds: added / changed / deprecated / fixed.
- One line states "what changed for the user", not "which file was touched"; append only, never rewrite a historical entry.
- Only at release time is it turned into a formal section, with the title verbatim: `## [X.Y.Z] - YYYY-MM-DD` — **the title carries no v** (the v appears only in the tag and in the `docs/versions/vX.Y.Z.md` file name).
❌ Counter-example: `## [v0.4.0] - 2026-10-05` (the v slips into the title and collides with the tag convention)
✅ Good example: `## [0.4.0] - 2026-10-05`; the tag is `v0.4.0`; the detail file is `docs/versions/v0.4.0.md`

**Upgrade notes (migration notes) four-line slots (one missing line = this round is not complete)**

| Line | What to write |
| :-- | :-- |
| Who is affected | which users / which environment / which piece of old data or old configuration is affected, listed so it can be checked off |
| How to migrate | copyable commands, one per line, assign first and then call |
| What happens without migrating | the concrete failure symptom (the error text or how the data goes wrong), never "there may be problems" |
| How to roll back | which version number to go back to + the concrete command + whether the data must be rolled back too |

❌ Counter-example: "Upgrade notes: there is a breaking change, please take care with compatibility" (not one of the four slots is filled; the reader has nowhere to start)
✅ Good example: "Who is affected: the 2 scripts that call the export interface ｜ How to migrate: `git grep -n 'path=' -- src` and rename each site ｜ Without migrating: startup fails with `TypeError: unexpected keyword argument 'path'` ｜ Roll back: `git checkout v0.3.0`; there is no data-structure change this time, so the data stays"

**Three-way alignment check (the first two are judged mechanically before tagging)**

```powershell
$ver = 'v0.4.0'                 # this release's version number; all three places must agree
$num = $ver.TrimStart('v')      # the number without v, used in the CHANGELOG title
Select-String -Path CHANGELOG.md -Pattern ('^## \[' + $num + '\] - ')
Get-ChildItem -Path docs/versions -Filter ($ver + '.md')
```
Expected: each of the two commands hits exactly 1 place (1 section title line / 1 detail file); if either comes back empty, the three-way alignment does not line up — fill the gap before going on.

**Tagging (the agent performs it inside the release flow: after the commit is green and the first two three-way alignment checks pass) [disambiguated]**

```powershell
$ver = 'v0.4.0'                      # the same number as the step above
$topic = '0.4.0 rename the export interface parameter'   # the version topic, one sentence
git tag -a $ver -m $topic
git tag -l $ver
git push origin $ver
```
Expected: `git tag -l $ver` echoes 1 line `v0.4.0`; the push output contains `[new tag]`.
- Use an annotated tag (`-a`); **a released tag must never be moved or deleted** — `git tag -f` is forbidden, and so is `git push origin --delete`.
- When the tag landed in the wrong place: tag a new number (e.g. `v0.4.1`) instead, leaving the old tag untouched; a tag already pushed cannot change the copy other people hold.

**The single source of truth for the version number**
- The `version` field of the root manifest file is the single source of truth: a Node project = the `version` in `package.json`; a Python project = `project.version` in `pyproject.toml`.
```powershell
(Get-Content -Path package.json -Raw | ConvertFrom-Json).version
```
Expected: the number printed is identical to `$num`; if it differs, the version number has a second copy — merge it into one place first.
- If the health check returns a version number, read that field (or a constant generated from it); never hard-code another copy in the response.
- `.tool-versions` pins toolchain versions (which node / python / pnpm is installed) and has **nothing to do** with the product version: changing it is not a version bump, and it is never used as the source of the version number.

**Prohibitions:**
- Bumping the version number without appending that one line to the unreleased section is forbidden (the version number and the CHANGELOG change in the same batch)
- A formal section title carrying a v is forbidden (the convention is above)
- Moving or deleting a released tag is forbidden (neither `git tag -f` nor a remote delete)
- A lightweight tag is forbidden (`git tag $ver` without `-a`)
- Declaring 1.0.0 on your own while bypassing the promotion criteria is forbidden (the user makes the verdict)

---

## ③ Evidence receipt

1. The version-bump judgment: which row of the version-bump decision table this change falls on + the version number from which to which
2. The unreleased line text, or the formal section title text, from `CHANGELOG.md` (verbatim)
3. Three-way alignment: the real output of the two check commands + what `git tag -l $ver` echoed
4. The four lines of "upgrade notes" verbatim (mandatory for a breaking change; write "not applicable" when it is not breaking)
5. The `docs/versions/vX.Y.Z.md` path + the tag name + the `git push origin $ver` output verbatim
6. The `powershell -NoProfile -File check.ps1` output + exit code (must be 0)

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for a 0 → only after it is green, tag and push.**

Update STATE.md: add one line to `最近完成` (date + version number + commit hash); anything awaiting a version-number verdict goes into `未决问题` with a recommended number; `下一步` = 5-2 Release (when this round deploys) or awaiting a new intent. A tier-S purely internal change = append the one unreleased line and stop there; tier L or shipping to others = run all of §② (tagging included).

Then commit and re-run (`$ver` / `$num` reuse the assignments from §②):
```powershell
$detail = 'docs/versions/' + $ver + '.md'
git add STATE.md CHANGELOG.md $detail
git commit -m "5-6 docs(version): $ver 版本与变更日志"
powershell -NoProfile -File check.ps1
```
Expected: exit code 0, with a final line shaped like 「全部通过（退出码 0）：完成声明成立。」; anything other than 0 = stop and fix, and do not tag.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
