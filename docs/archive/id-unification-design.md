# 设备 ID 体系统一收敛方案

**版本**：v1.0  
**日期**：2026-02-19  
**状态**：待审阅

---

## 一、设计原则

本方案遵循以下原则：

1. **Schema 不动**：现有 schema 设计是正确的，不修改表结构和字段名。`asset_nodes.nodeId`、`asset_nodes.code`（即 deviceCode）、`asset_sensors.sensorId` 三个字段各有明确语义，不需要合并。

2. **消灭 deviceId**：`deviceId` 是旧体系残留，在新 schema 中没有对应字段。所有代码中的 `deviceId` 必须明确映射到 `nodeId` 或 `deviceCode`。

3. **打破等号假设**：`nodeId ≠ code(deviceCode)` 是正常状态（编码规则启用后）。所有假设三者相等的代码必须修正。

4. **分层收敛**：从底层（类型定义）到顶层（API 接口）逐层修复，确保每一层的 ID 语义清晰。

---

## 二、ID 语义规范

修复后，整个平台统一使用以下 ID 体系：

| ID 字段 | 语义 | 权威来源 | 使用场景 |
|---------|------|----------|----------|
| `nodeId` | 设备树节点唯一标识 | `asset_nodes.node_id` | 设备树操作、事件关联、异常检测、告警 |
| `deviceCode` | 设备编码（可由编码规则生成） | `asset_nodes.code` | 测点关联、传感器关联、遥测数据、协议配置 |
| `sensorId` | 传感器唯一标识 | `asset_sensors.sensor_id` | 传感器数据采集、校准、映射 |
| `mpId` | 测点唯一标识 | `asset_measurement_points.mp_id` | 测点配置、阈值管理 |

**关键关系链**：
```
asset_nodes (nodeId, code=deviceCode)
    ↓ nodeId
asset_measurement_points (mpId, nodeId, deviceCode)
    ↓ deviceCode, mpId
asset_sensors (deviceCode, sensorId, mpId)
```

**deviceId 的映射规则**：

在现有代码中，`deviceId` 实际上承担了两种不同的角色，需要根据上下文分别映射：

| 使用上下文 | deviceId 实际含义 | 映射目标 | 判断依据 |
|-----------|------------------|----------|----------|
| 设备树操作（CRUD） | 设备节点标识 | `nodeId` | 用于查 `asset_nodes.nodeId` |
| 数据流（Kafka/ClickHouse） | 设备编码 | `deviceCode` | 用于关联传感器和遥测数据 |
| 事件系统 | 设备节点标识 | `nodeId` | 用于事件溯源和告警 |
| 缓存键 | 设备编码 | `deviceCode` | 用于传感器数据缓存 |
| gRPC 接口 | 设备节点标识 | `nodeId` | 用于外部系统交互 |
| 认知引擎 | 设备节点标识 | `nodeId` | 用于感知处理和诊断 |

---

## 三、修复策略

### 3.1 核心类型定义层 (`server/core/types/domain.ts`)

**修改内容**：

将 `SensorReading` 接口中的 `deviceId` 改为 `deviceCode`，因为传感器读数通过 deviceCode 关联设备：

```typescript
// 修改前
export interface SensorReading {
  sensorId: string;
  deviceId: string;  // ← 语义不明
  ...
}

// 修改后
export interface SensorReading {
  sensorId: string;
  deviceCode: string;  // 设备编码，关联 asset_nodes.code
  /** @deprecated 使用 deviceCode 代替 */
  deviceId?: string;   // 向后兼容，过渡期保留
  ...
}
```

将 `AnomalyResult` 接口统一：

```typescript
// 修改前
export interface AnomalyResult {
  sensorId?: string;
  deviceId?: string;
  nodeId?: string;  // 与 deviceId 冲突
  ...
}

// 修改后
export interface AnomalyResult {
  sensorId?: string;
  nodeId: string;      // 设备树节点ID（权威字段）
  deviceCode?: string; // 设备编码（可选）
  /** @deprecated 使用 nodeId 代替 */
  deviceId?: string;   // 向后兼容
  ...
}
```

### 3.2 设备管理服务层

**device.service.ts** — 重构为适配层，明确 ID 映射：

```typescript
// 修改前（假设 nodeId == deviceId == code）
async createDevice(data: { deviceId: string; ... }) {
  await db.insert(assetNodes).values({
    nodeId: data.deviceId,     // ← 错误假设
    code: data.deviceId,       // ← 错误假设
    ...
  });
}

// 修改后（明确分离）
async createDevice(data: { nodeId: string; deviceCode?: string; ... }) {
  const code = data.deviceCode || data.nodeId; // deviceCode 默认等于 nodeId，但允许不同
  await db.insert(assetNodes).values({
    nodeId: data.nodeId,
    code: code,
    ...
  });
}
```

**deviceCrud.service.ts** — 同样修复，但保留 `deviceId` 参数名作为向后兼容别名：

```typescript
// 在接口层保留 deviceId 作为别名
async create(input: { deviceId: string; ... }) {
  // 内部统一映射
  const nodeId = input.deviceId;
  const deviceCode = input.deviceId; // 默认相同，后续可通过编码规则覆盖
  ...
}
```

### 3.3 数据流层

**kafkaStream.processor.ts** — 修正 anomaly_detections 写入：

```typescript
// 修改前
nodeId: result.deviceId,  // ← 语义混乱

// 修改后
nodeId: result.nodeId || result.deviceCode,  // 优先使用 nodeId
```

**streamProcessor.service.ts** — 重命名 `getDeviceIdForSensor` → `getDeviceCodeForSensor`：

```typescript
// 修改前
private async getDeviceIdForSensor(sensorId: string): Promise<string | null> {
  // 查的是 deviceCode，返回的叫 deviceId
  return result[0]?.deviceCode || null;
}

// 修改后
private async getDeviceCodeForSensor(sensorId: string): Promise<string | null> {
  return result[0]?.deviceCode || null;
}
```

**clickhouse.client.ts** — ClickHouse 列名 `device_id` 保持不变（避免数据迁移），但 TypeScript 接口映射到 `deviceCode`：

```typescript
// 写入时
device_id: r.deviceCode || r.deviceId,  // 兼容过渡

// 读取时
deviceCode: row.device_id,  // 明确语义
```

### 3.4 事件系统层

**eventBus.service.ts** — 统一使用 `nodeId`：

```typescript
// 修改前
nodeId: options.deviceId,  // ← 混乱

// 修改后
nodeId: options.nodeId || options.deviceId,  // 优先 nodeId，兼容 deviceId
```

### 3.5 认知引擎层

**cognition types/index.ts** — 将 `deviceId` 改为 `nodeId`：

```typescript
// 所有 deviceId 字段改为 nodeId
// 保留 deviceId 作为 @deprecated 别名
```

### 3.6 API 接口层

**deviceCrud.router.ts** — 保持 `deviceId` 参数名不变（前端兼容），但在 service 层内部映射：

```typescript
// Router 层保持 deviceId 参数名（前端不改）
create: protectedProcedure
  .input(z.object({ deviceId: z.string(), ... }))
  .mutation(({ input }) => deviceCrudService.create(input))

// Service 层内部做映射
async create(input: { deviceId: string; ... }) {
  const nodeId = input.deviceId;
  const deviceCode = input.deviceId; // 默认相同
  ...
}
```

### 3.7 前端层

前端代码中 `deviceId` 的使用量很小（5 个文件，约 10 处），暂不修改。前端通过 tRPC 调用，参数名保持 `deviceId`，由 service 层做映射。

---

## 四、向后兼容策略

为了避免一次性全量修改导致的风险，采用以下渐进策略：

1. **Phase 1（本次实施）**：在核心类型定义中添加 `deviceCode` 字段，保留 `deviceId` 作为 `@deprecated` 别名。修复所有"假设三者相等"的代码。修复数据流层的 ID 映射。

2. **Phase 2（后续）**：前端逐步从 `deviceId` 迁移到 `nodeId`/`deviceCode`。ClickHouse 列名 `device_id` 保持不变。

3. **Phase 3（最终）**：移除所有 `@deprecated` 的 `deviceId` 字段。

---

## 五、修改文件清单

| 文件 | 修改类型 | 优先级 |
|------|----------|--------|
| `server/core/types/domain.ts` | 类型定义统一 | P0 |
| `server/services/device.service.ts` | 打破等号假设 | P0 |
| `server/services/deviceCrud.service.ts` | 打破等号假设 | P0 |
| `server/services/eventBus.service.ts` | ID 映射修正 | P0 |
| `server/services/kafkaStream.processor.ts` | ID 映射修正 | P0 |
| `server/services/streamProcessor.service.ts` | 方法重命名 + ID 修正 | P0 |
| `server/lib/clients/clickhouse.client.ts` | 接口映射修正 | P0 |
| `server/lib/cache/cacheService.ts` | 缓存键修正 | P1 |
| `server/platform/cognition/types/index.ts` | 类型定义统一 | P1 |
| `server/platform/cognition/engines/cognition-unit.ts` | ID 字段修正 | P1 |
| `server/platform/cognition/dimensions/perception-processor.ts` | ID 字段修正 | P1 |
| `server/platform/cognition/events/emitter.ts` | ID 字段修正 | P1 |
| `server/platform/cognition/integration/pipeline-hooks.ts` | ID 字段修正 | P1 |

**预计修改**：13 个文件，约 200 处引用
