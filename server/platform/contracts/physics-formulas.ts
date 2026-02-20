/**
 * ============================================================================
 * 物理公式引擎 — 工业场景通用物理计算
 * ============================================================================
 *
 * 内置公式：
 *   1. 风载力矩 M = ½ρv²Ah/2 (N·m)
 *   2. 疲劳增量 Δσ = k × M / W (MPa)
 *   3. 摩擦力 f = μN (N)
 *   4. 腐蚀速率 r = k[Cl⁻][humidity] (mm/year)
 *   5. 热传导 Q = kA(T₁-T₂)/d (W)
 *   6. 振动速度有效值 v_rms = √(Σaᵢ²/N) (mm/s)
 *   7. S-N 曲线疲劳寿命 N = C / σᵃ
 *   8. 倾覆力矩 M_overturn = F_wind × h_arm + m_cargo × g × e (N·m)
 *   9. 抗倾覆安全系数 K = M_resist / M_overturn
 *
 * 设计原则：
 *   - 每个公式有完整的变量定义（名称、符号、单位、范围）
 *   - 计算结果包含解释文本
 *   - 支持通过 ConditionProfile 注入场景参数
 *   - 所有公式可通过 API 查询和调用
 */

import type { PhysicsFormula, PhysicsFormulaResult } from './data-contracts';

// ============================================================================
// 内置公式定义
// ============================================================================

export const BUILTIN_FORMULAS: PhysicsFormula[] = [
  {
    id: 'wind_load_moment',
    name: '风载力矩',
    category: 'wind_load',
    formula: 'M = ½ρv²Ah/2',
    variables: [
      { name: '空气密度', symbol: 'ρ', unit: 'kg/m³', description: '标准大气压下空气密度', defaultValue: 1.225, range: [1.0, 1.5] },
      { name: '风速', symbol: 'v', unit: 'm/s', description: '60m高度处风速', range: [0, 60] },
      { name: '迎风面积', symbol: 'A', unit: 'm²', description: '设备迎风面积', range: [10, 500] },
      { name: '力臂高度', symbol: 'h', unit: 'm', description: '风载作用点到基座的高度', range: [5, 100] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'tower_crane', 'wind_turbine'],
    source: 'physics',
    reference: 'GB/T 3811-2008 起重机设计规范',
  },
  {
    id: 'fatigue_increment',
    name: '疲劳应力增量',
    category: 'fatigue',
    formula: 'Δσ = k × M / W',
    variables: [
      { name: '应力集中系数', symbol: 'k', unit: '无量纲', description: '焊缝/缺口处应力集中系数', defaultValue: 1.5, range: [1.0, 5.0] },
      { name: '弯矩', symbol: 'M', unit: 'N·m', description: '截面弯矩（含风载+偏心+动载）', range: [0, 1e8] },
      { name: '截面模量', symbol: 'W', unit: 'm³', description: '截面抗弯模量', range: [0.001, 10] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'bridge', 'beam'],
    source: 'physics',
    reference: 'EN 13001-3-1 起重机载荷与载荷组合',
  },
  {
    id: 'sn_curve_life',
    name: 'S-N曲线疲劳寿命',
    category: 'fatigue',
    formula: 'N = C / σᵃ',
    variables: [
      { name: '材料常数', symbol: 'C', unit: '无量纲', description: 'S-N曲线材料常数（Q345B钢: 2.0×10¹²）', defaultValue: 2.0e12, range: [1e10, 1e15] },
      { name: '应力幅', symbol: 'σ', unit: 'MPa', description: '循环应力幅值', range: [10, 500] },
      { name: '指数', symbol: 'a', unit: '无量纲', description: 'S-N曲线斜率指数（钢: 3）', defaultValue: 3, range: [2, 5] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'bridge', 'beam', 'shaft'],
    source: 'physics',
    reference: 'BS 7608 疲劳设计与评估',
  },
  {
    id: 'friction_force',
    name: '摩擦力',
    category: 'friction',
    formula: 'f = μN',
    variables: [
      { name: '摩擦系数', symbol: 'μ', unit: '无量纲', description: '动摩擦系数（钢-钢干摩擦: 0.42, 润滑: 0.15）', defaultValue: 0.15, range: [0.01, 1.0] },
      { name: '法向力', symbol: 'N', unit: 'N', description: '接触面法向力', range: [0, 1e7] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'conveyor', 'bearing'],
    source: 'physics',
    reference: '工程力学基础',
  },
  {
    id: 'corrosion_rate',
    name: '腐蚀速率',
    category: 'corrosion',
    formula: 'r = k × [Cl⁻] × [humidity]',
    variables: [
      { name: '腐蚀速率常数', symbol: 'k', unit: 'mm/(year·mol/L·%)', description: '材料腐蚀速率常数（碳钢海洋环境: 0.025）', defaultValue: 0.025, range: [0.001, 0.1] },
      { name: '氯离子浓度', symbol: '[Cl⁻]', unit: 'mol/L', description: '环境氯离子浓度', defaultValue: 0.5, range: [0, 2.0] },
      { name: '相对湿度', symbol: '[humidity]', unit: '%', description: '环境相对湿度', defaultValue: 80, range: [0, 100] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'offshore_platform', 'ship'],
    source: 'physics',
    reference: 'ISO 9223 大气腐蚀性分类',
  },
  {
    id: 'heat_conduction',
    name: '热传导',
    category: 'thermal',
    formula: 'Q = kA(T₁-T₂)/d',
    variables: [
      { name: '热导率', symbol: 'k', unit: 'W/(m·K)', description: '材料热导率（钢: 50.2）', defaultValue: 50.2, range: [0.1, 500] },
      { name: '截面积', symbol: 'A', unit: 'm²', description: '传热截面积', range: [0.001, 100] },
      { name: '高温侧温度', symbol: 'T₁', unit: '°C', description: '高温侧温度', range: [-50, 500] },
      { name: '低温侧温度', symbol: 'T₂', unit: '°C', description: '低温侧温度', range: [-50, 500] },
      { name: '传热距离', symbol: 'd', unit: 'm', description: '传热路径长度', range: [0.001, 10] },
    ],
    applicableEquipment: ['motor', 'bearing', 'gearbox', 'transformer'],
    source: 'physics',
    reference: '传热学基础',
  },
  {
    id: 'vibration_rms',
    name: '振动速度有效值',
    category: 'vibration',
    formula: 'v_rms = √(Σaᵢ²/N)',
    variables: [
      { name: '加速度序列', symbol: 'aᵢ', unit: 'mm/s²', description: '时域加速度采样序列', range: [0, 1000] },
      { name: '采样数', symbol: 'N', unit: '无量纲', description: '采样点数', range: [1, 1e6] },
    ],
    applicableEquipment: ['motor', 'bearing', 'gearbox', 'pump', 'fan'],
    source: 'physics',
    reference: 'ISO 10816 机械振动评价',
  },
  {
    id: 'overturn_moment',
    name: '倾覆力矩',
    category: 'structural',
    formula: 'M_overturn = F_wind × h_arm + m_cargo × g × e',
    variables: [
      { name: '风力', symbol: 'F_wind', unit: 'N', description: '风载合力', range: [0, 1e6] },
      { name: '力臂', symbol: 'h_arm', unit: 'm', description: '风力作用点到倾覆轴的距离', range: [5, 100] },
      { name: '货物质量', symbol: 'm_cargo', unit: 'kg', description: '吊运货物质量', range: [0, 100000] },
      { name: '重力加速度', symbol: 'g', unit: 'm/s²', description: '重力加速度', defaultValue: 9.81, range: [9.78, 9.83] },
      { name: '偏心距', symbol: 'e', unit: 'm', description: '货物重心偏离吊点的水平距离', range: [0, 5] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'tower_crane'],
    source: 'physics',
    reference: 'GB/T 3811-2008 起重机设计规范 第7章',
  },
  {
    id: 'overturn_safety_factor',
    name: '抗倾覆安全系数',
    category: 'structural',
    formula: 'K = M_resist / M_overturn',
    variables: [
      { name: '抗倾覆力矩', symbol: 'M_resist', unit: 'N·m', description: '自重产生的抗倾覆力矩', range: [1e5, 1e9] },
      { name: '倾覆力矩', symbol: 'M_overturn', unit: 'N·m', description: '风载+偏心产生的倾覆力矩', range: [1e4, 1e8] },
    ],
    applicableEquipment: ['quay_crane', 'gantry_crane', 'tower_crane'],
    source: 'physics',
    reference: 'GB/T 3811-2008 起重机设计规范 第7章',
  },
];

// ============================================================================
// 物理公式计算引擎
// ============================================================================

export class PhysicsEngine {
  private formulas: Map<string, PhysicsFormula> = new Map();

  constructor() {
    // 注册内置公式
    for (const formula of BUILTIN_FORMULAS) {
      this.formulas.set(formula.id, formula);
    }
  }

  /**
   * 注册自定义公式
   */
  registerFormula(formula: PhysicsFormula): void {
    if (this.formulas.has(formula.id)) {
      throw new Error(`Formula ${formula.id} already registered`);
    }
    this.formulas.set(formula.id, formula);
  }

  /**
   * 获取公式定义
   */
  getFormula(formulaId: string): PhysicsFormula | undefined {
    return this.formulas.get(formulaId);
  }

  /**
   * 列出所有公式
   */
  listFormulas(filter?: { category?: string; equipmentType?: string }): PhysicsFormula[] {
    let results = Array.from(this.formulas.values());
    if (filter?.category) {
      results = results.filter(f => f.category === filter.category);
    }
    if (filter?.equipmentType) {
      results = results.filter(f => f.applicableEquipment.includes(filter.equipmentType!));
    }
    return results;
  }

  /**
   * 计算公式
   * @param formulaId 公式 ID
   * @param variables 变量值（key 为变量 symbol）
   */
  compute(formulaId: string, variables: Record<string, number>): PhysicsFormulaResult {
    const startTime = Date.now();
    const formula = this.formulas.get(formulaId);
    if (!formula) {
      throw new Error(`Formula not found: ${formulaId}`);
    }

    // 填充默认值
    const resolvedVars: Record<string, number> = {};
    for (const v of formula.variables) {
      const value = variables[v.symbol] ?? variables[v.name] ?? v.defaultValue;
      if (value === undefined) {
        throw new Error(`Missing variable: ${v.symbol} (${v.name}) for formula ${formulaId}`);
      }
      // 范围检查
      if (v.range && (value < v.range[0] || value > v.range[1])) {
        console.warn(
          `[PhysicsEngine] Variable ${v.symbol}=${value} out of range [${v.range[0]}, ${v.range[1]}] for formula ${formulaId}`
        );
      }
      resolvedVars[v.symbol] = value;
    }

    // 执行计算
    let result: number;
    let explanation: string;

    switch (formulaId) {
      case 'wind_load_moment': {
        const rho = resolvedVars['ρ'];
        const v = resolvedVars['v'];
        const A = resolvedVars['A'];
        const h = resolvedVars['h'];
        result = 0.5 * rho * v * v * A * h / 2;
        explanation = `风载力矩 M = ½×${rho}×${v}²×${A}×${h}/2 = ${result.toFixed(1)} N·m`;
        break;
      }
      case 'fatigue_increment': {
        const k = resolvedVars['k'];
        const M = resolvedVars['M'];
        const W = resolvedVars['W'];
        result = k * M / W;
        explanation = `疲劳应力增量 Δσ = ${k}×${M}/${W} = ${result.toFixed(2)} MPa`;
        break;
      }
      case 'sn_curve_life': {
        const C = resolvedVars['C'];
        const sigma = resolvedVars['σ'];
        const a = resolvedVars['a'];
        result = C / Math.pow(sigma, a);
        explanation = `S-N曲线疲劳寿命 N = ${C.toExponential(1)}/${sigma}^${a} = ${result.toExponential(2)} 次`;
        break;
      }
      case 'friction_force': {
        const mu = resolvedVars['μ'];
        const N = resolvedVars['N'];
        result = mu * N;
        explanation = `摩擦力 f = ${mu}×${N} = ${result.toFixed(1)} N`;
        break;
      }
      case 'corrosion_rate': {
        const k = resolvedVars['k'];
        const cl = resolvedVars['[Cl⁻]'];
        const humidity = resolvedVars['[humidity]'];
        result = k * cl * humidity;
        explanation = `腐蚀速率 r = ${k}×${cl}×${humidity} = ${result.toFixed(4)} mm/year`;
        break;
      }
      case 'heat_conduction': {
        const k = resolvedVars['k'];
        const A = resolvedVars['A'];
        const T1 = resolvedVars['T₁'];
        const T2 = resolvedVars['T₂'];
        const d = resolvedVars['d'];
        result = k * A * (T1 - T2) / d;
        explanation = `热传导 Q = ${k}×${A}×(${T1}-${T2})/${d} = ${result.toFixed(1)} W`;
        break;
      }
      case 'vibration_rms': {
        // 简化：输入为 RMS 值和采样数（实际使用时传入预计算的 RMS）
        const a = resolvedVars['aᵢ'];
        const N = resolvedVars['N'];
        result = a / Math.sqrt(N);
        explanation = `振动速度有效值 v_rms = ${a}/√${N} = ${result.toFixed(3)} mm/s`;
        break;
      }
      case 'overturn_moment': {
        const Fw = resolvedVars['F_wind'];
        const h = resolvedVars['h_arm'];
        const m = resolvedVars['m_cargo'];
        const g = resolvedVars['g'];
        const e = resolvedVars['e'];
        result = Fw * h + m * g * e;
        explanation = `倾覆力矩 M = ${Fw}×${h} + ${m}×${g}×${e} = ${result.toFixed(1)} N·m`;
        break;
      }
      case 'overturn_safety_factor': {
        const Mr = resolvedVars['M_resist'];
        const Mo = resolvedVars['M_overturn'];
        result = Mo > 0 ? Mr / Mo : Infinity;
        explanation = `抗倾覆安全系数 K = ${Mr}/${Mo} = ${result === Infinity ? '∞' : result.toFixed(3)}`;
        if (result < 1.5) {
          explanation += ' ⚠️ 低于安全阈值1.5';
        }
        break;
      }
      default:
        throw new Error(`No compute implementation for formula: ${formulaId}`);
    }

    return {
      formulaId,
      inputVariables: resolvedVars,
      result,
      unit: this.getResultUnit(formulaId),
      explanation,
      computeTimeMs: Date.now() - startTime,
    };
  }

  /**
   * 批量计算（用于诊断报告生成）
   */
  computeBatch(
    requests: Array<{ formulaId: string; variables: Record<string, number> }>
  ): PhysicsFormulaResult[] {
    return requests.map(req => this.compute(req.formulaId, req.variables));
  }

  /**
   * 获取公式结果单位
   */
  private getResultUnit(formulaId: string): string {
    const unitMap: Record<string, string> = {
      wind_load_moment: 'N·m',
      fatigue_increment: 'MPa',
      sn_curve_life: '次',
      friction_force: 'N',
      corrosion_rate: 'mm/year',
      heat_conduction: 'W',
      vibration_rms: 'mm/s',
      overturn_moment: 'N·m',
      overturn_safety_factor: '无量纲',
    };
    return unitMap[formulaId] || '未知';
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const physicsEngine = new PhysicsEngine();
