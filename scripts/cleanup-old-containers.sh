#!/bin/bash
# ============================================================
# 清理旧的 xilian-* 容器，统一迁移到 portai-* 命名
# 用法：bash scripts/cleanup-old-containers.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  PortAI Nexus - 容器命名统一清理工具${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker 未安装，退出${NC}"
    exit 1
fi

# ============================================================
# Step 1: 停止所有 xilian-* 容器
# ============================================================
echo -e "${CYAN}[Step 1] 停止所有 xilian-* 容器...${NC}"
XILIAN_CONTAINERS=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep "^xilian-" || true)
if [ -n "$XILIAN_CONTAINERS" ]; then
    for c in $XILIAN_CONTAINERS; do
        echo -e "  停止并删除: ${YELLOW}$c${NC}"
        docker stop "$c" 2>/dev/null || true
        docker rm -f "$c" 2>/dev/null || true
    done
    echo -e "${GREEN}  ✅ 已清理 $(echo "$XILIAN_CONTAINERS" | wc -l | xargs) 个 xilian-* 容器${NC}"
else
    echo -e "${GREEN}  ✅ 没有 xilian-* 容器需要清理${NC}"
fi

# ============================================================
# Step 2: 清理孤儿容器（随机名称的旧容器）
# ============================================================
echo ""
echo -e "${CYAN}[Step 2] 检查孤儿容器...${NC}"
# 查找非 portai-* 且非系统容器的孤儿
ORPHANS=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -v "^portai-" | grep -v "^xilian-" || true)
if [ -n "$ORPHANS" ]; then
    echo -e "  发现以下孤儿容器:"
    for c in $ORPHANS; do
        IMAGE=$(docker inspect --format '{{.Config.Image}}' "$c" 2>/dev/null || echo "unknown")
        echo -e "    ${YELLOW}$c${NC} (镜像: $IMAGE)"
    done
    echo ""
    read -p "  是否删除这些孤儿容器？[y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for c in $ORPHANS; do
            docker stop "$c" 2>/dev/null || true
            docker rm -f "$c" 2>/dev/null || true
        done
        echo -e "${GREEN}  ✅ 孤儿容器已清理${NC}"
    else
        echo -e "${YELLOW}  ⏭️ 跳过孤儿容器清理${NC}"
    fi
else
    echo -e "${GREEN}  ✅ 没有孤儿容器${NC}"
fi

# ============================================================
# Step 3: 停止所有 portai-* 容器（准备重建）
# ============================================================
echo ""
echo -e "${CYAN}[Step 3] 停止所有 portai-* 容器（准备重建）...${NC}"
PORTAI_CONTAINERS=$(docker ps --format '{{.Names}}' 2>/dev/null | grep "^portai-" || true)
if [ -n "$PORTAI_CONTAINERS" ]; then
    for c in $PORTAI_CONTAINERS; do
        echo -e "  停止: ${YELLOW}$c${NC}"
        docker stop "$c" 2>/dev/null || true
    done
fi

# ============================================================
# Step 4: 删除旧的 portai-* 容器（将由 docker-compose 重建）
# ============================================================
echo ""
echo -e "${CYAN}[Step 4] 删除旧 portai-* 容器（将由 docker-compose 重建）...${NC}"
PORTAI_ALL=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep "^portai-" || true)
if [ -n "$PORTAI_ALL" ]; then
    for c in $PORTAI_ALL; do
        echo -e "  删除: ${YELLOW}$c${NC}"
        docker rm -f "$c" 2>/dev/null || true
    done
fi

# ============================================================
# Step 5: 使用 docker-compose 重建所有容器
# ============================================================
echo ""
echo -e "${CYAN}[Step 5] 使用 docker-compose 重建核心容器...${NC}"
if [ -f "docker-compose.yml" ]; then
    docker compose up -d mysql redis clickhouse minio qdrant kafka neo4j 2>/dev/null || \
    docker-compose up -d mysql redis clickhouse minio qdrant kafka neo4j 2>/dev/null || {
        echo -e "${RED}  ❌ docker-compose 启动失败${NC}"
        exit 1
    }
    echo -e "${GREEN}  ✅ 核心容器已重建${NC}"
else
    echo -e "${RED}  ❌ 未找到 docker-compose.yml${NC}"
    exit 1
fi

# ============================================================
# Step 6: 验证
# ============================================================
echo ""
echo -e "${CYAN}[Step 6] 验证容器状态...${NC}"
sleep 5
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "portai-" || echo "无 portai-* 容器运行"
echo ""

# 检查是否还有 xilian-* 残留
REMAINING=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep "^xilian-" || true)
if [ -n "$REMAINING" ]; then
    echo -e "${YELLOW}⚠️  仍有 xilian-* 容器残留:${NC}"
    echo "$REMAINING"
else
    echo -e "${GREEN}✅ 清理完成！所有容器已统一为 portai-* 命名${NC}"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  清理完成${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
