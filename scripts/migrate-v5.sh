#!/bin/bash
# ============================================================================
# xilian-platform v5.0 — PostgreSQL/MySQL 数据库迁移脚本
# ============================================================================
# 用法：
#   ./scripts/migrate-v5.sh [generate|push|up|status|verify]
#
# 命令说明：
#   generate  — 基于 Drizzle schema 生成迁移 SQL 文件
#   push      — 开发环境直接推送 schema（不生成迁移文件）
#   up        — 执行待运行的迁移（生产环境）
#   status    — 查看迁移状态
#   verify    — 验证 v5.0 的 25 张新表是否全部创建成功
#
# 前置条件：
#   - DATABASE_URL 环境变量已配置
#   - Node.js 和 pnpm 已安装
#   - 依赖已安装（pnpm install）
# ============================================================================

set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE} xilian-platform v5.0 — 数据库迁移${NC}"
echo -e "${BLUE}============================================================================${NC}"

# v5.0 新增的 25 张表（evolution-schema.ts 中定义）
V5_TABLES=(
  "condition_profiles"
  "condition_instances"
  "feature_definitions"
  "feature_versions"
  "cognition_sessions"
  "cognition_dimension_results"
  "grok_reasoning_chains"
  "world_model_snapshots"
  "world_model_predictions"
  "diagnosis_physics_formulas"
  "guardrail_rules"
  "guardrail_violations"
  "shadow_eval_records"
  "shadow_eval_metrics"
  "champion_challenger_experiments"
  "canary_deployments"
  "canary_traffic_splits"
  "knowledge_crystals"
  "evolution_cycles"
  "tool_definitions"
  "equipment_profiles"
  "condition_baselines"
  "sampling_configs"
  "edge_cases"
)

COMMAND="${1:-help}"

case "${COMMAND}" in
  generate)
    echo -e "${YELLOW}[1/2] 生成 v5.0 迁移文件...${NC}"
    echo -e "  Schema 文件: drizzle/schema.ts + drizzle/evolution-schema.ts"
    echo -e "  新增表数量: ${#V5_TABLES[@]}"
    echo ""
    node scripts/migrate.mjs generate v5-deep-evolution
    echo -e "${GREEN}[2/2] 迁移文件生成完成${NC}"
    echo -e "  请检查 drizzle/migrations/ 目录下的新文件"
    echo -e "  确认 SQL 内容正确后执行: $0 up"
    ;;

  push)
    if [ "${NODE_ENV:-development}" = "production" ]; then
      echo -e "${RED}错误: push 命令不允许在生产环境使用${NC}"
      echo -e "  请使用 'generate' + 'up' 进行生产迁移"
      exit 1
    fi
    echo -e "${YELLOW}[1/2] 推送 v5.0 schema 到数据库（开发模式）...${NC}"
    echo -e "  ⚠️  这将直接修改数据库结构，仅限开发环境使用"
    echo ""
    node scripts/migrate.mjs push
    echo -e "${GREEN}[2/2] Schema 推送完成${NC}"
    echo ""
    echo -e "  执行验证: $0 verify"
    ;;

  up)
    echo -e "${YELLOW}[1/2] 执行 v5.0 数据库迁移...${NC}"
    node scripts/migrate.mjs up
    echo -e "${GREEN}[2/2] 迁移执行完成${NC}"
    echo ""
    echo -e "  执行验证: $0 verify"
    ;;

  status)
    echo -e "${YELLOW}查看迁移状态...${NC}"
    node scripts/migrate.mjs status
    ;;

  verify)
    echo -e "${YELLOW}验证 v5.0 表创建状态...${NC}"
    echo ""

    if [ -z "${DATABASE_URL:-}" ]; then
      echo -e "${RED}错误: DATABASE_URL 未配置${NC}"
      exit 1
    fi

    # 使用 Node.js 脚本验证表存在性
    node -e "
const mysql = require('mysql2/promise');

async function verify() {
  const tables = $(printf '%s\n' "${V5_TABLES[@]}" | jq -R . | jq -s .);
  const url = process.env.DATABASE_URL;
  
  let conn;
  try {
    conn = await mysql.createConnection(url);
    const [rows] = await conn.execute(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const existingTables = new Set(rows.map(r => r.TABLE_NAME));
    
    let pass = 0, fail = 0;
    console.log('  v5.0 新增表验证:');
    console.log('  ' + '─'.repeat(50));
    
    for (const table of tables) {
      if (existingTables.has(table)) {
        console.log('    ✓ ' + table);
        pass++;
      } else {
        console.log('    ✗ ' + table + ' (缺失)');
        fail++;
      }
    }
    
    console.log('  ' + '─'.repeat(50));
    console.log('  结果: ' + pass + ' 通过, ' + fail + ' 失败 (共 ' + tables.length + ' 张表)');
    
    if (fail > 0) {
      console.log('');
      console.log('  ⚠️  部分表未创建，请执行:');
      console.log('    开发环境: ./scripts/migrate-v5.sh push');
      console.log('    生产环境: ./scripts/migrate-v5.sh generate && ./scripts/migrate-v5.sh up');
      process.exit(1);
    } else {
      console.log('');
      console.log('  ✅ 所有 v5.0 表已成功创建');
    }
  } catch (err) {
    console.error('  数据库连接失败:', err.message);
    console.error('  请检查 DATABASE_URL 配置');
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

verify();
" 2>&1 || echo -e "${YELLOW}  注意: 验证需要数据库连接，请确保 DATABASE_URL 正确配置${NC}"
    ;;

  help|*)
    echo ""
    echo "用法: $0 <command>"
    echo ""
    echo "命令:"
    echo "  generate   生成 v5.0 迁移 SQL 文件"
    echo "  push       开发环境直接推送 schema（不生成迁移文件）"
    echo "  up         执行待运行的迁移（生产环境）"
    echo "  status     查看迁移状态"
    echo "  verify     验证 v5.0 的 ${#V5_TABLES[@]} 张新表是否全部创建成功"
    echo ""
    echo "v5.0 新增表清单（${#V5_TABLES[@]} 张）:"
    echo "  ① 感知阶段（4 张）:"
    echo "    condition_profiles, condition_instances,"
    echo "    feature_definitions, feature_versions"
    echo ""
    echo "  ② 诊断阶段（6 张）:"
    echo "    cognition_sessions, cognition_dimension_results,"
    echo "    grok_reasoning_chains, world_model_snapshots,"
    echo "    world_model_predictions, diagnosis_physics_formulas"
    echo ""
    echo "  ③ 护栏阶段（2 张）:"
    echo "    guardrail_rules, guardrail_violations"
    echo ""
    echo "  ④ 进化阶段（8 张）:"
    echo "    shadow_eval_records, shadow_eval_metrics,"
    echo "    champion_challenger_experiments, canary_deployments,"
    echo "    canary_traffic_splits, knowledge_crystals,"
    echo "    evolution_cycles, tool_definitions"
    echo ""
    echo "  ⑤ 通用（4 张）:"
    echo "    equipment_profiles, condition_baselines,"
    echo "    sampling_configs, edge_cases"
    echo ""
    echo "环境变量:"
    echo "  DATABASE_URL    数据库连接字符串（必填）"
    echo "  NODE_ENV        设为 'production' 启用生产模式"
    ;;
esac
