# Card 7-7 · User documentation and handover (mandatory before delivery / handover)
> Trigger: delivery acceptance / someone else takes over ｜ Output: docs/USER_GUIDE.md (six sections, including the six-column handover checklist) ｜ Next: 5-1 Archive
> Process area: KNOW

---

## ① Start confirmation

1. **Plain-language restatement and landing point**: write the project up as one document that lets someone else open it, ask about it and take it over; output = `docs/USER_GUIDE.md` (six sections, including the six-column handover checklist); next card = 5-1 Archive.
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "the person taking over also uses Windows"), and note the verification method for each; anything that can be looked up from the 3 startup steps in the project-root `README.md` / the document map must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: the default three questions — who is the delivery for (your own use / a colleague takes over / an external customer)? Who is the person taking over (this decides the contact column of the handover checklist)? By what date must the handover be finished (this decides the expiry dates)? If there are none, write "none".
4. **Quote the checklist of this card verbatim** (paste the "five delivery checks" from §② word for word):
   - [ ] Quick start in ≤3 steps, each step an indivisible action, all written in the user's words
   - [ ] At least 5 FAQ items, each with a real source (ticket / tech-debt line number), sorted by how often it comes up
   - [ ] The glossary has both columns (user's word ↔ program word), and the program words come from the same source as the "人话标识" (plain-language label) column of the registry
   - [ ] The handover checklist has all six columns (账号 / 密钥 / 环境 / 待办 / 联系人 / 到期时间 — account / secret / environment / to-do / contact / expiry date), no gaps; secrets record only the storage location, never the value
   - [ ] The person taking over runs the quick start on their own machine, and the documents are committed in the same batch as the code
5. **Boundary statement**: handover confirmation is decided by the user; the actual transfer of accounts and secrets is performed by a human, and the agent only produces the checklist and the evidence.

---

## ② Execution

**Checklist of this card (the five delivery checks, tick item by item):**
- [ ] Quick start in ≤3 steps, each step an indivisible action, all written in the user's words
- [ ] At least 5 FAQ items, each with a real source (ticket / tech-debt line number), sorted by how often it comes up
- [ ] The glossary has both columns (user's word ↔ program word), and the program words come from the same source as the "人话标识" (plain-language label) column of the registry
- [ ] The handover checklist has all six columns (账号 / 密钥 / 环境 / 待办 / 联系人 / 到期时间 — account / secret / environment / to-do / contact / expiry date), no gaps; secrets record only the storage location, never the value
- [ ] The person taking over runs the quick start on their own machine, and the documents are committed in the same batch as the code

**Action 1: quick start (≤3 steps, the user's point of view)**
- One step = one indivisible action; words such as "environment variable", "dependency", "migration" and "deployment" are forbidden.
- ❌ Counter-example: "先 clone 仓库，装 Node，跑 npm i，配好 .env，执行迁移，再 npm run dev" ("first clone the repo, install Node, run npm i, set up .env, execute the migration, then npm run dev")
- ✅ Good example: "① do step 1 of the 3 startup steps in the project-root README.md ② see "可以开始用了" ("you can start using it") ③ if it will not open, read FAQ item 1"

**Action 2: FAQ (≥5 items, each with a real source)**
```powershell
Get-ChildItem docs/specs -Recurse -Filter INCIDENT.md | Select-String -Pattern '现象|一句话'
Select-String -Path docs/TECH_DEBT.md -Pattern '^\|\s*TD-'
```
- Each item is four lines: symptom (the user's own words) → cause (one plain sentence) → what to do (a copyable command or where to click) → source (file name + line number).
- ❌ Counter-example: "可能网络问题，重试即可" ("probably a network problem, just retry", with no source and no executable action)
- ✅ Good example: "打不开页面｜端口被占用｜换项目根 README.md 的启动 3 步里的备用端口命令｜来源：docs/TECH_DEBT.md:12" ("the page will not open | the port is taken | use the backup-port command in the 3 startup steps of the project-root README.md | source: docs/TECH_DEBT.md:12")
- When ≥2 tickets hit the same symptom → put that item first and mark the occurrence count in the source column.

**Action 3: glossary (user's word ↔ program word)**
```powershell
Select-String -Path docs/registry/COMPONENTS.md -Pattern '人话标识'
```
- Two columns; a program word must come from the same source as the "人话标识" column of the registry, and inventing a second set of names is forbidden.
- ❌ Counter-example: "订单状态机" ("order state machine", which the user will never search for) ｜ ✅ Good example: "还没发货 ↔ 待发货状态" ("not shipped yet ↔ pending-shipment state")

**Action 4: handover checklist (six columns; one missing column = incomplete)**

| 账号 (account) | 密钥 (secret) | 环境 (environment) | 待办 (to-do) | 联系人 (contact) | 到期时间 (expiry date) |
| :-- | :-- | :-- | :-- | :-- | :-- |
| which system account, where to log in | only "entry Y in password manager X" | what to install, which command to run | what is not finished | who to call when something breaks | one date per item |

- A secret row records only the storage location and the person taking over; **writing any value is forbidden** (a real secret = red line, stop immediately and ask the user).
- A to-do row without an expiry date must go back to the user for one; leaving it blank is forbidden.
- ❌ Counter-example: "服务器密码：abc123" ("server password: abc123") ｜ ✅ Good example: "服务器登录：密码管理器『项目 X』条目，接管人 @小李，到期 2026-11-01" ("server login: the "项目 X" entry in the password manager, taker @小李, expires 2026-11-01")

**Action 5: drift check (documents and code updated in the same batch)**
- Write "最近核对：<日期> @ <提交哈希>" ("last checked: <date> @ <commit hash>") at the top of each document; if a screen or a command changed and the document did not follow → register it in `docs/TECH_DEBT.md`.
- ❌ Counter-example: "文档早就写好了" ("the docs were written long ago") ｜ ✅ Good example: "USER_GUIDE 最近核对 2026-10-01 @ a1b2c3d；界面改了没跟上 → 登记 TD-013，到期 2026-10-20" ("USER_GUIDE last checked 2026-10-01 @ a1b2c3d; the screen changed and it did not follow → registered as TD-013, due 2026-10-20")

**Action 5b: handover note (written for the next session / the taker)**
- **The handover note goes into the system temp directory** (not into the repository), with the fixed file name `handover_<日期>.md`:
```powershell
$tmp = if ($env:TEMP) { $env:TEMP } else { '/tmp' }
"handover note path = $tmp/handover_$(Get-Date -Format 'yyyy-MM-dd').md"
```
- The content holds **pointers, not copies**: the repository path, the current card number, the start anchor, the next step, the open questions, and which files must be read (each with its file path + line numbers).
- Copying out the body text that already exists in other artifacts is forbidden (a copy will always drift): for the body text of USER_GUIDE / STATE.md / the reports, give the path and never duplicate the paragraphs.
- Desensitize secrets and personal information before writing: tokens, passwords, phone numbers, e-mail addresses and real names are all written as "see entry X in the password manager / ask the user", and the file in the temp directory is deleted once the handover is done.
- ❌ Counter-example: pasting the whole USER_GUIDE into the handover note (two copies of the body text; next time one place is changed and the other is not → the taker reads the stale one)
- ✅ Good example: "repository <project root> | current card 7-7 | start anchor a1b2c3d | next step 5-1 Archive | open: the handover checklist lacks expiry dates | read first docs/USER_GUIDE.md:70-90, STATE.md `未决问题`"

**Action 6: the taker runs it independently (the confirmation is done by a human)**
- Hand "quick start + what to do when it fails" to the person taking over and have them walk it from zero on their own machine; the agent only prepares the commands and the record table.
- If it does not run → stop and ask the user (stop when the same error happens twice); operating the machine on the taker's behalf is forbidden.

**Action 7: write `docs/USER_GUIDE.md` (six sections, one document is enough)**
- Six sections: what this is / quick start in 3 steps / FAQ / glossary / handover checklist (six columns) / last checked (date + commit hash).
- The first four sections are for the person *using* it and the handover checklist is for the person *taking it over*; a fact is written in one place only and the other place points to it.
- ❌ Counter-example: copying the handover checklist into a second document (one fact maintained in two places will always drift) ｜ ✅ Good example: the handover checklist is the "handover checklist" section of `docs/USER_GUIDE.md`, with all six columns and secrets recorded as locations only

**Prohibitions (violating any one of them = this round's output is void):**
- Programmer words (dependency / environment variable / migration / deployment) in user documentation are forbidden
- An FAQ item without a source is forbidden (an invented Q&A = hallucination)
- Writing the value of a secret or a password in the handover checklist is forbidden, and so is a to-do without an expiry date
- Changing code without writing the documents back is forbidden (drift not registered = red light)
- The agent announcing "handover complete" is forbidden: only a human can confirm it

---

## ③ Evidence receipt

Give, item by item:
1. The path of `docs/USER_GUIDE.md` + its line count + the number of quick-start steps + the number of FAQ items with their source lines
2. The number of glossary entries + the comparison against the "人话标识" column of the registry (how many match, which differ)
3. The record of the taker running it independently (whose machine, the commands verbatim, the real output; if not run: `not yet run, awaiting human confirmation`)
4. The user's verdict on "handover confirmation" quoted word for word + the expiry dates of the six handover columns

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `最近完成` insert one entry: user documentation and handover checklist done
- `下一步` = 5-1 Archive
- `未决问题` = the handover items still to be confirmed (list, item by item, any that lack a taker or an expiry date)
- `工作树状态` = 干净

```powershell
git add STATE.md docs/USER_GUIDE.md
git commit -m "7-7 docs(handover): 用户文档与交接清单"
powershell -NoProfile -File check.ps1
```
The exit code must be 0; non-zero → stop and ask the user; announcing that this card is complete is forbidden.

**Next card**: 5-1 Archive. Touching authentication / payment / data deletion → stop and ask the user, and raise the tier to 3-2 Threat modeling.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
