/**
 * ============================================================================
 * 认知闭环事件发布器 — Cognition Event Emitter
 * ============================================================================
 *
 * 封装平台 EventBus 的调用，提供类型安全的认知事件发布接口。
 * 所有认知模块通过此发布器发布事件，而非直接调用 EventBus。
 *
 * 设计原则：
 *   - 类型安全：每种事件有明确的 payload 类型
 *   - 解耦：认知模块不直接依赖 EventBus 实现
 *   - 可测试：可注入 mock EventBus 进行单元测试
 */

import { publish as eventBusPublish } from '../../../services/eventBus.service';
import { COGNITION_TOPICS, OC_TOPICS, DATA_TOPICS, LABEL_TOPICS, TRAIN_TOPICS, EVAL_TOPICS, RELEASE_TOPICS } from './topics';
import type {
  CognitionStimulus,
  CognitionResult,
  CognitionDimension,
  DimensionOutput,
  DegradationMode,
  NarrativeSummary,
  KnowledgeCrystal,
  OCProfile,
  OCTransitionEvent,
  ShadowEvalSession,
  ShadowEvalResult,
} from '../types';

// ============================================================================
// 事件 Payload 类型
// ============================================================================

export interface CognitionUnitActivatedPayload {
  stimulusId: string;
  stimulus: CognitionStimulus;
  activatedAt: Date;
}

export interface CognitionUnitCompletedPayload {
  resultId: string;
  stimulusId: string;
  result: CognitionResult;
  completedAt: Date;
}

export interface CognitionUnitFailedPayload {
  stimulusId: string;
  error: string;
  failedAt: Date;
}

export interface DimensionDonePayload {
  stimulusId: string;
  dimension: CognitionDimension;
  output: DimensionOutput;
  completedAt: Date;
}

export interface DegradationModeChangedPayload {
  previousMode: DegradationMode;
  currentMode: DegradationMode;
  reason: string;
  changedAt: Date;
}

export interface KnowledgeCrystallizedPayload {
  crystal: KnowledgeCrystal;
  crystallizedAt: Date;
}

export interface OCProfileTransitionPayload {
  event: OCTransitionEvent;
}

export interface ShadowEvalCompletedPayload {
  session: ShadowEvalSession;
  result: ShadowEvalResult;
}

// ============================================================================
// 事件发布器
// ============================================================================

/**
 * 发布函数签名 — 可注入 mock 实现
 */
type PublishFn = (topic: string, payload: Record<string, unknown>) => void;

export class CognitionEventEmitter {
  private readonly publishFn: PublishFn;

  constructor(publishFn?: PublishFn) {
    this.publishFn = publishFn || ((topic, payload) => {
      eventBusPublish(topic, 'cognition_event', payload, { source: 'cognition-emitter' });
    });
  }

  // ========== 认知单元生命周期 ==========

  emitUnitActivated(payload: CognitionUnitActivatedPayload): void {
    this.publishFn(COGNITION_TOPICS.UNIT_ACTIVATED, payload as unknown as Record<string, unknown>);
  }

  emitUnitCompleted(payload: CognitionUnitCompletedPayload): void {
    this.publishFn(COGNITION_TOPICS.UNIT_COMPLETED, payload as unknown as Record<string, unknown>);
  }

  emitUnitFailed(payload: CognitionUnitFailedPayload): void {
    this.publishFn(COGNITION_TOPICS.UNIT_FAILED, payload as unknown as Record<string, unknown>);
  }

  emitUnitTimeout(payload: { stimulusId: string; timeoutAt: Date }): void {
    this.publishFn(COGNITION_TOPICS.UNIT_TIMEOUT, payload as unknown as Record<string, unknown>);
  }

  // ========== 四维完成事件 ==========

  emitDimensionDone(payload: DimensionDonePayload): void {
    const topicMap: Record<CognitionDimension, string> = {
      perception: COGNITION_TOPICS.PERCEPTION_DONE,
      reasoning: COGNITION_TOPICS.REASONING_DONE,
      fusion: COGNITION_TOPICS.FUSION_DONE,
      decision: COGNITION_TOPICS.DECISION_DONE,
    };
    this.publishFn(topicMap[payload.dimension], payload as unknown as Record<string, unknown>);
  }

  // ========== 交叉验证与收敛 ==========

  emitCrossValidationDone(payload: {
    stimulusId: string;
    consistencyScore: number;
    completedAt: Date;
  }): void {
    this.publishFn(COGNITION_TOPICS.CROSS_VALIDATION_DONE, payload as unknown as Record<string, unknown>);
  }

  emitConvergenceDone(payload: {
    stimulusId: string;
    converged: boolean;
    iterations: number;
    overallConfidence: number;
    completedAt: Date;
  }): void {
    this.publishFn(COGNITION_TOPICS.CONVERGENCE_DONE, payload as unknown as Record<string, unknown>);
  }

  // ========== 叙事 ==========

  emitNarrativeGenerated(payload: {
    stimulusId: string;
    narrative: NarrativeSummary;
    generatedAt: Date;
  }): void {
    this.publishFn(COGNITION_TOPICS.NARRATIVE_GENERATED, payload as unknown as Record<string, unknown>);
  }

  // ========== 知识结晶 ==========

  emitKnowledgeCrystallized(payload: KnowledgeCrystallizedPayload): void {
    this.publishFn(COGNITION_TOPICS.KNOWLEDGE_CRYSTALLIZED, payload as unknown as Record<string, unknown>);
  }

  // ========== 降级 ==========

  emitDegradationModeChanged(payload: DegradationModeChangedPayload): void {
    this.publishFn(COGNITION_TOPICS.DEGRADATION_MODE_CHANGED, payload as unknown as Record<string, unknown>);
  }

  // ========== 链式认知 ==========

  emitChainTriggered(payload: {
    parentStimulusId: string;
    childStimulusId: string;
    reason: string;
    triggeredAt: Date;
  }): void {
    this.publishFn(COGNITION_TOPICS.CHAIN_TRIGGERED, payload as unknown as Record<string, unknown>);
  }

  // ========== 工况事件 ==========

  emitOCProfileCreated(payload: { profile: OCProfile }): void {
    this.publishFn(OC_TOPICS.PROFILE_CREATED, payload as unknown as Record<string, unknown>);
  }

  emitOCProfileUpdated(payload: { profile: OCProfile }): void {
    this.publishFn(OC_TOPICS.PROFILE_UPDATED, payload as unknown as Record<string, unknown>);
  }

  emitOCProfileTransition(payload: OCProfileTransitionPayload): void {
    this.publishFn(OC_TOPICS.PROFILE_TRANSITION, payload as unknown as Record<string, unknown>);
  }

  // ========== 数据事件 ==========

  emitDataCollected(payload: {
    /** 设备树节点ID */
    nodeId: string;
    dataType: string;
    sampleCount: number;
    collectedAt: Date;
  }): void {
    this.publishFn(DATA_TOPICS.COLLECTED, payload as unknown as Record<string, unknown>);
  }

  emitDataStored(payload: {
    storageKey: string;
    dataType: string;
    sizeBytes: number;
    storedAt: Date;
  }): void {
    this.publishFn(DATA_TOPICS.STORED, payload as unknown as Record<string, unknown>);
  }

  // ========== 标注事件 ==========

  emitLabelTaskCreated(payload: {
    taskId: string;
    sliceCount: number;
    createdAt: Date;
  }): void {
    this.publishFn(LABEL_TOPICS.TASK_CREATED, payload as unknown as Record<string, unknown>);
  }

  emitLabelConflictDetected(payload: {
    taskId: string;
    sliceId: string;
    conflictType: string;
    detectedAt: Date;
  }): void {
    this.publishFn(LABEL_TOPICS.CONFLICT_DETECTED, payload as unknown as Record<string, unknown>);
  }

  // ========== 训练事件 ==========

  emitTrainTriggerSatisfied(payload: {
    ocProfileId: string;
    reason: string;
    triggeredAt: Date;
  }): void {
    this.publishFn(TRAIN_TOPICS.TRIGGER_SATISFIED, payload as unknown as Record<string, unknown>);
  }

  emitTrainJobCompleted(payload: {
    jobId: string;
    modelId: string;
    metrics: Record<string, number>;
    completedAt: Date;
  }): void {
    this.publishFn(TRAIN_TOPICS.JOB_COMPLETED, payload as unknown as Record<string, unknown>);
  }

  // ========== 评估事件 ==========

  emitShadowEvalCompleted(payload: ShadowEvalCompletedPayload): void {
    this.publishFn(EVAL_TOPICS.SHADOW_COMPLETED, payload as unknown as Record<string, unknown>);
  }

  emitTASComputed(payload: {
    sessionId: string;
    tasScore: number;
    decision: string;
    computedAt: Date;
  }): void {
    this.publishFn(EVAL_TOPICS.TAS_COMPUTED, payload as unknown as Record<string, unknown>);
  }

  emitDriftDetected(payload: {
    /** 设备树节点ID */
    nodeId: string;
    driftType: string;
    severity: number;
    detectedAt: Date;
  }): void {
    this.publishFn(EVAL_TOPICS.DRIFT_DETECTED, payload as unknown as Record<string, unknown>);
  }

  // ========== 发布事件 ==========

  emitCanaryStarted(payload: {
    modelId: string;
    trafficPercentage: number;
    startedAt: Date;
  }): void {
    this.publishFn(RELEASE_TOPICS.CANARY_STARTED, payload as unknown as Record<string, unknown>);
  }

  emitCanaryCompleted(payload: {
    modelId: string;
    success: boolean;
    completedAt: Date;
  }): void {
    this.publishFn(RELEASE_TOPICS.CANARY_COMPLETED, payload as unknown as Record<string, unknown>);
  }

  emitFullPromoted(payload: {
    modelId: string;
    promotedAt: Date;
  }): void {
    this.publishFn(RELEASE_TOPICS.FULL_PROMOTED, payload as unknown as Record<string, unknown>);
  }
}

// ============================================================================
// 单例
// ============================================================================

let defaultEmitter: CognitionEventEmitter | null = null;

/** 获取默认事件发布器（懒初始化） */
export function getCognitionEventEmitter(): CognitionEventEmitter {
  if (!defaultEmitter) {
    defaultEmitter = new CognitionEventEmitter();
  }
  return defaultEmitter;
}

/** 重置默认发布器（测试用） */
export function resetCognitionEventEmitter(): void {
  defaultEmitter = null;
}

/** 创建自定义发布器（用于测试注入） */
export function createCognitionEventEmitter(publishFn: PublishFn): CognitionEventEmitter {
  return new CognitionEventEmitter(publishFn);
}
