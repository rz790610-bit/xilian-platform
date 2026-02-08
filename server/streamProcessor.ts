/**
 * 流处理模块 - 模拟 Flink 实时计算
 * 实现滑动窗口异常检测、数据聚合等功能
 */

import { eventBus, TOPICS, Event } from './eventBus';
import { getDb } from './db';
import { 
  sensors, 
  sensorReadings, 
  sensorAggregates, 
  anomalyDetections,
  devices 
} from '../drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

// ============ 类型定义 ============

export interface SensorReading {
  sensorId: string;
  deviceId: string;
  value: number;
  timestamp: Date;
  quality?: 'good' | 'uncertain' | 'bad';
}

export interface WindowState {
  sensorId: string;
  values: Array<{ value: number; timestamp: Date }>;
  windowSize: number; // 秒
  slideInterval: number; // 秒
  lastProcessed: Date;
}

export interface AnomalyResult {
  sensorId: string;
  deviceId: string;
  algorithmType: 'zscore' | 'iqr' | 'mad' | 'isolation_forest' | 'custom';
  currentValue: number;
  expectedValue: number;
  deviation: number;
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

export interface AggregateResult {
  sensorId: string;
  deviceId: string;
  period: '1m' | '5m' | '1h' | '1d';
  periodStart: Date;
  avg: number;
  min: number;
  max: number;
  sum: number;
  count: number;
  stdDev: number;
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

class AnomalyDetector {
  /**
   * Z-Score 异常检测
   */
  detectZScore(
    currentValue: number,
    mean: number,
    stdDev: number,
    threshold: number = 3
  ): { isAnomaly: boolean; score: number; deviation: number } {
    if (stdDev === 0) {
      return { isAnomaly: false, score: 0, deviation: 0 };
    }
    
    const zScore = Math.abs((currentValue - mean) / stdDev);
    const deviation = currentValue - mean;
    
    return {
      isAnomaly: zScore > threshold,
      score: zScore,
      deviation,
    };
  }

  /**
   * IQR (四分位距) 异常检测
   */
  detectIQR(
    currentValue: number,
    values: number[],
    multiplier: number = 1.5
  ): { isAnomaly: boolean; score: number; deviation: number } {
    if (values.length < 4) {
      return { isAnomaly: false, score: 0, deviation: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;
    const median = sorted[Math.floor(sorted.length * 0.5)];

    const isAnomaly = currentValue < lowerBound || currentValue > upperBound;
    const deviation = currentValue - median;
    const score = iqr > 0 ? Math.abs(deviation) / iqr : 0;

    return { isAnomaly, score, deviation };
  }

  /**
   * MAD (中位数绝对偏差) 异常检测
   */
  detectMAD(
    currentValue: number,
    values: number[],
    threshold: number = 3.5
  ): { isAnomaly: boolean; score: number; deviation: number } {
    if (values.length < 3) {
      return { isAnomaly: false, score: 0, deviation: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const absoluteDeviations = values.map(v => Math.abs(v - median));
    const sortedDeviations = [...absoluteDeviations].sort((a, b) => a - b);
    const mad = sortedDeviations[Math.floor(sortedDeviations.length / 2)];

    if (mad === 0) {
      return { isAnomaly: false, score: 0, deviation: currentValue - median };
    }

    const modifiedZScore = 0.6745 * (currentValue - median) / mad;
    const score = Math.abs(modifiedZScore);
    const deviation = currentValue - median;

    return {
      isAnomaly: score > threshold,
      score,
      deviation,
    };
  }

  /**
   * 确定异常严重程度
   */
  determineSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 5) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
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
      await this.processReading(event);
    });

    // 定期处理窗口
    this.processInterval = setInterval(() => {
      this.processWindows();
    }, 5000); // 每5秒处理一次

    // 定期生成聚合
    this.aggregateInterval = setInterval(() => {
      this.generateAggregates();
    }, 60000); // 每分钟生成一次聚合

    console.log('[StreamProcessor] Started');
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
    console.log('[StreamProcessor] Stopped');
  }

  /**
   * 处理单个传感器读数
   */
  async processReading(event: Event): Promise<void> {
    const { sensorId, deviceId, value, timestamp } = event.payload as {
      sensorId: string;
      deviceId: string;
      value: number;
      timestamp?: string;
    };

    if (!sensorId || !deviceId || value === undefined) return;

    const ts = timestamp ? new Date(timestamp) : new Date();
    
    // 添加到滑动窗口
    this.windowManager.addDataPoint(sensorId, value, ts);
    
    // 持久化读数
    await this.persistReading(sensorId, deviceId, value, ts);
    
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
        
        // 获取设备ID
        const deviceId = await this.getDeviceIdForSensor(sensorId);
        
        // 记录异常
        await this.recordAnomaly({
          sensorId,
          deviceId: deviceId || 'unknown',
          algorithmType: 'zscore',
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
            deviceId,
            value: latestValue,
            expectedValue: stats.mean,
            deviation: zScoreResult.deviation,
            score: zScoreResult.score,
            severity,
          },
          { severity: severity === 'critical' ? 'critical' : 'warning', sensorId, deviceId: deviceId || undefined }
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

      const deviceId = await this.getDeviceIdForSensor(sensorId);
      
      await this.saveAggregate({
        sensorId,
        deviceId: deviceId || 'unknown',
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
    deviceId: string,
    value: number,
    timestamp: Date
  ): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db.insert(sensorReadings).values({
        sensorId,
        deviceId,
        value: String(value),
        numericValue: Math.round(value * 100), // 存储为整数（乘100）
        quality: 'good',
        timestamp,
      });
    } catch (error) {
      console.error('[StreamProcessor] Failed to persist reading:', error);
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
        sensorId: result.sensorId,
        deviceId: result.deviceId,
        algorithmType: result.algorithmType,
        windowSize: 60,
        threshold: 300, // 3.0 * 100
        currentValue: Math.round(result.currentValue * 100),
        expectedValue: Math.round(result.expectedValue * 100),
        deviation: Math.round(result.deviation * 100),
        score: Math.round(result.score * 100),
        severity: result.severity,
        status: 'open',
        createdAt: result.timestamp,
      });
    } catch (error) {
      console.error('[StreamProcessor] Failed to record anomaly:', error);
    }
  }

  /**
   * 保存聚合数据
   */
  private async saveAggregate(result: AggregateResult): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db.insert(sensorAggregates).values({
        sensorId: result.sensorId,
        deviceId: result.deviceId,
        period: result.period,
        periodStart: result.periodStart,
        avgValue: Math.round(result.avg * 100),
        minValue: Math.round(result.min * 100),
        maxValue: Math.round(result.max * 100),
        sumValue: Math.round(result.sum * 100),
        count: result.count,
        stdDev: Math.round(result.stdDev * 100),
      });
    } catch (error) {
      console.error('[StreamProcessor] Failed to save aggregate:', error);
    }
  }

  /**
   * 获取传感器对应的设备ID
   */
  private async getDeviceIdForSensor(sensorId: string): Promise<string | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      
      const result = await db
        .select({ deviceId: assetSensors.deviceId })
        .from(assetSensors)
        .where(eq(assetSensors.sensorId, sensorId))
        .limit(1);
      
      return result[0]?.deviceId || null;
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

    const deviceId = await this.getDeviceIdForSensor(sensorId);
    const severity = this.anomalyDetector.determineSeverity(result.score);

    return {
      sensorId,
      deviceId: deviceId || 'unknown',
      algorithmType: algorithm,
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
import { publicProcedure, protectedProcedure, router } from './_core/trpc';

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
        console.error('[StreamProcessor] Failed to get anomalies:', error);
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
        console.error('[StreamProcessor] Failed to update anomaly:', error);
        return { success: false };
      }
    }),
});

export type StreamProcessorRouter = typeof streamProcessorRouter;
