#!/bin/bash
# PortAI Nexus - Backup Script

set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/$DATE"

echo "=============================================="
echo "  PortAI Nexus - Backup"
echo "=============================================="
echo ""
echo "📁 Backup directory: $BACKUP_DIR"
echo ""

mkdir -p "$BACKUP_DIR"

# Backup MySQL
echo "💾 Backing up MySQL database..."
docker compose exec -T mysql mysqldump -u root -p"${MYSQL_ROOT_PASSWORD:-root123}" portai_nexus > "$BACKUP_DIR/mysql.sql"
echo "   ✅ MySQL backup completed"

# Backup Redis
echo "💾 Backing up Redis..."
docker compose exec -T redis redis-cli BGSAVE
sleep 2
docker cp portai-redis:/data/dump.rdb "$BACKUP_DIR/redis.rdb" 2>/dev/null || echo "   ⚠️ Redis backup skipped (no data)"
echo "   ✅ Redis backup completed"

# Backup Qdrant
echo "💾 Backing up Qdrant..."
docker cp portai-qdrant:/qdrant/storage "$BACKUP_DIR/qdrant" 2>/dev/null || echo "   ⚠️ Qdrant backup skipped (no data)"
echo "   ✅ Qdrant backup completed"

# Backup ClickHouse
echo "💾 Backing up ClickHouse..."
docker compose exec -T clickhouse clickhouse-client --query "BACKUP DATABASE default TO Disk('backups', 'backup_$DATE')" 2>/dev/null || echo "   ⚠️ ClickHouse backup skipped"
echo "   ✅ ClickHouse backup completed"

# Create archive
echo ""
echo "📦 Creating backup archive..."
tar -czvf "./backups/portai-nexus-backup-$DATE.tar.gz" -C "./backups" "$DATE"
rm -rf "$BACKUP_DIR"

echo ""
echo "=============================================="
echo "  Backup completed!"
echo "=============================================="
echo ""
echo "  📦 Archive: ./backups/portai-nexus-backup-$DATE.tar.gz"
echo ""
