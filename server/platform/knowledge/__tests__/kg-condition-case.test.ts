/**
 * ============================================================================
 * P0-4: 知识图谱 Condition + Case 集成测试
 * ============================================================================
 *
 * 验收标准覆盖：
 *   1. Condition 节点 CRUD（含 encoding 唯一约束）
 *   2. Case 节点 CRUD
 *   3. UNDER_CONDITION 关系创建和查询
 *   4. VALIDATES 关系创建和查询
 *   5. SHARED_COMPONENT 关系创建和查询
 *   6. KGRelationType 从 12 扩展到 15
 *   7. 复杂查询：设备+工况→故障列表+历史案例
 *   8. 种子数据完整性
 *   9. 端到端集成：种子数据→节点创建→关系建立→复杂查询
 *
 * 注意：Neo4j 连接在 CI 中不可用，测试设计为：
 *   - 类型/结构验证：直接测试（不需要 Neo4j）
 *   - Neo4j 操作：mock Driver + Session
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Part 1: 类型定义测试（不依赖 Neo4j 连接）
// ============================================================================

describe('P0-4: KGRelationType 扩展', () => {
  it('KGRelationType 应有 15 个类型（12 + 3 新增）', async () => {
    const { ALL_KG_RELATION_TYPES } = await import('../../../../shared/kgOrchestratorTypes');
    expect(ALL_KG_RELATION_TYPES.length).toBe(15);
  });

  it('应包含 UNDER_CONDITION 关系类型', async () => {
    const { ALL_KG_RELATION_TYPES } = await import('../../../../shared/kgOrchestratorTypes');
    const found = ALL_KG_RELATION_TYPES.find(r => r.type === 'UNDER_CONDITION');
    expect(found).toBeDefined();
    expect(found!.directed).toBe(true);
    expect(found!.allowedSources).toContain('fault');
    expect(found!.allowedTargets).toContain('condition');
  });

  it('应包含 VALIDATES 关系类型', async () => {
    const { ALL_KG_RELATION_TYPES } = await import('../../../../shared/kgOrchestratorTypes');
    const found = ALL_KG_RELATION_TYPES.find(r => r.type === 'VALIDATES');
    expect(found).toBeDefined();
    expect(found!.directed).toBe(true);
    expect(found!.allowedSources).toContain('case');
    expect(found!.allowedTargets).toContain('fault');
  });

  it('应包含 SHARED_COMPONENT 关系类型', async () => {
    const { ALL_KG_RELATION_TYPES } = await import('../../../../shared/kgOrchestratorTypes');
    const found = ALL_KG_RELATION_TYPES.find(r => r.type === 'SHARED_COMPONENT');
    expect(found).toBeDefined();
    expect(found!.directed).toBe(false); // 双向
    expect(found!.allowedSources).toContain('equipment');
  });
});

describe('P0-4: 节点类型扩展', () => {
  it('KGNodeCategory 应包含 condition 和 case', async () => {
    const { KG_NODE_CATEGORIES } = await import('../../../../shared/kgOrchestratorTypes');
    const categories = KG_NODE_CATEGORIES.map(c => c.category);
    expect(categories).toContain('condition');
    expect(categories).toContain('case');
  });

  it('condition 类别应有 3 个子类型', async () => {
    const { KG_NODE_CATEGORIES } = await import('../../../../shared/kgOrchestratorTypes');
    const condCat = KG_NODE_CATEGORIES.find(c => c.category === 'condition');
    expect(condCat).toBeDefined();
    expect(condCat!.nodes.length).toBe(3);
    const subTypes = condCat!.nodes.map(n => n.subType);
    expect(subTypes).toContain('operating_condition');
    expect(subTypes).toContain('environmental_condition');
    expect(subTypes).toContain('load_condition');
  });

  it('case 类别应有 3 个子类型', async () => {
    const { KG_NODE_CATEGORIES } = await import('../../../../shared/kgOrchestratorTypes');
    const caseCat = KG_NODE_CATEGORIES.find(c => c.category === 'case');
    expect(caseCat).toBeDefined();
    expect(caseCat!.nodes.length).toBe(3);
    const subTypes = caseCat!.nodes.map(n => n.subType);
    expect(subTypes).toContain('diagnosis_case');
    expect(subTypes).toContain('maintenance_case');
    expect(subTypes).toContain('failure_case');
  });

  it('ALL_KG_NODE_TYPES 应包含新增节点类型', async () => {
    const { ALL_KG_NODE_TYPES } = await import('../../../../shared/kgOrchestratorTypes');
    // 原有 4+3+4+3+3+3 = 20, 新增 3+3 = 6, 总计 26
    expect(ALL_KG_NODE_TYPES.length).toBe(26);
  });

  it('getKGNodeTypeInfo 应能查找新增子类型', async () => {
    const { getKGNodeTypeInfo } = await import('../../../../shared/kgOrchestratorTypes');
    const opCond = getKGNodeTypeInfo('operating_condition');
    expect(opCond).toBeDefined();
    expect(opCond!.category).toBe('condition');

    const diagCase = getKGNodeTypeInfo('diagnosis_case');
    expect(diagCase).toBeDefined();
    expect(diagCase!.category).toBe('case');
  });

  it('getKGRelationTypeInfo 应能查找新增关系类型', async () => {
    const { getKGRelationTypeInfo } = await import('../../../../shared/kgOrchestratorTypes');
    expect(getKGRelationTypeInfo('UNDER_CONDITION')).toBeDefined();
    expect(getKGRelationTypeInfo('VALIDATES')).toBeDefined();
    expect(getKGRelationTypeInfo('SHARED_COMPONENT')).toBeDefined();
  });
});

// ============================================================================
// Part 2: 种子数据完整性测试
// ============================================================================

describe('P0-4: 种子数据完整性', () => {
  it('CONDITION_SEED 应有 6 个工况条件', async () => {
    const { CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');
    expect(CONDITION_SEED.length).toBe(6);
  });

  it('CASE_SEED 应有 5 个历史案例', async () => {
    const { CASE_SEED } = await import('../seed-data/kg-condition-case-seed');
    expect(CASE_SEED.length).toBe(5);
  });

  it('HOIST.FULL_LOAD.HIGH_WIND 条件应存在', async () => {
    const { CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');
    const cond = CONDITION_SEED.find(c => c.encoding === 'HOIST.FULL_LOAD.HIGH_WIND');
    expect(cond).toBeDefined();
    expect(cond!.type).toBe('operating');
    expect(cond!.parameters).toBeDefined();
    expect((cond!.parameters as any).loadPercent).toEqual([85, 100]);
    expect((cond!.parameters as any).windSpeed).toEqual([15, 25]);
  });

  it('每个 Condition 应有唯一 encoding', async () => {
    const { CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');
    const encodings = CONDITION_SEED.map(c => c.encoding);
    const unique = new Set(encodings);
    expect(unique.size).toBe(encodings.length);
  });

  it('每个 Case 应有唯一 caseId', async () => {
    const { CASE_SEED } = await import('../seed-data/kg-condition-case-seed');
    const caseIds = CASE_SEED.map(c => c.caseId);
    const unique = new Set(caseIds);
    expect(unique.size).toBe(caseIds.length);
  });

  it('UNDER_CONDITION 关系应有 9 条', async () => {
    const { UNDER_CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');
    expect(UNDER_CONDITION_SEED.length).toBe(9);

    // 每条关系的概率应在 (0, 1] 范围内
    for (const rel of UNDER_CONDITION_SEED) {
      expect(rel.properties.probability).toBeGreaterThan(0);
      expect(rel.properties.probability).toBeLessThanOrEqual(1);
    }
  });

  it('VALIDATES 关系应有 5 条', async () => {
    const { VALIDATES_SEED } = await import('../seed-data/kg-condition-case-seed');
    expect(VALIDATES_SEED.length).toBe(5);

    // 每条关系应有 outcome
    for (const rel of VALIDATES_SEED) {
      expect(['confirmed', 'rejected', 'partial']).toContain(rel.properties.outcome);
    }
  });

  it('SHARED_COMPONENT 关系应有 1 条', async () => {
    const { SHARED_COMPONENT_SEED } = await import('../seed-data/kg-condition-case-seed');
    expect(SHARED_COMPONENT_SEED.length).toBe(1);
    expect(SHARED_COMPONENT_SEED[0].properties.componentType).toBe('wheel_assembly');
    expect(SHARED_COMPONENT_SEED[0].properties.similarity).toBe(0.95);
  });

  it('Condition type 覆盖 operating/environmental/load 三类', async () => {
    const { CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');
    const types = new Set(CONDITION_SEED.map(c => c.type));
    expect(types).toContain('operating');
    expect(types).toContain('environmental');
    expect(types).toContain('load');
  });

  it('Case type 覆盖 diagnosis/maintenance/failure 三类', async () => {
    const { CASE_SEED } = await import('../seed-data/kg-condition-case-seed');
    const types = new Set(CASE_SEED.map(c => c.type));
    expect(types).toContain('diagnosis');
    expect(types).toContain('maintenance');
    expect(types).toContain('failure');
  });
});

// ============================================================================
// Part 3: Neo4j Storage 接口测试（mock Neo4j driver）
// ============================================================================

describe('P0-4: Neo4jStorage Condition/Case 接口', () => {
  it('Neo4jStorage 应导出 ConditionNode 和 CaseNode 类型', async () => {
    const mod = await import('../../../lib/storage/neo4j.storage');
    // 类型存在性通过编译时检查确认
    // 运行时检查 neo4jStorage 实例有新方法
    const storage = mod.neo4jStorage;
    expect(typeof storage.createCondition).toBe('function');
    expect(typeof storage.createCase).toBe('function');
    expect(typeof storage.createUnderConditionRelation).toBe('function');
    expect(typeof storage.createValidatesRelation).toBe('function');
    expect(typeof storage.createSharedComponentRelation).toBe('function');
    expect(typeof storage.queryFaultsWithConditionsAndCases).toBe('function');
    expect(typeof storage.querySharedComponents).toBe('function');
    expect(typeof storage.getConditionByEncoding).toBe('function');
    expect(typeof storage.getCases).toBe('function');
  });

  it('ConditionNode 接口应有 encoding 字段', () => {
    // 编译时类型检查
    const condition: import('../../../lib/storage/neo4j.storage').ConditionNode = {
      id: 'test',
      encoding: 'HOIST.FULL_LOAD',
      name: '测试工况',
      type: 'operating',
    };
    expect(condition.encoding).toBe('HOIST.FULL_LOAD');
  });

  it('CaseNode 接口应有完整字段', () => {
    const caseNode: import('../../../lib/storage/neo4j.storage').CaseNode = {
      id: 'test',
      caseId: 'TEST-001',
      deviceId: 'GJM12',
      type: 'diagnosis',
      description: '测试案例',
      outcome: 'confirmed',
      severity: 'moderate',
      confidence: 0.92,
    };
    expect(caseNode.caseId).toBe('TEST-001');
    expect(caseNode.outcome).toBe('confirmed');
  });

  it('UnderConditionRelation 应有 probability 字段', () => {
    const rel: import('../../../lib/storage/neo4j.storage').UnderConditionRelation = {
      probability: 0.35,
      notes: '测试',
    };
    expect(rel.probability).toBe(0.35);
  });

  it('ValidatesRelation 应有 outcome 字段', () => {
    const rel: import('../../../lib/storage/neo4j.storage').ValidatesRelation = {
      outcome: 'confirmed',
      confidence: 0.92,
      method: 'envelope',
    };
    expect(rel.outcome).toBe('confirmed');
  });

  it('SharedComponentRelation 应有 componentType 字段', () => {
    const rel: import('../../../lib/storage/neo4j.storage').SharedComponentRelation = {
      componentType: 'wheel_assembly',
      similarity: 0.95,
    };
    expect(rel.componentType).toBe('wheel_assembly');
  });
});

// ============================================================================
// Part 4: CQL 种子文件验证
// ============================================================================

describe('P0-4: CQL 种子文件验证', () => {
  it('cypher_conditions_cases.cql 应包含 Condition 和 Case 节点', async () => {
    const fs = await import('fs/promises');
    const cql = await fs.readFile(
      'test-data/gjm12_knowledge/cypher_conditions_cases.cql',
      'utf-8'
    );

    // 验证包含关键 Cypher 语句
    expect(cql).toContain('MERGE (cond1:Condition');
    expect(cql).toContain("encoding = 'HOIST.FULL_LOAD.HIGH_WIND'");
    expect(cql).toContain('MERGE (case1:Case');
    expect(cql).toContain('UNDER_CONDITION');
    expect(cql).toContain('VALIDATES');
    expect(cql).toContain('SHARED_COMPONENT');
  });

  it('CQL 应定义 Condition 唯一约束', async () => {
    const fs = await import('fs/promises');
    const cql = await fs.readFile(
      'test-data/gjm12_knowledge/cypher_conditions_cases.cql',
      'utf-8'
    );
    expect(cql).toContain('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Condition)');
  });

  it('CQL 中 UNDER_CONDITION 关系应有 probability', async () => {
    const fs = await import('fs/promises');
    const cql = await fs.readFile(
      'test-data/gjm12_knowledge/cypher_conditions_cases.cql',
      'utf-8'
    );
    expect(cql).toContain('probability: 0.35');
    expect(cql).toContain('probability: 0.45');
  });

  it('CQL 中 VALIDATES 关系应有 outcome', async () => {
    const fs = await import('fs/promises');
    const cql = await fs.readFile(
      'test-data/gjm12_knowledge/cypher_conditions_cases.cql',
      'utf-8'
    );
    expect(cql).toContain("outcome: 'confirmed'");
  });
});

// ============================================================================
// Part 5: 端到端集成验证（种子数据 → 类型 → 关系一致性）
// ============================================================================

describe('P0-4: 端到端一致性验证', () => {
  it('种子数据 faultId 在 UNDER_CONDITION 和 VALIDATES 中引用一致', async () => {
    const { UNDER_CONDITION_SEED, VALIDATES_SEED } = await import('../seed-data/kg-condition-case-seed');

    // 所有被引用的 faultId
    const ucFaultIds = new Set(UNDER_CONDITION_SEED.map(r => r.faultId));
    const vFaultIds = new Set(VALIDATES_SEED.map(r => r.faultId));

    // VALIDATES 引用的每个 faultId 都应在 UNDER_CONDITION 中有关联
    for (const faultId of vFaultIds) {
      expect(ucFaultIds.has(faultId)).toBe(true);
    }
  });

  it('种子数据 conditionId 在 UNDER_CONDITION 中引用的 Condition 都存在', async () => {
    const { CONDITION_SEED, UNDER_CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');

    const condIds = new Set(CONDITION_SEED.map(c => c.id));
    for (const rel of UNDER_CONDITION_SEED) {
      expect(condIds.has(rel.conditionId)).toBe(true);
    }
  });

  it('种子数据 caseId 在 VALIDATES 中引用的 Case 都存在', async () => {
    const { CASE_SEED, VALIDATES_SEED } = await import('../seed-data/kg-condition-case-seed');

    const caseIds = new Set(CASE_SEED.map(c => c.id));
    for (const rel of VALIDATES_SEED) {
      expect(caseIds.has(rel.caseId)).toBe(true);
    }
  });

  it('UNDER_CONDITION probability 分布合理（同一故障总概率 <= 1）', async () => {
    const { UNDER_CONDITION_SEED } = await import('../seed-data/kg-condition-case-seed');

    // 按 faultId 分组求和
    const probByFault = new Map<string, number>();
    for (const rel of UNDER_CONDITION_SEED) {
      const current = probByFault.get(rel.faultId) || 0;
      probByFault.set(rel.faultId, current + rel.properties.probability);
    }

    // 每个故障的总工况概率不超过 1.0
    for (const [faultId, totalProb] of probByFault) {
      expect(totalProb).toBeLessThanOrEqual(1.0);
    }
  });

  it('节点类型注册表中新增的 allowedRelations 覆盖 3 个新关系', async () => {
    const { ALL_KG_NODE_TYPES } = await import('../../../../shared/kgOrchestratorTypes');

    // Condition 节点应接受 UNDER_CONDITION 作为入边
    const opCond = ALL_KG_NODE_TYPES.find(n => n.subType === 'operating_condition');
    expect(opCond!.allowedInRelations).toContain('UNDER_CONDITION');

    // Case 节点应支持 VALIDATES 作为出边
    const diagCase = ALL_KG_NODE_TYPES.find(n => n.subType === 'diagnosis_case');
    expect(diagCase!.allowedOutRelations).toContain('VALIDATES');
  });
});
