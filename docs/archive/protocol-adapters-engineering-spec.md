# XiLian Platform 协议适配器工程化技术方案

> **版本**: v1.0  
> **日期**: 2026-02-14  
> **作者**: Manus AI  
> **目标**: 将 15 个协议适配器从原型级提升为商用级、生产可用的工程化实现

---

## 一、现状分析

### 1.1 已有基础设施

当前代码库已具备以下基础：

| 层级 | 文件 | 内容 | 质量评估 |
|------|------|------|----------|
| **基础设施** | `protocol-adapters/base.ts` (584行) | `BaseAdapter` 抽象类、`ConnectionPool<T>` 泛型连接池、`AdapterError` 错误体系、`MetricsCollector` 指标收集、`withTimeout`/`withRetry` 工具函数 | **良好** — 架构合理，可直接复用 |
| **已实现适配器** | `mqtt.adapter.ts` / `opcua.adapter.ts` / `modbus.adapter.ts` / `mysql.adapter.ts` / `postgresql.adapter.ts` / `clickhouse.adapter.ts` / `influxdb.adapter.ts` | 7 个适配器已基于真实 npm 库实现 `doTestConnection` + `doDiscoverResources` + `doHealthCheck` | **中等** — 连接测试真实，但缺少连接池复用和 TLS 完整配置 |
| **旧模拟注册表** | `protocol-adapters/index.ts` (660行) | 15 个适配器的模拟实现（`setTimeout` 假连接） + `configSchema` 定义 | **需替换** — 模拟实现无法商用 |
| **平台客户端** | `lib/clients/kafka.client.ts` / `redis.client.ts` / `clickhouse.client.ts` | 已有真实的 Kafka/Redis/ClickHouse 客户端，含连接管理和重试 | **良好** — 可作为适配器的底层委托 |
| **平台连接器** | `platform/connectors/` 6 个文件 | ClickHouse/MinIO/MySQL/Nebula/Qdrant/Redis 的简单单例连接器 | **基础** — 仅 healthCheck，无资源发现 |

### 1.2 已安装的 npm 依赖

所有 15 个协议所需的 npm 包已全部安装：

| 协议 | npm 包 | 版本 | 类型 |
|------|--------|------|------|
| MQTT | `mqtt` | ^5.15.0 | 工业协议 |
| OPC-UA | `node-opcua` | ^2.163.1 | 工业协议 |
| Modbus | `modbus-serial` | ^8.0.23 | 工业协议 |
| MySQL | `mysql2` | ^3.15.0 | 关系型数据库 |
| PostgreSQL | `pg` + `@types/pg` | ^8.18.0 | 关系型数据库 |
| ClickHouse | `@clickhouse/client` | ^1.16.0 | 分析型数据库 |
| InfluxDB | `@influxdata/influxdb-client` + `-apis` | ^1.35.0 | 时序数据库 |
| Redis | `ioredis` | ^5.9.2 | 缓存/NoSQL |
| Neo4j | `neo4j-driver` | ^6.0.1 | 图数据库 |
| Qdrant | `@qdrant/js-client-rest` | ^1.16.2 | 向量数据库 |
| Kafka | `kafkajs` | ^2.2.4 | 消息队列 |
| MinIO | `minio` | ^8.0.6 | 对象存储 |
| HTTP | `axios` | ^1.12.0 | API 协议 |
| gRPC | `@grpc/grpc-js` + `@grpc/proto-loader` | ^1.14.3 / ^0.8.0 | API 协议 |
| WebSocket | `ws` | ^8.19.0 | 实时协议 |

### 1.3 核心问题

1. **双轨并存**：`index.ts` 中的旧模拟注册表和新的 `*.adapter.ts` 真实适配器同时存在，`access-layer.service.ts` 仍引用旧注册表
2. **8 个适配器缺失**：Redis / Neo4j / Qdrant / Kafka / MinIO / HTTP / gRPC / WebSocket 尚无真实适配器文件
3. **连接池未利用**：`base.ts` 中的 `ConnectionPool<T>` 已实现但无适配器使用
4. **TLS 配置不完整**：部分适配器的 `configSchema` 缺少证书路径、CA 验证等安全字段
5. **与平台客户端未整合**：`lib/clients/` 下已有的 Kafka/Redis/ClickHouse 客户端未被适配器复用

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    tRPC Router Layer                      │
│              accessLayer.router.ts                        │
├─────────────────────────────────────────────────────────┤
│                  Service Layer                            │
│            access-layer.service.ts                        │
│   (CRUD + testConnection + discoverResources + health)   │
├─────────────────────────────────────────────────────────┤
│              Adapter Registry                             │
│         protocol-adapters/index.ts (新)                   │
│   adapterRegistry.get('mqtt') → MqttAdapter instance     │
├─────────────────────────────────────────────────────────┤
│              BaseAdapter (base.ts)                        │
│   ┌──────────┬──────────┬──────────┬──────────┐         │
│   │ Timeout  │  Retry   │ Metrics  │  Error   │         │
│   │ Control  │ Strategy │ Collect  │ Normalize│         │
│   └──────────┴──────────┴──────────┴──────────┘         │
│   ┌──────────────────────────────────────────┐           │
│   │       ConnectionPool<T> (可选)            │           │
│   │  acquire → validate → use → release      │           │
│   │  eviction / maxIdle / healthCheck         │           │
│   └──────────────────────────────────────────┘           │
├─────────────────────────────────────────────────────────┤
│              15 Protocol Adapters                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  MQTT   │ │ OPC-UA  │ │ Modbus  │ │  MySQL  │      │
│  │mqtt 5.x │ │node-opcua│ │modbus-  │ │mysql2   │      │
│  │         │ │  2.163  │ │serial 8 │ │  3.15   │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │Postgres │ │ClickHse │ │InfluxDB │ │  Redis  │      │
│  │  pg 8   │ │@ch/cli 1│ │@influx 1│ │ioredis 5│      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  Neo4j  │ │ Qdrant  │ │  Kafka  │ │  MinIO  │      │
│  │neo4j 6  │ │@qdrant 1│ │kafkajs 2│ │minio 8  │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │  HTTP   │ │  gRPC   │ │WebSocket│                   │
│  │axios 1  │ │@grpc/js 1│ │  ws 8   │                   │
│  └─────────┘ └─────────┘ └─────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 设计原则

1. **单一职责**：每个适配器只负责一种协议，通过 `BaseAdapter` 获得通用能力（超时、重试、指标、错误处理）
2. **依赖倒置**：`access-layer.service.ts` 依赖 `ProtocolAdapter` 接口而非具体实现，通过注册表动态获取
3. **复用优先**：已有的 `lib/clients/` 客户端作为适配器的底层委托，避免重复实现连接管理
4. **安全默认**：所有适配器默认支持 TLS/SSL，configSchema 中包含完整的安全配置字段
5. **优雅降级**：资源发现失败不影响连接测试，健康检查失败不影响已有数据

### 2.3 文件结构规划

```
server/services/protocol-adapters/
├── base.ts                    # 基础设施（保留，微调）
├── index.ts                   # 适配器注册表（完全重写）
├── mqtt.adapter.ts            # MQTT（保留，增强 TLS）
├── opcua.adapter.ts           # OPC-UA（保留，增强安全模式）
├── modbus.adapter.ts          # Modbus（保留，增强 TCP/RTU 切换）
├── mysql.adapter.ts           # MySQL（保留，增强连接池）
├── postgresql.adapter.ts      # PostgreSQL（保留，增强 SSL）
├── clickhouse.adapter.ts      # ClickHouse（保留，增强集群支持）
├── influxdb.adapter.ts        # InfluxDB（保留，增强 Flux 查询）
├── redis.adapter.ts           # Redis（新建）
├── neo4j.adapter.ts           # Neo4j（新建）
├── qdrant.adapter.ts          # Qdrant（新建）
├── kafka.adapter.ts           # Kafka（新建）
├── minio.adapter.ts           # MinIO（新建）
├── http.adapter.ts            # HTTP/REST（新建）
├── grpc.adapter.ts            # gRPC（新建）
└── websocket.adapter.ts       # WebSocket（新建）
```

---

## 三、15 个协议适配器详细规范

### 3.1 工业协议

#### 3.1.1 MQTT Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `mqtt` v5.15.0 — 支持 MQTT 3.1.1 / 5.0，内置自动重连 |
| **连接方式** | `mqtt.connect(url, options)` → 返回 `MqttClient` |
| **协议版本** | 支持 MQTT 3.1.1（默认）和 MQTT 5.0（configSchema 可选） |
| **传输层** | TCP (`mqtt://`)、TLS (`mqtts://`)、WebSocket (`ws://`)、WSS (`wss://`) |
| **认证** | 用户名/密码、客户端证书（mTLS）、匿名 |
| **TLS 配置** | `ca`（CA 证书路径）、`cert`（客户端证书）、`key`（客户端私钥）、`rejectUnauthorized`（是否验证服务器证书） |
| **连接测试** | `connect` → 等待 `'connect'` 事件 → 获取 `connack` → `end()` 断开。返回 sessionPresent、协议版本 |
| **资源发现** | 订阅 `$SYS/#` 和 `#`（通配），监听 5 秒收集活跃 Topic，统计消息数和采样 payload |
| **健康检查** | 复用连接测试，成功则 healthy |
| **现有实现** | `mqtt.adapter.ts` — 已完整实现，质量良好 |
| **需增强** | configSchema 添加 `protocolVersion` 选择（3.1.1/5.0）、`rejectUnauthorized` 开关 |

#### 3.1.2 OPC-UA Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `node-opcua` v2.163.1 — 完整的 OPC-UA SDK（Client + Server） |
| **连接方式** | `OPCUAClient.create(options)` → `client.connect(endpointUrl)` → `client.createSession()` |
| **安全模式** | None / Sign / SignAndEncrypt |
| **安全策略** | None / Basic128Rsa15 / Basic256 / Basic256Sha256 / Aes128_Sha256_RsaOaep / Aes256_Sha256_RsaPss |
| **认证** | 匿名、用户名/密码、X.509 证书 |
| **连接测试** | `connect` → `createSession` → 读取 `Server_ServerStatus` 节点获取服务器信息 → `closeSession` → `disconnect` |
| **资源发现** | 从 `RootFolder` (NodeId `i=84`) 开始递归浏览 `Objects` 文件夹（`i=85`），最大深度 4 层，收集 Variable 节点（NodeClass=2）的 NodeId、BrowseName、DataType、AccessLevel |
| **健康检查** | 连接 → 读取 `Server_ServerStatus` → 检查 `state`（Running/Failed/NoConfiguration 等） |
| **现有实现** | `opcua.adapter.ts` — 已实现连接测试和资源发现 |
| **需增强** | 添加 `applicationUri`、`certificatePath`、`privateKeyPath` 配置字段；资源发现增加 DataType 信息 |

#### 3.1.3 Modbus Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `modbus-serial` v8.0.23 — 支持 Modbus RTU / TCP / ASCII |
| **连接方式** | TCP: `client.connectTCP(ip, { port })` / RTU: `client.connectRTUBuffered(path, { baudRate })` |
| **传输模式** | Modbus TCP（默认）、Modbus RTU over Serial、Modbus RTU over TCP |
| **认证** | 无（Modbus 协议本身无认证机制，安全依赖网络层） |
| **连接测试** | `connectTCP` → `setID(slaveId)` → `readHoldingRegisters(0, 1)` 读取首个寄存器验证通信 → `close()` |
| **资源发现** | 扫描 Slave ID 1-247（可配置范围），对每个 ID 尝试读取 Holding Registers（FC03）、Input Registers（FC04）、Coils（FC01）、Discrete Inputs（FC02），返回可访问的寄存器范围 |
| **健康检查** | 复用连接测试 |
| **现有实现** | `modbus.adapter.ts` — 已实现 TCP 连接测试和寄存器扫描 |
| **需增强** | 添加 RTU 串口配置（baudRate/dataBits/stopBits/parity）、扫描范围可配置、超时优化 |

### 3.2 关系型数据库

#### 3.2.1 MySQL Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `mysql2` v3.15.0 — 支持 Promise API、连接池、预处理语句 |
| **连接方式** | `mysql.createConnection(config)` 或 `mysql.createPool(config)` |
| **认证** | 用户名/密码、`mysql_native_password`、`caching_sha2_password` |
| **TLS 配置** | `ssl: { ca, cert, key, rejectUnauthorized }` |
| **连接测试** | `createConnection` → `SELECT VERSION(), @@hostname, @@port, @@datadir` → `end()` |
| **资源发现** | `SHOW DATABASES` → 对每个库 `SHOW TABLES` → 对每个表 `SHOW COLUMNS` + `SHOW TABLE STATUS`（获取行数、大小、引擎、注释） |
| **健康检查** | `SELECT 1` + `SHOW GLOBAL STATUS LIKE 'Threads_connected'` + `SHOW GLOBAL STATUS LIKE 'Uptime'` |
| **现有实现** | `mysql.adapter.ts` — 已完整实现 |
| **需增强** | configSchema 添加 `charset`、`timezone`、`connectTimeout` 字段 |

#### 3.2.2 PostgreSQL Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `pg` v8.18.0 — Node.js 最成熟的 PostgreSQL 客户端 |
| **连接方式** | `new Client(config)` → `client.connect()` 或 `new Pool(config)` |
| **认证** | 用户名/密码、`md5`、`scram-sha-256`（PostgreSQL 10+ 默认） |
| **TLS 配置** | `ssl: { ca, cert, key, rejectUnauthorized }` 或 `ssl: true`（使用系统 CA） |
| **连接测试** | `connect()` → `SELECT version()` + `SELECT current_database(), current_user, inet_server_addr(), inet_server_port()` → `end()` |
| **资源发现** | 查询 `information_schema.schemata` → `information_schema.tables` → `information_schema.columns`，同时查询 `pg_stat_user_tables` 获取行数估算和表大小 |
| **健康检查** | `SELECT 1` + `SELECT count(*) FROM pg_stat_activity` + `SELECT pg_database_size(current_database())` |
| **现有实现** | `postgresql.adapter.ts` — 已完整实现 |
| **需增强** | 添加 `schema` 过滤、`applicationName` 字段、连接池配置 |

### 3.3 时序/分析型数据库

#### 3.3.1 ClickHouse Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `@clickhouse/client` v1.16.0 — 官方 HTTP 客户端，支持压缩、流式查询 |
| **连接方式** | `createClient({ url, database, username, password })` |
| **认证** | 用户名/密码（HTTP Basic Auth） |
| **TLS 配置** | URL 使用 `https://`，`tls: { ca_cert, cert, key }` |
| **连接测试** | `client.ping()` → `SELECT version()` + 系统表统计（数据库数、表数、磁盘用量、活跃查询数） |
| **资源发现** | `system.databases` → `system.tables`（含引擎、分区键、排序键、主键）→ `system.columns`（含类型、默认值、注释） |
| **健康检查** | `ping()` + `system.processes` + `system.replicas`（只读副本数）+ `system.mutations`（待处理变更数） |
| **现有实现** | `clickhouse.adapter.ts` — 已完整实现 |
| **需增强** | 添加 `cluster` 名称配置、Native TCP 端口支持提示 |

#### 3.3.2 InfluxDB Adapter

| 项目 | 规范 |
|------|------|
| **npm 包** | `@influxdata/influxdb-client` v1.35.0 + `@influxdata/influxdb-client-apis` |
| **连接方式** | `new InfluxDB({ url, token })` → `getQueryApi(org)` / `getWriteApi(org, bucket)` |
| **认证** | API Token（InfluxDB 2.x 唯一认证方式） |
| **TLS 配置** | URL 使用 `https://`，Node.js 环境变量 `NODE_TLS_REJECT_UNAUTHORIZED` 或自定义 Agent |
| **连接测试** | `HealthAPI.getHealth()` → `OrgsAPI.getOrgs()` → `BucketsAPI.getBuckets()` |
| **资源发现** | 列出 Bucket → 对每个 Bucket 用 Flux `schema.measurements()` / `schema.measurementFieldKeys()` / `schema.measurementTagKeys()` 获取 Measurement、Field、Tag 信息 |
| **健康检查** | `HealthAPI.getHealth()` → 检查 `status === 'pass'` |
| **现有实现** | `influxdb.adapter.ts` — 已完整实现 |
| **需增强** | 添加 InfluxDB 1.x 兼容模式提示、写入精度配置 |

### 3.4 NoSQL / 向量数据库

#### 3.4.1 Redis Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `ioredis` v5.9.2 — 支持 Cluster、Sentinel、Pipeline、Lua 脚本 |
| **连接方式** | 单机: `new Redis({ host, port, password, db })` / 集群: `new Redis.Cluster(nodes)` / Sentinel: `new Redis({ sentinels, name })` |
| **部署模式** | 单机（默认）、Cluster（分片）、Sentinel（高可用） |
| **认证** | 密码（`requirepass`）、ACL 用户名+密码（Redis 6+） |
| **TLS 配置** | `tls: { ca, cert, key, rejectUnauthorized }` |
| **连接测试** | `redis.ping()` → `redis.info('server')` 解析版本号、模式、连接数 → `redis.info('memory')` 获取内存使用 → `redis.info('keyspace')` 获取 DB 统计 → `disconnect()` |
| **资源发现** | `INFO keyspace` 获取各 DB 的 key 数量 → `SCAN` 采样 key（限制 100 个）→ `TYPE` 获取每个 key 的类型 → 按前缀分组统计 |
| **健康检查** | `PING` + `INFO server`（uptime）+ `INFO memory`（used_memory_human）+ `INFO clients`（connected_clients） |
| **与平台整合** | 复用 `lib/clients/redis.client.ts` 的连接配置模式，但适配器创建独立连接（不影响平台缓存） |

#### 3.4.2 Neo4j Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `neo4j-driver` v6.0.1 — 官方驱动，支持 Bolt/Neo4j 协议、事务、路由 |
| **连接方式** | `neo4j.driver(uri, auth, config)` → `driver.getServerInfo()` 验证连接 |
| **协议** | `bolt://`（默认 7687）、`bolt+s://`（TLS）、`neo4j://`（路由，集群）、`neo4j+s://`（路由+TLS） |
| **认证** | 用户名/密码（`neo4j.auth.basic`）、Kerberos（`neo4j.auth.kerberos`）、Bearer Token |
| **TLS 配置** | URI 使用 `bolt+s://` 或 `neo4j+s://`，`encrypted: true`，`trustedCertificates` |
| **连接测试** | `driver.getServerInfo()` → 获取 address、protocolVersion → `session.run('CALL dbms.components()')` 获取版本和 edition → `session.close()` → `driver.close()` |
| **资源发现** | `CALL db.labels()` 获取所有标签 → `CALL db.relationshipTypes()` 获取关系类型 → 对每个标签 `MATCH (n:Label) RETURN count(n), keys(n) LIMIT 1` 获取节点数和属性 → `CALL db.indexes()` 获取索引 |
| **健康检查** | `driver.getServerInfo()` + `session.run('CALL dbms.queryJmx("org.neo4j:*")')` 获取 JMX 指标（store size、transaction count） |
| **与 KG 编排器整合** | 适配器发现的 Label/RelationshipType 可直接映射到 KG 编排器的节点类型和关系类型 |

#### 3.4.3 Qdrant Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `@qdrant/js-client-rest` v1.16.2 — 官方 REST 客户端 |
| **连接方式** | `new QdrantClient({ url, apiKey, https })` |
| **认证** | API Key（`api-key` header）或无认证 |
| **TLS 配置** | `https: true`（URL 使用 `https://`） |
| **连接测试** | `client.api('cluster').clusterStatus()` 或 `client.getCollections()` → 获取集合列表和集群状态 |
| **资源发现** | `getCollections()` → 对每个集合 `getCollection(name)` 获取详细信息（向量维度、距离度量、点数、索引状态、分片信息）→ 获取 payload schema |
| **健康检查** | `getCollections()` 成功即 healthy，检查各集合的 `optimizer_status` |
| **SHM 场景** | 传感器特征向量存储、相似故障检索、异常模式匹配 |

### 3.5 消息队列 / 对象存储

#### 3.5.1 Kafka Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `kafkajs` v2.2.4 — 纯 JavaScript 实现，支持 SASL/SSL、消费者组、事务 |
| **连接方式** | `new Kafka({ clientId, brokers, ssl, sasl })` → `kafka.admin()` → `admin.connect()` |
| **认证** | 无认证、SASL/PLAIN、SASL/SCRAM-SHA-256、SASL/SCRAM-SHA-512 |
| **TLS 配置** | `ssl: true`（系统 CA）或 `ssl: { ca, cert, key, rejectUnauthorized }` |
| **连接测试** | `admin.connect()` → `admin.describeCluster()` 获取 broker 列表、controller、clusterId → `admin.disconnect()` |
| **资源发现** | `admin.listTopics()` → `admin.fetchTopicMetadata({ topics })` 获取分区数 → `admin.fetchTopicOffsets(topic)` 获取各分区的最新 offset → `admin.describeConfigs({ resources })` 获取 Topic 配置（retention.ms、cleanup.policy 等） |
| **健康检查** | `admin.describeCluster()` → 检查 broker 数量是否与预期一致、controller 是否存在 |
| **与平台整合** | 复用 `lib/clients/kafka.client.ts` 的 broker 配置模式 |

#### 3.5.2 MinIO Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `minio` v8.0.6 — 兼容 Amazon S3 API 的客户端 |
| **连接方式** | `new Minio.Client({ endPoint, port, useSSL, accessKey, secretKey })` |
| **认证** | Access Key + Secret Key（S3 兼容） |
| **TLS 配置** | `useSSL: true`，可自定义 `transportAgent` 配置 CA 证书 |
| **连接测试** | `client.listBuckets()` → 获取 Bucket 列表、创建时间 |
| **资源发现** | `listBuckets()` → 对每个 Bucket `listObjectsV2(bucket, '', true)` 采样前 100 个对象 → 按前缀分组统计文件数和总大小 → `getBucketPolicy(bucket)` 获取访问策略 |
| **健康检查** | `listBuckets()` 成功即 healthy |
| **SHM 场景** | 原始 CSV 文件存储、模型文件管理、分析报告归档 |

### 3.6 API 协议

#### 3.6.1 HTTP/REST Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `axios` v1.12.0 — 支持拦截器、超时、代理、自动重试 |
| **连接方式** | `axios.create({ baseURL, timeout, headers })` |
| **认证** | 无认证、Basic Auth、Bearer Token、API Key（Header/Query）、OAuth2 Client Credentials |
| **TLS 配置** | `httpsAgent: new https.Agent({ ca, cert, key, rejectUnauthorized })` |
| **连接测试** | `HEAD` 或 `GET` 请求到 baseURL → 检查 HTTP 状态码、响应时间、Server header |
| **资源发现** | 尝试获取 OpenAPI/Swagger 文档（`/openapi.json`、`/swagger.json`、`/api-docs`）→ 解析 paths 和 schemas → 如果无文档则返回 baseURL 作为单个端点 |
| **健康检查** | `GET /health` 或 `GET /` → 检查状态码 2xx |
| **通用性** | 可对接任意 REST API（传感器数据 API、第三方平台 API、内部微服务） |

#### 3.6.2 gRPC Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `@grpc/grpc-js` v1.14.3 + `@grpc/proto-loader` v0.8.0 |
| **连接方式** | `grpc.credentials.createInsecure()` 或 `grpc.credentials.createSsl(ca, key, cert)` → `new grpc.Client(address, credentials)` |
| **认证** | 无认证（Insecure）、TLS（Server Auth）、mTLS（Mutual Auth）、Token（Call Metadata） |
| **TLS 配置** | `grpc.credentials.createSsl(rootCerts, privateKey, certChain)` |
| **连接测试** | 创建 Channel → `client.waitForReady(deadline)` → 检查连接状态 `READY` |
| **资源发现** | gRPC Server Reflection（`grpc.reflection.v1.ServerReflection`）→ `ListServices` → `FileContainingSymbol` → 解析 proto 定义获取 Service、Method、Message 信息。如果服务器不支持 Reflection，则需要用户上传 `.proto` 文件 |
| **健康检查** | gRPC Health Checking Protocol（`grpc.health.v1.Health/Check`）→ 检查 `servingStatus` |
| **SHM 场景** | 边缘设备 gRPC 推送、模型推理服务调用（TorchServe/Triton） |

#### 3.6.3 WebSocket Adapter（新建）

| 项目 | 规范 |
|------|------|
| **npm 包** | `ws` v8.19.0 — 高性能 WebSocket 客户端/服务器 |
| **连接方式** | `new WebSocket(url, { headers, ca, cert, key })` |
| **认证** | 无认证、Token in URL Query、Token in Header、子协议认证 |
| **TLS 配置** | URL 使用 `wss://`，`options: { ca, cert, key, rejectUnauthorized }` |
| **连接测试** | `new WebSocket(url)` → 等待 `'open'` 事件 → 发送 ping → 等待 pong → `close()` |
| **资源发现** | WebSocket 无标准资源发现机制。尝试发送 `{"type":"discover"}` 或 `{"action":"list"}` 消息，解析响应；如果无响应则返回 URL 作为单个端点 |
| **健康检查** | 连接 → ping/pong 往返延迟 → 关闭 |
| **SHM 场景** | 实时数据推送、前端 ECharts 实时可视化、边缘网关双向通信 |

---

## 四、基础设施层增强

### 4.1 base.ts 保留项

当前 `base.ts` 的以下组件质量良好，**保留不动**：

- `AdapterErrorCode` 枚举（CONNECTION_REFUSED / TIMEOUT / AUTH_FAILED / PROTOCOL_ERROR / RESOURCE_NOT_FOUND / INTERNAL_ERROR）
- `AdapterError` 类（含 code、protocol、toJSON）
- `normalizeError()` 函数（统一错误格式）
- `MetricsCollector` 类（连接成功/失败计数、查询延迟统计、错误记录）
- `withTimeout<T>()` 泛型超时控制
- `withRetry<T>()` 泛型重试（指数退避 + 抖动）
- `ConnectionPool<T>` 泛型连接池（acquire/release/evict/healthCheck）
- `BaseAdapter` 抽象类（testConnection/discoverResources/healthCheck 的模板方法模式）

### 4.2 base.ts 需增强

1. **添加 `createTlsOptions()` 工具方法**：统一处理 CA/Cert/Key 路径读取和 `rejectUnauthorized` 配置
2. **添加 `sanitizeConfig()` 方法**：在日志和错误信息中脱敏密码和 Token
3. **`ConnectionPool` 添加 `healthCheckFn` 支持**：定期验证池中连接是否仍然有效

### 4.3 index.ts 重写方案

旧的 `index.ts`（660 行模拟代码）将被完全替换为：

```typescript
// 导入所有真实适配器
import { MqttAdapter } from './mqtt.adapter';
import { OpcuaAdapter } from './opcua.adapter';
// ... 15 个适配器

// 单例注册表
const adapterInstances = new Map<ProtocolType, BaseAdapter>();

export function getAdapter(protocolType: ProtocolType): BaseAdapter {
  let adapter = adapterInstances.get(protocolType);
  if (!adapter) {
    adapter = createAdapter(protocolType);
    adapterInstances.set(protocolType, adapter);
  }
  return adapter;
}

// 导出兼容旧接口的 protocolAdapters 对象
export const protocolAdapters: Record<string, ProtocolAdapter> = new Proxy({}, {
  get: (_, key: string) => getAdapter(key as ProtocolType),
});
```

---

## 五、与现有平台的整合策略

### 5.1 与 lib/clients/ 的关系

| 适配器 | 平台客户端 | 整合方式 |
|--------|-----------|----------|
| KafkaAdapter | `lib/clients/kafka.client.ts` | 适配器创建独立的 `Kafka` 实例（用户配置的 broker），不影响平台内部的 Kafka 客户端 |
| RedisAdapter | `lib/clients/redis.client.ts` | 同上，独立连接 |
| ClickhouseAdapter | `lib/clients/clickhouse.client.ts` | 同上，独立连接 |

原则：**适配器连接的是用户配置的外部系统，平台客户端连接的是平台自身的基础设施**，两者互不干扰。

### 5.2 与 access-layer.service.ts 的整合

`access-layer.service.ts` 中的以下函数需要更新引用：

```typescript
// 旧：import { protocolAdapters } from './protocol-adapters/index';
// 新：import { getAdapter, protocolAdapters } from './protocol-adapters/index';
```

由于新的 `index.ts` 导出了兼容的 `protocolAdapters` 对象，service 层代码**无需修改**。

### 5.3 configSchema 的前端展示

每个适配器的 `configSchema` 定义了前端动态表单的字段结构。前端 `AccessLayerManager.tsx` 已通过 `trpc.accessLayer.getProtocolSchemas` 获取所有 schema 并渲染表单。新适配器只需确保 `configSchema` 格式与 `ProtocolConfigSchema` 接口一致即可。

---

## 六、安全规范

### 6.1 TLS/SSL 统一配置

所有支持 TLS 的适配器必须在 `configSchema.advancedFields` 中包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `tlsEnabled` | boolean | 是否启用 TLS（默认 false） |
| `tlsCaCert` | string | CA 证书内容或路径 |
| `tlsClientCert` | string | 客户端证书（mTLS） |
| `tlsClientKey` | password | 客户端私钥（mTLS） |
| `tlsRejectUnauthorized` | boolean | 是否验证服务器证书（默认 true，生产环境必须 true） |

### 6.2 凭证安全

- 密码和 Token 在 `configSchema` 中使用 `type: 'password'`，前端渲染为密码输入框
- 存储到 `data_connectors.auth_config` 字段时，建议后续接入 Vault 进行加密存储
- 日志和错误信息中通过 `sanitizeConfig()` 脱敏

### 6.3 网络安全

- 所有适配器的 `doTestConnection` 必须设置连接超时（默认 10 秒）
- 资源发现设置更长超时（默认 30 秒）但有上限
- 不允许连接到 `127.0.0.1` / `localhost`（可配置白名单）

---

## 七、错误处理规范

### 7.1 错误分类

| AdapterErrorCode | 触发条件 | 用户提示 |
|-----------------|----------|----------|
| `CONNECTION_REFUSED` | 目标主机拒绝连接（端口未开放、防火墙阻断） | "无法连接到 {host}:{port}，请检查地址和防火墙设置" |
| `TIMEOUT` | 连接或操作超时 | "连接超时，请检查网络连通性或增大超时时间" |
| `AUTH_FAILED` | 认证失败（密码错误、Token 过期、权限不足） | "认证失败，请检查用户名/密码/Token" |
| `PROTOCOL_ERROR` | 协议层错误（版本不兼容、数据格式错误） | "协议错误：{detail}" |
| `RESOURCE_NOT_FOUND` | 资源不存在（数据库/表/Topic/Bucket 不存在） | "资源不存在：{resource}" |
| `INTERNAL_ERROR` | 适配器内部错误 | "内部错误：{detail}" |

### 7.2 错误恢复策略

- **连接失败**：不重试（用户可能配置错误，重试无意义）
- **超时**：不重试（避免堆积）
- **资源发现中的部分失败**：跳过失败的库/表/Topic，返回已成功发现的资源 + 错误摘要
- **健康检查失败**：返回 `unhealthy` 状态，不抛异常

---

## 八、实施计划

### 8.1 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **保留** | `base.ts` | 增加 `createTlsOptions` + `sanitizeConfig` 工具方法 |
| **保留** | `mqtt.adapter.ts` | 增强 configSchema（protocolVersion、rejectUnauthorized） |
| **保留** | `opcua.adapter.ts` | 增强 configSchema（applicationUri、证书路径） |
| **保留** | `modbus.adapter.ts` | 增强 configSchema（RTU 串口配置） |
| **保留** | `mysql.adapter.ts` | 增强 configSchema（charset、timezone） |
| **保留** | `postgresql.adapter.ts` | 增强 configSchema（schema 过滤、applicationName） |
| **保留** | `clickhouse.adapter.ts` | 增强 configSchema（cluster 名称） |
| **保留** | `influxdb.adapter.ts` | 增强 configSchema（写入精度） |
| **新建** | `redis.adapter.ts` | 完整实现（单机/Cluster/Sentinel） |
| **新建** | `neo4j.adapter.ts` | 完整实现（Bolt/Neo4j 协议） |
| **新建** | `qdrant.adapter.ts` | 完整实现（REST API） |
| **新建** | `kafka.adapter.ts` | 完整实现（SASL/SSL） |
| **新建** | `minio.adapter.ts` | 完整实现（S3 兼容） |
| **新建** | `http.adapter.ts` | 完整实现（多种认证方式） |
| **新建** | `grpc.adapter.ts` | 完整实现（Reflection + Health Check） |
| **新建** | `websocket.adapter.ts` | 完整实现（ping/pong） |
| **重写** | `index.ts` | 替换模拟注册表为真实适配器注册 |

### 8.2 质量标准

每个适配器必须满足：

1. **configSchema 完整**：connectionFields + authFields + advancedFields（含 TLS），每个字段有 label、placeholder、description
2. **doTestConnection 真实**：使用真实 npm 库建立连接，返回服务器版本和详细信息
3. **doDiscoverResources 真实**：查询目标系统的元数据，返回结构化的资源列表
4. **doHealthCheck 真实**：检查目标系统的运行状态，返回 healthy/degraded/unhealthy
5. **错误处理完整**：所有异常通过 `normalizeError` 统一为 `AdapterError`
6. **资源清理**：所有连接在 finally 块中关闭，不泄漏
7. **TypeScript 类型安全**：无 `any` 类型，所有参数和返回值有明确类型

---

## 九、总结

本方案的核心是**在已有的良好基础设施（BaseAdapter + ConnectionPool + 错误体系）之上，用 15 个真实的 npm 客户端库替换所有模拟实现**。每个适配器遵循统一的接口规范（configSchema + testConnection + discoverResources + healthCheck），通过注册表模式实现即插即用。

与现有平台的整合采用"独立连接"策略——适配器连接用户配置的外部系统，平台客户端连接平台自身的基础设施，互不干扰。安全方面统一了 TLS 配置规范和凭证脱敏策略。

实施后，用户只需在前端填写连接参数，即可真实连接到任何支持的外部系统，进行连接测试、资源发现和健康监控。
