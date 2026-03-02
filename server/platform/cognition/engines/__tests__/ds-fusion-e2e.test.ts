/**
 * ============================================================================
 * P1-1: DS 融合引擎端到端验证
 * ============================================================================
 *
 * 验收标准:
 *   1. 3 源证据一致指向 bearing_damage → 融合后 belief(bearing_damage) >= 0.8
 *   2. 2 源冲突（轴承损坏 vs 正常）→ 自动切换 Murphy 策略，冲突度 K 输出正确
 *   3. physics_veto 测试：数据轨置信度 0.9 但违反能量守恒 → 最终结论不含该假设
 *   4. 融合结果 9 假设的 belief 之和 + uncertainty = 1.0（概率完备性）
 *   5. 融合日志写入 hde_fusion_logs 表，包含每步融合的 BPA 变化
 *
 * 额外覆盖:
 *   - Yager 规则（极端冲突 > 0.95）
 *   - 证据源可靠性折扣
 *   - 融合日志 → DB 行映射
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DSFusionEngine,
  createDSFusionEngine,
  mapFusionLogToDBRows,
} from '../ds-fusion.engine';
import type {
  DSFusionEngineConfig,
  DSEvidenceInput,
  DSFusionOutput,
  DSPhysicsVetoRule,
} from '../../types';

// ============================================================================
// 港机设备故障诊断 — 9 假设辨识框架
// ============================================================================

const FRAME_OF_DISCERNMENT = [
  'bearing_damage',     // 轴承损伤
  'gear_wear',          // 齿轮磨损
  'misalignment',       // 不对中
  'imbalance',          // 不平衡
  'looseness',          // 松动
  'electrical_fault',   // 电气故障
  'structural_fatigue', // 结构疲劳
  'corrosion',          // 腐蚀
  'normal',             // 正常
];

// ============================================================================
// 辅助函数
// ============================================================================

/** 计算信念质量总和（含 theta） */
function totalMass(mass: Record<string, number>): number {
  return Object.values(mass).reduce((sum, v) => sum + v, 0);
}

/** 创建标准配置的引擎 */
function createStandardEngine(overrides?: Partial<DSFusionEngineConfig>): DSFusionEngine {
  return createDSFusionEngine({
    frameOfDiscernment: FRAME_OF_DISCERNMENT,
    defaultStrategy: 'dempster',
    highConflictThreshold: 0.7,
    extremeConflictThreshold: 0.95,
    conflictPenaltyFactor: 0.3,
    sources: [],
    ...overrides,
  });
}

/** 创建证据输入 */
function makeEvidence(sourceId: string, beliefs: Record<string, number>): DSEvidenceInput {
  return {
    sourceId,
    beliefMass: beliefs,
    timestamp: new Date(),
  };
}

// ============================================================================
// P1-1 场景 1: 3 源证据一致 → bearing_damage belief >= 0.8
// ============================================================================

describe('P1-1: DS 融合引擎端到端验证', () => {
  let engine: DSFusionEngine;

  beforeEach(() => {
    engine = createStandardEngine();
  });

  describe('场景1: 3源证据一致指向 bearing_damage → belief >= 0.8', () => {
    it('振动+温度+电流 三源一致 → bearing_damage 融合后 belief >= 0.8', () => {
      // 振动传感器: 高置信度指向轴承损伤
      const vibrationEvidence = makeEvidence('vibration', {
        bearing_damage: 0.70,
        normal: 0.10,
        theta: 0.20,
      });

      // 温度传感器: 中等置信度指向轴承损伤（摩擦发热）
      const temperatureEvidence = makeEvidence('temperature', {
        bearing_damage: 0.60,
        normal: 0.15,
        theta: 0.25,
      });

      // 电流传感器: 较低置信度指向轴承损伤
      const currentEvidence = makeEvidence('current', {
        bearing_damage: 0.50,
        normal: 0.20,
        theta: 0.30,
      });

      const result = engine.fuseWithReliability([
        vibrationEvidence,
        temperatureEvidence,
        currentEvidence,
      ]);

      // 验收标准: belief(bearing_damage) >= 0.8
      expect(result.fusedMass.bearing_damage).toBeGreaterThanOrEqual(0.8);
      expect(result.decision).toBe('bearing_damage');
      expect(result.strategyUsed).toBe('dempster'); // 低冲突，不切换
      expect(result.totalConflict).toBeLessThan(0.7); // 一致证据，冲突低
    });

    it('三源完全一致时，融合后置信度显著高于单源', () => {
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.6, theta: 0.4 }),
        makeEvidence('s2', { bearing_damage: 0.6, theta: 0.4 }),
        makeEvidence('s3', { bearing_damage: 0.6, theta: 0.4 }),
      ];

      const result = engine.fuseWithReliability(sources);

      // 三次 0.6 融合后应远高于 0.6
      expect(result.fusedMass.bearing_damage).toBeGreaterThan(0.8);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  // ============================================================================
  // P1-1 场景 2: 2源冲突 → 自动切换 Murphy 策略
  // ============================================================================

  describe('场景2: 2源冲突 → 自动切换 Murphy 策略', () => {
    it('高冲突证据 → fuseWithReliability 自动切换 Murphy', () => {
      // 3 源：前两源高度冲突，第三源触发策略切换
      const sources = [
        // 振动: 强烈指向轴承损伤
        makeEvidence('vibration', {
          bearing_damage: 0.90,
          theta: 0.10,
        }),
        // 温度: 强烈指向正常（矛盾！）
        makeEvidence('temperature', {
          normal: 0.90,
          theta: 0.10,
        }),
        // 电流: 中等指向轴承损伤
        makeEvidence('current', {
          bearing_damage: 0.60,
          theta: 0.40,
        }),
      ];

      const result = engine.fuseWithReliability(sources);

      // 验收: 冲突度 K 应大于 0.7
      expect(result.totalConflict).toBeGreaterThan(0.7);

      // 验收: 策略应切换到 murphy（第 3 步因高冲突触发）
      const lastLog = result.fusionLog[result.fusionLog.length - 1];
      expect(lastLog.strategyUsed).toBe('murphy');

      // 融合日志记录了切换
      const strategies = result.fusionLog.map(l => l.strategyUsed);
      expect(strategies).toContain('murphy');
    });

    it('Murphy 策略下冲突度输出正确', () => {
      // 使用显式 Murphy 策略融合两个冲突证据
      const evidence = [
        { bearing_damage: 0.85, theta: 0.15 },
        { normal: 0.90, theta: 0.10 },
      ];

      const murphyResult = engine.fuseMultiple(evidence, 'murphy');
      const dempsterResult = engine.fuseMultiple(evidence, 'dempster');

      // Murphy 的冲突度应低于 Dempster（Murphy 先平均再融合）
      expect(murphyResult.conflict).toBeLessThanOrEqual(dempsterResult.conflict);

      // 两种方法都应给出有效的信念质量
      expect(totalMass(murphyResult.beliefMass)).toBeCloseTo(1.0, 4);
      expect(totalMass(dempsterResult.beliefMass)).toBeCloseTo(1.0, 4);
    });
  });

  // ============================================================================
  // 额外场景: 极端冲突 → Yager 规则
  // ============================================================================

  describe('场景2b: 极端冲突 → Yager 规则', () => {
    it('冲突度 > 0.95 → 自动切换 Yager 策略', () => {
      // 3 源极端冲突
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.99, theta: 0.01 }),
        makeEvidence('s2', { normal: 0.99, theta: 0.01 }),
        makeEvidence('s3', { gear_wear: 0.90, theta: 0.10 }),
      ];

      const result = engine.fuseWithReliability(sources);

      // 步骤 1 冲突 ≈ 0.99×0.99 ≈ 0.98 > 0.95
      expect(result.totalConflict).toBeGreaterThan(0.95);

      // 最后一步应使用 Yager
      const lastLog = result.fusionLog[result.fusionLog.length - 1];
      expect(lastLog.strategyUsed).toBe('yager');

      // Yager: 冲突质量转移到 theta，结果更保守
      expect(result.fusedMass.theta).toBeGreaterThan(0);
    });

    it('Yager 规则不做归一化，冲突转移到 theta', () => {
      const [fused, conflict] = engine.yagerCombination(
        { bearing_damage: 0.9, theta: 0.1 },
        { normal: 0.9, theta: 0.1 },
      );

      // 冲突 = 0.9 × 0.9 = 0.81
      expect(conflict).toBeCloseTo(0.81, 2);

      // theta 应包含冲突质量
      expect(fused.theta).toBeGreaterThan(0.8);

      // 总质量仍为 1.0（Yager 保持概率完备性）
      expect(totalMass(fused)).toBeCloseTo(1.0, 4);
    });
  });

  // ============================================================================
  // P1-1 场景 3: physics_veto → 否决违反能量守恒的假设
  // ============================================================================

  describe('场景3: physics_veto — 违反能量守恒 → 假设被否决', () => {
    it('数据轨置信度 0.9 但违反能量守恒 → 最终结论不含该假设', () => {
      // 构造融合结果：数据轨高度支持 bearing_damage
      const sources = [
        makeEvidence('vibration', { bearing_damage: 0.85, normal: 0.05, theta: 0.10 }),
        makeEvidence('temperature', { bearing_damage: 0.80, normal: 0.10, theta: 0.10 }),
      ];

      const fusionResult = engine.fuseWithReliability(sources);

      // 融合后 bearing_damage 应该很高（~0.9+）
      expect(fusionResult.fusedMass.bearing_damage).toBeGreaterThan(0.8);
      expect(fusionResult.decision).toBe('bearing_damage');

      // 物理约束：能量守恒检查失败
      const vetoRules: DSPhysicsVetoRule[] = [{
        hypothesis: 'bearing_damage',
        constraintId: 'energy_conservation_001',
        description: '振动能量超过输入功率上限，违反能量守恒',
        constraintType: 'energy_conservation',
        violated: true,
        violationDegree: 0.95,
      }];

      const { output, vetoResult } = engine.applyPhysicsVeto(fusionResult, vetoRules);

      // 验收: 最终结论不含 bearing_damage
      expect(output.fusedMass.bearing_damage).toBe(0);
      expect(output.decision).not.toBe('bearing_damage');

      // 否决结果验证
      expect(vetoResult.vetoed).toBe(true);
      expect(vetoResult.vetoedHypotheses).toContain('bearing_damage');
      expect(vetoResult.originalMass.bearing_damage).toBeGreaterThan(0.8);

      // 信念质量转移到了 theta
      expect(output.fusedMass.theta).toBeGreaterThan(vetoResult.originalMass.theta || 0);

      // 否决日志记录
      expect(vetoResult.vetoLog).toHaveLength(1);
      expect(vetoResult.vetoLog[0].constraintId).toBe('energy_conservation_001');
      expect(vetoResult.vetoLog[0].reason).toContain('能量守恒');
    });

    it('未违反物理约束时不否决', () => {
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.8, theta: 0.2 }),
        makeEvidence('s2', { bearing_damage: 0.7, theta: 0.3 }),
      ];

      const fusionResult = engine.fuseWithReliability(sources);

      // 物理约束通过
      const vetoRules: DSPhysicsVetoRule[] = [{
        hypothesis: 'bearing_damage',
        constraintId: 'energy_conservation_001',
        description: '能量守恒检查通过',
        constraintType: 'energy_conservation',
        violated: false,
        violationDegree: 0,
      }];

      const { output, vetoResult } = engine.applyPhysicsVeto(fusionResult, vetoRules);

      expect(vetoResult.vetoed).toBe(false);
      expect(vetoResult.vetoedHypotheses).toHaveLength(0);
      expect(output.decision).toBe('bearing_damage');
    });

    it('否决后融合日志包含 physics_veto 条目', () => {
      const sources = [
        makeEvidence('s1', { gear_wear: 0.85, theta: 0.15 }),
        makeEvidence('s2', { gear_wear: 0.75, theta: 0.25 }),
      ];

      const result = engine.fuseWithReliability(sources);
      const logLengthBefore = result.fusionLog.length;

      engine.applyPhysicsVeto(result, [{
        hypothesis: 'gear_wear',
        constraintId: 'force_balance_002',
        description: '力矩不平衡，违反力学约束',
        constraintType: 'force_balance',
        violated: true,
        violationDegree: 0.9,
      }]);

      // 否决操作应在日志中新增一条
      expect(result.fusionLog.length).toBe(logLengthBefore + 1);

      const vetoEntry = result.fusionLog[result.fusionLog.length - 1];
      expect(vetoEntry.sourceId).toBe('physics_veto:force_balance_002');
      expect(vetoEntry.inputMass).toHaveProperty('gear_wear');
    });
  });

  // ============================================================================
  // P1-1 场景 4: 概率完备性 — 9 假设 belief 之和 + uncertainty = 1.0
  // ============================================================================

  describe('场景4: 概率完备性 — belief之和 + uncertainty = 1.0', () => {
    it('Dempster 融合后概率完备（3 源一致）', () => {
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.7, normal: 0.1, theta: 0.2 }),
        makeEvidence('s2', { bearing_damage: 0.6, normal: 0.15, theta: 0.25 }),
        makeEvidence('s3', { bearing_damage: 0.5, normal: 0.2, theta: 0.3 }),
      ];

      const result = engine.fuseWithReliability(sources);
      const sum = totalMass(result.fusedMass);

      expect(sum).toBeCloseTo(1.0, 6);
    });

    it('Murphy 融合后概率完备', () => {
      const evidence = [
        { bearing_damage: 0.5, gear_wear: 0.3, theta: 0.2 },
        { normal: 0.6, bearing_damage: 0.2, theta: 0.2 },
        { gear_wear: 0.4, imbalance: 0.3, theta: 0.3 },
      ];

      const result = engine.fuseMultiple(evidence, 'murphy');
      const sum = totalMass(result.beliefMass);

      expect(sum).toBeCloseTo(1.0, 6);
    });

    it('Yager 融合后概率完备', () => {
      const evidence = [
        { bearing_damage: 0.9, theta: 0.1 },
        { normal: 0.9, theta: 0.1 },
      ];

      const result = engine.fuseMultiple(evidence, 'yager');
      const sum = totalMass(result.beliefMass);

      expect(sum).toBeCloseTo(1.0, 6);
    });

    it('physics_veto 后概率完备', () => {
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.8, normal: 0.05, theta: 0.15 }),
        makeEvidence('s2', { bearing_damage: 0.7, normal: 0.1, theta: 0.2 }),
      ];

      const result = engine.fuseWithReliability(sources);
      engine.applyPhysicsVeto(result, [{
        hypothesis: 'bearing_damage',
        constraintId: 'ec001',
        description: '能量守恒违反',
        constraintType: 'energy_conservation',
        violated: true,
        violationDegree: 0.9,
      }]);

      const sum = totalMass(result.fusedMass);
      expect(sum).toBeCloseTo(1.0, 6);
    });

    it('空证据返回 theta=1.0', () => {
      const result = engine.fuseWithReliability([]);
      expect(result.fusedMass.theta).toBeCloseTo(1.0, 6);
      expect(totalMass(result.fusedMass)).toBeCloseTo(1.0, 6);
    });

    it('9 假设框架全覆盖下概率完备', () => {
      // 构造覆盖所有 9 个假设的证据
      const evidence: Array<Record<string, number>> = [
        {
          bearing_damage: 0.15, gear_wear: 0.10, misalignment: 0.05,
          imbalance: 0.05, looseness: 0.05, electrical_fault: 0.05,
          structural_fatigue: 0.02, corrosion: 0.02, normal: 0.01, theta: 0.50,
        },
        {
          bearing_damage: 0.20, gear_wear: 0.05, misalignment: 0.10,
          imbalance: 0.03, looseness: 0.02, electrical_fault: 0.10,
          structural_fatigue: 0.05, corrosion: 0.05, normal: 0.10, theta: 0.30,
        },
      ];

      const result = engine.fuseMultiple(evidence, 'dempster');
      const sum = totalMass(result.beliefMass);
      expect(sum).toBeCloseTo(1.0, 6);
    });
  });

  // ============================================================================
  // P1-1 场景 5: 融合日志 → hde_fusion_logs 表映射
  // ============================================================================

  describe('场景5: 融合日志结构 → hde_fusion_logs 表映射', () => {
    it('fusionLog 每步包含完整 BPA 变化', () => {
      const sources = [
        makeEvidence('vibration', { bearing_damage: 0.7, theta: 0.3 }),
        makeEvidence('temperature', { bearing_damage: 0.6, theta: 0.4 }),
        makeEvidence('current', { bearing_damage: 0.5, theta: 0.5 }),
      ];

      const result = engine.fuseWithReliability(sources);

      // 3 源 → 3 条日志（step 0 初始 + step 1 + step 2）
      expect(result.fusionLog).toHaveLength(3);

      // 每条日志包含必要字段
      for (const entry of result.fusionLog) {
        expect(entry).toHaveProperty('step');
        expect(entry).toHaveProperty('sourceId');
        expect(entry).toHaveProperty('inputMass');
        expect(entry).toHaveProperty('outputMass');
        expect(entry).toHaveProperty('stepConflict');
        expect(entry).toHaveProperty('cumulativeConflict');
        expect(entry).toHaveProperty('strategyUsed');

        // inputMass 和 outputMass 是非空对象
        expect(Object.keys(entry.inputMass).length).toBeGreaterThan(0);
        expect(Object.keys(entry.outputMass).length).toBeGreaterThan(0);
      }

      // 步骤号递增
      expect(result.fusionLog[0].step).toBe(0);
      expect(result.fusionLog[1].step).toBe(1);
      expect(result.fusionLog[2].step).toBe(2);

      // 证据源 ID 对应
      expect(result.fusionLog[0].sourceId).toBe('vibration');
      expect(result.fusionLog[1].sourceId).toBe('temperature');
      expect(result.fusionLog[2].sourceId).toBe('current');
    });

    it('mapFusionLogToDBRows 正确映射到 hde_fusion_logs 表格式', () => {
      const sources = [
        makeEvidence('vibration', { bearing_damage: 0.9, theta: 0.1 }),
        makeEvidence('temperature', { normal: 0.9, theta: 0.1 }),
        makeEvidence('current', { bearing_damage: 0.6, theta: 0.4 }),
      ];

      const result = engine.fuseWithReliability(sources);
      const sessionId = 'hde_test_001';
      const dbRows = mapFusionLogToDBRows(sessionId, result);

      // 行数与日志一致
      expect(dbRows).toHaveLength(result.fusionLog.length);

      // 验证第一行结构
      const firstRow = dbRows[0];
      expect(firstRow.sessionId).toBe(sessionId);
      expect(firstRow.step).toBe(0);
      expect(firstRow.sourceId).toBe('vibration');
      expect(firstRow.sourceType).toBe('evidence');
      expect(firstRow.strategySwitched).toBe(false);
      expect(firstRow.switchReason).toBeNull();

      // 每行有完整的 inputMass/outputMass
      for (const row of dbRows) {
        expect(row.inputMass).toBeDefined();
        expect(row.outputMass).toBeDefined();
        expect(typeof row.stepConflict).toBe('number');
        expect(typeof row.cumulativeConflict).toBe('number');
        expect(typeof row.strategyUsed).toBe('string');
      }
    });

    it('策略切换时 strategySwitched=true 且记录原因', () => {
      // 构造高冲突场景触发策略切换
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.90, theta: 0.10 }),
        makeEvidence('s2', { normal: 0.90, theta: 0.10 }),
        makeEvidence('s3', { bearing_damage: 0.60, theta: 0.40 }),
      ];

      const result = engine.fuseWithReliability(sources);
      const dbRows = mapFusionLogToDBRows('hde_test_switch', result);

      // 找到策略切换的行
      const switchedRows = dbRows.filter(r => r.strategySwitched);
      expect(switchedRows.length).toBeGreaterThanOrEqual(1);

      for (const row of switchedRows) {
        expect(row.switchReason).not.toBeNull();
        expect(row.switchReason!).toContain('exceeded threshold');
      }
    });

    it('physics_veto 日志行 sourceType 为 veto', () => {
      const sources = [
        makeEvidence('s1', { bearing_damage: 0.8, theta: 0.2 }),
        makeEvidence('s2', { bearing_damage: 0.7, theta: 0.3 }),
      ];

      const result = engine.fuseWithReliability(sources);
      engine.applyPhysicsVeto(result, [{
        hypothesis: 'bearing_damage',
        constraintId: 'ec001',
        description: '能量守恒违反',
        constraintType: 'energy_conservation',
        violated: true,
        violationDegree: 0.9,
      }]);

      const dbRows = mapFusionLogToDBRows('hde_test_veto', result);
      const vetoRow = dbRows.find(r => r.sourceType === 'veto');

      expect(vetoRow).toBeDefined();
      expect(vetoRow!.sourceId).toContain('physics_veto:');
    });
  });

  // ============================================================================
  // 额外场景: 证据源可靠性折扣
  // ============================================================================

  describe('额外: 证据源可靠性折扣', () => {
    it('低可靠性源的影响被削弱', () => {
      const engineWithSources = createDSFusionEngine({
        frameOfDiscernment: FRAME_OF_DISCERNMENT,
        defaultStrategy: 'dempster',
        highConflictThreshold: 0.7,
        extremeConflictThreshold: 0.95,
        conflictPenaltyFactor: 0.3,
        sources: [
          {
            id: 'reliable',
            name: '可靠传感器',
            type: 'sensor',
            initialReliability: 0.95,
            currentReliability: 0.95,
            decayFactor: 0.9,
            recoveryFactor: 0.1,
            minReliability: 0.3,
            enabled: true,
            correctCount: 0,
            errorCount: 0,
            lastUpdatedAt: new Date(),
          },
          {
            id: 'unreliable',
            name: '不可靠传感器',
            type: 'sensor',
            initialReliability: 0.4,
            currentReliability: 0.4,
            decayFactor: 0.9,
            recoveryFactor: 0.1,
            minReliability: 0.1,
            enabled: true,
            correctCount: 0,
            errorCount: 0,
            lastUpdatedAt: new Date(),
          },
        ],
      });

      const sources = [
        makeEvidence('reliable', { bearing_damage: 0.8, theta: 0.2 }),
        makeEvidence('unreliable', { normal: 0.9, theta: 0.1 }),
      ];

      const result = engineWithSources.fuseWithReliability(sources);

      // 可靠源的证据应主导结果
      expect(result.fusedMass.bearing_damage).toBeGreaterThan(result.fusedMass.normal || 0);
      // 不可靠源降低了冲突（因为信念被折扣到 theta）
      expect(result.sourceContributions.reliable).toBe(0.95);
      expect(result.sourceContributions.unreliable).toBe(0.4);
    });
  });

  // ============================================================================
  // 额外场景: 单源和双源边界
  // ============================================================================

  describe('额外: 边界情况', () => {
    it('单源证据直接返回', () => {
      const result = engine.fuseWithReliability([
        makeEvidence('s1', { bearing_damage: 0.7, theta: 0.3 }),
      ]);

      expect(result.fusedMass.bearing_damage).toBeCloseTo(0.7, 4);
      expect(result.fusedMass.theta).toBeCloseTo(0.3, 4);
      expect(result.totalConflict).toBe(0);
      expect(result.fusionLog).toHaveLength(1);
    });

    it('完全冲突时退化为 theta', () => {
      const [fused, conflict] = engine.dempsterCombination(
        { bearing_damage: 1.0 },
        { normal: 1.0 },
      );

      // 完全冲突 → theta = 1.0
      expect(conflict).toBeCloseTo(1.0, 6);
      expect(fused.theta).toBeCloseTo(1.0, 6);
    });
  });

  // ============================================================================
  // 综合端到端验证
  // ============================================================================

  describe('端到端: 多源证据 → DS融合 → 物理否决 → 决策', () => {
    it('完整流程: 3源 → Dempster融合 → 能量守恒否决 → 决策变更', () => {
      // Step 1: 多源证据输入
      const sources = [
        makeEvidence('vibration', {
          bearing_damage: 0.75, gear_wear: 0.05, normal: 0.05, theta: 0.15,
        }),
        makeEvidence('temperature', {
          bearing_damage: 0.60, gear_wear: 0.15, normal: 0.10, theta: 0.15,
        }),
        makeEvidence('current', {
          bearing_damage: 0.50, gear_wear: 0.20, normal: 0.10, theta: 0.20,
        }),
      ];

      // Step 2: DS 融合
      const fusionResult = engine.fuseWithReliability(sources);
      expect(fusionResult.decision).toBe('bearing_damage');
      const originalBearingDamage = fusionResult.fusedMass.bearing_damage;

      // Step 3: 物理约束校验 — bearing_damage 违反能量守恒
      const { output, vetoResult } = engine.applyPhysicsVeto(fusionResult, [{
        hypothesis: 'bearing_damage',
        constraintId: 'energy_conservation_rtg_hoist',
        description: '起升机构能量输入与振动能量不守恒',
        constraintType: 'energy_conservation',
        violated: true,
        violationDegree: 0.92,
      }]);

      // Step 4: 验证最终决策
      expect(vetoResult.vetoed).toBe(true);
      expect(output.fusedMass.bearing_damage).toBe(0);
      expect(output.decision).not.toBe('bearing_damage');
      // 次高假设应成为新决策（gear_wear）
      expect(output.fusedMass[output.decision]).toBeGreaterThan(0);

      // Step 5: 概率完备性
      expect(totalMass(output.fusedMass)).toBeCloseTo(1.0, 6);

      // Step 6: 融合日志完整性（含 veto 条目）
      const vetoEntries = output.fusionLog.filter(
        l => l.sourceId.startsWith('physics_veto:'),
      );
      expect(vetoEntries).toHaveLength(1);

      // Step 7: DB 行映射
      const dbRows = mapFusionLogToDBRows('hde_e2e_001', output);
      expect(dbRows.length).toBe(output.fusionLog.length);
      expect(dbRows.some(r => r.sourceType === 'veto')).toBe(true);
    });
  });
});
