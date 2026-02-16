/**
 * Qdrant 企业级向量存储服务
 * 
 * 架构：2节点1副本集群
 * Collections：
 * - diagnostic_docs: 诊断文档（100K）
 * - fault_patterns: 故障模式（5K）
 * - manuals: 操作手册（200K）
 * 
 * 特性：
 * - HNSW 索引（M=16, ef=100）
 * - Scalar 量化（98%召回）
 * - 多向量支持
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('qdrant');

// ============ 配置类型 ============

export interface QdrantClusterConfig {

  nodes: Array<{
    host: string;
    port: number;
  }>;
  apiKey?: string;
  https: boolean;
  timeout: number;
}

// 默认集群配置（2节点1副本）
const DEFAULT_CLUSTER_CONFIG: QdrantClusterConfig = {
  nodes: [
    { host: process.env.QDRANT_NODE1_HOST || 'localhost', port: 6333 },
    { host: process.env.QDRANT_NODE2_HOST || 'localhost', port: 6334 },
  ],
  apiKey: process.env.QDRANT_API_KEY,
  https: process.env.QDRANT_HTTPS === 'true',
  timeout: 30000,
};

// 单节点开发配置
const SINGLE_NODE_CONFIG: QdrantClusterConfig = {
  nodes: [
    { host: process.env.QDRANT_HOST || 'localhost', port: 6333 },
  ],
  apiKey: process.env.QDRANT_API_KEY,
  https: false,
  timeout: 30000,
};

// ============ Collection 配置 ============

export interface CollectionConfig {
  name: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot';
  onDiskPayload: boolean;
  hnswConfig: {
    m: number;
    efConstruct: number;
    fullScanThreshold: number;
  };
  quantizationConfig?: {
    scalar: {
      type: 'int8';
      quantile: number;
      alwaysRam: boolean;
    };
  };
  replicationFactor: number;
  shardNumber: number;
}

// 预定义 Collection 配置
const COLLECTION_CONFIGS: Record<string, CollectionConfig> = {
  diagnostic_docs: {
    name: 'diagnostic_docs',
    vectorSize: 1536, // OpenAI embedding 维度
    distance: 'Cosine',
    onDiskPayload: true,
    hnswConfig: {
      m: 16,
      efConstruct: 100,
      fullScanThreshold: 10000,
    },
    quantizationConfig: {
      scalar: {
        type: 'int8',
        quantile: 0.99,
        alwaysRam: true,
      },
    },
    replicationFactor: 1,
    shardNumber: 2,
  },
  fault_patterns: {
    name: 'fault_patterns',
    vectorSize: 1536,
    distance: 'Cosine',
    onDiskPayload: false, // 小数据集保持在内存
    hnswConfig: {
      m: 16,
      efConstruct: 100,
      fullScanThreshold: 5000,
    },
    quantizationConfig: {
      scalar: {
        type: 'int8',
        quantile: 0.99,
        alwaysRam: true,
      },
    },
    replicationFactor: 1,
    shardNumber: 1,
  },
  manuals: {
    name: 'manuals',
    vectorSize: 1536,
    distance: 'Cosine',
    onDiskPayload: true,
    hnswConfig: {
      m: 16,
      efConstruct: 100,
      fullScanThreshold: 20000,
    },
    quantizationConfig: {
      scalar: {
        type: 'int8',
        quantile: 0.99,
        alwaysRam: true,
      },
    },
    replicationFactor: 1,
    shardNumber: 3,
  },
};

// ============ 数据类型定义 ============

export interface VectorPoint {
  id: string | number;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

export interface DiagnosticDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  deviceType?: string;
  faultCode?: string;
  tags?: string[];
  source?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface FaultPattern {
  id: string;
  name: string;
  description: string;
  symptoms: string[];
  rootCauses: string[];
  solutions: string[];
  deviceTypes: string[];
  severity: 'info' | 'warning' | 'error' | 'critical';
  frequency: number;
  avgResolutionTime?: number;
}

export interface Manual {
  id: string;
  title: string;
  content: string;
  chapterNumber?: number;
  sectionNumber?: number;
  deviceModel?: string;
  manufacturer?: string;
  language: string;
  version?: string;
  pageNumber?: number;
}

export interface SearchFilter {
  must?: Array<{ key: string; match: { value: unknown } }>;
  should?: Array<{ key: string; match: { value: unknown } }>;
  mustNot?: Array<{ key: string; match: { value: unknown } }>;
}

// ============ Qdrant 存储服务类 ============

export class QdrantStorage {
  private clients: QdrantClient[] = [];
  private config: QdrantClusterConfig;
  private isInitialized: boolean = false;
  private currentClientIndex: number = 0;

  constructor(config?: QdrantClusterConfig) {
    const isClusterMode = process.env.QDRANT_CLUSTER_MODE === 'true';
    this.config = config || (isClusterMode ? DEFAULT_CLUSTER_CONFIG : SINGLE_NODE_CONFIG);
  }

  /**
   * 初始化集群连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.debug('[Qdrant] Initializing cluster connections...');

    for (const node of this.config.nodes) {
      try {
        const client = new QdrantClient({
          host: node.host,
          port: node.port,
          apiKey: this.config.apiKey,
          https: this.config.https,
          timeout: this.config.timeout,
        });

        // 测试连接
        await client.getCollections();
        this.clients.push(client);
        log.debug(`[Qdrant] Connected to node ${node.host}:${node.port}`);
      } catch (error) {
        log.error(`[Qdrant] Failed to connect to ${node.host}:${node.port}:`, error);
      }
    }

    if (this.clients.length === 0) {
      throw new Error('[Qdrant] No available nodes in cluster');
    }

    // 初始化 Collections
    await this.initializeCollections();
    this.isInitialized = true;
    log.debug('[Qdrant] Cluster initialized successfully');
  }

  /**
   * 获取可用客户端（轮询负载均衡）
   */
  private getClient(): QdrantClient {
    if (this.clients.length === 0) {
      throw new Error('[Qdrant] No available clients');
    }

    const client = this.clients[this.currentClientIndex % this.clients.length];
    this.currentClientIndex++;
    return client;
  }

  /**
   * 初始化 Collections
   */
  private async initializeCollections(): Promise<void> {
    const client = this.getClient();

    for (const config of Object.values(COLLECTION_CONFIGS)) {
      try {
        // 检查 collection 是否存在
        const exists = await client.collectionExists(config.name);

        if (!exists) {
          await client.createCollection(config.name, {
            vectors: {
              size: config.vectorSize,
              distance: config.distance,
              on_disk: config.onDiskPayload,
              hnsw_config: {
                m: config.hnswConfig.m,
                ef_construct: config.hnswConfig.efConstruct,
                full_scan_threshold: config.hnswConfig.fullScanThreshold,
              },
              quantization_config: config.quantizationConfig ? {
                scalar: {
                  type: config.quantizationConfig.scalar.type,
                  quantile: config.quantizationConfig.scalar.quantile,
                  always_ram: config.quantizationConfig.scalar.alwaysRam,
                },
              } : undefined,
            },
            replication_factor: config.replicationFactor,
            shard_number: config.shardNumber,
            on_disk_payload: config.onDiskPayload,
          });

          log.debug(`[Qdrant] Created collection: ${config.name}`);
        } else {
          log.debug(`[Qdrant] Collection exists: ${config.name}`);
        }
      } catch (error) {
        log.error(`[Qdrant] Error initializing collection ${config.name}:`, error);
      }
    }
  }

  // ============ 通用向量操作 ============

  /**
   * 插入向量点
   */
  async upsertPoints(
    collectionName: string,
    points: VectorPoint[]
  ): Promise<{ success: boolean; count: number }> {
    const client = this.getClient();

    try {
      await client.upsert(collectionName, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });

      return { success: true, count: points.length };
    } catch (error) {
      log.error('[Qdrant] Upsert points error:', error);
      return { success: false, count: 0 };
    }
  }

  /**
   * 搜索相似向量
   */
  async search(
    collectionName: string,
    vector: number[],
    limit: number = 10,
    filter?: SearchFilter,
    scoreThreshold?: number
  ): Promise<SearchResult[]> {
    const client = this.getClient();

    try {
      const result = await client.search(collectionName, {
        vector,
        limit,
        filter: filter ? {
          must: filter.must,
          should: filter.should,
          must_not: filter.mustNot,
        } : undefined,
        score_threshold: scoreThreshold,
        with_payload: true,
        with_vector: false,
      });

      return result.map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload as Record<string, unknown>,
      }));
    } catch (error) {
      log.error('[Qdrant] Search error:', error);
      return [];
    }
  }

  /**
   * 批量搜索
   */
  async searchBatch(
    collectionName: string,
    vectors: number[][],
    limit: number = 10,
    filter?: SearchFilter
  ): Promise<SearchResult[][]> {
    const client = this.getClient();

    try {
      const result = await client.searchBatch(collectionName, {
        searches: vectors.map(vector => ({
          vector,
          limit,
          filter: filter ? {
            must: filter.must,
            should: filter.should,
            must_not: filter.mustNot,
          } : undefined,
          with_payload: true,
        })),
      });

      return result.map((batch: any) =>
        batch.map((r: any) => ({
          id: r.id,
          score: r.score,
          payload: r.payload as Record<string, unknown>,
        }))
      );
    } catch (error) {
      log.error('[Qdrant] Search batch error:', error);
      return [];
    }
  }

  /**
   * 获取点
   */
  async getPoints(
    collectionName: string,
    ids: (string | number)[]
  ): Promise<VectorPoint[]> {
    const client = this.getClient();

    try {
      const result = await client.retrieve(collectionName, {
        ids,
        with_payload: true,
        with_vector: true,
      });

      return result.map((r: any) => ({
        id: r.id,
        vector: r.vector as number[],
        payload: r.payload as Record<string, unknown>,
      }));
    } catch (error) {
      log.error('[Qdrant] Get points error:', error);
      return [];
    }
  }

  /**
   * 删除点
   */
  async deletePoints(
    collectionName: string,
    ids: (string | number)[]
  ): Promise<boolean> {
    const client = this.getClient();

    try {
      await client.delete(collectionName, {
        wait: true,
        points: ids,
      });

      return true;
    } catch (error) {
      log.error('[Qdrant] Delete points error:', error);
      return false;
    }
  }

  /**
   * 按过滤条件删除
   */
  async deleteByFilter(
    collectionName: string,
    filter: SearchFilter
  ): Promise<boolean> {
    const client = this.getClient();

    try {
      await client.delete(collectionName, {
        wait: true,
        filter: {
          must: filter.must,
          should: filter.should,
          must_not: filter.mustNot,
        },
      });

      return true;
    } catch (error) {
      log.error('[Qdrant] Delete by filter error:', error);
      return false;
    }
  }

  // ============ 诊断文档操作 ============

  /**
   * 添加诊断文档
   */
  async addDiagnosticDoc(
    doc: DiagnosticDoc,
    embedding: number[]
  ): Promise<boolean> {
    const result = await this.upsertPoints('diagnostic_docs', [{
      id: doc.id,
      vector: embedding,
      payload: {
        title: doc.title,
        content: doc.content,
        category: doc.category,
        deviceType: doc.deviceType,
        faultCode: doc.faultCode,
        tags: doc.tags || [],
        source: doc.source,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt?.toISOString(),
      },
    }]);

    return result.success;
  }

  /**
   * 搜索诊断文档
   */
  async searchDiagnosticDocs(
    embedding: number[],
    options: {
      limit?: number;
      category?: string;
      deviceType?: string;
      faultCode?: string;
      scoreThreshold?: number;
    } = {}
  ): Promise<Array<DiagnosticDoc & { score: number }>> {
    const filter: SearchFilter = { must: [] };

    if (options.category) {
      filter.must!.push({ key: 'category', match: { value: options.category } });
    }
    if (options.deviceType) {
      filter.must!.push({ key: 'deviceType', match: { value: options.deviceType } });
    }
    if (options.faultCode) {
      filter.must!.push({ key: 'faultCode', match: { value: options.faultCode } });
    }

    const results = await this.search(
      'diagnostic_docs',
      embedding,
      options.limit || 10,
      filter.must!.length > 0 ? filter : undefined,
      options.scoreThreshold
    );

    return results.map(r => ({
      id: r.id as string,
      title: r.payload.title as string,
      content: r.payload.content as string,
      category: r.payload.category as string,
      deviceType: r.payload.deviceType as string | undefined,
      faultCode: r.payload.faultCode as string | undefined,
      tags: r.payload.tags as string[] | undefined,
      source: r.payload.source as string | undefined,
      createdAt: new Date(r.payload.createdAt as string),
      updatedAt: r.payload.updatedAt ? new Date(r.payload.updatedAt as string) : undefined,
      score: r.score,
    }));
  }

  // ============ 故障模式操作 ============

  /**
   * 添加故障模式
   */
  async addFaultPattern(
    pattern: FaultPattern,
    embedding: number[]
  ): Promise<boolean> {
    const result = await this.upsertPoints('fault_patterns', [{
      id: pattern.id,
      vector: embedding,
      payload: {
        name: pattern.name,
        description: pattern.description,
        symptoms: pattern.symptoms,
        rootCauses: pattern.rootCauses,
        solutions: pattern.solutions,
        deviceTypes: pattern.deviceTypes,
        severity: pattern.severity,
        frequency: pattern.frequency,
        avgResolutionTime: pattern.avgResolutionTime,
      },
    }]);

    return result.success;
  }

  /**
   * 搜索故障模式
   */
  async searchFaultPatterns(
    embedding: number[],
    options: {
      limit?: number;
      deviceType?: string;
      severity?: string;
      scoreThreshold?: number;
    } = {}
  ): Promise<Array<FaultPattern & { score: number }>> {
    const filter: SearchFilter = { must: [] };

    if (options.deviceType) {
      filter.must!.push({ key: 'deviceTypes', match: { value: options.deviceType } });
    }
    if (options.severity) {
      filter.must!.push({ key: 'severity', match: { value: options.severity } });
    }

    const results = await this.search(
      'fault_patterns',
      embedding,
      options.limit || 10,
      filter.must!.length > 0 ? filter : undefined,
      options.scoreThreshold
    );

    return results.map(r => ({
      id: r.id as string,
      name: r.payload.name as string,
      description: r.payload.description as string,
      symptoms: r.payload.symptoms as string[],
      rootCauses: r.payload.rootCauses as string[],
      solutions: r.payload.solutions as string[],
      deviceTypes: r.payload.deviceTypes as string[],
      severity: r.payload.severity as FaultPattern['severity'],
      frequency: r.payload.frequency as number,
      avgResolutionTime: r.payload.avgResolutionTime as number | undefined,
      score: r.score,
    }));
  }

  // ============ 操作手册操作 ============

  /**
   * 添加操作手册
   */
  async addManual(
    manual: Manual,
    embedding: number[]
  ): Promise<boolean> {
    const result = await this.upsertPoints('manuals', [{
      id: manual.id,
      vector: embedding,
      payload: {
        title: manual.title,
        content: manual.content,
        chapterNumber: manual.chapterNumber,
        sectionNumber: manual.sectionNumber,
        deviceModel: manual.deviceModel,
        manufacturer: manual.manufacturer,
        language: manual.language,
        version: manual.version,
        pageNumber: manual.pageNumber,
      },
    }]);

    return result.success;
  }

  /**
   * 搜索操作手册
   */
  async searchManuals(
    embedding: number[],
    options: {
      limit?: number;
      deviceModel?: string;
      manufacturer?: string;
      language?: string;
      scoreThreshold?: number;
    } = {}
  ): Promise<Array<Manual & { score: number }>> {
    const filter: SearchFilter = { must: [] };

    if (options.deviceModel) {
      filter.must!.push({ key: 'deviceModel', match: { value: options.deviceModel } });
    }
    if (options.manufacturer) {
      filter.must!.push({ key: 'manufacturer', match: { value: options.manufacturer } });
    }
    if (options.language) {
      filter.must!.push({ key: 'language', match: { value: options.language } });
    }

    const results = await this.search(
      'manuals',
      embedding,
      options.limit || 10,
      filter.must!.length > 0 ? filter : undefined,
      options.scoreThreshold
    );

    return results.map(r => ({
      id: r.id as string,
      title: r.payload.title as string,
      content: r.payload.content as string,
      chapterNumber: r.payload.chapterNumber as number | undefined,
      sectionNumber: r.payload.sectionNumber as number | undefined,
      deviceModel: r.payload.deviceModel as string | undefined,
      manufacturer: r.payload.manufacturer as string | undefined,
      language: r.payload.language as string,
      version: r.payload.version as string | undefined,
      pageNumber: r.payload.pageNumber as number | undefined,
      score: r.score,
    }));
  }

  // ============ 统计和管理 ============

  /**
   * 获取 Collection 信息
   */
  async getCollectionInfo(collectionName: string): Promise<{
    name: string;
    pointsCount: number;
    segmentsCount: number;
    status: string;
    config: Record<string, unknown>;
  } | null> {
    const client = this.getClient();

    try {
      const info = await client.getCollection(collectionName);

      return {
        name: collectionName,
        pointsCount: info.points_count || 0,
        segmentsCount: info.segments_count || 0,
        status: info.status,
        config: info.config as Record<string, unknown>,
      };
    } catch (error) {
      log.error('[Qdrant] Get collection info error:', error);
      return null;
    }
  }

  /**
   * 获取所有 Collections 统计
   */
  async getAllCollectionsStats(): Promise<Array<{
    name: string;
    pointsCount: number;
    status: string;
  }>> {
    const client = this.getClient();

    try {
      const collections = await client.getCollections();
      const stats = [];

      for (const col of collections.collections) {
        const info = await this.getCollectionInfo(col.name);
        if (info) {
          stats.push({
            name: info.name,
            pointsCount: info.pointsCount,
            status: info.status,
          });
        }
      }

      return stats;
    } catch (error) {
      log.error('[Qdrant] Get all collections stats error:', error);
      return [];
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    nodes: Array<{
      host: string;
      status: 'online' | 'offline';
    }>;
    collections: number;
    error?: string;
  }> {
    const start = Date.now();
    const nodes: Array<{ host: string; status: 'online' | 'offline' }> = [];
    let collections = 0;

    for (let i = 0; i < this.config.nodes.length; i++) {
      const node = this.config.nodes[i];
      try {
        if (this.clients[i]) {
          const result = await this.clients[i].getCollections();
          nodes.push({ host: `${node.host}:${node.port}`, status: 'online' });
          collections = result.collections.length;
        } else {
          nodes.push({ host: `${node.host}:${node.port}`, status: 'offline' });
        }
      } catch {
        nodes.push({ host: `${node.host}:${node.port}`, status: 'offline' });
      }
    }

    const onlineNodes = nodes.filter(n => n.status === 'online').length;

    return {
      connected: onlineNodes > 0,
      latencyMs: Date.now() - start,
      nodes,
      collections,
      error: onlineNodes === 0 ? 'No available nodes' : undefined,
    };
  }

  /**
   * 创建快照
   */
  async createSnapshot(collectionName: string): Promise<string | null> {
    const client = this.getClient();

    try {
      const result = await client.createSnapshot(collectionName);
      return result?.name || null;
    } catch (error) {
      log.error('[Qdrant] Create snapshot error:', error);
      return null;
    }
  }

  /**
   * 优化 Collection
   */
  async optimizeCollection(collectionName: string): Promise<boolean> {
    const client = this.getClient();

    try {
      await client.updateCollection(collectionName, {
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });

      return true;
    } catch (error) {
      log.error('[Qdrant] Optimize collection error:', error);
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this.clients = [];
    this.isInitialized = false;
    log.debug('[Qdrant] Connections closed');
  }
}

// 导出单例
export const qdrantStorage = new QdrantStorage();
export default qdrantStorage;
