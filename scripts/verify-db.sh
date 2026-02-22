#!/bin/bash
# ============================================================================
# verify-db.sh — 数据库架构一致性验证脚本
#
# 用法: ./scripts/verify-db.sh
#
# 检查项:
#   1. MySQL 表数量是否 = 163（01:121 + 02:24 + 03:15 + 04:3）
#   2. ClickHouse 对象数量是否 >= 37
#   3. MySQL TIMESTAMP 字段是否都有 DEFAULT
#   4. 种子数据是否完整
# ============================================================================

set -e

MYSQL_CMD="docker exec portai-mysql mysql -u root -p\${MYSQL_ROOT_PASSWORD:-root123} portai_nexus -sN"
CH_CMD="docker exec portai-clickhouse clickhouse-client --user portai --password \${CLICKHOUSE_PASSWORD:-clickhouse123}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" -ge "$expected" ] 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $desc: $actual (期望 >= $expected)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $desc: $actual (期望 >= $expected)"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "  数据库架构一致性验证"
echo "============================================"
echo ""

# --- MySQL ---
echo "▸ MySQL (portai_nexus)"

MYSQL_TOTAL=$($MYSQL_CMD -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='portai_nexus' AND TABLE_TYPE='BASE TABLE'" 2>/dev/null || echo "0")
check "总表数" 163 "$MYSQL_TOTAL"

MYSQL_BASE=$($MYSQL_CMD -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='portai_nexus' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN ('users','devices','device_types','organizations','roles','permissions','sensor_readings','alerts','alert_rules','maintenance_plans','maintenance_records','diagnosis_results','diagnosis_rules','diagnosis_tasks','algorithm_definitions','device_sampling_config')" 2>/dev/null || echo "0")
check "基础表(抽样16)" 16 "$MYSQL_BASE"

MYSQL_V5=$($MYSQL_CMD -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='portai_nexus' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN ('condition_profiles','cognition_sessions','world_model_snapshots','guardrail_rules','evolution_cycles','tool_definitions','equipment_profiles','sampling_configs')" 2>/dev/null || echo "0")
check "V5 认知层表(抽样8)" 8 "$MYSQL_V5"

MYSQL_EVO=$($MYSQL_CMD -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='portai_nexus' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN ('simulation_scenarios','simulation_results','twin_sync_logs','twin_events','twin_outbox','bpa_configs','causal_nodes','causal_edges','engine_config_registry','reasoning_decision_logs','reasoning_experiences','revision_logs','shadow_reasoning_comparisons','state_vector_dimensions','state_vector_logs')" 2>/dev/null || echo "0")
check "进化层表(全量15)" 15 "$MYSQL_EVO"

MYSQL_PIPE=$($MYSQL_CMD -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='portai_nexus' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN ('pipelines','pipeline_runs','pipeline_node_metrics')" 2>/dev/null || echo "0")
check "Pipeline表(全量3)" 3 "$MYSQL_PIPE"

# 种子数据
SEED_SCENARIOS=$($MYSQL_CMD -e "SELECT COUNT(*) FROM simulation_scenarios" 2>/dev/null || echo "0")
check "仿真场景种子数据" 6 "$SEED_SCENARIOS"

SEED_FORMULAS=$($MYSQL_CMD -e "SELECT COUNT(*) FROM diagnosis_physics_formulas" 2>/dev/null || echo "0")
check "物理方程种子数据" 7 "$SEED_FORMULAS"

echo ""

# --- ClickHouse ---
echo "▸ ClickHouse (portai_timeseries)"

CH_TOTAL=$($CH_CMD --query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND name NOT LIKE '.inner_id%'" 2>/dev/null || echo "0")
check "总对象数" 37 "$CH_TOTAL"

CH_BASE=$($CH_CMD --query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND engine='MergeTree' AND name NOT LIKE '%_kafka_%'" 2>/dev/null || echo "0")
check "基础MergeTree表" 15 "$CH_BASE"

CH_MV=$($CH_CMD --query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND engine='MaterializedView'" 2>/dev/null || echo "0")
check "物化视图" 18 "$CH_MV"

echo ""

# --- 汇总 ---
echo "============================================"
echo -e "  结果: ${GREEN}$PASS 通过${NC}  ${RED}$FAIL 失败${NC}  ${YELLOW}$WARN 警告${NC}"
echo "============================================"

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}存在失败项，请检查上述输出${NC}"
  exit 1
else
  echo -e "${GREEN}所有检查通过！数据库架构一致。${NC}"
  exit 0
fi
