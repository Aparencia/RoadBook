# Card 3-5 · Color and Style (fix the values before any UI work)
> Trigger: visual values are fixed after 3-4 locks the screen structure | Output: docs/DESIGN_TOKENS.md | Next: 3-6 Motion and Microinteraction
> Process area: DES

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — who looks at this palette and type scale, which pages it covers, what counts as usable.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume a brand primary already exists; if wrong, the whole primary ramp is replaced and every contrast ratio is recomputed). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only what decides values — is there a brand colour we must keep? Phone or desktop primary? Is dark mode needed? Is there a brand font?
4. **This card's checklist, quoted verbatim at start (recite these thirteen items) and ticked one by one before finishing**:
   - [ ] ① 10 neutral steps 50–900, one hex value each, plus the generation rule
   - [ ] ② Brand primary plus hover/pressed values, three tiers complete
   - [ ] ③ Semantic success/warning/danger/info, light and dark values for each
   - [ ] ④ Contrast gates written down with a runnable command: body ≥4.5:1, large text ≥3:1, UI boundary ≥3:1
   - [ ] ⑤ Type scale 12/14/16/20/24/32/40 with line heights and weights
   - [ ] ⑥ Spacing on a 4px base: 4/8/12/16/24/32/48/64
   - [ ] ⑦ Radius 4/8/12/999, 1px border, three shadow levels, each with a concrete CSS value
   - [ ] ⑧ Naming rule `--color-<semantic>-<level>` plus the light/dark mapping table
   - [ ] ⑨ Colour discipline: 0 raw colour values inside components, one accent only with area ≤3% (hard cap 5%), the 60-30-10 ratio written down
   - [ ] ⑩ Font families ≤3 and nothing on the banned default-font list; one body type-scale ratio picked out of 1.25/1.333/1.5/1.618 and written down
   - [ ] ⑪ Seven named z-index tiers; one shadow level per element; the whole radius set locked and never mixed
   - [ ] ⑫ Dark mode, six rules: background 12–18%, text 92–96%, body weight down 50, accent chroma down and lightness up, elevation +3% per level, hue unchanged
   - [ ] ⑬ Presentation/screen-share where it applies: body ≥18 px, meta ≥14 px, and the output declared to be of the presentation kind
5. **Landing declaration**: output = `docs/DESIGN_TOKENS.md`; next card = 3-6 Motion and Microinteraction.

---
## ② Execution

**Rationalization red-flag table (recite it item by item when starting; any hit = stop and do the missing work this card requires)**

| You may think | Reality |
| :-- | :-- |
| Writing colours straight into components is faster | A raw colour value in a component means the theme cannot be swapped and dark mode is bound to break; this card accepts semantic tokens only |
| Spreading the primary colour over more places looks more consistent | An accent covering more than 5% of any viewport fails outright; an accent is a highlighter, not a colour block |
| Dark mode just turns the colours around | Inversion destroys contrast and hierarchy; dark mode has to be recomputed on six rules (background, weight, chroma, elevation, hue, body colour) |
| Start with Inter and swap the font later | A font on the banned list makes the interface read as a template immediately; the font is a value decision and cannot be left for later |

**Action 1: 10 neutral steps (`--color-neutral-*`; generation rule: 500 is the baseline, each lighter step raises lightness by 6%, each darker step lowers it by 6%, hue and saturation pass the WCAG relative-luminance check, and every step is recorded in the table)**
50 `#F7F8FA` (page background, 1.06:1 against a white card, background only) | 100 `#F1F3F5` (section background, table header) | 200 `#E9ECEF` (divider, zebra striping, 1.19:1 on white) | 300 `#DEE2E6` (default input border, 1.30:1 on white) | 400 `#CED4DA` (input hover border, disabled outline) | 500 `#ADB5BD` (placeholder floor, 2.07:1 on white, decorative elements only) | 600 `#868E96` (secondary icons, disabled text, 3.32:1 on white, only at ≥18px or paired with words) | 700 `#495057` (secondary body text, 8.18:1 on white) | 800 `#343A40` (headings, primary body text, 11.51:1 on white) | 900 `#212529` (highest-emphasis text, dark-mode page background, 15.43:1 on white)

**Action 2: Brand primary, three tiers (`--color-brand-*`; the brand colour is reserved for the one primary action that is clickable right now — at most one full-brand area per screen)**
Primary `#2563EB` (5.17:1 on white; white text on it 5.17:1, both directions pass the body gate) | Hover `#1D4ED8` (6.70:1 on white) | Pressed `#1E40AF` (one step darker than hover, instant feedback only, never a text background)

**Action 3: Four semantic colours (`--color-<semantic>-*`; 700 tier in light mode, 300 tier in dark mode; each entry reads "light text / light fill / dark text (on `#212529`)")**
Success `#15803D` (5.02:1 on white) / `#DCFCE7` / `#4ADE80` (8.85:1) | Warning `#B45309` (5.02:1) / `#FEF3C7` / `#FBBF24` (9.24:1) | Danger `#B91C1C` (6.47:1) / `#FEE2E2` / `#F87171` (5.58:1) | Info `#1D4ED8` (6.70:1) / `#DBEAFE` / `#60A5FA` (6.07:1)
Text inside the fills: `#15803D` on `#DCFCE7` 4.57:1, `#92400E` on `#FEF3C7` 6.37:1, `#B91C1C` on `#FEE2E2` 5.30:1, `#1D4ED8` on `#DBEAFE` 5.49:1.

**Action 4: Contrast gates (WCAG 2.1 AA, fixed; when a value fails, change the value, never the gate)**
- Body text (<18px, or <14px bold) against its background ≥ **4.5:1**; large text (≥18px, or ≥14px bold), icons, key chart marks ≥ **3:1**
- UI boundaries (input border, card border, divider) against the adjacent surface ≥ **3:1**; the generic border value is `#6C757D` (4.69:1 on white, 4.41:1 on step 50, 3.29:1 on the dark background); state must never rely on colour alone, an icon or a word is always present
- ❌ Counter-example: turning the error text red and calling that the message (colour-blind users see nothing)
- ✅ Good example: red text + icon + the words "Save failed", three signals at once
- Placeholder text and helper text fall under the body gate too, ≥ **4.5:1**, and must never sit below body text (placeholder / helper is the class most often let through)
- The focus ring must reach ≥ **3:1** against both the element itself and the page background it sits on; any rule that writes `background` must write `color` in the same rule, otherwise a dark block ends up with same-colour text
- Text on a brand fill must reference the paired `--color-brand-ink` (semantic colours likewise each pair with their own `-ink`), a hard-coded `color: white` is forbidden; a fill/text OKLCH lightness gap <5% together with a chroma gap <0.05 fails outright

**Action 5: A runnable contrast self-check (swap in your own colours; if any row is under the gate, change the colour and rerun)**
Variable names are ASCII only and scripts are saved as UTF-8 with a BOM: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator).
```powershell
function Get-CR($a, $b) { $L = { param($h) $c = @(1,3,5) | ForEach-Object { [Convert]::ToInt32($h.Substring($_,2),16)/255 }; $v = $c | ForEach-Object { if ($_ -le 0.03928) { $_/12.92 } else { [Math]::Pow(($_+0.055)/1.055,2.4) } }; 0.2126*$v[0]+0.7152*$v[1]+0.0722*$v[2] }; $x = & $L $a; $y = & $L $b; [Math]::Round((([Math]::Max($x,$y)+0.05)/([Math]::Min($x,$y)+0.05)),2) }
foreach ($p in @(@('body','#343A40','#FFFFFF'),@('large','#495057','#FFFFFF'),@('bound','#6C757D','#FFFFFF'),@('focus','#2563EB','#FFFFFF'),@('focus','#2563EB','#F7F8FA'),@('place','#6C757D','#FFFFFF'))) { "$($p[0]) $($p[1]) on $($p[2])  " + (Get-CR $p[1] $p[2]) }
```
Verdict: the body/place rows ≥4.5; the large/bound rows ≥3; both focus rows (element background and page background) must be ≥3.

**Action 6: Type scale (`--font-size-*`; Chinese-first font stack: `-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`; body line height 1.5, heading line height 1.25; 45–75 characters per line, capped with `max-width: 65ch`)**
xs 12/1.5/400 (helper text, table footnotes) | sm 14/1.5/400–500 (table body, form labels) | base 16/1.5/400 (default body) | lg 20/1.5/500 (card titles, section titles) | xl 24/1.25/600 (page title h1) | 2xl 32/1.25/600 (marketing headings, big numbers) | 3xl 40/1.25/700 (first-screen headline, at most one per page)

**Action 7: Spacing and layout (`--space-*`, 4px base, only these eight values)**
`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Adjacent text blocks 4–8, card padding 16–24, between cards 24–32, between page sections 48–64. ❌ Counter-example: hand-written values such as `margin: 13px`, `padding: 5px` | ✅ Good example: always `var(--space-3)` (which is 12)

**Action 8: Radius, border, shadow (`--radius-*` / `--shadow-*`; radius `4` inputs / `8` cards and medium buttons / `12` overlays and large buttons / `999` avatars and pill labels; one border style everywhere `1px solid var(--color-neutral-300)`; focus uses `outline: 2px solid var(--color-focus); outline-offset: 2px`, and faking the focus ring with a `box-shadow` glow is forbidden)**
```css
--shadow-1: 0 1px 2px rgba(33, 37, 41, .08); --shadow-2: 0 2px 8px rgba(33, 37, 41, .12); --shadow-3: 0 8px 24px rgba(33, 37, 41, .16);
```
One shadow level per element, stacking two is forbidden; on a light background pure-black shadows and coloured glows are forbidden, and elevation on dark surfaces uses a lightness difference instead of shadow. Pick one radius set and lock it page-wide (the 4/8/12/999 above is one set); mixing means writing it up as an explicit rule in the document.

**Action 9: Colour token discipline (only token names may appear inside components)**
1. Name by role, not by appearance: `--color-brand` / `--color-accent` / `--color-bg-page` / `--color-bg-surface` / `--color-text-primary` / `--color-border` / `--color-focus` / `--color-<semantic>` / `--color-<semantic>-ink`; tokens such as `--blue-500` that write the appearance into the name are forbidden. | 2. 0 colour literals in component styles: `#hex`, `oklch()`, `rgb()`, `hsl()` are allowed only inside the `:root` and `[data-theme="dark"]` theme blocks. | 3. Same for font families: any `font-family` must reference a `--font-*` token.
4. One accent: at most 2 accents per interface, and the primary accent covers ≤3% of the area of any viewport (hard cap 5%); the accent is used as a highlighter (active state, focus ring, hover underline, primary CTA border or text), never filling a large button and never colouring a whole section. | 5. 60-30-10: neutral background 60%, secondary surfaces and text 30%, accent within 10%; write the ratio into `docs/DESIGN_TOKENS.md`.
6. Banned: pure `#000000` and pure `#ffffff` as base colours; three-stop gradients (two stops only); purple→blue / teal→magenta gradients; gradient text (including `background-clip: text`); `#6366f1` and the purple-blue pairing; pure-black shadows and coloured glows on a light background. | 7. Under OKLCH, neutrals take chroma 0.005–0.015 shifted toward the anchor hue (a flat grey at zero chroma is an AI tell); when the toolchain does not support OKLCH, use hex but keep the same hue-shift rule and note it in the table.

❌ Counter-example: `background: linear-gradient(135deg, #6366f1, #8b5cf6)` covering the whole hero, plus `color: #333` inside a component | ✅ Good example: `background: var(--color-bg-page)`; the accent is used only on the active nav item and the focus ring, 2% of the screen area

**Action 10: Font families and typography discipline**
1. Font families ≤3: display + body + at most 1 outlier; the outlier appears ≤2 times page-wide and carries exactly one role (e.g. wordmark + first-screen number). | 2. Banned as display fonts: Inter, Roboto, Open Sans, Lato, Poppins, Montserrat, DM Sans, system-ui, Arial, Helvetica, Merriweather, Lora, Courier New, Consolas. Inter is allowed only when the user explicitly asks for a neutral style or public-sector accessibility comes first; by default switch to Geist / Outfit / Cabinet Grotesk / Satoshi. | 3. Pick one body type-scale ratio out of 1.25 / 1.333 / 1.5 / 1.618 and write it into a token (default 1.25); mixing two ratios is forbidden.
4. Line height follows size: display 1.05–1.2 (1.0–1.1 is allowed for a tight first-screen fit), body 1.5–1.65; an all-caps display heading has a line-height floor of 1.0. | 5. Display size caps at 88 px (96 px for a heavy theme), and a single-line word of ≤12 characters may reach 112 px; body text minimum 16 px (below 16 px mobile browsers auto-zoom input fields).
6. Headings must be roman: any heading/display set in italic fails outright (including `<em>` / `<i>` inside a heading); italic is allowed only for inline emphasis in body text. | 7. Measure 45–75 characters (`max-width: 65ch`), Chinese capped at 30–40 characters per line; mobile body text 35–60 characters.

**Action 11: Layers and z-index (seven named tiers; no casual 9999)**
`--z-base: 1` (regular content) | `--z-raised: 10` (raised cards, the layer under sticky elements) | `--z-dropdown: 100` (dropdowns, menus, popovers) | `--z-sticky: 200` (sticky navigation, toolbars) | `--z-modal: 400` (modals and their scrim) | `--z-toast: 500` (global toasts) | `--z-tooltip: 600` (tooltips)

**Action 12: Dark mode, six rules (two value sets, not an inversion)**
1. Background: `--color-bg-page` at 12–18% lightness (never pure black); the surface layer `--color-bg-surface` starts +3% and every elevation level adds about +3%. | 2. Text: body and headings at 92–96% lightness (never pure white). | 3. Weight: body text drops 50 units against light mode (400 → 350) so bright glyphs do not look bolder on a dark ground.
4. Accent: chroma down 0.02–0.04, lightness up 5–10% (an accent tuned for light mode glares on a dark ground). | 5. Hue: the hue must not change between the light and dark sets, only lightness and chroma move. | 6. Images and illustrations: in dark mode lower the brightness or add a 1 px outline; reusing a light-mode screenshot as-is is forbidden.

❌ Counter-example: dark mode = `filter: invert(1)` or inverting the light values one by one → every semantic colour turns to mush and images become negatives | ✅ Good example: write one semantic token set in `:root` and another under `[data-theme="dark"]`, hue unchanged, lightness and chroma adjusted by the six rules above

**Action 13: Presentation / screen-share branch (the minimum tier, only when the output is a slide deck or a screen-share page)**: body ≥18 px, caption ≥16 px, meta / page number ≥14 px, 48 px is reserved for presentation-scale headlines; the larger the size the lighter the weight (a large headline uses 500, not 800) so it does not blur into a blob from a distance; contrast still follows the Action 4 gates and never sits on the line (a projector loses another notch of contrast). This branch tunes only these few numbers; layout geometry, theme presets and image slots do not enter this card.

**Action 14: Naming rule and light/dark mapping (`--color-<semantic>-<level>`, level being 50–900 or light/dark; components may only use semantic tokens, never raw hex)**
`--color-bg-page` `#F7F8FA`/`#212529` | `--color-bg-surface` `#FFFFFF`/`#343A40` | `--color-text-primary` `#343A40`/`#E9ECEF` | `--color-text-secondary` `#495057`/`#CED4DA` | `--color-text-muted` `#868E96`/`#ADB5BD` | `--color-border` `#DEE2E6`/`#6C757D` | `--color-brand` `#2563EB`/`#60A5FA` | `--color-brand-ink` `#FFFFFF`/`#212529` | `--color-focus` `#2563EB`/`#60A5FA` (each entry reads "light / dark")

**Action 15: Self-check for this card's output (run from the project root; non-developers only need the exit code: exit 1 = this card is not done. 10 steps, four semantics, 7 tokens, 0 raw bold hex, all six new slots and ≤110 lines all pass. This card folds its value tables into single `|`-separated lines only to save lines — the output `docs/DESIGN_TOKENS.md` must still use tables, because the script below counts table rows such as `| 50 |`; fold rows in the output and the check fails)**
```powershell
$t = 'docs/DESIGN_TOKENS.md'; $l = @(Get-Content $t -Encoding UTF8); $text = $l -join "`n"
$neutral = @($l | Where-Object { $_ -match '^\| [0-9]{2,3} \|' }).Count; $sema = @($l | Where-Object { $_ -match 'success|warning|danger|info' }).Count; $tok = @($l | Where-Object { $_ -match '--color-[a-z-]+' }).Count; $raw = @($l | Where-Object { $_ -match '\*\*#[0-9A-Fa-f]{6}\*\*' }).Count
$need = @('--color-focus','--color-brand-ink','outline-offset','--z-modal','[data-theme="dark"]','60-30-10'); $miss = @(); foreach ($n in $need) { if ($text -notmatch [regex]::Escape($n)) { $miss += $n } }
"lines $($l.Count) (<=110) | neutral steps $neutral (>=10) | semantic rows $sema (>=4) | tokens $tok (>=7) | raw bold hex rows $raw (0) | missing new slots $($miss.Count) -> $($miss -join ',') (0)"
if ($l.Count -gt 110 -or $neutral -lt 10 -or $sema -lt 4 -or $tok -lt 7 -or $raw -ne 0 -or $miss.Count -gt 0) { Write-Host '[FAIL] card self-check failed'; exit 1 } else { Write-Host '[OK] card self-check passed' }
```

**Prohibitions (any violation voids this round's output):**
- Never use pure black `#000000` for body text (21:1 on white glares and destroys hierarchy); body text is step 800 `#343A40`; never signal state by colour alone | Never write three-digit shorthand such as `#3a7`, never use raw hex inside components; never write "TBD / to be added later" in DESIGN_TOKENS.md — write `N/A (reason)` instead
- Never fake the focus ring with a `box-shadow` or a `border`; never let the focus ring fall below 3:1 against the page background | Never hard-code `color: white` on a brand fill (use `--color-brand-ink`); never write `background` without writing `color` in the same rule
- Never let an accent cover >5% of any viewport; never use three-stop gradients, purple-blue gradients or gradient text | Never turn dark mode into an inversion; never change hue between the light and dark value sets | Never use a pure `#000000` background or pure `#ffffff` text in dark mode

---
## ③ Evidence receipt (only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished)

1. Full path of `docs/DESIGN_TOKENS.md` + line count; 9. This round's commit hash
2. The 10-step neutral table verbatim (step + hex + use, 10 rows); the four semantic colours verbatim in light and dark + the four in-fill contrast ratios
3. Real output of the Action 5 command (six ratios, including both focus rows and the placeholder row) plus the gate verdict (which values clear ≥4.5:1 and which clear ≥3:1)
4. The seven type tiers, eight spacing values, four radius values and three shadow levels, verbatim
5. Real output of the Action 15 command (≤110 lines, 10 steps, 4 semantics, 7 tokens, 0 raw bold hex, 0 missing new slots; exit code 0)
6. The colour-discipline text verbatim: accent count and area share, the 60-30-10 ratio, the banned list
7. The font-family declaration (≤3, including display and body) + the body ratio value + the seven-tier z-index table, verbatim
8. The light and dark value sets of the six dark-mode rules, verbatim

---
## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/DESIGN_TOKENS.md`)
- `未决问题` [disambiguated: open questions] = the visual trade-offs the user has not settled (brand colour, font, dark mode — one line each); `裁剪记录` [disambiguated: trimming log] = single-person mode: skip design review, write one line of reason; `下一步` [disambiguated: next step] = 3-6 Motion and Microinteraction

```powershell
$t = 'docs/DESIGN_TOKENS.md'
git add STATE.md $t
git commit -m "3-5 docs(tokens): ten neutral steps and semantic gates"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line: `Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
