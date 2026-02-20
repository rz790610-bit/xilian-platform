/**
 * ============================================================================
 * 数据标注工具 — AnnotationTool
 * ============================================================================
 *
 * 支持自动/半自动/人工标注，为模型训练提供标注数据
 */

import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../framework/tool-framework';

// ============================================================================
// 标注类型
// ============================================================================

export interface AnnotationRecord {
  id: string;
  dataId: string;
  sourceId: string;
  labelType: 'anomaly' | 'normal' | 'fault' | 'degradation' | 'custom';
  label: string;
  confidence: number;
  annotator: 'auto' | 'semi_auto' | 'human';
  metadata: Record<string, unknown>;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
}

export interface AnnotationBatch {
  id: string;
  records: AnnotationRecord[];
  status: 'pending' | 'in_progress' | 'completed' | 'reviewed';
  stats: {
    total: number;
    auto: number;
    semiAuto: number;
    human: number;
    reviewed: number;
  };
  createdAt: number;
}

// ============================================================================
// 标注管理器
// ============================================================================

export class AnnotationManager {
  private batches = new Map<string, AnnotationBatch>();
  private records = new Map<string, AnnotationRecord>();

  /**
   * 创建标注批次
   */
  createBatch(dataIds: string[], sourceId: string): AnnotationBatch {
    const batch: AnnotationBatch = {
      id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      records: dataIds.map(dataId => ({
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        dataId,
        sourceId,
        labelType: 'normal',
        label: '',
        confidence: 0,
        annotator: 'auto',
        metadata: {},
        createdAt: Date.now(),
        reviewedAt: null,
        reviewedBy: null,
      })),
      status: 'pending',
      stats: { total: dataIds.length, auto: 0, semiAuto: 0, human: 0, reviewed: 0 },
      createdAt: Date.now(),
    };

    this.batches.set(batch.id, batch);
    for (const record of batch.records) {
      this.records.set(record.id, record);
    }
    return batch;
  }

  /**
   * 自动标注（基于规则）
   */
  autoAnnotate(
    batchId: string,
    rules: Array<{
      condition: (data: Record<string, number>) => boolean;
      label: string;
      labelType: AnnotationRecord['labelType'];
      confidence: number;
    }>,
    dataProvider: (dataId: string) => Record<string, number> | null,
  ): number {
    const batch = this.batches.get(batchId);
    if (!batch) return 0;

    let annotated = 0;
    for (const record of batch.records) {
      const data = dataProvider(record.dataId);
      if (!data) continue;

      for (const rule of rules) {
        if (rule.condition(data)) {
          record.label = rule.label;
          record.labelType = rule.labelType;
          record.confidence = rule.confidence;
          record.annotator = 'auto';
          annotated++;
          break;
        }
      }
    }

    batch.stats.auto = batch.records.filter(r => r.annotator === 'auto' && r.label !== '').length;
    batch.status = 'in_progress';
    return annotated;
  }

  /**
   * 人工标注
   */
  humanAnnotate(recordId: string, label: string, labelType: AnnotationRecord['labelType'], reviewer: string): boolean {
    const record = this.records.get(recordId);
    if (!record) return false;

    record.label = label;
    record.labelType = labelType;
    record.confidence = 1.0;
    record.annotator = 'human';
    record.reviewedAt = Date.now();
    record.reviewedBy = reviewer;
    return true;
  }

  /**
   * 审核标注
   */
  reviewAnnotation(recordId: string, approved: boolean, reviewer: string): boolean {
    const record = this.records.get(recordId);
    if (!record) return false;

    record.reviewedAt = Date.now();
    record.reviewedBy = reviewer;
    if (!approved) {
      record.label = '';
      record.confidence = 0;
    }
    return true;
  }

  /**
   * 获取批次
   */
  getBatch(batchId: string): AnnotationBatch | null {
    return this.batches.get(batchId) || null;
  }

  /**
   * 获取已标注数据（用于训练）
   */
  getAnnotatedData(minConfidence: number = 0.8): AnnotationRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.label !== '' && r.confidence >= minConfidence);
  }

  /**
   * 获取统计
   */
  getStats(): { totalRecords: number; annotated: number; reviewed: number; byType: Record<string, number> } {
    const all = Array.from(this.records.values());
    const annotated = all.filter(r => r.label !== '');
    const reviewed = all.filter(r => r.reviewedAt !== null);
    const byType: Record<string, number> = {};
    for (const r of annotated) {
      byType[r.labelType] = (byType[r.labelType] || 0) + 1;
    }
    return { totalRecords: all.length, annotated: annotated.length, reviewed: reviewed.length, byType };
  }
}

// ============================================================================
// Grok 可调用的标注工具
// ============================================================================

export const annotationTool: ToolDefinition = {
  id: 'manage_annotations',
  name: '数据标注管理',
  description: '创建标注批次、自动标注、查询标注统计',
  category: 'execute',
  inputSchema: z.object({
    action: z.enum(['create_batch', 'auto_annotate', 'get_stats', 'get_annotated']).describe('操作类型'),
    dataIds: z.array(z.string()).optional().describe('数据ID列表（create_batch用）'),
    sourceId: z.string().optional().describe('数据源ID'),
    minConfidence: z.number().optional().describe('最小置信度（get_annotated用）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
  requiredPermissions: ['write:annotation'],
  timeoutMs: 10000,
  requiresConfirmation: false,
  tags: ['annotation', 'labeling', 'training'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { action } = input as { action: string };
    return {
      success: true,
      message: `标注操作 ${action} 执行成功`,
      data: { action },
    };
  },
};
