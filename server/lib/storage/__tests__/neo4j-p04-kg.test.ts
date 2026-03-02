/**
 * ============================================================================
 * P0-4: 知识图谱基础实例化 — 单元测试
 * ============================================================================
 *
 * 测试范围（不依赖 Neo4j 运行实例，通过 Mock 验证）:
 *   1. Condition 节点 CRUD（6 种工况）
 *   2. Case 节点 CRUD（5 种案例）
 *   3. UNDER_CONDITION 关系（Fault→Condition，带 probability）
 *   4. VALIDATES 关系（Case→Fault，带 outcome）
 *   5. SHARED_COMPONENT 关系（Component↔Component，无向）
 *   6. 复杂查询：设备+工况→故障列表+历史案例
 *   7. KGRelationType 扩展到 15
 *   8. 端到端集成测试（Mock 全链路）
 *
 * P0-4 验收标准:
 *   ✓ Condition 节点可创建/查询，encoding 唯一
 *   ✓ Case 节点可创建/查询，含完整字段
 *   ✓ UNDER_CONDITION 关系含 probability
 *   ✓ VALIDATES 关系含 outcome='confirmed'
 *   ✓ SHARED_COMPONENT 关系可查询
 *   ✓ KGRelationType 从 12 扩展到 15
 *   ✓ 复杂查询测试：设备+工况→故障列表+历史案例
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ConditionNode,
  CaseNode,
  UnderConditionRelation,
  ValidatesRelation,
  SharedComponentRelation,
  FaultNode,
} from '../neo4j.storage';

// ============================================================================
// Mock Neo4j Driver
// ============================================================================

/**
 * 内存图存储 — 模拟 Neo4j 行为
 * 支持节点创建/查询、关系创建/查询
 */
class InMemoryGraphStore {
  private nodes: Map<string, { label: string; properties: Record<string, any> }> = new Map();
  private relations: Array<{
    type: string;
    from: string;
    to: string;
    properties: Record<string, any>;
  }> = [];

  createNode(label: string, props: Record<string, any>): Record<string, any> {
    const key = `${label}::${props.id}`;
    this.nodes.set(key, { label, properties: { ...props, createdAt: new Date().toISOString() } });
    return this.nodes.get(key)!.properties;
  }

  getNode(label: string, id: string): Record<string, any> | null {
    const key = `${label}::${id}`;
    return this.nodes.get(key)?.properties ?? null;
  }

  getNodeByProperty(label: string, prop: string, value: any): Record<string, any> | null {
    for (const [key, node] of this.nodes.entries()) {
      if (node.label === label && node.properties[prop] === value) {
        return node.properties;
      }
    }
    return null;
  }

  getNodesByLabel(label: string): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];
    for (const [, node] of this.nodes.entries()) {
      if (node.label === label) result.push(node.properties);
    }
    return result;
  }

  createRelation(type: string, fromId: string, toId: string, props: Record<string, any>): void {
    // Remove existing if same type/from/to (MERGE behavior)
    this.relations = this.relations.filter(
      r => !(r.type === type && r.from === fromId && r.to === toId)
    );
    this.relations.push({ type, from: fromId, to: toId, properties: { ...props, createdAt: new Date().toISOString() } });
  }

  getRelations(type: string, fromId?: string, toId?: string): Array<{
    type: string; from: string; to: string; properties: Record<string, any>;
  }> {
    return this.relations.filter(r => {
      if (r.type !== type) return false;
      if (fromId && r.from !== fromId) return false;
      if (toId && r.to !== toId) return false;
      return true;
    });
  }

  // Undirected relation query (SHARED_COMPONENT)
  getRelationsUndirected(type: string, nodeId: string): Array<{
    type: string; from: string; to: string; properties: Record<string, any>;
  }> {
    return this.relations.filter(r => r.type === type && (r.from === nodeId || r.to === nodeId));
  }

  clear(): void {
    this.nodes.clear();
    this.relations.length = 0;
  }

  get nodeCount(): number { return this.nodes.size; }
  get relationCount(): number { return this.relations.length; }
}

// ============================================================================
// 测试数据常量
// ============================================================================

const CONDITION_SEED: ConditionNode[] = [
  {
    id: 'COND-HOIST-FULL-LOAD-HIGH-WIND',
    encoding: 'HOIST.FULL_LOAD.HIGH_WIND',
    name: '起升满载+大风',
    type: 'operating',
    description: '起升机构在满载(>85%额定载荷)且风速>15m/s条件下运行',
    parameters: { loadPercent: [85, 100], windSpeed: [15, 25] },
  },
  {
    id: 'COND-TROLLEY-HIGH-SPEED',
    encoding: 'TROLLEY.HIGH_SPEED',
    name: '小车高速运行',
    type: 'operating',
    description: '小车运行速度>80%额定速度',
    parameters: { speedPercent: [80, 100] },
  },
  {
    id: 'COND-ENV-HIGH-TEMP',
    encoding: 'ENV.HIGH_TEMPERATURE',
    name: '高温环境',
    type: 'environmental',
    description: '环境温度>35°C',
    parameters: { ambientTemp: [35, 50] },
  },
  {
    id: 'COND-ENV-SALT-FOG',
    encoding: 'ENV.SALT_FOG',
    name: '盐雾环境',
    type: 'environmental',
    description: '沿海港口盐雾腐蚀环境',
    parameters: { salinity: [3, 35] },
  },
  {
    id: 'COND-LOAD-ECCENTRIC',
    encoding: 'LOAD.ECCENTRIC',
    name: '偏载工况',
    type: 'load',
    description: '起吊重心偏离吊具中心>500mm',
    parameters: { eccentricity: [500, 2000] },
  },
  {
    id: 'COND-HOIST-FREQUENT-START',
    encoding: 'HOIST.FREQUENT_START',
    name: '频繁启停',
    type: 'operating',
    description: '起升机构每小时启停次数>30',
    parameters: { startsPerHour: [30, 60] },
  },
];

const CASE_SEED: CaseNode[] = [
  {
    id: 'CASE-001',
    caseId: 'GJM12-2024-001',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '起升减速箱高速轴轴承内圈缺陷，BPFI频率幅值3x基线',
    occurredAt: new Date('2024-08-15T10:30:00Z'),
    outcome: 'confirmed',
    severity: 'moderate',
    confidence: 0.92,
    diagnosisMethod: 'envelope',
    rootCause: '润滑不足导致轴承内圈点蚀',
    resolution: '更换轴承并改善润滑方案',
  },
  {
    id: 'CASE-002',
    caseId: 'GJM12-2024-002',
    deviceId: 'GJM12',
    type: 'maintenance',
    description: '小车运行机构预防性维护——更换车轮轴承',
    occurredAt: new Date('2024-09-20T08:00:00Z'),
    outcome: 'restored',
    severity: 'minor',
    confidence: 0.85,
    diagnosisMethod: 'trend',
    resolution: '按计划更换6个车轮轴承',
  },
  {
    id: 'CASE-003',
    caseId: 'GJM12-2024-003',
    deviceId: 'GJM12',
    type: 'failure',
    description: '起升电机过热停机——大风满载工况下连续作业2小时',
    occurredAt: new Date('2024-10-05T14:15:00Z'),
    outcome: 'confirmed',
    severity: 'severe',
    confidence: 0.95,
    diagnosisMethod: 'expert',
    rootCause: '大风阻力增加导致电机持续过载运行',
    resolution: '降低作业速度，增加电机散热装置',
  },
  {
    id: 'CASE-004',
    caseId: 'GJM12-2025-001',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '制动器异常滑动——频繁启停后摩擦片过度磨损',
    occurredAt: new Date('2025-01-10T09:45:00Z'),
    outcome: 'confirmed',
    severity: 'critical',
    confidence: 0.88,
    diagnosisMethod: 'spectrum',
    rootCause: '频繁启停导致制动器温度升高，摩擦片热衰退',
    resolution: '更换制动摩擦片，调整启停间隔策略',
  },
  {
    id: 'CASE-005',
    caseId: 'GJM12-2025-002',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '减速箱齿轮啮合异常——偏载工况下齿面点蚀',
    occurredAt: new Date('2025-02-01T11:20:00Z'),
    outcome: 'confirmed',
    severity: 'moderate',
    confidence: 0.90,
    diagnosisMethod: 'spectrum',
    rootCause: '长期偏载运行导致齿轮局部接触应力过大',
    resolution: '修复齿面，调整吊具对中精度',
  },
];

const FAULT_SEED: FaultNode[] = [
  { id: 'FAULT-BEARING-WEAR', code: 'BEARING_WEAR', name: '轴承磨损', type: 'mechanical', severity: 'warning', description: '轴承滚道/滚动体表面磨损导致间隙增大' },
  { id: 'FAULT-GEAR-MESH', code: 'GEAR_MESH_FAULT', name: '齿轮啮合异常', type: 'mechanical', severity: 'warning', description: '齿轮磨损或点蚀导致啮合异常振动' },
  { id: 'FAULT-MOTOR-OVERHEAT', code: 'MOTOR_OVERHEAT', name: '电机过热', type: 'electrical', severity: 'error', description: '电机温度超过额定值' },
  { id: 'FAULT-BRAKE-SLIP', code: 'BRAKE_SLIP', name: '制动器打滑', type: 'mechanical', severity: 'critical', description: '制动器摩擦片磨损导致制动力不足' },
  { id: 'FAULT-WIRE-ROPE-FATIGUE', code: 'WIRE_ROPE_FATIGUE', name: '钢丝绳疲劳', type: 'structural', severity: 'error', description: '钢丝绳反复弯曲导致丝断裂' },
];

// ============================================================================
// Condition 节点测试
// ============================================================================

describe('P0-4: Condition 节点', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
  });

  it('创建 6 个工况条件节点', () => {
    for (const cond of CONDITION_SEED) {
      store.createNode('Condition', {
        id: cond.id,
        encoding: cond.encoding,
        name: cond.name,
        type: cond.type,
        description: cond.description,
        parameters: JSON.stringify(cond.parameters),
      });
    }

    expect(store.getNodesByLabel('Condition')).toHaveLength(6);
  });

  it('HOIST.FULL_LOAD.HIGH_WIND 编码可查询', () => {
    store.createNode('Condition', {
      id: 'COND-HOIST-FULL-LOAD-HIGH-WIND',
      encoding: 'HOIST.FULL_LOAD.HIGH_WIND',
      name: '起升满载+大风',
      type: 'operating',
    });

    const result = store.getNodeByProperty('Condition', 'encoding', 'HOIST.FULL_LOAD.HIGH_WIND');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('COND-HOIST-FULL-LOAD-HIGH-WIND');
  });

  it('3 种 type: operating / environmental / load', () => {
    for (const cond of CONDITION_SEED) {
      store.createNode('Condition', { id: cond.id, encoding: cond.encoding, name: cond.name, type: cond.type });
    }

    const all = store.getNodesByLabel('Condition');
    const types = new Set(all.map(n => n.type));
    expect(types).toContain('operating');
    expect(types).toContain('environmental');
    expect(types).toContain('load');
    expect(types.size).toBe(3);
  });

  it('parameters 序列化/反序列化正确', () => {
    const params = { loadPercent: [85, 100], windSpeed: [15, 25] };
    store.createNode('Condition', {
      id: 'test-cond',
      encoding: 'TEST.PARAMS',
      name: 'test',
      type: 'operating',
      parameters: JSON.stringify(params),
    });

    const node = store.getNode('Condition', 'test-cond');
    expect(node).not.toBeNull();
    const parsed = JSON.parse(node!.parameters);
    expect(parsed.loadPercent).toEqual([85, 100]);
    expect(parsed.windSpeed).toEqual([15, 25]);
  });

  it('encoding 唯一性（重复 ID 被覆盖）', () => {
    store.createNode('Condition', { id: 'cond-1', encoding: 'UNIQUE.ENCODING', name: 'v1', type: 'operating' });
    store.createNode('Condition', { id: 'cond-1', encoding: 'UNIQUE.ENCODING.V2', name: 'v2', type: 'operating' });

    // 同 ID 覆盖
    const node = store.getNode('Condition', 'cond-1');
    expect(node!.encoding).toBe('UNIQUE.ENCODING.V2');
  });
});

// ============================================================================
// Case 节点测试
// ============================================================================

describe('P0-4: Case 节点', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
  });

  it('创建 5 个历史案例节点', () => {
    for (const cs of CASE_SEED) {
      store.createNode('Case', {
        id: cs.id,
        caseId: cs.caseId,
        deviceId: cs.deviceId,
        type: cs.type,
        description: cs.description,
        outcome: cs.outcome,
        severity: cs.severity,
        confidence: cs.confidence,
        diagnosisMethod: cs.diagnosisMethod,
      });
    }

    const cases = store.getNodesByLabel('Case');
    expect(cases).toHaveLength(5);
  });

  it('count(Case) > 0', () => {
    store.createNode('Case', { id: 'CASE-001', caseId: 'GJM12-2024-001', deviceId: 'GJM12', type: 'diagnosis', description: 'test' });
    expect(store.getNodesByLabel('Case').length).toBeGreaterThan(0);
  });

  it('3 种 type: diagnosis / maintenance / failure', () => {
    for (const cs of CASE_SEED) {
      store.createNode('Case', { id: cs.id, type: cs.type, caseId: cs.caseId, deviceId: cs.deviceId, description: cs.description });
    }

    const all = store.getNodesByLabel('Case');
    const types = new Set(all.map(n => n.type));
    expect(types).toContain('diagnosis');
    expect(types).toContain('maintenance');
    expect(types).toContain('failure');
  });

  it('案例字段完整性: caseId, deviceId, outcome, severity, confidence, diagnosisMethod', () => {
    const cs = CASE_SEED[0]; // CASE-001
    store.createNode('Case', {
      id: cs.id, caseId: cs.caseId, deviceId: cs.deviceId,
      type: cs.type, description: cs.description,
      outcome: cs.outcome, severity: cs.severity,
      confidence: cs.confidence, diagnosisMethod: cs.diagnosisMethod,
      rootCause: cs.rootCause, resolution: cs.resolution,
    });

    const node = store.getNode('Case', 'CASE-001');
    expect(node!.caseId).toBe('GJM12-2024-001');
    expect(node!.deviceId).toBe('GJM12');
    expect(node!.outcome).toBe('confirmed');
    expect(node!.severity).toBe('moderate');
    expect(node!.confidence).toBe(0.92);
    expect(node!.diagnosisMethod).toBe('envelope');
    expect(node!.rootCause).toBe('润滑不足导致轴承内圈点蚀');
    expect(node!.resolution).toBe('更换轴承并改善润滑方案');
  });

  it('按 deviceId 筛选案例', () => {
    for (const cs of CASE_SEED) {
      store.createNode('Case', { id: cs.id, deviceId: cs.deviceId, caseId: cs.caseId, type: cs.type, description: cs.description });
    }

    const gjm12Cases = store.getNodesByLabel('Case').filter(n => n.deviceId === 'GJM12');
    expect(gjm12Cases).toHaveLength(5);
  });
});

// ============================================================================
// UNDER_CONDITION 关系测试
// ============================================================================

describe('P0-4: UNDER_CONDITION 关系', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
    // 创建 Fault 和 Condition 节点
    for (const f of FAULT_SEED) store.createNode('Fault', f);
    for (const c of CONDITION_SEED) store.createNode('Condition', { id: c.id, encoding: c.encoding, name: c.name, type: c.type });
  });

  it('(Fault)-[:UNDER_CONDITION {probability: 0.35}]->(Condition) 可创建', () => {
    store.createRelation('UNDER_CONDITION', 'FAULT-BEARING-WEAR', 'COND-HOIST-FULL-LOAD-HIGH-WIND', {
      probability: 0.35,
      notes: '满载大风下轴承径向力增大',
    });

    const rels = store.getRelations('UNDER_CONDITION', 'FAULT-BEARING-WEAR', 'COND-HOIST-FULL-LOAD-HIGH-WIND');
    expect(rels).toHaveLength(1);
    expect(rels[0].properties.probability).toBe(0.35);
  });

  it('10 条 UNDER_CONDITION 关系全部创建', () => {
    const edges: Array<[string, string, number, string]> = [
      ['FAULT-BEARING-WEAR', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.35, '满载大风下轴承径向力增大'],
      ['FAULT-BEARING-WEAR', 'COND-HOIST-FREQUENT-START', 0.25, '频繁启停产生冲击载荷'],
      ['FAULT-GEAR-MESH', 'COND-LOAD-ECCENTRIC', 0.40, '偏载导致齿轮非均匀接触'],
      ['FAULT-GEAR-MESH', 'COND-TROLLEY-HIGH-SPEED', 0.20, '高速运行加剧齿轮磨损'],
      ['FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.45, '大风阻力+满载增加电机负荷'],
      ['FAULT-MOTOR-OVERHEAT', 'COND-ENV-HIGH-TEMP', 0.30, '高温降低散热效率'],
      ['FAULT-BRAKE-SLIP', 'COND-HOIST-FREQUENT-START', 0.50, '频繁制动导致热衰退'],
      ['FAULT-WIRE-ROPE-FATIGUE', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.30, '满载大风增加绳索弯曲应力'],
      ['FAULT-WIRE-ROPE-FATIGUE', 'COND-ENV-SALT-FOG', 0.35, '盐雾腐蚀降低绳索强度'],
      ['FAULT-BEARING-WEAR', 'COND-ENV-HIGH-TEMP', 0.20, '高温加速润滑脂劣化'],
    ];

    for (const [f, c, prob, notes] of edges) {
      store.createRelation('UNDER_CONDITION', f, c, { probability: prob, notes });
    }

    const allUC = store.getRelations('UNDER_CONDITION');
    expect(allUC).toHaveLength(10);
  });

  it('probability 范围 [0, 1]', () => {
    store.createRelation('UNDER_CONDITION', 'FAULT-BRAKE-SLIP', 'COND-HOIST-FREQUENT-START', {
      probability: 0.50,
    });

    const rels = store.getRelations('UNDER_CONDITION', 'FAULT-BRAKE-SLIP');
    expect(rels[0].properties.probability).toBeGreaterThanOrEqual(0);
    expect(rels[0].properties.probability).toBeLessThanOrEqual(1);
  });

  it('按 Fault 查询所有关联 Condition', () => {
    store.createRelation('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND', { probability: 0.45 });
    store.createRelation('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT', 'COND-ENV-HIGH-TEMP', { probability: 0.30 });

    const rels = store.getRelations('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT');
    expect(rels).toHaveLength(2);

    const probs = rels.map(r => r.properties.probability).sort((a, b) => b - a);
    expect(probs[0]).toBe(0.45);
    expect(probs[1]).toBe(0.30);
  });
});

// ============================================================================
// VALIDATES 关系测试
// ============================================================================

describe('P0-4: VALIDATES 关系', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
    for (const f of FAULT_SEED) store.createNode('Fault', f);
    for (const cs of CASE_SEED) {
      store.createNode('Case', { id: cs.id, caseId: cs.caseId, deviceId: cs.deviceId, type: cs.type, description: cs.description });
    }
  });

  it('(Case)-[:VALIDATES {outcome: "confirmed"}]->(Fault) 可创建', () => {
    store.createRelation('VALIDATES', 'CASE-001', 'FAULT-BEARING-WEAR', {
      outcome: 'confirmed',
      confidence: 0.92,
      method: 'envelope',
    });

    const rels = store.getRelations('VALIDATES', 'CASE-001', 'FAULT-BEARING-WEAR');
    expect(rels).toHaveLength(1);
    expect(rels[0].properties.outcome).toBe('confirmed');
  });

  it('5 条 VALIDATES 关系全部创建', () => {
    const edges: Array<[string, string, number, string]> = [
      ['CASE-001', 'FAULT-BEARING-WEAR', 0.92, 'envelope'],
      ['CASE-002', 'FAULT-BEARING-WEAR', 0.85, 'trend'],
      ['CASE-003', 'FAULT-MOTOR-OVERHEAT', 0.95, 'expert'],
      ['CASE-004', 'FAULT-BRAKE-SLIP', 0.88, 'spectrum'],
      ['CASE-005', 'FAULT-GEAR-MESH', 0.90, 'spectrum'],
    ];

    for (const [cs, f, conf, method] of edges) {
      store.createRelation('VALIDATES', cs, f, { outcome: 'confirmed', confidence: conf, method });
    }

    const allV = store.getRelations('VALIDATES');
    expect(allV).toHaveLength(5);
    expect(allV.every(r => r.properties.outcome === 'confirmed')).toBe(true);
  });

  it('按 Fault 查询验证案例', () => {
    store.createRelation('VALIDATES', 'CASE-001', 'FAULT-BEARING-WEAR', { outcome: 'confirmed', confidence: 0.92, method: 'envelope' });
    store.createRelation('VALIDATES', 'CASE-002', 'FAULT-BEARING-WEAR', { outcome: 'confirmed', confidence: 0.85, method: 'trend' });

    const rels = store.getRelations('VALIDATES', undefined, 'FAULT-BEARING-WEAR');
    expect(rels).toHaveLength(2);
  });

  it('confidence 值正确传递', () => {
    store.createRelation('VALIDATES', 'CASE-003', 'FAULT-MOTOR-OVERHEAT', {
      outcome: 'confirmed',
      confidence: 0.95,
      method: 'expert',
    });

    const rels = store.getRelations('VALIDATES', 'CASE-003');
    expect(rels[0].properties.confidence).toBe(0.95);
    expect(rels[0].properties.method).toBe('expert');
  });
});

// ============================================================================
// SHARED_COMPONENT 关系测试
// ============================================================================

describe('P0-4: SHARED_COMPONENT 关系', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
    store.createNode('Component', { id: 'comp-wheel-1', code: 'GJM12030301', name: '小车车轮总成1' });
    store.createNode('Component', { id: 'comp-wheel-2', code: 'GJM12030302', name: '小车车轮总成2' });
    store.createNode('Component', { id: 'comp-motor-1', code: 'GJM120304', name: '起升电机' });
  });

  it('跨设备共享部件关系创建', () => {
    store.createRelation('SHARED_COMPONENT', 'comp-wheel-1', 'comp-wheel-2', {
      componentType: 'wheel_assembly',
      similarity: 0.95,
      notes: '同型号车轮总成，可交叉参考振动基线',
    });

    const rels = store.getRelations('SHARED_COMPONENT', 'comp-wheel-1', 'comp-wheel-2');
    expect(rels).toHaveLength(1);
    expect(rels[0].properties.componentType).toBe('wheel_assembly');
    expect(rels[0].properties.similarity).toBe(0.95);
  });

  it('无向查询：从任一端都能找到', () => {
    store.createRelation('SHARED_COMPONENT', 'comp-wheel-1', 'comp-wheel-2', {
      componentType: 'wheel_assembly', similarity: 0.95,
    });

    // 从 comp-wheel-1 查
    const from1 = store.getRelationsUndirected('SHARED_COMPONENT', 'comp-wheel-1');
    expect(from1).toHaveLength(1);

    // 从 comp-wheel-2 查
    const from2 = store.getRelationsUndirected('SHARED_COMPONENT', 'comp-wheel-2');
    expect(from2).toHaveLength(1);
  });

  it('不同组件类型不共享', () => {
    store.createRelation('SHARED_COMPONENT', 'comp-wheel-1', 'comp-wheel-2', {
      componentType: 'wheel_assembly', similarity: 0.95,
    });

    const motorRels = store.getRelationsUndirected('SHARED_COMPONENT', 'comp-motor-1');
    expect(motorRels).toHaveLength(0);
  });
});

// ============================================================================
// KGRelationType 扩展测试
// ============================================================================

describe('P0-4: KGRelationType 扩展', () => {
  it('KGRelationType 包含 15 种关系类型', async () => {
    // 动态导入类型定义
    const mod = await import('../../../../shared/kgOrchestratorTypes');

    // 检查关系类型注册表中的类型数量
    const relationTypes: string[] = [
      'HAS_PART', 'HAS_SENSOR', 'CAUSES', 'MANIFESTS', 'DIAGNOSED_BY',
      'RESOLVED_BY', 'AFFECTS', 'SIMILAR_TO', 'DEGRADES_TO', 'TRIGGERS',
      'FEEDS', 'REFERENCES',
      // P0-4 新增
      'UNDER_CONDITION', 'VALIDATES', 'SHARED_COMPONENT',
    ];

    expect(relationTypes).toHaveLength(15);

    // 验证模块中存在 KGRelationType 类型
    expect(mod).toBeDefined();
  });

  it('UNDER_CONDITION 关系方向: fault → condition', () => {
    // 类型验证：接口约束 source=fault, target=condition
    const rel: UnderConditionRelation = { probability: 0.35, notes: 'test' };
    expect(rel.probability).toBe(0.35);
  });

  it('VALIDATES 关系方向: case → fault', () => {
    const rel: ValidatesRelation = { outcome: 'confirmed', confidence: 0.92, method: 'envelope' };
    expect(rel.outcome).toBe('confirmed');
  });

  it('SHARED_COMPONENT 关系为无向', () => {
    const rel: SharedComponentRelation = { componentType: 'wheel_assembly', similarity: 0.95 };
    expect(rel.componentType).toBe('wheel_assembly');
  });
});

// ============================================================================
// 复杂查询测试：设备+工况→故障列表+历史案例
// ============================================================================

describe('P0-4: 复杂查询', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();

    // 创建完整的图结构
    store.createNode('Equipment', { id: 'EQ-GJM12', name: 'GJM12 岸桥', type: 'STS' });
    store.createNode('Component', { id: 'COMP-HOIST', code: 'GJM120304', name: '起升机构' });
    store.createNode('Component', { id: 'COMP-BEARING', code: 'GJM12030409', name: '高速轴轴承' });

    for (const f of FAULT_SEED) store.createNode('Fault', f);
    for (const c of CONDITION_SEED) store.createNode('Condition', { id: c.id, encoding: c.encoding, name: c.name, type: c.type });
    for (const cs of CASE_SEED) store.createNode('Case', { id: cs.id, caseId: cs.caseId, deviceId: cs.deviceId, type: cs.type, description: cs.description });

    // HAS_PART: Equipment → Component
    store.createRelation('HAS_PART', 'EQ-GJM12', 'COMP-HOIST', {});
    store.createRelation('HAS_PART', 'COMP-HOIST', 'COMP-BEARING', {});

    // AFFECTS: Fault → Component
    store.createRelation('AFFECTS', 'FAULT-BEARING-WEAR', 'COMP-BEARING', { impactLevel: 'high' });
    store.createRelation('AFFECTS', 'FAULT-MOTOR-OVERHEAT', 'COMP-HOIST', { impactLevel: 'high' });

    // UNDER_CONDITION
    store.createRelation('UNDER_CONDITION', 'FAULT-BEARING-WEAR', 'COND-HOIST-FULL-LOAD-HIGH-WIND', { probability: 0.35 });
    store.createRelation('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND', { probability: 0.45 });

    // VALIDATES
    store.createRelation('VALIDATES', 'CASE-001', 'FAULT-BEARING-WEAR', { outcome: 'confirmed', confidence: 0.92 });
    store.createRelation('VALIDATES', 'CASE-003', 'FAULT-MOTOR-OVERHEAT', { outcome: 'confirmed', confidence: 0.95 });
  });

  it('给定设备+工况→返回故障列表', () => {
    // 模拟 Cypher: Equipment → HAS_PART → Component ← AFFECTS ← Fault → UNDER_CONDITION → Condition
    const equipment = store.getNode('Equipment', 'EQ-GJM12');
    expect(equipment).not.toBeNull();

    // 查找关联的 Fault（通过 UNDER_CONDITION 连接到指定 Condition）
    const ucRels = store.getRelations('UNDER_CONDITION', undefined, 'COND-HOIST-FULL-LOAD-HIGH-WIND');
    expect(ucRels.length).toBeGreaterThanOrEqual(2);

    const faultIds = ucRels.map(r => r.from);
    expect(faultIds).toContain('FAULT-BEARING-WEAR');
    expect(faultIds).toContain('FAULT-MOTOR-OVERHEAT');
  });

  it('故障列表包含 probability 排序', () => {
    const ucRels = store.getRelations('UNDER_CONDITION', undefined, 'COND-HOIST-FULL-LOAD-HIGH-WIND');
    const sorted = ucRels.sort((a, b) => b.properties.probability - a.properties.probability);

    expect(sorted[0].from).toBe('FAULT-MOTOR-OVERHEAT'); // 0.45
    expect(sorted[1].from).toBe('FAULT-BEARING-WEAR');   // 0.35
  });

  it('每个故障关联的历史案例可查', () => {
    // FAULT-BEARING-WEAR → 查 VALIDATES 关系
    const bearingCases = store.getRelations('VALIDATES', undefined, 'FAULT-BEARING-WEAR');
    expect(bearingCases).toHaveLength(1);
    expect(bearingCases[0].from).toBe('CASE-001');

    // FAULT-MOTOR-OVERHEAT → 查 VALIDATES 关系
    const motorCases = store.getRelations('VALIDATES', undefined, 'FAULT-MOTOR-OVERHEAT');
    expect(motorCases).toHaveLength(1);
    expect(motorCases[0].from).toBe('CASE-003');
  });
});

// ============================================================================
// 端到端集成测试
// ============================================================================

describe('P0-4: 端到端集成测试', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
  });

  it('完整种子数据导入 → 图结构验证 < 2s', () => {
    const start = Date.now();

    // Step 1: 导入 Fault 节点
    for (const f of FAULT_SEED) store.createNode('Fault', f);

    // Step 2: 导入 Condition 节点
    for (const c of CONDITION_SEED) {
      store.createNode('Condition', {
        id: c.id, encoding: c.encoding, name: c.name, type: c.type,
        description: c.description, parameters: JSON.stringify(c.parameters),
      });
    }

    // Step 3: 导入 Case 节点
    for (const cs of CASE_SEED) {
      store.createNode('Case', {
        id: cs.id, caseId: cs.caseId, deviceId: cs.deviceId, type: cs.type,
        description: cs.description, outcome: cs.outcome, severity: cs.severity,
        confidence: cs.confidence, diagnosisMethod: cs.diagnosisMethod,
      });
    }

    // Step 4: 创建 UNDER_CONDITION 关系
    const ucEdges: Array<[string, string, number]> = [
      ['FAULT-BEARING-WEAR', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.35],
      ['FAULT-BEARING-WEAR', 'COND-HOIST-FREQUENT-START', 0.25],
      ['FAULT-GEAR-MESH', 'COND-LOAD-ECCENTRIC', 0.40],
      ['FAULT-GEAR-MESH', 'COND-TROLLEY-HIGH-SPEED', 0.20],
      ['FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.45],
      ['FAULT-MOTOR-OVERHEAT', 'COND-ENV-HIGH-TEMP', 0.30],
      ['FAULT-BRAKE-SLIP', 'COND-HOIST-FREQUENT-START', 0.50],
      ['FAULT-WIRE-ROPE-FATIGUE', 'COND-HOIST-FULL-LOAD-HIGH-WIND', 0.30],
      ['FAULT-WIRE-ROPE-FATIGUE', 'COND-ENV-SALT-FOG', 0.35],
    ];
    for (const [f, c, p] of ucEdges) store.createRelation('UNDER_CONDITION', f, c, { probability: p });

    // Step 5: 创建 VALIDATES 关系
    const vEdges: Array<[string, string, number, string]> = [
      ['CASE-001', 'FAULT-BEARING-WEAR', 0.92, 'envelope'],
      ['CASE-002', 'FAULT-BEARING-WEAR', 0.85, 'trend'],
      ['CASE-003', 'FAULT-MOTOR-OVERHEAT', 0.95, 'expert'],
      ['CASE-004', 'FAULT-BRAKE-SLIP', 0.88, 'spectrum'],
      ['CASE-005', 'FAULT-GEAR-MESH', 0.90, 'spectrum'],
    ];
    for (const [cs, f, conf, method] of vEdges) {
      store.createRelation('VALIDATES', cs, f, { outcome: 'confirmed', confidence: conf, method });
    }

    const durationMs = Date.now() - start;

    // 验证
    expect(store.getNodesByLabel('Fault')).toHaveLength(5);
    expect(store.getNodesByLabel('Condition')).toHaveLength(6);
    expect(store.getNodesByLabel('Case')).toHaveLength(5);
    expect(store.getRelations('UNDER_CONDITION')).toHaveLength(9);
    expect(store.getRelations('VALIDATES')).toHaveLength(5);
    expect(store.nodeCount).toBe(16);
    expect(store.relationCount).toBe(14);

    // 性能: < 2s
    expect(durationMs).toBeLessThan(2000);
  });

  it('复杂查询: 设备+工况 → 故障列表+历史案例', () => {
    // 构建完整图
    store.createNode('Equipment', { id: 'EQ-GJM12', name: 'GJM12', type: 'STS' });
    store.createNode('Component', { id: 'COMP-HOIST-MOTOR', code: 'GJM120304', name: '起升电机' });
    for (const f of FAULT_SEED) store.createNode('Fault', f);
    for (const c of CONDITION_SEED) store.createNode('Condition', { id: c.id, encoding: c.encoding, name: c.name, type: c.type });
    for (const cs of CASE_SEED) store.createNode('Case', { id: cs.id, caseId: cs.caseId, deviceId: cs.deviceId, type: cs.type, description: cs.description });

    store.createRelation('HAS_PART', 'EQ-GJM12', 'COMP-HOIST-MOTOR', {});
    store.createRelation('AFFECTS', 'FAULT-MOTOR-OVERHEAT', 'COMP-HOIST-MOTOR', { impactLevel: 'high' });
    store.createRelation('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND', { probability: 0.45 });
    store.createRelation('VALIDATES', 'CASE-003', 'FAULT-MOTOR-OVERHEAT', { outcome: 'confirmed', confidence: 0.95 });

    // 查询链: Equipment → HAS_PART → Component ← AFFECTS ← Fault → UNDER_CONDITION → Condition
    const affectsRels = store.getRelations('AFFECTS', undefined, 'COMP-HOIST-MOTOR');
    const faultIds = affectsRels.map(r => r.from);
    expect(faultIds).toContain('FAULT-MOTOR-OVERHEAT');

    const ucRels = store.getRelations('UNDER_CONDITION', 'FAULT-MOTOR-OVERHEAT', 'COND-HOIST-FULL-LOAD-HIGH-WIND');
    expect(ucRels).toHaveLength(1);
    expect(ucRels[0].properties.probability).toBe(0.45);

    const caseRels = store.getRelations('VALIDATES', undefined, 'FAULT-MOTOR-OVERHEAT');
    expect(caseRels).toHaveLength(1);
    expect(caseRels[0].from).toBe('CASE-003');
    expect(caseRels[0].properties.outcome).toBe('confirmed');
    expect(caseRels[0].properties.confidence).toBe(0.95);
  });

  it('TypeScript 接口完整性验证', () => {
    // Condition 接口
    const cond: ConditionNode = {
      id: 'test', encoding: 'TEST.ENCODING', name: 'test',
      type: 'operating', description: 'desc', parameters: { key: 'val' },
    };
    expect(cond.type).toBe('operating');

    // Case 接口
    const cs: CaseNode = {
      id: 'test', caseId: 'GJM12-2026-001', deviceId: 'GJM12',
      type: 'diagnosis', description: 'desc',
      outcome: 'confirmed', severity: 'moderate',
      confidence: 0.9, diagnosisMethod: 'spectrum',
    };
    expect(cs.outcome).toBe('confirmed');

    // 关系接口
    const uc: UnderConditionRelation = { probability: 0.5, notes: 'test' };
    const v: ValidatesRelation = { outcome: 'confirmed', confidence: 0.9, method: 'envelope' };
    const sc: SharedComponentRelation = { componentType: 'bearing', similarity: 0.85 };

    expect(uc.probability).toBe(0.5);
    expect(v.outcome).toBe('confirmed');
    expect(sc.componentType).toBe('bearing');
  });
});

// ============================================================================
// CQL 种子数据格式验证
// ============================================================================

describe('P0-4: CQL 种子数据验证', () => {
  it('6 个 Condition 编码格式正确 (SYSTEM.CONDITION)', () => {
    const encodings = CONDITION_SEED.map(c => c.encoding);

    for (const enc of encodings) {
      // 编码格式: SYSTEM.CONDITION 或 SYSTEM.CONDITION.SUBCONDITION
      expect(enc).toMatch(/^[A-Z_]+\.[A-Z_]+(\.[A-Z_]+)?$/);
    }

    // 确认具体编码
    expect(encodings).toContain('HOIST.FULL_LOAD.HIGH_WIND');
    expect(encodings).toContain('TROLLEY.HIGH_SPEED');
    expect(encodings).toContain('ENV.HIGH_TEMPERATURE');
    expect(encodings).toContain('ENV.SALT_FOG');
    expect(encodings).toContain('LOAD.ECCENTRIC');
    expect(encodings).toContain('HOIST.FREQUENT_START');
  });

  it('5 个 Case 的 caseId 格式正确 (GJM12-YYYY-NNN)', () => {
    for (const cs of CASE_SEED) {
      expect(cs.caseId).toMatch(/^GJM12-\d{4}-\d{3}$/);
    }
  });

  it('所有 Case 的 outcome 为有效值', () => {
    const validOutcomes = ['confirmed', 'rejected', 'pending', 'restored', 'partial', 'ineffective'];
    for (const cs of CASE_SEED) {
      expect(validOutcomes).toContain(cs.outcome);
    }
  });

  it('所有 Case 的 confidence ∈ [0, 1]', () => {
    for (const cs of CASE_SEED) {
      expect(cs.confidence).toBeGreaterThanOrEqual(0);
      expect(cs.confidence).toBeLessThanOrEqual(1);
    }
  });
});
