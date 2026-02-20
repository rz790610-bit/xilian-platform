/**
 * ============================================================================
 * 认知仪表盘服务 (Cognitive Dashboard Service)
 * ============================================================================
 *
 * 四维可视化数据聚合：
 *   1. 安全维度：实时风险地图 + 告警时间线
 *   2. 健康维度：疲劳热图 + 剩余寿命预测
 *   3. 效率维度：周期时间分布 + 能耗对比
 *   4. 进化维度：模型改进曲线 + 知识增长图
 *
 * 数据流：
 *   各引擎输出 → 聚合器 → WebSocket 推送 → 前端渲染
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface DashboardSnapshot {
  timestamp: number;
  /** 安全维度 */
  safety: {
    overallScore: number;
    riskLevel: 'safe' | 'warning' | 'danger' | 'critical';
    activeAlerts: AlertItem[];
    windStatus: { speed: number; direction: number; gustFactor: number };
    recentViolations: { timestamp: number; rule: string; severity: string }[];
    trendLast24h: number[];
  };
  /** 健康维度 */
  health: {
    overallScore: number;
    fatigueAccumulation: number;
    remainingLifeDays: number;
    componentHealth: { component: string; score: number; trend: string }[];
    maintenanceSchedule: { date: string; type: string; component: string }[];
    fatigueHeatmap: { zone: string; value: number }[];
  };
  /** 效率维度 */
  efficiency: {
    overallScore: number;
    cycleTimeAvg: number;
    cycleTimeTarget: number;
    energyConsumption: number;
    throughput: number;
    bottlenecks: { phase: string; avgDelay: number; cause: string }[];
    comparisonWithBaseline: { metric: string; current: number; baseline: number; delta: number }[];
  };
  /** 进化维度 */
  evolution: {
    modelVersion: string;
    accuracyTrend: number[];
    knowledgeNodeCount: number;
    recentCrystallizations: { timestamp: number; pattern: string; confidence: number }[];
    flywheelCycles: number;
    improvementRate: number;
  };
  /** 设备概览 */
  fleet: {
    totalMachines: number;
    activeMachines: number;
    machineStatuses: { machineId: string; status: string; safetyScore: number; healthScore: number }[];
  };
}

export interface AlertItem {
  alertId: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  category: 'safety' | 'health' | 'efficiency';
  title: string;
  description: string;
  machineId: string;
  acknowledged: boolean;
  actions: string[];
}

export interface DashboardConfig {
  refreshIntervalMs: number;
  alertRetentionHours: number;
  trendWindowHours: number;
  enableRealtime: boolean;
}

// ============================================================================
// 认知仪表盘服务
// ============================================================================

export class CognitiveDashboardService {
  private config: DashboardConfig;
  private alerts: AlertItem[] = [];
  private snapshots: DashboardSnapshot[] = [];
  private maxSnapshots: number = 1440; // 24h × 60/min
  private subscribers: Map<string, (snapshot: DashboardSnapshot) => void> = new Map();

  constructor(config?: Partial<DashboardConfig>) {
    this.config = {
      refreshIntervalMs: 5000,
      alertRetentionHours: 72,
      trendWindowHours: 24,
      enableRealtime: true,
      ...config,
    };
  }

  /**
   * 生成仪表盘快照
   */
  generateSnapshot(inputs: {
    safetyData?: Partial<DashboardSnapshot['safety']>;
    healthData?: Partial<DashboardSnapshot['health']>;
    efficiencyData?: Partial<DashboardSnapshot['efficiency']>;
    evolutionData?: Partial<DashboardSnapshot['evolution']>;
    fleetData?: Partial<DashboardSnapshot['fleet']>;
  }): DashboardSnapshot {
    const snapshot: DashboardSnapshot = {
      timestamp: Date.now(),
      safety: {
        overallScore: inputs.safetyData?.overallScore ?? 0.95,
        riskLevel: this.computeRiskLevel(inputs.safetyData?.overallScore ?? 0.95),
        activeAlerts: this.alerts.filter(a => !a.acknowledged && a.category === 'safety'),
        windStatus: inputs.safetyData?.windStatus ?? { speed: 6, direction: 180, gustFactor: 1.2 },
        recentViolations: inputs.safetyData?.recentViolations ?? [],
        trendLast24h: inputs.safetyData?.trendLast24h ?? this.generateTrendData(24),
      },
      health: {
        overallScore: inputs.healthData?.overallScore ?? 0.88,
        fatigueAccumulation: inputs.healthData?.fatigueAccumulation ?? 35,
        remainingLifeDays: inputs.healthData?.remainingLifeDays ?? 72,
        componentHealth: inputs.healthData?.componentHealth ?? [
          { component: '起升机构', score: 0.92, trend: 'stable' },
          { component: '小车运行机构', score: 0.85, trend: 'declining' },
          { component: '大车运行机构', score: 0.90, trend: 'stable' },
          { component: '臂架俯仰机构', score: 0.88, trend: 'stable' },
          { component: '吊具', score: 0.78, trend: 'declining' },
        ],
        maintenanceSchedule: inputs.healthData?.maintenanceSchedule ?? [],
        fatigueHeatmap: inputs.healthData?.fatigueHeatmap ?? [
          { zone: '前大梁根部', value: 0.45 },
          { zone: '后大梁根部', value: 0.38 },
          { zone: '门框连接处', value: 0.52 },
          { zone: '臂架铰点', value: 0.41 },
          { zone: '小车轨道梁', value: 0.28 },
        ],
      },
      efficiency: {
        overallScore: inputs.efficiencyData?.overallScore ?? 0.82,
        cycleTimeAvg: inputs.efficiencyData?.cycleTimeAvg ?? 125,
        cycleTimeTarget: inputs.efficiencyData?.cycleTimeTarget ?? 110,
        energyConsumption: inputs.efficiencyData?.energyConsumption ?? 45.2,
        throughput: inputs.efficiencyData?.throughput ?? 28,
        bottlenecks: inputs.efficiencyData?.bottlenecks ?? [
          { phase: '开闭锁', avgDelay: 3.2, cause: '吊具液压压力不足' },
          { phase: '着箱对位', avgDelay: 2.1, cause: '风偏修正频繁' },
        ],
        comparisonWithBaseline: inputs.efficiencyData?.comparisonWithBaseline ?? [],
      },
      evolution: {
        modelVersion: inputs.evolutionData?.modelVersion ?? 'v1.0.0',
        accuracyTrend: inputs.evolutionData?.accuracyTrend ?? this.generateTrendData(10, 0.85, 0.95),
        knowledgeNodeCount: inputs.evolutionData?.knowledgeNodeCount ?? 156,
        recentCrystallizations: inputs.evolutionData?.recentCrystallizations ?? [],
        flywheelCycles: inputs.evolutionData?.flywheelCycles ?? 0,
        improvementRate: inputs.evolutionData?.improvementRate ?? 0,
      },
      fleet: {
        totalMachines: inputs.fleetData?.totalMachines ?? 1,
        activeMachines: inputs.fleetData?.activeMachines ?? 1,
        machineStatuses: inputs.fleetData?.machineStatuses ?? [],
      },
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.splice(0, this.snapshots.length - this.maxSnapshots);
    }

    // 通知订阅者
    if (this.config.enableRealtime) {
      for (const callback of this.subscribers.values()) {
        try { callback(snapshot); } catch { /* ignore */ }
      }
    }

    return snapshot;
  }

  /**
   * 添加告警
   */
  addAlert(alert: Omit<AlertItem, 'alertId' | 'timestamp' | 'acknowledged'>): AlertItem {
    const fullAlert: AlertItem = {
      ...alert,
      alertId: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      acknowledged: false,
    };
    this.alerts.push(fullAlert);

    // 清理过期告警
    const cutoff = Date.now() - this.config.alertRetentionHours * 3600 * 1000;
    this.alerts = this.alerts.filter(a => a.timestamp > cutoff);

    return fullAlert;
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.alertId === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * 订阅实时更新
   */
  subscribe(subscriberId: string, callback: (snapshot: DashboardSnapshot) => void): void {
    this.subscribers.set(subscriberId, callback);
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriberId: string): void {
    this.subscribers.delete(subscriberId);
  }

  /**
   * 获取历史快照
   */
  getHistory(hours: number = 24): DashboardSnapshot[] {
    const cutoff = Date.now() - hours * 3600 * 1000;
    return this.snapshots.filter(s => s.timestamp > cutoff);
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertItem[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * 获取统计
   */
  getStats(): {
    totalAlerts: number;
    activeAlerts: number;
    snapshotCount: number;
    subscriberCount: number;
  } {
    return {
      totalAlerts: this.alerts.length,
      activeAlerts: this.alerts.filter(a => !a.acknowledged).length,
      snapshotCount: this.snapshots.length,
      subscriberCount: this.subscribers.size,
    };
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  private computeRiskLevel(score: number): 'safe' | 'warning' | 'danger' | 'critical' {
    if (score >= 0.8) return 'safe';
    if (score >= 0.6) return 'warning';
    if (score >= 0.3) return 'danger';
    return 'critical';
  }

  private generateTrendData(points: number, min: number = 0.7, max: number = 1.0): number[] {
    return Array.from({ length: points }, () =>
      min + Math.random() * (max - min)
    );
  }
}
