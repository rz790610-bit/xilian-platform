#!/bin/bash

# ============================================================
# 西联智能平台 - 数据库初始化脚本
# XiLian Intelligent Platform - Database Initialization Script
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 加载环境变量
if [ -f "$PROJECT_DIR/config/.env" ]; then
    source "$PROJECT_DIR/config/.env"
fi

# 默认值
MYSQL_HOST=${MYSQL_HOST:-localhost}
MYSQL_PORT=${MYSQL_PORT:-3306}
MYSQL_USER=${MYSQL_USER:-xilian}
MYSQL_PASSWORD=${MYSQL_PASSWORD:-xilian123}
MYSQL_DATABASE=${MYSQL_DATABASE:-xilian}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-root123}

CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-localhost}
CLICKHOUSE_PORT=${CLICKHOUSE_HTTP_PORT:-8123}

# 等待 MySQL 就绪
wait_for_mysql() {
    log_info "等待 MySQL 服务就绪..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if mysqladmin ping -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"root" -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
            log_success "MySQL 服务已就绪"
            return 0
        fi
        log_info "等待 MySQL... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "MySQL 服务启动超时"
    return 1
}

# 等待 ClickHouse 就绪
wait_for_clickhouse() {
    log_info "等待 ClickHouse 服务就绪..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/ping" | grep -q "Ok"; then
            log_success "ClickHouse 服务已就绪"
            return 0
        fi
        log_info "等待 ClickHouse... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "ClickHouse 服务启动超时"
    return 1
}

# 初始化 MySQL
init_mysql() {
    log_info "初始化 MySQL 数据库..."
    
    # 执行 schema 脚本
    if [ -f "$DOCKER_DIR/init/mysql/01-schema.sql" ]; then
        log_info "执行表结构初始化脚本..."
        mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"root" -p"$MYSQL_ROOT_PASSWORD" < "$DOCKER_DIR/init/mysql/01-schema.sql"
        log_success "表结构初始化完成"
    fi
    
    # 执行 seed 脚本
    if [ -f "$DOCKER_DIR/init/mysql/02-seed-data.sql" ]; then
        log_info "执行初始数据填充脚本..."
        mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"root" -p"$MYSQL_ROOT_PASSWORD" < "$DOCKER_DIR/init/mysql/02-seed-data.sql"
        log_success "初始数据填充完成"
    fi
    
    log_success "MySQL 初始化完成"
}

# 初始化 ClickHouse
init_clickhouse() {
    log_info "初始化 ClickHouse 数据库..."
    
    if [ -f "$DOCKER_DIR/init/clickhouse/01-schema.sql" ]; then
        log_info "执行 ClickHouse 表结构初始化脚本..."
        
        # 逐条执行 SQL（ClickHouse 不支持多语句）
        while IFS= read -r line || [ -n "$line" ]; do
            # 跳过注释和空行
            if [[ "$line" =~ ^-- ]] || [[ -z "${line// }" ]]; then
                continue
            fi
            
            # 累积 SQL 语句直到遇到分号
            sql_buffer="$sql_buffer $line"
            
            if [[ "$line" =~ \;$ ]]; then
                # 执行 SQL
                curl -s "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/" --data-binary "$sql_buffer" > /dev/null 2>&1 || true
                sql_buffer=""
            fi
        done < "$DOCKER_DIR/init/clickhouse/01-schema.sql"
        
        log_success "ClickHouse 表结构初始化完成"
    fi
    
    log_success "ClickHouse 初始化完成"
}

# 验证初始化
verify_init() {
    log_info "验证数据库初始化..."
    
    # 验证 MySQL
    local mysql_tables=$(mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -D"$MYSQL_DATABASE" -N -e "SHOW TABLES;" 2>/dev/null | wc -l)
    log_info "MySQL 表数量: $mysql_tables"
    
    # 验证 ClickHouse
    local ch_tables=$(curl -s "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/" --data-binary "SELECT count() FROM system.tables WHERE database = 'xilian_timeseries'" 2>/dev/null)
    log_info "ClickHouse 表数量: $ch_tables"
    
    if [ "$mysql_tables" -gt 0 ]; then
        log_success "数据库初始化验证通过"
        return 0
    else
        log_error "数据库初始化验证失败"
        return 1
    fi
}

# 主函数
main() {
    echo ""
    echo "=============================================="
    echo "  西联智能平台 - 数据库初始化"
    echo "  XiLian Platform - Database Initialization"
    echo "=============================================="
    echo ""
    
    case "${1:-all}" in
        mysql)
            wait_for_mysql && init_mysql
            ;;
        clickhouse)
            wait_for_clickhouse && init_clickhouse
            ;;
        verify)
            verify_init
            ;;
        all)
            wait_for_mysql && init_mysql
            wait_for_clickhouse && init_clickhouse
            verify_init
            ;;
        *)
            echo "用法: $0 {mysql|clickhouse|verify|all}"
            exit 1
            ;;
    esac
    
    echo ""
    log_success "数据库初始化完成！"
    echo ""
}

main "$@"
