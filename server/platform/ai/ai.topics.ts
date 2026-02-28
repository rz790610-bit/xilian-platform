/**
 * ============================================================================
 * AI 模块 EventBus 主题常量
 * ============================================================================
 *
 * 命名规范：ai.{module}.{event}
 * 所有 AI 模块的事件主题统一在此定义，避免硬编码字符串。
 */

// ============================================================================
// 诊断增强引擎 (Diagnostic Enhancer)
// ============================================================================
export const AI_DIAGNOSIS_TOPICS = {
  /** 诊断增强完成 */
  ENHANCED: 'ai.diagnosis.enhanced',
  /** 根因分析完成 */
  ROOT_CAUSE: 'ai.diagnosis.rootCause',
  /** 维护建议生成 */
  RECOMMENDATIONS: 'ai.diagnosis.recommendations',
  /** 批量增强完成 */
  BATCH_COMPLETED: 'ai.diagnosis.batchCompleted',
} as const;

// ============================================================================
// 自然语言交互层 (NL Interface)
// ============================================================================
export const AI_NL_TOPICS = {
  /** 查询处理完成 */
  QUERY_COMPLETED: 'ai.nl.queryCompleted',
  /** 意图分类完成 */
  INTENT_CLASSIFIED: 'ai.nl.intentClassified',
  /** 多轮对话更新 */
  CONVERSATION_UPDATED: 'ai.nl.conversationUpdated',
} as const;

// ============================================================================
// 技术情报系统 (Tech Intelligence)
// ============================================================================
export const AI_INTELLIGENCE_TOPICS = {
  /** 扫描周期完成 */
  SCAN_COMPLETED: 'ai.intelligence.scanCompleted',
  /** 发现新技术差距 */
  GAP_DISCOVERED: 'ai.intelligence.gapDiscovered',
  /** 算法候选推荐 */
  ALGORITHM_SUGGESTED: 'ai.intelligence.algorithmSuggested',
  /** 差距报告生成 */
  GAP_REPORT_GENERATED: 'ai.intelligence.gapReportGenerated',
} as const;

// ============================================================================
// 进化实验室 (Evolution Lab)
// ============================================================================
export const AI_LAB_TOPICS = {
  /** 洞察提交 */
  INSIGHT_SUBMITTED: 'ai.lab.insightSubmitted',
  /** 实验设计完成 */
  EXPERIMENT_DESIGNED: 'ai.lab.experimentDesigned',
  /** 影子验证完成 */
  SHADOW_VALIDATED: 'ai.lab.shadowValidated',
  /** 提交审核 */
  REVIEW_REQUESTED: 'ai.lab.reviewRequested',
  /** 实验部署完成 */
  EXPERIMENT_DEPLOYED: 'ai.lab.experimentDeployed',
  /** 实验周期完成 */
  CYCLE_COMPLETED: 'ai.lab.cycleCompleted',
} as const;

/** 所有 AI 主题的联合 */
export const AI_TOPICS = {
  diagnosis: AI_DIAGNOSIS_TOPICS,
  nl: AI_NL_TOPICS,
  intelligence: AI_INTELLIGENCE_TOPICS,
  lab: AI_LAB_TOPICS,
} as const;
