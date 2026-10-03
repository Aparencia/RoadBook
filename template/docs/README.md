# docs/ · 机制文档地图

> 本目录是项目的记忆：现状查 registry，欠账查 TECH_DEBT，历史查 archive。
> 本项目按 **Roadbook V6** 流程运作：动作照母版 `playbook/` 卡走，状态看根 `STATE.md`。行为规则不在本文件——在项目根 AGENTS.md（宪法）；每个文件自己的用法写在它顶部几行里。

## 地图（什么在哪）

| 位置 | 放什么 |
| :-- | :-- |
| ARCHITECTURE.md | 系统组成：模块图/分层/数据流/新代码落点——**agent 动代码前必读** |
| RUNBOOK.md | 部署/回滚/备份/.env 键含义——**出事先看这里** |
| registry/ | 防重复三件套：COMPONENTS（界面↔代码）/ DATA_DICT（表结构）/ APIS（接口与错误码） |
| pool/IDEAS.md | 需求池：一切想法先进池，说"启动"才进流程 |
| specs/ | 任务工作区：一个任务一个目录（调研/范围/验证产物），完结移入 archive |
| decisions/ | 决策卡：为什么这么做+被否方案+复活条件（文件名即索引：类型_日期_主题） |
| reviews/ | 代码审查报告（留存历史） |
| versions/ | 版本详情 vX.Y.Z.md；索引在根 CHANGELOG.md |
| lessons/ | 教训卡 ≤12 行（文件名含症状关键词；查重 `Select-String -Path docs/lessons/*.md -Pattern "关键词"`）；已预置跨项目通用种子卡，项目专属教训随开发累积 |
| TECH_DEBT.md | 唯一债务台账（关闭必须附证据） |
| archive/ | 归档区：完结任务+债务滚动快照，目录名 `archive/<日期>_<slug>/`（git mv 保历史） |
| 条件文档（触发才建） | USER_GUIDE / PRIVACY / LICENSE / openapi.yaml——由 41 发布卡、22 设计卡的检查项触发；没触发就是不建，不是欠账 |

## 读取节奏（三层）

- **常驻**（agent 每会话必读）：根目录 AGENTS.md + STATE.md——不在本目录
- **现行状态**（按需查）：registry 三件套 / TECH_DEBT / pool——**找不到先查再建，禁止平行新建**
- **留存历史**（不主动读）：decisions / reviews / versions / lessons / archive——按症状或编号检索

## 防膨胀（40 归档卡自动执行，人不用记）

lessons/ 与 decisions/ 各超 30 张 → 最旧且 90 天无引用的移入 archive/（预置种子卡不参与这个排序）；specs 超 30 天未动提示归档。

## 死代码与孤儿（删除腐化治理）

新实现落地同批删旧实现；删不掉登记 `STATE.md` 并行态登记簿。新增文件同批登记 COMPONENTS。`powershell -NoProfile -File orphans.ps1` 出五张清单（文件级孤儿/零引用导出/文档幽灵/反向幽灵/未登记，只报不拦）——40 卡归档时跑，每条必须落"删除 / 登记技术债 / 补登记"。文件数超 `STATE.md` 文件数基线 + 20 → `check.ps1` 判红。
