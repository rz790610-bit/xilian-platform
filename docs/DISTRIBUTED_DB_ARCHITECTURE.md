# 分布式部署数据库架构设计

> 版本：v1.0 | 日期：2026-02-28 | 状态：设计阶段

---

## 目录

1. [架构总览](#一架构总览)
2. [客户现场标准数据库栈](#二客户现场标准数据库栈)
3. [高频振动数据四层存储](#三高频振动数据四层存储)
4. [VPN 远程同步协议](#四vpn-远程同步协议)
5. [Mac Studio 客户工作空间隔离](#五mac-studio-客户工作空间隔离)
6. [新增表结构](#六新增表结构)
7. [容量规划](#七容量规划)
8. [附录](#附录)

---

## 一、架构总览

### 1.1 部署拓扑

```
                          ┌─────────────────────────────────────────────────────┐
                          │         Mac Studio 诊断中心 (Center)               │
                          │                                                     │
                          │  ┌──────────┐ ┌────────────┐ ┌──────────┐          │
                          │  │ MySQL    │ │ ClickHouse │ │ MinIO    │          │
                          │  │ N×站点库 │ │ 3节点集群  │ │ 集群     │          │
                          │  │+全局库   │ │ 跨站分析   │ │ 全量存储 │          │
                          │  └──────────┘ └────────────┘ └──────────┘          │
                          │  ┌──────────┐ ┌────────────┐ ┌──────────┐          │
                          │  │ Neo4j    │ │ Qdrant     │ │ Kafka    │          │
                          │  │ 知识图谱 │ │ 向量搜索   │ │ 事件流   │          │
                          │  └──────────┘ └────────────┘ └──────────┘          │
                          │  ┌──────────┐ ┌────────────┐                       │
                          │  │ Redis    │ │ ES/Kibana  │                       │
                          │  │ 缓存集群 │ │ 日志分析   │                       │
                          │  └──────────┘ └────────────┘                       │
                          │                                                     │
                          │           MQTT Broker (中心端)                      │
                          └──────────┬────────────┬────────────┬───────────────┘
                                     │            │            │
                              WireGuard VPN + MQTT over TLS
                                     │            │            │
               ┌─────────────────────┤            │            ├──────────────────────┐
               │                     │            │            │                      │
    ┌──────────▼──────────┐ ┌────────▼─────────┐ ┌▼───────────▼──────────┐           │
    │   客户现场 A        │ │   客户现场 B     │ │   客户现场 C          │    ...    │
    │   ≤50台设备         │ │   ≤50台设备      │ │   ≤50台设备           │           │
    │                     │ │                  │ │                       │           │
    │ ┌───────┐ ┌───────┐│ │ ┌──────┐┌──────┐│ │ ┌───────┐ ┌────────┐ │           │
    │ │MySQL  │ │ CH    ││ │ │MySQL ││ CH   ││ │ │MySQL  │ │ CH     │ │           │
    │ │~35表  │ │单节点 ││ │ │~35表 ││单节点││ │ │~35表  │ │ 单节点 │ │           │
    │ └───────┘ └───────┘│ │ └──────┘└──────┘│ │ └───────┘ └────────┘ │           │
    │ ┌───────┐ ┌───────┐│ │ ┌──────┐┌──────┐│ │ ┌───────┐ ┌────────┐ │           │
    │ │MinIO  │ │Redis  ││ │ │MinIO ││Redis ││ │ │MinIO  │ │ Redis  │ │           │
    │ │单节点 │ │单节点 ││ │ │单节点││单节点││ │ │单节点 │ │ 单节点 │ │           │
    │ └───────┘ └───────┘│ │ └──────┘└──────┘│ │ └───────┘ └────────┘ │           │
    └─────────────────────┘ └────────────────┘ └───────────────────────┘           │
                                                                                    │
                                                                     最多 N 个站点 ─┘
```

### 1.2 设计约束

| 约束 | 说明 |
|------|------|
| **数据不出现场** | 原始波形数据留在现场，仅上行聚合特征和异常事件 |
| **现场硬件有限** | 单台 64GB 服务器承载全部现场组件 |
| **VPN 带宽有限** | 10 Mbps 基准，50 Mbps 建议 |
| **设备规模** | 每站点 ≤50 台设备，中心管理 N 站点总计 ≤1000 台 |

### 1.3 组件部署对照表

| 组件 | 中心端 | 现场端 | 说明 |
|------|--------|--------|------|
| **MySQL** | N 个站点库 + 1 全局库（92+表/库） | 精简 ~35 表 | Schema 级隔离 |
| **ClickHouse** | 3 节点集群（ReplicatedMergeTree） | 单节点（MergeTree） | 复用 `SINGLE_NODE_CONFIG`（`clickhouse.storage.ts:59-69`） |
| **MinIO** | 集群（多节点纠删码） | 单节点 3 桶 | S3 兼容 |
| **Redis** | 集群模式 | 单节点 4GB | allkeys-lru |
| **Neo4j** | 部署 | **不部署** | 知识图谱由中心承担 |
| **Qdrant** | 部署 | **不部署** | 向量搜索由中心承担 |
| **Kafka** | 部署 | **不部署** | 事件流由 MQTT 替代 |
| **ES/Kibana** | 部署 | **不部署** | 日志由 MQTT 上行至中心 |

---

## 二、客户现场标准数据库栈

### 2.1 硬件目标

```
┌──────────────────────────────────────────────────┐
│  现场服务器 (单台)                               │
│  CPU: 10 核 (Intel Xeon / AMD EPYC)             │
│  RAM: 64 GB                                      │
│  存储: 2 TB NVMe SSD + 8 TB HDD (RAID-1)       │
│  网络: 千兆 LAN + 10 Mbps VPN                   │
├──────────────────────────────────────────────────┤
│  内存分配                                        │
│  ┌──────────────────┐ ┌────────────────────┐     │
│  │ MySQL        8GB │ │ ClickHouse    16GB │     │
│  │ (InnoDB 6GB BP)  │ │ (查询缓冲+合并)   │     │
│  └──────────────────┘ └────────────────────┘     │
│  ┌──────────────────┐ ┌────────────────────┐     │
│  │ MinIO        2GB │ │ Redis          4GB │     │
│  │ (对象存储)       │ │ (3GB maxmemory)    │     │
│  └──────────────────┘ └────────────────────┘     │
│  ┌──────────────────┐ ┌────────────────────┐     │
│  │ OS+App      16GB │ │ 页面缓存     18GB │     │
│  │ (Node.js进程)    │ │ (ClickHouse IO)    │     │
│  └──────────────────┘ └────────────────────┘     │
│                                                   │
│  存储分配                                        │
│  NVMe 2TB: ClickHouse 热数据 + MySQL + Redis     │
│  HDD  8TB: ClickHouse 温数据 + MinIO 归档        │
└──────────────────────────────────────────────────┘
```

### 2.2 MySQL 现场表分类（~35 张）

现场 MySQL 精简为 4 类表，仅保留设备运行和数据同步所需的最小集合。

#### A 类：中心 → 现场（配置下发，9 张）

从中心端下发到现场，现场只读。

| # | 表名 | 现有行号 | 说明 |
|---|------|----------|------|
| 1 | `asset_nodes` | `schema.ts:885` | 设备资产树 |
| 2 | `asset_measurement_points` | `schema.ts:928` | 测点定义 |
| 3 | `asset_sensors` | `schema.ts:955` | 传感器配置 |
| 4 | `base_node_templates` | `schema.ts:817` | 节点模板 |
| 5 | `base_mp_templates` | `schema.ts:851` | 测点模板 |
| 6 | `base_code_rules` | `schema.ts:793` | 编码规则 |
| 7 | `base_dict_categories` | `schema.ts:1294` | 字典分类 |
| 8 | `base_dict_items` | `schema.ts:1316` | 字典项 |
| 9 | `edge_gateways` | `schema.ts:1766` | 边缘网关配置 |

#### B 类：现场产生（运行数据，13 张）

现场业务运行产生，按需上行同步到中心。

| # | 表名 | 现有行号 | 说明 |
|---|------|----------|------|
| 1 | `realtime_telemetry` | `schema.ts:1787` | 实时遥测（已有 `syncedToCh` 标志） |
| 2 | `anomaly_detections` | `schema.ts:437` | 异常检测记录 |
| 3 | `device_alerts` | `schema.ts:626` | 设备告警 |
| 4 | `device_kpis` | `schema.ts:656` | 设备 KPI |
| 5 | `device_operation_logs` | `schema.ts:603` | 操作日志 |
| 6 | `device_status_log` | `schema.ts:2025` | 状态变更日志 |
| 7 | `device_daily_summary` | `schema.ts:1967` | 日聚合摘要 |
| 8 | `event_logs` | `schema.ts:415` | 事件日志 |
| 9 | `alert_event_log` | `schema.ts:1945` | 告警事件详情 |
| 10 | `device_maintenance_records` | `schema.ts:539` | 维护记录 |
| 11 | `device_maintenance_logs` | `schema.ts:2003` | 维护日志 |
| 12 | `sensor_calibrations` | `schema.ts:1263` | 传感器校准 |
| 13 | `data_collection_metrics` | `schema.ts:1747` | 采集质量指标 |

#### C 类：中心 → 现场（诊断结论下发，5 张）

中心诊断结果推送至现场执行。

| # | 表名 | 现有行号 | 说明 |
|---|------|----------|------|
| 1 | `diagnosis_tasks` | `schema.ts:501` | 诊断任务 |
| 2 | `diagnosis_rules` | `schema.ts:466` | 诊断规则 |
| 3 | `diagnosis_results` | `schema.ts:2062` | 诊断结果 |
| 4 | `alert_rules` | `schema.ts:1845` | 告警规则 |
| 5 | `device_sampling_config` | `schema.ts:719` | 采样配置 |

#### D 类：同步基础设施（8 张）

复用现有 Outbox/Saga 表 + 新增 4 张同步专用表。

| # | 表名 | 现有行号 | 说明 |
|---|------|----------|------|
| 1 | `outbox_events` | `schema.ts:2402` | **复用** — 事件发件箱 |
| 2 | `outbox_routing_config` | `schema.ts:2424` | **复用** — 路由配置 |
| 3 | `processed_events` | `schema.ts:2500` | **复用** — 幂等去重 |
| 4 | `idempotent_records` | `schema.ts:748` | **复用** — 通用幂等 |
| 5 | `sync_watermarks` | **新增** | 同步水位线 |
| 6 | `sync_conflict_log` | **新增** | 冲突记录 |
| 7 | `sync_manifest` | **新增** | 同步清单配置 |
| 8 | `site_registry` | **新增** | 站点注册信息 |

**合计：9 + 13 + 5 + 8 = 35 张表**

### 2.3 ClickHouse 现场表

现场 ClickHouse 使用单节点模式（`MergeTree`），复用 `SINGLE_NODE_CONFIG`（`clickhouse.storage.ts:59-69`）。

| 表名 | 引擎 | TTL | 说明 |
|------|------|-----|------|
| `sensor_readings_raw` | MergeTree | 7 天 | 原始传感器数据（Gorilla + LZ4 压缩） |
| `sensor_readings_1m` | MergeTree | 2 年 | 分钟聚合 + 物化视图自动下采样 |
| `sensor_readings_1h` | MergeTree | 5 年 | 小时聚合 + 物化视图自动下采样 |
| `fault_events` | MergeTree | 永久 | 故障事件记录 |
| `vibration_waveform_raw` | MergeTree | 30 天 | **新增** — 异常时段全波形存储 |

### 2.4 MinIO 现场桶配置

| 桶名 | 存储层 | 生命周期 | 说明 |
|------|--------|----------|------|
| `vibration-waveforms` | HDD | 热30天 → 冷归档 | 波形 Parquet 文件 |
| `model-artifacts` | NVMe | 版本保留 90 天 | 中心下发的模型二进制 |
| `edge-backups` | HDD | 保留 30 天 | MySQL/CH 本地备份 |

### 2.5 Redis 现场配置

```
maxmemory 3gb
maxmemory-policy allkeys-lru

# 用途分区（逻辑 DB）
# DB 0: 振动数据环形缓冲（L1 层，~1 GB）
# DB 1: 特征值缓存（设备状态、KPI 快照）
# DB 2: 同步队列（outbox poller 暂存）
```

---

## 三、高频振动数据四层存储

### 3.1 数据规模计算

```
基础参数：
  设备数          = 50 台
  每设备测点      = 20 个
  采样频率        = 25.6 kHz
  每采样点字节    = 4 bytes (Float32)

原始速率：
  50 × 20 × 25600 × 4 = 102,400,000 bytes/s ≈ 97.66 MB/s

每天生产时间 20 小时：
  97.66 MB/s × 72,000 s = 6.84 TB/天

关键决策：
  ┌──────────────────────────────────────────────────────┐
  │  正常时段：仅存特征值（RMS/峰值/峰峰值/峭度/频谱）  │
  │  异常时段：存全波形（触发条件见 §3.3）               │
  │                                                       │
  │  特征值数据率：                                       │
  │  50 × 20 × (1次/秒) × 200 bytes ≈ 195 KB/s          │
  │  → 每天 ~13.7 GB（相比全波形降低 500x）              │
  └──────────────────────────────────────────────────────┘
```

### 3.2 四层架构

```
          数据流向
  传感器 ──→ 边缘网关 ──→ [L1] Ring Buffer (Redis 内存)
                              │
                              ├── 正常：提取特征值 ──→ [L2] ClickHouse NVMe
                              │                          │
                              │                          └── TTL 降级 ──→ [L3] ClickHouse HDD
                              │
                              └── 异常触发：全波形 ──→ [L2] ClickHouse vibration_waveform_raw
                                                         │
                                                         └── 30天后 Parquet 归档 ──→ [L4] MinIO HDD
```

| 层级 | 介质 | 保留周期 | 容量预估/站 | 用途 | 复用模块 |
|------|------|----------|-------------|------|----------|
| **L1 环形缓冲** | Redis 内存 | 10 秒 | ~1 GB | 实时频谱显示、触发判定 | `ring-buffer.ts` (`MultiChannelRingBufferManager`) |
| **L2 热存储** | ClickHouse NVMe | 7 天 | ~1.16 TB | 特征值 + 异常波形回溯 | `clickhouse.storage.ts` (`sensor_readings_raw`) |
| **L3 温存储** | ClickHouse HDD | 2-5 年 | ~73 GB | 长期趋势分析 | `clickhouse.storage.ts` (`sensor_readings_1m/1h`) |
| **L4 冷存储** | MinIO Parquet | 永久 | ~2 TB/年 | 合规归档、训练数据集 | `minio.storage.ts` (`vibration-waveforms` 桶) |

### 3.3 异常触发全波形保存规则

当满足以下任一条件时，从 L1 环形缓冲提取全波形写入 L2：

| 触发条件 | 阈值 | 回溯 | 持续 |
|----------|------|------|------|
| **Z-score 突变** | Z-score > 3（基于滑动窗口统计） | 向前 30 秒 | 至消除 + 60 秒 |
| **告警触发** | `device_alerts` 新增记录 | 向前 30 秒 | 至告警关闭 + 60 秒 |
| **诊断任务创建** | `diagnosis_tasks` 状态 = pending | 向前 30 秒 | 至任务完成 + 60 秒 |
| **手动触发** | 运维人员通过 UI/API 请求 | 向前 30 秒 | 指定时长（默认 5 分钟） |
| **定时基线采集** | 每 4 小时 | 无回溯 | 5 分钟 |

```
异常波形存储量估算（保守）：
  假设异常占比 2%，平均持续 3 分钟
  50 × 20 × 0.02 × (3min × 60s) × 25600 × 4 = ~18.4 GB/天
  + 定时基线：50 × 20 × 6次/天 × (5min × 60s) × 25600 × 4 = ~46.1 GB/天
  合计：~64.5 GB/天 → ~1.16 TB/周（与 L2 7 天 TTL 匹配）
```

### 3.4 ClickHouse 新增表：vibration_waveform_raw

```sql
CREATE TABLE IF NOT EXISTS vibration_waveform_raw
(
    device_id       String,
    sensor_id       String,
    mp_code         String,
    trigger_type    Enum8(
                      'zscore' = 1,
                      'alert' = 2,
                      'diagnosis' = 3,
                      'manual' = 4,
                      'baseline' = 5
                    ),
    trigger_id      String        COMMENT '关联的 alert_id / task_id / 空',
    segment_index   UInt32        COMMENT '波形片段序号（大波形分段存储）',
    sample_rate_hz  UInt32        DEFAULT 25600,
    samples         Array(Float32) CODEC(Gorilla, ZSTD(3))
                                  COMMENT '波形采样点数组，每段 ≤25600 点（1秒）',
    features_json   String        DEFAULT '{}'
                                  COMMENT '该段特征值 JSON（RMS/峰值/峭度/频谱峰）',
    timestamp       DateTime64(3) CODEC(DoubleDelta, LZ4),
    _partition_date Date          DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()                     -- 现场单节点
PARTITION BY toYYYYMMDD(_partition_date)  -- 按天分区（数据量大）
ORDER BY (device_id, sensor_id, timestamp, segment_index)
TTL timestamp + INTERVAL 30 DAY DELETE   -- 30 天后由 L4 归档接管
SETTINGS
    index_granularity = 4096,
    min_bytes_for_wide_part = 0;         -- 强制 Wide 格式，优化 Array 列
```

> **中心端**使用 `ReplicatedMergeTree` 引擎，其余结构相同。

---

## 四、VPN 远程同步协议

### 4.1 传输层架构

```
┌──────────────┐          WireGuard VPN          ┌──────────────┐
│  现场端      │◄──────── 10.x.{siteId}.0/24 ──►│  中心端      │
│              │                                  │              │
│  MQTT Client │◄─── MQTT 5.0 over TLS ────────►│ MQTT Broker  │
│  (QoS 1)     │     (端口 8883)                 │ (EMQX/Mosquitto)
│              │                                  │              │
│  MinIO       │◄─── S3 API over TLS ───────────►│ MinIO        │
│  (现场)      │     (大文件直传)                 │ (中心)       │
└──────────────┘                                  └──────────────┘
```

**传输选型依据**：复用现有 `mqtt.adapter.ts`（`server/services/protocol-adapters/mqtt.adapter.ts`），支持 MQTT 5.0、QoS 0/1/2、TLS、Sparkplug B。同步场景使用 QoS 1（至少一次）+ `processed_events` 表幂等去重，确保 exactly-once 语义。

### 4.2 MQTT Topic 命名规范

```
# 上行（现场 → 中心）
xilian/sync/{siteId}/up/alert/{alertId}
xilian/sync/{siteId}/up/anomaly/{detectionId}
xilian/sync/{siteId}/up/diagnosis_request/{taskId}
xilian/sync/{siteId}/up/metric_agg/{deviceId}
xilian/sync/{siteId}/up/daily_summary/{date}
xilian/sync/{siteId}/up/edge_case/{caseId}
xilian/sync/{siteId}/up/maintenance/{recordId}
xilian/sync/{siteId}/up/calibration/{sensorId}
xilian/sync/{siteId}/up/heartbeat

# 下行（中心 → 现场）
xilian/sync/{siteId}/down/diagnosis_result/{taskId}
xilian/sync/{siteId}/down/model_update/{modelId}
xilian/sync/{siteId}/down/knowledge_crystal/{crystalId}
xilian/sync/{siteId}/down/rule_update/{ruleType}/{ruleId}
xilian/sync/{siteId}/down/config_update/{configKey}
xilian/sync/{siteId}/down/asset_update/{nodeId}
xilian/sync/{siteId}/down/sampling_config/{deviceId}
xilian/sync/{siteId}/down/dict_update/{categoryId}

# 命令（中心 → 现场，需回执）
xilian/cmd/{siteId}/capture_waveform/{deviceId}
xilian/cmd/{siteId}/sync_full/{tableGroup}
xilian/cmd/{siteId}/restart_service/{serviceName}

# 回执（现场 → 中心）
xilian/cmd/{siteId}/ack/{commandId}
```

### 4.3 消息信封格式（SyncEnvelope）

与现有 `outbox_events` 表字段对齐（`schema.ts:2402-2422`）：

```typescript
interface SyncEnvelope {
  // === 事件标识 ===
  eventId: string;           // UUID v7（时间有序），对应 outbox_events.event_id
  eventType: string;         // 如 'alert.created', 'diagnosis.completed'
  aggregateType: string;     // 如 'DeviceAlert', 'DiagnosisTask'
  aggregateId: string;       // 业务实体 ID

  // === 同步元数据 ===
  siteId: string;            // 站点标识
  direction: 'up' | 'down';  // 同步方向
  priority: 0 | 1 | 2 | 3;  // P0=紧急告警, P1=诊断, P2=常规, P3=低优先级
  idempotencyKey: string;    // 幂等键 = `${siteId}:${eventId}`
  version: number;           // 数据版本号（乐观锁）

  // === 载荷 ===
  payload: Record<string, unknown>;  // 业务数据 JSON
  payloadRef?: string;               // 大载荷时指向 MinIO 对象的 key

  // === 追踪 ===
  correlationId?: string;    // 关联追踪 ID
  causationId?: string;      // 因果链 ID
  timestamp: string;         // ISO 8601 时间戳
  source: string;            // 来源标识（如 'site-SH001', 'center'）
}
```

### 4.4 同步流程

基于现有 Outbox Pattern（`outbox_events` + `processed_events`）：

```
┌───────────────────────── 发送端（现场/中心） ─────────────────────────┐
│                                                                        │
│  1. 业务操作                                                          │
│     ┌─────────────────────────────────────────────┐                   │
│     │ BEGIN TRANSACTION                            │                   │
│     │   INSERT INTO device_alerts (...)            │  ← 业务表        │
│     │   INSERT INTO outbox_events (                │  ← 发件箱        │
│     │     event_id, event_type, aggregate_type,    │                   │
│     │     aggregate_id, payload, status='pending'  │                   │
│     │   )                                          │                   │
│     │ COMMIT                                       │                   │
│     └─────────────────────────────────────────────┘                   │
│                                                                        │
│  2. Outbox Poller（5 秒轮询周期）                                    │
│     SELECT * FROM outbox_events                                       │
│       WHERE status = 'pending'                                        │
│       ORDER BY priority ASC, created_at ASC                           │
│       LIMIT 100                                                       │
│     →  构建 SyncEnvelope                                             │
│     →  MQTT publish (QoS 1)                                          │
│     →  UPDATE outbox_events SET status='published', published_at=NOW()│
│                                                                        │
│  3. 大文件走 MinIO                                                   │
│     IF payload > 256KB:                                               │
│       upload to MinIO → set payloadRef in envelope → MQTT 发元数据   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── 接收端（中心/现场） ─────────────────────────┐
│                                                                        │
│  4. MQTT 订阅处理                                                     │
│     ON message(topic, envelope):                                      │
│                                                                        │
│     // 幂等检查（复用 processed_events 表，schema.ts:2500）          │
│     IF EXISTS(SELECT 1 FROM processed_events                          │
│               WHERE event_id = envelope.eventId):                     │
│       → SKIP (已处理)                                                │
│                                                                        │
│     // 版本检查                                                       │
│     IF envelope.version <= current_version:                           │
│       → SKIP (旧版本)                                                │
│                                                                        │
│     // 处理业务逻辑                                                   │
│     BEGIN TRANSACTION                                                 │
│       UPSERT INTO 业务表 (...)                                       │
│       INSERT INTO processed_events (                                  │
│         event_id, event_type, consumer_group,                         │
│         processed_at, expires_at                                      │
│       )                                                               │
│       UPDATE sync_watermarks SET                                      │
│         last_event_id = envelope.eventId,                             │
│         last_synced_at = NOW(),                                       │
│         last_version = envelope.version                               │
│     COMMIT                                                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.5 冲突解决策略

| 场景 | 冲突类型 | 策略 | 说明 |
|------|----------|------|------|
| **设备台账更新** | update-update | 中心优先 | 中心为设备主数据权威源 |
| **告警状态变更** | update-update | 最后写入 + 版本号 | 版本号高者胜出 |
| **诊断规则更新** | update-update | 高版本优先 | 规则有明确版本号 |
| **维护记录** | insert-insert | 合并 | 两端维护记录均保留，ID 不冲突（UUID） |
| **采样配置** | update-update | 中心优先 + 延迟生效 | 下次采集周期生效，避免中断 |
| **传感器校准** | update-update | 现场优先 | 校准参数以现场实测为准 |

冲突发生时记录到 `sync_conflict_log` 表，严重冲突（`resolution = 'manual'`）推送告警至运维人员。

### 4.6 消息优先级与带宽分配

| 优先级 | 类型 | 带宽占比 | 示例 |
|--------|------|----------|------|
| **P0** | 紧急 | 不限（抢占） | 安全告警、紧急停机 |
| **P1** | 高 | 40% | 诊断请求/结果、模型更新 |
| **P2** | 常规 | 40% | 异常检测、指标聚合 |
| **P3** | 低 | 20% | 日报汇总、心跳、日志 |

### 4.7 带宽需求估算

```
持续流量（per 站点）：
  心跳          = 1 次/30s × 200B     ≈ 7 B/s
  指标聚合      = 50台 × 1次/min × 1KB ≈ 833 B/s
  告警/异常     = 10 次/hour × 2KB    ≈ 6 B/s
  日报摘要      = 1 次/天 × 50KB      ≈ 1 B/s
  ──────────────────────────────────────────
  上行小计      ≈ 847 B/s ≈ 6.8 Kbps

  规则/配置下发  = 10 次/天 × 5KB     ≈ 1 B/s
  诊断结论      = 5 次/天 × 10KB      ≈ 1 B/s
  ──────────────────────────────────────────
  下行小计      ≈ 2 B/s

持续总计 ≈ 0.01 Mbps（远低于 VPN 容量）

峰值流量（突发场景）：
  波形上传      = 10 测点 × 5min × 97.66KB/s/测点 ≈ 286 MB
  模型下发      = 1 个 ONNX 模型 ≈ 50-500 MB
  全量同步      = 35 表 × 平均 50MB ≈ 1.75 GB
  ──────────────────────────────────────────
  峰值需求 ≈ 10 Mbps（10 分钟突发窗口）

结论：10 Mbps VPN 足够日常运行，建议 50 Mbps 以支持快速全量同步。
```

### 4.8 离线容错

现场与中心断连时：

1. **Outbox 队列积压**：`outbox_events` 持续写入，`status` 保持 `pending`
2. **本地全功能运行**：告警、采集、特征提取、本地规则引擎均不受影响
3. **重连后自动追赶**：Poller 按 `created_at` 顺序发送积压消息
4. **水位线恢复**：中心端通过 `sync_watermarks.last_event_id` 确认同步进度
5. **积压告警**：当 `outbox_events` 未发送条目 > 1000 时触发本地告警

---

## 五、Mac Studio 客户工作空间隔离

### 5.1 隔离模型总览

```
Mac Studio 中心端存储隔离
├── MySQL
│   ├── xilian_global          # 全局共享（模型库、算法定义、全局配置）
│   ├── xilian_site_SH001      # 上海站点
│   ├── xilian_site_NB002      # 宁波站点
│   └── xilian_site_QD003      # 青岛站点
│
├── ClickHouse
│   ├── xilian_global_analytics  # 跨站点聚合分析
│   ├── xilian_site_SH001       # 上海站点时序数据
│   ├── xilian_site_NB002       # 宁波站点时序数据
│   └── xilian_site_QD003       # 青岛站点时序数据
│
├── MinIO
│   ├── site-SH001/vibration-waveforms/
│   ├── site-SH001/model-artifacts/
│   ├── site-NB002/vibration-waveforms/
│   ├── global/shared-models/
│   └── global/training-datasets/
│
├── Neo4j
│   ├── :SiteSH001:Equipment    # 标签命名空间隔离
│   ├── :SiteNB002:Equipment
│   ├── :Global:KnowledgeCrystal  # 共享知识结晶
│   └── 跨站点边：SIMILAR_FAULT_PATTERN
│
├── Qdrant
│   ├── site_SH001_equipment_vectors
│   ├── site_NB002_equipment_vectors
│   ├── global_fault_patterns     # 跨站共享
│   └── global_knowledge_crystals
│
└── Redis
    ├── DB 0: 全局缓存
    ├── DB 1: site:SH001:* 前缀隔离
    └── DB 2: site:NB002:* 前缀隔离
```

### 5.2 各存储隔离详情

#### MySQL — Schema 级隔离

```sql
-- 每站点独立数据库（92+ 张表完整 schema）
CREATE DATABASE xilian_site_SH001;
CREATE DATABASE xilian_site_NB002;

-- 全局共享数据库
CREATE DATABASE xilian_global;
-- 包含：algorithm_definitions, model_registry, system_configs
-- 以及站点注册表 site_registry
```

**路由逻辑**：请求头/JWT 中携带 `siteId`，服务层根据 `siteId` 选择对应数据库连接。

#### ClickHouse — Database 级隔离

```sql
-- 每站点独立数据库
CREATE DATABASE xilian_site_SH001;
-- 包含完整的 sensor_readings_raw/1m/1h, fault_events, vibration_waveform_raw

-- 全局分析数据库（跨站聚合）
CREATE DATABASE xilian_global_analytics;
-- 包含跨站物化视图：
--   mv_cross_site_device_health     — 相同型号设备健康对比
--   mv_cross_site_fault_correlation — 跨站故障模式关联
```

#### MinIO — Bucket 前缀隔离 + IAM 策略

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::vibration-waveforms/site-SH001/*",
      "arn:aws:s3:::model-artifacts/site-SH001/*"
    ],
    "Condition": {
      "StringEquals": { "aws:PrincipalTag/siteId": "SH001" }
    }
  }]
}
```

#### Neo4j — 标签命名空间隔离

```cypher
-- 站点内查询（自动带站点标签过滤）
MATCH (e:SiteSH001:Equipment)-[:HAS_COMPONENT]->(c:SiteSH001:Component)
WHERE e.device_type = 'quay_crane'
RETURN e, c

-- 跨站知识迁移（全局知识结晶可被所有站点引用）
MATCH (k:Global:KnowledgeCrystal)-[:APPLIES_TO]->(ft:FaultType)
WHERE ft.code = 'BRAKE_SLIP'
RETURN k
```

#### Qdrant — Collection 粒度隔离

```
站点专有集合：
  site_{siteId}_equipment_vectors   — 设备特征向量
  site_{siteId}_fault_signatures    — 故障特征签名

全局共享集合：
  global_fault_patterns             — 跨站故障模式
  global_knowledge_crystals         — 知识结晶向量
```

### 5.3 GPU 训练资源隔离

```
Mac Studio GPU (M2 Ultra 76 核 / 192 GB 统一内存)

┌────────────────────────────────────────────────┐
│  优先级队列 (加权轮询)                         │
│                                                 │
│  P0 紧急诊断  — 抢占式，不排队                 │
│  P1 模型训练  — 权重 = 站点设备数 / 总设备数   │
│  P2 影子评估  — 批量调度，低峰运行             │
│  P3 知识挖掘  — 空闲 GPU 才执行                │
│                                                 │
│  内存配额：                                    │
│  每站点最大 = 192GB × (站点设备数/总设备数)    │
│  最小保证 = 8 GB（确保小站点也能训练）          │
│                                                 │
│  示例（3 站点，总 150 台设备）：                │
│  SH001 (80台): 最大 102 GB, 权重 53%           │
│  NB002 (50台): 最大 64 GB,  权重 33%           │
│  QD003 (20台): 最大 26 GB,  权重 13%           │
└────────────────────────────────────────────────┘
```

---

## 六、新增表结构

### 6.1 sync_watermarks — 同步水位线

跟踪每个站点、每个数据流的同步进度。

```typescript
// Drizzle ORM 定义
export const syncWatermarks = mysqlTable("sync_watermarks", {
  id: int("id").autoincrement().primaryKey(),
  siteId: varchar("site_id", { length: 32 }).notNull(),
  streamId: varchar("stream_id", { length: 100 }).notNull(),
    // streamId 格式: '{aggregateType}.{eventType}'
    // 例: 'DeviceAlert.alert.created'
  direction: mysqlEnum("direction", ["up", "down"]).notNull(),
  lastEventId: varchar("last_event_id", { length: 64 }),
  lastSyncedAt: timestamp("last_synced_at"),
  lastVersion: bigint("last_version", { mode: "number" }).default(0).notNull(),
  totalSynced: bigint("total_synced", { mode: "number" }).default(0).notNull(),
  totalFailed: bigint("total_failed", { mode: "number" }).default(0).notNull(),
  status: mysqlEnum("status", [
    "active",      // 正常同步中
    "paused",      // 手动暂停
    "catching_up", // 追赶积压中
    "error",       // 同步异常
  ]).default("active").notNull(),
  lastError: text("last_error"),
  metadata: json("metadata").$type<{
    avgLatencyMs?: number;
    p99LatencyMs?: number;
    pendingCount?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // 唯一约束：每站点+流+方向 一条水位线
  siteStreamIdx: uniqueIndex("uk_sw_site_stream").on(
    t.siteId, t.streamId, t.direction
  ),
  statusIdx: index("idx_sw_status").on(t.status),
}));
```

### 6.2 sync_conflict_log — 冲突记录

记录同步过程中发生的数据冲突及其解决方式。

```typescript
export const syncConflictLog = mysqlTable("sync_conflict_log", {
  id: int("id").autoincrement().primaryKey(),
  siteId: varchar("site_id", { length: 32 }).notNull(),
  eventId: varchar("event_id", { length: 64 }).notNull(),
  conflictType: mysqlEnum("conflict_type", [
    "update_update",    // 双方同时修改同一记录
    "update_delete",    // 一方修改、另一方删除
    "insert_insert",    // 双方插入相同 ID
    "version_mismatch", // 版本号不连续
  ]).notNull(),
  resolution: mysqlEnum("resolution", [
    "center_wins",      // 中心端数据胜出
    "site_wins",        // 现场端数据胜出
    "higher_version",   // 高版本胜出
    "merge",            // 合并（两端均保留）
    "manual",           // 需人工介入
  ]).notNull(),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: varchar("record_id", { length: 64 }).notNull(),
  localData: json("local_data").$type<Record<string, unknown>>(),
  remoteData: json("remote_data").$type<Record<string, unknown>>(),
  resolvedData: json("resolved_data").$type<Record<string, unknown>>(),
  resolvedBy: varchar("resolved_by", { length: 64 }),
    // 'system' 或 用户ID（manual 时）
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  siteIdx: index("idx_scl_site").on(t.siteId),
  conflictIdx: index("idx_scl_conflict").on(t.conflictType),
  tableIdx: index("idx_scl_table").on(t.tableName, t.recordId),
  unresolvedIdx: index("idx_scl_unresolved").on(t.resolution, t.resolvedAt),
}));
```

### 6.3 sync_manifest — 同步清单

定义每张表的同步方向、策略、频率和冲突解决方式。

```typescript
export const syncManifest = mysqlTable("sync_manifest", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("table_name", { length: 100 }).notNull().unique(),
  tableCategory: mysqlEnum("table_category", ["A", "B", "C", "D"]).notNull(),
    // A=中心→现场配置, B=现场产生, C=中心→现场结论, D=同步基础设施
  direction: mysqlEnum("direction", [
    "center_to_site",  // A/C 类
    "site_to_center",  // B 类
    "bidirectional",   // 双向（少数场景）
    "local_only",      // D 类（不同步）
  ]).notNull(),
  syncStrategy: mysqlEnum("sync_strategy", [
    "full_replace",    // 全量替换（小表配置）
    "incremental",     // 增量同步（基于 updated_at）
    "event_driven",    // 事件驱动（通过 outbox）
    "on_demand",       // 按需（手动触发）
  ]).notNull(),
  frequencySeconds: int("frequency_seconds"),
    // NULL = event_driven（实时）
    // 例: 86400 = 每天, 3600 = 每小时
  conflictResolution: mysqlEnum("conflict_resolution", [
    "center_wins",
    "site_wins",
    "higher_version",
    "merge",
    "manual",
  ]).default("center_wins").notNull(),
  priority: int("priority").default(2).notNull(),
    // 0=最高, 3=最低
  isEnabled: boolean("is_enabled").default(true).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

**预填充数据示例**：

| table_name | category | direction | strategy | frequency | conflict |
|------------|----------|-----------|----------|-----------|----------|
| `asset_nodes` | A | center_to_site | full_replace | 3600 | center_wins |
| `asset_measurement_points` | A | center_to_site | full_replace | 3600 | center_wins |
| `asset_sensors` | A | center_to_site | full_replace | 3600 | center_wins |
| `base_node_templates` | A | center_to_site | full_replace | 86400 | center_wins |
| `base_mp_templates` | A | center_to_site | full_replace | 86400 | center_wins |
| `base_code_rules` | A | center_to_site | full_replace | 86400 | center_wins |
| `base_dict_categories` | A | center_to_site | full_replace | 86400 | center_wins |
| `base_dict_items` | A | center_to_site | full_replace | 86400 | center_wins |
| `edge_gateways` | A | center_to_site | incremental | 3600 | center_wins |
| `realtime_telemetry` | B | site_to_center | event_driven | NULL | site_wins |
| `anomaly_detections` | B | site_to_center | event_driven | NULL | site_wins |
| `device_alerts` | B | site_to_center | event_driven | NULL | higher_version |
| `device_kpis` | B | site_to_center | incremental | 60 | site_wins |
| `device_operation_logs` | B | site_to_center | event_driven | NULL | merge |
| `device_status_log` | B | site_to_center | event_driven | NULL | site_wins |
| `device_daily_summary` | B | site_to_center | incremental | 86400 | site_wins |
| `event_logs` | B | site_to_center | incremental | 300 | merge |
| `alert_event_log` | B | site_to_center | event_driven | NULL | merge |
| `device_maintenance_records` | B | site_to_center | event_driven | NULL | merge |
| `device_maintenance_logs` | B | site_to_center | event_driven | NULL | merge |
| `sensor_calibrations` | B | site_to_center | event_driven | NULL | site_wins |
| `data_collection_metrics` | B | site_to_center | incremental | 300 | site_wins |
| `diagnosis_tasks` | C | center_to_site | event_driven | NULL | center_wins |
| `diagnosis_rules` | C | center_to_site | full_replace | 3600 | higher_version |
| `diagnosis_results` | C | center_to_site | event_driven | NULL | center_wins |
| `alert_rules` | C | center_to_site | full_replace | 3600 | higher_version |
| `device_sampling_config` | C | center_to_site | event_driven | NULL | center_wins |
| `outbox_events` | D | local_only | — | — | — |
| `outbox_routing_config` | D | local_only | — | — | — |
| `processed_events` | D | local_only | — | — | — |
| `idempotent_records` | D | local_only | — | — | — |
| `sync_watermarks` | D | local_only | — | — | — |
| `sync_conflict_log` | D | local_only | — | — | — |
| `sync_manifest` | D | local_only | — | — | — |
| `site_registry` | D | local_only | — | — | — |

### 6.4 site_registry — 站点注册

中心端管理所有站点的连接信息和状态。

```typescript
export const siteRegistry = mysqlTable("site_registry", {
  id: int("id").autoincrement().primaryKey(),
  siteId: varchar("site_id", { length: 32 }).notNull().unique(),
    // 命名规范: {城市缩写}{序号}，如 SH001, NB002, QD003
  siteName: varchar("site_name", { length: 200 }).notNull(),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  region: varchar("region", { length: 100 }),
  deviceCount: int("device_count").default(0).notNull(),

  // === VPN 配置 ===
  vpnConfig: json("vpn_config").$type<{
    vpnType: 'wireguard' | 'ipsec';
    tunnelSubnet: string;         // 如 '10.100.1.0/24'
    publicKey: string;
    endpoint?: string;            // 现场公网 IP:Port
    keepaliveInterval: number;    // 秒
  }>(),

  // === 服务端点 ===
  mqttEndpoint: varchar("mqtt_endpoint", { length: 200 }),
    // 如 'mqtts://10.100.1.1:8883'
  minioEndpoint: varchar("minio_endpoint", { length: 200 }),
    // 如 'https://10.100.1.1:9000'

  // === 中心端数据库映射 ===
  mysqlDatabase: varchar("mysql_database", { length: 100 }),
    // 如 'xilian_site_SH001'
  clickhouseDatabase: varchar("clickhouse_database", { length: 100 }),
    // 如 'xilian_site_SH001'
  minioPrefix: varchar("minio_prefix", { length: 100 }),
    // 如 'site-SH001'
  neo4jLabelPrefix: varchar("neo4j_label_prefix", { length: 50 }),
    // 如 'SiteSH001'
  qdrantCollectionPrefix: varchar("qdrant_collection_prefix", { length: 50 }),
    // 如 'site_SH001'

  // === 状态 ===
  status: mysqlEnum("status", [
    "provisioning",  // 初始化中
    "active",        // 正常运行
    "degraded",      // 降级（同步延迟等）
    "offline",       // 离线
    "decommissioned", // 已退役
  ]).default("provisioning").notNull(),

  lastHeartbeat: timestamp("last_heartbeat"),
  provisionedAt: timestamp("provisioned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  statusIdx: index("idx_sr_status").on(t.status),
  customerIdx: index("idx_sr_customer").on(t.customerName),
}));
```

---

## 七、容量规划

### 7.1 单站点容量公式

```
MySQL:
  A类表（只读配置）  ≈ 0.5 GB
  B类表（运行数据）  ≈ 8 GB/年 (50台 × 20测点 × 日聚合)
  C类表（诊断结论）  ≈ 1 GB/年
  D类表（同步基础设施）≈ 0.5 GB（定期清理）
  ─────────────────────────────
  合计             ≈ 10 GB/年/站点

ClickHouse:
  sensor_readings_raw (NVMe, 7天TTL)
    = 50设备 × 20测点 × 86400s/天 × 7天 × 200B/特征
    ≈ 120 GB (压缩后 ~30 GB)

  vibration_waveform_raw (NVMe, 30天TTL)
    ≈ 64.5 GB/天 × 30天 ≈ 1.94 TB (压缩后 ~1 TB)
    → 与 NVMe 2TB 容量匹配

  sensor_readings_1m (HDD, 2年TTL)
    = 50 × 20 × 1440min/天 × 730天 × 100B
    ≈ 105 GB (压缩后 ~25 GB)

  sensor_readings_1h (HDD, 5年TTL)
    = 50 × 20 × 24h/天 × 1825天 × 100B
    ≈ 43.8 GB (压缩后 ~10 GB)

  fault_events (HDD, 永久)
    ≈ 1 GB/年
  ─────────────────────────────
  NVMe 合计    ≈ 1.03 TB（2 TB 盘，利用率 ~50%）
  HDD 合计     ≈ 36 GB/年

MinIO:
  vibration-waveforms (Parquet 归档)
    ≈ 64.5 GB/天 × 365天 ÷ 4(Parquet压缩) ≈ 5.9 TB/年
    → 实际只归档异常波形，按 10% 估计 ≈ 2 TB/年

  model-artifacts
    ≈ 50 MB/模型 × 100 版本 ≈ 5 GB

  edge-backups
    ≈ 10 GB × 30天保留 = 10 GB
  ─────────────────────────────
  合计           ≈ 2 TB/年/站点（HDD 8TB 盘可支撑 3-4 年）

Redis:
  L1 环形缓冲     ≈ 1 GB (50台 × 20通道 × 10s × 25.6kHz × 4B，溢出覆写)
  特征值缓存       ≈ 1 GB
  同步队列暂存     ≈ 0.5 GB
  ─────────────────────────────
  合计           ≈ 2.5 GB（4 GB maxmemory 留裕量）
```

### 7.2 中心端容量公式（N 站点）

```
MySQL:
  N × 10 GB/年 + 全局库 5 GB
  20 站点 = 205 GB/年

ClickHouse (3 节点集群 × 2 副本):
  N × (NVMe 1 TB + HDD 36 GB/年)
  20 站点 = 20 TB NVMe + 720 GB/年 HDD
  → 每节点建议 8 TB NVMe + 4 TB HDD

MinIO (纠删码集群):
  N × 2 TB/年
  20 站点 = 40 TB/年

VPN 聚合带宽:
  N × 0.01 Mbps 持续 + 突发 10 Mbps/站点
  20 站点 = 0.2 Mbps 持续
  同时突发 ≤3 站点 = 30 Mbps
  → 50 Mbps 对称带宽足够
```

### 7.3 容量计算器（代入参数）

```
输入参数：
  D = 设备数量
  M = 每设备测点数
  F = 采样频率 (Hz)
  H = 日运行小时数
  A = 异常占比 (0-1)

计算：
  原始数据率     = D × M × F × 4         bytes/s
  日原始数据     = 原始数据率 × H × 3600  bytes
  特征值数据率   = D × M × 200            bytes/s
  异常波形日存储 = 原始数据率 × A × H × 3600 × (1 + 60/平均异常时长s)  bytes

  L1 Redis      = D × M × 10 × F × 4     bytes  (10秒窗口)
  L2 CH NVMe    = (特征值数据率 × 7 × 86400 + 异常波形日存储 × 30)  bytes
  L3 CH HDD     = 特征值数据率 × 730 × 86400 × 0.25  bytes  (压缩)
  L4 MinIO      = 异常波形日存储 × 365 × 0.25  bytes  (Parquet)
  MySQL         = D × 200 MB/年
```

---

## 附录

### A. 与现有代码集成点

| 模块 | 文件路径 | 集成说明 |
|------|----------|----------|
| **Outbox Pattern** | `drizzle/schema.ts:2402-2437` | 复用 `outbox_events` + `outbox_routing_config` 作为同步发件箱 |
| **幂等去重** | `drizzle/schema.ts:2500-2513` | 复用 `processed_events` 实现 exactly-once |
| **边缘网关** | `drizzle/schema.ts:1766-1784` | `edge_gateways` 为 A 类表，中心下发 |
| **实时遥测** | `drizzle/schema.ts:1787-1804` | `realtimeTelemetry.syncedToCh` 标志已存在 |
| **ClickHouse 单节点** | `clickhouse.storage.ts:59-69` | 现场端复用 `SINGLE_NODE_CONFIG` |
| **ClickHouse 物化视图** | `contracts/clickhouse-views.sql` | 5 个物化视图的中心端跨站扩展 |
| **MinIO 存储** | `minio.storage.ts:88-162` | 扩展 `BUCKET_CONFIGS` 增加 3 个现场桶 |
| **MQTT 适配器** | `mqtt.adapter.ts` | 复用 MQTT 5.0 客户端，新增同步 Topic 订阅 |
| **环形缓冲** | `perception/collection/ring-buffer.ts` | L1 层实现，`MultiChannelRingBufferManager` |
| **统一配置** | `core/config.ts` | 需新增 `site`、`sync`、`vpn` 配置域 |

### B. 部署拓扑对照表

| 组件 | 中心端规格 | 现场端规格 | 差异说明 |
|------|-----------|-----------|----------|
| **MySQL** | 32GB RAM, SSD RAID-10 | 8GB RAM, NVMe | 中心 N 库，现场 1 库(35表) |
| **ClickHouse** | 3×64GB RAM, NVMe+HDD | 16GB RAM, NVMe+HDD | 中心 ReplicatedMergeTree，现场 MergeTree |
| **MinIO** | 4 节点纠删码 | 单节点 3 桶 | 中心高可用，现场依赖本地备份 |
| **Redis** | 集群 3 主 3 从 | 单节点 4GB | 中心高可用，现场 LRU 淘汰 |
| **Neo4j** | 单实例 16GB | **不部署** | 知识图谱仅中心端 |
| **Qdrant** | 单实例 8GB | **不部署** | 向量搜索仅中心端 |
| **Kafka** | 3 Broker 集群 | **不部署** | 现场用 MQTT 替代 |
| **ES/Kibana** | 3 节点集群 | **不部署** | 日志通过 MQTT 上行 |
| **MQTT Broker** | EMQX 集群 | 不需要（现场为 Client） | 中心端 Broker 接收所有站点 |
| **VPN** | WireGuard Server | WireGuard Client | 每站点独立子网 |

### C. config.ts 需新增配置域

```typescript
// 需在 config.ts 中新增的配置域

site: {
  siteId: env('SITE_ID', ''),                    // 现场端必填
  siteMode: env('SITE_MODE', 'center'),           // 'center' | 'site'
  siteName: env('SITE_NAME', ''),
},

sync: {
  enabled: envBool('SYNC_ENABLED', false),
  pollingIntervalMs: envInt('SYNC_POLLING_INTERVAL_MS', 5000),
  batchSize: envInt('SYNC_BATCH_SIZE', 100),
  maxRetries: envInt('SYNC_MAX_RETRIES', 3),
  retryBackoffMs: envInt('SYNC_RETRY_BACKOFF_MS', 1000),
  largePayloadThresholdBytes: envInt('SYNC_LARGE_PAYLOAD_THRESHOLD', 262144),  // 256KB
  watermarkCheckIntervalMs: envInt('SYNC_WATERMARK_CHECK_INTERVAL_MS', 30000),
},

vpn: {
  type: env('VPN_TYPE', 'wireguard'),
  tunnelSubnet: env('VPN_TUNNEL_SUBNET', '10.100.0.0/16'),
  centerEndpoint: env('VPN_CENTER_ENDPOINT', ''),
  keepaliveInterval: envInt('VPN_KEEPALIVE_INTERVAL', 25),
},
```

### D. 关键设计决策记录

| # | 决策 | 理由 | 替代方案 |
|---|------|------|----------|
| 1 | 现场不部署 Neo4j/Qdrant/Kafka/ES | 64GB 服务器资源有限，这些组件对现场实时运行非必需 | 全量部署（需 128GB+） |
| 2 | MQTT over VPN 而非 Kafka Mirror | Kafka MirrorMaker 需要两端都部署 Kafka；MQTT 更轻量且已有适配器 | Kafka MirrorMaker 2.0 |
| 3 | 正常时段只存特征值 | 全波形 6.84 TB/天 无法在现场 2TB NVMe 上保留超过 7 小时 | 全量存储（需 100TB+ NVMe） |
| 4 | MySQL Schema 级隔离 | 相比行级隔离（tenant_id 列），Schema 级物理隔离更安全，DDL 变更独立 | 行级隔离 / 独立实例 |
| 5 | Outbox Pattern 复用 | 已有成熟的 `outbox_events` + `processed_events` 基础设施 | CDC (Debezium) |
| 6 | 站点级 VPN 子网 | `10.x.{siteId}.0/24` 确保网络隔离，路由清晰 | 共享子网 + ACL |

---

*文档结束 — v1.0*
