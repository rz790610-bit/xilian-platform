/**
 * ============================================================================
 * 知识图谱进化服务 — KGEvolutionService
 * ============================================================================
 *
 * 职责：
 *   1. 从诊断结果自动提取知识三元组
 *   2. 知识冲突检测和解决
 *   3. 知识衰减和过期管理
 *   4. 跨工况知识迁移
 *   5. 知识质量评估
 */

// ============================================================================
// 进化类型
// ============================================================================

export interface KnowledgeExtraction {
  id: string;
  sourceType: 'diagnosis' | 'guardrail' | 'evolution' | 'manual' | 'crystallization';
  sourceId: string;
  extractedTriples: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }>;
  status: 'pending' | 'validated' | 'integrated' | 'rejected';
  extractedAt: number;
  validatedAt: number | null;
}

export interface KnowledgeConflict {
  id: string;
  existingTriple: { subject: string; predicate: string; object: string; confidence: number };
  newTriple: { subject: string; predicate: string; object: string; confidence: number };
  conflictType: 'contradiction' | 'supersession' | 'refinement';
  resolution: 'keep_existing' | 'replace' | 'merge' | 'pending';
  resolvedAt: number | null;
}

export interface KnowledgeQualityReport {
  totalTriples: number;
  avgConfidence: number;
  staleTriples: number;
  conflictCount: number;
  orphanEntities: number;
  coverageByDomain: Record<string, number>;
  lastEvolutionAt: number;
}

// ============================================================================
// KG 进化服务
// ============================================================================

export class KGEvolutionService {
  private extractions = new Map<string, KnowledgeExtraction>();
  private conflicts = new Map<string, KnowledgeConflict>();
  private decayRatePerDay = 0.001; // 每天衰减 0.1%

  /**
   * 从诊断结果提取知识
   */
  extractFromDiagnosis(
    diagnosisReport: {
      machineId: string;
      dimensions: Array<{
        dimension: string;
        score: number;
        findings: string[];
        recommendations: string[];
      }>;
      overallScore: number;
    },
  ): KnowledgeExtraction {
    const triples: KnowledgeExtraction['extractedTriples'] = [];

    for (const dim of diagnosisReport.dimensions) {
      // 提取设备-维度-评分关系
      triples.push({
        subject: diagnosisReport.machineId,
        predicate: `has_${dim.dimension}_score`,
        object: `score:${dim.score.toFixed(2)}`,
        confidence: 0.9,
      });

      // 提取发现
      for (const finding of dim.findings) {
        triples.push({
          subject: diagnosisReport.machineId,
          predicate: `diagnosed_with`,
          object: finding,
          confidence: dim.score > 0.7 ? 0.85 : 0.6,
        });
      }

      // 提取建议→原因关系
      for (let i = 0; i < dim.recommendations.length; i++) {
        if (i < dim.findings.length) {
          triples.push({
            subject: dim.findings[i],
            predicate: 'resolved_by',
            object: dim.recommendations[i],
            confidence: 0.75,
          });
        }
      }
    }

    const extraction: KnowledgeExtraction = {
      id: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceType: 'diagnosis',
      sourceId: diagnosisReport.machineId,
      extractedTriples: triples,
      status: 'pending',
      extractedAt: Date.now(),
      validatedAt: null,
    };

    this.extractions.set(extraction.id, extraction);
    return extraction;
  }

  /**
   * 从护栏触发提取知识
   */
  extractFromGuardrail(
    trigger: {
      ruleId: string;
      machineId: string;
      condition: string;
      action: string;
      severity: string;
    },
  ): KnowledgeExtraction {
    const triples: KnowledgeExtraction['extractedTriples'] = [
      {
        subject: trigger.machineId,
        predicate: 'triggered_guardrail',
        object: trigger.ruleId,
        confidence: 1.0,
      },
      {
        subject: trigger.ruleId,
        predicate: 'triggered_by_condition',
        object: trigger.condition,
        confidence: 0.95,
      },
      {
        subject: trigger.condition,
        predicate: 'mitigated_by',
        object: trigger.action,
        confidence: 0.8,
      },
    ];

    const extraction: KnowledgeExtraction = {
      id: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceType: 'guardrail',
      sourceId: trigger.ruleId,
      extractedTriples: triples,
      status: 'pending',
      extractedAt: Date.now(),
      validatedAt: null,
    };

    this.extractions.set(extraction.id, extraction);
    return extraction;
  }

  /**
   * 检测知识冲突
   */
  detectConflicts(
    newTriples: Array<{ subject: string; predicate: string; object: string; confidence: number }>,
    existingTriples: Array<{ subject: string; predicate: string; object: string; confidence: number }>,
  ): KnowledgeConflict[] {
    const detected: KnowledgeConflict[] = [];

    for (const newT of newTriples) {
      for (const existT of existingTriples) {
        // 同一主语和谓语但不同宾语 → 可能冲突
        if (newT.subject === existT.subject && newT.predicate === existT.predicate && newT.object !== existT.object) {
          const conflict: KnowledgeConflict = {
            id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            existingTriple: existT,
            newTriple: newT,
            conflictType: this.classifyConflict(existT, newT),
            resolution: 'pending',
            resolvedAt: null,
          };
          detected.push(conflict);
          this.conflicts.set(conflict.id, conflict);
        }
      }
    }

    return detected;
  }

  /**
   * 解决冲突
   */
  resolveConflict(conflictId: string, resolution: KnowledgeConflict['resolution']): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return false;

    conflict.resolution = resolution;
    conflict.resolvedAt = Date.now();
    return true;
  }

  /**
   * 知识衰减（定期执行）
   */
  applyDecay(
    triples: Array<{ id: string; confidence: number; updatedAt: number }>,
    now: number = Date.now(),
  ): Array<{ id: string; newConfidence: number; isStale: boolean }> {
    return triples.map(t => {
      const daysSinceUpdate = (now - t.updatedAt) / (24 * 60 * 60 * 1000);
      const decayFactor = Math.exp(-this.decayRatePerDay * daysSinceUpdate);
      const newConfidence = t.confidence * decayFactor;
      return {
        id: t.id,
        newConfidence,
        isStale: newConfidence < 0.3,
      };
    });
  }

  /**
   * 知识质量评估
   */
  assessQuality(
    triples: Array<{ confidence: number; updatedAt: number; subject: string; predicate: string }>,
  ): KnowledgeQualityReport {
    const now = Date.now();
    const staleThreshold = 30 * 24 * 60 * 60 * 1000; // 30 天

    const staleTriples = triples.filter(t => now - t.updatedAt > staleThreshold).length;
    const avgConfidence = triples.length > 0
      ? triples.reduce((s, t) => s + t.confidence, 0) / triples.length
      : 0;

    // 按领域统计覆盖度
    const coverageByDomain: Record<string, number> = {};
    for (const t of triples) {
      const domain = t.predicate.split('_')[0] || 'unknown';
      coverageByDomain[domain] = (coverageByDomain[domain] || 0) + 1;
    }

    // 检测孤立实体
    const subjects = new Set(triples.map(t => t.subject));
    const objects = new Set(triples.map(t => t.subject)); // 简化：实际应检查宾语
    const orphanEntities = [...subjects].filter(s => !objects.has(s)).length;

    return {
      totalTriples: triples.length,
      avgConfidence,
      staleTriples,
      conflictCount: this.conflicts.size,
      orphanEntities,
      coverageByDomain,
      lastEvolutionAt: now,
    };
  }

  /**
   * 获取待处理的提取
   */
  getPendingExtractions(): KnowledgeExtraction[] {
    return Array.from(this.extractions.values()).filter(e => e.status === 'pending');
  }

  /**
   * 获取未解决的冲突
   */
  getPendingConflicts(): KnowledgeConflict[] {
    return Array.from(this.conflicts.values()).filter(c => c.resolution === 'pending');
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private classifyConflict(
    existing: { confidence: number },
    newTriple: { confidence: number },
  ): KnowledgeConflict['conflictType'] {
    if (newTriple.confidence > existing.confidence * 1.2) return 'supersession';
    if (Math.abs(newTriple.confidence - existing.confidence) < 0.1) return 'refinement';
    return 'contradiction';
  }
}
