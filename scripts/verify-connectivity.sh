#!/bin/bash
# ============================================================
# PortAI Nexus — 服务联通性验证脚本
# ============================================================
# 用法：./scripts/verify-connectivity.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS + 1)); }
check_fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; WARN=$((WARN + 1)); }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    ${BOLD}PortAI Nexus — 服务联通性验证${NC}${CYAN}                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# 1. Docker 容器状态
# ============================================================
echo -e "${BOLD}1. Docker 容器状态${NC}"
CONTAINERS=$(docker compose ps --format '{{.Name}}:{{.Status}}' 2>/dev/null)
if [ -z "$CONTAINERS" ]; then
    check_fail "无法获取容器状态"
else
    while IFS=: read -r name status; do
        if echo "$status" | grep -qi "up\|running\|healthy"; then
            check_pass "$name — $status"
        elif echo "$status" | grep -qi "starting"; then
            check_warn "$name — $status (启动中)"
        else
            check_fail "$name — $status"
        fi
    done <<< "$CONTAINERS"
fi
echo ""

# ============================================================
# 2. MySQL 联通性
# ============================================================
echo -e "${BOLD}2. MySQL 联通性${NC}"
if docker compose exec -T mysql mysqladmin ping -h localhost -u root -proot123 &>/dev/null 2>&1; then
    check_pass "MySQL ping 成功"
else
    check_fail "MySQL ping 失败"
fi

DB_COUNT=$(docker compose exec -T mysql mysql -u root -proot123 -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='portai_nexus'" 2>/dev/null | tr -d '[:space:]')
if [ -n "$DB_COUNT" ] && [ "$DB_COUNT" -gt 0 ] 2>/dev/null; then
    check_pass "MySQL 数据库 portai_nexus: ${DB_COUNT} 张表"
else
    check_fail "MySQL 数据库 portai_nexus 表为空或不存在"
fi
echo ""

# ============================================================
# 3. Redis 联通性
# ============================================================
echo -e "${BOLD}3. Redis 联通性${NC}"
REDIS_PONG=$(docker compose exec -T redis redis-cli ping 2>/dev/null | tr -d '[:space:]')
if [ "$REDIS_PONG" = "PONG" ]; then
    check_pass "Redis PING → PONG"
else
    check_fail "Redis PING 失败"
fi

REDIS_INFO=$(docker compose exec -T redis redis-cli info server 2>/dev/null | grep redis_version | tr -d '[:space:]')
if [ -n "$REDIS_INFO" ]; then
    check_pass "Redis 版本: $REDIS_INFO"
fi
echo ""

# ============================================================
# 4. 应用 API 联通性
# ============================================================
echo -e "${BOLD}4. 应用 API 联通性${NC}"

# 健康检查
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/rest/_health 2>/dev/null || echo "000")
if [ "$HEALTH_CODE" = "200" ]; then
    check_pass "健康检查 /api/rest/_health → HTTP 200"
    HEALTH_BODY=$(curl -s http://localhost:3000/api/rest/_health 2>/dev/null)
    echo -e "    ${CYAN}响应: ${HEALTH_BODY}${NC}"
else
    check_fail "健康检查 /api/rest/_health → HTTP $HEALTH_CODE"
fi

# 前端页面
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$FRONTEND_CODE" = "200" ]; then
    check_pass "前端页面 / → HTTP 200"
else
    check_fail "前端页面 / → HTTP $FRONTEND_CODE"
fi

# tRPC 端点
TRPC_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/trpc" 2>/dev/null || echo "000")
if [ "$TRPC_CODE" != "000" ]; then
    check_pass "tRPC 端点可达 → HTTP $TRPC_CODE"
else
    check_fail "tRPC 端点不可达"
fi
echo ""

# ============================================================
# 5. 可选服务联通性
# ============================================================
echo -e "${BOLD}5. 可选服务联通性${NC}"

# ClickHouse
CH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8123/ping" 2>/dev/null || echo "000")
if [ "$CH_CODE" = "200" ]; then
    check_pass "ClickHouse → HTTP 200"
else
    check_warn "ClickHouse 不可达 (HTTP $CH_CODE)"
fi

# Kafka
if docker compose exec -T kafka kafka-topics.sh --bootstrap-server localhost:29092 --list &>/dev/null 2>&1; then
    TOPIC_COUNT=$(docker compose exec -T kafka kafka-topics.sh --bootstrap-server localhost:29092 --list 2>/dev/null | wc -l | tr -d '[:space:]')
    check_pass "Kafka → $TOPIC_COUNT topics"
else
    check_warn "Kafka 不可达"
fi

# MinIO
MINIO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9000/minio/health/live" 2>/dev/null || echo "000")
if [ "$MINIO_CODE" = "200" ]; then
    check_pass "MinIO → HTTP 200"
else
    check_warn "MinIO 不可达 (HTTP $MINIO_CODE)"
fi

# Qdrant
QDRANT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:6333/healthz" 2>/dev/null || echo "000")
if [ "$QDRANT_CODE" = "200" ]; then
    check_pass "Qdrant → HTTP 200"
else
    check_warn "Qdrant 不可达 (HTTP $QDRANT_CODE)"
fi

# Neo4j
NEO4J_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:7474" 2>/dev/null || echo "000")
if [ "$NEO4J_CODE" = "200" ]; then
    check_pass "Neo4j → HTTP 200"
else
    check_warn "Neo4j 不可达 (HTTP $NEO4J_CODE)"
fi

# Prometheus
PROM_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9090/-/healthy" 2>/dev/null || echo "000")
if [ "$PROM_CODE" = "200" ]; then
    check_pass "Prometheus → HTTP 200"
else
    check_warn "Prometheus 不可达 (HTTP $PROM_CODE)"
fi

# Grafana
GRAFANA_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/health" 2>/dev/null || echo "000")
if [ "$GRAFANA_CODE" = "200" ]; then
    check_pass "Grafana → HTTP 200"
else
    check_warn "Grafana 不可达 (HTTP $GRAFANA_CODE)"
fi

# Jaeger
JAEGER_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:16686/" 2>/dev/null || echo "000")
if [ "$JAEGER_CODE" = "200" ]; then
    check_pass "Jaeger → HTTP 200"
else
    check_warn "Jaeger 不可达 (HTTP $JAEGER_CODE)"
fi

# Vault
VAULT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8200/v1/sys/health" 2>/dev/null || echo "000")
if [ "$VAULT_CODE" = "200" ]; then
    check_pass "Vault → HTTP 200"
else
    check_warn "Vault 不可达 (HTTP $VAULT_CODE)"
fi
echo ""

# ============================================================
# 6. App → 中间件内部联通性（通过 docker exec 在 app 容器内测试）
# ============================================================
echo -e "${BOLD}6. App → 中间件内部联通性${NC}"

APP_CONTAINER=$(docker compose ps -q app 2>/dev/null)
if [ -n "$APP_CONTAINER" ]; then
    # App → MySQL
    if docker compose exec -T app wget -q --spider --timeout=3 http://mysql:3306 2>/dev/null || \
       docker compose exec -T app node -e "const net=require('net');const s=net.connect(3306,'mysql',()=>{console.log('ok');s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),3000)" 2>/dev/null; then
        check_pass "App → MySQL (mysql:3306) 内部联通"
    else
        check_fail "App → MySQL (mysql:3306) 内部不通"
    fi

    # App → Redis
    if docker compose exec -T app node -e "const net=require('net');const s=net.connect(6379,'redis',()=>{console.log('ok');s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),3000)" 2>/dev/null; then
        check_pass "App → Redis (redis:6379) 内部联通"
    else
        check_fail "App → Redis (redis:6379) 内部不通"
    fi

    # App → Kafka
    if docker compose exec -T app node -e "const net=require('net');const s=net.connect(29092,'kafka',()=>{console.log('ok');s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),3000)" 2>/dev/null; then
        check_pass "App → Kafka (kafka:29092) 内部联通"
    else
        check_warn "App → Kafka (kafka:29092) 内部不通"
    fi
else
    check_warn "App 容器未运行，跳过内部联通测试"
fi
echo ""

# ============================================================
# 7. ONNX Runtime 验证
# ============================================================
echo -e "${BOLD}7. ONNX Runtime 验证${NC}"
if [ -n "$APP_CONTAINER" ]; then
    ONNX_CHECK=$(docker compose exec -T app node -e "try{require('onnxruntime-node');console.log('OK')}catch(e){console.log('FAIL:'+e.message)}" 2>/dev/null | tr -d '[:space:]')
    if [ "$ONNX_CHECK" = "OK" ]; then
        check_pass "onnxruntime-node 在容器内可加载"
    else
        check_fail "onnxruntime-node 加载失败: $ONNX_CHECK"
    fi

    ONNX_MODEL=$(docker compose exec -T app ls -la models/world-model-lstm.onnx 2>/dev/null)
    if [ -n "$ONNX_MODEL" ]; then
        check_pass "ONNX 模型文件存在: models/world-model-lstm.onnx"
    else
        check_fail "ONNX 模型文件缺失"
    fi
else
    check_warn "App 容器未运行，跳过 ONNX 验证"
fi
echo ""

# ============================================================
# 汇总
# ============================================================
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL + WARN))
echo -e "${BOLD}验证汇总：${NC} 共 ${TOTAL} 项"
echo -e "  ${GREEN}通过: ${PASS}${NC}  ${RED}失败: ${FAIL}${NC}  ${YELLOW}警告: ${WARN}${NC}"

if [ $FAIL -eq 0 ]; then
    echo ""
    echo -e "${GREEN}${BOLD}🎉 所有核心服务联通验证通过！${NC}"
else
    echo ""
    echo -e "${RED}${BOLD}⚠️  有 ${FAIL} 项验证失败，请检查上述错误信息${NC}"
fi
echo ""
