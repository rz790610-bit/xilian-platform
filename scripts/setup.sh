#!/bin/bash

# ============================================================
# 西联智能平台 - 一键部署脚本
# 支持 macOS 和 Linux
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

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        log_info "检测到 macOS 系统"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        log_info "检测到 Linux 系统"
    else
        log_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 安装 Homebrew (macOS)
install_homebrew() {
    if [[ "$OS" == "macos" ]] && ! command_exists brew; then
        log_info "正在安装 Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        log_success "Homebrew 安装完成"
    fi
}

# 安装 Node.js
install_nodejs() {
    if command_exists node; then
        NODE_VERSION=$(node -v)
        log_info "Node.js 已安装: $NODE_VERSION"
        
        # 检查版本是否 >= 18
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
        if [[ $MAJOR_VERSION -lt 18 ]]; then
            log_warning "Node.js 版本过低，建议升级到 18 或更高版本"
        fi
        return
    fi

    log_info "正在安装 Node.js..."
    
    if [[ "$OS" == "macos" ]]; then
        brew install node@22
        log_success "Node.js 安装完成"
    else
        # Linux: 使用 NodeSource
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
        log_success "Node.js 安装完成"
    fi
}

# 安装 pnpm
install_pnpm() {
    if command_exists pnpm; then
        PNPM_VERSION=$(pnpm -v)
        log_info "pnpm 已安装: $PNPM_VERSION"
        return
    fi

    log_info "正在安装 pnpm..."
    npm install -g pnpm
    log_success "pnpm 安装完成"
}

# 安装 Docker
install_docker() {
    if command_exists docker; then
        DOCKER_VERSION=$(docker -v)
        log_info "Docker 已安装: $DOCKER_VERSION"
        return
    fi

    log_info "正在安装 Docker..."
    
    if [[ "$OS" == "macos" ]]; then
        log_warning "请手动安装 Docker Desktop for Mac"
        log_info "下载地址: https://www.docker.com/products/docker-desktop"
        log_info "安装完成后请重新运行此脚本"
        exit 1
    else
        # Linux: 使用官方脚本
        curl -fsSL https://get.docker.com | sudo sh
        sudo usermod -aG docker $USER
        log_success "Docker 安装完成"
        log_warning "请注销并重新登录以使 Docker 权限生效"
    fi
}

# 安装 Docker Compose
install_docker_compose() {
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_info "Docker Compose 已安装"
        return
    fi

    log_info "正在安装 Docker Compose..."
    
    if [[ "$OS" == "macos" ]]; then
        # Docker Desktop for Mac 自带 Docker Compose
        log_info "Docker Desktop for Mac 已包含 Docker Compose"
    else
        sudo apt-get install -y docker-compose-plugin
        log_success "Docker Compose 安装完成"
    fi
}

# 检查 Docker 是否运行
check_docker_running() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker 未运行，请启动 Docker 后重试"
        if [[ "$OS" == "macos" ]]; then
            log_info "请打开 Docker Desktop 应用"
        else
            log_info "请运行: sudo systemctl start docker"
        fi
        exit 1
    fi
    log_success "Docker 正在运行"
}

# 创建 .env.local 文件
create_env_file() {
    if [[ -f ".env.local" ]]; then
        log_info ".env.local 文件已存在，跳过创建"
        return
    fi

    log_info "正在创建 .env.local 配置文件..."
    
    cp .env.local.template .env.local
    
    log_success ".env.local 配置文件创建完成"
    log_info "请根据需要编辑 .env.local 文件"
}

# 安装项目依赖
install_dependencies() {
    log_info "正在安装项目依赖..."
    pnpm install
    log_success "项目依赖安装完成"
}

# 启动基础设施服务
start_infrastructure() {
    log_info "正在启动基础设施服务 (Kafka, Redis)..."
    
    cd docker
    
    # 使用 docker compose (新版) 或 docker-compose (旧版)
    if docker compose version >/dev/null 2>&1; then
        docker compose up -d
    else
        docker-compose up -d
    fi
    
    cd ..
    
    log_success "基础设施服务启动完成"
    
    # 等待服务就绪
    log_info "等待服务就绪..."
    sleep 10
    
    # 检查服务状态
    check_service_status
}

# 检查服务状态
check_service_status() {
    log_info "检查服务状态..."
    
    # 检查 Kafka
    if docker ps | grep -q "kafka"; then
        log_success "Kafka 服务运行中"
    else
        log_warning "Kafka 服务未运行"
    fi
    
    # 检查 Redis
    if docker ps | grep -q "redis"; then
        log_success "Redis 服务运行中"
    else
        log_warning "Redis 服务未运行"
    fi
    
    # 检查 Zookeeper
    if docker ps | grep -q "zookeeper"; then
        log_success "Zookeeper 服务运行中"
    else
        log_warning "Zookeeper 服务未运行"
    fi
}

# 初始化数据库
init_database() {
    log_info "正在初始化数据库..."
    
    # 检查是否配置了数据库
    if [[ -z "${DATABASE_URL}" ]] && ! grep -q "DATABASE_URL" .env.local 2>/dev/null; then
        log_warning "未配置 DATABASE_URL，跳过数据库初始化"
        log_info "如需使用数据库功能，请在 .env.local 中配置 DATABASE_URL"
        return
    fi
    
    pnpm db:push
    log_success "数据库初始化完成"
}

# 启动应用
start_application() {
    log_info "正在启动应用..."
    
    # 使用 dotenv-cli 加载 .env.local
    pnpm dev:local &
    
    APP_PID=$!
    
    log_success "应用启动中..."
    log_info "应用地址: http://localhost:3000"
    log_info "Kafka UI: http://localhost:8080"
    log_info "Redis Commander: http://localhost:8082"
    
    # 等待应用启动
    sleep 5
    
    # 检查应用是否启动成功
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        log_success "应用启动成功！"
    else
        log_warning "应用可能还在启动中，请稍等..."
    fi
}

# 停止所有服务
stop_all() {
    log_info "正在停止所有服务..."
    
    # 停止 Docker 服务
    cd docker
    if docker compose version >/dev/null 2>&1; then
        docker compose down
    else
        docker-compose down
    fi
    cd ..
    
    # 停止 Node.js 进程
    pkill -f "tsx watch" 2>/dev/null || true
    
    log_success "所有服务已停止"
}

# 显示帮助信息
show_help() {
    echo ""
    echo "西联智能平台 - 一键部署脚本"
    echo ""
    echo "用法: ./scripts/setup.sh [命令]"
    echo ""
    echo "命令:"
    echo "  install     安装所有依赖（Node.js, pnpm, Docker）"
    echo "  start       启动所有服务（基础设施 + 应用）"
    echo "  stop        停止所有服务"
    echo "  restart     重启所有服务"
    echo "  status      检查服务状态"
    echo "  infra       仅启动基础设施服务（Kafka, Redis）"
    echo "  app         仅启动应用"
    echo "  help        显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./scripts/setup.sh install   # 首次安装"
    echo "  ./scripts/setup.sh start     # 启动所有服务"
    echo "  ./scripts/setup.sh stop      # 停止所有服务"
    echo ""
}

# 完整安装流程
full_install() {
    log_info "开始完整安装流程..."
    echo ""
    
    detect_os
    
    if [[ "$OS" == "macos" ]]; then
        install_homebrew
    fi
    
    install_nodejs
    install_pnpm
    install_docker
    install_docker_compose
    
    echo ""
    log_success "所有依赖安装完成！"
    echo ""
    log_info "下一步："
    log_info "1. 确保 Docker 正在运行"
    log_info "2. 运行 ./scripts/setup.sh start 启动服务"
}

# 完整启动流程
full_start() {
    log_info "开始启动流程..."
    echo ""
    
    detect_os
    check_docker_running
    
    # 进入项目目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR/.."
    
    create_env_file
    install_dependencies
    start_infrastructure
    
    # 可选：初始化数据库
    # init_database
    
    start_application
    
    echo ""
    log_success "=========================================="
    log_success "  西联智能平台启动完成！"
    log_success "=========================================="
    echo ""
    log_info "访问地址："
    log_info "  应用:          http://localhost:3000"
    log_info "  Kafka UI:      http://localhost:8080"
    log_info "  Redis Commander: http://localhost:8082"
    echo ""
    log_info "停止服务: ./scripts/setup.sh stop"
    echo ""
}

# 主函数
main() {
    COMMAND=${1:-help}
    
    case $COMMAND in
        install)
            full_install
            ;;
        start)
            full_start
            ;;
        stop)
            stop_all
            ;;
        restart)
            stop_all
            sleep 2
            full_start
            ;;
        status)
            check_docker_running
            check_service_status
            ;;
        infra)
            detect_os
            check_docker_running
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            cd "$SCRIPT_DIR/.."
            start_infrastructure
            ;;
        app)
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            cd "$SCRIPT_DIR/.."
            create_env_file
            install_dependencies
            start_application
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
