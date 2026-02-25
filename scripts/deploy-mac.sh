#!/bin/bash
# ============================================================
# PortAI Nexus — Mac Docker 一键部署脚本
# ============================================================
# 用法：
#   chmod +x scripts/deploy-mac.sh
#   ./scripts/deploy-mac.sh              # 核心服务（MySQL + Redis + App）
#   ./scripts/deploy-mac.sh --full       # 全部服务
#   ./scripts/deploy-mac.sh --stop       # 停止所有服务
#   ./scripts/deploy-mac.sh --status     # 查看服务状态
#   ./scripts/deploy-mac.sh --logs       # 查看应用日志
#   ./scripts/deploy-mac.sh --rebuild    # 重新构建并部署
# ============================================================
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[deploy]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[deploy]${NC} ✅ $1"; }
log_warn()  { echo -e "${YELLOW}[deploy]${NC} ⚠️  $1"; }
log_error() { echo -e "${RED}[deploy]${NC} ❌ $1"; }
log_step()  { echo -e "${CYAN}[deploy]${NC} 🔧 $1"; }

# 切换到项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     ${BOLD}PortAI Nexus — Docker 部署工具 v1.0${NC}${CYAN}         ║${NC}"
echo -e "${CYAN}║     Industrial AI Self-Evolving Platform         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# 参数解析
# ============================================================
ACTION="${1:-deploy}"
PROFILE=""

case "$ACTION" in
    --full)
        ACTION="deploy"
        PROFILE="--profile full"
        ;;
    --bigdata)
        ACTION="deploy"
        PROFILE="--profile bigdata"
        ;;
    --llm)
        ACTION="deploy"
        PROFILE="--profile llm"
        ;;
    --stop)
        log_step "停止所有服务..."
        docker compose --profile full down
        log_ok "所有服务已停止"
        exit 0
        ;;
    --status)
        echo -e "${BOLD}服务状态：${NC}"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        exit 0
        ;;
    --logs)
        docker compose logs -f --tail=100 app
        exit 0
        ;;
    --rebuild)
        ACTION="rebuild"
        ;;
    --help|-h)
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  (无参数)     部署核心服务 (MySQL + Redis + App + 监控)"
        echo "  --full       部署全部服务 (含 Elasticsearch, Kafka Connect, Ollama 等)"
        echo "  --bigdata    部署核心 + 大数据服务 (Flink, Airflow, ES)"
        echo "  --llm        部署核心 + LLM 服务 (Ollama)"
        echo "  --stop       停止所有服务"
        echo "  --status     查看服务状态"
        echo "  --logs       查看应用日志 (实时)"
        echo "  --rebuild    重新构建镜像并部署"
        echo "  --help       显示帮助信息"
        exit 0
        ;;
esac

# ============================================================
# 0. 前置检查
# ============================================================
log_step "前置环境检查..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装！请先安装 Docker Desktop for Mac"
    echo "  下载地址: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# 检查 Docker 是否运行
if ! docker info &> /dev/null 2>&1; then
    log_error "Docker 未运行！请启动 Docker Desktop"
    exit 1
fi

log_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# 检查 Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    log_error "Docker Compose 不可用"
    exit 1
fi
log_ok "Docker Compose $(docker compose version --short)"

# 检查可用内存（Mac 上 Docker 分配的内存）
DOCKER_MEM=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")
DOCKER_MEM_GB=$(echo "scale=1; $DOCKER_MEM / 1073741824" | bc 2>/dev/null || echo "unknown")
log_info "Docker 可用内存: ${DOCKER_MEM_GB}GB"

if [ "$DOCKER_MEM_GB" != "unknown" ]; then
    MEM_CHECK=$(echo "$DOCKER_MEM_GB < 4" | bc 2>/dev/null || echo "0")
    if [ "$MEM_CHECK" = "1" ]; then
        log_warn "建议为 Docker 分配至少 4GB 内存（当前 ${DOCKER_MEM_GB}GB）"
        log_warn "Docker Desktop → Settings → Resources → Memory"
    fi
fi

# ============================================================
# 1. 环境变量配置
# ============================================================
log_step "检查环境变量..."

if [ ! -f .env ]; then
    if [ -f .env.docker ]; then
        cp .env.docker .env
        log_ok "已从 .env.docker 创建 .env 文件"
        log_warn "请根据需要编辑 .env 文件（特别是 XAI_API_KEY）"
    else
        log_error "缺少 .env 文件，请复制 .env.docker 并修改"
        exit 1
    fi
else
    log_ok ".env 文件已存在"
fi

# ============================================================
# 2. 构建应用镜像
# ============================================================
if [ "$ACTION" = "rebuild" ]; then
    log_step "强制重新构建应用镜像..."
    docker compose build --no-cache app
    log_ok "应用镜像构建完成"
else
    # 检查镜像是否存在
    APP_IMAGE=$(docker compose config --images 2>/dev/null | grep -E "app|nexus" | head -1)
    if [ -z "$(docker images -q "$APP_IMAGE" 2>/dev/null)" ] && [ -z "$(docker compose images app -q 2>/dev/null)" ]; then
        log_step "首次部署，构建应用镜像（约 3-5 分钟）..."
        docker compose build app
        log_ok "应用镜像构建完成"
    else
        log_ok "应用镜像已存在（使用 --rebuild 强制重建）"
    fi
fi

# ============================================================
# 3. 启动基础服务
# ============================================================
log_step "启动服务..."

# 先启动基础设施（MySQL + Redis）
log_info "启动 MySQL + Redis..."
docker compose up -d mysql redis
log_ok "基础数据库服务已启动"

# 等待 MySQL 就绪
log_info "等待 MySQL 就绪..."
RETRIES=0
MAX_RETRIES=60
while [ $RETRIES -lt $MAX_RETRIES ]; do
    if docker compose exec -T mysql mysqladmin ping -h localhost -u root -proot123 &>/dev/null 2>&1; then
        break
    fi
    RETRIES=$((RETRIES + 1))
    sleep 2
done

if [ $RETRIES -ge $MAX_RETRIES ]; then
    log_error "MySQL 启动超时，请检查日志: docker compose logs mysql"
    exit 1
fi
log_ok "MySQL 就绪"

# 等待 Redis 就绪
log_info "等待 Redis 就绪..."
RETRIES=0
while [ $RETRIES -lt 30 ]; do
    if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        break
    fi
    RETRIES=$((RETRIES + 1))
    sleep 1
done
log_ok "Redis 就绪"

# ============================================================
# 4. 启动所有服务
# ============================================================
log_step "启动全部核心服务..."
docker compose up -d $PROFILE
log_ok "服务启动命令已执行"

# ============================================================
# 5. 等待应用就绪
# ============================================================
log_info "等待应用启动..."
RETRIES=0
MAX_RETRIES=90
while [ $RETRIES -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/rest/_health 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        break
    fi
    RETRIES=$((RETRIES + 1))
    if [ $((RETRIES % 10)) -eq 0 ]; then
        log_info "  仍在启动中... (${RETRIES}s)"
    fi
    sleep 2
done

if [ $RETRIES -ge $MAX_RETRIES ]; then
    log_warn "应用启动超时，可能仍在初始化中"
    log_info "查看日志: docker compose logs -f app"
else
    log_ok "应用就绪！"
fi

# ============================================================
# 6. 打印访问信息
# ============================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            ${BOLD}🚀 部署完成！${NC}${CYAN}                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}📡 服务访问地址：${NC}"
echo -e "  ${GREEN}应用主页${NC}      http://localhost:3000"
echo -e "  ${GREEN}API 健康检查${NC}  http://localhost:3000/api/rest/_health"
echo ""

# 检查可选服务
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q grafana; then
    echo -e "  ${GREEN}Grafana${NC}       http://localhost:3100  (admin/admin)"
fi
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q prometheus; then
    echo -e "  ${GREEN}Prometheus${NC}    http://localhost:9090"
fi
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q jaeger; then
    echo -e "  ${GREEN}Jaeger${NC}        http://localhost:16686"
fi
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q minio; then
    echo -e "  ${GREEN}MinIO${NC}         http://localhost:9001  (portai/portai123456)"
fi
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q neo4j; then
    echo -e "  ${GREEN}Neo4j${NC}         http://localhost:7474  (neo4j/portai123)"
fi
if docker compose ps --format '{{.Name}}' 2>/dev/null | grep -q vault; then
    echo -e "  ${GREEN}Vault${NC}         http://localhost:8200  (token: xilian-dev-root-token)"
fi

echo ""
echo -e "${BOLD}🔧 常用命令：${NC}"
echo -e "  查看状态    ${CYAN}./scripts/deploy-mac.sh --status${NC}"
echo -e "  查看日志    ${CYAN}./scripts/deploy-mac.sh --logs${NC}"
echo -e "  停止服务    ${CYAN}./scripts/deploy-mac.sh --stop${NC}"
echo -e "  重新构建    ${CYAN}./scripts/deploy-mac.sh --rebuild${NC}"
echo -e "  全量部署    ${CYAN}./scripts/deploy-mac.sh --full${NC}"
echo ""

# 打印服务状态表
echo -e "${BOLD}📊 服务状态：${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
echo ""
