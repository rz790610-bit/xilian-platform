#!/bin/bash
# ============================================================
#  西联智能平台 — 一键启动开发环境
#  用法: 双击桌面图标 / ./scripts/start-dev.sh / pnpm dev:start
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

# 通用端口检测函数
check_port() {
  nc -z localhost "$1" 2>/dev/null
}

# ============ 1. 检查本地 MySQL ============
echo -e "▶ ${BLUE}检查 MySQL...${NC}"
if check_port 3306; then
  TABLE_COUNT=$(mysql -u portai -pportai123 portai_nexus -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='portai_nexus'" 2>/dev/null || echo "?")
  echo -e "  ${GREEN}✔ MySQL 已运行${NC} (portai_nexus: ${TABLE_COUNT} 张表)"
else
  echo -e "  ${YELLOW}▶ 启动 MySQL...${NC}"
  brew services start mysql 2>/dev/null || true
  # 等待最多 10 秒
  for i in $(seq 1 10); do
    if check_port 3306; then break; fi
    sleep 1
  done
  if check_port 3306; then
    echo -e "  ${GREEN}✔ MySQL 已启动${NC}"
  else
    echo -e "  ${RED}✘ MySQL 启动失败${NC}"
    echo -e "  ${YELLOW}  尝试: brew services restart mysql${NC}"
    echo ""
    read -p "  是否继续？(Y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then exit 1; fi
  fi
fi

# ============ 2. 检查本地 Redis ============
echo -e "▶ ${BLUE}检查 Redis...${NC}"
if check_port 6379; then
  echo -e "  ${GREEN}✔ Redis 已运行${NC} (localhost:6379)"
else
  echo -e "  ${YELLOW}▶ 启动 Redis...${NC}"
  brew services start redis 2>/dev/null || true
  for i in $(seq 1 10); do
    if check_port 6379; then break; fi
    sleep 1
  done
  if check_port 6379; then
    echo -e "  ${GREEN}✔ Redis 已启动${NC}"
  else
    echo -e "  ${RED}✘ Redis 启动失败${NC}"
    echo -e "  ${YELLOW}  尝试: brew services restart redis${NC}"
    echo ""
    read -p "  是否继续？(Y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then exit 1; fi
  fi
fi

# ============ 3. 检查 Docker 容器 ============
echo -e "▶ ${BLUE}检查 Docker 容器...${NC}"

DOCKER_SERVICES=("kafka" "clickhouse" "qdrant" "minio")
DOCKER_PORTS=(9092 8123 6333 9010)
DOCKER_LABELS=("Kafka" "ClickHouse" "Qdrant" "MinIO")

if docker info &>/dev/null 2>&1; then
  NEED_COMPOSE=false
  COMPOSE_TARGETS=""

  for i in "${!DOCKER_SERVICES[@]}"; do
    PORT="${DOCKER_PORTS[$i]}"
    LABEL="${DOCKER_LABELS[$i]}"
    SERVICE="${DOCKER_SERVICES[$i]}"

    if check_port "$PORT"; then
      echo -e "  ${GREEN}✔ ${LABEL} 已运行${NC} (端口 ${PORT})"
    else
      NEED_COMPOSE=true
      COMPOSE_TARGETS="$COMPOSE_TARGETS $SERVICE"
      echo -e "  ${YELLOW}▷ ${LABEL} 需要启动${NC}"
    fi
  done

  if [ "$NEED_COMPOSE" = true ]; then
    echo -e "  ${YELLOW}▶ 启动 Docker 容器:${COMPOSE_TARGETS}${NC}"
    docker compose up -d $COMPOSE_TARGETS 2>&1 | grep -E "Started|Running|Created" || true
    sleep 3
    # 验证启动结果
    for i in "${!DOCKER_SERVICES[@]}"; do
      PORT="${DOCKER_PORTS[$i]}"
      LABEL="${DOCKER_LABELS[$i]}"
      if check_port "$PORT"; then
        echo -e "  ${GREEN}✔ ${LABEL} 已就绪${NC}"
      fi
    done
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
