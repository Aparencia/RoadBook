# Card 3-4 · UI and Interaction Design (required before building any UI)
> Trigger: UI work starts after scope is confirmed | Output: docs/UI.md | Next: 3-5 Color and Style
> Process area: DES

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — who uses this screen, which steps they walk, what counts as success.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume desktop browsers only; if wrong, the 3-breakpoint layout must be redone). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only what decides layout — which device is primary (phone or desktop)? What must the user see first on one screen? Is there an existing screen we must copy?
4. **This card's checklist, quoted verbatim at start (these twelve items) and ticked one by one before finishing**:
   - [ ] ① Screen list with all eight fields: goal / entry / exit / dependency per screen
   - [ ] ② All eight states have a criterion and a drawn form: empty / loading / error / success / no-permission / offline / overlong text / extreme value
   - [ ] ③ Component selection table by hierarchy: four button levels, inputs, navigation, feedback
   - [ ] ④ Button spec table: heights 32/40/48, radius 4/8/12, icon slot 16/20, padding 8/12/16, disabled and loading states
   - [ ] ⑤ Form rules: label on top, validate on blur plus submit, error below the field, required marker
   - [ ] ⑥ Three breakpoints: ≤640 / 641–1024 / ≥1025, each with column count and primary-action position
   - [ ] ⑦ Microcopy: buttons start with a verb; errors state what happened + why + what to do, 2 examples each
   - [ ] ⑧ Keyboard and focus: Tab order, Esc, Enter behaviour written down
   - [ ] ⑨ All five interaction states present (default / hover / `:focus-visible` / `:active` / disabled) + a focus ring with `outline: 2px solid` + `outline-offset`, appearing instantly
   - [ ] ⑩ Four responsive widths (320 / 375 / 414 / 768): no horizontal scroll, clickable text never wraps, full height uses `dvh`
   - [ ] ⑪ Page discipline: layout-family quota, centering needs a reason, one theme and one primary CTA per page, no three-equal-column cards and no split section header
   - [ ] ⑫ Anti-AI-slop: no invented numbers or placeholder brand words, em-dash count 0, no fake UI chrome and no unmotivated decoration
5. **Landing declaration**: output = `docs/UI.md`; next card = 3-5 Color and Style.

---

## ② Execution

**Rationalization red-flag table (read every row aloud at start; hitting any one = stop and do the missing work on this card)**

| You may think | Reality |
| :-- | :-- |
| I walked through the eight states in my head | The eight states do not exist until they are written into `docs/UI.md`; Action 13 counts the unticked rows and exits 1 |
| A `box-shadow` focus ring is just as good | `box-shadow` is clipped by `overflow` and invisible in forced-colors mode; this card accepts `outline` + `outline-offset` only |
| Responsiveness can wait until the page is written | 320 / 375 / 414 / 768 are design-time criteria; horizontal scroll discovered after release = this card is not finished |
| The copy is just something I typed, it does not count as design | Invented numbers, placeholder brand words and fake UI chrome are all caught by Action 12 |

**Action 1: Screen list (one row per screen before building it; all four columns required)**
Columns = Screen | Goal (one sentence) | Entry | Exit / dependency; e.g. Task list | Let the user find last session's task within 3 seconds | Home primary button | Row click → detail; depends on the list endpoint

**Action 2: Eight-state matrix (walk every list / form / detail; every row must carry an S1–S8 ID, which the template `docs/UI.md` already does; IDs are for self-check reference only)**
Columns = ID | State | Criterion (when it is this state) | How to draw it; S1 | Empty | Request succeeded with 0 rows | All three parts are required: a small icon or illustration + one sentence on why it is empty + one repair action; showing a bare "no data" with no context is banned
S2 | Loading | Between request and response | A predictable shape (list / card / table) uses a skeleton, a round spinner is banned; a partial action swaps a spinner into the button and replaces the label (never adds it side by side); show only after 1 s
S3 | Error | Request failed or validation failed | What happened + why + what to do, plus a retry button
S4 | Success | Write call returned success | In-place feedback (3 s Toast or inline tick); never a full-screen popup
S5 | No permission | 401/403 returned | Say which permission is missing and who grants it; never a blank page
S6 | Offline | `navigator.onLine` is false | Top bar notice + disable writes + keep read-only cache
S7 | Overlong text | One field over 200 characters, or an unbroken long string | Truncate to 2 lines + tooltip for the full text; force-wrap long strings
S8 | Extreme value | 0, negative, over 1亿, empty array | Define the display rule first (e.g. ≥1万 shows as 1.2万) [disambiguated: 亿 = a hundred million, 万 = ten thousand]; nothing may overflow its box

❌ Counter-example: only the state with data was drawn, or the eight states are dismissed with "designed / checked", so the empty table and the 500 error are seen for the first time in production
✅ Good example: each of the eight states gets its 3 manual reproduction steps written out (e.g. F12 → Application → Local Storage → change drink.water.v1 to 999 → reload), plus the reproduction result (real command output or file path); screenshots/recording are optional supporting evidence at tier L only

**Action 3: Component selection table (choose by hierarchy, not by taste)**
Columns = Category | Options | When to choose it; **Button** primary / secondary / tertiary / danger → at most 1 primary per screen; secondary for lesser actions; tertiary for in-table actions; danger for irreversible ones such as delete, always with a confirm step | **Input** text box / number box / date picker / radio / checkbox / switch / file upload → ≤5 options → radio; >5 → dropdown; binary and instantly applied → switch; everything else → text box | **Navigation** top bar / side bar / breadcrumb / tabs / pagination / search box → ≤7 top-level items → top bar; depth >2 → add breadcrumb; >50 rows → add pagination | **Feedback** inline note / Toast / alert bar / field error → field-level errors go under the field; global results use a 3 s Toast; anything that must persist uses an alert bar

**Action 4: Button spec table (three tiers, copy straight into style variables; the output keeps three table rows written as `| Small | 32 | 4 | 16 | 8 | In-table rows, toolbars |`, which Action 13 counts)**
Columns = Tier | Height | Radius | Icon slot | Padding | Use case; Small | 32 | 4 | 16 | 8 | In-table rows, toolbars; Medium | 40 | 8 | 20 | 12 | Form primary buttons (default tier); Large | 48 | 12 | 20 | 16 | Mobile primary action, onboarding
Disabled: opacity 0.4 on the whole button, `cursor: not-allowed`, no click response. Loading: spinner inside the button, label switched to the progressive form (e.g. Save → Saving), width must not jump.
❌ Counter-example: the button narrows while loading and shoves its neighbours sideways
✅ Good example: `min-width` is locked to the current width, and only the content and spinner change

**Action 5: Form rules (five, settled)**: 1. Label on top (never use placeholder as the label); 2. Required fields get `*` and the form top states `* 为必填` [disambiguated: 为必填 = means required]; 3. Validation timing = blur + submit (no error while typing); 4. Error position = directly below the field, tight against the input; 5. Error copy may never be just "invalid input".

**Action 6: Responsive breakpoints (three tiers, mobile first)**
Columns = Breakpoint | Layout | Primary action; ≤640 | Single column; navigation collapses into a hamburger menu | Full-width button fixed at the bottom; 641–1024 | Two columns; side bar collapses | Button fixed to the right of the form area; ≥1025 | Three columns; side bar always visible | Top-right button plus a keyboard shortcut
≥1440 px may add one optional wide tier: content max width 1440 px, horizontally centered, whitespace scaled up proportionally (optional tier, not mandatory). A breakpoint is where the content starts to break, not a device model: the breakpoint numbers are fixed to the three tiers above, but each tier's column count is filled in from measuring the content.

**Action 7: Microcopy templates (copy these shapes)**
Buttons start with a verb: ❌ `OK` / ✅ `Save task`; ❌ `Submit` / ✅ `Publish to production` | Errors = what happened + why + what to do: ❌ `Operation failed` (the user cannot act on this); ✅ `Save failed: the network dropped (2 retries already). Reconnect and click "Retry".`; ✅ `Email format is wrong: the @ sign is missing. Example: name@example.com.` | Empty state = one sentence plus one action: `No tasks yet. Click "New task" in the top right to start.`

**Action 8: Keyboard and focus order**: 1. Tab order = visual top-to-bottom, left-to-right; DOM order must match visual order (positive `tabindex` is banned) | 2. Esc: close the current overlay and return focus to the element that opened it | 3. Enter: never submits a form (submission belongs to the button only); in a search box it runs the query.

**Action 9: The five interaction states and the focus ring (go element by element through every interactive element)**
1. All five states are present: default / hover / `:focus-visible` / `:active` / disabled — one missing = fail; the disabled state gives all three channels at once: opacity 0.4–0.5 on the whole block + `cursor: not-allowed` + the native `disabled` (or `aria-disabled="true"`); the disabled state may never stand in for loading | 2. The focus-ring spec is fixed: `outline: 2px solid var(--color-focus); outline-offset: 2px;`; the resting state reserves `outline: 2px solid transparent` against geometric jumps; focus must appear instantly (0 ms, fading in is banned); `border` or `box-shadow` may never impersonate a focus ring | 3. A state switch may not change `border-width` / `padding` / `height`; only background-color, outline, box-shadow and border-color may change
4. Hover rules must be wrapped in `@media (hover: hover)`, and every hover effect needs a focus equivalent (information that appears on hover only is banned) | 5. Touch targets, three measures: a Web pointer target ≥24×24 CSS px (WCAG 2.2 AA); a touch target ≥44×44 pt (iOS) / 48×48 dp (Android); adjacent touch targets ≥8 px apart | 6. An input's height must equal the height of the adjacent button in the same form (both take one of the three tiers 32 / 40 / 48); a 38 px input beside a 44 px button is banned

❌ Counter-example: `:focus { box-shadow: 0 0 0 3px ... }` written inside a card with `overflow: hidden` → half the focus ring is cut off and a keyboard user cannot see where they are
✅ Good example: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px }`, with the focus colour ≥3:1 against both the element background and the page background

**Action 10: Page and layout discipline (settle the layout first, then draw the components)**
1. Layout-family quota: when a main page has ≥8 sections, at least 4 different layout families must appear, and the same layout family may appear at most once on the whole page; consecutive "image left / text right" or "text left / image right" sections run at most 2 in a row — the 3rd section is a fail | 2. Hero ceiling: desktop top padding ≤6 rem; ≤4 text elements (eyebrow or brand strip, choose one of the two, plus headline, subcopy, CTA); the headline ≤2 lines, the subcopy ≤20 words and ≤4 lines, and the CTA visible without scrolling; a small tagline, trust bar or price teaser below the CTA moves to the next section | 3. Centering needs a reason: at most 2 centered elements on the whole page, every other element breaks the axis (50/50 split, text left / image right, asymmetric whitespace); a default full-page centered stack is banned | 4. One theme per page: a dark page does not sandwich a light section (or the other way round), unless the brief explicitly asks for one scroll-time theme switch; one primary CTA: at most 1 primary per screen, and CTAs with the same intent may carry only one wording on the whole page
5. The default three-equal-column "icon on top, title below" feature card is banned; a bento grid's cell count must equal the number of content items, and at least 2–3 cells must carry a real visual difference (image, brand-colour fill, pattern) | 6. Eyebrow (a small uppercase wide-tracked label above the headline): at most 1 every 3 sections; a section header may never split into "big headline left + small note right" — headline and note must stack vertically (note ≤65ch) | 7. The "AI navbar / footer fingerprint" is banned: wordmark left + 4–5 inline links + a button on the right + a 1 px hairline bottom rule; a footer with four link columns + social icons + copyright + a neutral grey background — unless the page really has only 2 destinations, or it is a genuine docs root

❌ Counter-example: a home page whose three sections are all image-left/text-right + three-equal-column cards + a full-page centered hero
✅ Good example: one page that shows four layout families — split hero, full-bleed image, staggered two columns, timeline; centering is used for the hero headline only

**Action 11: Responsiveness and overflow (look at every page at the four widths)**
1. The four widths are mandatory: 320 / 375 / 414 / 768 CSS px — horizontal scroll at any one = this card is not finished (the four widths are verification widths; breakpoints still follow the three tiers of Action 6) | 2. Mobile first: base styles target the smallest viewport and `min-width` steps up from there; breakpoints sit where the content breaks, not at device models | 3. Continuous change uses `clamp()`, discrete change uses media queries: `h1 { font-size: clamp(2.5rem, 4vw + 1rem, 4.5rem) }` | 4. Against blowout: a grid track that holds an image writes `minmax(0, 1fr)` (a bare `1fr` has a minimum of auto and is blown open by a large image); text children get `overflow-wrap: anywhere; min-width: 0` (a blanket `word-break: break-all` on body text is banned)
5. A full-height block uses `min-height: 100dvh` (`height: 100vh` is banned); at page level write `html, body { overflow-x: clip }` (`clip`, not `hidden`, because `clip` does not break sticky / fixed) | 6. Below 768 px every section must declare its single-column fallback explicitly (width 100%, 1 rem left and right padding); relying on the framework's default behaviour is not allowed | 7. Clickable text never wraps: buttons, navigation, breadcrumbs and tabs stay on one line across the whole 320–1920 px range; the fix is shorter copy first, then `white-space: nowrap` with a shrinkable parent | 8. Full-bleed elements use `env(safe-area-inset-*)`; dialogs and drawers write `overscroll-behavior: contain`

❌ Counter-example: the three-column desktop grid pushes a horizontal scrollbar at 375 px; the CTA copy is squeezed onto two lines
✅ Good example: `grid-template-columns: repeat(auto-fit, minmax(0, 1fr))` + `@media (max-width: 767px) { .grid { grid-template-columns: 1fr } }`

**Action 12: Anti-AI-slop and copy formatting (run the command below before delivery; 0 hits is the pass)**
1. Invented quantified claims are banned: `10x faster`, `trusted by 50,000+ teams`, `99.9% uptime`, `+47% conversion` may never appear; a number may not stand alone as a headline, it must carry one line saying what it means | 2. Placeholder names and startup clichés are banned: Jane Doe / John Smith / Acme / Nexus / Seamless / Unleash / Elevate / Next-Gen | 3. The long-dash count across the whole page must be 0, headlines, body copy, buttons, alt text and captions included; use a comma, a colon or parentheses where a pause is needed | 4. Fake UI chrome is banned: a hand-built fake browser bar, fake phone frame or fake terminal / IDE frame is never allowed; show the product with a real screenshot (`<figure>` + `<picture>`) or drop the frame
5. Plain text may not stand in for minimalism: a minimal page still needs 2–3 real images (key visual + product / scene + supporting image); a logo wall carries real SVG logos only, with no industry tags | 6. Copy formatting: use real curly quotes; an ellipsis is one character (not three dots); a non-breaking space sits between a number and its unit; numeric columns and timers add `font-variant-numeric: tabular-nums`; short multi-line headlines add `text-wrap: balance` | 7. Unmotivated decoration is banned: floating cursors, scan lines, gradient blobs, semantic-free dots, version-number footers, scroll hints, section-number eyebrows.

❌ Counter-example: `Trusted by 50,000+ teams` + a fake MacBook frame + loading copy ending in three dots
✅ Good example: `Saved locally, no network needed.` + a real product screenshot + `Saving…`

```powershell
$ext = @('.html', '.css', '.tsx', '.jsx', '.vue'); $files = @(Get-ChildItem -Recurse -File | Where-Object { $ext -contains $_.Extension -and $_.FullName -notmatch 'node_modules' }); $pat = @([char]0x2014, 'height:\s*100vh', 'outline:\s*none', 'word-break:\s*break-all')
$hit = @(); foreach ($f in $files) { $t = Get-Content $f.FullName -Raw -Encoding UTF8; foreach ($p in $pat) { if ($t -match $p) { $hit += "$($f.Name) :: $p" } } }
"anti-AI-slop and overflow hits $($hit.Count) (must be 0)"; $hit
```

**Action 13: Self-check for this card's output (run from the project root; non-developers only need the exit code: exit 1 = this card is not done. 0 misses, three button tiers, the whole checklist ticked and ≤120 lines all pass)**
Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator); save scripts as UTF-8 with a BOM.
```powershell
$u = 'docs/UI.md'; $l = @(Get-Content $u -Encoding UTF8); $text = $l -join "`n"; "UI.md lines $($l.Count) (must be <= 120)"
$need = @('S1','S2','S3','S4','S5','S6','S7','S8','32','40','48','640','1024','focus ring','320','768','dvh','tabular-nums'); $miss = @(); foreach ($t in $need) { if ($text -notmatch [regex]::Escape($t)) { $miss += $t } }; "state/breakpoint misses $($miss.Count) -> $($miss -join ',') (must be 0)"
$btn = @($l | Where-Object { $_ -match '^\| (小|中|大|sm|md|lg|Small|Medium|Large) \|' }).Count; $todo = @($l | Where-Object { $_ -match '^   - \[ \]' }).Count; "button tier rows $btn (must be 3); unticked checklist rows $todo (must be 0)"
if ($l.Count -gt 120 -or $miss.Count -gt 0 -or $btn -ne 3 -or $todo -gt 0) { Write-Host '[FAIL] card self-check failed'; exit 1 } else { Write-Host '[OK] card self-check passed' }
```

**Prohibitions (any violation voids this round's output):**
- Shipping only a pretty picture: one missing state out of eight = not done | Placeholder used as a form label; errors hidden until after submit
- Icon-only buttons with no copy (a readable label or aria-label is mandatory) | "TBD / to be added later" inside UI.md — if you cannot give a value, write `N/A (reason)`
- `box-shadow` or `border` impersonating the focus ring; a focus ring that fades in; information that only appears on hover | Horizontal scroll or a two-line CTA at any of 320 / 375 / 414 / 768 (the result is written down at design time)
- Invented quantified numbers and placeholder brand words; long dashes on the page must be 0 | Fake UI chrome (fake browser bar / phone frame / terminal frame) and unmotivated decoration

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hash. Give each one: 1. Full path of `docs/UI.md` plus its line count | 2. The eight-state matrix (verbatim criterion and drawing for every one of S1–S8), all eight rows present | 3. Verbatim values of the three button tiers and the three breakpoints
4. 2 error-copy examples and 2 button-copy examples, verbatim | 5. Real output of the Action 13 command (0 misses, button tier rows 3, unticked checklist rows 0, ≤120 lines; exit code 0) | 6. Real output of the Action 12 command (0 anti-AI-slop and overflow hits)
7. The five-state and focus-ring spec verbatim (including the two `outline` lines and the 0 ms statement) + the three touch-target measures verbatim | 8. The four-width responsive verification record (one line each for 320 / 375 / 414 / 768, each line stating the actual result) | 9. This round's commit hash

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/UI.md`) | `未决问题` [disambiguated: open questions] = the layout trade-offs the user has not settled (one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip stakeholder review, write one line of reason | `下一步` [disambiguated: next step] = 3-5 Color and Style

```powershell
$u = 'docs/UI.md'; git add STATE.md $u; git commit -m "3-4 docs(ui): eight-state matrix and button specs"; powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
