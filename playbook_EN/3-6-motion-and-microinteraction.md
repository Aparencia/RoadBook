# Card 3-6 · Motion and Microinteraction (every animation needs a value and an opt-out)
> Trigger: motion is fixed after 3-5 locks the visual values | Output: docs/MOTION.md | Next: 4-1 Batch coding

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — which actions get motion, how fast it must feel, and when it must not move at all.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume target devices run at ≥60Hz; if wrong, every duration is recomputed for 30Hz). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only what decides motion — is this mainly phone or desktop? Is there a marketing page that must feel flashy? Any low-end device or screen-share scenario? Has the user mentioned motion sickness or an accessibility requirement?
4. **This card's checklist, quoted verbatim at start and ticked before finishing**:
   - [ ] ① Duration table, all six classes: hover 100ms / press 50ms / enter 150–200ms / exit 100–150ms / page transition 200–300ms / skeleton loop 1200ms
   - [ ] ② All four cubic-bezier curves with their use cases
   - [ ] ③ ≥6 button motion options, each with scenario / duration / easing / one-line CSS / taboo
   - [ ] ④ Ten microinteractions: hover, press, focus ring, in-button loading, skeleton, Toast in/out, list add/remove, collapse/expand, number change, success tick
   - [ ] ⑤ Opt-out fixed: under `prefers-reduced-motion: reduce`, ≤100ms or opacity only
   - [ ] ⑥ Performance budget: transform/opacity only, displacement ≤8px, 60fps, ≤300ms per animation
   - [ ] ⑦ Acceptance: each animation gets three manual reproduction steps plus the reproduction result; DevTools readings or a screen recording are optional supporting evidence at tier L only (not required for tiers S/M)
   - [ ] ⑧ Naming and commit: `docs/MOTION.md` landed, and STATE.md `下一步` [disambiguated: next step] set to 4-1 Batch coding
5. **Landing declaration**: output = `docs/MOTION.md`; next card = 4-1 Batch coding.

## ② Execution

**Action 1: Duration table (six classes, fixed; anything longer reads as lag)**

| Case | Duration | Note |
| :-- | :-- | :-- |
| hover | 100ms | Hover colour change, icon lighting up |
| press | 50ms | Press feedback must be faster than hover so it feels attached to the finger |
| enter | 150–200ms | Enter: overlay, drawer, Toast appearing |
| exit | 100–150ms | Exit must be faster than enter — the user has already decided |
| page | 200–300ms | Page transition, never above 300ms |
| skeleton | 1200ms | One skeleton loop; never scaled to content length |

**Action 2: Four easing curves (only these four; do not invent new ones)**

| Name | cubic-bezier | Use |
| :-- | :-- | :-- |
| standard | `cubic-bezier(0.2, 0, 0, 1)` | General movement and size change |
| decelerate | `cubic-bezier(0, 0, 0.2, 1)` | Enter (quick start, slow landing) |
| accelerate | `cubic-bezier(0.4, 0, 1, 1)` | Exit (slow start, quick departure) |
| emphasized | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Success feedback, one-off emphasis; at most once per screen |

**Action 3: Button motion options (≥6; pick one per scenario, never stack them)**

| Option | Scenario | Duration | Easing | One-line CSS | Taboo |
| :-- | :-- | :-- | :-- | :-- | :-- |
| B1 press scale | Base feedback for every clickable element | 50ms | standard | `.btn:active { transform: scale(.97) }` | Scaling below 0.95 looks like collapse |
| B2 hover lift | Card-style buttons, clickable cards | 100ms | standard | `.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-2) }` | Lifting over 2px wobbles; banned on in-row buttons |
| B3 colour step | Secondary buttons, text-only buttons | 100ms | standard | `.btn:hover { background: var(--color-brand-hover) }` | The primary button must return to its base colour; never change colour without a transition |
| B4 ripple | Mobile primary buttons, touch list rows | 200ms | decelerate | `transform: scale(0); animation: ripple 200ms cubic-bezier(0,0,0.2,1) forwards` | Banned on desktop (a mouse has no touch point); at most one per screen |
| B5 icon shift | "Next / submit" buttons with an arrow | 150ms | standard | `.btn:hover .icon { transform: translateX(2px) }` | Over 4px pushes out of the button; the icon must not swap position |
| B6 no motion | In-table actions, bulk actions, low-end devices | 0ms | — | `.btn { transition: none }` | Never use it to skip B1 press feedback (a press always needs feedback) |

**Action 4: Microinteraction list (ten, each with "trigger → behaviour → duration")**

| Microinteraction | Trigger | Behaviour | Duration |
| :-- | :-- | :-- | :-- |
| Hover | Pointer enters | Background or border change (no displacement) | 100ms |
| Press | Pointer down | Scale 0.97 or deeper colour | 50ms |
| Focus ring | Tab enters | 2px brand outer glow, always visible | 0ms (instant) |
| In-button loading | After the click | Label switches to the progressive form + spinner inside the button, width locked | from 200ms until the request ends |
| Skeleton | First-paint request sent | Grey blocks with a looping sweep | 1200ms per loop |
| Toast in/out | Write call returned | Decelerate in, accelerate out, auto-dismiss after 3s | in 150ms / out 100ms |
| List add/remove | Submit or delete succeeded | New row expands from height 0, deleted row fades out | 200ms |
| Collapse/expand | Header clicked | Height transition; when the content exceeds one screen, switch instantly instead | 200ms |
| Number change | Value updated | Opacity swap only; never roll the digits | 150ms |
| Success tick | Save succeeded | The tick is drawn along the stroke, played once | 300ms |

**Action 5: Opt-out (motion sickness and low-end devices; fixed, no bypass)**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: 100ms !important; }
  .btn:hover, .btn:active { transform: none; }
}
```
With it on, only ≤100ms opacity or colour changes survive; displacement, scaling, rotation and parallax are all off, and not one feature may be lost.

**Action 6: Performance budget (going over is a bug, not "a bit slow")**
- Animate `transform` and `opacity` only; never `width`/`height`/`top`/`left`/`margin` (they trigger reflow)
- Single displacement ≤8px; beyond 8px switch to a fade
- Target 60fps (≤16.7ms per frame); when frames drop, cut the motion, never the feature
- Single animation ≤300ms; the skeleton is the only allowed looping animation
❌ Counter-example: hover lift plus shadow transition on every list row, dropping a long list to 20fps while scrolling
✅ Good example: list rows do a 100ms background change only, and lifting is reserved for card-style entries

**Action 7: Acceptance (write the manual reproduction first, then talk about optional evidence)**
- Each animation gets three manual reproduction steps: how to trigger → what you should see → how to reset (e.g. click "Save" → a tick appears inside the button and reverts after 300ms → reload the page), and the reproduction result (real command output or file path) goes into docs/MOTION.md
- ❌ Counter-example: one line saying "checked, no flicker" | ✅ Good example: the three steps written out plus what was actually observed (with a timing reading or a file path)
- Only at tier L, or when the user explicitly asks: `Win + G`, record 5 seconds and confirm by eye that nothing jumps or flickers; or record 3 seconds in the DevTools Performance panel — no red long frames in Frames, no forced-synchronous-layout warning in Console

**Action 8: A runnable motion self-check (run from the project root; non-developers only need the exit code: exit 1 = this card is not done. ≥6 button options, six duration classes, ≥4 easings and the opt-out all pass)**
Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator); save scripts as UTF-8 with a BOM.
```powershell
$m = 'docs/MOTION.md'
$l = @(Get-Content $m -Encoding UTF8)
$btn = @($l | Where-Object { $_ -match '^\| (B[0-9]|按下缩放|上浮|颜色阶跃|涟漪|图标位移|无动效)' }).Count
$dur = @($l | Where-Object { $_ -match '^\| (hover|press|enter|exit|page|skeleton|进入|退出|页面|骨架屏)[^|]*\| *[0-9]' }).Count
$ease = @($l | Where-Object { $_ -match 'cubic-bezier' }).Count
$off = @($l | Where-Object { $_ -match 'prefers-reduced-motion' }).Count
"MOTION.md lines $($l.Count) (must be <= 70)"
"button motion rows $btn (must be >= 6); duration rows $dur (must be >= 6)"
"easing rows $ease (must be >= 4); opt-out rows $off (must be >= 1)"
if ($l.Count -gt 70 -or $btn -lt 6 -or $dur -lt 6 -or $ease -lt 4 -or $off -lt 1) { Write-Host '[FAIL] card self-check failed'; exit 1 } else { Write-Host '[OK] card self-check passed' }
```

**Prohibitions (any violation voids this round's output):**
- Never animate longer than 400ms; never let an animation block interaction (the button stays clickable during it, or is explicitly disabled with a stated reason)
- No full-screen bouncing, flickering or infinitely looping decorative motion (the skeleton is the exception)
- ❌ Counter-example: a 1.2-second full-screen confetti burst after a save, with the button dead for the whole time | ✅ Good example: a 300ms tick inside the button plus a 3s Toast, with interaction available throughout

## ③ Evidence receipt (only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished)

1. Full path of `docs/MOTION.md` + line count
2. The six duration rows and the four cubic-bezier curves, verbatim
3. The button motion table verbatim (rows B1–B6, including one-line CSS and taboo)
4. The ten microinteractions verbatim (trigger → behaviour → duration), plus the three manual reproduction steps and the reproduction result for the chosen animations (screenshots/recording only as optional supporting evidence at tier L)
5. The opt-out CSS verbatim + the five performance-budget rules verbatim
6. Real output of the Action 8 command (≤70 lines, button motion ≥6, durations ≥6, easings ≥4, opt-out ≥1; exit code 0) + this round's commit hash

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/MOTION.md`)
- `未决问题` [disambiguated: open questions] = the motion trade-offs the user has not settled (whether low-end devices drop all motion, whether a marketing animation is wanted — one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip the experience review, write one line of reason; `下一步` [disambiguated: next step] = 4-1 Batch coding

```powershell
$m = 'docs/MOTION.md'
git add STATE.md $m
git commit -m "3-6 docs(motion): six button options and the opt-out"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
`The motion spec is fixed with every value and every opt-out. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
