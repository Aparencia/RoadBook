# Card 8-3 · DSH Tools and Plugins (read when switching machines, installing plugins, or wiring MCP)
> Trigger: switching machines, installing or removing plugins, wiring MCP, changing the DSH version, or writing tool documentation. | Output: `docs/TOOLING.md`. | Next: back to the current tier's main line (S→4-1 / M→2-x or 4-1 / L→3-1; incident line→6-1).

---

## ① Start confirmation

Confirm in four lines; a missing line blocks the work:

1. Version reading: this machine's DSH version + the version line in `docs/TOOLING.md` (commands in Action 1; the two must agree).
2. Which plugins or which MCP server this round touches, and why now.
3. Output landing point: `docs/TOOLING.md` (version line / plugin purpose table / triggers and off switch / MCP and permission wording), capped at 60 lines.
4. Open questions (≤5): permission scope, credential ownership, whether any old plugin must be removed.

---

## ② Execution

### Action 1 · Version line and the version-change flow

```powershell
if (Test-Path 'docs/TOOLING.md') { "行数 " + (Get-Content 'docs/TOOLING.md' -Encoding UTF8).Count } else { 'MISS docs/TOOLING.md' }
Get-Content 'docs/TOOLING.md' -Encoding UTF8 | Select-String -Pattern 'DSH' | Select-Object -First 1
Get-Content '.tool-versions' -Encoding UTF8 | Select-String -Pattern '^dsh\s'
```

Criteria: `docs/TOOLING.md` exists and stays within 60 lines; its version line names the local DSH version (`0.2.0-rc2` today — the single place to edit when the version changes); the third command prints **nothing** (`.tool-versions` holds this project's own dependencies only, never `dsh` — doctor.ps1 would red-light it as a tool missing from PATH, and machines without DSH must still be able to run this whole process).

Version-change order (upgrade or downgrade): run `powershell -NoProfile -File doctor.ps1` to see what it flags → install the target version → write the new version into the `docs/TOOLING.md` version line → re-run `doctor.ps1` and `check.ps1`, and **both must exit 0 before the environment counts as usable** → state "environment change" in the wrap-up receipt. Change `.tool-versions` only when the project's own dependencies change; changing any line of it counts as an environment change and is never done in passing.

❌ Writing a version number into docs from memory. ✅ Copying it from command output.
❌ Putting `dsh 0.2.0-rc2` into `.tool-versions`. ✅ The version line lives in `docs/TOOLING.md`, and `dsh` cannot be found in `.tool-versions`.

### Action 2 · Plugin purpose table (every row must answer "when to install, when to remove")

| Plugin | Card it serves | Install when | Remove when |
| :-- | :-- | :-- | :-- |
| Agent Teams (`dsh-experimental-agent-team-profile`) | 8-1 | Two or more independent files change in parallel, or task-board receipts are needed | Single-file work resumes (avoids reflexive team building) |
| subagent / subagent_fork / workflow (built in, nothing to install) | 8-1 | `subagent` for one-shot tasks, `subagent_fork` to inherit context, `workflow` for large fan-out | Not applicable (no plugin to remove; a wrong form is fixed by switching forms) |
| auto-review | 4-2 | You want an automatic review pass before committing | Review cadence is stable (it blocks commits and slows small changes) |
| code-review | 4-2 | A review report worth keeping is needed | The same review round is finished |
| context (compression and context accounting) | 8-2 | Tasks span several turns and compression summaries are needed (installed by default) | Only single-turn small tasks run |
| mnemon (hot memory + project documents) | 8-2 | Preferences and stable facts must survive across sessions, or project documents need searching | All work happens inside one session |
| mcp-connector | 8-3 | An external system must be reached; one server at a time | As soon as it is unused (every server is a new credential surface) |
| skills-manager (`create_skill`) | 8-3 install and distribution | The process must be installed as a user-level skill | Running the master copy locally is enough |
| cost-meter | 8-1 | Concurrency ≥3 or a long task: read it before setting concurrency | Single-person small changes |
| schedule | 5-4 / 5-5 | Timed reminders are needed (drill due dates, backup checks) | One-off tasks |
| better-sidebar (`present`) | 3-4 / 5-1 | Interfaces, screenshots or deliverables must be shown to a human | Backend-only projects |
| gitbash-shell | Command wording | On Windows when bash-style scripts run and commands must use forward slashes | PowerShell-only environments |
| roadbook-autoload | Whole flow (distribution) | The workflow cards should auto-load inside git projects | Automatic injection is unwanted: set the plugin config `mode` to `off` (no removal needed) |

**Prohibitions (violating any one voids this round's output)**: never install a plugin whose docs you have not read; never treat a plugin as the process (plugins supply tools, the cards still drive the actions); never write credentials into docs, receipts or memory.

### Action 3 · roadbook-autoload (auto-load switch and false triggers)

- Triggers (a hit injects the cards): 实现 / 开发 / 重构 / 修复 / 优化 / 迁移 / 清理 / 归档 / 发布 / 验收 / 复盘 / 体检 / 开工 / 收工 / 按流程 / 走流程 / 流程卡 / 路书 / roadbook, plus English words such as implement / refactor / migrate / fix bug / release / code review / clean up.
- Suppressors (a hit blocks injection; they outrank triggers): 只讨论 / 先讨论 / 只回答 / 不要动代码 / 不改代码 / 不用流程 / 关闭流程 / 跳过流程 / 不要实现.
- Three gates: the session is inside a git project + the user message hits a trigger + nothing was injected this session yet (a typed `/roadbook` takes precedence; subagents are skipped by default).
- Off switch: set the plugin config `mode` to `off` (three states `keyword` / `always` / `off`), then re-enable or refresh for it to take effect.
- False triggers: first add a suppressor to the message and see whether it yields; then read the observation log's `reason` (`no-hit` / `not-git` / `once-per-session` / `subagent` / `mode-off`) to find which gate fired; when it is never wanted, use `mode: off`.
- Plugin self-test (offline, no repository changes): `node plugin/roadbook-autoload/test/trigger.test.mjs`.

❌ Concluding "I guess it did not fire". ✅ Pasting the observation log's `reason`.
❌ Declaring the plugin usable without running its self-test. ✅ Self-test passes plus one line of real output.

### Action 4 · Skill install and update path

- Install: clone this repository to `~/.dsh/skills/roadbook` (the directory layout resolves relative paths back to the master root).
- Update: after changing the master copy you must push, otherwise machines that installed the skill stay on the old version; pull once on each target machine afterwards.
- Distribution rule: the process text exists in exactly one place; if two copies disagree, the master wins and the copy is deleted.

```powershell
if (Test-Path "$HOME/.dsh/skills/roadbook") { 'OK 已装 skill' } else { 'MISS 未装 skill' }
```

❌ Announcing "the skill is updated" after editing the master without pushing. ✅ Push, pull on the target machine, verify the version line.

### Action 5 · MCP connector discipline

Connect, health-check, enable, disable and remove through the `mcp_connector_*` tool family; never hand-edit the configuration files.

- Credentials stay on the local machine: never in the repository, receipts or memory; docs record only which connector holds them.
- Prefer read-only tools: connect read-only first; when writes are truly needed, say what will be written and whom it affects.
- Read the vendor docs first: confirm data scope, permissions, rate limits and billing; point at production data with a read-only account.
- Remove when done: never keep a temporary connection around; when a connection misbehaves, check its health first, then decide between reconfiguring and removing.

❌ Pasting a token into a receipt so a colleague can "configure it themselves". ✅ Each machine configures its own; the receipt names the connector and purpose only.
❌ Connecting to a production database with full rights for convenience. ✅ A read-only account plus a statement of what will be read.

### Action 6 · Boundaries of plan / goal / schedule

- `plan`: only to lay a proposal before a human before acting (read-only reasoning); leave plan mode as soon as the proposal is settled — never use it to edit files.
- `goal`: a multi-round persistent objective that must carry completion criteria; never create one for single-round work; mark blocked only after the same blocker persists for three consecutive rounds.
- `schedule`: timed reminders (drills, backups, retrospectives); it never replaces a workflow card — when the reminder fires, the card still runs.

❌ Using `goal` as auto-continue to skip per-round receipts. ✅ A milestone receipt every round.
❌ Scheduling automatic releases. ✅ Releases are non-delegable and stay with a human.

### Action 7 · Permissions and sandbox

- Default workspace-write: the workspace is writable; when an out-of-scope write is denied, stop and tell the user instead of routing around it.
- Read-only mode (review, reconnaissance): read files and read-only commands only; propose no edits.
- Dangerous commands (deleting files or directories, rewriting repository history, touching real data, releasing, tagging) require one sentence first — what it does, what it affects, whether it is recoverable — and confirmation before running; releases, tags and data deletion always stay with a human.
- Debug output states the conclusion and the evidence, not the whole raw dump.

### Action 8 · Anti-patterns (hitting any one forces this card's redo)

1. Treating a plugin as the process: installing Agent Teams and assuming parallel work is now compliant, with no task board and no receipts.
2. Credentials in the repository: an MCP token written into `docs/TOOLING.md` or a commit message.
3. Installing a plugin without reading its docs: enabling something whose file or network behaviour is unknown.
4. Recording only "installed", never the off switch and triggers (the next false trigger leaves nobody able to turn it off).
5. Removing a plugin and deleting someone else's configuration along the way (files outside the workspace).

Boundary: this card selects no tier and reorders no main line; it is walked only when switching machines, installing plugins, wiring MCP, or changing versions.

---

## ③ Evidence receipt

Only three kinds of evidence count: real command output / file paths / commit hashes. Give each one:

1. Version evidence: the version line in `docs/TOOLING.md` + real output showing no `dsh` line in `.tool-versions` + key lines of the `doctor.ps1` result.
2. `docs/TOOLING.md`: path + line count + all four sections (version line / plugin table / triggers and off switch / MCP and permission wording).
3. Plugin actions: what was installed, what was removed, config file paths.
4. Self-test output: the passing line from `trigger.test.mjs` (only when the plugin changed).
5. Credential self-check: confirm no real credential appears in docs, receipts or commits.

---

## ④ State write-back

1. Write back first: update `docs/TOOLING.md` in the four sections above (the version line records the DSH version measured on this machine; `.tool-versions` never carries `dsh`); when a plugin or version changed, also update the root `CHANGELOG.md` unpublished section.
2. This card does not move the main-line pointer unless it changed main-line deliverables; `STATE.md` only updates `风险摘要` or `未决问题` when the version or environment changed.
3. Then commit: `git add -A`, `git commit -m "8-3 docs(tooling): DSH version and plugin purpose table"`.
4. Finally re-run `powershell -NoProfile -File check.ps1` and take exit code 0.

---

Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.
