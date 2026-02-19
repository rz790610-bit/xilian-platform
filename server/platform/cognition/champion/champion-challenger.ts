/**
 * ============================================================================
 * Champion-Challenger 挑战赛控制器
 * ============================================================================
 *
 * 管理模型晋升的完整生命周期：
 *   1. 注册 Challenger（候选模型）
 *   2. 调度影子评估
 *   3. 根据 TAS 分数决策（PROMOTE / CANARY_EXTENDED / REJECT）
 *   4. 执行晋升或拒绝动作
 *   5. 记录挑战历史
 *
 * 三阶段门控：
 *   Gate 1 — 基础指标检查（准确率、延迟、资源消耗）
 *   Gate 2 — 影子评估 + TAS 综合分数
 *   Gate 3 — 金丝雀发布验证
 *
 * 对应 v3.0 方案任务 U-17
 */

import { createModuleLogger } from '../../../core/logger';
import { getCognitionEventEmitter } from '../events/emitter';
import type { ShadowEvalResult, ShadowEvalMode } from '../types';
import { ShadowEvaluator } from '../shadow-eval/shadow-evaluator';

const log = createModuleLogger('championChallenger');

// ============================================================================
// 类型定义
// ============================================================================

/** 挑战赛状态 */
export type ChallengeStatus =
  | 'pending'         // 等待评估
  | 'gate1_checking'  // Gate 1 基础指标检查中
  | 'gate1_passed'    // Gate 1 通过
  | 'gate1_failed'    // Gate 1 未通过
  | 'gate2_evaluating' // Gate 2 影子评估中
  | 'gate2_passed'    // Gate 2 通过
  | 'gate2_failed'    // Gate 2 未通过
  | 'gate3_canary'    // Gate 3 金丝雀验证中
  | 'gate3_passed'    // Gate 3 通过
  | 'gate3_failed'    // Gate 3 未通过
  | 'promoted'        // 已晋升为 Champion
  | 'rejected'        // 已拒绝
  | 'cancelled';      // 已取消

/** 挑战赛记录 */
export interface ChallengeRecord {
  /** 挑战赛 ID */
  id: string;
  /** Challenger 模型 ID */
  challengerModelId: string;
  /** 当前 Champion 模型 ID */
  championModelId: string;
  /** 工况 ID */
  ocProfileId?: string;
  /** 当前状态 */
  status: ChallengeStatus;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** Gate 1 结果 */
  gate1?: Gate1Result;
  /** Gate 2 结果 */
  gate2?: Gate2Result;
  /** Gate 3 结果 */
  gate3?: Gate3Result;
  /** 最终决策 */
  finalDecision?: 'promoted' | 'rejected';
  /** 决策理由 */
  decisionReason?: string;
}

/** Gate 1 基础指标检查结果 */
export interface Gate1Result {
  passed: boolean;
  checks: Array<{
    metric: string;
    threshold: number;
    actual: number;
    passed: boolean;
  }>;
  checkedAt: Date;
}

/** Gate 2 影子评估结果 */
export interface Gate2Result {
  passed: boolean;
  shadowEvalResult: ShadowEvalResult;
  evaluatedAt: Date;
}

/** Gate 3 金丝雀验证结果 */
export interface Gate3Result {
  passed: boolean;
  canarySessionId: string;
  trafficRatio: number;
  observationDurationMs: number;
  errorRate: number;
  latencyDegradation: number;
  verifiedAt: Date;
}

/** Gate 1 检查配置 */
export interface Gate1Config {
  /** 最低准确率 */
  minAccuracy: number;
  /** 最大 P99 延迟（毫秒） */
  maxLatencyP99Ms: number;
  /** 最大模型大小（MB） */
  maxModelSizeMb: number;
  /** 最大推理内存（MB） */
  maxInferenceMemoryMb: number;
}

/** 挑战赛配置 */
export interface ChampionChallengerConfig {
  gate1: Gate1Config;
  /** 影子评估模式 */
  shadowEvalMode: ShadowEvalMode;
  /** 自动进入 Gate 3 的 TAS 阈值 */
  autoCanaryThreshold: number;
  /** 最大同时进行的挑战赛数量 */
  maxConcurrentChallenges: number;
}

const DEFAULT_CONFIG: ChampionChallengerConfig = {
  gate1: {
    minAccuracy: 0.85,
    maxLatencyP99Ms: 200,
    maxModelSizeMb: 500,
    maxInferenceMemoryMb: 2048,
  },
  shadowEvalMode: 'pipeline',
  autoCanaryThreshold: 0.7,
  maxConcurrentChallenges: 5,
};

// ============================================================================
// 模型指标适配器接口
// ============================================================================

/**
 * 模型指标适配器 — 获取模型的基础指标
 */
export interface ModelMetricsAdapter {
  /** 获取模型准确率 */
  getAccuracy(modelId: string): Promise<number>;
  /** 获取模型 P99 延迟 */
  getLatencyP99(modelId: string): Promise<number>;
  /** 获取模型大小（MB） */
  getModelSize(modelId: string): Promise<number>;
  /** 获取推理内存占用（MB） */
  getInferenceMemory(modelId: string): Promise<number>;
}

// ============================================================================
// Champion-Challenger 控制器实现
// ============================================================================

export class ChampionChallengerController {
  private readonly config: ChampionChallengerConfig;
  private readonly shadowEvaluator: ShadowEvaluator;
  private readonly metricsAdapter: ModelMetricsAdapter;
  private readonly emitter = getCognitionEventEmitter();

  // 挑战赛记录
  private readonly challenges: Map<string, ChallengeRecord> = new Map();
  private challengeCounter = 0;

  constructor(
    shadowEvaluator: ShadowEvaluator,
    metricsAdapter: ModelMetricsAdapter,
    config?: Partial<ChampionChallengerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shadowEvaluator = shadowEvaluator;
    this.metricsAdapter = metricsAdapter;
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 发起挑战赛
   *
   * @param challengerModelId Challenger 模型 ID
   * @param championModelId 当前 Champion 模型 ID
   * @param ocProfileId 工况 ID（可选）
   * @returns 挑战赛记录
   */
  async startChallenge(
    challengerModelId: string,
    championModelId: string,
    ocProfileId?: string,
  ): Promise<ChallengeRecord> {
    // 检查并发限制
    const activeCount = Array.from(this.challenges.values())
      .filter(c => !['promoted', 'rejected', 'cancelled'].includes(c.status))
      .length;

    if (activeCount >= this.config.maxConcurrentChallenges) {
      throw new Error(
        `Max concurrent challenges (${this.config.maxConcurrentChallenges}) reached`,
      );
    }

    // 创建挑战赛记录
    const challenge: ChallengeRecord = {
      id: this.generateChallengeId(),
      challengerModelId,
      championModelId,
      ocProfileId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.challenges.set(challenge.id, challenge);

    log.info({
      challengeId: challenge.id,
      challengerModelId,
      championModelId,
      ocProfileId,
    }, 'Challenge started');

    // 异步执行三阶段门控
    this.executeGates(challenge).catch(err => {
      log.error({
        challengeId: challenge.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Challenge execution failed');
    });

    return challenge;
  }

  /**
   * 获取挑战赛记录
   */
  getChallenge(challengeId: string): ChallengeRecord | undefined {
    return this.challenges.get(challengeId);
  }

  /**
   * 获取所有挑战赛记录
   */
  getAllChallenges(): ChallengeRecord[] {
    return Array.from(this.challenges.values());
  }

  /**
   * 取消挑战赛
   */
  cancelChallenge(challengeId: string): boolean {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return false;

    if (['promoted', 'rejected', 'cancelled'].includes(challenge.status)) {
      return false; // 已终结的挑战赛不能取消
    }

    challenge.status = 'cancelled';
    challenge.updatedAt = new Date();
    challenge.finalDecision = 'rejected';
    challenge.decisionReason = 'Cancelled by user';

    log.info({ challengeId }, 'Challenge cancelled');
    return true;
  }

  /**
   * 手动推进 Gate 3（金丝雀验证完成后调用）
   */
  completeGate3(challengeId: string, gate3Result: Gate3Result): ChallengeRecord {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      throw new Error(`Challenge ${challengeId} not found`);
    }
    if (challenge.status !== 'gate3_canary') {
      throw new Error(`Challenge ${challengeId} is not in gate3_canary status`);
    }

    challenge.gate3 = gate3Result;
    challenge.updatedAt = new Date();

    if (gate3Result.passed) {
      challenge.status = 'gate3_passed';
      challenge.finalDecision = 'promoted';
      challenge.decisionReason =
        `All three gates passed. Gate 3 canary: errorRate=${gate3Result.errorRate.toFixed(4)}, ` +
        `latencyDegradation=${gate3Result.latencyDegradation.toFixed(4)}`;

      this.emitter.emitChampionPromoted({
        challengeId: challenge.id,
        newChampionModelId: challenge.challengerModelId,
        previousChampionModelId: challenge.championModelId,
        tasScore: challenge.gate2?.shadowEvalResult.tasScore ?? 0,
        promotedAt: new Date(),
      });

      challenge.status = 'promoted';
    } else {
      challenge.status = 'gate3_failed';
      challenge.finalDecision = 'rejected';
      challenge.decisionReason =
        `Gate 3 canary failed: errorRate=${gate3Result.errorRate.toFixed(4)}, ` +
        `latencyDegradation=${gate3Result.latencyDegradation.toFixed(4)}`;
      challenge.status = 'rejected';
    }

    log.info({
      challengeId: challenge.id,
      gate3Passed: gate3Result.passed,
      finalDecision: challenge.finalDecision,
    }, 'Gate 3 completed');

    return challenge;
  }

  // ==========================================================================
  // 内部执行
  // ==========================================================================

  /**
   * 执行三阶段门控
   */
  private async executeGates(challenge: ChallengeRecord): Promise<void> {
    // ---- Gate 1: 基础指标检查 ----
    challenge.status = 'gate1_checking';
    challenge.updatedAt = new Date();

    const gate1Result = await this.executeGate1(challenge.challengerModelId);
    challenge.gate1 = gate1Result;
    challenge.updatedAt = new Date();

    if (!gate1Result.passed) {
      challenge.status = 'gate1_failed';
      challenge.finalDecision = 'rejected';
      challenge.decisionReason = `Gate 1 failed: ${
        gate1Result.checks
          .filter(c => !c.passed)
          .map(c => `${c.metric} (${c.actual} vs threshold ${c.threshold})`)
          .join('; ')
      }`;
      challenge.status = 'rejected';

      log.info({
        challengeId: challenge.id,
        failedChecks: gate1Result.checks.filter(c => !c.passed),
      }, 'Gate 1 failed');
      return;
    }

    challenge.status = 'gate1_passed';
    log.info({ challengeId: challenge.id }, 'Gate 1 passed');

    // ---- Gate 2: 影子评估 ----
    challenge.status = 'gate2_evaluating';
    challenge.updatedAt = new Date();

    try {
      const shadowResult = await this.shadowEvaluator.evaluate(
        this.config.shadowEvalMode,
        challenge.challengerModelId,
        challenge.championModelId,
        challenge.ocProfileId,
      );

      const gate2Result: Gate2Result = {
        passed: shadowResult.decision !== 'REJECT',
        shadowEvalResult: shadowResult,
        evaluatedAt: new Date(),
      };

      challenge.gate2 = gate2Result;
      challenge.updatedAt = new Date();

      if (!gate2Result.passed) {
        challenge.status = 'gate2_failed';
        challenge.finalDecision = 'rejected';
        challenge.decisionReason = `Gate 2 failed: TAS=${shadowResult.tasScore.toFixed(3)}, decision=${shadowResult.decision}`;
        challenge.status = 'rejected';

        log.info({
          challengeId: challenge.id,
          tasScore: shadowResult.tasScore,
          decision: shadowResult.decision,
        }, 'Gate 2 failed');
        return;
      }

      challenge.status = 'gate2_passed';
      log.info({
        challengeId: challenge.id,
        tasScore: shadowResult.tasScore,
        decision: shadowResult.decision,
      }, 'Gate 2 passed');

      // ---- Gate 3 决策 ----
      if (shadowResult.decision === 'PROMOTE' && shadowResult.tasScore >= this.config.autoCanaryThreshold) {
        // TAS 足够高，仍然需要金丝雀验证（安全起见）
        challenge.status = 'gate3_canary';
        challenge.updatedAt = new Date();

        log.info({
          challengeId: challenge.id,
          tasScore: shadowResult.tasScore,
        }, 'Entering Gate 3 canary verification');

        // Gate 3 由外部金丝雀控制器驱动，通过 completeGate3() 回调完成
      } else if (shadowResult.decision === 'CANARY_EXTENDED') {
        // 需要延长金丝雀观察
        challenge.status = 'gate3_canary';
        challenge.updatedAt = new Date();

        log.info({
          challengeId: challenge.id,
          tasScore: shadowResult.tasScore,
        }, 'Entering Gate 3 extended canary');
      }
    } catch (err) {
      challenge.status = 'gate2_failed';
      challenge.finalDecision = 'rejected';
      challenge.decisionReason = `Gate 2 evaluation error: ${err instanceof Error ? err.message : String(err)}`;
      challenge.status = 'rejected';
      challenge.updatedAt = new Date();

      log.error({
        challengeId: challenge.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Gate 2 evaluation error');
    }
  }

  /**
   * 执行 Gate 1 基础指标检查
   */
  private async executeGate1(challengerModelId: string): Promise<Gate1Result> {
    const { gate1 } = this.config;
    const checks: Gate1Result['checks'] = [];

    // 并行获取所有指标
    const [accuracy, latencyP99, modelSize, inferenceMemory] = await Promise.all([
      this.metricsAdapter.getAccuracy(challengerModelId).catch(() => -1),
      this.metricsAdapter.getLatencyP99(challengerModelId).catch(() => -1),
      this.metricsAdapter.getModelSize(challengerModelId).catch(() => -1),
      this.metricsAdapter.getInferenceMemory(challengerModelId).catch(() => -1),
    ]);

    // 检查准确率
    if (accuracy >= 0) {
      checks.push({
        metric: 'accuracy',
        threshold: gate1.minAccuracy,
        actual: accuracy,
        passed: accuracy >= gate1.minAccuracy,
      });
    }

    // 检查延迟
    if (latencyP99 >= 0) {
      checks.push({
        metric: 'latencyP99',
        threshold: gate1.maxLatencyP99Ms,
        actual: latencyP99,
        passed: latencyP99 <= gate1.maxLatencyP99Ms,
      });
    }

    // 检查模型大小
    if (modelSize >= 0) {
      checks.push({
        metric: 'modelSize',
        threshold: gate1.maxModelSizeMb,
        actual: modelSize,
        passed: modelSize <= gate1.maxModelSizeMb,
      });
    }

    // 检查推理内存
    if (inferenceMemory >= 0) {
      checks.push({
        metric: 'inferenceMemory',
        threshold: gate1.maxInferenceMemoryMb,
        actual: inferenceMemory,
        passed: inferenceMemory <= gate1.maxInferenceMemoryMb,
      });
    }

    return {
      passed: checks.length > 0 && checks.every(c => c.passed),
      checks,
      checkedAt: new Date(),
    };
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  private generateChallengeId(): string {
    this.challengeCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.challengeCounter.toString(36).padStart(4, '0');
    return `cc_${timestamp}_${counter}`;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建 Champion-Challenger 控制器 */
export function createChampionChallengerController(
  shadowEvaluator: ShadowEvaluator,
  metricsAdapter: ModelMetricsAdapter,
  config?: Partial<ChampionChallengerConfig>,
): ChampionChallengerController {
  return new ChampionChallengerController(shadowEvaluator, metricsAdapter, config);
}
