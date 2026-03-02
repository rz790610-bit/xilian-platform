#!/bin/bash
# FIX-128: Neo4j 备份策略脚本
# 支持两种模式：
#   1. neo4j-admin dump (离线备份 — 需要停库)
#   2. APOC export (在线备份 — 不需停库)
#
# 使用方式:
#   bash scripts/neo4j-backup.sh                    # 默认 APOC 在线备份
#   bash scripts/neo4j-backup.sh --mode dump        # neo4j-admin 离线备份
#   bash scripts/neo4j-backup.sh --mode apoc        # APOC Cypher 导出
#   bash scripts/neo4j-backup.sh --retain 7         # 保留最近 7 天备份

set -euo pipefail

# ============================================================
# 配置
# ============================================================

NEO4J_HOST="${NEO4J_HOST:-localhost}"
NEO4J_HTTP_PORT="${NEO4J_HTTP_PORT:-7474}"
NEO4J_BOLT_PORT="${NEO4J_PORT:-7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4j}"
NEO4J_DATABASE="${NEO4J_DATABASE:-neo4j}"
NEO4J_CONTAINER="${NEO4J_CONTAINER:-xilian-platform-app-neo4j-1}"

BACKUP_DIR="${BACKUP_DIR:-./backups/neo4j}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
MODE="apoc"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="neo4j_backup_${TIMESTAMP}"

# ============================================================
# 参数解析
# ============================================================

while [[ $# -gt 0 ]]; do
  case $1 in
    --mode) MODE="$2"; shift 2 ;;
    --retain) RETAIN_DAYS="$2"; shift 2 ;;
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --container) NEO4J_CONTAINER="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

mkdir -p "$BACKUP_DIR"

echo "=== Neo4j 备份 ==="
echo "模式: $MODE"
echo "目标目录: $BACKUP_DIR"
echo "保留天数: $RETAIN_DAYS"
echo "时间戳: $TIMESTAMP"
echo ""

# ============================================================
# APOC 在线导出（推荐，不停库）
# ============================================================

apoc_export() {
  local EXPORT_FILE="${BACKUP_DIR}/${BACKUP_NAME}.cypher"

  echo "[1/3] 正在通过 APOC 导出 Cypher 数据..."

  # 使用 Neo4j HTTP API + Cypher 语句调用 APOC
  curl -s -u "${NEO4J_USER}:${NEO4J_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d '{
      "statements": [{
        "statement": "CALL apoc.export.cypher.all(null, {format: \"cypher-shell\", streamStatements: true}) YIELD cypherStatements RETURN cypherStatements"
      }]
    }' \
    "http://${NEO4J_HOST}:${NEO4J_HTTP_PORT}/db/${NEO4J_DATABASE}/tx/commit" \
    | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for result in data.get('results', []):
        for row in result.get('data', []):
            for val in row.get('row', []):
                print(val)
except Exception as e:
    print(f'// Export error: {e}', file=sys.stderr)
    sys.exit(1)
" > "$EXPORT_FILE" 2>/dev/null

  if [ $? -ne 0 ] || [ ! -s "$EXPORT_FILE" ]; then
    echo "[WARN] APOC 导出失败，尝试 Cypher MATCH 导出..."
    cypher_fallback_export "$EXPORT_FILE"
  fi

  echo "[2/3] 压缩备份..."
  gzip "$EXPORT_FILE"
  local FINAL="${EXPORT_FILE}.gz"

  local SIZE=$(du -h "$FINAL" | cut -f1)
  echo "[3/3] 备份完成: $FINAL ($SIZE)"
  echo "$FINAL"
}

# Cypher 手动导出（APOC 不可用时的降级方案）
cypher_fallback_export() {
  local EXPORT_FILE="$1"

  echo "// Neo4j Cypher Export — ${TIMESTAMP}" > "$EXPORT_FILE"
  echo "// Database: ${NEO4J_DATABASE}" >> "$EXPORT_FILE"
  echo "" >> "$EXPORT_FILE"

  # 导出所有节点
  curl -s -u "${NEO4J_USER}:${NEO4J_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d '{"statements": [{"statement": "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props LIMIT 100000"}]}' \
    "http://${NEO4J_HOST}:${NEO4J_HTTP_PORT}/db/${NEO4J_DATABASE}/tx/commit" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for result in data.get('results', []):
    for row in result.get('data', []):
        labels = ':'.join(row['row'][0])
        props = json.dumps(row['row'][1])
        print(f'CREATE (:{labels} {props});')
" >> "$EXPORT_FILE" 2>/dev/null

  # 导出所有关系
  curl -s -u "${NEO4J_USER}:${NEO4J_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d '{"statements": [{"statement": "MATCH (a)-[r]->(b) RETURN labels(a) AS aLabels, properties(a) AS aProps, type(r) AS relType, properties(r) AS rProps, labels(b) AS bLabels, properties(b) AS bProps LIMIT 100000"}]}' \
    "http://${NEO4J_HOST}:${NEO4J_HTTP_PORT}/db/${NEO4J_DATABASE}/tx/commit" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for result in data.get('results', []):
    for row in result.get('data', []):
        aL, aP, rT, rP, bL, bP = row['row']
        print(f'// RELATIONSHIP: (:{\":\".join(aL)})-[:{rT}]->(:{\":\".join(bL)})')
" >> "$EXPORT_FILE" 2>/dev/null

  echo "// End of export" >> "$EXPORT_FILE"
}

# ============================================================
# neo4j-admin dump（离线备份）
# ============================================================

admin_dump() {
  local DUMP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.dump"

  echo "[1/3] 正在通过 neo4j-admin dump 备份..."
  echo "      (注意: 此操作需要 Neo4j 容器可访问)"

  docker exec "$NEO4J_CONTAINER" neo4j-admin database dump \
    --to-path=/tmp/ \
    "$NEO4J_DATABASE" 2>/dev/null || \
  docker exec "$NEO4J_CONTAINER" neo4j-admin dump \
    --database="$NEO4J_DATABASE" \
    --to="/tmp/${BACKUP_NAME}.dump" 2>/dev/null

  echo "[2/3] 从容器复制备份文件..."
  docker cp "${NEO4J_CONTAINER}:/tmp/${BACKUP_NAME}.dump" "$DUMP_FILE" 2>/dev/null || \
  docker cp "${NEO4J_CONTAINER}:/tmp/${NEO4J_DATABASE}.dump" "$DUMP_FILE" 2>/dev/null

  if [ ! -f "$DUMP_FILE" ]; then
    echo "[ERROR] 备份文件未找到"
    exit 1
  fi

  echo "[3/3] 压缩..."
  gzip "$DUMP_FILE"
  local FINAL="${DUMP_FILE}.gz"

  local SIZE=$(du -h "$FINAL" | cut -f1)
  echo "备份完成: $FINAL ($SIZE)"
}

# ============================================================
# 清理旧备份
# ============================================================

cleanup_old_backups() {
  echo ""
  echo "清理 ${RETAIN_DAYS} 天前的旧备份..."
  local COUNT=$(find "$BACKUP_DIR" -name "neo4j_backup_*" -mtime +"$RETAIN_DAYS" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 0 ]; then
    find "$BACKUP_DIR" -name "neo4j_backup_*" -mtime +"$RETAIN_DAYS" -type f -delete
    echo "已删除 $COUNT 个旧备份"
  else
    echo "无需清理"
  fi
}

# ============================================================
# 主流程
# ============================================================

case "$MODE" in
  apoc)
    apoc_export
    ;;
  dump)
    admin_dump
    ;;
  *)
    echo "不支持的模式: $MODE (可选: apoc, dump)"
    exit 1
    ;;
esac

cleanup_old_backups

echo ""
echo "=== 备份完成 ==="
echo "当前备份列表:"
ls -lh "$BACKUP_DIR"/neo4j_backup_* 2>/dev/null || echo "  (无备份文件)"
