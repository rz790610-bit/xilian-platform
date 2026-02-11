-- ============================================================
-- XiLian Platform 数据库升级脚本 V2
-- 日期: 2026-02-10
-- 兼容: MySQL 8.0+
-- 说明: 增强10张现有表 + 新建6张表
-- 执行: mysql -u xilian -pxilian123 xilian < docker/mysql/init/03-schema-upgrade-v2.sql
-- 幂等: 使用存储过程检查列是否存在，CREATE TABLE使用IF NOT EXISTS
-- ============================================================

DELIMITER //

-- 辅助存储过程：安全添加列（如果不存在则添加）
DROP PROCEDURE IF EXISTS safe_add_column //
CREATE PROCEDURE safe_add_column(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table
      AND column_name = p_column
  );
  IF @col_exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

-- 辅助存储过程：安全添加索引（如果不存在则添加）
DROP PROCEDURE IF EXISTS safe_add_index //
CREATE PROCEDURE safe_add_index(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns TEXT
)
BEGIN
  SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table
      AND index_name = p_index
  );
  IF @idx_exists = 0 THEN
    SET @sql = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '` (', p_columns, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

DELIMITER ;

-- ============================================================
-- 第一部分: ALTER TABLE 增强现有表
-- ============================================================

-- 1. base_dict_categories — 增加树形支持
CALL safe_add_column('base_dict_categories', 'parent_code', "VARCHAR(64) DEFAULT NULL COMMENT '父分类编码'");
CALL safe_add_column('base_dict_categories', 'level', "INT DEFAULT 1 COMMENT '层级深度(1-4)'");
CALL safe_add_column('base_dict_categories', 'path', "VARCHAR(500) DEFAULT NULL COMMENT '完整路径(点号分隔)'");
CALL safe_add_column('base_dict_categories', 'sort_order', "INT DEFAULT 0 COMMENT '排序序号'");
CALL safe_add_column('base_dict_categories', 'is_system', "BOOLEAN DEFAULT TRUE COMMENT '是否系统内置'");
CALL safe_add_column('base_dict_categories', 'metadata', "JSON DEFAULT NULL COMMENT '扩展属性'");

-- 2. base_dict_items — 增加树形支持
CALL safe_add_column('base_dict_items', 'parent_code', "VARCHAR(64) DEFAULT NULL COMMENT '父项编码'");
CALL safe_add_column('base_dict_items', 'level', "INT DEFAULT 1 COMMENT '层级深度'");
CALL safe_add_column('base_dict_items', 'path', "VARCHAR(500) DEFAULT NULL COMMENT '完整路径(点号分隔)'");
CALL safe_add_column('base_dict_items', 'attributes', "JSON DEFAULT NULL COMMENT '该项的属性定义'");

-- 3. asset_nodes — 增加分类路径、位置、维护策略
CALL safe_add_column('asset_nodes', 'category_path', "VARCHAR(500) DEFAULT NULL COMMENT '设备分类路径(如rotating.pump.centrifugal)'");
CALL safe_add_column('asset_nodes', 'location', "JSON DEFAULT NULL COMMENT '安装位置信息(building/floor/area/gps)'");
CALL safe_add_column('asset_nodes', 'maintenance_strategy', "VARCHAR(20) DEFAULT 'CBM' COMMENT '维护策略(CBM/TBM/RTF/PdM/RCM)'");
CALL safe_add_column('asset_nodes', 'commissioned_date', "DATE DEFAULT NULL COMMENT '投运日期'");
CALL safe_add_column('asset_nodes', 'warranty_expiry', "DATE DEFAULT NULL COMMENT '质保到期'");
CALL safe_add_column('asset_nodes', 'lifecycle_status', "VARCHAR(20) DEFAULT 'active' COMMENT '生命周期状态(active/standby/decommissioned)'");

-- 4. asset_sensors — 增加协议、采样、校准字段
CALL safe_add_column('asset_sensors', 'mount_direction', "VARCHAR(20) DEFAULT NULL COMMENT '安装方向(horizontal/vertical/axial)'");
CALL safe_add_column('asset_sensors', 'protocol', "VARCHAR(32) DEFAULT NULL COMMENT '通信协议(Modbus-RTU/OPC-UA/MQTT)'");
CALL safe_add_column('asset_sensors', 'sampling_rate', "INT DEFAULT NULL COMMENT '采样频率(Hz)'");
CALL safe_add_column('asset_sensors', 'data_format', "VARCHAR(32) DEFAULT NULL COMMENT '数据格式(float32/int16/waveform)'");
CALL safe_add_column('asset_sensors', 'threshold_config', "JSON DEFAULT NULL COMMENT '阈值配置(warning/alarm)'");
CALL safe_add_column('asset_sensors', 'calibration_date', "DATE DEFAULT NULL COMMENT '上次校准日期'");
CALL safe_add_column('asset_sensors', 'next_calibration_date', "DATE DEFAULT NULL COMMENT '下次校准日期'");

-- 5. device_sampling_config — 增加网关、预处理、FSD触发字段
CALL safe_add_column('device_sampling_config', 'gateway_id', "VARCHAR(64) DEFAULT NULL COMMENT '关联边缘网关 → edge_gateways'");
CALL safe_add_column('device_sampling_config', 'endpoint', "JSON DEFAULT NULL COMMENT '连接参数(port/baudrate/slave_id)'");
CALL safe_add_column('device_sampling_config', 'register_map', "JSON DEFAULT NULL COMMENT '寄存器映射'");
CALL safe_add_column('device_sampling_config', 'preprocessing_rules', "JSON DEFAULT NULL COMMENT '边缘预处理规则(compute_rms/peak/kurtosis)'");
CALL safe_add_column('device_sampling_config', 'trigger_rules', "JSON DEFAULT NULL COMMENT 'FSD触发规则(rms_threshold/buffer_before_s/buffer_after_s)'");
CALL safe_add_column('device_sampling_config', 'compression', "VARCHAR(20) DEFAULT 'zstd-5' COMMENT '压缩算法(zstd-5/snappy/none)'");
CALL safe_add_column('device_sampling_config', 'storage_strategy', "VARCHAR(20) DEFAULT 'L0+L1' COMMENT '存储策略(L0+L1/L1_only/L0_only)'");

-- 6. data_slices — 增加FSD触发字段
CALL safe_add_column('data_slices', 'trigger_type', "VARCHAR(32) DEFAULT NULL COMMENT '触发类型(rms_high/peak_high/load_over/manual)'");
CALL safe_add_column('data_slices', 'trigger_confidence', "FLOAT DEFAULT NULL COMMENT '触发置信度(0.0-1.0)'");
CALL safe_add_column('data_slices', 'storage_path', "VARCHAR(500) DEFAULT NULL COMMENT 'MinIO存储路径(L0层)'");
CALL safe_add_column('data_slices', 'upload_status', "VARCHAR(20) DEFAULT 'pending' COMMENT '上传状态(pending/uploading/uploaded/failed)'");
CALL safe_add_column('data_slices', 'source_type', "VARCHAR(20) DEFAULT 'auto_trigger' COMMENT '来源类型(auto_trigger/manual/scheduled)'");
CALL safe_add_column('data_slices', 'data_points', "BIGINT DEFAULT NULL COMMENT '数据点数量'");

-- 7. data_slice_label_history — 增加FSD标注字段
CALL safe_add_column('data_slice_label_history', 'fault_class', "VARCHAR(50) DEFAULT NULL COMMENT '故障分类(bearing_inner_race/imbalance等)'");
CALL safe_add_column('data_slice_label_history', 'confidence', "FLOAT DEFAULT NULL COMMENT '标注置信度(0.0-1.0)'");
CALL safe_add_column('data_slice_label_history', 'label_source', "VARCHAR(20) DEFAULT 'HUMAN' COMMENT '标注来源(AUTO/HUMAN/SEMI_AUTO)'");
CALL safe_add_column('data_slice_label_history', 'review_status', "VARCHAR(20) DEFAULT 'PENDING' COMMENT '审核状态(PENDING/APPROVED/REJECTED/REVISED)'");
CALL safe_add_column('data_slice_label_history', 'reviewer_id', "VARCHAR(64) DEFAULT NULL COMMENT '审核人'");
CALL safe_add_column('data_slice_label_history', 'label_data', "JSON DEFAULT NULL COMMENT '详细标注数据(bbox/features等)'");

-- 8. models — 增加数据集和FSD闭环字段
CALL safe_add_column('models', 'dataset_version', "VARCHAR(64) DEFAULT NULL COMMENT '训练数据集版本'");
CALL safe_add_column('models', 'dataset_clip_count', "INT DEFAULT 0 COMMENT '训练样本数量'");
CALL safe_add_column('models', 'dataset_total_duration_s', "INT DEFAULT 0 COMMENT '训练数据总时长(秒)'");
CALL safe_add_column('models', 'deployment_target', "VARCHAR(50) DEFAULT NULL COMMENT '部署目标(cloud/edge/both)'");
CALL safe_add_column('models', 'input_format', "JSON DEFAULT NULL COMMENT '模型输入格式'");
CALL safe_add_column('models', 'output_format', "JSON DEFAULT NULL COMMENT '模型输出格式'");

-- 9. model_usage_logs — 增加FSD推理追踪字段
CALL safe_add_column('model_usage_logs', 'device_code', "VARCHAR(64) DEFAULT NULL COMMENT '关联设备编码'");
CALL safe_add_column('model_usage_logs', 'sensor_code', "VARCHAR(64) DEFAULT NULL COMMENT '关联传感器编码'");
CALL safe_add_column('model_usage_logs', 'inference_result', "JSON DEFAULT NULL COMMENT '推理结果详情'");
CALL safe_add_column('model_usage_logs', 'triggered_alert', "BOOLEAN DEFAULT FALSE COMMENT '是否触发了告警'");
CALL safe_add_column('model_usage_logs', 'feedback_status', "VARCHAR(20) DEFAULT NULL COMMENT '反馈状态(correct/incorrect/uncertain)'");

-- 10. device_alerts — 增加传感器关联和数值字段
CALL safe_add_column('device_alerts', 'sensor_id', "VARCHAR(64) DEFAULT NULL COMMENT '关联传感器 → asset_sensors'");
CALL safe_add_column('device_alerts', 'alert_value', "FLOAT DEFAULT NULL COMMENT '告警触发值'");
CALL safe_add_column('device_alerts', 'threshold_value', "FLOAT DEFAULT NULL COMMENT '阈值'");
CALL safe_add_column('device_alerts', 'acknowledged_by', "VARCHAR(64) DEFAULT NULL COMMENT '确认人'");
CALL safe_add_column('device_alerts', 'acknowledged_at', "TIMESTAMP NULL DEFAULT NULL COMMENT '确认时间'");
CALL safe_add_column('device_alerts', 'resolved_at', "TIMESTAMP NULL DEFAULT NULL COMMENT '解决时间'");


-- ============================================================
-- 第二部分: CREATE TABLE 新建表
-- ============================================================

-- 1. edge_gateways — 边缘网关
CREATE TABLE IF NOT EXISTS edge_gateways (
  gateway_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '网关ID',
  gateway_code VARCHAR(64) NOT NULL UNIQUE COMMENT '网关编码(如EDGE-GW-001)',
  name VARCHAR(100) NOT NULL COMMENT '网关名称',
  location VARCHAR(200) DEFAULT NULL COMMENT '安装位置',
  hardware_model VARCHAR(100) DEFAULT NULL COMMENT '硬件型号(Intel NUC/Raspberry Pi)',
  os_version VARCHAR(50) DEFAULT NULL COMMENT '操作系统版本',
  firmware_version VARCHAR(50) DEFAULT NULL COMMENT '固件版本',
  protocols JSON DEFAULT NULL COMMENT '支持的协议列表["Modbus-RTU","OPC-UA","MQTT"]',
  preprocessing_config JSON DEFAULT NULL COMMENT '边缘预处理配置(compute_rms/peak/kurtosis)',
  upload_strategy JSON DEFAULT NULL COMMENT '上传策略(mqtt broker/batch_size/interval)',
  buffer_config JSON DEFAULT NULL COMMENT 'FSD环形缓冲配置(ring_buffer_size_s/memory_limit_mb)',
  connected_sensors INT DEFAULT 0 COMMENT '已连接传感器数量',
  cpu_usage FLOAT DEFAULT NULL COMMENT 'CPU使用率(%)',
  memory_usage FLOAT DEFAULT NULL COMMENT '内存使用率(%)',
  disk_usage FLOAT DEFAULT NULL COMMENT '磁盘使用率(%)',
  last_heartbeat TIMESTAMP NULL DEFAULT NULL COMMENT '最后心跳时间',
  status VARCHAR(20) DEFAULT 'offline' COMMENT '状态(online/offline/maintenance)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gateway_status (status),
  INDEX idx_gateway_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='边缘网关';

-- 2. data_collection_tasks — 采集任务
CREATE TABLE IF NOT EXISTS data_collection_tasks (
  task_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '任务ID',
  task_name VARCHAR(100) NOT NULL COMMENT '任务名称',
  gateway_id VARCHAR(64) NOT NULL COMMENT '执行网关 → edge_gateways',
  task_type VARCHAR(20) DEFAULT 'continuous' COMMENT '任务类型(continuous/scheduled/on_demand)',
  sensor_ids JSON NOT NULL COMMENT '关联传感器ID列表',
  schedule_config JSON DEFAULT NULL COMMENT '调度配置(cron/interval)',
  sampling_config JSON DEFAULT NULL COMMENT '采集参数(rate/duration/format)',
  preprocessing_config JSON DEFAULT NULL COMMENT '预处理配置',
  trigger_config JSON DEFAULT NULL COMMENT 'FSD触发配置',
  upload_config JSON DEFAULT NULL COMMENT '上传配置',
  total_collected BIGINT DEFAULT 0 COMMENT '累计采集数据点',
  total_uploaded BIGINT DEFAULT 0 COMMENT '累计上传数据点',
  total_triggered INT DEFAULT 0 COMMENT '累计触发次数',
  error_count INT DEFAULT 0 COMMENT '累计错误次数',
  last_error TEXT DEFAULT NULL COMMENT '最近错误信息',
  last_run_at TIMESTAMP NULL DEFAULT NULL COMMENT '最近执行时间',
  status VARCHAR(20) DEFAULT 'stopped' COMMENT '状态(running/stopped/error/paused)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_gateway (gateway_id),
  INDEX idx_task_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据采集任务';

-- 3. data_assets — 统一文件资产注册表
CREATE TABLE IF NOT EXISTS data_assets (
  asset_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '资产ID',
  asset_type VARCHAR(20) NOT NULL COMMENT '类型(image/video/audio/document/cad/waveform)',
  file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  file_size BIGINT DEFAULT 0 COMMENT '文件大小(bytes)',
  mime_type VARCHAR(100) DEFAULT NULL COMMENT 'MIME类型',
  storage_bucket VARCHAR(64) NOT NULL COMMENT 'MinIO桶名',
  storage_path VARCHAR(500) NOT NULL COMMENT 'MinIO对象路径',
  thumbnail_path VARCHAR(500) DEFAULT NULL COMMENT '缩略图路径',
  checksum VARCHAR(64) DEFAULT NULL COMMENT '文件校验和(SHA-256)',
  related_device VARCHAR(64) DEFAULT NULL COMMENT '关联设备 → asset_nodes.node_id',
  related_entity_type VARCHAR(50) DEFAULT NULL COMMENT '关联实体类型(alert/maintenance/inspection/slice)',
  related_entity_id VARCHAR(64) DEFAULT NULL COMMENT '关联实体ID',
  tags JSON DEFAULT NULL COMMENT '标签["巡检","A车间","2026Q1"]',
  metadata JSON DEFAULT NULL COMMENT '扩展元数据(EXIF/时长/图层/分辨率)',
  description TEXT DEFAULT NULL COMMENT '文件描述',
  created_by VARCHAR(64) DEFAULT NULL COMMENT '上传者',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asset_type (asset_type),
  INDEX idx_asset_device (related_device),
  INDEX idx_asset_entity (related_entity_type, related_entity_id),
  INDEX idx_asset_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一文件资产注册表';

-- 4. realtime_telemetry — FSD实时遥测元数据
CREATE TABLE IF NOT EXISTS realtime_telemetry (
  telemetry_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '遥测ID',
  device_code VARCHAR(64) NOT NULL COMMENT '设备编码',
  sensor_code VARCHAR(64) NOT NULL COMMENT '传感器编码',
  gateway_id VARCHAR(64) DEFAULT NULL COMMENT '网关ID → edge_gateways',
  metric_type VARCHAR(32) NOT NULL COMMENT '指标类型(rms/peak/kurtosis/temperature/pressure)',
  current_value FLOAT DEFAULT NULL COMMENT '当前值',
  unit VARCHAR(20) DEFAULT NULL COMMENT '单位(mm/s/°C/bar)',
  quality_score FLOAT DEFAULT NULL COMMENT '数据质量评分(0-1)',
  anomaly_score FLOAT DEFAULT NULL COMMENT '异常评分(0-1)',
  status VARCHAR(20) DEFAULT 'normal' COMMENT '状态(normal/warning/alarm/offline)',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  INDEX idx_telemetry_device (device_code),
  INDEX idx_telemetry_sensor (sensor_code),
  INDEX idx_telemetry_status (status),
  UNIQUE INDEX idx_telemetry_unique (device_code, sensor_code, metric_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FSD实时遥测元数据';

-- 5. data_lifecycle_policies — 数据生命周期策略
CREATE TABLE IF NOT EXISTS data_lifecycle_policies (
  policy_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '策略ID',
  policy_name VARCHAR(100) NOT NULL COMMENT '策略名称',
  target_type VARCHAR(30) NOT NULL COMMENT '目标类型(minio_bucket/clickhouse_table/mysql_table)',
  target_name VARCHAR(100) NOT NULL COMMENT '目标名称(桶名/表名)',
  storage_tier VARCHAR(20) DEFAULT NULL COMMENT '存储层级(L0/L1/L2/L3/L4/L5)',
  retention_days INT DEFAULT NULL COMMENT '保留天数(NULL=永久)',
  archive_after_days INT DEFAULT NULL COMMENT '归档天数(移到冷存储)',
  compression VARCHAR(20) DEFAULT NULL COMMENT '压缩策略(zstd/snappy/none)',
  max_size_gb FLOAT DEFAULT NULL COMMENT '最大存储大小(GB)',
  cleanup_strategy VARCHAR(30) DEFAULT 'delete_oldest' COMMENT '清理策略(delete_oldest/archive/compress)',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  last_executed_at TIMESTAMP NULL DEFAULT NULL COMMENT '最近执行时间',
  next_execution_at TIMESTAMP NULL DEFAULT NULL COMMENT '下次执行时间',
  execution_log JSON DEFAULT NULL COMMENT '最近执行日志',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_policy_target (target_type, target_name),
  INDEX idx_policy_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据生命周期策略';

-- 6. data_collection_metrics — 采集指标统计（按天聚合）
CREATE TABLE IF NOT EXISTS data_collection_metrics (
  metric_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '指标ID',
  metric_date DATE NOT NULL COMMENT '统计日期',
  gateway_id VARCHAR(64) NOT NULL COMMENT '网关ID',
  device_code VARCHAR(64) DEFAULT NULL COMMENT '设备编码',
  total_points BIGINT DEFAULT 0 COMMENT '采集数据点总数',
  uploaded_points BIGINT DEFAULT 0 COMMENT '上传数据点总数',
  triggered_count INT DEFAULT 0 COMMENT '触发次数',
  slice_count INT DEFAULT 0 COMMENT '生成切片数',
  data_volume_mb FLOAT DEFAULT 0 COMMENT '数据量(MB)',
  avg_latency_ms FLOAT DEFAULT NULL COMMENT '平均上传延迟(ms)',
  error_count INT DEFAULT 0 COMMENT '错误次数',
  uptime_pct FLOAT DEFAULT 100 COMMENT '在线率(%)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_metric_unique (metric_date, gateway_id, device_code),
  INDEX idx_metric_date (metric_date),
  INDEX idx_metric_gateway (gateway_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采集指标统计(按天聚合)';


-- ============================================================
-- 第三部分: 索引优化
-- ============================================================

CALL safe_add_index('asset_nodes', 'idx_asset_category_path', 'category_path(100)');
CALL safe_add_index('asset_sensors', 'idx_sensor_protocol', 'protocol');
CALL safe_add_index('asset_sensors', 'idx_sensor_calibration', 'next_calibration_date');
CALL safe_add_index('data_slices', 'idx_slice_trigger', 'trigger_type');
CALL safe_add_index('data_slices', 'idx_slice_upload', 'upload_status');
CALL safe_add_index('data_slice_label_history', 'idx_label_review', 'review_status');
CALL safe_add_index('data_slice_label_history', 'idx_label_fault', 'fault_class');
CALL safe_add_index('device_alerts', 'idx_alert_sensor', 'sensor_id');
CALL safe_add_index('model_usage_logs', 'idx_usage_device', 'device_code');


-- ============================================================
-- 清理辅助存储过程
-- ============================================================
DROP PROCEDURE IF EXISTS safe_add_column;
DROP PROCEDURE IF EXISTS safe_add_index;


-- ============================================================
-- 验证
-- ============================================================
SELECT '升级脚本执行完成' AS status, 
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'xilian') AS total_tables;
