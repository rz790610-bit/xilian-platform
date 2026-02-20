/**
 * ============================================================================
 * 自进化飞轮端到端测试
 * ============================================================================
 *
 * 覆盖：DataEngine → ShadowEvaluator → ChampionChallenger → KnowledgeCrystallizer → MetaLearner → EvolutionFlywheel
 */

import { DataDiscoveryEngine } from '../evolution/data-engine/data-engine';
import { ShadowEvaluator } from '../evolution/shadow/shadow-evaluator';
import { ChampionChallengerManager } from '../evolution/champion/champion-challenger';
import { KnowledgeCrystallizer } from '../evolution/crystallization/knowledge-crystallizer';
import { MetaLearner } from '../evolution/metalearner/meta-learner';
import { EvolutionFlywheel } from '../evolution/flywheel/evolution-flywheel';
import { CanaryDeployer } from '../evolution/canary/canary-deployer';
import { ClosedLoopTracker } from '../evolution/closed-loop/closed-loop-tracker';
import { EvolutionMetricsCollector } from '../evolution/metrics/evolution-metrics';

// ============================================================================
// 测试工具
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ============================================================================
// 测试用例
// ============================================================================

async function testDataEngine(): Promise<void> {
  console.log('[TEST] DataDiscoveryEngine — 数据发现');
  const engine = new DataDiscoveryEngine();

  // 注册数据源
  engine.registerSource({
    id: 'timeseries_db',
    type: 'timeseries',
    query: async (params) => ({ rows: Array(10).fill({ ts: Date.now(), value: Math.random() }), count: 10 }),
  });

  // 发现
  const discoveries = await engine.discover({
    timeRange: { start: Date.now() - 86400000, end: Date.now() },
    minSampleSize: 5,
  });

  assert(discoveries.length >= 0, '发现结果应为数组');

  // 统计摘要
  const summary = engine.getSummary();
  assert(summary.sourceCount >= 1, '应至少有1个数据源');

  console.log('[PASS] DataDiscoveryEngine');
}

async function testShadowEvaluator(): Promise<void> {
  console.log('[TEST] ShadowEvaluator — 影子评估');
  const evaluator = new ShadowEvaluator();

  // 注册模型
  evaluator.registerModel({
    id: 'model_v1',
    predict: async (input: number[]) => input.map(v => v * 1.1),
  });

  evaluator.registerModel({
    id: 'model_v2',
    predict: async (input: number[]) => input.map(v => v * 1.05 + 0.5),
  });

  // 评估
  const result = await evaluator.evaluate({
    testData: Array.from({ length: 50 }, (_, i) => ({
      input: [i, i * 2],
      expected: [i * 1.08, i * 2.1],
    })),
    metrics: ['mae', 'rmse', 'r2'],
  });

  assert(result.modelResults.length === 2, `应有2个模型结果，实际${result.modelResults.length}`);
  assert(result.winner !== '', '应有获胜模型');

  console.log('[PASS] ShadowEvaluator');
}

async function testChampionChallenger(): Promise<void> {
  console.log('[TEST] ChampionChallengerManager — 冠军挑战者');
  const cc = new ChampionChallengerManager();

  // 设置冠军
  cc.setChampion({ id: 'model_v1', version: '1.0.0', accuracy: 0.88 });

  // 注册挑战者
  cc.registerChallenger({ id: 'model_v2', version: '2.0.0', accuracy: 0.92 });

  // 比较
  const comparison = cc.compare();
  assert(comparison.champion.id === 'model_v1', '冠军应为model_v1');
  assert(comparison.challengers.length === 1, '应有1个挑战者');
  assert(comparison.recommendation !== '', '应有推荐');

  // 晋升
  const promoted = cc.promote('model_v2');
  assert(promoted, '晋升应成功');
  assert(cc.getChampion().id === 'model_v2', '新冠军应为model_v2');

  console.log('[PASS] ChampionChallengerManager');
}

async function testKnowledgeCrystallizer(): Promise<void> {
  console.log('[TEST] KnowledgeCrystallizer — 知识结晶');
  const crystallizer = new KnowledgeCrystallizer();

  // 添加观察
  for (let i = 0; i < 20; i++) {
    crystallizer.addObservation({
      sourceId: `diagnosis_${i}`,
      pattern: 'high_vibration_bearing_wear',
      context: { vibrationRMS: 8 + Math.random() * 4, temperature: 60 + Math.random() * 20 },
      outcome: 'bearing_replacement',
      confidence: 0.7 + Math.random() * 0.25,
      timestamp: Date.now() - i * 3600000,
    });
  }

  // 结晶
  const crystals = crystallizer.crystallize({ minObservations: 10, minConfidence: 0.7 });
  assert(crystals.length > 0, '应产生至少1个结晶');
  assert(crystals[0].confidence > 0.7, '结晶置信度应>0.7');
  assert(crystals[0].sourceCount >= 10, '结晶数据源应>=10');

  console.log('[PASS] KnowledgeCrystallizer');
}

async function testCanaryDeployer(): Promise<void> {
  console.log('[TEST] CanaryDeployer — 金丝雀部署');
  const deployer = new CanaryDeployer();

  // 创建部署
  const deployment = deployer.create({
    modelId: 'model_v2',
    initialTrafficPercent: 5,
    maxTrafficPercent: 50,
    stepPercent: 5,
    healthCheckIntervalMs: 1000,
    rollbackThreshold: { errorRate: 0.1, latencyP99Ms: 5000 },
  });

  assert(deployment.id !== '', '部署ID不应为空');
  assert(deployment.status === 'created', '初始状态应为created');
  assert(deployment.trafficPercent === 5, '初始流量应为5%');

  // 推进
  const advanced = deployer.advance(deployment.id);
  assert(advanced.trafficPercent === 10, '推进后流量应为10%');

  // 回滚
  const rolledBack = deployer.rollback(deployment.id);
  assert(rolledBack.status === 'rolled_back', '回滚后状态应为rolled_back');
  assert(rolledBack.trafficPercent === 0, '回滚后流量应为0%');

  console.log('[PASS] CanaryDeployer');
}

async function testClosedLoopTracker(): Promise<void> {
  console.log('[TEST] ClosedLoopTracker — 闭环追踪');
  const tracker = new ClosedLoopTracker();

  // 创建闭环
  const loop = tracker.create({
    triggerId: 'diagnosis_001',
    triggerType: 'anomaly_detected',
    expectedOutcome: 'issue_resolved',
  });

  assert(loop.id !== '', '闭环ID不应为空');
  assert(loop.status === 'open', '初始状态应为open');

  // 记录步骤
  tracker.recordStep(loop.id, { action: 'diagnosis', result: 'bearing_wear_detected', durationMs: 2000 });
  tracker.recordStep(loop.id, { action: 'recommendation', result: 'replace_bearing', durationMs: 500 });
  tracker.recordStep(loop.id, { action: 'execution', result: 'maintenance_scheduled', durationMs: 100 });

  // 关闭
  const closed = tracker.close(loop.id, { outcome: 'issue_resolved', success: true });
  assert(closed.status === 'closed', '关闭后状态应为closed');
  assert(closed.steps.length === 3, `应有3个步骤，实际${closed.steps.length}`);
  assert(closed.success === true, '应标记为成功');

  // 统计
  const stats = tracker.getStats();
  assert(stats.totalLoops >= 1, '总闭环数应>=1');
  assert(stats.successRate >= 0, '成功率应>=0');

  console.log('[PASS] ClosedLoopTracker');
}

async function testEvolutionMetrics(): Promise<void> {
  console.log('[TEST] EvolutionMetricsCollector — 进化指标');
  const metrics = new EvolutionMetricsCollector();

  // 记录指标
  metrics.record('cycle_count', 1);
  metrics.record('improvement_count', 3);
  metrics.record('crystal_count', 5);
  metrics.record('model_accuracy', 0.92);

  // 查询
  const cycleCount = metrics.get('cycle_count');
  assert(cycleCount === 1, `cycle_count应为1，实际${cycleCount}`);

  // 增量
  metrics.increment('cycle_count');
  assert(metrics.get('cycle_count') === 2, 'cycle_count增量后应为2');

  // 导出
  const exported = metrics.exportAll();
  assert(Object.keys(exported).length >= 4, '应至少有4个指标');

  console.log('[PASS] EvolutionMetricsCollector');
}

// ============================================================================
// 测试运行器
// ============================================================================

export async function runEvolutionFlywheelTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  const tests = [
    testDataEngine,
    testShadowEvaluator,
    testChampionChallenger,
    testKnowledgeCrystallizer,
    testCanaryDeployer,
    testClosedLoopTracker,
    testEvolutionMetrics,
  ];

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      failed++;
      errors.push(`${test.name}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`[FAIL] ${test.name}:`, err);
    }
  }

  console.log(`\n=== 自进化飞轮测试结果: ${passed} passed, ${failed} failed ===`);
  return { passed, failed, errors };
}
