-- ============================================================================
-- Phase 4 DDL 增量脚本 — 安全护栏引擎升级 + 知识结晶增强
-- ============================================================================
-- 版本: v5.0
-- 依赖: 02-v5-ddl.sql (guardrail_rules, guardrail_violations, knowledge_crystals)
-- 策略: 全部使用 safe_add_column 幂等执行，不使用 AFTER 子句
-- ============================================================================

-- 幂等存储过程：安全添加列
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS safe_add_column(
  IN tbl VARCHAR(64), IN col VARCHAR(64), IN col_def TEXT
)
BEGIN
  SET @q = CONCAT('SELECT COUNT(*) INTO @exists FROM information_schema.COLUMNS ',
    'WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=''', tbl, ''' AND COLUMN_NAME=''', col, '''');
  PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  IF @exists = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', col_def);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ============================================================================
-- G4: guardrail_rules 新增字段
-- ============================================================================

CALL safe_add_column('guardrail_rules', 'cooldown_ms',
  'int NOT NULL DEFAULT 60000 COMMENT ''触发冷却时间(毫秒)''');
CALL safe_add_column('guardrail_rules', 'escalation_config',
  'json DEFAULT NULL COMMENT ''升级链配置 {levels:[{action,delayMs}]}''');

-- ============================================================================
-- G4: guardrail_violations 新增字段
-- ============================================================================

CALL safe_add_column('guardrail_violations', 'escalation_level',
  'tinyint NOT NULL DEFAULT 1 COMMENT ''当前升级级别 1=ALERT 2=THROTTLE 3=HALT''');
CALL safe_add_column('guardrail_violations', 'resolved_at',
  'timestamp(3) DEFAULT NULL COMMENT ''告警解除时间''');
CALL safe_add_column('guardrail_violations', 'severity',
  'double DEFAULT NULL COMMENT ''告警严重度 0.0-1.0''');

-- ============================================================================
-- G4: guardrail_effectiveness_logs 新表（含外键约束）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `guardrail_effectiveness_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rule_id` bigint NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `total_triggers` int NOT NULL DEFAULT 0,
  `true_positives` int NOT NULL DEFAULT 0,
  `false_positives` int NOT NULL DEFAULT 0,
  `avg_severity` double DEFAULT NULL COMMENT '平均严重度',
  `computed_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_gel_rule` (`rule_id`),
  INDEX `idx_gel_period` (`period_start`, `period_end`),
  CONSTRAINT `fk_gel_rule` FOREIGN KEY (`rule_id`)
    REFERENCES `guardrail_rules`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- K1: knowledge_crystals 新增字段
-- ============================================================================

CALL safe_add_column('knowledge_crystals', 'type',
  'enum(''pattern'',''threshold_update'',''causal_link'',''anomaly_signature'') NOT NULL DEFAULT ''pattern'' COMMENT ''结晶类型''');
CALL safe_add_column('knowledge_crystals', 'status',
  'enum(''draft'',''pending_review'',''approved'',''rejected'',''deprecated'') NOT NULL DEFAULT ''draft'' COMMENT ''生命周期状态''');
CALL safe_add_column('knowledge_crystals', 'source_type',
  'enum(''cognition'',''evolution'',''manual'',''guardrail'') NOT NULL DEFAULT ''cognition'' COMMENT ''来源类型''');
CALL safe_add_column('knowledge_crystals', 'created_by',
  'varchar(100) DEFAULT NULL COMMENT ''创建者（system:cognition / system:evolution / user:xxx）''');
CALL safe_add_column('knowledge_crystals', 'application_count',
  'int NOT NULL DEFAULT 0 COMMENT ''应用次数''');
CALL safe_add_column('knowledge_crystals', 'negative_feedback_rate',
  'double NOT NULL DEFAULT 0.0 COMMENT ''负面反馈率''');
CALL safe_add_column('knowledge_crystals', 'review_comment',
  'text DEFAULT NULL COMMENT ''审核意见（rejected 时必填）''');
CALL safe_add_column('knowledge_crystals', 'content_hash',
  'char(32) DEFAULT NULL COMMENT ''pattern 内容 MD5 哈希，用于并发去重''');

-- K8: 并发去重唯一约束 + 复合索引优化
-- 使用 IF NOT EXISTS 逻辑实现幂等
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_crystals' AND INDEX_NAME = 'uk_crystal_hash');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `knowledge_crystals` ADD UNIQUE KEY `uk_crystal_hash` (`type`, `content_hash`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_crystals' AND INDEX_NAME = 'idx_kc_type_status');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `knowledge_crystals` ADD INDEX `idx_kc_type_status` (`type`, `status`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_crystals' AND INDEX_NAME = 'idx_kc_status_nfr');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `knowledge_crystals` ADD INDEX `idx_kc_status_nfr` (`status`, `negative_feedback_rate`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_crystals' AND INDEX_NAME = 'idx_kc_content_hash');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `knowledge_crystals` ADD INDEX `idx_kc_content_hash` (`content_hash`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- K2: crystal_applications 新表（含外键约束）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `crystal_applications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `crystal_id` bigint NOT NULL,
  `applied_in` varchar(50) NOT NULL COMMENT '应用场景(cognition_session/decision/guardrail)',
  `context_summary` text COMMENT '应用上下文摘要',
  `outcome` enum('positive','negative','neutral') DEFAULT NULL COMMENT '应用效果',
  `applied_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_ca_crystal` (`crystal_id`),
  INDEX `idx_ca_time` (`applied_at`),
  CONSTRAINT `fk_ca_crystal` FOREIGN KEY (`crystal_id`)
    REFERENCES `knowledge_crystals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- K3: crystal_migrations 新表（含外键约束）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `crystal_migrations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `crystal_id` bigint NOT NULL COMMENT '源结晶 ID',
  `from_profile` varchar(100) NOT NULL COMMENT '源工况',
  `to_profile` varchar(100) NOT NULL COMMENT '目标工况',
  `adaptations` json NOT NULL COMMENT '适配调整项',
  `new_crystal_id` bigint DEFAULT NULL COMMENT '迁移生成的新结晶 ID',
  `status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
  `migrated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cm_crystal` (`crystal_id`),
  CONSTRAINT `fk_cm_crystal` FOREIGN KEY (`crystal_id`)
    REFERENCES `knowledge_crystals`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cm_new_crystal` FOREIGN KEY (`new_crystal_id`)
    REFERENCES `knowledge_crystals`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 完成：Phase 4 DDL 增量执行完毕
-- ============================================================================
SELECT CONCAT('✅ Phase 4 DDL 增量执行完成，新增 3 张表 + 扩展 3 张表字段') AS result;
