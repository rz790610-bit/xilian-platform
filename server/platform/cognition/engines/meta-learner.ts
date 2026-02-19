/**
 * ============================================================================
 * MetaLearner — 元学习统一接口
 * ============================================================================
 *
 * 统一封装三种预测能力：
 *   1. KG 历史查询 — 从知识图谱中检索相似的历史认知结果
 *   2. 相似工况迁移 — 基于工况相似度迁移历史经验
 *   3. 影子评估推演 — 基于影子评估的快速预判
 *
 * 为 CognitionUnit 的决策维提供先验知识，
 * 也为 MCTS 奖励函数和候选动作预排序提供数据。
 *
 * 来源：v3.0 方案 U-33，融合 Grok L6 的 MetaLearner 理念
 *
 * 设计原则：
 *   - 统一接口，三种能力可独立注册
 *   - 每种能力有独立的超时和降级
 *   - 结果带有来源标记和置信度
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('metaLearner');

// ============================================================================
// 类型定义
// ============================================================================

/** 元学习查询上下文 */
export interface MetaLearnerQuery {
  /** 当前工况 ID */
  ocProfileId?: string;
  /** 设备树节点ID */
  nodeId?: string;
  /** @deprecated 使用 nodeId 代替 */
  deviceId?: string;
  /** 异常类型 */
  anomalyType?: string;
  /** 异常源 */
  anomalySource?: string;
  /** 当前特征向量（用于相似度匹配） */
  featureVector?: number[];
  /** 最大返回结果数 */
  topK: number;
}

/** 元学习预测结果 */
export interface MetaLearnerPrediction {
  /** 预测来源 */
  source: 'kg_history' | 'oc_transfer' | 'shadow_eval';
  /** 预测内容 */
  prediction: {
    /** 预测的诊断结果 */
    diagnosis?: string;
    /** 推荐的动作 */
    recommendedActions?: string[];
    /** 预测的严重度 [0, 1] */
    severity?: number;
    /** 预测的根因 */
    rootCause?: string;
  };
  /** 置信度 [0, 1] */
  confidence: number;
  /** 支撑证据 */
  evidence: {
    /** 匹配的历史案例数 */
    matchCount: number;
    /** 最佳匹配的相似度 */
    bestMatchSimilarity: number;
    /** 参考的认知结果 ID */
    referenceIds: string[];
  };
}

/** 元学习综合结果 */
export interface MetaLearnerResult {
  /** 各来源的预测 */
  predictions: MetaLearnerPrediction[];
  /** 综合置信度 */
  overallConfidence: number;
  /** 综合推荐动作（去重合并） */
  mergedActions: string[];
  /** 查询耗时（毫秒） */
  durationMs: number;
}

// ============================================================================
// 能力提供者接口
// ============================================================================

/** KG 历史查询提供者 */
export interface KGHistoryProvider {
  query(q: MetaLearnerQuery): Promise<MetaLearnerPrediction[]>;
}

/** 工况迁移提供者 */
export interface OCTransferProvider {
  query(q: MetaLearnerQuery): Promise<MetaLearnerPrediction[]>;
}

/** 影子评估推演提供者 */
export interface ShadowEvalProvider {
  query(q: MetaLearnerQuery): Promise<MetaLearnerPrediction[]>;
}

// ============================================================================
// MetaLearner 实现
// ============================================================================

export interface MetaLearnerConfig {
  /** 单个提供者的超时（毫秒） */
  providerTimeoutMs: number;
  /** 最低置信度阈值 — 低于此值的预测被过滤 */
  minConfidence: number;
}

const DEFAULT_CONFIG: MetaLearnerConfig = {
  providerTimeoutMs: 5_000,
  minConfidence: 0.2,
};

export class MetaLearner {
  private readonly config: MetaLearnerConfig;
  private kgProvider?: KGHistoryProvider;
  private ocProvider?: OCTransferProvider;
  private shadowProvider?: ShadowEvalProvider;

  constructor(config?: Partial<MetaLearnerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // 提供者注册
  // ==========================================================================

  registerKGHistoryProvider(provider: KGHistoryProvider): void {
    this.kgProvider = provider;
  }

  registerOCTransferProvider(provider: OCTransferProvider): void {
    this.ocProvider = provider;
  }

  registerShadowEvalProvider(provider: ShadowEvalProvider): void {
    this.shadowProvider = provider;
  }

  // ==========================================================================
  // 查询
  // ==========================================================================

  /**
   * 执行元学习查询 — 并行调用所有已注册的提供者
   */
  async query(q: MetaLearnerQuery): Promise<MetaLearnerResult> {
    const startTime = Date.now();
    const allPredictions: MetaLearnerPrediction[] = [];

    // 并行调用所有提供者
    const promises: Array<Promise<MetaLearnerPrediction[]>> = [];

    if (this.kgProvider) {
      promises.push(this.safeQuery('kg_history', () => this.kgProvider!.query(q)));
    }
    if (this.ocProvider) {
      promises.push(this.safeQuery('oc_transfer', () => this.ocProvider!.query(q)));
    }
    if (this.shadowProvider) {
      promises.push(this.safeQuery('shadow_eval', () => this.shadowProvider!.query(q)));
    }

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPredictions.push(...result.value);
      }
    }

    // 过滤低置信度预测
    const filteredPredictions = allPredictions.filter(
      p => p.confidence >= this.config.minConfidence,
    );

    // 按置信度降序排序
    filteredPredictions.sort((a, b) => b.confidence - a.confidence);

    // 计算综合置信度（加权平均，权重为各预测的置信度本身）
    const overallConfidence = this.computeOverallConfidence(filteredPredictions);

    // 合并推荐动作（去重）
    const mergedActions = this.mergeActions(filteredPredictions);

    const durationMs = Date.now() - startTime;

    log.info({
      totalPredictions: allPredictions.length,
      filteredPredictions: filteredPredictions.length,
      overallConfidence,
      mergedActionsCount: mergedActions.length,
      durationMs,
    }, 'MetaLearner query completed');

    return {
      predictions: filteredPredictions,
      overallConfidence,
      mergedActions,
      durationMs,
    };
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  /** 安全调用提供者（带超时和错误处理） */
  private async safeQuery(
    source: string,
    fn: () => Promise<MetaLearnerPrediction[]>,
  ): Promise<MetaLearnerPrediction[]> {
    try {
      return await new Promise<MetaLearnerPrediction[]>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${source} provider timeout`)),
          this.config.providerTimeoutMs,
        );
        fn()
          .then(val => { clearTimeout(timer); resolve(val); })
          .catch(err => { clearTimeout(timer); reject(err); });
      });
    } catch (err) {
      log.warn({
        source,
        error: err instanceof Error ? err.message : String(err),
      }, 'MetaLearner provider failed');
      return [];
    }
  }

  /** 计算综合置信度 */
  private computeOverallConfidence(predictions: MetaLearnerPrediction[]): number {
    if (predictions.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;

    for (const p of predictions) {
      weightedSum += p.confidence * p.confidence; // 权重 = 置信度本身
      weightTotal += p.confidence;
    }

    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  }

  /** 合并推荐动作（去重） */
  private mergeActions(predictions: MetaLearnerPrediction[]): string[] {
    const actionSet = new Set<string>();

    for (const p of predictions) {
      if (p.prediction.recommendedActions) {
        for (const action of p.prediction.recommendedActions) {
          actionSet.add(action);
        }
      }
    }

    return Array.from(actionSet);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建 MetaLearner */
export function createMetaLearner(config?: Partial<MetaLearnerConfig>): MetaLearner {
  return new MetaLearner(config);
}
