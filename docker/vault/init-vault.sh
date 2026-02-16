#!/bin/bash
# ============================================================
# HashiCorp Vault 初始化脚本
# 
# 用途：在 Vault 开发模式启动后配置引擎和策略
# 执行：docker compose exec vault sh /vault/config/init-vault.sh
# ============================================================

set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-xilian-dev-root-token}"

export VAULT_ADDR VAULT_TOKEN

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

wait_for_vault() {
    local max=30
    local i=0
    while [ $i -lt $max ]; do
        if vault status > /dev/null 2>&1; then
            log "Vault is ready"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done
    log "ERROR: Vault not ready"
    return 1
}

# ============================================================
# 1. 启用 KV v2 引擎
# ============================================================
setup_kv_engine() {
    log "Setting up KV v2 secret engine..."
    
    # 检查是否已启用
    if vault secrets list -format=json | grep -q '"secret/"'; then
        log "KV v2 engine already enabled at secret/"
    else
        vault secrets enable -path=secret -version=2 kv
        log "KV v2 engine enabled at secret/"
    fi

    # 写入平台默认密钥
    vault kv put secret/xilian/database \
        host="mysql" \
        port="3306" \
        username="xilian_app" \
        password="${DB_PASSWORD:-xilian_secret}" \
        database="xilian_platform"

    vault kv put secret/xilian/redis \
        host="redis" \
        port="6379" \
        password="${REDIS_PASSWORD:-}"

    vault kv put secret/xilian/jwt \
        secret="${JWT_SECRET:-$(openssl rand -hex 32)}" \
        issuer="xilian-platform" \
        expiry="86400"

    vault kv put secret/xilian/kafka \
        bootstrap_servers="kafka:29092" \
        schema_registry_url="http://schema-registry:8081"

    vault kv put secret/xilian/elasticsearch \
        url="http://elasticsearch:9200" \
        username="elastic" \
        password="${ES_PASSWORD:-changeme}"

    vault kv put secret/xilian/minio \
        endpoint="minio:9000" \
        access_key="${MINIO_ACCESS_KEY:-minioadmin}" \
        secret_key="${MINIO_SECRET_KEY:-minioadmin}"

    log "Default secrets written to KV v2"
}

# ============================================================
# 2. 启用 Transit 引擎（字段级加密）
# ============================================================
setup_transit_engine() {
    log "Setting up Transit encryption engine..."

    if vault secrets list -format=json | grep -q '"transit/"'; then
        log "Transit engine already enabled"
    else
        vault secrets enable transit
        log "Transit engine enabled"
    fi

    # 创建加密密钥
    vault write -f transit/keys/xilian-data \
        type=aes256-gcm96 \
        auto_rotate_period=720h  # 30 天自动轮换

    vault write -f transit/keys/xilian-pii \
        type=aes256-gcm96 \
        auto_rotate_period=168h  # 7 天自动轮换（PII 更频繁）

    vault write -f transit/keys/xilian-audit \
        type=aes256-gcm96 \
        auto_rotate_period=2160h  # 90 天

    log "Transit encryption keys created"
}

# ============================================================
# 3. 启用 Database 引擎（动态凭据）
# ============================================================
setup_database_engine() {
    log "Setting up Database secret engine..."

    if vault secrets list -format=json | grep -q '"database/"'; then
        log "Database engine already enabled"
    else
        vault secrets enable database
        log "Database engine enabled"
    fi

    # 配置 MySQL 连接
    vault write database/config/xilian-mysql \
        plugin_name=mysql-database-plugin \
        connection_url="{{username}}:{{password}}@tcp(mysql:3306)/" \
        allowed_roles="xilian-app,xilian-readonly,xilian-admin" \
        username="root" \
        password="${MYSQL_ROOT_PASSWORD:-root_password}"

    # 应用角色 — 读写权限
    vault write database/roles/xilian-app \
        db_name=xilian-mysql \
        creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON xilian_platform.* TO '{{name}}'@'%';" \
        default_ttl="1h" \
        max_ttl="24h"

    # 只读角色
    vault write database/roles/xilian-readonly \
        db_name=xilian-mysql \
        creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT ON xilian_platform.* TO '{{name}}'@'%';" \
        default_ttl="1h" \
        max_ttl="8h"

    # 管理员角色
    vault write database/roles/xilian-admin \
        db_name=xilian-mysql \
        creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT ALL PRIVILEGES ON xilian_platform.* TO '{{name}}'@'%';" \
        default_ttl="30m" \
        max_ttl="4h"

    log "Database dynamic credentials configured"
}

# ============================================================
# 4. 配置 AppRole 认证
# ============================================================
setup_approle() {
    log "Setting up AppRole authentication..."

    if vault auth list -format=json | grep -q '"approle/"'; then
        log "AppRole already enabled"
    else
        vault auth enable approle
        log "AppRole enabled"
    fi

    # 创建策略
    vault policy write xilian-app - <<'POLICY'
# KV v2 — 读取平台密钥
path "secret/data/xilian/*" {
  capabilities = ["read", "list"]
}

# Transit — 加密/解密
path "transit/encrypt/xilian-data" {
  capabilities = ["update"]
}
path "transit/decrypt/xilian-data" {
  capabilities = ["update"]
}
path "transit/encrypt/xilian-pii" {
  capabilities = ["update"]
}
path "transit/decrypt/xilian-pii" {
  capabilities = ["update"]
}

# Database — 获取动态凭据
path "database/creds/xilian-app" {
  capabilities = ["read"]
}

# Lease 管理
path "sys/leases/renew" {
  capabilities = ["update"]
}

# Token 自我管理
path "auth/token/renew-self" {
  capabilities = ["update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
POLICY

    # 创建 AppRole
    vault write auth/approle/role/xilian-app \
        token_policies="xilian-app" \
        token_ttl=1h \
        token_max_ttl=4h \
        secret_id_ttl=720h \
        secret_id_num_uses=0

    # 获取 Role ID 和 Secret ID（输出供配置使用）
    local role_id
    role_id=$(vault read -field=role_id auth/approle/role/xilian-app/role-id)
    
    local secret_id
    secret_id=$(vault write -field=secret_id -f auth/approle/role/xilian-app/secret-id)

    log "AppRole configured:"
    log "  VAULT_ROLE_ID=${role_id}"
    log "  VAULT_SECRET_ID=${secret_id}"
    log "  Add these to your .env file for production use"
}

# ============================================================
# 5. 配置审计日志
# ============================================================
setup_audit() {
    log "Setting up audit logging..."

    # 文件审计
    if vault audit list -format=json | grep -q '"file/"'; then
        log "File audit already enabled"
    else
        vault audit enable file file_path=/vault/logs/audit.log
        log "File audit enabled at /vault/logs/audit.log"
    fi
}

# ============================================================
# 主流程
# ============================================================

log "=== Vault Initialization ==="
wait_for_vault

setup_kv_engine
setup_transit_engine
setup_database_engine
setup_approle
setup_audit

log "=== Vault initialization completed ==="
