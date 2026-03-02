/**
 * ============================================================================
 * AI 模块共享类型定义
 * ============================================================================
 *
 * 4 个 AI 模块的公共类型：
 *   - 诊断增强引擎 (DiagnosticEnhancer)
 *   - 自然语言交互层 (NLInterface)
 *   - 技术情报系统 (TechIntelligence)
 *   - 进化实验室 (EvolutionLab)
 */

// ============================================================================
// 通用基础类型
// ============================================================================

/** 风险等级 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'negligible';

/**
 * 维护优先级 (AI 层内部使用)
 *
 * FIX-007: 与 UrgencyLevel 语义重叠，跨域通信时使用 mapAIPriority() 转换
 * @see shared/contracts/v1/mappers.ts — mapAIPriority()
 */
export type MaintenancePriority = 'immediate' | 'planned' | 'monitor' | 'defer';

/** 诊断深度 */
export type DiagnosisDepth = 'quick' | 'standard' | 'deep';

/** 证据来源 */
export type EvidenceSource = 'sensor' | 'algorithm' | 'knowledge_graph' | 'history' | 'physics';

// ============================================================================
// 模块 1：诊断增强引擎类型
// ============================================================================

/** 算法结果输入 */
export interface AlgorithmResultInput {
  algorithmId: string;
  algorithmName: string;
  output: Record<string, unknown>;
  confidence: number;
  executedAt: number;
}

/** 传感器特征输入 */
export interface SensorFeatureInput {
  sensorId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: number;
  quality?: number;
}

/** 诊断增强请求 */
export interface EnhanceDiagnosisRequest {
  machineId: string;
  algorithmResults: AlgorithmResultInput[];
  sensorFeatures: SensorFeatureInput[];
  conditionId?: string;
  depth: DiagnosisDepth;
  requestId?: string;
}

/** 证据项 */
export interface EvidenceItem {
  source: EvidenceSource;
  description: string;
  data: Record<string, unknown>;
  confidence: number;
  weight: number;
  physicalBasis?: string;
}

/** 诊断条目 */
export interface DiagnosisEntry {
  faultCode: string;
  faultName: string;
  probability: number;
  severity: RiskLevel;
  evidence: EvidenceItem[];
  physicalExplanation: string;
}

/** 根因分析结果 */
export interface RootCauseAnalysis {
  machineId: string;
  symptoms: string[];
  rootCauses: Array<{
    cause: string;
    probability: number;
    causalChain: string[];
    evidence: EvidenceItem[];
    physicalMechanism: string;
  }>;
  analysisDepth: number;
  timestamp: number;
}

/** 维护建议 */
export interface MaintenanceRecommendation {
  priority: MaintenancePriority;
  action: string;
  rationale: string;
  estimatedCostHours: number;
  riskIfDeferred: string;
  targetComponent?: string;
  deadline?: string;
}

/** 预测信息 */
export interface PredictionInfo {
  remainingLifeHours?: number;
  fatigueCumulative?: number;
  trend: 'improving' | 'stable' | 'degrading' | 'critical';
  nextMilestone?: string;
}

/** 增强诊断报告 */
export interface EnhancedDiagnosisReport {
  reportId: string;
  machineId: string;
  timestamp: number;
  scores: {
    safety: number;
    health: number;
    efficiency: number;
  };
  riskLevel: RiskLevel;
  evidenceChain: EvidenceItem[];
  diagnoses: DiagnosisEntry[];
  rootCause?: RootCauseAnalysis;
  recommendations: MaintenanceRecommendation[];
  prediction: PredictionInfo;
  summary: string;
  depth: DiagnosisDepth;
}

// ============================================================================
// 模块 2：自然语言交互层类型
// ============================================================================

/** 意图类型 */
export type IntentType =
  | 'device_status_query'
  | 'sensor_data_query'
  | 'diagnosis_query'
  | 'alert_query'
  | 'maintenance_query'
  | 'comparison_query'
  | 'prediction_query'
  | 'knowledge_query'
  | 'operation_query'
  | 'report_query'
  | 'config_query'
  | 'general_query';

/** 实体引用 */
export interface EntityReference {
  type: 'machine' | 'mechanism' | 'component' | 'sensor' | 'location';
  id: string;
  originalText: string;
  normalizedName: string;
}

/** 意图分类结果 */
export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  entities: EntityReference[];
  timeRange?: { start?: string; end?: string };
  parameters: Record<string, unknown>;
  originalQuery: string;
}

/** 执行计划 */
export interface ExecutionPlan {
  steps: Array<{
    tool: string;
    input: Record<string, unknown>;
    description: string;
  }>;
  estimatedDurationMs: number;
  fallbackPlan?: ExecutionPlan;
}

/** 执行结果 */
export interface ExecutionResult {
  tool: string;
  success: boolean;
  data: unknown;
  durationMs: number;
  error?: string;
}

/** 图表规格 */
export interface ChartSpec {
  type: 'line' | 'bar' | 'gauge' | 'table' | 'heatmap';
  title: string;
  data: Record<string, unknown>;
  xAxis?: string;
  yAxis?: string;
}

/** NL 格式化响应 */
export interface NLFormattedResponse {
  answer: string;
  charts: ChartSpec[];
  suggestions: string[];
  confidence: number;
}

/** NL 查询请求 */
export interface NLQueryRequest {
  query: string;
  sessionId: string;
  userId?: string;
  machineId?: string;
  context?: Record<string, unknown>;
}

/** NL 查询响应 */
export interface NLQueryResponse {
  requestId: string;
  answer: string;
  charts: ChartSpec[];
  suggestions: string[];
  intent: IntentClassification;
  executionResults: ExecutionResult[];
  durationMs: number;
  timestamp: number;
}

/** NL 流式块 */
export interface NLStreamChunk {
  type: 'thinking' | 'answer' | 'chart' | 'suggestion' | 'done';
  content: string;
  data?: unknown;
}

/** NL 对话请求 */
export interface NLConversationRequest extends NLQueryRequest {
  conversationId: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** NL 建议上下文 */
export interface NLSuggestionContext {
  machineId?: string;
  recentQueries?: string[];
  currentAlerts?: number;
}

// ============================================================================
// 模块 3：技术情报系统类型
// ============================================================================

/** 技术来源类型 */
export type TechSourceType = 'arxiv' | 'ieee' | 'standard' | 'patent' | 'industry_report';

/** 技术来源配置 */
export interface TechSource {
  type: TechSourceType;
  name: string;
  searchQueries: string[];
  priority: number;
  enabled: boolean;
}

/** 扫描文档 */
export interface ScannedDocument {
  sourceType: TechSourceType;
  title: string;
  authors?: string[];
  url?: string;
  publishDate?: string;
  abstract?: string;
  fullText?: string;
  scannedAt: number;
}

/** 相关文档（经 LLM 筛选） */
export interface RelevantDocument extends ScannedDocument {
  relevanceScore: number;
  summary: string;
  applicableEquipment: string[];
}

/** 提取的技术 */
export interface ExtractedTechnique {
  name: string;
  category: string;
  description: string;
  reportedAccuracy?: number;
  applicableDomain: string;
  sourceDocument: string;
  noveltyScore: number;
}

/** 算法元数据（当前平台） */
export interface AlgorithmMetadata {
  algorithmId: string;
  name: string;
  category: string;
  currentAccuracy: number;
  lastUpdated: number;
}

/** 技术差距 */
export interface TechGap {
  gapId: string;
  currentCapability: {
    algorithmId: string;
    name: string;
    accuracy: number;
  };
  stateOfArt: {
    technique: string;
    source: string;
    reportedAccuracy: number;
  };
  gapMagnitude: number;
  improvementPotential: number;
  implementationEffort: 'low' | 'medium' | 'high' | 'very_high';
}

/** 评分后的差距 */
export interface ScoredGap extends TechGap {
  priorityScore: number;
  roiEstimate: number;
}

/** 算法候选 */
export interface AlgorithmCandidate {
  name: string;
  sourceGap: string;
  expectedImprovement: number;
  complexity: 'low' | 'medium' | 'high';
  prerequisites: string[];
  implementationSketch: string;
  estimatedEffortDays: number;
}

/** 情报发现 */
export interface IntelligenceFinding {
  findingId: string;
  source: TechSourceType;
  title: string;
  summary: string;
  relevanceScore: number;
  techniques: ExtractedTechnique[];
  applicableEquipment: string[];
  discoveredAt: number;
}

/** 改进路线图 */
export interface ImprovementRoadmap {
  phases: Array<{
    phase: number;
    name: string;
    duration: string;
    gaps: ScoredGap[];
    candidates: AlgorithmCandidate[];
  }>;
  totalEstimatedEffortDays: number;
  expectedOverallImprovement: number;
}

/** 情报扫描报告 */
export interface IntelligenceReport {
  reportId: string;
  scanDate: number;
  sourcesScanned: number;
  documentsFound: number;
  relevantDocuments: number;
  findings: IntelligenceFinding[];
  gaps: TechGap[];
  candidates: AlgorithmCandidate[];
  durationMs: number;
}

/** 主题搜索结果 */
export interface TopicSearchResult {
  query: string;
  documents: RelevantDocument[];
  techniques: ExtractedTechnique[];
  timestamp: number;
}

/** 文档分析结果 */
export interface DocumentAnalysis {
  document: ScannedDocument;
  relevanceScore: number;
  techniques: ExtractedTechnique[];
  applicability: string;
  limitations: string[];
}

/** 技术差距报告 */
export interface TechGapReport {
  reportId: string;
  generatedAt: number;
  focusAreas: string[];
  gaps: ScoredGap[];
  roadmap: ImprovementRoadmap;
  summary: string;
}

// ============================================================================
// 模块 4：进化实验室类型
// ============================================================================

/** 实验触发类型 */
export type ExperimentTriggerType = 'scheduled' | 'intelligence' | 'feedback' | 'performance' | 'manual';

/** 实验触发 */
export type ExperimentTrigger =
  | { type: 'scheduled'; cycleId: string }
  | { type: 'intelligence'; findingIds: string[] }
  | { type: 'feedback'; feedbackIds: string[] }
  | { type: 'performance'; degradationSignal: string }
  | { type: 'manual'; description: string; userId: string };

/** 实验室洞察 */
export interface LabInsight {
  insightId: string;
  source: ExperimentTriggerType;
  title: string;
  description: string;
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

/** 实验状态 */
export type ExperimentStatus =
  | 'draft'
  | 'designed'
  | 'validating'
  | 'validated'
  | 'review_pending'
  | 'approved'
  | 'deploying'
  | 'deployed'
  | 'rejected'
  | 'failed';

/** 实验设计 */
export interface LabExperiment {
  experimentId: string;
  insightId: string;
  title: string;
  hypothesis: string;
  designedBy: 'llm' | 'rules' | 'manual';
  parameters: Record<string, unknown>;
  expectedImprovement: number;
  status: ExperimentStatus;
  createdAt: number;
  updatedAt: number;
}

/** 设计验证 */
export interface DesignValidation {
  valid: boolean;
  physicsCheck: boolean;
  parameterRangeCheck: boolean;
  safetyCheck: boolean;
  issues: string[];
}

/** 影响估计 */
export interface ImpactEstimate {
  expectedAccuracyGain: number;
  expectedLatencyChange: number;
  riskLevel: RiskLevel;
  affectedEquipment: string[];
  rollbackComplexity: 'simple' | 'moderate' | 'complex';
}

/** 影子验证结果 */
export interface ShadowValidationResult {
  experimentId: string;
  passed: boolean;
  challengerMetrics: Record<string, number>;
  championMetrics: Record<string, number>;
  improvements: Record<string, number>;
  regressions: string[];
  statisticallySignificant: boolean;
  confidence: number;
  recommendation: 'promote' | 'hold' | 'reject';
  analysisText: string;
  validatedAt: number;
}

/** 审核请求 */
export interface ReviewRequest {
  reviewId: string;
  experimentId: string;
  validationResult: ShadowValidationResult;
  requestedAt: number;
  requestedBy: string;
}

/** 审核批准 */
export interface ReviewApproval {
  reviewId: string;
  approved: boolean;
  approvedBy: string;
  comment?: string;
  approvedAt: number;
}

/** 部署结果 */
export interface DeploymentResult {
  experimentId: string;
  deploymentPlanId: string;
  status: 'deployed' | 'rolled_back' | 'failed';
  currentStage: string;
  trafficPercent: number;
  deployedAt: number;
}

/** 实验周期报告 */
export interface ExperimentCycleReport {
  cycleId: string;
  trigger: ExperimentTrigger;
  insightsCollected: number;
  experimentsDesigned: number;
  experimentsPassed: number;
  experimentsDeployed: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  summary: string;
}
