/**
 * CAD 图纸知识图谱化管线 — TypeScript 版
 * ========================================
 *
 * 将 DWG 图纸目录结构转换为：
 *   1. 零部件清单（parts inventory）
 *   2. 装配树（BOM assembly tree）
 *   3. 4 段式部件编码（component encoding）
 *   4. 传感器映射（sensor mapping）
 *   5. Neo4j 知识图谱节点和关系
 *
 * 5 步处理流程：
 *   Step 1: 递归扫描目录，收集 DWG 文件元数据
 *   Step 2: 生成 4 段式部件编码（最长前缀匹配）
 *   Step 3: 构建装配树（基于目录层级）
 *   Step 4: 传感器映射（部件-传感器关联）
 *   Step 5: 写入 Neo4j（降级友好：不可用时仅输出 Cypher）
 *
 * 参考实现：scripts/cad-knowledge-pipeline.py
 * 架构原则：ADR-002 知识域内聚、ADR-004 统一编码
 */

import { createModuleLogger } from '../../core/logger';
import path from 'path';
import fs from 'fs';

const log = createModuleLogger('cad-knowledge-pipeline');

// ============================================================================
// 类型定义
// ============================================================================

/** DWG 文件元数据 */
export interface DwgFileEntry {
  fileCode: string;
  fileName: string;
  filePath: string;       // 相对于源目录
  fileSize: number;
  level: number;          // 目录嵌套层数（顶层 = 0）
  parentCode: string;
  isAssembly: boolean;
  componentCode: string;  // 4 段式编码
}

/** 装配树节点 */
export interface AssemblyNode {
  code: string;
  name: string;
  componentCode: string;
  drawingFile: string | null;
  children: AssemblyNode[];
}

/** 传感器映射条目 */
export interface SensorMapping {
  componentCode: string;
  partCodes: string[];
  description: string;
  sensors: Array<{
    id: string;
    type: string;
    position: string;
    sampleRate: number;
  }>;
  algorithms: string[];
}

/** 传感器映射汇总 */
export interface SensorMapResult {
  deviceModel: string;
  assembly: string;
  mappings: SensorMapping[];
  unmappedParts: string[];
}

/** 管线处理结果 */
export interface CadPipelineResult {
  partsInventory: DwgFileEntry[];
  assemblyTree: AssemblyNode;
  sensorMap: SensorMapResult;
  cypherStatements: string;
  kgSynced: boolean;
  stats: {
    totalFiles: number;
    codedFiles: number;
    treeNodes: number;
    maxDepth: number;
    sensorMappings: number;
    cypherLines: number;
    kgNodesCreated: number;
    kgRelationsCreated: number;
    pipelineTimeMs: number;
  };
}

// ============================================================================
// 4 段式编码映射表（与 Python 版保持同步）
// ============================================================================

type CodeTuple = [string, string, string, string];

const COMPONENT_CODE_MAP: Record<string, CodeTuple> = {
  // --- 顶层 ---
  'GJM12-03':     ['TROLLEY', '_', '_', '_'],
  // --- 小车架 ---
  'GJM120301':    ['TROLLEY', 'FRAME', 'MAIN', '_'],
  // --- 小车运行机构 ---
  'GJM120303':    ['TROLLEY', 'TRAVEL', '_', '_'],
  'GJM12030301':  ['TROLLEY', 'TRAVEL', 'WHEEL_ASSY', 'SET_01'],
  'GJM12030302':  ['TROLLEY', 'TRAVEL', 'WHEEL_ASSY', 'SET_02'],
  'GJM12030303':  ['TROLLEY', 'TRAVEL', 'GBX_MOUNT', '_'],
  'GJM12030304':  ['TROLLEY', 'TRAVEL', 'COUPLING', '_'],
  'GJM12030305':  ['TROLLEY', 'TRAVEL', 'CONNECTOR', '_'],
  'GJM12030306':  ['TROLLEY', 'TRAVEL', 'BRAKE_COVER', '_'],
  // --- 起升机构 ---
  'GJM120304':    ['TROLLEY', 'HOIST', '_', '_'],
  'GJM12030401':  ['TROLLEY', 'HOIST', 'JOINT', '_'],
  'GJM12030402':  ['TROLLEY', 'HOIST', 'DRUM_COUPLING', '_'],
  'GJM12030403':  ['TROLLEY', 'HOIST', 'END_PLATE_I', '_'],
  'GJM12030404':  ['TROLLEY', 'HOIST', 'DRUM', '_'],
  'GJM12030405':  ['TROLLEY', 'HOIST', 'ROPE_CLAMP', '_'],
  'GJM12030406':  ['TROLLEY', 'HOIST', 'OIL_PAN', '_'],
  'GJM12030407':  ['TROLLEY', 'HOIST', 'ROPE_GUARD', '_'],
  'GJM12030408':  ['TROLLEY', 'HOIST', 'BEARING_BASE', '_'],
  'GJM12030409':  ['TROLLEY', 'HOIST', 'BEARING_SEAT', '_'],
  'GJM12030410':  ['TROLLEY', 'HOIST', 'LIMIT_DEVICE', '_'],
  'GJM12030411':  ['TROLLEY', 'HOIST', 'BRAKE_COVER_I', '_'],
  'GJM12030412':  ['TROLLEY', 'HOIST', 'BASE', '_'],
  'GJM12030413':  ['TROLLEY', 'HOIST', 'HSS_COUPLING', '_'],
  'GJM12030414':  ['TROLLEY', 'HOIST', 'BRAKE_COVER_II', '_'],
  'GJM12030415':  ['TROLLEY', 'HOIST', 'END_PLATE_II', '_'],
  'GJM12030416':  ['TROLLEY', 'HOIST', 'HSS_BRAKE_COUPLING', '_'],
  'GJM12030417':  ['TROLLEY', 'HOIST', 'MOTOR_COVER', '_'],
  'GJM12030418':  ['TROLLEY', 'HOIST', 'WEDGE', '_'],
  'GJM12030419':  ['TROLLEY', 'HOIST', 'WEDGE_BLOCK', '_'],
  'GJM12030420':  ['TROLLEY', 'HOIST', 'STOP_BLOCK', '_'],
  'GJM12030421':  ['TROLLEY', 'HOIST', 'OIL_BAFFLE', '_'],
  'GJM12030422':  ['TROLLEY', 'HOIST', 'EMERGENCY', '_'],
  // --- 钢丝绳缠绕 ---
  'GJM120305':    ['TROLLEY', 'ROPE', '_', '_'],
  'GJM12030501':  ['TROLLEY', 'ROPE', 'SHEAVE_ASSY', 'SET_01'],
  'GJM12030502':  ['TROLLEY', 'ROPE', 'SHEAVE_ASSY', 'SET_02'],
  'GJM12030503':  ['TROLLEY', 'ROPE', 'SHEAVE_ASSY', 'SET_03'],
  'GJM12030504':  ['TROLLEY', 'ROPE', 'SHEAVE_ASSY', 'SET_04'],
  'GJM12030505':  ['TROLLEY', 'ROPE', 'SHEAVE_ASSY', 'SET_05'],
  'GJM12030506':  ['TROLLEY', 'ROPE', 'ADJ_SCREW', '_'],
  'GJM12030507':  ['TROLLEY', 'ROPE', 'WEDGE_SOCKET', '_'],
  'GJM12030508':  ['TROLLEY', 'ROPE', 'PIN', '_'],
  'GJM12030509':  ['TROLLEY', 'ROPE', 'NUT', '_'],
  // --- 水平轮 ---
  'GJM120306':    ['TROLLEY', 'H_WHEEL', '_', '_'],
  'GJM12030601':  ['TROLLEY', 'H_WHEEL', 'BRACKET', '_'],
  'GJM12030602':  ['TROLLEY', 'H_WHEEL', 'ROLLER', '_'],
  'GJM12030603':  ['TROLLEY', 'H_WHEEL', 'WEDGE', '_'],
  'GJM12030604':  ['TROLLEY', 'H_WHEEL', 'GUARD', '_'],
  // --- 独立件 ---
  'GJM120307':    ['TROLLEY', 'ANCHOR', '_', '_'],
  'GJM120308':    ['TROLLEY', 'CABLE_FIX', '_', '_'],
  'GJM120309':    ['TROLLEY', 'LUBE_BASE', '_', '_'],
  'GJM120310':    ['TROLLEY', 'JIB_CRANE', '_', '_'],
};

/** 传感器映射定义（VT-01 ~ VT-11，与小车总成相关） */
const SENSOR_MAPPINGS: SensorMapping[] = [
  {
    componentCode: 'TROLLEY.HOIST',
    partCodes: ['GJM120304'],
    description: '起升机构 → 电机振动',
    sensors: [
      { id: 'VT-01', type: 'vibration', position: 'hoist motor DE', sampleRate: 12800 },
      { id: 'VT-02', type: 'vibration', position: 'hoist motor NDE', sampleRate: 12800 },
    ],
    algorithms: ['fft_spectrum', 'envelope_demod', 'cepstrum'],
  },
  {
    componentCode: 'TROLLEY.HOIST.DRUM',
    partCodes: ['GJM12030404'],
    description: '卷筒 → 减速器/卷筒轴承振动',
    sensors: [
      { id: 'VT-03', type: 'vibration', position: 'hoist gearbox HS', sampleRate: 12800 },
      { id: 'VT-04', type: 'vibration', position: 'hoist gearbox LS', sampleRate: 12800 },
    ],
    algorithms: ['gear_mesh_analysis', 'bearing_defect_frequency'],
  },
  {
    componentCode: 'TROLLEY.HOIST.BEARING_SEAT',
    partCodes: ['GJM12030409', 'GJM1203040902'],
    description: '轴承座总成 → 轴承振动',
    sensors: [
      { id: 'VT-05', type: 'vibration', position: 'drum bearing DE', sampleRate: 12800 },
      { id: 'VT-06', type: 'vibration', position: 'drum bearing NDE', sampleRate: 12800 },
    ],
    algorithms: ['bearing_defect_frequency', 'envelope_demod', 'kurtosis'],
  },
  {
    componentCode: 'TROLLEY.TRAVEL',
    partCodes: ['GJM120303'],
    description: '小车运行机构 → 电机振动',
    sensors: [
      { id: 'VT-07', type: 'vibration', position: 'trolley motor DE', sampleRate: 12800 },
      { id: 'VT-08', type: 'vibration', position: 'trolley motor NDE', sampleRate: 12800 },
    ],
    algorithms: ['fft_spectrum', 'envelope_demod', 'cepstrum'],
  },
  {
    componentCode: 'TROLLEY.TRAVEL.WHEEL_ASSY',
    partCodes: ['GJM12030301', 'GJM12030302'],
    description: '车轮总成 → 车轮轴承振动',
    sensors: [
      { id: 'VT-09', type: 'vibration', position: 'trolley wheel bearing', sampleRate: 12800 },
    ],
    algorithms: ['bearing_defect_frequency', 'envelope_demod'],
  },
  {
    componentCode: 'TROLLEY.TRAVEL.GBX_MOUNT',
    partCodes: ['GJM12030303'],
    description: '减速器固定座 → 减速器振动',
    sensors: [
      { id: 'VT-10', type: 'vibration', position: 'trolley gearbox HS', sampleRate: 12800 },
      { id: 'VT-11', type: 'vibration', position: 'trolley gearbox LS', sampleRate: 12800 },
    ],
    algorithms: ['gear_mesh_analysis', 'bearing_defect_frequency'],
  },
];

/** 已知无传感器映射的辅助件 */
const UNMAPPED_PARTS = [
  'GJM120307', 'GJM120308', 'GJM120309', 'GJM120310',
  'GJM120301', 'GJM120305', 'GJM120306',
];

// ============================================================================
// KG 适配器接口（支持注入、测试替身）
// ============================================================================

export interface CadKgAdapter {
  /** 批量创建 Component/Part 节点 + Equipment 节点 + HAS_PART 关系 + Sensor 节点 */
  syncToGraph(
    tree: AssemblyNode,
    sensorMap: SensorMapResult,
  ): Promise<{ nodesCreated: number; relationsCreated: number }>;
}

/** 默认 KG 适配器 — 使用 Neo4j */
class DefaultCadKgAdapter implements CadKgAdapter {
  async syncToGraph(
    tree: AssemblyNode,
    sensorMap: SensorMapResult,
  ): Promise<{ nodesCreated: number; relationsCreated: number }> {
    let nodesCreated = 0;
    let relationsCreated = 0;

    try {
      const { neo4jStorage } = await import('../../lib/storage/neo4j.storage');
      const session = (neo4jStorage as any).getSession?.();
      if (!session) {
        log.warn('[CadKG] Neo4j session not available, skip KG sync');
        return { nodesCreated: 0, relationsCreated: 0 };
      }

      try {
        // 1. Equipment 节点
        await session.run(
          `MERGE (e:Equipment {id: "GJM12"})
           SET e.name = '港机设备 GJM12', e.model = 'GJM12', e.type = 'RTG', e.project = '日照项目'`
        );
        nodesCreated++;

        // 2. 递归创建 Component/Part 节点
        const createNodeRecursive = async (node: AssemblyNode, depth: number) => {
          const label = depth <= 2 ? 'Component' : 'Part';
          await session.run(
            `MERGE (n:${label} {code: $code})
             SET n.name = $name, n.componentCode = $componentCode, n.level = $level`,
            { code: node.code, name: node.name, componentCode: node.componentCode, level: depth }
          );
          nodesCreated++;

          for (const child of node.children) {
            await createNodeRecursive(child, depth + 1);
          }
        };
        await createNodeRecursive(tree, 0);

        // 3. Equipment → 根 Component 关系
        await session.run(
          `MATCH (e:Equipment {id: "GJM12"})
           MATCH (c {code: $code})
           MERGE (e)-[:HAS_PART {assembly: '小车总成'}]->(c)`,
          { code: tree.code }
        );
        relationsCreated++;

        // 4. 递归创建 HAS_PART 关系
        const createRelRecursive = async (node: AssemblyNode) => {
          for (const child of node.children) {
            await session.run(
              `MATCH (parent {code: $parentCode})
               MATCH (child {code: $childCode})
               MERGE (parent)-[:HAS_PART {name: $name}]->(child)`,
              { parentCode: node.code, childCode: child.code, name: child.name }
            );
            relationsCreated++;
            await createRelRecursive(child);
          }
        };
        await createRelRecursive(tree);

        // 5. Sensor 节点 + HAS_SENSOR 关系
        const sensorIdsSeen = new Set<string>();
        for (const mapping of sensorMap.mappings) {
          for (const sensor of mapping.sensors) {
            if (!sensorIdsSeen.has(sensor.id)) {
              sensorIdsSeen.add(sensor.id);
              await session.run(
                `MERGE (s:Sensor {id: $id})
                 SET s.type = $type, s.position = $position, s.sampleRate = $sampleRate`,
                { id: sensor.id, type: sensor.type, position: sensor.position, sampleRate: sensor.sampleRate }
              );
              nodesCreated++;
            }
            for (const partCode of mapping.partCodes) {
              await session.run(
                `MATCH (c {code: $code})
                 MATCH (s:Sensor {id: $sensorId})
                 MERGE (c)-[:HAS_SENSOR]->(s)`,
                { code: partCode, sensorId: sensor.id }
              );
              relationsCreated++;
            }
          }
        }

        // 6. Algorithm 节点 + DIAGNOSED_BY 关系
        const algoSet = new Set<string>();
        for (const mapping of sensorMap.mappings) {
          for (const algo of mapping.algorithms) algoSet.add(algo);
        }
        for (const algo of algoSet) {
          await session.run(
            `MERGE (a:Algorithm {name: $name}) SET a.category = 'mechanical'`,
            { name: algo }
          );
          nodesCreated++;
        }
        for (const mapping of sensorMap.mappings) {
          for (const partCode of mapping.partCodes) {
            for (const algo of mapping.algorithms) {
              await session.run(
                `MATCH (c {code: $code})
                 MATCH (a:Algorithm {name: $algo})
                 MERGE (c)-[:DIAGNOSED_BY]->(a)`,
                { code: partCode, algo }
              );
              relationsCreated++;
            }
          }
        }
      } finally {
        await session.close();
      }

      log.info(`[CadKG] Synced to Neo4j: ${nodesCreated} nodes, ${relationsCreated} relations`);
    } catch (err) {
      log.warn('[CadKG] Neo4j sync failed (degraded mode):', err);
      return { nodesCreated: 0, relationsCreated: 0 };
    }

    return { nodesCreated, relationsCreated };
  }
}

// ============================================================================
// Step 1: 目录扫描
// ============================================================================

/** 从文件名中提取 GJM 编码 */
const CODE_RE = /GJM12[\d-]*\d/;

function extractCodeFromName(filename: string): string {
  const stem = path.basename(filename, path.extname(filename));
  const m = stem.match(CODE_RE);
  if (m) return m[0];
  // fallback: 取文件名开头到第一个中文字符或空格
  const m2 = stem.match(/^(GJM[^\u4e00-\u9fff\s]+)/);
  if (m2) return m2[1].replace(/-$/, '');
  return stem;
}

/** 从文件名提取中文名称 */
function extractChineseName(filename: string, code: string): string {
  const stem = path.basename(filename, path.extname(filename));
  let rest = stem;
  if (code && rest.includes(code)) {
    rest = rest.substring(rest.indexOf(code) + code.length);
  }
  // 去掉修订号 R1 等
  rest = rest.replace(/^R\d+\s*/, '');
  // 去掉日期后缀
  rest = rest.replace(/\d{8}$/, '');
  rest = rest.trim().replace(/^[-_ ]+|[-_ ]+$/g, '');
  return rest || stem;
}

/** 标准化编码：去除连字符 */
function normalizeCode(code: string): string {
  return code.replace(/-/g, '');
}

export function scanDirectory(sourceDir: string): DwgFileEntry[] {
  const source = path.resolve(sourceDir);
  if (!fs.existsSync(source)) {
    throw new Error(`源目录不存在: ${sourceDir}`);
  }

  const files: DwgFileEntry[] = [];

  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // 排序保证稳定输出
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dwg')) {
        const relPath = path.relative(source, fullPath);
        const code = extractCodeFromName(entry.name);
        const name = extractChineseName(entry.name, code);
        const level = relPath.split(path.sep).length - 1;

        // 父编码
        let parentCode = '';
        if (level > 0) {
          const parentDir = path.basename(path.dirname(fullPath));
          parentCode = extractCodeFromName(parentDir);
        }

        // 是否为总装图
        const parentDirCode = extractCodeFromName(path.basename(path.dirname(fullPath)));
        const isAssembly = normalizeCode(code) === normalizeCode(parentDirCode);

        const stat = fs.statSync(fullPath);

        files.push({
          fileCode: code,
          fileName: name,
          filePath: relPath,
          fileSize: stat.size,
          level,
          parentCode,
          isAssembly,
          componentCode: '', // 后续填充
        });
      }
    }
  };

  walkDir(source);
  return files;
}

// ============================================================================
// Step 2: 4 段式编码分配
// ============================================================================

export function assignComponentCodes(files: DwgFileEntry[]): void {
  // 构建标准化映射
  const normMap = new Map<string, CodeTuple>();
  for (const [k, v] of Object.entries(COMPONENT_CODE_MAP)) {
    normMap.set(normalizeCode(k), v);
  }

  for (const f of files) {
    const normCode = normalizeCode(f.fileCode);

    // 精确匹配
    if (normMap.has(normCode)) {
      const segments = normMap.get(normCode)!;
      f.componentCode = segments.filter(s => s !== '_').join('.');
      continue;
    }

    // 最长前缀匹配
    let bestKey = '';
    let bestSegments: CodeTuple = ['TROLLEY', '_', '_', '_'];
    for (const [k, v] of normMap) {
      if (normCode.startsWith(k) && k.length > bestKey.length) {
        bestKey = k;
        bestSegments = v;
      }
    }

    const segmentList = bestSegments.filter(s => s !== '_');
    const suffix = bestKey ? normCode.substring(bestKey.length) : '';
    if (suffix) {
      segmentList.push(`PART_${suffix}`);
    }

    f.componentCode = segmentList.length > 0 ? segmentList.join('.') : 'TROLLEY';
  }
}

// ============================================================================
// Step 3: 构建装配树
// ============================================================================

export function buildAssemblyTree(files: DwgFileEntry[], sourceDir: string): AssemblyNode {
  const source = path.resolve(sourceDir);

  // 目录节点映射
  const dirNodes = new Map<string, AssemblyNode>();
  const normMap = new Map<string, CodeTuple>();
  for (const [k, v] of Object.entries(COMPONENT_CODE_MAP)) {
    normMap.set(normalizeCode(k), v);
  }

  const getDirNode = (dirPath: string): AssemblyNode => {
    const key = dirPath === source ? '.' : path.relative(source, dirPath);
    if (dirNodes.has(key)) return dirNodes.get(key)!;

    const dirName = path.basename(dirPath);
    const code = extractCodeFromName(dirName);
    const name = extractChineseName(dirName, code);

    const normCode = normalizeCode(code);
    const segments = normMap.get(normCode) ?? ['TROLLEY', '_', '_', '_'] as CodeTuple;
    const compCode = segments.filter(s => s !== '_').join('.') || 'TROLLEY';

    // 查找总装图
    let drawingFile: string | null = null;
    for (const f of files) {
      const fParent = path.resolve(source, path.dirname(f.filePath));
      if (fParent === dirPath && f.fileCode === code) {
        drawingFile = f.filePath;
        break;
      }
    }

    const node: AssemblyNode = { code, name, componentCode: compCode, drawingFile, children: [] };
    dirNodes.set(key, node);
    return node;
  };

  // 根节点
  const root = getDirNode(source);
  root.code = 'GJM12-03';
  root.name = '小车总成';
  root.componentCode = 'TROLLEY';

  // 查找根级总装图
  for (const f of files) {
    if (f.level === 0 && f.fileName.includes('小车总成')) {
      root.drawingFile = f.filePath;
      break;
    }
  }

  // 递归收集所有子目录
  const collectDirs = (dir: string): string[] => {
    const dirs: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const full = path.join(dir, entry.name);
          dirs.push(full);
          dirs.push(...collectDirs(full));
        }
      }
    } catch { /* ignore */ }
    return dirs;
  };

  const subdirs = collectDirs(source);
  for (const dirPath of subdirs) {
    const node = getDirNode(dirPath);
    const parentPath = path.dirname(dirPath);
    const parentNode = parentPath === source ? root : getDirNode(parentPath);
    if (!parentNode.children.includes(node)) {
      parentNode.children.push(node);
    }
  }

  // 将非总装图 DWG 作为叶子节点
  for (const f of files) {
    const fFullDir = path.resolve(source, path.dirname(f.filePath));
    const parentDirCode = extractCodeFromName(path.basename(fFullDir));

    // 跳过总装图（已作为目录节点的 drawingFile）
    if (normalizeCode(f.fileCode) === normalizeCode(parentDirCode)) continue;

    const leaf: AssemblyNode = {
      code: f.fileCode,
      name: f.fileName,
      componentCode: f.componentCode,
      drawingFile: f.filePath,
      children: [],
    };

    if (fFullDir === source) {
      if (f.fileCode !== root.code) root.children.push(leaf);
    } else {
      const parentNode = getDirNode(fFullDir);
      parentNode.children.push(leaf);
    }
  }

  return root;
}

// ============================================================================
// Step 4: 传感器映射
// ============================================================================

export function generateSensorMapping(files: DwgFileEntry[]): SensorMapResult {
  const allSubsystemCodes = new Set<string>();
  for (const f of files) {
    const code = normalizeCode(f.fileCode);
    if (code.length >= 10) allSubsystemCodes.add(code.substring(0, 10));
    else if (code.length >= 8) allSubsystemCodes.add(code.substring(0, 8));
  }

  const mappedCodes = new Set<string>();
  for (const m of SENSOR_MAPPINGS) {
    for (const pc of m.partCodes) mappedCodes.add(normalizeCode(pc));
  }

  const unmappedSet = new Set(UNMAPPED_PARTS.map(normalizeCode));
  for (const c of allSubsystemCodes) {
    if (!mappedCodes.has(c)) unmappedSet.add(c);
  }
  for (const c of UNMAPPED_PARTS) unmappedSet.add(normalizeCode(c));

  return {
    deviceModel: 'GJM12',
    assembly: '03-小车总成',
    mappings: SENSOR_MAPPINGS,
    unmappedParts: [...unmappedSet].sort(),
  };
}

// ============================================================================
// Step 5: Cypher 生成
// ============================================================================

function escapeCypher(s: string): string {
  return s ? s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
}

export function generateCypher(
  tree: AssemblyNode,
  sensorMap: SensorMapResult,
  totalFiles: number,
): string {
  const lines: string[] = [];

  lines.push('// ============================================================');
  lines.push('// GJM12-03 小车总成 知识图谱初始化');
  lines.push('// 自动生成 by cad-knowledge-pipeline.ts');
  lines.push('// ============================================================\n');

  // Section 0: 约束
  lines.push('// --- Section 0: 约束和索引 ---');
  lines.push('CREATE CONSTRAINT IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;');
  lines.push('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Component) REQUIRE c.code IS UNIQUE;');
  lines.push('CREATE CONSTRAINT IF NOT EXISTS FOR (p:Part) REQUIRE p.code IS UNIQUE;');
  lines.push('CREATE CONSTRAINT IF NOT EXISTS FOR (s:Sensor) REQUIRE s.id IS UNIQUE;');
  lines.push('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Algorithm) REQUIRE a.name IS UNIQUE;');
  lines.push('CREATE INDEX IF NOT EXISTS FOR (c:Component) ON (c.componentCode);');
  lines.push('CREATE INDEX IF NOT EXISTS FOR (p:Part) ON (p.componentCode);');
  lines.push('');

  // Section 1: Equipment
  lines.push('// --- Section 1: Equipment 节点 ---');
  lines.push(
    "MERGE (equip:Equipment {id: \"GJM12\"}) " +
    "SET equip.name = '港机设备 GJM12', equip.model = 'GJM12', equip.type = 'RTG', equip.project = '日照项目';"
  );
  lines.push('');

  // Section 2: Component/Part 节点
  lines.push('// --- Section 2: Component 节点 ---');
  const compCodesSeen = new Set<string>();
  let nodeCount = 0;

  const emitComponentNodes = (node: AssemblyNode, depth: number) => {
    if (node.componentCode && !compCodesSeen.has(node.componentCode)) {
      compCodesSeen.add(node.componentCode);
      const label = depth <= 2 ? 'Component' : 'Part';
      lines.push(
        `MERGE (n:${label} {code: "${node.code}"}) ` +
        `SET n.name = '${escapeCypher(node.name)}', ` +
        `n.componentCode = '${node.componentCode}', n.level = ${depth};`
      );
      nodeCount++;
    }
    for (const child of node.children) emitComponentNodes(child, depth + 1);
  };
  emitComponentNodes(tree, 0);
  lines.push('');

  // Section 3: HAS_PART
  lines.push('// --- Section 3: HAS_PART 装配关系 ---');
  lines.push(
    'MATCH (equip:Equipment {id: "GJM12"}) ' +
    `MATCH (trolley:Component {code: "${tree.code}"}) ` +
    "MERGE (equip)-[:HAS_PART {assembly: '小车总成'}]->(trolley);"
  );

  const emitHasPart = (node: AssemblyNode) => {
    for (const child of node.children) {
      const childLabel = child.children.length > 0 ? 'Component' : 'Part';
      lines.push(
        `MATCH (parent {code: "${node.code}"}) ` +
        `MATCH (child {code: "${child.code}"}) ` +
        `MERGE (parent)-[:HAS_PART {name: '${escapeCypher(child.name)}'}]->(child);`
      );
      emitHasPart(child);
    }
  };
  emitHasPart(tree);
  lines.push('');

  // Section 4: Sensor 节点
  lines.push('// --- Section 4: Sensor 节点 ---');
  const sensorIdsSeen = new Set<string>();
  for (const mapping of sensorMap.mappings) {
    for (const sensor of mapping.sensors) {
      if (!sensorIdsSeen.has(sensor.id)) {
        sensorIdsSeen.add(sensor.id);
        lines.push(
          `MERGE (s:Sensor {id: "${sensor.id}"}) ` +
          `SET s.type = '${sensor.type}', s.position = '${sensor.position}', ` +
          `s.sampleRate = ${sensor.sampleRate};`
        );
      }
    }
  }
  lines.push('');

  // Section 5: HAS_SENSOR
  lines.push('// --- Section 5: HAS_SENSOR 关系 ---');
  for (const mapping of sensorMap.mappings) {
    for (const partCode of mapping.partCodes) {
      for (const sensor of mapping.sensors) {
        lines.push(
          `MATCH (c {code: "${partCode}"}) ` +
          `MATCH (s:Sensor {id: "${sensor.id}"}) ` +
          'MERGE (c)-[:HAS_SENSOR]->(s);'
        );
      }
    }
  }
  lines.push('');

  // Section 6: Algorithm 节点
  lines.push('// --- Section 6: Algorithm 节点 ---');
  const algoSet = new Set<string>();
  for (const mapping of sensorMap.mappings) {
    for (const algo of mapping.algorithms) algoSet.add(algo);
  }
  for (const algo of [...algoSet].sort()) {
    lines.push(`MERGE (a:Algorithm {name: "${algo}"}) SET a.category = 'mechanical';`);
  }
  lines.push('');

  // Section 7: DIAGNOSED_BY
  lines.push('// --- Section 7: DIAGNOSED_BY 关系 ---');
  for (const mapping of sensorMap.mappings) {
    for (const partCode of mapping.partCodes) {
      for (const algo of mapping.algorithms) {
        lines.push(
          `MATCH (c {code: "${partCode}"}) ` +
          `MATCH (a:Algorithm {name: "${algo}"}) ` +
          'MERGE (c)-[:DIAGNOSED_BY]->(a);'
        );
      }
    }
  }
  lines.push('');

  lines.push(`// 统计: ${nodeCount} Component/Part 节点, ${sensorIdsSeen.size} Sensor 节点, ${algoSet.size} Algorithm 节点`);
  lines.push(`// 文件总数: ${totalFiles}`);

  return lines.join('\n');
}

// ============================================================================
// 辅助函数
// ============================================================================

export function countTreeNodes(node: AssemblyNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countTreeNodes(c), 0);
}

export function treeMaxDepth(node: AssemblyNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map(c => treeMaxDepth(c, depth + 1)));
}

// ============================================================================
// 主管线类
// ============================================================================

export class CadKnowledgePipeline {
  private kgAdapter: CadKgAdapter;

  constructor(opts?: { kgAdapter?: CadKgAdapter }) {
    this.kgAdapter = opts?.kgAdapter ?? new DefaultCadKgAdapter();
  }

  async process(sourceDir: string): Promise<CadPipelineResult> {
    const startTime = Date.now();
    log.info(`[CadPipeline] 开始处理: ${sourceDir}`);

    // Step 1: 扫描
    const files = scanDirectory(sourceDir);
    log.info(`[CadPipeline] Step 1: 扫描到 ${files.length} 个 DWG 文件`);

    // Step 2: 编码分配
    assignComponentCodes(files);
    const codedCount = files.filter(f => f.componentCode).length;
    log.info(`[CadPipeline] Step 2: 编码映射 ${codedCount}/${files.length}`);

    // Step 3: 装配树
    const tree = buildAssemblyTree(files, sourceDir);
    const nodeCount = countTreeNodes(tree);
    const maxDepth = treeMaxDepth(tree);
    log.info(`[CadPipeline] Step 3: 装配树 ${nodeCount} 节点, 深度 ${maxDepth}`);

    // Step 4: 传感器映射
    const sensorMap = generateSensorMapping(files);
    log.info(`[CadPipeline] Step 4: ${sensorMap.mappings.length} 组传感器映射`);

    // Step 5a: Cypher 生成
    const cypher = generateCypher(tree, sensorMap, files.length);
    log.info(`[CadPipeline] Step 5a: ${cypher.split('\n').length} 行 Cypher`);

    // Step 5b: KG 同步（降级友好）
    let kgSynced = false;
    let kgNodesCreated = 0;
    let kgRelationsCreated = 0;
    try {
      const kgResult = await this.kgAdapter.syncToGraph(tree, sensorMap);
      kgNodesCreated = kgResult.nodesCreated;
      kgRelationsCreated = kgResult.relationsCreated;
      kgSynced = kgNodesCreated > 0;
      log.info(`[CadPipeline] Step 5b: KG 同步 ${kgNodesCreated} 节点, ${kgRelationsCreated} 关系`);
    } catch (err) {
      log.warn('[CadPipeline] KG 同步降级（Neo4j 不可用）:', err);
    }

    const pipelineTimeMs = Date.now() - startTime;
    log.info(`[CadPipeline] 完成, 耗时 ${pipelineTimeMs}ms`);

    return {
      partsInventory: files,
      assemblyTree: tree,
      sensorMap,
      cypherStatements: cypher,
      kgSynced,
      stats: {
        totalFiles: files.length,
        codedFiles: codedCount,
        treeNodes: nodeCount,
        maxDepth,
        sensorMappings: sensorMap.mappings.length,
        cypherLines: cypher.split('\n').length,
        kgNodesCreated,
        kgRelationsCreated,
        pipelineTimeMs,
      },
    };
  }
}

// ============================================================================
// 单例 + 工厂
// ============================================================================

let _instance: CadKnowledgePipeline | null = null;

export function getCadKnowledgePipeline(): CadKnowledgePipeline {
  if (!_instance) {
    _instance = new CadKnowledgePipeline();
  }
  return _instance;
}

export function resetCadKnowledgePipeline(): void {
  _instance = null;
}
