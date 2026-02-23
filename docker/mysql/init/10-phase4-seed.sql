-- ============================================================================
-- Phase 4 Seed 数据 — 安全护栏引擎升级 + 知识结晶增强
-- ============================================================================
-- 版本: v5.0
-- 依赖: 09-phase4-ddl.sql, 05-base-seed.sql, 07-evolution-seed.sql
-- ============================================================================

-- ============================================================================
-- 6.1 guardrail_rules 升级链配置
-- ============================================================================

-- 规则 1: 倾覆风险 — 最高优先级，快速升级
UPDATE `guardrail_rules` SET
  cooldown_ms = 30000,
  escalation_config = '{"levels":[{"action":"alert","delayMs":0},{"action":"throttle","delayMs":60000},{"action":"halt","delayMs":120000}]}'
WHERE id = 1;

-- 规则 2: 风速超限 — 中等冷却，三级升级
UPDATE `guardrail_rules` SET
  cooldown_ms = 60000,
  escalation_config = '{"levels":[{"action":"alert","delayMs":0},{"action":"throttle","delayMs":120000},{"action":"halt","delayMs":300000}]}'
WHERE id = 2;

-- 规则 3-5: 振动/温度/多因素 — 两级升级
UPDATE `guardrail_rules` SET
  cooldown_ms = 45000,
  escalation_config = '{"levels":[{"action":"alert","delayMs":0},{"action":"throttle","delayMs":90000}]}'
WHERE id IN (3, 4, 5);

-- ============================================================================
-- 6.2 knowledge_crystals 字段更新
-- ============================================================================

UPDATE `knowledge_crystals` SET
  type = 'pattern', status = 'approved', source_type = 'cognition',
  created_by = 'system:cognition', application_count = 12, negative_feedback_rate = 0.08,
  content_hash = MD5(pattern)
WHERE id = 1;

UPDATE `knowledge_crystals` SET
  type = 'threshold_update', status = 'approved', source_type = 'evolution',
  created_by = 'system:evolution', application_count = 8, negative_feedback_rate = 0.05,
  content_hash = MD5(pattern)
WHERE id = 2;

UPDATE `knowledge_crystals` SET
  type = 'causal_link', status = 'pending_review', source_type = 'cognition',
  created_by = 'system:cognition', application_count = 3, negative_feedback_rate = 0.15,
  content_hash = MD5(pattern)
WHERE id = 3;

UPDATE `knowledge_crystals` SET
  type = 'anomaly_signature', status = 'draft', source_type = 'manual',
  created_by = 'user:admin', application_count = 0, negative_feedback_rate = 0.0,
  content_hash = MD5(pattern)
WHERE id = 4;

UPDATE `knowledge_crystals` SET
  type = 'pattern', status = 'deprecated', source_type = 'evolution',
  created_by = 'system:evolution', application_count = 20, negative_feedback_rate = 0.45,
  review_comment = '自动降级：负面反馈率 45.0% 超过阈值 40%',
  content_hash = MD5(pattern)
WHERE id = 5;

-- ============================================================================
-- 6.3 crystal_applications（使用子查询引用，确保语义稳定性）
-- ============================================================================

INSERT IGNORE INTO `crystal_applications` (`crystal_id`, `applied_in`, `context_summary`, `outcome`, `applied_at`) VALUES
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1),
  'cognition_session', '起重机 #3 振动诊断会话中匹配到该模式', 'positive', '2026-01-15 10:30:00'),
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1),
  'decision', '基于该模式建议提前更换轴承', 'positive', '2026-01-16 14:00:00'),
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1 OFFSET 1),
  'cognition_session', '高温环境下阈值自动调整', 'positive', '2026-01-18 09:00:00'),
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1 OFFSET 2),
  'cognition_session', '因果推理中引用该链路', 'neutral', '2026-01-20 11:00:00'),
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1),
  'guardrail', '护栏触发后自动关联该模式', 'positive', '2026-01-22 16:00:00');

-- ============================================================================
-- 6.4 crystal_migrations
-- ============================================================================

INSERT IGNORE INTO `crystal_migrations` (`crystal_id`, `from_profile`, `to_profile`, `adaptations`, `new_crystal_id`, `status`, `migrated_at`) VALUES
((SELECT id FROM knowledge_crystals ORDER BY id LIMIT 1),
  'standard_indoor', 'high_temperature_outdoor',
  '[{"field":"vibration_threshold","originalValue":4.5,"adaptedValue":5.2,"reason":"高温环境振动基线偏高"}]',
  NULL, 'success', '2026-01-25 10:00:00');

-- ============================================================================
-- 6.5 guardrail_effectiveness_logs
-- ============================================================================

INSERT IGNORE INTO `guardrail_effectiveness_logs` (`rule_id`, `period_start`, `period_end`, `total_triggers`, `true_positives`, `false_positives`, `avg_severity`, `computed_at`) VALUES
(1, '2026-01-01', '2026-01-31', 45, 38, 7, 0.62, '2026-02-01 02:00:00'),
(2, '2026-01-01', '2026-01-31', 23, 20, 3, 0.55, '2026-02-01 02:00:00'),
(3, '2026-01-01', '2026-01-31', 12, 10, 2, 0.48, '2026-02-01 02:00:00');

-- ============================================================================
SELECT '✅ Phase 4 Seed 数据执行完成' AS result;
