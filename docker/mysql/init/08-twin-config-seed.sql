SET NAMES utf8mb4;
-- ============================================================================
-- 08-twin-config-seed.sql
-- 数字孪生赋能工具 — 143 条运行配置项种子数据
-- v3.0 — 2026-02-22
-- ============================================================================

-- ============================================================================
-- S0. 层级熔断开关（7 层）
-- ============================================================================
INSERT INTO `twin_layer_switches` (`layer_id`, `layer_name`, `enabled`, `priority`, `description`) VALUES
('L1', '数据采集层', 1, 1, '传感器/边缘网关数据采集、自适应采样'),
('L2', '同步引擎层', 1, 2, 'CDC + Polling 双模同步、StateSyncEngine'),
('L3', '世界模型层', 1, 3, 'WorldModel 核心 + PhysicsValidator + VectorStore'),
('L4', '认知推理层', 1, 4, 'HybridOrchestrator + GrokEnhancer + CausalGraph + ExperiencePool + FeedbackLoop'),
('L5', '仿真引擎层', 1, 5, 'SimulationEngine + ReplayEngine + UncertaintyQuantifier + RULPredictor'),
('L6', '事件分发层', 1, 6, 'TwinEventBus + OutboxRelay'),
('L7', '异步任务层', 1, 7, 'BullMQ 队列管理')
ON DUPLICATE KEY UPDATE `layer_name` = VALUES(`layer_name`);

-- ============================================================================
-- S1. L1 数据采集层 — DeviceSamplingConfig（8 项）
-- ============================================================================
INSERT INTO `engine_config_registry` 
  (`module`, `config_group`, `config_key`, `config_value`, `value_type`, `default_value`, `label`, `description`, `unit`, `constraints`, `sort_order`, `enabled`, `is_builtin`, `impact_score`, `impact_description`, `config_version`, `scope`)
VALUES
('deviceSampling', 'basic', 'baseSampleRateHz', '"10"', 'number', '"10"', '基础采样率', '传感器默认采样频率', 'Hz', '{"min":1,"max":1000,"step":1}', 10, 1, 1, 35, '影响数据量和 ClickHouse 写入压力', '1.0.0', 'global'),
('deviceSampling', 'basic', 'adaptiveEnabled', '"true"', 'boolean', '"true"', '自适应采样', '根据设备状态自动调整采样率', NULL, NULL, 20, 1, 1, 45, '关闭后采样率固定，可能错过异常', '1.0.0', 'global'),
('deviceSampling', 'basic', 'adaptiveStrategy', '"linear"', 'string', '"linear"', '自适应策略', '采样率调整算法：linear/exponential/ml_based', NULL, '{"options":["linear","exponential","ml_based"]}', 25, 1, 1, 40, '策略选择影响采样精度和响应速度', '1.0.0', 'global'),
('deviceSampling', 'basic', 'maxSampleRateHz', '"500"', 'number', '"500"', '最大采样率', '自适应模式下的采样率上限', 'Hz', '{"min":10,"max":10000,"step":10}', 30, 1, 1, 30, '上限过高可能导致数据洪泛', '1.0.0', 'global'),
('deviceSampling', 'basic', 'minSampleRateHz', '"1"', 'number', '"1"', '最小采样率', '自适应模式下的采样率下限', 'Hz', '{"min":0.1,"max":100,"step":0.1}', 35, 1, 1, 25, '下限过低可能错过关键信号', '1.0.0', 'global'),
('deviceSampling', 'gateway', 'gatewayEndpoints', '"[]"', 'json', '"[]"', '网关端点列表', '边缘网关连接端点（JSON 数组）', NULL, NULL, 40, 1, 1, 50, '网关配置错误将导致数据断流', '1.0.0', 'global'),
('deviceSampling', 'priority', 'priorityChannels', '"[\"vibration\",\"temperature\",\"pressure\"]"', 'json', '"[\"vibration\",\"temperature\",\"pressure\"]"', '优先通道', '高优先级采集通道列表', NULL, NULL, 50, 1, 1, 20, '优先通道在资源紧张时优先保障', '1.0.0', 'global'),
('deviceSampling', 'priority', 'batchSize', '"100"', 'number', '"100"', '批量上报大小', '每批上报的数据点数量', '条', '{"min":10,"max":10000,"step":10}', 55, 1, 1, 15, '批量大小影响网络效率和延迟', '1.0.0', 'global'),

-- ============================================================================
-- S2. L2 同步引擎层 — StateSyncEngine（12 项）
-- ============================================================================
('stateSyncEngine', 'polling', 'pollingIntervalMs', '"5000"', 'number', '"5000"', '轮询间隔', 'Polling 模式数据拉取间隔', 'ms', '{"min":1000,"max":60000,"step":500}', 10, 1, 1, 55, '间隔越短实时性越好，但 DB 压力越大', '1.0.0', 'global'),
('stateSyncEngine', 'polling', 'pollingBatchSize', '"50"', 'number', '"50"', '轮询批量大小', '每次轮询拉取的最大记录数', '条', '{"min":10,"max":500,"step":10}', 15, 1, 1, 30, '批量过大可能导致单次查询超时', '1.0.0', 'global'),
('stateSyncEngine', 'cdc', 'cdcEnabled', '"true"', 'boolean', '"true"', 'CDC 模式', '启用 MySQL binlog CDC 实时同步', NULL, NULL, 20, 1, 1, 70, 'CDC 关闭后降级为 Polling，实时性下降', '1.0.0', 'global'),
('stateSyncEngine', 'cdc', 'cdcDegradeThresholdMs', '"10000"', 'number', '"10000"', 'CDC 降级阈值', 'CDC 延迟超过此值自动降级到 Polling', 'ms', '{"min":3000,"max":60000,"step":1000}', 25, 1, 1, 60, '阈值过低可能频繁切换，过高则延迟不可控', '1.0.0', 'global'),
('stateSyncEngine', 'cdc', 'cdcRecoveryCheckMs', '"30000"', 'number', '"30000"', 'CDC 恢复检查间隔', '降级后多久检查一次 CDC 是否恢复', 'ms', '{"min":10000,"max":300000,"step":5000}', 30, 1, 1, 20, '检查频率影响恢复速度', '1.0.0', 'global'),
('stateSyncEngine', 'dedup', 'deduplicationWindowMs', '"60000"', 'number', '"60000"', '去重窗口', '同一事件的去重时间窗口', 'ms', '{"min":10000,"max":600000,"step":10000}', 35, 1, 1, 25, '窗口过短可能重复处理，过长占用内存', '1.0.0', 'global'),
('stateSyncEngine', 'dedup', 'deduplicationStrategy', '"hash"', 'string', '"hash"', '去重策略', 'hash（精确去重）/ bloom（概率去重，低内存）', NULL, '{"options":["hash","bloom"]}', 40, 1, 1, 30, 'bloom 省内存但有误判率', '1.0.0', 'global'),
('stateSyncEngine', 'backpressure', 'maxQueueSize', '"10000"', 'number', '"10000"', '最大队列深度', '同步队列最大积压数量', '条', '{"min":1000,"max":100000,"step":1000}', 45, 1, 1, 50, '队列溢出将触发背压丢弃', '1.0.0', 'global'),
('stateSyncEngine', 'backpressure', 'backpressureStrategy', '"drop_oldest"', 'string', '"drop_oldest"', '背压策略', '队列满时的处理策略', NULL, '{"options":["drop_oldest","drop_newest","block"]}', 50, 1, 1, 45, '丢弃策略影响数据完整性', '1.0.0', 'global'),
('stateSyncEngine', 'metrics', 'metricsEnabled', '"true"', 'boolean', '"true"', '指标采集', '启用 Prometheus 指标暴露', NULL, NULL, 55, 1, 1, 10, '关闭后无法监控同步引擎状态', '1.0.0', 'global'),
('stateSyncEngine', 'metrics', 'metricsIntervalMs', '"15000"', 'number', '"15000"', '指标采集间隔', 'Prometheus 指标刷新间隔', 'ms', '{"min":5000,"max":60000,"step":5000}', 60, 1, 1, 5, '间隔影响监控精度', '1.0.0', 'global'),
('stateSyncEngine', 'retry', 'maxRetries', '"3"', 'number', '"3"', '最大重试次数', '同步失败后的最大重试次数', '次', '{"min":0,"max":10,"step":1}', 65, 1, 1, 35, '重试次数影响数据可靠性和延迟', '1.0.0', 'global'),

-- ============================================================================
-- S3. L3 世界模型层 — WorldModel 核心（10 项）
-- ============================================================================
('worldModel', 'core', 'snapshotIntervalMs', '"60000"', 'number', '"60000"', '快照间隔', 'WorldModel 状态快照持久化间隔', 'ms', '{"min":10000,"max":600000,"step":10000}', 10, 1, 1, 40, '间隔越短恢复越快，但写入压力越大', '1.0.0', 'global'),
('worldModel', 'core', 'predictionHorizonSteps', '"10"', 'number', '"10"', '预测步数', '状态预测的时间步数', '步', '{"min":1,"max":100,"step":1}', 15, 1, 1, 55, '步数越多预测越远但精度越低', '1.0.0', 'global'),
('worldModel', 'core', 'maxInstances', '"200"', 'number', '"200"', '最大实例数', 'WorldModel 实例池上限（LRU 淘汰）', '个', '{"min":10,"max":1000,"step":10}', 20, 1, 1, 60, '超过上限触发 LRU 淘汰，影响冷启动', '1.0.0', 'global'),
('worldModel', 'core', 'instanceTtlMs', '"3600000"', 'number', '"3600000"', '实例 TTL', '空闲实例存活时间', 'ms', '{"min":300000,"max":86400000,"step":300000}', 25, 1, 1, 25, 'TTL 过短频繁重建，过长占用内存', '1.0.0', 'global'),
('worldModel', 'core', 'stateVectorDimensions', '"32"', 'number', '"32"', '状态向量维度', '状态向量的默认维度数', '维', '{"min":8,"max":256,"step":8}', 30, 1, 1, 70, '维度变更需要重建所有实例', '1.0.0', 'global'),
('worldModel', 'migration', 'migrationEnabled', '"true"', 'boolean', '"true"', '热迁移', '启用跨节点实例热迁移', NULL, NULL, 35, 1, 1, 65, '关闭后节点故障将导致实例丢失', '1.0.0', 'global'),
('worldModel', 'migration', 'migrationTimeoutMs', '"30000"', 'number', '"30000"', '迁移超时', '热迁移操作的超时时间', 'ms', '{"min":5000,"max":120000,"step":5000}', 40, 1, 1, 35, '超时后回滚迁移', '1.0.0', 'global'),
('worldModel', 'kalman', 'processNoise', '"0.01"', 'number', '"0.01"', '过程噪声 Q', '卡尔曼滤波过程噪声系数', NULL, '{"min":0.0001,"max":1,"step":0.001}', 45, 1, 1, 50, '影响滤波器对新数据的响应速度', '1.0.0', 'global'),
('worldModel', 'kalman', 'measurementNoise', '"0.1"', 'number', '"0.1"', '测量噪声 R', '卡尔曼滤波测量噪声系数', NULL, '{"min":0.001,"max":10,"step":0.01}', 50, 1, 1, 50, '影响滤波器对测量值的信任程度', '1.0.0', 'global'),
('worldModel', 'anomaly', 'anomalyThresholdSigma', '"3.0"', 'number', '"3.0"', '异常检测阈值', '超过 N 倍标准差判定为异常', 'σ', '{"min":1.5,"max":5,"step":0.5}', 55, 1, 1, 45, '阈值越低越敏感，误报越多', '1.0.0', 'global'),

-- ============================================================================
-- S4. L3 世界模型层 — PhysicsValidator（10 项）
-- ============================================================================
('physicsValidator', 'core', 'validationEnabled', '"true"', 'boolean', '"true"', '物理验证', '启用物理一致性验证', NULL, NULL, 10, 1, 1, 65, '关闭后不检查物理约束，可能产生不合理预测', '1.0.0', 'global'),
('physicsValidator', 'core', 'strictMode', '"false"', 'boolean', '"false"', '严格模式', '严格模式下物理违规直接拒绝预测', NULL, NULL, 15, 1, 1, 55, '严格模式可能导致预测中断', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'temperatureMin', '"-40"', 'number', '"-40"', '温度下限', '设备运行温度最低值', '°C', '{"min":-273,"max":0,"step":1}', 20, 1, 1, 30, '超出范围触发告警', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'temperatureMax', '"150"', 'number', '"150"', '温度上限', '设备运行温度最高值', '°C', '{"min":50,"max":1000,"step":1}', 25, 1, 1, 30, '超出范围触发告警', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'vibrationMax', '"50"', 'number', '"50"', '振动上限', '振动加速度最大值', 'mm/s²', '{"min":5,"max":200,"step":1}', 30, 1, 1, 30, '超出范围触发告警', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'pressureMin', '"0"', 'number', '"0"', '压力下限', '工作压力最低值', 'MPa', '{"min":-1,"max":0,"step":0.1}', 35, 1, 1, 30, '负压可能损坏设备', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'pressureMax', '"25"', 'number', '"25"', '压力上限', '工作压力最高值', 'MPa', '{"min":1,"max":100,"step":0.5}', 40, 1, 1, 30, '超压可能引发安全事故', '1.0.0', 'global'),
('physicsValidator', 'bounds', 'rpmMax', '"10000"', 'number', '"10000"', '转速上限', '最大允许转速', 'RPM', '{"min":100,"max":50000,"step":100}', 45, 1, 1, 30, '超速可能导致机械故障', '1.0.0', 'global'),
('physicsValidator', 'tolerance', 'tolerancePercent', '"5"', 'number', '"5"', '容差百分比', '物理约束的容差范围', '%', '{"min":1,"max":20,"step":1}', 50, 1, 1, 20, '容差越大越宽松', '1.0.0', 'global'),
('physicsValidator', 'perDevice', 'perDeviceTypeEnabled', '"true"', 'boolean', '"true"', '按设备类型配置', '允许不同设备类型使用不同物理边界', NULL, NULL, 55, 1, 1, 40, '启用后可精细化管理', '1.0.0', 'global'),

-- ============================================================================
-- S5. L3 世界模型层 — VectorStore（3 项）
-- ============================================================================
('vectorStore', 'core', 'dimensions', '"768"', 'number', '"768"', '向量维度', '嵌入向量的维度数', '维', '{"min":64,"max":4096,"step":64}', 10, 1, 1, 70, '维度变更需要重建索引', '1.0.0', 'global'),
('vectorStore', 'core', 'similarityMetric', '"cosine"', 'string', '"cosine"', '相似度度量', '向量检索的距离度量方法', NULL, '{"options":["cosine","euclidean","dot_product"]}', 15, 1, 1, 50, '度量方法影响检索质量', '1.0.0', 'global'),
('vectorStore', 'core', 'topK', '"10"', 'number', '"10"', 'Top-K', '相似度检索返回的最大结果数', '条', '{"min":1,"max":100,"step":1}', 20, 1, 1, 15, 'K 值影响推理上下文丰富度', '1.0.0', 'global'),

-- ============================================================================
-- S6. L4 认知推理层 — HybridOrchestrator（12 项）
-- ============================================================================
('hybridOrchestrator', 'routing', 'routingStrategy', '"adaptive"', 'string', '"adaptive"', '路由策略', '推理请求路由方式', NULL, '{"options":["fast_only","grok_only","adaptive","cost_optimized"]}', 10, 1, 1, 75, '路由策略直接影响推理质量和成本', '1.0.0', 'global'),
('hybridOrchestrator', 'routing', 'fastPathConfidence', '"0.85"', 'number', '"0.85"', '快速路径置信度', '置信度高于此值走快速路径', NULL, '{"min":0.5,"max":0.99,"step":0.01}', 15, 1, 1, 60, '阈值越高越多请求走 Grok，成本越高', '1.0.0', 'global'),
('hybridOrchestrator', 'routing', 'grokEscalationThreshold', '"0.6"', 'number', '"0.6"', 'Grok 升级阈值', '置信度低于此值升级到 Grok', NULL, '{"min":0.3,"max":0.9,"step":0.05}', 20, 1, 1, 55, '阈值越低越少请求走 Grok', '1.0.0', 'global'),
('hybridOrchestrator', 'costGate', 'dailyGrokBudget', '"500"', 'number', '"500"', '每日 Grok 预算', '每日 Grok API 调用预算上限', 'USD', '{"min":10,"max":10000,"step":10}', 25, 1, 1, 80, '预算耗尽后所有请求降级为快速路径', '1.0.0', 'global'),
('hybridOrchestrator', 'costGate', 'costPerGrokCall', '"0.05"', 'number', '"0.05"', '单次 Grok 成本', '每次 Grok API 调用的估算成本', 'USD', '{"min":0.001,"max":1,"step":0.001}', 30, 1, 1, 20, '用于预算计算', '1.0.0', 'global'),
('hybridOrchestrator', 'costGate', 'budgetAlertPercent', '"80"', 'number', '"80"', '预算告警阈值', '预算使用达到此百分比时告警', '%', '{"min":50,"max":95,"step":5}', 35, 1, 1, 15, '提前告警避免突然降级', '1.0.0', 'global'),
('hybridOrchestrator', 'concurrency', 'maxConcurrentGrok', '"5"', 'number', '"5"', 'Grok 最大并发', '同时进行的 Grok 推理请求数', '个', '{"min":1,"max":50,"step":1}', 40, 1, 1, 45, '并发过高可能触发 API 限流', '1.0.0', 'global'),
('hybridOrchestrator', 'concurrency', 'maxConcurrentFast', '"20"', 'number', '"20"', '快速路径最大并发', '同时进行的快速路径推理数', '个', '{"min":5,"max":100,"step":5}', 45, 1, 1, 25, '并发过高占用 CPU', '1.0.0', 'global'),
('hybridOrchestrator', 'timeout', 'grokTimeoutMs', '"30000"', 'number', '"30000"', 'Grok 超时', 'Grok API 调用超时时间', 'ms', '{"min":5000,"max":120000,"step":5000}', 50, 1, 1, 35, '超时后降级到快速路径', '1.0.0', 'global'),
('hybridOrchestrator', 'timeout', 'fastPathTimeoutMs', '"5000"', 'number', '"5000"', '快速路径超时', '快速路径推理超时时间', 'ms', '{"min":1000,"max":30000,"step":1000}', 55, 1, 1, 25, '超时后返回降级结果', '1.0.0', 'global'),
('hybridOrchestrator', 'autoRollback', 'autoRollbackEnabled', '"true"', 'boolean', '"true"', '自动回滚', '配置变更后指标恶化自动回滚', NULL, NULL, 60, 1, 1, 70, '关闭后需人工监控配置效果', '1.0.0', 'global'),
('hybridOrchestrator', 'autoRollback', 'rollbackThresholdPercent', '"20"', 'number', '"20"', '回滚阈值', '指标恶化超过此百分比触发回滚', '%', '{"min":5,"max":50,"step":5}', 65, 1, 1, 50, '阈值越低越敏感', '1.0.0', 'global'),

-- ============================================================================
-- S7. L4 认知推理层 — GrokEnhancer（14 项）
-- ============================================================================
('grokEnhancer', 'model', 'modelVersion', '"grok-3"', 'string', '"grok-3"', '模型版本', 'Grok 大模型版本', NULL, '{"options":["grok-2","grok-3","grok-3-mini"]}', 10, 1, 1, 75, '模型版本影响推理质量和成本', '1.0.0', 'global'),
('grokEnhancer', 'model', 'temperature', '"0.3"', 'number', '"0.3"', '温度', '生成温度（越低越确定性）', NULL, '{"min":0,"max":2,"step":0.1}', 15, 1, 1, 40, '温度影响输出多样性', '1.0.0', 'global'),
('grokEnhancer', 'model', 'topP', '"0.9"', 'number', '"0.9"', 'Top-P', '核采样参数', NULL, '{"min":0.1,"max":1,"step":0.05}', 20, 1, 1, 30, '与温度配合控制输出质量', '1.0.0', 'global'),
('grokEnhancer', 'model', 'maxTokens', '"4096"', 'number', '"4096"', '最大 Token', '单次推理最大输出 Token 数', 'tokens', '{"min":256,"max":32768,"step":256}', 25, 1, 1, 35, 'Token 数影响成本和响应时间', '1.0.0', 'global'),
('grokEnhancer', 'circuitBreaker', 'circuitBreakerEnabled', '"true"', 'boolean', '"true"', '熔断器', '启用 Grok API 熔断保护', NULL, NULL, 30, 1, 1, 80, '关闭后 API 故障将直接影响所有推理', '1.0.0', 'global'),
('grokEnhancer', 'circuitBreaker', 'failureThreshold', '"5"', 'number', '"5"', '熔断阈值', '连续失败 N 次后触发熔断', '次', '{"min":1,"max":20,"step":1}', 35, 1, 1, 60, '阈值越低熔断越快', '1.0.0', 'global'),
('grokEnhancer', 'circuitBreaker', 'resetTimeoutMs', '"60000"', 'number', '"60000"', '熔断恢复时间', '熔断后多久尝试恢复', 'ms', '{"min":10000,"max":600000,"step":10000}', 40, 1, 1, 40, '恢复时间影响服务可用性', '1.0.0', 'global'),
('grokEnhancer', 'circuitBreaker', 'halfOpenMaxCalls', '"2"', 'number', '"2"', '半开最大调用', '半开状态允许的探测调用数', '次', '{"min":1,"max":10,"step":1}', 45, 1, 1, 20, '探测调用数影响恢复速度', '1.0.0', 'global'),
('grokEnhancer', 'rateLimiter', 'tokensPerSecond', '"10"', 'number', '"10"', '令牌桶速率', '每秒补充的令牌数', '个/s', '{"min":1,"max":100,"step":1}', 50, 1, 1, 65, '速率直接限制 Grok 调用频率', '1.0.0', 'global'),
('grokEnhancer', 'rateLimiter', 'bucketCapacity', '"20"', 'number', '"20"', '令牌桶容量', '令牌桶最大容量（允许突发）', '个', '{"min":5,"max":200,"step":5}', 55, 1, 1, 45, '容量决定突发能力', '1.0.0', 'global'),
('grokEnhancer', 'cache', 'cacheEnabled', '"true"', 'boolean', '"true"', '结果缓存', '启用 Grok 推理结果缓存', NULL, NULL, 60, 1, 1, 50, '缓存可大幅降低 API 成本', '1.0.0', 'global'),
('grokEnhancer', 'cache', 'cacheTtlMs', '"300000"', 'number', '"300000"', '缓存 TTL', '缓存结果的有效时间', 'ms', '{"min":60000,"max":3600000,"step":60000}', 65, 1, 1, 30, 'TTL 过长可能返回过时结果', '1.0.0', 'global'),
('grokEnhancer', 'logging', 'logLevel', '"info"', 'string', '"info"', '日志级别', 'Grok 模块日志级别', NULL, '{"options":["debug","info","warn","error"]}', 70, 1, 1, 5, '调试时可临时设为 debug', '1.0.0', 'global'),
('grokEnhancer', 'logging', 'logPrompts', '"false"', 'boolean', '"false"', '记录 Prompt', '是否记录发送给 Grok 的完整 Prompt', NULL, NULL, 75, 1, 1, 10, '开启后日志量增大，但便于调试', '1.0.0', 'global'),

-- ============================================================================
-- S8. L4 认知推理层 — ExperiencePool（8 项）
-- ============================================================================
('experiencePool', 'capacity', 'softCapacity', '"5000"', 'number', '"5000"', '软容量上限', '超过后触发衰减清理', '条', '{"min":1000,"max":50000,"step":1000}', 10, 1, 1, 40, '软上限触发渐进式清理', '1.0.0', 'global'),
('experiencePool', 'capacity', 'hardCapacity', '"10000"', 'number', '"10000"', '硬容量上限', '超过后强制淘汰最旧经验', '条', '{"min":2000,"max":100000,"step":1000}', 15, 1, 1, 55, '硬上限保护内存不溢出', '1.0.0', 'global'),
('experiencePool', 'decay', 'decayStrategy', '"exponential"', 'string', '"exponential"', '衰减策略', '经验权重衰减方式', NULL, '{"options":["linear","exponential","step"]}', 20, 1, 1, 35, '衰减策略影响历史经验的利用效率', '1.0.0', 'global'),
('experiencePool', 'decay', 'decayHalfLifeDays', '"30"', 'number', '"30"', '衰减半衰期', '经验权重衰减到 50% 的天数', '天', '{"min":7,"max":365,"step":7}', 25, 1, 1, 45, '半衰期越短越偏向新经验', '1.0.0', 'global'),
('experiencePool', 'decay', 'minWeight', '"0.1"', 'number', '"0.1"', '最小权重', '经验衰减的最低权重', NULL, '{"min":0.01,"max":0.5,"step":0.01}', 30, 1, 1, 20, '低于此权重的经验在清理时优先淘汰', '1.0.0', 'global'),
('experiencePool', 'retrieval', 'retrievalTopK', '"5"', 'number', '"5"', '检索 Top-K', '每次推理检索的相似经验数', '条', '{"min":1,"max":20,"step":1}', 35, 1, 1, 30, 'K 值影响推理上下文丰富度', '1.0.0', 'global'),
('experiencePool', 'retrieval', 'similarityThreshold', '"0.7"', 'number', '"0.7"', '相似度阈值', '低于此相似度的经验不纳入', NULL, '{"min":0.3,"max":0.95,"step":0.05}', 40, 1, 1, 25, '阈值越高匹配越精确但可能遗漏', '1.0.0', 'global'),
('experiencePool', 'persistence', 'persistIntervalMs', '"300000"', 'number', '"300000"', '持久化间隔', '经验池定期写入 DB 的间隔', 'ms', '{"min":60000,"max":3600000,"step":60000}', 45, 1, 1, 15, '间隔越短数据越安全但 DB 压力越大', '1.0.0', 'global'),

-- ============================================================================
-- S9. L4 认知推理层 — CausalGraph（7 项）
-- ============================================================================
('causalGraph', 'core', 'maxNodes', '"500"', 'number', '"500"', '最大节点数', '因果图最大节点数', '个', '{"min":50,"max":5000,"step":50}', 10, 1, 1, 50, '节点过多影响推理性能', '1.0.0', 'global'),
('causalGraph', 'core', 'maxEdges', '"2000"', 'number', '"2000"', '最大边数', '因果图最大边数', '条', '{"min":100,"max":20000,"step":100}', 15, 1, 1, 50, '边数过多影响图遍历性能', '1.0.0', 'global'),
('causalGraph', 'pruning', 'pruningEnabled', '"true"', 'boolean', '"true"', '自动剪枝', '启用低权重边自动剪枝', NULL, NULL, 20, 1, 1, 40, '关闭后图会持续膨胀', '1.0.0', 'global'),
('causalGraph', 'pruning', 'pruningThreshold', '"0.1"', 'number', '"0.1"', '剪枝阈值', '边权重低于此值被剪枝', NULL, '{"min":0.01,"max":0.5,"step":0.01}', 25, 1, 1, 45, '阈值越高剪枝越激进', '1.0.0', 'global'),
('causalGraph', 'pruning', 'pruningIntervalMs', '"3600000"', 'number', '"3600000"', '剪枝间隔', '自动剪枝的执行间隔', 'ms', '{"min":600000,"max":86400000,"step":600000}', 30, 1, 1, 15, '间隔影响图的精简速度', '1.0.0', 'global'),
('causalGraph', 'inference', 'maxDepth', '"5"', 'number', '"5"', '最大推理深度', '因果链路追溯的最大深度', '层', '{"min":2,"max":20,"step":1}', 35, 1, 1, 35, '深度越大推理越全面但越慢', '1.0.0', 'global'),
('causalGraph', 'inference', 'confidenceDecay', '"0.9"', 'number', '"0.9"', '置信度衰减', '每层推理的置信度衰减系数', NULL, '{"min":0.5,"max":0.99,"step":0.01}', 40, 1, 1, 30, '衰减越快远端因果影响越小', '1.0.0', 'global'),

-- ============================================================================
-- S10. L4 认知推理层 — KnowledgeFeedbackLoop（7 项）
-- ============================================================================
('feedbackLoop', 'core', 'feedbackEnabled', '"true"', 'boolean', '"true"', '反馈学习', '启用知识反馈闭环自动学习', NULL, NULL, 10, 1, 1, 70, '关闭后系统无法从错误中学习', '1.0.0', 'global'),
('feedbackLoop', 'core', 'learningRate', '"0.01"', 'number', '"0.01"', '学习率', '反馈学习的权重更新步长', NULL, '{"min":0.001,"max":0.1,"step":0.001}', 15, 1, 1, 60, '学习率过高可能震荡，过低收敛慢', '1.0.0', 'global'),
('feedbackLoop', 'core', 'minSamplesForUpdate', '"10"', 'number', '"10"', '最小样本数', '触发一次权重更新的最小反馈样本数', '条', '{"min":3,"max":100,"step":1}', 20, 1, 1, 35, '样本过少更新不稳定', '1.0.0', 'global'),
('feedbackLoop', 'core', 'updateIntervalMs', '"3600000"', 'number', '"3600000"', '更新间隔', '权重更新的最小间隔', 'ms', '{"min":600000,"max":86400000,"step":600000}', 25, 1, 1, 25, '间隔影响学习速度', '1.0.0', 'global'),
('feedbackLoop', 'validation', 'validationSplitRatio', '"0.2"', 'number', '"0.2"', '验证集比例', '用于验证更新效果的数据比例', NULL, '{"min":0.1,"max":0.5,"step":0.05}', 30, 1, 1, 20, '比例影响验证可靠性', '1.0.0', 'global'),
('feedbackLoop', 'validation', 'rollbackOnDegradation', '"true"', 'boolean', '"true"', '退化回滚', '验证指标退化时自动回滚权重', NULL, NULL, 35, 1, 1, 65, '关闭后错误学习无法自动纠正', '1.0.0', 'global'),
('feedbackLoop', 'validation', 'degradationThresholdPercent', '"10"', 'number', '"10"', '退化阈值', '指标退化超过此百分比触发回滚', '%', '{"min":3,"max":30,"step":1}', 40, 1, 1, 40, '阈值越低越敏感', '1.0.0', 'global'),

-- ============================================================================
-- S11. L4 认知推理层 — RULPredictor（5 项）
-- ============================================================================
('rulPredictor', 'core', 'predictionWindowDays', '"90"', 'number', '"90"', '预测窗口', 'RUL 预测的时间窗口', '天', '{"min":7,"max":365,"step":7}', 10, 1, 1, 55, '窗口越长预测越远但精度越低', '1.0.0', 'global'),
('rulPredictor', 'core', 'confidenceLevel', '"0.95"', 'number', '"0.95"', '置信水平', 'RUL 预测的置信区间水平', NULL, '{"min":0.8,"max":0.99,"step":0.01}', 15, 1, 1, 30, '置信水平影响预测区间宽度', '1.0.0', 'global'),
('rulPredictor', 'threshold', 'warningDays', '"30"', 'number', '"30"', '预警天数', 'RUL 低于此天数触发预警', '天', '{"min":7,"max":180,"step":7}', 20, 1, 1, 45, '预警天数影响维护计划提前量', '1.0.0', 'global'),
('rulPredictor', 'threshold', 'criticalDays', '"7"', 'number', '"7"', '紧急天数', 'RUL 低于此天数触发紧急告警', '天', '{"min":1,"max":30,"step":1}', 25, 1, 1, 65, '紧急告警触发立即维护', '1.0.0', 'global'),
('rulPredictor', 'model', 'ensembleMethod', '"weighted_average"', 'string', '"weighted_average"', '集成方法', 'RUL 多模型集成方式', NULL, '{"options":["weighted_average","median","best_model"]}', 30, 1, 1, 40, '集成方法影响预测稳定性', '1.0.0', 'global'),

-- ============================================================================
-- S12. L5 仿真引擎层 — SimulationEngine（12 项）
-- ============================================================================
('simulationEngine', 'core', 'defaultMethod', '"monte_carlo"', 'string', '"monte_carlo"', '默认仿真方法', '仿真引擎默认使用的方法', NULL, '{"options":["monte_carlo","deterministic","quasi_monte_carlo"]}', 10, 1, 1, 45, '方法选择影响仿真精度和速度', '1.0.0', 'global'),
('simulationEngine', 'core', 'defaultSteps', '"100"', 'number', '"100"', '默认步数', '仿真默认时间步数', '步', '{"min":10,"max":10000,"step":10}', 15, 1, 1, 35, '步数越多精度越高但耗时越长', '1.0.0', 'global'),
('simulationEngine', 'core', 'defaultMonteCarloRuns', '"1000"', 'number', '"1000"', '蒙特卡洛运行次数', '蒙特卡洛仿真的默认运行次数', '次', '{"min":100,"max":100000,"step":100}', 20, 1, 1, 50, '次数越多结果越稳定但耗时越长', '1.0.0', 'global'),
('simulationEngine', 'core', 'maxConcurrentSims', '"3"', 'number', '"3"', '最大并发仿真', '同时运行的仿真任务数', '个', '{"min":1,"max":10,"step":1}', 25, 1, 1, 40, '并发过高占用大量 CPU', '1.0.0', 'global'),
('simulationEngine', 'timeout', 'singleSimTimeoutMs', '"300000"', 'number', '"300000"', '单次仿真超时', '单个仿真任务的最大执行时间', 'ms', '{"min":30000,"max":3600000,"step":30000}', 30, 1, 1, 30, '超时后任务标记为 failed', '1.0.0', 'global'),
('simulationEngine', 'timeout', 'batchSimTimeoutMs', '"1800000"', 'number', '"1800000"', '批量仿真超时', '批量仿真的总超时时间', 'ms', '{"min":300000,"max":7200000,"step":300000}', 35, 1, 1, 25, '批量超时保护系统资源', '1.0.0', 'global'),
('simulationEngine', 'risk', 'riskThresholdHigh', '"0.8"', 'number', '"0.8"', '高风险阈值', '风险评分高于此值标记为高风险', NULL, '{"min":0.5,"max":0.99,"step":0.01}', 40, 1, 1, 50, '阈值影响风险告警灵敏度', '1.0.0', 'global'),
('simulationEngine', 'risk', 'riskThresholdMedium', '"0.5"', 'number', '"0.5"', '中风险阈值', '风险评分高于此值标记为中风险', NULL, '{"min":0.2,"max":0.8,"step":0.01}', 45, 1, 1, 30, '阈值影响风险分级', '1.0.0', 'global'),
('simulationEngine', 'sobol', 'sobolDimensions', '"8"', 'number', '"8"', 'Sobol 维度', '准蒙特卡洛序列的维度数', '维', '{"min":2,"max":64,"step":2}', 50, 1, 1, 25, '维度影响参数空间覆盖', '1.0.0', 'global'),
('simulationEngine', 'anomaly', 'anomalyDetectionEnabled', '"true"', 'boolean', '"true"', '异常检测', '仿真结果自动异常检测', NULL, NULL, 55, 1, 1, 35, '关闭后不检测仿真异常', '1.0.0', 'global'),
('simulationEngine', 'anomaly', 'anomalyZScoreThreshold', '"2.5"', 'number', '"2.5"', '异常 Z-Score', '仿真结果异常检测的 Z-Score 阈值', NULL, '{"min":1.5,"max":5,"step":0.5}', 60, 1, 1, 20, '阈值越低越敏感', '1.0.0', 'global'),
('simulationEngine', 'persistence', 'resultRetentionDays', '"90"', 'number', '"90"', '结果保留天数', '仿真结果在 DB 中的保留时间', '天', '{"min":7,"max":365,"step":7}', 65, 1, 1, 10, '过期结果自动清理', '1.0.0', 'global'),

-- ============================================================================
-- S13. L5 仿真引擎层 — ReplayEngine（6 项）
-- ============================================================================
('replayEngine', 'core', 'maxReplayDurationMs', '"3600000"', 'number', '"3600000"', '最大回放时长', '单次回放的最大时间范围', 'ms', '{"min":60000,"max":86400000,"step":60000}', 10, 1, 1, 20, '时长过长占用大量内存', '1.0.0', 'global'),
('replayEngine', 'core', 'defaultPlaybackSpeed', '"1"', 'number', '"1"', '默认播放速度', '回放的默认速度倍率', 'x', '{"min":0.1,"max":100,"step":0.1}', 15, 1, 1, 5, '速度影响回放体验', '1.0.0', 'global'),
('replayEngine', 'core', 'maxChannels', '"16"', 'number', '"16"', '最大通道数', '同时回放的最大数据通道数', '个', '{"min":1,"max":64,"step":1}', 20, 1, 1, 15, '通道过多影响性能', '1.0.0', 'global'),
('replayEngine', 'interpolation', 'interpolationMethod', '"linear"', 'string', '"linear"', '插值方法', '数据点之间的插值方式', NULL, '{"options":["linear","cubic","nearest"]}', 25, 1, 1, 25, '插值方法影响回放平滑度', '1.0.0', 'global'),
('replayEngine', 'buffer', 'bufferSizeMs', '"30000"', 'number', '"30000"', '缓冲区大小', '回放数据预加载缓冲区', 'ms', '{"min":5000,"max":120000,"step":5000}', 30, 1, 1, 10, '缓冲越大越流畅但内存占用越高', '1.0.0', 'global'),
('replayEngine', 'buffer', 'preloadEnabled', '"true"', 'boolean', '"true"', '预加载', '启用回放数据预加载', NULL, NULL, 35, 1, 1, 10, '关闭后可能出现回放卡顿', '1.0.0', 'global'),

-- ============================================================================
-- S14. L5 仿真引擎层 — UncertaintyQuantifier（5 项）
-- ============================================================================
('uncertaintyQuantifier', 'core', 'method', '"ensemble"', 'string', '"ensemble"', '量化方法', '不确定性量化的方法', NULL, '{"options":["ensemble","bayesian","dropout","conformal"]}', 10, 1, 1, 45, '方法影响量化精度和计算成本', '1.0.0', 'global'),
('uncertaintyQuantifier', 'core', 'ensembleSize', '"5"', 'number', '"5"', '集成大小', '集成方法的模型数量', '个', '{"min":3,"max":20,"step":1}', 15, 1, 1, 35, '数量越多越准确但计算越慢', '1.0.0', 'global'),
('uncertaintyQuantifier', 'core', 'confidenceInterval', '"0.95"', 'number', '"0.95"', '置信区间', '不确定性量化的置信水平', NULL, '{"min":0.8,"max":0.99,"step":0.01}', 20, 1, 1, 25, '置信水平影响区间宽度', '1.0.0', 'global'),
('uncertaintyQuantifier', 'calibration', 'calibrationEnabled', '"true"', 'boolean', '"true"', '校准', '启用不确定性校准', NULL, NULL, 25, 1, 1, 40, '校准提高量化准确性', '1.0.0', 'global'),
('uncertaintyQuantifier', 'calibration', 'calibrationWindowSize', '"100"', 'number', '"100"', '校准窗口', '用于校准的历史样本数', '条', '{"min":20,"max":1000,"step":10}', 30, 1, 1, 20, '窗口越大校准越稳定', '1.0.0', 'global'),

-- ============================================================================
-- S15. L6 事件分发层 — TwinEventBus（5 项）
-- ============================================================================
('twinEventBus', 'core', 'maxListenersPerEvent', '"50"', 'number', '"50"', '最大监听器数', '每个事件类型的最大监听器数', '个', '{"min":10,"max":200,"step":10}', 10, 1, 1, 25, '超过上限新监听器将被拒绝', '1.0.0', 'global'),
('twinEventBus', 'core', 'eventTtlMs', '"86400000"', 'number', '"86400000"', '事件 TTL', '事件在总线中的最大存活时间', 'ms', '{"min":3600000,"max":604800000,"step":3600000}', 15, 1, 1, 15, 'TTL 过短可能丢失未处理事件', '1.0.0', 'global'),
('twinEventBus', 'core', 'asyncDispatch', '"true"', 'boolean', '"true"', '异步分发', '事件异步分发（不阻塞发布者）', NULL, NULL, 20, 1, 1, 40, '同步分发会阻塞发布者', '1.0.0', 'global'),
('twinEventBus', 'deadLetter', 'deadLetterEnabled', '"true"', 'boolean', '"true"', '死信队列', '处理失败的事件进入死信队列', NULL, NULL, 25, 1, 1, 35, '关闭后失败事件直接丢弃', '1.0.0', 'global'),
('twinEventBus', 'deadLetter', 'maxRetries', '"3"', 'number', '"3"', '最大重试', '事件处理失败后的最大重试次数', '次', '{"min":0,"max":10,"step":1}', 30, 1, 1, 30, '重试次数影响事件可靠性', '1.0.0', 'global'),

-- ============================================================================
-- S16. L6 事件分发层 — OutboxRelay（8 项）
-- ============================================================================
('outboxRelay', 'core', 'pollingIntervalMs', '"5000"', 'number', '"5000"', '轮询间隔', 'Outbox 表轮询间隔', 'ms', '{"min":1000,"max":30000,"step":1000}', 10, 1, 1, 50, '间隔越短事件投递越及时', '1.0.0', 'global'),
('outboxRelay', 'core', 'batchSize', '"100"', 'number', '"100"', '批量大小', '每次轮询处理的最大消息数', '条', '{"min":10,"max":1000,"step":10}', 15, 1, 1, 30, '批量过大可能导致处理超时', '1.0.0', 'global'),
('outboxRelay', 'retry', 'maxRetries', '"5"', 'number', '"5"', '最大重试', '消息投递失败的最大重试次数', '次', '{"min":1,"max":20,"step":1}', 20, 1, 1, 45, '重试次数影响消息可靠性', '1.0.0', 'global'),
('outboxRelay', 'retry', 'retryBackoffMs', '"1000"', 'number', '"1000"', '重试退避', '重试间隔的基础退避时间', 'ms', '{"min":500,"max":30000,"step":500}', 25, 1, 1, 20, '退避时间影响重试频率', '1.0.0', 'global'),
('outboxRelay', 'retry', 'retryBackoffMultiplier', '"2"', 'number', '"2"', '退避倍数', '指数退避的倍数', NULL, '{"min":1,"max":5,"step":0.5}', 30, 1, 1, 15, '倍数影响退避增长速度', '1.0.0', 'global'),
('outboxRelay', 'cleanup', 'retentionDays', '"7"', 'number', '"7"', '保留天数', '已投递消息的保留天数', '天', '{"min":1,"max":90,"step":1}', 35, 1, 1, 10, '过期消息自动清理', '1.0.0', 'global'),
('outboxRelay', 'cleanup', 'cleanupIntervalMs', '"3600000"', 'number', '"3600000"', '清理间隔', '过期消息清理的执行间隔', 'ms', '{"min":600000,"max":86400000,"step":600000}', 40, 1, 1, 5, '间隔影响磁盘空间回收速度', '1.0.0', 'global'),
('outboxRelay', 'monitoring', 'staleThresholdMs', '"60000"', 'number', '"60000"', '滞留告警阈值', '消息在 Outbox 中超过此时间触发告警', 'ms', '{"min":10000,"max":600000,"step":10000}', 45, 1, 1, 40, '告警帮助发现投递瓶颈', '1.0.0', 'global'),

-- ============================================================================
-- S17. L7 异步任务层 — BullMQ（8 项）
-- ============================================================================
('bullmq', 'core', 'redisUrl', '"redis://localhost:6379"', 'string', '"redis://localhost:6379"', 'Redis 连接', 'BullMQ 使用的 Redis 连接地址', NULL, NULL, 10, 1, 1, 80, 'Redis 连接错误将导致所有异步任务失败', '1.0.0', 'global'),
('bullmq', 'core', 'defaultQueueName', '"twin-tasks"', 'string', '"twin-tasks"', '默认队列名', '数字孪生任务的默认队列', NULL, NULL, 15, 1, 1, 30, '队列名用于任务路由', '1.0.0', 'global'),
('bullmq', 'worker', 'concurrency', '"5"', 'number', '"5"', 'Worker 并发', '每个 Worker 的并发处理数', '个', '{"min":1,"max":20,"step":1}', 20, 1, 1, 55, '并发过高可能导致资源争抢', '1.0.0', 'global'),
('bullmq', 'worker', 'maxStalledCount', '"3"', 'number', '"3"', '最大停滞次数', '任务停滞超过此次数标记为失败', '次', '{"min":1,"max":10,"step":1}', 25, 1, 1, 35, '停滞检测保护任务不会永久挂起', '1.0.0', 'global'),
('bullmq', 'worker', 'stalledIntervalMs', '"30000"', 'number', '"30000"', '停滞检查间隔', '检查任务是否停滞的间隔', 'ms', '{"min":10000,"max":120000,"step":10000}', 30, 1, 1, 20, '间隔影响停滞检测灵敏度', '1.0.0', 'global'),
('bullmq', 'retry', 'defaultMaxRetries', '"3"', 'number', '"3"', '默认最大重试', '任务失败后的默认重试次数', '次', '{"min":0,"max":10,"step":1}', 35, 1, 1, 40, '重试次数影响任务可靠性', '1.0.0', 'global'),
('bullmq', 'retry', 'retryDelayMs', '"5000"', 'number', '"5000"', '重试延迟', '重试前的等待时间', 'ms', '{"min":1000,"max":60000,"step":1000}', 40, 1, 1, 15, '延迟影响重试频率', '1.0.0', 'global'),
('bullmq', 'dashboard', 'bullBoardEnabled', '"false"', 'boolean', '"false"', 'Bull Board', '启用 Bull Board 管理面板', NULL, NULL, 45, 1, 1, 10, '面板提供任务可视化管理', '1.0.0', 'global')

ON DUPLICATE KEY UPDATE 
  `config_value` = VALUES(`config_value`),
  `label` = VALUES(`label`),
  `description` = VALUES(`description`);

-- ============================================================================
-- 验证
-- ============================================================================
SELECT CONCAT('✅ twin-config seed 执行完成：', COUNT(*), ' 条配置项') AS result
FROM `engine_config_registry`
WHERE `module` IN (
  'deviceSampling', 'stateSyncEngine', 'worldModel', 'physicsValidator', 'vectorStore',
  'hybridOrchestrator', 'grokEnhancer', 'experiencePool', 'causalGraph', 'feedbackLoop',
  'rulPredictor', 'simulationEngine', 'replayEngine', 'uncertaintyQuantifier',
  'twinEventBus', 'outboxRelay', 'bullmq'
);
