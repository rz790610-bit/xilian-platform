-- ============================================================
-- 西联智能平台 v5.0 - 深度进化模块种子数据
-- XiLian Platform v5.0 - Deep Evolution Seed Data
-- ============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 设备档案（equipment_profiles）
-- ============================================================
INSERT INTO equipment_profiles (type, manufacturer, model, physical_constraints, failure_modes, world_model_config) VALUES
('rotating_machinery', '西门子', 'SGT-800', 
 '[{"type":"correlation","variables":["vibration_rms","bearing_temp"],"expression":"vibration_rms > 7.1 => bearing_temp > 85","source":"physics"},{"type":"bound","variables":["speed"],"expression":"0 <= speed <= 13000","source":"physics"}]',
 '[{"name":"轴承磨损","symptoms":["振动升高","温度异常","噪声增大"],"physicsFormula":"f_bpfo = n/60 * Z/2 * (1 - d/D * cos(α))","severity":"major"},{"name":"转子不平衡","symptoms":["1X振动升高","相位漂移"],"physicsFormula":"F = m * r * ω²","severity":"minor"}]',
 '{"stateVectorDim":12,"predictionHorizonHours":168,"updateIntervalMs":5000}'),

('compressor', '阿特拉斯科普柯', 'ZR 500', 
 '[{"type":"causation","variables":["discharge_pressure","intake_temp"],"expression":"discharge_pressure = intake_pressure * (T2/T1)^(k/(k-1))","source":"physics"},{"type":"bound","variables":["discharge_temp"],"expression":"discharge_temp <= 180","source":"physics"}]',
 '[{"name":"阀片断裂","symptoms":["排气温度骤升","压力波动","异响"],"physicsFormula":"σ = F/A > σ_fatigue","severity":"critical"},{"name":"密封泄漏","symptoms":["排气压力下降","能耗升高"],"physicsFormula":"Q_leak = C * A * sqrt(2*ΔP/ρ)","severity":"major"}]',
 '{"stateVectorDim":8,"predictionHorizonHours":72,"updateIntervalMs":3000}'),

('pump', '格兰富', 'CR 95-4', 
 '[{"type":"correlation","variables":["flow_rate","head"],"expression":"H = H0 - k*Q²","source":"physics"},{"type":"bound","variables":["npsh"],"expression":"npsh_available > npsh_required + 0.5","source":"physics"}]',
 '[{"name":"气蚀","symptoms":["噪声增大","振动升高","流量波动","效率下降"],"physicsFormula":"NPSH_r = (P_atm - P_vapor)/(ρ*g) - H_loss","severity":"major"},{"name":"机械密封失效","symptoms":["泄漏","温度升高"],"physicsFormula":"PV_value = P_seal * V_sliding","severity":"critical"}]',
 '{"stateVectorDim":10,"predictionHorizonHours":120,"updateIntervalMs":5000}');

-- ============================================================
-- 工况配置（condition_profiles）
-- ============================================================
INSERT INTO condition_profiles (id, name, description, equipment_type, feature_set, detection_config, is_active) VALUES
('cp-normal-load', '正常负载工况', '设备在额定负载范围内稳定运行', 'rotating_machinery',
 '["vibration_rms","bearing_temp","speed","load_ratio"]',
 '{"method":"statistical","windowSize":300,"threshold":{"vibration_rms":4.5,"bearing_temp":75}}',
 TRUE),
('cp-high-load', '高负载工况', '设备在80%以上额定负载运行', 'rotating_machinery',
 '["vibration_rms","bearing_temp","speed","load_ratio","power_consumption"]',
 '{"method":"statistical","windowSize":180,"threshold":{"load_ratio":0.8,"bearing_temp":90}}',
 TRUE),
('cp-startup', '启动工况', '设备从停机状态启动至稳态运行', 'rotating_machinery',
 '["speed","vibration_rms","bearing_temp","current"]',
 '{"method":"transient","rampDetection":true,"settlingTime":120}',
 TRUE),
('cp-compressor-normal', '压缩机正常运行', '压缩机在设计工况点附近运行', 'compressor',
 '["discharge_pressure","intake_temp","discharge_temp","flow_rate","power"]',
 '{"method":"statistical","windowSize":240,"threshold":{"discharge_temp":160,"surge_margin":0.15}}',
 TRUE),
('cp-pump-cavitation-risk', '泵气蚀风险工况', '泵在低NPSH余量下运行', 'pump',
 '["npsh_available","flow_rate","vibration_rms","noise_level"]',
 '{"method":"physics_based","formula":"npsh_margin = npsh_available - npsh_required","alertThreshold":0.5}',
 TRUE);

-- ============================================================
-- 特征定义（feature_definitions）
-- ============================================================
INSERT INTO feature_definitions (name, description, domain, version, input_dimensions, compute_logic, applicable_equipment, output_unit, output_range, drift_detection_config) VALUES
('振动RMS特征', '时域振动均方根值，反映整体振动能量', 'vibration', '2.1.0',
 '["acceleration_x","acceleration_y","acceleration_z"]',
 'rms = sqrt(mean(x² + y² + z²))',
 '["rotating_machinery","compressor","pump"]',
 'mm/s', '{"min":0,"max":50}',
 '{"method":"psi","windowSize":1000,"threshold":0.15}'),
('轴承温度梯度', '轴承温度变化率，用于早期异常检测', 'thermal', '1.3.0',
 '["bearing_temp_de","bearing_temp_nde"]',
 'gradient = diff(temp) / dt, smoothed with EMA(alpha=0.1)',
 '["rotating_machinery"]',
 '°C/min', '{"min":-5,"max":10}',
 '{"method":"ks_test","windowSize":500,"threshold":0.05}'),
('排气温度偏差', '实际排气温度与理论值的偏差', 'thermal', '1.0.0',
 '["discharge_temp","intake_temp","discharge_pressure","intake_pressure"]',
 'deviation = T_actual - T_theoretical, where T_theoretical = T1 * (P2/P1)^((k-1)/k)',
 '["compressor"]',
 '°C', '{"min":-20,"max":50}',
 '{"method":"cusum","threshold":5.0}'),
('泵效率指标', '实际泵效率与设计效率的比值', 'performance', '1.2.0',
 '["flow_rate","head","power_consumption"]',
 'eta = (rho * g * Q * H) / (P * 1000), ratio = eta / eta_design',
 '["pump"]',
 '%', '{"min":0,"max":100}',
 '{"method":"psi","windowSize":2000,"threshold":0.1}'),
('频谱包络特征', '振动频谱包络的关键频率成分', 'vibration', '3.0.0',
 '["acceleration_x","speed"]',
 'envelope = hilbert_transform(bandpass(signal, [500, 5000])), extract peaks at BPFO/BPFI/BSF/FTF',
 '["rotating_machinery"]',
 'g', '{"min":0,"max":10}',
 '{"method":"spectral_divergence","threshold":0.2}');

-- ============================================================
-- 护栏规则（guardrail_rules）
-- ============================================================
INSERT INTO guardrail_rules (name, type, description, `condition`, `action`, severity, enabled, cooldown_ms) VALUES
('振动超限保护', 'safety', '振动RMS超过安全阈值时触发紧急停机',
 '{"field":"vibration_rms","operator":"gt","threshold":11.2,"physicalBasis":"ISO 10816-3 Zone D"}',
 '{"action":"emergency_stop","params":{"notify":["ops_team","safety_officer"],"log_level":"critical"}}',
 'critical', TRUE, 60000),

('轴承温度预警', 'health', '轴承温度超过预警阈值时发出告警',
 '{"field":"bearing_temp","operator":"gt","threshold":85,"physicalBasis":"Bearing manufacturer spec: max continuous 95°C"}',
 '{"action":"alert","params":{"notify":["maintenance_team"],"escalate_after_ms":300000}}',
 'high', TRUE, 120000),

('效率衰减监测', 'efficiency', '设备效率低于基线80%时触发优化建议',
 '{"field":"efficiency_ratio","operator":"lt","threshold":0.8,"physicalBasis":"Design efficiency baseline"}',
 '{"action":"recommend","params":{"suggestion":"检查密封、清洗换热器、校准传感器","notify":["process_engineer"]}}',
 'medium', TRUE, 3600000),

('排气温度超限', 'safety', '压缩机排气温度超过安全上限',
 '{"field":"discharge_temp","operator":"gt","threshold":175,"physicalBasis":"API 618 discharge temperature limit"}',
 '{"action":"load_reduction","params":{"target_load":0.7,"notify":["ops_team"]}}',
 'critical', TRUE, 30000),

('气蚀风险预警', 'health', 'NPSH余量不足时预警',
 '{"field":"npsh_margin","operator":"lt","threshold":0.5,"physicalBasis":"Hydraulic Institute Standards"}',
 '{"action":"alert","params":{"notify":["pump_operator"],"auto_adjust":"reduce_flow_5pct"}}',
 'high', TRUE, 180000),

('负载不平衡检测', 'efficiency', '多台并联设备负载分配不均匀',
 '{"operator":"and","children":[{"field":"load_imbalance","operator":"gt","threshold":0.15},{"field":"parallel_count","operator":"gt","threshold":1}]}',
 '{"action":"rebalance","params":{"algorithm":"equal_margin","notify":["control_engineer"]}}',
 'low', TRUE, 600000),

('传感器漂移检测', 'health', '传感器读数与冗余传感器偏差过大',
 '{"field":"sensor_deviation","operator":"gt","threshold":3.0,"physicalBasis":"3-sigma rule for redundant sensors"}',
 '{"action":"alert","params":{"notify":["instrument_engineer"],"mark_sensor":"suspect"}}',
 'medium', TRUE, 900000),

('模型预测偏差', 'efficiency', '世界模型预测值与实际值偏差超过阈值',
 '{"field":"prediction_error_pct","operator":"gt","threshold":15,"physicalBasis":"Model accuracy requirement"}',
 '{"action":"trigger_retrain","params":{"notify":["data_scientist"],"queue":"model_retrain"}}',
 'low', TRUE, 7200000);

-- ============================================================
-- 护栏违规记录（guardrail_violations）— 示例历史数据
-- ============================================================
INSERT INTO guardrail_violations (rule_id, session_id, equipment_id, severity, actual_value, threshold_value, action_taken, acknowledged, created_at) VALUES
(1, 'sess-demo-001', 'SGT800-A01', 'critical', 12.3, 11.2, '{"action":"emergency_stop","executed":true}', TRUE, NOW() - INTERVAL 3 DAY),
(2, 'sess-demo-002', 'SGT800-A01', 'high', 91.5, 85.0, '{"action":"alert","sent_to":"maintenance_team"}', TRUE, NOW() - INTERVAL 2 DAY),
(4, 'sess-demo-003', 'ZR500-B01', 'critical', 178.2, 175.0, '{"action":"load_reduction","target":0.7}', FALSE, NOW() - INTERVAL 1 DAY),
(5, 'sess-demo-004', 'CR95-C01', 'high', 0.3, 0.5, '{"action":"alert","auto_adjust":"reduce_flow_5pct"}', FALSE, NOW() - INTERVAL 12 HOUR),
(3, 'sess-demo-005', 'SGT800-A02', 'medium', 0.72, 0.8, '{"action":"recommend","suggestion":"检查密封"}', TRUE, NOW() - INTERVAL 6 HOUR),
(7, 'sess-demo-006', 'SGT800-A01', 'medium', 4.2, 3.0, '{"action":"alert","mark_sensor":"suspect"}', FALSE, NOW() - INTERVAL 3 HOUR),
(2, 'sess-demo-007', 'SGT800-A02', 'high', 88.7, 85.0, '{"action":"alert","sent_to":"maintenance_team"}', FALSE, NOW() - INTERVAL 1 HOUR),
(6, 'sess-demo-008', 'CR95-C01', 'low', 0.22, 0.15, '{"action":"rebalance","algorithm":"equal_margin"}', FALSE, NOW() - INTERVAL 30 MINUTE);

-- ============================================================
-- 认知会话（cognition_sessions）— 示例数据
-- ============================================================
INSERT INTO cognition_sessions (id, machine_id, condition_id, trigger_type, priority, status, safety_score, health_score, efficiency_score, diagnostics_json, started_at, completed_at) VALUES
('sess-cog-001', 'SGT800-A01', 'cp-normal-load', 'anomaly', 'high', 'completed', 0.92, 0.78, 0.85,
 '[{"dimension":"perception","score":0.91,"detail":"振动RMS=6.8mm/s，轴承温度=82°C"},{"dimension":"reasoning","score":0.88,"detail":"Grok推理: 轴承早期磨损概率72%"},{"dimension":"fusion","score":0.85,"detail":"DS融合置信度0.87，冲突率0.12"},{"dimension":"decision","score":0.90,"detail":"建议: 计划性维护，优先级P2"}]',
 NOW() - INTERVAL 4 HOUR, NOW() - INTERVAL 3 HOUR + INTERVAL 47 MINUTE),

('sess-cog-002', 'ZR500-B01', 'cp-compressor-normal', 'scheduled', 'normal', 'completed', 0.95, 0.91, 0.88,
 '[{"dimension":"perception","score":0.94,"detail":"排气温度=158°C，排气压力=8.2bar"},{"dimension":"reasoning","score":0.90,"detail":"Grok推理: 运行状态正常，效率轻微下降"},{"dimension":"fusion","score":0.92,"detail":"DS融合置信度0.93，无冲突"},{"dimension":"decision","score":0.89,"detail":"建议: 下次维护时清洗中间冷却器"}]',
 NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR + INTERVAL 52 MINUTE),

('sess-cog-003', 'CR95-C01', 'cp-pump-cavitation-risk', 'anomaly', 'critical', 'completed', 0.75, 0.68, 0.72,
 '[{"dimension":"perception","score":0.82,"detail":"NPSH余量=0.3m，振动RMS=5.2mm/s，噪声异常"},{"dimension":"reasoning","score":0.79,"detail":"Grok推理: 气蚀发生概率89%，建议立即降低流量"},{"dimension":"fusion","score":0.71,"detail":"DS融合置信度0.76，证据冲突率0.18"},{"dimension":"decision","score":0.65,"detail":"执行: 自动降低流量5%，通知泵操作员"}]',
 NOW() - INTERVAL 1 HOUR, NOW() - INTERVAL 35 MINUTE),

('sess-cog-004', 'SGT800-A02', 'cp-high-load', 'drift', 'normal', 'running', NULL, NULL, NULL,
 '[]',
 NOW() - INTERVAL 15 MINUTE, NULL),

('sess-cog-005', 'SGT800-A01', 'cp-startup', 'manual', 'normal', 'completed', 0.98, 0.96, 0.94,
 '[{"dimension":"perception","score":0.97,"detail":"启动过程正常，升速曲线符合预期"},{"dimension":"reasoning","score":0.95,"detail":"Grok推理: 启动参数在正常范围内"},{"dimension":"fusion","score":0.96,"detail":"DS融合置信度0.97"},{"dimension":"decision","score":0.94,"detail":"启动完成，进入正常监控模式"}]',
 NOW() - INTERVAL 8 HOUR, NOW() - INTERVAL 7 HOUR + INTERVAL 12 MINUTE);

-- ============================================================
-- Grok 推理链（grok_reasoning_chains）— 示例数据
-- ============================================================
INSERT INTO grok_reasoning_chains (session_id, step_index, tool_name, tool_input, tool_output, reasoning, duration_ms) VALUES
('sess-cog-001', 0, 'sensor_data_query', '{"equipment":"SGT800-A01","sensors":["vibration_rms","bearing_temp"],"window":"1h"}', '{"vibration_rms":{"mean":6.8,"max":8.2,"trend":"rising"},"bearing_temp":{"mean":82,"max":87,"trend":"rising"}}', '传感器数据显示振动和温度均呈上升趋势，需要进一步分析频谱特征', 1250),
('sess-cog-001', 1, 'spectrum_analysis', '{"equipment":"SGT800-A01","frequency_range":[0,5000],"resolution":1}', '{"dominant_frequencies":[{"freq":142.5,"amplitude":3.2,"label":"BPFO"},{"freq":285,"amplitude":1.8,"label":"2xBPFO"}],"diagnosis":"外圈故障特征频率明显"}', '频谱分析发现BPFO及其谐波成分显著，结合温度上升趋势，判断为轴承外圈早期磨损', 2800),
('sess-cog-001', 2, 'physics_model_check', '{"equipment":"SGT800-A01","model":"bearing_degradation","params":{"vibration":6.8,"temp":82,"speed":3000}}', '{"degradation_stage":"stage_2","remaining_life_hours":720,"confidence":0.85}', '物理模型验证: 当前处于退化第二阶段，预计剩余寿命720小时', 1500),
('sess-cog-001', 3, 'maintenance_recommendation', '{"equipment":"SGT800-A01","fault":"bearing_outer_race_wear","severity":"major","remaining_life_hours":720}', '{"recommendation":"计划性维护","priority":"P2","suggested_window":"30天内","parts":["SKF 6316-2RS","润滑脂Shell Gadus S3 V220C 2"],"estimated_downtime_hours":8}', '综合诊断结论: 轴承外圈早期磨损，建议30天内安排计划性维护', 800),

('sess-cog-003', 0, 'sensor_data_query', '{"equipment":"CR95-C01","sensors":["npsh","flow_rate","vibration_rms","noise"],"window":"30m"}', '{"npsh_margin":0.3,"flow_rate":85,"vibration_rms":5.2,"noise_level":92}', 'NPSH余量仅0.3m，远低于安全阈值0.5m，振动和噪声均异常升高', 980),
('sess-cog-003', 1, 'cavitation_model', '{"equipment":"CR95-C01","npsh_margin":0.3,"flow_rate":85,"speed":2950}', '{"cavitation_probability":0.89,"severity":"moderate","damage_rate":"0.02mm/hour"}', '气蚀模型确认: 气蚀发生概率89%，当前侵蚀速率0.02mm/h', 1200),
('sess-cog-003', 2, 'control_action', '{"equipment":"CR95-C01","action":"reduce_flow","amount_pct":5}', '{"executed":true,"new_flow_rate":80.75,"estimated_npsh_margin":0.65}', '已执行流量降低5%，预计NPSH余量恢复至0.65m', 350);

-- ============================================================
-- 知识结晶（knowledge_crystals）
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
 '["sess-hist-089","sess-hist-091"]', '["cp-normal-load"]',
 'kg-crystal-004', '1.1.0', 6, NOW() - INTERVAL 7 DAY),

('启动过程振动阈值应放宽至稳态的2.5倍，避免误报率从23%降至3%', 0.96,
 '["sess-cog-005","sess-hist-102","sess-hist-103","sess-hist-104"]', '["cp-startup"]',
 'kg-crystal-005', '1.0.0', 31, NOW() - INTERVAL 12 HOUR);

-- ============================================================
-- 进化周期（evolution_cycles）
-- ============================================================
INSERT INTO evolution_cycles (cycle_number, started_at, completed_at, status, edge_cases_found, hypotheses_generated, models_evaluated, deployed, accuracy_before, accuracy_after) VALUES
(1, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 28 DAY, 'completed', 12, 5, 3, 1, 0.78, 0.83),
(2, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 19 DAY, 'completed', 8, 4, 2, 1, 0.83, 0.86),
(3, NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 12 DAY, 'completed', 15, 7, 4, 2, 0.86, 0.89),
(4, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 5 DAY, 'completed', 6, 3, 2, 1, 0.89, 0.91),
(5, NOW() - INTERVAL 2 DAY, NULL, 'running', 4, 2, 0, 0, 0.91, NULL);

-- ============================================================
-- 采样配置（sampling_configs）
-- ============================================================
INSERT INTO sampling_configs (equipment_id, sensor_type, base_rate_hz, current_rate_hz, strategy, anomaly_multiplier, last_adjusted_at) VALUES
('SGT800-A01', 'vibration', 1000, 2000, 'adaptive', 2.0, NOW() - INTERVAL 4 HOUR),
('SGT800-A01', 'temperature', 10, 10, 'fixed', 1.0, NOW() - INTERVAL 1 DAY),
('SGT800-A02', 'vibration', 1000, 1000, 'adaptive', 2.0, NOW() - INTERVAL 1 DAY),
('ZR500-B01', 'pressure', 100, 100, 'adaptive', 3.0, NOW() - INTERVAL 2 HOUR),
('ZR500-B01', 'temperature', 10, 10, 'fixed', 1.0, NOW() - INTERVAL 1 DAY),
('CR95-C01', 'vibration', 500, 1500, 'adaptive', 3.0, NOW() - INTERVAL 1 HOUR),
('CR95-C01', 'flow', 50, 50, 'fixed', 1.0, NOW() - INTERVAL 1 DAY);

SET FOREIGN_KEY_CHECKS = 1;
