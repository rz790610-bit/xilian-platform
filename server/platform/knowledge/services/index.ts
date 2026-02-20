/**
 * 知识层服务统一导出
 */
export { KGQueryService } from './kg-query.service';
export type { TripleRecord, PathQueryResult, SimilarityResult, CausalChain } from './kg-query.service';

export { KGEvolutionService } from './kg-evolution.service';
export type { KnowledgeExtraction, KnowledgeConflict, KnowledgeQualityReport } from './kg-evolution.service';

export { CrystalService } from './crystal.service';
export type { CrystalRecord, CrystalApplication, CrystalMigration } from './crystal.service';

export { FeatureRegistryService } from './feature-registry.service';
export type { FeatureDefinition, FeatureLineage, DriftDetection } from './feature-registry.service';

export { ModelRegistryService } from './model-registry.service';
export type { ModelRecord, ModelComparison } from './model-registry.service';

export { ModelArtifactService } from './model-artifact.service';
export type { ArtifactMetadata, ArtifactUploadRequest, ArtifactDownloadResult, CleanupResult } from './model-artifact.service';

export { TransferLearningEngine } from './transfer-learning';
export type { TransferTask, TransferStrategy, AlignmentReport, TransferEvaluation } from './transfer-learning';
