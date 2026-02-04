-- ============================================================
-- 西联智能平台 - ClickHouse 时序数据库初始化脚本
-- XiLian Intelligent Platform - ClickHouse Initialization
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS xilian_timeseries;

-- ============================================================
-- 传感器原始数据表（高频写入）
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.sensor_readings
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    device_id LowCardinality(String),
    sensor_id LowCardinality(String),
    sensor_type LowCardinality(String),
    value Float64 CODEC(Gorilla),
    quality Enum8('good' = 1, 'uncertain' = 2, 'bad' = 3) DEFAULT 'good',
    unit LowCardinality(String),
    batch_id String,
    INDEX idx_device_id device_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_sensor_id sensor_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ============================================================
-- 分钟级聚合表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.sensor_aggregates_1m
(
    timestamp DateTime CODEC(DoubleDelta),
    device_id LowCardinality(String),
    sensor_id LowCardinality(String),
    sensor_type LowCardinality(String),
    count UInt32,
    sum Float64,
    min Float64,
    max Float64,
    avg Float64,
    stddev Float64,
    p50 Float64,
    p95 Float64,
    p99 Float64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL timestamp + INTERVAL 365 DAY;

-- 物化视图：自动聚合到分钟级
CREATE MATERIALIZED VIEW IF NOT EXISTS xilian_timeseries.mv_sensor_aggregates_1m
TO xilian_timeseries.sensor_aggregates_1m
AS SELECT
    toStartOfMinute(timestamp) AS timestamp,
    device_id,
    sensor_id,
    sensor_type,
    count() AS count,
    sum(value) AS sum,
    min(value) AS min,
    max(value) AS max,
    avg(value) AS avg,
    stddevPop(value) AS stddev,
    quantile(0.5)(value) AS p50,
    quantile(0.95)(value) AS p95,
    quantile(0.99)(value) AS p99
FROM xilian_timeseries.sensor_readings
GROUP BY timestamp, device_id, sensor_id, sensor_type;

-- ============================================================
-- 小时级聚合表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.sensor_aggregates_1h
(
    timestamp DateTime CODEC(DoubleDelta),
    device_id LowCardinality(String),
    sensor_id LowCardinality(String),
    sensor_type LowCardinality(String),
    count UInt32,
    sum Float64,
    min Float64,
    max Float64,
    avg Float64,
    stddev Float64,
    p50 Float64,
    p95 Float64,
    p99 Float64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL timestamp + INTERVAL 3 YEAR;

-- 物化视图：自动聚合到小时级
CREATE MATERIALIZED VIEW IF NOT EXISTS xilian_timeseries.mv_sensor_aggregates_1h
TO xilian_timeseries.sensor_aggregates_1h
AS SELECT
    toStartOfHour(timestamp) AS timestamp,
    device_id,
    sensor_id,
    sensor_type,
    count() AS count,
    sum(value) AS sum,
    min(value) AS min,
    max(value) AS max,
    avg(value) AS avg,
    stddevPop(value) AS stddev,
    quantile(0.5)(value) AS p50,
    quantile(0.95)(value) AS p95,
    quantile(0.99)(value) AS p99
FROM xilian_timeseries.sensor_readings
GROUP BY timestamp, device_id, sensor_id, sensor_type;

-- ============================================================
-- 日级聚合表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.sensor_aggregates_1d
(
    timestamp Date CODEC(DoubleDelta),
    device_id LowCardinality(String),
    sensor_id LowCardinality(String),
    sensor_type LowCardinality(String),
    count UInt32,
    sum Float64,
    min Float64,
    max Float64,
    avg Float64,
    stddev Float64,
    p50 Float64,
    p95 Float64,
    p99 Float64
)
ENGINE = SummingMergeTree()
PARTITION BY toYear(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL timestamp + INTERVAL 10 YEAR;

-- 物化视图：自动聚合到日级
CREATE MATERIALIZED VIEW IF NOT EXISTS xilian_timeseries.mv_sensor_aggregates_1d
TO xilian_timeseries.sensor_aggregates_1d
AS SELECT
    toDate(timestamp) AS timestamp,
    device_id,
    sensor_id,
    sensor_type,
    count() AS count,
    sum(value) AS sum,
    min(value) AS min,
    max(value) AS max,
    avg(value) AS avg,
    stddevPop(value) AS stddev,
    quantile(0.5)(value) AS p50,
    quantile(0.95)(value) AS p95,
    quantile(0.99)(value) AS p99
FROM xilian_timeseries.sensor_readings
GROUP BY timestamp, device_id, sensor_id, sensor_type;

-- ============================================================
-- 设备状态历史表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.device_status_history
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    device_id LowCardinality(String),
    status Enum8('online' = 1, 'offline' = 2, 'maintenance' = 3, 'error' = 4, 'unknown' = 5),
    previous_status Enum8('online' = 1, 'offline' = 2, 'maintenance' = 3, 'error' = 4, 'unknown' = 5),
    duration_seconds UInt32,
    reason String,
    INDEX idx_device_id device_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR;

-- ============================================================
-- 异常检测结果表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.anomaly_events
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    device_id LowCardinality(String),
    sensor_id LowCardinality(String),
    algorithm LowCardinality(String),
    score Float64,
    threshold Float64,
    current_value Float64,
    expected_value Float64,
    deviation Float64,
    severity Enum8('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4),
    context String,
    INDEX idx_device_id device_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_severity severity TYPE set(4) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, sensor_id, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- ============================================================
-- 系统指标表（CPU、内存、网络等）
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.system_metrics
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    host LowCardinality(String),
    metric_name LowCardinality(String),
    metric_type Enum8('gauge' = 1, 'counter' = 2, 'histogram' = 3),
    value Float64 CODEC(Gorilla),
    labels Map(String, String),
    INDEX idx_host host TYPE bloom_filter GRANULARITY 4,
    INDEX idx_metric_name metric_name TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (host, metric_name, timestamp)
TTL timestamp + INTERVAL 30 DAY;

-- ============================================================
-- API 请求日志表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.api_request_logs
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    request_id String,
    method LowCardinality(String),
    path String,
    status_code UInt16,
    latency_ms UInt32,
    user_id Nullable(String),
    client_ip String,
    user_agent String,
    request_size UInt32,
    response_size UInt32,
    error_message Nullable(String),
    INDEX idx_path path TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4,
    INDEX idx_status_code status_code TYPE set(100) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, request_id)
TTL timestamp + INTERVAL 30 DAY;

-- ============================================================
-- 模型推理日志表
-- ============================================================

CREATE TABLE IF NOT EXISTS xilian_timeseries.model_inference_logs
(
    timestamp DateTime64(3) CODEC(DoubleDelta),
    request_id String,
    model_id LowCardinality(String),
    model_type LowCardinality(String),
    input_tokens UInt32,
    output_tokens UInt32,
    latency_ms UInt32,
    status Enum8('success' = 1, 'error' = 2, 'timeout' = 3),
    user_id Nullable(String),
    error_message Nullable(String),
    INDEX idx_model_id model_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (model_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- ============================================================
-- 完成初始化
-- ============================================================

SELECT 'ClickHouse schema initialization completed successfully!' AS status;
