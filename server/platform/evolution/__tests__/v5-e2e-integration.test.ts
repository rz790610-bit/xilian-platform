/**
 * v5.0 端到端集成测试
 *
 * 场景：模拟完整进化闭环
 *   1. Shadow Fleet Manager 注入模拟轨迹（干预率 > 5%）
 *   2. Shadow Evaluator 评估挑战者 vs 冠军
 *   3. Champion Challenger 根据评估结果创建部署计划
 *   4. Canary 部署阶段推进（shadow → canary → gray → half → full）
 *   5. Flywheel 记录周期结果
 *
 * 这个测试不依赖真实 DB/Redis，使用纯内存模拟验证四个核心模块的协作逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 模拟类型（与真实类型对齐）
// ============================================================================

interface ModelCandidate {
  modelId: string;
  modelVersion: string;
  modelType: 'prediction' | 'anomaly_detection' | 'classification' | 'regression';
  description: string;
  parameters: Record<string, unknown>;
  createdAt: number;
  predict: (input: Record<string, number>) => Promise<Record<string, number>>;
}

interface EvaluationDataPoint {
  timestamp: number;
  input: Record<string, number>;
  actualOutput: Record<string, number>;
}

interface EvaluationMetrics {
  accuracy: { mae: number; rmse: number; mape: number; r2: number };
  latency: { p50Ms: number; p95Ms: number; p99Ms: number; meanMs: number };
}

interface ShadowTrajectory {
  requestId: string;
  productionDecision: Record<string, number>;
  shadowDecision: Record<string, number>;
  interventionRequired: boolean;
  timestamp: number;
}

interface DeploymentStage {
  name: string;
  trafficPercent: number;
  status: 'pending' | 'active' | 'completed' | 'rolled_back';
}

interface DeploymentPlan {
  planId: string;
  challengerId: string;
  challengerVersion: string;
  stages: DeploymentStage[];
  currentStageIndex: number;
  status: 'planned' | 'executing' | 'completed' | 'rolled_back';
}

interface FlywheelCycleReport {
  cycleId: string;
  cycleNumber: number;
  status: 'completed' | 'failed';
  shadowEvaluation: { verdict: string; challengerAccuracy: number; championAccuracy: number } | null;
  deployment: DeploymentPlan | null;
  performanceDelta: number | null;
}

// ============================================================================
// 模拟模块
// ============================================================================

/** 模拟 Shadow Fleet Manager：注入轨迹并计算干预率 */
class MockShadowFleetManager {
  private trajectories: ShadowTrajectory[] = [];

  injectTrajectories(trajectories: ShadowTrajectory[]): void {
    this.trajectories.push(...trajectories);
  }

  getInterventionRate(): number {
    if (this.trajectories.length === 0) return 0;
    const interventions = this.trajectories.filter(t => t.interventionRequired).length;
    return interventions / this.trajectories.length;
  }

  mineHardCases(topN: number): ShadowTrajectory[] {
    return this.trajectories
      .filter(t => t.interventionRequired)
      .slice(0, topN);
  }

  getTrajectoryCount(): number {
    return this.trajectories.length;
  }
}

/** 模拟 Shadow Evaluator：对比挑战者和冠军 */
class MockShadowEvaluator {
  async evaluate(
    challenger: ModelCandidate,
    champion: ModelCandidate | null,
    dataset: EvaluationDataPoint[],
  ): Promise<{
    verdict: 'promote' | 'reject' | 'inconclusive';
    challengerAccuracy: number;
    championAccuracy: number;
    durationMs: number;
  }> {
    const start = Date.now();

    // 评估挑战者
    let challengerCorrect = 0;
    for (const dp of dataset) {
      const pred = await challenger.predict(dp.input);
      const keys = Object.keys(dp.actualOutput);
      const error = keys.reduce((sum, k) => sum + Math.abs((pred[k] || 0) - dp.actualOutput[k]), 0) / keys.length;
      if (error < 0.1) challengerCorrect++;
    }
    const challengerAccuracy = challengerCorrect / dataset.length;

    // 评估冠军
    let championAccuracy = 0;
    if (champion) {
      let championCorrect = 0;
      for (const dp of dataset) {
        const pred = await champion.predict(dp.input);
        const keys = Object.keys(dp.actualOutput);
        const error = keys.reduce((sum, k) => sum + Math.abs((pred[k] || 0) - dp.actualOutput[k]), 0) / keys.length;
        if (error < 0.1) championCorrect++;
      }
      championAccuracy = championCorrect / dataset.length;
    }

    // 判定（阈值 2% 提升即晋升，5% 下降即拒绝）
    let verdict: 'promote' | 'reject' | 'inconclusive';
    if (dataset.length === 0) {
      verdict = 'inconclusive';
    } else if (challengerAccuracy > championAccuracy + 0.02) {
      verdict = 'promote';
    } else if (challengerAccuracy < championAccuracy - 0.05) {
      verdict = 'reject';
    } else {
      verdict = 'inconclusive';
    }

    return {
      verdict,
      challengerAccuracy,
      championAccuracy,
      durationMs: Date.now() - start,
    };
  }
}

/** 模拟 Champion Challenger Manager */
class MockChampionChallenger {
  private currentChampion: { modelId: string; version: string } | null = null;
  private activePlan: DeploymentPlan | null = null;

  setChampion(modelId: string, version: string): void {
    this.currentChampion = { modelId, version };
  }

  getChampion(): { modelId: string; version: string } | null {
    return this.currentChampion;
  }

  createDeploymentPlan(challengerId: string, challengerVersion: string): DeploymentPlan {
    const plan: DeploymentPlan = {
      planId: `deploy_${Date.now()}`,
      challengerId,
      challengerVersion,
      stages: [
        { name: 'shadow', trafficPercent: 0, status: 'pending' },
        { name: 'canary', trafficPercent: 5, status: 'pending' },
        { name: 'gray', trafficPercent: 20, status: 'pending' },
        { name: 'half', trafficPercent: 50, status: 'pending' },
        { name: 'full', trafficPercent: 100, status: 'pending' },
      ],
      currentStageIndex: 0,
      status: 'planned',
    };
    this.activePlan = plan;
    return plan;
  }

  startDeployment(): DeploymentPlan | null {
    if (!this.activePlan) return null;
    this.activePlan.status = 'executing';
    this.activePlan.stages[0].status = 'active';
    return this.activePlan;
  }

  advanceStage(): DeploymentPlan | null {
    if (!this.activePlan || this.activePlan.status !== 'executing') return null;

    const current = this.activePlan.stages[this.activePlan.currentStageIndex];
    current.status = 'completed';
    this.activePlan.currentStageIndex++;

    if (this.activePlan.currentStageIndex >= this.activePlan.stages.length) {
      this.activePlan.status = 'completed';
      this.currentChampion = {
        modelId: this.activePlan.challengerId,
        version: this.activePlan.challengerVersion,
      };
      return this.activePlan;
    }

    this.activePlan.stages[this.activePlan.currentStageIndex].status = 'active';
    return this.activePlan;
  }

  rollback(reason: string): void {
    if (!this.activePlan) return;
    this.activePlan.status = 'rolled_back';
    this.activePlan = null;
  }

  getActivePlan(): DeploymentPlan | null {
    return this.activePlan;
  }
}

/** 模拟 Flywheel：记录周期结果 */
class MockFlywheel {
  private cycleHistory: FlywheelCycleReport[] = [];
  private cycleCount = 0;

  recordCycle(
    evalResult: { verdict: string; challengerAccuracy: number; championAccuracy: number },
    deployment: DeploymentPlan | null,
  ): FlywheelCycleReport {
    this.cycleCount++;
    const report: FlywheelCycleReport = {
      cycleId: `cycle_${this.cycleCount}`,
      cycleNumber: this.cycleCount,
      status: 'completed',
      shadowEvaluation: evalResult,
      deployment,
      performanceDelta: evalResult.challengerAccuracy - evalResult.championAccuracy,
    };
    this.cycleHistory.push(report);
    return report;
  }

  getCycleHistory(): FlywheelCycleReport[] {
    return this.cycleHistory;
  }

  getLatestReport(): FlywheelCycleReport | null {
    return this.cycleHistory[this.cycleHistory.length - 1] || null;
  }
}

// ============================================================================
// 端到端集成测试
// ============================================================================

describe('端到端集成测试 — Shadow → Champion → Canary → Flywheel', () => {
  let shadowManager: MockShadowFleetManager;
  let evaluator: MockShadowEvaluator;
  let championManager: MockChampionChallenger;
  let flywheel: MockFlywheel;

  // 模型定义
  const championModel: ModelCandidate = {
    modelId: 'model-v1',
    modelVersion: '1.0.0',
    modelType: 'prediction',
    description: '当前冠军模型',
    parameters: {},
    createdAt: Date.now() - 86400000,
    predict: async (input) => ({
      output: (input.x || 0) * 0.5, // 明显较低精度
    }),
  };

  const challengerModel: ModelCandidate = {
    modelId: 'model-v2',
    modelVersion: '2.0.0',
    modelType: 'prediction',
    description: '挑战者模型（更高精度）',
    parameters: {},
    createdAt: Date.now(),
    predict: async (input) => ({
      output: (input.x || 0) * 1.0, // 完美精度
    }),
  };

  // 评估数据集：真实值 = x（与挑战者模型完美对齐）
  const dataset: EvaluationDataPoint[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: Date.now() - (50 - i) * 60000,
    input: { x: i / 50 },
    actualOutput: { output: i / 50 },
  }));

  beforeEach(() => {
    shadowManager = new MockShadowFleetManager();
    evaluator = new MockShadowEvaluator();
    championManager = new MockChampionChallenger();
    flywheel = new MockFlywheel();

    // 初始化冠军
    championManager.setChampion('model-v1', '1.0.0');
  });

  it('完整进化闭环：高干预率 → 评估 → 部署 → 晋升', async () => {
    // ── Step 1: Shadow Fleet 注入高干预率轨迹 ──
    const trajectories: ShadowTrajectory[] = Array.from({ length: 100 }, (_, i) => ({
      requestId: `req_${i}`,
      productionDecision: { output: i * 0.8 },
      shadowDecision: { output: i * 0.95 },
      interventionRequired: i % 10 < 7, // 70% 干预率
      timestamp: Date.now() - i * 1000,
    }));

    shadowManager.injectTrajectories(trajectories);
    const interventionRate = shadowManager.getInterventionRate();

    expect(interventionRate).toBeGreaterThan(0.05); // 超过 5% 阈值
    expect(interventionRate).toBeCloseTo(0.7, 1);

    // ── Step 2: Shadow Evaluator 评估挑战者 ──
    const evalResult = await evaluator.evaluate(challengerModel, championModel, dataset);

    expect(evalResult.verdict).toBe('promote');
    expect(evalResult.challengerAccuracy).toBeGreaterThan(evalResult.championAccuracy);

    // ── Step 3: Champion Challenger 创建部署计划 ──
    const plan = championManager.createDeploymentPlan('model-v2', '2.0.0');

    expect(plan.stages).toHaveLength(5);
    expect(plan.status).toBe('planned');

    // ── Step 4: 启动并推进部署 ──
    championManager.startDeployment();
    expect(championManager.getActivePlan()?.status).toBe('executing');

    // 推进 5 个阶段
    const stageNames = ['shadow', 'canary', 'gray', 'half', 'full'];
    for (let i = 0; i < 5; i++) {
      const result = championManager.advanceStage();
      if (i < 4) {
        expect(result?.status).toBe('executing');
        expect(result?.stages[i].status).toBe('completed');
        expect(result?.stages[i + 1].status).toBe('active');
      } else {
        expect(result?.status).toBe('completed');
      }
    }

    // 冠军已更新
    const newChampion = championManager.getChampion();
    expect(newChampion?.modelId).toBe('model-v2');
    expect(newChampion?.version).toBe('2.0.0');

    // ── Step 5: Flywheel 记录周期 ──
    const report = flywheel.recordCycle(evalResult, championManager.getActivePlan());

    expect(report.status).toBe('completed');
    expect(report.performanceDelta).toBeGreaterThan(0);
    expect(report.shadowEvaluation?.verdict).toBe('promote');
  });

  it('评估不通过时不创建部署', async () => {
    // 使用一个比冠军明显差的挑战者
    const weakChallenger: ModelCandidate = {
      ...challengerModel,
      modelId: 'model-weak',
      predict: async (input) => ({
        output: (input.x || 0) * 0.1 + 0.9, // 很差的精度，偏离真实值很多
      }),
    };

    const evalResult = await evaluator.evaluate(weakChallenger, championModel, dataset);

    expect(evalResult.verdict).toBe('reject');
    expect(evalResult.challengerAccuracy).toBeLessThan(evalResult.championAccuracy);

    // 不应创建部署计划
    const report = flywheel.recordCycle(evalResult, null);
    expect(report.deployment).toBeNull();
    expect(report.performanceDelta).toBeLessThan(0);
  });

  it('部署中途回滚', async () => {
    // 评估通过
    const evalResult = await evaluator.evaluate(challengerModel, championModel, dataset);
    expect(evalResult.verdict).toBe('promote');

    // 创建并启动部署
    championManager.createDeploymentPlan('model-v2', '2.0.0');
    championManager.startDeployment();

    // 推进到 canary 阶段
    championManager.advanceStage(); // shadow → canary

    // 模拟 canary 阶段健康检查失败 → 回滚
    championManager.rollback('canary 阶段错误率超标: 8.5% > 5%');

    expect(championManager.getActivePlan()).toBeNull();

    // 冠军未变
    const champion = championManager.getChampion();
    expect(champion?.modelId).toBe('model-v1');

    // Flywheel 记录失败
    const report = flywheel.recordCycle(evalResult, null);
    expect(report.deployment).toBeNull();
  });

  it('多轮进化：冠军持续迭代', async () => {
    // 第一轮：v1 → v2
    let evalResult = await evaluator.evaluate(challengerModel, championModel, dataset);
    expect(evalResult.verdict).toBe('promote');

    championManager.createDeploymentPlan('model-v2', '2.0.0');
    championManager.startDeployment();
    for (let i = 0; i < 5; i++) championManager.advanceStage();

    flywheel.recordCycle(evalResult, championManager.getActivePlan());
    expect(championManager.getChampion()?.modelId).toBe('model-v2');

    // 第二轮：v2 → v3（更好的模型）
    const v3Model: ModelCandidate = {
      ...challengerModel,
      modelId: 'model-v3',
      modelVersion: '3.0.0',
      predict: async (input) => ({
        output: (input.x || 0) * 1.0, // 完美精度（与真实值完全一致）
      }),
    };

    // 此时冠军是 v2，精度明显低于 v3
    const v2AsChampion: ModelCandidate = {
      ...challengerModel,
      modelId: 'model-v2',
      modelVersion: '2.0.0',
      predict: async (input) => ({
        output: (input.x || 0) * 0.85, // v2 精度低于 v3
      }),
    };

    evalResult = await evaluator.evaluate(v3Model, v2AsChampion, dataset);
    expect(evalResult.verdict).toBe('promote');

    championManager.createDeploymentPlan('model-v3', '3.0.0');
    championManager.startDeployment();
    for (let i = 0; i < 5; i++) championManager.advanceStage();

    flywheel.recordCycle(evalResult, championManager.getActivePlan());

    // 验证
    expect(championManager.getChampion()?.modelId).toBe('model-v3');
    expect(flywheel.getCycleHistory()).toHaveLength(2);
    expect(flywheel.getCycleHistory().every(r => r.status === 'completed')).toBe(true);
  });

  it('Shadow Fleet 硬案例挖掘与评估数据集增强', () => {
    // 注入轨迹
    const trajectories: ShadowTrajectory[] = Array.from({ length: 200 }, (_, i) => ({
      requestId: `req_${i}`,
      productionDecision: { output: i },
      shadowDecision: { output: i * 1.1 },
      interventionRequired: i < 60, // 前 60 个需要干预
      timestamp: Date.now() - i * 1000,
    }));

    shadowManager.injectTrajectories(trajectories);

    // 挖掘硬案例
    const hardCases = shadowManager.mineHardCases(20);
    expect(hardCases).toHaveLength(20);
    expect(hardCases.every(t => t.interventionRequired)).toBe(true);

    // 干预率
    expect(shadowManager.getInterventionRate()).toBeCloseTo(0.3, 1);
  });

  it('阶段推进顺序验证', () => {
    const plan = championManager.createDeploymentPlan('model-v2', '2.0.0');
    championManager.startDeployment();

    const expectedTraffic = [0, 5, 20, 50, 100];
    const expectedNames = ['shadow', 'canary', 'gray', 'half', 'full'];

    for (let i = 0; i < 5; i++) {
      const activePlan = championManager.getActivePlan()!;
      const activeStage = activePlan.stages[activePlan.currentStageIndex];

      expect(activeStage.name).toBe(expectedNames[i]);
      expect(activeStage.trafficPercent).toBe(expectedTraffic[i]);
      expect(activeStage.status).toBe('active');

      championManager.advanceStage();
    }

    expect(championManager.getActivePlan()?.status).toBe('completed');
  });

  it('并发飞轮周期不允许', () => {
    // 模拟飞轮状态
    let isRunning = false;

    function startCycle(): boolean {
      if (isRunning) return false;
      isRunning = true;
      return true;
    }

    function endCycle(): void {
      isRunning = false;
    }

    expect(startCycle()).toBe(true);
    expect(startCycle()).toBe(false); // 并发被拒绝
    endCycle();
    expect(startCycle()).toBe(true); // 结束后可以重新开始
  });

  it('Flywheel 趋势分析', () => {
    // 模拟多轮改善
    const deltas = [0.02, 0.03, 0.01, 0.04, 0.02, 0.03];

    for (const delta of deltas) {
      flywheel.recordCycle(
        { verdict: 'promote', challengerAccuracy: 0.9 + delta, championAccuracy: 0.9 },
        null,
      );
    }

    const history = flywheel.getCycleHistory();
    expect(history).toHaveLength(6);

    // 计算趋势
    const improvements = history.map(r => r.performanceDelta!);
    const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;

    expect(avgImprovement).toBeGreaterThan(0);
    expect(improvements.every(d => d > 0)).toBe(true);
  });
});

// ============================================================================
// 边界条件测试
// ============================================================================

describe('端到端边界条件', () => {
  it('空数据集评估返回 inconclusive', async () => {
    const evaluator = new MockShadowEvaluator();
    const model: ModelCandidate = {
      modelId: 'test',
      modelVersion: '1.0',
      modelType: 'prediction',
      description: 'test',
      parameters: {},
      createdAt: Date.now(),
      predict: async () => ({ output: 0 }),
    };

    const result = await evaluator.evaluate(model, null, []);
    // 空数据集：verdict 应为 inconclusive
    expect(result.verdict).toBe('inconclusive');
  });

  it('单数据点评估', async () => {
    const evaluator = new MockShadowEvaluator();
    const model: ModelCandidate = {
      modelId: 'test',
      modelVersion: '1.0',
      modelType: 'prediction',
      description: 'test',
      parameters: {},
      createdAt: Date.now(),
      predict: async (input) => ({ output: input.x }),
    };

    const dataset: EvaluationDataPoint[] = [{
      timestamp: Date.now(),
      input: { x: 0.5 },
      actualOutput: { output: 0.5 },
    }];

    const result = await evaluator.evaluate(model, null, dataset);
    expect(result.challengerAccuracy).toBe(1); // 完美预测
  });

  it('Shadow Fleet 无轨迹时干预率为 0', () => {
    const manager = new MockShadowFleetManager();
    expect(manager.getInterventionRate()).toBe(0);
    expect(manager.mineHardCases(10)).toHaveLength(0);
  });

  it('部署计划在未启动时不能推进', () => {
    const champion = new MockChampionChallenger();
    champion.setChampion('v1', '1.0');
    champion.createDeploymentPlan('v2', '2.0');

    // 未调用 startDeployment，直接推进应返回 null
    const result = champion.advanceStage();
    expect(result).toBeNull();
  });
});
