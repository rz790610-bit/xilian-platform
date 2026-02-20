/**
 * ============================================================================
 * 认知引擎端到端测试
 * ============================================================================
 *
 * 覆盖：Grok Tool Calling → WorldModel → FusionDiagnosis → GuardrailEngine
 */

import { GrokToolCallingEngine } from '../cognition/grok/grok-tool-calling';
import { ReasoningChainManager } from '../cognition/grok/grok-reasoning-chain';
import type { ReasoningStep } from '../cognition/grok/grok-tool-calling';
import { WorldModel } from '../cognition/worldmodel/world-model';
import { FusionDiagnosisService } from '../cognition/diagnosis/fusion-diagnosis.service';
import { DiagnosisReportGenerator } from '../cognition/diagnosis/diagnosis-report-generator';
import { GuardrailEngine } from '../cognition/safety/guardrail-engine';
import { ChainPlanner } from '../cognition/chain/chain-planner';
import { ChainExecutor } from '../cognition/chain/chain-executor';

// ============================================================================
// 测试工具
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ============================================================================
// 测试用例
// ============================================================================

async function testGrokToolCallingEngine(): Promise<void> {
  console.log('[TEST] GrokToolCallingEngine — 工具注册和发现');
  const engine = new GrokToolCallingEngine();

  // 注册工具
  engine.registerTool({
    name: 'test_query',
    description: '测试查询工具',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async (input: Record<string, unknown>) => ({ result: `查询结果: ${input.query}` }),
  });

  // 发现工具
  const tools = engine.listTools();
  assert(tools.length > 0, '应至少有1个注册工具');
  assert(tools.some(t => t.name === 'test_query'), '应包含test_query工具');

  // 执行工具
  const result = await engine.executeTool('test_query', { query: '测试' });
  assert(result !== null, '工具执行结果不应为null');

  console.log('[PASS] GrokToolCallingEngine');
}

async function testGrokReasoningChain(): Promise<void> {
  console.log('[TEST] ReasoningChainManager — 推理链管理');
  const chainManager = new ReasoningChainManager();

  // 构造推理结果
  const steps: ReasoningStep[] = [
    {
      stepIndex: 0,
      thought: '查询振动时序数据',
      toolName: 'queryTimeSeries',
      toolInput: { metric: 'vibration_rms', last: '1h' },
      toolOutput: { value: 12.3, unit: 'mm/s' },
      durationMs: 320,
    },
    {
      stepIndex: 1,
      thought: '振动超过阈值 8 mm/s，可能轴承磨损',
      durationMs: 1200,
    },
    {
      stepIndex: 2,
      thought: '建议 48h 内更换轴承',
      toolName: 'generateReport',
      toolInput: { type: 'maintenance' },
      toolOutput: { reportId: 'R001' },
      durationMs: 150,
    },
  ];

  // Mermaid 可视化
  const viz = chainManager.generateVisualization(steps);
  assert(viz.mermaid.includes('graph'), 'Mermaid 输出应包含 graph');
  assert(viz.timeline.length === 3, `时间线应有3个步骤，实际${viz.timeline.length}`);

  // 统计
  const stats = await chainManager.getStats(24);
  assert(typeof stats.totalChains === 'number', '应有 totalChains 字段');
  assert(typeof stats.avgStepsPerChain === 'number', '应有 avgStepsPerChain 字段');

  // 持久化（当前为 TODO，验证不报错）
  await chainManager.persist({
    sessionId: 'test_session',
    steps,
    finalAnswer: '建议 48h 内更换轴承',
    totalDurationMs: 1670,
  });

  console.log('[PASS] ReasoningChainManager');
}

async function testWorldModel(): Promise<void> {
  console.log('[TEST] WorldModel — 状态预测和反事实推理');
  const model = new WorldModel();

  // 状态预测
  const prediction = model.predict({
    currentState: {
      vibrationRMS: 5.2,
      temperature: 65,
      loadRatio: 0.75,
      fatigueDamage: 0.35,
    },
    horizonMinutes: 60,
  });

  assert(prediction !== null, '预测结果不应为null');
  assert(prediction!.predictedState !== undefined, '应有预测状态');
  assert(prediction!.confidence > 0, '预测置信度应大于0');

  // 反事实推理
  const counterfactual = model.whatIf({
    currentState: {
      vibrationRMS: 5.2,
      temperature: 65,
      loadRatio: 0.75,
    },
    hypotheticalChanges: {
      loadRatio: 0.95,
    },
  });

  assert(counterfactual !== null, '反事实结果不应为null');
  assert(counterfactual!.riskDelta !== undefined, '应有风险变化量');

  // 异常预判
  const anomalyCheck = model.detectAnomaly({
    stateVector: [5.2, 65, 0.75, 1200, 45, 8.5, 120, 15.3, 24, 12.1, 0.08, 8.5, 75, 28, 0.05, 0.15, 0.02, 0.35, 0.12, 0.28, 12500],
  });

  assert(typeof anomalyCheck.isAnomaly === 'boolean', '异常检测应返回布尔值');
  assert(anomalyCheck.score >= 0 && anomalyCheck.score <= 1, '异常分数应在[0,1]范围');

  console.log('[PASS] WorldModel');
}

async function testGuardrailEngine(): Promise<void> {
  console.log('[TEST] GuardrailEngine — 护栏规则检查');
  const engine = new GuardrailEngine();

  // 正常状态 — 不应触发
  const normalResult = engine.evaluate({
    safetyScore: 0.95,
    healthScore: 0.85,
    efficiencyScore: 0.88,
    stateVector: { vibrationRMS: 3.0, temperature: 55, loadRatio: 0.6 },
  });

  assert(normalResult.triggered.length === 0, `正常状态不应触发护栏，实际触发${normalResult.triggered.length}条`);

  // 危险状态 — 应触发安全护栏
  const dangerResult = engine.evaluate({
    safetyScore: 0.3,
    healthScore: 0.4,
    efficiencyScore: 0.5,
    stateVector: { vibrationRMS: 15.0, temperature: 95, loadRatio: 0.95 },
  });

  assert(dangerResult.triggered.length > 0, '危险状态应触发护栏');
  assert(dangerResult.triggered.some(t => t.category === 'safety'), '应触发安全类护栏');

  // 规则启停
  const ruleCount = engine.listRules().length;
  assert(ruleCount >= 12, `应至少有12条规则，实际${ruleCount}`);

  engine.disableRule('safety_tilt');
  const disabledRules = engine.listRules().filter(r => !r.enabled);
  assert(disabledRules.some(r => r.id === 'safety_tilt'), '应成功禁用safety_tilt规则');

  engine.enableRule('safety_tilt');

  console.log('[PASS] GuardrailEngine');
}

async function testDiagnosisReportGenerator(): Promise<void> {
  console.log('[TEST] DiagnosisReportGenerator — 诊断报告生成');
  const generator = new DiagnosisReportGenerator();

  const report = generator.generate({
    equipmentId: 'EQ-001',
    safetyScore: 0.85,
    healthScore: 0.72,
    efficiencyScore: 0.88,
    remainingLifeDays: 120,
    topIssues: [
      { type: 'health', description: '轴承磨损加速', severity: 'medium', confidence: 0.82 },
      { type: 'efficiency', description: '周期时间偏长 5%', severity: 'low', confidence: 0.76 },
    ],
    recommendations: [
      { action: '安排轴承检查', priority: 'high', deadline: '7天内' },
      { action: '调整运行参数', priority: 'medium', deadline: '14天内' },
    ],
  });

  assert(report.id !== '', '报告ID不应为空');
  assert(report.equipmentId === 'EQ-001', '设备ID应匹配');
  assert(report.summary !== '', '报告摘要不应为空');
  assert(report.structuredData !== undefined, '应有结构化数据');
  assert(report.naturalLanguage !== '', '应有自然语言描述');

  console.log('[PASS] DiagnosisReportGenerator');
}

async function testChainPlanner(): Promise<void> {
  console.log('[TEST] ChainPlanner — 链式认知规划');
  const planner = new ChainPlanner();

  // 使用内置模板
  const plan = planner.planFromTemplate('full_diagnosis', {
    equipmentId: 'EQ-001',
    triggerType: 'anomaly',
  });

  assert(plan !== null, '规划结果不应为null');
  assert(plan!.steps.length > 0, '应有至少1个步骤');
  assert(plan!.estimatedDurationMs > 0, '预估耗时应大于0');

  // 自定义规划
  const customPlan = planner.plan({
    goal: '诊断设备振动异常原因',
    availableTools: ['queryTimeSeries', 'queryKnowledgeGraph', 'runPhysicsFormula'],
    constraints: { maxSteps: 5, maxDurationMs: 10000 },
  });

  assert(customPlan.steps.length <= 5, `步骤数应<=5，实际${customPlan.steps.length}`);

  console.log('[PASS] ChainPlanner');
}

async function testChainExecutor(): Promise<void> {
  console.log('[TEST] ChainExecutor — 链式认知执行');
  const executor = new ChainExecutor();

  // 注册步骤执行器
  executor.registerStepExecutor('query', async (input) => ({
    success: true,
    output: { data: `查询结果: ${JSON.stringify(input)}` },
    durationMs: 100,
  }));

  executor.registerStepExecutor('analyze', async (input) => ({
    success: true,
    output: { analysis: `分析结果: ${JSON.stringify(input)}` },
    durationMs: 200,
  }));

  // 执行链
  const result = await executor.execute({
    steps: [
      { id: 'step1', type: 'query', input: { query: '振动数据' }, dependencies: [] },
      { id: 'step2', type: 'analyze', input: { data: '{{step1.output}}' }, dependencies: ['step1'] },
    ],
    timeoutMs: 5000,
  });

  assert(result.status === 'completed', `执行状态应为completed，实际${result.status}`);
  assert(result.stepResults.length === 2, `应有2个步骤结果，实际${result.stepResults.length}`);
  assert(result.stepResults.every(s => s.success), '所有步骤应成功');

  console.log('[PASS] ChainExecutor');
}

// ============================================================================
// 测试运行器
// ============================================================================

export async function runCognitionEngineTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  const tests = [
    testGrokToolCallingEngine,
    testGrokReasoningChain,
    testWorldModel,
    testGuardrailEngine,
    testDiagnosisReportGenerator,
    testChainPlanner,
    testChainExecutor,
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

  console.log(`\n=== 认知引擎测试结果: ${passed} passed, ${failed} failed ===`);
  return { passed, failed, errors };
}
