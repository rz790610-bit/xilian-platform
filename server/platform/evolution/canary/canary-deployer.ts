/**
 * ============================================================================
 * 金丝雀部署器 — CanaryDeployer
 * ============================================================================
 *
 * 自进化飞轮：安全渐进式部署新模型/规则
 *
 * 职责：
 *   1. 管理金丝雀部署的生命周期（创建→灰度→全量→回滚）
 *   2. 流量分配（一致性哈希路由）
 *   3. 实时监控金丝雀指标
 *   4. 自动回滚（指标劣化时）
 */

// ============================================================================
// 金丝雀部署类型
// ============================================================================

export interface CanaryDeployment {
  id: string;
  /** 部署名称 */
  name: string;
  /** 部署状态 */
  state: 'created' | 'canary' | 'expanding' | 'full' | 'rolled_back' | 'completed';
  /** 当前流量百分比 (0-100) */
  trafficPercent: number;
  /** 目标流量百分比 */
  targetTrafficPercent: number;
  /** 流量递增步长 */
  trafficStepPercent: number;
  /** 每步观察时间（ms） */
  observationWindowMs: number;
  /** Champion 版本 */
  championVersion: string;
  /** Challenger 版本 */
  challengerVersion: string;
  /** 成功指标阈值 */
  successCriteria: {
    /** 最小准确率 */
    minAccuracy: number;
    /** 最大延迟（ms） */
    maxLatencyMs: number;
    /** 最大错误率 */
    maxErrorRate: number;
    /** 自定义指标 */
    customMetrics?: Record<string, { min?: number; max?: number }>;
  };
  /** 当前指标 */
  currentMetrics: {
    champion: DeploymentMetrics;
    challenger: DeploymentMetrics;
  };
  /** 创建时间 */
  createdAt: number;
  /** 上次更新时间 */
  updatedAt: number;
  /** 完成/回滚时间 */
  completedAt: number | null;
  /** 回滚原因 */
  rollbackReason: string | null;
  /** 部署历史 */
  history: Array<{ timestamp: number; action: string; details: string }>;
}

export interface DeploymentMetrics {
  requestCount: number;
  successCount: number;
  errorCount: number;
  accuracy: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  lastUpdatedAt: number;
}

// ============================================================================
// 金丝雀部署器实现
// ============================================================================

export class CanaryDeployer {
  private deployments = new Map<string, CanaryDeployment>();
  private deploymentHistory: CanaryDeployment[] = [];
  private checkIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * 创建金丝雀部署
   */
  createDeployment(params: {
    name: string;
    championVersion: string;
    challengerVersion: string;
    initialTrafficPercent?: number;
    targetTrafficPercent?: number;
    trafficStepPercent?: number;
    observationWindowMs?: number;
    successCriteria?: Partial<CanaryDeployment['successCriteria']>;
  }): CanaryDeployment {
    const deployment: CanaryDeployment = {
      id: `canary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      state: 'created',
      trafficPercent: params.initialTrafficPercent || 5,
      targetTrafficPercent: params.targetTrafficPercent || 100,
      trafficStepPercent: params.trafficStepPercent || 10,
      observationWindowMs: params.observationWindowMs || 5 * 60 * 1000,
      championVersion: params.championVersion,
      challengerVersion: params.challengerVersion,
      successCriteria: {
        minAccuracy: params.successCriteria?.minAccuracy ?? 0.9,
        maxLatencyMs: params.successCriteria?.maxLatencyMs ?? 5000,
        maxErrorRate: params.successCriteria?.maxErrorRate ?? 0.05,
        customMetrics: params.successCriteria?.customMetrics,
      },
      currentMetrics: {
        champion: this.emptyMetrics(),
        challenger: this.emptyMetrics(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      rollbackReason: null,
      history: [{ timestamp: Date.now(), action: 'created', details: `金丝雀部署创建，初始流量 ${params.initialTrafficPercent || 5}%` }],
    };

    this.deployments.set(deployment.id, deployment);
    return deployment;
  }

  /**
   * 启动金丝雀部署
   */
  startDeployment(id: string): boolean {
    const deployment = this.deployments.get(id);
    if (!deployment || deployment.state !== 'created') return false;

    deployment.state = 'canary';
    deployment.updatedAt = Date.now();
    deployment.history.push({
      timestamp: Date.now(),
      action: 'started',
      details: `金丝雀启动，流量 ${deployment.trafficPercent}%`,
    });

    // 启动定期检查
    this.startMonitoring(id);
    return true;
  }

  /**
   * 记录请求指标
   */
  recordMetric(
    deploymentId: string,
    version: 'champion' | 'challenger',
    success: boolean,
    latencyMs: number,
  ): void {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    const metrics = deployment.currentMetrics[version];
    metrics.requestCount++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }
    metrics.accuracy = metrics.requestCount > 0 ? metrics.successCount / metrics.requestCount : 0;
    metrics.avgLatencyMs = metrics.requestCount > 0
      ? (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount
      : latencyMs;
    metrics.p99LatencyMs = Math.max(metrics.p99LatencyMs, latencyMs);
    metrics.lastUpdatedAt = Date.now();
  }

  /**
   * 路由请求（基于一致性哈希）
   */
  routeRequest(deploymentId: string, requestKey: string): 'champion' | 'challenger' {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment || deployment.state === 'rolled_back') return 'champion';

    // 简单哈希路由
    const hash = this.simpleHash(requestKey);
    const threshold = deployment.trafficPercent / 100;
    return hash < threshold ? 'challenger' : 'champion';
  }

  /**
   * 手动推进流量
   */
  advanceTraffic(id: string, newPercent?: number): boolean {
    const deployment = this.deployments.get(id);
    if (!deployment || deployment.state === 'rolled_back' || deployment.state === 'completed') return false;

    const target = newPercent ?? (deployment.trafficPercent + deployment.trafficStepPercent);
    deployment.trafficPercent = Math.min(target, deployment.targetTrafficPercent);
    deployment.updatedAt = Date.now();

    if (deployment.trafficPercent >= deployment.targetTrafficPercent) {
      deployment.state = 'full';
      deployment.history.push({
        timestamp: Date.now(),
        action: 'full_traffic',
        details: `流量已达 ${deployment.trafficPercent}%，进入全量阶段`,
      });
    } else {
      deployment.state = 'expanding';
      deployment.history.push({
        timestamp: Date.now(),
        action: 'traffic_advanced',
        details: `流量推进至 ${deployment.trafficPercent}%`,
      });
    }

    return true;
  }

  /**
   * 完成部署（Challenger 成为新 Champion）
   */
  completeDeployment(id: string): boolean {
    const deployment = this.deployments.get(id);
    if (!deployment || deployment.state === 'rolled_back') return false;

    deployment.state = 'completed';
    deployment.completedAt = Date.now();
    deployment.updatedAt = Date.now();
    deployment.history.push({
      timestamp: Date.now(),
      action: 'completed',
      details: `部署完成，${deployment.challengerVersion} 成为新 Champion`,
    });

    this.archiveDeployment(id);
    return true;
  }

  /**
   * 回滚部署
   */
  rollback(id: string, reason: string): boolean {
    const deployment = this.deployments.get(id);
    if (!deployment) return false;

    deployment.state = 'rolled_back';
    deployment.rollbackReason = reason;
    deployment.trafficPercent = 0;
    deployment.completedAt = Date.now();
    deployment.updatedAt = Date.now();
    deployment.history.push({
      timestamp: Date.now(),
      action: 'rolled_back',
      details: `回滚: ${reason}`,
    });

    this.stopMonitoring(id);
    this.archiveDeployment(id);
    return true;
  }

  /**
   * 获取部署状态
   */
  getDeployment(id: string): CanaryDeployment | null {
    return this.deployments.get(id) || this.deploymentHistory.find(d => d.id === id) || null;
  }

  /**
   * 获取所有活跃部署
   */
  getActiveDeployments(): CanaryDeployment[] {
    return Array.from(this.deployments.values())
      .filter(d => d.state !== 'completed' && d.state !== 'rolled_back');
  }

  /**
   * 获取部署历史
   */
  getHistory(limit?: number): CanaryDeployment[] {
    return limit ? this.deploymentHistory.slice(-limit) : [...this.deploymentHistory];
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private startMonitoring(id: string): void {
    const deployment = this.deployments.get(id);
    if (!deployment) return;

    const interval = setInterval(() => {
      this.evaluateDeployment(id);
    }, Math.min(deployment.observationWindowMs, 60_000));

    this.checkIntervals.set(id, interval);
  }

  private stopMonitoring(id: string): void {
    const interval = this.checkIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(id);
    }
  }

  private evaluateDeployment(id: string): void {
    const deployment = this.deployments.get(id);
    if (!deployment || deployment.state === 'completed' || deployment.state === 'rolled_back') {
      this.stopMonitoring(id);
      return;
    }

    const { challenger } = deployment.currentMetrics;
    const { successCriteria } = deployment;

    // 检查是否满足成功标准
    if (challenger.requestCount < 10) return; // 样本不足

    const errorRate = challenger.requestCount > 0 ? challenger.errorCount / challenger.requestCount : 0;

    if (challenger.accuracy < successCriteria.minAccuracy) {
      this.rollback(id, `准确率 ${(challenger.accuracy * 100).toFixed(1)}% < 阈值 ${(successCriteria.minAccuracy * 100).toFixed(1)}%`);
      return;
    }

    if (challenger.avgLatencyMs > successCriteria.maxLatencyMs) {
      this.rollback(id, `平均延迟 ${challenger.avgLatencyMs.toFixed(0)}ms > 阈值 ${successCriteria.maxLatencyMs}ms`);
      return;
    }

    if (errorRate > successCriteria.maxErrorRate) {
      this.rollback(id, `错误率 ${(errorRate * 100).toFixed(1)}% > 阈值 ${(successCriteria.maxErrorRate * 100).toFixed(1)}%`);
      return;
    }

    // 指标正常，自动推进流量
    if (deployment.state === 'canary' || deployment.state === 'expanding') {
      this.advanceTraffic(id);
    }
  }

  private archiveDeployment(id: string): void {
    const deployment = this.deployments.get(id);
    if (deployment) {
      this.deploymentHistory.push(deployment);
      this.deployments.delete(id);
      this.stopMonitoring(id);
    }
  }

  private emptyMetrics(): DeploymentMetrics {
    return {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      accuracy: 0,
      avgLatencyMs: 0,
      p99LatencyMs: 0,
      lastUpdatedAt: Date.now(),
    };
  }

  private simpleHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) / 2147483647;
  }
}
