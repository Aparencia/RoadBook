# Card 7-6 · Internationalization and accessibility (required for multi-language / accessibility requirements)
> Trigger: a second language must be supported / accessibility requirements exist / public launch ｜ Output: docs/I18N.md + the accessibility annotation in the "影响面" (impact surface) column of docs/registry/COMPONENTS.md ｜ Next: 4-1 Batch coding / 7-1 UI change
> Process area: DES, QA

---

## ① Start confirmation

1. **Plain-language restatement and landing point**: which screens must support which languages, and which accessibility line must be met (default body text contrast ≥4.5:1); output = `docs/I18N.md` + the accessibility annotation in the "影响面" column of `docs/registry/COMPONENTS.md` for each affected screen; next card = 4-1 Batch coding.
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "all UI strings live in the frontend source, there is no HTML assembled by the backend"), and note the verification method for each; anything that can be looked up from package.json / docs/ARCHITECTURE.md must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: the default three questions — which languages and regions must be supported (including the date, currency and time zone definitions)? Is the accessibility target WCAG 2.1 AA (body text contrast ≥4.5:1, touch target ≥44px)? With limited time, externalize the strings first or fix accessibility first? If there are none, write "none".
4. **Quote the checklist verbatim** (paste the "four i18n/a11y checks" from §② of this card word for word):
   - [ ] Strings externalized: the hard-coded UI string scan under src returns zero hits (whitelisted lines have their reason registered)
   - [ ] The language and locale table has all 5 rows and 4 columns (5 rows = language / date / number / currency / time zone; 4 columns = item / Chinese / second language / convention), every cell with a checkable example
   - [ ] Each of the seven accessibility items has a verification method and a measured result; items not yet met are registered with a due date
   - [ ] The "影响面" column of the affected screens has been written back with the accessibility annotation in the same batch
5. **Boundary statement**: language priority and the accessibility target line are decided by the user; the agent only produces the checklist, the measured evidence and a draft of the changes.

---

## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do the missing work this card requires)**

| You may think | Reality |
| :-- | :-- |
| Let us do Chinese first, the second language can come later | Every extra hard-coded string is one more string to externalize later; the criterion of this card is "zero scan hits" |
| The colours are roughly readable, no need to measure the contrast | Contrast is a checkable number (body text ≥4.5:1); "it looks fine" is not evidence |
| axe reports 0 errors, so the target is met | A machine cannot scan keyboard order, lost focus, or misuse of semantic tags; three of the seven items must be walked through by a human |
| Leave the items not yet met blank, fill them in when there is time | Blank = fails; they must be written into the "not yet met" table of `docs/I18N.md` (with due date and owner) |

**Checklist of this card (the four i18n/a11y checks, tick item by item):**
- [ ] Strings externalized: the hard-coded UI string scan under src returns zero hits (whitelisted lines have their reason registered)
- [ ] The language and locale table has all 5 rows and 4 columns (5 rows = language / date / number / currency / time zone; 4 columns = item / Chinese / second language / convention), every cell with a checkable example
- [ ] Each of the seven accessibility items has a verification method and a measured result; items not yet met are registered with a due date
- [ ] The "影响面" column of the affected screens has been written back with the accessibility annotation in the same batch

**Action 1: externalize strings (hard-coded UI strings are forbidden)**
```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '[\u4e00-\u9fa5]' | Where-Object { $_.Path -notmatch 'locales|i18n' } | Select-Object Path, LineNumber
```
(Note: on PowerShell 5.1 `-Recurse` is not a valid parameter of `Select-String`; only the pipeline form above runs)
- Handle every hit line by line: move it into the language pack (`locales/zh-CN.json` and so on) and change the component to look up the key; what truly must not be externalized (regular expressions, logs) goes on the whitelist with the reason noted.
- ❌ Counter-example: `<button>保存</button>` ("Save" written hard-coded into the component)
- ✅ Good example: `<button>{{ t('common.save') }}</button>` + `"common.save": "保存"` in `locales/zh-CN.json`

**Action 2: language and locale table (4 columns, 5 rows, written into docs/I18N.md)**

| Item | Chinese (zh-CN) | Second-language example (en-US) | Definition |
| :-- | :-- | :-- | :-- |
| UI language | 中文 | English | Follows the system by default, can be switched manually |
| Date | 2026-10-03 | Oct 3, 2026 | Always formatted by the language pack, manual assembly is forbidden |
| Number | 1,234.56 | 1,234.56 | Thousands separator and decimal separator follow the locale, never hard-coded |
| Currency | ¥1,234.56 | $1,234.56 | An amount must carry its currency code (CNY/USD), never guess from the symbol |
| Time zone | displayed as UTC+8 | displayed in the user's time zone | Always stored as UTC, converted for display |

**Action 3: three classic traps (give ❌/✅ for each)**
1. Plurals:
   ❌ `count + ' items'` (English will produce "1 items")
   ✅ `t('items', { count })` + the language pack branches on `one/other`
2. Time zones:
   ❌ storing local time directly (`DateTime.Now` / `new Date()`), which is one day off when viewed from another time zone
   ✅ store UTC, convert to the user's time zone for display; state explicitly that cross-day statistics use UTC as the definition
3. String concatenation:
   ❌ `'删除 ' + name + ' 吗？'` ("Delete " + name + "?") — word order differs per language, so the translation will always be wrong
   ✅ a whole-sentence template `t('confirm.delete', { name })`

**Action 4: the seven accessibility items (each with a verification method)**

| Item | Criterion | Verification method |
| :-- | :-- | :-- |
| Keyboard reachable | Tab reaches every interactive element, focus is never lost | Walk the main path with the keyboard only (Tab / Shift+Tab / Enter / Esc) and record where it gets stuck |
| Contrast | body text ≥4.5:1, large text ≥3:1 | Check the foreground and background color values with the browser F12 color picker, or scan with axe DevTools |
| Semantic tags | use button/nav/main/h1~h3, never a div pretending to be one | Look at the tag names in F12; a `<div onclick` hit fails |
| Image alternative text | meaningful images have alt, decorative images use `alt=""` | `Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '<img'` then check alt line by line |
| Visible focus | the focused state has a visible style (outline or border) | `Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'outline:\s*none'`; then eyeball the focus ring with Tab |
| Form labels | every input has a label or aria-label | F12 or an axe scan; check `<input` line by line |
| Touch target | the tappable area is ≥44×44 px | Measure the element box size in F12; if it is too small, add padding or min-height in the CSS |

**Action 5: write the accessibility annotation into the registry's "影响面" column**
- The "影响面" column of `docs/registry/COMPONENTS.md` is defined to carry four kinds of annotation: impact surface / performance / security and privacy / **accessibility** (see the "两列怎么写" (how to write the two columns) section at the bottom of that file).
- Update the affected screens line by line: add the accessibility annotation (for example `Tab 走查：全部控件可达且焦点可见` ("Tab walkthrough: all controls reachable and focus visible"); when not applicable write `N/A（纯文本）`), and set "最近确认" to today.
- ❌ Counter-example: changing the screens without writing back to the registry (next time nobody knows which screens are affected)
- ✅ Good example: the "影响面" cell goes from "首页也引用" ("also referenced by the home page") to "首页也引用；可访问性：Tab 走查全部控件可达、焦点可见" ("also referenced by the home page; accessibility: Tab walkthrough — all controls reachable, focus visible")

**Action 6: write `docs/I18N.md`**
Six sections: supported languages and locale table / string-externalization whitelist / where the three traps land in this project / measured results of the seven accessibility items / items not yet met and their due dates / the process for new strings (a new string must enter the language pack first).

**Action 7: the three accessibility measurement commands (run at the project root; start the local service first, change the port to the real one)**
```powershell
npx --yes @axe-core/cli http://localhost:3000 --exit
npx --yes pa11y http://localhost:3000 --standard WCAG2AA
npx --yes lhci autorun --only-categories=accessibility --collect.url=http://localhost:3000
```
- Criteria: axe exit code 0 (zero violations) / pa11y exit code ≤1 with every error registered / lighthouse accessibility score ≥90.
- Paste the complete output of the three commands into receipt ③; write every failing item into the "not yet met" table of `docs/I18N.md` (with due date and owner).
- ❌ Counter-example: pasting a screenshot saying "looks fine" (no command output = no evidence)
- ✅ Good example: paste the `0 violations` line from axe + the `0 errors` line from pa11y + the lighthouse score line

**Prohibitions (violating any one of them = this round's output is void):**
- Adding new hard-coded UI strings is forbidden (a scan hit without a whitelisted reason fails)
- Assembling sentences by string concatenation is forbidden, and assuming "Chinese only" is forbidden
- `outline: none` without an alternative focus style is forbidden
- Changing the code without writing back the registry's "影响面" column is forbidden
- Leaving an unmet accessibility item blank is forbidden: write it into the "not yet met" table in docs/I18N.md (with due date and owner)
- Pasting a screenshot without the command output is forbidden (of the three accessibility commands, at least axe and pa11y must be run)
- Announcing that this card is complete while an unmet item still says "待补" is forbidden

---

## ③ Evidence receipt

Give, item by item:
1. The real output of the hard-coded string scan command (zero hits, or the whitelisted lines + reasons)
2. `docs/I18N.md` path + the number of rows in the language and locale table + the measured results of the seven accessibility items (including items not yet met)
3. The registry write-back lines (before → after)
4. The user's verdict on "language priority / accessibility target line", quoted
5. The complete output of the three commands of Action 7 (the axe violations count line + the pa11y errors count line + the lighthouse accessibility score line)
6. The "not yet met" table verbatim (with due date and owner; write "none" if there is none)

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `当前任务` kept (code changes) or cleared (UI string adjustments only)
- `下一步` = 4-1 Batch coding (code changes) / 7-1 UI change (UI elements only)
- `未决问题` = the accessibility items not yet met and their due dates (item by item)
- `工作树状态` = 干净

```powershell
git add STATE.md docs/I18N.md docs/registry/COMPONENTS.md
git commit -m "7-6 docs(i18n): 文案外置与可访问性清单"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; non-zero → stop and ask the user; announcing that this card is complete is forbidden.

**Next card**: 4-1 Batch coding (code changes) / 7-1 UI change (UI elements only). When the second language goes public, check 7-5 Compliance and privacy in the same batch; touching the authentication system → stop and ask the user, and raise the tier.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
