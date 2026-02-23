/**
 * 接入层统一类型定义
 * Connector → Endpoint → Binding 三级模型
 */

// ============ 协议枚举 ============

export const PROTOCOL_TYPES = [
  'mqtt', 'opcua', 'modbus', 'ethernet-ip', 'profinet', 'ethercat',
  'mysql', 'postgresql', 'kafka', 'clickhouse',
  'redis', 'neo4j', 'minio', 'influxdb', 'qdrant',
  'http', 'grpc', 'websocket',
] as const;
export type ProtocolType = typeof PROTOCOL_TYPES[number];

export const PROTOCOL_CATEGORIES: Record<string, { label: string; protocols: ProtocolType[] }> = {
  industrial: { label: '工业协议', protocols: ['mqtt', 'opcua', 'modbus', 'ethernet-ip', 'profinet', 'ethercat'] },
  database: { label: '数据库', protocols: ['mysql', 'postgresql', 'clickhouse', 'influxdb', 'redis', 'neo4j', 'qdrant'] },
  messaging: { label: '消息队列', protocols: ['kafka'] },
  storage: { label: '对象存储', protocols: ['minio'] },
  api: { label: 'API', protocols: ['http', 'grpc', 'websocket'] },
};

export const PROTOCOL_META: Record<ProtocolType, { label: string; icon: string; description: string; category: string }> = {
  mqtt: { label: 'MQTT', icon: '📡', description: 'IoT 传感器实时数据流', category: 'industrial' },
  opcua: { label: 'OPC-UA', icon: '🏭', description: 'PLC/DCS 工业控制数据', category: 'industrial' },
  modbus: { label: 'Modbus', icon: '⚙️', description: '传统工控设备寄存器', category: 'industrial' },
  'ethernet-ip': { label: 'EtherNet/IP', icon: '🔌', description: 'Allen-Bradley/Rockwell PLC CIP 协议', category: 'industrial' },
  profinet: { label: 'PROFINET', icon: '🛠️', description: '西门子 S7 PLC 实时通信', category: 'industrial' },
  ethercat: { label: 'EtherCAT', icon: '⚡', description: '高性能运动控制与伺服驱动', category: 'industrial' },
  mysql: { label: 'MySQL', icon: '🐬', description: '关系型数据库', category: 'database' },
  postgresql: { label: 'PostgreSQL', icon: '🐘', description: '高级关系型数据库', category: 'database' },
  kafka: { label: 'Kafka', icon: '📨', description: '事件流/日志聚合', category: 'messaging' },
  clickhouse: { label: 'ClickHouse', icon: '⚡', description: '分析型列式数据库', category: 'database' },
  redis: { label: 'Redis', icon: '🔴', description: '缓存/实时状态', category: 'database' },
  neo4j: { label: 'Neo4j', icon: '🕸️', description: '图数据库', category: 'database' },
  minio: { label: 'MinIO/S3', icon: '📦', description: '文件/模型/快照存储', category: 'storage' },
  influxdb: { label: 'InfluxDB', icon: '📈', description: '时序数据存储', category: 'database' },
  qdrant: { label: 'Qdrant', icon: '🔍', description: '向量检索', category: 'database' },
  http: { label: 'HTTP REST', icon: '🌐', description: '外部系统 REST API', category: 'api' },
  grpc: { label: 'gRPC', icon: '🚀', description: '高性能服务间通信', category: 'api' },
  websocket: { label: 'WebSocket', icon: '🔌', description: '实时双向通信', category: 'api' },
};

// ============ Connector 类型 ============

export type ConnectorStatus = 'draft' | 'testing' | 'connected' | 'disconnected' | 'error';

export interface ConnectorInfo {
  id: number;
  connectorId: string;
  name: string;
  description: string | null;
  protocolType: ProtocolType;
  connectionParams: Record<string, unknown>;
  authConfig: Record<string, unknown> | null;
  healthCheckConfig: Record<string, unknown> | null;
  status: ConnectorStatus;
  lastHealthCheck: string | null;
  lastError: string | null;
  sourceRef: string | null;
  tags: string[] | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  endpointCount?: number;
  bindingCount?: number;
}

export interface ConnectorWithEndpoints extends ConnectorInfo {
  endpoints: EndpointInfo[];
}

// ============ Endpoint 类型 ============

export type ResourceType = 'topic' | 'table' | 'collection' | 'bucket' | 'register' | 'node' | 'api_path' | 'api' | 'measurement' | 'stream' | 'key' | 'graph'
  | 'slave' | 'pdo-entry' | 'sdo' | 'tag' | 'cip-object' | 'assembly' | 'io-data' | 'diagnostic';
export type DataFormat = 'json' | 'csv' | 'parquet' | 'binary' | 'protobuf' | 'line_protocol' | 'msgpack' | 'xml' | 'text';

export interface SamplingConfig {
  mode: 'continuous' | 'triggered' | 'scheduled';
  intervalMs?: number;
  trigger?: {
    type: 'threshold' | 'change' | 'cron';
    metric?: string;
    warningLevel?: number;
    alarmLevel?: number;
    expression?: string;
  };
  buffer?: {
    preTriggerSec?: number;
    postTriggerSec?: number;
    maxBufferSizeMB?: number;
  };
}

export interface PreprocessConfig {
  edgeCompute?: string[];
  compressionRatio?: number;
  filterRules?: Array<{ field: string; operator: string; value: unknown }>;
}

export type EndpointStatus = 'active' | 'inactive' | 'error' | 'discovered';

export interface EndpointInfo {
  id: number;
  endpointId: string;
  connectorId: string;
  name: string;
  resourcePath: string;
  resourceType: ResourceType;
  dataFormat: DataFormat | null;
  schemaInfo: Record<string, unknown> | null;
  samplingConfig: SamplingConfig | null;
  preprocessConfig: PreprocessConfig | null;
  protocolConfigId: string | null;
  sensorId: string | null;
  status: EndpointStatus;
  discoveredAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  bindings?: BindingInfo[];
}

// ============ Binding 类型 ============

export type BindingTargetType =
  | 'pipeline_node'
  | 'kg_data_node'
  | 'sampling_config'
  | 'slice_rule'
  | 'edge_gateway'
  | 'stream_processor'
  | 'event_bus_topic';

export type BindingDirection = 'ingest' | 'egress' | 'bidirectional';

export interface TransformConfig {
  fieldMappings?: Array<{ source: string; target: string; transform?: string }>;
  unitConversions?: Array<{ field: string; fromUnit: string; toUnit: string; factor: number }>;
  filters?: Array<{ field: string; operator: string; value: unknown }>;
}

export interface BufferConfig {
  enabled: boolean;
  maxSizeMB?: number;
  flushIntervalMs?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    deadLetterQueue?: string;
  };
}

export interface SyncStats {
  totalMessages: number;
  totalBytes: number;
  errorCount: number;
  avgLatencyMs: number;
  lastMessageAt: string | null;
}

export type BindingStatus = 'active' | 'inactive' | 'error' | 'paused';

export interface BindingInfo {
  id: number;
  bindingId: string;
  endpointId: string;
  targetType: BindingTargetType;
  targetId: string;
  direction: BindingDirection;
  transformConfig: TransformConfig | null;
  bufferConfig: BufferConfig | null;
  status: BindingStatus;
  lastSyncAt: string | null;
  syncStats: SyncStats | null;
  createdAt: string;
  updatedAt: string;
  // 前端展示用的关联信息
  endpointName?: string;
  connectorName?: string;
  targetName?: string;
}

// ============ 连接测试 ============

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
  serverVersion?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message: string;
  metrics?: Record<string, unknown>;
  checkedAt: string;
}

// ============ 协议配置 Schema ============

export interface ProtocolConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'json' | 'textarea';
  required: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  group?: string;
}

export interface ProtocolConfigSchema {
  protocolType: ProtocolType;
  label: string;
  icon: string;
  description: string;
  category: string;
  connectionFields: ProtocolConfigField[];
  authFields: ProtocolConfigField[];
  advancedFields?: ProtocolConfigField[];
}

// ============ 资源发现 ============

export interface DiscoveredEndpoint {
  resourcePath: string;
  resourceType: ResourceType;
  name: string;
  dataFormat?: DataFormat;
  schemaInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============ 统计 ============

export interface AccessLayerStats {
  totalConnectors: number;
  connectedCount: number;
  errorCount: number;
  totalEndpoints: number;
  totalBindings: number;
  protocolDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
}

// ============ 前端 DataSource 兼容映射 ============

/** 旧 DataSourceType → 新 ProtocolType 映射 */
export const LEGACY_TYPE_MAP: Record<string, ProtocolType> = {
  file: 'minio',
  database: 'mysql',
  api: 'http',
  mqtt: 'mqtt',
  opcua: 'opcua',
  modbus: 'modbus',
};
