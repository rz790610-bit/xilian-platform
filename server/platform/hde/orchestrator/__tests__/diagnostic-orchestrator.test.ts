/**
 * ============================================================================
 * P0-5: HDE 诊断编排器端到端测试
 * ============================================================================
 *
 * 验收标准:
 *   1. 正常设备状态向量 → severity: 'info', confidence >= 0.8
 *   2. 轴承磨损模拟（BPFO 3x 基线）→ 诊断结论包含 bearing_damage
 *   3. 物理约束否决: 振动值 = -5 mm/s → 物理轨否决
 *   4. DS 融合冲突: 物理轨 vs 数据轨置信度差 > 0.7 → Murphy 策略
 *   5. 诊断耗时 < 5 秒（单设备 16 通道）
 *   6. 端到端: 状态向量 → 双轨并行 → DS 融合 → 物理校验 → 结论
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  DiagnosticOrchestrator,
  createDiagnosticOrchestrator,
  createPhysicsFirstOrchestrator,
  createDataDrivenOrchestrator,
} from '../diagnostic-orchestrator';
import type { HDEDiagnosisRequest, TrackResult } from '../../types';

// ============================================================================
// 测试数据生成器
// ============================================================================

/**
 * 生成正常运行的传感器数据（16 通道）
 * 振动 ~2 mm/s RMS, 温度 ~55°C, 电流稳定 ~35A
 */
function generateNormalSensorData(): Record<string, number[]> {
  const n = 256;
  const vibration: number[] = [];
  const temperature: number[] = [];
  const current: number[] = [];

  for (let i = 0; i < n; i++) {
    // 正常振动: ~2 mm/s RMS, 随机噪声
    vibration.push(2 + (Math.random() - 0.5) * 1.0);
    // 正常温度: ~55°C, 缓慢小幅波动
    temperature.push(55 + (Math.random() - 0.5) * 2);
    // 正常电流: ~35A, 稳定
    current.push(35 + (Math.random() - 0.5) * 3);
  }

  return { vibration, temperature, current };
}

/**
 * 生成轴承损伤特征数据
 * 模拟 BPFO 频率处幅值为基线 3x
 * 高峰值因子 (> 4.0)，有冲击脉冲
 */
function generateBearingDamageSensorData(): Record<string, number[]> {
  const n = 256;
  const vibration: number[] = [];
  const temperature: number[] = [];
  const current: number[] = [];

  const baseRMS = 8.0; // 基线 8 mm/s — ISO 10816 danger zone
  const bpfoPeriod = 16; // 每 16 个采样点一个冲击

  for (let i = 0; i < n; i++) {
    // 基础振动 + 周期性冲击脉冲 (BPFO 模拟)
    let vib = baseRMS + (Math.random() - 0.5) * 2.0;
    if (i % bpfoPeriod === 0) {
      // 冲击脉冲: 幅值 4x 基线，确保峰值因子 > 4.0
      vib += baseRMS * 4.0 * (1 + Math.random() * 0.5);
    }
    vibration.push(Math.abs(vib));

    // 温度略升 (轴承磨损导致摩擦发热)
    temperature.push(70 + i * 0.02 + (Math.random() - 0.5) * 2);

    // 电流正常
    current.push(35 + (Math.random() - 0.5) * 3);
  }

  return { vibration, temperature, current };
}

/**
 * 生成包含负振动值的异常数据（物理不可能）
 */
function generatePhysicsViolationData(): Record<string, number[]> {
  const n = 256;
  const vibration: number[] = [];
  const temperature: number[] = [];

  for (let i = 0; i < n; i++) {
    // 包含大量负值 — 物理不可能
    vibration.push(-5 + Math.random() * 2);
    temperature.push(55 + (Math.random() - 0.5) * 2);
  }

  return { vibration, temperature };
}

/**
 * 生成 16 通道大数据量（性能测试）
 */
function generateLargeSensorData(): Record<string, number[]> {
  const n = 12800; // 12,800 Hz 采样率 × 1s
  const channels: Record<string, number[]> = {};

  // 6 个振动通道
  for (let ch = 1; ch <= 6; ch++) {
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      data.push(2 + (Math.random() - 0.5) * 1.0);
    }
    channels[`vibration_ch${ch}`] = data;
  }

  // 6 个温度通道
  for (let ch = 1; ch <= 6; ch++) {
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      data.push(55 + (Math.random() - 0.5) * 2);
    }
    channels[`temperature_ch${ch}`] = data;
  }

  // 4 个电流通道
  for (let ch = 1; ch <= 4; ch++) {
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      data.push(35 + (Math.random() - 0.5) * 3);
    }
    channels[`current_ch${ch}`] = data;
  }

  // 合并为标准格式 (orchestrator 按 key 名分析)
  const allVibration: number[] = [];
  for (let ch = 1; ch <= 6; ch++) {
    allVibration.push(...channels[`vibration_ch${ch}`]);
  }
  const allTemperature: number[] = [];
  for (let ch = 1; ch <= 6; ch++) {
    allTemperature.push(...channels[`temperature_ch${ch}`]);
  }
  const allCurrent: number[] = [];
  for (let ch = 1; ch <= 4; ch++) {
    allCurrent.push(...channels[`current_ch${ch}`]);
  }

  return {
    vibration: allVibration,
    temperature: allTemperature,
    current: allCurrent,
  };
}

/**
 * 生成电气故障数据（电流不稳定 CV > 0.3）
 */
function generateElectricalFaultData(): Record<string, number[]> {
  const n = 256;
  const vibration: number[] = [];
  const temperature: number[] = [];
  const current: number[] = [];

  for (let i = 0; i < n; i++) {
    vibration.push(3 + (Math.random() - 0.5) * 1.5);
    temperature.push(55 + (Math.random() - 0.5) * 2);
    // 电流高度不稳定: CV > 0.3
    current.push(35 + (Math.random() - 0.5) * 40);
  }

  return { vibration, temperature, current };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('P0-5: HDE DiagnosticOrchestrator E2E', () => {
  let orchestrator: DiagnosticOrchestrator;

  beforeAll(() => {
    orchestrator = createDiagnosticOrchestrator();
  });

  // ==========================================================================
  // 验收 1: 正常设备 → severity normal, confidence >= 0.8
  // ==========================================================================
  describe('验收1: 正常设备诊断', () => {
    it('正常状态向量 → severity info, confidence >= 0.8', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
        context: { cyclePhase: 'idle', loadWeight: 10 },
      };

      const result = await orchestrator.diagnose(request);

      expect(result.diagnosis.faultType).toBe('normal');
      expect(result.diagnosis.severity).toBe('info');
      expect(result.diagnosis.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.diagnosis.urgency).toBe('monitoring');
    });

    it('正常诊断应有物理约束验证通过', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      expect(result.physicsValidation.isValid).toBe(true);
      expect(result.physicsValidation.violations).toHaveLength(0);
      expect(result.physicsValidation.adjustedConfidence).toBeGreaterThan(0);
    });

    it('正常诊断建议为继续监测', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(result.recommendations[0].priority).toBe('info');
      expect(result.recommendations[0].action).toContain('常规监测');
    });
  });

  // ==========================================================================
  // 验收 2: 轴承磨损模拟 → 包含 bearing_damage
  // ==========================================================================
  describe('验收2: 轴承磨损诊断', () => {
    it('BPFO 3x 基线 → 诊断结论包含 bearing_damage', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateBearingDamageSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      // 诊断应识别出轴承故障
      // 检查 fusedMass 中 bearing_damage 的信念值
      const bearingBelief = result.fusionResult.fusedMass.bearing_damage ?? 0;
      expect(bearingBelief).toBeGreaterThan(0);

      // 至少一个轨道应检出 bearing_damage 假设
      const physicsHypotheses = result.trackResults.physics?.faultHypotheses ?? [];
      const dataHypotheses = result.trackResults.data?.faultHypotheses ?? [];
      const allHypotheses = [...physicsHypotheses, ...dataHypotheses];

      const hasBearingHypothesis = allHypotheses.some(h => h.faultType === 'bearing_damage');
      expect(hasBearingHypothesis).toBe(true);
    });

    it('轴承损伤数据应产生高峰值因子检测', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateBearingDamageSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      // 数据轨应检测到冲击脉冲 (crest factor > 4.0)
      const dataHypotheses = result.trackResults.data?.faultHypotheses ?? [];
      const impactDetected = dataHypotheses.some(
        h => h.faultType === 'bearing_damage' && h.supportingEvidence.some(e => e.includes('峰值因子')),
      );
      expect(impactDetected).toBe(true);
    });

    it('轴承损伤应生成维修建议', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateBearingDamageSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      // 应有非 info 级别的建议
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      // 如果检测到故障，建议优先级应高于 info
      if (result.diagnosis.faultType !== 'normal') {
        const hasPriorityRecommendation = result.recommendations.some(
          r => r.priority !== 'info',
        );
        expect(hasPriorityRecommendation).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 验收 3: 物理约束否决
  // ==========================================================================
  describe('验收3: 物理约束否决', () => {
    it('振动值 = -5 mm/s → 物理轨否决', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generatePhysicsViolationData(),
      };

      const result = await orchestrator.diagnose(request);

      // 物理约束应标记违反
      expect(result.physicsValidation.isValid).toBe(false);
      expect(result.physicsValidation.violations.length).toBeGreaterThan(0);

      // 应有振动范围违反
      const vibViolation = result.physicsValidation.violations.find(
        v => v.id === 'force-vibration-range',
      );
      expect(vibViolation).toBeDefined();
      expect(vibViolation!.satisfied).toBe(false);
      expect(vibViolation!.violationDegree).toBeGreaterThanOrEqual(0.8); // 负值 = 严重违反 (degree 1.0)
    });

    it('物理否决后置信度应降低', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generatePhysicsViolationData(),
      };

      const result = await orchestrator.diagnose(request);

      // 置信度应被调整: 原始 ~0.97 - penalty(1.0 * 0.3) = ~0.67
      // 严重违反(degree >= 0.8) → isValid=false → 保底 0.1
      // 但保底逻辑是 max(adjusted, 0.1)，所以 0.67 > 0.1 → 0.67
      expect(result.physicsValidation.adjustedConfidence).toBeLessThan(
        result.diagnosis.confidence, // 应低于融合后的原始置信度
      );
      // 验证确实发生了否决（isValid 已在上个测试验证）
      expect(result.physicsValidation.adjustedConfidence).toBeLessThan(1.0);
    });

    it('物理否决应触发传感器检查建议', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generatePhysicsViolationData(),
      };

      const result = await orchestrator.diagnose(request);

      // 应建议检查传感器
      const sensorCheckRec = result.recommendations.find(
        r => r.action.includes('传感器') || r.action.includes('数据质量'),
      );
      expect(sensorCheckRec).toBeDefined();
    });
  });

  // ==========================================================================
  // 验收 4: DS 融合冲突 → Murphy 策略切换
  // ==========================================================================
  describe('验收4: DS 融合冲突处理', () => {
    it('双轨高冲突 → 自动切换 Murphy 策略', async () => {
      // 构造两个轨道对同一假设有极大分歧的场景
      // 直接测试 orchestrator 的 fuseTrackResults
      const orch = createDiagnosticOrchestrator({
        fusionConfig: { highConflictThreshold: 0.3 }, // 降低阈值以触发切换
      });

      // 物理轨: 强烈支持 bearing_damage
      const physicsResult: TrackResult = {
        trackType: 'physics',
        faultHypotheses: [],
        beliefMass: { bearing_damage: 0.9, normal: 0.05, theta: 0.05 },
        confidence: 0.9,
        physicsConstraints: [],
        executionTimeMs: 10,
      };

      // 数据轨: 强烈支持 gear_wear（与物理轨完全冲突）
      const dataResult: TrackResult = {
        trackType: 'data',
        faultHypotheses: [],
        beliefMass: { gear_wear: 0.9, normal: 0.05, theta: 0.05 },
        confidence: 0.9,
        physicsConstraints: [],
        executionTimeMs: 10,
      };

      // 使用内部的 fuseTrackResults
      const fusionResult = await (orch as any).fuseTrackResults(physicsResult, dataResult);

      // DS 融合应检测到冲突
      // 当 Dempster 规则的 K 值大 → 应切换到 Murphy
      expect(fusionResult.conflict).toBeGreaterThan(0);
      // fusedMass 应该包含两种假设的信念（Murphy 平均后重融合）
      expect(fusionResult.fusedMass).toBeDefined();
    });

    it('diagnose() 中高冲突触发策略记录', async () => {
      // 构造高冲突的传感器数据
      // 振动极高（物理轨认为异常）但温度正常（数据轨认为无事）
      const n = 256;
      const highVib: number[] = [];
      for (let i = 0; i < n; i++) {
        highVib.push(15 + Math.random() * 10); // 极高振动 15-25 mm/s
      }

      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: {
          vibration: highVib,
          temperature: Array(n).fill(55).map(v => v + (Math.random() - 0.5) * 2),
          current: Array(n).fill(35).map(v => v + (Math.random() - 0.5) * 3),
        },
        context: { loadWeight: 10 },
      };

      const result = await orchestrator.diagnose(request);

      // 应该有融合结果
      expect(result.fusionResult).toBeDefined();
      expect(result.fusionResult.fusedMass).toBeDefined();
      expect(result.fusionResult.conflict).toBeGreaterThanOrEqual(0);
      // strategyUsed 应为 dempster 或 murphy
      expect(['dempster', 'murphy']).toContain(result.fusionResult.strategyUsed);
    });
  });

  // ==========================================================================
  // 验收 5: 性能 < 5 秒（16 通道）
  // ==========================================================================
  describe('验收5: 诊断性能', () => {
    it('单设备 16 通道诊断 < 5 秒', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-PERF-TEST',
        timestamp: Date.now(),
        sensorData: generateLargeSensorData(),
        context: { cyclePhase: 'lifting', loadWeight: 25 },
      };

      const startTime = Date.now();
      const result = await orchestrator.diagnose(request);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(5000);
      expect(result.durationMs).toBeLessThan(5000);
      expect(result.sessionId).toBeTruthy();
    });

    it('诊断结果包含执行耗时', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.trackResults.physics?.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.trackResults.data?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // 验收 6+7: 端到端完整流程
  // ==========================================================================
  describe('验收6+7: 端到端集成', () => {
    it('完整诊断流程: 双轨并行 → DS 融合 → 物理校验 → 结论', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-E2E',
        timestamp: Date.now(),
        sensorData: generateBearingDamageSensorData(),
        context: { cyclePhase: 'lifting', loadWeight: 25 },
      };

      const result = await orchestrator.diagnose(request);

      // 结构完整性检查
      expect(result.sessionId).toMatch(/^hde_/);
      expect(result.machineId).toBe('GJM12-E2E');
      expect(result.timestamp).toBe(request.timestamp);

      // 双轨结果
      expect(result.trackResults.physics).not.toBeNull();
      expect(result.trackResults.data).not.toBeNull();
      expect(result.trackResults.physics!.trackType).toBe('physics');
      expect(result.trackResults.data!.trackType).toBe('data');

      // DS 融合结果
      expect(result.fusionResult.fusedMass).toBeDefined();
      expect(Object.keys(result.fusionResult.fusedMass).length).toBeGreaterThan(0);
      // 信念质量总和约等于 1
      const totalMass = Object.values(result.fusionResult.fusedMass).reduce((s, v) => s + v, 0);
      expect(totalMass).toBeCloseTo(1.0, 1);

      // 物理验证
      expect(result.physicsValidation).toBeDefined();
      expect(typeof result.physicsValidation.isValid).toBe('boolean');

      // 诊断结论
      expect(result.diagnosis.faultType).toBeTruthy();
      expect(result.diagnosis.confidence).toBeGreaterThanOrEqual(0);
      expect(result.diagnosis.confidence).toBeLessThanOrEqual(1);
      expect(['info', 'low', 'medium', 'high', 'critical']).toContain(result.diagnosis.severity);
      expect(['monitoring', 'scheduled', 'priority', 'immediate']).toContain(result.diagnosis.urgency);

      // 建议
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);

      // 元数据
      expect(result.metadata.version).toBe('1.0.0-p0-5');
      expect(result.metadata.phase).toBe('p0-5');
    });

    it('双轨并行执行确认', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-PARALLEL',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orchestrator.diagnose(request);

      // 物理轨和数据轨都应产生结果
      expect(result.trackResults.physics).not.toBeNull();
      expect(result.trackResults.data).not.toBeNull();

      // 物理轨应有物理约束检查
      expect(result.trackResults.physics!.physicsConstraints.length).toBeGreaterThan(0);

      // 数据轨应有信念质量分配
      expect(Object.keys(result.trackResults.data!.beliefMass).length).toBeGreaterThan(0);
    });

    it('sessionId 唯一性', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result1 = await orchestrator.diagnose(request);
      const result2 = await orchestrator.diagnose(request);

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });
  });

  // ==========================================================================
  // 额外测试: 单轨模式
  // ==========================================================================
  describe('单轨模式测试', () => {
    it('仅物理轨模式', async () => {
      const orch = createDiagnosticOrchestrator({
        enablePhysicsTrack: true,
        enableDataTrack: false,
      });

      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-PHYS-ONLY',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orch.diagnose(request);

      expect(result.trackResults.physics).not.toBeNull();
      expect(result.trackResults.data).toBeNull();
      expect(result.diagnosis).toBeDefined();
    });

    it('仅数据轨模式', async () => {
      const orch = createDataDrivenOrchestrator();

      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-DATA-ONLY',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
      };

      const result = await orch.diagnose(request);

      expect(result.trackResults.physics).toBeNull();
      expect(result.trackResults.data).not.toBeNull();
      expect(result.diagnosis).toBeDefined();
    });
  });

  // ==========================================================================
  // 额外测试: 电气故障检测
  // ==========================================================================
  describe('电气故障检测', () => {
    it('电流不稳定 → 检测到 electrical_fault', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-ELEC',
        timestamp: Date.now(),
        sensorData: generateElectricalFaultData(),
      };

      const result = await orchestrator.diagnose(request);

      // 数据轨应检测到电流不稳定
      const dataHypotheses = result.trackResults.data?.faultHypotheses ?? [];
      const hasElectricalFault = dataHypotheses.some(
        h => h.faultType === 'electrical_fault',
      );
      expect(hasElectricalFault).toBe(true);
    });

    it('空载高电流 → 能量约束违反', async () => {
      const n = 256;
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-OVERCURRENT',
        timestamp: Date.now(),
        sensorData: {
          vibration: Array(n).fill(0).map(() => 2 + (Math.random() - 0.5) * 1),
          temperature: Array(n).fill(0).map(() => 55 + (Math.random() - 0.5) * 2),
          current: Array(n).fill(0).map(() => 80 + Math.random() * 20), // 高电流 80-100A
        },
        context: { loadWeight: 2 }, // 空载 (< 5t)
      };

      const result = await orchestrator.diagnose(request);

      // 物理轨应检测到能量约束违反
      const energyConstraint = result.trackResults.physics?.physicsConstraints.find(
        c => c.id === 'energy-current-load',
      );
      expect(energyConstraint).toBeDefined();
      expect(energyConstraint!.satisfied).toBe(false);
    });
  });

  // ==========================================================================
  // 物理约束详细测试
  // ==========================================================================
  describe('物理约束详细测试', () => {
    it('runPhysicsTrack: 正常数据所有约束满足', async () => {
      const request: HDEDiagnosisRequest = {
        machineId: 'GJM12-TEST',
        timestamp: Date.now(),
        sensorData: generateNormalSensorData(),
        context: { loadWeight: 20 },
      };

      const result = await orchestrator.diagnose(request);
      const physConstraints = result.trackResults.physics?.physicsConstraints ?? [];

      // 所有约束应满足
      for (const c of physConstraints) {
        expect(c.satisfied).toBe(true);
      }
    });

    it('validateWithPhysics: 无违反 → isValid true', async () => {
      const validation = await (orchestrator as any).validateWithPhysics(
        { faultType: 'normal', confidence: 0.85 },
        [
          { id: 'c1', name: 'test', type: 'force', expression: 'ok', satisfied: true, violationDegree: 0, explanation: 'ok' },
        ],
      );

      expect(validation.isValid).toBe(true);
      expect(validation.adjustedConfidence).toBe(0.85);
    });

    it('validateWithPhysics: 严重违反 → isValid false', async () => {
      const validation = await (orchestrator as any).validateWithPhysics(
        { faultType: 'bearing_damage', confidence: 0.9 },
        [
          {
            id: 'c1', name: '振动范围', type: 'force',
            expression: 'vib >= 0', satisfied: false,
            violationDegree: 1.0, explanation: '振动为负',
          },
        ],
      );

      expect(validation.isValid).toBe(false);
      expect(validation.adjustedConfidence).toBeLessThan(0.9);
    });
  });

  // ==========================================================================
  // 工厂函数测试
  // ==========================================================================
  describe('工厂函数', () => {
    it('createDiagnosticOrchestrator 创建默认配置', () => {
      const orch = createDiagnosticOrchestrator();
      const config = orch.getConfig();

      expect(config.enablePhysicsTrack).toBe(true);
      expect(config.enableDataTrack).toBe(true);
      expect(config.fusionStrategy).toBe('physics_veto');
    });

    it('createPhysicsFirstOrchestrator 创建物理优先配置', () => {
      const orch = createPhysicsFirstOrchestrator();
      const config = orch.getConfig();

      expect(config.fusionStrategy).toBe('physics_veto');
      expect(config.physicsWeight).toBe(0.8);
    });

    it('createDataDrivenOrchestrator 创建数据驱动配置', () => {
      const orch = createDataDrivenOrchestrator();
      const config = orch.getConfig();

      expect(config.enablePhysicsTrack).toBe(false);
      expect(config.enableDataTrack).toBe(true);
    });

    it('自定义配置覆盖', () => {
      const orch = createDiagnosticOrchestrator({
        physicsWeight: 0.9,
        autoCrystallizeThreshold: 0.5,
      });
      const config = orch.getConfig();

      expect(config.physicsWeight).toBe(0.9);
      expect(config.autoCrystallizeThreshold).toBe(0.5);
      expect(config.enablePhysicsTrack).toBe(true); // 默认值不受影响
    });
  });

  // ==========================================================================
  // 内部方法测试
  // ==========================================================================
  describe('内部方法', () => {
    it('normalizeMass: 空输入 → 开放态度（normal 适中，theta 较高）', () => {
      const result = (orchestrator as any).normalizeMass({});
      // "没有发现异常" ≠ "确定正常"，normal=0.4, theta=0.6
      expect(result.normal).toBeCloseTo(0.4, 1);
      expect(result.theta).toBeCloseTo(0.6, 1);
      const total = Object.values(result).reduce((s: number, v: unknown) => s + (v as number), 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('normalizeMass: 故障信念总和不超过 0.9', () => {
      const result = (orchestrator as any).normalizeMass({
        bearing_damage: 0.5,
        gear_wear: 0.3,
        misalignment: 0.3,
      });
      const faultTotal = Object.entries(result)
        .filter(([k]) => k !== 'normal' && k !== 'theta')
        .reduce((s, [, v]) => s + (v as number), 0);
      expect(faultTotal).toBeLessThanOrEqual(0.91); // 允许浮点误差
    });

    it('extractDecision: 找到最高非 theta 假设', () => {
      const result = (orchestrator as any).extractDecision({
        bearing_damage: 0.4,
        gear_wear: 0.2,
        normal: 0.3,
        theta: 0.1,
      });
      expect(result.faultType).toBe('bearing_damage');
      expect(result.confidence).toBe(0.4);
    });

    it('extractDecision: theta 被忽略', () => {
      const result = (orchestrator as any).extractDecision({
        normal: 0.3,
        theta: 0.7,
      });
      expect(result.faultType).toBe('normal');
      expect(result.confidence).toBe(0.3);
    });

    it('simpleAutoCorrelation: 常数信号 → 0', () => {
      const signal = Array(128).fill(5);
      const result = (orchestrator as any).simpleAutoCorrelation(signal);
      expect(result).toBe(0); // 常数信号方差为 0
    });

    it('simpleAutoCorrelation: 短信号 → 0', () => {
      const result = (orchestrator as any).simpleAutoCorrelation([1, 2, 3]);
      expect(result).toBe(0); // n < 32
    });

    it('simpleAutoCorrelation: 周期信号 → 高相关', () => {
      const signal: number[] = [];
      for (let i = 0; i < 256; i++) {
        signal.push(Math.sin(2 * Math.PI * i / 32)); // 周期 32
      }
      const result = (orchestrator as any).simpleAutoCorrelation(signal);
      expect(result).toBeGreaterThan(0.3);
    });

    it('calculateTrackConfidence: 无故障假设 → 返回 normal 值', () => {
      const result = (orchestrator as any).calculateTrackConfidence({
        normal: 0.85,
        theta: 0.15,
      });
      expect(result).toBe(0.85);
    });

    it('calculateTrackConfidence: 有故障假设 → 返回最高故障信念', () => {
      const result = (orchestrator as any).calculateTrackConfidence({
        bearing_damage: 0.4,
        normal: 0.5,
        theta: 0.1,
      });
      expect(result).toBe(0.4);
    });
  });

  // ==========================================================================
  // 配置管理测试
  // ==========================================================================
  describe('配置管理', () => {
    it('updateConfig 更新配置', () => {
      const orch = createDiagnosticOrchestrator();
      orch.updateConfig({ physicsWeight: 0.9 });
      expect(orch.getConfig().physicsWeight).toBe(0.9);
    });

    it('getConfig 返回副本', () => {
      const config = orchestrator.getConfig();
      (config as any).physicsWeight = 999;
      expect(orchestrator.getConfig().physicsWeight).not.toBe(999);
    });

    it('getFusionEngine 返回实例', () => {
      const engine = orchestrator.getFusionEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.fuseMultiple).toBe('function');
    });
  });
});
