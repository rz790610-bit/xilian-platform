# 西联智能平台 — 开机启动开发指南

> 本文档适用于 macOS (Apple Silicon) 本地开发环境，采用 **MySQL/Redis 本地 + Kafka/ClickHouse/Qdrant/MinIO Docker** 混合模式。

---

## 一、环境架构

| 服务 | 运行方式 | 端口 | 管理方式 |
|------|---------|------|---------|
| MySQL 9.x | 本地 Homebrew | 3306 | `brew services` |
| Redis 8.x | 本地 Homebrew | 6379 | `brew services` |
| Kafka | Docker 容器 | 9092 | `docker compose` |
| ClickHouse | Docker 容器 | 8123 | `docker compose` |
| Qdrant | Docker 容器 | 6333 | `docker compose` |
| MinIO | Docker 容器 | 9010 | `docker compose` |
| Node.js 开发服务器 | 本地 pnpm | 3000 | `pnpm dev:native` |

---

## 二、每日开机启动步骤

### 步骤 1：打开 Docker Desktop

从启动台或应用程序文件夹打开 **Docker Desktop**，等待菜单栏鲸鱼图标显示为运行状态（不再转圈）。

> MySQL 和 Redis 由 Homebrew 管理，**开机自动启动**，无需手动操作。

### 步骤 2：启动 Docker 容器

打开终端，执行：

```bash
cd ~/Desktop/xilian-platform
docker compose up -d kafka clickhouse qdrant minio
```

预期输出：
```
✔ Container xilian-kafka      Started
✔ Container xilian-clickhouse  Started
✔ Container xilian-qdrant      Started
✔ Container xilian-minio       Started
```

### 步骤 3：启动开发服务器

```bash
pnpm dev:native
```

预期输出：
```
────────────────────────────────────────────
  西联智能平台 - 本地开发模式
────────────────────────────────────────────
  ✔ MySQL 就绪 (portai_nexus: 109 张表)
  ✔ Redis 就绪 (localhost:6379)
────────────────────────────────────────────
  本地开发环境就绪
────────────────────────────────────────────
```

### 步骤 4：打开浏览器

访问 **http://localhost:3000**

### 步骤 5（可选）：一键启动核心环境

在平台页面中进入 **系统设置 → 基础设施**，点击 **「一键启动核心环境」**，确认 6/6 服务全部就绪。

---

## 三、一键快捷脚本（可选）

如果觉得每次手动输入命令麻烦，可以创建一个快捷脚本：

```bash
# 创建脚本
cat > ~/Desktop/xilian-platform/scripts/start-dev.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 西联智能平台 — 启动开发环境"
echo "=================================="

# 1. 检查 Docker Desktop
if ! docker info &>/dev/null; then
  echo "⚠️  Docker Desktop 未运行，请先打开 Docker Desktop"
  echo "   等待 Docker 就绪后重新运行此脚本"
  exit 1
fi
echo "✔ Docker Desktop 已就绪"

# 2. 启动 Docker 容器（Kafka/ClickHouse/Qdrant/MinIO）
echo ""
echo "▶ 启动 Docker 容器..."
cd ~/Desktop/xilian-platform
docker compose up -d kafka clickhouse qdrant minio 2>&1 | grep -E "Started|Running|Created|Error"
echo "✔ Docker 容器已启动"

# 3. 检查本地 MySQL 和 Redis
echo ""
echo "▶ 检查本地服务..."
if brew services info mysql 2>/dev/null | grep -q "Running: ✔"; then
  echo "✔ MySQL 已运行"
else
  echo "▶ 启动 MySQL..."
  brew services start mysql
fi

if brew services info redis 2>/dev/null | grep -q "Running: ✔"; then
  echo "✔ Redis 已运行"
else
  echo "▶ 启动 Redis..."
  brew services start redis
fi

# 4. 启动开发服务器
echo ""
echo "=================================="
echo "✔ 环境就绪，启动开发服务器..."
echo "  浏览器访问: http://localhost:3000"
echo "=================================="
echo ""
pnpm dev:native
EOF

chmod +x ~/Desktop/xilian-platform/scripts/start-dev.sh
```

以后每次开机只需一条命令：

```bash
~/Desktop/xilian-platform/scripts/start-dev.sh
```

或者添加 alias 到 `~/.zshrc`：

```bash
echo 'alias xilian="~/Desktop/xilian-platform/scripts/start-dev.sh"' >> ~/.zshrc
source ~/.zshrc
```

之后直接输入 `xilian` 即可启动整个开发环境。

---

## 四、收工停止步骤

### 方式 A：只停开发服务器

在运行 `pnpm dev:native` 的终端按 `Ctrl + C`。

MySQL、Redis、Docker 容器继续运行（下次启动更快）。

### 方式 B：全部停止（释放资源）

```bash
# 停止 Docker 容器
cd ~/Desktop/xilian-platform
docker compose down

# 停止本地服务（可选，通常不需要）
brew services stop mysql
brew services stop redis
```

---

## 五、常见问题排查

### Q1: `pnpm dev:native` 报 MySQL 连接失败

```bash
# 检查 MySQL 状态
brew services info mysql

# 如果未运行，手动启动
brew services start mysql

# 验证连接
mysql -u portai -pportai123 portai_nexus -e "SELECT 1"
```

### Q2: Docker 容器启动失败

```bash
# 查看容器状态
docker ps -a --format "{{.Names}}\t{{.Status}}"

# 查看失败容器日志
docker logs xilian-kafka --tail 50

# 重启所有容器
docker compose down && docker compose up -d kafka clickhouse qdrant minio
```

### Q3: 端口被占用

```bash
# 查看占用端口的进程
lsof -i :3306  # MySQL
lsof -i :6379  # Redis
lsof -i :3000  # 开发服务器
lsof -i :9092  # Kafka

# 杀掉占用进程
kill -9 <PID>
```

### Q4: 数据库表结构不一致（迁移问题）

```bash
cd ~/Desktop/xilian-platform
pnpm drizzle-kit push
```

### Q5: 需要重置数据库

```bash
mysql -u root -e "DROP DATABASE portai_nexus; CREATE DATABASE portai_nexus;"
mysql -u portai -pportai123 portai_nexus < docker/mysql/init/01-schema.sql
mysql -u portai -pportai123 portai_nexus < docker/mysql/init/02-seed-data.sql
node scripts/seed-code-rules.mjs
mysql -u portai -pportai123 portai_nexus < scripts/seed-code-rules.sql
```

---

## 六、账号信息速查

| 项目 | 用户名 | 密码 |
|------|--------|------|
| MySQL root | root | （空） |
| MySQL 应用 | portai | portai123 |
| 数据库名 | portai_nexus | — |
| Redis | — | 无密码 |
| MinIO | portai | portai123456 |
| ClickHouse | portai | portai123 |
| Neo4j | neo4j | portai123 |

---

## 七、Git 同步工作流

```bash
# 拉取最新代码
cd ~/Desktop/xilian-platform
git pull origin main

# 推送本地改动
git add -A && git commit -m "描述" && git push origin main
```

与 Manus AI 协作时：
- Manus 开发完成后会通知您 `git pull`
- 您本地改动 push 后告知 Manus 即可
