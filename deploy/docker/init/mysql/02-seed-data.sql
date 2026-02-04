-- ============================================================
-- 西联智能平台 - MySQL 初始数据填充脚本
-- XiLian Intelligent Platform - MySQL Seed Data
-- ============================================================

USE xilian_platform;

-- ============================================================
-- 管理员用户
-- ============================================================

INSERT INTO users (openId, name, email, role, loginMethod) VALUES
('admin-001', '系统管理员', 'admin@xilian.com', 'admin', 'password'),
('admin-002', '运维管理员', 'ops@xilian.com', 'admin', 'password')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================================
-- 知识库初始数据
-- ============================================================

INSERT INTO kb_collections (name, description, isPublic) VALUES
('设备故障诊断知识库', '包含各类工业设备的故障诊断知识和解决方案', TRUE),
('维护保养手册库', '设备维护保养的标准操作流程和最佳实践', TRUE),
('安全操作规程库', '工业安全操作规程和应急处理指南', TRUE)
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ============================================================
-- 系统拓扑初始节点
-- ============================================================

INSERT INTO topo_nodes (nodeId, name, type, icon, description, status, x, y) VALUES
-- 数据源层
('source-mqtt', 'MQTT Broker', 'source', '📡', 'MQTT 消息代理服务', 'online', 100, 100),
('source-opcua', 'OPC-UA Server', 'source', '🔌', 'OPC-UA 数据采集服务', 'online', 100, 200),
('source-modbus', 'Modbus Gateway', 'source', '📟', 'Modbus 协议网关', 'online', 100, 300),

-- 数据处理层
('engine-kafka', 'Kafka Cluster', 'engine', '📊', 'Kafka 消息队列集群', 'online', 300, 150),
('engine-flink', 'Flink Cluster', 'engine', '⚡', 'Flink 流处理集群', 'online', 300, 250),

-- 存储层
('database-mysql', 'MySQL', 'database', '🗄️', 'MySQL 关系数据库', 'online', 500, 100),
('database-clickhouse', 'ClickHouse', 'database', '📈', 'ClickHouse 时序数据库', 'online', 500, 200),
('database-redis', 'Redis', 'database', '💾', 'Redis 缓存服务', 'online', 500, 300),

-- 服务层
('service-api', 'API Gateway', 'service', '🌐', 'API 网关服务', 'online', 700, 150),
('service-ai', 'AI Engine', 'service', '🤖', 'AI 推理引擎', 'online', 700, 250),

-- 输出层
('output-grafana', 'Grafana', 'output', '📊', 'Grafana 可视化', 'online', 900, 150),
('output-alertmanager', 'AlertManager', 'output', '🔔', '告警管理器', 'online', 900, 250)
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

-- ============================================================
-- 系统拓扑连接
-- ============================================================

INSERT INTO topo_edges (edgeId, sourceNodeId, targetNodeId, type, label, status) VALUES
-- 数据源到 Kafka
('edge-mqtt-kafka', 'source-mqtt', 'engine-kafka', 'data', 'MQTT数据', 'active'),
('edge-opcua-kafka', 'source-opcua', 'engine-kafka', 'data', 'OPC-UA数据', 'active'),
('edge-modbus-kafka', 'source-modbus', 'engine-kafka', 'data', 'Modbus数据', 'active'),

-- Kafka 到 Flink
('edge-kafka-flink', 'engine-kafka', 'engine-flink', 'data', '流数据', 'active'),

-- Flink 到存储
('edge-flink-mysql', 'engine-flink', 'database-mysql', 'data', '结构化数据', 'active'),
('edge-flink-clickhouse', 'engine-flink', 'database-clickhouse', 'data', '时序数据', 'active'),
('edge-flink-redis', 'engine-flink', 'database-redis', 'data', '缓存数据', 'active'),

-- 存储到服务
('edge-mysql-api', 'database-mysql', 'service-api', 'dependency', '数据查询', 'active'),
('edge-clickhouse-api', 'database-clickhouse', 'service-api', 'dependency', '时序查询', 'active'),
('edge-redis-api', 'database-redis', 'service-api', 'dependency', '缓存查询', 'active'),

-- 服务到输出
('edge-api-grafana', 'service-api', 'output-grafana', 'data', '可视化数据', 'active'),
('edge-api-alertmanager', 'service-api', 'output-alertmanager', 'data', '告警数据', 'active'),

-- AI 引擎连接
('edge-clickhouse-ai', 'database-clickhouse', 'service-ai', 'dependency', '训练数据', 'active'),
('edge-ai-api', 'service-ai', 'service-api', 'data', '推理结果', 'active')
ON DUPLICATE KEY UPDATE label = VALUES(label), status = VALUES(status);

-- ============================================================
-- 默认布局
-- ============================================================

INSERT INTO topo_layouts (name, description, isDefault, layoutData) VALUES
('默认布局', '系统默认拓扑布局', TRUE, JSON_OBJECT(
  'zoom', 1.0,
  'panX', 0,
  'panY', 0,
  'nodes', JSON_ARRAY()
))
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ============================================================
-- AI 模型初始数据
-- ============================================================

INSERT INTO models (modelId, name, displayName, type, provider, size, parameters, description, status, isDefault, capabilities) VALUES
('qwen2.5-7b', 'Qwen 2.5 7B', 'Qwen 2.5 7B 通用模型', 'llm', 'ollama', '4.4GB', '7B', '阿里云通义千问 2.5 7B 参数模型，适用于通用对话和文本生成', 'available', TRUE, 
  JSON_OBJECT('chat', TRUE, 'completion', TRUE, 'embedding', FALSE, 'vision', FALSE, 'functionCalling', TRUE)),

('llama3.2-3b', 'Llama 3.2 3B', 'Llama 3.2 3B 轻量模型', 'llm', 'ollama', '2.0GB', '3B', 'Meta Llama 3.2 3B 参数轻量模型，适用于边缘部署', 'available', FALSE,
  JSON_OBJECT('chat', TRUE, 'completion', TRUE, 'embedding', FALSE, 'vision', FALSE, 'functionCalling', FALSE)),

('bge-m3', 'BGE-M3', 'BGE-M3 多语言嵌入模型', 'embedding', 'ollama', '1.2GB', '568M', 'BAAI BGE-M3 多语言嵌入模型，支持中英文向量化', 'available', TRUE,
  JSON_OBJECT('chat', FALSE, 'completion', FALSE, 'embedding', TRUE, 'vision', FALSE, 'functionCalling', FALSE)),

('diagnostic-v1', '设备诊断模型 V1', '工业设备故障诊断专用模型', 'diagnostic', 'local', '800MB', '350M', '基于工业设备数据训练的故障诊断模型', 'available', TRUE,
  JSON_OBJECT('chat', FALSE, 'completion', FALSE, 'embedding', FALSE, 'vision', FALSE, 'functionCalling', FALSE))
ON DUPLICATE KEY UPDATE displayName = VALUES(displayName), description = VALUES(description);

-- ============================================================
-- 示例设备数据
-- ============================================================

INSERT INTO devices (deviceId, name, type, model, manufacturer, location, department, status, metadata) VALUES
('DEV-AGV-001', 'AGV-1号车', 'agv', 'AGV-3000', '西联智能', 'A区-1号通道', '物流部', 'online',
  JSON_OBJECT('firmware', 'v2.3.1', 'ipAddress', '192.168.1.101', 'protocol', 'MQTT')),

('DEV-AGV-002', 'AGV-2号车', 'agv', 'AGV-3000', '西联智能', 'A区-2号通道', '物流部', 'online',
  JSON_OBJECT('firmware', 'v2.3.1', 'ipAddress', '192.168.1.102', 'protocol', 'MQTT')),

('DEV-RTG-001', 'RTG-1号机', 'rtg', 'RTG-5000', '振华重工', 'B区-堆场1', '装卸部', 'online',
  JSON_OBJECT('firmware', 'v1.8.5', 'ipAddress', '192.168.2.101', 'protocol', 'OPC-UA')),

('DEV-QC-001', 'QC-1号桥吊', 'qc', 'QC-8000', '振华重工', 'C区-码头1', '装卸部', 'maintenance',
  JSON_OBJECT('firmware', 'v1.6.2', 'ipAddress', '192.168.3.101', 'protocol', 'OPC-UA')),

('DEV-PUMP-001', '冷却水泵-1号', 'pump', 'CP-200', '格兰富', 'D区-机房', '设备部', 'online',
  JSON_OBJECT('firmware', 'v3.1.0', 'ipAddress', '192.168.4.101', 'protocol', 'Modbus')),

('DEV-MOTOR-001', '主驱动电机-1号', 'motor', 'ABB-M3BP', 'ABB', 'E区-生产线1', '生产部', 'online',
  JSON_OBJECT('firmware', 'v2.0.0', 'ipAddress', '192.168.5.101', 'protocol', 'Modbus')),

('DEV-GW-001', '边缘网关-1号', 'gateway', 'EG-1000', '西联智能', 'F区-控制室', 'IT部', 'online',
  JSON_OBJECT('firmware', 'v4.2.0', 'ipAddress', '192.168.6.101', 'protocol', 'MQTT'))
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

-- ============================================================
-- 示例传感器数据
-- ============================================================

INSERT INTO sensors (sensorId, deviceId, name, type, unit, minValue, maxValue, warningThreshold, criticalThreshold, status) VALUES
-- AGV-1号车传感器
('SEN-AGV001-VIB', 'DEV-AGV-001', '驱动电机振动', 'vibration', 'mm/s', 0, 100, 50, 80, 'active'),
('SEN-AGV001-TEMP', 'DEV-AGV-001', '电池温度', 'temperature', '°C', -20, 80, 45, 60, 'active'),
('SEN-AGV001-CURR', 'DEV-AGV-001', '驱动电流', 'current', 'A', 0, 200, 150, 180, 'active'),
('SEN-AGV001-SPD', 'DEV-AGV-001', '行驶速度', 'speed', 'm/s', 0, 5, 4, 5, 'active'),

-- RTG-1号机传感器
('SEN-RTG001-VIB', 'DEV-RTG-001', '起升电机振动', 'vibration', 'mm/s', 0, 150, 80, 120, 'active'),
('SEN-RTG001-TEMP', 'DEV-RTG-001', '液压油温度', 'temperature', '°C', 0, 100, 65, 85, 'active'),
('SEN-RTG001-PRES', 'DEV-RTG-001', '液压压力', 'pressure', 'MPa', 0, 35, 28, 32, 'active'),

-- 冷却水泵传感器
('SEN-PUMP001-FLOW', 'DEV-PUMP-001', '流量', 'flow', 'm³/h', 0, 500, 400, 480, 'active'),
('SEN-PUMP001-PRES', 'DEV-PUMP-001', '出口压力', 'pressure', 'MPa', 0, 2, 1.5, 1.8, 'active'),
('SEN-PUMP001-VIB', 'DEV-PUMP-001', '泵体振动', 'vibration', 'mm/s', 0, 50, 30, 45, 'active'),

-- 主驱动电机传感器
('SEN-MOTOR001-TEMP', 'DEV-MOTOR-001', '绕组温度', 'temperature', '°C', 0, 150, 100, 130, 'active'),
('SEN-MOTOR001-CURR', 'DEV-MOTOR-001', '相电流', 'current', 'A', 0, 500, 400, 480, 'active'),
('SEN-MOTOR001-VIB', 'DEV-MOTOR-001', '轴承振动', 'vibration', 'mm/s', 0, 80, 50, 70, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

-- ============================================================
-- 诊断规则初始数据
-- ============================================================

INSERT INTO diagnosis_rules (ruleId, name, description, category, deviceType, sensorType, conditionExpr, actionType, severity, isActive, priority) VALUES
('RULE-VIB-HIGH', '振动过高告警', '当振动值超过警戒阈值时触发告警', '振动监测', NULL, 'vibration', 
  'value > warningThreshold', 'alert', 'high', TRUE, 1),

('RULE-TEMP-HIGH', '温度过高告警', '当温度值超过警戒阈值时触发告警', '温度监测', NULL, 'temperature',
  'value > warningThreshold', 'alert', 'high', TRUE, 1),

('RULE-TEMP-CRITICAL', '温度临界告警', '当温度值超过临界阈值时触发紧急告警', '温度监测', NULL, 'temperature',
  'value > criticalThreshold', 'notification', 'critical', TRUE, 0),

('RULE-DEVICE-OFFLINE', '设备离线告警', '当设备超过5分钟未上报心跳时触发告警', '设备状态', NULL, NULL,
  'lastHeartbeat < NOW() - INTERVAL 5 MINUTE', 'alert', 'medium', TRUE, 2),

('RULE-ANOMALY-ZSCORE', 'Z-Score异常检测', '使用Z-Score算法检测数据异常', '异常检测', NULL, NULL,
  'zscore(value, window=60) > 3', 'alert', 'medium', TRUE, 3),

('RULE-BEARING-WEAR', '轴承磨损预警', '基于振动频谱分析检测轴承磨损', '预测性维护', 'motor', 'vibration',
  'fft_peak(value, freq=bearing_freq) > threshold', 'workflow', 'high', TRUE, 1),

('RULE-PUMP-CAVITATION', '水泵气蚀预警', '基于压力和流量波动检测水泵气蚀', '预测性维护', 'pump', 'pressure',
  'stddev(value, window=60) > normal_stddev * 2', 'alert', 'high', TRUE, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ============================================================
-- 备件库存初始数据
-- ============================================================

INSERT INTO device_spare_parts (partId, name, partNumber, category, manufacturer, quantity, minQuantity, unitPrice, location, status) VALUES
('PART-BEARING-001', 'SKF 6205-2RS 深沟球轴承', 'SKF-6205-2RS', '轴承', 'SKF', 50, 10, 85.00, 'A-01-01', 'in_stock'),
('PART-BEARING-002', 'SKF 6308-2Z 深沟球轴承', 'SKF-6308-2Z', '轴承', 'SKF', 30, 5, 156.00, 'A-01-02', 'in_stock'),
('PART-SEAL-001', 'NOK TC 油封 35x52x7', 'NOK-TC-35527', '密封件', 'NOK', 100, 20, 12.50, 'A-02-01', 'in_stock'),
('PART-BELT-001', 'Gates 5M-1500 同步带', 'GATES-5M1500', '传动件', 'Gates', 20, 5, 280.00, 'A-03-01', 'in_stock'),
('PART-FILTER-001', 'Parker 液压滤芯 937399Q', 'PARKER-937399Q', '滤芯', 'Parker', 40, 10, 450.00, 'B-01-01', 'in_stock'),
('PART-MOTOR-001', 'ABB 变频器 ACS580-01-12A7', 'ABB-ACS580-12A7', '电气件', 'ABB', 5, 2, 8500.00, 'C-01-01', 'in_stock'),
('PART-SENSOR-001', 'IFM 振动传感器 VTV122', 'IFM-VTV122', '传感器', 'IFM', 15, 5, 2800.00, 'C-02-01', 'in_stock'),
('PART-SENSOR-002', 'PT100 温度传感器', 'PT100-A-100', '传感器', '国产', 50, 10, 65.00, 'C-02-02', 'in_stock')
ON DUPLICATE KEY UPDATE name = VALUES(name), quantity = VALUES(quantity);

-- ============================================================
-- 完成初始化
-- ============================================================

SELECT 'MySQL seed data initialization completed successfully!' AS status;
SELECT CONCAT('Total users: ', COUNT(*)) AS info FROM users;
SELECT CONCAT('Total devices: ', COUNT(*)) AS info FROM devices;
SELECT CONCAT('Total sensors: ', COUNT(*)) AS info FROM sensors;
SELECT CONCAT('Total models: ', COUNT(*)) AS info FROM models;
