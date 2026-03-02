/**
 * ============================================================================
 * P3-1: 现场知识提取器 — SiteKnowledgeExtractor
 * ============================================================================
 *
 * 从本地训练结果中提取可联邦共享的知识包。
 *
 * 提取流程：
 *   1. 收集本地模型训练结果（权重、特征重要性、故障模式）
 *   2. 提取知识三元组（设备-故障-解决方案关系）
 *   3. 生成异常模式签名（频率/幅度/趋势特征向量）
 *   4. 计算阈值更新建议（基于统计检验）
 *   5. 调用 DataDeidentificationService 脱敏
 *   6. 打包为 FederatedKnowledgePackage
 *   7. 签名 + 校验和
 *
 * 数据主权：
 *   - 原始数据仅在提取过程中使用
 *   - 输出的 FederatedKnowledgePackage 不含任何可逆溯源信息
 */

import { createModuleLogger } from '../../../core/logger';
import { randomUUID } from 'crypto';
import type {
  FederatedKnowledgePackage,
  DistilledKnowledge,
  FeatureFaultMapping,
  AnomalySignature,
  ThresholdUpdate,
  DeidentifiedTriple,
} from '@shared/federatedKnowledgeTypes';
import {
  DataDeidentificationService,
  getDeidentificationService,
} from './data-deidentification';

const log = createModuleLogger('site-knowledge-extractor');

// ============================================================================
// 提取输入类型
// ============================================================================

/** 本地训练结果（提取前的原始数据） */
export interface LocalTrainingResult {
  /** 模型 ID */
  modelId: string;
  /** 模型权重 */
  weights: number[];
  /** 基线权重（上一全局模型） */
  baselineWeights?: number[];
  /** 训练数据统计 */
  datasetSize: number;
  accuracy: number;
  epochs: number;
  /** 特征重要性（原始值） */
  featureImportance: Record<string, number>;
  /** 原始特征统计 */
  featureStats: Record<string, { values: number[] }>;
  /** 故障分布 */
  faultDistribution: Record<string, number>;
  /** 设备类型 */
  equipmentType: string;
  /** 训练时间 */
  trainedAt: number;
}

/** 本地知识三元组（原始，未脱敏） */
export interface LocalKnowledgeTriple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  sourceType: 'diagnosis' | 'evolution' | 'manual' | 'guardrail';
}

/** 本地异常模式（原始） */
export interface LocalAnomalyPattern {
  /** 模式类型 */
  patternType: 'frequency' | 'amplitude' | 'trend' | 'correlation';
  /** 原始特征向量 */
  rawFeatureVector: number[];
  /** 关联故障 */
  faultCode: string;
  /** 置信度 */
  confidence: number;
}

/** 本地阈值建议（原始） */
export interface LocalThresholdSuggestion {
  /** 测点 ID（原始，可能含客户信息） */
  measurementId: string;
  /** 测点通用编码 */
  measurementCode: string;
  oldThreshold: number;
  newThreshold: number;
  evidenceCount: number;
  pValue: number;
}

/** 提取配置 */
export interface ExtractionConfig {
  /** 站点 ID */
  siteId: string;
  /** 签名密钥 */
  signatureSecret: string;
  /** 最小置信度阈值（低于此值的三元组不包含） */
  minConfidence: number;
  /** 最小证据数（低于此值的阈值建议不包含） */
  minEvidenceCount: number;
  /** 最大包大小 (bytes) */
  maxPackageSizeBytes: number;
  /** p 值显著性阈值 */
  significanceThreshold: number;
}

/** 提取统计 */
export interface ExtractionStats {
  totalExtractions: number;
  totalPackagesCreated: number;
  avgPackageSizeBytes: number;
  triplesExtracted: number;
  signaturesExtracted: number;
  thresholdsExtracted: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ExtractionConfig = {
  siteId: 'local-site',
  signatureSecret: 'default-secret-change-in-production',
  minConfidence: 0.5,
  minEvidenceCount: 10,
  maxPackageSizeBytes: 50 * 1024 * 1024, // 50MB
  significanceThreshold: 0.05,
};

// ============================================================================
// 现场知识提取器
// ============================================================================

export class SiteKnowledgeExtractor {
  private readonly config: ExtractionConfig;
  private readonly deidentifier: DataDeidentificationService;
  private stats: ExtractionStats = {
    totalExtractions: 0,
    totalPackagesCreated: 0,
    avgPackageSizeBytes: 0,
    triplesExtracted: 0,
    signaturesExtracted: 0,
    thresholdsExtracted: 0,
  };
  private totalSizeSum = 0;

  constructor(
    config?: Partial<ExtractionConfig>,
    deidentifier?: DataDeidentificationService,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deidentifier = deidentifier ?? getDeidentificationService();

    log.info({
      siteId: this.config.siteId,
      minConfidence: this.config.minConfidence,
    }, '现场知识提取器初始化');
  }

  // --------------------------------------------------------------------------
  // 主提取接口
  // --------------------------------------------------------------------------

  /**
   * 从本地训练结果提取联邦知识包
   */
  extract(params: {
    training: LocalTrainingResult;
    triples: LocalKnowledgeTriple[];
    anomalyPatterns: LocalAnomalyPattern[];
    thresholdSuggestions: LocalThresholdSuggestion[];
  }): FederatedKnowledgePackage {
    this.stats.totalExtractions++;
    const startTime = Date.now();

    // 1. 计算权重增量（差分）
    const weightDeltas = this.computeWeightDeltas(
      params.training.weights,
      params.training.baselineWeights,
    );

    // 2. 提取特征-故障映射
    const featureFaultMappings = this.extractFeatureFaultMappings(
      params.training.featureImportance,
      params.training.faultDistribution,
    );

    // 3. 脱敏异常签名
    const anomalySignatures = this.processAnomalyPatterns(params.anomalyPatterns);

    // 4. 过滤并脱敏阈值建议
    const thresholdUpdates = this.processThresholdSuggestions(params.thresholdSuggestions);

    // 5. 脱敏三元组
    const filteredTriples = params.triples.filter(t => t.confidence >= this.config.minConfidence);
    const deidentifiedTriples = this.deidentifier.deidentifyTriples(filteredTriples);

    // 6. 脱敏训练摘要
    const localTraining = this.deidentifier.createDeidentifiedSummary({
      datasetSize: params.training.datasetSize,
      accuracy: params.training.accuracy,
      epochs: params.training.epochs,
      featureStats: params.training.featureStats,
      faultDistribution: params.training.faultDistribution,
      equipmentType: params.training.equipmentType,
      trainedAt: params.training.trainedAt,
    });

    // 7. 组装蒸馏知识
    const distilledKnowledge: DistilledKnowledge = {
      weightDeltas,
      featureFaultMappings,
      anomalySignatures,
      thresholdUpdates,
    };

    // 8. 构建包
    const packageId = randomUUID();
    const siteId = this.deidentifier.deidentifyEntity(this.config.siteId, 'location');
    const version = `1.0.${this.stats.totalPackagesCreated}`;

    const contentForSign = JSON.stringify({
      packageId, siteId, version,
      localTraining, distilledKnowledge, knowledgeTriples: deidentifiedTriples,
    });

    const signature = this.deidentifier.generateSignature(contentForSign, this.config.signatureSecret);
    const checksum = this.deidentifier.generateChecksum(contentForSign);
    const sizeBytes = Buffer.byteLength(contentForSign, 'utf8');

    const pkg: FederatedKnowledgePackage = {
      packageId,
      siteId,
      version,
      timestamp: Date.now(),
      localTraining,
      distilledKnowledge,
      knowledgeTriples: deidentifiedTriples,
      signature,
      checksum,
      sizeBytes,
    };

    // 更新统计
    this.stats.totalPackagesCreated++;
    this.stats.triplesExtracted += deidentifiedTriples.length;
    this.stats.signaturesExtracted += anomalySignatures.length;
    this.stats.thresholdsExtracted += thresholdUpdates.length;
    this.totalSizeSum += sizeBytes;
    this.stats.avgPackageSizeBytes = this.totalSizeSum / this.stats.totalPackagesCreated;

    log.info({
      packageId,
      triples: deidentifiedTriples.length,
      signatures: anomalySignatures.length,
      thresholds: thresholdUpdates.length,
      sizeKB: (sizeBytes / 1024).toFixed(1),
      ms: Date.now() - startTime,
    }, '知识包提取完成');

    return pkg;
  }

  // --------------------------------------------------------------------------
  // 权重增量计算
  // --------------------------------------------------------------------------

  private computeWeightDeltas(
    currentWeights: number[],
    baselineWeights?: number[],
  ): number[] {
    if (!baselineWeights || baselineWeights.length !== currentWeights.length) {
      return currentWeights;
    }
    return currentWeights.map((w, i) => w - baselineWeights[i]);
  }

  // --------------------------------------------------------------------------
  // 特征-故障映射提取
  // --------------------------------------------------------------------------

  private extractFeatureFaultMappings(
    featureImportance: Record<string, number>,
    faultDistribution: Record<string, number>,
  ): FeatureFaultMapping[] {
    const mappings: FeatureFaultMapping[] = [];
    const totalFaults = Object.values(faultDistribution).reduce((a, b) => a + b, 0);
    if (totalFaults === 0) return mappings;

    // 取重要性 top 特征
    const sortedFeatures = Object.entries(featureImportance)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);

    // 对每个重要特征，关联最可能的故障
    const faultEntries = Object.entries(faultDistribution)
      .sort(([, a], [, b]) => b - a);

    for (const [feature, importance] of sortedFeatures) {
      if (importance < 0.01) continue;

      for (const [faultCode, count] of faultEntries.slice(0, 3)) {
        const confidence = importance * (count / totalFaults);
        if (confidence >= this.config.minConfidence * 0.5) {
          mappings.push({
            featureName: feature,
            faultCode,
            confidence: Number(confidence.toFixed(4)),
            sampleCount: count,
          });
        }
      }
    }

    return mappings;
  }

  // --------------------------------------------------------------------------
  // 异常签名处理
  // --------------------------------------------------------------------------

  private processAnomalyPatterns(patterns: LocalAnomalyPattern[]): AnomalySignature[] {
    return patterns
      .filter(p => p.confidence >= this.config.minConfidence)
      .map(p => ({
        signatureId: randomUUID().slice(0, 12),
        patternType: p.patternType,
        featureVector: this.normalizeVector(p.rawFeatureVector),
        faultCode: p.faultCode,
        confidence: p.confidence,
      }));
  }

  /** L2 归一化（消除绝对尺度） */
  private normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) + 1e-8;
    return vec.map(x => Number((x / norm).toFixed(6)));
  }

  // --------------------------------------------------------------------------
  // 阈值建议处理
  // --------------------------------------------------------------------------

  private processThresholdSuggestions(suggestions: LocalThresholdSuggestion[]): ThresholdUpdate[] {
    return suggestions
      .filter(s =>
        s.evidenceCount >= this.config.minEvidenceCount &&
        s.pValue <= this.config.significanceThreshold,
      )
      .map(s => ({
        measurementCode: s.measurementCode,
        oldThreshold: s.oldThreshold,
        newThreshold: s.newThreshold,
        evidenceCount: s.evidenceCount,
        pValue: s.pValue,
      }));
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  getStats(): ExtractionStats {
    return { ...this.stats };
  }

  getConfig(): Readonly<ExtractionConfig> {
    return this.config;
  }
}

// ============================================================================
// 单例 + 工厂函数
// ============================================================================

let _instance: SiteKnowledgeExtractor | null = null;

export function getSiteKnowledgeExtractor(
  config?: Partial<ExtractionConfig>,
  deidentifier?: DataDeidentificationService,
): SiteKnowledgeExtractor {
  if (!_instance) {
    _instance = new SiteKnowledgeExtractor(config, deidentifier);
  }
  return _instance;
}

export function resetSiteKnowledgeExtractor(): void {
  _instance = null;
}
