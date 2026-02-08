/**
 * 设备管理和传感器数据流服务
 * 包含设备台账管理、传感器配置、数据模拟等功能
 */

import { getDb } from './db';
import { 
  devices, 
  sensors, 
  sensorReadings, 
  sensorAggregates 
} from '../drizzle/schema';
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm';
import { eventBus, TOPICS } from './eventBus';
import { streamProcessor } from './streamProcessor';

// ============ 类型定义 ============

export interface DeviceInfo {
  deviceId: string;
  name: string;
  type: string;
  model?: string;
  manufacturer?: string;
  location?: string;
  status: string;
  sensorCount?: number;
  lastHeartbeat?: Date;
}

export interface SensorInfo {
  sensorId: string;
  deviceId: string;
  name: string;
  type: string;
  unit?: string;
  status: string;
  lastValue?: string;
  lastReadingAt?: Date;
}

// ============ 数据模拟器 ============

class DataSimulator {
  private isRunning: boolean = false;
  private simulationInterval: NodeJS.Timeout | null = null;
  private simulatedDevices: Map<string, {
    deviceId: string;
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

    console.log('[DataSimulator] Started with interval:', intervalMs, 'ms');
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
    console.log('[DataSimulator] Stopped');
  }

  /**
   * 添加模拟设备
   */
  addDevice(deviceId: string, sensors: Array<{
    sensorId: string;
    type: string;
    baseValue: number;
    variance: number;
    trend?: number;
  }>): void {
    this.simulatedDevices.set(deviceId, {
      deviceId,
      sensors: assetSensors.map(s => ({
        ...s,
        trend: s.trend || 0,
      })),
    });
  }

  /**
   * 移除模拟设备
   */
  removeDevice(deviceId: string): void {
    this.simulatedDevices.delete(deviceId);
  }

  /**
   * 生成模拟数据
   */
  private async generateSimulatedData(): Promise<void> {
    for (const [deviceId, device] of Array.from(this.simulatedDevices.entries())) {
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
            deviceId,
            value: Math.round(value * 100) / 100,
            timestamp: new Date().toISOString(),
            type: sensor.type,
          },
          { source: 'simulator', sensorId: sensor.sensorId, deviceId }
        );

        // 添加到流处理器
        streamProcessor.addDataPoint(sensor.sensorId, value);
      }

      // 发送设备心跳
      await eventBus.publish(
        TOPICS.DEVICE_HEARTBEAT,
        'heartbeat',
        { deviceId, timestamp: new Date().toISOString() },
        { source: 'simulator', deviceId }
      );
    }
  }

  /**
   * 注入异常数据（用于测试）
   */
  async injectAnomaly(
    sensorId: string,
    deviceId: string,
    anomalyValue: number
  ): Promise<void> {
    await eventBus.publish(
      TOPICS.SENSOR_READING,
      'reading',
      {
        sensorId,
        deviceId,
        value: anomalyValue,
        timestamp: new Date().toISOString(),
        isAnomaly: true,
      },
      { source: 'anomaly_injection', sensorId, deviceId, severity: 'warning' }
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

// ============ 设备管理服务 ============

class DeviceService {
  /**
   * 创建设备
   */
  async createDevice(data: {
    deviceId: string;
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

      await db.insert(devices).values({
        deviceId: data.deviceId,
        name: data.name,
        type: data.type as any,
        model: data.model,
        manufacturer: data.manufacturer,
        serialNumber: data.serialNumber,
        location: data.location,
        department: data.department,
        status: 'unknown',
      });

      return {
        deviceId: data.deviceId,
        name: data.name,
        type: data.type,
        model: data.model,
        manufacturer: data.manufacturer,
        location: data.location,
        status: 'unknown',
      };
    } catch (error) {
      console.error('[DeviceService] Create device failed:', error);
      return null;
    }
  }

  /**
   * 获取设备列表
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
        conditions.push(eq(assetNodes.type, options.type as any));
      }
      if (options.status) {
        conditions.push(eq(assetNodes.status, options.status as any));
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

      return results.map(d => ({
        deviceId: d.deviceId,
        name: d.name,
        type: d.type,
        model: d.model || undefined,
        manufacturer: d.manufacturer || undefined,
        location: d.location || undefined,
        status: d.status,
        lastHeartbeat: d.lastHeartbeat || undefined,
      }));
    } catch (error) {
      console.error('[DeviceService] List devices failed:', error);
      return [];
    }
  }

  /**
   * 获取设备详情
   */
  async getDevice(deviceId: string): Promise<DeviceInfo | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(assetNodes)
        .where(eq(assetNodes.deviceId, deviceId))
        .limit(1);

      if (result.length === 0) return null;

      const d = result[0];
      
      // 获取传感器数量
      const sensorCountResult = await db
        .select({ count: count() })
        .from(assetSensors)
        .where(eq(assetSensors.deviceId, deviceId));

      return {
        deviceId: d.deviceId,
        name: d.name,
        type: d.type,
        model: d.model || undefined,
        manufacturer: d.manufacturer || undefined,
        location: d.location || undefined,
        status: d.status,
        sensorCount: sensorCountResult[0]?.count || 0,
        lastHeartbeat: d.lastHeartbeat || undefined,
      };
    } catch (error) {
      console.error('[DeviceService] Get device failed:', error);
      return null;
    }
  }

  /**
   * 更新设备状态
   */
  async updateDeviceStatus(
    deviceId: string,
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
        .where(eq(assetNodes.deviceId, deviceId));

      // 发布状态变更事件
      await eventBus.publish(
        TOPICS.DEVICE_STATUS,
        'status_change',
        { deviceId, status, timestamp: new Date().toISOString() },
        { deviceId, severity: status === 'error' ? 'error' : 'info' }
      );

      return true;
    } catch (error) {
      console.error('[DeviceService] Update device status failed:', error);
      return false;
    }
  }

  /**
   * 删除设备
   */
  async deleteDevice(deviceId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      await db.delete(devices).where(eq(assetNodes.deviceId, deviceId));
      return true;
    } catch (error) {
      console.error('[DeviceService] Delete device failed:', error);
      return false;
    }
  }
}

// ============ 传感器管理服务 ============

class SensorService {
  /**
   * 创建传感器
   */
  async createSensor(data: {
    sensorId: string;
    deviceId: string;
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

      await db.insert(sensors).values({
        sensorId: data.sensorId,
        deviceId: data.deviceId,
        name: data.name,
        type: data.type as any,
        unit: data.unit,
        minValue: data.minValue,
        maxValue: data.maxValue,
        warningThreshold: data.warningThreshold,
        criticalThreshold: data.criticalThreshold,
        samplingRate: data.samplingRate || 1000,
        status: 'active',
      });

      return {
        sensorId: data.sensorId,
        deviceId: data.deviceId,
        name: data.name,
        type: data.type,
        unit: data.unit,
        status: 'active',
      };
    } catch (error) {
      console.error('[SensorService] Create sensor failed:', error);
      return null;
    }
  }

  /**
   * 获取设备的传感器列表
   */
  async listSensors(deviceId?: string): Promise<SensorInfo[]> {
    try {
      const db = await getDb();
      if (!db) return [];

      const query = db
        .select()
        .from(assetSensors)
        .orderBy(desc(assetSensors.updatedAt));

      if (deviceId) {
        query.where(eq(assetSensors.deviceId, deviceId));
      }

      const results = await query;

      return results.map(s => ({
        sensorId: s.sensorId,
        deviceId: s.deviceId,
        name: s.name,
        type: s.type,
        unit: s.unit || undefined,
        status: s.status,
        lastValue: s.lastValue || undefined,
        lastReadingAt: s.lastReadingAt || undefined,
      }));
    } catch (error) {
      console.error('[SensorService] List sensors failed:', error);
      return [];
    }
  }

  /**
   * 获取传感器最近读数
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
          value: sensorReadings.numericValue,
          timestamp: sensorReadings.timestamp,
        })
        .from(assetSensors) // TODO: migrate from sensorReadings
        .where(eq(sensorReadings.sensorId, sensorId))
        .orderBy(desc(sensorReadings.timestamp))
        .limit(limit);

      return results.map(r => ({
        value: (r.value || 0) / 100,
        timestamp: r.timestamp,
      }));
    } catch (error) {
      console.error('[SensorService] Get readings failed:', error);
      return [];
    }
  }

  /**
   * 获取传感器聚合数据
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
        eq(sensorAggregates.sensorId, sensorId),
        eq(sensorAggregates.period, period),
      ];

      if (startTime) {
        conditions.push(gte(sensorAggregates.periodStart, startTime));
      }
      if (endTime) {
        conditions.push(lte(sensorAggregates.periodStart, endTime));
      }

      const results = await db
        .select()
        .from(assetSensors) // TODO: migrate from sensorAggregates
        .where(and(...conditions))
        .orderBy(desc(sensorAggregates.periodStart))
        .limit(1000);

      return results.map(r => ({
        periodStart: r.periodStart,
        avg: (r.avgValue || 0) / 100,
        min: (r.minValue || 0) / 100,
        max: (r.maxValue || 0) / 100,
        count: r.count,
      }));
    } catch (error) {
      console.error('[SensorService] Get aggregates failed:', error);
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
          lastValue: String(value),
          lastReadingAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assetSensors.sensorId, sensorId));
    } catch (error) {
      console.error('[SensorService] Update last value failed:', error);
    }
  }

  /**
   * 删除传感器
   */
  async deleteSensor(sensorId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      await db.delete(sensors).where(eq(assetSensors.sensorId, sensorId));
      return true;
    } catch (error) {
      console.error('[SensorService] Delete sensor failed:', error);
      return false;
    }
  }
}

// ============ 单例导出 ============

export const deviceService = new DeviceService();
export const sensorService = new SensorService();

// ============ tRPC 路由 ============

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from './_core/trpc';

export const deviceRouter = router({
  // 设备管理
  createDevice: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
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
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ input }) => {
      return deviceService.getDevice(input.deviceId);
    }),

  updateDeviceStatus: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      status: z.enum(['online', 'offline', 'maintenance', 'error']),
    }))
    .mutation(async ({ input }) => {
      return deviceService.updateDeviceStatus(input.deviceId, input.status);
    }),

  deleteDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      return deviceService.deleteDevice(input.deviceId);
    }),

  // 传感器管理
  createSensor: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      deviceId: z.string(),
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
    .input(z.object({ deviceId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return sensorService.listSensors(input?.deviceId);
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
      deviceId: z.string(),
      sensors: z.array(z.object({
        sensorId: z.string(),
        type: z.string(),
        baseValue: z.number(),
        variance: z.number(),
        trend: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      dataSimulator.addDevice(input.deviceId, input.sensors);
      return { success: true };
    }),

  removeSimulatedDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      dataSimulator.removeDevice(input.deviceId);
      return { success: true };
    }),

  injectAnomaly: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      deviceId: z.string(),
      anomalyValue: z.number(),
    }))
    .mutation(async ({ input }) => {
      await dataSimulator.injectAnomaly(input.sensorId, input.deviceId, input.anomalyValue);
      return { success: true };
    }),

  // 初始化示例数据
  initSampleData: protectedProcedure
    .mutation(async () => {
      // 创建示例设备
      const sampleDevices = [
        { deviceId: 'agv_001', name: 'AGV小车-01', type: 'agv' as const, location: 'A区-1号线' },
        { deviceId: 'rtg_001', name: 'RTG龙门吊-01', type: 'rtg' as const, location: 'B区-堆场' },
        { deviceId: 'pump_001', name: '液压泵-01', type: 'pump' as const, location: 'C区-机房' },
      ];

      for (const device of sampleDevices) {
        await deviceService.createDevice(device);
      }

      // 创建示例传感器
      const sampleSensors = [
        { sensorId: 'agv_001_vib', deviceId: 'agv_001', name: '振动传感器', type: 'vibration' as const, unit: 'mm/s' },
        { sensorId: 'agv_001_temp', deviceId: 'agv_001', name: '温度传感器', type: 'temperature' as const, unit: '°C' },
        { sensorId: 'rtg_001_current', deviceId: 'rtg_001', name: '电流传感器', type: 'current' as const, unit: 'A' },
        { sensorId: 'pump_001_pressure', deviceId: 'pump_001', name: '压力传感器', type: 'pressure' as const, unit: 'MPa' },
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
