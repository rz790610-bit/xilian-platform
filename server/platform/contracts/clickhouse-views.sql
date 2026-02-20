-- ============================================================================
-- 深度进化 v5.0 — ClickHouse 物化视图 DDL
-- ============================================================================
-- 5 个物化视图，按闭环阶段覆盖：
--   1. mv_device_health_wide: 设备健康一览（按设备+小时聚合）
--   2. mv_cycle_phase_stats: 周期阶段分析（按设备+工况+阶段聚合）
--   3. mv_fusion_diagnosis_wide: 融合诊断分析（按诊断任务聚合）
--   4. mv_guardrail_effectiveness: 护栏效果评估（按规则+天聚合）
--   5. mv_evolution_trend: 进化趋势追踪（按周聚合）
-- ============================================================================

-- ============================================================================
-- 1. mv_device_health_wide — 设备健康一览
-- ============================================================================
-- 源表: realtime_telemetry + device_alerts + cognition_sessions (MySQL → Kafka → CH)
-- 聚合: 按设备ID + 小时
-- 用途: 仪表盘设备健康卡片、告警概览

CREATE TABLE IF NOT EXISTS mv_device_health_wide
(
    machine_id       String,
    hour             DateTime,
    -- 遥测聚合
    vibration_rms_avg    Float64,
    vibration_rms_max    Float64,
    vibration_rms_std    Float64,
    motor_current_avg    Float64,
    motor_current_peak   Float64,
    temperature_avg      Float64,
    temperature_max      Float64,
    -- 告警统计
    alert_count          UInt32,
    critical_alert_count UInt32,
    -- 认知会话统计
    session_count        UInt32,
    safety_score_avg     Float64,
    safety_score_min     Float64,
    health_score_avg     Float64,
    health_score_min     Float64,
    efficiency_score_avg Float64,
    -- 累积指标
    fatigue_accum_latest Float64,
    remaining_life_days  Float64,
    total_cycles         UInt32,
    operating_hours      Float64,
    -- 不确定性
    wind_speed_max       Float64,
    uncertainty_score_avg Float64
)
ENGINE = SummingMergeTree()
ORDER BY (machine_id, hour)
TTL hour + INTERVAL 90 DAY;

-- ============================================================================
-- 2. mv_cycle_phase_stats — 周期阶段分析
-- ============================================================================
-- 源表: realtime_telemetry + condition_instances
-- 聚合: 按设备 + 工况 + 周期阶段
-- 用途: 周期碎片聚合分析（场景验证：岸桥 2 分钟周期）

CREATE TABLE IF NOT EXISTS mv_cycle_phase_stats
(
    machine_id       String,
    condition_id     String,
    cycle_phase      String,
    date             Date,
    -- 阶段特征聚合
    avg_speed_rpm        Float64,
    peak_current_a       Float64,
    peak_vibration_rms   Float64,
    avg_cycle_time_s     Float64,
    min_cycle_time_s     Float64,
    max_cycle_time_s     Float64,
    avg_interlock_delay_ms Float64,
    -- 不确定性
    avg_uncertainty_score Float64,
    max_wind_speed       Float64,
    avg_cargo_eccentricity Float64,
    -- 统计
    cycle_count          UInt32,
    anomaly_count        UInt32,
    -- 疲劳
    fatigue_increment_sum Float64,
    stress_max_peak      Float64
)
ENGINE = SummingMergeTree()
ORDER BY (machine_id, condition_id, cycle_phase, date)
TTL date + INTERVAL 365 DAY;

-- ============================================================================
-- 3. mv_fusion_diagnosis_wide — 融合诊断分析
-- ============================================================================
-- 源表: cognition_sessions + cognition_dimension_results + grok_reasoning_chains
-- 聚合: 按诊断任务
-- 用途: 诊断质量分析、Grok 推理效率追踪

CREATE TABLE IF NOT EXISTS mv_fusion_diagnosis_wide
(
    session_id           String,
    machine_id           String,
    condition_id         String,
    trigger_type         String,
    started_at           DateTime,
    -- 四维得分
    perception_score     Float64,
    reasoning_score      Float64,
    fusion_score         Float64,
    decision_score       Float64,
    -- 综合得分
    safety_score         Float64,
    health_score         Float64,
    efficiency_score     Float64,
    -- 置信度
    perception_confidence Float64,
    reasoning_confidence  Float64,
    fusion_confidence     Float64,
    decision_confidence   Float64,
    -- Grok 推理
    grok_reasoning_steps UInt32,
    grok_tool_calls      UInt32,
    grok_total_time_ms   UInt32,
    -- 处理时间
    total_processing_ms  UInt32,
    perception_time_ms   UInt32,
    reasoning_time_ms    UInt32,
    fusion_time_ms       UInt32,
    decision_time_ms     UInt32,
    -- 诊断条目数
    diagnostic_count     UInt32,
    critical_count       UInt32,
    high_count           UInt32
)
ENGINE = ReplacingMergeTree()
ORDER BY (session_id)
TTL started_at + INTERVAL 180 DAY;

-- ============================================================================
-- 4. mv_guardrail_effectiveness — 护栏效果评估
-- ============================================================================
-- 源表: guardrail_violations + cognition_sessions
-- 聚合: 按规则 + 天
-- 用途: 护栏规则调优、误报率追踪

CREATE TABLE IF NOT EXISTS mv_guardrail_effectiveness
(
    rule_id              UInt64,
    rule_type            String,
    date                 Date,
    -- 触发统计
    trigger_count        UInt32,
    executed_count       UInt32,
    overridden_count     UInt32,
    failed_count         UInt32,
    -- 效果评估
    execution_success_rate Float64,
    false_positive_rate    Float64,
    -- 干预后改善
    avg_post_improvement   Float64,
    max_post_improvement   Float64,
    -- 关联诊断
    avg_safety_score_before  Float64,
    avg_safety_score_after   Float64,
    avg_health_score_before  Float64,
    avg_health_score_after   Float64,
    -- 设备分布
    unique_machines      UInt32
)
ENGINE = SummingMergeTree()
ORDER BY (rule_id, rule_type, date)
TTL date + INTERVAL 365 DAY;

-- ============================================================================
-- 5. mv_evolution_trend — 进化趋势追踪
-- ============================================================================
-- 源表: evolution_cycles + shadow_eval_metrics
-- 聚合: 按周
-- 用途: 自进化飞轮效果追踪

CREATE TABLE IF NOT EXISTS mv_evolution_trend
(
    week                 Date,
    -- 进化周期统计
    cycles_completed     UInt32,
    total_edge_cases     UInt32,
    total_hypotheses     UInt32,
    total_models_evaluated UInt32,
    total_deployed       UInt32,
    -- 准确率趋势
    avg_accuracy_before  Float64,
    avg_accuracy_after   Float64,
    avg_improvement      Float64,
    max_improvement      Float64,
    -- 知识结晶
    total_crystals       UInt32,
    avg_crystal_confidence Float64,
    -- 影子评估
    shadow_eval_count    UInt32,
    avg_tas_score        Float64,
    promote_count        UInt32,
    reject_count         UInt32,
    -- 金丝雀
    canary_count         UInt32,
    canary_rollback_count UInt32
)
ENGINE = SummingMergeTree()
ORDER BY (week)
TTL week + INTERVAL 730 DAY;
