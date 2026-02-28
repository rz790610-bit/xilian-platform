/**
 * ============================================================================
 * 诊断增强模块 — 公开导出
 * ============================================================================
 *
 * 模块入口文件，统一导出核心类、工具集和 Prompt 模板。
 *
 * 使用方式：
 *   import { getDiagnosticEnhancer } from '../ai/diagnostic-enhancer';
 *   import { DIAGNOSTIC_ENHANCER_TOOLS } from '../ai/diagnostic-enhancer';
 */

// ── 核心类与单例 ──────────────────────────────────────────
export {
  DiagnosticEnhancer,
  getDiagnosticEnhancer,
  resetDiagnosticEnhancer,
} from './diagnostic-enhancer';

// ── GrokTool 工具集 ──────────────────────────────────────
export { DIAGNOSTIC_ENHANCER_TOOLS } from './diagnostic-enhancer.tools';

// ── Prompt 模板 ──────────────────────────────────────────
export {
  DIAGNOSTIC_SYSTEM_PROMPT,
  ROOT_CAUSE_PROMPT,
  RECOMMENDATION_PROMPT,
  EVIDENCE_SYNTHESIS_PROMPT,
  EXPLAIN_PROMPT,
} from './diagnostic-enhancer.prompts';
