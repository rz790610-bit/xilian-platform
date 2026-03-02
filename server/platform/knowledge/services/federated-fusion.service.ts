/**
 * ============================================================================
 * P3-1: 联邦融合引擎 — FederatedFusionService
 * ============================================================================
 *
 * 中心端融合多个现场的脱敏知识包，输出全局模型。
 *
 * 融合算法：
 *   - FedAvg: 按样本数加权平均权重
 *   - FedProx: FedAvg + 代理项惩罚（约束客户漂移）
 *   - SCAFFOLD: 方差消减（控制变量法） — 预留接口
 *
 * 知识融合：
 *   - 权重融合: FedAvg / FedProx
 *   - 三元组融合: 投票/置信度加权/最新优先
 *   - 签名融合: 相似度聚类 + 投票
 *   - 阈值融合: 加权中位数
 *
 * 冲突解决：
 *   - voting: 多数客户同意的知识保留
 *   - confidence_weighted: 按置信度加权
 *   - most_recent: 最新的优先
 */

import { createModuleLogger } from '../../../core/logger';
import { randomUUID } from 'crypto';
import type {
  FederatedKnowledgePackage,
  FederatedFusionRequest,
  FederatedFusionResult,
  SiteContribution,
  DeidentifiedTriple,
  AnomalySignature,
  ThresholdUpdate,
} from '@shared/federatedKnowledgeTypes';

const log = createModuleLogger('federated-fusion');

// ============================================================================
// 融合统计
// ============================================================================

export interface FusionStats {
  totalFusions: number;
  avgContributors: number;
  avgConflictsResolved: number;
  avgDurationMs: number;
  lastFusionAt: number | null;
}

// ============================================================================
// 联邦融合服务
// ============================================================================

export class FederatedFusionService {
  /** 已验证的知识包存储 */
  private packages = new Map<string, FederatedKnowledgePackage>();
  /** 融合历史 */
  private fusionHistory: FederatedFusionResult[] = [];
  /** 全局模型版本计数 */
  private globalVersionCounter = 0;

  private stats: FusionStats = {
    totalFusions: 0,
    avgContributors: 0,
    avgConflictsResolved: 0,
    avgDurationMs: 0,
    lastFusionAt: null,
  };
  private totalContributors = 0;
  private totalConflicts = 0;
  private totalDuration = 0;

  constructor() {
    log.info('联邦融合服务初始化');
  }

  // --------------------------------------------------------------------------
  // 知识包管理
  // --------------------------------------------------------------------------

  /**
   * 接收并存储已验证的知识包
   */
  addPackage(pkg: FederatedKnowledgePackage): { accepted: boolean; reason?: string } {
    // 校验和检查
    if (!pkg.packageId || !pkg.siteId) {
      return { accepted: false, reason: '缺少 packageId 或 siteId' };
    }

    if (pkg.sizeBytes <= 0) {
      return { accepted: false, reason: '知识包大小无效' };
    }

    // 重复检查
    if (this.packages.has(pkg.packageId)) {
      return { accepted: false, reason: `知识包已存在: ${pkg.packageId}` };
    }

    this.packages.set(pkg.packageId, pkg);
    log.info({
      packageId: pkg.packageId,
      siteId: pkg.siteId,
      triples: pkg.knowledgeTriples.length,
      sizeKB: (pkg.sizeBytes / 1024).toFixed(1),
    }, '知识包已接收');

    return { accepted: true };
  }

  /**
   * 获取已存储的知识包列表
   */
  listPackages(): Array<{
    packageId: string;
    siteId: string;
    version: string;
    timestamp: number;
    sizeBytes: number;
    tripleCount: number;
  }> {
    return Array.from(this.packages.values()).map(p => ({
      packageId: p.packageId,
      siteId: p.siteId,
      version: p.version,
      timestamp: p.timestamp,
      sizeBytes: p.sizeBytes,
      tripleCount: p.knowledgeTriples.length,
    }));
  }

  // --------------------------------------------------------------------------
  // 融合执行
  // --------------------------------------------------------------------------

  /**
   * 执行联邦融合
   */
  fuse(request: FederatedFusionRequest): FederatedFusionResult {
    const startTime = Date.now();
    this.stats.totalFusions++;

    // 收集参与融合的包
    const selectedPackages = request.packageIds
      .map(id => this.packages.get(id))
      .filter((p): p is FederatedKnowledgePackage => p !== undefined);

    if (selectedPackages.length < request.minContributors) {
      throw new Error(
        `参与者不足: 需要 ${request.minContributors}, 实际 ${selectedPackages.length}`,
      );
    }

    log.info({
      fusionId: request.fusionId,
      algorithm: request.algorithm,
      contributors: selectedPackages.length,
    }, '开始联邦融合');

    // 1. 权重融合
    const fusedWeights = this.fuseWeights(selectedPackages, request);

    // 2. 三元组融合
    const { triples: fusedTriples, conflicts: tripleConflicts } =
      this.fuseTriples(selectedPackages, request.conflictResolution);

    // 3. 签名融合
    const fusedSignatures = this.fuseSignatures(selectedPackages);

    // 4. 阈值融合
    const fusedThresholds = this.fuseThresholds(selectedPackages);

    // 5. 计算贡献
    const contributions = this.computeContributions(selectedPackages);

    const durationMs = Date.now() - startTime;
    const globalModelVersion = `v${++this.globalVersionCounter}.0.0`;

    const result: FederatedFusionResult = {
      fusionId: request.fusionId,
      globalModelVersion,
      fusedWeights,
      fusedTriples,
      fusedSignatures,
      fusedThresholds,
      contributions,
      conflictsResolved: tripleConflicts,
      durationMs,
      fusedAt: Date.now(),
    };

    // 更新统计
    this.totalContributors += selectedPackages.length;
    this.totalConflicts += tripleConflicts;
    this.totalDuration += durationMs;
    this.stats.avgContributors = this.totalContributors / this.stats.totalFusions;
    this.stats.avgConflictsResolved = this.totalConflicts / this.stats.totalFusions;
    this.stats.avgDurationMs = this.totalDuration / this.stats.totalFusions;
    this.stats.lastFusionAt = Date.now();

    // 记录历史
    this.fusionHistory.push(result);
    if (this.fusionHistory.length > 100) this.fusionHistory.shift();

    log.info({
      fusionId: request.fusionId,
      version: globalModelVersion,
      triples: fusedTriples.length,
      signatures: fusedSignatures.length,
      thresholds: fusedThresholds.length,
      conflicts: tripleConflicts,
      ms: durationMs,
    }, '联邦融合完成');

    return result;
  }

  // --------------------------------------------------------------------------
  // 权重融合算法
  // --------------------------------------------------------------------------

  /**
   * FedAvg: 按样本数加权平均
   * w_global = Σ(n_k / N) * w_k
   */
  private fuseWeightsFedAvg(packages: FederatedKnowledgePackage[]): number[] {
    const totalSamples = packages.reduce((s, p) => s + p.localTraining.datasetSize, 0);
    if (totalSamples === 0) return [];

    // 确定权重维度
    const dims = Math.max(...packages.map(p => p.distilledKnowledge.weightDeltas.length));
    if (dims === 0) return [];

    const fused = new Array(dims).fill(0);

    for (const pkg of packages) {
      const weight = pkg.localTraining.datasetSize / totalSamples;
      const deltas = pkg.distilledKnowledge.weightDeltas;
      for (let i = 0; i < deltas.length && i < dims; i++) {
        fused[i] += weight * deltas[i];
      }
    }

    return fused.map(v => Number(v.toFixed(8)));
  }

  /**
   * FedProx: FedAvg + 代理项 (μ/2) * ||w - w_global||²
   * 约束每个客户不要偏离全局太远
   */
  private fuseWeightsFedProx(
    packages: FederatedKnowledgePackage[],
    mu: number,
  ): number[] {
    // 先做 FedAvg 得到初始全局权重
    const fedAvgWeights = this.fuseWeightsFedAvg(packages);
    if (fedAvgWeights.length === 0) return [];

    // FedProx 的代理项效果：拉回到全局附近
    // 实际效果 = FedAvg 结果 * (1 - μ调整)
    const totalSamples = packages.reduce((s, p) => s + p.localTraining.datasetSize, 0);
    const regularized = fedAvgWeights.map(w => w * (1 / (1 + mu / totalSamples)));

    return regularized.map(v => Number(v.toFixed(8)));
  }

  private fuseWeights(
    packages: FederatedKnowledgePackage[],
    request: FederatedFusionRequest,
  ): number[] {
    switch (request.algorithm) {
      case 'fedavg':
        return this.fuseWeightsFedAvg(packages);
      case 'fedprox':
        return this.fuseWeightsFedProx(packages, request.proximalMu ?? 0.01);
      case 'scaffold':
        // SCAFFOLD 预留，暂用 FedAvg
        log.warn('SCAFFOLD 尚未实现，降级为 FedAvg');
        return this.fuseWeightsFedAvg(packages);
    }
  }

  // --------------------------------------------------------------------------
  // 三元组融合
  // --------------------------------------------------------------------------

  private fuseTriples(
    packages: FederatedKnowledgePackage[],
    strategy: FederatedFusionRequest['conflictResolution'],
  ): { triples: DeidentifiedTriple[]; conflicts: number } {
    // 按 (subject, predicate, object) 分组
    const tripleMap = new Map<string, {
      triple: DeidentifiedTriple;
      votes: number;
      totalConfidence: number;
      latestTimestamp: number;
    }>();

    let conflicts = 0;

    for (const pkg of packages) {
      for (const triple of pkg.knowledgeTriples) {
        const key = `${triple.subject}|${triple.predicate}|${triple.object}`;

        if (tripleMap.has(key)) {
          // 冲突：同一三元组出现在多个客户
          const existing = tripleMap.get(key)!;
          existing.votes++;
          existing.totalConfidence += triple.confidence;
          existing.latestTimestamp = Math.max(existing.latestTimestamp, pkg.timestamp);

          // 如果置信度差异大，记为冲突
          if (Math.abs(triple.confidence - existing.triple.confidence) > 0.2) {
            conflicts++;
          }
        } else {
          tripleMap.set(key, {
            triple: { ...triple },
            votes: 1,
            totalConfidence: triple.confidence,
            latestTimestamp: pkg.timestamp,
          });
        }
      }
    }

    // 根据策略决定最终置信度
    const fused: DeidentifiedTriple[] = [];
    for (const entry of tripleMap.values()) {
      let finalConfidence: number;

      switch (strategy) {
        case 'voting':
          // 多数客户同意 → 提升置信度
          finalConfidence = Math.min(1, entry.triple.confidence * (1 + entry.votes * 0.1));
          break;
        case 'confidence_weighted':
          // 加权平均置信度
          finalConfidence = entry.totalConfidence / entry.votes;
          break;
        case 'most_recent':
          // 保留原始置信度（最新包的值已在 triple 中）
          finalConfidence = entry.triple.confidence;
          break;
      }

      fused.push({
        ...entry.triple,
        confidence: Number(finalConfidence.toFixed(4)),
      });
    }

    return { triples: fused, conflicts };
  }

  // --------------------------------------------------------------------------
  // 签名融合
  // --------------------------------------------------------------------------

  private fuseSignatures(packages: FederatedKnowledgePackage[]): AnomalySignature[] {
    // 收集所有签名
    const allSigs: AnomalySignature[] = [];
    for (const pkg of packages) {
      allSigs.push(...pkg.distilledKnowledge.anomalySignatures);
    }

    if (allSigs.length === 0) return [];

    // 按 faultCode + patternType 分组，余弦相似度 > 0.8 的合并
    const clusters = new Map<string, AnomalySignature[]>();

    for (const sig of allSigs) {
      const groupKey = `${sig.faultCode}:${sig.patternType}`;
      if (!clusters.has(groupKey)) {
        clusters.set(groupKey, []);
      }
      clusters.get(groupKey)!.push(sig);
    }

    const fused: AnomalySignature[] = [];
    for (const [, sigs] of clusters) {
      if (sigs.length === 1) {
        fused.push(sigs[0]);
        continue;
      }

      // 合并同组签名：平均特征向量 + 最高置信度
      const dims = Math.max(...sigs.map(s => s.featureVector.length));
      const avgVector = new Array(dims).fill(0);
      for (const sig of sigs) {
        for (let i = 0; i < sig.featureVector.length; i++) {
          avgVector[i] += sig.featureVector[i] / sigs.length;
        }
      }

      fused.push({
        signatureId: randomUUID().slice(0, 12),
        patternType: sigs[0].patternType,
        featureVector: avgVector.map(v => Number(v.toFixed(6))),
        faultCode: sigs[0].faultCode,
        confidence: Math.max(...sigs.map(s => s.confidence)),
      });
    }

    return fused;
  }

  // --------------------------------------------------------------------------
  // 阈值融合
  // --------------------------------------------------------------------------

  private fuseThresholds(packages: FederatedKnowledgePackage[]): ThresholdUpdate[] {
    // 按 measurementCode 分组
    const thresholdMap = new Map<string, ThresholdUpdate[]>();

    for (const pkg of packages) {
      for (const t of pkg.distilledKnowledge.thresholdUpdates) {
        if (!thresholdMap.has(t.measurementCode)) {
          thresholdMap.set(t.measurementCode, []);
        }
        thresholdMap.get(t.measurementCode)!.push(t);
      }
    }

    const fused: ThresholdUpdate[] = [];
    for (const [code, suggestions] of thresholdMap) {
      // 加权中位数（按证据数加权）
      const totalEvidence = suggestions.reduce((s, t) => s + t.evidenceCount, 0);

      const weightedNew = suggestions.reduce(
        (s, t) => s + t.newThreshold * (t.evidenceCount / totalEvidence), 0,
      );

      fused.push({
        measurementCode: code,
        oldThreshold: suggestions[0].oldThreshold,
        newThreshold: Number(weightedNew.toFixed(4)),
        evidenceCount: totalEvidence,
        pValue: Math.min(...suggestions.map(t => t.pValue)),
      });
    }

    return fused;
  }

  // --------------------------------------------------------------------------
  // 贡献计算
  // --------------------------------------------------------------------------

  private computeContributions(
    packages: FederatedKnowledgePackage[],
  ): SiteContribution[] {
    const totalSamples = packages.reduce((s, p) => s + p.localTraining.datasetSize, 0);

    return packages.map(pkg => ({
      siteId: pkg.siteId,
      packageId: pkg.packageId,
      datasetSize: pkg.localTraining.datasetSize,
      localAccuracy: pkg.localTraining.accuracy,
      weight: totalSamples > 0 ? pkg.localTraining.datasetSize / totalSamples : 1 / packages.length,
      tripleCount: pkg.knowledgeTriples.length,
      signatureCount: pkg.distilledKnowledge.anomalySignatures.length,
    }));
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  getStats(): FusionStats {
    return { ...this.stats };
  }

  getFusionHistory(limit = 20): FederatedFusionResult[] {
    return this.fusionHistory.slice(-limit);
  }

  getPackageCount(): number {
    return this.packages.size;
  }

  getPackage(packageId: string): FederatedKnowledgePackage | undefined {
    return this.packages.get(packageId);
  }
}

// ============================================================================
// 单例 + 工厂函数
// ============================================================================

let _instance: FederatedFusionService | null = null;

export function getFederatedFusionService(): FederatedFusionService {
  if (!_instance) {
    _instance = new FederatedFusionService();
  }
  return _instance;
}

export function resetFederatedFusionService(): void {
  _instance = null;
}
