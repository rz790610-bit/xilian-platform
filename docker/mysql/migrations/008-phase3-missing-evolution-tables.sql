-- =====================================================================
-- 008-phase3-missing-evolution-tables.sql
-- 补齐 evolution-schema.ts 中定义但未在 init/migration 中创建的 10 张表
-- 严格对照 drizzle/evolution-schema.ts 的字段定义
-- 全部使用 IF NOT EXISTS，幂等可重复执行
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. bpa_configs — BPA（基本概率赋值）配置表
--    用于 D-S 证据理论的模糊隶属度规则配置
-- =====================================================================
CREATE TABLE IF NOT EXISTS `bpa_configs` (
  `id` BIGINT AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL COMMENT '配置名称（如"岸桥默认配置"）',
  `equipment_type` VARCHAR(100) NOT NULL COMMENT '设备类型（如 quay_crane, rtg_crane）',
  `condition_phase` VARCHAR(100) COMMENT '适用工况（null 表示通用）',
  `hypotheses` JSON NOT NULL COMMENT '假设空间（辨识框架 Θ 的元素）',
  `rules` JSON NOT NULL COMMENT '模糊隶属度规则集',
  `ignorance_base` DOUBLE NOT NULL DEFAULT 0.05 COMMENT '基础不确定性',
  `min_mass_threshold` DOUBLE NOT NULL DEFAULT 0.01 COMMENT '最小信念质量阈值',
  `version` VARCHAR(20) NOT NULL DEFAULT '1.0.0' COMMENT '版本号',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `description` TEXT COMMENT '描述',
  `created_by` VARCHAR(100) COMMENT '创建者',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_bpa_equipment` (`equipment_type`),
  INDEX `idx_bpa_condition` (`condition_phase`),
  INDEX `idx_bpa_enabled` (`enabled`),
  UNIQUE INDEX `uq_bpa_name_version` (`name`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BPA 配置表 — D-S 证据理论模糊隶属度规则';

-- =====================================================================
-- 2. causal_nodes — 因果图节点
--    认知引擎因果推理图的节点定义
-- =====================================================================
CREATE TABLE IF NOT EXISTS `causal_nodes` (
  `id` BIGINT AUTO_INCREMENT,
  `node_id` VARCHAR(200) NOT NULL COMMENT '节点唯一标识',
  `label` VARCHAR(300) NOT NULL COMMENT '显示名称',
  `node_type` ENUM('symptom', 'cause', 'mechanism', 'component', 'environment') NOT NULL COMMENT '节点类型',
  `domain` VARCHAR(100) NOT NULL COMMENT '所属领域',
  `prior_probability` FLOAT COMMENT '先验概率',
  `equation_ids` JSON COMMENT '关联的物理公式 ID 列表',
  `sensor_tags` JSON COMMENT '关联的传感器标签',
  `metadata` JSON COMMENT '扩展元数据',
  `source_type` ENUM('expert', 'learned', 'hybrid') NOT NULL DEFAULT 'expert' COMMENT '来源类型',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否激活',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_cn_node_id` (`node_id`),
  INDEX `idx_cn_type` (`node_type`),
  INDEX `idx_cn_domain` (`domain`),
  INDEX `idx_cn_source` (`source_type`),
  INDEX `idx_cn_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='因果图节点 — 认知引擎因果推理';

-- =====================================================================
-- 3. causal_edges — 因果图边
--    节点之间的因果关系定义
-- =====================================================================
CREATE TABLE IF NOT EXISTS `causal_edges` (
  `id` BIGINT AUTO_INCREMENT,
  `edge_id` VARCHAR(200) NOT NULL COMMENT '边唯一标识',
  `source_node_id` VARCHAR(200) NOT NULL COMMENT '源节点 ID',
  `target_node_id` VARCHAR(200) NOT NULL COMMENT '目标节点 ID',
  `weight` FLOAT NOT NULL DEFAULT 0.5 COMMENT '因果权重 0-1',
  `mechanism` TEXT COMMENT '因果机制描述',
  `evidence_count` INT NOT NULL DEFAULT 0 COMMENT '证据计数',
  `source_type` ENUM('expert', 'learned', 'hybrid') NOT NULL DEFAULT 'expert' COMMENT '来源类型',
  `last_decay_at` TIMESTAMP(3) COMMENT '上次衰减时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ce_edge_id` (`edge_id`),
  INDEX `idx_ce_source` (`source_node_id`),
  INDEX `idx_ce_target` (`target_node_id`),
  INDEX `idx_ce_weight` (`weight`),
  INDEX `idx_ce_source_type` (`source_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='因果图边 — 节点间因果关系';

-- =====================================================================
-- 4. engine_config_registry — 认知引擎配置注册表
--    统一管理所有认知引擎模块的可调参数
-- =====================================================================
CREATE TABLE IF NOT EXISTS `engine_config_registry` (
  `id` INT AUTO_INCREMENT,
  `module` VARCHAR(100) NOT NULL COMMENT '模块标识',
  `config_group` VARCHAR(100) NOT NULL COMMENT '配置分组',
  `config_key` VARCHAR(200) NOT NULL COMMENT '配置键',
  `config_value` TEXT NOT NULL COMMENT '当前值',
  `value_type` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string' COMMENT '值类型',
  `default_value` TEXT COMMENT '默认值',
  `label` VARCHAR(300) COMMENT '显示名称',
  `description` TEXT COMMENT '描述',
  `unit` VARCHAR(50) COMMENT '单位',
  `constraints` JSON COMMENT '约束条件（min/max/enum等）',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序序号',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ecr_module_group_key` (`module`, `config_group`, `config_key`),
  INDEX `idx_ecr_module` (`module`),
  INDEX `idx_ecr_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='认知引擎配置注册表 — 统一参数管理';

-- =====================================================================
-- 5. reasoning_decision_logs — 推理决策日志
--    记录每次认知推理的完整决策过程
-- =====================================================================
CREATE TABLE IF NOT EXISTS `reasoning_decision_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `session_id` VARCHAR(200) NOT NULL COMMENT '认知会话 ID',
  `route` ENUM('fast', 'standard', 'deep', 'grok_assisted') NOT NULL COMMENT '推理路由',
  `phase_durations` JSON NOT NULL COMMENT '各阶段耗时',
  `decisions` JSON NOT NULL COMMENT '决策链路详情',
  `final_hypothesis` VARCHAR(500) COMMENT '最终假设',
  `final_confidence` FLOAT COMMENT '最终置信度',
  `physics_verified` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否经过物理验证',
  `grok_used` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否使用了 Grok',
  `grok_call_count` INT NOT NULL DEFAULT 0 COMMENT 'Grok 调用次数',
  `total_uncertainty` FLOAT COMMENT '总不确定性',
  `uncertainty_decomposition` JSON COMMENT '不确定性分解',
  `total_duration_ms` INT NOT NULL COMMENT '总耗时(ms)',
  `explanation_graph` JSON COMMENT '解释图（可视化用）',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_rdl_session` (`session_id`),
  INDEX `idx_rdl_route` (`route`),
  INDEX `idx_rdl_grok` (`grok_used`),
  INDEX `idx_rdl_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='推理决策日志 — 认知推理全链路记录';

-- =====================================================================
-- 6. reasoning_experiences — 推理经验库
--    三层记忆（情景/语义/程序）的统一存储
-- =====================================================================
CREATE TABLE IF NOT EXISTS `reasoning_experiences` (
  `id` BIGINT AUTO_INCREMENT,
  `experience_id` VARCHAR(200) NOT NULL COMMENT '经验唯一标识',
  `layer` ENUM('episodic', 'semantic', 'procedural') NOT NULL COMMENT '记忆层级',
  `session_id` VARCHAR(200) COMMENT '关联的认知会话 ID',
  `domain` VARCHAR(100) NOT NULL COMMENT '领域',
  `device_type` VARCHAR(100) COMMENT '设备类型',
  `device_code` VARCHAR(100) COMMENT '设备编码',
  `description` TEXT COMMENT '描述',
  `hypothesis` VARCHAR(500) COMMENT '假设',
  `root_cause` VARCHAR(500) COMMENT '根因',
  `resolution` TEXT COMMENT '解决方案',
  `was_correct` BOOLEAN COMMENT '是否正确',
  `confidence` FLOAT COMMENT '置信度',
  `feature_vector` JSON COMMENT '特征向量',
  `context` JSON COMMENT '上下文',
  `source_episodic_ids` JSON COMMENT '来源情景记忆 ID 列表',
  `steps` JSON COMMENT '操作步骤（程序记忆用）',
  `verification_count` INT NOT NULL DEFAULT 0 COMMENT '验证次数（语义记忆用）',
  `success_rate` FLOAT COMMENT '成功率（语义记忆用）',
  `execution_count` INT NOT NULL DEFAULT 0 COMMENT '执行次数（程序记忆用）',
  `avg_duration_ms` INT COMMENT '平均耗时 ms（程序记忆用）',
  `last_accessed_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最后访问时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_re_experience_id` (`experience_id`),
  INDEX `idx_re_layer` (`layer`),
  INDEX `idx_re_domain` (`domain`),
  INDEX `idx_re_session` (`session_id`),
  INDEX `idx_re_device` (`device_type`, `device_code`),
  INDEX `idx_re_confidence` (`confidence`),
  INDEX `idx_re_accessed` (`last_accessed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='推理经验库 — 三层记忆统一存储';

-- =====================================================================
-- 7. revision_logs — 修订日志
--    记录认知引擎自我修正的所有参数变更
-- =====================================================================
CREATE TABLE IF NOT EXISTS `revision_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `revision_id` VARCHAR(200) NOT NULL COMMENT '修订唯一标识',
  `component` ENUM('causal_edge', 'experience_weight', 'physics_param', 'bpa_config') NOT NULL COMMENT '修改的组件',
  `entity_id` VARCHAR(400) NOT NULL COMMENT '修改的实体 ID',
  `previous_value` JSON NOT NULL COMMENT '修改前的值',
  `new_value` JSON NOT NULL COMMENT '修改后的值',
  `feedback_event_type` VARCHAR(100) NOT NULL COMMENT '触发的反馈事件类型',
  `session_id` VARCHAR(200) NOT NULL COMMENT '关联的认知会话 ID',
  `rolled_back` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已回滚',
  `rolled_back_at` TIMESTAMP(3) NULL COMMENT '回滚时间',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_rl_revision_id` (`revision_id`),
  INDEX `idx_rl_component` (`component`),
  INDEX `idx_rl_entity` (`entity_id`),
  INDEX `idx_rl_session` (`session_id`),
  INDEX `idx_rl_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='修订日志 — 认知引擎自我修正记录';

-- =====================================================================
-- 8. shadow_reasoning_comparisons — 影子推理对比
--    Champion/Challenger 推理结果对比记录
-- =====================================================================
CREATE TABLE IF NOT EXISTS `shadow_reasoning_comparisons` (
  `id` BIGINT AUTO_INCREMENT,
  `session_id` VARCHAR(200) NOT NULL COMMENT '关联的认知会话 ID',
  `champion_result` JSON NOT NULL COMMENT 'Champion（旧引擎）结果',
  `challenger_result` JSON NOT NULL COMMENT 'Challenger（新引擎）结果',
  `ground_truth` VARCHAR(500) COMMENT '实际结果（人工标注后填入）',
  `champion_hit` BOOLEAN COMMENT 'Champion 是否命中',
  `challenger_hit` BOOLEAN COMMENT 'Challenger 是否命中',
  `latency_ratio` FLOAT COMMENT '延迟比（Challenger / Champion）',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_src_session` (`session_id`),
  INDEX `idx_src_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='影子推理对比 — Champion/Challenger 结果比较';

-- =====================================================================
-- 9. state_vector_dimensions — 状态向量维度定义
--    定义每种设备类型的世界模型状态向量维度
-- =====================================================================
CREATE TABLE IF NOT EXISTS `state_vector_dimensions` (
  `id` BIGINT AUTO_INCREMENT,
  `equipment_type` VARCHAR(100) NOT NULL COMMENT '设备类型',
  `dimension_index` INT NOT NULL COMMENT '维度序号（1-based）',
  `dimension_key` VARCHAR(100) NOT NULL COMMENT '维度标识（如 vibrationRms）',
  `label` VARCHAR(200) NOT NULL COMMENT '显示名称',
  `unit` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '单位',
  `dimension_group` ENUM('cycle_features', 'uncertainty_factors', 'cumulative_metrics') NOT NULL COMMENT '所属分组',
  `metric_names` JSON NOT NULL COMMENT 'ClickHouse 中的 metric_name 列表',
  `aggregation` ENUM('mean', 'max', 'min', 'rms', 'latest', 'sum', 'std') NOT NULL DEFAULT 'mean' COMMENT '聚合方法',
  `default_value` DOUBLE NOT NULL DEFAULT 0 COMMENT '默认值',
  `normalize_range` JSON NOT NULL COMMENT '归一化范围 [min, max]',
  `source` ENUM('clickhouse', 'mysql', 'computed', 'external') NOT NULL DEFAULT 'clickhouse' COMMENT '数据源类型',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `description` TEXT COMMENT '描述',
  `version` VARCHAR(20) NOT NULL DEFAULT '1.0.0' COMMENT '版本号',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_svd_equipment` (`equipment_type`),
  INDEX `idx_svd_group` (`dimension_group`),
  INDEX `idx_svd_enabled` (`enabled`),
  UNIQUE INDEX `uq_svd_equipment_key_version` (`equipment_type`, `dimension_key`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='状态向量维度定义 — 世界模型状态空间';

-- =====================================================================
-- 10. state_vector_logs — 状态向量合成日志
--     记录每次状态向量合成的完整快照
-- =====================================================================
CREATE TABLE IF NOT EXISTS `state_vector_logs` (
  `id` BIGINT AUTO_INCREMENT,
  `machine_id` VARCHAR(100) NOT NULL COMMENT '设备 ID',
  `synthesized_at` TIMESTAMP(3) NOT NULL COMMENT '合成时间戳',
  `dimension_values` JSON NOT NULL COMMENT '维度值快照',
  `normalized_values` JSON NOT NULL COMMENT '归一化后的值',
  `completeness` DOUBLE NOT NULL COMMENT '数据完整度 0-1',
  `freshness_seconds` DOUBLE NOT NULL COMMENT '数据新鲜度（秒）',
  `missing_dimensions` JSON COMMENT '缺失维度列表',
  `defaulted_dimensions` JSON COMMENT '使用默认值的维度列表',
  `total_data_points` INT NOT NULL DEFAULT 0 COMMENT '数据点总数',
  `duration_ms` INT COMMENT '合成耗时（毫秒）',
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
