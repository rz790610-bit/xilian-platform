/**
 * 知识图谱编排器 — 共享类型定义
 * 定义节点类型、关系类型、场景模板等
 */

// ============ 节点大类 ============
export type KGNodeCategory = 'equipment' | 'fault' | 'diagnosis' | 'solution' | 'data' | 'mechanism';

// ============ 节点子类型 ============
export type EquipmentSubType = 'device' | 'component' | 'sensor' | 'berth';
export type FaultSubType = 'fault_mode' | 'symptom' | 'anomaly_pattern';
export type DiagnosisSubType = 'diagnosis_rule' | 'decision_node' | 'inference_engine' | 'feature_extraction';
export type SolutionSubType = 'repair' | 'emergency' | 'prevention';
export type DataSubType = 'historical_data' | 'realtime_data' | 'knowledge_base';
export type MechanismSubType = 'physical_model' | 'degradation_model' | 'threshold_model';

export type KGNodeSubType =
  | EquipmentSubType
  | FaultSubType
  | DiagnosisSubType
  | SolutionSubType
  | DataSubType
  | MechanismSubType;

// ============ 关系类型 ============
export type KGRelationType =
  | 'HAS_PART'
  | 'HAS_SENSOR'
  | 'CAUSES'
  | 'MANIFESTS'
  | 'DIAGNOSED_BY'
  | 'RESOLVED_BY'
  | 'AFFECTS'
  | 'SIMILAR_TO'
  | 'DEGRADES_TO'
  | 'TRIGGERS'
  | 'FEEDS'
  | 'REFERENCES';

// ============ 节点类型信息（组件面板用） ============
export interface KGNodeTypeInfo {
  category: KGNodeCategory;
  subType: KGNodeSubType;
  label: string;
  description: string;
  icon: string;
  color: string;
  /** 该节点类型可配置的参数字段 */
  configSchema: KGConfigField[];
  /** 可接入的关系类型（作为source） */
  allowedOutRelations: KGRelationType[];
  /** 可接入的关系类型（作为target） */
  allowedInRelations: KGRelationType[];
}

export interface KGConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'string_list';
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  placeholder?: string;
  description?: string;
}

// ============ 关系类型信息 ============
export interface KGRelationTypeInfo {
  type: KGRelationType;
  label: string;
  description: string;
  color: string;
  /** 是否有方向 */
  directed: boolean;
  /** 允许的source节点类型 */
  allowedSources: KGNodeCategory[];
  /** 允许的target节点类型 */
  allowedTargets: KGNodeCategory[];
}

// ============ 编辑器中的节点实例 ============
export interface KGEditorNode {
  nodeId: string;
  category: KGNodeCategory;
  subType: KGNodeSubType;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  nodeStatus: 'normal' | 'pending_confirm' | 'deprecated';
  /** 运行时统计 */
  hitCount?: number;
  accuracy?: number;
}

// ============ 编辑器中的关系实例 ============
export interface KGEditorEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: KGRelationType;
  label?: string;
  weight: number;
  config?: Record<string, unknown>;
  /** 运行时统计 */
  pathAccuracy?: number;
  hitCount?: number;
}

// ============ 图谱定义 ============
export interface KGGraphDefinition {
  graphId: string;
  name: string;
  description?: string;
  scenario: KGScenario;
  version: number;
  status: 'draft' | 'active' | 'archived' | 'evolving';
  nodes: KGEditorNode[];
  edges: KGEditorEdge[];
  viewportConfig?: { zoom: number; panX: number; panY: number };
  tags?: string[];
}

export type KGScenario =
  | 'vibration_diagnosis'
  | 'degradation_prediction'
  | 'fault_propagation'
  | 'multimodal_fusion'
  | 'fleet_learning'
  | 'custom';

// ============ 场景模板 ============
export interface KGTemplate {
  templateId: string;
  name: string;
  description: string;
  scenario: KGScenario;
  icon: string;
  tags: string[];
  /** 模板构建函数返回的节点和边 */
  nodes: KGEditorNode[];
  edges: KGEditorEdge[];
}

// ============ 诊断运行 ============
export interface KGDiagnosisInput {
  graphId: string;
  /** 输入数据：传感器读数、设备ID等 */
  inputData: Record<string, unknown>;
  /** 起始节点（从哪个节点开始推理） */
  startNodeId?: string;
  /** 最大推理深度 */
  maxDepth?: number;
}

export interface KGDiagnosisResult {
  runId: string;
  conclusion: string;
  confidence: number;
  faultCodes: string[];
  severity: 'info' | 'warning' | 'error' | 'critical';
  recommendedActions: string[];
  /** 推理路径 */
  paths: KGInferencePath[];
  durationMs: number;
}

export interface KGInferencePath {
  pathIndex: number;
  nodeSequence: string[];
  edgeSequence: string[];
  confidence: number;
  conclusion: string;
  isSelected: boolean;
}

// ============ 自进化 ============
export interface KGEvolutionEvent {
  evolutionType: 'accuracy_update' | 'new_pattern' | 'fleet_merge' | 'weight_adjust' | 'node_deprecate';
  description: string;
  changes: {
    addedNodes?: Array<{ nodeId: string; label: string; reason: string }>;
    addedEdges?: Array<{ edgeId: string; label: string; reason: string }>;
    updatedWeights?: Array<{ edgeId: string; oldWeight: number; newWeight: number }>;
    deprecatedNodes?: Array<{ nodeId: string; reason: string }>;
    accuracyDelta?: number;
  };
  triggeredBy: 'system' | 'diagnosis_feedback' | 'fleet_sync' | 'manual';
  sourceDeviceCount?: number;
}

// ============ 节点类型注册表 ============

const EQUIPMENT_NODES: KGNodeTypeInfo[] = [
  {
    category: 'equipment', subType: 'device',
    label: '设备', description: '物理设备（起重机、传送带、船舶等）',
    icon: '🏗️', color: '#3B82F6',
    configSchema: [
      { key: 'model', label: '型号', type: 'string' },
      { key: 'manufacturer', label: '制造商', type: 'string' },
      { key: 'location', label: '位置', type: 'string' },
      { key: 'statusThresholds', label: '状态阈值', type: 'json', description: '各指标的正常/异常阈值' },
    ],
    allowedOutRelations: ['HAS_PART', 'HAS_SENSOR', 'AFFECTS'],
    allowedInRelations: ['AFFECTS', 'SIMILAR_TO'],
  },
  {
    category: 'equipment', subType: 'component',
    label: '组件', description: '设备组件（电机、轴承、齿轮箱等）',
    icon: '⚙️', color: '#6366F1',
    configSchema: [
      { key: 'partNumber', label: '部件号', type: 'string' },
      { key: 'lifespan', label: '设计寿命(小时)', type: 'number' },
      { key: 'specifications', label: '规格参数', type: 'json' },
    ],
    allowedOutRelations: ['HAS_SENSOR', 'CAUSES', 'DEGRADES_TO'],
    allowedInRelations: ['HAS_PART', 'AFFECTS'],
  },
  {
    category: 'equipment', subType: 'sensor',
    label: '传感器', description: '振动、温度、压力等传感器',
    icon: '📡', color: '#06B6D4',
    configSchema: [
      { key: 'sensorType', label: '传感器类型', type: 'select', options: [
        { label: '振动', value: 'vibration' }, { label: '温度', value: 'temperature' },
        { label: '压力', value: 'pressure' }, { label: '电流', value: 'current' },
        { label: '转速', value: 'rpm' }, { label: '位移', value: 'displacement' },
      ]},
      { key: 'samplingRate', label: '采样率(Hz)', type: 'number' },
      { key: 'range', label: '量程', type: 'string' },
      { key: 'alarmThreshold', label: '报警阈值', type: 'number' },
    ],
    allowedOutRelations: ['FEEDS'],
    allowedInRelations: ['HAS_SENSOR'],
  },
  {
    category: 'equipment', subType: 'berth',
    label: '泊位', description: '码头泊位',
    icon: '🚢', color: '#0EA5E9',
    configSchema: [
      { key: 'terminal', label: '所属码头', type: 'string' },
      { key: 'length', label: '长度(m)', type: 'number' },
      { key: 'depth', label: '水深(m)', type: 'number' },
      { key: 'maxVesselSize', label: '最大船型(DWT)', type: 'number' },
    ],
    allowedOutRelations: ['HAS_PART', 'AFFECTS'],
    allowedInRelations: ['AFFECTS'],
  },
];

const FAULT_NODES: KGNodeTypeInfo[] = [
  {
    category: 'fault', subType: 'fault_mode',
    label: '故障模式', description: '轴承磨损、电机过热等故障类型',
    icon: '⚠️', color: '#EF4444',
    configSchema: [
      { key: 'faultCode', label: '故障码', type: 'string', required: true },
      { key: 'severity', label: '严重等级', type: 'select', options: [
        { label: '信息', value: 'info' }, { label: '警告', value: 'warning' },
        { label: '错误', value: 'error' }, { label: '严重', value: 'critical' },
      ]},
      { key: 'symptoms', label: '症状列表', type: 'string_list' },
      { key: 'rootCause', label: '根因', type: 'string' },
    ],
    allowedOutRelations: ['MANIFESTS', 'AFFECTS', 'SIMILAR_TO', 'DEGRADES_TO'],
    allowedInRelations: ['CAUSES', 'DIAGNOSED_BY', 'RESOLVED_BY'],
  },
  {
    category: 'fault', subType: 'symptom',
    label: '症状', description: '异常振动、温度升高等可观测症状',
    icon: '🔍', color: '#F97316',
    configSchema: [
      { key: 'featureFrequency', label: '特征频率(Hz)', type: 'number' },
      { key: 'thresholdRange', label: '阈值范围', type: 'string', placeholder: '如: 0.5-2.0 mm/s' },
      { key: 'duration', label: '持续时间要求(s)', type: 'number' },
    ],
    allowedOutRelations: ['DIAGNOSED_BY', 'TRIGGERS'],
    allowedInRelations: ['MANIFESTS', 'FEEDS'],
  },
  {
    category: 'fault', subType: 'anomaly_pattern',
    label: '异常模式', description: '频谱异常、趋势偏移等检测到的模式',
    icon: '📊', color: '#F59E0B',
    configSchema: [
      { key: 'algorithm', label: '检测算法', type: 'select', options: [
        { label: 'FFT频谱分析', value: 'fft' }, { label: '包络分析', value: 'envelope' },
        { label: '趋势分析', value: 'trend' }, { label: '统计异常', value: 'statistical' },
        { label: 'AI模型', value: 'ai_model' },
      ]},
      { key: 'confidenceThreshold', label: '置信阈值', type: 'number' },
    ],
    allowedOutRelations: ['CAUSES', 'TRIGGERS'],
    allowedInRelations: ['FEEDS'],
  },
];

const DIAGNOSIS_NODES: KGNodeTypeInfo[] = [
  {
    category: 'diagnosis', subType: 'diagnosis_rule',
    label: '诊断规则', description: 'IF-THEN 条件规则',
    icon: '📋', color: '#8B5CF6',
    configSchema: [
      { key: 'condition', label: '条件表达式', type: 'string', required: true, placeholder: 'vibration > 2.0 AND temperature > 80' },
      { key: 'action', label: '诊断结论', type: 'string', required: true },
      { key: 'priority', label: '优先级', type: 'number', defaultValue: 5 },
      { key: 'confidence', label: '规则置信度', type: 'number', defaultValue: 0.8 },
    ],
    allowedOutRelations: ['RESOLVED_BY', 'TRIGGERS'],
    allowedInRelations: ['DIAGNOSED_BY'],
  },
  {
    category: 'diagnosis', subType: 'decision_node',
    label: '决策节点', description: '分支判断节点',
    icon: '🔀', color: '#A855F7',
    configSchema: [
      { key: 'conditionField', label: '判断字段', type: 'string', required: true },
      { key: 'operator', label: '运算符', type: 'select', options: [
        { label: '大于', value: 'gt' }, { label: '小于', value: 'lt' },
        { label: '等于', value: 'eq' }, { label: '范围内', value: 'between' },
      ]},
      { key: 'threshold', label: '阈值', type: 'number' },
      { key: 'branches', label: '分支配置', type: 'json' },
    ],
    allowedOutRelations: ['CAUSES', 'TRIGGERS', 'RESOLVED_BY'],
    allowedInRelations: ['DIAGNOSED_BY', 'FEEDS'],
  },
  {
    category: 'diagnosis', subType: 'inference_engine',
    label: '推理引擎', description: 'GNN/LLM 智能推理',
    icon: '🧠', color: '#7C3AED',
    configSchema: [
      { key: 'engineType', label: '引擎类型', type: 'select', options: [
        { label: 'GNN图神经网络', value: 'gnn' }, { label: 'LLM大语言模型', value: 'llm' },
        { label: '贝叶斯网络', value: 'bayesian' }, { label: '规则引擎', value: 'rule_engine' },
      ]},
      { key: 'maxHops', label: '最大推理跳数', type: 'number', defaultValue: 3 },
      { key: 'confidenceThreshold', label: '置信阈值', type: 'number', defaultValue: 0.6 },
      { key: 'modelId', label: '关联模型ID', type: 'string' },
    ],
    allowedOutRelations: ['CAUSES', 'RESOLVED_BY'],
    allowedInRelations: ['FEEDS', 'REFERENCES'],
  },
  {
    category: 'diagnosis', subType: 'feature_extraction',
    label: '特征提取', description: '从原始数据提取诊断特征',
    icon: '🔬', color: '#6D28D9',
    configSchema: [
      { key: 'method', label: '提取方法', type: 'select', options: [
        { label: 'FFT频谱', value: 'fft' }, { label: '包络分析', value: 'envelope' },
        { label: '统计特征', value: 'statistical' }, { label: '小波变换', value: 'wavelet' },
        { label: '倒频谱', value: 'cepstrum' },
      ]},
      { key: 'windowSize', label: '窗口大小', type: 'number', defaultValue: 1024 },
      { key: 'outputFeatures', label: '输出特征', type: 'string_list' },
    ],
    allowedOutRelations: ['FEEDS'],
    allowedInRelations: ['FEEDS'],
  },
];

const SOLUTION_NODES: KGNodeTypeInfo[] = [
  {
    category: 'solution', subType: 'repair',
    label: '维修方案', description: '具体维修步骤和所需资源',
    icon: '🔧', color: '#10B981',
    configSchema: [
      { key: 'steps', label: '维修步骤', type: 'string_list', required: true },
      { key: 'requiredParts', label: '所需备件', type: 'string_list' },
      { key: 'estimatedTime', label: '预估时间(分钟)', type: 'number' },
      { key: 'successRate', label: '历史成功率', type: 'number' },
      { key: 'cost', label: '预估费用(元)', type: 'number' },
    ],
    allowedOutRelations: [],
    allowedInRelations: ['RESOLVED_BY'],
  },
  {
    category: 'solution', subType: 'emergency',
    label: '应急措施', description: '紧急处置动作',
    icon: '🚨', color: '#EF4444',
    configSchema: [
      { key: 'actionType', label: '动作类型', type: 'select', options: [
        { label: '紧急停机', value: 'shutdown' }, { label: '降速运行', value: 'slowdown' },
        { label: '发送报警', value: 'alarm' }, { label: '切换备用', value: 'switchover' },
      ]},
      { key: 'executionCondition', label: '执行条件', type: 'string' },
      { key: 'autoExecute', label: '自动执行', type: 'boolean', defaultValue: false },
    ],
    allowedOutRelations: [],
    allowedInRelations: ['TRIGGERS', 'RESOLVED_BY'],
  },
  {
    category: 'solution', subType: 'prevention',
    label: '预防策略', description: '预防性维护计划',
    icon: '🛡️', color: '#059669',
    configSchema: [
      { key: 'period', label: '维护周期(天)', type: 'number' },
      { key: 'checkItems', label: '检查项', type: 'string_list' },
      { key: 'triggerCondition', label: '触发条件', type: 'string', placeholder: '如: 运行时间 > 2000h' },
    ],
    allowedOutRelations: [],
    allowedInRelations: ['RESOLVED_BY'],
  },
];

const DATA_NODES: KGNodeTypeInfo[] = [
  {
    category: 'data', subType: 'historical_data',
    label: '历史数据', description: '历史故障记录和运行数据',
    icon: '📁', color: '#64748B',
    configSchema: [
      { key: 'dataSource', label: '数据源', type: 'select', options: [
        { label: 'ClickHouse', value: 'clickhouse' }, { label: 'MySQL', value: 'mysql' },
        { label: '文件导入', value: 'file' },
      ]},
      { key: 'timeRange', label: '时间范围', type: 'string', placeholder: '如: 最近1年' },
      { key: 'aggregation', label: '聚合方式', type: 'select', options: [
        { label: '原始', value: 'raw' }, { label: '小时均值', value: 'hourly_avg' },
        { label: '日均值', value: 'daily_avg' },
      ]},
    ],
    allowedOutRelations: ['FEEDS', 'REFERENCES'],
    allowedInRelations: [],
  },
  {
    category: 'data', subType: 'realtime_data',
    label: '实时数据', description: 'IoT传感器实时数据流',
    icon: '📡', color: '#475569',
    configSchema: [
      { key: 'mqttTopic', label: 'MQTT Topic', type: 'string' },
      { key: 'samplingFrequency', label: '采样频率(Hz)', type: 'number' },
      { key: 'bufferWindow', label: '缓冲窗口(s)', type: 'number', defaultValue: 10 },
    ],
    allowedOutRelations: ['FEEDS'],
    allowedInRelations: [],
  },
  {
    category: 'data', subType: 'knowledge_base',
    label: '知识库', description: '文档/手册/标准等文本知识',
    icon: '📚', color: '#334155',
    configSchema: [
      { key: 'collectionId', label: '关联KB集合ID', type: 'number' },
      { key: 'searchTopK', label: '检索TopK', type: 'number', defaultValue: 5 },
      { key: 'similarityThreshold', label: '相似度阈值', type: 'number', defaultValue: 0.7 },
    ],
    allowedOutRelations: ['REFERENCES'],
    allowedInRelations: [],
  },
];

const MECHANISM_NODES: KGNodeTypeInfo[] = [
  {
    category: 'mechanism', subType: 'physical_model',
    label: '物理模型', description: '振动力学、热力学等机理模型',
    icon: '📐', color: '#78716C',
    configSchema: [
      { key: 'modelType', label: '模型类型', type: 'select', options: [
        { label: '振动力学', value: 'vibration_dynamics' }, { label: '热力学', value: 'thermodynamics' },
        { label: '流体力学', value: 'fluid_dynamics' }, { label: '材料力学', value: 'material_mechanics' },
      ]},
      { key: 'formula', label: '核心公式', type: 'string' },
      { key: 'parameters', label: '模型参数', type: 'json' },
      { key: 'applicableConditions', label: '适用条件', type: 'string' },
    ],
    allowedOutRelations: ['FEEDS', 'REFERENCES'],
    allowedInRelations: [],
  },
  {
    category: 'mechanism', subType: 'degradation_model',
    label: '退化模型', description: '寿命预测和磨损曲线',
    icon: '📉', color: '#A8A29E',
    configSchema: [
      { key: 'degradationFunction', label: '退化函数', type: 'select', options: [
        { label: '线性退化', value: 'linear' }, { label: '指数退化', value: 'exponential' },
        { label: 'Weibull', value: 'weibull' }, { label: '自定义', value: 'custom' },
      ]},
      { key: 'initialValue', label: '初始健康度', type: 'number', defaultValue: 100 },
      { key: 'accelerationFactor', label: '加速因子', type: 'number', defaultValue: 1 },
    ],
    allowedOutRelations: ['FEEDS', 'CAUSES'],
    allowedInRelations: [],
  },
  {
    category: 'mechanism', subType: 'threshold_model',
    label: '阈值模型', description: '多级报警阈值配置',
    icon: '📏', color: '#57534E',
    configSchema: [
      { key: 'normalRange', label: '正常范围', type: 'string', placeholder: '如: 0-1.0 mm/s' },
      { key: 'cautionRange', label: '注意范围', type: 'string', placeholder: '如: 1.0-2.5 mm/s' },
      { key: 'warningRange', label: '警告范围', type: 'string', placeholder: '如: 2.5-5.0 mm/s' },
      { key: 'dangerRange', label: '危险范围', type: 'string', placeholder: '如: >5.0 mm/s' },
    ],
    allowedOutRelations: ['TRIGGERS', 'FEEDS'],
    allowedInRelations: [],
  },
];

/** 所有节点类型注册表 */
export const ALL_KG_NODE_TYPES: KGNodeTypeInfo[] = [
  ...EQUIPMENT_NODES,
  ...FAULT_NODES,
  ...DIAGNOSIS_NODES,
  ...SOLUTION_NODES,
  ...DATA_NODES,
  ...MECHANISM_NODES,
];

/** 按类别分组 */
export const KG_NODE_CATEGORIES: { category: KGNodeCategory; label: string; icon: string; color: string; nodes: KGNodeTypeInfo[] }[] = [
  { category: 'equipment', label: '设备层', icon: '🏗️', color: '#3B82F6', nodes: EQUIPMENT_NODES },
  { category: 'fault', label: '故障层', icon: '⚠️', color: '#EF4444', nodes: FAULT_NODES },
  { category: 'diagnosis', label: '诊断层', icon: '🧠', color: '#8B5CF6', nodes: DIAGNOSIS_NODES },
  { category: 'solution', label: '解决方案层', icon: '🔧', color: '#10B981', nodes: SOLUTION_NODES },
  { category: 'data', label: '数据层', icon: '📁', color: '#64748B', nodes: DATA_NODES },
  { category: 'mechanism', label: '机理层', icon: '📐', color: '#78716C', nodes: MECHANISM_NODES },
];

/** 所有关系类型注册表 */
export const ALL_KG_RELATION_TYPES: KGRelationTypeInfo[] = [
  { type: 'HAS_PART', label: '包含/组成', description: '设备包含组件', color: '#3B82F6', directed: true, allowedSources: ['equipment'], allowedTargets: ['equipment'] },
  { type: 'HAS_SENSOR', label: '安装传感器', description: '设备/组件上安装的传感器', color: '#06B6D4', directed: true, allowedSources: ['equipment'], allowedTargets: ['equipment'] },
  { type: 'CAUSES', label: '因果关系', description: '导致/引起', color: '#EF4444', directed: true, allowedSources: ['equipment', 'fault', 'diagnosis', 'mechanism'], allowedTargets: ['fault'] },
  { type: 'MANIFESTS', label: '表现为', description: '故障表现为某种症状', color: '#F97316', directed: true, allowedSources: ['fault'], allowedTargets: ['fault'] },
  { type: 'DIAGNOSED_BY', label: '诊断依据', description: '症状通过规则/引擎诊断', color: '#8B5CF6', directed: true, allowedSources: ['fault'], allowedTargets: ['diagnosis'] },
  { type: 'RESOLVED_BY', label: '解决方案', description: '故障的解决方案', color: '#10B981', directed: true, allowedSources: ['fault', 'diagnosis'], allowedTargets: ['solution'] },
  { type: 'AFFECTS', label: '影响', description: '故障影响其他设备/产能', color: '#F59E0B', directed: true, allowedSources: ['fault', 'equipment'], allowedTargets: ['equipment'] },
  { type: 'SIMILAR_TO', label: '相似关系', description: '相似的故障模式', color: '#A855F7', directed: false, allowedSources: ['fault'], allowedTargets: ['fault'] },
  { type: 'DEGRADES_TO', label: '退化演变', description: '从轻微退化到严重', color: '#DC2626', directed: true, allowedSources: ['fault', 'equipment'], allowedTargets: ['fault'] },
  { type: 'TRIGGERS', label: '触发', description: '触发应急措施或动作', color: '#B91C1C', directed: true, allowedSources: ['fault', 'diagnosis', 'mechanism'], allowedTargets: ['solution'] },
  { type: 'FEEDS', label: '数据供给', description: '提供数据输入', color: '#64748B', directed: true, allowedSources: ['equipment', 'data', 'mechanism', 'diagnosis'], allowedTargets: ['diagnosis', 'fault'] },
  { type: 'REFERENCES', label: '引用知识', description: '引用知识库/文档', color: '#334155', directed: true, allowedSources: ['data', 'mechanism'], allowedTargets: ['diagnosis'] },
];

/** 根据subType获取节点类型信息 */
export function getKGNodeTypeInfo(subType: KGNodeSubType): KGNodeTypeInfo | undefined {
  return ALL_KG_NODE_TYPES.find(n => n.subType === subType);
}

/** 根据关系类型获取关系信息 */
export function getKGRelationTypeInfo(type: KGRelationType): KGRelationTypeInfo | undefined {
  return ALL_KG_RELATION_TYPES.find(r => r.type === type);
}
