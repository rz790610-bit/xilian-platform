/**
 * ============================================================================
 * P1-3: 进化飞轮 MVP — 端到端测试
 * ============================================================================
 *
 * 验收标准映射:
 *   AC-1: 10 条诊断历史 → 模式发现输出至少 1 个物理模式（5 大模式之一）
 *   AC-2: 知识结晶创建成功：hde_knowledge_crystals 表有记录，status = 'draft'(pending)
 *   AC-3: 结晶审核通过后 status = 'approved'，自动触发影子评估
 *   AC-4: 影子评估输出 5 维度指标，每个维度有明确的 improve/degrade/neutral 判定
 *   AC-5: 灰度 Shadow 阶段(0% 流量)持续 24h，无错误 → 自动推进到 Canary(5%)
 *   AC-6: 回滚测试：Canary 阶段错误率 > 5% → 自动回滚到 Shadow
 *   AC-7: ChampionChallengerManager 状态重启后从 Redis 恢复，不丢失
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  FlywheelPersistenceService,
  type RedisAdapter,
  type MySQLAdapter,
  type CrystalDBRecord,
  type ShadowEvalDBRecord,
  type ChampionExperimentDBRecord,
} from '../flywheel-persistence.service';
import type { DiagnosisHistoryEntry } from '../../crystallization/knowledge-crystallizer';
import type { ModelCandidate, EvaluationDataPoint } from '../../shadow/shadow-evaluator';

// ============================================================================
// Mock Redis — 内存实现
// ============================================================================

class MockRedis implements RedisAdapter {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** 测试工具: 获取所有 key */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /** 测试工具: 清空 */
  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// Mock MySQL — 内存实现
// ============================================================================

class MockMySQL implements MySQLAdapter {
  crystals: CrystalDBRecord[] = [];
  evalRecords: ShadowEvalDBRecord[] = [];
  experiments: ChampionExperimentDBRecord[] = [];
  private nextId = 1;

  async insertCrystal(record: CrystalDBRecord): Promise<number> {
    this.crystals.push({ ...record });
    return this.nextId++;
  }

  async updateCrystalStatus(crystalId: string, status: string, verifiedBy?: string): Promise<void> {
    const crystal = this.crystals.find(c => c.crystalId === crystalId);
    if (crystal) {
      crystal.verificationStatus = status as CrystalDBRecord['verificationStatus'];
    }
  }

  async getCrystalsByStatus(status: string): Promise<CrystalDBRecord[]> {
    return this.crystals.filter(c => c.verificationStatus === status);
  }

  async insertShadowEvalRecord(record: ShadowEvalDBRecord): Promise<number> {
    this.evalRecords.push({ ...record });
    return this.nextId++;
  }

  async insertChampionExperiment(record: ChampionExperimentDBRecord): Promise<number> {
    this.experiments.push({ ...record });
    return this.nextId++;
  }

  async updateChampionExperiment(planId: string, updates: Partial<ChampionExperimentDBRecord>): Promise<void> {
    const exp = this.experiments.find(e => e.planId === planId);
    if (exp) Object.assign(exp, updates);
  }
}

// ============================================================================
// 测试数据工厂
// ============================================================================

/** 生成 10 条含物理特征的诊断历史 */
function createDiagnosisHistory(count: number = 10): DiagnosisHistoryEntry[] {
  const history: DiagnosisHistoryEntry[] = [];
  const baseTime = Date.now() - count * 3600_000;

  for (let i = 0; i < count; i++) {
    // 前 6 条: 高风+偏心场景（满足模式1触发条件: windSpeed>9, eccentricity>0.3, 且 >=5 条）
    const isHighWind = i < 6;
    // 后 4 条: 正常工况
    history.push({
      reportId: `report-${String(i + 1).padStart(3, '0')}`,
      machineId: 'STS-65-SH-001',
      timestamp: baseTime + i * 3600_000,
      cyclePhase: isHighWind ? 'storm' : 'normal',
      safetyScore: isHighWind ? 0.65 : 0.9,
      healthScore: isHighWind ? 0.55 : 0.85,
      efficiencyScore: isHighWind ? 0.7 : 0.88,
      overallScore: isHighWind ? 0.6 : 0.87,
      riskLevel: isHighWind ? 'high' : 'low',
      keyMetrics: {
        windSpeedMean: isHighWind ? 11 + Math.random() * 3 : 4 + Math.random() * 3,
        loadEccentricity: isHighWind ? 0.35 + Math.random() * 0.1 : 0.1 + Math.random() * 0.1,
        fatigueIncrement: isHighWind ? 2.8 + Math.random() * 0.5 : 1.0 + Math.random() * 0.2,
        temperatureBearing: isHighWind ? 62 : 45,
        vibrationRms: isHighWind ? 2.5 : 1.2,
        loadWeight: isHighWind ? 35 : 20,
      },
      recommendations: [{
        priority: isHighWind ? 'high' : 'low',
        action: isHighWind ? '降低作业频率，加密监测' : '按计划维护',
      }],
    });
  }

  return history;
}

/** 创建模型候选 */
function createModelCandidate(id: string, version: string, quality: 'good' | 'bad' = 'good'): ModelCandidate {
  return {
    modelId: id,
    modelVersion: version,
    modelType: 'prediction',
    description: `Model ${id}:${version}`,
    parameters: {},
    createdAt: Date.now(),
    predict: async (input: Record<string, number>) => {
      // 模拟预测: good 模型误差小, bad 模型误差大
      const result: Record<string, number> = {};
      for (const [key, val] of Object.entries(input)) {
        const noise = quality === 'good' ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * 0.5;
        result[key] = val + noise;
      }
      // 异常检测
      result['isAnomaly'] = input['isAnomaly'] ?? 0;
      result['overturningRisk'] = input['overturningRisk'] ?? 0;
      return result;
    },
  };
}

/** 创建评估数据集 */
function createDataset(size: number = 50): EvaluationDataPoint[] {
  return Array.from({ length: size }, (_, i) => ({
    timestamp: Date.now() - (size - i) * 60_000,
    input: {
      temperature: 50 + Math.random() * 20,
      vibration: 1.0 + Math.random() * 2.0,
      current: 80 + Math.random() * 40,
      isAnomaly: i % 5 === 0 ? 1 : 0,
      overturningRisk: i % 20 === 0 ? 0.3 : 0.05,
    },
    actualOutput: {
      temperature: 50 + Math.random() * 20,
      vibration: 1.0 + Math.random() * 2.0,
      current: 80 + Math.random() * 40,
      isAnomaly: i % 5 === 0 ? 1 : 0,
      overturningRisk: i % 20 === 0 ? 0.3 : 0.05,
    },
    metadata: { scenario: i % 3 === 0 ? 'storm' : 'normal' },
  }));
}

// ============================================================================
// 测试
// ============================================================================

describe('P1-3: 进化飞轮 MVP', () => {
  let redis: MockRedis;
  let mysql: MockMySQL;
  let service: FlywheelPersistenceService;

  beforeEach(() => {
    redis = new MockRedis();
    mysql = new MockMySQL();
    service = new FlywheelPersistenceService({ redis, mysql });
  });

  // ==========================================================================
  // AC-1: 10 条诊断历史 → 模式发现输出至少 1 个物理模式
  // ==========================================================================

  describe('AC-1: 模式发现', () => {
    test('10 条诊断历史 → 发现至少 1 个物理模式', async () => {
      const history = createDiagnosisHistory(10);
      const { patterns, persistedCount } = await service.discoverAndPersistPatterns(history);

      // 至少发现 1 个模式
      expect(patterns.length).toBeGreaterThanOrEqual(1);

      // 验证是 5 大物理模式之一
      const knownPatterns = [
        '高风偏心疲劳加速',     // 模式1
        '轴承联合退化',         // 模式2
        '重载效率下降',         // 模式3
        '高湿腐蚀加速',         // 模式4
      ];
      const foundNames = patterns.map(p => p.name);
      const hasKnownPattern = foundNames.some(n => knownPatterns.some(kn => n.includes(kn)));
      expect(hasKnownPattern).toBe(true);

      // 模式有物理解释
      for (const pattern of patterns) {
        expect(pattern.consequences.length).toBeGreaterThan(0);
        expect(pattern.consequences[0].physicalExplanation).toBeTruthy();
      }
    });

    test('发现的模式包含高风+偏心→疲劳加速', async () => {
      const history = createDiagnosisHistory(15);
      const { patterns } = await service.discoverAndPersistPatterns(history);

      const windPattern = patterns.find(p => p.name.includes('风'));
      expect(windPattern).toBeDefined();
      expect(windPattern!.conditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'windSpeedMean', operator: 'gt', value: 9 }),
          expect.objectContaining({ field: 'loadEccentricity', operator: 'gt', value: 0.3 }),
        ])
      );
      expect(windPattern!.confidence).toBeGreaterThan(0.3);
      expect(windPattern!.support).toBeGreaterThan(0);
    });

    test('模式发现结果写入 MySQL', async () => {
      const history = createDiagnosisHistory(10);
      const { patterns, persistedCount } = await service.discoverAndPersistPatterns(history);

      expect(persistedCount).toBe(patterns.length);
      expect(mysql.crystals.length).toBe(patterns.length);

      for (const dbRecord of mysql.crystals) {
        expect(dbRecord.source).toBe('diagnosis_history');
        expect(dbRecord.physicsExplanation).toBeTruthy();
        expect(dbRecord.applicableScenarios).toContain('port_crane');
      }
    });
  });

  // ==========================================================================
  // AC-2: 知识结晶创建成功，status = 'draft' (pending)
  // ==========================================================================

  describe('AC-2: 知识结晶创建', () => {
    test('结晶记录写入 DB，status = pending (draft)', async () => {
      const history = createDiagnosisHistory(10);
      await service.discoverAndPersistPatterns(history);

      // 所有模式记录的初始状态应为 pending
      for (const crystal of mysql.crystals) {
        expect(crystal.verificationStatus).toBe('pending');
      }
    });

    test('结晶包含完整字段', async () => {
      const history = createDiagnosisHistory(10);
      const { patterns } = await service.discoverAndPersistPatterns(history);

      // 执行结晶
      const patternId = patterns[0].patternId;
      const crystal = await service.crystallizeAndPersist(patternId, 'guardrail_rule');

      expect(crystal).not.toBeNull();
      expect(crystal!.type).toBe('guardrail_rule');
      expect(crystal!.content).toBeDefined();
      expect((crystal!.content as { ruleId?: string }).ruleId).toBeTruthy();
    });

    test('runDiscoveryPipeline 自动发现 + 结晶', async () => {
      const history = createDiagnosisHistory(10);
      const result = await service.runDiscoveryPipeline(history);

      expect(result.patternsFound).toBeGreaterThanOrEqual(1);
      expect(result.crystalsCreated).toBeGreaterThanOrEqual(1);
      expect(result.patternIds.length).toBe(result.patternsFound);

      // MySQL 中应有模式记录(discovery) + 结晶记录(crystallize)
      expect(mysql.crystals.length).toBe(result.patternsFound + result.crystalsCreated);
    });
  });

  // ==========================================================================
  // AC-3: 审核通过后 status = 'approved'
  // ==========================================================================

  describe('AC-3: 审核通过', () => {
    test('审核通过后 status 变为 approved', async () => {
      const history = createDiagnosisHistory(10);
      const { patterns } = await service.discoverAndPersistPatterns(history);
      const patternId = patterns[0].patternId;

      // 审核通过
      const result = await service.approvePatternAndTriggerShadow(patternId, '王主任');
      expect(result.approved).toBe(true);

      // MySQL 中 status 应更新
      const dbCrystal = mysql.crystals.find(c => c.crystalId === patternId);
      expect(dbCrystal?.verificationStatus).toBe('approved');

      // 内存中 pattern.status 也应更新
      const allPatterns = service.getPatterns();
      const pattern = allPatterns.find(p => p.patternId === patternId);
      expect(pattern?.status).toBe('approved');
    });
  });

  // ==========================================================================
  // AC-4: 影子评估输出 5 维度指标
  // ==========================================================================

  describe('AC-4: 影子评估 5 维度', () => {
    test('评估输出包含 5 个维度指标', async () => {
      const challenger = createModelCandidate('model-v2', 'v2.0', 'good');
      const champion = createModelCandidate('model-v1', 'v1.0', 'good');
      const dataset = createDataset(30);

      const report = await service.evaluateAndPersist(challenger, champion, dataset);

      // 5 维度指标
      expect(report.challengerMetrics.accuracy).toBeDefined();
      expect(report.challengerMetrics.accuracy.mae).toBeGreaterThanOrEqual(0);
      expect(report.challengerMetrics.accuracy.rmse).toBeGreaterThanOrEqual(0);
      expect(report.challengerMetrics.accuracy.r2).toBeDefined();

      expect(report.challengerMetrics.anomalyDetection).toBeDefined();
      expect(report.challengerMetrics.anomalyDetection.f1).toBeGreaterThanOrEqual(0);

      expect(report.challengerMetrics.latency).toBeDefined();
      expect(report.challengerMetrics.latency.p50Ms).toBeGreaterThanOrEqual(0);
      expect(report.challengerMetrics.latency.p95Ms).toBeGreaterThanOrEqual(0);

      expect(report.challengerMetrics.resource).toBeDefined();

      expect(report.challengerMetrics.safety).toBeDefined();
      expect(report.challengerMetrics.safety.guardrailTriggerRate).toBeGreaterThanOrEqual(0);
      expect(report.challengerMetrics.safety.missedAlarmRate).toBeGreaterThanOrEqual(0);
    });

    test('对比结果包含 improve/degrade/neutral 判定', async () => {
      const challenger = createModelCandidate('model-v2', 'v2.0', 'good');
      const champion = createModelCandidate('model-v1', 'v1.0', 'good');
      const dataset = createDataset(30);

      const report = await service.evaluateAndPersist(challenger, champion, dataset);

      // 对比结果
      expect(report.comparison.length).toBeGreaterThan(0);
      for (const comp of report.comparison) {
        expect(comp.dimension).toBeTruthy();
        expect(typeof comp.improvement).toBe('number');
        expect(typeof comp.significant).toBe('boolean');
        // improvement > 0 = improve, < 0 = degrade, ~0 = neutral
      }

      // 判定结论
      expect(['promote', 'reject', 'inconclusive']).toContain(report.verdict);
      expect(report.verdictReason).toBeTruthy();
    });

    test('无冠军时直接晋升', async () => {
      const challenger = createModelCandidate('model-first', 'v1.0', 'good');
      const dataset = createDataset(20);

      const report = await service.evaluateAndPersist(challenger, null, dataset);
      expect(report.verdict).toBe('promote');
      expect(report.verdictReason).toContain('无现有冠军模型');
    });

    test('评估报告写入 MySQL', async () => {
      const challenger = createModelCandidate('model-v2', 'v2.0', 'good');
      const champion = createModelCandidate('model-v1', 'v1.0', 'good');
      const dataset = createDataset(20);

      await service.evaluateAndPersist(challenger, champion, dataset);

      expect(mysql.evalRecords.length).toBe(1);
      expect(mysql.evalRecords[0].challengerModelId).toBe('model-v2');
      expect(mysql.evalRecords[0].challengerVersion).toBe('v2.0');
      expect(mysql.evalRecords[0].championModelId).toBe('model-v1');
      expect(['promote', 'reject', 'inconclusive']).toContain(mysql.evalRecords[0].verdict);
    });
  });

  // ==========================================================================
  // AC-5: Shadow 阶段 → 自动推进到 Canary(5%)
  // ==========================================================================

  describe('AC-5: Shadow → Canary 推进', () => {
    test('创建部署计划: Shadow(0%) → Canary(5%) → Gray(20%) → Half(50%) → Full(100%)', async () => {
      // 先设置冠军
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champion-model', version: 'v1.0', type: 'prediction',
        description: '当前冠军', parameters: {}, metrics: {}, tags: ['champion'],
      });
      ccm.setChampion('champion-model', 'v1.0');

      // 创建并启动部署
      const plan = await service.createAndStartDeployment('challenger-model', 'v2.0');
      expect(plan).not.toBeNull();
      expect(plan!.status).toBe('executing');

      // 验证 Shadow 阶段 (0% 流量)
      const currentStage = plan!.stages[plan!.currentStageIndex];
      expect(currentStage.name).toBe('shadow');
      expect(currentStage.trafficPercent).toBe(0);
      expect(currentStage.status).toBe('active');
    });

    test('Shadow 无错误 → 推进到 Canary(5%)', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');

      // Shadow 阶段无错误 → 推进
      const result = await service.advanceDeploymentStage();
      expect(result.newStage).toBe('canary');

      // 验证 Canary 阶段
      const plan = service.getActivePlan();
      expect(plan!.stages[plan!.currentStageIndex].trafficPercent).toBe(5);
    });

    test('Redis 中持久化了活跃计划', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');

      // 验证 Redis 中有活跃计划
      const planJson = await redis.get('champion:active_plan');
      expect(planJson).not.toBeNull();
      const plan = JSON.parse(planJson!);
      expect(plan.challengerId).toBe('challenger');
      expect(plan.status).toBe('executing');
    });

    test('MySQL 中持久化了实验记录', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');

      expect(mysql.experiments.length).toBe(1);
      expect(mysql.experiments[0].challengerId).toBe('challenger');
      expect(mysql.experiments[0].currentStage).toBe('shadow');
    });

    test('完整部署流程: Shadow → Canary → Gray → Half → Full → Champion', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');

      // Shadow → Canary → Gray → Half → Full(推进5次, 第5次触发完成+晋升)
      const expectedStages = ['canary', 'gray', 'half', 'full'];

      for (let i = 0; i < expectedStages.length; i++) {
        const result = await service.advanceDeploymentStage();
        expect(result.newStage).toBe(expectedStages[i]);
        expect(result.completed).toBe(false);
      }

      // 第 5 次推进: Full → 完成，晋升为冠军
      const finalResult = await service.advanceDeploymentStage();
      expect(finalResult.completed).toBe(true);

      // 验证冠军已切换
      const champion = service.getChampion();
      expect(champion).not.toBeNull();
      expect(champion!.modelId).toBe('challenger');
      expect(champion!.version).toBe('v2');
      expect(champion!.status).toBe('champion');
    });
  });

  // ==========================================================================
  // AC-6: Canary 错误率 > 5% → 自动回滚
  // ==========================================================================

  describe('AC-6: 自动回滚', () => {
    test('Canary 阶段错误率 > 5% → 自动回滚', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');

      // 推进到 Canary
      await service.advanceDeploymentStage();
      const plan = service.getActivePlan();
      expect(plan!.stages[plan!.currentStageIndex].name).toBe('canary');

      // 错误率 7% > 阈值 5% → 回滚
      const result = service.checkAndAutoRollback(7.0);
      expect(result.shouldRollback).toBe(true);
      expect(result.rolledBack).toBe(true);
      expect(result.threshold).toBe(5);

      // 验证已回滚
      const planAfter = service.getActivePlan();
      expect(planAfter).toBeNull(); // activePlan 被清空

      // 回滚历史记录
      const rollbacks = ccm.getRollbackHistory();
      expect(rollbacks.length).toBe(1);
      expect(rollbacks[0].stage).toBe('canary');
      expect(rollbacks[0].reason).toContain('错误率');
    });

    test('Canary 错误率 ≤ 5% → 不回滚', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');
      await service.advanceDeploymentStage(); // → Canary

      const result = service.checkAndAutoRollback(3.0);
      expect(result.shouldRollback).toBe(false);
      expect(result.rolledBack).toBe(false);

      // 计划仍然活跃
      expect(service.getActivePlan()).not.toBeNull();
    });

    test('Shadow 阶段错误率 > 0% → 回滚(阈值=0)', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');
      // 仍在 Shadow 阶段

      const result = service.checkAndAutoRollback(0.5);
      expect(result.shouldRollback).toBe(true);
      expect(result.threshold).toBe(0);
    });

    test('手动回滚也能工作', async () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');

      await service.createAndStartDeployment('challenger', 'v2');
      await service.rollbackDeployment('运维人员手动回滚', { reason_code: 1 });

      expect(service.getActivePlan()).toBeNull();
    });
  });

  // ==========================================================================
  // AC-7: 状态重启后从 Redis 恢复
  // ==========================================================================

  describe('AC-7: Redis 状态恢复', () => {
    test('完整状态 → 持久化到 Redis → 新实例恢复', async () => {
      // 原始实例: 设置冠军 + 创建部署
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'model-a', version: 'v1.0', type: 'prediction',
        description: '冠军模型', parameters: { lr: 0.01 }, metrics: { accuracy: 0.95 },
        tags: ['production'],
      });
      ccm.setChampion('model-a', 'v1.0');

      await service.createAndStartDeployment('model-b', 'v2.0');
      await service.advanceDeploymentStage(); // → Canary

      // 验证 Redis 中有数据
      expect(redis.keys().length).toBeGreaterThan(0);

      // 模拟"重启"：创建全新实例，使用相同 Redis
      const service2 = new FlywheelPersistenceService({ redis, mysql });

      // 恢复状态
      const restored = await service2.restoreFromRedis();
      expect(restored.planRestored).toBe(true);
      expect(restored.registryCount).toBeGreaterThanOrEqual(2); // model-a + model-b
      expect(restored.championRestored).toBe(true);

      // 验证冠军恢复
      const champion = service2.getChampion();
      expect(champion).not.toBeNull();
      expect(champion!.modelId).toBe('model-a');

      // 验证活跃计划恢复
      const plan = service2.getActivePlan();
      expect(plan).not.toBeNull();
      expect(plan!.challengerId).toBe('model-b');
      expect(plan!.status).toBe('executing');
    });

    test('无 Redis 时降级到内存模式', async () => {
      const noRedisService = new FlywheelPersistenceService({ mysql });

      const result = await noRedisService.restoreFromRedis();
      expect(result.planRestored).toBe(false);
      expect(result.registryCount).toBe(0);
      expect(result.championRestored).toBe(false);

      // 仍可正常工作（内存模式）
      const ccm = noRedisService.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'test', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      expect(ccm.getAllModels().length).toBe(1);
    });
  });

  // ==========================================================================
  // 端到端流程: 完整管线
  // ==========================================================================

  describe('端到端: 完整进化飞轮一轮迭代', () => {
    test('诊断 → 模式发现 → 结晶 → 审核 → 影子评估 → 灰度部署', async () => {
      // Step 1: 诊断历史 → 模式发现
      const history = createDiagnosisHistory(12);
      const pipelineResult = await service.runDiscoveryPipeline(history);
      expect(pipelineResult.patternsFound).toBeGreaterThanOrEqual(1);
      expect(pipelineResult.crystalsCreated).toBeGreaterThanOrEqual(1);

      // Step 2: 审核通过
      const patternId = pipelineResult.patternIds[0];
      const approveResult = await service.approvePatternAndTriggerShadow(patternId, '审核员');
      expect(approveResult.approved).toBe(true);

      // Step 3: 影子评估
      const challenger = createModelCandidate('new-model', 'v1.0', 'good');
      const dataset = createDataset(30);
      const evalReport = await service.evaluateAndPersist(challenger, null, dataset);
      expect(evalReport.verdict).toBe('promote'); // 无冠军直接晋升

      // Step 4: 设置冠军并创建部署
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'new-model', version: 'v1.0', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('new-model', 'v1.0');

      await service.createAndStartDeployment('improved-model', 'v2.0');

      // Step 5: Shadow → Canary → Gray → Half → Full → Champion (5 次推进)
      for (let i = 0; i < 5; i++) {
        await service.advanceDeploymentStage();
      }

      // 验证: 最终冠军已更新
      const finalChampion = service.getChampion();
      expect(finalChampion!.modelId).toBe('improved-model');
      expect(finalChampion!.status).toBe('champion');

      // 验证: MySQL 中有完整记录
      expect(mysql.crystals.length).toBeGreaterThan(0);
      expect(mysql.evalRecords.length).toBe(1);
      expect(mysql.experiments.length).toBe(1);
    });
  });

  // ==========================================================================
  // 附加测试: 工厂函数
  // ==========================================================================

  describe('工厂函数', () => {
    test('单例模式', async () => {
      const { getFlywheelPersistenceService, resetFlywheelPersistenceService } = await import('../flywheel-persistence.service');

      resetFlywheelPersistenceService();
      const s1 = getFlywheelPersistenceService();
      const s2 = getFlywheelPersistenceService();
      expect(s1).toBe(s2);

      resetFlywheelPersistenceService();
      const s3 = getFlywheelPersistenceService();
      expect(s3).not.toBe(s1);
    });
  });

  // ==========================================================================
  // 附加测试: 流量路由
  // ==========================================================================

  describe('流量路由', () => {
    test('Shadow 阶段 0% 流量 → 所有请求走冠军', () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');
      ccm.registerModel({
        modelId: 'challenger', version: 'v2', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.createDeploymentPlan('challenger', 'v2');
      ccm.startDeployment();

      // Shadow = 0% → 所有请求都不走挑战者
      let challengerCount = 0;
      for (let i = 0; i < 100; i++) {
        const decision = ccm.routeTraffic(`req-${i}`);
        if (decision.useChallenger) challengerCount++;
      }
      expect(challengerCount).toBe(0);
    });

    test('Canary 阶段 5% 流量 → ~5% 请求走挑战者', () => {
      const ccm = service.getChampionChallengerManager();
      ccm.registerModel({
        modelId: 'champ', version: 'v1', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.setChampion('champ', 'v1');
      ccm.registerModel({
        modelId: 'challenger', version: 'v2', type: 'prediction',
        description: '', parameters: {}, metrics: {}, tags: [],
      });
      ccm.createDeploymentPlan('challenger', 'v2');
      ccm.startDeployment();
      ccm.advanceStage(); // → Canary(5%)

      let challengerCount = 0;
      const totalRequests = 1000;
      for (let i = 0; i < totalRequests; i++) {
        const decision = ccm.routeTraffic(`req-${i}`);
        if (decision.useChallenger) challengerCount++;
      }

      // 允许一定波动 (1%-15%)
      const ratio = challengerCount / totalRequests;
      expect(ratio).toBeGreaterThan(0.01);
      expect(ratio).toBeLessThan(0.15);
    });
  });
});
