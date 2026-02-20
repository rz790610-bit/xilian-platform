/**
 * ============================================================================
 * 事件系统 + 动态配置测试
 * ============================================================================
 *
 * 覆盖：EventBus → EventSourcing → DynamicConfig → SchemaRegistry
 */

import { EventSchemaRegistry } from '../contracts/event-schema-registry';
import { ValidatedEventEmitter } from '../contracts/event-emitter-validated';
import { PhysicsEngine } from '../contracts/physics-formulas';
import { EventBus } from '../events/event-bus';
import { EventSourcingEngine } from '../events/event-sourcing';
import { DynamicConfigEngine } from '../config/dynamic-config';

// ============================================================================
// 测试工具
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ============================================================================
// 测试用例
// ============================================================================

async function testEventSchemaRegistry(): Promise<void> {
  console.log('[TEST] EventSchemaRegistry — Schema 注册和校验');
  const registry = new EventSchemaRegistry();

  // 注册 Schema
  registry.register({
    eventType: 'test.created',
    version: '1.0.0',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['id', 'name'],
    },
  });

  // 校验 — 有效
  const validResult = registry.validate('test.created', { id: '1', name: 'test', value: 42 });
  assert(validResult.valid, '有效数据应通过校验');

  // 校验 — 无效（缺少必填字段）
  const invalidResult = registry.validate('test.created', { id: '1' });
  assert(!invalidResult.valid, '缺少必填字段应校验失败');
  assert(invalidResult.errors.length > 0, '应有错误信息');

  // 列出所有 Schema
  const schemas = registry.listSchemas();
  assert(schemas.length >= 1, '应至少有1个Schema');

  // 版本管理
  registry.register({
    eventType: 'test.created',
    version: '2.0.0',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'number' },
        tags: { type: 'array' },
      },
      required: ['id', 'name'],
    },
  });

  const versions = registry.getVersions('test.created');
  assert(versions.length >= 2, '应有至少2个版本');

  console.log('[PASS] EventSchemaRegistry');
}

async function testValidatedEventEmitter(): Promise<void> {
  console.log('[TEST] ValidatedEventEmitter — 带校验的事件发射');
  const registry = new EventSchemaRegistry();
  registry.register({
    eventType: 'sensor.reading',
    version: '1.0.0',
    schema: {
      type: 'object',
      properties: {
        sensorId: { type: 'string' },
        value: { type: 'number' },
        timestamp: { type: 'number' },
      },
      required: ['sensorId', 'value'],
    },
  });

  const emitter = new ValidatedEventEmitter(registry);
  let received = false;

  emitter.on('sensor.reading', (data) => {
    received = true;
    assert(data.sensorId === 'S001', '接收数据应匹配');
  });

  // 有效事件
  const emitResult = emitter.emit('sensor.reading', { sensorId: 'S001', value: 42.5, timestamp: Date.now() });
  assert(emitResult.success, '有效事件应发射成功');
  assert(received, '监听器应收到事件');

  // 无效事件
  const invalidEmit = emitter.emit('sensor.reading', { value: 42.5 });
  assert(!invalidEmit.success, '无效事件应发射失败');

  console.log('[PASS] ValidatedEventEmitter');
}

async function testPhysicsFormulas(): Promise<void> {
  console.log('[TEST] PhysicsEngine — 物理公式引擎');
  const formulas = new PhysicsEngine();

  // 风载力矩: M = ½ρv²Ah/2
  const windMoment = formulas.windLoadMoment({
    airDensity: 1.225,
    windSpeed: 12,
    area: 50,
    height: 30,
  });
  assert(windMoment > 0, `风载力矩应>0，实际${windMoment}`);
  // 手算: 0.5 * 1.225 * 144 * 50 * 15 = 66150
  assert(Math.abs(windMoment - 66150) < 100, `风载力矩应≈66150，实际${windMoment}`);

  // 疲劳增量: Δσ = k × M / W
  const fatigueIncrement = formulas.fatigueStressIncrement({
    stressConcentrationFactor: 1.5,
    moment: 66150,
    sectionModulus: 5000,
  });
  assert(fatigueIncrement > 0, `疲劳增量应>0，实际${fatigueIncrement}`);
  // 手算: 1.5 * 66150 / 5000 = 19.845
  assert(Math.abs(fatigueIncrement - 19.845) < 0.1, `疲劳增量应≈19.845，实际${fatigueIncrement}`);

  // 摩擦力: f = μN
  const friction = formulas.frictionForce({ frictionCoefficient: 0.15, normalForce: 10000 });
  assert(friction === 1500, `摩擦力应=1500，实际${friction}`);

  // 腐蚀速率: r = k[Cl⁻][humidity]
  const corrosionRate = formulas.corrosionRate({
    rateConstant: 0.001,
    chlorideConcentration: 50,
    humidity: 85,
  });
  assert(corrosionRate > 0, `腐蚀速率应>0，实际${corrosionRate}`);
  assert(Math.abs(corrosionRate - 4.25) < 0.01, `腐蚀速率应≈4.25，实际${corrosionRate}`);

  console.log('[PASS] PhysicsEngine');
}

async function testEventBus(): Promise<void> {
  console.log('[TEST] EventBus — 统一事件总线');
  const bus = new EventBus();

  let receivedCount = 0;
  const receivedEvents: string[] = [];

  // 订阅
  bus.subscribe('perception.*', (event) => {
    receivedCount++;
    receivedEvents.push(event.type);
  });

  bus.subscribe('perception.state_vector', (event) => {
    receivedCount++;
  });

  // 发布
  bus.publish({ type: 'perception.state_vector', payload: { vector: [1, 2, 3] }, timestamp: Date.now() });
  bus.publish({ type: 'perception.anomaly', payload: { score: 0.95 }, timestamp: Date.now() });
  bus.publish({ type: 'cognition.diagnosis', payload: { result: 'ok' }, timestamp: Date.now() });

  // 等待异步处理
  await new Promise(resolve => setTimeout(resolve, 100));

  // 通配符应匹配2个perception事件，精确匹配应匹配1个
  assert(receivedCount >= 3, `应至少收到3个事件（通配符2+精确1），实际${receivedCount}`);
  assert(receivedEvents.includes('perception.state_vector'), '应收到state_vector事件');
  assert(receivedEvents.includes('perception.anomaly'), '应收到anomaly事件');
  assert(!receivedEvents.includes('cognition.diagnosis'), '不应收到cognition事件');

  // 指标
  const metrics = bus.getMetrics();
  assert(metrics.publishedCount >= 3, `发布数应>=3，实际${metrics.publishedCount}`);

  console.log('[PASS] EventBus');
}

async function testEventSourcingEngine(): Promise<void> {
  console.log('[TEST] EventSourcingEngine — 事件溯源');
  const engine = new EventSourcingEngine();

  const aggregateId = 'equipment_001';

  // 追加事件
  engine.append(aggregateId, { type: 'equipment.created', data: { name: '设备A', model: 'Type-X' } });
  engine.append(aggregateId, { type: 'equipment.started', data: { timestamp: Date.now() } });
  engine.append(aggregateId, { type: 'equipment.anomaly_detected', data: { anomalyType: 'vibration', score: 0.85 } });
  engine.append(aggregateId, { type: 'equipment.maintenance_scheduled', data: { date: '2026-03-01' } });

  // 获取事件流
  const events = engine.getEvents(aggregateId);
  assert(events.length === 4, `应有4个事件，实际${events.length}`);
  assert(events[0].type === 'equipment.created', '第一个事件应为created');
  assert(events[3].type === 'equipment.maintenance_scheduled', '最后一个事件应为maintenance_scheduled');

  // 快照
  engine.createSnapshot(aggregateId, { name: '设备A', status: 'maintenance_pending', anomalyCount: 1 });
  const snapshot = engine.getLatestSnapshot(aggregateId);
  assert(snapshot !== null, '快照不应为null');
  assert(snapshot!.state.status === 'maintenance_pending', '快照状态应为maintenance_pending');

  // 重建聚合
  const aggregate = engine.rebuild(aggregateId, (state, event) => {
    switch (event.type) {
      case 'equipment.created': return { ...state, ...event.data, status: 'idle' };
      case 'equipment.started': return { ...state, status: 'running' };
      case 'equipment.anomaly_detected': return { ...state, status: 'anomaly', anomalyCount: (state.anomalyCount || 0) + 1 };
      case 'equipment.maintenance_scheduled': return { ...state, status: 'maintenance_pending' };
      default: return state;
    }
  });

  assert(aggregate.status === 'maintenance_pending', `重建状态应为maintenance_pending，实际${aggregate.status}`);
  assert(aggregate.anomalyCount === 1, `异常计数应为1，实际${aggregate.anomalyCount}`);

  console.log('[PASS] EventSourcingEngine');
}

async function testDynamicConfigEngine(): Promise<void> {
  console.log('[TEST] DynamicConfigEngine — 动态配置');
  const config = new DynamicConfigEngine();

  // 设置配置
  config.set('perception.sampling.baseRateHz', 1000);
  config.set('cognition.grok.maxSteps', 10);
  config.set('guardrail.safety.vibrationThreshold', 8.0);

  // 获取配置
  assert(config.get('perception.sampling.baseRateHz') === 1000, '采样率应为1000');
  assert(config.get('cognition.grok.maxSteps') === 10, 'Grok最大步骤应为10');

  // 默认值
  assert(config.get('nonexistent.key', 42) === 42, '不存在的key应返回默认值');

  // 监听变更
  let changeDetected = false;
  config.watch('perception.sampling.baseRateHz', (newValue, oldValue) => {
    changeDetected = true;
    assert(oldValue === 1000, `旧值应为1000，实际${oldValue}`);
    assert(newValue === 2000, `新值应为2000，实际${newValue}`);
  });

  config.set('perception.sampling.baseRateHz', 2000);
  assert(changeDetected, '应检测到配置变更');

  // 版本管理
  const version = config.getVersion();
  assert(version > 0, '版本号应>0');

  // 特性开关
  config.setFeatureFlag('enable_world_model', true);
  assert(config.isFeatureEnabled('enable_world_model') === true, '特性开关应为true');
  config.setFeatureFlag('enable_world_model', false);
  assert(config.isFeatureEnabled('enable_world_model') === false, '特性开关应为false');

  // 导出
  const exported = config.exportAll();
  assert(Object.keys(exported).length >= 3, '应至少有3个配置项');

  console.log('[PASS] DynamicConfigEngine');
}

// ============================================================================
// 测试运行器
// ============================================================================

export async function runEventSystemTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  const tests = [
    testEventSchemaRegistry,
    testValidatedEventEmitter,
    testPhysicsFormulas,
    testEventBus,
    testEventSourcingEngine,
    testDynamicConfigEngine,
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

  console.log(`\n=== 事件系统测试结果: ${passed} passed, ${failed} failed ===`);
  return { passed, failed, errors };
}
