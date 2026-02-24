-- ============================================================================
-- 自主进化闭环 v2.0 DDL — 09-evo-v2-ddl.sql
-- ============================================================================
-- 新增 7 张表，增强基础闭环 + FSD 专属能力
-- 与 03-evolution-ddl.sql 中已有表完全兼容，无冲突
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. evolution_step_logs — 飞轮步骤日志（E13-E16）
-- --------------------------------------------------------------------------
-- 每个飞轮周期的每一步执行详情，支持完整追溯
CREATE TABLE IF NOT EXISTS `evolution_step_logs` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `cycle_id`        BIGINT       NOT NULL COMMENT '关联 evolution_cycles.id',
  `step_number`     TINYINT      NOT NULL COMMENT '步骤编号 1-5',
  `step_name`       VARCHAR(50)  NOT NULL COMMENT '步骤名称: data_discovery / hypothesis_generation / shadow_evaluation / canary_deployment / feedback_crystallization',
  `status`          ENUM('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `started_at`      TIMESTAMP(3) NULL,
  `completed_at`    TIMESTAMP(3) NULL,
  `duration_ms`     INT          NULL COMMENT '执行耗时(ms)',
  `input_summary`   JSON         NULL COMMENT '步骤输入摘要',
  `output_summary`  JSON         NULL COMMENT '步骤输出摘要',
  `metrics`         JSON         NULL COMMENT '步骤指标快照',
  `error_message`   TEXT         NULL COMMENT '失败原因',
  `created_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_esl_cycle` (`cycle_id`),
  INDEX `idx_esl_step` (`step_number`),
  INDEX `idx_esl_status` (`status`),
  CONSTRAINT `fk_esl_cycle` FOREIGN KEY (`cycle_id`) REFERENCES `evolution_cycles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='飞轮步骤日志 — 每步执行详情追溯';

-- --------------------------------------------------------------------------
-- 2. canary_deployment_stages — 金丝雀部署阶段记录（E9-E12）
-- --------------------------------------------------------------------------
-- 5 阶段渐进部署的每个阶段独立记录
CREATE TABLE IF NOT EXISTS `canary_deployment_stages` (
  `id`                      BIGINT        NOT NULL AUTO_INCREMENT,
  `deployment_id`           BIGINT        NOT NULL COMMENT '关联 canary_deployments.id',
  `stage_index`             TINYINT       NOT NULL COMMENT '阶段索引 0-4',
  `stage_name`              VARCHAR(20)   NOT NULL COMMENT 'shadow / canary / gray / half / full',
  `traffic_percent`         DOUBLE        NOT NULL COMMENT '目标流量百分比',
  `rollback_threshold_pct`  DOUBLE        NOT NULL COMMENT '回滚阈值（性能退化百分比）',
  `duration_hours`          INT           NOT NULL COMMENT '预计持续时间(小时)',
  `status`                  ENUM('pending','active','completed','rolled_back','skipped') NOT NULL DEFAULT 'pending',
  `started_at`              TIMESTAMP(3)  NULL,
  `completed_at`            TIMESTAMP(3)  NULL,
  `metrics_snapshot`        JSON          NULL COMMENT '阶段结束时指标快照',
  `rollback_reason`         TEXT          NULL,
  `created_at`              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_cds_deployment` (`deployment_id`),
  INDEX `idx_cds_stage` (`stage_name`),
  INDEX `idx_cds_status` (`status`),
  CONSTRAINT `fk_cds_deployment` FOREIGN KEY (`deployment_id`) REFERENCES `canary_deployments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='金丝雀部署阶段记录 — 5 阶段渐进部署追溯';

-- --------------------------------------------------------------------------
-- 3. canary_health_checks — 金丝雀健康检查记录（E9-E12）
-- --------------------------------------------------------------------------
-- 每次健康检查的详细指标，支持连续失败自动回滚判断
CREATE TABLE IF NOT EXISTS `canary_health_checks` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `deployment_id`     BIGINT        NOT NULL COMMENT '关联 canary_deployments.id',
  `stage_id`          BIGINT        NULL     COMMENT '关联 canary_deployment_stages.id',
  `check_type`        ENUM('periodic','manual','threshold_breach') NOT NULL DEFAULT 'periodic',
  `champion_metrics`  JSON          NOT NULL COMMENT '冠军模型指标快照',
  `challenger_metrics` JSON         NOT NULL COMMENT '挑战者模型指标快照',
  `passed`            TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否通过',
  `failure_reason`    TEXT          NULL,
  `consecutive_fails` INT           NOT NULL DEFAULT 0 COMMENT '连续失败次数',
  `checked_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chc_deployment` (`deployment_id`),
  INDEX `idx_chc_stage` (`stage_id`),
  INDEX `idx_chc_passed` (`passed`),
  INDEX `idx_chc_time` (`checked_at`),
  CONSTRAINT `fk_chc_deployment` FOREIGN KEY (`deployment_id`) REFERENCES `canary_deployments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='金丝雀健康检查记录 — 支持连续失败自动回滚';

-- --------------------------------------------------------------------------
-- 4. evolution_interventions — 干预记录（E20-E24 FSD Shadow Fleet）
-- --------------------------------------------------------------------------
-- FSD 式全流量镜像产生的干预/分歧记录
CREATE TABLE IF NOT EXISTS `evolution_interventions` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `session_id`        VARCHAR(64)   NOT NULL COMMENT '镜像会话 UUID',
  `model_id`          VARCHAR(100)  NOT NULL COMMENT '影子模型 ID',
  `divergence_score`  DOUBLE        NOT NULL COMMENT '决策分歧度 [0,1]',
  `is_intervention`   TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否构成干预',
  `intervention_type` ENUM('decision_diverge','threshold_breach','safety_override','manual') NOT NULL DEFAULT 'decision_diverge',
  `request_data`      JSON          NOT NULL COMMENT '原始请求数据',
  `human_decision`    JSON          NOT NULL COMMENT '生产模型（人类/冠军）决策',
  `shadow_decision`   JSON          NOT NULL COMMENT '影子模型决策',
  `context_snapshot`  JSON          NULL     COMMENT '世界模型上下文快照',
  `auto_label`        JSON          NULL     COMMENT 'Auto-Labeling 结果',
  `label_confidence`  DOUBLE        NULL     COMMENT '自动标注置信度',
  `difficulty_score`  DOUBLE        NULL     COMMENT '难例评分 [0,1]',
  `video_clip_url`    VARCHAR(500)  NULL     COMMENT '关联视频片段 URL',
  `created_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ei_session` (`session_id`),
  INDEX `idx_ei_model` (`model_id`),
  INDEX `idx_ei_intervention` (`is_intervention`),
  INDEX `idx_ei_type` (`intervention_type`),
  INDEX `idx_ei_divergence` (`divergence_score`),
  INDEX `idx_ei_difficulty` (`difficulty_score`),
  INDEX `idx_ei_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='FSD 干预记录 — Shadow Fleet 全流量镜像分歧采集';

-- --------------------------------------------------------------------------
-- 5. evolution_simulations — 仿真场景库（E25-E28）
-- --------------------------------------------------------------------------
-- 高保真仿真场景，来源于干预记录自动生成
CREATE TABLE IF NOT EXISTS `evolution_simulations` (
  `id`                      BIGINT        NOT NULL AUTO_INCREMENT,
  `scenario_id`             VARCHAR(64)   NOT NULL COMMENT '场景 UUID',
  `source_intervention_id`  BIGINT        NULL     COMMENT '来源干预记录 ID',
  `scenario_type`           ENUM('regression','stress','edge_case','adversarial','replay') NOT NULL DEFAULT 'regression',
  `input_data`              JSON          NOT NULL COMMENT '仿真输入数据',
  `expected_output`         JSON          NOT NULL COMMENT '期望输出（人类决策）',
  `variations`              JSON          NULL     COMMENT '扰动变体列表',
  `variation_count`         INT           NOT NULL DEFAULT 0,
  `fidelity_score`          DOUBLE        NULL     COMMENT '仿真保真度 [0,1]',
  `difficulty`              ENUM('easy','medium','hard','extreme') NOT NULL DEFAULT 'medium',
  `tags`                    JSON          NULL     COMMENT '标签列表',
  `last_run_model_id`       VARCHAR(100)  NULL,
  `last_run_passed`         TINYINT(1)    NULL,
  `last_run_at`             TIMESTAMP(3)  NULL,
  `run_count`               INT           NOT NULL DEFAULT 0,
  `pass_count`              INT           NOT NULL DEFAULT 0,
  `created_at`              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_es_scenario` (`scenario_id`),
  INDEX `idx_es_source` (`source_intervention_id`),
  INDEX `idx_es_type` (`scenario_type`),
  INDEX `idx_es_difficulty` (`difficulty`),
  INDEX `idx_es_fidelity` (`fidelity_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='高保真仿真场景库 — 自动从干预记录生成';

-- --------------------------------------------------------------------------
-- 6. evolution_video_trajectories — 视频/多模态轨迹（E24 FSD）
-- --------------------------------------------------------------------------
-- KG 节点：视频嵌入 + 时序关系，支持干预回放
CREATE TABLE IF NOT EXISTS `evolution_video_trajectories` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `trajectory_id`     VARCHAR(64)   NOT NULL COMMENT '轨迹 UUID',
  `intervention_id`   BIGINT        NULL     COMMENT '关联干预记录 ID',
  `session_id`        VARCHAR(64)   NULL     COMMENT '关联镜像会话',
  `video_url`         VARCHAR(500)  NOT NULL COMMENT '视频存储 URL (MinIO/S3)',
  `duration_ms`       INT           NOT NULL COMMENT '视频时长(ms)',
  `frame_count`       INT           NULL     COMMENT '帧数',
  `embedding_vector`  JSON          NULL     COMMENT '视频嵌入向量 (降维后)',
  `temporal_relations` JSON         NULL     COMMENT '时序关系图 [{from, to, relation}]',
  `key_frames`        JSON          NULL     COMMENT '关键帧列表 [{timestamp, description, thumbnail_url}]',
  `sensor_data`       JSON          NULL     COMMENT '传感器同步数据',
  `annotations`       JSON          NULL     COMMENT '人工标注',
  `kg_node_id`        VARCHAR(100)  NULL     COMMENT 'Neo4j KG 节点 ID',
  `created_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_evt_trajectory` (`trajectory_id`),
  INDEX `idx_evt_intervention` (`intervention_id`),
  INDEX `idx_evt_session` (`session_id`),
  INDEX `idx_evt_kg` (`kg_node_id`),
  INDEX `idx_evt_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='视频/多模态轨迹 — FSD 干预回放 + KG 节点';

-- --------------------------------------------------------------------------
-- 7. evolution_flywheel_schedules — 飞轮调度配置（E13-E16）
-- --------------------------------------------------------------------------
-- 支持定时自动触发进化周期
CREATE TABLE IF NOT EXISTS `evolution_flywheel_schedules` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `name`              VARCHAR(100)  NOT NULL COMMENT '调度名称',
  `cron_expression`   VARCHAR(100)  NOT NULL COMMENT 'Cron 表达式',
  `enabled`           TINYINT(1)    NOT NULL DEFAULT 1,
  `config`            JSON          NOT NULL COMMENT '飞轮配置 JSON',
  `max_concurrent`    INT           NOT NULL DEFAULT 1 COMMENT '最大并发周期数',
  `min_interval_hours` INT          NOT NULL DEFAULT 24 COMMENT '最小间隔(小时)',
  `last_triggered_at` TIMESTAMP(3)  NULL,
  `next_trigger_at`   TIMESTAMP(3)  NULL,
  `total_runs`        INT           NOT NULL DEFAULT 0,
  `consecutive_fails` INT           NOT NULL DEFAULT 0,
  `max_consecutive_fails` INT       NOT NULL DEFAULT 3 COMMENT '连续失败上限，超过自动禁用',
  `created_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_efs_enabled` (`enabled`),
  INDEX `idx_efs_next` (`next_trigger_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='飞轮调度配置 — 定时自动触发进化周期';
