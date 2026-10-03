# Card 5-2 · Release
> Trigger: a milestone / a batch of features has accumulated / the user says "release / go live / let others use it" ｜ Output: docs/versions/vX.Y.Z.md + tag (tagged by a human) + RUNBOOK update ｜ Next: awaiting a new intent (an incident → 6-5 retrospective)

---

## ① Start confirmation

1. **Restate the release contents**: which completed tasks this release contains (STATE.md's 最近完成 compared against CHANGELOG's unreleased section).
2. **Assumptions list**: the 3~5 default assumptions you are making on the user's behalf (e.g. "no table-structure change this time", "there are no real users"), each with the way it was verified.
3. **Clarifying questions (≤5, keep them to a minimum)**: the default three questions — where is it deployed (local demo / static hosting / a hosting platform / a cloud server)? Are there real users? Does the data need migrating? Plus which version number to fix (a concrete number, e.g. v0.3.0). Anything findable in RUNBOOK or CHANGELOG must not be asked of a human.
4. **Paste the reference checklist verbatim** (paste word for word this card's §② "release seven checks").
5. Also declare: the output lands in = `docs/versions/vX.Y.Z.md` (this release's concrete version number) + a formal version section in the root `CHANGELOG.md` + tag (**tagged by a human**) + the deployment section of `docs/RUNBOOK.md`; next card = awaiting a new intent (an incident → 6-5 retrospective).

---

## ② Execution

**Release seven checks:**

**1. Deployment route (choose per the project's real situation and write it into RUNBOOK)**

| Route | Applies to | Key points |
| :-- | :-- | :-- |
| Local demo | only you use it | doctor + check passing counts as released |
| Static hosting | pure frontend | Vercel/Netlify connected to the repository auto-deploys; configure the environment variables |
| Hosting platform | with a backend | Railway/Render/Fly.io; use the platform's managed instance for the database; secrets go into the platform console, not the code |
| Cloud server | self-managed | domain + HTTPS are mandatory; server hardening is a separate task |

**2. Everything green up front**: `check.ps1` exit code 0 + walk the behavior acceptance checklist (of the most recent task) once.

**3. Data and migration**: does this release contain a table-structure change? Migration is **performed by a human** (non-delegable); run the RUNBOOK §3 backup before executing it.

**4. Rollback plan (write the plan before releasing)**: state clearly "how to back out if the release breaks" — the previous version's redeploy command / the data rollback path, stored in the version details.
❌ Counter-example: "Rollback: git revert (we will figure it out then)" (no concrete command and no data handling; when something breaks you can only improvise)
✅ Good example: "Rollback: `git checkout v0.2.0` and redeploy; the data has no destructive migration (L1 append), so no data rollback is needed; confirmation point: opening /health returns 200"

**5. Version three-way alignment**:
- Root `CHANGELOG.md`: turn the "unreleased" section into a formal version section (added / changed / deprecated / fixed)
- Version number: anything goes during the 0.x stage; from 1.x on, a breaking change bumps MAJOR and must say "upgrade notes"
- `docs/versions/vX.Y.Z.md` details: what was done / why / known issues / deployment actions / rollback point
- The version number is identical in all three places (CHANGELOG = detail file name = tag)

**6. Tagging (performed by a human; the agent only gives the commands)**:
```powershell
$ver = 'v0.3.0'           # this release's version number; all three places must agree
git tag $ver
git push origin $ver      # when a remote exists
```
❌ Counter-example: the CHANGELOG says v0.3.0, the detail file is called v0.3.1.md, and the tag is v0.30 (the three places disagree, so no matching version can be found when rolling back)
✅ Good example: all three are v0.3.0 — the CHANGELOG section title / `docs/versions/v0.3.0.md` / `git tag v0.3.0`

**7. Close-out sync**: update the deployment section of docs/RUNBOOK.md §1; check the conditional-document triggers — real users → create USER_GUIDE; collecting PII and public → PRIVACY; open source → LICENSE.

**Prohibitions:**
- The agent performing a deployment or tagging is forbidden (non-delegable, performed by a human)
- Releasing while skipping the rollback plan is forbidden ("it should be fine" is not a plan)
- Releasing when the version disagrees across the three places is forbidden

---

## ③ Evidence receipt

1. The version number + the three-way alignment check result
2. The deployment action record (who ran it / when / the address) + the rollback plan text
3. The versions/vX.Y.Z.md path + the tag name
4. The RUNBOOK update content

---

## ④ State write-back

**The order iron rule: write back state first → then commit → then re-run check.ps1 for a 0 (the tag and the deployment are performed by a human; the agent only gives the commands).**

Update STATE.md: `当前阶段` = maintenance / a new cycle; `下一步` = awaiting a new intent; `未来 3 步` rolled.

Then commit and re-run:
```powershell
git add STATE.md CHANGELOG.md docs/versions/v0.3.0.md docs/RUNBOOK.md
git commit -m "5-2 chore(release): 发布 $ver"
powershell -NoProfile -File check.ps1
```
(`$ver` reuses the assignment from §②⑥, and the detail file name matches it; after committing and going green, ask a human to tag and push `git push origin $ver`.)

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
