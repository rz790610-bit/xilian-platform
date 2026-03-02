#!/bin/bash
# FIX-045: CI 契约兼容性检测脚本
#
# 用途：在 CI 中验证 shared/contracts/v1/ 类型变更是否破坏向后兼容
#
# 检查内容：
#   1. contracts/v1/ 中的导出是否只增不删
#   2. 新增类型是否从 index.ts 导出
#   3. TypeScript 编译是否通过
#
# 使用方式：
#   bash scripts/check-contracts.sh              # 与 main 分支对比
#   bash scripts/check-contracts.sh origin/dev   # 与指定分支对比

set -euo pipefail

BASE_BRANCH="${1:-main}"
CONTRACT_DIR="shared/contracts/v1"
EXIT_CODE=0

echo "=== 契约兼容性检查 ==="
echo "Base branch: $BASE_BRANCH"
echo "Contract dir: $CONTRACT_DIR"
echo ""

# ============================================================
# 1. 检查导出是否只增不删
# ============================================================

echo "[1/4] 检查导出变更..."

# 获取 base 分支的导出列表
BASE_EXPORTS=$(git show "${BASE_BRANCH}:${CONTRACT_DIR}/index.ts" 2>/dev/null | grep -E "^\s*(export|type)" || echo "")
CURRENT_EXPORTS=$(cat "${CONTRACT_DIR}/index.ts" 2>/dev/null | grep -E "^\s*(export|type)" || echo "")

if [ -n "$BASE_EXPORTS" ]; then
  # 提取导出的标识符名
  BASE_NAMES=$(echo "$BASE_EXPORTS" | grep -oE '\b[A-Z][a-zA-Z]+\b' | sort -u || true)
  CURRENT_NAMES=$(echo "$CURRENT_EXPORTS" | grep -oE '\b[A-Z][a-zA-Z]+\b' | sort -u || true)

  # 检查删除的导出
  REMOVED=$(comm -23 <(echo "$BASE_NAMES") <(echo "$CURRENT_NAMES") || true)
  if [ -n "$REMOVED" ]; then
    echo "  [WARN] 以下导出已从 index.ts 中移除（可能破坏兼容性）:"
    echo "$REMOVED" | sed 's/^/    - /'
    EXIT_CODE=1
  else
    echo "  [OK] 无导出被删除"
  fi

  # 报告新增导出
  ADDED=$(comm -13 <(echo "$BASE_NAMES") <(echo "$CURRENT_NAMES") || true)
  if [ -n "$ADDED" ]; then
    echo "  [INFO] 新增导出:"
    echo "$ADDED" | sed 's/^/    + /'
  fi
else
  echo "  [INFO] Base 分支无 contracts，跳过导出对比"
fi

echo ""

# ============================================================
# 2. 检查契约文件中是否有 any 类型
# ============================================================

echo "[2/4] 检查 'any' 类型..."

ANY_COUNT=$(grep -rn '\bany\b' "${CONTRACT_DIR}/" --include='*.ts' 2>/dev/null | grep -v '// eslint' | grep -v '@ts-ignore' | wc -l | tr -d ' ')
if [ "$ANY_COUNT" -gt 0 ]; then
  echo "  [WARN] 发现 $ANY_COUNT 处 'any' 类型:"
  grep -rn '\bany\b' "${CONTRACT_DIR}/" --include='*.ts' 2>/dev/null | grep -v '// eslint' | grep -v '@ts-ignore' | head -10 | sed 's/^/    /'
else
  echo "  [OK] 无 'any' 类型"
fi

echo ""

# ============================================================
# 3. TypeScript 编译检查
# ============================================================

echo "[3/4] TypeScript 编译检查..."

if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  echo "  [FAIL] TypeScript 编译错误:"
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10 | sed 's/^/    /'
  EXIT_CODE=1
else
  echo "  [OK] TypeScript 编译通过"
fi

echo ""

# ============================================================
# 4. 检查所有 .ts 文件是否从 index.ts 导出
# ============================================================

echo "[4/4] 检查模块导出完整性..."

for file in "${CONTRACT_DIR}"/*.ts; do
  basename=$(basename "$file" .ts)
  if [ "$basename" = "index" ]; then continue; fi

  if ! grep -q "$basename" "${CONTRACT_DIR}/index.ts" 2>/dev/null; then
    echo "  [WARN] $basename.ts 未从 index.ts 导出"
  fi
done

echo ""

# ============================================================
# 结果
# ============================================================

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "=== 契约检查通过 ==="
else
  echo "=== 契约检查发现问题 (exit code: $EXIT_CODE) ==="
fi

exit $EXIT_CODE
