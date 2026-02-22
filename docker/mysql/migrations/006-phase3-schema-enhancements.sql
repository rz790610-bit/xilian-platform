-- ============================================================================
-- Phase 3 数据库增强迁移 — 006
-- ============================================================================
-- 补齐审计报告中识别的 9 个缺失字段 + 创建 audit_logs 表
-- 执行方式: docker exec -i portai-mysql mysql -uroot -proot123 portai_nexus < 006-phase3-schema-enhancements.sql

-- 1. simulation_scenarios 补齐字段（已在 evolution-schema.ts 中定义但 DB 可能缺失）
-- ============================================================================

-- scenario_type 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'scenario_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN scenario_type VARCHAR(30) NOT NULL DEFAULT ''custom'' AFTER description',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- baseline_condition_id 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'baseline_condition_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN baseline_condition_id VARCHAR(100) AFTER scenario_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- step_interval_sec 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'step_interval_sec');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN step_interval_sec INT NOT NULL DEFAULT 60 AFTER horizon_steps',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- enable_monte_carlo 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'enable_monte_carlo');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN enable_monte_carlo BOOLEAN NOT NULL DEFAULT FALSE AFTER step_interval_sec',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_id 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_scenarios' AND column_name = 'task_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_scenarios ADD COLUMN task_id VARCHAR(64) AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. simulation_results 补齐字段
-- ============================================================================

-- timeline JSON 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'timeline');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN timeline JSON AFTER machine_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- risk_assessment JSON 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'risk_assessment');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN risk_assessment JSON AFTER timeline',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- monte_carlo_result JSON 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'monte_carlo_result');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN monte_carlo_result JSON AFTER risk_assessment',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- warnings JSON 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'warnings');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN warnings JSON AFTER ai_maintenance_advice',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- grok_report TEXT 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'simulation_results' AND column_name = 'grok_report');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE simulation_results ADD COLUMN grok_report TEXT AFTER ai_explanation',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. twin_sync_logs 补齐字段
-- ============================================================================

-- sync_type 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'twin_sync_logs' AND column_name = 'sync_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE twin_sync_logs ADD COLUMN sync_type VARCHAR(30) AFTER sync_mode',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 创建 audit_logs 表（§8.2 审计日志）
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

-- 5. 完成
-- ============================================================================
SELECT 'Phase 3 schema enhancements (006) applied successfully' AS status;
