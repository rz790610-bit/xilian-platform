# 数据库架构检视报告：MySQL ↔ ClickHouse 关联方案对齐分析

> 检视日期：2026-02-17  
> 检视范围：MySQL 元数据表、ClickHouse 时序表、Redis 缓存、Docker 基础设施  
> 对照标准：用户提供的 5 种 MySQL ↔ ClickHouse 关联方案（方案A 路径一致 + 方案B 宽表 + 元数据列）

---

## 一、现有架构总览

### 1.1 存储引擎矩阵

| 存储引擎 | 版本 | 职责 | 容器名 | 端口 |
|----------|------|------|--------|------|
| **MySQL** | 8.x | 元数据/配置/组织结构/设备树/分类字典 | portai-mysql | 3306 |
| **ClickHouse** | 24.3 | 高频时序数据/聚合指标/异常检测 | xilian-clickhouse | 8123/9000 |
| **Redis** | 7.x | 会话/限流/传感器缓存/设备状态缓存 | portai-redis | 6379 |
| **Neo4j** | 5.x | 知识图谱/故障传播路径 | - | 7474/7687 |
| **Elasticsearch** | 8.x | 全文检索/日志 | - | 9200 |
| **Qdrant** | - | 向量检索（知识库嵌入） | - | 6333 |
| **MinIO** | - | 对象存储（文件/模型） | - | 9000 |
| **Kafka** | - | 消息队列（数据流） | - | 9092 |

### 1.2 MySQL 核心表（与时序关联相关）

| 表名 | 行数(schema) | 关键字段 | 说明 |
|------|-------------|----------|------|
| `asset_nodes` | 31 列 | `node_id`, `code`, `path`, `level_codes`, `department` | **设备树节点**（核心关联表） |
| `asset_measurement_points` | 20 列 | `mp_id`, `node_id`, `device_code`, `measurement_type` | **测点定义** |
| `asset_sensors` | 35 列 | `sensor_id`, `device_code`, `mp_id`, `manufacturer`, `model` | **传感器实例** |
| `base_dict_categories` | 13 列 | `code`, `name` | **分类字典类别** |
| `base_dict_items` | 17 列 | `category_code`, `code`, `label`, `value` | **分类字典项** |
| `base_code_rules` | 13 列 | `rule_code`, `segments`, `current_sequences` | **编码规则** |
| `base_node_templates` | ~20 列 | `template_code`, `node_type` | **节点类型模板** |
| `base_mp_templates` | ~20 列 | `template_code`, `measurement_type` | **测点模板** |
| `device_sampling_config` | ~15 列 | `device_code`, `sample_rate`, `protocol` | **采样配置** |

### 1.3 ClickHouse 现有表

| 表名 | 关键列 | ORDER BY | 分区 | TTL | 说明 |
|------|--------|----------|------|-----|------|
| `sensor_readings` | `device_id`, `sensor_id`, `metric_name`, `value` | (device_id, sensor_id, metric_name, timestamp) | toYYYYMM | 90天 | **传感器原始读数** |
| `telemetry_data` | `device_id`, `sensor_id`, `metric_name`, `value`, `batch_id`, `source` | (device_id, timestamp, sensor_id) | toYYYYMMDD | 365天 | **遥测数据** |
| `vibration_features` | `device_code`, `mp_code`, `rms`, `peak`, `kurtosis`, `temperature`, `rpm`, `gateway_id` | (device_code, mp_code, timestamp) | toYYYYMM | 2年 | **振动特征（v4新增）** |
| `anomaly_detections` | `device_id`, `sensor_id`, `algorithm_type`, `score`, `severity` | (device_id, sensor_id, timestamp) | toYYYYMM | 180天 | **异常检测结果** |
| `alert_event_log` | `device_code`, `alert_type`, `severity`, `value` | (device_code, timestamp) | toYYYYMM | 2年 | **告警事件（v4新增）** |
| `device_status_history` | `device_id`, `status`, `previous_status` | (device_id, timestamp) | toYYYYMM | 365天 | **设备状态历史** |
| `event_logs` | `topic`, `event_type`, `device_id` | (topic, event_type, timestamp) | toYYYYMM | 90天 | **系统事件日志** |
| `data_quality_metrics` | `device_code`, `mp_code`, `completeness`, `accuracy` | (device_code, timestamp) | toYYYYMM | 1年 | **数据质量指标（v4新增）** |
| `query_performance_log` | `query_type`, `duration_ms` | (query_type, timestamp) | toYYYYMM | 90天 | **查询性能日志（v4新增）** |

**物化视图（聚合）：**

| 视图名 | 引擎 | 粒度 | 说明 |
|--------|------|------|------|
| `sensor_readings_1m` | SummingMergeTree | 1分钟 | 传感器读数分钟聚合 |
| `sensor_readings_1h` | SummingMergeTree | 1小时 | 传感器读数小时聚合 |
| `sensor_readings_1d` | SummingMergeTree | 1天 | 传感器读数天聚合 |
| `vibration_features_1min_agg` | AggregatingMergeTree | 1分钟 | 振动特征分钟聚合 |
| `vibration_features_1hour_agg` | AggregatingMergeTree | 1小时 | 振动特征小时聚合 |
| `device_daily_summary` | AggregatingMergeTree | 1天 | 设备日统计 |
| `alert_hourly_stats` | AggregatingMergeTree | 1小时 | 告警小时统计 |

---

## 二、对照方案A/B 检视差距

### 2.1 方案A 检视：路径/编码一致（★★★★★ 推荐）

> **核心思路**：MySQL `asset_nodes.path` 或 `asset_nodes.code` → ClickHouse `asset_path` 或 `device_code` 前缀一致

| 检视项 | 现状 | 对齐度 | 差距 |
|--------|------|--------|------|
| MySQL 设备树有唯一路径 | ✅ `asset_nodes.path`（TEXT）+ `asset_nodes.code`（VARCHAR 100 UNIQUE） | **已对齐** | 无 |
| MySQL 设备树有层级编码 | ✅ `asset_nodes.level_codes`（VARCHAR 200） | **已对齐** | 无 |
| ClickHouse v1 表用 `device_id` | ⚠️ `sensor_readings` 和 `telemetry_data` 用 `device_id`（普通 String） | **部分对齐** | `device_id` 是普通 String，未用 `LowCardinality`；字段名不是 `asset_path` |
| ClickHouse v4 表用 `device_code` | ✅ `vibration_features` 用 `device_code`（LowCardinality String） | **已对齐** | v4 表已采用正确做法 |
| ClickHouse 有 `asset_path` 列 | ❌ 无 `asset_path` 列 | **未对齐** | v1 表缺少路径列，无法做 LIKE 前缀匹配 |
| ClickHouse 用 `LowCardinality` | ⚠️ v4 表有，v1 表没有 | **部分对齐** | v1 表 `device_id`/`sensor_id` 应改为 LowCardinality |
| ClickHouse 有 ZSTD 压缩 | ⚠️ v4 表有 CODEC(ZSTD)，v1 表没有 | **部分对齐** | v1 表缺少压缩编码 |
| 写入流程带路径 | ❌ 客户端 `insertSensorReadings` 只传 `device_id`/`sensor_id` | **未对齐** | 写入时未从 MySQL 查路径 |

### 2.2 方案B 检视：宽表 + 元数据列前置（★★★★★ 推荐）

> **核心思路**：采集时从 MySQL 带上 `dept_code`、`asset_code`、`component_path`、`category_key`、`manufacturer`、`model` 等元数据列

| 检视项 | 现状 | 对齐度 | 差距 |
|--------|------|--------|------|
| ClickHouse 有 `dept_code` 列 | ❌ 无 | **未对齐** | 缺少部门编码列 |
| ClickHouse 有 `asset_code` 列 | ⚠️ v4 表有 `device_code`（等效） | **部分对齐** | v1 表缺少 |
| ClickHouse 有 `component_path` 列 | ❌ 无 | **未对齐** | 缺少组件路径列 |
| ClickHouse 有 `category_key` 列 | ❌ 无 | **未对齐** | 缺少分类字典关联 |
| ClickHouse 有 `manufacturer` 列 | ❌ 无 | **未对齐** | 缺少厂商列（跨设备同型号比对需要） |
| ClickHouse 有 `model` 列 | ❌ 无 | **未对齐** | 缺少型号列 |
| 写入时带元数据 | ❌ 客户端只传原始数据 | **未对齐** | 采集引擎未查 MySQL 缓存带入元数据 |
| Redis 缓存元数据 | ⚠️ 有 `cacheSensorData`/`cacheDeviceStatus`，但无资产元数据缓存 | **部分对齐** | 缺少 `cacheAssetMetadata` |

### 2.3 方案C 检视：唯一测点ID映射（★★★★☆）

| 检视项 | 现状 | 对齐度 | 差距 |
|--------|------|--------|------|
| MySQL 有唯一测点ID | ✅ `asset_measurement_points.mp_id`（VARCHAR 64 UNIQUE） | **已对齐** | 无 |
| ClickHouse 有 `mp_code` 列 | ⚠️ v4 表有 `mp_code`，v1 表没有 | **部分对齐** | v1 表缺少 |
| 传感器有唯一ID | ✅ `asset_sensors.sensor_id`（VARCHAR 64） | **已对齐** | 无 |
| ClickHouse 有 `sensor_id` 列 | ✅ v1 表有 `sensor_id` | **已对齐** | 无 |

---

## 三、关键差距汇总

### 3.1 严重差距（必须修复）

| # | 差距 | 影响 | 修复建议 |
|---|------|------|----------|
| **G1** | v1 表（`sensor_readings`/`telemetry_data`）缺少 `asset_path` 和 `component_path` 列 | 无法做路径前缀匹配查询（方案A核心能力） | 新建 `sensor_data_v2` 宽表，包含完整元数据列 |
| **G2** | v1 表 `device_id`/`sensor_id` 未用 `LowCardinality` | 高基数字段查询性能差，存储浪费 | 新表统一用 `LowCardinality(String)` |
| **G3** | 写入流程不带元数据 | ClickHouse 无法独立完成跨设备分析 | 采集引擎写入前从 Redis 缓存获取元数据 |
| **G4** | Redis 缺少资产元数据缓存 | 采集引擎每次写入都要查 MySQL | 新增 `cacheAssetMetadata` 方法（TTL 5-60分钟） |

### 3.2 中等差距（建议修复）

| # | 差距 | 影响 | 修复建议 |
|---|------|------|----------|
| **G5** | v1 表缺少 CODEC 压缩 | 存储空间浪费 | 新表统一用 `CODEC(Delta, ZSTD(5))` |
| **G6** | v1 表和 v4 表字段命名不一致（`device_id` vs `device_code`） | 查询时需要区分表版本 | 新表统一用 `device_code`（与 MySQL `asset_nodes.code` 一致） |
| **G7** | 缺少 `category_key`/`manufacturer`/`model` 列 | 无法做同型号设备比对分析 | 宽表中加入这些列 |
| **G8** | 缺少 ClickHouse MySQL 表引擎或 ETL 同步 | 元数据变更无法自动同步 | 可选：用 Redis 缓存 + TTL 刷新（简单可靠） |

### 3.3 已对齐项（无需修改）

| # | 项目 | 说明 |
|---|------|------|
| A1 | MySQL 设备树有唯一路径和编码 | `asset_nodes.path` + `asset_nodes.code` |
| A2 | MySQL 有完整的测点/传感器/分类字典体系 | 3 层结构：节点 → 测点 → 传感器 |
| A3 | v4 表已采用 `device_code` + `LowCardinality` + CODEC | `vibration_features` 表设计规范 |
| A4 | 物化视图体系完整 | 分钟/小时/天 三级聚合 + Kafka Engine 自动写入 |
| A5 | Redis 有传感器数据和设备状态缓存 | `cacheSensorData` + `cacheDeviceStatus` |
| A6 | Kafka → ClickHouse 自动写入链路 | `vibration_features_kafka_queue` → MV → `vibration_features` |

---

## 四、推荐实施路径

### 第一步：新建统一宽表 `sensor_data_v2`（方案A+B 融合）

```sql
CREATE TABLE xilian.sensor_data_v2
(
    -- 时间
    time               DateTime64(3) CODEC(Delta, ZSTD(5)),
    
    -- 方案A：路径/编码一致
    asset_path         String CODEC(ZSTD(3)),                    -- MySQL asset_nodes.path
    device_code        LowCardinality(String),                   -- MySQL asset_nodes.code
    
    -- 方案B：元数据列前置
    dept_code          LowCardinality(String),                   -- 部门编码
    component_path     String CODEC(ZSTD(3)),                    -- 组件路径
    category_key       LowCardinality(String),                   -- 分类字典 key
    manufacturer       LowCardinality(String) DEFAULT '',        -- 厂商
    model              LowCardinality(String) DEFAULT '',        -- 型号
    
    -- 方案C：唯一ID映射
    mp_code            LowCardinality(String),                   -- 测点ID
    sensor_id          LowCardinality(String),                   -- 传感器ID
    
    -- 数据
    tag_key            LowCardinality(String),                   -- 指标名
    value              Float64 CODEC(Delta, ZSTD(5)),
    quality            UInt8 DEFAULT 192 CODEC(Delta, ZSTD(3)),
    
    -- 来源
    gateway_id         LowCardinality(String) DEFAULT '',
    batch_id           String DEFAULT '' CODEC(ZSTD(3)),
    source             LowCardinality(String) DEFAULT 'direct',
    
    -- 索引
    INDEX idx_path     (asset_path) TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4,
    INDEX idx_dept     (dept_code) TYPE minmax GRANULARITY 4,
    INDEX idx_category (category_key) TYPE set(100) GRANULARITY 4,
    INDEX idx_model    (model) TYPE bloom_filter GRANULARITY 4
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/sensor_data_v2', '{replica}')
PARTITION BY toYYYYMM(time)
ORDER BY (device_code, mp_code, tag_key, time)
TTL time + INTERVAL 2 YEAR DELETE
SETTINGS index_granularity = 8192;
```

### 第二步：Redis 新增资产元数据缓存

```typescript
// 新增 CACHE_KEYS
ASSET_METADATA: 'asset:meta:',

// 新增方法
async cacheAssetMetadata(deviceCode: string, metadata: {
  assetPath: string;
  deptCode: string;
  componentPath: string;
  categoryKey: string;
  manufacturer: string;
  model: string;
}): Promise<boolean>

async getAssetMetadata(deviceCode: string): Promise<AssetMetadata | null>
```

### 第三步：采集写入流程改造

```
采集数据 → Redis.getAssetMetadata(device_code) 
         → 命中：直接带入元数据写入 ClickHouse
         → 未命中：查 MySQL → 写入 Redis（TTL 30min）→ 带入元数据写入 ClickHouse
```

### 第四步：新建对应物化视图

- `sensor_data_v2_1min` — 分钟聚合
- `sensor_data_v2_1hour` — 小时聚合  
- `sensor_data_v2_daily` — 天聚合
- `sensor_data_v2_device_daily` — 按设备日统计

---

## 五、v1 表迁移策略

| 策略 | 说明 |
|------|------|
| **并行写入** | 新数据同时写入 v1 和 v2 表，过渡期后停止 v1 写入 |
| **历史迁移** | 用 `INSERT INTO sensor_data_v2 SELECT ... FROM sensor_readings` 批量迁移，JOIN MySQL 补充元数据 |
| **查询兼容** | 查询层自动判断时间范围，旧数据查 v1，新数据查 v2 |
| **TTL 自然过期** | v1 表 TTL 90天，自然过期后无需手动清理 |

---

## 六、结论

**现有架构对齐度约 55%**。v4 新增的表（`vibration_features`、`alert_event_log`）已经采用了正确的设计模式（`device_code` + `LowCardinality` + CODEC + Kafka Engine），但 v1 原始表（`sensor_readings`、`telemetry_data`）与方案A/B 存在显著差距。

**核心建议**：以 v4 表的设计规范为基准，新建统一宽表 `sensor_data_v2`，融合方案A（路径一致）+ 方案B（元数据前置）+ 方案C（唯一ID映射），同时补充 Redis 资产元数据缓存和采集写入流程改造。
