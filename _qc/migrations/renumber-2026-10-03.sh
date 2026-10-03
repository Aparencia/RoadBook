#!/usr/bin/env bash
# _qc/migrations/renumber-2026-10-03.sh
# 迁移留痕（第一步）：Roadbook V6 卡号从「两位序号」→「阶段-行为序号」。
# 用法（母版根）：bash _qc/migrations/renumber-2026-10-03.sh
# 第二步（引用重写）：node _qc/migrations/renumber-2026-10-03.mjs
set -u
cd "$(dirname "$0")/../.."

n=0
mv_card() {
  if [ -f "playbook/$1" ]; then
    git mv "playbook/$1" "playbook/$2" && n=$((n + 1))
  else
    echo "  [skip] playbook/$1 不存在（可能已迁移）"
  fi
}

mv_card 00-驱动卡.md        0-1-驱动卡.md
mv_card 10-想法调研.md      1-1-想法调研.md
mv_card 11-选型初始化.md    1-2-选型初始化.md
mv_card 12-接入已有项目.md  1-3-接入已有项目.md
mv_card 20-功能调研.md      2-1-功能调研.md
mv_card 21-需求范围.md      2-2-需求范围.md
mv_card 22-设计.md          3-1-设计.md
mv_card 23-分批编码.md      4-1-分批编码.md
mv_card 24-代码审查.md      4-2-代码审查.md
mv_card 25-验证.md          4-3-验证.md
mv_card 30-根因分析.md      6-2-根因分析.md
mv_card 31-修复.md          6-3-修复.md
mv_card 32-回归验证.md      6-4-回归验证.md
mv_card 40-归档.md          5-1-归档.md
mv_card 41-发布.md          5-2-发布.md
mv_card 42-复盘.md          6-5-复盘.md
mv_card 43-流程体检.md      6-6-流程体检.md
mv_card 50-UI改动.md        7-1-UI改动.md
mv_card 51-依赖升级.md      7-2-依赖升级.md
mv_card 52-技术债清偿.md    7-3-技术债清偿.md
mv_card 53-功能下线.md      7-4-功能下线.md

echo "已迁移 $n 张卡"
