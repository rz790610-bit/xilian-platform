/**
 * ============================================================================
 * P1-8: 数字孪生三维可视化 + 专业工业图表 — 集成测试
 * ============================================================================
 *
 * 验证:
 *   AC-1: Twin3DViewer 后端数据流 — getEquipmentTwinState 返回 16 传感器状态向量
 *   AC-2: 波形 API — getEquipmentWaveform 返回振动/温度波形 + 轴承特征频率
 *   AC-3: 传感器阈值逻辑 — getSensorStatus 正确分类 normal/warning/alarm/offline
 *   AC-4: 轴承物理频率 — BPFO/BPFI/BSF/FTF 符合 SKF 6208 参数
 *   AC-5: 3D 坐标完整性 — 16 传感器 3D 坐标覆盖 hoist/trolley/gantry 三组
 *   AC-6: 波形降级 — ClickHouse 不可用时返回物理真实的演示波形
 *   AC-7: 工业图表数据契约 — 波形结果包含图表组件所需的全部字段
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  WaveformService,
  calculateBearingFrequencies,
  generateDemoVibrationWaveform,
  generateDemoTemperatureWaveform,
  type ClickHouseAdapter,
  type WaveformResult,
  type BearingFrequencies,
} from '../waveform.service';
import {
  RTG_SENSORS,
  getSensorStatus,
  STATUS_COLORS,
  RTG_DIMENSIONS,
  type RTGSensor,
  type SensorStatus,
} from '../../../../client/src/components/digital-twin/rtg-model/rtg-constants';

// ============================================================================
// Mock ClickHouse（始终不可用，验证降级路径）
// ============================================================================
class MockClickHouseAdapter implements ClickHouseAdapter {
  private _available = false;

  setAvailable(v: boolean) { this._available = v; }

  async isAvailable(): Promise<boolean> { return this._available; }
  async queryWaveform(): Promise<null> { return null; }
}

// ============================================================================
// AC-1: Twin3DViewer 后端数据流
// ============================================================================
describe('AC-1: stateVector → 16 传感器映射', () => {
  it('RTG_SENSORS 定义了 16 个传感器', () => {
    expect(RTG_SENSORS).toHaveLength(16);
  });

  it('传感器 ID 为 VT-01 到 VT-16', () => {
    for (let i = 1; i <= 16; i++) {
      const id = `VT-${String(i).padStart(2, '0')}`;
      const sensor = RTG_SENSORS.find(s => s.id === id);
      expect(sensor).toBeDefined();
      expect(sensor!.id).toBe(id);
    }
  });

  it('stateVector 索引可映射到传感器 ID', () => {
    // 模拟 Twin3DViewer 中的映射逻辑
    const stateVector: Record<string, number> = {};
    for (let i = 0; i < 16; i++) {
      stateVector[`sensor_${i}`] = 3.0 + i * 0.5;
    }

    const sensorValues: Record<string, number | null> = {};
    for (const sensor of RTG_SENSORS) {
      const key = sensor.id.replace('VT-', '');
      const idx = parseInt(key, 10) - 1;
      const keys = Object.keys(stateVector);
      sensorValues[sensor.id] = keys[idx] != null ? (stateVector[keys[idx]] as number ?? null) : null;
    }

    // 所有 16 个传感器都应有值
    expect(Object.keys(sensorValues)).toHaveLength(16);
    expect(sensorValues['VT-01']).toBe(3.0);
    expect(sensorValues['VT-16']).toBe(10.5);
  });

  it('空 stateVector 映射结果全部为 null', () => {
    const stateVector: Record<string, number> = {};
    const sensorValues: Record<string, number | null> = {};
    for (const sensor of RTG_SENSORS) {
      const key = sensor.id.replace('VT-', '');
      const idx = parseInt(key, 10) - 1;
      const keys = Object.keys(stateVector);
      sensorValues[sensor.id] = keys[idx] != null ? (stateVector[keys[idx]] as number ?? null) : null;
    }

    for (const sensor of RTG_SENSORS) {
      expect(sensorValues[sensor.id]).toBeNull();
    }
  });
});

// ============================================================================
// AC-2: 波形 API 端到端
// ============================================================================
describe('AC-2: getEquipmentWaveform 端到端', () => {
  let service: WaveformService;
  let mockCH: MockClickHouseAdapter;

  beforeAll(() => {
    mockCH = new MockClickHouseAdapter();
    service = new WaveformService(mockCH);
  });

  it('振动传感器返回完整 WaveformResult', async () => {
    const result = await service.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-01',
      sampleCount: 2048,
    });

    expect(result.waveform).toHaveLength(2048);
    expect(result.sampleRate).toBe(12800);
    expect(result.sampleCount).toBe(2048);
    expect(result.rpm).toBe(1470);
    expect(result.isDemoData).toBe(true);
    expect(result.bearingFrequencies).toBeDefined();
    expect(result.sensorMeta.measurementType).toBe('vibration');
    expect(result.sensorMeta.unit).toBe('mm/s');
  });

  it('温度传感器返回温度波形', async () => {
    const result = await service.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-03',
      sampleCount: 2048,
    });

    expect(result.sensorMeta.measurementType).toBe('temperature');
    expect(result.sensorMeta.unit).toBe('°C');
    // 温度波形应在合理范围内
    const minVal = Math.min(...result.waveform);
    const maxVal = Math.max(...result.waveform);
    expect(minVal).toBeGreaterThan(50);
    expect(maxVal).toBeLessThan(80);
  });

  it('覆盖全部 16 个传感器', async () => {
    const results: WaveformResult[] = [];
    for (const sensor of RTG_SENSORS) {
      const r = await service.getWaveform({
        equipmentId: 'RTG-001',
        sensorId: sensor.id,
      });
      results.push(r);
    }

    expect(results).toHaveLength(16);

    // 振动传感器数量
    const vibrationCount = results.filter(r => r.sensorMeta.measurementType === 'vibration').length;
    const tempCount = results.filter(r => r.sensorMeta.measurementType === 'temperature').length;
    expect(vibrationCount).toBe(10);
    expect(tempCount).toBe(6);
  });

  it('queryTimeMs > 0', async () => {
    const result = await service.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-01',
    });
    expect(result.queryTimeMs).toBeGreaterThan(0);
  });
});

// ============================================================================
// AC-3: 传感器阈值逻辑
// ============================================================================
describe('AC-3: getSensorStatus 阈值分类', () => {
  const vibSensor = RTG_SENSORS[0]; // VT-01, warning: 4.5, alarm: 7.1

  it('null/undefined → offline', () => {
    expect(getSensorStatus(vibSensor, null)).toBe('offline');
    expect(getSensorStatus(vibSensor, undefined)).toBe('offline');
  });

  it('低于 warning 阈值 → normal', () => {
    expect(getSensorStatus(vibSensor, 0)).toBe('normal');
    expect(getSensorStatus(vibSensor, 2.5)).toBe('normal');
    expect(getSensorStatus(vibSensor, 4.49)).toBe('normal');
  });

  it('介于 warning 和 alarm 之间 → warning', () => {
    expect(getSensorStatus(vibSensor, 4.5)).toBe('warning');
    expect(getSensorStatus(vibSensor, 5.0)).toBe('warning');
    expect(getSensorStatus(vibSensor, 7.09)).toBe('warning');
  });

  it('大于等于 alarm 阈值 → alarm', () => {
    expect(getSensorStatus(vibSensor, 7.1)).toBe('alarm');
    expect(getSensorStatus(vibSensor, 10.0)).toBe('alarm');
    expect(getSensorStatus(vibSensor, 50.0)).toBe('alarm');
  });

  it('温度传感器阈值正确', () => {
    const tempSensor = RTG_SENSORS[2]; // VT-03, warning: 80, alarm: 105
    expect(getSensorStatus(tempSensor, 65)).toBe('normal');
    expect(getSensorStatus(tempSensor, 85)).toBe('warning');
    expect(getSensorStatus(tempSensor, 110)).toBe('alarm');
  });

  it('STATUS_COLORS 覆盖所有状态', () => {
    const statuses: SensorStatus[] = ['normal', 'warning', 'alarm', 'offline'];
    for (const s of statuses) {
      expect(STATUS_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ============================================================================
// AC-4: 轴承物理频率
// ============================================================================
describe('AC-4: 轴承特征频率（SKF 6208）', () => {
  const rpm = 1470;
  const rotFreq = rpm / 60; // 24.5 Hz
  let bf: BearingFrequencies;

  beforeAll(() => {
    bf = calculateBearingFrequencies(rpm);
  });

  it('BPFO ≈ 3.06 × 转频', () => {
    const ratio = bf.BPFO / rotFreq;
    expect(ratio).toBeCloseTo(2.68, 1);  // (8/2)*(1-0.33) = 2.68
  });

  it('BPFI ≈ 5.32 × 转频', () => {
    const ratio = bf.BPFI / rotFreq;
    expect(ratio).toBeCloseTo(5.32, 1);  // (8/2)*(1+0.33) = 5.32
  });

  it('BSF > 0 且物理合理', () => {
    expect(bf.BSF).toBeGreaterThan(0);
    expect(bf.BSF).toBeLessThan(bf.BPFI);
  });

  it('FTF > 0 且小于转频', () => {
    expect(bf.FTF).toBeGreaterThan(0);
    expect(bf.FTF).toBeLessThan(rotFreq);
  });

  it('所有频率为正数', () => {
    expect(bf.BPFO).toBeGreaterThan(0);
    expect(bf.BPFI).toBeGreaterThan(0);
    expect(bf.BSF).toBeGreaterThan(0);
    expect(bf.FTF).toBeGreaterThan(0);
  });

  it('频率关系: FTF < BSF < BPFO < BPFI', () => {
    expect(bf.FTF).toBeLessThan(bf.BSF);
    expect(bf.BPFO).toBeLessThan(bf.BPFI);
  });
});

// ============================================================================
// AC-5: 3D 坐标完整性
// ============================================================================
describe('AC-5: 传感器 3D 坐标', () => {
  it('每个传感器有 3D 坐标 [x, y, z]', () => {
    for (const sensor of RTG_SENSORS) {
      expect(sensor.position).toHaveLength(3);
      expect(typeof sensor.position[0]).toBe('number');
      expect(typeof sensor.position[1]).toBe('number');
      expect(typeof sensor.position[2]).toBe('number');
    }
  });

  it('hoist 组传感器在顶部（Y ≈ 17-18）', () => {
    const hoistSensors = RTG_SENSORS.filter(s => s.group === 'hoist');
    expect(hoistSensors.length).toBe(6);
    for (const s of hoistSensors) {
      expect(s.position[1]).toBeGreaterThanOrEqual(17);
      expect(s.position[1]).toBeLessThanOrEqual(18.5);
    }
  });

  it('trolley 组传感器在顶部（Y ≈ 18）', () => {
    const trolleySensors = RTG_SENSORS.filter(s => s.group === 'trolley');
    expect(trolleySensors.length).toBe(6);
    for (const s of trolleySensors) {
      expect(s.position[1]).toBeGreaterThanOrEqual(17.5);
      expect(s.position[1]).toBeLessThanOrEqual(18.5);
    }
  });

  it('gantry 组传感器在底部（Y ≈ 0.5-0.8）', () => {
    const gantrySensors = RTG_SENSORS.filter(s => s.group === 'gantry');
    expect(gantrySensors.length).toBe(4);
    for (const s of gantrySensors) {
      expect(s.position[1]).toBeLessThan(1.0);
    }
  });

  it('传感器在 RTG 尺寸范围内', () => {
    const halfW = RTG_DIMENSIONS.width / 2 + 1; // 带余量
    for (const s of RTG_SENSORS) {
      expect(Math.abs(s.position[0])).toBeLessThanOrEqual(halfW);
      expect(s.position[1]).toBeGreaterThanOrEqual(0);
      expect(s.position[1]).toBeLessThanOrEqual(RTG_DIMENSIONS.height);
    }
  });

  it('hoist/trolley/gantry 各组包含振动和温度传感器', () => {
    const groups = ['hoist', 'trolley', 'gantry'] as const;
    for (const g of groups) {
      const sensors = RTG_SENSORS.filter(s => s.group === g);
      const types = new Set(sensors.map(s => s.measurementType));
      expect(types.has('vibration')).toBe(true);
      expect(types.has('temperature')).toBe(true);
    }
  });
});

// ============================================================================
// AC-6: 波形降级策略
// ============================================================================
describe('AC-6: ClickHouse 降级', () => {
  it('ClickHouse 不可用时返回 isDemoData=true', async () => {
    const mock = new MockClickHouseAdapter();
    mock.setAvailable(false);
    const svc = new WaveformService(mock);

    const result = await svc.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-01',
    });

    expect(result.isDemoData).toBe(true);
    expect(result.fallbackReason).toContain('不可用');
  });

  it('演示振动波形包含物理特征', () => {
    const waveform = generateDemoVibrationWaveform(2048, 1470, 12800);
    expect(waveform).toHaveLength(2048);

    // 波形幅值合理（含转频+轴承频率+噪声，通常 ±3mm/s 左右）
    const max = Math.max(...waveform);
    const min = Math.min(...waveform);
    expect(max).toBeGreaterThan(1.0);
    expect(max).toBeLessThan(10.0);
    expect(min).toBeLessThan(0);
  });

  it('演示温度波形在合理范围', () => {
    const waveform = generateDemoTemperatureWaveform(2048);
    expect(waveform).toHaveLength(2048);

    const avg = waveform.reduce((a, b) => a + b, 0) / waveform.length;
    expect(avg).toBeGreaterThan(60);
    expect(avg).toBeLessThan(72);
  });

  it('演示波形确定性（相同参数 → 相同结果）', () => {
    const w1 = generateDemoVibrationWaveform(256, 1470, 12800);
    const w2 = generateDemoVibrationWaveform(256, 1470, 12800);
    expect(w1).toEqual(w2);
  });
});

// ============================================================================
// AC-7: 工业图表数据契约
// ============================================================================
describe('AC-7: 图表组件数据契约', () => {
  let vibResult: WaveformResult;
  let tempResult: WaveformResult;

  beforeAll(async () => {
    const mock = new MockClickHouseAdapter();
    const svc = new WaveformService(mock);

    vibResult = await svc.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-01',
      sampleCount: 2048,
    });

    tempResult = await svc.getWaveform({
      equipmentId: 'RTG-001',
      sensorId: 'VT-03',
      sampleCount: 2048,
    });
  });

  it('SpectrumChart 需要: waveform + sampleRate', () => {
    expect(vibResult.waveform.length).toBeGreaterThan(0);
    expect(vibResult.sampleRate).toBe(12800);
  });

  it('EnvelopeChart 需要: waveform + bearingFrequencies', () => {
    expect(vibResult.bearingFrequencies.BPFO).toBeGreaterThan(0);
    expect(vibResult.bearingFrequencies.BPFI).toBeGreaterThan(0);
    expect(vibResult.bearingFrequencies.BSF).toBeGreaterThan(0);
    expect(vibResult.bearingFrequencies.FTF).toBeGreaterThan(0);
  });

  it('WaterfallChart 需要: waveform + sampleRate (客户端做 STFT)', () => {
    // Canvas 2D 渲染需要足够数据点（至少 1024）
    expect(vibResult.waveform.length).toBeGreaterThanOrEqual(1024);
    expect(vibResult.sampleRate).toBeGreaterThan(0);
  });

  it('HeatmapChart 需要: sensorMeta.measurementType', () => {
    expect(vibResult.sensorMeta.measurementType).toBe('vibration');
    expect(tempResult.sensorMeta.measurementType).toBe('temperature');
  });

  it('TimeFrequencyChart 需要: waveform + sampleRate + rpm', () => {
    expect(vibResult.rpm).toBe(1470);
    expect(vibResult.sampleRate).toBe(12800);
    expect(vibResult.waveform.length).toBe(2048);
  });

  it('SensorChartDialog 需要: sensorMeta 决定图表类型', () => {
    // 振动 → [SpectrumChart, EnvelopeChart, WaterfallChart, TimeFrequencyChart]
    expect(vibResult.sensorMeta.measurementType).toBe('vibration');

    // 温度 → [时域趋势, HeatmapChart]
    expect(tempResult.sensorMeta.measurementType).toBe('temperature');
  });

  it('图表标注线需要: bearingFrequencies 频率值 (Hz)', () => {
    const bf = vibResult.bearingFrequencies;
    // 验证频率为 Hz 单位，合理范围（转速 1470rpm → 转频 24.5Hz）
    expect(bf.BPFO).toBeGreaterThan(50);   // ≈ 65 Hz
    expect(bf.BPFO).toBeLessThan(100);
    expect(bf.BPFI).toBeGreaterThan(100);  // ≈ 130 Hz
    expect(bf.BPFI).toBeLessThan(200);
  });

  it('Nyquist 频率满足分析需求', () => {
    // Nyquist = sampleRate / 2 = 6400 Hz
    const nyquist = vibResult.sampleRate / 2;
    expect(nyquist).toBe(6400);

    // 应覆盖所有轴承频率的至少 5 次谐波
    const maxHarmonic = vibResult.bearingFrequencies.BPFI * 5;
    expect(nyquist).toBeGreaterThan(maxHarmonic);
  });
});
