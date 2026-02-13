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

// ============ 自动建表 ============
let _tablesEnsured = false;
async function ensureAccessLayerTables(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (_tablesEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS data_connectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        connector_id VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        protocol_type VARCHAR(32) NOT NULL,
        connection_params JSON NOT NULL,
        auth_config JSON,
        health_check_config JSON,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        last_health_check TIMESTAMP(3) NULL,
        last_error TEXT,
        source_ref VARCHAR(128),
        tags JSON,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_by VARCHAR(64),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_dc_protocol (protocol_type),
        INDEX idx_dc_status (status),
        INDEX idx_dc_source_ref (source_ref)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS data_endpoints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        endpoint_id VARCHAR(64) NOT NULL UNIQUE,
        connector_id VARCHAR(64) NOT NULL,
        name VARCHAR(200) NOT NULL,
        resource_path VARCHAR(500) NOT NULL,
        resource_type VARCHAR(32) NOT NULL,
        data_format VARCHAR(32) DEFAULT 'json',
        schema_info JSON,
        sampling_config JSON,
        preprocess_config JSON,
        protocol_config_id VARCHAR(64),
        sensor_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        discovered_at TIMESTAMP(3) NULL,
        metadata JSON,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_de_connector (connector_id),
        INDEX idx_de_resource_type (resource_type),
        INDEX idx_de_sensor (sensor_id),
        INDEX idx_de_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS data_bindings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        binding_id VARCHAR(64) NOT NULL UNIQUE,
        endpoint_id VARCHAR(64) NOT NULL,
        target_type VARCHAR(32) NOT NULL,
        target_id VARCHAR(128) NOT NULL,
        direction VARCHAR(16) NOT NULL DEFAULT 'ingest',
        transform_config JSON,
        buffer_config JSON,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        last_sync_at TIMESTAMP(3) NULL,
        sync_stats JSON,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_db_endpoint (endpoint_id),
        INDEX idx_db_target (target_type, target_id),
        INDEX idx_db_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    _tablesEnsured = true;
  } catch (err) {
    console.warn('[AccessLayer] ensureAccessLayerTables warning:', err);
    _tablesEnsured = true; // 避免反复重试
  }
}

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
  await ensureAccessLayerTables(db);

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
  await ensureAccessLayerTables(db);

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
  await ensureAccessLayerTables(db);

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

// ============ 演示数据种子（基于真实SHM传感器数据格式） ============

export async function seedDemoData() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await ensureAccessLayerTables(db);

  // 检查是否已有数据
  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(dataConnectors);
  if (Number(existing?.count || 0) > 0) {
    return { seeded: false, message: "已有数据，跳过种子" };
  }

  const now = new Date();
  const connectors: Array<{
    connectorId: string; name: string; description: string;
    protocolType: string; connectionParams: unknown; authConfig: unknown;
    healthCheckConfig: unknown; status: string; sourceRef: string;
    tags: string[]; lastHealthCheck: Date | null; createdBy: string;
  }> = [];
  const endpoints: Array<{
    endpointId: string; connectorId: string; name: string;
    resourcePath: string; resourceType: string; dataFormat: string | null;
    schemaInfo: unknown; samplingConfig: unknown; preprocessConfig: unknown;
    protocolConfigId: string | null; sensorId: string | null;
    status: string; metadata: unknown;
  }> = [];
  const bindings: Array<{
    bindingId: string; endpointId: string; targetType: string;
    targetId: string; direction: string; transformConfig: unknown;
    bufferConfig: unknown; status: string;
  }> = [];

  // ─── 1. MQTT 应力采集网关 ───
  const mqttConnId = "conn_demo_mqtt_shm";
  connectors.push({
    connectorId: mqttConnId,
    name: "SHM应力采集网关",
    description: "结构健康监测系统 - MQTT协议应力数据采集网关，连接设备1904000115（24通道应变片）",
    protocolType: "mqtt",
    connectionParams: {
      host: "10.0.1.100",
      port: 1883,
      clientId: "xilian-shm-stress-collector",
      keepAlive: 60,
      cleanSession: false,
    },
    authConfig: { username: "shm_collector", password: "***" },
    healthCheckConfig: { interval: 30, timeout: 5 },
    status: "connected",
    sourceRef: "edge_gateway:gw-001",
    tags: ["SHM", "应力", "实时采集", "1904000115"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  // 应力传感器24通道端点
  const stressChannelMeta: Record<string, { mean: number; label: string }> = {
    "01": { mean: -38.566, label: "主梁上翼缘-左1" },
    "02": { mean: -20.452, label: "主梁上翼缘-左2" },
    "03": { mean: -12.163, label: "主梁上翼缘-中1" },
    "04": { mean: -56.587, label: "主梁下翼缘-左1" },
    "05": { mean: 12.390, label: "主梁下翼缘-左2" },
    "06": { mean: -13.610, label: "主梁下翼缘-中1" },
    "07": { mean: -27.891, label: "横梁连接-左" },
    "08": { mean: -26.194, label: "横梁连接-右" },
    "09": { mean: -48.041, label: "支座区域-左1" },
    "10": { mean: -56.238, label: "支座区域-左2" },
    "11": { mean: 26.434, label: "支座区域-右1" },
    "12": { mean: -35.842, label: "支座区域-右2" },
    "13": { mean: -41.287, label: "腹板-左上" },
    "14": { mean: 47.630, label: "腹板-左下" },
    "15": { mean: -50.703, label: "腹板-右上" },
    "16": { mean: -13.253, label: "腹板-右下" },
    "17": { mean: 47.471, label: "加劲肋-左1" },
    "18": { mean: 36.334, label: "加劲肋-左2" },
    "19": { mean: -18.610, label: "加劲肋-右1" },
    "20": { mean: 38.816, label: "加劲肋-右2" },
    "21": { mean: -16.094, label: "桥面板-左" },
    "22": { mean: -49.714, label: "桥面板-中" },
    "23": { mean: -29.903, label: "桥面板-右" },
    "24": { mean: -25.795, label: "锚固区" },
  };

  for (const [ch, meta] of Object.entries(stressChannelMeta)) {
    const epId = `ep_demo_stress_ch${ch}`;
    endpoints.push({
      endpointId: epId,
      connectorId: mqttConnId,
      name: `应力-CH${ch} ${meta.label}`,
      resourcePath: `shm/1904000115/stress/${ch}`,
      resourceType: "topic",
      dataFormat: "csv_stream",
      schemaInfo: {
        columns: [{ name: "value", type: "float64", unit: "MPa" }],
        fileNamePattern: "{timestamp}_{mean}_工程值_{deviceId}_{channel}_N_{sampleRate}_{sampleCount}_{params}.csv",
        deviceId: "1904000115",
        channel: ch,
      },
      samplingConfig: {
        frequency: 20,
        unit: "Hz",
        samplesPerFile: 1200,
        fileDuration: 60,
        triggerMode: "continuous",
      },
      preprocessConfig: {
        detrend: true,
        filterType: "lowpass",
        cutoffFrequency: 8,
        unit: "MPa",
      },
      protocolConfigId: null,
      sensorId: `sensor_1904000115_${ch}`,
      status: "active",
      metadata: {
        meanValue: meta.mean,
        dataRange: { min: meta.mean - 5, max: meta.mean + 5 },
        location: meta.label,
        sensorType: "strain_gauge",
        installDate: "2024-06-15",
        lastDataTime: "2026-01-24T11:32:59Z",
      },
    });

    // 绑定到 Pipeline 和 KG
    bindings.push({
      bindingId: `bind_demo_stress_ch${ch}_pipeline`,
      endpointId: epId,
      targetType: "pipeline_node",
      targetId: `pipeline_shm_stress_ch${ch}`,
      direction: "ingest",
      transformConfig: { parseMode: "line_by_line", valueType: "float64", unit: "MPa" },
      bufferConfig: { maxSize: 12000, flushInterval: 60 },
      status: "active",
    });
  }

  // ─── 2. MQTT 温度采集网关 ───
  const mqttTempConnId = "conn_demo_mqtt_temp";
  connectors.push({
    connectorId: mqttTempConnId,
    name: "SHM温度采集网关",
    description: "结构健康监测系统 - MQTT协议温度数据采集网关，连接设备1903000114（多通道温度传感器）",
    protocolType: "mqtt",
    connectionParams: {
      host: "10.0.1.100",
      port: 1883,
      clientId: "xilian-shm-temp-collector",
      keepAlive: 60,
      cleanSession: false,
    },
    authConfig: { username: "shm_collector", password: "***" },
    healthCheckConfig: { interval: 60, timeout: 5 },
    status: "connected",
    sourceRef: "edge_gateway:gw-001",
    tags: ["SHM", "温度", "低频采集", "1903000114"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  const tempChannels = [
    { ch: "01", label: "环境温度-北", mean: 11.2 },
    { ch: "02", label: "环境温度-南", mean: 13.5 },
    { ch: "03", label: "钢箱梁内部-左", mean: 14.8 },
    { ch: "04", label: "钢箱梁内部-右", mean: 15.1 },
    { ch: "05", label: "桥面板表面", mean: 12.968 },
    { ch: "06", label: "主梁腹板", mean: 13.7 },
    { ch: "07", label: "支座区域", mean: 12.3 },
    { ch: "08", label: "锚固区", mean: 11.9 },
  ];

  for (const tc of tempChannels) {
    const epId = `ep_demo_temp_ch${tc.ch}`;
    endpoints.push({
      endpointId: epId,
      connectorId: mqttTempConnId,
      name: `温度-CH${tc.ch} ${tc.label}`,
      resourcePath: `shm/1903000114/temperature/${tc.ch}`,
      resourceType: "topic",
      dataFormat: "csv_stream",
      schemaInfo: {
        columns: [{ name: "value", type: "float64", unit: "°C" }],
        fileNamePattern: "{timestamp}_{value}_温度_{deviceId}_{channel}_N_{params}.csv",
        deviceId: "1903000114",
        channel: tc.ch,
      },
      samplingConfig: {
        frequency: 0.1,
        unit: "Hz",
        samplesPerFile: 1,
        fileDuration: 600,
        triggerMode: "periodic",
      },
      preprocessConfig: {
        smoothing: "moving_average",
        windowSize: 5,
        unit: "°C",
      },
      protocolConfigId: null,
      sensorId: `sensor_1903000114_${tc.ch}`,
      status: "active",
      metadata: {
        meanValue: tc.mean,
        dataRange: { min: tc.mean - 10, max: tc.mean + 25 },
        location: tc.label,
        sensorType: "thermocouple",
        installDate: "2024-06-15",
        lastDataTime: "2025-11-28T12:22:04Z",
      },
    });
  }

  // ─── 3. OPC-UA PLC 数据采集 ───
  const opcuaConnId = "conn_demo_opcua_plc";
  connectors.push({
    connectorId: opcuaConnId,
    name: "PLC控制系统(OPC-UA)",
    description: "西门子S7-1500 PLC通过OPC-UA协议接入，采集桥梁结构监测辅助参数（风速、位移、加速度）",
    protocolType: "opcua",
    connectionParams: {
      endpointUrl: "opc.tcp://10.0.1.101:4840",
      securityMode: "SignAndEncrypt",
      securityPolicy: "Basic256Sha256",
    },
    authConfig: { username: "opcua_client", password: "***", certificatePath: "/certs/client.pem" },
    healthCheckConfig: { interval: 15, timeout: 3 },
    status: "connected",
    sourceRef: "edge_gateway:gw-002",
    tags: ["PLC", "OPC-UA", "辅助参数", "S7-1500"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  const opcuaEndpoints = [
    { name: "风速传感器", path: "ns=2;s=SHM.Wind.Speed", type: "node", unit: "m/s", mean: 5.2 },
    { name: "风向传感器", path: "ns=2;s=SHM.Wind.Direction", type: "node", unit: "°", mean: 225 },
    { name: "GPS位移-X", path: "ns=2;s=SHM.GPS.DisplacementX", type: "node", unit: "mm", mean: 0.12 },
    { name: "GPS位移-Y", path: "ns=2;s=SHM.GPS.DisplacementY", type: "node", unit: "mm", mean: -0.08 },
    { name: "GPS位移-Z", path: "ns=2;s=SHM.GPS.DisplacementZ", type: "node", unit: "mm", mean: 0.35 },
    { name: "加速度-X", path: "ns=2;s=SHM.Accel.X", type: "node", unit: "g", mean: 0.002 },
    { name: "加速度-Y", path: "ns=2;s=SHM.Accel.Y", type: "node", unit: "g", mean: 0.001 },
    { name: "加速度-Z", path: "ns=2;s=SHM.Accel.Z", type: "node", unit: "g", mean: 0.985 },
  ];

  for (const oe of opcuaEndpoints) {
    endpoints.push({
      endpointId: `ep_demo_opcua_${oe.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
      connectorId: opcuaConnId,
      name: oe.name,
      resourcePath: oe.path,
      resourceType: oe.type,
      dataFormat: "numeric",
      schemaInfo: { valueType: "float64", unit: oe.unit },
      samplingConfig: { frequency: 100, unit: "Hz", triggerMode: "subscription" },
      preprocessConfig: null,
      protocolConfigId: null,
      sensorId: null,
      status: "active",
      metadata: { meanValue: oe.mean, location: "桥梁主体" },
    });
  }

  // ─── 4. ClickHouse 历史数据仓库 ───
  const chConnId = "conn_demo_clickhouse";
  connectors.push({
    connectorId: chConnId,
    name: "SHM历史数据仓库(ClickHouse)",
    description: "ClickHouse时序数据库，存储全量历史SHM数据（应力、温度、位移、加速度），支持高速聚合查询",
    protocolType: "clickhouse",
    connectionParams: {
      host: "10.0.2.50",
      port: 8123,
      database: "shm_data",
      protocol: "http",
    },
    authConfig: { username: "shm_reader", password: "***" },
    healthCheckConfig: { interval: 60, timeout: 10 },
    status: "connected",
    sourceRef: "manual",
    tags: ["ClickHouse", "历史数据", "时序", "聚合查询"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  const chEndpoints = [
    { name: "应力历史表", path: "shm_data.stress_realtime", type: "table", desc: "24通道实时应力数据，20Hz采样" },
    { name: "温度历史表", path: "shm_data.temperature", type: "table", desc: "8通道温度数据，0.1Hz采样" },
    { name: "位移历史表", path: "shm_data.displacement", type: "table", desc: "GPS位移数据" },
    { name: "加速度历史表", path: "shm_data.acceleration", type: "table", desc: "3轴加速度数据" },
    { name: "事件记录表", path: "shm_data.events", type: "table", desc: "告警事件和异常记录" },
  ];

  for (const ce of chEndpoints) {
    endpoints.push({
      endpointId: `ep_demo_ch_${ce.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
      connectorId: chConnId,
      name: ce.name,
      resourcePath: ce.path,
      resourceType: ce.type,
      dataFormat: "columnar",
      schemaInfo: { description: ce.desc },
      samplingConfig: null,
      preprocessConfig: null,
      protocolConfigId: null,
      sensorId: null,
      status: "active",
      metadata: { tableEngine: "MergeTree", partitionBy: "toYYYYMM(timestamp)" },
    });
  }

  // ─── 5. Kafka 实时流 ───
  const kafkaConnId = "conn_demo_kafka";
  connectors.push({
    connectorId: kafkaConnId,
    name: "SHM实时数据流(Kafka)",
    description: "Kafka消息队列，承载SHM实时数据流的分发和处理，连接采集层与分析层",
    protocolType: "kafka",
    connectionParams: {
      brokers: "10.0.2.60:9092,10.0.2.61:9092,10.0.2.62:9092",
      groupId: "xilian-shm-consumer",
    },
    authConfig: { mechanism: "PLAIN", username: "shm_producer", password: "***" },
    healthCheckConfig: { interval: 15, timeout: 5 },
    status: "connected",
    sourceRef: "manual",
    tags: ["Kafka", "实时流", "数据分发"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  const kafkaTopics = [
    { name: "应力实时流", path: "shm.stress.realtime", partitions: 24 },
    { name: "温度实时流", path: "shm.temperature.realtime", partitions: 8 },
    { name: "告警事件流", path: "shm.alerts", partitions: 4 },
    { name: "特征提取结果", path: "shm.features.extracted", partitions: 12 },
    { name: "诊断推理结果", path: "shm.diagnosis.results", partitions: 4 },
  ];

  for (const kt of kafkaTopics) {
    endpoints.push({
      endpointId: `ep_demo_kafka_${kt.path.replace(/\./g, '_')}`,
      connectorId: kafkaConnId,
      name: kt.name,
      resourcePath: kt.path,
      resourceType: "topic",
      dataFormat: "json",
      schemaInfo: { partitions: kt.partitions, replicationFactor: 3 },
      samplingConfig: null,
      preprocessConfig: null,
      protocolConfigId: null,
      sensorId: null,
      status: "active",
      metadata: { retentionMs: 604800000 },
    });
  }

  // ─── 6. MinIO 文件存储 ───
  const minioConnId = "conn_demo_minio";
  connectors.push({
    connectorId: minioConnId,
    name: "SHM原始文件存储(MinIO)",
    description: "MinIO对象存储，存储原始CSV采集文件、模型文件和报告",
    protocolType: "minio",
    connectionParams: {
      endpoint: "10.0.2.70:9000",
      region: "cn-east-1",
      useSSL: false,
    },
    authConfig: { accessKey: "shm_admin", secretKey: "***" },
    healthCheckConfig: { interval: 120, timeout: 10 },
    status: "connected",
    sourceRef: "manual",
    tags: ["MinIO", "文件存储", "原始数据"],
    lastHealthCheck: now,
    createdBy: "system",
  });

  const minioBuckets = [
    { name: "应力原始CSV", path: "shm-stress-raw/1904000115/", desc: "24通道应力原始CSV文件" },
    { name: "温度原始CSV", path: "shm-temperature-raw/1903000114/", desc: "温度传感器原始CSV文件" },
    { name: "ML模型文件", path: "shm-models/", desc: "训练好的诊断和预测模型" },
    { name: "分析报告", path: "shm-reports/", desc: "自动生成的健康评估报告" },
  ];

  for (const mb of minioBuckets) {
    endpoints.push({
      endpointId: `ep_demo_minio_${mb.path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
      connectorId: minioConnId,
      name: mb.name,
      resourcePath: mb.path,
      resourceType: "bucket",
      dataFormat: "binary",
      schemaInfo: { description: mb.desc },
      samplingConfig: null,
      preprocessConfig: null,
      protocolConfigId: null,
      sensorId: null,
      status: "active",
      metadata: { versioning: true },
    });
  }

  // ─── 批量插入 ───
  for (const c of connectors) {
    await db.insert(dataConnectors).values(c as any);
  }
  for (const e of endpoints) {
    await db.insert(dataEndpoints).values(e as any);
  }
  for (const b of bindings) {
    await db.insert(dataBindings).values(b as any);
  }

  return {
    seeded: true,
    message: `已创建 ${connectors.length} 个连接器、${endpoints.length} 个端点、${bindings.length} 个绑定`,
    summary: {
      connectors: connectors.map(c => ({ id: c.connectorId, name: c.name, protocol: c.protocolType })),
      endpointCount: endpoints.length,
      bindingCount: bindings.length,
    },
  };
}
