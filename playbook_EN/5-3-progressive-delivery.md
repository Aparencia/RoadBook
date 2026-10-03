# Card 5-3 · Progressive delivery (run additionally for tier-L / high-risk releases)
> Trigger: a tier-L release or a high-risk release (touching auth / payments / data deletion / external interfaces) ｜ Output: the rollout section of `docs/versions/vX.Y.Z.md` + `docs/RUNBOOK.md` ｜ Next: 5-4 observability

---

## ① Start confirmation

After receiving the start instruction, first return the following five items before doing anything:

1. **Restate the task and its landing point**: which version is being released this time, and why does it count as high risk? (read `当前任务` in `STATE.md` + the unreleased section of `docs/CHANGELOG.md`, one sentence); output = the rollout section of `docs/versions/vX.Y.Z.md` + the release-strategy line of `docs/RUNBOOK.md`; next card = 5-4 observability.
2. **Assumptions**: write down, one per line, "I assume X; if wrong, Y becomes invalid" — anything findable in `docs/RUNBOOK.md` and the version details must not be written as an assumption.
3. **Clarifying questions (≤5, drop whatever can be dropped)**: four defaults — which strategy is used this time (big bang / rolling / blue-green / canary)? where do the observation metrics come from (is there monitoring, or can you only read logs)? who has the authority to call a stop? has the rollback path been drilled? Anything findable in `docs/RUNBOOK.md` and the version details must not be asked.
4. **Quote the checklist verbatim** (paste, word for word, the "four-strategy selection criteria table + rollout ladder table + per-level stop criteria + prohibitions list" of §② of this card).
5. And declare: this release's version number (a concrete one, e.g. v0.4.0), the planned duration of each rollout ladder level, and the current status of "rollback path drilled / not drilled".

---

## ② Execution

**Action 1: Four-strategy selection (fill the table first, then pick one; an empty cell = not picked)**

| Strategy | Applicable conditions | Rollback cost | Cost | Chosen this time |
| :--- | :--- | :--- | :--- | :-: |
| Big bang (downtime, swap the version) | no real users / internal tool / data incompatibility forces a one-shot switch | highest (downtime + data cannot come back) | lowest | no |
| Rolling (replace instance by instance) | multiple instances, backward-compatible interface | medium (roll one more round back) | medium | no |
| Blue-green (two stacks coexist, switch traffic) | second-level rollback needed, budget for double resources | lowest (switch back to the old stack) | highest (double resources) | no |
| Canary (roll out by percentage) | traffic can be layered, metrics are observable | low (stop the rollout + switch back) | medium (needs traffic splitting and observation) | **default for this run** |

Selection rule: **unless "no real users" or "data incompatibility forces a one-shot switch" applies, choose canary by default**; choosing big bang requires writing the reason in the "Chosen this time" column above. Without traffic-layering capability → use blue-green or rolling instead; faking a "fake canary" (switching only the instance you yourself look at) is prohibited.

**Action 2: Rollout ladder (internal → 1% → 10% → 50% → 100%; five levels, none may be skipped)**

| Level | Rolled out to | Minimum dwell | Stop criteria for this level (which metric / how long to observe / what to do above threshold) |
| :-: | :--- | :--- | :--- |
| internal | yourself / team accounts | 30 minutes | walk the critical path manually end to end; one failure → stop the rollout, roll back |
| 1% | 1% of real traffic | 2 hours | error rate ≤ baseline ×1.2; latency P95 ≤ baseline ×1.2; above → stop the rollout and roll back |
| 10% | 10% of real traffic | 4 hours | same thresholds as the row above; additionally a core business metric (e.g. success rate) must not fall below baseline −1% |
| 50% | 50% of real traffic | 8 hours | same thresholds as the row above + no P1 incident within the longest observation window |
| 100% | all traffic | —— | close out into the 5-4 observation window (24 hours by default) |

**Stop criteria for every level (hard-coded, no improvising on the spot): which metric → how long to observe → what to do above threshold.**
- At least three metrics: error rate / latency P95 / one core business metric (use the key names defined in `docs/OBSERVABILITY.md`; if there are none, create it first)
- Observation duration = the "Minimum dwell" in the table above; entering the next level before the duration is up is prohibited
- The above-threshold action is hard-coded as a choice of two: **stop the rollout (freeze at the current level)** or **roll back**; "let us watch it a bit longer" is not an action
- ❌ Counter-example: `"先放 10% 看看，不对就退"` ("roll out 10% first and see, back off if it looks wrong") — no metric named, no observation duration, no threshold → when it goes wrong you rely on gut feel
- ✅ Positive example: `"1% 级观测 2 小时；错误率 > 0.5% 或 P95 > 400ms 触发回滚；回滚命令见版本详情"` ("observe the 1% level for 2 hours; an error rate > 0.5% or P95 > 400ms triggers a rollback; the rollback command is in the version details")

**Action 3: Feature flags and the rollback switch (must exist and be verifiable before release)**
Behind every new feature sits a flag (its key name goes into `.env.example`, its value is decided by the environment); verify two things before observing:
```powershell
# 验证"能关"：把开关置为关，核心路径必须回到旧行为
# (Verify "it can be turned off": set the flag to off, and the critical path must return to the old behaviour)
$env:FEATURE_NEW_CHECKOUT = 'false'
```
- The flag must exist **before** release, and **turning it off = returning to the old behaviour** (turning it off causes an error = there is no rollback switch)
- The rollback switch's default value, current value, and who may change it go into `docs/RUNBOOK.md`
- ❌ Counter-example: `"开关是有的，但关掉之后新老两套数据混在一起"` ("the flag exists, but once it is off the new and old data sets get mixed together") — cannot be turned off = a fake flag
- ✅ Positive example: turn the flag off → the critical path takes the old logic → the receipt shows the behavioural evidence before and after turning it off

**Action 4: The rollback path must have been drilled (an undrilled rollback = no rollback)**
Actually run a rollback before release (or at least drill the full flow on staging), and record three things: the command, the result, and the duration.
```powershell
git checkout vX.Y.(Z-1)
# Follow the "回滚" (rollback) section of docs/RUNBOOK.md (commands are not copied here: the RUNBOOK text is the single source)
                                              # (execute per the rollback section of RUNBOOK; this is only an example — actually run the original command in RUNBOOK)
```
- The drill record goes into `docs/versions/vX.Y.Z.md`, with the angle brackets replaced by real values: `回滚演练：2026-01-01 ｜ 命令 git checkout v0.3.9 ｜ 结果 成功 ｜ 耗时 4 分钟` ("rollback drill: 2026-01-01 ｜ command git checkout v0.3.9 ｜ result success ｜ duration 4 minutes")
- **An undrilled rollback must not go to release** (this is this card's red line); a failed drill = fix the rollback path before releasing

**Action 5: Who calls a stop, on which signal (non-delegable: rollback and release are decided by a human)**
- The executing agent may only "trigger a rollout stop + report evidence + give a recommendation"; **the final decision to roll back or continue is made by a human**
- The stop signals are hard-coded into a table: `signal (which metric reaches what) ｜ who detects it ｜ who calls the stop ｜ first action after the stop`
- The on-call/responder defaults to the user themself; write it into the release-strategy line of `docs/RUNBOOK.md` (including contact details or the notification channel)

**Action 6: Close-out and filing**
Add a section "放量决策与结果" ("rollout decision and result") to `docs/versions/vX.Y.Z.md`: the strategy, the actual dwell time at each ladder level, the metric reading at each level, whether a stop criterion was triggered, and the final conclusion. Add one line to `docs/RUNBOOK.md`: this run's strategy + the stop signals + where the rollback command lives.

**Prohibitions (violating any one = this round's output is void):**
- Skipping the rollout ladder and going straight to full volume is prohibited (unless this run is a big bang and the reason is written into the strategy table)
- Releasing with an undrilled rollback path is prohibited (red line)
- Replacing metric readings with "should not be affected" is prohibited — every level must show real readings
- The agent deciding on its own to roll back or to continue the rollout is prohibited (non-delegable, decided by a human)
- Wrapping up immediately after release is prohibited: full volume must enter the 5-4 observation window

---

## ③ Evidence receipt

Give these one by one (only three kinds of evidence count: real command output / file paths / commit hashes):

1. Strategy selection table (all four rows + which row was chosen this time + the reason)
2. Rollout ladder table (all five levels, each with metrics / duration / above-threshold action)
3. The feature flag's key name + behavioural evidence of turning it off (real command output)
4. **Rollback drill record**: command, result, duration (real output or the version-details path)
5. Actual metric reading at each level (for levels not reached, write "not reached + reason")
6. Stop-signal table (signal / who detects it / who calls the stop / first action)
7. The rollout section path in `docs/versions/vX.Y.Z.md` + the updated line in `docs/RUNBOOK.md`

---

## ④ State write-back

**The closing-order iron rule: write back the state first → then commit → then re-run check.ps1 for 0.**

Update `STATE.md`: `当前阶段` = delivery phase; `下一步` = 5-4 observability; roll `未来 3 步` (next release → periodic restore drill 5-5 → awaiting a new intent); `未决问题` = rollout decisions needing the user's verdict (e.g. a level whose metric runs high but has not crossed the threshold).

```powershell
git add docs/versions/vX.Y.Z.md docs/RUNBOOK.md STATE.md
git commit -m "5-3 docs(release): 发布策略与放量阶梯落档"
powershell -NoProfile -File check.ps1
```

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
