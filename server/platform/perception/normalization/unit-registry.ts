/**
 * ============================================================================
 * 单位换算注册表 — 工业传感器数据标准化
 * ============================================================================
 *
 * 核心能力：
 *   1. 工业常用单位换算表（振动/温度/压力/电流/转速/应力）
 *   2. 设备类型默认单位配置（基于 4 段式设备编码）
 *   3. 自动单位检测与转换
 *   4. 与 conditionNormalizer.service.ts 集成入口
 *
 * 设计原则：
 *   - 物理约束优先：所有换算基于国际标准（ISO / IEC）
 *   - 可扩展：通过 registerConversion() 动态注册新单位
 *   - 零依赖：纯函数式实现，不引入外部包
 *
 * 覆盖单位类别：
 *   | 类别   | 标准单位    | 常见来源单位                          |
 *   |--------|------------|---------------------------------------|
 *   | 振动   | mm/s (RMS) | m/s², g, in/s, mil(pk-pk), um(pk)     |
 *   | 温度   | ℃          | ℉, K                                  |
 *   | 压力   | MPa        | bar, psi, kPa, atm, kgf/cm²          |
 *   | 电流   | A          | mA, kA                                |
 *   | 转速   | rpm        | rad/s, Hz, rps                        |
 *   | 应力   | MPa        | N/mm², kN/m², ksi, kgf/mm²           |
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('unit-registry');

// ============================================================================
// 类型定义
// ============================================================================

/** 物理量类别 */
export type PhysicalQuantity =
  | 'vibration_velocity'
  | 'vibration_acceleration'
  | 'vibration_displacement'
  | 'temperature'
  | 'pressure'
  | 'current'
  | 'rotational_speed'
  | 'stress'
  | 'force'
  | 'length'
  | 'frequency';

/** 单位标识符 */
export type UnitId = string;

/** 单位定义 */
export interface UnitDefinition {
  id: UnitId;
  name: string;
  symbol: string;
  quantity: PhysicalQuantity;
  /** 到该物理量标准单位的换算系数: standardValue = value * factor + offset */
  factor: number;
  offset: number;
  /** ISO/IEC 标准参考（可选） */
  standard?: string;
}

/** 单位换算结果 */
export interface ConversionResult {
  value: number;
  fromUnit: UnitId;
  toUnit: UnitId;
  factor: number;
  offset: number;
  /** 换算是否涉及非线性关系（如振动速度↔加速度需要频率参数） */
  isApproximate: boolean;
  /** 近似换算时使用的额外参数 */
  approximationParams?: Record<string, number>;
}

/** 设备类型默认单位配置 */
export interface EquipmentUnitProfile {
  /** 设备类型编码（匹配 4 段式编码的 system 段，如 TROLLEY / HOIST / GANTRY） */
  equipmentPattern: string;
  /** 各物理量的默认单位 */
  defaults: Partial<Record<PhysicalQuantity, UnitId>>;
  /** 传感器级别覆盖：sensorId → unitId */
  sensorOverrides?: Record<string, UnitId>;
}

/** 批量转换输入 */
export interface BatchConversionInput {
  values: number[];
  fromUnit: UnitId;
  toUnit: UnitId;
  /** 近似换算参数（如频率 Hz，用于振动速度↔加速度换算） */
  params?: Record<string, number>;
}

/** 用于 conditionNormalizer 集成的归一化上下文 */
export interface NormalizationUnitContext {
  /** 原始数据单位 */
  sourceUnit: UnitId;
  /** 目标标准单位 */
  targetUnit: UnitId;
  /** 换算后的值 */
  convertedValue: number;
  /** 用于物理合理性校验的有效范围 */
  physicalRange: { min: number; max: number };
}

// ============================================================================
// 标准单位定义
// ============================================================================

/** 各物理量的标准（目标）单位 */
const STANDARD_UNITS: Record<PhysicalQuantity, UnitId> = {
  vibration_velocity: 'mm_s_rms',
  vibration_acceleration: 'm_s2',
  vibration_displacement: 'um_pk',
  temperature: 'degC',
  pressure: 'MPa',
  current: 'A',
  rotational_speed: 'rpm',
  stress: 'MPa',
  force: 'N',
  length: 'mm',
  frequency: 'Hz',
};

/**
 * 完整单位定义表
 * factor/offset 将值换算到该类别的标准单位：
 *   standard = value * factor + offset
 */
const UNIT_DEFINITIONS: UnitDefinition[] = [
  // ------ 振动速度 (标准: mm/s RMS) ------
  { id: 'mm_s_rms',    name: '毫米每秒(RMS)',       symbol: 'mm/s',    quantity: 'vibration_velocity', factor: 1,       offset: 0, standard: 'ISO 10816' },
  { id: 'mm_s_pk',     name: '毫米每秒(峰值)',       symbol: 'mm/s pk', quantity: 'vibration_velocity', factor: 0.7071,  offset: 0 },
  { id: 'in_s_rms',    name: '英寸每秒(RMS)',        symbol: 'in/s',    quantity: 'vibration_velocity', factor: 25.4,    offset: 0 },
  { id: 'in_s_pk',     name: '英寸每秒(峰值)',       symbol: 'in/s pk', quantity: 'vibration_velocity', factor: 17.96,   offset: 0 },
  { id: 'm_s_rms',     name: '米每秒(RMS)',          symbol: 'm/s',     quantity: 'vibration_velocity', factor: 1000,    offset: 0 },

  // ------ 振动加速度 (标准: m/s²) ------
  { id: 'm_s2',        name: '米每秒平方',           symbol: 'm/s²',    quantity: 'vibration_acceleration', factor: 1,       offset: 0, standard: 'ISO 2954' },
  { id: 'g',           name: '重力加速度',           symbol: 'g',       quantity: 'vibration_acceleration', factor: 9.80665, offset: 0 },
  { id: 'mg',          name: '毫重力加速度',         symbol: 'mg',      quantity: 'vibration_acceleration', factor: 0.00981, offset: 0 },
  { id: 'mm_s2',       name: '毫米每秒平方',         symbol: 'mm/s²',   quantity: 'vibration_acceleration', factor: 0.001,   offset: 0 },

  // ------ 振动位移 (标准: um pk) ------
  { id: 'um_pk',       name: '微米(峰值)',           symbol: 'um pk',   quantity: 'vibration_displacement', factor: 1,       offset: 0, standard: 'ISO 7919' },
  { id: 'um_pkpk',     name: '微米(峰峰值)',         symbol: 'um p-p',  quantity: 'vibration_displacement', factor: 0.5,     offset: 0 },
  { id: 'mil_pkpk',    name: '密耳(峰峰值)',         symbol: 'mil p-p', quantity: 'vibration_displacement', factor: 12.7,    offset: 0 },
  { id: 'mm_pk',       name: '毫米(峰值)',           symbol: 'mm pk',   quantity: 'vibration_displacement', factor: 1000,    offset: 0 },

  // ------ 温度 (标准: ℃) ------
  { id: 'degC',        name: '摄氏度',              symbol: '℃',       quantity: 'temperature', factor: 1,             offset: 0,        standard: 'IEC 60751' },
  { id: 'degF',        name: '华氏度',              symbol: '℉',       quantity: 'temperature', factor: 5 / 9,         offset: -32 * 5 / 9 },
  { id: 'K',           name: '开尔文',              symbol: 'K',       quantity: 'temperature', factor: 1,             offset: -273.15 },

  // ------ 压力 (标准: MPa) ------
  { id: 'MPa',         name: '兆帕',                symbol: 'MPa',     quantity: 'pressure', factor: 1,         offset: 0, standard: 'ISO 1000' },
  { id: 'kPa',         name: '千帕',                symbol: 'kPa',     quantity: 'pressure', factor: 0.001,     offset: 0 },
  { id: 'Pa',          name: '帕斯卡',              symbol: 'Pa',      quantity: 'pressure', factor: 1e-6,      offset: 0 },
  { id: 'bar',         name: '巴',                  symbol: 'bar',     quantity: 'pressure', factor: 0.1,       offset: 0 },
  { id: 'psi',         name: '磅每平方英寸',        symbol: 'psi',     quantity: 'pressure', factor: 0.006895,  offset: 0 },
  { id: 'atm',         name: '标准大气压',          symbol: 'atm',     quantity: 'pressure', factor: 0.101325,  offset: 0 },
  { id: 'kgf_cm2',     name: '千克力每平方厘米',    symbol: 'kgf/cm²', quantity: 'pressure', factor: 0.098066,  offset: 0 },

  // ------ 电流 (标准: A) ------
  { id: 'A',           name: '安培',                symbol: 'A',       quantity: 'current', factor: 1,     offset: 0, standard: 'IEC 60044' },
  { id: 'mA',          name: '毫安',                symbol: 'mA',      quantity: 'current', factor: 0.001, offset: 0 },
  { id: 'kA',          name: '千安',                symbol: 'kA',      quantity: 'current', factor: 1000,  offset: 0 },

  // ------ 转速 (标准: rpm) ------
  { id: 'rpm',         name: '转每分',              symbol: 'rpm',     quantity: 'rotational_speed', factor: 1,                     offset: 0 },
  { id: 'rad_s',       name: '弧度每秒',            symbol: 'rad/s',   quantity: 'rotational_speed', factor: 60 / (2 * Math.PI),    offset: 0 },
  { id: 'Hz',          name: '赫兹(转频)',           symbol: 'Hz',      quantity: 'rotational_speed', factor: 60,                    offset: 0 },
  { id: 'rps',         name: '转每秒',              symbol: 'rps',     quantity: 'rotational_speed', factor: 60,                    offset: 0 },

  // ------ 应力 (标准: MPa) ------
  { id: 'MPa_stress',  name: '兆帕(应力)',          symbol: 'MPa',     quantity: 'stress', factor: 1,       offset: 0, standard: 'ISO 6892' },
  { id: 'N_mm2',       name: '牛每平方毫米',        symbol: 'N/mm²',   quantity: 'stress', factor: 1,       offset: 0 },
  { id: 'kN_m2',       name: '千牛每平方米',        symbol: 'kN/m²',   quantity: 'stress', factor: 0.001,   offset: 0 },
  { id: 'ksi',         name: '千磅每平方英寸',      symbol: 'ksi',     quantity: 'stress', factor: 6.8948,  offset: 0 },
  { id: 'kgf_mm2',     name: '千克力每平方毫米',    symbol: 'kgf/mm²', quantity: 'stress', factor: 9.80665, offset: 0 },

  // ------ 力 (标准: N) ------
  { id: 'N',           name: '牛顿',                symbol: 'N',       quantity: 'force', factor: 1,        offset: 0 },
  { id: 'kN',          name: '千牛',                symbol: 'kN',      quantity: 'force', factor: 1000,     offset: 0 },
  { id: 'kgf',         name: '千克力',              symbol: 'kgf',     quantity: 'force', factor: 9.80665,  offset: 0 },
  { id: 'lbf',         name: '磅力',                symbol: 'lbf',     quantity: 'force', factor: 4.44822,  offset: 0 },
  { id: 'tf',          name: '吨力',                symbol: 'tf',      quantity: 'force', factor: 9806.65,  offset: 0 },

  // ------ 长度 (标准: mm) ------
  { id: 'mm',          name: '毫米',                symbol: 'mm',      quantity: 'length', factor: 1,       offset: 0 },
  { id: 'um',          name: '微米',                symbol: 'um',      quantity: 'length', factor: 0.001,   offset: 0 },
  { id: 'm',           name: '米',                  symbol: 'm',       quantity: 'length', factor: 1000,    offset: 0 },
  { id: 'in',          name: '英寸',                symbol: 'in',      quantity: 'length', factor: 25.4,    offset: 0 },
  { id: 'mil',         name: '密耳',                symbol: 'mil',     quantity: 'length', factor: 0.0254,  offset: 0 },

  // ------ 频率 (标准: Hz) ------
  { id: 'Hz_freq',     name: '赫兹',                symbol: 'Hz',      quantity: 'frequency', factor: 1,       offset: 0 },
  { id: 'kHz',         name: '千赫',                symbol: 'kHz',     quantity: 'frequency', factor: 1000,    offset: 0 },
  { id: 'cpm',         name: '周每分',              symbol: 'cpm',     quantity: 'frequency', factor: 1 / 60,  offset: 0 },
  { id: 'order',       name: '阶次(×转频)',         symbol: 'X',       quantity: 'frequency', factor: 1,       offset: 0 },
];

// ============================================================================
// 设备类型默认单位配置
// ============================================================================

/**
 * 港机设备各系统的默认传感器单位配置
 * 基于 KNOWLEDGE_ARCHITECTURE.md 的 4 段式编码
 */
const EQUIPMENT_UNIT_PROFILES: EquipmentUnitProfile[] = [
  {
    equipmentPattern: 'HOIST',
    defaults: {
      vibration_velocity: 'mm_s_rms',
      vibration_acceleration: 'g',
      vibration_displacement: 'um_pk',
      temperature: 'degC',
      pressure: 'MPa',
      current: 'A',
      rotational_speed: 'rpm',
      stress: 'MPa_stress',
    },
    sensorOverrides: {
      'VT-01': 'mm_s_rms',   // 起升电机驱动端
      'VT-02': 'mm_s_rms',   // 起升电机非驱动端
      'VT-03': 'mm_s_rms',   // 减速器高速轴
      'VT-04': 'mm_s_rms',   // 减速器低速轴
      'VT-05': 'mm_s_rms',   // 卷筒轴承驱动端
      'VT-06': 'mm_s_rms',   // 卷筒轴承非驱动端
    },
  },
  {
    equipmentPattern: 'TROLLEY',
    defaults: {
      vibration_velocity: 'mm_s_rms',
      vibration_acceleration: 'g',
      temperature: 'degC',
      current: 'A',
      rotational_speed: 'rpm',
      stress: 'MPa_stress',
    },
    sensorOverrides: {
      'VT-07': 'mm_s_rms',   // 小车电机驱动端
      'VT-08': 'mm_s_rms',   // 小车电机非驱动端
      'VT-09': 'mm_s_rms',   // 小车车轮轴承
      'VT-10': 'mm_s_rms',   // 小车减速器高速轴
      'VT-11': 'mm_s_rms',   // 小车减速器低速轴
    },
  },
  {
    equipmentPattern: 'GANTRY',
    defaults: {
      vibration_velocity: 'mm_s_rms',
      vibration_acceleration: 'g',
      temperature: 'degC',
      current: 'A',
      rotational_speed: 'rpm',
      stress: 'MPa_stress',
    },
    sensorOverrides: {
      'VT-12': 'mm_s_rms',   // 大车电机 A 驱动端
      'VT-13': 'mm_s_rms',   // 大车电机 A 非驱动端
      'VT-14': 'mm_s_rms',   // 大车电机 B 驱动端
      'VT-15': 'mm_s_rms',   // 大车电机 B 非驱动端
      'VT-16': 'mm_s_rms',   // 大车减速器
    },
  },
  {
    equipmentPattern: 'STRUCTURE',
    defaults: {
      stress: 'MPa_stress',
      temperature: 'degC',
      vibration_displacement: 'um_pk',
      force: 'kN',
      length: 'mm',
    },
  },
];

/**
 * 各物理量的物理合理范围（标准单位）
 * 用于数据质量校验：超出范围的值视为传感器异常
 */
const PHYSICAL_VALID_RANGES: Record<PhysicalQuantity, { min: number; max: number }> = {
  vibration_velocity:     { min: 0,      max: 100 },     // mm/s RMS，ISO 10816 最高 Zone D ~45mm/s
  vibration_acceleration: { min: 0,      max: 500 },     // m/s²，重型机械极端情况
  vibration_displacement: { min: 0,      max: 1000 },    // um pk
  temperature:            { min: -40,    max: 300 },     // ℃，工业设备典型范围
  pressure:               { min: 0,      max: 100 },     // MPa，液压系统上限
  current:                { min: 0,      max: 5000 },    // A，大型电机
  rotational_speed:       { min: 0,      max: 10000 },   // rpm
  stress:                 { min: -500,   max: 1000 },    // MPa，钢结构
  force:                  { min: -10000, max: 10000 },   // N
  length:                 { min: 0,      max: 1e8 },     // mm
  frequency:              { min: 0,      max: 100000 },  // Hz
};

// ============================================================================
// 单位换算注册表
// ============================================================================

export class UnitRegistry {
  private readonly units: Map<UnitId, UnitDefinition> = new Map();
  private readonly profiles: EquipmentUnitProfile[] = [];
  private readonly customConversions: Map<string, (value: number, params?: Record<string, number>) => number> = new Map();

  constructor() {
    // 注册所有内置单位
    for (const def of UNIT_DEFINITIONS) {
      this.units.set(def.id, def);
    }
    // 注册设备配置
    this.profiles.push(...EQUIPMENT_UNIT_PROFILES);

    // 注册跨量纲近似换算（需要额外参数）
    this.registerCrossQuantityConversions();

    log.info({ unitCount: this.units.size, profileCount: this.profiles.length }, '单位注册表初始化');
  }

  // --------------------------------------------------------------------------
  // 核心换算
  // --------------------------------------------------------------------------

  /**
   * 单位换算：将值从 fromUnit 转换到 toUnit
   *
   * 同量纲换算精确执行；跨量纲（如加速度↔速度）需提供频率参数，结果标记为近似。
   */
  convert(value: number, fromUnit: UnitId, toUnit: UnitId, params?: Record<string, number>): ConversionResult {
    if (fromUnit === toUnit) {
      return { value, fromUnit, toUnit, factor: 1, offset: 0, isApproximate: false };
    }

    const fromDef = this.units.get(fromUnit);
    const toDef = this.units.get(toUnit);
    if (!fromDef) throw new Error(`未知单位: ${fromUnit}`);
    if (!toDef) throw new Error(`未知单位: ${toUnit}`);

    // 同量纲精确换算
    if (fromDef.quantity === toDef.quantity) {
      return this.convertSameQuantity(value, fromDef, toDef);
    }

    // 跨量纲近似换算
    const crossKey = `${fromDef.quantity}->${toDef.quantity}`;
    const crossFn = this.customConversions.get(crossKey);
    if (crossFn) {
      const converted = crossFn(value * fromDef.factor + fromDef.offset, params);
      // 从标准单位转到目标单位
      const result = (converted - toDef.offset) / toDef.factor;
      return {
        value: result,
        fromUnit,
        toUnit,
        factor: NaN,
        offset: NaN,
        isApproximate: true,
        approximationParams: params,
      };
    }

    throw new Error(`不支持从 ${fromDef.quantity}(${fromUnit}) 到 ${toDef.quantity}(${toUnit}) 的换算`);
  }

  /** 同量纲精确换算 */
  private convertSameQuantity(value: number, from: UnitDefinition, to: UnitDefinition): ConversionResult {
    // value → 标准单位 → 目标单位
    const standard = value * from.factor + from.offset;
    const result = (standard - to.offset) / to.factor;

    return {
      value: result,
      fromUnit: from.id,
      toUnit: to.id,
      factor: from.factor / to.factor,
      offset: (from.offset - to.offset) / to.factor,
      isApproximate: false,
    };
  }

  /**
   * 批量换算（高性能路径，避免逐个查找开销）
   */
  convertBatch(input: BatchConversionInput): number[] {
    const { values, fromUnit, toUnit, params } = input;
    if (fromUnit === toUnit) return [...values];

    const fromDef = this.units.get(fromUnit);
    const toDef = this.units.get(toUnit);
    if (!fromDef) throw new Error(`未知单位: ${fromUnit}`);
    if (!toDef) throw new Error(`未知单位: ${toUnit}`);

    // 同量纲：预计算系数，循环内只做乘加
    if (fromDef.quantity === toDef.quantity) {
      const f = fromDef.factor / toDef.factor;
      const o = (fromDef.offset - toDef.offset) / toDef.factor;
      const out = new Array<number>(values.length);
      for (let i = 0; i < values.length; i++) {
        out[i] = values[i] * f + o;
      }
      return out;
    }

    // 跨量纲：逐个转换
    return values.map(v => this.convert(v, fromUnit, toUnit, params).value);
  }

  // --------------------------------------------------------------------------
  // 设备默认单位
  // --------------------------------------------------------------------------

  /**
   * 获取设备类型的默认单位
   * @param componentCode 4 段式编码，如 "TROLLEY.TRAVEL.MOTOR"
   * @param quantity 物理量类别
   */
  getDefaultUnit(componentCode: string, quantity: PhysicalQuantity): UnitId {
    const segments = componentCode.split('.');
    // 从最具体到最宽泛匹配
    for (let len = segments.length; len > 0; len--) {
      const pattern = segments.slice(0, len).join('.');
      const profile = this.profiles.find(p => pattern.startsWith(p.equipmentPattern));
      if (profile?.defaults[quantity]) {
        return profile.defaults[quantity]!;
      }
    }
    return STANDARD_UNITS[quantity];
  }

  /**
   * 获取传感器的默认单位（支持传感器级覆盖）
   */
  getSensorUnit(sensorId: string, componentCode: string, quantity: PhysicalQuantity): UnitId {
    for (const profile of this.profiles) {
      if (componentCode.startsWith(profile.equipmentPattern)) {
        if (profile.sensorOverrides?.[sensorId]) {
          return profile.sensorOverrides[sensorId];
        }
        if (profile.defaults[quantity]) {
          return profile.defaults[quantity]!;
        }
      }
    }
    return STANDARD_UNITS[quantity];
  }

  /**
   * 将值转换到该物理量的标准单位
   */
  toStandard(value: number, fromUnit: UnitId, params?: Record<string, number>): ConversionResult {
    const def = this.units.get(fromUnit);
    if (!def) throw new Error(`未知单位: ${fromUnit}`);
    const stdUnit = STANDARD_UNITS[def.quantity];
    return this.convert(value, fromUnit, stdUnit, params);
  }

  // --------------------------------------------------------------------------
  // conditionNormalizer 集成
  // --------------------------------------------------------------------------

  /**
   * 为 conditionNormalizer 提供单位归一化上下文
   *
   * 典型用法：在 ConditionNormalizerEngine.processSlice() 之前，
   * 先调用此方法将原始数据转为标准单位，然后再做基线学习和异常检测。
   *
   * @param rawValue  原始传感器读数
   * @param sourceUnit 原始单位
   * @param componentCode 设备编码（用于查默认目标单位）
   * @param quantity 物理量类别
   */
  normalizeForCondition(
    rawValue: number,
    sourceUnit: UnitId,
    componentCode: string,
    quantity: PhysicalQuantity,
  ): NormalizationUnitContext {
    const targetUnit = this.getDefaultUnit(componentCode, quantity);
    const result = this.convert(rawValue, sourceUnit, targetUnit);
    const range = PHYSICAL_VALID_RANGES[quantity];

    return {
      sourceUnit,
      targetUnit,
      convertedValue: result.value,
      physicalRange: range,
    };
  }

  /**
   * 批量归一化 DataSlice 中的字段到标准单位
   *
   * 将 conditionNormalizer 的 DataSlice 中已知字段自动转换：
   *   - vibrationSpeed → mm/s RMS
   *   - bearingTemp    → ℃
   *   - current        → A
   *   - motorSpeed     → rpm
   */
  normalizeDataSlice(
    slice: Record<string, number | undefined>,
    unitMap: Record<string, UnitId>,
    componentCode: string,
  ): { normalized: Record<string, number>; conversions: NormalizationUnitContext[] } {
    const FIELD_QUANTITY: Record<string, PhysicalQuantity> = {
      vibrationSpeed: 'vibration_velocity',
      bearingTemp: 'temperature',
      motorTemp: 'temperature',
      current: 'current',
      motorSpeed: 'rotational_speed',
      loadWeight: 'force',
      hydraulicPressure: 'pressure',
      stressDelta: 'stress',
    };

    const normalized: Record<string, number> = {};
    const conversions: NormalizationUnitContext[] = [];

    for (const [field, value] of Object.entries(slice)) {
      if (value === undefined || value === null) continue;
      const numValue = Number(value);
      if (isNaN(numValue)) continue;

      const quantity = FIELD_QUANTITY[field];
      const sourceUnit = unitMap[field];

      if (quantity && sourceUnit) {
        const ctx = this.normalizeForCondition(numValue, sourceUnit, componentCode, quantity);
        normalized[field] = ctx.convertedValue;
        conversions.push(ctx);
      } else {
        // 无映射的字段原样保留
        normalized[field] = numValue;
      }
    }

    return { normalized, conversions };
  }

  // --------------------------------------------------------------------------
  // 物理合理性校验
  // --------------------------------------------------------------------------

  /**
   * 检查值是否在物理合理范围内（标准单位）
   * 用于数据质量评分的「物理合理性」维度
   */
  isPhysicallyValid(value: number, quantity: PhysicalQuantity): boolean {
    const range = PHYSICAL_VALID_RANGES[quantity];
    return value >= range.min && value <= range.max;
  }

  /**
   * 获取物理合理范围（标准单位）
   */
  getPhysicalRange(quantity: PhysicalQuantity): { min: number; max: number } {
    return { ...PHYSICAL_VALID_RANGES[quantity] };
  }

  // --------------------------------------------------------------------------
  // 注册与查询
  // --------------------------------------------------------------------------

  /** 注册自定义单位 */
  registerUnit(def: UnitDefinition): void {
    if (this.units.has(def.id)) {
      log.warn({ unitId: def.id }, '覆盖已有单位定义');
    }
    this.units.set(def.id, def);
  }

  /** 注册自定义换算函数（跨量纲） */
  registerConversion(fromQuantity: PhysicalQuantity, toQuantity: PhysicalQuantity, fn: (standardValue: number, params?: Record<string, number>) => number): void {
    this.customConversions.set(`${fromQuantity}->${toQuantity}`, fn);
  }

  /** 注册设备单位配置 */
  registerProfile(profile: EquipmentUnitProfile): void {
    this.profiles.push(profile);
  }

  /** 查询单位定义 */
  getUnit(id: UnitId): UnitDefinition | undefined {
    return this.units.get(id);
  }

  /** 列出某物理量的所有可用单位 */
  listUnits(quantity: PhysicalQuantity): UnitDefinition[] {
    return [...this.units.values()].filter(u => u.quantity === quantity);
  }

  /** 获取物理量的标准单位 */
  getStandardUnit(quantity: PhysicalQuantity): UnitId {
    return STANDARD_UNITS[quantity];
  }

  /** 获取所有设备单位配置 */
  getProfiles(): EquipmentUnitProfile[] {
    return [...this.profiles];
  }

  // --------------------------------------------------------------------------
  // 跨量纲近似换算注册
  // --------------------------------------------------------------------------

  private registerCrossQuantityConversions(): void {
    // 振动加速度(m/s²) ↔ 振动速度(mm/s) — 需要频率参数
    // v = a / (2*pi*f) * 1000  (m/s² → mm/s, f in Hz)
    this.registerConversion('vibration_acceleration', 'vibration_velocity', (a_ms2, params) => {
      const freq = params?.frequency ?? params?.freq ?? 100; // 默认 100Hz
      return (a_ms2 / (2 * Math.PI * freq)) * 1000;
    });

    // 振动速度(mm/s) → 振动加速度(m/s²)
    // a = v * 2*pi*f / 1000
    this.registerConversion('vibration_velocity', 'vibration_acceleration', (v_mms, params) => {
      const freq = params?.frequency ?? params?.freq ?? 100;
      return (v_mms * 2 * Math.PI * freq) / 1000;
    });

    // 振动速度(mm/s) → 振动位移(um pk)
    // d = v / (2*pi*f) * 1000  (mm/s → um, f in Hz)
    this.registerConversion('vibration_velocity', 'vibration_displacement', (v_mms, params) => {
      const freq = params?.frequency ?? params?.freq ?? 100;
      return (v_mms / (2 * Math.PI * freq)) * 1000;
    });

    // 振动位移(um) → 振动速度(mm/s)
    this.registerConversion('vibration_displacement', 'vibration_velocity', (d_um, params) => {
      const freq = params?.frequency ?? params?.freq ?? 100;
      return (d_um * 2 * Math.PI * freq) / 1000;
    });
  }
}

// ============================================================================
// 单例
// ============================================================================

let _instance: UnitRegistry | null = null;

/** 获取全局 UnitRegistry 单例 */
export function getUnitRegistry(): UnitRegistry {
  if (!_instance) {
    _instance = new UnitRegistry();
  }
  return _instance;
}

/** 重置单例（用于测试） */
export function resetUnitRegistry(): void {
  _instance = null;
}
