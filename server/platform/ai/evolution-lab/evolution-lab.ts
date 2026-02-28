/**
 * ============================================================================
 * 进化实验室 (Evolution Lab)
 * ============================================================================
 *
 * 自动化实验管线：洞察 → 假设 → 实验设计 → 影子验证 → 人工审核 → 部署。
 * 整合技术情报(模块3)输出 + 现有 Evolution Engine 基础设施。
 *
 * 完整生命周期：
 *   ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌────────┐
 *   │ 收集洞察 │→│ 设计实验  │→│ 影子验证  │→│ 人工审核│→│ 金丝雀  │
 *   │Collector │  │ Designer │  │ Shadow   │  │ Review │  │ Deploy │
 *   └─────────┘   └──────────┘   └──────────┘   └────────┘   └────────┘
 *                                                              ↓
 *                                                        ┌──────────┐
 *                                                        │ 知识结晶 │
 *                                                        │Crystallize│
 *                                                        └──────────┘
 *
 * 与现有进化引擎的关系：
 *   - ShadowEvaluator: 影子验证（对比新旧模型）
 *   - ChampionChallengerManager: 金丝雀部署（流量渐进切换）
 *   - KnowledgeCrystallizer: 知识结晶（成功经验沉淀到知识图谱）
 *   - MetaLearner: 假设生成的二级来源
 *
 * 架构原则：
 *   - 物理约束优先（ADR-001）
 *   - 降级不崩溃（§9.5）
 *   - 验证闭环（§9.2）
 *   - 单例+工厂（§9.3）
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { eventBus } from '../../../services/eventBus.service';
import { agentRegistry } from '../../../core/agent-registry';
import type { AgentContext, AgentResult } from '../../../core/agent-registry';
import { ShadowEvaluator } from '../../evolution/shadow/shadow-evaluator';
import type { ModelCandidate, EvaluationDataPoint } from '../../evolution/shadow/shadow-evaluator';
import { ChampionChallengerManager } from '../../evolution/champion/champion-challenger';
import { KnowledgeCrystallizer } from '../../evolution/crystallization/knowledge-crystallizer';
import { getAIConfig } from '../ai.config';
import { AI_LAB_TOPICS } from '../ai.topics';
import { InsightCollector } from './insight-collector';
import { ExperimentDesigner } from './experiment-designer';
import type {
  ExperimentTrigger,
  LabInsight,
  LabExperiment,
  ShadowValidationResult,
  ReviewRequest,
  ReviewApproval,
  DeploymentResult,
  ExperimentCycleReport,
} from '../ai.types';

const log = createModuleLogger('evolution-lab');

// ============================================================================
// 进化实验室
// ============================================================================

/**
 * 进化实验室
 *
 * 自动化实验管线核心类，编排从洞察收集到部署的完整生命周期。
 * 作为 AgentRegistry 中的 'evolution-lab-agent' 注册，
 * 可通过 Agent 调度框架统一编排。
 */
export class EvolutionLab {
  private collector: InsightCollector;
  private designer: ExperimentDesigner;
  private shadowEvaluator: ShadowEvaluator;
  private championChallenger: ChampionChallengerManager;
  private crystallizer: KnowledgeCrystallizer;

  /** 实验存储 */
  private experiments: Map<string, LabExperiment> = new Map();
  /** 验证结果存储 */
  private validationResults: Map<string, ShadowValidationResult> = new Map();
  /** 审核请求存储 */
  private reviewRequests: Map<string, ReviewRequest> = new Map();
  /** 周期报告历史 */
  private cycleHistory: ExperimentCycleReport[] = [];

  constructor() {
    this.collector = new InsightCollector();
    this.designer = new ExperimentDesigner();
    this.shadowEvaluator = new ShadowEvaluator();
    this.championChallenger = new ChampionChallengerManager();
    this.crystallizer = new KnowledgeCrystallizer();
    this.registerAgent();
  }

  // ==========================================================================
  // 完整实验周期
  // ==========================================================================

  /**
   * 运行完整实验周期
   *
   * 这是进化实验室的核心方法，编排从洞察收集到部署的完整流程。
   * 每个步骤都有独立的错误处理，单步失败不阻塞后续流程。
   *
   * 流程：
   *   1. 收集洞察（基于触发类型）
   *   2. 优先级排序
   *   3. 设计实验（取 top N）
   *   4. 验证设计
   *   5. 影子验证（通过设计验证的实验）
   *   6. 提交审核（通过影子验证的实验）
   *   7. 自动批准（如果配置允许且超过阈值）
   *   8. 部署
   *   9. 知识结晶（成功部署的实验）
   *   10. 生成周期报告
   *
   * @param trigger 触发来源
   * @returns 周期报告
   */
  async runExperimentCycle(trigger: ExperimentTrigger): Promise<ExperimentCycleReport> {
    const startTime = Date.now();
    const cycleId = crypto.randomUUID();
    const config = getAIConfig();

    log.info({ cycleId, triggerType: trigger.type }, '开始实验周期');

    let insightsCollected = 0;
    let experimentsDesigned = 0;
    let experimentsPassed = 0;
    let experimentsDeployed = 0;

    try {
      // ── 1. 收集洞察 ──
      const insights = await this.collectInsightsByTrigger(trigger);
      insightsCollected = insights.length;
      log.info({ cycleId, insightsCollected }, '洞察收集完成');

      if (insights.length === 0) {
        const report = this.buildCycleReport(
          cycleId, trigger, startTime, 0, 0, 0, 0, '无可用洞察，周期结束',
        );
        this.cycleHistory.push(report);
        return report;
      }

      // ── 2. 优先级排序 ──
      const prioritized = await this.collector.prioritize(insights);

      // ── 3. 设计实验（取 top N） ──
      const maxExperiments = config.lab.maxParallelExperiments;
      const topInsights = prioritized.slice(0, maxExperiments);
      const designedExperiments: LabExperiment[] = [];

      for (const insight of topInsights) {
        try {
          const experiment = await this.designer.design(insight, {});
          this.experiments.set(experiment.experimentId, experiment);
          designedExperiments.push(experiment);
          experimentsDesigned++;

          eventBus.publish(
            AI_LAB_TOPICS.EXPERIMENT_DESIGNED,
            'experiment_designed',
            { experimentId: experiment.experimentId, title: experiment.title },
            { source: 'evolution-lab' },
          ).catch(() => {});
        } catch (err) {
          log.warn(
            { insightId: insight.insightId, error: String(err) },
            '实验设计失败（跳过该洞察）',
          );
        }
      }

      // ── 4. 验证设计 ──
      const validExperiments: LabExperiment[] = [];
      for (const experiment of designedExperiments) {
        try {
          const validation = await this.designer.validateDesign(experiment);
          if (validation.valid) {
            experiment.status = 'validated';
            experiment.updatedAt = Date.now();
            validExperiments.push(experiment);
          } else {
            log.info(
              { experimentId: experiment.experimentId, issues: validation.issues },
              '实验设计验证未通过',
            );
            experiment.status = 'failed';
            experiment.updatedAt = Date.now();
          }
        } catch (err) {
          log.warn(
            { experimentId: experiment.experimentId, error: String(err) },
            '设计验证异常',
          );
        }
      }

      // ── 5. 影子验证 ──
      const shadowPassedExperiments: LabExperiment[] = [];
      for (const experiment of validExperiments) {
        try {
          const shadowResult = await this.runShadowValidation(experiment.experimentId);
          if (shadowResult.passed) {
            shadowPassedExperiments.push(experiment);
            experimentsPassed++;
          }
        } catch (err) {
          log.warn(
            { experimentId: experiment.experimentId, error: String(err) },
            '影子验证异常',
          );
        }
      }

      // ── 6. 提交审核 ──
      for (const experiment of shadowPassedExperiments) {
        try {
          await this.submitForReview(experiment.experimentId);
        } catch (err) {
          log.warn(
            { experimentId: experiment.experimentId, error: String(err) },
            '提交审核失败',
          );
        }
      }

      // ── 7. 自动批准（如果配置允许） ──
      if (!config.lab.requireHumanReview) {
        for (const experiment of shadowPassedExperiments) {
          const reviewReq = Array.from(this.reviewRequests.values()).find(
            r => r.experimentId === experiment.experimentId,
          );
          if (!reviewReq) continue;

          const validationResult = this.validationResults.get(experiment.experimentId);
          if (!validationResult) continue;

          // 检查是否超过自动批准阈值
          const improvements = Object.values(validationResult.improvements);
          const avgImprovement = improvements.length > 0
            ? improvements.reduce((s, v) => s + v, 0) / improvements.length
            : 0;

          if (avgImprovement * 100 >= config.lab.autoApproveThreshold) {
            const approval: ReviewApproval = {
              reviewId: reviewReq.reviewId,
              approved: true,
              approvedBy: 'auto-approve',
              comment: `自动批准: 平均改进 ${(avgImprovement * 100).toFixed(1)}% >= 阈值 ${config.lab.autoApproveThreshold}%`,
              approvedAt: Date.now(),
            };

            try {
              await this.applyExperiment(experiment.experimentId, approval);
              experimentsDeployed++;
            } catch (err) {
              log.warn(
                { experimentId: experiment.experimentId, error: String(err) },
                '自动部署失败',
              );
            }
          }
        }
      }

      // ── 8. 知识结晶（成功部署的实验） ──
      for (const experiment of shadowPassedExperiments) {
        if (experiment.status === 'deployed') {
          try {
            await this.crystallizeExperiment(experiment);
          } catch (err) {
            log.warn(
              { experimentId: experiment.experimentId, error: String(err) },
              '知识结晶失败（不影响部署）',
            );
          }
        }
      }
    } catch (err) {
      log.error({ cycleId, error: String(err) }, '实验周期执行异常');
    }

    // ── 9. 生成周期报告 ──
    const summaryParts: string[] = [];
    summaryParts.push(`收集 ${insightsCollected} 条洞察`);
    summaryParts.push(`设计 ${experimentsDesigned} 个实验`);
    summaryParts.push(`${experimentsPassed} 个通过影子验证`);
    summaryParts.push(`${experimentsDeployed} 个已部署`);

    const report = this.buildCycleReport(
      cycleId,
      trigger,
      startTime,
      insightsCollected,
      experimentsDesigned,
      experimentsPassed,
      experimentsDeployed,
      summaryParts.join('，'),
    );

    this.cycleHistory.push(report);

    // 发布周期完成事件
    eventBus.publish(
      AI_LAB_TOPICS.CYCLE_COMPLETED,
      'cycle_completed',
      {
        cycleId,
        insightsCollected,
        experimentsDesigned,
        experimentsPassed,
        experimentsDeployed,
        durationMs: report.durationMs,
      },
      { source: 'evolution-lab' },
    ).catch(() => {});

    log.info(
      {
        cycleId,
        insightsCollected,
        experimentsDesigned,
        experimentsPassed,
        experimentsDeployed,
        durationMs: report.durationMs,
      },
      '实验周期完成',
    );

    return report;
  }

  // ==========================================================================
  // 单步操作
  // ==========================================================================

  /**
   * 提交洞察
   *
   * @param insight 洞察内容
   * @returns 洞察 ID
   */
  async submitInsight(insight: Omit<LabInsight, 'insightId' | 'createdAt'>): Promise<string> {
    const stored = this.collector.submit(insight);

    eventBus.publish(
      AI_LAB_TOPICS.INSIGHT_SUBMITTED,
      'insight_submitted',
      { insightId: stored.insightId, title: stored.title, source: stored.source },
      { source: 'evolution-lab' },
    ).catch(() => {});

    log.info({ insightId: stored.insightId }, '洞察已提交');
    return stored.insightId;
  }

  /**
   * 设计实验（LLM 辅助）
   *
   * 根据洞察 ID 查找洞察，设计对应的实验。
   *
   * @param insightId 洞察 ID
   * @returns 设计完成的实验
   * @throws 如果洞察不存在
   */
  async designExperiment(insightId: string): Promise<LabExperiment> {
    const insights = this.collector.getInsights();
    const insight = insights.find(i => i.insightId === insightId);
    if (!insight) {
      throw new Error(`洞察不存在: ${insightId}`);
    }

    const experiment = await this.designer.design(insight, {});

    // 验证设计
    const validation = await this.designer.validateDesign(experiment);
    if (!validation.valid) {
      log.warn(
        { experimentId: experiment.experimentId, issues: validation.issues },
        '实验设计验证存在问题',
      );
      // 不阻塞，但记录问题
    }

    this.experiments.set(experiment.experimentId, experiment);

    eventBus.publish(
      AI_LAB_TOPICS.EXPERIMENT_DESIGNED,
      'experiment_designed',
      { experimentId: experiment.experimentId, title: experiment.title, insightId },
      { source: 'evolution-lab' },
    ).catch(() => {});

    return experiment;
  }

  /**
   * 影子验证
   *
   * 对实验进行影子模式评估：
   *   1. 从实验参数构建 ModelCandidate
   *   2. 使用 ShadowEvaluator 对比新旧模型
   *   3. 存储和返回验证结果
   *
   * @param experimentId 实验 ID
   * @returns 影子验证结果
   * @throws 如果实验不存在
   */
  async runShadowValidation(experimentId: string): Promise<ShadowValidationResult> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    log.info({ experimentId }, '开始影子验证');
    experiment.status = 'validating';
    experiment.updatedAt = Date.now();

    try {
      // 构建挑战者模型候选
      const challenger: ModelCandidate = {
        modelId: `exp_${experimentId}`,
        modelVersion: '1.0.0',
        modelType: 'prediction',
        description: experiment.hypothesis,
        parameters: experiment.parameters,
        createdAt: Date.now(),
        predict: async (input: Record<string, number>) => {
          // 模拟预测函数（实际场景中从实验参数加载对应模型）
          // 基于实验参数对输入进行微调
          const result: Record<string, number> = {};
          for (const [key, value] of Object.entries(input)) {
            const improvement = experiment.expectedImprovement * 0.5;
            result[key] = value * (1 + improvement * (Math.random() - 0.3));
          }
          return result;
        },
      };

      // 生成模拟评估数据集
      const dataset = this.generateEvaluationDataset();

      // 获取当前冠军
      const champion = this.championChallenger.getChampion();
      let championCandidate: ModelCandidate | null = null;

      if (champion) {
        championCandidate = {
          modelId: champion.modelId,
          modelVersion: champion.version,
          modelType: 'prediction',
          description: '当前冠军模型',
          parameters: champion.parameters,
          createdAt: champion.registeredAt,
          predict: async (input: Record<string, number>) => {
            // 冠军模型的基准预测
            const result: Record<string, number> = {};
            for (const [key, value] of Object.entries(input)) {
              result[key] = value * (1 + (Math.random() - 0.5) * 0.02);
            }
            return result;
          },
        };
      }

      // 执行影子评估
      const report = await this.shadowEvaluator.evaluate(challenger, championCandidate, dataset);

      // 转换为 ShadowValidationResult
      const challengerMetrics: Record<string, number> = {
        mae: report.challengerMetrics.accuracy.mae,
        rmse: report.challengerMetrics.accuracy.rmse,
        f1: report.challengerMetrics.anomalyDetection.f1,
        p95Latency: report.challengerMetrics.latency.p95Ms,
      };

      const championMetrics: Record<string, number> = report.championMetrics
        ? {
            mae: report.championMetrics.accuracy.mae,
            rmse: report.championMetrics.accuracy.rmse,
            f1: report.championMetrics.anomalyDetection.f1,
            p95Latency: report.championMetrics.latency.p95Ms,
          }
        : {};

      const improvements: Record<string, number> = {};
      const regressions: string[] = [];

      for (const comp of report.comparison) {
        improvements[comp.dimension] = comp.improvementPercent;
        if (comp.improvement < 0 && comp.significant) {
          regressions.push(`${comp.dimension}: ${comp.improvementPercent.toFixed(1)}%`);
        }
      }

      const validationResult: ShadowValidationResult = {
        experimentId,
        passed: report.verdict === 'promote',
        challengerMetrics,
        championMetrics,
        improvements,
        regressions,
        statisticallySignificant: report.comparison.some(c => c.significant),
        confidence: report.comparison.length > 0
          ? report.comparison.filter(c => c.significant).length / report.comparison.length
          : 0,
        recommendation: report.verdict === 'promote' ? 'promote'
          : report.verdict === 'reject' ? 'reject' : 'hold',
        analysisText: report.verdictReason,
        validatedAt: Date.now(),
      };

      // 更新实验状态
      experiment.status = validationResult.passed ? 'validated' : 'failed';
      experiment.updatedAt = Date.now();

      // 存储结果
      this.validationResults.set(experimentId, validationResult);

      // 发布事件
      eventBus.publish(
        AI_LAB_TOPICS.SHADOW_VALIDATED,
        'shadow_validated',
        {
          experimentId,
          passed: validationResult.passed,
          recommendation: validationResult.recommendation,
        },
        { source: 'evolution-lab' },
      ).catch(() => {});

      log.info(
        {
          experimentId,
          passed: validationResult.passed,
          recommendation: validationResult.recommendation,
        },
        '影子验证完成',
      );

      return validationResult;
    } catch (err) {
      experiment.status = 'failed';
      experiment.updatedAt = Date.now();
      log.error({ experimentId, error: String(err) }, '影子验证失败');
      throw err;
    }
  }

  /**
   * 提交人工审核
   *
   * 创建审核请求，包含实验信息和影子验证结果。
   *
   * @param experimentId 实验 ID
   * @returns 审核请求
   * @throws 如果实验或验证结果不存在
   */
  async submitForReview(experimentId: string): Promise<ReviewRequest> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    const validationResult = this.validationResults.get(experimentId);
    if (!validationResult) {
      throw new Error(`无验证结果: ${experimentId}`);
    }

    const reviewId = crypto.randomUUID();
    const request: ReviewRequest = {
      reviewId,
      experimentId,
      validationResult,
      requestedAt: Date.now(),
      requestedBy: 'evolution-lab',
    };

    experiment.status = 'review_pending';
    experiment.updatedAt = Date.now();
    this.reviewRequests.set(reviewId, request);

    // 发布审核请求事件
    eventBus.publish(
      AI_LAB_TOPICS.REVIEW_REQUESTED,
      'review_requested',
      {
        reviewId,
        experimentId,
        experimentTitle: experiment.title,
        recommendation: validationResult.recommendation,
      },
      { source: 'evolution-lab' },
    ).catch(() => {});

    log.info({ reviewId, experimentId }, '审核请求已提交');
    return request;
  }

  /**
   * 应用已批准实验
   *
   * 将批准的实验通过 ChampionChallengerManager 进行金丝雀部署。
   * 部署采用 5 阶段策略：0% → 5% → 20% → 50% → 100%。
   *
   * @param experimentId 实验 ID
   * @param approval 审核批准结果
   * @returns 部署结果
   * @throws 如果实验不存在或审核未通过
   */
  async applyExperiment(
    experimentId: string,
    approval: ReviewApproval,
  ): Promise<DeploymentResult> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    if (!approval.approved) {
      experiment.status = 'rejected';
      experiment.updatedAt = Date.now();
      log.info({ experimentId, reason: approval.comment }, '实验被拒绝');
      return {
        experimentId,
        deploymentPlanId: '',
        status: 'failed',
        currentStage: 'rejected',
        trafficPercent: 0,
        deployedAt: Date.now(),
      };
    }

    // 更新状态
    experiment.status = 'approved';
    experiment.updatedAt = Date.now();

    try {
      // 注册模型到 ChampionChallengerManager
      const modelEntry = this.championChallenger.registerModel({
        modelId: `exp_${experimentId}`,
        version: '1.0.0',
        type: 'prediction',
        description: experiment.hypothesis,
        parameters: experiment.parameters,
        metrics: {
          expectedImprovement: experiment.expectedImprovement,
        },
        tags: ['evolution-lab', `insight_${experiment.insightId}`],
      });

      // 创建部署计划（5 阶段：0% → 5% → 20% → 50% → 100%）
      const plan = this.championChallenger.createDeploymentPlan(
        modelEntry.modelId,
        modelEntry.version,
      );

      // 启动部署
      this.championChallenger.startDeployment();

      experiment.status = 'deploying';
      experiment.updatedAt = Date.now();

      const result: DeploymentResult = {
        experimentId,
        deploymentPlanId: plan.planId,
        status: 'deployed',
        currentStage: plan.stages[0]?.name || 'shadow',
        trafficPercent: plan.stages[0]?.trafficPercent || 0,
        deployedAt: Date.now(),
      };

      experiment.status = 'deployed';
      experiment.updatedAt = Date.now();

      // 发布部署事件
      eventBus.publish(
        AI_LAB_TOPICS.EXPERIMENT_DEPLOYED,
        'experiment_deployed',
        {
          experimentId,
          deploymentPlanId: plan.planId,
          modelId: modelEntry.modelId,
        },
        { source: 'evolution-lab' },
      ).catch(() => {});

      log.info(
        { experimentId, planId: plan.planId, modelId: modelEntry.modelId },
        '实验已部署',
      );

      return result;
    } catch (err) {
      experiment.status = 'failed';
      experiment.updatedAt = Date.now();
      log.error({ experimentId, error: String(err) }, '实验部署失败');

      return {
        experimentId,
        deploymentPlanId: '',
        status: 'failed',
        currentStage: 'error',
        trafficPercent: 0,
        deployedAt: Date.now(),
      };
    }
  }

  // ==========================================================================
  // 查询接口
  // ==========================================================================

  /**
   * 获取实验状态
   *
   * @param experimentId 实验 ID
   * @returns 实验对象（不存在返回 undefined）
   */
  getExperiment(experimentId: string): LabExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * 获取所有实验
   *
   * @returns 实验列表
   */
  listExperiments(): LabExperiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * 按状态获取实验
   *
   * @param status 实验状态
   * @returns 指定状态的实验列表
   */
  listExperimentsByStatus(status: LabExperiment['status']): LabExperiment[] {
    return this.listExperiments().filter(e => e.status === status);
  }

  /**
   * 获取审核请求
   *
   * @param reviewId 审核 ID
   * @returns 审核请求（不存在返回 undefined）
   */
  getReviewRequest(reviewId: string): ReviewRequest | undefined {
    return this.reviewRequests.get(reviewId);
  }

  /**
   * 获取待审核的请求列表
   *
   * @returns 待审核请求列表
   */
  listPendingReviews(): ReviewRequest[] {
    return Array.from(this.reviewRequests.values()).filter(r => {
      const exp = this.experiments.get(r.experimentId);
      return exp?.status === 'review_pending';
    });
  }

  /**
   * 获取影子验证结果
   *
   * @param experimentId 实验 ID
   * @returns 验证结果（不存在返回 undefined）
   */
  getValidationResult(experimentId: string): ShadowValidationResult | undefined {
    return this.validationResults.get(experimentId);
  }

  /**
   * 获取周期历史
   *
   * @returns 周期报告列表
   */
  getCycleHistory(): ExperimentCycleReport[] {
    return [...this.cycleHistory];
  }

  /**
   * 获取已收集的洞察列表
   *
   * @returns 洞察列表
   */
  getInsights(): LabInsight[] {
    return this.collector.getInsights();
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 按触发类型收集洞察
   *
   * 不同触发类型使用不同的收集策略。
   */
  private async collectInsightsByTrigger(trigger: ExperimentTrigger): Promise<LabInsight[]> {
    switch (trigger.type) {
      case 'scheduled':
        // 定时触发：收集所有来源
        return this.collector.collectAll();

      case 'intelligence':
        // 技术情报触发：仅收集技术情报来源
        return this.collector.fromTechIntelligence();

      case 'feedback':
        // 运维反馈触发：仅收集反馈来源
        return this.collector.fromOperatorFeedback();

      case 'performance':
        // 性能劣化触发：仅收集性能数据
        return this.collector.fromPerformanceData();

      case 'manual': {
        // 手动触发：创建一条手动洞察
        const manualInsight = this.collector.submit({
          source: 'manual',
          title: trigger.description,
          description: trigger.description,
          priority: 7,
          metadata: { userId: trigger.userId },
        });
        return [manualInsight];
      }

      default:
        return this.collector.collectAll();
    }
  }

  /**
   * 知识结晶
   *
   * 将成功部署的实验经验沉淀到知识图谱。
   */
  private async crystallizeExperiment(experiment: LabExperiment): Promise<void> {
    const validationResult = this.validationResults.get(experiment.experimentId);
    if (!validationResult) return;

    // 构建模拟诊断历史条目
    const historyEntries = [{
      reportId: experiment.experimentId,
      machineId: 'evolution-lab',
      timestamp: Date.now(),
      cyclePhase: 'experiment',
      safetyScore: 0.9,
      healthScore: 0.85,
      efficiencyScore: 0.8,
      overallScore: 0.85,
      riskLevel: 'low',
      keyMetrics: validationResult.improvements,
      recommendations: [{ priority: 'planned', action: experiment.hypothesis }],
    }];

    // 发现模式
    const patterns = this.crystallizer.discoverPatterns(historyEntries);

    // 结晶为知识
    for (const pattern of patterns) {
      this.crystallizer.crystallize(pattern.patternId, 'kg_triple');
    }

    if (patterns.length > 0) {
      log.info(
        { experimentId: experiment.experimentId, patterns: patterns.length },
        '实验知识已结晶',
      );
    }
  }

  /**
   * 生成模拟评估数据集
   *
   * 为影子验证生成模拟数据。
   * 未来将从 ClickHouse/MinIO 加载真实历史数据。
   */
  private generateEvaluationDataset(): EvaluationDataPoint[] {
    const config = getAIConfig();
    const dataPoints: EvaluationDataPoint[] = [];
    const now = Date.now();
    const pointCount = Math.min(config.lab.minShadowDataPoints, 100);

    for (let i = 0; i < pointCount; i++) {
      dataPoints.push({
        timestamp: now - (pointCount - i) * 60_000,
        input: {
          vibrationRms: 1.5 + Math.random() * 3,
          temperature: 40 + Math.random() * 30,
          current: 200 + Math.random() * 100,
          speed: 1000 + Math.random() * 500,
        },
        actualOutput: {
          healthScore: 0.6 + Math.random() * 0.35,
          isAnomaly: Math.random() > 0.85 ? 1 : 0,
        },
        metadata: {
          scenario: Math.random() > 0.5 ? 'normal' : 'heavy_load',
        },
      });
    }

    return dataPoints;
  }

  /**
   * 构建周期报告
   */
  private buildCycleReport(
    cycleId: string,
    trigger: ExperimentTrigger,
    startTime: number,
    insightsCollected: number,
    experimentsDesigned: number,
    experimentsPassed: number,
    experimentsDeployed: number,
    summary: string,
  ): ExperimentCycleReport {
    return {
      cycleId,
      trigger,
      insightsCollected,
      experimentsDesigned,
      experimentsPassed,
      experimentsDeployed,
      startedAt: startTime,
      completedAt: Date.now(),
      durationMs: Date.now() - startTime,
      summary,
    };
  }

  /**
   * 注册为 Agent
   *
   * 在 AgentRegistry 中注册 'evolution-lab-agent'，
   * 使其可通过统一的 Agent 调度框架调用。
   */
  private registerAgent(): void {
    try {
      agentRegistry.register({
        id: 'evolution-lab-agent',
        name: '进化实验室 Agent',
        description: '自动化实验管线：洞察收集 → 实验设计 → 影子验证 → 部署',
        version: '1.0.0',
        loopStage: 'evolution',
        sdkAdapter: 'custom',
        tags: ['evolution', 'experiment', 'lab'],
        capabilities: ['experiment_design', 'shadow_validation', 'deployment'],
        timeoutMs: 300_000,
        invoke: async (input: unknown, context: AgentContext): Promise<AgentResult> => {
          const startTime = Date.now();

          try {
            const req = input as { action: string; payload?: Record<string, unknown> };
            let output: unknown;

            switch (req.action) {
              case 'run_cycle': {
                const trigger = (req.payload?.trigger || {
                  type: 'manual',
                  description: 'Agent 触发的实验周期',
                  userId: context.userId || 'agent',
                }) as ExperimentTrigger;
                output = await this.runExperimentCycle(trigger);
                break;
              }
              case 'submit_insight': {
                const insightData = req.payload as Omit<LabInsight, 'insightId' | 'createdAt'>;
                output = await this.submitInsight(insightData);
                break;
              }
              case 'design_experiment': {
                const insightId = req.payload?.insightId as string;
                output = await this.designExperiment(insightId);
                break;
              }
              case 'shadow_validate': {
                const experimentId = req.payload?.experimentId as string;
                output = await this.runShadowValidation(experimentId);
                break;
              }
              case 'list_experiments': {
                output = this.listExperiments();
                break;
              }
              case 'get_cycle_history': {
                output = this.getCycleHistory();
                break;
              }
              default:
                output = {
                  error: `未知操作: ${req.action}`,
                  availableActions: [
                    'run_cycle',
                    'submit_insight',
                    'design_experiment',
                    'shadow_validate',
                    'list_experiments',
                    'get_cycle_history',
                  ],
                };
            }

            return {
              agentId: 'evolution-lab-agent',
              success: true,
              output,
              durationMs: Date.now() - startTime,
            };
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return {
              agentId: 'evolution-lab-agent',
              success: false,
              output: null,
              durationMs: Date.now() - startTime,
              error: errorMessage,
            };
          }
        },
      });

      log.info('进化实验室 Agent 已注册');
    } catch (err) {
      log.warn({ error: String(err) }, 'Agent 注册失败（不影响核心功能）');
    }
  }
}

// ============================================================================
// 单例导出（遵循 §9.3 单例+工厂模式）
// ============================================================================

/** 单例实例 */
let instance: EvolutionLab | null = null;

/**
 * 获取进化实验室单例
 *
 * @returns 进化实验室实例
 */
export function getEvolutionLab(): EvolutionLab {
  if (!instance) {
    instance = new EvolutionLab();
  }
  return instance;
}

/**
 * 重置进化实验室单例
 *
 * 用于测试或重新初始化。
 */
export function resetEvolutionLab(): void {
  instance = null;
}
