-- ============================================================
-- 西联平台 v1.5 数据库模块 - 种子数据
-- ============================================================

USE portai_nexus;

-- ===========================================================
-- 1. 编码规则种子数据
-- ===========================================================
INSERT INTO base_code_rules (rule_code, name, segments, current_sequences, description, is_active, created_by) VALUES
('RULE_DEVICE', '设备编码规则', '{"segments": [{"type": "prefix", "value": "Mgj"}, {"type": "separator", "value": "-"}, {"type": "category", "source": "device_type", "mapping": {"磨辊机": "MG", "旋转窑": "XY", "选粉机": "XF", "球磨机": "QM"}}, {"type": "sequence", "length": 3, "start": 1}]}', '{"MG": 5, "XY": 3, "XF": 2, "QM": 4}', '设备编码：前缀-类型缩写+流水号', 1, 'system'),
('RULE_SENSOR', '传感器编码规则', '{"segments": [{"type": "prefix", "value": "SEN"}, {"type": "separator", "value": "-"}, {"type": "device_ref"}, {"type": "separator", "value": "-"}, {"type": "sequence", "length": 4, "start": 1}]}', '{}', '传感器编码：SEN-设备编码-流水号', 1, 'system'),
('RULE_MP', '测点编码规则', '{"segments": [{"type": "prefix", "value": "MP"}, {"type": "separator", "value": "-"}, {"type": "node_ref"}, {"type": "separator", "value": "-"}, {"type": "measurement_type_abbr"}, {"type": "sequence", "length": 2, "start": 1}]}', '{}', '测点编码：MP-节点编码-测量类型缩写+流水号', 1, 'system'),
('RULE_SLICE', '切片编码规则', '{"segments": [{"type": "prefix", "value": "slice"}, {"type": "separator", "value": "_"}, {"type": "date", "format": "YYYYMMDD"}, {"type": "separator", "value": "_"}, {"type": "time", "format": "HHmmss"}, {"type": "separator", "value": "_"}, {"type": "sequence", "length": 3, "start": 1}]}', '{}', '切片编码：slice_日期_时间_流水号', 1, 'system');

-- ===========================================================
-- 2. 节点类型模板种子数据
-- ===========================================================
INSERT INTO base_node_templates (code, name, level, node_type, code_rule, code_prefix, icon, is_system, children, attributes, measurement_points, description, created_by) VALUES
('TPL_DEVICE_ROLLER_MILL', '磨辊机', 1, 'device', 'RULE_DEVICE', 'Mgj', 'factory', 1,
  '[{"template": "TPL_MECH_MAIN_DRIVE", "required": true}, {"template": "TPL_MECH_GRINDING_ROLLER", "required": true, "count": 4}, {"template": "TPL_MECH_SEPARATOR", "required": false}]',
  '{"rated_power": {"type": "number", "unit": "kW"}, "rated_speed": {"type": "number", "unit": "rpm"}, "max_feed_size": {"type": "number", "unit": "mm"}}',
  NULL, '磨辊机设备模板，包含主传动、磨辊、选粉机等子机构', 'system'),
('TPL_MECH_MAIN_DRIVE', '主传动机构', 2, 'mechanism', NULL, NULL, 'settings', 1,
  '[{"template": "TPL_COMP_MOTOR"}, {"template": "TPL_COMP_REDUCER"}, {"template": "TPL_COMP_COUPLING"}]',
  '{"drive_type": {"type": "enum", "options": ["direct", "belt", "gear"]}}',
  NULL, '主传动机构模板', 'system'),
('TPL_MECH_GRINDING_ROLLER', '磨辊机构', 2, 'mechanism', NULL, NULL, 'rotate_right', 1,
  '[{"template": "TPL_COMP_ROLLER_BEARING"}, {"template": "TPL_COMP_ROLLER_SHAFT"}]',
  '{"roller_diameter": {"type": "number", "unit": "mm"}, "roller_width": {"type": "number", "unit": "mm"}}',
  NULL, '磨辊机构模板', 'system'),
('TPL_COMP_MOTOR', '电机', 3, 'component', NULL, NULL, 'bolt', 1, NULL,
  '{"motor_type": {"type": "enum", "options": ["AC", "DC", "servo"]}, "rated_power": {"type": "number", "unit": "kW"}, "rated_voltage": {"type": "number", "unit": "V"}}',
  '[{"template": "TPL_MP_VIBRATION"}, {"template": "TPL_MP_TEMPERATURE"}, {"template": "TPL_MP_CURRENT"}]',
  '电机组件模板', 'system'),
('TPL_COMP_REDUCER', '减速机', 3, 'component', NULL, NULL, 'settings', 1, NULL,
  '{"gear_ratio": {"type": "number"}, "input_speed": {"type": "number", "unit": "rpm"}}',
  '[{"template": "TPL_MP_VIBRATION"}, {"template": "TPL_MP_TEMPERATURE"}, {"template": "TPL_MP_OIL_PRESSURE"}]',
  '减速机组件模板', 'system'),
('TPL_COMP_ROLLER_BEARING', '磨辊轴承', 3, 'component', NULL, NULL, 'radio_button_checked', 1, NULL,
  '{"bearing_type": {"type": "enum", "options": ["ball", "roller", "tapered"]}, "inner_diameter": {"type": "number", "unit": "mm"}}',
  '[{"template": "TPL_MP_VIBRATION"}, {"template": "TPL_MP_TEMPERATURE"}]',
  '磨辊轴承组件模板', 'system');

-- ===========================================================
-- 3. 测点类型模板种子数据
-- ===========================================================
INSERT INTO base_mp_templates (code, name, measurement_type, physical_quantity, default_unit, default_sample_rate, default_warning, default_critical, sensor_config, description, created_by) VALUES
('TPL_MP_VIBRATION', '振动测点', 'vibration', '加速度', 'mm/s', 25600, 7.1, 11.2,
  '{"sensor_type": "accelerometer", "sensitivity": 100, "frequency_range": [0.5, 10000]}',
  '振动加速度测点，默认采样率 25.6kHz', 'system'),
('TPL_MP_TEMPERATURE', '温度测点', 'temperature', '温度', '°C', 1, 70, 85,
  '{"sensor_type": "thermocouple", "type": "K"}',
  '温度测点，默认采样率 1Hz', 'system'),
('TPL_MP_CURRENT', '电流测点', 'current', '电流', 'A', 1000, NULL, NULL,
  '{"sensor_type": "current_transformer", "ratio": 1000}',
  '电流测点，默认采样率 1kHz', 'system'),
('TPL_MP_OIL_PRESSURE', '油压测点', 'pressure', '压力', 'MPa', 10, 0.8, 0.5,
  '{"sensor_type": "pressure_transducer", "range": [0, 2.5]}',
  '油压测点，默认采样率 10Hz', 'system'),
('TPL_MP_SPEED', '转速测点', 'speed', '转速', 'rpm', 1, NULL, NULL,
  '{"sensor_type": "proximity_probe"}',
  '转速测点，默认采样率 1Hz', 'system');

-- ===========================================================
-- 4. 资产节点种子数据（设备树示例）
-- ===========================================================
INSERT INTO asset_nodes (node_id, code, name, level, node_type, parent_node_id, root_node_id, template_code, status, path, level_codes, depth, serial_number, location, department, install_date, is_active, created_by) VALUES
-- L1: 设备
('nd-001', 'Mgj-XC001', '1号磨辊机', 1, 'device', NULL, 'nd-001', 'TPL_DEVICE_ROLLER_MILL', 'running', '/nd-001/', 'Mgj-XC001', 1, 'SN-2024-MG001', '一车间A区', '生产一部', '2024-03-15', 1, 'system'),
('nd-002', 'Mgj-XC002', '2号磨辊机', 1, 'device', NULL, 'nd-002', 'TPL_DEVICE_ROLLER_MILL', 'running', '/nd-002/', 'Mgj-XC002', 1, 'SN-2024-MG002', '一车间B区', '生产一部', '2024-06-20', 1, 'system'),
('nd-003', 'Mgj-XC003', '3号磨辊机', 1, 'device', NULL, 'nd-003', 'TPL_DEVICE_ROLLER_MILL', 'maintenance', '/nd-003/', 'Mgj-XC003', 1, 'SN-2024-MG003', '二车间A区', '生产二部', '2024-09-10', 1, 'system'),
-- L2: 机构（1号磨辊机下）
('nd-001-01', 'Mgj-XC001-MD', '主传动机构', 2, 'mechanism', 'nd-001', 'nd-001', 'TPL_MECH_MAIN_DRIVE', 'running', '/nd-001/nd-001-01/', 'Mgj-XC001.MD', 2, NULL, NULL, NULL, NULL, 1, 'system'),
('nd-001-02', 'Mgj-XC001-GR1', '1号磨辊机构', 2, 'mechanism', 'nd-001', 'nd-001', 'TPL_MECH_GRINDING_ROLLER', 'running', '/nd-001/nd-001-02/', 'Mgj-XC001.GR1', 2, NULL, NULL, NULL, NULL, 1, 'system'),
('nd-001-03', 'Mgj-XC001-GR2', '2号磨辊机构', 2, 'mechanism', 'nd-001', 'nd-001', 'TPL_MECH_GRINDING_ROLLER', 'running', '/nd-001/nd-001-03/', 'Mgj-XC001.GR2', 2, NULL, NULL, NULL, NULL, 1, 'system'),
-- L3: 组件（主传动下）
('nd-001-01-01', 'Mgj-XC001-MD-MOT', '主电机', 3, 'component', 'nd-001-01', 'nd-001', 'TPL_COMP_MOTOR', 'running', '/nd-001/nd-001-01/nd-001-01-01/', 'Mgj-XC001.MD.MOT', 3, 'MOT-2024-001', NULL, NULL, '2024-03-15', 1, 'system'),
('nd-001-01-02', 'Mgj-XC001-MD-RED', '主减速机', 3, 'component', 'nd-001-01', 'nd-001', 'TPL_COMP_REDUCER', 'running', '/nd-001/nd-001-01/nd-001-01-02/', 'Mgj-XC001.MD.RED', 3, 'RED-2024-001', NULL, NULL, '2024-03-15', 1, 'system'),
-- L3: 组件（1号磨辊下）
('nd-001-02-01', 'Mgj-XC001-GR1-BRG', '1号磨辊轴承', 3, 'component', 'nd-001-02', 'nd-001', 'TPL_COMP_ROLLER_BEARING', 'running', '/nd-001/nd-001-02/nd-001-02-01/', 'Mgj-XC001.GR1.BRG', 3, 'BRG-2024-001', NULL, NULL, '2024-03-15', 1, 'system');

-- ===========================================================
-- 5. 测点实例种子数据
-- ===========================================================
INSERT INTO asset_measurement_points (mp_id, node_id, device_code, template_code, name, position, measurement_type, warning_threshold, critical_threshold, created_by) VALUES
-- 主电机测点
('mp-001-01-01-vib', 'nd-001-01-01', 'Mgj-XC001', 'TPL_MP_VIBRATION', '主电机驱动端振动', '驱动端水平', 'vibration', 7.1, 11.2, 'system'),
('mp-001-01-01-tmp', 'nd-001-01-01', 'Mgj-XC001', 'TPL_MP_TEMPERATURE', '主电机驱动端温度', '驱动端轴承座', 'temperature', 70, 85, 'system'),
('mp-001-01-01-cur', 'nd-001-01-01', 'Mgj-XC001', 'TPL_MP_CURRENT', '主电机电流', '电流互感器', 'current', NULL, NULL, 'system'),
-- 主减速机测点
('mp-001-01-02-vib', 'nd-001-01-02', 'Mgj-XC001', 'TPL_MP_VIBRATION', '减速机输入端振动', '输入端水平', 'vibration', 7.1, 11.2, 'system'),
('mp-001-01-02-tmp', 'nd-001-01-02', 'Mgj-XC001', 'TPL_MP_TEMPERATURE', '减速机油温', '油池', 'temperature', 65, 80, 'system'),
('mp-001-01-02-oil', 'nd-001-01-02', 'Mgj-XC001', 'TPL_MP_OIL_PRESSURE', '减速机油压', '润滑系统', 'pressure', 0.8, 0.5, 'system'),
-- 1号磨辊轴承测点
('mp-001-02-01-vib', 'nd-001-02-01', 'Mgj-XC001', 'TPL_MP_VIBRATION', '1号磨辊轴承振动', '径向水平', 'vibration', 7.1, 11.2, 'system'),
('mp-001-02-01-tmp', 'nd-001-02-01', 'Mgj-XC001', 'TPL_MP_TEMPERATURE', '1号磨辊轴承温度', '轴承座', 'temperature', 75, 90, 'system');

-- ===========================================================
-- 6. 传感器实例种子数据
-- ===========================================================
INSERT INTO asset_sensors (device_code, sensor_id, mp_id, name, channel, sample_rate, physical_quantity, unit, warning_threshold, critical_threshold, status, manufacturer, model, serial_number, install_date, calibration_date, created_by) VALUES
('Mgj-XC001', '1903000114', 'mp-001-01-01-vib', '主电机驱动端加速度传感器', 'CH1', 25600, '加速度', 'mm/s', 7.1, 11.2, 'active', '昆仑海岸', 'KL-ACC-100', 'KL-2024-0114', '2024-03-15', '2025-12-01', 'system'),
('Mgj-XC001', '1903000115', 'mp-001-01-01-tmp', '主电机驱动端温度传感器', 'CH2', 1, '温度', '°C', 70, 85, 'active', '昆仑海岸', 'KL-TMP-200', 'KL-2024-0115', '2024-03-15', '2025-12-01', 'system'),
('Mgj-XC001', '1903000116', 'mp-001-01-01-cur', '主电机电流互感器', 'CH3', 1000, '电流', 'A', NULL, NULL, 'active', '安科瑞', 'AKR-CT-500', 'AKR-2024-0116', '2024-03-15', NULL, 'system'),
('Mgj-XC001', '1903000117', 'mp-001-01-02-vib', '减速机输入端加速度传感器', 'CH4', 25600, '加速度', 'mm/s', 7.1, 11.2, 'active', '昆仑海岸', 'KL-ACC-100', 'KL-2024-0117', '2024-03-15', '2025-12-01', 'system'),
('Mgj-XC001', '1903000118', 'mp-001-01-02-tmp', '减速机油温传感器', 'CH5', 1, '温度', '°C', 65, 80, 'active', '昆仑海岸', 'KL-TMP-200', 'KL-2024-0118', '2024-03-15', '2025-12-01', 'system'),
('Mgj-XC001', '1903000119', 'mp-001-02-01-vib', '1号磨辊轴承加速度传感器', 'CH6', 25600, '加速度', 'mm/s', 7.1, 11.2, 'active', '昆仑海岸', 'KL-ACC-100', 'KL-2024-0119', '2024-03-15', '2025-12-01', 'system');

-- ===========================================================
-- 7. 标注维度种子数据
-- ===========================================================
INSERT INTO base_label_dimensions (code, name, dim_type, is_required, sort_order, allow_sources, apply_to, description, created_by) VALUES
('work_condition', '工况', 'enum', 1, 1, '["auto","manual","signal"]', '["all"]', '设备运行工况标注', 'system'),
('quality_level', '数据质量', 'enum', 1, 2, '["auto","manual"]', '["all"]', '数据质量等级标注', 'system'),
('fault_type', '故障类型', 'enum', 0, 3, '["auto","manual","ai"]', '["vibration"]', '故障类型标注', 'system'),
('load_rate', '负载率', 'numeric', 0, 4, '["auto","signal"]', '["all"]', '设备负载率 0-100%', 'system'),
('is_transient', '是否瞬态', 'boolean', 0, 5, '["auto","manual"]', '["vibration"]', '是否为瞬态过程', 'system');

-- ===========================================================
-- 8. 标注值选项种子数据
-- ===========================================================
INSERT INTO base_label_options (dimension_code, code, label, parent_code, color, is_normal, sample_priority, sort_order, created_by) VALUES
-- 工况选项
('work_condition', 'wc_idle', '空载运行', NULL, '#4CAF50', 1, 3, 1, 'system'),
('work_condition', 'wc_normal', '正常负载', NULL, '#2196F3', 1, 5, 2, 'system'),
('work_condition', 'wc_heavy', '重载运行', NULL, '#FF9800', 1, 7, 3, 'system'),
('work_condition', 'wc_startup', '启动过程', NULL, '#9C27B0', 1, 8, 4, 'system'),
('work_condition', 'wc_shutdown', '停机过程', NULL, '#607D8B', 1, 6, 5, 'system'),
('work_condition', 'wc_abnormal', '异常工况', NULL, '#F44336', 0, 10, 6, 'system'),
-- 质量等级选项
('quality_level', 'ql_excellent', '优秀', NULL, '#4CAF50', 1, 2, 1, 'system'),
('quality_level', 'ql_good', '良好', NULL, '#8BC34A', 1, 3, 2, 'system'),
('quality_level', 'ql_fair', '一般', NULL, '#FF9800', 1, 5, 3, 'system'),
('quality_level', 'ql_poor', '较差', NULL, '#F44336', 0, 8, 4, 'system'),
('quality_level', 'ql_invalid', '无效', NULL, '#9E9E9E', 0, 10, 5, 'system'),
-- 故障类型选项
('fault_type', 'ft_none', '无故障', NULL, '#4CAF50', 1, 1, 1, 'system'),
('fault_type', 'ft_mech', '机械故障', NULL, '#F44336', 0, 9, 2, 'system'),
('fault_type', 'ft_mech_bearing', '轴承故障', 'ft_mech', '#E53935', 0, 10, 1, 'system'),
('fault_type', 'ft_mech_gear', '齿轮故障', 'ft_mech', '#D32F2F', 0, 10, 2, 'system'),
('fault_type', 'ft_mech_imbalance', '不平衡', 'ft_mech', '#C62828', 0, 9, 3, 'system'),
('fault_type', 'ft_mech_misalign', '不对中', 'ft_mech', '#B71C1C', 0, 9, 4, 'system'),
('fault_type', 'ft_elec', '电气故障', NULL, '#FF5722', 0, 9, 3, 'system'),
('fault_type', 'ft_elec_insulation', '绝缘故障', 'ft_elec', '#E64A19', 0, 10, 1, 'system');

-- ===========================================================
-- 9. 切片规则种子数据
-- ===========================================================
INSERT INTO base_slice_rules (rule_id, rule_version, name, device_type, trigger_type, trigger_config, min_duration_sec, max_duration_sec, merge_gap_sec, auto_labels, priority, is_active, is_current, created_by) VALUES
('rule-slice-wc-change', 1, '工况变化切片', NULL, 'condition_change',
  '{"monitor_field": "work_condition", "debounce_sec": 3}',
  5, 3600, 10, '{"work_condition": "from_signal"}', 10, 1, 1, 'system'),
('rule-slice-time-10min', 1, '定时10分钟切片', NULL, 'time_interval',
  '{"interval_sec": 600}',
  600, 600, 0, NULL, 5, 1, 1, 'system'),
('rule-slice-alarm', 1, '告警触发切片', NULL, 'threshold',
  '{"condition": "any_alarm", "pre_buffer_sec": 30, "post_buffer_sec": 60}',
  10, 300, 5, '{"quality_level": "ql_poor"}', 15, 1, 1, 'system');

-- ===========================================================
-- 10. 数据切片种子数据
-- ===========================================================
INSERT INTO data_slices (slice_id, device_code, node_id, work_condition_code, quality_code, fault_type_code, load_rate, start_time, end_time, duration_ms, status, label_status, label_count_auto, label_count_manual, labels, sensors, quality_score, applied_rule_id, applied_rule_version, created_by) VALUES
('slice_20260115_080000_001', 'Mgj-XC001', 'nd-001', 'wc_normal', 'ql_excellent', 'ft_none', 75.5, '2026-01-15 08:00:00.000', '2026-01-15 08:10:00.000', 600000, 'completed', 'auto_only', 3, 0, '{"work_condition": {"value": "wc_normal", "source": "signal"}, "quality_level": {"value": "ql_excellent", "source": "auto"}, "fault_type": {"value": "ft_none", "source": "auto"}}', '["1903000114", "1903000117", "1903000119"]', 95.2, 'rule-slice-time-10min', 1, 'system'),
('slice_20260115_081000_001', 'Mgj-XC001', 'nd-001', 'wc_heavy', 'ql_good', 'ft_none', 92.3, '2026-01-15 08:10:00.000', '2026-01-15 08:20:00.000', 600000, 'completed', 'auto_only', 3, 0, '{"work_condition": {"value": "wc_heavy", "source": "signal"}, "quality_level": {"value": "ql_good", "source": "auto"}, "fault_type": {"value": "ft_none", "source": "auto"}}', '["1903000114", "1903000117", "1903000119"]', 88.7, 'rule-slice-wc-change', 1, 'system'),
('slice_20260115_082000_001', 'Mgj-XC001', 'nd-001', 'wc_normal', 'ql_fair', 'ft_mech_bearing', 68.1, '2026-01-15 08:20:00.000', '2026-01-15 08:25:00.000', 300000, 'completed', 'manual_verified', 2, 1, '{"work_condition": {"value": "wc_normal", "source": "signal"}, "quality_level": {"value": "ql_fair", "source": "auto"}, "fault_type": {"value": "ft_mech_bearing", "source": "manual"}}', '["1903000114", "1903000117"]', 72.5, 'rule-slice-alarm', 1, 'system'),
('slice_20260115_090000_001', 'Mgj-XC001', 'nd-001', 'wc_normal', 'ql_excellent', 'ft_none', 78.0, '2026-01-15 09:00:00.000', NULL, NULL, 'recording', 'auto_only', 2, 0, '{"work_condition": {"value": "wc_normal", "source": "signal"}, "quality_level": {"value": "ql_excellent", "source": "auto"}}', '["1903000114", "1903000117", "1903000119"]', NULL, 'rule-slice-time-10min', 1, 'system');

-- ===========================================================
-- 11. 清洗规则种子数据
-- ===========================================================
INSERT INTO base_clean_rules (rule_id, rule_version, name, device_type, sensor_type, measurement_type, rule_type, detect_config, action_type, action_config, priority, is_active, is_current, description, created_by) VALUES
('clean-rule-spike', 1, '尖峰检测', NULL, NULL, 'vibration', 'spike',
  '{"method": "zscore", "threshold": 5, "window_size": 100}',
  'interpolate', '{"method": "linear"}', 10, 1, 1, '检测并修复振动信号中的异常尖峰', 'system'),
('clean-rule-dropout', 1, '数据丢失检测', NULL, NULL, NULL, 'dropout',
  '{"max_gap_ms": 100, "min_consecutive": 3}',
  'flag', '{"flag": "data_gap"}', 8, 1, 1, '检测连续数据丢失并标记', 'system'),
('clean-rule-range', 1, '范围检查', NULL, NULL, 'temperature', 'range',
  '{"min": -40, "max": 200}',
  'clip', '{"min": -40, "max": 200}', 5, 1, 1, '温度数据范围检查', 'system'),
('clean-rule-flatline', 1, '平线检测', NULL, NULL, 'vibration', 'flatline',
  '{"min_duration_ms": 1000, "tolerance": 0.001}',
  'flag', '{"flag": "flatline_suspect"}', 7, 1, 1, '检测振动信号长时间不变化', 'system');

-- ===========================================================
-- 12. 数据字典种子数据
-- ===========================================================
INSERT INTO base_dict_categories (code, name, description, is_system, sort_order, created_by) VALUES
('device_type', '设备类型', '设备类型分类字典', 1, 1, 'system'),
('device_status', '设备状态', '设备运行状态字典', 1, 2, 'system'),
('sensor_type', '传感器类型', '传感器类型分类字典', 1, 3, 'system'),
('measurement_type', '测量类型', '物理量测量类型字典', 1, 4, 'system'),
('node_type', '节点类型', '设备树节点类型字典', 1, 5, 'system'),
('fault_severity', '故障严重度', '故障严重程度等级字典', 1, 6, 'system'),
('department', '部门', '组织部门字典', 0, 7, 'system');

INSERT INTO base_dict_items (category_code, code, label, value, color, sort_order, created_by) VALUES
-- 设备类型
('device_type', 'roller_mill', '磨辊机', 'roller_mill', '#1976D2', 1, 'system'),
('device_type', 'rotary_kiln', '旋转窑', 'rotary_kiln', '#388E3C', 2, 'system'),
('device_type', 'separator', '选粉机', 'separator', '#F57C00', 3, 'system'),
('device_type', 'ball_mill', '球磨机', 'ball_mill', '#7B1FA2', 4, 'system'),
('device_type', 'fan', '风机', 'fan', '#00796B', 5, 'system'),
-- 设备状态
('device_status', 'running', '运行中', 'running', '#4CAF50', 1, 'system'),
('device_status', 'idle', '待机', 'idle', '#2196F3', 2, 'system'),
('device_status', 'maintenance', '维护中', 'maintenance', '#FF9800', 3, 'system'),
('device_status', 'fault', '故障', 'fault', '#F44336', 4, 'system'),
('device_status', 'offline', '离线', 'offline', '#9E9E9E', 5, 'system'),
-- 传感器类型
('sensor_type', 'accelerometer', '加速度传感器', 'accelerometer', '#1565C0', 1, 'system'),
('sensor_type', 'thermocouple', '热电偶', 'thermocouple', '#C62828', 2, 'system'),
('sensor_type', 'current_transformer', '电流互感器', 'current_transformer', '#AD1457', 3, 'system'),
('sensor_type', 'pressure_transducer', '压力变送器', 'pressure_transducer', '#6A1B9A', 4, 'system'),
('sensor_type', 'proximity_probe', '接近探头', 'proximity_probe', '#283593', 5, 'system'),
-- 测量类型
('measurement_type', 'vibration', '振动', 'vibration', '#1976D2', 1, 'system'),
('measurement_type', 'temperature', '温度', 'temperature', '#D32F2F', 2, 'system'),
('measurement_type', 'current', '电流', 'current', '#7B1FA2', 3, 'system'),
('measurement_type', 'pressure', '压力', 'pressure', '#00796B', 4, 'system'),
('measurement_type', 'speed', '转速', 'speed', '#F57C00', 5, 'system'),
-- 节点类型
('node_type', 'device', '设备', 'device', '#1976D2', 1, 'system'),
('node_type', 'mechanism', '机构', 'mechanism', '#388E3C', 2, 'system'),
('node_type', 'component', '部件', 'component', '#F57C00', 3, 'system'),
('node_type', 'assembly', '组件', 'assembly', '#7B1FA2', 4, 'system'),
('node_type', 'part', '零件', 'part', '#00796B', 5, 'system'),
-- 故障严重度
('fault_severity', 'info', '提示', 'info', '#2196F3', 1, 'system'),
('fault_severity', 'warning', '预警', 'warning', '#FF9800', 2, 'system'),
('fault_severity', 'critical', '报警', 'critical', '#F44336', 3, 'system'),
('fault_severity', 'emergency', '紧急', 'emergency', '#B71C1C', 4, 'system');

-- ===========================================================
-- 13. 质量报告种子数据
-- ===========================================================
INSERT INTO data_quality_reports (report_type, report_date, device_code, sensor_id, total_records, valid_records, completeness, accuracy, quality_score, metrics, prev_quality_score, score_change) VALUES
('daily', '2026-01-14', 'Mgj-XC001', '1903000114', 2211840, 2189721, 98.5, 99.2, 95.8, '{"spike_count": 12, "dropout_count": 3, "flatline_count": 0, "noise_ratio": 0.008}', 94.2, 1.6),
('daily', '2026-01-14', 'Mgj-XC001', '1903000117', 2211840, 2200000, 99.1, 99.5, 97.3, '{"spike_count": 5, "dropout_count": 1, "flatline_count": 0, "noise_ratio": 0.005}', 96.8, 0.5),
('daily', '2026-01-14', 'Mgj-XC001', '1903000119', 2211840, 2150000, 96.8, 98.7, 91.2, '{"spike_count": 28, "dropout_count": 8, "flatline_count": 2, "noise_ratio": 0.015}', 93.5, -2.3),
('weekly', '2026-01-13', 'Mgj-XC001', NULL, 15482880, 15200000, 98.1, 99.1, 94.8, '{"avg_daily_score": 94.8, "min_daily_score": 91.2, "max_daily_score": 97.3}', 93.5, 1.3);
