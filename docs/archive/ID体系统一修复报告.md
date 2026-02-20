# 设备模型 ID 体系统一修复报告

**项目**: xilian-platform  
**Commit**: `a678f52`  
**修改范围**: 20 files, +1,093 / -108 lines  
**日期**: 2026-02-19

---

## 一、问题诊断

### 1.1 背景

Schema 设计采用了正确的工业 IoT 设备树模型：

| 表 | 主键/标识 | 语义 |
|---|---|---|
| `asset_nodes` | `nodeId` (UUID) | 设备树节点唯一标识 |
| `asset_nodes` | `code` (varchar) | 设备编码（编码规则生成） |
| `asset_sensors` | `sensorId` (varchar) | 传感器唯一标识 |
| `asset_sensors` | `deviceCode` (varchar) | 所属设备编码（FK→asset_nodes.code） |

### 1.2 核心矛盾

代码中存在第四个 ID —— `deviceId`，在不同上下文中被混用为以下三种含义：

| 上下文 | `deviceId` 实际含义 | 正确字段 |
|---|---|---|
| 设备树操作、事件系统、认知引擎 | 设备树节点ID | `nodeId` |
| 数据流（Kafka→ClickHouse）、传感器关联 | 设备编码 | `deviceCode` |
| 模拟器内部 | 两者混用 | 取决于场景 |

### 1.3 危险假设

`device.service.ts` 和 `deviceCrud.service.ts` 中存在隐含假设：

> `nodeId == code == deviceId`

一旦编码规则启用（nodeId ≠ code），数据一致性立即断裂。

### 1.4 影响范围

修复前统计：

| 层 | `deviceId` 引用数 |
|---|---|
| server/services/ | 217 |
| server/platform/ | 16 |
| server/api/ | 49 |
| drizzle/ | 1 |
| client/ | 89 |
| **总计** | **372** |

---

## 二、修复策略

### 2.1 设计原则

1. **Schema 不动** — 现有 schema 设计是正确的
2. **消灭 deviceId 歧义** — 根据上下文将 `deviceId` 明确映射到 `nodeId` 或 `deviceCode`
3. **打破等号假设** — 修复所有假设 `nodeId == code == deviceId` 的代码
4. **向后兼容** — 保留 `@deprecated deviceId` 别名，Router 层参数名不变

### 2.2 映射规则

```
deviceId → nodeId    （设备树操作、事件元数据、认知引擎上下文）
deviceId → deviceCode（数据流、传感器关联、遥测数据、异常检测）
```

---

## 三、修复清单

### 3.1 Schema 层（1 文件）

| 文件 | 修改 |
|---|---|
| `drizzle/schema.ts` | `rollback_executions` JSON 字段注释 `deviceId` → `nodeId` |

### 3.2 核心类型层（2 文件）

| 文件 | 修改 |
|---|---|
| `server/core/types/domain.ts` | `SensorReading`、`AnomalyResult`、`AggregateResult`、`Event` 添加 `nodeId`/`deviceCode`，标记 `deviceId` 为 `@deprecated` |
| `server/platform/cognition/types/index.ts` | `CognitionStimulus`、`OCTransitionEvent`、`ToolExecutionContext` 添加 `nodeId`，标记 `deviceId` 为 `@deprecated` |

### 3.3 认知引擎层（5 文件）

| 文件 | 修改 |
|---|---|
| `cognition-unit.ts` | `DimensionContext` 添加 `nodeId`，构造时优先 `stimulus.nodeId` |
| `perception-processor.ts` | `resolveBaseline()` 优先 `nodeId`，回退 `deviceId` |
| `emitter.ts` | `emitDataCollected()`、`emitDriftDetected()` 参数改为 `nodeId` 必填 |
| `pipeline-hooks.ts` | 消除 payload 中重复 `nodeId`，context 类型添加 `deviceNodeId` |
| `meta-learner.ts` | `MetaLearnerQuery` 添加 `nodeId` |

### 3.4 数据流层（2 文件）

| 文件 | 修改 |
|---|---|
| `kafkaStream.processor.ts` | `DataPoint.deviceId` → `deviceCode`，`AnomalyResult.deviceId` → `deviceCode`，所有窗口键、缓冲键、Kafka 消息键统一使用 `deviceCode`，查询接口添加 `nodeId`/`deviceCode` 参数 |
| `streamProcessor.service.ts` | `processReading()` 兼容 `deviceCode`/`deviceId`，`getDeviceIdForSensor()` → `getDeviceCodeForSensor()`，事件 payload 存储统一为 `deviceCode` |

### 3.5 业务服务层（3 文件）

| 文件 | 修改 |
|---|---|
| `device.service.ts` | 事件发布统一使用 `nodeId` 参数（模拟器心跳、传感器读数、异常注入） |
| `deviceCrud.service.ts` | 响应对象添加 `nodeId`/`deviceCode` 字段映射 |
| `eventBus.service.ts` | `publish()` 元数据支持 `nodeId`，`persistEvent()` 存储 `nodeId` |

### 3.6 Router 层（保持不变）

Router 层的 `deviceId` 参数名是前端 API 契约的一部分，**保持不变**以确保前端兼容。后端内部已完成正确映射。

---

## 四、兼容性保障

### 4.1 向后兼容

所有修改均保留 `deviceId` 作为 `@deprecated` 别名：

```typescript
// 类型定义中
nodeId?: string;           // 新增，权威标识
/** @deprecated 使用 nodeId 代替 */
deviceId?: string;         // 保留，兼容

// 数据流入口
const deviceCode = data.deviceCode || data.deviceId;  // 优先新字段，回退旧字段
```

### 4.2 前端零改动

Router 层参数名不变，前端无需任何修改即可正常工作。

### 4.3 数据存储兼容

已有数据中 `nodeId` 字段存储的 `deviceId` 值在编码规则未启用时仍然正确（因为此时 nodeId == code）。

---

## 五、后续建议

| 优先级 | 建议 | 说明 |
|---|---|---|
| P1 | 前端逐步迁移 | 将前端 `deviceId` 参数逐步替换为 `nodeId`/`deviceCode` |
| P1 | ClickHouse 列别名 | 为 `device_id` 列添加 `device_code` 别名 |
| P2 | 数据迁移脚本 | 编码规则启用后，回填 `nodeId` 字段的真实值 |
| P2 | 删除 deprecated | 6 个月后移除所有 `@deprecated deviceId` 别名 |

---

## 六、文件变更汇总

```
drizzle/schema.ts                                    |   2 +-
server/core/types/domain.ts                          |  32 ++-
server/platform/cognition/dimensions/perception-processor.ts |  11 +-
server/platform/cognition/engines/cognition-unit.ts  |   7 +-
server/platform/cognition/engines/meta-learner.ts    |   4 +-
server/platform/cognition/events/emitter.ts          |  10 +-
server/platform/cognition/integration/pipeline-hooks.ts |   9 +-
server/platform/cognition/types/index.ts             |  16 +-
server/services/device.service.ts                    |  67 ++++--
server/services/deviceCrud.service.ts                |  67 ++++--
server/services/eventBus.service.ts                  |  32 ++-
server/services/kafkaStream.processor.ts             |  58 +++--
server/services/streamProcessor.service.ts           |  39 ++--
```

**13 个核心文件修改，+1,093 / -108 行**
