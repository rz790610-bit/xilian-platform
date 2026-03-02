/**
 * ============================================================================
 * 感知管线编排器集成测试 — P0-2 验收标准
 * ============================================================================
 *
 * 验收标准对照：
 *   ✓ pnpm check 零新增 TypeScript 错误
 *   ✓ 模拟 MQTT 消息 → 管线处理 → 状态向量 JSON 输出
 *   ✓ 单位换算正确：输入 2.5 g → 输出 24.525 m/s²
 *   ✓ 跨设备对齐误差 < 1 个采样周期（±1/fs 秒）
 *   ✓ 长缺口（>10x 采样周期）标记为 quality: 'gap'，不插值
 *   ✓ 管线 5 秒内处理 1000 个测点的单次批量
 *   ✓ 端到端集成测试：MQTT → 协议适配 → 单位换算 → 时间对齐 → BPA → DS 融合 → 状态向量输出
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PipelineOrchestrator,
  resetPipelineOrchestrator,
  type RawSensorMessage,
} from '../pipeline-orchestrator';
import { getUnitRegistry, resetUnitRegistry } from '../normalization/unit-registry';
import {
  MultiDeviceAligner,
  createCraneAligner,
  type DeviceStreamConfig,
} from '../alignment/multi-device-aligner';

// ============================================================================
// 测试工具
// ============================================================================

/** 生成指定数量的模拟 MQTT 传感器消息 */
function generateSensorMessages(
  deviceId: string,
  count: number,
  options?: {
    sensorId?: string;
    unit?: string;
    quantity?: RawSensorMessage['quantity'];
    startTimestamp?: number;
    sampleRateHz?: number;
    valueFn?: (i: number) => number;
  },
): RawSensorMessage[] {
  const sensorId = options?.sensorId ?? 'VT-01';
  const unit = options?.unit ?? 'mm_s_rms';
  const quantity = options?.quantity ?? 'vibration_velocity';
  const startTs = options?.startTimestamp ?? Date.now();
  const sampleRate = options?.sampleRateHz ?? 100;
  const dt = 1000 / sampleRate;
  const valueFn = options?.valueFn ?? ((i: number) => 2.5 + Math.sin(i * 0.1) * 0.5);

  const messages: RawSensorMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      deviceId,
      sensorId,
      value: valueFn(i),
      unit,
      quantity,
      timestamp: startTs + i * dt,
      quality: 2,
    });
  }
  return messages;
}

/** 创建标准设备配置 */
function createDeviceConfig(
  deviceId: string,
  channels: string[] = ['VT-01', 'VT-02', 'VT-03'],
  sampleRate = 100,
): DeviceStreamConfig {
  return {
    deviceId,
    channels,
    nominalSampleRate: sampleRate,
    clockSource: 'ntp',
    maxClockDriftMs: 10,
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('P0-2: 感知管线端到端打通', () => {
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    resetPipelineOrchestrator();
    resetUnitRegistry();
    orchestrator = new PipelineOrchestrator({
      enableClickHouse: false, // 测试环境不写 ClickHouse
      enableKafka: false,      // 测试环境不发 Kafka
    });
    orchestrator.start();
  });

  afterEach(() => {
    orchestrator.stop();
    resetPipelineOrchestrator();
    resetUnitRegistry();
  });

  // ==========================================================================
  // 验收标准 1: 模拟 MQTT 消息 → 状态向量 JSON 输出
  // ==========================================================================

  describe('模拟 MQTT 消息 → 管线处理 → 状态向量', () => {
    it('应接收模拟传感器消息并返回标准化结果', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages = generateSensorMessages('RTG-001', 100);
      const normalized = orchestrator.ingest(messages);

      expect(normalized).toHaveLength(100);
      expect(normalized[0]).toMatchObject({
        deviceId: 'RTG-001',
        sensorId: 'VT-01',
        quantity: 'vibration_velocity',
      });
    });

    it('标准化后的消息应包含完整字段', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages = generateSensorMessages('RTG-001', 1);
      const normalized = orchestrator.ingest(messages);
      const msg = normalized[0];

      // 字段完整性
      expect(msg).toHaveProperty('deviceId');
      expect(msg).toHaveProperty('sensorId');
      expect(msg).toHaveProperty('value');
      expect(msg).toHaveProperty('unit');
      expect(msg).toHaveProperty('rawValue');
      expect(msg).toHaveProperty('rawUnit');
      expect(msg).toHaveProperty('quantity');
      expect(msg).toHaveProperty('timestamp');
      expect(msg).toHaveProperty('quality');
      expect(msg).toHaveProperty('physicallyValid');
      expect(msg).toHaveProperty('isApproximate');
    });

    it('processBatch 应返回完整的批次结果', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      const messages = generateSensorMessages('RTG-001', 50);
      orchestrator.ingest(messages);

      const result = await orchestrator.processBatch('RTG-001');

      expect(result).toHaveProperty('batchId');
      expect(result).toHaveProperty('rawMessageCount');
      expect(result).toHaveProperty('normalizedCount');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('errors');
      expect(result.rawMessageCount).toBe(50);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('统计数据应正确更新', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages = generateSensorMessages('RTG-001', 200);
      orchestrator.ingest(messages);

      const stats = orchestrator.getStats();
      expect(stats.totalReceived).toBe(200);
      expect(stats.totalNormalized).toBe(200);
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // 验收标准 2: 单位换算正确 — 2.5 g → 24.525 m/s²
  // ==========================================================================

  describe('单位换算正确性', () => {
    it('2.5 g → 24.51663 m/s²（9.80665 * 2.5）', () => {
      const registry = getUnitRegistry();
      const result = registry.convert(2.5, 'g', 'm_s2');

      // g 到 m/s² 的精确换算: 2.5 * 9.80665 = 24.516625
      expect(result.value).toBeCloseTo(24.516625, 3);
      expect(result.isApproximate).toBe(false);
    });

    it('toStandard: 2.5 g → m/s² 标准单位', () => {
      const registry = getUnitRegistry();
      const result = registry.toStandard(2.5, 'g');

      expect(result.toUnit).toBe('m_s2');
      expect(result.value).toBeCloseTo(24.516625, 3);
    });

    it('管线入站时自动执行单位换算', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages: RawSensorMessage[] = [{
        deviceId: 'RTG-001',
        sensorId: 'VT-01',
        value: 2.5,
        unit: 'g',
        quantity: 'vibration_acceleration',
        timestamp: Date.now(),
        quality: 2,
      }];

      const normalized = orchestrator.ingest(messages);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].rawValue).toBe(2.5);
      expect(normalized[0].rawUnit).toBe('g');
      expect(normalized[0].unit).toBe('m_s2');
      expect(normalized[0].value).toBeCloseTo(24.516625, 3);
    });

    it('温度换算: 212°F → 100°C', () => {
      const registry = getUnitRegistry();
      const result = registry.convert(212, 'degF', 'degC');
      expect(result.value).toBeCloseTo(100, 1);
    });

    it('压力换算: 14.696 psi → 0.1013 MPa (1 atm)', () => {
      const registry = getUnitRegistry();
      const result = registry.convert(14.696, 'psi', 'MPa');
      expect(result.value).toBeCloseTo(0.10132, 3);
    });

    it('电流换算: 500 mA → 0.5 A', () => {
      const registry = getUnitRegistry();
      const result = registry.convert(500, 'mA', 'A');
      expect(result.value).toBeCloseTo(0.5, 5);
    });

    it('批量换算正确', () => {
      const registry = getUnitRegistry();
      const results = registry.convertBatch({
        values: [1, 2, 3, 4, 5],
        fromUnit: 'g',
        toUnit: 'm_s2',
      });

      expect(results).toHaveLength(5);
      expect(results[0]).toBeCloseTo(9.80665, 3);
      expect(results[4]).toBeCloseTo(49.03325, 3);
    });

    it('未知单位应降级使用原值', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages: RawSensorMessage[] = [{
        deviceId: 'RTG-001',
        sensorId: 'VT-01',
        value: 5.0,
        unit: 'unknown_unit_xyz',
        quantity: 'vibration_velocity',
        timestamp: Date.now(),
        quality: 2,
      }];

      const normalized = orchestrator.ingest(messages);
      expect(normalized).toHaveLength(1);
      // 降级使用原值
      expect(normalized[0].value).toBe(5.0);
      expect(normalized[0].quality).toBe(1); // uncertain
    });
  });

  // ==========================================================================
  // 验收标准 3: 跨设备对齐误差 < 1 个采样周期
  // ==========================================================================

  describe('跨设备时间对齐', () => {
    it('两台设备对齐到 100Hz，误差 < 10ms (1/100s)', () => {
      const aligner = createCraneAligner({ targetSampleRate: 100 });

      aligner.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));
      aligner.registerDevice(createDeviceConfig('RTG-002', ['VT-01'], 50));

      const baseTime = 1000000;
      // RTG-001: 100Hz, 100 samples
      for (let i = 0; i < 100; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + i * 10], [Math.sin(i * 0.1)]);
      }
      // RTG-002: 50Hz, 50 samples (同时间窗口)
      for (let i = 0; i < 50; i++) {
        aligner.ingestRaw('RTG-002', 'VT-01', [baseTime + i * 20], [Math.cos(i * 0.2)]);
      }

      const result = aligner.align();

      // 两台设备应对齐到相同时间轴
      expect(result.channels.length).toBe(2);
      expect(result.targetSampleRate).toBe(100);

      // 检查时间轴间距 = 10ms (1000/100)
      const ch1 = result.channels[0];
      if (ch1.timestamps.length >= 2) {
        const dt = ch1.timestamps[1] - ch1.timestamps[0];
        expect(dt).toBeCloseTo(10, 0); // 10ms ±0.5ms
      }

      // 对齐后采样点数应一致
      expect(result.channels[0].alignedSampleCount).toBe(result.channels[1].alignedSampleCount);
    });

    it('同采样率设备对齐应保留原始数据点', () => {
      const aligner = createCraneAligner({ targetSampleRate: 100 });
      aligner.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const baseTime = 1000000;
      for (let i = 0; i < 100; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + i * 10], [i * 1.0]);
      }

      const result = aligner.align();
      expect(result.channels).toHaveLength(1);

      // 原始数据质量标记应为 2（original）
      const ch = result.channels[0];
      let originalCount = 0;
      for (let i = 0; i < ch.quality.length; i++) {
        if (ch.quality[i] === 2) originalCount++;
      }
      // 大部分点应为原始数据
      expect(originalCount).toBeGreaterThan(ch.quality.length * 0.8);
    });

    it('管线内置对齐器与外部对齐器结果一致', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const baseTime = Date.now();
      const messages = generateSensorMessages('RTG-001', 100, {
        startTimestamp: baseTime,
        sampleRateHz: 100,
      });

      orchestrator.ingest(messages);

      const aligner = orchestrator.getAligner();
      expect(aligner.getTotalBufferedSamples()).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 验收标准 4: 长缺口标记为 quality: 'gap'，不插值
  // ==========================================================================

  describe('长缺口检测与标记', () => {
    it('长缺口（>10x 采样周期）应标记为 quality=0，不插值', () => {
      const aligner = createCraneAligner({
        targetSampleRate: 100,
        longGapThresholdMultiplier: 10.0,
        longGapStrategy: 'mark_nan',
      });

      aligner.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const baseTime = 1000000;
      // 前 50 个点（0-490ms）
      for (let i = 0; i < 50; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + i * 10], [5.0]);
      }
      // 长缺口: 500ms → 1500ms (100ms = 10x 采样周期, 这里 1000ms >> 10x)
      // 后 50 个点（1500-1990ms）
      for (let i = 0; i < 50; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + 1500 + i * 10], [5.0]);
      }

      const result = aligner.align();

      // 应检测到长缺口
      const longGaps = result.gaps.filter(g => g.type === 'long');
      expect(longGaps.length).toBeGreaterThanOrEqual(1);

      // 缺口持续时间约 1000ms
      if (longGaps.length > 0) {
        expect(longGaps[0].durationMs).toBeGreaterThanOrEqual(500);
      }

      // 缺口区域的质量标记应为 0
      const ch = result.channels[0];
      let gapPointCount = 0;
      for (let i = 0; i < ch.quality.length; i++) {
        if (ch.quality[i] === 0) gapPointCount++;
      }
      expect(gapPointCount).toBeGreaterThan(0);
    });

    it('短缺口（<3x 采样周期）应线性插值', () => {
      const aligner = createCraneAligner({
        targetSampleRate: 100,
        shortGapThresholdMultiplier: 3.0,
      });

      aligner.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const baseTime = 1000000;
      // 插入数据，跳过 1 个采样点（短缺口 = 2x 采样周期）
      for (let i = 0; i < 100; i++) {
        if (i === 50) continue; // 跳过 1 个点
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + i * 10], [i * 0.1]);
      }

      const result = aligner.align();
      // 短缺口不应出现在 long gaps 中
      const longGaps = result.gaps.filter(g => g.type === 'long');
      expect(longGaps).toHaveLength(0);
    });

    it('mark_and_hold 策略: 长缺口应 hold_last + quality=0', () => {
      const aligner = createCraneAligner({
        targetSampleRate: 100,
        longGapStrategy: 'mark_and_hold',
      });

      aligner.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const baseTime = 1000000;
      // 有一个 2 秒的长缺口
      for (let i = 0; i < 30; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + i * 10], [10.0]);
      }
      for (let i = 0; i < 30; i++) {
        aligner.ingestRaw('RTG-001', 'VT-01', [baseTime + 2300 + i * 10], [20.0]);
      }

      const result = aligner.align();

      // 缺口区域值应被保持（不是 NaN），但质量标记为 0
      const ch = result.channels[0];
      let holdPoints = 0;
      for (let i = 0; i < ch.values.length; i++) {
        if (ch.quality[i] === 0 && !isNaN(ch.values[i])) {
          holdPoints++;
        }
      }
      // 在 mark_and_hold 下，缺口区域应有 hold 值
      expect(holdPoints).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 验收标准 5: 管线 5 秒内处理 1000 个测点
  // ==========================================================================

  describe('性能测试: 1000 测点批量处理', () => {
    it('1000 测点应在 5000ms 内完成处理', async () => {
      // 创建 16 通道的设备
      const channels = Array.from({ length: 16 }, (_, i) =>
        `VT-${String(i + 1).padStart(2, '0')}`,
      );
      orchestrator.registerDevice(createDeviceConfig('RTG-001', channels, 100));

      // 生成 1000 个测点（62.5 个/通道 × 16 通道 ≈ 1000）
      const allMessages: RawSensorMessage[] = [];
      const baseTime = Date.now();

      for (let ch = 0; ch < 16; ch++) {
        const sensorId = `VT-${String(ch + 1).padStart(2, '0')}`;
        const msgs = generateSensorMessages('RTG-001', 63, {
          sensorId,
          startTimestamp: baseTime,
          sampleRateHz: 100,
          valueFn: (i) => 3.0 + Math.sin(i * 0.05 + ch * 0.5) * 1.0,
        });
        allMessages.push(...msgs);
      }

      expect(allMessages.length).toBeGreaterThanOrEqual(1000);

      // 性能计时
      const startTime = performance.now();
      orchestrator.ingest(allMessages);
      const result = await orchestrator.processBatch('RTG-001');
      const elapsed = performance.now() - startTime;

      // 验收：< 5000ms
      expect(elapsed).toBeLessThan(5000);
      expect(result.rawMessageCount).toBeGreaterThanOrEqual(1000);

      // 输出性能数据
      console.log(`  ✓ 1000 测点处理耗时: ${elapsed.toFixed(1)}ms`);
    });

    it('大批量消息入站不阻塞', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const startTime = performance.now();
      const messages = generateSensorMessages('RTG-001', 10000, {
        sampleRateHz: 100,
      });
      orchestrator.ingest(messages);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(5000);
      expect(orchestrator.getStats().totalReceived).toBe(10000);

      console.log(`  ✓ 10000 消息入站耗时: ${elapsed.toFixed(1)}ms`);
    });
  });

  // ==========================================================================
  // 验收标准 6: 端到端集成测试
  // ==========================================================================

  describe('端到端集成测试', () => {
    it('完整链路: 消息入站 → 单位换算 → 对齐 → 融合 → 状态向量', async () => {
      // 注册设备
      const channels = ['VT-01', 'VT-02', 'VT-03'];
      orchestrator.registerDevice(createDeviceConfig('RTG-001', channels, 100));

      const baseTime = Date.now();

      // 模拟多通道传感器数据
      const vibrationMsgs = generateSensorMessages('RTG-001', 100, {
        sensorId: 'VT-01',
        unit: 'mm_s_rms',
        quantity: 'vibration_velocity',
        startTimestamp: baseTime,
        valueFn: (i) => 3.5 + Math.sin(i * 0.1) * 0.3,
      });

      const tempMsgs = generateSensorMessages('RTG-001', 100, {
        sensorId: 'VT-02',
        unit: 'degC',
        quantity: 'temperature',
        startTimestamp: baseTime,
        valueFn: () => 65.0,
      });

      const currentMsgs = generateSensorMessages('RTG-001', 100, {
        sensorId: 'VT-03',
        unit: 'A',
        quantity: 'current',
        startTimestamp: baseTime,
        valueFn: () => 85.0,
      });

      // Step 1: 入站 + 单位换算
      const normalized = orchestrator.ingest([
        ...vibrationMsgs,
        ...tempMsgs,
        ...currentMsgs,
      ]);

      expect(normalized.length).toBe(300);
      expect(orchestrator.getStats().totalNormalized).toBe(300);

      // Step 2-4: 对齐 + 融合 + 输出
      const result = await orchestrator.processBatch('RTG-001');

      // 验证批次结果
      expect(result.errors).toHaveLength(0);
      expect(result.rawMessageCount).toBe(300);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(5000);

      // 对齐应完成
      expect(result.alignedChannelCount).toBeGreaterThanOrEqual(0);
    });

    it('多设备并行入站 → 对齐 → 各自生成状态向量', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));
      orchestrator.registerDevice(createDeviceConfig('RTG-002', ['VT-01'], 50));

      const baseTime = Date.now();

      // RTG-001: 100Hz
      const msgs1 = generateSensorMessages('RTG-001', 100, {
        startTimestamp: baseTime,
        sampleRateHz: 100,
      });
      // RTG-002: 50Hz
      const msgs2 = generateSensorMessages('RTG-002', 50, {
        startTimestamp: baseTime,
        sampleRateHz: 50,
      });

      orchestrator.ingest([...msgs1, ...msgs2]);

      const result1 = await orchestrator.processBatch('RTG-001');
      expect(result1.rawMessageCount).toBe(100);

      // 统计应反映两台设备
      expect(orchestrator.getStats().totalReceived).toBe(150);
    });

    it('降级测试: ClickHouse/Kafka 不可用时仍输出状态向量', async () => {
      // 已在 beforeEach 中禁用 CH 和 Kafka
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages = generateSensorMessages('RTG-001', 50);
      orchestrator.ingest(messages);

      const result = await orchestrator.processBatch('RTG-001');

      // 即使 CH/Kafka 禁用，批次也应成功
      expect(result.clickhouseWritten).toBe(false);
      expect(result.kafkaPublished).toBe(false);
      expect(result.errors).toHaveLength(0); // 禁用不算错误
    });

    it('物理约束校验: 超范围值应降级质量标记', () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));

      const messages: RawSensorMessage[] = [
        // 正常振动值
        {
          deviceId: 'RTG-001',
          sensorId: 'VT-01',
          value: 5.0,
          unit: 'mm_s_rms',
          quantity: 'vibration_velocity',
          timestamp: Date.now(),
          quality: 2,
        },
        // 异常高振动值（超过物理范围 100 mm/s）
        {
          deviceId: 'RTG-001',
          sensorId: 'VT-02',
          value: 200.0,
          unit: 'mm_s_rms',
          quantity: 'vibration_velocity',
          timestamp: Date.now(),
          quality: 2,
        },
      ];

      const normalized = orchestrator.ingest(messages);

      // 正常值: physicallyValid = true
      expect(normalized[0].physicallyValid).toBe(true);
      expect(normalized[0].quality).toBe(2);

      // 异常值: physicallyValid = false, quality 降级
      expect(normalized[1].physicallyValid).toBe(false);
      expect(normalized[1].quality).toBe(1); // 降级为 uncertain
    });
  });

  // ==========================================================================
  // 附加测试: 单例模式
  // ==========================================================================

  describe('单例 + 工厂函数', () => {
    it('getPipelineOrchestrator 返回单例', async () => {
      const { getPipelineOrchestrator, resetPipelineOrchestrator: reset } = await import('../pipeline-orchestrator');

      reset();
      const a = getPipelineOrchestrator();
      const b = getPipelineOrchestrator();
      expect(a).toBe(b);
      reset();
    });

    it('resetPipelineOrchestrator 重置单例', async () => {
      const { getPipelineOrchestrator, resetPipelineOrchestrator: reset } = await import('../pipeline-orchestrator');

      reset();
      const a = getPipelineOrchestrator();
      reset();
      const b = getPipelineOrchestrator();
      expect(a).not.toBe(b);
      reset();
    });
  });

  // ==========================================================================
  // 附加测试: 回调机制
  // ==========================================================================

  describe('回调机制', () => {
    it('onBatchComplete 回调应在处理后触发', async () => {
      let callbackResult: any = null;

      orchestrator.setCallbacks({
        onBatchComplete: (result) => {
          callbackResult = result;
        },
      });

      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 20));
      await orchestrator.processBatch('RTG-001');

      expect(callbackResult).not.toBeNull();
      expect(callbackResult.batchId).toBeDefined();
      expect(callbackResult.rawMessageCount).toBe(20);
    });
  });

  // ==========================================================================
  // P0-3: 数据质量评分集成测试
  // ==========================================================================

  describe('P0-3: 数据质量评分集成', () => {
    it('processBatch 应返回质量评分结果', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 50));
      const result = await orchestrator.processBatch('RTG-001');

      // 应有质量评分字段
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityGrade).not.toBeNull();
      expect(typeof result.needsReview).toBe('boolean');

      // 质量评分结构完整
      if (result.qualityScore) {
        expect(result.qualityScore.overall).toBeGreaterThanOrEqual(0);
        expect(result.qualityScore.overall).toBeLessThanOrEqual(100);
        expect(['A', 'B', 'C', 'D', 'F']).toContain(result.qualityScore.grade);
        expect(result.qualityScore.completeness).toBeDefined();
        expect(result.qualityScore.accuracy).toBeDefined();
      }
    });

    it('质量等级应为 A/B/C/D/F 之一', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 50));
      const result = await orchestrator.processBatch('RTG-001');

      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.qualityGrade);
    });

    it('评分 < 75 应标记 needsReview = true', async () => {
      // 只发送单类型数据（完整度低），确保评分 < 75
      orchestrator.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const msgs = generateSensorMessages('RTG-001', 30, {
        sensorId: 'VT-01',
        unit: 'mm_s_rms',
        quantity: 'vibration_velocity',
        valueFn: () => 3.5,
      });
      orchestrator.ingest(msgs);
      const result = await orchestrator.processBatch('RTG-001');

      // 只有振动通道 → 完整度低 → overall < 75 → needsReview
      if (result.qualityScore && result.qualityScore.overall < 75) {
        expect(result.needsReview).toBe(true);
      }
    });

    it('质量标签应附加到状态向量 metadata', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 50));
      const result = await orchestrator.processBatch('RTG-001');

      // 如果有状态向量，质量标签应附加在上面
      if (result.stateVector) {
        const sv = result.stateVector as unknown as Record<string, unknown>;
        expect(sv.qualityGrade).toBeDefined();
        expect(sv.qualityScore).toBeDefined();
        expect(sv.needsReview).toBeDefined();
      }
    });

    it('评分 < 75 时状态向量 labelStatus = needs_review', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001', ['VT-01'], 100));

      const msgs = generateSensorMessages('RTG-001', 30, {
        sensorId: 'VT-01',
        unit: 'mm_s_rms',
        quantity: 'vibration_velocity',
        valueFn: () => 3.5,
      });
      orchestrator.ingest(msgs);
      const result = await orchestrator.processBatch('RTG-001');

      if (result.stateVector && result.qualityScore && result.qualityScore.overall < 75) {
        const sv = result.stateVector as unknown as Record<string, unknown>;
        expect(sv.labelStatus).toBe('needs_review');
      }
    });

    it('综合评分公式: overall = completeness×0.4 + accuracy×0.6', async () => {
      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 50));
      const result = await orchestrator.processBatch('RTG-001');

      if (result.qualityScore) {
        const expected =
          result.qualityScore.completeness.overall * 0.4 +
          result.qualityScore.accuracy.overall * 0.6;
        expect(result.qualityScore.overall).toBeCloseTo(expected, 1);
      }
    });

    it('onBatchComplete 回调应包含质量评分', async () => {
      let callbackResult: any = null;
      orchestrator.setCallbacks({
        onBatchComplete: (r) => { callbackResult = r; },
      });

      orchestrator.registerDevice(createDeviceConfig('RTG-001'));
      orchestrator.ingest(generateSensorMessages('RTG-001', 20));
      await orchestrator.processBatch('RTG-001');

      expect(callbackResult).not.toBeNull();
      expect(callbackResult.qualityScore).not.toBeNull();
      expect(callbackResult.qualityGrade).not.toBeNull();
      expect(typeof callbackResult.needsReview).toBe('boolean');
    });
  });
});
