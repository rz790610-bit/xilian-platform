#!/bin/bash

# 西联智能平台 - Kafka 启动脚本
# 用于本地开发和测试环境

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
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

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    print_success "Docker 环境检查通过"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"

# 检查 docker-compose 文件是否存在
check_compose_file() {
    if [ ! -f "$DOCKER_DIR/docker-compose.kafka.yml" ]; then
        print_error "找不到 docker-compose.kafka.yml 文件"
        exit 1
    fi
}

# 启动 Kafka
start_kafka() {
    print_info "正在启动 Kafka 服务..."
    
    cd "$DOCKER_DIR"
    
    # 使用 docker compose 或 docker-compose
    if docker compose version &> /dev/null; then
        docker compose -f docker-compose.kafka.yml up -d
    else
        docker-compose -f docker-compose.kafka.yml up -d
    fi
    
    print_success "Kafka 服务启动命令已执行"
}

# 等待 Kafka 就绪
wait_for_kafka() {
    print_info "等待 Kafka 服务就绪..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list &> /dev/null; then
            print_success "Kafka 服务已就绪"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_warning "Kafka 服务启动超时，请检查日志"
    return 1
}

# 创建默认主题
create_topics() {
    print_info "正在创建默认主题..."
    
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
        echo "  - $topic"
    done
    
    print_success "主题创建完成"
}

# 显示状态
show_status() {
    print_info "Kafka 服务状态:"
    echo ""
    
    # 显示容器状态
    docker ps --filter "name=xilian-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    print_info "访问地址:"
    echo "  - Kafka Broker: localhost:9092"
    echo "  - Kafka UI: http://localhost:8080"
    echo ""
    
    # 显示主题列表
    print_info "已创建的主题:"
    docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null || echo "  (无法获取主题列表)"
}

# 停止 Kafka
stop_kafka() {
    print_info "正在停止 Kafka 服务..."
    
    cd "$DOCKER_DIR"
    
    if docker compose version &> /dev/null; then
        docker compose -f docker-compose.kafka.yml down
    else
        docker-compose -f docker-compose.kafka.yml down
    fi
    
    print_success "Kafka 服务已停止"
}

# 清理数据
clean_data() {
    print_warning "这将删除所有 Kafka 数据，是否继续？(y/N)"
    read -r confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_info "正在清理数据..."
        
        cd "$DOCKER_DIR"
        
        if docker compose version &> /dev/null; then
            docker compose -f docker-compose.kafka.yml down -v
        else
            docker-compose -f docker-compose.kafka.yml down -v
        fi
        
        print_success "数据清理完成"
    else
        print_info "操作已取消"
    fi
}

# 显示帮助
show_help() {
    echo "西联智能平台 - Kafka 管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动 Kafka 服务"
    echo "  stop      停止 Kafka 服务"
    echo "  restart   重启 Kafka 服务"
    echo "  status    显示服务状态"
    echo "  logs      查看 Kafka 日志"
    echo "  clean     清理所有数据"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start    # 启动 Kafka"
    echo "  $0 status   # 查看状态"
    echo "  $0 logs     # 查看日志"
}

# 查看日志
show_logs() {
    docker logs -f xilian-kafka
}

# 主函数
main() {
    local command="${1:-start}"
    
    case "$command" in
        start)
            check_docker
            check_compose_file
            start_kafka
            wait_for_kafka
            create_topics
            show_status
            ;;
        stop)
            stop_kafka
            ;;
        restart)
            stop_kafka
            sleep 2
            check_docker
            check_compose_file
            start_kafka
            wait_for_kafka
            show_status
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        clean)
            clean_data
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
