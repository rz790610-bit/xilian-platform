/**
 * ============================================================================
 * 感知层模块 — 统一导出
 * ============================================================================
 */

// 采集层
export { RingBuffer, MultiChannelRingBufferManager, type RingBufferConfig, type RingBufferStats, type SensorSample } from './collection/ring-buffer';
export { AdaptiveSamplingEngine, CRANE_SAMPLING_PROFILES, type SamplingProfile, type SamplingState, type FeatureVector } from './collection/adaptive-sampler';

// 融合层 — DS 引擎
export { DSFusionEngine, type BPA, type FusionResult, type EvidenceSourceConfig, type DiscernmentFrame, type EnhancedFusionResult } from './fusion/ds-fusion-engine';
export { UncertaintyQuantifier, type UncertaintyInput, type UncertaintyResult } from './fusion/uncertainty-quantifier';
export { EvidenceLearner, type EvidenceLearnerConfig, type EvidenceSourceProfile, type LearningResult } from './fusion/evidence-learner';

// 融合层 — BPA 构建器
export { BPABuilder, createBPABuilder, createDefaultCraneBpaConfig, type BPABuilderOptions } from './fusion/bpa-builder';
export {
  type SensorStats,
  type BasicProbabilityAssignment,
  type BpaConfig,
  type BpaRule,
  type BpaConstructionLog,
  type FuzzyFunctionType,
  type FuzzyFunctionParams,
  type TrapezoidalParams,
  type TriangularParams,
  type GaussianParams,
  toPerceptionBPA,
  toCognitionEvidence,
} from './fusion/bpa.types';

// 编码层
export { StateVectorEncoder, type UnifiedStateVector, type EncoderInput } from './encoding/state-vector-encoder';
export {
  StateVectorSynthesizer,
  createCraneSynthesizer,
  createDefaultCraneDimensions,
  type DimensionDef,
  type DimensionGroup,
  type AggregationMethod,
  type SynthesizedStateVector,
  type SynthesizerConfig,
  type SynthesisLogEntry,
} from './encoding/state-vector-synthesizer';

// 工况管理
export { ConditionProfileManager, BUILTIN_PROFILES, type ConditionProfile, type CognitionConfig, type ConditionInstance } from './condition/condition-profile-manager';

// 感知管线
export { PerceptionPipeline, type PerceptionPipelineConfig, type PipelineStats } from './perception-pipeline';
