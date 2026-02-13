/**
 * 协议适配器注册表
 * 每个适配器提供：连接测试 + 资源发现 + 配置 Schema
 * 
 * 注意：当前为模拟实现（无真实中间件连接）
 * 部署真实中间件后，替换各适配器的 testConnection / discoverResources 方法即可
 */
import type { ProtocolType, ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema } from "../../../shared/accessLayerTypes";

export interface ProtocolAdapter {
  protocolType: ProtocolType;
  configSchema: ProtocolConfigSchema;
  testConnection(params: Record<string, unknown>, auth?: Record<string, unknown>): Promise<ConnectionTestResult>;
  discoverResources?(params: Record<string, unknown>, auth?: Record<string, unknown>): Promise<DiscoveredEndpoint[]>;
}

// ============ MQTT 适配器 ============
const mqttAdapter: ProtocolAdapter = {
  protocolType: 'mqtt',
  configSchema: {
    protocolType: 'mqtt',
    label: 'MQTT Broker',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.50' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 1883 },
      { key: 'clientId', label: '客户端ID', type: 'string', required: false, placeholder: '自动生成' },
      { key: 'protocol', label: '协议', type: 'select', required: false, defaultValue: 'mqtt', options: [
        { label: 'MQTT', value: 'mqtt' }, { label: 'MQTTS', value: 'mqtts' }, { label: 'WS', value: 'ws' }, { label: 'WSS', value: 'wss' }
      ]},
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'caCert', label: 'CA证书', type: 'string', required: false, description: 'TLS CA证书路径' },
    ],
    advancedFields: [
      { key: 'keepalive', label: '心跳间隔(秒)', type: 'number', required: false, defaultValue: 60 },
      { key: 'cleanSession', label: '清除会话', type: 'boolean', required: false, defaultValue: true },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    // 模拟连接测试
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    const host = params.host as string;
    if (!host) return { success: false, latencyMs: Date.now() - start, message: '主机地址不能为空' };
    return {
      success: true,
      latencyMs: Date.now() - start,
      message: `成功连接到 MQTT Broker ${host}:${params.port || 1883}`,
      serverVersion: 'Mosquitto 2.0.18',
    };
  },
  async discoverResources(params) {
    // 模拟发现 Topic
    return [
      { resourcePath: 'sensors/#', resourceType: 'topic' as const, name: '传感器数据（通配）', dataFormat: 'json' as const },
      { resourcePath: 'devices/+/status', resourceType: 'topic' as const, name: '设备状态', dataFormat: 'json' as const },
      { resourcePath: 'alarms/+', resourceType: 'topic' as const, name: '告警消息', dataFormat: 'json' as const },
    ];
  },
};

// ============ OPC-UA 适配器 ============
const opcuaAdapter: ProtocolAdapter = {
  protocolType: 'opcua',
  configSchema: {
    protocolType: 'opcua',
    label: 'OPC-UA Server',
    connectionFields: [
      { key: 'endpointUrl', label: '端点URL', type: 'string', required: true, placeholder: 'opc.tcp://192.168.1.60:4840' },
      { key: 'securityMode', label: '安全模式', type: 'select', required: false, defaultValue: 'None', options: [
        { label: 'None', value: 'None' }, { label: 'Sign', value: 'Sign' }, { label: 'SignAndEncrypt', value: 'SignAndEncrypt' }
      ]},
      { key: 'securityPolicy', label: '安全策略', type: 'select', required: false, defaultValue: 'None', options: [
        { label: 'None', value: 'None' }, { label: 'Basic128Rsa15', value: 'Basic128Rsa15' }, { label: 'Basic256Sha256', value: 'Basic256Sha256' }
      ]},
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'certificate', label: '客户端证书', type: 'string', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const url = params.endpointUrl as string;
    if (!url) return { success: false, latencyMs: Date.now() - start, message: '端点URL不能为空' };
    return { success: true, latencyMs: Date.now() - start, message: `成功连接到 OPC-UA ${url}`, serverVersion: 'open62541 1.3.8' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'ns=2;s=Temperature', resourceType: 'node' as const, name: '温度节点', dataFormat: 'json' as const, schemaInfo: { dataType: 'Double', unit: '°C' } },
      { resourcePath: 'ns=2;s=Vibration', resourceType: 'node' as const, name: '振动节点', dataFormat: 'json' as const, schemaInfo: { dataType: 'Double', unit: 'mm/s' } },
      { resourcePath: 'ns=2;s=Pressure', resourceType: 'node' as const, name: '压力节点', dataFormat: 'json' as const, schemaInfo: { dataType: 'Double', unit: 'MPa' } },
    ];
  },
};

// ============ Modbus 适配器 ============
const modbusAdapter: ProtocolAdapter = {
  protocolType: 'modbus',
  configSchema: {
    protocolType: 'modbus',
    label: 'Modbus TCP/RTU',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.70' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 502 },
      { key: 'slaveId', label: '从站ID', type: 'number', required: true, defaultValue: 1 },
      { key: 'mode', label: '模式', type: 'select', required: false, defaultValue: 'tcp', options: [
        { label: 'TCP', value: 'tcp' }, { label: 'RTU', value: 'rtu' }
      ]},
    ],
    authFields: [],
    advancedFields: [
      { key: 'timeout', label: '超时(ms)', type: 'number', required: false, defaultValue: 5000 },
      { key: 'retries', label: '重试次数', type: 'number', required: false, defaultValue: 3 },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `Modbus ${params.host}:${params.port} 连接成功` };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'holding:0-9', resourceType: 'register' as const, name: '保持寄存器 0-9', dataFormat: 'binary' as const },
      { resourcePath: 'input:0-4', resourceType: 'register' as const, name: '输入寄存器 0-4', dataFormat: 'binary' as const },
    ];
  },
};

// ============ MySQL 适配器 ============
const mysqlAdapter: ProtocolAdapter = {
  protocolType: 'mysql',
  configSchema: {
    protocolType: 'mysql',
    label: 'MySQL',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 3306 },
      { key: 'database', label: '数据库名', type: 'string', required: true },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: true },
      { key: 'password', label: '密码', type: 'password', required: true },
      { key: 'ssl', label: '启用SSL', type: 'boolean', required: false, defaultValue: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `MySQL ${params.host}:${params.port}/${params.database} 连接成功`, serverVersion: '8.0.35' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: `${params.database}.sensor_readings`, resourceType: 'table' as const, name: '传感器读数表', dataFormat: 'json' as const },
      { resourcePath: `${params.database}.device_status`, resourceType: 'table' as const, name: '设备状态表', dataFormat: 'json' as const },
    ];
  },
};

// ============ PostgreSQL 适配器 ============
const postgresqlAdapter: ProtocolAdapter = {
  protocolType: 'postgresql',
  configSchema: {
    protocolType: 'postgresql',
    label: 'PostgreSQL',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 5432 },
      { key: 'database', label: '数据库名', type: 'string', required: true },
      { key: 'schema', label: 'Schema', type: 'string', required: false, defaultValue: 'public' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: true },
      { key: 'password', label: '密码', type: 'password', required: true },
      { key: 'ssl', label: '启用SSL', type: 'boolean', required: false, defaultValue: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `PostgreSQL ${params.host}:${params.port}/${params.database} 连接成功`, serverVersion: '16.1' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: `${params.schema || 'public'}.time_series`, resourceType: 'table' as const, name: '时序数据表', dataFormat: 'json' as const },
    ];
  },
};

// ============ Kafka 适配器 ============
const kafkaAdapter: ProtocolAdapter = {
  protocolType: 'kafka',
  configSchema: {
    protocolType: 'kafka',
    label: 'Apache Kafka',
    connectionFields: [
      { key: 'brokers', label: 'Broker列表', type: 'string', required: true, placeholder: 'kafka1:9092,kafka2:9092', description: '逗号分隔的 broker 地址' },
      { key: 'groupId', label: '消费者组ID', type: 'string', required: false, placeholder: 'xilian-consumer' },
    ],
    authFields: [
      { key: 'saslMechanism', label: 'SASL机制', type: 'select', required: false, options: [
        { label: '无', value: 'none' }, { label: 'PLAIN', value: 'plain' }, { label: 'SCRAM-SHA-256', value: 'scram-sha-256' }
      ]},
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    return { success: true, latencyMs: Date.now() - start, message: `Kafka 集群 ${params.brokers} 连接成功`, serverVersion: '3.6.0' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'sensor-data', resourceType: 'topic' as const, name: '传感器数据流', dataFormat: 'json' as const, metadata: { partitions: 6, replication: 3 } },
      { resourcePath: 'device-events', resourceType: 'topic' as const, name: '设备事件', dataFormat: 'json' as const, metadata: { partitions: 3, replication: 3 } },
      { resourcePath: 'alarm-notifications', resourceType: 'topic' as const, name: '告警通知', dataFormat: 'json' as const, metadata: { partitions: 3, replication: 3 } },
    ];
  },
};

// ============ ClickHouse 适配器 ============
const clickhouseAdapter: ProtocolAdapter = {
  protocolType: 'clickhouse',
  configSchema: {
    protocolType: 'clickhouse',
    label: 'ClickHouse',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost' },
      { key: 'port', label: 'HTTP端口', type: 'number', required: true, defaultValue: 8123 },
      { key: 'database', label: '数据库名', type: 'string', required: true, defaultValue: 'default' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false, defaultValue: 'default' },
      { key: 'password', label: '密码', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
    return { success: true, latencyMs: Date.now() - start, message: `ClickHouse ${params.host}:${params.port} 连接成功`, serverVersion: '24.1.3' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: `${params.database}.sensor_readings_local`, resourceType: 'table' as const, name: '传感器读数本地表', dataFormat: 'json' as const },
      { resourcePath: `${params.database}.sensor_readings_dist`, resourceType: 'table' as const, name: '传感器读数分布式表', dataFormat: 'json' as const },
    ];
  },
};

// ============ Redis 适配器 ============
const redisAdapter: ProtocolAdapter = {
  protocolType: 'redis',
  configSchema: {
    protocolType: 'redis',
    label: 'Redis',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 6379 },
      { key: 'db', label: '数据库编号', type: 'number', required: false, defaultValue: 0 },
    ],
    authFields: [
      { key: 'password', label: '密码', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    return { success: true, latencyMs: Date.now() - start, message: `Redis ${params.host}:${params.port} PONG`, serverVersion: '7.2.4' };
  },
};

// ============ Neo4j 适配器 ============
const neo4jAdapter: ProtocolAdapter = {
  protocolType: 'neo4j',
  configSchema: {
    protocolType: 'neo4j',
    label: 'Neo4j',
    connectionFields: [
      { key: 'uri', label: '连接URI', type: 'string', required: true, placeholder: 'bolt://localhost:7687' },
      { key: 'database', label: '数据库', type: 'string', required: false, defaultValue: 'neo4j' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: true, defaultValue: 'neo4j' },
      { key: 'password', label: '密码', type: 'password', required: true },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `Neo4j ${params.uri} 连接成功`, serverVersion: '5.15.0' };
  },
};

// ============ MinIO/S3 适配器 ============
const minioAdapter: ProtocolAdapter = {
  protocolType: 'minio',
  configSchema: {
    protocolType: 'minio',
    label: 'MinIO / S3',
    connectionFields: [
      { key: 'endpoint', label: '端点URL', type: 'string', required: true, placeholder: 'http://minio:9000' },
      { key: 'region', label: '区域', type: 'string', required: false, defaultValue: 'us-east-1' },
      { key: 'forcePathStyle', label: '路径风格', type: 'boolean', required: false, defaultValue: true },
    ],
    authFields: [
      { key: 'accessKey', label: 'Access Key', type: 'string', required: true },
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `MinIO ${params.endpoint} 连接成功` };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'models', resourceType: 'bucket' as const, name: '模型存储桶', dataFormat: 'binary' as const },
      { resourcePath: 'snapshots', resourceType: 'bucket' as const, name: '快照存储桶', dataFormat: 'binary' as const },
      { resourcePath: 'raw-data', resourceType: 'bucket' as const, name: '原始数据桶', dataFormat: 'binary' as const },
    ];
  },
};

// ============ InfluxDB 适配器 ============
const influxdbAdapter: ProtocolAdapter = {
  protocolType: 'influxdb',
  configSchema: {
    protocolType: 'influxdb',
    label: 'InfluxDB',
    connectionFields: [
      { key: 'url', label: '服务URL', type: 'string', required: true, placeholder: 'http://localhost:8086' },
      { key: 'org', label: '组织', type: 'string', required: true },
      { key: 'bucket', label: '默认Bucket', type: 'string', required: false },
    ],
    authFields: [
      { key: 'token', label: 'API Token', type: 'password', required: true },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `InfluxDB ${params.url} 连接成功`, serverVersion: '2.7.4' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'sensor_data', resourceType: 'collection' as const, name: '传感器数据Bucket', dataFormat: 'json' as const },
      { resourcePath: 'device_metrics', resourceType: 'collection' as const, name: '设备指标Bucket', dataFormat: 'json' as const },
    ];
  },
};

// ============ Qdrant 适配器 ============
const qdrantAdapter: ProtocolAdapter = {
  protocolType: 'qdrant',
  configSchema: {
    protocolType: 'qdrant',
    label: 'Qdrant',
    connectionFields: [
      { key: 'url', label: '服务URL', type: 'string', required: true, placeholder: 'http://localhost:6333' },
    ],
    authFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    return { success: true, latencyMs: Date.now() - start, message: `Qdrant ${params.url} 连接成功`, serverVersion: '1.7.4' };
  },
  async discoverResources(params) {
    return [
      { resourcePath: 'knowledge_vectors', resourceType: 'collection' as const, name: '知识向量集合', dataFormat: 'json' as const },
    ];
  },
};

// ============ HTTP REST 适配器 ============
const httpAdapter: ProtocolAdapter = {
  protocolType: 'http',
  configSchema: {
    protocolType: 'http',
    label: 'HTTP REST API',
    connectionFields: [
      { key: 'baseUrl', label: '基础URL', type: 'string', required: true, placeholder: 'https://api.example.com' },
      { key: 'method', label: '默认方法', type: 'select', required: false, defaultValue: 'GET', options: [
        { label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }
      ]},
      { key: 'timeout', label: '超时(ms)', type: 'number', required: false, defaultValue: 30000 },
    ],
    authFields: [
      { key: 'authType', label: '认证方式', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无', value: 'none' }, { label: 'Bearer Token', value: 'bearer' }, { label: 'Basic Auth', value: 'basic' }, { label: 'API Key', value: 'apikey' }
      ]},
      { key: 'token', label: 'Token/Key', type: 'password', required: false },
      { key: 'headerName', label: 'Header名', type: 'string', required: false, placeholder: 'Authorization', description: 'API Key 的 Header 名称' },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
    return { success: true, latencyMs: Date.now() - start, message: `HTTP ${params.baseUrl} 可达` };
  },
};

// ============ gRPC 适配器 ============
const grpcAdapter: ProtocolAdapter = {
  protocolType: 'grpc',
  configSchema: {
    protocolType: 'grpc',
    label: 'gRPC',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 50051 },
      { key: 'protoPath', label: 'Proto文件路径', type: 'string', required: false },
      { key: 'useTls', label: '启用TLS', type: 'boolean', required: false, defaultValue: false },
    ],
    authFields: [
      { key: 'token', label: '认证Token', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `gRPC ${params.host}:${params.port} 连接成功` };
  },
};

// ============ WebSocket 适配器 ============
const websocketAdapter: ProtocolAdapter = {
  protocolType: 'websocket',
  configSchema: {
    protocolType: 'websocket',
    label: 'WebSocket',
    connectionFields: [
      { key: 'url', label: '连接URL', type: 'string', required: true, placeholder: 'ws://localhost:8080/ws' },
      { key: 'protocols', label: '子协议', type: 'string', required: false, description: '逗号分隔' },
    ],
    authFields: [
      { key: 'token', label: '认证Token', type: 'password', required: false },
    ],
  },
  async testConnection(params) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { success: true, latencyMs: Date.now() - start, message: `WebSocket ${params.url} 连接成功` };
  },
};

// ============ 注册表 ============
export const protocolAdapters: Record<string, ProtocolAdapter> = {
  mqtt: mqttAdapter,
  opcua: opcuaAdapter,
  modbus: modbusAdapter,
  mysql: mysqlAdapter,
  postgresql: postgresqlAdapter,
  kafka: kafkaAdapter,
  clickhouse: clickhouseAdapter,
  redis: redisAdapter,
  neo4j: neo4jAdapter,
  minio: minioAdapter,
  influxdb: influxdbAdapter,
  qdrant: qdrantAdapter,
  http: httpAdapter,
  grpc: grpcAdapter,
  websocket: websocketAdapter,
};
