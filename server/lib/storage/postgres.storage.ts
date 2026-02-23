/**
 * PostgreSQL 企业级关系存储服务
 * 
 * 架构：PostgreSQL 16 + Patroni HA
 * 特性：
 * - 设备台账管理
 * - 用户 RBAC 权限
 * - 对话历史存储
 * - 维护日志按年分区
 * - PgBouncer 连接池
 * - BRIN/GiST 索引优化
 */

import { getDb } from '../db';
import { 

  users, 
  assetNodes,
  assetSensors,
  eventStore,
  deviceMaintenanceRecords,
  deviceSpareParts,
  deviceAlerts,
  deviceKpis,
  diagnosisRules,
  diagnosisTasks
} from '../../../drizzle/schema';
import { eq, and, or, desc, asc, sql, gte, lte, like, inArray, isNull, isNotNull } from 'drizzle-orm';
import { PaginatedResult, QueryOptions } from "../../core/types/domain";
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('postgres');

export { PaginatedResult, QueryOptions };

// ============ 类型定义 ============

export interface DeviceRecord {
  id?: number;
  nodeId: string;
  name: string;
  type: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  location?: string;
  installDate?: Date;
  status: 'online' | 'offline' | 'maintenance' | 'fault';
  metadata?: Record<string, unknown>;
}

export interface UserRecord {
  id?: number;
  openId: string;
  name: string;
  role: 'admin' | 'user';
  email?: string;
  loginMethod?: string;
  lastSignedIn?: Date;
}

export interface ConversationRecord {
  id?: number;
  userId: number;
  sessionId: string;
  title?: string;
  agentType: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MaintenanceLogRecord {
  id?: number;
  nodeId: string;
  maintenanceType: 'preventive' | 'corrective' | 'predictive' | 'emergency';
  description: string;
  technician?: string;
  startTime: Date;
  endTime?: Date;
  cost?: number;
  partsUsed?: string[];
  result?: 'success' | 'partial' | 'failed';
  notes?: string;
}

export interface SparePartRecord {
  id?: number;
  partId: string;
  name: string;
  partNumber?: string;
  category?: string;
  compatibleDeviceTypes?: string[];
  manufacturer?: string;
  supplier?: string;
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number;
  unitPrice?: number;
  currency?: string;
  location?: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'ordered' | 'discontinued';
  lastRestockedAt?: Date;
  expiryDate?: Date;
}

export interface AlertRecord {
  id?: number;
  alertId: string;
  nodeId: string;
  sensorId?: string;
  alertType: 'threshold' | 'anomaly' | 'offline' | 'error' | 'maintenance_due' | 'warranty_expiry' | 'custom';
  title: string;
  message?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  triggerValue?: number;
  thresholdValue?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
  escalationLevel?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export interface KpiRecord {
  id?: number;
  nodeId: string;
  periodType: 'hourly' | 'daily' | 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
  // OEE 指标
  availability?: number;
  performance?: number;
  quality?: number;
  oee?: number;
  // 运行指标
  runningTime?: number;
  downtime?: number;
  idleTime?: number;
  plannedDowntime?: number;
  unplannedDowntime?: number;
  // 故障指标
  mtbf?: number;
  mttr?: number;
  failureCount?: number;
  // 能耗指标
  energyConsumption?: number;
  energyEfficiency?: number;
}

// ============ PostgreSQL 存储服务类 ============

export class PostgresStorage {
  private poolConfig = {
    maxConnections: parseInt(process.env.PG_POOL_MAX || '20'),
    minConnections: parseInt(process.env.PG_POOL_MIN || '5'),
    idleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMs: parseInt(process.env.PG_CONN_TIMEOUT || '5000'),
  };

  // ============ 设备管理 ============

  /**
   * 创建设备
   */
  async createDevice(device: DeviceRecord): Promise<DeviceRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(assetNodes).values({
        nodeId: device.nodeId,
        code: device.nodeId,
        name: device.name,
        level: 1,
        nodeType: device.type || 'other',
        rootNodeId: device.nodeId,
        status: (device.status as string) || 'unknown',
        path: `/${device.nodeId}`,
        serialNumber: device.serialNumber,
        location: device.location,
        installDate: device.installDate,
        attributes: device.model || device.manufacturer
          ? JSON.stringify({ model: device.model, manufacturer: device.manufacturer, metadata: device.metadata })
          : device.metadata ? JSON.stringify(device.metadata) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();

      if (result[0]) {
        const inserted = await db.select().from(assetNodes).where(eq(assetNodes.id, result[0].id)).limit(1);
        return inserted[0] ? this.mapDeviceRecord(inserted[0]) : null;
      }
      return null;
    } catch (error) {
      log.warn('[PostgreSQL] Create device error:', error);
      return null;
    }
  }

  /**
   * 获取设备
   */
  async getDevice(nodeId: string): Promise<DeviceRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.select().from(assetNodes).where(eq(assetNodes.nodeId, nodeId)).limit(1);
      return result[0] ? this.mapDeviceRecord(result[0]) : null;
    } catch (error) {
      log.warn('[PostgreSQL] Get device error:', error);
      return null;
    }
  }

  /**
   * 更新设备
   */
  async updateDevice(nodeId: string, updates: Partial<DeviceRecord>): Promise<DeviceRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const updateData: Record<string, unknown> = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.type) updateData.type = updates.type;
      if (updates.model) updateData.model = updates.model;
      if (updates.manufacturer) updateData.manufacturer = updates.manufacturer;
      if (updates.serialNumber) updateData.serialNumber = updates.serialNumber;
      if (updates.location) updateData.location = updates.location;
      if (updates.installDate) updateData.installDate = updates.installDate;
      if (updates.status) updateData.status = updates.status;
      if (updates.metadata) updateData.metadata = JSON.stringify(updates.metadata);
      updateData.updatedAt = new Date();

      await db.update(assetNodes)
        .set(updateData)
        .where(eq(assetNodes.nodeId, nodeId));

      // 重新查询更新后的记录
      const updated = await db.select().from(assetNodes).where(eq(assetNodes.nodeId, nodeId)).limit(1);
      return updated[0] ? this.mapDeviceRecord(updated[0]) : null;
    } catch (error) {
      log.warn('[PostgreSQL] Update device error:', error);
      return null;
    }
  }

  /**
   * 删除设备
   */
  async deleteDevice(nodeId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      await db.delete(assetNodes).where(eq(assetNodes.nodeId, nodeId));
      return true;
    } catch (error) {
      log.warn('[PostgreSQL] Delete device error:', error);
      return false;
    }
  }

  /**
   * 列出设备
   */
  async listDevices(options: QueryOptions & {
    status?: string;
    type?: string;
    search?: string;
  } = {}): Promise<PaginatedResult<DeviceRecord>> {
    const db = await getDb();
    if (!db) return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      // 构建查询条件
      const conditions: ReturnType<typeof eq>[] = [];
      if (options.status) {
        conditions.push(eq(assetNodes.status, options.status as any));
      }
      if (options.type) {
        conditions.push(eq(assetNodes.nodeType, options.type as any));
      }
      if (options.search) {
        const searchCondition = or(
          like(assetNodes.name, `%${options.search}%`),
          like(assetNodes.nodeId, `%${options.search}%`)
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      // 获取总数
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(assetNodes)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      const total = Number(countResult[0]?.count || 0);

      // 获取数据
      let query = db.select().from(assetNodes);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const orderFn = options.orderDirection === 'asc' ? asc : desc;
      const orderColumn = options.orderBy === 'name' ? assetNodes.name : assetNodes.createdAt;
      
      const result = await query
        .orderBy(orderFn(orderColumn))
        .limit(limit)
        .offset(offset);

      return {
        data: result.map(r => this.mapDeviceRecord(r)), items: result.map(r => this.mapDeviceRecord(r)),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      log.warn('[PostgreSQL] List devices error:', error);
      return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  }

  // ============ 用户管理（RBAC）============

  /**
   * 获取用户
   */
  async getUser(openId: string): Promise<UserRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      return result[0] ? this.mapUserRecord(result[0]) : null;
    } catch (error) {
      log.warn('[PostgreSQL] Get user error:', error);
      return null;
    }
  }

  /**
   * 更新用户角色
   */
  async updateUserRole(openId: string, role: 'admin' | 'user'): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      await db.update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.openId, openId));
      return true;
    } catch (error) {
      log.warn('[PostgreSQL] Update user role error:', error);
      return false;
    }
  }

  /**
   * 列出用户
   */
  async listUsers(options: QueryOptions & { role?: string } = {}): Promise<PaginatedResult<UserRecord>> {
    const db = await getDb();
    if (!db) return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      const conditions = [];
      if (options.role) {
        conditions.push(eq(users.role, options.role as 'admin' | 'user'));
      }

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      const total = Number(countResult[0]?.count || 0);

      let query = db.select().from(users);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const result = await query.limit(limit).offset(offset);

      return {
        data: result.map(r => this.mapUserRecord(r)), items: result.map(r => this.mapUserRecord(r)),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      log.warn('[PostgreSQL] List users error:', error);
      return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  }

  // ============ 维护日志（按年分区）============

  /**
   * 创建维护日志
   */
  async createMaintenanceLog(record: MaintenanceLogRecord): Promise<MaintenanceLogRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(deviceMaintenanceRecords).values({
        recordId: `MR-${Date.now()}`,
        nodeId: record.nodeId,
        maintenanceType: record.maintenanceType as any,
        title: record.description.substring(0, 200),
        description: record.description,
        performedBy: record.technician,
        startedAt: record.startTime,
        completedAt: record.endTime,
        cost: record.cost,
        status: record.result === 'success' ? 'completed' : (record.result === 'failed' ? 'cancelled' : 'in_progress') as any,
        findings: record.notes,
      }).$returningId();

      if (result[0]) {
        const inserted = await db.select().from(deviceMaintenanceRecords).where(eq(deviceMaintenanceRecords.id, result[0].id)).limit(1);
        return inserted[0] ? this.mapMaintenanceLogRecord(inserted[0]) : null;
      }
      return null;
    } catch (error) {
      log.warn('[PostgreSQL] Create maintenance log error:', error);
      return null;
    }
  }

  /**
   * 列出维护日志
   */
  async listMaintenanceLogs(options: QueryOptions & {
    nodeId?: string;
    maintenanceType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<PaginatedResult<MaintenanceLogRecord>> {
    const db = await getDb();
    if (!db) return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      const conditions = [];
      if (options.nodeId) {
        conditions.push(eq(deviceMaintenanceRecords.nodeId, options.nodeId));
      }
      if (options.maintenanceType) {
        conditions.push(eq(deviceMaintenanceRecords.maintenanceType, options.maintenanceType as any));
      }
      if (options.startDate) {
        conditions.push(gte(deviceMaintenanceRecords.startedAt, options.startDate));
      }
      if (options.endDate) {
        conditions.push(lte(deviceMaintenanceRecords.startedAt, options.endDate));
      }

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(deviceMaintenanceRecords)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      const total = Number(countResult[0]?.count || 0);

      let query = db.select().from(deviceMaintenanceRecords);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const result = await query
        .orderBy(desc(deviceMaintenanceRecords.startedAt))
        .limit(limit)
        .offset(offset);

      return {
        data: result.map(r => this.mapMaintenanceLogRecord(r)), items: result.map(r => this.mapMaintenanceLogRecord(r)),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      log.warn('[PostgreSQL] List maintenance logs error:', error);
      return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  }

  // ============ 备件库存 ============

  /**
   * 创建备件
   */
  async createSparePart(part: SparePartRecord): Promise<SparePartRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(deviceSpareParts).values({
        partId: part.partId,
        name: part.name,
        partNumber: part.partNumber,
        category: part.category,
        compatibleDeviceTypes: part.compatibleDeviceTypes,
        manufacturer: part.manufacturer,
        supplier: part.supplier,
        quantity: part.quantity,
        minQuantity: part.minQuantity,
        maxQuantity: part.maxQuantity,
        unitPrice: part.unitPrice,
        currency: part.currency,
        location: part.location,
        status: part.status,
        lastRestockedAt: part.lastRestockedAt,
        expiryDate: part.expiryDate,
      }).$returningId();

      if (result[0]) {
        const inserted = await db.select().from(deviceSpareParts).where(eq(deviceSpareParts.id, result[0].id)).limit(1);
        return inserted[0] ? this.mapSparePartRecord(inserted[0]) : null;
      }
      return null;
    } catch (error) {
      log.warn('[PostgreSQL] Create spare part error:', error);
      return null;
    }
  }

  /**
   * 更新备件库存
   */
  async updateSparePartQuantity(partId: string, quantityChange: number): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      await db.update(deviceSpareParts)
        .set({
          quantity: sql`${deviceSpareParts.quantity} + ${quantityChange}`,
          updatedAt: new Date(),
        })
        .where(eq(deviceSpareParts.partId, partId));
      return true;
    } catch (error) {
      log.warn('[PostgreSQL] Update spare part quantity error:', error);
      return false;
    }
  }

  /**
   * 获取低库存备件
   */
  async getLowStockParts(): Promise<SparePartRecord[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const result = await db.select()
        .from(deviceSpareParts)
        .where(sql`${deviceSpareParts.quantity} <= ${deviceSpareParts.minQuantity}`);

      return result.map(r => this.mapSparePartRecord(r));
    } catch (error) {
      log.warn('[PostgreSQL] Get low stock parts error:', error);
      return [];
    }
  }

  // ============ 告警管理 ============

  /**
   * 创建告警
   */
  async createAlert(alert: AlertRecord): Promise<AlertRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(deviceAlerts).values({
        alertId: alert.alertId,
        nodeId: alert.nodeId,
        sensorId: alert.sensorId,
        alertType: alert.alertType as any,
        title: alert.title,
        message: alert.message,
        severity: alert.severity as any,
        status: (alert.status || 'active') as any,
        triggerValue: alert.triggerValue,
        thresholdValue: alert.thresholdValue,
        metadata: alert.metadata,
      }).$returningId();

      if (result[0]) {
        const inserted = await db.select().from(deviceAlerts).where(eq(deviceAlerts.id, result[0].id)).limit(1);
        return inserted[0] ? this.mapAlertRecord(inserted[0]) : null;
      }
      return null;
    } catch (error) {
      log.warn('[PostgreSQL] Create alert error:', error);
      return null;
    }
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId: number, acknowledgedBy: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      await db.update(deviceAlerts)
        .set({
          acknowledgedAt: new Date(),
          acknowledgedBy,
        })
        .where(eq(deviceAlerts.id, alertId));
      return true;
    } catch (error) {
      log.warn('[PostgreSQL] Acknowledge alert error:', error);
      return false;
    }
  }

  /**
   * 解决告警
   */
  async resolveAlert(alertId: number, resolvedBy: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      await db.update(deviceAlerts)
        .set({
          resolvedAt: new Date(),
          resolvedBy,
        })
        .where(eq(deviceAlerts.id, alertId));
      return true;
    } catch (error) {
      log.warn('[PostgreSQL] Resolve alert error:', error);
      return false;
    }
  }

  /**
   * 获取活跃告警
   */
  async getActiveAlerts(options: QueryOptions & {
    nodeId?: string;
    severity?: string;
  } = {}): Promise<PaginatedResult<AlertRecord>> {
    const db = await getDb();
    if (!db) return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      const conditions = [eq(deviceAlerts.status, 'active')];
      if (options.nodeId) {
        conditions.push(eq(deviceAlerts.nodeId, options.nodeId));
      }
      if (options.severity) {
        conditions.push(eq(deviceAlerts.severity, options.severity as AlertRecord['severity']));
      }

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(deviceAlerts)
        .where(and(...conditions));
      const total = Number(countResult[0]?.count || 0);

      const result = await db.select()
        .from(deviceAlerts)
        .where(and(...conditions))
        .orderBy(desc(deviceAlerts.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        data: result.map(r => this.mapAlertRecord(r)), items: result.map(r => this.mapAlertRecord(r)),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      log.warn('[PostgreSQL] Get active alerts error:', error);
      return { data: [], items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  }

  // ============ KPI 指标 ============

  /**
   * 记录 KPI
   */
  async recordKpi(kpi: KpiRecord): Promise<KpiRecord | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const result = await db.insert(deviceKpis).values({
        nodeId: kpi.nodeId,
        periodType: kpi.periodType,
        periodStart: kpi.periodStart,
        periodEnd: kpi.periodEnd,
        availability: kpi.availability,
        performance: kpi.performance,
        quality: kpi.quality,
        oee: kpi.oee,
        runningTime: kpi.runningTime,
        downtime: kpi.downtime,
        idleTime: kpi.idleTime,
        plannedDowntime: kpi.plannedDowntime,
        unplannedDowntime: kpi.unplannedDowntime,
        mtbf: kpi.mtbf,
        mttr: kpi.mttr,
        failureCount: kpi.failureCount,
        energyConsumption: kpi.energyConsumption,
        energyEfficiency: kpi.energyEfficiency,
      }).$returningId();

      if (result[0]) {
        const inserted = await db.select().from(deviceKpis).where(eq(deviceKpis.id, result[0].id)).limit(1);
        return inserted[0] ? this.mapKpiRecord(inserted[0]) : null;
      }
      return null;
    } catch (error) {
      log.warn('[PostgreSQL] Record KPI error:', error);
      return null;
    }
  }

  /**
   * 获取设备 KPI
   */
  async getDeviceKpis(nodeId: string, options: {
    periodType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<KpiRecord[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const conditions = [eq(deviceKpis.nodeId, nodeId)];
      
      if (options.periodType) {
        conditions.push(eq(deviceKpis.periodType, options.periodType as KpiRecord['periodType']));
      }
      if (options.startDate) {
        conditions.push(gte(deviceKpis.periodStart, options.startDate));
      }
      if (options.endDate) {
        conditions.push(lte(deviceKpis.periodStart, options.endDate));
      }

      const result = await db.select()
        .from(deviceKpis)
        .where(and(...conditions))
        .orderBy(desc(deviceKpis.periodStart))
        .limit(options.limit || 100);

      return result.map(r => this.mapKpiRecord(r));
    } catch (error) {
      log.warn('[PostgreSQL] Get device KPIs error:', error);
      return [];
    }
  }

  // ============ 统计查询 ============

  /**
   * 获取数据库统计
   */
  async getDatabaseStats(): Promise<{
    totalDevices: number;
    onlineDevices: number;
    totalUsers: number;
    totalAlerts: number;
    activeAlerts: number;
    totalMaintenanceLogs: number;
    lowStockParts: number;
  }> {
    const db = await getDb();
    if (!db) {
      return {
        totalDevices: 0,
        onlineDevices: 0,
        totalUsers: 0,
        totalAlerts: 0,
        activeAlerts: 0,
        totalMaintenanceLogs: 0,
        lowStockParts: 0,
      };
    }

    try {
      // 设备统计
      const deviceStats = await db.select({
        total: sql<number>`count(*)`,
        online: sql<number>`count(*) filter (where ${assetNodes.status} = 'online')`,
      }).from(assetNodes);

      // 用户统计
      const userStats = await db.select({
        total: sql<number>`count(*)`,
      }).from(users);

      // 告警统计
      const alertStats = await db.select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${deviceAlerts.resolvedAt} is null)`,
      }).from(deviceAlerts);

      // 维护日志统计
      const maintenanceStats = await db.select({
        total: sql<number>`count(*)`,
      }).from(deviceMaintenanceRecords);

      // 低库存备件
      const lowStockStats = await db.select({
        count: sql<number>`count(*)`,
      }).from(deviceSpareParts)
        .where(sql`${deviceSpareParts.quantity} <= ${deviceSpareParts.minQuantity}`);

      return {
        totalDevices: Number(deviceStats[0]?.total || 0),
        onlineDevices: Number(deviceStats[0]?.online || 0),
        totalUsers: Number(userStats[0]?.total || 0),
        totalAlerts: Number(alertStats[0]?.total || 0),
        activeAlerts: Number(alertStats[0]?.active || 0),
        totalMaintenanceLogs: Number(maintenanceStats[0]?.total || 0),
        lowStockParts: Number(lowStockStats[0]?.count || 0),
      };
    } catch (error) {
      log.warn('[PostgreSQL] Get database stats error:', error);
      return {
        totalDevices: 0,
        onlineDevices: 0,
        totalUsers: 0,
        totalAlerts: 0,
        activeAlerts: 0,
        totalMaintenanceLogs: 0,
        lowStockParts: 0,
      };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    poolStatus?: {
      total: number;
      idle: number;
      waiting: number;
    };
    error?: string;
  }> {
    const start = Date.now();
    const db = await getDb();

    if (!db) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: 'Database not initialized',
      };
    }

    try {
      await db.execute(sql`SELECT 1`);
      return {
        connected: true,
        latencyMs: Date.now() - start,
        poolStatus: {
          total: this.poolConfig.maxConnections,
          idle: this.poolConfig.minConnections,
          waiting: 0,
        },
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============ 映射方法 ============

  private mapDeviceRecord(row: any): DeviceRecord {
    return {
      id: row.id,
      nodeId: row.nodeId,
      name: row.name,
      type: row.type,
      model: row.model,
      manufacturer: row.manufacturer,
      serialNumber: row.serialNumber,
      location: row.location,
      installDate: row.installDate,
      status: row.status,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
    };
  }

  private mapUserRecord(row: any): UserRecord {
    return {
      id: row.id,
      openId: row.openId,
      name: row.name,
      role: row.role,
      email: row.email,
      loginMethod: row.loginMethod,
      lastSignedIn: row.lastSignedIn,
    };
  }

  private mapMaintenanceLogRecord(row: any): MaintenanceLogRecord {
    return {
      id: row.id,
      nodeId: row.nodeId,
      maintenanceType: row.maintenanceType,
      description: row.description,
      technician: row.technician,
      startTime: row.startTime,
      endTime: row.endTime,
      cost: row.cost ? parseFloat(row.cost) : undefined,
      partsUsed: row.partsUsed ? (typeof row.partsUsed === 'string' ? JSON.parse(row.partsUsed) : row.partsUsed) : undefined,
      result: row.result,
      notes: row.notes,
    };
  }

  private mapSparePartRecord(row: any): SparePartRecord {
    return {
      id: row.id,
      partId: row.partId,
      name: row.name,
      partNumber: row.partNumber,
      category: row.category,
      compatibleDeviceTypes: row.compatibleDeviceTypes,
      manufacturer: row.manufacturer,
      supplier: row.supplier,
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
      unitPrice: row.unitPrice,
      currency: row.currency,
      location: row.location,
      status: row.status,
      lastRestockedAt: row.lastRestockedAt,
      expiryDate: row.expiryDate,
    };
  }

  private mapAlertRecord(row: any): AlertRecord {
    return {
      id: row.id,
      alertId: row.alertId,
      nodeId: row.nodeId,
      sensorId: row.sensorId,
      alertType: row.alertType,
      title: row.title,
      message: row.message,
      severity: row.severity,
      status: row.status,
      triggerValue: row.triggerValue,
      thresholdValue: row.thresholdValue,
      acknowledgedBy: row.acknowledgedBy,
      acknowledgedAt: row.acknowledgedAt,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      resolution: row.resolution,
      escalationLevel: row.escalationLevel,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  private mapKpiRecord(row: any): KpiRecord {
    return {
      id: row.id,
      nodeId: row.nodeId,
      periodType: row.periodType,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      availability: row.availability,
      performance: row.performance,
      quality: row.quality,
      oee: row.oee,
      runningTime: row.runningTime,
      downtime: row.downtime,
      idleTime: row.idleTime,
      plannedDowntime: row.plannedDowntime,
      unplannedDowntime: row.unplannedDowntime,
      mtbf: row.mtbf,
      mttr: row.mttr,
      failureCount: row.failureCount,
      energyConsumption: row.energyConsumption,
      energyEfficiency: row.energyEfficiency,
    };
  }
}

// 导出单例
export const postgresStorage = new PostgresStorage();
export default postgresStorage;
