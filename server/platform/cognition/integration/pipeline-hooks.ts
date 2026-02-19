/**
 * ============================================================================
 * 流水线认知嵌入点 — Pipeline Cognition Hooks
 * ============================================================================
 *
 * 将认知闭环嵌入工况驱动 AI 流水线的 6 个关键节点：
 *
 *   1. POST_COLLECT    — 采集后：检测数据质量异常
 *   2. POST_LABEL      — 标注后：检测标注一致性
 *   3. PRE_TRAIN       — 训练前：评估训练必要性
 *   4. POST_EVALUATE   — 评估后：TAS 综合评估
 *   5. PRE_DEPLOY      — 发布前：影子评估 + 金丝雀决策
 *   6. DRIFT_DETECTED  — 漂移检测：触发认知闭环全流程
 *
 * 设计原则：
 *   - 钩子是可选的：认知闭环默认关闭，不影响现有流水线
 *   - 钩子是非阻塞的：通过 EventBus 异步触发，不阻断主流程
 *   - 钩子可以返回建议（advisory），但不强制流水线执行
 *   - 支持通过配置启用/禁用每个嵌入点
 */

import { createModuleLogger } from '../../../core/logger';
import { getCognitionEventEmitter } from '../events/emitter';
import { getCognitionScheduler } from '../scheduler/cognition-scheduler';
import type {
  CognitionStimulus,
  CognitionResult,
  CognitionPriority,
} from '../types';

const log = createModuleLogger('pipelineHooks');

// ============================================================================
// 嵌入点类型
// ============================================================================

export type PipelineHookPoint =
  | 'POST_COLLECT'
  | 'POST_LABEL'
  | 'PRE_TRAIN'
  | 'POST_EVALUATE'
  | 'PRE_DEPLOY'
  | 'DRIFT_DETECTED';

/** 嵌入点配置 */
export interface PipelineHookConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 */
  priority: CognitionPriority;
  /** 是否阻塞流水线等待认知结果 */
  blocking: boolean;
  /** 阻塞超时（毫秒），仅在 blocking=true 时生效 */
  blockingTimeoutMs: number;
}

/** 全局嵌入点配置 */
export type PipelineHooksConfig = Record<PipelineHookPoint, PipelineHookConfig>;

/** 嵌入点回调结果 */
export interface HookAdvice {
  /** 嵌入点 */
  hookPoint: PipelineHookPoint;
  /** 建议动作 */
  action: 'proceed' | 'pause' | 'abort' | 'retry';
  /** 原因 */
  reason: string;
  /** 关联的认知结果 ID */
  cognitionResultId?: string;
  /** 置信度 */
  confidence: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_HOOKS_CONFIG: PipelineHooksConfig = {
  POST_COLLECT: {
    enabled: true,
    priority: 'normal',
    blocking: false,
    blockingTimeoutMs: 10_000,
  },
  POST_LABEL: {
    enabled: true,
    priority: 'normal',
    blocking: false,
    blockingTimeoutMs: 15_000,
  },
  PRE_TRAIN: {
    enabled: true,
    priority: 'high',
    blocking: true,
    blockingTimeoutMs: 30_000,
  },
  POST_EVALUATE: {
    enabled: true,
    priority: 'high',
    blocking: true,
    blockingTimeoutMs: 60_000,
  },
  PRE_DEPLOY: {
    enabled: true,
    priority: 'critical',
    blocking: true,
    blockingTimeoutMs: 120_000,
  },
  DRIFT_DETECTED: {
    enabled: true,
    priority: 'critical',
    blocking: false,
    blockingTimeoutMs: 30_000,
  },
};

// ============================================================================
// PipelineHookManager
// ============================================================================

export class PipelineHookManager {
  private config: PipelineHooksConfig;
  private readonly emitter = getCognitionEventEmitter();

  constructor(config?: Partial<PipelineHooksConfig>) {
    this.config = { ...DEFAULT_HOOKS_CONFIG, ...config };
  }

  /**
   * 触发嵌入点
   *
   * @param hookPoint 嵌入点
   * @param context 流水线上下文
   * @returns HookAdvice 如果是阻塞模式；undefined 如果是非阻塞模式
   */
  async trigger(
    hookPoint: PipelineHookPoint,
    context: PipelineHookContext,
  ): Promise<HookAdvice | undefined> {
    const hookConfig = this.config[hookPoint];

    if (!hookConfig.enabled) {
      log.debug({ hookPoint }, 'Hook disabled, skipping');
      return undefined;
    }

    // 构造认知刺激
    const stimulus = this.buildStimulus(hookPoint, context, hookConfig);

    log.info({
      hookPoint,
      pipelineRunId: context.pipelineRunId,
      blocking: hookConfig.blocking,
    }, 'Pipeline hook triggered');

    const scheduler = getCognitionScheduler();

    if (hookConfig.blocking) {
      // 阻塞模式：等待认知结果后返回建议
      try {
        const result = await this.submitWithTimeout(
          scheduler, stimulus, hookConfig.blockingTimeoutMs,
        );
        return this.resultToAdvice(hookPoint, result);
      } catch (err) {
        log.warn({
          hookPoint,
          error: err instanceof Error ? err.message : String(err),
        }, 'Blocking hook failed, defaulting to proceed');
        return {
          hookPoint,
          action: 'proceed',
          reason: `认知评估超时或失败: ${err instanceof Error ? err.message : String(err)}`,
          confidence: 0,
        };
      }
    } else {
      // 非阻塞模式：提交后立即返回
      scheduler.submit(stimulus).catch(err => {
        log.warn({
          hookPoint,
          error: err instanceof Error ? err.message : String(err),
        }, 'Non-blocking hook submission failed');
      });
      return undefined;
    }
  }

  /**
   * 更新嵌入点配置
   */
  updateConfig(hookPoint: PipelineHookPoint, config: Partial<PipelineHookConfig>): void {
    this.config[hookPoint] = { ...this.config[hookPoint], ...config };
  }

  /**
   * 获取嵌入点配置
   */
  getConfig(): Readonly<PipelineHooksConfig> {
    return this.config;
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  /** 构造认知刺激 */
  private buildStimulus(
    hookPoint: PipelineHookPoint,
    context: PipelineHookContext,
    hookConfig: PipelineHookConfig,
  ): CognitionStimulus {
    return {
      id: `stim_${hookPoint.toLowerCase()}_${Date.now().toString(36)}`,
      source: `pipeline:${hookPoint}`,
      type: this.hookPointToStimulusType(hookPoint),
      priority: hookConfig.priority,
      payload: {
        hookPoint,
        pipelineRunId: context.pipelineRunId,
        nodeId: context.nodeId,
        ocProfileId: context.ocProfileId,
        deviceId: context.deviceId,
        ...context.data,
      },
      ocProfileId: context.ocProfileId,
      deviceId: context.deviceId,
      deduplicationKey: `${hookPoint}:${context.pipelineRunId}:${context.nodeId}`,
      createdAt: new Date(),
    };
  }

  /** 嵌入点到刺激类型的映射 */
  private hookPointToStimulusType(hookPoint: PipelineHookPoint): CognitionStimulus['type'] {
    const mapping: Record<PipelineHookPoint, CognitionStimulus['type']> = {
      POST_COLLECT: 'data_quality',
      POST_LABEL: 'data_quality',
      PRE_TRAIN: 'pipeline_event',
      POST_EVALUATE: 'model_evaluation',
      PRE_DEPLOY: 'model_evaluation',
      DRIFT_DETECTED: 'drift_alert',
    };
    return mapping[hookPoint];
  }

  /** 带超时的提交 */
  private submitWithTimeout(
    scheduler: ReturnType<typeof getCognitionScheduler>,
    stimulus: CognitionStimulus,
    timeoutMs: number,
  ): Promise<CognitionResult> {
    return new Promise<CognitionResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Hook blocking timeout (${timeoutMs}ms)`)),
        timeoutMs,
      );
      scheduler.submit(stimulus)
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  /** 认知结果转换为嵌入点建议 */
  private resultToAdvice(
    hookPoint: PipelineHookPoint,
    result: CognitionResult,
  ): HookAdvice {
    // 基于收敛状态和置信度决定建议
    if (result.state !== 'completed') {
      return {
        hookPoint,
        action: 'proceed',
        reason: `认知活动未完成（状态：${result.state}），默认放行`,
        cognitionResultId: result.id,
        confidence: 0,
      };
    }

    const { convergence, crossValidation } = result;

    // 高置信度且收敛 → 根据决策维输出决定
    if (convergence.converged && convergence.overallConfidence >= 0.7) {
      const decision = result.dimensions.decision;
      if (decision?.success) {
        const hasBlockingAction = decision.data.recommendedActions.some(
          a => a.type === 'retrain' || a.type === 'alert',
        );
        if (hasBlockingAction) {
          return {
            hookPoint,
            action: 'pause',
            reason: `认知评估建议暂停：${decision.data.recommendedActions[0]?.description || '需要人工确认'}`,
            cognitionResultId: result.id,
            confidence: convergence.overallConfidence,
          };
        }
      }
      return {
        hookPoint,
        action: 'proceed',
        reason: `认知评估通过（置信度${(convergence.overallConfidence * 100).toFixed(1)}%）`,
        cognitionResultId: result.id,
        confidence: convergence.overallConfidence,
      };
    }

    // 低一致性 → 建议暂停
    if (crossValidation.consistencyScore < 0.4) {
      return {
        hookPoint,
        action: 'pause',
        reason: `维度间一致性过低（${(crossValidation.consistencyScore * 100).toFixed(1)}%），建议人工复核`,
        cognitionResultId: result.id,
        confidence: convergence.overallConfidence,
      };
    }

    // 默认放行
    return {
      hookPoint,
      action: 'proceed',
      reason: `认知评估未达到阻断阈值（置信度${(convergence.overallConfidence * 100).toFixed(1)}%）`,
      cognitionResultId: result.id,
      confidence: convergence.overallConfidence,
    };
  }
}

// ============================================================================
// 流水线上下文
// ============================================================================

export interface PipelineHookContext {
  /** 流水线运行 ID */
  pipelineRunId: string;
  /** 当前节点 ID */
  nodeId: string;
  /** 工况配置 ID */
  ocProfileId?: string;
  /** 设备 ID */
  deviceId?: string;
  /** 节点输出数据 */
  data: Record<string, unknown>;
}

// ============================================================================
// 单例
// ============================================================================

let hookManager: PipelineHookManager | null = null;

/** 获取流水线嵌入点管理器 */
export function getPipelineHookManager(
  config?: Partial<PipelineHooksConfig>,
): PipelineHookManager {
  if (!hookManager) {
    hookManager = new PipelineHookManager(config);
  }
  return hookManager;
}

/** 重置（测试用） */
export function resetPipelineHookManager(): void {
  hookManager = null;
}
