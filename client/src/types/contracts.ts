/**
 * FIX-046: 前端契约类型 — 从 shared/contracts/v1 重导出
 *
 * 前端新代码应从此文件导入平台共享类型：
 *   import { SeverityLevel, UrgencyLevel, ConfidenceScore } from '@/types/contracts';
 *
 * 这些类型与后端完全一致，确保前后端契约同步。
 */

export type {
  SeverityLevel,
  UrgencyLevel,
  UnixTimestampMs,
  MachineId,
  ConfidenceScore,
  DiagnosisConclusion,
  EvidenceItem,
  DiagnosisRequest,
  DiagnosisContext,
  DiagnosisResult,
  Recommendation,
} from '@shared/contracts/v1';

export {
  SEVERITY_LEVELS,
  SEVERITY_WEIGHT,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  compareSeverity,
  URGENCY_LEVELS,
  URGENCY_WEIGHT,
  URGENCY_LABELS,
  toEpochMs,
  toISOString,
  normalizeDeviceId,
  requireMachineId,
  validateConfidence,
  mapAlgorithmSeverity,
  mapAnomalySeverity,
  mapAnySeverity,
} from '@shared/contracts/v1';
