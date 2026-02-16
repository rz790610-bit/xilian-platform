/**
 * Feature Flags — 外部服务启用/禁用控制
 * 
 * 用途：隔离未部署的外部服务（Airflow/Kafka Connect/Elasticsearch），
 * 防止启动时连接超时或运行时错误。
 * 
 * 配置方式：
 * - 环境变量（推荐）：FEATURE_AIRFLOW_ENABLED=true
 * - 默认值：全部 false（安全优先）
 * 
 * 影响范围：
 * - airflow: dataPipeline.service.ts, dataPipeline.router.ts, circuitBreakerIntegration.ts
 * - kafkaConnect: dataPipeline.service.ts, dataPipeline.router.ts
 * - elasticsearch: observability.service.ts, observability.router.ts, circuitBreakerIntegration.ts
 */

import { createModuleLogger } from './logger';

const log = createModuleLogger('featureFlags');

// ============================================================
// Feature Flag 定义
// ============================================================

export interface FeatureFlags {
  /** Apache Airflow DAG 编排引擎 */
  airflow: boolean;
  /** Kafka Connect 连接器管理 */
  kafkaConnect: boolean;
  /** Elasticsearch 日志/搜索引擎 */
  elasticsearch: boolean;
  /** Apache Flink 流处理引擎（预留） */
  flink: boolean;
}

// ============================================================
// 从环境变量读取
// ============================================================

function parseBool(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const featureFlags: FeatureFlags = {
  airflow: parseBool(process.env.FEATURE_AIRFLOW_ENABLED, false),
  kafkaConnect: parseBool(process.env.FEATURE_KAFKA_CONNECT_ENABLED, false),
  elasticsearch: parseBool(process.env.FEATURE_ELASTICSEARCH_ENABLED, false),
  flink: parseBool(process.env.FEATURE_FLINK_ENABLED, false),
};

// 启动时打印 feature flags 状态
log.info('Feature flags loaded:', {
  airflow: featureFlags.airflow,
  kafkaConnect: featureFlags.kafkaConnect,
  elasticsearch: featureFlags.elasticsearch,
  flink: featureFlags.flink,
});

// ============================================================
// 守卫函数 — 在路由/服务中使用
// ============================================================

/**
 * 检查功能是否启用，未启用时抛出友好错误
 */
export function requireFeature(feature: keyof FeatureFlags, featureLabel?: string): void {
  if (!featureFlags[feature]) {
    const label = featureLabel || feature;
    throw new Error(
      `[FeatureDisabled] ${label} 功能未启用。` +
      `请设置环境变量 FEATURE_${feature.replace(/([A-Z])/g, '_$1').toUpperCase()}_ENABLED=true 并确保对应服务已部署。`
    );
  }
}

/**
 * 创建一个条件导入函数 — 仅在功能启用时导入模块
 * 用于避免未部署服务的客户端在 import 时建立连接
 */
export function lazyImportIf<T>(
  feature: keyof FeatureFlags,
  importFn: () => Promise<T>
): () => Promise<T | null> {
  return async () => {
    if (!featureFlags[feature]) {
      return null;
    }
    return importFn();
  };
}

/**
 * 包装一个 async 函数，仅在功能启用时执行，否则返回降级值
 */
export function withFeatureGuard<T>(
  feature: keyof FeatureFlags,
  fn: () => Promise<T>,
  fallback: T
): () => Promise<T> {
  return async () => {
    if (!featureFlags[feature]) {
      return fallback;
    }
    return fn();
  };
}
