/**
 * ============================================================================
 * 进化引擎统一配置 — evolution.config.ts
 * ============================================================================
 *
 * 消除 Grok / WorldModel / Carbon 等模块的硬编码配置，
 * 提供统一的配置入口 + 热更新能力。
 *
 * 使用方式：
 *   import { evolutionConfig, onConfigChange } from './evolution.config';
 *   const model = evolutionConfig.grok.model;
 *   onConfigChange((cfg) => { ... });
 *
 * 热更新触发方式：
 *   updateEvolutionConfig({ grok: { temperature: 0.5 } });
 *
 * 架构位置: server/platform/evolution/
 */

import { createModuleLogger } from '../../core/logger';
import { eventBus } from '../../services/eventBus.service';
import { EVOLUTION_TOPICS } from '../../../shared/evolution-topics';

const log = createModuleLogger('evolution-config');

// ============================================================================
// 配置类型定义
// ============================================================================

/** Grok 推理配置 */
export interface GrokConfig {
  /** 模型标识 */
  model: string;
  /** 最大推理步数 */
  maxSteps: number;
  /** 温度参数 */
  temperature: number;
  /** 推理超时 (ms) */
  timeoutMs: number;
  /** 最大 token 数（LLM 结构化输出） */
  maxTokens: number;
  /** 最大 token 数（代码生成） */
  maxTokensCodeGen: number;
  /** 最大 token 数（标签生成） */
  maxTokensLabeling: number;
}

/** WorldModel 引擎配置 */
export interface WorldModelConfig {
  /** ONNX 模型文件路径 */
  modelPath: string;
  /** 执行提供者 */
  executionProvider: 'cpu' | 'cuda' | 'coreml';
  /** 图优化级别 */
  graphOptimizationLevel: 'disabled' | 'basic' | 'extended' | 'all';
  /** 推理超时 (ms) */
  inferenceTimeoutMs: number;
  /** 最大并发推理数 */
  maxConcurrentInferences: number;
  /** 降级到物理模型 */
  fallbackToPhysics: boolean;
}

/** 碳感知配置 */
export interface CarbonAwareConfig {
  /** 是否启用碳感知调度 */
  enabled: boolean;
  /** WattTime API 用户名 */
  username: string;
  /** WattTime API 密码 */
  password: string;
  /** WattTime API 基础 URL */
  apiBaseUrl: string;
  /** 预测窗口（小时） */
  forecastHorizonHours: number;
  /** 碳强度阈值 (gCO2/kWh)，低于此值才调度训练 */
  carbonThreshold: number;
  /** 缓存 TTL (ms) */
  cacheTtlMs: number;
}

/** MetaLearner 配置 */
export interface MetaLearnerExtConfig {
  /** 默认策略插件 ID */
  defaultStrategy: string;
  /** 是否启用 LLM 假设生成 */
  enableLLMHypothesis: boolean;
  /** 探索率 */
  explorationRate: number;
}

/** 进化引擎完整配置 */
export interface EvolutionEngineConfig {
  grok: GrokConfig;
  worldModel: WorldModelConfig;
  carbonAware: CarbonAwareConfig;
  metaLearner: MetaLearnerExtConfig;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: EvolutionEngineConfig = {
  grok: {
    model: 'grok-2-1212',
    maxSteps: 5,
    temperature: 0.3,
    timeoutMs: 30000,
    maxTokens: 1500,
    maxTokensCodeGen: 2000,
    maxTokensLabeling: 800,
  },
  worldModel: {
    modelPath: 'server/platform/evolution/models/world-model-lstm.onnx',
    executionProvider: 'cpu',
    graphOptimizationLevel: 'all',
    inferenceTimeoutMs: 5000,
    maxConcurrentInferences: 4,
    fallbackToPhysics: true,
  },
  carbonAware: {
    enabled: !!(process.env.WATTTIME_USERNAME && process.env.WATTTIME_PASSWORD),
    username: process.env.WATTTIME_USERNAME || '',
    password: process.env.WATTTIME_PASSWORD || '',
    apiBaseUrl: 'https://api.watttime.org/v3',
    forecastHorizonHours: 48,
    carbonThreshold: 350,
    cacheTtlMs: 15 * 60 * 1000, // 15 分钟
  },
  metaLearner: {
    defaultStrategy: 'meta-learner.bayesian',
    enableLLMHypothesis: true,
    explorationRate: 0.2,
  },
};

// ============================================================================
// 配置管理器
// ============================================================================

type ConfigChangeListener = (config: EvolutionEngineConfig) => void;

/** 当前活跃配置（深拷贝隔离） */
let _config: EvolutionEngineConfig = deepClone(DEFAULT_CONFIG);

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
 * 获取当前进化引擎配置（只读副本）
 */
export const evolutionConfig: Readonly<EvolutionEngineConfig> = new Proxy(
  {} as EvolutionEngineConfig,
  {
    get(_target, prop: string) {
      return (_config as unknown as Record<string, unknown>)[prop];
    },
    set() {
      throw new Error('evolutionConfig 是只读的，请使用 updateEvolutionConfig() 更新');
    },
  },
);

/**
 * 更新进化引擎配置（热更新）
 *
 * @param updates 部分配置更新
 * @returns 更新后的完整配置
 */
export async function updateEvolutionConfig(
  updates: DeepPartial<EvolutionEngineConfig>,
): Promise<EvolutionEngineConfig> {
  const oldConfig = deepClone(_config);
  _config = deepMerge(
    _config as unknown as Record<string, unknown>,
    updates as unknown as Record<string, unknown>,
  ) as unknown as EvolutionEngineConfig;

  log.info('进化引擎配置热更新', {
    updatedKeys: Object.keys(updates),
  });

  // 通知所有监听器
  for (const listener of _listeners) {
    try {
      listener(deepClone(_config));
    } catch (err) {
      log.warn('配置变更监听器执行失败', { error: String(err) });
    }
  }

  // 发布配置变更事件
  try {
    await eventBus.publish(
      EVOLUTION_TOPICS.CONFIG_UPDATED,
      'evolution_config_updated',
      {
        updatedKeys: Object.keys(updates),
        timestamp: Date.now(),
      },
      { source: 'evolution-config', severity: 'info' },
    );
  } catch {
    // EventBus 未初始化时忽略
  }

  return deepClone(_config);
}

/**
 * 注册配置变更监听器
 *
 * @param listener 监听回调
 * @returns 取消注册函数
 */
export function onConfigChange(listener: ConfigChangeListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/**
 * 重置为默认配置（仅测试用）
 */
export function resetEvolutionConfig(): void {
  _config = deepClone(DEFAULT_CONFIG);
  log.debug('进化引擎配置已重置为默认值');
}

/**
 * 获取当前配置的深拷贝快照
 */
export function getConfigSnapshot(): EvolutionEngineConfig {
  return deepClone(_config);
}

// ============================================================================
// 工具类型
// ============================================================================

/** 递归 Partial */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
