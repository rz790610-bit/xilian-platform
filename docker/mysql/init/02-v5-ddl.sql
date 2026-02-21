-- ============================================================================
-- 深度进化 v5.0 — 24 张新表 DDL（MySQL 8.0+）
-- 执行方式: mysql -u portai -pportai123 portai_nexus < docker/mysql/init/02-v5-ddl.sql
-- ============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================================================
-- ① 感知阶段（4 张）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `condition_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `industry` varchar(100) NOT NULL,
  `equipment_type` varchar(100) NOT NULL,
  `description` text,
  `parameters` json NOT NULL COMMENT '参数定义 [{name, range:[min,max], unit, description}]',
  `sensor_mapping` json NOT NULL COMMENT '传感器映射 [{logicalName, physicalChannel, samplingRate, unit}]',
  `threshold_strategy` json NOT NULL COMMENT '阈值策略 {type, staticThresholds?, dynamicConfig?}',
  `cognition_config` json NOT NULL COMMENT '认知配置 {perceptionSensitivity, reasoningDepth, fusionStrategy, decisionUrgency}',
  `guardrail_overrides` json DEFAULT NULL COMMENT '护栏规则覆盖',
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cp_industry` (`industry`),
  INDEX `idx_cp_equipment` (`equipment_type`),
  UNIQUE INDEX `uq_cp_name_version` (`name`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `condition_instances` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `profile_id` bigint NOT NULL,
  `machine_id` varchar(100) NOT NULL,
  `started_at` timestamp(3) NOT NULL,
  `ended_at` timestamp(3) DEFAULT NULL,
  `trigger` enum('auto_detection','manual','scheduler','threshold_breach') NOT NULL,
  `state_snapshot` json DEFAULT NULL COMMENT '切换时的关键参数快照',
  `status` enum('active','completed','aborted') NOT NULL DEFAULT 'active',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ci_profile` (`profile_id`),
  INDEX `idx_ci_machine` (`machine_id`),
  INDEX `idx_ci_time` (`started_at`),
  INDEX `idx_ci_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_definitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `category` enum('time_domain','freq_domain','statistical','derived','physics') NOT NULL,
  `description` text,
  `input_signals` json NOT NULL COMMENT '输入信号列表',
  `compute_logic` text NOT NULL COMMENT '计算逻辑',
  `applicable_equipment` json NOT NULL COMMENT '适用设备类型',
  `output_unit` varchar(50) DEFAULT NULL,
  `output_range` json DEFAULT NULL,
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_fd_name_version` (`name`, `version`),
  INDEX `idx_fd_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_versions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `feature_id` bigint NOT NULL,
  `version` varchar(20) NOT NULL,
  `changelog` text,
  `schema` json DEFAULT NULL COMMENT '输出 Schema JSON',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_fv_feature` (`feature_id`),
  UNIQUE INDEX `uq_fv_feature_version` (`feature_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ② 诊断阶段（6 张）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `cognition_sessions` (
  `id` varchar(64) NOT NULL,
  `machine_id` varchar(100) NOT NULL,
  `condition_id` varchar(100) DEFAULT NULL,
  `cycle_phase` varchar(50) DEFAULT NULL,
  `trigger_type` enum('anomaly','scheduled','manual','chain','drift','guardrail_feedback') NOT NULL,
  `priority` enum('critical','high','normal') NOT NULL DEFAULT 'normal',
  `status` enum('running','completed','failed','timeout') NOT NULL DEFAULT 'running',
  `safety_score` double DEFAULT NULL COMMENT '安全评分 0-1',
  `health_score` double DEFAULT NULL COMMENT '健康评分 0-1',
  `efficiency_score` double DEFAULT NULL COMMENT '高效评分 0-1',
  `diagnostics_json` json DEFAULT NULL COMMENT '详细诊断条目',
  `predictions_json` json DEFAULT NULL COMMENT '预测信息',
  `grok_explanation` text COMMENT 'Grok 推理解释',
  `grok_reasoning_steps` int DEFAULT 0,
  `total_processing_time_ms` int DEFAULT NULL,
  `started_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cs_machine` (`machine_id`),
  INDEX `idx_cs_condition` (`condition_id`),
  INDEX `idx_cs_status` (`status`),
  INDEX `idx_cs_time` (`started_at`),
  INDEX `idx_cs_trigger` (`trigger_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cognition_dimension_results` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL,
  `dimension` enum('perception','reasoning','fusion','decision') NOT NULL,
  `score` double NOT NULL,
  `evidence` json NOT NULL COMMENT '证据列表',
  `confidence` double NOT NULL,
  `processing_time_ms` int NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cdr_session` (`session_id`),
  INDEX `idx_cdr_dimension` (`dimension`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grok_reasoning_chains` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL,
  `step_index` int NOT NULL,
  `tool_name` varchar(200) NOT NULL,
  `tool_input` json NOT NULL,
  `tool_output` json DEFAULT NULL,
  `reasoning` text,
  `duration_ms` int NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_grc_session` (`session_id`),
  INDEX `idx_grc_step` (`session_id`, `step_index`),
  INDEX `idx_grc_tool` (`tool_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `world_model_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `machine_id` varchar(100) NOT NULL,
  `timestamp` timestamp(3) NOT NULL,
  `state_vector` json NOT NULL COMMENT '状态向量',
  `constraints` json DEFAULT NULL COMMENT '物理约束',
  `transition_prob` text COMMENT '状态转移概率矩阵',
  `health_index` double DEFAULT NULL COMMENT '健康指数 0-1',
  `predictions` json DEFAULT NULL COMMENT '预测结果',
  `condition_id` varchar(100) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_wms_machine` (`machine_id`),
  INDEX `idx_wms_time` (`timestamp`),
  INDEX `idx_wms_condition` (`condition_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `world_model_predictions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint NOT NULL,
  `horizon_minutes` int NOT NULL,
  `predicted_state` json NOT NULL COMMENT '预测状态',
  `actual_state` json DEFAULT NULL COMMENT '实际状态（事后填充）',
  `error` double DEFAULT NULL COMMENT '预测误差',
  `validated_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_wmp_snapshot` (`snapshot_id`),
  INDEX `idx_wmp_horizon` (`horizon_minutes`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `diagnosis_physics_formulas` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `category` enum('fatigue','wind_load','friction','corrosion','thermal','vibration','structural') NOT NULL,
  `formula` text NOT NULL,
  `variables` json NOT NULL COMMENT '变量定义',
  `applicable_equipment` json NOT NULL COMMENT '适用设备类型',
  `source` enum('physics','learned','expert') NOT NULL DEFAULT 'physics',
  `reference` text,
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_dpf_name_version` (`name`, `version`),
  INDEX `idx_dpf_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ③ 护栏阶段（2 张）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `guardrail_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `type` enum('safety','health','efficiency') NOT NULL,
  `description` text,
  `condition` json NOT NULL COMMENT '触发条件 {field, operator, threshold, ...}',
  `action` json NOT NULL COMMENT '干预动作 {action, params}',
  `priority` int NOT NULL DEFAULT 100,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `applicable_equipment` json DEFAULT NULL COMMENT '适用设备类型',
  `applicable_conditions` json DEFAULT NULL COMMENT '适用工况',
  `physical_basis` text COMMENT '物理依据',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_gr_type` (`type`),
  INDEX `idx_gr_priority` (`priority`),
  INDEX `idx_gr_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guardrail_violations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rule_id` bigint NOT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `machine_id` varchar(100) NOT NULL,
  `timestamp` timestamp(3) NOT NULL,
  `trigger_values` json NOT NULL COMMENT '触发时的实际值',
  `action` varchar(100) NOT NULL COMMENT '执行的干预动作',
  `reason` text NOT NULL COMMENT '干预原因',
  `grok_explanation` text COMMENT 'Grok 解释',
  `outcome` enum('executed','overridden','failed','pending') NOT NULL DEFAULT 'pending',
  `post_intervention_improvement` double DEFAULT NULL COMMENT '干预后改善',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_gv_rule` (`rule_id`),
  INDEX `idx_gv_session` (`session_id`),
  INDEX `idx_gv_machine` (`machine_id`),
  INDEX `idx_gv_time` (`timestamp`),
  INDEX `idx_gv_outcome` (`outcome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ④ 进化阶段（8 张）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `shadow_eval_records` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `experiment_name` varchar(200) NOT NULL,
  `baseline_model_id` varchar(100) NOT NULL,
  `challenger_model_id` varchar(100) NOT NULL,
  `data_range_start` timestamp(3) NOT NULL,
  `data_range_end` timestamp(3) NOT NULL,
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `config` json DEFAULT NULL COMMENT '评估配置',
  `started_at` timestamp(3) DEFAULT NULL,
  `completed_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ser_status` (`status`),
  INDEX `idx_ser_baseline` (`baseline_model_id`),
  INDEX `idx_ser_challenger` (`challenger_model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shadow_eval_metrics` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `record_id` bigint NOT NULL,
  `metric_name` varchar(100) NOT NULL,
  `baseline_value` double NOT NULL,
  `challenger_value` double NOT NULL,
  `improvement` double DEFAULT NULL,
  `statistical_significance` double DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_sem_record` (`record_id`),
  INDEX `idx_sem_metric` (`metric_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `champion_challenger_experiments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `champion_id` varchar(100) NOT NULL,
  `challenger_id` varchar(100) NOT NULL,
  `gate1_passed` tinyint(1) DEFAULT NULL,
  `gate2_passed` tinyint(1) DEFAULT NULL,
  `gate3_passed` tinyint(1) DEFAULT NULL,
  `tas_score` double DEFAULT NULL COMMENT 'TAS 综合保证分数',
  `verdict` enum('PROMOTE','CANARY_EXTENDED','REJECT','PENDING') DEFAULT 'PENDING',
  `promoted_at` timestamp(3) DEFAULT NULL,
  `shadow_eval_id` bigint DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cce_champion` (`champion_id`),
  INDEX `idx_cce_challenger` (`challenger_id`),
  INDEX `idx_cce_verdict` (`verdict`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `canary_deployments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `experiment_id` bigint NOT NULL,
  `model_id` varchar(100) NOT NULL,
  `traffic_percent` double NOT NULL,
  `status` enum('active','completed','rolled_back','failed') NOT NULL DEFAULT 'active',
  `rollback_reason` text,
  `metrics_snapshot` json DEFAULT NULL COMMENT '金丝雀指标快照',
  `started_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cd_experiment` (`experiment_id`),
  INDEX `idx_cd_model` (`model_id`),
  INDEX `idx_cd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `canary_traffic_splits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `deployment_id` bigint NOT NULL,
  `machine_id` varchar(100) NOT NULL,
  `assigned_model` varchar(100) NOT NULL,
  `metrics` json DEFAULT NULL COMMENT '设备级指标',
  `timestamp` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cts_deployment` (`deployment_id`),
  INDEX `idx_cts_machine` (`machine_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `knowledge_crystals` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `pattern` text NOT NULL,
  `confidence` double NOT NULL,
  `source_session_ids` json NOT NULL COMMENT '来源认知会话 ID 列表',
  `applicable_conditions` json DEFAULT NULL COMMENT '适用工况列表',
  `kg_node_id` varchar(100) DEFAULT NULL,
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `verification_count` int NOT NULL DEFAULT 0,
  `last_verified_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_kc_confidence` (`confidence`),
  INDEX `idx_kc_kg_node` (`kg_node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `evolution_cycles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `cycle_number` int NOT NULL,
  `started_at` timestamp(3) NOT NULL,
  `completed_at` timestamp(3) DEFAULT NULL,
  `status` enum('running','completed','failed','paused') NOT NULL DEFAULT 'running',
  `edge_cases_found` int DEFAULT 0,
  `hypotheses_generated` int DEFAULT 0,
  `models_evaluated` int DEFAULT 0,
  `deployed` int DEFAULT 0,
  `accuracy_before` double DEFAULT NULL,
  `accuracy_after` double DEFAULT NULL,
  `improvement_percent` double DEFAULT NULL,
  `knowledge_crystallized` int DEFAULT 0,
  `summary` text,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ec_cycle` (`cycle_number`),
  INDEX `idx_ec_status` (`status`),
  INDEX `idx_ec_time` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tool_definitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `description` text NOT NULL,
  `input_schema` json NOT NULL COMMENT '输入 Schema',
  `output_schema` json NOT NULL COMMENT '输出 Schema',
  `permissions` json DEFAULT NULL COMMENT '权限控制',
  `version` varchar(20) NOT NULL DEFAULT '1.0.0',
  `executor` text NOT NULL COMMENT '执行器引用',
  `loop_stage` enum('perception','diagnosis','guardrail','evolution','utility') DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_td_name_version` (`name`, `version`),
  INDEX `idx_td_stage` (`loop_stage`),
  INDEX `idx_td_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ⑤ 通用辅助表（4 张）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `equipment_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type` varchar(100) NOT NULL,
  `manufacturer` varchar(200) DEFAULT NULL,
  `model` varchar(200) DEFAULT NULL,
  `physical_constraints` json DEFAULT NULL COMMENT '物理约束',
  `failure_modes` json DEFAULT NULL COMMENT '故障模式',
  `world_model_config` json DEFAULT NULL COMMENT '世界模型配置',
  `maintenance_schedule` json DEFAULT NULL COMMENT '维护计划',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ep_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `condition_baselines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `profile_id` bigint NOT NULL,
  `machine_id` varchar(100) NOT NULL,
  `baseline_values` json NOT NULL COMMENT '基线值 {featureName: {mean, std, min, max, p5, p95}}',
  `sample_count` int NOT NULL,
  `status` enum('learning','converged','expired') NOT NULL DEFAULT 'learning',
  `converged_at` timestamp(3) DEFAULT NULL,
  `expires_at` timestamp(3) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cb_profile` (`profile_id`),
  INDEX `idx_cb_machine` (`machine_id`),
  INDEX `idx_cb_status` (`status`),
  UNIQUE INDEX `uq_cb_profile_machine` (`profile_id`, `machine_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sampling_configs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `profile_id` bigint NOT NULL,
  `cycle_phase` varchar(50) NOT NULL,
  `base_sampling_rate` int NOT NULL COMMENT '基础采样率 (Hz)',
  `high_freq_sampling_rate` int NOT NULL COMMENT '高频模式采样率 (Hz)',
  `high_freq_trigger` json DEFAULT NULL COMMENT '高频触发条件',
  `retention_policy` enum('all','features_only','aggregated','sampled') NOT NULL DEFAULT 'features_only',
  `compression` enum('none','delta','fft','wavelet') NOT NULL DEFAULT 'delta',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_sc_profile` (`profile_id`),
  UNIQUE INDEX `uq_sc_profile_phase` (`profile_id`, `cycle_phase`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `edge_cases` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `case_type` enum('false_positive','false_negative','extreme_condition','distribution_drift','novel_pattern') NOT NULL,
  `description` text NOT NULL,
  `data_range_start` timestamp(3) NOT NULL,
  `data_range_end` timestamp(3) NOT NULL,
  `anomaly_score` double NOT NULL COMMENT '异常评分 0-1',
  `machine_ids` json NOT NULL COMMENT '关联设备 ID 列表',
  `cycle_id` bigint DEFAULT NULL,
  `status` enum('discovered','analyzing','labeled','integrated','dismissed') NOT NULL DEFAULT 'discovered',
  `label_result` json DEFAULT NULL COMMENT '标注结果',
  `discovered_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ec_type` (`case_type`),
  INDEX `idx_ec_status` (`status`),
  INDEX `idx_ec_score` (`anomaly_score`),
  INDEX `idx_ec_cycle` (`cycle_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 完成：共 24 张表
-- ============================================================================
SELECT CONCAT('✅ v5.0 DDL 执行完成，共创建 ', COUNT(*), ' 张新表') AS result
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN (
  'condition_profiles', 'condition_instances', 'feature_definitions', 'feature_versions',
  'cognition_sessions', 'cognition_dimension_results', 'grok_reasoning_chains',
  'world_model_snapshots', 'world_model_predictions', 'diagnosis_physics_formulas',
  'guardrail_rules', 'guardrail_violations',
  'shadow_eval_records', 'shadow_eval_metrics', 'champion_challenger_experiments',
  'canary_deployments', 'canary_traffic_splits', 'knowledge_crystals',
  'evolution_cycles', 'tool_definitions',
  'equipment_profiles', 'condition_baselines', 'sampling_configs', 'edge_cases'
);
