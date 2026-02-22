-- 西联平台全量数据库 Schema
-- 从 drizzle/schema.ts 自动生成
-- 共 121 张表
-- 列名风格: snake_case

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT,
  `open_id` VARCHAR(64) NOT NULL,
  `name` TEXT,
  `email` VARCHAR(320),
  `login_method` VARCHAR(64),
  `role` ENUM("user", "admin") NOT NULL DEFAULT "user",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_signed_in` TIMESTAMP NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_collections` (
  `id` INT AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `user_id` INT,
  `is_public` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_points` (
  `id` INT AUTO_INCREMENT,
  `collection_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT "general",
  `tags` JSON,
  `source` VARCHAR(255),
  `entities` JSON,
  `relations` JSON,
  `embedding` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_documents` (
  `id` INT AUTO_INCREMENT,
  `collection_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100),
  `file_size` INT,
  `storage_url` VARCHAR(500),
  `status` ENUM("pending", "processing", "completed", "failed") NOT NULL DEFAULT "pending",
  `processed_at` TIMESTAMP,
  `chunks_count` INT DEFAULT 0,
  `entities_count` INT DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_nodes` (
  `id` INT AUTO_INCREMENT,
  `collection_id` INT NOT NULL,
  `node_id` VARCHAR(100) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT "entity",
  `properties` JSON,
  `x` INT,
  `y` INT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_edges` (
  `id` INT AUTO_INCREMENT,
  `collection_id` INT NOT NULL,
  `edge_id` VARCHAR(100) NOT NULL,
  `source_node_id` VARCHAR(100) NOT NULL,
  `target_node_id` VARCHAR(100) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT "related_to",
  `weight` INT DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_nodes` (
  `id` INT AUTO_INCREMENT,
  `node_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM("source", "plugin", "engine", "agent", "output", "database", "service") NOT NULL,
  `icon` VARCHAR(20) DEFAULT "📦",
  `description` TEXT,
  `status` ENUM("online", "offline", "error", "maintenance") NOT NULL DEFAULT "offline",
  `x` INT NOT NULL DEFAULT 0,
  `y` INT NOT NULL DEFAULT 0,
  `config` JSON,
  `metrics` JSON,
  `last_heartbeat` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_edges` (
  `id` INT AUTO_INCREMENT,
  `edge_id` VARCHAR(64) NOT NULL,
  `source_node_id` VARCHAR(64) NOT NULL,
  `target_node_id` VARCHAR(64) NOT NULL,
  `type` ENUM("data", "dependency", "control") NOT NULL DEFAULT "data",
  `label` VARCHAR(100),
  `config` JSON,
  `status` ENUM("active", "inactive", "error") NOT NULL DEFAULT "active",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_layouts` (
  `id` INT AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `user_id` INT,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `layout_data` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `models` (
  `id` INT AUTO_INCREMENT,
  `model_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `display_name` VARCHAR(200),
  `type` ENUM("llm", "embedding", "label", "diagnostic", "vision", "audio") NOT NULL,
  `provider` ENUM("ollama", "openai", "anthropic", "local", "custom") NOT NULL DEFAULT "ollama",
  `size` VARCHAR(50),
  `parameters` VARCHAR(50),
  `quantization` VARCHAR(20),
  `description` TEXT,
  `status` ENUM("available", "loaded", "downloading", "error") NOT NULL DEFAULT "available",
  `download_progress` INT DEFAULT 0,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `config` JSON,
  `capabilities` JSON,
  `metrics` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `dataset_version` VARCHAR(64),
  `dataset_clip_count` INT,
  `dataset_total_duration_s` INT,
  `deployment_target` VARCHAR(64),
  `input_format` VARCHAR(64),
  `output_format` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_conversations` (
  `id` INT AUTO_INCREMENT,
  `conversation_id` VARCHAR(64) NOT NULL,
  `user_id` INT,
  `model_id` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255),
  `message_count` INT NOT NULL DEFAULT 0,
  `total_tokens` INT DEFAULT 0,
  `status` ENUM("active", "archived", "deleted") NOT NULL DEFAULT "active",
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_messages` (
  `id` INT AUTO_INCREMENT,
  `message_id` VARCHAR(64) NOT NULL,
  `conversation_id` VARCHAR(64) NOT NULL,
  `role` ENUM("system", "user", "assistant", "tool") NOT NULL,
  `content` TEXT NOT NULL,
  `tokens` INT,
  `latency` INT,
  `attachments` JSON,
  `tool_calls` JSON,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_fine_tune_tasks` (
  `id` INT AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `user_id` INT,
  `base_model_id` VARCHAR(100) NOT NULL,
  `output_model_id` VARCHAR(100),
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `status` ENUM("pending", "preparing", "training", "completed", "failed", "cancelled") NOT NULL DEFAULT "pending",
  `progress` INT DEFAULT 0,
  `dataset_path` VARCHAR(500),
  `dataset_size` INT,
  `config` JSON,
  `metrics` JSON,
  `error` TEXT,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_evaluations` (
  `id` INT AUTO_INCREMENT,
  `evaluation_id` VARCHAR(64) NOT NULL,
  `user_id` INT,
  `model_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `status` ENUM("pending", "running", "completed", "failed") NOT NULL DEFAULT "pending",
  `progress` INT DEFAULT 0,
  `dataset_path` VARCHAR(500),
  `dataset_size` INT,
  `evaluation_type` ENUM("accuracy", "perplexity", "bleu", "rouge", "custom") NOT NULL DEFAULT "accuracy",
  `results` JSON,
  `error` TEXT,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_usage_logs` (
  `id` INT AUTO_INCREMENT,
  `log_id` VARCHAR(64) NOT NULL,
  `user_id` INT,
  `model_id` VARCHAR(100) NOT NULL,
  `conversation_id` VARCHAR(64),
  `request_type` ENUM("chat", "completion", "embedding", "inference") NOT NULL,
  `input_tokens` INT,
  `output_tokens` INT,
  `latency` INT,
  `status` ENUM("success", "error", "timeout") NOT NULL,
  `error` TEXT,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `device_code` VARCHAR(64),
  `sensor_code` VARCHAR(64),
  `inference_result` JSON,
  `triggered_alert` VARCHAR(255) NOT NULL DEFAULT 0,
  `feedback_status` VARCHAR(32),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `event_logs` (
  `id` INT AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `topic` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `source` VARCHAR(100),
  `node_id` VARCHAR(64),
  `sensor_id` VARCHAR(64),
  `severity` ENUM("info", "warning", "error", "critical") NOT NULL DEFAULT "info",
  `payload` JSON,
  `processed` BOOLEAN NOT NULL DEFAULT FALSE,
  `processed_at` TIMESTAMP,
  `processed_by` VARCHAR(100),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anomaly_detections` (
  `id` INT AUTO_INCREMENT,
  `detection_id` VARCHAR(64) NOT NULL,
  `sensor_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(128),
  `algorithm_type` ENUM("zscore", "iqr", "mad", "isolation_forest", "custom") NOT NULL DEFAULT "zscore",
  `window_size` INT DEFAULT 60,
  `threshold` INT,
  `current_value` INT,
  `expected_value` INT,
  `deviation` INT,
  `score` INT,
  `severity` ENUM("low", "medium", "high", "critical") NOT NULL DEFAULT "low",
  `status` ENUM("open", "acknowledged", "resolved", "false_positive") NOT NULL DEFAULT "open",
  `acknowledged_by` VARCHAR(100),
  `acknowledged_at` TIMESTAMP,
  `resolved_at` TIMESTAMP,
  `notes` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `diagnosis_rules` (
  `id` INT AUTO_INCREMENT,
  `rule_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `category` VARCHAR(50),
  `device_type` VARCHAR(50),
  `sensor_type` VARCHAR(50),
  `condition_expr` TEXT NOT NULL,
  `action_type` ENUM("alert", "notification", "workflow", "auto_fix") NOT NULL DEFAULT "alert",
  `action_config` JSON,
  `severity` ENUM("low", "medium", "high", "critical") NOT NULL DEFAULT "medium",
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `priority` INT DEFAULT 5,
  `trigger_count` INT DEFAULT 0,
  `last_triggered_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 1,
  `rule_version` INT NOT NULL DEFAULT 1,
  `rule_created_by` VARCHAR(64),
  `rule_updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `diagnosis_tasks` (
  `id` INT AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64),
  `sensor_id` VARCHAR(64),
  `rule_id` VARCHAR(64),
  `anomaly_id` VARCHAR(64),
  `task_type` ENUM("routine", "anomaly", "manual", "scheduled") NOT NULL DEFAULT "routine",
  `status` ENUM("pending", "running", "completed", "failed", "cancelled") NOT NULL DEFAULT "pending",
  `priority` INT DEFAULT 5,
  `input_data` JSON,
  `result` JSON,
  `error` TEXT,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_maintenance_records` (
  `id` INT AUTO_INCREMENT,
  `record_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `maintenance_type` ENUM("preventive", "corrective", "predictive", "emergency", "calibration", "inspection") NOT NULL DEFAULT "preventive",
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `scheduled_date` TIMESTAMP,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `status` ENUM("scheduled", "in_progress", "completed", "cancelled", "overdue") NOT NULL DEFAULT "scheduled",
  `priority` ENUM("low", "medium", "high", "critical") NOT NULL DEFAULT "medium",
  `assigned_to` VARCHAR(100),
  `performed_by` VARCHAR(100),
  `cost` DOUBLE,
  `currency` VARCHAR(10) DEFAULT "CNY",
  `parts` JSON,
  `findings` TEXT,
  `recommendations` TEXT,
  `attachments` JSON,
  `next_maintenance_date` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_spare_parts` (
  `id` INT AUTO_INCREMENT,
  `part_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `part_number` VARCHAR(100),
  `category` VARCHAR(50),
  `compatible_device_types` JSON,
  `manufacturer` VARCHAR(100),
  `supplier` VARCHAR(100),
  `quantity` INT NOT NULL DEFAULT 0,
  `min_quantity` INT DEFAULT 1,
  `max_quantity` INT,
  `unit_price` DOUBLE,
  `currency` VARCHAR(10) DEFAULT "CNY",
  `location` VARCHAR(100),
  `status` ENUM("in_stock", "low_stock", "out_of_stock", "ordered", "discontinued") NOT NULL DEFAULT "in_stock",
  `last_restocked_at` TIMESTAMP,
  `expiry_date` TIMESTAMP,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_operation_logs` (
  `id` INT AUTO_INCREMENT,
  `log_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `operation_type` ENUM("start", "stop", "restart", "config_change", "firmware_update", "calibration", "mode_change", "error", "recovery") NOT NULL,
  `previous_state` VARCHAR(50),
  `new_state` VARCHAR(50),
  `operated_by` VARCHAR(100),
  `reason` TEXT,
  `details` JSON,
  `success` BOOLEAN NOT NULL DEFAULT TRUE,
  `error_message` TEXT,
  `duration` INT,
  `timestamp` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_alerts` (
  `id` INT AUTO_INCREMENT,
  `alert_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `sensor_id` VARCHAR(64),
  `alert_type` ENUM("threshold", "anomaly", "offline", "error", "maintenance_due", "warranty_expiry", "custom") NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT,
  `severity` ENUM("info", "warning", "error", "critical") NOT NULL DEFAULT "warning",
  `status` ENUM("active", "acknowledged", "resolved", "suppressed") NOT NULL DEFAULT "active",
  `trigger_value` DOUBLE,
  `threshold_value` DOUBLE,
  `acknowledged_by` VARCHAR(100),
  `acknowledged_at` TIMESTAMP,
  `resolved_by` VARCHAR(100),
  `resolved_at` TIMESTAMP,
  `resolution` TEXT,
  `escalation_level` INT DEFAULT 0,
  `notifications_sent` JSON,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_kpis` (
  `id` INT AUTO_INCREMENT,
  `node_id` VARCHAR(64) NOT NULL,
  `period_type` ENUM("hourly", "daily", "weekly", "monthly") NOT NULL,
  `period_start` TIMESTAMP NOT NULL,
  `period_end` TIMESTAMP NOT NULL,
  `availability` DOUBLE,
  `performance` DOUBLE,
  `quality` DOUBLE,
  `oee` DOUBLE,
  `running_time` INT,
  `downtime` INT,
  `idle_time` INT,
  `planned_downtime` INT,
  `unplanned_downtime` INT,
  `mtbf` DOUBLE,
  `mttr` DOUBLE,
  `failure_count` INT DEFAULT 0,
  `production_count` INT,
  `defect_count` INT,
  `energy_consumption` DOUBLE,
  `energy_efficiency` DOUBLE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_sampling_config` (
  `id` INT AUTO_INCREMENT,
  `node_id` VARCHAR(64) NOT NULL,
  `sensor_type` VARCHAR(50) NOT NULL,
  `base_sampling_rate_ms` INT NOT NULL DEFAULT 1000,
  `current_sampling_rate_ms` INT NOT NULL DEFAULT 1000,
  `min_sampling_rate_ms` INT NOT NULL DEFAULT 100,
  `max_sampling_rate_ms` INT NOT NULL DEFAULT 60000,
  `adaptive_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `last_adjusted_at` TIMESTAMP,
  `adjustment_reason` VARCHAR(200),
  `priority` ENUM("low", "normal", "high", "critical") NOT NULL DEFAULT "normal",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `gateway_id` VARCHAR(64),
  `endpoint` VARCHAR(256),
  `register_map` JSON,
  `preprocessing_rules` JSON,
  `trigger_rules` JSON,
  `compression` VARCHAR(32),
  `storage_strategy` VARCHAR(32),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `idempotent_records` (
  `id` INT AUTO_INCREMENT,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `operation_type` VARCHAR(100) NOT NULL,
  `status` ENUM("processing", "completed", "failed") NOT NULL DEFAULT "processing",
  `request_hash` VARCHAR(64),
  `response` JSON,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_capacity_metrics` (
  `id` INT AUTO_INCREMENT,
  `metric_id` VARCHAR(64) NOT NULL,
  `metric_type` ENUM("kafka_lag", "db_connections", "memory_usage", "cpu_usage", "queue_depth") NOT NULL,
  `component_name` VARCHAR(100) NOT NULL,
  `current_value` DOUBLE NOT NULL,
  `threshold` DOUBLE NOT NULL,
  `status` ENUM("normal", "warning", "critical") NOT NULL DEFAULT "normal",
  `last_checked_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_code_rules` (
  `id` INT AUTO_INCREMENT,
  `rule_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `segments` JSON NOT NULL,
  `current_sequences` JSON NOT NULL,
  `description` TEXT,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_node_templates` (
  `id` INT AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `level` VARCHAR(255) NOT NULL,
  `node_type` VARCHAR(20) NOT NULL,
  `derived_from` VARCHAR(64),
  `code_rule` VARCHAR(64),
  `code_prefix` VARCHAR(30),
  `icon` VARCHAR(50),
  `is_system` VARCHAR(255) NOT NULL DEFAULT 0,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `children` JSON,
  `attributes` JSON,
  `measurement_points` JSON,
  `description` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 1,
  `template_version` INT NOT NULL DEFAULT 1,
  `template_created_by` VARCHAR(64),
  `template_updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_mp_templates` (
  `id` INT AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `measurement_type` VARCHAR(30) NOT NULL,
  `physical_quantity` VARCHAR(50),
  `default_unit` VARCHAR(20),
  `default_sample_rate` INT,
  `default_warning` DOUBLE,
  `default_critical` DOUBLE,
  `sensor_config` JSON,
  `threshold_config` JSON,
  `description` TEXT,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 1,
  `template_version` INT NOT NULL DEFAULT 1,
  `template_created_by` VARCHAR(64),
  `template_updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_nodes` (
  `id` BIGINT AUTO_INCREMENT,
  `node_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `level` VARCHAR(255) NOT NULL,
  `node_type` VARCHAR(20) NOT NULL,
  `parent_node_id` VARCHAR(64),
  `root_node_id` VARCHAR(64) NOT NULL,
  `template_code` VARCHAR(64),
  `status` VARCHAR(20) NOT NULL DEFAULT "unknown",
  `path` TEXT NOT NULL,
  `level_codes` VARCHAR(200),
  `depth` VARCHAR(255) NOT NULL DEFAULT 1,
  `serial_number` VARCHAR(100),
  `location` VARCHAR(255),
  `department` VARCHAR(100),
  `last_heartbeat` VARCHAR(255),
  `install_date` VARCHAR(255),
  `warranty_expiry` VARCHAR(255),
  `attributes` JSON,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  `deleted_at` VARCHAR(255),
  `deleted_by` VARCHAR(64),
  `category_path` VARCHAR(500),
  `maintenance_strategy` VARCHAR(32),
  `commissioned_date` VARCHAR(255),
  `lifecycle_status` VARCHAR(32) NOT NULL DEFAULT "active",
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_measurement_points` (
  `id` BIGINT AUTO_INCREMENT,
  `mp_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(100) NOT NULL,
  `template_code` VARCHAR(64),
  `name` VARCHAR(100) NOT NULL,
  `position` VARCHAR(100),
  `measurement_type` VARCHAR(30) NOT NULL,
  `warning_threshold` DOUBLE,
  `critical_threshold` DOUBLE,
  `threshold_config` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_sensors` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(100) NOT NULL,
  `sensor_id` VARCHAR(64) NOT NULL,
  `mp_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100),
  `channel` VARCHAR(10),
  `sample_rate` INT,
  `physical_quantity` VARCHAR(50),
  `unit` VARCHAR(20),
  `warning_threshold` DOUBLE,
  `critical_threshold` DOUBLE,
  `status` VARCHAR(20) NOT NULL DEFAULT "active",
  `last_value` DOUBLE,
  `last_reading_at` VARCHAR(255),
  `manufacturer` VARCHAR(100),
  `model` VARCHAR(100),
  `serial_number` VARCHAR(100),
  `install_date` VARCHAR(255),
  `calibration_date` VARCHAR(255),
  `file_name_pattern` VARCHAR(255),
  `metadata` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  `mount_direction` VARCHAR(16),
  `sensor_protocol` VARCHAR(32),
  `sampling_rate` INT,
  `data_format` VARCHAR(32),
  `threshold_config` JSON,
  `next_calibration_date` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_label_dimensions` (
  `id` INT AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `dim_type` VARCHAR(20) NOT NULL,
  `is_required` VARCHAR(255) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `allow_sources` JSON,
  `apply_to` JSON,
  `description` TEXT,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_label_options` (
  `id` INT AUTO_INCREMENT,
  `dimension_code` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `parent_code` VARCHAR(64),
  `color` VARCHAR(20),
  `icon` VARCHAR(50),
  `is_normal` VARCHAR(255) NOT NULL DEFAULT 1,
  `sample_priority` VARCHAR(255) NOT NULL DEFAULT 5,
  `sort_order` INT NOT NULL DEFAULT 0,
  `auto_rule` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_slice_rules` (
  `id` INT AUTO_INCREMENT,
  `rule_id` VARCHAR(64) NOT NULL,
  `rule_version` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `device_type` VARCHAR(50),
  `mechanism_type` VARCHAR(50),
  `trigger_type` VARCHAR(30) NOT NULL,
  `trigger_config` JSON NOT NULL,
  `min_duration_sec` INT NOT NULL DEFAULT 5,
  `max_duration_sec` INT NOT NULL DEFAULT 3600,
  `merge_gap_sec` INT NOT NULL DEFAULT 10,
  `auto_labels` JSON,
  `priority` INT NOT NULL DEFAULT 5,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_slices` (
  `id` BIGINT AUTO_INCREMENT,
  `slice_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(100) NOT NULL,
  `node_id` VARCHAR(64),
  `node_path` TEXT,
  `work_condition_code` VARCHAR(64),
  `quality_code` VARCHAR(64),
  `fault_type_code` VARCHAR(64),
  `load_rate` DOUBLE,
  `start_time` VARCHAR(255) NOT NULL,
  `end_time` VARCHAR(255),
  `duration_ms` INT,
  `status` VARCHAR(20) NOT NULL DEFAULT "recording",
  `label_status` VARCHAR(20) NOT NULL DEFAULT "auto_only",
  `label_count_auto` VARCHAR(255) NOT NULL DEFAULT 0,
  `label_count_manual` VARCHAR(255) NOT NULL DEFAULT 0,
  `labels` JSON NOT NULL,
  `sensors` JSON,
  `data_location` JSON,
  `summary` JSON,
  `quality_score` DOUBLE,
  `data_quality` JSON,
  `is_sample` VARCHAR(255) NOT NULL DEFAULT 0,
  `sample_purpose` VARCHAR(20),
  `sample_dataset_id` VARCHAR(64),
  `applied_rule_id` VARCHAR(64),
  `applied_rule_version` INT,
  `notes` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `verified_by` VARCHAR(64),
  `verified_at` VARCHAR(255),
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_slice_label_history` (
  `id` BIGINT AUTO_INCREMENT,
  `slice_id` VARCHAR(64) NOT NULL,
  `dimension_code` VARCHAR(64) NOT NULL,
  `old_value` VARCHAR(255),
  `new_value` VARCHAR(255),
  `old_source` VARCHAR(20),
  `new_source` VARCHAR(20),
  `changed_by` VARCHAR(64) NOT NULL,
  `changed_at` VARCHAR(255) NOT NULL,
  `reason` TEXT,
  `fault_class` VARCHAR(64),
  `confidence` VARCHAR(10),
  `label_source` VARCHAR(32),
  `review_status` VARCHAR(32),
  `reviewer_id` INT,
  `label_data` JSON,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_clean_rules` (
  `id` INT AUTO_INCREMENT,
  `rule_id` VARCHAR(64) NOT NULL,
  `rule_version` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `device_type` VARCHAR(50),
  `sensor_type` VARCHAR(50),
  `measurement_type` VARCHAR(50),
  `rule_type` VARCHAR(30) NOT NULL,
  `detect_config` JSON NOT NULL,
  `action_type` VARCHAR(30) NOT NULL,
  `action_config` JSON,
  `priority` INT NOT NULL DEFAULT 5,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 1,
  `description` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_clean_tasks` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `idempotent_key` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100),
  `device_code` VARCHAR(100),
  `sensor_ids` JSON,
  `time_start` VARCHAR(255) NOT NULL,
  `time_end` VARCHAR(255) NOT NULL,
  `rule_ids` JSON,
  `rule_snapshot` JSON,
  `status` VARCHAR(20) NOT NULL DEFAULT "pending",
  `progress` VARCHAR(255) NOT NULL DEFAULT 0,
  `stats` JSON,
  `started_at` VARCHAR(255),
  `completed_at` TIMESTAMP,
  `error_message` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_clean_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` VARCHAR(64),
  `slice_id` VARCHAR(64),
  `device_code` VARCHAR(100) NOT NULL,
  `sensor_id` VARCHAR(64) NOT NULL,
  `data_time` VARCHAR(255) NOT NULL,
  `rule_id` VARCHAR(64) NOT NULL,
  `rule_version` INT NOT NULL,
  `issue_type` VARCHAR(50) NOT NULL,
  `original_value` DOUBLE,
  `cleaned_value` DOUBLE,
  `action_taken` VARCHAR(50) NOT NULL,
  `is_fixed` VARCHAR(255) NOT NULL DEFAULT 0,
  `context` JSON,
  `created_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_quality_reports` (
  `id` BIGINT AUTO_INCREMENT,
  `report_type` VARCHAR(20) NOT NULL,
  `report_date` VARCHAR(255) NOT NULL,
  `device_code` VARCHAR(100),
  `sensor_id` VARCHAR(64),
  `total_records` BIGINT NOT NULL DEFAULT 0,
  `valid_records` BIGINT NOT NULL DEFAULT 0,
  `completeness` DOUBLE,
  `accuracy` DOUBLE,
  `quality_score` DOUBLE,
  `metrics` JSON NOT NULL,
  `prev_quality_score` DOUBLE,
  `score_change` DOUBLE,
  `created_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sensor_calibrations` (
  `id` INT AUTO_INCREMENT,
  `device_code` VARCHAR(100) NOT NULL,
  `sensor_id` VARCHAR(64) NOT NULL,
  `calibration_date` VARCHAR(255) NOT NULL,
  `calibration_type` VARCHAR(20) NOT NULL,
  `offset_before` DOUBLE,
  `offset_after` DOUBLE,
  `scale_before` DOUBLE,
  `scale_after` DOUBLE,
  `calibration_formula` VARCHAR(255),
  `apply_to_history` VARCHAR(255) NOT NULL DEFAULT 0,
  `history_start_time` VARCHAR(255),
  `status` VARCHAR(20) NOT NULL DEFAULT "pending",
  `applied_at` VARCHAR(255),
  `notes` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_dict_categories` (
  `id` INT AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `is_system` VARCHAR(255) NOT NULL DEFAULT 0,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `base_dict_items` (
  `id` INT AUTO_INCREMENT,
  `category_code` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `value` VARCHAR(255),
  `parent_code` VARCHAR(64),
  `icon` VARCHAR(50),
  `color` VARCHAR(20),
  `metadata` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(64),
  `updated_at` VARCHAR(255) NOT NULL,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sensor_mp_mapping` (
  `id` INT AUTO_INCREMENT,
  `sensor_id` VARCHAR(64) NOT NULL,
  `mp_id` VARCHAR(64) NOT NULL,
  `axis` VARCHAR(8),
  `weight` VARCHAR(10) NOT NULL DEFAULT "1.000",
  `effective_from` TIMESTAMP NOT NULL,
  `effective_to` TIMESTAMP,
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_protocol_config` (
  `id` INT AUTO_INCREMENT,
  `config_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(64) NOT NULL,
  `protocol_type` VARCHAR(32) NOT NULL,
  `connection_params` JSON NOT NULL,
  `register_map` JSON,
  `polling_interval_ms` INT NOT NULL DEFAULT 1000,
  `timeout_ms` INT NOT NULL DEFAULT 3000,
  `retry_count` INT NOT NULL DEFAULT 3,
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `description` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_rule_versions` (
  `id` INT AUTO_INCREMENT,
  `rule_id` VARCHAR(64) NOT NULL,
  `version` INT NOT NULL,
  `rule_config` JSON NOT NULL,
  `change_reason` TEXT,
  `rollback_from` INT,
  `is_current` VARCHAR(255) NOT NULL DEFAULT 0,
  `gray_ratio` VARCHAR(10) NOT NULL DEFAULT "0.00",
  `gray_devices` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "draft",
  `published_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_governance_jobs` (
  `id` BIGINT AUTO_INCREMENT,
  `job_id` VARCHAR(64) NOT NULL,
  `policy_id` INT NOT NULL,
  `job_type` VARCHAR(32) NOT NULL,
  `target_table` VARCHAR(128) NOT NULL,
  `filter_condition` JSON NOT NULL,
  `affected_rows` BIGINT DEFAULT 0,
  `freed_bytes` BIGINT DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT "pending",
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `error_message` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_lineage` (
  `id` BIGINT AUTO_INCREMENT,
  `lineage_id` VARCHAR(64) NOT NULL,
  `source_type` VARCHAR(64) NOT NULL,
  `source_id` VARCHAR(128) NOT NULL,
  `source_detail` JSON,
  `target_type` VARCHAR(64) NOT NULL,
  `target_id` VARCHAR(128) NOT NULL,
  `target_detail` JSON,
  `transform_type` VARCHAR(64) NOT NULL,
  `transform_params` JSON,
  `operator` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_queue_log` (
  `id` BIGINT AUTO_INCREMENT,
  `message_id` VARCHAR(64) NOT NULL,
  `topic` VARCHAR(128) NOT NULL,
  `partition_key` VARCHAR(128),
  `payload` JSON NOT NULL,
  `direction` VARCHAR(16) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT "sent",
  `retry_count` INT NOT NULL DEFAULT 0,
  `error_message` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `async_task_log` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `task_type` VARCHAR(64) NOT NULL,
  `input_params` JSON NOT NULL,
  `output_result` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "pending",
  `progress` VARCHAR(10) NOT NULL DEFAULT "0.00",
  `retry_count` INT NOT NULL DEFAULT 0,
  `max_retries` INT NOT NULL DEFAULT 3,
  `error_message` TEXT,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plugin_registry` (
  `id` INT AUTO_INCREMENT,
  `plugin_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `plugin_type` VARCHAR(32) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `entry_point` VARCHAR(256) NOT NULL,
  `config_schema` JSON,
  `default_config` JSON,
  `capabilities` JSON,
  `dependencies` JSON,
  `author` VARCHAR(128),
  `license` VARCHAR(64),
  `status` VARCHAR(32) NOT NULL DEFAULT "draft",
  `is_builtin` VARCHAR(255) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plugin_instances` (
  `id` INT AUTO_INCREMENT,
  `instance_code` VARCHAR(64) NOT NULL,
  `plugin_id` INT NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `bound_entity_type` VARCHAR(64),
  `bound_entity_id` INT,
  `config` JSON,
  `runtime_state` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "stopped",
  `last_heartbeat_at` TIMESTAMP,
  `error_message` TEXT,
  `started_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plugin_events` (
  `id` BIGINT AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `instance_id` INT NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON,
  `severity` VARCHAR(16) NOT NULL DEFAULT "info",
  `source_plugin` VARCHAR(64),
  `target_plugin` VARCHAR(64),
  `processed` VARCHAR(255) NOT NULL DEFAULT 0,
  `processed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `action` VARCHAR(64) NOT NULL,
  `resource_type` VARCHAR(64) NOT NULL,
  `resource_id` VARCHAR(128) NOT NULL,
  `operator` VARCHAR(64) NOT NULL,
  `operator_ip` VARCHAR(45),
  `old_value` JSON,
  `new_value` JSON,
  `result` VARCHAR(20) NOT NULL DEFAULT "success",
  `error_message` TEXT,
  `duration_ms` INT,
  `trace_id` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs_sensitive` (
  `id` BIGINT AUTO_INCREMENT,
  `audit_log_id` BIGINT NOT NULL,
  `sensitive_type` VARCHAR(64) NOT NULL,
  `sensitive_data` JSON,
  `risk_level` VARCHAR(128) NOT NULL,
  `requires_approval` VARCHAR(255) NOT NULL,
  `approved_by` VARCHAR(64),
  `approved_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_collection_tasks` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` VARCHAR(128) NOT NULL,
  `task_name` VARCHAR(200) NOT NULL,
  `gateway_id` VARCHAR(128) NOT NULL,
  `task_type` VARCHAR(64),
  `sensor_ids` JSON NOT NULL,
  `schedule_config` JSON,
  `sampling_config` JSON,
  `preprocessing_config` JSON,
  `trigger_config` JSON,
  `upload_config` JSON,
  `total_collected` BIGINT,
  `total_uploaded` BIGINT,
  `total_triggered` INT,
  `error_count` INT,
  `last_error` TEXT,
  `last_run_at` TIMESTAMP,
  `status` VARCHAR(64) DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_routing_config` (
  `id` BIGINT AUTO_INCREMENT,
  `route_name` VARCHAR(200) NOT NULL,
  `source_topic` VARCHAR(128) NOT NULL,
  `target_topic` VARCHAR(128) NOT NULL,
  `filter_expr` TEXT,
  `transform_script` TEXT,
  `priority` INT NOT NULL,
  `is_enabled` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_assets` (
  `id` INT AUTO_INCREMENT,
  `asset_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `asset_type` VARCHAR(30) NOT NULL,
  `source_table` VARCHAR(100),
  `owner` VARCHAR(64),
  `department` VARCHAR(100),
  `sensitivity_level` VARCHAR(20) NOT NULL DEFAULT "internal",
  `description` TEXT,
  `tags` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` VARCHAR(255) NOT NULL,
  `idx_da_asset_code` VARCHAR(255),
  `idx_da_type` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_lifecycle_policies` (
  `id` INT AUTO_INCREMENT,
  `policy_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `target_table` VARCHAR(100) NOT NULL,
  `retention_days` INT NOT NULL DEFAULT 365,
  `archive_engine` VARCHAR(30),
  `archive_format` VARCHAR(20),
  `clean_strategy` VARCHAR(30) NOT NULL DEFAULT "soft_delete",
  `cron_expression` VARCHAR(50),
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` VARCHAR(255) NOT NULL,
  `idx_dlp_policy_code` VARCHAR(255),
  `idx_dlp_target` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_collection_metrics` (
  `id` INT AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(64) NOT NULL,
  `metric_date` VARCHAR(255) NOT NULL,
  `total_points` BIGINT NOT NULL DEFAULT 0,
  `success_points` BIGINT NOT NULL DEFAULT 0,
  `error_points` BIGINT NOT NULL DEFAULT 0,
  `avg_latency_ms` DOUBLE,
  `max_latency_ms` DOUBLE,
  `data_volume_bytes` BIGINT NOT NULL DEFAULT 0,
  `sample_rate_hz` INT,
  `created_at` VARCHAR(255) NOT NULL,
  `idx_dcm_task` VARCHAR(255),
  `idx_dcm_date` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `edge_gateways` (
  `id` INT AUTO_INCREMENT,
  `gateway_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `gateway_type` VARCHAR(30) NOT NULL,
  `protocol` VARCHAR(30) NOT NULL,
  `ip_address` VARCHAR(45),
  `port` INT,
  `firmware_version` VARCHAR(30),
  `status` VARCHAR(20) NOT NULL DEFAULT "offline",
  `last_heartbeat` VARCHAR(255),
  `config` JSON,
  `buffer_size_sec` INT NOT NULL DEFAULT 60,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `created_at` VARCHAR(255) NOT NULL,
  `idx_eg_gw_id` VARCHAR(255),
  `idx_eg_status` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `realtime_telemetry` (
  `id` BIGINT AUTO_INCREMENT,
  `gateway_id` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(64) NOT NULL,
  `mp_code` VARCHAR(64) NOT NULL,
  `timestamp` VARCHAR(255) NOT NULL,
  `value` DOUBLE,
  `unit` VARCHAR(20),
  `quality` INT NOT NULL DEFAULT 192,
  `features` JSON,
  `is_anomaly` VARCHAR(255) NOT NULL DEFAULT 0,
  `synced_to_ch` VARCHAR(255) NOT NULL DEFAULT 0,
  `created_at` VARCHAR(255) NOT NULL,
  `idx_rt_gw_dev` VARCHAR(255),
  `idx_rt_ts` VARCHAR(255),
  `idx_rt_sync` VARCHAR(255),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_configs` (
  `id` INT AUTO_INCREMENT,
  `config_key` VARCHAR(128) NOT NULL,
  `config_value` JSON NOT NULL,
  `value_type` VARCHAR(32) NOT NULL DEFAULT "string",
  `category` VARCHAR(64) NOT NULL,
  `environment` VARCHAR(32) NOT NULL DEFAULT "production",
  `description` TEXT,
  `is_sensitive` VARCHAR(255) NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `config_change_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `config_id` INT NOT NULL,
  `config_key` VARCHAR(128) NOT NULL,
  `old_value` JSON,
  `new_value` JSON NOT NULL,
  `old_version` INT,
  `new_version` INT NOT NULL,
  `change_reason` TEXT,
  `changed_by` VARCHAR(64) NOT NULL,
  `changed_at` TIMESTAMP NOT NULL,
  `rollback_to` BIGINT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alert_rules` (
  `id` BIGINT AUTO_INCREMENT,
  `rule_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `device_type` VARCHAR(64) NOT NULL,
  `measurement_type` VARCHAR(64) NOT NULL,
  `severity` VARCHAR(20) NOT NULL DEFAULT "warning",
  `condition` JSON NOT NULL,
  `cooldown_seconds` INT NOT NULL DEFAULT 300,
  `notification_channels` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `priority` INT NOT NULL DEFAULT 0,
  `description` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_export_tasks` (
  `id` BIGINT AUTO_INCREMENT,
  `task_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `export_type` VARCHAR(32) NOT NULL,
  `format` VARCHAR(20) NOT NULL DEFAULT "csv",
  `query_params` JSON NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT "pending",
  `progress` VARCHAR(10) NOT NULL DEFAULT "0",
  `total_rows` BIGINT,
  `file_size` BIGINT,
  `storage_path` VARCHAR(500),
  `download_url` VARCHAR(1000),
  `expires_at` TIMESTAMP,
  `error_message` TEXT,
  `created_by` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` BIGINT AUTO_INCREMENT,
  `task_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `task_type` VARCHAR(32) NOT NULL,
  `cron_expression` VARCHAR(100),
  `interval_seconds` INT,
  `handler` VARCHAR(200) NOT NULL,
  `params` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `last_run_at` TIMESTAMP,
  `last_run_result` VARCHAR(20),
  `next_run_at` TIMESTAMP,
  `retry_count` INT NOT NULL DEFAULT 0,
  `max_retries` INT NOT NULL DEFAULT 3,
  `timeout_seconds` INT NOT NULL DEFAULT 300,
  `description` TEXT,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rollback_triggers` (
  `id` BIGINT AUTO_INCREMENT,
  `trigger_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `target_table` VARCHAR(128) NOT NULL,
  `condition_type` VARCHAR(32) NOT NULL,
  `condition_params` JSON NOT NULL,
  `rollback_action` VARCHAR(32) NOT NULL,
  `action_params` JSON,
  `is_active` VARCHAR(255) NOT NULL DEFAULT 1,
  `last_triggered_at` TIMESTAMP,
  `trigger_count` INT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` VARCHAR(255) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alert_event_log` (
  `id` BIGINT AUTO_INCREMENT,
  `alert_id` VARCHAR(128) NOT NULL,
  `rule_id` BIGINT,
  `device_code` VARCHAR(64) NOT NULL,
  `severity` VARCHAR(128) NOT NULL,
  `alert_type` VARCHAR(64) NOT NULL,
  `message` TEXT NOT NULL,
  `metric_value` DOUBLE,
  `threshold_value` DOUBLE,
  `acknowledged` VARCHAR(255) NOT NULL,
  `acknowledged_by` VARCHAR(64),
  `resolved_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_daily_summary` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `summary_date` VARCHAR(255) NOT NULL,
  `online_hours` DOUBLE,
  `alert_count` INT NOT NULL,
  `data_points` BIGINT NOT NULL,
  `avg_cpu_usage` DOUBLE,
  `avg_memory_usage` DOUBLE,
  `max_temperature` DOUBLE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_firmware_versions` (
  `id` BIGINT AUTO_INCREMENT,
  `device_type` VARCHAR(64) NOT NULL,
  `firmware_version` VARCHAR(64) NOT NULL,
  `release_notes` TEXT,
  `file_url` VARCHAR(500) NOT NULL,
  `file_hash` VARCHAR(128) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `is_mandatory` VARCHAR(255) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `released_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_maintenance_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `maintenance_type` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `operator` VARCHAR(128) NOT NULL,
  `started_at` TIMESTAMP NOT NULL,
  `completed_at` TIMESTAMP,
  `result` VARCHAR(128),
  `cost` DOUBLE,
  `parts_replaced` JSON,
  `attachments` JSON,
  `next_maintenance_date` VARCHAR(255),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_status_log` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `previous_status` VARCHAR(64),
  `current_status` VARCHAR(64) NOT NULL,
  `reason` VARCHAR(128),
  `triggered_by` VARCHAR(64),
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anomaly_models` (
  `id` BIGINT AUTO_INCREMENT,
  `model_code` VARCHAR(64) NOT NULL,
  `model_name` VARCHAR(200) NOT NULL,
  `model_type` VARCHAR(64) NOT NULL,
  `target_metric` VARCHAR(128) NOT NULL,
  `hyperparams` JSON,
  `training_data_range` JSON,
  `accuracy` DOUBLE,
  `model_file_url` VARCHAR(500),
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `deployed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `diagnosis_results` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `device_code` VARCHAR(64) NOT NULL,
  `diagnosis_type` VARCHAR(64) NOT NULL,
  `severity` VARCHAR(128) NOT NULL,
  `fault_code` VARCHAR(64),
  `fault_description` TEXT,
  `confidence` DOUBLE,
  `evidence` JSON,
  `recommendation` TEXT,
  `resolved` VARCHAR(255) NOT NULL DEFAULT 0,
  `resolved_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_clean_results` (
  `id` BIGINT AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `source_table` VARCHAR(128) NOT NULL,
  `source_row_id` BIGINT NOT NULL,
  `field_name` VARCHAR(200) NOT NULL,
  `original_value` TEXT,
  `cleaned_value` TEXT,
  `rule_applied` VARCHAR(128),
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `edge_gateway_config` (
  `id` BIGINT AUTO_INCREMENT,
  `gateway_code` VARCHAR(64) NOT NULL,
  `gateway_name` VARCHAR(200) NOT NULL,
  `gateway_type` VARCHAR(64) NOT NULL,
  `ip_address` VARCHAR(128),
  `port` INT,
  `firmware_version` VARCHAR(64),
  `protocols` JSON,
  `max_devices` INT NOT NULL,
  `heartbeat_interval` INT NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `last_heartbeat` TIMESTAMP,
  `location` VARCHAR(128),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_chunks` (
  `id` BIGINT AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `chunk_index` INT NOT NULL,
  `content` TEXT NOT NULL,
  `token_count` INT,
  `metadata` JSON,
  `embedding_id` BIGINT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_conversation_messages` (
  `id` BIGINT AUTO_INCREMENT,
  `conversation_id` BIGINT NOT NULL,
  `role` VARCHAR(128) NOT NULL,
  `content` TEXT NOT NULL,
  `token_count` INT,
  `sources` JSON,
  `feedback` VARCHAR(255),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_conversations` (
  `id` BIGINT AUTO_INCREMENT,
  `collection_id` BIGINT NOT NULL,
  `title` VARCHAR(200),
  `user_id` VARCHAR(128) NOT NULL,
  `message_count` INT NOT NULL,
  `model_name` VARCHAR(200),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_embeddings` (
  `id` BIGINT AUTO_INCREMENT,
  `chunk_id` BIGINT NOT NULL,
  `model_name` VARCHAR(200) NOT NULL,
  `dimensions` INT NOT NULL,
  `vector_data` VARCHAR(128) NOT NULL,
  `norm` DOUBLE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_qa_pairs` (
  `id` BIGINT AUTO_INCREMENT,
  `collection_id` BIGINT NOT NULL,
  `question` TEXT NOT NULL,
  `answer` TEXT NOT NULL,
  `source_document_id` BIGINT,
  `confidence` DOUBLE,
  `tags` JSON,
  `is_verified` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_deployments` (
  `id` BIGINT AUTO_INCREMENT,
  `model_id` BIGINT NOT NULL,
  `deployment_name` VARCHAR(200) NOT NULL,
  `environment` VARCHAR(128) NOT NULL,
  `endpoint_url` VARCHAR(500),
  `replicas` INT NOT NULL,
  `gpu_type` VARCHAR(64),
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `deployed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_inference_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `deployment_id` BIGINT NOT NULL,
  `request_id` VARCHAR(128) NOT NULL,
  `input_tokens` INT,
  `output_tokens` INT,
  `latency_ms` INT,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `error_message` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_registry` (
  `id` BIGINT AUTO_INCREMENT,
  `model_code` VARCHAR(64) NOT NULL,
  `model_name` VARCHAR(200) NOT NULL,
  `model_type` VARCHAR(64) NOT NULL,
  `framework` VARCHAR(128),
  `version` VARCHAR(64) NOT NULL,
  `description` TEXT,
  `model_file_url` VARCHAR(500),
  `metrics` JSON,
  `tags` JSON,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `model_training_jobs` (
  `id` BIGINT AUTO_INCREMENT,
  `model_id` BIGINT NOT NULL,
  `job_name` VARCHAR(200) NOT NULL,
  `training_data` JSON,
  `hyperparams` JSON,
  `gpu_type` VARCHAR(64),
  `epochs` INT,
  `current_epoch` INT,
  `loss` DOUBLE,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `minio_file_metadata` (
  `id` BIGINT AUTO_INCREMENT,
  `bucket` VARCHAR(128) NOT NULL,
  `object_key` VARCHAR(128) NOT NULL,
  `original_name` VARCHAR(200) NOT NULL,
  `content_type` VARCHAR(64) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `etag` VARCHAR(128),
  `tags` JSON,
  `uploaded_by` VARCHAR(64),
  `expires_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `minio_upload_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `bucket` VARCHAR(128) NOT NULL,
  `object_key` VARCHAR(128) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `upload_duration_ms` INT,
  `status` VARCHAR(64) NOT NULL DEFAULT 'active',
  `error_message` TEXT,
  `uploaded_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `realtime_data_latest` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `mp_code` VARCHAR(64) NOT NULL,
  `value` DOUBLE,
  `string_value` VARCHAR(128),
  `quality` INT NOT NULL DEFAULT 0,
  `source_timestamp` TIMESTAMP NOT NULL,
  `server_timestamp` TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vibration_1hour_agg` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `mp_code` VARCHAR(64) NOT NULL,
  `hour_start` TIMESTAMP NOT NULL,
  `rms_avg` DOUBLE,
  `rms_max` DOUBLE,
  `peak_avg` DOUBLE,
  `peak_max` DOUBLE,
  `kurtosis_avg` DOUBLE,
  `sample_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_alerts` (
  `id` BIGINT AUTO_INCREMENT,
  `node_id` VARCHAR(128) NOT NULL,
  `alert_type` VARCHAR(64) NOT NULL,
  `severity` VARCHAR(128) NOT NULL,
  `message` TEXT NOT NULL,
  `resolved` VARCHAR(255) NOT NULL DEFAULT 0,
  `resolved_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_layers` (
  `id` BIGINT AUTO_INCREMENT,
  `layer_code` VARCHAR(64) NOT NULL,
  `layer_name` VARCHAR(200) NOT NULL,
  `layer_order` INT NOT NULL,
  `color` VARCHAR(32),
  `description` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `topo_snapshots` (
  `id` BIGINT AUTO_INCREMENT,
  `snapshot_name` VARCHAR(200) NOT NULL,
  `snapshot_data` JSON NOT NULL,
  `node_count` INT NOT NULL,
  `edge_count` INT NOT NULL,
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` INT AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `aggregate_type` VARCHAR(100) NOT NULL,
  `aggregate_id` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `metadata` JSON,
  `status` ENUM("pending", "processing", "published", "failed") NOT NULL DEFAULT "pending",
  `retry_count` INT NOT NULL DEFAULT 0,
  `max_retries` INT NOT NULL DEFAULT 3,
  `last_error` TEXT,
  `published_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `outbox_routing_config` (
  `id` INT AUTO_INCREMENT,
  `event_type` VARCHAR(100) NOT NULL,
  `publish_mode` ENUM("cdc", "polling") NOT NULL DEFAULT "cdc",
  `cdc_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `polling_interval_ms` INT,
  `polling_batch_size` INT,
  `requires_processing` BOOLEAN NOT NULL DEFAULT FALSE,
  `processor_class` VARCHAR(200),
  `description` TEXT,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_instances` (
  `id` INT AUTO_INCREMENT,
  `saga_id` VARCHAR(64) NOT NULL,
  `saga_type` VARCHAR(100) NOT NULL,
  `status` ENUM("running", "completed", "failed", "compensating", "compensated", "partial") NOT NULL DEFAULT "running",
  `current_step` INT NOT NULL DEFAULT 0,
  `total_steps` INT NOT NULL,
  `input` JSON,
  `output` JSON,
  `checkpoint` JSON,
  `error` TEXT,
  `started_at` TIMESTAMP NOT NULL,
  `completed_at` TIMESTAMP,
  `timeout_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_steps` (
  `id` INT AUTO_INCREMENT,
  `step_id` VARCHAR(64) NOT NULL,
  `saga_id` VARCHAR(64) NOT NULL,
  `step_index` INT NOT NULL,
  `step_name` VARCHAR(100) NOT NULL,
  `step_type` ENUM("action", "compensation") NOT NULL DEFAULT "action",
  `status` ENUM("pending", "running", "completed", "failed", "skipped", "compensated") NOT NULL DEFAULT "pending",
  `input` JSON,
  `output` JSON,
  `error` TEXT,
  `retry_count` INT NOT NULL DEFAULT 0,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_dead_letters` (
  `id` INT AUTO_INCREMENT,
  `dead_letter_id` VARCHAR(64) NOT NULL,
  `saga_id` VARCHAR(64) NOT NULL,
  `saga_type` VARCHAR(100) NOT NULL,
  `failure_reason` TEXT NOT NULL,
  `failure_type` ENUM("timeout", "max_retries", "compensation_failed", "unknown") NOT NULL,
  `original_input` JSON,
  `last_checkpoint` JSON,
  `retryable` BOOLEAN NOT NULL DEFAULT TRUE,
  `retry_count` INT NOT NULL DEFAULT 0,
  `last_retry_at` TIMESTAMP,
  `resolved_at` TIMESTAMP,
  `resolved_by` VARCHAR(100),
  `resolution` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `processed_events` (
  `id` INT AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `consumer_group` VARCHAR(100) NOT NULL,
  `processed_at` TIMESTAMP NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rollback_executions` (
  `id` INT AUTO_INCREMENT,
  `execution_id` VARCHAR(64) NOT NULL,
  `saga_id` VARCHAR(64),
  `trigger_id` VARCHAR(64) NOT NULL,
  `target_type` ENUM("rule", "model", "config", "firmware") NOT NULL,
  `target_id` VARCHAR(64) NOT NULL,
  `from_version` VARCHAR(50) NOT NULL,
  `to_version` VARCHAR(50) NOT NULL,
  `trigger_reason` TEXT,
  `status` ENUM("pending", "executing", "completed", "failed", "partial", "cancelled") NOT NULL DEFAULT "pending",
  `total_devices` INT,
  `completed_devices` INT DEFAULT 0,
  `failed_devices` INT DEFAULT 0,
  `checkpoint` JSON,
  `result` JSON,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `event_store` (
  `id` BIGINT AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `event_version` VARCHAR(255) NOT NULL DEFAULT 1,
  `aggregate_type` VARCHAR(50) NOT NULL,
  `aggregate_id` VARCHAR(100) NOT NULL,
  `aggregate_version` BIGINT NOT NULL,
  `payload` JSON NOT NULL,
  `metadata` JSON,
  `causation_id` VARCHAR(64),
  `correlation_id` VARCHAR(64),
  `occurred_at` VARCHAR(255) NOT NULL,
  `recorded_at` TIMESTAMP NOT NULL,
  `actor_id` VARCHAR(64),
  `actor_type` VARCHAR(20),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `event_snapshots` (
  `id` BIGINT AUTO_INCREMENT,
  `aggregate_type` VARCHAR(50) NOT NULL,
  `aggregate_id` VARCHAR(100) NOT NULL,
  `aggregate_version` BIGINT NOT NULL,
  `state` JSON NOT NULL,
  `created_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipelines` (
  `id` BIGINT AUTO_INCREMENT,
  `pipeline_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `category` VARCHAR(32) NOT NULL DEFAULT "custom",
  `dag_config` JSON,
  `status` ENUM("draft", "active", "paused", "error", "running", "archived") NOT NULL DEFAULT "draft",
  `node_count` INT DEFAULT 0,
  `connection_count` INT DEFAULT 0,
  `total_runs` INT DEFAULT 0,
  `success_runs` INT DEFAULT 0,
  `failed_runs` INT DEFAULT 0,
  `last_run_at` TIMESTAMP,
  `created_at` VARCHAR(255) NOT NULL,
  `updated_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_runs` (
  `id` BIGINT AUTO_INCREMENT,
  `run_id` VARCHAR(64) NOT NULL,
  `pipeline_id` VARCHAR(64) NOT NULL,
  `status` ENUM("pending", "running", "completed", "failed", "cancelled") NOT NULL DEFAULT "pending",
  `trigger_type` ENUM("manual", "schedule", "api", "event") NOT NULL DEFAULT "manual",
  `started_at` VARCHAR(255),
  `finished_at` VARCHAR(255),
  `duration_ms` INT,
  `total_records_in` INT DEFAULT 0,
  `total_records_out` INT DEFAULT 0,
  `error_count` INT DEFAULT 0,
  `node_results` JSON,
  `lineage_data` JSON,
  `created_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_node_metrics` (
  `id` BIGINT AUTO_INCREMENT,
  `run_id` VARCHAR(64) NOT NULL,
  `pipeline_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `node_name` VARCHAR(128),
  `node_type` VARCHAR(32),
  `node_sub_type` VARCHAR(64),
  `status` VARCHAR(16),
  `records_in` INT DEFAULT 0,
  `records_out` INT DEFAULT 0,
  `duration_ms` INT,
  `error_message` TEXT,
  `created_at` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_graphs` (
  `id` BIGINT AUTO_INCREMENT,
  `graph_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `scenario` VARCHAR(64) NOT NULL DEFAULT "custom",
  `template_id` VARCHAR(64),
  `version` INT NOT NULL DEFAULT 1,
  `status` ENUM("draft", "active", "archived", "evolving") NOT NULL DEFAULT "draft",
  `viewport_config` JSON,
  `node_count` INT DEFAULT 0,
  `edge_count` INT DEFAULT 0,
  `total_diagnosis_runs` INT DEFAULT 0,
  `avg_accuracy` DOUBLE,
  `last_evolved_at` TIMESTAMP,
  `tags` JSON,
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_graph_nodes` (
  `id` BIGINT AUTO_INCREMENT,
  `graph_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `sub_type` VARCHAR(64) NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `x` DOUBLE NOT NULL DEFAULT 0,
  `y` DOUBLE NOT NULL DEFAULT 0,
  `config` JSON,
  `node_status` ENUM("normal", "pending_confirm", "deprecated") NOT NULL DEFAULT "normal",
  `hit_count` INT DEFAULT 0,
  `accuracy` DOUBLE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_graph_edges` (
  `id` BIGINT AUTO_INCREMENT,
  `graph_id` VARCHAR(64) NOT NULL,
  `edge_id` VARCHAR(64) NOT NULL,
  `source_node_id` VARCHAR(64) NOT NULL,
  `target_node_id` VARCHAR(64) NOT NULL,
  `relation_type` VARCHAR(32) NOT NULL,
  `label` VARCHAR(200),
  `weight` DOUBLE NOT NULL DEFAULT 1,
  `config` JSON,
  `path_accuracy` DOUBLE,
  `hit_count` INT DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_diagnosis_runs` (
  `id` BIGINT AUTO_INCREMENT,
  `run_id` VARCHAR(64) NOT NULL,
  `graph_id` VARCHAR(64) NOT NULL,
  `trigger_type` ENUM("manual", "auto", "api", "edge") NOT NULL DEFAULT "manual",
  `input_data` JSON,
  `status` ENUM("running", "completed", "failed", "timeout") NOT NULL DEFAULT "running",
  `result` JSON,
  `inference_path_ids` JSON,
  `inference_depth` INT,
  `duration_ms` INT,
  `feedback` ENUM("correct", "incorrect", "partial", "pending") NOT NULL DEFAULT "pending",
  `feedback_note` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_diagnosis_paths` (
  `id` BIGINT AUTO_INCREMENT,
  `run_id` VARCHAR(64) NOT NULL,
  `graph_id` VARCHAR(64) NOT NULL,
  `path_index` INT NOT NULL,
  `node_sequence` JSON NOT NULL,
  `edge_sequence` JSON NOT NULL,
  `confidence` DOUBLE NOT NULL,
  `conclusion` VARCHAR(500),
  `is_selected` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kg_evolution_log` (
  `id` BIGINT AUTO_INCREMENT,
  `graph_id` VARCHAR(64) NOT NULL,
  `evolution_type` VARCHAR(32) NOT NULL,
  `description` TEXT,
  `changes` JSON,
  `triggered_by` ENUM("system", "diagnosis_feedback", "fleet_sync", "manual") NOT NULL DEFAULT "system",
  `source_device_count` INT,
  `accuracy_before` DOUBLE,
  `accuracy_after` DOUBLE,
  `status` ENUM("applied", "pending_review", "rejected") NOT NULL DEFAULT "pending_review",
  `reviewed_by` VARCHAR(64),
  `reviewed_at` VARCHAR(255),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_connectors` (
  `id` INT AUTO_INCREMENT,
  `connector_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `protocol_type` VARCHAR(32) NOT NULL,
  `connection_params` JSON NOT NULL,
  `auth_config` JSON,
  `health_check_config` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "draft",
  `last_health_check` TIMESTAMP,
  `last_error` TEXT,
  `source_ref` VARCHAR(128),
  `tags` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(64),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_endpoints` (
  `id` INT AUTO_INCREMENT,
  `endpoint_id` VARCHAR(64) NOT NULL,
  `connector_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `resource_path` VARCHAR(500) NOT NULL,
  `resource_type` VARCHAR(32) NOT NULL,
  `data_format` VARCHAR(32) DEFAULT "json",
  `schema_info` JSON,
  `sampling_config` JSON,
  `preprocess_config` JSON,
  `protocol_config_id` VARCHAR(64),
  `sensor_id` VARCHAR(64),
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `discovered_at` TIMESTAMP,
  `metadata` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_bindings` (
  `id` INT AUTO_INCREMENT,
  `binding_id` VARCHAR(64) NOT NULL,
  `endpoint_id` VARCHAR(64) NOT NULL,
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` VARCHAR(128) NOT NULL,
  `direction` VARCHAR(16) NOT NULL DEFAULT "ingest",
  `transform_config` JSON,
  `buffer_config` JSON,
  `status` VARCHAR(32) NOT NULL DEFAULT "active",
  `last_sync_at` TIMESTAMP,
  `sync_stats` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `algorithm_definitions` (
  `id` BIGINT AUTO_INCREMENT,
  `algo_code` VARCHAR(64) NOT NULL,
  `algo_name` VARCHAR(200) NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `subcategory` VARCHAR(64),
  `description` TEXT,
  `impl_type` ENUM("pipeline_node", "plugin", "builtin", "external", "kg_operator") NOT NULL,
  `impl_ref` VARCHAR(200),
  `input_schema` JSON NOT NULL,
  `output_schema` JSON NOT NULL,
  `config_schema` JSON NOT NULL,
  `applicable_device_types` JSON,
  `applicable_measurement_types` JSON,
  `applicable_scenarios` JSON,
  `kg_integration` JSON,
  `version` VARCHAR(32) NOT NULL DEFAULT "v1.0.0",
  `benchmark` JSON,
  `compatible_input_versions` JSON,
  `breaking_change` VARCHAR(255) DEFAULT 0,
  `fleet_learning_config` JSON,
  `license` ENUM("builtin", "community", "enterprise") DEFAULT "builtin",
  `author` VARCHAR(128),
  `documentation_url` VARCHAR(500),
  `tags` JSON,
  `status` ENUM("active", "deprecated", "experimental") DEFAULT "active",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `algorithm_compositions` (
  `id` BIGINT AUTO_INCREMENT,
  `comp_code` VARCHAR(64) NOT NULL,
  `comp_name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `steps` JSON,
  `applicable_device_types` JSON,
  `applicable_scenarios` JSON,
  `version` VARCHAR(32) NOT NULL DEFAULT "v1.0.0",
  `is_template` VARCHAR(255) DEFAULT 0,
  `status` ENUM("active", "deprecated", "draft") DEFAULT "active",
  `created_by` VARCHAR(64),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `algorithm_device_bindings` (
  `id` BIGINT AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL,
  `sensor_code` VARCHAR(64),
  `algo_code` VARCHAR(64) NOT NULL,
  `binding_type` ENUM("algorithm", "composition") NOT NULL,
  `config_overrides` JSON,
  `schedule` JSON,
  `output_routing` JSON,
  `status` ENUM("active", "paused", "error") DEFAULT "active",
  `last_run_at` TIMESTAMP,
  `last_run_status` VARCHAR(32),
  `error_message` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `algorithm_executions` (
  `id` BIGINT AUTO_INCREMENT,
  `execution_id` VARCHAR(64) NOT NULL,
  `binding_id` BIGINT,
  `algo_code` VARCHAR(64) NOT NULL,
  `device_code` VARCHAR(64),
  `input_summary` JSON,
  `config_used` JSON,
  `output_summary` JSON,
  `started_at` TIMESTAMP,
  `completed_at` TIMESTAMP,
  `duration_ms` INT,
  `records_processed` INT,
  `memory_used_mb` DOUBLE,
  `status` ENUM("running", "success", "failed", "timeout") NOT NULL,
  `error_message` TEXT,
  `routing_status` JSON,
  `ab_group` VARCHAR(16),
  `algo_version` VARCHAR(32),
  `quality_metrics` JSON,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `algorithm_routing_rules` (
  `id` BIGINT AUTO_INCREMENT,
  `binding_id` BIGINT NOT NULL,
  `rule_name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `priority` INT NOT NULL DEFAULT 100,
  `condition` TEXT NOT NULL,
  `targets` JSON NOT NULL,
  `cascade_algos` JSON,
  `stop_on_match` VARCHAR(255) DEFAULT 1,
  `status` ENUM("active", "disabled") DEFAULT "active",
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 共生成 121 张表

SET FOREIGN_KEY_CHECKS = 1;
