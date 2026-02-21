# 数字孪生系统工程设计方案

## 一、设计目标

将数字孪生从展示型 demo 升级为**商业级系统工程**，实现设备全生命周期的数字映射、仿真推演和历史回放。所有数据来自平台已有的数据链路，不使用 `Math.random()` 或硬编码假数据。

## 二、数据链路设计（复用平台已有表）

数字孪生的数据来源于平台已有的完整数据链路，不重复建设：

```
资产管理层                    传感器层                      遥测层                        认知层
┌──────────────┐           ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│ asset_nodes  │──1:N──→  │ asset_sensors │──采集──→  │ realtime_    │──诊断──→  │ cognition_   │
│ (设备资产树)  │           │ (传感器实例)   │           │ telemetry    │           │ sessions     │
│              │           │              │           │ (实时遥测)    │           │ (诊断会话)    │
│ + equipment_ │           │ + asset_     │           │              │           │ + world_model│
│   profiles   │           │   measurement│           │ + device_    │           │   _snapshots │
│ (设备物理模型)│           │   _points    │           │   alerts     │           │ (世界模型快照)│
└──────────────┘           └──────────────┘           └──────────────┘           └──────────────┘
```

### 关键表对应关系

| 功能 | 数据源表 | 字段说明 |
|---|---|---|
| 设备列表 | `asset_nodes` (nodeType='device') + `equipment_profiles` | 资产树中的设备节点 + 物理模型 |
| 传感器映射 | `asset_sensors` JOIN `asset_measurement_points` | 传感器实例 + 测点位置 |
| 实时数据 | `realtime_telemetry` | 最新遥测值（温度/振动/应力等） |
| 健康评估 | `cognition_sessions` + `cognition_dimension_results` | 认知诊断结果 |
| 世界模型 | `world_model_snapshots` + `world_model_predictions` | 状态向量 + 预测 |
| 告警状态 | `device_alerts` | 活跃告警 |
| 工况上下文 | `condition_profiles` + `condition_instances` | 当前工况 |

## 三、后端 API 设计

### 3.1 设备状态聚合（替代现有 listDigitalTwins）

**`evoPipeline.getEquipmentTwinState`** — 获取单台设备的完整孪生状态

```typescript
input: { equipmentId: string }  // asset_nodes.node_id
output: {
  // 基础信息（来自 asset_nodes + equipment_profiles）
  equipment: {
    nodeId, name, type, manufacturer, model, location, status,
    physicalConstraints, failureModes, worldModelConfig
  },
  // 传感器实时数据（来自 asset_sensors + realtime_telemetry）
  sensors: Array<{
    sensorId, name, position, physicalQuantity, unit,
    currentValue, warningThreshold, criticalThreshold,
    status: 'normal' | 'warning' | 'critical' | 'offline',
    lastReadingAt, trend: number[]  // 最近10个读数
  }>,
  // 健康评估（来自 cognition_sessions + cognition_dimension_results）
  health: {
    overallScore, dimensions: { perception, reasoning, fusion, decision },
    lastDiagnosisAt, diagnosisCount
  },
  // 世界模型快照（来自 world_model_snapshots）
  worldModel: {
    stateVector, healthIndex, constraints, predictions, conditionId
  },
  // 活跃告警（来自 device_alerts）
  activeAlerts: Array<{ alertId, type, title, severity, triggerValue, createdAt }>,
  // 当前工况（来自 condition_instances）
  currentCondition: { profileName, trigger, startedAt, stateSnapshot }
}
```

### 3.2 设备列表（替代现有 listDigitalTwins）

**`evoPipeline.listEquipmentTwins`** — 列出所有设备的孪生概览

```typescript
output: Array<{
  nodeId, name, type, location, status,
  sensorCount, activeSensorCount,
  healthScore,  // 来自最近一次 cognition_session
  activeAlertCount,
  syncStatus: 'synced' | 'stale' | 'disconnected',  // 基于 lastReadingAt
  lastSyncAt
}>
```

### 3.3 仿真推演 API

**`evoPipeline.simulation.create`** — 创建仿真场景（写入 DB）

```typescript
input: {
  equipmentId: string,
  name: string,
  description: string,
  scenarioType: 'overload' | 'thermal' | 'degradation' | 'resonance' | 'custom',
  parameters: Record<string, number>,  // 参数名→值
  baselineConditionId?: string  // 基准工况
}
// 写入新表 simulation_scenarios
```

**`evoPipeline.simulation.execute`** — 执行仿真（基于物理模型计算）

```typescript
input: { scenarioId: number, equipmentId: string }
output: {
  timeline: Array<{ t: number, stateVector: Record<string, number> }>,
  riskAssessment: { maxStress, fatigueAccumulation, estimatedRUL },
  warnings: string[]
}
// 基于 equipment_profiles.physicalConstraints 和 worldModelConfig 进行推演
// 结果写入 world_model_predictions
```

**`evoPipeline.simulation.compare`** — 多方案对比

```typescript
input: { scenarioIds: number[] }
output: Array<{ scenarioId, name, parameters, results: SimulationResult }>
```

### 3.4 历史回放 API

**`evoPipeline.replay.getTimeRange`** — 获取设备可回放的时间范围

```typescript
input: { equipmentId: string }
output: { 
  earliest: Date, latest: Date,
  eventCount: number,
  dataPointCount: number
}
// 基于 realtime_telemetry 的时间范围
```

**`evoPipeline.replay.getData`** — 获取指定时间段的多通道回放数据

```typescript
input: {
  equipmentId: string,
  startTime: Date, endTime: Date,
  channels: string[],  // sensor_id 列表
  resolution: 'raw' | '1s' | '10s' | '1m' | '5m'  // 降采样
}
output: {
  channels: Array<{
    sensorId, name, unit,
    data: Array<{ t: number, v: number, isAnomaly: boolean }>
  }>,
  events: Array<{
    timestamp, type: 'alert' | 'diagnosis' | 'condition_change',
    title, severity, details
  }>
}
// 从 realtime_telemetry 查询 + device_alerts + cognition_sessions 事件叠加
```

## 四、需要新增的数据库表

### 4.1 simulation_scenarios（仿真场景表）

```sql
CREATE TABLE simulation_scenarios (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  equipment_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  scenario_type ENUM('overload','thermal','degradation','resonance','custom') NOT NULL,
  parameters JSON NOT NULL,
  baseline_condition_id VARCHAR(100),
  status ENUM('draft','running','completed','failed') NOT NULL DEFAULT 'draft',
  result JSON,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  INDEX idx_ss_equipment (equipment_id),
  INDEX idx_ss_status (status)
);
```

### 4.2 需要补充的 Seed 数据

- `world_model_snapshots`：为 5 台设备各生成 3 个快照（含状态向量、健康指数、预测）
- `realtime_telemetry`：为每台设备的传感器生成最近 24 小时的遥测数据（每分钟 1 条）
- `condition_instances`：为每台设备生成 2-3 个工况实例
- `simulation_scenarios`：预置 4 个仿真场景

## 五、前端三面板设计

### 5.1 设备状态面板

**布局：** 左侧设备选择器（树形结构） + 右侧设备详情

**设备详情区域：**
- **顶部**：设备信息卡（名称、型号、位置、状态徽章、健康评分仪表盘）
- **中部**：设备 SVG 示意图（测点位置标注 + 传感器实时值映射 + 异常红色高亮）
- **底部**：传感器数据表格（通道名、当前值、阈值、状态、趋势迷你图）+ 活跃告警列表

**数据刷新：** 5 秒轮询 `getEquipmentTwinState`

### 5.2 仿真推演面板

**布局：** 上方场景列表 + 下方推演工作台

**场景列表：**
- 表格展示已有场景（名称、类型、参数、状态、创建时间）
- 创建新场景按钮 → 弹出配置对话框（选择设备、场景类型、参数滑块调节）

**推演工作台：**
- 参数面板：滑块调节仿真参数（负载比、温度、转速等），实时预览参数变化
- 执行按钮 → 显示推演进度
- 结果可视化：时序图（Chart.js）展示状态向量随时间变化、风险评估卡片
- 多方案对比：选择多个已完成的场景 → 并排展示对比图表

### 5.3 历史回放面板

**布局：** 顶部时间轴控制器 + 中部多通道数据图 + 底部事件列表

**时间轴控制器：**
- 播放/暂停/快进(2x/4x/8x)/倒退按钮
- 时间范围选择器（日期选择 + 时间精度）
- 进度条（可拖拽跳转）
- 当前时间显示

**多通道数据图：**
- 每个传感器通道一条折线（Chart.js 多数据集）
- 异常点红色标注
- 阈值线（虚线）

**事件标注：**
- 告警事件（红色标记）
- 诊断事件（蓝色标记）
- 工况切换事件（绿色标记）
- 点击事件 → 跳转到对应时间点

## 六、与平台已有模块的集成

| 集成点 | 方式 | 说明 |
|---|---|---|
| 资产管理 | 复用 `asset_nodes` + `asset_sensors` | 设备树和传感器配置来自资产管理模块 |
| 数据接入 | 复用 `realtime_telemetry` | 遥测数据来自边缘网关采集链路 |
| 认知诊断 | 复用 `cognition_sessions` | 健康评估来自认知中枢诊断结果 |
| 护栏系统 | 复用 `device_alerts` | 告警来自护栏规则触发 |
| 工况管理 | 复用 `condition_profiles` / `condition_instances` | 工况上下文来自感知层 |
| 知识层 | 复用 `world_model_snapshots` | 世界模型来自知识沉淀 |

**不重复建设，完全复用平台已有数据链路。**
