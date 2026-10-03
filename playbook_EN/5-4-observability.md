# Card 5-4 · Observability (always run after a release; the release is only complete once the observation window closes)
> Trigger: 5-2 release completed, or 5-3 finished rolling out to full volume ｜ Output: `docs/OBSERVABILITY.md` + the "观测与告警" (observability and alerting) and "出事先看哪" (what to look at first when something breaks) sections of `docs/RUNBOOK.md` ｜ Next: 5-5 backup and restore drill (optional) → awaiting a new intent

---

## ① Start confirmation

After receiving the start instruction, first return the following five items before doing anything:

1. **Restate the task and its landing point**: for which version is the observation window opened this time? how long is it? (read `当前任务` in `STATE.md` + `docs/versions/vX.Y.Z.md`, one sentence); output = `docs/OBSERVABILITY.md` + the "观测与告警" (observability and alerting) and "出事先看哪" (what to look at first when something breaks) sections of `docs/RUNBOOK.md`; next card = 5-5 backup and restore drill (optional, run periodically or after a data-structure change) → awaiting a new intent.
2. **Assumptions**: write down, one per line, "I assume X; if wrong, Y becomes invalid" — anything findable in `docs/RUNBOOK.md` and the version details must not be written as an assumption.
3. **Clarifying questions (≤5, drop whatever can be dropped)**: three defaults — who is on duty watching the metrics during the observation window? which channel do alerts go to (who can receive them)? where does the threshold baseline come from (the previous version's readings, or an estimate)? Anything findable in `docs/RUNBOOK.md` and the version details must not be asked.
4. **Quote the checklist verbatim** (paste, word for word, the "observability trio + four elements of an alert + observation-window rules + prohibitions list" of §② of this card).
5. And declare: this observation window's duration (24 hours by default), the inspection cadence (every 4 hours by default), and the threshold numbers of the three metrics.

---

## ② Execution

**Action 1: The observability trio (minimal observability; missing one = guessing when something breaks)**

| # | Item | The question it answers | Landing point (write a concrete path) | Ready? |
| :-: | :--- | :--- | :--- | :-: |
| 1 | health check endpoint | is it alive right now | Example: `GET /health` returns 200 plus the version number | yes/no |
| 2 | structured error log | why did that failure just happen | Example: `logs/app.jsonl` (or the platform log panel), each line carrying time / level / request ID / the raw error | yes/no |
| 3 | core business metric | is the business running normally | Example: login success rate, checkout success rate; write the landing point out | yes/no |

- **Having no monitoring is not the same as not needing monitoring**: if one item cannot be given → write `N/A（理由：本地-only 项目，无托管监控平台，暂以日志文件代替）` ("N/A (reason: local-only project, no hosted monitoring platform, log files stand in for now)") in `docs/OBSERVABILITY.md`, and leave an entry in `未决问题` in `STATE.md`; **leaving it blank = this card fails** (blank means "never thought about it", while `N/A + reason` means "thought about it and owns it")
- ❌ Counter-example: writing only `"有日志"` ("there are logs") — when something breaks you grep for ages before knowing which file
- ✅ Positive example: all three landing points are paths or commands that can be opened/executed directly, and the receipt shows one real reading

**Action 2: Alert thresholds and notification targets (all four elements required)**

| Monitored item | Threshold (fires only above it) | Notification target (person / channel) | Response time |
| :--- | :--- | :--- | :--- |
| health check failure | 3 consecutive failed probes | Example: the user themself (email/IM) | looked at within 15 minutes |
| error rate | > previous version's baseline ×1.5 | Example: the user themself | looked at within 30 minutes |
| latency P95 | > baseline ×1.5 | Example: the user themself | looked at within 4 hours |
| core business metric | 20% below baseline | Example: the user themself | looked at within 4 hours |

- **"Who receives it" must be written**: an alert sent to a channel nobody watches = no alert; the notification target defaults to the user themself
- Thresholds must carry a number and a comparison baseline (which version the baseline is, when it was measured); if no baseline can be written → write "baseline = the first day's readings of this observation window" and note that it is an estimate
- Response times are hard-coded: not writing them = receiving it may still mean not looking
- **The relation between the two threshold tiers (tight first, looser later — deliberately)**: the release-period threshold = the ×1.2 used at every rollout-ladder level (a fast stop-loss line); 24 hours after full rollout you enter the **observation-window threshold** of ×1.5 (this action's threshold — one notch wider, to avoid steady-state false alarms) — do not treat ×1.5 as the release-period gate, and do not use ×1.2 inside the observation window and cry wolf daily
- Solo mode (personal tier): the notification target is fixed = you yourself, no channel matrix needed; write one line of reasoning in STATE.md's `裁剪记录` (notified = responded)

**Action 3: Post-release observation window (duration / what to watch / inspection cadence / criteria for rolling back on anomaly)**
- **Duration**: 24 hours by default (≥48 hours for a tier-L or high-risk release); write it into the version details
- **What to watch**: the Action 1 trio + the four thresholds of Action 2, checked one by one; checking only "does the page open" is not allowed
- **Inspection cadence**: once every 4 hours, recording one line of readings each time (time / the three metric readings / conclusion); on finding an anomaly → handle it immediately per the criteria below
- **Criteria for rolling back on anomaly (hard-coded, no judging on the spot)**: health check fails 3 times in a row ｜ error rate > baseline ×1.5 lasting 10 minutes ｜ core business metric 20% below baseline lasting 30 minutes → triggers a rollback (the rollback command's location is written into `docs/RUNBOOK.md`; the rollback itself is a human verdict — the agent only reports evidence and recommends)
- **Non-delegable**: the verdict that closes the observation window, and whether to roll back = human verdict; the agent's job is to inspect on cadence and report readings truthfully
- ❌ Counter-example: `"发布完盯了十分钟没炸，收工"` ("watched it for ten minutes after release, nothing blew up, done") — ten minutes ≈ no observation; most failures only surface under real traffic
- ✅ Positive example: every inspection during the window leaves a time + reading + conclusion, and at close-out you state "no anomaly within the window" or "criterion X was triggered at time Y"

**Action 4: Minimal SLI/SLO definition (three items, one number each)**

| Metric | Definition (how it is measured) | Target (a concrete number) | Measurement method (one copyable line) |
| :--- | :--- | :--- | :--- |
| availability | successful health checks ÷ total probes | e.g. 99.5%/month | Example: `curl -s -o NUL -w "%{http_code}" http://localhost:3000/health` |
| latency | P95 response time | e.g. ≤400ms | Example: take `duration_ms` from the logs, sort, take P95 |
| error rate | 5xx count ÷ total request count | e.g. ≤0.5% | Example: `Select-String -Path logs/app.jsonl -Pattern '"status":5' \| Measure-Object` |

- Target numbers must be **measurable thresholds** (a single number), not "as low as possible"; the measurement method must be written as a command or query that can be copied and executed directly
- If 99.9% is out of reach, honestly write 99.5%; **writing a number you cannot reach is worse than writing none** (from then on every judgement uses a fake target as its ruler)

**Action 5: Log and metric retention (so it can be looked up when something breaks)**
Write down how long logs and metrics are each retained (defaults: logs ≥30 days, metrics ≥90 days), and whether they remain retrievable after that (where they are archived); a post-incident retrospective needs the readings from that moment, and insufficient retention = a retrospective without evidence.

**Action 6: Interfaces (write out all three lines clearly)**
- **5-2 release close-out**: the release only closes out if the observation window shows no anomaly; if there is an anomaly → roll back or hand over to 6-1 incident response
- **6-1 incident response**: above threshold and affecting users → follow "出事先看哪" (what to look at first when something breaks) in `docs/RUNBOOK.md`; stop the bleeding before localising
- **6-7 metrics**: the observation window's readings (deployment frequency / change failure rate / time to restore) are themselves metrics raw material; hand the readings over at close-out, do not lose them

**Action 7: Filing**
`docs/OBSERVABILITY.md` (the trio + threshold table + SLI/SLO table + retention); write the "观测与告警" (observability and alerting) section of `docs/RUNBOOK.md` with thresholds and alert destinations (details point to `docs/OBSERVABILITY.md`); add to the "出事先看哪" (what to look at first when something breaks) section: which panel/file to look at first → the three most common handling actions → where the rollback command lives.

**Prohibitions (violating any one = this round's output is void):**
- Writing observations without a landing point into the document is prohibited ("there is monitoring" does not count; write the panel/file path or an executable command)
- Leaving an observation item blank is prohibited: if it cannot be given, write `N/A + reason`
- Fabricating readings is prohibited — each inspection's reading must either be real output pasted in, or "not collected + reason"
- The agent declaring the observation window passed on its own, or rolling back on its own, is prohibited (human verdict)
- Writing secrets/tokens/user personal information into the observability document or log examples is prohibited

---

## ③ Evidence receipt

Give these one by one (only three kinds of evidence count: real command output / file paths / commit hashes):

1. Observability trio table (paste one real reading for each of the three; for `N/A` items write the reason)
2. Alert threshold table (all four elements, including response times)
3. Observation window record: time point / the three metric readings / conclusion (list them one by one, do not merge)
4. SLI/SLO table (three items, each with its target number + a copyable measurement command)
5. Log and metric retention
6. `docs/OBSERVABILITY.md` path + the updated line in `docs/RUNBOOK.md`
7. Interface statement: the observation window's conclusion (no anomaly / which criterion was triggered)

---

## ④ State write-back

**The closing-order iron rule: write back the state first → then commit → then re-run check.ps1 for 0.**

Update `STATE.md`: `当前阶段` = delivery phase (switches to the operations phase once the observation window closes); `下一步` = awaiting a new intent (if this run was tier L or changed the data structure → run 5-5 backup and restore drill first; on an incident → 6-1 incident response); `未决问题` = items whose readings ran high during the window without crossing the threshold, and the `N/A` observation items; roll `未来 3 步`.

```powershell
git add docs/OBSERVABILITY.md docs/RUNBOOK.md STATE.md
git commit -m "5-4 docs(ops): 观测三件套与观测窗收尾"
powershell -NoProfile -File check.ps1
```

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
