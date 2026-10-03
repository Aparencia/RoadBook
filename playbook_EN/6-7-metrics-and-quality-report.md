# Card 6-7 · Metrics and quality report (once per quarter or per milestone)
> Trigger: end of each quarter / end of each milestone ｜ Output: docs/decisions/QUALITY_<date>_<topic>.md ｜ Next: 6-6 Process audit (when the process must change); no proposal = 5-1 Archive

---

## ① Start confirmation

1. **Plain-language restatement and landing point**: turn this period's (this quarter's or this milestone's) quality data into one report and give at least one process adjustment proposal; output = `docs/decisions/QUALITY_<date>_<topic>.md` (the 7 metrics + one process proposal; process details may go in `docs/reviews/QUALITY_<date>.md`); next card = 6-6 Process audit (when the report calls for a process change).
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "this period's release count can be counted from git tags"), and note the verification method for each; anything that can be looked up from git log / CI records / STATE.md must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: the default three questions — the start and end dates of the counting window? Is the definition consistent with the previous report (if not, explain first)? Who reads the report (this decides whether raw output must be attached)? If there are none, write "none".
4. **Data source statement**: first state the collection command for each of the 7 metrics and this period's gaps; write `N/A（理由）` for a gap, estimating is forbidden.
5. **Quote the checklist verbatim** (paste the "four report checks" from §② of this card word for word):
   - [ ] Each of the 7 metrics has a data source + collection command + this period's measured value (missing value written as `N/A（理由）`)
   - [ ] The report contains ≥1 process adjustment proposal (if there truly is none, write "无调整，依据是…")
   - [ ] Every metric carries a "the number improved but the method was wrong" counter-example warning, and the report contains no personal ranking
   - [ ] The report and STATE.md go into the same commit, and check.ps1 is re-run after the commit to get exit code 0
6. **Boundary statement**: metrics are a radar, not a KPI; whether to adjust the process is decided by the user — the agent only produces the report and the proposals.

---

## ② Execution

**Checklist of this card (the four report checks, tick item by item):**
- [ ] Each of the 7 metrics has a data source + collection command + this period's measured value (missing value written as `N/A（理由）`)
- [ ] The report contains ≥1 process adjustment proposal (if there truly is none, write "无调整，依据是…")
- [ ] Every metric carries a "the number improved but the method was wrong" counter-example warning, and the report contains no personal ranking
- [ ] The report and STATE.md go into the same commit, and check.ps1 is re-run after the commit to get exit code 0

**Action 1: run the seven-metric collection table (metric / data source / collection command)**

1. Deployment frequency (how many releases this period) — source: git tags and the version index in CHANGELOG.md
```powershell
git for-each-ref --sort=-creatordate --format='%(creatordate:short) %(refname:short)' refs/tags
```
2. Lead time for changes (how many days from start of work to release) — source: the distance from STATE.md `起点锚点` to the release tag
```powershell
$anchor = ((Select-String -Path STATE.md -Pattern '起点锚点').Line -replace '.*?([0-9a-f]{7,40}).*', '$1')
if ($anchor -notmatch '^[0-9a-f]{7,40}$') { "anchor empty or not a hash: write N/A（无锚点，理由…） for this metric and skip git log" } else { git log --date=short --pretty=format:'%h %ad %s' "$anchor..HEAD" }
```
3. Change failure rate (the share of releases that had to be rolled back or hot-fixed) — source: the number of INCIDENT.md files under docs/specs/ ÷ this period's release count
```powershell
Get-ChildItem docs/specs -Recurse -Filter INCIDENT.md | Select-Object FullName, LastWriteTime
```
4. Time to restore (the duration from detection to recovery) — source: the four timestamps in each INCIDENT.md
```powershell
Get-ChildItem docs/specs -Recurse -Filter INCIDENT.md | Select-String -Pattern '发现|止血|恢复'
```
5. Defect escape rate (defects found only after release ÷ this period's total defects) — source: RCA.md under docs/specs/ (reported after release) and CODE_*.md under docs/reviews/ (caught before release)
```powershell
Get-ChildItem docs/specs -Recurse -Filter RCA.md | Select-String -Pattern '定级'
Get-ChildItem docs/reviews -Filter 'CODE_*.md' | Select-String -Pattern '建议色'
```
6. Coverage trend (this period vs the previous report) — source: if the project already has a coverage tool, take its command output; if the workspace has no coverage tool, write `N/A（无覆盖率工具，理由…）` and never estimate; the trend compares against the previous QUALITY report
```powershell
Get-ChildItem docs/decisions -Filter 'QUALITY_*.md' | Sort-Object Name | Select-Object -Last 3
```
7. Gate green rate and stop-and-ask hot spots — source: the distribution of the "建议色" column in CODE_*.md under docs/reviews/; grouping of the source column in docs/TECH_DEBT.md
```powershell
Select-String -Path docs/reviews/CODE_*.md -Pattern '建议色' | Select-Object Filename, Line
Select-String -Path docs/TECH_DEBT.md -Pattern '^\|\s*TD-' | ForEach-Object { ($_.Line -split '\|')[4].Trim() } | Group-Object | Where-Object { $_.Count -ge 2 } | Select-Object Count, Name
```

**Action 2: write the report `docs/decisions/QUALITY_<date>_<topic>.md`** (the main landing point; process details may go in `docs/reviews/QUALITY_<date>.md`), with seven fixed sections:
1. Window and definitions (start and end dates, differences from the previous period's definitions)
2. Seven-metric table (metric / this period's value / previous period's value / data source / collection command)
3. Anomalies and explanations (which number looks wrong — check the definition before drawing a conclusion)
4. Counter-example warnings (one "the number improved but the method was wrong" line per metric)
5. Process adjustment proposals (≥1, with the landing point written as a specific file + a specific item)
6. Proposals not adopted and the reasons (write "无" if there are none)
7. Data gaps (what is missing, why it is missing, how it will be filled next time)

**Action 3: cadence**: once per quarter, or once at the end of each milestone; if the gap between two consecutive reports is > 4 months → state the reason in section 1 of the report.

**Action 4: metric gamification is forbidden**
- ❌ Counter-example: "把变更失败率纳入个人绩效排名；为了部署频率好看，把一个改动拆成 5 次发布" ("put change failure rate into individual performance ranking; to make deployment frequency look good, split one change into 5 releases")
- ✅ Good example: "部署频率只用来判断批次大小是否合适；异常只在流程层面找原因（如门禁判据缺失），不评价人" ("deployment frequency is only used to judge whether the batch size is appropriate; anomalies are investigated at the process level only (such as a missing gate criterion), never as an evaluation of a person")
- ❌ Counter-example: "数字不好看，把口径从'发布后 7 天内的回滚'悄悄改成'发布后 24 小时内'" ("the numbers look bad, so quietly change the definition from 'rollback within 7 days after release' to 'within 24 hours after release'")
- ✅ Good example: "口径要变，必须在报告第 1 节写明变更前后定义，并把上期值按新口径重算" ("if the definition must change, write the before and after definitions in section 1 of the report and recompute the previous period's value under the new definition")
- For a metric with no data: filling in an estimated number is forbidden; write `N/A（理由）`.

**Prohibitions (violating any one of them = this round's output is void):**
- Pasting numbers without a data source and collection command is forbidden (a report that cannot be reviewed = no report)
- A report containing no process adjustment proposal is forbidden (write "无调整，依据是…" if that is the case)
- Treating metrics as a KPI ranking, and changing a definition to look good without leaving a trace, are forbidden
- Inventing an estimated value is forbidden: write `N/A（理由）` for a missing value

---

## ③ Evidence receipt

Give, item by item:
1. Report path + line count
2. Excerpts of the real output of the seven-metric collection commands (at least one raw output line per metric)
3. Process adjustment proposal list (≥1) + the user's verdict on each proposal, quoted
4. Commit hash + the full output of `check.ps1` with exit code 0 + `git status --porcelain` empty

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `最近完成` insert one entry: quality report completed + the number of proposals
- `下一步` = 6-6 Process audit (when there is a process adjustment proposal) / 5-1 Archive (when there is none)
- `未决问题` = the proposals awaiting the user's verdict (list them one by one)
- `工作树状态` = 干净

```powershell
$fdate = Get-Date -Format 'yyyy-MM-dd'
$topic = 'q4'                                  # change to this period's topic: q4 / v0.7.0 and so on
$rep = "docs/decisions/QUALITY_${fdate}_$topic.md"
git add STATE.md $rep
git commit -m "6-7 docs(quality): $fdate 度量与质量报告"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; non-zero → stop and ask the user; announcing that the report is complete is forbidden.

**Next card**: 6-6 Process audit (when the report's proposals require a process change); with no proposal, 5-1 Archive.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
