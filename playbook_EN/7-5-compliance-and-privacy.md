# Card 7-5 · Compliance and privacy (required when collecting personal data / publishing publicly)
> Trigger: collecting personal information / launching a public service / adding a third-party SDK ｜ Output: docs/PRIVACY.md + root LICENSE ｜ Next: 4-1 Batch coding (when code must change) / 5-1 Archive (pure governance)

---

## ① Start confirmation

1. **Plain-language restatement and landing point**: which user data this project has and what is being published publicly; output = `docs/PRIVACY.md` + root `LICENSE`; next card = 4-1 Batch coding (when this card produces code changes).
2. **Assumptions list**: write "I assume X; if wrong, then Y is invalid" line by line (for example: "the project has no payment feature, so no payment data is involved"), and note the verification method for each; anything that can be looked up from docs/registry/DATA_DICT.md or the source code must not be written as an assumption.
3. **Clarifying questions (≤5, delete any that can be deleted)**: the default four questions — which personal fields are collected (email / phone number / address / ID document / location)? Which third parties can see the data (SDK, email service, analytics)? Which regions is the service open to (this decides which regulatory definition applies)? How many days is the promised time limit for a deletion request? If there are none, write "none".
4. **Verdict announced in advance**: the data map is produced first, then sensitivity tiers D1–D4 are assigned; if this project truly involves no personal data and is not published publicly, the verdict is `N/A（理由）` with the reason written out.
5. **Quote the checklist verbatim** (paste the "five compliance checks" from §② of this card word for word):
   - [ ] The data map has all five columns (what is collected / why it is collected / where it is stored / how long it is kept / who can see it), and every cell has content or `N/A（理由）`
   - [ ] Every personal field is labeled with sensitivity tier D1–D4, and D3/D4 have a landing file and line for encryption or masking
   - [ ] The four rights — access / correction / deletion / export — each have a copy-pasteable operating path (a specific page or command)
   - [ ] The license of every third-party dependency has been checked against the root LICENSE item by item, with the result written into the report
   - [ ] Secrets and log masking have been checked (zero real secrets appear, D3/D4 fields do not leak)
6. **Boundary statement**: the compliance definitions are decided by the user; deletion and export of account secrets and real data are executed by a human — the agent only drafts and supplies evidence.

---

## ② Execution

**Checklist of this card (the five compliance checks, tick item by item):**
- [ ] The data map has all five columns (what is collected / why it is collected / where it is stored / how long it is kept / who can see it), and every cell has content or `N/A（理由）`
- [ ] Every personal field is labeled with sensitivity tier D1–D4, and D3/D4 have a landing file and line for encryption or masking
- [ ] The four rights — access / correction / deletion / export — each have a copy-pasteable operating path (a specific page or command)
- [ ] The license of every third-party dependency has been checked against the root LICENSE item by item, with the result written into the report
- [ ] Secrets and log masking have been checked (zero real secrets appear, D3/D4 fields do not leak)

**Action 1: data map (five columns; one missing column = not done)**
Fill it in field by field: what is collected / why it is collected (purpose) / where it is stored (table or file) / how long it is kept / who can see it (which third parties, which internal roles).
```powershell
$kw = 'email'        # change the keyword field by field: email / phone / address / location
Select-String -Path src -Recurse -Pattern $kw | Select-Object Path, LineNumber
Select-String -Path docs/registry/DATA_DICT.md -Pattern $kw | Select-Object LineNumber, Line
```
- ❌ Counter-example: "收集邮箱用于通知" ("collect email for notifications") — it does not say where it is stored, how long it is kept, or who can see it
- ✅ Good example: "邮箱｜注册与订单通知｜users 表 email 列｜账号注销后 30 天｜仅后端服务与邮件服务商 X" ("email | sign-up and order notifications | users table, email column | 30 days after account closure | backend service and email provider X only")
- Real user data appearing in the table = a violation; write only field names and types.

**Action 2: sensitivity tiers D1–D4 and their handling**
- D1 public: product name, public documentation → no extra handling
- D2 internal: user ID, order number → access control (not exposed outside)
- D3 personal: email, phone number, address, device identifier → encryption in transit and at rest + masked by default in the UI + never written to logs
- D4 sensitive: password hash, payment information, ID document number, precise location, health data → encryption + strong access control + access audit trail + minimization (do not collect what need not be collected)
```powershell
Select-String -Path docs/registry/DATA_DICT.md -Pattern 'D3|D4' | Select-Object LineNumber, Line
Select-String -Path src -Recurse -Pattern 'phone|id_card|latitude|password' | Select-Object Path, LineNumber
```
- ❌ Counter-example: "手机号算普通信息，不用管" ("a phone number counts as ordinary information, no need to bother")
- ✅ Good example: "手机号 = D3：入库前加密，界面只显示 138****1234，日志禁止打印原值" ("phone number = D3: encrypted before it is stored, the UI shows only 138****1234, printing the raw value in logs is forbidden")
- A D4 field that is not encrypted = red light: stop and ask the user; publishing publicly is forbidden.

**Action 3: user rights paths (four rights, each written down to an actionable level)**

| Right | Entry point | Who executes | Time limit |
| :-- | :-- | :-- | :-- |
| Access | Account settings → "我的数据" ("My data") page | User self-service | Immediate |
| Correction | Account settings → profile editing | User self-service | Immediate |
| Deletion | Submit a deletion request (page / email / ticket) | Human executes (non-delegable) | ≤30 days |
| Export | Account settings → "导出我的数据" ("Export my data") | User self-service | ≤7 days |

- The "entry point" must be written down to a specific page or command; writing "联系管理员" ("contact the administrator") is not acceptable.
- Deletion and export touch real data: the agent only drafts the path and the command draft; a human executes and keeps the record.

**Action 4: third-party dependency license check**
```powershell
npm ls --depth=0            # Node projects; for Python projects use pip list instead
```
- Copy every `name@version` → license into the "dependency license list" of `docs/PRIVACY.md`; then compare each against the root `LICENSE` for compatibility.
- Compatible: MIT / Apache-2.0 / BSD / ISC can coexist with MIT-style licenses; GPL / AGPL / SSPL are viral or carry usage restrictions → stop and ask the user, and register a replacement candidate in docs/TECH_DEBT.md.
- ❌ Counter-example: "依赖挺多的，应该都是 MIT" ("there are quite a few dependencies, they should all be MIT")
- ✅ Good example: "逐个列出 37 个依赖的 license；发现 xxx@2.1.0 是 AGPL-3.0 → 停下问用户，登记替换候选 TD-012" ("list the license of all 37 dependencies one by one; found that xxx@2.1.0 is AGPL-3.0 → stop and ask the user, register replacement candidate TD-012")

**Action 5: privacy policy highlights (the plain-language version for users)**
Write it into the "one page for users" section of `docs/PRIVACY.md`, six sentences: what is collected / why it is collected / how long it is kept / who it goes to / how to delete / how to get in touch.
- ❌ Counter-example: "基于合法利益处理个人数据" ("personal data is processed on the basis of legitimate interest") — users cannot understand it
- ✅ Good example: "我们用你的邮箱给你发订单通知；不想收可以在设置里关掉。" ("we use your email to send you order notifications; if you do not want them, you can turn them off in settings.")

**Action 6: secret and log masking check**
```powershell
Select-String -Path src -Recurse -Pattern 'api[_-]?key|secret|password\s*='
Select-String -Path src -Recurse -Pattern 'console\.log|logger|print' | Select-String -Pattern 'email|phone|token|password'
```
- A real secret hit by the first command = red line: stop, have a human revoke and rotate that secret (git history is readable forever), and re-run after the fix to get zero hits.
- A D3/D4 field hit by the second command = fix the logging (print a masked value or drop it), then re-run to get zero hits.

**Action 7: not-applicable verdict**
If the project collects no personal data, is not published publicly and adds no third-party SDK → write `N/A（理由：…）` in `docs/PRIVACY.md` and end this card. An empty file is forbidden, and skipping the verdict is forbidden ("not done" and "judged not applicable" are two different things).

**Prohibitions (violating any one of them = this round's output is void):**
- The agent is forbidden to delete or export real data (non-delegable: a human must execute it)
- Writing real secrets or real personal information into reports, examples or commit messages is forbidden
- Blank cells are forbidden: every cell gets content or `N/A（理由）`
- Publishing publicly without checking licenses is forbidden
- Touching authentication / payment / data deletion → stop and raise the tier (tier L, and run 3-2 Threat modeling)

---

## ③ Evidence receipt

Give, item by item:
1. `docs/PRIVACY.md` path + the number of rows in the data map + the number of entries in the dependency license list
2. The real output of the secret and personal-information scan commands (zero hits, or the handling after a hit plus the re-run result)
3. Root `LICENSE` path and type; the list of incompatible items (write "无" if there are none)
4. The user's verdict on the "compliance definitions", quoted (data retention period, sharing recipients, deletion time limit, item by item)

---

## ④ State write-back

**Closing-order iron rule: write back state first → then commit → then re-run check.ps1 for 0.**

Update STATE.md:
- `当前任务` cleared (pure governance) or kept (when this card brings code changes)
- `下一步` = 4-1 Batch coding (when there are code changes) / 5-1 Archive (pure documentation governance)
- `未决问题` = the compliance definitions awaiting the user's verdict (retention period / sharing recipients / deletion time limit)
- `红线摘要`: a new D4 field or a new third-party sharing arrangement → add one line

```powershell
git add STATE.md docs/PRIVACY.md LICENSE
git commit -m "7-5 docs(compliance): 数据地图与许可核对"
powershell -NoProfile -File check.ps1
```
(When the root `LICENSE` already exists and its type has not changed, it needs no edit — add it to `git add` only when it must be updated.)

**Next card**: 4-1 Batch coding (when the data map or the scan results bring code changes); pure documentation governance → 5-1 Archive. Touching authentication / payment / data deletion goes through 3-2 Threat modeling first.

Fixed closing line:
`Awaiting your verdict. Reply "continue" to run the next card, or give a new instruction.`
