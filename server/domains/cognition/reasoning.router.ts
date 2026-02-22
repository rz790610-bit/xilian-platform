/**
 * ============================================================================
 * Phase 2 — 认知层推理引擎增强 · tRPC 路由
 * ============================================================================
 *
 * 提供 Phase 2 推理引擎的前端可视化 API：
 *   - 动态配置注册表 CRUD（可增加、可修改、可删除配置项）
 *   - 引擎配置读写（Orchestrator / CausalGraph / ExperiencePool / PhysicsVerifier / FeedbackLoop）
 *   - 因果图数据获取和路径追溯
 *   - 经验池统计和搜索
 *   - 反馈环统计、修订日志、回滚
 *   - 可观测性 12 项指标
 *   - Shadow Mode 统计和手动晋升/回退
 */

import { router, publicProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, and, asc, desc } from 'drizzle-orm';
import { engineConfigRegistry } from '../../../drizzle/evolution-schema';
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
// 内置配置项种子数据（首次初始化时写入数据库）
// ============================================================================

interface SeedConfigItem {
  module: string;
  configGroup: string;
  configKey: string;
  configValue: string;
  valueType: 'number' | 'string' | 'boolean' | 'json';
  defaultValue: string;
  label: string;
  description: string;
  unit?: string;
  constraints?: { min?: number; max?: number; step?: number; options?: string[] };
  sortOrder: number;
}

const BUILTIN_SEED_CONFIGS: SeedConfigItem[] = [
  // ── Orchestrator · routing ──
  { module: 'orchestrator', configGroup: 'routing', configKey: 'fastPathConfidence', configValue: '0.85', valueType: 'number', defaultValue: '0.85', label: '快速路径置信度阈值', description: '经验命中置信度 >= 此值时走快速路径，跳过深度推理', unit: '', constraints: { min: 0.5, max: 1.0, step: 0.01 }, sortOrder: 10 },
  { module: 'orchestrator', configGroup: 'routing', configKey: 'deepPathTrigger', configValue: '0.4', valueType: 'number', defaultValue: '0.4', label: '深度路径触发阈值', description: '置信度 < 此值时触发深度推理路径（因果图 + 物理验证 + Grok）', unit: '', constraints: { min: 0.1, max: 0.8, step: 0.01 }, sortOrder: 20 },
  { module: 'orchestrator', configGroup: 'routing', configKey: 'fallbackTimeoutMs', configValue: '30000', valueType: 'number', defaultValue: '30000', label: '兜底超时', description: '推理超时后降级为经验匹配结果', unit: 'ms', constraints: { min: 5000, max: 120000, step: 1000 }, sortOrder: 30 },
  // ── Orchestrator · costGate ──
  { module: 'orchestrator', configGroup: 'costGate', configKey: 'dailyGrokBudget', configValue: '200', valueType: 'number', defaultValue: '200', label: '每日 Grok 调用预算', description: '每日允许的 Grok API 调用次数上限', unit: '次', constraints: { min: 0, max: 10000, step: 10 }, sortOrder: 40 },
  { module: 'orchestrator', configGroup: 'costGate', configKey: 'experienceHitSuppression', configValue: '0.3', valueType: 'number', defaultValue: '0.3', label: '经验命中抑制系数', description: '经验命中后对 Grok 调用概率的抑制比例', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 50 },
  { module: 'orchestrator', configGroup: 'costGate', configKey: 'shortCircuitSuppression', configValue: '0.2', valueType: 'number', defaultValue: '0.2', label: '短路抑制系数', description: '短路判断后对后续模块调用的抑制比例', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 60 },
  // ── Orchestrator · parallelFanout ──
  { module: 'orchestrator', configGroup: 'parallelFanout', configKey: 'maxConcurrency', configValue: '8', valueType: 'number', defaultValue: '8', label: '最大并行度', description: '并行扇出阶段的最大并发任务数', unit: '', constraints: { min: 1, max: 32, step: 1 }, sortOrder: 70 },
  { module: 'orchestrator', configGroup: 'parallelFanout', configKey: 'taskTimeoutMs', configValue: '5000', valueType: 'number', defaultValue: '5000', label: '单任务超时', description: '并行扇出中单个任务的超时时间', unit: 'ms', constraints: { min: 1000, max: 30000, step: 500 }, sortOrder: 80 },
  { module: 'orchestrator', configGroup: 'parallelFanout', configKey: 'globalTimeoutMs', configValue: '15000', valueType: 'number', defaultValue: '15000', label: '全局超时', description: '并行扇出阶段的全局超时时间', unit: 'ms', constraints: { min: 5000, max: 60000, step: 1000 }, sortOrder: 90 },
  // ── Orchestrator · general ──
  { module: 'orchestrator', configGroup: 'general', configKey: 'shortCircuitConfidence', configValue: '0.95', valueType: 'number', defaultValue: '0.95', label: '短路置信度', description: '置信度 >= 此值时直接输出结果，跳过剩余阶段', unit: '', constraints: { min: 0.8, max: 1.0, step: 0.01 }, sortOrder: 100 },
  { module: 'orchestrator', configGroup: 'general', configKey: 'latencyBudgetMs', configValue: '5000', valueType: 'number', defaultValue: '5000', label: '延迟预算', description: '单次推理的总延迟预算', unit: 'ms', constraints: { min: 1000, max: 30000, step: 500 }, sortOrder: 110 },

  // ── CausalGraph ──
  { module: 'causalGraph', configGroup: 'graph', configKey: 'maxNodes', configValue: '500', valueType: 'number', defaultValue: '500', label: '最大节点数', description: '因果图允许的最大节点数量', unit: '个', constraints: { min: 50, max: 5000, step: 50 }, sortOrder: 10 },
  { module: 'causalGraph', configGroup: 'graph', configKey: 'edgeDecayRatePerDay', configValue: '0.05', valueType: 'number', defaultValue: '0.05', label: '边权衰减率/天', description: '因果边权重每天的自然衰减率', unit: '/天', constraints: { min: 0, max: 0.5, step: 0.01 }, sortOrder: 20 },
  { module: 'causalGraph', configGroup: 'graph', configKey: 'minEdgeWeight', configValue: '0.3', valueType: 'number', defaultValue: '0.3', label: '最小边权', description: '低于此权重的边将被自动修剪', unit: '', constraints: { min: 0.05, max: 0.8, step: 0.05 }, sortOrder: 30 },
  { module: 'causalGraph', configGroup: 'graph', configKey: 'maxWhyDepth', configValue: '5', valueType: 'number', defaultValue: '5', label: '最大 5-Why 深度', description: '因果追溯的最大递归深度', unit: '层', constraints: { min: 2, max: 10, step: 1 }, sortOrder: 40 },
  { module: 'causalGraph', configGroup: 'graph', configKey: 'enableGrokCompletion', configValue: 'true', valueType: 'boolean', defaultValue: 'true', label: '启用 Grok 补全', description: '是否允许 Grok 自动补全缺失的因果关系', sortOrder: 50 },

  // ── ExperiencePool · capacity ──
  { module: 'experiencePool', configGroup: 'capacity', configKey: 'episodicCapacity', configValue: '1000', valueType: 'number', defaultValue: '1000', label: '情景记忆容量', description: '情景记忆层的最大记录数', unit: '条', constraints: { min: 100, max: 10000, step: 100 }, sortOrder: 10 },
  { module: 'experiencePool', configGroup: 'capacity', configKey: 'semanticCapacity', configValue: '500', valueType: 'number', defaultValue: '500', label: '语义记忆容量', description: '语义记忆层的最大记录数', unit: '条', constraints: { min: 50, max: 5000, step: 50 }, sortOrder: 20 },
  { module: 'experiencePool', configGroup: 'capacity', configKey: 'proceduralCapacity', configValue: '200', valueType: 'number', defaultValue: '200', label: '程序记忆容量', description: '程序记忆层的最大记录数', unit: '条', constraints: { min: 20, max: 2000, step: 20 }, sortOrder: 30 },
  // ── ExperiencePool · decay ──
  { module: 'experiencePool', configGroup: 'decay', configKey: 'timeHalfLifeDays', configValue: '30', valueType: 'number', defaultValue: '30', label: '时间半衰期', description: '经验记录的时间维度半衰期', unit: '天', constraints: { min: 7, max: 365, step: 1 }, sortOrder: 40 },
  { module: 'experiencePool', configGroup: 'decay', configKey: 'deviceSimilarityWeight', configValue: '0.4', valueType: 'number', defaultValue: '0.4', label: '设备相似度权重', description: '经验检索时设备相似度的权重', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 50 },
  { module: 'experiencePool', configGroup: 'decay', configKey: 'conditionSimilarityWeight', configValue: '0.3', valueType: 'number', defaultValue: '0.3', label: '工况相似度权重', description: '经验检索时工况相似度的权重', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 60 },
  // ── ExperiencePool · retrieval ──
  { module: 'experiencePool', configGroup: 'retrieval', configKey: 'retrievalTopK', configValue: '5', valueType: 'number', defaultValue: '5', label: '检索 Top-K', description: '经验检索返回的最大结果数', unit: '条', constraints: { min: 1, max: 20, step: 1 }, sortOrder: 70 },
  { module: 'experiencePool', configGroup: 'retrieval', configKey: 'minSimilarity', configValue: '0.6', valueType: 'number', defaultValue: '0.6', label: '最小相似度', description: '经验检索的最小相似度阈值', unit: '', constraints: { min: 0.1, max: 0.95, step: 0.05 }, sortOrder: 80 },

  // ── PhysicsVerifier ──
  { module: 'physicsVerifier', configGroup: 'verification', configKey: 'mappingConfidenceThreshold', configValue: '0.3', valueType: 'number', defaultValue: '0.3', label: '映射置信度阈值', description: '物理公式映射的最低置信度', unit: '', constraints: { min: 0.1, max: 0.8, step: 0.05 }, sortOrder: 10 },
  { module: 'physicsVerifier', configGroup: 'verification', configKey: 'residualThreshold', configValue: '0.15', valueType: 'number', defaultValue: '0.15', label: '残差阈值', description: '物理验证的残差容忍阈值', unit: '', constraints: { min: 0.01, max: 0.5, step: 0.01 }, sortOrder: 20 },
  { module: 'physicsVerifier', configGroup: 'verification', configKey: 'monteCarloSamples', configValue: '1000', valueType: 'number', defaultValue: '1000', label: 'Monte Carlo 采样数', description: '不确定性量化的蒙特卡洛采样次数', unit: '次', constraints: { min: 100, max: 10000, step: 100 }, sortOrder: 30 },
  { module: 'physicsVerifier', configGroup: 'verification', configKey: 'enableGrokMapping', configValue: 'true', valueType: 'boolean', defaultValue: 'true', label: '启用 Grok 映射', description: '是否允许 Grok 辅助物理公式映射', sortOrder: 40 },
  // ── PhysicsVerifier · sourceWeights ──
  { module: 'physicsVerifier', configGroup: 'sourceWeights', configKey: 'ruleWeight', configValue: '0.30', valueType: 'number', defaultValue: '0.30', label: '规则源权重', description: '规则匹配源在三源融合中的权重', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 50 },
  { module: 'physicsVerifier', configGroup: 'sourceWeights', configKey: 'embeddingWeight', configValue: '0.40', valueType: 'number', defaultValue: '0.40', label: '嵌入源权重', description: '向量嵌入源在三源融合中的权重', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 60 },
  { module: 'physicsVerifier', configGroup: 'sourceWeights', configKey: 'grokWeight', configValue: '0.30', valueType: 'number', defaultValue: '0.30', label: 'Grok 源权重', description: 'Grok 推理源在三源融合中的权重', unit: '', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 70 },

  // ── FeedbackLoop ──
  { module: 'feedbackLoop', configGroup: 'general', configKey: 'minSamplesForUpdate', configValue: '3', valueType: 'number', defaultValue: '3', label: '最小更新样本数', description: '触发知识更新所需的最小反馈样本数', unit: '个', constraints: { min: 1, max: 20, step: 1 }, sortOrder: 10 },
  { module: 'feedbackLoop', configGroup: 'general', configKey: 'enableAutoFeedback', configValue: 'true', valueType: 'boolean', defaultValue: 'true', label: '启用自动反馈', description: '是否自动将推理结果反馈到知识库', sortOrder: 20 },
  { module: 'feedbackLoop', configGroup: 'general', configKey: 'revisionLogRetentionDays', configValue: '90', valueType: 'number', defaultValue: '90', label: '修订日志保留天数', description: '修订日志的保留时间', unit: '天', constraints: { min: 7, max: 365, step: 1 }, sortOrder: 30 },
  // ── FeedbackLoop · learningRate ──
  { module: 'feedbackLoop', configGroup: 'learningRate', configKey: 'initialLearningRate', configValue: '0.1', valueType: 'number', defaultValue: '0.1', label: '初始学习率', description: '知识更新的初始学习率', unit: '', constraints: { min: 0.001, max: 1.0, step: 0.01 }, sortOrder: 40 },
  { module: 'feedbackLoop', configGroup: 'learningRate', configKey: 'minLearningRate', configValue: '0.01', valueType: 'number', defaultValue: '0.01', label: '最小学习率', description: '学习率衰减的下限', unit: '', constraints: { min: 0.001, max: 0.5, step: 0.001 }, sortOrder: 50 },
  { module: 'feedbackLoop', configGroup: 'learningRate', configKey: 'maxLearningRate', configValue: '0.5', valueType: 'number', defaultValue: '0.5', label: '最大学习率', description: '学习率的上限', unit: '', constraints: { min: 0.1, max: 2.0, step: 0.05 }, sortOrder: 60 },
  { module: 'feedbackLoop', configGroup: 'learningRate', configKey: 'decayFactor', configValue: '0.995', valueType: 'number', defaultValue: '0.995', label: '衰减因子', description: '每轮反馈后学习率的衰减系数', unit: '', constraints: { min: 0.9, max: 1.0, step: 0.001 }, sortOrder: 70 },
];

// ============================================================================
// 运行时状态存储（内存态，服务重启后重置为默认值）
// ============================================================================

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

  // ========== 动态配置注册表 CRUD ==========

  /** 获取全部配置项（按 module + group 分组） */
  listConfigItems: publicProcedure
    .input(z.object({
      module: z.string().optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        // 数据库不可用时返回内置种子数据
        let items = BUILTIN_SEED_CONFIGS.map((s, i) => ({
          id: i + 1,
          ...s,
          enabled: true,
          isBuiltin: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        if (input?.module) items = items.filter(i => i.module === input.module);
        return { items, source: 'memory' as const };
      }

      try {
        // 检查表中是否有数据，没有则初始化种子数据
        const existing = await db.select().from(engineConfigRegistry).limit(1);
        if (existing.length === 0) {
          // 批量插入种子数据
          for (const seed of BUILTIN_SEED_CONFIGS) {
            await db.insert(engineConfigRegistry).values({
              module: seed.module,
              configGroup: seed.configGroup,
              configKey: seed.configKey,
              configValue: seed.configValue,
              valueType: seed.valueType,
              defaultValue: seed.defaultValue,
              label: seed.label,
              description: seed.description,
              unit: seed.unit || null,
              constraints: seed.constraints || null,
              sortOrder: seed.sortOrder,
              enabled: 1,
              isBuiltin: 1,
            });
          }
        }

        const conditions = [];
        if (input?.module) conditions.push(eq(engineConfigRegistry.module, input.module));
        if (input?.enabled !== undefined) conditions.push(eq(engineConfigRegistry.enabled, input.enabled ? 1 : 0));

        const rows = conditions.length > 0
          ? await db.select().from(engineConfigRegistry).where(and(...conditions)).orderBy(asc(engineConfigRegistry.module), asc(engineConfigRegistry.sortOrder))
          : await db.select().from(engineConfigRegistry).orderBy(asc(engineConfigRegistry.module), asc(engineConfigRegistry.sortOrder));

        return {
          items: rows.map(r => ({
            ...r,
            enabled: r.enabled === 1,
            isBuiltin: r.isBuiltin === 1,
            createdAt: r.createdAt?.toISOString() ?? '',
            updatedAt: r.updatedAt?.toISOString() ?? '',
          })),
          source: 'database' as const,
        };
      } catch (err) {
        // 表不存在等情况，回退到内存种子数据
        let items = BUILTIN_SEED_CONFIGS.map((s, i) => ({
          id: i + 1,
          ...s,
          enabled: true,
          isBuiltin: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        if (input?.module) items = items.filter(i => i.module === input.module);
        return { items, source: 'memory' as const };
      }
    }),

  /** 新增配置项 */
  addConfigItem: publicProcedure
    .input(z.object({
      module: z.string(),
      configGroup: z.string().default('general'),
      configKey: z.string(),
      configValue: z.string(),
      valueType: z.enum(['number', 'string', 'boolean', 'json']).default('string'),
      defaultValue: z.string().optional(),
      label: z.string(),
      description: z.string().optional(),
      unit: z.string().optional(),
      constraints: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
        options: z.array(z.string()).optional(),
      }).optional(),
      sortOrder: z.number().default(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用' };
      try {
        await db.insert(engineConfigRegistry).values({
          module: input.module,
          configGroup: input.configGroup,
          configKey: input.configKey,
          configValue: input.configValue,
          valueType: input.valueType,
          defaultValue: input.defaultValue || input.configValue,
          label: input.label,
          description: input.description || '',
          unit: input.unit || null,
          constraints: input.constraints || null,
          sortOrder: input.sortOrder,
          enabled: 1,
          isBuiltin: 0,
        });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || '新增失败' };
      }
    }),

  /** 更新配置项的值 */
  updateConfigItem: publicProcedure
    .input(z.object({
      id: z.number(),
      configValue: z.string().optional(),
      label: z.string().optional(),
      description: z.string().optional(),
      unit: z.string().optional(),
      constraints: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
        options: z.array(z.string()).optional(),
      }).optional(),
      enabled: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用' };
      try {
        const updates: Record<string, any> = {};
        if (input.configValue !== undefined) updates.configValue = input.configValue;
        if (input.label !== undefined) updates.label = input.label;
        if (input.description !== undefined) updates.description = input.description;
        if (input.unit !== undefined) updates.unit = input.unit;
        if (input.constraints !== undefined) updates.constraints = input.constraints;
        if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
        if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
        updates.updatedAt = new Date();

        await db.update(engineConfigRegistry).set(updates).where(eq(engineConfigRegistry.id, input.id));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || '更新失败' };
      }
    }),

  /** 删除配置项（仅限非内置项） */
  deleteConfigItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用' };
      try {
        // 检查是否为内置项
        const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id)).limit(1);
        if (rows.length === 0) return { success: false, error: '配置项不存在' };
        if (rows[0].isBuiltin === 1) return { success: false, error: '内置配置项不可删除，仅可修改值' };

        await db.delete(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || '删除失败' };
      }
    }),

  /** 重置配置项为默认值 */
  resetConfigItem: publicProcedure
    .input(z.object({
      id: z.number().optional(),
      module: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用' };
      try {
        if (input.id) {
          // 重置单个配置项
          const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id)).limit(1);
          if (rows.length > 0 && rows[0].defaultValue) {
            await db.update(engineConfigRegistry).set({ configValue: rows[0].defaultValue, updatedAt: new Date() }).where(eq(engineConfigRegistry.id, input.id));
          }
        } else if (input.module) {
          // 重置整个模块
          const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.module, input.module));
          for (const row of rows) {
            if (row.defaultValue) {
              await db.update(engineConfigRegistry).set({ configValue: row.defaultValue, updatedAt: new Date() }).where(eq(engineConfigRegistry.id, row.id));
            }
          }
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || '重置失败' };
      }
    }),

  /** 批量导入配置项 */
  importConfigItems: publicProcedure
    .input(z.object({
      items: z.array(z.object({
        module: z.string(),
        configGroup: z.string().default('general'),
        configKey: z.string(),
        configValue: z.string(),
        valueType: z.enum(['number', 'string', 'boolean', 'json']).default('string'),
        defaultValue: z.string().optional(),
        label: z.string(),
        description: z.string().optional(),
        unit: z.string().optional(),
        constraints: z.object({
          min: z.number().optional(),
          max: z.number().optional(),
          step: z.number().optional(),
          options: z.array(z.string()).optional(),
        }).optional(),
        sortOrder: z.number().default(100),
      })),
      overwrite: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用', imported: 0 };
      let imported = 0;
      try {
        for (const item of input.items) {
          try {
            await db.insert(engineConfigRegistry).values({
              module: item.module,
              configGroup: item.configGroup,
              configKey: item.configKey,
              configValue: item.configValue,
              valueType: item.valueType,
              defaultValue: item.defaultValue || item.configValue,
              label: item.label,
              description: item.description || '',
              unit: item.unit || null,
              constraints: item.constraints || null,
              sortOrder: item.sortOrder,
              enabled: 1,
              isBuiltin: 0,
            });
            imported++;
          } catch {
            // 唯一键冲突时，如果 overwrite 则更新
            if (input.overwrite) {
              const existing = await db.select().from(engineConfigRegistry)
                .where(and(eq(engineConfigRegistry.module, item.module), eq(engineConfigRegistry.configKey, item.configKey)))
                .limit(1);
              if (existing.length > 0) {
                await db.update(engineConfigRegistry).set({
                  configValue: item.configValue,
                  label: item.label,
                  description: item.description || '',
                  unit: item.unit || null,
                  constraints: item.constraints || null,
                  sortOrder: item.sortOrder,
                  updatedAt: new Date(),
                }).where(eq(engineConfigRegistry.id, existing[0].id));
                imported++;
              }
            }
          }
        }
        return { success: true, imported };
      } catch (err: any) {
        return { success: false, error: err?.message || '导入失败', imported };
      }
    }),

  /** 获取可用的模块列表 */
  getModuleList: publicProcedure.query(() => [
    { id: 'orchestrator', label: '混合编排器', icon: '🎯', description: '推理路由、成本门控、并行扇出' },
    { id: 'causalGraph', label: '因果图', icon: '🕸️', description: '因果关系图结构、Grok 补全' },
    { id: 'experiencePool', label: '经验池', icon: '🧠', description: '三层记忆容量、衰减策略、检索参数' },
    { id: 'physicsVerifier', label: '物理验证器', icon: '⚛️', description: '验证参数、三源融合权重' },
    { id: 'feedbackLoop', label: '反馈环', icon: '🔄', description: '学习率、自动反馈、修订日志' },
    { id: 'custom', label: '自定义', icon: '⚙️', description: '用户自定义配置项' },
  ]),

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
