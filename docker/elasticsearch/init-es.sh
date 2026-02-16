#!/bin/bash
# ============================================================
# Elasticsearch 初始化脚本
# 创建索引模板、ILM 策略、初始索引
# ============================================================

set -e

ES_URL="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
MAX_RETRIES=30
RETRY_INTERVAL=5

echo "🔍 Elasticsearch Initializer"
echo "   ES URL: ${ES_URL}"

# 等待 ES 就绪
echo "⏳ Waiting for Elasticsearch to be ready..."
for i in $(seq 1 ${MAX_RETRIES}); do
  if curl -sf "${ES_URL}/_cluster/health" > /dev/null 2>&1; then
    HEALTH=$(curl -sf "${ES_URL}/_cluster/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unknown")
    echo "✅ Elasticsearch is ready (cluster status: ${HEALTH})"
    break
  fi
  if [ "$i" -eq "${MAX_RETRIES}" ]; then
    echo "❌ Elasticsearch not ready after ${MAX_RETRIES} retries"
    exit 1
  fi
  echo "   Attempt ${i}/${MAX_RETRIES}..."
  sleep ${RETRY_INTERVAL}
done

# ============================================================
# 1. ILM (Index Lifecycle Management) 策略
# ============================================================
echo ""
echo "📋 Creating ILM policies..."

# 告警日志 — 热 7 天 → 温 30 天 → 冷 90 天 → 删除 365 天
curl -sf -X PUT "${ES_URL}/_ilm/policy/xilian-alert-policy" \
  -H "Content-Type: application/json" \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "10gb",
            "max_age": "7d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "90d",
        "actions": {
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": { "delete": {} }
      }
    }
  }
}' && echo " ✅ xilian-alert-policy"

# 审计日志 — 保留 2 年（合规要求）
curl -sf -X PUT "${ES_URL}/_ilm/policy/xilian-audit-policy" \
  -H "Content-Type: application/json" \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "10gb",
            "max_age": "30d"
          }
        }
      },
      "warm": {
        "min_age": "90d",
        "actions": {
          "forcemerge": { "max_num_segments": 1 },
          "shrink": { "number_of_shards": 1 }
        }
      },
      "delete": {
        "min_age": "730d",
        "actions": { "delete": {} }
      }
    }
  }
}' && echo " ✅ xilian-audit-policy"

# 通用日志 — 保留 90 天
curl -sf -X PUT "${ES_URL}/_ilm/policy/xilian-logs-policy" \
  -H "Content-Type: application/json" \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "5gb",
            "max_age": "7d"
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}' && echo " ✅ xilian-logs-policy"

# ============================================================
# 2. 索引模板
# ============================================================
echo ""
echo "📋 Creating index templates..."

# 告警事件索引模板
curl -sf -X PUT "${ES_URL}/_index_template/xilian-alerts" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["xilian-alert_event_log*", "xilian-alerts-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "xilian-alert-policy",
      "index.lifecycle.rollover_alias": "xilian-alerts",
      "analysis": {
        "analyzer": {
          "xilian_text": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "stop"]
          }
        }
      }
    },
    "mappings": {
      "properties": {
        "id": { "type": "long" },
        "alertId": { "type": "keyword" },
        "ruleId": { "type": "keyword" },
        "deviceCode": { "type": "keyword" },
        "severity": { "type": "keyword" },
        "status": { "type": "keyword" },
        "message": { "type": "text", "analyzer": "xilian_text" },
        "details": { "type": "object", "enabled": false },
        "triggeredAt": { "type": "date" },
        "resolvedAt": { "type": "date" },
        "createdAt": { "type": "date" },
        "updatedAt": { "type": "date" }
      }
    }
  },
  "priority": 200
}' && echo " ✅ xilian-alerts template"

# 诊断结果索引模板
curl -sf -X PUT "${ES_URL}/_index_template/xilian-diagnosis" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["xilian-diagnosis_results*", "xilian-diagnosis-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "xilian-alert-policy",
      "index.lifecycle.rollover_alias": "xilian-diagnosis"
    },
    "mappings": {
      "properties": {
        "id": { "type": "long" },
        "taskId": { "type": "keyword" },
        "deviceCode": { "type": "keyword" },
        "faultCode": { "type": "keyword" },
        "severity": { "type": "keyword" },
        "confidence": { "type": "float" },
        "summary": { "type": "text", "analyzer": "standard" },
        "recommendations": { "type": "text" },
        "algorithmResults": { "type": "object", "enabled": false },
        "createdAt": { "type": "date" }
      }
    }
  },
  "priority": 200
}' && echo " ✅ xilian-diagnosis template"

# 审计日志索引模板
curl -sf -X PUT "${ES_URL}/_index_template/xilian-audit" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["xilian-audit-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "xilian-audit-policy",
      "index.lifecycle.rollover_alias": "xilian-audit"
    },
    "mappings": {
      "properties": {
        "id": { "type": "long" },
        "userId": { "type": "keyword" },
        "action": { "type": "keyword" },
        "resource": { "type": "keyword" },
        "resourceId": { "type": "keyword" },
        "method": { "type": "keyword" },
        "path": { "type": "keyword" },
        "statusCode": { "type": "integer" },
        "ip": { "type": "ip" },
        "userAgent": { "type": "text" },
        "requestBody": { "type": "object", "enabled": false },
        "responseBody": { "type": "object", "enabled": false },
        "durationMs": { "type": "integer" },
        "traceId": { "type": "keyword" },
        "createdAt": { "type": "date" }
      }
    }
  },
  "priority": 200
}' && echo " ✅ xilian-audit template"

# ============================================================
# 3. 创建初始索引（带别名）
# ============================================================
echo ""
echo "📋 Creating initial indices..."

for alias in xilian-alerts xilian-diagnosis xilian-audit; do
  # 检查别名是否已存在
  if curl -sf "${ES_URL}/_alias/${alias}" > /dev/null 2>&1; then
    echo "   ℹ️  Alias '${alias}' already exists, skipping"
  else
    curl -sf -X PUT "${ES_URL}/${alias}-000001" \
      -H "Content-Type: application/json" \
      -d "{
      \"aliases\": {
        \"${alias}\": { \"is_write_index\": true }
      }
    }" && echo "   ✅ ${alias}-000001 created with alias"
  fi
done

echo ""
echo "🎉 Elasticsearch initialization complete"

# 打印集群状态
echo ""
echo "📊 Cluster status:"
curl -sf "${ES_URL}/_cat/indices?v&h=index,health,status,docs.count,store.size" 2>/dev/null || true
echo ""
