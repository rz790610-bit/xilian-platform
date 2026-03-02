/**
 * ============================================================================
 * 类型映射器 — Mappers v1
 * ============================================================================
 *
 * 将旧模块的枚举类型映射到统一契约类型。
 * 旧模块代码不直接修改（新增不修改原则），而是在边界处调用映射器。
 *
 * 命名约定：
 *   mapXxxSeverity()  — 将 Xxx 模块的 severity 映射到统一 SeverityLevel
 *   mapXxxUrgency()   — 将 Xxx 模块的 urgency 映射到统一 UrgencyLevel
 */

import type { SeverityLevel, UrgencyLevel } from './base';

// ============================================================================
// FIX-036: 批量 Date→epoch 工具
// ============================================================================

/**
 * 批量转换对象中所有 Date 字段为 epoch ms。
 * API 层返回 Drizzle 查询结果时调用，保证前端收到一致的 number 时间戳。
 * 返回类型与输入相同（Date 字段在运行时变为 number，但类型层保持兼容）。
 */
export function datesToEpoch<T>(obj: T): T {
  if (obj == null || typeof obj !== 'object') return obj;
  const result = { ...obj } as any;
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (val instanceof Date) {
      result[key] = val.getTime();
    }
  }
  return result as T;
}

// ============================================================================
// Severity 映射
// ============================================================================

/**
 * 算法层 SeverityLevel → 统一 SeverityLevel
 *
 * 来源: server/algorithms/_core/types.ts
 * 旧值域: 'normal' | 'attention' | 'warning' | 'critical'
 */
type AlgorithmSeverity = 'normal' | 'attention' | 'warning' | 'critical';

const ALGORITHM_SEVERITY_MAP: Record<AlgorithmSeverity, SeverityLevel> = {
  normal: 'info',
  attention: 'low',
  warning: 'medium',
  critical: 'critical',
};

export function mapAlgorithmSeverity(value: string): SeverityLevel {
  const mapped = ALGORITHM_SEVERITY_MAP[value as AlgorithmSeverity];
  if (!mapped) {
    throw new Error(
      `Unknown algorithm severity: "${value}". Expected: ${Object.keys(ALGORITHM_SEVERITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * 异常检测层 AnomalySeverity → 统一 SeverityLevel
 *
 * 来源: server/lib/dataflow/anomalyEngine.ts
 * 旧值域: 'low' | 'medium' | 'high' | 'critical'
 */
type AnomalySeverityOld = 'low' | 'medium' | 'high' | 'critical';

const ANOMALY_SEVERITY_MAP: Record<AnomalySeverityOld, SeverityLevel> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
};

export function mapAnomalySeverity(value: string): SeverityLevel {
  const mapped = ANOMALY_SEVERITY_MAP[value as AnomalySeverityOld];
  if (!mapped) {
    throw new Error(
      `Unknown anomaly severity: "${value}". Expected: ${Object.keys(ANOMALY_SEVERITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * 领域事件层 Severity → 统一 SeverityLevel
 *
 * 来源: server/platform/events/domain-models.ts
 * 旧值域: 'critical' | 'high' | 'medium' | 'low' | 'info'
 * 已完全对齐，映射为恒等转换
 */
type DomainSeverityOld = 'critical' | 'high' | 'medium' | 'low' | 'info';

const DOMAIN_SEVERITY_MAP: Record<DomainSeverityOld, SeverityLevel> = {
  info: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
};

export function mapDomainSeverity(value: string): SeverityLevel {
  const mapped = DOMAIN_SEVERITY_MAP[value as DomainSeverityOld];
  if (!mapped) {
    throw new Error(
      `Unknown domain severity: "${value}". Expected: ${Object.keys(DOMAIN_SEVERITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * 日志/告警层 severity → 统一 SeverityLevel
 *
 * 来源: drizzle/schema.ts eventLogs/alerts 表
 * 旧值域: 'info' | 'warning' | 'error' | 'critical'
 */
type LogSeverityOld = 'info' | 'warning' | 'error' | 'critical';

const LOG_SEVERITY_MAP: Record<LogSeverityOld, SeverityLevel> = {
  info: 'info',
  warning: 'medium',
  error: 'high',
  critical: 'critical',
};

export function mapLogSeverity(value: string): SeverityLevel {
  const mapped = LOG_SEVERITY_MAP[value as LogSeverityOld];
  if (!mapped) {
    throw new Error(
      `Unknown log severity: "${value}". Expected: ${Object.keys(LOG_SEVERITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * 进化层 severity → 统一 SeverityLevel
 *
 * 来源: drizzle/evolution-schema.ts
 * 旧值域1: 'info' | 'warn' | 'error' | 'critical' (审计日志)
 * 旧值域2: 'info' | 'warning' | 'critical' | 'fatal' (规则/告警)
 */
type EvolutionSeverityOld = 'info' | 'warn' | 'warning' | 'error' | 'critical' | 'fatal';

const EVOLUTION_SEVERITY_MAP: Record<EvolutionSeverityOld, SeverityLevel> = {
  info: 'info',
  warn: 'medium',
  warning: 'medium',
  error: 'high',
  critical: 'critical',
  fatal: 'critical',
};

export function mapEvolutionSeverity(value: string): SeverityLevel {
  const mapped = EVOLUTION_SEVERITY_MAP[value as EvolutionSeverityOld];
  if (!mapped) {
    throw new Error(
      `Unknown evolution severity: "${value}". Expected: ${Object.keys(EVOLUTION_SEVERITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * 通用 severity 映射 — 自动检测来源并映射
 *
 * 用于无法确定来源的场景。按以下优先级尝试：
 *   1. 统一值域 (info/low/medium/high/critical) → 直接返回
 *   2. 算法值域 (normal/attention/warning) → 映射
 *   3. 日志值域 (error) → 映射
 *   4. 进化值域 (warn/fatal) → 映射
 */
const AUTO_SEVERITY_MAP: Record<string, SeverityLevel> = {
  // 统一值域 (直接映射)
  info: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
  // 算法值域
  normal: 'info',
  attention: 'low',
  // 日志值域
  warning: 'medium',
  error: 'high',
  // 进化值域
  warn: 'medium',
  fatal: 'critical',
};

export function mapAnySeverity(value: string): SeverityLevel {
  const mapped = AUTO_SEVERITY_MAP[value.toLowerCase()];
  if (!mapped) {
    throw new Error(
      `Unknown severity value: "${value}". Cannot auto-detect source.`,
    );
  }
  return mapped;
}

// ============================================================================
// Urgency 映射
// ============================================================================

/**
 * 算法层 UrgencyLevel → 统一 UrgencyLevel
 *
 * 来源: server/algorithms/_core/types.ts
 * 旧值域: 'monitoring' | 'attention' | 'scheduled' | 'immediate'
 */
type AlgorithmUrgency = 'monitoring' | 'attention' | 'scheduled' | 'immediate';

const ALGORITHM_URGENCY_MAP: Record<AlgorithmUrgency, UrgencyLevel> = {
  monitoring: 'monitoring',
  attention: 'scheduled',
  scheduled: 'scheduled',
  immediate: 'immediate',
};

export function mapAlgorithmUrgency(value: string): UrgencyLevel {
  const mapped = ALGORITHM_URGENCY_MAP[value as AlgorithmUrgency];
  if (!mapped) {
    throw new Error(
      `Unknown algorithm urgency: "${value}". Expected: ${Object.keys(ALGORITHM_URGENCY_MAP).join(', ')}`,
    );
  }
  return mapped;
}

/**
 * AI 层 MaintenancePriority → 统一 UrgencyLevel
 *
 * 来源: server/platform/ai/ai.types.ts
 * 旧值域: 'immediate' | 'planned' | 'monitor' | 'defer'
 */
type AIPriority = 'immediate' | 'planned' | 'monitor' | 'defer';

const AI_PRIORITY_MAP: Record<AIPriority, UrgencyLevel> = {
  defer: 'monitoring',
  monitor: 'monitoring',
  planned: 'scheduled',
  immediate: 'immediate',
};

export function mapAIPriority(value: string): UrgencyLevel {
  const mapped = AI_PRIORITY_MAP[value as AIPriority];
  if (!mapped) {
    throw new Error(
      `Unknown AI priority: "${value}". Expected: ${Object.keys(AI_PRIORITY_MAP).join(', ')}`,
    );
  }
  return mapped;
}
