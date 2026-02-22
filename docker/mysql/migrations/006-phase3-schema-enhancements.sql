-- ============================================================================
-- 006-phase3-schema-enhancements.sql
-- Phase 3 数据库增强迁移（合并版）
-- ============================================================================
-- 合并自:
--   006-phase3-align-proposal-fields.sql（提案字段对齐）
--   006-phase3-schema-enhancements.sql（幂等补齐 + audit_logs）
-- 所有操作均为幂等（IF NOT EXISTS / IF @col_exists = 0），可安全重复执行
-- ============================================================================
SET NAMES utf8mb4;

-- ============================================================================
-- 1. simulation_scenarios — 补齐提案 v1.3 §5 字段
-- ============================================================================

-- scenario_type
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'scenario_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN scenario_type VARCHAR(30) NOT NULL DEFAULT ''custom'' COMMENT ''场景类型: overload|thermal|degradation|resonance|typhoon|multi_factor|custom'' AFTER description',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- baseline_condition_id
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'baseline_condition_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN baseline_condition_id VARCHAR(100) COMMENT ''基准工况ID'' AFTER scenario_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- step_interval_sec
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'step_interval_sec');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN step_interval_sec INT NOT NULL DEFAULT 60 COMMENT ''步长(秒)'' AFTER horizon_steps',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- enable_monte_carlo
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'enable_monte_carlo');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN enable_monte_carlo BOOLEAN NOT NULL DEFAULT FALSE COMMENT ''是否启用蒙特卡洛'' AFTER step_interval_sec',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_id
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'task_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN task_id VARCHAR(64) COMMENT ''BullMQ任务ID'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- status 枚举增加 queued（幂等：MODIFY COLUMN 可重复执行）
ALTER TABLE `simulation_scenarios`
  MODIFY COLUMN `status` ENUM('draft', 'queued', 'running', 'completed', 'failed') NOT NULL DEFAULT 'draft' COMMENT '场景状态';

-- scenario_type 索引（幂等检查）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND index_name = 'idx_ss_scenario_type');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE simulation_scenarios ADD INDEX idx_ss_scenario_type (scenario_type)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- 2. simulation_results — 补齐提案字段
-- ============================================================================

-- timeline
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'timeline');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN timeline JSON COMMENT ''时序轨迹 Array<{step, timestamp, stateVector, anomalies}>'' AFTER machine_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- risk_assessment
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'risk_assessment');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN risk_assessment JSON COMMENT ''风险评估 JSON'' AFTER timeline',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- monte_carlo_result
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'monte_carlo_result');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN monte_carlo_result JSON COMMENT ''蒙特卡洛结果（如启用）'' AFTER risk_assessment',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- grok_report
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'grok_report');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN grok_report TEXT COMMENT ''Grok润色的中文报告'' AFTER ai_explanation',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- warnings
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'warnings');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN warnings JSON COMMENT ''建议动作 string[]'' AFTER grok_report',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- version
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'version');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN version INT NOT NULL DEFAULT 1 COMMENT ''乐观锁版本号'' AFTER warnings',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'completed_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN completed_at TIMESTAMP(3) NULL COMMENT ''完成时间'' AFTER version',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- 3. twin_sync_logs — 补齐提案字段
-- ============================================================================

-- sync_type
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'sync_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN sync_type VARCHAR(30) COMMENT ''同步类型: telemetry_ingest|snapshot_persist|config_update'' AFTER sync_mode',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sensor_count
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'sensor_count');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN sensor_count INT COMMENT ''同步的传感器数量'' AFTER sync_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- duration_ms
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'duration_ms');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN duration_ms INT COMMENT ''同步耗时(ms)'' AFTER sensor_count',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- error_message
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'error_message');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN error_message TEXT COMMENT ''错误信息(如有)'' AFTER duration_ms',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- version
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'version');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN version INT NOT NULL DEFAULT 1 COMMENT ''乐观锁版本号'' AFTER error_message',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- 4. twin_outbox — 对齐提案字段
-- ============================================================================

-- processed
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_outbox' AND column_name = 'processed');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_outbox ADD COLUMN processed BOOLEAN NOT NULL DEFAULT FALSE COMMENT ''是否已处理'' AFTER retry_count',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- processed_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_outbox' AND column_name = 'processed_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_outbox ADD COLUMN processed_at TIMESTAMP(3) NULL COMMENT ''处理时间'' AFTER processed',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- unprocessed 索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'twin_outbox' AND index_name = 'idx_outbox_unprocessed');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE twin_outbox ADD INDEX idx_outbox_unprocessed (processed, created_at)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- 5. 创建 audit_logs 表（§8.2 审计日志）
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  payload JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_resource (resource_type, resource_id),
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 6. 验证
-- ============================================================================
SELECT 'simulation_scenarios 字段数' AS info, COUNT(*) AS cnt
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios';

SELECT 'simulation_results 字段数' AS info, COUNT(*) AS cnt
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'simulation_results';

SELECT 'twin_sync_logs 字段数' AS info, COUNT(*) AS cnt
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs';

SELECT 'twin_outbox 字段数' AS info, COUNT(*) AS cnt
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'twin_outbox';

SELECT 'Phase 3 schema enhancements (006-merged) applied successfully' AS status;
