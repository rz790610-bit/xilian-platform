# 数字孪生赋能工具 — 配置项设计清单 v3.0

> **目标**：将数字孪生从展示界面升级为**可配置、可调优、可仿真的赋能工具平台**，用户通过配置驱动实现持续优化。
>
> **设计原则**：层级熔断 + 一键启停 + 参数可调 + 变更影响评估 + 运行时可观测 + 配置版本化 + 一键仿真
>
> **v3.0 新增**：SimulationEngine、ReplayEngine、UncertaintyQuantifier、RULPredictor、PhysicsVerifier、VectorStore、BullMQ 异步队列配置项；完善 OTel Metrics 13 项指标与各模块运行时指标的对应关系；补齐全部代码级默认值。

---

## 一、整体架构

数字孪生赋能工具分为 **7 层**，每层包含 1~5 个可独立配置的模块。每层顶部设有**层级熔断开关**（`layerEnabled`），优先级高于模块开关，一键切断下游防止级联雪崩。

### 1.1 层级总览

| 层级 | 层级 ID | 模块数 | 配置项数 | 熔断开关 | 核心赋能价值 |
|------|---------|--------|---------|---------|-------------|
| L1 数据采集层 | `data_collection` | 1 | 10 | ✓ | 控制数据源头的采集精度和频率 |
| L2 同步引擎层 | `sync_engine` | 1 | 5 | ✓ | 控制数据流入 WorldModel 的速度和可靠性 |
| L3 世界模型层 | `world_model` | 4 | 46 | ✓ | 调优预测精度、物理验证和大模型成本 |
| L4 认知推理层 | `cognitive_reasoning` | 5 | 42 | ✓ | 核心调优——速度 vs 精度、成本 vs 质量 |
| L5 仿真引擎层 | `simulation` | 3 | 26 | ✓ | 蒙特卡洛仿真、回放分析、RUL 预测 |
| L6 事件分发层 | `event_dispatch` | 2 | 6 | ✓ | 控制事件投递的可靠性和延迟 |
| L7 异步任务层 | `async_queue` | 1 | 8 | ✓ | BullMQ 队列管理、Worker 并发控制 |

**总计：17 个模块，143 个配置项 + 7 个层级熔断开关**

### 1.2 全局机制

每个配置项均包含以下元信息：

| 元字段 | 类型 | 说明 |
|--------|------|------|
| `version` | STRING | 语义化版本号（1.0.0），配合历史表实现一键回滚到任意版本 |
| `impactScore` | INT 0-100 | 配置变更影响评估分数，保存时前端展示影响预估 |
| `impactDescription` | STRING | 影响描述，如"预测精度↑8%、Grok成本↓15%" |
| `lastModifiedBy` | STRING | 最后修改人 |
| `lastModifiedAt` | TIMESTAMP | 最后修改时间 |

---

## 二、L1 数据采集层 — 采样配置管理器

> 对应数据库表 `device_sampling_config`，控制每个设备/传感器的数据采集频率和自适应策略。

| 配置项 | 字段名 | 类型 | 默认值 | 范围 | 说明 |
|--------|--------|------|--------|------|------|
| 基础采样率 | `base_sampling_rate_ms` | INT | 1000 | 100~60000 ms | 传感器基础采样间隔 |
| 当前采样率 | `current_sampling_rate_ms` | INT | 1000 | 100~60000 ms | 自适应调整后的实际采样率 |
| 最小采样率 | `min_sampling_rate_ms` | INT | 100 | 50~1000 ms | 高频采集下限 |
| 最大采样率 | `max_sampling_rate_ms` | INT | 60000 | 10000~300000 ms | 低频采集上限 |
| 自适应开关 | `adaptive_enabled` | BOOLEAN | true | — | 是否启用自适应采样率调整 |
| 自适应策略 | `adaptive_strategy` | ENUM | linear | linear/exponential/ml_based | 自适应算法类型，ml_based 为后续 ML 预留 |
| 优先级 | `priority` | ENUM | normal | low/normal/high/critical | 采集优先级，影响资源分配 |
| 网关列表 | `gateways` | JSON | [] | — | 关联的边缘网关数组 `[{id, endpoint, weight}]`，支持多网关负载均衡 |
| 端点列表 | `endpoints` | JSON | [] | — | 数据采集端点数组 `[{url, protocol, priority}]`，支持多端点冗余 |
| 层级熔断 | `layerEnabled` | BOOLEAN | true | — | L1 层级总开关 |

**工具化操作**：批量修改设备采样率 / 一键切换自适应模式和策略 / 按优先级分组调整 / 查看采样率调整历史

---

## 三、L2 同步引擎层 — StateSyncEngine

> 负责将采集到的遥测数据同步到 WorldModel，支持 CDC 实时 + Polling 轮询双模式自动切换。
> 代码位置：`server/platform/cognition/worldmodel/world-model-enhanced.ts` → `StateSyncEngine` 类

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 轮询间隔 | `pollingIntervalMs` | INT | 5000 | 1000~60000 ms | Polling 模式下的轮询周期 |
| CDC 降级阈值 | `cdcDegradeThresholdMs` | INT | 3000 | 1000~30000 ms | CDC 无事件超过此时间则降级到 Polling |
| 批量大小 | `batchSize` | INT | 50 | 10~500 | 每次轮询的最大设备数 |
| 启停控制 | `enabled` | BOOLEAN | true | — | 一键启停同步引擎 |
| 首选模式 | `preferredMode` | ENUM | cdc | cdc/polling | 首选同步模式 |

**运行时指标**（只读，暴露为 Prometheus metrics）：

| 指标 | OTel 指标名 | 类型 | 说明 |
|------|------------|------|------|
| 同步耗时 | `twin_sync_duration_ms` | Histogram | 状态同步耗时分布 |
| 当前模式 | `twin_sync_mode` | Gauge | 0=cdc, 1=polling |
| 活跃实例数 | `twin_registry_instances` | Gauge | WorldModelRegistry 中的活跃实例数 |
| CDC 事件数 | `twin_sync_cdc_events_total` | Counter | CDC 事件累计数 |
| 轮询周期数 | `twin_sync_polling_cycles_total` | Counter | 轮询周期累计数 |
| 总同步数 | `twin_sync_total_synced` | Counter | 总同步数据条数 |
| 错误数 | `twin_sync_errors_total` | Counter | 错误累计数 |
| 平均延迟 | `twin_sync_avg_latency_ms` | Gauge | 平均同步延迟 |
| 降级次数 | `twin_sync_degrade_count_total` | Counter | 降级次数 |

**工具化操作**：一键启停 / 手动切换 CDC/Polling / 调整轮询频率和降级阈值 / 实时指标仪表盘

---

## 四、L3 世界模型层

### 4.1 WorldModel 核心配置

> 控制物理模型和统计模型的预测行为。
> 代码位置：`server/platform/cognition/worldmodel/world-model-enhanced.ts` → `WorldModelRegistry` + `WorldModel` 类

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 预测步长 | `predictionStepSec` | INT | 60 | 1~3600 s | 每步预测的时间跨度 |
| 预测范围 | `predictionHorizon` | INT | 10 | 1~100 步 | 向前预测的总步数 |
| 置信度阈值 | `confidenceThreshold` | FLOAT | 0.7 | 0.0~1.0 | 低于此值的预测标记为不可信 |
| 异常预判提前量 | `anomalyLookahead` | INT | 3 | 1~50 步 | 提前多少步发出异常预警 |

**物理模型参数（PhysicsModelParams）— 按设备类型预设**：

| 配置项 | 参数名 | 类型 | 默认值（岸桥） | 默认值（门机） | 单位 | 说明 |
|--------|--------|------|---------------|---------------|------|------|
| 空气密度 | `airDensity` | FLOAT | 1.225 | 1.225 | kg/m³ | 标准大气压下空气密度 |
| 迎风面积 | `windwardArea` | FLOAT | 120.0 | 85.0 | m² | 结构受风面积 |
| 臂架高度 | `boomHeight` | FLOAT | 45.0 | 35.0 | m | 臂架高度 |
| 截面模量 | `sectionModulus` | FLOAT | 0.025 | 0.018 | m³ | 结构截面模量 |
| 应力集中系数 | `stressConcentrationFactor` | FLOAT | 2.5 | 2.2 | — | 应力集中放大因子 |
| S-N 曲线 C | `snCurveC` | FLOAT | 2.0e12 | 2.0e12 | — | 疲劳寿命曲线参数 C |
| S-N 曲线 m | `snCurveM` | FLOAT | 3.0 | 3.0 | — | 疲劳寿命曲线参数 m |
| 腐蚀速率常数 | `corrosionRateConstant` | FLOAT | 0.05 | 0.04 | mm/year | 腐蚀退化速率 |
| 稳定力矩 | `stabilizingMoment` | FLOAT | 15000.0 | 8000.0 | kN·m | 抗倾覆稳定力矩 |
| 摩擦系数 | `frictionCoefficient` | FLOAT | 0.15 | 0.12 | — | 机构摩擦系数 |

**统计模型参数（StatisticalModelParams）**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 说明 |
|--------|--------|------|-----------|------|
| 状态转移权重 | `transitionWeights` | FLOAT[] | [0.6, 0.3, 0.1] | 状态转移矩阵权重向量 |
| 过程噪声 | `processNoise` | FLOAT | 0.01 | 卡尔曼滤波过程噪声方差 |
| 观测噪声 | `observationNoise` | FLOAT | 0.1 | 卡尔曼滤波观测噪声方差 |
| 衰减因子 | `decayFactor` | FLOAT | 0.95 | 历史数据权重衰减 |

### 4.2 PhysicsVerifier（物理验证器）— **v3.0 新增**

> 验证推理假设的物理可行性，三源映射（规则 + Embedding + Grok）+ 方程残差检验。
> 代码位置：`server/platform/cognition/reasoning/physics/physics-verifier.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 映射置信度阈值 | `mappingConfidenceThreshold` | FLOAT | 0.4 | 0.1~0.9 | 低于此值的映射被丢弃 |
| 规则映射权重 | `sourceWeights.rule` | FLOAT | 0.30 | 0.0~1.0 | 规则映射在三源融合中的权重 |
| Embedding 映射权重 | `sourceWeights.embedding` | FLOAT | 0.40 | 0.0~1.0 | 向量相似度映射的权重 |
| Grok 映射权重 | `sourceWeights.grok` | FLOAT | 0.30 | 0.0~1.0 | Grok 大模型映射的权重 |
| 残差阈值 | `residualThreshold` | FLOAT | 0.5 | 0.1~2.0 | 方程残差 > 此值视为物理不可行 |
| 蒙特卡洛采样数 | `monteCarloSamples` | INT | 5 | 1~50 | 物理验证的 MC 采样次数 |
| 最大并发数 | `concurrency.maxConcurrency` | INT | 8 | 1~16 | 并行物理验证任务数 |
| 任务超时 | `concurrency.taskTimeoutMs` | INT | 3000 | 1000~15000 ms | 单个验证任务超时 |
| 全局超时 | `concurrency.globalTimeoutMs` | INT | 5000 | 2000~30000 ms | 所有验证任务总超时 |
| Grok 映射开关 | `enableGrokMapping` | BOOLEAN | true | — | 是否启用 Grok 参数映射（CostGate 可关闭） |

**物理参数边界（per-device-type）**：

> 存储在 `twin_physics_bounds` 表中，每种设备类型独立配置边界值。

| 参数 | 默认最小值 | 默认最大值 | 单位 | 说明 |
|------|-----------|-----------|------|------|
| vibrationRms | 0 | 50 | mm/s | 振动有效值 |
| motorCurrentMean | 0 | 500 | A | 电机电流均值 |
| windSpeedMean | 0 | 60 | m/s | 风速均值 |
| fatigueAccumPercent | 0 | 100 | % | 疲劳累积百分比 |
| corrosionIndex | 0 | 1 | — | 腐蚀指数 |
| temperatureBearing | -40 | 200 | °C | 轴承温度 |
| overturningRisk | 0 | 1 | — | 倾覆风险系数 |
| loadWeight | 0 | 200 | t | 载荷重量 |

**OTel 指标**：`physics_validation_failures`（Counter）— 物理自洽性校验失败次数

**工具化操作**：调整三源映射权重 / 修改残差阈值 / 按设备类型配置物理边界 / 查看物理验证失败率

### 4.3 VectorStore（向量存储）— **v3.0 新增**

> 经验池和因果图的向量检索后端。
> 代码位置：`server/platform/cognition/reasoning/vector-store/vector-store.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 向量维度 | `dimensions` | INT | 64 | 32~1024 | 向量空间维度 |
| 相似度度量 | `metric` | ENUM | cosine | cosine/euclidean/dot_product | 相似度计算方法 |
| 索引类型 | `indexType` | ENUM | flat | flat/ivf/hnsw | 索引结构（flat 精确、hnsw 近似快速） |

**工具化操作**：切换索引类型 / 调整向量维度（需重建索引）/ 查看索引大小和查询延迟

### 4.4 GrokEnhancer（大模型增强器）— **P0+**

> 控制 Grok 大模型对世界模型预测结果的增强行为，含熔断器和限流器。**大模型成本是核心关注点。**
> 代码位置：`server/platform/cognition/worldmodel/grok-enhancer.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 全局开关 | `enabled` | BOOLEAN | true | — | 一键启停 Grok 增强 |
| 模型版本 | `grokModelVersion` | ENUM | grok-4 | grok-4/grok-4-mini/custom | 选择模型版本，mini 更便宜 |
| Temperature | `temperature` | FLOAT | 0.3 | 0.0~2.0 | 大模型生成温度，越低越确定性 |
| Top-P | `topP` | FLOAT | 0.9 | 0.0~1.0 | 核采样参数 |
| 熔断阈值 | `circuitBreakerThreshold` | INT | 5 | 1~20 | 连续失败多少次触发熔断 |
| 熔断持续时间 | `circuitBreakerDurationMs` | INT | 30000 | 5000~300000 ms | 熔断后多久恢复半开状态 |
| 限流频率 | `rateLimitPerMinute` | INT | 10 | 1~100 | 每分钟最大请求数 |
| 限流突发 | `rateLimitBurst` | INT | 15 | 1~50 | 令牌桶容量（允许突发） |
| 请求超时 | `timeoutMs` | INT | 10000 | 3000~60000 ms | 单次 Grok 调用超时 |

**OTel 指标**：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `grok_enhancement_duration_ms` | Histogram | Grok 增强总耗时 |
| `grok_call_duration_ms` | Histogram | Grok API 调用耗时 |
| `grok_token_usage` | Counter | Grok Token 使用量 |
| `grok_circuit_state` | Gauge | 熔断器状态（0=closed, 1=open, 2=half-open） |
| `grok_fallback_count` | Counter | Grok 降级次数 |

**工具化操作**：一键启停 / 切换模型版本控制成本 / 调整熔断和限流策略 / 查看熔断器状态和调用统计 / 实时成本估算

---

## 五、L4 认知推理层

### 5.1 HybridOrchestrator（混合推理编排器）

> 控制推理路由策略、成本门控和并行扇出。6 阶段推理流程：信号分类 → 向量检索 → 因果溯源 → 物理验证 → 经验加权 → 深度推理。
> 代码位置：`server/platform/cognition/reasoning/orchestrator/hybrid-orchestrator.ts`

**路由配置**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 路由策略 | `routing.strategy` | ENUM | balanced | confidence_first/cost_first/balanced | 一句话切换"精度优先/省钱优先/均衡" |
| 快速路径置信度 | `routing.fastPathConfidence` | FLOAT | 0.85 | 0.5~1.0 | 经验命中率 ≥ 此值走快速路径 |
| 深度路径触发阈值 | `routing.deepPathTrigger` | FLOAT | 0.55 | 0.1~0.8 | 标准路径置信度 < 此值触发深度路径 |
| 降级超时 | `routing.fallbackTimeoutMs` | INT | 5000 | 1000~30000 ms | 降级路径总超时 |

**成本门控（CostGate）**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 每日 Grok 预算 | `costGate.dailyGrokBudget` | INT | 100（建议调至 500） | 10~5000 | 每日 Grok 调用次数上限 |
| 经验命中抑制因子 | `costGate.experienceHitSuppression` | FLOAT | 0.3 | 0.0~1.0 | 经验命中率越高越抑制 Grok 调用 |
| 短路率抑制因子 | `costGate.shortCircuitSuppression` | FLOAT | 0.2 | 0.0~1.0 | 短路率越高越抑制 Grok 调用 |

**执行配置**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 置信度短路阈值 | `shortCircuitConfidence` | FLOAT | 0.92 | 0.8~1.0 | 超过此值直接返回 |
| 最大并发数 | `parallelFanout.maxConcurrency` | INT | 8 | 1~16 | 并行推理任务上限 |
| 单任务超时 | `parallelFanout.taskTimeoutMs` | INT | 3000 | 1000~15000 ms | 单个推理任务超时 |
| 全局超时 | `parallelFanout.globalTimeoutMs` | INT | 8000 | 3000~30000 ms | 所有并行任务总超时 |
| 延迟预算 | `latencyBudgetMs` | INT | 8000 | 2000~30000 ms | P95 延迟目标 |

**工具化操作**：一键切换路由策略 / 控制每日 Grok 成本 / 调整并发和超时 / 查看路由决策分布

### 5.2 CognitionUnit（认知单元）

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 总超时 | `timeoutMs` | INT | 60000 | 10000~300000 ms | 单次认知推理总超时 |
| 维度超时 | `dimensionTimeoutMs` | INT | 15000 | 3000~60000 ms | 单维度推理超时 |
| 交叉验证阈值 | `crossValidationThreshold` | FLOAT | 0.6 | 0.3~1.0 | 多维度交叉验证一致性阈值 |
| 最大收敛迭代 | `maxConvergenceIterations` | INT | 3 | 1~10 | 收敛迭代上限 |
| 收敛置信度阈值 | `convergenceConfidenceThreshold` | FLOAT | 0.7 | 0.5~1.0 | 收敛判定的置信度门槛 |
| 降级模式 | `degradationMode` | ENUM | normal | normal/graceful/aggressive | 降级策略 |

### 5.3 CausalGraph（因果推理图）

> 代码位置：`server/platform/cognition/reasoning/causal/causal-graph.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 最大节点数 | `maxNodes` | INT | 500 | 100~5000 | 因果图膨胀控制上限 |
| 边权衰减率 | `edgeDecayRatePerDay` | FLOAT | 0.05 | 0.01~0.5 | 每天边权重衰减比例 |
| 最小边权重 | `minEdgeWeight` | FLOAT | 0.30 | 0.05~0.8 | 低于此值自动剪枝 |
| Grok 5-Why 深度 | `maxWhyDepth` | INT | 5 | 1~10 | Grok 因果链补全最大深度 |
| Grok 补全开关 | `enableGrokCompletion` | BOOLEAN | true | — | 是否启用 Grok 动态因果补全 |
| 最大并发数 | `concurrency.maxConcurrency` | INT | 4 | 1~12 | 并发因果推理任务数 |
| 任务超时 | `concurrency.taskTimeoutMs` | INT | 5000 | 1000~15000 ms | 单个因果推理任务超时 |
| 全局超时 | `concurrency.globalTimeoutMs` | INT | 15000 | 5000~60000 ms | 所有因果推理任务总超时 |

### 5.4 ExperiencePool（经验池）

> 三层记忆均支持**软上限 + 硬上限**：达到软上限时自动触发压缩（LRU 淘汰低权重经验），达到硬上限时拒绝写入。
> 代码位置：`server/platform/cognition/reasoning/experience/experience-pool.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 情景记忆软上限 | `capacity.episodic.soft` | INT | 800 | 100~8000 | 触发自动压缩的阈值 |
| 情景记忆硬上限 | `capacity.episodic.hard` | INT | 1000 | 200~10000 | 拒绝写入的绝对上限 |
| 语义记忆软上限 | `capacity.semantic.soft` | INT | 400 | 50~4000 | 触发自动压缩的阈值 |
| 语义记忆硬上限 | `capacity.semantic.hard` | INT | 500 | 100~5000 | 拒绝写入的绝对上限 |
| 程序记忆软上限 | `capacity.procedural.soft` | INT | 160 | 20~1600 | 触发自动压缩的阈值 |
| 程序记忆硬上限 | `capacity.procedural.hard` | INT | 200 | 40~2000 | 拒绝写入的绝对上限 |
| 时间衰减半衰期 | `decay.timeHalfLifeDays` | INT | 30 | 7~365 天 | 经验权重时间衰减 |
| 设备相似度权重 | `decay.deviceSimilarityWeight` | FLOAT | 0.3 | 0.0~1.0 | 设备相似度在衰减中的权重 |
| 工况相似度权重 | `decay.conditionSimilarityWeight` | FLOAT | 0.2 | 0.0~1.0 | 工况相似度在衰减中的权重 |
| 检索 Top-K | `retrievalTopK` | INT | 10 | 1~50 | 向量检索返回的最大经验数 |
| 最小相似度 | `minSimilarity` | FLOAT | 0.3 | 0.1~0.9 | 低于此相似度的经验不返回 |
| 单维衰减阈值 | `adaptiveDimensionThresholds.singleDimension` | INT | 50 | 10~200 | <此数使用单维衰减 |
| 二维衰减阈值 | `adaptiveDimensionThresholds.twoDimension` | INT | 200 | 50~1000 | <此数使用二维衰减，>此数使用三维衰减 |

### 5.5 KnowledgeFeedbackLoop（知识反馈环）— **P1**

> 自动反馈学习是"持续优化"的核心，含**自动回滚触发器**防过拟合。
> 代码位置：`server/platform/cognition/reasoning/feedback/knowledge-feedback-loop.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 最小样本数保护 | `minSamplesForUpdate` | INT | 3 | 1~20 | 累积多少反馈才更新权重 |
| 初始学习率 | `learningRate.initial` | FLOAT | 0.1 | 0.01~0.5 | 初始权重更新步长 |
| 最小学习率 | `learningRate.min` | FLOAT | 0.01 | 0.001~0.1 | 学习率下限 |
| 最大学习率 | `learningRate.max` | FLOAT | 0.3 | 0.1~1.0 | 学习率上限 |
| 学习率衰减因子 | `learningRate.decayFactor` | FLOAT | 0.995 | 0.9~0.999 | 每次反馈后学习率衰减 |
| 修订日志保留天数 | `revisionLogRetentionDays` | INT | 90 | 30~365 | revision_log 保留天数 |
| 自动反馈开关 | `enableAutoFeedback` | BOOLEAN | true | — | 一键启停自动反馈学习 |
| 自动回滚触发器 | `autoRollback.enabled` | BOOLEAN | true | — | 连续反馈后精度下降时自动回滚 |
| 回滚连续次数 | `autoRollback.consecutiveCount` | INT | 3 | 2~10 | 连续多少次反馈后检查精度 |
| 回滚精度阈值 | `autoRollback.accuracyDropThreshold` | FLOAT | 0.05 | 0.01~0.2 | 精度下降超过此比例触发回滚 |

### 5.6 Observability（可观测性）

> 代码位置：`server/platform/cognition/reasoning/observability/observability.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 滑动窗口大小 | `windowSize` | INT | 100 | 10~1000 | 计算率指标的窗口大小 |
| 决策日志上限 | `maxDecisionLogs` | INT | 500 | 100~5000 | 内存中保留的决策日志条数 |
| 快照间隔 | `snapshotIntervalMs` | INT | 60000 | 10000~600000 ms | 指标快照刷新间隔 |
| 日志级别 | `logLevel` | ENUM | info | error/warn/info/debug/trace | 推理过程日志级别 |

---

## 六、L5 仿真引擎层 — **v3.0 新增**

### 6.1 SimulationEngine（仿真引擎）

> 蒙特卡洛仿真、确定性仿真和风险评估引擎。支持 Sobol 准蒙特卡洛序列（QMC）。
> 代码位置：`server/platform/digital-twin/simulation-engine.ts`

**仿真参数**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 默认预测步数 | `defaultHorizonSteps` | INT | 10 | 1~200 | 仿真默认向前预测步数 |
| 默认步长间隔 | `defaultStepIntervalSec` | INT | 60 | 1~3600 s | 每步时间间隔 |
| 蒙特卡洛运行次数 | `defaultMonteCarloRuns` | INT | 50 | 10~10000 | 默认 MC 采样次数 |
| 采样方法 | `defaultMethod` | ENUM | sobol_qmc | sobol_qmc/latin_hypercube/pure_random | 准蒙特卡洛序列类型 |
| 启用蒙特卡洛 | `enableMonteCarlo` | BOOLEAN | true | — | 是否默认启用 MC 仿真 |
| 最大并行仿真数 | `maxConcurrentSimulations` | INT | 4 | 1~16 | 同时运行的仿真任务上限 |
| 单次仿真超时 | `simulationTimeoutMs` | INT | 300000 | 30000~1800000 ms | 单次仿真最大执行时间 |

**风险评估阈值**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 说明 |
|--------|--------|------|-----------|------|
| 高风险阈值 | `riskThresholds.high` | FLOAT | 0.7 | 风险分 ≥ 此值标记为 high |
| 严重风险阈值 | `riskThresholds.critical` | FLOAT | 0.9 | 风险分 ≥ 此值标记为 critical |
| 中等风险阈值 | `riskThresholds.medium` | FLOAT | 0.4 | 风险分 ≥ 此值标记为 medium |

**OTel 指标**：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `simulation_duration_ms` | Histogram | 仿真执行耗时分布 |
| `simulation_queue_depth` | Gauge | BullMQ 队列深度 |
| `montecarlo_sample_count` | Histogram | 蒙特卡洛采样次数分布 |

**工具化操作**：调整默认 MC 运行次数 / 切换采样方法 / 设置风险阈值 / 查看仿真队列深度和执行耗时

### 6.2 ReplayEngine（回放引擎）— **v3.0 新增**

> 历史数据回放引擎，支持 DBSCAN 异常聚类检测。
> 代码位置：`server/platform/digital-twin/replay-engine.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 默认回放速度 | `defaultSpeedMultiplier` | FLOAT | 1.0 | 0.1~100.0 | 回放速度倍率 |
| 启用 DBSCAN | `enableDBSCAN` | BOOLEAN | true | — | 是否默认启用 DBSCAN 异常检测 |
| DBSCAN ε | `dbscanEps` | FLOAT | 0.5 | 0.01~5.0 | DBSCAN 邻域半径（归一化坐标） |
| DBSCAN MinPts | `dbscanMinPts` | INT | 3 | 2~20 | DBSCAN 最小邻域点数 |
| 最大回放时长 | `maxReplayDurationMs` | INT | 86400000 | 3600000~604800000 ms | 单次回放最大时间跨度（默认 24h） |
| 最大通道数 | `maxChannels` | INT | 50 | 1~200 | 单次回放最大传感器通道数 |

**OTel 指标**：`replay_query_duration_ms`（Histogram）— 回放查询耗时分布

**工具化操作**：调整 DBSCAN 参数 / 设置回放速度 / 限制回放时长和通道数 / 查看异常聚类统计

### 6.3 UncertaintyQuantifier + RULPredictor — **v3.0 新增**

> 不确定性量化和剩余使用寿命预测。
> 代码位置：`server/platform/cognition/worldmodel/world-model-enhanced.ts`

**UncertaintyQuantifier 配置**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 默认 MC 运行次数 | `defaultRuns` | INT | 50 | 10~10000 | 不确定性量化的默认蒙特卡洛次数 |
| 序列类型 | `sequenceType` | ENUM | sobol | sobol/random | 准蒙特卡洛序列类型 |

**RULPredictor 配置**：

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 疲劳累积阈值 | `thresholds.fatigueAccumPercent` | FLOAT | 85 | 50~100 % | 疲劳累积达此值视为寿命终止 |
| 腐蚀指数阈值 | `thresholds.corrosionIndex` | FLOAT | 0.8 | 0.3~1.0 | 腐蚀指数达此值需要更换 |
| 振动 RMS 阈值 | `thresholds.vibrationRms` | FLOAT | 7.0 | 2.0~20.0 mm/s | 振动 RMS 达此值视为严重故障 |
| 轴承温度阈值 | `thresholds.temperatureBearing` | FLOAT | 90 | 60~150 °C | 轴承温度达此值视为过热 |
| 预测方法 | `defaultMethod` | ENUM | wiener | wiener/exponential/linear | 默认退化预测方法 |

**工具化操作**：调整退化阈值 / 切换预测方法 / 查看 RUL 预测趋势 / 设置预警提前量

---

## 七、L6 事件分发层

### 7.1 TwinEventBus（事件总线）

> 代码位置：`server/platform/cognition/worldmodel/twin-event-bus.ts`
> 支持 13 种事件类型：TELEMETRY_UPDATED, STATE_SYNCED, SYNC_MODE_CHANGED, ANOMALY_PREDICTED, INSTANCE_CREATED, INSTANCE_DESTROYED, INSTANCE_MIGRATING, INSTANCE_MIGRATED, SIMULATION_STARTED, SIMULATION_PROGRESS, SIMULATION_COMPLETED, SIMULATION_FAILED, HEALTH_DEGRADED

| 配置项 | 参数名 | 类型 | 代码默认值 | 说明 |
|--------|--------|------|-----------|------|
| 最大监听器数 | `maxListeners` | INT | 50 | 每个事件类型的最大订阅者数 |
| Redis 广播开关 | `enableRedisRelay` | BOOLEAN | false | 是否启用 Redis Pub/Sub 跨实例广播 |

### 7.2 OutboxRelay（发件箱中继）

> 代码位置：`server/platform/cognition/worldmodel/outbox-relay.ts`

| 配置项 | 参数名 | 类型 | 代码默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| 轮询间隔 | `pollIntervalMs` | INT | 100 | 50~5000 ms | Outbox 表轮询频率 |
| 批量大小 | `batchSize` | INT | 50 | 10~500 | 每次轮询处理的最大事件数 |
| 最大重试次数 | `maxRetries` | INT | 3 | 1~10 | 投递失败后的最大重试次数 |
| 启停控制 | `enabled` | BOOLEAN | true | — | 一键启停 OutboxRelay |

---

## 八、L7 异步任务层 — **v3.0 新增**

### 8.1 BullMQ 异步队列

> **当前状态**：代码中使用 `setImmediate()` 作为占位，注释标注"生产环境应改为 BullMQ"。以下为 BullMQ 集成后的配置项设计。

| 配置项 | 参数名 | 类型 | 推荐默认值 | 范围 | 说明 |
|--------|--------|------|-----------|------|------|
| Redis 连接 | `redis.url` | STRING | redis://localhost:6379 | — | BullMQ 使用的 Redis 连接地址 |
| 队列名称 | `queueName` | STRING | twin-simulation | — | 仿真任务队列名称 |
| Worker 并发数 | `workerConcurrency` | INT | 4 | 1~16 | 同时处理的仿真任务数 |
| 任务超时 | `jobTimeoutMs` | INT | 300000 | 30000~1800000 ms | 单个任务最大执行时间 |
| 最大重试次数 | `maxRetries` | INT | 3 | 0~10 | 任务失败后的最大重试次数 |
| 重试延迟 | `retryDelayMs` | INT | 5000 | 1000~60000 ms | 重试间隔（指数退避基数） |
| 死信队列 | `deadLetterQueue` | STRING | twin-simulation-dlq | — | 超过重试次数后转入的死信队列 |
| Bull Board 开关 | `enableBullBoard` | BOOLEAN | true | — | 是否启用 Bull Board 可视化面板 |

**工具化操作**：查看队列深度和 Worker 状态 / 调整并发数 / 重试失败任务 / 清理死信队列 / Bull Board 可视化

---

## 九、OTel Metrics 完整对照表 — **v3.0 新增**

> 代码位置：`server/platform/cognition/worldmodel/otel-metrics.ts`，共 13 项指标。

| 序号 | 指标名 | 类型 | 所属模块 | 说明 |
|------|--------|------|---------|------|
| 1 | `twin_sync_duration_ms` | Histogram | L2 StateSyncEngine | 状态同步耗时 |
| 2 | `twin_sync_mode` | Gauge | L2 StateSyncEngine | 当前同步模式（0=cdc, 1=polling） |
| 3 | `twin_registry_instances` | Gauge | L3 WorldModel | 活跃实例数 |
| 4 | `simulation_duration_ms` | Histogram | L5 SimulationEngine | 仿真执行耗时 |
| 5 | `simulation_queue_depth` | Gauge | L7 BullMQ | BullMQ 队列深度 |
| 6 | `montecarlo_sample_count` | Histogram | L5 SimulationEngine | 蒙特卡洛采样次数分布 |
| 7 | `replay_query_duration_ms` | Histogram | L5 ReplayEngine | 回放查询耗时 |
| 8 | `physics_validation_failures` | Counter | L3 PhysicsVerifier | 物理自洽性校验失败次数 |
| 9 | `grok_enhancement_duration_ms` | Histogram | L3 GrokEnhancer | Grok 增强总耗时 |
| 10 | `grok_call_duration_ms` | Histogram | L3 GrokEnhancer | Grok API 调用耗时 |
| 11 | `grok_token_usage` | Counter | L3 GrokEnhancer | Grok Token 使用量 |
| 12 | `grok_circuit_state` | Gauge | L3 GrokEnhancer | 熔断器状态 |
| 13 | `grok_fallback_count` | Counter | L3 GrokEnhancer | Grok 降级次数 |

---

## 十、前端界面设计方案

### 10.1 入口位置

在 **数字孪生 → 设备状态** 页面的子 Tab 中新增 **「⚙️ 运行配置」** Tab。

### 10.2 界面结构

```
运行配置 Tab
├── 顶部：全局状态概览卡片（7 层各一个，含层级熔断开关 + 运行/停止/降级状态）
├── 左侧：7 层模块树形导航
│   ├── L1 数据采集层 [熔断开关]
│   │   └── 采样配置管理器
│   ├── L2 同步引擎层 [熔断开关]
│   │   └── StateSyncEngine
│   ├── L3 世界模型层 [熔断开关]
│   │   ├── WorldModel 核心
│   │   ├── PhysicsVerifier          ← v3.0 新增
│   │   ├── VectorStore              ← v3.0 新增
│   │   └── GrokEnhancer
│   ├── L4 认知推理层 [熔断开关]
│   │   ├── HybridOrchestrator
│   │   ├── CognitionUnit
│   │   ├── CausalGraph
│   │   ├── ExperiencePool
│   │   ├── KnowledgeFeedbackLoop
│   │   └── Observability
│   ├── L5 仿真引擎层 [熔断开关]     ← v3.0 新增
│   │   ├── SimulationEngine
│   │   ├── ReplayEngine
│   │   └── UncertaintyQuantifier + RULPredictor
│   ├── L6 事件分发层 [熔断开关]
│   │   ├── TwinEventBus
│   │   └── OutboxRelay
│   └── L7 异步任务层 [熔断开关]     ← v3.0 新增
│       └── BullMQ 队列管理
└── 右侧：选中模块的配置面板
    ├── 启停开关 + 状态指示灯（绿/红/黄）
    ├── 配置表单（分组展示，带范围验证）
    ├── 配置对比视图（Toggle：与默认值对比 / 与上一版本对比，颜色高亮）
    ├── 变更影响评估（ImpactScore + 影响描述）
    ├── 运行时指标（实时刷新，关联 OTel Metrics）
    ├── 一键仿真按钮（"模拟运行 30s"，沙箱执行，实时展示指标）
    └── 操作按钮（保存 / 重置 / 应用 / 回滚到历史版本）
```

### 10.3 配置对比视图

右侧面板增加 Toggle 切换：

| 模式 | 说明 |
|------|------|
| 与默认值对比 | 高亮所有偏离默认值的配置项（绿色=优化方向，红色=风险方向） |
| 与上一版本对比 | 高亮本次修改的配置项，显示变更前后的值 |

### 10.4 一键仿真

每个模块面板顶部设有 **「模拟运行 30s」** 按钮：

1. 将修改后的配置注入沙箱环境（不影响真实孪生体）
2. 用最近 30s 的真实遥测数据回放
3. 右侧实时展示：预测精度、Grok 调用次数、延迟 P50/P95/P99、错误率
4. 仿真结束后展示对比报告：当前配置 vs 修改后配置的指标差异

---

## 十一、后端持久化方案

### 11.1 存储架构

**Redis（热配置）+ MySQL（冷备份 + 完整历史）**

| 存储层 | 用途 | TTL |
|--------|------|-----|
| Redis Hash | 运行时配置（即时生效） | 5s 过期自动从 MySQL 重载 |
| MySQL `twin_runtime_config` | 当前配置 + 版本号 | 永久 |
| MySQL `twin_config_audit_log` | 变更审计日志 | 永久 |
| MySQL `twin_config_snapshot` | 每小时自动快照 | 90 天 |
| MySQL `twin_physics_bounds` | per-device-type 物理参数边界 | 永久 |

### 11.2 新增数据库表

```sql
-- 运行时配置主表
CREATE TABLE twin_runtime_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id VARCHAR(64) NOT NULL UNIQUE,
  layer_id VARCHAR(32) NOT NULL,
  config_json JSON NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_layer (layer_id)
);

-- 配置变更审计日志
CREATE TABLE twin_config_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  module_id VARCHAR(64) NOT NULL,
  operator VARCHAR(64) NOT NULL,
  action ENUM('update','reset','toggle','rollback','simulate') NOT NULL,
  before_json JSON,
  after_json JSON,
  impact_score INT DEFAULT 0,
  impact_description VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_module_time (module_id, created_at)
);

-- 配置快照（每小时自动）
CREATE TABLE twin_config_snapshot (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  snapshot_json JSON NOT NULL COMMENT '所有模块配置的完整快照',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_time (created_at)
);

-- per-device-type 物理参数边界
CREATE TABLE twin_physics_bounds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_type VARCHAR(64) NOT NULL,
  parameter_name VARCHAR(64) NOT NULL,
  min_value DOUBLE NOT NULL,
  max_value DOUBLE NOT NULL,
  unit VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_param (device_type, parameter_name)
);
```

### 11.3 后端 API

```
tRPC Router: evoPipeline.twinConfig
├── getLayerStatus()                          → 获取 7 层全局状态（含层级熔断状态）
├── toggleLayer(layerId, enabled)             → 层级熔断开关
├── getModuleConfig(moduleId)                 → 获取指定模块当前配置
├── updateModuleConfig(moduleId, config)      → 更新配置（含验证 + 影响评估）
├── resetModuleConfig(moduleId)               → 恢复默认配置
├── toggleModule(moduleId, enabled)           → 启停模块
├── getModuleMetrics(moduleId)                → 获取运行时指标（关联 OTel）
├── getConfigHistory(moduleId)                → 获取配置变更历史
├── rollbackConfig(moduleId, version)         → 回滚到指定版本
├── simulateConfig(moduleId, tempConfig)      → 仿真接口（沙箱执行 30s）
├── batchUpdateConfigs(layerId, configs)      → 批量更新某层所有模块
├── getConfigDiff(moduleId, compareWith)      → 配置对比（vs 默认 / vs 指定版本）
├── getOTelMetrics()                          → 获取全部 13 项 OTel 指标快照
└── getBullMQStatus()                         → 获取 BullMQ 队列状态（深度、Worker 数、失败数）
```

---

## 十二、实施优先级（最终版）

| 优先级 | 模块 | 理由 |
|--------|------|------|
| **P0** | StateSyncEngine | 同步引擎是数据流入口，配置直接影响全链路 |
| **P0** | WorldModel 核心 | 预测参数直接影响诊断精度 |
| **P0** | HybridOrchestrator | 路由策略和成本控制是核心调优点 |
| **P0+** | GrokEnhancer | 大模型成本是核心关注点，先做熔断+限流立刻省钱 |
| **P0+** | SimulationEngine | 仿真是数字孪生核心价值，MC 参数直接影响预测质量 |
| **P1** | ExperiencePool | 经验池容量和衰减影响快速路径命中率 |
| **P1** | CausalGraph | 因果图规模和剪枝影响推理深度 |
| **P1** | KnowledgeFeedbackLoop | 自动学习是"持续优化"的核心，早做早受益 |
| **P1** | PhysicsVerifier | 物理验证参数影响假设过滤精度 |
| **P1** | RULPredictor | 退化阈值直接影响维保决策 |
| **P2** | CognitionUnit | 认知单元超时和收敛参数 |
| **P2** | OutboxRelay | 事件投递参数 |
| **P2** | ReplayEngine | 回放和 DBSCAN 参数 |
| **P2** | BullMQ | 需要先安装依赖，集成工作量较大 |
| **P3** | 采样配置管理器 | 复用现有 DB 表，前端 CRUD 即可 |
| **P3** | TwinEventBus | 参数较少 |
| **P3** | VectorStore / Observability | 基础设施参数，调优频率低 |

---

## 十三、v2.0 → v3.0 变更摘要

| 变更类别 | 内容 |
|----------|------|
| **新增层级** | L5 仿真引擎层（SimulationEngine + ReplayEngine + UncertaintyQuantifier/RULPredictor）、L7 异步任务层（BullMQ） |
| **新增模块** | PhysicsVerifier（10 配置项）、VectorStore（3 配置项）、SimulationEngine（10 配置项）、ReplayEngine（6 配置项）、UncertaintyQuantifier（2 配置项）、RULPredictor（5 配置项）、BullMQ（8 配置项） |
| **配置项增量** | 88 → 143（+55 项） |
| **模块增量** | 12 → 17（+5 个） |
| **层级增量** | 5 → 7（+2 层） |
| **OTel 指标** | 新增完整 13 项指标对照表，标注所属模块和类型 |
| **代码溯源** | 所有配置项标注代码文件位置和类名，默认值从代码中提取 |
| **BullMQ 集成** | 标注当前 setImmediate 占位状态，设计完整的 BullMQ 配置项 |
| **API 扩展** | 新增 `getOTelMetrics()` 和 `getBullMQStatus()` 接口 |
