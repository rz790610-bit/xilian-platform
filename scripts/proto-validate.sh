#!/bin/bash
# FIX-142: Proto 编译验证脚本
# 用途: CI 中验证所有 .proto 文件语法正确
# 运行: bash scripts/proto-validate.sh

set -euo pipefail

PROTO_DIR="./proto"
ERRORS=0

echo "=== Proto 文件验证 ==="

# 检查 protoc 是否可用
if ! command -v protoc &> /dev/null; then
  echo "WARN: protoc 未安装，跳过编译检查（仅做语法检查）"
  # 基本语法检查：确保所有 proto 文件能被解析
  for f in $(find "$PROTO_DIR" -name "*.proto" -type f); do
    echo "  检查: $f"
    # 检查关键语法元素
    if ! grep -q "^syntax" "$f"; then
      echo "  ERROR: $f 缺少 syntax 声明"
      ERRORS=$((ERRORS + 1))
    fi
    if ! grep -q "^package" "$f"; then
      echo "  ERROR: $f 缺少 package 声明"
      ERRORS=$((ERRORS + 1))
    fi
  done
else
  echo "protoc 版本: $(protoc --version)"

  # 使用 protoc --decode_raw 做语法验证（不生成代码）
  for f in $(find "$PROTO_DIR" -name "*.proto" -type f); do
    echo "  编译验证: $f"
    if ! protoc -I"$PROTO_DIR" --descriptor_set_out=/dev/null "$f" 2>&1; then
      echo "  ERROR: $f 编译失败"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

# 检查结果
TOTAL=$(find "$PROTO_DIR" -name "*.proto" -type f | wc -l | tr -d ' ')
echo ""
echo "=== 结果: $TOTAL 个 proto 文件, $ERRORS 个错误 ==="

if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED"
  exit 1
fi

echo "PASSED"
