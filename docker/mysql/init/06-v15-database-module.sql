-- ============================================================
-- 西联平台 v1.5 数据架构规范 - 数据库一级模块建表脚本
-- 共 20 张表（idempotent_records 已存在，不重复创建）
-- ============================================================

USE portai_nexus;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===========================================================
-- 模块一：编码管理
-- ===========================================================

-- 表 1: base_code_rules — 编码生成规则
CREATE TABLE IF NOT EXISTS base_code_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(64) NOT NULL COMMENT '规则编码',
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  segments JSON NOT NULL COMMENT '编码段定义',
  current_sequences JSON NOT NULL DEFAULT ('{}') COMMENT '当前流水号',
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_rule_code (rule_code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='编码生成规则';

-- ===========================================================
-- 模块二：基础库（模板）
-- ===========================================================

-- 表 2: base_node_templates — 节点类型模板
CREATE TABLE IF NOT EXISTS base_node_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL COMMENT '模板编码',
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  level TINYINT UNSIGNED NOT NULL COMMENT '层级 1-5',
  node_type VARCHAR(20) NOT NULL COMMENT '节点类型: device/mechanism/component/assembly/part',
  derived_from VARCHAR(64) NULL COMMENT '派生自',
  code_rule VARCHAR(64) NULL COMMENT '编码规则',
  code_prefix VARCHAR(30) NULL COMMENT '编码前缀',
  icon VARCHAR(50) NULL COMMENT '图标',
  is_system TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否系统内置',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  children JSON NULL COMMENT '子节点定义',
  attributes JSON NULL COMMENT '属性定义',
  measurement_points JSON NULL COMMENT '测点定义',
  description TEXT,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_code (code),
  INDEX idx_level (level),
  INDEX idx_node_type (node_type),
  INDEX idx_derived (derived_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='节点类型模板';

-- 表 3: base_mp_templates — 测点类型模板
CREATE TABLE IF NOT EXISTS base_mp_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL COMMENT '模板编码',
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  measurement_type VARCHAR(30) NOT NULL COMMENT '测量类型',
  physical_quantity VARCHAR(50) NULL COMMENT '物理量',
  default_unit VARCHAR(20) NULL COMMENT '默认单位',
  default_sample_rate INT UNSIGNED NULL COMMENT '默认采样率 Hz',
  default_warning DOUBLE NULL COMMENT '默认预警阈值',
  default_critical DOUBLE NULL COMMENT '默认报警阈值',
  sensor_config JSON NULL COMMENT '传感器配置模板',
  threshold_config JSON NULL COMMENT '阈值配置模板',
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_code (code),
  INDEX idx_type (measurement_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测点类型模板';

-- ===========================================================
-- 模块三：档案库（实例）
-- ===========================================================

-- 表 4: asset_nodes — 资产节点（设备树）
CREATE TABLE IF NOT EXISTS asset_nodes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL COMMENT '节点 ID (UUID v7)',
  code VARCHAR(100) NOT NULL COMMENT '设备编码 (自动生成)',
  name VARCHAR(200) NOT NULL COMMENT '节点名称',
  level TINYINT UNSIGNED NOT NULL COMMENT '层级 1-5',
  node_type VARCHAR(20) NOT NULL COMMENT '节点类型',
  parent_node_id VARCHAR(64) NULL COMMENT '父节点 ID',
  root_node_id VARCHAR(64) NOT NULL COMMENT '根节点 ID(设备 ID)',
  template_code VARCHAR(64) NULL COMMENT '模板编码',
  status VARCHAR(20) NOT NULL DEFAULT 'unknown' COMMENT '状态',
  path TEXT NOT NULL COMMENT '物化路径: /node_001/node_002/',
  level_codes VARCHAR(200) NULL COMMENT '层级编码: L1.L2.L3 格式备份',
  depth TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '深度(冗余加速)',
  serial_number VARCHAR(100) NULL,
  location VARCHAR(255) NULL,
  department VARCHAR(100) NULL,
  last_heartbeat DATETIME(3) NULL,
  install_date DATE NULL,
  warranty_expiry DATE NULL,
  attributes JSON NULL COMMENT '动态扩展属性',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME(3) NULL,
  deleted_by VARCHAR(64) NULL,
  UNIQUE KEY uk_node_id (node_id),
  UNIQUE KEY uk_code (code),
  INDEX idx_parent (parent_node_id),
  INDEX idx_root (root_node_id),
  INDEX idx_path (path(255)),
  INDEX idx_level (level),
  INDEX idx_status (status),
  INDEX idx_template (template_code),
  FULLTEXT idx_search (name, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产节点';

-- 表 5: asset_measurement_points — 测点实例
CREATE TABLE IF NOT EXISTS asset_measurement_points (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mp_id VARCHAR(64) NOT NULL COMMENT '测点 ID',
  node_id VARCHAR(64) NOT NULL COMMENT '挂载节点',
  device_code VARCHAR(100) NOT NULL COMMENT '设备编码(冗余加速)',
  template_code VARCHAR(64) NULL COMMENT '模板编码',
  name VARCHAR(100) NOT NULL,
  position VARCHAR(100) NULL COMMENT '位置描述',
  measurement_type VARCHAR(30) NOT NULL,
  warning_threshold DOUBLE NULL,
  critical_threshold DOUBLE NULL,
  threshold_config JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_mp_id (mp_id),
  INDEX idx_node (node_id),
  INDEX idx_device (device_code),
  INDEX idx_type (measurement_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测点实例';

-- 表 6: asset_sensors — 传感器实例
CREATE TABLE IF NOT EXISTS asset_sensors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_code VARCHAR(100) NOT NULL COMMENT '设备编码',
  sensor_id VARCHAR(64) NOT NULL COMMENT '传感器硬件编号',
  mp_id VARCHAR(64) NOT NULL COMMENT '测点 ID',
  name VARCHAR(100) NULL,
  channel VARCHAR(10) NULL COMMENT '通道号',
  sample_rate INT UNSIGNED NULL COMMENT '采样率 Hz',
  physical_quantity VARCHAR(50) NULL,
  unit VARCHAR(20) NULL,
  warning_threshold DOUBLE NULL,
  critical_threshold DOUBLE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_value DOUBLE NULL,
  last_reading_at DATETIME(3) NULL,
  manufacturer VARCHAR(100) NULL,
  model VARCHAR(100) NULL,
  serial_number VARCHAR(100) NULL,
  install_date DATE NULL,
  calibration_date DATE NULL,
  file_name_pattern VARCHAR(255) NULL,
  metadata JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_device_sensor (device_code, sensor_id),
  INDEX idx_mp (mp_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器实例';

-- ===========================================================
-- 模块四：标注维度
-- ===========================================================

-- 表 7: base_label_dimensions — 标注维度定义
CREATE TABLE IF NOT EXISTS base_label_dimensions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL COMMENT '维度编码',
  name VARCHAR(100) NOT NULL COMMENT '维度名称',
  dim_type VARCHAR(20) NOT NULL COMMENT '类型: enum/numeric/boolean/text',
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  allow_sources JSON NULL,
  apply_to JSON NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标注维度定义';

-- 表 8: base_label_options — 标注值选项
CREATE TABLE IF NOT EXISTS base_label_options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dimension_code VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL COMMENT '选项编码',
  label VARCHAR(100) NOT NULL COMMENT '显示名称',
  parent_code VARCHAR(64) NULL COMMENT '父选项',
  color VARCHAR(20) NULL,
  icon VARCHAR(50) NULL,
  is_normal TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否正常状态',
  sample_priority TINYINT UNSIGNED NOT NULL DEFAULT 5 COMMENT '样本优先级 1-10',
  sort_order INT NOT NULL DEFAULT 0,
  auto_rule JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_dim_code (dimension_code, code),
  INDEX idx_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标注值选项';

-- ===========================================================
-- 模块五：数据切片
-- ===========================================================

-- 表 9: base_slice_rules — 切片触发规则（带版本）
CREATE TABLE IF NOT EXISTS base_slice_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL COMMENT '规则 ID',
  rule_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '规则版本',
  name VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) NULL,
  mechanism_type VARCHAR(50) NULL,
  trigger_type VARCHAR(30) NOT NULL COMMENT 'condition_change/time_interval/event/threshold',
  trigger_config JSON NOT NULL,
  min_duration_sec INT UNSIGNED NOT NULL DEFAULT 5,
  max_duration_sec INT UNSIGNED NOT NULL DEFAULT 3600,
  merge_gap_sec INT UNSIGNED NOT NULL DEFAULT 10,
  auto_labels JSON NULL,
  priority INT NOT NULL DEFAULT 5,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_current TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否当前生效版本',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_rule_version (rule_id, rule_version),
  INDEX idx_current (is_current, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='切片触发规则';

-- 表 10: data_slices — 数据切片
CREATE TABLE IF NOT EXISTS data_slices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slice_id VARCHAR(64) NOT NULL COMMENT '切片 ID',
  device_code VARCHAR(100) NOT NULL,
  node_id VARCHAR(64) NULL,
  node_path TEXT NULL,
  work_condition_code VARCHAR(64) NULL COMMENT '工况(高频查询)',
  quality_code VARCHAR(64) NULL COMMENT '质量(高频查询)',
  fault_type_code VARCHAR(64) NULL COMMENT '故障类型(高频查询)',
  load_rate DOUBLE NULL COMMENT '负载率(高频查询)',
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NULL,
  duration_ms INT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'recording',
  label_status VARCHAR(20) NOT NULL DEFAULT 'auto_only',
  label_count_auto SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  label_count_manual SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  labels JSON NOT NULL DEFAULT ('{}'),
  sensors JSON NULL,
  data_location JSON NULL,
  summary JSON NULL,
  quality_score DOUBLE NULL COMMENT '质量评分 0-100',
  data_quality JSON NULL,
  is_sample TINYINT(1) NOT NULL DEFAULT 0,
  sample_purpose VARCHAR(20) NULL COMMENT 'train/validate/test',
  sample_dataset_id VARCHAR(64) NULL,
  applied_rule_id VARCHAR(64) NULL,
  applied_rule_version INT UNSIGNED NULL,
  notes TEXT,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  verified_by VARCHAR(64) NULL,
  verified_at DATETIME(3) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_slice_id (slice_id),
  INDEX idx_device_time (device_code, start_time),
  INDEX idx_node (node_id),
  INDEX idx_status (status),
  INDEX idx_work_condition (work_condition_code),
  INDEX idx_quality (quality_code),
  INDEX idx_fault (fault_type_code),
  INDEX idx_sample (is_sample, sample_purpose),
  INDEX idx_label_status (label_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据切片';

-- 表 11: data_slice_label_history — 标注修改历史
CREATE TABLE IF NOT EXISTS data_slice_label_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slice_id VARCHAR(64) NOT NULL,
  dimension_code VARCHAR(64) NOT NULL,
  old_value VARCHAR(255) NULL,
  new_value VARCHAR(255) NULL,
  old_source VARCHAR(20) NULL,
  new_source VARCHAR(20) NULL,
  changed_by VARCHAR(64) NOT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reason TEXT NULL,
  INDEX idx_slice (slice_id),
  INDEX idx_time (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标注修改历史';

-- ===========================================================
-- 模块六：数据清洗
-- ===========================================================

-- 表 12: base_clean_rules — 清洗规则（带版本）
CREATE TABLE IF NOT EXISTS base_clean_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL,
  rule_version INT UNSIGNED NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) NULL,
  sensor_type VARCHAR(50) NULL,
  measurement_type VARCHAR(50) NULL,
  rule_type VARCHAR(30) NOT NULL,
  detect_config JSON NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  action_config JSON NULL,
  priority INT NOT NULL DEFAULT 5,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  description TEXT,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_rule_version (rule_id, rule_version),
  INDEX idx_current (is_current, is_active),
  INDEX idx_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='清洗规则';

-- 表 13: data_clean_tasks — 清洗任务
CREATE TABLE IF NOT EXISTS data_clean_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  idempotent_key VARCHAR(64) NOT NULL COMMENT '幂等键',
  name VARCHAR(100) NULL,
  device_code VARCHAR(100) NULL,
  sensor_ids JSON NULL,
  time_start DATETIME(3) NOT NULL,
  time_end DATETIME(3) NOT NULL,
  rule_ids JSON NULL,
  rule_snapshot JSON NULL COMMENT '执行时的规则配置快照',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stats JSON NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  error_message TEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_task_id (task_id),
  UNIQUE KEY uk_idempotent (idempotent_key),
  INDEX idx_status (status),
  INDEX idx_time (time_start, time_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='清洗任务';

-- 表 14: data_clean_logs — 清洗记录
CREATE TABLE IF NOT EXISTS data_clean_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NULL,
  slice_id VARCHAR(64) NULL,
  device_code VARCHAR(100) NOT NULL,
  sensor_id VARCHAR(64) NOT NULL,
  data_time DATETIME(6) NOT NULL COMMENT '微秒精度',
  rule_id VARCHAR(64) NOT NULL,
  rule_version INT UNSIGNED NOT NULL,
  issue_type VARCHAR(50) NOT NULL,
  original_value DOUBLE NULL,
  cleaned_value DOUBLE NULL,
  action_taken VARCHAR(50) NOT NULL,
  is_fixed TINYINT(1) NOT NULL DEFAULT 0,
  context JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_device_sensor (device_code, sensor_id),
  INDEX idx_task (task_id),
  INDEX idx_time (data_time),
  INDEX idx_issue (issue_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='清洗记录';

-- 表 15: data_quality_reports — 质量报告
CREATE TABLE IF NOT EXISTS data_quality_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_type VARCHAR(20) NOT NULL COMMENT 'daily/weekly/monthly',
  report_date DATE NOT NULL,
  device_code VARCHAR(100) NULL,
  sensor_id VARCHAR(64) NULL,
  total_records BIGINT UNSIGNED NOT NULL DEFAULT 0,
  valid_records BIGINT UNSIGNED NOT NULL DEFAULT 0,
  completeness DOUBLE NULL COMMENT '完整率',
  accuracy DOUBLE NULL COMMENT '准确率',
  quality_score DOUBLE NULL COMMENT '综合评分 0-100',
  metrics JSON NOT NULL,
  prev_quality_score DOUBLE NULL,
  score_change DOUBLE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_report (report_type, report_date, device_code, sensor_id),
  INDEX idx_date (report_date),
  INDEX idx_device (device_code),
  INDEX idx_score (quality_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='质量报告';

-- 表 16: sensor_calibrations — 传感器校准
CREATE TABLE IF NOT EXISTS sensor_calibrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_code VARCHAR(100) NOT NULL,
  sensor_id VARCHAR(64) NOT NULL,
  calibration_date DATE NOT NULL,
  calibration_type VARCHAR(20) NOT NULL COMMENT 'manual/auto/factory',
  offset_before DOUBLE NULL,
  offset_after DOUBLE NULL,
  scale_before DOUBLE NULL,
  scale_after DOUBLE NULL,
  calibration_formula VARCHAR(255) NULL,
  apply_to_history TINYINT(1) NOT NULL DEFAULT 0,
  history_start_time DATETIME(3) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  applied_at DATETIME(3) NULL,
  notes TEXT,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_device_sensor (device_code, sensor_id),
  INDEX idx_date (calibration_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器校准';

-- ===========================================================
-- 模块七：数据字典
-- ===========================================================

-- 表 17: base_dict_categories — 字典分类
CREATE TABLE IF NOT EXISTS base_dict_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典分类';

-- 表 18: base_dict_items — 字典项
CREATE TABLE IF NOT EXISTS base_dict_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(100) NOT NULL,
  value VARCHAR(255) NULL,
  parent_code VARCHAR(64) NULL,
  icon VARCHAR(50) NULL,
  color VARCHAR(20) NULL,
  metadata JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_category_code (category_code, code),
  INDEX idx_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典项';

-- ===========================================================
-- 模块八：事件溯源
-- ===========================================================

-- 表 19: event_store — 事件存储
CREATE TABLE IF NOT EXISTS event_store (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL COMMENT '事件 ID (UUID)',
  event_type VARCHAR(100) NOT NULL COMMENT '事件类型',
  event_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '事件版本',
  aggregate_type VARCHAR(50) NOT NULL COMMENT '聚合类型: device/sensor/slice',
  aggregate_id VARCHAR(100) NOT NULL COMMENT '聚合 ID',
  aggregate_version BIGINT UNSIGNED NOT NULL COMMENT '聚合版本(乐观锁)',
  payload JSON NOT NULL COMMENT '事件载荷',
  metadata JSON NULL COMMENT '元数据',
  causation_id VARCHAR(64) NULL COMMENT '因果事件 ID',
  correlation_id VARCHAR(64) NULL COMMENT '关联事件 ID',
  occurred_at DATETIME(3) NOT NULL COMMENT '发生时间',
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',
  actor_id VARCHAR(64) NULL,
  actor_type VARCHAR(20) NULL COMMENT 'user/system/scheduler',
  UNIQUE KEY uk_event_id (event_id),
  UNIQUE KEY uk_aggregate_version (aggregate_type, aggregate_id, aggregate_version),
  INDEX idx_aggregate (aggregate_type, aggregate_id),
  INDEX idx_type (event_type),
  INDEX idx_time (occurred_at),
  INDEX idx_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='事件存储';

-- 表 20: event_snapshots — 快照
CREATE TABLE IF NOT EXISTS event_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  aggregate_version BIGINT UNSIGNED NOT NULL,
  state JSON NOT NULL COMMENT '聚合状态快照',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_snapshot (aggregate_type, aggregate_id, aggregate_version),
  INDEX idx_aggregate (aggregate_type, aggregate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聚合快照';

SET FOREIGN_KEY_CHECKS = 1;
