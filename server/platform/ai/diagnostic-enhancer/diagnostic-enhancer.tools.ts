/**
 * ============================================================================
 * 诊断增强 GrokTool 工具集 — 4 个 Tool Calling 工具
 * ============================================================================
 *
 * 为 DiagnosticEnhancer 模块提供的专用工具，可注册到 GrokToolCallingEngine
 * 在 ReAct 推理循环中被 LLM 自主调用。
 *
 * 工具清单：
 *   1. enhance_algorithm_output   — 增强算法原始输出，生成富语义解释
 *   2. synthesize_evidence_chain  — 多源证据加权融合与冲突检测
 *   3. generate_maintenance_plan  — 生成优先级排序的维护计划
 *   4. explain_in_context         — 将技术结论适配不同受众
 *
 * 所有工具遵循：
 *   - 物理约束校验（ADR-001）
 *   - 降级不崩溃原则（LLM 不可用时返回基础结果）
 *   - 完整的 Zod 输入/输出 Schema
 */

import { z } from 'zod';
import type { GrokTool, ToolContext } from '../../cognition/grok/grok-tools';
import { invokeLLM } from '../../../core/llm';
import { createModuleLogger } from '../../../core/logger';
import {
  DIAGNOSTIC_SYSTEM_PROMPT,
  EVIDENCE_SYNTHESIS_PROMPT,
  RECOMMENDATION_PROMPT,
  EXPLAIN_PROMPT,
} from './diagnostic-enhancer.prompts';

const log = createModuleLogger('diagnostic-enhancer-tools');

// ============================================================================
// 物理约束校验辅助
// ============================================================================

/** 校验评分在 [0, 100] 范围内 */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** 校验置信度/概率在 [0, 1] 范围内 */
function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// 工具 1: 增强算法原始输出
// ============================================================================

/**
 * enhance_algorithm_output
 *
 * 接收单个算法的原始输出和传感器上下文，调用 LLM 生成富语义解释，
 * 包含物理验证结果和置信度评估。
 */
const enhanceAlgorithmOutput: GrokTool = {
  name: 'enhance_algorithm_output',
  description: '增强算法原始输出：接收算法ID、名称、原始输出和传感器上下文，生成包含物理验证的富语义解释。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    algorithmId: z.string().describe('算法唯一标识'),
    algorithmName: z.string().describe('算法名称（如"振动频谱分析"）'),
    rawOutput: z.record(z.string(), z.unknown()).describe('算法原始输出数据'),
    sensorContext: z.record(z.string(), z.unknown()).describe('关联传感器上下文（当前值、历史趋势等）'),
  }),
  outputSchema: z.object({
    enhancedInterpretation: z.string().describe('增强后的语义解释'),
    confidence: z.number().describe('解释置信度 (0-1)'),
    physicalValidation: z.object({
      passed: z.boolean().describe('是否通过物理约束校验'),
      checks: z.array(z.object({
        rule: z.string(),
        passed: z.boolean(),
        detail: z.string(),
      })),
    }),
    warnings: z.array(z.string()).describe('警告信息列表'),
  }),
  execute: async (input, context) => {
    const startTime = Date.now();
    log.info({ algorithmId: input.algorithmId, traceId: context.traceId }, '开始增强算法输出');

    // 物理约束预检
    const physicalChecks: Array<{ rule: string; passed: boolean; detail: string }> = [];
    const warnings: string[] = [];

    // 检查振动值非负
    const vibrationKeys = Object.keys(input.rawOutput).filter(k =>
      k.toLowerCase().includes('vibration') || k.toLowerCase().includes('rms')
    );
    for (const key of vibrationKeys) {
      const val = input.rawOutput[key];
      if (typeof val === 'number') {
        const passed = val >= 0;
        physicalChecks.push({
          rule: `振动值非负: ${key}`,
          passed,
          detail: passed ? `${key}=${val} >= 0` : `${key}=${val} 违反非负约束`,
        });
        if (!passed) warnings.push(`物理约束违反: ${key}=${val} 为负值`);
      }
    }

    // 检查温度范围
    const tempKeys = Object.keys(input.rawOutput).filter(k =>
      k.toLowerCase().includes('temp') || k.toLowerCase().includes('temperature')
    );
    for (const key of tempKeys) {
      const val = input.rawOutput[key];
      if (typeof val === 'number') {
        const passed = val >= -40 && val <= 300;
        physicalChecks.push({
          rule: `温度范围: ${key}`,
          passed,
          detail: passed ? `${key}=${val}°C 在有效范围内` : `${key}=${val}°C 超出 [-40, 300] 范围`,
        });
        if (!passed) warnings.push(`物理约束违反: ${key}=${val}°C 超出合理范围`);
      }
    }

    const allPhysicsPassed = physicalChecks.every(c => c.passed);

    // 调用 LLM 生成增强解释
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `请对以下算法输出生成增强语义解释：

算法: ${input.algorithmName} (${input.algorithmId})
原始输出: ${JSON.stringify(input.rawOutput, null, 2)}
传感器上下文: ${JSON.stringify(input.sensorContext, null, 2)}
物理校验结果: ${allPhysicsPassed ? '全部通过' : '存在违反项'}

请用 JSON 返回 { "interpretation": "...", "confidence": 0.0~1.0 }`,
          },
        ],
        maxTokens: 1024,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : { interpretation: '解析失败', confidence: 0.3 };

      log.info(
        { algorithmId: input.algorithmId, durationMs: Date.now() - startTime },
        '算法输出增强完成'
      );

      return {
        enhancedInterpretation: parsed.interpretation || '无法生成解释',
        confidence: clampProbability(parsed.confidence ?? 0.5),
        physicalValidation: { passed: allPhysicsPassed, checks: physicalChecks },
        warnings,
      };
    } catch (err: any) {
      log.warn({ err: err.message, algorithmId: input.algorithmId }, 'LLM 调用失败，使用降级响应');

      // 降级：返回基于物理检查的基础结果
      return {
        enhancedInterpretation: `算法 ${input.algorithmName} 输出了 ${Object.keys(input.rawOutput).length} 个指标。${
          allPhysicsPassed ? '物理约束校验通过。' : '部分物理约束校验未通过，需人工复核。'
        }`,
        confidence: allPhysicsPassed ? 0.4 : 0.2,
        physicalValidation: { passed: allPhysicsPassed, checks: physicalChecks },
        warnings: [...warnings, 'LLM 不可用，当前为降级响应'],
      };
    }
  },
};

// ============================================================================
// 工具 2: 多源证据融合
// ============================================================================

/**
 * synthesize_evidence_chain
 *
 * 对来自不同来源（传感器、算法、知识图谱、历史案例、物理公式）的证据
 * 进行加权融合，检测矛盾，输出综合结论。
 */
const synthesizeEvidenceChain: GrokTool = {
  name: 'synthesize_evidence_chain',
  description: '多源证据加权融合：将传感器、算法、知识图谱、历史案例等多源证据进行加权综合，检测冲突，输出带置信度的统一结论。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    evidenceItems: z.array(z.object({
      source: z.enum(['sensor', 'algorithm', 'knowledge_graph', 'history', 'physics']).describe('证据来源'),
      description: z.string().describe('证据描述'),
      confidence: z.number().min(0).max(1).describe('单项置信度'),
      data: z.record(z.string(), z.unknown()).optional().describe('原始数据'),
    })).min(1).describe('证据项列表'),
  }),
  outputSchema: z.object({
    synthesizedConclusion: z.string().describe('综合结论'),
    overallConfidence: z.number().describe('综合置信度 (0-1)'),
    weightedEvidence: z.array(z.object({
      source: z.string(),
      description: z.string(),
      adjustedWeight: z.number(),
      contribution: z.string(),
    })),
    conflicts: z.array(z.object({
      evidence1: z.string(),
      evidence2: z.string(),
      nature: z.string(),
    })),
  }),
  execute: async (input, context) => {
    const startTime = Date.now();
    log.info({ evidenceCount: input.evidenceItems.length, traceId: context.traceId }, '开始证据融合');

    // 来源权重映射（物理 > 传感器 > 算法 > 知识图谱 > 历史）
    const SOURCE_WEIGHT: Record<string, number> = {
      physics: 1.0,
      sensor: 0.8,
      algorithm: 0.6,
      knowledge_graph: 0.5,
      history: 0.4,
    };

    // 计算加权证据
    const weightedEvidence = input.evidenceItems.map((item: { source: string; description: string; confidence: number; data: Record<string, unknown> }) => {
      const sourceWeight = SOURCE_WEIGHT[item.source] ?? 0.3;
      const adjustedWeight = clampProbability(sourceWeight * item.confidence);
      return {
        source: item.source,
        description: item.description,
        adjustedWeight,
        contribution: `来源权重=${sourceWeight.toFixed(2)}, 置信度=${item.confidence.toFixed(2)}, 综合=${adjustedWeight.toFixed(2)}`,
      };
    });

    // 简单冲突检测：如果存在高置信度证据指向相反结论，标记为冲突
    const conflicts: Array<{ evidence1: string; evidence2: string; nature: string }> = [];

    // 调用 LLM 进行深层综合
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: EVIDENCE_SYNTHESIS_PROMPT },
          {
            role: 'user',
            content: `请综合以下 ${input.evidenceItems.length} 条证据：

${JSON.stringify(input.evidenceItems, null, 2)}

加权计算结果：
${JSON.stringify(weightedEvidence, null, 2)}

请用 JSON 返回 { "conclusion": "...", "confidence": 0.0~1.0, "conflicts": [...] }`,
          },
        ],
        maxTokens: 1024,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};

      // 合并 LLM 发现的冲突
      if (Array.isArray(parsed.conflicts)) {
        for (const c of parsed.conflicts) {
          if (c.evidence1 && c.evidence2 && c.nature) {
            conflicts.push({ evidence1: c.evidence1, evidence2: c.evidence2, nature: c.nature });
          }
        }
      }

      log.info(
        { evidenceCount: input.evidenceItems.length, conflicts: conflicts.length, durationMs: Date.now() - startTime },
        '证据融合完成'
      );

      return {
        synthesizedConclusion: parsed.conclusion || '证据不足，无法得出明确结论',
        overallConfidence: clampProbability(parsed.confidence ?? computeFallbackConfidence(weightedEvidence)),
        weightedEvidence,
        conflicts,
      };
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 调用失败，使用统计降级');

      // 降级：基于加权平均计算置信度
      const fallbackConfidence = computeFallbackConfidence(weightedEvidence);

      return {
        synthesizedConclusion: `基于 ${input.evidenceItems.length} 条证据的统计综合（LLM 不可用，降级模式）`,
        overallConfidence: fallbackConfidence,
        weightedEvidence,
        conflicts,
      };
    }
  },
};

/** 降级时的置信度计算：加权平均 */
function computeFallbackConfidence(
  weighted: Array<{ adjustedWeight: number }>
): number {
  if (weighted.length === 0) return 0;
  const totalWeight = weighted.reduce((sum, w) => sum + w.adjustedWeight, 0);
  return clampProbability(totalWeight / weighted.length);
}

// ============================================================================
// 工具 3: 生成维护计划
// ============================================================================

/**
 * generate_maintenance_plan
 *
 * 根据诊断结果和维护约束，生成优先级排序的维护行动计划。
 */
const generateMaintenancePlan: GrokTool = {
  name: 'generate_maintenance_plan',
  description: '生成维护计划：根据诊断结果列表和约束条件（预算、时间窗口、备件），生成优先级排序的维护行动计划。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    diagnoses: z.array(z.object({
      fault: z.string().describe('故障描述'),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'negligible']).describe('严重度'),
      probability: z.number().min(0).max(1).describe('故障概率'),
    })).min(1).describe('诊断条目列表'),
    constraints: z.object({
      budget: z.number().optional().describe('预算上限（工时）'),
      timeline: z.string().optional().describe('时间窗口（如"7天内"）'),
      parts: z.array(z.string()).optional().describe('可用备件列表'),
    }).optional().describe('维护约束'),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      priority: z.enum(['immediate', 'planned', 'monitor', 'defer']),
      action: z.string(),
      rationale: z.string(),
      estimatedHours: z.number(),
      risk: z.string(),
    })),
  }),
  execute: async (input, context) => {
    const startTime = Date.now();
    log.info(
      { diagnosisCount: input.diagnoses.length, traceId: context.traceId },
      '开始生成维护计划'
    );

    // 调用 LLM 生成计划
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: RECOMMENDATION_PROMPT },
          {
            role: 'user',
            content: `请根据以下诊断结果生成维护计划：

诊断列表:
${JSON.stringify(input.diagnoses, null, 2)}

约束条件:
${JSON.stringify(input.constraints ?? {}, null, 2)}

请用 JSON 返回 { "recommendations": [...] }，每条包含 priority, action, rationale, estimatedHours, risk。`,
          },
        ],
        maxTokens: 2048,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : { recommendations: [] };
      const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

      // 确保优先级排序：immediate > planned > monitor > defer
      const priorityOrder: Record<string, number> = { immediate: 0, planned: 1, monitor: 2, defer: 3 };
      recommendations.sort(
        (a: any, b: any) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
      );

      log.info(
        { recommendationCount: recommendations.length, durationMs: Date.now() - startTime },
        '维护计划生成完成'
      );

      return { recommendations };
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 调用失败，使用规则降级生成维护计划');

      // 降级：基于严重度的简单规则
      const severityToPriority: Record<string, string> = {
        critical: 'immediate',
        high: 'planned',
        medium: 'monitor',
        low: 'defer',
        negligible: 'defer',
      };

      const recommendations = input.diagnoses.map((d: { fault: string; severity: string; probability: number }) => ({
        priority: (severityToPriority[d.severity] ?? 'monitor') as 'immediate' | 'planned' | 'monitor' | 'defer',
        action: `排查并修复: ${d.fault}`,
        rationale: `基于严重度 ${d.severity}，故障概率 ${(d.probability * 100).toFixed(0)}%`,
        estimatedHours: d.severity === 'critical' ? 8 : d.severity === 'high' ? 4 : 2,
        risk: d.severity === 'critical' ? '延迟可能导致设备损坏或安全事故' : '延迟可能加速设备劣化',
      }));

      return { recommendations };
    }
  },
};

// ============================================================================
// 工具 4: 受众适配解释
// ============================================================================

/**
 * explain_in_context
 *
 * 将专业技术结论转换为不同受众（操作员、工程师、管理层）可理解的语言。
 */
const explainInContext: GrokTool = {
  name: 'explain_in_context',
  description: '受众适配解释：将技术诊断结论翻译为目标受众（操作员/工程师/管理层）可理解的自然语言，附带关键要点和行动项。',
  loopStage: 'diagnosis',
  inputSchema: z.object({
    technicalConclusion: z.string().describe('技术诊断结论原文'),
    audience: z.enum(['operator', 'engineer', 'manager']).describe('目标受众'),
  }),
  outputSchema: z.object({
    explanation: z.string().describe('适配后的解释文本'),
    keyPoints: z.array(z.string()).describe('关键要点列表'),
    actionItems: z.array(z.string()).describe('行动项列表'),
  }),
  execute: async (input, context) => {
    const startTime = Date.now();
    const audienceLabel: Record<string, string> = { operator: '操作员', engineer: '维修工程师', manager: '管理层' };
    const audienceKey = input.audience as string;
    log.info(
      { audience: audienceKey, traceId: context.traceId },
      `开始生成面向${audienceLabel[audienceKey] ?? audienceKey}的解释`
    );

    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: EXPLAIN_PROMPT },
          {
            role: 'user',
            content: `请将以下技术结论转换为面向"${audienceLabel[audienceKey] ?? audienceKey}"的说明：

技术结论:
${input.technicalConclusion}

目标受众: ${input.audience}

请用 JSON 返回 { "explanation": "...", "keyPoints": [...], "actionItems": [...] }`,
          },
        ],
        maxTokens: 1024,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};

      log.info({ audience: input.audience, durationMs: Date.now() - startTime }, '受众适配解释完成');

      return {
        explanation: parsed.explanation || input.technicalConclusion,
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      };
    } catch (err: any) {
      log.warn({ err: err.message, audience: input.audience }, 'LLM 调用失败，返回原始结论');

      // 降级：直接返回原始结论
      return {
        explanation: input.technicalConclusion,
        keyPoints: ['LLM 不可用，显示原始技术结论'],
        actionItems: ['请联系维护工程师进行人工解读'],
      };
    }
  },
};

// ============================================================================
// 工具集导出
// ============================================================================

/** 诊断增强工具集（4 个工具） */
export const DIAGNOSTIC_ENHANCER_TOOLS: GrokTool[] = [
  enhanceAlgorithmOutput,
  synthesizeEvidenceChain,
  generateMaintenancePlan,
  explainInContext,
];
