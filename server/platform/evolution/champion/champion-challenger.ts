/**
 * ============================================================================
 * 冠军-挑战者管理器 (Champion-Challenger Manager)
 * ============================================================================
 *
 * 自进化飞轮第 4 步：金丝雀部署
 *
 * 核心能力：
 *   1. 模型注册：注册新模型版本，管理模型生命周期
 *   2. 冠军管理：维护当前冠军模型，支持回滚
 *   3. 金丝雀部署：新模型逐步接管流量（5%→20%→50%→100%）
 *   4. 流量路由：根据部署策略路由推理请求
 *   5. 自动回滚：性能退化时自动回滚到冠军
 *
 * 部署策略：
 *   ┌──────────┬────────┬──────────┬──────────┐
 *   │ 阶段     │ 流量   │ 持续时间 │ 回滚条件 │
 *   ├──────────┼────────┼──────────┼──────────┤
 *   │ 影子     │ 0%     │ 1天      │ 任何退化 │
 *   │ 金丝雀   │ 5%     │ 2天      │ >5%退化  │
 *   │ 灰度     │ 20%    │ 3天      │ >3%退化  │
 *   │ 半量     │ 50%    │ 2天      │ >2%退化  │
 *   │ 全量     │ 100%   │ -        │ >1%退化  │
 *   └──────────┴────────┴──────────┴──────────┘
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface ModelRegistryEntry {
  modelId: string;
  version: string;
  type: string;
  description: string;
  parameters: Record<string, unknown>;
  metrics: Record<string, number>;
  status: 'registered' | 'shadow' | 'canary' | 'gray' | 'half' | 'champion' | 'retired' | 'rolled_back';
  trafficPercent: number;
  registeredAt: number;
  promotedAt: number | null;
  retiredAt: number | null;
  tags: string[];
}

export interface DeploymentStage {
  name: string;
  trafficPercent: number;
  durationHours: number;
  rollbackThresholdPercent: number;
  startedAt: number | null;
  completedAt: number | null;
  status: 'pending' | 'active' | 'completed' | 'rolled_back';
}

export interface DeploymentPlan {
  planId: string;
  challengerId: string;
  challengerVersion: string;
  championId: string | null;
  stages: DeploymentStage[];
  currentStageIndex: number;
  status: 'planned' | 'executing' | 'completed' | 'rolled_back' | 'cancelled';
  createdAt: number;
  completedAt: number | null;
}

export interface TrafficDecision {
  useChallenger: boolean;
  modelId: string;
  modelVersion: string;
  reason: string;
}

export interface RollbackEvent {
  timestamp: number;
  modelId: string;
  modelVersion: string;
  stage: string;
  reason: string;
  metrics: Record<string, number>;
}

// ============================================================================
// 冠军-挑战者管理器
// ============================================================================

export class ChampionChallengerManager {
  private registry: Map<string, ModelRegistryEntry> = new Map();
  private currentChampion: string | null = null;
  private activePlan: DeploymentPlan | null = null;
  private rollbackHistory: RollbackEvent[] = [];

  /**
   * 注册新模型
   */
  registerModel(entry: Omit<ModelRegistryEntry, 'status' | 'trafficPercent' | 'registeredAt' | 'promotedAt' | 'retiredAt'>): ModelRegistryEntry {
    const key = `${entry.modelId}:${entry.version}`;
    const fullEntry: ModelRegistryEntry = {
      ...entry,
      status: 'registered',
      trafficPercent: 0,
      registeredAt: Date.now(),
      promotedAt: null,
      retiredAt: null,
    };
    this.registry.set(key, fullEntry);
    return fullEntry;
  }

  /**
   * 创建部署计划
   */
  createDeploymentPlan(challengerId: string, challengerVersion: string): DeploymentPlan {
    const stages: DeploymentStage[] = [
      { name: 'shadow', trafficPercent: 0, durationHours: 24, rollbackThresholdPercent: 0, startedAt: null, completedAt: null, status: 'pending' },
      { name: 'canary', trafficPercent: 5, durationHours: 48, rollbackThresholdPercent: 5, startedAt: null, completedAt: null, status: 'pending' },
      { name: 'gray', trafficPercent: 20, durationHours: 72, rollbackThresholdPercent: 3, startedAt: null, completedAt: null, status: 'pending' },
      { name: 'half', trafficPercent: 50, durationHours: 48, rollbackThresholdPercent: 2, startedAt: null, completedAt: null, status: 'pending' },
      { name: 'full', trafficPercent: 100, durationHours: 0, rollbackThresholdPercent: 1, startedAt: null, completedAt: null, status: 'pending' },
    ];

    const plan: DeploymentPlan = {
      planId: `deploy_${Date.now()}`,
      challengerId,
      challengerVersion,
      championId: this.currentChampion,
      stages,
      currentStageIndex: 0,
      status: 'planned',
      createdAt: Date.now(),
      completedAt: null,
    };

    this.activePlan = plan;
    return plan;
  }

  /**
   * 推进部署阶段
   */
  advanceStage(): DeploymentPlan | null {
    if (!this.activePlan || this.activePlan.status !== 'executing') return null;

    const currentStage = this.activePlan.stages[this.activePlan.currentStageIndex];
    if (currentStage) {
      currentStage.completedAt = Date.now();
      currentStage.status = 'completed';
    }

    this.activePlan.currentStageIndex++;

    if (this.activePlan.currentStageIndex >= this.activePlan.stages.length) {
      // 部署完成，晋升为冠军
      this.activePlan.status = 'completed';
      this.activePlan.completedAt = Date.now();
      this.promoteToChampion(this.activePlan.challengerId, this.activePlan.challengerVersion);
      return this.activePlan;
    }

    // 激活下一阶段
    const nextStage = this.activePlan.stages[this.activePlan.currentStageIndex];
    nextStage.startedAt = Date.now();
    nextStage.status = 'active';

    // 更新流量
    const key = `${this.activePlan.challengerId}:${this.activePlan.challengerVersion}`;
    const entry = this.registry.get(key);
    if (entry) {
      entry.trafficPercent = nextStage.trafficPercent;
      entry.status = nextStage.name as ModelRegistryEntry['status'];
    }

    return this.activePlan;
  }

  /**
   * 开始执行部署计划
   */
  startDeployment(): DeploymentPlan | null {
    if (!this.activePlan || this.activePlan.status !== 'planned') return null;

    this.activePlan.status = 'executing';
    const firstStage = this.activePlan.stages[0];
    firstStage.startedAt = Date.now();
    firstStage.status = 'active';

    return this.activePlan;
  }

  /**
   * 流量路由决策
   */
  routeTraffic(requestId: string): TrafficDecision {
    if (!this.activePlan || this.activePlan.status !== 'executing') {
      // 无活跃部署，使用冠军
      if (this.currentChampion) {
        const champion = this.registry.get(this.currentChampion);
        return {
          useChallenger: false,
          modelId: champion?.modelId || '',
          modelVersion: champion?.version || '',
          reason: 'no_active_deployment',
        };
      }
      return { useChallenger: false, modelId: '', modelVersion: '', reason: 'no_model_available' };
    }

    const currentStage = this.activePlan.stages[this.activePlan.currentStageIndex];
    const trafficPercent = currentStage?.trafficPercent || 0;

    // 基于请求 ID 的确定性路由（一致性哈希）
    const hash = this.hashString(requestId);
    const useChallenger = (hash % 100) < trafficPercent;

    if (useChallenger) {
      return {
        useChallenger: true,
        modelId: this.activePlan.challengerId,
        modelVersion: this.activePlan.challengerVersion,
        reason: `canary_${currentStage.name}_${trafficPercent}%`,
      };
    }

    const champion = this.currentChampion ? this.registry.get(this.currentChampion) : null;
    return {
      useChallenger: false,
      modelId: champion?.modelId || '',
      modelVersion: champion?.version || '',
      reason: `champion_${currentStage.name}`,
    };
  }

  /**
   * 回滚
   */
  rollback(reason: string, metrics?: Record<string, number>): void {
    if (!this.activePlan) return;

    const currentStage = this.activePlan.stages[this.activePlan.currentStageIndex];

    this.rollbackHistory.push({
      timestamp: Date.now(),
      modelId: this.activePlan.challengerId,
      modelVersion: this.activePlan.challengerVersion,
      stage: currentStage?.name || 'unknown',
      reason,
      metrics: metrics || {},
    });

    // 标记回滚
    if (currentStage) currentStage.status = 'rolled_back';
    this.activePlan.status = 'rolled_back';

    // 更新模型状态
    const key = `${this.activePlan.challengerId}:${this.activePlan.challengerVersion}`;
    const entry = this.registry.get(key);
    if (entry) {
      entry.status = 'rolled_back';
      entry.trafficPercent = 0;
    }

    this.activePlan = null;
  }

  /**
   * 晋升为冠军
   */
  private promoteToChampion(modelId: string, version: string): void {
    // 退役旧冠军
    if (this.currentChampion) {
      const oldChampion = this.registry.get(this.currentChampion);
      if (oldChampion) {
        oldChampion.status = 'retired';
        oldChampion.retiredAt = Date.now();
        oldChampion.trafficPercent = 0;
      }
    }

    // 晋升新冠军
    const key = `${modelId}:${version}`;
    const newChampion = this.registry.get(key);
    if (newChampion) {
      newChampion.status = 'champion';
      newChampion.trafficPercent = 100;
      newChampion.promotedAt = Date.now();
    }

    this.currentChampion = key;
  }

  /**
   * 直接设置冠军（初始化用）
   */
  setChampion(modelId: string, version: string): void {
    this.promoteToChampion(modelId, version);
  }

  /**
   * 获取当前冠军
   */
  getChampion(): ModelRegistryEntry | null {
    return this.currentChampion ? this.registry.get(this.currentChampion) || null : null;
  }

  /**
   * 获取所有模型
   */
  getAllModels(): ModelRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * 获取活跃部署计划
   */
  getActivePlan(): DeploymentPlan | null {
    return this.activePlan;
  }

  /**
   * 获取回滚历史
   */
  getRollbackHistory(): RollbackEvent[] {
    return [...this.rollbackHistory];
  }

  /**
   * 字符串哈希（确定性路由）
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
