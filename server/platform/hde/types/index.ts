/**
 * ============================================================================
 * HDE 统一类型定义
 * ============================================================================
 *
 * 双轨演化诊断系统的核心类型定义
 */

// ============================================================================
// 诊断请求/响应
// ============================================================================

/**
 * HDE 诊断请求
 */
export interface HDEDiagnosisRequest {
  /** 设备 ID */
  machineId: string;
  /** 诊断时间戳 */
  timestamp: number;
  /** 传感器数据 */
  sensorData: Record<string, number[]>;
  /** 诊断上下文 */
  context?: DiagnosisContext;
  /** 诊断配置覆盖 */
  config?: Partial<HDEDiagnosisConfig>;
}

/**
 * 诊断上下文
 */
export interface DiagnosisContext {
  /** 工况阶段 */
  cyclePhase?: string;
  /** 载荷重量 (吨) */
  loadWeight?: number;
  /** 环境条件 */
  environment?: {
    windSpeed?: number;
    temperature?: number;
    humidity?: number;
  };
  /** 历史故障 */
  recentFaults?: string[];
  /** 自定义上下文 */
  custom?: Record<string, unknown>;
}

/**
 * HDE 诊断配置
 */
export interface HDEDiagnosisConfig {
  /** 启用物理优先轨 */
  enablePhysicsTrack: boolean;
  /** 启用数据驱动轨 */
  enableDataTrack: boolean;
  /** 物理轨权重 */
  physicsWeight: number;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 超时时间 (ms) */
  timeoutMs: number;
}

/**
 * HDE 诊断结果
 */
export interface HDEDiagnosisResult {
  /** 会话 ID */
  sessionId: string;
  /** 设备 ID */
  machineId: string;
  /** 诊断时间戳 */
  timestamp: number;
  /** 诊断结论 */
  diagnosis: DiagnosisConclusion;
  /** 双轨结果 */
  trackResults: {
    physics: TrackResult | null;
    data: TrackResult | null;
  };
  /** 融合结果 */
  fusionResult: {
    fusedMass: Record<string, number>;
    conflict: number;
    strategyUsed: string;
  };
  /** 物理约束验证 */
  physicsValidation: ValidationResult;
  /** 建议动作 */
  recommendations: Recommendation[];
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 执行耗时 (ms) */
  durationMs: number;
}

/**
 * 诊断结论
 */
export interface DiagnosisConclusion {
  /** 故障类型 */
  faultType: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 紧急程度 */
  urgency: 'monitoring' | 'scheduled' | 'priority' | 'immediate';
  /** 物理解释 */
  physicsExplanation?: string;
  /** 证据链 */
  evidenceChain?: EvidenceItem[];
}

/**
 * 证据项
 */
export interface EvidenceItem {
  /** 证据来源 */
  source: string;
  /** 证据类型 */
  type: 'sensor' | 'model' | 'rule' | 'history';
  /** 证据描述 */
  description: string;
  /** 支持强度 (0-1) */
  strength: number;
}

// ============================================================================
// 双轨诊断
// ============================================================================

/**
 * 诊断轨道类型
 */
export type DiagnosticTrack = 'physics' | 'data';

/**
 * 轨道诊断结果
 */
export interface TrackResult {
  /** 轨道类型 */
  trackType: DiagnosticTrack;
  /** 故障假设列表 */
  faultHypotheses: FaultHypothesis[];
  /** DS 信念质量 */
  beliefMass: Record<string, number>;
  /** 轨道置信度 */
  confidence: number;
  /** 物理约束 */
  physicsConstraints: PhysicsConstraint[];
  /** 执行耗时 (ms) */
  executionTimeMs: number;
}

/**
 * 故障假设
 */
export interface FaultHypothesis {
  /** 假设 ID */
  id: string;
  /** 故障类型 */
  faultType: string;
  /** 先验概率 */
  priorProbability: number;
  /** 后验概率 */
  posteriorProbability?: number;
  /** 支持证据 */
  supportingEvidence: string[];
  /** 反对证据 */
  contradictingEvidence: string[];
  /** 物理机制 */
  physicsMechanism?: string;
}

/**
 * 物理约束
 */
export interface PhysicsConstraint {
  /** 约束 ID */
  id: string;
  /** 约束名称 */
  name: string;
  /** 约束类型 */
  type: 'energy' | 'force' | 'material' | 'temporal' | 'logical';
  /** 约束表达式 */
  expression: string;
  /** 是否满足 */
  satisfied?: boolean;
  /** 违反程度 (0-1，0=未违反) */
  violationDegree?: number;
  /** 物理解释 */
  explanation: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 违反的约束 */
  violations: PhysicsConstraint[];
  /** 调整后的置信度 */
  adjustedConfidence: number;
  /** 物理解释 */
  physicsExplanation: string;
}

/**
 * 建议动作
 */
export interface Recommendation {
  /** 优先级 */
  priority: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** 动作描述 */
  action: string;
  /** 理由 */
  rationale: string;
  /** 预计影响 */
  expectedImpact?: string;
  /** 物理依据 */
  physicsBasis?: string;
}

// ============================================================================
// DS 融合相关（与 cognition 层对齐）
// ============================================================================

/**
 * DS 冲突处理策略
 */
export type DSConflictStrategy = 'dempster' | 'murphy' | 'yager';

/**
 * DS 证据源配置
 */
export interface DSEvidenceSourceConfig {
  /** 证据源 ID */
  id: string;
  /** 证据源名称 */
  name: string;
  /** 证据源类型 */
  type: 'sensor' | 'model' | 'rule' | 'expert';
  /** 初始可靠性 */
  initialReliability: number;
  /** 当前可靠性 */
  currentReliability: number;
  /** 可靠性衰减因子 */
  decayFactor: number;
  /** 可靠性恢复因子 */
  recoveryFactor: number;
  /** 最低可靠性 */
  minReliability: number;
  /** 是否启用 */
  enabled: boolean;
  /** 正确预测次数 */
  correctCount: number;
  /** 错误预测次数 */
  errorCount: number;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
}

/**
 * DS 融合引擎配置
 */
export interface DSFusionEngineConfig {
  /** 辨识框架 */
  frameOfDiscernment: string[];
  /** 默认策略 */
  defaultStrategy: DSConflictStrategy;
  /** 高冲突阈值 */
  highConflictThreshold: number;
  /** 极端冲突阈值 */
  extremeConflictThreshold: number;
  /** 冲突惩罚因子 */
  conflictPenaltyFactor: number;
  /** 证据源列表 */
  sources: DSEvidenceSourceConfig[];
}

/**
 * DS 证据输入
 */
export interface DSEvidenceInput {
  /** 证据源 ID */
  sourceId: string;
  /** 信念质量 */
  beliefMass: Record<string, number>;
  /** 时间戳 */
  timestamp?: number;
}

/**
 * DS 融合输出
 */
export interface DSFusionOutput {
  /** 融合后的信念质量 */
  fusedMass: Record<string, number>;
  /** 总冲突度 */
  totalConflict: number;
  /** 使用的策略 */
  strategyUsed: DSConflictStrategy;
  /** 决策（最高信念的假设） */
  decision: string;
  /** 决策置信度 */
  confidence: number;
  /** 各证据源贡献 */
  sourceContributions: Record<string, number>;
  /** 融合日志 */
  fusionLog: DSFusionLogEntry[];
}

/**
 * DS 融合日志条目
 */
export interface DSFusionLogEntry {
  /** 步骤 */
  step: number;
  /** 证据源 ID */
  sourceId: string;
  /** 输入信念质量 */
  inputMass: Record<string, number>;
  /** 输出信念质量 */
  outputMass: Record<string, number>;
  /** 步骤冲突度 */
  stepConflict: number;
  /** 累积冲突度 */
  cumulativeConflict: number;
  /** 使用的策略 */
  strategyUsed: DSConflictStrategy;
}

// ============================================================================
// 知识结晶相关（与 cognition 层对齐）
// ============================================================================

/**
 * 知识结晶类型
 */
export type KnowledgeCrystalType =
  | 'anomaly_pattern'
  | 'causal_relation'
  | 'hypothesis_result'
  | 'source_reliability'
  | 'oc_transition_rule';

/**
 * 知识结晶
 */
export interface KnowledgeCrystal {
  /** 结晶 ID */
  id: string;
  /** 结晶类型 */
  type: KnowledgeCrystalType;
  /** 来源认知结果 ID */
  cognitionResultId: string;
  /** 结晶内容 */
  content: Record<string, unknown>;
  /** 置信度 */
  confidence: number;
  /** 验证次数 */
  verificationCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后验证时间 */
  lastVerifiedAt: Date;
}

// ============================================================================
// 认知结果（与 cognition 层对齐）
// ============================================================================

/**
 * 认知结果
 */
export interface CognitionResult {
  /** 结果 ID */
  id: string;
  /** 状态 */
  state: 'pending' | 'running' | 'completed' | 'failed';
  /** 开始时间 */
  startedAt: Date;
  /** 完成时间 */
  completedAt: Date;
  /** 各维度输出 */
  dimensions: {
    perception?: unknown;
    reasoning?: unknown;
    fusion?: unknown;
    decision?: unknown;
  };
  /** 收敛信息 */
  convergence: {
    overallConfidence: number;
    iterationCount: number;
  };
  /** 降级模式 */
  degradationMode: string;
}
