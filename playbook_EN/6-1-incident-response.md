# Card 6-1 · Incident response (required for any production incident; stop the bleeding before root cause)
> Trigger: production incident / user report / monitoring alert ｜ Output: docs/specs/<date>_<slug>/INCIDENT.md ｜ Next: 6-2 Root cause analysis
> Process area: OPS

---

## ① Start confirmation

After receiving the incident report, first send back a receipt for the following six items:

1. **Plain-language restatement and landing point**: which production feature is broken and who is affected (one sentence); output = `docs/specs/<date>_<slug>/INCIDENT.md`; next card = 6-2 Root cause analysis (this card does not investigate root cause).
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line — anything that can be looked up from STATE.md / docs/RUNBOOK.md / git log must not be written as an assumption; go look it up first.
3. **Clarifying questions (≤5, delete any that can be deleted)**: the default three questions — impact surface (who is affected, roughly how many users)? What was the most recent release or change (time + content)? Who has the authority to call the rollback (name or role)? If there are none, write "none".
4. **Severity basis, announced in advance**: severity will be assigned as P0/P1/P2 using the criteria in this card, and the matched condition will be written out; when unsure, start from P2, and finalize within 15 minutes.
5. **Quote the checklist verbatim** (paste the "five incident-response checks" from §② of this card word for word):
   - [ ] Severity: P0/P1/P2 assigned per the criteria, with the matched condition written out
   - [ ] Bleeding stopped: rollback / degradation / feature flag off / rate limiting done, recovery evidence returned in the receipt
   - [ ] Four timestamps (occurred / detected / bleeding stopped / recovered) written into INCIDENT.md, precise to the minute
   - [ ] Notification sent using the one-sentence template, recipients and content kept on file
   - [ ] Handed off to 6-2 Root cause analysis; P0/P1 marked as triggering the 6-5 retrospective
6. **Boundary statement**: severity and the means of stopping the bleeding are decided by the user; the agent only collects evidence and drafts — rollback, data changes and data deletion must be executed by a human.

---

## ② Execution

**Checklist of this card (the five incident-response checks, tick item by item):**
- [ ] Severity: P0/P1/P2 assigned per the criteria, with the matched condition written out
- [ ] Bleeding stopped: rollback / degradation / feature flag off / rate limiting done, recovery evidence returned in the receipt
- [ ] Four timestamps (occurred / detected / bleeding stopped / recovered) written into INCIDENT.md, precise to the minute
- [ ] Notification sent using the one-sentence template, recipients and content kept on file
- [ ] Handed off to 6-2 Root cause analysis; P0/P1 marked as triggering the 6-5 retrospective

**Action 1: severity classification (criteria inline)**
- P0 = whole site unavailable / data corruption or loss / a security vulnerability being exploited
- P1 = core functionality unavailable (login, checkout, payment and other main paths cannot be completed)
- P2 = partial degradation (non-core pages erroring, performance drop, individual users affected)
- ❌ Counter-example: "感觉挺严重的，按 P0 处理吧" ("feels pretty serious, let's treat it as P0") — no criterion, so it cannot be reviewed
- ✅ Good example: "全部用户登录接口返回 500 → 命中 P1（核心功能不可用）" ("the login API returns 500 for all users → matches P1 (core functionality unavailable)")
- The classification is a proposal only; the final severity is decided by the user; any level change mid-incident must be written into INCIDENT.md (who changed it, at what time).

**Action 2: credential/secret-leak branch (when the incident is a credential leak, finish this section before returning to Action 3)**
- The three steps are not reorderable. Step one: **rotate/revoke the credential — do not just delete the file**. ❌ "I deleted that file and committed again, so it is clean now" (git history, image layers and other people's clones still hold it, and the old secret still works) ｜ ✅ stop and have the user revoke the old credential at the issuer and issue a new one; record the rotation time and who did it.
- Step two: **assess the history — pushed to a remote = already leaked**. ❌ "it was only committed locally, so it should be fine" ｜ ✅ judge by "did the credential ever leave a trusted machine": pushed to a remote, written into CI logs, or pasted into a conversation — any one of them means treat it as leaked.
- Step three: **assess the blast radius — who holds it and what can they do**: list every permission the credential carries (which data it can read, what it can write, whether it has downstream quota) and use that to decide whether the user must be notified or related data invalidated.
- Severity still follows Action 1: P0 = the credential reaches production or user data directly / P1 = it only opens internal systems but can be widened laterally / P2 = already expired or only reads data with no sensitive content; the user decides the final level.
- Treating "delete that file" as the completed handling is forbidden — this branch is done only when rotation + history assessment + blast-radius assessment are all finished.

**Action 3: stop the bleeding before root cause (recover first, investigate after)**
- Four means, choose one or combine them: roll back to the last working version, degrade (turn off non-core features), turn off a feature flag, rate limit.
- Read the rollback steps already written for this project:
```powershell
Select-String -Path docs/RUNBOOK.md -Pattern '回滚' -Context 0,12
```
- ❌ Counter-example: "先定位报错原因，找到根因再决定要不要回滚" ("locate the error cause first, find the root cause and then decide whether to roll back") — every extra minute of the incident is another minute of loss for users
- ✅ Good example: "先按 docs/RUNBOOK.md 的回滚节恢复服务，恢复后再进 6-2 查根因" ("restore the service using the rollback section of docs/RUNBOOK.md first, then investigate the root cause in 6-2")
- While on this card: investigating root cause is forbidden, changing code is forbidden, refactoring while stopping the bleeding is forbidden.

**Action 4: timeline with four timestamps**
- Each of the four timestamps records "date hour:minute + source": occurred (the time of the first abnormal log line or alert), detected (the first time a human saw it), bleeding stopped (the time the recovery action started), recovered (the confirmed time the service was available again).
- ❌ Counter-example: "下午坏的，傍晚恢复了" ("it broke in the afternoon and recovered in the evening") — the incident duration cannot be computed, so the retrospective has no baseline
- ✅ Good example: "发生 2026-10-03 14:20（告警 CH-1187）；发现 14:31；止血 14:38；恢复 14:47" ("occurred 2026-10-03 14:20 (alert CH-1187); detected 14:31; bleeding stopped 14:38; recovered 14:47")
- Timestamps must not be written from memory: take the exact wording from monitoring, logs and chat records.

**Action 5: notification**
- Three recipient groups: affected users, the project owner, external channels (support desk or group announcement).
- One-sentence template: `who is affected + what the current status is + the next step`.
- ❌ Counter-example: "系统有点问题，正在处理" ("the system has a bit of a problem, we're on it") — it does not say who is affected or when it will be fixed
- ✅ Good example: "14:20 起全部用户无法登录；已回滚到上一版本，14:47 起登录恢复；正在定位原因，今天 17:00 前给结论。" ("since 14:20 all users cannot log in; we rolled back to the previous version and login has recovered since 14:47; we are locating the cause and will give a conclusion before 17:00 today.")
- Keep every notification on file: time + recipients + exact text, written into INCIDENT.md.

**Action 6: write `docs/specs/<date>_<slug>/INCIDENT.md`**
Six sections: symptoms / timestamp table / severity and basis / bleeding-stop actions and results / notification records / impact surface (affected users, data loss, external commitments). The `<slug>` in the path must be the same slug as in STATE.md `当前任务`; it is forbidden to call it an incident name in one place and a slug in another; `<date>` is always `YYYY-MM-DD` (hyphenated — the same format as the specs directory created by 2-1/2-3 and the 5-1 archive directory). [disambiguated]

**Action 7: hand off to 6-2**
Once the bleeding is stopped and the service is stable, hand off to 6-2 Root cause analysis immediately and carry the INCIDENT.md path over; for P0/P1, "触发 6-5 复盘" must be marked in STATE.md.

**Prohibitions (violating any one of them = this round's output is void):**
- The agent is forbidden to execute a rollback, modify data or delete data (non-delegable: a human must execute it; the agent drafts and supplies evidence)
- Investigating root cause or changing code before the bleeding is stopped is forbidden
- Timestamps without a source and timestamps written from memory are forbidden
- For P0, moving to the next step before the notification is sent is forbidden
- Downplaying the impact surface to users is forbidden ("小问题"/"minor issue" is not a severity level)

---

## ③ Evidence receipt

Give, item by item:
1. Severity proposal + basis (which of P0/P1/P2 was matched)
2. Bleeding-stop actions and recovery evidence: real command output / paths to monitoring or log screenshots / the recovery moment
3. INCIDENT.md path + the four timestamps verbatim
4. Notification records + the user's verdict on "severity and means of stopping the bleeding" (quoted item by item)
5. Credential-leak incidents: rotation time + who rotated it + the blast-radius conclusion (write "confirmed none" if the incident is not of this kind)

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `当前阶段` = 修复
- `当前任务` = INC-<序号> <one sentence> (INCIDENT.md link)
- `未决问题` = severity and bleeding-stop means awaiting the user's verdict; for P0/P1 add one line "止血后必须走 6-5 复盘"
- `下一步` = 6-2 Root cause analysis
- `工作树状态` = 干净

```powershell
$slug = 'login-down'      # replace with this incident's slug
$inc = "docs/specs/$(Get-Date -Format 'yyyy-MM-dd')_$slug/INCIDENT.md"
git add STATE.md $inc
git commit -m "6-1 fix(incident): $slug 止血与时间线留痕"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; non-zero → stop and ask the user; announcing that the incident response is complete is forbidden.

**Next card**: 6-2 Root cause analysis (enter it immediately once the bleeding is stopped and the service is stable). For P0/P1, after 6-2 → 6-3 → 6-4 you must run the 6-5 retrospective, then go to 5-1 Archive.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
