/**
 * ============================================================================
 * 知识图谱算子注册中心
 * ============================================================================
 * 
 * 职责：
 *   1. 管理知识图谱构建和查询的算子类型
 *   2. 定义每种算子的参数 Schema、输入输出类型、连接规则
 *   3. 支持运行时动态注册新算子（自定义推理规则等）
 *   4. 自动同步到前端知识图谱编辑界面
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';

// ============ 算子参数定义 ============

export interface KGOperatorParam {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'code' | 'json' | 'textarea';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
}

// ============ 算子注册项 ============

export interface KGOperatorRegistryItem extends RegistryItemMeta {
  id: string;
  /** 算子大类 */
  operatorType: 'extract' | 'transform' | 'enrich' | 'query' | 'reason' | 'export';
  /** 参数定义 */
  params: KGOperatorParam[];
  /** 输入类型 */
  inputTypes: Array<'entity' | 'relation' | 'property' | 'text' | 'table' | 'graph' | 'any'>;
  /** 输出类型 */
  outputTypes: Array<'entity' | 'relation' | 'property' | 'graph' | 'table' | 'json' | 'text'>;
  /** 是否需要 Neo4j 连接 */
  requiresNeo4j?: boolean;
  /** 是否需要 LLM */
  requiresLLM?: boolean;
}

// ============ 算子分类 ============

const KG_CATEGORIES: CategoryMeta[] = [
  { id: 'extract', label: '知识抽取', icon: '🔍', order: 1, description: '从非结构化数据中抽取实体和关系', color: '#3B82F6' },
  { id: 'transform', label: '知识转换', icon: '🔄', order: 2, description: '实体对齐、关系映射、Schema 转换', color: '#10B981' },
  { id: 'enrich', label: '知识增强', icon: '✨', order: 3, description: '属性补全、关系推理、外部知识融合', color: '#8B5CF6' },
  { id: 'query', label: '知识查询', icon: '🔎', order: 4, description: 'Cypher 查询、路径搜索、子图匹配', color: '#F59E0B' },
  { id: 'reason', label: '知识推理', icon: '🧠', order: 5, description: '规则推理、图神经网络、因果推断', color: '#EF4444' },
  { id: 'export', label: '知识导出', icon: '📤', order: 6, description: '导出为 RDF、JSON-LD、可视化', color: '#64748B' },
];

// ============ 内置算子 ============

const BUILTIN_KG_OPERATORS: KGOperatorRegistryItem[] = [
  // === 知识抽取 ===
  {
    id: 'ner_extract', label: '命名实体识别', icon: '🏷️',
    description: '从文本中识别实体（人名、地名、组织、设备、参数等）',
    category: 'extract', operatorType: 'extract',
    tags: ['ner', 'entity', 'nlp'],
    inputTypes: ['text'], outputTypes: ['entity'],
    requiresLLM: true,
    params: [
      { name: 'model', label: '模型', type: 'select', default: 'llm', options: [
        { value: 'llm', label: 'LLM 抽取' }, { value: 'spacy', label: 'SpaCy' },
        { value: 'hanlp', label: 'HanLP' }, { value: 'custom', label: '自定义模型' },
      ]},
      { name: 'entityTypes', label: '实体类型', type: 'json', placeholder: '["Device", "Sensor", "Location", "Parameter"]' },
      { name: 'prompt', label: '抽取提示词', type: 'textarea', placeholder: '从以下文本中抽取设备、传感器、位置等实体...' },
      { name: 'confidenceThreshold', label: '置信度阈值', type: 'number', default: 0.7 },
    ],
  },
  {
    id: 'relation_extract', label: '关系抽取', icon: '🔗',
    description: '从文本中抽取实体间的关系（安装于、监测、控制等）',
    category: 'extract', operatorType: 'extract',
    tags: ['relation', 'extraction', 'nlp'],
    inputTypes: ['text', 'entity'], outputTypes: ['relation'],
    requiresLLM: true,
    params: [
      { name: 'relationTypes', label: '关系类型', type: 'json', placeholder: '["installed_at", "monitors", "controls", "belongs_to"]' },
      { name: 'model', label: '模型', type: 'select', default: 'llm', options: [
        { value: 'llm', label: 'LLM 抽取' }, { value: 'pattern', label: '规则模式' }, { value: 'custom', label: '自定义模型' },
      ]},
      { name: 'bidirectional', label: '双向关系', type: 'boolean', default: false },
    ],
  },
  {
    id: 'table_extract', label: '表格知识抽取', icon: '📊',
    description: '从结构化表格数据中抽取实体和关系',
    category: 'extract', operatorType: 'extract',
    tags: ['table', 'structured', 'csv'],
    inputTypes: ['table'], outputTypes: ['entity', 'relation'],
    params: [
      { name: 'entityColumn', label: '实体列', type: 'string', required: true, placeholder: 'device_name' },
      { name: 'entityType', label: '实体类型', type: 'string', required: true, placeholder: 'Device' },
      { name: 'propertyColumns', label: '属性列映射', type: 'json', placeholder: '{"location": "install_location", "model": "device_model"}' },
      { name: 'relationColumns', label: '关系列映射', type: 'json', placeholder: '{"belongs_to": "department", "monitored_by": "sensor_id"}' },
    ],
  },

  // === 知识转换 ===
  {
    id: 'entity_align', label: '实体对齐', icon: '🎯',
    description: '将不同来源的同一实体进行对齐合并',
    category: 'transform', operatorType: 'transform',
    tags: ['alignment', 'dedup', 'merge'],
    inputTypes: ['entity'], outputTypes: ['entity'],
    params: [
      { name: 'strategy', label: '对齐策略', type: 'select', default: 'similarity', options: [
        { value: 'exact', label: '精确匹配' }, { value: 'similarity', label: '相似度匹配' },
        { value: 'embedding', label: '向量相似度' }, { value: 'rule', label: '规则匹配' },
      ]},
      { name: 'similarityThreshold', label: '相似度阈值', type: 'number', default: 0.85 },
      { name: 'mergeStrategy', label: '合并策略', type: 'select', default: 'keep_latest', options: [
        { value: 'keep_first', label: '保留首个' }, { value: 'keep_latest', label: '保留最新' },
        { value: 'merge_all', label: '合并全部属性' },
      ]},
    ],
  },
  {
    id: 'schema_mapping', label: 'Schema 映射', icon: '🗺️',
    description: '将源 Schema 映射到目标知识图谱 Schema',
    category: 'transform', operatorType: 'transform',
    tags: ['schema', 'mapping', 'ontology'],
    inputTypes: ['entity', 'relation'], outputTypes: ['entity', 'relation'],
    params: [
      { name: 'mappingRules', label: '映射规则', type: 'json', required: true, placeholder: '{"source_type": "target_type", "source_prop": "target_prop"}' },
      { name: 'defaultEntityType', label: '默认实体类型', type: 'string', default: 'Thing' },
      { name: 'strict', label: '严格模式', type: 'boolean', default: false, description: '未匹配的属性是否丢弃' },
    ],
  },

  // === 知识增强 ===
  {
    id: 'property_complete', label: '属性补全', icon: '✏️',
    description: '基于已有知识推断缺失的实体属性',
    category: 'enrich', operatorType: 'enrich',
    tags: ['completion', 'inference', 'property'],
    inputTypes: ['entity', 'graph'], outputTypes: ['entity'],
    requiresNeo4j: true,
    params: [
      { name: 'method', label: '补全方法', type: 'select', default: 'rule', options: [
        { value: 'rule', label: '规则推理' }, { value: 'embedding', label: '图嵌入' },
        { value: 'llm', label: 'LLM 推理' }, { value: 'statistical', label: '统计推断' },
      ]},
      { name: 'targetProperties', label: '目标属性', type: 'json', placeholder: '["manufacturer", "install_date"]' },
      { name: 'confidenceThreshold', label: '置信度阈值', type: 'number', default: 0.8 },
    ],
  },
  {
    id: 'external_enrich', label: '外部知识融合', icon: '🌍',
    description: '从外部知识库（Wikidata、行业知识库）融合补充信息',
    category: 'enrich', operatorType: 'enrich',
    tags: ['external', 'wikidata', 'fusion'],
    inputTypes: ['entity'], outputTypes: ['entity', 'relation'],
    params: [
      { name: 'source', label: '知识源', type: 'select', required: true, options: [
        { value: 'wikidata', label: 'Wikidata' }, { value: 'dbpedia', label: 'DBpedia' },
        { value: 'industry_kb', label: '行业知识库' }, { value: 'custom_api', label: '自定义 API' },
      ]},
      { name: 'apiEndpoint', label: 'API 端点', type: 'string', placeholder: 'https://kb.example.com/api' },
      { name: 'matchField', label: '匹配字段', type: 'string', default: 'name' },
      { name: 'enrichFields', label: '补充字段', type: 'json', placeholder: '["description", "classification", "specifications"]' },
    ],
  },

  // === 知识查询 ===
  {
    id: 'cypher_query', label: 'Cypher 查询', icon: '💻',
    description: '执行 Cypher 查询语句',
    category: 'query', operatorType: 'query',
    tags: ['cypher', 'neo4j', 'query'],
    inputTypes: ['any'], outputTypes: ['graph', 'table'],
    requiresNeo4j: true,
    params: [
      { name: 'query', label: 'Cypher 语句', type: 'code', required: true, placeholder: 'MATCH (n:Device)-[r]->(m) RETURN n, r, m LIMIT 100' },
      { name: 'params', label: '查询参数', type: 'json', placeholder: '{"deviceCode": "DEV-001"}' },
      { name: 'timeout', label: '超时(ms)', type: 'number', default: 30000 },
    ],
  },
  {
    id: 'path_search', label: '路径搜索', icon: '🛤️',
    description: '在知识图谱中搜索两个实体间的最短路径或所有路径',
    category: 'query', operatorType: 'query',
    tags: ['path', 'shortest', 'search'],
    inputTypes: ['entity'], outputTypes: ['graph'],
    requiresNeo4j: true,
    params: [
      { name: 'startNode', label: '起始节点', type: 'string', required: true, placeholder: '节点 ID 或属性查询' },
      { name: 'endNode', label: '终止节点', type: 'string', required: true },
      { name: 'maxDepth', label: '最大深度', type: 'number', default: 5 },
      { name: 'algorithm', label: '搜索算法', type: 'select', default: 'shortest', options: [
        { value: 'shortest', label: '最短路径' }, { value: 'all_shortest', label: '所有最短路径' },
        { value: 'all', label: '所有路径' }, { value: 'weighted', label: '加权最短路径' },
      ]},
      { name: 'relationFilter', label: '关系过滤', type: 'json', placeholder: '["installed_at", "monitors"]' },
    ],
  },
  {
    id: 'subgraph_match', label: '子图匹配', icon: '🧩',
    description: '在知识图谱中匹配指定模式的子图',
    category: 'query', operatorType: 'query',
    tags: ['subgraph', 'pattern', 'match'],
    inputTypes: ['graph'], outputTypes: ['graph'],
    requiresNeo4j: true,
    params: [
      { name: 'pattern', label: '匹配模式', type: 'code', required: true, placeholder: '(d:Device)-[:monitors]->(s:Sensor)-[:located_at]->(l:Location)' },
      { name: 'constraints', label: '约束条件', type: 'json', placeholder: '{"d.status": "active", "s.type": "temperature"}' },
      { name: 'limit', label: '结果数量限制', type: 'number', default: 100 },
    ],
  },

  // === 知识推理 ===
  {
    id: 'rule_reason', label: '规则推理', icon: '📏',
    description: '基于预定义规则进行知识推理（如传递性、对称性）',
    category: 'reason', operatorType: 'reason',
    tags: ['rule', 'inference', 'logic'],
    inputTypes: ['graph'], outputTypes: ['relation', 'entity'],
    requiresNeo4j: true,
    params: [
      { name: 'rules', label: '推理规则', type: 'json', required: true, placeholder: '[{"if": "(a)-[:part_of]->(b)-[:part_of]->(c)", "then": "(a)-[:part_of]->(c)"}]' },
      { name: 'maxIterations', label: '最大迭代次数', type: 'number', default: 10 },
      { name: 'conflictResolution', label: '冲突解决', type: 'select', default: 'latest', options: [
        { value: 'latest', label: '保留最新' }, { value: 'highest_confidence', label: '最高置信度' },
        { value: 'manual', label: '人工审核' },
      ]},
    ],
  },
  {
    id: 'gnn_reason', label: '图神经网络推理', icon: '🕸️',
    description: '使用 GNN 进行链接预测、节点分类等推理任务',
    category: 'reason', operatorType: 'reason',
    tags: ['gnn', 'deep-learning', 'link-prediction'],
    inputTypes: ['graph'], outputTypes: ['relation', 'entity'],
    requiresNeo4j: true,
    params: [
      { name: 'task', label: '推理任务', type: 'select', required: true, options: [
        { value: 'link_prediction', label: '链接预测' }, { value: 'node_classification', label: '节点分类' },
        { value: 'relation_prediction', label: '关系预测' },
      ]},
      { name: 'model', label: '模型', type: 'select', default: 'graphsage', options: [
        { value: 'gcn', label: 'GCN' }, { value: 'graphsage', label: 'GraphSAGE' },
        { value: 'gat', label: 'GAT' }, { value: 'rgcn', label: 'R-GCN' },
      ]},
      { name: 'epochs', label: '训练轮次', type: 'number', default: 100 },
      { name: 'embeddingDim', label: '嵌入维度', type: 'number', default: 128 },
      { name: 'threshold', label: '预测阈值', type: 'number', default: 0.5 },
    ],
  },
  {
    id: 'causal_reason', label: '因果推断', icon: '🔬',
    description: '基于知识图谱进行因果关系推断（设备故障根因分析）',
    category: 'reason', operatorType: 'reason',
    tags: ['causal', 'root-cause', 'analysis'],
    inputTypes: ['graph'], outputTypes: ['graph', 'json'],
    requiresNeo4j: true,
    requiresLLM: true,
    params: [
      { name: 'targetEvent', label: '目标事件', type: 'string', required: true, placeholder: '设备故障/异常告警' },
      { name: 'method', label: '推断方法', type: 'select', default: 'bayesian', options: [
        { value: 'bayesian', label: '贝叶斯网络' }, { value: 'granger', label: 'Granger 因果' },
        { value: 'structural', label: '结构因果模型' }, { value: 'llm_assisted', label: 'LLM 辅助推理' },
      ]},
      { name: 'timeWindow', label: '时间窗口', type: 'string', default: '24h' },
      { name: 'maxCauses', label: '最大因果链深度', type: 'number', default: 5 },
    ],
  },

  // === 知识导出 ===
  {
    id: 'export_rdf', label: 'RDF 导出', icon: '📄',
    description: '将知识图谱导出为 RDF/Turtle/N-Triples 格式',
    category: 'export', operatorType: 'export',
    tags: ['rdf', 'turtle', 'export'],
    inputTypes: ['graph'], outputTypes: ['text'],
    requiresNeo4j: true,
    params: [
      { name: 'format', label: '输出格式', type: 'select', default: 'turtle', options: [
        { value: 'turtle', label: 'Turtle (.ttl)' }, { value: 'ntriples', label: 'N-Triples (.nt)' },
        { value: 'rdfxml', label: 'RDF/XML (.rdf)' }, { value: 'jsonld', label: 'JSON-LD (.jsonld)' },
      ]},
      { name: 'baseUri', label: '基础 URI', type: 'string', default: 'http://example.org/kg/' },
      { name: 'includeMetadata', label: '包含元数据', type: 'boolean', default: true },
    ],
  },
  {
    id: 'export_visualization', label: '可视化导出', icon: '🎨',
    description: '将知识图谱导出为可视化格式（SVG/PNG/交互式 HTML）',
    category: 'export', operatorType: 'export',
    tags: ['visualization', 'svg', 'html'],
    inputTypes: ['graph'], outputTypes: ['text'],
    params: [
      { name: 'format', label: '输出格式', type: 'select', default: 'html', options: [
        { value: 'html', label: '交互式 HTML' }, { value: 'svg', label: 'SVG' },
        { value: 'png', label: 'PNG' }, { value: 'graphml', label: 'GraphML' },
      ]},
      { name: 'layout', label: '布局算法', type: 'select', default: 'force', options: [
        { value: 'force', label: '力导向' }, { value: 'hierarchical', label: '层次布局' },
        { value: 'circular', label: '环形布局' }, { value: 'radial', label: '径向布局' },
      ]},
      { name: 'maxNodes', label: '最大节点数', type: 'number', default: 500 },
      { name: 'colorBy', label: '着色依据', type: 'select', default: 'type', options: [
        { value: 'type', label: '实体类型' }, { value: 'community', label: '社区检测' },
        { value: 'centrality', label: '中心性' },
      ]},
    ],
  },
];

// ============ 创建并初始化注册中心实例 ============

class KGOperatorRegistry extends BaseRegistry<KGOperatorRegistryItem> {
  constructor() {
    super('KGOperatorRegistry');
    this.registerCategories(KG_CATEGORIES);
    this.registerAll(BUILTIN_KG_OPERATORS);
  }

  /** 按算子大类查询 */
  getByOperatorType(operatorType: string): KGOperatorRegistryItem[] {
    return this.listItems().filter(item => item.operatorType === operatorType);
  }

  /** 获取需要 Neo4j 的算子 */
  getNeo4jRequired(): KGOperatorRegistryItem[] {
    return this.listItems().filter(item => item.requiresNeo4j);
  }

  /** 获取需要 LLM 的算子 */
  getLLMRequired(): KGOperatorRegistryItem[] {
    return this.listItems().filter(item => item.requiresLLM);
  }

  /** 按输入类型查询兼容的算子 */
  getByInputType(inputType: string): KGOperatorRegistryItem[] {
    return this.listItems().filter(item =>
      item.inputTypes.includes(inputType as any) || item.inputTypes.includes('any')
    );
  }

  /** 验证两个算子是否可以连接 */
  validateConnection(fromOperatorId: string, toOperatorId: string): { valid: boolean; reason?: string } {
    const from = this.get(fromOperatorId);
    const to = this.get(toOperatorId);
    if (!from || !to) return { valid: false, reason: '未知的算子类型' };

    const compatible = from.outputTypes.some(out =>
      to.inputTypes.includes(out as any) || to.inputTypes.includes('any')
    );
    if (!compatible) {
      return { valid: false, reason: `${from.label} 的输出类型 [${from.outputTypes.join(',')}] 与 ${to.label} 的输入类型 [${to.inputTypes.join(',')}] 不兼容` };
    }
    return { valid: true };
  }
}

// ============ 导出单例 ============

export const kgOperatorRegistry = new KGOperatorRegistry();
