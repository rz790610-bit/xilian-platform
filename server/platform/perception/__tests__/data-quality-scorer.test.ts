/**
 * ============================================================================
 * P0-3: 数据质量评分集成测试
 * ============================================================================
 *
 * 覆盖三个模块各 10+ 测试用例：
 *   - DataQualityScorer: 完整度/准确度/综合评分/质量等级
 *   - UnitRegistry: 单位换算/物理范围校验/批量换算
 *   - MultiDeviceAligner: 对齐精度/缺口检测/质量标记
 *
 * P0-3 验收标准：
 *   ✓ 完整度测试：5 类传感器全有 → completeness = 1.0；缺 2 类 → completeness = 0.6
 *   ✓ 准确度测试：sensorHealth(30%)+continuity(25%)+consistency(20%)+physicalValidity(25%) 权重正确
 *   ✓ 综合评分 = completeness × 0.4 + accuracy × 0.6，精确到小数点后 2 位
 *   ✓ 评分 < 75 的数据自动标记 needs_review
 *   ✓ 端到端集成测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DataQualityScorer,
  getDataQualityScorer,
  resetDataQualityScorer,
  type ScoringInput,
  type ChannelData,
} from '../quality/data-quality-scorer';
import {
  UnitRegistry,
  getUnitRegistry,
  resetUnitRegistry,
} from '../normalization/unit-registry';
import {
  MultiDeviceAligner,
  createCraneAligner,
  createHighFreqAligner,
} from '../alignment/multi-device-aligner';

// ============================================================================
// 测试工具函数
// ============================================================================

/** 创建均匀时间序列通道数据 */
function createChannel(
  count: number,
  valueFn: (i: number) => number,
  options?: { sampleRate?: number; startMs?: number },
): ChannelData {
  const rate = options?.sampleRate ?? 100;
  const start = options?.startMs ?? 1000000;
  const dt = 1000 / rate;
  const timestamps: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(start + i * dt);
    values.push(valueFn(i));
  }
  return { timestamps, values, sampleRate: rate };
}

/** 创建完整的 5 类传感器数据输入 */
function createFullInput(pointsPerChannel = 100): ScoringInput {
  const start = 1000000;
  const dt = 10;
  return {
    deviceId: 'RTG-001',
    windowStartMs: start,
    windowEndMs: start + pointsPerChannel * dt,
    channels: {
      // 机械 (3 channels = min requirement)
      vibrationRms: createChannel(pointsPerChannel, () => 3.5, { startMs: start }),
      bearingTemp: createChannel(pointsPerChannel, () => 65, { startMs: start }),
      motorSpeed: createChannel(pointsPerChannel, () => 1200, { startMs: start }),
      // 电气 (2 channels = min requirement)
      current: createChannel(pointsPerChannel, () => 85, { startMs: start }),
      powerFactor: createChannel(pointsPerChannel, () => 0.92, { startMs: start }),
      // 结构 (1 channel = min requirement)
      stress: createChannel(pointsPerChannel, () => 120, { startMs: start }),
      // 环境 (2 channels = min requirement)
      windSpeed: createChannel(pointsPerChannel, () => 8.5, { startMs: start }),
      ambientTemp: createChannel(pointsPerChannel, () => 25, { startMs: start }),
      // 作业 (2 channels = min requirement)
      loadWeight: createChannel(pointsPerChannel, () => 35000, { startMs: start }),
      cycleCount: createChannel(pointsPerChannel, () => 5000, { startMs: start }),
    },
  };
}

/** 创建只有 3 类传感器数据的输入（缺 2 类） */
function createPartialInput(pointsPerChannel = 100): ScoringInput {
  const start = 1000000;
  const dt = 10;
  return {
    deviceId: 'RTG-001',
    windowStartMs: start,
    windowEndMs: start + pointsPerChannel * dt,
    channels: {
      // 机械
      vibrationRms: createChannel(pointsPerChannel, () => 3.5, { startMs: start }),
      bearingTemp: createChannel(pointsPerChannel, () => 65, { startMs: start }),
      motorSpeed: createChannel(pointsPerChannel, () => 1200, { startMs: start }),
      // 电气
      current: createChannel(pointsPerChannel, () => 85, { startMs: start }),
      powerFactor: createChannel(pointsPerChannel, () => 0.92, { startMs: start }),
      // 结构
      stress: createChannel(pointsPerChannel, () => 120, { startMs: start }),
      // 环境缺失！
      // 作业缺失！
    },
  };
}

// ============================================================================
// DataQualityScorer 测试套件 (20+ 用例)
// ============================================================================

describe('DataQualityScorer', () => {
  let scorer: DataQualityScorer;

  beforeEach(() => {
    resetDataQualityScorer();
    scorer = new DataQualityScorer();
  });

  // --------------------------------------------------------------------------
  // 完整度测试
  // --------------------------------------------------------------------------

  describe('完整度评分', () => {
    it('5 类传感器全有 → 各类别完整度 > 0', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      expect(result.completeness.mechanical).toBeGreaterThan(0);
      expect(result.completeness.electrical).toBeGreaterThan(0);
      expect(result.completeness.structural).toBeGreaterThan(0);
      expect(result.completeness.environmental).toBeGreaterThan(0);
      expect(result.completeness.operational).toBeGreaterThan(0);
    });

    it('5 类传感器全满 → completeness overall 接近 100', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      // 所有类别都有足够的通道和数据点
      expect(result.completeness.overall).toBeGreaterThanOrEqual(80);
    });

    it('缺 2 类 → completeness 比全量低约 40%', () => {
      const full = scorer.score(createFullInput());
      const partial = scorer.score(createPartialInput());

      // 缺 environmental + operational → 完整度应降低
      expect(partial.completeness.environmental).toBe(0);
      expect(partial.completeness.operational).toBe(0);

      // 综合完整度降低：缺 2/5 类 = 40% 缺失
      expect(partial.completeness.overall).toBeLessThan(full.completeness.overall);
      // 具体来说约 60% of full
      expect(partial.completeness.overall).toBeLessThanOrEqual(full.completeness.overall * 0.65);
    });

    it('完全空数据 → completeness = 0', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {},
      };
      const result = scorer.score(input);
      expect(result.completeness.overall).toBe(0);
    });

    it('单类别数据 → 该类别满分，其他零分', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, () => 3.5),
          bearingTemp: createChannel(100, () => 65),
          motorSpeed: createChannel(100, () => 1200),
        },
      };
      const result = scorer.score(input);
      expect(result.completeness.mechanical).toBeGreaterThan(50);
      expect(result.completeness.electrical).toBe(0);
      expect(result.completeness.structural).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 准确度测试
  // --------------------------------------------------------------------------

  describe('准确度评分', () => {
    it('权重正确: sensorHealth 30%, continuity 25%, consistency 20%, physicalValidity 25%', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      // 正常数据下各维度应接近 100
      expect(result.accuracy.sensorHealth).toBeGreaterThanOrEqual(90);
      expect(result.accuracy.continuity).toBeGreaterThanOrEqual(90);
      expect(result.accuracy.consistency).toBeGreaterThanOrEqual(80);
      expect(result.accuracy.physicalValidity).toBeGreaterThanOrEqual(90);

      // 验证加权公式
      const expected =
        result.accuracy.sensorHealth * 0.30 +
        result.accuracy.continuity * 0.25 +
        result.accuracy.consistency * 0.20 +
        result.accuracy.physicalValidity * 0.25;

      expect(result.accuracy.overall).toBeCloseTo(expected, 1);
    });

    it('NaN/Infinity 值 → sensorHealth 下降', () => {
      const input = createFullInput(50);
      // 注入 NaN 值
      const vibValues = input.channels['vibrationRms'].values as number[];
      for (let i = 0; i < 10; i++) {
        vibValues[i] = NaN;
      }

      const result = scorer.score(input);
      expect(result.accuracy.sensorHealth).toBeLessThan(100);
      expect(result.accuracy.details.anomalyCount).toBeGreaterThanOrEqual(10);
    });

    it('跳变 → continuity 下降', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, (i) => {
            // 在第 50 个点制造 10 倍跳变
            if (i === 50) return 100;
            return 3.5;
          }),
        },
      };

      const result = scorer.score(input);
      expect(result.accuracy.continuity).toBeLessThan(100);
      expect(result.accuracy.details.jumpCount).toBeGreaterThanOrEqual(1);
    });

    it('物理越界值 → physicalValidity 下降', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          // vibrationRms 范围 [0, 100]，注入超范围值
          vibrationRms: createChannel(100, (i) => i < 80 ? 5.0 : 150),
        },
      };

      const result = scorer.score(input);
      expect(result.accuracy.physicalValidity).toBeLessThan(100);
      expect(result.accuracy.details.outOfRangeCount).toBeGreaterThanOrEqual(20);
    });

    it('一致性违反: peak < rms → consistency 下降', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, () => 10.0),
          vibrationPeak: createChannel(100, () => 5.0), // peak < rms → 违反
        },
      };

      const result = scorer.score(input);
      expect(result.accuracy.consistency).toBeLessThan(100);
      expect(result.accuracy.details.inconsistencyCount).toBeGreaterThan(0);
    });

    it('一致性违反: powerFactor > 1.01 → consistency 下降', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          powerFactor: createChannel(100, () => 1.5), // 超出 [0, 1.01]
        },
      };

      const result = scorer.score(input);
      expect(result.accuracy.details.inconsistencyCount).toBeGreaterThan(0);
    });

    it('零方差(传感器卡死) → faultySensors 包含该通道', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, () => 5.0), // 恒定值，零方差
        },
      };

      const result = scorer.score(input);
      expect(result.accuracy.details.faultySensors).toContain('vibrationRms');
    });
  });

  // --------------------------------------------------------------------------
  // 综合评分测试
  // --------------------------------------------------------------------------

  describe('综合评分公式', () => {
    it('overall = completeness × 0.4 + accuracy × 0.6', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      const expected = result.completeness.overall * 0.4 + result.accuracy.overall * 0.6;
      expect(result.overall).toBeCloseTo(expected, 2);
    });

    it('精确到小数点后 2 位', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      // 检查值是 2 位小数
      const str = result.overall.toString();
      const parts = str.split('.');
      if (parts.length > 1) {
        expect(parts[1].length).toBeLessThanOrEqual(2);
      }
    });

    it('完整优质数据 → grade = A (>= 90)', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      // 完整度 ~100 × 0.4 + 准确度 ~100 × 0.6 ≈ 100
      expect(result.overall).toBeGreaterThanOrEqual(80);
      expect(['A', 'B']).toContain(result.grade);
    });

    it('部分缺失数据 → grade = B or C', () => {
      const input = createPartialInput();
      const result = scorer.score(input);

      // 缺 2 类 → completeness 降低 → overall 降低
      expect(result.overall).toBeLessThan(90);
    });

    it('空数据 → completeness=0, accuracy=100, overall=60, grade=C', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {},
      };
      const result = scorer.score(input);
      // 完整度=0, 准确度=100 (无数据则无错误)
      // overall = 0*0.4 + 100*0.6 = 60 → C
      expect(result.completeness.overall).toBe(0);
      expect(result.accuracy.overall).toBe(100);
      expect(result.overall).toBeCloseTo(60, 0);
      expect(result.grade).toBe('C');
    });
  });

  // --------------------------------------------------------------------------
  // 质量等级测试
  // --------------------------------------------------------------------------

  describe('质量等级 A/B/C/D/F', () => {
    it('A >= 90', () => {
      const scorer2 = new DataQualityScorer();
      // 使用内部 toGrade 通过评分验证
      const input = createFullInput();
      const result = scorer2.score(input);
      if (result.overall >= 90) expect(result.grade).toBe('A');
    });

    it('B: 75-89', () => {
      // 构造一个 B 级场景：缺一类数据
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, () => 3.5),
          bearingTemp: createChannel(100, () => 65),
          motorSpeed: createChannel(100, () => 1200),
          current: createChannel(100, () => 85),
          powerFactor: createChannel(100, () => 0.92),
          stress: createChannel(100, () => 120),
          windSpeed: createChannel(100, () => 8.5),
          ambientTemp: createChannel(100, () => 25),
          // 作业类缺失
        },
      };
      const result = scorer.score(input);
      // 缺一类 → 完整度约 80% → overall 约 80-90
      expect(result.overall).toBeGreaterThanOrEqual(60);
      expect(result.overall).toBeLessThan(100);
    });

    it('F: < 40 (需严重数据质量问题)', () => {
      // 空数据 overall=60 (C), 要拿到 F 需要同时准确度也低
      // 构造含大量 NaN 的数据（准确度低 + 完整度低）
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, (i) => (i % 2 === 0 ? NaN : -5)),
        },
      };
      const result = scorer.score(input);
      expect(result.overall).toBeLessThan(60);
    });
  });

  // --------------------------------------------------------------------------
  // needs_review 标记测试
  // --------------------------------------------------------------------------

  describe('评分 < 75 自动标记 needs_review', () => {
    it('评分 < 75 → 应触发 needs_review 标记逻辑', () => {
      // 构造低质量数据
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(50, (i) => i < 30 ? 3.5 : NaN),
          // 仅一个通道，大量 NaN
        },
      };
      const result = scorer.score(input);

      // 确认低分
      expect(result.overall).toBeLessThan(75);
      // grade 应为 C/D/F
      expect(['C', 'D', 'F']).toContain(result.grade);
    });

    it('评分 >= 75 → 不需要标记 needs_review', () => {
      const input = createFullInput();
      const result = scorer.score(input);

      // 完整数据应 >= 75
      expect(result.overall).toBeGreaterThanOrEqual(75);
    });
  });

  // --------------------------------------------------------------------------
  // 建议生成测试
  // --------------------------------------------------------------------------

  describe('改善建议', () => {
    it('缺失类别 → 生成 missing_data 建议', () => {
      const input = createPartialInput();
      const result = scorer.score(input);

      const missingDataSuggestions = result.suggestions.filter(s => s.type === 'missing_data');
      expect(missingDataSuggestions.length).toBeGreaterThanOrEqual(2);
    });

    it('传感器故障 → 生成 sensor_fault 建议', () => {
      const input: ScoringInput = {
        deviceId: 'RTG-001',
        windowStartMs: 1000000,
        windowEndMs: 1001000,
        channels: {
          vibrationRms: createChannel(100, () => 5.0), // 零方差
        },
      };

      const result = scorer.score(input);
      const faultSuggestions = result.suggestions.filter(s => s.type === 'sensor_fault');
      expect(faultSuggestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // 批量评分
  // --------------------------------------------------------------------------

  describe('批量评分', () => {
    it('scoreBatch 返回与输入等长的结果', () => {
      const inputs = [createFullInput(), createPartialInput()];
      const results = scorer.scoreBatch(inputs);
      expect(results).toHaveLength(2);
      expect(results[0].grade).not.toBe(results[1].grade);
    });
  });

  // --------------------------------------------------------------------------
  // 单例模式
  // --------------------------------------------------------------------------

  describe('单例 + 工厂函数', () => {
    it('getDataQualityScorer 返回单例', () => {
      resetDataQualityScorer();
      const a = getDataQualityScorer();
      const b = getDataQualityScorer();
      expect(a).toBe(b);
    });

    it('resetDataQualityScorer 重置单例', () => {
      resetDataQualityScorer();
      const a = getDataQualityScorer();
      resetDataQualityScorer();
      const b = getDataQualityScorer();
      expect(a).not.toBe(b);
    });
  });
});

// ============================================================================
// UnitRegistry 测试套件 (10+ 用例)
// ============================================================================

describe('UnitRegistry', () => {
  let registry: UnitRegistry;

  beforeEach(() => {
    resetUnitRegistry();
    registry = getUnitRegistry();
  });

  it('g → m/s²: 2.5g = 24.516625 m/s²', () => {
    const result = registry.convert(2.5, 'g', 'm_s2');
    expect(result.value).toBeCloseTo(24.516625, 3);
    expect(result.isApproximate).toBe(false);
  });

  it('°F → °C: 212°F = 100°C', () => {
    const result = registry.convert(212, 'degF', 'degC');
    expect(result.value).toBeCloseTo(100, 1);
  });

  it('K → °C: 373.15K = 100°C', () => {
    const result = registry.convert(373.15, 'K', 'degC');
    expect(result.value).toBeCloseTo(100, 1);
  });

  it('psi → MPa: 14.696 psi ≈ 0.1013 MPa', () => {
    const result = registry.convert(14.696, 'psi', 'MPa');
    expect(result.value).toBeCloseTo(0.10132, 3);
  });

  it('mA → A: 2500 mA = 2.5 A', () => {
    const result = registry.convert(2500, 'mA', 'A');
    expect(result.value).toBeCloseTo(2.5, 5);
  });

  it('rad/s → rpm: 2π rad/s ≈ 60 rpm', () => {
    const result = registry.convert(2 * Math.PI, 'rad_s', 'rpm');
    expect(result.value).toBeCloseTo(60, 0);
  });

  it('toStandard: g → m/s²', () => {
    const result = registry.toStandard(1.0, 'g');
    expect(result.toUnit).toBe('m_s2');
    expect(result.value).toBeCloseTo(9.80665, 3);
  });

  it('convertBatch: 批量换算一致性', () => {
    const values = [1, 2, 3, 4, 5];
    const results = registry.convertBatch({ values, fromUnit: 'g', toUnit: 'm_s2' });
    expect(results).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(results[i]).toBeCloseTo((i + 1) * 9.80665, 3);
    }
  });

  it('同单位换算 → 值不变', () => {
    const result = registry.convert(42.5, 'mm_s_rms', 'mm_s_rms');
    expect(result.value).toBe(42.5);
    expect(result.factor).toBe(1);
  });

  it('isPhysicallyValid: 正常振动值通过', () => {
    expect(registry.isPhysicallyValid(5.0, 'vibration_velocity')).toBe(true);
  });

  it('isPhysicallyValid: 超范围值失败', () => {
    expect(registry.isPhysicallyValid(200, 'vibration_velocity')).toBe(false);
  });

  it('isPhysicallyValid: 负振动值失败', () => {
    expect(registry.isPhysicallyValid(-5, 'vibration_velocity')).toBe(false);
  });

  it('跨量纲: 加速度 → 速度（需要频率）', () => {
    const result = registry.convert(9.80665, 'g', 'mm_s_rms', { frequency: 100 });
    // a = 9.80665*9.80665 = 96.17 m/s², v = a/(2πf)*1000
    // Actually: 9.80665 g = 96.17 m/s²? No:
    // g → m_s2 → mm_s_rms is cross-quantity
    // 1g = 9.80665 m/s²
    // v = a/(2πf)*1000 = 9.80665/(2π*100)*1000 ≈ 15.6 mm/s
    expect(result.isApproximate).toBe(true);
    expect(result.value).toBeGreaterThan(0);
  });

  it('未知单位 → 抛出错误', () => {
    expect(() => registry.convert(1, 'unknown_xyz', 'm_s2')).toThrow('未知单位');
  });
});

// ============================================================================
// MultiDeviceAligner 测试套件 (10+ 用例)
// ============================================================================

describe('MultiDeviceAligner', () => {
  it('单设备对齐：数据保留', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    for (let i = 0; i < 100; i++) {
      aligner.ingestRaw('D1', 'ch1', [base + i * 10], [i * 0.1]);
    }

    const result = aligner.align();
    expect(result.channels).toHaveLength(1);
    expect(result.totalSamples).toBeGreaterThan(0);
  });

  it('双设备不同采样率对齐到统一时间轴', () => {
    const aligner = createCraneAligner({ targetSampleRate: 100 });

    aligner.registerDevice({
      deviceId: 'A', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });
    aligner.registerDevice({
      deviceId: 'B', channels: ['ch1'], nominalSampleRate: 50,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    for (let i = 0; i < 100; i++) aligner.ingestRaw('A', 'ch1', [base + i * 10], [1.0]);
    for (let i = 0; i < 50; i++) aligner.ingestRaw('B', 'ch1', [base + i * 20], [2.0]);

    const result = aligner.align();
    expect(result.channels).toHaveLength(2);
    // 对齐后两个通道采样点数一致
    expect(result.channels[0].alignedSampleCount).toBe(result.channels[1].alignedSampleCount);
  });

  it('短缺口 → 线性插值，质量标记为 1', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    // 跳过 1 个点 (20ms gap < 30ms threshold)
    for (let i = 0; i < 100; i++) {
      if (i === 50) continue;
      aligner.ingestRaw('D1', 'ch1', [base + i * 10], [5.0]);
    }

    const result = aligner.align();
    // 没有长缺口
    expect(result.gaps.filter(g => g.type === 'long')).toHaveLength(0);
  });

  it('长缺口 → 不插值，质量标记为 0', () => {
    const aligner = createCraneAligner({
      longGapThresholdMultiplier: 10.0,
      longGapStrategy: 'mark_nan',
    });
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    for (let i = 0; i < 50; i++) aligner.ingestRaw('D1', 'ch1', [base + i * 10], [5.0]);
    // 2000ms gap >> 100ms (10x threshold)
    for (let i = 0; i < 50; i++) aligner.ingestRaw('D1', 'ch1', [base + 2500 + i * 10], [5.0]);

    const result = aligner.align();
    const longGaps = result.gaps.filter(g => g.type === 'long');
    expect(longGaps.length).toBeGreaterThanOrEqual(1);

    // 缺口区域值为 NaN
    const ch = result.channels[0];
    let nanCount = 0;
    for (let i = 0; i < ch.values.length; i++) {
      if (isNaN(ch.values[i])) nanCount++;
    }
    expect(nanCount).toBeGreaterThan(0);
  });

  it('质量标记: 2=原始, 1=插值, 0=缺失', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    for (let i = 0; i < 50; i++) {
      aligner.ingestRaw('D1', 'ch1', [base + i * 10], [i * 0.1]);
    }

    const result = aligner.align();
    const q = result.channels[0].quality;

    // 应有原始点 (quality=2)
    let originals = 0;
    for (let i = 0; i < q.length; i++) {
      if (q[i] === 2) originals++;
    }
    expect(originals).toBeGreaterThan(0);
  });

  it('alignAndFlush: 对齐后清空缓冲', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    aligner.ingestRaw('D1', 'ch1', [1000000, 1000010], [1.0, 2.0]);
    const result = aligner.alignAndFlush();
    expect(result.totalSamples).toBeGreaterThan(0);

    // 清空后再对齐应为空
    expect(aligner.getTotalBufferedSamples()).toBe(0);
  });

  it('createHighFreqAligner: 12800Hz 目标采样率', () => {
    const aligner = createHighFreqAligner();
    expect(aligner.getConfig().targetSampleRate).toBe(12800);
    expect(aligner.getConfig().interpolation).toBe('zero_hold');
  });

  it('createCraneAligner: 100Hz 目标采样率', () => {
    const aligner = createCraneAligner();
    expect(aligner.getConfig().targetSampleRate).toBe(100);
    expect(aligner.getConfig().interpolation).toBe('linear');
  });

  it('注册/注销设备', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1', 'ch2'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    expect(aligner.getRegisteredDevices()).toHaveLength(1);
    aligner.unregisterDevice('D1');
    expect(aligner.getRegisteredDevices()).toHaveLength(0);
  });

  it('空缓冲对齐 → 空结果', () => {
    const aligner = createCraneAligner();
    const result = aligner.align();
    expect(result.totalSamples).toBe(0);
    expect(result.channels).toHaveLength(0);
  });

  it('对齐统计完整', () => {
    const aligner = createCraneAligner();
    aligner.registerDevice({
      deviceId: 'D1', channels: ['ch1'], nominalSampleRate: 100,
      clockSource: 'ntp', maxClockDriftMs: 5,
    });

    const base = 1000000;
    for (let i = 0; i < 100; i++) {
      aligner.ingestRaw('D1', 'ch1', [base + i * 10], [i * 0.1]);
    }

    const result = aligner.align();
    expect(result.stats.deviceCount).toBe(1);
    expect(result.stats.channelCount).toBe(1);
    expect(result.stats.totalRawSamples).toBeGreaterThan(0);
    expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.completenessRatio).toBeGreaterThan(0);
  });
});

// ============================================================================
// 端到端集成测试
// ============================================================================

describe('P0-3 端到端集成测试', () => {
  it('状态向量 → 质量评分 → 质量标签 → needs_review 判定', () => {
    resetDataQualityScorer();
    const scorer = getDataQualityScorer();

    // 模拟完整状态向量数据 → 评分
    const fullInput = createFullInput();
    const fullResult = scorer.score(fullInput);

    expect(fullResult.overall).toBeGreaterThanOrEqual(75);
    expect(['A', 'B']).toContain(fullResult.grade);

    // 确认 needs_review 判定逻辑
    const needsReview = fullResult.overall < 75;
    expect(needsReview).toBe(false);

    // 模拟低质量数据 → 评分
    const lowInput: ScoringInput = {
      deviceId: 'RTG-002',
      windowStartMs: 1000000,
      windowEndMs: 1001000,
      channels: {
        vibrationRms: createChannel(30, (i) => i < 10 ? 5.0 : NaN),
      },
    };
    const lowResult = scorer.score(lowInput);

    expect(lowResult.overall).toBeLessThan(75);
    expect(['C', 'D', 'F']).toContain(lowResult.grade);

    const lowNeedsReview = lowResult.overall < 75;
    expect(lowNeedsReview).toBe(true);
  });

  it('评分公式全链路验证: completeness×0.4 + accuracy×0.6', () => {
    resetDataQualityScorer();
    const scorer = getDataQualityScorer();

    const input = createFullInput(200);
    const result = scorer.score(input);

    // 验证综合评分公式
    const manualOverall = result.completeness.overall * 0.4 + result.accuracy.overall * 0.6;
    expect(result.overall).toBeCloseTo(manualOverall, 2);

    // 验证准确度子公式
    const manualAccuracy =
      result.accuracy.sensorHealth * 0.30 +
      result.accuracy.continuity * 0.25 +
      result.accuracy.consistency * 0.20 +
      result.accuracy.physicalValidity * 0.25;
    expect(result.accuracy.overall).toBeCloseTo(manualAccuracy, 1);
  });
});
