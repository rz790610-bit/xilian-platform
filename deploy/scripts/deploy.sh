#!/bin/bash

# ============================================================
# 西联智能平台 - 一键部署脚本 (Linux/Mac)
# XiLian Intelligent Platform - One-Click Deploy Script
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 打印横幅
print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║           西联智能平台 - 本地化一键部署                      ║"
    echo "║       XiLian Intelligent Platform - Local Deployment         ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 检查依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        log_info "安装指南: https://docs.docker.com/get-docker/"
        exit 1
    fi
    log_success "Docker 已安装: $(docker --version)"
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        log_info "安装指南: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    if docker compose version &> /dev/null; then
        log_success "Docker Compose 已安装: $(docker compose version --short)"
        COMPOSE_CMD="docker compose"
    else
        log_success "Docker Compose 已安装: $(docker-compose --version)"
        COMPOSE_CMD="docker-compose"
    fi
    
    # 检查 Docker 服务是否运行
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker"
        exit 1
    fi
    log_success "Docker 服务运行正常"
}

# 初始化配置
init_config() {
    log_info "初始化配置文件..."
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
    DOCKER_DIR="$DEPLOY_DIR/docker"
    CONFIG_DIR="$DEPLOY_DIR/config"
    
    # 检查配置文件
    if [ ! -f "$CONFIG_DIR/.env" ]; then
        if [ -f "$CONFIG_DIR/env.template" ]; then
            log_info "从模板创建 .env 配置文件..."
            cp "$CONFIG_DIR/env.template" "$CONFIG_DIR/.env"
            log_warn "请编辑 $CONFIG_DIR/.env 文件，修改默认密码和配置"
        else
            log_error "找不到配置模板文件"
            exit 1
        fi
    fi
    
    # 创建必要的目录
    mkdir -p "$DOCKER_DIR/init/mysql"
    mkdir -p "$DOCKER_DIR/init/clickhouse"
    mkdir -p "$DOCKER_DIR/config/grafana/provisioning/datasources"
    mkdir -p "$DOCKER_DIR/config/grafana/provisioning/dashboards"
    mkdir -p "$DOCKER_DIR/config/grafana/dashboards"
    mkdir -p "$DOCKER_DIR/config/nginx/ssl"
    
    log_success "配置初始化完成"
}

# 创建 Grafana 数据源配置
create_grafana_config() {
    log_info "创建 Grafana 配置..."
    
    # 数据源配置
    cat > "$DOCKER_DIR/config/grafana/provisioning/datasources/datasources.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: ClickHouse
    type: grafana-clickhouse-datasource
    access: proxy
    url: http://clickhouse:8123
    editable: false
EOF

    # 仪表盘配置
    cat > "$DOCKER_DIR/config/grafana/provisioning/dashboards/dashboards.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
EOF

    log_success "Grafana 配置创建完成"
}

# 创建 Nginx 配置
create_nginx_config() {
    log_info "创建 Nginx 配置..."
    
    cat > "$DOCKER_DIR/config/nginx/nginx.conf" << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream xilian_app {
        server xilian-app:3000;
    }

    upstream grafana {
        server grafana:3000;
    }

    server {
        listen 80;
        server_name localhost;

        # 主应用
        location / {
            proxy_pass http://xilian_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Grafana
        location /grafana/ {
            proxy_pass http://grafana/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # 健康检查
        location /health {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF

    log_success "Nginx 配置创建完成"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    
    cd "$DOCKER_DIR"
    
    # 加载环境变量
    if [ -f "$CONFIG_DIR/.env" ]; then
        export $(grep -v '^#' "$CONFIG_DIR/.env" | xargs)
    fi
    
    # 拉取镜像
    log_info "拉取 Docker 镜像..."
    $COMPOSE_CMD pull
    
    # 构建应用镜像
    log_info "构建应用镜像..."
    $COMPOSE_CMD build
    
    # 启动服务
    log_info "启动所有服务..."
    $COMPOSE_CMD up -d
    
    log_success "服务启动完成"
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:${APP_PORT:-3000}/health > /dev/null 2>&1; then
            log_success "应用服务已就绪"
            break
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_warn "服务启动超时，请检查日志"
    fi
    
    echo ""
}

# 显示服务状态
show_status() {
    log_info "服务状态:"
    echo ""
    
    cd "$DOCKER_DIR"
    $COMPOSE_CMD ps
    
    echo ""
    log_info "访问地址:"
    echo "  - 主应用:     http://localhost:${APP_PORT:-3000}"
    echo "  - Grafana:    http://localhost:${GRAFANA_PORT:-3001}"
    echo "  - Prometheus: http://localhost:${PROMETHEUS_PORT:-9090}"
    echo ""
    log_info "默认账号:"
    echo "  - Grafana:    admin / ${GRAFANA_PASSWORD:-admin123}"
    echo ""
}

# 停止服务
stop_services() {
    log_info "停止服务..."
    
    cd "$DOCKER_DIR"
    $COMPOSE_CMD down
    
    log_success "服务已停止"
}

# 清理数据
cleanup() {
    log_warn "此操作将删除所有数据卷，是否继续？(y/N)"
    read -r confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        log_info "清理数据..."
        
        cd "$DOCKER_DIR"
        $COMPOSE_CMD down -v
        
        log_success "数据清理完成"
    else
        log_info "取消清理"
    fi
}

# 查看日志
view_logs() {
    cd "$DOCKER_DIR"
    
    if [ -n "$1" ]; then
        $COMPOSE_CMD logs -f "$1"
    else
        $COMPOSE_CMD logs -f
    fi
}

# 显示帮助
show_help() {
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  deploy    部署并启动所有服务 (默认)"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  status    查看服务状态"
    echo "  logs      查看日志 (可选: logs [服务名])"
    echo "  cleanup   清理所有数据"
    echo "  help      显示此帮助信息"
    echo ""
}

# 主函数
main() {
    print_banner
    
    case "${1:-deploy}" in
        deploy)
            check_dependencies
            init_config
            create_grafana_config
            create_nginx_config
            start_services
            wait_for_services
            show_status
            ;;
        start)
            check_dependencies
            init_config
            start_services
            wait_for_services
            show_status
            ;;
        stop)
            check_dependencies
            init_config
            stop_services
            ;;
        restart)
            check_dependencies
            init_config
            stop_services
            start_services
            wait_for_services
            show_status
            ;;
        status)
            check_dependencies
            init_config
            show_status
            ;;
        logs)
            check_dependencies
            init_config
            view_logs "$2"
            ;;
        cleanup)
            check_dependencies
            init_config
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
