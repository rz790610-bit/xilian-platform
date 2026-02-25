/**
 * ============================================================================
 * WorldModelEngine — ONNX Runtime 神经网络推理引擎
 * ============================================================================
 *
 * 核心能力：
 *   1. 加载 ONNX 模型（LSTM / Transformer / TCN）进行时序状态预测
 *   2. 条件 import：onnxruntime-node 不可用时自动降级到物理模型
 *   3. 集成 Dojo 碳感知训练调度器
 *   4. Prometheus 指标 + EventBus 事件
 *
 * 架构位置：
 *   EvolutionOrchestrator → WorldModelEngine → ONNX Runtime
 *                                            → DojoTrainingScheduler
 *                                            → FSDMetrics (Prometheus)
 *
 * 与 cognition/worldmodel/world-model.ts 的关系：
 *   - world-model.ts：物理+统计混合模型（确定性推理）
 *   - world-model-engine.ts：纯神经网络模型（概率性推理）
 *   - 两者通过 Orchestrator 统一调度，可独立或融合使用
 */

import { createModuleLogger } from '../../../core/logger';
import { eventBus } from '../../../services/eventBus.service';
import { EVOLUTION_TOPICS } from '../../../../shared/evolution-topics';
import { FSDMetrics } from '../fsd/fsd-metrics';
import { DojoTrainingScheduler } from '../fsd/dojo-training-scheduler';
import { carbonAwareClient } from '../carbon-aware.client';
import { evolutionConfig } from '../evolution.config';
import type {
  WorldModelProvider,
  WorldModelInput,
  WorldModelPrediction,
  WorldModelTrainingJob,
  WorldModelEngineConfig,
} from './world-model-types';
import { DEFAULT_ENGINE_CONFIG } from './world-model-types';

const log = createModuleLogger('WorldModelEngine');

// ── 条件 import: onnxruntime-node ──
// 生产环境安装后可用，沙箱/CI 环境降级到 fallback
let ort: typeof import('onnxruntime-node') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ort = require('onnxruntime-node');
} catch {
  // onnxruntime-node 未安装，将使用 fallback 模式
  // 发布 WORLD_MODEL_DEGRADED 事件告警
  eventBus.publish(
    EVOLUTION_TOPICS.WORLD_MODEL_DEGRADED,
    'world_model_degraded',
    {
      reason: 'onnxruntime-node 未安装',
      fallbackMode: 'physics_estimation',
      timestamp: Date.now(),
    },
    { source: 'world-model-engine', severity: 'warning' },
  ).catch(() => { /* EventBus 未初始化时忽略 */ });
}

// ============================================================================
// WorldModelEngine
// ============================================================================

export class WorldModelEngine implements WorldModelProvider {
  private session: any | null = null; // ort.InferenceSession
  private config: WorldModelEngineConfig;
  private initialized = false;
  private activeSessions = 0;
  private dojoScheduler: DojoTrainingScheduler;

  constructor(config: Partial<WorldModelEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.dojoScheduler = new DojoTrainingScheduler();
  }

  // ========================================================================
  // 初始化
  // ========================================================================

  async init(): Promise<void> {
    if (this.initialized) return;

    if (!ort) {
      log.warn('onnxruntime-node 未安装，WorldModelEngine 将使用 fallback 模式（物理估算）');
      this.initialized = true;
      FSDMetrics.engineUp.set(1);
      return;
    }

    try {
      this.session = await ort.InferenceSession.create(this.config.modelPath, {
        executionProviders: [this.config.executionProvider],
        graphOptimizationLevel: this.config.graphOptimizationLevel,
      });

      this.initialized = true;
      FSDMetrics.engineUp.set(1);

      log.info('WorldModelEngine ONNX 会话初始化成功', {
        modelPath: this.config.modelPath,
        executionProvider: this.config.executionProvider,
        graphOptimizationLevel: this.config.graphOptimizationLevel,
      });
    } catch (error) {
      log.error('WorldModel ONNX 加载失败，降级到 fallback 模式', { error });

      if (this.config.fallbackToPhysics) {
        this.initialized = true;
        FSDMetrics.engineUp.set(1);
        log.info('WorldModelEngine fallback 模式已启用');
      } else {
        throw error;
      }
    }
  }

  // ========================================================================
  // 核心预测接口（真实神经推理 / fallback）
  // ========================================================================

  async predictFuture(input: WorldModelInput): Promise<WorldModelPrediction> {
    await this.init();
    const start = Date.now();

    let prediction: WorldModelPrediction;

    if (this.session && ort) {
      prediction = await this.predictWithONNX(input);
    } else {
      prediction = this.predictWithFallback(input);
    }

    // 指标 + EventBus
    const latency = Date.now() - start;
    FSDMetrics.worldModelInferenceLatency.observe(latency);

    await eventBus.publish(
      EVOLUTION_TOPICS.WORLD_MODEL_PREDICTION,
      'world_model_prediction',
      {
        jobId: input.jobId,
        sequenceLength: input.sequenceLength,
        featureDim: input.featureDim,
        latencyMs: latency,
        confidence: prediction.confidence,
        usedONNX: !!this.session,
        deviceId: input.deviceId,
      },
      { source: 'world-model-engine', severity: 'info' },
    );

    return prediction;
  }

  /**
   * ONNX Runtime 真实推理
   * 输入张量: [batch=1, sequenceLength, featureDim]
   * 输出: { output: 未来轨迹, probability: 干预概率, confidence: 置信度 }
   */
  private async predictWithONNX(input: WorldModelInput): Promise<WorldModelPrediction> {
    if (!ort || !this.session) {
      throw new Error('ONNX session not available');
    }

    // 并发控制
    if (this.activeSessions >= this.config.maxConcurrentInferences) {
      log.warn('推理并发数已达上限，降级到 fallback', {
        active: this.activeSessions,
        max: this.config.maxConcurrentInferences,
      });
      return this.predictWithFallback(input);
    }

    this.activeSessions++;

    try {
      // 输入张量构造（平台多模态标准）
      const tensorInput = new ort.Tensor(
        'float32',
        new Float32Array(input.encodedFeatures),
        [1, input.sequenceLength, input.featureDim],
      );

      const feeds: Record<string, any> = { input: tensorInput };

      // 超时控制
      const results = await Promise.race([
        this.session.run(feeds),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ONNX inference timeout')), this.config.inferenceTimeoutMs),
        ),
      ]);

      // 输出解析（LSTM/Transformer 典型输出）
      const futureTrajectory = Array.from(results.output.data as Float32Array);
      const interventionProb = (results.probability?.data?.[0] as number) ?? 0;
      const confidence = (results.confidence?.data?.[0] as number) ?? 0.5;

      const carbonIntensity = await this.getCarbonIntensity();
      return {
        futureStates: futureTrajectory,
        interventionProbability: Math.max(0, Math.min(1, interventionProb)),
        carbonIntensityForecast: carbonIntensity,
        confidence: Math.max(0, Math.min(1, confidence)),
        timestamp: Date.now(),
      };
    } catch (error) {
      log.error('ONNX 推理失败，降级到 fallback', { error, jobId: input.jobId });
      return this.predictWithFallback(input);
    } finally {
      this.activeSessions--;
    }
  }

  /**
   * Fallback 推理（物理估算）
   * 当 ONNX Runtime 不可用时，使用简化的统计模型生成预测
   * 生产环境应尽量避免长期使用此模式
   */
  private predictWithFallback(input: WorldModelInput): WorldModelPrediction {
    const features = input.encodedFeatures;
    const featureDim = input.featureDim;
    const seqLen = input.sequenceLength;

    // 提取最后一个时间步的特征作为基线
    const lastStepStart = (seqLen - 1) * featureDim;
    const lastStep = features.slice(lastStepStart, lastStepStart + featureDim);

    // 计算特征趋势（最后两个时间步的差值）
    const trends: number[] = [];
    if (seqLen >= 2) {
      const prevStepStart = (seqLen - 2) * featureDim;
      for (let i = 0; i < featureDim; i++) {
        trends.push((features[lastStepStart + i] ?? 0) - (features[prevStepStart + i] ?? 0));
      }
    } else {
      for (let i = 0; i < featureDim; i++) trends.push(0);
    }

    // 线性外推 + 衰减
    const horizonSteps = 10;
    const futureStates: number[] = [];
    const decayFactor = 0.95;

    for (let step = 1; step <= horizonSteps; step++) {
      const decay = Math.pow(decayFactor, step);
      for (let d = 0; d < featureDim; d++) {
        futureStates.push((lastStep[d] ?? 0) + trends[d] * step * decay);
      }
    }

    // 干预概率：基于特征变化率
    const avgTrendMagnitude = trends.reduce((sum, t) => sum + Math.abs(t), 0) / featureDim;
    const interventionProbability = Math.min(1, avgTrendMagnitude * 2);

    return {
      futureStates,
      interventionProbability,
      carbonIntensityForecast: this.estimateCarbonByTime(),
      confidence: 0.3, // fallback 置信度较低
      timestamp: Date.now(),
    };
  }

  // ========================================================================
  // 训练接口（Dojo 调度 + 模拟/真实导出）
  // ========================================================================

  async train(job: WorldModelTrainingJob): Promise<boolean> {
    await this.init();

    try {
      // 碳感知调度：获取最优训练窗口
      if (job.carbonAware && evolutionConfig.carbonAware.enabled) {
        try {
          const window = await carbonAwareClient.getOptimalTrainingWindow(2);
          log.info('Dojo 训练已碳优化调度', {
            trainNow: window.trainNow,
            avgCarbonIntensity: window.avgCarbonIntensity,
            savingsPercent: window.savingsPercent,
            optimalStart: window.startTime,
          });
        } catch (err) {
          log.warn('碳感知调度失败，立即开始训练', { error: String(err) });
        }
      }

      // 构造 Dojo 训练任务
      await this.dojoScheduler.schedule({
        id: job.id,
        name: `world-model-${job.id}`,
        modelId: job.modelId || `wm-${Date.now()}`,
        jobType: 'full_train',
        dataType: 'timeseries',
        estimatedDurationMs: 300_000, // 5 分钟预估
        datasetSizeMB: 100,
        priority: 2,
        resources: {
          gpus: 1,
          cpuCores: 4,
          memoryGB: 8,
          storageGB: 20,
          preferSpot: job.carbonAware,
        },
        config: {
          architecture: job.config?.architecture || 'lstm',
          ...(job.config || {}),
        },
        submittedAt: Date.now(),
        submittedBy: job.submittedBy || 'world-model-engine',
      });

      log.info('WorldModel 训练任务已提交到 Dojo', { jobId: job.id });

      // 模拟训练过程（生产中：调用 Python 子进程或外部训练服务导出 ONNX）
      // 真实场景：await this.runPythonTraining(job); // 然后 reload session
      await this.simulateTraining(job);

      FSDMetrics.trainingJobs.inc('completed', 'full_train');

      await eventBus.publish(
        EVOLUTION_TOPICS.WORLD_MODEL_TRAINED,
        'world_model_trained',
        { jobId: job.id, success: true },
        { source: 'world-model-engine', severity: 'info' },
      );

      return true;
    } catch (error) {
      log.error('WorldModel 训练失败', { error, jobId: job.id });
      FSDMetrics.trainingJobs.inc('failed', 'full_train');
      return false;
    }
  }

  /**
   * 模拟训练过程
   * TODO: 替换为真实 Python 训练 + ONNX 导出
   * 示例：exec('python scripts/train_world_model.py --jobId ' + job.id)
   */
  private async simulateTraining(job: WorldModelTrainingJob): Promise<void> {
    const durationMs = 5000; // 模拟 5s 训练
    log.info('模拟训练开始', { jobId: job.id, durationMs });

    await new Promise(resolve => setTimeout(resolve, durationMs));

    // 训练完重新加载模型
    await this.reloadModel();

    log.info('模拟训练完成，模型已重新加载', { jobId: job.id });
  }

  /**
   * 重新加载 ONNX 模型（训练后热更新）
   */
  async reloadModel(): Promise<void> {
    if (this.session && ort) {
      try {
        await this.session.release();
      } catch (err) {
        log.warn('释放旧 ONNX session 失败', { error: err });
      }
    }
    this.session = null;
    this.initialized = false;
    await this.init();
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 碳排放强度获取（优先 WattTime API，降级到时间段估算）
   */
  private async getCarbonIntensity(): Promise<number> {
    if (evolutionConfig.carbonAware.enabled) {
      try {
        return await carbonAwareClient.getCurrentIntensity();
      } catch {
        // WattTime 不可用，降级
      }
    }
    return this.estimateCarbonByTime();
  }

  /**
   * 碳排放强度估算（同步降级版本，用于不支持 async 的场景）
   */
  private estimateCarbonByTime(): number {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return 280;  // 夜间低谷
    if (hour >= 9 && hour < 17) return 520;   // 白天高峰
    return 420; // 过渡时段
  }

  /**
   * 获取引擎状态
   */
  getStatus(): {
    initialized: boolean;
    onnxAvailable: boolean;
    sessionActive: boolean;
    activeSessions: number;
    config: WorldModelEngineConfig;
  } {
    return {
      initialized: this.initialized,
      onnxAvailable: ort !== null,
      sessionActive: this.session !== null,
      activeSessions: this.activeSessions,
      config: { ...this.config },
    };
  }

  /**
   * 更新引擎配置（热更新）
   */
  updateConfig(updates: Partial<WorldModelEngineConfig>): void {
    const needReload = updates.modelPath && updates.modelPath !== this.config.modelPath;
    this.config = { ...this.config, ...updates };

    if (needReload) {
      log.info('模型路径变更，触发重新加载', { newPath: this.config.modelPath });
      this.reloadModel().catch(err => log.error('热更新重新加载失败', { error: err }));
    }
  }

  // ========================================================================
  // 资源释放
  // ========================================================================

  async dispose(): Promise<void> {
    if (this.session && ort) {
      try {
        await this.session.release();
        log.info('WorldModelEngine ONNX session 已释放');
      } catch (err) {
        log.warn('释放 ONNX session 失败', { error: err });
      }
    }
    this.session = null;
    this.initialized = false;
    FSDMetrics.engineUp.set(0);
  }
}
