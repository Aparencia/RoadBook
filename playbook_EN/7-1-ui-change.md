# Card 7-1 · UI change
> Trigger: changing interface elements (button / text / style / layout) ｜ Output: code + registry write-back ｜ Next: 5-1 Archive (tier S: visual inspection + check is enough, 4-3 simplified)
> Process area: DES, IMP

---

## ① Start confirmation

1. **Element localization receipt**: translate the user's plain-language description into "which page / which element", using the ❌✅ standard to help the user say it clearly:
   ❌ Counter-example: "that thing on the home page does not look good" (the agent cannot localize it; must ask follow-up questions)
   ✅ Good example: "the search button at the top of the home page, white background, rounded corners, text Search → I want to change it to an icon + text"
2. **Assumptions list**: the 3~5 default assumptions you made on the user's behalf (e.g. "this is a shared component", "only the style changes, the layout does not"), each noting how it will be verified.
3. **Clarifying questions (≤5, save any that can be saved)**: the default three questions — how far should the change go (text only, or the style as well)? Should the other pages affected by the shared component be changed too? Should a screenshot be kept as a record? Anything findable in the registry and the code must not be asked of the human.
4. **Check `docs/registry/COMPONENTS.md`**: use the "plain-language identifier" column to find the target component, and put the row found (or "not found; will reverse-map") in the receipt.
5. **Read the three UI criteria first (required before changing any UI)**: `docs/UI.md` component specs (size / state / spacing) → token names in `docs/DESIGN_TOKENS.md` (colors and font sizes must reference tokens, never hard-coded values) → the motion option table in `docs/MOTION.md` (duration / easing chosen from the table). Name in the receipt whichever one this change touches.
6. **Quote the checklist verbatim** (paste the "four steps of a UI change" from §② of this card word for word).
7. And declare: the output landing point = code changes + the write-back row in `docs/registry/COMPONENTS.md`; the next card is 5-1 (Archive).

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do the missing work this card requires)**

| You may think | Reality |
| :-- | :-- |
| It is just one colour, no need to check the token | A hard-coded colour = a second design system; once changed, a token of the same name must be findable in `docs/DESIGN_TOKENS.md` |
| I may as well unify the radius / font along the way | Changing something along the way = out of scope; touch only the elements in SCOPE, open a separate card for any other change |
| This interface has long deserved a new style | Swapping the design system is an L-tier project (3-4 / 3-5 / 3-6), not 7-1 |

**Four steps of a UI change:**

**Step 1 Locate the component**
- In the registry → use the file and the search term directly.
- Not in the registry → try the reverse-mapping paths in order:
  1. Browser F12 → select the element → look at class/id/component root element name
  2. Framework devtools component tree → component name (tell the user how to open it: F12 → Components/Vue panel)
  3. Search the whole repository for the UI text:
```powershell
$text = 'Search'        # the text on the interface; try them one by one
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $text | Select-Object Path, LineNumber, Line
```
Expected: this repo has no `src/`, so the pipeline yields **nothing at all and `$null`** (measured: the `-Recurse -File` form does not even print 「找不到路径…因为该路径不存在。」; only dropping `-Recurse` surfaces that line) ⇒ empty output may mean "no hit" *or* "no such directory" — settle it with `Test-Path src` first; on a hit each line has the shape `<file path>:<line number>:<full line text>`, and the extra `Select-Object Path, LineNumber, Line` renders it as a three-column table (`Path` is absolute).
   - ❌ Counter-example: `grep -rn "<界面上的文字>" src` (a bash-only command + a placeholder; it errors out directly on Windows)
   - ✅ Good example: the `Get-ChildItem -Path src -Recurse -File | Select-String -Pattern $text` above (measured on PowerShell 5.1: 2 hits — `SearchBox.tsx:1 export function SearchBox() {` and `SearchBox.tsx:2   return <input placeholder="Search" aria-label="Search" />;`)
   - (Note: on PowerShell 5.1 `-Recurse` is not a valid parameter of `Select-String`; only the pipeline form above runs, and the wrong form fails with "找不到与参数名称"Recurse"匹配的参数" [no parameter matches the name "Recurse"])
- **Create the registry row as soon as localization succeeds** (found in 3 seconds next time), even if this card does not change that component.

**Step 2 Confirm the pre-change state**
- Describe "how it looks now" in words or a screenshot + the affected surface (the "affected surface" column of the registry: who else references it, whether a style change will change two places at once).
- Act after the user confirms. Changing the appearance of a shared component = affecting multiple pages; this must be stated explicitly.

**Step 3 The change**
- Obey the constitution's "no parallel creation": if the problem can be solved with an existing component's property / variant, do not create a new one.
- Land the change on the three criteria from §① item 5: colors/spacing reference token names from `docs/DESIGN_TOKENS.md`, motion is chosen from the option table in `docs/MOTION.md`, and component specs align with `docs/UI.md`; if a new token or a new motion is needed → stop and go back to 3-5 / 3-6 for scoping.
- The commit action goes in §④ (write back state first, then commit); this step only prepares the changes and the registry row, and confirms that no other component was changed along the way.

**Step 4 Write-back and acceptance**
- **Re-run the three UI self-checks**: once the change has landed, run the command below; every hit must be either a token definition itself or already written as `var(--…)`; a hard-coded value appearing = stop and go back to 3-5 / 3-6 to add the token.
```powershell
$changed = git diff --name-only HEAD~1..HEAD
$pat = '#[0-9a-fA-F]{3,8}\b','font-family\s*:','border-radius\s*:','box-shadow\s*:'
$hit = Select-String -Path $changed -Pattern $pat -ErrorAction SilentlyContinue
$hit | Select-Object Path, LineNumber, Line
"命中 $($hit.Count) 处"
```
Expected: measured here against the previous commit (4 files) it prints **1 hit** at `docs/TECH_DEBT.md:23` and the last line `命中 1 处` — the hit is one of the **four colour values quoted in prose about tokens** (`#8a8a8a` / `#3b82f6` / `#0000000a` / `#ffffff0f`), neither a token definition nor a `var(--…)` reference ⇒ judge by "hits = explained hits", giving a reason per hit, and never read `命中 1 处` as automatically red; when `$changed` is empty (nothing changed in this commit / `HEAD~1` does not exist) `Select-String` first raises `无法将参数绑定到参数"Path"，因为该参数为空数组。` and still prints `命中 0 处` (`$null.Count` = 0) — tell the two apart instead of reading "not checked" as "clean".
  Verdict: hit count = explained count (a token definition site / already changed to `var(--…)`) means pass; any unexplained hit = this card is not complete.
- **One single system**: one interface allows only one radius set, one shadow level, one icon library, and ≤3 font families (see `docs/DESIGN_TOKENS.md` and `docs/UI.md`).
- **Write back the registry**: if the program name changed, change the row; if the affected surface changed, update the column; fill "most recent confirmation" with today.
- Give the acceptance description: "open which page → what should be seen" (one line).

**Prohibitions:**
- Changing only the code without writing back the registry is forbidden (otherwise next time it is the same cycle of "where is that thing")
- Changing a shared component without reporting the affected pages is forbidden
- Introducing a new UI library / design system is forbidden (that is an L-tier project)
- Writing hard-coded colours / font sizes / radii / shadows / durations inside a component is forbidden (always reference token names)
- Introducing a second radius set / shadow level / icon library / font family is forbidden
- Skipping the three UI self-checks of Step 4 is forbidden (not having run them = this card is not complete)

---

## ③ Evidence receipt

1. Localization process: the registry hit row / the reverse-mapping path and its result
2. Commit hash + changed files
3. Registry write-back row (before → after)
4. Acceptance description in one line
5. The Step 4 self-check command verbatim + the "命中 N 处" line + the verdict for each hit (a token definition / already changed to `var(--…)`)
6. The list of affected pages (required when a shared component changed; write "none" when not applicable)

---

## ④ State write-back

**Iron order: write back state first → then commit → then re-run check.ps1 and get 0.**

First write back the registry and STATE.md:
- `docs/registry/COMPONENTS.md`: if the program name changed, change the row; if the affected surface changed, update the column; fill "most recent confirmation" with today
- STATE.md: `当前任务` cleared (a small tier S change) or kept; `下一步` = 5-1 Archive
- ❌ Counter-example: committing the code changes without writing back the registry (otherwise next time it is the same cycle of "where is that thing")
- ✅ Good example: the registry row and the code changes go into the same commit, and the receipt pastes the two "before → after" lines

Then commit and re-run:
```powershell
$page = 'home'; $what = 'search-button'
git add STATE.md docs/registry/COMPONENTS.md src/components/SearchBox.tsx
git commit -m "7-1 style($page): $what 改为图标加文字"
powershell -NoProfile -File check.ps1
```
Expected: `git add` takes this explicit list (`src/components/SearchBox.tsx` is a sample path; this repo has no `src/`, so copying it verbatim gives `fatal: pathspec '...' did not match any files` with exit code 128); `git commit` exits 0 with the message exactly `7-1 style(<page>): <element> 改为图标加文字`; `check.ps1` ends with `全部通过（退出码 0）：完成声明成立。` and exits 0 (non-zero = stop, do not declare it done).
(The acceptance description of §③ is written as "open which page → what should be seen"; ask the user for a visual inspection and confirmation before proceeding to 5-1 Archive.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
