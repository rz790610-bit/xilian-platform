-- ============================================================================
-- 算法模块建表迁移脚本
-- 数据库: xilian
-- 包含 5 张表: algorithm_definitions, algorithm_compositions,
--             algorithm_device_bindings, algorithm_executions,
--             algorithm_routing_rules
-- 生成时间: 2026-02-14
-- ============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. 算法定义表 — 存储所有内置/外部算法的元数据
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `algorithm_definitions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `algo_code` VARCHAR(64) NOT NULL COMMENT '算法唯一标识',
  `algo_name` VARCHAR(200) NOT NULL COMMENT '算法名称',
  `category` VARCHAR(64) NOT NULL COMMENT '算法大类(mechanical/electrical/structural等)',
  `subcategory` VARCHAR(64) DEFAULT NULL COMMENT '算法子类',
  `description` TEXT DEFAULT NULL COMMENT '算法描述',
  `impl_type` ENUM('pipeline_node','plugin','builtin','external','kg_operator') NOT NULL COMMENT '实现类型',
  `impl_ref` VARCHAR(200) DEFAULT NULL COMMENT '实现引用路径',
  `input_schema` JSON NOT NULL COMMENT '输入字段定义 {fields: [...]}',
  `output_schema` JSON NOT NULL COMMENT '输出字段定义 {fields: [...]}',
  `config_schema` JSON NOT NULL COMMENT '配置参数定义 {fields: [...]}',
  `applicable_device_types` JSON DEFAULT NULL COMMENT '适用设备类型 ["*"]',
  `applicable_measurement_types` JSON DEFAULT NULL COMMENT '适用测量类型',
  `applicable_scenarios` JSON DEFAULT NULL COMMENT '适用场景',
  `kg_integration` JSON DEFAULT NULL COMMENT '知识图谱集成配置',
  `version` VARCHAR(32) NOT NULL DEFAULT 'v1.0.0' COMMENT '算法版本',
  `benchmark` JSON DEFAULT NULL COMMENT '性能基准 {latency_ms, throughput_rps, memory_mb, accuracy, f1_score}',
  `compatible_input_versions` JSON DEFAULT NULL COMMENT '兼容的输入版本列表',
  `breaking_change` TINYINT DEFAULT 0 COMMENT '是否有破坏性变更',
  `fleet_learning_config` JSON DEFAULT NULL COMMENT 'Fleet Learning配置',
  `license` ENUM('builtin','community','enterprise') DEFAULT 'builtin' COMMENT '许可类型',
  `author` VARCHAR(128) DEFAULT NULL COMMENT '作者',
  `documentation_url` VARCHAR(500) DEFAULT NULL COMMENT '文档链接',
  `tags` JSON DEFAULT NULL COMMENT '标签列表',
  `status` ENUM('active','deprecated','experimental') DEFAULT 'active' COMMENT '状态',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ad_algo_code` (`algo_code`),
  KEY `idx_ad_cat` (`category`),
  KEY `idx_ad_impl` (`impl_type`),
  KEY `idx_ad_status` (`status`),
  KEY `idx_ad_subcategory` (`subcategory`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算法定义表';

-- ----------------------------------------------------------------------------
-- 2. 算法组合表 — 将多个原子算法编排为场景化方案（DAG 结构）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `algorithm_compositions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `comp_code` VARCHAR(64) NOT NULL COMMENT '组合唯一标识',
  `comp_name` VARCHAR(200) NOT NULL COMMENT '组合名称',
  `description` TEXT DEFAULT NULL COMMENT '组合描述',
  `steps` JSON NOT NULL COMMENT 'DAG结构 {nodes: [...], edges: [...]}',
  `applicable_device_types` JSON DEFAULT NULL COMMENT '适用设备类型',
  `applicable_scenarios` JSON DEFAULT NULL COMMENT '适用场景',
  `version` VARCHAR(32) NOT NULL DEFAULT 'v1.0.0' COMMENT '版本',
  `is_template` TINYINT DEFAULT 0 COMMENT '是否为模板',
  `status` ENUM('active','deprecated','draft') DEFAULT 'active' COMMENT '状态',
  `created_by` VARCHAR(64) DEFAULT NULL COMMENT '创建者',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ac_comp_code` (`comp_code`),
  KEY `idx_ac_status` (`status`),
  KEY `idx_ac_template` (`is_template`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算法组合表';

-- ----------------------------------------------------------------------------
-- 3. 算法-设备绑定表 — 记录具体设备实例与算法的绑定关系
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `algorithm_device_bindings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_code` VARCHAR(64) NOT NULL COMMENT '设备编码',
  `sensor_code` VARCHAR(64) DEFAULT NULL COMMENT '传感器编码',
  `algo_code` VARCHAR(64) NOT NULL COMMENT '算法编码',
  `binding_type` ENUM('algorithm','composition') NOT NULL COMMENT '绑定类型',
  `config_overrides` JSON DEFAULT NULL COMMENT '配置覆盖',
  `schedule` JSON DEFAULT NULL COMMENT '调度配置 {type, value, timezone}',
  `output_routing` JSON DEFAULT NULL COMMENT '输出路由配置',
  `status` ENUM('active','paused','error') DEFAULT 'active' COMMENT '状态',
  `last_run_at` TIMESTAMP(3) DEFAULT NULL COMMENT '最后运行时间',
  `last_run_status` VARCHAR(32) DEFAULT NULL COMMENT '最后运行状态',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_adb_device` (`device_code`),
  KEY `idx_adb_algo` (`algo_code`),
  KEY `idx_adb_status` (`status`),
  UNIQUE KEY `idx_adb_unique` (`device_code`, `sensor_code`, `algo_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算法-设备绑定表';

-- ----------------------------------------------------------------------------
-- 4. 算法执行记录表 — 审计、性能分析、Fleet Learning 数据采集
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `algorithm_executions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `execution_id` VARCHAR(64) NOT NULL COMMENT '执行唯一ID',
  `binding_id` BIGINT DEFAULT NULL COMMENT '关联绑定ID',
  `algo_code` VARCHAR(64) NOT NULL COMMENT '算法编码',
  `device_code` VARCHAR(64) DEFAULT NULL COMMENT '设备编码',
  `input_summary` JSON DEFAULT NULL COMMENT '输入摘要 {record_count, fields, sample_rate_hz, data_range}',
  `config_used` JSON DEFAULT NULL COMMENT '实际使用的配置',
  `output_summary` JSON DEFAULT NULL COMMENT '输出摘要',
  `started_at` TIMESTAMP(3) DEFAULT NULL COMMENT '开始时间',
  `completed_at` TIMESTAMP(3) DEFAULT NULL COMMENT '完成时间',
  `duration_ms` INT DEFAULT NULL COMMENT '执行耗时(毫秒)',
  `records_processed` INT DEFAULT NULL COMMENT '处理记录数',
  `memory_used_mb` DOUBLE DEFAULT NULL COMMENT '内存使用(MB)',
  `status` ENUM('running','success','failed','timeout') NOT NULL COMMENT '执行状态',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
  `routing_status` JSON DEFAULT NULL COMMENT '路由状态',
  `ab_group` VARCHAR(16) DEFAULT NULL COMMENT 'A/B测试分组',
  `algo_version` VARCHAR(32) DEFAULT NULL COMMENT '算法版本',
  `quality_metrics` JSON DEFAULT NULL COMMENT '质量指标 {precision, recall, f1, ...}',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ae_execution_id` (`execution_id`),
  KEY `idx_ae_algo` (`algo_code`),
  KEY `idx_ae_device` (`device_code`),
  KEY `idx_ae_status` (`status`),
  KEY `idx_ae_time` (`started_at`),
  KEY `idx_ae_binding` (`binding_id`),
  KEY `idx_ae_ab` (`ab_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算法执行记录表';

-- ----------------------------------------------------------------------------
-- 5. 算法路由规则表 — 条件路由 + 级联触发（动态路由引擎）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `algorithm_routing_rules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `binding_id` BIGINT NOT NULL COMMENT '关联绑定ID',
  `rule_name` VARCHAR(200) NOT NULL COMMENT '规则名称',
  `description` TEXT DEFAULT NULL COMMENT '规则描述',
  `priority` INT NOT NULL DEFAULT 100 COMMENT '优先级(数值越小越优先)',
  `condition` TEXT NOT NULL COMMENT '触发条件表达式',
  `targets` JSON NOT NULL COMMENT '目标配置 [{target, action, mapping, params, severity}]',
  `cascade_algos` JSON DEFAULT NULL COMMENT '级联算法 [{algo_code, delay_ms, config_overrides, condition}]',
  `stop_on_match` TINYINT DEFAULT 1 COMMENT '匹配后是否停止',
  `status` ENUM('active','disabled') DEFAULT 'active' COMMENT '状态',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_arr_binding` (`binding_id`),
  KEY `idx_arr_priority` (`priority`),
  KEY `idx_arr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算法路由规则表';

-- ============================================================================
-- 验证建表结果
-- ============================================================================
SELECT 
  TABLE_NAME, 
  TABLE_COMMENT,
  TABLE_ROWS
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME LIKE 'algorithm_%'
ORDER BY TABLE_NAME;
