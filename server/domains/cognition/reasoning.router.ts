/**
 * ============================================================================
 * Phase 2 — 认知层推理引擎增强 · tRPC 路由
 * ============================================================================
 *
 * 提供 Phase 2 推理引擎的前端可视化 API：
 *   - 引擎配置读写（Orchestrator / CausalGraph / ExperiencePool / PhysicsVerifier / FeedbackLoop）
 *   - 因果图数据获取和路径追溯
 *   - 经验池统计和搜索
 *   - 反馈环统计、修订日志、回滚
 *   - 可观测性 12 项指标
 *   - Shadow Mode 统计和手动晋升/回退
 */

import { router, publicProcedure } from '../../core/trpc';
import { z } from 'zod';
import type {
  OrchestratorConfig,
  CausalGraphConfig,
  ExperiencePoolConfig,
  PhysicsVerifierConfig,
  FeedbackLoopConfig,
  ReasoningMetrics,
  AnomalyDomain,
  CausalNode,
  CausalEdge,
  CausalTrace,
  RevisionLogEntry,
  FeedbackEvent,
  OrchestratorPhase,
} from '../../platform/cognition/reasoning/reasoning.types';

// ============================================================================
// 运行时状态存储（内存态，服务重启后重置为默认值）
// ============================================================================

/** 默认 Orchestrator 配置 */
const defaultOrchestratorConfig: OrchestratorConfig = {
  routing: {
    fastPathConfidence: 0.85,
    deepPathTrigger: 0.4,
    fallbackTimeoutMs: 30000,
  },
  costGate: {
    dailyGrokBudget: 200,
    dailyGrokUsed: 0,
    experienceHitSuppression: 0.3,
    shortCircuitSuppression: 0.2,
  },
  shortCircuitConfidence: 0.95,
  parallelFanout: {
    maxConcurrency: 8,
    taskTimeoutMs: 5000,
    globalTimeoutMs: 15000,
  },
  latencyBudgetMs: 5000,
};

/** 默认 CausalGraph 配置 */
const defaultCausalGraphConfig: CausalGraphConfig = {
  maxNodes: 500,
  edgeDecayRatePerDay: 0.05,
  minEdgeWeight: 0.3,
  maxWhyDepth: 5,
  enableGrokCompletion: true,
  concurrency: { maxConcurrency: 4, taskTimeoutMs: 3000, globalTimeoutMs: 10000 },
};

/** 默认 ExperiencePool 配置 */
const defaultExperiencePoolConfig: ExperiencePoolConfig = {
  capacity: { episodic: 1000, semantic: 500, procedural: 200 },
  decay: { timeHalfLifeDays: 30, deviceSimilarityWeight: 0.4, conditionSimilarityWeight: 0.3 },
  adaptiveDimensionThresholds: { singleDimension: 50, twoDimension: 200 },
  retrievalTopK: 5,
  minSimilarity: 0.6,
};

/** 默认 PhysicsVerifier 配置 */
const defaultPhysicsVerifierConfig: PhysicsVerifierConfig = {
  mappingConfidenceThreshold: 0.3,
  sourceWeights: { rule: 0.30, embedding: 0.40, grok: 0.30 },
  residualThreshold: 0.15,
  monteCarloSamples: 1000,
  concurrency: { maxConcurrency: 4, taskTimeoutMs: 5000, globalTimeoutMs: 15000 },
  enableGrokMapping: true,
};

/** 默认 FeedbackLoop 配置 */
const defaultFeedbackLoopConfig: FeedbackLoopConfig = {
  minSamplesForUpdate: 3,
  learningRate: { initial: 0.1, min: 0.01, max: 0.5, decayFactor: 0.995 },
  revisionLogRetentionDays: 90,
  enableAutoFeedback: true,
};

// 运行时可变配置（内存态）
let orchestratorConfig = { ...defaultOrchestratorConfig };
let causalGraphConfig = { ...defaultCausalGraphConfig };
let experiencePoolConfig = { ...defaultExperiencePoolConfig };
let physicsVerifierConfig = { ...defaultPhysicsVerifierConfig };
let feedbackLoopConfig = { ...defaultFeedbackLoopConfig };

// 运行时模拟数据（因果图种子数据）
const seedCausalNodes: CausalNode[] = [
  { id: 'bearing_inner_race_defect', label: '内圈缺陷', type: 'root_cause', domain: 'bearing_fault', priorProbability: 0.15, equationIds: ['eq_bearing_freq'], sensorTags: ['vib_de', 'vib_fe'], metadata: {} },
  { id: 'bearing_outer_race_defect', label: '外圈缺陷', type: 'root_cause', domain: 'bearing_fault', priorProbability: 0.12, equationIds: ['eq_bearing_freq'], sensorTags: ['vib_de'], metadata: {} },
  { id: 'bearing_ball_defect', label: '滚动体缺陷', type: 'root_cause', domain: 'bearing_fault', priorProbability: 0.08, equationIds: ['eq_bearing_freq'], sensorTags: ['vib_de', 'vib_fe'], metadata: {} },
  { id: 'bearing_vibration_increase', label: '轴承振动增大', type: 'symptom', domain: 'bearing_fault', priorProbability: 0.6, equationIds: [], sensorTags: ['vib_rms'], metadata: {} },
  { id: 'bearing_temperature_rise', label: '轴承温度升高', type: 'symptom', domain: 'bearing_fault', priorProbability: 0.5, equationIds: ['eq_heat_balance'], sensorTags: ['temp_bearing'], metadata: {} },
  { id: 'lubrication_degradation', label: '润滑退化', type: 'mechanism', domain: 'bearing_fault', priorProbability: 0.3, equationIds: [], sensorTags: [], metadata: {} },
  { id: 'gear_tooth_crack', label: '齿面裂纹', type: 'root_cause', domain: 'gear_damage', priorProbability: 0.1, equationIds: ['eq_gear_mesh'], sensorTags: ['vib_gear'], metadata: {} },
  { id: 'gear_pitting', label: '齿面点蚀', type: 'root_cause', domain: 'gear_damage', priorProbability: 0.12, equationIds: ['eq_gear_mesh'], sensorTags: ['vib_gear'], metadata: {} },
  { id: 'gear_vibration_modulation', label: '齿轮调制振动', type: 'symptom', domain: 'gear_damage', priorProbability: 0.55, equationIds: [], sensorTags: ['vib_gear_mod'], metadata: {} },
  { id: 'motor_insulation_aging', label: '电机绝缘老化', type: 'root_cause', domain: 'motor_degradation', priorProbability: 0.08, equationIds: ['eq_insulation'], sensorTags: ['pd_sensor'], metadata: {} },
  { id: 'motor_current_imbalance', label: '电流不平衡', type: 'symptom', domain: 'motor_degradation', priorProbability: 0.45, equationIds: ['eq_motor_current'], sensorTags: ['current_a', 'current_b', 'current_c'], metadata: {} },
  { id: 'structural_crack_propagation', label: '裂纹扩展', type: 'root_cause', domain: 'structural_fatigue', priorProbability: 0.06, equationIds: ['eq_paris_law'], sensorTags: ['strain_gauge'], metadata: {} },
  { id: 'structural_stress_concentration', label: '应力集中', type: 'mechanism', domain: 'structural_fatigue', priorProbability: 0.25, equationIds: ['eq_stress'], sensorTags: ['strain_gauge'], metadata: {} },
  { id: 'structural_deformation', label: '结构变形', type: 'symptom', domain: 'structural_fatigue', priorProbability: 0.4, equationIds: [], sensorTags: ['disp_sensor'], metadata: {} },
  { id: 'hydraulic_seal_wear', label: '液压密封磨损', type: 'root_cause', domain: 'hydraulic_leak', priorProbability: 0.1, equationIds: ['eq_flow_continuity'], sensorTags: ['pressure_hyd'], metadata: {} },
  { id: 'hydraulic_pressure_drop', label: '液压压力下降', type: 'symptom', domain: 'hydraulic_leak', priorProbability: 0.5, equationIds: ['eq_flow_continuity'], sensorTags: ['pressure_hyd'], metadata: {} },
  { id: 'wire_rope_strand_break', label: '钢丝绳断股', type: 'root_cause', domain: 'wire_rope_break', priorProbability: 0.05, equationIds: ['eq_wire_tension'], sensorTags: ['tension_sensor'], metadata: {} },
  { id: 'wire_rope_tension_anomaly', label: '钢丝绳张力异常', type: 'symptom', domain: 'wire_rope_break', priorProbability: 0.35, equationIds: ['eq_wire_tension'], sensorTags: ['tension_sensor'], metadata: {} },
];

const seedCausalEdges: (CausalEdge & { key: string })[] = [
  { key: 'e1', source: 'bearing_inner_race_defect', target: 'bearing_vibration_increase', weight: 0.92, mechanism: '内圈缺陷→冲击脉冲→振动增大', evidenceCount: 45, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e2', source: 'bearing_outer_race_defect', target: 'bearing_vibration_increase', weight: 0.88, mechanism: '外圈缺陷→周期冲击→振动增大', evidenceCount: 38, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e3', source: 'bearing_ball_defect', target: 'bearing_vibration_increase', weight: 0.75, mechanism: '滚动体缺陷→不规则冲击→振动', evidenceCount: 22, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e4', source: 'lubrication_degradation', target: 'bearing_temperature_rise', weight: 0.85, mechanism: '润滑退化→摩擦增大→温升', evidenceCount: 35, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e5', source: 'bearing_inner_race_defect', target: 'lubrication_degradation', weight: 0.65, mechanism: '内圈缺陷→表面粗糙度增加→润滑膜破坏', evidenceCount: 18, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e6', source: 'gear_tooth_crack', target: 'gear_vibration_modulation', weight: 0.90, mechanism: '齿面裂纹→啮合刚度变化→调制振动', evidenceCount: 30, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e7', source: 'gear_pitting', target: 'gear_vibration_modulation', weight: 0.82, mechanism: '齿面点蚀→接触面积减小→振动调制', evidenceCount: 25, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e8', source: 'motor_insulation_aging', target: 'motor_current_imbalance', weight: 0.78, mechanism: '绝缘老化→匝间短路→电流不平衡', evidenceCount: 20, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e9', source: 'structural_stress_concentration', target: 'structural_crack_propagation', weight: 0.70, mechanism: '应力集中→疲劳裂纹萌生→扩展', evidenceCount: 15, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e10', source: 'structural_crack_propagation', target: 'structural_deformation', weight: 0.80, mechanism: '裂纹扩展→截面削弱→变形增大', evidenceCount: 12, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e11', source: 'hydraulic_seal_wear', target: 'hydraulic_pressure_drop', weight: 0.88, mechanism: '密封磨损→内泄漏→压力下降', evidenceCount: 28, lastUpdatedAt: new Date(), source_type: 'seed' },
  { key: 'e12', source: 'wire_rope_strand_break', target: 'wire_rope_tension_anomaly', weight: 0.85, mechanism: '断股→有效截面减小→张力分布异常', evidenceCount: 10, lastUpdatedAt: new Date(), source_type: 'seed' },
];

// 模拟经验池数据
interface ExperienceRecord {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  domain: AnomalyDomain;
  description: string;
  deviceCode: string;
  confidence: number;
  hitCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

const seedExperiences: ExperienceRecord[] = [
  { id: 'exp-001', type: 'episodic', domain: 'bearing_fault', description: '岸桥#3 主起升电机驱动端轴承内圈缺陷 → BPFI 特征频率 148.2Hz 显著', deviceCode: 'QC-03', confidence: 0.92, hitCount: 12, createdAt: new Date('2025-11-15'), lastAccessedAt: new Date('2026-02-10') },
  { id: 'exp-002', type: 'episodic', domain: 'gear_damage', description: '场桥#7 大车行走减速箱齿面点蚀 → 啮合频率 2x 边带增强', deviceCode: 'RTG-07', confidence: 0.87, hitCount: 8, createdAt: new Date('2025-12-03'), lastAccessedAt: new Date('2026-02-08') },
  { id: 'exp-003', type: 'semantic', domain: 'bearing_fault', description: '轴承故障模式规则：BPFI/BPFO 特征频率幅值 > 3σ 且温度趋势上升 → 轴承缺陷概率 > 0.8', deviceCode: '*', confidence: 0.95, hitCount: 45, createdAt: new Date('2025-10-01'), lastAccessedAt: new Date('2026-02-15') },
  { id: 'exp-004', type: 'procedural', domain: 'hydraulic_leak', description: '液压系统泄漏诊断流程：1)检查压力传感器 2)对比流量计 3)红外热成像定位 4)密封件检查', deviceCode: '*', confidence: 0.90, hitCount: 20, createdAt: new Date('2025-09-20'), lastAccessedAt: new Date('2026-01-25') },
  { id: 'exp-005', type: 'episodic', domain: 'motor_degradation', description: '岸桥#1 小车电机绝缘老化 → 局部放电信号增强 + 三相电流不平衡度 > 5%', deviceCode: 'QC-01', confidence: 0.85, hitCount: 6, createdAt: new Date('2026-01-10'), lastAccessedAt: new Date('2026-02-12') },
  { id: 'exp-006', type: 'semantic', domain: 'structural_fatigue', description: '结构疲劳判据：应变片峰值 > 设计值 80% 且循环次数 > 10^6 → 疲劳裂纹风险高', deviceCode: '*', confidence: 0.88, hitCount: 15, createdAt: new Date('2025-11-01'), lastAccessedAt: new Date('2026-02-05') },
  { id: 'exp-007', type: 'episodic', domain: 'wire_rope_break', description: '场桥#12 起升钢丝绳断股 → 张力传感器波动 > 15% + 视觉检测发现外层断丝', deviceCode: 'RTG-12', confidence: 0.93, hitCount: 3, createdAt: new Date('2026-02-01'), lastAccessedAt: new Date('2026-02-18') },
  { id: 'exp-008', type: 'procedural', domain: 'gear_damage', description: '齿轮箱诊断流程：1)频谱分析(GMF+边带) 2)油液分析(Fe/Cu含量) 3)内窥镜检查 4)齿面磨损测量', deviceCode: '*', confidence: 0.91, hitCount: 18, createdAt: new Date('2025-08-15'), lastAccessedAt: new Date('2026-02-14') },
];

// 模拟反馈事件和修订日志
const feedbackEvents: FeedbackEvent[] = [
  { type: 'hypothesis_confirmed', sessionId: 'sess-001', data: { hypothesisId: 'h-bearing-inner', confidence: 0.92 }, reward: 1.0, timestamp: new Date('2026-02-15T10:30:00') },
  { type: 'hypothesis_rejected', sessionId: 'sess-002', data: { hypothesisId: 'h-gear-crack', reason: '油液分析未发现金属颗粒' }, reward: -0.5, timestamp: new Date('2026-02-14T14:20:00') },
  { type: 'new_causal_link', sessionId: 'sess-003', data: { source: 'lubrication_degradation', target: 'gear_pitting', weight: 0.55 }, reward: 0.8, timestamp: new Date('2026-02-13T09:15:00') },
  { type: 'experience_recorded', sessionId: 'sess-004', data: { experienceId: 'exp-009', domain: 'bearing_fault' }, reward: 0.6, timestamp: new Date('2026-02-12T16:45:00') },
  { type: 'physics_rule_updated', sessionId: 'sess-005', data: { equationId: 'eq_bearing_freq', parameter: 'contact_angle', oldValue: 15, newValue: 15.5 }, reward: 0.3, timestamp: new Date('2026-02-11T11:00:00') },
];

const revisionLog: RevisionLogEntry[] = [
  { id: 'rev-001', component: 'causal_edge', entityId: 'e1', previousValue: { weight: 0.88 }, newValue: { weight: 0.92 }, feedbackEventType: 'hypothesis_confirmed', sessionId: 'sess-001', timestamp: new Date('2026-02-15T10:30:00'), rolledBack: false },
  { id: 'rev-002', component: 'experience_weight', entityId: 'exp-001', previousValue: { confidence: 0.88 }, newValue: { confidence: 0.92 }, feedbackEventType: 'hypothesis_confirmed', sessionId: 'sess-001', timestamp: new Date('2026-02-15T10:30:00'), rolledBack: false },
  { id: 'rev-003', component: 'causal_edge', entityId: 'e6', previousValue: { weight: 0.92 }, newValue: { weight: 0.90 }, feedbackEventType: 'hypothesis_rejected', sessionId: 'sess-002', timestamp: new Date('2026-02-14T14:20:00'), rolledBack: false },
  { id: 'rev-004', component: 'physics_param', entityId: 'eq_bearing_freq.contact_angle', previousValue: { value: 15 }, newValue: { value: 15.5 }, feedbackEventType: 'physics_rule_updated', sessionId: 'sess-005', timestamp: new Date('2026-02-11T11:00:00'), rolledBack: false },
];

// 模拟可观测性指标
const observabilityMetrics: ReasoningMetrics = {
  hypothesisHitRate: 0.78,
  physicsVerificationRate: 0.65,
  causalCoverageRate: 0.82,
  experienceHitRate: 0.71,
  grokCallRate: 0.23,
  avgLatencyMs: 1850,
  p95LatencyMs: 4200,
  fallbackRate: 0.05,
  feedbackLoopRate: 0.62,
  costGateBlockRate: 0.12,
  avgUncertainty: 0.28,
  shortCircuitRate: 0.35,
};

// Shadow Mode 统计
let shadowModeStats = {
  totalSessions: 156,
  challengerHits: 128,
  championHits: 118,
  challengerHitRate: 0.82,
  championHitRate: 0.76,
  hitRateDelta: 6.4,
  pValue: 0.032,
  avgLatencyRatio: 1.15,
  fallbackCount: 4,
  promotionReady: true,
  mode: 'shadow' as 'champion' | 'challenger' | 'shadow',
};

// ============================================================================
// tRPC 路由定义
// ============================================================================

export const reasoningEngineRouter = router({

  // ========== 引擎配置 ==========

  /** 获取全部引擎配置 */
  getEngineConfig: publicProcedure.query(() => ({
    orchestrator: orchestratorConfig,
    causalGraph: causalGraphConfig,
    experiencePool: experiencePoolConfig,
    physicsVerifier: physicsVerifierConfig,
    feedbackLoop: feedbackLoopConfig,
  })),

  /** 更新引擎配置（部分更新） */
  updateEngineConfig: publicProcedure
    .input(z.object({
      module: z.enum(['orchestrator', 'causalGraph', 'experiencePool', 'physicsVerifier', 'feedbackLoop']),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => {
      const { module, config } = input;
      switch (module) {
        case 'orchestrator':
          orchestratorConfig = deepMerge(orchestratorConfig, config) as OrchestratorConfig;
          break;
        case 'causalGraph':
          causalGraphConfig = deepMerge(causalGraphConfig, config) as CausalGraphConfig;
          break;
        case 'experiencePool':
          experiencePoolConfig = deepMerge(experiencePoolConfig, config) as ExperiencePoolConfig;
          break;
        case 'physicsVerifier':
          physicsVerifierConfig = deepMerge(physicsVerifierConfig, config) as PhysicsVerifierConfig;
          break;
        case 'feedbackLoop':
          feedbackLoopConfig = deepMerge(feedbackLoopConfig, config) as FeedbackLoopConfig;
          break;
      }
      return { success: true, module, updatedAt: new Date().toISOString() };
    }),

  /** 重置引擎配置为默认值 */
  resetEngineConfig: publicProcedure
    .input(z.object({ module: z.enum(['orchestrator', 'causalGraph', 'experiencePool', 'physicsVerifier', 'feedbackLoop', 'all']) }))
    .mutation(({ input }) => {
      if (input.module === 'all' || input.module === 'orchestrator') orchestratorConfig = { ...defaultOrchestratorConfig };
      if (input.module === 'all' || input.module === 'causalGraph') causalGraphConfig = { ...defaultCausalGraphConfig };
      if (input.module === 'all' || input.module === 'experiencePool') experiencePoolConfig = { ...defaultExperiencePoolConfig };
      if (input.module === 'all' || input.module === 'physicsVerifier') physicsVerifierConfig = { ...defaultPhysicsVerifierConfig };
      if (input.module === 'all' || input.module === 'feedbackLoop') feedbackLoopConfig = { ...defaultFeedbackLoopConfig };
      return { success: true, module: input.module, resetAt: new Date().toISOString() };
    }),

  // ========== 因果图 ==========

  /** 获取因果图全部节点和边 */
  getCausalGraph: publicProcedure.query(() => ({
    nodes: seedCausalNodes,
    edges: seedCausalEdges.map(({ key, ...e }) => ({ id: key, ...e })),
    stats: {
      nodeCount: seedCausalNodes.length,
      edgeCount: seedCausalEdges.length,
      domains: [...new Set(seedCausalNodes.map(n => n.domain))],
      avgEdgeWeight: seedCausalEdges.reduce((s, e) => s + e.weight, 0) / seedCausalEdges.length,
    },
  })),

  /** 因果路径追溯 */
  getCausalPaths: publicProcedure
    .input(z.object({
      symptomId: z.string(),
      maxDepth: z.number().default(5),
    }))
    .query(({ input }) => {
      // BFS 追溯：从 symptom 反向寻找 root_cause
      const paths: CausalTrace[] = [];
      const visited = new Set<string>();

      function dfs(nodeId: string, path: string[], weight: number, mechanisms: string[], depth: number) {
        if (depth > input.maxDepth) return;
        visited.add(nodeId);

        const node = seedCausalNodes.find(n => n.id === nodeId);
        if (node && node.type === 'root_cause' && path.length > 1) {
          paths.push({
            symptomId: input.symptomId,
            rootCauseId: nodeId,
            path: [...path],
            pathWeight: weight,
            mechanisms: [...mechanisms],
          });
        }

        // 反向查找（谁指向当前节点）
        for (const edge of seedCausalEdges) {
          if (edge.target === nodeId && !visited.has(edge.source)) {
            dfs(edge.source, [...path, edge.source], weight * edge.weight, [...mechanisms, edge.mechanism], depth + 1);
          }
        }

        visited.delete(nodeId);
      }

      dfs(input.symptomId, [input.symptomId], 1.0, [], 0);
      return paths.sort((a, b) => b.pathWeight - a.pathWeight);
    }),

  // ========== 经验池 ==========

  /** 获取经验池统计和列表 */
  getExperiencePool: publicProcedure
    .input(z.object({
      type: z.enum(['all', 'episodic', 'semantic', 'procedural']).default('all'),
      domain: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(({ input }) => {
      let filtered = [...seedExperiences];
      if (input.type !== 'all') filtered = filtered.filter(e => e.type === input.type);
      if (input.domain) filtered = filtered.filter(e => e.domain === input.domain);

      const stats = {
        total: seedExperiences.length,
        episodic: seedExperiences.filter(e => e.type === 'episodic').length,
        semantic: seedExperiences.filter(e => e.type === 'semantic').length,
        procedural: seedExperiences.filter(e => e.type === 'procedural').length,
        avgConfidence: seedExperiences.reduce((s, e) => s + e.confidence, 0) / seedExperiences.length,
        totalHits: seedExperiences.reduce((s, e) => s + e.hitCount, 0),
      };

      return {
        experiences: filtered.slice(0, input.limit).map(e => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
          lastAccessedAt: e.lastAccessedAt.toISOString(),
        })),
        stats,
      };
    }),

  /** 搜索经验 */
  searchExperience: publicProcedure
    .input(z.object({ query: z.string(), topK: z.number().default(5) }))
    .query(({ input }) => {
      // 简单关键词匹配（实际应使用向量检索）
      const keywords = input.query.toLowerCase().split(/\s+/);
      const scored = seedExperiences.map(exp => {
        const text = `${exp.description} ${exp.domain} ${exp.deviceCode}`.toLowerCase();
        const matchCount = keywords.filter(kw => text.includes(kw)).length;
        return { ...exp, score: matchCount / keywords.length, createdAt: exp.createdAt.toISOString(), lastAccessedAt: exp.lastAccessedAt.toISOString() };
      }).filter(e => e.score > 0).sort((a, b) => b.score - a.score);

      return scored.slice(0, input.topK);
    }),

  // ========== 反馈环 ==========

  /** 获取反馈环统计 */
  getFeedbackStats: publicProcedure.query(() => ({
    totalEvents: feedbackEvents.length,
    byType: {
      hypothesis_confirmed: feedbackEvents.filter(e => e.type === 'hypothesis_confirmed').length,
      hypothesis_rejected: feedbackEvents.filter(e => e.type === 'hypothesis_rejected').length,
      new_causal_link: feedbackEvents.filter(e => e.type === 'new_causal_link').length,
      experience_recorded: feedbackEvents.filter(e => e.type === 'experience_recorded').length,
      physics_rule_updated: feedbackEvents.filter(e => e.type === 'physics_rule_updated').length,
    },
    avgReward: feedbackEvents.reduce((s, e) => s + e.reward, 0) / feedbackEvents.length,
    revisionLogCount: revisionLog.length,
    rolledBackCount: revisionLog.filter(r => r.rolledBack).length,
    recentEvents: feedbackEvents.map(e => ({ ...e, timestamp: e.timestamp.toISOString() })),
  })),

  /** 获取修订日志 */
  getRevisionLog: publicProcedure
    .input(z.object({ limit: z.number().default(50), component: z.string().optional() }))
    .query(({ input }) => {
      let filtered = [...revisionLog];
      if (input.component) filtered = filtered.filter(r => r.component === input.component);
      return filtered
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, input.limit)
        .map(r => ({ ...r, timestamp: r.timestamp.toISOString() }));
    }),

  /** 回滚修订 */
  rollbackRevision: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => {
      const entry = revisionLog.find(r => r.id === input.revisionId);
      if (!entry) return { success: false, error: '修订记录不存在' };
      if (entry.rolledBack) return { success: false, error: '该修订已回滚' };
      entry.rolledBack = true;
      return { success: true, revisionId: input.revisionId, rolledBackAt: new Date().toISOString() };
    }),

  // ========== 可观测性 ==========

  /** 获取推理引擎 12 项核心指标 */
  getObservabilityMetrics: publicProcedure.query(() => observabilityMetrics),

  // ========== Shadow Mode ==========

  /** 获取 Shadow Mode 统计 */
  getShadowModeStats: publicProcedure.query(() => shadowModeStats),

  /** 手动强制晋升 Challenger */
  forcePromote: publicProcedure.mutation(() => {
    shadowModeStats = { ...shadowModeStats, mode: 'challenger' };
    return { success: true, mode: 'challenger', promotedAt: new Date().toISOString() };
  }),

  /** 手动回退到 Champion */
  forceRollback: publicProcedure.mutation(() => {
    shadowModeStats = { ...shadowModeStats, mode: 'champion' };
    return { success: true, mode: 'champion', rolledBackAt: new Date().toISOString() };
  }),

  /** 重新进入 Shadow 模式 */
  enterShadowMode: publicProcedure.mutation(() => {
    shadowModeStats = { ...shadowModeStats, mode: 'shadow' };
    return { success: true, mode: 'shadow' };
  }),
});

// ============================================================================
// 辅助函数
// ============================================================================

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
