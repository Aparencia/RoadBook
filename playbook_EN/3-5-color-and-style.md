# Card 3-5 · Color and Style (fix the values before any UI work)
> Trigger: visual values are fixed after 3-4 locks the screen structure | Output: docs/DESIGN_TOKENS.md | Next: 3-6 Motion and Microinteraction

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — who looks at this palette and type scale, which pages it covers, what counts as usable.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume a brand primary already exists; if wrong, the whole primary ramp is replaced and every contrast ratio is recomputed). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only what decides values — is there a brand colour we must keep? Phone or desktop primary? Is dark mode needed? Is there a brand font?
4. **This card's checklist, quoted verbatim at start and ticked before finishing**:
   - [ ] ① 10 neutral steps 50–900, one hex value each, plus the generation rule
   - [ ] ② Brand primary plus hover/pressed values, three tiers complete
   - [ ] ③ Semantic success/warning/danger/info, light and dark values for each
   - [ ] ④ Contrast gates written down with a runnable command: body ≥4.5:1, large text ≥3:1, UI boundary ≥3:1
   - [ ] ⑤ Type scale 12/14/16/20/24/32/40 with line heights and weights
   - [ ] ⑥ Spacing on a 4px base: 4/8/12/16/24/32/48/64
   - [ ] ⑦ Radius 4/8/12/999, 1px border, three shadow levels, each with a concrete CSS value
   - [ ] ⑧ Naming rule `--color-<semantic>-<level>` plus the light/dark mapping table
5. **Landing declaration**: output = `docs/DESIGN_TOKENS.md`; next card = 3-6 Motion and Microinteraction.

## ② Execution

**Action 1: 10 neutral steps (`--color-neutral-*`; generation rule: 500 is the baseline, each lighter step raises lightness by 6%, each darker step lowers it by 6%, hue and saturation pass the WCAG relative-luminance check, and every step is recorded in the table)**

| Step | Hex | Use |
| :-- | :-- | :-- |
| 50 | `#F7F8FA` | Page background (1.06:1 against a white card, background only) |
| 100 | `#F1F3F5` | Section background, table header |
| 200 | `#E9ECEF` | Divider, zebra striping (1.19:1 on white) |
| 300 | `#DEE2E6` | Default input border (1.30:1 on white) |
| 400 | `#CED4DA` | Input hover border, disabled outline |
| 500 | `#ADB5BD` | Placeholder floor (2.07:1 on white): decorative elements only |
| 600 | `#868E96` | Secondary icons, disabled text: 3.32:1 on white, only at ≥18px or paired with words |
| 700 | `#495057` | Secondary body text (8.18:1 on white) |
| 800 | `#343A40` | Headings, primary body text (11.51:1 on white) |
| 900 | `#212529` | Highest-emphasis text, dark-mode page background (15.43:1 on white) |

**Action 2: Brand primary, three tiers (`--color-brand-*`)**

| State | Value | Check |
| :-- | :-- | :-- |
| Primary | `#2563EB` | 5.17:1 on white; white text on it 5.17:1 (both directions pass the body gate) |
| Hover | `#1D4ED8` | 6.70:1 on white |
| Pressed | `#1E40AF` | One step darker than hover, instant feedback only, never a text background |

The brand colour is reserved for the one primary action that is clickable right now — at most one full-brand area per screen.

**Action 3: Four semantic colours (`--color-<semantic>-*`; 700 tier in light mode, 300 tier in dark mode; text inside the fills: `#15803D` on `#DCFCE7` 4.57:1, `#92400E` on `#FEF3C7` 6.37:1, `#B91C1C` on `#FEE2E2` 5.30:1, `#1D4ED8` on `#DBEAFE` 5.49:1)**

| Semantic | Light text | Light fill | Dark text (on `#212529`) |
| :-- | :-- | :-- | :-- |
| Success | `#15803D` (5.02:1 on white) | `#DCFCE7` | `#4ADE80` (8.85:1) |
| Warning | `#B45309` (5.02:1 on white) | `#FEF3C7` | `#FBBF24` (9.24:1) |
| Danger | `#B91C1C` (6.47:1 on white) | `#FEE2E2` | `#F87171` (5.58:1) |
| Info | `#1D4ED8` (6.70:1 on white) | `#DBEAFE` | `#60A5FA` (6.07:1) |

**Action 4: Contrast gates (WCAG 2.1 AA, fixed; when a value fails, change the value, never the gate)**
- Body text (<18px, or <14px bold) against its background ≥ **4.5:1**
- Large text (≥18px, or ≥14px bold), icons, key chart marks ≥ **3:1**
- UI boundaries (input border, card border, divider) against the adjacent surface ≥ **3:1**; the generic border value is `#6C757D` (4.69:1 on white, 4.41:1 on step 50, 3.29:1 on the dark background)
- State must never rely on colour alone: an icon or a word is always present
- ❌ Counter-example: turning the error text red and calling that the message (colour-blind users see nothing) | ✅ Good example: red text + icon + the words "Save failed", three signals at once

**Action 5: A runnable contrast self-check (swap in your own two colours; if a ratio is under the gate, change the colour and rerun)**
```powershell
function Get-CR($a, $b) {
  $L = { param($h) $c = @(1,3,5) | ForEach-Object { [Convert]::ToInt32($h.Substring($_,2),16)/255 }; $v = $c | ForEach-Object { if ($_ -le 0.03928) { $_/12.92 } else { [Math]::Pow(($_+0.055)/1.055,2.4) } }; 0.2126*$v[0]+0.7152*$v[1]+0.0722*$v[2] }
  $x = & $L $a; $y = & $L $b; [Math]::Round((([Math]::Max($x,$y)+0.05)/([Math]::Min($x,$y)+0.05)),2)
}
"body  #343A40 on #FFFFFF  " + (Get-CR '#343A40' '#FFFFFF')
"large #495057 on #FFFFFF  " + (Get-CR '#495057' '#FFFFFF')
"bound #6C757D on #FFFFFF  " + (Get-CR '#6C757D' '#FFFFFF')
```

**Action 6: Type scale (`--font-size-*`; Chinese-first font stack: `-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`; body line height 1.5, heading line height 1.25; 45–75 characters per line, capped with `max-width: 68ch`)**

| Tier | Size | Line height | Weight | Use |
| :-- | :-- | :-- | :-- | :-- |
| xs | 12 | 1.5 | 400 | Helper text, table footnotes |
| sm | 14 | 1.5 | 400/500 | Table body, form labels |
| base | 16 | 1.5 | 400 | Default body |
| lg | 20 | 1.5 | 500 | Card titles, section titles |
| xl | 24 | 1.25 | 600 | Page title (h1) |
| 2xl | 32 | 1.25 | 600 | Marketing headings, big numbers |
| 3xl | 40 | 1.25 | 700 | First-screen headline (at most one per page) |

**Action 7: Spacing and layout (`--space-*`, 4px base, only these eight values)**
`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Adjacent text blocks 4–8, card padding 16–24, between cards 24–32, between page sections 48–64.
❌ Counter-example: hand-written values such as `margin: 13px`, `padding: 5px` | ✅ Good example: always `var(--space-3)` (which is 12)

**Action 8: Radius, border, shadow (`--radius-*` / `--shadow-*`; radius `4` inputs / `8` cards and medium buttons / `12` overlays and large buttons / `999` avatars and pill labels; one border style everywhere `1px solid var(--color-neutral-300)`, focus switches to brand plus a 2px outer glow; use the three shadow levels as they are)**
```css
--shadow-1: 0 1px 2px rgba(33, 37, 41, .08);
--shadow-2: 0 2px 8px rgba(33, 37, 41, .12);
--shadow-3: 0 8px 24px rgba(33, 37, 41, .16);
```

**Action 9: Naming rule and light/dark mapping (`--color-<semantic>-<level>`, level being 50–900 or light/dark; components may only use semantic tokens, never raw hex)**

| Semantic token | Light | Dark |
| :-- | :-- | :-- |
| `--color-bg-page` | `#F7F8FA` | `#212529` |
| `--color-bg-surface` | `#FFFFFF` | `#343A40` |
| `--color-text-primary` | `#343A40` | `#E9ECEF` |
| `--color-text-secondary` | `#495057` | `#CED4DA` |
| `--color-text-muted` | `#868E96` | `#ADB5BD` |
| `--color-border` | `#DEE2E6` | `#6C757D` |
| `--color-brand` | `#2563EB` | `#60A5FA` |

**Action 10: Self-check for this card's output (run from the project root; 10 steps, four semantics and seven tokens means pass)**
```powershell
$t = 'docs/DESIGN_TOKENS.md'
$l = @(Get-Content $t -Encoding UTF8)
"DESIGN_TOKENS.md lines $($l.Count)"
"neutral steps $(@($l | Where-Object { $_ -match '^\| [0-9]{2,3} \|' }).Count)"
"semantic rows $(@($l | Where-Object { $_ -match 'success|warning|danger|info' }).Count)"
"token rows $(@($l | Where-Object { $_ -match '^--color-' }).Count)"
"raw bold hex rows $(@($l | Where-Object { $_ -match '\*\*#[0-9A-Fa-f]{6}\*\*' }).Count)"
```

**Prohibitions (any violation voids this round's output):**
- Never use pure black `#000000` for body text (21:1 on white glares and destroys hierarchy); body text is step 800 `#343A40`; never signal state by colour alone
- Never write three-digit shorthand such as `#3a7`, never use raw hex inside components; never write "TBD / to be added later" in DESIGN_TOKENS.md — write `N/A (reason)` instead

## ③ Evidence receipt (only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished)

1. Full path of `docs/DESIGN_TOKENS.md` + line count
2. The 10-step neutral table verbatim (step + hex + use, 10 rows); the four semantic colours verbatim in light and dark + the four in-fill contrast ratios
3. Real output of the Action 5 command (three ratios) plus the gate verdict (which values clear ≥4.5:1 and which clear ≥3:1)
4. The seven type tiers, eight spacing values, four radius values and three shadow levels, verbatim
5. Real output of the Action 10 command (10 steps, 4 semantics, 7 tokens) + this round's commit hash

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/DESIGN_TOKENS.md`)
- `未决问题` [disambiguated: open questions] = the visual trade-offs the user has not settled (brand colour, font, dark mode — one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip design review, write one line of reason; `下一步` [disambiguated: next step] = 3-6 Motion and Microinteraction

```powershell
$t = 'docs/DESIGN_TOKENS.md'
git add STATE.md $t
git commit -m "3-5 docs(tokens): ten neutral steps and semantic gates"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
`The design tokens are fixed and the contrast gates are runnable. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
