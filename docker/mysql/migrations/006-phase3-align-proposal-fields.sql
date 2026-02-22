-- ============================================================
-- 006-phase3-align-proposal-fields.sql
-- 对齐提案 v1.3 第五章数据库表设计中的所有字段
-- ============================================================
SET NAMES utf8mb4;

-- ============================================================
-- 1. simulation_scenarios — 补齐提案字段
-- ============================================================
-- 提案字段: equipment_id, scenario_type, parameters, baseline_condition_id,
--           duration_steps, step_interval_sec, enable_monte_carlo, monte_carlo_samples,
--           task_id, status(含queued)
-- 当前缺失: scenario_type, baseline_condition_id, step_interval_sec,
--           enable_monte_carlo, task_id; equipment_id列名不同; status缺queued;
--           parameters列名不同

ALTER TABLE `simulation_scenarios`
  ADD COLUMN `scenario_type` VARCHAR(30) NOT NULL DEFAULT 'custom' COMMENT '场景类型: overload|thermal|degradation|resonance|typhoon|multi_factor|custom' AFTER `description`,
  ADD COLUMN `baseline_condition_id` VARCHAR(100) COMMENT '基准工况ID' AFTER `scenario_type`,
  ADD COLUMN `step_interval_sec` INT NOT NULL DEFAULT 60 COMMENT '步长(秒)' AFTER `horizon_steps`,
  ADD COLUMN `enable_monte_carlo` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用蒙特卡洛' AFTER `step_interval_sec`,
  ADD COLUMN `task_id` VARCHAR(64) COMMENT 'BullMQ任务ID' AFTER `status`;

-- 修改 status 枚举增加 queued
ALTER TABLE `simulation_scenarios`
  MODIFY COLUMN `status` ENUM('draft', 'queued', 'running', 'completed', 'failed') NOT NULL DEFAULT 'draft' COMMENT '场景状态';

-- 添加 scenario_type 索引
ALTER TABLE `simulation_scenarios`
  ADD INDEX `idx_ss_scenario_type` (`scenario_type`);

-- ============================================================
-- 2. simulation_results — 补齐提案字段
-- ============================================================
-- 提案字段: scenario_id, equipment_id, timeline(JSON), risk_assessment(JSON),
--           monte_carlo_result(JSON), physics_explanation, grok_report,
--           warnings(JSON), duration_ms, version, completed_at
-- 当前缺失: timeline, risk_assessment, monte_carlo_result, grok_report,
--           warnings, version, completed_at; 提案用equipment_id而非machine_id

ALTER TABLE `simulation_results`
  ADD COLUMN `timeline` JSON COMMENT '时序轨迹 Array<{step, timestamp, stateVector, anomalies}>' AFTER `machine_id`,
  ADD COLUMN `risk_assessment` JSON COMMENT '风险评估 JSON' AFTER `timeline`,
  ADD COLUMN `monte_carlo_result` JSON COMMENT '蒙特卡洛结果（如启用）' AFTER `risk_assessment`,
  ADD COLUMN `grok_report` TEXT COMMENT 'Grok润色的中文报告' AFTER `ai_explanation`,
  ADD COLUMN `warnings` JSON COMMENT '建议动作 string[]' AFTER `grok_report`,
  ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `warnings`,
  ADD COLUMN `completed_at` TIMESTAMP(3) NULL COMMENT '完成时间' AFTER `version`;

-- ============================================================
-- 3. twin_sync_logs — 补齐提案字段
-- ============================================================
-- 提案字段: machine_id, sync_type, sync_mode, state_vector, sensor_count,
--           duration_ms, error_message, version
-- 当前缺失: sync_type(列名不同,当前是event_type), sensor_count, error_message, version
-- 当前多余: health_index, metadata (保留不删)

ALTER TABLE `twin_sync_logs`
  ADD COLUMN `sync_type` VARCHAR(30) COMMENT '同步类型: telemetry_ingest|snapshot_persist|config_update' AFTER `sync_mode`,
  ADD COLUMN `sensor_count` INT COMMENT '同步的传感器数量' AFTER `sync_type`,
  ADD COLUMN `duration_ms` INT COMMENT '同步耗时(ms)' AFTER `sensor_count`,
  ADD COLUMN `error_message` TEXT COMMENT '错误信息(如有)' AFTER `duration_ms`,
  ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `error_message`;

-- ============================================================
-- 4. twin_events — 补齐提案字段
-- ============================================================
-- 提案字段: machine_id, event_type, payload, version, source
-- 当前多余: event_id, source_node, event_timestamp (保留不删)
-- 当前缺失: source(列名不同,当前是source_node)
-- source_node 已覆盖 source 语义，无需修改

-- ============================================================
-- 5. twin_outbox — 对齐提案字段
-- ============================================================
-- 提案字段: aggregate_type, aggregate_id, event_type, payload,
--           processed(boolean), processed_at
-- 当前差异: status(enum) vs processed(boolean); sent_at vs processed_at
-- 添加 processed 和 processed_at 以兼容提案

ALTER TABLE `twin_outbox`
  ADD COLUMN `processed` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已处理' AFTER `retry_count`,
  ADD COLUMN `processed_at` TIMESTAMP(3) NULL COMMENT '处理时间' AFTER `processed`;

-- 添加提案中的索引
ALTER TABLE `twin_outbox`
  ADD INDEX `idx_outbox_unprocessed` (`processed`, `created_at`);

-- ============================================================
-- 6. twin_sync_logs 分区（提案 5.3 要求按月分区）
-- ============================================================
-- 注意：MySQL 不支持对已有非分区表直接 ALTER 为分区表（如果有数据）
-- 这里创建分区表的 DDL 供全新部署使用，已有环境需要 pt-online-schema-change
-- 暂时跳过分区，在 01-schema.sql 全新部署时实现

-- ============================================================
-- 验证
-- ============================================================
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
