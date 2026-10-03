# Card 3-4 · UI and Interaction Design (required before building any UI)
> Trigger: UI work starts after scope is confirmed | Output: docs/UI.md | Next: 3-5 Color and Style

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — who uses this screen, which steps they walk, what counts as success.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume desktop browsers only; if wrong, the 3-breakpoint layout must be redone). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only what decides layout — which device is primary (phone or desktop)? What must the user see first on one screen? Is there an existing screen we must copy?
4. **This card's checklist, quoted verbatim at start and ticked before finishing**:
   - [ ] ① Screen list with all eight fields: goal / entry / exit / dependency per screen
   - [ ] ② All eight states have a criterion and a drawn form: empty / loading / error / success / no-permission / offline / overlong text / extreme value
   - [ ] ③ Component selection table by hierarchy: four button levels, inputs, navigation, feedback
   - [ ] ④ Button spec table: heights 32/40/48, radius 4/8/12, icon slot 16/20, padding 8/12/16, disabled and loading states
   - [ ] ⑤ Form rules: label on top, validate on blur plus submit, error below the field, required marker
   - [ ] ⑥ Three breakpoints: ≤640 / 641–1024 / ≥1025, each with column count and primary-action position
   - [ ] ⑦ Microcopy: buttons start with a verb; errors state what happened + why + what to do, 2 examples each
   - [ ] ⑧ Keyboard and focus: Tab order, Esc, Enter behaviour written down
5. **Landing declaration**: output = `docs/UI.md`; next card = 3-5 Color and Style.

---

## ② Execution

**Action 1: Screen list (one row per screen before building it; all four columns required)**

| Screen | Goal (one sentence) | Entry | Exit / dependency |
| :-- | :-- | :-- | :-- |
| e.g. Task list | Let the user find last session's task within 3 seconds | Home primary button | Row click → detail; depends on the list endpoint |

**Action 2: Eight-state matrix (walk every list / form / detail; IDs are for self-check reference only)**

| ID | State | Criterion (when it is this state) | How to draw it |
| :-- | :-- | :-- | :-- |
| S1 | Empty | Request succeeded with 0 rows | One sentence plus one primary button; never leave blank space |
| S2 | Loading | Between request and response | Skeleton on first paint; spinner inside the button for partial actions; show only after 1 s |
| S3 | Error | Request failed or validation failed | What happened + why + what to do, plus a retry button |
| S4 | Success | Write call returned success | In-place feedback (3 s Toast or inline tick); never a full-screen popup |
| S5 | No permission | 401/403 returned | Say which permission is missing and who grants it; never a blank page |
| S6 | Offline | `navigator.onLine` is false | Top bar notice + disable writes + keep read-only cache |
| S7 | Overlong text | One field over 200 characters, or an unbroken long string | Truncate to 2 lines + tooltip for the full text; force-wrap long strings |
| S8 | Extreme value | 0, negative, over 1亿, empty array | Define the display rule first (e.g. ≥1万 shows as 1.2万) [disambiguated: 亿 = a hundred million, 万 = ten thousand]; nothing may overflow its box |

❌ Counter-example: only the state with data was drawn, so the empty table and the 500 error are seen for the first time in production
✅ Good example: all eight states are screenshotted into docs/UI.md, and S7 is tested with a 300-character string that has no spaces

**Action 3: Component selection table (choose by hierarchy, not by taste)**

| Category | Options | When to choose it |
| :-- | :-- | :-- |
| Button | primary / secondary / tertiary / danger | At most 1 primary per screen; secondary for lesser actions; tertiary for in-table actions; danger for irreversible ones such as delete, always with a confirm step |
| Input | text box / number box / date picker / radio / checkbox / switch / file upload | ≤5 options → radio; >5 → dropdown; binary and instantly applied → switch; everything else → text box |
| Navigation | top bar / side bar / breadcrumb / tabs / pagination / search box | ≤7 top-level items → top bar; depth >2 → add breadcrumb; >50 rows → add pagination |
| Feedback | inline note / Toast / alert bar / field error | Field-level errors go under the field; global results use a 3 s Toast; anything that must persist uses an alert bar |

**Action 4: Button spec table (three tiers, copy straight into style variables)**

| Tier | Height | Radius | Icon slot | Padding | Use case |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Small | 32 | 4 | 16 | 8 | In-table rows, toolbars |
| Medium | 40 | 8 | 20 | 12 | Form primary buttons (default tier) |
| Large | 48 | 12 | 20 | 16 | Mobile primary action, onboarding |

Disabled: opacity 0.4 on the whole button, `cursor: not-allowed`, no click response. Loading: spinner inside the button, label switched to the progressive form (e.g. Save → Saving), width must not jump.
❌ Counter-example: the button narrows while loading and shoves its neighbours sideways
✅ Good example: `min-width` is locked to the current width, and only the content and spinner change

**Action 5: Form rules (five, settled)**
1. Label on top (never use placeholder as the label); 2. Required fields get `*` and the form top states `* 为必填` [disambiguated: 为必填 = means required]; 3. Validation timing = blur + submit (no error while typing); 4. Error position = directly below the field; 5. Error copy may never be just "invalid input".

**Action 6: Responsive breakpoints (three tiers, mobile first)**

| Breakpoint | Layout | Primary action |
| :-- | :-- | :-- |
| ≤640 | Single column; navigation collapses into a hamburger menu | Full-width button fixed at the bottom |
| 641–1024 | Two columns; side bar collapses | Button fixed to the right of the form area |
| ≥1025 | Three columns; side bar always visible | Top-right button plus a keyboard shortcut |

**Action 7: Microcopy templates (copy these shapes)**
- Buttons start with a verb: ❌ `OK` / ✅ `Save task`; ❌ `Submit` / ✅ `Publish to production`
- Errors = what happened + why + what to do:
  ❌ `Operation failed` (the user cannot act on this)
  ✅ `Save failed: the network dropped (2 retries already). Reconnect and click "Retry".`
  ✅ `Email format is wrong: the @ sign is missing. Example: name@example.com.`
- Empty state = one sentence plus one action: `No tasks yet. Click "New task" in the top right to start.`

**Action 8: Keyboard and focus order**
1. Tab order = visual top-to-bottom, left-to-right; DOM order must match visual order (positive `tabindex` is banned).
2. Esc: close the current overlay and return focus to the element that opened it.
3. Enter: never submits a form (submission belongs to the button only); in a search box it runs the query.

**Action 9: Self-check for this card's output (run from the project root; 0 misses, all button tiers present and 8 checklist rows means complete)**
```powershell
$u = 'docs/UI.md'
$l = @(Get-Content $u -Encoding UTF8)
"UI.md lines $($l.Count)"
$miss = @('S1','S2','S3','S4','S5','S6','S7','S8','32','40','48','640','1024') | Where-Object { $l -notmatch $_ }
"missing $($miss.Count) -> $($miss -join ',')"
"button rows $(@($l | Where-Object { $_ -match '^\| (Small|Medium|Large|小|中|大) \|' }).Count)"
"unticked rows $(@($l | Where-Object { $_ -match '^   - \[ \]' }).Count)"
```

**Prohibitions (any violation voids this round's output):**
- Shipping only a pretty picture: one missing state out of eight = not done
- Placeholder used as a form label; errors hidden until after submit
- Icon-only buttons with no copy (a readable label or aria-label is mandatory)
- "TBD / to be added later" inside UI.md — if you cannot give a value, write `N/A (reason)`

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hash. Give each one:
1. Full path of `docs/UI.md` plus its line count
2. The eight-state matrix (verbatim criterion and drawing for every one of S1–S8), all eight rows present
3. Verbatim values of the three button tiers and the three breakpoints
4. 2 error-copy examples and 2 button-copy examples, verbatim
5. Real output of the Action 9 command (0 missing, button rows 3, checklist rows 8)
6. This round's commit hash

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/UI.md`)
- `未决问题` [disambiguated: open questions] = the layout trade-offs the user has not settled (one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip stakeholder review, write one line of reason
- `下一步` [disambiguated: next step] = 3-5 Color and Style

```powershell
$u = 'docs/UI.md'
git add STATE.md $u
git commit -m "3-4 docs(ui): eight-state matrix and button specs"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
`The UI spec is ready and all eight states have a drawn form. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
