/**
 * ============================================================================
 * P3-1: 联邦知识蒸馏 — 共享类型定义
 * ============================================================================
 *
 * 定义跨客户知识联邦的核心数据结构：
 *   - FederatedKnowledgePackage: 现场→中心的知识包格式
 *   - DeidentificationConfig: 脱敏策略配置
 *   - FusionRequest / FusionResult: 融合请求/结果
 *   - SiteContribution: 客户贡献追踪
 *
 * 数据主权约束：
 *   - 原始数据永不离开现场
 *   - 仅传输脱敏后的统计摘要和模型增量
 *   - 知识包 ≤ 500MB / 月 / 客户
 */

// ============================================================================
// 知识包格式
// ============================================================================

/** 联邦知识包 — 现场节点提取并上传到中心的脱敏知识 */
export interface FederatedKnowledgePackage {
  /** 包 ID (UUID) */
  packageId: string;
  /** 现场站点 ID (脱敏后的哈希) */
  siteId: string;
  /** 包版本 (语义化) */
  version: string;
  /** 创建时间 (Unix ms) */
  timestamp: number;

  /** 本地训练信息摘要 */
  localTraining: LocalTrainingSummary;
  /** 蒸馏知识内容（脱敏后） */
  distilledKnowledge: DistilledKnowledge;
  /** 知识三元组（脱敏后） */
  knowledgeTriples: DeidentifiedTriple[];

  /** HMAC-SHA256 签名 */
  signature: string;
  /** SHA256 校验和 */
  checksum: string;
  /** 包大小 (bytes) */
  sizeBytes: number;
}

/** 本地训练摘要 */
export interface LocalTrainingSummary {
  /** 训练数据集大小 */
  datasetSize: number;
  /** 本地模型准确率 */
  accuracy: number;
  /** 训练轮次 */
  epochs: number;
  /** 特征统计（均值/标准差） */
  featureStats: Record<string, { mean: number; std: number; count: number }>;
  /** 故障类型分布 */
  faultDistribution: Record<string, number>;
  /** 设备类型（脱敏后的类别） */
  equipmentCategory: string;
  /** 训练完成时间 */
  trainedAt: number;
}

/** 蒸馏知识内容 */
export interface DistilledKnowledge {
  /** 模型权重增量（差分） */
  weightDeltas: number[];
  /** 特征到故障模式映射 */
  featureFaultMappings: FeatureFaultMapping[];
  /** 异常模式签名 */
  anomalySignatures: AnomalySignature[];
  /** 阈值更新建议 */
  thresholdUpdates: ThresholdUpdate[];
}

/** 特征-故障映射 */
export interface FeatureFaultMapping {
  /** 特征名称（通用名，非客户专有） */
  featureName: string;
  /** 关联故障模式编码 */
  faultCode: string;
  /** 映射置信度 */
  confidence: number;
  /** 样本支撑数 */
  sampleCount: number;
}

/** 异常模式签名 */
export interface AnomalySignature {
  /** 签名 ID */
  signatureId: string;
  /** 模式类型 */
  patternType: 'frequency' | 'amplitude' | 'trend' | 'correlation';
  /** 特征向量（脱敏后的标准化值） */
  featureVector: number[];
  /** 关联故障 */
  faultCode: string;
  /** 置信度 */
  confidence: number;
}

/** 阈值更新建议 */
export interface ThresholdUpdate {
  /** 测点编码（通用编码，非客户专有 ID） */
  measurementCode: string;
  /** 旧阈值 */
  oldThreshold: number;
  /** 建议新阈值 */
  newThreshold: number;
  /** 证据支撑 */
  evidenceCount: number;
  /** 统计显著性 p 值 */
  pValue: number;
}

// ============================================================================
// 脱敏三元组
// ============================================================================

/** 脱敏后的知识三元组 */
export interface DeidentifiedTriple {
  /** 主语（脱敏后） */
  subject: string;
  /** 谓语（关系类型，保留原始语义） */
  predicate: string;
  /** 宾语（脱敏后） */
  object: string;
  /** 置信度 */
  confidence: number;
  /** 来源类型 */
  sourceType: 'diagnosis' | 'evolution' | 'manual' | 'guardrail';
}

// ============================================================================
// 脱敏配置
// ============================================================================

/** 脱敏策略配置 */
export interface DeidentificationConfig {
  /** 对象脱敏：设备 ID → 哈希 */
  entityHashSalt: string;
  /** 地点模糊化级别 */
  locationGranularity: 'exact' | 'city' | 'region' | 'country' | 'removed';
  /** 时间戳聚合粒度 */
  timestampGranularity: 'exact' | 'hour' | 'day' | 'week' | 'month';
  /** 差分隐私噪声强度 (epsilon) */
  dpEpsilon: number;
  /** 最小聚合组大小 (k-匿名性) */
  kAnonymityThreshold: number;
  /** 要脱敏的实体类型 */
  entityTypesToDeidentify: ('device' | 'component' | 'sensor' | 'location' | 'operator')[];
  /** 保留的通用标识符（不脱敏） */
  preservedIdentifiers: string[];
}

// ============================================================================
// 融合请求/结果
// ============================================================================

/** 联邦融合请求 */
export interface FederatedFusionRequest {
  /** 融合任务 ID */
  fusionId: string;
  /** 参与融合的知识包 ID 列表 */
  packageIds: string[];
  /** 融合算法 */
  algorithm: 'fedavg' | 'fedprox' | 'scaffold';
  /** FedProx 代理项强度 (μ) */
  proximalMu?: number;
  /** 冲突解决策略 */
  conflictResolution: 'voting' | 'confidence_weighted' | 'most_recent';
  /** 最小参与客户数 */
  minContributors: number;
}

/** 联邦融合结果 */
export interface FederatedFusionResult {
  /** 融合任务 ID */
  fusionId: string;
  /** 全局模型版本 */
  globalModelVersion: string;
  /** 融合后的权重 */
  fusedWeights: number[];
  /** 融合后的知识三元组 */
  fusedTriples: DeidentifiedTriple[];
  /** 融合后的异常签名 */
  fusedSignatures: AnomalySignature[];
  /** 融合后的阈值 */
  fusedThresholds: ThresholdUpdate[];
  /** 各客户贡献 */
  contributions: SiteContribution[];
  /** 冲突统计 */
  conflictsResolved: number;
  /** 融合耗时 (ms) */
  durationMs: number;
  /** 融合时间 */
  fusedAt: number;
}

/** 客户贡献追踪 */
export interface SiteContribution {
  /** 站点 ID (脱敏) */
  siteId: string;
  /** 包 ID */
  packageId: string;
  /** 数据集大小 */
  datasetSize: number;
  /** 本地准确率 */
  localAccuracy: number;
  /** 融合权重 */
  weight: number;
  /** 贡献的三元组数 */
  tripleCount: number;
  /** 贡献的签名数 */
  signatureCount: number;
}

// ============================================================================
// 知识包状态
// ============================================================================

export type PackageStatus =
  | 'pending_validation'
  | 'validated'
  | 'merging'
  | 'merged'
  | 'rejected';

export type FusionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type GlobalModelStatus =
  | 'candidate'
  | 'shadow_evaluating'
  | 'approved'
  | 'deployed'
  | 'deprecated';
