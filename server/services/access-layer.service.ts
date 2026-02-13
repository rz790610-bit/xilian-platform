/**
 * 接入层统一服务
 * Connector → Endpoint → Binding 三级模型的 CRUD + 连接测试 + 资源发现
 */
import { getDb } from "../lib/db";
import { eq, and, like, desc, sql, inArray } from "drizzle-orm";
import {
  dataConnectors, dataEndpoints, dataBindings,
  type DataConnector, type InsertDataConnector,
  type DataEndpoint, type InsertDataEndpoint,
  type DataBinding, type InsertDataBinding,
} from "../../drizzle/schema";
import type {
  ProtocolType, ConnectorStatus, ConnectionTestResult,
  DiscoveredEndpoint, AccessLayerStats, HealthCheckResult,
} from "../../shared/accessLayerTypes";
import { protocolAdapters } from "./protocol-adapters";

// ============ Connector CRUD ============

export async function listConnectors(opts: {
  protocolType?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { page = 1, pageSize = 50, protocolType, status, search } = opts;
  const conditions = [];
  if (protocolType) conditions.push(eq(dataConnectors.protocolType, protocolType));
  if (status) conditions.push(eq(dataConnectors.status, status));
  if (search) conditions.push(like(dataConnectors.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.select().from(dataConnectors)
      .where(where)
      .orderBy(desc(dataConnectors.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(dataConnectors).where(where),
  ]);

  // 统计每个 connector 的 endpoint 数量
  const connectorIds = items.map(c => c.connectorId);
  let endpointCounts: Record<string, number> = {};
  if (connectorIds.length > 0) {
    const epCounts = await db.select({
      connectorId: dataEndpoints.connectorId,
      count: sql<number>`count(*)`,
    }).from(dataEndpoints)
      .where(inArray(dataEndpoints.connectorId, connectorIds))
      .groupBy(dataEndpoints.connectorId);
    endpointCounts = Object.fromEntries(epCounts.map(e => [e.connectorId, Number(e.count)]));
  }

  return {
    items: items.map(c => ({ ...c, endpointCount: endpointCounts[c.connectorId] || 0 })),
    total: Number(countResult[0]?.count || 0),
    page,
    pageSize,
  };
}

export async function getConnector(connectorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [connector] = await db.select().from(dataConnectors)
    .where(eq(dataConnectors.connectorId, connectorId)).limit(1);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);

  const endpoints = await db.select().from(dataEndpoints)
    .where(eq(dataEndpoints.connectorId, connectorId))
    .orderBy(dataEndpoints.name);

  // 获取每个 endpoint 的 binding 数量
  const epIds = endpoints.map(e => e.endpointId);
  let bindingCounts: Record<string, number> = {};
  if (epIds.length > 0) {
    const bCounts = await db.select({
      endpointId: dataBindings.endpointId,
      count: sql<number>`count(*)`,
    }).from(dataBindings)
      .where(inArray(dataBindings.endpointId, epIds))
      .groupBy(dataBindings.endpointId);
    bindingCounts = Object.fromEntries(bCounts.map(b => [b.endpointId, Number(b.count)]));
  }

  return {
    ...connector,
    endpoints: endpoints.map(e => ({
      ...e,
      bindingCount: bindingCounts[e.endpointId] || 0,
    })),
  };
}

export async function createConnector(data: {
  name: string;
  protocolType: ProtocolType;
  description?: string;
  connectionParams: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  healthCheckConfig?: Record<string, unknown>;
  sourceRef?: string;
  tags?: string[];
  createdBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const connectorId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(dataConnectors).values({
    connectorId,
    name: data.name,
    description: data.description || null,
    protocolType: data.protocolType,
    connectionParams: data.connectionParams,
    authConfig: data.authConfig || null,
    healthCheckConfig: data.healthCheckConfig || null,
    status: "draft",
    sourceRef: data.sourceRef || "manual",
    tags: data.tags || null,
    createdBy: data.createdBy || null,
  });

  const [created] = await db.select().from(dataConnectors)
    .where(eq(dataConnectors.connectorId, connectorId)).limit(1);
  return created;
}

export async function updateConnector(connectorId: string, data: Partial<{
  name: string;
  description: string;
  connectionParams: Record<string, unknown>;
  authConfig: Record<string, unknown>;
  healthCheckConfig: Record<string, unknown>;
  status: ConnectorStatus;
  tags: string[];
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dataConnectors).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(dataConnectors.connectorId, connectorId));

  const [updated] = await db.select().from(dataConnectors)
    .where(eq(dataConnectors.connectorId, connectorId)).limit(1);
  return updated;
}

export async function deleteConnector(connectorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 级联删除：先删 bindings → endpoints → connector
  const endpoints = await db.select({ endpointId: dataEndpoints.endpointId })
    .from(dataEndpoints).where(eq(dataEndpoints.connectorId, connectorId));
  const epIds = endpoints.map(e => e.endpointId);
  if (epIds.length > 0) {
    await db.delete(dataBindings).where(inArray(dataBindings.endpointId, epIds));
  }
  await db.delete(dataEndpoints).where(eq(dataEndpoints.connectorId, connectorId));
  await db.delete(dataConnectors).where(eq(dataConnectors.connectorId, connectorId));

  return { deleted: true, connectorId };
}

// ============ Endpoint CRUD ============

export async function listEndpoints(connectorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(dataEndpoints)
    .where(eq(dataEndpoints.connectorId, connectorId))
    .orderBy(dataEndpoints.name);
}

export async function createEndpoint(data: {
  connectorId: string;
  name: string;
  resourcePath: string;
  resourceType: string;
  dataFormat?: string;
  schemaInfo?: Record<string, unknown>;
  samplingConfig?: Record<string, unknown>;
  preprocessConfig?: Record<string, unknown>;
  protocolConfigId?: string;
  sensorId?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const endpointId = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(dataEndpoints).values({
    endpointId,
    connectorId: data.connectorId,
    name: data.name,
    resourcePath: data.resourcePath,
    resourceType: data.resourceType,
    dataFormat: data.dataFormat || "json",
    schemaInfo: data.schemaInfo || null,
    samplingConfig: data.samplingConfig || null,
    preprocessConfig: data.preprocessConfig || null,
    protocolConfigId: data.protocolConfigId || null,
    sensorId: data.sensorId || null,
    status: "active",
    metadata: data.metadata || null,
  });

  const [created] = await db.select().from(dataEndpoints)
    .where(eq(dataEndpoints.endpointId, endpointId)).limit(1);
  return created;
}

export async function createEndpointsBatch(endpoints: Array<{
  connectorId: string;
  name: string;
  resourcePath: string;
  resourceType: string;
  dataFormat?: string;
  schemaInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (endpoints.length === 0) return [];

  const values = endpoints.map(ep => ({
    endpointId: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    connectorId: ep.connectorId,
    name: ep.name,
    resourcePath: ep.resourcePath,
    resourceType: ep.resourceType,
    dataFormat: ep.dataFormat || "json",
    schemaInfo: ep.schemaInfo || null,
    metadata: ep.metadata || null,
    status: "active",
    discoveredAt: new Date(),
  }));

  await db.insert(dataEndpoints).values(values);
  return values.map(v => v.endpointId);
}

export async function updateEndpoint(endpointId: string, data: Partial<{
  name: string;
  resourcePath: string;
  dataFormat: string;
  schemaInfo: Record<string, unknown>;
  samplingConfig: Record<string, unknown>;
  preprocessConfig: Record<string, unknown>;
  sensorId: string;
  status: string;
  metadata: Record<string, unknown>;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dataEndpoints).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(dataEndpoints.endpointId, endpointId));

  const [updated] = await db.select().from(dataEndpoints)
    .where(eq(dataEndpoints.endpointId, endpointId)).limit(1);
  return updated;
}

export async function deleteEndpoint(endpointId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(dataBindings).where(eq(dataBindings.endpointId, endpointId));
  await db.delete(dataEndpoints).where(eq(dataEndpoints.endpointId, endpointId));
  return { deleted: true, endpointId };
}

// ============ Binding CRUD ============

export async function listBindings(opts: {
  endpointId?: string;
  targetType?: string;
  targetId?: string;
} = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (opts.endpointId) conditions.push(eq(dataBindings.endpointId, opts.endpointId));
  if (opts.targetType) conditions.push(eq(dataBindings.targetType, opts.targetType));
  if (opts.targetId) conditions.push(eq(dataBindings.targetId, opts.targetId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const bindings = await db.select().from(dataBindings)
    .where(where)
    .orderBy(desc(dataBindings.createdAt));

  // 关联 endpoint 和 connector 名称
  if (bindings.length > 0) {
    const epIds = Array.from(new Set(bindings.map(b => b.endpointId)));
    const eps = await db.select({
      endpointId: dataEndpoints.endpointId,
      name: dataEndpoints.name,
      connectorId: dataEndpoints.connectorId,
    }).from(dataEndpoints).where(inArray(dataEndpoints.endpointId, epIds));
    const epMap = Object.fromEntries(eps.map(e => [e.endpointId, e]));

    const connIds = Array.from(new Set(eps.map(e => e.connectorId)));
    const conns = connIds.length > 0
      ? await db.select({ connectorId: dataConnectors.connectorId, name: dataConnectors.name })
          .from(dataConnectors).where(inArray(dataConnectors.connectorId, connIds))
      : [];
    const connMap = Object.fromEntries(conns.map(c => [c.connectorId, c.name]));

    return bindings.map(b => ({
      ...b,
      endpointName: epMap[b.endpointId]?.name || '',
      connectorName: connMap[epMap[b.endpointId]?.connectorId || ''] || '',
    }));
  }

  return bindings;
}

export async function createBinding(data: {
  endpointId: string;
  targetType: string;
  targetId: string;
  direction?: string;
  transformConfig?: Record<string, unknown>;
  bufferConfig?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const bindingId = `bind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(dataBindings).values({
    bindingId,
    endpointId: data.endpointId,
    targetType: data.targetType,
    targetId: data.targetId,
    direction: data.direction || "ingest",
    transformConfig: data.transformConfig || null,
    bufferConfig: data.bufferConfig || null,
    status: "active",
  });

  const [created] = await db.select().from(dataBindings)
    .where(eq(dataBindings.bindingId, bindingId)).limit(1);
  return created;
}

export async function updateBinding(bindingId: string, data: Partial<{
  transformConfig: Record<string, unknown>;
  bufferConfig: Record<string, unknown>;
  status: string;
  direction: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dataBindings).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(dataBindings.bindingId, bindingId));

  const [updated] = await db.select().from(dataBindings)
    .where(eq(dataBindings.bindingId, bindingId)).limit(1);
  return updated;
}

export async function deleteBinding(bindingId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(dataBindings).where(eq(dataBindings.bindingId, bindingId));
  return { deleted: true, bindingId };
}

// ============ 连接测试 ============

export async function testConnection(
  protocolType: ProtocolType,
  connectionParams: Record<string, unknown>,
  authConfig?: Record<string, unknown>,
): Promise<ConnectionTestResult> {
  const adapter = protocolAdapters[protocolType];
  if (!adapter) {
    return { success: false, latencyMs: 0, message: `不支持的协议类型: ${protocolType}` };
  }
  return adapter.testConnection(connectionParams, authConfig);
}

// ============ 资源发现 ============

export async function discoverEndpoints(
  connectorId: string,
): Promise<DiscoveredEndpoint[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [connector] = await db.select().from(dataConnectors)
    .where(eq(dataConnectors.connectorId, connectorId)).limit(1);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);

  const adapter = protocolAdapters[connector.protocolType as ProtocolType];
  if (!adapter || !adapter.discoverResources) {
    return [];
  }

  return adapter.discoverResources(
    connector.connectionParams as Record<string, unknown>,
    connector.authConfig as Record<string, unknown> | undefined,
  );
}

// ============ 健康检查 ============

export async function healthCheck(connectorId: string): Promise<HealthCheckResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [connector] = await db.select().from(dataConnectors)
    .where(eq(dataConnectors.connectorId, connectorId)).limit(1);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);

  const adapter = protocolAdapters[connector.protocolType as ProtocolType];
  if (!adapter) {
    return { status: 'unhealthy', latencyMs: 0, message: '不支持的协议', checkedAt: new Date().toISOString() };
  }

  const result = await adapter.testConnection(
    connector.connectionParams as Record<string, unknown>,
    connector.authConfig as Record<string, unknown> | undefined,
  );

  const healthResult: HealthCheckResult = {
    status: result.success ? 'healthy' : 'unhealthy',
    latencyMs: result.latencyMs,
    message: result.message,
    checkedAt: new Date().toISOString(),
  };

  // 更新 connector 状态
  await db.update(dataConnectors).set({
    status: result.success ? "connected" : "error",
    lastHealthCheck: new Date(),
    lastError: result.success ? null : result.message,
    updatedAt: new Date(),
  }).where(eq(dataConnectors.connectorId, connectorId));

  return healthResult;
}

// ============ 统计 ============

export async function getStats(): Promise<AccessLayerStats> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [connCount] = await db.select({ count: sql<number>`count(*)` }).from(dataConnectors);
  const [connectedCount] = await db.select({ count: sql<number>`count(*)` }).from(dataConnectors).where(eq(dataConnectors.status, "connected"));
  const [errorCount] = await db.select({ count: sql<number>`count(*)` }).from(dataConnectors).where(eq(dataConnectors.status, "error"));
  const [epCount] = await db.select({ count: sql<number>`count(*)` }).from(dataEndpoints);
  const [bindCount] = await db.select({ count: sql<number>`count(*)` }).from(dataBindings);

  const protocolDist = await db.select({
    protocol: dataConnectors.protocolType,
    count: sql<number>`count(*)`,
  }).from(dataConnectors).groupBy(dataConnectors.protocolType);

  const statusDist = await db.select({
    status: dataConnectors.status,
    count: sql<number>`count(*)`,
  }).from(dataConnectors).groupBy(dataConnectors.status);

  return {
    totalConnectors: Number(connCount?.count || 0),
    connectedCount: Number(connectedCount?.count || 0),
    errorCount: Number(errorCount?.count || 0),
    totalEndpoints: Number(epCount?.count || 0),
    totalBindings: Number(bindCount?.count || 0),
    protocolDistribution: Object.fromEntries(protocolDist.map(p => [p.protocol, Number(p.count)])),
    statusDistribution: Object.fromEntries(statusDist.map(s => [s.status, Number(s.count)])),
  };
}

// ============ 协议配置 Schema 查询 ============

export function getProtocolConfigSchema(protocolType: ProtocolType) {
  const adapter = protocolAdapters[protocolType];
  if (!adapter) return null;
  return adapter.configSchema;
}

export function getAllProtocolSchemas() {
  return Object.entries(protocolAdapters).map(([type, adapter]) => ({
    ...adapter.configSchema,
    protocolType: type as ProtocolType,
  }));
}
