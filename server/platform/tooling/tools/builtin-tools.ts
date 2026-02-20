/**
 * ============================================================================
 * 内置工具集 — 7 个核心工具
 * ============================================================================
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ ID                    │ 分类    │ 描述                                │
 * ├───────────────────────┼─────────┼─────────────────────────────────────┤
 * │ query_device_state    │ query   │ 查询设备当前状态向量                │
 * │ query_diagnosis_hist  │ query   │ 查询诊断历史报告                    │
 * │ analyze_physics       │ analyze │ 物理公式计算（风载/疲劳/腐蚀）      │
 * │ analyze_trend         │ analyze │ 趋势分析（移动平均/线性回归）        │
 * │ execute_guardrail     │ execute │ 手动触发护栏规则                    │
 * │ execute_diagnosis     │ execute │ 触发四维融合诊断                    │
 * │ integrate_knowledge   │ integrate│ 查询/注入知识图谱                  │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../framework/tool-framework';

// ============================================================================
// 工具 1: 查询设备当前状态
// ============================================================================

const queryDeviceState: ToolDefinition = {
  id: 'query_device_state',
  name: '查询设备状态',
  description: '查询指定设备的当前状态向量，包括传感器数据、工况阶段、健康指标等',
  category: 'query',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    dimensions: z.array(z.string()).optional().describe('指定查询的维度列表，为空则返回全部'),
    timeRange: z.object({
      start: z.number().optional().describe('起始时间戳(ms)'),
      end: z.number().optional().describe('结束时间戳(ms)'),
    }).optional().describe('时间范围'),
  }),
  outputSchema: z.object({
    machineId: z.string(),
    timestamp: z.number(),
    values: z.record(z.string(), z.number()),
    cyclePhase: z.string(),
    dataQuality: z.number(),
  }),
  requiredPermissions: ['read:device'],
  timeoutMs: 5000,
  requiresConfirmation: false,
  tags: ['device', 'state', 'query'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { machineId, dimensions } = input as { machineId: string; dimensions?: string[] };

    // 模拟数据（实际应从 ClickHouse/数据库查询）
    const allValues: Record<string, number> = {
      vibrationRms: 1.8 + Math.random() * 0.5,
      motorCurrentMean: 65 + Math.random() * 10,
      windSpeedMean: 6 + Math.random() * 4,
      temperatureBearing: 42 + Math.random() * 8,
      fatigueAccumPercent: 35 + Math.random() * 10,
      corrosionIndex: 0.15 + Math.random() * 0.1,
      loadWeight: 20 + Math.random() * 15,
      loadEccentricity: 0.1 + Math.random() * 0.2,
      cycleTimeSec: 110 + Math.random() * 20,
      powerFactor: 0.82 + Math.random() * 0.1,
      hydraulicPressureMean: 18 + Math.random() * 4,
    };

    const values = dimensions
      ? Object.fromEntries(dimensions.filter(d => d in allValues).map(d => [d, allValues[d]]))
      : allValues;

    return {
      machineId,
      timestamp: Date.now(),
      values,
      cyclePhase: 'lifting',
      dataQuality: 0.95,
    };
  },
};

// ============================================================================
// 工具 2: 查询诊断历史
// ============================================================================

const queryDiagnosisHistory: ToolDefinition = {
  id: 'query_diagnosis_hist',
  name: '查询诊断历史',
  description: '查询指定设备的历史诊断报告，支持按时间范围、风险等级、维度过滤',
  category: 'query',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    limit: z.number().min(1).max(100).default(10).describe('返回数量'),
    riskLevel: z.enum(['safe', 'caution', 'warning', 'danger', 'critical']).optional().describe('风险等级过滤'),
    dimension: z.enum(['safety', 'health', 'efficiency', 'prediction']).optional().describe('维度过滤'),
    startTime: z.number().optional().describe('起始时间戳'),
    endTime: z.number().optional().describe('结束时间戳'),
  }),
  outputSchema: z.array(z.object({
    reportId: z.string(),
    timestamp: z.number(),
    overallScore: z.number(),
    riskLevel: z.string(),
    summary: z.string(),
  })),
  requiredPermissions: ['read:diagnosis'],
  timeoutMs: 10000,
  requiresConfirmation: false,
  tags: ['diagnosis', 'history', 'query'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { machineId, limit } = input as { machineId: string; limit: number };

    // 模拟历史数据
    return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
      reportId: `diag_${machineId}_${Date.now() - i * 3600000}`,
      timestamp: Date.now() - i * 3600000,
      overallScore: 60 + Math.floor(Math.random() * 30),
      riskLevel: ['safe', 'caution', 'warning'][Math.floor(Math.random() * 3)],
      summary: `设备 ${machineId} 第 ${i + 1} 次诊断，综合评分正常`,
    }));
  },
};

// ============================================================================
// 工具 3: 物理公式计算
// ============================================================================

const analyzePhysics: ToolDefinition = {
  id: 'analyze_physics',
  name: '物理公式计算',
  description: '执行物理公式计算：风载力矩、疲劳增量、S-N曲线寿命、腐蚀速率、倾覆安全系数',
  category: 'analyze',
  inputSchema: z.object({
    formula: z.enum([
      'wind_load_moment',
      'fatigue_increment',
      'sn_curve_life',
      'corrosion_rate',
      'overturning_safety_factor',
      'bearing_heat_balance',
    ]).describe('公式名称'),
    parameters: z.record(z.string(), z.number()).describe('公式参数'),
  }),
  outputSchema: z.object({
    formula: z.string(),
    result: z.number(),
    unit: z.string(),
    explanation: z.string(),
    intermediateValues: z.record(z.string(), z.number()).optional(),
  }),
  requiredPermissions: ['read:analysis'],
  timeoutMs: 3000,
  requiresConfirmation: false,
  tags: ['physics', 'calculation', 'analysis'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { formula, parameters } = input as { formula: string; parameters: Record<string, number> };

    switch (formula) {
      case 'wind_load_moment': {
        const rho = parameters['airDensity'] ?? 1.225;
        const v = parameters['windSpeed'] ?? 0;
        const A = parameters['windwardArea'] ?? 120;
        const h = parameters['boomHeight'] ?? 45;
        const M = 0.5 * rho * v * v * A * h / 2;
        return {
          formula: 'M_wind = ½ρv²·A·h/2',
          result: M / 1000,
          unit: 'kN·m',
          explanation: `风速 ${v} m/s 下的风载力矩为 ${(M / 1000).toFixed(2)} kN·m`,
          intermediateValues: { rho, v, A, h, M },
        };
      }
      case 'fatigue_increment': {
        const k = parameters['stressConcentrationFactor'] ?? 2.5;
        const M = parameters['totalMoment'] ?? 0;
        const W = parameters['sectionModulus'] ?? 0.05;
        const deltaS = k * M / (W * 1e6);
        return {
          formula: 'Δσ = k × M / W',
          result: deltaS,
          unit: 'MPa',
          explanation: `应力增量 ${deltaS.toFixed(4)} MPa (k=${k}, M=${M}, W=${W})`,
          intermediateValues: { k, M, W, deltaS },
        };
      }
      case 'sn_curve_life': {
        const C = parameters['snCurveC'] ?? 1e12;
        const m = parameters['snCurveM'] ?? 3;
        const deltaS = parameters['stressRange'] ?? 10;
        const N = C / Math.pow(deltaS, m);
        return {
          formula: 'N = C / (Δσ)^m',
          result: N,
          unit: '次',
          explanation: `应力幅 ${deltaS} MPa 下的疲劳寿命为 ${N.toExponential(2)} 次`,
          intermediateValues: { C, m, deltaS, N },
        };
      }
      case 'corrosion_rate': {
        const k = parameters['corrosionConstant'] ?? 0.001;
        const cl = parameters['chlorideConcentration'] ?? 10;
        const h = parameters['humidity'] ?? 60;
        const r = k * cl * (h / 100);
        return {
          formula: 'r = k·[Cl⁻]·[humidity]',
          result: r * 8760,
          unit: 'mm/年',
          explanation: `腐蚀速率 ${(r * 8760).toFixed(4)} mm/年`,
          intermediateValues: { k, cl, h, r, annualRate: r * 8760 },
        };
      }
      case 'overturning_safety_factor': {
        const Mstab = parameters['stabilizingMoment'] ?? 50000;
        const Mover = parameters['overturningMoment'] ?? 10000;
        const K = Mstab / Math.max(Mover, 1);
        return {
          formula: 'K = M_stabilizing / M_overturning',
          result: K,
          unit: '',
          explanation: `倾覆安全系数 K = ${K.toFixed(2)} (要求 ≥ 1.25)`,
          intermediateValues: { Mstab, Mover, K },
        };
      }
      case 'bearing_heat_balance': {
        const I = parameters['motorCurrent'] ?? 60;
        const R = parameters['resistance'] ?? 0.001;
        const Tamb = parameters['ambientTemp'] ?? 25;
        const hConv = parameters['convectionCoeff'] ?? 0.05;
        const Qgen = I * I * R;
        const Tsteady = Tamb + Qgen / hConv;
        return {
          formula: 'T_steady = T_amb + I²R / h_conv',
          result: Tsteady,
          unit: '°C',
          explanation: `稳态轴承温度 ${Tsteady.toFixed(1)}°C`,
          intermediateValues: { I, R, Tamb, hConv, Qgen, Tsteady },
        };
      }
      default:
        return { formula, result: 0, unit: '', explanation: '未知公式' };
    }
  },
};

// ============================================================================
// 工具 4: 趋势分析
// ============================================================================

const analyzeTrend: ToolDefinition = {
  id: 'analyze_trend',
  name: '趋势分析',
  description: '对时间序列数据进行趋势分析：移动平均、线性回归、变点检测、预测',
  category: 'analyze',
  inputSchema: z.object({
    data: z.array(z.object({
      timestamp: z.number(),
      value: z.number(),
    })).describe('时间序列数据'),
    method: z.enum(['moving_average', 'linear_regression', 'changepoint', 'forecast']).describe('分析方法'),
    window: z.number().optional().describe('窗口大小（移动平均用）'),
    forecastSteps: z.number().optional().describe('预测步数'),
  }),
  outputSchema: z.object({
    method: z.string(),
    trend: z.string(),
    slope: z.number().optional(),
    forecast: z.array(z.number()).optional(),
    changepoints: z.array(z.number()).optional(),
    summary: z.string(),
  }),
  requiredPermissions: ['read:analysis'],
  timeoutMs: 5000,
  requiresConfirmation: false,
  tags: ['trend', 'analysis', 'timeseries'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { data, method, window: windowSize, forecastSteps } = input as {
      data: { timestamp: number; value: number }[];
      method: string;
      window?: number;
      forecastSteps?: number;
    };

    const values = data.map(d => d.value);
    const n = values.length;

    switch (method) {
      case 'moving_average': {
        const w = windowSize || Math.min(5, Math.floor(n / 3));
        const ma: number[] = [];
        for (let i = w - 1; i < n; i++) {
          const sum = values.slice(i - w + 1, i + 1).reduce((s, v) => s + v, 0);
          ma.push(sum / w);
        }
        const trend = ma.length >= 2 ? (ma[ma.length - 1] > ma[0] ? 'increasing' : 'decreasing') : 'stable';
        return {
          method: 'moving_average',
          trend,
          summary: `${w} 点移动平均趋势：${trend}，最新值 ${ma[ma.length - 1]?.toFixed(2)}`,
        };
      }
      case 'linear_regression': {
        const xMean = (n - 1) / 2;
        const yMean = values.reduce((s, v) => s + v, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (i - xMean) * (values[i] - yMean);
          den += (i - xMean) * (i - xMean);
        }
        const slope = den > 0 ? num / den : 0;
        const intercept = yMean - slope * xMean;
        const trend = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';
        return {
          method: 'linear_regression',
          trend,
          slope,
          summary: `线性回归斜率 ${slope.toFixed(4)}，趋势：${trend}，截距 ${intercept.toFixed(2)}`,
        };
      }
      case 'forecast': {
        const steps = forecastSteps || 5;
        const xMean = (n - 1) / 2;
        const yMean = values.reduce((s, v) => s + v, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (i - xMean) * (values[i] - yMean);
          den += (i - xMean) * (i - xMean);
        }
        const slope = den > 0 ? num / den : 0;
        const intercept = yMean - slope * xMean;
        const forecast = Array.from({ length: steps }, (_, i) => intercept + slope * (n + i));
        return {
          method: 'forecast',
          trend: slope > 0 ? 'increasing' : 'decreasing',
          slope,
          forecast,
          summary: `预测未来 ${steps} 步：${forecast.map(f => f.toFixed(2)).join(', ')}`,
        };
      }
      case 'changepoint': {
        // 简化的变点检测（CUSUM）
        const mean = values.reduce((s, v) => s + v, 0) / n;
        let cumSum = 0;
        let maxCumSum = 0;
        let changepointIdx = 0;
        for (let i = 0; i < n; i++) {
          cumSum += values[i] - mean;
          if (Math.abs(cumSum) > maxCumSum) {
            maxCumSum = Math.abs(cumSum);
            changepointIdx = i;
          }
        }
        return {
          method: 'changepoint',
          trend: 'detected',
          changepoints: maxCumSum > mean * 0.5 ? [data[changepointIdx]?.timestamp] : [],
          summary: maxCumSum > mean * 0.5
            ? `检测到变点在索引 ${changepointIdx}（时间 ${new Date(data[changepointIdx]?.timestamp).toISOString()}）`
            : '未检测到显著变点',
        };
      }
      default:
        return { method, trend: 'unknown', summary: '未知分析方法' };
    }
  },
};

// ============================================================================
// 工具 5: 手动触发护栏
// ============================================================================

const executeGuardrail: ToolDefinition = {
  id: 'execute_guardrail',
  name: '触发护栏规则',
  description: '手动触发指定的护栏规则或模拟护栏评估',
  category: 'execute',
  inputSchema: z.object({
    action: z.enum(['evaluate', 'enable', 'disable', 'update_threshold']).describe('操作类型'),
    ruleId: z.string().optional().describe('规则ID'),
    threshold: z.number().optional().describe('新阈值（update_threshold用）'),
    machineId: z.string().optional().describe('设备ID（evaluate用）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    triggeredRules: z.array(z.string()).optional(),
  }),
  requiredPermissions: ['write:guardrail'],
  timeoutMs: 5000,
  requiresConfirmation: true,
  tags: ['guardrail', 'safety', 'execute'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { action, ruleId } = input as { action: string; ruleId?: string };
    return {
      success: true,
      message: `护栏操作 ${action} 执行成功${ruleId ? `（规则 ${ruleId}）` : ''}`,
      triggeredRules: action === 'evaluate' ? ['S-01', 'H-01'] : undefined,
    };
  },
};

// ============================================================================
// 工具 6: 触发四维诊断
// ============================================================================

const executeDiagnosis: ToolDefinition = {
  id: 'execute_diagnosis',
  name: '触发融合诊断',
  description: '对指定设备触发四维融合诊断（安全·健康·高效·预测），生成完整诊断报告',
  category: 'execute',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    cyclePhase: z.string().optional().describe('当前工况阶段'),
    urgent: z.boolean().optional().describe('是否紧急诊断'),
  }),
  outputSchema: z.object({
    reportId: z.string(),
    overallScore: z.number(),
    riskLevel: z.string(),
    recommendations: z.array(z.object({
      priority: z.string(),
      action: z.string(),
    })),
  }),
  requiredPermissions: ['write:diagnosis'],
  timeoutMs: 30000,
  requiresConfirmation: false,
  tags: ['diagnosis', 'execute', 'fusion'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { machineId } = input as { machineId: string };
    return {
      reportId: `diag_${machineId}_${Date.now()}`,
      overallScore: 72,
      riskLevel: 'caution',
      recommendations: [
        { priority: 'P2', action: '建议下次维护时检查吊具导轨润滑' },
        { priority: 'P3', action: '周期时间偏长5%，建议优化联动速度' },
      ],
    };
  },
};

// ============================================================================
// 工具 7: 知识图谱操作
// ============================================================================

const integrateKnowledge: ToolDefinition = {
  id: 'integrate_knowledge',
  name: '知识图谱操作',
  description: '查询或注入知识图谱三元组，支持路径查询、相似度搜索、因果链追溯',
  category: 'integrate',
  inputSchema: z.object({
    action: z.enum(['query', 'inject', 'path', 'similar']).describe('操作类型'),
    subject: z.string().optional().describe('主语实体'),
    predicate: z.string().optional().describe('谓语关系'),
    object: z.string().optional().describe('宾语实体'),
    query: z.string().optional().describe('自然语言查询'),
    limit: z.number().optional().describe('返回数量限制'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      confidence: z.number(),
    })),
    explanation: z.string(),
  }),
  requiredPermissions: ['read:knowledge', 'write:knowledge'],
  timeoutMs: 10000,
  requiresConfirmation: false,
  tags: ['knowledge', 'graph', 'integrate'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { action, subject } = input as { action: string; subject?: string };
    return {
      results: [
        { subject: subject || '岸桥', predicate: 'has_component', object: '起升机构', confidence: 0.99 },
        { subject: subject || '岸桥', predicate: 'affected_by', object: '风载荷', confidence: 0.95 },
        { subject: '风载荷', predicate: 'causes', object: '疲劳加速', confidence: 0.88 },
      ],
      explanation: `${action} 操作完成，返回 ${subject || '岸桥'} 相关的知识三元组`,
    };
  },
};

// ============================================================================
// 导出所有内置工具
// ============================================================================

export const BUILTIN_TOOLS: ToolDefinition[] = [
  queryDeviceState,
  queryDiagnosisHistory,
  analyzePhysics,
  analyzeTrend,
  executeGuardrail,
  executeDiagnosis,
  integrateKnowledge,
];

export {
  queryDeviceState,
  queryDiagnosisHistory,
  analyzePhysics,
  analyzeTrend,
  executeGuardrail,
  executeDiagnosis,
  integrateKnowledge,
};
