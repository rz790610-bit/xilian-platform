# 设备 ID 体系冲突地图

## 一、Schema 层：三套 ID 的语义定义

| ID 字段 | 权威表 | 语义 | 格式示例 |
|---------|--------|------|----------|
| `nodeId` | `asset_nodes.node_id` | 设备树节点唯一标识 | 用户自定义，如 `PUMP-001` |
| `deviceCode` | `asset_nodes.code` | 设备编码（由编码规则生成） | 如 `DEV-2026-001` |
| `sensorId` | `asset_sensors.sensor_id` | 传感器唯一标识 | 如 `SEN-VIB-001` |
| `deviceId` | **已废弃** | 旧设备表主键 | 等同于 nodeId 或 deviceCode |

**关键发现**：`asset_nodes` 表中 `nodeId` 和 `code` 都是 unique，但在代码中被混用为同一个概念。`device.service.ts` 第222行：`nodeId: data.deviceId, code: data.deviceId` — 直接把 deviceId 同时赋值给 nodeId 和 code。

## 二、代码层冲突清单

### 2.1 device.service.ts — 旧接口适配层（最严重）

| 行号 | 问题 | 详情 |
|------|------|------|
| 222-223 | `nodeId = deviceId = code` | 创建设备时把三个字段设为同一个值 |
| 293 | `deviceId: d.nodeId` | 查询时把 nodeId 映射回 deviceId |
| 312 | `assetSensors.deviceCode, deviceId` | 用 deviceId 查 deviceCode 字段 |
| 428 | `deviceCode: data.deviceId` | 创建传感器时把 deviceId 写入 deviceCode |

**问题本质**：device.service.ts 是一个"翻译层"，把旧的 deviceId 接口翻译成新的 asset_nodes 操作。但翻译逻辑假设 `nodeId == code == deviceId`，这在编码规则启用后会断裂。

### 2.2 deviceCrud.service.ts — 另一个翻译层（重复）

| 行号 | 问题 | 详情 |
|------|------|------|
| 229-230 | `nodeId: input.deviceId, code: input.deviceId` | 同上 |
| 312 | `assetSensors.deviceCode, deviceId` | 同上 |
| 316 | `deviceId: d.nodeId` | 同上 |

**问题本质**：与 device.service.ts 功能高度重复，是"增强版"CRUD。同样假设三个 ID 相等。

### 2.3 kafkaStream.processor.ts — 数据流入口

| 行号 | 问题 | 详情 |
|------|------|------|
| 312 | `nodeId: result.deviceId` | 写 anomaly_detections 时把 deviceId 存入 nodeId 字段 |
| 526 | `anomalyDetections.nodeId, options.deviceId` | 查询时用 deviceId 查 nodeId 字段 |
| 599 | `r.nodeId !== options.deviceId` | 过滤时用 deviceId 比较 nodeId |

### 2.4 eventBus.service.ts — 事件系统

| 行号 | 问题 | 详情 |
|------|------|------|
| 182 | `nodeId: options.deviceId` | 发布事件时把 deviceId 存入 nodeId |
| 303 | `nodeId: event.nodeId \|\| event.deviceId` | 持久化时 fallback 逻辑 |
| 400 | `deviceId: r.nodeId` | 查询时把 nodeId 映射回 deviceId |

### 2.5 streamProcessor.service.ts — 流处理

| 行号 | 问题 | 详情 |
|------|------|------|
| 473-478 | `getDeviceIdForSensor` | 查 `assetSensors.deviceCode` 返回为 "deviceId" |
| 412 | `nodeId: result.nodeId \|\| result.deviceId` | 混合 fallback |

### 2.6 clickhouse.client.ts — 时序存储

| 行号 | 问题 | 详情 |
|------|------|------|
| 137 | `device_id: r.deviceId` | ClickHouse 列名是 device_id，映射自 deviceId |
| 285 | `deviceId: row.device_id` | 反向映射 |
| 237-239 | `deviceIds` 过滤 | 用 deviceId 数组查 device_id 列 |

### 2.7 cognition 层

| 文件 | 问题 |
|------|------|
| `cognition-unit.ts:66` | `deviceId?: string` 类型定义 |
| `perception-processor.ts:153` | `stimulus.payload?.deviceId` |
| `pipeline-hooks.ts:224` | `deviceId: context.deviceId` |
| `types/index.ts:199,465,515` | 多处 deviceId 类型定义 |

### 2.8 其他基础设施层

| 文件 | 问题 |
|------|------|
| `cacheService.ts:387` | `sensor: (deviceId, sensorId)` 缓存键 |
| `grpcClients.ts:195-215` | gRPC 接口用 deviceId |
| `redis.client.ts` | Redis 键用 deviceId |
| `domain.ts:28,52,83` | 核心类型定义用 deviceId |

## 三、冲突本质总结

**核心矛盾**：新 schema 设计了清晰的三层模型：

```
asset_nodes (nodeId, code)  →  asset_measurement_points (mpId, nodeId, deviceCode)  →  asset_sensors (deviceCode, sensorId)
```

但代码层有两个问题：

1. **旧接口未迁移**：`device.service.ts`、`deviceCrud.service.ts` 等文件仍然对外暴露 `deviceId` 接口，内部通过 `nodeId = deviceId = code` 的假设做翻译。一旦编码规则启用（`nodeId ≠ code`），这个假设就会断裂。

2. **数据流层 ID 混淆**：Kafka 消息、ClickHouse 写入、事件系统全部使用 `deviceId`，但存入数据库时映射到 `nodeId` 字段。这意味着：
   - ClickHouse 中的 `device_id` 列存的可能是 nodeId，也可能是 deviceCode
   - anomaly_detections 表的 `nodeId` 字段存的实际上是 deviceId
   - event_logs 表的 `nodeId` 字段存的可能是 deviceId

## 四、影响范围统计

| 层级 | deviceId 引用 | deviceCode 引用 | nodeId 引用 | 受影响文件数 |
|------|--------------|----------------|------------|------------|
| Schema | 1 (旧残留) | 29 | 20 | 1 |
| Service | ~180 | ~100 | ~120 | 15 |
| Router | ~50 | ~30 | ~60 | 5 |
| Platform | ~40 | 0 | ~10 | 6 |
| Lib | ~100 | ~40 | ~60 | 6 |
| 前端 | ~10 | 0 | 0 | 5 |
| **总计** | **~372** | **~199** | **~276** | **~38** |
