#!/bin/bash
# ============================================================================
# portai-platform v5.0 — ClickHouse DDL 执行脚本
# ============================================================================
# 用法：
#   ./scripts/clickhouse-v5-migrate.sh [--host HOST] [--port PORT] [--user USER] [--password PASS] [--database DB]
#
# 环境变量（优先级低于命令行参数）：
#   CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD, CLICKHOUSE_DATABASE
#
# 功能：
#   1. 创建 5 个 v5.0 基础表
#   2. 创建 5 个物化视图（预聚合宽表）
#   3. 创建索引
#   4. 验证所有对象创建成功
# ============================================================================

set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 默认配置
CH_HOST="${CLICKHOUSE_HOST:-localhost}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_USER="${CLICKHOUSE_USER:-default}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CH_DATABASE="${CLICKHOUSE_DATABASE:-portai_timeseries}"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --host) CH_HOST="$2"; shift 2 ;;
    --port) CH_PORT="$2"; shift 2 ;;
    --user) CH_USER="$2"; shift 2 ;;
    --password) CH_PASSWORD="$2"; shift 2 ;;
    --database) CH_DATABASE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help)
      echo "用法: $0 [--host HOST] [--port PORT] [--user USER] [--password PASS] [--database DB] [--dry-run]"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

DRY_RUN="${DRY_RUN:-0}"

# 构建 clickhouse-client 命令
CH_CMD="clickhouse-client --host ${CH_HOST} --port ${CH_PORT} --user ${CH_USER} --database ${CH_DATABASE}"
if [ -n "${CH_PASSWORD}" ]; then
  CH_CMD="${CH_CMD} --password ${CH_PASSWORD}"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DDL_FILE="${SCRIPT_DIR}/../docker/clickhouse/init/03_v5_tables.sql"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE} portai-platform v5.0 — ClickHouse DDL 迁移${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "  主机: ${CH_HOST}:${CH_PORT}"
echo -e "  数据库: ${CH_DATABASE}"
echo -e "  用户: ${CH_USER}"
echo -e "  DDL 文件: ${DDL_FILE}"
echo -e "  模式: $([ ${DRY_RUN} -eq 1 ] && echo '预览（dry-run）' || echo '执行')"
echo ""

# 检查 DDL 文件
if [ ! -f "${DDL_FILE}" ]; then
  echo -e "${RED}错误: DDL 文件不存在: ${DDL_FILE}${NC}"
  exit 1
fi

# 检查连接
echo -e "${YELLOW}[1/4] 检查 ClickHouse 连接...${NC}"
if [ ${DRY_RUN} -eq 0 ]; then
  if ! ${CH_CMD} --query "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}错误: 无法连接到 ClickHouse (${CH_HOST}:${CH_PORT})${NC}"
    echo -e "请检查:"
    echo -e "  1. ClickHouse 服务是否启动"
    echo -e "  2. 主机和端口是否正确"
    echo -e "  3. 用户名和密码是否正确"
    exit 1
  fi
  echo -e "${GREEN}  连接成功${NC}"

  # 确保数据库存在
  ${CH_CMD} --query "CREATE DATABASE IF NOT EXISTS ${CH_DATABASE}" 2>/dev/null || true
else
  echo -e "${YELLOW}  [dry-run] 跳过连接检查${NC}"
fi

# 执行 DDL
echo -e "${YELLOW}[2/4] 执行 DDL...${NC}"
if [ ${DRY_RUN} -eq 0 ]; then
  ${CH_CMD} --multiquery < "${DDL_FILE}"
  echo -e "${GREEN}  DDL 执行完成${NC}"
else
  echo -e "${YELLOW}  [dry-run] 将执行以下 DDL:${NC}"
  grep -E "^CREATE|^ALTER" "${DDL_FILE}" | head -30
fi

# 验证
echo -e "${YELLOW}[3/4] 验证创建结果...${NC}"

EXPECTED_TABLES=(
  "realtime_telemetry"
  "cognition_session_results"
  "guardrail_violation_events"
  "evolution_cycle_metrics"
  "condition_instances"
)

EXPECTED_VIEWS=(
  "mv_device_health_wide"
  "mv_cycle_phase_stats"
  "mv_fusion_diagnosis_wide"
  "mv_guardrail_effectiveness"
  "mv_evolution_trend"
)

if [ ${DRY_RUN} -eq 0 ]; then
  PASS=0
  FAIL=0

  echo -e "  基础表:"
  for table in "${EXPECTED_TABLES[@]}"; do
    EXISTS=$(${CH_CMD} --query "SELECT count() FROM system.tables WHERE database='${CH_DATABASE}' AND name='${table}'" 2>/dev/null)
    if [ "${EXISTS}" = "1" ]; then
      echo -e "    ${GREEN}✓${NC} ${table}"
      ((PASS++))
    else
      echo -e "    ${RED}✗${NC} ${table}"
      ((FAIL++))
    fi
  done

  echo -e "  物化视图:"
  for view in "${EXPECTED_VIEWS[@]}"; do
    EXISTS=$(${CH_CMD} --query "SELECT count() FROM system.tables WHERE database='${CH_DATABASE}' AND name='${view}'" 2>/dev/null)
    if [ "${EXISTS}" = "1" ]; then
      echo -e "    ${GREEN}✓${NC} ${view}"
      ((PASS++))
    else
      echo -e "    ${RED}✗${NC} ${view}"
      ((FAIL++))
    fi
  done

  echo ""
  echo -e "  结果: ${GREEN}${PASS} 通过${NC}, ${RED}${FAIL} 失败${NC}"

  if [ ${FAIL} -gt 0 ]; then
    echo -e "${RED}[错误] 部分对象创建失败，请检查 ClickHouse 日志${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}  [dry-run] 跳过验证${NC}"
  echo -e "  预期创建 ${#EXPECTED_TABLES[@]} 个基础表 + ${#EXPECTED_VIEWS[@]} 个物化视图"
fi

# 汇总
echo -e "${YELLOW}[4/4] 迁移汇总${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN} v5.0 ClickHouse DDL 迁移完成${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "  新增基础表: ${#EXPECTED_TABLES[@]} 个"
echo -e "  新增物化视图: ${#EXPECTED_VIEWS[@]} 个"
echo -e "  新增索引: 11 个"
echo ""
echo -e "  物化视图说明:"
echo -e "    mv_device_health_wide     — 设备健康一览（按设备+小时）"
echo -e "    mv_cycle_phase_stats      — 周期阶段分析（按设备+工况+阶段+天）"
echo -e "    mv_fusion_diagnosis_wide  — 融合诊断分析（按设备+天）"
echo -e "    mv_guardrail_effectiveness — 护栏效果评估（按规则+天）"
echo -e "    mv_evolution_trend        — 进化趋势追踪（按周期类型+周）"
echo ""
