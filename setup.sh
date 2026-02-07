#!/bin/bash
# ============================================================
# PortAI Nexus 平台 - 一键部署脚本
# 
# 用法:
#   ./setup.sh              # 启动全部服务
#   ./setup.sh core         # 仅启动核心服务 (MySQL + Redis)
#   ./setup.sh db           # 启动数据库集群 (MySQL + Redis + ClickHouse + Qdrant + MinIO)
#   ./setup.sh stop         # 停止所有服务
#   ./setup.sh status       # 查看服务状态
#   ./setup.sh logs [服务名]  # 查看日志
#   ./setup.sh reset        # 重置所有数据（危险操作）
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logo
print_logo() {
  echo -e "${CYAN}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║     PortAI Nexus - Industrial AI Platform  ║"
  echo "  ║              一键部署工具 v1.0              ║"
  echo "  ╚═══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# 日志函数
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $1"; }

# 检查依赖
check_dependencies() {
  log_step "检查系统依赖..."
  
  # Docker
  if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装。请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
  fi
  log_info "Docker $(docker --version | awk '{print $3}') ✓"
  
  # Docker Compose
  if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    log_error "Docker Compose 未安装。请先安装 Docker Compose。"
    exit 1
  fi
  log_info "Docker Compose ✓ (using: $COMPOSE_CMD)"
  
  # Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装。请先安装 Node.js >= 18: https://nodejs.org/"
    exit 1
  fi
  NODE_VER=$(node --version)
  log_info "Node.js $NODE_VER ✓"
  
  # pnpm
  if ! command -v pnpm &> /dev/null; then
    log_warn "pnpm 未安装，正在安装..."
    npm install -g pnpm
  fi
  log_info "pnpm $(pnpm --version) ✓"
  
  echo ""
}

# 检查 .env 文件
check_env() {
  if [ ! -f .env ]; then
    if [ -f .env.local.template ]; then
      log_warn ".env 文件不存在，从模板创建..."
      cp .env.local.template .env
      log_info ".env 文件已创建，请根据需要修改配置"
    else
      log_error ".env 文件不存在，且未找到模板文件"
      exit 1
    fi
  fi
  log_info ".env 配置文件 ✓"
}

# 启动全部服务
start_all() {
  log_step "启动全部 Docker 服务..."
  $COMPOSE_CMD up -d
  echo ""
  log_info "等待服务就绪..."
  sleep 10
  check_services
}

# 启动核心服务
start_core() {
  log_step "启动核心服务 (MySQL + Redis)..."
  $COMPOSE_CMD up -d mysql redis
  echo ""
  log_info "等待 MySQL 就绪..."
  wait_for_mysql
}

# 启动数据库集群
start_db() {
  log_step "启动数据库集群 (MySQL + Redis + ClickHouse + Qdrant + MinIO)..."
  $COMPOSE_CMD up -d mysql redis clickhouse qdrant minio
  echo ""
  log_info "等待服务就绪..."
  wait_for_mysql
  sleep 5
  check_services
}

# 等待 MySQL 就绪
wait_for_mysql() {
  log_info "等待 MySQL 启动..."
  local max_attempts=30
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if $COMPOSE_CMD exec -T mysql mysqladmin ping -h localhost -u root --silent 2>/dev/null; then
      log_info "MySQL 已就绪 ✓"
      return 0
    fi
    attempt=$((attempt + 1))
    echo -n "."
    sleep 2
  done
  echo ""
  log_warn "MySQL 启动超时，请检查日志: $COMPOSE_CMD logs mysql"
}

# 检查服务状态
check_services() {
  log_step "检查服务状态..."
  echo ""
  printf "  %-20s %-12s %-15s\n" "服务" "状态" "端口"
  printf "  %-20s %-12s %-15s\n" "----" "----" "----"
  
  # MySQL
  if $COMPOSE_CMD ps mysql 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "🐬 MySQL 8.0" "在线" "3306"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "🐬 MySQL 8.0" "离线" "3306"
  fi
  
  # Redis
  if $COMPOSE_CMD ps redis 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "🔴 Redis 7" "在线" "6379"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "🔴 Redis 7" "离线" "6379"
  fi
  
  # ClickHouse
  if $COMPOSE_CMD ps clickhouse 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "⚡ ClickHouse" "在线" "8123/9000"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "⚡ ClickHouse" "离线" "8123/9000"
  fi
  
  # MinIO
  if $COMPOSE_CMD ps minio 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "📦 MinIO" "在线" "9010/9011"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "📦 MinIO" "离线" "9010/9011"
  fi
  
  # Qdrant
  if $COMPOSE_CMD ps qdrant 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "🧮 Qdrant" "在线" "6333/6334"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "🧮 Qdrant" "离线" "6333/6334"
  fi
  
  # Kafka
  if $COMPOSE_CMD ps kafka 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "📨 Kafka" "在线" "9092"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "📨 Kafka" "离线" "9092"
  fi
  
  # NebulaGraph
  if $COMPOSE_CMD ps nebula-graphd 2>/dev/null | grep -q "running\|Up"; then
    printf "  %-20s ${GREEN}%-12s${NC} %-15s\n" "🕸️ NebulaGraph" "在线" "9669/19669"
  else
    printf "  %-20s ${RED}%-12s${NC} %-15s\n" "🕸️ NebulaGraph" "离线" "9669/19669"
  fi
  
  echo ""
}

# 安装依赖并启动应用
start_app() {
  log_step "安装 Node.js 依赖..."
  pnpm install
  echo ""
  
  log_step "启动 PortAI Nexus 平台..."
  echo ""
  log_info "平台地址: ${CYAN}http://localhost:3000${NC}"
  log_info "MinIO 控制台: ${CYAN}http://localhost:9011${NC}"
  log_info "ClickHouse HTTP: ${CYAN}http://localhost:8123${NC}"
  log_info "Qdrant Dashboard: ${CYAN}http://localhost:6333/dashboard${NC}"
  echo ""
  
  pnpm dev
}

# 停止所有服务
stop_all() {
  log_step "停止所有 Docker 服务..."
  $COMPOSE_CMD down
  log_info "所有服务已停止"
}

# 查看日志
view_logs() {
  if [ -n "$1" ]; then
    $COMPOSE_CMD logs -f "$1"
  else
    $COMPOSE_CMD logs -f --tail=50
  fi
}

# 重置数据
reset_data() {
  echo -e "${RED}⚠️  警告: 此操作将删除所有数据卷，不可恢复！${NC}"
  read -p "确认重置? (输入 YES 确认): " confirm
  if [ "$confirm" = "YES" ]; then
    log_step "停止服务并删除数据卷..."
    $COMPOSE_CMD down -v
    log_info "所有数据已重置"
  else
    log_info "操作已取消"
  fi
}

# 主流程
main() {
  print_logo
  
  # 切换到项目根目录
  cd "$(dirname "$0")"
  
  case "${1:-}" in
    core)
      check_dependencies
      check_env
      start_core
      start_app
      ;;
    db)
      check_dependencies
      check_env
      start_db
      start_app
      ;;
    stop)
      check_dependencies
      stop_all
      ;;
    status)
      check_dependencies
      check_services
      ;;
    logs)
      check_dependencies
      view_logs "$2"
      ;;
    reset)
      check_dependencies
      reset_data
      ;;
    help|--help|-h)
      echo "用法: ./setup.sh [命令]"
      echo ""
      echo "命令:"
      echo "  (无)     启动全部服务 + 应用"
      echo "  core     仅启动核心服务 (MySQL + Redis) + 应用"
      echo "  db       启动数据库集群 + 应用"
      echo "  stop     停止所有 Docker 服务"
      echo "  status   查看服务状态"
      echo "  logs     查看日志 (可指定服务名)"
      echo "  reset    重置所有数据 (危险操作)"
      echo "  help     显示帮助信息"
      ;;
    *)
      check_dependencies
      check_env
      start_all
      start_app
      ;;
  esac
}

main "$@"
