#!/bin/bash

# 西联智能平台 - 本地开发环境启动脚本
# 支持一键启动 Kafka + Redis + 应用服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 打印函数
print_header() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"
ENV_FILE="$PROJECT_DIR/.env.local"

# 检查 Docker 环境
check_docker() {
    print_info "检查 Docker 环境..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        echo "请访问 https://docs.docker.com/get-docker/ 安装 Docker"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行"
        echo "请启动 Docker Desktop 或 Docker 服务"
        exit 1
    fi
    
    print_success "Docker 环境检查通过"
}

# 检查 Node.js 环境
check_node() {
    print_info "检查 Node.js 环境..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装"
        exit 1
    fi
    
    if ! command -v pnpm &> /dev/null; then
        print_warning "pnpm 未安装，正在安装..."
        npm install -g pnpm
    fi
    
    print_success "Node.js 环境检查通过 ($(node -v))"
}

# 启动基础设施服务
start_infrastructure() {
    print_header "启动基础设施服务"
    
    cd "$DOCKER_DIR"
    
    # 使用 docker compose 或 docker-compose
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    print_info "启动 Zookeeper, Kafka, Redis..."
    $COMPOSE_CMD -f docker-compose.kafka.yml up -d zookeeper kafka redis
    
    # 等待服务就绪
    wait_for_services
    
    # 启动管理界面（可选）
    print_info "启动管理界面 (Kafka UI, Redis Commander)..."
    $COMPOSE_CMD -f docker-compose.kafka.yml up -d kafka-ui redis-commander || true
}

# 等待服务就绪
wait_for_services() {
    print_info "等待服务就绪..."
    
    # 等待 Redis
    local redis_attempts=0
    while [ $redis_attempts -lt 30 ]; do
        if docker exec xilian-redis redis-cli ping &> /dev/null; then
            print_success "Redis 已就绪"
            break
        fi
        echo -n "."
        sleep 1
        redis_attempts=$((redis_attempts + 1))
    done
    
    if [ $redis_attempts -eq 30 ]; then
        print_warning "Redis 启动超时"
    fi
    
    # 等待 Kafka
    local kafka_attempts=0
    while [ $kafka_attempts -lt 60 ]; do
        if docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list &> /dev/null; then
            print_success "Kafka 已就绪"
            break
        fi
        echo -n "."
        sleep 2
        kafka_attempts=$((kafka_attempts + 1))
    done
    
    if [ $kafka_attempts -eq 60 ]; then
        print_warning "Kafka 启动超时"
    fi
    
    echo ""
}

# 创建 Kafka 主题
create_kafka_topics() {
    print_info "创建 Kafka 主题..."
    
    local topics=(
        "xilian.sensor.readings"
        "xilian.telemetry"
        "xilian.device.events"
        "xilian.anomaly.alerts"
        "xilian.anomalies"
        "xilian.aggregations"
        "xilian.diagnosis.tasks"
        "xilian.workflow.events"
        "xilian.system.logs"
    )
    
    for topic in "${topics[@]}"; do
        docker exec xilian-kafka kafka-topics.sh \
            --bootstrap-server localhost:9092 \
            --create \
            --if-not-exists \
            --topic "$topic" \
            --partitions 3 \
            --replication-factor 1 \
            2>/dev/null || true
    done
    
    print_success "Kafka 主题创建完成"
}

# 设置环境变量
setup_env() {
    print_info "配置环境变量..."
    
    # 创建或更新 .env.local 文件
    cat > "$ENV_FILE" << 'EOF'
# 西联智能平台 - 本地开发环境配置
# 由 start-local.sh 自动生成

# Kafka 配置
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=xilian-platform

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# 应用配置
NODE_ENV=development
PORT=3000

# 可选：Ollama 配置（如果本地运行 Ollama）
# OLLAMA_HOST=http://localhost:11434
EOF
    
    print_success "环境变量配置完成: $ENV_FILE"
}

# 安装依赖
install_deps() {
    print_info "检查项目依赖..."
    
    cd "$PROJECT_DIR"
    
    if [ ! -d "node_modules" ]; then
        print_info "安装项目依赖..."
        pnpm install
    else
        print_success "依赖已安装"
    fi
}

# 启动应用
start_app() {
    print_header "启动应用服务"
    
    cd "$PROJECT_DIR"
    
    # 加载环境变量
    if [ -f "$ENV_FILE" ]; then
        export $(grep -v '^#' "$ENV_FILE" | xargs)
    fi
    
    print_info "启动开发服务器..."
    print_info "应用地址: http://localhost:3000"
    print_info "按 Ctrl+C 停止服务"
    echo ""
    
    pnpm dev
}

# 显示服务状态
show_status() {
    print_header "服务状态"
    
    echo "容器状态:"
    docker ps --filter "name=xilian-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  无运行中的容器"
    
    echo ""
    echo "服务地址:"
    echo "  - 应用:           http://localhost:3000"
    echo "  - Kafka Broker:   localhost:9092"
    echo "  - Kafka UI:       http://localhost:8080"
    echo "  - Redis:          localhost:6379"
    echo "  - Redis Commander: http://localhost:8082"
    
    echo ""
    echo "健康检查:"
    
    # 检查 Redis
    if docker exec xilian-redis redis-cli ping &> /dev/null; then
        echo -e "  - Redis:  ${GREEN}✓ 运行中${NC}"
    else
        echo -e "  - Redis:  ${RED}✗ 未运行${NC}"
    fi
    
    # 检查 Kafka
    if docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list &> /dev/null; then
        echo -e "  - Kafka:  ${GREEN}✓ 运行中${NC}"
    else
        echo -e "  - Kafka:  ${RED}✗ 未运行${NC}"
    fi
    
    # 检查 Zookeeper
    if docker exec xilian-zookeeper echo "ruok" | nc localhost 2181 &> /dev/null; then
        echo -e "  - Zookeeper: ${GREEN}✓ 运行中${NC}"
    else
        echo -e "  - Zookeeper: ${RED}✗ 未运行${NC}"
    fi
}

# 停止所有服务
stop_all() {
    print_header "停止所有服务"
    
    cd "$DOCKER_DIR"
    
    if docker compose version &> /dev/null; then
        docker compose -f docker-compose.kafka.yml down
    else
        docker-compose -f docker-compose.kafka.yml down
    fi
    
    print_success "所有服务已停止"
}

# 清理数据
clean_all() {
    print_warning "这将删除所有数据（Kafka、Redis），是否继续？(y/N)"
    read -r confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        cd "$DOCKER_DIR"
        
        if docker compose version &> /dev/null; then
            docker compose -f docker-compose.kafka.yml down -v
        else
            docker-compose -f docker-compose.kafka.yml down -v
        fi
        
        rm -f "$ENV_FILE"
        
        print_success "数据清理完成"
    else
        print_info "操作已取消"
    fi
}

# 显示帮助
show_help() {
    echo "西联智能平台 - 本地开发环境管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start       启动所有服务（Kafka + Redis + 应用）"
    echo "  infra       仅启动基础设施（Kafka + Redis）"
    echo "  app         仅启动应用（需要先启动 infra）"
    echo "  stop        停止所有服务"
    echo "  restart     重启所有服务"
    echo "  status      显示服务状态"
    echo "  logs        查看 Kafka 日志"
    echo "  logs-redis  查看 Redis 日志"
    echo "  clean       清理所有数据"
    echo "  help        显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start    # 一键启动所有服务"
    echo "  $0 infra    # 仅启动 Kafka 和 Redis"
    echo "  $0 status   # 查看服务状态"
    echo ""
    echo "首次使用:"
    echo "  1. 确保已安装 Docker Desktop"
    echo "  2. 运行 '$0 start' 启动所有服务"
    echo "  3. 访问 http://localhost:3000 使用应用"
}

# 主函数
main() {
    local command="${1:-help}"
    
    case "$command" in
        start)
            print_header "西联智能平台 - 本地开发环境"
            check_docker
            check_node
            start_infrastructure
            create_kafka_topics
            setup_env
            install_deps
            show_status
            echo ""
            print_info "基础设施已就绪，启动应用..."
            start_app
            ;;
        infra)
            print_header "启动基础设施服务"
            check_docker
            start_infrastructure
            create_kafka_topics
            setup_env
            show_status
            ;;
        app)
            check_node
            install_deps
            start_app
            ;;
        stop)
            stop_all
            ;;
        restart)
            stop_all
            sleep 2
            check_docker
            start_infrastructure
            create_kafka_topics
            show_status
            ;;
        status)
            show_status
            ;;
        logs)
            docker logs -f xilian-kafka
            ;;
        logs-redis)
            docker logs -f xilian-redis
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
