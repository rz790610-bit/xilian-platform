/**
 * 资产管理服务层
 * 提供资产节点（设备树）、测点、传感器的完整 CRUD 操作
 */
import { getDb } from '../../lib/db';
import { 
  assetNodes, assetMeasurementPoints, assetSensors,
  baseNodeTemplates, baseMpTemplates
} from '../../../drizzle/schema';
import { eq, and, like, desc, asc, sql, count, isNull, inArray } from 'drizzle-orm';

// ============================================
// 资产节点（设备树）
// ============================================

export const assetNodeService = {
  /** 获取设备树（支持层级过滤） */
  async getTree(filters?: { level?: number; rootNodeId?: string; status?: string; search?: string }) {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [eq(assetNodes.isDeleted, 0)];
    if (filters?.level) conditions.push(eq(assetNodes.level, filters.level));
    if (filters?.rootNodeId) conditions.push(eq(assetNodes.rootNodeId, filters.rootNodeId));
    if (filters?.status) conditions.push(eq(assetNodes.status, filters.status));
    if (filters?.search) conditions.push(like(assetNodes.name, `%${filters.search}%`));

    const rows = await db.select().from(assetNodes)
      .where(and(...conditions))
      .orderBy(asc(assetNodes.level), asc(assetNodes.sortOrder));
    return rows;
  },

  /** 获取单个节点详情（含子节点、测点、传感器数量） */
  async getById(nodeId: string) {
    const db = await getDb();
    if (!db) return null;

    const [node] = await db.select().from(assetNodes)
      .where(and(eq(assetNodes.nodeId, nodeId), eq(assetNodes.isDeleted, 0)));
    if (!node) return null;

    // 子节点数量
    const [childCount] = await db.select({ count: count() }).from(assetNodes)
      .where(and(eq(assetNodes.parentNodeId, nodeId), eq(assetNodes.isDeleted, 0)));

    // 测点数量
    const [mpCount] = await db.select({ count: count() }).from(assetMeasurementPoints)
      .where(and(eq(assetMeasurementPoints.nodeId, nodeId), eq(assetMeasurementPoints.isDeleted, 0)));

    // 传感器数量（通过测点关联）
    const mps = await db.select({ mpId: assetMeasurementPoints.mpId }).from(assetMeasurementPoints)
      .where(and(eq(assetMeasurementPoints.nodeId, nodeId), eq(assetMeasurementPoints.isDeleted, 0)));
    
    let sensorCount = 0;
    if (mps.length > 0) {
      const mpIds = mps.map(m => m.mpId);
      const [sc] = await db.select({ count: count() }).from(assetSensors)
        .where(and(inArray(assetSensors.mpId, mpIds), eq(assetSensors.isDeleted, 0)));
      sensorCount = sc.count;
    }

    return {
      ...node,
      childCount: childCount.count,
      measurementPointCount: mpCount.count,
      sensorCount,
    };
  },

  /** 获取子节点列表 */
  async getChildren(parentNodeId: string) {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(assetNodes)
      .where(and(eq(assetNodes.parentNodeId, parentNodeId), eq(assetNodes.isDeleted, 0)))
      .orderBy(asc(assetNodes.sortOrder));
  },

  /** 创建资产节点 */
  async create(input: {
    nodeId: string; code: string; name: string; level: number; nodeType: string;
    parentNodeId?: string; rootNodeId: string; templateCode?: string;
    path: string; serialNumber?: string; location?: string; department?: string;
    installDate?: string; attributes?: any;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();
    await db.insert(assetNodes).values({
      nodeId: input.nodeId,
      code: input.code,
      name: input.name,
      level: input.level,
      nodeType: input.nodeType,
      parentNodeId: input.parentNodeId || null,
      rootNodeId: input.rootNodeId,
      templateCode: input.templateCode || null,
      status: 'unknown',
      path: input.path,
      depth: input.level,
      serialNumber: input.serialNumber || null,
      location: input.location || null,
      department: input.department || null,
      installDate: input.installDate || null,
      attributes: input.attributes || null,
      isActive: 1,
      version: 1,
      createdBy: 'system',
      createdAt: now,
      updatedBy: 'system',
      updatedAt: now,
      isDeleted: 0,
    });

    return this.getById(input.nodeId);
  },

  /** 更新资产节点 */
  async update(nodeId: string, input: {
    name?: string; status?: string; location?: string; department?: string;
    serialNumber?: string; attributes?: any;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.location !== undefined) updateData.location = input.location;
    if (input.department !== undefined) updateData.department = input.department;
    if (input.serialNumber !== undefined) updateData.serialNumber = input.serialNumber;
    if (input.attributes !== undefined) updateData.attributes = input.attributes;

    await db.update(assetNodes).set(updateData)
      .where(and(eq(assetNodes.nodeId, nodeId), eq(assetNodes.isDeleted, 0)));

    return this.getById(nodeId);
  },

  /** 软删除资产节点 */
  async delete(nodeId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();
    await db.update(assetNodes).set({
      isDeleted: 1, deletedAt: now, deletedBy: 'system',
    }).where(eq(assetNodes.nodeId, nodeId));

    return { success: true };
  },

  /** 获取设备统计 */
  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, byStatus: {}, byType: {}, byLevel: {} };

    const total = await db.select({ count: count() }).from(assetNodes)
      .where(eq(assetNodes.isDeleted, 0));

    const byStatus = await db.select({
      status: assetNodes.status,
      count: count(),
    }).from(assetNodes)
      .where(eq(assetNodes.isDeleted, 0))
      .groupBy(assetNodes.status);

    const byType = await db.select({
      nodeType: assetNodes.nodeType,
      count: count(),
    }).from(assetNodes)
      .where(eq(assetNodes.isDeleted, 0))
      .groupBy(assetNodes.nodeType);

    const byLevel = await db.select({
      level: assetNodes.level,
      count: count(),
    }).from(assetNodes)
      .where(eq(assetNodes.isDeleted, 0))
      .groupBy(assetNodes.level);

    return {
      total: total[0].count,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      byType: Object.fromEntries(byType.map(r => [r.nodeType, r.count])),
      byLevel: Object.fromEntries(byLevel.map(r => [String(r.level), r.count])),
    };
  },
};

// ============================================
// 测点实例
// ============================================

export const measurementPointService = {
  /** 获取测点列表（按节点或设备） */
  async list(filters?: { nodeId?: string; deviceCode?: string; measurementType?: string }) {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [eq(assetMeasurementPoints.isDeleted, 0)];
    if (filters?.nodeId) conditions.push(eq(assetMeasurementPoints.nodeId, filters.nodeId));
    if (filters?.deviceCode) conditions.push(eq(assetMeasurementPoints.deviceCode, filters.deviceCode));
    if (filters?.measurementType) conditions.push(eq(assetMeasurementPoints.measurementType, filters.measurementType));

    return db.select().from(assetMeasurementPoints)
      .where(and(...conditions))
      .orderBy(asc(assetMeasurementPoints.id));
  },

  /** 获取单个测点 */
  async getById(mpId: string) {
    const db = await getDb();
    if (!db) return null;

    const [mp] = await db.select().from(assetMeasurementPoints)
      .where(and(eq(assetMeasurementPoints.mpId, mpId), eq(assetMeasurementPoints.isDeleted, 0)));
    return mp || null;
  },

  /** 创建测点 */
  async create(input: {
    mpId: string; nodeId: string; deviceCode: string; templateCode?: string;
    name: string; position?: string; measurementType: string;
    warningThreshold?: number; criticalThreshold?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();
    await db.insert(assetMeasurementPoints).values({
      mpId: input.mpId,
      nodeId: input.nodeId,
      deviceCode: input.deviceCode,
      templateCode: input.templateCode || null,
      name: input.name,
      position: input.position || null,
      measurementType: input.measurementType,
      warningThreshold: input.warningThreshold ?? null,
      criticalThreshold: input.criticalThreshold ?? null,
      isActive: 1,
      version: 1,
      createdBy: 'system',
      createdAt: now,
      updatedBy: 'system',
      updatedAt: now,
      isDeleted: 0,
    });

    return this.getById(input.mpId);
  },

  /** 更新测点 */
  async update(mpId: string, input: {
    name?: string; position?: string; warningThreshold?: number; criticalThreshold?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.position !== undefined) updateData.position = input.position;
    if (input.warningThreshold !== undefined) updateData.warningThreshold = input.warningThreshold;
    if (input.criticalThreshold !== undefined) updateData.criticalThreshold = input.criticalThreshold;

    await db.update(assetMeasurementPoints).set(updateData)
      .where(and(eq(assetMeasurementPoints.mpId, mpId), eq(assetMeasurementPoints.isDeleted, 0)));

    return this.getById(mpId);
  },

  /** 软删除测点 */
  async delete(mpId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.update(assetMeasurementPoints).set({
      isDeleted: 1, updatedAt: new Date(), updatedBy: 'system',
    }).where(eq(assetMeasurementPoints.mpId, mpId));

    return { success: true };
  },
};

// ============================================
// 传感器实例
// ============================================

export const assetSensorService = {
  /** 获取传感器列表 */
  async list(filters?: { deviceCode?: string; mpId?: string; status?: string }) {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [eq(assetSensors.isDeleted, 0)];
    if (filters?.deviceCode) conditions.push(eq(assetSensors.deviceCode, filters.deviceCode));
    if (filters?.mpId) conditions.push(eq(assetSensors.mpId, filters.mpId));
    if (filters?.status) conditions.push(eq(assetSensors.status, filters.status));

    return db.select().from(assetSensors)
      .where(and(...conditions))
      .orderBy(asc(assetSensors.id));
  },

  /** 获取单个传感器 */
  async getById(deviceCode: string, sensorId: string) {
    const db = await getDb();
    if (!db) return null;

    const [sensor] = await db.select().from(assetSensors)
      .where(and(
        eq(assetSensors.deviceCode, deviceCode),
        eq(assetSensors.sensorId, sensorId),
        eq(assetSensors.isDeleted, 0)
      ));
    return sensor || null;
  },

  /** 创建传感器 */
  async create(input: {
    deviceCode: string; sensorId: string; mpId: string; name?: string;
    channel?: string; sampleRate?: number; physicalQuantity?: string; unit?: string;
    warningThreshold?: number; criticalThreshold?: number;
    manufacturer?: string; model?: string; serialNumber?: string;
    installDate?: string; calibrationDate?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();
    await db.insert(assetSensors).values({
      deviceCode: input.deviceCode,
      sensorId: input.sensorId,
      mpId: input.mpId,
      name: input.name || null,
      channel: input.channel || null,
      sampleRate: input.sampleRate ?? null,
      physicalQuantity: input.physicalQuantity || null,
      unit: input.unit || null,
      warningThreshold: input.warningThreshold ?? null,
      criticalThreshold: input.criticalThreshold ?? null,
      status: 'active',
      manufacturer: input.manufacturer || null,
      model: input.model || null,
      serialNumber: input.serialNumber || null,
      installDate: input.installDate || null,
      calibrationDate: input.calibrationDate || null,
      isActive: 1,
      version: 1,
      createdBy: 'system',
      createdAt: now,
      updatedBy: 'system',
      updatedAt: now,
      isDeleted: 0,
    });

    return this.getById(input.deviceCode, input.sensorId);
  },

  /** 更新传感器 */
  async update(deviceCode: string, sensorId: string, input: {
    name?: string; status?: string; sampleRate?: number;
    warningThreshold?: number; criticalThreshold?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.sampleRate !== undefined) updateData.sampleRate = input.sampleRate;
    if (input.warningThreshold !== undefined) updateData.warningThreshold = input.warningThreshold;
    if (input.criticalThreshold !== undefined) updateData.criticalThreshold = input.criticalThreshold;

    await db.update(assetSensors).set(updateData)
      .where(and(
        eq(assetSensors.deviceCode, deviceCode),
        eq(assetSensors.sensorId, sensorId),
        eq(assetSensors.isDeleted, 0)
      ));

    return this.getById(deviceCode, sensorId);
  },

  /** 软删除传感器 */
  async delete(deviceCode: string, sensorId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.update(assetSensors).set({
      isDeleted: 1, updatedAt: new Date(), updatedBy: 'system',
    }).where(and(
      eq(assetSensors.deviceCode, deviceCode),
      eq(assetSensors.sensorId, sensorId)
    ));

    return { success: true };
  },
};
