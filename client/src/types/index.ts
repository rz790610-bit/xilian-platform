/**
 * UI View Types (前端视图类型)
 * 
 * 这些类型专用于前端 UI 状态管理和组件 props。
 * 与后端 API 交互时，请使用 tRPC 的类型推断（inferRouterOutputs）。
 * 数据库模型类型请参考 drizzle/schema.ts。
 * 
 * 注意：部分类型名称与后端模型相似（如 Model, TopologyNode），
 * 但字段经过简化，仅包含 UI 展示所需的属性。
 */
// 导航菜单类型
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: NavSubItem[];
}

export interface NavSubItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: NavSubItem[];
}

// 智能体类型
export interface Agent {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

// 聊天消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// 插件类型
export interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  inputs: PluginPort[];
  outputs: PluginPort[];
  enabled: boolean;
}

export interface PluginPort {
  name: string;
  type: string;
}

// Pipeline 节点类型
export interface PipelineNode {
  id: string;
  pluginId: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}

export interface PipelineConnection {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  nodes: PipelineNode[];
  connections: PipelineConnection[];
  createdAt: Date;
  updatedAt: Date;
}

// 文档类型
export interface Document {
  id: string;
  filename: string;
  content?: string;
  size: number;
  type: string;
  uploadedAt: Date;
}

// 数据文件类型
export interface DataFile {
  id: string;
  name: string;
  type: 'csv' | 'doc' | 'media' | 'cad' | 'image' | 'other';
  size: number;
  tags: string[];
  uploadedAt: Date;
  preview?: string;
}

// 模型类型
export interface Model {
  id: string;
  name: string;
  type: 'llm' | 'embedding' | 'vision' | 'audio' | 'label' | 'diagnostic';
  size: string;
  status: 'loaded' | 'local' | 'available';
  provider: string;
}

// 数据库配置类型
export interface DatabaseConfig {
  id: string;
  name: string;
  type: 'qdrant' | 'milvus' | 'chroma' | 'postgres';
  host: string;
  port: number;
  status: 'connected' | 'disconnected' | 'error';
}

// 系统状态类型
export interface SystemStatus {
  api: 'running' | 'stopped' | 'error';
  ollama: 'connected' | 'disconnected';
  currentModel: string;
  latency?: number;
}

// 统计数据类型
export interface DashboardStats {
  agents: number;
  plugins: number;
  documents: number;
  models: number;
}

// 标签类型
export interface Tag {
  name: string;
  label: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
  count: number;
}

// API 响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 拓扑节点类型
export interface TopologyNode {
  id: string;
  name: string;
  type: 'plugin' | 'engine' | 'database' | 'model';
  status: 'running' | 'stopped' | 'error';
  x: number;
  y: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
  type: 'data' | 'dependency';
}

// ==================== 数据接入相关类型 ====================

// 数据源类型
export type DataSourceType = 'file' | 'database' | 'api' | 'mqtt' | 'opcua' | 'modbus';

// 数据源配置
export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  description?: string;
  config: DataSourceConfig;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 数据源配置详情
export interface DataSourceConfig {
  // 文件类型
  fileType?: 'csv' | 'excel' | 'json' | 'parquet';
  filePath?: string;
  encoding?: string;
  delimiter?: string;
  
  // 数据库类型
  dbType?: 'mysql' | 'postgresql' | 'influxdb' | 'timescaledb' | 'sqlite';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  
  // API 类型
  apiUrl?: string;
  apiMethod?: 'GET' | 'POST';
  apiHeaders?: Record<string, string>;
  apiAuth?: 'none' | 'basic' | 'bearer' | 'apikey';
  apiToken?: string;
  
  // MQTT 类型
  mqttBroker?: string;
  mqttPort?: number;
  mqttTopic?: string;
  mqttQos?: 0 | 1 | 2;
  mqttClientId?: string;
  
  // OPC-UA 类型
  opcuaEndpoint?: string;
  opcuaNodeIds?: string[];
  opcuaSecurityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  
  // Modbus 类型
  modbusHost?: string;
  modbusPort?: number;
  modbusSlaveId?: number;
  modbusRegisters?: ModbusRegister[];
  
  // 通用配置
  syncInterval?: number; // 同步间隔（秒）
  retryCount?: number;
  timeout?: number;
}

// Modbus 寄存器配置
export interface ModbusRegister {
  address: number;
  length: number;
  type: 'coil' | 'discrete' | 'holding' | 'input';
  name: string;
  dataType: 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64';
}

// 数据同步记录
export interface DataSyncLog {
  id: string;
  sourceId: string;
  status: 'success' | 'failed' | 'partial';
  recordsTotal: number;
  recordsSuccess: number;
  recordsFailed: number;
  errorMessage?: string;
  startTime: Date;
  endTime: Date;
}

// ==================== 数据标准化相关类型 ====================

// 设备编码规范
export interface DeviceCodeStandard {
  id: string;
  name: string;
  pattern: string; // 正则表达式模式
  description: string;
  segments: DeviceCodeSegment[];
  example: string;
  isDefault: boolean;
}

export interface DeviceCodeSegment {
  name: string;
  position: number;
  length: number;
  type: 'fixed' | 'variable';
  options?: string[]; // 可选值列表
  description: string;
}

// 测点编码规范
export interface MeasurePointStandard {
  id: string;
  name: string;
  pattern: string;
  description: string;
  segments: MeasurePointSegment[];
  example: string;
  isDefault: boolean;
}

export interface MeasurePointSegment {
  name: string;
  code: string;
  description: string;
  options: MeasurePointOption[];
}

export interface MeasurePointOption {
  code: string;
  name: string;
  description?: string;
}

// 单位换算规则
export interface UnitConversion {
  id: string;
  name: string;
  category: 'vibration' | 'temperature' | 'pressure' | 'speed' | 'current' | 'other';
  fromUnit: string;
  toUnit: string;
  formula: string; // 换算公式，如 "x * 9.8"
  description?: string;
}

// 故障分类标准
export interface FaultCategory {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  level: number;
  description?: string;
  symptoms?: string[];
  children?: FaultCategory[];
}

// 工况阈值配置
export interface ConditionThreshold {
  id: string;
  name: string;
  measureType: string; // 测量类型（振动、温度等）
  unit: string;
  normalMin: number;
  normalMax: number;
  warningMin: number;
  warningMax: number;
  alarmMin: number;
  alarmMax: number;
  description?: string;
}

// 数据质量规则
export interface DataQualityRule {
  id: string;
  name: string;
  type: 'range' | 'null' | 'duplicate' | 'format' | 'outlier' | 'custom';
  field: string;
  condition: string;
  action: 'reject' | 'warn' | 'fix' | 'tag';
  fixValue?: string;
  description?: string;
  enabled: boolean;
}

// 数据映射规则
export interface DataMappingRule {
  id: string;
  name: string;
  sourceField: string;
  targetField: string;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'trim' | 'round' | 'custom';
  customTransform?: string;
  description?: string;
}

// 标准化配置
export interface StandardizationConfig {
  deviceCodeStandards: DeviceCodeStandard[];
  measurePointStandards: MeasurePointStandard[];
  unitConversions: UnitConversion[];
  faultCategories: FaultCategory[];
  conditionThresholds: ConditionThreshold[];
  dataQualityRules: DataQualityRule[];
  dataMappingRules: DataMappingRule[];
}
