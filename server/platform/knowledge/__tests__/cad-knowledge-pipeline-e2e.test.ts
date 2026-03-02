/**
 * CAD 图纸知识图谱化管线 — E2E 测试
 * =====================================
 *
 * 使用真实测试数据目录验证：
 *   AC-1: DWG 扫描 → 文件清单完整性
 *   AC-2: 4 段式编码 → 精确/前缀匹配覆盖
 *   AC-3: 装配树 → 层级正确性
 *   AC-4: 传感器映射 → 部件关联
 *   AC-5: Cypher 生成 → 语法完整性
 *   AC-6: KG 适配器 → 降级友好
 *   AC-7: 端到端管线 → 全链路
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  scanDirectory,
  assignComponentCodes,
  buildAssemblyTree,
  generateSensorMapping,
  generateCypher,
  countTreeNodes,
  treeMaxDepth,
  CadKnowledgePipeline,
  type DwgFileEntry,
  type AssemblyNode,
  type CadKgAdapter,
  type SensorMapResult,
} from '../cad-knowledge-pipeline';

// ============================================================================
// 测试数据路径
// ============================================================================

const TEST_DATA_DIR = path.resolve(
  process.env.HOME || '~',
  'Desktop/测试数据/日照项目图纸/修改/GJM12-03小车总成'
);

const hasTestData = fs.existsSync(TEST_DATA_DIR);

// ============================================================================
// Mock KG 适配器
// ============================================================================

class MockKgAdapter implements CadKgAdapter {
  calls: Array<{ tree: AssemblyNode; sensorMap: SensorMapResult }> = [];

  async syncToGraph(tree: AssemblyNode, sensorMap: SensorMapResult) {
    this.calls.push({ tree, sensorMap });
    const nodeCount = countTreeNodes(tree) + 1 + sensorMap.mappings.reduce((s, m) => s + m.sensors.length, 0);
    const relCount = countTreeNodes(tree) + sensorMap.mappings.reduce((s, m) => s + m.sensors.length * m.partCodes.length, 0);
    return { nodesCreated: nodeCount, relationsCreated: relCount };
  }
}

class FailingKgAdapter implements CadKgAdapter {
  async syncToGraph() {
    throw new Error('Neo4j connection refused');
  }
}

// ============================================================================
// AC-1: DWG 扫描
// ============================================================================

describe('AC-1: DWG 文件扫描', () => {
  it.skipIf(!hasTestData)('应扫描到 120+ 个 DWG 文件', () => {
    const files = scanDirectory(TEST_DATA_DIR);
    expect(files.length).toBeGreaterThanOrEqual(120);
  });

  it.skipIf(!hasTestData)('每个文件应有编码和名称', () => {
    const files = scanDirectory(TEST_DATA_DIR);
    for (const f of files) {
      expect(f.fileCode).toBeTruthy();
      expect(f.fileName).toBeTruthy();
      expect(f.filePath).toBeTruthy();
      expect(f.fileSize).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasTestData)('应正确识别层级深度', () => {
    const files = scanDirectory(TEST_DATA_DIR);
    const topLevel = files.filter(f => f.level === 0);
    const subLevel = files.filter(f => f.level >= 1);
    expect(topLevel.length).toBeGreaterThan(0);
    expect(subLevel.length).toBeGreaterThan(topLevel.length);
  });

  it.skipIf(!hasTestData)('应正确标记总装图', () => {
    const files = scanDirectory(TEST_DATA_DIR);
    const assemblies = files.filter(f => f.isAssembly);
    // 至少有根总装图和几个子系统总装图
    expect(assemblies.length).toBeGreaterThanOrEqual(3);
  });

  it('应在目录不存在时抛出错误', () => {
    expect(() => scanDirectory('/nonexistent/path')).toThrow('源目录不存在');
  });

  it.skipIf(!hasTestData)('应提取 GJM 编码前缀', () => {
    const files = scanDirectory(TEST_DATA_DIR);
    const gjmFiles = files.filter(f => f.fileCode.startsWith('GJM'));
    // 绝大多数文件应有 GJM 编码
    expect(gjmFiles.length / files.length).toBeGreaterThan(0.9);
  });
});

// ============================================================================
// AC-2: 4 段式编码
// ============================================================================

describe('AC-2: 4 段式部件编码', () => {
  let files: DwgFileEntry[];

  beforeAll(() => {
    if (!hasTestData) return;
    files = scanDirectory(TEST_DATA_DIR);
    assignComponentCodes(files);
  });

  it.skipIf(!hasTestData)('所有文件应被分配编码', () => {
    const coded = files.filter(f => f.componentCode);
    expect(coded.length).toBe(files.length);
  });

  it.skipIf(!hasTestData)('根总装图编码应为 TROLLEY', () => {
    const root = files.find(f => f.fileCode === 'GJM12-03' || f.fileName.includes('小车总成'));
    expect(root).toBeDefined();
    expect(root!.componentCode).toBe('TROLLEY');
  });

  it.skipIf(!hasTestData)('小车运行机构编码应为 TROLLEY.TRAVEL', () => {
    const travel = files.find(f => f.fileCode === 'GJM120303');
    expect(travel).toBeDefined();
    expect(travel!.componentCode).toBe('TROLLEY.TRAVEL');
  });

  it.skipIf(!hasTestData)('起升机构编码应为 TROLLEY.HOIST', () => {
    const hoist = files.find(f => f.fileCode === 'GJM120304');
    expect(hoist).toBeDefined();
    expect(hoist!.componentCode).toBe('TROLLEY.HOIST');
  });

  it.skipIf(!hasTestData)('前缀匹配应正确生成零件编码', () => {
    // GJM1203030101 应匹配到 GJM12030301 (TROLLEY.TRAVEL.WHEEL_ASSY.SET_01) + PART_01
    const part = files.find(f => f.fileCode === 'GJM1203030101');
    expect(part).toBeDefined();
    expect(part!.componentCode).toBe('TROLLEY.TRAVEL.WHEEL_ASSY.SET_01.PART_01');
  });

  it.skipIf(!hasTestData)('编码应使用点号分隔', () => {
    for (const f of files) {
      if (f.componentCode.includes('.')) {
        const segments = f.componentCode.split('.');
        expect(segments.every(s => s.length > 0)).toBe(true);
        expect(segments[0]).toBe('TROLLEY');
      }
    }
  });

  it.skipIf(!hasTestData)('编码覆盖率应 100%', () => {
    const uncoded = files.filter(f => !f.componentCode);
    expect(uncoded.length).toBe(0);
  });
});

// ============================================================================
// AC-3: 装配树
// ============================================================================

describe('AC-3: 装配树构建', () => {
  let files: DwgFileEntry[];
  let tree: AssemblyNode;

  beforeAll(() => {
    if (!hasTestData) return;
    files = scanDirectory(TEST_DATA_DIR);
    assignComponentCodes(files);
    tree = buildAssemblyTree(files, TEST_DATA_DIR);
  });

  it.skipIf(!hasTestData)('根节点应为 GJM12-03 小车总成', () => {
    expect(tree.code).toBe('GJM12-03');
    expect(tree.name).toBe('小车总成');
    expect(tree.componentCode).toBe('TROLLEY');
  });

  it.skipIf(!hasTestData)('应有 6+ 个一级子节点（子系统）', () => {
    // 小车架、运行机构、起升机构、钢丝绳缠绕、水平轮、独立件等
    expect(tree.children.length).toBeGreaterThanOrEqual(6);
  });

  it.skipIf(!hasTestData)('总节点数应 > 100', () => {
    const total = countTreeNodes(tree);
    expect(total).toBeGreaterThan(100);
  });

  it.skipIf(!hasTestData)('最大深度应 >= 3', () => {
    const depth = treeMaxDepth(tree);
    expect(depth).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(!hasTestData)('起升机构应有子节点', () => {
    const hoist = tree.children.find(c => c.componentCode === 'TROLLEY.HOIST');
    expect(hoist).toBeDefined();
    expect(hoist!.children.length).toBeGreaterThan(5);
  });

  it.skipIf(!hasTestData)('小车运行机构应有车轮总成', () => {
    const travel = tree.children.find(c => c.componentCode === 'TROLLEY.TRAVEL');
    expect(travel).toBeDefined();
    const wheelAssy = travel!.children.find(c =>
      c.componentCode.includes('WHEEL_ASSY')
    );
    expect(wheelAssy).toBeDefined();
  });

  it.skipIf(!hasTestData)('每个节点应有编码', () => {
    const checkCodes = (node: AssemblyNode) => {
      expect(node.code).toBeTruthy();
      expect(node.componentCode).toBeTruthy();
      for (const child of node.children) checkCodes(child);
    };
    checkCodes(tree);
  });
});

// ============================================================================
// AC-4: 传感器映射
// ============================================================================

describe('AC-4: 传感器映射', () => {
  let files: DwgFileEntry[];
  let sensorMap: SensorMapResult;

  beforeAll(() => {
    if (!hasTestData) return;
    files = scanDirectory(TEST_DATA_DIR);
    assignComponentCodes(files);
    sensorMap = generateSensorMapping(files);
  });

  it.skipIf(!hasTestData)('应有 6 组传感器映射', () => {
    expect(sensorMap.mappings.length).toBe(6);
  });

  it.skipIf(!hasTestData)('应映射 VT-01 ~ VT-11 传感器', () => {
    const allSensorIds = sensorMap.mappings
      .flatMap(m => m.sensors.map(s => s.id))
      .sort();
    expect(allSensorIds).toContain('VT-01');
    expect(allSensorIds).toContain('VT-11');
  });

  it.skipIf(!hasTestData)('起升机构应关联 FFT 和包络分析算法', () => {
    const hoistMapping = sensorMap.mappings.find(m => m.componentCode === 'TROLLEY.HOIST');
    expect(hoistMapping).toBeDefined();
    expect(hoistMapping!.algorithms).toContain('fft_spectrum');
    expect(hoistMapping!.algorithms).toContain('envelope_demod');
  });

  it.skipIf(!hasTestData)('辅助件应在未映射列表中', () => {
    expect(sensorMap.unmappedParts.length).toBeGreaterThan(0);
    // 锚定装置（GJM120307 → GJM120307）应在列表中
    expect(sensorMap.unmappedParts).toContain('GJM120307');
  });

  it.skipIf(!hasTestData)('设备型号应为 GJM12', () => {
    expect(sensorMap.deviceModel).toBe('GJM12');
    expect(sensorMap.assembly).toBe('03-小车总成');
  });
});

// ============================================================================
// AC-5: Cypher 生成
// ============================================================================

describe('AC-5: Cypher 生成', () => {
  let cypher: string;

  beforeAll(() => {
    if (!hasTestData) return;
    const files = scanDirectory(TEST_DATA_DIR);
    assignComponentCodes(files);
    const tree = buildAssemblyTree(files, TEST_DATA_DIR);
    const sensorMap = generateSensorMapping(files);
    cypher = generateCypher(tree, sensorMap, files.length);
  });

  it.skipIf(!hasTestData)('应包含约束语句', () => {
    expect(cypher).toContain('CREATE CONSTRAINT');
    expect(cypher).toContain('Equipment');
    expect(cypher).toContain('Component');
    expect(cypher).toContain('Sensor');
  });

  it.skipIf(!hasTestData)('应包含 Equipment 节点', () => {
    expect(cypher).toContain('MERGE (equip:Equipment {id: "GJM12"})');
  });

  it.skipIf(!hasTestData)('应包含 Component/Part MERGE 语句', () => {
    expect(cypher).toContain('MERGE (n:Component');
    expect(cypher).toContain('MERGE (n:Part');
  });

  it.skipIf(!hasTestData)('应包含 HAS_PART 关系', () => {
    expect(cypher).toContain('MERGE (equip)-[:HAS_PART');
    expect(cypher).toContain('MERGE (parent)-[:HAS_PART');
  });

  it.skipIf(!hasTestData)('应包含 Sensor 节点和 HAS_SENSOR 关系', () => {
    expect(cypher).toContain('MERGE (s:Sensor');
    expect(cypher).toContain('MERGE (c)-[:HAS_SENSOR]->(s)');
  });

  it.skipIf(!hasTestData)('应包含 Algorithm 节点和 DIAGNOSED_BY 关系', () => {
    expect(cypher).toContain('MERGE (a:Algorithm');
    expect(cypher).toContain('MERGE (c)-[:DIAGNOSED_BY]->(a)');
  });

  it.skipIf(!hasTestData)('行数应 > 100', () => {
    expect(cypher.split('\n').length).toBeGreaterThan(100);
  });
});

// ============================================================================
// AC-6: KG 降级
// ============================================================================

describe('AC-6: KG 适配器降级', () => {
  it.skipIf(!hasTestData)('Mock KG 应记录调用', async () => {
    const mockKg = new MockKgAdapter();
    const pipeline = new CadKnowledgePipeline({ kgAdapter: mockKg });
    const result = await pipeline.process(TEST_DATA_DIR);

    expect(mockKg.calls.length).toBe(1);
    expect(result.kgSynced).toBe(true);
    expect(result.stats.kgNodesCreated).toBeGreaterThan(0);
    expect(result.stats.kgRelationsCreated).toBeGreaterThan(0);
  });

  it.skipIf(!hasTestData)('KG 不可用时管线仍应完成', async () => {
    const failingKg = new FailingKgAdapter();
    const pipeline = new CadKnowledgePipeline({ kgAdapter: failingKg });
    const result = await pipeline.process(TEST_DATA_DIR);

    // 管线完成，KG 同步失败
    expect(result.kgSynced).toBe(false);
    expect(result.stats.kgNodesCreated).toBe(0);
    // 但其他输出仍然正常
    expect(result.partsInventory.length).toBeGreaterThan(100);
    expect(result.assemblyTree.code).toBe('GJM12-03');
    expect(result.cypherStatements).toContain('Equipment');
  });
});

// ============================================================================
// AC-7: 端到端管线
// ============================================================================

describe('AC-7: 端到端管线', () => {
  it.skipIf(!hasTestData)('全链路执行应成功', async () => {
    const mockKg = new MockKgAdapter();
    const pipeline = new CadKnowledgePipeline({ kgAdapter: mockKg });
    const result = await pipeline.process(TEST_DATA_DIR);

    // 文件扫描
    expect(result.stats.totalFiles).toBeGreaterThanOrEqual(120);
    // 编码覆盖
    expect(result.stats.codedFiles).toBe(result.stats.totalFiles);
    // 装配树
    expect(result.stats.treeNodes).toBeGreaterThan(100);
    expect(result.stats.maxDepth).toBeGreaterThanOrEqual(3);
    // 传感器映射
    expect(result.stats.sensorMappings).toBe(6);
    // Cypher
    expect(result.stats.cypherLines).toBeGreaterThan(100);
    // KG 同步
    expect(result.kgSynced).toBe(true);
    // 耗时合理
    expect(result.stats.pipelineTimeMs).toBeLessThan(10000);
  });

  it.skipIf(!hasTestData)('装配树应与 Python 版输出一致', async () => {
    const mockKg = new MockKgAdapter();
    const pipeline = new CadKnowledgePipeline({ kgAdapter: mockKg });
    const result = await pipeline.process(TEST_DATA_DIR);

    // 验证关键结构与 Python 版 assembly_tree.json 一致
    const tree = result.assemblyTree;
    expect(tree.code).toBe('GJM12-03');
    expect(tree.componentCode).toBe('TROLLEY');

    // 验证子系统
    const subsystems = tree.children.map(c => c.componentCode).sort();
    expect(subsystems).toContain('TROLLEY.TRAVEL');
    expect(subsystems).toContain('TROLLEY.HOIST');
    expect(subsystems).toContain('TROLLEY.ROPE');
    expect(subsystems).toContain('TROLLEY.H_WHEEL');

    // 验证车轮总成有零件子节点
    const travel = tree.children.find(c => c.componentCode === 'TROLLEY.TRAVEL');
    const wheelAssy1 = travel?.children.find(c =>
      c.componentCode === 'TROLLEY.TRAVEL.WHEEL_ASSY.SET_01'
    );
    expect(wheelAssy1).toBeDefined();
    expect(wheelAssy1!.children.length).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!hasTestData)('Cypher 输出应与 Python 版结构一致', async () => {
    const mockKg = new MockKgAdapter();
    const pipeline = new CadKnowledgePipeline({ kgAdapter: mockKg });
    const result = await pipeline.process(TEST_DATA_DIR);

    const cypher = result.cypherStatements;
    // 验证 7 个 Section 都存在
    expect(cypher).toContain('Section 0: 约束和索引');
    expect(cypher).toContain('Section 1: Equipment 节点');
    expect(cypher).toContain('Section 2: Component 节点');
    expect(cypher).toContain('Section 3: HAS_PART 装配关系');
    expect(cypher).toContain('Section 4: Sensor 节点');
    expect(cypher).toContain('Section 5: HAS_SENSOR 关系');
    expect(cypher).toContain('Section 6: Algorithm 节点');
    expect(cypher).toContain('Section 7: DIAGNOSED_BY 关系');
  });
});

// ============================================================================
// 单元测试（不依赖测试数据目录）
// ============================================================================

describe('单元测试: extractCode / assignCode', () => {
  it('应为精确匹配的编码分配正确的 componentCode', () => {
    const files: DwgFileEntry[] = [
      { fileCode: 'GJM12-03', fileName: '小车总成', filePath: 'test.dwg', fileSize: 100, level: 0, parentCode: '', isAssembly: true, componentCode: '' },
      { fileCode: 'GJM120304', fileName: '起升机构', filePath: 'hoist.dwg', fileSize: 100, level: 1, parentCode: 'GJM12-03', isAssembly: false, componentCode: '' },
      { fileCode: 'GJM12030404', fileName: '卷筒', filePath: 'drum.dwg', fileSize: 100, level: 2, parentCode: 'GJM120304', isAssembly: false, componentCode: '' },
    ];
    assignComponentCodes(files);

    expect(files[0].componentCode).toBe('TROLLEY');
    expect(files[1].componentCode).toBe('TROLLEY.HOIST');
    expect(files[2].componentCode).toBe('TROLLEY.HOIST.DRUM');
  });

  it('应为前缀匹配的编码生成 PART_XX 后缀', () => {
    const files: DwgFileEntry[] = [
      { fileCode: 'GJM1203040901', fileName: '透盖', filePath: 'test.dwg', fileSize: 100, level: 3, parentCode: 'GJM12030409', isAssembly: false, componentCode: '' },
    ];
    assignComponentCodes(files);
    expect(files[0].componentCode).toBe('TROLLEY.HOIST.BEARING_SEAT.PART_01');
  });

  it('未知编码应 fallback 到 TROLLEY', () => {
    const files: DwgFileEntry[] = [
      { fileCode: 'UNKNOWN', fileName: '未知', filePath: 'test.dwg', fileSize: 100, level: 0, parentCode: '', isAssembly: false, componentCode: '' },
    ];
    assignComponentCodes(files);
    expect(files[0].componentCode).toBe('TROLLEY');
  });
});

describe('单元测试: countTreeNodes / treeMaxDepth', () => {
  it('应正确计算节点数', () => {
    const tree: AssemblyNode = {
      code: 'ROOT', name: '根', componentCode: 'X', drawingFile: null,
      children: [
        { code: 'A', name: 'A', componentCode: 'X.A', drawingFile: null, children: [] },
        {
          code: 'B', name: 'B', componentCode: 'X.B', drawingFile: null,
          children: [
            { code: 'C', name: 'C', componentCode: 'X.B.C', drawingFile: null, children: [] },
          ],
        },
      ],
    };
    expect(countTreeNodes(tree)).toBe(4);
    expect(treeMaxDepth(tree)).toBe(2);
  });

  it('叶子节点深度为 0', () => {
    const leaf: AssemblyNode = { code: 'L', name: 'L', componentCode: 'X', drawingFile: null, children: [] };
    expect(countTreeNodes(leaf)).toBe(1);
    expect(treeMaxDepth(leaf)).toBe(0);
  });
});
