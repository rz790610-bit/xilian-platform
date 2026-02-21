/**
 * ============================================================================
 * Phase 2 — PhysicsVerifier 物理验证器
 * ============================================================================
 *
 * 核心职责：验证每个诊断假设的物理可行性
 *
 * 三源映射（假设 → 物理参数）：
 *   1. 规则映射（30%）：基于港口机械领域知识的确定性规则表
 *   2. Embedding 映射（40%）：VectorStore 语义检索历史映射
 *   3. Grok 映射（30%）：LLM 结构化参数提取（CostGate 控制）
 *
 * 物理验证流程：
 *   映射置信度过滤 → 参数边界检查 → 方程残差代理 → Monte-Carlo 不确定性
 *
 * 设计原则：
 *   - 依赖注入（WorldModel、VectorStore、GrokService 均从构造函数传入）
 *   - 并发控制（AbortController + maxConcurrency）
 *   - 分级降级（skippedReason 标记）
 *   - 方程残差代理（解析式，无需 NN 训练数据，<50ms）
 */

import { createModuleLogger } from '../../../../core/logger';
import type { WorldModel, StateVector } from '../../../cognition/worldmodel/world-model';
import type { VectorStore } from '../vector-store/vector-store';
import type { Observability } from '../observability/observability';
import type {
  PhysicsVerifierConfig,
  PhysicsVerificationResult,
  PhysicsEquation,
  AnomalyDomain,
  SkippedReason,
  ConcurrencyConfig,
} from '../reasoning.types';

const logger = createModuleLogger('physics-verifier');

// ============================================================================
// 内部类型
// ============================================================================

/** 假设输入（与 ReasoningProcessor 的 Hypothesis 兼容） */
export interface Hypothesis {
  id: string;
  description: string;
  confidence: number;
  domain?: AnomalyDomain;
  metadata?: Record<string, unknown>;
}

/** 三源映射中间结果 */
interface MappingResult {
  params: Record<string, number>;
  source: {
    rule: { confidence: number; matched: boolean; equations: string[] };
    embedding: { confidence: number; similarity: number; matched: boolean };
    grok?: { confidence: number; explanation: string; matched: boolean };
  };
  aggregatedConfidence: number;
}

// ============================================================================
// 港口机械物理方程库
// ============================================================================

/**
 * 内建物理方程库 — 港口机械领域
 *
 * 每个方程包含：
 *   - 解析式残差计算函数（输入参数 → 残差值，0 = 完美满足）
 *   - 参数边界定义
 *   - 守恒约束描述
 */
const BUILTIN_EQUATIONS: PhysicsEquation[] = [
  {
    id: 'eq_bearing_vibration',
    name: '轴承振动-缺陷频率关系',
    anomalyDomain: 'bearing_fault',
    description: '轴承缺陷频率 BPFO = (n/2)×(1 - d/D×cosα)×RPM/60，振动幅值与缺陷深度成正比',
    inputVariables: ['vibrationRms', 'rpm', 'bearingDiameter', 'rollerDiameter', 'contactAngle', 'rollerCount'],
    conservationConstraint: '振动能量不超过输入机械能',
    parameterBounds: {
      vibrationRms: { min: 0, max: 50, unit: 'mm/s' },
      rpm: { min: 0, max: 3000, unit: 'RPM' },
      bearingDiameter: { min: 10, max: 2000, unit: 'mm' },
      rollerDiameter: { min: 2, max: 200, unit: 'mm' },
      contactAngle: { min: 0, max: 45, unit: '°' },
      rollerCount: { min: 4, max: 60, unit: '个' },
    },
    computeResidual: (inputs) => {
      const { vibrationRms = 0, rpm = 0, bearingDiameter = 100, rollerDiameter = 15, contactAngle = 15, rollerCount = 12 } = inputs;
      // BPFO 理论频率
      const cosAlpha = Math.cos((contactAngle * Math.PI) / 180);
      const bpfo = (rollerCount / 2) * (1 - (rollerDiameter / bearingDiameter) * cosAlpha) * (rpm / 60);
      // 振动幅值与缺陷频率的经验关系：v_rms ∝ sqrt(bpfo × defectDepth)
      // 残差 = |实际振动 - 理论振动| / 理论振动（归一化）
      const theoreticalVib = bpfo > 0 ? Math.sqrt(bpfo * 0.1) : 0;
      if (theoreticalVib === 0) return vibrationRms > 0 ? 1 : 0;
      return Math.abs(vibrationRms - theoreticalVib) / Math.max(theoreticalVib, vibrationRms);
    },
  },
  {
    id: 'eq_gear_mesh_frequency',
    name: '齿轮啮合频率关系',
    anomalyDomain: 'gear_damage',
    description: '齿轮啮合频率 GMF = 齿数 × 转速/60，齿面磨损导致边带调制',
    inputVariables: ['vibrationAmplitude', 'rpm', 'toothCount', 'modulusGear'],
    conservationConstraint: '啮合力不超过齿面接触强度',
    parameterBounds: {
      vibrationAmplitude: { min: 0, max: 100, unit: 'mm/s' },
      rpm: { min: 0, max: 1500, unit: 'RPM' },
      toothCount: { min: 10, max: 200, unit: '个' },
      modulusGear: { min: 1, max: 30, unit: 'mm' },
    },
    computeResidual: (inputs) => {
      const { vibrationAmplitude = 0, rpm = 0, toothCount = 40, modulusGear = 5 } = inputs;
      // GMF = toothCount × rpm / 60
      const gmf = toothCount * rpm / 60;
      // 齿面接触应力 σ_H ∝ F / (b × m)，F ∝ 振动幅值
      // 残差：振动幅值超过齿面强度允许范围的程度
      const maxAllowedVib = gmf > 0 ? Math.sqrt(gmf) * modulusGear * 0.3 : 50;
      if (maxAllowedVib === 0) return vibrationAmplitude > 0 ? 1 : 0;
      return Math.max(0, (vibrationAmplitude - maxAllowedVib) / maxAllowedVib);
    },
  },
  {
    id: 'eq_motor_thermal',
    name: '电机热平衡方程',
    anomalyDomain: 'motor_degradation',
    description: 'dT/dt = (I²R - h×A×ΔT) / (m×c)，绝缘老化加速温升',
    inputVariables: ['current', 'resistance', 'ambientTemp', 'motorTemp', 'coolingCoeff'],
    conservationConstraint: '能量守恒：电热功率 = 散热功率 + 蓄热功率',
    parameterBounds: {
      current: { min: 0, max: 500, unit: 'A' },
      resistance: { min: 0.001, max: 10, unit: 'Ω' },
      ambientTemp: { min: -20, max: 50, unit: '°C' },
      motorTemp: { min: -20, max: 200, unit: '°C' },
      coolingCoeff: { min: 1, max: 100, unit: 'W/(m²·K)' },
    },
    computeResidual: (inputs) => {
      const { current = 0, resistance = 0.1, ambientTemp = 25, motorTemp = 60, coolingCoeff = 20 } = inputs;
      // 热平衡：I²R = h × A × (T_motor - T_ambient)，A ≈ 0.5 m²
      const heatGenerated = current * current * resistance;
      const heatDissipated = coolingCoeff * 0.5 * (motorTemp - ambientTemp);
      // 稳态残差（归一化）
      const maxHeat = Math.max(heatGenerated, heatDissipated, 1);
      return Math.abs(heatGenerated - heatDissipated) / maxHeat;
    },
  },
  {
    id: 'eq_structural_fatigue',
    name: 'S-N 曲线疲劳寿命',
    anomalyDomain: 'structural_fatigue',
    description: 'N = C / (Δσ)^m，Miner 线性累积损伤 D = Σ(n_i/N_i)',
    inputVariables: ['stressAmplitude', 'cycleCount', 'materialConstantC', 'materialExponentM'],
    conservationConstraint: '累积损伤 D ≤ 1.0',
    parameterBounds: {
      stressAmplitude: { min: 0, max: 500, unit: 'MPa' },
      cycleCount: { min: 0, max: 1e10, unit: '次' },
      materialConstantC: { min: 1e8, max: 1e15, unit: '' },
      materialExponentM: { min: 2, max: 10, unit: '' },
    },
    computeResidual: (inputs) => {
      const { stressAmplitude = 100, cycleCount = 1e6, materialConstantC = 1e12, materialExponentM = 3 } = inputs;
      // S-N: N_allowed = C / (Δσ)^m
      if (stressAmplitude <= 0) return 0;
      const nAllowed = materialConstantC / Math.pow(stressAmplitude, materialExponentM);
      // 累积损伤 D = n / N
      const damage = cycleCount / nAllowed;
      // 残差：D > 1 表示已超过寿命
      return Math.max(0, damage - 1);
    },
  },
  {
    id: 'eq_hydraulic_pressure',
    name: '液压系统压力-流量关系',
    anomalyDomain: 'hydraulic_leak',
    description: 'Q = C_d × A × √(2ΔP/ρ)，泄漏导致压力下降',
    inputVariables: ['pressure', 'flowRate', 'orificeArea', 'fluidDensity'],
    conservationConstraint: '质量守恒：入口流量 = 出口流量 + 泄漏流量',
    parameterBounds: {
      pressure: { min: 0, max: 350, unit: 'bar' },
      flowRate: { min: 0, max: 500, unit: 'L/min' },
      orificeArea: { min: 0, max: 0.01, unit: 'm²' },
      fluidDensity: { min: 800, max: 1000, unit: 'kg/m³' },
    },
    computeResidual: (inputs) => {
      const { pressure = 200, flowRate = 100, orificeArea = 0.001, fluidDensity = 870 } = inputs;
      // Q_theoretical = Cd × A × √(2ΔP/ρ)，Cd ≈ 0.61
      const pressurePa = pressure * 1e5;
      const qTheoretical = 0.61 * orificeArea * Math.sqrt(2 * pressurePa / fluidDensity) * 60000; // L/min
      if (qTheoretical === 0) return flowRate > 0 ? 1 : 0;
      return Math.abs(flowRate - qTheoretical) / Math.max(qTheoretical, flowRate);
    },
  },
  {
    id: 'eq_wire_rope_tension',
    name: '钢丝绳张力-载荷关系',
    anomalyDomain: 'wire_rope_break',
    description: 'σ = F/A，安全系数 K = σ_break / σ_working ≥ 5',
    inputVariables: ['load', 'ropeArea', 'breakingStrength', 'safetyFactor'],
    conservationConstraint: '力平衡：张力 = 载荷 + 自重',
    parameterBounds: {
      load: { min: 0, max: 1000, unit: 'kN' },
      ropeArea: { min: 10, max: 5000, unit: 'mm²' },
      breakingStrength: { min: 500, max: 2500, unit: 'MPa' },
      safetyFactor: { min: 1, max: 20, unit: '' },
    },
    computeResidual: (inputs) => {
      const { load = 100, ropeArea = 500, breakingStrength = 1770, safetyFactor = 5 } = inputs;
      // 工作应力 σ = F / A (kN → N, mm² → m²)
      const workingStress = (load * 1000) / (ropeArea * 1e-6) / 1e6; // MPa
      // 允许应力 = 破断强度 / 安全系数
      const allowedStress = breakingStrength / safetyFactor;
      // 残差：超过允许应力的程度
      return Math.max(0, (workingStress - allowedStress) / allowedStress);
    },
  },
  {
    id: 'eq_pump_cavitation',
    name: '泵气蚀 NPSH 关系',
    anomalyDomain: 'pump_cavitation',
    description: 'NPSHa = P_s/(ρg) + v²/(2g) - P_v/(ρg)，NPSHa > NPSHr 防止气蚀',
    inputVariables: ['suctionPressure', 'velocity', 'vaporPressure', 'fluidDensity'],
    conservationConstraint: 'NPSHa ≥ NPSHr + 安全裕度',
    parameterBounds: {
      suctionPressure: { min: 0, max: 50, unit: 'bar' },
      velocity: { min: 0, max: 20, unit: 'm/s' },
      vaporPressure: { min: 0, max: 5, unit: 'bar' },
      fluidDensity: { min: 800, max: 1100, unit: 'kg/m³' },
    },
    computeResidual: (inputs) => {
      const { suctionPressure = 3, velocity = 5, vaporPressure = 0.1, fluidDensity = 1000 } = inputs;
      const g = 9.81;
      // NPSHa = Ps/(ρg) + v²/(2g) - Pv/(ρg)
      const npsha = (suctionPressure * 1e5) / (fluidDensity * g) + (velocity * velocity) / (2 * g) - (vaporPressure * 1e5) / (fluidDensity * g);
      // NPSHr 典型值 3~5m
      const npshr = 4;
      // 残差：NPSHa < NPSHr 时为正值
      return Math.max(0, (npshr - npsha) / npshr);
    },
  },
  {
    id: 'eq_insulation_arrhenius',
    name: '绝缘老化 Arrhenius 模型',
    anomalyDomain: 'insulation_aging',
    description: 'L = L0 × exp(-Ea/(k×T))，温度每升高 10°C 寿命减半',
    inputVariables: ['temperature', 'ratedLife', 'activationEnergy', 'ratedTemp'],
    conservationConstraint: '热力学第二定律：老化不可逆',
    parameterBounds: {
      temperature: { min: 20, max: 250, unit: '°C' },
      ratedLife: { min: 1000, max: 200000, unit: 'h' },
      activationEnergy: { min: 0.5, max: 2.0, unit: 'eV' },
      ratedTemp: { min: 100, max: 200, unit: '°C' },
    },
    computeResidual: (inputs) => {
      const { temperature = 120, ratedLife = 20000, activationEnergy = 1.0, ratedTemp = 130 } = inputs;
      const k = 8.617e-5; // 玻尔兹曼常数 eV/K
      const tKelvin = temperature + 273.15;
      const tRatedKelvin = ratedTemp + 273.15;
      // Arrhenius: L = L0 × exp(Ea/k × (1/T - 1/T0))
      const lifeRatio = Math.exp((activationEnergy / k) * (1 / tKelvin - 1 / tRatedKelvin));
      const actualLife = ratedLife * lifeRatio;
      // 残差：实际寿命低于额定寿命的 10% 时视为不可行
      return actualLife < ratedLife * 0.1 ? (ratedLife * 0.1 - actualLife) / (ratedLife * 0.1) : 0;
    },
  },
];

// ============================================================================
// 规则映射表 — 假设描述关键词 → 物理参数
// ============================================================================

interface RuleMappingEntry {
  /** 匹配关键词（任一命中即匹配） */
  keywords: string[];
  /** 关联的异常域 */
  domain: AnomalyDomain;
  /** 关联的方程 ID 列表 */
  equationIds: string[];
  /** 默认物理参数（从假设描述中无法提取时使用） */
  defaultParams: Record<string, number>;
  /** 参数提取正则（从假设描述中提取数值） */
  extractors: Array<{
    param: string;
    regex: RegExp;
    transform?: (match: string) => number;
  }>;
}

const RULE_MAPPING_TABLE: RuleMappingEntry[] = [
  {
    keywords: ['轴承', '外圈', '内圈', '滚动体', 'bearing', 'BPFO', 'BPFI'],
    domain: 'bearing_fault',
    equationIds: ['eq_bearing_vibration'],
    defaultParams: { vibrationRms: 3.5, rpm: 750, bearingDiameter: 120, rollerDiameter: 18, contactAngle: 15, rollerCount: 14 },
    extractors: [
      { param: 'vibrationRms', regex: /振动[值幅]?\s*[:：]?\s*([\d.]+)\s*(?:mm\/s)?/i },
      { param: 'rpm', regex: /转速\s*[:：]?\s*([\d.]+)\s*(?:RPM|rpm)?/i },
    ],
  },
  {
    keywords: ['齿轮', '齿面', '啮合', '点蚀', 'gear', 'mesh'],
    domain: 'gear_damage',
    equationIds: ['eq_gear_mesh_frequency'],
    defaultParams: { vibrationAmplitude: 5.0, rpm: 500, toothCount: 42, modulusGear: 6 },
    extractors: [
      { param: 'vibrationAmplitude', regex: /振动[值幅]?\s*[:：]?\s*([\d.]+)/i },
      { param: 'rpm', regex: /转速\s*[:：]?\s*([\d.]+)/i },
    ],
  },
  {
    keywords: ['电机', '绝缘', '温升', '电流', 'motor', 'insulation', '过热'],
    domain: 'motor_degradation',
    equationIds: ['eq_motor_thermal', 'eq_insulation_arrhenius'],
    defaultParams: { current: 85, resistance: 0.15, ambientTemp: 30, motorTemp: 75, coolingCoeff: 25 },
    extractors: [
      { param: 'current', regex: /电流\s*[:：]?\s*([\d.]+)\s*(?:A)?/i },
      { param: 'motorTemp', regex: /温度\s*[:：]?\s*([\d.]+)\s*(?:°C|℃)?/i },
    ],
  },
  {
    keywords: ['疲劳', '裂纹', '应力', '结构', 'fatigue', 'crack', 'stress'],
    domain: 'structural_fatigue',
    equationIds: ['eq_structural_fatigue'],
    defaultParams: { stressAmplitude: 120, cycleCount: 5e6, materialConstantC: 1e12, materialExponentM: 3 },
    extractors: [
      { param: 'stressAmplitude', regex: /应力[幅值]?\s*[:：]?\s*([\d.]+)\s*(?:MPa)?/i },
    ],
  },
  {
    keywords: ['液压', '泄漏', '油压', 'hydraulic', 'leak', '压力下降'],
    domain: 'hydraulic_leak',
    equationIds: ['eq_hydraulic_pressure'],
    defaultParams: { pressure: 200, flowRate: 100, orificeArea: 0.001, fluidDensity: 870 },
    extractors: [
      { param: 'pressure', regex: /压力\s*[:：]?\s*([\d.]+)\s*(?:bar|MPa)?/i },
      { param: 'flowRate', regex: /流量\s*[:：]?\s*([\d.]+)\s*(?:L\/min)?/i },
    ],
  },
  {
    keywords: ['钢丝绳', '断丝', '断股', 'wire rope', '张力'],
    domain: 'wire_rope_break',
    equationIds: ['eq_wire_rope_tension'],
    defaultParams: { load: 150, ropeArea: 800, breakingStrength: 1770, safetyFactor: 5 },
    extractors: [
      { param: 'load', regex: /[载荷负荷]\s*[:：]?\s*([\d.]+)\s*(?:kN|t)?/i },
    ],
  },
  {
    keywords: ['气蚀', '泵', '空化', 'cavitation', 'NPSH'],
    domain: 'pump_cavitation',
    equationIds: ['eq_pump_cavitation'],
    defaultParams: { suctionPressure: 2.5, velocity: 6, vaporPressure: 0.1, fluidDensity: 1000 },
    extractors: [
      { param: 'suctionPressure', regex: /[吸入进口]压力?\s*[:：]?\s*([\d.]+)\s*(?:bar)?/i },
    ],
  },
  {
    keywords: ['绝缘', '老化', '介电', 'insulation', 'aging', '击穿'],
    domain: 'insulation_aging',
    equationIds: ['eq_insulation_arrhenius'],
    defaultParams: { temperature: 120, ratedLife: 20000, activationEnergy: 1.0, ratedTemp: 130 },
    extractors: [
      { param: 'temperature', regex: /温度\s*[:：]?\s*([\d.]+)\s*(?:°C|℃)?/i },
    ],
  },
];

// ============================================================================
// PhysicsVerifier
// ============================================================================

const DEFAULT_CONFIG: PhysicsVerifierConfig = {
  mappingConfidenceThreshold: 0.4,
  sourceWeights: { rule: 0.30, embedding: 0.40, grok: 0.30 },
  residualThreshold: 0.5,
  monteCarloSamples: 5,
  concurrency: { maxConcurrency: 8, taskTimeoutMs: 3000, globalTimeoutMs: 5000 },
  enableGrokMapping: true,
};

export class PhysicsVerifier {
  private readonly config: PhysicsVerifierConfig;
  private readonly equations: Map<string, PhysicsEquation>;

  constructor(
    private readonly worldModel: WorldModel,
    private readonly vectorStore: VectorStore,
    private readonly observability: Observability,
    private readonly grokService?: { generateStructuredParams?: (desc: string) => Promise<Record<string, number> | null> },
    config?: Partial<PhysicsVerifierConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.equations = new Map(BUILTIN_EQUATIONS.map((eq) => [eq.id, eq]));
    logger.info({
      equationCount: this.equations.size,
      threshold: this.config.mappingConfidenceThreshold,
    }, '[PhysicsVerifier] 初始化完成');
  }

  // =========================================================================
  // 公共 API
  // =========================================================================

  /** 验证单个假设的物理可行性 */
  async verify(hypothesis: Hypothesis, currentState: StateVector): Promise<PhysicsVerificationResult> {
    const spanId = `pv_${hypothesis.id}_${Date.now()}`;
    this.observability.startSpan(spanId, 'physics_verification');

    try {
      // Step 1: 三源映射
      const mapping = await this.mapHypothesisToParams(hypothesis);

      // Step 2: 映射置信度过滤
      if (mapping.aggregatedConfidence < this.config.mappingConfidenceThreshold) {
        logger.debug({
          hypothesisId: hypothesis.id,
          confidence: mapping.aggregatedConfidence,
          threshold: this.config.mappingConfidenceThreshold,
        }, '[PhysicsVerifier] 映射置信度过低，跳过');
        return this.createSkippedResult(hypothesis.id, 'low_confidence', mapping);
      }

      // Step 3: 参数边界检查
      const boundaryCheck = this.checkBoundaryConstraints(mapping);

      // Step 4: 方程残差验证
      const residualCheck = this.computeResiduals(mapping);

      // Step 5: Monte-Carlo 不确定性估计
      const uncertainty = this.estimateUncertainty(mapping, residualCheck);

      // Step 6: 综合物理置信度
      const physicsConfidence = this.computePhysicsConfidence(
        mapping, boundaryCheck, residualCheck, uncertainty
      );

      // Step 7: 生成物理解释
      const explanation = this.generateExplanation(hypothesis, mapping, residualCheck, boundaryCheck);

      return {
        hypothesisId: hypothesis.id,
        physicallyFeasible: physicsConfidence >= 0.5,
        physicsConfidence,
        mappingResults: {
          rule: mapping.source.rule,
          embedding: mapping.source.embedding,
          grok: mapping.source.grok,
        },
        residualCheck,
        boundaryCheck,
        uncertainty,
        skippedReason: undefined,
        explanation,
      };
    } catch (err) {
      logger.error({ hypothesisId: hypothesis.id, error: String(err) }, '[PhysicsVerifier] 验证异常');
      return this.createSkippedResult(hypothesis.id, 'timeout', null);
    } finally {
      this.observability.endSpan(spanId);
    }
  }

  /** 批量验证（并发控制 + 超时保护） */
  async verifyBatch(
    hypotheses: Hypothesis[],
    currentState: StateVector
  ): Promise<PhysicsVerificationResult[]> {
    const { maxConcurrency, globalTimeoutMs } = this.config.concurrency;

    // 自适应并发数：根据假设数量调整
    const effectiveConcurrency = Math.min(
      Math.max(4, Math.min(maxConcurrency, hypotheses.length)),
      12
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), globalTimeoutMs);

    try {
      // 分批执行
      const results: PhysicsVerificationResult[] = [];
      for (let i = 0; i < hypotheses.length; i += effectiveConcurrency) {
        if (controller.signal.aborted) break;

        const batch = hypotheses.slice(i, i + effectiveConcurrency);
        const batchResults = await Promise.allSettled(
          batch.map((h) =>
            Promise.race([
              this.verify(h, currentState),
              new Promise<PhysicsVerificationResult>((_, reject) => {
                controller.signal.addEventListener('abort', () =>
                  reject(new Error('Global timeout'))
                );
              }),
            ])
          )
        );

        for (let j = 0; j < batchResults.length; j++) {
          const r = batchResults[j];
          if (r.status === 'fulfilled') {
            results.push(r.value);
          } else {
            results.push(this.createSkippedResult(batch[j].id, 'timeout', null));
          }
        }
      }

      return results;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** 获取内建方程库 */
  getEquations(): PhysicsEquation[] {
    return Array.from(this.equations.values());
  }

  /** 获取特定异常域的方程 */
  getEquationsByDomain(domain: AnomalyDomain): PhysicsEquation[] {
    return Array.from(this.equations.values()).filter((eq) => eq.anomalyDomain === domain);
  }

  // =========================================================================
  // 三源映射
  // =========================================================================

  /** 三源映射：假设描述 → 物理参数 */
  private async mapHypothesisToParams(hypothesis: Hypothesis): Promise<MappingResult> {
    // Source 1: 规则映射
    const ruleResult = this.ruleBasedMap(hypothesis.description, hypothesis.domain);

    // Source 2: Embedding 映射
    const embeddingResult = await this.embeddingMap(hypothesis.description);

    // Source 3: Grok 映射（受 CostGate 控制）
    let grokResult: { params: Record<string, number>; confidence: number; explanation: string } | null = null;
    if (this.config.enableGrokMapping && this.grokService?.generateStructuredParams) {
      try {
        const grokParams = await this.grokService.generateStructuredParams(hypothesis.description);
        if (grokParams) {
          grokResult = { params: grokParams, confidence: 0.75, explanation: 'Grok 结构化参数提取' };
        }
      } catch {
        logger.debug({ hypothesisId: hypothesis.id }, '[PhysicsVerifier] Grok 映射失败，降级');
      }
    }

    // 三源融合
    const mergedParams = this.mergeWithPriority(ruleResult, embeddingResult, grokResult);
    const aggregatedConfidence = this.computeAggregatedConfidence(ruleResult, embeddingResult, grokResult);

    return {
      params: mergedParams,
      source: {
        rule: {
          confidence: ruleResult ? ruleResult.confidence : 0,
          matched: ruleResult !== null,
          equations: ruleResult?.equationIds ?? [],
        },
        embedding: {
          confidence: embeddingResult ? embeddingResult.confidence : 0,
          similarity: embeddingResult?.similarity ?? 0,
          matched: embeddingResult !== null,
        },
        grok: grokResult
          ? { confidence: grokResult.confidence, explanation: grokResult.explanation, matched: true }
          : undefined,
      },
      aggregatedConfidence,
    };
  }

  /** 规则映射 — 基于关键词匹配和正则提取 */
  private ruleBasedMap(
    description: string,
    domain?: AnomalyDomain
  ): { params: Record<string, number>; confidence: number; equationIds: string[] } | null {
    const desc = description.toLowerCase();

    // 找到最佳匹配的规则
    let bestMatch: RuleMappingEntry | null = null;
    let bestScore = 0;

    for (const entry of RULE_MAPPING_TABLE) {
      // 域匹配加分
      let score = domain && entry.domain === domain ? 0.3 : 0;

      // 关键词匹配计分
      const matchedKeywords = entry.keywords.filter((kw) => desc.includes(kw.toLowerCase()));
      score += matchedKeywords.length / entry.keywords.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (!bestMatch || bestScore < 0.2) return null;

    // 从描述中提取参数
    const params = { ...bestMatch.defaultParams };
    for (const extractor of bestMatch.extractors) {
      const match = description.match(extractor.regex);
      if (match && match[1]) {
        const value = extractor.transform ? extractor.transform(match[1]) : parseFloat(match[1]);
        if (!isNaN(value)) {
          params[extractor.param] = value;
        }
      }
    }

    // 置信度 = 关键词匹配率 × 0.6 + 参数提取率 × 0.4
    const extractedCount = bestMatch.extractors.filter((e) => {
      const m = description.match(e.regex);
      return m && m[1];
    }).length;
    const extractionRate = bestMatch.extractors.length > 0 ? extractedCount / bestMatch.extractors.length : 0;
    const confidence = Math.min(1, bestScore * 0.6 + extractionRate * 0.4);

    return { params, confidence, equationIds: bestMatch.equationIds };
  }

  /** Embedding 映射 — VectorStore 语义检索 */
  private async embeddingMap(
    description: string
  ): Promise<{ params: Record<string, number>; confidence: number; similarity: number } | null> {
    // 生成简单的 TF-IDF 风格特征向量（无需外部模型）
    const queryVector = this.textToVector(description);

    const results = this.vectorStore.search({
      vector: queryVector,
      topK: 3,
      minSimilarity: 0.3,
    });

    if (results.length === 0) return null;

    // 取最相似的结果
    const best = results[0];
    const params = (best.metadata.params as Record<string, number>) ?? {};
    return {
      params,
      confidence: best.similarity * 0.9, // 略微折扣
      similarity: best.similarity,
    };
  }

  /** 文本转向量 — 基于关键词 bag-of-words（轻量级，无需外部模型） */
  private textToVector(text: string): number[] {
    // 使用固定词汇表生成 64 维向量
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
    const lowerText = text.toLowerCase();

    for (let i = 0; i < vocabulary.length; i++) {
      if (lowerText.includes(vocabulary[i].toLowerCase())) {
        vector[i] = 1;
      }
    }

    return vector;
  }

  // =========================================================================
  // 三源融合
  // =========================================================================

  /** 加权融合三源参数 */
  private mergeWithPriority(
    rule: { params: Record<string, number> } | null,
    embedding: { params: Record<string, number> } | null,
    grok: { params: Record<string, number> } | null
  ): Record<string, number> {
    const { rule: rw, embedding: ew, grok: gw } = this.config.sourceWeights;
    const merged: Record<string, number> = {};
    const allKeys = new Set<string>();

    if (rule) Object.keys(rule.params).forEach((k) => allKeys.add(k));
    if (embedding) Object.keys(embedding.params).forEach((k) => allKeys.add(k));
    if (grok) Object.keys(grok.params).forEach((k) => allKeys.add(k));

    for (const key of allKeys) {
      let weightedSum = 0;
      let totalWeight = 0;

      if (rule && key in rule.params) {
        weightedSum += rule.params[key] * rw;
        totalWeight += rw;
      }
      if (embedding && key in embedding.params) {
        weightedSum += embedding.params[key] * ew;
        totalWeight += ew;
      }
      if (grok && key in grok.params) {
        weightedSum += grok.params[key] * gw;
        totalWeight += gw;
      }

      if (totalWeight > 0) {
        merged[key] = weightedSum / totalWeight;
      }
    }

    return merged;
  }

  /** 计算三源聚合置信度 — 含一致性惩罚 */
  private computeAggregatedConfidence(
    rule: { confidence: number; params: Record<string, number> } | null,
    embedding: { confidence: number; params: Record<string, number> } | null,
    grok: { confidence: number } | null
  ): number {
    const { rule: rw, embedding: ew, grok: gw } = this.config.sourceWeights;
    const sources: Array<{ confidence: number; weight: number }> = [];

    if (rule) sources.push({ confidence: rule.confidence, weight: rw });
    if (embedding) sources.push({ confidence: embedding.confidence, weight: ew });
    if (grok) sources.push({ confidence: grok.confidence, weight: gw });

    if (sources.length === 0) return 0;

    // 加权平均置信度
    let weightedConf = 0;
    let totalWeight = 0;
    for (const s of sources) {
      weightedConf += s.confidence * s.weight;
      totalWeight += s.weight;
    }
    const avgConf = weightedConf / totalWeight;

    // 一致性惩罚：多源之间置信度标准差越大，惩罚越重
    if (sources.length >= 2) {
      const mean = sources.reduce((a, s) => a + s.confidence, 0) / sources.length;
      const variance = sources.reduce((a, s) => a + (s.confidence - mean) ** 2, 0) / sources.length;
      const stdDev = Math.sqrt(variance);
      // 标准差 > 0.3 时开始显著惩罚
      const penalty = Math.max(0, stdDev - 0.1) * 0.5;
      return Math.max(0, avgConf - penalty);
    }

    return avgConf;
  }

  // =========================================================================
  // 物理验证核心
  // =========================================================================

  /** 参数边界检查 */
  private checkBoundaryConstraints(
    mapping: MappingResult
  ): PhysicsVerificationResult['boundaryCheck'] {
    const checks: PhysicsVerificationResult['boundaryCheck'] = [];
    const equationIds = mapping.source.rule.equations;

    for (const eqId of equationIds) {
      const eq = this.equations.get(eqId);
      if (!eq) continue;

      for (const [variable, bounds] of Object.entries(eq.parameterBounds)) {
        const value = mapping.params[variable];
        if (value === undefined) continue;

        checks.push({
          variable,
          value,
          min: bounds.min,
          max: bounds.max,
          inBounds: value >= bounds.min && value <= bounds.max,
        });
      }
    }

    return checks;
  }

  /** 方程残差验证 */
  private computeResiduals(
    mapping: MappingResult
  ): PhysicsVerificationResult['residualCheck'] {
    const checks: PhysicsVerificationResult['residualCheck'] = [];
    const equationIds = mapping.source.rule.equations;

    for (const eqId of equationIds) {
      const eq = this.equations.get(eqId);
      if (!eq) continue;

      try {
        const residual = eq.computeResidual(mapping.params);
        checks.push({
          equationId: eqId,
          residual,
          threshold: this.config.residualThreshold,
          passed: residual <= this.config.residualThreshold,
        });
      } catch (err) {
        logger.warn({ equationId: eqId, error: String(err) }, '[PhysicsVerifier] 方程残差计算异常');
        checks.push({
          equationId: eqId,
          residual: 1,
          threshold: this.config.residualThreshold,
          passed: false,
        });
      }
    }

    return checks;
  }

  /** Monte-Carlo 不确定性估计 */
  private estimateUncertainty(
    mapping: MappingResult,
    residualCheck: PhysicsVerificationResult['residualCheck']
  ): PhysicsVerificationResult['uncertainty'] {
    const nSamples = this.config.monteCarloSamples;
    const samples: number[] = [];

    for (let i = 0; i < nSamples; i++) {
      // 对每个参数添加 ±10% 高斯噪声
      const perturbedParams: Record<string, number> = {};
      for (const [key, value] of Object.entries(mapping.params)) {
        const noise = this.gaussianNoise() * value * 0.1;
        perturbedParams[key] = value + noise;
      }

      // 重新计算残差
      let totalResidual = 0;
      let count = 0;
      for (const check of residualCheck) {
        const eq = this.equations.get(check.equationId);
        if (!eq) continue;
        try {
          totalResidual += eq.computeResidual(perturbedParams);
          count++;
        } catch {
          // 忽略异常样本
        }
      }
      if (count > 0) {
        samples.push(totalResidual / count);
      }
    }

    if (samples.length === 0) {
      return { mean: 0.5, std: 0.3, ci95: [0, 1] };
    }

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, v) => a + (v - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    const ci95Low = Math.max(0, mean - 1.96 * std);
    const ci95High = Math.min(1, mean + 1.96 * std);

    return { mean, std, ci95: [ci95Low, ci95High] };
  }

  /** 高斯噪声生成（Box-Muller 变换） */
  private gaussianNoise(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  }

  // =========================================================================
  // 综合评分
  // =========================================================================

  /** 计算综合物理置信度 */
  private computePhysicsConfidence(
    mapping: MappingResult,
    boundaryCheck: PhysicsVerificationResult['boundaryCheck'],
    residualCheck: PhysicsVerificationResult['residualCheck'],
    uncertainty: PhysicsVerificationResult['uncertainty']
  ): number {
    // 1. 映射置信度贡献 (25%)
    const mappingScore = mapping.aggregatedConfidence;

    // 2. 边界检查贡献 (20%) — 越界比例越高，分数越低
    const boundaryScore =
      boundaryCheck.length > 0
        ? boundaryCheck.filter((c) => c.inBounds).length / boundaryCheck.length
        : 1;

    // 3. 残差检查贡献 (35%) — 核心物理验证
    const residualScore =
      residualCheck.length > 0
        ? residualCheck.reduce((sum, c) => sum + Math.max(0, 1 - c.residual), 0) / residualCheck.length
        : 0.5;

    // 4. 不确定性惩罚 (20%) — 不确定性越高，惩罚越重
    const uncertaintyScore = Math.max(0, 1 - uncertainty.std * 2);

    const confidence =
      mappingScore * 0.25 + boundaryScore * 0.20 + residualScore * 0.35 + uncertaintyScore * 0.20;

    return Math.max(0, Math.min(1, confidence));
  }

  // =========================================================================
  // 辅助方法
  // =========================================================================

  /** 生成物理解释文本 */
  private generateExplanation(
    hypothesis: Hypothesis,
    mapping: MappingResult,
    residualCheck: PhysicsVerificationResult['residualCheck'],
    boundaryCheck: PhysicsVerificationResult['boundaryCheck']
  ): string {
    const parts: string[] = [];

    // 映射来源
    const sources: string[] = [];
    if (mapping.source.rule.matched) sources.push(`规则映射(${(mapping.source.rule.confidence * 100).toFixed(0)}%)`);
    if (mapping.source.embedding.matched) sources.push(`语义检索(${(mapping.source.embedding.confidence * 100).toFixed(0)}%)`);
    if (mapping.source.grok?.matched) sources.push(`Grok(${(mapping.source.grok.confidence * 100).toFixed(0)}%)`);
    parts.push(`参数映射来源: ${sources.join(', ') || '无'}`);

    // 残差检查
    if (residualCheck.length > 0) {
      const passed = residualCheck.filter((c) => c.passed).length;
      parts.push(`方程残差: ${passed}/${residualCheck.length} 通过`);
      for (const c of residualCheck) {
        const eq = this.equations.get(c.equationId);
        parts.push(`  - ${eq?.name ?? c.equationId}: 残差=${c.residual.toFixed(3)} ${c.passed ? '✓' : '✗'}`);
      }
    }

    // 边界检查
    const violations = boundaryCheck.filter((c) => !c.inBounds);
    if (violations.length > 0) {
      parts.push(`参数越界: ${violations.length} 项`);
      for (const v of violations) {
        parts.push(`  - ${v.variable}: ${v.value.toFixed(2)} ∉ [${v.min}, ${v.max}]`);
      }
    }

    return parts.join('\n');
  }

  /** 创建跳过结果 */
  private createSkippedResult(
    hypothesisId: string,
    reason: SkippedReason,
    mapping: MappingResult | null
  ): PhysicsVerificationResult {
    return {
      hypothesisId,
      physicallyFeasible: false,
      physicsConfidence: 0,
      mappingResults: {
        rule: mapping?.source.rule ?? { confidence: 0, matched: false, equations: [] },
        embedding: mapping?.source.embedding ?? { confidence: 0, similarity: 0, matched: false },
        grok: mapping?.source.grok,
      },
      residualCheck: [],
      boundaryCheck: [],
      uncertainty: { mean: 1, std: 0, ci95: [1, 1] },
      skippedReason: reason,
      explanation: `物理验证跳过: ${reason}`,
    };
  }
}
