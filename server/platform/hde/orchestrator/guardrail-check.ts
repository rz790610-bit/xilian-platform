/**
 * ============================================================================
 * 护栏校验接口 — GuardrailCheck (FIX-092)
 * ============================================================================
 *
 * 定义诊断流程中护栏校验的输入/输出契约。
 * DiagnosticOrchestrator 在生成诊断结论后、输出前调用护栏校验。
 *
 * Phase 1: 接口定义 + 依赖注入桩 ✅
 * Phase 2: 集成 GuardrailEngine.evaluate() 完整评估
 */

import type { SeverityLevel, UrgencyLevel } from '../../../../shared/contracts/v1';

/**
 * 护栏校验结果
 */
export interface GuardrailCheckResult {
  /** 是否通过护栏校验 */
  passed: boolean;

  /** 触发的规则列表 */
  triggeredRules: TriggeredGuardrailRule[];

  /** 覆盖严重度（护栏可能升级诊断严重度） */
  overrideSeverity?: SeverityLevel;

  /** 覆盖紧急度（护栏可能升级紧急度） */
  overrideUrgency?: UrgencyLevel;

  /** 附加建议（护栏生成的额外建议） */
  additionalRecommendations?: string[];

  /** 校验耗时 (ms) */
  checkDurationMs: number;
}

/**
 * 触发的护栏规则
 */
export interface TriggeredGuardrailRule {
  /** 规则 ID */
  ruleId: string;

  /** 规则名称 */
  ruleName: string;

  /** 规则类别 */
  category: 'safety' | 'health' | 'efficiency';

  /** 触发原因描述 */
  reason: string;

  /** 要求的最低严重度 */
  requiredSeverity?: SeverityLevel;

  /** 要求的最低紧急度 */
  requiredUrgency?: UrgencyLevel;
}
