/**
 * ============================================================================
 * P1-6: 工况归一化端到端管线
 * ============================================================================
 *
 * 端到端串联：
 *   1. 复合工况自动识别 → 3 级编码（如 HOIST.FULL_LOAD.HIGH_WIND）
 *   2. 工况切换记录写入 conditionInstances 表（含 stateSnapshot）
 *   3. 调用 ConditionNormalizerEngine 消除工况影响
 *   4. Condition 节点自动创建并关联到 KG
 *
 * 遵循原则：
 *   - 物理约束优先：归一化结果不违反物理范围
 *   - 降级不崩溃：DB/KG 不可用时内存降级运行
 *   - 单例+工厂：getConditionPipeline() / resetConditionPipeline()
 */

import { createModuleLogger } from '../../../core/logger';
import {
  ConditionNormalizerEngine,
  type DataSlice,
  type NormalizationResult,
  type LearnResult,
  type Baseline,
} from '../../../services/conditionNormalizer.service';

const log = createModuleLogger('condition-pipeline');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 复合工况环境参数
 *
 * 标准处理顺序（FIX-099: 确保参数顺序无关性）：
 *   windSpeed → ambientTemp → humidity → salinity
 */
export interface EnvironmentalParams {
  windSpeed?: number;       // m/s
  ambientTemp?: number;     // °C
  humidity?: number;        // %
  salinity?: number;        // g/L
}

/**
 * 标准字段顺序（FIX-099）
 * 所有环境参数处理都按此顺序，避免 JS 对象属性顺序不确定性
 */
const ENV_PARAM_ORDER: (keyof EnvironmentalParams)[] = [
  'windSpeed', 'ambientTemp', 'humidity', 'salinity',
];

/** 管线输入：传感器数据 + 环境参数 */
export interface PipelineInput {
  /** 设备 ID */
  equipmentId: string;
  /** 传感器数据切片（含 plcCode/current/loadWeight 等） */
  dataSlice: DataSlice;
  /** 环境参数（可选） */
  environmental?: EnvironmentalParams;
  /** 额定转速 RPM（默认 1470） */
  ratedRpm?: number;
}

/** 3 级工况编码 */
export interface ConditionEncoding {
  /** 一级：部件组 (HOIST/TROLLEY/GANTRY/ENV) */
  component: string;
  /** 二级：工况类型 (FULL_LOAD/EMPTY/IDLE 等) */
  conditionType: string;
  /** 三级：环境修饰 (HIGH_WIND/HIGH_TEMP/NORMAL 等) */
  modifier: string;
  /** 完整编码字符串 */
  full: string;
}

/** 管线输出 */
export interface PipelineResult {
  /** 识别到的工况编码 */
  encoding: ConditionEncoding;
  /** 归一化结果 */
  normalization: NormalizationResult;
  /** 是否发生了工况切换 */
  conditionChanged: boolean;
  /** 写入 DB 的 instance ID（DB 不可用时为 null） */
  instanceId: number | null;
  /** KG 节点是否已创建/存在 */
  kgNodeSynced: boolean;
  /** 管线执行时间 (ms) */
  pipelineTimeMs: number;
  /** 归一化健康指标（与工况无关的本征状态） */
  healthIndicators: Record<string, number>;
}

/** DB 适配器接口（依赖注入，便于测试） */
export interface ConditionDbAdapter {
  insertInstance(data: {
    profileId: number;
    machineId: string;
    startedAt: Date;
    trigger: 'auto_detection' | 'manual' | 'scheduler' | 'threshold_breach';
    stateSnapshot: Record<string, number>;
    status: 'active' | 'completed' | 'aborted';
  }): Promise<number | null>;

  completeInstance(instanceId: number, endedAt: Date): Promise<boolean>;
}

/** KG 适配器接口（依赖注入，便于测试） */
export interface ConditionKgAdapter {
  getConditionByEncoding(encoding: string): Promise<{ id: string; encoding: string } | null>;
  createCondition(node: {
    id: string;
    encoding: string;
    name: string;
    type: 'operating' | 'environmental' | 'load';
    description: string;
    parameters: Record<string, unknown>;
  }): Promise<{ id: string } | null>;
}

// ============================================================================
// 复合工况识别器
// ============================================================================

/** 工况识别规则 */
interface IdentificationRule {
  component: string;
  conditionType: string;
  /** 传感器条件 */
  sensorConditions: Array<{
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'between';
    value: number | [number, number];
  }>;
  /** 最小满足条件数 */
  minMatch: number;
  /** 优先级（低值优先） */
  priority: number;
}

/** 环境修饰规则 */
interface ModifierRule {
  modifier: string;
  conditions: Array<{
    field: keyof EnvironmentalParams;
    operator: 'gt' | 'lt' | 'gte' | 'lte';
    value: number;
  }>;
}

const IDENTIFICATION_RULES: IdentificationRule[] = [
  // 起升机构 — 重载
  {
    component: 'HOIST',
    conditionType: 'FULL_LOAD',
    sensorConditions: [
      { field: 'loadWeight', operator: 'gt', value: 30 },    // > 30 吨 ≈ 85% 额定
      { field: 'current', operator: 'gt', value: 0.5 },
    ],
    minMatch: 2,
    priority: 1,
  },
  // 小车运行（优先于空载，因为小车运行时 hoist 可能空载）
  {
    component: 'TROLLEY',
    conditionType: 'MOVING',
    sensorConditions: [
      { field: 'trolleySpeed', operator: 'gt', value: 0.1 },
    ],
    minMatch: 1,
    priority: 2,
  },
  // 大车运行
  {
    component: 'GANTRY',
    conditionType: 'MOVING',
    sensorConditions: [
      { field: 'gantrySpeed', operator: 'gt', value: 0.05 },
    ],
    minMatch: 1,
    priority: 3,
  },
  // 起升机构 — 空载（排在小车/大车之后）
  {
    component: 'HOIST',
    conditionType: 'EMPTY_LOAD',
    sensorConditions: [
      { field: 'loadWeight', operator: 'lte', value: 5 },
      { field: 'current', operator: 'gt', value: 0.1 },
      { field: 'motorSpeed', operator: 'gt', value: 10 },
    ],
    minMatch: 2,
    priority: 4,
  },
  // 待机
  {
    component: 'HOIST',
    conditionType: 'IDLE',
    sensorConditions: [
      { field: 'current', operator: 'lt', value: 0.1 },
      { field: 'motorSpeed', operator: 'lt', value: 10 },
    ],
    minMatch: 2,
    priority: 99,
  },
];

const MODIFIER_RULES: ModifierRule[] = [
  { modifier: 'HIGH_WIND', conditions: [{ field: 'windSpeed', operator: 'gt', value: 15 }] },
  { modifier: 'HIGH_TEMP', conditions: [{ field: 'ambientTemp', operator: 'gt', value: 35 }] },
  { modifier: 'SALT_FOG', conditions: [{ field: 'salinity', operator: 'gt', value: 3 }] },
  { modifier: 'HUMID', conditions: [{ field: 'humidity', operator: 'gt', value: 85 }] },
];

function evaluateSensorCondition(
  dataSlice: DataSlice,
  cond: { field: string; operator: string; value: number | [number, number] },
): boolean {
  const val = dataSlice[cond.field];
  if (val === undefined || val === null || typeof val !== 'number') return false;

  switch (cond.operator) {
    case 'gt': return val > (cond.value as number);
    case 'lt': return val < (cond.value as number);
    case 'gte': return val >= (cond.value as number);
    case 'lte': return val <= (cond.value as number);
    case 'between': {
      const [lo, hi] = cond.value as [number, number];
      return val >= lo && val <= hi;
    }
    default: return false;
  }
}

/**
 * 识别复合工况 → 生成 3 级编码
 */
export function identifyConditionEncoding(
  dataSlice: DataSlice,
  environmental?: EnvironmentalParams,
): ConditionEncoding {
  // 1. 匹配传感器规则 → component + conditionType
  let bestMatch: { component: string; conditionType: string; priority: number } | null = null;

  for (const rule of IDENTIFICATION_RULES) {
    let matched = 0;
    for (const cond of rule.sensorConditions) {
      if (evaluateSensorCondition(dataSlice, cond)) {
        matched++;
      }
    }
    if (matched >= rule.minMatch) {
      if (!bestMatch || rule.priority < bestMatch.priority) {
        bestMatch = { component: rule.component, conditionType: rule.conditionType, priority: rule.priority };
      }
    }
  }

  const component = bestMatch?.component ?? 'HOIST';
  const conditionType = bestMatch?.conditionType ?? 'IDLE';

  // 2. 匹配环境修饰规则 → modifier
  let modifier = 'NORMAL';
  if (environmental) {
    for (const rule of MODIFIER_RULES) {
      let allMatch = true;
      for (const cond of rule.conditions) {
        const val = environmental[cond.field];
        if (val === undefined || val === null) { allMatch = false; break; }
        switch (cond.operator) {
          case 'gt': if (!(val > cond.value)) allMatch = false; break;
          case 'lt': if (!(val < cond.value)) allMatch = false; break;
          case 'gte': if (!(val >= cond.value)) allMatch = false; break;
          case 'lte': if (!(val <= cond.value)) allMatch = false; break;
        }
        if (!allMatch) break;
      }
      if (allMatch) {
        modifier = rule.modifier;
        break; // 取第一个匹配的修饰
      }
    }
  }

  return {
    component,
    conditionType,
    modifier,
    full: `${component}.${conditionType}.${modifier}`,
  };
}

// ============================================================================
// 归一化健康指标提取
// ============================================================================

/**
 * 从归一化结果提取与工况无关的健康指标
 *
 * 物理含义：ratio ≈ 1.0 表示设备状态与该工况基线一致（健康）
 * ratio > 1.0 表示偏离基线（可能劣化），与工况无关。
 */
export function extractHealthIndicators(result: NormalizationResult): Record<string, number> {
  const indicators: Record<string, number> = {};
  for (const [feat, ratio] of Object.entries(result.ratios)) {
    // 健康指标 = 100 - |ratio - 1| * 100（百分制，100 = 完全健康）
    // 物理约束：最低 0，最高 100
    const deviation = Math.abs(ratio - 1.0);
    indicators[feat] = Math.max(0, Math.min(100, 100 * (1 - deviation)));
  }
  return indicators;
}

// ============================================================================
// 条件名称生成
// ============================================================================

const COMPONENT_NAMES: Record<string, string> = {
  HOIST: '起升机构', TROLLEY: '小车', GANTRY: '大车', ENV: '环境',
};

const CONDITION_TYPE_NAMES: Record<string, string> = {
  FULL_LOAD: '满载', EMPTY_LOAD: '空载', IDLE: '待机',
  MOVING: '运行', HIGH_SPEED: '高速运行',
};

const MODIFIER_NAMES: Record<string, string> = {
  NORMAL: '常规', HIGH_WIND: '大风', HIGH_TEMP: '高温',
  SALT_FOG: '盐雾', HUMID: '高湿',
};

function encodingToName(encoding: ConditionEncoding): string {
  const c = COMPONENT_NAMES[encoding.component] || encoding.component;
  const t = CONDITION_TYPE_NAMES[encoding.conditionType] || encoding.conditionType;
  const m = encoding.modifier === 'NORMAL' ? '' : `+${MODIFIER_NAMES[encoding.modifier] || encoding.modifier}`;
  return `${c}${t}${m}`;
}

function encodingToType(encoding: ConditionEncoding): 'operating' | 'environmental' | 'load' {
  if (encoding.modifier !== 'NORMAL' && ['HIGH_WIND', 'HIGH_TEMP', 'SALT_FOG', 'HUMID'].includes(encoding.modifier)) {
    return 'environmental';
  }
  if (encoding.conditionType === 'FULL_LOAD') return 'load';
  return 'operating';
}

// ============================================================================
// 管线主类
// ============================================================================

export class ConditionNormalizationPipeline {
  private engine: ConditionNormalizerEngine;
  private dbAdapter: ConditionDbAdapter | null;
  private kgAdapter: ConditionKgAdapter | null;

  /** 当前活跃工况（按设备） */
  private activeConditions: Map<string, {
    encoding: string;
    instanceId: number | null;
    startedAt: number;
  }> = new Map();

  /** KG 已同步的编码缓存 */
  private kgSyncedEncodings: Set<string> = new Set();

  constructor(opts?: {
    dbAdapter?: ConditionDbAdapter;
    kgAdapter?: ConditionKgAdapter;
    engineOverrides?: Record<string, any>;
  }) {
    this.engine = new ConditionNormalizerEngine(opts?.engineOverrides);
    this.dbAdapter = opts?.dbAdapter ?? null;
    this.kgAdapter = opts?.kgAdapter ?? null;
  }

  /**
   * 端到端处理：输入传感器数据 → 输出归一化健康指标
   */
  async process(input: PipelineInput): Promise<PipelineResult> {
    const start = Date.now();

    // 1. 复合工况识别
    const encoding = identifyConditionEncoding(input.dataSlice, input.environmental);
    log.info(`Condition identified: ${encoding.full}`, { equipmentId: input.equipmentId });

    // 2. 检测工况切换
    const conditionChanged = this.detectConditionChange(input.equipmentId, encoding.full);

    // 3. DB 持久化工况实例
    let instanceId: number | null = null;
    if (conditionChanged) {
      instanceId = await this.persistConditionSwitch(input, encoding);
    }

    // 4. 归一化处理
    const normResult = this.engine.processSlice(input.dataSlice, 'ratio');

    // 5. 提取健康指标
    const healthIndicators = extractHealthIndicators(normResult);

    // 6. KG 同步
    const kgNodeSynced = await this.syncToKG(encoding);

    const pipelineTimeMs = Date.now() - start;
    log.info(`Pipeline completed in ${pipelineTimeMs}ms`, {
      equipmentId: input.equipmentId,
      encoding: encoding.full,
      conditionChanged,
      overallStatus: normResult.overallStatus,
    });

    return {
      encoding,
      normalization: normResult,
      conditionChanged,
      instanceId,
      kgNodeSynced,
      pipelineTimeMs,
      healthIndicators,
    };
  }

  /**
   * 批量学习基线（按工况分组）
   */
  learnBaselines(
    data: Array<{ dataSlice: DataSlice; environmental?: EnvironmentalParams }>,
  ): LearnResult[] {
    return this.engine.learnFromHistoricalData(
      data.map(d => d.dataSlice),
    );
  }

  /**
   * 手动加载基线（用于测试和初始化）
   */
  loadBaselines(baselines: Record<string, Record<string, Baseline>>): void {
    this.engine.loadBaselines(baselines);
  }

  /**
   * 获取引擎当前基线
   */
  getBaselines(): Record<string, Record<string, Baseline>> {
    return this.engine.getBaselines();
  }

  /**
   * 获取设备当前活跃工况
   */
  getActiveCondition(equipmentId: string): { encoding: string; instanceId: number | null } | null {
    const active = this.activeConditions.get(equipmentId);
    if (!active) return null;
    return { encoding: active.encoding, instanceId: active.instanceId };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private detectConditionChange(equipmentId: string, newEncoding: string): boolean {
    const current = this.activeConditions.get(equipmentId);
    if (!current || current.encoding !== newEncoding) {
      return true;
    }
    return false;
  }

  private async persistConditionSwitch(
    input: PipelineInput,
    encoding: ConditionEncoding,
  ): Promise<number | null> {
    const now = new Date();

    // 完成上一个实例
    const prev = this.activeConditions.get(input.equipmentId);
    if (prev?.instanceId && this.dbAdapter) {
      try {
        await this.dbAdapter.completeInstance(prev.instanceId, now);
      } catch (e) {
        log.warn('Failed to complete previous condition instance', { error: e });
      }
    }

    // 构建 stateSnapshot
    const stateSnapshot: Record<string, number> = {};
    for (const [key, val] of Object.entries(input.dataSlice)) {
      if (typeof val === 'number') {
        stateSnapshot[key] = val;
      }
    }
    // 追加环境参数（FIX-099: 按标准顺序处理，避免属性顺序依赖）
    if (input.environmental) {
      for (const key of ENV_PARAM_ORDER) {
        const val = input.environmental[key];
        if (typeof val === 'number') {
          stateSnapshot[`env_${key}`] = val;
        }
      }
    }

    // 写入新实例
    let instanceId: number | null = null;
    if (this.dbAdapter) {
      try {
        instanceId = await this.dbAdapter.insertInstance({
          profileId: 1, // 默认 profile
          machineId: input.equipmentId,
          startedAt: now,
          trigger: 'auto_detection',
          stateSnapshot,
          status: 'active',
        });
        log.info(`Condition instance created: ${instanceId}`, {
          equipmentId: input.equipmentId,
          encoding: encoding.full,
        });
      } catch (e) {
        log.warn('Failed to persist condition instance — degraded mode', { error: e });
      }
    }

    // 更新内存状态
    this.activeConditions.set(input.equipmentId, {
      encoding: encoding.full,
      instanceId,
      startedAt: Date.now(),
    });

    return instanceId;
  }

  private async syncToKG(encoding: ConditionEncoding): Promise<boolean> {
    // 如果已同步过，跳过
    if (this.kgSyncedEncodings.has(encoding.full)) return true;

    if (!this.kgAdapter) {
      // KG 不可用 → 降级：只在内存记录
      this.kgSyncedEncodings.add(encoding.full);
      return false;
    }

    try {
      // 检查是否已存在
      const existing = await this.kgAdapter.getConditionByEncoding(encoding.full);
      if (existing) {
        this.kgSyncedEncodings.add(encoding.full);
        return true;
      }

      // 自动创建 Condition 节点
      const id = `COND-${encoding.full.replace(/\./g, '-')}`;
      const result = await this.kgAdapter.createCondition({
        id,
        encoding: encoding.full,
        name: encodingToName(encoding),
        type: encodingToType(encoding),
        description: `自动创建: ${encodingToName(encoding)} (${encoding.full})`,
        parameters: this.buildConditionParameters(encoding),
      });

      if (result) {
        this.kgSyncedEncodings.add(encoding.full);
        log.info(`KG Condition node created: ${encoding.full}`);
        return true;
      }
      return false;
    } catch (e) {
      log.warn('KG sync failed — degraded mode', { encoding: encoding.full, error: e });
      return false;
    }
  }

  private buildConditionParameters(encoding: ConditionEncoding): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // 根据 conditionType 添加负载参数
    if (encoding.conditionType === 'FULL_LOAD') {
      params.loadPercent = [85, 100];
    } else if (encoding.conditionType === 'EMPTY_LOAD') {
      params.loadPercent = [0, 15];
    }

    // 根据 modifier 添加环境参数
    switch (encoding.modifier) {
      case 'HIGH_WIND':
        params.windSpeed = [15, 25];
        break;
      case 'HIGH_TEMP':
        params.ambientTemp = [35, 50];
        break;
      case 'SALT_FOG':
        params.salinity = [3, 35];
        break;
      case 'HUMID':
        params.humidity = [85, 100];
        break;
    }

    return params;
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _pipelineInstance: ConditionNormalizationPipeline | null = null;

export function getConditionPipeline(opts?: {
  dbAdapter?: ConditionDbAdapter;
  kgAdapter?: ConditionKgAdapter;
}): ConditionNormalizationPipeline {
  if (!_pipelineInstance) {
    _pipelineInstance = new ConditionNormalizationPipeline(opts);
  }
  return _pipelineInstance;
}

export function resetConditionPipeline(opts?: {
  dbAdapter?: ConditionDbAdapter;
  kgAdapter?: ConditionKgAdapter;
}): ConditionNormalizationPipeline {
  _pipelineInstance = new ConditionNormalizationPipeline(opts);
  return _pipelineInstance;
}
