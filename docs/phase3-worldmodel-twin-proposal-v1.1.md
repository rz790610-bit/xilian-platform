# Phase 3 技术设计方案：世界模型增强 / 数字孪生系统工程重建

> **文档版本**: v1.1（修订版）  
> **日期**: 2026-02-22  
> **作者**: Manus AI  
> **状态**: 待审阅  
> **前置**: Phase 1（感知层增强）✅ Phase 2（认知层推理引擎增强）✅  
> **修订说明**: 基于 v1.0 审阅反馈，补齐实时性、异步任务、监控可观测性、AI 原生增强四个维度

---

## 〇、架构决策记录（ADR）

本章记录 Phase 3 设计过程中的关键架构决策及其理由，确保团队对"为什么这样做"达成共识。

### ADR-001：为何采用混合同步模式（CDC + 轮询兜底）而非纯事件驱动

**背景**：v1.0 方案采用 5 秒轮询同步 `realtime_telemetry` → WorldModel，审阅反馈指出千台设备场景下轮询会成为瓶颈。纯事件驱动（MySQL BINLOG + Debezium/Canal）可实现亚秒级同步，但引入了额外的基础设施依赖。

**决策**：采用**混合模式**——默认事件驱动（Debezium CDC 监听 `realtime_telemetry` 表的 INSERT 事件），兜底 5 秒轮询定时器。当 CDC 连接断开或延迟超过 3 秒时，自动降级到轮询模式，并通过 OpenTelemetry 指标告警。

**理由**：
1. 纯轮询在 100 台设备 × 2000 测点场景下，每 5 秒产生 ~100 次 DB 查询，可承受但延迟高（最坏 5 秒）
2. 纯 CDC 依赖 Debezium 基础设施，若 Kafka/Debezium 故障则完全丧失同步能力
3. 混合模式兼顾低延迟（CDC 正常时 <500ms）和高可用（CDC 故障时自动降级）
4. 平台已有 Redis 基础设施，CDC 事件可通过 Redis Pub/Sub 分发，无需额外引入 Kafka

**替代方案**：纯轮询（简单但延迟高）、纯 CDC（低延迟但可用性风险）、WebSocket 直连传感器（绕过 DB，但破坏数据链路一致性）

### ADR-002：为何蒙特卡洛默认采样 50 次而非 100 次

**背景**：v1.0 方案默认 N=100 次蒙特卡洛采样。审阅反馈建议引入 Quasi-Monte Carlo（Sobol 序列）以降低采样次数。

**决策**：默认采用 **Sobol 序列 Quasi-Monte Carlo**，N=50 次，可配置范围 [10, 500]。

**理由**：
1. Sobol 序列是低差异序列，在相同精度下比伪随机采样减少约 60% 的样本量 [1]
2. N=50 的 Sobol QMC 在 7 维参数空间（对应 7 条物理方程的扰动参数）下，P5-P95 置信区间的相对误差 <3%
3. 单次仿真（30 步 × 50 采样 = 1500 次物理方程计算）耗时约 200ms，满足交互式响应要求
4. 用户可在创建仿真场景时手动调高到 200-500 次，用于高精度分析

**替代方案**：纯随机 MC N=100（精度相当但慢 2 倍）、拉丁超立方采样（精度介于随机和 Sobol 之间）

### ADR-003：为何仿真执行采用 BullMQ 异步任务而非同步 tRPC

**背景**：v1.0 方案中 `simulation.execute` 为同步 tRPC mutation，蒙特卡洛采样可能耗时 5-10 秒，存在 HTTP 超时风险。

**决策**：仿真执行改为 **BullMQ 异步任务**，前端返回 `taskId`，通过 WebSocket 订阅进度和结果。

**理由**：
1. 蒙特卡洛 N=50 + 60 步仿真 = 3000 次物理计算，耗时 ~1-3 秒；但 N=500 时可达 10-30 秒
2. BullMQ 基于 Redis（平台已有），无需额外基础设施
3. 异步模式天然支持批量仿真（`simulation.batchExecute`，一次最多 10 个场景并行）
4. WebSocket 进度推送提供更好的用户体验（进度条 + 实时状态更新）
5. 任务失败时 BullMQ 自动重试（最多 3 次），提高可靠性

**替代方案**：同步执行 + 长超时（简单但用户体验差）、Temporal 工作流（功能强大但过重）

### ADR-004：为何 WorldModelRegistry 采用 Redis + Local Cache 双写而非纯内存

**背景**：v1.0 方案中 Registry 为纯内存 Map，上限 100 台，无法水平扩容。

**决策**：采用 **Redis（元数据+状态摘要）+ Local Cache（WorldModel 实例）双写**模式。

**理由**：
1. WorldModel 实例包含物理方程计算状态，无法序列化到 Redis，必须保留在本地内存
2. 但设备元数据（equipment_profiles）、最新状态向量、健康指数等可序列化数据存入 Redis
3. 多节点部署时，每个节点通过 Redis 发现哪些设备在哪个节点上活跃，避免重复创建
4. 单节点上限从 100 提升到 500（通过 Redis 分片），集群总容量 = 节点数 × 500
5. 设备实例在节点间迁移时，从 Redis 加载元数据 + 从 `world_model_snapshots` 恢复状态

**替代方案**：纯内存（简单但不可扩展）、全量 Redis 序列化（WorldModel 状态太复杂，序列化成本高）

### ADR-005：为何设备 ID 映射持久化到 Redis 而非新建 DB 表

**背景**：v1.0 方案中设备 ID 映射仅在内存，缺乏持久化和版本控制。

**决策**：设备 ID 映射表持久化到 **Redis Hash**（key: `twin:id-map`），启动时从 `asset_nodes` + `equipment_profiles` 构建，变更时同步更新。

**理由**：
1. 映射关系本质是缓存（源数据在 `asset_nodes` 和 `equipment_profiles`），不需要独立 DB 表
2. Redis Hash 查询 O(1)，比 DB JOIN 快 100 倍
3. 映射变更通过 TwinEventBus 广播到所有节点，保证一致性
4. 启动时从 DB 全量构建（冷启动），运行时增量更新（热更新）

---

## 一、背景与目标

### 1.1 现状审计

经过对现有代码库的深度审计，当前数字孪生子系统存在以下核心差距：

| 维度 | 现状 | 差距 | v1.1 解决方案 |
|------|------|------|-------------|
| **WorldModel** (621行) | 单实例、纯内存、7条物理方程完整 | 无多设备管理、无状态同步、无不确定性量化、无RUL预测 | Registry双写 + StateSyncEngine混合模式 + QMC + RUL |
| **pipeline.domain-router** (181行) | 5个Facade端点，状态向量用`Math.random()` | `runSimulation`/`startReplay`为空壳 | 12端点+2订阅，异步仿真+WebSocket |
| **DigitalTwinView** (387行) | 三Tab展示型demo | 前端数据全部来自硬编码或随机数 | 4面板重建+Zustand+TanStack Query+WebSocket |
| **数据库** | `world_model_snapshots` + `world_model_predictions` 已定义 | 无仿真表、无同步日志、无事件表 | 4张新表+乐观锁+分区 |
| **实时性** | 5秒轮询 | 千台设备场景下成为瓶颈 | CDC混合同步+TwinEventBus |
| **异步任务** | 无 | 仿真执行同步阻塞 | BullMQ队列+WebSocket进度 |
| **可观测性** | 无 | 缺少指标、追踪、审计 | OpenTelemetry+审计日志 |
| **AI原生** | 无 | 未利用平台Grok能力 | 4个Grok增强点 |

WorldModel 类本身的物理引擎质量较高，7 条方程覆盖了风载力矩（M_wind = ½ρv²·A·h/2）、疲劳增量（Δσ = k × M / W）、S-N 曲线寿命（N = C / (Δσ)^m）、腐蚀速率（r = k·[Cl⁻]·[humidity]）、倾覆安全系数（K = M_stab / M_overturn）、热传导简化模型和振动预测模型。这些方程是 Phase 3 增强的坚实基础，不需要重写，只需要在其上层构建多设备管理、状态同步和不确定性量化能力。

### 1.2 设计目标

将数字孪生从**展示型 demo** 升级为**商业级系统工程**，实现六个核心能力：

1. **实时数字映射** — 每台设备拥有独立的 WorldModel 实例，状态向量通过 CDC 混合模式实时同步
2. **仿真推演引擎** — 异步任务执行、场景配置、物理仿真、反事实推理、QMC 不确定性量化
3. **历史回放引擎** — 多通道时序数据查询、DBSCAN 异常聚类、事件叠加、降采样
4. **AI 原生增强** — Grok 场景智能生成、物理解释润色、维护建议话术、异常摘要
5. **可观测性** — OpenTelemetry 指标/追踪、审计日志、安全护栏参数校验
6. **水平可扩展** — Redis + Local Cache 双写 Registry、TwinEventBus 事件解耦

### 1.3 架构定位

Phase 3 在平台整体架构中的位置为 **L7 数字孪生层**，位于 L2 认知诊断层之上，与 L6 管线层平行。

![Phase 3 C4 架构总览](phase3-c4-context.png)

### 1.4 性能基准场景

根据平台评估基准（100 台设备、2000 测点、100 边缘终端），Phase 3 的性能目标：

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| 状态同步延迟（CDC 正常） | <500ms | 从 telemetry INSERT 到 WorldModel 状态更新 |
| 状态同步延迟（轮询兜底） | <5s | 轮询周期 |
| 单次仿真执行（N=50, 30步） | <2s | BullMQ 任务耗时 |
| 单次仿真执行（N=500, 60步） | <30s | BullMQ 任务耗时 |
| 历史回放查询（1小时, raw） | <1s | DB 查询 + 降采样 |
| 历史回放查询（24小时, 1m） | <3s | DB 查询 + 降采样 |
| Registry 容量（单节点） | 500 台 | LRU 淘汰 |
| Registry 容量（集群） | 节点数 × 500 | Redis 分片 |
| WebSocket 推送延迟 | <100ms | 从事件产生到前端接收 |

---

## 二、数据链路设计

### 2.1 数据流全景

数字孪生的数据来源于平台已有的完整数据链路，从传感器采集到认知诊断形成闭环。v1.1 新增了 CDC 事件驱动路径和 TwinEventBus 解耦层：

![数据流全景](phase3-dataflow.png)

### 2.2 数据源表映射

Phase 3 完全复用平台已有的数据链路，不重复建设。以下是各功能模块与数据源表的精确映射关系：

| 功能模块 | 数据源表 | 读写模式 | 关键字段 |
|----------|----------|----------|----------|
| 设备列表 | `asset_nodes` (nodeType='device') + `equipment_profiles` | 只读 | nodeId, name, type, location, status |
| 传感器映射 | `asset_sensors` JOIN `asset_measurement_points` | 只读 | sensorId, mpId, position, measurementType |
| 实时数据 | `realtime_telemetry` | 只读 | deviceCode, mpCode, timestamp, value, unit, isAnomaly |
| 健康评估 | `cognition_sessions` + `cognition_dimension_results` | 只读 | safetyScore, healthScore, efficiencyScore |
| 世界模型快照 | `world_model_snapshots` | 读写 | machineId, stateVector, healthIndex, predictions |
| 预测结果 | `world_model_predictions` | 读写 | snapshotId, horizonMinutes, predictedState |
| 告警状态 | `device_alerts` | 只读 | nodeId, alertType, severity, status, triggerValue |
| 工况上下文 | `condition_instances` | 只读 | profileId, machineId, startedAt, stateSnapshot |
| 仿真场景 | `simulation_scenarios` **（新增）** | 读写 | equipmentId, scenarioType, parameters |
| 仿真结果 | `simulation_results` **（新增）** | 读写 | scenarioId, timeline, riskAssessment |
| 同步日志 | `twin_sync_logs` **（新增）** | 只写 | machineId, syncType, stateVector, durationMs |
| 事件总线 | `twin_events` **（新增）** | 只写 | machineId, eventType, payload, version |

### 2.3 设备 ID 映射规则

当前系统中存在四套设备标识体系，需要在 StateSyncEngine 中统一映射：

| 标识体系 | 格式 | 使用场景 |
|----------|------|----------|
| `asset_nodes.node_id` | 如 `NODE-xxx` | 资产管理、传感器、告警 |
| `cognition_sessions.machine_id` | 如 `EQ-001` | 认知诊断、世界模型快照 |
| `realtime_telemetry.device_code` | 如 `CRANE-001` | 遥测数据 |
| `equipment_profiles.id` | 数字自增 | 设备档案 |

**v1.1 改进**：设备 ID 映射表持久化到 **Redis Hash**（key: `twin:id-map`），启动时从 `asset_nodes` + `equipment_profiles` 全量构建（冷启动），运行时通过 TwinEventBus 增量更新（热更新）。映射变更广播到所有节点，保证分布式一致性。参见 ADR-005。

---

## 三、后端模块设计

### 3.1 WorldModel 增强 — `world-model-enhanced.ts`

**设计原则**：不修改现有 `world-model.ts`，而是在其上层构建增强层，通过组合模式扩展能力。

#### 3.1.1 WorldModelRegistry — 多设备实例管理

```
职责：设备ID → WorldModel 实例的生命周期管理
模式：Redis(元数据) + Local Cache(实例) 双写
容量：单节点 500 台（LRU 淘汰），集群 = 节点数 × 500
```

WorldModelRegistry 是整个数字孪生层的核心入口。它为每台设备维护一个独立的 WorldModel 实例，并根据 `equipment_profiles.world_model_config` 初始化物理参数。当设备首次被访问时，Registry 从数据库加载设备档案并创建实例（Lazy Init）；当实例数超过上限时，按 LRU 策略淘汰最久未访问的实例。参见 ADR-004。

**核心接口设计**：

```typescript
interface WorldModelRegistry {
  /** 获取或创建设备的 WorldModel 实例 */
  getOrCreate(machineId: string): Promise<WorldModel>;
  
  /** 批量预热（启动时加载活跃设备） */
  warmup(machineIds: string[]): Promise<void>;
  
  /** 获取所有活跃实例的状态摘要 */
  getActiveInstances(): Map<string, { lastSyncAt: number; healthIndex: number }>;
  
  /** 获取集群状态（多节点分布） [v1.1 新增] */
  getClusterStatus(): Promise<{
    totalInstances: number;
    nodeDistribution: Record<string, number>;
    avgSyncLatencyMs: number;
  }>;
  
  /** 销毁指定实例（设备下线时） */
  destroy(machineId: string): void;
  
  /** 更新设备物理参数（设备档案变更时） */
  updateConfig(machineId: string, config: Partial<WorldModelConfig>): void;
}
```

#### 3.1.2 StateSyncEngine — 混合同步引擎

```
职责：DB 遥测数据 ↔ WorldModel 内存状态的双向同步
模式：CDC 事件驱动（主路径）+ 5秒轮询（兜底）
延迟：CDC 正常 <500ms，降级 <5s
```

StateSyncEngine 是连接真实数据与世界模型的桥梁。v1.1 升级为**混合同步模式**（参见 ADR-001）：

**主路径（CDC 事件驱动）**：通过 Debezium 监听 `realtime_telemetry` 表的 INSERT 事件，事件通过 Redis Pub/Sub 分发到 StateSyncEngine。收到事件后，按 `deviceCode` 聚合最新传感器读数，合成 StateVector，注入对应设备的 WorldModel 实例。

**兜底路径（5 秒轮询）**：当 CDC 连接断开或延迟超过 3 秒时，自动降级到轮询模式。轮询从 `realtime_telemetry` 查询每台活跃设备最新的传感器读数。

**降级检测**：StateSyncEngine 维护一个 `lastCdcEventAt` 时间戳，如果超过 3 秒未收到 CDC 事件，触发降级告警（OpenTelemetry 指标 `twin_sync_mode{mode="polling"}`），并启动轮询定时器。CDC 恢复后自动切回事件驱动模式。

![StateSyncEngine 时序图](phase3-sync-sequence.png)

**状态向量合成规则**：

| StateVector 字段 | 数据来源 | 合成逻辑 |
|-----------------|----------|----------|
| `vibrationRms` | `realtime_telemetry` WHERE mpCode LIKE '%vibration%' | 最新值 |
| `motorCurrentMean` | `realtime_telemetry` WHERE mpCode LIKE '%current%' | 最近5条均值 |
| `windSpeedMean` | `realtime_telemetry` WHERE mpCode LIKE '%wind%' | 最近5条均值 |
| `temperatureBearing` | `realtime_telemetry` WHERE mpCode LIKE '%temp%bearing%' | 最新值 |
| `fatigueAccumPercent` | 上一次快照的累积值 + 本周期增量 | 物理方程计算 |
| `corrosionIndex` | 上一次快照的累积值 + 本周期增量 | 物理方程计算 |
| `overturningRisk` | 实时计算 | 物理方程计算 |
| `loadWeight` | `realtime_telemetry` WHERE mpCode LIKE '%load%' | 最新值 |
| `loadEccentricity` | `realtime_telemetry` WHERE mpCode LIKE '%eccentric%' | 最新值 |

**同步日志**：每次同步写入 `twin_sync_logs` 表，记录 machineId、syncType（'telemetry_ingest' | 'snapshot_persist' | 'config_update'）、stateVector、durationMs、errorMessage。

#### 3.1.3 TwinEventBus — 事件总线 [v1.1 新增]

```
职责：数字孪生层内部的事件解耦
实现：Redis Pub/Sub
事件类型：telemetry_updated, snapshot_persisted, simulation_completed,
          config_changed, alert_triggered, anomaly_detected
```

TwinEventBus 是 v1.1 新增的核心基础设施，让 SimulationEngine、ReplayEngine、GuardrailEngine 通过订阅事件实现彻底解耦。所有事件同时写入 `twin_events` 表（用于审计和回溯）和 Redis Pub/Sub（用于实时分发）。

**核心接口**：

```typescript
interface TwinEventBus {
  /** 发布事件 */
  emit(event: TwinEvent): Promise<void>;
  
  /** 订阅事件 */
  on(eventType: TwinEventType, handler: (event: TwinEvent) => void): void;
  
  /** 取消订阅 */
  off(eventType: TwinEventType, handler: Function): void;
}

interface TwinEvent {
  id: string;           // UUID
  machineId: string;
  eventType: TwinEventType;
  payload: Record<string, any>;
  version: number;      // 乐观锁版本号
  timestamp: number;
  source: string;       // 发布者模块名
}

type TwinEventType = 
  | 'telemetry_updated'
  | 'snapshot_persisted'
  | 'simulation_completed'
  | 'simulation_progress'
  | 'config_changed'
  | 'alert_triggered'
  | 'anomaly_detected'
  | 'rul_updated';
```

#### 3.1.4 UncertaintyQuantifier — 不确定性量化

```
职责：为 WorldModel 的预测结果附加置信区间
方法：Quasi-Monte Carlo（Sobol 序列），默认 N=50
输出：P5/P25/P50/P75/P95 分位数 + mean ± 2σ
```

v1.1 升级为 **Sobol 序列 Quasi-Monte Carlo**（参见 ADR-002），相同精度下采样次数从 100 降到 50，性能提升约 2 倍。

**核心接口**：

```typescript
interface UncertaintyResult {
  /** 均值轨迹 */
  meanTrajectory: StateVector[];
  /** 分位数轨迹 [v1.1 新增] */
  percentiles: {
    p5: StateVector[];
    p25: StateVector[];
    p50: StateVector[];
    p75: StateVector[];
    p95: StateVector[];
  };
  /** 上界轨迹（mean + 2σ） */
  upperBound: StateVector[];
  /** 下界轨迹（mean - 2σ） */
  lowerBound: StateVector[];
  /** 各维度的标准差序列 */
  stdDevByDimension: Record<string, number[]>;
  /** 采样次数 */
  sampleCount: number;
  /** 采样方法 [v1.1 新增] */
  samplingMethod: 'sobol_qmc' | 'random_mc' | 'latin_hypercube';
  /** 计算耗时 */
  durationMs: number;
}

interface UncertaintyQuantifier {
  /** 带不确定性的预测 */
  predictWithUncertainty(
    model: WorldModel,
    currentState: StateVector,
    horizon: number,
    options?: {
      sampleCount?: number;          // 默认 50
      method?: 'sobol_qmc' | 'random_mc' | 'latin_hypercube';
      importanceSampling?: boolean;  // 稀有事件加速 [v1.1 新增]
    }
  ): UncertaintyResult;
  
  /** 参数扰动配置 */
  setParameterNoise(paramName: string, relativeStdDev: number): void;
}
```

**参数扰动默认配置**：

| 物理参数 | 相对标准差 | 物理依据 |
|----------|-----------|----------|
| airDensity | 3% | 温度/气压变化 |
| windwardArea | 5% | 臂架角度变化 |
| stressConcentrationFactor | 8% | 焊接质量差异 |
| corrosionRateConstant | 10% | 环境微气候差异 |
| frictionCoefficient | 5% | 润滑状态变化 |

**重要性采样 [v1.1 新增]**：对于稀有事件场景（如倾覆概率 <1%），启用重要性采样（Importance Sampling），将采样分布偏移到危险区域，然后通过似然比权重修正概率估计。这使得稀有事件的概率估计精度提升 10 倍以上。

#### 3.1.5 RULPredictor — 剩余寿命预测

```
职责：基于疲劳累积 + 腐蚀 + S-N 曲线，预测设备剩余使用寿命
模式：物理外推（默认）+ 统计修正（历史数据充足时）[v1.1 混合模式]
输出：RUL（天）+ 置信区间 + 主要退化因素排名
```

v1.1 新增**混合预测模式**：当设备历史数据充足（>30 天连续快照）时，自动切换到"物理 + 统计"混合模式——物理方程提供基线预测，统计模型（AR 自回归 + Kalman 滤波）修正残差。这为 Phase 4 预留了 LSTM/Transformer 残差修正的接口。

**核心接口**：

```typescript
interface RULResult {
  /** 预测剩余寿命（天） */
  remainingLifeDays: number;
  /** 置信区间下界（天） */
  lowerBound: number;
  /** 置信区间上界（天） */
  upperBound: number;
  /** 置信度 */
  confidence: number;
  /** 主要退化因素排名 */
  degradationFactors: Array<{
    factor: string;
    contribution: number;
    currentLevel: number;
    criticalLevel: number;
    estimatedDaysToLimit: number;
  }>;
  /** 建议维护时间 */
  suggestedMaintenanceDate: string;
  /** 预测方法 */
  method: 'physics_extrapolation' | 'statistical' | 'hybrid';
  /** Grok 维护建议话术 [v1.1 新增] */
  maintenanceAdvice?: string;
}
```

#### 3.1.6 PhysicsValidator — 物理自洽性校验 [v1.1 新增]

```
职责：定期校验 WorldModel 状态的物理自洽性，防止数值漂移
频率：每 100 次同步执行一次
校验项：能量守恒、质量守恒、参数边界
```

**校验规则**：

| 校验项 | 规则 | 失败动作 |
|--------|------|----------|
| 能量守恒 | 输入功率 ≈ 输出功率 + 损耗，误差 <5% | 日志告警 + 状态重置 |
| 参数边界 | 所有状态变量在物理合理范围内 | 截断到边界值 + 告警 |
| 单调性 | 疲劳累积只增不减、腐蚀指数只增不减 | 回退到上一个有效快照 |
| 因果一致性 | 振动升高 → 温度应升高（相关性检查） | 标记为"因果异常"供诊断 |

#### 3.1.7 物理方程导出接口

为前端展示和 Grok 工具调用提供物理方程的结构化描述：

```typescript
interface PhysicsEquation {
  id: string;
  name: string;
  formula: string;       // LaTeX 格式
  variables: Array<{
    symbol: string;
    name: string;
    unit: string;
    currentValue: number;
  }>;
  physicalBasis: string;  // 如 'GB/T 3811-2008'
  category: 'structural' | 'thermal' | 'degradation' | 'safety';
}
```

---

### 3.2 SimulationEngine — 仿真推演引擎 — `simulation-engine.ts`

#### 3.2.1 仿真场景管理

仿真场景的完整生命周期管理，支持 CRUD 操作并持久化到 `simulation_scenarios` 表：

```typescript
interface SimulationScenarioConfig {
  equipmentId: string;
  name: string;
  description: string;
  scenarioType: 'overload' | 'thermal' | 'degradation' | 'resonance' | 'typhoon' | 'multi_factor' | 'custom';
  parameters: Record<string, number>;
  baselineConditionId?: string;
  durationSteps: number;
  stepIntervalSec: number;
  enableMonteCarlo?: boolean;
  monteCarloSampleCount?: number;
  /** Grok 自然语言场景描述（自动转参数）[v1.1 新增] */
  naturalLanguageDescription?: string;
}
```

**预置场景模板**（从现有 `WorldModel.getBuiltinScenarios()` 扩展）：

| 场景类型 | 名称 | 核心参数覆盖 | 持续步数 | 物理意义 |
|----------|------|-------------|----------|----------|
| typhoon | 台风场景 | windSpeedMean=18, windGustMax=25 | 60 | 模拟台风来袭时的结构安全 |
| overload | 重载偏心 | loadWeight=40, loadEccentricity=0.6 | 30 | 模拟货物严重偏心的倾覆风险 |
| degradation | 疲劳极限 | fatigueAccumPercent=82, vibrationRms=3.5 | 60 | 模拟疲劳接近极限时的连续作业 |
| thermal | 高温工况 | ambientTemp=45, coolingEfficiency=0.7 | 60 | 模拟高温环境下的热行为 |
| multi_factor | 多因素叠加 | windSpeedMean=12, loadEccentricity=0.4, fatigueAccumPercent=70, temperatureBearing=65 | 30 | 极端多因素叠加 |
| resonance | 共振分析 | speedRange=3000, stepSize=100 | 30 | 不同转速下的共振频率检测 |

#### 3.2.2 仿真异步执行器 [v1.1 重设计]

v1.1 将仿真执行改为 **BullMQ 异步任务**（参见 ADR-003），前端返回 `taskId`，通过 WebSocket 订阅进度和结果：

![仿真异步任务流程](phase3-sim-async.png)

**执行流程**：

```
1. 前端调用 simulation.execute({scenarioId})
2. tRPC Router 读取场景配置，入队 BullMQ
3. 返回 {taskId, status:'queued'} 给前端
4. 前端订阅 WebSocket: simulation.progress(taskId)
5. Worker 消费任务：
   a. 从 WorldModelRegistry 获取 WorldModel
   b. 从 world_model_snapshots 加载基线状态
   c. 执行物理仿真 N 步（每步推送进度）
   d. 可选：QMC 蒙特卡洛采样
   e. 生成风险评估
   f. 可选：调用 Grok 润色物理解释
   g. 写入 simulation_results + world_model_predictions
   h. 更新 simulation_scenarios.status = 'completed'
   i. 通过 WebSocket 推送最终结果
6. 失败时 BullMQ 自动重试（最多 3 次）
```

**执行结果结构**：

```typescript
interface SimulationResult {
  scenarioId: number;
  equipmentId: string;
  taskId: string;
  timeline: Array<{
    step: number;
    timestamp: number;
    stateVector: Record<string, number>;
    anomalies: string[];
  }>;
  riskAssessment: {
    maxOverturningRisk: number;
    maxFatigueAccum: number;
    maxVibration: number;
    maxTemperature: number;
    estimatedRULImpactDays: number;
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  /** 蒙特卡洛结果（如果启用）[v1.1 新增] */
  monteCarlo?: {
    sampleCount: number;
    percentiles: { p5: StateVector[]; p25: StateVector[]; p50: StateVector[]; p75: StateVector[]; p95: StateVector[] };
    exceedanceProbability: Record<string, number>;
    overallRiskProbability: number;
  };
  physicsExplanation: string;
  /** Grok 润色的中文物理报告 [v1.1 新增] */
  grokReport?: string;
  warnings: string[];
  durationMs: number;
}
```

#### 3.2.3 安全护栏参数校验 [v1.1 新增]

SimulationEngine 在执行仿真前，调用 GuardrailEngine 对场景参数进行安全检查：

| 校验规则 | 条件 | 动作 |
|----------|------|------|
| 负载上限 | loadWeight > 额定载重 × 3 | 拒绝执行 + 告警 |
| 风速上限 | windSpeedMean > 30 m/s | 拒绝执行（超出物理模型有效范围） |
| 温度范围 | ambientTemp < -40 或 > 60 | 警告（极端条件，结果可能不准确） |
| 疲劳累积 | fatigueAccumPercent > 100 | 拒绝执行（已超过理论寿命） |

#### 3.2.4 What-if 分析（反事实推理封装）

支持单参数和多参数组合的批量反事实推理：

```typescript
interface WhatIfAnalysis {
  analyzeParameter(
    equipmentId: string,
    paramName: string,
    values: number[]
  ): Promise<WhatIfResult[]>;
  
  analyzeParameterGrid(
    equipmentId: string,
    paramGrid: Record<string, number[]>
  ): Promise<WhatIfResult[]>;
}
```

#### 3.2.5 多方案对比引擎

支持选择多个已完成的仿真场景进行并排对比，输出归一化对比矩阵和最优场景推荐。

#### 3.2.6 批量仿真 [v1.1 新增]

```typescript
// 新增端点：simulation.batchExecute
// 一次最多 10 个场景并行执行
interface BatchExecuteInput {
  scenarioIds: number[];  // 最多 10 个
}
interface BatchExecuteResult {
  taskIds: string[];
  status: 'queued';
}
```

---

### 3.3 ReplayEngine — 历史回放引擎 — `replay-engine.ts`

#### 3.3.1 时间范围查询

从 `realtime_telemetry` 表查询指定设备的可回放时间范围，包括各通道的数据覆盖情况和事件统计。

#### 3.3.2 多通道数据查询

按设备 + 时间段 + 通道 + 降采样分辨率查询回放数据：

```typescript
interface ReplayDataRequest {
  equipmentId: string;
  startTime: Date;
  endTime: Date;
  channels: string[];
  resolution: 'raw' | '1s' | '10s' | '1m' | '5m';
}
```

**降采样策略**：

| 分辨率 | 策略 | 适用场景 |
|--------|------|----------|
| raw | 不降采样 | 短时间段（<1小时）精细分析 |
| 1s | 每秒取最后一条 | 短时间段快速浏览 |
| 10s | 每10秒取均值 | 中等时间段（1-6小时） |
| 1m | 每分钟取均值 + 最大值 + 最小值 | 长时间段（6-24小时） |
| 5m | 每5分钟取均值 + 最大值 + 最小值 | 超长时间段（>24小时） |

#### 3.3.3 事件叠加

从三个事件源查询指定时间段内的事件，按时间排序后叠加到回放数据中：

| 事件源 | 表 | 事件类型 | 关键字段 |
|--------|-----|----------|----------|
| 告警 | `device_alerts` | alert | alertType, severity, title, triggerValue |
| 诊断 | `cognition_sessions` | diagnosis | triggerType, safetyScore, healthScore |
| 工况切换 | `condition_instances` | condition_change | profileId, startedAt, stateSnapshot |

#### 3.3.4 异常片段定位 — DBSCAN 聚类 [v1.1 升级]

v1.0 采用简单阈值检测，v1.1 升级为 **DBSCAN 聚类算法**，自动发现连续异常簇：

```typescript
interface AnomalySegment {
  startTime: number;
  endTime: number;
  durationMs: number;
  anomalyType: string;
  severity: 'warning' | 'critical';
  affectedChannels: string[];
  peakValue: number;
  description: string;
  /** DBSCAN 聚类信息 [v1.1 新增] */
  clusterId: number;
  clusterSize: number;  // 簇内异常点数
  /** Grok 异常摘要 [v1.1 新增] */
  grokSummary?: string;
}
```

**DBSCAN 参数**：
- `eps`（邻域半径）：30 秒（时间维度）
- `minPts`（最小点数）：3（至少 3 个异常点才形成簇）
- 距离度量：时间距离 + 异常严重度加权

---

## 四、AI 原生增强 [v1.1 新增章节]

Phase 3 充分利用平台已有的 Grok LLM 能力，在四个关键环节引入 AI 增强，形成差异化竞争力：

### 4.1 场景智能生成

**触发点**：用户在创建仿真场景时，可输入自然语言描述（如"模拟明天台风天气下满载作业"），Grok 自动解析为仿真参数。

**实现**：

```typescript
// Grok Tool Calling 新增工具
const generateSimulationParams: GrokTool = {
  name: 'generate_simulation_params',
  description: '根据自然语言描述生成仿真场景参数',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    description: z.string().describe('自然语言场景描述'),
    equipmentType: z.string().describe('设备类型'),
    currentState: z.record(z.number()).describe('当前状态向量'),
  }),
  outputSchema: z.object({
    scenarioType: z.string(),
    parameters: z.record(z.number()),
    durationSteps: z.number(),
    confidence: z.number(),
    reasoning: z.string(),
  }),
};
```

**示例**：
- 输入："模拟台风天气下满载作业"
- 输出：`{ scenarioType: 'typhoon', parameters: { windSpeedMean: 18, windGustMax: 25, loadWeight: 35 }, durationSteps: 60, confidence: 0.85, reasoning: '根据台风等级8级对应风速17.2-20.7m/s...' }`

### 4.2 物理解释润色

**触发点**：仿真执行完成后，将物理引擎生成的结构化风险评估交给 Grok 润色为"可直接给运维看的中文报告"。

**Prompt 模板**：

```
你是一位资深的工业设备安全专家。请根据以下仿真结果，生成一份简洁的中文安全评估报告，
要求：1) 用运维人员能理解的语言 2) 突出关键风险 3) 给出具体的操作建议。

设备类型：{equipmentType}
仿真场景：{scenarioName}
风险评估：{riskAssessment}
物理方程计算过程：{physicsExplanation}
```

### 4.3 维护建议生成

**触发点**：RULPredictor 计算出剩余寿命和退化因素排名后，调用 Grok 生成"维护建议话术"。

**输出示例**：
> 该设备预计剩余寿命约 127 天（置信区间 98-156 天）。主要退化因素为疲劳累积（贡献度 62%），当前疲劳水平 68%，距临界值 80% 还有约 45 天。建议在未来 30 天内安排一次全面的结构检测，重点关注主臂根部焊缝区域。同时建议降低单次吊装重量至额定载重的 80% 以下，以延缓疲劳累积速度。

### 4.4 异常摘要

**触发点**：ReplayEngine 的 DBSCAN 聚类识别出异常片段后，调用 Grok 自动生成异常摘要。

**输出示例**：
> 2026-02-20 14:23-14:47 期间发生连续振动异常（持续 24 分钟，峰值 4.2 mm/s），同时伴随轴承温度升高至 72°C。该异常模式与"轴承早期磨损"的典型特征高度吻合。建议检查轴承润滑状态并安排振动频谱分析。

---

## 五、数据库表设计

### 5.1 新增表：simulation_scenarios

```sql
CREATE TABLE simulation_scenarios (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  equipment_id    VARCHAR(100) NOT NULL COMMENT '设备ID (machineId)',
  name            VARCHAR(200) NOT NULL COMMENT '场景名称',
  description     TEXT COMMENT '场景描述',
  scenario_type   VARCHAR(30) NOT NULL COMMENT 'overload|thermal|degradation|resonance|typhoon|multi_factor|custom',
  parameters      JSON NOT NULL COMMENT '仿真参数 Record<string, number>',
  baseline_condition_id VARCHAR(100) COMMENT '基准工况ID',
  duration_steps  INT NOT NULL DEFAULT 30 COMMENT '仿真步数',
  step_interval_sec INT NOT NULL DEFAULT 60 COMMENT '步长(秒)',
  enable_monte_carlo BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用蒙特卡洛',
  monte_carlo_samples INT DEFAULT 50 COMMENT 'QMC采样次数',
  status          VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft|queued|running|completed|failed',
  task_id         VARCHAR(64) COMMENT 'BullMQ任务ID',
  version         INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号',
  created_by      VARCHAR(64) COMMENT '创建者',
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_ss_equipment (equipment_id),
  INDEX idx_ss_status (status),
  INDEX idx_ss_type (scenario_type)
) COMMENT '仿真场景表';
```

### 5.2 新增表：simulation_results

```sql
CREATE TABLE simulation_results (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  scenario_id     BIGINT NOT NULL COMMENT '关联 simulation_scenarios.id',
  equipment_id    VARCHAR(100) NOT NULL COMMENT '设备ID',
  timeline        JSON NOT NULL COMMENT '时序轨迹 Array<{step, timestamp, stateVector, anomalies}>',
  risk_assessment JSON NOT NULL COMMENT '风险评估 JSON',
  monte_carlo_result JSON COMMENT '蒙特卡洛结果（如启用）',
  physics_explanation TEXT COMMENT '物理解释文本',
  grok_report     TEXT COMMENT 'Grok润色的中文报告',
  warnings        JSON COMMENT '建议动作 string[]',
  duration_ms     INT COMMENT '执行耗时(ms)',
  version         INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号',
  completed_at    TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sr_scenario FOREIGN KEY (scenario_id) REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
  INDEX idx_sr_scenario (scenario_id),
  INDEX idx_sr_equipment (equipment_id)
) COMMENT '仿真执行结果表';
```

### 5.3 新增表：twin_sync_logs（分区表）

```sql
CREATE TABLE twin_sync_logs (
  id              BIGINT AUTO_INCREMENT,
  machine_id      VARCHAR(100) NOT NULL COMMENT '设备ID',
  sync_type       VARCHAR(30) NOT NULL COMMENT 'telemetry_ingest|snapshot_persist|config_update',
  sync_mode       VARCHAR(20) NOT NULL DEFAULT 'cdc' COMMENT 'cdc|polling',
  state_vector    JSON COMMENT '同步时的状态向量',
  sensor_count    INT COMMENT '同步的传感器数量',
  duration_ms     INT COMMENT '同步耗时(ms)',
  error_message   TEXT COMMENT '错误信息(如有)',
  version         INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号',
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, created_at),
  INDEX idx_tsl_machine (machine_id),
  INDEX idx_tsl_type (sync_type)
) COMMENT '数字孪生状态同步日志'
PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
  PARTITION p_2026_02 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01')),
  PARTITION p_2026_03 VALUES LESS THAN (UNIX_TIMESTAMP('2026-04-01')),
  PARTITION p_2026_04 VALUES LESS THAN (UNIX_TIMESTAMP('2026-05-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

### 5.4 新增表：twin_events [v1.1 新增]

```sql
CREATE TABLE twin_events (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  machine_id      VARCHAR(100) NOT NULL COMMENT '设备ID',
  event_type      VARCHAR(50) NOT NULL COMMENT '事件类型',
  payload         JSON NOT NULL COMMENT '事件负载',
  version         INT NOT NULL DEFAULT 1 COMMENT '事件版本号',
  source          VARCHAR(100) COMMENT '发布者模块名',
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_te_machine (machine_id),
  INDEX idx_te_type (event_type),
  INDEX idx_te_time (created_at)
) COMMENT '数字孪生事件总线持久化表';
```

### 5.5 已有表扩展

`simulation_results` 中的 `timeline` JSON 字段在数据量大时（60 步 × 12 维状态向量 ≈ 50KB），可能影响查询性能。当单条记录超过 100KB 时，建议拆分为 `simulation_result_steps` 明细表（水平分片），Phase 3 暂不实施，作为 Phase 4 性能优化预留。

### 5.6 Seed 数据补充

| 表 | 补充内容 | 数量 |
|----|----------|------|
| `world_model_snapshots` | 为 5 台设备各生成 3 个快照 | 15 条 |
| `simulation_scenarios` | 预置 6 个仿真场景模板 | 6 条 |
| `simulation_results` | 为 2 个已完成场景生成结果数据 | 2 条 |
| `twin_events` | 示例事件数据 | 10 条 |

---

## 六、tRPC 路由 + WebSocket 设计

### 6.1 路由注册位置

新路由将注册到 `server/domains/pipeline/pipeline.domain-router.ts`，替换现有的 5 个 Facade 空壳方法。路由前缀保持 `evoPipeline.*`。

### 6.2 端点清单

| 端点 | 类型 | 输入 | 输出 | 说明 |
|------|------|------|------|------|
| `listEquipmentTwins` | query | 无 | 设备孪生概览列表 | 替换现有 |
| `getEquipmentTwinState` | query | `{ equipmentId }` | 完整孪生状态 | 新增 |
| `simulation.list` | query | `{ equipmentId? }` | 仿真场景列表 | 替换现有 |
| `simulation.create` | mutation | 场景配置 | 创建结果 | 新增 |
| `simulation.execute` | mutation | `{ scenarioId }` | `{ taskId, status }` | **异步** [v1.1] |
| `simulation.batchExecute` | mutation | `{ scenarioIds[] }` | `{ taskIds[] }` | **新增** [v1.1] |
| `simulation.compare` | query | `{ scenarioIds[] }` | 对比结果 | 新增 |
| `simulation.delete` | mutation | `{ scenarioId }` | 删除确认 | 新增 |
| `replay.getTimeRange` | query | `{ equipmentId }` | 可回放时间范围 | 新增 |
| `replay.getData` | query | 时间段+通道+分辨率 | 多通道回放数据 | 替换现有 |
| `worldmodel.getConfig` | query | `{ equipmentId }` | 世界模型配置 | 新增 |
| `worldmodel.getEquations` | query | `{ equipmentId }` | 物理方程列表 | 新增 |
| `worldmodel.predict` | mutation | `{ equipmentId, horizon }` | 带不确定性预测 | 新增 |
| `ai.generateScenarioParams` | mutation | `{ description }` | 仿真参数 | **新增** [v1.1] |

### 6.3 WebSocket 订阅 [v1.1 新增]

| 订阅频道 | 事件 | 推送内容 |
|----------|------|----------|
| `twin.stateUpdated` | 设备状态更新 | `{ machineId, stateVector, healthIndex, timestamp }` |
| `simulation.progress` | 仿真进度 | `{ taskId, progress, status, partialResult? }` |

### 6.4 Zod 校验示例

所有输入输出均使用 Zod 严格校验：

```typescript
const simulationExecuteInput = z.object({
  scenarioId: z.number().int().positive(),
});

const simulationExecuteOutput = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
});

const equipmentTwinStateOutput = z.object({
  equipment: z.object({
    nodeId: z.string(),
    name: z.string(),
    type: z.string(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    status: z.enum(['online', 'offline', 'maintenance']),
  }),
  sensors: z.array(z.object({
    sensorId: z.string(),
    name: z.string(),
    currentValue: z.number(),
    status: z.enum(['normal', 'warning', 'critical', 'offline']),
    trend: z.array(z.number()),
  })),
  health: z.object({
    overallScore: z.number().min(0).max(100),
    safetyScore: z.number().min(0).max(100),
    healthScore: z.number().min(0).max(100),
    efficiencyScore: z.number().min(0).max(100),
  }),
  syncStatus: z.enum(['synced', 'stale', 'disconnected']),
  lastSyncAt: z.string().datetime(),
});
```

---

## 七、前端设计

### 7.1 状态管理方案 [v1.1 新增]

**Zustand + TanStack Query v5**：

| 层 | 工具 | 职责 |
|----|------|------|
| 服务端状态 | TanStack Query v5 | 自动缓存、背景刷新、重试、乐观更新 |
| 客户端状态 | Zustand + persist middleware | 设备选择、时间范围、Tab 状态全局共享 |
| 实时状态 | WebSocket + Zustand | twin.stateUpdated / simulation.progress |

```typescript
// Zustand Store 示例
interface TwinStore {
  selectedEquipmentId: string | null;
  setSelectedEquipment: (id: string) => void;
  replayTimeRange: { start: Date; end: Date } | null;
  setReplayTimeRange: (range: { start: Date; end: Date }) => void;
  activeTab: 'status' | 'simulation' | 'replay' | 'worldmodel';
  setActiveTab: (tab: string) => void;
}
```

### 7.2 整体布局

DigitalTwinView 重建为 **4 个 Tab 面板**：

| Tab | 名称 | 核心功能 |
|-----|------|----------|
| 1 | 设备状态 | 设备选择器 + 传感器实时数据 + 健康仪表盘 + 告警列表 + RUL |
| 2 | 仿真推演 | 场景列表 + 参数配置 + 异步执行 + 结果可视化 + 多方案对比 |
| 3 | 历史回放 | 时间轴控制器 + 多通道折线图 + 事件标注 + DBSCAN 异常定位 |
| 4 | 世界模型 | 物理方程(KaTeX) + 参数配置 + 预测验证 + 不确定性可视化 |

### 7.3 设备状态面板

**布局**：顶部设备选择器（下拉） + 左侧健康仪表盘 + 右侧传感器数据表格 + 底部告警列表

**数据刷新**：WebSocket 订阅 `twin.stateUpdated`（实时推送），兜底 TanStack Query 5 秒 refetchInterval

**关键组件**：
- **健康评分仪表盘**：环形进度条展示 safetyScore / healthScore / efficiencyScore
- **RUL 卡片**：剩余寿命天数 + 置信区间 + 退化因素排名 + Grok 维护建议
- **传感器数据表格**：通道名、当前值、阈值、状态 Badge、趋势 sparkline
- **活跃告警列表**：按严重程度排序

### 7.4 仿真推演面板

**布局**：上方场景列表表格 + 下方推演工作台

**场景创建**：
- 方式一：手动配置（场景类型下拉 + 参数滑块）
- 方式二：自然语言描述 → Grok 自动填充参数 [v1.1 新增]

**异步执行 [v1.1]**：
- 点击"执行" → 返回 taskId → 进度条实时更新（WebSocket）
- 批量执行：勾选多个场景 → "批量执行" → 并行进度展示

**推演结果可视化**（Chart.js）：
- 多维度时序折线图 + 阈值线
- 蒙特卡洛带状图（P5-P95 置信区间）
- 风险评估卡片
- Grok 中文物理报告展示 [v1.1 新增]

### 7.5 历史回放面板

**布局**：顶部时间轴控制器 + 中部多通道数据图 + 底部事件列表

**时间轴控制器**：DatePicker + 分辨率选择 + 播放/暂停 + 速度选择 + 进度条

**异常片段快速定位 [v1.1 升级]**：
- DBSCAN 聚类结果以色块标注在时间轴上
- 点击色块 → 跳转到异常时间段
- Grok 异常摘要弹窗 [v1.1 新增]

### 7.6 世界模型面板

**布局**：左侧物理方程列表 + 右侧预测可视化

**物理方程展示 [v1.1 升级]**：
- 7 条方程使用 **KaTeX** 渲染 LaTeX 公式（替代纯文本）
- 参数滑块实时触发 debounce predict（300ms 防抖）

**预测可视化**：
- 带不确定性的预测轨迹图（均值线 + P5-P95 带状区间）
- 各维度的标准差随时间变化图
- 预测 vs 实际对比

### 7.7 3D 轻量孪生 [Phase 3.5 预留]

使用 React Three Fiber + 简单臂架模型，实现设备的 3D 可视化。Phase 3 仅预留组件接口，不实施。

---

## 八、可观测性与安全 [v1.1 新增章节]

### 8.1 OpenTelemetry 指标

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `twin_sync_duration_ms` | Histogram | machineId, syncMode | 状态同步耗时 |
| `twin_sync_mode` | Gauge | mode(cdc/polling) | 当前同步模式 |
| `twin_registry_instances` | Gauge | nodeId | 活跃实例数 |
| `simulation_duration_ms` | Histogram | scenarioType, hasMonteCarlo | 仿真执行耗时 |
| `simulation_queue_depth` | Gauge | — | BullMQ 队列深度 |
| `montecarlo_sample_count` | Histogram | method | 采样次数分布 |
| `replay_query_duration_ms` | Histogram | resolution | 回放查询耗时 |
| `grok_enhancement_duration_ms` | Histogram | enhancementType | Grok 增强耗时 |
| `physics_validation_failures` | Counter | validationType | 物理自洽性校验失败次数 |

### 8.2 审计日志

所有 mutation 操作（创建/执行/删除仿真、修改世界模型参数）记录到平台已有的 `audit_logs` 表，字段包括：userId、action、resourceType、resourceId、payload、timestamp。

### 8.3 RBAC 权限

| 权限 | 说明 | 默认角色 |
|------|------|----------|
| `twin.view` | 查看设备孪生状态 | 所有用户 |
| `twin.simulate` | 创建和执行仿真 | 工程师、管理员 |
| `twin.replay` | 查看历史回放 | 所有用户 |
| `twin.config` | 修改世界模型参数 | 管理员 |
| `twin.admin` | 管理 Registry、查看集群状态 | 管理员 |

---

## 九、与平台已有模块的集成

### 9.1 与 Phase 2 认知层的集成

| 集成点 | 方式 | 说明 |
|--------|------|------|
| PhysicsVerifier | WorldModel 导出 `getKeyEquations()` | 物理方程作为验证基准 |
| HybridOrchestrator | WorldModel 的 `predict()` + `counterfactual()` | S4 物理验证阶段 |
| CausalGraph | WorldModel 的 `anticipateAnomaly()` | 反事实干预时调用 |
| Grok Tools | 新增 `generate_simulation_params` 工具 | 场景智能生成 [v1.1] |

### 9.2 与感知层的集成

| 集成点 | 方式 | 说明 |
|--------|------|------|
| StateVectorEncoder | StateSyncEngine 复用编码逻辑 | 状态向量合成对齐 |
| ConditionManager | 复用 `condition_instances` | 工况上下文读取 |
| CDC 事件流 | Debezium 监听 `realtime_telemetry` | 混合同步主路径 [v1.1] |

### 9.3 与护栏层的集成

| 集成点 | 方式 | 说明 |
|--------|------|------|
| GuardrailEngine | 仿真参数安全校验 | 执行前参数检查 [v1.1] |
| device_alerts | ReplayEngine 读取告警事件 | 历史回放叠加标注 |

### 9.4 与进化层的集成

| 集成点 | 方式 | 说明 |
|--------|------|------|
| KnowledgeCrystallizer | 仿真发现 → 知识结晶 | 有价值发现自动进入 |
| ShadowEvaluator | 预测准确性评估 | 对比预测与实际 |

---

## 十、实施计划

### 10.1 文件清单与预估工作量

| 序号 | 文件路径 | 类型 | 预估行数 | 依赖 |
|------|----------|------|---------|------|
| 1 | `server/platform/cognition/worldmodel/world-model-enhanced.ts` | 新增 | ~900 | world-model.ts |
| 2 | `server/platform/cognition/worldmodel/twin-event-bus.ts` | **新增** | ~150 | Redis |
| 3 | `server/platform/cognition/worldmodel/simulation-engine.ts` | 新增 | ~700 | BullMQ, world-model-enhanced |
| 4 | `server/platform/cognition/worldmodel/replay-engine.ts` | 新增 | ~450 | drizzle schema |
| 5 | `server/platform/cognition/worldmodel/ai-enhancer.ts` | **新增** | ~200 | Grok |
| 6 | `server/platform/cognition/worldmodel/index.ts` | 修改 | +30 | 新增导出 |
| 7 | `drizzle/evolution-schema.ts` | 修改 | +120 | 4张新表 |
| 8 | `docker/mysql/init/03-v5-seed-data.sql` | 修改
 | +120 | seed数据 |
| 9 | `server/domains/pipeline/pipeline.domain-router.ts` | 重写 | ~600 | 14端点+2订阅 |
| 10 | `client/src/pages/cognitive/DigitalTwinView.tsx` | 重写 | ~1000 | 4面板 |
| **合计** | | | **~4270** | |

### 10.2 v1.0 → v1.1 增量对比

| 维度 | v1.0 | v1.1 | 增量说明 |
|------|------|------|----------|
| 后端新增文件 | 3 | 5 | +twin-event-bus.ts, +ai-enhancer.ts |
| DB 新增表 | 3 | 4 | +twin_events |
| tRPC 端点 | 12 | 14 | +simulation.batchExecute, +ai.generateScenarioParams |
| WebSocket 订阅 | 0 | 2 | +twin.stateUpdated, +simulation.progress |
| 预估代码量 | ~3400 | ~4270 | +870 行（+26%） |
| 同步模式 | 5秒轮询 | CDC+轮询混合 | 延迟从 5s 降到 <500ms |
| 蒙特卡洛 | N=100 随机 | N=50 Sobol QMC | 精度相当，性能 ×2 |
| 仿真执行 | 同步 tRPC | BullMQ 异步 | 支持长时间仿真+进度推送 |
| AI 增强 | 无 | 4 个 Grok 增强点 | 场景生成/解释润色/维护建议/异常摘要 |
| 可观测性 | 无 | OTel 指标+审计日志 | 9 个指标+RBAC |

### 10.3 实施顺序

```
Step 1: DB Schema + Seed 数据（4张新表 + seed）
  ↓
Step 2: TwinEventBus 事件总线
  ↓
Step 3: WorldModel 增强层（Registry + StateSyncEngine + UQ + RUL + PhysicsValidator）
  ↓
Step 4: SimulationEngine（BullMQ异步 + 蒙特卡洛 + 安全校验）
  ↓
Step 5: ReplayEngine（多通道降采样 + DBSCAN异常聚类）
  ↓
Step 6: AI Enhancer（4个Grok增强点）
  ↓
Step 7: tRPC 路由重建（14端点 + 2 WebSocket订阅）
  ↓
Step 8: 前端 DigitalTwinView 重建（4面板 + Zustand + TanStack Query）
  ↓
Step 9: TypeScript 编译验证 + 集成测试
  ↓
Step 10: Git 推送
```

### 10.4 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| CDC 基础设施不可用 | 同步延迟退化到 5s | 中 | 混合模式自动降级 + OTel 告警 |
| BullMQ 队列积压 | 仿真执行延迟 | 低 | 队列深度监控 + 并发限制 + 优先级队列 |
| Grok API 延迟/不可用 | AI 增强功能降级 | 中 | 所有 Grok 调用设为可选（graceful degradation） |
| 遥测数据量大导致回放查询慢 | 回放面板加载超时 | 中 | 降采样 + 分页 + 前端虚拟滚动 |
| 蒙特卡洛高采样计算耗时 | 仿真超过 30s | 低 | 异步执行 + 进度推送 + 可配置采样次数 |
| 设备 ID 映射不一致 | 数据关联失败 | 低 | Redis 持久化映射 + 启动校验 + 日志告警 |
| 前端 Chart.js 大数据量渲染卡顿 | 回放面板卡顿 | 中 | 降采样 + Canvas 渲染 + 数据点上限 2000 |
| twin_sync_logs 表膨胀 | DB 存储压力 | 中 | 月分区 + 自动清理 90 天前数据 |

---

## 十一、验收标准

| 编号 | 验收项 | 标准 |
|------|--------|------|
| AC-1 | 设备状态面板 | 5 台设备均可选择，传感器数据从 DB 读取（非 Math.random），WebSocket 实时推送 |
| AC-2 | 仿真场景 CRUD | 可创建/执行/删除仿真场景，结果持久化到 DB |
| AC-3 | 仿真异步执行 | 点击执行后返回 taskId，WebSocket 推送进度百分比，完成后推送结果 |
| AC-4 | 蒙特卡洛 | 启用 QMC 后展示 P5-P95 带状置信区间 |
| AC-5 | 多方案对比 | 选择 2+ 场景并排对比，归一化展示 |
| AC-6 | 历史回放 | 选择时间范围后展示多通道折线图 + 事件标注 |
| AC-7 | DBSCAN 异常聚类 | 自动识别异常片段并在时间轴标注 |
| AC-8 | 降采样 | 5 种分辨率可切换，24 小时范围查询 <3s |
| AC-9 | 世界模型面板 | KaTeX 渲染 7 条物理方程 + 参数编辑 + 预测可视化 |
| AC-10 | RUL 预测 | 展示剩余寿命 + 置信区间 + 退化因素排名 |
| AC-11 | AI 场景生成 | 自然语言描述 → Grok 自动填充仿真参数 |
| AC-12 | AI 物理报告 | 仿真完成后展示 Grok 润色的中文物理报告 |
| AC-13 | OTel 指标 | 9 个指标正常上报 |
| AC-14 | 审计日志 | 所有 mutation 操作记录到 audit_logs |
| AC-15 | TypeScript | 编译零错误 |
| AC-16 | 数据库 | 4 张新表创建成功，seed 数据正确 |

---

## 十二、Phase 4 预留接口

Phase 3 在设计时已为 Phase 4（安全护栏引擎升级 / 知识结晶增强）预留了以下扩展点：

| 预留接口 | 位置 | Phase 4 用途 |
|----------|------|-------------|
| `RULPredictor.method = 'hybrid'` | world-model-enhanced.ts | Phase 4 接入 LSTM/Transformer 残差修正 |
| `SimulationResult.grokReport` | simulation-engine.ts | Phase 4 扩展为多模态报告（含图表） |
| `TwinEventBus.on('simulation_completed')` | twin-event-bus.ts | Phase 4 知识结晶自动触发 |
| `PhysicsValidator` | world-model-enhanced.ts | Phase 4 护栏引擎深度集成 |
| `3D 轻量孪生组件接口` | DigitalTwinView.tsx | Phase 3.5 React Three Fiber |
| `simulation_result_steps` 明细表 | 预留设计 | Phase 4 大规模仿真性能优化 |

---

## 参考文献

[1] Niederreiter, H. (1992). *Random Number Generation and Quasi-Monte Carlo Methods*. SIAM. — Sobol 序列低差异性的理论基础

[2] Ester, M. et al. (1996). *A density-based algorithm for discovering clusters in large spatial databases with noise*. KDD. — DBSCAN 聚类算法

[3] GB/T 3811-2008. 起重机设计规范. — 物理方程的工程标准依据
