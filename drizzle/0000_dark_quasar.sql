CREATE TABLE `alert_event_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`alert_id` varchar(128) NOT NULL,
	`rule_id` bigint,
	`device_code` varchar(64) NOT NULL,
	`severity` varchar(128) NOT NULL,
	`alert_type` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`metric_value` double,
	`threshold_value` double,
	`acknowledged` tinyint NOT NULL,
	`acknowledged_by` varchar(64),
	`resolved_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_event_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`rule_code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`device_type` varchar(64) NOT NULL,
	`measurement_type` varchar(64) NOT NULL,
	`severity` varchar(20) NOT NULL DEFAULT 'warning',
	`condition` json NOT NULL,
	`cooldown_seconds` int NOT NULL DEFAULT 300,
	`notification_channels` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`description` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `alert_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_rules_rule_code_unique` UNIQUE(`rule_code`)
);
--> statement-breakpoint
CREATE TABLE `algorithm_compositions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`comp_code` varchar(64) NOT NULL,
	`comp_name` varchar(200) NOT NULL,
	`description` text,
	`steps` json NOT NULL,
	`applicable_device_types` json,
	`applicable_scenarios` json,
	`version` varchar(32) NOT NULL DEFAULT 'v1.0.0',
	`is_template` tinyint DEFAULT 0,
	`status` enum('active','deprecated','draft') DEFAULT 'active',
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `algorithm_compositions_id` PRIMARY KEY(`id`),
	CONSTRAINT `algorithm_compositions_comp_code_unique` UNIQUE(`comp_code`)
);
--> statement-breakpoint
CREATE TABLE `algorithm_definitions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`algo_code` varchar(64) NOT NULL,
	`algo_name` varchar(200) NOT NULL,
	`category` varchar(64) NOT NULL,
	`subcategory` varchar(64),
	`description` text,
	`impl_type` enum('pipeline_node','plugin','builtin','external','kg_operator') NOT NULL,
	`impl_ref` varchar(200),
	`input_schema` json NOT NULL,
	`output_schema` json NOT NULL,
	`config_schema` json NOT NULL,
	`applicable_device_types` json,
	`applicable_measurement_types` json,
	`applicable_scenarios` json,
	`kg_integration` json,
	`version` varchar(32) NOT NULL DEFAULT 'v1.0.0',
	`benchmark` json,
	`compatible_input_versions` json,
	`breaking_change` tinyint DEFAULT 0,
	`fleet_learning_config` json,
	`license` enum('builtin','community','enterprise') DEFAULT 'builtin',
	`author` varchar(128),
	`documentation_url` varchar(500),
	`tags` json,
	`status` enum('active','deprecated','experimental') DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `algorithm_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `algorithm_definitions_algo_code_unique` UNIQUE(`algo_code`)
);
--> statement-breakpoint
CREATE TABLE `algorithm_device_bindings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`sensor_code` varchar(64),
	`algo_code` varchar(64) NOT NULL,
	`binding_type` enum('algorithm','composition') NOT NULL,
	`config_overrides` json,
	`schedule` json,
	`output_routing` json,
	`status` enum('active','paused','error') DEFAULT 'active',
	`last_run_at` timestamp(3),
	`last_run_status` varchar(32),
	`error_message` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `algorithm_device_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_adb_unique` UNIQUE(`device_code`,`sensor_code`,`algo_code`)
);
--> statement-breakpoint
CREATE TABLE `algorithm_executions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`execution_id` varchar(64) NOT NULL,
	`binding_id` bigint,
	`algo_code` varchar(64) NOT NULL,
	`device_code` varchar(64),
	`input_summary` json,
	`config_used` json,
	`output_summary` json,
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`duration_ms` int,
	`records_processed` int,
	`memory_used_mb` double,
	`status` enum('running','success','failed','timeout') NOT NULL,
	`error_message` text,
	`routing_status` json,
	`ab_group` varchar(16),
	`algo_version` varchar(32),
	`quality_metrics` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `algorithm_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `algorithm_executions_execution_id_unique` UNIQUE(`execution_id`)
);
--> statement-breakpoint
CREATE TABLE `algorithm_routing_rules` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`binding_id` bigint NOT NULL,
	`rule_name` varchar(200) NOT NULL,
	`description` text,
	`priority` int NOT NULL DEFAULT 100,
	`condition` text NOT NULL,
	`targets` json NOT NULL,
	`cascade_algos` json,
	`stop_on_match` tinyint DEFAULT 1,
	`status` enum('active','disabled') DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `algorithm_routing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anomaly_detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`detection_id` varchar(64) NOT NULL,
	`sensor_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`device_code` varchar(128),
	`algorithm_type` enum('zscore','iqr','mad','isolation_forest','custom') NOT NULL DEFAULT 'zscore',
	`window_size` int DEFAULT 60,
	`threshold` int,
	`current_value` int,
	`expected_value` int,
	`deviation` int,
	`score` int,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`status` enum('open','acknowledged','resolved','false_positive') NOT NULL DEFAULT 'open',
	`acknowledged_by` varchar(100),
	`acknowledged_at` timestamp,
	`resolved_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anomaly_detections_id` PRIMARY KEY(`id`),
	CONSTRAINT `anomaly_detections_detection_id_unique` UNIQUE(`detection_id`)
);
--> statement-breakpoint
CREATE TABLE `anomaly_models` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`model_code` varchar(64) NOT NULL,
	`model_name` varchar(200) NOT NULL,
	`model_type` varchar(64) NOT NULL,
	`target_metric` varchar(128) NOT NULL,
	`hyperparams` json,
	`training_data_range` json,
	`accuracy` double,
	`model_file_url` varchar(500),
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`deployed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `anomaly_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_measurement_points` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`mp_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`device_code` varchar(100) NOT NULL,
	`template_code` varchar(64),
	`name` varchar(100) NOT NULL,
	`position` varchar(100),
	`measurement_type` varchar(30) NOT NULL,
	`warning_threshold` double,
	`critical_threshold` double,
	`threshold_config` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `asset_measurement_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `asset_measurement_points_mp_id_unique` UNIQUE(`mp_id`)
);
--> statement-breakpoint
CREATE TABLE `asset_nodes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(200) NOT NULL,
	`level` tinyint NOT NULL,
	`node_type` varchar(20) NOT NULL,
	`parent_node_id` varchar(64),
	`root_node_id` varchar(64) NOT NULL,
	`template_code` varchar(64),
	`status` varchar(20) NOT NULL DEFAULT 'unknown',
	`path` text NOT NULL,
	`level_codes` varchar(200),
	`depth` tinyint NOT NULL DEFAULT 1,
	`serial_number` varchar(100),
	`location` varchar(255),
	`department` varchar(100),
	`last_heartbeat` datetime(3),
	`install_date` date,
	`warranty_expiry` date,
	`attributes` json,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	`deleted_at` datetime(3),
	`deleted_by` varchar(64),
	`category_path` varchar(500),
	`maintenance_strategy` varchar(32),
	`commissioned_date` date,
	`lifecycle_status` varchar(32) NOT NULL DEFAULT 'active',
	CONSTRAINT `asset_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `asset_nodes_node_id_unique` UNIQUE(`node_id`),
	CONSTRAINT `asset_nodes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `asset_sensors` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(100) NOT NULL,
	`sensor_id` varchar(64) NOT NULL,
	`mp_id` varchar(64) NOT NULL,
	`name` varchar(100),
	`channel` varchar(10),
	`sample_rate` int,
	`physical_quantity` varchar(50),
	`unit` varchar(20),
	`warning_threshold` double,
	`critical_threshold` double,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`last_value` double,
	`last_reading_at` datetime(3),
	`manufacturer` varchar(100),
	`model` varchar(100),
	`serial_number` varchar(100),
	`install_date` date,
	`calibration_date` date,
	`file_name_pattern` varchar(255),
	`metadata` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	`mount_direction` varchar(16),
	`sensor_protocol` varchar(32),
	`sampling_rate` int,
	`data_format` varchar(32),
	`threshold_config` json,
	`next_calibration_date` date,
	CONSTRAINT `asset_sensors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `async_task_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64) NOT NULL,
	`task_type` varchar(64) NOT NULL,
	`input_params` json NOT NULL,
	`output_result` json,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`progress` varchar(10) NOT NULL DEFAULT '0.00',
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`error_message` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	CONSTRAINT `async_task_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `async_task_log_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`action` varchar(64) NOT NULL,
	`resource_type` varchar(64) NOT NULL,
	`resource_id` varchar(128) NOT NULL,
	`operator` varchar(64) NOT NULL,
	`operator_ip` varchar(45),
	`old_value` json,
	`new_value` json,
	`result` varchar(20) NOT NULL DEFAULT 'success',
	`error_message` text,
	`duration_ms` int,
	`trace_id` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs_sensitive` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`audit_log_id` bigint NOT NULL,
	`sensitive_type` varchar(64) NOT NULL,
	`sensitive_data` json,
	`risk_level` varchar(128) NOT NULL,
	`requires_approval` tinyint NOT NULL,
	`approved_by` varchar(64),
	`approved_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_sensitive_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `base_clean_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` varchar(64) NOT NULL,
	`rule_version` int NOT NULL DEFAULT 1,
	`name` varchar(100) NOT NULL,
	`device_type` varchar(50),
	`sensor_type` varchar(50),
	`measurement_type` varchar(50),
	`rule_type` varchar(30) NOT NULL,
	`detect_config` json NOT NULL,
	`action_type` varchar(30) NOT NULL,
	`action_config` json,
	`priority` int NOT NULL DEFAULT 5,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`is_current` tinyint NOT NULL DEFAULT 1,
	`description` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_clean_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `base_code_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`segments` json NOT NULL,
	`current_sequences` json NOT NULL,
	`description` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_code_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `base_code_rules_rule_code_unique` UNIQUE(`rule_code`)
);
--> statement-breakpoint
CREATE TABLE `base_dict_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`is_system` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_dict_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `base_dict_categories_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `base_dict_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_code` varchar(64) NOT NULL,
	`code` varchar(64) NOT NULL,
	`label` varchar(100) NOT NULL,
	`value` varchar(255),
	`parent_code` varchar(64),
	`icon` varchar(50),
	`color` varchar(20),
	`metadata` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_dict_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `base_label_dimensions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`dim_type` varchar(20) NOT NULL,
	`is_required` tinyint NOT NULL DEFAULT 0,
	`sort_order` int NOT NULL DEFAULT 0,
	`allow_sources` json,
	`apply_to` json,
	`description` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_label_dimensions_id` PRIMARY KEY(`id`),
	CONSTRAINT `base_label_dimensions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `base_label_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dimension_code` varchar(64) NOT NULL,
	`code` varchar(64) NOT NULL,
	`label` varchar(100) NOT NULL,
	`parent_code` varchar(64),
	`color` varchar(20),
	`icon` varchar(50),
	`is_normal` tinyint NOT NULL DEFAULT 1,
	`sample_priority` tinyint NOT NULL DEFAULT 5,
	`sort_order` int NOT NULL DEFAULT 0,
	`auto_rule` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_label_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `base_mp_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`measurement_type` varchar(30) NOT NULL,
	`physical_quantity` varchar(50),
	`default_unit` varchar(20),
	`default_sample_rate` int,
	`default_warning` double,
	`default_critical` double,
	`sensor_config` json,
	`threshold_config` json,
	`description` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	`is_current` tinyint NOT NULL DEFAULT 1,
	`template_version` int NOT NULL DEFAULT 1,
	`template_created_by` varchar(64),
	`template_updated_by` varchar(64),
	CONSTRAINT `base_mp_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `base_mp_templates_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `base_node_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`level` tinyint NOT NULL,
	`node_type` varchar(20) NOT NULL,
	`derived_from` varchar(64),
	`code_rule` varchar(64),
	`code_prefix` varchar(30),
	`icon` varchar(50),
	`is_system` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`children` json,
	`attributes` json,
	`measurement_points` json,
	`description` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	`is_current` tinyint NOT NULL DEFAULT 1,
	`template_version` int NOT NULL DEFAULT 1,
	`template_created_by` varchar(64),
	`template_updated_by` varchar(64),
	CONSTRAINT `base_node_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `base_node_templates_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `base_slice_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` varchar(64) NOT NULL,
	`rule_version` int NOT NULL DEFAULT 1,
	`name` varchar(100) NOT NULL,
	`device_type` varchar(50),
	`mechanism_type` varchar(50),
	`trigger_type` varchar(30) NOT NULL,
	`trigger_config` json NOT NULL,
	`min_duration_sec` int NOT NULL DEFAULT 5,
	`max_duration_sec` int NOT NULL DEFAULT 3600,
	`merge_gap_sec` int NOT NULL DEFAULT 10,
	`auto_labels` json,
	`priority` int NOT NULL DEFAULT 5,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`is_current` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `base_slice_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_change_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`config_id` int NOT NULL,
	`config_key` varchar(128) NOT NULL,
	`old_value` json,
	`new_value` json NOT NULL,
	`old_version` int,
	`new_version` int NOT NULL,
	`change_reason` text,
	`changed_by` varchar(64) NOT NULL,
	`changed_at` timestamp(3) NOT NULL DEFAULT (now()),
	`rollback_to` bigint,
	CONSTRAINT `config_change_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asset_code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`asset_type` varchar(30) NOT NULL,
	`source_table` varchar(100),
	`owner` varchar(64),
	`department` varchar(100),
	`sensitivity_level` varchar(20) NOT NULL DEFAULT 'internal',
	`description` text,
	`tags` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_assets_asset_code_unique` UNIQUE(`asset_code`)
);
--> statement-breakpoint
CREATE TABLE `data_bindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`binding_id` varchar(64) NOT NULL,
	`endpoint_id` varchar(64) NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` varchar(128) NOT NULL,
	`direction` varchar(16) NOT NULL DEFAULT 'ingest',
	`transform_config` json,
	`buffer_config` json,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`last_sync_at` timestamp(3),
	`sync_stats` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_bindings_binding_id_unique` UNIQUE(`binding_id`)
);
--> statement-breakpoint
CREATE TABLE `data_clean_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64),
	`slice_id` varchar(64),
	`device_code` varchar(100) NOT NULL,
	`sensor_id` varchar(64) NOT NULL,
	`data_time` datetime(3) NOT NULL,
	`rule_id` varchar(64) NOT NULL,
	`rule_version` int NOT NULL,
	`issue_type` varchar(50) NOT NULL,
	`original_value` double,
	`cleaned_value` double,
	`action_taken` varchar(50) NOT NULL,
	`is_fixed` tinyint NOT NULL DEFAULT 0,
	`context` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `data_clean_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_clean_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` bigint NOT NULL,
	`source_table` varchar(128) NOT NULL,
	`source_row_id` bigint NOT NULL,
	`field_name` varchar(200) NOT NULL,
	`original_value` text,
	`cleaned_value` text,
	`rule_applied` varchar(128),
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_clean_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_clean_tasks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64) NOT NULL,
	`idempotent_key` varchar(64) NOT NULL,
	`name` varchar(100),
	`device_code` varchar(100),
	`sensor_ids` json,
	`time_start` datetime(3) NOT NULL,
	`time_end` datetime(3) NOT NULL,
	`rule_ids` json,
	`rule_snapshot` json,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`progress` tinyint NOT NULL DEFAULT 0,
	`stats` json,
	`started_at` datetime(3),
	`completed_at` timestamp,
	`error_message` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `data_clean_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_clean_tasks_task_id_unique` UNIQUE(`task_id`),
	CONSTRAINT `data_clean_tasks_idempotent_key_unique` UNIQUE(`idempotent_key`)
);
--> statement-breakpoint
CREATE TABLE `data_collection_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64) NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`metric_date` date NOT NULL,
	`total_points` bigint NOT NULL DEFAULT 0,
	`success_points` bigint NOT NULL DEFAULT 0,
	`error_points` bigint NOT NULL DEFAULT 0,
	`avg_latency_ms` double,
	`max_latency_ms` double,
	`data_volume_bytes` bigint NOT NULL DEFAULT 0,
	`sample_rate_hz` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_collection_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_collection_tasks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` varchar(128) NOT NULL,
	`task_name` varchar(200) NOT NULL,
	`gateway_id` varchar(128) NOT NULL,
	`task_type` varchar(64),
	`sensor_ids` json NOT NULL,
	`schedule_config` json,
	`sampling_config` json,
	`preprocessing_config` json,
	`trigger_config` json,
	`upload_config` json,
	`total_collected` bigint,
	`total_uploaded` bigint,
	`total_triggered` int,
	`error_count` int,
	`last_error` text,
	`last_run_at` timestamp(3),
	`status` varchar(64) DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_collection_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_connectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connector_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`protocol_type` varchar(32) NOT NULL,
	`connection_params` json NOT NULL,
	`auth_config` json,
	`health_check_config` json,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`last_health_check` timestamp(3),
	`last_error` text,
	`source_ref` varchar(128),
	`tags` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_connectors_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_connectors_connector_id_unique` UNIQUE(`connector_id`)
);
--> statement-breakpoint
CREATE TABLE `data_endpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpoint_id` varchar(64) NOT NULL,
	`connector_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`resource_path` varchar(500) NOT NULL,
	`resource_type` varchar(32) NOT NULL,
	`data_format` varchar(32) DEFAULT 'json',
	`schema_info` json,
	`sampling_config` json,
	`preprocess_config` json,
	`protocol_config_id` varchar(64),
	`sensor_id` varchar(64),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`discovered_at` timestamp(3),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_endpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_endpoints_endpoint_id_unique` UNIQUE(`endpoint_id`)
);
--> statement-breakpoint
CREATE TABLE `data_export_tasks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`export_type` varchar(32) NOT NULL,
	`format` varchar(20) NOT NULL DEFAULT 'csv',
	`query_params` json NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`progress` varchar(10) NOT NULL DEFAULT '0',
	`total_rows` bigint,
	`file_size` bigint,
	`storage_path` varchar(500),
	`download_url` varchar(1000),
	`expires_at` timestamp,
	`error_message` text,
	`created_by` varchar(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`completed_at` timestamp(3),
	CONSTRAINT `data_export_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_export_tasks_task_code_unique` UNIQUE(`task_code`)
);
--> statement-breakpoint
CREATE TABLE `data_governance_jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`job_id` varchar(64) NOT NULL,
	`policy_id` int NOT NULL,
	`job_type` varchar(32) NOT NULL,
	`target_table` varchar(128) NOT NULL,
	`filter_condition` json NOT NULL,
	`affected_rows` bigint DEFAULT 0,
	`freed_bytes` bigint DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`started_at` timestamp,
	`completed_at` timestamp,
	`error_message` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_governance_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_governance_jobs_job_id_unique` UNIQUE(`job_id`)
);
--> statement-breakpoint
CREATE TABLE `data_lifecycle_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_code` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`target_table` varchar(100) NOT NULL,
	`retention_days` int NOT NULL DEFAULT 365,
	`archive_engine` varchar(30),
	`archive_format` varchar(20),
	`clean_strategy` varchar(30) NOT NULL DEFAULT 'soft_delete',
	`cron_expression` varchar(50),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_lifecycle_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_lifecycle_policies_policy_code_unique` UNIQUE(`policy_code`)
);
--> statement-breakpoint
CREATE TABLE `data_lineage` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`lineage_id` varchar(64) NOT NULL,
	`source_type` varchar(64) NOT NULL,
	`source_id` varchar(128) NOT NULL,
	`source_detail` json,
	`target_type` varchar(64) NOT NULL,
	`target_id` varchar(128) NOT NULL,
	`target_detail` json,
	`transform_type` varchar(64) NOT NULL,
	`transform_params` json,
	`operator` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `data_lineage_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_lineage_lineage_id_unique` UNIQUE(`lineage_id`)
);
--> statement-breakpoint
CREATE TABLE `data_quality_reports` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`report_type` varchar(20) NOT NULL,
	`report_date` date NOT NULL,
	`device_code` varchar(100),
	`sensor_id` varchar(64),
	`total_records` bigint NOT NULL DEFAULT 0,
	`valid_records` bigint NOT NULL DEFAULT 0,
	`completeness` double,
	`accuracy` double,
	`quality_score` double,
	`metrics` json NOT NULL,
	`prev_quality_score` double,
	`score_change` double,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `data_quality_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_slice_label_history` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`slice_id` varchar(64) NOT NULL,
	`dimension_code` varchar(64) NOT NULL,
	`old_value` varchar(255),
	`new_value` varchar(255),
	`old_source` varchar(20),
	`new_source` varchar(20),
	`changed_by` varchar(64) NOT NULL,
	`changed_at` datetime(3) NOT NULL,
	`reason` text,
	`fault_class` varchar(64),
	`confidence` varchar(10),
	`label_source` varchar(32),
	`review_status` varchar(32),
	`reviewer_id` int,
	`label_data` json,
	CONSTRAINT `data_slice_label_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_slices` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`slice_id` varchar(64) NOT NULL,
	`device_code` varchar(100) NOT NULL,
	`node_id` varchar(64),
	`node_path` text,
	`work_condition_code` varchar(64),
	`quality_code` varchar(64),
	`fault_type_code` varchar(64),
	`load_rate` double,
	`start_time` datetime(3) NOT NULL,
	`end_time` datetime(3),
	`duration_ms` int,
	`status` varchar(20) NOT NULL DEFAULT 'recording',
	`label_status` varchar(20) NOT NULL DEFAULT 'auto_only',
	`label_count_auto` smallint NOT NULL DEFAULT 0,
	`label_count_manual` smallint NOT NULL DEFAULT 0,
	`labels` json NOT NULL,
	`sensors` json,
	`data_location` json,
	`summary` json,
	`quality_score` double,
	`data_quality` json,
	`is_sample` tinyint NOT NULL DEFAULT 0,
	`sample_purpose` varchar(20),
	`sample_dataset_id` varchar(64),
	`applied_rule_id` varchar(64),
	`applied_rule_version` int,
	`notes` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	`verified_by` varchar(64),
	`verified_at` datetime(3),
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `data_slices_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_slices_slice_id_unique` UNIQUE(`slice_id`)
);
--> statement-breakpoint
CREATE TABLE `device_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alert_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`sensor_id` varchar(64),
	`alert_type` enum('threshold','anomaly','offline','error','maintenance_due','warranty_expiry','custom') NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text,
	`severity` enum('info','warning','error','critical') NOT NULL DEFAULT 'warning',
	`status` enum('active','acknowledged','resolved','suppressed') NOT NULL DEFAULT 'active',
	`trigger_value` double,
	`threshold_value` double,
	`acknowledged_by` varchar(100),
	`acknowledged_at` timestamp,
	`resolved_by` varchar(100),
	`resolved_at` timestamp,
	`resolution` text,
	`escalation_level` int DEFAULT 0,
	`notifications_sent` json,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_alerts_alert_id_unique` UNIQUE(`alert_id`)
);
--> statement-breakpoint
CREATE TABLE `device_daily_summary` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`summary_date` date NOT NULL,
	`online_hours` double,
	`alert_count` int NOT NULL,
	`data_points` bigint NOT NULL,
	`avg_cpu_usage` double,
	`avg_memory_usage` double,
	`max_temperature` double,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `device_daily_summary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_firmware_versions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_type` varchar(64) NOT NULL,
	`firmware_version` varchar(64) NOT NULL,
	`release_notes` text,
	`file_url` varchar(500) NOT NULL,
	`file_hash` varchar(128) NOT NULL,
	`file_size` bigint NOT NULL,
	`is_mandatory` tinyint NOT NULL,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`released_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `device_firmware_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`period_type` enum('hourly','daily','weekly','monthly') NOT NULL,
	`period_start` timestamp NOT NULL,
	`period_end` timestamp NOT NULL,
	`availability` double,
	`performance` double,
	`quality` double,
	`oee` double,
	`running_time` int,
	`downtime` int,
	`idle_time` int,
	`planned_downtime` int,
	`unplanned_downtime` int,
	`mtbf` double,
	`mttr` double,
	`failure_count` int DEFAULT 0,
	`production_count` int,
	`defect_count` int,
	`energy_consumption` double,
	`energy_efficiency` double,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_kpis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_maintenance_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`maintenance_type` varchar(64) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`operator` varchar(128) NOT NULL,
	`started_at` timestamp(3) NOT NULL,
	`completed_at` timestamp(3),
	`result` varchar(128),
	`cost` double,
	`parts_replaced` json,
	`attachments` json,
	`next_maintenance_date` date,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `device_maintenance_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_maintenance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`record_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`maintenance_type` enum('preventive','corrective','predictive','emergency','calibration','inspection') NOT NULL DEFAULT 'preventive',
	`title` varchar(200) NOT NULL,
	`description` text,
	`scheduled_date` timestamp,
	`started_at` timestamp,
	`completed_at` timestamp,
	`status` enum('scheduled','in_progress','completed','cancelled','overdue') NOT NULL DEFAULT 'scheduled',
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`assigned_to` varchar(100),
	`performed_by` varchar(100),
	`cost` double,
	`currency` varchar(10) DEFAULT 'CNY',
	`parts` json,
	`findings` text,
	`recommendations` text,
	`attachments` json,
	`next_maintenance_date` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_maintenance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_maintenance_records_record_id_unique` UNIQUE(`record_id`)
);
--> statement-breakpoint
CREATE TABLE `device_operation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`log_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`operation_type` enum('start','stop','restart','config_change','firmware_update','calibration','mode_change','error','recovery') NOT NULL,
	`previous_state` varchar(50),
	`new_state` varchar(50),
	`operated_by` varchar(100),
	`reason` text,
	`details` json,
	`success` boolean NOT NULL DEFAULT true,
	`error_message` text,
	`duration` int,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_operation_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_operation_logs_log_id_unique` UNIQUE(`log_id`)
);
--> statement-breakpoint
CREATE TABLE `device_protocol_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_id` varchar(64) NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`protocol_type` varchar(32) NOT NULL,
	`connection_params` json NOT NULL,
	`register_map` json,
	`polling_interval_ms` int NOT NULL DEFAULT 1000,
	`timeout_ms` int NOT NULL DEFAULT 3000,
	`retry_count` int NOT NULL DEFAULT 3,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`description` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_by` varchar(64),
	CONSTRAINT `device_protocol_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_protocol_config_config_id_unique` UNIQUE(`config_id`)
);
--> statement-breakpoint
CREATE TABLE `device_rule_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`rule_config` json NOT NULL,
	`change_reason` text,
	`rollback_from` int,
	`is_current` tinyint NOT NULL DEFAULT 0,
	`gray_ratio` varchar(10) NOT NULL DEFAULT '0.00',
	`gray_devices` json,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`published_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	CONSTRAINT `device_rule_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_sampling_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`sensor_type` varchar(50) NOT NULL,
	`base_sampling_rate_ms` int NOT NULL DEFAULT 1000,
	`current_sampling_rate_ms` int NOT NULL DEFAULT 1000,
	`min_sampling_rate_ms` int NOT NULL DEFAULT 100,
	`max_sampling_rate_ms` int NOT NULL DEFAULT 60000,
	`adaptive_enabled` boolean NOT NULL DEFAULT true,
	`last_adjusted_at` timestamp,
	`adjustment_reason` varchar(200),
	`priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`gateway_id` varchar(64),
	`endpoint` varchar(256),
	`register_map` json,
	`preprocessing_rules` json,
	`trigger_rules` json,
	`compression` varchar(32),
	`storage_strategy` varchar(32),
	CONSTRAINT `device_sampling_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_spare_parts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`part_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`part_number` varchar(100),
	`category` varchar(50),
	`compatible_device_types` json,
	`manufacturer` varchar(100),
	`supplier` varchar(100),
	`quantity` int NOT NULL DEFAULT 0,
	`min_quantity` int DEFAULT 1,
	`max_quantity` int,
	`unit_price` double,
	`currency` varchar(10) DEFAULT 'CNY',
	`location` varchar(100),
	`status` enum('in_stock','low_stock','out_of_stock','ordered','discontinued') NOT NULL DEFAULT 'in_stock',
	`last_restocked_at` timestamp,
	`expiry_date` timestamp,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_spare_parts_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_spare_parts_part_id_unique` UNIQUE(`part_id`)
);
--> statement-breakpoint
CREATE TABLE `device_status_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`previous_status` varchar(64),
	`current_status` varchar(64) NOT NULL,
	`reason` varchar(128),
	`triggered_by` varchar(64),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `device_status_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_id` bigint NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`diagnosis_type` varchar(64) NOT NULL,
	`severity` varchar(128) NOT NULL,
	`fault_code` varchar(64),
	`fault_description` text,
	`confidence` double,
	`evidence` json,
	`recommendation` text,
	`resolved` tinyint NOT NULL DEFAULT 0,
	`resolved_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `diagnosis_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`category` varchar(50),
	`device_type` varchar(50),
	`sensor_type` varchar(50),
	`condition_expr` text NOT NULL,
	`action_type` enum('alert','notification','workflow','auto_fix') NOT NULL DEFAULT 'alert',
	`action_config` json,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`is_active` boolean NOT NULL DEFAULT true,
	`priority` int DEFAULT 5,
	`trigger_count` int DEFAULT 0,
	`last_triggered_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_current` tinyint NOT NULL DEFAULT 1,
	`rule_version` int NOT NULL DEFAULT 1,
	`rule_created_by` varchar(64),
	`rule_updated_by` varchar(64),
	CONSTRAINT `diagnosis_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnosis_rules_rule_id_unique` UNIQUE(`rule_id`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64) NOT NULL,
	`node_id` varchar(64),
	`sensor_id` varchar(64),
	`rule_id` varchar(64),
	`anomaly_id` varchar(64),
	`task_type` enum('routine','anomaly','manual','scheduled') NOT NULL DEFAULT 'routine',
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` int DEFAULT 5,
	`input_data` json,
	`result` json,
	`error` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnosis_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnosis_tasks_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
CREATE TABLE `edge_gateway_config` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`gateway_code` varchar(64) NOT NULL,
	`gateway_name` varchar(200) NOT NULL,
	`gateway_type` varchar(64) NOT NULL,
	`ip_address` varchar(128),
	`port` int,
	`firmware_version` varchar(64),
	`protocols` json,
	`max_devices` int NOT NULL,
	`heartbeat_interval` int NOT NULL,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`last_heartbeat` timestamp(3),
	`location` varchar(128),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `edge_gateway_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edge_gateways` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway_id` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`gateway_type` varchar(30) NOT NULL,
	`protocol` varchar(30) NOT NULL,
	`ip_address` varchar(45),
	`port` int,
	`firmware_version` varchar(30),
	`status` varchar(20) NOT NULL DEFAULT 'offline',
	`last_heartbeat` datetime(3),
	`config` json,
	`buffer_size_sec` int NOT NULL DEFAULT 60,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `edge_gateways_id` PRIMARY KEY(`id`),
	CONSTRAINT `edge_gateways_gateway_id_unique` UNIQUE(`gateway_id`)
);
--> statement-breakpoint
CREATE TABLE `event_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`topic` varchar(100) NOT NULL,
	`event_type` varchar(50) NOT NULL,
	`source` varchar(100),
	`node_id` varchar(64),
	`sensor_id` varchar(64),
	`severity` enum('info','warning','error','critical') NOT NULL DEFAULT 'info',
	`payload` json,
	`processed` boolean NOT NULL DEFAULT false,
	`processed_at` timestamp,
	`processed_by` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_logs_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `event_snapshots` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`aggregate_type` varchar(50) NOT NULL,
	`aggregate_id` varchar(100) NOT NULL,
	`aggregate_version` bigint NOT NULL,
	`state` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `event_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_store` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`event_version` smallint NOT NULL DEFAULT 1,
	`aggregate_type` varchar(50) NOT NULL,
	`aggregate_id` varchar(100) NOT NULL,
	`aggregate_version` bigint NOT NULL,
	`payload` json NOT NULL,
	`metadata` json,
	`causation_id` varchar(64),
	`correlation_id` varchar(64),
	`occurred_at` datetime(3) NOT NULL,
	`recorded_at` timestamp NOT NULL,
	`actor_id` varchar(64),
	`actor_type` varchar(20),
	CONSTRAINT `event_store_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_store_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `idempotent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(128) NOT NULL,
	`operation_type` varchar(100) NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`request_hash` varchar(64),
	`response` json,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `idempotent_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotent_records_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `kb_chunks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`chunk_index` int NOT NULL,
	`content` text NOT NULL,
	`token_count` int,
	`metadata` json,
	`embedding_id` bigint,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `kb_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`user_id` int,
	`is_public` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `kb_collections_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `kb_conversation_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`conversation_id` bigint NOT NULL,
	`role` varchar(128) NOT NULL,
	`content` text NOT NULL,
	`token_count` int,
	`sources` json,
	`feedback` tinyint,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `kb_conversation_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_conversations` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`collection_id` bigint NOT NULL,
	`title` varchar(200),
	`user_id` varchar(128) NOT NULL,
	`message_count` int NOT NULL,
	`model_name` varchar(200),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `kb_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection_id` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(100),
	`file_size` int,
	`storage_url` varchar(500),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`processed_at` timestamp,
	`chunks_count` int DEFAULT 0,
	`entities_count` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_embeddings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`chunk_id` bigint NOT NULL,
	`model_name` varchar(200) NOT NULL,
	`dimensions` int NOT NULL,
	`vector_data` varchar(128) NOT NULL,
	`norm` double,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `kb_embeddings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`tags` json,
	`source` varchar(255),
	`entities` json,
	`relations` json,
	`embedding` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_qa_pairs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`collection_id` bigint NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`source_document_id` bigint,
	`confidence` double,
	`tags` json,
	`is_verified` tinyint NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `kb_qa_pairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_diagnosis_paths` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`path_index` int NOT NULL,
	`node_sequence` json NOT NULL,
	`edge_sequence` json NOT NULL,
	`confidence` double NOT NULL,
	`conclusion` varchar(500),
	`is_selected` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kg_diagnosis_paths_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_diagnosis_runs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`trigger_type` enum('manual','auto','api','edge') NOT NULL DEFAULT 'manual',
	`input_data` json,
	`status` enum('running','completed','failed','timeout') NOT NULL DEFAULT 'running',
	`result` json,
	`inference_path_ids` json,
	`inference_depth` int,
	`duration_ms` int,
	`feedback` enum('correct','incorrect','partial','pending') NOT NULL DEFAULT 'pending',
	`feedback_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kg_diagnosis_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `kg_diagnosis_runs_run_id_unique` UNIQUE(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `kg_edges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection_id` int NOT NULL,
	`edge_id` varchar(100) NOT NULL,
	`source_node_id` varchar(100) NOT NULL,
	`target_node_id` varchar(100) NOT NULL,
	`label` varchar(100) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'related_to',
	`weight` int DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_evolution_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`evolution_type` varchar(32) NOT NULL,
	`description` text,
	`changes` json,
	`triggered_by` enum('system','diagnosis_feedback','fleet_sync','manual') NOT NULL DEFAULT 'system',
	`source_device_count` int,
	`accuracy_before` double,
	`accuracy_after` double,
	`status` enum('applied','pending_review','rejected') NOT NULL DEFAULT 'pending_review',
	`reviewed_by` varchar(64),
	`reviewed_at` datetime(3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kg_evolution_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_graph_edges` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`edge_id` varchar(64) NOT NULL,
	`source_node_id` varchar(64) NOT NULL,
	`target_node_id` varchar(64) NOT NULL,
	`relation_type` varchar(32) NOT NULL,
	`label` varchar(200),
	`weight` double NOT NULL DEFAULT 1,
	`config` json,
	`path_accuracy` double,
	`hit_count` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_graph_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_graph_nodes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`category` varchar(32) NOT NULL,
	`sub_type` varchar(64) NOT NULL,
	`label` varchar(200) NOT NULL,
	`x` double NOT NULL DEFAULT 0,
	`y` double NOT NULL DEFAULT 0,
	`config` json,
	`node_status` enum('normal','pending_confirm','deprecated') NOT NULL DEFAULT 'normal',
	`hit_count` int DEFAULT 0,
	`accuracy` double,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_graph_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_graphs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`graph_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`scenario` varchar(64) NOT NULL DEFAULT 'custom',
	`template_id` varchar(64),
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived','evolving') NOT NULL DEFAULT 'draft',
	`viewport_config` json,
	`node_count` int DEFAULT 0,
	`edge_count` int DEFAULT 0,
	`total_diagnosis_runs` int DEFAULT 0,
	`avg_accuracy` double,
	`last_evolved_at` timestamp,
	`tags` json,
	`created_by` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_graphs_id` PRIMARY KEY(`id`),
	CONSTRAINT `kg_graphs_graph_id_unique` UNIQUE(`graph_id`)
);
--> statement-breakpoint
CREATE TABLE `kg_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection_id` int NOT NULL,
	`node_id` varchar(100) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'entity',
	`properties` json,
	`x` int,
	`y` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `message_queue_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`message_id` varchar(64) NOT NULL,
	`topic` varchar(128) NOT NULL,
	`partition_key` varchar(128),
	`payload` json NOT NULL,
	`direction` varchar(16) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'sent',
	`retry_count` int NOT NULL DEFAULT 0,
	`error_message` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`delivered_at` timestamp(3),
	CONSTRAINT `message_queue_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_queue_log_message_id_unique` UNIQUE(`message_id`)
);
--> statement-breakpoint
CREATE TABLE `message_routing_config` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`route_name` varchar(200) NOT NULL,
	`source_topic` varchar(128) NOT NULL,
	`target_topic` varchar(128) NOT NULL,
	`filter_expr` text,
	`transform_script` text,
	`priority` int NOT NULL,
	`is_enabled` tinyint NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `message_routing_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minio_file_metadata` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`bucket` varchar(128) NOT NULL,
	`object_key` varchar(128) NOT NULL,
	`original_name` varchar(200) NOT NULL,
	`content_type` varchar(64) NOT NULL,
	`file_size` bigint NOT NULL,
	`etag` varchar(128),
	`tags` json,
	`uploaded_by` varchar(64),
	`expires_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `minio_file_metadata_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minio_upload_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`bucket` varchar(128) NOT NULL,
	`object_key` varchar(128) NOT NULL,
	`file_size` bigint NOT NULL,
	`upload_duration_ms` int,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`error_message` text,
	`uploaded_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `minio_upload_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversation_id` varchar(64) NOT NULL,
	`user_id` int,
	`model_id` varchar(100) NOT NULL,
	`title` varchar(255),
	`message_count` int NOT NULL DEFAULT 0,
	`total_tokens` int DEFAULT 0,
	`status` enum('active','archived','deleted') NOT NULL DEFAULT 'active',
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_conversations_conversation_id_unique` UNIQUE(`conversation_id`)
);
--> statement-breakpoint
CREATE TABLE `model_deployments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`model_id` bigint NOT NULL,
	`deployment_name` varchar(200) NOT NULL,
	`environment` varchar(128) NOT NULL,
	`endpoint_url` varchar(500),
	`replicas` int NOT NULL,
	`gpu_type` varchar(64),
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`deployed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `model_deployments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`evaluation_id` varchar(64) NOT NULL,
	`user_id` int,
	`model_id` varchar(100) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`dataset_path` varchar(500),
	`dataset_size` int,
	`evaluation_type` enum('accuracy','perplexity','bleu','rouge','custom') NOT NULL DEFAULT 'accuracy',
	`results` json,
	`error` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_evaluations_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_evaluations_evaluation_id_unique` UNIQUE(`evaluation_id`)
);
--> statement-breakpoint
CREATE TABLE `model_fine_tune_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` varchar(64) NOT NULL,
	`user_id` int,
	`base_model_id` varchar(100) NOT NULL,
	`output_model_id` varchar(100),
	`name` varchar(200) NOT NULL,
	`description` text,
	`status` enum('pending','preparing','training','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`dataset_path` varchar(500),
	`dataset_size` int,
	`config` json,
	`metrics` json,
	`error` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_fine_tune_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_fine_tune_tasks_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
CREATE TABLE `model_inference_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`deployment_id` bigint NOT NULL,
	`request_id` varchar(128) NOT NULL,
	`input_tokens` int,
	`output_tokens` int,
	`latency_ms` int,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`error_message` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `model_inference_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`message_id` varchar(64) NOT NULL,
	`conversation_id` varchar(64) NOT NULL,
	`role` enum('system','user','assistant','tool') NOT NULL,
	`content` text NOT NULL,
	`tokens` int,
	`latency` int,
	`attachments` json,
	`tool_calls` json,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_messages_message_id_unique` UNIQUE(`message_id`)
);
--> statement-breakpoint
CREATE TABLE `model_registry` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`model_code` varchar(64) NOT NULL,
	`model_name` varchar(200) NOT NULL,
	`model_type` varchar(64) NOT NULL,
	`framework` varchar(128),
	`version` varchar(64) NOT NULL,
	`description` text,
	`model_file_url` varchar(500),
	`metrics` json,
	`tags` json,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `model_registry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_training_jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`model_id` bigint NOT NULL,
	`job_name` varchar(200) NOT NULL,
	`training_data` json,
	`hyperparams` json,
	`gpu_type` varchar(64),
	`epochs` int,
	`current_epoch` int,
	`loss` double,
	`status` varchar(64) NOT NULL DEFAULT 'active',
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `model_training_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_usage_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`log_id` varchar(64) NOT NULL,
	`user_id` int,
	`model_id` varchar(100) NOT NULL,
	`conversation_id` varchar(64),
	`request_type` enum('chat','completion','embedding','inference') NOT NULL,
	`input_tokens` int,
	`output_tokens` int,
	`latency` int,
	`status` enum('success','error','timeout') NOT NULL,
	`error` text,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`device_code` varchar(64),
	`sensor_code` varchar(64),
	`inference_result` json,
	`triggered_alert` tinyint NOT NULL DEFAULT 0,
	`feedback_status` varchar(32),
	CONSTRAINT `model_usage_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_usage_logs_log_id_unique` UNIQUE(`log_id`)
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`model_id` varchar(100) NOT NULL,
	`name` varchar(100) NOT NULL,
	`display_name` varchar(200),
	`type` enum('llm','embedding','label','diagnostic','vision','audio') NOT NULL,
	`provider` enum('ollama','openai','anthropic','local','custom') NOT NULL DEFAULT 'ollama',
	`size` varchar(50),
	`parameters` varchar(50),
	`quantization` varchar(20),
	`description` text,
	`status` enum('available','loaded','downloading','error') NOT NULL DEFAULT 'available',
	`download_progress` int DEFAULT 0,
	`is_default` boolean NOT NULL DEFAULT false,
	`config` json,
	`capabilities` json,
	`metrics` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`dataset_version` varchar(64),
	`dataset_clip_count` int,
	`dataset_total_duration_s` int,
	`deployment_target` varchar(64),
	`input_format` varchar(64),
	`output_format` varchar(64),
	CONSTRAINT `models_id` PRIMARY KEY(`id`),
	CONSTRAINT `models_model_id_unique` UNIQUE(`model_id`)
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`aggregate_type` varchar(100) NOT NULL,
	`aggregate_id` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`metadata` json,
	`status` enum('pending','processing','published','failed') NOT NULL DEFAULT 'pending',
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`last_error` text,
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_events_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `outbox_routing_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`publish_mode` enum('cdc','polling') NOT NULL DEFAULT 'cdc',
	`cdc_enabled` boolean NOT NULL DEFAULT true,
	`polling_interval_ms` int,
	`polling_batch_size` int,
	`requires_processing` boolean NOT NULL DEFAULT false,
	`processor_class` varchar(200),
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outbox_routing_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_routing_config_event_type_unique` UNIQUE(`event_type`)
);
--> statement-breakpoint
CREATE TABLE `pipeline_node_metrics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`pipeline_id` varchar(64) NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`node_name` varchar(128),
	`node_type` varchar(32),
	`node_sub_type` varchar(64),
	`status` varchar(16),
	`records_in` int DEFAULT 0,
	`records_out` int DEFAULT 0,
	`duration_ms` int,
	`error_message` text,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `pipeline_node_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`pipeline_id` varchar(64) NOT NULL,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`trigger_type` enum('manual','schedule','api','event') NOT NULL DEFAULT 'manual',
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`duration_ms` int,
	`total_records_in` int DEFAULT 0,
	`total_records_out` int DEFAULT 0,
	`error_count` int DEFAULT 0,
	`node_results` json,
	`lineage_data` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `pipeline_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipeline_runs_run_id_unique` UNIQUE(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`pipeline_id` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`category` varchar(32) NOT NULL DEFAULT 'custom',
	`dag_config` json,
	`status` enum('draft','active','paused','error','running','archived') NOT NULL DEFAULT 'draft',
	`node_count` int DEFAULT 0,
	`connection_count` int DEFAULT 0,
	`total_runs` int DEFAULT 0,
	`success_runs` int DEFAULT 0,
	`failed_runs` int DEFAULT 0,
	`last_run_at` timestamp,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `pipelines_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipelines_pipeline_id_unique` UNIQUE(`pipeline_id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`instance_id` int NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`payload` json,
	`severity` varchar(16) NOT NULL DEFAULT 'info',
	`source_plugin` varchar(64),
	`target_plugin` varchar(64),
	`processed` tinyint NOT NULL DEFAULT 0,
	`processed_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	CONSTRAINT `plugin_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `plugin_events_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instance_code` varchar(64) NOT NULL,
	`plugin_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`bound_entity_type` varchar(64),
	`bound_entity_id` int,
	`config` json,
	`runtime_state` json,
	`status` varchar(32) NOT NULL DEFAULT 'stopped',
	`last_heartbeat_at` timestamp,
	`error_message` text,
	`started_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `plugin_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `plugin_instances_instance_code_unique` UNIQUE(`instance_code`)
);
--> statement-breakpoint
CREATE TABLE `plugin_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plugin_code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`plugin_type` varchar(32) NOT NULL,
	`version` varchar(32) NOT NULL,
	`entry_point` varchar(256) NOT NULL,
	`config_schema` json,
	`default_config` json,
	`capabilities` json,
	`dependencies` json,
	`author` varchar(128),
	`license` varchar(64),
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`is_builtin` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_by` varchar(64),
	CONSTRAINT `plugin_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `plugin_registry_plugin_code_unique` UNIQUE(`plugin_code`)
);
--> statement-breakpoint
CREATE TABLE `processed_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`consumer_group` varchar(100) NOT NULL,
	`processed_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `processed_events_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `realtime_data_latest` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`mp_code` varchar(64) NOT NULL,
	`value` double,
	`string_value` varchar(128),
	`quality` int NOT NULL DEFAULT 0,
	`source_timestamp` timestamp(3) NOT NULL,
	`server_timestamp` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `realtime_data_latest_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `realtime_telemetry` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`gateway_id` varchar(64) NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`mp_code` varchar(64) NOT NULL,
	`timestamp` datetime(3) NOT NULL,
	`value` double,
	`unit` varchar(20),
	`quality` int NOT NULL DEFAULT 192,
	`features` json,
	`is_anomaly` tinyint NOT NULL DEFAULT 0,
	`synced_to_ch` tinyint NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `realtime_telemetry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rollback_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`execution_id` varchar(64) NOT NULL,
	`saga_id` varchar(64),
	`trigger_id` varchar(64) NOT NULL,
	`target_type` enum('rule','model','config','firmware') NOT NULL,
	`target_id` varchar(64) NOT NULL,
	`from_version` varchar(50) NOT NULL,
	`to_version` varchar(50) NOT NULL,
	`trigger_reason` text,
	`status` enum('pending','executing','completed','failed','partial','cancelled') NOT NULL DEFAULT 'pending',
	`total_devices` int,
	`completed_devices` int DEFAULT 0,
	`failed_devices` int DEFAULT 0,
	`checkpoint` json,
	`result` json,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rollback_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rollback_executions_execution_id_unique` UNIQUE(`execution_id`)
);
--> statement-breakpoint
CREATE TABLE `rollback_triggers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`trigger_code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`target_table` varchar(128) NOT NULL,
	`condition_type` varchar(32) NOT NULL,
	`condition_params` json NOT NULL,
	`rollback_action` varchar(32) NOT NULL,
	`action_params` json,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_triggered_at` timestamp(3),
	`trigger_count` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `rollback_triggers_id` PRIMARY KEY(`id`),
	CONSTRAINT `rollback_triggers_trigger_code_unique` UNIQUE(`trigger_code`)
);
--> statement-breakpoint
CREATE TABLE `saga_dead_letters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dead_letter_id` varchar(64) NOT NULL,
	`saga_id` varchar(64) NOT NULL,
	`saga_type` varchar(100) NOT NULL,
	`failure_reason` text NOT NULL,
	`failure_type` enum('timeout','max_retries','compensation_failed','unknown') NOT NULL,
	`original_input` json,
	`last_checkpoint` json,
	`retryable` boolean NOT NULL DEFAULT true,
	`retry_count` int NOT NULL DEFAULT 0,
	`last_retry_at` timestamp,
	`resolved_at` timestamp,
	`resolved_by` varchar(100),
	`resolution` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saga_dead_letters_id` PRIMARY KEY(`id`),
	CONSTRAINT `saga_dead_letters_dead_letter_id_unique` UNIQUE(`dead_letter_id`)
);
--> statement-breakpoint
CREATE TABLE `saga_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saga_id` varchar(64) NOT NULL,
	`saga_type` varchar(100) NOT NULL,
	`status` enum('running','completed','failed','compensating','compensated','partial') NOT NULL DEFAULT 'running',
	`current_step` int NOT NULL DEFAULT 0,
	`total_steps` int NOT NULL,
	`input` json,
	`output` json,
	`checkpoint` json,
	`error` text,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`timeout_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saga_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `saga_instances_saga_id_unique` UNIQUE(`saga_id`)
);
--> statement-breakpoint
CREATE TABLE `saga_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`step_id` varchar(64) NOT NULL,
	`saga_id` varchar(64) NOT NULL,
	`step_index` int NOT NULL,
	`step_name` varchar(100) NOT NULL,
	`step_type` enum('action','compensation') NOT NULL DEFAULT 'action',
	`status` enum('pending','running','completed','failed','skipped','compensated') NOT NULL DEFAULT 'pending',
	`input` json,
	`output` json,
	`error` text,
	`retry_count` int NOT NULL DEFAULT 0,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saga_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `saga_steps_step_id_unique` UNIQUE(`step_id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`task_code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`task_type` varchar(32) NOT NULL,
	`cron_expression` varchar(100),
	`interval_seconds` int,
	`handler` varchar(200) NOT NULL,
	`params` json,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`last_run_at` timestamp(3),
	`last_run_result` varchar(20),
	`next_run_at` timestamp(3),
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`timeout_seconds` int NOT NULL DEFAULT 300,
	`description` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `scheduled_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_tasks_task_code_unique` UNIQUE(`task_code`)
);
--> statement-breakpoint
CREATE TABLE `sensor_calibrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_code` varchar(100) NOT NULL,
	`sensor_id` varchar(64) NOT NULL,
	`calibration_date` date NOT NULL,
	`calibration_type` varchar(20) NOT NULL,
	`offset_before` double,
	`offset_after` double,
	`scale_before` double,
	`scale_after` double,
	`calibration_formula` varchar(255),
	`apply_to_history` tinyint NOT NULL DEFAULT 0,
	`history_start_time` datetime(3),
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`applied_at` datetime(3),
	`notes` text,
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_by` varchar(64),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `sensor_calibrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sensor_mp_mapping` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensor_id` varchar(64) NOT NULL,
	`mp_id` varchar(64) NOT NULL,
	`axis` varchar(8),
	`weight` varchar(10) NOT NULL DEFAULT '1.000',
	`effective_from` timestamp(3) NOT NULL DEFAULT (now()),
	`effective_to` timestamp(3),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	CONSTRAINT `sensor_mp_mapping_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_capacity_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`metric_id` varchar(64) NOT NULL,
	`metric_type` enum('kafka_lag','db_connections','memory_usage','cpu_usage','queue_depth') NOT NULL,
	`component_name` varchar(100) NOT NULL,
	`current_value` double NOT NULL,
	`threshold` double NOT NULL,
	`status` enum('normal','warning','critical') NOT NULL DEFAULT 'normal',
	`last_checked_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_capacity_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_capacity_metrics_metric_id_unique` UNIQUE(`metric_id`)
);
--> statement-breakpoint
CREATE TABLE `system_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_key` varchar(128) NOT NULL,
	`config_value` json NOT NULL,
	`value_type` varchar(32) NOT NULL DEFAULT 'string',
	`category` varchar(64) NOT NULL,
	`environment` varchar(32) NOT NULL DEFAULT 'production',
	`description` text,
	`is_sensitive` tinyint NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by` varchar(64),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_by` varchar(64),
	CONSTRAINT `system_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_sc_key_env` UNIQUE(`config_key`,`environment`)
);
--> statement-breakpoint
CREATE TABLE `topo_alerts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`node_id` varchar(128) NOT NULL,
	`alert_type` varchar(64) NOT NULL,
	`severity` varchar(128) NOT NULL,
	`message` text NOT NULL,
	`resolved` tinyint NOT NULL DEFAULT 0,
	`resolved_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `topo_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topo_edges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`edge_id` varchar(64) NOT NULL,
	`source_node_id` varchar(64) NOT NULL,
	`target_node_id` varchar(64) NOT NULL,
	`type` enum('data','dependency','control') NOT NULL DEFAULT 'data',
	`label` varchar(100),
	`config` json,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_edges_id` PRIMARY KEY(`id`),
	CONSTRAINT `topo_edges_edge_id_unique` UNIQUE(`edge_id`)
);
--> statement-breakpoint
CREATE TABLE `topo_layers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`layer_code` varchar(64) NOT NULL,
	`layer_name` varchar(200) NOT NULL,
	`layer_order` int NOT NULL,
	`color` varchar(32),
	`description` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `topo_layers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topo_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`user_id` int,
	`is_default` boolean NOT NULL DEFAULT false,
	`layout_data` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_layouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topo_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`node_id` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('source','plugin','engine','agent','output','database','service') NOT NULL,
	`icon` varchar(20) DEFAULT '📦',
	`description` text,
	`status` enum('online','offline','error','maintenance') NOT NULL DEFAULT 'offline',
	`x` int NOT NULL DEFAULT 0,
	`y` int NOT NULL DEFAULT 0,
	`config` json,
	`metrics` json,
	`last_heartbeat` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `topo_nodes_node_id_unique` UNIQUE(`node_id`)
);
--> statement-breakpoint
CREATE TABLE `topo_snapshots` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`snapshot_name` varchar(200) NOT NULL,
	`snapshot_data` json NOT NULL,
	`node_count` int NOT NULL,
	`edge_count` int NOT NULL,
	`created_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `topo_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`open_id` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`login_method` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_signed_in` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_open_id_unique` UNIQUE(`open_id`)
);
--> statement-breakpoint
CREATE TABLE `vibration_1hour_agg` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_code` varchar(64) NOT NULL,
	`mp_code` varchar(64) NOT NULL,
	`hour_start` timestamp(3) NOT NULL,
	`rms_avg` double,
	`rms_max` double,
	`peak_avg` double,
	`peak_max` double,
	`kurtosis_avg` double,
	`sample_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `vibration_1hour_agg_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bpa_configs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`equipment_type` varchar(100) NOT NULL,
	`condition_phase` varchar(100),
	`hypotheses` json NOT NULL,
	`rules` json NOT NULL,
	`ignorance_base` double NOT NULL DEFAULT 0.05,
	`min_mass_threshold` double NOT NULL DEFAULT 0.01,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`enabled` boolean NOT NULL DEFAULT true,
	`description` text,
	`created_by` varchar(100),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `bpa_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bpa_name_version` UNIQUE(`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `canary_deployments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`experiment_id` bigint NOT NULL,
	`model_id` varchar(100) NOT NULL,
	`traffic_percent` double NOT NULL,
	`status` enum('active','completed','rolled_back','failed') NOT NULL DEFAULT 'active',
	`rollback_reason` text,
	`metrics_snapshot` json,
	`started_at` timestamp(3) NOT NULL DEFAULT (now()),
	`ended_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `canary_deployments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `canary_traffic_splits` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`deployment_id` bigint NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`assigned_model` varchar(100) NOT NULL,
	`metrics` json,
	`timestamp` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `canary_traffic_splits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `causal_edges` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`edge_id` varchar(400) NOT NULL,
	`source_node_id` varchar(200) NOT NULL,
	`target_node_id` varchar(200) NOT NULL,
	`weight` float NOT NULL DEFAULT 0.5,
	`mechanism` text NOT NULL,
	`evidence_count` int NOT NULL DEFAULT 0,
	`source_type` enum('seed','grok_discovered','experience_learned') NOT NULL DEFAULT 'seed',
	`last_decay_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `causal_edges_id` PRIMARY KEY(`id`),
	CONSTRAINT `causal_edges_edge_id_unique` UNIQUE(`edge_id`),
	CONSTRAINT `idx_ce_pair` UNIQUE(`source_node_id`,`target_node_id`)
);
--> statement-breakpoint
CREATE TABLE `causal_nodes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`node_id` varchar(200) NOT NULL,
	`label` varchar(200) NOT NULL,
	`node_type` enum('symptom','mechanism','root_cause','condition') NOT NULL,
	`domain` varchar(100) NOT NULL,
	`prior_probability` float NOT NULL DEFAULT 0.5,
	`equation_ids` json NOT NULL DEFAULT ('[]'),
	`sensor_tags` json NOT NULL DEFAULT ('[]'),
	`metadata` json NOT NULL DEFAULT ('{}'),
	`source_type` enum('seed','grok_discovered','experience_learned') NOT NULL DEFAULT 'seed',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `causal_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `causal_nodes_node_id_unique` UNIQUE(`node_id`)
);
--> statement-breakpoint
CREATE TABLE `champion_challenger_experiments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`champion_id` varchar(100) NOT NULL,
	`challenger_id` varchar(100) NOT NULL,
	`gate1_passed` boolean,
	`gate2_passed` boolean,
	`gate3_passed` boolean,
	`tas_score` double,
	`verdict` enum('PROMOTE','CANARY_EXTENDED','REJECT','PENDING') DEFAULT 'PENDING',
	`promoted_at` timestamp(3),
	`shadow_eval_id` bigint,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `champion_challenger_experiments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cognition_dimension_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`session_id` varchar(64) NOT NULL,
	`dimension` enum('perception','reasoning','fusion','decision') NOT NULL,
	`score` double NOT NULL,
	`evidence` json NOT NULL,
	`confidence` double NOT NULL,
	`processing_time_ms` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `cognition_dimension_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cognition_sessions` (
	`id` varchar(64) NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`condition_id` varchar(100),
	`cycle_phase` varchar(50),
	`trigger_type` enum('anomaly','scheduled','manual','chain','drift','guardrail_feedback') NOT NULL,
	`priority` enum('critical','high','normal') NOT NULL DEFAULT 'normal',
	`status` enum('running','completed','failed','timeout') NOT NULL DEFAULT 'running',
	`safety_score` double,
	`health_score` double,
	`efficiency_score` double,
	`diagnostics_json` json,
	`predictions_json` json,
	`grok_explanation` text,
	`grok_reasoning_steps` int DEFAULT 0,
	`total_processing_time_ms` int,
	`started_at` timestamp(3) NOT NULL DEFAULT (now()),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `cognition_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `condition_baselines` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`profile_id` bigint NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`baseline_values` json NOT NULL,
	`sample_count` int NOT NULL,
	`status` enum('learning','converged','expired') NOT NULL DEFAULT 'learning',
	`converged_at` timestamp(3),
	`expires_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `condition_baselines_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cb_profile_machine` UNIQUE(`profile_id`,`machine_id`)
);
--> statement-breakpoint
CREATE TABLE `condition_instances` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`profile_id` bigint NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`started_at` timestamp(3) NOT NULL,
	`ended_at` timestamp(3),
	`trigger` enum('auto_detection','manual','scheduler','threshold_breach') NOT NULL,
	`state_snapshot` json,
	`status` enum('active','completed','aborted') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `condition_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `condition_profiles` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`industry` varchar(100) NOT NULL,
	`equipment_type` varchar(100) NOT NULL,
	`description` text,
	`parameters` json NOT NULL,
	`sensor_mapping` json NOT NULL,
	`threshold_strategy` json NOT NULL,
	`cognition_config` json NOT NULL,
	`guardrail_overrides` json,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `condition_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cp_name_version` UNIQUE(`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_physics_formulas` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` enum('fatigue','wind_load','friction','corrosion','thermal','vibration','structural') NOT NULL,
	`formula` text NOT NULL,
	`variables` json NOT NULL,
	`applicable_equipment` json NOT NULL,
	`source` enum('physics','learned','expert') NOT NULL DEFAULT 'physics',
	`reference` text,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `diagnosis_physics_formulas_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_dpf_name_version` UNIQUE(`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `edge_cases` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`case_type` enum('false_positive','false_negative','extreme_condition','distribution_drift','novel_pattern') NOT NULL,
	`description` text NOT NULL,
	`data_range_start` timestamp(3) NOT NULL,
	`data_range_end` timestamp(3) NOT NULL,
	`anomaly_score` double NOT NULL,
	`machine_ids` json NOT NULL,
	`cycle_id` bigint,
	`status` enum('discovered','analyzing','labeled','integrated','dismissed') NOT NULL DEFAULT 'discovered',
	`label_result` json,
	`discovered_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `edge_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `engine_config_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`config_group` varchar(64) NOT NULL DEFAULT 'general',
	`config_key` varchar(128) NOT NULL,
	`config_value` text NOT NULL,
	`value_type` enum('number','string','boolean','json') NOT NULL DEFAULT 'string',
	`default_value` text,
	`label` varchar(128) NOT NULL,
	`description` text,
	`unit` varchar(32),
	`constraints` json,
	`sort_order` int NOT NULL DEFAULT 100,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`is_builtin` tinyint NOT NULL DEFAULT 0,
	`impact_score` int DEFAULT 0,
	`impact_description` text,
	`config_version` varchar(32) NOT NULL DEFAULT '1.0.0',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `engine_config_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_module_key` UNIQUE(`module`,`config_key`)
);
--> statement-breakpoint
CREATE TABLE `equipment_profiles` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`type` varchar(100) NOT NULL,
	`manufacturer` varchar(200),
	`model` varchar(200),
	`physical_constraints` json,
	`failure_modes` json,
	`world_model_config` json,
	`maintenance_schedule` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `equipment_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evolution_cycles` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`cycle_number` int NOT NULL,
	`started_at` timestamp(3) NOT NULL,
	`completed_at` timestamp(3),
	`status` enum('running','completed','failed','paused') NOT NULL DEFAULT 'running',
	`edge_cases_found` int DEFAULT 0,
	`hypotheses_generated` int DEFAULT 0,
	`models_evaluated` int DEFAULT 0,
	`deployed` int DEFAULT 0,
	`accuracy_before` double,
	`accuracy_after` double,
	`improvement_percent` double,
	`knowledge_crystallized` int DEFAULT 0,
	`summary` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `evolution_cycles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ec_cycle` UNIQUE(`cycle_number`)
);
--> statement-breakpoint
CREATE TABLE `feature_definitions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` enum('time_domain','freq_domain','statistical','derived','physics') NOT NULL,
	`description` text,
	`input_signals` json NOT NULL,
	`compute_logic` text NOT NULL,
	`applicable_equipment` json NOT NULL,
	`output_unit` varchar(50),
	`output_range` json,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `feature_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fd_name_version` UNIQUE(`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `feature_versions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`feature_id` bigint NOT NULL,
	`version` varchar(20) NOT NULL,
	`changelog` text,
	`schema` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `feature_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fv_feature_version` UNIQUE(`feature_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `grok_reasoning_chains` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`session_id` varchar(64) NOT NULL,
	`step_index` int NOT NULL,
	`tool_name` varchar(200) NOT NULL,
	`tool_input` json NOT NULL,
	`tool_output` json NOT NULL,
	`reasoning` text,
	`duration_ms` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `grok_reasoning_chains_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guardrail_rules` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` enum('safety','health','efficiency') NOT NULL,
	`description` text,
	`condition` json NOT NULL,
	`action` json NOT NULL,
	`priority` int NOT NULL DEFAULT 100,
	`enabled` boolean NOT NULL DEFAULT true,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`applicable_equipment` json,
	`applicable_conditions` json,
	`physical_basis` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `guardrail_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guardrail_violations` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`rule_id` bigint NOT NULL,
	`session_id` varchar(64),
	`machine_id` varchar(100) NOT NULL,
	`timestamp` timestamp(3) NOT NULL,
	`trigger_values` json NOT NULL,
	`action` varchar(100) NOT NULL,
	`reason` text NOT NULL,
	`grok_explanation` text,
	`outcome` enum('executed','overridden','failed','pending') NOT NULL DEFAULT 'pending',
	`post_intervention_improvement` double,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `guardrail_violations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_crystals` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`confidence` double NOT NULL,
	`source_session_ids` json NOT NULL,
	`applicable_conditions` json,
	`kg_node_id` varchar(100),
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`verification_count` int NOT NULL DEFAULT 0,
	`last_verified_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_crystals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reasoning_decision_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`session_id` varchar(200) NOT NULL,
	`route` enum('fast_path','standard_path','deep_path','fallback_path') NOT NULL,
	`phase_durations` json NOT NULL,
	`decisions` json NOT NULL,
	`final_hypothesis` varchar(500),
	`final_confidence` float,
	`physics_verified` boolean NOT NULL DEFAULT false,
	`grok_used` boolean NOT NULL DEFAULT false,
	`grok_call_count` int NOT NULL DEFAULT 0,
	`total_uncertainty` float,
	`uncertainty_decomposition` json,
	`total_duration_ms` int NOT NULL,
	`explanation_graph` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `reasoning_decision_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reasoning_experiences` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`experience_id` varchar(200) NOT NULL,
	`layer` enum('episodic','semantic','procedural') NOT NULL,
	`session_id` varchar(200),
	`domain` varchar(100) NOT NULL,
	`device_type` varchar(100),
	`device_code` varchar(100),
	`description` text NOT NULL,
	`hypothesis` varchar(500),
	`root_cause` varchar(500),
	`resolution` text,
	`was_correct` boolean,
	`confidence` float NOT NULL DEFAULT 0,
	`feature_vector` json,
	`context` json NOT NULL DEFAULT ('{}'),
	`source_episodic_ids` json,
	`steps` json,
	`verification_count` int NOT NULL DEFAULT 0,
	`success_rate` float,
	`execution_count` int NOT NULL DEFAULT 0,
	`avg_duration_ms` int,
	`last_accessed_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reasoning_experiences_id` PRIMARY KEY(`id`),
	CONSTRAINT `reasoning_experiences_experience_id_unique` UNIQUE(`experience_id`)
);
--> statement-breakpoint
CREATE TABLE `revision_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`revision_id` varchar(200) NOT NULL,
	`component` enum('causal_edge','experience_weight','physics_param','bpa_config') NOT NULL,
	`entity_id` varchar(400) NOT NULL,
	`previous_value` json NOT NULL,
	`new_value` json NOT NULL,
	`feedback_event_type` varchar(100) NOT NULL,
	`session_id` varchar(200) NOT NULL,
	`rolled_back` boolean NOT NULL DEFAULT false,
	`rolled_back_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `revision_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `revision_logs_revision_id_unique` UNIQUE(`revision_id`)
);
--> statement-breakpoint
CREATE TABLE `sampling_configs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`profile_id` bigint NOT NULL,
	`cycle_phase` varchar(50) NOT NULL,
	`base_sampling_rate` int NOT NULL,
	`high_freq_sampling_rate` int NOT NULL,
	`high_freq_trigger` json,
	`retention_policy` enum('all','features_only','aggregated','sampled') NOT NULL DEFAULT 'features_only',
	`compression` enum('none','delta','fft','wavelet') NOT NULL DEFAULT 'delta',
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `sampling_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sc_profile_phase` UNIQUE(`profile_id`,`cycle_phase`)
);
--> statement-breakpoint
CREATE TABLE `shadow_eval_metrics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`record_id` bigint NOT NULL,
	`metric_name` varchar(100) NOT NULL,
	`baseline_value` double NOT NULL,
	`challenger_value` double NOT NULL,
	`improvement` double,
	`statistical_significance` double,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `shadow_eval_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadow_eval_records` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`experiment_name` varchar(200) NOT NULL,
	`baseline_model_id` varchar(100) NOT NULL,
	`challenger_model_id` varchar(100) NOT NULL,
	`data_range_start` timestamp(3) NOT NULL,
	`data_range_end` timestamp(3) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`config` json,
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `shadow_eval_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadow_reasoning_comparisons` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`session_id` varchar(200) NOT NULL,
	`champion_result` json NOT NULL,
	`challenger_result` json NOT NULL,
	`ground_truth` varchar(500),
	`champion_hit` boolean,
	`challenger_hit` boolean,
	`latency_ratio` float,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `shadow_reasoning_comparisons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `simulation_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scenario_id` int NOT NULL,
	`machine_id` varchar(64) NOT NULL,
	`timeline` json,
	`risk_assessment` json,
	`monte_carlo_result` json,
	`mean_trajectory` json,
	`p5_trajectory` json,
	`p50_trajectory` json,
	`p95_trajectory` json,
	`std_dev_by_dimension` json,
	`risk_level` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`monte_carlo_runs` int NOT NULL,
	`sequence_type` varchar(32) NOT NULL DEFAULT 'sobol',
	`duration_ms` int NOT NULL,
	`ai_explanation` text,
	`grok_report` text,
	`ai_maintenance_advice` text,
	`warnings` json,
	`version` int NOT NULL DEFAULT 1,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `simulation_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `simulation_scenarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`machine_id` varchar(64) NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`scenario_type` varchar(30) NOT NULL DEFAULT 'custom',
	`baseline_condition_id` varchar(100),
	`parameter_overrides` json,
	`horizon_steps` int NOT NULL DEFAULT 30,
	`step_interval_sec` int NOT NULL DEFAULT 60,
	`enable_monte_carlo` boolean NOT NULL DEFAULT false,
	`monte_carlo_runs` int NOT NULL DEFAULT 50,
	`method` varchar(32) NOT NULL DEFAULT 'sobol_qmc',
	`status` enum('draft','queued','running','completed','failed') NOT NULL DEFAULT 'draft',
	`task_id` varchar(64),
	`version` int NOT NULL DEFAULT 1,
	`created_by` varchar(128),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `simulation_scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `state_vector_dimensions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`equipment_type` varchar(100) NOT NULL,
	`dimension_index` int NOT NULL,
	`dimension_key` varchar(100) NOT NULL,
	`label` varchar(200) NOT NULL,
	`unit` varchar(50) NOT NULL DEFAULT '',
	`dimension_group` enum('cycle_features','uncertainty_factors','cumulative_metrics') NOT NULL,
	`metric_names` json NOT NULL,
	`aggregation` enum('mean','max','min','rms','latest','sum','std') NOT NULL DEFAULT 'mean',
	`default_value` double NOT NULL DEFAULT 0,
	`normalize_range` json NOT NULL,
	`source` enum('clickhouse','mysql','computed','external') NOT NULL DEFAULT 'clickhouse',
	`enabled` boolean NOT NULL DEFAULT true,
	`description` text,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `state_vector_dimensions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_svd_equipment_key_version` UNIQUE(`equipment_type`,`dimension_key`,`version`)
);
--> statement-breakpoint
CREATE TABLE `state_vector_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`synthesized_at` timestamp(3) NOT NULL,
	`dimension_values` json NOT NULL,
	`normalized_values` json NOT NULL,
	`completeness` double NOT NULL,
	`freshness_seconds` double NOT NULL,
	`missing_dimensions` json,
	`defaulted_dimensions` json,
	`total_data_points` int NOT NULL DEFAULT 0,
	`duration_ms` int,
	`bpa_log` json,
	`fusion_summary` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `state_vector_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tool_definitions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`input_schema` json NOT NULL,
	`output_schema` json NOT NULL,
	`permissions` json,
	`version` varchar(20) NOT NULL DEFAULT '1.0.0',
	`executor` text NOT NULL,
	`loop_stage` enum('perception','diagnosis','guardrail','evolution','utility'),
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_td_name_version` UNIQUE(`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `twin_config_audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`user_name` varchar(128),
	`module` varchar(64) NOT NULL,
	`config_key` varchar(128) NOT NULL,
	`action` enum('create','update','delete','rollback','batch_update','simulate') NOT NULL,
	`old_value` json,
	`new_value` json,
	`old_version` varchar(32),
	`new_version` varchar(32),
	`impact_score` int DEFAULT 0,
	`reason` text,
	`ip_address` varchar(45),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `twin_config_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `twin_config_simulation_runs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`module` varchar(64) NOT NULL,
	`temp_config` json NOT NULL,
	`baseline_config` json NOT NULL,
	`result` json,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`duration_ms` int,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`completed_at` timestamp(3),
	CONSTRAINT `twin_config_simulation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `twin_config_snapshot` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`snapshot_type` enum('auto','manual','pre_rollback') NOT NULL DEFAULT 'auto',
	`snapshot_name` varchar(256),
	`layer_id` varchar(16),
	`module` varchar(64),
	`config_data` json NOT NULL,
	`layer_switches` json,
	`checksum` varchar(64),
	`created_by` varchar(64) NOT NULL DEFAULT 'system',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3),
	CONSTRAINT `twin_config_snapshot_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `twin_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`machine_id` varchar(64) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`source_node` varchar(128) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`event_timestamp` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `twin_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_te_event_id` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `twin_layer_switches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`layer_id` varchar(16) NOT NULL,
	`layer_name` varchar(64) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`description` text,
	`updated_by` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `twin_layer_switches_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_tls_layer` UNIQUE(`layer_id`)
);
--> statement-breakpoint
CREATE TABLE `twin_outbox` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`aggregate_type` varchar(64) NOT NULL,
	`aggregate_id` varchar(128) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','sent','dead_letter') NOT NULL DEFAULT 'pending',
	`retry_count` int NOT NULL DEFAULT 0,
	`processed` boolean NOT NULL DEFAULT false,
	`processed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`sent_at` timestamp(3),
	CONSTRAINT `twin_outbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `twin_sync_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`machine_id` varchar(64) NOT NULL,
	`sync_mode` enum('cdc','polling') NOT NULL,
	`sync_type` varchar(30),
	`event_type` varchar(64) NOT NULL,
	`latency_ms` int,
	`sensor_count` int,
	`duration_ms` int,
	`state_snapshot` json,
	`health_index` double,
	`metadata` json,
	`error_message` text,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `twin_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `world_model_predictions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`snapshot_id` bigint NOT NULL,
	`horizon_minutes` int NOT NULL,
	`predicted_state` json NOT NULL,
	`actual_state` json,
	`error` double,
	`validated_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `world_model_predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `world_model_snapshots` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`machine_id` varchar(100) NOT NULL,
	`timestamp` timestamp(3) NOT NULL,
	`state_vector` json NOT NULL,
	`constraints` json,
	`transition_prob` text,
	`health_index` double,
	`predictions` json,
	`condition_id` varchar(100),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `world_model_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ael_ai` ON `alert_event_log` (`alert_id`);--> statement-breakpoint
CREATE INDEX `idx_ael_ri` ON `alert_event_log` (`rule_id`);--> statement-breakpoint
CREATE INDEX `idx_ael_dc` ON `alert_event_log` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_ar_device_type` ON `alert_rules` (`device_type`);--> statement-breakpoint
CREATE INDEX `idx_ar_measurement` ON `alert_rules` (`measurement_type`);--> statement-breakpoint
CREATE INDEX `idx_ar_severity` ON `alert_rules` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_ar_time` ON `alert_rules` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ac_status` ON `algorithm_compositions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ac_template` ON `algorithm_compositions` (`is_template`);--> statement-breakpoint
CREATE INDEX `idx_ad_cat` ON `algorithm_definitions` (`category`);--> statement-breakpoint
CREATE INDEX `idx_ad_impl` ON `algorithm_definitions` (`impl_type`);--> statement-breakpoint
CREATE INDEX `idx_ad_status` ON `algorithm_definitions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ad_subcategory` ON `algorithm_definitions` (`subcategory`);--> statement-breakpoint
CREATE INDEX `idx_adb_device` ON `algorithm_device_bindings` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_adb_algo` ON `algorithm_device_bindings` (`algo_code`);--> statement-breakpoint
CREATE INDEX `idx_adb_status` ON `algorithm_device_bindings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ae_algo` ON `algorithm_executions` (`algo_code`);--> statement-breakpoint
CREATE INDEX `idx_ae_device` ON `algorithm_executions` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_ae_status` ON `algorithm_executions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ae_time` ON `algorithm_executions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ae_binding` ON `algorithm_executions` (`binding_id`);--> statement-breakpoint
CREATE INDEX `idx_ae_ab` ON `algorithm_executions` (`ab_group`);--> statement-breakpoint
CREATE INDEX `idx_arr_binding` ON `algorithm_routing_rules` (`binding_id`);--> statement-breakpoint
CREATE INDEX `idx_arr_priority` ON `algorithm_routing_rules` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_arr_status` ON `algorithm_routing_rules` (`status`);--> statement-breakpoint
CREATE INDEX `idx_am_mc` ON `anomaly_models` (`model_code`);--> statement-breakpoint
CREATE INDEX `idx_am_mt` ON `anomaly_models` (`model_type`);--> statement-breakpoint
CREATE INDEX `idx_am_s` ON `anomaly_models` (`status`);--> statement-breakpoint
CREATE INDEX `idx_atl_type` ON `async_task_log` (`task_type`);--> statement-breakpoint
CREATE INDEX `idx_atl_status` ON `async_task_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_atl_time` ON `async_task_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_al_action` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `idx_al_resource` ON `audit_logs` (`resource_type`);--> statement-breakpoint
CREATE INDEX `idx_al_resource_id` ON `audit_logs` (`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_al_operator` ON `audit_logs` (`operator`);--> statement-breakpoint
CREATE INDEX `idx_al_trace` ON `audit_logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_al_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_als_ali` ON `audit_logs_sensitive` (`audit_log_id`);--> statement-breakpoint
CREATE INDEX `idx_als_st` ON `audit_logs_sensitive` (`sensitive_type`);--> statement-breakpoint
CREATE INDEX `idx_ccl_config` ON `config_change_logs` (`config_id`);--> statement-breakpoint
CREATE INDEX `idx_ccl_time` ON `config_change_logs` (`changed_at`);--> statement-breakpoint
CREATE INDEX `idx_da_asset_code` ON `data_assets` (`asset_code`);--> statement-breakpoint
CREATE INDEX `idx_da_type` ON `data_assets` (`asset_type`);--> statement-breakpoint
CREATE INDEX `idx_db_endpoint` ON `data_bindings` (`endpoint_id`);--> statement-breakpoint
CREATE INDEX `idx_db_target` ON `data_bindings` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_db_status` ON `data_bindings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dcr_ti` ON `data_clean_results` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_dcr_sri` ON `data_clean_results` (`source_row_id`);--> statement-breakpoint
CREATE INDEX `idx_dcr_s` ON `data_clean_results` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dcm_task` ON `data_collection_metrics` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_dcm_date` ON `data_collection_metrics` (`metric_date`);--> statement-breakpoint
CREATE INDEX `idx_dct_ti` ON `data_collection_tasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_dct_gi` ON `data_collection_tasks` (`gateway_id`);--> statement-breakpoint
CREATE INDEX `idx_dct_tt` ON `data_collection_tasks` (`task_type`);--> statement-breakpoint
CREATE INDEX `idx_dc_protocol` ON `data_connectors` (`protocol_type`);--> statement-breakpoint
CREATE INDEX `idx_dc_status` ON `data_connectors` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dc_source_ref` ON `data_connectors` (`source_ref`);--> statement-breakpoint
CREATE INDEX `idx_de_connector` ON `data_endpoints` (`connector_id`);--> statement-breakpoint
CREATE INDEX `idx_de_resource_type` ON `data_endpoints` (`resource_type`);--> statement-breakpoint
CREATE INDEX `idx_de_sensor` ON `data_endpoints` (`sensor_id`);--> statement-breakpoint
CREATE INDEX `idx_de_status` ON `data_endpoints` (`status`);--> statement-breakpoint
CREATE INDEX `idx_det_type` ON `data_export_tasks` (`export_type`);--> statement-breakpoint
CREATE INDEX `idx_det_status` ON `data_export_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_det_creator` ON `data_export_tasks` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_det_time` ON `data_export_tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dgj_policy` ON `data_governance_jobs` (`policy_id`);--> statement-breakpoint
CREATE INDEX `idx_dgj_type` ON `data_governance_jobs` (`job_type`);--> statement-breakpoint
CREATE INDEX `idx_dgj_status` ON `data_governance_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dlp_policy_code` ON `data_lifecycle_policies` (`policy_code`);--> statement-breakpoint
CREATE INDEX `idx_dlp_target` ON `data_lifecycle_policies` (`target_table`);--> statement-breakpoint
CREATE INDEX `idx_dl_source` ON `data_lineage` (`source_type`);--> statement-breakpoint
CREATE INDEX `idx_dl_target` ON `data_lineage` (`target_type`);--> statement-breakpoint
CREATE INDEX `idx_dl_time` ON `data_lineage` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dds_dc` ON `device_daily_summary` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_dfv_dt` ON `device_firmware_versions` (`device_type`);--> statement-breakpoint
CREATE INDEX `idx_dfv_s` ON `device_firmware_versions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dml_dc` ON `device_maintenance_logs` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_dml_mt` ON `device_maintenance_logs` (`maintenance_type`);--> statement-breakpoint
CREATE INDEX `idx_dpc_device` ON `device_protocol_config` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_dpc_protocol` ON `device_protocol_config` (`protocol_type`);--> statement-breakpoint
CREATE INDEX `idx_dpc_status` ON `device_protocol_config` (`status`);--> statement-breakpoint
CREATE INDEX `idx_drv_rule` ON `device_rule_versions` (`rule_id`);--> statement-breakpoint
CREATE INDEX `idx_drv_current` ON `device_rule_versions` (`is_current`);--> statement-breakpoint
CREATE INDEX `idx_drv_status` ON `device_rule_versions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dsl_dc` ON `device_status_log` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_dr_ti` ON `diagnosis_results` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_dr_dc` ON `diagnosis_results` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_dr_dt` ON `diagnosis_results` (`diagnosis_type`);--> statement-breakpoint
CREATE INDEX `idx_egc_gc` ON `edge_gateway_config` (`gateway_code`);--> statement-breakpoint
CREATE INDEX `idx_egc_gt` ON `edge_gateway_config` (`gateway_type`);--> statement-breakpoint
CREATE INDEX `idx_egc_s` ON `edge_gateway_config` (`status`);--> statement-breakpoint
CREATE INDEX `idx_eg_gw_id` ON `edge_gateways` (`gateway_id`);--> statement-breakpoint
CREATE INDEX `idx_eg_status` ON `edge_gateways` (`status`);--> statement-breakpoint
CREATE INDEX `idx_kc_di` ON `kb_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_kc_ei` ON `kb_chunks` (`embedding_id`);--> statement-breakpoint
CREATE INDEX `idx_kcm_ci` ON `kb_conversation_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_kconv_ci` ON `kb_conversations` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_kconv_ui` ON `kb_conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ke_ci` ON `kb_embeddings` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_kqp_ci` ON `kb_qa_pairs` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_kqp_sdi` ON `kb_qa_pairs` (`source_document_id`);--> statement-breakpoint
CREATE INDEX `idx_kgdp_run` ON `kg_diagnosis_paths` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_kgdr_graph` ON `kg_diagnosis_runs` (`graph_id`);--> statement-breakpoint
CREATE INDEX `idx_kgdr_status` ON `kg_diagnosis_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_kgel_graph` ON `kg_evolution_log` (`graph_id`);--> statement-breakpoint
CREATE INDEX `idx_kgel_type` ON `kg_evolution_log` (`evolution_type`);--> statement-breakpoint
CREATE INDEX `idx_kge_graph` ON `kg_graph_edges` (`graph_id`);--> statement-breakpoint
CREATE INDEX `idx_kge_source` ON `kg_graph_edges` (`source_node_id`);--> statement-breakpoint
CREATE INDEX `idx_kge_target` ON `kg_graph_edges` (`target_node_id`);--> statement-breakpoint
CREATE INDEX `idx_kgn_graph` ON `kg_graph_nodes` (`graph_id`);--> statement-breakpoint
CREATE INDEX `idx_kgn_category` ON `kg_graph_nodes` (`category`);--> statement-breakpoint
CREATE INDEX `idx_mql_topic` ON `message_queue_log` (`topic`);--> statement-breakpoint
CREATE INDEX `idx_mql_status` ON `message_queue_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mql_time` ON `message_queue_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mfm_ct` ON `minio_file_metadata` (`content_type`);--> statement-breakpoint
CREATE INDEX `idx_mul_s` ON `minio_upload_logs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_md_mi` ON `model_deployments` (`model_id`);--> statement-breakpoint
CREATE INDEX `idx_md_gt` ON `model_deployments` (`gpu_type`);--> statement-breakpoint
CREATE INDEX `idx_md_s` ON `model_deployments` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mil_di` ON `model_inference_logs` (`deployment_id`);--> statement-breakpoint
CREATE INDEX `idx_mil_ri` ON `model_inference_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_mil_s` ON `model_inference_logs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mr_mc` ON `model_registry` (`model_code`);--> statement-breakpoint
CREATE INDEX `idx_mr_mt` ON `model_registry` (`model_type`);--> statement-breakpoint
CREATE INDEX `idx_mr_s` ON `model_registry` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mtj_mi` ON `model_training_jobs` (`model_id`);--> statement-breakpoint
CREATE INDEX `idx_mtj_gt` ON `model_training_jobs` (`gpu_type`);--> statement-breakpoint
CREATE INDEX `idx_mtj_s` ON `model_training_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pe_instance` ON `plugin_events` (`instance_id`);--> statement-breakpoint
CREATE INDEX `idx_pe_type` ON `plugin_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_pe_time` ON `plugin_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_pi_plugin` ON `plugin_instances` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `idx_pi_entity` ON `plugin_instances` (`bound_entity_type`);--> statement-breakpoint
CREATE INDEX `idx_pi_status` ON `plugin_instances` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pr_type` ON `plugin_registry` (`plugin_type`);--> statement-breakpoint
CREATE INDEX `idx_pr_status` ON `plugin_registry` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rdl_dc` ON `realtime_data_latest` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_rdl_mc` ON `realtime_data_latest` (`mp_code`);--> statement-breakpoint
CREATE INDEX `idx_rt_gw_dev` ON `realtime_telemetry` (`gateway_id`,`device_code`);--> statement-breakpoint
CREATE INDEX `idx_rt_ts` ON `realtime_telemetry` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_rt_sync` ON `realtime_telemetry` (`synced_to_ch`);--> statement-breakpoint
CREATE INDEX `idx_rt_table` ON `rollback_triggers` (`target_table`);--> statement-breakpoint
CREATE INDEX `idx_st_type` ON `scheduled_tasks` (`task_type`);--> statement-breakpoint
CREATE INDEX `idx_st_status` ON `scheduled_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_st_next_run` ON `scheduled_tasks` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_smp_sensor` ON `sensor_mp_mapping` (`sensor_id`);--> statement-breakpoint
CREATE INDEX `idx_smp_mp` ON `sensor_mp_mapping` (`mp_id`);--> statement-breakpoint
CREATE INDEX `idx_smp_status` ON `sensor_mp_mapping` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sc_category` ON `system_configs` (`category`);--> statement-breakpoint
CREATE INDEX `idx_ta_ni` ON `topo_alerts` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_ta_at` ON `topo_alerts` (`alert_type`);--> statement-breakpoint
CREATE INDEX `idx_tl_lc` ON `topo_layers` (`layer_code`);--> statement-breakpoint
CREATE INDEX `idx_v1a_dc` ON `vibration_1hour_agg` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_v1a_mc` ON `vibration_1hour_agg` (`mp_code`);--> statement-breakpoint
CREATE INDEX `idx_bpa_equipment` ON `bpa_configs` (`equipment_type`);--> statement-breakpoint
CREATE INDEX `idx_bpa_condition` ON `bpa_configs` (`condition_phase`);--> statement-breakpoint
CREATE INDEX `idx_bpa_enabled` ON `bpa_configs` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_cd_experiment` ON `canary_deployments` (`experiment_id`);--> statement-breakpoint
CREATE INDEX `idx_cd_model` ON `canary_deployments` (`model_id`);--> statement-breakpoint
CREATE INDEX `idx_cd_status` ON `canary_deployments` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cts_deployment` ON `canary_traffic_splits` (`deployment_id`);--> statement-breakpoint
CREATE INDEX `idx_cts_machine` ON `canary_traffic_splits` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_ce_source_node` ON `causal_edges` (`source_node_id`);--> statement-breakpoint
CREATE INDEX `idx_ce_target_node` ON `causal_edges` (`target_node_id`);--> statement-breakpoint
CREATE INDEX `idx_ce_weight` ON `causal_edges` (`weight`);--> statement-breakpoint
CREATE INDEX `idx_cn_domain` ON `causal_nodes` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_cn_type` ON `causal_nodes` (`node_type`);--> statement-breakpoint
CREATE INDEX `idx_cn_source` ON `causal_nodes` (`source_type`);--> statement-breakpoint
CREATE INDEX `idx_cce_champion` ON `champion_challenger_experiments` (`champion_id`);--> statement-breakpoint
CREATE INDEX `idx_cce_challenger` ON `champion_challenger_experiments` (`challenger_id`);--> statement-breakpoint
CREATE INDEX `idx_cce_verdict` ON `champion_challenger_experiments` (`verdict`);--> statement-breakpoint
CREATE INDEX `idx_cdr_session` ON `cognition_dimension_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_cdr_dimension` ON `cognition_dimension_results` (`dimension`);--> statement-breakpoint
CREATE INDEX `idx_cs_machine` ON `cognition_sessions` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_cs_condition` ON `cognition_sessions` (`condition_id`);--> statement-breakpoint
CREATE INDEX `idx_cs_status` ON `cognition_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cs_time` ON `cognition_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_cs_trigger` ON `cognition_sessions` (`trigger_type`);--> statement-breakpoint
CREATE INDEX `idx_cb_profile` ON `condition_baselines` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_cb_machine` ON `condition_baselines` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_cb_status` ON `condition_baselines` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ci_profile` ON `condition_instances` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_ci_machine` ON `condition_instances` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_ci_time` ON `condition_instances` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ci_status` ON `condition_instances` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cp_industry` ON `condition_profiles` (`industry`);--> statement-breakpoint
CREATE INDEX `idx_cp_equipment` ON `condition_profiles` (`equipment_type`);--> statement-breakpoint
CREATE INDEX `idx_dpf_category` ON `diagnosis_physics_formulas` (`category`);--> statement-breakpoint
CREATE INDEX `idx_ec_type` ON `edge_cases` (`case_type`);--> statement-breakpoint
CREATE INDEX `idx_ec_status` ON `edge_cases` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ec_score` ON `edge_cases` (`anomaly_score`);--> statement-breakpoint
CREATE INDEX `idx_ec_cycle` ON `edge_cases` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `idx_ecr_module` ON `engine_config_registry` (`module`);--> statement-breakpoint
CREATE INDEX `idx_ecr_group` ON `engine_config_registry` (`module`,`config_group`);--> statement-breakpoint
CREATE INDEX `idx_ecr_enabled` ON `engine_config_registry` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_ep_type` ON `equipment_profiles` (`type`);--> statement-breakpoint
CREATE INDEX `idx_ec_status` ON `evolution_cycles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ec_time` ON `evolution_cycles` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_fd_category` ON `feature_definitions` (`category`);--> statement-breakpoint
CREATE INDEX `idx_fv_feature` ON `feature_versions` (`feature_id`);--> statement-breakpoint
CREATE INDEX `idx_grc_session` ON `grok_reasoning_chains` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_grc_step` ON `grok_reasoning_chains` (`session_id`,`step_index`);--> statement-breakpoint
CREATE INDEX `idx_grc_tool` ON `grok_reasoning_chains` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_gr_type` ON `guardrail_rules` (`type`);--> statement-breakpoint
CREATE INDEX `idx_gr_priority` ON `guardrail_rules` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_gr_enabled` ON `guardrail_rules` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_gv_rule` ON `guardrail_violations` (`rule_id`);--> statement-breakpoint
CREATE INDEX `idx_gv_session` ON `guardrail_violations` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_gv_machine` ON `guardrail_violations` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_gv_time` ON `guardrail_violations` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_gv_outcome` ON `guardrail_violations` (`outcome`);--> statement-breakpoint
CREATE INDEX `idx_kc_confidence` ON `knowledge_crystals` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_kc_kg_node` ON `knowledge_crystals` (`kg_node_id`);--> statement-breakpoint
CREATE INDEX `idx_rdl_session` ON `reasoning_decision_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_rdl_route` ON `reasoning_decision_logs` (`route`);--> statement-breakpoint
CREATE INDEX `idx_rdl_grok` ON `reasoning_decision_logs` (`grok_used`);--> statement-breakpoint
CREATE INDEX `idx_rdl_time` ON `reasoning_decision_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_re_layer` ON `reasoning_experiences` (`layer`);--> statement-breakpoint
CREATE INDEX `idx_re_domain` ON `reasoning_experiences` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_re_session` ON `reasoning_experiences` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_re_device` ON `reasoning_experiences` (`device_type`,`device_code`);--> statement-breakpoint
CREATE INDEX `idx_re_confidence` ON `reasoning_experiences` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_re_accessed` ON `reasoning_experiences` (`last_accessed_at`);--> statement-breakpoint
CREATE INDEX `idx_rl_component` ON `revision_logs` (`component`);--> statement-breakpoint
CREATE INDEX `idx_rl_entity` ON `revision_logs` (`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_rl_session` ON `revision_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_rl_time` ON `revision_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sc_profile` ON `sampling_configs` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_sem_record` ON `shadow_eval_metrics` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_sem_metric` ON `shadow_eval_metrics` (`metric_name`);--> statement-breakpoint
CREATE INDEX `idx_ser_status` ON `shadow_eval_records` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ser_baseline` ON `shadow_eval_records` (`baseline_model_id`);--> statement-breakpoint
CREATE INDEX `idx_ser_challenger` ON `shadow_eval_records` (`challenger_model_id`);--> statement-breakpoint
CREATE INDEX `idx_src_session` ON `shadow_reasoning_comparisons` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_src_time` ON `shadow_reasoning_comparisons` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sr_scenario_id` ON `simulation_results` (`scenario_id`);--> statement-breakpoint
CREATE INDEX `idx_sr_machine_id` ON `simulation_results` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_sr_risk_level` ON `simulation_results` (`risk_level`);--> statement-breakpoint
CREATE INDEX `idx_sr_created_at` ON `simulation_results` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ss_machine_id` ON `simulation_scenarios` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_ss_status` ON `simulation_scenarios` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ss_scenario_type` ON `simulation_scenarios` (`scenario_type`);--> statement-breakpoint
CREATE INDEX `idx_ss_created_at` ON `simulation_scenarios` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_svd_equipment` ON `state_vector_dimensions` (`equipment_type`);--> statement-breakpoint
CREATE INDEX `idx_svd_group` ON `state_vector_dimensions` (`dimension_group`);--> statement-breakpoint
CREATE INDEX `idx_svd_enabled` ON `state_vector_dimensions` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_svl_machine` ON `state_vector_logs` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_svl_time` ON `state_vector_logs` (`synthesized_at`);--> statement-breakpoint
CREATE INDEX `idx_svl_completeness` ON `state_vector_logs` (`completeness`);--> statement-breakpoint
CREATE INDEX `idx_td_stage` ON `tool_definitions` (`loop_stage`);--> statement-breakpoint
CREATE INDEX `idx_td_enabled` ON `tool_definitions` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_tcal_user` ON `twin_config_audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_tcal_module` ON `twin_config_audit_log` (`module`);--> statement-breakpoint
CREATE INDEX `idx_tcal_key` ON `twin_config_audit_log` (`config_key`);--> statement-breakpoint
CREATE INDEX `idx_tcal_action` ON `twin_config_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_tcal_time` ON `twin_config_audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tcsr_user` ON `twin_config_simulation_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_tcsr_module` ON `twin_config_simulation_runs` (`module`);--> statement-breakpoint
CREATE INDEX `idx_tcsr_status` ON `twin_config_simulation_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tcs_type` ON `twin_config_snapshot` (`snapshot_type`);--> statement-breakpoint
CREATE INDEX `idx_tcs_layer` ON `twin_config_snapshot` (`layer_id`);--> statement-breakpoint
CREATE INDEX `idx_tcs_module` ON `twin_config_snapshot` (`module`);--> statement-breakpoint
CREATE INDEX `idx_tcs_time` ON `twin_config_snapshot` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tcs_expires` ON `twin_config_snapshot` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_te_machine_id` ON `twin_events` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_te_event_type` ON `twin_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_te_event_timestamp` ON `twin_events` (`event_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_te_created_at` ON `twin_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_to_status` ON `twin_outbox` (`status`);--> statement-breakpoint
CREATE INDEX `idx_to_aggregate` ON `twin_outbox` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE INDEX `idx_to_event_type` ON `twin_outbox` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_to_created_at` ON `twin_outbox` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_outbox_unprocessed` ON `twin_outbox` (`processed`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tsl_machine_id` ON `twin_sync_logs` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_tsl_sync_mode` ON `twin_sync_logs` (`sync_mode`);--> statement-breakpoint
CREATE INDEX `idx_tsl_event_type` ON `twin_sync_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_tsl_created_at` ON `twin_sync_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_wmp_snapshot` ON `world_model_predictions` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_wmp_horizon` ON `world_model_predictions` (`horizon_minutes`);--> statement-breakpoint
CREATE INDEX `idx_wms_machine` ON `world_model_snapshots` (`machine_id`);--> statement-breakpoint
CREATE INDEX `idx_wms_time` ON `world_model_snapshots` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_wms_condition` ON `world_model_snapshots` (`condition_id`);