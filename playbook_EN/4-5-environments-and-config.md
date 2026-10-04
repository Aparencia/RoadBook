# Card 4-5 · Environments and config (run additionally when a new environment is needed)
> Trigger: a new environment (staging/prod) is needed, or a config entry is added ｜ Output: the "环境与配置" (environments and config) section of `docs/RUNBOOK.md` + `.env.example` ｜ Next: 5-2 release

---

## ① Start confirmation

After receiving the start instruction, first return the following five items before doing anything:

1. **Restate the task and its landing point**: which environment is to be created/changed this time, and which config entries are to be added? (read `当前任务` in `STATE.md`, one sentence); output = the "环境与配置" (environments and config) section of `docs/RUNBOOK.md` + `.env.example`; next card = 5-2 release.
2. **Assumptions**: write down, one per line, "I assume X; if wrong, Y becomes invalid" — anything findable in `docs/RUNBOOK.md` and `.env.example` must not be written as an assumption.
3. **Clarifying questions (≤5, drop whatever can be dropped)**: three defaults — who may touch dev / staging / prod respectively? where does staging data come from (a de-identified copy or synthetic data)? who provides the real values of the new config entries? Anything findable in `docs/RUNBOOK.md` and `.env.example` must not be asked.
4. **Quote the checklist verbatim** (paste, word for word, the "environment tier table + isomorphism criterion + data-isolation iron rule + prohibitions list" of §② of this card).
5. And declare: the list of config key names added/modified this time (one per line); which environment is touched this time.

---

## ② Execution

**Action 1: Environment tier table (all three rows must be filled; an empty cell = not written)**

| Environment | Purpose | Data source | Who may touch it | May it connect directly to production data |
| :--- | :--- | :--- | :--- | :--- |
| dev | local development and debugging | generated locally / seed data | the developer themself | no |
| staging | full pre-release verification | a de-identified copy or synthetic data | developer + reviewer | no (reading a read-only production snapshot requires the user's written approval) |
| prod | real users | real data | only people the user authorises; the agent may only read logs and metrics | —— |

**Action 2: staging isomorphic to prod (register every difference explicitly; an unregistered difference = a hidden hazard)**
Isomorphic = the same branch/build method, the same database engine and major version, the same set of environment variable key names, the same deployment method. Every point where isomorphism cannot be achieved gets registered in the table below:

| Difference | Impact | Accepted (reason) |
| :--- | :--- | :--- |
| Example: staging uses SQLite, prod uses PostgreSQL | the migration script is green on staging, red on prod | not accepted → switch to the same engine in this run |
| Example: staging is single-instance, prod is dual-instance | concurrency-class defects cannot be reproduced | accepted (reason: running two instances for the same duration is not worth the cost; covered by the post-release observation window instead) |

- ❌ Counter-example: `"staging 差不多就行"` ("staging just needs to be roughly right") — no difference registered → you discover at release time that one SQL statement only errors on prod, costing half a day or more of rework
- ✅ Positive example: both difference rows carry an impact and a conclusion; "not accepted" items are fixed on the spot, "accepted" items state their fallback

**Action 3: Config and secret matrix (one row per key; a missing row = a missed key)**

| Key name | Default value | Source (per environment) | Sensitivity |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | none (must be given explicitly) | dev: `.env` ｜ staging/prod: platform console | D3 |
| `LOG_LEVEL` | `info` | each environment's `.env` or the platform console | D1 |
| Example: third-party `API_KEY` | none | platform console secret store only; rotation period 90 days | D4 |

Sensitivity tiers are fixed at four levels: **D1 public** (may go into the repo) ｜ **D2 internal** (may go into the repo, but contains no personal information) ｜ **D3 sensitive personal information (PII)** (goes only into `.env` / the platform console; forbidden in the repo and in logs) ｜ **D4 confidential** (D3 treatment + encrypted at rest + periodically rotated + invalidated immediately on leak; word-for-word the same tier names as `docs/registry/DATA_DICT.md`). When unsure, treat it as one level higher.

**Action 4: `.env.example` is the single key-name list (update it in the same batch; no backfilling afterwards)**
Any config key added this time → add it to `.env.example` **in the same batch** (key name + one comment line + the shape of an example value only; never a real value), and sync it into the Action 3 matrix.
```powershell
Select-String -Path .env.example -Pattern '^[A-Z]' | ForEach-Object { $_.Line.Split('=')[0] }   # 现有键名清单 (existing key-name list)
```
- ❌ Counter-example: the code uses `process.env.NEW_KEY` but `.env.example` was not updated → the next person to clone it is guaranteed to fail to run it
- ✅ Positive example: in the same batch of commits that adds the key, `.env.example` has that line and the key-meaning table in `docs/RUNBOOK.md` explains it

**Action 5: Data-isolation iron rule (no exceptions)**
- **dev/test data must never be written into prod**: any connection string, migration script, or seed script pointing from dev/staging to prod is forbidden outright (on discovery, stop and report a red light)
- Pulling data from prod into staging: de-identify first (mask D3/D4 fields) and record "who approved it, which tables were pulled"
- `git check-ignore -v .env` must produce output (= it is ignored); if `.env` appears in `git status --porcelain` = stop and report a red light

**Action 6: Environment switch steps (one copyable line; no improvising on the spot)**
```powershell
# 以 Node 项目为例：切换环境 = 换 .env 文件 + 重跑 doctor 自检
# (Node project as an example: switching environments = swap the .env file + re-run the doctor self-check)
Copy-Item .env.staging .env -Force
powershell -NoProfile -File doctor.ps1
```
Run `doctor.ps1` on every switch (it names any version/tool/key-name mismatch); after switching, write "current environment" into `未决问题` in `STATE.md` or into the receipt — do not leave it in your head.

**Action 7: Which config entries a rollback needs (list them up front so they can be changed when it matters)**
Write out the list of config keys that "must be restored together during a rollback" (typical: feature flags, quota thresholds, external dependency endpoints, log level), and give one command line:
```powershell
Copy-Item .env.rollback .env -Force
powershell -NoProfile -File doctor.ps1
```

**Action 8: RUNBOOK write-back**
Add/update the "环境与配置" (environments and config) section of `docs/RUNBOOK.md`: the environment tier table, the staging difference table, the key-meaning table (three columns: key / meaning / example value, including every key added this time), the switch steps, and the rollback config list.

**Action 9: for human-only steps, generate a script for the human to run (the agent does not run it for them)**
For **human-only steps** such as requesting secrets, opening a browser to authorise, creating a remote repository, or confirming a paid item, do not make the human hand-copy scattered command lines — generate a **copyable interactive script**: step by step "explain → wait for confirmation → collect input → write to a local file"; the human runs the script, and the agent does not run it for them.
The script is **single-use** by default (use it once and discard it: it does not go into the repo and is not registered); only once it is confirmed that it will be used repeatedly is it registered in the repo (`docs/registry/COMPONENTS.md`) and added to the registry.
❌ Counter-example: the receipt scatters five commands for the user to hand-copy into the terminal in order (one copy error = the secret lands in the wrong file)
✅ Good example: generate `scripts/setup-staging-secrets.ps1` for the human to run; only once it is confirmed that every rotation needs it again is it registered in the repo

**Prohibitions (violating any one = this round's output is void):**
- Writing real secrets / real connection strings into any file that goes into the repo is prohibited (including comments, examples, and logs)
- Adding a config key without updating `.env.example` is prohibited (there is exactly one key-name list, and it is that file)
- Writing dev/test data into prod, or using prod data as local test data, is prohibited
- Explaining an environment problem with `"我本地是好的"` ("it works on my machine") is prohibited — compare against the difference table line by line, and register anything unregistered first
- The agent performing write operations in the production environment on its own is prohibited (release / migration / data changes are non-delegable and are executed by a human)

---

## ③ Evidence receipt

Give these one by one (only three kinds of evidence count: real command output / file paths / commit hashes):

1. Environment tier table (all three rows: dev/staging/prod)
2. The staging vs prod difference registration table (each row with its impact and its "accepted or not" conclusion; write "none" if there is no difference)
3. Config and secret matrix (key name / default value / source / sensitivity D1–D4)
4. The real output of the environment switch commands (the full `doctor.ps1` text + exit code)
5. The list of key names added to `.env.example` + the file path
6. The real output of `git check-ignore -v .env` (there must be output)
7. The path of the "环境与配置" section in `docs/RUNBOOK.md`; the rollback config-entry list

---

## ④ State write-back

**The closing-order iron rule: write back the state first → then commit → then re-run check.ps1 for 0.**

Update `STATE.md`: `下一步` = 5-2 release; `未决问题` = environment matters needing the user's decision (who approves staging, whether a read-only production snapshot is allowed, who provides the secrets); roll `未来 3 步` as needed; the environments/keys added this time go into the receipt and remain findable in `docs/RUNBOOK.md`.

```powershell
git add docs/RUNBOOK.md .env.example STATE.md
git commit -m "4-5 chore(env): 环境分层与配置矩阵落档"
powershell -NoProfile -File check.ps1
```

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
