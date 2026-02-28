-- ============================================================
-- RTG-001 双悬臂轨道吊 — MySQL 种子数据
-- 设备编码: PORT.RTG.ZPMC.DCRG-45t.SN20260001
-- ============================================================
-- 本文件与 Neo4j Cypher (rtg-001-cypher.ts) 保持编码一致

-- ============================================================
-- §1 设备树节点 (asset_nodes)
-- ============================================================

-- L1: 设备
INSERT INTO asset_nodes (node_id, code, name, level, node_type, parent_node_id, root_node_id, path, serial_number, location, department, status, attributes, created_at)
VALUES (
  'RTG-001', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', '1号双悬臂轨道吊',
  1, 'device', NULL, 'RTG-001', '/RTG-001',
  'SN20260001', '堆场A区', '机械维保部', 'active',
  '{"manufacturer":"ZPMC","model":"DCRG-45t","liftCapacity_t":45,"span_m":23.47,"cantilever":"double","gauge_m":16}',
  NOW()
);

-- L2: 机构
INSERT INTO asset_nodes (node_id, code, name, level, node_type, parent_node_id, root_node_id, path, status, created_at) VALUES
('RTG-001-HOIST',     'HOIST',     '起升机构',     2, 'mechanism', 'RTG-001', 'RTG-001', '/RTG-001/HOIST',     'active', NOW()),
('RTG-001-TROLLEY',   'TROLLEY',   '小车运行机构', 2, 'mechanism', 'RTG-001', 'RTG-001', '/RTG-001/TROLLEY',   'active', NOW()),
('RTG-001-GANTRY',    'GANTRY',    '大车运行机构', 2, 'mechanism', 'RTG-001', 'RTG-001', '/RTG-001/GANTRY',    'active', NOW()),
('RTG-001-STRUCTURE', 'STRUCTURE', '钢结构',       2, 'structure', 'RTG-001', 'RTG-001', '/RTG-001/STRUCTURE', 'active', NOW());

-- L3: 部件
INSERT INTO asset_nodes (node_id, code, name, level, node_type, parent_node_id, root_node_id, path, status, attributes, created_at) VALUES
-- 起升
('RTG-001-HOIST-MOT', 'HOIST.MOTOR', '起升电机', 3, 'motor', 'RTG-001-HOIST', 'RTG-001', '/RTG-001/HOIST/MOTOR', 'active',
 '{"power_kw":200,"rpm":1480,"voltage_v":380,"poles":4,"insulation":"F"}', NOW()),
('RTG-001-HOIST-GBX', 'HOIST.GBX', '起升减速箱', 3, 'gearbox', 'RTG-001-HOIST', 'RTG-001', '/RTG-001/HOIST/GBX', 'active',
 '{"ratio":31.5,"stages":3,"type":"helical","lubrication":"splash"}', NOW()),
-- 小车
('RTG-001-TROLLEY-MOT', 'TROLLEY.MOTOR', '小车电机', 3, 'motor', 'RTG-001-TROLLEY', 'RTG-001', '/RTG-001/TROLLEY/MOTOR', 'active',
 '{"power_kw":30,"rpm":1460,"voltage_v":380,"poles":4,"insulation":"F"}', NOW()),
('RTG-001-TROLLEY-GBX', 'TROLLEY.GBX', '小车减速箱', 3, 'gearbox', 'RTG-001-TROLLEY', 'RTG-001', '/RTG-001/TROLLEY/GBX', 'active',
 '{"ratio":25,"stages":2,"type":"helical","lubrication":"splash"}', NOW()),
-- 大车
('RTG-001-GANTRY-MOTA', 'GANTRY.MOTOR_A', '大车电机A（海侧）', 3, 'motor', 'RTG-001-GANTRY', 'RTG-001', '/RTG-001/GANTRY/MOTOR_A', 'active',
 '{"power_kw":22,"rpm":1460,"voltage_v":380,"poles":4,"side":"sea"}', NOW()),
('RTG-001-GANTRY-MOTB', 'GANTRY.MOTOR_B', '大车电机B（陆侧）', 3, 'motor', 'RTG-001-GANTRY', 'RTG-001', '/RTG-001/GANTRY/MOTOR_B', 'active',
 '{"power_kw":22,"rpm":1460,"voltage_v":380,"poles":4,"side":"land"}', NOW()),
-- 钢结构
('RTG-001-STR-FBEAM', 'STRUCTURE.FBEAM', '前大梁', 3, 'beam',       'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/FBEAM', 'active', '{"material":"Q345B","section":"box","length_m":23.47}', NOW()),
('RTG-001-STR-RBEAM', 'STRUCTURE.RBEAM', '后大梁', 3, 'beam',       'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/RBEAM', 'active', '{"material":"Q345B","section":"box","length_m":23.47}', NOW()),
('RTG-001-STR-SLEG',  'STRUCTURE.SLEG',  '海侧门腿', 3, 'leg',     'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/SLEG',  'active', '{"material":"Q345B","height_m":18.5,"side":"sea"}',  NOW()),
('RTG-001-STR-LLEG',  'STRUCTURE.LLEG',  '陆侧门腿', 3, 'leg',     'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/LLEG',  'active', '{"material":"Q345B","height_m":18.5,"side":"land"}', NOW()),
('RTG-001-STR-FCANT', 'STRUCTURE.FCANT', '前悬臂',   3, 'cantilever', 'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/FCANT', 'active', '{"material":"Q345B","length_m":8.5}', NOW()),
('RTG-001-STR-RCANT', 'STRUCTURE.RCANT', '后悬臂',   3, 'cantilever', 'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/RCANT', 'active', '{"material":"Q345B","length_m":8.5}', NOW()),
('RTG-001-STR-JUNCT', 'STRUCTURE.JUNCT', '大梁-门腿连接节点', 3, 'junction', 'RTG-001-STRUCTURE', 'RTG-001', '/RTG-001/STRUCTURE/JUNCT', 'active', '{"material":"Q345B","weldType":"full_penetration"}', NOW());

-- ============================================================
-- §2 测点 (asset_measurement_points) — 16 振温 + 15 应力
-- ============================================================

INSERT INTO asset_measurement_points (mp_id, node_id, device_code, template_code, name, position, measurement_type, warning_threshold, critical_threshold, created_at) VALUES
-- 起升机构振温
('VT-01', 'RTG-001-HOIST-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',    '起升电机驱动端振动',      '驱动端水平',       'vibration',    7.1,  11.2, NOW()),
('VT-02', 'RTG-001-HOIST-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',    '起升电机非驱动端振动',    '非驱动端水平',     'vibration',    7.1,  11.2, NOW()),
('VT-03', 'RTG-001-HOIST-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE',  '起升电机绕组温度',        '定子绕组',         'temperature',  75,   90,   NOW()),
('VT-04', 'RTG-001-HOIST-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',    '起升减速箱高速轴振动',    '输入端（高速轴）', 'vibration',    7.1,  11.2, NOW()),
('VT-05', 'RTG-001-HOIST-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',    '起升减速箱低速轴振动',    '输出端（低速轴）', 'vibration',    7.1,  11.2, NOW()),
('VT-06', 'RTG-001-HOIST-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE',  '起升减速箱油温',          '油池',             'temperature',  70,   85,   NOW()),
-- 小车机构振温
('VT-07', 'RTG-001-TROLLEY-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '小车电机驱动端振动',      '驱动端水平',       'vibration',    7.1,  11.2, NOW()),
('VT-08', 'RTG-001-TROLLEY-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '小车电机非驱动端振动',    '非驱动端水平',     'vibration',    7.1,  11.2, NOW()),
('VT-09', 'RTG-001-TROLLEY-MOT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE','小车电机绕组温度',        '定子绕组',         'temperature',  75,   90,   NOW()),
('VT-10', 'RTG-001-TROLLEY-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '小车减速箱高速轴振动',    '输入端（高速轴）', 'vibration',    7.1,  11.2, NOW()),
('VT-11', 'RTG-001-TROLLEY-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '小车减速箱低速轴振动',    '输出端（低速轴）', 'vibration',    7.1,  11.2, NOW()),
('VT-12', 'RTG-001-TROLLEY-GBX', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE','小车减速箱油温',          '油池',             'temperature',  70,   85,   NOW()),
-- 大车机构振温
('VT-13', 'RTG-001-GANTRY-MOTA', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '大车电机A驱动端振动',    '驱动端水平',       'vibration',    7.1,  11.2, NOW()),
('VT-14', 'RTG-001-GANTRY-MOTA', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE','大车电机A绕组温度',      '定子绕组',         'temperature',  75,   90,   NOW()),
('VT-15', 'RTG-001-GANTRY-MOTB', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_VIBRATION',  '大车电机B驱动端振动',    '驱动端水平',       'vibration',    7.1,  11.2, NOW()),
('VT-16', 'RTG-001-GANTRY-MOTB', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'TPL_MP_TEMPERATURE','大车电机B绕组温度',      '定子绕组',         'temperature',  75,   90,   NOW()),
-- 钢结构应力
('ST-01', 'RTG-001-STR-FBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '前大梁跨中上翼缘',    '跨中-上翼缘',       'stress', 120, 160, NOW()),
('ST-02', 'RTG-001-STR-FBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '前大梁跨中下翼缘',    '跨中-下翼缘',       'stress', 120, 160, NOW()),
('ST-03', 'RTG-001-STR-FBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '前大梁1/4跨',         '1/4跨-腹板',        'stress', 100, 140, NOW()),
('ST-04', 'RTG-001-STR-RBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '后大梁跨中上翼缘',    '跨中-上翼缘',       'stress', 120, 160, NOW()),
('ST-05', 'RTG-001-STR-RBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '后大梁跨中下翼缘',    '跨中-下翼缘',       'stress', 120, 160, NOW()),
('ST-06', 'RTG-001-STR-RBEAM', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '后大梁1/4跨',         '1/4跨-腹板',        'stress', 100, 140, NOW()),
('ST-07', 'RTG-001-STR-SLEG',  'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '海侧门腿上端',        '上端连接处',        'stress', 100, 140, NOW()),
('ST-08', 'RTG-001-STR-SLEG',  'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '海侧门腿下端',        '下端根部',          'stress', 100, 140, NOW()),
('ST-09', 'RTG-001-STR-LLEG',  'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '陆侧门腿上端',        '上端连接处',        'stress', 100, 140, NOW()),
('ST-10', 'RTG-001-STR-LLEG',  'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '陆侧门腿下端',        '下端根部',          'stress', 100, 140, NOW()),
('ST-11', 'RTG-001-STR-FCANT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '前悬臂根部',          '根部连接焊缝',      'stress',  80, 120, NOW()),
('ST-12', 'RTG-001-STR-FCANT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '前悬臂中部',          '中部上翼缘',        'stress',  80, 120, NOW()),
('ST-13', 'RTG-001-STR-RCANT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '后悬臂根部',          '根部连接焊缝',      'stress',  80, 120, NOW()),
('ST-14', 'RTG-001-STR-RCANT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '后悬臂中部',          '中部上翼缘',        'stress',  80, 120, NOW()),
('ST-15', 'RTG-001-STR-JUNCT', 'PORT.RTG.ZPMC.DCRG-45t.SN20260001', NULL, '大梁与门腿连接节点',  '节点板焊缝',        'stress',  90, 130, NOW());

-- ============================================================
-- §3 传感器 (asset_sensors) — 31 个
-- ============================================================

INSERT INTO asset_sensors (device_code, sensor_id, mp_id, name, channel, sample_rate, physical_quantity, unit, manufacturer, model, status, created_at) VALUES
-- 1#采集器 (VT-01 ~ VT-08)
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-01', 'VT-01', '起升电机DE振动传感器',     'DAQ-VT-01:CH1', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-02', 'VT-02', '起升电机NDE振动传感器',    'DAQ-VT-01:CH2', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-03', 'VT-03', '起升电机温度传感器',       'DAQ-VT-01:CH3', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-04', 'VT-04', '起升减速箱HSS振动传感器',  'DAQ-VT-01:CH4', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-05', 'VT-05', '起升减速箱LSS振动传感器',  'DAQ-VT-01:CH5', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-06', 'VT-06', '起升减速箱油温传感器',     'DAQ-VT-01:CH6', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-07', 'VT-07', '小车电机DE振动传感器',     'DAQ-VT-01:CH7', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-08', 'VT-08', '小车电机NDE振动传感器',    'DAQ-VT-01:CH8', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
-- 2#采集器 (VT-09 ~ VT-16)
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-09', 'VT-09', '小车电机温度传感器',       'DAQ-VT-02:CH1', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-10', 'VT-10', '小车减速箱HSS振动传感器',  'DAQ-VT-02:CH2', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-11', 'VT-11', '小车减速箱LSS振动传感器',  'DAQ-VT-02:CH3', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-12', 'VT-12', '小车减速箱油温传感器',     'DAQ-VT-02:CH4', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-13', 'VT-13', '大车电机A振动传感器',      'DAQ-VT-02:CH5', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-14', 'VT-14', '大车电机A温度传感器',      'DAQ-VT-02:CH6', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-15', 'VT-15', '大车电机B振动传感器',      'DAQ-VT-02:CH7', 12800, '加速度', 'mm/s', '昆仑海岸', 'KL-ACC-100', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-VT-16', 'VT-16', '大车电机B温度传感器',      'DAQ-VT-02:CH8', 1,     '温度',   '°C',   '昆仑海岸', 'PT100',      'active', NOW()),
-- 应力采集器 (ST-01 ~ ST-15)
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-01', 'ST-01', '前大梁跨中上翼缘应变片',   'DAQ-ST-01:CH1',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-02', 'ST-02', '前大梁跨中下翼缘应变片',   'DAQ-ST-01:CH2',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-03', 'ST-03', '前大梁1/4跨应变片',        'DAQ-ST-01:CH3',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-04', 'ST-04', '后大梁跨中上翼缘应变片',   'DAQ-ST-01:CH4',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-05', 'ST-05', '后大梁跨中下翼缘应变片',   'DAQ-ST-01:CH5',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-06', 'ST-06', '后大梁1/4跨应变片',        'DAQ-ST-01:CH6',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-07', 'ST-07', '海侧门腿上端应变片',       'DAQ-ST-01:CH7',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-08', 'ST-08', '海侧门腿下端应变片',       'DAQ-ST-01:CH8',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-09', 'ST-09', '陆侧门腿上端应变片',       'DAQ-ST-01:CH9',  100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-10', 'ST-10', '陆侧门腿下端应变片',       'DAQ-ST-01:CH10', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-11', 'ST-11', '前悬臂根部应变片',         'DAQ-ST-01:CH11', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-12', 'ST-12', '前悬臂中部应变片',         'DAQ-ST-01:CH12', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-13', 'ST-13', '后悬臂根部应变片',         'DAQ-ST-01:CH13', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-14', 'ST-14', '后悬臂中部应变片',         'DAQ-ST-01:CH14', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW()),
('PORT.RTG.ZPMC.DCRG-45t.SN20260001', 'SN-ST-15', 'ST-15', '大梁-门腿节点应变片',      'DAQ-ST-01:CH15', 100, '应变', 'MPa', '中航电测', 'BX120-3AA', 'active', NOW());
