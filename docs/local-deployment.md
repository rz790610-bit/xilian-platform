# 西联智能平台 - 本地部署指南

本文档介绍如何在本地 Mac 或 Linux 环境中部署和运行西联智能平台的完整开发环境，包括 Kafka 消息队列、Redis 缓存和应用服务。

## 系统要求

在开始之前，请确保您的系统满足以下要求：

| 组件 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Docker Desktop | 4.0+ | 最新版 |
| Node.js | 18.0+ | 22.x |
| pnpm | 8.0+ | 9.x |
| 内存 | 8GB | 16GB+ |
| 磁盘空间 | 10GB | 20GB+ |

## 快速开始

### 一键启动

最简单的方式是使用统一启动脚本，它会自动完成所有配置：

```bash
# 进入项目目录
cd xilian-platform

# 一键启动所有服务
./scripts/start-local.sh start
```

该脚本会自动完成以下操作：

1. 检查 Docker 和 Node.js 环境
2. 启动 Zookeeper、Kafka、Redis 服务
3. 创建必要的 Kafka 主题
4. 生成本地环境变量配置
5. 安装项目依赖
6. 启动开发服务器

### 分步启动

如果您需要更细粒度的控制，可以分步启动各个服务：

```bash
# 仅启动基础设施（Kafka + Redis）
./scripts/start-local.sh infra

# 在另一个终端启动应用
./scripts/start-local.sh app
```

## 服务地址

启动成功后，您可以通过以下地址访问各个服务：

| 服务 | 地址 | 说明 |
|------|------|------|
| 应用主页 | http://localhost:3000 | 西联智能平台 Web 界面 |
| Kafka Broker | localhost:9092 | Kafka 消息队列 |
| Kafka UI | http://localhost:8080 | Kafka 可视化管理界面 |
| Redis | localhost:6379 | Redis 缓存服务 |
| Redis Commander | http://localhost:8082 | Redis 可视化管理界面 |

## 环境变量配置

启动脚本会自动生成 `.env.local` 文件，包含以下关键配置：

```bash
# Kafka 配置
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=xilian-platform

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# 应用配置
NODE_ENV=development
PORT=3000
```

如需自定义配置，可以复制模板文件并修改：

```bash
cp .env.local.example .env.local
# 编辑 .env.local 文件
```

## 常用命令

### 服务管理

```bash
# 查看服务状态
./scripts/start-local.sh status

# 停止所有服务
./scripts/start-local.sh stop

# 重启服务
./scripts/start-local.sh restart

# 查看 Kafka 日志
./scripts/start-local.sh logs

# 查看 Redis 日志
./scripts/start-local.sh logs-redis

# 清理所有数据（谨慎使用）
./scripts/start-local.sh clean
```

### Kafka 操作

```bash
# 列出所有主题
docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# 查看主题详情
docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic xilian.sensor.readings

# 消费消息（测试用）
docker exec xilian-kafka kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic xilian.sensor.readings --from-beginning

# 生产消息（测试用）
docker exec -it xilian-kafka kafka-console-producer.sh --bootstrap-server localhost:9092 --topic xilian.sensor.readings
```

### Redis 操作

```bash
# 连接 Redis CLI
docker exec -it xilian-redis redis-cli

# 查看所有键
docker exec xilian-redis redis-cli KEYS '*'

# 查看 Redis 信息
docker exec xilian-redis redis-cli INFO
```

## 验证部署

### 检查服务健康状态

启动完成后，可以通过以下方式验证各服务是否正常运行：

```bash
# 检查容器状态
docker ps --filter "name=xilian-"

# 检查 Redis 连接
docker exec xilian-redis redis-cli ping
# 预期输出: PONG

# 检查 Kafka 连接
docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
# 预期输出: 主题列表
```

### 访问监控页面

1. 打开浏览器访问 http://localhost:3000
2. 在侧边栏导航到 **系统设置 → Kafka 监控**
3. 确认页面显示：
   - Kafka 集群状态为"已连接"或"内存模式"
   - Redis 状态为"已连接"或"内存模式"
   - 主题列表正常显示

## 故障排除

### Docker 相关问题

**问题：Docker 服务未运行**

```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

**问题：端口被占用**

```bash
# 查看端口占用
lsof -i :9092
lsof -i :6379

# 停止占用端口的进程
kill -9 <PID>
```

### Kafka 相关问题

**问题：Kafka 启动超时**

Kafka 首次启动可能需要较长时间，请耐心等待。如果持续超时：

```bash
# 查看 Kafka 日志
docker logs xilian-kafka

# 重启 Kafka 服务
./scripts/start-local.sh restart
```

**问题：主题创建失败**

```bash
# 手动创建主题
docker exec xilian-kafka kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --create \
    --topic xilian.sensor.readings \
    --partitions 3 \
    --replication-factor 1
```

### Redis 相关问题

**问题：Redis 连接失败**

```bash
# 检查 Redis 容器状态
docker logs xilian-redis

# 重启 Redis
docker restart xilian-redis
```

### 应用相关问题

**问题：应用无法连接 Kafka/Redis**

确保环境变量正确设置：

```bash
# 检查环境变量
cat .env.local

# 确保包含以下配置
KAFKA_BROKERS=localhost:9092
REDIS_HOST=localhost
```

## 开发工作流

### 推荐的开发流程

1. **启动基础设施**：`./scripts/start-local.sh infra`
2. **在 IDE 中开发**：修改代码，热重载自动生效
3. **查看日志**：通过 Kafka UI 和 Redis Commander 监控数据流
4. **运行测试**：`pnpm test`
5. **提交代码**：确保所有测试通过

### 数据持久化

本地开发环境的数据存储在 Docker volumes 中：

- `xilian-zookeeper-data`: Zookeeper 数据
- `xilian-kafka-data`: Kafka 消息数据
- `xilian-redis-data`: Redis 缓存数据

如需清理数据重新开始：

```bash
./scripts/start-local.sh clean
```

## 与生产环境的差异

| 特性 | 本地环境 | 生产环境 |
|------|----------|----------|
| Kafka 副本数 | 1 | 3+ |
| Redis 模式 | 单节点 | 集群/哨兵 |
| 数据持久化 | Docker volumes | 云存储 |
| 监控 | Kafka UI | Prometheus + Grafana |
| 日志 | 控制台 | 集中式日志系统 |

## 下一步

- 阅读 [Kafka 部署文档](./kafka-deployment.md) 了解生产环境部署
- 访问 [Kafka 监控页面](http://localhost:3000/settings/kafka) 查看实时状态
- 使用 [Kafka UI](http://localhost:8080) 管理主题和消息
