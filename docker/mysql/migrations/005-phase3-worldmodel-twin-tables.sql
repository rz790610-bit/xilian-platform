SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `simulation_scenarios` (
  `id` INT AUTO_INCREMENT,
  `machine_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(256) NOT NULL,
  `description` TEXT,
  `parameter_overrides` JSON,
  `horizon_steps` INT NOT NULL DEFAULT 30,
  `monte_carlo_runs` INT NOT NULL DEFAULT 50,
  `method` VARCHAR(32) NOT NULL DEFAULT 'sobol_qmc',
  `status` ENUM('draft', 'running', 'completed', 'failed') NOT NULL DEFAULT 'draft',
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(128),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ss_machine_id` (`machine_id`),
  INDEX `idx_ss_status` (`status`),
  INDEX `idx_ss_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `simulation_results` (
  `id` INT AUTO_INCREMENT,
  `scenario_id` INT NOT NULL,
  `machine_id` VARCHAR(64) NOT NULL,
  `mean_trajectory` JSON,
  `p5_trajectory` JSON,
  `p50_trajectory` JSON,
  `p95_trajectory` JSON,
  `std_dev_by_dimension` JSON,
  `risk_level` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  `monte_carlo_runs` INT NOT NULL,
  `sequence_type` VARCHAR(32) NOT NULL DEFAULT 'sobol',
  `duration_ms` INT NOT NULL,
  `ai_explanation` TEXT,
  `ai_maintenance_advice` TEXT,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_sr_scenario_id` (`scenario_id`),
  INDEX `idx_sr_machine_id` (`machine_id`),
  INDEX `idx_sr_risk_level` (`risk_level`),
  INDEX `idx_sr_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `twin_sync_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `machine_id` VARCHAR(64) NOT NULL,
  `sync_mode` ENUM('cdc', 'polling') NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `latency_ms` INT,
  `state_snapshot` JSON,
  `health_index` DOUBLE,
  `metadata` JSON,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_tsl_machine_id` (`machine_id`),
  INDEX `idx_tsl_sync_mode` (`sync_mode`),
  INDEX `idx_tsl_event_type` (`event_type`),
  INDEX `idx_tsl_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `twin_events` (
  `id` BIGINT AUTO_INCREMENT,
  `event_id` VARCHAR(36) NOT NULL,
  `machine_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `source_node` VARCHAR(128) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `event_timestamp` TIMESTAMP(3) NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_te_event_id` (`event_id`),
  INDEX `idx_te_machine_id` (`machine_id`),
  INDEX `idx_te_event_type` (`event_type`),
  INDEX `idx_te_event_timestamp` (`event_timestamp`),
  INDEX `idx_te_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `twin_outbox` (
  `id` BIGINT AUTO_INCREMENT,
  `aggregate_type` VARCHAR(64) NOT NULL,
  `aggregate_id` VARCHAR(128) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('pending', 'sent', 'dead_letter') NOT NULL DEFAULT 'pending',
  `retry_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_to_status` (`status`),
  INDEX `idx_to_aggregate` (`aggregate_type`, `aggregate_id`),
  INDEX `idx_to_event_type` (`event_type`),
  INDEX `idx_to_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
