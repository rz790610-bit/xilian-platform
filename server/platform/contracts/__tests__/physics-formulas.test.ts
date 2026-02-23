/**
 * physics-formulas.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../core/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { BUILTIN_FORMULAS, PhysicsEngine, physicsEngine } from '../physics-formulas';

describe('BUILTIN_FORMULAS', () => {
  it('包含至少 9 个内置公式', () => {
    expect(BUILTIN_FORMULAS.length).toBeGreaterThanOrEqual(9);
  });

  it('每个公式都有 id, name, category, formula, variables', () => {
    for (const f of BUILTIN_FORMULAS) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(f.formula).toBeTruthy();
      expect(f.variables.length).toBeGreaterThan(0);
    }
  });

  it('每个变量都有 name, symbol, unit', () => {
    for (const f of BUILTIN_FORMULAS) {
      for (const v of f.variables) {
        expect(v.name).toBeTruthy();
        expect(v.symbol).toBeTruthy();
        expect(v.unit).toBeTruthy();
      }
    }
  });

  it('所有公式 id 唯一', () => {
    const ids = BUILTIN_FORMULAS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('PhysicsEngine', () => {
  let engine: PhysicsEngine;

  beforeEach(() => {
    engine = new PhysicsEngine();
  });

  // --- 基础 API ---

  it('getFormula 返回已注册公式', () => {
    const f = engine.getFormula('wind_load_moment');
    expect(f).toBeDefined();
    expect(f!.name).toBe('风载力矩');
  });

  it('getFormula 对未知公式返回 undefined', () => {
    expect(engine.getFormula('nonexistent')).toBeUndefined();
  });

  it('listFormulas 返回所有公式', () => {
    const all = engine.listFormulas();
    expect(all.length).toBeGreaterThanOrEqual(9);
  });

  it('listFormulas 按 category 过滤', () => {
    const fatigue = engine.listFormulas({ category: 'fatigue' });
    expect(fatigue.length).toBeGreaterThanOrEqual(2);
    expect(fatigue.every(f => f.category === 'fatigue')).toBe(true);
  });

  it('listFormulas 按 equipmentType 过滤', () => {
    const crane = engine.listFormulas({ equipmentType: 'quay_crane' });
    expect(crane.length).toBeGreaterThan(0);
    expect(crane.every(f => f.applicableEquipment.includes('quay_crane'))).toBe(true);
  });

  it('registerFormula 注册自定义公式', () => {
    engine.registerFormula({
      id: 'custom_formula',
      name: '自定义公式',
      category: 'structural',
      formula: 'x = a + b',
      variables: [
        { name: '参数A', symbol: 'a', unit: 'm', description: '参数A' },
        { name: '参数B', symbol: 'b', unit: 'm', description: '参数B' },
      ],
      applicableEquipment: ['test'],
      source: 'expert',
    });
    expect(engine.getFormula('custom_formula')).toBeDefined();
  });

  it('registerFormula 拒绝重复 id', () => {
    expect(() => {
      engine.registerFormula({
        id: 'wind_load_moment', // 已存在
        name: '重复',
        category: 'wind_load',
        formula: 'x = 1',
        variables: [],
        applicableEquipment: [],
        source: 'expert',
      });
    }).toThrow('already registered');
  });

  // --- 计算 API ---

  it('compute 风载力矩: M = ½ρv²Ah/2', () => {
    const result = engine.compute('wind_load_moment', {
      'ρ': 1.225,
      'v': 20,
      'A': 100,
      'h': 50,
    });
    // M = 0.5 * 1.225 * 400 * 100 * 50 / 2 = 612500
    expect(result.result).toBeCloseTo(612500, 0);
    expect(result.unit).toBe('N·m');
    expect(result.formulaId).toBe('wind_load_moment');
    expect(result.explanation).toContain('风载力矩');
  });

  it('compute 摩擦力: f = μN', () => {
    const result = engine.compute('friction_force', {
      'μ': 0.15,
      'N': 10000,
    });
    expect(result.result).toBeCloseTo(1500, 0);
    expect(result.unit).toBe('N');
  });

  it('compute 疲劳应力增量: Δσ = k × M / W', () => {
    const result = engine.compute('fatigue_increment', {
      'k': 1.5,
      'M': 100000,
      'W': 0.01,
    });
    // 1.5 * 100000 / 0.01 = 15000000
    expect(result.result).toBeCloseTo(15000000, 0);
    expect(result.unit).toBe('MPa');
  });

  it('compute S-N曲线疲劳寿命: N = C / σᵃ', () => {
    const result = engine.compute('sn_curve_life', {
      'C': 2.0e12,
      'σ': 100,
      'a': 3,
    });
    // 2e12 / 100^3 = 2e12 / 1e6 = 2e6
    expect(result.result).toBeCloseTo(2e6, 0);
    expect(result.unit).toBe('次');
  });

  it('compute 腐蚀速率: r = k × [Cl⁻] × [humidity]', () => {
    const result = engine.compute('corrosion_rate', {
      'k': 0.025,
      '[Cl⁻]': 0.5,
      '[humidity]': 80,
    });
    // 0.025 * 0.5 * 80 = 1.0
    expect(result.result).toBeCloseTo(1.0, 4);
    expect(result.unit).toBe('mm/year');
  });

  it('compute 抗倾覆安全系数: K = M_resist / M_overturn', () => {
    const result = engine.compute('overturn_safety_factor', {
      'M_resist': 1500000,
      'M_overturn': 1000000,
    });
    expect(result.result).toBeCloseTo(1.5, 3);
    expect(result.unit).toBe('无量纲');
  });

  it('compute 对未知公式抛出错误', () => {
    expect(() => engine.compute('nonexistent', {})).toThrow('Formula not found');
  });

  it('compute 缺少必填变量时抛出错误', () => {
    expect(() => engine.compute('friction_force', { 'μ': 0.15 })).toThrow('Missing variable');
  });

  it('compute 使用变量默认值', () => {
    // 风载力矩的 ρ 有默认值 1.225
    const result = engine.compute('wind_load_moment', {
      'v': 10,
      'A': 100,
      'h': 50,
    });
    // M = 0.5 * 1.225 * 100 * 100 * 50 / 2 = 153125
    expect(result.result).toBeCloseTo(153125, 0);
  });

  it('computeBatch 批量计算', () => {
    const results = engine.computeBatch([
      { formulaId: 'friction_force', variables: { 'μ': 0.15, 'N': 1000 } },
      { formulaId: 'friction_force', variables: { 'μ': 0.42, 'N': 2000 } },
    ]);
    expect(results.length).toBe(2);
    expect(results[0].result).toBeCloseTo(150, 0);
    expect(results[1].result).toBeCloseTo(840, 0);
  });
});

describe('physicsEngine 单例', () => {
  it('是 PhysicsEngine 实例', () => {
    expect(physicsEngine).toBeInstanceOf(PhysicsEngine);
  });

  it('包含所有内置公式', () => {
    for (const f of BUILTIN_FORMULAS) {
      expect(physicsEngine.getFormula(f.id)).toBeDefined();
    }
  });
});
