# 接入层整合方案建议

> **目标**：将平台现有的数据接入能力（DataAccess 页面、Pipeline 资源发现、边缘网关配置、设备采样配置）统一整合为一个完整的**接入层（Access Layer）**，覆盖接口、协议、配置参数存储三个核心维度。

---

## 一、现状分析

当前平台的数据接入能力分散在多个模块中，各自独立、互不感知：

| 模块 | 位置 | 能力 | 问题 |
|------|------|------|------|
| **DataAccess 页面** | `/data/access` | 6 种数据源类型（File/DB/API/MQTT/OPC-UA/Modbus）的增删改查 | 纯前端 Mock，无后端持久化，无真实连接 |
| **Pipeline 资源发现** | Pipeline 编排 > 自动发现 Tab | 10 个 Scanner（MySQL/Kafka/Qdrant/ClickHouse/Model/Redis/Neo4j/MinIO/MQTT/Plugin） | 只扫描不存储，每次重新扫描，无配置管理 |
| **边缘网关配置** | `edge_gateway_config` 表 | 网关注册、协议列表、心跳监控 | 有 Schema 但无前端管理界面 |
| **设备采样配置** | `device_sampling_config` 表 | 传感器采样率、寄存器映射、预处理规则 | 有 Schema 但与数据源脱钩 |
| **KG 数据层节点** | 知识图谱编排 > 数据层 | 历史数据/实时数据/知识库三种节点 | 仅画布上的逻辑节点，无法绑定真实数据源 |

**核心矛盾**：前端有 6 种协议的配置表单，后端有 10 个资源扫描器，数据库有网关和采样配置表，但三者之间没有统一的数据模型和管理入口。用户在 DataAccess 配置了一个 MQTT 数据源，Pipeline 编排看不到，知识图谱的数据层节点也绑定不上。

---

## 二、整合方案：三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    接入层统一管理                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ 协议适配器 │  │ 接口注册表 │  │ 配置参数库 │               │
│  │ Protocol  │  │ Endpoint  │  │ Config   │               │
│  │ Adapters  │  │ Registry  │  │ Store    │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│  ┌────┴──────────────┴──────────────┴────┐               │
│  │        data_connectors 统一表          │               │
│  │  (协议+接口+配置+状态+健康检查)         │               │
│  └───────────────────────────────────────┘               │
│       ↑              ↑              ↑                     │
│  Pipeline编排   KG数据层节点   DataAccess页面              │
│  (自动发现)    (绑定数据源)    (手动配置)                   │
└─────────────────────────────────────────────────────────┘
```

### 2.1 协议层（Protocol Adapters）

统一定义平台支持的所有接入协议，每种协议有标准化的配置 Schema 和连接测试方法。

| 协议分类 | 协议 | 方向 | 典型场景 |
|----------|------|------|----------|
| **工业协议** | MQTT | 双向 | IoT 传感器实时数据流 |
| | OPC-UA | 读取 | PLC/DCS 工业控制数据 |
| | Modbus TCP/RTU | 读取 | 传统工控设备寄存器 |
| **数据库协议** | MySQL/PostgreSQL | 读写 | 结构化业务数据 |
| | InfluxDB/TimescaleDB | 读写 | 时序数据存储 |
| | ClickHouse | 读取 | 分析型查询 |
| | Redis | 读写 | 缓存/实时状态 |
| **消息协议** | Kafka | 双向 | 事件流/日志聚合 |
| **存储协议** | MinIO/S3 | 读写 | 文件/模型/快照 |
| **API 协议** | REST HTTP | 双向 | 外部系统对接 |
| | gRPC | 双向 | 高性能服务间通信 |
| | WebSocket | 双向 | 实时推送/边缘通信 |
| **图数据库** | Neo4j Bolt | 读写 | 知识图谱存储 |
| | Qdrant HTTP | 读写 | 向量检索 |

每种协议对应一个 **Adapter 类**，实现统一接口：

```typescript
interface ProtocolAdapter {
  protocol: string;                           // 协议标识
  configSchema: ConnectorConfigSchema;        // 配置参数 JSON Schema
  testConnection(config: object): Promise<ConnectionTestResult>;  // 连接测试
  discover(config: object): Promise<DiscoveredResource[]>;        // 资源发现
  createReader?(config: object): DataReader;   // 数据读取（可选）
  createWriter?(config: object): DataWriter;   // 数据写入（可选）
}
```

### 2.2 接口层（Endpoint Registry）

每个接入点（Connector）是一个具体的连接实例，注册到统一的接口注册表中。

**核心概念**：

- **Connector**（连接器）：一个具体的数据接入实例，例如"车间1号 MQTT Broker"或"生产数据库 MySQL"
- **Endpoint**（端点）：Connector 下的具体资源，例如 MQTT 的某个 Topic、MySQL 的某张表、OPC-UA 的某个 NodeId
- **Binding**（绑定）：将 Endpoint 关联到平台内部的消费者（Pipeline 节点、KG 数据层节点、设备采样配置等）

```
Connector (MQTT Broker 192.168.1.50:1883)
  ├── Endpoint: sensors/crane01/vibration
  │     ├── Binding → Pipeline "振动数据采集流"
  │     └── Binding → KG 数据层节点 "实时振动数据"
  ├── Endpoint: sensors/crane01/temperature
  │     └── Binding → Pipeline "温度监控流"
  └── Endpoint: alerts/#
        └── Binding → 事件总线
```

### 2.3 配置参数存储（Config Store）

所有接入配置统一持久化到数据库，取代当前的前端 Mock 数据。

**新增 3 张核心表**：

```sql
-- 1. 连接器表：一个连接器 = 一个外部系统的接入配置
data_connectors (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  connector_id    VARCHAR(64) NOT NULL UNIQUE,    -- 业务ID (dc_xxx)
  name            VARCHAR(200) NOT NULL,           -- 显示名称
  protocol        VARCHAR(32) NOT NULL,            -- 协议类型 (mqtt/opcua/modbus/mysql/kafka/...)
  category        ENUM('industrial','database','message','storage','api','graph') NOT NULL,
  description     TEXT,
  
  -- 连接参数（加密存储敏感字段）
  host            VARCHAR(256),
  port            INT,
  connection_config JSON NOT NULL,                 -- 协议特定配置（按 configSchema 校验）
  auth_config     JSON,                            -- 认证配置（加密）
  
  -- 状态
  status          ENUM('connected','disconnected','error','testing') DEFAULT 'disconnected',
  health_score    TINYINT DEFAULT 0,               -- 健康评分 0-100
  last_health_check TIMESTAMP(3),
  last_error      TEXT,
  
  -- 运行参数
  retry_policy    JSON,                            -- 重试策略 {maxRetries, backoffMs, ...}
  sync_interval   INT,                             -- 同步间隔(秒)，0=实时
  timeout_ms      INT DEFAULT 30000,
  
  -- 来源追踪
  source          ENUM('manual','auto_discover','import','edge_sync') DEFAULT 'manual',
  gateway_id      VARCHAR(64),                     -- 关联的边缘网关（如有）
  
  -- 标签和分组
  tags            JSON,
  group_name      VARCHAR(128),
  
  created_by      VARCHAR(64),
  created_at      TIMESTAMP(3) DEFAULT NOW(),
  updated_at      TIMESTAMP(3) DEFAULT NOW() ON UPDATE NOW()
);

-- 2. 端点表：连接器下的具体资源
data_endpoints (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  endpoint_id     VARCHAR(64) NOT NULL UNIQUE,     -- 业务ID (ep_xxx)
  connector_id    VARCHAR(64) NOT NULL,             -- 所属连接器
  name            VARCHAR(200) NOT NULL,
  resource_path   VARCHAR(512) NOT NULL,            -- 资源路径 (topic/table/nodeId/bucket...)
  resource_type   VARCHAR(64),                      -- 资源类型 (topic/table/collection/bucket/...)
  direction       ENUM('read','write','readwrite') DEFAULT 'read',
  
  -- 端点特定配置
  endpoint_config JSON,                             -- 端点级配置（QoS/过滤条件/字段映射...）
  data_schema     JSON,                             -- 数据结构描述（字段名/类型/单位）
  
  -- 采样/同步配置
  sampling_rate_ms INT,                             -- 采样间隔(毫秒)
  buffer_size     INT,                              -- 缓冲区大小
  preprocessing   JSON,                             -- 预处理规则
  
  -- 状态
  status          ENUM('active','inactive','error') DEFAULT 'inactive',
  last_data_at    TIMESTAMP(3),                     -- 最后收到数据时间
  message_count   BIGINT DEFAULT 0,                 -- 累计消息数
  
  created_at      TIMESTAMP(3) DEFAULT NOW(),
  updated_at      TIMESTAMP(3) DEFAULT NOW() ON UPDATE NOW(),
  
  INDEX idx_de_ci (connector_id),
  INDEX idx_de_s (status)
);

-- 3. 绑定表：端点与平台内部消费者的关联
data_bindings (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  binding_id      VARCHAR(64) NOT NULL UNIQUE,
  endpoint_id     VARCHAR(64) NOT NULL,             -- 绑定的端点
  target_type     ENUM('pipeline_node','kg_data_node','device_sampling','event_bus','custom') NOT NULL,
  target_id       VARCHAR(64) NOT NULL,             -- 目标ID（pipeline节点ID/KG节点ID/...）
  target_name     VARCHAR(200),
  
  -- 绑定配置
  transform_rules JSON,                             -- 数据转换规则
  filter_expr     VARCHAR(512),                     -- 过滤表达式
  
  status          ENUM('active','paused','error') DEFAULT 'active',
  created_at      TIMESTAMP(3) DEFAULT NOW(),
  
  INDEX idx_db_ei (endpoint_id),
  INDEX idx_db_tt (target_type, target_id)
);
```

---

## 三、与现有模块的整合点

### 3.1 DataAccess 页面改造

**现状**：纯前端 Mock，6 种数据源类型的配置表单。

**改造**：
- 前端表单保留，后端对接 `data_connectors` 表的 CRUD
- 新增"连接测试"按钮，调用对应 ProtocolAdapter 的 `testConnection`
- 新增"资源发现"按钮，自动扫描 Connector 下的 Endpoint（如 MQTT 的 Topic 列表、MySQL 的表列表）
- 新增"端点管理"子面板，管理每个 Connector 下的 Endpoint
- 状态从 Mock 改为实时健康检查

### 3.2 Pipeline 资源发现整合

**现状**：10 个独立 Scanner，每次扫描结果不持久化。

**改造**：
- Scanner 扫描结果写入 `data_connectors` + `data_endpoints`（source = 'auto_discover'）
- Pipeline 组件面板的"自动发现"Tab 改为从 `data_connectors` 读取
- Pipeline 节点绑定数据源时，创建 `data_bindings` 记录
- 好处：扫描一次，全平台可用；不再每次重复扫描

### 3.3 KG 数据层节点绑定

**现状**：知识图谱编排器的数据层节点（历史数据/实时数据/知识库）只有配置参数，无法绑定真实数据源。

**改造**：
- 数据层节点的配置面板新增"绑定数据源"下拉框，从 `data_connectors` 中选择
- 选择后自动填充连接参数，并创建 `data_bindings`（target_type = 'kg_data_node'）
- 诊断运行时，通过 Binding 获取真实数据

### 3.4 边缘网关整合

**现状**：`edge_gateway_config` 表已有网关注册信息，但与数据源脱钩。

**改造**：
- 边缘网关注册时，自动在 `data_connectors` 中创建关联记录（source = 'edge_sync'，gateway_id 指向网关）
- 网关上报的协议列表（MQTT/Modbus/OPC-UA）自动生成对应的 Connector
- 网关心跳状态同步到 Connector 的 health_score

### 3.5 设备采样配置整合

**现状**：`device_sampling_config` 表有采样率、寄存器映射等配置。

**改造**：
- 采样配置关联到 `data_endpoints`（通过 endpoint 字段 + register_map）
- 自适应采样调整时，同步更新 Endpoint 的 sampling_rate_ms
- 设备采样配置页面可直接跳转到对应的 Connector/Endpoint 管理

---

## 四、后端服务设计

新增一个统一的接入层服务：

```
server/services/access-layer.service.ts        # 接入层核心服务
server/services/protocol-adapters/              # 协议适配器目录
  ├── mqtt.adapter.ts
  ├── opcua.adapter.ts
  ├── modbus.adapter.ts
  ├── mysql.adapter.ts
  ├── kafka.adapter.ts
  ├── redis.adapter.ts
  ├── clickhouse.adapter.ts
  ├── neo4j.adapter.ts
  ├── qdrant.adapter.ts
  ├── minio.adapter.ts
  ├── http.adapter.ts
  └── index.ts                                  # 适配器注册表
server/api/accessLayer.router.ts                # tRPC 路由
shared/accessLayerTypes.ts                      # 共享类型定义
```

**access-layer.service.ts 核心方法**：

```typescript
// Connector CRUD
listConnectors(filters): Promise<{items, total}>
getConnector(connectorId): Promise<Connector>
createConnector(data): Promise<string>
updateConnector(connectorId, data): Promise<void>
deleteConnector(connectorId): Promise<void>

// 连接测试 & 健康检查
testConnection(connectorId): Promise<ConnectionTestResult>
runHealthCheck(connectorId): Promise<HealthCheckResult>
batchHealthCheck(): Promise<HealthCheckSummary>

// 资源发现
discoverEndpoints(connectorId): Promise<DiscoveredEndpoint[]>
importEndpoints(connectorId, endpoints): Promise<void>

// Endpoint CRUD
listEndpoints(connectorId): Promise<Endpoint[]>
createEndpoint(data): Promise<string>
updateEndpoint(endpointId, data): Promise<void>
deleteEndpoint(endpointId): Promise<void>

// Binding 管理
bindEndpoint(endpointId, target): Promise<string>
unbindEndpoint(bindingId): Promise<void>
listBindings(endpointId): Promise<Binding[]>
getBindingsForTarget(targetType, targetId): Promise<Binding[]>

// 与现有 ResourceDiscovery 整合
syncFromResourceDiscovery(): Promise<SyncResult>  // 将扫描结果写入 data_connectors
```

---

## 五、前端页面规划

### 方案 A：改造现有 DataAccess 页面（推荐）

将 `/data/access` 页面从纯 Mock 升级为完整的接入层管理中心：

| Tab | 内容 |
|-----|------|
| **连接器** | Connector 列表（卡片/表格视图），按协议分类筛选，连接测试，健康状态 |
| **端点** | 选中 Connector 后展示其下所有 Endpoint，支持资源发现和手动添加 |
| **绑定** | 查看所有 Binding 关系，支持按目标类型筛选（Pipeline/KG/设备/事件总线） |
| **监控** | 接入层整体健康看板：连接数、消息吞吐、错误率、延迟分布 |

### 方案 B：在设计工具中新增"接入层编排"

类似 Pipeline 编排和 KG 编排，新增一个可视化的接入层编排工具。但考虑到接入层更偏配置管理而非流程编排，**方案 A 更务实**。

---

## 六、实施建议（分 3 期）

### 第 1 期：数据模型 + 基础 CRUD（1-2 天）

1. 新增 3 张表（`data_connectors` / `data_endpoints` / `data_bindings`）到 schema
2. 新增 `shared/accessLayerTypes.ts` 共享类型
3. 新增 `access-layer.service.ts` 基础 CRUD
4. 新增 `accessLayer.router.ts` tRPC 路由
5. 改造 DataAccess 页面，从 Mock 切换到 tRPC 调用

### 第 2 期：协议适配器 + 连接测试（2-3 天）

1. 实现 ProtocolAdapter 接口和 5 个核心适配器（MQTT/MySQL/Kafka/OPC-UA/Modbus）
2. 连接测试功能
3. 资源发现功能（Connector → 自动发现 Endpoint）
4. 整合现有 ResourceDiscovery Scanner（复用扫描逻辑，结果写入 data_connectors）

### 第 3 期：跨模块绑定 + 监控（2-3 天）

1. Pipeline 节点绑定数据源（data_bindings）
2. KG 数据层节点绑定数据源
3. 边缘网关自动同步
4. 设备采样配置关联
5. 接入层健康监控面板

---

## 七、与 KG 编排器的协同

接入层整合完成后，知识图谱编排器的数据层节点将获得真正的数据接入能力：

```
知识图谱编排器
  └── 数据层节点（实时数据）
        └── 绑定 → data_endpoints (MQTT sensors/crane01/vibration)
              └── 属于 → data_connectors (MQTT Broker 192.168.1.50)
                    └── 协议适配器 → MQTTAdapter
                          └── 真实数据流入
```

这样，用户在 KG 编排器中拖入一个"实时数据"节点，配置面板中直接选择已注册的数据源，诊断运行时就能获取真实的传感器数据，而不是 Mock 数据。

---

## 八、总结

| 维度 | 现状 | 整合后 |
|------|------|--------|
| **接口** | DataAccess 前端 Mock + Pipeline Scanner 临时扫描 | 统一 Connector/Endpoint/Binding 三级模型 |
| **协议** | 前端定义 6 种 + Scanner 扫描 10 种，互不相通 | 统一 ProtocolAdapter 接口，14 种协议标准化 |
| **配置存储** | 前端 Mock + edge_gateway_config + device_sampling_config 分散 | `data_connectors` 统一存储，关联网关和采样配置 |
| **跨模块** | 各模块独立配置，数据源不共享 | 一处配置，Pipeline/KG/设备/事件总线共用 |
