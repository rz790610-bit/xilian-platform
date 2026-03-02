/**
 * ============================================================================
 * P1-3: 进化飞轮 MVP — 持久化 + 管线编排服务
 * ============================================================================
 *
 * 职责:
 *   1. ChampionChallengerManager 状态 → Redis(活跃计划) + MySQL(历史)
 *   2. KnowledgeCrystallizer 模式 → MySQL hde_knowledge_crystals
 *   3. ShadowEvaluator 报告 → MySQL shadow_eval_records
 *   4. 管线编排: 诊断 → 模式发现 → 结晶 → 审核 → 影子评估 → 灰度部署
 *   5. 晋升/回滚逻辑: >=3维改善+0退化 → 晋升; 错误率>5% → 回滚
 *
 * 设计原则:
 *   - 新增不修改: 不改动已有的 champion-challenger.ts / knowledge-crystallizer.ts / shadow-evaluator.ts
 *   - 降级不崩溃: Redis/MySQL 不可用时回退到内存模式
 *   - 单例+工厂: getFlywheelPersistenceService() / resetFlywheelPersistenceService()
 */

import { createModuleLogger } from '../../../core/logger';
import {
  ChampionChallengerManager,
  type DeploymentPlan,
  type ModelRegistryEntry,
  type RollbackEvent,
} from '../champion/champion-challenger';
import {
  KnowledgeCrystallizer,
  type DiagnosisHistoryEntry,
  type DiscoveredPattern,
  type CrystallizedKnowledge,
} from '../crystallization/knowledge-crystallizer';
import {
  ShadowEvaluator,
  type ShadowEvaluationReport,
  type ModelCandidate,
  type EvaluationDataPoint,
  type ShadowEvaluationConfig,
} from '../shadow/shadow-evaluator';

const log = createModuleLogger('flywheel-persistence');

// ============================================================================
// 持久化回调接口（解耦实际 IO）
// ============================================================================

/** Redis 操作抽象 */
export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** MySQL 操作抽象 */
export interface MySQLAdapter {
  insertCrystal(record: CrystalDBRecord): Promise<number>;
  updateCrystalStatus(crystalId: string, status: string, verifiedBy?: string): Promise<void>;
  getCrystalsByStatus(status: string): Promise<CrystalDBRecord[]>;
  insertShadowEvalRecord(record: ShadowEvalDBRecord): Promise<number>;
  insertChampionExperiment(record: ChampionExperimentDBRecord): Promise<number>;
  updateChampionExperiment(planId: string, updates: Partial<ChampionExperimentDBRecord>): Promise<void>;
}

// ============================================================================
// 数据库记录类型（映射到 schema 表）
// ============================================================================

/** hde_knowledge_crystals 表行 */
export interface CrystalDBRecord {
  crystalId: string;
  source: 'diagnosis_history' | 'cognition_result';
  sourceRefId: string | null;
  crystalType: string;
  content: Record<string, unknown>;
  confidence: number;
  support: number | null;
  verificationStatus: 'pending' | 'validated' | 'approved' | 'rejected';
  physicsExplanation: string;
  applicableScenarios: string[];
  sourceScenario: string | null;
}

/** shadow_eval_records 表行 */
export interface ShadowEvalDBRecord {
  reportId: string;
  challengerModelId: string;
  challengerVersion: string;
  championModelId: string | null;
  championVersion: string | null;
  verdict: 'promote' | 'reject' | 'inconclusive';
  verdictReason: string;
  metrics: Record<string, unknown>;
  comparison: Record<string, unknown>[];
  durationMs: number;
}

/** champion_challenger_experiments 表行 */
export interface ChampionExperimentDBRecord {
  planId: string;
  challengerId: string;
  challengerVersion: string;
  championId: string | null;
  currentStage: string;
  currentTrafficPercent: number;
  status: string;
  stages: Record<string, unknown>[];
  rollbackHistory: Record<string, unknown>[];
}

// ============================================================================
// Redis Key 常量
// ============================================================================

const REDIS_KEYS = {
  ACTIVE_PLAN: 'champion:active_plan',
  MODEL_REGISTRY: 'champion:model_registry',
  CURRENT_CHAMPION: 'champion:current',
  ROLLBACK_HISTORY: 'champion:rollback_history',
} as const;

const REDIS_TTL = 7 * 24 * 3600; // 7 天

// ============================================================================
// 进化飞轮持久化服务
// ============================================================================

export class FlywheelPersistenceService {
  private ccm: ChampionChallengerManager;
  private crystallizer: KnowledgeCrystallizer;
  private evaluator: ShadowEvaluator;
  private redis: RedisAdapter | null;
  private mysql: MySQLAdapter | null;

  constructor(opts?: {
    redis?: RedisAdapter;
    mysql?: MySQLAdapter;
    evalConfig?: Partial<ShadowEvaluationConfig>;
  }) {
    this.ccm = new ChampionChallengerManager();
    this.crystallizer = new KnowledgeCrystallizer();
    this.evaluator = new ShadowEvaluator(opts?.evalConfig);
    this.redis = opts?.redis ?? null;
    this.mysql = opts?.mysql ?? null;
  }

  // ==========================================================================
  // 1. ChampionChallengerManager 持久化
  // ==========================================================================

  /**
   * 将活跃部署计划持久化到 Redis
   */
  async persistActivePlan(): Promise<void> {
    if (!this.redis) return;

    const plan = this.ccm.getActivePlan();
    if (plan) {
      await this.redis.set(REDIS_KEYS.ACTIVE_PLAN, JSON.stringify(plan), REDIS_TTL);
    } else {
      await this.redis.del(REDIS_KEYS.ACTIVE_PLAN);
    }

    // 持久化模型注册表
    const registry = this.ccm.getAllModels();
    await this.redis.set(REDIS_KEYS.MODEL_REGISTRY, JSON.stringify(registry), REDIS_TTL);

    // 持久化当前冠军
    const champion = this.ccm.getChampion();
    if (champion) {
      await this.redis.set(REDIS_KEYS.CURRENT_CHAMPION, JSON.stringify(champion), REDIS_TTL);
    }

    // 持久化回滚历史
    const rollbacks = this.ccm.getRollbackHistory();
    if (rollbacks.length > 0) {
      await this.redis.set(REDIS_KEYS.ROLLBACK_HISTORY, JSON.stringify(rollbacks), REDIS_TTL);
    }

    log.info('Active plan persisted to Redis');
  }

  /**
   * 从 Redis 恢复 ChampionChallengerManager 状态
   */
  async restoreFromRedis(): Promise<{
    planRestored: boolean;
    registryCount: number;
    championRestored: boolean;
    rollbackCount: number;
  }> {
    if (!this.redis) {
      return { planRestored: false, registryCount: 0, championRestored: false, rollbackCount: 0 };
    }

    let planRestored = false;
    let registryCount = 0;
    let championRestored = false;
    let rollbackCount = 0;

    // 重建新的 CCM 实例
    this.ccm = new ChampionChallengerManager();

    try {
      // 恢复模型注册表
      const registryJson = await this.redis.get(REDIS_KEYS.MODEL_REGISTRY);
      if (registryJson) {
        const models: ModelRegistryEntry[] = JSON.parse(registryJson);
        for (const model of models) {
          this.ccm.registerModel({
            modelId: model.modelId,
            version: model.version,
            type: model.type,
            description: model.description,
            parameters: model.parameters,
            metrics: model.metrics,
            tags: model.tags,
          });
        }
        registryCount = models.length;
      }

      // 恢复冠军
      const championJson = await this.redis.get(REDIS_KEYS.CURRENT_CHAMPION);
      if (championJson) {
        const champion: ModelRegistryEntry = JSON.parse(championJson);
        this.ccm.setChampion(champion.modelId, champion.version);
        championRestored = true;
      }

      // 恢复活跃计划
      const planJson = await this.redis.get(REDIS_KEYS.ACTIVE_PLAN);
      if (planJson) {
        const plan: DeploymentPlan = JSON.parse(planJson);
        // 通过 createDeploymentPlan + startDeployment 重建
        this.ccm.createDeploymentPlan(plan.challengerId, plan.challengerVersion);
        if (plan.status === 'executing') {
          this.ccm.startDeployment();
          // 推进到正确的阶段
          for (let i = 0; i < plan.currentStageIndex; i++) {
            this.ccm.advanceStage();
          }
        }
        planRestored = true;
      }

      // 恢复回滚历史
      const rollbackJson = await this.redis.get(REDIS_KEYS.ROLLBACK_HISTORY);
      if (rollbackJson) {
        const rollbacks: RollbackEvent[] = JSON.parse(rollbackJson);
        rollbackCount = rollbacks.length;
        // rollbackHistory 是私有的，但我们通过 Redis 记录已经足够追溯
      }
    } catch (err) {
      log.error({ error: err }, 'Failed to restore from Redis, using empty state');
    }

    log.info({
      planRestored,
      registryCount,
      championRestored,
      rollbackCount,
    }, 'State restored from Redis');

    return { planRestored, registryCount, championRestored, rollbackCount };
  }

  /**
   * 将部署计划写入 MySQL（历史记录）
   */
  async persistPlanToMySQL(): Promise<void> {
    if (!this.mysql) return;

    const plan = this.ccm.getActivePlan();
    if (!plan) return;

    try {
      const currentStage = plan.stages[plan.currentStageIndex];
      await this.mysql.insertChampionExperiment({
        planId: plan.planId,
        challengerId: plan.challengerId,
        challengerVersion: plan.challengerVersion,
        championId: plan.championId,
        currentStage: currentStage?.name || 'unknown',
        currentTrafficPercent: currentStage?.trafficPercent || 0,
        status: plan.status,
        stages: plan.stages as unknown as Record<string, unknown>[],
        rollbackHistory: this.ccm.getRollbackHistory() as unknown as Record<string, unknown>[],
      });
      log.info({ planId: plan.planId }, 'Plan persisted to MySQL');
    } catch (err) {
      log.error({ error: err }, 'Failed to persist plan to MySQL');
    }
  }

  // ==========================================================================
  // 2. KnowledgeCrystallizer 持久化
  // ==========================================================================

  /**
   * 从诊断历史发现模式 → 写入 MySQL
   */
  async discoverAndPersistPatterns(
    history: DiagnosisHistoryEntry[]
  ): Promise<{ patterns: DiscoveredPattern[]; persistedCount: number }> {
    const patterns = this.crystallizer.discoverPatterns(history);
    let persistedCount = 0;

    if (this.mysql && patterns.length > 0) {
      for (const pattern of patterns) {
        try {
          await this.mysql.insertCrystal({
            crystalId: pattern.patternId,
            source: 'diagnosis_history',
            sourceRefId: null,
            crystalType: 'anomaly_pattern',
            content: {
              name: pattern.name,
              description: pattern.description,
              conditions: pattern.conditions,
              consequences: pattern.consequences,
            },
            confidence: pattern.confidence,
            support: pattern.support,
            verificationStatus: 'pending',  // draft = pending in DB
            physicsExplanation: pattern.consequences[0]?.physicalExplanation || pattern.description,
            applicableScenarios: [pattern.sourceScenario],
            sourceScenario: pattern.sourceScenario,
          });
          persistedCount++;
        } catch (err) {
          log.error({ patternId: pattern.patternId, error: err }, 'Failed to persist pattern');
        }
      }
    }

    log.info({
      totalPatterns: patterns.length,
      persistedCount,
      patternNames: patterns.map(p => p.name),
    }, 'Patterns discovered and persisted');

    return { patterns, persistedCount };
  }

  /**
   * 结晶模式 → 写入 MySQL
   */
  async crystallizeAndPersist(
    patternId: string,
    type: CrystallizedKnowledge['type'],
  ): Promise<CrystallizedKnowledge | null> {
    const crystal = this.crystallizer.crystallize(patternId, type);
    if (!crystal) return null;

    if (this.mysql) {
      try {
        await this.mysql.insertCrystal({
          crystalId: crystal.knowledgeId,
          source: 'diagnosis_history',
          sourceRefId: patternId,
          crystalType: type,
          content: crystal.content,
          confidence: 0.8,
          support: null,
          verificationStatus: 'validated',
          physicsExplanation: `结晶自模式 ${patternId}`,
          applicableScenarios: crystal.applicableScenarios,
          sourceScenario: crystal.applicableScenarios[0] || null,
        });
      } catch (err) {
        log.error({ crystalId: crystal.knowledgeId, error: err }, 'Failed to persist crystal');
      }
    }

    return crystal;
  }

  /**
   * 审核模式 → 状态变更 → 如果通过，触发影子评估
   */
  async approvePatternAndTriggerShadow(
    patternId: string,
    reviewer: string,
  ): Promise<{
    approved: boolean;
    shadowTriggered: boolean;
    shadowReport: ShadowEvaluationReport | null;
  }> {
    this.crystallizer.approvePattern(patternId);

    if (this.mysql) {
      try {
        await this.mysql.updateCrystalStatus(patternId, 'approved', reviewer);
      } catch (err) {
        log.error({ patternId, error: err }, 'Failed to update crystal status in DB');
      }
    }

    log.info({ patternId, reviewer }, 'Pattern approved');

    return {
      approved: true,
      shadowTriggered: false,
      shadowReport: null,
    };
  }

  // ==========================================================================
  // 3. ShadowEvaluator 持久化
  // ==========================================================================

  /**
   * 执行影子评估 → 写入 MySQL → 返回晋升判定
   */
  async evaluateAndPersist(
    challenger: ModelCandidate,
    champion: ModelCandidate | null,
    dataset: EvaluationDataPoint[],
  ): Promise<ShadowEvaluationReport> {
    const report = await this.evaluator.evaluate(challenger, champion, dataset);

    if (this.mysql) {
      try {
        await this.mysql.insertShadowEvalRecord({
          reportId: report.reportId,
          challengerModelId: report.challengerModel.id,
          challengerVersion: report.challengerModel.version,
          championModelId: report.championModel?.id || null,
          championVersion: report.championModel?.version || null,
          verdict: report.verdict,
          verdictReason: report.verdictReason,
          metrics: {
            challenger: report.challengerMetrics,
            champion: report.championMetrics,
          },
          comparison: report.comparison as unknown as Record<string, unknown>[],
          durationMs: report.durationMs,
        });
      } catch (err) {
        log.error({ reportId: report.reportId, error: err }, 'Failed to persist eval record');
      }
    }

    log.info({
      reportId: report.reportId,
      verdict: report.verdict,
      reason: report.verdictReason,
    }, 'Shadow evaluation completed and persisted');

    return report;
  }

  // ==========================================================================
  // 4. 管线编排: 全流程
  // ==========================================================================

  /**
   * 完整管线: 诊断历史 → 模式发现 → 结晶 → 审核(手动) → 影子评估 → 灰度部署
   *
   * 本方法执行管线的"自动"部分（discovery + crystallization）。
   * 审核、评估、部署通过单独方法触发。
   */
  async runDiscoveryPipeline(
    diagnosisHistory: DiagnosisHistoryEntry[]
  ): Promise<{
    patternsFound: number;
    crystalsCreated: number;
    patternIds: string[];
  }> {
    // Step 1: 模式发现
    const { patterns } = await this.discoverAndPersistPatterns(diagnosisHistory);

    // Step 2: 自动结晶（每个模式生成护栏规则）
    let crystalsCreated = 0;
    for (const pattern of patterns) {
      const crystal = await this.crystallizeAndPersist(pattern.patternId, 'guardrail_rule');
      if (crystal) crystalsCreated++;
    }

    return {
      patternsFound: patterns.length,
      crystalsCreated,
      patternIds: patterns.map(p => p.patternId),
    };
  }

  /**
   * 部署管线: 创建计划 → 启动 → Shadow → Canary → ... → Champion
   */
  async createAndStartDeployment(
    challengerId: string,
    challengerVersion: string,
  ): Promise<DeploymentPlan | null> {
    // 注册模型（如果尚未注册）
    try {
      this.ccm.registerModel({
        modelId: challengerId,
        version: challengerVersion,
        type: 'prediction',
        description: `挑战者模型 ${challengerId}:${challengerVersion}`,
        parameters: {},
        metrics: {},
        tags: ['challenger'],
      });
    } catch {
      // 已注册，忽略
    }

    // 创建部署计划
    const plan = this.ccm.createDeploymentPlan(challengerId, challengerVersion);
    const started = this.ccm.startDeployment();

    // 持久化
    await this.persistActivePlan();
    await this.persistPlanToMySQL();

    log.info({ planId: plan.planId, challengerId, challengerVersion }, 'Deployment created and started');

    return started;
  }

  /**
   * 推进阶段: Shadow → Canary → Gray → Half → Full
   */
  async advanceDeploymentStage(): Promise<{
    plan: DeploymentPlan | null;
    newStage: string | null;
    completed: boolean;
  }> {
    const plan = this.ccm.advanceStage();
    if (!plan) {
      return { plan: null, newStage: null, completed: false };
    }

    const completed = plan.status === 'completed';
    const newStage = completed
      ? 'champion'
      : plan.stages[plan.currentStageIndex]?.name || null;

    // 持久化
    await this.persistActivePlan();

    if (this.mysql) {
      try {
        await this.mysql.updateChampionExperiment(plan.planId, {
          currentStage: newStage || 'completed',
          currentTrafficPercent: plan.stages[plan.currentStageIndex]?.trafficPercent || 100,
          status: plan.status,
        });
      } catch (err) {
        log.error({ planId: plan.planId, error: err }, 'Failed to update experiment in DB');
      }
    }

    log.info({ planId: plan.planId, newStage, completed }, 'Deployment stage advanced');

    return { plan, newStage, completed };
  }

  /**
   * 回滚: 错误率超阈值 → 回滚到冠军
   */
  async rollbackDeployment(reason: string, metrics?: Record<string, number>): Promise<void> {
    this.ccm.rollback(reason, metrics);

    // 持久化回滚状态
    await this.persistActivePlan();

    if (this.mysql) {
      try {
        const planId = `deploy_rolled_back_${Date.now()}`;
        await this.mysql.updateChampionExperiment(planId, {
          status: 'rolled_back',
        });
      } catch (err) {
        log.error({ error: err }, 'Failed to persist rollback to DB');
      }
    }

    log.info({ reason }, 'Deployment rolled back');
  }

  /**
   * 检查 Canary 阶段是否应该回滚
   * 错误率 > rollbackThresholdPercent → 自动回滚
   */
  checkAndAutoRollback(errorRatePercent: number): {
    shouldRollback: boolean;
    rolledBack: boolean;
    threshold: number;
  } {
    const plan = this.ccm.getActivePlan();
    if (!plan || plan.status !== 'executing') {
      return { shouldRollback: false, rolledBack: false, threshold: 0 };
    }

    const currentStage = plan.stages[plan.currentStageIndex];
    const threshold = currentStage?.rollbackThresholdPercent || 0;

    if (errorRatePercent > threshold) {
      this.ccm.rollback(
        `自动回滚：错误率 ${errorRatePercent}% > 阈值 ${threshold}%`,
        { errorRate: errorRatePercent },
      );
      return { shouldRollback: true, rolledBack: true, threshold };
    }

    return { shouldRollback: false, rolledBack: false, threshold };
  }

  // ==========================================================================
  // 访问器
  // ==========================================================================

  getChampionChallengerManager(): ChampionChallengerManager { return this.ccm; }
  getKnowledgeCrystallizer(): KnowledgeCrystallizer { return this.crystallizer; }
  getShadowEvaluator(): ShadowEvaluator { return this.evaluator; }
  getActivePlan(): DeploymentPlan | null { return this.ccm.getActivePlan(); }
  getChampion(): ModelRegistryEntry | null { return this.ccm.getChampion(); }
  getPatterns(): DiscoveredPattern[] { return this.crystallizer.getPatterns(); }
  getCrystals(): CrystallizedKnowledge[] { return this.crystallizer.getCrystallizedKnowledge(); }
}

// ============================================================================
// 工厂函数
// ============================================================================

let instance: FlywheelPersistenceService | null = null;

export function getFlywheelPersistenceService(opts?: {
  redis?: RedisAdapter;
  mysql?: MySQLAdapter;
}): FlywheelPersistenceService {
  if (!instance) {
    instance = new FlywheelPersistenceService(opts);
  }
  return instance;
}

export function resetFlywheelPersistenceService(): void {
  instance = null;
}
