/**
 * ============================================================================
 * 知识结晶持久化服务 — CrystalService
 * ============================================================================
 *
 * 职责：
 *   1. 结晶记录 CRUD（MySQL knowledge_crystals 表）
 *   2. 结晶验证和审核流程
 *   3. 结晶应用追踪（哪些诊断/决策使用了该结晶）
 *   4. 结晶版本管理
 *   5. 跨工况结晶迁移
 */

// ============================================================================
// 结晶类型
// ============================================================================

export interface CrystalRecord {
  id: number;
  type: 'pattern' | 'rule' | 'threshold' | 'correlation' | 'causal_chain';
  name: string;
  description: string;
  content: {
    /** 结晶的核心知识内容 */
    knowledge: Record<string, unknown>;
    /** 适用条件 */
    applicableConditions: string[];
    /** 置信度 */
    confidence: number;
    /** 来源证据 */
    evidence: Array<{
      sourceType: string;
      sourceId: string;
      contribution: number;
    }>;
  };
  version: number;
  status: 'draft' | 'pending_review' | 'approved' | 'deprecated';
  applicationCount: number;
  lastAppliedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface CrystalApplication {
  id: number;
  crystalId: number;
  appliedIn: string; // 'diagnosis' | 'guardrail' | 'prediction' | 'optimization'
  contextId: string;
  machineId: string;
  outcome: 'positive' | 'neutral' | 'negative' | 'unknown';
  appliedAt: number;
}

export interface CrystalMigration {
  id: number;
  crystalId: number;
  fromConditionProfile: string;
  toConditionProfile: string;
  adaptations: Record<string, unknown>;
  validationResult: {
    isValid: boolean;
    confidenceAfterMigration: number;
    warnings: string[];
  };
  migratedAt: number;
}

// ============================================================================
// 结晶服务
// ============================================================================

export class CrystalService {
  private crystals = new Map<number, CrystalRecord>();
  private applications: CrystalApplication[] = [];
  private migrations: CrystalMigration[] = [];
  private nextId = 1;

  /**
   * 创建结晶
   */
  create(params: {
    type: CrystalRecord['type'];
    name: string;
    description: string;
    knowledge: Record<string, unknown>;
    applicableConditions: string[];
    confidence: number;
    evidence: CrystalRecord['content']['evidence'];
    createdBy: string;
  }): CrystalRecord {
    const crystal: CrystalRecord = {
      id: this.nextId++,
      type: params.type,
      name: params.name,
      description: params.description,
      content: {
        knowledge: params.knowledge,
        applicableConditions: params.applicableConditions,
        confidence: params.confidence,
        evidence: params.evidence,
      },
      version: 1,
      status: 'draft',
      applicationCount: 0,
      lastAppliedAt: null,
      createdBy: params.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.crystals.set(crystal.id, crystal);
    // TODO: INSERT INTO knowledge_crystals ...
    return crystal;
  }

  /**
   * 获取结晶
   */
  get(id: number): CrystalRecord | null {
    return this.crystals.get(id) || null;
  }

  /**
   * 列出结晶
   */
  list(params?: {
    type?: CrystalRecord['type'];
    status?: CrystalRecord['status'];
    minConfidence?: number;
    limit?: number;
    offset?: number;
  }): { crystals: CrystalRecord[]; total: number } {
    let results = Array.from(this.crystals.values());

    if (params?.type) results = results.filter(c => c.type === params.type);
    if (params?.status) results = results.filter(c => c.status === params.status);
    if (params?.minConfidence) results = results.filter(c => c.content.confidence >= params.minConfidence!);

    const total = results.length;
    const offset = params?.offset || 0;
    const limit = params?.limit || 50;

    return {
      crystals: results.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * 审核结晶
   */
  review(id: number, approved: boolean, reviewer: string): boolean {
    const crystal = this.crystals.get(id);
    if (!crystal) return false;

    crystal.status = approved ? 'approved' : 'draft';
    crystal.updatedAt = Date.now();
    // TODO: UPDATE knowledge_crystals SET status = ...
    return true;
  }

  /**
   * 记录结晶应用
   */
  recordApplication(params: {
    crystalId: number;
    appliedIn: string;
    contextId: string;
    machineId: string;
    outcome?: CrystalApplication['outcome'];
  }): CrystalApplication | null {
    const crystal = this.crystals.get(params.crystalId);
    if (!crystal) return null;

    const application: CrystalApplication = {
      id: this.applications.length + 1,
      crystalId: params.crystalId,
      appliedIn: params.appliedIn,
      contextId: params.contextId,
      machineId: params.machineId,
      outcome: params.outcome || 'unknown',
      appliedAt: Date.now(),
    };

    this.applications.push(application);
    crystal.applicationCount++;
    crystal.lastAppliedAt = Date.now();
    return application;
  }

  /**
   * 更新应用结果
   */
  updateApplicationOutcome(applicationId: number, outcome: CrystalApplication['outcome']): boolean {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) return false;
    app.outcome = outcome;
    return true;
  }

  /**
   * 跨工况迁移结晶
   */
  migrate(
    crystalId: number,
    fromProfile: string,
    toProfile: string,
    adaptations: Record<string, unknown>,
  ): CrystalMigration | null {
    const crystal = this.crystals.get(crystalId);
    if (!crystal) return null;

    // 评估迁移可行性
    const confidenceReduction = Object.keys(adaptations).length * 0.05;
    const newConfidence = Math.max(0.3, crystal.content.confidence - confidenceReduction);
    const warnings: string[] = [];

    if (confidenceReduction > 0.2) {
      warnings.push('迁移适配项较多，置信度显著下降');
    }
    if (newConfidence < 0.5) {
      warnings.push('迁移后置信度低于 0.5，建议人工验证');
    }

    const migration: CrystalMigration = {
      id: this.migrations.length + 1,
      crystalId,
      fromConditionProfile: fromProfile,
      toConditionProfile: toProfile,
      adaptations,
      validationResult: {
        isValid: newConfidence >= 0.3,
        confidenceAfterMigration: newConfidence,
        warnings,
      },
      migratedAt: Date.now(),
    };

    this.migrations.push(migration);

    // 创建迁移后的新版本
    if (migration.validationResult.isValid) {
      const migratedCrystal: CrystalRecord = {
        ...crystal,
        id: this.nextId++,
        version: crystal.version + 1,
        content: {
          ...crystal.content,
          confidence: newConfidence,
          applicableConditions: [...crystal.content.applicableConditions, toProfile],
        },
        status: 'pending_review',
        applicationCount: 0,
        lastAppliedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.crystals.set(migratedCrystal.id, migratedCrystal);
    }

    return migration;
  }

  /**
   * 获取结晶效果统计
   */
  getEffectivenessStats(crystalId: number): {
    totalApplications: number;
    positiveRate: number;
    negativeRate: number;
    avgConfidenceImpact: number;
  } {
    const apps = this.applications.filter(a => a.crystalId === crystalId);
    const positive = apps.filter(a => a.outcome === 'positive').length;
    const negative = apps.filter(a => a.outcome === 'negative').length;

    return {
      totalApplications: apps.length,
      positiveRate: apps.length > 0 ? positive / apps.length : 0,
      negativeRate: apps.length > 0 ? negative / apps.length : 0,
      avgConfidenceImpact: 0, // TODO: 计算实际影响
    };
  }
}
