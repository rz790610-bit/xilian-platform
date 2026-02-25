/**
 * ============================================================================
 * EvolutionOrchestrator — 进化引擎域路由与平台层 AI 服务的桥接层
 * ============================================================================
 *
 * 职责：
 *  1. 封装平台层 AI 服务（MetaLearner, AutoCodeGen, EvolutionFlywheel, ClosedLoopTracker,
 *     EvolutionMetricsCollector）的初始化和生命周期
 *  2. 通过 EventBus 发射域事件（evolution.*），实现审计日志、指标收集、闭环追踪的自动化
 *  3. 提供统一的 API 供域路由调用，避免域路由直接依赖平台层实现细节
 *  4. 管理引擎模块的启停状态
 *
 * 设计原则：
 *  - 单例模式，通过 getOrchestrator() 获取
 *  - 所有方法都是 async，内部捕获异常并通过 EventBus 发布错误事件
 *  - 不直接操作数据库，数据库操作仍由域路由负责
 */

import { EventBus } from '../../platform/events/event-bus';
import { eventBus as globalEventBus } from '../../services/eventBus.service';
import { invokeLLM, type InvokeParams, type InvokeResult } from '../../core/llm';
import { grokReasoningService, type DiagnoseRequest, type DiagnoseResponse } from '../../platform/cognition/grok/grok-reasoning.service';
import { MetaLearner, type MetaLearnerConfig } from '../../platform/evolution/metalearner/meta-learner';
import { AutoCodeGenerator, type CodeGenerationRequest, type GeneratedCode, type CodeValidationResult } from '../../platform/evolution/auto-codegen/auto-code-gen';
import { EvolutionMetricsCollector } from '../../platform/evolution/metrics/evolution-metrics';
import { ClosedLoopTracker, type ClosedLoop } from '../../platform/evolution/closed-loop/closed-loop-tracker';
import { EvolutionFlywheel, type FlywheelConfig, type FlywheelCycleReport } from '../../platform/evolution/flywheel/evolution-flywheel';
import { type EngineModule, ENGINE_MODULES, ENGINE_MODULE_LABELS, normalizeModuleName } from '../../../shared/evolution-modules';
import { GrokLabelProvider } from '../../platform/evolution/labeling/grok-label-provider';
import { pluginEngine } from '../../services/plugin.engine';
import { bayesianOptimizationPlugin } from '../../platform/evolution/plugins/strategies/bayesian-strategy.plugin';
import { geneticAlgorithmPlugin } from '../../platform/evolution/plugins/strategies/genetic-strategy.plugin';
import type { StrategyPlugin } from '../../platform/evolution/plugins/strategies/strategy-plugin.interface';
import { WorldModelEngine } from '../../platform/evolution/models/world-model-engine';
import type { WorldModelInput, WorldModelPrediction, WorldModelTrainingJob } from '../../platform/evolution/models/world-model-types';

// ── 事件 Topic 常量 ──
export const EVOLUTION_TOPICS = {
  // 生命周期
  ENGINE_STARTED: 'evolution.engine.started',
  ENGINE_STOPPED: 'evolution.engine.stopped',
  ENGINE_ERROR: 'evolution.engine.error',
  ENGINE_HEALTH_CHECK: 'evolution.engine.healthCheck',

  // 策略插件
  STRATEGY_REGISTERED: 'evolution.strategy.registered',
  STRATEGY_EXECUTED: 'evolution.strategy.executed',

  // 进化周期
  CYCLE_STARTED: 'evolution.cycle.started',
  CYCLE_STEP_COMPLETED: 'evolution.cycle.stepCompleted',
  CYCLE_COMPLETED: 'evolution.cycle.completed',
  CYCLE_FAILED: 'evolution.cycle.failed',

  // 配置变更
  CONFIG_UPDATED: 'evolution.config.updated',
  CONFIG_SEED_COMPLETED: 'evolution.config.seedCompleted',

  // 可观测性
  TRACE_CREATED: 'evolution.trace.created',
  TRACE_COMPLETED: 'evolution.trace.completed',
  ALERT_FIRED: 'evolution.alert.fired',
  ALERT_RESOLVED: 'evolution.alert.resolved',
  METRIC_SNAPSHOT: 'evolution.metric.snapshot',

  // 自愈
  ROLLBACK_INITIATED: 'evolution.rollback.initiated',
  ROLLBACK_COMPLETED: 'evolution.rollback.completed',
  ROLLBACK_FAILED: 'evolution.rollback.failed',
  HEALING_POLICY_TRIGGERED: 'evolution.healing.policyTriggered',
  HEALING_POLICY_EXECUTED: 'evolution.healing.policyExecuted',

  // 参数调优
  TUNING_STARTED: 'evolution.tuning.started',
  TUNING_TRIAL_COMPLETED: 'evolution.tuning.trialCompleted',
  TUNING_BEST_APPLIED: 'evolution.tuning.bestApplied',

  // 代码生成
  CODEGEN_GENERATED: 'evolution.codegen.generated',
  CODEGEN_VALIDATED: 'evolution.codegen.validated',
  CODEGEN_DEPLOYED: 'evolution.codegen.deployed',

  // 深度 AI
  WORLD_MODEL_TRAINED: 'evolution.worldModel.trained',
  WORLD_MODEL_PREDICTION: 'evolution.worldModel.prediction',
  WORLD_MODEL_VERSION_CREATED: 'evolution.worldModel.versionCreated',
  WORLD_MODEL_STATUS_CHANGED: 'evolution.worldModel.statusChanged',
  WORLD_MODEL_VERSION_DELETED: 'evolution.worldModel.versionDeleted',
  TRAINING_STATUS_CHANGED: 'evolution.training.statusChanged',
  MODEL_COMPARISON_COMPLETED: 'evolution.model.comparisonCompleted',
  MODEL_REGISTERED: 'evolution.model.registered',
  MODEL_STATUS_CHANGED: 'evolution.model.statusChanged',
  MODEL_DELETED: 'evolution.model.deleted',
  ADAPTIVE_RECOMMENDATION: 'evolution.adaptive.recommendation',
  RECOMMENDATION_ACCEPTED: 'evolution.recommendation.accepted',
  RECOMMENDATION_APPLIED: 'evolution.recommendation.applied',
  RECOMMENDATION_REJECTED: 'evolution.recommendation.rejected',
  RECOMMENDATION_REVERTED: 'evolution.recommendation.reverted',
} as const;

// ── 引擎模块状态 ──
export interface EngineModuleState {
  module: EngineModule;
  status: 'running' | 'stopped' | 'error' | 'degraded';
  startedAt: number | null;
  lastHealthCheck: number | null;
  errorCount: number;
  lastError: string | null;
}

// ── Orchestrator 主类 ──
export class EvolutionOrchestrator {
  private static instance: EvolutionOrchestrator | null = null;

  // 平台层 AI 服务实例
  private platformEventBus: EventBus;
  private metaLearner: MetaLearner;
  private autoCodeGen: AutoCodeGenerator;
  private metricsCollector: EvolutionMetricsCollector;
  private closedLoopTracker: ClosedLoopTracker;
  private flywheel: EvolutionFlywheel | null = null;
  private worldModel: WorldModelEngine;

  // 引擎模块状态
  private moduleStates: Map<EngineModule, EngineModuleState> = new Map();

  // 是否已初始化
  private initialized = false;

  // ── LLM / Grok 单例引用 ──
  private _llmInvoke = invokeLLM;
  private _grokReasoner = grokReasoningService;

  private constructor() {
    this.platformEventBus = new EventBus();
    this.metaLearner = new MetaLearner();
    this.autoCodeGen = new AutoCodeGenerator();
    this.metricsCollector = new EvolutionMetricsCollector();
    this.closedLoopTracker = new ClosedLoopTracker();
    this.worldModel = new WorldModelEngine();

    // 初始化所有模块状态为 stopped
    for (const mod of ENGINE_MODULES) {
      this.moduleStates.set(mod, {
        module: mod,
        status: 'stopped',
        startedAt: null,
        lastHealthCheck: null,
        errorCount: 0,
        lastError: null,
      });
    }
  }

  static getInstance(): EvolutionOrchestrator {
    if (!EvolutionOrchestrator.instance) {
      EvolutionOrchestrator.instance = new EvolutionOrchestrator();
    }
    return EvolutionOrchestrator.instance;
  }

  // ── LLM / Grok Getter（所有 AI 调用统一走 Orchestrator） ──

  /** 获取平台核心 LLM 调用函数（Forge API 兼容 OpenAI） */
  getLLMClient(): typeof invokeLLM {
    return this._llmInvoke;
  }

  /** 获取 Grok 推理链服务（工具调用 + 多步推理） */
  getGrokReasoner(): typeof grokReasoningService {
    return this._grokReasoner;
  }

  /** 获取 Grok 驱动的智能标注提供者 */
  getLabelProvider(): GrokLabelProvider {
    return new GrokLabelProvider();
  }

  /** 标注干预记录（域路由统一入口） */
  async labelIntervention(jobId: string, data: Record<string, unknown>): Promise<unknown> {
    const provider = this.getLabelProvider();
    try {
      const result = await provider.labelIntervention(data);
      await this.publishEvent(EVOLUTION_TOPICS.CODEGEN_GENERATED, {
        jobId,
        type: 'auto_labeling',
        success: true,
        confidence: result.confidence,
      });
      return result;
    } catch (error: any) {
      await this.publishEvent(EVOLUTION_TOPICS.ENGINE_ERROR, {
        jobId,
        type: 'auto_labeling',
        error: error.message,
      });
      throw error;
    }
  }

  // ── 初始化 ──
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // ── 注册策略插件到 pluginEngine + MetaLearner ──
    await this.registerStrategyPlugins();

    await this.publishEvent(EVOLUTION_TOPICS.ENGINE_STARTED, {
      message: '进化引擎编排器已初始化',
      moduleCount: ENGINE_MODULES.length,
      strategyPlugins: this.registeredStrategies.length,
      timestamp: Date.now(),
    });
  }

  /** 已注册的策略插件 ID 列表 */
  private registeredStrategies: string[] = [];

  /**
   * 注册内置策略插件到 pluginEngine 和 MetaLearner
   * 支持热注册：未来新增策略只需在此追加一行
   */
  private async registerStrategyPlugins(): Promise<void> {
    const strategies: StrategyPlugin[] = [
      bayesianOptimizationPlugin,
      geneticAlgorithmPlugin,
      // 未来新增策略在此追加：
      // newReinforcementLearningPlugin,
    ];

    for (const strategy of strategies) {
      try {
        // 注册到 pluginEngine（统一管理生命周期）
        await pluginEngine.installPlugin(strategy);
        await pluginEngine.enablePlugin(strategy.metadata.id);

        // 注册到 MetaLearner（直接引用，避免序列化开销）
        this.metaLearner.registerStrategy(strategy);

        this.registeredStrategies.push(strategy.metadata.id);

        await this.publishEvent(EVOLUTION_TOPICS.STRATEGY_REGISTERED, {
          pluginId: strategy.metadata.id,
          name: strategy.metadata.name,
          version: strategy.metadata.version,
        });
      } catch (err) {
        // 插件已安装时跳过（幂等）
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already installed')) {
          this.registeredStrategies.push(strategy.metadata.id);
        } else {
          console.warn(`[EvolutionOrchestrator] 策略插件 ${strategy.metadata.id} 注册失败:`, msg);
        }
      }
    }
  }

  // ── EventBus 集成 ──

  /** 通过全局 EventBus 发布进化引擎域事件 */
  async publishEvent(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      // 通过全局 eventBus（支持 Redis Pub/Sub）发布
      await globalEventBus.publish(topic, 'evolution_event', payload, {
        source: 'evolution-orchestrator',
        severity: 'info',
      });

      // 同时通过平台层 EventBus 发布（支持本地订阅）
      await this.platformEventBus.publish(topic, payload, {
        source: 'evolution-orchestrator',
      });
    } catch (err) {
      console.error(`[EvolutionOrchestrator] EventBus publish failed for ${topic}:`, err);
    }
  }

  /** 订阅进化引擎域事件 */
  subscribeEvent(topic: string, handler: (event: unknown) => void): () => void {
    return globalEventBus.subscribe(topic, handler);
  }

  // ── 指标收集 ──

  /** 记录进化引擎指标 */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metricsCollector.record(name, value, tags);
  }

  /** 获取指标仪表盘数据 */
  getMetricsDashboard() {
    return this.metricsCollector.exportAll();
  }

  // ── 闭环追踪 ──

  /** 创建新的闭环追踪 */
  createClosedLoop(params: { name: string; engineModule: EngineModule; trigger?: 'event' | 'manual' | 'scheduled' | 'auto'; metadata?: Record<string, unknown> }): ClosedLoop {
    const loop = this.closedLoopTracker.createLoop({
      name: params.name,
      trigger: params.trigger ?? 'auto',
      metadata: {
        engineModule: params.engineModule,
        ...params.metadata,
      },
    });

    this.publishEvent(EVOLUTION_TOPICS.TRACE_CREATED, {
      loopId: loop.id,
      name: params.name,
      engineModule: params.engineModule,
    });

    return loop;
  }

  /** 推进闭环阶段 */
  advanceClosedLoop(loopId: string, data?: Record<string, unknown>): ClosedLoop | null {
    const loop = this.closedLoopTracker.advanceStage(loopId, data);
    if (loop && loop.state === 'completed') {
      this.publishEvent(EVOLUTION_TOPICS.TRACE_COMPLETED, {
        loopId: loop.id,
        name: loop.name,
        duration: (loop.completedAt || Date.now()) - loop.createdAt,
      });
    }
    return loop;
  }

  /** 获取闭环统计 */
  getClosedLoopStats() {
    return this.closedLoopTracker.getStats();
  }

  // ── MetaLearner 集成 ──

  /** 触发元学习器分析 — 用于参数自调优 */
  async runMetaLearnerAnalysis(context: {
    engineModule: EngineModule;
    currentParams: Record<string, unknown>;
    performanceHistory: Array<{ timestamp: number; score: number }>;
  }): Promise<{
    recommendations: Array<{ param: string; currentValue: unknown; suggestedValue: unknown; confidence: number; reasoning: string }>;
  }> {
    try {
      await this.publishEvent(EVOLUTION_TOPICS.TUNING_STARTED, {
        engineModule: context.engineModule,
        paramCount: Object.keys(context.currentParams).length,
      });

      // MetaLearner 目前是基于规则的推荐引擎
      // 基于性能历史趋势分析，生成参数调整建议
      const recommendations: Array<{ param: string; currentValue: unknown; suggestedValue: unknown; confidence: number; reasoning: string }> = [];

      const history = context.performanceHistory;
      if (history.length >= 3) {
        const recent = history.slice(-3);
        const trend = recent[2].score - recent[0].score;

        for (const [param, value] of Object.entries(context.currentParams)) {
          if (typeof value === 'number') {
            const adjustment = trend < 0 ? 0.9 : (trend > 0.1 ? 1.05 : 1.0);
            if (adjustment !== 1.0) {
              recommendations.push({
                param,
                currentValue: value,
                suggestedValue: Math.round(value * adjustment * 1000) / 1000,
                confidence: Math.min(0.95, 0.5 + Math.abs(trend) * 0.3),
                reasoning: trend < 0
                  ? `性能下降趋势 (${trend.toFixed(3)})，建议降低 ${param} 以减少资源消耗`
                  : `性能上升趋势 (${trend.toFixed(3)})，建议微调 ${param} 以进一步优化`,
              });
            }
          }
        }
      }

      this.recordMetric('evolution.metaLearner.recommendations', recommendations.length, {
        engineModule: context.engineModule,
      });

      return { recommendations };
    } catch (err) {
      await this.publishEvent(EVOLUTION_TOPICS.ENGINE_ERROR, {
        service: 'metaLearner',
        engineModule: context.engineModule,
        error: String(err),
      });
      return { recommendations: [] };
    }
  }

  // ── AutoCodeGen 集成 ──

  /** 生成代码 */
  async generateCode(request: CodeGenerationRequest): Promise<GeneratedCode> {
    const code = await this.autoCodeGen.generate(request);

    await this.publishEvent(EVOLUTION_TOPICS.CODEGEN_GENERATED, {
      codeType: request.type,
      requestId: request.id,
      linesOfCode: code.code.split('\n').length,
    });

    this.recordMetric('evolution.codegen.generated', 1, { codeType: request.type });

    return code;
  }

  /** 验证代码 */
  async validateCode(code: GeneratedCode, testData?: unknown[]): Promise<CodeValidationResult> {
    const result = await this.autoCodeGen.validate(code, testData);

    const allPassed = result.syntaxValid && result.securityIssues.length === 0;
    await this.publishEvent(EVOLUTION_TOPICS.CODEGEN_VALIDATED, {
      requestId: code.requestId,
      passed: allPassed,
      testCount: result.testResults.length,
      passedCount: result.testResults.filter((t: { passed: boolean }) => t.passed).length,
    });

    this.recordMetric('evolution.codegen.validated', 1, {
      passed: String(allPassed),
    });

    return result;
  }

  // ── EvolutionFlywheel 集成 ──

  /** 初始化进化飞轮（需要 dbTableCount 等配置） */
  initFlywheel(config: Partial<FlywheelConfig> = {}): void {
    if (!this.flywheel) {
      this.flywheel = new EvolutionFlywheel(config, this.platformEventBus);
    }
  }

  /** 执行一次进化周期 */
  async executeCycle(params: {
    trigger: string;
    scope?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    diagnosisHistory?: any[];
    evaluationDataset?: any[];
  }): Promise<FlywheelCycleReport | null> {
    try {
      if (!this.flywheel) {
        this.initFlywheel();
      }

      await this.publishEvent(EVOLUTION_TOPICS.CYCLE_STARTED, {
        trigger: params.trigger,
        scope: params.scope || 'full',
        priority: params.priority || 'normal',
      });

      const report = await this.flywheel!.executeCycle(
        params.diagnosisHistory ?? [],
        params.evaluationDataset ?? [],
      );

      const cycleDuration = report.completedAt ? report.completedAt - report.startedAt : 0;
      await this.publishEvent(EVOLUTION_TOPICS.CYCLE_COMPLETED, {
        cycleId: report.cycleId,
        duration: cycleDuration,
        status: report.status,
        cycleNumber: report.cycleNumber,
      });

      this.recordMetric('evolution.cycle.duration', cycleDuration);
      this.recordMetric('evolution.cycle.completed', 1);

      return report;
    } catch (err) {
      await this.publishEvent(EVOLUTION_TOPICS.CYCLE_FAILED, {
        trigger: params.trigger,
        error: String(err),
      });
      this.recordMetric('evolution.cycle.failed', 1);
      return null;
    }
  }

  // ── 引擎模块状态管理 ──

  /** 启动引擎模块 */
  async startModule(module: EngineModule): Promise<void> {
    const normalized = normalizeModuleName(module);
    const state = this.moduleStates.get(normalized);
    if (!state) return;

    state.status = 'running';
    state.startedAt = Date.now();
    state.lastHealthCheck = Date.now();

    await this.publishEvent(EVOLUTION_TOPICS.ENGINE_STARTED, {
      module: normalized,
      label: ENGINE_MODULE_LABELS[normalized],
    });

    this.recordMetric('evolution.module.started', 1, { module: normalized });
  }

  /** 停止引擎模块 */
  async stopModule(module: EngineModule): Promise<void> {
    const normalized = normalizeModuleName(module);
    const state = this.moduleStates.get(normalized);
    if (!state) return;

    state.status = 'stopped';

    await this.publishEvent(EVOLUTION_TOPICS.ENGINE_STOPPED, {
      module: normalized,
      label: ENGINE_MODULE_LABELS[normalized],
    });

    this.recordMetric('evolution.module.stopped', 1, { module: normalized });
  }

  /** 报告模块错误 */
  async reportModuleError(module: EngineModule, error: string): Promise<void> {
    const normalized = normalizeModuleName(module);
    const state = this.moduleStates.get(normalized);
    if (!state) return;

    state.status = 'error';
    state.errorCount++;
    state.lastError = error;

    await this.publishEvent(EVOLUTION_TOPICS.ENGINE_ERROR, {
      module: normalized,
      error,
      errorCount: state.errorCount,
    });

    this.recordMetric('evolution.module.error', 1, { module: normalized });
  }

  /** 获取所有模块状态 */
  getAllModuleStates(): EngineModuleState[] {
    return Array.from(this.moduleStates.values());
  }

  /** 获取单个模块状态 */
  getModuleState(module: EngineModule): EngineModuleState | undefined {
    return this.moduleStates.get(normalizeModuleName(module));
  }

  /** 健康检查 */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    modules: EngineModuleState[];
    metrics: { totalEvents: number; activeModules: number; errorModules: number };
  }> {
    const modules = this.getAllModuleStates();
    const running = modules.filter(m => m.status === 'running').length;
    const errors = modules.filter(m => m.status === 'error').length;

    const status = errors > 3 ? 'unhealthy' : errors > 0 ? 'degraded' : 'healthy';

    await this.publishEvent(EVOLUTION_TOPICS.ENGINE_HEALTH_CHECK, {
      status,
      activeModules: running,
      errorModules: errors,
    });

    return {
      status,
      modules,
      metrics: {
        totalEvents: 0, // 从 EventBus 获取
        activeModules: running,
        errorModules: errors,
      },
    };
  }

  // ── 告警 → 自愈联动 ──

  /** 处理告警事件，自动触发匹配的自愈策略 */
  async handleAlertForAutoHealing(alert: {
    id: string;
    engineModule: string;
    severity: string;
    metric: string;
    currentValue: number;
    threshold: number;
  }): Promise<{
    matched: boolean;
    policyId?: string;
    action?: string;
  }> {
    await this.publishEvent(EVOLUTION_TOPICS.ALERT_FIRED, {
      alertId: alert.id,
      engineModule: alert.engineModule,
      severity: alert.severity,
      metric: alert.metric,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
    });

    this.recordMetric('evolution.alert.fired', 1, {
      engineModule: alert.engineModule,
      severity: alert.severity,
    });

    // 返回匹配结果（实际匹配逻辑在域路由中通过数据库查询完成）
    return { matched: false };
  }

  /** 记录自愈策略执行结果 */
  async recordHealingExecution(params: {
    policyId: string;
    alertId: string;
    engineModule: string;
    action: string;
    success: boolean;
    duration: number;
  }): Promise<void> {
    await this.publishEvent(
      params.success ? EVOLUTION_TOPICS.HEALING_POLICY_EXECUTED : EVOLUTION_TOPICS.ENGINE_ERROR,
      {
        policyId: params.policyId,
        alertId: params.alertId,
        engineModule: params.engineModule,
        action: params.action,
        success: params.success,
        duration: params.duration,
      },
    );

    this.recordMetric('evolution.healing.executed', 1, {
      success: String(params.success),
      engineModule: params.engineModule,
    });
  }

  // ── 回滚事件 ──

  async recordRollback(params: {
    rollbackId: string;
    type: string;
    engineModule: string;
    status: 'success' | 'failed';
    reason: string;
  }): Promise<void> {
    const topic = params.status === 'success'
      ? EVOLUTION_TOPICS.ROLLBACK_COMPLETED
      : EVOLUTION_TOPICS.ROLLBACK_FAILED;

    await this.publishEvent(topic, params);
    this.recordMetric('evolution.rollback', 1, {
      type: params.type,
      status: params.status,
    });
  }

   // ── 世界模型引擎 API ──

  /** 获取 WorldModelEngine 实例 */
  getWorldModel(): WorldModelEngine {
    return this.worldModel;
  }

  /** 启动世界模型训练任务（通过 Dojo 碳感知调度） */
  async startWorldModelTraining(jobId: string, data: Partial<WorldModelTrainingJob> = {}): Promise<boolean> {
    try {
      const engine = this.getWorldModel();
      return await engine.train({
        id: jobId,
        type: 'world_model',
        carbonAware: data.carbonAware ?? true,
        modelId: data.modelId,
        datasetPath: data.datasetPath,
        config: data.config,
        submittedBy: data.submittedBy || 'orchestrator',
      });
    } catch (error: any) {
      await this.publishEvent(EVOLUTION_TOPICS.ENGINE_ERROR, {
        type: 'world_model_training',
        jobId,
        error: error.message,
      });
      return false;
    }
  }

  /** 使用世界模型预测未来状态 */
  async predictWithWorldModel(input: WorldModelInput): Promise<WorldModelPrediction> {
    const engine = this.getWorldModel();
    return engine.predictFuture(input);
  }

  /** 获取世界模型引擎状态 */
  getWorldModelStatus() {
    return this.worldModel.getStatus();
  }

  // ── 世界模型事件 ──
  async recordWorldModelTraining(params: {
    versionId: string;
    architecture: string;
    status: string;
    metrics?: Record<string, number>;
  }): Promise<void> {
    await this.publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_TRAINED, params);
    this.recordMetric('evolution.worldModel.training', 1, {
      architecture: params.architecture,
    });
  }

  // ── 自适应推荐事件 ──

  async recordAdaptiveRecommendation(params: {
    recommendationId: string;
    engineModule: string;
    confidence: number;
    paramCount: number;
  }): Promise<void> {
    await this.publishEvent(EVOLUTION_TOPICS.ADAPTIVE_RECOMMENDATION, params);
    this.recordMetric('evolution.adaptive.recommendation', 1, {
      engineModule: params.engineModule,
    });
  }
}

// ── 全局单例导出 ──
export function getOrchestrator(): EvolutionOrchestrator {
  return EvolutionOrchestrator.getInstance();
}
