/**
 * ============================================================================
 * Grok 内置工具定义 — 17 个 Tool Calling 工具
 * ============================================================================
 *
 * 按闭环阶段分组：
 *   ①感知（1 个）：get_weather_data
 *   ②诊断（10 个）：query_sensor_realtime, query_clickhouse_analytics,
 *                    query_knowledge_graph, compute_physics_formula,
 *                    search_similar_cases, predict_device_state,
 *                    counterfactual_analysis, generate_diagnosis_report,
 *                    get_operational_context, get_expert_knowledge
 *   ③护栏（1 个）：evaluate_guardrail_action
 *   ④进化（3 个）：generate_feature_code, generate_rule_patch, validate_hypothesis
 *   ⑤工具（2 个）：（预留）
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
    // FIX-066: 基于 diagnosisTasks 表的文本相似度搜索
    try {
      const { getDb } = await import('../../../lib/db');
      const { diagnosisTasks } = await import('../../../../drizzle/schema');
      const { desc, sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return { cases: [], totalMatched: 0 };

      // 查询最近完成的诊断任务
      const tasks = await db.select()
        .from(diagnosisTasks)
        .where(sql`${diagnosisTasks.status} = 'completed'`)
        .orderBy(desc(diagnosisTasks.createdAt))
        .limit(200);

      // 基于关键词匹配计算简单相似度
      const symptoms: string[] = input.symptoms;
      const symptomSet = new Set(symptoms.map(s => s.toLowerCase()));
      const scored = tasks.map(t => {
        const resultJson = JSON.stringify(t.result || {}).toLowerCase();
        const inputJson = JSON.stringify(t.inputData || {}).toLowerCase();
        const combined = resultJson + ' ' + inputJson;
        let matchCount = 0;
        for (const symptom of symptomSet) {
          if (combined.includes(symptom)) matchCount++;
        }
        const similarity = symptomSet.size > 0 ? matchCount / symptomSet.size : 0;
        return { task: t, similarity };
      })
      .filter(s => s.similarity >= (input.minSimilarity ?? 0.6))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.topK ?? 5);

      return {
        cases: scored.map(s => ({
          sessionId: s.task.taskId,
          machineId: s.task.nodeId || '',
          similarity: Math.round(s.similarity * 100) / 100,
          safetyScore: (s.task.result as any)?.safetyScore ?? 0,
          healthScore: (s.task.result as any)?.healthScore ?? 0,
          diagnostics: (s.task.result as any)?.recommendations || [],
          grokExplanation: (s.task.result as any)?.diagnosis || '',
          timestamp: s.task.createdAt?.toISOString() || '',
        })),
        totalMatched: scored.length,
      };
    } catch (err: any) {
      return { cases: [], totalMatched: 0, error: err.message };
    }
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

/**
 * 工具 8b: 获取设备规格参数 (FIX-065)
 */
export const getEquipmentSpecs: GrokTool = {
  name: 'get_equipment_specs',
  description: '获取指定设备的规格参数（型号、制造商、额定参数、安装信息）。输入设备 nodeId，返回完整设备台账。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备 nodeId'),
    includeMaintenanceHistory: z.boolean().default(false).describe('是否包含维护记录'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    specs: z.object({
      nodeId: z.string(),
      deviceCode: z.string(),
      name: z.string(),
      type: z.string(),
      model: z.string(),
      manufacturer: z.string(),
      location: z.string(),
      status: z.string(),
      sensorCount: z.number(),
    }).optional(),
    sensors: z.array(z.object({
      sensorId: z.string(),
      name: z.string(),
      type: z.string(),
      unit: z.string(),
    })).optional(),
    maintenanceRecords: z.array(z.object({
      recordId: z.string(),
      type: z.string(),
      title: z.string(),
      completedAt: z.string().nullable(),
    })).optional(),
  }),
  execute: async (input, context) => {
    try {
      const { deviceService, sensorService } = await import('../../../services/device.service');
      const device = await deviceService.getDevice(input.machineId);
      if (!device) {
        return { found: false };
      }
      const sensors = await sensorService.listSensors(input.machineId);
      const result: Record<string, unknown> = {
        found: true,
        specs: {
          nodeId: device.nodeId,
          deviceCode: device.deviceCode,
          name: device.name,
          type: device.type,
          model: device.model || '',
          manufacturer: device.manufacturer || '',
          location: device.location || '',
          status: device.status,
          sensorCount: device.sensorCount || sensors.length,
        },
        sensors: sensors.map((s: any) => ({
          sensorId: s.sensorId,
          name: s.name,
          type: s.type,
          unit: s.unit || '',
        })),
      };
      if (input.includeMaintenanceHistory) {
        const { getDb } = await import('../../../lib/db');
        const { deviceMaintenanceRecords } = await import('../../../../drizzle/schema');
        const { eq, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (db) {
          const records = await db.select()
            .from(deviceMaintenanceRecords)
            .where(eq(deviceMaintenanceRecords.nodeId, input.machineId))
            .orderBy(desc(deviceMaintenanceRecords.completedAt))
            .limit(20);
          result.maintenanceRecords = records.map(r => ({
            recordId: r.recordId,
            type: r.maintenanceType,
            title: r.title,
            completedAt: r.completedAt?.toISOString() ?? null,
          }));
        }
      }
      return result;
    } catch (err: any) {
      return { found: false, error: err.message };
    }
  },
};

/**
 * 工具 8c: 趋势分析 (FIX-071)
 */
export const getTrendAnalysis: GrokTool = {
  name: 'get_trend_analysis',
  description: '对指定设备传感器数据执行趋势分析（移动平均、线性回归、变点检测）。输入设备ID和传感器ID，返回趋势统计和异常时间段。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备 nodeId'),
    sensorId: z.string().describe('传感器ID'),
    timeRange: z.object({
      start: z.string().describe('开始时间 ISO8601'),
      end: z.string().describe('结束时间 ISO8601'),
    }),
    method: z.enum(['moving_average', 'linear_regression', 'all']).default('all').describe('分析方法'),
    windowSize: z.number().default(10).describe('移动平均窗口大小'),
  }),
  outputSchema: z.object({
    dataPoints: z.number(),
    statistics: z.object({
      mean: z.number(),
      std: z.number(),
      min: z.number(),
      max: z.number(),
      trend: z.enum(['rising', 'falling', 'stable', 'unknown']),
    }),
    linearRegression: z.object({
      slope: z.number(),
      intercept: z.number(),
      rSquared: z.number(),
    }).optional(),
    anomalousSegments: z.array(z.object({
      startTime: z.string(),
      endTime: z.string(),
      deviation: z.number(),
    })),
  }),
  execute: async (input, context) => {
    try {
      const { clickhouseStorage } = await import('../../../lib/storage/clickhouse.storage');
      // 从 ClickHouse 查询原始数据
      let rawData: Array<{ value: number; timestamp: Date }> = [];
      try {
        const readings = await clickhouseStorage.querySensorReadingsRaw({
          nodeIds: [input.machineId],
          sensorIds: [input.sensorId],
          timeRange: {
            start: new Date(input.timeRange.start),
            end: new Date(input.timeRange.end),
          },
          limit: 10000,
          orderBy: 'asc',
        });
        rawData = readings.map(r => ({ value: r.value, timestamp: r.timestamp }));
      } catch {
        // ClickHouse 不可用时降级
        rawData = [];
      }
      const rows = rawData.map(r => ({
        ts: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
        value: r.value,
      }));

      if (rows.length === 0) {
        return {
          dataPoints: 0,
          statistics: { mean: 0, std: 0, min: 0, max: 0, trend: 'unknown' as const },
          anomalousSegments: [],
        };
      }

      const values = rows.map(r => Number(r.value));
      const n = values.length;
      const mean = values.reduce((s, v) => s + v, 0) / n;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);
      const min = Math.min(...values);
      const max = Math.max(...values);

      // 线性回归
      let slope = 0, intercept = 0, rSquared = 0;
      if (n > 1 && (input.method === 'linear_regression' || input.method === 'all')) {
        const xMean = (n - 1) / 2;
        let ssXY = 0, ssXX = 0, ssYY = 0;
        for (let i = 0; i < n; i++) {
          ssXY += (i - xMean) * (values[i] - mean);
          ssXX += (i - xMean) ** 2;
          ssYY += (values[i] - mean) ** 2;
        }
        slope = ssXX > 0 ? ssXY / ssXX : 0;
        intercept = mean - slope * xMean;
        rSquared = ssXX > 0 && ssYY > 0 ? (ssXY ** 2) / (ssXX * ssYY) : 0;
      }

      const trend = Math.abs(slope) < std * 0.01 ? 'stable' as const
        : slope > 0 ? 'rising' as const : 'falling' as const;

      // 异常段检测: >2σ
      const anomalousSegments: Array<{ startTime: string; endTime: string; deviation: number }> = [];
      let segStart: number | null = null;
      for (let i = 0; i < n; i++) {
        const dev = Math.abs(values[i] - mean) / (std || 1);
        if (dev > 2) {
          if (segStart === null) segStart = i;
        } else if (segStart !== null) {
          anomalousSegments.push({
            startTime: rows[segStart].ts,
            endTime: rows[i - 1].ts,
            deviation: Math.abs(values[segStart] - mean) / (std || 1),
          });
          segStart = null;
        }
      }
      if (segStart !== null) {
        anomalousSegments.push({
          startTime: rows[segStart].ts,
          endTime: rows[n - 1].ts,
          deviation: Math.abs(values[segStart] - mean) / (std || 1),
        });
      }

      const result: Record<string, unknown> = {
        dataPoints: n,
        statistics: { mean, std, min, max, trend },
        anomalousSegments,
      };
      if (input.method === 'linear_regression' || input.method === 'all') {
        result.linearRegression = { slope, intercept, rSquared };
      }
      return result;
    } catch (err: any) {
      return {
        dataPoints: 0,
        statistics: { mean: 0, std: 0, min: 0, max: 0, trend: 'unknown' as const },
        anomalousSegments: [],
        error: err.message,
      };
    }
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
// FIX-067/069/072: 新增感知/诊断工具
// ============================================================================

/**
 * FIX-067: 获取天气/环境数据
 *
 * 港口环境因素（风速、温度、湿度、盐雾）对设备诊断至关重要。
 * 当前实现返回平台已采集的环境传感器数据；
 * 外部气象 API 集成留待后续配置。
 */
export const getWeatherData: GrokTool = {
  name: 'get_weather_data',
  description: '获取设备所在区域的环境/天气数据（风速、温度、湿度等）。用于分析环境因素对设备运行的影响。',
  loopStage: 'perception',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID，用于定位所属区域'),
    timeRange: z.object({
      start: z.number().describe('开始时间 (epoch ms)'),
      end: z.number().describe('结束时间 (epoch ms)'),
    }).optional().describe('时间范围，默认最近1小时'),
    metrics: z.array(z.string()).optional().describe('指标列表，如 ["wind_speed", "temperature", "humidity"]'),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    source: z.enum(['sensor', 'external_api', 'unavailable']),
    data: z.array(z.object({
      timestamp: z.number(),
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
    })),
    summary: z.object({
      avgTemperature: z.number().optional(),
      avgWindSpeed: z.number().optional(),
      avgHumidity: z.number().optional(),
    }).optional(),
    message: z.string().optional(),
  }),
  execute: async (input, context) => {
    // 尝试从 ClickHouse 获取环境传感器数据
    try {
      const { clickhouseStorage } = await import('../../../lib/storage/clickhouse.storage');
      const now = Date.now();
      const start = new Date(input.timeRange?.start || (now - 3600_000));
      const end = new Date(input.timeRange?.end || now);
      const metrics = input.metrics || ['wind_speed', 'temperature', 'humidity'];

      const rows = await clickhouseStorage.querySensorReadingsRaw({
        nodeIds: [input.machineId || context.machineId || ''],
        sensorIds: metrics,
        timeRange: { start, end },
      });

      if (rows.length > 0) {
        const data = rows.map(r => ({
          timestamp: r.timestamp instanceof Date ? r.timestamp.getTime() : Number(r.timestamp),
          metric: r.metric_name || r.sensor_id || '',
          value: Number(r.value),
          unit: r.unit || '',
        }));
        return { available: true, source: 'sensor' as const, data };
      }
    } catch {
      // ClickHouse 不可用，降级
    }

    return {
      available: false,
      source: 'unavailable' as const,
      data: [],
      message: '当前无可用环境数据。建议检查环境传感器是否接入平台。',
    };
  },
};

/**
 * FIX-069: 获取作业上下文（工况信息）
 *
 * 返回设备当前或历史作业上下文，包括工况ID、作业类型、负载等级等。
 * 工况信息是诊断准确性的关键输入。
 */
export const getOperationalContext: GrokTool = {
  name: 'get_operational_context',
  description: '获取设备的作业上下文信息（工况、负载、运行模式等）。用于结合工况进行精确诊断。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    timestamp: z.number().optional().describe('查询时刻 (epoch ms)，默认当前时刻'),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    context: z.object({
      conditionId: z.string().optional(),
      operationMode: z.string().optional(),
      loadLevel: z.enum(['idle', 'light', 'medium', 'heavy', 'overload']).optional(),
      rpm: z.number().optional(),
      loadPercent: z.number().optional(),
      cycleCount: z.number().optional(),
      operatorId: z.string().optional(),
      taskType: z.string().optional(),
    }).optional(),
    message: z.string().optional(),
  }),
  execute: async (input, context) => {
    try {
      // 从 ClickHouse 获取最近的工况数据
      const { clickhouseStorage } = await import('../../../lib/storage/clickhouse.storage');
      const queryTime = new Date(input.timestamp || Date.now());
      const start = new Date(queryTime.getTime() - 300_000); // 最近5分钟

      const rows = await clickhouseStorage.querySensorReadingsRaw({
        nodeIds: [input.machineId || context.machineId || ''],
        sensorIds: ['rpm', 'load_pct'],
        timeRange: { start, end: queryTime },
      });

      if (rows.length > 0) {
        const rpm = rows.find(r => r.sensor_id === 'rpm' || r.metric_name === 'rpm');
        const load = rows.find(r => r.sensor_id === 'load_pct' || r.metric_name === 'load_pct');
        const loadPct = load ? Number(load.value) : undefined;
        const loadLevel = loadPct == null ? undefined
          : loadPct < 5 ? 'idle' as const
          : loadPct < 30 ? 'light' as const
          : loadPct < 70 ? 'medium' as const
          : loadPct < 95 ? 'heavy' as const
          : 'overload' as const;

        return {
          available: true,
          context: {
            conditionId: context.conditionId,
            rpm: rpm ? Number(rpm.value) : undefined,
            loadPercent: loadPct,
            loadLevel,
          },
        };
      }
    } catch {
      // ClickHouse 不可用，降级
    }

    return {
      available: false,
      message: '无法获取设备作业上下文。请确认设备ID正确并且设备在线。',
    };
  },
};

/**
 * FIX-072: 获取专家知识（知识图谱查询）
 *
 * 从 Neo4j 知识图谱中检索设备相关的专家知识、
 * 历史案例关联、部件关系、故障模式等。
 */
export const getExpertKnowledge: GrokTool = {
  name: 'get_expert_knowledge',
  description: '从知识图谱中检索与设备/故障相关的专家知识、历史案例、部件关系和故障模式。用于辅助推理和决策。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    query: z.string().describe('知识查询内容，如设备型号、部件名称、故障现象'),
    machineId: z.string().optional().describe('设备ID（可选，用于限定查询范围）'),
    knowledgeType: z.enum(['fault_pattern', 'component_relation', 'maintenance_case', 'expert_rule', 'all'])
      .optional().default('all').describe('知识类型'),
    limit: z.number().optional().default(10).describe('返回结果数量上限'),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    results: z.array(z.object({
      type: z.string(),
      title: z.string(),
      content: z.string(),
      confidence: z.number(),
      source: z.string(),
    })),
    totalFound: z.number(),
    message: z.string().optional(),
  }),
  execute: async (input, context) => {
    try {
      const { neo4jStorage } = await import('../../../lib/storage/neo4j.storage');

      // 使用已有的 searchFaults 方法查询故障知识
      const faults = await neo4jStorage.searchFaults(input.query, input.limit || 10);

      const results = faults.map((f) => ({
        type: 'fault_pattern',
        title: f.name || f.code || '',
        content: f.description || '',
        confidence: 0.7,
        source: 'knowledge_graph',
      }));

      return {
        available: results.length > 0,
        results,
        totalFound: results.length,
      };
    } catch {
      // Neo4j 不可用，降级
    }

    return {
      available: false,
      results: [],
      totalFound: 0,
      message: '知识图谱暂不可用。诊断将仅基于数据驱动方式进行。',
    };
  },
};

// ============================================================================
// FIX-068: runSimulation — 调用数字孪生引擎进行仿真
// ============================================================================

/** 数字孪生仿真工具（diagnosis 阶段使用） */
export const runSimulation: GrokTool = {
  name: 'run_simulation',
  description: '调用数字孪生引擎对设备进行虚拟仿真，支持故障注入和环境条件模拟。可预测设备在特定工况下的行为轨迹。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    machineId: z.string().describe('目标设备 ID'),
    scenarioName: z.string().optional().describe('仿真场景名称'),
    durationSeconds: z.number().min(1).max(3600).default(60).describe('仿真时长（秒）'),
    timeStepSeconds: z.number().min(0.1).max(10).default(1).describe('时间步长（秒）'),
    environment: z.object({
      temperature: z.number().optional(),
      humidity: z.number().optional(),
      windSpeed: z.number().optional(),
    }).optional().describe('环境条件'),
    faultInjections: z.array(z.object({
      component: z.string(),
      faultType: z.string(),
      severity: z.number().min(0).max(1),
      timestamp: z.number().optional(),
    })).optional().describe('故障注入配置'),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    executionId: z.string().optional(),
    summary: z.object({
      maxStress: z.number(),
      maxTemperature: z.number(),
      totalFatigueIncrement: z.number(),
      alerts: z.number(),
    }).optional(),
    events: z.array(z.object({
      timestamp: z.number(),
      type: z.string(),
      description: z.string(),
      severity: z.string(),
    })).optional(),
    trajectoryLength: z.number().optional(),
    message: z.string().optional(),
  }),
  execute: async (input, context) => {
    try {
      const { DigitalTwinEngine } = await import('../../digital-twin/digital-twin');
      const engine = new DigitalTwinEngine();

      const scenario = {
        scenarioId: `grok-sim-${Date.now()}`,
        name: input.scenarioName || `Grok 诊断仿真 (${input.machineId})`,
        description: `由 Grok 诊断引擎发起的仿真，目标设备: ${input.machineId}`,
        initialOverrides: {},
        environment: {
          windSpeed: input.environment?.windSpeed ?? 5,
          windDirection: 0,
          temperature: input.environment?.temperature ?? 25,
          humidity: input.environment?.humidity ?? 60,
          seaState: 2,
        },
        operations: [],
        faultInjections: (input.faultInjections || []).map((fi: { timestamp?: number; component: string; faultType: string; severity: number }, idx: number) => ({
          timestamp: fi.timestamp ?? idx * 10,
          component: fi.component,
          faultType: fi.faultType,
          severity: fi.severity,
        })),
        durationSeconds: input.durationSeconds,
        timeStepSeconds: input.timeStepSeconds,
      };

      const result = await engine.simulate(scenario);

      return {
        available: true,
        executionId: result.executionId,
        summary: {
          maxStress: result.summary?.maxStress ?? 0,
          maxTemperature: result.summary?.maxTemperature ?? 0,
          totalFatigueIncrement: result.summary?.totalFatigueIncrement ?? 0,
          alerts: result.events?.filter(e => e.type === 'alert').length ?? 0,
        },
        events: (result.events || []).slice(0, 20),
        trajectoryLength: result.trajectory?.length ?? 0,
      };
    } catch {
      return {
        available: false,
        message: '数字孪生引擎暂不可用。可基于历史数据和物理模型进行诊断推理。',
      };
    }
  },
};

// ============================================================================
// 工具注册表
// ============================================================================

/** 所有内置工具 (18 个) */
export const BUILTIN_GROK_TOOLS: GrokTool[] = [
  querySensorRealtime,
  queryClickhouseAnalytics,
  queryKnowledgeGraph,
  computePhysicsFormula,
  searchSimilarCases,
  getEquipmentSpecs,     // FIX-065
  getTrendAnalysis,      // FIX-071
  predictDeviceState,
  counterfactualAnalysis,
  generateDiagnosisReport,
  evaluateGuardrailAction,
  generateFeatureCode,
  generateRulePatch,
  validateHypothesis,
  getWeatherData,            // FIX-067
  getOperationalContext,     // FIX-069
  getExpertKnowledge,        // FIX-072
  runSimulation,             // FIX-068
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
