-- ============================================================================
-- 04-twin-config-ddl.sql
-- 数字孪生赋能工具 — 运行配置管理 DDL
-- v3.0 — 2026-02-22
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- T1. 扩展 engine_config_registry 表（补齐 Drizzle schema 字段）
-- ============================================================================
-- 注意：engine_config_registry 已在 03-evolution-ddl.sql 创建
-- 此处用 ALTER TABLE 补齐缺失字段（幂等操作）
-- ============================================================================

-- 添加 module 字段（模块标识）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'module');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `module` VARCHAR(64) NOT NULL DEFAULT ''general'' COMMENT ''所属模块'' AFTER `id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 config_group 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'config_group');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `config_group` VARCHAR(64) NOT NULL DEFAULT ''general'' COMMENT ''配置分组'' AFTER `module`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 value_type 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'value_type');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `value_type` ENUM(''number'',''string'',''boolean'',''json'') NOT NULL DEFAULT ''string'' COMMENT ''值类型'' AFTER `config_value`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 default_value 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'default_value');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `default_value` TEXT COMMENT ''默认值'' AFTER `value_type`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 label 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'label');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `label` VARCHAR(128) NOT NULL DEFAULT '''' COMMENT ''配置项中文标签'' AFTER `default_value`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 unit 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'unit');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `unit` VARCHAR(32) COMMENT ''单位'' AFTER `description`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 constraints 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'constraints');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `constraints` JSON COMMENT ''取值范围约束'' AFTER `unit`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 sort_order 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'sort_order');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 100 COMMENT ''排序权重'' AFTER `constraints`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 enabled 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'enabled');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT ''是否启用'' AFTER `sort_order`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 is_builtin 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'is_builtin');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `is_builtin` TINYINT NOT NULL DEFAULT 0 COMMENT ''是否系统内置'' AFTER `enabled`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 impact_score 字段（变更影响评估分数）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'impact_score');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `impact_score` INT DEFAULT 0 COMMENT ''变更影响评估分数 0-100'' AFTER `is_builtin`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 impact_description 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'impact_description');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `impact_description` TEXT COMMENT ''变更影响描述'' AFTER `impact_score`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 config_version 字段（语义化版本号）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND COLUMN_NAME = 'config_version');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `engine_config_registry` ADD COLUMN `config_version` VARCHAR(32) NOT NULL DEFAULT ''1.0.0'' COMMENT ''语义化版本号'' AFTER `impact_description`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 补充唯一索引 uk_module_key（seed data 的 ON DUPLICATE KEY 依赖此索引）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND INDEX_NAME = 'uk_module_key');
SET @sql = IF(@idx_exists = 0, 
  'CREATE UNIQUE INDEX `uk_module_key` ON `engine_config_registry` (`module`, `config_key`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 补充索引（幂等：先检查是否存在再创建）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND INDEX_NAME = 'idx_ecr_module');
SET @sql = IF(@idx_exists = 0, 
  'CREATE INDEX `idx_ecr_module` ON `engine_config_registry` (`module`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND INDEX_NAME = 'idx_ecr_group');
SET @sql = IF(@idx_exists = 0, 
  'CREATE INDEX `idx_ecr_group` ON `engine_config_registry` (`module`, `config_group`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'engine_config_registry' AND INDEX_NAME = 'idx_ecr_enabled');
SET @sql = IF(@idx_exists = 0, 
  'CREATE INDEX `idx_ecr_enabled` ON `engine_config_registry` (`enabled`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- T2. 层级熔断开关表
-- ============================================================================
CREATE TABLE IF NOT EXISTS `twin_layer_switches` (
  `id` INT AUTO_INCREMENT,
  `layer_id` VARCHAR(16) NOT NULL COMMENT '层级标识: L1-L7',
  `layer_name` VARCHAR(64) NOT NULL COMMENT '层级名称',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '层级总开关 1=启用 0=熔断',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '层级优先级（数字越小优先级越高）',
  `description` TEXT COMMENT '层级说明',
  `updated_by` VARCHAR(64) COMMENT '最后修改人',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_tls_layer` (`layer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='数字孪生层级熔断开关';

-- ============================================================================
-- T3. 配置审计日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS `twin_config_audit_log` (
  `id` BIGINT AUTO_INCREMENT,
  `user_id` VARCHAR(64) NOT NULL COMMENT '操作人 ID',
  `user_name` VARCHAR(128) COMMENT '操作人名称',
  `module` VARCHAR(64) NOT NULL COMMENT '模块标识',
  `config_key` VARCHAR(128) NOT NULL COMMENT '配置键',
  `action` ENUM('create','update','delete','rollback','batch_update','simulate') NOT NULL COMMENT '操作类型',
  `old_value` JSON COMMENT '变更前值',
  `new_value` JSON COMMENT '变更后值',
  `old_version` VARCHAR(32) COMMENT '变更前版本号',
  `new_version` VARCHAR(32) COMMENT '变更后版本号',
  `impact_score` INT DEFAULT 0 COMMENT '本次变更影响评估分数',
  `reason` TEXT COMMENT '变更原因',
  `ip_address` VARCHAR(45) COMMENT '操作 IP',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_tcal_user` (`user_id`),
  INDEX `idx_tcal_module` (`module`),
  INDEX `idx_tcal_action` (`action`),
  INDEX `idx_tcal_time` (`created_at`),
  INDEX `idx_tcal_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='数字孪生配置审计日志';

-- ============================================================================
-- T4. 配置快照表（每小时自动快照 + 手动快照）
-- ============================================================================
CREATE TABLE IF NOT EXISTS `twin_config_snapshot` (
  `id` BIGINT AUTO_INCREMENT,
  `snapshot_type` ENUM('auto','manual','pre_rollback') NOT NULL DEFAULT 'auto' COMMENT '快照类型',
  `snapshot_name` VARCHAR(256) COMMENT '快照名称（手动快照时填写）',
  `layer_id` VARCHAR(16) COMMENT '层级标识（NULL 表示全量快照）',
  `module` VARCHAR(64) COMMENT '模块标识（NULL 表示全量快照）',
  `config_data` JSON NOT NULL COMMENT '配置数据快照（完整 JSON）',
  `layer_switches` JSON COMMENT '层级开关快照',
  `checksum` VARCHAR(64) COMMENT 'SHA-256 校验和（用于漂移检测）',
  `created_by` VARCHAR(64) NOT NULL DEFAULT 'system' COMMENT '创建人',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` TIMESTAMP(3) NULL COMMENT '过期时间（自动快照 30 天后过期）',
  PRIMARY KEY (`id`),
  INDEX `idx_tcs_type` (`snapshot_type`),
  INDEX `idx_tcs_layer` (`layer_id`),
  INDEX `idx_tcs_module` (`module`),
  INDEX `idx_tcs_created` (`created_at`),
  INDEX `idx_tcs_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='数字孪生配置快照（漂移检测 + 版本回滚）';

-- ============================================================================
-- T5. 仿真运行记录表（与 Drizzle schema twinConfigSimulationRuns 完全对齐）
-- ============================================================================
CREATE TABLE IF NOT EXISTS `twin_config_simulation_runs` (
  `id` BIGINT AUTO_INCREMENT,
  `user_id` VARCHAR(64) NOT NULL COMMENT '创建人 ID',
  `module` VARCHAR(64) NOT NULL COMMENT '被仿真的模块',
  `temp_config` JSON NOT NULL COMMENT '临时配置（不影响真实孪生体）',
  `baseline_config` JSON NOT NULL COMMENT '基线配置（当前生产配置）',
  `result` JSON COMMENT '仿真结果',
  `status` ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  `duration_ms` INT COMMENT '仿真耗时（毫秒）',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` TIMESTAMP(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_tcsr_user` (`user_id`),
  INDEX `idx_tcsr_module` (`module`),
  INDEX `idx_tcsr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='数字孪生配置仿真运行记录';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 验证
-- ============================================================================
SELECT CONCAT('✅ twin-config DDL 执行完成，新增 ', COUNT(*), ' 张表') AS result
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN (
  'twin_layer_switches', 'twin_config_audit_log', 
  'twin_config_snapshot', 'twin_config_simulation_runs'
);
