#!/bin/bash
# ============================================================================
# verify-db.sh — 数据库架构一致性验证
#
# 用法: ./scripts/verify-db.sh
# ============================================================================

set -e

# --- 配置（可通过环境变量覆盖） ---
MYSQL_ROOT_PWD="${MYSQL_ROOT_PASSWORD:-root123}"
MYSQL_DB="${MYSQL_DATABASE:-portai_nexus}"
MYSQL_CONTAINER="${MYSQL_CONTAINER_NAME:-portai-mysql}"
CH_CONTAINER="${CH_CONTAINER_NAME:-portai-clickhouse}"
CH_PWD="${CLICKHOUSE_PASSWORD:-clickhouse123}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
PASS=0
FAIL=0

mysql_query() {
  docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" "$MYSQL_DB" -sN -e "$1" 2>/dev/null || echo "0"
}

ch_query() {
  docker exec "$CH_CONTAINER" clickhouse-client --user portai --password "$CH_PWD" --query "$1" 2>/dev/null || echo "0"
}

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" -ge "$expected" ] 2>/dev/null; then
    printf "  ${GREEN}✓${NC} %s: %s (期望 >= %s)\n" "$desc" "$actual" "$expected"
    PASS=$((PASS + 1))
  else
    printf "  ${RED}✗${NC} %s: %s (期望 >= %s)\n" "$desc" "$actual" "$expected"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "  数据库架构一致性验证"
echo "============================================"
echo ""

# --- MySQL ---
echo "▸ MySQL ($MYSQL_DB)"

check "总表数" 160 "$(mysql_query 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')"

check "基础表(抽样16)" 16 "$(mysql_query 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("users","asset_nodes","asset_sensors","equipment_profiles","device_alerts","alert_rules","device_maintenance_records","device_maintenance_logs","diagnosis_results","diagnosis_rules","diagnosis_tasks","algorithm_definitions","device_sampling_config","models","topo_nodes","topo_edges")')"

check "V5 认知层表(抽样8)" 8 "$(mysql_query 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("condition_profiles","cognition_sessions","world_model_snapshots","guardrail_rules","evolution_cycles","tool_definitions","equipment_profiles","sampling_configs")')"

check "进化层表(全量15)" 15 "$(mysql_query 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("simulation_scenarios","simulation_results","twin_sync_logs","twin_events","twin_outbox","bpa_configs","causal_nodes","causal_edges","engine_config_registry","reasoning_decision_logs","reasoning_experiences","revision_logs","shadow_reasoning_comparisons","state_vector_dimensions","state_vector_logs")')"

check "Pipeline表(全量3)" 3 "$(mysql_query 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("pipelines","pipeline_runs","pipeline_node_metrics")')"

check "仿真场景种子数据" 6 "$(mysql_query 'SELECT COUNT(*) FROM simulation_scenarios')"

check "物理方程种子数据" 7 "$(mysql_query 'SELECT COUNT(*) FROM diagnosis_physics_formulas')"

echo ""

# --- ClickHouse ---
echo "▸ ClickHouse (portai_timeseries)"

check "总对象数" 37 "$(ch_query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND name NOT LIKE '.inner_id%'")"

check "基础MergeTree表" 15 "$(ch_query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND engine='MergeTree' AND name NOT LIKE '%_kafka_%'")"

check "物化视图" 18 "$(ch_query "SELECT count() FROM system.tables WHERE database='portai_timeseries' AND engine='MaterializedView'")"

echo ""

# --- 汇总 ---
echo "============================================"
printf "  结果: ${GREEN}%d 通过${NC}  ${RED}%d 失败${NC}\n" "$PASS" "$FAIL"
echo "============================================"

if [ $FAIL -gt 0 ]; then
  printf "${RED}存在失败项，请检查上述输出${NC}\n"
  exit 1
else
  printf "${GREEN}所有检查通过！数据库架构一致。${NC}\n"
  exit 0
fi
