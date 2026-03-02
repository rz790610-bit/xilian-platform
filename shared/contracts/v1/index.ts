/**
 * ============================================================================
 * 统一契约类型 — Contracts v1 入口
 * ============================================================================
 *
 * 所有新代码应从此文件导入平台共享类型：
 *
 *   import { SeverityLevel, DiagnosisConclusion, toEpochMs } from '@/shared/contracts/v1';
 *
 * 禁止直接从各子模块导入（防止路径依赖）。
 */

// === 基础类型 ===
export {
  // Severity
  SEVERITY_LEVELS,
  type SeverityLevel,
  SEVERITY_WEIGHT,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  compareSeverity,

  // Urgency
  URGENCY_LEVELS,
  type UrgencyLevel,
  URGENCY_WEIGHT,
  URGENCY_LABELS,

  // Timestamp
  type UnixTimestampMs,
  toEpochMs,
  toISOString,

  // Device ID
  type MachineId,
  normalizeDeviceId,
  requireMachineId,

  // Confidence
  type ConfidenceScore,
  validateConfidence,
} from './base';

// === 诊断契约 ===
export {
  type DiagnosisConclusion,
  type EvidenceItem,
  type DiagnosisRequest,
  type DiagnosisContext,
  type DiagnosisResult,
  type Recommendation,
} from './diagnosis.contract';

// === 映射器 ===
export {
  mapAlgorithmSeverity,
  mapAnomalySeverity,
  mapDomainSeverity,
  mapLogSeverity,
  mapEvolutionSeverity,
  mapAnySeverity,
  mapAlgorithmUrgency,
  mapAIPriority,
  datesToEpoch,
} from './mappers';
