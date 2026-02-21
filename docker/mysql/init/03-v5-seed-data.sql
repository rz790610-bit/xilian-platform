-- ============================================================
-- 西联智能平台 v5.0 - 深度进化模块种子数据
-- 字段名与 02-v5-ddl.sql 完全对齐
-- ============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 设备档案（equipment_profiles）
-- 字段: id, type, manufacturer, model, physical_constraints, failure_modes, world_model_config, maintenance_schedule
-- ============================================================
INSERT INTO equipment_profiles (type, manufacturer, model, physical_constraints, failure_modes, world_model_config) VALUES
('rotating_machinery', '西门子', 'SGT-800',
 '{"constraints":[{"type":"correlation","variables":["vibration_rms","bearing_temp"],"expression":"vibration_rms > 7.1 => bearing_temp > 85"},{"type":"bound","variables":["speed"],"expression":"0 <= speed <= 13000"}]}',
 '{"modes":[{"name":"轴承磨损","symptoms":["振动升高","温度异常","噪声增大"],"severity":"major"},{"name":"转子不平衡","symptoms":["1X振动升高","相位漂移"],"severity":"minor"}]}',
 '{"stateVectorDim":12,"predictionHorizonHours":168,"updateIntervalMs":5000}'),

('compressor', '阿特拉斯科普柯', 'ZR 500',
 '{"constraints":[{"type":"causation","variables":["discharge_pressure","intake_temp"],"expression":"P2 = P1 * (T2/T1)^(k/(k-1))"},{"type":"bound","variables":["discharge_temp"],"expression":"discharge_temp <= 180"}]}',
 '{"modes":[{"name":"阀片断裂","symptoms":["排气温度骤升","压力波动","异响"],"severity":"critical"},{"name":"密封泄漏","symptoms":["排气压力下降","能耗升高"],"severity":"major"}]}',
 '{"stateVectorDim":8,"predictionHorizonHours":72,"updateIntervalMs":3000}'),

('pump', '格兰富', 'CR 95-4',
 '{"constraints":[{"type":"correlation","variables":["flow_rate","head"],"expression":"H = H0 - k*Q²"},{"type":"bound","variables":["npsh"],"expression":"npsh_available > npsh_required + 0.5"}]}',
 '{"modes":[{"name":"气蚀","symptoms":["噪声增大","振动升高","流量波动","效率下降"],"severity":"major"},{"name":"机械密封失效","symptoms":["泄漏","温度升高"],"severity":"critical"}]}',
 '{"stateVectorDim":10,"predictionHorizonHours":120,"updateIntervalMs":5000}'),

('fan', '海尔', 'AXF-2000',
 '{"constraints":[{"type":"bound","variables":["blade_speed"],"expression":"blade_speed <= 1800"},{"type":"correlation","variables":["vibration","imbalance"],"expression":"vibration ~ imbalance * speed²"}]}',
 '{"modes":[{"name":"叶片裂纹","symptoms":["振动异常","效率下降"],"severity":"critical"},{"name":"轴承过热","symptoms":["温度升高","噪声增大"],"severity":"major"}]}',
 '{"stateVectorDim":8,"predictionHorizonHours":96,"updateIntervalMs":5000}'),

('motor', 'ABB', 'M3BP 315',
 '{"constraints":[{"type":"bound","variables":["winding_temp"],"expression":"winding_temp <= 155"},{"type":"bound","variables":["current"],"expression":"current <= 1.15 * rated_current"}]}',
 '{"modes":[{"name":"绕组绝缘老化","symptoms":["局放增大","温度升高"],"severity":"major"},{"name":"轴电流","symptoms":["轴承点蚀","润滑脂变色"],"severity":"minor"}]}',
 '{"stateVectorDim":6,"predictionHorizonHours":240,"updateIntervalMs":10000}');

-- ============================================================
-- 工况配置（condition_profiles）
-- 字段: id, name, industry, equipment_type, description, parameters, sensor_mapping,
--        threshold_strategy, cognition_config, guardrail_overrides, version, enabled
-- ============================================================
INSERT INTO condition_profiles (name, industry, equipment_type, description, parameters, sensor_mapping, threshold_strategy, cognition_config, version, enabled) VALUES
('正常负载工况', '石化', 'rotating_machinery', '设备在额定负载范围内稳定运行',
 '[{"name":"vibration_rms","range":[0,7],"unit":"mm/s","description":"振动均方根"},{"name":"bearing_temp","range":[20,85],"unit":"°C","description":"轴承温度"},{"name":"speed","range":[2800,3200],"unit":"rpm","description":"转速"},{"name":"load_ratio","range":[0.3,0.9],"unit":"ratio","description":"负载率"}]',
 '[{"logicalName":"vibration","physicalChannel":"CH01","samplingRate":1000,"unit":"mm/s"},{"logicalName":"temperature","physicalChannel":"CH05","samplingRate":10,"unit":"°C"}]',
 '{"type":"static","staticThresholds":{"vibration_rms":4.5,"bearing_temp":75}}',
 '{"perceptionSensitivity":0.8,"reasoningDepth":"standard","fusionStrategy":"ds_theory","decisionUrgency":"normal"}',
 '1.0.0', 1),

('高负载工况', '石化', 'rotating_machinery', '设备在80%以上额定负载运行',
 '[{"name":"vibration_rms","range":[0,11],"unit":"mm/s","description":"振动均方根"},{"name":"bearing_temp","range":[20,95],"unit":"°C","description":"轴承温度"},{"name":"load_ratio","range":[0.8,1.1],"unit":"ratio","description":"负载率"}]',
 '[{"logicalName":"vibration","physicalChannel":"CH01","samplingRate":2000,"unit":"mm/s"},{"logicalName":"temperature","physicalChannel":"CH05","samplingRate":10,"unit":"°C"}]',
 '{"type":"dynamic","dynamicConfig":{"method":"adaptive_baseline","windowSize":180}}',
 '{"perceptionSensitivity":0.9,"reasoningDepth":"deep","fusionStrategy":"ds_theory","decisionUrgency":"high"}',
 '1.0.0', 1),

('压缩机正常运行', '石化', 'compressor', '压缩机在设计工况点附近运行',
 '[{"name":"discharge_pressure","range":[6,10],"unit":"bar","description":"排气压力"},{"name":"discharge_temp","range":[100,170],"unit":"°C","description":"排气温度"},{"name":"flow_rate","range":[50,120],"unit":"m³/min","description":"流量"}]',
 '[{"logicalName":"pressure","physicalChannel":"CH10","samplingRate":100,"unit":"bar"},{"logicalName":"temperature","physicalChannel":"CH11","samplingRate":10,"unit":"°C"}]',
 '{"type":"static","staticThresholds":{"discharge_temp":160,"surge_margin":0.15}}',
 '{"perceptionSensitivity":0.85,"reasoningDepth":"standard","fusionStrategy":"ds_theory","decisionUrgency":"normal"}',
 '1.0.0', 1);

-- ============================================================
-- 特征定义（feature_definitions）
-- 字段: id, name, category(enum), description, input_signals, compute_logic,
--        applicable_equipment, output_unit, output_range, version, enabled
-- ============================================================
INSERT INTO feature_definitions (name, category, description, input_signals, compute_logic, applicable_equipment, output_unit, output_range, version, enabled) VALUES
('振动RMS特征', 'time_domain', '时域振动均方根值，反映整体振动能量',
 '["acceleration_x","acceleration_y","acceleration_z"]',
 'rms = sqrt(mean(x² + y² + z²))',
 '["rotating_machinery","compressor","pump"]',
 'mm/s', '{"min":0,"max":50}', '2.1.0', 1),

('轴承温度梯度', 'derived', '轴承温度变化率，用于早期异常检测',
 '["bearing_temp_de","bearing_temp_nde"]',
 'gradient = diff(temp) / dt, smoothed with EMA(alpha=0.1)',
 '["rotating_machinery"]',
 '°C/min', '{"min":-5,"max":10}', '1.3.0', 1),

('排气温度偏差', 'physics', '实际排气温度与理论值的偏差',
 '["discharge_temp","intake_temp","discharge_pressure","intake_pressure"]',
 'deviation = T_actual - T_theoretical, where T_theoretical = T1 * (P2/P1)^((k-1)/k)',
 '["compressor"]',
 '°C', '{"min":-20,"max":50}', '1.0.0', 1),

('泵效率指标', 'derived', '实际泵效率与设计效率的比值',
 '["flow_rate","head","power_consumption"]',
 'eta = (rho * g * Q * H) / (P * 1000), ratio = eta / eta_design',
 '["pump"]',
 '%', '{"min":0,"max":100}', '1.2.0', 1),

('频谱包络特征', 'freq_domain', '振动频谱包络的关键频率成分',
 '["acceleration_x","speed"]',
 'envelope = hilbert_transform(bandpass(signal, [500, 5000])), extract peaks at BPFO/BPFI/BSF/FTF',
 '["rotating_machinery"]',
 'g', '{"min":0,"max":10}', '3.0.0', 1);

-- ============================================================
-- 护栏规则（guardrail_rules）
-- 字段: id, name, type(enum), description, condition(json), action(json),
--        priority(int), enabled, version, applicable_equipment, physical_basis
-- ============================================================
INSERT INTO guardrail_rules (name, type, description, `condition`, `action`, priority, enabled, version, physical_basis) VALUES
('振动超限保护', 'safety', '振动RMS超过安全阈值时触发紧急停机',
 '{"field":"vibration_rms","operator":"gt","threshold":11.2}',
 '{"action":"emergency_stop","params":{"notify":["ops_team","safety_officer"]}}',
 10, 1, '1.0.0', 'ISO 10816-3 Zone D'),

('轴承温度预警', 'health', '轴承温度超过预警阈值时发出告警',
 '{"field":"bearing_temp","operator":"gt","threshold":85}',
 '{"action":"alert","params":{"notify":["maintenance_team"],"escalate_after_ms":300000}}',
 20, 1, '1.0.0', 'Bearing manufacturer spec: max continuous 95°C'),

('效率衰减监测', 'efficiency', '设备效率低于基线80%时触发优化建议',
 '{"field":"efficiency_ratio","operator":"lt","threshold":0.8}',
 '{"action":"recommend","params":{"suggestion":"检查密封、清洗换热器、校准传感器"}}',
 50, 1, '1.0.0', 'Design efficiency baseline'),

('排气温度超限', 'safety', '压缩机排气温度超过安全上限',
 '{"field":"discharge_temp","operator":"gt","threshold":175}',
 '{"action":"load_reduction","params":{"target_load":0.7,"notify":["ops_team"]}}',
 10, 1, '1.0.0', 'API 618 discharge temperature limit'),

('气蚀风险预警', 'health', 'NPSH余量不足时预警',
 '{"field":"npsh_margin","operator":"lt","threshold":0.5}',
 '{"action":"alert","params":{"notify":["pump_operator"],"auto_adjust":"reduce_flow_5pct"}}',
 20, 1, '1.0.0', 'Hydraulic Institute Standards');

-- ============================================================
-- 护栏违规记录（guardrail_violations）
-- 字段: id, rule_id, session_id, machine_id, timestamp, trigger_values(json),
--        action(varchar), reason(text), outcome(enum), created_at
-- ============================================================
INSERT INTO guardrail_violations (rule_id, session_id, machine_id, `timestamp`, trigger_values, `action`, reason, outcome, created_at) VALUES
(1, 'sess-cog-001', 'SGT800-A01', NOW() - INTERVAL 3 DAY,
 '{"vibration_rms":12.3}', 'emergency_stop', '振动RMS=12.3mm/s，超过安全阈值11.2mm/s', 'executed', NOW() - INTERVAL 3 DAY),
(2, 'sess-cog-001', 'SGT800-A01', NOW() - INTERVAL 2 DAY,
 '{"bearing_temp":91.5}', 'alert', '轴承温度91.5°C，超过预警阈值85°C', 'executed', NOW() - INTERVAL 2 DAY),
(4, 'sess-cog-002', 'ZR500-B01', NOW() - INTERVAL 1 DAY,
 '{"discharge_temp":178.2}', 'load_reduction', '排气温度178.2°C，超过安全上限175°C', 'executed', NOW() - INTERVAL 1 DAY),
(5, 'sess-cog-003', 'CR95-C01', NOW() - INTERVAL 12 HOUR,
 '{"npsh_margin":0.3}', 'alert', 'NPSH余量0.3m，低于安全阈值0.5m', 'executed', NOW() - INTERVAL 12 HOUR),
(3, 'sess-cog-001', 'SGT800-A02', NOW() - INTERVAL 6 HOUR,
 '{"efficiency_ratio":0.72}', 'recommend', '效率比0.72，低于基线80%', 'pending', NOW() - INTERVAL 6 HOUR),
(2, 'sess-cog-004', 'SGT800-A02', NOW() - INTERVAL 1 HOUR,
 '{"bearing_temp":88.7}', 'alert', '轴承温度88.7°C，超过预警阈值85°C', 'pending', NOW() - INTERVAL 1 HOUR);

-- ============================================================
-- 认知会话（cognition_sessions）
-- 字段: id(varchar64), machine_id, condition_id, cycle_phase, trigger_type(enum),
--        priority(enum), status(enum), safety_score, health_score, efficiency_score,
--        diagnostics_json, grok_explanation, grok_reasoning_steps, total_processing_time_ms,
--        started_at, completed_at
-- ============================================================
INSERT INTO cognition_sessions (id, machine_id, condition_id, trigger_type, priority, status, safety_score, health_score, efficiency_score, diagnostics_json, grok_explanation, grok_reasoning_steps, total_processing_time_ms, started_at, completed_at) VALUES
('sess-cog-001', 'SGT800-A01', 'cp-normal-load', 'anomaly', 'high', 'completed', 0.92, 0.78, 0.85,
 '[{"dimension":"perception","score":0.91,"detail":"振动RMS=6.8mm/s，轴承温度=82°C"},{"dimension":"reasoning","score":0.88,"detail":"轴承早期磨损概率72%"},{"dimension":"fusion","score":0.85,"detail":"DS融合置信度0.87"},{"dimension":"decision","score":0.90,"detail":"建议计划性维护P2"}]',
 '基于频谱分析发现BPFO特征频率显著，结合温度上升趋势和物理模型验证，判断为轴承外圈早期磨损，预计剩余寿命720小时，建议在下次计划停机时更换轴承。',
 3, 5550, NOW() - INTERVAL 4 HOUR, NOW() - INTERVAL 3 HOUR + INTERVAL 47 MINUTE),

('sess-cog-002', 'ZR500-B01', 'cp-compressor-normal', 'scheduled', 'normal', 'completed', 0.95, 0.91, 0.88,
 '[{"dimension":"perception","score":0.94,"detail":"排气温度=158°C，排气压力=8.2bar"},{"dimension":"reasoning","score":0.90,"detail":"运行状态正常，效率轻微下降"},{"dimension":"fusion","score":0.92,"detail":"DS融合置信度0.93"},{"dimension":"decision","score":0.89,"detail":"建议下次维护时清洗中间冷却器"}]',
 '压缩机各项参数在正常范围内，排气温度偏差+3°C属于季节性波动，效率比0.94略低于最优值，建议在下次维护窗口清洗中间冷却器。',
 2, 3200, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR + INTERVAL 52 MINUTE),

('sess-cog-003', 'CR95-C01', 'cp-pump-cavitation-risk', 'anomaly', 'critical', 'completed', 0.75, 0.68, 0.72,
 '[{"dimension":"perception","score":0.82,"detail":"NPSH余量=0.3m，振动RMS=5.2mm/s"},{"dimension":"reasoning","score":0.79,"detail":"气蚀发生概率89%"},{"dimension":"fusion","score":0.71,"detail":"DS融合置信度0.76"},{"dimension":"decision","score":0.65,"detail":"自动降低流量5%"}]',
 '检测到NPSH余量仅0.3m，远低于安全阈值0.5m，气蚀模型确认发生概率89%，已自动执行流量降低5%，NPSH余量恢复至0.65m。',
 3, 2530, NOW() - INTERVAL 1 HOUR, NOW() - INTERVAL 35 MINUTE),

('sess-cog-004', 'SGT800-A02', 'cp-high-load', 'drift', 'normal', 'running', NULL, NULL, NULL,
 '[]', NULL, 0, NULL, NOW() - INTERVAL 15 MINUTE, NULL),

('sess-cog-005', 'SGT800-A01', 'cp-startup', 'manual', 'normal', 'completed', 0.98, 0.96, 0.94,
 '[{"dimension":"perception","score":0.97,"detail":"启动过程正常"},{"dimension":"reasoning","score":0.95,"detail":"启动参数在正常范围内"},{"dimension":"fusion","score":0.96,"detail":"DS融合置信度0.97"},{"dimension":"decision","score":0.94,"detail":"启动完成，进入正常监控"}]',
 '启动过程各项参数符合预期，升速曲线正常，振动在启动阈值范围内，已自动切换至正常监控模式。',
 2, 1820, NOW() - INTERVAL 8 HOUR, NOW() - INTERVAL 7 HOUR + INTERVAL 12 MINUTE);

-- ============================================================
-- Grok 推理链（grok_reasoning_chains）
-- 字段: id, session_id, step_index, tool_name, tool_input(json), tool_output(json),
--        reasoning(text), duration_ms
-- ============================================================
INSERT INTO grok_reasoning_chains (session_id, step_index, tool_name, tool_input, tool_output, reasoning, duration_ms) VALUES
('sess-cog-001', 0, 'sensor_data_query',
 '{"equipment":"SGT800-A01","sensors":["vibration_rms","bearing_temp"],"window":"1h"}',
 '{"vibration_rms":{"mean":6.8,"max":8.2,"trend":"rising"},"bearing_temp":{"mean":82,"max":87,"trend":"rising"}}',
 '传感器数据显示振动和温度均呈上升趋势，需要进一步分析频谱特征', 1250),

('sess-cog-001', 1, 'spectrum_analysis',
 '{"equipment":"SGT800-A01","frequency_range":[0,5000],"resolution":1}',
 '{"dominant_frequencies":[{"freq":142.5,"amplitude":3.2,"label":"BPFO"},{"freq":285,"amplitude":1.8,"label":"2xBPFO"}]}',
 '频谱分析发现BPFO及其谐波成分显著，结合温度上升趋势，判断为轴承外圈早期磨损', 2800),

('sess-cog-001', 2, 'physics_model_check',
 '{"equipment":"SGT800-A01","model":"bearing_degradation","params":{"vibration":6.8,"temp":82,"speed":3000}}',
 '{"degradation_stage":"stage_2","remaining_life_hours":720,"confidence":0.85}',
 '物理模型验证: 当前处于退化第二阶段，预计剩余寿命720小时', 1500),

('sess-cog-003', 0, 'sensor_data_query',
 '{"equipment":"CR95-C01","sensors":["npsh","flow_rate","vibration_rms","noise"],"window":"30m"}',
 '{"npsh_margin":0.3,"flow_rate":85,"vibration_rms":5.2,"noise_level":92}',
 'NPSH余量仅0.3m，远低于安全阈值0.5m，振动和噪声均异常升高', 980),

('sess-cog-003', 1, 'cavitation_model',
 '{"equipment":"CR95-C01","npsh_margin":0.3,"flow_rate":85,"speed":2950}',
 '{"cavitation_probability":0.89,"severity":"moderate","damage_rate":"0.02mm/hour"}',
 '气蚀模型确认: 气蚀发生概率89%，当前侵蚀速率0.02mm/h', 1200),

('sess-cog-003', 2, 'control_action',
 '{"equipment":"CR95-C01","action":"reduce_flow","amount_pct":5}',
 '{"executed":true,"new_flow_rate":80.75,"estimated_npsh_margin":0.65}',
 '已执行流量降低5%，预计NPSH余量恢复至0.65m', 350);

-- ============================================================
-- 知识结晶（knowledge_crystals）
-- 字段: id, pattern(text), confidence, source_session_ids(json),
--        applicable_conditions(json), kg_node_id, version, verification_count, last_verified_at
-- ============================================================
INSERT INTO knowledge_crystals (pattern, confidence, source_session_ids, applicable_conditions, kg_node_id, version, verification_count, last_verified_at) VALUES
('轴承外圈磨损的早期特征: BPFO频率幅值超过基线3倍 + 温度梯度 > 0.5°C/min，可在故障前720小时预警', 0.92,
 '["sess-cog-001","sess-hist-012","sess-hist-045"]', '["cp-normal-load","cp-high-load"]',
 'kg-crystal-001', '1.2.0', 15, NOW() - INTERVAL 2 DAY),

('压缩机阀片断裂前兆: 排气温度偏差 > 8°C + 压力波动标准差 > 0.3bar，提前48小时预警准确率87%', 0.87,
 '["sess-hist-023","sess-hist-067"]', '["cp-compressor-normal"]',
 'kg-crystal-002', '1.0.0', 8, NOW() - INTERVAL 5 DAY),

('泵气蚀发生条件: NPSH余量 < 0.5m 时气蚀概率 > 80%，自动降流5%可有效缓解', 0.94,
 '["sess-cog-003","sess-hist-034","sess-hist-078"]', '["cp-pump-cavitation-risk"]',
 'kg-crystal-003', '2.0.0', 22, NOW() - INTERVAL 1 DAY),

('多设备负载均衡策略: 等余量分配算法比等负载分配节能12%，适用于3台以上并联场景', 0.88,
 '["sess-hist-089","sess-hist-091"]', NULL,
 'kg-crystal-004', '1.1.0', 6, NOW() - INTERVAL 7 DAY),

('启动过程振动阈值应放宽至稳态的2.5倍，避免误报率从23%降至3%', 0.96,
 '["sess-cog-005","sess-hist-102","sess-hist-103","sess-hist-104"]', '["cp-startup"]',
 'kg-crystal-005', '1.0.0', 31, NOW() - INTERVAL 12 HOUR);

-- ============================================================
-- 进化周期（evolution_cycles）
-- 字段: id, cycle_number, started_at, completed_at, status(enum),
--        edge_cases_found, hypotheses_generated, models_evaluated, deployed,
--        accuracy_before, accuracy_after, improvement_percent, knowledge_crystallized, summary
-- ============================================================
INSERT INTO evolution_cycles (cycle_number, started_at, completed_at, status, edge_cases_found, hypotheses_generated, models_evaluated, deployed, accuracy_before, accuracy_after, improvement_percent, knowledge_crystallized, summary) VALUES
(1, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 28 DAY, 'completed', 12, 5, 3, 1, 0.78, 0.83, 6.4, 2,
 '首轮进化: 发现12个边缘案例，主要集中在启动工况下的振动误报，通过调整阈值策略将误报率降低67%'),
(2, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 19 DAY, 'completed', 8, 4, 2, 1, 0.83, 0.86, 3.6, 1,
 '第二轮: 优化了压缩机排气温度预测模型，引入物理约束后预测精度提升3.6%'),
(3, NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 12 DAY, 'completed', 15, 7, 4, 2, 0.86, 0.89, 3.5, 2,
 '第三轮: 发现泵气蚀早期检测的新特征组合，结晶为知识图谱节点，同时优化了DS融合权重'),
(4, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 5 DAY, 'completed', 6, 3, 2, 1, 0.89, 0.91, 2.2, 1,
 '第四轮: 引入多设备关联分析，负载均衡策略节能12%'),
(5, NOW() - INTERVAL 2 DAY, NULL, 'running', 4, 2, 0, 0, 0.91, NULL, NULL, 0,
 '第五轮进行中: 正在分析高负载工况下的传感器漂移问题');

-- ============================================================
-- 采样配置（sampling_configs）
-- 字段: id, profile_id, cycle_phase, base_sampling_rate(int Hz),
--        high_freq_sampling_rate(int Hz), high_freq_trigger(json),
--        retention_policy(enum), compression(enum), enabled
-- ============================================================
INSERT INTO sampling_configs (profile_id, cycle_phase, base_sampling_rate, high_freq_sampling_rate, high_freq_trigger, retention_policy, compression, enabled) VALUES
(1, 'steady_state', 1000, 5000,
 '{"condition":"vibration_rms > 4.5 OR bearing_temp > 75","duration_seconds":60}',
 'features_only', 'delta', 1),
(1, 'startup', 2000, 10000,
 '{"condition":"always","duration_seconds":300}',
 'all', 'none', 1),
(2, 'steady_state', 500, 2000,
 '{"condition":"discharge_temp > 160 OR surge_margin < 0.2","duration_seconds":120}',
 'features_only', 'delta', 1),
(3, 'steady_state', 500, 3000,
 '{"condition":"npsh_margin < 0.5 OR vibration_rms > 4.0","duration_seconds":90}',
 'features_only', 'fft', 1);

-- ============================================================
-- 认知维度结果（cognition_dimension_results）
-- ============================================================
INSERT INTO cognition_dimension_results (session_id, dimension, score, evidence, confidence, processing_time_ms) VALUES
('sess-cog-001', 'perception', 0.91, '["振动RMS=6.8mm/s，高于基线4.2","轴承温度=82°C，上升趋势","频谱BPFO成分显著"]', 0.89, 1250),
('sess-cog-001', 'reasoning', 0.88, '["物理模型: 退化Stage2","剩余寿命预估720h","Grok推理: 轴承外圈磨损概率72%"]', 0.85, 2800),
('sess-cog-001', 'fusion', 0.85, '["DS融合置信度0.87","证据冲突率0.12","多源一致性: 高"]', 0.87, 800),
('sess-cog-001', 'decision', 0.90, '["建议: 计划性维护P2","时间窗口: 30天内","预估成本: ¥15,000"]', 0.90, 700),
('sess-cog-003', 'perception', 0.82, '["NPSH余量=0.3m","振动RMS=5.2mm/s","噪声92dB"]', 0.80, 980),
('sess-cog-003', 'reasoning', 0.79, '["气蚀模型: 概率89%","侵蚀速率0.02mm/h","Grok推理: 建议立即降流"]', 0.78, 1200),
('sess-cog-003', 'fusion', 0.71, '["DS融合置信度0.76","证据冲突率0.18"]', 0.76, 200),
('sess-cog-003', 'decision', 0.65, '["执行: 降流5%","NPSH恢复至0.65m","持续监控"]', 0.70, 150);

SET FOREIGN_KEY_CHECKS = 1;

SELECT '✅ v5.0 Seed 数据导入完成' AS result;
