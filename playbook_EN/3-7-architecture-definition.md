# Card 3-7 · Architecture definition (what the system is, where its boundary lies, what trades against what)
> Trigger: the project first takes shape / a structural change (a module added or removed, storage swapped, a service split or merged) | Output: docs/ARCHITECTURE.md | Next: 3-1 Design (tier L) or 4-1 Batch coding
> Process area: ARCH

---

## ① Start confirmation

After receiving the start order, echo these five items before touching anything (do not start with an item missing):

1. **Task restatement**: one plain sentence — where this system's boundary is drawn, what it is made of, and which quality requirement decided its present shape.
2. **Assumption list**: one line each, "I assume X; if wrong, Y breaks" (e.g. I assume it only runs on a single machine; if wrong, both the data view and the deployment view are redrawn). Anything findable in package.json or SCOPE.md must not appear here.
3. **Clarifying questions (≤5, delete what you can)**: ask only the hard facts that decide the shape — who ends up using this thing? Will there be a second process or a second machine? If data is lost, where is it recovered from? Which single metric, once missed, voids the whole thing?
4. **This card's checklist, quoted verbatim at start and ticked before finishing (eleven items)**:
   - [ ] ① All three boundary questions answered: **what it is** (one sentence, ≤40 characters) / **what it does not do** (≥3 items, including the one most easily slipped in) / **what is outside** (the list of external systems and people)
   - [ ] ② Stakeholder and concern table: every stakeholder gets ≥1 concern, and every concern names the view that answers it (a concern no view claims = this card is not done)
   - [ ] ③ All four views present: context / module / runtime / data; one view per screen; a backend-only system with no UI still needs context and runtime
   - [ ] ④ In the module view every component gets "one-sentence responsibility + dependency direction"; **the dependency direction is drawn as a directed graph — no two-way edges, no cycles**
   - [ ] ⑤ The runtime view sequences ≥3 key scenarios (trigger → steps → landing point), one of them a failure path
   - [ ] ⑥ The data view states "where data lives / who the source of truth is / how many copies exist / backup and restore granularity"
   - [ ] ⑦ ≤5 quality-attribute scenarios, each carrying three elements: **stimulus → response → measure**; the measure must line up with an NFR threshold from 2-4, or explicitly write `暂无阈值（理由）` ("no threshold yet (reason)")
   - [ ] ⑧ ≥3 trade-off records: choosing A means giving up B, and "the price paid for one benefit" sits on the same row
   - [ ] ⑨ ≥2 evolution seams: what is not done now, and which single place changes when it is done later ("we will deal with it later" is not allowed)
   - [ ] ⑩ Boundary between architecture, design and the registry: architecture answers "what the system is" (unchanged for half a year), design answers "how this change is made" (changes this time); the two documents must not copy the same passage from each other
   - [ ] ⑪ Landing point `docs/ARCHITECTURE.md` written to disk, and STATE.md `下一步` [disambiguated: next step] states whether the next card is 3-1 or 4-1
5. **Landing declaration**: output = `docs/ARCHITECTURE.md`; next card = tier L takes 3-1 Design, everything else goes straight to 4-1 Batch coding.

---

## ② Execution

**Rationalization red-flag table (read each line at start; any hit = stop and do the missing work on this card)**

| You may think | Reality |
| :-- | :-- |
| A module diagram is enough | A module diagram only answers "what it is made of", never "why it is this way". An architecture diagram with no trade-off records = a decorative picture |
| Define the architecture once and it never changes again | On a structural change it **must** come back for an incremental update, otherwise document and code part ways — and once they part, the first thing that happens is nobody reads it again |
| It is clear in my head, no need to write it down | The people architecture serves are **you in the next session and the next agent**; architecture that never lands on disk does not exist |
| This is design detail, leave it to 3-1 | 3-1 is the construction drawing for "how this change is made"; using it as architecture means re-reading the whole repo on every change |

**Action 1: The three boundary questions (pin the boundary first, then talk about the inside)**

| Question | How to write it | Counter-example |
| :-- | :-- | :-- |
| What it is | One sentence ≤40 characters, no technical nouns | "A kanban board written in React" (that names the implementation, not the system) |
| What it does not do | ≥3 items, including the one most easily slipped in | Writing only "no mobile" — missing "no multi-tenancy" |
| What is outside | External systems / people / scheduled jobs, each line stating which side initiates and which side is passive | Counting the database as an external system (it is a data view inside the system) |

**Action 2: Stakeholders and concerns (every concern must be claimed by a view)**

A solo project does not skip this step — **a stakeholder is a role such as "future me"**, not an org chart:

| Stakeholder | Typical concern | Which view answers it |
| :-- | :-- | :-- |
| User | Does it just work when opened, and when something fails do I know what to do | Context view + runtime view (failure path) |
| Future me | How many places move when I change one, will adding a feature collapse it | Module view (dependency direction) |
| Ops me | How do I learn it is down, how does data come back after loss | Data view + runtime view |
| Next agent | Where to start reading, what is off-limits | All views + the three boundary questions |

**Action 3: The four views (one view per screen; more than that means there is no abstraction)**

| View | Must answer | Minimal rendering |
| :-- | :-- | :-- |
| Context | System boundary, external participants, how data goes in and out | One box + external entities + connecting lines with direction, each line stating what it carries |
| Module | What it is made of, each part's responsibility, who depends on whom | Component list table + dependency directed graph; **an arrow points one way only** |
| Runtime | What order the key scenarios run in | ≥3 sequences (one of them a failure path), each step stating which component it lands in |
| Data | Where data lives, who the source of truth is, how it is backed up | Entity table + source-of-truth marking + copy and restore granularity |

**Action 4: Quality-attribute scenarios (the reason architecture exists; never invent a threshold)** Every line carries all three elements: **stimulus** (who triggers it under what condition) → **response** (what the system does) → **measure** (how many seconds / how many items / what probability).

| Attribute | Example scenario (stimulus → response → measure) |
| :-- | :-- |
| Performance | A first-screen request arrives → the list page is returned → P95 ≤ the millisecond figure written in the NFRs |
| Availability | A single dependency times out → degrade to the cached response with a notice → self-recovers within 30s, the user never sees a blank screen |
| Maintainability | The storage implementation is swapped → one place in the adapter layer changes → callers change nothing |
| Security | An internal page is reached without signing in → redirect to sign-in and back to the original address → no data leak |
| Capacity | Data grows N times → the list still paginates → a single-page query takes no more than 2× the baseline |

**Threshold-source iron rule**: when it lines up with a threshold in `2-4 Non-functional requirements`, quote it verbatim; when it does not, write `暂无阈值（理由）` ("no threshold yet (reason)") — **inventing a good-looking number is banned** (an invented threshold gets taken as fact half a year later).

**Action 5: Dependency direction (the only thing in architecture a machine can decide)**
- A dependency must point one way: `A → B` means "uses B without changing B's contract"
- **No two-way edges**: A uses B while B uses A = the two are really one — merge them, or extract a third piece in between
- **No cycles**: any single change on the A → B → C → A cycle drags the whole cycle along
- **No layer skipping**: the UI layer must not connect straight to the data layer; if it does there must be an adapter, and exactly one adapter
- After drawing the graph, run the self-check once (Action 8); cycles and two-way edges get called out by the script

**Action 6: Trade-off records (no architecture option is free of cost)** Every record is written as one line: `选了 X ｜ 换来 Y ｜ 代价 Z ｜ 什么条件下翻案` ("chose X | gained in exchange Y | cost Z | what condition reverses it").

| Example | Gained | Cost | When it is reversed |
| :-- | :-- | :-- | :-- |
| Single-process monolith | Simple to deploy and debug | Cannot scale one part on its own | One part pins the CPU for a long stretch |
| Local files as storage | Zero operations | Moving machines means moving files | A second writer appears |
| Synchronous calls | Deterministic results, easy to test | A slow dependency drags everything down | P95 passes the threshold and degradation does not help |

**Action 7: Evolution seams and decision trail (what is not done now still needs a seam)**
- ≥2 evolution seams: state "which single place changes when it is done later", e.g. "multi-user → add an owner field to entity X in the data view and change only the adapter layer"
- Every key decision goes into `docs/decisions/` (following the decision-record conventions of `3-1 Design`); rejected options must be named too, otherwise half a year later somebody (you) proposes them again
- The review date of each decision goes into the card, and `6-8 Decision review` closes it when due

**Action 8: Architecture self-check (run from the project root; non-developers only need the exit code: exit 1 = this card is not done)**
Variable names are ASCII only: when Windows PowerShell 5.1 reads a BOM-less .ps1, a Chinese variable name fails with 『字符串缺少终止符』 (missing string terminator); save scripts as UTF-8 with a BOM.
```powershell
$m = 'docs/ARCHITECTURE.md'; $l = @(Get-Content $m -Encoding UTF8); $txt = $l -join "`n"; $views = @('上下文','模块','运行时','数据') | Where-Object { $txt -match $_ }; $tri = @($l | Where-Object { $_ -match '刺激|响应|度量' }).Count; $tr = @($l | Where-Object { $_ -match '代价' }).Count; $gap = @($l | Where-Object { $_ -match '演化口子|以后要做' }).Count; "ARCHITECTURE.md 行数 $($l.Count)（要求 ≤150）"; "视图命中 $($views.Count)/4（要求 4）：$($views -join ' ')"; "质量属性三要素行 $tri（要求 ≥5）；权衡代价行 $tr（要求 ≥3）；演化口子行 $gap（要求 ≥2）"; if ($l.Count -gt 150 -or $views.Count -lt 4 -or $tri -lt 5 -or $tr -lt 3 -or $gap -lt 2) { Write-Host '[FAIL] 本卡自查未过'; exit 1 } else { Write-Host '[OK] 本卡自查通过' }
```

**Prohibitions (any violation voids this round's output):**
- Never write architecture as an implementation inventory (listing frameworks, libraries and files is not architecture)
- Never write a quality attribute without a measure ("must be fast", "must be stable" = not written)
- Never leave a two-way dependency or a dependency cycle — once the script calls it out you change the structure or the graph, never the script
- Never invent a threshold: when it does not line up with the NFRs, write `暂无阈值（理由）` ("no threshold yet (reason)")
- Never declare done after drawing a single diagram (missing any one of the four views = unfinished)
- Never write the architecture document as a design document (the two must not share one passage of body text)
- ❌ Counter-example: one page of directory tree + "we adopt a layered architecture" | ✅ Good example: four views + five scenarios with measures + three trade-offs with costs

---

## ③ Evidence receipt (only three kinds of proof count: real command output / file paths / commit hash; missing any one means unfinished)

1. Full path of `docs/ARCHITECTURE.md` + line count
2. The three boundary questions verbatim (what it is / what it does not do, ≥3 items / the list of what is outside)
3. The stakeholder-and-concern table verbatim, naming the view that claims each concern (no claim = unfinished)
4. The four views verbatim (context / module / runtime / data); the module view's dependency-direction graph plus the conclusion "no two-way edges, no cycles"
5. The quality-attribute scenarios verbatim (≤5, with stimulus → response → measure), each annotated with which row of 2-4 the threshold comes from, or `暂无阈值（理由）` ("no threshold yet (reason)")
6. The trade-off records verbatim (≥3, with cost and reversal condition) + the evolution seams verbatim (≥2)
7. Real output of the Action 8 command (≤150 lines, views 4/4, three elements ≥5, costs ≥3, seams ≥2; exit code 0) + this round's commit hash
8. Open-questions list (the structural trade-offs the user has not settled, one line each)

---

## ④ State write-back

**Write the state back first, commit second.** Update STATE.md:
- `当前任务` [disambiguated: current task] = this task name (link `docs/ARCHITECTURE.md`)
- `未决问题` [disambiguated: open questions] = the structural trade-offs nobody has settled (split the process or not, swap storage or not, multi-user or not — one line each)
- `裁剪记录` [disambiguated: trimming log] = single-person mode: skip the architecture review meeting, write one line of reason; tier S writes "a single-page app's structure is its file list, this card is trimmed"; `下一步` [disambiguated: next step] = 3-1 Design (tier L) or 4-1 Batch coding

```powershell
$m = 'docs/ARCHITECTURE.md'; git add STATE.md $m; git commit -m "3-7 docs(arch): 四视图与质量属性权衡"; powershell -NoProfile -File check.ps1
```
The exit code must be 0; if non-0, stop and ask the user — never declare this card done.

Fixed closing line:
Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
