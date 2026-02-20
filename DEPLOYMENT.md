# PortAI Nexus 部署指南

## 系统要求

| 项目 | 最低要求 | 推荐配置 |
| :--- | :--- | :--- |
| **操作系统** | macOS 12+ / Ubuntu 20.04+ / Windows 10+ | macOS 14+ / Ubuntu 22.04 |
| **CPU** | 4 核 | 8 核 |
| **内存** | 8 GB | 16 GB |
| **磁盘** | 20 GB 可用空间 | 50 GB SSD |
| **Docker** | 20.10+ | 24.0+ |
| **Node.js** | 18.0+ | 22.0+ |
| **pnpm** | 8.0+ | 10.0+ |

## 快速开始

### 一键启动（推荐）

```bash
# 克隆项目
git clone https://github.com/rz790610-bit/xilian-platform.git
cd xilian-platform

# 一键启动全部服务
./setup.sh
```

脚本会自动完成以下步骤：
1. 检查 Docker、Node.js、pnpm 等依赖
2. 创建 `.env` 配置文件（如不存在）
3. 启动所有 Docker 容器（MySQL、Redis、ClickHouse、MinIO、Qdrant、Kafka、Neo4j）
4. 安装 Node.js 依赖
5. 启动 PortAI Nexus 平台

启动完成后访问 **http://localhost:3000**。

### 分层启动

根据需要选择启动级别：

```bash
# 仅核心服务（MySQL + Redis）— 适合日常开发
./setup.sh core

# 数据库集群（MySQL + Redis + ClickHouse + Qdrant + MinIO）— 适合功能测试
./setup.sh db

# 全部服务 — 适合完整部署
./setup.sh
```

### 手动启动

如果不使用一键脚本，可以手动操作：

```bash
# 1. 复制环境变量配置
cp .env.local.template .env

# 2. 启动 Docker 服务
docker-compose up -d

# 3. 等待服务就绪（约 15-30 秒）
sleep 20

# 4. 安装依赖
pnpm install

# 5. 启动开发服务器
pnpm dev
```

## 服务架构

```
┌─────────────────────────────────────────────────────┐
│                  PortAI Nexus (3000)                 │
│         Express + tRPC + Vite + React                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ MySQL    │  │ Redis    │  │ ClickHouse       │   │
│  │ 3306     │  │ 6379     │  │ 8123 (HTTP)      │   │
│  │ 主数据库  │  │ 缓存     │  │ 9000 (Native)    │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ MinIO    │  │ Qdrant   │  │ Kafka            │   │
│  │ 9010 API │  │ 6333 API │  │ 9092 Broker      │   │
│  │ 9011 Web │  │ 6334 gRPC│  │                  │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Neo4j                                   │   │
│  │ metad:9559  storaged:9779  graphd:9669/19669  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 端口映射

| 服务 | 端口 | 用途 | 管理界面 |
| :--- | :--- | :--- | :--- |
| **PortAI Nexus** | 3000 | 平台主入口 | http://localhost:3000 |
| **MySQL** | 3306 | 关系型数据库 | — |
| **Redis** | 6379 | 缓存 | — |
| **ClickHouse** | 8123 / 9000 | 时序数据库 HTTP / Native | http://localhost:8123/play |
| **MinIO** | 9010 / 9011 | 对象存储 API / 控制台 | http://localhost:9011 |
| **Qdrant** | 6333 / 6334 | 向量数据库 REST / gRPC | http://localhost:6333/dashboard |
| **Kafka** | 9092 | 消息队列 | — |
| **Neo4j** | 9669 / 19669 | 图数据库 / HTTP | — |

## 环境变量

所有配置集中在 `.env` 文件中：

```bash
# ❗ 安全提示：生产环境必须使用强密码，以下为示例占位符
# MySQL
DATABASE_URL=mysql://portai:<YOUR_MYSQL_PASSWORD>@localhost:3306/portai_nexus
MYSQL_ROOT_PASSWORD=<YOUR_ROOT_PASSWORD>   # 至少 16 位随机字符
MYSQL_DATABASE=portai_nexus
MYSQL_USER=portai
MYSQL_PASSWORD=<YOUR_MYSQL_PASSWORD>       # 至少 16 位随机字符

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=portai_timeseries
CLICKHOUSE_USER=portai
CLICKHOUSE_PASSWORD=<YOUR_CH_PASSWORD>     # 至少 16 位随机字符

# MinIO
MINIO_ENDPOINT=http://localhost:9010
MINIO_ACCESS_KEY=portai
MINIO_SECRET_KEY=<YOUR_MINIO_SECRET>       # 至少 16 位随机字符

# Qdrant
QDRANT_URL=http://localhost:6333

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=xilian-platform

# Neo4j
NEO4J_HOST=localhost
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
```

## 常用命令

```bash
# 查看服务状态
./setup.sh status

# 查看所有日志
./setup.sh logs

# 查看特定服务日志
./setup.sh logs mysql
./setup.sh logs clickhouse

# 停止所有服务
./setup.sh stop

# 重置数据（危险）
./setup.sh reset

# 单独重启某个服务
docker-compose restart clickhouse
```

## 数据持久化

所有数据通过 Docker Named Volumes 持久化：

| Volume | 服务 | 说明 |
| :--- | :--- | :--- |
| `portai_mysql_data` | MySQL | 关系型数据 |
| `portai_redis_data` | Redis | 缓存数据 |
| `portai_clickhouse_data` | ClickHouse | 时序数据 |
| `portai_minio_data` | MinIO | 对象文件 |
| `portai_qdrant_data` | Qdrant | 向量索引 |
| `portai_kafka_data` | Kafka | 消息日志 |
| `portai_neo4j_*` | Neo4j | 图数据 |

## 故障排查

### MySQL 启动失败

```bash
# 查看日志
docker-compose logs mysql

# 常见原因：端口 3306 被占用
lsof -i :3306

# 解决：修改 .env 中的端口映射或停止占用进程
```

### ClickHouse 内存不足

```bash
# ClickHouse 默认需要较多内存
# 如果内存不足，可以在 docker-compose.yml 中调整：
# deploy:
#   resources:
#     limits:
#       memory: 1G
```

### MinIO 无法访问

```bash
# 确认 MinIO 容器运行中
docker-compose ps minio

# 检查健康状态
curl http://localhost:9010/minio/health/live
```

### 前端页面空白

```bash
# 确认服务器运行中
curl http://localhost:3000

# 重新安装依赖
pnpm install

# 清除缓存重启
rm -rf node_modules/.vite
pnpm dev
```

## 生产部署

生产环境建议：

1. **使用外部数据库** — 将 MySQL、Redis 等替换为云服务（RDS、ElastiCache）
2. **配置 SSL** — 使用 Nginx 反向代理并配置 HTTPS
3. **设置强密码** — 修改 `.env` 中所有默认密码
4. **启用备份** — 配置 MySQL binlog 和定期快照
5. **监控告警** — 接入 Prometheus + Grafana 监控
