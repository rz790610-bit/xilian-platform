/**
 * ============================================================================
 * Grok 内置工具定义 — 12 个 Tool Calling 工具
 * ============================================================================
 *
 * 按闭环阶段分组：
 *   ②诊断（8 个）：query_sensor_realtime, query_clickhouse_analytics,
 *                   query_knowledge_graph, compute_physics_formula,
 *                   search_similar_cases, predict_device_state,
 *                   counterfactual_analysis, generate_diagnosis_report
 *   ③护栏（1 个）：evaluate_guardrail_action
 *   ④进化（3 个）：generate_feature_code, generate_rule_patch, validate_hypothesis
 *
 * 每个工具包含：
 *   - name: 工具名（Grok API function name）
 *   - description: 工具描述（Grok 用于选择工具）
 *   - inputSchema: Zod Schema（参数校验）
 *   - outputSchema: Zod Schema（输出校验）
 *   - loopStage: 闭环阶段
 *   - execute: 执行函数
 */

import { z } from 'zod';

// ============================================================================
// 工具接口定义
// ============================================================================

export interface GrokTool {
  name: string;
  description: string;
  loopStage: 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility';
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  execute: (input: any, context: ToolContext) => Promise<any>;
}

export interface ToolContext {
  sessionId: string;
  machineId?: string;
  traceId: string;
  conditionId?: string;
  userId?: string;
}

// ============================================================================
// ②诊断阶段工具（8 个）
// ============================================================================

/**
 * 工具 1: 查询指定设备/传感器的实时数据
 */
export const querySensorRealtime: GrokTool = {
  name: 'query_sensor_realtime',
  description: '查询指定设备和传感器的实时数据。可指定时间范围和传感器列表。返回时序数据点数组。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    sensorIds: z.array(z.string()).describe('传感器ID列表，如 ["vibration_rms", "motor_current", "wind_speed"]'),
    timeRange: z.object({
      start: z.string().describe('开始时间 ISO8601'),
      end: z.string().describe('结束时间 ISO8601'),
    }).describe('查询时间范围'),
    aggregation: z.enum(['raw', '1min', '5min', '1hour']).default('raw').describe('聚合粒度'),
  }),
  outputSchema: z.object({
    measurements: z.array(z.object({
      sensorId: z.string(),
      timestamp: z.string(),
      value: z.number(),
      unit: z.string(),
      quality: z.enum(['good', 'uncertain', 'bad']),
    })),
    summary: z.object({
      count: z.number(),
      timeRange: z.object({ start: z.string(), end: z.string() }),
    }),
  }),
  execute: async (input, context) => {
    // TODO: Phase 4 实现 — 从 ClickHouse realtime_telemetry 查询
    return {
      measurements: [],
      summary: { count: 0, timeRange: input.timeRange },
    };
  },
};

/**
 * 工具 2: 在 ClickHouse 物化视图上执行分析查询
 */
export const queryClickhouseAnalytics: GrokTool = {
  name: 'query_clickhouse_analytics',
  description: '在 ClickHouse 物化视图上执行分析查询。仅允许 SELECT 语句，禁止 DDL/DML。可查询 mv_device_health_wide, mv_cycle_phase_stats, mv_fusion_diagnosis_wide 等视图。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    sql: z.string().describe('受限 SQL 查询（仅 SELECT，禁止 DDL/DML）'),
    parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('查询参数'),
    viewName: z.string().optional().describe('目标视图名（可选，用于权限检查）'),
  }),
  outputSchema: z.object({
    rows: z.array(z.record(z.string(), z.unknown())),
    rowCount: z.number(),
    executionTimeMs: z.number(),
  }),
  execute: async (input, context) => {
    // 安全检查：仅允许 SELECT
    const sqlUpper = input.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
      throw new Error('Only SELECT statements are allowed');
    }
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/.test(sqlUpper)) {
      throw new Error('DDL/DML statements are not allowed');
    }
    // TODO: 执行 ClickHouse 查询
    return { rows: [], rowCount: 0, executionTimeMs: 0 };
  },
};

/**
 * 工具 3: 查询 Neo4j 知识图谱中的实体和关系
 */
export const queryKnowledgeGraph: GrokTool = {
  name: 'query_knowledge_graph',
  description: '查询知识图谱中的实体和关系。使用受限 Cypher 查询（仅 MATCH/RETURN，禁止写操作）。可查询设备故障模式、维修历史、因果关系等。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    cypher: z.string().describe('受限 Cypher 查询（仅 MATCH/RETURN）'),
    parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('查询参数'),
  }),
  outputSchema: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      labels: z.array(z.string()),
      properties: z.record(z.string(), z.unknown()),
    })),
    edges: z.array(z.object({
      id: z.string(),
      type: z.string(),
      startNode: z.string(),
      endNode: z.string(),
      properties: z.record(z.string(), z.unknown()),
    })),
  }),
  execute: async (input, context) => {
    // 安全检查：禁止写操作
    const cypherUpper = input.cypher.trim().toUpperCase();
    if (/\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH)\b/.test(cypherUpper)) {
      throw new Error('Write operations are not allowed in knowledge graph queries');
    }
    // TODO: 执行 Neo4j 查询
    return { nodes: [], edges: [] };
  },
};

/**
 * 工具 4: 计算物理公式（疲劳/风载/摩擦/腐蚀/热/振动/倾覆）
 */
export const computePhysicsFormula: GrokTool = {
  name: 'compute_physics_formula',
  description: '计算物理公式。可用公式：wind_load_moment(风载力矩), fatigue_increment(疲劳增量), sn_curve_life(S-N曲线寿命), friction_force(摩擦力), corrosion_rate(腐蚀速率), heat_conduction(热传导), vibration_rms(振动有效值), overturn_moment(倾覆力矩), overturn_safety_factor(抗倾覆安全系数)。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    formulaId: z.string().describe('公式ID'),
    variables: z.record(z.string(), z.number()).describe('变量值（key为变量符号）'),
  }),
  outputSchema: z.object({
    formulaId: z.string(),
    result: z.number(),
    unit: z.string(),
    explanation: z.string(),
    inputVariables: z.record(z.string(), z.number()),
    computeTimeMs: z.number(),
  }),
  execute: async (input, context) => {
    // 调用 PhysicsEngine
    const { physicsEngine } = await import('../../contracts/physics-formulas');
    return physicsEngine.compute(input.formulaId, input.variables);
  },
};

/**
 * 工具 5: 搜索历史相似诊断案例
 */
export const searchSimilarCases: GrokTool = {
  name: 'search_similar_cases',
  description: '搜索历史相似诊断案例。基于症状向量和设备类型，在 cognition_sessions 表中搜索相似案例。返回相似度排序的历史案例列表。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    symptoms: z.array(z.string()).describe('症状描述列表'),
    machineType: z.string().optional().describe('设备类型过滤'),
    topK: z.number().default(5).describe('返回前 K 个最相似案例'),
    minSimilarity: z.number().default(0.6).describe('最小相似度阈值'),
  }),
  outputSchema: z.object({
    cases: z.array(z.object({
      sessionId: z.string(),
      machineId: z.string(),
      similarity: z.number(),
      safetyScore: z.number(),
      healthScore: z.number(),
      diagnostics: z.array(z.unknown()),
      grokExplanation: z.string().optional(),
      timestamp: z.string(),
    })),
    totalMatched: z.number(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 9 实现 — 向量搜索 + 文本匹配
    return { cases: [], totalMatched: 0 };
  },
};

/**
 * 工具 6: 调用 WorldModel 预测设备未来状态
 */
export const predictDeviceState: GrokTool = {
  name: 'predict_device_state',
  description: '调用世界模型预测设备未来状态。输入设备ID和预测时间范围，返回未来状态轨迹（包含安全/健康/效率预测）。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    horizonMinutes: z.number().min(5).max(1440).describe('预测时间范围（分钟）'),
    scenario: z.record(z.string(), z.number()).optional().describe('假设场景参数（可选）'),
  }),
  outputSchema: z.object({
    predictions: z.array(z.object({
      timestampOffset: z.number(),
      safetyScore: z.number(),
      healthScore: z.number(),
      efficiencyScore: z.number(),
      fatigueAccum: z.number(),
      keyMetrics: z.record(z.string(), z.number()),
    })),
    confidence: z.number(),
    model: z.string(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 5 实现 — WorldModel 预测
    return { predictions: [], confidence: 0, model: 'world-model-v1' };
  },
};

/**
 * 工具 7: 反事实推理
 */
export const counterfactualAnalysis: GrokTool = {
  name: 'counterfactual_analysis',
  description: '反事实推理："如果 X 发生/不发生，会怎样？"。基于世界模型的因果推理，评估假设场景下的设备状态变化。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    hypothesis: z.string().describe('假设描述，如"如果风速降到5m/s"'),
    variables: z.record(z.string(), z.number()).describe('假设变量值'),
  }),
  outputSchema: z.object({
    alternateState: z.object({
      safetyScore: z.number(),
      healthScore: z.number(),
      efficiencyScore: z.number(),
      keyMetrics: z.record(z.string(), z.number()),
    }),
    probability: z.number(),
    explanation: z.string(),
    comparisonWithCurrent: z.record(z.string(), z.object({
      current: z.number(),
      alternate: z.number(),
      delta: z.number(),
      deltaPercent: z.number(),
    })),
  }),
  execute: async (input, context) => {
    // TODO: Phase 5 实现 — WorldModel 反事实推理
    return {
      alternateState: { safetyScore: 0, healthScore: 0, efficiencyScore: 0, keyMetrics: {} },
      probability: 0,
      explanation: '',
      comparisonWithCurrent: {},
    };
  },
};

/**
 * 工具 8: 基于证据生成结构化诊断报告
 */
export const generateDiagnosisReport: GrokTool = {
  name: 'generate_diagnosis_report',
  description: '基于收集的证据和评分，生成结构化诊断报告。报告包含安全/健康/效率三维评分、诊断条目、预测信息和建议。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    evidence: z.array(z.object({
      type: z.string(),
      source: z.string(),
      value: z.unknown(),
      weight: z.number(),
      confidence: z.number(),
    })).describe('证据列表'),
    scores: z.object({
      safety: z.number(),
      health: z.number(),
      efficiency: z.number(),
    }).describe('三维评分'),
    machineId: z.string(),
    conditionId: z.string().optional(),
  }),
  outputSchema: z.object({
    report: z.object({
      machineId: z.string(),
      timestamp: z.number(),
      safetyScore: z.number(),
      healthScore: z.number(),
      efficiencyScore: z.number(),
      diagnostics: z.array(z.object({
        type: z.string(),
        cause: z.string(),
        physics: z.string(),
        result: z.number(),
        unit: z.string(),
        risk: z.string(),
        probability: z.number(),
        suggestion: z.string(),
      })),
      predictions: z.object({
        remainingLifeDays: z.number(),
        fatigueAccumPercent: z.number(),
        riskTrend: z.string(),
      }),
    }),
  }),
  execute: async (input, context) => {
    // 由 Grok 结构化输出直接生成
    return {
      report: {
        machineId: input.machineId,
        timestamp: Date.now(),
        safetyScore: input.scores.safety,
        healthScore: input.scores.health,
        efficiencyScore: input.scores.efficiency,
        diagnostics: [],
        predictions: { remainingLifeDays: 0, fatigueAccumPercent: 0, riskTrend: 'unknown' },
      },
    };
  },
};

// ============================================================================
// ③护栏阶段工具（1 个）
// ============================================================================

/**
 * 工具 9: 评估护栏干预是否合理
 */
export const evaluateGuardrailAction: GrokTool = {
  name: 'evaluate_guardrail_action',
  description: '评估护栏干预动作是否合理。基于当前设备状态、诊断报告和物理约束，判断干预是否必要、是否过度。',
  loopStage: 'guardrail',
  inputSchema: z.object({
    violation: z.object({
      ruleId: z.number(),
      ruleType: z.string(),
      triggerValues: z.record(z.string(), z.number()),
      proposedAction: z.string(),
    }).describe('护栏触发信息'),
    context: z.object({
      machineId: z.string(),
      currentState: z.record(z.string(), z.number()),
      recentDiagnosis: z.unknown().optional(),
      environmentalFactors: z.record(z.string(), z.number()).optional(),
    }).describe('当前上下文'),
  }),
  outputSchema: z.object({
    recommendation: z.enum(['execute', 'modify', 'override', 'escalate']),
    confidence: z.number(),
    explanation: z.string(),
    modifiedAction: z.string().optional(),
    physicalJustification: z.string(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 6 实现 — GuardrailEngine 评估
    return {
      recommendation: 'execute' as const,
      confidence: 0,
      explanation: '',
      physicalJustification: '',
    };
  },
};

// ============================================================================
// ④进化阶段工具（3 个）
// ============================================================================

/**
 * 工具 10: 生成新特征工程代码片段
 */
export const generateFeatureCode: GrokTool = {
  name: 'generate_feature_code',
  description: '基于描述和输入信号，生成新的特征工程 TypeScript 代码片段。包含计算逻辑和单元测试。',
  loopStage: 'evolution',
  inputSchema: z.object({
    description: z.string().describe('特征描述'),
    inputSignals: z.array(z.object({
      name: z.string(),
      unit: z.string(),
      type: z.string(),
    })).describe('输入信号列表'),
    existingFeatures: z.array(z.string()).optional().describe('已有特征名列表（避免重复）'),
  }),
  outputSchema: z.object({
    code: z.string().describe('TypeScript 代码'),
    unitTest: z.string().describe('单元测试代码'),
    featureName: z.string(),
    outputUnit: z.string(),
    explanation: z.string(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 7 实现 — Grok 代码生成
    return { code: '', unitTest: '', featureName: '', outputUnit: '', explanation: '' };
  },
};

/**
 * 工具 11: 生成规则/阈值更新建议
 */
export const generateRulePatch: GrokTool = {
  name: 'generate_rule_patch',
  description: '分析当前规则和数据，生成规则/阈值更新建议（JSON Patch 格式）。包含修改理由和预期效果。',
  loopStage: 'evolution',
  inputSchema: z.object({
    analysis: z.string().describe('分析结论'),
    currentRules: z.array(z.object({
      id: z.number(),
      name: z.string(),
      condition: z.record(z.string(), z.unknown()),
      action: z.record(z.string(), z.unknown()),
    })).describe('当前规则列表'),
    performanceData: z.object({
      falsePositiveRate: z.number(),
      falseNegativeRate: z.number(),
      triggerCount: z.number(),
    }).optional().describe('规则性能数据'),
  }),
  outputSchema: z.object({
    patches: z.array(z.object({
      ruleId: z.number(),
      op: z.enum(['replace', 'add', 'remove']),
      path: z.string(),
      value: z.unknown(),
      rationale: z.string(),
    })),
    expectedImprovement: z.object({
      falsePositiveReduction: z.number(),
      falseNegativeReduction: z.number(),
    }),
    summary: z.string(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 7 实现 — Grok 规则生成
    return {
      patches: [],
      expectedImprovement: { falsePositiveReduction: 0, falseNegativeReduction: 0 },
      summary: '',
    };
  },
};

/**
 * 工具 12: 验证假设
 */
export const validateHypothesis: GrokTool = {
  name: 'validate_hypothesis',
  description: '验证假设：查数据 + 统计检验。支持 t-test, chi-square, Mann-Whitney U 等检验方法。',
  loopStage: 'evolution',
  inputSchema: z.object({
    hypothesis: z.string().describe('假设描述'),
    dataQuery: z.object({
      sql: z.string(),
      parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    }).describe('数据查询'),
    testType: z.enum(['t_test', 'chi_square', 'mann_whitney', 'ks_test', 'correlation']).describe('统计检验类型'),
    alpha: z.number().default(0.05).describe('显著性水平'),
  }),
  outputSchema: z.object({
    pValue: z.number(),
    statistic: z.number(),
    conclusion: z.enum(['supported', 'rejected', 'inconclusive']),
    sampleSize: z.number(),
    effectSize: z.number().optional(),
    explanation: z.string(),
  }),
  execute: async (input, context) => {
    // TODO: Phase 7 实现 — 统计检验
    return {
      pValue: 1,
      statistic: 0,
      conclusion: 'inconclusive' as const,
      sampleSize: 0,
      explanation: '',
    };
  },
};

// ============================================================================
// 工具注册表
// ============================================================================

/** 所有内置工具 */
export const BUILTIN_GROK_TOOLS: GrokTool[] = [
  querySensorRealtime,
  queryClickhouseAnalytics,
  queryKnowledgeGraph,
  computePhysicsFormula,
  searchSimilarCases,
  predictDeviceState,
  counterfactualAnalysis,
  generateDiagnosisReport,
  evaluateGuardrailAction,
  generateFeatureCode,
  generateRulePatch,
  validateHypothesis,
];

/** 按名称索引 */
export const GROK_TOOL_MAP: Map<string, GrokTool> = new Map(
  BUILTIN_GROK_TOOLS.map(t => [t.name, t])
);

/** 按闭环阶段分组 */
export function getToolsByStage(stage: GrokTool['loopStage']): GrokTool[] {
  return BUILTIN_GROK_TOOLS.filter(t => t.loopStage === stage);
}

/**
 * 将 GrokTool 转换为 Grok API 的 tool definition 格式
 */
export function toGrokApiToolDef(tool: GrokTool): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    },
  };
}

/**
 * 简化的 Zod → JSON Schema 转换（用于 Grok API）
 */
function zodToJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  // 简化实现：利用 Zod 的 _def 结构生成 JSON Schema
  // 生产环境建议使用 zod-to-json-schema 包
  const def = (schema as any)._def;
  if (!def) return { type: 'object' };

  if (def.typeName === 'ZodObject') {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType<any>);
      const innerDef = (value as any)._def;
      if (innerDef?.typeName !== 'ZodOptional' && innerDef?.typeName !== 'ZodDefault') {
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }
  if (def.typeName === 'ZodString') return { type: 'string', description: def.description };
  if (def.typeName === 'ZodNumber') return { type: 'number', description: def.description };
  if (def.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (def.typeName === 'ZodArray') return { type: 'array', items: zodToJsonSchema(def.type) };
  if (def.typeName === 'ZodEnum') return { type: 'string', enum: def.values };
  if (def.typeName === 'ZodOptional') return { ...zodToJsonSchema(def.innerType) };
  if (def.typeName === 'ZodDefault') return { ...zodToJsonSchema(def.innerType) };
  if (def.typeName === 'ZodRecord') return { type: 'object', additionalProperties: zodToJsonSchema(def.valueType) };
  if (def.typeName === 'ZodUnion') return { oneOf: def.options.map((o: any) => zodToJsonSchema(o)) };

  return { type: 'object' };
}
