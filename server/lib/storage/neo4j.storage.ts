/**
 * Neo4j 企业级图存储服务
 * 
 * 架构：Neo4j 5.x Causal Cluster
 * 节点类型：
 * - Equipment: 设备节点
 * - Component: 组件节点
 * - Fault: 故障节点
 * - Solution: 解决方案节点
 * - Vessel: 船舶节点
 * - Berth: 泊位节点
 * 
 * 关系类型：
 * - HAS_PART: 设备包含组件
 * - CAUSES: 故障因果关系
 * - SIMILAR_TO: 相似故障
 * - RESOLVED_BY: 故障解决方案
 * - AFFECTS: 故障影响
 * 
 * 特性：
 * - GDS 插件向量索引
 * - Louvain 社区检测
 * - PageRank 故障影响分析
 */

import neo4j, { Driver, Session, Transaction, Record as Neo4jRecord } from 'neo4j-driver';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('neo4j');

// ============ 配置类型 ============

export interface Neo4jClusterConfig {

  uri: string;
  username: string;
  password: string;
  database: string;
  maxConnectionPoolSize: number;
  connectionAcquisitionTimeout: number;
  connectionTimeout: number;
}

// 默认集群配置
const DEFAULT_CONFIG: Neo4jClusterConfig = {
  uri: process.env.NEO4J_URI || 'neo4j://localhost:7687',
  username: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password',
  database: process.env.NEO4J_DATABASE || 'neo4j',
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 60000,
  connectionTimeout: 30000,
};

// ============ 节点类型定义 ============

export interface EquipmentNode {
  id: string;
  name: string;
  type: string;
  model?: string;
  manufacturer?: string;
  location?: string;
  status: 'online' | 'offline' | 'maintenance' | 'fault';
  installDate?: Date;
  metadata?: Record<string, unknown>;
}

export interface ComponentNode {
  id: string;
  name: string;
  type: string;
  partNumber?: string;
  manufacturer?: string;
  specifications?: Record<string, unknown>;
  lifespan?: number;
  installDate?: Date;
}

export interface FaultNode {
  id: string;
  code: string;
  name: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  symptoms?: string[];
  rootCause?: string;
  frequency?: number;
  avgResolutionTime?: number;
  embedding?: number[];
}

export interface SolutionNode {
  id: string;
  name: string;
  description: string;
  steps: string[];
  requiredParts?: string[];
  estimatedTime?: number;
  successRate?: number;
  cost?: number;
  embedding?: number[];
}

export interface VesselNode {
  id: string;
  name: string;
  imo?: string;
  type: string;
  length?: number;
  width?: number;
  draft?: number;
  capacity?: number;
  flag?: string;
}

export interface BerthNode {
  id: string;
  name: string;
  terminal: string;
  length?: number;
  depth?: number;
  maxVesselSize?: number;
  equipment?: string[];
}

// ============ 关系类型定义 ============

export interface HasPartRelation {
  quantity?: number;
  position?: string;
  installDate?: Date;
}

export interface CausesRelation {
  probability: number;
  conditions?: string[];
  timeDelay?: number;
}

export interface SimilarToRelation {
  similarity: number;
  sharedSymptoms?: string[];
  sharedCauses?: string[];
}

export interface ResolvedByRelation {
  successRate: number;
  avgTime?: number;
  conditions?: string[];
}

export interface AffectsRelation {
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  propagationDelay?: number;
}

// ============ 查询结果类型 ============

export interface GraphPath {
  nodes: Array<{ id: string; labels: string[]; properties: Record<string, unknown> }>;
  relationships: Array<{ type: string; properties: Record<string, unknown> }>;
}

export interface CommunityResult {
  communityId: number;
  members: string[];
  size: number;
  density?: number;
}

export interface PageRankResult {
  nodeId: string;
  score: number;
  label: string;
}

export interface SimilarityResult {
  sourceId: string;
  targetId: string;
  similarity: number;
}

// ============ Neo4j 存储服务类 ============

export class Neo4jStorage {
  private driver: Driver | null = null;
  private config: Neo4jClusterConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<Neo4jClusterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.debug('[Neo4j] Initializing connection...');

    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout,
          connectionTimeout: this.config.connectionTimeout,
        }
      );

      // 验证连接
      await this.driver.verifyConnectivity();
      log.debug('[Neo4j] Connected successfully');

      // 初始化约束和索引
      await this.initializeSchema();
      this.isInitialized = true;
    } catch (error) {
      log.error('[Neo4j] Connection failed:', error);
      throw error;
    }
  }

  /**
   * 初始化 Schema（约束和索引）
   */
  private async initializeSchema(): Promise<void> {
    const session = this.getSession();

    try {
      // 创建唯一约束
      const constraints = [
        'CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE',
        'CREATE CONSTRAINT component_id IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT fault_id IF NOT EXISTS FOR (f:Fault) REQUIRE f.id IS UNIQUE',
        'CREATE CONSTRAINT solution_id IF NOT EXISTS FOR (s:Solution) REQUIRE s.id IS UNIQUE',
        'CREATE CONSTRAINT vessel_id IF NOT EXISTS FOR (v:Vessel) REQUIRE v.id IS UNIQUE',
        'CREATE CONSTRAINT berth_id IF NOT EXISTS FOR (b:Berth) REQUIRE b.id IS UNIQUE',
      ];

      for (const constraint of constraints) {
        try {
          await session.run(constraint);
        } catch (e) {
          // 约束可能已存在，忽略错误
        }
      }

      // 创建全文索引
      const indexes = [
        'CREATE FULLTEXT INDEX fault_search IF NOT EXISTS FOR (f:Fault) ON EACH [f.name, f.description, f.code]',
        'CREATE FULLTEXT INDEX solution_search IF NOT EXISTS FOR (s:Solution) ON EACH [s.name, s.description]',
        'CREATE FULLTEXT INDEX equipment_search IF NOT EXISTS FOR (e:Equipment) ON EACH [e.name, e.type, e.model]',
      ];

      for (const index of indexes) {
        try {
          await session.run(index);
        } catch (e) {
          // 索引可能已存在，忽略错误
        }
      }

      log.debug('[Neo4j] Schema initialized');
    } finally {
      await session.close();
    }
  }

  /**
   * 获取会话
   */
  private getSession(): Session {
    if (!this.driver) {
      throw new Error('[Neo4j] Driver not initialized');
    }
    return this.driver.session({ database: this.config.database });
  }

  // ============ 节点操作 ============

  /**
   * 创建设备节点
   */
  async createEquipment(equipment: EquipmentNode): Promise<EquipmentNode | null> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `CREATE (e:Equipment {
          id: $id,
          name: $name,
          type: $type,
          model: $model,
          manufacturer: $manufacturer,
          location: $location,
          status: $status,
          installDate: $installDate,
          metadata: $metadata,
          createdAt: datetime()
        })
        RETURN e`,
        {
          id: equipment.id,
          name: equipment.name,
          type: equipment.type,
          model: equipment.model || null,
          manufacturer: equipment.manufacturer || null,
          location: equipment.location || null,
          status: equipment.status,
          installDate: equipment.installDate?.toISOString() || null,
          metadata: equipment.metadata ? JSON.stringify(equipment.metadata) : null,
        }
      );

      if (result.records.length > 0) {
        return this.mapEquipmentNode(result.records[0].get('e'));
      }
      return null;
    } catch (error) {
      log.error('[Neo4j] Create equipment error:', error);
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建故障节点
   */
  async createFault(fault: FaultNode): Promise<FaultNode | null> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `CREATE (f:Fault {
          id: $id,
          code: $code,
          name: $name,
          type: $type,
          severity: $severity,
          description: $description,
          symptoms: $symptoms,
          rootCause: $rootCause,
          frequency: $frequency,
          avgResolutionTime: $avgResolutionTime,
          embedding: $embedding,
          createdAt: datetime()
        })
        RETURN f`,
        {
          id: fault.id,
          code: fault.code,
          name: fault.name,
          type: fault.type,
          severity: fault.severity,
          description: fault.description,
          symptoms: fault.symptoms || [],
          rootCause: fault.rootCause || null,
          frequency: fault.frequency || 0,
          avgResolutionTime: fault.avgResolutionTime || null,
          embedding: fault.embedding || null,
        }
      );

      if (result.records.length > 0) {
        return this.mapFaultNode(result.records[0].get('f'));
      }
      return null;
    } catch (error) {
      log.error('[Neo4j] Create fault error:', error);
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建解决方案节点
   */
  async createSolution(solution: SolutionNode): Promise<SolutionNode | null> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `CREATE (s:Solution {
          id: $id,
          name: $name,
          description: $description,
          steps: $steps,
          requiredParts: $requiredParts,
          estimatedTime: $estimatedTime,
          successRate: $successRate,
          cost: $cost,
          embedding: $embedding,
          createdAt: datetime()
        })
        RETURN s`,
        {
          id: solution.id,
          name: solution.name,
          description: solution.description,
          steps: solution.steps,
          requiredParts: solution.requiredParts || [],
          estimatedTime: solution.estimatedTime || null,
          successRate: solution.successRate || null,
          cost: solution.cost || null,
          embedding: solution.embedding || null,
        }
      );

      if (result.records.length > 0) {
        return this.mapSolutionNode(result.records[0].get('s'));
      }
      return null;
    } catch (error) {
      log.error('[Neo4j] Create solution error:', error);
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 获取节点
   */
  async getNode(label: string, id: string): Promise<Record<string, unknown> | null> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH (n:${label} {id: $id}) RETURN n`,
        { id }
      );

      if (result.records.length > 0) {
        return result.records[0].get('n').properties;
      }
      return null;
    } catch (error) {
      log.error('[Neo4j] Get node error:', error);
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 更新节点属性
   */
  async updateNode(label: string, id: string, properties: Record<string, unknown>): Promise<boolean> {
    const session = this.getSession();

    try {
      const setClause = Object.keys(properties)
        .map(key => `n.${key} = $${key}`)
        .join(', ');

      await session.run(
        `MATCH (n:${label} {id: $id})
         SET ${setClause}, n.updatedAt = datetime()
         RETURN n`,
        { id, ...properties }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Update node error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 删除节点
   */
  async deleteNode(label: string, id: string): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (n:${label} {id: $id})
         DETACH DELETE n`,
        { id }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Delete node error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  // ============ 关系操作 ============

  /**
   * 创建 HAS_PART 关系
   */
  async createHasPartRelation(
    equipmentId: string,
    componentId: string,
    properties: HasPartRelation = {}
  ): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (e:Equipment {id: $equipmentId})
         MATCH (c:Component {id: $componentId})
         MERGE (e)-[r:HAS_PART]->(c)
         SET r.quantity = $quantity,
             r.position = $position,
             r.installDate = $installDate,
             r.createdAt = datetime()
         RETURN r`,
        {
          equipmentId,
          componentId,
          quantity: properties.quantity || 1,
          position: properties.position || null,
          installDate: properties.installDate?.toISOString() || null,
        }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Create HAS_PART relation error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建 CAUSES 关系
   */
  async createCausesRelation(
    sourceFaultId: string,
    targetFaultId: string,
    properties: CausesRelation
  ): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (f1:Fault {id: $sourceFaultId})
         MATCH (f2:Fault {id: $targetFaultId})
         MERGE (f1)-[r:CAUSES]->(f2)
         SET r.probability = $probability,
             r.conditions = $conditions,
             r.timeDelay = $timeDelay,
             r.createdAt = datetime()
         RETURN r`,
        {
          sourceFaultId,
          targetFaultId,
          probability: properties.probability,
          conditions: properties.conditions || [],
          timeDelay: properties.timeDelay || null,
        }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Create CAUSES relation error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建 SIMILAR_TO 关系
   */
  async createSimilarToRelation(
    faultId1: string,
    faultId2: string,
    properties: SimilarToRelation
  ): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (f1:Fault {id: $faultId1})
         MATCH (f2:Fault {id: $faultId2})
         MERGE (f1)-[r:SIMILAR_TO]->(f2)
         SET r.similarity = $similarity,
             r.sharedSymptoms = $sharedSymptoms,
             r.sharedCauses = $sharedCauses,
             r.createdAt = datetime()
         RETURN r`,
        {
          faultId1,
          faultId2,
          similarity: properties.similarity,
          sharedSymptoms: properties.sharedSymptoms || [],
          sharedCauses: properties.sharedCauses || [],
        }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Create SIMILAR_TO relation error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建 RESOLVED_BY 关系
   */
  async createResolvedByRelation(
    faultId: string,
    solutionId: string,
    properties: ResolvedByRelation
  ): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (f:Fault {id: $faultId})
         MATCH (s:Solution {id: $solutionId})
         MERGE (f)-[r:RESOLVED_BY]->(s)
         SET r.successRate = $successRate,
             r.avgTime = $avgTime,
             r.conditions = $conditions,
             r.createdAt = datetime()
         RETURN r`,
        {
          faultId,
          solutionId,
          successRate: properties.successRate,
          avgTime: properties.avgTime || null,
          conditions: properties.conditions || [],
        }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Create RESOLVED_BY relation error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建 AFFECTS 关系
   */
  async createAffectsRelation(
    faultId: string,
    targetId: string,
    targetLabel: string,
    properties: AffectsRelation
  ): Promise<boolean> {
    const session = this.getSession();

    try {
      await session.run(
        `MATCH (f:Fault {id: $faultId})
         MATCH (t:${targetLabel} {id: $targetId})
         MERGE (f)-[r:AFFECTS]->(t)
         SET r.impactLevel = $impactLevel,
             r.description = $description,
             r.propagationDelay = $propagationDelay,
             r.createdAt = datetime()
         RETURN r`,
        {
          faultId,
          targetId,
          impactLevel: properties.impactLevel,
          description: properties.description || null,
          propagationDelay: properties.propagationDelay || null,
        }
      );

      return true;
    } catch (error) {
      log.error('[Neo4j] Create AFFECTS relation error:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  // ============ 图算法 ============

  /**
   * Louvain 社区检测
   */
  async detectCommunities(nodeLabel: string = 'Fault'): Promise<CommunityResult[]> {
    const session = this.getSession();

    try {
      // 创建图投影
      await session.run(
        `CALL gds.graph.project(
          'community_graph',
          '${nodeLabel}',
          {
            SIMILAR_TO: { orientation: 'UNDIRECTED' },
            CAUSES: { orientation: 'NATURAL' }
          }
        )`
      ).catch(() => {
        // 图可能已存在
      });

      // 运行 Louvain 算法
      const result = await session.run(
        `CALL gds.louvain.stream('community_graph')
         YIELD nodeId, communityId
         WITH gds.util.asNode(nodeId) AS node, communityId
         RETURN communityId, collect(node.id) AS members, count(*) AS size
         ORDER BY size DESC`
      );

      // 清理图投影
      await session.run(`CALL gds.graph.drop('community_graph', false)`).catch(() => {});

      return result.records.map((record: any) => ({
        communityId: record.get('communityId').toNumber(),
        members: record.get('members'),
        size: record.get('size').toNumber(),
      }));
    } catch (error) {
      log.error('[Neo4j] Detect communities error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * PageRank 故障影响分析
   */
  async calculatePageRank(nodeLabel: string = 'Fault'): Promise<PageRankResult[]> {
    const session = this.getSession();

    try {
      // 创建图投影
      await session.run(
        `CALL gds.graph.project(
          'pagerank_graph',
          '${nodeLabel}',
          'CAUSES'
        )`
      ).catch(() => {});

      // 运行 PageRank 算法
      const result = await session.run(
        `CALL gds.pageRank.stream('pagerank_graph')
         YIELD nodeId, score
         WITH gds.util.asNode(nodeId) AS node, score
         RETURN node.id AS nodeId, score, labels(node)[0] AS label
         ORDER BY score DESC
         LIMIT 100`
      );

      // 清理图投影
      await session.run(`CALL gds.graph.drop('pagerank_graph', false)`).catch(() => {});

      return result.records.map((record: any) => ({
        nodeId: record.get('nodeId'),
        score: record.get('score'),
        label: record.get('label'),
      }));
    } catch (error) {
      log.error('[Neo4j] Calculate PageRank error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 向量相似度搜索
   */
  async findSimilarByEmbedding(
    nodeLabel: string,
    embedding: number[],
    limit: number = 10
  ): Promise<SimilarityResult[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH (n:${nodeLabel})
         WHERE n.embedding IS NOT NULL
         WITH n, gds.similarity.cosine(n.embedding, $embedding) AS similarity
         WHERE similarity > 0.5
         RETURN n.id AS sourceId, similarity
         ORDER BY similarity DESC
         LIMIT $limit`,
        { embedding, limit: neo4j.int(limit) }
      );

      return result.records.map((record: any) => ({
        sourceId: 'query',
        targetId: record.get('sourceId'),
        similarity: record.get('similarity'),
      }));
    } catch (error) {
      log.error('[Neo4j] Find similar by embedding error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  // ============ 路径查询 ============

  /**
   * 查找故障传播路径
   */
  async findFaultPropagationPath(
    startFaultId: string,
    maxDepth: number = 5
  ): Promise<GraphPath[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH path = (start:Fault {id: $startFaultId})-[:CAUSES*1..${maxDepth}]->(end:Fault)
         RETURN path
         LIMIT 20`,
        { startFaultId }
      );

      return result.records.map((record: any) => {
        const path = record.get('path');
        return {
          nodes: path.segments.map((seg: any) => ({
            id: seg.start.properties.id,
            labels: seg.start.labels,
            properties: seg.start.properties,
          })),
          relationships: path.segments.map((seg: any) => ({
            type: seg.relationship.type,
            properties: seg.relationship.properties,
          })),
        };
      });
    } catch (error) {
      log.error('[Neo4j] Find fault propagation path error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 查找设备故障历史
   */
  async findEquipmentFaultHistory(equipmentId: string): Promise<FaultNode[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH (e:Equipment {id: $equipmentId})-[:HAS_PART*0..2]->(c)
         MATCH (f:Fault)-[:AFFECTS]->(c)
         RETURN DISTINCT f
         ORDER BY f.frequency DESC`,
        { equipmentId }
      );

      return result.records.map((record: any) => this.mapFaultNode(record.get('f')));
    } catch (error) {
      log.error('[Neo4j] Find equipment fault history error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 查找故障解决方案
   */
  async findFaultSolutions(faultId: string): Promise<SolutionNode[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH (f:Fault {id: $faultId})-[r:RESOLVED_BY]->(s:Solution)
         RETURN s, r.successRate AS successRate
         ORDER BY r.successRate DESC`,
        { faultId }
      );

      return result.records.map((record: any) => this.mapSolutionNode(record.get('s')));
    } catch (error) {
      log.error('[Neo4j] Find fault solutions error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 全文搜索故障
   */
  async searchFaults(query: string, limit: number = 20): Promise<FaultNode[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('fault_search', $query)
         YIELD node, score
         RETURN node
         ORDER BY score DESC
         LIMIT $limit`,
        { query, limit: neo4j.int(limit) }
      );

      return result.records.map((record: any) => this.mapFaultNode(record.get('node')));
    } catch (error) {
      log.error('[Neo4j] Search faults error:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  // ============ 统计查询 ============

  /**
   * 获取图统计信息
   */
  async getGraphStatistics(): Promise<{
    nodeCount: Record<string, number>;
    relationshipCount: Record<string, number>;
    totalNodes: number;
    totalRelationships: number;
  }> {
    const session = this.getSession();

    try {
      // 节点统计
      const nodeResult = await session.run(
        `MATCH (n)
         RETURN labels(n)[0] AS label, count(*) AS count`
      );

      const nodeCount: Record<string, number> = {};
      let totalNodes = 0;
      nodeResult.records.forEach((record: any) => {
        const label = record.get('label');
        const count = record.get('count').toNumber();
        nodeCount[label] = count;
        totalNodes += count;
      });

      // 关系统计
      const relResult = await session.run(
        `MATCH ()-[r]->()
         RETURN type(r) AS type, count(*) AS count`
      );

      const relationshipCount: Record<string, number> = {};
      let totalRelationships = 0;
      relResult.records.forEach((record: any) => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        relationshipCount[type] = count;
        totalRelationships += count;
      });

      return {
        nodeCount,
        relationshipCount,
        totalNodes,
        totalRelationships,
      };
    } catch (error) {
      log.error('[Neo4j] Get graph statistics error:', error);
      return {
        nodeCount: {},
        relationshipCount: {},
        totalNodes: 0,
        totalRelationships: 0,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    clusterInfo?: {
      role: string;
      addresses: string[];
    };
    error?: string;
  }> {
    const start = Date.now();

    if (!this.driver) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: 'Driver not initialized',
      };
    }

    const session = this.getSession();

    try {
      const result = await session.run('CALL dbms.cluster.overview()');
      const clusterInfo = result.records.length > 0 ? {
        role: result.records[0].get('role'),
        addresses: result.records[0].get('addresses'),
      } : undefined;

      return {
        connected: true,
        latencyMs: Date.now() - start,
        clusterInfo,
      };
    } catch (error) {
      // 单节点模式下 cluster.overview 可能不可用
      try {
        await session.run('RETURN 1');
        return {
          connected: true,
          latencyMs: Date.now() - start,
        };
      } catch (e) {
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: e instanceof Error ? e.message : 'Unknown error',
        };
      }
    } finally {
      await session.close();
    }
  }

  // ============ 映射方法 ============

  private mapEquipmentNode(node: any): EquipmentNode {
    const props = node.properties;
    return {
      id: props.id,
      name: props.name,
      type: props.type,
      model: props.model,
      manufacturer: props.manufacturer,
      location: props.location,
      status: props.status,
      installDate: props.installDate ? new Date(props.installDate) : undefined,
      metadata: props.metadata ? JSON.parse(props.metadata) : undefined,
    };
  }

  private mapFaultNode(node: any): FaultNode {
    const props = node.properties;
    return {
      id: props.id,
      code: props.code,
      name: props.name,
      type: props.type,
      severity: props.severity,
      description: props.description,
      symptoms: props.symptoms,
      rootCause: props.rootCause,
      frequency: props.frequency?.toNumber?.() || props.frequency,
      avgResolutionTime: props.avgResolutionTime?.toNumber?.() || props.avgResolutionTime,
      embedding: props.embedding,
    };
  }

  private mapSolutionNode(node: any): SolutionNode {
    const props = node.properties;
    return {
      id: props.id,
      name: props.name,
      description: props.description,
      steps: props.steps,
      requiredParts: props.requiredParts,
      estimatedTime: props.estimatedTime?.toNumber?.() || props.estimatedTime,
      successRate: props.successRate,
      cost: props.cost,
      embedding: props.embedding,
    };
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.isInitialized = false;
      log.debug('[Neo4j] Connection closed');
    }
  }
}

// 导出单例
export const neo4jStorage = new Neo4jStorage();
export default neo4jStorage;
