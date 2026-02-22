-- ============================================================================
-- portai-platform v5.0 — ClickHouse DDL
-- ============================================================================
-- 新增基础表 + 5 个物化视图（预聚合宽表）
-- 执行方式：
--   clickhouse-client --host <HOST> --port 9000 --database portai_timeseries < 03_v5_tables.sql
--   或在 Docker 初始化时自动执行
-- ============================================================================

-- ===== Step 1: v5.0 基础表 =====

-- 实时遥测宽表（感知层输出，21维状态向量的源数据）
CREATE TABLE IF NOT EXISTS portai_timeseries.realtime_telemetry (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    mp_code String CODEC(LZ4),
    metric_name String CODEC(LZ4),
    value Float64 CODEC(Delta, ZSTD(5)),
    quality_score Float32 DEFAULT 1.0 CODEC(Delta, ZSTD(5)),
    sampling_rate_hz Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    condition_id String DEFAULT '' CODEC(LZ4),
    condition_phase String DEFAULT '' CODEC(LZ4),
    state_vector String DEFAULT '[]' CODEC(ZSTD(3)),
    fusion_confidence Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    source_protocol String DEFAULT 'unknown' CODEC(LZ4),
    gateway_id String DEFAULT '' CODEC(LZ4),
    batch_id String DEFAULT '' CODEC(LZ4)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (device_code, mp_code, metric_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- 认知会话结果表
CREATE TABLE IF NOT EXISTS portai_timeseries.cognition_session_results (
    session_id String CODEC(LZ4),
    device_code String CODEC(LZ4),
    trigger_type String CODEC(LZ4),
    started_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    completed_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    duration_ms UInt32 DEFAULT 0,
    status String DEFAULT 'unknown' CODEC(LZ4),
    -- 四维得分
    safety_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    health_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    efficiency_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    fatigue_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    -- 融合结论
    fusion_conclusion String DEFAULT '' CODEC(ZSTD(3)),
    fusion_confidence Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    -- Grok 推理
    grok_reasoning_steps UInt16 DEFAULT 0,
    grok_tools_used String DEFAULT '[]' CODEC(ZSTD(3)),
    grok_tokens_used UInt32 DEFAULT 0,
    -- 诊断结果
    root_cause String DEFAULT '' CODEC(ZSTD(3)),
    recommendations String DEFAULT '[]' CODEC(ZSTD(3)),
    evidence_chain String DEFAULT '[]' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (device_code, started_at)
TTL toDateTime(started_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 护栏违规事件表
CREATE TABLE IF NOT EXISTS portai_timeseries.guardrail_violation_events (
    violation_id String CODEC(LZ4),
    rule_id String CODEC(LZ4),
    rule_name String CODEC(LZ4),
    rule_category String CODEC(LZ4),
    device_code String CODEC(LZ4),
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    severity String CODEC(LZ4),
    trigger_value Float64 CODEC(Delta, ZSTD(5)),
    threshold_value Float64 CODEC(Delta, ZSTD(5)),
    action_taken String DEFAULT '' CODEC(LZ4),
    action_success UInt8 DEFAULT 0,
    intervention_duration_ms UInt32 DEFAULT 0,
    -- 干预后状态改善
    pre_intervention_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    post_intervention_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    is_false_positive UInt8 DEFAULT 0,
    context String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, rule_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- 进化周期指标表
CREATE TABLE IF NOT EXISTS portai_timeseries.evolution_cycle_metrics (
    cycle_id String CODEC(LZ4),
    cycle_type String CODEC(LZ4),
    started_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    completed_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    -- 影子评估指标
    shadow_accuracy Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_precision Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_recall Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_f1 Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_edge_cases UInt32 DEFAULT 0,
    -- 冠军挑战者
    champion_model_id String DEFAULT '' CODEC(LZ4),
    challenger_model_id String DEFAULT '' CODEC(LZ4),
    champion_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    challenger_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    promoted UInt8 DEFAULT 0,
    -- 知识结晶
    crystals_generated UInt16 DEFAULT 0,
    knowledge_nodes_added UInt16 DEFAULT 0,
    -- 元学习
    meta_learning_loss Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    hyperparams_updated String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (cycle_type, started_at)
TTL toDateTime(started_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 工况实例表（感知层工况识别输出）
CREATE TABLE IF NOT EXISTS portai_timeseries.condition_instances (
    instance_id String CODEC(LZ4),
    device_code String CODEC(LZ4),
    condition_type String CODEC(LZ4),
    phase String CODEC(LZ4),
    started_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    ended_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    duration_ms UInt32 DEFAULT 0,
    avg_speed Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    peak_current Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    peak_vibration Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    energy_consumed Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    uncertainty_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    metadata String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (device_code, condition_type, started_at)
TTL toDateTime(started_at) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;


-- ===== Step 2: v5.0 物化视图（5 个预聚合宽表） =====

-- ---------------------------------------------------------------
-- MV-1: mv_device_health_wide
-- 用途：设备健康一览（按设备+小时聚合）
-- 源表：realtime_telemetry + cognition_session_results
-- ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_device_health_wide
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    -- 遥测聚合
    avgState(value) AS avg_value,
    maxState(value) AS max_value,
    minState(value) AS min_value,
    stddevPopState(value) AS std_value,
    countState() AS sample_count,
    avgState(quality_score) AS avg_quality,
    avgState(fusion_confidence) AS avg_fusion_confidence
FROM portai_timeseries.realtime_telemetry
GROUP BY hour, device_code;

-- ---------------------------------------------------------------
-- MV-2: mv_cycle_phase_stats
-- 用途：周期阶段分析（按设备+工况类型+阶段聚合）
-- 源表：condition_instances
-- ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_cycle_phase_stats
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, condition_type, phase, day)
AS SELECT
    toDate(started_at) AS day,
    device_code,
    condition_type,
    phase,
    avgState(duration_ms) AS avg_cycle_time,
    avgState(avg_speed) AS avg_speed,
    maxState(peak_current) AS max_peak_current,
    maxState(peak_vibration) AS max_peak_vibration,
    avgState(energy_consumed) AS avg_energy,
    avgState(uncertainty_score) AS avg_uncertainty,
    countState() AS cycle_count
FROM portai_timeseries.condition_instances
GROUP BY day, device_code, condition_type, phase;

-- ---------------------------------------------------------------
-- MV-3: mv_fusion_diagnosis_wide
-- 用途：融合诊断分析（按设备+天聚合认知会话结果）
-- 源表：cognition_session_results
-- ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_fusion_diagnosis_wide
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, day)
AS SELECT
    toDate(started_at) AS day,
    device_code,
    -- 四维得分聚合
    avgState(safety_score) AS avg_safety_score,
    avgState(health_score) AS avg_health_score,
    avgState(efficiency_score) AS avg_efficiency_score,
    avgState(fatigue_score) AS avg_fatigue_score,
    -- 融合置信度
    avgState(fusion_confidence) AS avg_fusion_confidence,
    -- Grok 推理统计
    avgState(grok_reasoning_steps) AS avg_reasoning_steps,
    sumState(grok_tokens_used) AS total_tokens_used,
    -- 会话统计
    countState() AS session_count,
    avgState(duration_ms) AS avg_duration_ms
FROM portai_timeseries.cognition_session_results
GROUP BY day, device_code;

-- ---------------------------------------------------------------
-- MV-4: mv_guardrail_effectiveness
-- 用途：护栏效果评估（按规则+天聚合）
-- 源表：guardrail_violation_events
-- ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_guardrail_effectiveness
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (rule_id, day)
AS SELECT
    toDate(timestamp) AS day,
    rule_id,
    rule_name,
    rule_category,
    -- 触发统计
    countState() AS trigger_count,
    -- 执行成功率
    avgState(action_success) AS success_rate,
    -- 误报率
    avgState(is_false_positive) AS false_positive_rate,
    -- 干预效果
    avgState(pre_intervention_score) AS avg_pre_score,
    avgState(post_intervention_score) AS avg_post_score,
    avgState(intervention_duration_ms) AS avg_intervention_duration
FROM portai_timeseries.guardrail_violation_events
GROUP BY day, rule_id, rule_name, rule_category;

-- ---------------------------------------------------------------
-- MV-5: mv_evolution_trend
-- 用途：进化趋势追踪（按周聚合进化周期指标）
-- 源表：evolution_cycle_metrics
-- ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_evolution_trend
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(week)
ORDER BY (cycle_type, week)
AS SELECT
    toMonday(started_at) AS week,
    cycle_type,
    -- 准确率趋势
    avgState(shadow_accuracy) AS avg_accuracy,
    avgState(shadow_precision) AS avg_precision,
    avgState(shadow_recall) AS avg_recall,
    avgState(shadow_f1) AS avg_f1,
    -- 边缘案例
    sumState(shadow_edge_cases) AS total_edge_cases,
    -- 模型更新
    sumState(promoted) AS model_updates,
    -- 知识结晶
    sumState(crystals_generated) AS total_crystals,
    sumState(knowledge_nodes_added) AS total_knowledge_nodes,
    -- 元学习
    avgState(meta_learning_loss) AS avg_meta_loss,
    -- 周期数
    countState() AS cycle_count
FROM portai_timeseries.evolution_cycle_metrics
GROUP BY week, cycle_type;


-- ===== Step 3: 索引 =====

ALTER TABLE portai_timeseries.realtime_telemetry ADD INDEX IF NOT EXISTS idx_rt_condition (condition_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.realtime_telemetry ADD INDEX IF NOT EXISTS idx_rt_gateway (gateway_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.realtime_telemetry ADD INDEX IF NOT EXISTS idx_rt_batch (batch_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.realtime_telemetry ADD INDEX IF NOT EXISTS idx_rt_protocol (source_protocol) TYPE set(0) GRANULARITY 4;

ALTER TABLE portai_timeseries.cognition_session_results ADD INDEX IF NOT EXISTS idx_cs_trigger (trigger_type) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.cognition_session_results ADD INDEX IF NOT EXISTS idx_cs_status (status) TYPE set(0) GRANULARITY 4;

ALTER TABLE portai_timeseries.guardrail_violation_events ADD INDEX IF NOT EXISTS idx_gv_severity (severity) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.guardrail_violation_events ADD INDEX IF NOT EXISTS idx_gv_category (rule_category) TYPE set(0) GRANULARITY 4;

ALTER TABLE portai_timeseries.evolution_cycle_metrics ADD INDEX IF NOT EXISTS idx_ec_type (cycle_type) TYPE set(0) GRANULARITY 4;

ALTER TABLE portai_timeseries.condition_instances ADD INDEX IF NOT EXISTS idx_ci_type (condition_type) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.condition_instances ADD INDEX IF NOT EXISTS idx_ci_phase (phase) TYPE set(0) GRANULARITY 4;
