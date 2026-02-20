/**
 * ============================================================================
 * 认知会话持久化服务 — CognitionSessionService
 * ============================================================================
 *
 * 管理认知会话的生命周期和持久化
 *
 * 职责：
 *   1. 创建/查询/归档认知会话
 *   2. 持久化推理链和诊断报告
 *   3. 会话统计和分析
 *   4. 会话回放支持
 */

// ============================================================================
// 会话类型
// ============================================================================

export interface CognitionSession {
  id: string;
  /** 触发源 */
  triggeredBy: 'schedule' | 'event' | 'manual' | 'chain' | 'grok';
  /** 目标设备/实体 ID */
  targetId: string;
  /** 目标类型 */
  targetType: string;
  /** 会话状态 */
  state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 认知模式 */
  mode: 'standard' | 'deep' | 'emergency' | 'chain';
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt: number | null;
  /** 耗时（ms） */
  durationMs: number | null;
  /** 四维处理结果摘要 */
  dimensionSummary: {
    perception: { success: boolean; anomalyCount: number } | null;
    reasoning: { success: boolean; hypothesisCount: number } | null;
    fusion: { success: boolean; confidence: number } | null;
    decision: { success: boolean; actionCount: number } | null;
  };
  /** 综合置信度 */
  overallConfidence: number | null;
  /** 是否收敛 */
  converged: boolean | null;
  /** Grok 推理链 ID */
  grokChainId: string | null;
  /** 护栏检查结果 */
  guardrailResult: { passed: boolean; violations: number } | null;
  /** 叙事摘要 */
  narrativeSummary: string | null;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

export interface SessionFilter {
  targetId?: string;
  targetType?: string;
  state?: CognitionSession['state'];
  mode?: CognitionSession['mode'];
  triggeredBy?: CognitionSession['triggeredBy'];
  startAfter?: number;
  startBefore?: number;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  avgDurationMs: number;
  avgConfidence: number;
  convergenceRate: number;
  guardrailViolationRate: number;
  byMode: Record<string, number>;
  byTrigger: Record<string, number>;
}

// ============================================================================
// 认知会话服务
// ============================================================================

export class CognitionSessionService {
  private sessions = new Map<string, CognitionSession>();
  private sessionHistory: CognitionSession[] = [];
  private maxHistorySize = 10_000;

  /**
   * 创建新会话
   */
  createSession(params: {
    targetId: string;
    targetType: string;
    triggeredBy: CognitionSession['triggeredBy'];
    mode: CognitionSession['mode'];
    metadata?: Record<string, unknown>;
  }): CognitionSession {
    const session: CognitionSession = {
      id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      triggeredBy: params.triggeredBy,
      targetId: params.targetId,
      targetType: params.targetType,
      state: 'pending',
      mode: params.mode,
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      dimensionSummary: {
        perception: null,
        reasoning: null,
        fusion: null,
        decision: null,
      },
      overallConfidence: null,
      converged: null,
      grokChainId: null,
      guardrailResult: null,
      narrativeSummary: null,
      metadata: params.metadata || {},
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * 更新会话状态
   */
  updateSession(id: string, updates: Partial<CognitionSession>): CognitionSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;

    Object.assign(session, updates);

    // 如果完成或失败，计算耗时并归档
    if (updates.state === 'completed' || updates.state === 'failed' || updates.state === 'cancelled') {
      session.endedAt = Date.now();
      session.durationMs = session.endedAt - session.startedAt;
      this.archiveSession(session);
    }

    return session;
  }

  /**
   * 获取会话
   */
  getSession(id: string): CognitionSession | null {
    return this.sessions.get(id) || this.sessionHistory.find(s => s.id === id) || null;
  }

  /**
   * 查询会话列表
   */
  querySessions(filter: SessionFilter): CognitionSession[] {
    let results = [...this.sessionHistory, ...Array.from(this.sessions.values())];

    if (filter.targetId) results = results.filter(s => s.targetId === filter.targetId);
    if (filter.targetType) results = results.filter(s => s.targetType === filter.targetType);
    if (filter.state) results = results.filter(s => s.state === filter.state);
    if (filter.mode) results = results.filter(s => s.mode === filter.mode);
    if (filter.triggeredBy) results = results.filter(s => s.triggeredBy === filter.triggeredBy);
    if (filter.startAfter) results = results.filter(s => s.startedAt >= filter.startAfter!);
    if (filter.startBefore) results = results.filter(s => s.startedAt <= filter.startBefore!);
    if (filter.minConfidence) results = results.filter(s => (s.overallConfidence ?? 0) >= filter.minConfidence!);

    // 按时间倒序
    results.sort((a, b) => b.startedAt - a.startedAt);

    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions(): CognitionSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.state === 'running' || s.state === 'pending');
  }

  /**
   * 获取统计信息
   */
  getStats(since?: number): SessionStats {
    let sessions = [...this.sessionHistory];
    if (since) {
      sessions = sessions.filter(s => s.startedAt >= since);
    }

    const completed = sessions.filter(s => s.state === 'completed');
    const failed = sessions.filter(s => s.state === 'failed');
    const withConfidence = completed.filter(s => s.overallConfidence !== null);
    const converged = completed.filter(s => s.converged === true);
    const withGuardrail = completed.filter(s => s.guardrailResult !== null);
    const guardrailViolations = withGuardrail.filter(s => !s.guardrailResult!.passed);

    const byMode: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    for (const s of sessions) {
      byMode[s.mode] = (byMode[s.mode] || 0) + 1;
      byTrigger[s.triggeredBy] = (byTrigger[s.triggeredBy] || 0) + 1;
    }

    return {
      totalSessions: sessions.length,
      completedSessions: completed.length,
      failedSessions: failed.length,
      avgDurationMs: completed.length > 0
        ? completed.reduce((sum, s) => sum + (s.durationMs || 0), 0) / completed.length
        : 0,
      avgConfidence: withConfidence.length > 0
        ? withConfidence.reduce((sum, s) => sum + (s.overallConfidence || 0), 0) / withConfidence.length
        : 0,
      convergenceRate: completed.length > 0 ? converged.length / completed.length : 0,
      guardrailViolationRate: withGuardrail.length > 0 ? guardrailViolations.length / withGuardrail.length : 0,
      byMode,
      byTrigger,
    };
  }

  /**
   * 取消会话
   */
  cancelSession(id: string, reason?: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.state === 'completed' || session.state === 'failed') return false;

    session.state = 'cancelled';
    session.endedAt = Date.now();
    session.durationMs = session.endedAt - session.startedAt;
    session.metadata.cancelReason = reason;
    this.archiveSession(session);
    return true;
  }

  /**
   * 导出会话数据（用于回放）
   */
  exportSession(id: string): CognitionSession | null {
    return this.getSession(id);
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private archiveSession(session: CognitionSession): void {
    this.sessions.delete(session.id);
    this.sessionHistory.push(session);
    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory = this.sessionHistory.slice(-this.maxHistorySize);
    }
  }
}
