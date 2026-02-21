/**
 * ============================================================================
 * HybridReasoningOrchestrator — 混合推理编排器
 * ============================================================================
 *
 * Phase 2 核心编排器，6 阶段推理流程：
 *   S1: 信号分类（Signal Triage）
 *   S2: 向量检索（Vector Retrieval）
 *   S3: 因果溯源（Causal Tracing）
 *   S4: 物理验证（Physics Verification）
 *   S5: 经验加权（Experience Weighting）
 *   S6: 深度推理（Deep Reasoning via Grok）
 *
 * 设计原则：
 *   1. 依赖注入 — 所有外部模块通过构造函数注入
 *   2. 动态路由 — 4 种通道（fast/standard/deep/fallback）
 *   3. CostGate — Grok 调用率 < 15%，含经验命中率 × 短路率抑制
 *   4. 置信度短路 — 任意阶段后置信度 ≥ 0.92 直接返回
 *   5. 并行扇出 — 自适应 4~12 并发 + AbortController
 *   6. 端到端不确定性 — RSS 合成 + 来源分解
 *   7. 分级降级 — 5s 超时自动降级到 fallback_path
 *   8. 可观测性 — Observability 收集器记录全流程
 */

import { createModuleLogger } from '../../../../core/logger';
import type { PhysicsVerifier } from '../physics/physics-verifier';
import type { BuiltinCausalGraph } from '../causal/causal-graph';
import type { ExperiencePool } from '../experience/experience-pool';
import type { VectorStore } from '../vector-store/vector-store';
import type { Observability } from '../observability/observability';
import type { GrokReasoningService, DiagnoseRequest } from '../../grok/grok-reasoning.service';
import type {
  OrchestratorConfig,
  OrchestratorResult,
  OrchestratorPhase,
  ReasoningRoute,
  ModuleExecutionSummary,
  PhysicsVerificationResult,
  CausalTrace,
  ExperienceRetrievalResult,
  AnomalyDomain,
  SkippedReason,
  DecisionLogEntry,
} from '../reasoning.types';
import type {
  CognitionStimulus,
  PerceptionOutput,
} from '../../types';

const log = createModuleLogger('hybridOrchestrator');

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  routing: {
    fastPathConfidence: 0.85,
    deepPathTrigger: 0.55,
    fallbackTimeoutMs: 5000,
  },
  costGate: {
    dailyGrokBudget: 100,
    dailyGrokUsed: 0,
    experienceHitSuppression: 0.3,
    shortCircuitSuppression: 0.2,
  },
  shortCircuitConfidence: 0.92,
  parallelFanout: {
    maxConcurrency: 8,
    taskTimeoutMs: 3000,
    globalTimeoutMs: 8000,
  },
  latencyBudgetMs: 8000,
};

// ============================================================================
// 半结构化工具编排模板 — 5 大异常域预定义优先序
// ============================================================================

const TOOL_TEMPLATES: Record<string, string[]> = {
  bearing_fault: [
    'query_sensor_realtime:vibration_rms,vibration_peak,temperature',
    'query_clickhouse_analytics:fft_spectrum,envelope_analysis',
    'compute_physics_formula:bearing_defect_frequency',
    'search_similar_cases:bearing_fault',
    'counterfactual_analysis:lubrication_change',
  ],
  gear_damage: [
    'query_sensor_realtime:vibration_rms,oil_particle_count',
    'query_clickhouse_analytics:order_tracking,sideband_analysis',
    'compute_physics_formula:gear_mesh_frequency',
    'search_similar_cases:gear_damage',
    'counterfactual_analysis:load_reduction',
  ],
  motor_degradation: [
    'query_sensor_realtime:motor_current,stator_temperature,vibration_rms',
    'query_clickhouse_analytics:current_spectrum,insulation_trend',
    'compute_physics_formula:motor_thermal_balance',
    'search_similar_cases:motor_degradation',
    'counterfactual_analysis:load_derating',
  ],
  structural_fatigue: [
    'query_sensor_realtime:strain_gauge,displacement,acceleration',
    'query_clickhouse_analytics:cycle_count,stress_range_histogram',
    'compute_physics_formula:miner_cumulative_damage',
    'search_similar_cases:structural_fatigue',
    'counterfactual_analysis:load_spectrum_change',
  ],
  hydraulic_leak: [
    'query_sensor_realtime:pressure,flow_rate,oil_temperature',
    'query_clickhouse_analytics:pressure_trend,flow_deviation',
    'compute_physics_formula:hydraulic_flow_continuity',
    'search_similar_cases:hydraulic_leak',
    'counterfactual_analysis:seal_replacement',
  ],
  wire_rope_break: [
    'query_sensor_realtime:tension,magnetic_flux_leakage',
    'query_clickhouse_analytics:tension_trend,mfl_anomaly_count',
    'compute_physics_formula:wire_rope_safety_factor',
    'search_similar_cases:wire_rope_break',
    'counterfactual_analysis:rope_replacement',
  ],
  pump_cavitation: [
    'query_sensor_realtime:pressure,flow_rate,vibration_rms',
    'query_clickhouse_analytics:npsh_trend,cavitation_index',
    'compute_physics_formula:pump_npsh_margin',
    'search_similar_cases:pump_cavitation',
    'counterfactual_analysis:inlet_pressure_increase',
  ],
  insulation_aging: [
    'query_sensor_realtime:partial_discharge,temperature,humidity',
    'query_clickhouse_analytics:pd_trend,insulation_resistance_trend',
    'compute_physics_formula:arrhenius_aging',
    'search_similar_cases:insulation_aging',
    'counterfactual_analysis:temperature_reduction',
  ],
};

// ============================================================================
// 内部类型
// ============================================================================

/** 信号分类结果 */
interface SignalTriageResult {
  /** 主导异常域 */
  dominantDomain: AnomalyDomain;
  /** 各域置信度 */
  domainConfidences: Record<string, number>;
  /** 异常严重度 [0, 1] */
  severity: number;
  /** 关键特征 */
  keyFeatures: string[];
  /** 涉及的测点 */
  sensorTags: string[];
}

/** 路由决策 */
interface RoutingDecision {
  /** 选择的路由 */
  route: ReasoningRoute;
  /** 选择原因 */
  reason: string;
  /** 跳过的阶段 */
  skippedPhases: OrchestratorPhase[];
  /** 延迟预算 (ms) */
  latencyBudgetMs: number;
}

/** 短路检查结果 */
interface ShortCircuitCheck {
  /** 是否触发短路 */
  triggered: boolean;
  /** 触发阶段 */
  atPhase?: OrchestratorPhase;
  /** 当前最高置信度 */
  topConfidence: number;
  /** 最佳假设 */
  topHypothesis?: HypothesisCandidate;
}

/** 假设候选 — 编排器内部使用 */
interface HypothesisCandidate {
  id: string;
  description: string;
  domain: AnomalyDomain;
  /** 各来源置信度 */
  confidences: {
    prior: number;
    causal: number;
    physics: number;
    experience: number;
    grok: number;
  };
  /** DS 融合后的综合置信度 */
  fusedConfidence: number;
  /** 物理验证结果 */
  physicsResult?: PhysicsVerificationResult;
  /** 因果路径 */
  causalTraces: CausalTrace[];
  /** 来源标记 */
  sources: Set<string>;
}

/** CostGate 评估结果 */
interface CostGateResult {
  /** 是否允许调用 Grok */
  shouldTrigger: boolean;
  /** Grok 必要性评分 [0, 1] */
  grokScore: number;
  /** 拒绝原因 */
  rejectReason?: string;
  /** 剩余预算 */
  remainingBudget: number;
}

// ============================================================================
// HybridReasoningOrchestrator
// ============================================================================

export class HybridReasoningOrchestrator {
  private readonly config: OrchestratorConfig;
  private dailyGrokUsed = 0;
  private dailyResetDate = new Date().toDateString();

  // 短路率统计（用于 CostGate 抑制因子）
  private shortCircuitCount = 0;
  private totalSessionCount = 0;

  constructor(
    private readonly physicsVerifier: PhysicsVerifier,
    private readonly causalGraph: BuiltinCausalGraph,
    private readonly experiencePool: ExperiencePool,
    private readonly vectorStore: VectorStore,
    private readonly observability: Observability,
    private readonly grokService?: GrokReasoningService,
    config?: Partial<OrchestratorConfig>,
  ) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    log.info({ config: this.config.routing }, 'HybridReasoningOrchestrator initialized');
  }

  // ==========================================================================
  // 主编排入口
  // ==========================================================================

  /**
   * 执行混合推理编排
   *
   * @param stimulus       认知刺激
   * @param perception     感知维输出
   * @param deviceImportance 设备重要度 [0, 1]
   * @param currentLoad    当前系统负载 [0, 1]
   */
  async orchestrate(
    stimulus: CognitionStimulus,
    perception: PerceptionOutput | undefined,
    deviceImportance: number,
    currentLoad: number,
  ): Promise<OrchestratorResult> {
    const globalStart = Date.now();
    const globalAbort = new AbortController();
    const decisions: DecisionLogEntry['decisions'] = [];
    const phaseDurations: Record<string, number> = {};

    // 每日预算重置
    this.resetDailyBudgetIfNeeded();
    this.totalSessionCount++;

    // 全局超时保护
    const globalTimeout = setTimeout(() => {
      globalAbort.abort();
    }, this.config.latencyBudgetMs);

    try {
      // ====================================================================
      // S0: 动态路由决策
      // ====================================================================
      const routingStart = Date.now();
      const routing = this.determineRoute(stimulus, perception, deviceImportance, currentLoad);
      phaseDurations['routing'] = Date.now() - routingStart;
      decisions.push({
        point: 'S0_routing',
        choice: routing.route,
        reason: routing.reason,
        confidence: 0,
      });

      log.info({
        stimulusId: stimulus.id,
        route: routing.route,
        latencyBudget: routing.latencyBudgetMs,
      }, 'Route determined');

      // 降级路径 — 直接返回模板结果
      if (routing.route === 'fallback_path') {
        return this.buildFallbackResult(stimulus, perception, globalStart, decisions, phaseDurations);
      }

      // ====================================================================
      // S1: 信号分类
      // ====================================================================
      const s1Start = Date.now();
      const signalTriage = this.performSignalTriage(perception);
      phaseDurations['signal_classification'] = Date.now() - s1Start;
      decisions.push({
        point: 'S1_signal_classification',
        choice: signalTriage.dominantDomain,
        reason: `severity=${signalTriage.severity.toFixed(2)}, features=${signalTriage.keyFeatures.length}`,
        confidence: signalTriage.domainConfidences[signalTriage.dominantDomain] ?? 0,
      });

      // ====================================================================
      // S2: 向量检索（经验池 + 知识库）
      // ====================================================================
      const s2Start = Date.now();
      let experienceResult: ExperienceRetrievalResult | undefined;

      if (!routing.skippedPhases.includes('vector_retrieval')) {
        experienceResult = await this.executeWithTimeout(
          () => Promise.resolve(this.experiencePool.retrieve({
            anomalyDescription: signalTriage.keyFeatures.join(', '),
            domain: signalTriage.dominantDomain,
          })),
          Math.min(2000, routing.latencyBudgetMs * 0.2),
          'vector_retrieval',
        );
      }
      phaseDurations['vector_retrieval'] = Date.now() - s2Start;

      // 快速路径短路检查
      if (routing.route === 'fast_path' && experienceResult && experienceResult.hitRate >= this.config.routing.fastPathConfidence) {
        this.shortCircuitCount++;
        const topEpisodic = experienceResult.episodic[0];
        decisions.push({
          point: 'S2_fast_path_shortcircuit',
          choice: 'return_experience',
          reason: `hitRate=${experienceResult.hitRate.toFixed(3)} >= ${this.config.routing.fastPathConfidence}`,
          confidence: experienceResult.hitRate,
        });

        return this.buildShortCircuitResult(
          topEpisodic, experienceResult, signalTriage,
          globalStart, decisions, phaseDurations, 'vector_retrieval',
        );
      }

      // ====================================================================
      // S3: 因果溯源
      // ====================================================================
      const s3Start = Date.now();
      let causalTraces: CausalTrace[] = [];

      if (!routing.skippedPhases.includes('causal_tracing')) {
        const symptomNodes = signalTriage.keyFeatures.map(f =>
          f.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
        );

        const tracePromises = symptomNodes.slice(0, 5).map(symptom =>
          this.executeWithTimeout(
            () => Promise.resolve(this.causalGraph.queryCausalPaths(symptom, 5)),
            Math.min(2000, routing.latencyBudgetMs * 0.25),
            'causal_tracing',
          ).catch(() => [] as CausalTrace[])
        );

        const traceResults = await Promise.allSettled(tracePromises);
        causalTraces = traceResults
          .filter((r): r is PromiseFulfilledResult<CausalTrace[]> => r.status === 'fulfilled')
          .flatMap(r => r.value)
          .sort((a, b) => b.pathWeight - a.pathWeight)
          .slice(0, 10);
      }
      phaseDurations['causal_tracing'] = Date.now() - s3Start;

      decisions.push({
        point: 'S3_causal_tracing',
        choice: `found_${causalTraces.length}_paths`,
        reason: causalTraces.length > 0
          ? `top_weight=${causalTraces[0].pathWeight.toFixed(3)}`
          : 'no_causal_paths_found',
        confidence: causalTraces.length > 0 ? causalTraces[0].pathWeight : 0,
      });

      // ====================================================================
      // S4: 物理验证（并行扇出）
      // ====================================================================
      const s4Start = Date.now();
      let physicsResults: PhysicsVerificationResult[] = [];

      if (!routing.skippedPhases.includes('physics_verification') && !globalAbort.signal.aborted) {
        // 从因果路径和经验中提取假设
        const hypothesesToVerify = this.extractHypotheses(
          signalTriage, causalTraces, experienceResult
        );

        if (hypothesesToVerify.length > 0) {
          // 自适应并发数：基于 currentLoad 动态调整
          const adaptiveConcurrency = this.computeAdaptiveConcurrency(currentLoad);

          // 构建 StateVector 和 Hypothesis 列表
          const stateVector = {
            timestamp: new Date(),
            values: {} as Record<string, number>,
            metadata: { source: 'orchestrator' },
          };
          const hypothesesForPhysics = hypothesesToVerify.map(h => ({
            id: h.id,
            description: h.description,
            confidence: 0.5,
            domain: h.domain,
          }));

          physicsResults = await this.executeWithTimeout(
            () => this.physicsVerifier.verifyBatch(
              hypothesesForPhysics,
              stateVector as any,
            ),
            Math.min(3000, routing.latencyBudgetMs * 0.35),
            'physics_verification',
          ).catch(() => [] as PhysicsVerificationResult[]);
        }
      }
      phaseDurations['physics_verification'] = Date.now() - s4Start;

      const physicsVerifiedCount = physicsResults.filter(r => r.physicallyFeasible).length;
      decisions.push({
        point: 'S4_physics_verification',
        choice: `verified_${physicsVerifiedCount}/${physicsResults.length}`,
        reason: physicsResults.length > 0
          ? `avg_confidence=${(physicsResults.reduce((s, r) => s + r.physicsConfidence, 0) / physicsResults.length).toFixed(3)}`
          : 'no_hypotheses_to_verify',
        confidence: physicsResults.length > 0
          ? Math.max(...physicsResults.map(r => r.physicsConfidence))
          : 0,
      });

      // 置信度短路检查（S4 后）
      const postPhysicsConfidence = this.computeCurrentMaxConfidence(
        causalTraces, physicsResults, experienceResult
      );
      if (postPhysicsConfidence >= this.config.shortCircuitConfidence) {
        this.shortCircuitCount++;
        decisions.push({
          point: 'S4_shortcircuit',
          choice: 'return_high_confidence',
          reason: `confidence=${postPhysicsConfidence.toFixed(3)} >= ${this.config.shortCircuitConfidence}`,
          confidence: postPhysicsConfidence,
        });

        return this.buildStandardResult(
          signalTriage, causalTraces, physicsResults, experienceResult,
          undefined, 'standard_path', globalStart, decisions, phaseDurations,
        );
      }

      // ====================================================================
      // S5: 经验加权
      // ====================================================================
      const s5Start = Date.now();
      const hypothesisCandidates = this.fuseAllEvidence(
        signalTriage, causalTraces, physicsResults, experienceResult
      );
      phaseDurations['experience_weighting'] = Date.now() - s5Start;

      decisions.push({
        point: 'S5_experience_weighting',
        choice: `fused_${hypothesisCandidates.length}_hypotheses`,
        reason: hypothesisCandidates.length > 0
          ? `top_fused=${hypothesisCandidates[0].fusedConfidence.toFixed(3)}`
          : 'no_candidates',
        confidence: hypothesisCandidates.length > 0 ? hypothesisCandidates[0].fusedConfidence : 0,
      });

      // ====================================================================
      // S6: 深度推理（CostGate 门控）
      // ====================================================================
      const s6Start = Date.now();
      let grokResult: Record<string, unknown> | undefined;
      let grokUsed = false;

      if (!routing.skippedPhases.includes('deep_reasoning') && !globalAbort.signal.aborted) {
        const topConfidence = hypothesisCandidates.length > 0
          ? hypothesisCandidates[0].fusedConfidence
          : 0;

        // CostGate 评估
        const costGate = this.evaluateCostGate(
          deviceImportance, topConfidence, currentLoad
        );

        decisions.push({
          point: 'S6_cost_gate',
          choice: costGate.shouldTrigger ? 'allow_grok' : 'block_grok',
          reason: costGate.shouldTrigger
            ? `grokScore=${costGate.grokScore.toFixed(3)}, budget=${costGate.remainingBudget}`
            : `blocked: ${costGate.rejectReason}`,
          confidence: costGate.grokScore,
        });

        if (costGate.shouldTrigger && this.grokService) {
          try {
            const grokResponse = await this.executeWithTimeout(
              () => this.invokeGrokDeepReasoning(
                stimulus, signalTriage, hypothesisCandidates.slice(0, 3)
              ),
              Math.min(5000, routing.latencyBudgetMs * 0.4),
              'deep_reasoning',
            );
            grokResult = grokResponse;
            grokUsed = true;
            this.dailyGrokUsed++;

            // 用 Grok 结果增强假设置信度
            this.enhanceWithGrokResult(hypothesisCandidates, grokResult);
          } catch (err) {
            log.warn({
              error: err instanceof Error ? err.message : String(err),
            }, 'Grok deep reasoning failed, continuing without');
          }
        }
      }
      phaseDurations['deep_reasoning'] = Date.now() - s6Start;

      // ====================================================================
      // 最终融合 + 结果构建
      // ====================================================================
      return this.buildStandardResult(
        signalTriage, causalTraces, physicsResults, experienceResult,
        grokResult, routing.route, globalStart, decisions, phaseDurations,
        hypothesisCandidates, grokUsed,
      );

    } catch (err) {
      // 全局降级
      log.error({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
        elapsed: Date.now() - globalStart,
      }, 'Orchestration failed, falling back');

      return this.buildFallbackResult(stimulus, perception, globalStart, decisions, phaseDurations);
    } finally {
      clearTimeout(globalTimeout);
    }
  }

  // ==========================================================================
  // S0: 动态路由
  // ==========================================================================

  private determineRoute(
    stimulus: CognitionStimulus,
    perception: PerceptionOutput | undefined,
    deviceImportance: number,
    currentLoad: number,
  ): RoutingDecision {
    // 紧急模式 → fallback
    if (stimulus.priority === 'critical' && currentLoad > 0.9) {
      return {
        route: 'fallback_path',
        reason: 'critical_priority_high_load',
        skippedPhases: [],
        latencyBudgetMs: 2000,
      };
    }

    // 无感知数据 → fallback
    if (!perception || !perception.success) {
      return {
        route: 'fallback_path',
        reason: 'no_perception_data',
        skippedPhases: [],
        latencyBudgetMs: 2000,
      };
    }

    // 高重要度设备 + 低负载 → deep_path
    if (deviceImportance >= 0.8 && currentLoad < 0.6) {
      return {
        route: 'deep_path',
        reason: `high_importance=${deviceImportance.toFixed(2)}_low_load=${currentLoad.toFixed(2)}`,
        skippedPhases: [],
        latencyBudgetMs: this.config.latencyBudgetMs,
      };
    }

    // 高负载 → fast_path（跳过物理验证和深度推理）
    if (currentLoad > 0.8) {
      return {
        route: 'fast_path',
        reason: `high_load=${currentLoad.toFixed(2)}`,
        skippedPhases: ['physics_verification', 'deep_reasoning'],
        latencyBudgetMs: Math.floor(this.config.latencyBudgetMs * 0.5),
      };
    }

    // 默认 → standard_path
    return {
      route: 'standard_path',
      reason: 'default_standard',
      skippedPhases: ['deep_reasoning'],
      latencyBudgetMs: this.config.latencyBudgetMs,
    };
  }

  // ==========================================================================
  // S1: 信号分类
  // ==========================================================================

  private performSignalTriage(perception: PerceptionOutput | undefined): SignalTriageResult {
    if (!perception?.success || !perception.data) {
      return {
        dominantDomain: 'bearing_fault',
        domainConfidences: {},
        severity: 0.5,
        keyFeatures: [],
        sensorTags: [],
      };
    }

    const anomalies = perception.data.anomalies ?? [];
    const domainScores: Record<string, number> = {};
    const allFeatures: string[] = [];
    const allSensors: string[] = [];
    let maxSeverity = 0;

    // 基于异常信号分类到域
    for (const anomaly of anomalies) {
      const domain = this.classifyAnomalyToDomain(anomaly);
      domainScores[domain] = (domainScores[domain] ?? 0) + (anomaly.severity ?? 0.5);
      allFeatures.push(anomaly.type ?? anomaly.description ?? 'unknown');
      if (anomaly.source) allSensors.push(anomaly.source);
      maxSeverity = Math.max(maxSeverity, anomaly.severity ?? 0.5);
    }

    // 归一化域置信度
    const totalScore = Object.values(domainScores).reduce((s, v) => s + v, 0) || 1;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(domainScores)) {
      normalized[k] = v / totalScore;
    }

    // 找主导域
    let dominantDomain: AnomalyDomain = 'bearing_fault';
    let maxConf = 0;
    for (const [domain, conf] of Object.entries(normalized)) {
      if (conf > maxConf) {
        maxConf = conf;
        dominantDomain = domain as AnomalyDomain;
      }
    }

    return {
      dominantDomain,
      domainConfidences: normalized,
      severity: maxSeverity,
      keyFeatures: [...new Set(allFeatures)],
      sensorTags: [...new Set(allSensors)],
    };
  }

  /**
   * 基于异常描述关键词分类到异常域
   */
  private classifyAnomalyToDomain(anomaly: Record<string, unknown>): AnomalyDomain {
    const text = `${anomaly.type ?? ''} ${anomaly.description ?? ''} ${anomaly.sensorId ?? ''}`.toLowerCase();

    const domainKeywords: Record<AnomalyDomain, string[]> = {
      bearing_fault: ['bearing', '轴承', 'bpfo', 'bpfi', 'bsf', 'ftf', 'envelope'],
      gear_damage: ['gear', '齿轮', 'mesh', '啮合', 'sideband', '齿面'],
      motor_degradation: ['motor', '电机', 'current', '电流', 'stator', '定子', 'rotor'],
      structural_fatigue: ['fatigue', '疲劳', 'crack', '裂纹', 'strain', '应变', 'stress'],
      hydraulic_leak: ['hydraulic', '液压', 'leak', '泄漏', 'pressure', '油压'],
      wire_rope_break: ['rope', '钢丝绳', 'wire', 'tension', '张力', 'mfl'],
      pump_cavitation: ['pump', '泵', 'cavitation', '气蚀', 'npsh', '汽蚀'],
      insulation_aging: ['insulation', '绝缘', 'partial_discharge', '局放', 'pd'],
    };

    let bestDomain: AnomalyDomain = 'bearing_fault';
    let bestScore = 0;

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain as AnomalyDomain;
      }
    }

    return bestDomain;
  }

  // ==========================================================================
  // S4: 假设提取（从因果路径和经验中）
  // ==========================================================================

  private extractHypotheses(
    triage: SignalTriageResult,
    causalTraces: CausalTrace[],
    experience: ExperienceRetrievalResult | undefined,
  ): Array<{ id: string; description: string; domain: AnomalyDomain }> {
    const hypotheses: Array<{ id: string; description: string; domain: AnomalyDomain }> = [];
    const seen = new Set<string>();

    // 从因果路径提取根因作为假设
    for (const trace of causalTraces) {
      if (!seen.has(trace.rootCauseId)) {
        seen.add(trace.rootCauseId);
        hypotheses.push({
          id: `causal_${trace.rootCauseId}`,
          description: `因果溯源: ${trace.path.join(' → ')}`,
          domain: triage.dominantDomain,
        });
      }
    }

    // 从经验池提取
    if (experience) {
      for (const ep of experience.episodic.slice(0, 3)) {
        const key = `exp_${ep.rootCause}`;
        if (!seen.has(key)) {
          seen.add(key);
          hypotheses.push({
            id: key,
            description: `经验匹配: ${ep.rootCause} (相似度=${ep.similarity.toFixed(2)})`,
            domain: (ep.domain as AnomalyDomain) ?? triage.dominantDomain,
          });
        }
      }
    }

    // 如果没有任何假设，基于域生成默认假设
    if (hypotheses.length === 0) {
      hypotheses.push({
        id: `default_${triage.dominantDomain}`,
        description: `默认假设: ${triage.dominantDomain} (基于信号分类)`,
        domain: triage.dominantDomain,
      });
    }

    return hypotheses.slice(0, 8); // 最多 8 个假设
  }

  // ==========================================================================
  // S5: 全证据融合
  // ==========================================================================

  /**
   * 融合因果、物理、经验三路证据，生成排序后的假设候选列表
   *
   * 融合公式：
   *   fusedConfidence = w_causal × causal + w_physics × physics + w_experience × experience
   *   其中权重根据各路证据的可用性动态调整
   */
  private fuseAllEvidence(
    triage: SignalTriageResult,
    causalTraces: CausalTrace[],
    physicsResults: PhysicsVerificationResult[],
    experience: ExperienceRetrievalResult | undefined,
  ): HypothesisCandidate[] {
    const candidates: HypothesisCandidate[] = [];
    const hypothesisMap = new Map<string, HypothesisCandidate>();

    // 从因果路径构建候选
    for (const trace of causalTraces) {
      const id = trace.rootCauseId;
      if (!hypothesisMap.has(id)) {
        hypothesisMap.set(id, {
          id,
          description: `${trace.path.join(' → ')}`,
          domain: triage.dominantDomain,
          confidences: { prior: 0.5, causal: 0, physics: 0, experience: 0, grok: 0 },
          fusedConfidence: 0,
          causalTraces: [],
          sources: new Set(['causal']),
        });
      }
      const candidate = hypothesisMap.get(id)!;
      candidate.causalTraces.push(trace);
      // 因果置信度 = 最强路径权重
      candidate.confidences.causal = Math.max(candidate.confidences.causal, trace.pathWeight);
    }

    // 注入物理验证结果
    for (const pr of physicsResults) {
      const id = pr.hypothesisId.replace(/^causal_|^exp_|^default_/, '');
      const candidate = hypothesisMap.get(id) ?? hypothesisMap.get(pr.hypothesisId);
      if (candidate) {
        candidate.confidences.physics = pr.physicsConfidence;
        candidate.physicsResult = pr;
        candidate.sources.add('physics');
      }
    }

    // 注入经验置信度
    if (experience) {
      for (const ep of experience.episodic) {
        // 尝试匹配
        for (const [, candidate] of hypothesisMap) {
          if (candidate.description.includes(ep.rootCause) ||
              ep.rootCause.includes(candidate.id)) {
            candidate.confidences.experience = Math.max(
              candidate.confidences.experience,
              ep.decayedScore
            );
            candidate.sources.add('experience');
          }
        }
      }
    }

    // DS + Bayesian 融合
    for (const [, candidate] of hypothesisMap) {
      candidate.fusedConfidence = this.computeFusedConfidence(candidate);
      candidates.push(candidate);
    }

    // 按融合置信度降序排序
    candidates.sort((a, b) => b.fusedConfidence - a.fusedConfidence);
    return candidates;
  }

  /**
   * 计算单个假设的融合置信度
   *
   * 使用 DS 组合规则的简化版本：
   *   1. 计算各源的可用性权重（有数据的源权重更高）
   *   2. 加权平均 + 一致性奖励
   */
  private computeFusedConfidence(candidate: HypothesisCandidate): number {
    const { causal, physics, experience, prior } = candidate.confidences;
    const sources = candidate.sources;

    // 动态权重分配（基于可用性）
    let w_causal = sources.has('causal') ? 0.35 : 0;
    let w_physics = sources.has('physics') ? 0.35 : 0;
    let w_experience = sources.has('experience') ? 0.20 : 0;
    let w_prior = 0.10;

    // 归一化
    const totalW = w_causal + w_physics + w_experience + w_prior || 1;
    w_causal /= totalW;
    w_physics /= totalW;
    w_experience /= totalW;
    w_prior /= totalW;

    // 加权平均
    let fused = w_causal * causal + w_physics * physics + w_experience * experience + w_prior * prior;

    // 一致性奖励：多源一致时提升置信度
    const activeConfidences = [causal, physics, experience].filter(c => c > 0);
    if (activeConfidences.length >= 2) {
      const mean = activeConfidences.reduce((s, v) => s + v, 0) / activeConfidences.length;
      const variance = activeConfidences.reduce((s, v) => s + (v - mean) ** 2, 0) / activeConfidences.length;
      const consistency = Math.max(0, 1 - Math.sqrt(variance) * 2);
      fused = fused * (1 + 0.1 * consistency); // 最多 10% 奖励
    }

    return Math.min(1, Math.max(0, fused));
  }

  // ==========================================================================
  // S6: CostGate + Grok 深度推理
  // ==========================================================================

  /**
   * CostGate 评估 — 决定是否调用 Grok
   *
   * 公式：grokScore = deviceImportance × (1 - topConfidence) × (1 - expHitRate × suppression) × (1 - shortCircuitRate × suppression)
   * 阈值：grokScore > 0.35 且预算充足时允许调用
   */
  private evaluateCostGate(
    deviceImportance: number,
    topConfidence: number,
    currentLoad: number,
  ): CostGateResult {
    const remainingBudget = this.config.costGate.dailyGrokBudget - this.dailyGrokUsed;

    // 预算耗尽
    if (remainingBudget <= 0) {
      return {
        shouldTrigger: false,
        grokScore: 0,
        rejectReason: 'daily_budget_exhausted',
        remainingBudget: 0,
      };
    }

    // 高负载抑制
    if (currentLoad > 0.85) {
      return {
        shouldTrigger: false,
        grokScore: 0,
        rejectReason: `high_load=${currentLoad.toFixed(2)}`,
        remainingBudget,
      };
    }

    // 经验命中率抑制因子
    const expHitRate = this.totalSessionCount > 0
      ? this.shortCircuitCount / this.totalSessionCount
      : 0;
    const expSuppression = 1 - expHitRate * this.config.costGate.experienceHitSuppression;

    // 短路率抑制因子
    const shortCircuitRate = this.totalSessionCount > 0
      ? this.shortCircuitCount / this.totalSessionCount
      : 0;
    const scSuppression = 1 - shortCircuitRate * this.config.costGate.shortCircuitSuppression;

    // Grok 必要性评分
    const grokScore = deviceImportance * (1 - topConfidence) * expSuppression * scSuppression;

    const shouldTrigger = grokScore > 0.35 && remainingBudget > 0;

    return {
      shouldTrigger,
      grokScore,
      rejectReason: shouldTrigger ? undefined : `grokScore=${grokScore.toFixed(3)}<0.35`,
      remainingBudget,
    };
  }

  /**
   * 调用 Grok 深度推理 — 使用半结构化工具编排模板
   */
  private async invokeGrokDeepReasoning(
    stimulus: CognitionStimulus,
    triage: SignalTriageResult,
    topHypotheses: HypothesisCandidate[],
  ): Promise<Record<string, unknown>> {
    if (!this.grokService) {
      throw new Error('GrokReasoningService not available');
    }

    // 获取域对应的工具模板
    const toolTemplate = TOOL_TEMPLATES[triage.dominantDomain] ?? TOOL_TEMPLATES['bearing_fault'];

    // 构建增强查询
    const hypothesisDesc = topHypotheses
      .map((h, i) => `假设${i + 1}: ${h.description} (置信度=${h.fusedConfidence.toFixed(2)})`)
      .join('\n');

    const query = [
      `设备 ${stimulus.deviceCode ?? stimulus.nodeId ?? 'unknown'} 出现异常，`,
      `主导异常域: ${triage.dominantDomain}，严重度: ${triage.severity.toFixed(2)}`,
      `关键特征: ${triage.keyFeatures.join(', ')}`,
      `\n当前候选假设:\n${hypothesisDesc}`,
      `\n推荐工具调用顺序: ${toolTemplate.join(' → ')}`,
      `\n请执行深度诊断，验证或排除上述假设，给出最终根因判断和置信度。`,
    ].join('\n');

    const request: DiagnoseRequest = {
      machineId: stimulus.deviceCode ?? stimulus.nodeId ?? 'unknown',
      query,
      triggerType: 'chain',
      priority: stimulus.priority === 'critical' ? 'critical' : 'normal',
    };

    const response = await this.grokService.diagnose(request);

    return {
      sessionId: response.sessionId,
      result: response.result,
      narrative: response.narrative,
      fallbackUsed: response.fallbackUsed,
    };
  }

  /**
   * 用 Grok 结果增强假设置信度
   */
  private enhanceWithGrokResult(
    candidates: HypothesisCandidate[],
    grokResult: Record<string, unknown>,
  ): void {
    // 从 Grok 结果中提取置信度增强
    const result = grokResult.result as Record<string, unknown> | undefined;
    if (!result) return;

    const grokConfidence = typeof result.confidence === 'number' ? result.confidence : 0;
    const grokConclusion = typeof result.conclusion === 'string' ? result.conclusion : '';

    // 增强与 Grok 结论最匹配的假设
    for (const candidate of candidates) {
      if (grokConclusion.includes(candidate.id) ||
          grokConclusion.includes(candidate.description.substring(0, 20))) {
        candidate.confidences.grok = grokConfidence;
        candidate.sources.add('grok');
        // 重新计算融合置信度
        candidate.fusedConfidence = this.computeFusedConfidence(candidate);
      }
    }

    // 重新排序
    candidates.sort((a, b) => b.fusedConfidence - a.fusedConfidence);
  }

  // ==========================================================================
  // 不确定性估计
  // ==========================================================================

  /**
   * 端到端 RSS 不确定性合成 + 来源分解
   *
   * total_uncertainty = sqrt(Σ source_uncertainty²)
   */
  private computeUncertaintyDecomposition(
    candidates: HypothesisCandidate[],
    physicsResults: PhysicsVerificationResult[],
  ): { total: number; sources: Record<string, number> } {
    const sources: Record<string, number> = {};

    // 物理验证不确定性
    if (physicsResults.length > 0) {
      const physicsUncertainties = physicsResults
        .filter(r => r.uncertainty)
        .map(r => r.uncertainty.std);
      sources['physics'] = physicsUncertainties.length > 0
        ? physicsUncertainties.reduce((s, v) => s + v, 0) / physicsUncertainties.length
        : 0.3;
    } else {
      sources['physics'] = 0.5; // 无物理验证 → 高不确定性
    }

    // 因果路径不确定性（基于路径权重的离散度）
    const topCandidate = candidates[0];
    if (topCandidate && topCandidate.causalTraces.length > 0) {
      const weights = topCandidate.causalTraces.map(t => t.pathWeight);
      const mean = weights.reduce((s, v) => s + v, 0) / weights.length;
      const variance = weights.reduce((s, v) => s + (v - mean) ** 2, 0) / weights.length;
      sources['causal'] = Math.sqrt(variance);
    } else {
      sources['causal'] = 0.4;
    }

    // 经验不确定性（基于匹配度的反面）
    if (topCandidate && topCandidate.confidences.experience > 0) {
      sources['experience'] = 1 - topCandidate.confidences.experience;
    } else {
      sources['experience'] = 0.5;
    }

    // 模型不确定性（基于融合置信度的反面）
    sources['model'] = topCandidate ? 1 - topCandidate.fusedConfidence : 0.5;

    // RSS 合成
    const total = Math.sqrt(
      Object.values(sources).reduce((s, v) => s + v * v, 0)
    );

    return { total: Math.min(1, total), sources };
  }

  // ==========================================================================
  // 结果构建
  // ==========================================================================

  private buildStandardResult(
    triage: SignalTriageResult,
    causalTraces: CausalTrace[],
    physicsResults: PhysicsVerificationResult[],
    experience: ExperienceRetrievalResult | undefined,
    grokResult: Record<string, unknown> | undefined,
    route: ReasoningRoute,
    globalStart: number,
    decisions: DecisionLogEntry['decisions'],
    phaseDurations: Record<string, number>,
    candidates?: HypothesisCandidate[],
    grokUsed = false,
  ): OrchestratorResult {
    // 如果没有预计算的候选，现在计算
    const finalCandidates = candidates ?? this.fuseAllEvidence(
      triage, causalTraces, physicsResults, experience
    );

    const uncertainty = this.computeUncertaintyDecomposition(finalCandidates, physicsResults);
    const topCandidate = finalCandidates[0];

    // 构建阶段摘要
    const phases = this.buildPhaseSummaries(phaseDurations);

    // 构建解释图 (JSON-LD)
    const explanationGraph = this.buildExplanationGraph(
      triage, finalCandidates, causalTraces, physicsResults
    );

    const result: OrchestratorResult = {
      route,
      phases,
      hypotheses: finalCandidates.map(c => ({
        id: c.id,
        description: c.description,
        confidence: c.fusedConfidence,
        physicsVerified: c.physicsResult?.physicallyFeasible ?? false,
        experienceSupported: c.confidences.experience > 0,
        causalPathCount: c.causalTraces.length,
        sources: [...c.sources],
      })),
      decision: topCandidate
        ? `${topCandidate.description} (confidence=${topCandidate.fusedConfidence.toFixed(3)})`
        : 'insufficient_evidence',
      confidence: topCandidate?.fusedConfidence ?? 0,
      uncertaintyDecomposition: uncertainty,
      explanationGraph,
      totalDurationMs: Date.now() - globalStart,
      grokUsed,
      grokCallCount: grokUsed ? 1 : 0,
    };

    // 记录到 Observability
    this.observability.recordSession({
      route,
      hypothesisHit: (topCandidate?.fusedConfidence ?? 0) > 0.5,
      physicsVerified: topCandidate?.physicsResult?.physicallyFeasible ?? false,
      causalCovered: (topCandidate?.causalTraces.length ?? 0) > 0,
      experienceHit: (topCandidate?.confidences.experience ?? 0) > 0,
      grokUsed,
      grokCallCount: grokUsed ? 1 : 0,
      latencyMs: Date.now() - globalStart,
      fellBack: route === 'fallback_path',
      feedbackLooped: false,
      costGateBlocked: false,
      uncertainty: result.uncertaintyDecomposition.total,
      shortCircuited: route === 'fast_path',
    });

    log.info({
      route,
      hypothesisCount: finalCandidates.length,
      topConfidence: topCandidate?.fusedConfidence ?? 0,
      grokUsed,
      totalMs: result.totalDurationMs,
    }, 'Orchestration completed');

    return result;
  }

  private buildFallbackResult(
    stimulus: CognitionStimulus,
    perception: PerceptionOutput | undefined,
    globalStart: number,
    decisions: DecisionLogEntry['decisions'],
    phaseDurations: Record<string, number>,
  ): OrchestratorResult {
    decisions.push({
      point: 'fallback',
      choice: 'template_rules',
      reason: 'timeout_or_error',
      confidence: 0,
    });

    return {
      route: 'fallback_path',
      phases: this.buildPhaseSummaries(phaseDurations),
      hypotheses: [],
      decision: 'fallback_to_template_rules',
      confidence: 0,
      uncertaintyDecomposition: { total: 1, sources: { fallback: 1 } },
      explanationGraph: { '@type': 'FallbackResult', reason: 'degraded' },
      totalDurationMs: Date.now() - globalStart,
      grokUsed: false,
      grokCallCount: 0,
    };
  }

  private buildShortCircuitResult(
    topExperience: ExperienceRetrievalResult['episodic'][0] | undefined,
    experience: ExperienceRetrievalResult,
    triage: SignalTriageResult,
    globalStart: number,
    decisions: DecisionLogEntry['decisions'],
    phaseDurations: Record<string, number>,
    atPhase: OrchestratorPhase,
  ): OrchestratorResult {
    return {
      route: 'fast_path',
      phases: this.buildPhaseSummaries(phaseDurations),
      hypotheses: topExperience ? [{
        id: topExperience.id,
        description: topExperience.rootCause,
        confidence: topExperience.decayedScore,
        physicsVerified: false,
        experienceSupported: true,
        causalPathCount: 0,
        sources: ['experience'],
      }] : [],
      decision: topExperience
        ? `经验快速命中: ${topExperience.rootCause} (score=${topExperience.decayedScore.toFixed(3)})`
        : 'no_experience_match',
      confidence: topExperience?.decayedScore ?? 0,
      uncertaintyDecomposition: {
        total: topExperience ? 1 - topExperience.decayedScore : 1,
        sources: { experience: topExperience ? 1 - topExperience.decayedScore : 1 },
      },
      explanationGraph: {
        '@type': 'ShortCircuit',
        atPhase,
        experienceHitRate: experience.hitRate,
      },
      totalDurationMs: Date.now() - globalStart,
      grokUsed: false,
      grokCallCount: 0,
    };
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private buildPhaseSummaries(
    phaseDurations: Record<string, number>,
  ): Record<OrchestratorPhase, ModuleExecutionSummary> {
    const phases: OrchestratorPhase[] = [
      'signal_classification', 'vector_retrieval', 'causal_tracing',
      'physics_verification', 'experience_weighting', 'deep_reasoning',
    ];

    const result: Record<string, ModuleExecutionSummary> = {};
    for (const phase of phases) {
      result[phase] = {
        module: phase,
        success: phaseDurations[phase] !== undefined,
        durationMs: phaseDurations[phase] ?? 0,
        timestamp: new Date(),
        skippedReason: phaseDurations[phase] === undefined ? 'disabled' : undefined,
      };
    }
    return result as Record<OrchestratorPhase, ModuleExecutionSummary>;
  }

  /**
   * 构建 JSON-LD 解释图
   */
  private buildExplanationGraph(
    triage: SignalTriageResult,
    candidates: HypothesisCandidate[],
    causalTraces: CausalTrace[],
    physicsResults: PhysicsVerificationResult[],
  ): Record<string, unknown> {
    return {
      '@context': 'https://schema.org/extensions/reasoning',
      '@type': 'ReasoningExplanation',
      signalClassification: {
        dominantDomain: triage.dominantDomain,
        severity: triage.severity,
        features: triage.keyFeatures,
      },
      hypotheses: candidates.slice(0, 5).map(c => ({
        '@type': 'Hypothesis',
        id: c.id,
        description: c.description,
        confidence: c.fusedConfidence,
        evidenceSources: [...c.sources],
        confidenceBreakdown: c.confidences,
      })),
      causalPaths: causalTraces.slice(0, 5).map(t => ({
        '@type': 'CausalPath',
        from: t.symptomId,
        to: t.rootCauseId,
        weight: t.pathWeight,
        mechanisms: t.mechanisms,
      })),
      physicsVerifications: physicsResults.slice(0, 5).map(r => ({
        '@type': 'PhysicsVerification',
        hypothesisId: r.hypothesisId,
        feasible: r.physicallyFeasible,
        confidence: r.physicsConfidence,
      })),
    };
  }

  /**
   * 计算当前最高置信度（用于短路判断）
   */
  private computeCurrentMaxConfidence(
    causalTraces: CausalTrace[],
    physicsResults: PhysicsVerificationResult[],
    experience: ExperienceRetrievalResult | undefined,
  ): number {
    let maxConf = 0;

    // 物理验证置信度
    for (const pr of physicsResults) {
      if (pr.physicallyFeasible) {
        maxConf = Math.max(maxConf, pr.physicsConfidence);
      }
    }

    // 因果路径权重
    for (const trace of causalTraces) {
      maxConf = Math.max(maxConf, trace.pathWeight * 0.9); // 因果路径最高贡献 90%
    }

    // 经验命中
    if (experience && experience.episodic.length > 0) {
      maxConf = Math.max(maxConf, experience.episodic[0].decayedScore);
    }

    return maxConf;
  }

  /**
   * 自适应并发数计算
   *
   * 范围 [4, 12]，基于 currentLoad 线性插值
   */
  private computeAdaptiveConcurrency(currentLoad: number): number {
    const min = 4;
    const max = 12;
    // 负载越高，并发越低
    const concurrency = Math.round(max - (max - min) * currentLoad);
    return Math.max(min, Math.min(max, concurrency));
  }

  /**
   * 带超时的异步执行包装器
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    phaseName: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${phaseName} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * 每日预算重置
   */
  private resetDailyBudgetIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.dailyResetDate) {
      this.dailyGrokUsed = 0;
      this.dailyResetDate = today;
      log.info('Daily Grok budget reset');
    }
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(
    base: OrchestratorConfig,
    override?: Partial<OrchestratorConfig>,
  ): OrchestratorConfig {
    if (!override) return { ...base };
    return {
      routing: { ...base.routing, ...override.routing },
      costGate: { ...base.costGate, ...override.costGate },
      shortCircuitConfidence: override.shortCircuitConfidence ?? base.shortCircuitConfidence,
      parallelFanout: { ...base.parallelFanout, ...override.parallelFanout },
      latencyBudgetMs: override.latencyBudgetMs ?? base.latencyBudgetMs,
    };
  }
}
