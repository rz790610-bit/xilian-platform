-- ============================================================
-- 数据迁移脚本: 旧表 → 新表
-- 执行条件: 仅当旧表存在且包含数据时才执行迁移
-- 执行方式: 一次性迁移，执行后可安全删除旧表
-- ============================================================

-- 1. devices → asset_nodes
-- 将旧 devices 表的数据迁移到 asset_nodes
INSERT IGNORE INTO asset_nodes (
  node_id, code, name, level, node_type, root_node_id, status,
  path, serial_number, location, department, last_heartbeat,
  attributes, sort_order, is_active, version, created_at, updated_at
)
SELECT 
  d.deviceId,                                    -- node_id
  d.deviceId,                                    -- code
  d.name,                                        -- name
  1,                                             -- level (默认顶级)
  d.type,                                        -- node_type
  d.deviceId,                                    -- root_node_id (自身为根)
  COALESCE(d.status, 'unknown'),                 -- status
  CONCAT('/', d.deviceId),                       -- path
  d.serialNumber,                                -- serial_number
  d.location,                                    -- location
  d.department,                                  -- department
  d.lastHeartbeat,                               -- last_heartbeat
  CASE 
    WHEN d.model IS NOT NULL OR d.manufacturer IS NOT NULL 
    THEN JSON_OBJECT('model', d.model, 'manufacturer', d.manufacturer)
    ELSE NULL 
  END,                                           -- attributes
  0,                                             -- sort_order
  1,                                             -- is_active
  1,                                             -- version
  COALESCE(d.createdAt, NOW(3)),                 -- created_at
  COALESCE(d.updatedAt, NOW(3))                  -- updated_at
FROM devices d
WHERE NOT EXISTS (
  SELECT 1 FROM asset_nodes an WHERE an.node_id = d.deviceId
);

-- 2. sensors → asset_sensors
-- 将旧 sensors 表的数据迁移到 asset_sensors
INSERT IGNORE INTO asset_sensors (
  device_code, sensor_id, mp_id, name, physical_quantity, unit,
  warning_threshold, critical_threshold, sample_rate,
  status, last_value, last_reading_at, metadata,
  is_active, version, created_at, updated_at
)
SELECT 
  s.deviceId,                                    -- device_code
  s.sensorId,                                    -- sensor_id
  s.sensorId,                                    -- mp_id (默认与 sensor_id 一致)
  s.name,                                        -- name
  s.type,                                        -- physical_quantity
  s.unit,                                        -- unit
  s.warningThreshold,                            -- warning_threshold
  s.criticalThreshold,                           -- critical_threshold
  COALESCE(s.samplingRate, 1000),                -- sample_rate
  COALESCE(s.status, 'active'),                  -- status
  s.lastValue,                                   -- last_value
  s.lastReadingAt,                               -- last_reading_at
  CASE 
    WHEN s.minValue IS NOT NULL OR s.maxValue IS NOT NULL 
    THEN JSON_OBJECT('minValue', s.minValue, 'maxValue', s.maxValue)
    ELSE NULL 
  END,                                           -- metadata
  1,                                             -- is_active
  1,                                             -- version
  COALESCE(s.createdAt, NOW(3)),                 -- created_at
  COALESCE(s.updatedAt, NOW(3))                  -- updated_at
FROM sensors s
WHERE NOT EXISTS (
  SELECT 1 FROM asset_sensors asn WHERE asn.sensor_id = s.sensorId
);

-- 3. sensor_readings → event_store
-- 将旧 sensor_readings 表的数据迁移到 event_store
-- 注意: 大量数据时可能需要分批执行
INSERT IGNORE INTO event_store (
  event_id, event_type, event_version, aggregate_type, aggregate_id,
  aggregate_version, payload, occurred_at, recorded_at
)
SELECT 
  CONCAT('evt_sr_', sr.id),                     -- event_id (唯一)
  'sensor_reading',                              -- event_type
  1,                                             -- event_version
  'sensor',                                      -- aggregate_type
  sr.sensorId,                                   -- aggregate_id
  sr.id,                                         -- aggregate_version (用原始 ID 保证唯一)
  JSON_OBJECT(
    'value', sr.`value`,
    'numericValue', sr.numericValue,
    'quality', sr.quality,
    'deviceId', sr.deviceId
  ),                                             -- payload
  sr.timestamp,                                  -- occurred_at
  NOW(3)                                         -- recorded_at
FROM sensor_readings sr;

-- 4. data_aggregations → event_store
-- 将旧 data_aggregations 表的数据迁移到 event_store
INSERT IGNORE INTO event_store (
  event_id, event_type, event_version, aggregate_type, aggregate_id,
  aggregate_version, payload, occurred_at, recorded_at
)
SELECT 
  CONCAT('evt_da_', da.id),                     -- event_id (唯一)
  'aggregation_result',                          -- event_type
  1,                                             -- event_version
  'sensor',                                      -- aggregate_type
  da.sensorId,                                   -- aggregate_id
  da.id + 10000000,                              -- aggregate_version (偏移避免冲突)
  JSON_OBJECT(
    'deviceId', da.deviceId,
    'sensorId', da.sensorId,
    'metricName', da.metricName,
    'windowStart', DATE_FORMAT(da.windowStart, '%Y-%m-%dT%H:%i:%s.%fZ'),
    'windowEnd', DATE_FORMAT(da.windowEnd, '%Y-%m-%dT%H:%i:%s.%fZ'),
    'count', da.count,
    'sum', da.sum,
    'min', da.min,
    'max', da.max,
    'avg', da.avg,
    'stdDev', da.stdDev
  ),                                             -- payload
  da.windowStart,                                -- occurred_at
  COALESCE(da.createdAt, NOW(3))                 -- recorded_at
FROM data_aggregations da;

-- ============================================================
-- 迁移完成后，可选择性删除旧表（建议先验证数据完整性）
-- DROP TABLE IF EXISTS devices;
-- DROP TABLE IF EXISTS sensors;
-- DROP TABLE IF EXISTS sensor_readings;
-- DROP TABLE IF EXISTS sensor_aggregates;
-- DROP TABLE IF EXISTS telemetry_data;
-- DROP TABLE IF EXISTS data_aggregations;
-- ============================================================
