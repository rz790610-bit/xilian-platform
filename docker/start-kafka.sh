#!/bin/bash

# 西联智能平台 - Kafka 集群启动脚本
# 用法: ./start-kafka.sh [start|stop|restart|status|logs|topics]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.kafka.yml"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║   🚀 西联智能平台 - Kafka 消息队列集群                          ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装，请先安装 Docker${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}错误: Docker 服务未运行，请启动 Docker${NC}"
        exit 1
    fi
}

start_kafka() {
    echo -e "${YELLOW}正在启动 Kafka 集群...${NC}"
    docker compose -f "$COMPOSE_FILE" up -d
    
    echo -e "${YELLOW}等待服务启动...${NC}"
    sleep 10
    
    # 检查服务状态
    if docker compose -f "$COMPOSE_FILE" ps | grep -q "healthy\|running"; then
        echo -e "${GREEN}"
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║   ✅ Kafka 集群启动成功                                        ║"
        echo "║                                                                ║"
        echo "║   服务地址:                                                     ║"
        echo "║   - Kafka Broker:     localhost:9092                           ║"
        echo "║   - Zookeeper:        localhost:2181                           ║"
        echo "║   - Kafka UI:         http://localhost:8080                    ║"
        echo "║   - Schema Registry:  http://localhost:8081                    ║"
        echo "║                                                                ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo -e "${NC}"
    else
        echo -e "${RED}警告: 部分服务可能未正常启动，请检查日志${NC}"
        docker compose -f "$COMPOSE_FILE" ps
    fi
}

stop_kafka() {
    echo -e "${YELLOW}正在停止 Kafka 集群...${NC}"
    docker compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}Kafka 集群已停止${NC}"
}

restart_kafka() {
    stop_kafka
    sleep 2
    start_kafka
}

show_status() {
    echo -e "${BLUE}Kafka 集群状态:${NC}"
    docker compose -f "$COMPOSE_FILE" ps
}

show_logs() {
    SERVICE=${2:-""}
    if [ -n "$SERVICE" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
    else
        docker compose -f "$COMPOSE_FILE" logs -f
    fi
}

create_topics() {
    echo -e "${YELLOW}正在创建默认主题...${NC}"
    
    # 等待 Kafka 完全启动
    sleep 5
    
    # 创建西联平台所需的主题
    TOPICS=(
        "xilian.sensor.readings:3:1"      # 传感器数据
        "xilian.device.events:3:1"        # 设备事件
        "xilian.anomaly.alerts:3:1"       # 异常告警
        "xilian.diagnosis.tasks:3:1"      # 诊断任务
        "xilian.workflow.events:3:1"      # 工作流事件
        "xilian.system.logs:3:1"          # 系统日志
    )
    
    for TOPIC_CONFIG in "${TOPICS[@]}"; do
        IFS=':' read -r TOPIC PARTITIONS REPLICATION <<< "$TOPIC_CONFIG"
        echo -e "  创建主题: ${GREEN}$TOPIC${NC} (分区: $PARTITIONS, 副本: $REPLICATION)"
        docker exec xilian-kafka kafka-topics --create \
            --if-not-exists \
            --bootstrap-server localhost:9093 \
            --topic "$TOPIC" \
            --partitions "$PARTITIONS" \
            --replication-factor "$REPLICATION" 2>/dev/null || true
    done
    
    echo -e "${GREEN}主题创建完成${NC}"
    echo ""
    echo -e "${BLUE}当前主题列表:${NC}"
    docker exec xilian-kafka kafka-topics --list --bootstrap-server localhost:9093
}

list_topics() {
    echo -e "${BLUE}Kafka 主题列表:${NC}"
    docker exec xilian-kafka kafka-topics --list --bootstrap-server localhost:9093
}

describe_topic() {
    TOPIC=${2:-""}
    if [ -z "$TOPIC" ]; then
        echo -e "${RED}请指定主题名称${NC}"
        exit 1
    fi
    docker exec xilian-kafka kafka-topics --describe --bootstrap-server localhost:9093 --topic "$TOPIC"
}

# 主程序
print_banner
check_docker

case "${1:-start}" in
    start)
        start_kafka
        ;;
    stop)
        stop_kafka
        ;;
    restart)
        restart_kafka
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$@"
        ;;
    topics)
        create_topics
        ;;
    list-topics)
        list_topics
        ;;
    describe)
        describe_topic "$@"
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|topics|list-topics|describe <topic>}"
        echo ""
        echo "命令说明:"
        echo "  start       - 启动 Kafka 集群"
        echo "  stop        - 停止 Kafka 集群"
        echo "  restart     - 重启 Kafka 集群"
        echo "  status      - 查看集群状态"
        echo "  logs [服务] - 查看日志 (可选: kafka, zookeeper, kafka-ui)"
        echo "  topics      - 创建默认主题"
        echo "  list-topics - 列出所有主题"
        echo "  describe    - 查看主题详情"
        exit 1
        ;;
esac
