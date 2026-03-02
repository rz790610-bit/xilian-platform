/**
 * ============================================================================
 * P1-2: 标注审核服务 — Label Review Service
 * ============================================================================
 *
 * 职责:
 *   1. 置信度 → 标注状态映射: >=0.85 自动入库, 0.6~0.85 人工确认, <0.6 人工标注
 *   2. 审核状态机: auto_only → pending → approved/rejected
 *   3. 审核通过 → KGEvolutionService 反哺图谱
 *   4. dataSliceLabelHistory 审计记录
 *
 * 设计原则:
 *   - 纯逻辑，无外部 IO（DB/Neo4j 通过回调注入）
 *   - 与 AutoLabelingPipeline 解耦，接收 LabelResult 输出
 */

import { createModuleLogger } from '../../../core/logger';
import type { LabelResult, AutoLabel } from '../fsd/auto-labeling-pipeline';
import { KGEvolutionService } from '../../knowledge/services/kg-evolution.service';
import type { KnowledgeExtraction } from '../../knowledge/services/kg-evolution.service';

const log = createModuleLogger('label-review-service');

// ============================================================================
// 类型定义
// ============================================================================

/** 标注状态（dataSlices.labelStatus） */
export type LabelStatus = 'approved' | 'pending' | 'rejected' | 'auto_only' | 'manual_required';

/** 审核动作 */
export type ReviewAction = 'approve' | 'reject' | 'request_manual';

/** 标注状态转换结果 */
export interface LabelStatusResult {
  /** 新的标注状态 */
  labelStatus: LabelStatus;
  /** 是否需要人工审核 */
  needsHumanReview: boolean;
  /** 是否自动入库 */
  autoAccepted: boolean;
  /** 标注来源 */
  labelSource: LabelResult['labelSource'];
  /** 置信度 */
  confidence: number;
}

/** 审核记录（写入 dataSliceLabelHistory） */
export interface AuditRecord {
  sliceId: string;
  dimensionCode: string;
  oldValue: string | null;
  newValue: string;
  oldSource: string | null;
  newSource: string;
  changedBy: string;
  changedAt: Date;
  reason: string;
  faultClass: string | null;
  confidence: string;
  labelSource: string;
  reviewStatus: string;
  reviewerId: number | null;
  labelData: Record<string, unknown>;
}

/** 审核请求 */
export interface ReviewRequest {
  sliceId: string;
  labelResultId: number;
  action: ReviewAction;
  reviewerId: number;
  reason: string;
  correctedLabel?: Partial<AutoLabel>;
}

/** KG 反馈结果 */
export interface KGFeedbackResult {
  success: boolean;
  extractionId: string | null;
  tripleCount: number;
  caseNodeCreated: boolean;
  validatesRelCreated: boolean;
}

// ============================================================================
// 置信度阈值配置
// ============================================================================

export interface ReviewConfig {
  /** 自动入库阈值 (>=) */
  autoApproveThreshold: number;
  /** 人工确认阈值 (>=, < autoApprove) */
  pendingThreshold: number;
}

const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  autoApproveThreshold: 0.85,
  pendingThreshold: 0.6,
};

// ============================================================================
// 标注审核服务
// ============================================================================

export class LabelReviewService {
  private config: ReviewConfig;
  private kgService: KGEvolutionService;

  constructor(config?: Partial<ReviewConfig>, kgService?: KGEvolutionService) {
    this.config = { ...DEFAULT_REVIEW_CONFIG, ...config };
    this.kgService = kgService || new KGEvolutionService();
  }

  // ==========================================================================
  // 1. 置信度 → 标注状态映射
  // ==========================================================================

  /**
   * 根据标注结果确定标注状态
   *
   * 规则:
   *   - confidence >= 0.85 → 'approved' (自动入库)
   *   - 0.6 <= confidence < 0.85 → 'pending' (待人工确认)
   *   - confidence < 0.6 → 'manual_required' (需人工标注)
   */
  determineLabelStatus(labelResult: LabelResult): LabelStatusResult {
    const { confidence, labelSource, needsHumanReview, isUncertain } = labelResult;

    let labelStatus: LabelStatus;
    let autoAccepted = false;

    if (confidence >= this.config.autoApproveThreshold && !isUncertain) {
      labelStatus = 'approved';
      autoAccepted = true;
    } else if (confidence >= this.config.pendingThreshold) {
      labelStatus = 'pending';
    } else {
      labelStatus = 'manual_required';
    }

    log.info({
      interventionId: labelResult.interventionId,
      confidence,
      labelStatus,
      autoAccepted,
      labelSource,
    }, 'Label status determined');

    return {
      labelStatus,
      needsHumanReview: labelStatus !== 'approved',
      autoAccepted,
      labelSource,
      confidence,
    };
  }

  // ==========================================================================
  // 2. 审核状态机: pending → approved/rejected
  // ==========================================================================

  /**
   * 验证状态转换是否合法
   *
   * 状态机:
   *   auto_only → pending (需审核时)
   *   pending → approved | rejected
   *   manual_required → pending → approved | rejected
   *   approved → (终态)
   *   rejected → pending (可重新审核)
   */
  validateTransition(currentStatus: LabelStatus, action: ReviewAction): {
    valid: boolean;
    newStatus: LabelStatus;
    reason: string;
  } {
    const transitions: Record<string, Record<ReviewAction, LabelStatus | null>> = {
      auto_only: { approve: 'approved', reject: 'rejected', request_manual: 'pending' },
      pending: { approve: 'approved', reject: 'rejected', request_manual: null },
      manual_required: { approve: null, reject: null, request_manual: 'pending' },
      approved: { approve: null, reject: null, request_manual: null },
      rejected: { approve: null, reject: null, request_manual: 'pending' },
    };

    const newStatus = transitions[currentStatus]?.[action];

    if (newStatus === null || newStatus === undefined) {
      return {
        valid: false,
        newStatus: currentStatus,
        reason: `状态 '${currentStatus}' 不允许执行 '${action}' 操作`,
      };
    }

    return {
      valid: true,
      newStatus,
      reason: `${currentStatus} → ${newStatus} (${action})`,
    };
  }

  /**
   * 执行审核动作
   */
  executeReview(
    currentStatus: LabelStatus,
    request: ReviewRequest,
    currentLabel: AutoLabel | null,
  ): {
    newStatus: LabelStatus;
    auditRecord: AuditRecord;
    kgFeedback: KGFeedbackResult | null;
  } {
    const transition = this.validateTransition(currentStatus, request.action);
    if (!transition.valid) {
      throw new Error(transition.reason);
    }

    const newStatus = transition.newStatus;
    const effectiveLabel = request.correctedLabel
      ? { ...currentLabel, ...request.correctedLabel } as AutoLabel
      : currentLabel;

    // 构建审计记录
    const auditRecord = this.buildAuditRecord(
      request,
      currentStatus,
      newStatus,
      currentLabel,
      effectiveLabel,
    );

    // 审核通过 → KG 反馈
    let kgFeedback: KGFeedbackResult | null = null;
    if (newStatus === 'approved' && effectiveLabel) {
      kgFeedback = this.feedbackToKG(request.sliceId, effectiveLabel);
    }

    log.info({
      sliceId: request.sliceId,
      action: request.action,
      oldStatus: currentStatus,
      newStatus,
      reviewerId: request.reviewerId,
      kgFeedback: kgFeedback?.success,
    }, 'Review executed');

    return { newStatus, auditRecord, kgFeedback };
  }

  // ==========================================================================
  // 3. KG 反馈 — 审核通过后写入知识图谱
  // ==========================================================================

  /**
   * 将审核通过的标注反馈到知识图谱
   *
   * 生成:
   *   - Case 节点 (对应标注的故障案例)
   *   - VALIDATES 关系 (案例验证了某个故障模式)
   */
  feedbackToKG(sliceId: string, label: AutoLabel): KGFeedbackResult {
    try {
      const extraction = this.kgService.extractFromDiagnosis({
        machineId: sliceId,
        dimensions: [{
          dimension: label.severity,
          score: 1.0,
          findings: [label.rootCause],
          recommendations: [label.suggestedFix],
        }],
        overallScore: 1.0,
      });

      const tripleCount = extraction.extractedTriples.length;

      // Case 节点和 VALIDATES 关系通过 extractedTriples 中的三元组表示
      const hasCaseTriple = extraction.extractedTriples.some(
        t => t.predicate === 'diagnosed_with',
      );
      const hasValidatesTriple = extraction.extractedTriples.some(
        t => t.predicate === 'resolved_by',
      );

      log.info({
        sliceId,
        extractionId: extraction.id,
        tripleCount,
        hasCaseTriple,
        hasValidatesTriple,
      }, 'KG feedback completed');

      return {
        success: true,
        extractionId: extraction.id,
        tripleCount,
        caseNodeCreated: hasCaseTriple,
        validatesRelCreated: hasValidatesTriple,
      };
    } catch (err) {
      log.error({ sliceId, error: err }, 'KG feedback failed');
      return {
        success: false,
        extractionId: null,
        tripleCount: 0,
        caseNodeCreated: false,
        validatesRelCreated: false,
      };
    }
  }

  // ==========================================================================
  // 4. 审计记录
  // ==========================================================================

  /**
   * 构建 dataSliceLabelHistory 审计记录
   */
  buildAuditRecord(
    request: ReviewRequest,
    oldStatus: LabelStatus,
    newStatus: LabelStatus,
    oldLabel: AutoLabel | null,
    newLabel: AutoLabel | null,
  ): AuditRecord {
    return {
      sliceId: request.sliceId,
      dimensionCode: newLabel?.rootCause ? 'root_cause' : 'general',
      oldValue: oldLabel?.rootCause ?? null,
      newValue: newLabel?.rootCause ?? '未标注',
      oldSource: oldStatus,
      newSource: newStatus,
      changedBy: `reviewer_${request.reviewerId}`,
      changedAt: new Date(),
      reason: request.reason,
      faultClass: newLabel?.severity ?? null,
      confidence: String(request.action === 'approve' ? 1.0 : 0),
      labelSource: request.action === 'approve' ? 'manual_verified' : 'manual_rejected',
      reviewStatus: newStatus,
      reviewerId: request.reviewerId,
      labelData: {
        label: newLabel,
        action: request.action,
        corrected: !!request.correctedLabel,
      },
    };
  }

  // ==========================================================================
  // 配置
  // ==========================================================================

  getConfig(): Readonly<ReviewConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ReviewConfig>): void {
    Object.assign(this.config, updates);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

let instance: LabelReviewService | null = null;

export function getLabelReviewService(config?: Partial<ReviewConfig>): LabelReviewService {
  if (!instance) {
    instance = new LabelReviewService(config);
  }
  return instance;
}

export function resetLabelReviewService(): void {
  instance = null;
}
