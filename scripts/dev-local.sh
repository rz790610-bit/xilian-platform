#!/bin/bash
# ============================================================
# 西联智能平台 - 本地开发启动脚本（无 Docker 依赖）
# 使用方式: bash scripts/dev-local.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() { echo -e "${CYAN}▶ $1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✔ $1${NC}"; }
log_warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
log_err()  { echo -e "  ${RED}✘ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo ""
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo -e "${CYAN}  西联智能平台 - 本地开发模式${NC}"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo ""

# ============================================================
# 1. 检查并启动 MySQL
# ============================================================
log_step "检查 MySQL..."
MYSQL_OK=false

if command -v brew &>/dev/null; then
    if ! brew services list 2>/dev/null | grep mysql | grep -q started; then
        log_warn "MySQL 未运行，正在启动..."
        brew services start mysql
        sleep 3
    fi
fi

if mysql -u portai -pportai123 -e "SELECT 1" &>/dev/null 2>&1; then
    MYSQL_OK=true
    TABLE_COUNT=$(mysql -u portai -pportai123 portai_nexus -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='portai_nexus'" 2>/dev/null || echo "0")
    log_ok "MySQL 就绪 (portai_nexus: ${TABLE_COUNT} 张表)"
elif mysql -u root -e "SELECT 1" &>/dev/null 2>&1; then
    MYSQL_OK=true
    log_ok "MySQL 就绪 (root 用户)"
    log_warn "portai 用户可能未创建，请运行: bash scripts/migrate-to-local.sh"
else
    log_err "MySQL 连接失败"
    log_warn "请先运行迁移脚本: bash scripts/migrate-to-local.sh"
    log_warn "或手动启动: brew services start mysql"
fi

# ============================================================
# 2. 检查并启动 Redis
# ============================================================
log_step "检查 Redis..."
REDIS_OK=false

if command -v brew &>/dev/null; then
    if ! brew services list 2>/dev/null | grep redis | grep -q started; then
        log_warn "Redis 未运行，正在启动..."
        brew services start redis
        sleep 2
    fi
fi

if redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_OK=true
    log_ok "Redis 就绪 (localhost:6379)"
else
    log_warn "Redis 未运行，缓存功能将降级"
fi

# ============================================================
# 3. 配置环境变量
# ============================================================
log_step "配置环境变量..."

# 核心变量（仅设置未定义的）
export DATABASE_URL="${DATABASE_URL:-mysql://portai:portai123@localhost:3306/portai_nexus}"
export SKIP_AUTH="${SKIP_AUTH:-true}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export REDIS_DB="${REDIS_DB:-0}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export NODE_ENV="${NODE_ENV:-development}"
export OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

# 加载 .env.local（如果存在，补充未设置的变量）
if [ -f ".env.local" ]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        if [ -z "${!key}" ] && [ -n "$key" ] && [ -n "$value" ]; then
            export "$key=$value"
        fi
    done < .env.local
    log_ok ".env.local 已加载"
fi

# ============================================================
# 4. 环境摘要
# ============================================================
echo ""
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo -e "${CYAN}  本地开发环境就绪${NC}"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
if [ "$MYSQL_OK" = true ]; then
    echo -e "  数据库:  ${GREEN}已连接${NC} (localhost:3306/portai_nexus)"
else
    echo -e "  数据库:  ${RED}未连接${NC}"
fi
if [ "$REDIS_OK" = true ]; then
    echo -e "  Redis:   ${GREEN}已连接${NC} (localhost:6379)"
else
    echo -e "  Redis:   ${YELLOW}未连接（降级模式）${NC}"
fi
echo -e "  认证:    ${GREEN}已跳过 (SKIP_AUTH=true)${NC}"
echo -e "  日志:    ${LOG_LEVEL}"
echo -e "  模式:    ${GREEN}本地开发（无 Docker 依赖）${NC}"
echo -e "${CYAN}────────────────────────────────────────────${NC}"
echo ""

# ============================================================
# 5. 启动开发服务器
# ============================================================
log_step "启动开发服务器..."
exec ./node_modules/.bin/tsx watch server/core/index.ts
