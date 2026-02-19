-- ============================================================
-- Migration 003: Fix Drizzle ↔ SQL Schema Consistency
-- Date: 2026-02-08
-- Description: Align SQL table columns with Drizzle schema definitions
--   - device_alerts: device_id→node_id, notes→resolution, add metadata
--   - device_maintenance_records: device_id→node_id
--   - device_operation_logs: device_id→node_id
--   - processed_events: add event_type column
-- ============================================================

SET NAMES utf8mb4;

-- 1. device_alerts: device_id → node_id, notes → resolution, add metadata
ALTER TABLE device_alerts
  CHANGE COLUMN device_id node_id VARCHAR(64) NOT NULL,
  CHANGE COLUMN notes resolution TEXT,
  ADD COLUMN metadata JSON AFTER notifications_sent,
  DROP INDEX idx_device_alerts_device_id,
  ADD INDEX idx_device_alerts_node_id (node_id);

-- 2. device_maintenance_records: device_id → node_id
ALTER TABLE device_maintenance_records
  CHANGE COLUMN device_id node_id VARCHAR(64) NOT NULL,
  DROP INDEX idx_device_maintenance_records_device_id,
  ADD INDEX idx_device_maintenance_records_node_id (node_id);

-- 3. device_operation_logs: device_id → node_id
ALTER TABLE device_operation_logs
  CHANGE COLUMN device_id node_id VARCHAR(64) NOT NULL,
  DROP INDEX idx_device_operation_logs_device_id,
  ADD INDEX idx_device_operation_logs_node_id (node_id);

-- 4. processed_events: add event_type column
ALTER TABLE processed_events
  ADD COLUMN event_type VARCHAR(100) NOT NULL DEFAULT '' AFTER event_id;

SELECT 'Migration 003 completed successfully!' AS status;
