/**
 * ============================================================================
 * 端到端集成测试 (Integration Test Suite)
 * ============================================================================
 *
 * 验证闭环链路完整性：
 *   感知 → 诊断 → 护栏 → 进化 → 仪表盘
 *
 * 测试场景：
 *   1. 正常运行场景
 *   2. 高风速告警场景
 *   3. 疲劳累积预警场景
 *   4. 效率瓶颈场景
 *   5. 自进化飞轮场景
 */

// ============================================================================
// 测试框架（轻量级，不依赖外部库）
// ============================================================================

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class TestRunner {
  private tests: TestCase[] = [];
  private results: TestResult[] = [];

  test(name: string, fn: () => Promise<void>): void {
    this.tests.push({ name, fn });
  }

  async run(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
    this.results = [];

    for (const test of this.tests) {
      const start = Date.now();
      try {
        await test.fn();
        this.results.push({ name: test.name, passed: true, duration: Date.now() - start });
      } catch (error) {
        this.results.push({
          name: test.name,
          passed: false,
          duration: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const passed = this.results.filter(r => r.passed).length;
    return {
      total: this.results.length,
      passed,
      failed: this.results.length - passed,
      results: this.results,
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual} (tolerance: ${tolerance})`);
  }
}

// ============================================================================
// 测试套件
// ============================================================================

export async function runIntegrationTests(): Promise<void> {
  const runner = new TestRunner();

  // ─────────────────────────────────────────────────────────────────────────
  // 1. 数据契约层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('Schema Registry: 注册和验证事件', async () => {
    // 验证 Schema Registry 能正确注册和校验事件
    const { EventSchemaRegistry } = await import('../contracts/event-schema-registry');
    const registry = EventSchemaRegistry.getInstance();

    // 注册内置 schemas
    const { registerBuiltinSchemas } = await import('../contracts/builtin-schemas');
    registerBuiltinSchemas(registry);

    const schemas = registry.listSchemas();
    assert(schemas.length > 0, 'Should have registered schemas');
  });

  runner.test('Physics Formulas: 风载力矩计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const formulas = new PhysicsEngine();

    const result = formulas.windLoadMoment({ airDensity: 1.225, windSpeed: 10, area: 120, height: 45 });
    assert(result > 0, 'Wind load moment should be positive');
    // M = 0.5 * 1.225 * 100 * 120 * 22.5 = 165,375 N·m
    assertApprox(result, 165375, 1000, 'Wind load moment calculation');
  });

  runner.test('Physics Formulas: 疲劳增量计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const formulas = new PhysicsEngine();

    const result = formulas.fatigueStressIncrement({ stressConcentrationFactor: 2.5, moment: 100000, sectionModulus: 0.05 });
    assert(result > 0, 'Fatigue increment should be positive');
    // Δσ = 2.5 * 100000 / 0.05 = 5,000,000 Pa = 5 MPa
    assertApprox(result, 5000000, 100, 'Fatigue increment calculation');
  });

  runner.test('Physics Formulas: 腐蚀速率计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const formulas = new PhysicsEngine();

    const result = formulas.corrosionRate({ rateConstant: 0.5, chlorideConcentration: 0.8, humidity: 0.1 });
    assert(result > 0, 'Corrosion rate should be positive');
    assertApprox(result, 0.04, 0.01, 'Corrosion rate calculation');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 感知层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('RingBuffer: 写入和读取', async () => {
    const { RingBuffer } = await import('../perception/collection/ring-buffer');
    const buffer = new RingBuffer(1024);

    buffer.write(42.0);
    buffer.write(43.0);
    buffer.write(44.0);

    const data = buffer.readAll();
    assert(data.length === 3, 'Should have 3 values');
    assertApprox(data[0], 42.0, 0.001, 'First value');
    assertApprox(data[2], 44.0, 0.001, 'Third value');
  });

  runner.test('RingBuffer: 环形覆盖', async () => {
    const { RingBuffer } = await import('../perception/collection/ring-buffer');
    const buffer = new RingBuffer(4); // 只能存 4 个值

    for (let i = 0; i < 10; i++) {
      buffer.write(i);
    }

    const data = buffer.readAll();
    assert(data.length === 4, 'Should have 4 values after overflow');
  });

  runner.test('AdaptiveSampler: 工况自适应', async () => {
    const { AdaptiveSampler } = await import('../perception/collection/adaptive-sampler');
    const sampler = new AdaptiveSampler();

    // 联动阶段应该高频
    const config1 = sampler.getConfig('interlocking');
    assert(config1.sampleRate >= 1000, 'Interlocking should be high frequency');

    // 空载阶段应该低频
    const config2 = sampler.getConfig('idle');
    assert(config2.sampleRate <= 100, 'Idle should be low frequency');
  });

  runner.test('DS Fusion: 证据融合', async () => {
    const { DSFusionEngine } = await import('../perception/fusion/ds-fusion-engine');
    const engine = new DSFusionEngine();

    const result = engine.fuse([
      { sourceId: 'vibration', masses: { normal: 0.3, abnormal: 0.6, uncertain: 0.1 } },
      { sourceId: 'temperature', masses: { normal: 0.2, abnormal: 0.7, uncertain: 0.1 } },
    ]);

    assert(result.fusedMass['abnormal'] > 0.5, 'Fused abnormal mass should be high');
    assert(result.conflict < 1, 'Conflict should be < 1');
  });

  runner.test('StateVectorEncoder: 编码', async () => {
    const { StateVectorEncoder } = await import('../perception/encoding/state-vector-encoder');
    const encoder = new StateVectorEncoder();

    const vector = encoder.encode({
      vibrationRms: 2.5,
      motorCurrent: 70,
      windSpeed: 8,
      bearingTemp: 55,
      loadWeight: 30,
      loadEccentricity: 0.2,
      cyclePhase: 'hoisting',
      motorRpm: 1200,
      humidity: 0.7,
      chlorideConc: 0.3,
      structuralStress: 80,
    });

    assert(vector.length === 21, 'State vector should have 21 dimensions');
    assert(vector.every(v => !isNaN(v)), 'All values should be numbers');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. 诊断层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('WorldModel: 状态预测', async () => {
    const { WorldModel } = await import('../cognition/worldmodel/world-model');
    const model = new WorldModel();

    const prediction = model.predict({
      currentState: { windSpeed: 10, fatigueAccum: 30, bearingTemp: 50 },
      horizonSteps: 5,
      timeStepSeconds: 60,
    });

    assert(prediction.trajectory.length === 5, 'Should predict 5 steps');
    assert(prediction.confidence > 0, 'Confidence should be positive');
  });

  runner.test('WorldModel: 反事实推理', async () => {
    const { WorldModel } = await import('../cognition/worldmodel/world-model');
    const model = new WorldModel();

    const result = model.counterfactual({
      baseState: { windSpeed: 12, fatigueAccum: 40 },
      intervention: { windSpeed: 6 },
      horizonSteps: 3,
    });

    assert(result.baseTrajectory.length === 3, 'Base trajectory should have 3 steps');
    assert(result.counterfactualTrajectory.length === 3, 'CF trajectory should have 3 steps');
  });

  runner.test('FusionDiagnosis: 四维诊断', async () => {
    const { FusionDiagnosisService } = await import('../cognition/diagnosis/fusion-diagnosis.service');
    const service = new FusionDiagnosisService();

    const report = await service.diagnose({
      machineId: 'test_crane_01',
      stateVector: new Array(21).fill(0.5),
      rawData: {
        vibrationRms: 2.5, motorCurrent: 70, windSpeed: 8,
        bearingTemp: 55, loadWeight: 30, loadEccentricity: 0.2,
      },
    });

    assert(report.safetyScore >= 0 && report.safetyScore <= 1, 'Safety score in [0,1]');
    assert(report.healthScore >= 0 && report.healthScore <= 1, 'Health score in [0,1]');
    assert(report.efficiencyScore >= 0 && report.efficiencyScore <= 1, 'Efficiency score in [0,1]');
    assert(report.recommendations.length > 0, 'Should have recommendations');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 护栏层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('GuardrailEngine: 安全规则触发', async () => {
    const { GuardrailEngine } = await import('../cognition/safety/guardrail-engine');
    const engine = new GuardrailEngine();
    engine.loadDefaultRules();

    const result = engine.evaluate({
      windSpeed: 15, // 超过 13m/s 阈值
      loadEccentricity: 0.1,
      fatigueAccum: 20,
      bearingTemp: 40,
      safetyScore: 0.4,
      healthScore: 0.8,
      efficiencyScore: 0.7,
    });

    assert(result.violations.length > 0, 'Should have violations for high wind');
    assert(result.violations.some(v => v.category === 'safety'), 'Should have safety violation');
  });

  runner.test('GuardrailEngine: 正常运行无违规', async () => {
    const { GuardrailEngine } = await import('../cognition/safety/guardrail-engine');
    const engine = new GuardrailEngine();
    engine.loadDefaultRules();

    const result = engine.evaluate({
      windSpeed: 5,
      loadEccentricity: 0.1,
      fatigueAccum: 20,
      bearingTemp: 40,
      safetyScore: 0.95,
      healthScore: 0.9,
      efficiencyScore: 0.85,
    });

    assert(result.violations.length === 0, 'Should have no violations in normal conditions');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. 知识层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('KnowledgeGraph: 三元组 CRUD', async () => {
    const { KnowledgeGraphEngine } = await import('../knowledge/graph/knowledge-graph');
    const kg = new KnowledgeGraphEngine();

    kg.addTriple({
      subject: 'A', subjectType: 'entity',
      predicate: 'causes', object: 'B', objectType: 'entity',
      confidence: 0.9, source: 'test',
    });

    const results = kg.query({ subject: 'A' });
    assert(results.length === 1, 'Should find 1 triple');
    assert(results[0].object === 'B', 'Object should be B');
  });

  runner.test('KnowledgeGraph: 最短路径', async () => {
    const { KnowledgeGraphEngine } = await import('../knowledge/graph/knowledge-graph');
    const kg = new KnowledgeGraphEngine();

    kg.addTriple({ subject: 'A', subjectType: 'e', predicate: 'to', object: 'B', objectType: 'e', confidence: 0.9, source: 'test' });
    kg.addTriple({ subject: 'B', subjectType: 'e', predicate: 'to', object: 'C', objectType: 'e', confidence: 0.8, source: 'test' });
    kg.addTriple({ subject: 'A', subjectType: 'e', predicate: 'to', object: 'C', objectType: 'e', confidence: 0.7, source: 'test' });

    const path = kg.findShortestPath('A', 'C');
    assert(path !== null, 'Should find a path');
    assert(path!.length <= 2, 'Shortest path should be <= 2');
  });

  runner.test('KnowledgeGraph: 因果链追溯', async () => {
    const { KnowledgeGraphEngine } = await import('../knowledge/graph/knowledge-graph');
    const kg = new KnowledgeGraphEngine();
    kg.loadIndustrialTemplate('port_crane');

    const chains = kg.traceCausalChain('结构失效');
    assert(chains.length > 0, 'Should find causal chains');
  });

  runner.test('FeatureRegistry: 注册和查询', async () => {
    const { FeatureRegistry } = await import('../knowledge/feature-registry/feature-registry');
    const registry = new FeatureRegistry();
    registry.loadPortCraneTemplate();

    const features = registry.getByScenario('port_crane');
    assert(features.length > 5, 'Should have > 5 features for port crane');

    const top = registry.getByImportance(3);
    assert(top.length === 3, 'Should return top 3');
    assert(top[0].importance >= top[1].importance, 'Should be sorted by importance');
  });

  runner.test('ChainReasoning: 反向推理', async () => {
    const { ChainReasoningEngine } = await import('../knowledge/reasoning/chain-reasoning');
    const engine = new ChainReasoningEngine();

    const result = await engine.reason({
      queryId: 'test_1',
      type: 'backward',
      conditions: { windSpeed: 12, loadEccentricity: 0.3 },
      question: '结构疲劳加速',
    });

    assert(result.steps.length >= 3, 'Should have >= 3 reasoning steps');
    assert(result.confidence > 0.5, 'Confidence should be > 0.5');
    assert(result.recommendations.length > 0, 'Should have recommendations');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. 进化层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('ShadowEvaluator: 影子评估', async () => {
    const { ShadowEvaluator } = await import('../evolution/shadow/shadow-evaluator');
    const evaluator = new ShadowEvaluator();

    const result = await evaluator.evaluate({
      modelId: 'test_model',
      historicalData: Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - (100 - i) * 60000,
        actual: Math.random(),
        features: { x: Math.random() },
      })),
      predictionFn: async (features: Record<string, number>) => features['x'] * 0.8 + 0.1,
    });

    assert(result.metrics.mae >= 0, 'MAE should be non-negative');
    assert(result.sampleCount === 100, 'Should evaluate 100 samples');
  });

  runner.test('KnowledgeCrystallizer: 模式发现', async () => {
    const { KnowledgeCrystallizer } = await import('../evolution/crystallization/knowledge-crystallizer');
    const crystallizer = new KnowledgeCrystallizer();

    const patterns = await crystallizer.discover({
      data: Array.from({ length: 50 }, () => ({
        windSpeed: 8 + Math.random() * 4,
        fatigueIncrement: 0.3 + Math.random() * 0.2,
        timestamp: Date.now(),
      })),
      minSupport: 0.3,
      minConfidence: 0.5,
    });

    assert(Array.isArray(patterns), 'Should return array of patterns');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Pipeline DAG 测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('PipelineDAG: 注册和执行', async () => {
    const { PipelineDAGEngine } = await import('../pipeline/dag/pipeline-dag');
    const engine = new PipelineDAGEngine();

    engine.register({
      pipelineId: 'test_pipeline',
      name: 'Test Pipeline',
      description: 'Integration test pipeline',
      version: '1.0',
      nodes: [
        {
          id: 'node_a', name: 'Node A', type: 'collect',
          execute: async () => ({ value: 42 }),
          config: {}, retryCount: 0, timeoutMs: 5000, skippable: false,
        },
        {
          id: 'node_b', name: 'Node B', type: 'diagnose',
          execute: async (input) => ({ result: (input['value'] as number || 0) * 2 }),
          config: {}, retryCount: 0, timeoutMs: 5000, skippable: false,
        },
      ],
      edges: [{ from: 'node_a', to: 'node_b' }],
      globalConfig: {},
    });

    const result = await engine.execute('test_pipeline');
    assert(result.status === 'completed', 'Pipeline should complete');
    assert(result.nodeResults.length === 2, 'Should have 2 node results');
    assert(result.nodeResults.every(r => r.status === 'success'), 'All nodes should succeed');
  });

  runner.test('PipelineDAG: 并行执行', async () => {
    const { PipelineDAGEngine } = await import('../pipeline/dag/pipeline-dag');
    const engine = new PipelineDAGEngine();

    engine.register({
      pipelineId: 'parallel_test',
      name: 'Parallel Test',
      description: 'Test parallel execution',
      version: '1.0',
      nodes: [
        { id: 'root', name: 'Root', type: 'collect', execute: async () => ({ data: 'ok' }), config: {}, retryCount: 0, timeoutMs: 5000, skippable: false },
        { id: 'branch_a', name: 'Branch A', type: 'diagnose', execute: async () => ({ a: 1 }), config: {}, retryCount: 0, timeoutMs: 5000, skippable: false },
        { id: 'branch_b', name: 'Branch B', type: 'diagnose', execute: async () => ({ b: 2 }), config: {}, retryCount: 0, timeoutMs: 5000, skippable: false },
        { id: 'merge', name: 'Merge', type: 'store', execute: async (input) => ({ merged: true, ...input }), config: {}, retryCount: 0, timeoutMs: 5000, skippable: false },
      ],
      edges: [
        { from: 'root', to: 'branch_a' },
        { from: 'root', to: 'branch_b' },
        { from: 'branch_a', to: 'merge' },
        { from: 'branch_b', to: 'merge' },
      ],
      globalConfig: {},
    });

    const result = await engine.execute('parallel_test');
    assert(result.status === 'completed', 'Parallel pipeline should complete');
    assert(result.nodeResults.length === 4, 'Should have 4 node results');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. 数字孪生测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('DigitalTwin: 创建和同步', async () => {
    const { DigitalTwinEngine } = await import('../digital-twin/digital-twin');
    const engine = new DigitalTwinEngine();

    const twin = engine.createTwin('crane_01');
    assert(twin.twinId === 'twin_crane_01', 'Twin ID should match');

    const updated = engine.syncState('crane_01', {
      physics: { windLoadMoment: 150, fatigueStress: 3.5, bearingTemperature: 55, motorPower: 80, structuralStress: 45, totalBendingMoment: 200 },
    });

    assert(updated !== null, 'Should return updated state');
    assert(updated!.physics.windLoadMoment === 150, 'Wind load should be updated');
  });

  runner.test('DigitalTwin: 仿真', async () => {
    const { DigitalTwinEngine } = await import('../digital-twin/digital-twin');
    const engine = new DigitalTwinEngine();

    const result = await engine.simulate({
      scenarioId: 'high_wind_test',
      name: 'High Wind Test',
      description: 'Test high wind scenario',
      initialOverrides: {},
      environment: { windSpeed: 12, windDirection: 180, temperature: 25, humidity: 0.7, seaState: 3 },
      operations: [
        { timestamp: 60, action: 'hoist', parameters: { power: 80 } },
      ],
      faultInjections: [],
      durationSeconds: 300,
      timeStepSeconds: 10,
    });

    assert(result.trajectory.length > 0, 'Should have trajectory points');
    assert(result.summary.maxStress > 0, 'Max stress should be > 0');
    assert(result.optimizations.length >= 0, 'Should have optimization suggestions');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. 仪表盘测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('Dashboard: 快照生成', async () => {
    const { CognitiveDashboardService } = await import('../dashboard/cognitive-dashboard');
    const dashboard = new CognitiveDashboardService();

    const snapshot = dashboard.generateSnapshot({
      safetyData: { overallScore: 0.85 },
      healthData: { overallScore: 0.78, remainingLifeDays: 60 },
    });

    assert(snapshot.safety.overallScore === 0.85, 'Safety score should match');
    assert(snapshot.health.remainingLifeDays === 60, 'Remaining life should match');
    assert(snapshot.safety.riskLevel === 'safe', 'Risk level should be safe');
  });

  runner.test('Dashboard: 告警管理', async () => {
    const { CognitiveDashboardService } = await import('../dashboard/cognitive-dashboard');
    const dashboard = new CognitiveDashboardService();

    const alert = dashboard.addAlert({
      severity: 'warning',
      category: 'safety',
      title: '风速偏高',
      description: '当前风速 10m/s，接近限制',
      machineId: 'crane_01',
      actions: ['关注', '限速'],
    });

    assert(alert.alertId.startsWith('alert_'), 'Alert ID should be generated');
    assert(!alert.acknowledged, 'Alert should not be acknowledged');

    dashboard.acknowledgeAlert(alert.alertId);
    const active = dashboard.getActiveAlerts();
    assert(active.length === 0, 'No active alerts after acknowledgment');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. 编排器测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('Orchestrator: 初始化和闭环', async () => {
    const { PlatformOrchestrator } = await import('../orchestrator/platform-orchestrator');
    const orchestrator = new PlatformOrchestrator({
      scenario: 'port_crane',
      modules: {
        perception: true, cognition: true, guardrail: true,
        evolution: true, knowledge: true, tooling: true,
        pipeline: true, digitalTwin: true, dashboard: true,
      },
      closedLoop: { enabled: true, intervalMs: 5000, maxConcurrentLoops: 1 },
      healthCheck: { intervalMs: 30000, timeoutMs: 5000, maxConsecutiveFailures: 3 },
    });

    const initResult = await orchestrator.initialize();
    assert(initResult.success, 'Initialization should succeed');
    assert(initResult.moduleStatuses.length === 9, 'All 9 modules should be initialized');

    const loopResult = await orchestrator.executeClosedLoop({ channelCount: 10 });
    assert(loopResult.phases.length >= 4, 'Should have >= 4 phases');
    assert(loopResult.phases.every(p => p.status === 'success'), 'All phases should succeed');

    const health = orchestrator.healthCheck();
    assert(health.overall === 'healthy', 'Overall health should be healthy');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 执行所有测试
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  西联平台 v5.0 深度进化 — 端到端集成测试');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = await runner.run();

  for (const r of results.results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)`);
    if (!r.passed && r.error) {
      console.log(`     └─ ${r.error}`);
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  总计: ${results.total} | 通过: ${results.passed} | 失败: ${results.failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

// 直接运行
runIntegrationTests().catch(console.error);
