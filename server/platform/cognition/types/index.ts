/**
 * ============================================================================
 * 自主认知闭环 — 核心类型定义
 * ============================================================================
 *
 * 本文件定义认知闭环系统的所有核心类型，包括：
 *   - 认知刺激（CognitionStimulus）
 *   - 认知结果（CognitionResult）
 *   - 四维输出（DimensionOutput）
 *   - 认知状态机（CognitionState）
 *   - DS 融合引擎类型
 *   - 工况配置类型
 *   - 工具化框架类型
 *
 * 设计原则：
 *   - 所有类型均为纯数据结构，无行为逻辑
 *   - 使用 discriminated union 确保类型安全
 *   - 与平台现有类型（DiagnosisResult, FusionResult 等）保持兼容
 */

// ============================================================================
// 基础枚举
// ============================================================================

/**
 * 认知刺激来源前缀（辅助类型）
 *
 * CognitionStimulus.source 为 string 类型，支持以下格式：
 *   - 简单前缀：'pipeline' | 'drift_detector' | 'anomaly_detector' | 'scheduler' | 'manual' | 'chain'
 *   - 复合格式：'pipeline:POST_COLLECT' | 'pipeline:PRE_TRAIN' 等
 */
export type StimulusSource =
  | 'pipeline'          // 流水线节点触发
  | 'drift_detector'    // 漂移检测触发
  | 'anomaly_detector'  // 异常检测触发
  | 'scheduler'         // 定时调度触发
  | 'manual'            // 人工触发
  | 'chain';            // 链式认知触发（上一次认知的输出触发下一次）

/** 认知优先级 */
export type CognitionPriority = 'critical' | 'high' | 'normal';

/** 认知状态 */
export type CognitionState =
  | 'idle'
  | 'stimulus_received'
  | 'preprocessing'
  | 'dimensions_running'
  | 'cross_validating'
  | 'converging'
  | 'action_executing'
  | 'narrative_generating'
  | 'completed'
  | 'failed'
  | 'timeout';

/** 认知状态转换事件 */
export type CognitionTransition =
  | 'STIMULUS_ARRIVED'
  | 'PREPROCESS_DONE'
  | 'DIMENSIONS_STARTED'
  | 'DIMENSIONS_DONE'
  | 'CROSS_VALIDATION_DONE'
  | 'CONVERGENCE_DONE'
  | 'ACTION_DONE'
  | 'NARRATIVE_DONE'
  | 'ERROR'
  | 'TIMEOUT'
  | 'RESET';

/** 四个认知维度 */
export type CognitionDimension = 'perception' | 'reasoning' | 'fusion' | 'decision';

/** 叙事阶段（对外展示用） */
export type NarrativePhase = 'curiosity' | 'hypothesis' | 'experiment' | 'verification';

/** 降级模式 */
export type DegradationMode = 'normal' | 'high_pressure' | 'emergency';

// ============================================================================
// DS 融合引擎类型
// ============================================================================

/** DS 冲突处理策略 */
export type DSConflictStrategy = 'dempster' | 'murphy' | 'yager';

/** DS 证据源配置 */
export interface DSEvidenceSourceConfig {
  /** 证据源唯一标识 */
  id: string;
  /** 证据源名称 */
  name: string;
  /** 证据源类型 */
  type: 'sensor' | 'algorithm' | 'expert' | 'model' | 'rule';
  /** 初始可靠性 [0, 1] */
  initialReliability: number;
  /** 当前可靠性 [0, 1]，运行时动态调整 */
  currentReliability: number;
  /** 可靠性衰减因子 [0, 1]，每次错误预测后乘以此因子 */
  decayFactor: number;
  /** 可靠性恢复因子 [0, 1]，每次正确预测后向初始值恢复 */
  recoveryFactor: number;
  /** 最小可靠性阈值，低于此值自动禁用 */
  minReliability: number;
  /** 是否启用 */
  enabled: boolean;
  /** 累计正确预测次数 */
  correctCount: number;
  /** 累计错误预测次数 */
  errorCount: number;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
}

/** DS 融合引擎配置 */
export interface DSFusionEngineConfig {
  /** 辨识框架（故障类型集合） */
  frameOfDiscernment: string[];
  /** 默认冲突处理策略 */
  defaultStrategy: DSConflictStrategy;
  /** 高冲突阈值 — 超过此值自动切换策略 */
  highConflictThreshold: number;
  /** 极高冲突阈值 — 超过此值降级为完全不确定 */
  extremeConflictThreshold: number;
  /** 冲突惩罚因子 [0, 1] */
  conflictPenaltyFactor: number;
  /** 证据源配置列表 */
  sources: DSEvidenceSourceConfig[];
}

/** DS 融合输入 — 单条证据 */
export interface DSEvidenceInput {
  /** 证据源 ID */
  sourceId: string;
  /** 信念质量函数 — key 为故障类型或 'theta'（不确定性），value 为质量值 */
  beliefMass: Record<string, number>;
  /** 时间戳 */
  timestamp: Date;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

/** DS 融合输出 */
export interface DSFusionOutput {
  /** 融合后的信念质量函数 */
  fusedMass: Record<string, number>;
  /** 总冲突度 [0, 1] */
  totalConflict: number;
  /** 使用的冲突处理策略 */
  strategyUsed: DSConflictStrategy;
  /** 最高信念的故障类型 */
  decision: string;
  /** 决策置信度（经冲突惩罚后） */
  confidence: number;
  /** 各证据源的贡献度 */
  sourceContributions: Record<string, number>;
  /** 融合过程日志 */
  fusionLog: DSFusionLogEntry[];
}

/** DS 融合过程日志条目 */
export interface DSFusionLogEntry {
  step: number;
  sourceId: string;
  inputMass: Record<string, number>;
  outputMass: Record<string, number>;
  stepConflict: number;
  cumulativeConflict: number;
  strategyUsed: DSConflictStrategy;
}

// ============================================================================
// 认知刺激与结果
// ============================================================================

/** 认知刺激类型 */
export type StimulusType =
  | 'data_quality'      // 数据质量异常
  | 'drift_alert'       // 漂移告警
  | 'model_evaluation'  // 模型评估
  | 'pipeline_event'    // 流水线事件
  | 'anomaly_signal'    // 异常信号
  | 'scheduled_check'   // 定时检查
  | 'manual_trigger';   // 人工触发

/** 认知刺激 — 触发一次认知活动的输入信号 */
export interface CognitionStimulus {
  /** 唯一标识 */
  id: string;
  /** 来源（格式：'pipeline' | 'pipeline:POST_COLLECT' | 'drift_detector' 等） */
  source: string;
  /** 刺激类型 */
  type: StimulusType;
  /** 优先级 */
  priority: CognitionPriority;
  /** 关联的工况 ID */
  ocProfileId?: string;
  /** 关联的设备 ID */
  deviceId?: string;
  /** 关联的流水线运行 ID */
  pipelineRunId?: string;
  /** 原始数据载荷 */
  payload: Record<string, unknown>;
  /** 触发时间 */
  triggeredAt: Date;
  /** 过期时间（超过此时间自动丢弃） */
  expiresAt?: Date;
  /** 去重键（相同键的刺激在窗口期内合并） */
  deduplicationKey?: string;
}

/** 维度输出 — 单个认知维度的处理结果 */
export interface DimensionOutput {
  dimension: CognitionDimension;
  /** 维度处理是否成功 */
  success: boolean;
  /** 处理耗时（毫秒） */
  durationMs: number;
  /** 维度输出数据 */
  data: Record<string, unknown>;
  /** 错误信息（失败时） */
  error?: string;
}

/** 感知维输出 */
export interface PerceptionOutput extends DimensionOutput {
  dimension: 'perception';
  data: {
    /** 检测到的异常信号 */
    anomalies: Array<{
      type: string;
      severity: number;
      source: string;
      description: string;
    }>;
    /** 高熵维度（信息量最大的特征） */
    highEntropyDimensions: Array<{
      name: string;
      entropy: number;
      currentValue: number;
      baselineValue: number;
      deviation: number;
    }>;
    /** 生成的问题链 */
    questionChain: string[];
    /** 暗数据流发现 */
    darkDataFlows: Array<{
      source: string;
      description: string;
      estimatedValue: number;
    }>;
  };
}

/** 推演维输出 */
export interface ReasoningOutput extends DimensionOutput {
  dimension: 'reasoning';
  data: {
    /** 生成的假设列表 */
    hypotheses: Array<{
      id: string;
      description: string;
      priorProbability: number;
      evidenceRequired: string[];
      estimatedImpact: number;
    }>;
    /** 影子评估结果（如果执行了） */
    shadowEvaluation?: {
      scenarioCount: number;
      bestCase: Record<string, number>;
      worstCase: Record<string, number>;
      expectedCase: Record<string, number>;
    };
    /** 因果推理路径 */
    causalPaths: Array<{
      from: string;
      to: string;
      strength: number;
      mechanism: string;
    }>;
  };
}

/** 融合维输出 */
export interface FusionOutput extends DimensionOutput {
  dimension: 'fusion';
  data: {
    /** DS 融合结果 */
    dsFusionResult: DSFusionOutput;
    /** 证据一致性评分 [0, 1] */
    consistencyScore: number;
    /** 冲突分析 */
    conflictAnalysis: {
      hasConflict: boolean;
      conflictDegree: number;
      conflictingSources: Array<{
        source1: string;
        source2: string;
        disagreement: string;
      }>;
    };
    /** 信息增益评估 */
    informationGain: number;
  };
}

/** 决策维输出 */
export interface DecisionOutput extends DimensionOutput {
  dimension: 'decision';
  data: {
    /** 推荐的动作列表（按优先级排序） */
    recommendedActions: Array<{
      id: string;
      type: 'retrain' | 'relabel' | 'recollect' | 'alert' | 'deploy' | 'rollback' | 'investigate';
      description: string;
      priority: number;
      estimatedCost: number;
      estimatedBenefit: number;
      constraints: string[];
    }>;
    /** 资源分配建议 */
    resourceAllocation: {
      computeBudget: number;
      timeBudget: number;
      dataBudget: number;
    };
    /** 熵排序结果 */
    entropyRanking: Array<{
      actionId: string;
      entropyReduction: number;
      rank: number;
    }>;
  };
}

/** 认知结果 — 一次完整认知活动的输出 */
export interface CognitionResult {
  /** 唯一标识 */
  id: string;
  /** 关联的刺激 ID */
  stimulusId: string;
  /** 最终状态 */
  state: CognitionState;
  /** 四维输出 */
  dimensions: {
    perception?: PerceptionOutput;
    reasoning?: ReasoningOutput;
    fusion?: FusionOutput;
    decision?: DecisionOutput;
  };
  /** 交叉验证结果 */
  crossValidation: {
    /** 维度间一致性评分 [0, 1] */
    consistencyScore: number;
    /** 不一致的维度对 */
    inconsistencies: Array<{
      dimension1: CognitionDimension;
      dimension2: CognitionDimension;
      description: string;
    }>;
  };
  /** 收敛决策 */
  convergence: {
    /** 是否收敛 */
    converged: boolean;
    /** 收敛迭代次数 */
    iterations: number;
    /** 最终综合置信度 */
    overallConfidence: number;
  };
  /** 叙事摘要 */
  narrative?: NarrativeSummary;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
  /** 开始时间 */
  startedAt: Date;
  /** 完成时间 */
  completedAt: Date;
  /** 降级模式 */
  degradationMode: DegradationMode;
}

/** 叙事摘要 */
export interface NarrativeSummary {
  /** 四阶段叙事 */
  phases: {
    curiosity: string;
    hypothesis: string;
    experiment: string;
    verification: string;
  };
  /** 人类可读的完整摘要 */
  humanReadableSummary: string;
  /** 关键发现 */
  keyFindings: string[];
  /** 建议行动 */
  suggestedActions: string[];
}

// ============================================================================
// 工况配置类型
// ============================================================================

/** 工况配置 */
export interface OCProfile {
  id: string;
  /** 工况名称 */
  name: string;
  /** 工况描述 */
  description: string;
  /** 关联的设备类型 */
  deviceType: string;
  /** 工况特征参数 */
  parameters: OCParameter[];
  /** 基线配置 */
  baseline: OCBaseline;
  /** 状态 */
  status: 'active' | 'inactive' | 'learning';
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/** 工况参数 */
export interface OCParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'numeric' | 'categorical' | 'boolean';
  /** 数值范围（numeric 类型） */
  range?: { min: number; max: number };
  /** 可选值（categorical 类型） */
  options?: string[];
  /** 权重 [0, 1] */
  weight: number;
  /** 归一化方法 */
  normalization: 'minmax' | 'zscore' | 'robust';
}

/** 工况基线 */
export interface OCBaseline {
  /** 基线学习状态 */
  learningStatus: 'not_started' | 'learning' | 'converged' | 'expired';
  /** 基线数据点数量 */
  sampleCount: number;
  /** 各参数的基线统计 */
  statistics: Record<string, {
    mean: number;
    std: number;
    min: number;
    max: number;
    percentile25: number;
    percentile75: number;
  }>;
  /** EWMA 平滑参数 */
  ewmaAlpha: number;
  /** 基线最后更新时间 */
  lastUpdatedAt: Date;
}

/** 工况切换事件 */
export interface OCTransitionEvent {
  /** 设备 ID */
  deviceId: string;
  /** 前一个工况 ID */
  fromProfileId: string | null;
  /** 当前工况 ID */
  toProfileId: string;
  /** 切换置信度 */
  confidence: number;
  /** 切换时间 */
  transitionAt: Date;
  /** 触发原因 */
  reason: string;
}

// ============================================================================
// 工具化框架类型
// ============================================================================

/** 工具定义 */
export interface ToolDefinition {
  /** 工具唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具类别 */
  category: 'collect' | 'store' | 'label' | 'train' | 'tune' | 'evaluate' | 'deploy' | 'monitor';
  /** 输入参数 schema（JSON Schema 格式） */
  inputSchema: Record<string, unknown>;
  /** 输出参数 schema（JSON Schema 格式） */
  outputSchema: Record<string, unknown>;
  /** 工具版本 */
  version: string;
  /** 是否启用 */
  enabled: boolean;
  /** 超时时间（毫秒） */
  timeoutMs: number;
  /** 重试次数 */
  retryCount: number;
}

/** 工具执行上下文 */
export interface ToolExecutionContext {
  /** 执行 ID */
  executionId: string;
  /** 工具 ID */
  toolId: string;
  /** 关联的工况 ID */
  ocProfileId?: string;
  /** 关联的设备 ID */
  deviceId?: string;
  /** 关联的流水线运行 ID */
  pipelineRunId?: string;
  /** 调用方 */
  caller: 'pipeline' | 'cognition' | 'manual' | 'scheduler';
  /** 输入参数 */
  input: Record<string, unknown>;
  /** 开始时间 */
  startedAt: Date;
}

/** 工具执行结果 */
export interface ToolExecutionResult {
  /** 执行 ID */
  executionId: string;
  /** 工具 ID */
  toolId: string;
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  output: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 完成时间 */
  completedAt: Date;
}

// ============================================================================
// 影子评估类型
// ============================================================================

/** 影子评估模式 */
export type ShadowEvalMode = 'pipeline' | 'canary' | 'ab_test';

/** 影子评估会话 */
export interface ShadowEvalSession {
  id: string;
  /** 评估模式 */
  mode: ShadowEvalMode;
  /** 候选模型 ID */
  challengerModelId: string;
  /** 当前冠军模型 ID */
  championModelId: string;
  /** 关联的工况 ID */
  ocProfileId?: string;
  /** 评估开始时间 */
  startedAt: Date;
  /** 评估结束时间 */
  endedAt?: Date;
  /** 评估状态 */
  status: 'running' | 'completed' | 'failed' | 'timeout';
  /** 评估配置 */
  config: ShadowEvalConfig;
  /** 评估结果 */
  result?: ShadowEvalResult;
}

/** 影子评估配置 */
export interface ShadowEvalConfig {
  /** 评估数据切片数量 */
  sliceCount: number;
  /** 超时时间（毫秒） */
  timeoutMs: number;
  /** McNemar 显著性水平 */
  mcNemarAlpha: number;
  /** Monte Carlo 扰动次数 */
  monteCarloRuns: number;
  /** Monte Carlo 扰动幅度 [0, 1] */
  perturbationMagnitude: number;
  /** TAS 权重配置 */
  tasWeights: {
    mcNemar: number;
    dsFusion: number;
    monteCarlo: number;
  };
}

/** 影子评估结果 */
export interface ShadowEvalResult {
  /** McNemar 检验结果 */
  mcNemar: {
    statistic: number;
    pValue: number;
    significant: boolean;
    challengerBetter: boolean;
  };
  /** DS 融合证据评分 */
  dsFusionScore: number;
  /** Monte Carlo 鲁棒性评分 */
  monteCarloScore: number;
  /** TAS 综合保证分数 [0, 1] */
  tasScore: number;
  /** 决策 */
  decision: 'PROMOTE' | 'CANARY_EXTENDED' | 'REJECT';
  /** 决策理由 */
  decisionReason: string;
  /** 详细指标 */
  metrics: {
    challengerAccuracy: number;
    championAccuracy: number;
    challengerLatencyP50: number;
    championLatencyP50: number;
    challengerLatencyP99: number;
    championLatencyP99: number;
  };
}

// ============================================================================
// 知识结晶类型
// ============================================================================

/** 知识结晶类型 */
export type KnowledgeCrystalType =
  | 'anomaly_pattern'     // 异常模式
  | 'causal_relation'     // 因果关系
  | 'hypothesis_result'   // 假设验证结果
  | 'source_reliability'  // 证据源可靠性
  | 'oc_transition_rule'; // 工况切换规则

/** 知识结晶 */
export interface KnowledgeCrystal {
  id: string;
  type: KnowledgeCrystalType;
  /** 来源认知活动 ID */
  cognitionResultId: string;
  /** 知识内容 */
  content: Record<string, unknown>;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 验证次数 */
  verificationCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后验证时间 */
  lastVerifiedAt: Date;
}

// ============================================================================
// 认知调度类型
// ============================================================================

/**
 * 调度器配置
 *
 * 设计面向 100 设备 / 2000 测点 / 20 边缘端的工业场景：
 *   - 正常运行 ~0.5 认知活动/秒（30/分钟）
 *   - 异常高峰 ~3/秒（180/分钟）
 *   - 极端场景 ~10/秒（600/分钟，20 边缘端同时上报）
 */
export interface SchedulerConfig {
  /** 基础最大并发认知活动数（降级模式下动态调整） */
  maxConcurrency: number;

  /** 各优先级的配额（每分钟） */
  quotas: Record<CognitionPriority, number>;

  /** 各优先级的队列容量上限 */
  maxQueueSize: Record<CognitionPriority, number>;

  /** 去重窗口（毫秒） */
  deduplicationWindowMs: number;

  /** 去重 Map 自动清理间隔（毫秒），默认 = deduplicationWindowMs × 2 */
  deduplicationCleanupIntervalMs?: number;

  /** 降级阈值 */
  degradationThresholds: {
    /** CPU 使用率阈值 → 进入高压模式（0-1） */
    highPressureCpu: number;
    /** 队列深度阈值 → 进入高压模式 */
    highPressureQueueDepth: number;
    /** 内存使用率阈值 → 进入高压模式（0-1） */
    highPressureMemory: number;
    /** CPU 使用率阈值 → 进入紧急模式（0-1） */
    emergencyCpu: number;
    /** 队列深度阈值 → 进入紧急模式 */
    emergencyQueueDepth: number;
    /** 内存使用率阈值 → 进入紧急模式（0-1） */
    emergencyMemory: number;
  };

  /** 降级检查间隔（毫秒），默认 10000 */
  degradationCheckIntervalMs: number;

  /** 并发槽位在不同降级模式下的倍率 */
  concurrencyMultipliers: {
    normal: number;        // 默认 1.0
    high_pressure: number; // 默认 1.5（临时扩容）
    emergency: number;     // 默认 0.5（缩容保核心）
  };

  /** 重试配置 */
  retry: {
    /** 最大重试次数 */
    maxRetries: number;
    /** 基础退避时间（毫秒） */
    baseBackoffMs: number;
    /** 最大退避时间（毫秒） */
    maxBackoffMs: number;
  };
}
