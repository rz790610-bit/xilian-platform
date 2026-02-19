/**
 * ============================================================================
 * 影子评估器统一版 — ShadowEvaluator
 * ============================================================================
 *
 * 三种评估模式的统一抽象：
 *   1. pipeline  — 流水线内评估（训练后自动触发）
 *   2. canary    — 金丝雀评估（部署前小流量验证）
 *   3. ab_test   — A/B 测试（长期对比评估）
 *
 * 评估流程：
 *   1. 创建评估会话（ShadowEvalSession）
 *   2. 准备评估数据切片
 *   3. 并行执行 Champion 和 Challenger 推理
 *   4. 收集推理结果并计算 TAS 综合分数
 *   5. 输出评估决策（PROMOTE / CANARY_EXTENDED / REJECT）
 *
 * 设计原则：
 *   - 评估器不直接调用模型推理，通过 InferenceAdapter 抽象
 *   - 所有评估数据和结果可追溯
 *   - 支持增量评估（新数据到达时追加评估）
 *   - 与 TAS 计算器集成
 *
 * 对应 v3.0 方案任务 U-16
 */

import { createModuleLogger } from '../../../core/logger';
import { getCognitionEventEmitter } from '../events/emitter';
import { TASCalculator, type TASConfig } from '../engines/tas-calculator';
import type {
  ShadowEvalSession,
  ShadowEvalConfig,
  ShadowEvalResult,
  ShadowEvalMode,
} from '../types';

const log = createModuleLogger('shadowEvaluator');

// ============================================================================
// 推理适配器接口
// ============================================================================

/**
 * 推理适配器 — 抽象模型推理调用
 *
 * 实现此接口以对接不同的模型服务后端（TorchServe / Triton / 自定义等）。
 */
export interface InferenceAdapter {
  /**
   * 执行批量推理
   *
   * @param modelId 模型 ID
   * @param slices 数据切片列表
   * @returns 每个切片的推理结果
   */
  batchInfer(
    modelId: string,
    slices: EvalDataSlice[],
  ): Promise<InferenceResult[]>;

  /**
   * 检查模型是否可用
   */
  isModelAvailable(modelId: string): Promise<boolean>;
}

/** 评估数据切片 */
export interface EvalDataSlice {
  /** 切片 ID */
  id: string;
  /** 输入特征 */
  features: Record<string, number>;
  /** 真实标签（如果有） */
  groundTruth?: string;
  /** 时间戳 */
  timestamp: Date;
  /** 工况 ID */
  ocProfileId?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 推理结果 */
export interface InferenceResult {
  /** 对应的切片 ID */
  sliceId: string;
  /** 预测标签 */
  prediction: string;
  /** 预测置信度 */
  confidence: number;
  /** 推理延迟（毫秒） */
  latencyMs: number;
  /** 是否正确（与 groundTruth 对比） */
  correct?: boolean;
  /** 原始输出 */
  rawOutput?: Record<string, number>;
}

// ============================================================================
// 数据源接口
// ============================================================================

/**
 * 评估数据源 — 提供评估所需的数据切片
 */
export interface EvalDataSource {
  /**
   * 获取评估数据切片
   *
   * @param ocProfileId 工况 ID（可选，用于按工况筛选）
   * @param count 需要的切片数量
   */
  getSlices(ocProfileId: string | undefined, count: number): Promise<EvalDataSlice[]>;
}

// ============================================================================
// 影子评估器实现
// ============================================================================

/** 影子评估器配置 */
export interface ShadowEvaluatorConfig {
  /** 默认评估配置 */
  defaultEvalConfig: ShadowEvalConfig;
  /** TAS 计算器配置 */
  tasConfig?: Partial<TASConfig>;
  /** 最大并发评估会话数 */
  maxConcurrentSessions: number;
  /** 会话超时时间（毫秒） */
  sessionTimeoutMs: number;
}

const DEFAULT_EVAL_CONFIG: ShadowEvalConfig = {
  sliceCount: 500,
  timeoutMs: 300_000, // 5 分钟
  mcNemarAlpha: 0.05,
  monteCarloRuns: 100,
  perturbationMagnitude: 0.05,
  tasWeights: {
    mcNemar: 0.3,
    dsFusion: 0.4,
    monteCarlo: 0.3,
  },
};

const DEFAULT_CONFIG: ShadowEvaluatorConfig = {
  defaultEvalConfig: DEFAULT_EVAL_CONFIG,
  maxConcurrentSessions: 3,
  sessionTimeoutMs: 600_000, // 10 分钟
};

export class ShadowEvaluator {
  private readonly config: ShadowEvaluatorConfig;
  private readonly inferenceAdapter: InferenceAdapter;
  private readonly dataSource: EvalDataSource;
  private readonly tasCalculator: TASCalculator;
  private readonly emitter = getCognitionEventEmitter();

  // 活跃会话
  private readonly activeSessions: Map<string, ShadowEvalSession> = new Map();
  private sessionCounter = 0;

  constructor(
    inferenceAdapter: InferenceAdapter,
    dataSource: EvalDataSource,
    config?: Partial<ShadowEvaluatorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.inferenceAdapter = inferenceAdapter;
    this.dataSource = dataSource;
    this.tasCalculator = new TASCalculator(config?.tasConfig);
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 启动影子评估
   *
   * @param mode 评估模式
   * @param challengerModelId 候选模型 ID
   * @param championModelId 当前冠军模型 ID
   * @param ocProfileId 工况 ID（可选）
   * @param evalConfig 评估配置（可选，使用默认配置）
   */
  async evaluate(
    mode: ShadowEvalMode,
    challengerModelId: string,
    championModelId: string,
    ocProfileId?: string,
    evalConfig?: Partial<ShadowEvalConfig>,
  ): Promise<ShadowEvalResult> {
    // 检查并发限制
    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `Max concurrent sessions (${this.config.maxConcurrentSessions}) reached. ` +
        `Active sessions: ${this.activeSessions.size}`,
      );
    }

    // 创建会话
    const sessionId = this.generateSessionId();
    const mergedConfig: ShadowEvalConfig = {
      ...this.config.defaultEvalConfig,
      ...evalConfig,
    };

    const session: ShadowEvalSession = {
      id: sessionId,
      mode,
      challengerModelId,
      championModelId,
      ocProfileId,
      startedAt: new Date(),
      status: 'running',
      config: mergedConfig,
    };

    this.activeSessions.set(sessionId, session);

    log.info({
      sessionId,
      mode,
      challengerModelId,
      championModelId,
      ocProfileId,
      sliceCount: mergedConfig.sliceCount,
    }, 'Shadow evaluation started');

    try {
      const result = await this.executeEvaluation(session);

      // 更新会话
      session.endedAt = new Date();
      session.status = 'completed';
      session.result = result;

      // 发布事件
      this.emitter.emitShadowEvalCompleted({ session, result });
      this.emitter.emitTASComputed({
        sessionId,
        tasScore: result.tasScore,
        decision: result.decision,
        computedAt: new Date(),
      });

      log.info({
        sessionId,
        tasScore: result.tasScore,
        decision: result.decision,
        durationMs: session.endedAt.getTime() - session.startedAt.getTime(),
      }, 'Shadow evaluation completed');

      return result;
    } catch (err) {
      session.endedAt = new Date();
      session.status = 'failed';

      log.error({
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      }, 'Shadow evaluation failed');

      throw err;
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * 获取活跃会话列表
   */
  getActiveSessions(): ShadowEvalSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * 取消评估会话
   */
  cancelSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    session.status = 'failed';
    session.endedAt = new Date();
    this.activeSessions.delete(sessionId);

    log.info({ sessionId }, 'Shadow evaluation cancelled');
    return true;
  }

  // ==========================================================================
  // 内部执行
  // ==========================================================================

  /**
   * 执行评估的核心逻辑
   */
  private async executeEvaluation(session: ShadowEvalSession): Promise<ShadowEvalResult> {
    const { config, challengerModelId, championModelId, ocProfileId } = session;

    // Step 1: 检查模型可用性
    const [challengerAvailable, championAvailable] = await Promise.all([
      this.inferenceAdapter.isModelAvailable(challengerModelId),
      this.inferenceAdapter.isModelAvailable(championModelId),
    ]);

    if (!challengerAvailable) {
      throw new Error(`Challenger model ${challengerModelId} is not available`);
    }
    if (!championAvailable) {
      throw new Error(`Champion model ${championModelId} is not available`);
    }

    // Step 2: 获取评估数据切片
    const slices = await this.dataSource.getSlices(ocProfileId, config.sliceCount);
    if (slices.length === 0) {
      throw new Error('No evaluation data slices available');
    }

    log.debug({
      sessionId: session.id,
      actualSliceCount: slices.length,
      requestedSliceCount: config.sliceCount,
    }, 'Evaluation data slices loaded');

    // Step 3: 并行执行 Champion 和 Challenger 推理
    const [challengerResults, championResults] = await Promise.all([
      this.inferenceAdapter.batchInfer(challengerModelId, slices),
      this.inferenceAdapter.batchInfer(championModelId, slices),
    ]);

    // Step 4: 标记正确性（如果有 groundTruth）
    const sliceMap = new Map(slices.map(s => [s.id, s]));
    for (const result of challengerResults) {
      const slice = sliceMap.get(result.sliceId);
      if (slice?.groundTruth) {
        result.correct = result.prediction === slice.groundTruth;
      }
    }
    for (const result of championResults) {
      const slice = sliceMap.get(result.sliceId);
      if (slice?.groundTruth) {
        result.correct = result.prediction === slice.groundTruth;
      }
    }

    // Step 5: 构建 McNemar 2×2 列联表
    const mcNemarInput = this.buildMcNemarTable(challengerResults, championResults);

    // Step 6: 计算 DS 融合证据评分
    const dsFusionScore = this.computeDSFusionScore(challengerResults, championResults);

    // Step 7: 计算 Monte Carlo 鲁棒性评分
    const monteCarloScore = this.computeMonteCarloScore(
      challengerResults,
      championResults,
      config.monteCarloRuns,
      config.perturbationMagnitude,
    );

    // Step 8: 计算 TAS 综合分数
    const tasResult = this.tasCalculator.compute(
      mcNemarInput,
      dsFusionScore,
      monteCarloScore,
      config.tasWeights,
    );

    // Step 9: 计算详细指标
    const metrics = this.computeDetailedMetrics(challengerResults, championResults);

    return {
      mcNemar: tasResult.mcNemar,
      dsFusionScore,
      monteCarloScore,
      tasScore: tasResult.tasScore,
      decision: tasResult.decision,
      decisionReason: tasResult.decisionReason,
      metrics,
    };
  }

  /**
   * 构建 McNemar 2×2 列联表
   */
  private buildMcNemarTable(
    challengerResults: InferenceResult[],
    championResults: InferenceResult[],
  ): { a: number; b: number; c: number; d: number } {
    let a = 0; // 两者都对
    let b = 0; // Challenger 对，Champion 错
    let c = 0; // Challenger 错，Champion 对
    let d = 0; // 两者都错

    const championMap = new Map(championResults.map(r => [r.sliceId, r]));

    for (const challengerResult of challengerResults) {
      const championResult = championMap.get(challengerResult.sliceId);
      if (!championResult) continue;

      // 只有两者都有 correct 标记时才计入
      if (challengerResult.correct === undefined || championResult.correct === undefined) continue;

      if (challengerResult.correct && championResult.correct) a++;
      else if (challengerResult.correct && !championResult.correct) b++;
      else if (!challengerResult.correct && championResult.correct) c++;
      else d++;
    }

    return { a, b, c, d };
  }

  /**
   * 计算 DS 融合证据评分
   *
   * 基于 Challenger 和 Champion 的预测置信度分布，
   * 通过 DS 融合评估 Challenger 的证据强度。
   *
   * 评分逻辑：
   *   - Challenger 平均置信度高于 Champion → 正向评分
   *   - Challenger 在 Champion 错误的样本上置信度高 → 额外加分
   *   - 归一化到 [0, 1]
   */
  private computeDSFusionScore(
    challengerResults: InferenceResult[],
    championResults: InferenceResult[],
  ): number {
    if (challengerResults.length === 0) return 0;

    const championMap = new Map(championResults.map(r => [r.sliceId, r]));

    let challengerConfidenceSum = 0;
    let championConfidenceSum = 0;
    let challengerBetterOnChampionErrors = 0;
    let championErrorCount = 0;
    let matchedCount = 0;

    for (const cr of challengerResults) {
      const chr = championMap.get(cr.sliceId);
      if (!chr) continue;

      matchedCount++;
      challengerConfidenceSum += cr.confidence;
      championConfidenceSum += chr.confidence;

      // 在 Champion 错误的样本上，Challenger 是否更好
      if (chr.correct === false) {
        championErrorCount++;
        if (cr.correct === true) {
          challengerBetterOnChampionErrors++;
        }
      }
    }

    if (matchedCount === 0) return 0;

    // 分量 1：平均置信度对比（归一化到 [0, 1]）
    const avgChallengerConf = challengerConfidenceSum / matchedCount;
    const avgChampionConf = championConfidenceSum / matchedCount;
    const confidenceRatio = avgChampionConf > 0
      ? Math.min(1.0, avgChallengerConf / avgChampionConf)
      : avgChallengerConf > 0 ? 1.0 : 0;

    // 分量 2：在 Champion 错误样本上的改善率
    const improvementRate = championErrorCount > 0
      ? challengerBetterOnChampionErrors / championErrorCount
      : 0.5; // 无 Champion 错误时中性评分

    // 综合评分：70% 置信度对比 + 30% 改善率
    return 0.7 * confidenceRatio + 0.3 * improvementRate;
  }

  /**
   * 计算 Monte Carlo 鲁棒性评分
   *
   * 对 Challenger 的预测结果施加随机扰动，
   * 评估其在扰动下的稳定性。
   *
   * 评分逻辑：
   *   - 对每个样本的置信度施加 N 次高斯扰动
   *   - 计算扰动后预测翻转的比例
   *   - 翻转率越低 → 鲁棒性越高 → 评分越高
   */
  private computeMonteCarloScore(
    challengerResults: InferenceResult[],
    _championResults: InferenceResult[],
    runs: number,
    perturbationMagnitude: number,
  ): number {
    if (challengerResults.length === 0 || runs <= 0) return 0;

    let totalFlips = 0;
    let totalTrials = 0;

    for (const result of challengerResults) {
      if (result.correct === undefined) continue;

      for (let i = 0; i < runs; i++) {
        totalTrials++;

        // 对置信度施加高斯扰动
        const noise = this.gaussianRandom() * perturbationMagnitude;
        const perturbedConfidence = Math.max(0, Math.min(1, result.confidence + noise));

        // 如果扰动后置信度低于 0.5，认为预测翻转
        const originalAboveThreshold = result.confidence >= 0.5;
        const perturbedAboveThreshold = perturbedConfidence >= 0.5;

        if (originalAboveThreshold !== perturbedAboveThreshold) {
          totalFlips++;
        }
      }
    }

    if (totalTrials === 0) return 0;

    // 鲁棒性 = 1 - 翻转率
    const flipRate = totalFlips / totalTrials;
    return Math.max(0, Math.min(1, 1 - flipRate));
  }

  /**
   * 计算详细指标
   */
  private computeDetailedMetrics(
    challengerResults: InferenceResult[],
    championResults: InferenceResult[],
  ): ShadowEvalResult['metrics'] {
    const challengerCorrect = challengerResults.filter(r => r.correct === true).length;
    const championCorrect = championResults.filter(r => r.correct === true).length;
    const challengerTotal = challengerResults.filter(r => r.correct !== undefined).length;
    const championTotal = championResults.filter(r => r.correct !== undefined).length;

    // 延迟排序
    const challengerLatencies = challengerResults.map(r => r.latencyMs).sort((a, b) => a - b);
    const championLatencies = championResults.map(r => r.latencyMs).sort((a, b) => a - b);

    return {
      challengerAccuracy: challengerTotal > 0 ? challengerCorrect / challengerTotal : 0,
      championAccuracy: championTotal > 0 ? championCorrect / championTotal : 0,
      challengerLatencyP50: this.percentile(challengerLatencies, 0.5),
      championLatencyP50: this.percentile(championLatencies, 0.5),
      challengerLatencyP99: this.percentile(challengerLatencies, 0.99),
      championLatencyP99: this.percentile(championLatencies, 0.99),
    };
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  /** 生成会话 ID */
  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    return `se_${timestamp}_${counter}`;
  }

  /** Box-Muller 高斯随机数 */
  private gaussianRandom(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /** 计算百分位数 */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(p * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建影子评估器 */
export function createShadowEvaluator(
  inferenceAdapter: InferenceAdapter,
  dataSource: EvalDataSource,
  config?: Partial<ShadowEvaluatorConfig>,
): ShadowEvaluator {
  return new ShadowEvaluator(inferenceAdapter, dataSource, config);
}
