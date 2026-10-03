# <项目名>

> 一句话：<这个项目做什么、给谁用>（立项结论见 docs/decisions/）

> 开发流程：**Roadbook V6 母版**——动作照母版流程卡走（英文执行版 `playbook_EN/` 优先，中文判据版 `playbook/` 兜底）；`check/doctor/gate/orphans` 四个守护脚本随本项目走。

## 快速启动

```powershell
powershell -NoProfile -File doctor.ps1   # 环境自检：每项输出版本号=通过
# 启动开发服务（1-2 卡按选型填，如 pnpm dev / python -m app）
powershell -NoProfile -File check.ps1    # 收工仪式：退出码 0 = 可以说"完成"
```

## 这个项目怎么运作

- `AGENTS.md`——项目宪法：agent 每次会话自动读的规则（范围四禁/停问规则/完成定义）
- `STATE.md`——状态仪表盘：项目现在在哪、下一步做什么、等谁裁决什么
- `docs/`——机制文档：组件注册表/数据字典/接口清单/决策卡/教训卡/归档
- 每个开发动作——照母版流程卡走：开工确认 → 执行 → 证据回执 → 状态回写，四段照做，不必额外读手册

## 给未来（三个月后）的自己

放了两周回来不知从哪开始？发一次母版的 0-1-驱动卡，说"看看状态"或直接说你要做什么。
