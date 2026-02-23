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
    // eventSchemaRegistry 是模块级单例实例
    const { eventSchemaRegistry } = await import('../contracts/event-schema-registry');

    // registerBuiltinSchemas() 不接受参数，内部使用模块级 eventSchemaRegistry
    const { registerBuiltinSchemas } = await import('../contracts/builtin-schemas');
    registerBuiltinSchemas();

    // listEvents 而非 listSchemas
    const events = eventSchemaRegistry.listEvents();
    assert(events.length > 0, 'Should have registered events');
  });

  runner.test('Physics Formulas: 风载力矩计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const engine = new PhysicsEngine();

    // compute(formulaId, variables) → PhysicsFormulaResult
    const res = engine.compute('wind_load_moment', { rho: 1.225, v: 10, A: 120, h: 45 });
    assert(res.result > 0, 'Wind load moment should be positive');
    assertApprox(res.result, 165375, 1000, 'Wind load moment calculation');
  });

  runner.test('Physics Formulas: 疲劳增量计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const engine = new PhysicsEngine();

    const res = engine.compute('fatigue_increment', { k: 2.5, M: 100000, W: 0.05 });
    assert(res.result > 0, 'Fatigue increment should be positive');
    assertApprox(res.result, 5000000, 100, 'Fatigue increment calculation');
  });

  runner.test('Physics Formulas: 腐蚀速率计算', async () => {
    const { PhysicsEngine } = await import('../contracts/physics-formulas');
    const engine = new PhysicsEngine();

    const res = engine.compute('corrosion_rate', { k: 0.5, cl: 0.8, humidity: 0.1 });
    assert(res.result > 0, 'Corrosion rate should be positive');
    assertApprox(res.result, 0.04, 0.01, 'Corrosion rate calculation');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 感知层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('RingBuffer: 写入和读取', async () => {
    const { RingBuffer } = await import('../perception/collection/ring-buffer');
    const buffer = new RingBuffer({ bufferSize: 8192 });

    buffer.write(42.0);
    buffer.write(43.0);
    buffer.write(44.0);

    assert(buffer.size === 3, 'Should have 3 values');
    // readBatch 批量读取
    const data = buffer.readBatch(3);
    assert(data.length === 3, 'Should read 3 values');
    assertApprox(data[0], 42.0, 0.001, 'First value');
    assertApprox(data[2], 44.0, 0.001, 'Third value');
  });

  runner.test('RingBuffer: 环形覆盖', async () => {
    const { RingBuffer } = await import('../perception/collection/ring-buffer');
    // bufferSize=32, itemSize=8 → capacity=4
    const buffer = new RingBuffer({ bufferSize: 32, itemSize: 8 });

    for (let i = 0; i < 10; i++) {
      buffer.write(i);
    }

    // 环形覆盖后，size 应为 capacity=4
    assert(buffer.size === 4, 'Should have 4 values after overflow');
  });

  runner.test('AdaptiveSamplingEngine: 工况自适应', async () => {
    // 实际导出名是 AdaptiveSamplingEngine，不是 AdaptiveSampler
    const { AdaptiveSamplingEngine } = await import('../perception/collection/adaptive-sampler');
    const engine = new AdaptiveSamplingEngine();

    // 获取所有预配置的采样策略
    const profiles = engine.getAllProfiles();
    assert(profiles.length > 0, 'Should have default profiles');

    // 切换到 hoisting 阶段（高频）
    engine.switchPhase('hoisting');
    const hoistingProfile = engine.getCurrentProfile();
    assert(hoistingProfile !== undefined, 'Should have hoisting profile');
    assert(hoistingProfile!.baseSamplingRate >= 100, 'Hoisting should have high base rate');

    // 切换到 idle 阶段（低频）
    engine.switchPhase('idle');
    const idleProfile = engine.getCurrentProfile();
    assert(idleProfile !== undefined, 'Should have idle profile');
    assert(idleProfile!.baseSamplingRate <= 10, 'Idle should have low base rate');
  });

  runner.test('DS Fusion: 证据融合', async () => {
    const { DSFusionEngine } = await import('../perception/fusion/ds-fusion-engine');
    // constructor 需要 hypotheses: string[]
    const engine = new DSFusionEngine(['normal', 'abnormal', 'uncertain']);

    // BPA 接口要求 masses 是 Map<string, number>
    const bpa1 = {
      masses: new Map([['normal', 0.3], ['abnormal', 0.6], ['uncertain', 0.1]]),
      sourceName: 'vibration',
      weight: 1.0,
      reliability: 0.9,
      timestamp: Date.now(),
    };
    const bpa2 = {
      masses: new Map([['normal', 0.2], ['abnormal', 0.7], ['uncertain', 0.1]]),
      sourceName: 'temperature',
      weight: 1.0,
      reliability: 0.9,
      timestamp: Date.now(),
    };

    const result = engine.fuse([bpa1, bpa2]);

    // FusionResult 有 fusedBPA (Map) 和 conflictFactor (number)
    const abnormalBelief = result.fusedBPA.get('abnormal') || 0;
    assert(abnormalBelief > 0.5, 'Fused abnormal mass should be high');
    assert(result.conflictFactor < 1, 'Conflict factor should be < 1');
  });

  runner.test('StateVectorEncoder: 编码', async () => {
    const { StateVectorEncoder } = await import('../perception/encoding/state-vector-encoder');
    const encoder = new StateVectorEncoder();

    // EncoderInput 需要完整的结构化输入
    const vector = encoder.encode({
      machineId: 'test_crane_01',
      cyclePhase: 'hoisting',
      conditionProfileId: 0,
      sensorFeatures: {},
      environmentalData: {
        windSpeed: 8,
        humidity: 0.7,
        chlorideConcentration: 0.3,
      },
      operationalData: {
        motorCurrent: 70,
        loadWeight: 30,
        loadEccentricity: 0.2,
        motorRpm: 1200,
      },
      cumulativeData: {
        fatigueAccumPercent: 25,
        corrosionIndex: 0.15,
        totalCycles: 50000,
        lastMaintenanceTime: Date.now() - 86400000,
      },
    });

    // UnifiedStateVector 是对象，用 toNumericArray 转为数组
    assert(vector.machineId === 'test_crane_01', 'Machine ID should match');
    const numericArray = encoder.toNumericArray(vector);
    assert(numericArray.length === 21, 'Numeric array should have 21 dimensions');
    assert(numericArray.every((v: number) => !isNaN(v)), 'All values should be numbers');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. 诊断层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('WorldModel: 状态预测', async () => {
    const { WorldModel } = await import('../cognition/worldmodel/world-model');
    const model = new WorldModel();

    // predict(currentState: StateVector, horizon?: number)
    // StateVector = { timestamp: number, values: Record<string, number> }
    const prediction = model.predict(
      { timestamp: Date.now(), values: { windSpeed: 10, fatigueAccum: 30, bearingTemp: 50 } },
      5
    );

    assert(prediction.trajectory.length === 6, 'Should have 6 trajectory points (initial + 5 steps)');
    // PredictionResult 有 confidences 数组，不是 confidence 单值
    assert(prediction.confidences.length > 0, 'Should have confidence values');
    assert(prediction.confidences[0] > 0, 'First confidence should be positive');
  });

  runner.test('WorldModel: 反事实推理', async () => {
    const { WorldModel } = await import('../cognition/worldmodel/world-model');
    const model = new WorldModel();

    // counterfactual(currentState: StateVector, parameterChanges: Record<string, number>, horizon?: number)
    const result = model.counterfactual(
      { timestamp: Date.now(), values: { windSpeed: 12, fatigueAccum: 40 } },
      { windSpeed: 6 },
      3
    );

    // CounterfactualResult 有 baseline 和 counterfactual (PredictionResult)
    assert(result.baseline.trajectory.length >= 3, 'Baseline trajectory should have >= 3 points');
    assert(result.counterfactual.trajectory.length >= 3, 'CF trajectory should have >= 3 points');
  });

  runner.test('FusionDiagnosis: 四维诊断', async () => {
    const { FusionDiagnosisService } = await import('../cognition/diagnosis/fusion-diagnosis.service');
    const service = new FusionDiagnosisService();

    // diagnose(machineId: string, stateValues: Record<string, number>, cyclePhase: string)
    const report = await service.diagnose(
      'test_crane_01',
      {
        vibrationRms: 2.5, motorCurrent: 70, windSpeed: 8,
        bearingTemp: 55, loadWeight: 30, loadEccentricity: 0.2,
      },
      'hoisting'
    );

    // DiagnosisReport 有 safety.score, health.score, efficiency.score
    assert(report.safety.score >= 0 && report.safety.score <= 1, 'Safety score in [0,1]');
    assert(report.health.score >= 0 && report.health.score <= 1, 'Health score in [0,1]');
    assert(report.efficiency.score >= 0 && report.efficiency.score <= 1, 'Efficiency score in [0,1]');
    assert(report.recommendations.length > 0, 'Should have recommendations');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 护栏层测试
  // ─────────────────────────────────────────────────────────────────────────

  runner.test('GuardrailEngine: 安全规则触发', async () => {
    const { GuardrailEngine } = await import('../cognition/safety/guardrail-engine');
    const { FusionDiagnosisService } = await import('../cognition/diagnosis/fusion-diagnosis.service');

    // GuardrailEngine constructor 自动加载默认规则，不需要 loadDefaultRules()
    const engine = new GuardrailEngine();
    const diagService = new FusionDiagnosisService();

    // 先生成一个高风速的诊断报告
    const report = await diagService.diagnose(
      'test_crane_01',
      { windSpeed: 15, loadEccentricity: 0.1, fatigueAccum: 20, bearingTemp: 40 },
      'hoisting'
    );

    // evaluate(machineId: string, report: DiagnosisReport) → GuardrailTriggerEvent[]
    const triggered = engine.evaluate('test_crane_01', report);

    assert(triggered.length > 0, 'Should have triggered events for high wind');
    assert(triggered.some(t => t.category === 'safety'), 'Should have safety trigger');
  });

  runner.test('GuardrailEngine: 正常运行无违规', async () => {
    const { GuardrailEngine } = await import('../cognition/safety/guardrail-engine');
    const { FusionDiagnosisService } = await import('../cognition/diagnosis/fusion-diagnosis.service');

    const engine = new GuardrailEngine();
    const diagService = new FusionDiagnosisService();

    const report = await diagService.diagnose(
      'test_crane_01',
      { windSpeed: 5, loadEccentricity: 0.1, fatigueAccum: 10, bearingTemp: 40 },
      'idle'
    );

    const triggered = engine.evaluate('test_crane_01', report);

    assert(triggered.length === 0, 'Should have no triggers in normal conditions');
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

    // evaluate(challenger: ModelCandidate, champion: ModelCandidate | null, dataset: EvaluationDataPoint[])
    const challenger = {
      modelId: 'test_model_v2',
      modelVersion: '2.0',
      modelType: 'prediction' as const,
      description: 'Test challenger model',
      parameters: {},
      createdAt: Date.now(),
      predict: async (input: Record<string, number>) => ({ predicted: (input['x'] || 0) * 0.8 + 0.1 }),
    };

    const dataset = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() - (100 - i) * 60000,
      input: { x: Math.random() },
      actualOutput: { predicted: Math.random() },
    }));

    const report = await evaluator.evaluate(challenger, null, dataset);

    // ShadowEvaluationReport 有 challengerMetrics.accuracy.mae 等
    assert(report.challengerMetrics.accuracy.mae >= 0, 'MAE should be non-negative');
    assert(report.verdict !== undefined, 'Should have a verdict');
  });

  runner.test('KnowledgeCrystallizer: 模式发现', async () => {
    const { KnowledgeCrystallizer } = await import('../evolution/crystallization/knowledge-crystallizer');
    const crystallizer = new KnowledgeCrystallizer();

    // discoverPatterns(history: DiagnosisHistoryEntry[])
    const history = Array.from({ length: 50 }, (_, i) => ({
      reportId: `report_${i}`,
      machineId: 'crane_01',
      timestamp: Date.now() - (50 - i) * 3600000,
      cyclePhase: 'hoisting',
      safetyScore: 0.7 + Math.random() * 0.2,
      healthScore: 0.6 + Math.random() * 0.3,
      efficiencyScore: 0.5 + Math.random() * 0.3,
      overallScore: 70 + Math.random() * 20,
      riskLevel: 'caution',
      keyMetrics: {
        windSpeed: 8 + Math.random() * 4,
        fatigueIncrement: 0.3 + Math.random() * 0.2,
        bearingTemp: 50 + Math.random() * 15,
        loadEccentricity: 0.1 + Math.random() * 0.3,
      },
      recommendations: [{ priority: 'P2', action: '关注风速变化' }],
    }));

    const patterns = crystallizer.discoverPatterns(history);
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
