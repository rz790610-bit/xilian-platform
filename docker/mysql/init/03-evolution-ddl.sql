-- ============================================================================
-- 03-evolution-ddl.sql
-- 认知进化层 & 世界模型扩展表（15 张）
--
-- 权威源: drizzle/evolution-schema.ts
-- 包含: 世界模型/数字孪生(5) + 认知引擎扩展(10)
--
-- 注意: 所有表使用 IF NOT EXISTS，可安全重复执行
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 0;

-- ==============================================
-- Section A: 世界模型 / 数字孪生（5 张表）
-- ==============================================

-- A1. 仿真场景表
CREATE TABLE IF NOT EXISTS `simulation_scenarios` (
  `id` INT AUTO_INCREMENT,
  `machine_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(256) NOT NULL,
  `description` TEXT,
  `scenario_type` VARCHAR(30) NOT NULL DEFAULT 'custom' COMMENT '场景类型: overload|thermal|degradation|resonance|typhoon|multi_factor|custom',
  `baseline_condition_id` VARCHAR(100) COMMENT '基准工况ID',
  `parameter_overrides` JSON,
  `horizon_steps` INT NOT NULL DEFAULT 30,
  `step_interval_sec` INT NOT NULL DEFAULT 60 COMMENT '步长(秒)',
  `enable_monte_carlo` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用蒙特卡洛',
  `monte_carlo_runs` INT NOT NULL DEFAULT 50,
  `method` VARCHAR(32) NOT NULL DEFAULT 'sobol_qmc',
  `status` ENUM('draft', 'running', 'completed', 'failed') NOT NULL DEFAULT 'draft',
  `task_id` VARCHAR(64) COMMENT 'BullMQ任务ID',
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(128),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ss_machine_id` (`machine_id`),
  INDEX `idx_ss_status` (`status`),
  INDEX `idx_ss_created_at` (`created_at`),
  INDEX `idx_ss_scenario_type` (`scenario_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='仿真场景配置 — 数字孪生仿真引擎';

-- A2. 仿真结果表
CREATE TABLE IF NOT EXISTS `simulation_results` (
  `id` INT AUTO_INCREMENT,
  `scenario_id` INT NOT NULL,
  `machine_id` VARCHAR(64) NOT NULL,
  `timeline` JSON COMMENT '时序轨迹 Array<{step, timestamp, stateVector, anomalies}>',
  `mean_trajectory` JSON,
  `p5_trajectory` JSON,
  `p50_trajectory` JSON,
  `p95_trajectory` JSON,
  `std_dev_by_dimension` JSON,
  `risk_level` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  `risk_assessment` JSON COMMENT '风险评估 JSON',
  `monte_carlo_runs` INT NOT NULL,
  `monte_carlo_result` JSON COMMENT '蒙特卡洛结果（如启用）',
  `sequence_type` VARCHAR(32) NOT NULL DEFAULT 'sobol',
  `duration_ms` INT NOT NULL,
  `ai_explanation` TEXT,
  `ai_maintenance_advice` TEXT,
  `grok_report` TEXT COMMENT 'Grok润色的中文报告',
  `warnings` JSON COMMENT '建议动作 string[]',
  `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号',
  `completed_at` TIMESTAMP(3) NULL COMMENT '完成时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_sr_scenario_id` (`scenario_id`),
  INDEX `idx_sr_machine_id` (`machine_id`),
  INDEX `idx_sr_risk_level` (`risk_level`),
  INDEX `idx_sr_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='仿真结果 — 蒙特卡洛轨迹 + 风险评估';

-- A3. 孪生同步日志表
CREATE TABLE IF NOT EXISTS `twin_sync_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `machine_id` VARCHAR(64) NOT NULL,
  `sync_mode` ENUM('cdc', 'polling') NOT NULL,
  `sync_type` VARCHAR(30) COMMENT '同步类型: telemetry_ingest|snapshot_persist|config_update',
  `event_type` VARCHAR(64) NOT NULL,
  `latency_ms` INT,
  `sensor_count` INT COMMENT '同步的传感器数量',
  `duration_ms` INT COMMENT '同步耗时(ms)',
  `state_snapshot` JSON,
  `health_index` DOUBLE,
  `metadata` JSON,
  `error_message` TEXT COMMENT '错误信息(如有)',
  `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_tsl_machine_id` (`machine_id`),
  INDEX `idx_tsl_sync_mode` (`sync_mode`),
  INDEX `idx_tsl_event_type` (`event_type`),
  INDEX `idx_tsl_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='孪生同步日志 — StateSyncEngine 同步事件';

-- A4. 孪生事件表
CREATE TABLE IF NOT EXISTS `twin_events` (
  `id` BIGINT AUTO_INCREMENT,
  `event_id` VARCHAR(36) NOT NULL,
  `machine_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `source_node` VARCHAR(128) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `event_timestamp` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_te_event_id` (`event_id`),
  INDEX `idx_te_machine_id` (`machine_id`),
  INDEX `idx_te_event_type` (`event_type`),
  INDEX `idx_te_event_timestamp` (`event_timestamp`),
  INDEX `idx_te_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='孪生事件持久化 — TwinEventBus 事件回放';

-- A5. Outbox 表
CREATE TABLE IF NOT EXISTS `twin_outbox` (
  `id` BIGINT AUTO_INCREMENT,
  `aggregate_type` VARCHAR(64) NOT NULL,
  `aggregate_id` VARCHAR(128) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('pending', 'sent', 'dead_letter') NOT NULL DEFAULT 'pending',
  `retry_count` INT NOT NULL DEFAULT 0,
  `processed` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已处理',
  `processed_at` TIMESTAMP(3) NULL COMMENT '处理时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` TIMESTAMP(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_to_status` (`status`),
  INDEX `idx_to_aggregate` (`aggregate_type`, `aggregate_id`),
  INDEX `idx_to_event_type` (`event_type`),
  INDEX `idx_to_created_at` (`created_at`),
  INDEX `idx_outbox_unprocessed` (`processed`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Outbox Pattern — 事务性事件发布';

-- ==============================================
-- Section B: 认知引擎扩展（10 张表）
-- ==============================================

-- B1. BPA 模糊隶属度规则配置
CREATE TABLE IF NOT EXISTS `bpa_configs` (
  `id` INT AUTO_INCREMENT,
  `machine_type` VARCHAR(64) NOT NULL COMMENT '设备类型',
  `dimension` VARCHAR(64) NOT NULL COMMENT '维度名称',
  `indicator` VARCHAR(64) NOT NULL COMMENT '指标名称',
  `membership_func` JSON NOT NULL COMMENT '隶属度函数参数 JSON',
  `weight` DOUBLE NOT NULL DEFAULT 1.0 COMMENT '权重',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_bpa_dim_ind` (`machine_type`, `dimension`, `indicator`),
  INDEX `idx_bpa_machine_type` (`machine_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='D-S 证据理论 BPA 配置';

-- B2. 因果图节点
CREATE TABLE IF NOT EXISTS `causal_nodes` (
  `id` INT AUTO_INCREMENT,
  `machine_type` VARCHAR(64) NOT NULL COMMENT '设备类型',
  `node_key` VARCHAR(128) NOT NULL COMMENT '节点唯一标识',
  `label` VARCHAR(256) NOT NULL COMMENT '节点显示名',
  `node_type` VARCHAR(32) NOT NULL DEFAULT 'variable' COMMENT 'variable|intervention|outcome',
  `metadata` JSON COMMENT '额外元数据',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_cn_type_key` (`machine_type`, `node_key`),
  INDEX `idx_cn_machine_type` (`machine_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='因果推理图节点';

-- B3. 因果图边
CREATE TABLE IF NOT EXISTS `causal_edges` (
  `id` INT AUTO_INCREMENT,
  `machine_type` VARCHAR(64) NOT NULL COMMENT '设备类型',
  `source_key` VARCHAR(128) NOT NULL COMMENT '源节点 key',
  `target_key` VARCHAR(128) NOT NULL COMMENT '目标节点 key',
  `edge_type` VARCHAR(32) NOT NULL DEFAULT 'causal' COMMENT 'causal|correlation|inhibit',
  `strength` DOUBLE NOT NULL DEFAULT 1.0 COMMENT '边强度 0~1',
  `metadata` JSON COMMENT '额外元数据',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_ce_edge` (`machine_type`, `source_key`, `target_key`),
  INDEX `idx_ce_machine_type` (`machine_type`),
  INDEX `idx_ce_source` (`source_key`),
  INDEX `idx_ce_target` (`target_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='因果推理图边';

-- B4. 认知引擎统一参数配置注册表
CREATE TABLE IF NOT EXISTS `engine_config_registry` (
  `id` INT AUTO_INCREMENT,
  `config_key` VARCHAR(128) NOT NULL COMMENT '配置键',
  `config_value` JSON NOT NULL COMMENT '配置值 JSON',
  `scope` VARCHAR(64) NOT NULL DEFAULT 'global' COMMENT 'global|machine_type|machine_id',
  `scope_id` VARCHAR(128) COMMENT '作用域 ID（当 scope 非 global 时）',
  `description` TEXT COMMENT '配置说明',
  `version` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_ecr_key_scope` (`config_key`, `scope`, `scope_id`),
  INDEX `idx_ecr_scope` (`scope`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='认知引擎统一参数配置';

-- B5. 推理全链路决策日志
CREATE TABLE IF NOT EXISTS `reasoning_decision_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `session_id` VARCHAR(64) NOT NULL COMMENT '认知会话 ID',
  `machine_id` VARCHAR(64) NOT NULL,
  `stage` VARCHAR(64) NOT NULL COMMENT '推理阶段',
  `input_summary` JSON COMMENT '输入摘要',
  `output_summary` JSON COMMENT '输出摘要',
  `decision` VARCHAR(256) COMMENT '决策结论',
  `confidence` DOUBLE COMMENT '置信度',
  `duration_ms` INT COMMENT '耗时 ms',
  `metadata` JSON COMMENT '额外元数据',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_rdl_session` (`session_id`),
  INDEX `idx_rdl_machine` (`machine_id`),
  INDEX `idx_rdl_stage` (`stage`),
  INDEX `idx_rdl_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='推理决策全链路日志';

-- B6. 三层记忆统一存储
CREATE TABLE IF NOT EXISTS `reasoning_experiences` (
  `id` BIGINT AUTO_INCREMENT,
  `machine_type` VARCHAR(64) NOT NULL COMMENT '设备类型',
  `memory_type` VARCHAR(32) NOT NULL COMMENT 'episodic|semantic|procedural',
  `category` VARCHAR(64) NOT NULL COMMENT '记忆分类',
  `content` JSON NOT NULL COMMENT '记忆内容',
  `embedding_vector` JSON COMMENT '向量嵌入（用于语义检索）',
  `importance` DOUBLE NOT NULL DEFAULT 0.5 COMMENT '重要度 0~1',
  `access_count` INT NOT NULL DEFAULT 0 COMMENT '访问次数',
  `last_accessed_at` TIMESTAMP(3) NULL COMMENT '最后访问时间',
  `expires_at` TIMESTAMP(3) NULL COMMENT '过期时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_re_machine_type` (`machine_type`),
  INDEX `idx_re_memory_type` (`memory_type`),
  INDEX `idx_re_category` (`category`),
  INDEX `idx_re_importance` (`importance`),
  INDEX `idx_re_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='三层记忆统一存储 — 情景/语义/程序';

-- B7. 认知引擎参数变更审计
CREATE TABLE IF NOT EXISTS `revision_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `target_type` VARCHAR(64) NOT NULL COMMENT '变更目标类型',
  `target_id` VARCHAR(128) NOT NULL COMMENT '变更目标 ID',
  `field_name` VARCHAR(128) NOT NULL COMMENT '变更字段',
  `old_value` JSON COMMENT '旧值',
  `new_value` JSON COMMENT '新值',
  `reason` TEXT COMMENT '变更原因',
  `operator` VARCHAR(128) NOT NULL COMMENT '操作者（系统/用户）',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_rl_target` (`target_type`, `target_id`),
  INDEX `idx_rl_field` (`field_name`),
  INDEX `idx_rl_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='认知引擎参数变更审计日志';

-- B8. Champion/Challenger 影子评估对比
CREATE TABLE IF NOT EXISTS `shadow_reasoning_comparisons` (
  `id` BIGINT AUTO_INCREMENT,
  `experiment_id` INT NOT NULL COMMENT '实验 ID',
  `machine_id` VARCHAR(64) NOT NULL,
  `session_id` VARCHAR(64) NOT NULL COMMENT '认知会话 ID',
  `champion_result` JSON NOT NULL COMMENT 'Champion 结果',
  `challenger_result` JSON NOT NULL COMMENT 'Challenger 结果',
  `divergence_score` DOUBLE COMMENT '分歧度',
  `winner` VARCHAR(32) COMMENT 'champion|challenger|tie',
  `metadata` JSON COMMENT '额外元数据',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_src_experiment` (`experiment_id`),
  INDEX `idx_src_machine` (`machine_id`),
  INDEX `idx_src_session` (`session_id`),
  INDEX `idx_src_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='影子评估 Champion/Challenger 对比';

-- B9. 状态向量维度定义
CREATE TABLE IF NOT EXISTS `state_vector_dimensions` (
  `id` INT AUTO_INCREMENT,
  `machine_type` VARCHAR(64) NOT NULL COMMENT '设备类型',
  `dimension_key` VARCHAR(128) NOT NULL COMMENT '维度标识',
  `display_name` VARCHAR(256) NOT NULL COMMENT '显示名',
  `unit` VARCHAR(32) COMMENT '单位',
  `data_source` VARCHAR(64) NOT NULL COMMENT '数据来源: sensor|derived|model',
  `source_config` JSON COMMENT '数据源配置',
  `normal_range` JSON COMMENT '正常范围 {min, max}',
  `weight` DOUBLE NOT NULL DEFAULT 1.0 COMMENT '在状态向量中的权重',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_svd_type_key` (`machine_type`, `dimension_key`),
  INDEX `idx_svd_machine_type` (`machine_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='状态向量维度定义 — 世界模型配置';

-- B10. 状态向量合成日志
CREATE TABLE IF NOT EXISTS `state_vector_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `machine_id` VARCHAR(64) NOT NULL COMMENT '设备 ID',
  `synthesized_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '合成时间',
  `dimension_count` INT NOT NULL COMMENT '维度数量',
  `completeness` DOUBLE NOT NULL COMMENT '完整度 0~1',
  `state_vector` JSON NOT NULL COMMENT '状态向量快照',
  `health_index` DOUBLE COMMENT '综合健康指数',
  `anomaly_flags` JSON COMMENT '异常标记',
  `bpa_log` JSON COMMENT 'BPA 构建日志',
  `fusion_summary` JSON COMMENT '融合结果摘要',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_svl_machine` (`machine_id`),
  INDEX `idx_svl_time` (`synthesized_at`),
  INDEX `idx_svl_completeness` (`completeness`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='状态向量合成日志 — 世界模型快照';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 验证：共 15 张表
-- ============================================================================
SELECT CONCAT('✅ evolution DDL 执行完成，共创建 ', COUNT(*), ' 张表') AS result
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN (
  'simulation_scenarios', 'simulation_results', 'twin_sync_logs', 'twin_events', 'twin_outbox',
  'bpa_configs', 'causal_nodes', 'causal_edges', 'engine_config_registry',
  'reasoning_decision_logs', 'reasoning_experiences', 'revision_logs',
  'shadow_reasoning_comparisons', 'state_vector_dimensions', 'state_vector_logs'
);
