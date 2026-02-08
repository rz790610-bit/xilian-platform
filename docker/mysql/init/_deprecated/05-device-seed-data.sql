-- ============================================================
-- 设备管理模块种子数据
-- 包含：设备、传感器、告警、维护记录、KPI 等初始数据
-- ============================================================

USE portai_nexus;

-- ============================================================
-- 1. 设备数据 (devices)
-- ============================================================
INSERT INTO devices (deviceId, name, `type`, model, manufacturer, serialNumber, location, department, `status`, lastHeartbeat, installDate, warrantyExpiry, metadata) VALUES
('DEV-AGV-001', 'AGV搬运车-A01', 'agv', 'AGV-3000X', '海康机器人', 'HK-AGV-20240101', '仓库A区-通道1', '物流部', 'online', NOW(), '2024-06-15 00:00:00', '2027-06-15 00:00:00', '{"firmware":"v3.2.1","ipAddress":"192.168.1.101","macAddress":"AA:BB:CC:DD:01:01","protocol":"MQTT","tags":["AGV","仓库A","自动化"]}'),
('DEV-AGV-002', 'AGV搬运车-A02', 'agv', 'AGV-3000X', '海康机器人', 'HK-AGV-20240102', '仓库A区-通道2', '物流部', 'online', NOW(), '2024-06-15 00:00:00', '2027-06-15 00:00:00', '{"firmware":"v3.2.1","ipAddress":"192.168.1.102","macAddress":"AA:BB:CC:DD:01:02","protocol":"MQTT","tags":["AGV","仓库A","自动化"]}'),
('DEV-RTG-001', '轮胎吊-R01', 'rtg', 'RTG-5500', '振华重工', 'ZH-RTG-20230601', '堆场B区-01号位', '装卸部', 'online', NOW(), '2023-06-01 00:00:00', '2028-06-01 00:00:00', '{"firmware":"v2.8.0","ipAddress":"192.168.2.201","protocol":"OPC-UA","tags":["RTG","堆场B","重型设备"]}'),
('DEV-RTG-002', '轮胎吊-R02', 'rtg', 'RTG-5500', '振华重工', 'ZH-RTG-20230602', '堆场B区-02号位', '装卸部', 'maintenance', DATE_SUB(NOW(), INTERVAL 2 HOUR), '2023-06-01 00:00:00', '2028-06-01 00:00:00', '{"firmware":"v2.7.5","ipAddress":"192.168.2.202","protocol":"OPC-UA","tags":["RTG","堆场B","重型设备","维护中"]}'),
('DEV-QC-001', '岸桥-Q01', 'qc', 'QC-8800', '振华重工', 'ZH-QC-20220301', '码头前沿-1号泊位', '装卸部', 'online', NOW(), '2022-03-01 00:00:00', '2027-03-01 00:00:00', '{"firmware":"v4.1.0","ipAddress":"192.168.3.101","protocol":"OPC-UA","tags":["岸桥","码头","核心设备"]}'),
('DEV-QC-002', '岸桥-Q02', 'qc', 'QC-8800', '振华重工', 'ZH-QC-20220302', '码头前沿-2号泊位', '装卸部', 'error', DATE_SUB(NOW(), INTERVAL 30 MINUTE), '2022-03-01 00:00:00', '2027-03-01 00:00:00', '{"firmware":"v4.0.8","ipAddress":"192.168.3.102","protocol":"OPC-UA","tags":["岸桥","码头","核心设备","故障"]}'),
('DEV-CONV-001', '传送带-C01', 'conveyor', 'CB-2000', '大福自动化', 'DF-CB-20240301', '分拣中心-主线', '物流部', 'online', NOW(), '2024-03-01 00:00:00', '2027-03-01 00:00:00', '{"firmware":"v1.5.0","ipAddress":"192.168.4.101","protocol":"Modbus","tags":["传送带","分拣中心"]}'),
('DEV-PUMP-001', '液压泵-P01', 'pump', 'HP-500', '力士乐', 'RL-HP-20230901', '动力站-1号机房', '设备部', 'online', NOW(), '2023-09-01 00:00:00', '2026-09-01 00:00:00', '{"firmware":"v2.0.3","ipAddress":"192.168.5.101","protocol":"Modbus","tags":["液压泵","动力站"]}'),
('DEV-MOTOR-001', '驱动电机-M01', 'motor', 'SM-750', 'ABB', 'ABB-SM-20240101', '堆场B区-RTG-R01', '设备部', 'online', NOW(), '2024-01-01 00:00:00', '2029-01-01 00:00:00', '{"firmware":"v3.0.0","ipAddress":"192.168.6.101","protocol":"Profinet","tags":["电机","堆场B","RTG配套"]}'),
('DEV-GW-001', '边缘网关-G01', 'gateway', 'EG-100', '华为', 'HW-EG-20240601', '机房A-机柜01', 'IT部', 'online', NOW(), '2024-06-01 00:00:00', '2027-06-01 00:00:00', '{"firmware":"v5.1.2","ipAddress":"192.168.0.1","macAddress":"AA:BB:CC:DD:00:01","protocol":"MQTT","tags":["网关","机房A","边缘计算"]}'),
('DEV-MOTOR-002', '驱动电机-M02', 'motor', 'SM-750', 'ABB', 'ABB-SM-20240102', '堆场B区-RTG-R02', '设备部', 'offline', DATE_SUB(NOW(), INTERVAL 4 HOUR), '2024-01-01 00:00:00', '2029-01-01 00:00:00', '{"firmware":"v3.0.0","ipAddress":"192.168.6.102","protocol":"Profinet","tags":["电机","堆场B","RTG配套"]}'),
('DEV-ASC-001', '自动化堆垛机-S01', 'asc', 'ASC-4000', '三一重工', 'SY-ASC-20230801', '自动化堆场C区-01', '装卸部', 'online', NOW(), '2023-08-01 00:00:00', '2028-08-01 00:00:00', '{"firmware":"v2.5.0","ipAddress":"192.168.7.101","protocol":"OPC-UA","tags":["堆垛机","堆场C","自动化"]}')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ============================================================
-- 2. 传感器数据 (sensors)
-- ============================================================
INSERT INTO sensors (sensorId, deviceId, name, `type`, unit, minValue, maxValue, warningThreshold, criticalThreshold, samplingRate, `status`, lastValue, lastReadingAt, metadata) VALUES
-- AGV-001 传感器
('SEN-AGV001-VIB', 'DEV-AGV-001', 'AGV-A01 振动传感器', 'vibration', 'mm/s', 0, 100, 60, 80, 500, 'active', '12.5', NOW(), '{"position":"底盘中心","accuracy":0.1}'),
('SEN-AGV001-TEMP', 'DEV-AGV-001', 'AGV-A01 电机温度', 'temperature', '°C', -10, 150, 85, 100, 1000, 'active', '62.3', NOW(), '{"position":"驱动电机","accuracy":0.5}'),
('SEN-AGV001-CUR', 'DEV-AGV-001', 'AGV-A01 驱动电流', 'current', 'A', 0, 200, 150, 180, 500, 'active', '45.8', NOW(), '{"position":"主驱动","accuracy":0.01}'),
-- RTG-001 传感器
('SEN-RTG001-VIB', 'DEV-RTG-001', 'RTG-R01 起升振动', 'vibration', 'mm/s', 0, 200, 120, 160, 250, 'active', '28.7', NOW(), '{"position":"起升机构","accuracy":0.1}'),
('SEN-RTG001-TEMP', 'DEV-RTG-001', 'RTG-R01 液压油温', 'temperature', '°C', 0, 120, 75, 90, 2000, 'active', '58.1', NOW(), '{"position":"液压系统","accuracy":0.5}'),
('SEN-RTG001-PRES', 'DEV-RTG-001', 'RTG-R01 液压压力', 'pressure', 'MPa', 0, 35, 28, 32, 500, 'active', '22.5', NOW(), '{"position":"液压主回路","accuracy":0.01}'),
('SEN-RTG001-SPD', 'DEV-RTG-001', 'RTG-R01 行走速度', 'speed', 'km/h', 0, 30, 25, 28, 1000, 'active', '8.2', NOW(), '{"position":"行走机构","accuracy":0.1}'),
-- QC-001 传感器
('SEN-QC001-VIB', 'DEV-QC-001', '岸桥-Q01 大梁振动', 'vibration', 'mm/s', 0, 300, 180, 240, 250, 'active', '35.2', NOW(), '{"position":"大梁中段","accuracy":0.1}'),
('SEN-QC001-TEMP', 'DEV-QC-001', '岸桥-Q01 电机温度', 'temperature', '°C', 0, 180, 100, 130, 1000, 'active', '72.8', NOW(), '{"position":"起升电机","accuracy":0.5}'),
('SEN-QC001-CUR', 'DEV-QC-001', '岸桥-Q01 起升电流', 'current', 'A', 0, 500, 380, 450, 500, 'active', '185.3', NOW(), '{"position":"起升驱动","accuracy":0.01}'),
-- QC-002 传感器（故障设备）
('SEN-QC002-VIB', 'DEV-QC-002', '岸桥-Q02 大梁振动', 'vibration', 'mm/s', 0, 300, 180, 240, 250, 'error', '265.8', DATE_SUB(NOW(), INTERVAL 30 MINUTE), '{"position":"大梁中段","accuracy":0.1}'),
('SEN-QC002-TEMP', 'DEV-QC-002', '岸桥-Q02 电机温度', 'temperature', '°C', 0, 180, 100, 130, 1000, 'active', '142.5', DATE_SUB(NOW(), INTERVAL 30 MINUTE), '{"position":"起升电机","accuracy":0.5}'),
-- PUMP-001 传感器
('SEN-PUMP001-PRES', 'DEV-PUMP-001', '液压泵-P01 出口压力', 'pressure', 'MPa', 0, 40, 32, 36, 500, 'active', '25.3', NOW(), '{"position":"出口管路","accuracy":0.01}'),
('SEN-PUMP001-FLOW', 'DEV-PUMP-001', '液压泵-P01 流量', 'flow', 'L/min', 0, 500, 400, 450, 1000, 'active', '280.5', NOW(), '{"position":"出口管路","accuracy":0.1}'),
('SEN-PUMP001-TEMP', 'DEV-PUMP-001', '液压泵-P01 油温', 'temperature', '°C', 0, 100, 70, 85, 2000, 'active', '55.2', NOW(), '{"position":"油箱","accuracy":0.5}'),
-- MOTOR-001 传感器
('SEN-MOTOR001-VIB', 'DEV-MOTOR-001', '电机-M01 振动', 'vibration', 'mm/s', 0, 100, 60, 80, 500, 'active', '8.3', NOW(), '{"position":"轴承端","accuracy":0.1}'),
('SEN-MOTOR001-TEMP', 'DEV-MOTOR-001', '电机-M01 绕组温度', 'temperature', '°C', 0, 200, 120, 150, 1000, 'active', '88.5', NOW(), '{"position":"绕组","accuracy":0.5}'),
('SEN-MOTOR001-CUR', 'DEV-MOTOR-001', '电机-M01 电流', 'current', 'A', 0, 300, 240, 270, 500, 'active', '125.8', NOW(), '{"position":"主回路","accuracy":0.01}')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ============================================================
-- 3. 设备告警数据 (device_alerts)
-- ============================================================
INSERT INTO device_alerts (alertId, deviceId, sensorId, alertType, title, message, severity, `status`, triggerValue, thresholdValue, acknowledgedBy, acknowledgedAt, resolvedBy, resolvedAt, resolution, createdAt) VALUES
('ALT-001', 'DEV-QC-002', 'SEN-QC002-VIB', 'threshold', '岸桥Q02大梁振动超限', '振动值265.8mm/s超过临界阈值240mm/s，设备已自动停机', 'critical', 'active', 265.8, 240, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('ALT-002', 'DEV-QC-002', 'SEN-QC002-TEMP', 'threshold', '岸桥Q02电机温度过高', '电机温度142.5°C超过预警阈值100°C，存在过热风险', 'error', 'active', 142.5, 100, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 28 MINUTE)),
('ALT-003', 'DEV-RTG-002', NULL, 'maintenance_due', 'RTG-R02定期维护到期', '设备已到计划维护时间，请安排维护作业', 'warning', 'acknowledged', NULL, NULL, '张工', DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('ALT-004', 'DEV-MOTOR-002', NULL, 'offline', '电机M02离线告警', '设备已离线超过4小时，最后心跳时间：4小时前', 'warning', 'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('ALT-005', 'DEV-AGV-001', 'SEN-AGV001-TEMP', 'threshold', 'AGV-A01电机温度预警', '电机温度62.3°C接近预警阈值85°C，建议关注', 'info', 'resolved', 62.3, 85, '李工', DATE_SUB(NOW(), INTERVAL 6 HOUR), '李工', DATE_SUB(NOW(), INTERVAL 5 HOUR), '检查散热系统，清洁风扇，温度已恢复正常', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
('ALT-006', 'DEV-PUMP-001', 'SEN-PUMP001-PRES', 'anomaly', '液压泵P01压力异常波动', 'AI检测到出口压力出现异常波动模式，可能存在密封泄漏', 'warning', 'acknowledged', 25.3, NULL, '王工', DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('ALT-007', 'DEV-CONV-001', NULL, 'error', '传送带C01运行异常', '传送带速度不稳定，检测到多次微停机', 'warning', 'resolved', NULL, NULL, '赵工', DATE_SUB(NOW(), INTERVAL 12 HOUR), '赵工', DATE_SUB(NOW(), INTERVAL 10 HOUR), '更换传动皮带，调整张紧装置', DATE_SUB(NOW(), INTERVAL 14 HOUR)),
('ALT-008', 'DEV-GW-001', NULL, 'custom', '边缘网关G01连接数预警', '当前连接设备数达到85%容量上限', 'info', 'active', 85, 90, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR))
ON DUPLICATE KEY UPDATE title=VALUES(title);

-- ============================================================
-- 4. 维护记录数据 (device_maintenance_records)
-- ============================================================
INSERT INTO device_maintenance_records (recordId, deviceId, maintenanceType, title, description, scheduledDate, startedAt, completedAt, `status`, priority, assignedTo, performedBy, cost, findings, recommendations, nextMaintenanceDate, createdAt) VALUES
('MNT-001', 'DEV-RTG-002', 'preventive', 'RTG-R02季度预防性维护', '按照维护计划进行季度全面检查，包括液压系统、电气系统、机械结构检查', NOW(), DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, 'in_progress', 'high', '张工', '张工', 15000, NULL, NULL, DATE_ADD(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
('MNT-002', 'DEV-QC-001', 'preventive', '岸桥Q01月度检查', '月度例行检查：钢丝绳磨损、制动器间隙、润滑系统', DATE_ADD(NOW(), INTERVAL 5 DAY), NULL, NULL, 'scheduled', 'medium', '李工', NULL, NULL, NULL, NULL, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW()),
('MNT-003', 'DEV-QC-002', 'corrective', '岸桥Q02振动异常修复', '针对大梁振动超限告警进行紧急检修，排查振动原因', NOW(), NULL, NULL, 'scheduled', 'critical', '王工', NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('MNT-004', 'DEV-CONV-001', 'corrective', '传送带C01皮带更换', '传送带运行异常，更换传动皮带并调整张紧装置', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR), 'completed', 'high', '赵工', '赵工', 8500, '传动皮带磨损严重，张紧装置松动', '建议缩短皮带检查周期至每月一次', DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 14 HOUR)),
('MNT-005', 'DEV-AGV-001', 'predictive', 'AGV-A01预测性维护-轴承', 'AI预测轴承剩余寿命不足30天，建议提前更换', DATE_ADD(NOW(), INTERVAL 15 DAY), NULL, NULL, 'scheduled', 'medium', '李工', NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('MNT-006', 'DEV-PUMP-001', 'inspection', '液压泵P01密封检查', '针对压力异常波动告警，检查液压泵密封状态', DATE_ADD(NOW(), INTERVAL 1 DAY), NULL, NULL, 'scheduled', 'high', '王工', NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('MNT-007', 'DEV-MOTOR-001', 'calibration', '电机M01传感器校准', '对振动、温度、电流传感器进行年度校准', DATE_ADD(NOW(), INTERVAL 10 DAY), NULL, NULL, 'scheduled', 'low', '孙工', NULL, 2000, NULL, NULL, DATE_ADD(NOW(), INTERVAL 365 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY))
ON DUPLICATE KEY UPDATE title=VALUES(title);

-- ============================================================
-- 5. 设备 KPI 数据 (device_kpis)
-- ============================================================
INSERT INTO device_kpis (deviceId, periodType, periodStart, periodEnd, availability, performance, quality, oee, runningTime, downtime, idleTime, plannedDowntime, unplannedDowntime, mtbf, mttr, failureCount, productionCount, defectCount, energyConsumption, energyEfficiency) VALUES
-- AGV-001 日度 KPI
('DEV-AGV-001', 'daily', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 96.5, 92.3, 99.1, 88.3, 83376, 1800, 1224, 1200, 600, 720, 0.5, 1, 1250, 3, 85.2, 14.7),
('DEV-AGV-001', 'daily', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 98.2, 94.1, 99.5, 91.9, 84845, 900, 655, 900, 0, 1440, 0, 0, 1380, 2, 88.5, 15.6),
-- RTG-001 日度 KPI
('DEV-RTG-001', 'daily', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 94.8, 88.5, 98.7, 82.9, 81907, 2700, 1793, 1800, 900, 480, 1.2, 2, 850, 5, 320.5, 2.7),
('DEV-RTG-001', 'daily', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 97.1, 91.2, 99.2, 87.8, 83894, 1500, 1006, 1200, 300, 720, 0.8, 1, 920, 3, 305.8, 3.0),
-- QC-001 日度 KPI
('DEV-QC-001', 'daily', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 95.5, 90.8, 99.3, 86.1, 82512, 2400, 1488, 1800, 600, 360, 1.5, 2, 680, 2, 580.2, 1.2),
-- QC-002 日度 KPI（故障设备，数据较差）
('DEV-QC-002', 'daily', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 72.3, 65.8, 95.2, 45.3, 62467, 18000, 5933, 3600, 14400, 120, 3.5, 5, 420, 12, 450.8, 0.9),
-- CONV-001 日度 KPI
('DEV-CONV-001', 'daily', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 91.2, 87.5, 99.8, 79.6, 78797, 5400, 2203, 3600, 1800, 240, 2.0, 3, 15000, 8, 125.3, 119.7),
-- 周度汇总
('DEV-AGV-001', 'weekly', DATE_SUB(NOW(), INTERVAL 7 DAY), NOW(), 97.1, 93.5, 99.3, 90.2, 587088, 10800, 6912, 7200, 3600, 840, 0.6, 6, 9200, 18, 610.5, 15.1),
('DEV-RTG-001', 'weekly', DATE_SUB(NOW(), INTERVAL 7 DAY), NOW(), 95.8, 89.8, 98.9, 85.1, 579398, 19200, 6202, 12600, 6600, 560, 1.0, 10, 6100, 28, 2180.5, 2.8),
('DEV-QC-001', 'weekly', DATE_SUB(NOW(), INTERVAL 7 DAY), NOW(), 96.2, 91.5, 99.4, 87.4, 581818, 16800, 6182, 10800, 6000, 420, 1.2, 12, 4800, 10, 3950.8, 1.2);

-- ============================================================
-- 6. 设备运行日志 (device_operation_logs)
-- ============================================================
INSERT INTO device_operation_logs (logId, deviceId, operationType, previousState, newState, operatedBy, reason, success, duration, `timestamp`) VALUES
('LOG-001', 'DEV-QC-002', 'stop', 'online', 'error', '系统', '振动超限自动停机保护', 1, 500, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('LOG-002', 'DEV-RTG-002', 'stop', 'online', 'maintenance', '张工', '计划维护停机', 1, 1200, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('LOG-003', 'DEV-CONV-001', 'restart', 'offline', 'online', '赵工', '皮带更换完成，恢复运行', 1, 3000, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('LOG-004', 'DEV-AGV-001', 'firmware_update', 'online', 'online', '李工', '固件升级至v3.2.1', 1, 180000, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('LOG-005', 'DEV-MOTOR-002', 'stop', 'online', 'offline', '系统', '通信中断，设备离线', 1, 0, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('LOG-006', 'DEV-GW-001', 'config_change', 'online', 'online', '陈工', '调整MQTT连接参数，增加超时时间', 1, 5000, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('LOG-007', 'DEV-PUMP-001', 'calibration', 'online', 'online', '王工', '压力传感器校准', 1, 600000, DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE reason=VALUES(reason);

SELECT CONCAT('种子数据插入完成！设备: ', (SELECT COUNT(*) FROM devices), ' 台, 传感器: ', (SELECT COUNT(*) FROM sensors), ' 个, 告警: ', (SELECT COUNT(*) FROM device_alerts), ' 条, 维护记录: ', (SELECT COUNT(*) FROM device_maintenance_records), ' 条') AS result;
