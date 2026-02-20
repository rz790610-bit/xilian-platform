/**
 * ============================================================================
 * 闭环追踪器 — ClosedLoopTracker
 * ============================================================================
 *
 * 自进化飞轮：端到端闭环验证和追踪
 *
 * 职责：
 *   1. 追踪每次进化迭代的完整闭环（发现→假设→验证→部署→反馈）
 *   2. 计算闭环效率指标
 *   3. 识别闭环瓶颈
 *   4. 生成进化报告
 */

// ============================================================================
// 闭环类型
// ============================================================================

export interface ClosedLoop {
  id: string;
  /** 闭环名称 */
  name: string;
  /** 闭环状态 */
  state: 'discovery' | 'hypothesis' | 'validation' | 'deployment' | 'feedback' | 'completed' | 'abandoned';
  /** 各阶段时间戳 */
  stages: {
    discovery: { startedAt: number; completedAt: number | null; data: Record<string, unknown> } | null;
    hypothesis: { startedAt: number; completedAt: number | null; data: Record<string, unknown> } | null;
    validation: { startedAt: number; completedAt: number | null; data: Record<string, unknown> } | null;
    deployment: { startedAt: number; completedAt: number | null; data: Record<string, unknown> } | null;
    feedback: { startedAt: number; completedAt: number | null; data: Record<string, unknown> } | null;
  };
  /** 触发源 */
  trigger: 'auto' | 'manual' | 'scheduled' | 'event';
  /** 关联的数据发现 ID */
  discoveryId: string | null;
  /** 关联的影子评估 ID */
  shadowEvalId: string | null;
  /** 关联的金丝雀部署 ID */
  canaryDeploymentId: string | null;
  /** 改进指标 */
  improvement: {
    metric: string;
    before: number;
    after: number;
    delta: number;
    deltaPercent: number;
  } | null;
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt: number | null;
  /** 总耗时（ms） */
  totalDurationMs: number | null;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

export interface ClosedLoopStats {
  totalLoops: number;
  completedLoops: number;
  abandonedLoops: number;
  inProgressLoops: number;
  avgDurationMs: number;
  avgImprovement: number;
  bottleneckStage: string | null;
  successRate: number;
  byTrigger: Record<string, number>;
}

// ============================================================================
// 闭环追踪器实现
// ============================================================================

export class ClosedLoopTracker {
  private activeLoops = new Map<string, ClosedLoop>();
  private completedLoops: ClosedLoop[] = [];
  private maxHistory = 1_000;

  /**
   * 创建新闭环
   */
  createLoop(params: {
    name: string;
    trigger: ClosedLoop['trigger'];
    discoveryId?: string;
    metadata?: Record<string, unknown>;
  }): ClosedLoop {
    const now = Date.now();
    const loop: ClosedLoop = {
      id: `loop_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      state: 'discovery',
      stages: {
        discovery: { startedAt: now, completedAt: null, data: {} },
        hypothesis: null,
        validation: null,
        deployment: null,
        feedback: null,
      },
      trigger: params.trigger,
      discoveryId: params.discoveryId || null,
      shadowEvalId: null,
      canaryDeploymentId: null,
      improvement: null,
      createdAt: now,
      completedAt: null,
      totalDurationMs: null,
      metadata: params.metadata || {},
    };

    this.activeLoops.set(loop.id, loop);
    return loop;
  }

  /**
   * 推进闭环到下一阶段
   */
  advanceStage(
    loopId: string,
    stageData?: Record<string, unknown>,
  ): ClosedLoop | null {
    const loop = this.activeLoops.get(loopId);
    if (!loop) return null;

    const now = Date.now();
    const stageOrder: Array<ClosedLoop['state']> = ['discovery', 'hypothesis', 'validation', 'deployment', 'feedback', 'completed'];
    const currentIndex = stageOrder.indexOf(loop.state);
    if (currentIndex < 0 || currentIndex >= stageOrder.length - 1) return loop;

    // 完成当前阶段
    const currentStage = loop.stages[loop.state as keyof typeof loop.stages];
    if (currentStage) {
      currentStage.completedAt = now;
      if (stageData) Object.assign(currentStage.data, stageData);
    }

    // 进入下一阶段
    const nextState = stageOrder[currentIndex + 1];
    if (nextState === 'completed') {
      loop.state = 'completed';
      loop.completedAt = now;
      loop.totalDurationMs = now - loop.createdAt;
      this.archiveLoop(loopId);
    } else {
      loop.state = nextState as any;
      const nextStageKey = nextState as keyof typeof loop.stages;
      if (nextStageKey in loop.stages) {
        (loop.stages as any)[nextStageKey] = { startedAt: now, completedAt: null, data: {} };
      }
    }

    return loop;
  }

  /**
   * 记录改进指标
   */
  recordImprovement(
    loopId: string,
    metric: string,
    before: number,
    after: number,
  ): void {
    const loop = this.activeLoops.get(loopId) || this.completedLoops.find(l => l.id === loopId);
    if (!loop) return;

    loop.improvement = {
      metric,
      before,
      after,
      delta: after - before,
      deltaPercent: before !== 0 ? ((after - before) / Math.abs(before)) * 100 : 0,
    };
  }

  /**
   * 放弃闭环
   */
  abandonLoop(loopId: string, reason: string): boolean {
    const loop = this.activeLoops.get(loopId);
    if (!loop) return false;

    loop.state = 'abandoned';
    loop.completedAt = Date.now();
    loop.totalDurationMs = loop.completedAt - loop.createdAt;
    loop.metadata.abandonReason = reason;
    this.archiveLoop(loopId);
    return true;
  }

  /**
   * 关联影子评估
   */
  linkShadowEval(loopId: string, shadowEvalId: string): void {
    const loop = this.activeLoops.get(loopId);
    if (loop) loop.shadowEvalId = shadowEvalId;
  }

  /**
   * 关联金丝雀部署
   */
  linkCanaryDeployment(loopId: string, canaryDeploymentId: string): void {
    const loop = this.activeLoops.get(loopId);
    if (loop) loop.canaryDeploymentId = canaryDeploymentId;
  }

  /**
   * 获取闭环
   */
  getLoop(id: string): ClosedLoop | null {
    return this.activeLoops.get(id) || this.completedLoops.find(l => l.id === id) || null;
  }

  /**
   * 获取活跃闭环
   */
  getActiveLoops(): ClosedLoop[] {
    return Array.from(this.activeLoops.values());
  }

  /**
   * 获取统计信息
   */
  getStats(): ClosedLoopStats {
    const all = [...this.completedLoops, ...Array.from(this.activeLoops.values())];
    const completed = all.filter(l => l.state === 'completed');
    const abandoned = all.filter(l => l.state === 'abandoned');
    const inProgress = Array.from(this.activeLoops.values()).filter(
      l => l.state !== 'completed' && l.state !== 'abandoned',
    );

    const avgDuration = completed.length > 0
      ? completed.reduce((s, l) => s + (l.totalDurationMs || 0), 0) / completed.length
      : 0;

    const withImprovement = completed.filter(l => l.improvement !== null);
    const avgImprovement = withImprovement.length > 0
      ? withImprovement.reduce((s, l) => s + (l.improvement?.deltaPercent || 0), 0) / withImprovement.length
      : 0;

    // 瓶颈分析
    const bottleneck = this.findBottleneck(completed);

    const byTrigger: Record<string, number> = {};
    for (const l of all) {
      byTrigger[l.trigger] = (byTrigger[l.trigger] || 0) + 1;
    }

    return {
      totalLoops: all.length,
      completedLoops: completed.length,
      abandonedLoops: abandoned.length,
      inProgressLoops: inProgress.length,
      avgDurationMs: avgDuration,
      avgImprovement,
      bottleneckStage: bottleneck,
      successRate: all.length > 0 ? completed.length / all.length : 0,
      byTrigger,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private archiveLoop(id: string): void {
    const loop = this.activeLoops.get(id);
    if (loop) {
      this.completedLoops.push(loop);
      this.activeLoops.delete(id);
      if (this.completedLoops.length > this.maxHistory) {
        this.completedLoops = this.completedLoops.slice(-this.maxHistory);
      }
    }
  }

  private findBottleneck(completed: ClosedLoop[]): string | null {
    if (completed.length === 0) return null;

    const stageDurations: Record<string, number[]> = {
      discovery: [],
      hypothesis: [],
      validation: [],
      deployment: [],
      feedback: [],
    };

    for (const loop of completed) {
      for (const [stage, data] of Object.entries(loop.stages)) {
        if (data && data.startedAt && data.completedAt) {
          stageDurations[stage]?.push(data.completedAt - data.startedAt);
        }
      }
    }

    let maxAvg = 0;
    let bottleneck: string | null = null;
    for (const [stage, durations] of Object.entries(stageDurations)) {
      if (durations.length === 0) continue;
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      if (avg > maxAvg) {
        maxAvg = avg;
        bottleneck = stage;
      }
    }

    return bottleneck;
  }
}
