# 西联智能平台（PortAI Nexus）— 本地部署指南

> **版本**: v4.0.0  
> **最后更新**: 2026-02-23  
> **适用场景**: 开发环境本地部署、测试环境搭建、生产环境部署参考

---

## 目录

1. [系统要求](#1-系统要求)
2. [架构概览](#2-架构概览)
3. [快速开始（最小部署）](#3-快速开始最小部署)
4. [完整部署（Docker Compose 一键启动）](#4-完整部署docker-compose-一键启动)
5. [分层启动策略](#5-分层启动策略)
6. [环境变量配置](#6-环境变量配置)
7. [数据库初始化](#7-数据库初始化)
8. [服务端口清单](#8-服务端口清单)
9. [启动验证](#9-启动验证)
10. [常见问题排查](#10-常见问题排查)
11. [生产环境部署要点](#11-生产环境部署要点)

---

## 1. 系统要求

### 1.1 硬件要求

| 部署模式 | CPU | 内存 | 磁盘 | 说明 |
|---------|-----|------|------|------|
| **最小启动** | 2 核 | 4 GB | 10 GB | 仅 MySQL + Redis + 应用 |
| **核心服务** | 4 核 | 8 GB | 30 GB | + ClickHouse + Kafka + Qdrant + Neo4j |
| **全量启动** | 8 核 | 16 GB | 50 GB | + 监控栈 + MinIO |
| **大数据模式** | 8 核+ | 32 GB | 100 GB | + Elasticsearch + Flink + Airflow |

### 1.2 软件要求

| 软件 | 最低版本 | 说明 |
|------|---------|------|
| **Node.js** | 22.x | 推荐使用 LTS 版本 |
| **pnpm** | 10.4+ | 项目锁定 `pnpm@10.4.1`，通过 `corepack enable` 自动安装 |
| **Docker** | 24.0+ | 用于运行基础设施服务 |
| **Docker Compose** | v2.20+ | 推荐使用 `docker compose`（V2 命令） |
| **Git** | 2.30+ | 代码版本管理 |

---

## 2. 架构概览

平台采用**优雅降级**架构设计，HTTP 服务器可以在没有任何外部依赖的情况下启动。14 个后台服务全部标记为 `critical: false`，任何服务不可用时自动降级而不阻塞启动。

```
┌─────────────────────────────────────────────────────┐
│                    应用层 (Node.js)                    │
│  Express + tRPC + Vite (前端) + 14 个后台服务           │
├─────────────────────────────────────────────────────┤
│  第 0 层 (必需)    │  MySQL + Redis                   │
│  第 1 层 (核心)    │  ClickHouse + Kafka + Neo4j      │
│  第 2 层 (增强)    │  Qdrant + MinIO + MQTT           │
│  第 3 层 (可选)    │  Elasticsearch + Flink + Airflow │
│  监控层           │  Prometheus + Grafana + Jaeger    │
└─────────────────────────────────────────────────────┘
```

**服务依赖关系**：

- **MySQL**：核心关系数据库，存储所有业务数据（164 张表）。不可用时数据库相关功能降级。
- **Redis**：缓存层，用于设备状态缓存、会话管理、事件去重。不可用时缓存功能降级。
- **ClickHouse**：时序数据库，存储高频传感器数据。不可用时时序数据写入降级。
- **Kafka**：消息队列，事件总线和数据流处理。不可用时事件驱动功能降级。
- **Neo4j**：图数据库，知识图谱和设备关系拓扑。不可用时图查询功能降级。
- **Qdrant**：向量数据库，相似故障检索和语义搜索。不可用时向量搜索降级。
- **MinIO**：对象存储，波形文件、频谱图、模型文件。不可用时文件上传降级。

---

## 3. 快速开始（最小部署）

这是最快的启动方式，只需要 MySQL 和 Redis，平台即可运行核心功能。

### 3.1 克隆代码

```bash
git clone https://github.com/rz790610-bit/xilian-platform.git
cd xilian-platform
```

### 3.2 安装依赖

```bash
corepack enable
pnpm install
```

### 3.3 启动基础设施（MySQL + Redis）

```bash
# 设置必需的密码环境变量
export MYSQL_ROOT_PASSWORD=your_root_password
export MYSQL_PASSWORD=your_app_password

# 启动 MySQL 和 Redis
docker compose up -d mysql redis
```

等待 MySQL 健康检查通过（约 30 秒）：

```bash
docker compose ps
# 确认 mysql 和 redis 状态为 healthy
```

### 3.4 初始化数据库

**方式一：通过 Drizzle 迁移（推荐）**

```bash
# 设置数据库连接字符串
export DATABASE_URL="mysql://portai:your_app_password@localhost:3306/portai_nexus"

# 生成并执行迁移（创建全部 164 张表）
pnpm db:push
```

**方式二：通过 Docker 自动初始化**

如果使用 `docker compose up -d mysql`，Docker 会自动执行 `docker/mysql/init/` 目录下的 SQL 文件，按文件名顺序创建表和种子数据：

| 文件 | 内容 | 表数量 |
|------|------|--------|
| `01-base-ddl.sql` | 基础表结构 | 121 张 |
| `02-v5-ddl.sql` | V5 进化表 | 24 张 |
| `03-evolution-ddl.sql` | 深度进化表 | 15 张 |
| `04-twin-config-ddl.sql` | 数字孪生配置表 | 4 张 |
| `05-base-seed.sql` | 基础种子数据 | 26 条 |
| `06-v5-seed.sql` | V5 种子数据 | 11 条 |
| `07-evolution-seed.sql` | 进化种子数据 | 3 条 |
| `08-twin-config-seed.sql` | 孪生配置种子 | 2 条 |

> **注意**：Docker 自动初始化只在数据库首次创建时执行。如果数据库已存在，需要手动执行 SQL 或使用 Drizzle 迁移。

### 3.5 创建环境配置

```bash
cp .env.local.template .env.local
```

编辑 `.env.local`，至少配置以下内容：

```env
# 数据库连接
DATABASE_URL=mysql://portai:your_app_password@localhost:3306/portai_nexus

# 本地开发模式
NODE_ENV=development
SKIP_AUTH=true
LOG_LEVEL=info
```

### 3.6 启动平台

```bash
# 方式一：自动引导（推荐，会自动检测 Docker 服务状态）
pnpm dev

# 方式二：直接启动（需要手动确保服务已就绪）
pnpm dev:local

# 方式三：原始模式（最少封装）
pnpm dev:raw
```

### 3.7 验证启动

```bash
# 健康检查
curl http://localhost:3000/api/rest/_health

# 应返回 HTTP 200
```

浏览器访问 `http://localhost:3000` 即可看到前端界面。

---

## 4. 完整部署（Docker Compose 一键启动）

### 4.1 创建环境变量文件

在项目根目录创建 `.env` 文件：

```env
# ===== 必须配置（Docker Compose 启动时校验） =====
MYSQL_ROOT_PASSWORD=your_secure_root_password
MYSQL_PASSWORD=your_secure_app_password
CLICKHOUSE_PASSWORD=your_clickhouse_password

# ===== 可选配置（有默认值） =====
MYSQL_USER=portai
NEO4J_USER=neo4j
NEO4J_PASSWORD=portai123
MINIO_ACCESS_KEY=portai
MINIO_SECRET_KEY=portai123456
LOG_LEVEL=info
```

### 4.2 启动服务

```bash
# 最小启动（MySQL + Redis）
docker compose up -d mysql redis

# 核心服务（+ ClickHouse + Kafka + Qdrant + Neo4j + MinIO）
docker compose up -d mysql redis clickhouse kafka qdrant neo4j minio

# 全部默认服务（含监控栈）
docker compose up -d

# 大数据服务（+ Elasticsearch + Kafka Connect + Flink + Airflow）
docker compose --profile bigdata up -d

# 安全服务（+ HashiCorp Vault）
docker compose --profile security up -d

# 全部服务
docker compose --profile full up -d
```

### 4.3 等待所有服务就绪

```bash
# 查看服务状态
docker compose ps

# 查看特定服务日志
docker compose logs -f mysql
docker compose logs -f kafka
```

### 4.4 启动应用

```bash
# 设置 DATABASE_URL（Docker 内部网络用 localhost）
export DATABASE_URL="mysql://portai:your_secure_app_password@localhost:3306/portai_nexus"

# 执行数据库迁移
pnpm db:push

# 启动开发服务器
pnpm dev
```

---

## 5. 分层启动策略

平台支持按需启动不同层级的服务。以下是各层级的功能影响：

### 5.1 第 0 层：基础必需（MySQL + Redis）

启动命令：`docker compose up -d mysql redis`

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| HTTP 服务器 | ✅ 正常 | Express + tRPC 完整可用 |
| 前端界面 | ✅ 正常 | Vite 开发服务器 / 静态文件 |
| 用户认证 | ✅ 正常 | OAuth + JWT |
| 设备管理 CRUD | ✅ 正常 | MySQL 存储 |
| 算法库 | ✅ 正常 | 内置算法同步 + CRUD |
| Saga 编排器 | ✅ 正常 | 分布式事务管理 |
| 缓存 | ✅ 正常 | Redis 缓存层 |
| 时序数据 | ⚠️ 降级 | ClickHouse 不可用，数据不写入 |
| 事件驱动 | ⚠️ 降级 | Kafka 不可用，内存事件总线替代 |
| 知识图谱 | ⚠️ 降级 | Neo4j 不可用，图查询不可用 |
| 向量搜索 | ⚠️ 降级 | Qdrant 不可用 |
| 文件存储 | ⚠️ 降级 | MinIO 不可用 |

### 5.2 第 1 层：核心增强（+ ClickHouse + Kafka + Neo4j）

启动命令：`docker compose up -d mysql redis clickhouse kafka neo4j`

在第 0 层基础上额外启用：

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 时序数据采集 | ✅ 正常 | ClickHouse 写入和查询 |
| 事件驱动架构 | ✅ 正常 | Kafka 消息队列完整可用 |
| 知识图谱 | ✅ 正常 | Neo4j 图查询和拓扑分析 |
| 数据动脉全链路 | ✅ 正常 | 采集→清洗→存储→分析完整链路 |

### 5.3 第 2 层：完整功能（+ Qdrant + MinIO）

启动命令：`docker compose up -d mysql redis clickhouse kafka neo4j qdrant minio`

在第 1 层基础上额外启用：

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 语义搜索 / RAG | ✅ 正常 | Qdrant 向量检索 |
| 文件存储 | ✅ 正常 | MinIO 对象存储（波形、频谱、模型） |
| 相似故障检索 | ✅ 正常 | 基于向量相似度的故障匹配 |

### 5.4 第 3 层：大数据（需要 `--profile bigdata`）

启动命令：`docker compose --profile bigdata up -d`

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 全文搜索 | ✅ 正常 | Elasticsearch 告警/审计日志检索 |
| CDC 数据同步 | ✅ 正常 | Kafka Connect + Debezium |
| 流处理 | ✅ 正常 | Flink 实时数据处理 |
| 任务编排 | ✅ 正常 | Airflow DAG 调度 |

---

## 6. 环境变量配置

### 6.1 配置文件优先级

配置加载优先级从高到低：

1. **命令行参数**（如 `PORT=3001 pnpm dev`）
2. **`.env.local`**（个人覆盖，不提交 Git）
3. **`.env`**（项目级配置）
4. **`.env.development`**（团队共享开发默认值，已提交 Git）
5. **`server/core/config.ts`** 硬编码默认值

### 6.2 必需环境变量

以下变量在对应场景下**必须**配置：

| 变量 | 必需场景 | 默认值 | 说明 |
|------|---------|--------|------|
| `MYSQL_ROOT_PASSWORD` | Docker Compose | 无 | MySQL root 密码 |
| `MYSQL_PASSWORD` | Docker Compose / 生产 | 无 | MySQL 应用用户密码 |
| `CLICKHOUSE_PASSWORD` | Docker Compose | 无 | ClickHouse 密码 |
| `DATABASE_URL` | Drizzle 迁移 / 应用启动 | 自动拼接 | MySQL 连接字符串 |
| `JWT_SECRET` | **生产环境** | `change-me-in-production` | JWT 签名密钥（≥32 字符） |
| `CORS_ORIGINS` | **生产环境** | `*` | 允许的跨域来源 |

### 6.3 核心服务配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | 应用端口 |
| `LOG_LEVEL` | `info` | 日志级别（trace/debug/info/warn/error） |
| `SKIP_AUTH` | `false` | 跳过认证（仅开发环境） |
| `MYSQL_HOST` | `localhost` | MySQL 主机 |
| `MYSQL_PORT` | `3306` | MySQL 端口 |
| `MYSQL_USER` | `root` | MySQL 用户名 |
| `MYSQL_DATABASE` | `portai_nexus` | MySQL 数据库名 |
| `REDIS_HOST` | `localhost` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | 空 | Redis 密码 |

### 6.4 可选服务配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse 主机 |
| `CLICKHOUSE_PORT` | `8123` | ClickHouse HTTP 端口 |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka Broker 地址（逗号分隔） |
| `NEO4J_HOST` | `localhost` | Neo4j 主机 |
| `NEO4J_PORT` | `7687` | Neo4j Bolt 端口 |
| `NEO4J_USER` | `neo4j` | Neo4j 用户名 |
| `NEO4J_PASSWORD` | `neo4j` | Neo4j 密码 |
| `QDRANT_HOST` | `localhost` | Qdrant 主机 |
| `QDRANT_PORT` | `6333` | Qdrant 端口 |
| `MINIO_ENDPOINT` | `localhost` | MinIO 端点 |
| `MINIO_PORT` | `9000` | MinIO API 端口 |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO 访问密钥 |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO 密钥 |

### 6.5 AI / LLM 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 服务地址 |
| `OLLAMA_MODEL` | `llama3.1:70b` | 默认 Ollama 模型 |
| `XAI_API_URL` | `https://api.x.ai` | xAI (Grok) API 地址 |
| `XAI_API_KEY` | 空 | xAI API 密钥 |
| `XAI_MODEL` | `grok-4-0709` | xAI 默认模型 |
| `XAI_FALLBACK_OLLAMA` | `true` | xAI 不可用时回退到 Ollama |

### 6.6 可观测性配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OTEL_ENABLED` | `true` | 启用 OpenTelemetry |
| `OTEL_SERVICE_NAME` | `portai-nexus-dev` | 服务名称 |
| `OTEL_SAMPLING_RATIO` | `1.0` | 采样率（生产建议 0.1） |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 空 | OTLP 导出端点 |

---

## 7. 数据库初始化

### 7.1 Drizzle 迁移（推荐方式）

Drizzle 迁移文件位于 `drizzle/0000_dark_quasar.sql`，包含全部 **164 张表**的 DDL。

```bash
# 确保 DATABASE_URL 已设置
export DATABASE_URL="mysql://portai:your_password@localhost:3306/portai_nexus"

# 执行迁移（generate + migrate）
pnpm db:push
```

`pnpm db:push` 实际执行的是：

```bash
drizzle-kit generate && drizzle-kit migrate
```

### 7.2 表结构来源

| Schema 文件 | 表数量 | 说明 |
|------------|--------|------|
| `drizzle/schema.ts` | 121 张 | 核心业务表 |
| `drizzle/evolution-schema.ts` | 43 张 | V5 深度进化表 |
| **合计** | **164 张** | 迁移文件完整覆盖 |

### 7.3 种子数据

Docker 首次启动时自动加载种子数据。如果使用 Drizzle 迁移方式，需要手动导入种子数据：

```bash
# 连接到 MySQL
mysql -h localhost -P 3306 -u portai -p portai_nexus

# 导入种子数据
source docker/mysql/init/05-base-seed.sql
source docker/mysql/init/06-v5-seed.sql
source docker/mysql/init/07-evolution-seed.sql
source docker/mysql/init/08-twin-config-seed.sql
```

种子数据包含：基础编码规则、字典数据、设备模板、测点模板、标签维度等平台运行所需的初始化数据。

### 7.4 ClickHouse 初始化

ClickHouse 表结构通过 Docker 初始化脚本自动创建：

```
docker/clickhouse/init/
├── 01_base_tables.sql    # 时序数据基础表
└── 02_views_and_indexes.sql  # 物化视图和索引
```

如果不使用 Docker，需要手动执行这些 SQL。

---

## 8. 服务端口清单

### 8.1 应用端口

| 服务 | 默认端口 | 环境变量 | 说明 |
|------|---------|---------|------|
| **应用 (HTTP)** | 3000 | `PORT` | Express + tRPC + 前端 |

### 8.2 基础设施端口

| 服务 | 默认端口 | 环境变量 | 说明 |
|------|---------|---------|------|
| MySQL | 3306 | `MYSQL_PORT` | 关系数据库 |
| Redis | 6379 | `REDIS_PORT` | 缓存 |
| ClickHouse HTTP | 8123 | `CLICKHOUSE_HTTP_PORT` | 时序数据库 HTTP 接口 |
| ClickHouse Native | 9000 | `CLICKHOUSE_NATIVE_PORT` | 时序数据库原生协议 |
| Kafka | 9092 | `KAFKA_PORT` | 消息队列 |
| Neo4j HTTP | 7474 | `NEO4J_HTTP_PORT` | 图数据库 Web 界面 |
| Neo4j Bolt | 7687 | `NEO4J_BOLT_PORT` | 图数据库 Bolt 协议 |
| Qdrant HTTP | 6333 | `QDRANT_PORT` | 向量数据库 HTTP |
| Qdrant gRPC | 6334 | `QDRANT_GRPC_PORT` | 向量数据库 gRPC |
| MinIO API | 9010 | `MINIO_API_PORT` | 对象存储 API |
| MinIO Console | 9011 | `MINIO_CONSOLE_PORT` | 对象存储管理界面 |

### 8.3 监控端口

| 服务 | 默认端口 | 环境变量 | 说明 |
|------|---------|---------|------|
| Prometheus | 9090 | `PROMETHEUS_PORT` | 指标采集 |
| Grafana | 3001 | `GRAFANA_PORT` | 监控仪表盘 |
| Jaeger UI | 16686 | `JAEGER_UI_PORT` | 分布式追踪 |
| Alertmanager | 9093 | `ALERTMANAGER_PORT` | 告警管理 |
| Node Exporter | 9100 | `NODE_EXPORTER_PORT` | 主机指标 |
| cAdvisor | 8080 | `CADVISOR_PORT` | 容器指标 |
| MySQL Exporter | 9104 | `MYSQL_EXPORTER_PORT` | MySQL 指标 |
| Redis Exporter | 9121 | `REDIS_EXPORTER_PORT` | Redis 指标 |
| Kafka Exporter | 9308 | `KAFKA_EXPORTER_PORT` | Kafka 指标 |

### 8.4 大数据端口（需要 `--profile bigdata`）

| 服务 | 默认端口 | 说明 |
|------|---------|------|
| Elasticsearch | 9200 | 全文搜索 |
| Kafka Connect | 8083 | 数据集成 |
| Flink JobManager | 8081 | 流处理 Web UI |
| Airflow Webserver | 8080 | 任务编排 Web UI |

---

## 9. 启动验证

### 9.1 健康检查端点

```bash
# 应用健康检查
curl -s http://localhost:3000/api/rest/_health
# 期望: HTTP 200

# 前端页面
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# 期望: 200
```

### 9.2 服务状态检查

```bash
# Docker 服务状态
docker compose ps

# MySQL 连接测试
docker exec portai-mysql mysqladmin ping -h localhost -uroot -p$MYSQL_ROOT_PASSWORD

# Redis 连接测试
docker exec portai-redis redis-cli ping
# 期望: PONG

# Kafka 主题列表
docker exec portai-kafka kafka-topics --bootstrap-server localhost:29092 --list

# Neo4j 连接测试
curl -s http://localhost:7474
```

### 9.3 14 个后台服务启动状态

平台启动时会在控制台输出每个后台服务的启动状态。正常情况下应该看到：

```
✓ config-center          配置中心               [50ms]
✓ otel                   OpenTelemetry 初始化    [~3500ms]
✓ rest-bridge            REST API 桥接层         [4ms]
✓ data-flow-tracer       DataFlowTracer          [13ms]
✓ graph-query-optimizer   图查询优化器            [21ms]
✓ read-replica           读写分离服务             [21ms]
✓ outbox-publisher       Outbox 混合发布器        [35ms]
✓ health-check           定时健康检查             [62ms]
✓ adaptive-sampling      自适应采样服务           [64ms]
✓ agent-registry         Agent Registry          [77ms]
✓ event-bus              事件总线集成             [8ms]
✓ data-artery            数据动脉全链路           [134ms]
✓ algorithm-sync         内置算法同步             [50ms]  ← 需要 MySQL 表存在
✓ saga-orchestrator      Saga 编排器             [77ms]  ← 需要 MySQL 表存在
```

如果 `algorithm-sync` 或 `saga-orchestrator` 显示降级（⚠），说明数据库迁移未执行。请执行 `pnpm db:push`。

---

## 10. 常见问题排查

### 10.1 MySQL 启动失败

**问题**：`MYSQL_ROOT_PASSWORD must be set`

**原因**：Docker Compose 中 MySQL 使用了 `${MYSQL_ROOT_PASSWORD:?}` 语法，要求必须设置该变量。

**解决**：

```bash
export MYSQL_ROOT_PASSWORD=your_password
export MYSQL_PASSWORD=your_app_password
docker compose up -d mysql
```

### 10.2 数据库迁移失败

**问题**：`DATABASE_URL is required to run drizzle commands`

**解决**：

```bash
export DATABASE_URL="mysql://portai:your_password@localhost:3306/portai_nexus"
pnpm db:push
```

### 10.3 algorithm-sync / saga-orchestrator 降级

**问题**：启动日志显示这两个服务降级运行。

**原因**：MySQL 中缺少 `algorithm_definitions`、`saga_instances` 等表。

**解决**：执行数据库迁移 `pnpm db:push`，迁移文件会创建全部 164 张表。

### 10.4 ClickHouse / Kafka / Neo4j 连接失败

**问题**：启动日志显示 ECONNREFUSED。

**原因**：对应的服务未启动。

**解决**：这是预期行为，平台会自动降级。如需完整功能，启动对应服务：

```bash
docker compose up -d clickhouse kafka neo4j
```

### 10.5 端口冲突

**问题**：`Address already in use`

**解决**：通过环境变量修改端口：

```bash
PORT=3001 pnpm dev
# 或
MYSQL_PORT=3307 docker compose up -d mysql
```

### 10.6 pnpm 版本不匹配

**问题**：`ERR_PNPM_UNSUPPORTED_ENGINE`

**解决**：

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
```

---

## 11. 生产环境部署要点

### 11.1 安全检查清单

| 项目 | 开发环境 | 生产环境要求 | 说明 |
|------|---------|-------------|------|
| `JWT_SECRET` | `change-me-in-production` | **必须修改**（≥32 字符随机字符串） | 使用默认值会导致进程 `process.exit(1)` |
| `CORS_ORIGINS` | `*` | **必须指定具体域名** | 通配符在生产环境会报错 |
| `SKIP_AUTH` | `true` | **必须为 `false`** | 跳过认证是严重安全漏洞 |
| `MYSQL_PASSWORD` | 空 | **必须设置强密码** | 配置验证会阻断启动 |
| `MYSQL_ROOT_PASSWORD` | 无 | **必须设置** | Docker 健康检查依赖 |

### 11.2 生产环境配置模板

```bash
cp .env.production.template .env.production
# 编辑 .env.production，填入所有 [REQUIRED] 标记的变量
```

### 11.3 Docker 生产部署

```bash
# 构建生产镜像
docker build -t portai-nexus:latest .

# 使用 docker-compose 启动（生产模式）
NODE_ENV=production docker compose up -d
```

### 11.4 性能调优建议

| 参数 | 开发默认 | 生产建议 | 说明 |
|------|---------|---------|------|
| `DB_POOL_MAX` | 50 | 100-200 | 根据并发量调整 |
| `DB_POOL_MIN_IDLE` | 10 | 20 | 最小空闲连接 |
| `OTEL_SAMPLING_RATIO` | 1.0 | 0.1 | 降低追踪开销 |
| `LOG_LEVEL` | info | warn | 减少日志量 |
| MySQL `innodb-buffer-pool-size` | 256M | 物理内存的 70% | InnoDB 缓冲池 |
| Redis `maxmemory` | 256mb | 根据数据量 | 缓存上限 |

---

## 附录：快速命令参考

```bash
# ===== 开发 =====
pnpm dev                    # 自动引导启动（推荐）
pnpm dev:local              # 使用 .env.local 启动
pnpm dev:raw                # 最小启动
pnpm check                  # TypeScript 类型检查
pnpm test                   # 运行测试（203 个用例）
pnpm build                  # 生产构建

# ===== 数据库 =====
pnpm db:push                # 生成并执行迁移

# ===== Docker =====
docker compose up -d mysql redis                    # 最小启动
docker compose up -d                                # 全部默认服务
docker compose --profile bigdata up -d              # 大数据服务
docker compose --profile full up -d                 # 全部服务
docker compose down                                 # 停止全部
docker compose logs -f <service>                    # 查看日志
docker compose ps                                   # 查看状态

# ===== 生产 =====
docker build -t portai-nexus:latest .               # 构建镜像
pnpm start                                          # 启动生产服务
```
