/**
 * ============================================================================
 * 融合维处理器 — FusionProcessor
 * ============================================================================
 *
 * 认知闭环四维之三：融合维（证据整合）
 *
 * 职责：
 *   1. 证据收集 — 从多个维度和数据源收集证据
 *   2. DS 融合 — 使用 DS 融合引擎整合多源证据
 *   3. 冲突分析 — 检测证据间的冲突并分析原因
 *   4. 信息增益评估 — 评估本次认知活动的信息增益
 *
 * 与平台现有组件的对接：
 *   - 使用 DSFusionEngine 执行 Dempster-Shafer 融合
 *   - 接收感知维和推演维的输出作为证据源
 *   - 结果传递给决策维进行行动排序
 *
 * 对应 v3.0 方案 U-15（融合维部分）
 */

import { createModuleLogger } from '../../../core/logger';
import type { DimensionProcessor, DimensionContext } from '../engines/cognition-unit';
import { DSFusionEngine } from '../engines/ds-fusion.engine';
// v5.0: 可选接入证据融合引擎和不确定性量化器
import type { DSFusionEngine as DSFusionEngineV5Type } from '../../perception/fusion/ds-fusion-engine';
import type { UncertaintyQuantifier } from '../../perception/fusion/uncertainty-quantifier';
import type {
  CognitionStimulus,
  FusionOutput,
  PerceptionOutput,
  ReasoningOutput,
  DegradationMode,
  DSEvidenceInput,
  DSFusionEngineConfig,
} from '../types';

const log = createModuleLogger('fusionProcessor');

// ============================================================================
// 融合维处理器配置
// ============================================================================

export interface FusionConfig {
  /** DS 融合引擎配置 */
  dsFusionConfig: DSFusionEngineConfig;
  /** 冲突度阈值 — 超过此值标记为有冲突 */
  conflictThreshold: number;
  /** 最小信息增益 — 低于此值认为无信息增益 */
  minInformationGain: number;
}

const DEFAULT_DS_CONFIG: DSFusionEngineConfig = {
  frameOfDiscernment: ['normal', 'degraded', 'faulty', 'unknown'],
  defaultStrategy: 'dempster',
  highConflictThreshold: 0.5,
  extremeConflictThreshold: 0.8,
  conflictPenaltyFactor: 0.3,
  sources: [],
};

const DEFAULT_CONFIG: FusionConfig = {
  dsFusionConfig: DEFAULT_DS_CONFIG,
  conflictThreshold: 0.3,
  minInformationGain: 0.01,
};

// ============================================================================
// 融合维处理器实现
// ============================================================================

export class FusionProcessor implements DimensionProcessor<FusionOutput> {
  readonly dimension = 'fusion' as const;
  private readonly config: FusionConfig;
  private readonly dsFusionEngine: DSFusionEngine;
  /** v5.0: 可选证据融合引擎（Dempster-Shafer + Murphy 高冲突处理 + Bayesian 自调） */
  private dsFusionEngineV5?: DSFusionEngineV5Type;
  /** v5.0: 可选不确定性量化器 */
  private uncertaintyQuantifier?: UncertaintyQuantifier;

  constructor(config?: Partial<FusionConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      dsFusionConfig: {
        ...DEFAULT_DS_CONFIG,
        ...config?.dsFusionConfig,
      },
    };
    this.dsFusionEngine = new DSFusionEngine(this.config.dsFusionConfig);
  }

  /** v5.0: 注入证据融合引擎 V5（支持 Murphy 高冲突处理 + Bayesian 自调） */
  setDSFusionEngineV5(engine: DSFusionEngineV5Type): void {
    this.dsFusionEngineV5 = engine;
  }

  /** v5.0: 注入不确定性量化器 */
  setUncertaintyQuantifier(quantifier: UncertaintyQuantifier): void {
    this.uncertaintyQuantifier = quantifier;
  }

  /**
   * 执行融合维处理
   *
   * @param stimulus 刺激信号
   * @param degradationMode 降级模式
   * @param perceptionOutput 感知维输出
   * @param reasoningOutput 推演维输出
   */
  async process(
    stimulus: CognitionStimulus,
    context: DimensionContext,
  ): Promise<FusionOutput> {
    // P0-CODE-4: 统一签名为 (stimulus, context)
    const degradationMode = context.degradationMode;
    const perceptionOutput = context.completedDimensions.get('perception') as PerceptionOutput | undefined;
    const reasoningOutput = context.completedDimensions.get('reasoning') as ReasoningOutput | undefined;
    const startTime = Date.now();

    try {
      // 1. 收集证据
      const evidences = this.collectEvidences(
        stimulus,
        perceptionOutput,
        reasoningOutput,
      );

      if (evidences.length === 0) {
        return this.createEmptyOutput(startTime);
      }

      // 2. 执行 DS 融合
      // 使用 fuseWithReliability 获取完整的 DSFusionOutput
      const dsFusionResult = this.dsFusionEngine.fuseWithReliability(evidences as any);

      // 3. 冲突分析
      const conflictAnalysis = this.analyzeConflicts(
        evidences,
        dsFusionResult.totalConflict,
      );

      // 4. 一致性评分
      const consistencyScore = 1 - dsFusionResult.totalConflict;

      // 5. 信息增益评估（紧急模式下跳过）
      const informationGain = degradationMode === 'emergency'
        ? 0
        : this.computeInformationGain(dsFusionResult.fusedMass);

      return {
        dimension: 'fusion',
        success: true,
        durationMs: Date.now() - startTime,
        data: {
          dsFusionResult,
          consistencyScore,
          conflictAnalysis,
          informationGain,
        },
      };
    } catch (err) {
      log.warn({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Fusion processing failed');

      return {
        dimension: 'fusion',
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
        data: {
          dsFusionResult: {
            fusedMass: {},
            totalConflict: 0,
            strategyUsed: 'dempster',
            decision: 'unknown',
            confidence: 0,
            sourceContributions: {},
            fusionLog: [],
          },
          consistencyScore: 0,
          conflictAnalysis: {
            hasConflict: false,
            conflictDegree: 0,
            conflictingSources: [],
          },
          informationGain: 0,
        },
      };
    }
  }

  // ==========================================================================
  // 核心算法
  // ==========================================================================

  /**
   * 证据收集 — 从各维度输出中提取 DS 证据
   */
  private collectEvidences(
    stimulus: CognitionStimulus,
    perceptionOutput?: PerceptionOutput,
    reasoningOutput?: ReasoningOutput,
  ): DSEvidenceInput[] {
    const evidences: DSEvidenceInput[] = [];
    const frame = this.config.dsFusionConfig.frameOfDiscernment;

    // 证据源 1：感知维的异常检测结果
    if (perceptionOutput?.success && perceptionOutput.data.anomalies.length > 0) {
      const anomalySeverity = Math.max(
        ...perceptionOutput.data.anomalies.map(a => a.severity),
      );

      // 将异常严重度映射为信念质量函数
      const beliefMass: Record<string, number> = {};
      if (anomalySeverity > 0.7) {
        beliefMass['faulty'] = anomalySeverity * 0.6;
        beliefMass['degraded'] = anomalySeverity * 0.2;
        beliefMass['theta'] = 1 - anomalySeverity * 0.8;
      } else if (anomalySeverity > 0.3) {
        beliefMass['degraded'] = anomalySeverity * 0.5;
        beliefMass['normal'] = (1 - anomalySeverity) * 0.3;
        beliefMass['theta'] = 1 - anomalySeverity * 0.5 - (1 - anomalySeverity) * 0.3;
      } else {
        beliefMass['normal'] = (1 - anomalySeverity) * 0.5;
        beliefMass['theta'] = 1 - (1 - anomalySeverity) * 0.5;
      }

      evidences.push({
        sourceId: 'perception_anomaly',
        beliefMass,
        timestamp: new Date(),
        metadata: {
          anomalyCount: perceptionOutput.data.anomalies.length,
          maxSeverity: anomalySeverity,
        },
      });
    }

    // 证据源 2：感知维的高熵维度
    if (perceptionOutput?.success && perceptionOutput.data.highEntropyDimensions.length > 0) {
      const avgEntropy = perceptionOutput.data.highEntropyDimensions.reduce(
        (sum, d) => sum + d.entropy, 0,
      ) / perceptionOutput.data.highEntropyDimensions.length;

      const beliefMass: Record<string, number> = {};
      // 高熵 → 更多不确定性
      beliefMass['theta'] = Math.min(0.8, avgEntropy);
      const remaining = 1 - beliefMass['theta'];
      beliefMass['degraded'] = remaining * 0.5;
      beliefMass['normal'] = remaining * 0.5;

      evidences.push({
        sourceId: 'perception_entropy',
        beliefMass,
        timestamp: new Date(),
        metadata: {
          avgEntropy,
          dimensionCount: perceptionOutput.data.highEntropyDimensions.length,
        },
      });
    }

    // 证据源 3：推演维的假设
    if (reasoningOutput?.success && reasoningOutput.data.hypotheses.length > 0) {
      const topHypothesis = reasoningOutput.data.hypotheses[0];

      const beliefMass: Record<string, number> = {};
      // 根据假设描述推断故障类型
      if (topHypothesis.description.includes('故障') || topHypothesis.description.includes('faulty')) {
        beliefMass['faulty'] = topHypothesis.priorProbability * 0.7;
      } else if (topHypothesis.description.includes('退化') || topHypothesis.description.includes('degraded')) {
        beliefMass['degraded'] = topHypothesis.priorProbability * 0.7;
      } else {
        beliefMass['degraded'] = topHypothesis.priorProbability * 0.4;
        beliefMass['faulty'] = topHypothesis.priorProbability * 0.3;
      }
      beliefMass['theta'] = 1 - Object.values(beliefMass).reduce((s, v) => s + v, 0);

      evidences.push({
        sourceId: 'reasoning_hypothesis',
        beliefMass,
        timestamp: new Date(),
        metadata: {
          topHypothesisId: topHypothesis.id,
          hypothesisCount: reasoningOutput.data.hypotheses.length,
        },
      });
    }

    // 证据源 4：推演维的因果路径
    if (reasoningOutput?.success && reasoningOutput.data.causalPaths.length > 0) {
      const topPath = reasoningOutput.data.causalPaths[0];

      const beliefMass: Record<string, number> = {};
      beliefMass['faulty'] = topPath.strength * 0.5;
      beliefMass['degraded'] = topPath.strength * 0.3;
      beliefMass['theta'] = 1 - topPath.strength * 0.8;

      evidences.push({
        sourceId: 'reasoning_causal',
        beliefMass,
        timestamp: new Date(),
        metadata: {
          topPathFrom: topPath.from,
          topPathTo: topPath.to,
          pathCount: reasoningOutput.data.causalPaths.length,
        },
      });
    }

    // 证据源 5：刺激信号本身的元数据
    if (stimulus.payload) {
      const payloadEvidence = this.extractPayloadEvidence(stimulus.payload, frame);
      if (payloadEvidence) {
        evidences.push(payloadEvidence);
      }
    }

    return evidences;
  }

  /**
   * 从 payload 中提取证据
   */
  private extractPayloadEvidence(
    payload: Record<string, unknown>,
    _frame: string[],
  ): DSEvidenceInput | null {
    // 检查 payload 中是否有明确的诊断信号
    const severity = payload.severity as number | undefined;
    const status = payload.status as string | undefined;

    if (severity === undefined && status === undefined) return null;

    const beliefMass: Record<string, number> = {};

    if (typeof severity === 'number') {
      if (severity > 0.7) {
        beliefMass['faulty'] = severity * 0.5;
        beliefMass['theta'] = 1 - severity * 0.5;
      } else if (severity > 0.3) {
        beliefMass['degraded'] = severity * 0.4;
        beliefMass['theta'] = 1 - severity * 0.4;
      } else {
        beliefMass['normal'] = (1 - severity) * 0.4;
        beliefMass['theta'] = 1 - (1 - severity) * 0.4;
      }
    } else if (typeof status === 'string') {
      switch (status) {
        case 'critical':
        case 'error':
          beliefMass['faulty'] = 0.6;
          beliefMass['theta'] = 0.4;
          break;
        case 'warning':
          beliefMass['degraded'] = 0.5;
          beliefMass['theta'] = 0.5;
          break;
        case 'normal':
        case 'ok':
          beliefMass['normal'] = 0.6;
          beliefMass['theta'] = 0.4;
          break;
        default:
          beliefMass['theta'] = 1.0;
      }
    }

    return {
      sourceId: 'stimulus_payload',
      beliefMass,
      timestamp: new Date(),
      metadata: { severity, status },
    };
  }

  /**
   * 冲突分析
   */
  private analyzeConflicts(
    evidences: DSEvidenceInput[],
    totalConflict: number,
  ): FusionOutput['data']['conflictAnalysis'] {
    const hasConflict = totalConflict >= this.config.conflictThreshold;
    const conflictingSources: FusionOutput['data']['conflictAnalysis']['conflictingSources'] = [];

    if (hasConflict && evidences.length >= 2) {
      // 找出冲突最大的证据对
      for (let i = 0; i < evidences.length; i++) {
        for (let j = i + 1; j < evidences.length; j++) {
          const disagreement = this.computePairwiseDisagreement(
            evidences[i].beliefMass,
            evidences[j].beliefMass,
          );

          if (disagreement > this.config.conflictThreshold) {
            // 找出分歧最大的命题
            const maxDisagreementKey = this.findMaxDisagreementKey(
              evidences[i].beliefMass,
              evidences[j].beliefMass,
            );

            conflictingSources.push({
              source1: evidences[i].sourceId,
              source2: evidences[j].sourceId,
              disagreement: `在 "${maxDisagreementKey}" 上存在分歧（冲突度 ${(disagreement * 100).toFixed(1)}%）`,
            });
          }
        }
      }
    }

    return {
      hasConflict,
      conflictDegree: totalConflict,
      conflictingSources,
    };
  }

  /**
   * 计算两个证据之间的分歧度
   */
  private computePairwiseDisagreement(
    mass1: Record<string, number>,
    mass2: Record<string, number>,
  ): number {
    const allKeys = new Set([...Object.keys(mass1), ...Object.keys(mass2)]);
    let conflict = 0;

    for (const key of allKeys) {
      if (key === 'theta') continue; // 不确定性不计入冲突
      const v1 = mass1[key] ?? 0;
      const v2 = mass2[key] ?? 0;
      conflict += Math.abs(v1 - v2);
    }

    return Math.min(1.0, conflict / 2);
  }

  /**
   * 找出分歧最大的命题
   */
  private findMaxDisagreementKey(
    mass1: Record<string, number>,
    mass2: Record<string, number>,
  ): string {
    const allKeys = new Set([...Object.keys(mass1), ...Object.keys(mass2)]);
    let maxKey = 'unknown';
    let maxDiff = 0;

    for (const key of allKeys) {
      if (key === 'theta') continue;
      const diff = Math.abs((mass1[key] ?? 0) - (mass2[key] ?? 0));
      if (diff > maxDiff) {
        maxDiff = diff;
        maxKey = key;
      }
    }

    return maxKey;
  }

  /**
   * 信息增益评估
   *
   * 使用 KL 散度的简化版本，评估融合后的信念分布
   * 相对于均匀分布的信息增益。
   */
  private computeInformationGain(fusedMass: Record<string, number>): number {
    const values = Object.entries(fusedMass)
      .filter(([key]) => key !== 'theta')
      .map(([, v]) => v);

    if (values.length === 0) return 0;

    const total = values.reduce((s, v) => s + v, 0);
    if (total === 0) return 0;

    // 归一化
    const normalized = values.map(v => v / total);
    const uniform = 1 / values.length;

    // KL 散度：D_KL(P || U) = Σ P(i) * log2(P(i) / U)
    let kl = 0;
    for (const p of normalized) {
      if (p > 0) {
        kl += p * Math.log2(p / uniform);
      }
    }

    return Math.max(0, kl);
  }

  /**
   * 创建空输出
   */
  private createEmptyOutput(startTime: number): FusionOutput {
    return {
      dimension: 'fusion',
      success: true,
      durationMs: Date.now() - startTime,
      data: {
        dsFusionResult: {
          fusedMass: { theta: 1.0 },
          totalConflict: 0,
          strategyUsed: 'dempster',
          decision: 'unknown',
          confidence: 0,
          sourceContributions: {},
          fusionLog: [],
        },
        consistencyScore: 1.0,
        conflictAnalysis: {
          hasConflict: false,
          conflictDegree: 0,
          conflictingSources: [],
        },
        informationGain: 0,
      },
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createFusionProcessor(
  config?: Partial<FusionConfig>,
): FusionProcessor {
  return new FusionProcessor(config);
}
