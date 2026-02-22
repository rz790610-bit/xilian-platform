-- ============================================================
-- V4.1 ClickHouse 实时遥测时序表
-- 对应 MySQL realtime_telemetry 表，迁移到 ClickHouse MergeTree
-- 
-- 设计原则：
--   1. 主键 (device_code, mp_code, timestamp) — 与 asset_nodes.code 对齐
--   2. 按月分区 toYYYYMM(timestamp) — 平衡查询性能与分区数量
--   3. ORDER BY (device_code, mp_code, timestamp) — 优化设备+测点+时间范围查询
--   4. 列编码：时间戳用 Delta+ZSTD，字符串用 LZ4，浮点用 Delta+ZSTD
--   5. TTL 2年 — 超过2年的原始数据自动清理（聚合数据保留更久）
-- ============================================================

-- ===== 1. 实时遥测主表 =====
-- 替代 MySQL realtime_telemetry 表，承接所有传感器实时数据
-- 预期写入量：10,000+ 点/秒（批量写入）

CREATE TABLE IF NOT EXISTS portai_timeseries.realtime_telemetry (
    -- === 设备标识 ===
    device_code   String       CODEC(LZ4),           -- 设备编码（FK → asset_nodes.code）
    mp_code       String       CODEC(LZ4),           -- 测点编码（FK → asset_measurement_points.mp_code）
    gateway_id    String       CODEC(LZ4),           -- 边缘网关ID（FK → edge_gateways.gateway_id）

    -- === 时间戳 ===
    timestamp     DateTime64(3) CODEC(Delta, ZSTD(5)), -- 采集时间（毫秒精度）
    received_at   DateTime64(3) CODEC(Delta, ZSTD(5)) DEFAULT now64(3), -- 入库时间

    -- === 测量值 ===
    value         Float64      CODEC(Delta, ZSTD(5)), -- 工程值（已标定）
    raw_value     Float64      CODEC(Delta, ZSTD(5)) DEFAULT 0, -- 原始 ADC 值（可选）
    unit          String       CODEC(LZ4)            DEFAULT '', -- 单位

    -- === 质量标识 ===
    quality       UInt16       CODEC(Delta, ZSTD(3)) DEFAULT 192, -- OPC UA 质量码（192=Good）
    is_anomaly    UInt8        DEFAULT 0,             -- 异常标记（0=正常, 1=异常）

    -- === 特征值（JSON，可选） ===
    features      String       CODEC(ZSTD(5))        DEFAULT '{}', -- 振动特征 {rms, peak, kurtosis, ...}

    -- === 数据溯源 ===
    batch_id      String       CODEC(LZ4)            DEFAULT '', -- 批次ID（用于数据血缘追踪）
    source        String       CODEC(LZ4)            DEFAULT 'gateway' -- 数据来源: gateway|simulator|import
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, mp_code, timestamp)
-- 注意：不使用 SAMPLE BY，因为 intHash32(device_code) 不在 ORDER BY 中
-- 如需采样查询，使用 WHERE cityHash64(device_code) % N = 0 代替
TTL timestamp + INTERVAL 2 YEAR
SETTINGS
    index_granularity = 8192,
    min_bytes_for_wide_part = 10485760,     -- 10MB 以上使用 Wide 格式
    merge_with_ttl_timeout = 86400;         -- TTL 合并间隔 24h


-- ===== 2. Kafka Engine 消费表 =====
-- 订阅 telemetry.raw 主题，自动消费写入
-- 这是 telemetry.raw → ClickHouse 的唯一写入路径
-- TelemetryClickHouseSink 服务订阅 telemetry.feature（特征数据），不订阅 telemetry.raw
-- 注意：Kafka Engine 表仅在 Kafka 可用时生效

CREATE TABLE IF NOT EXISTS portai_timeseries.realtime_telemetry_kafka_queue (
    device_code   String,
    mp_code       String,
    gateway_id    String,
    timestamp     DateTime64(3),
    value         Float64,
    raw_value     Float64     DEFAULT 0,
    unit          String      DEFAULT '',
    quality       UInt16      DEFAULT 192,
    is_anomaly    UInt8       DEFAULT 0,
    features      String      DEFAULT '{}',
    batch_id      String      DEFAULT '',
    source        String      DEFAULT 'gateway'
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:29092',
    kafka_topic_list = 'telemetry.raw',
    kafka_group_name = 'clickhouse_telemetry_sink',
    kafka_format = 'JSONEachRow',
    kafka_max_block_size = 10000,
    kafka_num_consumers = 4,
    kafka_skip_broken_messages = 100;


-- ===== 3. 物化视图：Kafka → MergeTree 自动写入 =====

CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.realtime_telemetry_mv
TO portai_timeseries.realtime_telemetry AS
SELECT
    device_code,
    mp_code,
    gateway_id,
    timestamp,
    now64(3) AS received_at,
    value,
    raw_value,
    unit,
    quality,
    is_anomaly,
    features,
    batch_id,
    source
FROM portai_timeseries.realtime_telemetry_kafka_queue;


-- ===== 4. 分钟级聚合物化视图 =====
-- 自动聚合为1分钟粒度，用于趋势图和仪表盘

CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1min_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (device_code, mp_code, minute)
AS SELECT
    toStartOfMinute(timestamp) AS minute,
    device_code,
    mp_code,
    avgState(value)    AS avg_value,
    minState(value)    AS min_value,
    maxState(value)    AS max_value,
    stddevPopState(value) AS std_value,
    countState()       AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY minute, device_code, mp_code;


-- ===== 5. 小时级聚合物化视图 =====

CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1hour_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (device_code, mp_code, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    device_code,
    mp_code,
    avgState(value)    AS avg_value,
    minState(value)    AS min_value,
    maxState(value)    AS max_value,
    stddevPopState(value) AS std_value,
    countState()       AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY hour, device_code, mp_code;


-- ===== 6. 天级聚合物化视图 =====

CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_1day_agg
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, mp_code, day)
AS SELECT
    toDate(timestamp)  AS day,
    device_code,
    mp_code,
    avgState(value)    AS avg_value,
    minState(value)    AS min_value,
    maxState(value)    AS max_value,
    stddevPopState(value) AS std_value,
    countState()       AS sample_count
FROM portai_timeseries.realtime_telemetry
GROUP BY day, device_code, mp_code;


-- ===== 7. 设备日统计物化视图 =====
-- 每设备每天的汇总统计，用于设备健康仪表盘

CREATE MATERIALIZED VIEW IF NOT EXISTS portai_timeseries.telemetry_device_daily
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (device_code, day)
AS SELECT
    toDate(timestamp) AS day,
    device_code,
    countState()                AS total_samples,
    uniqState(mp_code)          AS active_mps,
    avgState(value)             AS avg_value,
    maxState(value)             AS max_value,
    sumState(is_anomaly)        AS anomaly_count,
    avgState(quality)           AS avg_quality
FROM portai_timeseries.realtime_telemetry
GROUP BY day, device_code;


-- ===== 8. 异常检测结果表（V4 统一版） =====
-- 替代旧版 anomaly_detections，使用 device_code 体系

CREATE TABLE IF NOT EXISTS portai_timeseries.anomaly_detections_v4 (
    detection_id    String       CODEC(LZ4),
    device_code     String       CODEC(LZ4),
    mp_code         String       CODEC(LZ4),
    gateway_id      String       CODEC(LZ4)           DEFAULT '',
    algorithm_type  Enum8(
        'zscore' = 1, 'iqr' = 2, 'mad' = 3,
        'isolation_forest' = 4, 'autoencoder' = 5,
        'custom' = 6
    ) DEFAULT 'zscore',
    current_value   Float64      CODEC(Delta, ZSTD(5)),
    expected_value  Float64      CODEC(Delta, ZSTD(5)),
    deviation       Float64      CODEC(Delta, ZSTD(5)),
    score           Float64      CODEC(Delta, ZSTD(5)),
    severity        Enum8('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4) DEFAULT 'low',
    status          Enum8('open' = 1, 'acknowledged' = 2, 'resolved' = 3, 'false_positive' = 4) DEFAULT 'open',
    context         String       CODEC(ZSTD(3))       DEFAULT '{}', -- 上下文 JSON
    timestamp       DateTime64(3) CODEC(Delta, ZSTD(5)),
    created_at      DateTime64(3) CODEC(Delta, ZSTD(5)) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_code, mp_code, timestamp)
TTL timestamp + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;


-- ===== 9. 索引优化 =====

-- 实时遥测表索引
ALTER TABLE portai_timeseries.realtime_telemetry
    ADD INDEX IF NOT EXISTS idx_gateway (gateway_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE portai_timeseries.realtime_telemetry
    ADD INDEX IF NOT EXISTS idx_quality (quality) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.realtime_telemetry
    ADD INDEX IF NOT EXISTS idx_anomaly (is_anomaly) TYPE set(0) GRANULARITY 2;
ALTER TABLE portai_timeseries.realtime_telemetry
    ADD INDEX IF NOT EXISTS idx_batch (batch_id) TYPE bloom_filter GRANULARITY 4;

-- 异常检测表索引
ALTER TABLE portai_timeseries.anomaly_detections_v4
    ADD INDEX IF NOT EXISTS idx_severity (severity) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.anomaly_detections_v4
    ADD INDEX IF NOT EXISTS idx_status (status) TYPE set(0) GRANULARITY 4;
ALTER TABLE portai_timeseries.anomaly_detections_v4
    ADD INDEX IF NOT EXISTS idx_algorithm (algorithm_type) TYPE set(0) GRANULARITY 4;


-- ===== 10. V1 旧表兼容视图 =====
-- 为旧代码提供 device_id 兼容视图（只读），逐步迁移后删除

CREATE VIEW IF NOT EXISTS portai_timeseries.sensor_readings_compat AS
SELECT
    device_code AS device_id,
    mp_code     AS sensor_id,
    ''          AS metric_name,
    value,
    unit,
    CASE quality
        WHEN 192 THEN 'good'
        WHEN 64  THEN 'uncertain'
        ELSE 'bad'
    END         AS quality,
    timestamp,
    received_at,
    features    AS metadata
FROM portai_timeseries.realtime_telemetry;

CREATE VIEW IF NOT EXISTS portai_timeseries.telemetry_data_compat AS
SELECT
    device_code AS device_id,
    mp_code     AS sensor_id,
    ''          AS metric_name,
    value,
    unit,
    CASE quality
        WHEN 192 THEN 'good'
        WHEN 64  THEN 'uncertain'
        ELSE 'bad'
    END         AS quality,
    timestamp,
    batch_id,
    source
FROM portai_timeseries.realtime_telemetry;
