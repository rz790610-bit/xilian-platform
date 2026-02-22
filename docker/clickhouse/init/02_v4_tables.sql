-- ============================================================
-- V4.0 ClickHouse 完整表清单
-- 参考：portai_v4_production.md §23-24
-- ============================================================

-- ===== Step 1: 基础 MergeTree 表 =====

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
SAMPLE BY intHash32(mp_code)
TTL toDateTime(timestamp) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- 设备状态日志
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

-- 告警事件日志
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

-- 数据质量指标
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

-- 查询性能日志
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

-- ===== Step 2: Kafka Engine 表 =====

-- 注意：Kafka Engine 表仅在 Kafka 可用时创建
-- 生产环境需要修改 kafka_broker_list 为实际地址
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

-- ===== Step 3: 物化视图 =====

-- Kafka → MergeTree 自动写入
CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.vibration_features_mv
TO portai_timeseries.vibration_features AS
SELECT * FROM portai_timeseries.vibration_features_kafka_queue;

-- 1分钟聚合视图
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

-- 1小时聚合视图
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

-- 设备日统计视图
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

-- 告警小时统计视图
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

-- ===== 索引 =====
ALTER TABLE portai_timeseries.vibration_features ADD INDEX IF NOT EXISTS idx_gateway (gateway_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.vibration_features ADD INDEX IF NOT EXISTS idx_batch (batch_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.alert_event_log ADD INDEX IF NOT EXISTS idx_alert_severity (severity) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.alert_event_log ADD INDEX IF NOT EXISTS idx_alert_type (alert_type) TYPE bloom_filter GRANULARITY 4;
