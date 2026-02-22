-- ============================================================================
-- portai-platform ClickHouse DDL — Part 1: 基础表
-- ============================================================================
-- 合并自 V1/V4/V4.1/V5 四个版本，统一到 portai_timeseries 数据库
-- 去重规则：同名表保留最新版本（V5 > V4.1 > V4 > V1）
-- ============================================================================

CREATE DATABASE IF NOT EXISTS portai_timeseries;


-- =============================================
-- Section A: V1 基础表（device_id 体系，向后兼容）
-- =============================================

-- 传感器原始读数表（高频写入）
CREATE TABLE IF NOT EXISTS portai_timeseries.sensor_readings (
    device_id String,
    sensor_id String,
    metric_name String,
    value Float64,
    unit String DEFAULT '',
    quality Enum8('good' = 1, 'uncertain' = 2, 'bad' = 3) DEFAULT 'good',
    timestamp DateTime64(3),
    received_at DateTime64(3) DEFAULT now64(3),
    metadata String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, sensor_id, metric_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- 设备遥测数据表
CREATE TABLE IF NOT EXISTS portai_timeseries.telemetry_data (
    device_id String,
    sensor_id String,
    metric_name String,
    value Float64,
    unit String DEFAULT '',
    quality Enum8('good' = 1, 'uncertain' = 2, 'bad' = 3) DEFAULT 'good',
    timestamp DateTime64(3),
    batch_id String DEFAULT '',
    source String DEFAULT 'direct'
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (device_id, timestamp, sensor_id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- 系统事件日志表（V1 独有）
CREATE TABLE IF NOT EXISTS portai_timeseries.event_logs (
    event_id String,
    topic String,
    event_type String,
    source String DEFAULT '',
    device_id String DEFAULT '',
    sensor_id String DEFAULT '',
    severity Enum8('info' = 1, 'warning' = 2, 'error' = 3, 'critical' = 4) DEFAULT 'info',
    payload String DEFAULT '{}',
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (topic, event_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- V1 异常检测结果表（保留向后兼容）
CREATE TABLE IF NOT EXISTS portai_timeseries.anomaly_detections (
    detection_id String,
    device_id String,
    sensor_id String,
    metric_name String,
    algorithm_type Enum8('zscore' = 1, 'iqr' = 2, 'mad' = 3, 'isolation_forest' = 4, 'custom' = 5) DEFAULT 'zscore',
    current_value Float64,
    expected_value Float64,
    deviation Float64,
    score Float64,
    severity Enum8('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4) DEFAULT 'low',
    is_acknowledged UInt8 DEFAULT 0,
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;


-- =============================================
-- Section B: V4 基础表（device_code 体系）
-- =============================================

-- 振动特征存储（核心时序表）
CREATE TABLE IF NOT EXISTS portai_timeseries.vibration_features (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    mp_code String CODEC(LZ4),
    rms Float64 CODEC(Delta, ZSTD(5)),
    peak Float64 CODEC(Delta, ZSTD(5)),
    peak_to_peak Float64 CODEC(Delta, ZSTD(5)),
    kurtosis Float64 CODEC(Delta, ZSTD(5)),
    crest_factor Float64 CODEC(Delta, ZSTD(5)),
    skewness Float64 CODEC(Delta, ZSTD(5)),
    dominant_freq Float32 CODEC(Delta, ZSTD(5)),
    dominant_amp Float32 CODEC(Delta, ZSTD(5)),
    temperature Float32 CODEC(Delta, ZSTD(5)),
    rpm Float32 CODEC(Delta, ZSTD(5)),
    load_pct Float32 CODEC(Delta, ZSTD(5)),
    quality_score Float32 CODEC(Delta, ZSTD(5)),
    gateway_id String CODEC(LZ4),
    batch_id String CODEC(LZ4)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, mp_code, timestamp)
SAMPLE BY cityHash64(mp_code)
TTL toDateTime(timestamp) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 设备状态日志（V4，替代 V1 device_status_history）
CREATE TABLE IF NOT EXISTS portai_timeseries.device_status_log (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    status String CODEC(LZ4),
    previous_status String CODEC(LZ4),
    reason String CODEC(ZSTD(3)),
    operator String CODEC(LZ4),
    metadata String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- 告警事件日志（V4）
CREATE TABLE IF NOT EXISTS portai_timeseries.alert_event_log (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    alert_type String CODEC(LZ4),
    severity String CODEC(LZ4),
    value Float64 CODEC(Delta, ZSTD(5)),
    threshold Float64 CODEC(Delta, ZSTD(5)),
    message String CODEC(ZSTD(3)),
    context String DEFAULT '{}' CODEC(ZSTD(3)),
    acknowledged UInt8 DEFAULT 0
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, timestamp)
TTL toDateTime(timestamp) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 数据质量指标（V4）
CREATE TABLE IF NOT EXISTS portai_timeseries.data_quality_metrics (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    mp_code String CODEC(LZ4),
    completeness Float64 CODEC(Delta, ZSTD(5)),
    accuracy Float64 CODEC(Delta, ZSTD(5)),
    timeliness Float64 CODEC(Delta, ZSTD(5)),
    consistency Float64 CODEC(Delta, ZSTD(5)),
    overall_score Float64 CODEC(Delta, ZSTD(5)),
    issues_count UInt32 DEFAULT 0,
    details String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- 查询性能日志（V4）
CREATE TABLE IF NOT EXISTS portai_timeseries.query_performance_log (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    query_type String CODEC(LZ4),
    target_engine String CODEC(LZ4),
    query_hash String CODEC(LZ4),
    duration_ms UInt32,
    rows_read UInt64 DEFAULT 0,
    bytes_read UInt64 DEFAULT 0,
    cache_hit UInt8 DEFAULT 0,
    user_id String CODEC(LZ4),
    query_text String CODEC(ZSTD(5))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (query_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- V4 异常检测结果表（device_code 体系）
CREATE TABLE IF NOT EXISTS portai_timeseries.anomaly_detections_v4 (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(5)),
    device_code String CODEC(LZ4),
    mp_code String CODEC(LZ4),
    metric_name String CODEC(LZ4),
    algorithm String DEFAULT 'zscore' CODEC(LZ4),
    current_value Float64 CODEC(Delta, ZSTD(5)),
    expected_value Float64 CODEC(Delta, ZSTD(5)),
    deviation Float64 CODEC(Delta, ZSTD(5)),
    anomaly_score Float64 CODEC(Delta, ZSTD(5)),
    severity String DEFAULT 'low' CODEC(LZ4),
    is_acknowledged UInt8 DEFAULT 0,
    context String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, mp_code, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;


-- =============================================
-- Section C: V5 基础表（认知层 + 统一遥测宽表）
-- =============================================

-- 实时遥测宽表（V5 最终版，感知层输出，21维状态向量的源数据）
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

-- 认知会话结果表（V5）
CREATE TABLE IF NOT EXISTS portai_timeseries.cognition_session_results (
    session_id String CODEC(LZ4),
    device_code String CODEC(LZ4),
    trigger_type String CODEC(LZ4),
    started_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    completed_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    duration_ms UInt32 DEFAULT 0,
    status String DEFAULT 'unknown' CODEC(LZ4),
    safety_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    health_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    efficiency_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    fatigue_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    fusion_conclusion String DEFAULT '' CODEC(ZSTD(3)),
    fusion_confidence Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    grok_reasoning_steps UInt16 DEFAULT 0,
    grok_tools_used String DEFAULT '[]' CODEC(ZSTD(3)),
    grok_tokens_used UInt32 DEFAULT 0,
    root_cause String DEFAULT '' CODEC(ZSTD(3)),
    recommendations String DEFAULT '[]' CODEC(ZSTD(3)),
    evidence_chain String DEFAULT '[]' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (device_code, started_at)
TTL toDateTime(started_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 护栏违规事件表（V5）
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
    pre_intervention_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    post_intervention_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    is_false_positive UInt8 DEFAULT 0,
    context String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, rule_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- 进化周期指标表（V5）
CREATE TABLE IF NOT EXISTS portai_timeseries.evolution_cycle_metrics (
    cycle_id String CODEC(LZ4),
    cycle_type String CODEC(LZ4),
    started_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    completed_at DateTime64(3) CODEC(Delta, ZSTD(5)),
    shadow_accuracy Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_precision Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_recall Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_f1 Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    shadow_edge_cases UInt32 DEFAULT 0,
    champion_model_id String DEFAULT '' CODEC(LZ4),
    challenger_model_id String DEFAULT '' CODEC(LZ4),
    champion_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    challenger_score Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    promoted UInt8 DEFAULT 0,
    crystals_generated UInt16 DEFAULT 0,
    knowledge_nodes_added UInt16 DEFAULT 0,
    meta_learning_loss Float32 DEFAULT 0 CODEC(Delta, ZSTD(5)),
    hyperparams_updated String DEFAULT '{}' CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (cycle_type, started_at)
TTL toDateTime(started_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 工况实例表（V5，感知层工况识别输出）
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
