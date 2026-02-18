#!/bin/bash
# ============================================================
#  西联智能平台 — 一键启动开发环境
#  用法: ./scripts/start-dev.sh 或 pnpm start
# ============================================================
set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🚀 西联智能平台 — 启动开发环境${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

cd "$PROJECT_DIR"

# ============ 1. 检查本地 MySQL ============
echo -e "▶ ${BLUE}检查 MySQL...${NC}"
if brew services info mysql 2>/dev/null | grep -q "Running: ✔"; then
  TABLE_COUNT=$(mysql -u portai -pportai123 portai_nexus -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='portai_nexus'" 2>/dev/null || echo "0")
  echo -e "  ${GREEN}✔ MySQL 已运行${NC} (portai_nexus: ${TABLE_COUNT} 张表)"
else
  echo -e "  ${YELLOW}▶ 启动 MySQL...${NC}"
  brew services start mysql
  sleep 3
  if brew services info mysql 2>/dev/null | grep -q "Running: ✔"; then
    echo -e "  ${GREEN}✔ MySQL 已启动${NC}"
  else
    echo -e "  ${RED}✘ MySQL 启动失败，请检查: brew services info mysql${NC}"
    exit 1
  fi
fi

# ============ 2. 检查本地 Redis ============
echo -e "▶ ${BLUE}检查 Redis...${NC}"
if brew services info redis 2>/dev/null | grep -q "Running: ✔"; then
  echo -e "  ${GREEN}✔ Redis 已运行${NC}"
else
  echo -e "  ${YELLOW}▶ 启动 Redis...${NC}"
  brew services start redis
  sleep 2
  if brew services info redis 2>/dev/null | grep -q "Running: ✔"; then
    echo -e "  ${GREEN}✔ Redis 已启动${NC}"
  else
    echo -e "  ${RED}✘ Redis 启动失败，请检查: brew services info redis${NC}"
    exit 1
  fi
fi

# ============ 3. 检查 Docker 容器 ============
echo -e "▶ ${BLUE}检查 Docker 容器...${NC}"

DOCKER_SERVICES=("kafka" "clickhouse" "qdrant" "minio")
DOCKER_CONTAINERS=("xilian-kafka" "xilian-clickhouse" "xilian-qdrant" "xilian-minio")
DOCKER_PORTS=(9092 8123 6333 9010)
DOCKER_LABELS=("Kafka" "ClickHouse" "Qdrant" "MinIO")

if docker info &>/dev/null 2>&1; then
  NEED_COMPOSE=false
  COMPOSE_TARGETS=""

  for i in "${!DOCKER_CONTAINERS[@]}"; do
    CONTAINER="${DOCKER_CONTAINERS[$i]}"
    PORT="${DOCKER_PORTS[$i]}"
    LABEL="${DOCKER_LABELS[$i]}"
    SERVICE="${DOCKER_SERVICES[$i]}"

    # 先检查端口是否已通（可能已在运行）
    if nc -z localhost "$PORT" 2>/dev/null; then
      echo -e "  ${GREEN}✔ ${LABEL} 已运行${NC} (端口 ${PORT})"
    else
      # 检查容器是否存在但未运行
      STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "not_found")
      if [ "$STATUS" = "running" ]; then
        echo -e "  ${GREEN}✔ ${LABEL} 容器运行中${NC}"
      else
        NEED_COMPOSE=true
        COMPOSE_TARGETS="$COMPOSE_TARGETS $SERVICE"
        echo -e "  ${YELLOW}▷ ${LABEL} 需要启动${NC}"
      fi
    fi
  done

  if [ "$NEED_COMPOSE" = true ]; then
    echo -e "  ${YELLOW}▶ 启动 Docker 容器:${COMPOSE_TARGETS}${NC}"
    docker compose up -d $COMPOSE_TARGETS 2>&1 | grep -E "Started|Running|Created" || true
    sleep 3
    echo -e "  ${GREEN}✔ Docker 容器已启动${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠ Docker Desktop 未运行${NC}"
  echo -e "  ${YELLOW}  Kafka/ClickHouse/Qdrant/MinIO 将不可用${NC}"
  echo -e "  ${YELLOW}  MySQL 和 Redis 仍可正常使用${NC}"
  echo ""
  read -p "  是否继续启动开发服务器？(Y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo -e "  ${BLUE}请先打开 Docker Desktop，然后重新运行此脚本${NC}"
    exit 0
  fi
fi

# ============ 4. 启动开发服务器 ============
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✔ 环境就绪${NC}"
echo -e "  ${BLUE}数据库:${NC}  MySQL (localhost:3306/portai_nexus)"
echo -e "  ${BLUE}缓存:${NC}    Redis (localhost:6379)"
echo -e "  ${BLUE}浏览器:${NC}  ${GREEN}http://localhost:3000${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "▶ ${BLUE}启动开发服务器...${NC}"
echo ""

pnpm dev:native
