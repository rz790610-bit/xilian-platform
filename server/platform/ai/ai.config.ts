/**
 * ============================================================================
 * AI 模块统一配置
 * ============================================================================
 *
 * 4 个 AI 模块的可调参数集中管理。
 * 遵循 evolution.config.ts 的配置模式。
 */

import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('ai-config');

// ============================================================================
// 配置类型
// ============================================================================

/** 诊断增强配置 */
export interface DiagnosticEnhancerConfig {
  /** 最大证据链长度 */
  maxEvidenceChainLength: number;
  /** KG 因果链最大遍历深度 */
  maxCausalChainDepth: number;
  /** 最低证据置信度阈值 */
  minEvidenceConfidence: number;
  /** ReAct 最大步数 */
  maxReasoningSteps: number;
  /** LLM 模型（增强推理用） */
  model: string;
  /** 快速推理超时(ms) */
  quickTimeoutMs: number;
  /** 深度推理超时(ms) */
  deepTimeoutMs: number;
  /** 批量增强并发数 */
  batchConcurrency: number;
}

/** NL 接口配置 */
export interface NLInterfaceConfig {
  /** 意图分类模型 */
  intentModel: string;
  /** 响应格式化模型 */
  responseModel: string;
  /** 意图分类置信度阈值 */
  intentConfidenceThreshold: number;
  /** 多轮对话最大历史长度 */
  maxConversationHistory: number;
  /** 建议最大数量 */
  maxSuggestions: number;
  /** 查询超时(ms) */
  queryTimeoutMs: number;
  /** 是否启用流式输出 */
  enableStreaming: boolean;
}

/** 技术情报配置 */
export interface TechIntelligenceConfig {
  /** 扫描周期(小时) */
  scanIntervalHours: number;
  /** 相关性阈值 (0-1) */
  relevanceThreshold: number;
  /** 每次扫描最大文档数 */
  maxDocumentsPerScan: number;
  /** 差距分析模型 */
  analysisModel: string;
  /** 实现草案最大 token */
  sketchMaxTokens: number;
  /** 是否自动推送到进化实验室 */
  autoPushToLab: boolean;
}

/** 进化实验室配置 */
export interface EvolutionLabConfig {
  /** 实验周期(小时) */
  cycleIntervalHours: number;
  /** 最大并行实验数 */
  maxParallelExperiments: number;
  /** 影子验证最小数据量 */
  minShadowDataPoints: number;
  /** 自动批准阈值（改善 > X% 时自动批准） */
  autoApproveThreshold: number;
  /** 是否需要人工审核 */
  requireHumanReview: boolean;
  /** 部署回滚性能下降阈值(%) */
  rollbackThresholdPercent: number;
  /** 洞察优先级排序模型 */
  prioritizationModel: string;
}

/** AI 模块总配置 */
export interface AIModuleConfig {
  diagnostic: DiagnosticEnhancerConfig;
  nl: NLInterfaceConfig;
  intelligence: TechIntelligenceConfig;
  lab: EvolutionLabConfig;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_AI_CONFIG: AIModuleConfig = {
  diagnostic: {
    maxEvidenceChainLength: 20,
    maxCausalChainDepth: 5,
    minEvidenceConfidence: 0.3,
    maxReasoningSteps: 8,
    model: 'grok-3',
    quickTimeoutMs: 10_000,
    deepTimeoutMs: 60_000,
    batchConcurrency: 3,
  },
  nl: {
    intentModel: 'grok-3-fast',
    responseModel: 'grok-3',
    intentConfidenceThreshold: 0.6,
    maxConversationHistory: 10,
    maxSuggestions: 5,
    queryTimeoutMs: 30_000,
    enableStreaming: true,
  },
  intelligence: {
    scanIntervalHours: 168,
    relevanceThreshold: 0.5,
    maxDocumentsPerScan: 50,
    analysisModel: 'grok-3',
    sketchMaxTokens: 2000,
    autoPushToLab: true,
  },
  lab: {
    cycleIntervalHours: 24,
    maxParallelExperiments: 3,
    minShadowDataPoints: 500,
    autoApproveThreshold: 10,
    requireHumanReview: true,
    rollbackThresholdPercent: 5,
    prioritizationModel: 'grok-3',
  },
};

// ============================================================================
// 配置管理（单例）
// ============================================================================

let currentConfig: AIModuleConfig = structuredClone(DEFAULT_AI_CONFIG);
const configChangeListeners: Array<(config: AIModuleConfig) => void> = [];

/** 获取当前 AI 配置 */
export function getAIConfig(): Readonly<AIModuleConfig> {
  return currentConfig;
}

/** 更新 AI 配置（深度合并） */
export function updateAIConfig(patch: Partial<AIModuleConfig>): void {
  if (patch.diagnostic) {
    currentConfig.diagnostic = { ...currentConfig.diagnostic, ...patch.diagnostic };
  }
  if (patch.nl) {
    currentConfig.nl = { ...currentConfig.nl, ...patch.nl };
  }
  if (patch.intelligence) {
    currentConfig.intelligence = { ...currentConfig.intelligence, ...patch.intelligence };
  }
  if (patch.lab) {
    currentConfig.lab = { ...currentConfig.lab, ...patch.lab };
  }
  log.info({ updated: Object.keys(patch) }, 'AI 配置已更新');
  configChangeListeners.forEach(fn => fn(currentConfig));
}

/** 监听配置变化 */
export function onAIConfigChange(listener: (config: AIModuleConfig) => void): () => void {
  configChangeListeners.push(listener);
  return () => {
    const idx = configChangeListeners.indexOf(listener);
    if (idx >= 0) configChangeListeners.splice(idx, 1);
  };
}

/** 重置为默认配置 */
export function resetAIConfig(): void {
  currentConfig = structuredClone(DEFAULT_AI_CONFIG);
  log.info('AI 配置已重置为默认值');
  configChangeListeners.forEach(fn => fn(currentConfig));
}

/** 获取配置快照 */
export function getAIConfigSnapshot(): AIModuleConfig {
  return structuredClone(currentConfig);
}
