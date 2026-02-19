-- ============================================================
-- Migration: Full camelCase → snake_case + Schema Alignment
-- Date: 2026-02-08
-- Description: Complete migration script for upgrading from
--   Drizzle-managed camelCase schema to unified snake_case schema.
--   This script handles:
--   1. Rename all camelCase columns to snake_case
--   2. Add missing columns (resolution, metadata, event_type)
--   3. Create new tables (v1.5 database module + v1.9 performance)
--   4. Drop deprecated tables (devices, sensors, etc.)
--
-- Usage:
--   docker exec -i <mysql-container> mysql -u root -p<password> xilian < docker/mysql/migrations/004-full-schema-alignment.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- PART 1: Rename camelCase columns to snake_case
-- ============================================================

-- anomaly_detections
ALTER TABLE `anomaly_detections`
  CHANGE COLUMN `detectionId` `detection_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `sensorId` `sensor_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `algorithmType` `algorithm_type` ENUM('zscore', 'iqr', 'mad', 'isolation_forest', 'custom') NOT NULL DEFAULT 'zscore',
  CHANGE COLUMN `windowSize` `window_size` INT DEFAULT 60,
  CHANGE COLUMN `currentValue` `current_value` INT,
  CHANGE COLUMN `expectedValue` `expected_value` INT,
  CHANGE COLUMN `acknowledgedBy` `acknowledged_by` VARCHAR(100),
  CHANGE COLUMN `acknowledgedAt` `acknowledged_at` TIMESTAMP NULL,
  CHANGE COLUMN `resolvedAt` `resolved_at` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- device_alerts
ALTER TABLE `device_alerts`
  CHANGE COLUMN `alertId` `alert_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `sensorId` `sensor_id` VARCHAR(64),
  CHANGE COLUMN `alertType` `alert_type` ENUM('threshold', 'anomaly', 'offline', 'error', 'maintenance_due', 'warranty_expiry', 'custom') NOT NULL,
  CHANGE COLUMN `triggerValue` `trigger_value` DOUBLE,
  CHANGE COLUMN `thresholdValue` `threshold_value` DOUBLE,
  CHANGE COLUMN `acknowledgedBy` `acknowledged_by` VARCHAR(100),
  CHANGE COLUMN `acknowledgedAt` `acknowledged_at` TIMESTAMP NULL,
  CHANGE COLUMN `resolvedBy` `resolved_by` VARCHAR(100),
  CHANGE COLUMN `resolvedAt` `resolved_at` TIMESTAMP NULL,
  CHANGE COLUMN `escalationLevel` `escalation_level` INT DEFAULT 0,
  CHANGE COLUMN `notificationsSent` `notifications_sent` JSON,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- device_kpis
ALTER TABLE `device_kpis`
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `periodType` `period_type` ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  CHANGE COLUMN `periodStart` `period_start` TIMESTAMP NOT NULL,
  CHANGE COLUMN `periodEnd` `period_end` TIMESTAMP NOT NULL,
  CHANGE COLUMN `runningTime` `running_time` INT,
  CHANGE COLUMN `idleTime` `idle_time` INT,
  CHANGE COLUMN `plannedDowntime` `planned_downtime` INT,
  CHANGE COLUMN `unplannedDowntime` `unplanned_downtime` INT,
  CHANGE COLUMN `failureCount` `failure_count` INT DEFAULT 0,
  CHANGE COLUMN `productionCount` `production_count` INT,
  CHANGE COLUMN `defectCount` `defect_count` INT,
  CHANGE COLUMN `energyConsumption` `energy_consumption` DOUBLE,
  CHANGE COLUMN `energyEfficiency` `energy_efficiency` DOUBLE,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- device_maintenance_records
ALTER TABLE `device_maintenance_records`
  CHANGE COLUMN `recordId` `record_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `maintenanceType` `maintenance_type` ENUM('preventive', 'corrective', 'predictive', 'emergency', 'calibration', 'inspection') NOT NULL DEFAULT 'preventive',
  CHANGE COLUMN `scheduledDate` `scheduled_date` TIMESTAMP NULL,
  CHANGE COLUMN `startedAt` `started_at` TIMESTAMP NULL,
  CHANGE COLUMN `completedAt` `completed_at` TIMESTAMP NULL,
  CHANGE COLUMN `assignedTo` `assigned_to` VARCHAR(100),
  CHANGE COLUMN `performedBy` `performed_by` VARCHAR(100),
  CHANGE COLUMN `nextMaintenanceDate` `next_maintenance_date` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- device_operation_logs
ALTER TABLE `device_operation_logs`
  CHANGE COLUMN `logId` `log_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `operationType` `operation_type` ENUM('start', 'stop', 'restart', 'config_change', 'firmware_update', 'calibration', 'mode_change', 'error', 'recovery') NOT NULL,
  CHANGE COLUMN `previousState` `previous_state` VARCHAR(50),
  CHANGE COLUMN `newState` `new_state` VARCHAR(50),
  CHANGE COLUMN `operatedBy` `operated_by` VARCHAR(100),
  CHANGE COLUMN `errorMessage` `error_message` TEXT,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- device_spare_parts
ALTER TABLE `device_spare_parts`
  CHANGE COLUMN `partId` `part_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `partNumber` `part_number` VARCHAR(100),
  CHANGE COLUMN `compatibleDeviceTypes` `compatible_device_types` JSON,
  CHANGE COLUMN `minQuantity` `min_quantity` INT DEFAULT 1,
  CHANGE COLUMN `maxQuantity` `max_quantity` INT,
  CHANGE COLUMN `unitPrice` `unit_price` DOUBLE,
  CHANGE COLUMN `lastRestockedAt` `last_restocked_at` TIMESTAMP NULL,
  CHANGE COLUMN `expiryDate` `expiry_date` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- diagnosis_rules
ALTER TABLE `diagnosis_rules`
  CHANGE COLUMN `ruleId` `rule_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceType` `device_type` VARCHAR(50),
  CHANGE COLUMN `sensorType` `sensor_type` VARCHAR(50),
  CHANGE COLUMN `conditionExpr` `condition_expr` TEXT NOT NULL,
  CHANGE COLUMN `actionType` `action_type` ENUM('alert', 'notification', 'workflow', 'auto_fix') NOT NULL DEFAULT 'alert',
  CHANGE COLUMN `actionConfig` `action_config` JSON,
  CHANGE COLUMN `isActive` `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  CHANGE COLUMN `triggerCount` `trigger_count` INT DEFAULT 0,
  CHANGE COLUMN `lastTriggeredAt` `last_triggered_at` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- diagnosis_tasks
ALTER TABLE `diagnosis_tasks`
  CHANGE COLUMN `taskId` `task_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64),
  CHANGE COLUMN `sensorId` `sensor_id` VARCHAR(64),
  CHANGE COLUMN `ruleId` `rule_id` VARCHAR(64),
  CHANGE COLUMN `anomalyId` `anomaly_id` VARCHAR(64),
  CHANGE COLUMN `taskType` `task_type` ENUM('routine', 'anomaly', 'manual', 'scheduled') NOT NULL DEFAULT 'routine',
  CHANGE COLUMN `inputData` `input_data` JSON,
  CHANGE COLUMN `startedAt` `started_at` TIMESTAMP NULL,
  CHANGE COLUMN `completedAt` `completed_at` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- event_logs
ALTER TABLE `event_logs`
  CHANGE COLUMN `eventId` `event_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `eventType` `event_type` VARCHAR(50) NOT NULL,
  CHANGE COLUMN `deviceId` `node_id` VARCHAR(64),
  CHANGE COLUMN `sensorId` `sensor_id` VARCHAR(64),
  CHANGE COLUMN `processedAt` `processed_at` TIMESTAMP NULL,
  CHANGE COLUMN `processedBy` `processed_by` VARCHAR(100),
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- kb_collections
ALTER TABLE `kb_collections`
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `isPublic` `is_public` BOOLEAN NOT NULL DEFAULT TRUE,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- kb_documents
ALTER TABLE `kb_documents`
  CHANGE COLUMN `collectionId` `collection_id` INT NOT NULL,
  CHANGE COLUMN `mimeType` `mime_type` VARCHAR(100),
  CHANGE COLUMN `fileSize` `file_size` INT,
  CHANGE COLUMN `storageUrl` `storage_url` VARCHAR(500),
  CHANGE COLUMN `processedAt` `processed_at` TIMESTAMP NULL,
  CHANGE COLUMN `chunksCount` `chunks_count` INT DEFAULT 0,
  CHANGE COLUMN `entitiesCount` `entities_count` INT DEFAULT 0,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- kb_points
ALTER TABLE `kb_points`
  CHANGE COLUMN `collectionId` `collection_id` INT NOT NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- kg_edges
ALTER TABLE `kg_edges`
  CHANGE COLUMN `collectionId` `collection_id` INT NOT NULL,
  CHANGE COLUMN `edgeId` `edge_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `sourceNodeId` `source_node_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `targetNodeId` `target_node_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- kg_nodes
ALTER TABLE `kg_nodes`
  CHANGE COLUMN `collectionId` `collection_id` INT NOT NULL,
  CHANGE COLUMN `nodeId` `node_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- model_conversations
ALTER TABLE `model_conversations`
  CHANGE COLUMN `conversationId` `conversation_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `modelId` `model_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `messageCount` `message_count` INT NOT NULL DEFAULT 0,
  CHANGE COLUMN `totalTokens` `total_tokens` INT DEFAULT 0,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- model_evaluations
ALTER TABLE `model_evaluations`
  CHANGE COLUMN `evaluationId` `evaluation_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `modelId` `model_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `datasetPath` `dataset_path` VARCHAR(500),
  CHANGE COLUMN `datasetSize` `dataset_size` INT,
  CHANGE COLUMN `evaluationType` `evaluation_type` ENUM('accuracy', 'perplexity', 'bleu', 'rouge', 'custom') NOT NULL DEFAULT 'accuracy',
  CHANGE COLUMN `startedAt` `started_at` TIMESTAMP NULL,
  CHANGE COLUMN `completedAt` `completed_at` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- model_fine_tune_tasks
ALTER TABLE `model_fine_tune_tasks`
  CHANGE COLUMN `taskId` `task_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `baseModelId` `base_model_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `outputModelId` `output_model_id` VARCHAR(100),
  CHANGE COLUMN `datasetPath` `dataset_path` VARCHAR(500),
  CHANGE COLUMN `datasetSize` `dataset_size` INT,
  CHANGE COLUMN `startedAt` `started_at` TIMESTAMP NULL,
  CHANGE COLUMN `completedAt` `completed_at` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- model_messages
ALTER TABLE `model_messages`
  CHANGE COLUMN `messageId` `message_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `conversationId` `conversation_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `toolCalls` `tool_calls` JSON,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- model_usage_logs
ALTER TABLE `model_usage_logs`
  CHANGE COLUMN `logId` `log_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `modelId` `model_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `conversationId` `conversation_id` VARCHAR(64),
  CHANGE COLUMN `requestType` `request_type` ENUM('chat', 'completion', 'embedding', 'inference') NOT NULL,
  CHANGE COLUMN `inputTokens` `input_tokens` INT,
  CHANGE COLUMN `outputTokens` `output_tokens` INT,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- models
ALTER TABLE `models`
  CHANGE COLUMN `modelId` `model_id` VARCHAR(100) NOT NULL,
  CHANGE COLUMN `displayName` `display_name` VARCHAR(200),
  CHANGE COLUMN `downloadProgress` `download_progress` INT DEFAULT 0,
  CHANGE COLUMN `isDefault` `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- topo_edges
ALTER TABLE `topo_edges`
  CHANGE COLUMN `edgeId` `edge_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `sourceNodeId` `source_node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `targetNodeId` `target_node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- topo_layouts
ALTER TABLE `topo_layouts`
  CHANGE COLUMN `userId` `user_id` INT,
  CHANGE COLUMN `isDefault` `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  CHANGE COLUMN `layoutData` `layout_data` JSON,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- topo_nodes
ALTER TABLE `topo_nodes`
  CHANGE COLUMN `nodeId` `node_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `lastHeartbeat` `last_heartbeat` TIMESTAMP NULL,
  CHANGE COLUMN `createdAt` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updatedAt` `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============================================================
-- PART 2: Additional column fixes (beyond simple renames)
-- ============================================================

-- device_alerts: rename 'notes' to 'resolution', add 'metadata' column
-- (Only needed if 003 migration was NOT already applied)
-- These are wrapped in a procedure to handle 'column not found' gracefully

DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _migration_fix_device_alerts()
BEGIN
    -- Check if 'notes' column exists (not yet migrated by 003)
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_alerts' AND COLUMN_NAME = 'notes'
    ) THEN
        ALTER TABLE `device_alerts` CHANGE COLUMN `notes` `resolution` TEXT;
    END IF;
    
    -- Add metadata if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_alerts' AND COLUMN_NAME = 'metadata'
    ) THEN
        ALTER TABLE `device_alerts` ADD COLUMN `metadata` JSON AFTER `notifications_sent`;
    END IF;
    
    -- Add event_type to processed_events if not exists
    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processed_events'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processed_events' AND COLUMN_NAME = 'event_type'
        ) THEN
            ALTER TABLE `processed_events` ADD COLUMN `event_type` VARCHAR(100) NOT NULL DEFAULT '' AFTER `event_id`;
        END IF;
    END IF;
END //
DELIMITER ;

CALL _migration_fix_device_alerts();
DROP PROCEDURE IF EXISTS _migration_fix_device_alerts;

-- ============================================================
-- PART 3: Drop deprecated tables
-- ============================================================

DROP TABLE IF EXISTS `data_aggregations`;
DROP TABLE IF EXISTS `devices`;
DROP TABLE IF EXISTS `sensor_aggregates`;
DROP TABLE IF EXISTS `sensor_readings`;
DROP TABLE IF EXISTS `sensors`;
DROP TABLE IF EXISTS `telemetry_data`;

-- ============================================================
-- PART 4: Create new tables (v1.5 + v1.9)
-- ============================================================

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `last_value` DOUBLE NULL,
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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_sampling_config (

  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  base_sampling_rate_ms INT NOT NULL DEFAULT 1000,
  current_sampling_rate_ms INT NOT NULL DEFAULT 1000,
  min_sampling_rate_ms INT NOT NULL DEFAULT 100,
  max_sampling_rate_ms INT NOT NULL DEFAULT 60000,
  adaptive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_adjusted_at TIMESTAMP NULL,
  adjustment_reason VARCHAR(200),
  priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device_sensor (node_id, sensor_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idempotent_records (

  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  operation_type VARCHAR(100) NOT NULL,
  `status` ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  request_hash VARCHAR(64),
  response JSON,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_idempotent_expires (expires_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbox_events (

  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  metadata JSON,
  `status` ENUM('pending', 'processing', 'published', 'failed', 'dead_letter') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_outbox_status (status),
  INDEX idx_outbox_type (event_type),
  INDEX idx_outbox_aggregate (aggregate_id, aggregate_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbox_routing_config (

  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL UNIQUE,
  publish_mode ENUM('cdc', 'polling') NOT NULL DEFAULT 'cdc',
  cdc_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  polling_interval_ms INT,
  polling_batch_size INT,
  requires_processing BOOLEAN NOT NULL DEFAULT FALSE,
  processor_class VARCHAR(200),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processed_events (

  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  consumer_group VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_consumer (event_id, consumer_group),
  INDEX idx_processed_expires (expires_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rollback_executions (

  id INT AUTO_INCREMENT PRIMARY KEY,
  execution_id VARCHAR(64) NOT NULL UNIQUE,
  saga_id VARCHAR(64),
  trigger_id VARCHAR(64) NOT NULL,
  target_type ENUM('rule', 'model', 'config', 'firmware') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  from_version VARCHAR(50) NOT NULL,
  to_version VARCHAR(50) NOT NULL,
  trigger_reason TEXT,
  `status` ENUM('pending', 'executing', 'completed', 'failed', 'partial', 'cancelled') NOT NULL DEFAULT 'pending',
  total_devices INT,
  completed_devices INT DEFAULT 0,
  failed_devices INT DEFAULT 0,
  checkpoint JSON,
  result JSON,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rollback_status (status),
  INDEX idx_rollback_saga_id (saga_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saga_dead_letters (

  id INT AUTO_INCREMENT PRIMARY KEY,
  dead_letter_id VARCHAR(64) NOT NULL UNIQUE,
  saga_id VARCHAR(64) NOT NULL,
  saga_type VARCHAR(100) NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_type ENUM('timeout', 'max_retries', 'compensation_failed', 'unknown') NOT NULL,
  original_input JSON,
  last_checkpoint JSON,
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  resolved_by VARCHAR(100),
  resolution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_dl_saga_id (saga_id),
  INDEX idx_saga_dl_type (failure_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saga_instances (

  id INT AUTO_INCREMENT PRIMARY KEY,
  saga_id VARCHAR(64) NOT NULL UNIQUE,
  saga_type VARCHAR(100) NOT NULL,
  `status` ENUM('running', 'completed', 'failed', 'compensating', 'compensated', 'partial') NOT NULL DEFAULT 'running',
  current_step INT NOT NULL DEFAULT 0,
  total_steps INT NOT NULL,
  input JSON,
  output JSON,
  checkpoint JSON,
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  timeout_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_status (status),
  INDEX idx_saga_type (saga_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saga_steps (

  id INT AUTO_INCREMENT PRIMARY KEY,
  step_id VARCHAR(64) NOT NULL UNIQUE,
  saga_id VARCHAR(64) NOT NULL,
  step_index INT NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_type ENUM('action', 'compensation') NOT NULL DEFAULT 'action',
  `status` ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'compensated') NOT NULL DEFAULT 'pending',
  input JSON,
  output JSON,
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_steps_saga_id (saga_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- ============================================================
-- PART D: Supplementary Tables (1 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL,
  period_type ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  running_time INT,
  downtime INT,
  idle_time INT,
  planned_downtime INT,
  unplanned_downtime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failure_count INT DEFAULT 0,
  production_count INT,
  defect_count INT,
  energy_consumption DOUBLE,
  energy_efficiency DOUBLE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_node_id (node_id),
  INDEX idx_device_kpis_period_type (period_type),
  INDEX idx_device_kpis_period_start (period_start)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_capacity_metrics (

  id INT AUTO_INCREMENT PRIMARY KEY,
  metric_id VARCHAR(64) NOT NULL UNIQUE,
  metric_type ENUM('kafka_lag', 'db_connections', 'memory_usage', 'cpu_usage', 'queue_depth') NOT NULL,
  component_name VARCHAR(100) NOT NULL,
  current_value DOUBLE NOT NULL,
  threshold DOUBLE NOT NULL,
  `status` ENUM('normal', 'warning', 'critical') NOT NULL DEFAULT 'normal',
  last_checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (

  id INT AUTO_INCREMENT PRIMARY KEY,
  open_id VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  login_method VARCHAR(64),
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_signed_in TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email(255))

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 5: Fix indexes after column renames
-- ============================================================

DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _migration_fix_indexes()
BEGIN
    -- Drop old camelCase unique constraints and recreate with snake_case
    -- topo_nodes
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'topo_nodes' AND INDEX_NAME = 'topo_nodes_nodeId_unique') THEN
        ALTER TABLE `topo_nodes` DROP INDEX `topo_nodes_nodeId_unique`, ADD UNIQUE INDEX `topo_nodes_node_id_unique` (`node_id`);
    END IF;
    
    -- topo_edges
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'topo_edges' AND INDEX_NAME = 'topo_edges_edgeId_unique') THEN
        ALTER TABLE `topo_edges` DROP INDEX `topo_edges_edgeId_unique`, ADD UNIQUE INDEX `topo_edges_edge_id_unique` (`edge_id`);
    END IF;
    
    -- models
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'models' AND INDEX_NAME = 'models_modelId_unique') THEN
        ALTER TABLE `models` DROP INDEX `models_modelId_unique`, ADD UNIQUE INDEX `models_model_id_unique` (`model_id`);
    END IF;
    
    -- model_conversations
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_conversations' AND INDEX_NAME = 'model_conversations_conversationId_unique') THEN
        ALTER TABLE `model_conversations` DROP INDEX `model_conversations_conversationId_unique`, ADD UNIQUE INDEX `model_conversations_conversation_id_unique` (`conversation_id`);
    END IF;
    
    -- model_messages
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_messages' AND INDEX_NAME = 'model_messages_messageId_unique') THEN
        ALTER TABLE `model_messages` DROP INDEX `model_messages_messageId_unique`, ADD UNIQUE INDEX `model_messages_message_id_unique` (`message_id`);
    END IF;
    
    -- model_evaluations
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_evaluations' AND INDEX_NAME = 'model_evaluations_evaluationId_unique') THEN
        ALTER TABLE `model_evaluations` DROP INDEX `model_evaluations_evaluationId_unique`, ADD UNIQUE INDEX `model_evaluations_evaluation_id_unique` (`evaluation_id`);
    END IF;
    
    -- model_fine_tune_tasks
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_fine_tune_tasks' AND INDEX_NAME = 'model_fine_tune_tasks_taskId_unique') THEN
        ALTER TABLE `model_fine_tune_tasks` DROP INDEX `model_fine_tune_tasks_taskId_unique`, ADD UNIQUE INDEX `model_fine_tune_tasks_task_id_unique` (`task_id`);
    END IF;
    
    -- model_usage_logs
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_usage_logs' AND INDEX_NAME = 'model_usage_logs_logId_unique') THEN
        ALTER TABLE `model_usage_logs` DROP INDEX `model_usage_logs_logId_unique`, ADD UNIQUE INDEX `model_usage_logs_log_id_unique` (`log_id`);
    END IF;
    
    -- anomaly_detections
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'anomaly_detections' AND INDEX_NAME = 'anomaly_detections_detectionId_unique') THEN
        ALTER TABLE `anomaly_detections` DROP INDEX `anomaly_detections_detectionId_unique`, ADD UNIQUE INDEX `anomaly_detections_detection_id_unique` (`detection_id`);
    END IF;
    
    -- diagnosis_rules
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diagnosis_rules' AND INDEX_NAME = 'diagnosis_rules_ruleId_unique') THEN
        ALTER TABLE `diagnosis_rules` DROP INDEX `diagnosis_rules_ruleId_unique`, ADD UNIQUE INDEX `diagnosis_rules_rule_id_unique` (`rule_id`);
    END IF;
    
    -- diagnosis_tasks
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diagnosis_tasks' AND INDEX_NAME = 'diagnosis_tasks_taskId_unique') THEN
        ALTER TABLE `diagnosis_tasks` DROP INDEX `diagnosis_tasks_taskId_unique`, ADD UNIQUE INDEX `diagnosis_tasks_task_id_unique` (`task_id`);
    END IF;
    
    -- event_logs
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_logs' AND INDEX_NAME = 'event_logs_eventId_unique') THEN
        ALTER TABLE `event_logs` DROP INDEX `event_logs_eventId_unique`, ADD UNIQUE INDEX `event_logs_event_id_unique` (`event_id`);
    END IF;
    
    -- kg_nodes
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kg_nodes' AND INDEX_NAME = 'kg_nodes_nodeId_unique') THEN
        ALTER TABLE `kg_nodes` DROP INDEX `kg_nodes_nodeId_unique`, ADD UNIQUE INDEX `kg_nodes_node_id_unique` (`node_id`);
    END IF;
    
    -- kg_edges
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kg_edges' AND INDEX_NAME = 'kg_edges_edgeId_unique') THEN
        ALTER TABLE `kg_edges` DROP INDEX `kg_edges_edgeId_unique`, ADD UNIQUE INDEX `kg_edges_edge_id_unique` (`edge_id`);
    END IF;
    
    -- device_alerts
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_alerts' AND INDEX_NAME = 'device_alerts_alertId_unique') THEN
        ALTER TABLE `device_alerts` DROP INDEX `device_alerts_alertId_unique`, ADD UNIQUE INDEX `device_alerts_alert_id_unique` (`alert_id`);
    END IF;
    
    -- device_kpis (no unique index to rename)
    
    -- device_maintenance_records
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_maintenance_records' AND INDEX_NAME = 'device_maintenance_records_recordId_unique') THEN
        ALTER TABLE `device_maintenance_records` DROP INDEX `device_maintenance_records_recordId_unique`, ADD UNIQUE INDEX `device_maintenance_records_record_id_unique` (`record_id`);
    END IF;
    
    -- device_operation_logs
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_operation_logs' AND INDEX_NAME = 'device_operation_logs_logId_unique') THEN
        ALTER TABLE `device_operation_logs` DROP INDEX `device_operation_logs_logId_unique`, ADD UNIQUE INDEX `device_operation_logs_log_id_unique` (`log_id`);
    END IF;
    
    -- device_spare_parts
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_spare_parts' AND INDEX_NAME = 'device_spare_parts_partId_unique') THEN
        ALTER TABLE `device_spare_parts` DROP INDEX `device_spare_parts_partId_unique`, ADD UNIQUE INDEX `device_spare_parts_part_id_unique` (`part_id`);
    END IF;
    
END //
DELIMITER ;

CALL _migration_fix_indexes();
DROP PROCEDURE IF EXISTS _migration_fix_indexes;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migration 004 completed successfully! All columns renamed to snake_case, new tables created.' AS status;
