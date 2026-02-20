/**
 * ============================================================================
 * 工况配置管理器 — 场景适配的核心
 * ============================================================================
 *
 * 核心能力：
 *   1. 工况模板管理（CRUD + 版本控制）
 *   2. 工况自动检测（基于传感器数据模式匹配）
 *   3. 工况切换（手动/自动/调度/阈值触发）
 *   4. 工况历史记录
 *   5. 场景适配：一键从港口切换到制造业/能源/交通
 *
 * 工况 Profile 结构：
 *   - 基础信息（行业/设备类型/名称）
 *   - 参数范围（各传感器的正常/警告/危险范围）
 *   - 传感器映射（逻辑名 → 物理通道）
 *   - 阈值策略（静态/动态/WorldModel）
 *   - 认知配置（感知灵敏度/推理深度/融合策略/决策紧迫度）
 *   - 采样配置（各工况阶段的采样率/保留策略）
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface ConditionProfile {
  id: number;
  name: string;
  version: number;
  industry: string;
  equipmentType: string;
  description: string;
  enabled: boolean;

  /** 参数范围定义 */
  parameters: ParameterRange[];

  /** 传感器映射 */
  sensorMapping: SensorMapping[];

  /** 阈值策略 */
  thresholdStrategy: ThresholdStrategy;

  /** 认知配置 */
  cognitionConfig: CognitionConfig;

  /** 工况阶段定义 */
  cyclePhases: CyclePhaseDefinition[];

  /** 自动检测规则 */
  autoDetectionRules: AutoDetectionRule[];

  createdAt: Date;
  updatedAt: Date;
}

export interface ParameterRange {
  name: string;
  unit: string;
  description: string;
  normalRange: [number, number];
  warningRange: [number, number];
  criticalRange: [number, number];
  physicalBasis: string;
}

export interface SensorMapping {
  logicalName: string;
  physicalChannel: string;
  samplingRate: number;
  unit: string;
  calibrationOffset: number;
  calibrationScale: number;
}

export interface ThresholdStrategy {
  type: 'static' | 'dynamic' | 'worldmodel';
  staticThresholds?: Record<string, number>;
  dynamicConfig?: {
    baselineWindow: string;
    sigma: number;
    minSamples: number;
  };
  worldModelConfig?: {
    predictionHorizon: number;
    confidenceThreshold: number;
  };
}

export interface CognitionConfig {
  perceptionSensitivity: number;    // 0-1
  reasoningDepth: number;           // 1-10
  fusionStrategy: 'ds' | 'bayesian' | 'ensemble';
  decisionUrgency: number;         // 0-1
  grokMaxSteps: number;            // Grok 推理最大步数
  grokModel: string;               // Grok 模型版本
  physicsFormulas: string[];        // 启用的物理公式
}

export interface CyclePhaseDefinition {
  name: string;
  description: string;
  expectedDuration: [number, number]; // [min, max] seconds
  transitionConditions: TransitionCondition[];
}

export interface TransitionCondition {
  fromPhase: string;
  toPhase: string;
  conditions: Array<{
    field: string;
    operator: string;
    threshold: number;
  }>;
  logic: 'and' | 'or';
}

export interface AutoDetectionRule {
  targetPhase: string;
  priority: number;
  conditions: Array<{
    field: string;
    operator: string;
    threshold: number;
    duration?: number; // 持续时间 (ms)
  }>;
  logic: 'and' | 'or';
}

export interface ConditionInstance {
  id: number;
  machineId: string;
  profileId: number;
  currentPhase: string;
  startedAt: Date;
  trigger: 'auto_detection' | 'manual' | 'scheduler' | 'threshold_breach';
  parameters: Record<string, number>;
}

// ============================================================================
// 内置工况模板
// ============================================================================

export const BUILTIN_PROFILES: Partial<ConditionProfile>[] = [
  {
    name: '港口岸桥标准工况',
    industry: 'port',
    equipmentType: 'quay_crane',
    description: '适用于集装箱码头岸桥（QC）的标准作业工况',
    parameters: [
      { name: 'vibration_rms', unit: 'mm/s', description: '振动有效值', normalRange: [0, 2.8], warningRange: [2.8, 4.5], criticalRange: [4.5, 10], physicalBasis: 'ISO 10816-3 振动标准' },
      { name: 'motor_current', unit: 'A', description: '主电机电流', normalRange: [50, 80], warningRange: [80, 100], criticalRange: [100, 150], physicalBasis: '电机额定电流 120%' },
      { name: 'wind_speed', unit: 'm/s', description: '风速', normalRange: [0, 7], warningRange: [7, 13], criticalRange: [13, 25], physicalBasis: 'GB/T 3811-2008 起重机设计规范' },
      { name: 'hydraulic_pressure', unit: 'MPa', description: '液压系统压力', normalRange: [15, 25], warningRange: [25, 30], criticalRange: [30, 35], physicalBasis: '液压系统额定压力' },
      { name: 'temperature_bearing', unit: '°C', description: '轴承温度', normalRange: [20, 60], warningRange: [60, 80], criticalRange: [80, 120], physicalBasis: '轴承允许温升' },
    ],
    sensorMapping: [
      { logicalName: 'vibration', physicalChannel: 'ACC-001', samplingRate: 10000, unit: 'mm/s', calibrationOffset: 0, calibrationScale: 1 },
      { logicalName: 'motor_current', physicalChannel: 'CT-001', samplingRate: 1000, unit: 'A', calibrationOffset: 0, calibrationScale: 1 },
      { logicalName: 'wind_speed', physicalChannel: 'WIND-001', samplingRate: 10, unit: 'm/s', calibrationOffset: 0, calibrationScale: 1 },
      { logicalName: 'hydraulic_pressure', physicalChannel: 'PT-001', samplingRate: 100, unit: 'MPa', calibrationOffset: 0, calibrationScale: 1 },
      { logicalName: 'temperature_bearing', physicalChannel: 'TC-001', samplingRate: 1, unit: '°C', calibrationOffset: 0, calibrationScale: 1 },
    ],
    thresholdStrategy: {
      type: 'dynamic',
      dynamicConfig: { baselineWindow: '7d', sigma: 3, minSamples: 1000 },
    },
    cognitionConfig: {
      perceptionSensitivity: 0.7,
      reasoningDepth: 6,
      fusionStrategy: 'ds',
      decisionUrgency: 0.5,
      grokMaxSteps: 8,
      grokModel: 'grok-3',
      physicsFormulas: ['wind_load_moment', 'fatigue_increment', 'sn_curve_life', 'friction_force', 'corrosion_rate', 'overturn_safety_factor'],
    },
    cyclePhases: [
      { name: 'idle', description: '空载待机', expectedDuration: [0, 600], transitionConditions: [] },
      { name: 'hoisting', description: '起升/下降', expectedDuration: [30, 120], transitionConditions: [] },
      { name: 'traversing', description: '平移联动', expectedDuration: [60, 180], transitionConditions: [] },
      { name: 'traversing_end', description: '联动末端', expectedDuration: [5, 30], transitionConditions: [] },
      { name: 'locking', description: '开闭锁', expectedDuration: [10, 60], transitionConditions: [] },
      { name: 'emergency_brake', description: '紧急制动', expectedDuration: [1, 10], transitionConditions: [] },
    ],
    autoDetectionRules: [
      { targetPhase: 'hoisting', priority: 1, conditions: [{ field: 'motor_current', operator: 'gt', threshold: 60 }, { field: 'load_weight', operator: 'gt', threshold: 5 }], logic: 'and' },
      { targetPhase: 'traversing', priority: 2, conditions: [{ field: 'trolley_speed', operator: 'gt', threshold: 0.5 }], logic: 'or' },
      { targetPhase: 'emergency_brake', priority: 0, conditions: [{ field: 'wind_speed', operator: 'gt', threshold: 20 }], logic: 'or' },
    ],
  },
  {
    name: '制造业数控机床标准工况',
    industry: 'manufacturing',
    equipmentType: 'cnc_machine',
    description: '适用于数控机床（CNC）的标准加工工况',
    parameters: [
      { name: 'spindle_vibration', unit: 'mm/s', description: '主轴振动', normalRange: [0, 1.5], warningRange: [1.5, 3], criticalRange: [3, 8], physicalBasis: 'ISO 10816-3' },
      { name: 'spindle_speed', unit: 'rpm', description: '主轴转速', normalRange: [0, 12000], warningRange: [12000, 15000], criticalRange: [15000, 20000], physicalBasis: '主轴额定转速' },
      { name: 'cutting_force', unit: 'N', description: '切削力', normalRange: [0, 500], warningRange: [500, 800], criticalRange: [800, 1200], physicalBasis: '刀具承载极限' },
      { name: 'coolant_temperature', unit: '°C', description: '冷却液温度', normalRange: [15, 30], warningRange: [30, 40], criticalRange: [40, 60], physicalBasis: '冷却系统设计温度' },
    ],
    sensorMapping: [
      { logicalName: 'vibration', physicalChannel: 'ACC-CNC-001', samplingRate: 20000, unit: 'mm/s', calibrationOffset: 0, calibrationScale: 1 },
      { logicalName: 'spindle_speed', physicalChannel: 'ENC-001', samplingRate: 100, unit: 'rpm', calibrationOffset: 0, calibrationScale: 1 },
    ],
    thresholdStrategy: { type: 'static', staticThresholds: { spindle_vibration: 3, cutting_force: 800 } },
    cognitionConfig: {
      perceptionSensitivity: 0.8,
      reasoningDepth: 5,
      fusionStrategy: 'bayesian',
      decisionUrgency: 0.6,
      grokMaxSteps: 6,
      grokModel: 'grok-3',
      physicsFormulas: ['vibration_rms', 'heat_conduction', 'friction_force'],
    },
    cyclePhases: [
      { name: 'idle', description: '待机', expectedDuration: [0, 300], transitionConditions: [] },
      { name: 'roughing', description: '粗加工', expectedDuration: [60, 600], transitionConditions: [] },
      { name: 'finishing', description: '精加工', expectedDuration: [60, 600], transitionConditions: [] },
      { name: 'tool_change', description: '换刀', expectedDuration: [5, 30], transitionConditions: [] },
    ],
    autoDetectionRules: [],
  },
];

// ============================================================================
// 工况配置管理器
// ============================================================================

export class ConditionProfileManager {
  private profiles: Map<number, ConditionProfile> = new Map();
  private activeInstances: Map<string, ConditionInstance> = new Map();
  private nextId: number = 1;

  constructor() {
    // 加载内置模板
    for (const template of BUILTIN_PROFILES) {
      this.registerProfile(template as ConditionProfile);
    }
  }

  /**
   * 注册工况模板
   */
  registerProfile(profile: Partial<ConditionProfile>): ConditionProfile {
    const fullProfile: ConditionProfile = {
      id: this.nextId++,
      name: profile.name || 'Unnamed',
      version: 1,
      industry: profile.industry || 'generic',
      equipmentType: profile.equipmentType || 'generic',
      description: profile.description || '',
      enabled: true,
      parameters: profile.parameters || [],
      sensorMapping: profile.sensorMapping || [],
      thresholdStrategy: profile.thresholdStrategy || { type: 'static' },
      cognitionConfig: profile.cognitionConfig || {
        perceptionSensitivity: 0.5,
        reasoningDepth: 5,
        fusionStrategy: 'ds',
        decisionUrgency: 0.5,
        grokMaxSteps: 8,
        grokModel: 'grok-3',
        physicsFormulas: [],
      },
      cyclePhases: profile.cyclePhases || [],
      autoDetectionRules: profile.autoDetectionRules || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.profiles.set(fullProfile.id, fullProfile);
    return fullProfile;
  }

  /**
   * 获取工况模板
   */
  getProfile(id: number): ConditionProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * 按行业/设备类型查询
   */
  queryProfiles(filter: { industry?: string; equipmentType?: string; enabled?: boolean }): ConditionProfile[] {
    return Array.from(this.profiles.values()).filter(p => {
      if (filter.industry && p.industry !== filter.industry) return false;
      if (filter.equipmentType && p.equipmentType !== filter.equipmentType) return false;
      if (filter.enabled !== undefined && p.enabled !== filter.enabled) return false;
      return true;
    });
  }

  /**
   * 切换设备工况
   */
  switchCondition(
    machineId: string,
    profileId: number,
    trigger: ConditionInstance['trigger'],
    initialPhase: string = 'idle'
  ): ConditionInstance {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const instance: ConditionInstance = {
      id: Date.now(),
      machineId,
      profileId,
      currentPhase: initialPhase,
      startedAt: new Date(),
      trigger,
      parameters: {},
    };

    this.activeInstances.set(machineId, instance);
    return instance;
  }

  /**
   * 获取设备当前工况
   */
  getCurrentCondition(machineId: string): { instance: ConditionInstance; profile: ConditionProfile } | null {
    const instance = this.activeInstances.get(machineId);
    if (!instance) return null;

    const profile = this.profiles.get(instance.profileId);
    if (!profile) return null;

    return { instance, profile };
  }

  /**
   * 自动检测工况阶段
   */
  autoDetectPhase(machineId: string, sensorValues: Record<string, number>): string | null {
    const current = this.getCurrentCondition(machineId);
    if (!current) return null;

    const { profile } = current;
    const rules = [...profile.autoDetectionRules].sort((a, b) => a.priority - b.priority);

    for (const rule of rules) {
      const results = rule.conditions.map(cond => {
        const value = sensorValues[cond.field];
        if (value === undefined) return false;
        switch (cond.operator) {
          case 'gt': return value > cond.threshold;
          case 'lt': return value < cond.threshold;
          case 'gte': return value >= cond.threshold;
          case 'lte': return value <= cond.threshold;
          default: return false;
        }
      });

      const matched = rule.logic === 'and'
        ? results.every(r => r)
        : results.some(r => r);

      if (matched) return rule.targetPhase;
    }

    return null;
  }

  /**
   * 评估参数是否在范围内
   */
  evaluateParameter(
    profileId: number,
    paramName: string,
    value: number
  ): 'normal' | 'warning' | 'critical' | 'unknown' {
    const profile = this.profiles.get(profileId);
    if (!profile) return 'unknown';

    const param = profile.parameters.find(p => p.name === paramName);
    if (!param) return 'unknown';

    if (value >= param.criticalRange[0] && value <= param.criticalRange[1]) {
      if (value >= param.normalRange[0] && value <= param.normalRange[1]) return 'normal';
      if (value >= param.warningRange[0] && value <= param.warningRange[1]) return 'warning';
      return 'critical';
    }

    return 'critical';
  }

  /**
   * 获取所有活跃实例
   */
  getActiveInstances(): ConditionInstance[] {
    return Array.from(this.activeInstances.values());
  }
}
