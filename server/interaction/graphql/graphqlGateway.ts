/**
 * GraphQL Gateway 服务（Apollo Federation）
 * 
 * 提供统一的 GraphQL 入口，支持：
 * - Schema Stitching 多服务合并
 * - Query Batching 批量查询
 * - Subscription 实时订阅
 * - DataLoader 数据加载优化
 */

import { EventEmitter } from 'events';

// ============ 类型定义 ============

export interface GraphQLGatewayConfig {
  port: number;
  playground: boolean;
  introspection: boolean;
  tracing: boolean;
  cacheControl: boolean;
  maxComplexity: number;
  maxDepth: number;
  batchingEnabled: boolean;
  batchingMaxSize: number;
  subscriptionEnabled: boolean;
}

export interface SubgraphConfig {
  name: string;
  url: string;
  healthCheckUrl?: string;
  schema?: string;
  enabled: boolean;
}

export interface GraphQLSchema {
  name: string;
  typeDefs: string;
  resolvers: Record<string, unknown>;
}

export interface QueryBatch {
  id: string;
  queries: GraphQLQuery[];
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results?: GraphQLResult[];
}

export interface GraphQLQuery {
  id: string;
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLResult {
  queryId: string;
  data?: unknown;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface Subscription {
  id: string;
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  callback: (data: unknown) => void;
  createdAt: number;
  lastEventAt?: number;
}

export interface DataLoaderConfig {
  name: string;
  batchFn: (keys: readonly string[]) => Promise<unknown[]>;
  cacheEnabled: boolean;
  maxBatchSize: number;
}

export interface GatewayStats {
  totalQueries: number;
  totalMutations: number;
  totalSubscriptions: number;
  batchedQueries: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  avgLatencyMs: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: GraphQLGatewayConfig = {
  port: 4000,
  playground: true,
  introspection: true,
  tracing: true,
  cacheControl: true,
  maxComplexity: 1000,
  maxDepth: 10,
  batchingEnabled: true,
  batchingMaxSize: 20,
  subscriptionEnabled: true,
};

// ============ PortAI Nexus子图配置 ============

export const XILIAN_SUBGRAPHS: SubgraphConfig[] = [
  {
    name: 'devices',
    url: 'http://localhost:4001/graphql',
    healthCheckUrl: 'http://localhost:4001/health',
    enabled: true,
    schema: `
      type Device @key(fields: "id") {
        id: ID!
        name: String!
        type: DeviceType!
        status: DeviceStatus!
        location: String
        manufacturer: String
        model: String
        serialNumber: String
        installDate: DateTime
        lastMaintenanceDate: DateTime
        kpis: [DeviceKPI!]!
        alerts: [DeviceAlert!]!
        spareParts: [SparePart!]!
      }

      enum DeviceType {
        CRANE
        CONVEYOR
        PUMP
        MOTOR
        SENSOR
        PLC
        HMI
      }

      enum DeviceStatus {
        ONLINE
        OFFLINE
        MAINTENANCE
        FAULT
        UNKNOWN
      }

      type DeviceKPI {
        id: ID!
        name: String!
        value: Float!
        unit: String!
        timestamp: DateTime!
      }

      type DeviceAlert {
        id: ID!
        severity: AlertSeverity!
        message: String!
        timestamp: DateTime!
        acknowledged: Boolean!
      }

      enum AlertSeverity {
        INFO
        WARNING
        ERROR
        CRITICAL
      }

      type SparePart {
        id: ID!
        name: String!
        partNumber: String!
        quantity: Int!
        minQuantity: Int!
      }

      type Query {
        device(id: ID!): Device
        devices(filter: DeviceFilter, pagination: Pagination): DeviceConnection!
        deviceStats: DeviceStats!
      }

      type Mutation {
        createDevice(input: CreateDeviceInput!): Device!
        updateDevice(id: ID!, input: UpdateDeviceInput!): Device!
        deleteDevice(id: ID!): Boolean!
        acknowledgeAlert(id: ID!): DeviceAlert!
      }

      type Subscription {
        deviceStatusChanged(deviceId: ID): Device!
        newAlert(severity: AlertSeverity): DeviceAlert!
      }

      input DeviceFilter {
        type: DeviceType
        status: DeviceStatus
        location: String
      }

      input Pagination {
        limit: Int
        offset: Int
      }

      input CreateDeviceInput {
        name: String!
        type: DeviceType!
        location: String
        manufacturer: String
        model: String
        serialNumber: String
      }

      input UpdateDeviceInput {
        name: String
        status: DeviceStatus
        location: String
      }

      type DeviceConnection {
        nodes: [Device!]!
        totalCount: Int!
        pageInfo: PageInfo!
      }

      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
      }

      type DeviceStats {
        total: Int!
        online: Int!
        offline: Int!
        maintenance: Int!
        fault: Int!
      }

      scalar DateTime
    `,
  },
  {
    name: 'knowledge',
    url: 'http://localhost:4002/graphql',
    healthCheckUrl: 'http://localhost:4002/health',
    enabled: true,
    schema: `
      type KnowledgeNode @key(fields: "id") {
        id: ID!
        type: NodeType!
        name: String!
        properties: JSON
        relations: [KnowledgeRelation!]!
        embedding: [Float!]
      }

      enum NodeType {
        EQUIPMENT
        COMPONENT
        FAULT
        SOLUTION
        VESSEL
        BERTH
        DOCUMENT
      }

      type KnowledgeRelation {
        id: ID!
        type: RelationType!
        source: KnowledgeNode!
        target: KnowledgeNode!
        properties: JSON
        weight: Float
      }

      enum RelationType {
        HAS_PART
        CAUSES
        SIMILAR_TO
        RESOLVED_BY
        AFFECTS
        REFERENCES
      }

      type Query {
        node(id: ID!): KnowledgeNode
        nodes(filter: NodeFilter, pagination: Pagination): NodeConnection!
        searchNodes(query: String!, limit: Int): [KnowledgeNode!]!
        similarNodes(nodeId: ID!, limit: Int): [KnowledgeNode!]!
        shortestPath(sourceId: ID!, targetId: ID!): [KnowledgeNode!]
        communityDetection(algorithm: CommunityAlgorithm): [Community!]!
      }

      type Mutation {
        createNode(input: CreateNodeInput!): KnowledgeNode!
        updateNode(id: ID!, input: UpdateNodeInput!): KnowledgeNode!
        deleteNode(id: ID!): Boolean!
        createRelation(input: CreateRelationInput!): KnowledgeRelation!
        deleteRelation(id: ID!): Boolean!
      }

      type Subscription {
        nodeCreated(type: NodeType): KnowledgeNode!
        relationCreated(type: RelationType): KnowledgeRelation!
      }

      input NodeFilter {
        type: NodeType
        name: String
      }

      input CreateNodeInput {
        type: NodeType!
        name: String!
        properties: JSON
      }

      input UpdateNodeInput {
        name: String
        properties: JSON
      }

      input CreateRelationInput {
        type: RelationType!
        sourceId: ID!
        targetId: ID!
        properties: JSON
        weight: Float
      }

      type NodeConnection {
        nodes: [KnowledgeNode!]!
        totalCount: Int!
        pageInfo: PageInfo!
      }

      type Community {
        id: ID!
        nodes: [KnowledgeNode!]!
        score: Float!
      }

      enum CommunityAlgorithm {
        LOUVAIN
        LABEL_PROPAGATION
        MODULARITY
      }

      scalar JSON
      scalar DateTime
    `,
  },
  {
    name: 'analytics',
    url: 'http://localhost:4003/graphql',
    healthCheckUrl: 'http://localhost:4003/health',
    enabled: true,
    schema: `
      type TimeSeriesData {
        timestamp: DateTime!
        value: Float!
        deviceId: ID!
        metric: String!
      }

      type AggregatedData {
        period: String!
        min: Float!
        max: Float!
        avg: Float!
        sum: Float!
        count: Int!
      }

      type Anomaly {
        id: ID!
        deviceId: ID!
        metric: String!
        value: Float!
        expectedValue: Float!
        zScore: Float!
        severity: AnomalySeverity!
        timestamp: DateTime!
      }

      enum AnomalySeverity {
        LOW
        MEDIUM
        HIGH
        CRITICAL
      }

      type Query {
        timeSeries(
          deviceId: ID!
          metric: String!
          startTime: DateTime!
          endTime: DateTime!
          interval: String
        ): [TimeSeriesData!]!
        
        aggregatedData(
          deviceId: ID!
          metric: String!
          startTime: DateTime!
          endTime: DateTime!
          groupBy: String!
        ): [AggregatedData!]!
        
        anomalies(
          deviceId: ID
          severity: AnomalySeverity
          startTime: DateTime
          endTime: DateTime
        ): [Anomaly!]!
        
        predictMaintenance(deviceId: ID!): MaintenancePrediction!
      }

      type Subscription {
        newTimeSeriesData(deviceId: ID!, metric: String): TimeSeriesData!
        newAnomaly(deviceId: ID, severity: AnomalySeverity): Anomaly!
      }

      type MaintenancePrediction {
        deviceId: ID!
        predictedDate: DateTime!
        confidence: Float!
        factors: [PredictionFactor!]!
      }

      type PredictionFactor {
        name: String!
        weight: Float!
        value: Float!
      }

      scalar DateTime
    `,
  },
  {
    name: 'users',
    url: 'http://localhost:4004/graphql',
    healthCheckUrl: 'http://localhost:4004/health',
    enabled: true,
    schema: `
      type User @key(fields: "id") {
        id: ID!
        username: String!
        email: String!
        role: UserRole!
        permissions: [Permission!]!
        preferences: UserPreferences
        createdAt: DateTime!
        lastLoginAt: DateTime
      }

      enum UserRole {
        ADMIN
        OPERATOR
        VIEWER
        VIP
      }

      type Permission {
        resource: String!
        actions: [String!]!
      }

      type UserPreferences {
        theme: String
        language: String
        notifications: NotificationSettings
      }

      type NotificationSettings {
        email: Boolean!
        push: Boolean!
        sms: Boolean!
      }

      type Query {
        me: User
        user(id: ID!): User
        users(filter: UserFilter, pagination: Pagination): UserConnection!
      }

      type Mutation {
        updateProfile(input: UpdateProfileInput!): User!
        updatePreferences(input: UpdatePreferencesInput!): User!
        changePassword(oldPassword: String!, newPassword: String!): Boolean!
      }

      input UserFilter {
        role: UserRole
        search: String
      }

      input UpdateProfileInput {
        email: String
      }

      input UpdatePreferencesInput {
        theme: String
        language: String
        notifications: NotificationSettingsInput
      }

      input NotificationSettingsInput {
        email: Boolean
        push: Boolean
        sms: Boolean
      }

      type UserConnection {
        nodes: [User!]!
        totalCount: Int!
        pageInfo: PageInfo!
      }

      scalar DateTime
    `,
  },
];

// ============ GraphQL Gateway 服务 ============

export class GraphQLGateway extends EventEmitter {
  private config: GraphQLGatewayConfig;
  private subgraphs: Map<string, SubgraphConfig> = new Map();
  private schemas: Map<string, GraphQLSchema> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private dataLoaders: Map<string, DataLoaderConfig> = new Map();
  private queryBatches: Map<string, QueryBatch> = new Map();
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();
  private stats: GatewayStats = {
    totalQueries: 0,
    totalMutations: 0,
    totalSubscriptions: 0,
    batchedQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    avgLatencyMs: 0,
  };
  private latencies: number[] = [];
  private isInitialized: boolean = false;

  constructor(config?: Partial<GraphQLGatewayConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化网关
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[GraphQLGateway] Already initialized');
      return;
    }

    console.log('[GraphQLGateway] Initializing...');

    // 加载子图配置
    for (const subgraph of XILIAN_SUBGRAPHS) {
      this.subgraphs.set(subgraph.name, subgraph);
    }

    // 初始化 DataLoader
    this.initializeDataLoaders();

    this.isInitialized = true;
    console.log(`[GraphQLGateway] Initialized with ${this.subgraphs.size} subgraphs`);
  }

  /**
   * 关闭网关
   */
  async close(): Promise<void> {
    // 清理订阅
    const subscriptionIds = Array.from(this.subscriptions.keys());
    for (const id of subscriptionIds) {
      this.unsubscribe(id);
    }

    // 清理缓存
    this.cache.clear();

    this.isInitialized = false;
    console.log('[GraphQLGateway] Closed');
  }

  // ============ Schema Stitching ============

  /**
   * 合并所有子图 Schema
   */
  stitchSchemas(): string {
    const schemas: string[] = [];
    
    // 添加公共类型
    schemas.push(`
      type Query {
        _service: _Service!
      }

      type _Service {
        sdl: String!
      }

      directive @key(fields: String!) on OBJECT | INTERFACE
      directive @external on FIELD_DEFINITION
      directive @requires(fields: String!) on FIELD_DEFINITION
      directive @provides(fields: String!) on FIELD_DEFINITION
      directive @extends on OBJECT | INTERFACE

      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
      }

      input Pagination {
        limit: Int
        offset: Int
      }

      scalar DateTime
      scalar JSON
    `);

    // 合并子图 Schema
    const subgraphValues = Array.from(this.subgraphs.values());
    for (const subgraph of subgraphValues) {
      if (subgraph.enabled && subgraph.schema) {
        schemas.push(subgraph.schema);
      }
    }

    return schemas.join('\n\n');
  }

  /**
   * 获取合并后的 Schema
   */
  getStitchedSchema(): string {
    return this.stitchSchemas();
  }

  /**
   * 添加子图
   */
  addSubgraph(subgraph: SubgraphConfig): void {
    this.subgraphs.set(subgraph.name, subgraph);
    console.log(`[GraphQLGateway] Subgraph added: ${subgraph.name}`);
  }

  /**
   * 移除子图
   */
  removeSubgraph(name: string): void {
    this.subgraphs.delete(name);
    console.log(`[GraphQLGateway] Subgraph removed: ${name}`);
  }

  /**
   * 获取所有子图
   */
  getSubgraphs(): SubgraphConfig[] {
    return Array.from(this.subgraphs.values());
  }

  // ============ Query Batching ============

  /**
   * 创建查询批次
   */
  createBatch(queries: GraphQLQuery[]): QueryBatch {
    const batch: QueryBatch = {
      id: this.generateId(),
      queries,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.queryBatches.set(batch.id, batch);
    return batch;
  }

  /**
   * 执行批量查询
   */
  async executeBatch(batchId: string): Promise<GraphQLResult[]> {
    const batch = this.queryBatches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    batch.status = 'processing';
    const startTime = Date.now();

    try {
      const results: GraphQLResult[] = [];

      // 并行执行所有查询
      const promises = batch.queries.map(async (query) => {
        return this.executeQuery(query);
      });

      const queryResults = await Promise.all(promises);
      
      for (let i = 0; i < batch.queries.length; i++) {
        results.push({
          queryId: batch.queries[i].id,
          ...queryResults[i],
        });
      }

      batch.results = results;
      batch.status = 'completed';
      this.stats.batchedQueries += batch.queries.length;

      const latency = Date.now() - startTime;
      this.recordLatency(latency);

      return results;
    } catch (error) {
      batch.status = 'failed';
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 执行单个查询
   */
  async executeQuery(query: GraphQLQuery): Promise<{ data?: unknown; errors?: GraphQLError[] }> {
    const startTime = Date.now();

    try {
      // 检查缓存
      const cacheKey = this.getCacheKey(query);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return { data: cached };
      }

      this.stats.cacheMisses++;

      // 解析查询类型
      const operationType = this.getOperationType(query.query);
      
      if (operationType === 'query') {
        this.stats.totalQueries++;
      } else if (operationType === 'mutation') {
        this.stats.totalMutations++;
      }

      // 路由到对应子图
      const subgraph = this.routeQuery(query);
      if (!subgraph) {
        return {
          errors: [{ message: 'No subgraph found for query' }],
        };
      }

      // 模拟查询执行（实际实现需要发送 HTTP 请求到子图）
      const result = await this.executeOnSubgraph(subgraph, query);

      // 缓存结果（仅缓存查询）
      if (operationType === 'query' && result.data) {
        this.setCache(cacheKey, result.data, 60000); // 1分钟缓存
      }

      const latency = Date.now() - startTime;
      this.recordLatency(latency);

      return result;
    } catch (error) {
      this.stats.errors++;
      return {
        errors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  /**
   * 路由查询到子图
   */
  private routeQuery(query: GraphQLQuery): SubgraphConfig | null {
    const queryText = query.query.toLowerCase();

    // 根据查询内容路由到对应子图
    if (queryText.includes('device') || queryText.includes('alert') || queryText.includes('sparepart')) {
      return this.subgraphs.get('devices') || null;
    }
    if (queryText.includes('node') || queryText.includes('relation') || queryText.includes('community')) {
      return this.subgraphs.get('knowledge') || null;
    }
    if (queryText.includes('timeseries') || queryText.includes('anomaly') || queryText.includes('predict')) {
      return this.subgraphs.get('analytics') || null;
    }
    if (queryText.includes('user') || queryText.includes('permission') || queryText.includes('preference')) {
      return this.subgraphs.get('users') || null;
    }

    // 默认返回第一个启用的子图
    const subgraphArray = Array.from(this.subgraphs.values());
    for (const subgraph of subgraphArray) {
      if (subgraph.enabled) {
        return subgraph;
      }
    }

    return null;
  }

  /**
   * 在子图上执行查询
   */
  private async executeOnSubgraph(
    subgraph: SubgraphConfig,
    query: GraphQLQuery
  ): Promise<{ data?: unknown; errors?: GraphQLError[] }> {
    // 模拟执行（实际实现需要发送 HTTP 请求）
    console.log(`[GraphQLGateway] Executing query on subgraph: ${subgraph.name}`);

    // 模拟响应
    return {
      data: {
        __typename: 'QueryResult',
        subgraph: subgraph.name,
        query: query.operationName || 'anonymous',
      },
    };
  }

  // ============ Subscription 实时订阅 ============

  /**
   * 创建订阅
   */
  subscribe(
    query: string,
    variables: Record<string, unknown> | undefined,
    callback: (data: unknown) => void
  ): string {
    const subscription: Subscription = {
      id: this.generateId(),
      query,
      variables,
      callback,
      createdAt: Date.now(),
    };

    this.subscriptions.set(subscription.id, subscription);
    this.stats.totalSubscriptions++;

    console.log(`[GraphQLGateway] Subscription created: ${subscription.id}`);
    return subscription.id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    this.subscriptions.delete(subscriptionId);
    console.log(`[GraphQLGateway] Subscription removed: ${subscriptionId}`);
    return true;
  }

  /**
   * 发布订阅事件
   */
  publish(topic: string, data: unknown): void {
    const subscriptionArray = Array.from(this.subscriptions.values());
    for (const subscription of subscriptionArray) {
      if (subscription.query.includes(topic)) {
        subscription.callback(data);
        subscription.lastEventAt = Date.now();
      }
    }
  }

  /**
   * 获取所有订阅
   */
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ============ DataLoader 数据加载优化 ============

  /**
   * 初始化 DataLoader
   */
  private initializeDataLoaders(): void {
    // 设备 DataLoader
    this.registerDataLoader({
      name: 'devices',
      batchFn: async (keys) => {
        console.log(`[DataLoader] Loading ${keys.length} devices`);
        return keys.map(key => ({ id: key, name: `Device ${key}` }));
      },
      cacheEnabled: true,
      maxBatchSize: 100,
    });

    // 用户 DataLoader
    this.registerDataLoader({
      name: 'users',
      batchFn: async (keys) => {
        console.log(`[DataLoader] Loading ${keys.length} users`);
        return keys.map(key => ({ id: key, username: `User ${key}` }));
      },
      cacheEnabled: true,
      maxBatchSize: 50,
    });

    // 知识节点 DataLoader
    this.registerDataLoader({
      name: 'knowledgeNodes',
      batchFn: async (keys) => {
        console.log(`[DataLoader] Loading ${keys.length} knowledge nodes`);
        return keys.map(key => ({ id: key, name: `Node ${key}` }));
      },
      cacheEnabled: true,
      maxBatchSize: 200,
    });
  }

  /**
   * 注册 DataLoader
   */
  registerDataLoader(config: DataLoaderConfig): void {
    this.dataLoaders.set(config.name, config);
    console.log(`[GraphQLGateway] DataLoader registered: ${config.name}`);
  }

  /**
   * 获取 DataLoader
   */
  getDataLoader(name: string): DataLoaderConfig | undefined {
    return this.dataLoaders.get(name);
  }

  /**
   * 使用 DataLoader 加载数据
   */
  async load(loaderName: string, key: string): Promise<unknown> {
    const loader = this.dataLoaders.get(loaderName);
    if (!loader) {
      throw new Error(`DataLoader not found: ${loaderName}`);
    }

    const results = await loader.batchFn([key]);
    return results[0];
  }

  /**
   * 批量加载数据
   */
  async loadMany(loaderName: string, keys: string[]): Promise<unknown[]> {
    const loader = this.dataLoaders.get(loaderName);
    if (!loader) {
      throw new Error(`DataLoader not found: ${loaderName}`);
    }

    // 分批加载
    const batches: string[][] = [];
    for (let i = 0; i < keys.length; i += loader.maxBatchSize) {
      batches.push(keys.slice(i, i + loader.maxBatchSize));
    }

    const results: unknown[] = [];
    for (const batch of batches) {
      const batchResults = await loader.batchFn(batch);
      results.push(...batchResults);
    }

    return results;
  }

  // ============ 缓存管理 ============

  /**
   * 获取缓存键
   */
  private getCacheKey(query: GraphQLQuery): string {
    return `${query.query}:${JSON.stringify(query.variables || {})}`;
  }

  /**
   * 从缓存获取
   */
  private getFromCache(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存
   */
  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[GraphQLGateway] Cache cleared');
  }

  // ============ 辅助方法 ============

  /**
   * 获取操作类型
   */
  private getOperationType(query: string): 'query' | 'mutation' | 'subscription' {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.startsWith('mutation')) return 'mutation';
    if (trimmed.startsWith('subscription')) return 'subscription';
    return 'query';
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 记录延迟
   */
  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-500);
    }
    this.stats.avgLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  // ============ 统计和监控 ============

  /**
   * 获取统计信息
   */
  getStats(): GatewayStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      totalMutations: 0,
      totalSubscriptions: 0,
      batchedQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      avgLatencyMs: 0,
    };
    this.latencies = [];
  }

  /**
   * 获取状态
   */
  getStatus(): {
    initialized: boolean;
    subgraphCount: number;
    activeSubscriptions: number;
    cacheSize: number;
    dataLoaderCount: number;
  } {
    return {
      initialized: this.isInitialized,
      subgraphCount: this.subgraphs.size,
      activeSubscriptions: this.subscriptions.size,
      cacheSize: this.cache.size,
      dataLoaderCount: this.dataLoaders.size,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    subgraphs: { name: string; healthy: boolean }[];
  }> {
    const subgraphHealth: { name: string; healthy: boolean }[] = [];

    const subgraphEntries = Array.from(this.subgraphs.entries());
    for (const [name, subgraph] of subgraphEntries) {
      // 模拟健康检查（实际实现需要发送 HTTP 请求）
      subgraphHealth.push({
        name,
        healthy: subgraph.enabled,
      });
    }

    return {
      healthy: this.isInitialized && subgraphHealth.every(s => s.healthy),
      subgraphs: subgraphHealth,
    };
  }
}

// 导出单例
export const graphqlGateway = new GraphQLGateway();
