/**
 * ============================================================================
 * 自进化飞轮编排器 v2.0 (Evolution Flywheel Orchestrator)
 * ============================================================================
 *
 * v2.0 升级：
 *   1. 步骤日志 DB 持久化（evolution_step_logs 表）
 *   2. 进化周期 DB 持久化（evolution_cycles 表）
 *   3. 飞轮调度配置持久化（evolution_flywheel_schedules 表）
 *   4. Prometheus 全链路埋点
 *   5. EventBus 事件驱动
 *   6. 趋势分析（最近 N 周期的性能趋势）
 *   7. 闭环验证（每步输出校验 → 下步输入）
 *   8. 自动调度（cron-style 定时触发）
 *
 * 每周 5 步闭环：
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

import { MetaLearner, type Hypothesis, type EvolutionStrategy } from '../metalearner/meta-learner';
import { ShadowEvaluator, type ShadowEvaluationReport, type ModelCandidate, type EvaluationDataPoint } from '../shadow/shadow-evaluator';
import { ChampionChallengerManager, type DeploymentPlan } from '../champion/champion-challenger';
import { KnowledgeCrystallizer, type DiscoveredPattern, type DiagnosisHistoryEntry } from '../crystallization/knowledge-crystallizer';
import { getDb } from '../../../lib/db';
import {
  evolutionCycles,
  evolutionStepLogs,
  evolutionFlywheelSchedules,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, gte, and } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('evolution-flywheel');

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
  dbCycleId: number | null;
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

  /** 步骤日志 */
  stepLogs: StepLogEntry[];
}

export interface StepLogEntry {
  stepNumber: number;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
  metrics: Record<string, number> | null;
  errorMessage: string | null;
}

export interface FlywheelState {
  isRunning: boolean;
  currentCycle: number;
  totalCycles: number;
  lastCycleReport: FlywheelCycleReport | null;
  cumulativeImprovement: number;
  cycleHistory: FlywheelCycleReport[];
}

export interface TrendAnalysis {
  direction: 'improving' | 'stable' | 'degrading';
  slope: number;
  recentScores: number[];
  averageImprovement: number;
  bestCycle: number;
  worstCycle: number;
}

// ============================================================================
// 步骤定义
// ============================================================================

const STEP_NAMES = [
  'data_discovery',
  'hypothesis_generation',
  'shadow_evaluation',
  'canary_deployment',
  'feedback_crystallization',
] as const;

type StepName = typeof STEP_NAMES[number];

// ============================================================================
// Prometheus 指标
// ============================================================================

class FlywheelMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  set(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }

  observe(name: string, value: number): void {
    const arr = this.histograms.get(name) || [];
    arr.push(value);
    if (arr.length > 1000) arr.shift();
    this.histograms.set(name, arr);
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    this.counters.forEach((v, k) => { result[`counter_${k}`] = v; });
    this.gauges.forEach((v, k) => { result[`gauge_${k}`] = v; });
    return result;
  }
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
// 飞轮编排器 v2.0
// ============================================================================

export class EvolutionFlywheel {
  private config: FlywheelConfig;
  private metaLearner: MetaLearner;
  private shadowEvaluator: ShadowEvaluator;
  private championManager: ChampionChallengerManager;
  private knowledgeCrystallizer: KnowledgeCrystallizer;
  private eventBus: EventBus;
  private metrics = new FlywheelMetrics();

  private state: FlywheelState = {
    isRunning: false,
    currentCycle: 0,
    totalCycles: 0,
    lastCycleReport: null,
    cumulativeImprovement: 0,
    cycleHistory: [],
  };

  // 调度定时器
  private scheduleTimer: NodeJS.Timeout | null = null;

  // 回调
  private onCycleComplete?: (report: FlywheelCycleReport) => void;
  private onApprovalRequired?: (item: string, details: Record<string, unknown>) => Promise<boolean>;

  constructor(config: Partial<FlywheelConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_FLYWHEEL_CONFIG, ...config };
    this.metaLearner = new MetaLearner();
    this.shadowEvaluator = new ShadowEvaluator();
    this.championManager = new ChampionChallengerManager();
    this.knowledgeCrystallizer = new KnowledgeCrystallizer();
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 执行完整飞轮周期（v2.0: 全链路 DB 持久化 + 步骤日志）
  // ==========================================================================

  async executeCycle(
    diagnosisHistory: DiagnosisHistoryEntry[],
    evaluationDataset: EvaluationDataPoint[],
    challengerModel?: ModelCandidate
  ): Promise<FlywheelCycleReport> {
    if (this.state.isRunning) {
      throw new Error('飞轮正在运行中，不允许并发执行');
    }

    this.state.isRunning = true;
    this.state.currentCycle++;
    this.metrics.inc('flywheel_cycles_started_total');

    const cycleStartTime = Date.now();

    // 1. 创建 DB 周期记录
    const dbCycleId = await this.createCycleRecord(this.state.currentCycle);

    const report: FlywheelCycleReport = {
      cycleId: `flywheel_cycle_${this.state.currentCycle}_${cycleStartTime}`,
      cycleNumber: this.state.currentCycle,
      dbCycleId,
      startedAt: cycleStartTime,
      completedAt: null,
      status: 'running',
      dataDiscovery: null,
      hypotheses: [],
      shadowEvaluation: null,
      deployment: null,
      crystallization: null,
      strategy: null,
      performanceDelta: null,
      stepLogs: [],
    };

    try {
      // ========== Step 1: 数据发现 ==========
      const step1Log = await this.executeStep(dbCycleId, 1, 'data_discovery', async () => {
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

        return {
          input: { dataPointCount: dataPoints.length, expectedDimensions: expectedDimensions.length },
          output: { qualityScore: discovery.qualityScore, missingCount: discovery.missingDimensions.length },
          metrics: { quality_score: discovery.qualityScore, data_points: dataPoints.length },
        };
      });
      report.stepLogs.push(step1Log);

      // 闭环验证：Step 1 输出校验
      if (report.dataDiscovery && report.dataDiscovery.qualityScore < 0.3) {
        log.warn(`数据质量过低 (${report.dataDiscovery.qualityScore})，跳过后续步骤`);
        report.status = 'paused';
        await this.updateCycleRecord(dbCycleId, 'paused', report);
        return this.finalizeCycle(report);
      }

      // ========== Step 2: 假设生成 ==========
      const step2Log = await this.executeStep(dbCycleId, 2, 'hypothesis_generation', async () => {
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

        return {
          input: { performanceRecords: recentPerformance.length },
          output: { hypothesesGenerated: hypotheses.length, selected: report.hypotheses.length },
          metrics: { hypotheses_total: hypotheses.length, hypotheses_selected: report.hypotheses.length },
        };
      });
      report.stepLogs.push(step2Log);

      // ========== Step 3: 影子验证 ==========
      const step3Log = await this.executeStep(dbCycleId, 3, 'shadow_evaluation', async () => {
        if (!challengerModel || evaluationDataset.length === 0) {
          return {
            input: { hasChallenger: false, datasetSize: evaluationDataset.length },
            output: { skipped: true, reason: '无挑战者模型或评估数据集为空' },
            metrics: { skipped: 1 },
          };
        }

        const champion = this.championManager.getChampion();
        let championModel: ModelCandidate | null = null;

        if (champion) {
          championModel = {
            modelId: champion.modelId,
            modelVersion: champion.version,
            modelType: 'prediction',
            description: 'Current champion model',
            parameters: champion.parameters as Record<string, unknown>,
            createdAt: champion.registeredAt,
            predict: async (input) => input,
          };
        }

        const evalReport = await this.shadowEvaluator.evaluate(
          challengerModel,
          championModel,
          evaluationDataset
        );
        report.shadowEvaluation = evalReport;

        return {
          input: { challengerId: challengerModel.modelId, datasetSize: evaluationDataset.length },
          output: { verdict: evalReport.verdict, reason: evalReport.verdictReason },
          metrics: {
            challenger_mae: evalReport.challengerMetrics?.accuracy?.mae ?? 0,
            verdict_promote: evalReport.verdict === 'promote' ? 1 : 0,
          },
        };
      });
      report.stepLogs.push(step3Log);

      // ========== Step 4: 金丝雀部署 ==========
      const step4Log = await this.executeStep(dbCycleId, 4, 'canary_deployment', async () => {
        if (!report.shadowEvaluation || report.shadowEvaluation.verdict !== 'promote' || !challengerModel) {
          return {
            input: { verdict: report.shadowEvaluation?.verdict ?? 'none' },
            output: { skipped: true, reason: '评估未通过或无挑战者' },
            metrics: { deployed: 0 },
          };
        }

        // 人工审核
        if (this.config.requireHumanApproval && this.onApprovalRequired) {
          const approved = await this.onApprovalRequired('model_promotion', {
            challenger: challengerModel.modelId,
            verdict: report.shadowEvaluation.verdict,
            reason: report.shadowEvaluation.verdictReason,
          });
          if (!approved) {
            report.status = 'paused';
            return {
              input: { challengerId: challengerModel.modelId },
              output: { skipped: true, reason: '人工审核未通过' },
              metrics: { deployed: 0, approval_rejected: 1 },
            };
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
            mae: report.shadowEvaluation.challengerMetrics.accuracy.mae,
            rmse: report.shadowEvaluation.challengerMetrics.accuracy.rmse,
            f1: report.shadowEvaluation.challengerMetrics.anomalyDetection.f1,
          },
          tags: [`cycle_${this.state.currentCycle}`],
        });

        const plan = this.championManager.createDeploymentPlan(
          challengerModel.modelId,
          challengerModel.modelVersion
        );
        this.championManager.startDeployment();
        report.deployment = plan;

        return {
          input: { challengerId: challengerModel.modelId },
          output: { deploymentPlan: plan.stages.length, modelId: plan.modelId },
          metrics: { deployed: 1, stages: plan.stages.length },
        };
      });
      report.stepLogs.push(step4Log);

      // ========== Step 5: 反馈结晶 ==========
      const step5Log = await this.executeStep(dbCycleId, 5, 'feedback_crystallization', async () => {
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
        const avgScore = diagnosisHistory.slice(-10).reduce((s, h) => s + h.overallScore, 0) / Math.min(10, diagnosisHistory.length);
        this.metaLearner.recordPerformance(avgScore / 100);

        return {
          input: { historySize: diagnosisHistory.length },
          output: {
            patternsDiscovered: patterns.length,
            crystallized: crystallizedCount,
            rules: rulesCount,
            strategy: strategy.mode,
          },
          metrics: {
            patterns_discovered: patterns.length,
            knowledge_crystallized: crystallizedCount,
            rules_generated: rulesCount,
          },
        };
      });
      report.stepLogs.push(step5Log);

      // 计算性能变化
      const avgScore = diagnosisHistory.slice(-10).reduce((s, h) => s + h.overallScore, 0) / Math.min(10, diagnosisHistory.length);
      if (this.state.cycleHistory.length > 0) {
        const prevScore = this.state.cycleHistory[this.state.cycleHistory.length - 1].performanceDelta;
        report.performanceDelta = avgScore / 100 - (prevScore || avgScore / 100);
      } else {
        report.performanceDelta = 0;
      }

      if (report.status === 'running') {
        report.status = 'completed';
      }
    } catch (error) {
      report.status = 'failed';
      log.error('飞轮周期执行失败', error);
    }

    // 更新 DB 周期记录
    await this.updateCycleRecord(dbCycleId, report.status === 'completed' ? 'completed' : 'failed', report);

    return this.finalizeCycle(report);
  }

  // ==========================================================================
  // 2. 步骤执行器（v2.0: DB 持久化 + Prometheus + 错误隔离）
  // ==========================================================================

  private async executeStep(
    dbCycleId: number | null,
    stepNumber: number,
    stepName: StepName,
    executor: () => Promise<{
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      metrics: Record<string, number>;
    }>,
  ): Promise<StepLogEntry> {
    const startTime = Date.now();
    const logEntry: StepLogEntry = {
      stepNumber,
      stepName,
      status: 'running',
      startedAt: startTime,
      completedAt: null,
      durationMs: null,
      inputSummary: null,
      outputSummary: null,
      metrics: null,
      errorMessage: null,
    };

    // 创建 DB 步骤日志
    let dbLogId: number | null = null;
    if (dbCycleId) {
      dbLogId = await this.createStepLog(dbCycleId, stepNumber, stepName);
    }

    try {
      log.info(`飞轮步骤开始: [${stepNumber}/5] ${stepName}`);

      const result = await executor();

      logEntry.status = 'completed';
      logEntry.completedAt = Date.now();
      logEntry.durationMs = logEntry.completedAt - startTime;
      logEntry.inputSummary = result.input;
      logEntry.outputSummary = result.output;
      logEntry.metrics = result.metrics;

      // Prometheus
      this.metrics.inc('flywheel_steps_completed_total', { step: stepName });
      this.metrics.observe('flywheel_step_duration_ms', logEntry.durationMs);

      log.info(`飞轮步骤完成: [${stepNumber}/5] ${stepName}, 耗时 ${logEntry.durationMs}ms`);
    } catch (error) {
      logEntry.status = 'failed';
      logEntry.completedAt = Date.now();
      logEntry.durationMs = logEntry.completedAt - startTime;
      logEntry.errorMessage = error instanceof Error ? error.message : String(error);

      this.metrics.inc('flywheel_steps_failed_total', { step: stepName });
      log.error(`飞轮步骤失败: [${stepNumber}/5] ${stepName}`, error);
    }

    // 更新 DB 步骤日志
    if (dbLogId) {
      await this.updateStepLog(dbLogId, logEntry);
    }

    // EventBus 通知
    await this.eventBus.publish({
      type: `flywheel.step.${logEntry.status}`,
      source: 'evolution-flywheel',
      data: { stepNumber, stepName, status: logEntry.status, durationMs: logEntry.durationMs },
    });

    return logEntry;
  }

  // ==========================================================================
  // 3. 趋势分析（v2.0 新增）
  // ==========================================================================

  async analyzeTrend(windowSize = 12): Promise<TrendAnalysis> {
    const db = await getDb();
    if (!db) {
      return { direction: 'stable', slope: 0, recentScores: [], averageImprovement: 0, bestCycle: 0, worstCycle: 0 };
    }

    const cycles = await db.select().from(evolutionCycles)
      .orderBy(desc(evolutionCycles.startedAt))
      .limit(windowSize);

    if (cycles.length < 2) {
      return { direction: 'stable', slope: 0, recentScores: [], averageImprovement: 0, bestCycle: 0, worstCycle: 0 };
    }

    // 按时间正序
    const sorted = cycles.reverse();
    const scores = sorted.map(c => c.accuracyAfter ?? c.accuracyBefore ?? 0);

    // 线性回归斜率
    const n = scores.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = scores.reduce((acc, y, i) => acc + i * y, 0);
    const sumX2 = scores.reduce((acc, _, i) => acc + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // 平均改善
    const improvements = sorted
      .filter(c => c.improvementPercent !== null)
      .map(c => c.improvementPercent!);
    const avgImprovement = improvements.length > 0
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length
      : 0;

    // 最佳/最差周期
    const bestIdx = scores.indexOf(Math.max(...scores));
    const worstIdx = scores.indexOf(Math.min(...scores));

    const direction: TrendAnalysis['direction'] =
      slope > 0.01 ? 'improving' :
      slope < -0.01 ? 'degrading' :
      'stable';

    const result: TrendAnalysis = {
      direction,
      slope,
      recentScores: scores,
      averageImprovement: avgImprovement,
      bestCycle: sorted[bestIdx]?.cycleNumber ?? 0,
      worstCycle: sorted[worstIdx]?.cycleNumber ?? 0,
    };

    // Prometheus
    this.metrics.set('flywheel_trend_slope', {}, slope);
    this.metrics.set('flywheel_avg_improvement', {}, avgImprovement);

    return result;
  }

  // ==========================================================================
  // 4. 自动调度（v2.0 新增）
  // ==========================================================================

  async startScheduler(): Promise<void> {
    if (this.scheduleTimer) return;

    log.info('飞轮调度器启动');

    // 每分钟检查是否有到期的调度
    this.scheduleTimer = setInterval(async () => {
      try {
        await this.checkSchedules();
      } catch (err) {
        log.error('调度检查失败', err);
      }
    }, 60_000);
  }

  stopScheduler(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
      log.info('飞轮调度器停止');
    }
  }

  private async checkSchedules(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const schedules = await db.select().from(evolutionFlywheelSchedules)
      .where(eq(evolutionFlywheelSchedules.enabled, 1));

    for (const schedule of schedules) {
      // 检查是否到期
      if (schedule.nextTriggerAt && schedule.nextTriggerAt <= now) {
        // 检查最小间隔
        if (schedule.lastTriggeredAt) {
          const hoursSinceLast = (now.getTime() - schedule.lastTriggeredAt.getTime()) / 3600000;
          if (hoursSinceLast < schedule.minIntervalHours) continue;
        }

        // 检查并发限制
        if (this.state.isRunning && schedule.maxConcurrent <= 1) continue;

        // 触发
        log.info(`调度触发: ${schedule.name}`);
        await db.update(evolutionFlywheelSchedules)
          .set({
            lastTriggeredAt: now,
            totalRuns: schedule.totalRuns + 1,
            nextTriggerAt: this.computeNextTrigger(schedule.cronExpression),
          })
          .where(eq(evolutionFlywheelSchedules.id, schedule.id));

        await this.eventBus.publish({
          type: 'flywheel.schedule.triggered',
          source: 'evolution-flywheel',
          data: { scheduleId: schedule.id, name: schedule.name },
        });

        this.metrics.inc('flywheel_schedule_triggers_total');
      }
    }
  }

  private computeNextTrigger(cronExpression: string): Date {
    // 简化实现：解析 cron 表达式计算下次触发时间
    // 生产环境应使用 cron-parser 库
    const now = new Date();
    const parts = cronExpression.split(' ');
    if (parts.length >= 2) {
      const hours = parseInt(parts[1]) || 0;
      const next = new Date(now);
      next.setDate(next.getDate() + 7); // 默认每周
      next.setHours(hours, 0, 0, 0);
      return next;
    }
    // 默认 7 天后
    return new Date(now.getTime() + 7 * 24 * 3600000);
  }

  async createSchedule(params: {
    name: string;
    cronExpression: string;
    config: Record<string, unknown>;
    minIntervalHours?: number;
  }): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

    const result = await db.insert(evolutionFlywheelSchedules).values({
      name: params.name,
      cronExpression: params.cronExpression,
      config: params.config,
      enabled: 1,
      maxConcurrent: 1,
      minIntervalHours: params.minIntervalHours ?? 24,
      nextTriggerAt: this.computeNextTrigger(params.cronExpression),
    });

    return Number(result[0].insertId);
  }

  async getSchedules(): Promise<typeof evolutionFlywheelSchedules.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(evolutionFlywheelSchedules).orderBy(desc(evolutionFlywheelSchedules.createdAt));
  }

  // ==========================================================================
  // 5. DB 持久化方法
  // ==========================================================================

  private async createCycleRecord(cycleNumber: number): Promise<number | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(evolutionCycles).values({
        cycleNumber,
        startedAt: new Date(),
        status: 'running',
      });
      return Number(result[0].insertId);
    } catch (err) {
      log.error('创建周期记录失败', err);
      return null;
    }
  }

  private async updateCycleRecord(
    dbCycleId: number | null,
    status: 'completed' | 'failed' | 'paused',
    report: FlywheelCycleReport,
  ): Promise<void> {
    if (!dbCycleId) return;
    const db = await getDb();
    if (!db) return;

    try {
      await db.update(evolutionCycles)
        .set({
          status: status === 'paused' ? 'paused' : status,
          completedAt: new Date(),
          edgeCasesFound: report.crystallization?.patternsDiscovered ?? 0,
          hypothesesGenerated: report.hypotheses.length,
          modelsEvaluated: report.shadowEvaluation ? 1 : 0,
          deployed: report.deployment ? 1 : 0,
          knowledgeCrystallized: report.crystallization?.knowledgeCrystallized ?? 0,
          improvementPercent: report.performanceDelta ? report.performanceDelta * 100 : null,
          summary: this.generateCycleSummary(report),
        })
        .where(eq(evolutionCycles.id, dbCycleId));
    } catch (err) {
      log.error('更新周期记录失败', err);
    }
  }

  private async createStepLog(cycleId: number, stepNumber: number, stepName: string): Promise<number | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(evolutionStepLogs).values({
        cycleId,
        stepNumber,
        stepName,
        status: 'running',
        startedAt: new Date(),
      });
      return Number(result[0].insertId);
    } catch (err) {
      log.error('创建步骤日志失败', err);
      return null;
    }
  }

  private async updateStepLog(logId: number, entry: StepLogEntry): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.update(evolutionStepLogs)
        .set({
          status: entry.status,
          completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
          durationMs: entry.durationMs,
          inputSummary: entry.inputSummary,
          outputSummary: entry.outputSummary,
          metrics: entry.metrics,
          errorMessage: entry.errorMessage,
        })
        .where(eq(evolutionStepLogs.id, logId));
    } catch (err) {
      log.error('更新步骤日志失败', err);
    }
  }

  // ==========================================================================
  // 6. 查询方法
  // ==========================================================================

  getState(): FlywheelState {
    return { ...this.state };
  }

  getMetaLearner(): MetaLearner { return this.metaLearner; }
  getShadowEvaluator(): ShadowEvaluator { return this.shadowEvaluator; }
  getChampionManager(): ChampionChallengerManager { return this.championManager; }
  getKnowledgeCrystallizer(): KnowledgeCrystallizer { return this.knowledgeCrystallizer; }

  getPrometheusMetrics(): Record<string, number> {
    return this.metrics.getAll();
  }

  async getCycleHistory(limit = 20): Promise<typeof evolutionCycles.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(evolutionCycles)
      .orderBy(desc(evolutionCycles.startedAt))
      .limit(limit);
  }

  async getStepLogs(cycleId: number): Promise<typeof evolutionStepLogs.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(evolutionStepLogs)
      .where(eq(evolutionStepLogs.cycleId, cycleId))
      .orderBy(evolutionStepLogs.stepNumber);
  }

  // ==========================================================================
  // 回调设置
  // ==========================================================================

  setOnCycleComplete(callback: (report: FlywheelCycleReport) => void): void {
    this.onCycleComplete = callback;
  }

  setOnApprovalRequired(callback: (item: string, details: Record<string, unknown>) => Promise<boolean>): void {
    this.onApprovalRequired = callback;
  }

  // ==========================================================================
  // 内部工具方法
  // ==========================================================================

  private finalizeCycle(report: FlywheelCycleReport): FlywheelCycleReport {
    report.completedAt = Date.now();
    this.state.lastCycleReport = report;
    this.state.totalCycles++;
    this.state.cycleHistory.push(report);
    this.state.isRunning = false;

    if (report.performanceDelta) {
      this.state.cumulativeImprovement += report.performanceDelta;
    }

    // Prometheus
    this.metrics.inc('flywheel_cycles_completed_total', { status: report.status });
    this.metrics.set('flywheel_cumulative_improvement', {}, this.state.cumulativeImprovement);
    this.metrics.observe('flywheel_cycle_duration_ms', report.completedAt - report.startedAt);

    // EventBus
    this.eventBus.publish({
      type: 'flywheel.cycle.completed',
      source: 'evolution-flywheel',
      data: {
        cycleId: report.cycleId,
        cycleNumber: report.cycleNumber,
        status: report.status,
        durationMs: report.completedAt - report.startedAt,
        performanceDelta: report.performanceDelta,
      },
    });

    this.onCycleComplete?.(report);
    return report;
  }

  private generateCycleSummary(report: FlywheelCycleReport): string {
    const parts: string[] = [];
    parts.push(`周期 #${report.cycleNumber}`);

    if (report.dataDiscovery) {
      parts.push(`数据质量 ${(report.dataDiscovery.qualityScore * 100).toFixed(1)}%`);
    }
    if (report.hypotheses.length > 0) {
      parts.push(`生成 ${report.hypotheses.length} 个假设`);
    }
    if (report.shadowEvaluation) {
      parts.push(`影子评估: ${report.shadowEvaluation.verdict}`);
    }
    if (report.deployment) {
      parts.push(`已部署模型 ${report.deployment.modelId}`);
    }
    if (report.crystallization) {
      parts.push(`结晶 ${report.crystallization.knowledgeCrystallized} 条知识`);
    }
    if (report.performanceDelta !== null) {
      const sign = report.performanceDelta >= 0 ? '+' : '';
      parts.push(`性能变化 ${sign}${(report.performanceDelta * 100).toFixed(2)}%`);
    }

    return parts.join(' | ');
  }

  /**
   * 销毁：清理定时器
   */
  destroy(): void {
    this.stopScheduler();
  }
}
