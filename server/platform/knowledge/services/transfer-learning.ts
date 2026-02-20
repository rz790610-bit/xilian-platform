/**
 * ============================================================================
 * 迁移学习引擎 — TransferLearningEngine
 * ============================================================================
 *
 * 职责：
 *   1. 跨工况模型迁移（Domain Adaptation）
 *   2. 特征空间对齐评估
 *   3. 迁移策略选择（fine-tune / feature-extract / domain-adversarial）
 *   4. 迁移效果评估
 *   5. 自动迁移建议
 */

// ============================================================================
// 迁移类型
// ============================================================================

export interface TransferTask {
  id: string;
  sourceProfile: string; // 源工况
  targetProfile: string; // 目标工况
  sourceModelId: number;
  strategy: TransferStrategy;
  status: 'planning' | 'aligning' | 'transferring' | 'evaluating' | 'completed' | 'failed';
  alignmentScore: number; // 特征空间对齐度 0-1
  transferQuality: number; // 迁移质量 0-1
  resultModelId: number | null;
  logs: Array<{ timestamp: number; message: string; level: 'info' | 'warn' | 'error' }>;
  createdAt: number;
  completedAt: number | null;
}

export type TransferStrategy =
  | { type: 'fine_tune'; epochs: number; learningRate: number; frozenLayers: number }
  | { type: 'feature_extract'; layers: string[] }
  | { type: 'domain_adversarial'; lambda: number; discriminatorLR: number }
  | { type: 'knowledge_distillation'; temperature: number; alpha: number };

export interface AlignmentReport {
  sourceProfile: string;
  targetProfile: string;
  overallScore: number;
  featureAlignments: Array<{
    featureName: string;
    sourceDistribution: { mean: number; std: number };
    targetDistribution: { mean: number; std: number };
    alignmentScore: number;
    recommendation: 'direct_transfer' | 'rescale' | 'retrain' | 'drop';
  }>;
  recommendedStrategy: TransferStrategy;
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface TransferEvaluation {
  taskId: string;
  sourceMetrics: Record<string, number>;
  targetMetrics: Record<string, number>;
  degradation: Record<string, number>; // 每个指标的退化程度
  overallQuality: number;
  isAcceptable: boolean;
  suggestions: string[];
}

// ============================================================================
// 迁移学习引擎
// ============================================================================

export class TransferLearningEngine {
  private tasks = new Map<string, TransferTask>();

  /**
   * 评估特征空间对齐度
   */
  assessAlignment(
    sourceFeatures: Array<{ name: string; mean: number; std: number; distribution: number[] }>,
    targetFeatures: Array<{ name: string; mean: number; std: number; distribution: number[] }>,
    sourceProfile: string,
    targetProfile: string,
  ): AlignmentReport {
    const featureAlignments: AlignmentReport['featureAlignments'] = [];
    let totalScore = 0;

    for (const sf of sourceFeatures) {
      const tf = targetFeatures.find(f => f.name === sf.name);
      if (!tf) {
        featureAlignments.push({
          featureName: sf.name,
          sourceDistribution: { mean: sf.mean, std: sf.std },
          targetDistribution: { mean: 0, std: 0 },
          alignmentScore: 0,
          recommendation: 'drop',
        });
        continue;
      }

      // KL 散度简化版：基于均值/方差差异
      const meanDiff = Math.abs(sf.mean - tf.mean) / Math.max(sf.std, tf.std, 0.001);
      const stdRatio = Math.min(sf.std, tf.std) / Math.max(sf.std, tf.std, 0.001);
      const alignmentScore = Math.max(0, 1 - meanDiff * 0.3) * stdRatio;

      let recommendation: 'direct_transfer' | 'rescale' | 'retrain' | 'drop';
      if (alignmentScore > 0.8) recommendation = 'direct_transfer';
      else if (alignmentScore > 0.5) recommendation = 'rescale';
      else if (alignmentScore > 0.2) recommendation = 'retrain';
      else recommendation = 'drop';

      featureAlignments.push({
        featureName: sf.name,
        sourceDistribution: { mean: sf.mean, std: sf.std },
        targetDistribution: { mean: tf.mean, std: tf.std },
        alignmentScore,
        recommendation,
      });

      totalScore += alignmentScore;
    }

    const overallScore = featureAlignments.length > 0 ? totalScore / featureAlignments.length : 0;

    // 推荐策略
    let recommendedStrategy: TransferStrategy;
    let estimatedEffort: AlignmentReport['estimatedEffort'];

    if (overallScore > 0.7) {
      recommendedStrategy = { type: 'fine_tune', epochs: 10, learningRate: 0.0001, frozenLayers: 3 };
      estimatedEffort = 'low';
    } else if (overallScore > 0.4) {
      recommendedStrategy = { type: 'domain_adversarial', lambda: 0.1, discriminatorLR: 0.001 };
      estimatedEffort = 'medium';
    } else {
      recommendedStrategy = { type: 'knowledge_distillation', temperature: 3.0, alpha: 0.5 };
      estimatedEffort = 'high';
    }

    return {
      sourceProfile,
      targetProfile,
      overallScore,
      featureAlignments,
      recommendedStrategy,
      estimatedEffort,
    };
  }

  /**
   * 创建迁移任务
   */
  createTask(params: {
    sourceProfile: string;
    targetProfile: string;
    sourceModelId: number;
    strategy: TransferStrategy;
  }): TransferTask {
    const task: TransferTask = {
      id: `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceProfile: params.sourceProfile,
      targetProfile: params.targetProfile,
      sourceModelId: params.sourceModelId,
      strategy: params.strategy,
      status: 'planning',
      alignmentScore: 0,
      transferQuality: 0,
      resultModelId: null,
      logs: [{ timestamp: Date.now(), message: '迁移任务已创建', level: 'info' }],
      createdAt: Date.now(),
      completedAt: null,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * 执行迁移（模拟）
   */
  async executeTransfer(taskId: string): Promise<TransferTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    try {
      // 阶段 1: 对齐
      task.status = 'aligning';
      task.logs.push({ timestamp: Date.now(), message: '开始特征空间对齐', level: 'info' });

      // 阶段 2: 迁移
      task.status = 'transferring';
      task.logs.push({
        timestamp: Date.now(),
        message: `使用 ${task.strategy.type} 策略执行迁移`,
        level: 'info',
      });

      // 根据策略类型模拟不同的迁移过程
      switch (task.strategy.type) {
        case 'fine_tune':
          task.logs.push({
            timestamp: Date.now(),
            message: `Fine-tuning: ${task.strategy.epochs} epochs, lr=${task.strategy.learningRate}, frozen=${task.strategy.frozenLayers} layers`,
            level: 'info',
          });
          break;
        case 'feature_extract':
          task.logs.push({
            timestamp: Date.now(),
            message: `Feature extraction from layers: ${task.strategy.layers.join(', ')}`,
            level: 'info',
          });
          break;
        case 'domain_adversarial':
          task.logs.push({
            timestamp: Date.now(),
            message: `Domain adversarial: λ=${task.strategy.lambda}, disc_lr=${task.strategy.discriminatorLR}`,
            level: 'info',
          });
          break;
        case 'knowledge_distillation':
          task.logs.push({
            timestamp: Date.now(),
            message: `Knowledge distillation: T=${task.strategy.temperature}, α=${task.strategy.alpha}`,
            level: 'info',
          });
          break;
      }

      // 阶段 3: 评估
      task.status = 'evaluating';
      task.logs.push({ timestamp: Date.now(), message: '评估迁移质量', level: 'info' });

      task.status = 'completed';
      task.transferQuality = 0.75; // 模拟结果
      task.completedAt = Date.now();
      task.logs.push({
        timestamp: Date.now(),
        message: `迁移完成，质量评分: ${task.transferQuality}`,
        level: 'info',
      });
    } catch (err) {
      task.status = 'failed';
      task.logs.push({ timestamp: Date.now(), message: `迁移失败: ${err}`, level: 'error' });
    }

    return task;
  }

  /**
   * 评估迁移效果
   */
  evaluateTransfer(
    taskId: string,
    sourceMetrics: Record<string, number>,
    targetMetrics: Record<string, number>,
    acceptableThreshold: number = 0.9,
  ): TransferEvaluation {
    const degradation: Record<string, number> = {};
    const suggestions: string[] = [];
    let totalDegradation = 0;
    let metricCount = 0;

    for (const [key, sourceVal] of Object.entries(sourceMetrics)) {
      const targetVal = targetMetrics[key];
      if (targetVal !== undefined && sourceVal > 0) {
        const deg = 1 - targetVal / sourceVal;
        degradation[key] = deg;
        totalDegradation += Math.abs(deg);
        metricCount++;

        if (deg > 0.1) {
          suggestions.push(`${key} 退化 ${(deg * 100).toFixed(1)}%，建议增加目标域数据或调整策略`);
        }
      }
    }

    const avgDegradation = metricCount > 0 ? totalDegradation / metricCount : 0;
    const overallQuality = Math.max(0, 1 - avgDegradation);

    return {
      taskId,
      sourceMetrics,
      targetMetrics,
      degradation,
      overallQuality,
      isAcceptable: overallQuality >= acceptableThreshold,
      suggestions,
    };
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): TransferTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 列出任务
   */
  listTasks(params?: {
    status?: TransferTask['status'];
    sourceProfile?: string;
    targetProfile?: string;
  }): TransferTask[] {
    let results = Array.from(this.tasks.values());
    if (params?.status) results = results.filter(t => t.status === params.status);
    if (params?.sourceProfile) results = results.filter(t => t.sourceProfile === params.sourceProfile);
    if (params?.targetProfile) results = results.filter(t => t.targetProfile === params.targetProfile);
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }
}
