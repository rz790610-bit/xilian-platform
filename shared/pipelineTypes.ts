/**
 * Pipeline 数据流处理 - 前后端统一类型定义
 * 与后端 server/pipeline/pipelineEngine.ts 保持一致
 */

// ============ 管道状态 ============
export type PipelineStatus = 'created' | 'running' | 'paused' | 'stopped' | 'error';

// ============ 数据源类型 ============
export type SourceType = 'http' | 'kafka' | 'database';

export interface SourceTypeInfo {
  type: SourceType;
  name: string;
  description: string;
  icon: string;
  configSchema: SourceConfigSchema;
}

// HTTP 数据源配置
export interface HttpSourceConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  dataPath?: string; // 嵌套数据路径，如 "data.items"
  timeout?: number;
}

// Kafka 数据源配置
export interface KafkaSourceConfig {
  brokers: string[];
  topic: string;
  groupId: string;
  fromBeginning?: boolean;
}

// 数据库数据源配置
export interface DatabaseSourceConfig {
  query: string;
  connectionString?: string;
  pollInterval?: number;
}

export type SourceConfig = HttpSourceConfig | KafkaSourceConfig | DatabaseSourceConfig;

// ============ 处理器类型 ============
export type ProcessorType = 'field_map' | 'filter' | 'transform' | 'aggregate';

export interface ProcessorTypeInfo {
  type: ProcessorType;
  name: string;
  description: string;
  icon: string;
  configSchema: ProcessorConfigSchema;
}

// 字段映射处理器配置
export interface FieldMapProcessorConfig {
  mapping: Record<string, string>; // { targetField: sourceField }
}

// 过滤处理器配置
export interface FilterProcessorConfig {
  condition: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
    value: unknown;
  };
}

// 转换处理器配置
export interface TransformProcessorConfig {
  transform: string; // JavaScript 函数字符串
}

// 聚合处理器配置
export interface AggregateProcessorConfig {
  groupBy?: string;
  aggregations: Array<{
    field: string;
    operation: 'sum' | 'avg' | 'min' | 'max' | 'count';
    outputField: string;
  }>;
}

export type ProcessorConfig = 
  | FieldMapProcessorConfig 
  | FilterProcessorConfig 
  | TransformProcessorConfig 
  | AggregateProcessorConfig;

// ============ 目标连接器类型 ============
export type SinkType = 'http' | 'clickhouse' | 'redis';

export interface SinkTypeInfo {
  type: SinkType;
  name: string;
  description: string;
  icon: string;
  configSchema: SinkConfigSchema;
}

// HTTP 目标配置
export interface HttpSinkConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  batchMode?: boolean;
}

// ClickHouse 目标配置
export interface ClickHouseSinkConfig {
  table: string;
  database?: string;
}

// Redis 目标配置
export interface RedisSinkConfig {
  keyPrefix: string;
  ttlSeconds?: number;
}

export type SinkConfig = HttpSinkConfig | ClickHouseSinkConfig | RedisSinkConfig;

// ============ 调度配置 ============
export interface ScheduleConfig {
  type: 'interval' | 'cron';
  value: string | number; // interval 为毫秒数，cron 为表达式
}

// ============ 重试策略 ============
export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
}

// ============ Pipeline 配置（与后端一致） ============
export interface PipelineConfig {
  id: string;
  name: string;
  description?: string;
  source: {
    type: SourceType;
    config: Record<string, unknown>;
  };
  processors: Array<{
    type: ProcessorType;
    config: Record<string, unknown>;
  }>;
  sink: {
    type: SinkType;
    config: Record<string, unknown>;
  };
  schedule?: ScheduleConfig;
  batchSize?: number;
  retryPolicy?: RetryPolicy;
}

// ============ Pipeline 运行时指标 ============
export interface PipelineMetrics {
  totalRecordsProcessed: number;
  totalErrors: number;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  averageProcessingTimeMs: number;
}

// ============ Pipeline 状态响应 ============
export interface PipelineStatusResponse {
  config: PipelineConfig;
  status: PipelineStatus;
  metrics: PipelineMetrics;
  sourceStatus?: {
    connected: boolean;
    lastFetch?: number;
    errorCount: number;
  };
  sinkStatus?: {
    connected: boolean;
    lastWrite?: number;
    errorCount: number;
  };
}

// ============ Pipeline 列表项 ============
export interface PipelineListItem {
  id: string;
  name: string;
  status: PipelineStatus;
  metrics: PipelineMetrics;
}

// ============ 可视化编辑器节点类型 ============
export type EditorNodeType = 'source' | 'processor' | 'sink';

export interface EditorNode {
  id: string;
  type: EditorNodeType;
  subType: SourceType | ProcessorType | SinkType;
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  validated: boolean;
  errors?: string[];
}

export interface EditorConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort?: string;
  toPort?: string;
}

export interface EditorState {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  zoom: number;
  panX: number;
  panY: number;
}

// ============ 配置 Schema 定义 ============
export interface ConfigFieldSchema {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array' | 'object' | 'code';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>; // for select type
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface SourceConfigSchema {
  type: SourceType;
  fields: ConfigFieldSchema[];
}

export interface ProcessorConfigSchema {
  type: ProcessorType;
  fields: ConfigFieldSchema[];
}

export interface SinkConfigSchema {
  type: SinkType;
  fields: ConfigFieldSchema[];
}

// ============ 预定义配置 Schema ============
export const SOURCE_TYPES: SourceTypeInfo[] = [
  {
    type: 'http',
    name: 'HTTP API',
    description: '从 HTTP API 获取数据',
    icon: '🌐',
    configSchema: {
      type: 'http',
      fields: [
        { name: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://api.example.com/data' },
        { name: 'method', label: '请求方法', type: 'select', default: 'GET', options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
        ]},
        { name: 'headers', label: '请求头', type: 'object', placeholder: '{"Authorization": "Bearer xxx"}' },
        { name: 'dataPath', label: '数据路径', type: 'string', placeholder: 'data.items', description: '嵌套数据的路径' },
        { name: 'timeout', label: '超时时间(ms)', type: 'number', default: 30000 },
      ],
    },
  },
  {
    type: 'kafka',
    name: 'Kafka',
    description: '从 Kafka 主题消费消息',
    icon: '📨',
    configSchema: {
      type: 'kafka',
      fields: [
        { name: 'brokers', label: 'Broker 地址', type: 'array', required: true, placeholder: 'localhost:9092' },
        { name: 'topic', label: '主题', type: 'string', required: true, placeholder: 'my-topic' },
        { name: 'groupId', label: '消费组 ID', type: 'string', required: true, placeholder: 'my-group' },
        { name: 'fromBeginning', label: '从头消费', type: 'boolean', default: false },
      ],
    },
  },
  {
    type: 'database',
    name: '数据库',
    description: '从数据库查询数据',
    icon: '🗄️',
    configSchema: {
      type: 'database',
      fields: [
        { name: 'query', label: 'SQL 查询', type: 'code', required: true, placeholder: 'SELECT * FROM table WHERE ...' },
        { name: 'connectionString', label: '连接字符串', type: 'string', placeholder: 'mysql://user:pass@host:3306/db' },
        { name: 'pollInterval', label: '轮询间隔(ms)', type: 'number', default: 60000 },
      ],
    },
  },
];

export const PROCESSOR_TYPES: ProcessorTypeInfo[] = [
  {
    type: 'field_map',
    name: '字段映射',
    description: '重新映射字段名称',
    icon: '🔀',
    configSchema: {
      type: 'field_map',
      fields: [
        { name: 'mapping', label: '字段映射', type: 'object', required: true, placeholder: '{"newField": "oldField"}', description: '目标字段 -> 源字段' },
      ],
    },
  },
  {
    type: 'filter',
    name: '过滤器',
    description: '根据条件过滤数据',
    icon: '🔍',
    configSchema: {
      type: 'filter',
      fields: [
        { name: 'condition.field', label: '字段名', type: 'string', required: true },
        { name: 'condition.operator', label: '操作符', type: 'select', required: true, options: [
          { value: 'eq', label: '等于 (=)' },
          { value: 'ne', label: '不等于 (≠)' },
          { value: 'gt', label: '大于 (>)' },
          { value: 'gte', label: '大于等于 (≥)' },
          { value: 'lt', label: '小于 (<)' },
          { value: 'lte', label: '小于等于 (≤)' },
          { value: 'contains', label: '包含' },
          { value: 'regex', label: '正则匹配' },
        ]},
        { name: 'condition.value', label: '比较值', type: 'string', required: true },
      ],
    },
  },
  {
    type: 'transform',
    name: '转换器',
    description: '自定义数据转换',
    icon: '⚡',
    configSchema: {
      type: 'transform',
      fields: [
        { name: 'transform', label: '转换函数', type: 'code', required: true, placeholder: '(data) => ({ ...data, newField: data.oldField * 2 })', description: 'JavaScript 函数，接收 data 返回转换后的数据' },
      ],
    },
  },
  {
    type: 'aggregate',
    name: '聚合器',
    description: '数据聚合计算',
    icon: '📊',
    configSchema: {
      type: 'aggregate',
      fields: [
        { name: 'groupBy', label: '分组字段', type: 'string', placeholder: '留空则不分组' },
        { name: 'aggregations', label: '聚合配置', type: 'array', required: true, description: '聚合字段配置数组' },
      ],
    },
  },
];

export const SINK_TYPES: SinkTypeInfo[] = [
  {
    type: 'http',
    name: 'HTTP API',
    description: '发送数据到 HTTP API',
    icon: '📤',
    configSchema: {
      type: 'http',
      fields: [
        { name: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://api.example.com/receive' },
        { name: 'method', label: '请求方法', type: 'select', default: 'POST', options: [
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
        ]},
        { name: 'headers', label: '请求头', type: 'object', placeholder: '{"Authorization": "Bearer xxx"}' },
        { name: 'batchMode', label: '批量发送', type: 'boolean', default: true },
      ],
    },
  },
  {
    type: 'clickhouse',
    name: 'ClickHouse',
    description: '写入 ClickHouse 时序数据库',
    icon: '📈',
    configSchema: {
      type: 'clickhouse',
      fields: [
        { name: 'table', label: '表名', type: 'string', required: true, placeholder: 'sensor_readings' },
        { name: 'database', label: '数据库', type: 'string', placeholder: 'default' },
      ],
    },
  },
  {
    type: 'redis',
    name: 'Redis',
    description: '写入 Redis 缓存',
    icon: '💾',
    configSchema: {
      type: 'redis',
      fields: [
        { name: 'keyPrefix', label: '键前缀', type: 'string', required: true, placeholder: 'pipeline:data:' },
        { name: 'ttlSeconds', label: '过期时间(秒)', type: 'number', placeholder: '3600' },
      ],
    },
  },
];

// ============ 辅助函数 ============

/**
 * 根据类型获取数据源信息
 */
export function getSourceTypeInfo(type: SourceType): SourceTypeInfo | undefined {
  return SOURCE_TYPES.find(s => s.type === type);
}

/**
 * 根据类型获取处理器信息
 */
export function getProcessorTypeInfo(type: ProcessorType): ProcessorTypeInfo | undefined {
  return PROCESSOR_TYPES.find(p => p.type === type);
}

/**
 * 根据类型获取目标连接器信息
 */
export function getSinkTypeInfo(type: SinkType): SinkTypeInfo | undefined {
  return SINK_TYPES.find(s => s.type === type);
}

/**
 * 将编辑器状态转换为 PipelineConfig
 */
export function editorStateToPipelineConfig(
  state: EditorState,
  pipelineId: string,
  pipelineName: string,
  description?: string
): PipelineConfig | null {
  const sourceNode = state.nodes.find(n => n.type === 'source');
  const sinkNode = state.nodes.find(n => n.type === 'sink');
  const processorNodes = state.nodes.filter(n => n.type === 'processor');

  if (!sourceNode || !sinkNode) {
    return null;
  }

  // 根据连接顺序排序处理器
  const sortedProcessors = sortProcessorsByConnection(processorNodes, state.connections, sourceNode.id, sinkNode.id);

  return {
    id: pipelineId,
    name: pipelineName,
    description,
    source: {
      type: sourceNode.subType as SourceType,
      config: sourceNode.config,
    },
    processors: sortedProcessors.map(p => ({
      type: p.subType as ProcessorType,
      config: p.config,
    })),
    sink: {
      type: sinkNode.subType as SinkType,
      config: sinkNode.config,
    },
  };
}

/**
 * 根据连接关系排序处理器节点
 */
function sortProcessorsByConnection(
  processors: EditorNode[],
  connections: EditorConnection[],
  sourceId: string,
  sinkId: string
): EditorNode[] {
  if (processors.length === 0) return [];

  const sorted: EditorNode[] = [];
  const remaining = new Set(processors.map(p => p.id));
  let currentId = sourceId;

  while (remaining.size > 0) {
    const nextConn = connections.find(c => c.fromNodeId === currentId && remaining.has(c.toNodeId));
    if (!nextConn) break;

    const nextNode = processors.find(p => p.id === nextConn.toNodeId);
    if (nextNode) {
      sorted.push(nextNode);
      remaining.delete(nextNode.id);
      currentId = nextNode.id;
    } else {
      break;
    }
  }

  return sorted;
}

/**
 * 将 PipelineConfig 转换为编辑器状态
 */
export function pipelineConfigToEditorState(config: PipelineConfig): EditorState {
  const nodes: EditorNode[] = [];
  const connections: EditorConnection[] = [];
  
  // 创建 Source 节点
  const sourceNode: EditorNode = {
    id: `source-${config.id}`,
    type: 'source',
    subType: config.source.type,
    name: getSourceTypeInfo(config.source.type)?.name || config.source.type,
    x: 100,
    y: 200,
    config: config.source.config,
    validated: true,
  };
  nodes.push(sourceNode);

  // 创建 Processor 节点
  let prevNodeId = sourceNode.id;
  config.processors.forEach((proc, index) => {
    const procNode: EditorNode = {
      id: `processor-${config.id}-${index}`,
      type: 'processor',
      subType: proc.type,
      name: getProcessorTypeInfo(proc.type)?.name || proc.type,
      x: 350 + index * 200,
      y: 200,
      config: proc.config,
      validated: true,
    };
    nodes.push(procNode);

    connections.push({
      id: `conn-${prevNodeId}-${procNode.id}`,
      fromNodeId: prevNodeId,
      toNodeId: procNode.id,
    });
    prevNodeId = procNode.id;
  });

  // 创建 Sink 节点
  const sinkNode: EditorNode = {
    id: `sink-${config.id}`,
    type: 'sink',
    subType: config.sink.type,
    name: getSinkTypeInfo(config.sink.type)?.name || config.sink.type,
    x: 350 + config.processors.length * 200,
    y: 200,
    config: config.sink.config,
    validated: true,
  };
  nodes.push(sinkNode);

  connections.push({
    id: `conn-${prevNodeId}-${sinkNode.id}`,
    fromNodeId: prevNodeId,
    toNodeId: sinkNode.id,
  });

  return {
    nodes,
    connections,
    selectedNodeId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

/**
 * 验证编辑器状态是否可以转换为有效的 Pipeline
 */
export function validateEditorState(state: EditorState): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查是否有且仅有一个 Source
  const sourceNodes = state.nodes.filter(n => n.type === 'source');
  if (sourceNodes.length === 0) {
    errors.push('缺少数据源节点');
  } else if (sourceNodes.length > 1) {
    errors.push('只能有一个数据源节点');
  }

  // 检查是否有且仅有一个 Sink
  const sinkNodes = state.nodes.filter(n => n.type === 'sink');
  if (sinkNodes.length === 0) {
    errors.push('缺少目标连接器节点');
  } else if (sinkNodes.length > 1) {
    errors.push('只能有一个目标连接器节点');
  }

  // 检查所有节点是否都已验证
  const invalidNodes = state.nodes.filter(n => !n.validated);
  if (invalidNodes.length > 0) {
    errors.push(`以下节点配置无效: ${invalidNodes.map(n => n.name).join(', ')}`);
  }

  // 检查连接是否完整（从 Source 到 Sink 有完整路径）
  if (sourceNodes.length === 1 && sinkNodes.length === 1) {
    const hasPath = checkConnectionPath(state.connections, sourceNodes[0].id, sinkNodes[0].id, state.nodes);
    if (!hasPath) {
      errors.push('数据源到目标连接器之间没有完整的连接路径');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 检查从 source 到 sink 是否有完整路径
 */
function checkConnectionPath(
  connections: EditorConnection[],
  sourceId: string,
  sinkId: string,
  nodes: EditorNode[]
): boolean {
  const visited = new Set<string>();
  const queue = [sourceId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sinkId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const outgoing = connections.filter(c => c.fromNodeId === current);
    for (const conn of outgoing) {
      if (!visited.has(conn.toNodeId)) {
        queue.push(conn.toNodeId);
      }
    }
  }

  return false;
}
