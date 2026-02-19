/**
 * 流处理模块 - 模拟 Flink 实时计算
 * 实现滑动窗口异常检测、数据聚合等功能
 */

import { eventBus, TOPICS, Event } from './eventBus.service';
import { getDb } from '../lib/db';
import {

  detectZScore as anomalyEngineDetectZScore,
  detectIQR as anomalyEngineDetectIQR,
  detectMAD as anomalyEngineDetectMAD,
  determineSeverity as anomalyEngineDetermineSeverity,
} from '../lib/dataflow/anomalyEngine';
import { 
  assetNodes,
  assetSensors, 
  eventStore,
  anomalyDetections,
} from '../../drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

// ============ 类型定义 ============

export interface WindowState {
  sensorId: string;
  values: Array<{ value: number; timestamp: Date }>;
  windowSize: number; // 秒
  slideInterval: number; // 秒
  lastProcessed: Date;
}

// ============ 滑动窗口管理器 ============

class SlidingWindowManager {
  private windows: Map<string, WindowState> = new Map();
  private defaultWindowSize: number = 60; // 60秒
  private defaultSlideInterval: number = 10; // 10秒

  /**
   * 添加数据点到窗口
   */
  addDataPoint(sensorId: string, value: number, timestamp: Date = new Date()): void {
    if (!this.windows.has(sensorId)) {
      this.windows.set(sensorId, {
        sensorId,
        values: [],
        windowSize: this.defaultWindowSize,
        slideInterval: this.defaultSlideInterval,
        lastProcessed: new Date(0),
      });
    }

    const window = this.windows.get(sensorId)!;
    window.values.push({ value, timestamp });

    // 清理过期数据
    const cutoff = new Date(timestamp.getTime() - window.windowSize * 1000);
    window.values = window.values.filter(v => v.timestamp > cutoff);
  }

  /**
   * 获取窗口数据
   */
  getWindowData(sensorId: string): Array<{ value: number; timestamp: Date }> {
    return this.windows.get(sensorId)?.values || [];
  }

  /**
   * 获取窗口统计
   */
  getWindowStats(sensorId: string): {
    count: number;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  } | null {
    const data = this.getWindowData(sensorId);
    if (data.length === 0) return null;

    const values = data.map(d => d.value);
    const count = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / count;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { count, mean, stdDev, min, max };
  }

  /**
   * 检查是否需要处理
   */
  shouldProcess(sensorId: string): boolean {
    const window = this.windows.get(sensorId);
    if (!window) return false;

    const now = new Date();
    const timeSinceLastProcess = (now.getTime() - window.lastProcessed.getTime()) / 1000;
    return timeSinceLastProcess >= window.slideInterval;
  }

  /**
   * 标记已处理
   */
  markProcessed(sensorId: string): void {
    const window = this.windows.get(sensorId);
    if (window) {
      window.lastProcessed = new Date();
    }
  }

  /**
   * 设置窗口参数
   */
  setWindowParams(sensorId: string, windowSize: number, slideInterval: number): void {
    const window = this.windows.get(sensorId);
    if (window) {
      window.windowSize = windowSize;
      window.slideInterval = slideInterval;
    }
  }

  /**
   * 获取所有活跃窗口
   */
  getActiveWindows(): string[] {
    return Array.from(this.windows.keys());
  }

  /**
   * 清理窗口
   */
  clearWindow(sensorId: string): void {
    this.windows.delete(sensorId);
  }
}

// ============ 异常检测算法 ============

/**
 * AnomalyDetector — 委托给统一异常检测引擎
 * @see server/lib/dataflow/anomalyEngine.ts
 */
class AnomalyDetector {
  detectZScore(
    currentValue: number,
    mean: number,
    stdDev: number,
    threshold: number = 3
  ): { isAnomaly: boolean; score: number; deviation: number } {
    return anomalyEngineDetectZScore(currentValue, mean, stdDev, threshold);
  }

  detectIQR(
    currentValue: number,
    values: number[],
    multiplier: number = 1.5
  ): { isAnomaly: boolean; score: number; deviation: number } {
    return anomalyEngineDetectIQR(currentValue, values, multiplier);
  }

  detectMAD(
    currentValue: number,
    values: number[],
    threshold: number = 3.5
  ): { isAnomaly: boolean; score: number; deviation: number } {
    return anomalyEngineDetectMAD(currentValue, values, threshold);
  }

  determineSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    return anomalyEngineDetermineSeverity(score);
  }
}

// ============ 流处理器 ============

class StreamProcessor {
  private windowManager: SlidingWindowManager;
  private anomalyDetector: AnomalyDetector;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private aggregateInterval: NodeJS.Timeout | null = null;
  private metrics: {
    processedReadings: number;
    detectedAnomalies: number;
    aggregationsCreated: number;
    lastProcessTime: Date | null;
  };

  constructor() {
    this.windowManager = new SlidingWindowManager();
    this.anomalyDetector = new AnomalyDetector();
    this.metrics = {
      processedReadings: 0,
      detectedAnomalies: 0,
      aggregationsCreated: 0,
      lastProcessTime: null,
    };
  }

  /**
   * 启动流处理器
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 订阅传感器数据事件
    eventBus.subscribe(TOPICS.SENSOR_READING, async (event) => {
      await this.processReading(event as any);
    });

    // 定期处理窗口
    this.processInterval = setInterval(() => {
      this.processWindows();
    }, 5000); // 每5秒处理一次

    // 定期生成聚合
    this.aggregateInterval = setInterval(() => {
      this.generateAggregates();
    }, 60000); // 每分钟生成一次聚合

    log.debug('[StreamProcessor] Started');
  }

  /**
   * 停止流处理器
   */
  stop(): void {
    this.isRunning = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    if (this.aggregateInterval) {
      clearInterval(this.aggregateInterval);
      this.aggregateInterval = null;
    }
    log.debug('[StreamProcessor] Stopped');
  }

  /**
   * 处理单个传感器读数
   */
  async processReading(event: Event): Promise<void> {
    const payload = event.payload as {
      sensorId: string;
      deviceCode?: string;
      deviceId?: string;  // @deprecated 兼容旧数据源
      value: number;
      timestamp?: string;
    };
    const { sensorId, value, timestamp } = payload;
    // 优先 deviceCode，回退 deviceId
    const deviceCode = payload.deviceCode || payload.deviceId;

    if (!sensorId || !deviceCode || value === undefined) return;

    const ts = timestamp ? new Date(timestamp) : new Date();
    
    // 添加到滑动窗口
    this.windowManager.addDataPoint(sensorId, value, ts);
    
    // 持久化读数
    await this.persistReading(sensorId, deviceCode, value, ts);
    
    this.metrics.processedReadings++;
    this.metrics.lastProcessTime = new Date();
  }

  /**
   * 处理所有活跃窗口
   */
  private async processWindows(): Promise<void> {
    const activeWindows = this.windowManager.getActiveWindows();
    
    for (const sensorId of activeWindows) {
      if (!this.windowManager.shouldProcess(sensorId)) continue;
      
      const stats = this.windowManager.getWindowStats(sensorId);
      if (!stats || stats.count < 5) continue;

      const data = this.windowManager.getWindowData(sensorId);
      const latestValue = data[data.length - 1]?.value;
      if (latestValue === undefined) continue;

      // 执行异常检测
      const zScoreResult = this.anomalyDetector.detectZScore(
        latestValue,
        stats.mean,
        stats.stdDev
      );

      if (zScoreResult.isAnomaly) {
        const severity = this.anomalyDetector.determineSeverity(zScoreResult.score);
        
        // 获取设备编码
        const deviceCode = await this.getDeviceCodeForSensor(sensorId);
        
        // 记录异常
        await this.recordAnomaly({
          sensorId,
          deviceCode: deviceCode || 'unknown',
          deviceId: deviceCode || 'unknown', // @deprecated 向后兼容
          isAnomaly: true,
          algorithm: 'zscore',
          currentValue: latestValue,
          expectedValue: stats.mean,
          deviation: zScoreResult.deviation,
          score: zScoreResult.score,
          severity,
          timestamp: new Date(),
        });

        // 发布异常事件
        await eventBus.publish(
          TOPICS.ANOMALY_DETECTED,
          'anomaly_detected',
          {
            sensorId,
            deviceCode,
            deviceId: deviceCode, // @deprecated 向后兼容，下游消费者应迁移到 deviceCode
            value: latestValue,
            expectedValue: stats.mean,
            deviation: zScoreResult.deviation,
            score: zScoreResult.score,
            severity,
          },
          { severity: severity === 'critical' ? 'critical' : 'warning', sensorId, nodeId: deviceCode || undefined }
        );

        this.metrics.detectedAnomalies++;
      }

      this.windowManager.markProcessed(sensorId);
    }
  }

  /**
   * 生成聚合数据
   */
  private async generateAggregates(): Promise<void> {
    const activeWindows = this.windowManager.getActiveWindows();
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    for (const sensorId of activeWindows) {
      const stats = this.windowManager.getWindowStats(sensorId);
      if (!stats || stats.count === 0) continue;

      const deviceCode = await this.getDeviceCodeForSensor(sensorId);
      
      await this.saveAggregate({
        sensorId,
        deviceCode: deviceCode || 'unknown',
        period: '1m',
        periodStart,
        avg: stats.mean,
        min: stats.min,
        max: stats.max,
        sum: stats.mean * stats.count,
        count: stats.count,
        stdDev: stats.stdDev,
      });

      this.metrics.aggregationsCreated++;
    }
  }

  /**
   * 持久化传感器读数
   */
  private async persistReading(
    sensorId: string,
    deviceCode: string,
    value: number,
    timestamp: Date
  ): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db.insert(eventStore).values({
        eventId: `evt_sr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'sensor_reading',
        eventVersion: 1,
        aggregateType: 'sensor',
        aggregateId: sensorId,
        aggregateVersion: Date.now(),
        payload: JSON.stringify({
          sensorId,
          deviceCode,
          value: Math.round(value * 100),
          quality: 'good',
        }),
        occurredAt: timestamp,
        recordedAt: new Date(),
      });
    } catch (error) {
      log.error('[StreamProcessor] Failed to persist reading:', error);
    }
  }

  /**
   * 记录异常检测结果
   */
  private async recordAnomaly(result: AnomalyResult): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db.insert(anomalyDetections).values({
        detectionId: `anom_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sensorId: result.sensorId || '',
        nodeId: result.nodeId || result.deviceId || '',
        algorithmType: (result.algorithm || 'zscore') as 'zscore' | 'iqr' | 'mad' | 'isolation_forest' | 'custom',
        windowSize: 60,
        threshold: 300, // 3.0 * 100
        currentValue: Math.round((result.currentValue ?? 0) * 100),
        expectedValue: Math.round((result.expectedValue ?? 0) * 100),
        deviation: Math.round((result.deviation ?? 0) * 100),
        score: Math.round(result.score * 100),
        severity: (result.severity || 'low') as 'low' | 'medium' | 'high' | 'critical',
        status: 'open' as 'open' | 'acknowledged' | 'resolved' | 'false_positive',
        createdAt: result.timestamp instanceof Date ? result.timestamp : new Date(result.timestamp || Date.now()),
      });
    } catch (error) {
      log.error('[StreamProcessor] Failed to record anomaly:', error);
    }
  }

  /**
   * 保存聚合数据
   */
  private async saveAggregate(result: AggregateResult): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db.insert(eventStore).values({
        eventId: `evt_agg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'aggregation_result',
        eventVersion: 1,
        aggregateType: 'sensor',
        aggregateId: result.sensorId || '',
        aggregateVersion: Date.now(),
        payload: JSON.stringify({
          sensorId: result.sensorId,
          deviceCode: result.deviceCode || result.deviceId,  // 优先 deviceCode，回退 deviceId（兼容旧调用方）
          period: result.period,
          periodStart: result.periodStart?.toISOString(),
          avg: result.avg,
          min: result.min,
          max: result.max,
          sum: result.sum,
          count: result.count,
          stdDev: result.stdDev,
        }),
        occurredAt: result.periodStart || new Date(),
        recordedAt: new Date(),
      });
    } catch (error) {
      log.error('[StreamProcessor] Failed to save aggregate:', error);
    }
  }

  /**
   * 获取传感器对应的设备编码（deviceCode）
   * 传感器通过 asset_sensors.device_code 关联设备
   */
  private async getDeviceCodeForSensor(sensorId: string): Promise<string | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      
      const result = await db
        .select({ deviceCode: assetSensors.deviceCode })
        .from(assetSensors)
        .where(eq(assetSensors.sensorId, sensorId))
        .limit(1);
      
      return result[0]?.deviceCode || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 手动触发异常检测
   */
  async detectAnomalies(
    sensorId: string,
    algorithm: 'zscore' | 'iqr' | 'mad' = 'zscore'
  ): Promise<AnomalyResult | null> {
    const stats = this.windowManager.getWindowStats(sensorId);
    if (!stats || stats.count < 5) return null;

    const data = this.windowManager.getWindowData(sensorId);
    const latestValue = data[data.length - 1]?.value;
    if (latestValue === undefined) return null;

    const values = data.map(d => d.value);
    let result: { isAnomaly: boolean; score: number; deviation: number };

    switch (algorithm) {
      case 'iqr':
        result = this.anomalyDetector.detectIQR(latestValue, values);
        break;
      case 'mad':
        result = this.anomalyDetector.detectMAD(latestValue, values);
        break;
      default:
        result = this.anomalyDetector.detectZScore(latestValue, stats.mean, stats.stdDev);
    }

    if (!result.isAnomaly) return null;

    const deviceCode = await this.getDeviceCodeForSensor(sensorId);
    const severity = this.anomalyDetector.determineSeverity(result.score);

    return {
      sensorId,
      deviceId: deviceCode || 'unknown',
      isAnomaly: true,
      algorithm,
      currentValue: latestValue,
      expectedValue: stats.mean,
      deviation: result.deviation,
      score: result.score,
      severity,
      timestamp: new Date(),
    };
  }

  /**
   * 获取处理指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      activeWindows: this.windowManager.getActiveWindows().length,
    };
  }

  /**
   * 获取窗口统计
   */
  getWindowStats(sensorId: string) {
    return this.windowManager.getWindowStats(sensorId);
  }

  /**
   * 添加数据点（用于测试）
   */
  addDataPoint(sensorId: string, value: number, timestamp?: Date): void {
    this.windowManager.addDataPoint(sensorId, value, timestamp);
  }
}

// ============ 单例导出 ============

export const streamProcessor = new StreamProcessor();

// ============ tRPC 路由 ============

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import type { SensorReading, AnomalyResult, AggregateResult } from "../core/types/domain";
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('streamProcessor');

export const streamProcessorRouter = router({
  // 获取处理指标
  getMetrics: publicProcedure.query(async () => {
    return streamProcessor.getMetrics();
  }),

  // 获取窗口统计
  getWindowStats: publicProcedure
    .input(z.object({ sensorId: z.string() }))
    .query(async ({ input }) => {
      return streamProcessor.getWindowStats(input.sensorId);
    }),

  // 手动触发异常检测
  detectAnomalies: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      algorithm: z.enum(['zscore', 'iqr', 'mad']).default('zscore'),
    }))
    .mutation(async ({ input }) => {
      return streamProcessor.detectAnomalies(input.sensorId, input.algorithm);
    }),

  // 启动/停止处理器
  setRunning: protectedProcedure
    .input(z.object({ running: z.boolean() }))
    .mutation(async ({ input }) => {
      if (input.running) {
        streamProcessor.start();
      } else {
        streamProcessor.stop();
      }
      return { success: true, isRunning: input.running };
    }),

  // 添加测试数据点
  addTestDataPoint: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      value: z.number(),
    }))
    .mutation(async ({ input }) => {
      streamProcessor.addDataPoint(input.sensorId, input.value);
      
      // 同时发布事件
      await eventBus.publish(
        TOPICS.SENSOR_READING,
        'reading',
        {
          sensorId: input.sensorId,
          deviceId: 'test_device',
          value: input.value,
          timestamp: new Date().toISOString(),
        },
        { source: 'test', sensorId: input.sensorId, deviceId: undefined }
      );
      
      return { success: true };
    }),

  // 获取最近异常
  getRecentAnomalies: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      sensorId: z.string().optional(),
      status: z.enum(['open', 'acknowledged', 'resolved', 'false_positive']).optional(),
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return [];
        
        const conditions = [];
        if (input.sensorId) {
          conditions.push(eq(anomalyDetections.sensorId, input.sensorId));
        }
        if (input.status) {
          conditions.push(eq(anomalyDetections.status, input.status));
        }

        const query = db
          .select()
          .from(anomalyDetections)
          .orderBy(desc(anomalyDetections.createdAt))
          .limit(input.limit);

        if (conditions.length > 0) {
          // @ts-ignore
          query.where(and(...conditions));
        }

        const results = await query;
        
        return results.map(r => ({
          ...r,
          currentValue: r.currentValue ? r.currentValue / 100 : null,
          expectedValue: r.expectedValue ? r.expectedValue / 100 : null,
          deviation: r.deviation ? r.deviation / 100 : null,
          score: r.score ? r.score / 100 : null,
        }));
      } catch (error) {
        log.error('[StreamProcessor] Failed to get anomalies:', error);
        return [];
      }
    }),

  // 更新异常状态
  updateAnomalyStatus: protectedProcedure
    .input(z.object({
      detectionId: z.string(),
      status: z.enum(['open', 'acknowledged', 'resolved', 'false_positive']),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { success: false };
        
        const updateData: Record<string, unknown> = {
          status: input.status,
          updatedAt: new Date(),
        };
        
        if (input.status === 'acknowledged') {
          updateData.acknowledgedBy = ctx.user?.name || 'unknown';
          updateData.acknowledgedAt = new Date();
        }
        if (input.status === 'resolved') {
          updateData.resolvedAt = new Date();
        }
        if (input.notes) {
          updateData.notes = input.notes;
        }

        await db
          .update(anomalyDetections)
          .set(updateData)
          .where(eq(anomalyDetections.detectionId, input.detectionId));

        return { success: true };
      } catch (error) {
        log.error('[StreamProcessor] Failed to update anomaly:', error);
        return { success: false };
      }
    }),
});

export type StreamProcessorRouter = typeof streamProcessorRouter;
