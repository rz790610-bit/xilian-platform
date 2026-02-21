-- ============================================================================
-- v5.0 管线层补充 DDL — pipelines / pipeline_runs / pipeline_node_metrics
-- 来源：drizzle/schema.ts 中的 Drizzle 定义，1:1 转换为 MySQL DDL
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pipelines` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `pipeline_id`      VARCHAR(64)   NOT NULL,
  `name`             VARCHAR(128)  NOT NULL,
  `description`      TEXT          NULL,
  `category`         VARCHAR(32)   NOT NULL DEFAULT 'custom',
  `dag_config`       JSON          NULL,
  `status`           ENUM('draft','active','paused','error','running','archived') NOT NULL DEFAULT 'draft',
  `node_count`       INT           DEFAULT 0,
  `connection_count` INT           DEFAULT 0,
  `total_runs`       INT           DEFAULT 0,
  `success_runs`     INT           DEFAULT 0,
  `failed_runs`      INT           DEFAULT 0,
  `last_run_at`      TIMESTAMP     NULL,
  `created_at`       DATETIME(3)   NOT NULL,
  `updated_at`       DATETIME(3)   NOT NULL,
  UNIQUE KEY `uk_pipeline_id` (`pipeline_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_runs` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `run_id`            VARCHAR(64)   NOT NULL,
  `pipeline_id`       VARCHAR(64)   NOT NULL,
  `status`            ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `trigger_type`      ENUM('manual','schedule','api','event') NOT NULL DEFAULT 'manual',
  `started_at`        DATETIME(3)   NULL,
  `finished_at`       DATETIME(3)   NULL,
  `duration_ms`       INT           NULL,
  `total_records_in`  INT           DEFAULT 0,
  `total_records_out` INT           DEFAULT 0,
  `error_count`       INT           DEFAULT 0,
  `node_results`      JSON          NULL,
  `lineage_data`      JSON          NULL,
  `created_at`        DATETIME(3)   NOT NULL,
  UNIQUE KEY `uk_run_id` (`run_id`),
  KEY `idx_pipeline_id` (`pipeline_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_node_metrics` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `run_id`        VARCHAR(64)   NOT NULL,
  `pipeline_id`   VARCHAR(64)   NOT NULL,
  `node_id`       VARCHAR(64)   NOT NULL,
  `node_name`     VARCHAR(128)  NULL,
  `node_type`     VARCHAR(32)   NULL,
  `node_sub_type` VARCHAR(64)   NULL,
  `status`        VARCHAR(16)   NULL,
  `records_in`    INT           DEFAULT 0,
  `records_out`   INT           DEFAULT 0,
  `duration_ms`   INT           NULL,
  `error_message` TEXT          NULL,
  `created_at`    DATETIME(3)   NOT NULL,
  KEY `idx_run_id` (`run_id`),
  KEY `idx_pipeline_id` (`pipeline_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证
SELECT CONCAT('✅ 管线层 DDL 执行完成，共创建 ', COUNT(DISTINCT table_name), ' 张表') AS result
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('pipelines', 'pipeline_runs', 'pipeline_node_metrics');
