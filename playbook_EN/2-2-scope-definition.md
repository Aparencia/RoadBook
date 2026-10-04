# Card 2-2 · Scope definition (mandatory for feature-tier work; tier S uses the simplified version)
> Trigger: the approach from 2-1 feature research is approved by the user | Output: docs/specs/<日期>_<slug>/SCOPE.md | Next: 2-4 non-functional requirements (tiers M/L); tier S → 4-1 batch coding; tier L → 3-1 design after 2-4

---

## ① Start confirmation

After receiving the start instruction, first issue a receipt for the following four items, then act (a missing item means do not start):

1. **Restate the task**: in one plain sentence, say what this feature does and who it is for.
2. **Assumptions list**: which default decisions you made on the user's behalf (e.g. "数据存本地" "不做并发" ("data stored locally", "no concurrency")), listed one by one.
3. **Clarifying questions (≤5, keep them to the minimum)**: ask only what cannot be answered from the project files. Anything you can check yourself in docs/ARCHITECTURE.md, docs/pool/IDEAS.md, or against SCOPE convention must not be brought to a human.
   ❌ Counter-example: "这个功能重要吗？" ("is this feature important?") (pointless — the user starting the work already means it matters)
   ✅ Example: "月度统计需要包含已删除的账单吗？" ("should the monthly statistics include deleted bills?")
4. **Quote the checklist verbatim** (paste verbatim this card's §② "nine scope-compliance checks").

Also state: the output lands at `docs/specs/<日期>_<slug>/SCOPE.md`, and the next card = 2-4 non-functional requirements (tiers M/L); tier S → 4-1 batch coding; tier L → 3-1 design after 2-4. [disambiguated]

---

## ② Execution

**Action 1: the four-tier MoSCoW list** (write it into SCOPE.md; write the three fixed fields at the top of the file first)
```text
任务名: <功能一句话> ｜ 档位: <S/M/L> ｜ 预估改动行数: <N>
```
`预估改动行数` ("estimated changed lines") = the total added + deleted lines across all batches of this task (tests included); it is the data source for card 4-1's scope-creep tripwire: cumulative changed lines > N × 1.5 → stop and ask the user.

| Tier | Meaning | Decision question |
| :-- | :-- | :-- |
| Must | must have this iteration | without it, does the feature fail to hold up? |
| Should | should have it; usable without it, but painful | if it slips a week, can the user bear it? |
| Could | nice to have | would cutting it hurt? |
| **Won't** | **explicitly not done this iteration** | anything the user might easily assume exists goes here |

**Action 1.5: blocking dependencies are registered explicitly（阻塞依赖显式登记）**
Each Must states which Must must finish first; entries with no dependency at all form the "frontier that can start immediately". A dependency cycle = stop and ask the human; breaking the cycle on your own is forbidden.
❌ Counter-example: Must 3 "导出" ("export") depends on Must 1 "数据层" ("data layer"), yet it is written as "依赖：无" ("dependency: none") and the build order is guessed
✅ Example: `Must 1 数据层（依赖：无 —— 前沿）` ("Must 1 data layer (dependency: none — frontier)") / `Must 3 导出（依赖：Must 1）` ("Must 3 export (dependency: Must 1)")

**Action 2: Won't Have = non-goals (the antidote to scope creep)**
Write one line for each Won't item: "why it is not done this iteration".
❌ Counter-example: Won't: 找回密码 ("password recovery") (no reason written → two weeks later the AI will "helpfully" implement it anyway)
✅ Example: Won't: 找回密码——单人本地应用，无密码体系，随 v1.1 再议 ("password recovery — a single-user local app with no password system; revisit with v1.1")

**Action 3: acceptance criteria (a tickable checklist)**
Each item = an observable behavior, written as "open which page → do what → what should be seen".
❌ Counter-example: "统计功能性能良好、体验流畅" ("the statistics feature performs well and feels smooth")
✅ Example: "打开 /export 页 → 勾选 3 条记录 → 点导出，下载 export.md 内含这 3 条" ("open the /export page → tick 3 records → click export; the downloaded export.md contains those 3 records")

**Action 3.1: Stories are for humans, acceptance commands are for agents（用户故事给人看，验收命令给 agent 跑）**
Every Must's acceptance criteria must come with a **runnable command** (one that produces an exit code or prints comparable output); writing only "用户能顺利导出" ("the user can export smoothly") = not acceptable. Both are required — the user story and the acceptance command — and neither may substitute for the other.
❌ Counter-example: Must "支持导出" ("support export") + acceptance criterion "用户能顺利导出" ("the user can export smoothly")
✅ Example: Must "支持导出 Markdown" ("support Markdown export") + acceptance command `node dist/export.js --in sample.json` → exit code 0 and export.md contains 3 lines

**Action 3.5: the five uncovered-input classes**: list the 5 input classes / failure situations that SCOPE does not state explicitly but that are most likely to bite a real user (one line each: the input or situation + the behavior a reasonable person would expect, most likely first). **SCOPE's silence is not permission for the program to break on these inputs.** Each one must have a corresponding tickable criterion in the acceptance criteria.

**Action 4: UI description (write this only when there is an interface)**
Page level (which page) + element level (the name, position, and state of buttons/lists/input boxes), written to a granularity that can create a row in the component registry.

**Action 5: tier-S simplified version**
For tier S (≤3 files, ≤100 lines; **single-page static app exception**: 1 entry page + no backend + no dependency → ≤5 files and ≤400 lines, including the three design documents), SCOPE.md needs only three sections: the Must list / the Won't list / the acceptance criteria (2 items are enough).

**The nine scope-compliance checks (self-check before this card's wrap-up; write the verbatim answers into the receipt):**

```text
① Does every Must in SCOPE have a corresponding implementation plan?
② Has anything from Could/Won't slipped in? (if so, delete it or downgrade it)
③ For everything on the Won't list, is the code absolutely not written this iteration?
④ Is every acceptance criterion an "observable behavior"?
⑤ Has the user said "确认" ("confirmed")? (send the user this line — replying "确认" is enough, no need to restate every item: `请回复：确认 SCOPE，开始写代码`; without confirmation, entering 4-1 is forbidden) [disambiguated]
⑥ Self-consistency check: are there TBD / TODO / placeholder sections in SCOPE? Do two sections contradict each other? Can any requirement be read in two different ways? — fix each one in place into a single interpretation, then give the receipt.
⑦ Step-qualification check: can the next step of every Must be written as "exactly one reasonable thing"? Sentences that decide nothing at all — such as "处理边界情况" ("handle edge cases"), "加适当校验" ("add appropriate validation"), "补测试" ("write tests for the above") — → fix them in place into concrete criteria.
⑧ Approval does not carry across stages: does this confirmation cover only the section just presented? — SCOPE approval ≠ approval of the implementation approach, and ≠ approval of the artifacts of later cards; when the reply addresses only one section, state in the receipt what is confirmed and what is still pending.
⑨ Presenting and starting in the same breath: did you start writing code / creating a branch / copying the template set in the same message that presented SCOPE? The gate is "the user said 确认" ("confirmed"), not the length of the document; presenting and starting must be two separate messages, and tier S is no exception.
```

**Prohibitions:**
- Writing any business code before the user confirms SCOPE is forbidden (single-person mode: the user replying "确认 SCOPE" once is enough; no item-by-item restatement is needed)
- Treating "the user did not say not to" as "we may do it" is forbidden — anything not listed in Must is not done

---

## ③ Evidence receipt

At wrap-up, the following must be given item by item:
1. Full path of SCOPE.md + line count
2. MoSCoW counts (Must x / Should x / Could x / Won't x)
3. The one-sentence restatement of the task (the wording the user confirmed)
4. The clarifying questions and the user's answers (quoted verbatim)
5. The user's own words confirming SCOPE (single-person mode: one "确认" / "确认 SCOPE" is enough, no item-by-item restatement; only multi-party projects walk every item; without confirmation, entering 4-1 is forbidden) + the value and basis of `预估改动行数` ("estimated changed lines") [disambiguated]

---

## ④ State write-back

Update STATE.md:
- `current task` = <feature name> (SCOPE link)
- `tier` = the S/M/L the user confirmed
- `next` = 2-4 non-functional requirements (tiers M/L); tier S → 4-1 batch coding; tier L → 3-1 design after 2-4
- `open questions` = the questions the user did not answer during clarification (list them if there are any)

After writing back, wrap up with the fixed three steps (write back → commit → re-run check.ps1):
```powershell
$spec = 'docs/specs/20260912_export'   # this task's directory; assign before calling
git add STATE.md $spec
git commit -m "2-2 docs(spec): add export scope"
powershell -NoProfile -File check.ps1
```
`git status --porcelain` empty + check.ps1 exit code 0 = wrap-up complete.

Fixed closing line:
`SCOPE ready. Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
