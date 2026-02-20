/**
 * ============================================================================
 * 感知层模块 — 统一导出
 * ============================================================================
 */

// 采集层
export { RingBuffer, MultiChannelRingBufferManager, type RingBufferConfig, type RingBufferStats, type SensorSample } from './collection/ring-buffer';
export { AdaptiveSamplingEngine, CRANE_SAMPLING_PROFILES, type SamplingProfile, type SamplingState, type FeatureVector } from './collection/adaptive-sampler';

// 融合层
export { DSFusionEngine, type BPA, type FusionResult, type EvidenceSourceConfig, type DiscernmentFrame } from './fusion/ds-fusion-engine';
export { UncertaintyQuantifier, type UncertaintyInput, type UncertaintyResult } from './fusion/uncertainty-quantifier';

// 编码层
export { StateVectorEncoder, type UnifiedStateVector, type EncoderInput } from './encoding/state-vector-encoder';

// 工况管理
export { ConditionProfileManager, BUILTIN_PROFILES, type ConditionProfile, type CognitionConfig, type ConditionInstance } from './condition/condition-profile-manager';

// 感知管线
export { PerceptionPipeline, type PerceptionPipelineConfig, type PipelineStats } from './perception-pipeline';
