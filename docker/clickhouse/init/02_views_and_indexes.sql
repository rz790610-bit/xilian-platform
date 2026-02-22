-- ============================================================================
-- portai-platform ClickHouse DDL — Part 2: Kafka 表、物化视图、兼容视图、索引
-- ============================================================================
-- 依赖 01_base_tables.sql 中的基础表
-- ============================================================================


-- =============================================
-- Section A: Kafka Engine 表
-- =============================================
-- 注意：Kafka Engine 表仅在 Kafka 可用时创建
-- 生产环境需要修改 kafka_broker_list 为实际地址

-- 振动特征 Kafka 消费表（V4）
CREATE TABLE IF NOT EXISTS portai_timeseries.vibration_features_kafka_queue (
    timestamp DateTime64(3),
    device_code String,
    mp_code String,
    rms Float64,
    peak Float64,
    peak_to_peak Float64,
    kurtosis Float64,
    crest_factor Float64,
    skewness Float64,
    dominant_freq Float32,
    dominant_amp Float32,
    temperature Float32,
    rpm Float32,
    load_pct Float32,
    quality_score Float32,
    gateway_id String,
    batch_id String
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'telemetry.feature.*',
    kafka_group_name = 'clickhouse_vibration_sink',
    kafka_format = 'JSONEachRow',
    kafka_max_block_size = 1000,
    kafka_num_consumers = 3;

-- 实时遥测 Kafka 消费表（V4.1）
CREATE TABLE IF NOT EXISTS portai_timeseries.realtime_telemetry_kafka_queue (
    timestamp DateTime64(3),
    device_code String,
    mp_code String,
    metric_name String,
    value Float64,
    quality_score Float32,
    sampling_rate_hz Float32,
    condition_id String,
    condition_phase String,
    state_vector String,
    fusion_confidence Float32,
    source_protocol String,
    gateway_id String,
    batch_id String
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'telemetry.realtime.*',
    kafka_group_name = 'clickhouse_realtime_sink',
    kafka_format = 'JSONEachRow',
    kafka_max_block_size = 2000,
    kafka_num_consumers = 4;


-- =============================================
-- Section B: Kafka → MergeTree 物化视图
-- =============================================

-- 振动特征 Kafka → MergeTree
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.vibration_features_mv
TO portai_timeseries.vibration_features AS
SELECT * FROM portai_timeseries.vibration_features_kafka_queue;

-- 实时遥测 Kafka → MergeTree
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.realtime_telemetry_mv
TO portai_timeseries.realtime_telemetry AS
SELECT * FROM portai_timeseries.realtime_telemetry_kafka_queue;


-- =============================================
-- Section C: V1 聚合物化视图（sensor_readings 体系）
-- =============================================

-- 分钟级聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.sensor_readings_1m
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (device_id, sensor_id, metric_name, window_start)
AS SELECT
    device_id,
    sensor_id,
    metric_name,
    toStartOfMinute(timestamp) AS window_start,
    count() AS sample_count,
    sum(value) AS sum_value,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    stddevPop(value) AS std_dev
FROM portai_timeseries.sensor_readings
GROUP BY device_id, sensor_id, metric_name, window_start;

-- 小时级聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.sensor_readings_1h
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (device_id, sensor_id, metric_name, window_start)
AS SELECT
    device_id,
    sensor_id,
    metric_name,
    toStartOfHour(timestamp) AS window_start,
    count() AS sample_count,
    sum(value) AS sum_value,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    stddevPop(value) AS std_dev
FROM portai_timeseries.sensor_readings
GROUP BY device_id, sensor_id, metric_name, window_start;

-- 天级聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.sensor_readings_1d
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (device_id, sensor_id, metric_name, window_start)
AS SELECT
    device_id,
    sensor_id,
    metric_name,
    toStartOfDay(timestamp) AS window_start,
    count() AS sample_count,
    sum(value) AS sum_value,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    stddevPop(value) AS std_dev
FROM portai_timeseries.sensor_readings
GROUP BY device_id, sensor_id, metric_name, window_start;


-- =============================================
-- Section D: V4 聚合物化视图（vibration_features 体系）
-- =============================================

-- 1分钟聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.vibration_features_1min_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (device_code, mp_code, minute)
AS SELECT
    toStartOfMinute(timestamp) AS minute,
    device_code,
    mp_code,
    avgState(rms) AS avg_rms,
    maxState(peak) AS max_peak,
    minState(rms) AS min_rms,
    avgState(kurtosis) AS avg_kurtosis,
    avgState(temperature) AS avg_temperature,
    countState() AS sample_count
FROM portai_timeseries.vibration_features
GROUP BY minute, device_code, mp_code;

-- 1小时聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.vibration_features_1hour_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, mp_code, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    mp_code,
    avgState(rms) AS avg_rms,
    maxState(peak) AS max_peak,
    minState(rms) AS min_rms,
    avgState(kurtosis) AS avg_kurtosis,
    avgState(temperature) AS avg_temperature,
    countState() AS sample_count
FROM portai_timeseries.vibration_features
GROUP BY hour, device_code, mp_code;

-- 设备日统计
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.device_daily_summary
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, day)
AS SELECT
    toDate(timestamp) AS day,
    device_code,
    avgState(rms) AS avg_rms,
    maxState(peak) AS max_peak,
    avgState(temperature) AS avg_temperature,
    countState() AS total_samples,
    uniqState(mp_code) AS active_mps
FROM portai_timeseries.vibration_features
GROUP BY day, device_code;

-- 告警小时统计
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.alert_hourly_stats
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    alert_type,
    severity,
    countState() AS alert_count,
    avgState(value) AS avg_value
FROM portai_timeseries.alert_event_log
GROUP BY hour, device_code, alert_type, severity;


-- =============================================
-- Section E: V4.1 聚合物化视图（realtime_telemetry 体系）
-- =============================================

-- 1分钟聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1min_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (device_code, mp_code, metric_name, minute)
AS SELECT
    toStartOfMinute(timestamp) AS minute,
    device_code,
    mp_code,
    metric_name,
    avgState(value) AS avg_value,
    maxState(value) AS max_value,
    minState(value) AS min_value,
    avgState(quality_score) AS avg_quality,
    countState() AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY minute, device_code, mp_code, metric_name;

-- 1小时聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1hour_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, mp_code, metric_name, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    mp_code,
    metric_name,
    avgState(value) AS avg_value,
    maxState(value) AS max_value,
    minState(value) AS min_value,
    avgState(quality_score) AS avg_quality,
    countState() AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY hour, device_code, mp_code, metric_name;

-- 1天聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1day_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, mp_code, metric_name, day)
AS SELECT
    toDate(timestamp) AS day,
    device_code,
    mp_code,
    metric_name,
    avgState(value) AS avg_value,
    maxState(value) AS max_value,
    minState(value) AS min_value,
    avgState(quality_score) AS avg_quality,
    countState() AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY day, device_code, mp_code, metric_name;

-- 设备日统计（遥测体系）
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_device_daily
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, day)
AS SELECT
    toDate(timestamp) AS day,
    device_code,
    countState() AS total_samples,
    uniqState(mp_code) AS active_mps,
    uniqState(metric_name) AS active_metrics,
    avgState(quality_score) AS avg_quality,
    avgState(fusion_confidence) AS avg_fusion_confidence
FROM portai_timeseries.realtime_telemetry
GROUP BY day, device_code;


-- =============================================
-- Section F: V5 聚合物化视图（认知层体系）
-- =============================================

-- MV-1: 设备健康一览（按设备+小时聚合）
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_device_health_wide
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    avgState(value) AS avg_value,
    maxState(value) AS max_value,
    minState(value) AS min_value,
    stddevPopState(value) AS std_value,
    countState() AS sample_count,
    avgState(quality_score) AS avg_quality,
    avgState(fusion_confidence) AS avg_fusion_confidence
FROM portai_timeseries.realtime_telemetry
GROUP BY hour, device_code;

-- MV-2: 周期阶段分析（按设备+工况类型+阶段聚合）
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

-- MV-3: 融合诊断分析（按设备+天聚合认知会话结果）
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_fusion_diagnosis_wide
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, day)
AS SELECT
    toDate(started_at) AS day,
    device_code,
    avgState(safety_score) AS avg_safety_score,
    avgState(health_score) AS avg_health_score,
    avgState(efficiency_score) AS avg_efficiency_score,
    avgState(fatigue_score) AS avg_fatigue_score,
    avgState(fusion_confidence) AS avg_fusion_confidence,
    avgState(grok_reasoning_steps) AS avg_reasoning_steps,
    sumState(grok_tokens_used) AS total_tokens_used,
    countState() AS session_count,
    avgState(duration_ms) AS avg_duration_ms
FROM portai_timeseries.cognition_session_results
GROUP BY day, device_code;

-- MV-4: 护栏效果评估（按规则+天聚合）
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_guardrail_effectiveness
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (rule_id, day)
AS SELECT
    toDate(timestamp) AS day,
    rule_id,
    rule_name,
    rule_category,
    countState() AS trigger_count,
    avgState(action_success) AS success_rate,
    avgState(is_false_positive) AS false_positive_rate,
    avgState(pre_intervention_score) AS avg_pre_score,
    avgState(post_intervention_score) AS avg_post_score,
    avgState(intervention_duration_ms) AS avg_intervention_duration
FROM portai_timeseries.guardrail_violation_events
GROUP BY day, rule_id, rule_name, rule_category;

-- MV-5: 进化趋势追踪（按周聚合进化周期指标）
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.mv_evolution_trend
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(week)
ORDER BY (cycle_type, week)
AS SELECT
    toMonday(started_at) AS week,
    cycle_type,
    avgState(shadow_accuracy) AS avg_accuracy,
    avgState(shadow_precision) AS avg_precision,
    avgState(shadow_recall) AS avg_recall,
    avgState(shadow_f1) AS avg_f1,
    sumState(shadow_edge_cases) AS total_edge_cases,
    sumState(promoted) AS model_updates,
    sumState(crystals_generated) AS total_crystals,
    sumState(knowledge_nodes_added) AS total_knowledge_nodes,
    avgState(meta_learning_loss) AS avg_meta_loss,
    countState() AS cycle_count
FROM portai_timeseries.evolution_cycle_metrics
GROUP BY week, cycle_type;


-- =============================================
-- Section G: 兼容视图（V1 device_id → V4 device_code 桥接）
-- =============================================

-- sensor_readings 兼容视图（将 realtime_telemetry 映射为旧 sensor_readings 格式）
CREATE VIEW IF NOT EXISTS portai_timeseries.sensor_readings_compat AS
SELECT
    device_code AS device_id,
    mp_code AS sensor_id,
    metric_name,
    value,
    '' AS unit,
    multiIf(quality_score >= 0.8, 'good', quality_score >= 0.5, 'uncertain', 'bad') AS quality,
    timestamp,
    timestamp AS received_at,
    '{}' AS metadata
FROM portai_timeseries.realtime_telemetry;

-- telemetry_data 兼容视图
CREATE VIEW IF NOT EXISTS portai_timeseries.telemetry_data_compat AS
SELECT
    device_code AS device_id,
    mp_code AS sensor_id,
    metric_name,
    value,
    '' AS unit,
    multiIf(quality_score >= 0.8, 'good', quality_score >= 0.5, 'uncertain', 'bad') AS quality,
    timestamp,
    batch_id,
    source_protocol AS source
FROM portai_timeseries.realtime_telemetry;


-- =============================================
-- Section H: 索引
-- =============================================

-- V1 索引
ALTER TABLE portai_timeseries.sensor_readings ADD INDEX IF NOT EXISTS idx_device_sensor (device_id, sensor_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.telemetry_data ADD INDEX IF NOT EXISTS idx_device (device_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.anomaly_detections ADD INDEX IF NOT EXISTS idx_severity (severity) TYPE set(0) GRANULARITY 4;

-- V4 索引
ALTER TABLE portai_timeseries.vibration_features ADD INDEX IF NOT EXISTS idx_gateway (gateway_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.vibration_features ADD INDEX IF NOT EXISTS idx_batch (batch_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.alert_event_log ADD INDEX IF NOT EXISTS idx_alert_severity (severity) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.alert_event_log ADD INDEX IF NOT EXISTS idx_alert_type (alert_type) TYPE bloom_filter GRANULARITY 4;

-- V5 索引
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
ALTER TABLE portai_timeseries.anomaly_detections_v4 ADD INDEX IF NOT EXISTS idx_ad4_device (device_code) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.anomaly_detections_v4 ADD INDEX IF NOT EXISTS idx_ad4_severity (severity) TYPE set(0) GRANULARITY 4;
