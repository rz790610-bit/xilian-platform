/**
 * ============================================================================
 * P3-1: 数据脱敏服务 — DataDeidentificationService
 * ============================================================================
 *
 * 多层脱敏策略：
 *   1. 对象脱敏 — 设备 ID/位置/操作员 → 单向哈希
 *   2. 特征脱敏 — 绝对值 → 相对基线（标准化）
 *   3. 统计脱敏 — 差分隐私噪声（高斯/拉普拉斯）
 *   4. 时间脱敏 — 精确时间戳 → 聚合粒度
 *
 * 隐私保证：
 *   - k-匿名性: 每组最少 k 条记录
 *   - ε-差分隐私: 高斯机制 (ε, δ)
 *   - 单向哈希: HMAC-SHA256 不可逆
 *
 * 数据主权：
 *   - 原始数据永不离开本函数的输入侧
 *   - 输出仅包含脱敏后的统计摘要
 */

import { createModuleLogger } from '../../../core/logger';
import { createHmac, createHash } from 'crypto';
import type {
  DeidentificationConfig,
  DeidentifiedTriple,
  LocalTrainingSummary,
} from '@shared/federatedKnowledgeTypes';

const log = createModuleLogger('data-deidentification');

// ============================================================================
// 默认脱敏配置
// ============================================================================

export const DEFAULT_DEIDENTIFICATION_CONFIG: DeidentificationConfig = {
  entityHashSalt: 'portai-nexus-federated-v1',
  locationGranularity: 'region',
  timestampGranularity: 'day',
  dpEpsilon: 1.0,
  kAnonymityThreshold: 5,
  entityTypesToDeidentify: ['device', 'component', 'sensor', 'location', 'operator'],
  preservedIdentifiers: [],
};

// ============================================================================
// 脱敏统计
// ============================================================================

export interface DeidentificationStats {
  totalEntitiesProcessed: number;
  entitiesDeidentified: number;
  triplesDeidentified: number;
  noiseApplied: number;
  kAnonymityViolations: number;
}

// ============================================================================
// 数据脱敏服务
// ============================================================================

export class DataDeidentificationService {
  private readonly config: DeidentificationConfig;
  private readonly entityMap = new Map<string, string>();
  private stats: DeidentificationStats = {
    totalEntitiesProcessed: 0,
    entitiesDeidentified: 0,
    triplesDeidentified: 0,
    noiseApplied: 0,
    kAnonymityViolations: 0,
  };

  constructor(config?: Partial<DeidentificationConfig>) {
    this.config = { ...DEFAULT_DEIDENTIFICATION_CONFIG, ...config };
    log.info({
      locationGranularity: this.config.locationGranularity,
      dpEpsilon: this.config.dpEpsilon,
      kThreshold: this.config.kAnonymityThreshold,
    }, '数据脱敏服务初始化');
  }

  // --------------------------------------------------------------------------
  // 实体脱敏
  // --------------------------------------------------------------------------

  /**
   * 对实体 ID 进行单向哈希脱敏
   * 使用 HMAC-SHA256 + salt，相同输入始终产生相同输出（确定性）
   */
  deidentifyEntity(entityId: string, entityType: string): string {
    this.stats.totalEntitiesProcessed++;

    // 保留的通用标识符不脱敏
    if (this.config.preservedIdentifiers.includes(entityId)) {
      return entityId;
    }

    // 不需要脱敏的实体类型
    if (!this.config.entityTypesToDeidentify.includes(entityType as any)) {
      return entityId;
    }

    // 检查缓存（确定性映射）
    const cacheKey = `${entityType}:${entityId}`;
    if (this.entityMap.has(cacheKey)) {
      return this.entityMap.get(cacheKey)!;
    }

    // HMAC-SHA256 单向哈希
    const hmac = createHmac('sha256', this.config.entityHashSalt);
    hmac.update(`${entityType}:${entityId}`);
    const hash = hmac.digest('hex').slice(0, 16); // 取前 16 位
    const deidentified = `${entityType.slice(0, 3)}_${hash}`;

    this.entityMap.set(cacheKey, deidentified);
    this.stats.entitiesDeidentified++;

    return deidentified;
  }

  // --------------------------------------------------------------------------
  // 三元组脱敏
  // --------------------------------------------------------------------------

  /**
   * 脱敏知识三元组
   * - subject/object 中的实体 ID 替换为哈希
   * - predicate（关系类型）保留原始语义
   */
  deidentifyTriple(triple: {
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    sourceType: string;
  }): DeidentifiedTriple {
    this.stats.triplesDeidentified++;

    return {
      subject: this.deidentifyEntityInText(triple.subject),
      predicate: triple.predicate, // 关系语义保留
      object: this.deidentifyEntityInText(triple.object),
      confidence: this.addNoise(triple.confidence, 0.02), // 微量噪声
      sourceType: triple.sourceType as DeidentifiedTriple['sourceType'],
    };
  }

  /**
   * 批量脱敏三元组
   */
  deidentifyTriples(triples: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    sourceType: string;
  }>): DeidentifiedTriple[] {
    return triples.map(t => this.deidentifyTriple(t));
  }

  // --------------------------------------------------------------------------
  // 特征脱敏（标准化 + 差分隐私）
  // --------------------------------------------------------------------------

  /**
   * 特征统计脱敏：绝对值 → 标准化 + 差分隐私噪声
   *
   * 输入: { featureName: { values: number[] } }
   * 输出: { featureName: { mean, std, count } } — 脱敏后的统计摘要
   */
  deidentifyFeatureStats(
    rawStats: Record<string, { values: number[] }>,
  ): Record<string, { mean: number; std: number; count: number }> {
    const result: Record<string, { mean: number; std: number; count: number }> = {};

    for (const [name, { values }] of Object.entries(rawStats)) {
      if (values.length < this.config.kAnonymityThreshold) {
        // k-匿名性违反：样本太少，不输出
        this.stats.kAnonymityViolations++;
        log.debug({ feature: name, count: values.length, k: this.config.kAnonymityThreshold },
          'k-匿名性违反，跳过特征');
        continue;
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);

      // 添加差分隐私噪声（高斯机制）
      const noisyMean = this.addGaussianNoise(mean, this.sensitivity(values) / this.config.dpEpsilon);
      const noisyStd = Math.max(0, this.addGaussianNoise(std, this.sensitivity(values) / this.config.dpEpsilon));

      result[name] = {
        mean: Number(noisyMean.toFixed(6)),
        std: Number(noisyStd.toFixed(6)),
        count: values.length,
      };
    }

    return result;
  }

  /**
   * 故障分布脱敏
   */
  deidentifyFaultDistribution(
    distribution: Record<string, number>,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [fault, count] of Object.entries(distribution)) {
      if (count < this.config.kAnonymityThreshold) {
        this.stats.kAnonymityViolations++;
        continue;
      }
      // 拉普拉斯噪声
      const noisy = Math.max(0, Math.round(count + this.laplacianNoise(1 / this.config.dpEpsilon)));
      result[fault] = noisy;
      this.stats.noiseApplied++;
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // 时间脱敏
  // --------------------------------------------------------------------------

  /**
   * 时间戳聚合脱敏
   */
  deidentifyTimestamp(timestamp: number): number {
    switch (this.config.timestampGranularity) {
      case 'exact':
        return timestamp;
      case 'hour': {
        const d = new Date(timestamp);
        d.setMinutes(0, 0, 0);
        return d.getTime();
      }
      case 'day': {
        const d = new Date(timestamp);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }
      case 'week': {
        const d = new Date(timestamp);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        return d.getTime();
      }
      case 'month': {
        const d = new Date(timestamp);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }
    }
  }

  // --------------------------------------------------------------------------
  // 训练摘要脱敏
  // --------------------------------------------------------------------------

  /**
   * 将原始训练数据生成脱敏后的 LocalTrainingSummary
   */
  createDeidentifiedSummary(params: {
    datasetSize: number;
    accuracy: number;
    epochs: number;
    featureStats: Record<string, { values: number[] }>;
    faultDistribution: Record<string, number>;
    equipmentType: string;
    trainedAt: number;
  }): LocalTrainingSummary {
    return {
      datasetSize: params.datasetSize,
      accuracy: this.addNoise(params.accuracy, 0.005),
      epochs: params.epochs,
      featureStats: this.deidentifyFeatureStats(params.featureStats),
      faultDistribution: this.deidentifyFaultDistribution(params.faultDistribution),
      equipmentCategory: this.generalizeEquipmentType(params.equipmentType),
      trainedAt: this.deidentifyTimestamp(params.trainedAt),
    };
  }

  // --------------------------------------------------------------------------
  // 签名和校验
  // --------------------------------------------------------------------------

  /**
   * 为知识包生成 HMAC-SHA256 签名
   */
  generateSignature(content: string, secret: string): string {
    return createHmac('sha256', secret).update(content).digest('hex');
  }

  /**
   * 生成内容 SHA256 校验和
   */
  generateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * 验证签名
   */
  verifySignature(content: string, signature: string, secret: string): boolean {
    const expected = this.generateSignature(content, secret);
    // 时间安全比较
    if (expected.length !== signature.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  getStats(): DeidentificationStats {
    return { ...this.stats };
  }

  getEntityMap(): ReadonlyMap<string, string> {
    return this.entityMap;
  }

  getConfig(): Readonly<DeidentificationConfig> {
    return this.config;
  }

  resetStats(): void {
    this.stats = {
      totalEntitiesProcessed: 0,
      entitiesDeidentified: 0,
      triplesDeidentified: 0,
      noiseApplied: 0,
      kAnonymityViolations: 0,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  /**
   * 在文本中识别并脱敏实体 ID
   * 识别模式：设备编码（如 QC-001）、部件编码（如 QC.HST.MOT.001）
   */
  private deidentifyEntityInText(text: string): string {
    // 4段式编码：XX.XXX.XXX.NNN
    const codePattern = /\b([A-Z]{2,5})\.([A-Z]{2,5})\.([A-Z]{2,5})\.\d{3}\b/g;
    let result = text.replace(codePattern, (match) => {
      return this.deidentifyEntity(match, 'component');
    });

    // 设备编码：XX-NNN
    const devicePattern = /\b([A-Z]{2,5})-(\d{3,5})\b/g;
    result = result.replace(devicePattern, (match) => {
      return this.deidentifyEntity(match, 'device');
    });

    return result;
  }

  /** 设备类型泛化 */
  private generalizeEquipmentType(specificType: string): string {
    const generalizations: Record<string, string> = {
      'STS': 'shore_crane', 'QC': 'shore_crane',
      'RTG': 'yard_crane', 'RMG': 'yard_crane', 'ASC': 'yard_crane',
      'AGV': 'transport', 'IGV': 'transport', 'straddle_carrier': 'transport',
      'reach_stacker': 'handling', 'forklift': 'handling',
    };
    return generalizations[specificType] || 'industrial_equipment';
  }

  /** 添加均匀噪声 */
  private addNoise(value: number, magnitude: number): number {
    const noise = (Math.random() - 0.5) * 2 * magnitude;
    return Number((value + noise).toFixed(6));
  }

  /** 添加高斯噪声（Box-Muller 变换） */
  private addGaussianNoise(value: number, sigma: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const normal = Math.sqrt(-2 * Math.log(u1 + 1e-15)) * Math.cos(2 * Math.PI * u2);
    this.stats.noiseApplied++;
    return value + normal * sigma;
  }

  /** 拉普拉斯噪声 */
  private laplacianNoise(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u) + 1e-15);
  }

  /** 计算灵敏度（全局灵敏度 = max - min） */
  private sensitivity(values: number[]): number {
    if (values.length === 0) return 1;
    return Math.max(...values) - Math.min(...values) || 1;
  }
}

// ============================================================================
// 单例 + 工厂函数
// ============================================================================

let _instance: DataDeidentificationService | null = null;

export function getDeidentificationService(
  config?: Partial<DeidentificationConfig>,
): DataDeidentificationService {
  if (!_instance) {
    _instance = new DataDeidentificationService(config);
  }
  return _instance;
}

export function resetDeidentificationService(): void {
  _instance = null;
}
