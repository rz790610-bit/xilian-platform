import crypto from 'crypto';

/**
 * 设备管理和传感器数据流服务
 * 包含设备台账管理、传感器配置、数据模拟等功能
 * 
 * [已迁移] 所有数据操作已统一到 v1.5 数据模型：
 *   - devices → asset_nodes
 *   - sensors → asset_sensors
 *   - sensor_readings → event_store (event_type='sensor_reading')
 *   - sensor_aggregates → event_store (event_type='aggregation_result')
 *
 * ID 体系规范（v2.0）：
 *   - nodeId: 设备树节点唯一标识 → asset_nodes.node_id
 *   - deviceCode: 设备编码 → asset_nodes.code（可由编码规则生成，≠ nodeId）
 *   - sensorId: 传感器唯一标识 → asset_sensors.sensor_id
 *
 * 本文件对外暴露的 API 统一使用 nodeId 作为设备标识。
 */

import { getDb } from '../lib/db';
import { 

  assetNodes, 
  assetSensors, 
  eventStore,
} from '../../drizzle/schema';
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm';
import { eventBus, TOPICS } from './eventBus.service';
import { streamProcessor } from './streamProcessor.service';

// ============ 类型定义 ============

export type DeviceInfo = {
  /** 设备树节点ID（权威标识） */
  nodeId: string;
  /** 设备编码（可由编码规则生成） */
  deviceCode: string;
  name: string;
  type: string;
  location?: string;
  model?: string;
  manufacturer?: string;
  status: string;
  sensorCount?: number;
  lastHeartbeat?: Date;
};

export type SensorInfo = {
  sensorId: string;
  /** 设备编码（关联 asset_nodes.code） */
  deviceCode: string;
  name: string;
  type: string;
  unit?: string;
  status: string;
  lastValue?: number | null;
  lastReadingAt?: Date | null;
};

// ============ 数据模拟器 ============

class DataSimulator {
  private isRunning: boolean = false;
  private simulationInterval: NodeJS.Timeout | null = null;
  private simulatedDevices: Map<string, {
    nodeId: string;
    sensors: Array<{
      sensorId: string;
      type: string;
      baseValue: number;
      variance: number;
      trend: number;
    }>;
  }> = new Map();

  /**
   * 启动数据模拟
   */
  start(intervalMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.simulationInterval = setInterval(async () => {
      await this.generateSimulatedData();
    }, intervalMs);

    log.debug(`[DataSimulator] Started with interval: ${intervalMs}ms`);
  }

  /**
   * 停止数据模拟
   */
  stop(): void {
    this.isRunning = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    log.debug('[DataSimulator] Stopped');
  }

  /**
   * 添加模拟设备
   */
  addDevice(nodeId: string, sensors: Array<{
    sensorId: string;
    type: string;
    baseValue: number;
    variance: number;
    trend?: number;
  }>): void {
    this.simulatedDevices.set(nodeId, {
      nodeId,
      sensors: sensors.map(s => ({
        ...s,
        trend: s.trend || 0,
      })),
    });
  }

  /**
   * 移除模拟设备
   */
  removeDevice(nodeId: string): void {
    this.simulatedDevices.delete(nodeId);
  }

  /**
   * 生成模拟数据
   */
  private async generateSimulatedData(): Promise<void> {
    for (const [nodeId, device] of Array.from(this.simulatedDevices.entries())) {
      for (const sensor of device.sensors) {
        // 生成带有随机波动和趋势的数据
        const noise = (Math.random() - 0.5) * 2 * sensor.variance;
        const trendEffect = sensor.trend * (Date.now() / 1000 % 3600) / 3600;
        const value = sensor.baseValue + noise + trendEffect;

        // 发布传感器读数事件
        await eventBus.publish(
          TOPICS.SENSOR_READING,
          'reading',
          {
            sensorId: sensor.sensorId,
            nodeId,
            value: Math.round(value * 100) / 100,
            timestamp: new Date().toISOString(),
            type: sensor.type,
          },
          { source: 'simulator', sensorId: sensor.sensorId, nodeId }
        );

        // 添加到流处理器
        streamProcessor.addDataPoint(sensor.sensorId, value);
      }

      // 发送设备心跳
      await eventBus.publish(
        TOPICS.DEVICE_HEARTBEAT,
        'heartbeat',
        { nodeId, timestamp: new Date().toISOString() },
        { source: 'simulator', nodeId }
      );
    }
  }

  /**
   * 注入异常数据（用于测试）
   */
  async injectAnomaly(
    sensorId: string,
    nodeId: string,
    anomalyValue: number
  ): Promise<void> {
    await eventBus.publish(
      TOPICS.SENSOR_READING,
      'reading',
      {
        sensorId,
        nodeId,
        value: anomalyValue,
        timestamp: new Date().toISOString(),
        isAnomaly: true,
      },
      { source: 'anomaly_injection', sensorId, nodeId, severity: 'warning' }
    );

    streamProcessor.addDataPoint(sensorId, anomalyValue);
  }

  /**
   * 获取模拟状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      deviceCount: this.simulatedDevices.size,
      devices: Array.from(this.simulatedDevices.keys()),
    };
  }
}

export const dataSimulator = new DataSimulator();

// ============ 辅助函数 ============

/** 生成唯一事件 ID
 * P1: 改用 crypto.randomUUID() 替代 Math.random()，避免高并发下 ID 冲突
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ============ 设备管理服务 ============

class DeviceService {
  /**
   * 创建设备（写入 asset_nodes）
   */
  async createDevice(data: {
    nodeId: string;
    name: string;
    type: string;
    model?: string;
    manufacturer?: string;
    serialNumber?: string;
    location?: string;
    department?: string;
  }): Promise<DeviceInfo | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const now = new Date();
      // deviceCode 默认等于 nodeId（编码规则启用后可不同）
      const nodeId = data.nodeId;
      const deviceCode = (data as any).deviceCode || nodeId;
      await db.insert(assetNodes).values({
        nodeId,
        code: deviceCode,
        name: data.name,
        level: 1,
        nodeType: data.type,
        rootNodeId: nodeId,
        status: 'unknown',
        path: `/${nodeId}`,
        serialNumber: data.serialNumber,
        location: data.location,
        department: data.department,
        attributes: data.model || data.manufacturer
          ? JSON.stringify({ model: data.model, manufacturer: data.manufacturer })
          : null,
        createdAt: now,
        updatedAt: now,
      });

      return {
        nodeId,
        deviceCode,
        name: data.name,
        type: data.type,
        model: data.model,
        manufacturer: data.manufacturer,
        location: data.location,
        status: 'unknown',
      };
    } catch (error) {
      log.warn('[DeviceService] Create device failed:', error);
      return null;
    }
  }

  /**
   * 获取设备列表（从 asset_nodes 查询）
   */
  async listDevices(options: {
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<DeviceInfo[]> {
    try {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (options.type) {
        conditions.push(eq(assetNodes.nodeType, options.type));
      }
      if (options.status) {
        conditions.push(eq(assetNodes.status, options.status));
      }

      const query = db
        .select()
        .from(assetNodes)
        .orderBy(desc(assetNodes.updatedAt))
        .limit(options.limit || 100)
        .offset(options.offset || 0);

      if (conditions.length > 0) {
        // @ts-ignore
        query.where(and(...conditions));
      }

      const results = await query;

      return results.map(d => {
        const attrs = d.attributes ? (typeof d.attributes === 'string' ? JSON.parse(d.attributes) : d.attributes) : {};
        return {
          nodeId: d.nodeId,
          deviceCode: d.code,
          name: d.name,
          type: d.nodeType,
          model: attrs?.model || undefined,
          manufacturer: attrs?.manufacturer || undefined,
          location: d.location || undefined,
          status: d.status,
          lastHeartbeat: d.lastHeartbeat || undefined,
        };
      });
    } catch (error) {
      log.warn('[DeviceService] List devices failed:', error);
      return [];
    }
  }

  /**
   * 获取设备详情（从 asset_nodes 查询）
   */
  async getDevice(nodeId: string): Promise<DeviceInfo | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(assetNodes)
        .where(eq(assetNodes.nodeId, nodeId))
        .limit(1);

      if (result.length === 0) return null;

      const d = result[0];
      
      // 获取传感器数量 — 使用 deviceCode(=code) 关联传感器
      const deviceCode = d.code;
      const sensorCountResult = await db
        .select({ count: count() })
        .from(assetSensors)
        .where(eq(assetSensors.deviceCode, deviceCode));

      const attrs = d.attributes ? (typeof d.attributes === 'string' ? JSON.parse(d.attributes) : d.attributes) : {};

      return {
        nodeId: d.nodeId,
        deviceCode,
        name: d.name,
        type: d.nodeType,
        model: attrs?.model || undefined,
        manufacturer: attrs?.manufacturer || undefined,
        location: d.location || undefined,
        status: d.status,
        sensorCount: sensorCountResult[0]?.count || 0,
        lastHeartbeat: d.lastHeartbeat || undefined,
      };
    } catch (error) {
      log.warn('[DeviceService] Get device failed:', error);
      return null;
    }
  }

  /**
   * 更新设备状态（更新 asset_nodes）
   */
  async updateDeviceStatus(
    nodeId: string,
    status: 'online' | 'offline' | 'maintenance' | 'error'
  ): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      await db
        .update(assetNodes)
        .set({
          status,
          lastHeartbeat: status === 'online' ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(assetNodes.nodeId, nodeId));

      // 发布状态变更事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'status_change',
        { nodeId, status, timestamp: new Date().toISOString() },
        { nodeId, severity: status === 'error' ? 'error' : 'info' }
      );

      return true;
    } catch (error) {
      log.warn('[DeviceService] Update device status failed:', error);
      return false;
    }
  }

  /**
   * 删除设备（从 asset_nodes 删除）
   */
  async deleteDevice(nodeId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      await db.delete(assetNodes).where(eq(assetNodes.nodeId, nodeId));
      return true;
    } catch (error) {
      log.warn('[DeviceService] Delete device failed:', error);
      return false;
    }
  }
}

// ============ 传感器管理服务 ============

class SensorService {
  /**
   * 创建传感器（写入 asset_sensors）
   */
  async createSensor(data: {
    sensorId: string;
    nodeId: string;
    name: string;
    type: string;
    unit?: string;
    minValue?: number;
    maxValue?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    samplingRate?: number;
  }): Promise<SensorInfo | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const now = new Date();
      // 传感器通过 deviceCode 关联设备
      const deviceCode = (data as any).deviceCode || data.nodeId;
      await db.insert(assetSensors).values({
        sensorId: data.sensorId,
        deviceCode,
        mpId: data.sensorId, // 测点ID默认与传感器ID一致
        name: data.name,
        physicalQuantity: data.type,
        unit: data.unit,
        warningThreshold: data.warningThreshold,
        criticalThreshold: data.criticalThreshold,
        sampleRate: data.samplingRate || 1000,
        status: 'active',
        metadata: (data.minValue !== undefined || data.maxValue !== undefined)
          ? JSON.stringify({ minValue: data.minValue, maxValue: data.maxValue })
          : null,
        createdAt: now,
        updatedAt: now,
      });

      return {
        sensorId: data.sensorId,
        deviceCode,
        name: data.name,
        type: data.type,
        unit: data.unit,
        status: 'active',
      };
    } catch (error) {
      log.warn('[SensorService] Create sensor failed:', error);
      return null;
    }
  }

  /**
   * 获取设备的传感器列表（从 asset_sensors 查询）
   */
  async listSensors(nodeId?: string): Promise<SensorInfo[]> {
    try {
      const db = await getDb();
      if (!db) return [];

      const query = db
        .select()
        .from(assetSensors)
        .orderBy(desc(assetSensors.updatedAt));

      if (nodeId) {
        query.where(eq(assetSensors.deviceCode, nodeId));
      }

      const results = await query;

      return results.map(s => ({
        sensorId: s.sensorId,
        deviceCode: s.deviceCode,
        name: s.name || '',
        type: s.physicalQuantity || '',
        unit: s.unit || undefined,
        status: s.status,
        lastValue: s.lastValue || undefined,
        lastReadingAt: s.lastReadingAt || undefined,
      }));
    } catch (error) {
      log.warn('[SensorService] List sensors failed:', error);
      return [];
    }
  }

  /**
   * 获取传感器最近读数（从 event_store 查询 sensor_reading 事件）
   */
  async getRecentReadings(
    sensorId: string,
    limit: number = 100
  ): Promise<Array<{ value: number; timestamp: Date }>> {
    try {
      const db = await getDb();
      if (!db) return [];

      const results = await db
        .select({
          payload: eventStore.payload,
          occurredAt: eventStore.occurredAt,
        })
        .from(eventStore)
        .where(
          and(
            eq(eventStore.aggregateType, 'sensor'),
            eq(eventStore.aggregateId, sensorId),
            eq(eventStore.eventType, 'sensor_reading'),
          )
        )
        .orderBy(desc(eventStore.occurredAt))
        .limit(limit);

      return results.map(r => {
        const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
        return {
          value: (payload?.numericValue || payload?.value || 0) / 100,
          timestamp: r.occurredAt,
        };
      });
    } catch (error) {
      log.warn('[SensorService] Get readings failed:', error);
      return [];
    }
  }

  /**
   * 获取传感器聚合数据（从 event_store 查询 aggregation_result 事件）
   */
  async getAggregates(
    sensorId: string,
    period: '1m' | '5m' | '1h' | '1d',
    startTime?: Date,
    endTime?: Date
  ): Promise<Array<{
    periodStart: Date;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>> {
    try {
      const db = await getDb();
      if (!db) return [];

      const conditions = [
        eq(eventStore.aggregateType, 'sensor'),
        eq(eventStore.aggregateId, sensorId),
        eq(eventStore.eventType, 'aggregation_result'),
      ];

      if (startTime) {
        conditions.push(gte(eventStore.occurredAt, startTime));
      }
      if (endTime) {
        conditions.push(lte(eventStore.occurredAt, endTime));
      }

      const results = await db
        .select({
          payload: eventStore.payload,
          occurredAt: eventStore.occurredAt,
        })
        .from(eventStore)
        .where(and(...conditions))
        .orderBy(desc(eventStore.occurredAt))
        .limit(1000);

      return results
        .map(r => {
          const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
          // 仅返回匹配 period 的聚合结果
          if (payload?.period && payload.period !== period) return null;
          return {
            periodStart: r.occurredAt,
            avg: payload?.avg || 0,
            min: payload?.min || 0,
            max: payload?.max || 0,
            count: payload?.count || 0,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (error) {
      log.warn('[SensorService] Get aggregates failed:', error);
      return [];
    }
  }

  /**
   * 更新传感器最新值
   */
  async updateLastValue(sensorId: string, value: number): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;

      await db
        .update(assetSensors)
        .set({
          lastValue: value,
          lastReadingAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assetSensors.sensorId, sensorId));
    } catch (error) {
      log.warn('[SensorService] Update last value failed:', error);
    }
  }

  /**
   * 删除传感器（从 asset_sensors 删除）
   */
  async deleteSensor(sensorId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      await db.delete(assetSensors).where(eq(assetSensors.sensorId, sensorId));
      return true;
    } catch (error) {
      log.warn('[SensorService] Delete sensor failed:', error);
      return false;
    }
  }
}

// ============ 单例导出 ============

export const deviceService = new DeviceService();
export const sensorService = new SensorService();

// ============ tRPC 路由 ============

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('device');

export const deviceRouter = router({
  // 设备管理
  createDevice: protectedProcedure
    .input(z.object({
      nodeId: z.string(),
      name: z.string(),
      type: z.enum(['agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor', 'sensor_hub', 'gateway', 'other']),
      model: z.string().optional(),
      manufacturer: z.string().optional(),
      serialNumber: z.string().optional(),
      location: z.string().optional(),
      department: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return deviceService.createDevice(input);
    }),

  listDevices: publicProcedure
    .input(z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return deviceService.listDevices(input || {});
    }),

  getDevice: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ input }) => {
      return deviceService.getDevice(input.nodeId);
    }),

  updateDeviceStatus: protectedProcedure
    .input(z.object({
      nodeId: z.string(),
      status: z.enum(['online', 'offline', 'maintenance', 'error']),
    }))
    .mutation(async ({ input }) => {
      return deviceService.updateDeviceStatus(input.nodeId, input.status);
    }),

  deleteDevice: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ input }) => {
      return deviceService.deleteDevice(input.nodeId);
    }),

  // 传感器管理
  createSensor: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      nodeId: z.string(),
      name: z.string(),
      type: z.enum(['vibration', 'temperature', 'pressure', 'current', 'voltage', 'speed', 'position', 'humidity', 'flow', 'level', 'other']),
      unit: z.string().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
      samplingRate: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return sensorService.createSensor(input);
    }),

  listSensors: publicProcedure
    .input(z.object({ nodeId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return sensorService.listSensors(input?.nodeId);
    }),

  getRecentReadings: publicProcedure
    .input(z.object({
      sensorId: z.string(),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      return sensorService.getRecentReadings(input.sensorId, input.limit);
    }),

  getAggregates: publicProcedure
    .input(z.object({
      sensorId: z.string(),
      period: z.enum(['1m', '5m', '1h', '1d']),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return sensorService.getAggregates(
        input.sensorId,
        input.period,
        input.startTime ? new Date(input.startTime) : undefined,
        input.endTime ? new Date(input.endTime) : undefined
      );
    }),

  deleteSensor: protectedProcedure
    .input(z.object({ sensorId: z.string() }))
    .mutation(async ({ input }) => {
      return sensorService.deleteSensor(input.sensorId);
    }),

  // 数据模拟器
  startSimulator: protectedProcedure
    .input(z.object({ intervalMs: z.number().min(100).max(10000).default(1000) }))
    .mutation(async ({ input }) => {
      dataSimulator.start(input.intervalMs);
      return { success: true };
    }),

  stopSimulator: protectedProcedure
    .mutation(async () => {
      dataSimulator.stop();
      return { success: true };
    }),

  getSimulatorStatus: publicProcedure
    .query(async () => {
      return dataSimulator.getStatus();
    }),

  addSimulatedDevice: protectedProcedure
    .input(z.object({
      nodeId: z.string(),
      sensors: z.array(z.object({
        sensorId: z.string(),
        type: z.string(),
        baseValue: z.number(),
        variance: z.number(),
        trend: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      dataSimulator.addDevice(input.nodeId, input.sensors);
      return { success: true };
    }),

  removeSimulatedDevice: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ input }) => {
      dataSimulator.removeDevice(input.nodeId);
      return { success: true };
    }),

  injectAnomaly: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      nodeId: z.string(),
      anomalyValue: z.number(),
    }))
    .mutation(async ({ input }) => {
      await dataSimulator.injectAnomaly(input.sensorId, input.nodeId, input.anomalyValue);
      return { success: true };
    }),

  // 初始化示例数据
  initSampleData: protectedProcedure
    .mutation(async () => {
      // 创建示例设备
      const sampleDevices = [
        { nodeId: 'agv_001', name: 'AGV小车-01', type: 'agv' as const, location: 'A区-1号线' },
        { nodeId: 'rtg_001', name: 'RTG龙门吊-01', type: 'rtg' as const, location: 'B区-堆场' },
        { nodeId: 'pump_001', name: '液压泵-01', type: 'pump' as const, location: 'C区-机房' },
      ];

      for (const device of sampleDevices) {
        await deviceService.createDevice(device);
      }

      // 创建示例传感器
      const sampleSensors = [
        { sensorId: 'agv_001_vib', nodeId: 'agv_001', name: '振动传感器', type: 'vibration' as const, unit: 'mm/s' },
        { sensorId: 'agv_001_temp', nodeId: 'agv_001', name: '温度传感器', type: 'temperature' as const, unit: '°C' },
        { sensorId: 'rtg_001_current', nodeId: 'rtg_001', name: '电流传感器', type: 'current' as const, unit: 'A' },
        { sensorId: 'pump_001_pressure', nodeId: 'pump_001', name: '压力传感器', type: 'pressure' as const, unit: 'MPa' },
      ];

      for (const sensor of sampleSensors) {
        await sensorService.createSensor(sensor);
      }

      // 配置模拟器
      dataSimulator.addDevice('agv_001', [
        { sensorId: 'agv_001_vib', type: 'vibration', baseValue: 2.5, variance: 0.5, trend: 0.1 },
        { sensorId: 'agv_001_temp', type: 'temperature', baseValue: 45, variance: 3, trend: 0 },
      ]);
      dataSimulator.addDevice('rtg_001', [
        { sensorId: 'rtg_001_current', type: 'current', baseValue: 120, variance: 15, trend: 0 },
      ]);
      dataSimulator.addDevice('pump_001', [
        { sensorId: 'pump_001_pressure', type: 'pressure', baseValue: 8.5, variance: 0.3, trend: 0 },
      ]);

      return { success: true, message: '示例数据初始化完成' };
    }),
});

export type DeviceRouter = typeof deviceRouter;
