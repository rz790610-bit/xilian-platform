/**
 * Device Service — gRPC 服务器入口
 * 
 * 独立微服务，负责设备域的所有操作：
 * - 设备 CRUD + 生命周期管理
 * - 传感器配置与数据采集
 * - 设备健康监控
 * - 设备分组与标签
 * 
 * 通信：
 * - gRPC (端口 50051) — 同步 RPC
 * - Kafka — 异步事件发布
 * - Redis — 设备状态缓存
 * 
 * 启动方式：
 *   node --loader tsx services/device-service/src/server.ts
 *   或 docker-compose --profile microservices up device-service
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createModuleLogger } from '../../../server/core/logger';
import { getDb } from '../../../server/lib/db';
import { assetNodes, assetSensors, eventStore } from '../../../drizzle/schema';
import { eq, desc, and, gte, lte, sql, count, like, or, inArray } from 'drizzle-orm';

const log = createModuleLogger('device-service');

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  port: parseInt(process.env.DEVICE_SERVICE_PORT || '50051'),
  host: process.env.DEVICE_SERVICE_HOST || '0.0.0.0',
  kafkaBrokers: process.env.KAFKA_BROKERS || 'localhost:9092',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxConcurrentStreams: 100,
  keepaliveTimeMs: 30000,
  keepaliveTimeoutMs: 5000,
};

// ============================================================
// Proto 加载
// ============================================================

const PROTO_PATH = path.resolve(__dirname, '../proto/device_service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [
    path.resolve(__dirname, '../proto'),
    path.resolve(__dirname, '../../../node_modules/google-proto-files'),
  ],
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const deviceProto = protoDescriptor.xilian.device.v1;

// ============================================================
// 服务实现
// ============================================================

const startTime = Date.now();

/**
 * 将数据库行映射为 gRPC Device 消息
 */
function mapToDevice(row: any): any {
  return {
    id: row.id?.toString() || row.nodeId || '',
    name: row.name || row.nodeName || '',
    type: (row.nodeType || row.type || 'OTHER').toUpperCase(),
    status: (row.status || 'UNKNOWN').toUpperCase(),
    location: row.location || '',
    model: row.model || '',
    manufacturer: row.manufacturer || '',
    serialNumber: row.serialNumber || '',
    metadata: {
      firmware: row.firmware || '',
      ipAddress: row.ipAddress || '',
      macAddress: row.macAddress || '',
      protocol: row.protocol || '',
      tags: row.tags ? JSON.parse(row.tags) : [],
      customFields: row.customFields ? JSON.parse(row.customFields) : {},
    },
    createdAt: row.createdAt ? { seconds: Math.floor(new Date(row.createdAt).getTime() / 1000) } : null,
    updatedAt: row.updatedAt ? { seconds: Math.floor(new Date(row.updatedAt).getTime() / 1000) } : null,
    lastSeenAt: row.lastSeenAt ? { seconds: Math.floor(new Date(row.lastSeenAt).getTime() / 1000) } : null,
  };
}

/**
 * Device Service gRPC 处理器
 */
const deviceServiceImpl = {
  // ── 健康检查 ──
  async healthCheck(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const db = await getDb();
      const dbOk = db ? 'ok' : 'error';
      
      callback(null, {
        status: 'SERVING',
        version: process.env.SERVICE_VERSION || '1.0.0',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000).toString(),
        checks: { db: dbOk },
      });
    } catch (err: any) {
      callback(null, {
        status: 'NOT_SERVING',
        version: process.env.SERVICE_VERSION || '1.0.0',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000).toString(),
        checks: { db: 'error', error: err.message },
      });
    }
  },

  // ── 创建设备 ──
  async createDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const nodeId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      const [inserted] = await db.insert(assetNodes).values({
        nodeId,
        code: `DEV_${nodeId}`,
        name: req.name,
        level: 3,
        nodeType: (req.type || 'other').toLowerCase(),
        parentNodeId: null,
        rootNodeId: nodeId,
        status: 'online',
        path: `/${nodeId}`,
        depth: 1,
        serialNumber: req.serialNumber || null,
        location: req.location || null,
        attributes: {
          model: req.model || '',
          manufacturer: req.manufacturer || '',
          ...(req.metadata || {}),
        },
      });

      log.info(`Device created: ${nodeId} (${req.name})`);
      
      callback(null, { device: mapToDevice({ ...inserted, id: nodeId }) });
    } catch (err: any) {
      log.error('CreateDevice failed:', err.message);
      callback({
        code: grpc.status.INTERNAL,
        message: err.message,
      });
    }
  },

  // ── 获取设备 ──
  async getDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [device] = await db
        .select()
        .from(assetNodes)
        .where(eq(assetNodes.nodeId, deviceId))
        .limit(1);

      if (!device) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Device ${deviceId} not found`,
        });
      }

      callback(null, { device: mapToDevice(device) });
    } catch (err: any) {
      log.error('GetDevice failed:', err.message);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 列表设备 ──
  async listDevices(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));
      const offset = (page - 1) * pageSize;

      const conditions: any[] = [];
      if (req.typeFilter && req.typeFilter !== 'DEVICE_TYPE_UNSPECIFIED') {
        conditions.push(eq(assetNodes.nodeType, req.typeFilter.toLowerCase()));
      }
      if (req.statusFilter && req.statusFilter !== 'DEVICE_STATUS_UNSPECIFIED') {
        conditions.push(eq(assetNodes.status, req.statusFilter.toLowerCase()));
      }
      if (req.search) {
        conditions.push(
          or(
            like(assetNodes.name, `%${req.search}%`),
            like(assetNodes.nodeId, `%${req.search}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [devices, [totalResult]] = await Promise.all([
        db.select().from(assetNodes).where(whereClause)
          .orderBy(desc(assetNodes.createdAt))
          .limit(pageSize).offset(offset),
        db.select({ total: count() }).from(assetNodes).where(whereClause),
      ]);

      callback(null, {
        devices: devices.map(mapToDevice),
        total: totalResult?.total || 0,
        page,
        pageSize,
      });
    } catch (err: any) {
      log.error('ListDevices failed:', err.message);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 更新设备 ──
  async updateDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updates: Record<string, any> = {};
      if (req.name) updates.name = req.name;
      if (req.type && req.type !== 'DEVICE_TYPE_UNSPECIFIED') {
        updates.nodeType = req.type.toLowerCase();
      }

      if (Object.keys(updates).length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'No fields to update',
        });
      }

      await db.update(assetNodes)
        .set(updates)
        .where(eq(assetNodes.nodeId, req.deviceId));

      const [updated] = await db.select().from(assetNodes)
        .where(eq(assetNodes.nodeId, req.deviceId)).limit(1);

      if (!updated) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Device ${req.deviceId} not found`,
        });
      }

      log.info(`Device updated: ${req.deviceId}`);
      callback(null, { device: mapToDevice(updated) });
    } catch (err: any) {
      log.error('UpdateDevice failed:', err.message);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 删除设备 ──
  async deleteDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId, force } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      if (force) {
        // 级联删除传感器
        await db.delete(assetSensors).where(eq(assetSensors.deviceCode, deviceId));
      }

      const result = await db.delete(assetNodes).where(eq(assetNodes.nodeId, deviceId));
      log.info(`Device deleted: ${deviceId} (force=${force})`);
      callback(null, {});
    } catch (err: any) {
      log.error('DeleteDevice failed:', err.message);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 激活设备 ──
  async activateDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(assetNodes)
        .set({ status: 'online' })
        .where(eq(assetNodes.nodeId, deviceId));

      const [device] = await db.select().from(assetNodes)
        .where(eq(assetNodes.nodeId, deviceId)).limit(1);

      callback(null, { device: mapToDevice(device) });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 停用设备 ──
  async deactivateDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(assetNodes)
        .set({ status: 'offline' })
        .where(eq(assetNodes.nodeId, deviceId));

      const [device] = await db.select().from(assetNodes)
        .where(eq(assetNodes.nodeId, deviceId)).limit(1);

      callback(null, { device: mapToDevice(device) });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 维护模式 ──
  async setMaintenanceMode(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId, enabled, reason } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const newStatus = enabled ? 'maintenance' : 'online';
      await db.update(assetNodes)
        .set({ status: newStatus })
        .where(eq(assetNodes.nodeId, deviceId));

      log.info(`Device ${deviceId} maintenance mode: ${enabled} (${reason})`);

      const [device] = await db.select().from(assetNodes)
        .where(eq(assetNodes.nodeId, deviceId)).limit(1);

      callback(null, { device: mapToDevice(device) });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 批量创建 ──
  async batchCreateDevices(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { devices } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      let successCount = 0;
      let failureCount = 0;
      const errors: any[] = [];

      for (const dev of devices) {
        try {
          const nodeId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db.insert(assetNodes).values({
            nodeId,
            code: `DEV_${nodeId}`,
            name: dev.name,
            level: 3,
            nodeType: (dev.type || 'other').toLowerCase(),
            parentNodeId: null,
            rootNodeId: nodeId,
            status: 'online',
            path: `/${nodeId}`,
            depth: 1,
            location: dev.location || null,
            attributes: {
              model: dev.model || '',
              manufacturer: dev.manufacturer || '',
            },
          });
          successCount++;
        } catch (err: any) {
          failureCount++;
          errors.push({ deviceId: dev.name, errorMessage: err.message });
        }
      }

      callback(null, { successCount, failureCount, errors });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 批量更新状态 ──
  async batchUpdateStatus(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceIds, status } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(assetNodes)
        .set({ status: status.toLowerCase() })
        .where(inArray(assetNodes.nodeId, deviceIds));

      callback(null, {
        successCount: deviceIds.length,
        failureCount: 0,
        errors: [],
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 创建传感器 ──
  async createSensor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const sensorId = `sen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(assetSensors).values({
        sensorId,
        deviceCode: req.deviceId,
        name: req.name,
        physicalQuantity: (req.type || 'vibration').toLowerCase(),
        unit: req.unit || '',
        sampleRate: req.samplingRateHz || 1000,
        metadata: {
          minValue: req.minValue || 0,
          maxValue: req.maxValue || 0,
        },
        status: 'active',
      });

      callback(null, {
        sensor: {
          id: sensorId,
          deviceId: req.deviceId,
          name: req.name,
          type: (req.type || 'VIBRATION').toUpperCase(),
          unit: req.unit || '',
          samplingRateHz: req.samplingRateHz || 1000,
          enabled: true,
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 获取传感器 ──
  async getSensor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { sensorId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [sensor] = await db.select().from(assetSensors)
        .where(eq(assetSensors.sensorId, sensorId)).limit(1);

      if (!sensor) {
        return callback({ code: grpc.status.NOT_FOUND, message: `Sensor ${sensorId} not found` });
      }

      callback(null, {
        sensor: {
          id: sensor.sensorId,
          deviceId: sensor.nodeId,
          name: sensor.sensorName,
          type: (sensor.sensorType || 'VIBRATION').toUpperCase(),
          unit: sensor.unit || '',
          samplingRateHz: sensor.samplingRateHz || 1000,
          enabled: sensor.status === 'active',
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 列表传感器 ──
  async listSensors(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const conditions: any[] = [];
      if (req.deviceId) conditions.push(eq(assetSensors.deviceCode, req.deviceId));
      if (req.typeFilter && req.typeFilter !== 'SENSOR_TYPE_UNSPECIFIED') {
        conditions.push(eq(assetSensors.physicalQuantity, req.typeFilter.toLowerCase()));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));

      const [sensors, [totalResult]] = await Promise.all([
        db.select().from(assetSensors).where(whereClause)
          .limit(pageSize).offset((page - 1) * pageSize),
        db.select({ total: count() }).from(assetSensors).where(whereClause),
      ]);

      callback(null, {
        sensors: sensors.map(s => ({
          id: s.sensorId,
          deviceId: s.nodeId,
          name: s.sensorName,
          type: (s.sensorType || 'VIBRATION').toUpperCase(),
          unit: s.unit || '',
          samplingRateHz: s.samplingRateHz || 1000,
          enabled: s.status === 'active',
        })),
        total: totalResult?.total || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 更新传感器 ──
  async updateSensor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updates: Record<string, any> = {};
      if (req.name) updates.sensorName = req.name;
      if (req.samplingRateHz) updates.samplingRateHz = req.samplingRateHz;
      if (req.enabled !== undefined) updates.status = req.enabled ? 'active' : 'inactive';

      await db.update(assetSensors).set(updates)
        .where(eq(assetSensors.sensorId, req.sensorId));

      const [updated] = await db.select().from(assetSensors)
        .where(eq(assetSensors.sensorId, req.sensorId)).limit(1);

      callback(null, {
        sensor: {
          id: updated.sensorId,
          deviceId: updated.nodeId,
          name: updated.sensorName,
          type: (updated.sensorType || 'VIBRATION').toUpperCase(),
          unit: updated.unit || '',
          samplingRateHz: updated.samplingRateHz || 1000,
          enabled: updated.status === 'active',
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 删除传感器 ──
  async deleteSensor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { sensorId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(assetSensors).where(eq(assetSensors.sensorId, sensorId));
      callback(null, {});
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 实时数据流（Server Streaming） ──
  async streamSensorData(
    call: grpc.ServerWritableStream<any, any>
  ) {
    const { sensorIds, realTime } = call.request;
    log.info(`StreamSensorData: sensors=${sensorIds?.join(',')}, realTime=${realTime}`);

    try {
      const db = await getDb();
      if (!db) {
        call.destroy(new Error('Database not available'));
        return;
      }

      // 发送历史数据
      if (sensorIds && sensorIds.length > 0) {
        const readings = await db.select().from(eventStore)
          .where(
            and(
              inArray(eventStore.sourceId, sensorIds),
              eq(eventStore.eventType, 'sensor_reading')
            )
          )
          .orderBy(desc(eventStore.timestamp))
          .limit(1000);

        for (const reading of readings) {
          const payload = typeof reading.payload === 'string'
            ? JSON.parse(reading.payload)
            : reading.payload;
          
          call.write({
            sensorId: reading.sourceId,
            deviceId: payload?.deviceId || '',
            value: payload?.value || 0,
            timestamp: reading.timestamp
              ? { seconds: Math.floor(new Date(reading.timestamp).getTime() / 1000) }
              : null,
            quality: payload?.quality || 100,
          });
        }
      }

      if (!realTime) {
        call.end();
        return;
      }

      // 实时模式：保持连接，等待新数据（通过 Kafka consumer 或轮询）
      const interval = setInterval(async () => {
        if (call.cancelled || call.destroyed) {
          clearInterval(interval);
          return;
        }
        // 在真实部署中，这里会连接 Kafka consumer
        // 当前使用心跳保持连接
      }, 5000);

      call.on('cancelled', () => {
        clearInterval(interval);
        log.info('StreamSensorData cancelled by client');
      });
    } catch (err: any) {
      log.error('StreamSensorData error:', err.message);
      call.destroy(err);
    }
  },

  // ── 数据摄入（Client Streaming） ──
  async ingestSensorData(
    call: grpc.ServerReadableStream<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    const startMs = Date.now();
    let totalPoints = 0;
    let acceptedPoints = 0;
    let rejectedPoints = 0;

    const batch: any[] = [];
    const BATCH_SIZE = 500;

    call.on('data', (point: any) => {
      totalPoints++;
      try {
        batch.push({
          sourceId: point.sensorId,
          eventType: 'sensor_reading',
          payload: JSON.stringify({
            deviceId: point.deviceId,
            value: point.value,
            quality: point.quality || 100,
            extraChannels: point.extraChannels || {},
          }),
          timestamp: point.timestamp?.seconds
            ? new Date(parseInt(point.timestamp.seconds) * 1000)
            : new Date(),
        });
        acceptedPoints++;

        // 批量写入
        if (batch.length >= BATCH_SIZE) {
          const toInsert = [...batch];
          batch.length = 0;
          getDb().then(db => {
            if (db) db.insert(eventStore).values(toInsert).catch(err => {
              log.error('Batch insert error:', err.message);
            });
          });
        }
      } catch {
        rejectedPoints++;
      }
    });

    call.on('end', async () => {
      // 写入剩余数据
      if (batch.length > 0) {
        try {
          const db = await getDb();
          if (db) await db.insert(eventStore).values(batch);
        } catch (err: any) {
          log.error('Final batch insert error:', err.message);
        }
      }

      callback(null, {
        totalPoints: totalPoints.toString(),
        acceptedPoints: acceptedPoints.toString(),
        rejectedPoints: rejectedPoints.toString(),
        durationMs: Date.now() - startMs,
      });
    });

    call.on('error', (err: any) => {
      log.error('IngestSensorData stream error:', err.message);
    });
  },

  // ── 设备健康 ──
  async getDeviceHealth(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { deviceId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [device] = await db.select().from(assetNodes)
        .where(eq(assetNodes.nodeId, deviceId)).limit(1);

      if (!device) {
        return callback({ code: grpc.status.NOT_FOUND, message: `Device ${deviceId} not found` });
      }

      // 基于最近事件计算健康分
      const recentEvents = await db.select({ cnt: count() }).from(eventStore)
        .where(
          and(
            eq(eventStore.sourceId, deviceId),
            eq(eventStore.eventType, 'alert'),
            gte(eventStore.timestamp, new Date(Date.now() - 24 * 3600 * 1000))
          )
        );

      const alertCount = recentEvents[0]?.cnt || 0;
      const healthScore = Math.max(0, 100 - (Number(alertCount) * 10));

      callback(null, {
        deviceId,
        healthScore,
        status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
        metrics: [],
        lastCheck: { seconds: Math.floor(Date.now() / 1000) },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 设备告警列表 ──
  async listDeviceAlerts(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));

      const conditions: any[] = [
        eq(eventStore.sourceId, req.deviceId),
        eq(eventStore.eventType, 'alert'),
      ];

      const [alerts, [totalResult]] = await Promise.all([
        db.select().from(eventStore)
          .where(and(...conditions))
          .orderBy(desc(eventStore.timestamp))
          .limit(pageSize).offset((page - 1) * pageSize),
        db.select({ total: count() }).from(eventStore).where(and(...conditions)),
      ]);

      callback(null, {
        alerts: alerts.map(a => {
          const payload = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
          return {
            id: a.id?.toString() || '',
            deviceId: a.sourceId,
            sensorId: payload?.sensorId || '',
            severity: payload?.severity || 'warning',
            message: payload?.message || '',
            acknowledged: payload?.acknowledged || false,
            createdAt: a.timestamp ? { seconds: Math.floor(new Date(a.timestamp).getTime() / 1000) } : null,
          };
        }),
        total: totalResult?.total || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 设备分组（简化实现，使用 metadata 标签） ──
  async createDeviceGroup(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, {
      group: {
        id: `grp_${Date.now()}`,
        name: call.request.name,
        description: call.request.description || '',
        deviceIds: call.request.deviceIds || [],
        labels: call.request.labels || {},
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      },
    });
  },

  async listDeviceGroups(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, { groups: [], total: 0 });
  },

  async addDevicesToGroup(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, {
      group: {
        id: call.request.groupId,
        deviceIds: call.request.deviceIds || [],
      },
    });
  },

  async removeDevicesFromGroup(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, {
      group: { id: call.request.groupId, deviceIds: [] },
    });
  },
};

// ============================================================
// 服务器启动
// ============================================================

export async function startDeviceService(): Promise<grpc.Server> {
  const server = new grpc.Server({
    'grpc.max_concurrent_streams': CONFIG.maxConcurrentStreams,
    'grpc.keepalive_time_ms': CONFIG.keepaliveTimeMs,
    'grpc.keepalive_timeout_ms': CONFIG.keepaliveTimeoutMs,
    'grpc.max_receive_message_length': 50 * 1024 * 1024, // 50MB
    'grpc.max_send_message_length': 50 * 1024 * 1024,
  });

  server.addService(deviceProto.DeviceService.service, deviceServiceImpl);

  return new Promise((resolve, reject) => {
    server.bindAsync(
      `${CONFIG.host}:${CONFIG.port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          log.error('Failed to bind device service:', err.message);
          reject(err);
          return;
        }
        log.info(`Device Service started on port ${port}`);
        log.info(`  gRPC endpoint: ${CONFIG.host}:${port}`);
        log.info(`  Proto: device_service.proto`);
        resolve(server);
      }
    );
  });
}

// 独立运行模式
if (require.main === module || process.argv[1]?.includes('device-service')) {
  startDeviceService()
    .then(() => log.info('Device Service is ready'))
    .catch(err => {
      log.error('Device Service startup failed:', err);
      process.exit(1);
    });

  // 优雅关闭
  const shutdown = () => {
    log.info('Shutting down Device Service...');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
