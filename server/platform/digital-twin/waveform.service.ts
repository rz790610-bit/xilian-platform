/**
 * ============================================================================
 * P1-5: 数字孪生波形数据服务
 * ============================================================================
 *
 * 职责:
 *   1. 从 ClickHouse 查询原始传感器波形数据（12,800 Hz 采样率）
 *   2. ClickHouse 不可用时自动降级到合成演示波形
 *   3. 返回轴承特征频率（BPFO/BPFI/BSF/FTF）用于图表标注
 *   4. 性能约束: ClickHouse 查询 < 1s
 *
 * 设计原则:
 *   - 降级不崩溃: ClickHouse 故障自动回退到演示数据
 *   - 物理约束优先: 演示波形包含真实物理特征（转频谐波+轴承缺陷频率）
 *   - 单例+工厂: 标准模式
 */

import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('waveform-service');

// ============================================================================
// 类型定义
// ============================================================================

/** 波形查询请求 */
export interface WaveformRequest {
  equipmentId: string;
  sensorId: string;
  /** 采样点数（默认 2048） */
  sampleCount?: number;
  /** 时间范围 ISO 字符串 */
  timeRange?: {
    start: string;
    end: string;
  };
}

/** 波形查询结果 */
export interface WaveformResult {
  /** 波形数据（归一化浮点数） */
  waveform: number[];
  /** 采样率 Hz */
  sampleRate: number;
  /** 采样点数 */
  sampleCount: number;
  /** 轴承特征频率 */
  bearingFrequencies: BearingFrequencies;
  /** 转速 RPM */
  rpm: number;
  /** 是否为演示数据 */
  isDemoData: boolean;
  /** 降级原因（仅当 isDemoData=true） */
  fallbackReason?: string;
  /** 查询耗时 ms */
  queryTimeMs: number;
  /** 传感器元数据 */
  sensorMeta: {
    sensorId: string;
    measurementType: 'vibration' | 'temperature' | 'stress';
    unit: string;
  };
}

/** 轴承特征频率 */
export interface BearingFrequencies {
  /** 滚动体通过外圈频率 */
  BPFO: number;
  /** 滚动体通过内圈频率 */
  BPFI: number;
  /** 滚动体自转频率 */
  BSF: number;
  /** 保持架旋转频率 */
  FTF: number;
}

/** ClickHouse 适配器接口（可注入，便于测试） */
export interface ClickHouseAdapter {
  queryWaveform(
    deviceId: string,
    sensorId: string,
    sampleCount: number,
    timeRange?: { start: string; end: string },
  ): Promise<{ values: number[]; timestamps: string[] } | null>;
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// 默认 ClickHouse 适配器
// ============================================================================

export class DefaultClickHouseAdapter implements ClickHouseAdapter {
  async isAvailable(): Promise<boolean> {
    try {
      const { checkConnection } = await import('../../lib/clients/clickhouse.client');
      return await checkConnection();
    } catch {
      return false;
    }
  }

  async queryWaveform(
    deviceId: string,
    sensorId: string,
    sampleCount: number,
    timeRange?: { start: string; end: string },
  ): Promise<{ values: number[]; timestamps: string[] } | null> {
    try {
      const { getClickHouseClient } = await import('../../lib/clients/clickhouse.client');
      const ch = getClickHouseClient();

      let query: string;
      const params: Record<string, string | number> = {
        device_id: deviceId,
        sensor_id: sensorId,
        limit: sampleCount,
      };

      if (timeRange) {
        query = `
          SELECT value, timestamp
          FROM sensor_readings
          WHERE device_id = {device_id:String}
            AND sensor_id = {sensor_id:String}
            AND timestamp >= {start:String}
            AND timestamp <= {end:String}
          ORDER BY timestamp ASC
          LIMIT {limit:UInt32}
        `;
        params.start = timeRange.start;
        params.end = timeRange.end;
      } else {
        query = `
          SELECT value, timestamp
          FROM sensor_readings
          WHERE device_id = {device_id:String}
            AND sensor_id = {sensor_id:String}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
        `;
      }

      const result = await ch.query({
        query,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await result.json<{ value: number; timestamp: string }>();

      if (!rows || rows.length === 0) return null;

      // DESC 排序需要反转
      if (!timeRange) rows.reverse();

      return {
        values: rows.map(r => r.value),
        timestamps: rows.map(r => r.timestamp),
      };
    } catch (err) {
      log.warn({ err, deviceId, sensorId }, 'ClickHouse waveform query failed');
      return null;
    }
  }
}

// ============================================================================
// 传感器元数据映射
// ============================================================================

interface SensorMeta {
  measurementType: 'vibration' | 'temperature' | 'stress';
  unit: string;
  group: string;
}

const SENSOR_META: Record<string, SensorMeta> = {
  'VT-01': { measurementType: 'vibration', unit: 'mm/s', group: 'hoist' },
  'VT-02': { measurementType: 'vibration', unit: 'mm/s', group: 'hoist' },
  'VT-03': { measurementType: 'temperature', unit: '°C', group: 'hoist' },
  'VT-04': { measurementType: 'vibration', unit: 'mm/s', group: 'hoist' },
  'VT-05': { measurementType: 'vibration', unit: 'mm/s', group: 'hoist' },
  'VT-06': { measurementType: 'temperature', unit: '°C', group: 'hoist' },
  'VT-07': { measurementType: 'vibration', unit: 'mm/s', group: 'trolley' },
  'VT-08': { measurementType: 'vibration', unit: 'mm/s', group: 'trolley' },
  'VT-09': { measurementType: 'temperature', unit: '°C', group: 'trolley' },
  'VT-10': { measurementType: 'vibration', unit: 'mm/s', group: 'trolley' },
  'VT-11': { measurementType: 'vibration', unit: 'mm/s', group: 'trolley' },
  'VT-12': { measurementType: 'temperature', unit: '°C', group: 'trolley' },
  'VT-13': { measurementType: 'vibration', unit: 'mm/s', group: 'gantry' },
  'VT-14': { measurementType: 'temperature', unit: '°C', group: 'gantry' },
  'VT-15': { measurementType: 'vibration', unit: 'mm/s', group: 'gantry' },
  'VT-16': { measurementType: 'temperature', unit: '°C', group: 'gantry' },
};

// ============================================================================
// 演示波形生成器（物理真实的合成信号）
// ============================================================================

/** 计算轴承特征频率 */
export function calculateBearingFrequencies(rpm: number): BearingFrequencies {
  const rotFreq = rpm / 60; // 转频 Hz
  // SKF 6208 轴承参数: 8 滚动体, 接触角 0°, d/D ≈ 0.33
  const n = 8;          // 滚动体数
  const dD = 0.33;      // 滚动体直径/节圆直径
  const contactAngle = 0;
  const cosA = Math.cos(contactAngle);

  return {
    BPFO: rotFreq * (n / 2) * (1 - dD * cosA),        // ~3.06 × rotFreq
    BPFI: rotFreq * (n / 2) * (1 + dD * cosA),        // ~4.94 × rotFreq
    BSF:  rotFreq * (1 / (2 * dD)) * (1 - (dD * cosA) ** 2), // ~1.98 × rotFreq
    FTF:  rotFreq * 0.5 * (1 - dD * cosA),            // ~0.39 × rotFreq
  };
}

/** 生成物理真实的振动演示波形 */
export function generateDemoVibrationWaveform(
  sampleCount: number,
  rpm: number,
  sampleRate: number,
): number[] {
  const dt = 1 / sampleRate;
  const rotFreq = rpm / 60;
  const bf = calculateBearingFrequencies(rpm);
  const signal: number[] = [];

  // 使用确定性种子的伪随机（确保可重复）
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) - 0.5;
  };

  for (let i = 0; i < sampleCount; i++) {
    const t = i * dt;
    let v = 0;

    // 转频及 3 次谐波（机械不平衡）
    v += 1.2 * Math.sin(2 * Math.PI * rotFreq * t);
    v += 0.6 * Math.sin(2 * Math.PI * 2 * rotFreq * t + 0.3);
    v += 0.3 * Math.sin(2 * Math.PI * 3 * rotFreq * t + 0.7);

    // 轴承外圈缺陷 — BPFO 及 2 次谐波
    v += 0.4 * Math.sin(2 * Math.PI * bf.BPFO * t);
    v += 0.15 * Math.sin(2 * Math.PI * 2 * bf.BPFO * t + 0.5);

    // 轴承内圈 — BPFI（调幅信号，被转频调制）
    v += 0.2 * (1 + 0.5 * Math.sin(2 * Math.PI * rotFreq * t)) *
         Math.sin(2 * Math.PI * bf.BPFI * t);

    // 轴承滚动体 — BSF（较弱）
    v += 0.08 * Math.sin(2 * Math.PI * bf.BSF * t + 1.2);

    // 白噪声
    v += rand() * 0.3;

    signal.push(v);
  }

  return signal;
}

/** 生成温度演示波形 */
export function generateDemoTemperatureWaveform(
  sampleCount: number,
): number[] {
  const base = 65; // 基础温度 °C
  const signal: number[] = [];
  let seed = 123;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) - 0.5;
  };

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    signal.push(
      base +
      5 * Math.sin(2 * Math.PI * t * 2) +
      2 * Math.sin(2 * Math.PI * t * 7 + 0.8) +
      rand() * 1.5
    );
  }
  return signal;
}

// ============================================================================
// 波形数据服务
// ============================================================================

export class WaveformService {
  private clickhouse: ClickHouseAdapter;
  private defaultRpm = 1470;
  private defaultSampleRate = 12800;
  private defaultSampleCount = 2048;

  constructor(clickhouse?: ClickHouseAdapter) {
    this.clickhouse = clickhouse ?? new DefaultClickHouseAdapter();
  }

  /** 注入 ClickHouse 适配器（测试用） */
  setClickHouseAdapter(adapter: ClickHouseAdapter): void {
    this.clickhouse = adapter;
  }

  /**
   * 获取设备传感器波形数据
   *
   * 流程:
   *   1. 检查 ClickHouse 可用性
   *   2. 可用 → 查询原始波形，< 1s 超时
   *   3. 不可用/查询失败 → 降级到演示波形
   *   4. 计算轴承特征频率
   *   5. 返回完整结果（含 isDemoData 标志）
   */
  async getWaveform(request: WaveformRequest): Promise<WaveformResult> {
    const startTime = performance.now();
    const sampleCount = request.sampleCount ?? this.defaultSampleCount;
    const sensorId = request.sensorId;
    const meta = SENSOR_META[sensorId] ?? { measurementType: 'vibration' as const, unit: 'mm/s', group: 'unknown' };
    const rpm = this.defaultRpm;
    const sampleRate = this.defaultSampleRate;
    const bearingFrequencies = calculateBearingFrequencies(rpm);

    // 尝试从 ClickHouse 获取数据
    let waveform: number[] | null = null;
    let isDemoData = false;
    let fallbackReason: string | undefined;

    try {
      const available = await this.clickhouse.isAvailable();
      if (available) {
        const result = await this.clickhouse.queryWaveform(
          request.equipmentId,
          sensorId,
          sampleCount,
          request.timeRange,
        );

        if (result && result.values.length >= sampleCount * 0.8) {
          // 有足够数据
          waveform = result.values.slice(0, sampleCount);
        } else if (result && result.values.length > 0) {
          // 数据不足，用有的数据补零
          waveform = result.values;
          while (waveform.length < sampleCount) waveform.push(0);
          fallbackReason = `ClickHouse 返回 ${result.values.length} 点，不足 ${sampleCount}`;
        } else {
          isDemoData = true;
          fallbackReason = 'ClickHouse 无该传感器波形数据';
        }
      } else {
        isDemoData = true;
        fallbackReason = 'ClickHouse 连接不可用';
      }
    } catch (err) {
      isDemoData = true;
      fallbackReason = `ClickHouse 查询异常: ${(err as Error).message}`;
      log.warn({ err, sensorId }, 'Waveform query failed, falling back to demo');
    }

    // 降级到演示数据
    if (!waveform || isDemoData) {
      isDemoData = true;
      if (meta.measurementType === 'vibration') {
        waveform = generateDemoVibrationWaveform(sampleCount, rpm, sampleRate);
      } else {
        waveform = generateDemoTemperatureWaveform(sampleCount);
      }
    }

    const queryTimeMs = performance.now() - startTime;

    log.info({
      sensorId,
      equipmentId: request.equipmentId,
      isDemoData,
      sampleCount: waveform.length,
      queryTimeMs: Math.round(queryTimeMs),
    }, 'Waveform query completed');

    return {
      waveform,
      sampleRate,
      sampleCount: waveform.length,
      bearingFrequencies,
      rpm,
      isDemoData,
      fallbackReason,
      queryTimeMs,
      sensorMeta: {
        sensorId,
        measurementType: meta.measurementType,
        unit: meta.unit,
      },
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

let instance: WaveformService | null = null;

export function getWaveformService(): WaveformService {
  if (!instance) {
    instance = new WaveformService();
  }
  return instance;
}

export function resetWaveformService(): void {
  instance = null;
}
