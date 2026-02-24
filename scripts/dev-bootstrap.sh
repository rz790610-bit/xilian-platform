#!/bin/bash
# ============================================================
# PortAI Nexus - 开发环境自动引导脚本
# 功能：自动检测并启动依赖服务，配置环境变量
# 用法：由 pnpm dev 自动调用，也可手动执行
# ============================================================
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[bootstrap]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[bootstrap]${NC} ✅ $1"; }
log_warn()  { echo -e "${YELLOW}[bootstrap]${NC} ⚠️  $1"; }
log_error() { echo -e "${RED}[bootstrap]${NC} ❌ $1"; }
log_step()  { echo -e "${CYAN}[bootstrap]${NC} 🔧 $1"; }

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  PortAI Nexus - Dev Environment Bootstrap${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ============================================================
# 1. 检测 Docker
# ============================================================
if ! command -v docker &> /dev/null; then
    log_warn "Docker 未安装，跳过服务自动启动"
    log_warn "部分功能（数据库、缓存等）可能不可用"
else
    log_ok "Docker 已安装"

    # ============================================================
    # 2. 检测并启动 MySQL
    # ============================================================
    MYSQL_CONTAINER=""
    MYSQL_RUNNING=false

    # 优先检测已有的 MySQL 容器（支持多种容器名）
    for name in portai-mysql xilian-mysql mysql; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
            MYSQL_CONTAINER="$name"
            MYSQL_RUNNING=true
            break
        fi
    done

    # 如果没有运行中的，检查是否有已停止的
    if [ "$MYSQL_RUNNING" = false ]; then
        for name in portai-mysql xilian-mysql mysql; do
            if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
                MYSQL_CONTAINER="$name"
                log_step "启动已有的 MySQL 容器: $name"
                docker start "$name" > /dev/null 2>&1 || true
                MYSQL_RUNNING=true
                break
            fi
        done
    fi

    # 如果完全没有 MySQL 容器，用 docker-compose 创建
    if [ "$MYSQL_RUNNING" = false ]; then
        if [ -f "docker-compose.yml" ]; then
            log_step "通过 docker-compose 启动 MySQL..."
            docker compose up -d mysql 2>/dev/null || docker-compose up -d mysql 2>/dev/null || {
                log_warn "MySQL 启动失败，数据库功能可能不可用"
            }
            MYSQL_CONTAINER="xilian-mysql"
            MYSQL_RUNNING=true
        else
            log_warn "未找到 docker-compose.yml，无法自动启动 MySQL"
        fi
    fi

    if [ "$MYSQL_RUNNING" = true ]; then
        # 等待 MySQL 就绪（最多 30 秒）
        log_step "等待 MySQL 就绪..."
        MAX_WAIT=30
        WAITED=0
        while [ $WAITED -lt $MAX_WAIT ]; do
            if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost -uroot -p${MYSQL_ROOT_PASSWORD:-root123} 2>/dev/null | grep -q "alive"; then
                break
            fi
            sleep 1
            WAITED=$((WAITED + 1))
        done

        if [ $WAITED -lt $MAX_WAIT ]; then
            log_ok "MySQL 就绪 (容器: $MYSQL_CONTAINER, 端口: 3306)"
        else
            log_warn "MySQL 启动超时，数据库功能可能不可用"
        fi
    fi

    # ============================================================
    # 3. 检测 Redis（可选）
    # ============================================================
    REDIS_RUNNING=false
    for name in xilian-redis portai-redis redis; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
            REDIS_RUNNING=true
            log_ok "Redis 就绪 (容器: $name)"
            break
        fi
    done

    if [ "$REDIS_RUNNING" = false ]; then
        # 尝试启动已停止的 Redis
        for name in xilian-redis portai-redis redis; do
            if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
                docker start "$name" > /dev/null 2>&1 && REDIS_RUNNING=true && log_ok "Redis 已启动 (容器: $name)"
                break
            fi
        done
        if [ "$REDIS_RUNNING" = false ]; then
            log_warn "Redis 未运行，缓存功能将降级"
        fi
    fi
fi

# ============================================================
# 4. 自动配置环境变量（仅设置未定义的变量）
# ============================================================
log_step "配置开发环境变量..."

# 数据库
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="mysql://${MYSQL_USER:-portai}:${MYSQL_PASSWORD:-portai123}@localhost:${MYSQL_PORT:-3306}/${MYSQL_DATABASE:-portai_nexus}"
    log_ok "DATABASE_URL 已自动配置"
fi

# 跳过认证（本地开发）
if [ -z "$SKIP_AUTH" ]; then
    export SKIP_AUTH=true
    log_ok "SKIP_AUTH=true（本地开发跳过认证）"
fi

# Redis
if [ -z "$REDIS_HOST" ]; then
    export REDIS_HOST=localhost
    export REDIS_PORT=6379
fi

# 服务端口
if [ -z "$PORT" ]; then
    export PORT=3000
fi

# 日志级别
if [ -z "$LOG_LEVEL" ]; then
    export LOG_LEVEL=info
fi

# ============================================================
# 5. 加载 .env 文件（如果存在，补充未设置的变量）
# ============================================================
if [ -f ".env" ]; then
    log_step "加载 .env 文件..."
    while IFS='=' read -r key value; do
        # 跳过注释和空行
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # 去除空格
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        # 仅设置未定义的变量（不覆盖已有值）
        if [ -z "${!key}" ] && [ -n "$key" ] && [ -n "$value" ]; then
            export "$key=$value"
        fi
    done < .env
    log_ok ".env 文件已加载"
fi

if [ -f ".env.local" ]; then
    log_step "加载 .env.local 文件..."
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        if [ -z "${!key}" ] && [ -n "$key" ] && [ -n "$value" ]; then
            export "$key=$value"
        fi
    done < .env.local
    log_ok ".env.local 文件已加载"
fi

# ============================================================
# 6. 环境摘要
# ============================================================
echo ""
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo -e "${CYAN}  开发环境就绪${NC}"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
if [ -n "$DATABASE_URL" ]; then
    echo -e "  数据库:  ${GREEN}已配置${NC}"
else
    echo -e "  数据库:  ${RED}未配置${NC}"
fi
if [ -n "$REDIS_HOST" ]; then
    echo -e "  Redis:   ${GREEN}${REDIS_HOST}:${REDIS_PORT}${NC}"
else
    echo -e "  Redis:   ${YELLOW}未配置${NC}"
fi
if [ "$SKIP_AUTH" = "true" ]; then
    echo -e "  认证:    ${GREEN}已跳过 (开发模式)${NC}"
else
    echo -e "  认证:    ${YELLOW}需要配置${NC}"
fi
echo -e "  端口:    ${GREEN}${PORT:-3000}${NC}"
echo -e "  日志:    ${LOG_LEVEL:-info}"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo ""

# ============================================================
# 7. 启动开发服务器
# ============================================================
log_step "启动开发服务器..."
exec ./node_modules/.bin/tsx watch server/core/index.ts
