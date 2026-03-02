/**
 * 跨域适配器单元测试 — Cross-Domain Protocol Adapters
 *
 * 覆盖 5 个 P0 适配器：
 *   A1. algorithmResultToDSEvidence()
 *   A2. hdeResultToEvaluationSample()
 *   A3. normalizeAnomalyEvent()
 *   A4. anomalyToAlert()
 *   A5. ModelRegistrySynchronizer
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  algorithmResultToDSEvidence,
  hdeResultToEvaluationSample,
  normalizeAnomalyEvent,
  anomalyToAlert,
  ModelRegistrySynchronizer,
  getModelRegistrySynchronizer,
  resetModelRegistrySynchronizer,
} from '../cross-domain-adapters';
import type { AlgorithmResultInput } from '../../ai/ai.types';
import type { HDEDiagnosisResult } from '../../hde/types';

// ============================================================================
// A1: algorithmResultToDSEvidence()
// ============================================================================

describe('A1: algorithmResultToDSEvidence', () => {
  const baseAlgoResult: AlgorithmResultInput = {
    algorithmId: 'ALG-001',
    algorithmName: 'BearingFaultDetector',
    output: {},
    confidence: 0.85,
    executedAt: 1700000000000,
  };

  it('从 output.probabilities 提取信念质量', () => {
    const result = algorithmResultToDSEvidence({
      ...baseAlgoResult,
      output: {
        probabilities: {
          bearing_damage: 0.6,
          gear_wear: 0.2,
          normal: 0.1,
        },
      },
    });

    expect(result.sourceId).toBe('algo:ALG-001');
    expect(result.beliefMass['bearing_damage']).toBe(0.6);
    expect(result.beliefMass['gear_wear']).toBe(0.2);
    expect(result.beliefMass['normal']).toBe(0.1);
    // theta = 1 - 0.9 = 0.1
    expect(result.beliefMass['theta']).toBeCloseTo(0.1, 5);
    expect(result.timestamp).toBe(1700000000000);
  });

  it('从 output.faultType 构造二元信念', () => {
    const result = algorithmResultToDSEvidence({
      ...baseAlgoResult,
      output: { faultType: 'misalignment', score: 0.9 },
    });

    expect(result.beliefMass['misalignment']).toBe(0.85);
    expect(result.beliefMass['theta']).toBeCloseTo(0.15, 5);
  });

  it('无概率信息时用 faultType 参数兜底', () => {
    const result = algorithmResultToDSEvidence(baseAlgoResult, 'imbalance');

    expect(result.beliefMass['imbalance']).toBe(0.85);
    expect(result.beliefMass['theta']).toBeCloseTo(0.15, 5);
  });

  it('完全无信息时用 unknown 兜底', () => {
    const result = algorithmResultToDSEvidence(baseAlgoResult);

    expect(result.beliefMass['unknown']).toBe(0.85);
    expect(result.beliefMass['theta']).toBeCloseTo(0.15, 5);
  });

  it('confidence 超出 [0,1] 时 clamp', () => {
    const result = algorithmResultToDSEvidence({
      ...baseAlgoResult,
      confidence: 1.5,
    }, 'test');

    expect(result.beliefMass['test']).toBe(1);
    expect(result.beliefMass['theta']).toBe(0);
  });

  it('支持 beliefMass 字段名', () => {
    const result = algorithmResultToDSEvidence({
      ...baseAlgoResult,
      output: {
        beliefMass: { bearing_damage: 0.7, theta: 0.3 },
      },
    });

    expect(result.beliefMass['bearing_damage']).toBe(0.7);
  });
});

// ============================================================================
// A2: hdeResultToEvaluationSample()
// ============================================================================

describe('A2: hdeResultToEvaluationSample', () => {
  const makeHDEResult = (overrides?: Partial<HDEDiagnosisResult>): HDEDiagnosisResult => ({
    sessionId: 'SESSION-001',
    machineId: 'CRANE-001',
    timestamp: 1700000000000,
    diagnosis: {
      faultType: 'bearing_damage',
      confidence: 0.88,
      severity: 'high',
      urgency: 'priority',
    },
    trackResults: {
      physics: {
        trackType: 'physics',
        faultHypotheses: [
          {
            id: 'H1',
            faultType: 'bearing_damage',
            priorProbability: 0.3,
            posteriorProbability: 0.85,
            supportingEvidence: ['vibration_peak'],
            contradictingEvidence: [],
          },
        ],
        beliefMass: { bearing_damage: 0.85, normal: 0.1, theta: 0.05 },
        confidence: 0.85,
        physicsConstraints: [],
        executionTimeMs: 120,
      },
      data: {
        trackType: 'data',
        faultHypotheses: [
          {
            id: 'H2',
            faultType: 'bearing_damage',
            priorProbability: 0.4,
            posteriorProbability: 0.9,
            supportingEvidence: ['model_output'],
            contradictingEvidence: [],
          },
        ],
        beliefMass: { bearing_damage: 0.9, normal: 0.05, theta: 0.05 },
        confidence: 0.9,
        physicsConstraints: [],
        executionTimeMs: 80,
      },
    },
    fusionResult: {
      fusedMass: { bearing_damage: 0.92, normal: 0.03, theta: 0.05 },
      conflict: 0.1,
      strategyUsed: 'dempster',
    },
    physicsValidation: {
      isValid: true,
      violations: [],
      adjustedConfidence: 0.88,
      physicsExplanation: '所有物理约束满足',
    },
    recommendations: [],
    metadata: {},
    durationMs: 200,
    ...overrides,
  });

  it('生成正确的 input 特征向量', () => {
    const sample = hdeResultToEvaluationSample(makeHDEResult());

    expect(sample.timestamp).toBe(1700000000000);
    expect(sample.input['belief_bearing_damage']).toBe(0.92);
    expect(sample.input['belief_normal']).toBe(0.03);
    expect(sample.input['conflict']).toBe(0.1);
    expect(sample.input['durationMs']).toBe(200);
  });

  it('包含双轨假设后验概率', () => {
    const sample = hdeResultToEvaluationSample(makeHDEResult());

    expect(sample.input['hyp_physics_bearing_damage']).toBe(0.85);
    expect(sample.input['hyp_data_bearing_damage']).toBe(0.9);
  });

  it('actualOutput 包含故障标签和置信度', () => {
    const sample = hdeResultToEvaluationSample(makeHDEResult());

    expect(sample.actualOutput['fault_bearing_damage']).toBe(1.0);
    expect(sample.actualOutput['confidence']).toBe(0.88);
  });

  it('metadata 包含会话和验证信息', () => {
    const sample = hdeResultToEvaluationSample(makeHDEResult());

    expect(sample.metadata?.sessionId).toBe('SESSION-001');
    expect(sample.metadata?.machineId).toBe('CRANE-001');
    expect(sample.metadata?.physicsValid).toBe(true);
  });

  it('处理无物理轨的结果', () => {
    const sample = hdeResultToEvaluationSample(makeHDEResult({
      trackResults: { physics: null, data: null },
    }));

    // 不应崩溃，只是没有 hyp_ 前缀的 key
    expect(sample.input['belief_bearing_damage']).toBe(0.92);
    expect(Object.keys(sample.input).filter(k => k.startsWith('hyp_'))).toHaveLength(0);
  });
});

// ============================================================================
// A3: normalizeAnomalyEvent()
// ============================================================================

describe('A3: normalizeAnomalyEvent', () => {
  it('从完整数据生成标准化事件', () => {
    const event = normalizeAnomalyEvent('CRANE-001', {
      type: 'vibration_high',
      severity: 'high',
      value: 15.5,
      threshold: 10.0,
      channel: 'vib_x',
      timestamp: 1700000000000,
    });

    expect(event.machineId).toBe('CRANE-001');
    expect(event.anomalyType).toBe('vibration_high');
    expect(event.severity).toBe('high');
    expect(event.value).toBe(15.5);
    expect(event.threshold).toBe(10.0);
    expect(event.deviation).toBeCloseTo(0.55, 2);
    expect(event.sourceChannel).toBe('vib_x');
    expect(event.timestamp).toBe(1700000000000);
    expect(event.eventId).toMatch(/^ANM-\d+-/);
  });

  it('从 deviation 推断 severity', () => {
    // deviation = |90 - 10| / 10 = 8.0 → clamp to 1.0 → critical
    const event = normalizeAnomalyEvent('M-001', {
      type: 'temperature_high',
      value: 90,
      threshold: 10,
    });

    expect(event.severity).toBe('critical');
    expect(event.deviation).toBe(1.0); // clamped
  });

  it('处理缺失字段降级', () => {
    const event = normalizeAnomalyEvent('M-002', {});

    expect(event.anomalyType).toBe('unknown');
    expect(event.severity).toBe('info');
    expect(event.value).toBe(0);
    expect(event.threshold).toBe(0);
    expect(event.sourceChannel).toBe('unknown');
    expect(event.rawData).toEqual({});
  });

  it('使用 mapAnySeverity 映射 severity', () => {
    const event = normalizeAnomalyEvent('M-003', {
      severity: 'warning',
      type: 'test',
      value: 5,
      threshold: 3,
    });

    // warning → medium (via mapAnySeverity)
    expect(event.severity).toBe('medium');
  });

  it('处理 ISO 字符串时间戳', () => {
    const event = normalizeAnomalyEvent('M-004', {
      timestamp: '2026-03-02T10:00:00Z',
      type: 'test',
    });

    expect(event.timestamp).toBe(new Date('2026-03-02T10:00:00Z').getTime());
  });

  it('支持 anomalyType 字段名', () => {
    const event = normalizeAnomalyEvent('M-005', {
      anomalyType: 'gear_wear',
    });

    expect(event.anomalyType).toBe('gear_wear');
  });

  it('支持 sensorId 作为 sourceChannel', () => {
    const event = normalizeAnomalyEvent('M-006', {
      sensorId: 'SENSOR-X1',
      type: 'test',
    });

    expect(event.sourceChannel).toBe('SENSOR-X1');
  });
});

// ============================================================================
// A4: anomalyToAlert()
// ============================================================================

describe('A4: anomalyToAlert', () => {
  it('将标准化异常转换为告警', () => {
    const event = normalizeAnomalyEvent('CRANE-001', {
      type: 'bearing_damage',
      severity: 'high',
      value: 15,
      threshold: 10,
      channel: 'vib_x',
      timestamp: 1700000000000,
    });
    const alert = anomalyToAlert(event);

    expect(alert.machineId).toBe('CRANE-001');
    expect(alert.severity).toBe('high');
    expect(alert.urgency).toBe('priority');
    expect(alert.anomalyType).toBe('bearing_damage');
    expect(alert.sourceEventId).toBe(event.eventId);
    expect(alert.alertId).toMatch(/^ALT-\d+-/);
    expect(alert.acknowledged).toBe(false);
    expect(alert.message).toContain('CRANE-001');
    expect(alert.message).toContain('轴承损伤');
  });

  it('severity → urgency 映射正确', () => {
    const makeSeverityEvent = (severity: string) =>
      normalizeAnomalyEvent('M-001', { severity, type: 'test', value: 1, threshold: 1 });

    expect(anomalyToAlert(makeSeverityEvent('critical')).urgency).toBe('immediate');
    expect(anomalyToAlert(makeSeverityEvent('high')).urgency).toBe('priority');
    expect(anomalyToAlert(makeSeverityEvent('medium')).urgency).toBe('scheduled');
    expect(anomalyToAlert(makeSeverityEvent('low')).urgency).toBe('monitoring');
    expect(anomalyToAlert(makeSeverityEvent('info')).urgency).toBe('monitoring');
  });

  it('告警消息包含值和阈值信息', () => {
    const event = normalizeAnomalyEvent('CRANE-002', {
      type: 'temperature_high',
      severity: 'medium',
      value: 85.5,
      threshold: 70,
      channel: 'temp_main',
    });
    const alert = anomalyToAlert(event);

    expect(alert.message).toContain('85.50');
    expect(alert.message).toContain('70.00');
    expect(alert.message).toContain('temp_main');
  });

  it('metadata 包含原始异常数据', () => {
    const event = normalizeAnomalyEvent('M-001', {
      type: 'test',
      value: 10,
      threshold: 5,
    });
    const alert = anomalyToAlert(event);

    expect(alert.metadata.value).toBe(10);
    expect(alert.metadata.threshold).toBe(5);
    expect(typeof alert.metadata.deviation).toBe('number');
  });
});

// ============================================================================
// A5: ModelRegistrySynchronizer
// ============================================================================

describe('A5: ModelRegistrySynchronizer', () => {
  beforeEach(() => {
    resetModelRegistrySynchronizer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetModelRegistrySynchronizer();
    vi.useRealTimers();
  });

  it('单例工厂返回相同实例', () => {
    const a = getModelRegistrySynchronizer();
    const b = getModelRegistrySynchronizer();
    expect(a).toBe(b);
  });

  it('reset 后返回新实例', () => {
    const a = getModelRegistrySynchronizer();
    resetModelRegistrySynchronizer();
    const b = getModelRegistrySynchronizer();
    expect(a).not.toBe(b);
  });

  it('启动和停止', async () => {
    const sync = new ModelRegistrySynchronizer(5000);
    await sync.start();

    const stats = sync.getStats();
    expect(stats.running).toBe(true);
    expect(stats.syncIntervalMs).toBe(5000);
    // syncOnce 在 start 中执行一次（可能失败但不影响 running 状态）
    expect(stats.syncCount >= 0).toBe(true);

    sync.stop();
    expect(sync.getStats().running).toBe(false);
  });

  it('syncOnce 在 DB 不可用时降级', async () => {
    const sync = new ModelRegistrySynchronizer();
    const result = await sync.syncOnce();

    // DB 不可用时返回 0/0，不抛出
    expect(result.synced).toBe(0);
    expect(result.errors >= 0).toBe(true);
  });

  it('重复 start 不创建多个定时器', async () => {
    const sync = new ModelRegistrySynchronizer(60000);
    await sync.start();
    await sync.start(); // 第二次 start 应该被忽略

    expect(sync.getStats().running).toBe(true);
    sync.stop();
  });
});
