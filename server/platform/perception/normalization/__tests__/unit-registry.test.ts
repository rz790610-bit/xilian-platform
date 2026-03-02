/**
 * ============================================================================
 * UnitRegistry 单元测试
 * ============================================================================
 *
 * 覆盖:
 *   1. 同量纲精确换算 (温度/压力/振动/电流/转速/应力/力/长度/频率)
 *   2. 跨量纲近似换算 (加速度↔速度↔位移)
 *   3. 批量换算性能路径
 *   4. 设备默认单位查询
 *   5. 传感器单位覆盖
 *   6. 物理合理性校验
 *   7. conditionNormalizer 集成 (normalizeForCondition / normalizeDataSlice)
 *   8. 自定义单位注册
 *   9. 单例/工厂函数
 *  10. 错误处理
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnitRegistry,
  getUnitRegistry,
  resetUnitRegistry,
} from '../unit-registry';
import type { PhysicalQuantity } from '../unit-registry';

// ============================================================================
// 辅助
// ============================================================================

let registry: UnitRegistry;

beforeEach(() => {
  resetUnitRegistry();
  registry = new UnitRegistry();
});

// ============================================================================
// 1. 同量纲精确换算
// ============================================================================

describe('同量纲精确换算', () => {
  // ── 温度 ──────────────────────────────────────────
  describe('温度 (标准: degC)', () => {
    it('degF → degC: 212°F = 100°C', () => {
      const r = registry.convert(212, 'degF', 'degC');
      expect(r.value).toBeCloseTo(100, 4);
      expect(r.isApproximate).toBe(false);
    });

    it('degF → degC: 32°F = 0°C', () => {
      const r = registry.convert(32, 'degF', 'degC');
      expect(r.value).toBeCloseTo(0, 4);
    });

    it('degF → degC: -40°F = -40°C', () => {
      const r = registry.convert(-40, 'degF', 'degC');
      expect(r.value).toBeCloseTo(-40, 4);
    });

    it('K → degC: 273.15K = 0°C', () => {
      const r = registry.convert(273.15, 'K', 'degC');
      expect(r.value).toBeCloseTo(0, 4);
    });

    it('K → degC: 373.15K = 100°C', () => {
      const r = registry.convert(373.15, 'K', 'degC');
      expect(r.value).toBeCloseTo(100, 3);
    });

    it('degC → degF: 100°C = 212°F', () => {
      const r = registry.convert(100, 'degC', 'degF');
      expect(r.value).toBeCloseTo(212, 4);
    });

    it('degC → K: 0°C = 273.15K', () => {
      const r = registry.convert(0, 'degC', 'K');
      expect(r.value).toBeCloseTo(273.15, 4);
    });
  });

  // ── 压力 ──────────────────────────────────────────
  describe('压力 (标准: MPa)', () => {
    it('psi → MPa: 1000 psi ≈ 6.895 MPa', () => {
      const r = registry.convert(1000, 'psi', 'MPa');
      expect(r.value).toBeCloseTo(6.895, 2);
    });

    it('bar → MPa: 10 bar = 1 MPa', () => {
      const r = registry.convert(10, 'bar', 'MPa');
      expect(r.value).toBeCloseTo(1, 4);
    });

    it('kPa → MPa: 1000 kPa = 1 MPa', () => {
      const r = registry.convert(1000, 'kPa', 'MPa');
      expect(r.value).toBeCloseTo(1, 4);
    });

    it('atm → MPa: 1 atm ≈ 0.101325 MPa', () => {
      const r = registry.convert(1, 'atm', 'MPa');
      expect(r.value).toBeCloseTo(0.101325, 4);
    });

    it('MPa → psi: 1 MPa ≈ 145.04 psi', () => {
      const r = registry.convert(1, 'MPa', 'psi');
      expect(r.value).toBeCloseTo(145.04, 0);
    });
  });

  // ── 振动加速度 ──────────────────────────────────────
  describe('振动加速度 (标准: m/s²)', () => {
    it('g → m/s²: 1g = 9.80665 m/s²', () => {
      const r = registry.convert(1, 'g', 'm_s2');
      expect(r.value).toBeCloseTo(9.80665, 4);
    });

    it('m/s² → g: 9.80665 m/s² = 1g', () => {
      const r = registry.convert(9.80665, 'm_s2', 'g');
      expect(r.value).toBeCloseTo(1, 4);
    });

    it('mg → m/s²: 1000 mg ≈ 9.81 m/s²', () => {
      const r = registry.convert(1000, 'mg', 'm_s2');
      expect(r.value).toBeCloseTo(9.81, 1);
    });
  });

  // ── 振动速度 ──────────────────────────────────────
  describe('振动速度 (标准: mm/s RMS)', () => {
    it('in/s → mm/s: 1 in/s = 25.4 mm/s', () => {
      const r = registry.convert(1, 'in_s_rms', 'mm_s_rms');
      expect(r.value).toBeCloseTo(25.4, 4);
    });

    it('m/s → mm/s: 0.001 m/s = 1 mm/s', () => {
      const r = registry.convert(0.001, 'm_s_rms', 'mm_s_rms');
      expect(r.value).toBeCloseTo(1, 4);
    });
  });

  // ── 电流 ──────────────────────────────────────────
  describe('电流 (标准: A)', () => {
    it('mA → A: 1000 mA = 1A', () => {
      const r = registry.convert(1000, 'mA', 'A');
      expect(r.value).toBeCloseTo(1, 4);
    });

    it('kA → A: 1 kA = 1000A', () => {
      const r = registry.convert(1, 'kA', 'A');
      expect(r.value).toBeCloseTo(1000, 4);
    });
  });

  // ── 转速 ──────────────────────────────────────────
  describe('转速 (标准: rpm)', () => {
    it('Hz → rpm: 1 Hz = 60 rpm', () => {
      const r = registry.convert(1, 'Hz', 'rpm');
      expect(r.value).toBeCloseTo(60, 4);
    });

    it('rps → rpm: 1 rps = 60 rpm', () => {
      const r = registry.convert(1, 'rps', 'rpm');
      expect(r.value).toBeCloseTo(60, 4);
    });

    it('rad/s → rpm: 2*PI rad/s = 60 rpm', () => {
      const r = registry.convert(2 * Math.PI, 'rad_s', 'rpm');
      expect(r.value).toBeCloseTo(60, 2);
    });
  });

  // ── 应力 ──────────────────────────────────────────
  describe('应力 (标准: MPa)', () => {
    it('ksi → MPa: 1 ksi ≈ 6.8948 MPa', () => {
      const r = registry.convert(1, 'ksi', 'MPa_stress');
      expect(r.value).toBeCloseTo(6.8948, 2);
    });

    it('N/mm² → MPa: 1 N/mm² = 1 MPa', () => {
      const r = registry.convert(1, 'N_mm2', 'MPa_stress');
      expect(r.value).toBeCloseTo(1, 4);
    });
  });

  // ── 力 ──────────────────────────────────────────
  describe('力 (标准: N)', () => {
    it('kN → N: 1 kN = 1000 N', () => {
      const r = registry.convert(1, 'kN', 'N');
      expect(r.value).toBeCloseTo(1000, 4);
    });

    it('kgf → N: 1 kgf ≈ 9.80665 N', () => {
      const r = registry.convert(1, 'kgf', 'N');
      expect(r.value).toBeCloseTo(9.80665, 4);
    });
  });

  // ── 长度 ──────────────────────────────────────────
  describe('长度 (标准: mm)', () => {
    it('in → mm: 1 in = 25.4 mm', () => {
      const r = registry.convert(1, 'in', 'mm');
      expect(r.value).toBeCloseTo(25.4, 4);
    });

    it('m → mm: 1 m = 1000 mm', () => {
      const r = registry.convert(1, 'm', 'mm');
      expect(r.value).toBeCloseTo(1000, 4);
    });

    it('um → mm: 1000 um = 1 mm', () => {
      const r = registry.convert(1000, 'um', 'mm');
      expect(r.value).toBeCloseTo(1, 4);
    });
  });

  // ── 频率 ──────────────────────────────────────────
  describe('频率 (标准: Hz)', () => {
    it('kHz → Hz: 1 kHz = 1000 Hz', () => {
      const r = registry.convert(1, 'kHz', 'Hz_freq');
      expect(r.value).toBeCloseTo(1000, 4);
    });

    it('cpm → Hz: 60 cpm = 1 Hz', () => {
      const r = registry.convert(60, 'cpm', 'Hz_freq');
      expect(r.value).toBeCloseTo(1, 4);
    });
  });

  // ── 同单位换算 ──────────────────────────────────────
  it('同单位换算返回原值', () => {
    const r = registry.convert(42, 'degC', 'degC');
    expect(r.value).toBe(42);
    expect(r.factor).toBe(1);
    expect(r.offset).toBe(0);
    expect(r.isApproximate).toBe(false);
  });
});

// ============================================================================
// 2. 跨量纲近似换算
// ============================================================================

describe('跨量纲近似换算', () => {
  it('加速度(m/s²) → 速度(mm/s): v = a/(2*pi*f)*1000', () => {
    // 1 m/s² at 100Hz → v = 1/(2*pi*100)*1000 ≈ 1.592 mm/s
    const r = registry.convert(1, 'm_s2', 'mm_s_rms', { frequency: 100 });
    const expected = (1 / (2 * Math.PI * 100)) * 1000;
    expect(r.value).toBeCloseTo(expected, 2);
    expect(r.isApproximate).toBe(true);
  });

  it('速度(mm/s) → 加速度(m/s²): a = v*2*pi*f/1000', () => {
    const r = registry.convert(1.592, 'mm_s_rms', 'm_s2', { frequency: 100 });
    expect(r.value).toBeCloseTo(1, 1);
    expect(r.isApproximate).toBe(true);
  });

  it('速度(mm/s) → 位移(um pk)', () => {
    // 1 mm/s at 100Hz → d = 1/(2*pi*100)*1000 ≈ 1.592 um
    const r = registry.convert(1, 'mm_s_rms', 'um_pk', { frequency: 100 });
    const expected = (1 / (2 * Math.PI * 100)) * 1000;
    expect(r.value).toBeCloseTo(expected, 2);
    expect(r.isApproximate).toBe(true);
  });

  it('位移(um) → 速度(mm/s)', () => {
    const r = registry.convert(1.592, 'um_pk', 'mm_s_rms', { frequency: 100 });
    expect(r.value).toBeCloseTo(1, 1);
    expect(r.isApproximate).toBe(true);
  });

  it('跨量纲默认使用 100Hz 频率参数', () => {
    // 不传 params，应使用默认 100Hz
    const withDefault = registry.convert(1, 'm_s2', 'mm_s_rms');
    const withExplicit = registry.convert(1, 'm_s2', 'mm_s_rms', { frequency: 100 });
    expect(withDefault.value).toBeCloseTo(withExplicit.value, 6);
  });

  it('不支持的跨量纲换算抛出错误', () => {
    expect(() => registry.convert(1, 'degC', 'MPa'))
      .toThrow('不支持从');
  });
});

// ============================================================================
// 3. 批量换算
// ============================================================================

describe('批量换算 (convertBatch)', () => {
  it('同量纲批量换算结果一致', () => {
    const values = [0, 32, 100, 212, -40];
    const results = registry.convertBatch({ values, fromUnit: 'degF', toUnit: 'degC' });

    expect(results).toHaveLength(5);
    expect(results[0]).toBeCloseTo(-17.778, 2);  // 0°F
    expect(results[1]).toBeCloseTo(0, 4);          // 32°F
    expect(results[2]).toBeCloseTo(37.778, 2);    // 100°F
    expect(results[3]).toBeCloseTo(100, 4);        // 212°F
    expect(results[4]).toBeCloseTo(-40, 4);        // -40°F
  });

  it('同单位批量换算返回副本', () => {
    const values = [1, 2, 3];
    const results = registry.convertBatch({ values, fromUnit: 'degC', toUnit: 'degC' });
    expect(results).toEqual([1, 2, 3]);
    // 返回的是副本
    results[0] = 999;
    expect(values[0]).toBe(1);
  });

  it('跨量纲批量换算', () => {
    const values = [1, 2, 3];
    const results = registry.convertBatch({
      values,
      fromUnit: 'm_s2',
      toUnit: 'mm_s_rms',
      params: { frequency: 100 },
    });

    for (let i = 0; i < values.length; i++) {
      const single = registry.convert(values[i], 'm_s2', 'mm_s_rms', { frequency: 100 });
      expect(results[i]).toBeCloseTo(single.value, 6);
    }
  });

  it('未知单位抛出错误', () => {
    expect(() => registry.convertBatch({ values: [1], fromUnit: 'unknown', toUnit: 'degC' }))
      .toThrow('未知单位');
  });
});

// ============================================================================
// 4. 设备默认单位查询
// ============================================================================

describe('设备默认单位 (getDefaultUnit)', () => {
  it('HOIST 振动速度默认 mm_s_rms', () => {
    expect(registry.getDefaultUnit('HOIST.DRIVE.MOTOR', 'vibration_velocity'))
      .toBe('mm_s_rms');
  });

  it('HOIST 温度默认 degC', () => {
    expect(registry.getDefaultUnit('HOIST', 'temperature')).toBe('degC');
  });

  it('TROLLEY 电流默认 A', () => {
    expect(registry.getDefaultUnit('TROLLEY.TRAVEL.MOTOR', 'current')).toBe('A');
  });

  it('GANTRY 转速默认 rpm', () => {
    expect(registry.getDefaultUnit('GANTRY.MOTOR', 'rotational_speed')).toBe('rpm');
  });

  it('STRUCTURE 应力默认 MPa_stress', () => {
    expect(registry.getDefaultUnit('STRUCTURE.BEAM', 'stress')).toBe('MPa_stress');
  });

  it('未匹配设备使用物理量标准单位', () => {
    expect(registry.getDefaultUnit('UNKNOWN_DEVICE', 'temperature')).toBe('degC');
    expect(registry.getDefaultUnit('UNKNOWN_DEVICE', 'pressure')).toBe('MPa');
  });
});

// ============================================================================
// 5. 传感器单位覆盖
// ============================================================================

describe('传感器单位覆盖 (getSensorUnit)', () => {
  it('VT-01 使用 HOIST sensorOverride: mm_s_rms', () => {
    expect(registry.getSensorUnit('VT-01', 'HOIST', 'vibration_velocity'))
      .toBe('mm_s_rms');
  });

  it('VT-07 使用 TROLLEY sensorOverride: mm_s_rms', () => {
    expect(registry.getSensorUnit('VT-07', 'TROLLEY', 'vibration_velocity'))
      .toBe('mm_s_rms');
  });

  it('VT-12 使用 GANTRY sensorOverride: mm_s_rms', () => {
    expect(registry.getSensorUnit('VT-12', 'GANTRY', 'vibration_velocity'))
      .toBe('mm_s_rms');
  });

  it('未定义覆盖的传感器使用设备默认', () => {
    expect(registry.getSensorUnit('VT-99', 'HOIST', 'temperature')).toBe('degC');
  });

  it('未匹配设备使用标准单位', () => {
    expect(registry.getSensorUnit('VT-99', 'UNKNOWN', 'vibration_velocity'))
      .toBe('mm_s_rms');
  });
});

// ============================================================================
// 6. 物理合理性校验
// ============================================================================

describe('物理合理性校验', () => {
  it('正常温度范围内有效', () => {
    expect(registry.isPhysicallyValid(25, 'temperature')).toBe(true);
    expect(registry.isPhysicallyValid(-40, 'temperature')).toBe(true);
    expect(registry.isPhysicallyValid(300, 'temperature')).toBe(true);
  });

  it('超出温度范围无效', () => {
    expect(registry.isPhysicallyValid(-41, 'temperature')).toBe(false);
    expect(registry.isPhysicallyValid(301, 'temperature')).toBe(false);
  });

  it('振动速度不为负 (ADR-001)', () => {
    expect(registry.isPhysicallyValid(0, 'vibration_velocity')).toBe(true);
    expect(registry.isPhysicallyValid(45, 'vibration_velocity')).toBe(true);
    expect(registry.isPhysicallyValid(-1, 'vibration_velocity')).toBe(false);
  });

  it('振动速度上限 100 mm/s', () => {
    expect(registry.isPhysicallyValid(100, 'vibration_velocity')).toBe(true);
    expect(registry.isPhysicallyValid(101, 'vibration_velocity')).toBe(false);
  });

  it('电流范围 [0, 5000] A', () => {
    expect(registry.isPhysicallyValid(0, 'current')).toBe(true);
    expect(registry.isPhysicallyValid(5000, 'current')).toBe(true);
    expect(registry.isPhysicallyValid(-1, 'current')).toBe(false);
    expect(registry.isPhysicallyValid(5001, 'current')).toBe(false);
  });

  it('压力范围 [0, 100] MPa', () => {
    expect(registry.isPhysicallyValid(0, 'pressure')).toBe(true);
    expect(registry.isPhysicallyValid(100, 'pressure')).toBe(true);
    expect(registry.isPhysicallyValid(-1, 'pressure')).toBe(false);
  });

  it('转速范围 [0, 10000] rpm', () => {
    expect(registry.isPhysicallyValid(1500, 'rotational_speed')).toBe(true);
    expect(registry.isPhysicallyValid(-1, 'rotational_speed')).toBe(false);
  });

  it('应力允许负值 (压应力)', () => {
    expect(registry.isPhysicallyValid(-500, 'stress')).toBe(true);
    expect(registry.isPhysicallyValid(1000, 'stress')).toBe(true);
    expect(registry.isPhysicallyValid(-501, 'stress')).toBe(false);
  });

  it('getPhysicalRange 返回副本', () => {
    const range1 = registry.getPhysicalRange('temperature');
    const range2 = registry.getPhysicalRange('temperature');
    expect(range1).toEqual(range2);
    // 修改不影响原始
    range1.min = 999;
    expect(registry.getPhysicalRange('temperature').min).toBe(-40);
  });
});

// ============================================================================
// 7. conditionNormalizer 集成
// ============================================================================

describe('conditionNormalizer 集成', () => {
  describe('normalizeForCondition', () => {
    it('华氏度传感器自动转为摄氏度', () => {
      const ctx = registry.normalizeForCondition(212, 'degF', 'HOIST', 'temperature');
      expect(ctx.sourceUnit).toBe('degF');
      expect(ctx.targetUnit).toBe('degC');
      expect(ctx.convertedValue).toBeCloseTo(100, 4);
      expect(ctx.physicalRange.min).toBe(-40);
      expect(ctx.physicalRange.max).toBe(300);
    });

    it('g 加速度: HOIST 默认为 g, 所以 g→g 不换算', () => {
      const ctx = registry.normalizeForCondition(2, 'g', 'HOIST', 'vibration_acceleration');
      // HOIST profile 默认 vibration_acceleration 单位为 'g'，所以 g→g 无需换算
      expect(ctx.targetUnit).toBe('g');
      expect(ctx.convertedValue).toBeCloseTo(2, 4);
    });

    it('m/s² 加速度转为 g (HOIST 默认)', () => {
      const ctx = registry.normalizeForCondition(9.80665, 'm_s2', 'HOIST', 'vibration_acceleration');
      expect(ctx.targetUnit).toBe('g');
      expect(ctx.convertedValue).toBeCloseTo(1, 4);
    });
  });

  describe('normalizeDataSlice', () => {
    it('批量归一化多字段', () => {
      const slice = {
        vibrationSpeed: 1.0,    // in/s
        bearingTemp: 212,        // degF
        current: 500,            // mA
        motorSpeed: 25,          // Hz (转频)
      };
      const unitMap = {
        vibrationSpeed: 'in_s_rms',
        bearingTemp: 'degF',
        current: 'mA',
        motorSpeed: 'Hz',
      };

      const { normalized, conversions } = registry.normalizeDataSlice(slice, unitMap, 'HOIST');

      expect(normalized.vibrationSpeed).toBeCloseTo(25.4, 2);   // in/s → mm/s
      expect(normalized.bearingTemp).toBeCloseTo(100, 2);         // °F → °C
      expect(normalized.current).toBeCloseTo(0.5, 4);             // mA → A
      expect(normalized.motorSpeed).toBeCloseTo(1500, 2);         // Hz → rpm
      expect(conversions).toHaveLength(4);
    });

    it('未映射字段原样保留', () => {
      const slice = { unknownField: 42 };
      const { normalized } = registry.normalizeDataSlice(slice, {}, 'HOIST');
      expect(normalized.unknownField).toBe(42);
    });

    it('undefined/null/NaN 值跳过', () => {
      const slice = { vibrationSpeed: undefined, bearingTemp: NaN };
      const { normalized } = registry.normalizeDataSlice(
        slice as Record<string, number | undefined>,
        { vibrationSpeed: 'in_s_rms', bearingTemp: 'degF' },
        'HOIST',
      );
      expect(Object.keys(normalized)).toHaveLength(0);
    });
  });
});

// ============================================================================
// 8. toStandard
// ============================================================================

describe('toStandard', () => {
  it('degF → degC (标准温度单位)', () => {
    const r = registry.toStandard(212, 'degF');
    expect(r.value).toBeCloseTo(100, 4);
    expect(r.toUnit).toBe('degC');
  });

  it('g → m/s² (标准加速度单位)', () => {
    const r = registry.toStandard(1, 'g');
    expect(r.value).toBeCloseTo(9.80665, 4);
    expect(r.toUnit).toBe('m_s2');
  });

  it('psi → MPa (标准压力单位)', () => {
    const r = registry.toStandard(100, 'psi');
    expect(r.value).toBeCloseTo(0.6895, 2);
    expect(r.toUnit).toBe('MPa');
  });

  it('未知单位抛出错误', () => {
    expect(() => registry.toStandard(1, 'unknown')).toThrow('未知单位');
  });
});

// ============================================================================
// 9. 注册与查询
// ============================================================================

describe('注册与查询', () => {
  it('getUnit 查询已有单位', () => {
    const def = registry.getUnit('degC');
    expect(def).toBeDefined();
    expect(def!.symbol).toBe('℃');
    expect(def!.quantity).toBe('temperature');
  });

  it('getUnit 查询不存在的单位返回 undefined', () => {
    expect(registry.getUnit('nonexistent')).toBeUndefined();
  });

  it('listUnits 列出某量纲所有单位', () => {
    const tempUnits = registry.listUnits('temperature');
    expect(tempUnits.length).toBe(3); // degC, degF, K
    expect(tempUnits.map(u => u.id)).toContain('degC');
    expect(tempUnits.map(u => u.id)).toContain('degF');
    expect(tempUnits.map(u => u.id)).toContain('K');
  });

  it('getStandardUnit 返回标准单位 ID', () => {
    expect(registry.getStandardUnit('temperature')).toBe('degC');
    expect(registry.getStandardUnit('vibration_velocity')).toBe('mm_s_rms');
    expect(registry.getStandardUnit('pressure')).toBe('MPa');
  });

  it('registerUnit 注册自定义单位', () => {
    registry.registerUnit({
      id: 'custom_temp',
      name: '自定义温度',
      symbol: '°X',
      quantity: 'temperature',
      factor: 2,
      offset: -10,
    });

    const def = registry.getUnit('custom_temp');
    expect(def).toBeDefined();
    expect(def!.symbol).toBe('°X');

    // 换算: standard = value * 2 + (-10)
    const r = registry.convert(55, 'custom_temp', 'degC');
    expect(r.value).toBeCloseTo(100, 4); // 55*2 + (-10) = 100
  });

  it('registerProfile 注册设备配置', () => {
    registry.registerProfile({
      equipmentPattern: 'CUSTOM_DEVICE',
      defaults: {
        temperature: 'degF',
        pressure: 'psi',
      },
    });

    expect(registry.getDefaultUnit('CUSTOM_DEVICE.MOTOR', 'temperature')).toBe('degF');
    expect(registry.getDefaultUnit('CUSTOM_DEVICE.PUMP', 'pressure')).toBe('psi');
  });

  it('getProfiles 返回所有设备配置副本', () => {
    const profiles = registry.getProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(4); // HOIST, TROLLEY, GANTRY, STRUCTURE
    expect(profiles.map(p => p.equipmentPattern)).toContain('HOIST');
  });
});

// ============================================================================
// 10. 单例 / 工厂
// ============================================================================

describe('单例与工厂', () => {
  it('getUnitRegistry 返回同一实例', () => {
    resetUnitRegistry();
    const a = getUnitRegistry();
    const b = getUnitRegistry();
    expect(a).toBe(b);
  });

  it('resetUnitRegistry 重置后返回新实例', () => {
    const a = getUnitRegistry();
    resetUnitRegistry();
    const b = getUnitRegistry();
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// 11. 错误处理
// ============================================================================

describe('错误处理', () => {
  it('未知 fromUnit 抛出', () => {
    expect(() => registry.convert(1, 'x_y_z', 'degC')).toThrow('未知单位: x_y_z');
  });

  it('未知 toUnit 抛出', () => {
    expect(() => registry.convert(1, 'degC', 'x_y_z')).toThrow('未知单位: x_y_z');
  });

  it('不可换算的跨量纲抛出', () => {
    expect(() => registry.convert(1, 'degC', 'A')).toThrow('不支持从');
  });
});

// ============================================================================
// 12. 往返换算精度
// ============================================================================

describe('往返换算精度', () => {
  const testCases: Array<{ from: string; to: string; value: number }> = [
    { from: 'degC', to: 'degF', value: 37.5 },
    { from: 'degC', to: 'K', value: -10 },
    { from: 'MPa', to: 'psi', value: 10.5 },
    { from: 'mm_s_rms', to: 'in_s_rms', value: 5.0 },
    { from: 'g', to: 'm_s2', value: 2.5 },
    { from: 'rpm', to: 'rad_s', value: 1500 },
    { from: 'kN', to: 'N', value: 50 },
    { from: 'mm', to: 'in', value: 100 },
  ];

  for (const { from, to, value } of testCases) {
    it(`${from} → ${to} → ${from} 往返精度 (value=${value})`, () => {
      const forward = registry.convert(value, from, to);
      const back = registry.convert(forward.value, to, from);
      expect(back.value).toBeCloseTo(value, 6);
    });
  }
});
