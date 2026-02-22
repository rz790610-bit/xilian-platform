-- ClickHouse 时序数据库初始化脚本
-- 西联智能平台 - 时序数据存储

-- 创建数据库
CREATE DATABASE IF NOT EXISTS portai_timeseries;

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
TTL timestamp + INTERVAL 90 DAY
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
TTL timestamp + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- 分钟级聚合物化视图
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

-- 小时级聚合物化视图
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

-- 天级聚合物化视图
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

-- 异常检测结果表
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
TTL timestamp + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- 系统事件日志表
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
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- 设备状态历史表
CREATE TABLE IF NOT EXISTS portai_timeseries.device_status_history (
    device_id String,
    status Enum8('online' = 1, 'offline' = 2, 'maintenance' = 3, 'error' = 4, 'unknown' = 5) DEFAULT 'unknown',
    previous_status Enum8('online' = 1, 'offline' = 2, 'maintenance' = 3, 'error' = 4, 'unknown' = 5) DEFAULT 'unknown',
    reason String DEFAULT '',
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, timestamp)
TTL timestamp + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- 创建用于快速查询的索引
ALTER TABLE portai_timeseries.sensor_readings ADD INDEX idx_device_sensor (device_id, sensor_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.telemetry_data ADD INDEX idx_device (device_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.anomaly_detections ADD INDEX idx_severity (severity) TYPE set(0) GRANULARITY 4;
