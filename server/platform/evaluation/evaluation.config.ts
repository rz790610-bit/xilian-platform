/**
 * ============================================================================
 * 评估体系统一配置 — evaluation.config.ts
 * ============================================================================
 *
 * 遵循 evolution.config.ts 模式：
 *   - 深拷贝隔离默认配置
 *   - 变更监听器
 *   - getEvaluationConfig / resetEvaluationConfig 工厂函数
 *   - EventBus 主题常量
 *
 * 架构位置: server/platform/evaluation/
 */

import { createModuleLogger } from '../../core/logger';
import type { EvaluationConfig, DeepPartial } from './evaluation.types';

const log = createModuleLogger('evaluation-config');

// ============================================================================
// EventBus 主题常量
// ============================================================================

/** 评估体系 EventBus 主题 */
export const EVALUATION_TOPICS = {
  /** 单模块评估完成 */
  MODULE_EVALUATED: 'evaluation.module.evaluated',
  /** 全量评估完成 */
  ALL_EVALUATED: 'evaluation.module.allEvaluated',
  /** 组合优化完成 */
  COMBINATION_OPTIMIZED: 'evaluation.combination.optimized',
  /** 业务 KPI 计算完成 */
  BUSINESS_COMPUTED: 'evaluation.business.computed',
  /** 仪表盘数据生成完成 */
  DASHBOARD_GENERATED: 'evaluation.dashboard.generated',
  /** 检测到评分退步 */
  REGRESSION_DETECTED: 'evaluation.module.regressionDetected',
} as const;

export type EvaluationTopicKey = keyof typeof EVALUATION_TOPICS;
export type EvaluationTopicValue = typeof EVALUATION_TOPICS[EvaluationTopicKey];

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: EvaluationConfig = {
  scheduledIntervalMs: 86_400_000,    // 24 小时
  evaluationWindowMs: 2_592_000_000,  // 30 天
  dimensionWeights: {
    technical: 0.35,
    business: 0.30,
    evolution: 0.20,
    cost: 0.15,
  },
  technicalWeights: {
    algorithmAccuracy: 0.45,
    dataQuality: 0.25,
    faultModeCoverage: 0.30,
  },
  businessWeights: {
    earlyWarning: 0.30,
    falseAlarm: 0.25,
    adoptionRate: 0.20,
    avoidedDowntime: 0.25,
  },
  combinationOptimizer: {
    maxCombinationsPerDeviceType: 50,
    topN: 3,
    minHistoricalCases: 10,
    bootstrapSamples: 100,
  },
  combinationScoringWeights: {
    accuracy: 0.40,
    coverage: 0.25,
    latency: 0.20,
    cost: 0.15,
  },
  regressionThreshold: -5,
};

// ============================================================================
// 配置管理器
// ============================================================================

type ConfigChangeListener = (config: EvaluationConfig) => void;

/** 当前活跃配置（深拷贝隔离） */
let _config: EvaluationConfig = deepClone(DEFAULT_CONFIG);

/** 变更监听器 */
const _listeners: Set<ConfigChangeListener> = new Set();

/** 深拷贝工具 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** 深合并工具 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 获取当前评估配置（只读深拷贝）
 */
export function getEvaluationConfig(): Readonly<EvaluationConfig> {
  return deepClone(_config);
}

/**
 * 更新评估配置（热更新）
 */
export function updateEvaluationConfig(updates: DeepPartial<EvaluationConfig>): EvaluationConfig {
  _config = deepMerge(
    _config as unknown as Record<string, unknown>,
    updates as unknown as Record<string, unknown>,
  ) as unknown as EvaluationConfig;

  log.info('评估配置热更新', { updatedKeys: Object.keys(updates) });

  for (const listener of _listeners) {
    try {
      listener(deepClone(_config));
    } catch (err) {
      log.warn('配置变更监听器执行失败', { error: String(err) });
    }
  }

  return deepClone(_config);
}

/**
 * 注册配置变更监听器
 */
export function onEvaluationConfigChange(listener: ConfigChangeListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/**
 * 重置为默认配置（仅测试用）
 */
export function resetEvaluationConfig(): void {
  _config = deepClone(DEFAULT_CONFIG);
  _listeners.clear();
  log.debug('评估配置已重置为默认值');
}
