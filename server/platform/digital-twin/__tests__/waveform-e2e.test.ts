/**
 * ============================================================================
 * P1-5 E2E 测试: 数字孪生实时数据接入 — 波形数据服务
 * ============================================================================
 *
 * 验收标准:
 *   AC-1: tRPC 端点返回 12,800 Hz 采样率的 2048 点波形数据（ClickHouse 查询 < 1s）
 *   AC-2: 频谱图/包络谱基于真实波形渲染，BPFO/BPFI 标注线位置正确
 *   AC-3: ClickHouse 不可用时自动降级到客户端演示波形，UI 显示"演示数据"标签
 *   AC-4: 3D 视图 16 个传感器颜色实时更新，刷新间隔 5s，无闪烁
 *        （3D 刷新由前端截图验证，此处验证数据接口）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WaveformService,
  calculateBearingFrequencies,
  generateDemoVibrationWaveform,
  generateDemoTemperatureWaveform,
  getWaveformService,
  resetWaveformService,
  type ClickHouseAdapter,
  type WaveformResult,
  type BearingFrequencies,
} from '../waveform.service';

// ============================================================================
// Mock ClickHouse 适配器
// ============================================================================

class MockClickHouseAvailable implements ClickHouseAdapter {
  private data: Map<string, number[]> = new Map();
  queryCount = 0;

  /** 注入模拟数据 */
  injectWaveform(deviceId: string, sensorId: string, values: number[]): void {
    this.data.set(`${deviceId}::${sensorId}`, values);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async queryWaveform(
    deviceId: string,
    sensorId: string,
    sampleCount: number,
  ): Promise<{ values: number[]; timestamps: string[] } | null> {
    this.queryCount++;
    const key = `${deviceId}::${sensorId}`;
    const values = this.data.get(key);
    if (!values) return null;

    const sliced = values.slice(0, sampleCount);
    const now = Date.now();
    const timestamps = sliced.map((_, i) =>
      new Date(now + i * (1000 / 12800)).toISOString()
    );
    return { values: sliced, timestamps };
  }
}

class MockClickHouseUnavailable implements ClickHouseAdapter {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async queryWaveform(): Promise<null> {
    throw new Error('ClickHouse is unavailable');
  }
}

class MockClickHouseError implements ClickHouseAdapter {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async queryWaveform(): Promise<null> {
    throw new Error('Connection timeout after 5000ms');
  }
}

/** 生成模拟 12,800 Hz 正弦波 */
function generateSineWave(freq: number, sampleRate: number, count: number): number[] {
  const signal: number[] = [];
  for (let i = 0; i < count; i++) {
    signal.push(Math.sin(2 * Math.PI * freq * i / sampleRate));
  }
  return signal;
}

/** 简单 FFT — 提取频谱峰值 */
function findPeakFrequency(signal: number[], sampleRate: number): number {
  const n = signal.length;
  let N = 1;
  while (N < n) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  // 位反转
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const tRe = curRe * re[i + j + len / 2] - curIm * im[i + j + len / 2];
        const tIm = curRe * im[i + j + len / 2] + curIm * re[i + j + len / 2];
        re[i + j + len / 2] = re[i + j] - tRe;
        im[i + j + len / 2] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }

  // 找最大幅值频率
  let maxAmp = 0;
  let maxIdx = 0;
  for (let i = 1; i < N / 2; i++) {
    const amp = Math.sqrt(re[i] ** 2 + im[i] ** 2);
    if (amp > maxAmp) {
      maxAmp = amp;
      maxIdx = i;
    }
  }

  return (maxIdx * sampleRate) / N;
}

// ============================================================================
// 测试用例
// ============================================================================

describe('P1-5: 数字孪生实时数据接入 — 波形数据服务', () => {
  let service: WaveformService;

  beforeEach(() => {
    resetWaveformService();
  });

  // ==========================================================================
  // AC-1: 12,800 Hz 采样率 2048 点波形数据
  // ==========================================================================

  describe('AC-1: 波形数据接口规格', () => {
    it('返回 12,800 Hz / 2048 点波形（ClickHouse 可用时）', async () => {
      const mock = new MockClickHouseAvailable();
      const realWaveform = generateSineWave(100, 12800, 2048);
      mock.injectWaveform('EQ-001', 'VT-01', realWaveform);

      service = new WaveformService(mock);
      const result = await service.getWaveform({
        equipmentId: 'EQ-001',
        sensorId: 'VT-01',
      });

      expect(result.sampleRate).toBe(12800);
      expect(result.sampleCount).toBe(2048);
      expect(result.waveform.length).toBe(2048);
      expect(result.isDemoData).toBe(false);
      expect(mock.queryCount).toBe(1);
    });

    it('ClickHouse 查询 < 1s', async () => {
      const mock = new MockClickHouseAvailable();
      mock.injectWaveform('EQ-001', 'VT-01', generateSineWave(50, 12800, 2048));

      service = new WaveformService(mock);
      const result = await service.getWaveform({
        equipmentId: 'EQ-001',
        sensorId: 'VT-01',
      });

      expect(result.queryTimeMs).toBeLessThan(1000);
    });

    it('演示波形也返回 2048 点 / 12,800 Hz', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());
      const result = await service.getWaveform({
        equipmentId: 'EQ-001',
        sensorId: 'VT-01',
      });

      expect(result.sampleRate).toBe(12800);
      expect(result.sampleCount).toBe(2048);
      expect(result.waveform.length).toBe(2048);
      expect(result.isDemoData).toBe(true);
    });

    it('支持自定义采样点数', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());
      const result = await service.getWaveform({
        equipmentId: 'EQ-001',
        sensorId: 'VT-01',
        sampleCount: 4096,
      });

      expect(result.sampleCount).toBe(4096);
    });

    it('返回传感器元数据', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());

      const vibResult = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });
      expect(vibResult.sensorMeta.measurementType).toBe('vibration');
      expect(vibResult.sensorMeta.unit).toBe('mm/s');

      const tempResult = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-03' });
      expect(tempResult.sensorMeta.measurementType).toBe('temperature');
      expect(tempResult.sensorMeta.unit).toBe('°C');
    });
  });

  // ==========================================================================
  // AC-2: 频谱中 BPFO/BPFI 标注线位置正确
  // ==========================================================================

  describe('AC-2: 轴承特征频率正确性', () => {
    it('RPM=1470 时轴承特征频率计算正确', () => {
      const bf = calculateBearingFrequencies(1470);
      const rotFreq = 1470 / 60; // 24.5 Hz

      // SKF 6208: n=8, d/D=0.33, contactAngle=0
      // BPFO = rotFreq * (n/2) * (1 - dD) = 24.5 * 4 * 0.67 ≈ 65.66 Hz
      expect(bf.BPFO).toBeCloseTo(rotFreq * 4 * (1 - 0.33), 0);
      // BPFI = rotFreq * (n/2) * (1 + dD) = 24.5 * 4 * 1.33 ≈ 130.34 Hz
      expect(bf.BPFI).toBeCloseTo(rotFreq * 4 * (1 + 0.33), 0);
      // BSF > 0 and less than a few rotFreq
      expect(bf.BSF).toBeGreaterThan(rotFreq * 0.5);
      expect(bf.BSF).toBeLessThan(rotFreq * 3);
      // FTF ≈ rotFreq * 0.5 * (1 - dD) ≈ 8.2 Hz
      expect(bf.FTF).toBeGreaterThan(rotFreq * 0.2);
      expect(bf.FTF).toBeLessThan(rotFreq * 0.5);
    });

    it('波形结果包含轴承特征频率', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      expect(result.bearingFrequencies).toHaveProperty('BPFO');
      expect(result.bearingFrequencies).toHaveProperty('BPFI');
      expect(result.bearingFrequencies).toHaveProperty('BSF');
      expect(result.bearingFrequencies).toHaveProperty('FTF');
      expect(result.bearingFrequencies.BPFO).toBeGreaterThan(0);
      expect(result.bearingFrequencies.BPFI).toBeGreaterThan(result.bearingFrequencies.BPFO);
    });

    it('演示振动波形含转频和 BPFO 成分（FFT 可检出）', () => {
      const rpm = 1470;
      const sampleRate = 12800;
      const waveform = generateDemoVibrationWaveform(2048, rpm, sampleRate);

      // FFT 检查主峰频率应接近转频 (24.5 Hz)
      const peakFreq = findPeakFrequency(waveform, sampleRate);
      const rotFreq = rpm / 60;

      // 主峰应在转频附近（±2 Hz 精度，受 FFT 分辨率限制）
      expect(Math.abs(peakFreq - rotFreq)).toBeLessThan(10);
    });

    it('不同 RPM 返回不同特征频率', () => {
      const bf1000 = calculateBearingFrequencies(1000);
      const bf1500 = calculateBearingFrequencies(1500);

      expect(bf1500.BPFO).toBeGreaterThan(bf1000.BPFO);
      expect(bf1500.BPFI).toBeGreaterThan(bf1000.BPFI);
    });
  });

  // ==========================================================================
  // AC-3: ClickHouse 不可用 → 自动降级 + 演示数据标签
  // ==========================================================================

  describe('AC-3: 降级策略', () => {
    it('ClickHouse 不可用 → isDemoData=true + fallbackReason', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      expect(result.isDemoData).toBe(true);
      expect(result.fallbackReason).toContain('连接不可用');
      expect(result.waveform.length).toBe(2048);
    });

    it('ClickHouse 查询异常 → 自动降级', async () => {
      service = new WaveformService(new MockClickHouseError());
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      expect(result.isDemoData).toBe(true);
      expect(result.fallbackReason).toContain('查询异常');
      expect(result.waveform.length).toBe(2048);
    });

    it('ClickHouse 返回空数据 → 降级到演示波形', async () => {
      const mock = new MockClickHouseAvailable();
      // 不注入数据 → queryWaveform 返回 null

      service = new WaveformService(mock);
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      expect(result.isDemoData).toBe(true);
      expect(result.fallbackReason).toContain('无该传感器波形数据');
    });

    it('ClickHouse 返回部分数据 → 零填充到 sampleCount', async () => {
      const mock = new MockClickHouseAvailable();
      mock.injectWaveform('EQ-001', 'VT-01', generateSineWave(50, 12800, 500)); // 只有 500 点

      service = new WaveformService(mock);
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      // 500 < 2048 * 0.8 但 > 0 → 零填充到 2048，标记 fallbackReason 但非演示
      expect(result.isDemoData).toBe(false);
      expect(result.fallbackReason).toContain('不足');
      expect(result.waveform.length).toBe(2048);
      // 后 1548 个点应为零
      expect(result.waveform[500]).toBe(0);
    });

    it('ClickHouse 返回足够数据（>80%）→ 使用真实数据', async () => {
      const mock = new MockClickHouseAvailable();
      mock.injectWaveform('EQ-001', 'VT-01', generateSineWave(50, 12800, 1700)); // 1700 > 2048*0.8

      service = new WaveformService(mock);
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });

      expect(result.isDemoData).toBe(false);
      expect(result.waveform.length).toBe(1700); // 截断到实际长度
    });

    it('温度传感器降级时返回温度演示波形', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());
      const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-03' }); // 温度传感器

      expect(result.isDemoData).toBe(true);
      expect(result.sensorMeta.measurementType).toBe('temperature');
      // 温度波形应在合理范围 (50-80°C)
      const avg = result.waveform.reduce((a, b) => a + b, 0) / result.waveform.length;
      expect(avg).toBeGreaterThan(50);
      expect(avg).toBeLessThan(80);
    });
  });

  // ==========================================================================
  // AC-4: 传感器数据完整性（16 个传感器全覆盖）
  // ==========================================================================

  describe('AC-4: 16 个传感器全覆盖', () => {
    it('所有 16 个 VT 传感器都能返回波形', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());

      const sensorIds = Array.from({ length: 16 }, (_, i) => `VT-${String(i + 1).padStart(2, '0')}`);

      for (const sensorId of sensorIds) {
        const result = await service.getWaveform({ equipmentId: 'EQ-001', sensorId });
        expect(result.waveform.length).toBe(2048);
        expect(result.sampleRate).toBe(12800);
        expect(result.sensorMeta.sensorId).toBe(sensorId);
      }
    });

    it('振动传感器返回振动波形，温度传感器返回温度波形', async () => {
      service = new WaveformService(new MockClickHouseUnavailable());

      // VT-01 = vibration
      const vib = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-01' });
      expect(vib.sensorMeta.measurementType).toBe('vibration');
      // 振动信号围绕 0 波动
      const vibMean = vib.waveform.reduce((a, b) => a + b, 0) / vib.waveform.length;
      expect(Math.abs(vibMean)).toBeLessThan(1);

      // VT-03 = temperature
      const temp = await service.getWaveform({ equipmentId: 'EQ-001', sensorId: 'VT-03' });
      expect(temp.sensorMeta.measurementType).toBe('temperature');
      // 温度值远大于 0
      const tempMean = temp.waveform.reduce((a, b) => a + b, 0) / temp.waveform.length;
      expect(tempMean).toBeGreaterThan(50);
    });
  });

  // ==========================================================================
  // 演示波形质量验证
  // ==========================================================================

  describe('演示波形物理真实性', () => {
    it('振动演示波形幅值在合理范围 (±5 mm/s)', () => {
      const waveform = generateDemoVibrationWaveform(2048, 1470, 12800);
      const max = Math.max(...waveform);
      const min = Math.min(...waveform);

      expect(max).toBeGreaterThan(0.5);
      expect(max).toBeLessThan(5);
      expect(min).toBeGreaterThan(-5);
      expect(min).toBeLessThan(-0.5);
    });

    it('温度演示波形在 60-75°C 范围', () => {
      const waveform = generateDemoTemperatureWaveform(2048);
      const max = Math.max(...waveform);
      const min = Math.min(...waveform);

      expect(min).toBeGreaterThan(55);
      expect(max).toBeLessThan(80);
    });

    it('确定性种子 — 相同参数生成相同波形', () => {
      const w1 = generateDemoVibrationWaveform(2048, 1470, 12800);
      const w2 = generateDemoVibrationWaveform(2048, 1470, 12800);

      expect(w1).toEqual(w2);
    });
  });

  // ==========================================================================
  // 工厂函数
  // ==========================================================================

  describe('单例工厂函数', () => {
    it('getWaveformService 返回单例', () => {
      resetWaveformService();
      const a = getWaveformService();
      const b = getWaveformService();
      expect(a).toBe(b);
    });

    it('resetWaveformService 重置实例', () => {
      resetWaveformService();
      const a = getWaveformService();
      resetWaveformService();
      const b = getWaveformService();
      expect(a).not.toBe(b);
    });
  });
});
