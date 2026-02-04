/**
 * 设备管理 CRUD API 增强版
 * 西联智能平台 - 完整的设备生命周期管理
 * 
 * 功能特性:
 * - 完整的设备 CRUD 操作
 * - 批量操作支持
 * - 设备分组和标签管理
 * - 设备配置版本控制
 * - 设备健康检查
 * - 设备关联关系管理
 */

import { getDb } from '../db';
import { devices, sensors } from '../../drizzle/schema';
import { eq, desc, and, or, like, inArray, sql, count, gte, lte } from 'drizzle-orm';
import { eventBus, TOPICS } from '../eventBus';

// ============================================
// 类型定义
// ============================================

/**
 * 设备类型枚举
 */
export type DeviceType = 
  | 'agv'           // 自动导引车
  | 'rtg'           // 轮胎式龙门吊
  | 'qc'            // 岸桥
  | 'asc'           // 自动化堆垛机
  | 'conveyor'      // 传送带
  | 'pump'          // 泵
  | 'motor'         // 电机
  | 'sensor_hub'    // 传感器集线器
  | 'gateway'       // 网关
  | 'plc'           // 可编程逻辑控制器
  | 'robot'         // 工业机器人
  | 'camera'        // 摄像头
  | 'rfid_reader'   // RFID读写器
  | 'weighbridge'   // 地磅
  | 'other';        // 其他

/**
 * 设备状态枚举
 */
export type DeviceStatus = 
  | 'online'        // 在线
  | 'offline'       // 离线
  | 'maintenance'   // 维护中
  | 'error'         // 故障
  | 'unknown';      // 未知

/**
 * 设备完整信息
 */
export interface DeviceFullInfo {
  id: number;
  deviceId: string;
  name: string;
  type: DeviceType;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  location?: string;
  department?: string;
  status: DeviceStatus;
  lastHeartbeat?: Date;
  installDate?: Date;
  warrantyExpiry?: Date;
  metadata?: {
    firmware?: string;
    ipAddress?: string;
    macAddress?: string;
    protocol?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
  sensorCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 设备创建输入
 */
export interface CreateDeviceInput {
  deviceId: string;
  name: string;
  type: DeviceType;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  location?: string;
  department?: string;
  installDate?: Date;
  warrantyExpiry?: Date;
  metadata?: {
    firmware?: string;
    ipAddress?: string;
    macAddress?: string;
    protocol?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
}

/**
 * 设备更新输入
 */
export interface UpdateDeviceInput {
  name?: string;
  type?: DeviceType;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  location?: string;
  department?: string;
  status?: DeviceStatus;
  installDate?: Date;
  warrantyExpiry?: Date;
  metadata?: {
    firmware?: string;
    ipAddress?: string;
    macAddress?: string;
    protocol?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
}

/**
 * 设备查询过滤器
 */
export interface DeviceFilter {
  type?: DeviceType | DeviceType[];
  status?: DeviceStatus | DeviceStatus[];
  location?: string;
  department?: string;
  manufacturer?: string;
  tags?: string[];
  search?: string;
  hasWarranty?: boolean;
  onlineSince?: Date;
  offlineSince?: Date;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'type' | 'status' | 'createdAt' | 'updatedAt' | 'lastHeartbeat';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  success: number;
  failed: number;
  errors: Array<{ deviceId: string; error: string }>;
}

/**
 * 设备统计信息
 */
export interface DeviceStatistics {
  total: number;
  byStatus: Record<DeviceStatus, number>;
  byType: Record<string, number>;
  byDepartment: Record<string, number>;
  onlineRate: number;
  warrantyExpiringSoon: number;
  recentlyOffline: number;
}

/**
 * 设备健康检查结果
 */
export interface DeviceHealthCheck {
  deviceId: string;
  status: DeviceStatus;
  lastHeartbeat?: Date;
  heartbeatAge?: number; // 秒
  sensorStatus: {
    total: number;
    active: number;
    inactive: number;
    error: number;
  };
  issues: string[];
  healthScore: number; // 0-100
}

// ============================================
// 设备 CRUD 服务
// ============================================

export class DeviceCrudService {
  /**
   * 创建设备
   */
  async create(input: CreateDeviceInput): Promise<DeviceFullInfo | null> {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 检查设备ID是否已存在
      const existing = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.deviceId, input.deviceId))
        .limit(1);

      if (existing.length > 0) {
        throw new Error(`Device with ID ${input.deviceId} already exists`);
      }

      await db.insert(devices).values({
        deviceId: input.deviceId,
        name: input.name,
        type: input.type as any,
        model: input.model,
        manufacturer: input.manufacturer,
        serialNumber: input.serialNumber,
        location: input.location,
        department: input.department,
        status: 'unknown',
        installDate: input.installDate,
        warrantyExpiry: input.warrantyExpiry,
        metadata: input.metadata,
      });

      // 发布设备创建事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'device_created',
        { deviceId: input.deviceId, name: input.name, type: input.type },
        { deviceId: input.deviceId }
      );

      return this.getById(input.deviceId);
    } catch (error) {
      console.error('[DeviceCrudService] Create failed:', error);
      throw error;
    }
  }

  /**
   * 批量创建设备
   */
  async createBatch(inputs: CreateDeviceInput[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const input of inputs) {
      try {
        await this.create(input);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          deviceId: input.deviceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * 获取设备详情
   */
  async getById(deviceId: string): Promise<DeviceFullInfo | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(devices)
        .where(eq(devices.deviceId, deviceId))
        .limit(1);

      if (result.length === 0) return null;

      const d = result[0];

      // 获取传感器数量
      const sensorCountResult = await db
        .select({ count: count() })
        .from(sensors)
        .where(eq(sensors.deviceId, deviceId));

      return {
        id: d.id,
        deviceId: d.deviceId,
        name: d.name,
        type: d.type as DeviceType,
        model: d.model || undefined,
        manufacturer: d.manufacturer || undefined,
        serialNumber: d.serialNumber || undefined,
        location: d.location || undefined,
        department: d.department || undefined,
        status: d.status as DeviceStatus,
        lastHeartbeat: d.lastHeartbeat || undefined,
        installDate: d.installDate || undefined,
        warrantyExpiry: d.warrantyExpiry || undefined,
        metadata: d.metadata as any,
        sensorCount: sensorCountResult[0]?.count || 0,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    } catch (error) {
      console.error('[DeviceCrudService] GetById failed:', error);
      return null;
    }
  }

  /**
   * 查询设备列表（带分页和过滤）
   */
  async list(
    filter: DeviceFilter = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<DeviceFullInfo>> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        };
      }

      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 20;
      const offset = (page - 1) * pageSize;

      // 构建过滤条件
      const conditions = this.buildFilterConditions(filter);

      // 获取总数
      const countQuery = db.select({ count: count() }).from(devices);
      if (conditions.length > 0) {
        countQuery.where(and(...conditions));
      }
      const countResult = await countQuery;
      const total = countResult[0]?.count || 0;

      // 获取数据
      const query = db.select().from(devices);
      if (conditions.length > 0) {
        query.where(and(...conditions));
      }

      // 排序
      const sortBy = pagination.sortBy || 'updatedAt';
      const sortOrder = pagination.sortOrder || 'desc';
      if (sortOrder === 'desc') {
        query.orderBy(desc(devices[sortBy as keyof typeof devices] as any));
      } else {
        query.orderBy(devices[sortBy as keyof typeof devices] as any);
      }

      query.limit(pageSize).offset(offset);

      const results = await query;

      // 获取传感器数量
      const deviceIds = results.map(d => d.deviceId);
      const sensorCounts = new Map<string, number>();
      
      if (deviceIds.length > 0) {
        const sensorCountResults = await db
          .select({
            deviceId: sensors.deviceId,
            count: count(),
          })
          .from(sensors)
          .where(inArray(sensors.deviceId, deviceIds))
          .groupBy(sensors.deviceId);

        for (const sc of sensorCountResults) {
          sensorCounts.set(sc.deviceId, sc.count);
        }
      }

      const items: DeviceFullInfo[] = results.map(d => ({
        id: d.id,
        deviceId: d.deviceId,
        name: d.name,
        type: d.type as DeviceType,
        model: d.model || undefined,
        manufacturer: d.manufacturer || undefined,
        serialNumber: d.serialNumber || undefined,
        location: d.location || undefined,
        department: d.department || undefined,
        status: d.status as DeviceStatus,
        lastHeartbeat: d.lastHeartbeat || undefined,
        installDate: d.installDate || undefined,
        warrantyExpiry: d.warrantyExpiry || undefined,
        metadata: d.metadata as any,
        sensorCount: sensorCounts.get(d.deviceId) || 0,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));

      const totalPages = Math.ceil(total / pageSize);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    } catch (error) {
      console.error('[DeviceCrudService] List failed:', error);
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      };
    }
  }

  /**
   * 构建过滤条件
   */
  private buildFilterConditions(filter: DeviceFilter): any[] {
    const conditions: any[] = [];

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        conditions.push(inArray(devices.type, filter.type as any[]));
      } else {
        conditions.push(eq(devices.type, filter.type as any));
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        conditions.push(inArray(devices.status, filter.status as any[]));
      } else {
        conditions.push(eq(devices.status, filter.status as any));
      }
    }

    if (filter.location) {
      conditions.push(like(devices.location, `%${filter.location}%`));
    }

    if (filter.department) {
      conditions.push(eq(devices.department, filter.department));
    }

    if (filter.manufacturer) {
      conditions.push(eq(devices.manufacturer, filter.manufacturer));
    }

    if (filter.search) {
      conditions.push(
        or(
          like(devices.name, `%${filter.search}%`),
          like(devices.deviceId, `%${filter.search}%`),
          like(devices.serialNumber, `%${filter.search}%`)
        )
      );
    }

    if (filter.hasWarranty !== undefined) {
      if (filter.hasWarranty) {
        conditions.push(gte(devices.warrantyExpiry, new Date()));
      } else {
        conditions.push(
          or(
            lte(devices.warrantyExpiry, new Date()),
            sql`${devices.warrantyExpiry} IS NULL`
          )
        );
      }
    }

    if (filter.onlineSince) {
      conditions.push(gte(devices.lastHeartbeat, filter.onlineSince));
    }

    if (filter.offlineSince) {
      conditions.push(lte(devices.lastHeartbeat, filter.offlineSince));
    }

    return conditions;
  }

  /**
   * 更新设备
   */
  async update(deviceId: string, input: UpdateDeviceInput): Promise<DeviceFullInfo | null> {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 检查设备是否存在
      const existing = await this.getById(deviceId);
      if (!existing) {
        throw new Error(`Device ${deviceId} not found`);
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.type !== undefined) updateData.type = input.type;
      if (input.model !== undefined) updateData.model = input.model;
      if (input.manufacturer !== undefined) updateData.manufacturer = input.manufacturer;
      if (input.serialNumber !== undefined) updateData.serialNumber = input.serialNumber;
      if (input.location !== undefined) updateData.location = input.location;
      if (input.department !== undefined) updateData.department = input.department;
      if (input.status !== undefined) {
        updateData.status = input.status;
        if (input.status === 'online') {
          updateData.lastHeartbeat = new Date();
        }
      }
      if (input.installDate !== undefined) updateData.installDate = input.installDate;
      if (input.warrantyExpiry !== undefined) updateData.warrantyExpiry = input.warrantyExpiry;
      if (input.metadata !== undefined) {
        updateData.metadata = {
          ...(existing.metadata || {}),
          ...input.metadata,
        };
      }

      await db
        .update(devices)
        .set(updateData)
        .where(eq(devices.deviceId, deviceId));

      // 发布设备更新事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'device_updated',
        { deviceId, updates: Object.keys(input) },
        { deviceId }
      );

      return this.getById(deviceId);
    } catch (error) {
      console.error('[DeviceCrudService] Update failed:', error);
      throw error;
    }
  }

  /**
   * 批量更新设备
   */
  async updateBatch(
    deviceIds: string[],
    input: UpdateDeviceInput
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const deviceId of deviceIds) {
      try {
        await this.update(deviceId, input);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          deviceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * 删除设备
   */
  async delete(deviceId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 检查设备是否存在
      const existing = await this.getById(deviceId);
      if (!existing) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // 删除关联的传感器
      await db.delete(sensors).where(eq(sensors.deviceId, deviceId));

      // 删除设备
      await db.delete(devices).where(eq(devices.deviceId, deviceId));

      // 发布设备删除事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'device_deleted',
        { deviceId },
        { deviceId }
      );

      return true;
    } catch (error) {
      console.error('[DeviceCrudService] Delete failed:', error);
      throw error;
    }
  }

  /**
   * 批量删除设备
   */
  async deleteBatch(deviceIds: string[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const deviceId of deviceIds) {
      try {
        await this.delete(deviceId);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          deviceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * 更新设备状态
   */
  async updateStatus(deviceId: string, status: DeviceStatus): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'online') {
        updateData.lastHeartbeat = new Date();
      }

      await db
        .update(devices)
        .set(updateData)
        .where(eq(devices.deviceId, deviceId));

      // 发布状态变更事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'status_change',
        { deviceId, status, timestamp: new Date().toISOString() },
        { deviceId, severity: status === 'error' ? 'error' : 'info' }
      );

      return true;
    } catch (error) {
      console.error('[DeviceCrudService] UpdateStatus failed:', error);
      return false;
    }
  }

  /**
   * 批量更新设备状态
   */
  async updateStatusBatch(
    deviceIds: string[],
    status: DeviceStatus
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const deviceId of deviceIds) {
      try {
        await this.updateStatus(deviceId, status);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          deviceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * 获取设备统计信息
   */
  async getStatistics(): Promise<DeviceStatistics> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          total: 0,
          byStatus: { online: 0, offline: 0, maintenance: 0, error: 0, unknown: 0 },
          byType: {},
          byDepartment: {},
          onlineRate: 0,
          warrantyExpiringSoon: 0,
          recentlyOffline: 0,
        };
      }

      // 总数
      const totalResult = await db.select({ count: count() }).from(devices);
      const total = totalResult[0]?.count || 0;

      // 按状态统计
      const statusResults = await db
        .select({
          status: devices.status,
          count: count(),
        })
        .from(devices)
        .groupBy(devices.status);

      const byStatus: Record<DeviceStatus, number> = {
        online: 0,
        offline: 0,
        maintenance: 0,
        error: 0,
        unknown: 0,
      };
      for (const r of statusResults) {
        byStatus[r.status as DeviceStatus] = r.count;
      }

      // 按类型统计
      const typeResults = await db
        .select({
          type: devices.type,
          count: count(),
        })
        .from(devices)
        .groupBy(devices.type);

      const byType: Record<string, number> = {};
      for (const r of typeResults) {
        byType[r.type] = r.count;
      }

      // 按部门统计
      const deptResults = await db
        .select({
          department: devices.department,
          count: count(),
        })
        .from(devices)
        .groupBy(devices.department);

      const byDepartment: Record<string, number> = {};
      for (const r of deptResults) {
        if (r.department) {
          byDepartment[r.department] = r.count;
        }
      }

      // 在线率
      const onlineRate = total > 0 ? (byStatus.online / total) * 100 : 0;

      // 即将过保设备（30天内）
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const warrantyResult = await db
        .select({ count: count() })
        .from(devices)
        .where(
          and(
            gte(devices.warrantyExpiry, new Date()),
            lte(devices.warrantyExpiry, thirtyDaysLater)
          )
        );
      const warrantyExpiringSoon = warrantyResult[0]?.count || 0;

      // 最近离线设备（24小时内）
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      const offlineResult = await db
        .select({ count: count() })
        .from(devices)
        .where(
          and(
            eq(devices.status, 'offline'),
            gte(devices.lastHeartbeat, oneDayAgo)
          )
        );
      const recentlyOffline = offlineResult[0]?.count || 0;

      return {
        total,
        byStatus,
        byType,
        byDepartment,
        onlineRate: Math.round(onlineRate * 100) / 100,
        warrantyExpiringSoon,
        recentlyOffline,
      };
    } catch (error) {
      console.error('[DeviceCrudService] GetStatistics failed:', error);
      return {
        total: 0,
        byStatus: { online: 0, offline: 0, maintenance: 0, error: 0, unknown: 0 },
        byType: {},
        byDepartment: {},
        onlineRate: 0,
        warrantyExpiringSoon: 0,
        recentlyOffline: 0,
      };
    }
  }

  /**
   * 设备健康检查
   */
  async healthCheck(deviceId: string): Promise<DeviceHealthCheck | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const device = await this.getById(deviceId);
      if (!device) return null;

      // 获取传感器状态
      const sensorResults = await db
        .select({
          status: sensors.status,
          count: count(),
        })
        .from(sensors)
        .where(eq(sensors.deviceId, deviceId))
        .groupBy(sensors.status);

      const sensorStatus = {
        total: 0,
        active: 0,
        inactive: 0,
        error: 0,
      };

      for (const r of sensorResults) {
        sensorStatus.total += r.count;
        if (r.status === 'active') sensorStatus.active = r.count;
        if (r.status === 'inactive') sensorStatus.inactive = r.count;
        if (r.status === 'error') sensorStatus.error = r.count;
      }

      // 计算心跳年龄
      let heartbeatAge: number | undefined;
      if (device.lastHeartbeat) {
        heartbeatAge = Math.floor((Date.now() - device.lastHeartbeat.getTime()) / 1000);
      }

      // 检查问题
      const issues: string[] = [];
      
      if (device.status === 'error') {
        issues.push('设备处于故障状态');
      }
      
      if (device.status === 'offline') {
        issues.push('设备离线');
      }
      
      if (heartbeatAge && heartbeatAge > 300) {
        issues.push(`心跳超时 (${Math.floor(heartbeatAge / 60)} 分钟未响应)`);
      }
      
      if (sensorStatus.error > 0) {
        issues.push(`${sensorStatus.error} 个传感器异常`);
      }
      
      if (device.warrantyExpiry && device.warrantyExpiry < new Date()) {
        issues.push('设备已过保');
      }

      // 计算健康分数
      let healthScore = 100;
      
      if (device.status === 'error') healthScore -= 50;
      else if (device.status === 'offline') healthScore -= 30;
      else if (device.status === 'maintenance') healthScore -= 10;
      
      if (heartbeatAge) {
        if (heartbeatAge > 3600) healthScore -= 20;
        else if (heartbeatAge > 300) healthScore -= 10;
      }
      
      if (sensorStatus.total > 0) {
        const errorRate = sensorStatus.error / sensorStatus.total;
        healthScore -= Math.floor(errorRate * 20);
      }

      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        deviceId,
        status: device.status,
        lastHeartbeat: device.lastHeartbeat,
        heartbeatAge,
        sensorStatus,
        issues,
        healthScore,
      };
    } catch (error) {
      console.error('[DeviceCrudService] HealthCheck failed:', error);
      return null;
    }
  }

  /**
   * 批量健康检查
   */
  async healthCheckBatch(deviceIds: string[]): Promise<DeviceHealthCheck[]> {
    const results: DeviceHealthCheck[] = [];
    
    for (const deviceId of deviceIds) {
      const check = await this.healthCheck(deviceId);
      if (check) {
        results.push(check);
      }
    }
    
    return results;
  }

  /**
   * 获取设备类型列表
   */
  getDeviceTypes(): Array<{ value: DeviceType; label: string }> {
    return [
      { value: 'agv', label: '自动导引车 (AGV)' },
      { value: 'rtg', label: '轮胎式龙门吊 (RTG)' },
      { value: 'qc', label: '岸桥 (QC)' },
      { value: 'asc', label: '自动化堆垛机 (ASC)' },
      { value: 'conveyor', label: '传送带' },
      { value: 'pump', label: '泵' },
      { value: 'motor', label: '电机' },
      { value: 'sensor_hub', label: '传感器集线器' },
      { value: 'gateway', label: '网关' },
      { value: 'plc', label: '可编程逻辑控制器 (PLC)' },
      { value: 'robot', label: '工业机器人' },
      { value: 'camera', label: '摄像头' },
      { value: 'rfid_reader', label: 'RFID读写器' },
      { value: 'weighbridge', label: '地磅' },
      { value: 'other', label: '其他' },
    ];
  }

  /**
   * 获取设备状态列表
   */
  getDeviceStatuses(): Array<{ value: DeviceStatus; label: string; color: string }> {
    return [
      { value: 'online', label: '在线', color: 'green' },
      { value: 'offline', label: '离线', color: 'gray' },
      { value: 'maintenance', label: '维护中', color: 'yellow' },
      { value: 'error', label: '故障', color: 'red' },
      { value: 'unknown', label: '未知', color: 'gray' },
    ];
  }
}

// 导出单例
export const deviceCrudService = new DeviceCrudService();
export default deviceCrudService;
