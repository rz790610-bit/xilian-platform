/**
 * ============================================================================
 * 自进化飞轮编排器 (Evolution Flywheel Orchestrator)
 * ============================================================================
 *
 * 每周 5 步闭环：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Step 1: 数据发现                                               │
 *   │    MetaLearner.discoverData → 数据质量报告 + 新数据源建议        │
 *   │                                                                  │
 *   │  Step 2: 假设生成                                               │
 *   │    MetaLearner.generateHypotheses → 改进假设列表                 │
 *   │                                                                  │
 *   │  Step 3: 影子验证                                               │
 *   │    ShadowEvaluator.evaluate → 新模型 vs 冠军对比报告            │
 *   │                                                                  │
 *   │  Step 4: 金丝雀部署                                             │
 *   │    ChampionChallenger.deploy → 5%→20%→50%→100% 渐进式部署      │
 *   │                                                                  │
 *   │  Step 5: 反馈结晶                                               │
 *   │    KnowledgeCrystallizer.crystallize → 新规则/KG/阈值注入       │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 飞轮永不停歇：Step 5 的输出反馈到 Step 1，形成持续进化
 */

import { MetaLearner, type Hypothesis, type ExperimentDesign, type EvolutionStrategy } from '../metalearner/meta-learner';
import { ShadowEvaluator, type ShadowEvaluationReport, type ModelCandidate, type EvaluationDataPoint } from '../shadow/shadow-evaluator';
import { ChampionChallengerManager, type DeploymentPlan } from '../champion/champion-challenger';
import { KnowledgeCrystallizer, type DiscoveredPattern, type CrystallizedKnowledge, type DiagnosisHistoryEntry } from '../crystallization/knowledge-crystallizer';

// ============================================================================
// 类型定义
// ============================================================================

export interface FlywheelConfig {
  /** 飞轮周期 (小时) */
  cyclePeriodHours: number;
  /** 是否自动执行 */
  autoExecute: boolean;
  /** 最大并行假设数 */
  maxParallelHypotheses: number;
  /** 人工审核开关 */
  requireHumanApproval: boolean;
}

export interface FlywheelCycleReport {
  cycleId: string;
  cycleNumber: number;
  startedAt: number;
  completedAt: number | null;
  status: 'running' | 'completed' | 'paused' | 'failed';

  /** Step 1 结果 */
  dataDiscovery: {
    qualityScore: number;
    missingDimensions: string[];
    suggestions: string[];
  } | null;

  /** Step 2 结果 */
  hypotheses: Hypothesis[];

  /** Step 3 结果 */
  shadowEvaluation: ShadowEvaluationReport | null;

  /** Step 4 结果 */
  deployment: DeploymentPlan | null;

  /** Step 5 结果 */
  crystallization: {
    patternsDiscovered: number;
    knowledgeCrystallized: number;
    rulesGenerated: number;
  } | null;

  /** 进化策略 */
  strategy: EvolutionStrategy | null;

  /** 性能变化 */
  performanceDelta: number | null;
}

export interface FlywheelState {
  isRunning: boolean;
  currentCycle: number;
  totalCycles: number;
  lastCycleReport: FlywheelCycleReport | null;
  cumulativeImprovement: number;
  cycleHistory: FlywheelCycleReport[];
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_FLYWHEEL_CONFIG: FlywheelConfig = {
  cyclePeriodHours: 168, // 每周
  autoExecute: false,
  maxParallelHypotheses: 3,
  requireHumanApproval: true,
};

// ============================================================================
// 飞轮编排器
// ============================================================================

export class EvolutionFlywheel {
  private config: FlywheelConfig;
  private metaLearner: MetaLearner;
  private shadowEvaluator: ShadowEvaluator;
  private championManager: ChampionChallengerManager;
  private knowledgeCrystallizer: KnowledgeCrystallizer;

  private state: FlywheelState = {
    isRunning: false,
    currentCycle: 0,
    totalCycles: 0,
    lastCycleReport: null,
    cumulativeImprovement: 0,
    cycleHistory: [],
  };

  // 回调
  private onCycleComplete?: (report: FlywheelCycleReport) => void;
  private onApprovalRequired?: (item: string, details: Record<string, unknown>) => Promise<boolean>;

  constructor(config: Partial<FlywheelConfig> = {}) {
    this.config = { ...DEFAULT_FLYWHEEL_CONFIG, ...config };
    this.metaLearner = new MetaLearner();
    this.shadowEvaluator = new ShadowEvaluator();
    this.championManager = new ChampionChallengerManager();
    this.knowledgeCrystallizer = new KnowledgeCrystallizer();
  }

  /**
   * 执行一个完整的飞轮周期
   */
  async executeCycle(
    diagnosisHistory: DiagnosisHistoryEntry[],
    evaluationDataset: EvaluationDataPoint[],
    challengerModel?: ModelCandidate
  ): Promise<FlywheelCycleReport> {
    this.state.isRunning = true;
    this.state.currentCycle++;

    const report: FlywheelCycleReport = {
      cycleId: `flywheel_cycle_${this.state.currentCycle}_${Date.now()}`,
      cycleNumber: this.state.currentCycle,
      startedAt: Date.now(),
      completedAt: null,
      status: 'running',
      dataDiscovery: null,
      hypotheses: [],
      shadowEvaluation: null,
      deployment: null,
      crystallization: null,
      strategy: null,
      performanceDelta: null,
    };

    try {
      // ========== Step 1: 数据发现 ==========
      const expectedDimensions = [
        'windSpeedMean', 'loadWeight', 'loadEccentricity', 'vibrationRms',
        'motorCurrentMean', 'temperatureBearing', 'fatigueAccumPercent',
        'corrosionIndex', 'ambientHumidity', 'chlorideConcentration',
      ];

      const dataPoints = diagnosisHistory.map(h => h.keyMetrics);
      const discovery = this.metaLearner.discoverData(dataPoints, expectedDimensions);
      report.dataDiscovery = {
        qualityScore: discovery.qualityScore,
        missingDimensions: discovery.missingDimensions,
        suggestions: discovery.suggestions,
      };

      // ========== Step 2: 假设生成 ==========
      const recentPerformance = diagnosisHistory.slice(-100).map(h => ({
        score: h.overallScore / 100,
        context: {
          safetyScore: h.safetyScore,
          healthScore: h.healthScore,
          efficiencyScore: h.efficiencyScore,
        },
      }));

      const hypotheses = this.metaLearner.generateHypotheses(recentPerformance);
      report.hypotheses = hypotheses.slice(0, this.config.maxParallelHypotheses);

      // ========== Step 3: 影子验证 ==========
      if (challengerModel && evaluationDataset.length > 0) {
        const champion = this.championManager.getChampion();
        let championModel: ModelCandidate | null = null;

        if (champion) {
          // 构建冠军模型候选（简化：使用占位推理函数）
          championModel = {
            modelId: champion.modelId,
            modelVersion: champion.version,
            modelType: 'prediction',
            description: 'Current champion model',
            parameters: champion.parameters as Record<string, unknown>,
            createdAt: champion.registeredAt,
            predict: async (input) => input, // 占位
          };
        }

        const evalReport = await this.shadowEvaluator.evaluate(
          challengerModel,
          championModel,
          evaluationDataset
        );
        report.shadowEvaluation = evalReport;

        // ========== Step 4: 金丝雀部署 ==========
        if (evalReport.verdict === 'promote') {
          if (this.config.requireHumanApproval && this.onApprovalRequired) {
            const approved = await this.onApprovalRequired('model_promotion', {
              challenger: challengerModel.modelId,
              verdict: evalReport.verdict,
              reason: evalReport.verdictReason,
            });
            if (!approved) {
              report.status = 'paused';
              report.completedAt = Date.now();
              this.state.lastCycleReport = report;
              return report;
            }
          }

          // 注册并部署
          this.championManager.registerModel({
            modelId: challengerModel.modelId,
            version: challengerModel.modelVersion,
            type: challengerModel.modelType,
            description: challengerModel.description,
            parameters: challengerModel.parameters,
            metrics: {
              mae: evalReport.challengerMetrics.accuracy.mae,
              rmse: evalReport.challengerMetrics.accuracy.rmse,
              f1: evalReport.challengerMetrics.anomalyDetection.f1,
            },
            tags: [`cycle_${this.state.currentCycle}`],
          });

          const plan = this.championManager.createDeploymentPlan(
            challengerModel.modelId,
            challengerModel.modelVersion
          );
          this.championManager.startDeployment();
          report.deployment = plan;
        }
      }

      // ========== Step 5: 反馈结晶 ==========
      const patterns = this.knowledgeCrystallizer.discoverPatterns(diagnosisHistory);
      let crystallizedCount = 0;
      let rulesCount = 0;

      for (const pattern of patterns) {
        if (pattern.confidence >= 0.7) {
          const knowledge = this.knowledgeCrystallizer.crystallize(pattern.patternId, 'guardrail_rule');
          if (knowledge) {
            crystallizedCount++;
            rulesCount++;
          }

          // 同时生成 KG 三元组
          this.knowledgeCrystallizer.crystallize(pattern.patternId, 'kg_triple');
          crystallizedCount++;
        }
      }

      report.crystallization = {
        patternsDiscovered: patterns.length,
        knowledgeCrystallized: crystallizedCount,
        rulesGenerated: rulesCount,
      };

      // 进化策略
      const strategy = this.metaLearner.decideStrategy();
      report.strategy = strategy;

      // 记录性能
      const avgScore = diagnosisHistory.slice(-10).reduce((s, h) => s + h.overallScore, 0) / 10;
      this.metaLearner.recordPerformance(avgScore / 100);

      // 性能变化
      if (this.state.cycleHistory.length > 0) {
        const prevScore = this.state.cycleHistory[this.state.cycleHistory.length - 1].performanceDelta;
        report.performanceDelta = avgScore / 100 - (prevScore || avgScore / 100);
      } else {
        report.performanceDelta = 0;
      }

      report.status = 'completed';
    } catch (error) {
      report.status = 'failed';
    }

    report.completedAt = Date.now();
    this.state.lastCycleReport = report;
    this.state.totalCycles++;
    this.state.cycleHistory.push(report);
    this.state.isRunning = false;

    if (report.performanceDelta) {
      this.state.cumulativeImprovement += report.performanceDelta;
    }

    this.onCycleComplete?.(report);
    return report;
  }

  /**
   * 获取飞轮状态
   */
  getState(): FlywheelState {
    return { ...this.state };
  }

  /**
   * 获取子模块
   */
  getMetaLearner(): MetaLearner { return this.metaLearner; }
  getShadowEvaluator(): ShadowEvaluator { return this.shadowEvaluator; }
  getChampionManager(): ChampionChallengerManager { return this.championManager; }
  getKnowledgeCrystallizer(): KnowledgeCrystallizer { return this.knowledgeCrystallizer; }

  /**
   * 设置回调
   */
  setOnCycleComplete(callback: (report: FlywheelCycleReport) => void): void {
    this.onCycleComplete = callback;
  }

  setOnApprovalRequired(callback: (item: string, details: Record<string, unknown>) => Promise<boolean>): void {
    this.onApprovalRequired = callback;
  }
}
