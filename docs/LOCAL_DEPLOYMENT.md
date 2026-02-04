# PortAI Nexus - 本地化部署指南

本文档提供 PortAI Nexus 工业智能诊断平台的完整本地化部署指南。

---

## 目录

1. [系统要求](#系统要求)
2. [快速部署](#快速部署)
3. [详细部署步骤](#详细部署步骤)
4. [服务说明](#服务说明)
5. [常用命令](#常用命令)
6. [故障排除](#故障排除)
7. [生产环境建议](#生产环境建议)

---

## 系统要求

### 硬件要求

| 配置 | 最低要求 | 推荐配置 |
|------|----------|----------|
| CPU | 4 核 | 8 核+ |
| 内存 | 16 GB | 32 GB+ |
| 存储 | 100 GB SSD | 500 GB NVMe SSD |
| GPU | 无（CPU 推理） | NVIDIA RTX 3090+ |

### 软件要求

- **操作系统**: Ubuntu 22.04 LTS / CentOS 8+ / macOS 13+
- **Docker**: 24.0+
- **Docker Compose**: 2.20+
- **Git**: 2.30+

### 端口要求

确保以下端口未被占用：

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | PortAI Nexus | 主应用 |
| 3001 | Grafana | 监控仪表盘 |
| 3306 | MySQL | 数据库 |
| 6333 | Qdrant | 向量数据库 |
| 6379 | Redis | 缓存 |
| 8123 | ClickHouse | 分析数据库 |
| 9090 | Prometheus | 监控 |
| 9092 | Kafka | 消息队列 |
| 9200 | Elasticsearch | 日志 |
| 11434 | Ollama | LLM 引擎 |
| 16686 | Jaeger | 追踪 |

---

## 快速部署

### 一键部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/your-org/portai-nexus.git
cd portai-nexus

# 2. 复制环境配置
cp .env.template .env

# 3. 修改 JWT_SECRET（必须！）
sed -i 's/your-super-secret-jwt-key-change-in-production-min-32-chars/YOUR_ACTUAL_SECRET_KEY_HERE/' .env

# 4. 启动所有服务
docker-compose up -d

# 5. 等待服务启动（约 2-3 分钟）
docker-compose logs -f app
```

### 访问服务

启动完成后，访问以下地址：

- **PortAI Nexus**: http://localhost:3000
- **Grafana 监控**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Jaeger 追踪**: http://localhost:16686

---

## 详细部署步骤

### 步骤 1: 安装 Docker

#### Ubuntu/Debian

```bash
# 更新包索引
sudo apt-get update

# 安装依赖
sudo apt-get install -y ca-certificates curl gnupg

# 添加 Docker GPG 密钥
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 添加 Docker 仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker
```

#### macOS

```bash
# 使用 Homebrew 安装
brew install --cask docker

# 启动 Docker Desktop
open /Applications/Docker.app
```

### 步骤 2: 获取项目代码

```bash
# 克隆项目
git clone https://github.com/your-org/portai-nexus.git
cd portai-nexus

# 或者解压部署包
unzip portai-nexus-deploy.zip
cd portai-nexus
```

### 步骤 3: 配置环境变量

```bash
# 复制环境配置模板
cp .env.template .env

# 编辑配置文件
nano .env
```

**必须修改的配置：**

```env
# 生成安全的 JWT 密钥
JWT_SECRET=$(openssl rand -base64 32)

# 修改数据库密码
MYSQL_ROOT_PASSWORD=your-secure-root-password
MYSQL_PASSWORD=your-secure-app-password

# 修改 Grafana 密码
GRAFANA_PASSWORD=your-secure-grafana-password
```

### 步骤 4: 启动服务

```bash
# 启动所有服务（后台运行）
docker-compose up -d

# 查看启动日志
docker-compose logs -f

# 仅查看应用日志
docker-compose logs -f app
```

### 步骤 5: 初始化数据库

```bash
# 等待 MySQL 完全启动
docker-compose exec mysql mysqladmin ping -h localhost -u root -p

# 运行数据库迁移
docker-compose exec app pnpm db:push
```

### 步骤 6: 拉取 LLM 模型

```bash
# 进入 Ollama 容器
docker-compose exec ollama ollama pull llama3.1:8b

# 或拉取更大的模型（需要更多显存）
docker-compose exec ollama ollama pull llama3.1:70b
```

---

## 服务说明

### 核心服务

| 服务 | 容器名 | 说明 |
|------|--------|------|
| app | portai-nexus | 主应用服务 |
| mysql | portai-mysql | 关系型数据库 |
| redis | portai-redis | 缓存服务 |

### 数据服务

| 服务 | 容器名 | 说明 |
|------|--------|------|
| qdrant | portai-qdrant | 向量数据库，用于知识库 |
| clickhouse | portai-clickhouse | 分析数据库，用于时序数据 |
| kafka | portai-kafka | 消息队列，用于事件流 |

### AI 服务

| 服务 | 容器名 | 说明 |
|------|--------|------|
| ollama | portai-ollama | LLM 推理引擎 |

### 可观测性服务

| 服务 | 容器名 | 说明 |
|------|--------|------|
| prometheus | portai-prometheus | 指标收集 |
| grafana | portai-grafana | 可视化仪表盘 |
| elasticsearch | portai-elasticsearch | 日志存储 |
| jaeger | portai-jaeger | 分布式追踪 |

---

## 常用命令

### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启单个服务
docker-compose restart app

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f [service_name]
```

### 数据库操作

```bash
# 进入 MySQL 命令行
docker-compose exec mysql mysql -u portai -p portai_nexus

# 备份数据库
docker-compose exec mysql mysqldump -u root -p portai_nexus > backup.sql

# 恢复数据库
docker-compose exec -T mysql mysql -u root -p portai_nexus < backup.sql
```

### 数据卷管理

```bash
# 查看所有数据卷
docker volume ls | grep portai

# 备份数据卷
docker run --rm -v portai-mysql-data:/data -v $(pwd):/backup alpine tar cvf /backup/mysql-backup.tar /data

# 清理所有数据（危险！）
docker-compose down -v
```

### 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建镜像
docker-compose build --no-cache app

# 重启服务
docker-compose up -d
```

---

## 故障排除

### 服务无法启动

```bash
# 检查端口占用
sudo lsof -i :3000
sudo lsof -i :3306

# 查看详细日志
docker-compose logs --tail=100 app

# 检查容器状态
docker-compose ps -a
```

### 数据库连接失败

```bash
# 检查 MySQL 是否健康
docker-compose exec mysql mysqladmin ping -h localhost -u root -p

# 检查网络连接
docker-compose exec app ping mysql

# 查看 MySQL 日志
docker-compose logs mysql
```

### 内存不足

```bash
# 检查内存使用
docker stats

# 限制服务内存
# 在 docker-compose.yml 中添加：
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

### Ollama 模型加载失败

```bash
# 检查 Ollama 状态
docker-compose exec ollama ollama list

# 重新拉取模型
docker-compose exec ollama ollama pull llama3.1:8b

# 检查 GPU 支持
docker-compose exec ollama nvidia-smi
```

---

## 生产环境建议

### 安全加固

1. **修改所有默认密码**
2. **启用 HTTPS**（使用 Nginx 反向代理 + Let's Encrypt）
3. **配置防火墙**，仅开放必要端口
4. **定期更新**镜像和依赖
5. **启用审计日志**

### 高可用部署

1. **数据库主从复制**
2. **Redis 哨兵模式**
3. **Kafka 集群**
4. **负载均衡**（Nginx/HAProxy）

### 备份策略

```bash
# 创建备份脚本
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/$DATE

mkdir -p $BACKUP_DIR

# 备份 MySQL
docker-compose exec -T mysql mysqldump -u root -p$MYSQL_ROOT_PASSWORD portai_nexus > $BACKUP_DIR/mysql.sql

# 备份 Redis
docker-compose exec -T redis redis-cli BGSAVE
docker cp portai-redis:/data/dump.rdb $BACKUP_DIR/redis.rdb

# 备份 Qdrant
docker cp portai-qdrant:/qdrant/storage $BACKUP_DIR/qdrant

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh

# 添加定时任务（每天凌晨 2 点备份）
echo "0 2 * * * /path/to/backup.sh" | crontab -
```

### 监控告警

1. 配置 Grafana 告警规则
2. 集成 Slack/钉钉/企业微信通知
3. 设置关键指标阈值

---

## 技术支持

如遇问题，请通过以下方式获取支持：

- **文档**: 查看 `docs/` 目录下的详细文档
- **Issue**: 在 GitHub 仓库提交 Issue
- **邮箱**: support@portai.io

---

**PortAI Nexus** - Industrial AI Platform  
版本: 1.0.0  
更新日期: 2026-02-04
