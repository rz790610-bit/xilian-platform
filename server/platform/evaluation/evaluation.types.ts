/**
 * ============================================================================
 * 平台功能评估体系 — 共享类型定义
 * ============================================================================
 *
 * 定义评估体系全局使用的类型：
 *   - 枚举/联合类型（设备类型、质量等级、延迟要求等）
 *   - 四维评分类型（技术/业务/进化/成本）
 *   - 模块评分卡
 *   - 业务 KPI
 *   - 组合优化类型
 *   - 仪表盘聚合类型
 *
 * 架构位置: server/platform/evaluation/
 * 依赖关系: 无外部依赖，纯类型文件
 */

// ============================================================================
// 基础枚举类型
// ============================================================================

/** 港机设备类型 */
export type PortDeviceType = 'STS' | 'RTG' | 'RMG' | 'MHC' | 'AGV' | 'OTHER';

/** 数据质量等级（对齐 ADR-005 评分标准） */
export type DataQualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** 延迟要求 */
export type LatencyRequirement = 'realtime' | 'near-realtime' | 'batch';

/** 评估触发方式 */
export type EvaluationTrigger = 'scheduled' | 'event_driven' | 'manual';

/** 评分趋势 */
export type ScoreTrend = 'improving' | 'stable' | 'regressing';

// ============================================================================
// 四维评分类型
// ============================================================================

/** 技术维度评分 */
export interface TechnicalScore {
  /** 综合技术分 (0-100) */
  overall: number;
  /** 算法准确率得分 */
  algorithmAccuracy: number;
  /** 数据质量得分 */
  dataQuality: number;
  /** 故障模式覆盖率得分 */
  faultModeCoverage: number;
  /** 详细指标 */
  details: {
    /** 算法完成率 (completed / total) */
    completionRate: number;
    /** 平均置信度 */
    avgConfidence: number;
    /** 数据质量原始分 */
    rawDataQuality: number;
    /** 已覆盖故障类型数 */
    coveredFaultTypes: number;
    /** 已知故障类型总数 */
    totalKnownFaultTypes: number;
  };
}

/** 业务维度评分 */
export interface BusinessScore {
  /** 综合业务分 (0-100) */
  overall: number;
  /** 预警提前时间得分 */
  earlyWarningScore: number;
  /** 误报率得分 */
  falseAlarmScore: number;
  /** 采纳率得分 */
  adoptionRateScore: number;
  /** 避免停机得分 */
  avoidedDowntimeScore: number;
  /** 原始 KPI 数据 */
  kpis: BusinessKPIs;
}

/** 进化维度评分 */
export interface EvolutionScore {
  /** 综合进化分 (0-100) */
  overall: number;
  /** 改进速度得分 */
  improvementVelocityScore: number;
  /** 结晶率得分 */
  crystallizationRateScore: number;
  /** 假设成功率得分 */
  hypothesisSuccessRateScore: number;
  /** 详细指标 */
  details: {
    /** 每周迭代次数 */
    iterationsPerWeek: number;
    /** 结晶知识数 */
    totalCrystals: number;
    /** 发现模式总数 */
    totalPatterns: number;
    /** 已测试假设数 */
    testedHypotheses: number;
    /** 成功假设数 */
    succeededHypotheses: number;
  };
}

/** 成本维度评分（反向指标：成本越低分越高） */
export interface CostScore {
  /** 综合成本分 (0-100) */
  overall: number;
  /** 计算成本得分 */
  computeCostScore: number;
  /** LLM 调用成本得分 */
  llmCostScore: number;
  /** 维护工时得分 */
  maintenanceEffortScore: number;
  /** 详细指标 */
  details: {
    /** 平均执行时间 (ms) */
    avgExecutionTimeMs: number;
    /** 估算 LLM 成本 (USD) */
    estimatedLlmCostUsd: number;
    /** 维护工时 (hours) */
    maintenanceHours: number;
  };
}

// ============================================================================
// 模块评分卡
// ============================================================================

/** 模块评分卡 — 单个模块的四维完整评估 */
export interface ModuleScorecard {
  /** 模块唯一标识（通常为算法 ID 或类别名） */
  moduleId: string;
  /** 模块名称（中文） */
  moduleName: string;
  /** 模块分类 */
  category: string;
  /** 评估时间戳 */
  timestamp: number;
  /** 触发方式 */
  trigger: EvaluationTrigger;
  /** 技术维度 */
  technical: TechnicalScore;
  /** 业务维度 */
  business: BusinessScore;
  /** 进化维度 */
  evolution: EvolutionScore;
  /** 成本维度 */
  cost: CostScore;
  /** 综合总分 (0-100) */
  overallScore: number;
  /** 趋势判断 */
  trend: ScoreTrend;
  /** 上次评分（首次评估为 null） */
  previousScore: number | null;
  /** 改进建议 */
  suggestions: string[];
}

// ============================================================================
// 业务 KPI 类型
// ============================================================================

/** 业务 KPI 指标 */
export interface BusinessKPIs {
  /** 预警提前时间中位数 (天) */
  earlyWarningLeadTimeDays: number;
  /** 避免停机次数 */
  avoidedDowntimeCount: number;
  /** 误报率 (0-1) */
  falseAlarmRate: number;
  /** 采纳率 (0-1) */
  adoptionRate: number;
  /** 统计窗口起始 (ms) */
  windowStartMs: number;
  /** 统计窗口结束 (ms) */
  windowEndMs: number;
  /** 样本量明细 */
  sampleSizes: {
    /** 已确认故障数 */
    confirmedFailures: number;
    /** 预测性维护数 */
    predictiveMaintenances: number;
    /** 总告警数 */
    totalAlerts: number;
    /** 误报告警数 */
    falsePositiveAlerts: number;
    /** 总建议数 */
    totalRecommendations: number;
    /** 已采纳建议数 */
    followedRecommendations: number;
  };
}

/** 业务评估过滤选项 */
export interface BusinessEvaluatorOptions {
  /** 设备类型过滤 */
  deviceType?: PortDeviceType;
  /** 设备编码过滤 */
  deviceCode?: string;
  /** 统计窗口 (ms) */
  windowMs?: number;
}

// ============================================================================
// 组合优化类型
// ============================================================================

/** 组合约束条件 */
export interface CombinationConstraints {
  /** 目标设备类型 */
  deviceType: PortDeviceType;
  /** 数据质量等级 */
  dataQualityGrade: DataQualityGrade;
  /** 延迟要求 */
  latencyRequirement: LatencyRequirement;
  /** 允许的算法分类（空=全部） */
  allowedCategories?: string[];
  /** 必须包含的算法 ID */
  requiredAlgorithms?: string[];
  /** 每组合最大算法数 */
  maxAlgorithmsPerCombination?: number;
}

/** 算法组合 */
export interface AlgorithmCombination {
  /** 组合唯一 ID */
  combinationId: string;
  /** 包含的算法 ID 列表 */
  algorithmIds: string[];
  /** 包含的算法名称列表 */
  algorithmNames: string[];
  /** 覆盖的分类 */
  coveredCategories: string[];
}

/** 组合评估结果 */
export interface CombinationEvaluation {
  /** 算法组合 */
  combination: AlgorithmCombination;
  /** 综合评分 (0-100) */
  score: number;
  /** 准确率分数 */
  accuracy: number;
  /** 覆盖率分数 */
  coverage: number;
  /** 延迟分数 */
  latencyScore: number;
  /** 成本分数 */
  costScore: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 置信区间 */
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  /** 回放统计 */
  replayStats: {
    /** 总回放案例数 */
    totalCases: number;
    /** 正确诊断数 */
    correctDiagnoses: number;
    /** 平均执行时间 (ms) */
    avgExecutionTimeMs: number;
  };
}

/** 组合推荐报告 */
export interface CombinationRecommendationReport {
  /** 报告唯一 ID */
  reportId: string;
  /** 输入约束条件 */
  constraints: CombinationConstraints;
  /** 候选总数 */
  totalCandidates: number;
  /** Top-N 推荐（默认 top-3） */
  recommendations: CombinationEvaluation[];
  /** 数据质量告警 */
  dataQualityWarnings: string[];
  /** 生成时间戳 */
  generatedAt: number;
}

// ============================================================================
// 仪表盘聚合类型
// ============================================================================

/** 模块评分趋势 */
export interface ModuleScoreTrend {
  /** 模块 ID */
  moduleId: string;
  /** 模块名称 */
  moduleName: string;
  /** 历史评分数据点 */
  scores: Array<{
    date: string;
    technical: number;
    business: number;
    evolution: number;
    cost: number;
    overall: number;
  }>;
}

/** 分类占比条目 */
export interface CategoryProportionEntry {
  /** 日期 */
  date: string;
  /** 分类名 → 占比 (0-1) */
  categories: Record<string, number>;
}

/** 退步模块信息 */
export interface RegressingModule {
  /** 模块 ID */
  moduleId: string;
  /** 模块名称 */
  moduleName: string;
  /** 当前评分 */
  currentScore: number;
  /** 上次评分 */
  previousScore: number;
  /** 变化量 */
  delta: number;
  /** 趋势 */
  trend: ScoreTrend;
  /** 退步维度列表 */
  regressingDimensions: string[];
}

/** 平台概览 */
export interface PlatformSummary {
  /** 改进中的模块数 */
  improvingCount: number;
  /** 稳定的模块数 */
  stableCount: number;
  /** 退步的模块数 */
  regressingCount: number;
  /** 平台平均分 */
  avgOverallScore: number;
  /** 最佳模块 */
  bestModule: { moduleId: string; moduleName: string; score: number } | null;
  /** 最差模块 */
  worstModule: { moduleId: string; moduleName: string; score: number } | null;
}

/** 业务 KPI 概览 */
export interface BusinessKpiSummary {
  /** 预警提前天数（中位数） */
  earlyWarningDays: number;
  /** 避免停机次数 */
  avoidedDowntimes: number;
  /** 误报率 */
  falseAlarmRate: number;
  /** 采纳率 */
  adoptionRate: number;
  /** 统计窗口描述 */
  windowDescription: string;
}

/** 评估仪表盘完整数据 */
export interface EvaluationDashboardData {
  /** 模块评分趋势 */
  scoreTrends: ModuleScoreTrend[];
  /** 分类占比趋势 */
  categoryProportions: CategoryProportionEntry[];
  /** 组合推荐（按设备类型） */
  combinationRecommendations: CombinationRecommendationReport[];
  /** 退步模块列表 */
  regressingModules: RegressingModule[];
  /** 平台概览 */
  platformSummary: PlatformSummary;
  /** 业务 KPI 概览 */
  businessKpiSummary: BusinessKpiSummary;
  /** AI 生成的自然语言摘要（可选，LLM 降级时为 null） */
  aiSummary: string | null;
  /** 生成时间戳 */
  generatedAt: number;
}

// ============================================================================
// 配置相关类型
// ============================================================================

/** 维度权重配置 */
export interface DimensionWeights {
  technical: number;
  business: number;
  evolution: number;
  cost: number;
}

/** 技术维度子权重 */
export interface TechnicalWeights {
  algorithmAccuracy: number;
  dataQuality: number;
  faultModeCoverage: number;
}

/** 业务维度子权重 */
export interface BusinessWeights {
  earlyWarning: number;
  falseAlarm: number;
  adoptionRate: number;
  avoidedDowntime: number;
}

/** 组合优化器配置 */
export interface CombinationOptimizerConfig {
  maxCombinationsPerDeviceType: number;
  topN: number;
  minHistoricalCases: number;
  bootstrapSamples: number;
}

/** 组合评分权重 */
export interface CombinationScoringWeights {
  accuracy: number;
  coverage: number;
  latency: number;
  cost: number;
}

/** 评估系统完整配置 */
export interface EvaluationConfig {
  /** 定时评估间隔 (ms)，默认 24h */
  scheduledIntervalMs: number;
  /** 评估时间窗口 (ms)，默认 30d */
  evaluationWindowMs: number;
  /** 四维权重 */
  dimensionWeights: DimensionWeights;
  /** 技术维度子权重 */
  technicalWeights: TechnicalWeights;
  /** 业务维度子权重 */
  businessWeights: BusinessWeights;
  /** 组合优化器配置 */
  combinationOptimizer: CombinationOptimizerConfig;
  /** 组合评分权重 */
  combinationScoringWeights: CombinationScoringWeights;
  /** 退步告警阈值（负数） */
  regressionThreshold: number;
}

/** 递归 Partial 类型 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
