/**
 * ============================================================================
 * Phase 2 — 认知层推理引擎增强 · 公共类型定义
 * ============================================================================
 *
 * 所有 Phase 2 模块共享的类型定义，遵循以下设计原则：
 *   1. 纯数据结构，无行为逻辑
 *   2. 每个模块的配置类型支持 Partial<Config> 合并
 *   3. 所有结果类型包含 skippedReason 分级降级字段
 *   4. 时间戳统一使用 Date 类型
 *   5. 与 cognition/types 中的现有类型保持兼容
 */

// ============================================================================
// 通用基础类型
// ============================================================================

/** 降级跳过原因 — 所有模块统一使用 */
export type SkippedReason =
  | 'timeout'              // 超时降级
  | 'low_confidence'       // 置信度过低
  | 'boundary_violation'   // 物理边界违反
  | 'no_data'              // 无可用数据
  | 'disabled'             // 模块被禁用
  | 'cost_gate_blocked'    // CostGate 拦截
  | 'circuit_breaker'      // 熔断器触发
  | 'concurrent_limit';    // 并发上限

/** 模块执行摘要 — 所有模块的标准输出包装 */
export interface ModuleExecutionSummary<T = unknown> {
  /** 模块名称 */
  module: string;
  /** 是否成功 */
  success: boolean;
  /** 执行结果（成功时） */
  result?: T;
  /** 错误信息（失败时） */
  error?: string;
  /** 跳过原因（降级时） */
  skippedReason?: SkippedReason;
  /** 执行耗时 (ms) */
  durationMs: number;
  /** 时间戳 */
  timestamp: Date;
}

/** 并发控制配置 — 所有支持并发的模块统一使用 */
export interface ConcurrencyConfig {
  /** 最大并发数（自适应范围 4~12） */
  maxConcurrency: number;
  /** 单任务超时 (ms) */
  taskTimeoutMs: number;
  /** 全局超时 (ms) */
  globalTimeoutMs: number;
}

// ============================================================================
// PhysicsVerifier 类型
// ============================================================================

/** 物理验证器配置 */
export interface PhysicsVerifierConfig {
  /** 映射置信度过滤阈值 [0, 1]，低于此值的映射被丢弃 */
  mappingConfidenceThreshold: number;
  /** 三源映射权重 */
  sourceWeights: {
    rule: number;       // 规则映射权重（默认 0.30）
    embedding: number;  // Embedding 映射权重（默认 0.40）
    grok: number;       // Grok 映射权重（默认 0.30）
  };
  /** 方程残差代理阈值 — 残差 > 此值视为物理不可行 */
  residualThreshold: number;
  /** Monte-Carlo 采样次数 */
  monteCarloSamples: number;
  /** 并发控制 */
  concurrency: ConcurrencyConfig;
  /** 是否启用 Grok 映射（CostGate 可关闭） */
  enableGrokMapping: boolean;
}

/** 物理方程定义 — 港口机械领域 */
export interface PhysicsEquation {
  /** 方程 ID */
  id: string;
  /** 方程名称 */
  name: string;
  /** 适用的异常域 */
  anomalyDomain: AnomalyDomain;
  /** 方程描述 */
  description: string;
  /** 输入变量名列表 */
  inputVariables: string[];
  /** 守恒约束描述 */
  conservationConstraint: string;
  /** 参数边界 */
  parameterBounds: Record<string, { min: number; max: number; unit: string }>;
  /** 方程计算函数 — 返回残差值（0 = 完美满足） */
  computeResidual: (inputs: Record<string, number>) => number;
}

/** 异常域枚举 — 港口机械 5 大异常域 */
export type AnomalyDomain =
  | 'bearing_fault'       // 轴承故障
  | 'gear_damage'         // 齿轮损伤
  | 'motor_degradation'   // 电机退化
  | 'structural_fatigue'  // 结构疲劳
  | 'hydraulic_leak'      // 液压泄漏
  | 'wire_rope_break'     // 钢丝绳断股
  | 'pump_cavitation'     // 泵气蚀
  | 'insulation_aging';   // 绝缘老化

/** 物理验证结果 — 单个假设 */
export interface PhysicsVerificationResult {
  /** 假设 ID */
  hypothesisId: string;
  /** 是否物理可行 */
  physicallyFeasible: boolean;
  /** 综合物理置信度 [0, 1] */
  physicsConfidence: number;
  /** 三源映射结果 */
  mappingResults: {
    rule: { confidence: number; equations: string[] };
    embedding: { confidence: number; similarity: number };
    grok?: { confidence: number; explanation: string };
  };
  /** 方程残差验证 */
  residualCheck: {
    equationId: string;
    residual: number;
    threshold: number;
    passed: boolean;
  }[];
  /** 参数边界检查 */
  boundaryCheck: {
    variable: string;
    value: number;
    min: number;
    max: number;
    inBounds: boolean;
  }[];
  /** Monte-Carlo 不确定性 */
  uncertainty: {
    mean: number;
    std: number;
    ci95: [number, number];
  };
  /** 跳过原因（如果被跳过） */
  skippedReason?: SkippedReason;
  /** 物理解释 */
  explanation: string;
}

// ============================================================================
// CausalGraph 类型
// ============================================================================

/** 因果图配置 */
export interface CausalGraphConfig {
  /** 最大节点数（膨胀控制） */
  maxNodes: number;
  /** 边权衰减率（每天） */
  edgeDecayRatePerDay: number;
  /** 最小边权重（低于此值自动剪枝） */
  minEdgeWeight: number;
  /** Grok 5-Why 补全的最大深度 */
  maxWhyDepth: number;
  /** 是否启用 Grok 动态补全 */
  enableGrokCompletion: boolean;
  /** 并发控制 */
  concurrency: ConcurrencyConfig;
}

/** 因果节点 */
export interface CausalNode {
  /** 节点 ID */
  id: string;
  /** 节点标签 */
  label: string;
  /** 节点类型 */
  type: 'symptom' | 'mechanism' | 'root_cause' | 'condition';
  /** 所属异常域 */
  domain: AnomalyDomain;
  /** 先验概率 [0, 1] */
  priorProbability: number;
  /** 关联的物理方程 ID */
  equationIds: string[];
  /** 关联的测点 */
  sensorTags: string[];
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/** 因果边 */
export interface CausalEdge {
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
  /** 边权重 [0, 1]（贝叶斯自更新） */
  weight: number;
  /** 因果机制描述 */
  mechanism: string;
  /** 证据计数 */
  evidenceCount: number;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
  /** 数据来源 */
  source_type: 'seed' | 'grok_discovered' | 'experience_learned';
}

/** 因果干预结果 */
export interface InterventionResult {
  /** 干预的节点 ID */
  interventionNodeId: string;
  /** 干预值 */
  interventionValue: number;
  /** 受影响节点及其效果 */
  effects: Array<{
    nodeId: string;
    originalProbability: number;
    interventionProbability: number;
    delta: number;
  }>;
  /** 可识别性检验 */
  identifiability: {
    passed: boolean;
    method: 'back_door' | 'front_door' | 'instrumental';
    confounders: string[];
    warning?: string;
  };
}

/** 因果路径追溯 */
export interface CausalTrace {
  /** 起始节点（症状） */
  symptomId: string;
  /** 终止节点（根因） */
  rootCauseId: string;
  /** 路径上的节点 ID 序列 */
  path: string[];
  /** 路径综合权重（各边权重之积） */
  pathWeight: number;
  /** 路径上各边的机制描述 */
  mechanisms: string[];
}

// ============================================================================
// ExperiencePool 类型
// ============================================================================

/** 经验池配置 */
export interface ExperiencePoolConfig {
  /** 三层内存容量 */
  capacity: {
    episodic: number;    // 情景记忆（原始会话，默认 1000）
    semantic: number;    // 语义记忆（抽象规则，默认 500）
    procedural: number;  // 程序记忆（操作序列，默认 200）
  };
  /** 三维衰减参数 */
  decay: {
    /** 时间衰减半衰期（天） */
    timeHalfLifeDays: number;
    /** 设备相似度权重 [0, 1] */
    deviceSimilarityWeight: number;
    /** 工况相似度权重 [0, 1] */
    conditionSimilarityWeight: number;
  };
  /** 自适应降维阈值 */
  adaptiveDimensionThresholds: {
    /** <50 条经验时使用单维衰减 */
    singleDimension: number;
    /** 50-200 条经验时使用二维衰减 */
    twoDimension: number;
    // >200 使用三维衰减
  };
  /** 向量检索 top-K */
  retrievalTopK: number;
  /** 最小相似度阈值 */
  minSimilarity: number;
}

/** 经验记录 — 情景记忆 */
export interface EpisodicExperience {
  /** 经验 ID */
  id: string;
  /** 关联的认知会话 ID */
  sessionId: string;
  /** 异常域 */
  domain: AnomalyDomain;
  /** 设备类型 */
  deviceType: string;
  /** 设备编码 */
  deviceCode: string;
  /** 工况 ID */
  ocProfileId?: string;
  /** 异常描述 */
  anomalyDescription: string;
  /** 诊断假设 */
  hypothesis: string;
  /** 最终根因 */
  rootCause: string;
  /** 解决方案 */
  resolution: string;
  /** 是否正确（人工反馈） */
  wasCorrect: boolean | null;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 特征向量（用于向量检索） */
  featureVector: number[];
  /** 上下文快照 */
  context: Record<string, unknown>;
  /** 创建时间 */
  createdAt: Date;
  /** 最后访问时间 */
  lastAccessedAt: Date;
}

/** 经验记录 — 语义记忆（从情景中抽象） */
export interface SemanticExperience {
  /** 规则 ID */
  id: string;
  /** 规则描述 */
  rule: string;
  /** 适用条件 */
  applicableConditions: string[];
  /** 来源情景 ID 列表 */
  sourceEpisodicIds: string[];
  /** 验证次数 */
  verificationCount: number;
  /** 成功率 */
  successRate: number;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 创建时间 */
  createdAt: Date;
}

/** 经验记录 — 程序记忆（操作序列） */
export interface ProceduralExperience {
  /** 程序 ID */
  id: string;
  /** 操作序列名称 */
  name: string;
  /** 操作步骤 */
  steps: Array<{
    order: number;
    action: string;
    expectedOutcome: string;
    toolId?: string;
  }>;
  /** 适用的异常域 */
  domain: AnomalyDomain;
  /** 成功执行次数 */
  executionCount: number;
  /** 平均耗时 (ms) */
  avgDurationMs: number;
  /** 创建时间 */
  createdAt: Date;
}

/** 经验检索结果 */
export interface ExperienceRetrievalResult {
  /** 情景记忆匹配 */
  episodic: Array<EpisodicExperience & { similarity: number; decayedScore: number }>;
  /** 语义记忆匹配 */
  semantic: Array<SemanticExperience & { relevance: number }>;
  /** 程序记忆匹配 */
  procedural: Array<ProceduralExperience & { applicability: number }>;
  /** 综合经验命中率 */
  hitRate: number;
  /** 检索耗时 (ms) */
  durationMs: number;
}

// ============================================================================
// Orchestrator 类型
// ============================================================================

/** 推理路由通道 */
export type ReasoningRoute =
  | 'fast_path'       // 快速路径：经验命中 ≥0.85 → 直接返回
  | 'standard_path'   // 标准路径：因果图 + 物理验证
  | 'deep_path'       // 深度路径：+ Grok 深度推理
  | 'fallback_path';  // 降级路径：原模板规则

/** Orchestrator 配置 */
export interface OrchestratorConfig {
  /** 路由阈值 */
  routing: {
    /** 快速路径：经验命中置信度阈值 */
    fastPathConfidence: number;
    /** 深度路径：标准路径置信度低于此值时触发 */
    deepPathTrigger: number;
    /** 降级路径：总超时 (ms) */
    fallbackTimeoutMs: number;
  };
  /** CostGate 配置 */
  costGate: {
    /** 每日 Grok 调用预算 */
    dailyGrokBudget: number;
    /** 当前已用次数（运行时维护） */
    dailyGrokUsed: number;
    /** 经验命中率抑制因子 [0, 1] */
    experienceHitSuppression: number;
    /** 短路率抑制因子 [0, 1] */
    shortCircuitSuppression: number;
  };
  /** 置信度短路阈值 — 超过此值直接返回 */
  shortCircuitConfidence: number;
  /** 并行扇出配置 */
  parallelFanout: ConcurrencyConfig;
  /** 延迟预算 (ms) — P95 目标 */
  latencyBudgetMs: number;
}

/** 编排阶段 */
export type OrchestratorPhase =
  | 'signal_classification'   // S1: 信号分类
  | 'vector_retrieval'        // S2: 向量检索
  | 'causal_tracing'          // S3: 因果溯源
  | 'physics_verification'    // S4: 物理验证
  | 'experience_weighting'    // S5: 经验加权
  | 'deep_reasoning';         // S6: 深度推理（Grok）

/** 编排结果 */
export interface OrchestratorResult {
  /** 选择的路由 */
  route: ReasoningRoute;
  /** 各阶段执行摘要 */
  phases: Record<OrchestratorPhase, ModuleExecutionSummary>;
  /** 最终假设列表（排序后） */
  hypotheses: Array<{
    id: string;
    description: string;
    confidence: number;
    physicsVerified: boolean;
    experienceSupported: boolean;
    causalPathCount: number;
    sources: string[];
  }>;
  /** 决策 */
  decision: string;
  /** 决策置信度 */
  confidence: number;
  /** 不确定性分解 */
  uncertaintyDecomposition: {
    total: number;
    sources: Record<string, number>;
  };
  /** 解释图（JSON-LD） */
  explanationGraph: Record<string, unknown>;
  /** 总耗时 (ms) */
  totalDurationMs: number;
  /** 是否使用了 Grok */
  grokUsed: boolean;
  /** Grok 调用次数 */
  grokCallCount: number;
}

// ============================================================================
// KnowledgeFeedbackLoop 类型
// ============================================================================

/** 反馈事件类型 */
export type FeedbackEventType =
  | 'hypothesis_confirmed'    // 假设被确认
  | 'hypothesis_rejected'     // 假设被否定
  | 'new_causal_link'         // 新因果关系发现
  | 'experience_recorded'     // 新经验记录
  | 'physics_rule_updated';   // 物理规则更新

/** 反馈事件 */
export interface FeedbackEvent {
  /** 事件类型 */
  type: FeedbackEventType;
  /** 关联的认知会话 ID */
  sessionId: string;
  /** 事件数据 */
  data: Record<string, unknown>;
  /** 奖励值 [-1, 1]（RL 信号） */
  reward: number;
  /** 时间戳 */
  timestamp: Date;
}

/** 反馈循环配置 */
export interface FeedbackLoopConfig {
  /** 最小样本数保护 — 低于此数不更新权重 */
  minSamplesForUpdate: number;
  /** 学习率（自适应） */
  learningRate: {
    initial: number;
    min: number;
    max: number;
    /** 学习率衰减因子 */
    decayFactor: number;
  };
  /** revision_log 保留天数 */
  revisionLogRetentionDays: number;
  /** 是否启用自动反馈 */
  enableAutoFeedback: boolean;
}

/** 修订日志条目 — 用于回滚 */
export interface RevisionLogEntry {
  /** 日志 ID */
  id: string;
  /** 修改的组件 */
  component: 'causal_edge' | 'experience_weight' | 'physics_param' | 'bpa_config';
  /** 修改的实体 ID */
  entityId: string;
  /** 修改前的值 */
  previousValue: Record<string, unknown>;
  /** 修改后的值 */
  newValue: Record<string, unknown>;
  /** 触发的反馈事件 */
  feedbackEventType: FeedbackEventType;
  /** 关联的认知会话 ID */
  sessionId: string;
  /** 时间戳 */
  timestamp: Date;
  /** 是否已回滚 */
  rolledBack: boolean;
}

// ============================================================================
// Observability 类型
// ============================================================================

/** 可观测性指标 — 12 项核心指标 */
export interface ReasoningMetrics {
  /** M1: 假设命中率 */
  hypothesisHitRate: number;
  /** M2: 物理验证通过率 */
  physicsVerificationRate: number;
  /** M3: 因果路径覆盖率 */
  causalCoverageRate: number;
  /** M4: 经验命中率 */
  experienceHitRate: number;
  /** M5: Grok 调用率 */
  grokCallRate: number;
  /** M6: 平均推理延迟 (ms) */
  avgLatencyMs: number;
  /** M7: P95 推理延迟 (ms) */
  p95LatencyMs: number;
  /** M8: 降级触发率 */
  fallbackRate: number;
  /** M9: 知识反馈闭环率 */
  feedbackLoopRate: number;
  /** M10: CostGate 拦截率 */
  costGateBlockRate: number;
  /** M11: 端到端不确定性均值 */
  avgUncertainty: number;
  /** M12: 短路率（快速路径命中率） */
  shortCircuitRate: number;
}

/** 决策日志条目 */
export interface DecisionLogEntry {
  /** 认知会话 ID */
  sessionId: string;
  /** 选择的路由 */
  route: ReasoningRoute;
  /** 各阶段耗时 */
  phaseDurations: Record<OrchestratorPhase, number>;
  /** 关键决策点 */
  decisions: Array<{
    point: string;
    choice: string;
    reason: string;
    confidence: number;
  }>;
  /** 最终结果 */
  outcome: {
    hypothesis: string;
    confidence: number;
    physicsVerified: boolean;
  };
  /** 时间戳 */
  timestamp: Date;
}

// ============================================================================
// VectorStore 类型
// ============================================================================

/** 向量存储配置 */
export interface VectorStoreConfig {
  /** 向量维度 */
  dimensions: number;
  /** 相似度度量 */
  metric: 'cosine' | 'euclidean' | 'dot_product';
  /** 索引类型 */
  indexType: 'flat' | 'ivf' | 'hnsw';
}

/** 向量检索查询 */
export interface VectorQuery {
  /** 查询向量 */
  vector: number[];
  /** 返回 top-K */
  topK: number;
  /** 最小相似度阈值 */
  minSimilarity?: number;
  /** 过滤条件 */
  filter?: Record<string, unknown>;
}

/** 向量检索结果 */
export interface VectorSearchResult {
  /** 文档 ID */
  id: string;
  /** 相似度分数 */
  similarity: number;
  /** 文档元数据 */
  metadata: Record<string, unknown>;
  /** 原始向量（可选） */
  vector?: number[];
}

// ============================================================================
// Champion-Challenger Shadow Mode 类型
// ============================================================================

/** Shadow 模式统计 */
export interface ShadowModeStats {
  /** 总会话数 */
  totalSessions: number;
  /** Challenger（新引擎）命中数 */
  challengerHits: number;
  /** Champion（旧引擎）命中数 */
  championHits: number;
  /** Challenger 命中率 */
  challengerHitRate: number;
  /** Champion 命中率 */
  championHitRate: number;
  /** 命中率差值 (pp) */
  hitRateDelta: number;
  /** p 值（McNemar 检验） */
  pValue: number;
  /** 平均延迟比（Challenger / Champion） */
  avgLatencyRatio: number;
  /** 降级次数 */
  fallbackCount: number;
  /** 是否满足晋升条件 */
  promotionReady: boolean;
}

/** Shadow 晋升条件 */
export interface PromotionCriteria {
  /** 最少会话数 */
  minSessions: number;
  /** 最小命中率提升 (pp) */
  minHitRateDelta: number;
  /** 最大 p 值 */
  maxPValue: number;
  /** 最大延迟比 */
  maxLatencyRatio: number;
  /** 最大降级次数 */
  maxFallbackCount: number;
}
