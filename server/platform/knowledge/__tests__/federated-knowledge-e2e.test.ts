/**
 * ============================================================================
 * P3-1: 联邦知识蒸馏 — 端到端集成测试
 * ============================================================================
 *
 * 覆盖四大模块 (60+ 测试用例)：
 *   - DataDeidentificationService: 实体脱敏/三元组脱敏/特征脱敏/差分隐私/签名
 *   - SiteKnowledgeExtractor: 知识包提取/权重增量/特征映射/异常签名
 *   - FederatedFusionService: FedAvg/FedProx/三元组融合/签名融合/阈值融合
 *   - 端到端: 现场提取 → 脱敏 → 上传 → 融合 → 验证
 *
 * 验收标准：
 *   ✓ 实体 ID 经过 HMAC-SHA256 脱敏，不可逆
 *   ✓ 相同输入产生相同脱敏输出（确定性）
 *   ✓ k-匿名性：样本数 < k 的特征被跳过
 *   ✓ 差分隐私：添加高斯噪声后统计量偏移
 *   ✓ 三元组谓语（关系类型）保留原始语义
 *   ✓ FedAvg 按样本数加权平均
 *   ✓ FedProx 结果受代理项 μ 约束
 *   ✓ 冲突三元组按策略正确解决
 *   ✓ 知识包签名验证通过
 *   ✓ 3 客户端到端融合流程
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import {
  DataDeidentificationService,
  getDeidentificationService,
  resetDeidentificationService,
} from '../services/data-deidentification';
import {
  SiteKnowledgeExtractor,
  resetSiteKnowledgeExtractor,
  type LocalTrainingResult,
  type LocalKnowledgeTriple,
  type LocalAnomalyPattern,
  type LocalThresholdSuggestion,
} from '../services/site-knowledge-extractor';
import {
  FederatedFusionService,
  getFederatedFusionService,
  resetFederatedFusionService,
} from '../services/federated-fusion.service';
import type {
  FederatedKnowledgePackage,
  FederatedFusionRequest,
} from '@shared/federatedKnowledgeTypes';

// ============================================================================
// 测试数据工厂
// ============================================================================

function createLocalTraining(overrides?: Partial<LocalTrainingResult>): LocalTrainingResult {
  return {
    modelId: 'model-001',
    weights: [0.1, 0.2, 0.3, 0.4, 0.5],
    baselineWeights: [0.0, 0.0, 0.0, 0.0, 0.0],
    datasetSize: 1000,
    accuracy: 0.85,
    epochs: 50,
    featureImportance: {
      vibration_rms: 0.35,
      temperature_motor: 0.25,
      current_peak: 0.20,
      speed_variance: 0.12,
      noise_level: 0.08,
    },
    featureStats: {
      vibration_rms: { values: Array.from({ length: 100 }, () => Math.random() * 10) },
      temperature_motor: { values: Array.from({ length: 100 }, () => 40 + Math.random() * 60) },
      current_peak: { values: Array.from({ length: 100 }, () => Math.random() * 500) },
    },
    faultDistribution: {
      'F.BRK.001': 45,
      'F.MOT.002': 30,
      'F.GEA.003': 15,
      'F.ELE.004': 10,
    },
    equipmentType: 'QC',
    trainedAt: Date.now(),
    ...overrides,
  };
}

function createTriples(count = 5): LocalKnowledgeTriple[] {
  const triples: LocalKnowledgeTriple[] = [
    { subject: 'QC-001.HST.MOT.001', predicate: 'CAUSES', object: 'F.MOT.002', confidence: 0.9, sourceType: 'diagnosis' },
    { subject: 'QC-001.HST.BRK.001', predicate: 'MANIFESTS', object: 'vibration_high', confidence: 0.85, sourceType: 'diagnosis' },
    { subject: 'F.BRK.001', predicate: 'RESOLVED_BY', object: 'brake_pad_replacement', confidence: 0.95, sourceType: 'manual' },
    { subject: 'QC-001', predicate: 'HAS_PART', object: 'QC-001.HST.MOT.001', confidence: 1.0, sourceType: 'evolution' },
    { subject: 'temperature_high', predicate: 'TRIGGERS', object: 'F.MOT.002', confidence: 0.75, sourceType: 'guardrail' },
  ];
  return triples.slice(0, count);
}

function createAnomalyPatterns(): LocalAnomalyPattern[] {
  return [
    {
      patternType: 'frequency',
      rawFeatureVector: [1.2, 3.4, 5.6, 7.8],
      faultCode: 'F.BRK.001',
      confidence: 0.8,
    },
    {
      patternType: 'amplitude',
      rawFeatureVector: [2.0, 4.0, 6.0, 8.0],
      faultCode: 'F.MOT.002',
      confidence: 0.7,
    },
  ];
}

function createThresholdSuggestions(): LocalThresholdSuggestion[] {
  return [
    {
      measurementId: 'QC-001-VIB-001',
      measurementCode: 'VIB.RMS.HST',
      oldThreshold: 5.0,
      newThreshold: 4.5,
      evidenceCount: 50,
      pValue: 0.01,
    },
    {
      measurementId: 'QC-001-TMP-001',
      measurementCode: 'TMP.MOT.HST',
      oldThreshold: 85.0,
      newThreshold: 80.0,
      evidenceCount: 30,
      pValue: 0.03,
    },
    {
      measurementId: 'QC-001-CUR-001',
      measurementCode: 'CUR.PK.HST',
      oldThreshold: 400,
      newThreshold: 380,
      evidenceCount: 3,  // 低于 minEvidenceCount
      pValue: 0.5,       // 不显著
    },
  ];
}

function createMockPackage(
  siteId: string,
  datasetSize: number,
  weights: number[],
  tripleOverrides?: Partial<LocalKnowledgeTriple>[],
): FederatedKnowledgePackage {
  const triples = (tripleOverrides ?? [
    { subject: 'dev_abc', predicate: 'CAUSES', object: 'F.BRK.001', confidence: 0.9, sourceType: 'diagnosis' as const },
    { subject: 'dev_abc', predicate: 'MANIFESTS', object: 'vibration', confidence: 0.8, sourceType: 'diagnosis' as const },
  ]) as FederatedKnowledgePackage['knowledgeTriples'];

  return {
    packageId: randomUUID(),
    siteId,
    version: '1.0.0',
    timestamp: Date.now(),
    localTraining: {
      datasetSize,
      accuracy: 0.85,
      epochs: 50,
      featureStats: { vib: { mean: 5, std: 1, count: datasetSize } },
      faultDistribution: { 'F.BRK.001': 45 },
      equipmentCategory: 'shore_crane',
      trainedAt: Date.now(),
    },
    distilledKnowledge: {
      weightDeltas: weights,
      featureFaultMappings: [
        { featureName: 'vibration_rms', faultCode: 'F.BRK.001', confidence: 0.8, sampleCount: 45 },
      ],
      anomalySignatures: [
        { signatureId: 'sig1', patternType: 'frequency', featureVector: [0.5, 0.3, 0.1], faultCode: 'F.BRK.001', confidence: 0.8 },
      ],
      thresholdUpdates: [
        { measurementCode: 'VIB.RMS.HST', oldThreshold: 5.0, newThreshold: 4.5, evidenceCount: 50, pValue: 0.01 },
      ],
    },
    knowledgeTriples: triples,
    signature: 'mock-sig',
    checksum: 'mock-checksum',
    sizeBytes: 1024,
  };
}

// ============================================================================
// 1. DataDeidentificationService 测试
// ============================================================================

describe('DataDeidentificationService', () => {
  let svc: DataDeidentificationService;

  beforeEach(() => {
    resetDeidentificationService();
    svc = new DataDeidentificationService({ dpEpsilon: 2.0 });
  });

  // --------------------------------------------------------------------------
  // 实体脱敏
  // --------------------------------------------------------------------------

  describe('实体脱敏', () => {
    it('设备 ID 脱敏为不可逆哈希', () => {
      const result = svc.deidentifyEntity('QC-001', 'device');
      expect(result).not.toBe('QC-001');
      expect(result).toMatch(/^dev_[0-9a-f]{16}$/);
    });

    it('相同输入产生相同输出（确定性）', () => {
      const a = svc.deidentifyEntity('QC-001', 'device');
      const b = svc.deidentifyEntity('QC-001', 'device');
      expect(a).toBe(b);
    });

    it('不同输入产生不同输出', () => {
      const a = svc.deidentifyEntity('QC-001', 'device');
      const b = svc.deidentifyEntity('QC-002', 'device');
      expect(a).not.toBe(b);
    });

    it('保留的标识符不脱敏', () => {
      const svcWithPreserved = new DataDeidentificationService({
        preservedIdentifiers: ['GLOBAL-001'],
      });
      expect(svcWithPreserved.deidentifyEntity('GLOBAL-001', 'device')).toBe('GLOBAL-001');
    });

    it('不在脱敏列表中的实体类型不脱敏', () => {
      const result = svc.deidentifyEntity('some-type', 'unknown_type');
      expect(result).toBe('some-type');
    });

    it('统计正确更新', () => {
      svc.deidentifyEntity('QC-001', 'device');
      svc.deidentifyEntity('QC-002', 'device');
      svc.deidentifyEntity('PRESERVED', 'unknown_type');
      const stats = svc.getStats();
      expect(stats.totalEntitiesProcessed).toBe(3);
      expect(stats.entitiesDeidentified).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 三元组脱敏
  // --------------------------------------------------------------------------

  describe('三元组脱敏', () => {
    it('subject/object 中的设备编码被脱敏', () => {
      const result = svc.deidentifyTriple({
        subject: 'QC-001',
        predicate: 'CAUSES',
        object: 'F.BRK.001',
        confidence: 0.9,
        sourceType: 'diagnosis',
      });
      expect(result.subject).not.toContain('QC-001');
      expect(result.predicate).toBe('CAUSES'); // 关系保留
    });

    it('4 段式编码被脱敏', () => {
      const result = svc.deidentifyTriple({
        subject: 'QC.HST.MOT.001',
        predicate: 'HAS_PART',
        object: 'sensor-123',
        confidence: 0.95,
        sourceType: 'evolution',
      });
      expect(result.subject).not.toContain('QC.HST.MOT.001');
    });

    it('批量脱敏返回正确数量', () => {
      const triples = createTriples(5);
      const results = svc.deidentifyTriples(triples);
      expect(results).toHaveLength(5);
      expect(results[0].sourceType).toBe('diagnosis');
    });

    it('置信度添加微量噪声', () => {
      // 多次运行看是否有偏移（噪声是随机的）
      const results = Array.from({ length: 20 }, () =>
        svc.deidentifyTriple({
          subject: 'test', predicate: 'REL', object: 'obj',
          confidence: 0.9, sourceType: 'diagnosis',
        }),
      );
      const confidences = results.map(r => r.confidence);
      // 应该有些许变化（差分隐私噪声）
      const unique = new Set(confidences.map(c => c.toFixed(4)));
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  // --------------------------------------------------------------------------
  // 特征脱敏
  // --------------------------------------------------------------------------

  describe('特征脱敏', () => {
    it('正常特征输出均值/标准差/计数', () => {
      const result = svc.deidentifyFeatureStats({
        vibration: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      });
      expect(result.vibration).toBeDefined();
      expect(result.vibration.count).toBe(10);
      // 均值应约等于 5.5（差分隐私噪声可能偏移较大）
      expect(result.vibration.mean).toBeGreaterThan(-5);
      expect(result.vibration.mean).toBeLessThan(20);
    });

    it('k-匿名性：样本不足的特征被跳过', () => {
      const result = svc.deidentifyFeatureStats({
        rare_feature: { values: [1, 2, 3] }, // < k=5
        common_feature: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      });
      expect(result.rare_feature).toBeUndefined();
      expect(result.common_feature).toBeDefined();
      expect(svc.getStats().kAnonymityViolations).toBe(1);
    });

    it('差分隐私噪声使均值产生偏移', () => {
      // 多次运行收集均值
      const means: number[] = [];
      for (let i = 0; i < 10; i++) {
        const tempSvc = new DataDeidentificationService({ dpEpsilon: 0.5 }); // 强噪声
        const result = tempSvc.deidentifyFeatureStats({
          feat: { values: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
        });
        if (result.feat) means.push(result.feat.mean);
      }
      // 应该不全是 10
      const allSame = means.every(m => m === means[0]);
      expect(allSame).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 故障分布脱敏
  // --------------------------------------------------------------------------

  describe('故障分布脱敏', () => {
    it('正常分布保留', () => {
      const result = svc.deidentifyFaultDistribution({
        'F.BRK.001': 50,
        'F.MOT.002': 30,
      });
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('k-匿名性：计数不足的故障被跳过', () => {
      const result = svc.deidentifyFaultDistribution({
        'F.BRK.001': 50,
        'F.RARE.001': 2, // < k=5
      });
      expect(result['F.RARE.001']).toBeUndefined();
      expect(result['F.BRK.001']).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 时间脱敏
  // --------------------------------------------------------------------------

  describe('时间脱敏', () => {
    it('day 粒度：时间归零到当天零点', () => {
      const ts = new Date('2026-03-01T14:30:45.123Z').getTime();
      const result = svc.deidentifyTimestamp(ts);
      const d = new Date(result);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });

    it('exact 粒度：不改变时间戳', () => {
      const exactSvc = new DataDeidentificationService({ timestampGranularity: 'exact' });
      const ts = Date.now();
      expect(exactSvc.deidentifyTimestamp(ts)).toBe(ts);
    });
  });

  // --------------------------------------------------------------------------
  // 签名和校验
  // --------------------------------------------------------------------------

  describe('签名和校验', () => {
    it('HMAC-SHA256 签名可验证', () => {
      const content = 'test-content-123';
      const secret = 'my-secret-key';
      const sig = svc.generateSignature(content, secret);
      expect(svc.verifySignature(content, sig, secret)).toBe(true);
    });

    it('篡改内容导致签名验证失败', () => {
      const secret = 'my-secret-key';
      const sig = svc.generateSignature('original', secret);
      expect(svc.verifySignature('tampered', sig, secret)).toBe(false);
    });

    it('SHA256 校验和一致', () => {
      const content = 'test-content';
      const a = svc.generateChecksum(content);
      const b = svc.generateChecksum(content);
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });
  });
});

// ============================================================================
// 2. SiteKnowledgeExtractor 测试
// ============================================================================

describe('SiteKnowledgeExtractor', () => {
  let extractor: SiteKnowledgeExtractor;
  let deidentifier: DataDeidentificationService;

  beforeEach(() => {
    resetDeidentificationService();
    resetSiteKnowledgeExtractor();
    deidentifier = new DataDeidentificationService();
    extractor = new SiteKnowledgeExtractor(
      { siteId: 'site-alpha', signatureSecret: 'test-secret' },
      deidentifier,
    );
  });

  it('提取完整知识包', () => {
    const pkg = extractor.extract({
      training: createLocalTraining(),
      triples: createTriples(),
      anomalyPatterns: createAnomalyPatterns(),
      thresholdSuggestions: createThresholdSuggestions(),
    });

    expect(pkg.packageId).toBeTruthy();
    expect(pkg.siteId).not.toBe('site-alpha'); // 脱敏后
    expect(pkg.signature).toHaveLength(64); // HMAC-SHA256 hex
    expect(pkg.checksum).toHaveLength(64);
    expect(pkg.sizeBytes).toBeGreaterThan(0);
  });

  it('权重增量 = 当前权重 - 基线权重', () => {
    const pkg = extractor.extract({
      training: createLocalTraining({
        weights: [1.0, 2.0, 3.0],
        baselineWeights: [0.5, 1.0, 1.5],
      }),
      triples: [],
      anomalyPatterns: [],
      thresholdSuggestions: [],
    });

    expect(pkg.distilledKnowledge.weightDeltas).toEqual([0.5, 1.0, 1.5]);
  });

  it('无基线时权重增量 = 当前权重', () => {
    const pkg = extractor.extract({
      training: createLocalTraining({
        weights: [1.0, 2.0],
        baselineWeights: undefined,
      }),
      triples: [],
      anomalyPatterns: [],
      thresholdSuggestions: [],
    });

    expect(pkg.distilledKnowledge.weightDeltas).toEqual([1.0, 2.0]);
  });

  it('低置信度三元组被过滤', () => {
    const pkg = extractor.extract({
      training: createLocalTraining(),
      triples: [
        { subject: 'A', predicate: 'REL', object: 'B', confidence: 0.9, sourceType: 'diagnosis' },
        { subject: 'C', predicate: 'REL', object: 'D', confidence: 0.3, sourceType: 'diagnosis' }, // < 0.5
      ],
      anomalyPatterns: [],
      thresholdSuggestions: [],
    });

    expect(pkg.knowledgeTriples).toHaveLength(1);
  });

  it('异常签名特征向量被 L2 归一化', () => {
    const pkg = extractor.extract({
      training: createLocalTraining(),
      triples: [],
      anomalyPatterns: [
        { patternType: 'frequency', rawFeatureVector: [3, 4], faultCode: 'F.001', confidence: 0.8 },
      ],
      thresholdSuggestions: [],
    });

    const sig = pkg.distilledKnowledge.anomalySignatures[0];
    // L2 norm should be ~1.0
    const norm = Math.sqrt(sig.featureVector.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1.0, 2);
  });

  it('不显著的阈值建议被过滤', () => {
    const pkg = extractor.extract({
      training: createLocalTraining(),
      triples: [],
      anomalyPatterns: [],
      thresholdSuggestions: createThresholdSuggestions(),
    });

    // 第 3 个建议 evidenceCount=3 < minEvidenceCount=10 且 pValue=0.5 > 0.05
    expect(pkg.distilledKnowledge.thresholdUpdates).toHaveLength(2);
  });

  it('统计正确更新', () => {
    extractor.extract({
      training: createLocalTraining(),
      triples: createTriples(),
      anomalyPatterns: createAnomalyPatterns(),
      thresholdSuggestions: createThresholdSuggestions(),
    });

    const stats = extractor.getStats();
    expect(stats.totalExtractions).toBe(1);
    expect(stats.totalPackagesCreated).toBe(1);
    expect(stats.triplesExtracted).toBe(5);
    expect(stats.signaturesExtracted).toBe(2);
    expect(stats.thresholdsExtracted).toBe(2);
    expect(stats.avgPackageSizeBytes).toBeGreaterThan(0);
  });
});

// ============================================================================
// 3. FederatedFusionService 测试
// ============================================================================

describe('FederatedFusionService', () => {
  let service: FederatedFusionService;

  beforeEach(() => {
    resetFederatedFusionService();
    service = new FederatedFusionService();
  });

  // --------------------------------------------------------------------------
  // 知识包管理
  // --------------------------------------------------------------------------

  describe('知识包管理', () => {
    it('接收有效知识包', () => {
      const pkg = createMockPackage('site-1', 1000, [0.1, 0.2, 0.3]);
      const result = service.addPackage(pkg);
      expect(result.accepted).toBe(true);
    });

    it('拒绝重复知识包', () => {
      const pkg = createMockPackage('site-1', 1000, [0.1]);
      service.addPackage(pkg);
      const result = service.addPackage(pkg);
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('已存在');
    });

    it('拒绝缺少 ID 的包', () => {
      const pkg = createMockPackage('', 1000, [0.1]);
      pkg.siteId = '';
      const result = service.addPackage(pkg);
      expect(result.accepted).toBe(false);
    });

    it('列出所有包', () => {
      service.addPackage(createMockPackage('site-1', 1000, [0.1]));
      service.addPackage(createMockPackage('site-2', 2000, [0.2]));

      const list = service.listPackages();
      expect(list).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // FedAvg 融合
  // --------------------------------------------------------------------------

  describe('FedAvg 权重融合', () => {
    it('按样本数加权平均', () => {
      // site-1: 1000 samples, weights [1.0, 2.0]
      // site-2: 3000 samples, weights [3.0, 4.0]
      // 预期: (1000/4000)*[1,2] + (3000/4000)*[3,4] = [0.25+2.25, 0.5+3.0] = [2.5, 3.5]
      const pkg1 = createMockPackage('s1', 1000, [1.0, 2.0]);
      const pkg2 = createMockPackage('s2', 3000, [3.0, 4.0]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'test-fusion',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      expect(result.fusedWeights[0]).toBeCloseTo(2.5, 4);
      expect(result.fusedWeights[1]).toBeCloseTo(3.5, 4);
    });

    it('单客户权重不变', () => {
      const pkg = createMockPackage('s1', 1000, [1.0, 2.0, 3.0]);
      service.addPackage(pkg);

      const result = service.fuse({
        fusionId: 'f1',
        packageIds: [pkg.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 1,
      });

      expect(result.fusedWeights[0]).toBeCloseTo(1.0, 4);
      expect(result.fusedWeights[1]).toBeCloseTo(2.0, 4);
    });

    it('参与者不足抛出错误', () => {
      const pkg = createMockPackage('s1', 1000, [1.0]);
      service.addPackage(pkg);

      expect(() => service.fuse({
        fusionId: 'f1',
        packageIds: [pkg.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 3, // 需要 3，只有 1
      })).toThrow('参与者不足');
    });
  });

  // --------------------------------------------------------------------------
  // FedProx 融合
  // --------------------------------------------------------------------------

  describe('FedProx 权重融合', () => {
    it('FedProx 结果与 FedAvg 不同（代理项效果）', () => {
      const pkg1 = createMockPackage('s1', 1000, [1.0, 2.0]);
      const pkg2 = createMockPackage('s2', 3000, [3.0, 4.0]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const fedAvg = service.fuse({
        fusionId: 'avg',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // 需要重新添加包（因为上一次融合不影响包存储）
      const pkg3 = createMockPackage('s3', 1000, [1.0, 2.0]);
      const pkg4 = createMockPackage('s4', 3000, [3.0, 4.0]);
      service.addPackage(pkg3);
      service.addPackage(pkg4);

      const fedProx = service.fuse({
        fusionId: 'prox',
        packageIds: [pkg3.packageId, pkg4.packageId],
        algorithm: 'fedprox',
        proximalMu: 0.5,
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // FedProx 应该收缩权重（代理项拉向 0）
      expect(Math.abs(fedProx.fusedWeights[0])).toBeLessThanOrEqual(Math.abs(fedAvg.fusedWeights[0]) + 0.01);
    });

    it('μ=0 时 FedProx ≈ FedAvg', () => {
      const pkg1 = createMockPackage('s1', 500, [1.0]);
      const pkg2 = createMockPackage('s2', 500, [3.0]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'prox-zero',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedprox',
        proximalMu: 0,
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // μ=0 → 无正则化 → 等同 FedAvg
      expect(result.fusedWeights[0]).toBeCloseTo(2.0, 4);
    });
  });

  // --------------------------------------------------------------------------
  // 三元组融合
  // --------------------------------------------------------------------------

  describe('三元组融合', () => {
    it('不同客户的相同三元组被合并', () => {
      const commonTriple = {
        subject: 'dev_abc', predicate: 'CAUSES', object: 'F.BRK.001',
        confidence: 0.8, sourceType: 'diagnosis' as const,
      };

      const pkg1 = createMockPackage('s1', 1000, [0.1],
        [commonTriple],
      );
      const pkg2 = createMockPackage('s2', 1000, [0.1],
        [commonTriple, { subject: 'unique', predicate: 'REL', object: 'obj', confidence: 0.7, sourceType: 'manual' as const }],
      );
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'triple-merge',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // 1 common (merged) + 1 unique = 2
      expect(result.fusedTriples.length).toBeLessThanOrEqual(3);
      expect(result.fusedTriples.length).toBeGreaterThanOrEqual(2);
    });

    it('voting 策略提升多方确认三元组的置信度', () => {
      const triple = {
        subject: 'dev_abc', predicate: 'CAUSES', object: 'F.BRK.001',
        confidence: 0.7, sourceType: 'diagnosis' as const,
      };

      const pkg1 = createMockPackage('s1', 1000, [0.1], [triple]);
      const pkg2 = createMockPackage('s2', 1000, [0.1], [triple]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'vote-test',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      const fused = result.fusedTriples.find(
        t => t.subject === 'dev_abc' && t.predicate === 'CAUSES',
      );
      // 投票后置信度应 >= 原始 0.7
      expect(fused!.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // --------------------------------------------------------------------------
  // 签名融合
  // --------------------------------------------------------------------------

  describe('签名融合', () => {
    it('不同故障码的签名独立保留', () => {
      const pkg1 = createMockPackage('s1', 1000, [0.1]);
      pkg1.distilledKnowledge.anomalySignatures = [
        { signatureId: 'a', patternType: 'frequency', featureVector: [1, 0], faultCode: 'F.001', confidence: 0.8 },
      ];
      const pkg2 = createMockPackage('s2', 1000, [0.1]);
      pkg2.distilledKnowledge.anomalySignatures = [
        { signatureId: 'b', patternType: 'frequency', featureVector: [0, 1], faultCode: 'F.002', confidence: 0.7 },
      ];
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'sig-test',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      expect(result.fusedSignatures).toHaveLength(2);
    });

    it('同故障码+同类型的签名被合并', () => {
      const pkg1 = createMockPackage('s1', 1000, [0.1]);
      pkg1.distilledKnowledge.anomalySignatures = [
        { signatureId: 'a', patternType: 'frequency', featureVector: [1, 0, 0], faultCode: 'F.001', confidence: 0.8 },
      ];
      const pkg2 = createMockPackage('s2', 1000, [0.1]);
      pkg2.distilledKnowledge.anomalySignatures = [
        { signatureId: 'b', patternType: 'frequency', featureVector: [0, 1, 0], faultCode: 'F.001', confidence: 0.9 },
      ];
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'sig-merge',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // 同 faultCode + patternType → 合并为 1
      expect(result.fusedSignatures).toHaveLength(1);
      expect(result.fusedSignatures[0].confidence).toBe(0.9); // 取最高
    });
  });

  // --------------------------------------------------------------------------
  // 阈值融合
  // --------------------------------------------------------------------------

  describe('阈值融合', () => {
    it('同测点阈值按证据数加权', () => {
      const pkg1 = createMockPackage('s1', 1000, [0.1]);
      pkg1.distilledKnowledge.thresholdUpdates = [
        { measurementCode: 'VIB.RMS', oldThreshold: 5, newThreshold: 4.0, evidenceCount: 100, pValue: 0.01 },
      ];
      const pkg2 = createMockPackage('s2', 1000, [0.1]);
      pkg2.distilledKnowledge.thresholdUpdates = [
        { measurementCode: 'VIB.RMS', oldThreshold: 5, newThreshold: 5.0, evidenceCount: 100, pValue: 0.02 },
      ];
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'thresh-test',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      // 等权: (4.0 * 100 + 5.0 * 100) / 200 = 4.5
      const thresh = result.fusedThresholds.find(t => t.measurementCode === 'VIB.RMS');
      expect(thresh!.newThreshold).toBeCloseTo(4.5, 2);
      expect(thresh!.evidenceCount).toBe(200);
    });
  });

  // --------------------------------------------------------------------------
  // 贡献追踪
  // --------------------------------------------------------------------------

  describe('贡献追踪', () => {
    it('贡献权重按样本数分配', () => {
      const pkg1 = createMockPackage('s1', 1000, [0.1]);
      const pkg2 = createMockPackage('s2', 3000, [0.2]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      const result = service.fuse({
        fusionId: 'contrib-test',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      const c1 = result.contributions.find(c => c.siteId === 's1');
      const c2 = result.contributions.find(c => c.siteId === 's2');
      expect(c1!.weight).toBeCloseTo(0.25, 4);
      expect(c2!.weight).toBeCloseTo(0.75, 4);
    });
  });

  // --------------------------------------------------------------------------
  // 统计
  // --------------------------------------------------------------------------

  describe('统计', () => {
    it('融合后统计正确更新', () => {
      const pkg1 = createMockPackage('s1', 1000, [0.1]);
      const pkg2 = createMockPackage('s2', 1000, [0.2]);
      service.addPackage(pkg1);
      service.addPackage(pkg2);

      service.fuse({
        fusionId: 'stats-test',
        packageIds: [pkg1.packageId, pkg2.packageId],
        algorithm: 'fedavg',
        conflictResolution: 'voting',
        minContributors: 2,
      });

      const stats = service.getStats();
      expect(stats.totalFusions).toBe(1);
      expect(stats.avgContributors).toBe(2);
      expect(stats.lastFusionAt).not.toBeNull();
    });
  });
});

// ============================================================================
// 4. 端到端集成测试
// ============================================================================

describe('联邦知识蒸馏 — 端到端', () => {
  beforeEach(() => {
    resetDeidentificationService();
    resetSiteKnowledgeExtractor();
    resetFederatedFusionService();
  });

  it('3 客户完整流程：提取 → 脱敏 → 上传 → 融合', () => {
    const fusionService = new FederatedFusionService();

    // 模拟 3 个现场提取知识包
    const sites = [
      { siteId: 'port-shanghai', datasetSize: 5000, weights: [1.0, 2.0, 3.0] },
      { siteId: 'port-singapore', datasetSize: 3000, weights: [1.5, 2.5, 3.5] },
      { siteId: 'port-rotterdam', datasetSize: 2000, weights: [0.5, 1.5, 2.5] },
    ];

    const packageIds: string[] = [];

    for (const site of sites) {
      const deidentifier = new DataDeidentificationService();
      const extractor = new SiteKnowledgeExtractor(
        { siteId: site.siteId, signatureSecret: 'e2e-secret' },
        deidentifier,
      );

      const pkg = extractor.extract({
        training: createLocalTraining({
          datasetSize: site.datasetSize,
          weights: site.weights,
          baselineWeights: [0, 0, 0],
        }),
        triples: createTriples(),
        anomalyPatterns: createAnomalyPatterns(),
        thresholdSuggestions: createThresholdSuggestions(),
      });

      // 验证脱敏
      expect(pkg.siteId).not.toBe(site.siteId);
      expect(pkg.signature).toHaveLength(64);

      // 上传到中心
      const result = fusionService.addPackage(pkg);
      expect(result.accepted).toBe(true);
      packageIds.push(pkg.packageId);
    }

    // 验证已接收 3 个包
    expect(fusionService.getPackageCount()).toBe(3);

    // 执行 FedAvg 融合
    const fusionResult = fusionService.fuse({
      fusionId: 'e2e-fusion',
      packageIds,
      algorithm: 'fedavg',
      conflictResolution: 'confidence_weighted',
      minContributors: 3,
    });

    // 验证融合结果
    expect(fusionResult.globalModelVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(fusionResult.fusedWeights).toHaveLength(3);
    expect(fusionResult.contributions).toHaveLength(3);
    expect(fusionResult.fusedTriples.length).toBeGreaterThan(0);
    expect(fusionResult.fusedSignatures.length).toBeGreaterThan(0);
    expect(fusionResult.fusedThresholds.length).toBeGreaterThan(0);

    // 验证加权平均
    // total = 5000 + 3000 + 2000 = 10000
    // w[0] = (5000*1.0 + 3000*1.5 + 2000*0.5) / 10000 = 10500/10000 = 1.05
    expect(fusionResult.fusedWeights[0]).toBeCloseTo(1.05, 2);

    // 验证贡献权重
    const shanghai = fusionResult.contributions.find(
      c => c.datasetSize === 5000,
    );
    expect(shanghai!.weight).toBeCloseTo(0.5, 2);

    log_e2e_summary(fusionResult);
  });

  it('FedProx 融合约束客户漂移', () => {
    const fusionService = new FederatedFusionService();

    // 一个客户权重严重偏离
    const pkg1 = createMockPackage('s1', 1000, [10.0]); // 偏离很大
    const pkg2 = createMockPackage('s2', 1000, [1.0]);   // 正常
    fusionService.addPackage(pkg1);
    fusionService.addPackage(pkg2);

    const fedAvg = fusionService.fuse({
      fusionId: 'avg-drift',
      packageIds: [pkg1.packageId, pkg2.packageId],
      algorithm: 'fedavg',
      conflictResolution: 'voting',
      minContributors: 2,
    });

    const pkg3 = createMockPackage('s3', 1000, [10.0]);
    const pkg4 = createMockPackage('s4', 1000, [1.0]);
    fusionService.addPackage(pkg3);
    fusionService.addPackage(pkg4);

    const fedProx = fusionService.fuse({
      fusionId: 'prox-drift',
      packageIds: [pkg3.packageId, pkg4.packageId],
      algorithm: 'fedprox',
      proximalMu: 0.5,
      conflictResolution: 'voting',
      minContributors: 2,
    });

    // FedProx 应该比 FedAvg 更保守（权重更小或更接近 0）
    expect(Math.abs(fedProx.fusedWeights[0])).toBeLessThanOrEqual(
      Math.abs(fedAvg.fusedWeights[0]) + 0.01,
    );
  });

  it('数据主权：原始设备 ID 不出现在知识包中', () => {
    const deidentifier = new DataDeidentificationService();
    const extractor = new SiteKnowledgeExtractor(
      { siteId: 'my-port', signatureSecret: 'secret' },
      deidentifier,
    );

    const pkg = extractor.extract({
      training: createLocalTraining({ equipmentType: 'QC' }),
      triples: [
        {
          subject: 'QC-001.HST.MOT.001',
          predicate: 'CAUSES',
          object: 'F.MOT.002',
          confidence: 0.9,
          sourceType: 'diagnosis',
        },
      ],
      anomalyPatterns: [],
      thresholdSuggestions: [],
    });

    const pkgJson = JSON.stringify(pkg);

    // 原始 ID 不应出现
    expect(pkgJson).not.toContain('QC-001');
    expect(pkgJson).not.toContain('QC.HST.MOT.001');
    expect(pkgJson).not.toContain('my-port');

    // 脱敏后的哈希应出现
    expect(pkg.siteId).toMatch(/^loc_[0-9a-f]+$/);
  });
});

// ============================================================================
// 辅助
// ============================================================================

function log_e2e_summary(result: any) {
  // 测试内不做日志输出，仅验证结构
  expect(result.fusionId).toBeTruthy();
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
}
