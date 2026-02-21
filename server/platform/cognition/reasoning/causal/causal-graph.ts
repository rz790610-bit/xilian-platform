/**
 * ============================================================================
 * Phase 2 — BuiltinCausalGraph 内建因果图
 * ============================================================================
 *
 * 核心职责：维护港口机械领域的因果关系图，支持因果溯源和干预推理
 *
 * 架构设计：
 *   - graphology 内存有向图（无需 Neo4j 外部依赖）
 *   - 8 条种子因果链（6 大域 + 液压泄漏 + 钢丝绳断股）
 *   - BFS 因果路径追溯（强度累乘 + 深度限制）
 *   - do-calculus 因果干预（back-door criterion 可识别性检验）
 *   - Grok 5-Why 动态补全（膨胀控制 500 节点上限）
 *   - 边权衰减（5%/天，最低 30%）+ 休眠节点剪枝
 *
 * 设计原则：
 *   - 依赖注入（VectorStore、Observability 从构造函数传入）
 *   - 并发控制（5-Why 扩展限制 maxNewPerExpand）
 *   - 最小样本保护（≥3 次验证才更新边权重）
 *   - revision_log 支持回滚
 */

import Graph from 'graphology';
import { createModuleLogger } from '../../../../core/logger';
import type { VectorStore } from '../vector-store/vector-store';
import type { Observability } from '../observability/observability';
import type {
  CausalGraphConfig,
  CausalNode,
  CausalEdge,
  CausalTrace,
  InterventionResult,
  AnomalyDomain,
  RevisionLogEntry,
} from '../reasoning.types';

const logger = createModuleLogger('causal-graph');

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: CausalGraphConfig = {
  maxNodes: 500,
  edgeDecayRatePerDay: 0.05,
  minEdgeWeight: 0.30,
  maxWhyDepth: 5,
  enableGrokCompletion: true,
  concurrency: { maxConcurrency: 4, taskTimeoutMs: 5000, globalTimeoutMs: 15000 },
};

// ============================================================================
// 种子数据 — 8 条港口机械因果链
// ============================================================================

interface SeedChain {
  domain: AnomalyDomain;
  name: string;
  nodes: Array<Omit<CausalNode, 'metadata'> & { metadata?: Record<string, unknown> }>;
  edges: Array<Omit<CausalEdge, 'evidenceCount' | 'lastUpdatedAt' | 'source_type'> & { mechanism: string }>;
}

const SEED_CHAINS: SeedChain[] = [
  // ── Chain 1: 轴承故障 ──
  {
    domain: 'bearing_fault',
    name: '轴承故障因果链',
    nodes: [
      { id: 'bf_symptom_vib', label: '振动 RMS 升高', type: 'symptom', domain: 'bearing_fault', priorProbability: 0.7, equationIds: ['eq_bearing_vibration'], sensorTags: ['vibration_rms'], metadata: {} },
      { id: 'bf_symptom_temp', label: '轴承温度升高', type: 'symptom', domain: 'bearing_fault', priorProbability: 0.5, equationIds: [], sensorTags: ['temperature_bearing'], metadata: {} },
      { id: 'bf_mech_wear', label: '滚道磨损/剥落', type: 'mechanism', domain: 'bearing_fault', priorProbability: 0.4, equationIds: ['eq_bearing_vibration'], sensorTags: [], metadata: {} },
      { id: 'bf_mech_lubrication', label: '润滑不良', type: 'mechanism', domain: 'bearing_fault', priorProbability: 0.3, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'bf_root_overload', label: '持续过载运行', type: 'root_cause', domain: 'bearing_fault', priorProbability: 0.2, equationIds: [], sensorTags: ['load_cell'], metadata: {} },
      { id: 'bf_root_contamination', label: '润滑油污染', type: 'root_cause', domain: 'bearing_fault', priorProbability: 0.15, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'bf_cond_humidity', label: '高湿度环境', type: 'condition', domain: 'bearing_fault', priorProbability: 0.6, equationIds: [], sensorTags: ['humidity'], metadata: {} },
    ],
    edges: [
      { source: 'bf_root_overload', target: 'bf_mech_wear', weight: 0.85, mechanism: '过载导致接触应力超过疲劳极限，加速滚道剥落' },
      { source: 'bf_root_contamination', target: 'bf_mech_lubrication', weight: 0.80, mechanism: '油液中颗粒物磨损滚动体表面' },
      { source: 'bf_cond_humidity', target: 'bf_root_contamination', weight: 0.55, mechanism: '高湿度加速润滑油乳化和氧化' },
      { source: 'bf_mech_wear', target: 'bf_symptom_vib', weight: 0.90, mechanism: '滚道缺陷产生冲击脉冲，BPFO 频率特征明显' },
      { source: 'bf_mech_lubrication', target: 'bf_symptom_temp', weight: 0.75, mechanism: '润滑膜破裂导致摩擦热增加' },
      { source: 'bf_mech_wear', target: 'bf_symptom_temp', weight: 0.60, mechanism: '金属接触摩擦产生额外热量' },
    ],
  },
  // ── Chain 2: 齿轮损伤 ──
  {
    domain: 'gear_damage',
    name: '齿轮损伤因果链',
    nodes: [
      { id: 'gd_symptom_vib', label: '啮合频率边带增强', type: 'symptom', domain: 'gear_damage', priorProbability: 0.65, equationIds: ['eq_gear_mesh_frequency'], sensorTags: ['vibration_spectrum'], metadata: {} },
      { id: 'gd_symptom_noise', label: '异常噪声', type: 'symptom', domain: 'gear_damage', priorProbability: 0.5, equationIds: [], sensorTags: ['acoustic'], metadata: {} },
      { id: 'gd_mech_pitting', label: '齿面点蚀', type: 'mechanism', domain: 'gear_damage', priorProbability: 0.35, equationIds: ['eq_gear_mesh_frequency'], sensorTags: [], metadata: {} },
      { id: 'gd_mech_misalign', label: '齿轮不对中', type: 'mechanism', domain: 'gear_damage', priorProbability: 0.25, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'gd_root_fatigue', label: '齿面接触疲劳', type: 'root_cause', domain: 'gear_damage', priorProbability: 0.2, equationIds: ['eq_structural_fatigue'], sensorTags: [], metadata: {} },
      { id: 'gd_root_assembly', label: '装配误差', type: 'root_cause', domain: 'gear_damage', priorProbability: 0.15, equationIds: [], sensorTags: [], metadata: {} },
    ],
    edges: [
      { source: 'gd_root_fatigue', target: 'gd_mech_pitting', weight: 0.88, mechanism: '循环接触应力超过材料疲劳极限，表面微裂纹扩展形成点蚀' },
      { source: 'gd_root_assembly', target: 'gd_mech_misalign', weight: 0.75, mechanism: '轴系装配偏差导致齿面载荷分布不均' },
      { source: 'gd_mech_pitting', target: 'gd_symptom_vib', weight: 0.92, mechanism: '点蚀坑改变啮合刚度，产生调幅边带' },
      { source: 'gd_mech_misalign', target: 'gd_symptom_vib', weight: 0.70, mechanism: '不对中导致一次转频分量增大' },
      { source: 'gd_mech_pitting', target: 'gd_symptom_noise', weight: 0.65, mechanism: '齿面缺陷产生冲击噪声' },
    ],
  },
  // ── Chain 3: 电机退化 ──
  {
    domain: 'motor_degradation',
    name: '电机退化因果链',
    nodes: [
      { id: 'md_symptom_current', label: '电流波动/不平衡', type: 'symptom', domain: 'motor_degradation', priorProbability: 0.6, equationIds: ['eq_motor_thermal'], sensorTags: ['motor_current'], metadata: {} },
      { id: 'md_symptom_temp', label: '绕组温度异常', type: 'symptom', domain: 'motor_degradation', priorProbability: 0.55, equationIds: ['eq_motor_thermal'], sensorTags: ['temperature_motor'], metadata: {} },
      { id: 'md_mech_insulation', label: '绝缘层劣化', type: 'mechanism', domain: 'motor_degradation', priorProbability: 0.35, equationIds: ['eq_insulation_arrhenius'], sensorTags: [], metadata: {} },
      { id: 'md_mech_eccentricity', label: '气隙偏心', type: 'mechanism', domain: 'motor_degradation', priorProbability: 0.2, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'md_root_overtemp', label: '长期过温运行', type: 'root_cause', domain: 'motor_degradation', priorProbability: 0.25, equationIds: ['eq_insulation_arrhenius'], sensorTags: [], metadata: {} },
      { id: 'md_root_voltage', label: '电压不平衡', type: 'root_cause', domain: 'motor_degradation', priorProbability: 0.2, equationIds: [], sensorTags: ['voltage'], metadata: {} },
    ],
    edges: [
      { source: 'md_root_overtemp', target: 'md_mech_insulation', weight: 0.90, mechanism: 'Arrhenius 加速老化：温度每升 10°C 绝缘寿命减半' },
      { source: 'md_root_voltage', target: 'md_mech_eccentricity', weight: 0.65, mechanism: '电压不平衡产生负序磁场，导致不均匀电磁力' },
      { source: 'md_mech_insulation', target: 'md_symptom_current', weight: 0.80, mechanism: '绝缘劣化导致匝间短路，电流波形畸变' },
      { source: 'md_mech_insulation', target: 'md_symptom_temp', weight: 0.85, mechanism: '局部短路增加铜损，温度集中升高' },
      { source: 'md_mech_eccentricity', target: 'md_symptom_current', weight: 0.70, mechanism: '气隙不均匀导致电流谐波增大' },
    ],
  },
  // ── Chain 4: 结构疲劳 ──
  {
    domain: 'structural_fatigue',
    name: '结构疲劳因果链',
    nodes: [
      { id: 'sf_symptom_crack', label: '裂纹/变形检测', type: 'symptom', domain: 'structural_fatigue', priorProbability: 0.4, equationIds: ['eq_structural_fatigue'], sensorTags: ['strain_gauge'], metadata: {} },
      { id: 'sf_symptom_deflection', label: '挠度增大', type: 'symptom', domain: 'structural_fatigue', priorProbability: 0.5, equationIds: [], sensorTags: ['deflection'], metadata: {} },
      { id: 'sf_mech_accumulation', label: '疲劳损伤累积', type: 'mechanism', domain: 'structural_fatigue', priorProbability: 0.35, equationIds: ['eq_structural_fatigue'], sensorTags: [], metadata: {} },
      { id: 'sf_mech_corrosion', label: '应力腐蚀', type: 'mechanism', domain: 'structural_fatigue', priorProbability: 0.25, equationIds: [], sensorTags: ['corrosion_index'], metadata: {} },
      { id: 'sf_root_cyclic', label: '循环载荷超标', type: 'root_cause', domain: 'structural_fatigue', priorProbability: 0.3, equationIds: ['eq_structural_fatigue'], sensorTags: ['load_cycle'], metadata: {} },
      { id: 'sf_root_wind', label: '极端风载', type: 'root_cause', domain: 'structural_fatigue', priorProbability: 0.2, equationIds: [], sensorTags: ['wind_speed'], metadata: {} },
    ],
    edges: [
      { source: 'sf_root_cyclic', target: 'sf_mech_accumulation', weight: 0.88, mechanism: 'Miner 线性累积：D = Σ(n_i/N_i)，D ≥ 1 时断裂' },
      { source: 'sf_root_wind', target: 'sf_mech_accumulation', weight: 0.60, mechanism: '风载产生附加弯矩 M_wind = ½ρv²Ah/2' },
      { source: 'sf_mech_accumulation', target: 'sf_symptom_crack', weight: 0.85, mechanism: '微裂纹扩展至临界尺寸' },
      { source: 'sf_mech_corrosion', target: 'sf_mech_accumulation', weight: 0.55, mechanism: '腐蚀降低疲劳极限，加速损伤累积' },
      { source: 'sf_mech_accumulation', target: 'sf_symptom_deflection', weight: 0.70, mechanism: '截面削弱导致刚度下降' },
    ],
  },
  // ── Chain 5: 液压泄漏 ──
  {
    domain: 'hydraulic_leak',
    name: '液压泄漏因果链',
    nodes: [
      { id: 'hl_symptom_pressure', label: '系统压力下降', type: 'symptom', domain: 'hydraulic_leak', priorProbability: 0.7, equationIds: ['eq_hydraulic_pressure'], sensorTags: ['hydraulic_pressure'], metadata: {} },
      { id: 'hl_symptom_flow', label: '流量异常', type: 'symptom', domain: 'hydraulic_leak', priorProbability: 0.5, equationIds: ['eq_hydraulic_pressure'], sensorTags: ['flow_rate'], metadata: {} },
      { id: 'hl_mech_seal', label: '密封件老化', type: 'mechanism', domain: 'hydraulic_leak', priorProbability: 0.4, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'hl_mech_hose', label: '软管破裂', type: 'mechanism', domain: 'hydraulic_leak', priorProbability: 0.25, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'hl_root_aging', label: '橡胶材料老化', type: 'root_cause', domain: 'hydraulic_leak', priorProbability: 0.3, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'hl_root_pressure_spike', label: '压力冲击', type: 'root_cause', domain: 'hydraulic_leak', priorProbability: 0.2, equationIds: ['eq_hydraulic_pressure'], sensorTags: ['hydraulic_pressure'], metadata: {} },
    ],
    edges: [
      { source: 'hl_root_aging', target: 'hl_mech_seal', weight: 0.85, mechanism: '橡胶弹性下降，密封面间隙增大' },
      { source: 'hl_root_pressure_spike', target: 'hl_mech_hose', weight: 0.70, mechanism: '瞬态压力超过软管额定爆破压力' },
      { source: 'hl_mech_seal', target: 'hl_symptom_pressure', weight: 0.88, mechanism: '内泄漏导致有效工作压力下降' },
      { source: 'hl_mech_hose', target: 'hl_symptom_pressure', weight: 0.92, mechanism: '外泄漏直接降低系统压力' },
      { source: 'hl_mech_seal', target: 'hl_symptom_flow', weight: 0.65, mechanism: '泄漏流量 Q_leak = Cd×A×√(2ΔP/ρ)' },
    ],
  },
  // ── Chain 6: 钢丝绳断股 ──
  {
    domain: 'wire_rope_break',
    name: '钢丝绳断股因果链',
    nodes: [
      { id: 'wr_symptom_strand', label: '断丝/断股检测', type: 'symptom', domain: 'wire_rope_break', priorProbability: 0.35, equationIds: ['eq_wire_rope_tension'], sensorTags: ['wire_rope_sensor'], metadata: {} },
      { id: 'wr_symptom_diameter', label: '直径缩减', type: 'symptom', domain: 'wire_rope_break', priorProbability: 0.45, equationIds: [], sensorTags: ['rope_diameter'], metadata: {} },
      { id: 'wr_mech_fatigue', label: '弯曲疲劳', type: 'mechanism', domain: 'wire_rope_break', priorProbability: 0.4, equationIds: ['eq_wire_rope_tension'], sensorTags: [], metadata: {} },
      { id: 'wr_mech_corrosion', label: '钢丝腐蚀', type: 'mechanism', domain: 'wire_rope_break', priorProbability: 0.3, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'wr_root_pulley', label: '滑轮直径不足', type: 'root_cause', domain: 'wire_rope_break', priorProbability: 0.2, equationIds: [], sensorTags: [], metadata: {} },
      { id: 'wr_root_overload', label: '超载使用', type: 'root_cause', domain: 'wire_rope_break', priorProbability: 0.25, equationIds: ['eq_wire_rope_tension'], sensorTags: ['load_cell'], metadata: {} },
    ],
    edges: [
      { source: 'wr_root_pulley', target: 'wr_mech_fatigue', weight: 0.82, mechanism: 'D/d 比不足导致弯曲应力集中，加速钢丝疲劳' },
      { source: 'wr_root_overload', target: 'wr_mech_fatigue', weight: 0.75, mechanism: '超载增大钢丝拉应力，降低疲劳寿命' },
      { source: 'wr_mech_fatigue', target: 'wr_symptom_strand', weight: 0.90, mechanism: '钢丝逐根断裂，外层可见断丝' },
      { source: 'wr_mech_corrosion', target: 'wr_symptom_diameter', weight: 0.80, mechanism: '腐蚀减小钢丝截面积' },
      { source: 'wr_mech_corrosion', target: 'wr_mech_fatigue', weight: 0.60, mechanism: '腐蚀坑形成应力集中源' },
    ],
  },
  // ── Chain 7: 泵气蚀 ──
  {
    domain: 'pump_cavitation',
    name: '泵气蚀因果链',
    nodes: [
      { id: 'pc_symptom_noise', label: '泵体异响/振动', type: 'symptom', domain: 'pump_cavitation', priorProbability: 0.6, equationIds: ['eq_pump_cavitation'], sensorTags: ['pump_vibration'], metadata: {} },
      { id: 'pc_symptom_flow', label: '流量/扬程下降', type: 'symptom', domain: 'pump_cavitation', priorProbability: 0.55, equationIds: ['eq_pump_cavitation'], sensorTags: ['flow_rate', 'pressure'], metadata: {} },
      { id: 'pc_mech_bubble', label: '气泡溃灭冲击', type: 'mechanism', domain: 'pump_cavitation', priorProbability: 0.4, equationIds: ['eq_pump_cavitation'], sensorTags: [], metadata: {} },
      { id: 'pc_root_npsh', label: 'NPSHa 不足', type: 'root_cause', domain: 'pump_cavitation', priorProbability: 0.35, equationIds: ['eq_pump_cavitation'], sensorTags: ['suction_pressure'], metadata: {} },
      { id: 'pc_root_inlet', label: '进口管路阻力大', type: 'root_cause', domain: 'pump_cavitation', priorProbability: 0.2, equationIds: [], sensorTags: [], metadata: {} },
    ],
    edges: [
      { source: 'pc_root_npsh', target: 'pc_mech_bubble', weight: 0.90, mechanism: 'NPSHa < NPSHr 时液体汽化，形成气泡' },
      { source: 'pc_root_inlet', target: 'pc_root_npsh', weight: 0.70, mechanism: '管路阻力损失降低吸入口有效压力' },
      { source: 'pc_mech_bubble', target: 'pc_symptom_noise', weight: 0.88, mechanism: '气泡在高压区溃灭产生冲击波' },
      { source: 'pc_mech_bubble', target: 'pc_symptom_flow', weight: 0.75, mechanism: '气泡占据流道空间，降低有效输送能力' },
    ],
  },
  // ── Chain 8: 绝缘老化 ──
  {
    domain: 'insulation_aging',
    name: '绝缘老化因果链',
    nodes: [
      { id: 'ia_symptom_pd', label: '局部放电增加', type: 'symptom', domain: 'insulation_aging', priorProbability: 0.5, equationIds: ['eq_insulation_arrhenius'], sensorTags: ['partial_discharge'], metadata: {} },
      { id: 'ia_symptom_resistance', label: '绝缘电阻下降', type: 'symptom', domain: 'insulation_aging', priorProbability: 0.6, equationIds: [], sensorTags: ['insulation_resistance'], metadata: {} },
      { id: 'ia_mech_thermal', label: '热老化降解', type: 'mechanism', domain: 'insulation_aging', priorProbability: 0.4, equationIds: ['eq_insulation_arrhenius'], sensorTags: [], metadata: {} },
      { id: 'ia_mech_moisture', label: '受潮劣化', type: 'mechanism', domain: 'insulation_aging', priorProbability: 0.3, equationIds: [], sensorTags: ['humidity'], metadata: {} },
      { id: 'ia_root_overtemp', label: '长期高温运行', type: 'root_cause', domain: 'insulation_aging', priorProbability: 0.35, equationIds: ['eq_insulation_arrhenius'], sensorTags: ['temperature_motor'], metadata: {} },
      { id: 'ia_root_environment', label: '恶劣环境（盐雾/潮湿）', type: 'root_cause', domain: 'insulation_aging', priorProbability: 0.25, equationIds: [], sensorTags: ['humidity', 'salinity'], metadata: {} },
    ],
    edges: [
      { source: 'ia_root_overtemp', target: 'ia_mech_thermal', weight: 0.92, mechanism: 'Arrhenius: L = L0 × exp(-Ea/kT)，温度每升 10°C 寿命减半' },
      { source: 'ia_root_environment', target: 'ia_mech_moisture', weight: 0.75, mechanism: '水分渗透绝缘层，降低介电强度' },
      { source: 'ia_mech_thermal', target: 'ia_symptom_pd', weight: 0.85, mechanism: '绝缘层碳化形成导电通道，引发局部放电' },
      { source: 'ia_mech_thermal', target: 'ia_symptom_resistance', weight: 0.80, mechanism: '聚合物链断裂降低体积电阻率' },
      { source: 'ia_mech_moisture', target: 'ia_symptom_resistance', weight: 0.88, mechanism: '水分导电性直接降低绝缘电阻' },
    ],
  },
];

// ============================================================================
// BuiltinCausalGraph
// ============================================================================

export class BuiltinCausalGraph {
  private readonly graph: Graph;
  private readonly config: CausalGraphConfig;
  private readonly nodeMap: Map<string, CausalNode> = new Map();
  private readonly edgeDataMap: Map<string, CausalEdge> = new Map();
  private readonly revisionLog: RevisionLogEntry[] = [];
  private initialized = false;

  constructor(
    private readonly vectorStore: VectorStore,
    private readonly observability: Observability,
    config?: Partial<CausalGraphConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.graph = new Graph({ multi: false, type: 'directed' });
    logger.info({
      maxNodes: this.config.maxNodes,
      decayRate: this.config.edgeDecayRatePerDay,
    }, '[CausalGraph] 初始化完成');
  }

  // =========================================================================
  // 初始化
  // =========================================================================

  /** 加载种子数据到内存图 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const chain of SEED_CHAINS) {
      for (const node of chain.nodes) {
        this.addNode({ ...node, metadata: node.metadata ?? {} });
      }
      for (const edge of chain.edges) {
        this.addEdge({
          ...edge,
          evidenceCount: 10, // 种子数据默认 10 次验证
          lastUpdatedAt: new Date(),
          source_type: 'seed',
        });
      }
    }

    // 将种子节点注册到 VectorStore（用于语义检索）
    for (const [id, node] of this.nodeMap) {
      const vector = this.nodeToVector(node);
      this.vectorStore.upsert(id, vector, {
        type: 'causal_node',
        label: node.label,
        domain: node.domain,
        nodeType: node.type,
      });
    }

    this.initialized = true;
    logger.info({
      nodes: this.graph.order,
      edges: this.graph.size,
      chains: SEED_CHAINS.length,
    }, '[CausalGraph] 种子数据加载完成');
  }

  // =========================================================================
  // 因果路径追溯
  // =========================================================================

  /** BFS 因果路径追溯 — 从症状到根因 */
  queryCausalPaths(
    symptomNodeId: string,
    maxDepth: number = 5
  ): CausalTrace[] {
    const spanId = `cg_trace_${Date.now()}`;
    this.observability.startSpan(spanId, 'causal_tracing');

    try {
      if (!this.graph.hasNode(symptomNodeId)) {
        logger.warn({ nodeId: symptomNodeId }, '[CausalGraph] 症状节点不存在');
        return [];
      }

      const traces: CausalTrace[] = [];
      const queue: Array<{ path: string[]; mechanisms: string[]; weight: number }> = [
        { path: [symptomNodeId], mechanisms: [], weight: 1.0 },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const lastNode = current.path[current.path.length - 1];

        if (current.path.length > maxDepth + 1) continue;

        // 获取所有入边（反向追溯：从症状到根因）
        const inEdges = this.graph.inEdges(lastNode);

        if (inEdges.length === 0 || current.path.length > 1) {
          // 到达根节点或中间节点 — 检查是否为根因
          const nodeData = this.nodeMap.get(lastNode);
          if (nodeData && (nodeData.type === 'root_cause' || nodeData.type === 'condition')) {
            traces.push({
              symptomId: symptomNodeId,
              rootCauseId: lastNode,
              path: [...current.path],
              pathWeight: current.weight,
              mechanisms: [...current.mechanisms],
            });
          }
        }

        // 继续反向追溯
        for (const edgeKey of inEdges) {
          const source = this.graph.source(edgeKey);
          if (current.path.includes(source)) continue; // 避免环路

          const edgeData = this.edgeDataMap.get(edgeKey);
          if (!edgeData) continue;

          const newWeight = current.weight * edgeData.weight;
          if (newWeight < 0.01) continue; // 权重过低，剪枝

          queue.push({
            path: [...current.path, source],
            mechanisms: [...current.mechanisms, edgeData.mechanism],
            weight: newWeight,
          });
        }
      }

      // 按路径权重降序排序
      traces.sort((a, b) => b.pathWeight - a.pathWeight);

      return traces;
    } finally {
      this.observability.endSpan(spanId);
    }
  }

  /** 按异常域查找因果路径 */
  queryByDomain(domain: AnomalyDomain, maxDepth: number = 5): CausalTrace[] {
    const symptomNodes = Array.from(this.nodeMap.values())
      .filter((n) => n.domain === domain && n.type === 'symptom');

    const allTraces: CausalTrace[] = [];
    for (const node of symptomNodes) {
      allTraces.push(...this.queryCausalPaths(node.id, maxDepth));
    }

    // 去重并按权重排序
    const uniqueTraces = new Map<string, CausalTrace>();
    for (const trace of allTraces) {
      const key = trace.path.join('→');
      if (!uniqueTraces.has(key) || uniqueTraces.get(key)!.pathWeight < trace.pathWeight) {
        uniqueTraces.set(key, trace);
      }
    }

    return Array.from(uniqueTraces.values()).sort((a, b) => b.pathWeight - a.pathWeight);
  }

  /** 语义检索因果节点 */
  queryByEmbedding(queryText: string, topK: number = 5): Array<CausalNode & { similarity: number }> {
    const queryVector = this.nodeToVector({
      id: '', label: queryText, type: 'symptom', domain: 'bearing_fault',
      priorProbability: 0, equationIds: [], sensorTags: [], metadata: {},
    });

    const results = this.vectorStore.search({
      vector: queryVector,
      topK,
      minSimilarity: 0.2,
      filter: { type: 'causal_node' },
    });

    return results
      .map((r) => {
        const node = this.nodeMap.get(r.id);
        if (!node) return null;
        return { ...node, similarity: r.similarity };
      })
      .filter((n): n is CausalNode & { similarity: number } => n !== null);
  }

  // =========================================================================
  // 因果干预 (do-calculus)
  // =========================================================================

  /** do-calculus 因果干预 — 固定某节点值，计算下游影响 */
  doIntervention(
    nodeId: string,
    interventionValue: number
  ): InterventionResult {
    const spanId = `cg_intervention_${Date.now()}`;
    this.observability.startSpan(spanId, 'causal_intervention');

    try {
      if (!this.graph.hasNode(nodeId)) {
        return {
          interventionNodeId: nodeId,
          interventionValue,
          effects: [],
          identifiability: {
            passed: false,
            method: 'back_door',
            confounders: [],
            warning: `节点 ${nodeId} 不存在`,
          },
        };
      }

      // Step 1: 可识别性检验（back-door criterion）
      const identifiability = this.checkIdentifiability(nodeId);

      // Step 2: 计算干预效果 — 切断入边，保留出边
      const effects: InterventionResult['effects'] = [];
      const visited = new Set<string>();
      const queue: Array<{ id: string; propagatedValue: number }> = [
        { id: nodeId, propagatedValue: interventionValue },
      ];

      while (queue.length > 0) {
        const { id, propagatedValue } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        const node = this.nodeMap.get(id);
        if (!node) continue;

        if (id !== nodeId) {
          effects.push({
            nodeId: id,
            originalProbability: node.priorProbability,
            interventionProbability: Math.max(0, Math.min(1, propagatedValue)),
            delta: Math.max(0, Math.min(1, propagatedValue)) - node.priorProbability,
          });
        }

        // 沿出边传播
        const outEdges = this.graph.outEdges(id);
        for (const edgeKey of outEdges) {
          const target = this.graph.target(edgeKey);
          const edgeData = this.edgeDataMap.get(edgeKey);
          if (!edgeData || visited.has(target)) continue;

          // 传播值 = 当前值 × 边权重
          queue.push({
            id: target,
            propagatedValue: propagatedValue * edgeData.weight,
          });
        }
      }

      return {
        interventionNodeId: nodeId,
        interventionValue,
        effects,
        identifiability,
      };
    } finally {
      this.observability.endSpan(spanId);
    }
  }

  /** Back-door criterion 可识别性检验 */
  private checkIdentifiability(nodeId: string): InterventionResult['identifiability'] {
    // 找到所有可能的混淆变量（同时影响干预节点和其后代的节点）
    const confounders: string[] = [];
    const parents = this.graph.inNeighbors(nodeId);
    const children = this.graph.outNeighbors(nodeId);

    for (const parent of parents) {
      // 检查 parent 是否也有路径到 children（不经过 nodeId）
      for (const child of children) {
        if (this.hasPathExcluding(parent, child, nodeId)) {
          const parentNode = this.nodeMap.get(parent);
          confounders.push(parentNode?.label ?? parent);
        }
      }
    }

    // 检查是否有未观测的混淆变量
    const unobservedConfounders = confounders.filter((c) => {
      const node = Array.from(this.nodeMap.values()).find((n) => n.label === c);
      return node && node.sensorTags.length === 0; // 无传感器 = 不可观测
    });

    return {
      passed: unobservedConfounders.length === 0,
      method: 'back_door',
      confounders,
      warning: unobservedConfounders.length > 0
        ? `存在 ${unobservedConfounders.length} 个未观测混淆变量: ${unobservedConfounders.join(', ')}，干预效果可能有偏`
        : undefined,
    };
  }

  /** 检查是否存在从 source 到 target 的路径（排除 excludeNode） */
  private hasPathExcluding(source: string, target: string, excludeNode: string): boolean {
    const visited = new Set<string>([excludeNode]);
    const queue = [source];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const neighbor of this.graph.outNeighbors(current)) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return false;
  }

  // =========================================================================
  // 5-Why 动态扩展
  // =========================================================================

  /** Grok 5-Why 扩展 — 膨胀控制 */
  async expandWithFiveWhy(
    startNodeId: string,
    askWhyFn: (question: string) => Promise<{ answer: string; confidence: number } | null>,
    maxDepth: number = this.config.maxWhyDepth
  ): Promise<{ newNodes: CausalNode[]; newEdges: CausalEdge[]; rejected: string[] }> {
    const rejected: string[] = [];

    // 膨胀控制检查
    if (this.graph.order >= this.config.maxNodes) {
      rejected.push(`节点数已达上限 ${this.config.maxNodes}`);
      return { newNodes: [], newEdges: [], rejected };
    }

    if (!this.config.enableGrokCompletion) {
      rejected.push('Grok 补全已禁用');
      return { newNodes: [], newEdges: [], rejected };
    }

    const startNode = this.nodeMap.get(startNodeId);
    if (!startNode) {
      rejected.push(`起始节点 ${startNodeId} 不存在`);
      return { newNodes: [], newEdges: [], rejected };
    }

    const newNodes: CausalNode[] = [];
    const newEdges: CausalEdge[] = [];
    let currentNodeId = startNodeId;
    const maxNewPerExpand = 5; // 单次最多新增 5 个节点

    for (let depth = 0; depth < maxDepth && newNodes.length < maxNewPerExpand; depth++) {
      // 膨胀控制
      if (this.graph.order + newNodes.length >= this.config.maxNodes) {
        rejected.push(`膨胀控制：节点数将超过 ${this.config.maxNodes}`);
        break;
      }

      const currentNode = this.nodeMap.get(currentNodeId) ?? newNodes.find((n) => n.id === currentNodeId);
      if (!currentNode) break;

      const question = `为什么会发生"${currentNode.label}"？请给出一个更深层的原因。`;

      try {
        const response = await askWhyFn(question);
        if (!response || response.confidence < 0.3) {
          rejected.push(`第 ${depth + 1} 层回答置信度过低 (${response?.confidence ?? 0})`);
          break;
        }

        // 检查是否与现有节点重复
        const duplicate = this.findSimilarNode(response.answer);
        if (duplicate) {
          // 不创建新节点，但增强已有边
          const existingEdgeKey = this.findEdge(duplicate.id, currentNodeId);
          if (existingEdgeKey) {
            const edgeData = this.edgeDataMap.get(existingEdgeKey);
            if (edgeData) {
              edgeData.evidenceCount++;
              edgeData.weight = Math.min(1, edgeData.weight + 0.02);
            }
          }
          currentNodeId = duplicate.id;
          continue;
        }

        // 创建新节点
        const newNodeId = `auto_${startNode.domain}_${Date.now()}_${depth}`;
        const newNode: CausalNode = {
          id: newNodeId,
          label: response.answer,
          type: depth >= maxDepth - 1 ? 'root_cause' : 'mechanism',
          domain: startNode.domain,
          priorProbability: response.confidence * 0.5,
          equationIds: [],
          sensorTags: [],
          metadata: { source: 'grok_5why', depth, parentId: currentNodeId },
        };

        // 创建新边
        const newEdge: CausalEdge = {
          source: newNodeId,
          target: currentNodeId,
          weight: response.confidence * 0.7,
          mechanism: `5-Why 第 ${depth + 1} 层: ${response.answer} → ${currentNode.label}`,
          evidenceCount: 1,
          lastUpdatedAt: new Date(),
          source_type: 'grok_discovered',
        };

        this.addNode(newNode);
        this.addEdge(newEdge);
        newNodes.push(newNode);
        newEdges.push(newEdge);

        // 注册到 VectorStore
        this.vectorStore.upsert(newNodeId, this.nodeToVector(newNode), {
          type: 'causal_node',
          label: newNode.label,
          domain: newNode.domain,
          nodeType: newNode.type,
        });

        currentNodeId = newNodeId;
      } catch (err) {
        rejected.push(`第 ${depth + 1} 层 Grok 调用失败: ${String(err)}`);
        break;
      }
    }

    logger.info({
      startNode: startNodeId,
      newNodes: newNodes.length,
      newEdges: newEdges.length,
      rejected: rejected.length,
    }, '[CausalGraph] 5-Why 扩展完成');

    return { newNodes, newEdges, rejected };
  }

  // =========================================================================
  // 边权衰减与剪枝
  // =========================================================================

  /** 每日边权衰减 — 5%/天，最低 30% */
  applyEdgeDecay(): { decayedCount: number; dormantCount: number } {
    let decayedCount = 0;
    let dormantCount = 0;
    const now = Date.now();

    for (const [edgeKey, edgeData] of this.edgeDataMap) {
      // 种子数据不衰减
      if (edgeData.source_type === 'seed') continue;

      const daysSinceUpdate = (now - edgeData.lastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 1) continue;

      const decayFactor = Math.pow(1 - this.config.edgeDecayRatePerDay, daysSinceUpdate);
      const newWeight = edgeData.weight * decayFactor;

      if (newWeight < this.config.minEdgeWeight) {
        // 标记为休眠
        dormantCount++;
        edgeData.weight = this.config.minEdgeWeight;
      } else {
        edgeData.weight = newWeight;
        decayedCount++;
      }
    }

    logger.info({ decayedCount, dormantCount }, '[CausalGraph] 边权衰减完成');
    return { decayedCount, dormantCount };
  }

  /** 剪枝休眠节点 — 超过指定天数未引用的节点 */
  pruneDormantNodes(maxAgeDays: number = 90): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [id, node] of this.nodeMap) {
      // 种子节点不剪枝
      if (!node.metadata?.source || node.metadata.source === 'seed') continue;

      const lastRef = (node.metadata.lastReferencedAt as number) ?? 0;
      if (lastRef < cutoff && this.graph.degree(id) === 0) {
        this.graph.dropNode(id);
        this.nodeMap.delete(id);
        this.vectorStore.delete(id);
        pruned++;
      }
    }

    logger.info({ pruned, maxAgeDays }, '[CausalGraph] 休眠节点剪枝完成');
    return pruned;
  }

  // =========================================================================
  // 知识反馈更新
  // =========================================================================

  /** 从知识结晶更新边权重 — 最小样本保护 */
  updateEdgeWeight(
    sourceId: string,
    targetId: string,
    reward: number,
    sessionId: string,
    minSamples: number = 3
  ): boolean {
    const edgeKey = this.findEdge(sourceId, targetId);
    if (!edgeKey) return false;

    const edgeData = this.edgeDataMap.get(edgeKey);
    if (!edgeData) return false;

    // 最小样本保护
    if (edgeData.evidenceCount < minSamples) {
      edgeData.evidenceCount++;
      logger.debug({
        edge: `${sourceId}→${targetId}`,
        count: edgeData.evidenceCount,
        minSamples,
      }, '[CausalGraph] 样本数不足，仅增加计数');
      return false;
    }

    // 记录修订日志
    const previousWeight = edgeData.weight;
    const learningRate = 0.1;
    const newWeight = Math.max(
      this.config.minEdgeWeight,
      Math.min(1, edgeData.weight + learningRate * reward)
    );

    this.revisionLog.push({
      id: `rev_${Date.now()}`,
      component: 'causal_edge',
      entityId: edgeKey,
      previousValue: { weight: previousWeight },
      newValue: { weight: newWeight },
      feedbackEventType: reward > 0 ? 'hypothesis_confirmed' : 'hypothesis_rejected',
      sessionId,
      timestamp: new Date(),
      rolledBack: false,
    });

    edgeData.weight = newWeight;
    edgeData.evidenceCount++;
    edgeData.lastUpdatedAt = new Date();

    logger.info({
      edge: `${sourceId}→${targetId}`,
      previousWeight: previousWeight.toFixed(3),
      newWeight: newWeight.toFixed(3),
      reward,
    }, '[CausalGraph] 边权重更新');

    return true;
  }

  /** 回滚最近的修订 */
  rollbackLastRevision(): RevisionLogEntry | null {
    const lastEntry = this.revisionLog.filter((e) => !e.rolledBack).pop();
    if (!lastEntry) return null;

    const edgeData = this.edgeDataMap.get(lastEntry.entityId);
    if (edgeData) {
      edgeData.weight = (lastEntry.previousValue as { weight: number }).weight;
    }

    lastEntry.rolledBack = true;
    return lastEntry;
  }

  // =========================================================================
  // 统计与查询
  // =========================================================================

  /** 获取图统计信息 */
  getStats(): {
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    nodesByDomain: Record<string, number>;
    avgEdgeWeight: number;
    sourceDistribution: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const nodesByDomain: Record<string, number> = {};
    for (const node of this.nodeMap.values()) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
      nodesByDomain[node.domain] = (nodesByDomain[node.domain] ?? 0) + 1;
    }

    let totalWeight = 0;
    const sourceDistribution: Record<string, number> = {};
    for (const edge of this.edgeDataMap.values()) {
      totalWeight += edge.weight;
      sourceDistribution[edge.source_type] = (sourceDistribution[edge.source_type] ?? 0) + 1;
    }

    return {
      totalNodes: this.graph.order,
      totalEdges: this.graph.size,
      nodesByType,
      nodesByDomain,
      avgEdgeWeight: this.edgeDataMap.size > 0 ? totalWeight / this.edgeDataMap.size : 0,
      sourceDistribution,
    };
  }

  /** 获取所有节点 */
  getNodes(): CausalNode[] {
    return Array.from(this.nodeMap.values());
  }

  /** 获取所有边 */
  getEdges(): CausalEdge[] {
    return Array.from(this.edgeDataMap.values());
  }

  /** 获取修订日志 */
  getRevisionLog(): RevisionLogEntry[] {
    return [...this.revisionLog];
  }

  /** 获取特定域的节点 */
  getNodesByDomain(domain: AnomalyDomain): CausalNode[] {
    return Array.from(this.nodeMap.values()).filter((n) => n.domain === domain);
  }

  /** 获取边权重（通过 edgeKey “source→target” 或通过 source+target 节点 ID） */
  getEdgeWeight(edgeIdOrSource: string, targetId?: string): number | undefined {
    let edgeKey: string;
    if (targetId !== undefined) {
      edgeKey = `${edgeIdOrSource}→${targetId}`;
    } else {
      edgeKey = edgeIdOrSource;
    }
    const edgeData = this.edgeDataMap.get(edgeKey);
    return edgeData?.weight;
  }

  /** 公共方法：添加因果边（用于 KnowledgeFeedbackLoop 反馈新发现的因果关系） */
  addEdgePublic(
    sourceId: string,
    targetId: string,
    data: { weight: number; mechanism: string; source_type: CausalEdge['source_type'] },
  ): void {
    this.addEdge({
      source: sourceId,
      target: targetId,
      weight: data.weight,
      mechanism: data.mechanism,
      evidenceCount: 1,
      lastUpdatedAt: new Date(),
      source_type: data.source_type,
    });
  }

  /** 公共方法：删除因果边（用于回滚） */
  removeEdge(edgeIdOrSource: string, targetId?: string): boolean {
    let edgeKey: string;
    let source: string;
    let target: string;
    if (targetId !== undefined) {
      edgeKey = `${edgeIdOrSource}→${targetId}`;
      source = edgeIdOrSource;
      target = targetId;
    } else {
      edgeKey = edgeIdOrSource;
      const parts = edgeKey.split('→');
      source = parts[0];
      target = parts[1];
    }
    if (!this.edgeDataMap.has(edgeKey)) return false;
    this.edgeDataMap.delete(edgeKey);
    try {
      if (this.graph.hasEdge(source, target)) {
        this.graph.dropEdge(source, target);
      }
    } catch {
      // 忽略图库删除失败
    }
    return true;
  }

  /** 公共方法：直接设置边权重（用于 KnowledgeFeedbackLoop 的精确更新） */
  setEdgeWeight(edgeIdOrSource: string, weightOrTarget: number | string, weight?: number): boolean {
    let edgeKey: string;
    let newWeight: number;
    if (typeof weightOrTarget === 'string' && weight !== undefined) {
      edgeKey = `${edgeIdOrSource}→${weightOrTarget}`;
      newWeight = weight;
    } else if (typeof weightOrTarget === 'number') {
      edgeKey = edgeIdOrSource;
      newWeight = weightOrTarget;
    } else {
      return false;
    }
    const edgeData = this.edgeDataMap.get(edgeKey);
    if (!edgeData) return false;
    edgeData.weight = Math.max(0.01, Math.min(1, newWeight));
    edgeData.lastUpdatedAt = new Date();
    return true;
  }

  // =========================================================================
  // 内部辅助方法
  // =========================================================================

  private addNode(node: CausalNode): void {
    if (this.graph.hasNode(node.id)) return;
    this.graph.addNode(node.id);
    this.nodeMap.set(node.id, node);
  }

  private addEdge(edge: CausalEdge): void {
    const edgeKey = `${edge.source}→${edge.target}`;
    if (this.graph.hasEdge(edge.source, edge.target)) return;
    try {
      this.graph.addEdge(edge.source, edge.target);
      this.edgeDataMap.set(edgeKey, edge);
    } catch {
      logger.warn({ source: edge.source, target: edge.target }, '[CausalGraph] 添加边失败');
    }
  }

  private findEdge(sourceId: string, targetId: string): string | null {
    const key = `${sourceId}→${targetId}`;
    return this.edgeDataMap.has(key) ? key : null;
  }

  /** 查找语义相似的已有节点 */
  private findSimilarNode(label: string): CausalNode | null {
    const lowerLabel = label.toLowerCase();
    for (const node of this.nodeMap.values()) {
      // 简单的字符串相似度检查
      const lowerNodeLabel = node.label.toLowerCase();
      if (lowerNodeLabel === lowerLabel) return node;
      if (lowerNodeLabel.includes(lowerLabel) || lowerLabel.includes(lowerNodeLabel)) {
        return node;
      }
    }
    return null;
  }

  /** 节点转向量 — 用于 VectorStore 语义检索 */
  private nodeToVector(node: CausalNode): number[] {
    // 64 维特征向量（与 PhysicsVerifier 的 textToVector 保持一致）
    const vocabulary = [
      '轴承', '齿轮', '电机', '疲劳', '液压', '钢丝绳', '泵', '绝缘',
      '振动', '温度', '压力', '流量', '电流', '应力', '转速', '磨损',
      '裂纹', '泄漏', '过热', '老化', '腐蚀', '气蚀', '断裂', '变形',
      '噪声', '冲击', '频谱', 'FFT', 'RMS', '峰值', '波形', '趋势',
      '外圈', '内圈', '滚动体', '保持架', '齿面', '啮合', '点蚀', '剥落',
      '定子', '转子', '绕组', '铁芯', '油膜', '密封', '阀门', '缸体',
      '吊臂', '桁架', '焊缝', '螺栓', '基础', '轨道', '车轮', '减速器',
      '联轴器', '制动器', '卷筒', '滑轮', '吊钩', '抓斗', '门座', '臂架',
    ];

    const vector = new Array(vocabulary.length).fill(0);
    const text = `${node.label} ${node.domain} ${node.sensorTags.join(' ')}`.toLowerCase();

    for (let i = 0; i < vocabulary.length; i++) {
      if (text.includes(vocabulary[i].toLowerCase())) {
        vector[i] = 1;
      }
    }

    return vector;
  }
}
