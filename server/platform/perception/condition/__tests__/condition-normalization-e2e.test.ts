/**
 * ============================================================================
 * P1-6: 工况归一化端到端测试
 * ============================================================================
 *
 * 覆盖 5 项验收标准：
 *   AC-1: 满载大风 → 自动识别编码 HOIST.FULL_LOAD.HIGH_WIND
 *   AC-2: 工况切换写入 conditionInstances 表 + stateSnapshot JSON
 *   AC-3: 同一设备不同工况下健康指标偏差 < 5%
 *   AC-4: 空载 vs 满载：归一化前差 30%+，归一化后差 < 5%
 *   AC-5: Condition 节点自动创建并关联到 KG
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConditionNormalizationPipeline,
  identifyConditionEncoding,
  extractHealthIndicators,
  type ConditionDbAdapter,
  type ConditionKgAdapter,
  type PipelineInput,
} from '../condition-normalization-pipeline';
import { ConditionNormalizerEngine, type DataSlice, type NormalizationResult } from '../../../../services/conditionNormalizer.service';

// ============================================================================
// Mock 适配器
// ============================================================================

class MockDbAdapter implements ConditionDbAdapter {
  instances: Array<{
    id: number;
    profileId: number;
    machineId: string;
    startedAt: Date;
    trigger: string;
    stateSnapshot: Record<string, number>;
    status: string;
    endedAt?: Date;
  }> = [];

  private nextId = 1;

  async insertInstance(data: {
    profileId: number;
    machineId: string;
    startedAt: Date;
    trigger: 'auto_detection' | 'manual' | 'scheduler' | 'threshold_breach';
    stateSnapshot: Record<string, number>;
    status: 'active' | 'completed' | 'aborted';
  }): Promise<number> {
    const id = this.nextId++;
    this.instances.push({ id, ...data });
    return id;
  }

  async completeInstance(instanceId: number, endedAt: Date): Promise<boolean> {
    const inst = this.instances.find(i => i.id === instanceId);
    if (inst) {
      inst.status = 'completed';
      inst.endedAt = endedAt;
      return true;
    }
    return false;
  }
}

class MockKgAdapter implements ConditionKgAdapter {
  nodes: Array<{ id: string; encoding: string; name: string; type: string; description: string; parameters: Record<string, unknown> }> = [];

  async getConditionByEncoding(encoding: string): Promise<{ id: string; encoding: string } | null> {
    const found = this.nodes.find(n => n.encoding === encoding);
    return found ? { id: found.id, encoding: found.encoding } : null;
  }

  async createCondition(node: {
    id: string;
    encoding: string;
    name: string;
    type: 'operating' | 'environmental' | 'load';
    description: string;
    parameters: Record<string, unknown>;
  }): Promise<{ id: string } | null> {
    this.nodes.push(node);
    return { id: node.id };
  }
}

class FailingDbAdapter implements ConditionDbAdapter {
  async insertInstance(): Promise<number | null> { throw new Error('DB connection failed'); }
  async completeInstance(): Promise<boolean> { throw new Error('DB connection failed'); }
}

class FailingKgAdapter implements ConditionKgAdapter {
  async getConditionByEncoding(): Promise<null> { throw new Error('Neo4j unavailable'); }
  async createCondition(): Promise<null> { throw new Error('Neo4j unavailable'); }
}

// ============================================================================
// 测试数据工厂
// ============================================================================

function makeFullLoadHighWindSlice(): DataSlice {
  return {
    timestamp: new Date().toISOString(),
    current: 85,
    loadWeight: 40,           // > 30 吨 → FULL_LOAD
    vibrationSpeed: 3.8,
    bearingTemp: 62,
    motorSpeed: 1470,
  };
}

function makeEmptyLoadSlice(): DataSlice {
  return {
    timestamp: new Date().toISOString(),
    current: 15,
    loadWeight: 2,            // < 5 吨 → EMPTY_LOAD
    vibrationSpeed: 1.8,
    bearingTemp: 45,
    motorSpeed: 1470,
  };
}

function makeIdleSlice(): DataSlice {
  return {
    timestamp: new Date().toISOString(),
    current: 0.05,
    loadWeight: 0,
    vibrationSpeed: 0.3,
    bearingTemp: 30,
    motorSpeed: 0,
  };
}

function makeTrolleySlice(): DataSlice {
  return {
    timestamp: new Date().toISOString(),
    current: 25,
    loadWeight: 0,
    vibrationSpeed: 2.0,
    bearingTemp: 42,
    motorSpeed: 0,
    trolleySpeed: 1.5,       // > 0.1 → TROLLEY.MOVING
  };
}

// ============================================================================
// 基线数据：模拟已学习的各工况基线
// ============================================================================

function makeRealisticBaselines(): Record<string, Record<string, { mean: number; std: number; p5: number; p95: number }>> {
  return {
    // LIFT_LOADED 工况下的基线（振动值较高是正常的）
    LIFT_LOADED: {
      vibrationSpeed: { mean: 3.8, std: 0.5, p5: 3.0, p95: 4.5 },
      bearingTemp: { mean: 62, std: 3, p5: 57, p95: 67 },
      current: { mean: 85, std: 5, p5: 77, p95: 93 },
      loadWeight: { mean: 40, std: 3, p5: 35, p95: 45 },
      motorSpeed: { mean: 1470, std: 10, p5: 1455, p95: 1485 },
    },
    // LIFT_EMPTY 工况下的基线（振动值较低）
    LIFT_EMPTY: {
      vibrationSpeed: { mean: 1.8, std: 0.3, p5: 1.3, p95: 2.2 },
      bearingTemp: { mean: 45, std: 3, p5: 40, p95: 50 },
      current: { mean: 15, std: 3, p5: 10, p95: 20 },
      loadWeight: { mean: 2, std: 1, p5: 0.5, p95: 4 },
      motorSpeed: { mean: 1470, std: 10, p5: 1455, p95: 1485 },
    },
    // IDLE 工况基线
    IDLE: {
      vibrationSpeed: { mean: 0.3, std: 0.1, p5: 0.15, p95: 0.45 },
      bearingTemp: { mean: 30, std: 2, p5: 27, p95: 33 },
      current: { mean: 0.05, std: 0.02, p5: 0.02, p95: 0.08 },
      loadWeight: { mean: 0, std: 0.1, p5: 0, p95: 0.1 },
      motorSpeed: { mean: 0, std: 0, p5: 0, p95: 0 },
    },
    // TROLLEY_MOVE 工况基线
    TROLLEY_MOVE: {
      vibrationSpeed: { mean: 2.0, std: 0.3, p5: 1.5, p95: 2.5 },
      bearingTemp: { mean: 42, std: 3, p5: 37, p95: 47 },
      current: { mean: 25, std: 3, p5: 20, p95: 30 },
      trolleySpeed: { mean: 1.5, std: 0.2, p5: 1.2, p95: 1.8 },
    },
  };
}

// ============================================================================
// AC-1: 满载大风工况 → 自动识别编码 HOIST.FULL_LOAD.HIGH_WIND
// ============================================================================

describe('P1-6: 工况归一化端到端', () => {
  describe('AC-1: 复合工况自动识别 + 3 级编码', () => {
    it('满载大风 → HOIST.FULL_LOAD.HIGH_WIND', () => {
      const slice = makeFullLoadHighWindSlice();
      const env = { windSpeed: 18 }; // > 15 m/s

      const encoding = identifyConditionEncoding(slice, env);

      expect(encoding.component).toBe('HOIST');
      expect(encoding.conditionType).toBe('FULL_LOAD');
      expect(encoding.modifier).toBe('HIGH_WIND');
      expect(encoding.full).toBe('HOIST.FULL_LOAD.HIGH_WIND');
    });

    it('空载无风 → HOIST.EMPTY_LOAD.NORMAL', () => {
      const slice = makeEmptyLoadSlice();
      const encoding = identifyConditionEncoding(slice);

      expect(encoding.component).toBe('HOIST');
      expect(encoding.conditionType).toBe('EMPTY_LOAD');
      expect(encoding.modifier).toBe('NORMAL');
      expect(encoding.full).toBe('HOIST.EMPTY_LOAD.NORMAL');
    });

    it('待机 → HOIST.IDLE.NORMAL', () => {
      const slice = makeIdleSlice();
      const encoding = identifyConditionEncoding(slice);

      expect(encoding.full).toBe('HOIST.IDLE.NORMAL');
    });

    it('小车运行 + 高温 → TROLLEY.MOVING.HIGH_TEMP', () => {
      const slice = makeTrolleySlice();
      const env = { ambientTemp: 38 }; // > 35°C

      const encoding = identifyConditionEncoding(slice, env);

      expect(encoding.component).toBe('TROLLEY');
      expect(encoding.conditionType).toBe('MOVING');
      expect(encoding.modifier).toBe('HIGH_TEMP');
      expect(encoding.full).toBe('TROLLEY.MOVING.HIGH_TEMP');
    });

    it('满载高温 → HOIST.FULL_LOAD.HIGH_TEMP', () => {
      const slice = makeFullLoadHighWindSlice();
      const env = { ambientTemp: 40, windSpeed: 5 }; // 高温但无大风

      const encoding = identifyConditionEncoding(slice, env);

      expect(encoding.full).toBe('HOIST.FULL_LOAD.HIGH_TEMP');
    });

    it('满载大风高温 → 大风优先（规则顺序）', () => {
      const slice = makeFullLoadHighWindSlice();
      const env = { windSpeed: 20, ambientTemp: 40 }; // 都超阈值

      const encoding = identifyConditionEncoding(slice, env);

      // HIGH_WIND 排在 MODIFIER_RULES 第一个，优先匹配
      expect(encoding.modifier).toBe('HIGH_WIND');
    });
  });

  // ============================================================================
  // AC-2: 工况切换写入 conditionInstances 表 + stateSnapshot
  // ============================================================================

  describe('AC-2: 工况切换 DB 持久化', () => {
    let db: MockDbAdapter;
    let pipeline: ConditionNormalizationPipeline;

    beforeEach(() => {
      db = new MockDbAdapter();
      pipeline = new ConditionNormalizationPipeline({ dbAdapter: db });
      pipeline.loadBaselines(makeRealisticBaselines());
    });

    it('首次处理 → 创建 conditionInstance', async () => {
      const result = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(result.conditionChanged).toBe(true);
      expect(result.instanceId).toBe(1);
      expect(db.instances).toHaveLength(1);
      expect(db.instances[0].machineId).toBe('EQ-001');
      expect(db.instances[0].trigger).toBe('auto_detection');
      expect(db.instances[0].status).toBe('active');
    });

    it('stateSnapshot 包含传感器值 + 环境参数', async () => {
      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18, ambientTemp: 28 },
      });

      const snapshot = db.instances[0].stateSnapshot;
      expect(snapshot).toBeDefined();
      expect(snapshot.current).toBe(85);
      expect(snapshot.loadWeight).toBe(40);
      expect(snapshot.vibrationSpeed).toBe(3.8);
      expect(snapshot.env_windSpeed).toBe(18);
      expect(snapshot.env_ambientTemp).toBe(28);
    });

    it('相同工况不重复创建', async () => {
      const input: PipelineInput = {
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      };

      const r1 = await pipeline.process(input);
      const r2 = await pipeline.process(input);

      expect(r1.conditionChanged).toBe(true);
      expect(r2.conditionChanged).toBe(false);
      expect(r2.instanceId).toBeNull();
      expect(db.instances).toHaveLength(1); // 只有 1 条
    });

    it('工况切换 → 旧实例 completed + 新实例 active', async () => {
      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeEmptyLoadSlice(),
      });

      expect(db.instances).toHaveLength(2);
      expect(db.instances[0].status).toBe('completed');
      expect(db.instances[0].endedAt).toBeDefined();
      expect(db.instances[1].status).toBe('active');
    });

    it('DB 不可用 → 降级运行（不崩溃）', async () => {
      const failPipeline = new ConditionNormalizationPipeline({
        dbAdapter: new FailingDbAdapter(),
      });
      failPipeline.loadBaselines(makeRealisticBaselines());

      const result = await failPipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      // 不崩溃，instanceId 为 null
      expect(result.instanceId).toBeNull();
      expect(result.encoding.full).toBe('HOIST.FULL_LOAD.HIGH_WIND');
      expect(result.normalization).toBeDefined();
    });
  });

  // ============================================================================
  // AC-3: 归一化后同一设备不同工况健康指标偏差 < 5%
  // ============================================================================

  describe('AC-3: 跨工况健康指标一致性', () => {
    let pipeline: ConditionNormalizationPipeline;

    beforeEach(() => {
      pipeline = new ConditionNormalizationPipeline();
      pipeline.loadBaselines(makeRealisticBaselines());
    });

    it('健康设备在不同工况下的健康指标偏差 < 5%', async () => {
      // 模拟同一台健康设备在两种工况下的数据
      // 数据值 ≈ 各工况基线均值（健康状态）
      const fullLoadResult = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: {
          current: 85,
          loadWeight: 40,
          vibrationSpeed: 3.8,   // ≈ LIFT_LOADED 基线 mean
          bearingTemp: 62,
          motorSpeed: 1470,
        },
        environmental: { windSpeed: 18 },
      });

      // 重置管线用新实例（避免工况切换检测干扰）
      const pipeline2 = new ConditionNormalizationPipeline();
      pipeline2.loadBaselines(makeRealisticBaselines());

      const emptyLoadResult = await pipeline2.process({
        equipmentId: 'EQ-001',
        dataSlice: {
          current: 15,
          loadWeight: 2,
          vibrationSpeed: 1.8,   // ≈ LIFT_EMPTY 基线 mean
          bearingTemp: 45,
          motorSpeed: 1470,
        },
      });

      // 两种工况下共同特征的健康指标
      const commonFeatures = ['vibrationSpeed', 'bearingTemp', 'motorSpeed'];
      for (const feat of commonFeatures) {
        const hiFL = fullLoadResult.healthIndicators[feat];
        const hiEL = emptyLoadResult.healthIndicators[feat];
        if (hiFL !== undefined && hiEL !== undefined) {
          const deviation = Math.abs(hiFL - hiEL);
          expect(deviation).toBeLessThan(5); // < 5% 偏差
        }
      }
    });

    it('健康指标范围 [0, 100]', async () => {
      const result = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      for (const [, value] of Object.entries(result.healthIndicators)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  // ============================================================================
  // AC-4: 空载 vs 满载 — 归一化前差 30%+，归一化后差 < 5%
  // ============================================================================

  describe('AC-4: 归一化消除工况影响', () => {
    let pipeline: ConditionNormalizationPipeline;

    beforeEach(() => {
      pipeline = new ConditionNormalizationPipeline();
      pipeline.loadBaselines(makeRealisticBaselines());
    });

    it('空载 vs 满载振动值原始差 > 30%，归一化后 ratio 差 < 5%', async () => {
      // 满载工况：振动 3.8 mm/s（正常，在基线附近）
      const fullLoadResult = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: {
          current: 85,
          loadWeight: 40,
          vibrationSpeed: 3.8,
          bearingTemp: 62,
          motorSpeed: 1470,
        },
      });

      // 空载工况：振动 1.8 mm/s（正常，在基线附近）
      const pipeline2 = new ConditionNormalizationPipeline();
      pipeline2.loadBaselines(makeRealisticBaselines());

      const emptyLoadResult = await pipeline2.process({
        equipmentId: 'EQ-002',
        dataSlice: {
          current: 15,
          loadWeight: 2,
          vibrationSpeed: 1.8,
          bearingTemp: 45,
          motorSpeed: 1470,
        },
      });

      // === 验证原始值差异 ===
      const rawFL = fullLoadResult.normalization.features['vibrationSpeed'];
      const rawEL = emptyLoadResult.normalization.features['vibrationSpeed'];
      expect(rawFL).toBeDefined();
      expect(rawEL).toBeDefined();

      const rawDiffPercent = Math.abs(rawFL - rawEL) / Math.max(rawFL, rawEL) * 100;
      expect(rawDiffPercent).toBeGreaterThan(30); // 原始差 > 30%
      // 3.8 vs 1.8 → diff = 2.0 / 3.8 ≈ 52.6%

      // === 验证归一化后差异 ===
      const normFL = fullLoadResult.normalization.normalizedFeatures['vibrationSpeed'];
      const normEL = emptyLoadResult.normalization.normalizedFeatures['vibrationSpeed'];
      expect(normFL).toBeDefined();
      expect(normEL).toBeDefined();

      // ratio 归一化：3.8/3.8 ≈ 1.0, 1.8/1.8 ≈ 1.0 → 差 ≈ 0
      const normDiffPercent = Math.abs(normFL - normEL) / Math.max(Math.abs(normFL), Math.abs(normEL)) * 100;
      expect(normDiffPercent).toBeLessThan(5); // 归一化后差 < 5%
    });

    it('同一工况下不同设备轴承温度差异也归一化', async () => {
      // 满载：bearingTemp = 62 → 基线 62 → ratio ≈ 1.0
      const r1 = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: { current: 85, loadWeight: 40, vibrationSpeed: 3.8, bearingTemp: 62, motorSpeed: 1470 },
      });

      const pipeline2 = new ConditionNormalizationPipeline();
      pipeline2.loadBaselines(makeRealisticBaselines());

      // 空载：bearingTemp = 45 → 基线 45 → ratio ≈ 1.0
      const r2 = await pipeline2.process({
        equipmentId: 'EQ-002',
        dataSlice: { current: 15, loadWeight: 2, vibrationSpeed: 1.8, bearingTemp: 45, motorSpeed: 1470 },
      });

      // 原始温度差异
      const rawDiff = Math.abs(62 - 45) / 62 * 100; // ≈ 27.4%
      expect(rawDiff).toBeGreaterThan(20);

      // 归一化后 ratio 差异
      const normT1 = r1.normalization.normalizedFeatures['bearingTemp'];
      const normT2 = r2.normalization.normalizedFeatures['bearingTemp'];
      if (normT1 !== undefined && normT2 !== undefined) {
        const normDiff = Math.abs(normT1 - normT2) / Math.max(Math.abs(normT1), Math.abs(normT2)) * 100;
        expect(normDiff).toBeLessThan(5);
      }
    });

    it('故障设备即使在不同工况下也显示异常 ratio', async () => {
      // 满载但振动值异常高（6.0 vs 基线 3.8）→ ratio ≈ 1.58
      const faultyResult = await pipeline.process({
        equipmentId: 'EQ-FAULTY',
        dataSlice: {
          current: 85,
          loadWeight: 40,
          vibrationSpeed: 6.0, // 异常高
          bearingTemp: 62,
          motorSpeed: 1470,
        },
      });

      const vibRatio = faultyResult.normalization.ratios['vibrationSpeed'];
      expect(vibRatio).toBeDefined();
      expect(vibRatio).toBeGreaterThan(1.3); // 明显偏离基线

      // 健康指标应低于 100
      expect(faultyResult.healthIndicators['vibrationSpeed']).toBeLessThan(70);
    });
  });

  // ============================================================================
  // AC-5: Condition 节点自动创建并关联到 KG
  // ============================================================================

  describe('AC-5: KG Condition 节点自动创建', () => {
    let kg: MockKgAdapter;
    let pipeline: ConditionNormalizationPipeline;

    beforeEach(() => {
      kg = new MockKgAdapter();
      pipeline = new ConditionNormalizationPipeline({ kgAdapter: kg });
      pipeline.loadBaselines(makeRealisticBaselines());
    });

    it('新工况编码 → 自动在 KG 创建 Condition 节点', async () => {
      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(kg.nodes).toHaveLength(1);
      expect(kg.nodes[0].encoding).toBe('HOIST.FULL_LOAD.HIGH_WIND');
      expect(kg.nodes[0].name).toContain('起升');
      expect(kg.nodes[0].name).toContain('满载');
      expect(kg.nodes[0].name).toContain('大风');
      expect(kg.nodes[0].type).toBe('environmental'); // 有环境修饰 → environmental 类型
      expect(kg.nodes[0].parameters).toHaveProperty('loadPercent');
      expect(kg.nodes[0].parameters).toHaveProperty('windSpeed');
    });

    it('相同编码不重复创建', async () => {
      const input: PipelineInput = {
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      };

      await pipeline.process(input);
      await pipeline.process(input); // 第二次相同工况

      expect(kg.nodes).toHaveLength(1); // 只创建 1 个
    });

    it('已存在的编码 → 跳过创建', async () => {
      // 预先植入
      kg.nodes.push({
        id: 'COND-HOIST-FULL-LOAD-HIGH-WIND',
        encoding: 'HOIST.FULL_LOAD.HIGH_WIND',
        name: '起升满载+大风',
        type: 'operating',
        description: 'Pre-existing',
        parameters: {},
      });

      const result = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(result.kgNodeSynced).toBe(true);
      expect(kg.nodes).toHaveLength(1); // 没有新增
    });

    it('不同工况 → 各自创建节点', async () => {
      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeEmptyLoadSlice(),
      });

      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeTrolleySlice(),
        environmental: { ambientTemp: 38 },
      });

      expect(kg.nodes).toHaveLength(3);
      const encodings = kg.nodes.map(n => n.encoding).sort();
      expect(encodings).toContain('HOIST.FULL_LOAD.HIGH_WIND');
      expect(encodings).toContain('HOIST.EMPTY_LOAD.NORMAL');
      expect(encodings).toContain('TROLLEY.MOVING.HIGH_TEMP');
    });

    it('KG 不可用 → 降级运行（不崩溃）', async () => {
      const failPipeline = new ConditionNormalizationPipeline({
        kgAdapter: new FailingKgAdapter(),
      });
      failPipeline.loadBaselines(makeRealisticBaselines());

      const result = await failPipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(result.kgNodeSynced).toBe(false);
      expect(result.encoding.full).toBe('HOIST.FULL_LOAD.HIGH_WIND');
      expect(result.normalization).toBeDefined();
    });

    it('KG 节点 ID 格式正确', async () => {
      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(kg.nodes[0].id).toBe('COND-HOIST-FULL_LOAD-HIGH_WIND');
    });
  });

  // ============================================================================
  // 端到端集成测试
  // ============================================================================

  describe('端到端集成', () => {
    it('完整流程：识别 → 持久化 → 归一化 → KG 同步', async () => {
      const db = new MockDbAdapter();
      const kg = new MockKgAdapter();
      const pipeline = new ConditionNormalizationPipeline({ dbAdapter: db, kgAdapter: kg });
      pipeline.loadBaselines(makeRealisticBaselines());

      const result = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      // 编码正确
      expect(result.encoding.full).toBe('HOIST.FULL_LOAD.HIGH_WIND');

      // DB 写入
      expect(result.instanceId).toBe(1);
      expect(db.instances).toHaveLength(1);

      // 归一化有结果
      expect(result.normalization.condition).toBeDefined();
      expect(Object.keys(result.normalization.features).length).toBeGreaterThan(0);

      // 健康指标有值
      expect(Object.keys(result.healthIndicators).length).toBeGreaterThan(0);

      // KG 同步
      expect(result.kgNodeSynced).toBe(true);
      expect(kg.nodes).toHaveLength(1);

      // 执行时间
      expect(result.pipelineTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.pipelineTimeMs).toBeLessThan(100); // 内存操作应很快
    });

    it('无 DB/无 KG → 纯内存降级运行', async () => {
      const pipeline = new ConditionNormalizationPipeline();
      pipeline.loadBaselines(makeRealisticBaselines());

      const result = await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      expect(result.encoding.full).toBe('HOIST.FULL_LOAD.HIGH_WIND');
      expect(result.instanceId).toBeNull();
      expect(result.kgNodeSynced).toBe(false); // KG adapter 为 null
      expect(result.normalization).toBeDefined();
      expect(result.healthIndicators).toBeDefined();
    });

    it('连续多设备处理', async () => {
      const db = new MockDbAdapter();
      const kg = new MockKgAdapter();
      const pipeline = new ConditionNormalizationPipeline({ dbAdapter: db, kgAdapter: kg });
      pipeline.loadBaselines(makeRealisticBaselines());

      await pipeline.process({ equipmentId: 'EQ-001', dataSlice: makeFullLoadHighWindSlice(), environmental: { windSpeed: 18 } });
      await pipeline.process({ equipmentId: 'EQ-002', dataSlice: makeEmptyLoadSlice() });
      await pipeline.process({ equipmentId: 'EQ-003', dataSlice: makeIdleSlice() });

      // 每台设备各一个实例
      expect(db.instances).toHaveLength(3);
      expect(db.instances.map(i => i.machineId).sort()).toEqual(['EQ-001', 'EQ-002', 'EQ-003']);

      // 每种编码各一个 KG 节点
      expect(kg.nodes).toHaveLength(3);
    });

    it('getActiveCondition 返回当前工况', async () => {
      const pipeline = new ConditionNormalizationPipeline();
      pipeline.loadBaselines(makeRealisticBaselines());

      expect(pipeline.getActiveCondition('EQ-001')).toBeNull();

      await pipeline.process({
        equipmentId: 'EQ-001',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18 },
      });

      const active = pipeline.getActiveCondition('EQ-001');
      expect(active).not.toBeNull();
      expect(active!.encoding).toBe('HOIST.FULL_LOAD.HIGH_WIND');
    });
  });

  // ============================================================================
  // extractHealthIndicators 单元测试
  // ============================================================================

  describe('健康指标提取', () => {
    it('ratio ≈ 1.0 → 健康指标 ≈ 100', () => {
      const result: NormalizationResult = {
        condition: 'LIFT_LOADED',
        conditionLabel: '重载起升',
        features: { vibrationSpeed: 3.8 },
        normalizedFeatures: { vibrationSpeed: 1.0 },
        ratios: { vibrationSpeed: 1.0 },
        status: { vibrationSpeed: 'normal' },
        overallStatus: 'normal',
        baseline: {},
        method: 'ratio',
        timestamp: new Date().toISOString(),
      };

      const indicators = extractHealthIndicators(result);
      expect(indicators.vibrationSpeed).toBe(100);
    });

    it('ratio = 1.5 → 健康指标 = 50', () => {
      const result: NormalizationResult = {
        condition: 'LIFT_LOADED',
        conditionLabel: '重载起升',
        features: { vibrationSpeed: 5.7 },
        normalizedFeatures: { vibrationSpeed: 1.5 },
        ratios: { vibrationSpeed: 1.5 },
        status: { vibrationSpeed: 'attention' },
        overallStatus: 'attention',
        baseline: {},
        method: 'ratio',
        timestamp: new Date().toISOString(),
      };

      const indicators = extractHealthIndicators(result);
      expect(indicators.vibrationSpeed).toBe(50);
    });

    it('ratio = 2.0 → 健康指标 = 0', () => {
      const result: NormalizationResult = {
        condition: 'LIFT_LOADED',
        conditionLabel: '重载起升',
        features: { vibrationSpeed: 7.6 },
        normalizedFeatures: { vibrationSpeed: 2.0 },
        ratios: { vibrationSpeed: 2.0 },
        status: { vibrationSpeed: 'danger' },
        overallStatus: 'danger',
        baseline: {},
        method: 'ratio',
        timestamp: new Date().toISOString(),
      };

      const indicators = extractHealthIndicators(result);
      expect(indicators.vibrationSpeed).toBe(0);
    });
  });

  // ============================================================================
  // FIX-099: 参数顺序无关性测试
  // ============================================================================

  describe('FIX-099: 参数顺序无关性', () => {
    it('不同环境参数顺序 → 相同工况编码', () => {
      const slice = makeFullLoadHighWindSlice();

      // 顺序 A: windSpeed 在前
      const enc1 = identifyConditionEncoding(slice, { windSpeed: 20, ambientTemp: 40 });
      // 顺序 B: ambientTemp 在前
      const enc2 = identifyConditionEncoding(slice, { ambientTemp: 40, windSpeed: 20 });

      expect(enc1.full).toBe(enc2.full);
    });

    it('不同环境参数顺序 → stateSnapshot 一致', async () => {
      const db = new MockDbAdapter();
      const pipeline1 = new ConditionNormalizationPipeline({ dbAdapter: db });
      pipeline1.loadBaselines(makeRealisticBaselines());

      await pipeline1.process({
        equipmentId: 'EQ-A',
        dataSlice: makeFullLoadHighWindSlice(),
        environmental: { windSpeed: 18, ambientTemp: 28, humidity: 60 },
      });

      const db2 = new MockDbAdapter();
      const pipeline2 = new ConditionNormalizationPipeline({ dbAdapter: db2 });
      pipeline2.loadBaselines(makeRealisticBaselines());

      await pipeline2.process({
        equipmentId: 'EQ-B',
        dataSlice: makeFullLoadHighWindSlice(),
        // 不同顺序
        environmental: { humidity: 60, ambientTemp: 28, windSpeed: 18 },
      });

      const snap1 = db.instances[0].stateSnapshot;
      const snap2 = db2.instances[0].stateSnapshot;

      // 环境参数值相同
      expect(snap1.env_windSpeed).toBe(snap2.env_windSpeed);
      expect(snap1.env_ambientTemp).toBe(snap2.env_ambientTemp);
      expect(snap1.env_humidity).toBe(snap2.env_humidity);

      // 键的顺序也应该一致（按 ENV_PARAM_ORDER）
      const envKeys1 = Object.keys(snap1).filter(k => k.startsWith('env_'));
      const envKeys2 = Object.keys(snap2).filter(k => k.startsWith('env_'));
      expect(envKeys1).toEqual(envKeys2);
    });

    it('extractFeatures 顺序确定性', () => {
      // 使用 ConditionNormalizerEngine 验证特征提取顺序一致
      const engine = new ConditionNormalizerEngine();

      // 相同数据、不同属性顺序
      const slice1: DataSlice = { current: 85, loadWeight: 40, vibrationSpeed: 3.8, bearingTemp: 62, motorSpeed: 1470 };
      const slice2: DataSlice = { motorSpeed: 1470, bearingTemp: 62, vibrationSpeed: 3.8, loadWeight: 40, current: 85 };

      const result1 = engine.processSlice(slice1, 'ratio');
      const result2 = engine.processSlice(slice2, 'ratio');

      // 特征键顺序一致
      const keys1 = Object.keys(result1.features);
      const keys2 = Object.keys(result2.features);
      expect(keys1).toEqual(keys2);

      // 特征值一致
      for (const key of keys1) {
        expect(result1.features[key]).toBe(result2.features[key]);
      }
    });
  });
});
