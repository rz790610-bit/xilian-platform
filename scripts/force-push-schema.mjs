/**
 * 强制推送 schema 到数据库
 * 绕过 drizzle-kit push 的 bug，直接用 mysql2 执行建表
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://portai:portai123@localhost:3306/portai_nexus';

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // 1. 获取已有的表
  const [existingTables] = await conn.query('SHOW TABLES');
  const existingSet = new Set(existingTables.map(r => Object.values(r)[0]));
  console.log(`数据库中已有 ${existingSet.size} 张表`);
  
  // 2. 需要创建的表（从 drizzle schema 中提取的所有表）
  const requiredTables = {
    plugin_events: `CREATE TABLE IF NOT EXISTS plugin_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL UNIQUE,
      instance_id INT NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload JSON,
      severity VARCHAR(16) NOT NULL DEFAULT 'info',
      source_plugin VARCHAR(64),
      target_plugin VARCHAR(64),
      processed TINYINT NOT NULL DEFAULT 0,
      processed_at TIMESTAMP NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      expires_at TIMESTAMP NULL,
      INDEX idx_pe_instance (instance_id),
      INDEX idx_pe_type (event_type)
    )`,
    plugin_registry: `CREATE TABLE IF NOT EXISTS plugin_registry (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plugin_code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      plugin_type VARCHAR(32) NOT NULL,
      version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
      author VARCHAR(64),
      entry_point VARCHAR(256),
      config_schema JSON,
      default_config JSON,
      dependencies JSON,
      permissions JSON,
      status VARCHAR(16) NOT NULL DEFAULT 'inactive',
      icon VARCHAR(256),
      tags JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    plugin_instances: `CREATE TABLE IF NOT EXISTS plugin_instances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      instance_code VARCHAR(64) NOT NULL UNIQUE,
      plugin_id INT NOT NULL,
      name VARCHAR(128) NOT NULL,
      bound_entity_type VARCHAR(64),
      bound_entity_id VARCHAR(64),
      config JSON,
      status VARCHAR(16) NOT NULL DEFAULT 'stopped',
      health_status VARCHAR(16) DEFAULT 'unknown',
      last_health_check TIMESTAMP NULL,
      error_count INT NOT NULL DEFAULT 0,
      last_error TEXT,
      started_at TIMESTAMP NULL,
      stopped_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pi_plugin (plugin_id),
      INDEX idx_pi_status (status)
    )`,
    alert_rules: `CREATE TABLE IF NOT EXISTS alert_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rule_code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      category VARCHAR(32) NOT NULL DEFAULT 'threshold',
      severity VARCHAR(16) NOT NULL DEFAULT 'warning',
      target_type VARCHAR(32) NOT NULL,
      target_id VARCHAR(64),
      condition_expr TEXT NOT NULL,
      threshold_value DECIMAL(20,6),
      duration_seconds INT DEFAULT 0,
      cooldown_seconds INT DEFAULT 300,
      notification_channels JSON,
      enabled TINYINT NOT NULL DEFAULT 1,
      trigger_count INT NOT NULL DEFAULT 0,
      last_triggered_at TIMESTAMP NULL,
      created_by VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ar_category (category),
      INDEX idx_ar_severity (severity),
      INDEX idx_ar_enabled (enabled)
    )`,
    audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      trace_id VARCHAR(64) NOT NULL,
      action VARCHAR(64) NOT NULL,
      resource_type VARCHAR(64) NOT NULL,
      resource_id VARCHAR(128),
      operator VARCHAR(64) NOT NULL,
      ip_address VARCHAR(45),
      user_agent VARCHAR(256),
      request_body JSON,
      response_status INT,
      result VARCHAR(16) NOT NULL DEFAULT 'success',
      error_message TEXT,
      duration_ms INT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_al_action (action),
      INDEX idx_al_operator (operator),
      INDEX idx_al_resource (resource_type),
      INDEX idx_al_created (created_at)
    )`,
    scheduled_tasks: `CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      task_type VARCHAR(32) NOT NULL,
      cron_expression VARCHAR(64),
      handler VARCHAR(256) NOT NULL,
      params JSON,
      enabled TINYINT NOT NULL DEFAULT 1,
      last_run_at TIMESTAMP NULL,
      last_run_status VARCHAR(16),
      last_run_duration_ms INT,
      next_run_at TIMESTAMP NULL,
      run_count INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0,
      max_retries INT NOT NULL DEFAULT 3,
      timeout_seconds INT NOT NULL DEFAULT 300,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_st_type (task_type),
      INDEX idx_st_enabled (enabled)
    )`,
    device_rule_versions: `CREATE TABLE IF NOT EXISTS device_rule_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rule_id VARCHAR(64) NOT NULL,
      version INT NOT NULL DEFAULT 1,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      rule_type VARCHAR(32) NOT NULL,
      condition_config JSON NOT NULL,
      action_config JSON,
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      published_at TIMESTAMP NULL,
      published_by VARCHAR(64),
      change_log TEXT,
      is_current TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drv_rule (rule_id),
      INDEX idx_drv_status (status)
    )`,
    rollback_triggers: `CREATE TABLE IF NOT EXISTS rollback_triggers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trigger_code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      trigger_type VARCHAR(32) NOT NULL,
      condition_config JSON NOT NULL,
      target_version INT,
      auto_rollback TINYINT NOT NULL DEFAULT 0,
      cooldown_minutes INT NOT NULL DEFAULT 30,
      enabled TINYINT NOT NULL DEFAULT 1,
      last_triggered_at TIMESTAMP NULL,
      trigger_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rt_type (trigger_type),
      INDEX idx_rt_enabled (enabled)
    )`,
    rollback_executions: `CREATE TABLE IF NOT EXISTS rollback_executions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      execution_id VARCHAR(64) NOT NULL UNIQUE,
      trigger_id INT NOT NULL,
      from_version INT NOT NULL,
      to_version INT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      rollback_reason TEXT,
      affected_devices INT DEFAULT 0,
      error_message TEXT,
      executed_by VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_re_trigger (trigger_id),
      INDEX idx_re_status (status)
    )`,
    data_export_tasks: `CREATE TABLE IF NOT EXISTS data_export_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      export_type VARCHAR(32) NOT NULL DEFAULT 'manual',
      format VARCHAR(16) NOT NULL DEFAULT 'csv',
      query_params JSON,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      progress VARCHAR(16) DEFAULT '0%',
      total_rows INT DEFAULT 0,
      file_url VARCHAR(512),
      file_size BIGINT DEFAULT 0,
      error_message TEXT,
      created_by VARCHAR(64),
      started_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_det_type (export_type),
      INDEX idx_det_status (status)
    )`,
    data_lineage: `CREATE TABLE IF NOT EXISTS data_lineage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lineage_id VARCHAR(64) NOT NULL UNIQUE,
      source_table VARCHAR(128) NOT NULL,
      source_column VARCHAR(128),
      target_table VARCHAR(128) NOT NULL,
      target_column VARCHAR(128),
      transform_type VARCHAR(32) NOT NULL,
      transform_logic TEXT,
      data_flow_direction VARCHAR(16) NOT NULL DEFAULT 'forward',
      confidence DECIMAL(5,2) DEFAULT 1.00,
      is_active TINYINT NOT NULL DEFAULT 1,
      discovered_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dl_source (source_table),
      INDEX idx_dl_target (target_table)
    )`,
    kg_nodes: `CREATE TABLE IF NOT EXISTS kg_nodes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(64) NOT NULL UNIQUE,
      node_type VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      properties JSON,
      source VARCHAR(64),
      confidence DECIMAL(5,2) DEFAULT 1.00,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_kgn_type (node_type),
      INDEX idx_kgn_status (status)
    )`,
    kg_edges: `CREATE TABLE IF NOT EXISTS kg_edges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      edge_id VARCHAR(64) NOT NULL UNIQUE,
      source_node_id VARCHAR(64) NOT NULL,
      target_node_id VARCHAR(64) NOT NULL,
      relation_type VARCHAR(64) NOT NULL,
      properties JSON,
      weight DECIMAL(10,4) DEFAULT 1.0000,
      confidence DECIMAL(5,2) DEFAULT 1.00,
      source VARCHAR(64),
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_kge_source (source_node_id),
      INDEX idx_kge_target (target_node_id),
      INDEX idx_kge_relation (relation_type)
    )`,
    kb_collections: `CREATE TABLE IF NOT EXISTS kb_collections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      collection_id VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      embedding_model VARCHAR(64) DEFAULT 'text-embedding-ada-002',
      dimension INT DEFAULT 1536,
      distance_metric VARCHAR(16) DEFAULT 'cosine',
      document_count INT NOT NULL DEFAULT 0,
      chunk_count INT NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      metadata JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    system_capacity_metrics: `CREATE TABLE IF NOT EXISTS system_capacity_metrics (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      metric_type VARCHAR(32) NOT NULL,
      metric_name VARCHAR(64) NOT NULL,
      metric_value DECIMAL(20,6) NOT NULL,
      unit VARCHAR(16),
      node_id VARCHAR(64),
      tags JSON,
      collected_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_scm_type (metric_type),
      INDEX idx_scm_collected (collected_at)
    )`,
    config_change_logs: `CREATE TABLE IF NOT EXISTS config_change_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      change_id VARCHAR(64) NOT NULL UNIQUE,
      config_key VARCHAR(128) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      change_type VARCHAR(16) NOT NULL DEFAULT 'update',
      changed_by VARCHAR(64) NOT NULL,
      change_reason TEXT,
      resource_type VARCHAR(64),
      resource_id VARCHAR(128),
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ccl_key (config_key),
      INDEX idx_ccl_changed (changed_at)
    )`,
    data_quality_reports: `CREATE TABLE IF NOT EXISTS data_quality_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_id VARCHAR(64) NOT NULL UNIQUE,
      table_name VARCHAR(128) NOT NULL,
      total_rows BIGINT DEFAULT 0,
      valid_rows BIGINT DEFAULT 0,
      invalid_rows BIGINT DEFAULT 0,
      completeness_score DECIMAL(5,2) DEFAULT 0,
      accuracy_score DECIMAL(5,2) DEFAULT 0,
      consistency_score DECIMAL(5,2) DEFAULT 0,
      timeliness_score DECIMAL(5,2) DEFAULT 0,
      overall_score DECIMAL(5,2) DEFAULT 0,
      issues JSON,
      recommendations JSON,
      report_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dqr_table (table_name),
      INDEX idx_dqr_date (report_date)
    )`,
  };

  // 3. 检查并创建缺失的表
  let created = 0;
  let skipped = 0;
  for (const [tableName, sql] of Object.entries(requiredTables)) {
    if (existingSet.has(tableName)) {
      console.log(`  ✅ ${tableName} - 已存在`);
      skipped++;
    } else {
      try {
        await conn.query(sql);
        console.log(`  🆕 ${tableName} - 已创建`);
        created++;
      } catch (err) {
        console.error(`  ❌ ${tableName} - 创建失败: ${err.message}`);
      }
    }
  }

  console.log(`\n完成: 创建 ${created} 张表, 跳过 ${skipped} 张已有表`);
  
  // 4. 最终统计
  const [finalTables] = await conn.query('SHOW TABLES');
  console.log(`数据库中现有 ${finalTables.length} 张表`);
  
  await conn.end();
}

main().catch(console.error);
