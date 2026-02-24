-- ============================================================================
-- 自主进化闭环 v3.0 DDL 增量 — 10-evo-v3-production-fields.sql
-- ============================================================================
-- 为 v2.0 七张表补充生产级字段：幂等 key、乐观锁、设备追踪、请求追踪
-- 为 v1.0 已有表（canary_deployments、edge_cases）补充缺失字段
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. evolution_interventions 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `evolution_interventions`
  ADD COLUMN `device_id`          VARCHAR(128)  DEFAULT NULL COMMENT '设备/节点标识' AFTER `model_id`,
  ADD COLUMN `request_id`         VARCHAR(128)  DEFAULT NULL COMMENT '原始请求 ID' AFTER `device_id`,
  ADD COLUMN `model_version`      VARCHAR(64)   DEFAULT NULL COMMENT '影子模型版本号' AFTER `request_id`,
  ADD COLUMN `divergence_details` JSON          DEFAULT NULL COMMENT '差异明细（维度级）' AFTER `divergence_score`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `video_clip_url`,
  ADD UNIQUE INDEX `uq_ei_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 2. evolution_simulations 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `evolution_simulations`
  ADD COLUMN `name`               VARCHAR(256)  DEFAULT NULL COMMENT '场景名称' AFTER `scenario_id`,
  ADD COLUMN `status`             ENUM('active','archived','disabled') DEFAULT 'active' COMMENT '场景状态' AFTER `tags`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `status`,
  ADD UNIQUE INDEX `uq_es_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 3. evolution_video_trajectories 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `evolution_video_trajectories`
  ADD COLUMN `model_version`      VARCHAR(64)   DEFAULT NULL COMMENT '产生轨迹的模型版本' AFTER `session_id`,
  ADD COLUMN `device_id`          VARCHAR(128)  DEFAULT NULL COMMENT '设备标识' AFTER `model_version`,
  ADD COLUMN `status`             ENUM('pending','processed','archived') DEFAULT 'pending' COMMENT '处理状态' AFTER `temporal_relations`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `status`,
  ADD UNIQUE INDEX `uq_evt_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 4. canary_deployment_stages 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `canary_deployment_stages`
  ADD COLUMN `lock_version`       INT UNSIGNED  DEFAULT 0 COMMENT '乐观锁版本号' AFTER `rollback_reason`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `lock_version`,
  ADD UNIQUE INDEX `uq_cds_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 5. canary_health_checks 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `canary_health_checks`
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `consecutive_fails`,
  ADD UNIQUE INDEX `uq_chc_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 6. evolution_step_logs 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `evolution_step_logs`
  ADD COLUMN `lock_version`       INT UNSIGNED  DEFAULT 0 COMMENT '乐观锁版本号' AFTER `error_message`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `lock_version`,
  ADD UNIQUE INDEX `uq_esl_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 7. evolution_flywheel_schedules 新增生产字段
-- --------------------------------------------------------------------------
ALTER TABLE `evolution_flywheel_schedules`
  ADD COLUMN `last_run_at`        TIMESTAMP     DEFAULT NULL COMMENT '上次执行时间' AFTER `last_triggered_at`,
  ADD COLUMN `last_run_model_id`  VARCHAR(128)  DEFAULT NULL COMMENT '上次执行的模型 ID' AFTER `last_run_at`,
  ADD COLUMN `last_run_passed`    TINYINT(1)    DEFAULT NULL COMMENT '上次执行是否通过' AFTER `last_run_model_id`,
  ADD COLUMN `lock_version`       INT UNSIGNED  DEFAULT 0 COMMENT '乐观锁版本号' AFTER `last_run_passed`,
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `lock_version`,
  ADD UNIQUE INDEX `uq_efs_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 8. 为已有 canary_deployments 表补充幂等字段
-- --------------------------------------------------------------------------
ALTER TABLE `canary_deployments`
  ADD COLUMN `idempotency_key`    VARCHAR(128)  DEFAULT NULL COMMENT '幂等键' AFTER `ended_at`,
  ADD COLUMN `lock_version`       INT UNSIGNED  DEFAULT 0 COMMENT '乐观锁版本号' AFTER `idempotency_key`,
  ADD UNIQUE INDEX `uq_cd_idempotency` (`idempotency_key`);

-- --------------------------------------------------------------------------
-- 9. 创建进化事件审计日志表
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evolution_audit_logs` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `event_type`      VARCHAR(128)    NOT NULL COMMENT '事件类型（如 shadow.intervention.detected）',
  `event_source`    VARCHAR(128)    NOT NULL COMMENT '事件来源模块',
  `event_data`      JSON            DEFAULT NULL COMMENT '事件负载',
  `session_id`      VARCHAR(128)    DEFAULT NULL COMMENT '关联会话 ID',
  `model_id`        VARCHAR(128)    DEFAULT NULL COMMENT '关联模型 ID',
  `severity`        ENUM('info','warn','error','critical') DEFAULT 'info' COMMENT '严重级别',
  `created_at`      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eal_type` (`event_type`),
  INDEX `idx_eal_source` (`event_source`),
  INDEX `idx_eal_time` (`created_at`),
  INDEX `idx_eal_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进化事件审计日志';

-- --------------------------------------------------------------------------
-- 10. 创建 Dojo 训练任务持久化表
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dojo_training_jobs` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `job_id`          VARCHAR(128)    NOT NULL COMMENT '任务唯一 ID',
  `name`            VARCHAR(256)    NOT NULL COMMENT '任务名称',
  `model_id`        VARCHAR(128)    NOT NULL COMMENT '训练模型 ID',
  `status`          ENUM('pending','scheduled','running','completed','failed','cancelled') DEFAULT 'pending',
  `priority`        INT UNSIGNED    DEFAULT 5 COMMENT '优先级 1-10',
  `gpu_count`       INT UNSIGNED    DEFAULT 8 COMMENT 'GPU 数量',
  `use_spot`        TINYINT(1)      DEFAULT 1 COMMENT '是否使用 Spot 实例',
  `estimated_duration_ms` BIGINT UNSIGNED DEFAULT NULL COMMENT '预估训练时长（毫秒）',
  `scheduled_at`    TIMESTAMP       DEFAULT NULL COMMENT '计划开始时间',
  `started_at`      TIMESTAMP       DEFAULT NULL COMMENT '实际开始时间',
  `completed_at`    TIMESTAMP       DEFAULT NULL COMMENT '完成时间',
  `carbon_window`   JSON            DEFAULT NULL COMMENT '碳排放窗口信息',
  `config`          JSON            DEFAULT NULL COMMENT '训练配置',
  `result`          JSON            DEFAULT NULL COMMENT '训练结果',
  `error_message`   TEXT            DEFAULT NULL COMMENT '错误信息',
  `retry_count`     INT UNSIGNED    DEFAULT 0 COMMENT '重试次数',
  `idempotency_key` VARCHAR(128)    DEFAULT NULL COMMENT '幂等键',
  `created_at`      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_dtj_job` (`job_id`),
  UNIQUE INDEX `uq_dtj_idempotency` (`idempotency_key`),
  INDEX `idx_dtj_status` (`status`),
  INDEX `idx_dtj_model` (`model_id`),
  INDEX `idx_dtj_scheduled` (`scheduled_at`),
  INDEX `idx_dtj_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Dojo 训练任务';
