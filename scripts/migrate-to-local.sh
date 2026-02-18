#!/bin/bash
# ============================================================
# 西联智能平台 - Docker → 本地部署迁移脚本
# 适用于 macOS (Apple Silicon / Intel)
# 使用方式: bash scripts/migrate-to-local.sh
# ============================================================

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() { echo -e "\n${CYAN}▶ $1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✔ $1${NC}"; }
log_warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
log_err()  { echo -e "  ${RED}✘ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/docker-backup"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  西联智能平台 - Docker → 本地部署迁移${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================
# 阶段 1: 检查前置条件
# ============================================================
log_step "阶段 1/6: 检查前置条件"

# 检查 Homebrew
if ! command -v brew &>/dev/null; then
    log_err "未找到 Homebrew，请先安装: https://brew.sh"
    exit 1
fi
log_ok "Homebrew 已安装"

# 检查 Node.js
if ! command -v node &>/dev/null; then
    log_err "未找到 Node.js"
    exit 1
fi
log_ok "Node.js $(node --version)"

# 检查 pnpm
if ! command -v pnpm &>/dev/null; then
    log_warn "未找到 pnpm，正在安装..."
    npm install -g pnpm
fi
log_ok "pnpm 已就绪"

# ============================================================
# 阶段 2: 安装 MySQL 和 Redis
# ============================================================
log_step "阶段 2/6: 安装本地 MySQL 和 Redis"

# 安装 MySQL
if command -v mysql &>/dev/null; then
    log_ok "MySQL 已安装: $(mysql --version 2>&1 | head -1)"
else
    echo "  正在通过 Homebrew 安装 MySQL 8.0..."
    brew install mysql
    log_ok "MySQL 安装完成"
fi

# 安装 Redis
if command -v redis-server &>/dev/null; then
    log_ok "Redis 已安装: $(redis-server --version 2>&1 | head -1)"
else
    echo "  正在通过 Homebrew 安装 Redis..."
    brew install redis
    log_ok "Redis 安装完成"
fi

# ============================================================
# 阶段 3: 启动本地 MySQL 和 Redis 服务
# ============================================================
log_step "阶段 3/6: 启动本地服务"

# 启动 MySQL
if brew services list | grep mysql | grep -q started; then
    log_ok "MySQL 服务已在运行"
else
    brew services start mysql
    sleep 3
    log_ok "MySQL 服务已启动"
fi

# 启动 Redis
if brew services list | grep redis | grep -q started; then
    log_ok "Redis 服务已在运行"
else
    brew services start redis
    sleep 2
    log_ok "Redis 服务已启动"
fi

# 验证连接
echo "  验证 MySQL 连接..."
MAX_WAIT=15
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if mysql -u root -e "SELECT 1" &>/dev/null 2>&1; then
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done
if [ $WAITED -lt $MAX_WAIT ]; then
    log_ok "MySQL 连接正常"
else
    log_err "MySQL 连接失败，请检查服务状态: brew services info mysql"
    exit 1
fi

echo "  验证 Redis 连接..."
if redis-cli ping 2>/dev/null | grep -q PONG; then
    log_ok "Redis 连接正常"
else
    log_err "Redis 连接失败，请检查服务状态: brew services info redis"
    exit 1
fi

# ============================================================
# 阶段 4: 从 Docker 导出数据库
# ============================================================
log_step "阶段 4/6: 从 Docker 导出数据库"

mkdir -p "$BACKUP_DIR"

# 检查 Docker MySQL 容器
DOCKER_MYSQL=""
for name in portai-mysql xilian-mysql mysql; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        DOCKER_MYSQL="$name"
        break
    fi
done

if [ -n "$DOCKER_MYSQL" ]; then
    echo "  从 Docker 容器 $DOCKER_MYSQL 导出数据..."
    
    # 导出完整数据库（结构 + 数据）
    docker exec "$DOCKER_MYSQL" mysqldump \
        -u root -proot123 \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        --set-gtid-purged=OFF \
        portai_nexus > "$BACKUP_DIR/portai_nexus_full.sql" 2>/dev/null
    
    DUMP_SIZE=$(wc -c < "$BACKUP_DIR/portai_nexus_full.sql" | tr -d ' ')
    if [ "$DUMP_SIZE" -gt 100 ]; then
        log_ok "数据库导出成功: portai_nexus_full.sql ($(du -h "$BACKUP_DIR/portai_nexus_full.sql" | cut -f1))"
    else
        log_warn "导出文件过小，可能数据库为空。将使用初始化 SQL 代替"
        rm -f "$BACKUP_DIR/portai_nexus_full.sql"
    fi
else
    log_warn "Docker MySQL 容器未运行，将使用项目初始化 SQL 创建数据库"
fi

# ============================================================
# 阶段 5: 创建本地数据库并导入数据
# ============================================================
log_step "阶段 5/6: 创建本地数据库并导入数据"

# 创建数据库和用户
echo "  创建数据库 portai_nexus 和用户 portai..."
mysql -u root <<'EOSQL'
-- 创建数据库
CREATE DATABASE IF NOT EXISTS portai_nexus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 创建用户（如果不存在）
CREATE USER IF NOT EXISTS 'portai'@'localhost' IDENTIFIED BY 'portai123';
CREATE USER IF NOT EXISTS 'portai'@'127.0.0.1' IDENTIFIED BY 'portai123';

-- 授权
GRANT ALL PRIVILEGES ON portai_nexus.* TO 'portai'@'localhost';
GRANT ALL PRIVILEGES ON portai_nexus.* TO 'portai'@'127.0.0.1';
FLUSH PRIVILEGES;
EOSQL
log_ok "数据库和用户创建完成"

# 导入数据
if [ -f "$BACKUP_DIR/portai_nexus_full.sql" ]; then
    echo "  导入 Docker 导出的完整数据..."
    mysql -u portai -pportai123 portai_nexus < "$BACKUP_DIR/portai_nexus_full.sql" 2>/dev/null
    log_ok "Docker 数据导入完成"
else
    echo "  使用项目初始化 SQL 创建表结构..."
    for sql_file in "$PROJECT_DIR/docker/mysql/init/"*.sql; do
        if [ -f "$sql_file" ]; then
            echo "    导入: $(basename "$sql_file")"
            mysql -u portai -pportai123 portai_nexus < "$sql_file" 2>/dev/null
        fi
    done
    log_ok "初始化 SQL 导入完成"
fi

# 验证表数量
TABLE_COUNT=$(mysql -u portai -pportai123 portai_nexus -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='portai_nexus'" 2>/dev/null)
log_ok "数据库共 ${TABLE_COUNT} 张表"

# ============================================================
# 阶段 6: 配置本地环境变量
# ============================================================
log_step "阶段 6/6: 配置本地环境变量"

ENV_LOCAL="$PROJECT_DIR/.env.local"

if [ -f "$ENV_LOCAL" ]; then
    cp "$ENV_LOCAL" "$ENV_LOCAL.bak.$(date +%Y%m%d%H%M%S)"
    log_warn "已备份原 .env.local"
fi

cat > "$ENV_LOCAL" <<'EOF'
# ============================================================
# 西联智能平台 - 本地开发环境配置
# 由 migrate-to-local.sh 自动生成
# ============================================================

# 运行环境
NODE_ENV=development

# 应用端口
PORT=3000

# ============================================================
# 数据库配置（本地 MySQL）
# ============================================================
DATABASE_URL=mysql://portai:portai123@localhost:3306/portai_nexus

# ============================================================
# Redis 配置（本地 Redis）
# ============================================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# ============================================================
# 认证配置（本地开发跳过认证）
# ============================================================
SKIP_AUTH=true
OAUTH_SERVER_URL=http://localhost:3000
VITE_APP_ID=local-dev
VITE_OAUTH_PORTAL_URL=http://localhost:3000

# ============================================================
# Kafka 配置（可选，本地不启动 Kafka 时注释掉）
# ============================================================
# KAFKA_BROKERS=localhost:9092
# KAFKA_CLIENT_ID=xilian-platform

# ============================================================
# Ollama 配置（如果本地有 Ollama）
# ============================================================
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:70b

# ============================================================
# Qdrant 向量数据库（可选）
# ============================================================
# QDRANT_HOST=http://localhost:6333

# ============================================================
# 日志配置
# ============================================================
LOG_LEVEL=info
DEBUG=false

# ============================================================
# Analytics（可选）
# ============================================================
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
EOF

log_ok ".env.local 已生成"

# ============================================================
# 完成
# ============================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ 迁移完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}本地服务状态:${NC}"
echo -e "    MySQL:  ${GREEN}运行中${NC} (localhost:3306)"
echo -e "    Redis:  ${GREEN}运行中${NC} (localhost:6379)"
echo -e "    数据库: ${GREEN}portai_nexus (${TABLE_COUNT} 张表)${NC}"
echo -e "    用户:   ${GREEN}portai / portai123${NC}"
echo ""
echo -e "  ${CYAN}启动开发服务器:${NC}"
echo -e "    ${YELLOW}pnpm dev:local${NC}    ← 使用 .env.local 启动（推荐）"
echo -e "    ${YELLOW}pnpm dev${NC}          ← 使用 dev-bootstrap.sh 启动（会尝试启动 Docker）"
echo ""
echo -e "  ${CYAN}停止 Docker 容器（可选，释放资源）:${NC}"
echo -e "    ${YELLOW}docker compose down${NC}"
echo ""
echo -e "  ${CYAN}管理本地服务:${NC}"
echo -e "    ${YELLOW}brew services start mysql${NC}   / ${YELLOW}brew services stop mysql${NC}"
echo -e "    ${YELLOW}brew services start redis${NC}   / ${YELLOW}brew services stop redis${NC}"
echo -e "    ${YELLOW}brew services list${NC}           ← 查看所有服务状态"
echo ""
echo -e "  ${CYAN}数据库备份位置:${NC}"
echo -e "    $BACKUP_DIR/"
echo ""
