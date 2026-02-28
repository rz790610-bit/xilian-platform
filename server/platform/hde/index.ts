/**
 * ============================================================================
 * HDE — 双轨演化诊断系统 (Hybrid Dual-track Evolution)
 * ============================================================================
 *
 * Phase 0a/0b 骨架入口
 *
 * 模块结构：
 *   - fusion/           统一 DS 融合引擎
 *   - crystallization/  统一知识结晶器
 *   - orchestrator/     诊断编排器
 *   - comparator/       跨设备奇点对比 (Phase 0b)
 *   - types/            类型定义
 *
 * 使用方式：
 *   import { DiagnosticOrchestrator, CrossDeviceComparator } from '@/server/platform/hde';
 */

// ============================================================================
// 诊断编排器
// ============================================================================

export {
  DiagnosticOrchestrator,
  createDiagnosticOrchestrator,
  createDefaultOrchestrator,
  createPhysicsFirstOrchestrator,
  createDataDrivenOrchestrator,
  type DiagnosticOrchestratorConfig,
} from './orchestrator';

// ============================================================================
// DS 融合引擎
// ============================================================================

export {
  DSFusionEngine,
  DSEvidenceLegacyAdapter,
  PerceptionDSFusionEngine,
  createDSFusionEngine,
  createLegacyDSEvidence,
  HDE_DEFAULT_FUSION_CONFIG,
  type HDEFusionConfig,
  type BPA,
  type FusionResult,
  type EnhancedFusionResult,
} from './fusion';

// ============================================================================
// 知识结晶器
// ============================================================================

export {
  UnifiedKnowledgeCrystallizer,
  DiagnosisHistoryStrategy,
  CognitionResultStrategy,
  createUnifiedCrystallizer,
  type UnifiedKnowledgeCrystal,
  type UnifiedCrystalType,
  type CrystallizationStrategy,
  type DiagnosisHistoryEntry,
} from './crystallization';

// ============================================================================
// 跨设备奇点对比 (Phase 0b)
// ============================================================================

export {
  CrossDeviceComparator,
  createCrossDeviceComparator,
  crossDeviceComparator,
  type DeviceMetricData,
  type CrossDeviceCompareRequest,
  type CrossDeviceCompareResult,
  type DeviceRanking,
  type CrossDeviceSingularity,
  type FleetStatistics,
  type PeerComparison,
} from './comparator';

// ============================================================================
// 类型定义
// ============================================================================

export type {
  // 诊断请求/响应
  HDEDiagnosisRequest,
  HDEDiagnosisResult,
  HDEDiagnosisConfig,
  DiagnosisContext,
  DiagnosisConclusion,

  // 双轨诊断
  DiagnosticTrack,
  TrackResult,
  FaultHypothesis,

  // 物理约束
  PhysicsConstraint,
  ValidationResult,

  // 建议
  Recommendation,
  EvidenceItem,

  // DS 融合
  DSConflictStrategy,
  DSEvidenceSourceConfig,
  DSFusionEngineConfig,
  DSEvidenceInput,
  DSFusionOutput,
  DSFusionLogEntry,

  // 知识结晶
  KnowledgeCrystal,
  KnowledgeCrystalType,
  CognitionResult,
} from './types';

// ============================================================================
// 版本信息
// ============================================================================

export const HDE_VERSION = '0.2.0-phase0b';
export const HDE_PHASE = '0b';
