-- ============================================================================
-- 手动建表脚本 — 解决 drizzle-kit push 崩溃问题
-- 执行方式: mysql -u root -p xilian < scripts/create-missing-tables.sql
-- ============================================================================

-- 1. BPA 配置表
CREATE TABLE IF NOT EXISTS `bpa_configs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `equipment_type` VARCHAR(100) NOT NULL,
  `condition_phase` VARCHAR(100) DEFAULT NULL,
  `hypotheses` JSON NOT NULL,
  `rules` JSON NOT NULL,
  `ignorance_base` DOUBLE NOT NULL DEFAULT 0.05,
  `min_mass_threshold` DOUBLE NOT NULL DEFAULT 0.01,
  `version` VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `description` TEXT,
  `created_by` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_bpa_equipment` (`equipment_type`),
  INDEX `idx_bpa_condition` (`condition_phase`),
  INDEX `idx_bpa_enabled` (`enabled`),
  UNIQUE KEY `uq_bpa_name_version` (`name`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 状态向量维度定义表
CREATE TABLE IF NOT EXISTS `state_vector_dimensions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `equipment_type` VARCHAR(100) NOT NULL,
  `dimension_index` INT NOT NULL,
  `dimension_key` VARCHAR(100) NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `unit` VARCHAR(50) NOT NULL DEFAULT '',
  `dimension_group` ENUM('cycle_features', 'uncertainty_factors', 'cumulative_metrics') NOT NULL,
  `metric_names` JSON NOT NULL,
  `aggregation` ENUM('mean', 'max', 'min', 'rms', 'latest', 'sum', 'std') NOT NULL DEFAULT 'mean',
  `default_value` DOUBLE NOT NULL DEFAULT 0,
  `normalize_range` JSON NOT NULL,
  `source` ENUM('clickhouse', 'mysql', 'computed', 'external') NOT NULL DEFAULT 'clickhouse',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `description` TEXT,
  `version` VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_svd_equipment` (`equipment_type`),
  INDEX `idx_svd_group` (`dimension_group`),
  INDEX `idx_svd_enabled` (`enabled`),
  UNIQUE KEY `uq_svd_equipment_key_version` (`equipment_type`, `dimension_key`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 状态向量日志表
CREATE TABLE IF NOT EXISTS `state_vector_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `machine_id` VARCHAR(100) NOT NULL,
  `synthesized_at` TIMESTAMP(3) NOT NULL,
  `dimension_values` JSON NOT NULL,
  `normalized_values` JSON NOT NULL,
  `completeness` DOUBLE NOT NULL,
  `freshness_seconds` DOUBLE NOT NULL,
  `missing_dimensions` JSON DEFAULT NULL,
  `defaulted_dimensions` JSON DEFAULT NULL,
  `total_data_points` INT NOT NULL DEFAULT 0,
  `duration_ms` INT DEFAULT NULL,
  `bpa_log` JSON DEFAULT NULL,
  `fusion_summary` JSON DEFAULT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_svl_machine` (`machine_id`),
  INDEX `idx_svl_time` (`synthesized_at`),
  INDEX `idx_svl_completeness` (`completeness`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 引擎配置注册表（Phase 2 动态配置）
CREATE TABLE IF NOT EXISTS `engine_config_registry` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `module` VARCHAR(64) NOT NULL,
  `config_group` VARCHAR(64) NOT NULL DEFAULT 'general',
  `config_key` VARCHAR(128) NOT NULL,
  `config_value` TEXT NOT NULL,
  `value_type` ENUM('number', 'string', 'boolean', 'json') NOT NULL DEFAULT 'string',
  `default_value` TEXT DEFAULT NULL,
  `label` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `unit` VARCHAR(32) DEFAULT NULL,
  `constraints` JSON DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 100,
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `is_builtin` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uk_module_key` (`module`, `config_key`),
  INDEX `idx_ecr_module` (`module`),
  INDEX `idx_ecr_group` (`module`, `config_group`),
  INDEX `idx_ecr_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. alert_event_log（如果不存在）
CREATE TABLE IF NOT EXISTS `alert_event_log` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `alert_type` VARCHAR(100) NOT NULL DEFAULT 'unknown',
  `severity` VARCHAR(20) NOT NULL DEFAULT 'info',
  `source` VARCHAR(200) DEFAULT NULL,
  `device_code` VARCHAR(100) DEFAULT NULL,
  `title` VARCHAR(500) NOT NULL,
  `message` TEXT,
  `context` JSON DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'open',
  `acknowledged_by` VARCHAR(100) DEFAULT NULL,
  `acknowledged_at` TIMESTAMP(3) DEFAULT NULL,
  `resolved_at` TIMESTAMP(3) DEFAULT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_ael_type` (`alert_type`),
  INDEX `idx_ael_severity` (`severity`),
  INDEX `idx_ael_device` (`device_code`),
  INDEX `idx_ael_status` (`status`),
  INDEX `idx_ael_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
