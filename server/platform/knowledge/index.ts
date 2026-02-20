// 知识层 — 统一导出
export * from './graph';
export * from './feature-registry';
export * from './reasoning';
// 命名空间导出，避免与 feature-registry 的 FeatureDefinition 冲突
export * as knowledgeServices from './services';
