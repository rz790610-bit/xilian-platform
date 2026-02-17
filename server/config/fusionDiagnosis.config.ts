/**
 * 融合诊断引擎配置
 *
 * 集中管理：
 * 1. 故障类型辨识框架（Frame of Discernment）
 * 2. 内置专家默认权重
 * 3. 冲突处理参数
 * 4. Python 端对接映射
 */

// ============================================================================
// 故障类型辨识框架
// ============================================================================

export interface FaultTypeDefinition {
  /** 故障类型 ID（与 Python 端 FAULT_TYPES 一致） */
  id: string;
  /** 中文名称 */
  zh: string;
  /** 英文名称 */
  en: string;
  /** 图标 */
  icon: string;
  /** 颜色 */
  color: string;
  /** 所属分类 */
  category: 'mechanical' | 'electrical' | 'structural' | 'normal';
  /** 描述 */
  description: string;
  /** 关联传感器类型 */
  relatedSensors: string[];
}

export const FAULT_TYPE_DEFINITIONS: FaultTypeDefinition[] = [
  {
    id: 'bearing_damage',
    zh: '轴承损伤',
    en: 'Bearing Damage',
    icon: '🔴',
    color: '#ef4444',
    category: 'mechanical',
    description: '轴承内圈/外圈/滚动体损伤，表现为高频振动和温升',
    relatedSensors: ['vibration', 'temperature', 'acoustic_emission'],
  },
  {
    id: 'gear_wear',
    zh: '齿轮磨损',
    en: 'Gear Wear',
    icon: '🟠',
    color: '#f97316',
    category: 'mechanical',
    description: '齿轮齿面磨损、点蚀或断齿，表现为啮合频率异常',
    relatedSensors: ['vibration', 'current', 'oil_analysis'],
  },
  {
    id: 'misalignment',
    zh: '不对中',
    en: 'Misalignment',
    icon: '🟡',
    color: '#eab308',
    category: 'mechanical',
    description: '轴系角度或平行不对中，表现为2倍频振动',
    relatedSensors: ['vibration', 'temperature'],
  },
  {
    id: 'imbalance',
    zh: '不平衡',
    en: 'Imbalance',
    icon: '🔵',
    color: '#3b82f6',
    category: 'mechanical',
    description: '转子质量不平衡，表现为1倍频振动',
    relatedSensors: ['vibration'],
  },
  {
    id: 'looseness',
    zh: '松动',
    en: 'Looseness',
    icon: '🟣',
    color: '#8b5cf6',
    category: 'structural',
    description: '结构松动或基础松动，表现为多倍频和亚谐波',
    relatedSensors: ['vibration', 'displacement'],
  },
  {
    id: 'electrical_fault',
    zh: '电气故障',
    en: 'Electrical Fault',
    icon: '⚡',
    color: '#ec4899',
    category: 'electrical',
    description: '电气连接异常、绝缘劣化、谐波畸变',
    relatedSensors: ['current', 'voltage', 'temperature'],
  },
  {
    id: 'normal',
    zh: '正常',
    en: 'Normal',
    icon: '🟢',
    color: '#22c55e',
    category: 'normal',
    description: '设备运行状态正常',
    relatedSensors: [],
  },
];

// ============================================================================
// 内置专家默认配置
// ============================================================================

export interface ExpertDefaultConfig {
  /** 专家类型 ID */
  type: string;
  /** 专家名称 */
  name: string;
  /** 默认权重 */
  defaultWeight: number;
  /** 描述 */
  description: string;
  /** 擅长检测的故障类型 */
  specialties: string[];
  /** 所需传感器 */
  requiredSensors: string[];
}

export const EXPERT_DEFAULTS: ExpertDefaultConfig[] = [
  {
    type: 'vibration',
    name: 'VibrationExpert',
    defaultWeight: 1.0,
    description: '振动信号分析专家 — 基于 ISO 10816/20816 标准，分析振动 RMS、频谱、包络',
    specialties: ['bearing_damage', 'misalignment', 'imbalance', 'looseness', 'gear_wear'],
    requiredSensors: ['vibration_rms', 'dominant_frequency'],
  },
  {
    type: 'temperature',
    name: 'TemperatureExpert',
    defaultWeight: 0.8,
    description: '温度分析专家 — 基于热力学模型，分析绝对温度和温升趋势',
    specialties: ['bearing_damage', 'electrical_fault'],
    requiredSensors: ['temperature', 'temperature_rise'],
  },
  {
    type: 'current',
    name: 'CurrentExpert',
    defaultWeight: 0.9,
    description: '电流分析专家 — 分析三相电流不平衡度和谐波畸变率 (THD)',
    specialties: ['electrical_fault', 'gear_wear'],
    requiredSensors: ['current_imbalance', 'thd'],
  },
];

// ============================================================================
// 融合引擎参数
// ============================================================================

export const FUSION_ENGINE_CONFIG = {
  /** DS 组合规则类型 */
  combinationRule: 'dempster' as const,
  /** 冲突惩罚因子（与 Python 端一致） */
  conflictPenaltyFactor: 0.3,
  /** 冲突解决策略 */
  conflictResolutionStrategy: 'weighted_vote' as const,
  /** 高冲突阈值 */
  highConflictThreshold: 0.5,
  /** 中冲突阈值 */
  mediumConflictThreshold: 0.2,
  /** 诊断历史最大保留数 */
  maxHistoryEntries: 200,
};

// ============================================================================
// Python 端 API 映射
// ============================================================================

/**
 * Python 端传感器字段名 → TypeScript 端字段名映射
 *
 * Python 端使用 snake_case，TypeScript 端使用 camelCase
 * API 接口层统一使用 snake_case（与 Python 保持一致）
 */
export const SENSOR_FIELD_MAPPING: Record<string, { pythonKey: string; tsKey: string; label: string; unit: string }> = {
  vibration_rms:       { pythonKey: 'vibration_rms',       tsKey: 'vibrationRms',       label: '振动 RMS',    unit: 'mm/s' },
  dominant_frequency:  { pythonKey: 'dominant_frequency',  tsKey: 'dominantFrequency',  label: '主频率',      unit: 'Hz' },
  temperature:         { pythonKey: 'temperature',         tsKey: 'temperature',        label: '温度',        unit: '°C' },
  temperature_rise:    { pythonKey: 'temperature_rise',    tsKey: 'temperatureRise',    label: '温升',        unit: '°C' },
  current_imbalance:   { pythonKey: 'current_imbalance',   tsKey: 'currentImbalance',   label: '电流不平衡',  unit: '%' },
  thd:                 { pythonKey: 'thd',                 tsKey: 'thd',                label: '谐波畸变',    unit: '%' },
  bearing_temperature: { pythonKey: 'bearing_temperature', tsKey: 'bearingTemperature', label: '轴承温度',    unit: '°C' },
};

/**
 * Python 端 DiagnosisResult 字段映射
 *
 * Python 端:
 *   expert_name, fault_type, confidence, fault_component, severity, evidence, recommendations, expert_weight
 *
 * TypeScript 端:
 *   expertName, faultType, confidence, faultComponent, severity, evidence, recommendations, expertWeight
 */
export const DIAGNOSIS_RESULT_MAPPING = {
  expert_name:     'expertName',
  fault_type:      'faultType',
  confidence:      'confidence',
  fault_component: 'faultComponent',
  severity:        'severity',
  evidence:        'evidence',
  recommendations: 'recommendations',
  expert_weight:   'expertWeight',
} as const;
