#!/bin/bash
# ============================================================
# Kafka Connect 连接器自动注册脚本
# 等待 Connect 就绪后注册预定义的连接器
# ============================================================

set -e

CONNECT_URL="${KAFKA_CONNECT_URL:-http://kafka-connect:8083}"
MAX_RETRIES=30
RETRY_INTERVAL=5

echo "🔌 Kafka Connect Connector Initializer"
echo "   Connect URL: ${CONNECT_URL}"

# 等待 Kafka Connect 就绪
echo "⏳ Waiting for Kafka Connect to be ready..."
for i in $(seq 1 ${MAX_RETRIES}); do
  if curl -sf "${CONNECT_URL}/" > /dev/null 2>&1; then
    echo "✅ Kafka Connect is ready"
    break
  fi
  if [ "$i" -eq "${MAX_RETRIES}" ]; then
    echo "❌ Kafka Connect not ready after ${MAX_RETRIES} retries"
    exit 1
  fi
  echo "   Attempt ${i}/${MAX_RETRIES}..."
  sleep ${RETRY_INTERVAL}
done

# 注册连接器的通用函数
register_connector() {
  local name="$1"
  local config="$2"
  
  # 检查连接器是否已存在
  if curl -sf "${CONNECT_URL}/connectors/${name}" > /dev/null 2>&1; then
    echo "   ℹ️  Connector '${name}' already exists, updating..."
    curl -sf -X PUT \
      -H "Content-Type: application/json" \
      -d "${config}" \
      "${CONNECT_URL}/connectors/${name}/config" > /dev/null
  else
    echo "   📝 Creating connector '${name}'..."
    curl -sf -X POST \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${name}\", \"config\": ${config}}" \
      "${CONNECT_URL}/connectors" > /dev/null
  fi
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Connector '${name}' registered"
  else
    echo "   ⚠️  Failed to register '${name}' (non-critical)"
  fi
}

# ============================================================
# 1. Debezium MySQL CDC Source — 捕获业务表变更
# ============================================================
echo ""
echo "📋 Registering connectors..."

register_connector "xilian-mysql-cdc" '{
  "connector.class": "io.debezium.connector.mysql.MySqlConnector",
  "tasks.max": "1",
  "database.hostname": "mysql",
  "database.port": "3306",
  "database.user": "portai",
  "database.password": "portai123",
  "database.server.id": "184054",
  "topic.prefix": "xilian.cdc",
  "database.include.list": "portai_nexus",
  "table.include.list": "portai_nexus.alert_event_log,portai_nexus.device_status_log,portai_nexus.algorithm_executions,portai_nexus.diagnosis_results",
  "schema.history.internal.kafka.bootstrap.servers": "kafka:29092",
  "schema.history.internal.kafka.topic": "_xilian-schema-history",
  "include.schema.changes": "true",
  "snapshot.mode": "when_needed",
  "tombstones.on.delete": "false",
  "transforms": "route",
  "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
  "transforms.route.regex": "([^.]+)\\.([^.]+)\\.([^.]+)",
  "transforms.route.replacement": "xilian.cdc.$3"
}'

# ============================================================
# 2. Elasticsearch Sink — 告警事件和诊断结果索引
# ============================================================
register_connector "xilian-es-alert-sink" '{
  "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
  "tasks.max": "1",
  "topics": "xilian.cdc.alert_event_log,xilian.cdc.diagnosis_results",
  "connection.url": "http://elasticsearch:9200",
  "type.name": "_doc",
  "key.ignore": "true",
  "schema.ignore": "true",
  "behavior.on.null.values": "ignore",
  "behavior.on.malformed.documents": "warn",
  "write.method": "upsert",
  "transforms": "extractKey,topicIndex",
  "transforms.extractKey.type": "org.apache.kafka.connect.transforms.ValueToKey",
  "transforms.extractKey.fields": "id",
  "transforms.topicIndex.type": "org.apache.kafka.connect.transforms.RegexRouter",
  "transforms.topicIndex.regex": "xilian\\.cdc\\.(.*)",
  "transforms.topicIndex.replacement": "xilian-$1"
}'

# ============================================================
# 3. JDBC Sink — 聚合数据写入 ClickHouse（可选）
# ============================================================
# 注意：需要 ClickHouse JDBC driver，此处为模板
# register_connector "xilian-clickhouse-sink" '{...}'

echo ""
echo "🎉 Connector initialization complete"

# 列出所有已注册的连接器
echo ""
echo "📊 Registered connectors:"
curl -sf "${CONNECT_URL}/connectors" | python3 -m json.tool 2>/dev/null || \
  curl -sf "${CONNECT_URL}/connectors"

echo ""
