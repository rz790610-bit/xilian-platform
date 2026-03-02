/**
 * Pipeline 编排平台 — 前后端统一类型定义
 * 覆盖数据工程、机器学习、大模型应用三大领域
 * 支持 DAG（有向无环图）执行引擎
 *
 * @deprecated FIX-033: 通用类型（SeverityLevel, UnixTimestampMs 等）请从
 *   `@shared/contracts/v1` 导入。本文件仅保留 Pipeline 域专属类型。
 */

// ============ 管道状态 ============
export type PipelineStatus = 'draft' | 'active' | 'running' | 'paused' | 'stopped' | 'error' | 'archived';
export type PipelineCategory = 'data_engineering' | 'machine_learning' | 'llm_application' | 'multimodal' | 'realtime' | 'custom';
export type PipelineRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'completed';
export type TriggerType = 'manual' | 'schedule' | 'event' | 'api';

// ============ 节点大类 ============
export type EditorNodeType = 'source' | 'processor' | 'sink' | 'control';

// ============ 数据源类型（9个） ============
export type SourceType =
  | 'mysql' | 'clickhouse' | 'kafka' | 'redis' | 'minio'
  | 'http' | 'file_upload' | 'mqtt' | 'neo4j'
  | 'redis_stream' | 'video_stream' | 'audio_stream';

// ============ 处理器类型 ============
export type DataEngineeringProcessorType =
  | 'field_map' | 'filter' | 'transform' | 'aggregate'
  | 'data_clean' | 'data_join' | 'data_split' | 'schema_validate';

export type MLProcessorType =
  | 'feature_engineering' | 'model_inference' | 'model_evaluate' | 'anomaly_detect'
  | 'time_align' | 'multimodal_fusion' | 'modality_check' | 'model_register';

export type LLMProcessorType =
  | 'llm_call' | 'prompt_template' | 'embedding' | 'vector_search' | 'doc_parse';

export type ProcessorType = DataEngineeringProcessorType | MLProcessorType | LLMProcessorType;

// ============ 流程控制类型（6个） ============
export type ControlType = 'condition' | 'loop' | 'delay' | 'notify' | 'parallel' | 'parallel_join';

// ============ 目标类型（9个） ============
export type SinkType =
  | 'mysql_sink' | 'clickhouse_sink' | 'kafka_sink' | 'redis_sink' | 'minio_sink'
  | 'http_sink' | 'qdrant_sink' | 'neo4j_sink' | 'dashboard_sink'
  | 'redis_stream_sink' | 'prometheus_sink';

// ============ 节点子类型联合 ============
export type NodeSubType = SourceType | ProcessorType | ControlType | SinkType;

// ============ 领域分类 ============
export type NodeDomain = 'source' | 'data_engineering' | 'machine_learning' | 'llm' | 'control' | 'sink' | 'multimodal';

// ============ 领域颜色映射 ============
export const DOMAIN_COLORS: Record<NodeDomain, { bg: string; border: string; text: string; badge: string }> = {
  source:           { bg: 'bg-blue-500/10',   border: 'border-blue-500/40',   text: 'text-blue-400',   badge: 'bg-blue-500' },
  data_engineering: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  machine_learning: { bg: 'bg-violet-500/10',  border: 'border-violet-500/40',  text: 'text-violet-400',  badge: 'bg-violet-500' },
  llm:              { bg: 'bg-amber-500/10',   border: 'border-amber-500/40',   text: 'text-amber-400',   badge: 'bg-amber-500' },
  control:          { bg: 'bg-slate-500/10',   border: 'border-slate-500/40',   text: 'text-slate-400',   badge: 'bg-slate-500' },
  sink:             { bg: 'bg-rose-500/10',    border: 'border-rose-500/40',    text: 'text-rose-400',    badge: 'bg-rose-500' },
  multimodal:       { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/40',    text: 'text-cyan-400',    badge: 'bg-cyan-500' },
};

// ============ 配置 Schema 定义 ============
export interface ConfigFieldSchema {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array' | 'object' | 'code' | 'textarea' | 'password';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: { min?: number; max?: number; pattern?: string; message?: string };
  group?: string;
}

export interface NodeTypeInfo {
  type: NodeSubType;
  nodeType: EditorNodeType;
  domain: NodeDomain;
  name: string;
  description: string;
  icon: string;
  configFields: ConfigFieldSchema[];
  inputs?: number;
  outputs?: number;
}

// ============ 数据源节点定义（9个） ============
export const SOURCE_NODES: NodeTypeInfo[] = [
  {
    type: 'mysql', nodeType: 'source', domain: 'source',
    name: 'MySQL', description: '从 MySQL 关系型数据库查询数据', icon: '🐬',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'query', label: 'SQL 查询', type: 'code', required: true, placeholder: 'SELECT * FROM table WHERE ...' },
      { name: 'database', label: '数据库名', type: 'string', placeholder: '使用平台默认连接' },
      { name: 'pollInterval', label: '轮询间隔(ms)', type: 'number', default: 60000, description: '0 表示只执行一次' },
    ],
  },
  {
    type: 'clickhouse', nodeType: 'source', domain: 'source',
    name: 'ClickHouse', description: '从 ClickHouse 查询时序/分析数据', icon: '⚡',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'query', label: 'SQL 查询', type: 'code', required: true, placeholder: 'SELECT * FROM sensor_data WHERE ...' },
      { name: 'database', label: '数据库', type: 'string', default: 'default' },
    ],
  },
  {
    type: 'kafka', nodeType: 'source', domain: 'source',
    name: 'Kafka', description: '从 Kafka 主题消费实时消息流', icon: '📨',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'topic', label: '主题', type: 'string', required: true, placeholder: 'sensor-events' },
      { name: 'groupId', label: '消费组 ID', type: 'string', required: true, placeholder: 'pipeline-group' },
      { name: 'brokers', label: 'Broker 地址', type: 'string', default: 'localhost:9092' },
      { name: 'fromBeginning', label: '从头消费', type: 'boolean', default: false },
    ],
  },
  {
    type: 'redis', nodeType: 'source', domain: 'source',
    name: 'Redis', description: '从 Redis 读取缓存数据或订阅频道', icon: '💾',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'mode', label: '读取模式', type: 'select', required: true, options: [
        { value: 'get', label: 'GET 键值' }, { value: 'scan', label: 'SCAN 扫描' },
        { value: 'subscribe', label: 'PUB/SUB 订阅' }, { value: 'stream', label: 'Stream 消费' },
      ]},
      { name: 'keyPattern', label: '键/模式', type: 'string', required: true, placeholder: 'device:status:*' },
    ],
  },
  {
    type: 'minio', nodeType: 'source', domain: 'source',
    name: 'MinIO / S3', description: '从对象存储读取文件（CSV/JSON/Parquet）', icon: '📦',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'bucket', label: '存储桶', type: 'string', required: true, placeholder: 'data-lake' },
      { name: 'prefix', label: '文件前缀', type: 'string', placeholder: 'raw/2024/' },
      { name: 'fileType', label: '文件格式', type: 'select', default: 'json', options: [
        { value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' },
        { value: 'parquet', label: 'Parquet' }, { value: 'binary', label: '二进制' },
      ]},
    ],
  },
  {
    type: 'http', nodeType: 'source', domain: 'source',
    name: 'HTTP API', description: '从外部 REST API 拉取数据', icon: '🌐',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://api.example.com/data' },
      { name: 'method', label: '请求方法', type: 'select', default: 'GET', options: [
        { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
      ]},
      { name: 'headers', label: '请求头', type: 'object', placeholder: '{"Authorization": "Bearer xxx"}' },
      { name: 'dataPath', label: '数据路径', type: 'string', placeholder: 'data.items', description: '嵌套数据的 JSONPath' },
      { name: 'timeout', label: '超时(ms)', type: 'number', default: 30000 },
    ],
  },
  {
    type: 'file_upload', nodeType: 'source', domain: 'source',
    name: '文件导入', description: '导入 CSV / JSON / Excel 文件', icon: '📂',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'fileType', label: '文件类型', type: 'select', required: true, options: [
        { value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' },
        { value: 'excel', label: 'Excel' }, { value: 'parquet', label: 'Parquet' },
      ]},
      { name: 'encoding', label: '编码', type: 'select', default: 'utf-8', options: [
        { value: 'utf-8', label: 'UTF-8' }, { value: 'gbk', label: 'GBK' },
      ]},
      { name: 'delimiter', label: '分隔符', type: 'string', default: ',', description: '仅 CSV 有效' },
    ],
  },
  {
    type: 'mqtt', nodeType: 'source', domain: 'source',
    name: 'MQTT', description: '订阅 MQTT 主题，采集工业传感器数据', icon: '🔌',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'broker', label: 'Broker 地址', type: 'string', required: true, placeholder: 'mqtt://localhost:1883' },
      { name: 'topic', label: '订阅主题', type: 'string', required: true, placeholder: 'factory/+/sensor/#' },
      { name: 'qos', label: 'QoS', type: 'select', default: '1', options: [
        { value: '0', label: 'QoS 0 (至多一次)' }, { value: '1', label: 'QoS 1 (至少一次)' },
        { value: '2', label: 'QoS 2 (恰好一次)' },
      ]},
      { name: 'clientId', label: '客户端 ID', type: 'string', placeholder: '自动生成' },
    ],
  },
  {
    type: 'neo4j', nodeType: 'source', domain: 'source',
    name: 'Neo4j', description: '从图数据库查询关系和拓扑数据', icon: '🕸️',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'cypher', label: 'Cypher 查询', type: 'code', required: true, placeholder: 'MATCH (n:Device)-[r]->(m) RETURN n, r, m' },
      { name: 'database', label: '数据库', type: 'string', default: 'neo4j' },
    ],
  },
];

// ============ 数据工程处理器（8个） ============
export const DATA_ENGINEERING_NODES: NodeTypeInfo[] = [
  {
    type: 'field_map', nodeType: 'processor', domain: 'data_engineering',
    name: '字段映射', description: '重命名、重组、提取字段', icon: '🔀',
    configFields: [
      { name: 'mapping', label: '字段映射', type: 'object', required: true, placeholder: '{"newField": "oldField"}', description: '目标字段 → 源字段' },
      { name: 'dropUnmapped', label: '丢弃未映射字段', type: 'boolean', default: false },
    ],
  },
  {
    type: 'filter', nodeType: 'processor', domain: 'data_engineering',
    name: '过滤器', description: '根据条件筛选数据记录', icon: '🔍',
    configFields: [
      { name: 'condition.field', label: '字段名', type: 'string', required: true },
      { name: 'condition.operator', label: '操作符', type: 'select', required: true, options: [
        { value: 'eq', label: '等于 (=)' }, { value: 'ne', label: '不等于 (≠)' },
        { value: 'gt', label: '大于 (>)' }, { value: 'gte', label: '≥' },
        { value: 'lt', label: '小于 (<)' }, { value: 'lte', label: '≤' },
        { value: 'contains', label: '包含' }, { value: 'regex', label: '正则' },
        { value: 'in', label: '在列表中' }, { value: 'not_in', label: '不在列表中' },
        { value: 'is_null', label: '为空' }, { value: 'not_null', label: '不为空' },
      ]},
      { name: 'condition.value', label: '比较值', type: 'string' },
    ],
  },
  {
    type: 'transform', nodeType: 'processor', domain: 'data_engineering',
    name: '转换器', description: '自定义 JavaScript 数据转换', icon: '⚡',
    configFields: [
      { name: 'code', label: '转换函数', type: 'code', required: true, placeholder: '(record) => ({ ...record, newField: record.value * 2 })' },
    ],
  },
  {
    type: 'aggregate', nodeType: 'processor', domain: 'data_engineering',
    name: '聚合器', description: '分组聚合计算（SUM/AVG/MIN/MAX/COUNT）', icon: '📊',
    configFields: [
      { name: 'groupBy', label: '分组字段', type: 'string', placeholder: '留空则全局聚合' },
      { name: 'aggregations', label: '聚合配置', type: 'array', required: true, description: '[{field, operation, outputField}]' },
      { name: 'windowSize', label: '窗口大小', type: 'number', description: '滑动窗口记录数，0 表示全量' },
    ],
  },
  {
    type: 'data_clean', nodeType: 'processor', domain: 'data_engineering',
    name: '数据清洗', description: '去重、空值处理、类型转换、异常值剔除', icon: '🧹',
    configFields: [
      { name: 'dedup', label: '去重字段', type: 'string', placeholder: '按此字段去重，留空不去重' },
      { name: 'nullStrategy', label: '空值策略', type: 'select', default: 'skip', options: [
        { value: 'skip', label: '跳过空值行' }, { value: 'fill_default', label: '填充默认值' },
        { value: 'fill_prev', label: '前值填充' }, { value: 'fill_mean', label: '均值填充' },
      ]},
      { name: 'defaultValue', label: '默认填充值', type: 'string', description: '当策略为"填充默认值"时使用' },
      { name: 'typeConversions', label: '类型转换', type: 'object', placeholder: '{"price": "number", "date": "datetime"}' },
    ],
  },
  {
    type: 'data_join', nodeType: 'processor', domain: 'data_engineering',
    name: '数据合并', description: 'JOIN / UNION 合并多个数据源', icon: '🔗',
    inputs: 2, outputs: 1,
    configFields: [
      { name: 'joinType', label: '合并方式', type: 'select', required: true, options: [
        { value: 'inner', label: 'INNER JOIN' }, { value: 'left', label: 'LEFT JOIN' },
        { value: 'right', label: 'RIGHT JOIN' }, { value: 'full', label: 'FULL JOIN' },
        { value: 'union', label: 'UNION（纵向合并）' },
      ]},
      { name: 'leftKey', label: '左表关联键', type: 'string', required: true },
      { name: 'rightKey', label: '右表关联键', type: 'string', required: true },
    ],
  },
  {
    type: 'data_split', nodeType: 'processor', domain: 'data_engineering',
    name: '数据拆分', description: '按条件将数据分流到不同分支', icon: '✂️',
    inputs: 1, outputs: 2,
    configFields: [
      { name: 'splitField', label: '拆分字段', type: 'string', required: true },
      { name: 'splitCondition', label: '拆分条件', type: 'string', required: true, placeholder: 'value > 100' },
    ],
  },
  {
    type: 'schema_validate', nodeType: 'processor', domain: 'data_engineering',
    name: 'Schema 验证', description: '验证数据结构是否符合预期 Schema', icon: '📐',
    configFields: [
      { name: 'schema', label: 'JSON Schema', type: 'code', required: true, placeholder: '{"type": "object", "properties": {...}}' },
      { name: 'onInvalid', label: '无效数据处理', type: 'select', default: 'skip', options: [
        { value: 'skip', label: '跳过' }, { value: 'error', label: '报错停止' }, { value: 'tag', label: '标记后继续' },
      ]},
    ],
  },
];

// ============ 机器学习处理器（4个） ============
export const ML_NODES: NodeTypeInfo[] = [
  {
    type: 'feature_engineering', nodeType: 'processor', domain: 'machine_learning',
    name: '特征工程', description: '特征提取、归一化、编码、降维', icon: '🧮',
    configFields: [
      { name: 'operations', label: '特征操作', type: 'array', required: true, description: '[{field, operation, params}]' },
      { name: 'operationType', label: '操作类型', type: 'select', options: [
        { value: 'normalize', label: '归一化 (0-1)' }, { value: 'standardize', label: '标准化 (Z-score)' },
        { value: 'one_hot', label: 'One-Hot 编码' }, { value: 'label_encode', label: '标签编码' },
        { value: 'binning', label: '分箱' }, { value: 'log_transform', label: '对数变换' },
        { value: 'polynomial', label: '多项式特征' },
      ]},
    ],
  },
  {
    type: 'model_inference', nodeType: 'processor', domain: 'machine_learning',
    name: '模型推理', description: '调用 ML 模型进行预测/分类/回归', icon: '🤖',
    configFields: [
      { name: 'modelEndpoint', label: '模型服务地址', type: 'string', required: true, placeholder: 'http://localhost:8501/v1/models/my_model' },
      { name: 'modelType', label: '模型类型', type: 'select', required: true, options: [
        { value: 'tensorflow', label: 'TensorFlow Serving' }, { value: 'onnx', label: 'ONNX Runtime' },
        { value: 'sklearn', label: 'Scikit-learn' }, { value: 'custom', label: '自定义 HTTP' },
      ]},
      { name: 'inputFields', label: '输入特征字段', type: 'array', required: true },
      { name: 'outputField', label: '预测结果字段', type: 'string', default: 'prediction' },
    ],
  },
  {
    type: 'model_evaluate', nodeType: 'processor', domain: 'machine_learning',
    name: '模型评估', description: '计算准确率、召回率、F1、AUC 等指标', icon: '📈',
    configFields: [
      { name: 'actualField', label: '实际值字段', type: 'string', required: true },
      { name: 'predictedField', label: '预测值字段', type: 'string', required: true },
      { name: 'metrics', label: '评估指标', type: 'array', description: '["accuracy", "precision", "recall", "f1", "auc"]' },
      { name: 'taskType', label: '任务类型', type: 'select', default: 'classification', options: [
        { value: 'classification', label: '分类' }, { value: 'regression', label: '回归' },
      ]},
    ],
  },
  {
    type: 'anomaly_detect', nodeType: 'processor', domain: 'machine_learning',
    name: '异常检测', description: '基于统计/ML 的异常数据识别', icon: '🎯',
    configFields: [
      { name: 'method', label: '检测方法', type: 'select', required: true, options: [
        { value: 'zscore', label: 'Z-Score（标准差）' }, { value: 'iqr', label: 'IQR（四分位距）' },
        { value: 'isolation_forest', label: 'Isolation Forest' }, { value: 'moving_avg', label: '移动平均偏差' },
      ]},
      { name: 'targetField', label: '检测字段', type: 'string', required: true },
      { name: 'threshold', label: '阈值', type: 'number', default: 3 },
      { name: 'outputField', label: '异常标记字段', type: 'string', default: 'is_anomaly' },
    ],
  },
];

// ============ 大模型应用处理器（5个） ============
export const LLM_NODES: NodeTypeInfo[] = [
  {
    type: 'llm_call', nodeType: 'processor', domain: 'llm',
    name: 'LLM 调用', description: '调用大语言模型（Ollama / OpenAI / 自定义）', icon: '🧠',
    configFields: [
      { name: 'provider', label: '模型提供商', type: 'select', required: true, options: [
        { value: 'ollama', label: 'Ollama（本地）' }, { value: 'openai', label: 'OpenAI' },
        { value: 'custom', label: '自定义 API' },
      ]},
      { name: 'model', label: '模型名称', type: 'string', required: true, placeholder: 'llama3 / gpt-4o / qwen2.5' },
      { name: 'prompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个工业设备诊断专家...' },
      { name: 'inputField', label: '输入字段', type: 'string', required: true },
      { name: 'outputField', label: '输出字段', type: 'string', default: 'llm_response' },
      { name: 'temperature', label: '温度', type: 'number', default: 0.7 },
      { name: 'maxTokens', label: '最大 Token', type: 'number', default: 2048 },
      { name: 'endpoint', label: 'API 地址', type: 'string', placeholder: 'http://localhost:11434' },
    ],
  },
  {
    type: 'prompt_template', nodeType: 'processor', domain: 'llm',
    name: 'Prompt 模板', description: '可配置的提示词模板，支持变量替换', icon: '📝',
    configFields: [
      { name: 'template', label: '模板内容', type: 'textarea', required: true, placeholder: '请分析以下设备数据：\n设备编号: {{deviceCode}}\n振动值: {{vibration}}' },
      { name: 'outputField', label: '输出字段', type: 'string', default: 'formatted_prompt' },
    ],
  },
  {
    type: 'embedding', nodeType: 'processor', domain: 'llm',
    name: '向量化', description: '将文本/数据转为向量表示（Embedding）', icon: '🔢',
    configFields: [
      { name: 'provider', label: '向量化服务', type: 'select', required: true, options: [
        { value: 'ollama', label: 'Ollama Embedding' }, { value: 'openai', label: 'OpenAI Embedding' },
        { value: 'sentence_transformers', label: 'Sentence Transformers' },
      ]},
      { name: 'model', label: '模型', type: 'string', default: 'nomic-embed-text' },
      { name: 'inputField', label: '输入文本字段', type: 'string', required: true },
      { name: 'outputField', label: '向量输出字段', type: 'string', default: 'embedding' },
    ],
  },
  {
    type: 'vector_search', nodeType: 'processor', domain: 'llm',
    name: '向量检索', description: '从 Qdrant 向量数据库检索相似内容', icon: '🔎',
    configFields: [
      { name: 'collection', label: '集合名称', type: 'string', required: true, placeholder: 'knowledge_base' },
      { name: 'inputField', label: '查询向量字段', type: 'string', required: true },
      { name: 'topK', label: '返回数量', type: 'number', default: 5 },
      { name: 'scoreThreshold', label: '相似度阈值', type: 'number', default: 0.7 },
      { name: 'outputField', label: '结果输出字段', type: 'string', default: 'search_results' },
    ],
  },
  {
    type: 'doc_parse', nodeType: 'processor', domain: 'llm',
    name: '文档解析', description: '解析 PDF / Word / 图片（OCR）为结构化文本', icon: '📄',
    configFields: [
      { name: 'inputField', label: '文件路径/URL 字段', type: 'string', required: true },
      { name: 'parseType', label: '解析类型', type: 'select', required: true, options: [
        { value: 'pdf', label: 'PDF' }, { value: 'docx', label: 'Word' },
        { value: 'image_ocr', label: '图片 OCR' }, { value: 'auto', label: '自动检测' },
      ]},
      { name: 'chunkSize', label: '分块大小', type: 'number', default: 1000 },
      { name: 'chunkOverlap', label: '分块重叠', type: 'number', default: 200 },
      { name: 'outputField', label: '输出字段', type: 'string', default: 'parsed_text' },
    ],
  },
];

// ============ 流程控制节点（5个） ============
export const CONTROL_NODES: NodeTypeInfo[] = [
  {
    type: 'condition', nodeType: 'control', domain: 'control',
    name: '条件分支', description: 'IF / ELSE 条件判断，数据分流', icon: '❓',
    inputs: 1, outputs: 2,
    configFields: [
      { name: 'condition', label: '条件表达式', type: 'code', required: true, placeholder: 'record.temperature > 80' },
    ],
  },
  {
    type: 'loop', nodeType: 'control', domain: 'control',
    name: '循环', description: '对数据集中每条记录循环处理', icon: '🔄',
    configFields: [
      { name: 'maxIterations', label: '最大迭代次数', type: 'number', default: 1000 },
      { name: 'breakCondition', label: '终止条件', type: 'code', placeholder: 'record.status === "done"' },
    ],
  },
  {
    type: 'delay', nodeType: 'control', domain: 'control',
    name: '延时', description: '等待指定时间后继续执行', icon: '⏱️',
    configFields: [
      { name: 'delayMs', label: '延时(毫秒)', type: 'number', required: true, default: 1000 },
      { name: 'delayType', label: '延时类型', type: 'select', default: 'fixed', options: [
        { value: 'fixed', label: '固定延时' }, { value: 'random', label: '随机延时' },
      ]},
    ],
  },
  {
    type: 'notify', nodeType: 'control', domain: 'control',
    name: '通知', description: '发送邮件 / Webhook / 钉钉 / 飞书通知', icon: '📢',
    configFields: [
      { name: 'channel', label: '通知渠道', type: 'select', required: true, options: [
        { value: 'webhook', label: 'Webhook' }, { value: 'email', label: '邮件' },
        { value: 'dingtalk', label: '钉钉' }, { value: 'feishu', label: '飞书' },
        { value: 'wechat', label: '企业微信' },
      ]},
      { name: 'url', label: 'Webhook URL', type: 'string', placeholder: 'https://hooks.example.com/...' },
      { name: 'template', label: '消息模板', type: 'textarea', placeholder: '告警：设备 {{deviceCode}} 温度异常' },
    ],
  },
  {
    type: 'parallel', nodeType: 'control', domain: 'control',
    name: '并行分发 (Fork)', description: '将数据分发到多个并行分支执行', icon: '🔀',
    inputs: 1, outputs: 4,
    configFields: [
      { name: 'branches', label: '并行分支数', type: 'number', default: 2 },
      { name: 'strategy', label: '分发策略', type: 'select', default: 'broadcast', options: [
        { value: 'broadcast', label: '广播（每个分支收到全部数据）' },
        { value: 'round_robin', label: '轮询（按记录分配到各分支）' },
        { value: 'hash', label: '哈希（按字段值分配）' },
      ]},
      { name: 'hashField', label: '哈希字段', type: 'string', placeholder: '仅哈希策略时需要' },
    ],
  },
  {
    type: 'parallel_join', nodeType: 'control', domain: 'control',
    name: '并行汇聚 (Join)', description: '汇聚多个并行分支的结果', icon: '🔁',
    inputs: 4, outputs: 1,
    configFields: [
      { name: 'mergeStrategy', label: '合并策略', type: 'select', default: 'concat', options: [
        { value: 'concat', label: '拼接（合并所有记录）' },
        { value: 'zip', label: '拉链（按位置配对）' },
        { value: 'first', label: '取第一个完成的分支' },
      ]},
      { name: 'waitAll', label: '等待全部分支', type: 'boolean', default: true },
      { name: 'timeout', label: '超时(ms)', type: 'number', default: 300000 },
    ],
  },
];

// ============ 目标节点（9个） ============
export const SINK_NODES: NodeTypeInfo[] = [
  {
    type: 'mysql_sink', nodeType: 'sink', domain: 'sink',
    name: 'MySQL 写入', description: '将数据写入 MySQL 表', icon: '🐬',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'table', label: '目标表', type: 'string', required: true, placeholder: 'processed_data' },
      { name: 'mode', label: '写入模式', type: 'select', default: 'insert', options: [
        { value: 'insert', label: 'INSERT' }, { value: 'upsert', label: 'UPSERT' }, { value: 'replace', label: 'REPLACE' },
      ]},
      { name: 'batchSize', label: '批量大小', type: 'number', default: 100 },
    ],
  },
  {
    type: 'clickhouse_sink', nodeType: 'sink', domain: 'sink',
    name: 'ClickHouse 写入', description: '写入 ClickHouse 时序/分析表', icon: '⚡',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'table', label: '目标表', type: 'string', required: true, placeholder: 'sensor_readings' },
      { name: 'database', label: '数据库', type: 'string', default: 'default' },
      { name: 'batchSize', label: '批量大小', type: 'number', default: 1000 },
    ],
  },
  {
    type: 'kafka_sink', nodeType: 'sink', domain: 'sink',
    name: 'Kafka 发送', description: '将数据发送到 Kafka 主题', icon: '📨',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'topic', label: '目标主题', type: 'string', required: true, placeholder: 'processed-events' },
      { name: 'keyField', label: '消息 Key 字段', type: 'string', placeholder: '留空则无 Key' },
      { name: 'brokers', label: 'Broker 地址', type: 'string', default: 'localhost:9092' },
    ],
  },
  {
    type: 'redis_sink', nodeType: 'sink', domain: 'sink',
    name: 'Redis 写入', description: '写入 Redis 缓存', icon: '💾',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'keyPrefix', label: '键前缀', type: 'string', required: true, placeholder: 'pipeline:result:' },
      { name: 'keyField', label: '键值字段', type: 'string' },
      { name: 'ttlSeconds', label: '过期时间(秒)', type: 'number', placeholder: '0 表示不过期' },
      { name: 'dataType', label: '数据类型', type: 'select', default: 'string', options: [
        { value: 'string', label: 'String (JSON)' }, { value: 'hash', label: 'Hash' },
        { value: 'list', label: 'List' }, { value: 'stream', label: 'Stream' },
      ]},
    ],
  },
  {
    type: 'minio_sink', nodeType: 'sink', domain: 'sink',
    name: 'MinIO / S3 上传', description: '将数据/文件上传到对象存储', icon: '📦',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'bucket', label: '存储桶', type: 'string', required: true, placeholder: 'processed-data' },
      { name: 'pathTemplate', label: '路径模板', type: 'string', default: '{{date}}/{{id}}.json' },
      { name: 'format', label: '输出格式', type: 'select', default: 'json', options: [
        { value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }, { value: 'parquet', label: 'Parquet' },
      ]},
    ],
  },
  {
    type: 'http_sink', nodeType: 'sink', domain: 'sink',
    name: 'HTTP 推送', description: '将数据推送到外部 REST API', icon: '📤',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://api.example.com/receive' },
      { name: 'method', label: '请求方法', type: 'select', default: 'POST', options: [
        { value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' },
      ]},
      { name: 'headers', label: '请求头', type: 'object', placeholder: '{"Authorization": "Bearer xxx"}' },
      { name: 'batchMode', label: '批量发送', type: 'boolean', default: true },
    ],
  },
  {
    type: 'qdrant_sink', nodeType: 'sink', domain: 'sink',
    name: 'Qdrant 写入', description: '将向量数据写入 Qdrant 向量数据库', icon: '🧮',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'collection', label: '集合名称', type: 'string', required: true, placeholder: 'knowledge_vectors' },
      { name: 'vectorField', label: '向量字段', type: 'string', required: true, default: 'embedding' },
      { name: 'idField', label: 'ID 字段', type: 'string', placeholder: '自动生成 UUID' },
      { name: 'payloadFields', label: '附加数据字段', type: 'array' },
    ],
  },
  {
    type: 'neo4j_sink', nodeType: 'sink', domain: 'sink',
    name: 'Neo4j 写入', description: '将数据写入图数据库（创建节点/关系）', icon: '🕸️',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'cypher', label: 'Cypher 写入语句', type: 'code', required: true, placeholder: 'MERGE (n:Device {code: $code}) SET n.name = $name' },
      { name: 'paramMapping', label: '参数映射', type: 'object', placeholder: '{"code": "deviceCode"}' },
    ],
  },
  {
    type: 'dashboard_sink', nodeType: 'sink', domain: 'sink',
    name: 'Dashboard 输出', description: '将结果推送到实时监控面板（WebSocket）', icon: '📊',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'channel', label: 'WebSocket 频道', type: 'string', required: true, placeholder: 'pipeline-results' },
      { name: 'format', label: '输出格式', type: 'select', default: 'json', options: [
        { value: 'json', label: 'JSON' }, { value: 'metric', label: '指标格式' }, { value: 'chart', label: '图表数据' },
      ]},
    ],
  },
];

// ============ 多模态源节点（3个） ============
export const MULTIMODAL_SOURCE_NODES: NodeTypeInfo[] = [
  {
    type: 'redis_stream', nodeType: 'source', domain: 'source',
    name: 'Redis Stream', description: '从 Redis Stream 消费实时数据流（XREADGROUP）', icon: '⚡',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'streamKey', label: 'Stream Key', type: 'string', required: true, placeholder: 'pipeline:input:stream-1' },
      { name: 'groupName', label: '消费组', type: 'string', required: true, placeholder: 'pipeline-cg' },
      { name: 'consumerName', label: '消费者名', type: 'string', default: 'worker-1' },
      { name: 'batchSize', label: '批次大小', type: 'number', default: 100 },
      { name: 'blockMs', label: '阻塞等待(ms)', type: 'number', default: 5000 },
    ],
  },
  {
    type: 'video_stream', nodeType: 'source', domain: 'multimodal',
    name: '视频流', description: '接入 RTSP/HTTP 视频流，抽帧后送入管道', icon: '🎥',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'streamUrl', label: '视频流地址', type: 'string', required: true, placeholder: 'rtsp://camera.local:554/stream' },
      { name: 'frameRate', label: '抽帧率(fps)', type: 'number', default: 1, description: '每秒抽取帧数' },
      { name: 'resolution', label: '分辨率', type: 'select', default: '640x480', options: [
        { value: '320x240', label: '320x240' }, { value: '640x480', label: '640x480' },
        { value: '1280x720', label: '720p' }, { value: '1920x1080', label: '1080p' },
      ]},
      { name: 'outputFormat', label: '输出格式', type: 'select', default: 'base64', options: [
        { value: 'base64', label: 'Base64 图片' }, { value: 'url', label: '临时 URL' },
      ]},
    ],
  },
  {
    type: 'audio_stream', nodeType: 'source', domain: 'multimodal',
    name: '音频流', description: '接入音频流，支持 Whisper 语音转写', icon: '🎤',
    inputs: 0, outputs: 1,
    configFields: [
      { name: 'sourceType', label: '音频源类型', type: 'select', required: true, options: [
        { value: 'file', label: '音频文件' }, { value: 'stream', label: '实时音频流' },
        { value: 'microphone', label: '麦克风' },
      ]},
      { name: 'filePath', label: '文件路径/URL', type: 'string', placeholder: '/data/audio/recording.wav' },
      { name: 'chunkDurationMs', label: '分段时长(ms)', type: 'number', default: 30000 },
      { name: 'transcribe', label: '自动转写', type: 'boolean', default: true, description: '使用 Whisper 自动转写为文本' },
      { name: 'language', label: '语言', type: 'select', default: 'zh', options: [
        { value: 'zh', label: '中文' }, { value: 'en', label: 'English' }, { value: 'auto', label: '自动检测' },
      ]},
    ],
  },
];

// ============ 多模态融合处理器（4个） ============
export const MULTIMODAL_NODES: NodeTypeInfo[] = [
  {
    type: 'time_align', nodeType: 'processor', domain: 'multimodal',
    name: '时间对齐', description: '多模态数据时间窗口对齐（量化 + 缓存预热）', icon: '⏱️',
    inputs: 2, outputs: 1,
    configFields: [
      { name: 'windowMs', label: '时间窗口(ms)', type: 'number', required: true, default: 1000, description: '将不同模态数据对齐到同一时间窗口' },
      { name: 'alignStrategy', label: '对齐策略', type: 'select', default: 'nearest', options: [
        { value: 'nearest', label: '最近时间戳' }, { value: 'interpolate', label: '插值对齐' },
        { value: 'bucket', label: '时间桶量化' },
      ]},
      { name: 'timestampField', label: '时间戳字段', type: 'string', default: 'timestamp' },
      { name: 'cachePrewarm', label: '缓存预热', type: 'boolean', default: true, description: '使用 Redis Sorted Set 预加载时间窗口数据' },
      { name: 'maxDelayMs', label: '最大延迟容忍(ms)', type: 'number', default: 5000 },
    ],
  },
  {
    type: 'multimodal_fusion', nodeType: 'processor', domain: 'multimodal',
    name: '多模态融合', description: '早期/晚期/混合融合策略，支持特征层拼接和决策层集成', icon: '🧩',
    inputs: 3, outputs: 1,
    configFields: [
      { name: 'fusionStrategy', label: '融合策略', type: 'select', required: true, options: [
        { value: 'early', label: '早期融合（特征层拼接）' },
        { value: 'late', label: '晚期融合（决策层加权）' },
        { value: 'hybrid', label: '混合融合（注意力机制）' },
      ]},
      { name: 'weights', label: '模态权重', type: 'object', placeholder: '{"video": 0.4, "audio": 0.3, "iot": 0.3}', description: '晚期融合时各模态的决策权重' },
      { name: 'confidenceThreshold', label: '置信度阈值', type: 'number', default: 0.6 },
      { name: 'outputField', label: '融合结果字段', type: 'string', default: 'fused_result' },
    ],
  },
  {
    type: 'modality_check', nodeType: 'processor', domain: 'multimodal',
    name: '模态检查', description: '检测模态缺失并执行降级策略', icon: '🛡️',
    inputs: 1, outputs: 2,
    configFields: [
      { name: 'requiredModalities', label: '必需模态', type: 'array', required: true, description: '["video", "audio", "iot"]' },
      { name: 'degradeStrategy', label: '降级策略', type: 'select', default: 'skip_missing', options: [
        { value: 'skip_missing', label: '跳过缺失模态' },
        { value: 'cache_fill', label: '缓存回填（用最近有效数据）' },
        { value: 'degrade_output', label: '降级输出（标记置信度降低）' },
        { value: 'abort', label: '中止执行' },
      ]},
      { name: 'cacheTtlMs', label: '缓存有效期(ms)', type: 'number', default: 60000, description: '缓存回填策略的数据有效期' },
      { name: 'minModalities', label: '最少模态数', type: 'number', default: 1, description: '低于此数则中止' },
    ],
  },
  {
    type: 'model_register', nodeType: 'processor', domain: 'machine_learning',
    name: '模型注册', description: '将训练完成的模型注册到平台模型仓库', icon: '📦',
    configFields: [
      { name: 'modelName', label: '模型名称', type: 'string', required: true },
      { name: 'modelVersion', label: '版本', type: 'string', default: 'v1.0' },
      { name: 'modelPath', label: '模型文件路径', type: 'string', required: true },
      { name: 'framework', label: '框架', type: 'select', default: 'onnx', options: [
        { value: 'onnx', label: 'ONNX' }, { value: 'tensorflow', label: 'TensorFlow' },
        { value: 'pytorch', label: 'PyTorch' }, { value: 'sklearn', label: 'Scikit-learn' },
      ]},
      { name: 'metrics', label: '模型指标', type: 'object', placeholder: '{"accuracy": 0.95, "f1": 0.92}' },
    ],
  },
];

// ============ 新增目标节点（2个） ============
export const EXTRA_SINK_NODES: NodeTypeInfo[] = [
  {
    type: 'redis_stream_sink', nodeType: 'sink', domain: 'sink',
    name: 'Redis Stream 写入', description: '将数据写入 Redis Stream（XADD），支持管道级联', icon: '⚡',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'streamKey', label: 'Stream Key', type: 'string', required: true, placeholder: 'pipeline:output:stream-1' },
      { name: 'maxLen', label: '最大长度', type: 'number', default: 10000, description: 'MAXLEN 截断策略' },
    ],
  },
  {
    type: 'prometheus_sink', nodeType: 'sink', domain: 'sink',
    name: 'Prometheus 指标', description: '将管道结果暴露为 Prometheus 指标', icon: '📊',
    inputs: 1, outputs: 0,
    configFields: [
      { name: 'metricName', label: '指标名称', type: 'string', required: true, placeholder: 'pipeline_output_value' },
      { name: 'metricType', label: '指标类型', type: 'select', default: 'gauge', options: [
        { value: 'counter', label: 'Counter' }, { value: 'gauge', label: 'Gauge' },
        { value: 'histogram', label: 'Histogram' },
      ]},
      { name: 'labels', label: '标签字段', type: 'object', placeholder: '{"device": "deviceCode", "sensor": "sensorType"}' },
      { name: 'valueField', label: '值字段', type: 'string', required: true },
    ],
  },
];

// ============ 所有节点汇总 ============
export const ALL_NODE_TYPES: NodeTypeInfo[] = [
  ...SOURCE_NODES, ...MULTIMODAL_SOURCE_NODES,
  ...DATA_ENGINEERING_NODES, ...ML_NODES, ...MULTIMODAL_NODES,
  ...LLM_NODES, ...CONTROL_NODES,
  ...SINK_NODES, ...EXTRA_SINK_NODES,
];

// ============ 辅助函数 ============
export function getNodeTypeInfo(subType: NodeSubType): NodeTypeInfo | undefined {
  return ALL_NODE_TYPES.find(n => n.type === subType);
}

export function getNodesByDomain(domain: NodeDomain): NodeTypeInfo[] {
  return ALL_NODE_TYPES.filter(n => n.domain === domain);
}

export function getNodeDomain(subType: NodeSubType): NodeDomain {
  return getNodeTypeInfo(subType)?.domain || 'data_engineering';
}

// ============ 可视化编辑器节点 ============
export interface EditorNode {
  id: string;
  type: EditorNodeType;
  subType: NodeSubType;
  domain: NodeDomain;
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  validated: boolean;
  errors?: string[];
  inputs?: number;
  outputs?: number;
}

export interface EditorConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: number;
  toPort: number;
}

export interface EditorState {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  selectedConnectionId?: string | null;
  zoom: number;
  panX: number;
  panY: number;
}

// ============ Pipeline 配置（DAG 版） ============
export interface PipelineDAGConfig {
  id: string;
  name: string;
  description?: string;
  category: PipelineCategory;
  nodes: Array<{
    id: string;
    type: EditorNodeType;
    subType: NodeSubType;
    config: Record<string, unknown>;
  }>;
  connections: Array<{
    fromNodeId: string;
    toNodeId: string;
    fromPort: number;
    toPort: number;
  }>;
  schedule?: ScheduleConfig;
  retryPolicy?: RetryPolicy;
  variables?: Record<string, string>;
}

// ============ 调度配置 ============
export interface ScheduleConfig {
  type: 'interval' | 'cron' | 'event';
  value: string | number;
  timezone?: string;
}

// ============ 重试策略 ============
export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier?: number;
}

// ============ Pipeline 运行时指标 ============
export interface PipelineMetrics {
  totalRecordsProcessed: number;
  totalErrors: number;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  averageProcessingTimeMs: number;
  nodeMetrics?: Record<string, {
    processedCount: number;
    errorCount: number;
    avgTimeMs: number;
  }>;
}

// ============ Pipeline 状态响应 ============
export interface PipelineStatusResponse {
  id: string;
  name: string;
  description?: string;
  category: PipelineCategory;
  status: PipelineStatus;
  metrics: PipelineMetrics;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============ Pipeline 运行记录 ============
export interface PipelineRunRecord {
  id: string;
  pipelineId: string;
  status: PipelineRunStatus;
  triggerType: TriggerType;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  recordsProcessed: number;
  errorsCount: number;
  totalRecordsIn?: number;
  totalRecordsOut?: number;
  errorCount?: number;
  nodeResults?: Record<string, {
    status: 'success' | 'failed' | 'skipped';
    recordsIn: number;
    recordsOut: number;
    durationMs: number;
    error?: string;
  }>;
  lineageData?: Array<{
    nodeId: string;
    inputs: Array<{ fromNodeId: string; recordCount: number }>;
    outputs: number;
    transformRule?: string;
  }>;
  errorMessage?: string;
}

// ============ Pipeline 模板 ============
export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: PipelineCategory;
  icon: string;
  tags: string[];
  dagConfig: PipelineDAGConfig;
  editorState: EditorState;
  usageCount: number;
  isBuiltin: boolean;
}

// ============ 旧版兼容：PipelineConfig（线性模式） ============
export interface PipelineConfig {
  id: string;
  name: string;
  description?: string;
  source: { type: SourceType; config: Record<string, unknown> };
  processors: Array<{ type: ProcessorType; config: Record<string, unknown> }>;
  sink: { type: SinkType; config: Record<string, unknown> };
  schedule?: ScheduleConfig;
  batchSize?: number;
  retryPolicy?: RetryPolicy;
}

export interface PipelineListItem {
  id: string;
  name: string;
  description?: string;
  status: PipelineStatus;
  category: PipelineCategory;
  metrics: PipelineMetrics;
  config?: PipelineDAGConfig;
  createdAt?: string;
  updatedAt?: string;
}

// ============ 编辑器状态 ↔ DAG 配置转换 ============
export function editorStateToDAGConfig(
  state: EditorState, pipelineId: string, pipelineName: string,
  description?: string, category: PipelineCategory = 'custom'
): PipelineDAGConfig | null {
  if (state.nodes.length === 0) return null;
  return {
    id: pipelineId, name: pipelineName, description, category,
    nodes: state.nodes.map(n => ({ id: n.id, type: n.type, subType: n.subType, config: n.config })),
    connections: state.connections.map(c => ({
      fromNodeId: c.fromNodeId, toNodeId: c.toNodeId, fromPort: c.fromPort, toPort: c.toPort,
    })),
  };
}

export function dagConfigToEditorState(config: PipelineDAGConfig): EditorState {
  const nodes: EditorNode[] = config.nodes.map((n, i) => {
    const info = getNodeTypeInfo(n.subType);
    return {
      id: n.id, type: n.type as EditorNodeType, subType: n.subType as NodeSubType,
      domain: info?.domain || 'data_engineering', name: info?.name || n.subType,
      x: 100 + (i % 4) * 250, y: 100 + Math.floor(i / 4) * 200,
      config: n.config, validated: true, inputs: info?.inputs, outputs: info?.outputs,
    };
  });
  return {
    nodes,
    connections: config.connections.map((c, i) => ({
      id: `conn-${i}`, fromNodeId: c.fromNodeId, toNodeId: c.toNodeId,
      fromPort: c.fromPort, toPort: c.toPort,
    })),
    selectedNodeId: null, zoom: 1, panX: 0, panY: 0,
  };
}

// ============ 旧版兼容转换 ============
export function editorStateToPipelineConfig(
  state: EditorState, pipelineId: string, pipelineName: string, description?: string
): PipelineConfig | null {
  const sourceNode = state.nodes.find(n => n.type === 'source');
  const sinkNode = state.nodes.find(n => n.type === 'sink');
  const processorNodes = state.nodes.filter(n => n.type === 'processor');
  if (!sourceNode || !sinkNode) return null;
  return {
    id: pipelineId, name: pipelineName, description,
    source: { type: sourceNode.subType as SourceType, config: sourceNode.config },
    processors: processorNodes.map(p => ({ type: p.subType as ProcessorType, config: p.config })),
    sink: { type: sinkNode.subType as SinkType, config: sinkNode.config },
  };
}

// ============ 验证编辑器状态 ============
export function validateEditorState(state: EditorState): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (state.nodes.length === 0) { errors.push('画布为空，请添加至少一个节点'); return { valid: false, errors }; }
  const sources = state.nodes.filter(n => n.type === 'source');
  const sinks = state.nodes.filter(n => n.type === 'sink');
  if (sources.length === 0) errors.push('缺少数据源节点');
  if (sinks.length === 0) errors.push('缺少目标输出节点');
  const invalid = state.nodes.filter(n => !n.validated);
  if (invalid.length > 0) errors.push(`以下节点配置无效: ${invalid.map(n => n.name).join(', ')}`);
  const connected = new Set<string>();
  state.connections.forEach(c => { connected.add(c.fromNodeId); connected.add(c.toNodeId); });
  const isolated = state.nodes.filter(n => !connected.has(n.id) && state.nodes.length > 1);
  if (isolated.length > 0) errors.push(`以下节点未连接: ${isolated.map(n => n.name).join(', ')}`);
  if (sources.length > 0 && sinks.length > 0) {
    const reachable = new Set<string>();
    const queue = sources.map(n => n.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      state.connections.filter(c => c.fromNodeId === cur).forEach(c => queue.push(c.toNodeId));
    }
    const unreachable = sinks.filter(n => !reachable.has(n.id));
    if (unreachable.length > 0) errors.push(`以下目标节点无法从数据源到达: ${unreachable.map(n => n.name).join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

// ============ DAG 拓扑排序 ============
export function topologicalSort(nodes: EditorNode[], connections: EditorConnection[]): EditorNode[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach(n => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  connections.forEach(c => {
    adj.get(c.fromNodeId)?.push(c.toNodeId);
    inDegree.set(c.toNodeId, (inDegree.get(c.toNodeId) || 0) + 1);
  });
  const queue: string[] = [];
  inDegree.forEach((d, id) => { if (d === 0) queue.push(id); });
  const sorted: EditorNode[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const node = nodes.find(n => n.id === cur);
    if (node) sorted.push(node);
    adj.get(cur)?.forEach(nb => {
      const nd = (inDegree.get(nb) || 0) - 1;
      inDegree.set(nb, nd);
      if (nd === 0) queue.push(nb);
    });
  }
  return sorted.length === nodes.length ? sorted : null;
}

// 兼容别名
export const SOURCE_TYPES = SOURCE_NODES;
export const PROCESSOR_TYPES = [...DATA_ENGINEERING_NODES, ...ML_NODES, ...LLM_NODES];
export const SINK_TYPES = SINK_NODES;
