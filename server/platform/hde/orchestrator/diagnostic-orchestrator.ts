/**
 * ============================================================================
 * HDE 诊断编排器 — DiagnosticOrchestrator
 * ============================================================================
 *
 * Phase 0a 空壳设计 — 后续阶段逐步实现
 *
 * 核心职责：
 *   1. 双轨诊断编排：数据驱动轨 + 物理优先轨
 *   2. 诊断流程管理：感知 → 认知 → 护栏 → 进化
 *   3. 结果融合：多源诊断结果的 DS 融合
 *   4. 知识结晶：诊断结果自动沉淀为知识
 *
 * 设计原则：
 *   - 物理约束优先于数据驱动结论
 *   - 每个功能必须有验证闭环
 *   - 优先复用现有模块
 *
 * 实现路线图：
 *   Phase 0a: 空壳 + 类型定义 ✅
 *   Phase 0b: 接口适配层 ✅
 *   Phase 0 P0-5: 双轨诊断端到端 ✅
 *   Phase 1:  双轨诊断核心（进阶算法）
 *   Phase 2:  知识结晶集成
 *   Phase 3:  进化飞轮闭环
 */

import { createModuleLogger } from '../../../core/logger';
import { DSFusionEngine } from '../fusion';
import { UnifiedKnowledgeCrystallizer } from '../crystallization/unified-crystallizer';
import type {
  HDEDiagnosisRequest,
  HDEDiagnosisResult,
  HDEDiagnosisConfig,
  DiagnosticTrack,
  TrackResult,
  FaultHypothesis,
  PhysicsConstraint,
  ValidationResult,
} from '../types';
// [FIX-091] 使用统一契约类型
import type { SeverityLevel, UrgencyLevel } from '../../../../shared/contracts/v1';
// [FIX-092] 护栏引擎接入诊断流程
import type { GuardrailCheckResult } from './guardrail-check';

const log = createModuleLogger('hde-diagnostic-orchestrator');

// ── 故障类型中文映射 ──────────────────────────────────────
const FAULT_TYPE_CN: Record<string, string> = {
  bearing_damage: '轴承损伤',
  gear_wear: '齿轮磨损',
  electrical_fault: '电气故障',
  imbalance: '不平衡',
  normal: '正常运行',
  looseness: '松动',
  misalignment: '不对中',
  overload: '过载',
  overload_idle: '空载过电流',
  physics_violation: '物理异常',
};
const faultCN = (key: string) => FAULT_TYPE_CN[key] ?? key;

// ============================================================================
// 诊断编排器配置
// ============================================================================

export interface DiagnosticOrchestratorConfig {
  /** 启用物理优先轨 */
  enablePhysicsTrack: boolean;
  /** 启用数据驱动轨 */
  enableDataTrack: boolean;
  /** 双轨融合策略 */
  fusionStrategy: 'physics_veto' | 'weighted' | 'cascade';
  /** 物理轨权重（0-1） */
  physicsWeight: number;
  /** 自动结晶阈值（置信度） */
  autoCrystallizeThreshold: number;
  /** DS 融合配置 */
  fusionConfig?: Partial<{
    defaultStrategy: 'dempster' | 'murphy' | 'yager';
    highConflictThreshold: number;
  }>;
}

const DEFAULT_CONFIG: DiagnosticOrchestratorConfig = {
  enablePhysicsTrack: true,
  enableDataTrack: true,
  fusionStrategy: 'physics_veto',
  physicsWeight: 0.6,
  autoCrystallizeThreshold: 0.7,
  fusionConfig: {
    defaultStrategy: 'dempster',
    highConflictThreshold: 0.7,
  },
};

// ============================================================================
// 诊断编排器
// ============================================================================

/**
 * HDE 诊断编排器 — 双轨演化诊断核心
 *
 * @example
 * ```ts
 * const orchestrator = new DiagnosticOrchestrator();
 *
 * const result = await orchestrator.diagnose({
 *   machineId: 'CRANE-001',
 *   timestamp: Date.now(),
 *   sensorData: { vibration: [...], temperature: [...] },
 *   context: { cyclePhase: 'lifting', loadWeight: 25 },
 * });
 *
 * console.log(result.diagnosis);
 * console.log(result.physicsValidation);
 * console.log(result.recommendations);
 * ```
 */
export class DiagnosticOrchestrator {
  private readonly config: DiagnosticOrchestratorConfig;
  private readonly fusionEngine: DSFusionEngine;
  private readonly crystallizer: UnifiedKnowledgeCrystallizer;
  // [FIX-092] 护栏检查器（依赖注入，可选）
  private guardrailChecker?: (
    machineId: string,
    diagnosis: import('../types').DiagnosisConclusion,
  ) => Promise<GuardrailCheckResult | null>;
  private sessionCounter = 0;

  constructor(config?: Partial<DiagnosticOrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fusionEngine = new DSFusionEngine({
      defaultStrategy: this.config.fusionConfig?.defaultStrategy || 'dempster',
      highConflictThreshold: this.config.fusionConfig?.highConflictThreshold || 0.7,
    });
    this.crystallizer = new UnifiedKnowledgeCrystallizer();
    log.info({ config: this.config }, 'DiagnosticOrchestrator initialized');
  }

  // ==========================================================================
  // 核心诊断接口
  // ==========================================================================

  /**
   * 执行诊断 — 主入口
   *
   * P0-5: 双轨诊断端到端实现
   *
   * 流程：
   *   1. 物理轨: 物理约束检查 → 物理轨 BPA
   *   2. 数据轨: 传感器模式分析 → 数据轨 BPA
   *   3. DS 融合: 物理轨 BPA + 数据轨 BPA → 9 假设置信度
   *   4. 物理约束最终校验: 否决物理不合理的假设
   *   5. 生成诊断结论 + 建议
   */
  async diagnose(request: HDEDiagnosisRequest): Promise<HDEDiagnosisResult> {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();

    log.info({
      sessionId,
      machineId: request.machineId,
      timestamp: request.timestamp,
    }, 'Diagnosis started');

    try {
      // Step 1+2: 并行执行双轨诊断
      const [physicsResult, dataResult] = await Promise.all([
        this.config.enablePhysicsTrack
          ? this.runPhysicsTrack(request)
          : null,
        this.config.enableDataTrack
          ? this.runDataTrack(request)
          : null,
      ]);

      // Step 3: DS 融合
      let fusionResult = { fusedMass: { normal: 0.5, theta: 0.5 } as Record<string, number>, conflict: 0 };
      let strategyUsed = 'dempster';

      if (physicsResult && dataResult) {
        fusionResult = await this.fuseTrackResults(physicsResult, dataResult);
        // 检测冲突 → 策略切换
        if (fusionResult.conflict > (this.config.fusionConfig?.highConflictThreshold ?? 0.7)) {
          const murphyResult = this.fusionEngine.fuseMultiple(
            [physicsResult.beliefMass, dataResult.beliefMass],
            'murphy',
          );
          fusionResult = { fusedMass: murphyResult.beliefMass, conflict: murphyResult.conflict };
          strategyUsed = 'murphy';
          log.info({
            sessionId,
            originalConflict: fusionResult.conflict,
          }, 'High conflict detected, switched to Murphy strategy');
        }
      } else if (physicsResult) {
        fusionResult = { fusedMass: physicsResult.beliefMass, conflict: 0 };
      } else if (dataResult) {
        fusionResult = { fusedMass: dataResult.beliefMass, conflict: 0 };
      }

      // 从融合结果确定最高信念假设
      const { faultType, confidence } = this.extractDecision(fusionResult.fusedMass);

      // Step 4: 物理约束最终校验
      const allConstraints = [
        ...(physicsResult?.physicsConstraints ?? []),
        ...(dataResult?.physicsConstraints ?? []),
      ];
      const validation = await this.validateWithPhysics(
        { faultType, confidence },
        allConstraints,
      );

      // Step 5: 生成诊断结论
      const diagnosis = this.buildDiagnosisConclusion(
        faultType,
        validation.adjustedConfidence,
        fusionResult,
        physicsResult,
        dataResult,
      );

      // [FIX-092] Step 5b: 护栏校验 — 在输出前检查安全/健康/效率约束
      const guardrailResult = await this.checkGuardrails(request.machineId, diagnosis);
      if (guardrailResult?.overrideSeverity) {
        diagnosis.severity = guardrailResult.overrideSeverity;
      }
      if (guardrailResult?.overrideUrgency) {
        diagnosis.urgency = guardrailResult.overrideUrgency;
      }

      const recommendations = this.generateRecommendations(diagnosis, validation);
      const durationMs = Date.now() - startTime;

      const result: HDEDiagnosisResult = {
        sessionId,
        machineId: request.machineId,
        timestamp: request.timestamp,
        diagnosis,
        trackResults: {
          physics: physicsResult,
          data: dataResult,
        },
        fusionResult: {
          fusedMass: fusionResult.fusedMass,
          conflict: fusionResult.conflict,
          strategyUsed,
        },
        physicsValidation: validation,
        recommendations,
        metadata: {
          version: '1.0.0-p0-5',
          phase: 'p0-5',
          configUsed: this.config,
        },
        durationMs,
      };

      log.info({
        sessionId,
        durationMs,
        faultType: diagnosis.faultType,
        confidence: diagnosis.confidence.toFixed(3),
        severity: diagnosis.severity,
        conflict: fusionResult.conflict.toFixed(3),
        strategy: strategyUsed,
        physicsValid: validation.isValid,
      }, 'Diagnosis completed');

      return result;
    } catch (error) {
      log.error({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Diagnosis failed');
      throw error;
    }
  }

  /**
   * 执行物理优先轨诊断
   *
   * P0-5: 基于物理约束检查传感器数据合理性
   *
   * 约束类型:
   *   - 能量约束: 电机功率 ≈ 机械功率 + 损耗
   *   - 力学约束: 振动值在物理范围内 [0, 100] mm/s
   *   - 材料约束: 温度不超过材料极限 [-40, 300]°C
   */
  async runPhysicsTrack(request: HDEDiagnosisRequest): Promise<TrackResult> {
    const startTime = Date.now();
    log.debug({ machineId: request.machineId }, 'Running physics track');

    const constraints: PhysicsConstraint[] = [];
    const hypotheses: FaultHypothesis[] = [];
    const beliefMass: Record<string, number> = {};
    const data = request.sensorData;

    // === 力学约束: 振动值范围 ===
    if (data.vibration) {
      const maxVib = Math.max(...data.vibration);
      const minVib = Math.min(...data.vibration);
      const hasNegative = minVib < 0;
      const hasExcessive = maxVib > 100;

      constraints.push({
        id: 'force-vibration-range',
        name: '振动值物理范围',
        type: 'force',
        expression: '0 <= vibration <= 100 mm/s',
        satisfied: !hasNegative && !hasExcessive,
        violationDegree: hasNegative ? 1.0 : hasExcessive ? Math.min((maxVib - 100) / 100, 1.0) : 0,
        explanation: hasNegative
          ? `振动值为负 (${minVib.toFixed(2)} mm/s)，物理不可能，数据异常`
          : hasExcessive
            ? `振动值超限 (${maxVib.toFixed(2)} mm/s > 100)，可能传感器故障`
            : '振动值在合理范围内',
      });

      // 分析振动水平 → 故障假设
      const rmsVib = Math.sqrt(data.vibration.reduce((s, v) => s + v * v, 0) / data.vibration.length);
      if (!hasNegative) {
        if (rmsVib > 7.0) {
          // ISO 10816: > 7.1 mm/s = Danger
          hypotheses.push({
            id: 'phys-bearing-damage',
            faultType: 'bearing_damage',
            priorProbability: 0.4,
            supportingEvidence: [`振动 RMS=${rmsVib.toFixed(2)} mm/s 超过 ISO 10816 危险阈值`],
            contradictingEvidence: [],
            physicsMechanism: '轴承损伤产生冲击脉冲，导致高振动',
          });
          beliefMass.bearing_damage = Math.min(0.5, (rmsVib - 7) / 10 + 0.3);
        } else if (rmsVib > 4.5) {
          // ISO 10816: 4.5-7.1 mm/s = Alert
          hypotheses.push({
            id: 'phys-bearing-damage',
            faultType: 'bearing_damage',
            priorProbability: 0.2,
            supportingEvidence: [`振动 RMS=${rmsVib.toFixed(2)} mm/s 超过 ISO 10816 注意阈值`],
            contradictingEvidence: [],
            physicsMechanism: '轴承磨损导致振动升高',
          });
          beliefMass.bearing_damage = Math.min(0.3, (rmsVib - 4.5) / 5 + 0.1);
        }
        if (rmsVib > 4.5) {
          hypotheses.push({
            id: 'phys-misalignment',
            faultType: 'misalignment',
            priorProbability: 0.2,
            supportingEvidence: [`振动 RMS=${rmsVib.toFixed(2)} mm/s 超过注意阈值`],
            contradictingEvidence: [],
            physicsMechanism: '不对中产生 2x 旋转频率振动',
          });
          beliefMass.misalignment = Math.min(0.3, (rmsVib - 4.5) / 10);
        }
      }
    }

    // === 材料约束: 温度范围 ===
    if (data.temperature) {
      const maxTemp = Math.max(...data.temperature);
      const minTemp = Math.min(...data.temperature);
      const hasOverheat = maxTemp > 120; // 轴承温度报警阈值
      const hasFreezing = minTemp < -40;

      constraints.push({
        id: 'material-temp-range',
        name: '温度物理范围',
        type: 'material',
        expression: '-40 <= temperature <= 300 °C',
        satisfied: !hasOverheat && !hasFreezing && maxTemp <= 300,
        violationDegree: hasOverheat ? Math.min((maxTemp - 120) / 180, 1.0) : 0,
        explanation: hasOverheat
          ? `温度过高 (${maxTemp.toFixed(1)}°C)，可能润滑失效或过载`
          : '温度在安全范围内',
      });

      if (hasOverheat) {
        hypotheses.push({
          id: 'phys-overheat',
          faultType: 'bearing_damage',
          priorProbability: 0.25,
          supportingEvidence: [`温度 ${maxTemp.toFixed(1)}°C 超过报警阈值 120°C`],
          contradictingEvidence: [],
          physicsMechanism: '轴承摩擦增加导致温升异常',
        });
        beliefMass.bearing_damage = (beliefMass.bearing_damage ?? 0) + 0.2;
      }
    }

    // === 能量约束: 电流-载荷关系 ===
    if (data.current && request.context?.loadWeight) {
      const avgCurrent = data.current.reduce((s, v) => s + v, 0) / data.current.length;
      const load = request.context.loadWeight;

      // 空载时电流应较低 (< 30% 额定)
      const isOverCurrent = load < 5 && avgCurrent > 50;

      constraints.push({
        id: 'energy-current-load',
        name: '电流-载荷能量关系',
        type: 'energy',
        expression: 'current ∝ load (P_elec ≈ P_mech + P_loss)',
        satisfied: !isOverCurrent,
        violationDegree: isOverCurrent ? 0.8 : 0,
        explanation: isOverCurrent
          ? `空载(${load}t)但电流偏高(${avgCurrent.toFixed(1)}A)，可能机械卡阻`
          : '电流与载荷关系合理',
      });

      if (isOverCurrent) {
        beliefMass.electrical_fault = (beliefMass.electrical_fault ?? 0) + 0.3;
      }
    }

    // 归一化 beliefMass
    const normalizedMass = this.normalizeMass(beliefMass);

    return {
      trackType: 'physics',
      faultHypotheses: hypotheses,
      beliefMass: normalizedMass,
      confidence: this.calculateTrackConfidence(normalizedMass),
      physicsConstraints: constraints,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * 执行数据驱动轨诊断
   *
   * P0-5: 基于传感器数据模式分析生成故障假设
   *
   * 分析内容:
   *   - 振动特征: RMS/峰值/峰值因子/频谱峰值检测
   *   - 温度趋势: 升温速率异常检测
   *   - 电流模式: 不平衡/谐波检测
   *   - 轴承特征频率: BPFO/BPFI 检测（简化版）
   */
  async runDataTrack(request: HDEDiagnosisRequest): Promise<TrackResult> {
    const startTime = Date.now();
    log.debug({ machineId: request.machineId }, 'Running data track');

    const hypotheses: FaultHypothesis[] = [];
    const beliefMass: Record<string, number> = {};
    const data = request.sensorData;

    // === 振动特征分析 ===
    if (data.vibration && data.vibration.length > 0) {
      const vib = data.vibration;
      const rms = Math.sqrt(vib.reduce((s, v) => s + v * v, 0) / vib.length);
      const peak = Math.max(...vib.map(Math.abs));
      const crestFactor = peak / (rms || 1);
      const mean = vib.reduce((s, v) => s + v, 0) / vib.length;
      const std = Math.sqrt(vib.reduce((s, v) => s + (v - mean) ** 2, 0) / vib.length);

      // 峰值因子 > 3.5 → 可能轴承冲击（ISO 标准中 >3.5 即需关注）
      if (crestFactor > 3.5) {
        const severity = crestFactor > 5.0 ? 0.6 : crestFactor > 4.0 ? 0.45 : 0.3;
        hypotheses.push({
          id: 'data-bearing-impact',
          faultType: 'bearing_damage',
          priorProbability: severity,
          supportingEvidence: [`峰值因子=${crestFactor.toFixed(2)} > 3.5，检测到冲击脉冲`],
          contradictingEvidence: [],
          physicsMechanism: '轴承缺陷产生周期性冲击脉冲',
        });
        beliefMass.bearing_damage = (beliefMass.bearing_damage ?? 0) + severity;
      }

      // 频谱简化分析: 如果有 BPFO 模式（振动序列有明显周期性）
      if (vib.length >= 128) {
        const autoCorr = this.simpleAutoCorrelation(vib);
        if (autoCorr > 0.3) {
          // 强周期性 → 可能不平衡或不对中
          hypotheses.push({
            id: 'data-periodic',
            faultType: 'imbalance',
            priorProbability: 0.2,
            supportingEvidence: [`振动自相关=${autoCorr.toFixed(2)}，强周期性`],
            contradictingEvidence: [],
            physicsMechanism: '转子不平衡产生 1x 旋转频率振动',
          });
          beliefMass.imbalance = (beliefMass.imbalance ?? 0) + 0.15;
        }
      }

      // 振动标准差异常高 → 松动
      if (std > rms * 0.8) {
        hypotheses.push({
          id: 'data-looseness',
          faultType: 'looseness',
          priorProbability: 0.15,
          supportingEvidence: [`振动标准差/RMS=${(std/rms).toFixed(2)} > 0.8，波形不稳定`],
          contradictingEvidence: [],
          physicsMechanism: '机械松动导致振动幅值不稳定',
        });
        beliefMass.looseness = (beliefMass.looseness ?? 0) + 0.1;
      }
    }

    // === 温度趋势分析 ===
    if (data.temperature && data.temperature.length > 10) {
      const temps = data.temperature;
      const n = temps.length;
      const firstHalf = temps.slice(0, Math.floor(n / 2));
      const secondHalf = temps.slice(Math.floor(n / 2));
      const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      const tempRise = avgSecond - avgFirst;

      if (tempRise > 10) {
        // 温升 > 10°C → 异常
        hypotheses.push({
          id: 'data-temp-rise',
          faultType: 'bearing_damage',
          priorProbability: 0.2,
          supportingEvidence: [`温升趋势=${tempRise.toFixed(1)}°C > 10°C，润滑可能劣化`],
          contradictingEvidence: [],
        });
        beliefMass.bearing_damage = (beliefMass.bearing_damage ?? 0) + 0.15;
      }
    }

    // === 电流模式分析 ===
    if (data.current && data.current.length > 10) {
      const curr = data.current;
      const mean = curr.reduce((s, v) => s + v, 0) / curr.length;
      const std = Math.sqrt(curr.reduce((s, v) => s + (v - mean) ** 2, 0) / curr.length);
      const cv = std / (mean || 1); // 变异系数

      if (cv > 0.3) {
        hypotheses.push({
          id: 'data-current-instability',
          faultType: 'electrical_fault',
          priorProbability: 0.2,
          supportingEvidence: [`电流变异系数=${cv.toFixed(2)} > 0.3，电气不稳定`],
          contradictingEvidence: [],
        });
        beliefMass.electrical_fault = (beliefMass.electrical_fault ?? 0) + 0.2;
      }
    }

    // 归一化 beliefMass
    const normalizedMass = this.normalizeMass(beliefMass);

    return {
      trackType: 'data',
      faultHypotheses: hypotheses,
      beliefMass: normalizedMass,
      confidence: this.calculateTrackConfidence(normalizedMass),
      physicsConstraints: [], // 数据轨不产生物理约束
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * 融合双轨结果
   *
   * TODO Phase 1: 实现 DS 融合逻辑
   */
  async fuseTrackResults(
    physicsResult: TrackResult,
    dataResult: TrackResult,
  ): Promise<{ fusedMass: Record<string, number>; conflict: number }> {
    log.debug('Fusing track results (skeleton)');

    // Phase 0a: 使用 DS 融合引擎
    const result = this.fusionEngine.fuseMultiple([
      physicsResult.beliefMass,
      dataResult.beliefMass,
    ]);
    return { fusedMass: result.beliefMass, conflict: result.conflict };
  }

  /**
   * 物理约束最终验证
   *
   * P0-5: 检查诊断结论是否违反物理约束
   *
   * 规则:
   *   - 如果力学约束不满足（如振动为负），否决相关故障假设
   *   - 每个违反的约束降低置信度
   *   - 严重违反（violationDegree >= 0.8）直接标记 isValid = false
   */
  async validateWithPhysics(
    diagnosis: { faultType: string; confidence: number },
    constraints: PhysicsConstraint[],
  ): Promise<ValidationResult> {
    log.debug({ faultType: diagnosis.faultType, constraintCount: constraints.length }, 'Validating with physics');

    const violations = constraints.filter(c => c.satisfied === false);
    let adjustedConfidence = diagnosis.confidence;
    const explanations: string[] = [];

    if (violations.length === 0) {
      return {
        isValid: true,
        violations: [],
        adjustedConfidence,
        physicsExplanation: '所有物理约束满足，诊断结论有效',
      };
    }

    // 按违反程度调整置信度
    for (const v of violations) {
      const degree = v.violationDegree ?? 0.5;
      const penalty = degree * 0.3; // 每个违反最多降 30% 置信度
      adjustedConfidence -= penalty;
      explanations.push(`[${v.type}] ${v.name}: ${v.explanation} (违反度=${degree.toFixed(2)})`);
    }

    // 严重违反 → 否决
    const severeViolation = violations.find(v => (v.violationDegree ?? 0) >= 0.8);
    const isValid = !severeViolation;

    if (!isValid) {
      adjustedConfidence = Math.max(adjustedConfidence, 0.1); // 保底 10%
    }
    adjustedConfidence = Math.max(0, Math.min(1, adjustedConfidence));

    return {
      isValid,
      violations,
      adjustedConfidence,
      physicsExplanation: isValid
        ? `存在 ${violations.length} 个物理约束违反，置信度已调整: ${explanations.join('; ')}`
        : `物理约束严重违反，诊断结论被否决: ${explanations.join('; ')}`,
    };
  }

  // ==========================================================================
  // 知识结晶接口
  // ==========================================================================

  /**
   * 自动结晶诊断结果
   *
   * TODO Phase 2: 集成知识结晶
   */
  async autoCrystallize(result: HDEDiagnosisResult): Promise<void> {
    if (result.diagnosis.confidence < this.config.autoCrystallizeThreshold) {
      log.debug({
        sessionId: result.sessionId,
        confidence: result.diagnosis.confidence,
        threshold: this.config.autoCrystallizeThreshold,
      }, 'Skipping auto-crystallization (low confidence)');
      return;
    }

    log.info({ sessionId: result.sessionId }, 'Auto-crystallization pending (Phase 2)');
    // TODO Phase 2: 调用 crystallizer
  }

  /**
   * 获取结晶器实例
   */
  getCrystallizer(): UnifiedKnowledgeCrystallizer {
    return this.crystallizer;
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<DiagnosticOrchestratorConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<DiagnosticOrchestratorConfig>): void {
    Object.assign(this.config, updates);
    log.info({ updates }, 'Configuration updated');
  }

  /**
   * 获取融合引擎
   */
  getFusionEngine(): DSFusionEngine {
    return this.fusionEngine;
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    return `hde_${timestamp}_${counter}`;
  }

  /**
   * 从融合后的信念质量中提取最高假设
   */
  private extractDecision(fusedMass: Record<string, number>): { faultType: string; confidence: number } {
    let maxKey = 'normal';
    let maxVal = 0;

    for (const [key, val] of Object.entries(fusedMass)) {
      if (key === 'theta') continue; // 忽略不确定性
      if (val > maxVal) {
        maxVal = val;
        maxKey = key;
      }
    }

    return { faultType: maxKey, confidence: maxVal };
  }

  /**
   * 构建诊断结论
   */
  private buildDiagnosisConclusion(
    faultType: string,
    confidence: number,
    fusionResult: { fusedMass: Record<string, number>; conflict: number },
    physicsResult: TrackResult | null,
    dataResult: TrackResult | null,
  ): import('../types').DiagnosisConclusion {
    const isNormal = faultType === 'normal' || confidence < 0.3;

    // [FIX-091] 使用统一 SeverityLevel / UrgencyLevel 枚举
    let severity: SeverityLevel = isNormal ? 'info' : 'low';
    if (!isNormal) {
      if (confidence >= 0.8) severity = 'critical';
      else if (confidence >= 0.6) severity = 'high';
      else if (confidence >= 0.4) severity = 'medium';
    }

    // 根据严重程度确定紧急程度
    let urgency: UrgencyLevel = 'monitoring';
    if (severity === 'critical') urgency = 'immediate';
    else if (severity === 'high') urgency = 'priority';
    else if (severity === 'medium') urgency = 'scheduled';

    // 收集证据链
    const evidence: import('../types').EvidenceItem[] = [];
    if (physicsResult) {
      for (const h of physicsResult.faultHypotheses) {
        evidence.push({
          source: 'physics_track',
          type: 'model',
          description: h.supportingEvidence.join('; '),
          strength: h.priorProbability,
        });
      }
    }
    if (dataResult) {
      for (const h of dataResult.faultHypotheses) {
        evidence.push({
          source: 'data_track',
          type: 'sensor',
          description: h.supportingEvidence.join('; '),
          strength: h.priorProbability,
        });
      }
    }

    return {
      faultType: isNormal ? 'normal' : faultType,
      confidence: isNormal ? Math.max(confidence, 0.8) : confidence,
      severity: isNormal ? 'info' : severity,
      urgency: isNormal ? 'monitoring' : urgency,
      physicsExplanation: isNormal
        ? '各项指标在正常范围内，设备运行状态良好'
        : `检测到${faultCN(faultType)}故障模式 (置信度 ${(confidence * 100).toFixed(1)}%)`,
      evidenceChain: evidence,
    };
  }

  /**
   * 生成诊断建议
   */
  private generateRecommendations(
    diagnosis: import('../types').DiagnosisConclusion,
    validation: ValidationResult,
  ): import('../types').Recommendation[] {
    const recommendations: import('../types').Recommendation[] = [];

    if (diagnosis.severity === 'info') {
      recommendations.push({
        priority: 'info',
        action: '继续常规监测',
        rationale: '设备运行状态正常',
      });
    } else if (diagnosis.severity === 'medium') {
      recommendations.push({
        priority: 'medium',
        action: `安排${faultCN(diagnosis.faultType)}专项检查`,
        rationale: `置信度 ${(diagnosis.confidence * 100).toFixed(0)}%，建议人工确认`,
      });
    } else if (diagnosis.severity === 'high') {
      recommendations.push({
        priority: 'high',
        action: `优先处理${faultCN(diagnosis.faultType)}，安排维修窗口`,
        rationale: `置信度 ${(diagnosis.confidence * 100).toFixed(0)}%，需要及时处理`,
      });
    } else if (diagnosis.severity === 'critical') {
      recommendations.push({
        priority: 'critical',
        action: `立即停机检查${faultCN(diagnosis.faultType)}`,
        rationale: `置信度 ${(diagnosis.confidence * 100).toFixed(0)}%，设备存在严重风险`,
      });
    }

    if (!validation.isValid) {
      recommendations.push({
        priority: 'high',
        action: '检查传感器数据质量',
        rationale: `物理约束验证失败: ${validation.violations.length} 个约束违反`,
      });
    }

    return recommendations;
  }

  /**
   * [FIX-092] 护栏校验 — 在诊断结论输出前校验安全/健康/效率约束
   *
   * Phase 1: 接口定义 + 调用点就位，实际评估逻辑通过 guardrailChecker 注入
   * Phase 2: 集成 GuardrailEngine.evaluate() 完整评估
   */
  private async checkGuardrails(
    machineId: string,
    diagnosis: import('../types').DiagnosisConclusion,
  ): Promise<GuardrailCheckResult | null> {
    if (!this.guardrailChecker) {
      return null; // 未注入护栏检查器，跳过
    }
    try {
      return await this.guardrailChecker(machineId, diagnosis);
    } catch (err) {
      // 降级不崩溃：护栏校验失败不阻断诊断输出
      log.warn({ err, machineId }, '[FIX-092] Guardrail check failed, proceeding without guardrail');
      return null;
    }
  }

  /**
   * [FIX-092] 设置护栏检查器（依赖注入）
   */
  setGuardrailChecker(
    checker: (machineId: string, diagnosis: import('../types').DiagnosisConclusion) => Promise<GuardrailCheckResult | null>,
  ): void {
    this.guardrailChecker = checker;
  }

  /**
   * 归一化信念质量 — 确保总和为 1
   *
   * 如果没有任何故障证据，大部分信念分配给 normal + theta
   */
  private normalizeMass(mass: Record<string, number>): Record<string, number> {
    const total = Object.values(mass).reduce((s, v) => s + v, 0);

    if (total === 0) {
      // 没有任何异常证据 → 分配较多给 theta（不确定性）
      // "没有发现异常" ≠ "确定正常"，应保持开放态度让其他轨道的证据有效
      return { normal: 0.4, theta: 0.6 };
    }

    const result: Record<string, number> = {};

    // 故障假设总占比不超过 0.9，留 0.1 给 normal+theta
    const faultTotal = Math.min(total, 0.9);
    const scale = faultTotal / total;

    for (const [key, val] of Object.entries(mass)) {
      result[key] = val * scale;
    }

    // 分配剩余给 normal 和 theta
    const remaining = 1 - faultTotal;
    result.normal = (result.normal ?? 0) + remaining * 0.4;
    result.theta = (result.theta ?? 0) + remaining * 0.6;

    return result;
  }

  /**
   * 计算轨道置信度 — 最高非 normal/theta 假设的信念值
   */
  private calculateTrackConfidence(mass: Record<string, number>): number {
    let maxFault = 0;
    for (const [key, val] of Object.entries(mass)) {
      if (key !== 'normal' && key !== 'theta' && val > maxFault) {
        maxFault = val;
      }
    }
    // 如果没有故障假设，置信度基于 normal
    return maxFault > 0 ? maxFault : (mass.normal ?? 0.5);
  }

  /**
   * 简化自相关计算 — 检测振动信号周期性
   */
  private simpleAutoCorrelation(signal: number[]): number {
    const n = signal.length;
    if (n < 32) return 0;

    const mean = signal.reduce((s, v) => s + v, 0) / n;
    const centered = signal.map(v => v - mean);
    const variance = centered.reduce((s, v) => s + v * v, 0);
    if (variance === 0) return 0;

    // 计算 lag=1 到 lag=n/4 的自相关，找最大值
    let maxCorr = 0;
    const maxLag = Math.floor(n / 4);
    for (let lag = 1; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) {
        corr += centered[i] * centered[i + lag];
      }
      const normalized = Math.abs(corr / variance);
      if (normalized > maxCorr) maxCorr = normalized;
    }

    return maxCorr;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建诊断编排器 */
export function createDiagnosticOrchestrator(
  config?: Partial<DiagnosticOrchestratorConfig>,
): DiagnosticOrchestrator {
  return new DiagnosticOrchestrator(config);
}

/** 创建默认配置的诊断编排器 */
export function createDefaultOrchestrator(): DiagnosticOrchestrator {
  return new DiagnosticOrchestrator();
}

/** 创建物理优先模式的诊断编排器 */
export function createPhysicsFirstOrchestrator(): DiagnosticOrchestrator {
  return new DiagnosticOrchestrator({
    fusionStrategy: 'physics_veto',
    physicsWeight: 0.8,
  });
}

/** 创建数据驱动模式的诊断编排器 */
export function createDataDrivenOrchestrator(): DiagnosticOrchestrator {
  return new DiagnosticOrchestrator({
    enablePhysicsTrack: false,
    enableDataTrack: true,
    fusionStrategy: 'weighted',
    physicsWeight: 0.3,
  });
}
