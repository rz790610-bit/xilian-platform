/**
 * ClickHouse 时序数据库 tRPC 路由
 */

import { z } from 'zod';
import type { SensorReading } from '../core/types/domain';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { clickhouseClient } from '../lib/clients/clickhouse.client';

export const clickhouseRouter = router({
  // 健康检查
  healthCheck: publicProcedure.query(async () => {
    const connected = await clickhouseClient.checkConnection();
    const stats = connected ? await clickhouseClient.getDatabaseStats() : null;
    
    return {
      connected,
      stats,
    };
  }),

  // 获取数据库统计
  getStats: protectedProcedure.query(async () => {
    return clickhouseClient.getDatabaseStats();
  }),

  // 写入传感器读数
  insertSensorReadings: protectedProcedure
    .input(z.object({
      readings: z.array(z.object({
        device_id: z.string(),
        sensor_id: z.string(),
        metric_name: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        quality: z.enum(['good', 'uncertain', 'bad']).optional(),
        timestamp: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const readings: SensorReading[] = input.readings.map(r => ({
        sensorId: r.sensor_id, deviceId: r.device_id, metricName: r.metric_name, value: r.value, unit: r.unit, quality: r.quality, metadata: r.metadata as Record<string, unknown>,
        timestamp: new Date(r.timestamp),
      }));
      await clickhouseClient.insertSensorReadings(readings);
      return { success: true, count: input.readings.length };
    }),

  // 写入遥测数据
  insertTelemetryData: protectedProcedure
    .input(z.object({
      data: z.array(z.object({
        device_id: z.string(),
        sensor_id: z.string(),
        metric_name: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        quality: z.enum(['good', 'uncertain', 'bad']).optional(),
        timestamp: z.string().transform(s => new Date(s)),
        batch_id: z.string().optional(),
        source: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      await clickhouseClient.insertTelemetryData(input.data);
      return { success: true, count: input.data.length };
    }),

  // 查询传感器读数
  querySensorReadings: protectedProcedure
    .input(z.object({
      startTime: z.string().transform(s => new Date(s)).optional(),
      endTime: z.string().transform(s => new Date(s)).optional(),
      deviceIds: z.array(z.string()).optional(),
      sensorIds: z.array(z.string()).optional(),
      metricNames: z.array(z.string()).optional(),
      limit: z.number().min(1).max(10000).default(1000),
      offset: z.number().min(0).default(0),
      orderBy: z.enum(['asc', 'desc']).default('desc'),
    }))
    .query(async ({ input }) => {
      return clickhouseClient.querySensorReadings(input);
    }),

  // 查询聚合数据
  queryAggregatedData: protectedProcedure
    .input(z.object({
      interval: z.enum(['1m', '5m', '1h', '1d']),
      startTime: z.string().transform(s => new Date(s)).optional(),
      endTime: z.string().transform(s => new Date(s)).optional(),
      deviceIds: z.array(z.string()).optional(),
      sensorIds: z.array(z.string()).optional(),
      limit: z.number().min(1).max(10000).default(1000),
      orderBy: z.enum(['asc', 'desc']).default('desc'),
    }))
    .query(async ({ input }) => {
      return clickhouseClient.queryAggregatedData(input);
    }),

  // 查询异常检测结果
  queryAnomalies: protectedProcedure
    .input(z.object({
      startTime: z.string().transform(s => new Date(s)).optional(),
      endTime: z.string().transform(s => new Date(s)).optional(),
      deviceIds: z.array(z.string()).optional(),
      severity: z.array(z.enum(['low', 'medium', 'high', 'critical'])).optional(),
      limit: z.number().min(1).max(10000).default(100),
    }))
    .query(async ({ input }) => {
      return clickhouseClient.queryAnomalies(input);
    }),

  // 获取设备统计
  getDeviceStats: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      startTime: z.string().transform(s => new Date(s)),
      endTime: z.string().transform(s => new Date(s)),
    }))
    .query(async ({ input }) => {
      return clickhouseClient.getDeviceStats(input.deviceId, {
        start: input.startTime,
        end: input.endTime,
      });
    }),

  // 写入异常检测结果
  insertAnomalyDetection: protectedProcedure
    .input(z.object({
      detection_id: z.string(),
      device_id: z.string(),
      sensor_id: z.string(),
      metric_name: z.string(),
      algorithm_type: z.enum(['zscore', 'iqr', 'mad', 'isolation_forest', 'custom']),
      current_value: z.number(),
      expected_value: z.number(),
      deviation: z.number(),
      score: z.number(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      is_acknowledged: z.boolean().optional(),
      timestamp: z.string().transform(s => new Date(s)),
    }))
    .mutation(async ({ input }) => {
      await clickhouseClient.insertAnomalyDetection(input);
      return { success: true };
    }),
});

export type ClickHouseRouter = typeof clickhouseRouter;
