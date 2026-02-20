/**
 * ============================================================================
 * 感知管线端到端测试
 * ============================================================================
 *
 * 覆盖：RingBuffer → AdaptiveSampler → DSFusionEngine → StateVectorEncoder
 */

import { RingBuffer } from '../perception/collection/ring-buffer';
import { AdaptiveSampler } from '../perception/collection/adaptive-sampler';
import { DSFusionEngine } from '../perception/fusion/ds-fusion-engine';
import { UncertaintyQuantifier } from '../perception/fusion/uncertainty-quantifier';
import { StateVectorEncoder } from '../perception/encoding/state-vector-encoder';
import { BackpressureController } from '../perception/collection/backpressure-controller';
import { EvidenceLearner } from '../perception/fusion/evidence-learner';

// ============================================================================
// 测试工具
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function generateSensorData(count: number): Array<{ sensorId: string; value: number; timestamp: number }> {
  return Array.from({ length: count }, (_, i) => ({
    sensorId: `sensor_${i % 5}`,
    value: Math.random() * 100 + Math.sin(i / 10) * 20,
    timestamp: Date.now() - (count - i) * 100,
  }));
}

// ============================================================================
// 测试用例
// ============================================================================

async function testRingBuffer(): Promise<void> {
  console.log('[TEST] RingBuffer — 基本读写');
  const buffer = new RingBuffer(1024);

  // 写入
  const written = buffer.write(new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0]));
  assert(written === 5, `应写入5个元素，实际写入${written}`);

  // 读取
  const data = buffer.read(5);
  assert(data.length === 5, `应读取5个元素，实际读取${data.length}`);
  assert(data[0] === 1.0, `第一个元素应为1.0，实际为${data[0]}`);
  assert(data[4] === 5.0, `第五个元素应为5.0，实际为${data[4]}`);

  // 环绕写入
  const bigData = new Float64Array(200);
  for (let i = 0; i < 200; i++) bigData[i] = i;
  buffer.write(bigData);
  const stats = buffer.getStats();
  assert(stats.totalWritten > 0, '总写入数应大于0');

  console.log('[PASS] RingBuffer');
}

async function testAdaptiveSampler(): Promise<void> {
  console.log('[TEST] AdaptiveSampler — 自适应采样');
  const sampler = new AdaptiveSampler({
    baseRateHz: 1000,
    minRateHz: 100,
    maxRateHz: 10000,
  });

  // 正常工况
  const normalRate = sampler.computeRate({ phase: 'idle', changeRate: 0.01 });
  assert(normalRate <= 1000, `空载采样率应<=1000Hz，实际${normalRate}`);

  // 高变化率工况
  const highRate = sampler.computeRate({ phase: 'active', changeRate: 0.8 });
  assert(highRate >= 1000, `高变化率采样率应>=1000Hz，实际${highRate}`);

  // 特征提取
  const rawData = Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) * 10 + Math.random() * 2);
  const features = sampler.extractFeatures(rawData);
  assert(features.rms > 0, 'RMS应大于0');
  assert(features.peak > 0, '峰值应大于0');
  assert(typeof features.kurtosis === 'number', '峰度应为数字');

  console.log('[PASS] AdaptiveSampler');
}

async function testDSFusionEngine(): Promise<void> {
  console.log('[TEST] DSFusionEngine — Dempster-Shafer 融合');
  const engine = new DSFusionEngine();

  // 添加证据
  engine.addEvidence('vibration', {
    beliefs: { normal: 0.2, degraded: 0.6, critical: 0.1 },
    uncertainty: 0.1,
  });

  engine.addEvidence('temperature', {
    beliefs: { normal: 0.3, degraded: 0.5, critical: 0.1 },
    uncertainty: 0.1,
  });

  // 融合
  const result = engine.fuse();
  assert(result !== null, '融合结果不应为null');
  assert(result!.confidence > 0, '融合置信度应大于0');
  assert(result!.conflictLevel >= 0 && result!.conflictLevel <= 1, '冲突度应在[0,1]范围');

  // 高冲突场景
  engine.reset();
  engine.addEvidence('sensor_a', {
    beliefs: { normal: 0.9, critical: 0.0 },
    uncertainty: 0.1,
  });
  engine.addEvidence('sensor_b', {
    beliefs: { normal: 0.0, critical: 0.9 },
    uncertainty: 0.1,
  });

  const conflictResult = engine.fuse();
  assert(conflictResult !== null, '高冲突融合结果不应为null');
  assert(conflictResult!.conflictLevel > 0.5, `高冲突场景冲突度应>0.5，实际${conflictResult!.conflictLevel}`);

  console.log('[PASS] DSFusionEngine');
}

async function testUncertaintyQuantifier(): Promise<void> {
  console.log('[TEST] UncertaintyQuantifier — 不确定性量化');
  const quantifier = new UncertaintyQuantifier();

  const result = quantifier.quantify({
    sensorNoise: 0.05,
    modelUncertainty: 0.1,
    environmentalVariance: 0.15,
    dataCompleteness: 0.9,
  });

  assert(result.totalUncertainty >= 0 && result.totalUncertainty <= 1, '总不确定性应在[0,1]范围');
  assert(result.dominantSource !== '', '主要不确定性来源不应为空');
  assert(result.confidenceInterval.lower < result.confidenceInterval.upper, '置信区间下界应小于上界');

  console.log('[PASS] UncertaintyQuantifier');
}

async function testStateVectorEncoder(): Promise<void> {
  console.log('[TEST] StateVectorEncoder — 状态向量编码');
  const encoder = new StateVectorEncoder();

  const vector = encoder.encode({
    cycleFeatures: {
      vibrationRMS: 5.2,
      temperatureMax: 72,
      loadRatioMean: 0.75,
      speedMean: 1200,
      currentRMS: 45,
      pressureMean: 8.5,
      cycleTimeSeconds: 120,
      energyConsumption: 15.3,
      startStopCount: 24,
      peakAcceleration: 12.1,
      harmonicDistortion: 0.08,
    },
    uncertaintyFactors: {
      windSpeed: 8.5,
      humidity: 75,
      ambientTemperature: 28,
      loadEccentricity: 0.05,
      frictionCoefficient: 0.15,
      vesselMotion: 0.02,
    },
    cumulativeIndicators: {
      fatigueDamage: 0.35,
      corrosionIndex: 0.12,
      wearIndex: 0.28,
      operatingHours: 12500,
    },
  });

  assert(vector.length === 21, `状态向量应为21维，实际${vector.length}`);
  assert(vector.every(v => typeof v === 'number' && !isNaN(v)), '所有维度应为有效数字');

  // 归一化检查
  const normalized = encoder.normalize(vector);
  assert(normalized.length === 21, '归一化后维度应保持21');
  assert(normalized.every(v => v >= 0 && v <= 1), '归一化后所有值应在[0,1]范围');

  console.log('[PASS] StateVectorEncoder');
}

async function testBackpressureController(): Promise<void> {
  console.log('[TEST] BackpressureController — 背压控制');
  const controller = new BackpressureController({
    maxQueueSize: 100,
    warningThreshold: 0.7,
    criticalThreshold: 0.9,
    dropPolicy: 'oldest',
  });

  // 正常状态
  assert(controller.getStatus() === 'normal', '初始状态应为normal');

  // 模拟负载增加
  for (let i = 0; i < 75; i++) {
    controller.enqueue({ id: `msg_${i}`, data: { value: i } });
  }
  assert(controller.getStatus() === 'warning', `75%负载应为warning，实际${controller.getStatus()}`);

  // 模拟过载
  for (let i = 75; i < 95; i++) {
    controller.enqueue({ id: `msg_${i}`, data: { value: i } });
  }
  assert(controller.getStatus() === 'critical', `95%负载应为critical，实际${controller.getStatus()}`);

  // 消费
  const dequeued = controller.dequeue(50);
  assert(dequeued.length === 50, `应消费50条，实际${dequeued.length}`);

  console.log('[PASS] BackpressureController');
}

async function testEvidenceLearner(): Promise<void> {
  console.log('[TEST] EvidenceLearner — 证据权重自学习');
  const learner = new EvidenceLearner();

  // 添加历史反馈
  learner.addFeedback({
    sourceId: 'vibration',
    predicted: 'degraded',
    actual: 'degraded',
    timestamp: Date.now() - 86400000,
  });

  learner.addFeedback({
    sourceId: 'temperature',
    predicted: 'normal',
    actual: 'degraded',
    timestamp: Date.now() - 86400000,
  });

  // 学习
  const weights = learner.learn();
  assert(weights.vibration > weights.temperature, '振动源权重应高于温度源（因为振动预测正确）');
  assert(Object.values(weights).every(w => w > 0 && w <= 1), '所有权重应在(0,1]范围');

  console.log('[PASS] EvidenceLearner');
}

// ============================================================================
// 测试运行器
// ============================================================================

export async function runPerceptionPipelineTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  const tests = [
    testRingBuffer,
    testAdaptiveSampler,
    testDSFusionEngine,
    testUncertaintyQuantifier,
    testStateVectorEncoder,
    testBackpressureController,
    testEvidenceLearner,
  ];

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      failed++;
      errors.push(`${test.name}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`[FAIL] ${test.name}:`, err);
    }
  }

  console.log(`\n=== 感知管线测试结果: ${passed} passed, ${failed} failed ===`);
  return { passed, failed, errors };
}
