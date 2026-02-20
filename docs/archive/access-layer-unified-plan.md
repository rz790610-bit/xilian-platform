# XiLian Platform 接入层统一整合方案

> **版本**：v3.0（合并版）  
> **日期**：2026-02-13  
> **定位**：本方案合并 Grok 接入层行动方案 v2.1（基础设施导向）与 Manus 代码库对照分析（应用层导向），以**现有模块整合**为核心，产出一份可直接落地到 xilian-platform 的统一行动方案。

---

## 一、整合背景与核心思路

### 1.1 问题本质

xilian-platform 代码库中已经存在大量与"数据接入"相关的模块，但它们分散在不同的目录层级、不同的菜单入口、不同的数据模型中，形成了**五个孤岛**。Grok 方案 v2.1 从基础设施层面描述了完整的 FSD 风格数据管道，但没有考虑代码库中这些已有模块的整合问题。本方案的核心思路是：**不重新造轮子，而是用一个统一的数据模型和服务层把现有五个孤岛串联起来，同时吸收 v2.1 中 FSD 触发式采集、边缘预处理、闭环迭代等先进理念**。

### 1.2 现有五个孤岛

下表完整列出代码库中与接入层相关的所有现有模块，包括其位置、能力和当前缺陷：

| 孤岛 | 前端位置 | 后端位置 | Schema/表 | 当前能力 | 核心缺陷 |
|------|----------|----------|-----------|----------|----------|
| **A. DataAccess 页面** | `/data/access`（DataAccess.tsx, 743 行） | 无后端 | 无 | 6 种数据源类型（File/DB/API/MQTT/OPC-UA/Modbus）的增删改查 UI | **纯前端 Mock**，`useState` + `mockDataSources`，无持久化，刷新即丢 |
| **B. Pipeline 资源发现** | Pipeline 编排 > 自动发现 Tab | `resource-discovery.service.ts`（10 个 Scanner） | 无 | MySQL/Kafka/Qdrant/ClickHouse/Model/Redis/Neo4j/MinIO/MQTT/Plugin 扫描 | **只扫描不存储**，每次重新扫描，扫描结果无法跨模块共享 |
| **C. 边缘网关管理** | `/edge/gateway`（EdgeNodes.tsx 中的 gateway Tab） | 无后端（Mock 数据） | `edge_gateway_config` + `edge_gateways`（2 张表） | 网关注册、协议列表、心跳监控的 Schema 定义 | 前端是 **Mock 数据**（hardcoded 数组），Schema 有但**无 CRUD 服务** |
| **D. 设备协议/采样配置** | 无独立前端 | `adaptiveSampling.service.ts` | `device_sampling_config` + `device_protocol_config`（2 张表） | 自适应采样算法（容量监控 → 动态调频）、协议连接参数存储 | **与数据源脱钩**——采样配置不知道数据从哪来，协议配置不知道对应哪个连接器 |
| **E. KG 数据层节点** | KG 编排器画布 > 数据层 | `kg-orchestrator.service.ts` | `kg_graph_nodes`（category='data'） | 历史数据/实时数据/知识库三种节点类型 | 仅画布上的**逻辑节点**，`config` 字段为空壳，无法绑定真实数据源 |

此外，还有两个**支撑模块**已经比较完善，可以直接复用：

| 支撑模块 | 后端位置 | Schema/表 | 能力 |
|----------|----------|-----------|------|
| **EventBus 事件总线** | `eventBus.service.ts` + `kafkaEventBus.ts` + `kafka.client.ts` | `event_store` + `event_snapshots` + `outbox_events` + `outbox_routing_config` | Kafka 客户端封装 + 事件发布/订阅 + Outbox 模式 |
| **StreamProcessor 流处理** | `streamProcessor.service.ts` | `processed_events` | 滑动窗口异常检测 + 实时指标计算 |

以及 **DataStream 数据流监控页面**（`/settings/design/datastream`，653 行），已经通过 tRPC 调用 `eventBus` 和 `stream` 路由，展示 Kafka 状态、事件指标、异常检测结果——这是接入层的**可观测性窗口**，已经可用。

### 1.3 整合核心原则

**原则一：统一数据模型，不新建孤岛**。新增的 `data_connectors` / `data_endpoints` / `data_bindings` 三张表是整合的"粘合剂"，所有现有模块通过外键或引用关联到这三张表，而不是各自维护独立的连接配置。

**原则二：复用现有代码，不重写**。Pipeline 的 10 个 Scanner 重构为 ProtocolAdapter 接口的实现；DataAccess 页面的 UI 保留，后端从 Mock 切换到 tRPC；边缘网关表的 Schema 保留，补充 CRUD 服务并关联到 `data_connectors`。

**原则三：渐进式替换，不一步到位**。Node.js 模拟层（EventEmitter、滑动窗口）保持不变，真实中间件（Kafka/EMQX/Flink）通过 Docker Compose 并行部署，通过 `.env` 开关切换。

**原则四：平台层/运维层/业务层分离**。接入层管理服务放在 `server/platform/services/` 下（平台基础能力），协议适配器放在 `server/platform/services/protocol-adapters/` 下，前端配置页面放在系统设置 > 配置中心下。

---

## 二、统一数据模型

### 2.1 三级模型：Connector → Endpoint → Binding

这是整合的核心数据结构。所有现有模块通过 Binding 关联到统一的 Connector/Endpoint，不再各自维护独立的连接信息。

```
┌─────────────────────────────────────────────────────────────────┐
│                    data_connectors（连接器）                       │
│  一个外部系统的接入配置                                              │
│  例：MQTT Broker 192.168.1.50:1883 / MySQL 生产库 / Kafka 集群     │
├─────────────────────────────────────────────────────────────────┤
│  connector_id | name | protocol_type | connection_params(JSON)  │
│  status | health_check_at | created_by | ...                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ 1:N
┌────────────────────────▼────────────────────────────────────────┐
│                    data_endpoints（端点）                          │
│  连接器下的具体资源                                                 │
│  例：Topic sensors/crane01/vib / 表 vibration_raw / Bucket models │
├─────────────────────────────────────────────────────────────────┤
│  endpoint_id | connector_id(FK) | resource_path | data_format   │
│  schema_info(JSON) | sampling_config(JSON) | ...                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ 1:N
┌────────────────────────▼────────────────────────────────────────┐
│                    data_bindings（绑定）                           │
│  端点与平台内部消费者的关联                                          │
│  例：→ Pipeline 节点 / KG 数据层节点 / 设备采样配置 / 边缘网关       │
├─────────────────────────────────────────────────────────────────┤
│  binding_id | endpoint_id(FK) | target_type | target_id          │
│  transform_config(JSON) | status | ...                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 与现有表的关联关系

下表说明三级模型如何与代码库中已有的 113 张表中的关键表建立关联，**不修改现有表结构**，仅通过 Binding 的 `target_type` + `target_id` 实现多态关联：

| 现有表 | 关联方式 | 说明 |
|--------|----------|------|
| `edge_gateway_config` | `data_connectors.source_ref = 'edge_gateway:{gatewayCode}'` | 边缘网关注册时自动创建对应 Connector，双向同步状态 |
| `edge_gateways` | 同上 | 与 `edge_gateway_config` 合并去重后统一关联 |
| `device_protocol_config` | `data_endpoints.protocol_config_id = device_protocol_config.config_id` | 设备协议配置作为 Endpoint 的补充元数据（寄存器映射、轮询间隔） |
| `device_sampling_config` | `data_bindings.target_type = 'sampling_config'` | 采样配置绑定到具体 Endpoint，知道数据从哪来 |
| `kg_graph_nodes`（data 类） | `data_bindings.target_type = 'kg_data_node'` | KG 数据层节点绑定到 Endpoint，从逻辑节点变为真实数据源引用 |
| `asset_sensors` | `data_endpoints.sensor_id = asset_sensors.sensor_id` | 传感器实例关联到具体 Endpoint（哪个 MQTT Topic / Modbus 寄存器） |
| `base_slice_rules` | `data_bindings.target_type = 'slice_rule'` | 切片规则绑定到 Endpoint，触发条件关联到具体数据流 |
| `outbox_routing_config` | 不直接关联，通过 EventBus 间接联动 | Connector 状态变更 → Outbox 事件 → 下游消费 |

### 2.3 新增 Schema 定义

以下三张表新增到 `drizzle/schema.ts`，遵循现有编码规范（驼峰字段名、`varchar` 主键、`json` 配置列、`timestamp(3)` 时间列）：

```typescript
// §14 接入层 - 数据连接器
export const dataConnectors = mysqlTable("data_connectors", {
  id: int("id").autoincrement().primaryKey(),
  connectorId: varchar("connector_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  protocolType: varchar("protocol_type", { length: 32 }).notNull(),
  // 协议枚举：mqtt | opcua | modbus | mysql | postgresql | kafka | clickhouse |
  //           redis | neo4j | minio | influxdb | http | grpc | websocket | qdrant
  connectionParams: json("connection_params").notNull(),
  // JSON 结构因协议而异，由 ProtocolAdapter 定义 Schema
  authConfig: json("auth_config"),
  // 认证配置（用户名密码/证书/Token）
  healthCheckConfig: json("health_check_config"),
  // 健康检查配置（间隔、超时、重试）
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  // draft | testing | connected | disconnected | error
  lastHealthCheck: timestamp("last_health_check", { fsp: 3 }),
  lastError: text("last_error"),
  sourceRef: varchar("source_ref", { length: 128 }),
  // 来源引用：'edge_gateway:{code}' | 'pipeline_scan:{scanId}' | 'manual'
  tags: json("tags"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_dc_protocol").on(table.protocolType),
  index("idx_dc_status").on(table.status),
  index("idx_dc_source_ref").on(table.sourceRef),
]);

// §14 接入层 - 数据端点
export const dataEndpoints = mysqlTable("data_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: varchar("endpoint_id", { length: 64 }).notNull().unique(),
  connectorId: varchar("connector_id", { length: 64 }).notNull(),
  // FK → data_connectors.connector_id
  name: varchar("name", { length: 200 }).notNull(),
  resourcePath: varchar("resource_path", { length: 500 }).notNull(),
  // 资源路径：Topic 名 / 表名 / Bucket/Key / NodeId / 寄存器地址
  resourceType: varchar("resource_type", { length: 32 }).notNull(),
  // topic | table | collection | bucket | register | node | api_path
  dataFormat: varchar("data_format", { length: 32 }).default("json"),
  // json | csv | parquet | binary | protobuf
  schemaInfo: json("schema_info"),
  // 数据结构描述（字段列表、类型、单位）
  samplingConfig: json("sampling_config"),
  // 采样配置（频率、触发条件、缓冲策略）—— 吸收 v2.1 FSD 触发式采集
  preprocessConfig: json("preprocess_config"),
  // 边缘预处理配置（RMS/峰值/谐波计算）—— 吸收 v2.1 边缘预处理
  protocolConfigId: varchar("protocol_config_id", { length: 64 }),
  // 可选 FK → device_protocol_config.config_id（Modbus/OPC-UA 场景）
  sensorId: varchar("sensor_id", { length: 64 }),
  // 可选 FK → asset_sensors.sensor_id（传感器关联）
  status: varchar("status", { length: 32 }).notNull().default("active"),
  discoveredAt: timestamp("discovered_at", { fsp: 3 }),
  // 自动发现时间（Pipeline Scanner 发现的端点）
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_de_connector").on(table.connectorId),
  index("idx_de_resource_type").on(table.resourceType),
  index("idx_de_sensor").on(table.sensorId),
  index("idx_de_status").on(table.status),
]);

// §14 接入层 - 数据绑定
export const dataBindings = mysqlTable("data_bindings", {
  id: int("id").autoincrement().primaryKey(),
  bindingId: varchar("binding_id", { length: 64 }).notNull().unique(),
  endpointId: varchar("endpoint_id", { length: 64 }).notNull(),
  // FK → data_endpoints.endpoint_id
  targetType: varchar("target_type", { length: 32 }).notNull(),
  // pipeline_node | kg_data_node | sampling_config | slice_rule |
  // edge_gateway | stream_processor | event_bus_topic
  targetId: varchar("target_id", { length: 128 }).notNull(),
  // 目标 ID（多态：pipeline 节点 ID / KG 节点 ID / 采样配置 ID 等）
  direction: varchar("direction", { length: 16 }).notNull().default("ingest"),
  // ingest（采集入平台）| egress（平台推出）| bidirectional
  transformConfig: json("transform_config"),
  // 数据转换配置（字段映射、单位转换、过滤条件）
  bufferConfig: json("buffer_config"),
  // 缓冲策略（吸收 v2.1 FSD 智能缓冲：断点续传、弱网容错）
  status: varchar("status", { length: 32 }).notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at", { fsp: 3 }),
  syncStats: json("sync_stats"),
  // 同步统计（消息数/字节数/错误数/延迟）
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_db_endpoint").on(table.endpointId),
  index("idx_db_target").on(table.targetType, table.targetId),
  index("idx_db_status").on(table.status),
]);
```

### 2.4 协议类型枚举

统一平台支持的所有接入协议，合并 DataAccess 页面的 6 种 + Pipeline Scanner 的 10 种 + v2.1 方案的协议列表，去重后共 **15 种**：

| 分类 | 协议 | DataAccess 页面 | Pipeline Scanner | v2.1 方案 | 典型场景 |
|------|------|:-:|:-:|:-:|----------|
| 工业协议 | **MQTT** | 有 | MQTTScanner | EMQX | IoT 传感器实时数据流 |
| | **OPC-UA** | 有 | — | Telegraf | PLC/DCS 工业控制数据 |
| | **Modbus** | 有 | — | Telegraf | 传统工控设备寄存器 |
| 数据库 | **MySQL** | 有(DB) | MySQLTableScanner | 主从 | 结构化业务数据 |
| | **PostgreSQL** | — | — | — | 外部系统对接 |
| | **ClickHouse** | — | ClickHouseTableScanner | 时序特征 | 分析型查询 |
| | **InfluxDB** | — | — | — | 时序数据存储 |
| | **Redis** | — | RedisScanner | 缓存 | 缓存/实时状态 |
| | **Neo4j** | — | Neo4jScanner | — | 图拓扑查询 |
| | **Qdrant** | — | QdrantCollectionScanner | — | 向量检索 |
| 消息队列 | **Kafka** | — | KafkaTopicScanner | KRaft | 事件流/日志聚合 |
| 存储 | **MinIO/S3** | 有(File) | MinIOScanner | Iceberg | 文件/模型/快照 |
| API | **HTTP REST** | 有(API) | — | — | 外部系统对接 |
| | **gRPC** | — | — | — | 高性能服务间通信 |
| | **WebSocket** | — | — | — | 实时双向通信 |

---

## 三、现有模块整合方案

### 3.1 孤岛 A 整合：DataAccess 页面（Mock → 真实 CRUD）

**现状**：DataAccess.tsx 使用 `useState<DataSource[]>(mockDataSources)` 管理 6 个 Mock 数据源，所有操作（添加、删除、同步、测试连接）都是前端内存操作。

**整合方案**：

保留 DataAccess.tsx 的 UI 布局和交互逻辑（743 行代码中约 500 行是 UI），将数据源从 `useState` 切换到 tRPC 查询。具体改动：

| 现有代码 | 整合后 |
|----------|--------|
| `const [dataSources, setDataSources] = useState(mockDataSources)` | `const dataSources = trpc.accessLayer.listConnectors.useQuery()` |
| `handleAddSource()` 内的 `setDataSources([...dataSources, newSource])` | `trpc.accessLayer.createConnector.useMutation()` |
| `handleDeleteSource(id)` | `trpc.accessLayer.deleteConnector.useMutation()` |
| `handleSyncSource(source)` | `trpc.accessLayer.syncConnector.useMutation()` |
| `handleTestConnection(source)` | `trpc.accessLayer.testConnection.useMutation()` |
| `DataSource` 类型（前端定义） | `shared/accessLayerTypes.ts` 中的 `ConnectorWithEndpoints` 类型 |

**前端类型映射**：现有 `DataSourceType` 枚举（`file | database | api | mqtt | opcua | modbus`）映射到 `data_connectors.protocol_type`：

| 现有 DataSourceType | 映射到 protocol_type |
|--------------------|--------------------|
| `file` | `minio` |
| `database` | `mysql`（默认，可选 postgresql/clickhouse） |
| `api` | `http` |
| `mqtt` | `mqtt` |
| `opcua` | `opcua` |
| `modbus` | `modbus` |

### 3.2 孤岛 B 整合：Pipeline 资源发现（Scanner → ProtocolAdapter + 持久化）

**现状**：`resource-discovery.service.ts` 中有 10 个 Scanner 类，每个实现 `ResourceScanner` 接口的 `scan()` 方法，返回 `DiscoveredComponent[]`。扫描结果不持久化，每次打开 Pipeline 编排的"自动发现"Tab 都重新扫描。

**整合方案**：

将 10 个 Scanner 重构为 `ProtocolAdapter` 接口的实现，扫描结果持久化到 `data_connectors` + `data_endpoints`。**不删除 Scanner，而是在 Scanner 内部调用 ProtocolAdapter，Scanner 变成 ProtocolAdapter 的"Pipeline 专用包装器"**。

```
现有流程：
  Pipeline UI → ResourceDiscoveryService.scanAll() → 10 个 Scanner → DiscoveredComponent[]（内存）

整合后流程：
  Pipeline UI → ResourceDiscoveryService.scanAll() → 10 个 Scanner → ProtocolAdapter.discover()
                                                                      ↓
                                                              data_connectors + data_endpoints（持久化）
                                                                      ↓
                                                              DiscoveredComponent[]（返回给 Pipeline UI）
```

**ProtocolAdapter 接口**（新建 `server/platform/services/protocol-adapters/base.adapter.ts`）：

```typescript
export interface ProtocolAdapter {
  readonly protocolType: string;
  
  // 连接测试：验证 connectionParams 是否有效
  testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;
  
  // 资源发现：扫描连接器下的所有可用端点
  discoverEndpoints(connector: DataConnector): Promise<DiscoveredEndpoint[]>;
  
  // 获取配置 Schema：返回该协议需要的配置字段定义（用于前端动态表单）
  getConfigSchema(): ProtocolConfigSchema;
  
  // 健康检查：检测连接器当前状态
  healthCheck(connector: DataConnector): Promise<HealthCheckResult>;
}
```

**Scanner 到 Adapter 的映射**（复用现有扫描逻辑）：

| 现有 Scanner | 对应 ProtocolAdapter | 复用方式 |
|-------------|---------------------|---------|
| `MySQLTableScanner` | `mysql.adapter.ts` | 提取 `scan()` 中的 MySQL 连接和 `SHOW TABLES` 逻辑 |
| `KafkaTopicScanner` | `kafka.adapter.ts` | 提取 Kafka Admin `listTopics()` 逻辑 |
| `QdrantCollectionScanner` | `qdrant.adapter.ts` | 提取 Qdrant `listCollections()` 逻辑 |
| `ClickHouseTableScanner` | `clickhouse.adapter.ts` | 提取 ClickHouse `SHOW TABLES` 逻辑 |
| `ModelRegistryScanner` | 不映射（内部模型注册表，非外部数据源） | 保持独立 Scanner |
| `RedisScanner` | `redis.adapter.ts` | 提取 Redis `SCAN` + `INFO` 逻辑 |
| `Neo4jScanner` | `neo4j.adapter.ts` | 提取 Neo4j `CALL db.labels()` 逻辑 |
| `MinIOScanner` | `minio.adapter.ts` | 提取 MinIO `listBuckets()` 逻辑 |
| `MQTTScanner` | `mqtt.adapter.ts` | 提取 MQTT 连接 + Topic 订阅逻辑 |
| `PluginScanner` | 不映射（插件注册表，非外部数据源） | 保持独立 Scanner |

新增 5 个 Adapter（DataAccess 页面有但 Scanner 没有的协议）：`opcua.adapter.ts`、`modbus.adapter.ts`、`http.adapter.ts`、`grpc.adapter.ts`、`postgresql.adapter.ts`。

### 3.3 孤岛 C 整合：边缘网关（Schema 补 CRUD + 关联 Connector）

**现状**：`edge_gateway_config` 和 `edge_gateways` 两张表有完整 Schema（网关编码、IP、端口、协议列表、心跳间隔等），但前端 EdgeNodes.tsx 的 gateway Tab 使用 hardcoded Mock 数据（`mockGateways` 数组），没有后端 CRUD 服务。

**整合方案**：

**去重**：`edge_gateway_config` 和 `edge_gateways` 两张表字段高度重叠（都有 gatewayType/ipAddress/port/status/firmwareVersion），保留 `edge_gateways` 作为主表（字段更精简），`edge_gateway_config` 作为扩展配置表（额外的 maxDevices/heartbeatInterval/protocols 字段）。

**关联 Connector**：边缘网关本质上是一个"多协议聚合连接器"。每个网关注册时，自动在 `data_connectors` 中创建一条记录，`sourceRef = 'edge_gateway:{gatewayId}'`。网关下的每个协议通道（MQTT/Modbus/OPC-UA）创建对应的 `data_endpoints`。

```
edge_gateways（网关主表）
  ↕ 双向同步
data_connectors（sourceRef = 'edge_gateway:gw-001'）
  ├── data_endpoints（MQTT 通道：sensors/crane01/#）
  ├── data_endpoints（Modbus 通道：寄存器 0-256）
  └── data_endpoints（OPC-UA 通道：ns=2;s=Channel1）
```

**前端改造**：EdgeNodes.tsx 的 gateway Tab 从 Mock 切换到 tRPC 调用，复用 DataAccess 页面的连接器管理组件（避免重复实现连接测试、状态监控等 UI）。

### 3.4 孤岛 D 整合：设备协议/采样配置（关联到 Endpoint）

**现状**：`device_protocol_config` 表存储设备级的协议连接参数（protocolType/connectionParams/registerMap/pollingIntervalMs），`device_sampling_config` 表存储采样策略（samplingInterval/bufferSize/triggerCondition）。两者都有完整 Schema 和后端服务（`adaptiveSampling.service.ts`），但**不知道数据从哪个外部系统来**。

**整合方案**：

**不修改现有表结构**，通过 `data_endpoints` 的 `protocolConfigId` 和 `data_bindings` 的 `target_type = 'sampling_config'` 建立关联：

| 关联 | 方向 | 说明 |
|------|------|------|
| `data_endpoints.protocol_config_id → device_protocol_config.config_id` | Endpoint → 协议配置 | 端点知道用什么协议参数采集数据 |
| `data_bindings(target_type='sampling_config', target_id=configId)` | Endpoint → 采样配置 | 端点知道用什么采样策略 |

**吸收 v2.1 FSD 触发式采集**：`data_endpoints.sampling_config` JSON 字段支持 v2.1 描述的触发式采集配置：

```json
{
  "mode": "triggered",
  "trigger": {
    "type": "threshold",
    "metric": "rms",
    "warningLevel": 4.5,
    "alarmLevel": 7.0
  },
  "buffer": {
    "preTriggerSec": 30,
    "postTriggerSec": 30,
    "maxBufferSizeMB": 100
  },
  "preprocess": {
    "edgeCompute": ["rms", "peak", "kurtosis"],
    "compressionRatio": 5
  }
}
```

这与现有 `adaptiveSampling.service.ts` 的自适应调频逻辑互补：AdaptiveSampling 负责**动态调整采样频率**，FSD 触发式配置负责**决定何时启动高清采集**。

### 3.5 孤岛 E 整合：KG 数据层节点（绑定真实数据源）

**现状**：KG 编排器的数据层有三种节点类型（`historical_data` / `realtime_data` / `knowledge_base`），每种节点在画布上有 `config` 字段，但目前是空壳——用户无法选择"这个实时数据节点对应哪个 MQTT Topic"。

**整合方案**：

在 KG 编排器的节点配置面板中新增"绑定数据源"功能，通过 `data_bindings(target_type='kg_data_node', target_id=nodeId)` 关联。

| KG 数据节点类型 | 可绑定的 Endpoint 类型 | 说明 |
|----------------|----------------------|------|
| `historical_data` | `table`（MySQL/ClickHouse）、`bucket`（MinIO Parquet） | 历史数据查询 |
| `realtime_data` | `topic`（MQTT/Kafka）、`register`（Modbus/OPC-UA） | 实时数据订阅 |
| `knowledge_base` | `collection`（Qdrant/Neo4j） | 知识库检索 |

**前端改造**：KGOrchestrator.tsx 的数据层节点配置面板新增下拉选择器，数据来源为 `trpc.accessLayer.listEndpoints.useQuery({ resourceType: 'topic' })`。选择后创建 Binding 记录。

---

## 四、服务层架构

### 4.1 新增服务文件

遵循平台三层架构（platform/operations/business），接入层管理服务放在平台基础层：

```
server/platform/services/
  ├── access-layer.service.ts              # 接入层统一管理服务（CRUD + 编排）
  └── protocol-adapters/
      ├── base.adapter.ts                  # ProtocolAdapter 接口定义
      ├── adapter-registry.ts              # 适配器注册表（工厂模式）
      ├── mqtt.adapter.ts                  # MQTT（复用 MQTTScanner 逻辑）
      ├── mysql.adapter.ts                 # MySQL（复用 MySQLTableScanner 逻辑）
      ├── kafka.adapter.ts                 # Kafka（复用 KafkaTopicScanner + kafka.client.ts）
      ├── clickhouse.adapter.ts            # ClickHouse（复用 ClickHouseTableScanner + clickhouse.client.ts）
      ├── redis.adapter.ts                 # Redis（复用 RedisScanner + redis.client.ts）
      ├── neo4j.adapter.ts                 # Neo4j（复用 Neo4jScanner）
      ├── minio.adapter.ts                 # MinIO（复用 MinIOScanner）
      ├── qdrant.adapter.ts                # Qdrant（复用 QdrantCollectionScanner）
      ├── opcua.adapter.ts                 # OPC-UA（新建）
      ├── modbus.adapter.ts                # Modbus（新建）
      ├── http.adapter.ts                  # HTTP REST（新建）
      ├── grpc.adapter.ts                  # gRPC（新建）
      └── postgresql.adapter.ts            # PostgreSQL（新建）

server/api/
  └── accessLayer.router.ts                # tRPC 路由

shared/
  └── accessLayerTypes.ts                  # 共享类型定义
```

### 4.2 access-layer.service.ts 核心方法

```typescript
export class AccessLayerService {
  // ===== Connector CRUD =====
  async createConnector(input: CreateConnectorInput): Promise<DataConnector>;
  async updateConnector(connectorId: string, input: UpdateConnectorInput): Promise<DataConnector>;
  async deleteConnector(connectorId: string): Promise<void>;
  async listConnectors(filter?: ConnectorFilter): Promise<DataConnector[]>;
  async getConnectorWithEndpoints(connectorId: string): Promise<ConnectorWithEndpoints>;
  
  // ===== 连接测试 & 健康检查 =====
  async testConnection(connectorId: string): Promise<ConnectionTestResult>;
  // 调用 ProtocolAdapter.testConnection()，更新 connector.status
  async runHealthCheck(connectorId: string): Promise<HealthCheckResult>;
  // 调用 ProtocolAdapter.healthCheck()，更新 lastHealthCheck
  async startHealthCheckScheduler(): Promise<void>;
  // 定时巡检所有 connected 状态的 Connector
  
  // ===== 资源发现 =====
  async discoverEndpoints(connectorId: string): Promise<DiscoveredEndpoint[]>;
  // 调用 ProtocolAdapter.discoverEndpoints()，结果写入 data_endpoints
  // 这就是 Pipeline Scanner 的持久化版本
  
  // ===== Endpoint CRUD =====
  async listEndpoints(filter?: EndpointFilter): Promise<DataEndpoint[]>;
  async createEndpoint(input: CreateEndpointInput): Promise<DataEndpoint>;
  async updateEndpoint(endpointId: string, input: UpdateEndpointInput): Promise<DataEndpoint>;
  
  // ===== Binding 管理 =====
  async createBinding(input: CreateBindingInput): Promise<DataBinding>;
  async deleteBinding(bindingId: string): Promise<void>;
  async listBindingsByEndpoint(endpointId: string): Promise<DataBinding[]>;
  async listBindingsByTarget(targetType: string, targetId: string): Promise<DataBinding[]>;
  // 例：查询某个 KG 数据层节点绑定了哪些数据源
  
  // ===== 跨模块联动 =====
  async syncFromEdgeGateway(gatewayId: string): Promise<DataConnector>;
  // 从 edge_gateways 表同步创建/更新 Connector
  async syncFromPipelineScan(scanResults: DiscoveredComponent[]): Promise<DataConnector[]>;
  // 从 Pipeline 扫描结果批量创建 Connector + Endpoint
  
  // ===== 统计 =====
  async getAccessLayerStats(): Promise<AccessLayerStats>;
  // 连接器总数/协议分布/健康状态分布/绑定数量
}
```

### 4.3 与现有服务的调用关系

```
┌──────────────────────────────────────────────────────────────────┐
│                     前端页面层                                     │
│  DataAccess.tsx  │  EdgeNodes.tsx  │  KGOrchestrator.tsx          │
│  PipelineEditor  │  DataStream.tsx │                              │
└────────┬─────────┴────────┬────────┴──────────┬──────────────────┘
         │ tRPC             │ tRPC              │ tRPC
┌────────▼─────────────────────────────────────────────────────────┐
│                  accessLayer.router.ts                            │
└────────┬─────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│              access-layer.service.ts（新建）                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Connector CRUD   │  │ Endpoint CRUD   │  │ Binding CRUD    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                     │            │
│  ┌────────▼────────────────────▼─────────────────────▼────────┐  │
│  │              ProtocolAdapter Registry（新建）                │  │
│  │  mqtt │ mysql │ kafka │ clickhouse │ redis │ neo4j │ ...   │  │
│  └────────┬────────────────────┬─────────────────────┬────────┘  │
└───────────┼────────────────────┼─────────────────────┼───────────┘
            │ 复用               │ 复用                │ 复用
┌───────────▼──────┐  ┌─────────▼────────┐  ┌─────────▼──────────┐
│ kafka.client.ts  │  │ clickhouse       │  │ redis.client.ts    │
│ kafkaEventBus.ts │  │ .client.ts       │  │                    │
│ (现有)           │  │ (现有)           │  │ (现有)             │
└──────────────────┘  └──────────────────┘  └────────────────────┘
            │                    │                     │
┌───────────▼──────┐  ┌─────────▼────────┐  ┌─────────▼──────────┐
│ resource-        │  │ adaptiveSampling │  │ eventBus.service   │
│ discovery        │  │ .service.ts      │  │ .ts                │
│ .service.ts      │  │ (现有)           │  │ (现有)             │
│ (现有，改造)     │  └──────────────────┘  └────────────────────┘
└──────────────────┘
```

---

## 五、前端整合方案

### 5.1 菜单结构调整

接入层管理入口放在**系统设置 > 配置中心**下（遵循"设计工具/配置/状态/安全"四分类），同时保留 DataAccess 页面在"数据中心"下作为快捷入口：

| 菜单位置 | 页面 | 功能 |
|----------|------|------|
| 数据中心 > 数据接入 | `/data/access`（改造） | 连接器管理的快捷入口（面向数据工程师） |
| 系统设置 > 配置中心 > 接入层管理 | `/settings/config/access-layer`（新建） | 完整的接入层管理（连接器 + 端点 + 绑定 + 健康监控） |
| 系统设置 > 状态监控 > 数据流监控 | `/settings/design/datastream`（现有） | 数据流实时监控（Kafka/EventBus/StreamProcessor） |
| 边缘计算 > 边缘网关 | `/edge/gateway`（改造） | 网关管理（关联到 Connector） |

### 5.2 组件复用

为避免多个页面重复实现相同的 UI 组件，抽取以下共享组件：

| 共享组件 | 使用位置 | 功能 |
|----------|----------|------|
| `ConnectorCard` | DataAccess、接入层管理、边缘网关 | 连接器卡片（状态指示灯、协议图标、操作按钮） |
| `ConnectionTestDialog` | DataAccess、接入层管理 | 连接测试对话框（实时日志输出） |
| `EndpointSelector` | KG 编排器、Pipeline 编排 | 端点选择器（按协议/类型过滤） |
| `ProtocolConfigForm` | DataAccess、接入层管理 | 动态协议配置表单（根据 `getConfigSchema()` 渲染） |
| `BindingManager` | 接入层管理 | 绑定关系管理（显示端点被哪些模块引用） |

---

## 六、吸收 v2.1 FSD 先进理念

Grok 方案 v2.1 中的以下理念通过数据模型和配置字段吸收到平台中，**不需要立即部署真实中间件**，但数据结构已预留：

| v2.1 理念 | 落地位置 | 实现方式 |
|-----------|----------|---------|
| **触发式采集**（非全时录制，异常时采集前后 30s） | `data_endpoints.sampling_config.mode = 'triggered'` | 配置存储在 Endpoint 上，边缘网关/Telegraf 读取执行 |
| **边缘预处理**（RMS/峰值/谐波计算，压缩 5-10x） | `data_endpoints.preprocess_config.edgeCompute` | 配置存储在 Endpoint 上，边缘节点读取执行 |
| **智能缓冲**（断点续传 + 弱网容错） | `data_bindings.buffer_config` | 缓冲策略配置在 Binding 上，传输层读取执行 |
| **自动切片/标注** | `base_slice_rules` + `data_bindings(target_type='slice_rule')` | 切片规则绑定到 Endpoint，Flink/StreamProcessor 执行 |
| **闭环迭代**（数据 → 模型 → 调整阈值） | `model_registry` → `model_deployments` → `data_endpoints.sampling_config` | 模型部署后自动更新采样阈值（通过 EventBus 事件驱动） |
| **FSD 容错**（指数退避、死信队列） | `outbox_routing_config` + `saga_dead_letters` | 现有 Outbox/Saga 机制已完整实现 |

---

## 七、Docker Compose 部署文件（并行推进）

此部分对应 v2.1 阶段 1，可以与应用层开发并行推进。新建 `docker/` 目录：

```
docker/
  ├── docker-compose.yml          # 完整中间件编排
  ├── docker-compose.dev.yml      # 开发环境（仅 MySQL + Redis）
  ├── .env.template               # 环境变量模板
  ├── init/
  │   ├── mysql-init.sql          # 由 drizzle-kit push 生成，此处仅做参考
  │   ├── neo4j-schema.cypher     # Neo4j TAG/EDGE/INDEX（替代 v2.1 的 Nebula）
  │   ├── clickhouse-init.sql     # 时序特征表 DDL
  │   └── emqx-kafka-bridge.conf  # EMQX → Kafka 桥接配置
  └── telegraf/
      ├── telegraf.conf           # 高频振动/电流采集配置
      └── telegraf-lowfreq.conf   # 低频温度/巡检采集配置
```

**关键决策**：沿用 **Neo4j** 替代 v2.1 的 Nebula（代码库已有完整集成，KG 编排器刚做完）。其余中间件（MySQL/Kafka/ClickHouse/MinIO/EMQX/Redis/Flink/Prometheus）与 v2.1 保持一致。

---

## 八、实施计划

### 8.1 分期概览

| 期 | 名称 | 时间 | 核心交付 | 依赖 |
|----|------|------|----------|------|
| **第 1 期** | 数据模型 + 服务骨架 | 1-2 天 | Schema 3 张表 + 类型定义 + access-layer.service + accessLayer.router + 注册到 routers.ts | 无 |
| **第 2 期** | 协议适配器 + Scanner 重构 | 2-3 天 | 8 个 Adapter（复用 Scanner）+ 5 个新 Adapter + adapter-registry + resource-discovery 改造 | 第 1 期 |
| **第 3 期** | 前端整合 | 2-3 天 | DataAccess 页面改造 + 接入层管理页面 + 共享组件 + EdgeNodes gateway Tab 改造 | 第 2 期 |
| **第 4 期** | 跨模块绑定 | 1-2 天 | KG 数据层节点绑定 + Pipeline 自动发现持久化 + 设备采样关联 | 第 3 期 |
| **第 5 期** | Docker Compose + 真实中间件 | 2-3 天 | docker-compose.yml + 初始化脚本 + .env 切换 | 可与 1-4 期并行 |

### 8.2 第 1 期详细任务

| 序号 | 文件 | 动作 | 说明 |
|------|------|------|------|
| 1 | `drizzle/schema.ts` | 追加 | 新增 `dataConnectors` + `dataEndpoints` + `dataBindings` 3 张表 |
| 2 | `shared/accessLayerTypes.ts` | 新建 | 协议枚举、Connector/Endpoint/Binding 类型、配置 Schema 接口 |
| 3 | `server/platform/services/access-layer.service.ts` | 新建 | CRUD + testConnection + discoverEndpoints + Binding 管理 |
| 4 | `server/platform/services/protocol-adapters/base.adapter.ts` | 新建 | ProtocolAdapter 接口定义 |
| 5 | `server/platform/services/protocol-adapters/adapter-registry.ts` | 新建 | 适配器注册表（工厂模式） |
| 6 | `server/api/accessLayer.router.ts` | 新建 | tRPC 路由（Connector/Endpoint/Binding CRUD + testConnection + discover） |
| 7 | `server/routers.ts` | 修改 | 注册 `accessLayer: accessLayerRouter` |

### 8.3 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Scanner 重构引入回归 | Pipeline 自动发现功能受影响 | Scanner 保持原有接口不变，内部委托给 Adapter，渐进式迁移 |
| 边缘网关两张表去重 | 现有引用可能断裂 | 第一阶段不删表，通过 `sourceRef` 软关联，后续版本再合并 |
| 15 种协议适配器工作量大 | 开发周期超预期 | 优先实现 MQTT/MySQL/Kafka/ClickHouse/MinIO 5 个核心协议，其余按需补充 |
| DataAccess 页面改造影响用户 | 用户看到空列表 | 改造时保留 Mock 数据作为"示例连接器"自动创建到数据库 |

---

## 九、总结

本方案的核心价值在于**不新建孤岛，而是用 Connector → Endpoint → Binding 三级模型把现有五个分散模块串联成一个统一的接入层**。具体来说：

DataAccess 页面从 Mock 升级为真实 CRUD，成为接入层的**用户操作入口**。Pipeline 的 10 个 Scanner 重构为 ProtocolAdapter，扫描结果持久化，成为接入层的**自动发现引擎**。边缘网关通过 `sourceRef` 关联到 Connector，成为接入层的**边缘接入点**。设备协议/采样配置通过 Binding 关联到 Endpoint，成为接入层的**采集策略层**。KG 数据层节点通过 Binding 绑定真实数据源，成为接入层的**消费端**。

v2.1 方案中的 FSD 触发式采集、边缘预处理、智能缓冲、闭环迭代等先进理念，通过 `data_endpoints` 和 `data_bindings` 的 JSON 配置字段预留，无需立即部署真实中间件即可完成数据模型设计。Docker Compose 部署文件作为独立工作流并行推进。
