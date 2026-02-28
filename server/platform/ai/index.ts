/**
 * ============================================================================
 * AI 模块总导出 — 大模型价值发挥体系
 * ============================================================================
 *
 * 4 个 AI 模块将大模型能力转化为港机运维的实际业务价值：
 *
 *   1. 诊断增强引擎 (DiagnosticEnhancer)
 *      — 原始算法输出 + 传感器特征 + KG 上下文 → 专家级诊断报告
 *
 *   2. 自然语言交互层 (NLInterface)
 *      — 运维人员中文自然语言 → 结构化 API 调用 → 自然语言回答
 *
 *   3. 技术情报系统 (TechIntelligence)
 *      — 持续监测外部技术源，差距分析，改进建议
 *
 *   4. 进化实验室 (EvolutionLab)
 *      — 洞察 → 假设 → 实验设计 → 影子验证 → 人工审核 → 部署
 *
 * 模块联动：
 *   模块3 ──发现新技术──→ 模块4 ──实验成功──→ 知识结晶
 *   模块2 ←──运维人员查询──→ 模块1 (诊断增强)
 *
 * 使用方式：
 *   import { getDiagnosticEnhancer, getNLInterface } from '../platform/ai';
 */

// ============================================================================
// 共享基础
// ============================================================================
export * from './ai.types';
export * from './ai.config';
export * from './ai.topics';

// ============================================================================
// 模块 1：诊断增强引擎
// ============================================================================
export {
  DiagnosticEnhancer,
  getDiagnosticEnhancer,
  resetDiagnosticEnhancer,
  DIAGNOSTIC_ENHANCER_TOOLS,
} from './diagnostic-enhancer';

// ============================================================================
// 模块 2：自然语言交互层
// ============================================================================
export {
  NLInterface,
  getNLInterface,
  resetNLInterface,
  NLIntentRouter,
  NL_INTERFACE_TOOLS,
} from './nl-interface';

// ============================================================================
// 模块 3：技术情报系统
// ============================================================================
export {
  TechIntelligence,
  getTechIntelligence,
  resetTechIntelligence,
  TechSourceScanner,
  TechGapAnalyzer,
} from './tech-intelligence';

// ============================================================================
// 模块 4：进化实验室
// ============================================================================
export {
  EvolutionLab,
  getEvolutionLab,
  resetEvolutionLab,
  ExperimentDesigner,
  InsightCollector,
} from './evolution-lab';
