/**
 * ============================================================================
 * 认知闭环 EventBus Topic 定义
 * ============================================================================
 *
 * 所有认知闭环相关的 EventBus Topic 统一在此定义。
 * 使用独立命名空间（oc. / cognition. / data. / label. / train. / eval. / release.）
 * 避免与现有 TOPICS 冲突。
 *
 * 命名规范：
 *   {namespace}.{entity}.{action}
 *   例如：oc.profile.transition, cognition.unit.activated
 */

// ============================================================================
// 工况相关 Topic
// ============================================================================

export const OC_TOPICS = {
  /** 工况配置创建 */
  PROFILE_CREATED: 'oc.profile.created',
  /** 工况配置更新 */
  PROFILE_UPDATED: 'oc.profile.updated',
  /** 工况切换发生 */
  PROFILE_TRANSITION: 'oc.profile.transition',
  /** 基线学习开始 */
  BASELINE_LEARNING_STARTED: 'oc.baseline.learning_started',
  /** 基线学习收敛 */
  BASELINE_CONVERGED: 'oc.baseline.converged',
  /** 基线过期 */
  BASELINE_EXPIRED: 'oc.baseline.expired',
} as const;

// ============================================================================
// 数据采集/存储相关 Topic
// ============================================================================

export const DATA_TOPICS = {
  /** 数据采集完成 */
  COLLECTED: 'data.collected',
  /** 数据存储完成 */
  STORED: 'data.stored',
  /** 数据质量检查完成 */
  QUALITY_CHECKED: 'data.quality.checked',
  /** 数据切片创建 */
  SLICE_CREATED: 'data.slice.created',
} as const;

// ============================================================================
// 标注相关 Topic
// ============================================================================

export const LABEL_TOPICS = {
  /** 标注任务创建 */
  TASK_CREATED: 'label.task.created',
  /** 切片标注完成 */
  SLICE_LABELED: 'label.slice.labeled',
  /** 标注质量审核完成 */
  QUALITY_REVIEWED: 'label.quality.reviewed',
  /** 标注冲突检测 */
  CONFLICT_DETECTED: 'label.conflict.detected',
} as const;

// ============================================================================
// 训练相关 Topic
// ============================================================================

export const TRAIN_TOPICS = {
  /** 训练触发条件满足 */
  TRIGGER_SATISFIED: 'train.trigger.satisfied',
  /** 训练任务开始 */
  JOB_STARTED: 'train.job.started',
  /** 训练任务完成 */
  JOB_COMPLETED: 'train.job.completed',
  /** 训练任务失败 */
  JOB_FAILED: 'train.job.failed',
  /** 超参调优完成 */
  TUNING_COMPLETED: 'train.tuning.completed',
} as const;

// ============================================================================
// 评估相关 Topic
// ============================================================================

export const EVAL_TOPICS = {
  /** 影子评估开始 */
  SHADOW_STARTED: 'eval.shadow.started',
  /** 影子评估完成 */
  SHADOW_COMPLETED: 'eval.shadow.completed',
  /** TAS 计算完成 */
  TAS_COMPUTED: 'eval.tas.computed',
  /** Champion 挑战开始 */
  CHAMPION_CHALLENGE_STARTED: 'eval.champion.challenge_started',
  /** Champion 挑战完成 */
  CHAMPION_CHALLENGE_COMPLETED: 'eval.champion.challenge_completed',
  /** 漂移检测 */
  DRIFT_DETECTED: 'eval.drift.detected',
} as const;

// ============================================================================
// 发布相关 Topic
// ============================================================================

export const RELEASE_TOPICS = {
  /** 金丝雀发布开始 */
  CANARY_STARTED: 'release.canary.started',
  /** 金丝雀发布完成 */
  CANARY_COMPLETED: 'release.canary.completed',
  /** 金丝雀发布回滚 */
  CANARY_ROLLBACK: 'release.canary.rollback',
  /** 全量发布 */
  FULL_PROMOTED: 'release.full.promoted',
} as const;

// ============================================================================
// 认知闭环核心 Topic
// ============================================================================

export const COGNITION_TOPICS = {
  /** 认知单元激活 */
  UNIT_ACTIVATED: 'cognition.unit.activated',
  /** 认知单元完成 */
  UNIT_COMPLETED: 'cognition.unit.completed',
  /** 认知单元失败 */
  UNIT_FAILED: 'cognition.unit.failed',
  /** 认知单元超时 */
  UNIT_TIMEOUT: 'cognition.unit.timeout',

  /** 感知维完成 */
  PERCEPTION_DONE: 'cognition.perception.done',
  /** 推演维完成 */
  REASONING_DONE: 'cognition.reasoning.done',
  /** 融合维完成 */
  FUSION_DONE: 'cognition.fusion.done',
  /** 决策维完成 */
  DECISION_DONE: 'cognition.decision.done',

  /** 交叉验证完成 */
  CROSS_VALIDATION_DONE: 'cognition.cross_validation.done',
  /** 收敛完成 */
  CONVERGENCE_DONE: 'cognition.convergence.done',

  /** 叙事生成完成 */
  NARRATIVE_GENERATED: 'cognition.narrative.generated',

  /** 知识结晶产生 */
  KNOWLEDGE_CRYSTALLIZED: 'cognition.knowledge.crystallized',

  /** 降级模式切换 */
  DEGRADATION_MODE_CHANGED: 'cognition.degradation.mode_changed',

  /** 链式认知触发 */
  CHAIN_TRIGGERED: 'cognition.chain.triggered',
} as const;

// ============================================================================
// 汇总所有认知 Topic
// ============================================================================

/** 所有认知闭环 Topic 的扁平列表 */
export const ALL_COGNITION_TOPICS = {
  ...OC_TOPICS,
  ...DATA_TOPICS,
  ...LABEL_TOPICS,
  ...TRAIN_TOPICS,
  ...EVAL_TOPICS,
  ...RELEASE_TOPICS,
  ...COGNITION_TOPICS,
} as const;

/** Topic 值类型 */
export type CognitionTopicValue = typeof ALL_COGNITION_TOPICS[keyof typeof ALL_COGNITION_TOPICS];

/**
 * 验证一个 topic 是否为已注册的认知 Topic
 */
export function isRegisteredCognitionTopic(topic: string): boolean {
  const allValues = Object.values(ALL_COGNITION_TOPICS) as string[];
  return allValues.includes(topic);
}

/**
 * 获取 Topic 所属的命名空间
 */
export function getTopicNamespace(topic: string): string | null {
  const dot = topic.indexOf('.');
  return dot > 0 ? topic.substring(0, dot) : null;
}

/**
 * 获取所有 Topic 的分组视图（用于 API 和 UI 展示）
 */
export function getTopicGroups(): Record<string, Record<string, string>> {
  return {
    oc: { ...OC_TOPICS },
    data: { ...DATA_TOPICS },
    label: { ...LABEL_TOPICS },
    train: { ...TRAIN_TOPICS },
    eval: { ...EVAL_TOPICS },
    release: { ...RELEASE_TOPICS },
    cognition: { ...COGNITION_TOPICS },
  };
}
