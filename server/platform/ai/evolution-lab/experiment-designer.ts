/**
 * ============================================================================
 * 实验设计管线 (Experiment Designer)
 * ============================================================================
 *
 * 将洞察转化为可验证的实验设计，包括假设生成、设计验证、影响评估。
 *
 * 设计流程：
 *   LabInsight → 假设生成(LLM) → 实验参数设计 → 物理约束校验
 *              → 安全评估 → 影响估计 → LabExperiment
 *
 * 核心原则（遵循 CLAUDE.md §9）：
 *   - 物理约束优先：所有实验参数必须通过物理合理性校验
 *   - 降级不崩溃：LLM 不可用时降级为规则模板
 *   - 验证闭环：设计产出必须经过多重校验
 *
 * 架构定位：
 *   InsightCollector → ExperimentDesigner → EvolutionLab
 *   收集阶段          设计阶段              编排阶段
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { MetaLearner } from '../../evolution/metalearner/meta-learner';
import { getAIConfig } from '../ai.config';
import type {
  LabInsight,
  LabExperiment,
  DesignValidation,
  ImpactEstimate,
  RiskLevel,
} from '../ai.types';

const log = createModuleLogger('experiment-designer');

// ============================================================================
// 物理约束范围（安全校验用）
// ============================================================================

/**
 * 物理约束常量
 *
 * 基于港机设备物理特性定义的安全范围，
 * 所有实验参数必须在此范围内。
 * 违反这些约束的实验设计将被自动拒绝。
 *
 * 参考：ADR-001 物理约束作为最高优先级护栏
 */
const PHYSICAL_CONSTRAINTS: Record<string, { max: number; unit: string; description: string }> = {
  vibration_rms_max: { max: 50, unit: 'mm/s', description: '振动有效值上限' },
  temperature_max: { max: 150, unit: '°C', description: '温度上限' },
  current_max: { max: 2000, unit: 'A', description: '电流上限' },
  speed_max: { max: 3000, unit: 'rpm', description: '转速上限' },
  load_factor_max: { max: 1.25, unit: '', description: '过载系数上限' },
  min_safety_margin: { max: 1.0, unit: '', description: '安全裕度（值越大越安全）' },
};

/** 物理约束数值快速索引 */
const CONSTRAINT_VALUES = {
  vibration_rms_max: 50,
  temperature_max: 150,
  current_max: 2000,
  speed_max: 3000,
  load_factor_max: 1.25,
  min_safety_margin: 0.1,
} as const;

/** 安全关键参数名称集合 */
const SAFETY_CRITICAL_PARAMS = new Set([
  'overturningMoment',
  'brakeForce',
  'emergencyStop',
  'loadLimit',
  'windSpeedLimit',
  'safetyFactor',
  'guardrailThreshold',
]);

// ============================================================================
// 实验设计器
// ============================================================================

/**
 * 实验设计管线
 *
 * 将洞察转化为可验证的实验设计，
 * 整合 LLM 辅助设计和 MetaLearner 假设生成。
 */
export class ExperimentDesigner {
  private metaLearner: MetaLearner;

  constructor() {
    this.metaLearner = new MetaLearner();
  }

  // ==========================================================================
  // 公开方法
  // ==========================================================================

  /**
   * 设计实验
   *
   * 基于洞察和当前性能数据，设计可验证的实验方案。
   * 流程：
   *   1. LLM 生成假设和参数（第一优先）
   *   2. MetaLearner 生成候选假设（第二优先）
   *   3. 规则模板生成（最终降级）
   *   4. 物理约束校验
   *   5. 组装 LabExperiment
   *
   * @param insight 输入洞察
   * @param currentPerf 当前性能指标
   * @returns 设计完成的实验
   */
  async design(
    insight: LabInsight,
    currentPerf: Record<string, number>,
  ): Promise<LabExperiment> {
    log.info({ insightId: insight.insightId, title: insight.title }, '开始设计实验');
    const startTime = Date.now();

    // 1. 尝试 LLM 生成假设
    let hypothesis: { hypothesis: string; parameters: Record<string, unknown>; expectedImprovement: number };
    let designedBy: LabExperiment['designedBy'] = 'llm';

    try {
      hypothesis = await this.generateHypothesis(insight);
      log.debug('LLM 假设生成成功');
    } catch (err) {
      log.warn({ error: String(err) }, 'LLM 假设生成失败，尝试 MetaLearner');

      // 2. 尝试 MetaLearner
      try {
        const perfEntries = Object.entries(currentPerf).map(([key, value]) => ({
          score: value,
          context: { [key]: value },
        }));
        const hypotheses = await this.metaLearner.generateHypotheses(perfEntries);

        if (hypotheses.length > 0) {
          const best = hypotheses[0];
          hypothesis = {
            hypothesis: best.description,
            parameters: best.parameters,
            expectedImprovement: best.expectedImprovement,
          };
          designedBy = 'rules'; // MetaLearner 内部可能降级到规则
          log.debug('MetaLearner 假设生成成功');
        } else {
          throw new Error('MetaLearner 返回空假设');
        }
      } catch (metaErr) {
        log.warn({ error: String(metaErr) }, 'MetaLearner 失败，使用规则模板');

        // 3. 最终降级：规则模板
        hypothesis = this.generateTemplateHypothesis(insight);
        designedBy = 'rules';
      }
    }

    // 4. 物理约束校验：清洗不合规参数
    const constraintCheck = this.checkPhysicsConstraints(hypothesis.parameters);
    if (!constraintCheck.valid) {
      log.warn(
        { issues: constraintCheck.issues },
        '假设参数存在物理约束违规，已清洗',
      );
      hypothesis.parameters = this.sanitizeParameters(hypothesis.parameters);
    }

    // 5. 组装 LabExperiment
    const experimentId = crypto.randomUUID();
    const experiment: LabExperiment = {
      experimentId,
      insightId: insight.insightId,
      title: `实验: ${insight.title.substring(0, 60)}`,
      hypothesis: hypothesis.hypothesis,
      designedBy,
      parameters: hypothesis.parameters,
      expectedImprovement: hypothesis.expectedImprovement,
      status: 'designed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    log.info(
      {
        experimentId,
        designedBy,
        expectedImprovement: hypothesis.expectedImprovement,
        durationMs: Date.now() - startTime,
      },
      '实验设计完成',
    );

    return experiment;
  }

  /**
   * 验证实验设计
   *
   * 对已设计的实验进行三重校验：
   *   1. 物理约束校验 — 参数是否在物理合理范围内
   *   2. 参数范围校验 — 参数值是否在允许的搜索空间内
   *   3. 安全校验 — 是否涉及安全关键参数
   *
   * @param experiment 待验证的实验
   * @returns 验证结果
   */
  async validateDesign(experiment: LabExperiment): Promise<DesignValidation> {
    const issues: string[] = [];

    // 1. 物理约束校验
    const physicsResult = this.checkPhysicsConstraints(experiment.parameters);
    if (!physicsResult.valid) {
      issues.push(...physicsResult.issues);
    }

    // 2. 参数范围校验
    const rangeCheck = this.checkParameterRanges(experiment.parameters);
    if (!rangeCheck.valid) {
      issues.push(...rangeCheck.issues);
    }

    // 3. 安全校验
    const safetyResult = this.assessSafety(experiment);
    if (!safetyResult.safe) {
      issues.push(...safetyResult.issues);
    }

    const validation: DesignValidation = {
      valid: physicsResult.valid && rangeCheck.valid && safetyResult.safe,
      physicsCheck: physicsResult.valid,
      parameterRangeCheck: rangeCheck.valid,
      safetyCheck: safetyResult.safe,
      issues,
    };

    log.info(
      {
        experimentId: experiment.experimentId,
        valid: validation.valid,
        issueCount: issues.length,
      },
      '实验设计验证完成',
    );

    return validation;
  }

  /**
   * 估计影响
   *
   * 评估实验部署后的预期影响，包括准确率提升、延迟变化、风险等级等。
   * 先尝试 LLM 智能评估，失败时降级为保守估计。
   *
   * @param experiment 待评估的实验
   * @returns 影响估计结果
   */
  async estimateImpact(experiment: LabExperiment): Promise<ImpactEstimate> {
    // 尝试 LLM 评估
    try {
      const config = getAIConfig();
      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `你是港机设备智能运维平台的实验影响评估专家。
请评估以下实验的预期影响，返回 JSON 格式。
评估维度：
- expectedAccuracyGain: 预期准确率提升（百分比，如 0.05 表示 5%）
- expectedLatencyChange: 预期延迟变化（毫秒，正值表示增加，负值表示减少）
- riskLevel: 风险等级 (critical/high/medium/low/negligible)
- affectedEquipment: 受影响的设备类型列表
- rollbackComplexity: 回滚复杂度 (simple/moderate/complex)

只返回 JSON 对象，不要解释。`,
          },
          {
            role: 'user',
            content: `实验标题: ${experiment.title}
假设: ${experiment.hypothesis}
参数: ${JSON.stringify(experiment.parameters)}
预期改进: ${experiment.expectedImprovement}`,
          },
        ],
        model: config.lab.prioritizationModel,
        maxTokens: 500,
      });

      const content = result.choices?.[0]?.message?.content;
      if (content && typeof content === 'string') {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const impact: ImpactEstimate = {
            expectedAccuracyGain: this.clamp(Number(parsed.expectedAccuracyGain ?? 0), 0, 0.5),
            expectedLatencyChange: Number(parsed.expectedLatencyChange ?? 0),
            riskLevel: this.validateRiskLevel(parsed.riskLevel),
            affectedEquipment: Array.isArray(parsed.affectedEquipment) ? parsed.affectedEquipment : [],
            rollbackComplexity: this.validateRollbackComplexity(parsed.rollbackComplexity),
          };

          log.debug({ experimentId: experiment.experimentId }, 'LLM 影响评估完成');
          return impact;
        }
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'LLM 影响评估失败，使用保守估计');
    }

    // 降级：保守估计
    return this.generateConservativeImpact(experiment);
  }

  // ==========================================================================
  // 假设生成
  // ==========================================================================

  /**
   * LLM 生成假设
   *
   * 调用 LLM 基于洞察上下文生成结构化假设，
   * 包含假设描述、实验参数、预期改进幅度。
   *
   * @param insight 输入洞察
   * @returns 结构化假设
   */
  private async generateHypothesis(
    insight: LabInsight,
  ): Promise<{ hypothesis: string; parameters: Record<string, unknown>; expectedImprovement: number }> {
    const config = getAIConfig();

    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `你是港机设备智能运维平台的实验设计专家。
基于给定的改进洞察，生成一个可验证的实验假设。

要求：
1. hypothesis: 清晰的假设描述（中文，≤100 字）
2. parameters: 实验参数（JSON 对象，包含具体可调的算法参数）
3. expectedImprovement: 预期改进幅度（0.01~0.50，如 0.05 表示 5% 提升）

物理约束（参数不得超出）：
- 振动值 ≤ 50 mm/s
- 温度 ≤ 150°C
- 电流 ≤ 2000A
- 转速 ≤ 3000 rpm
- 过载系数 ≤ 1.25

只返回 JSON 对象，格式：{"hypothesis": "...", "parameters": {...}, "expectedImprovement": 0.05}`,
        },
        {
          role: 'user',
          content: `洞察标题: ${insight.title}
洞察描述: ${insight.description}
洞察来源: ${insight.source}
附加信息: ${JSON.stringify(insight.metadata)}`,
        },
      ],
      model: config.lab.prioritizationModel,
      maxTokens: 800,
    });

    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('LLM 返回空内容');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 输出无法解析为 JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      hypothesis: String(parsed.hypothesis || insight.title),
      parameters: (parsed.parameters || {}) as Record<string, unknown>,
      expectedImprovement: this.clamp(Number(parsed.expectedImprovement ?? 0.05), 0.01, 0.50),
    };
  }

  /**
   * 规则模板生成假设（最终降级）
   *
   * 当 LLM 和 MetaLearner 都不可用时，
   * 基于洞察来源类型使用预定义模板生成假设。
   *
   * @param insight 输入洞察
   * @returns 模板化假设
   */
  private generateTemplateHypothesis(
    insight: LabInsight,
  ): { hypothesis: string; parameters: Record<string, unknown>; expectedImprovement: number } {
    const templates: Record<string, {
      hypothesis: string;
      parameters: Record<string, unknown>;
      expectedImprovement: number;
    }> = {
      intelligence: {
        hypothesis: `基于技术情报发现，引入新算法技术可能提升 "${insight.title}" 相关场景的诊断准确率`,
        parameters: {
          action: 'algorithm_upgrade',
          sourceInsight: insight.insightId,
          method: 'incremental_improvement',
        },
        expectedImprovement: 0.05,
      },
      feedback: {
        hypothesis: `运维反馈指出 "${insight.title}"，通过参数调优可改善该场景的诊断表现`,
        parameters: {
          action: 'parameter_tuning',
          sourceInsight: insight.insightId,
          method: 'bayesian_optimization',
        },
        expectedImprovement: 0.03,
      },
      performance: {
        hypothesis: `性能数据显示 "${insight.title}"，需要通过特征工程或模型更新恢复性能`,
        parameters: {
          action: 'feature_engineering',
          sourceInsight: insight.insightId,
          method: 'feature_selection',
        },
        expectedImprovement: 0.04,
      },
      scheduled: {
        hypothesis: `飞轮历史显示 "${insight.title}" 反复出现，需要系统性优化`,
        parameters: {
          action: 'systematic_optimization',
          sourceInsight: insight.insightId,
          method: 'root_cause_analysis',
        },
        expectedImprovement: 0.06,
      },
      manual: {
        hypothesis: `手动提交的改进建议："${insight.title}"`,
        parameters: {
          action: 'manual_improvement',
          sourceInsight: insight.insightId,
          method: 'guided_optimization',
        },
        expectedImprovement: 0.04,
      },
    };

    return templates[insight.source] || templates.manual!;
  }

  // ==========================================================================
  // 物理约束校验
  // ==========================================================================

  /**
   * 物理约束校验
   *
   * 遍历实验参数，检查是否存在超出物理约束范围的值。
   * 遵循 ADR-001：物理约束作为最高优先级护栏。
   *
   * @param params 实验参数
   * @returns 校验结果
   */
  private checkPhysicsConstraints(
    params: Record<string, unknown>,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const checkValue = (key: string, value: unknown, path: string): void => {
      if (typeof value !== 'number') return;

      // 振动类参数
      if (key.toLowerCase().includes('vibration') && value > CONSTRAINT_VALUES.vibration_rms_max) {
        issues.push(`[物理约束] ${path} = ${value} 超出振动上限 ${CONSTRAINT_VALUES.vibration_rms_max} mm/s`);
      }
      // 温度类参数
      if (key.toLowerCase().includes('temperature') && value > CONSTRAINT_VALUES.temperature_max) {
        issues.push(`[物理约束] ${path} = ${value} 超出温度上限 ${CONSTRAINT_VALUES.temperature_max} °C`);
      }
      // 电流类参数
      if (key.toLowerCase().includes('current') && value > CONSTRAINT_VALUES.current_max) {
        issues.push(`[物理约束] ${path} = ${value} 超出电流上限 ${CONSTRAINT_VALUES.current_max} A`);
      }
      // 转速类参数
      if (key.toLowerCase().includes('speed') && value > CONSTRAINT_VALUES.speed_max) {
        issues.push(`[物理约束] ${path} = ${value} 超出转速上限 ${CONSTRAINT_VALUES.speed_max} rpm`);
      }
      // 过载系数
      if (key.toLowerCase().includes('load_factor') && value > CONSTRAINT_VALUES.load_factor_max) {
        issues.push(`[物理约束] ${path} = ${value} 超出过载系数上限 ${CONSTRAINT_VALUES.load_factor_max}`);
      }
      // 负值校验（物理量不可为负）
      if (
        (key.toLowerCase().includes('vibration') ||
          key.toLowerCase().includes('temperature') ||
          key.toLowerCase().includes('current')) &&
        value < 0
      ) {
        issues.push(`[物理约束] ${path} = ${value} 为负值，物理量不可为负`);
      }
    };

    // 递归遍历参数
    const traverse = (obj: Record<string, unknown>, prefix: string): void => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'number') {
          checkValue(key, value, path);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          traverse(value as Record<string, unknown>, path);
        } else if (Array.isArray(value)) {
          // 检查搜索空间范围（如 [min, max]）
          for (const item of value) {
            if (typeof item === 'number') {
              checkValue(key, item, `${path}[]`);
            }
          }
        }
      }
    };

    traverse(params, '');

    return { valid: issues.length === 0, issues };
  }

  /**
   * 参数范围校验
   *
   * 检查实验参数值是否在合理的数值范围内（非物理约束，而是算法参数范围）。
   *
   * @param params 实验参数
   * @returns 校验结果
   */
  private checkParameterRanges(
    params: Record<string, unknown>,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const checkRange = (key: string, value: unknown, path: string): void => {
      if (typeof value !== 'number') return;

      // 学习率
      if (key.toLowerCase().includes('learningrate') || key.toLowerCase().includes('learning_rate')) {
        if (value <= 0 || value > 1) {
          issues.push(`[参数范围] ${path} = ${value} 学习率应在 (0, 1] 之间`);
        }
      }
      // 权重/系数
      if (key.toLowerCase().includes('weight') || key.toLowerCase().includes('factor')) {
        if (value < -10 || value > 10) {
          issues.push(`[参数范围] ${path} = ${value} 权重/系数超出合理范围 [-10, 10]`);
        }
      }
      // 阈值
      if (key.toLowerCase().includes('threshold')) {
        if (value < 0 || value > 1000) {
          issues.push(`[参数范围] ${path} = ${value} 阈值超出合理范围 [0, 1000]`);
        }
      }
    };

    const traverse = (obj: Record<string, unknown>, prefix: string): void => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'number') {
          checkRange(key, value, path);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          traverse(value as Record<string, unknown>, path);
        }
      }
    };

    traverse(params, '');

    return { valid: issues.length === 0, issues };
  }

  // ==========================================================================
  // 安全评估
  // ==========================================================================

  /**
   * 安全评估
   *
   * 保守的安全评估策略：
   *   - 涉及安全关键参数的实验需要人工审核
   *   - 预期改进超过 30% 的实验标记为高风险（可能不现实）
   *   - 无参数的实验默认安全
   *
   * @param experiment 待评估的实验
   * @returns 安全评估结果
   */
  private assessSafety(
    experiment: LabExperiment,
  ): { safe: boolean; riskLevel: RiskLevel; issues: string[] } {
    const issues: string[] = [];
    let riskLevel: RiskLevel = 'low';

    // 检查是否涉及安全关键参数
    const paramKeys = this.flattenKeys(experiment.parameters);
    const safetyCriticalKeys = paramKeys.filter(k => SAFETY_CRITICAL_PARAMS.has(k));

    if (safetyCriticalKeys.length > 0) {
      riskLevel = 'high';
      issues.push(
        `[安全] 实验涉及安全关键参数: ${safetyCriticalKeys.join(', ')}，需要人工审核`,
      );
    }

    // 预期改进过高可能不现实
    if (experiment.expectedImprovement > 0.30) {
      if (riskLevel === 'low') riskLevel = 'medium';
      issues.push(
        `[安全] 预期改进 ${(experiment.expectedImprovement * 100).toFixed(0)}% 偏高，建议验证假设合理性`,
      );
    }

    // 参数为空视为安全
    if (Object.keys(experiment.parameters).length === 0) {
      return { safe: true, riskLevel: 'negligible', issues: [] };
    }

    return {
      safe: issues.length === 0,
      riskLevel,
      issues,
    };
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  /**
   * 清洗不合规参数
   *
   * 将超出物理约束的参数值截断到安全范围内。
   */
  private sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized = structuredClone(params);

    const sanitize = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') {
          if (key.toLowerCase().includes('vibration')) {
            obj[key] = this.clamp(value, 0, CONSTRAINT_VALUES.vibration_rms_max);
          } else if (key.toLowerCase().includes('temperature')) {
            obj[key] = this.clamp(value, -40, CONSTRAINT_VALUES.temperature_max);
          } else if (key.toLowerCase().includes('current')) {
            obj[key] = this.clamp(value, 0, CONSTRAINT_VALUES.current_max);
          } else if (key.toLowerCase().includes('speed')) {
            obj[key] = this.clamp(value, 0, CONSTRAINT_VALUES.speed_max);
          } else if (key.toLowerCase().includes('load_factor')) {
            obj[key] = this.clamp(value, 0, CONSTRAINT_VALUES.load_factor_max);
          }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          sanitize(value as Record<string, unknown>);
        }
      }
    };

    sanitize(sanitized);
    return sanitized;
  }

  /**
   * 生成保守影响估计（LLM 降级方案）
   */
  private generateConservativeImpact(experiment: LabExperiment): ImpactEstimate {
    const hasParamChange = Object.keys(experiment.parameters).length > 0;
    const paramKeys = this.flattenKeys(experiment.parameters);
    const touchesSafety = paramKeys.some(k => SAFETY_CRITICAL_PARAMS.has(k));

    return {
      expectedAccuracyGain: Math.min(experiment.expectedImprovement * 0.5, 0.1),
      expectedLatencyChange: hasParamChange ? 5 : 0,
      riskLevel: touchesSafety ? 'high' : hasParamChange ? 'medium' : 'low',
      affectedEquipment: [],
      rollbackComplexity: touchesSafety ? 'complex' : 'simple',
    };
  }

  /**
   * 展平嵌套对象的键名
   */
  private flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(key); // 添加叶子键名
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        keys.push(...this.flattenKeys(value as Record<string, unknown>, fullKey));
      }
    }
    return keys;
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 验证风险等级
   */
  private validateRiskLevel(level: unknown): RiskLevel {
    const valid: RiskLevel[] = ['critical', 'high', 'medium', 'low', 'negligible'];
    return valid.includes(level as RiskLevel) ? (level as RiskLevel) : 'medium';
  }

  /**
   * 验证回滚复杂度
   */
  private validateRollbackComplexity(complexity: unknown): 'simple' | 'moderate' | 'complex' {
    const valid = ['simple', 'moderate', 'complex'] as const;
    return valid.includes(complexity as typeof valid[number])
      ? (complexity as typeof valid[number])
      : 'moderate';
  }
}
