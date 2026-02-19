# 数据动脉审计发现

## 现有 ClickHouse 表结构

### 01_create_tables.sql（V1 旧表）
- `sensor_readings` — 用 `device_id` 列（旧 ID 体系）
- `telemetry_data` — 用 `device_id` 列（旧 ID 体系）
- 物化视图 `sensor_readings_1m/1h/1d` — 都用 `device_id`
- `anomaly_detections` — 用 `device_id`
- `event_logs` — 用 `device_id`
- `device_status_history` — 用 `device_id`

### 02_v4_tables.sql（V4 新表）
- `vibration_features` — 用 `device_code` + `mp_code`（正确！）
- `device_status_log` — 用 `device_code`（正确！）
- `alert_event_log` — 用 `device_code`（正确！）
- `data_quality_metrics` — 用 `device_code`（正确！）
- Kafka Engine: `vibration_features_kafka_queue` → 订阅 `telemetry.feature.*`
- 物化视图: `vibration_features_mv` → 自动写入 `vibration_features`

### 问题
1. V1 旧表全用 `device_id`，V4 新表全用 `device_code` — **又是新旧并存**
2. 缺少 `realtime_telemetry` 的 ClickHouse 对应表
3. MySQL `realtime_telemetry` 有 `synced_to_ch` 字段，说明设计了同步机制但未实现

## Kafka 主题结构
- `telemetry.raw` — 原始波形（按网关分区）
- `telemetry.feature` — 特征值（按网关分区）
- `xilian.sensor-data` — 流处理入口
- `event.alert` — 告警
- 已有 Kafka Engine 表订阅 `telemetry.feature.*`

## 边缘网关
- K8s deployment 已定义，暴露 MQTT:1883 + OPC-UA:4840 + Modbus:502
- `mqtt.adapter.ts` 完整实现了 MQTT 5.0 协议适配
- `edge_gateways` + `edge_gateway_config` 表已定义
- 缺少：网关→Kafka 的桥接逻辑

## realtimeTelemetry 表结构
```
id, gateway_id, device_code, mp_code, timestamp(3),
value, unit, quality, features(json),
is_anomaly, synced_to_ch, created_at
```
