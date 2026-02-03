/**
 * 基于 Kafka Streams 模式的实时流处理器
 * 实现滑动窗口异常检测、数据聚合等流处理功能
 */

import { kafkaClient, KAFKA_TOPICS, KafkaMessage, MessageHandler } from './kafkaClient';
import { getDb } from '../db';
import { anomalyDetections, dataAggregations, telemetryData } from '../../drizzle/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

// 流处理配置
export interface StreamProcessorConfig {
  windowSizeMs: number;       // 窗口大小（毫秒）
  slideIntervalMs: number;    // 滑动间隔（毫秒）
  anomalyThreshold: number;   // 异常阈值（Z-Score）
  aggregationIntervalMs: number; // 聚合间隔
}

// 默认配置
const DEFAULT_CONFIG: StreamProcessorConfig = {
  windowSizeMs: 60000,        // 1分钟窗口
  slideIntervalMs: 10000,     // 10秒滑动
  anomalyThreshold: 3.0,      // 3个标准差
  aggregationIntervalMs: 60000, // 1分钟聚合
};

// 数据点结构
interface DataPoint {
  timestamp: number;
  value: number;
  deviceId: string;
  sensorId: string;
  metricName: string;
}

// 窗口数据结构
interface WindowData {
  points: DataPoint[];
  startTime: number;
  endTime: number;
}

// 异常检测结果
interface AnomalyResult {
  isAnomaly: boolean;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  threshold: number;
  timestamp: number;
  deviceId: string;
  sensorId: string;
  metricName: string;
}

// 聚合结果
interface AggregationResult {
  deviceId: string;
  sensorId: string;
  metricName: string;
  windowStart: number;
  windowEnd: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
}

/**
 * Kafka Streams 风格的流处理器
 */
export class KafkaStreamProcessor {
  private config: StreamProcessorConfig;
  private windows: Map<string, WindowData> = new Map();
  private aggregationBuffer: Map<string, DataPoint[]> = new Map();
  private isRunning: boolean = false;
  private slideTimer: NodeJS.Timeout | null = null;
  private aggregationTimer: NodeJS.Timeout | null = null;
  private anomalyHandlers: ((result: AnomalyResult) => void)[] = [];
  private aggregationHandlers: ((result: AggregationResult) => void)[] = [];

  constructor(config: Partial<StreamProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动流处理器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[KafkaStreamProcessor] 已在运行中');
      return;
    }

    console.log('[KafkaStreamProcessor] 启动流处理器...');
    this.isRunning = true;

    // 订阅遥测数据主题
    await kafkaClient.subscribe(
      'stream-processor-group',
      [KAFKA_TOPICS.TELEMETRY],
      this.handleTelemetryMessage.bind(this)
    );

    // 启动滑动窗口定时器
    this.slideTimer = setInterval(
      () => this.slideWindows(),
      this.config.slideIntervalMs
    );

    // 启动聚合定时器
    this.aggregationTimer = setInterval(
      () => this.flushAggregations(),
      this.config.aggregationIntervalMs
    );

    console.log('[KafkaStreamProcessor] 流处理器已启动');
  }

  /**
   * 停止流处理器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[KafkaStreamProcessor] 停止流处理器...');
    this.isRunning = false;

    if (this.slideTimer) {
      clearInterval(this.slideTimer);
      this.slideTimer = null;
    }

    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    // 刷新剩余数据
    await this.flushAggregations();

    console.log('[KafkaStreamProcessor] 流处理器已停止');
  }

  /**
   * 处理遥测消息
   */
  private async handleTelemetryMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    try {
      if (!message.value) return;
      const data = JSON.parse(message.value);
      const dataPoint: DataPoint = {
        timestamp: data.timestamp || Date.now(),
        value: data.value,
        deviceId: data.deviceId,
        sensorId: data.sensorId,
        metricName: data.metricName || 'default',
      };

      // 添加到窗口
      this.addToWindow(dataPoint);

      // 添加到聚合缓冲
      this.addToAggregationBuffer(dataPoint);

      // 实时异常检测
      const anomalyResult = this.detectAnomaly(dataPoint);
      if (anomalyResult.isAnomaly) {
        await this.handleAnomaly(anomalyResult);
      }
    } catch (error) {
      console.error('[KafkaStreamProcessor] 处理消息失败:', error);
    }
  }

  /**
   * 添加数据点到窗口
   */
  private addToWindow(point: DataPoint): void {
    const windowKey = `${point.deviceId}:${point.sensorId}:${point.metricName}`;
    const now = Date.now();

    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, {
        points: [],
        startTime: now - this.config.windowSizeMs,
        endTime: now,
      });
    }

    const window = this.windows.get(windowKey)!;
    window.points.push(point);
    window.endTime = now;

    // 清理过期数据
    const cutoffTime = now - this.config.windowSizeMs;
    window.points = window.points.filter(p => p.timestamp >= cutoffTime);
    window.startTime = cutoffTime;
  }

  /**
   * 添加到聚合缓冲
   */
  private addToAggregationBuffer(point: DataPoint): void {
    const bufferKey = `${point.deviceId}:${point.sensorId}:${point.metricName}`;
    
    if (!this.aggregationBuffer.has(bufferKey)) {
      this.aggregationBuffer.set(bufferKey, []);
    }

    this.aggregationBuffer.get(bufferKey)!.push(point);
  }

  /**
   * 滑动窗口
   */
  private slideWindows(): void {
    const now = Date.now();
    const cutoffTime = now - this.config.windowSizeMs;

    for (const [key, window] of Array.from(this.windows.entries())) {
      // 清理过期数据
      window.points = window.points.filter((p: DataPoint) => p.timestamp >= cutoffTime);
      window.startTime = cutoffTime;
      window.endTime = now;

      // 如果窗口为空，删除
      if (window.points.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * 实时异常检测（Z-Score 方法）
   */
  private detectAnomaly(point: DataPoint): AnomalyResult {
    const windowKey = `${point.deviceId}:${point.sensorId}:${point.metricName}`;
    const window = this.windows.get(windowKey);

    const result: AnomalyResult = {
      isAnomaly: false,
      value: point.value,
      mean: 0,
      stdDev: 0,
      zScore: 0,
      threshold: this.config.anomalyThreshold,
      timestamp: point.timestamp,
      deviceId: point.deviceId,
      sensorId: point.sensorId,
      metricName: point.metricName,
    };

    if (!window || window.points.length < 10) {
      // 数据不足，无法检测
      return result;
    }

    // 计算统计量
    const values = window.points.map(p => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    result.mean = mean;
    result.stdDev = stdDev;

    if (stdDev > 0) {
      result.zScore = Math.abs((point.value - mean) / stdDev);
      result.isAnomaly = result.zScore > this.config.anomalyThreshold;
    }

    return result;
  }

  /**
   * 处理异常
   */
  private async handleAnomaly(result: AnomalyResult): Promise<void> {
    console.log(`[KafkaStreamProcessor] 检测到异常: ${result.deviceId}/${result.sensorId} Z-Score=${result.zScore.toFixed(2)}`);

    // 保存到数据库
    try {
      const database = await getDb();
      if (database) {
        await database.insert(anomalyDetections).values({
          detectionId: `det_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviceId: result.deviceId,
          sensorId: result.sensorId,
          algorithmType: 'zscore',
          windowSize: 60,
          threshold: Math.round(result.threshold * 100),
          currentValue: Math.round(result.value * 100),
          expectedValue: Math.round(result.mean * 100),
          deviation: Math.round(result.stdDev * 100),
          score: Math.round(result.zScore * 100),
          severity: result.zScore > 5 ? 'critical' : result.zScore > 4 ? 'high' : 'medium',
          status: 'open',
        });
      }
    } catch (error) {
      console.error('[KafkaStreamProcessor] 保存异常记录失败:', error);
    }

    // 发送异常事件到 Kafka
    try {
      await kafkaClient.produce(KAFKA_TOPICS.ANOMALIES, [{
        key: `${result.deviceId}:${result.sensorId}`,
        value: JSON.stringify({
          type: 'ANOMALY_DETECTED',
          ...result,
        }),
        timestamp: Date.now().toString(),
      }]);
    } catch (error) {
      console.error('[KafkaStreamProcessor] 发送异常事件失败:', error);
    }

    // 通知处理器
    for (const handler of this.anomalyHandlers) {
      try {
        handler(result);
      } catch (error) {
        console.error('[KafkaStreamProcessor] 异常处理器执行失败:', error);
      }
    }
  }

  /**
   * 刷新聚合数据
   */
  private async flushAggregations(): Promise<void> {
    const now = Date.now();
    const windowEnd = now;
    const windowStart = now - this.config.aggregationIntervalMs;

    for (const [key, points] of Array.from(this.aggregationBuffer.entries())) {
      if (points.length === 0) continue;

      const [deviceId, sensorId, metricName] = key.split(':');
      const values = points.map((p: DataPoint) => p.value);

      // 计算聚合统计
      const count = values.length;
      const sum = values.reduce((a: number, b: number) => a + b, 0);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = sum / count;
      const variance = values.reduce((a: number, b: number) => a + Math.pow(b - avg, 2), 0) / count;
      const stdDev = Math.sqrt(variance);

      const aggregation: AggregationResult = {
        deviceId,
        sensorId,
        metricName,
        windowStart,
        windowEnd,
        count,
        sum,
        min,
        max,
        avg,
        stdDev,
      };

      // 保存到数据库
      try {
        const database = await getDb();
        if (database) {
          await database.insert(dataAggregations).values({
            deviceId,
            sensorId,
            metricName,
            windowStart: new Date(windowStart),
            windowEnd: new Date(windowEnd),
            count,
            sum,
            min,
            max,
            avg,
            stdDev,
            createdAt: new Date(),
          });
        }
      } catch (error) {
        console.error('[KafkaStreamProcessor] 保存聚合数据失败:', error);
      }

      // 发送聚合事件到 Kafka
      try {
        await kafkaClient.produce(KAFKA_TOPICS.AGGREGATIONS, [{
          key: key,
          value: JSON.stringify(aggregation),
          timestamp: Date.now().toString(),
        }]);
      } catch (error) {
        console.error('[KafkaStreamProcessor] 发送聚合事件失败:', error);
      }

      // 通知处理器
      for (const handler of this.aggregationHandlers) {
        try {
          handler(aggregation);
        } catch (error) {
          console.error('[KafkaStreamProcessor] 聚合处理器执行失败:', error);
        }
      }
    }

    // 清空缓冲
    this.aggregationBuffer.clear();
  }

  /**
   * 注册异常处理器
   */
  onAnomaly(handler: (result: AnomalyResult) => void): void {
    this.anomalyHandlers.push(handler);
  }

  /**
   * 注册聚合处理器
   */
  onAggregation(handler: (result: AggregationResult) => void): void {
    this.aggregationHandlers.push(handler);
  }

  /**
   * 获取窗口统计信息
   */
  getWindowStats(): { windowCount: number; totalPoints: number; windows: Array<{ key: string; pointCount: number }> } {
    const windows = Array.from(this.windows.entries()).map(([key, window]) => ({
      key,
      pointCount: window.points.length,
    }));

    return {
      windowCount: this.windows.size,
      totalPoints: windows.reduce((sum, w) => sum + w.pointCount, 0),
      windows,
    };
  }

  /**
   * 获取处理器状态
   */
  getStatus(): {
    isRunning: boolean;
    config: StreamProcessorConfig;
    windowCount: number;
    bufferCount: number;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      windowCount: this.windows.size,
      bufferCount: this.aggregationBuffer.size,
    };
  }

  /**
   * 手动推送数据点（用于测试或非 Kafka 数据源）
   */
  async pushDataPoint(point: DataPoint): Promise<AnomalyResult> {
    this.addToWindow(point);
    this.addToAggregationBuffer(point);
    
    const anomalyResult = this.detectAnomaly(point);
    if (anomalyResult.isAnomaly) {
      await this.handleAnomaly(anomalyResult);
    }
    
    return anomalyResult;
  }

  /**
   * 查询历史异常
   */
  async queryAnomalies(options: {
    deviceId?: string;
    sensorId?: string;
    severity?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): Promise<any[]> {
    const database = await getDb();
    if (!database) return [];

    const conditions = [];
    if (options.deviceId) {
      conditions.push(eq(anomalyDetections.deviceId, options.deviceId));
    }
    if (options.sensorId) {
      conditions.push(eq(anomalyDetections.sensorId, options.sensorId));
    }
    if (options.severity) {
      conditions.push(eq(anomalyDetections.severity, options.severity as 'low' | 'medium' | 'high' | 'critical'));
    }
    if (options.startTime) {
      conditions.push(gte(anomalyDetections.createdAt, new Date(options.startTime)));
    }
    if (options.endTime) {
      conditions.push(lte(anomalyDetections.createdAt, new Date(options.endTime)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return database.select()
      .from(anomalyDetections)
      .where(whereClause)
      .orderBy(desc(anomalyDetections.createdAt))
      .limit(options.limit || 100);
  }

  /**
   * 查询聚合数据
   */
  async queryAggregations(options: {
    deviceId?: string;
    sensorId?: string;
    metricName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): Promise<any[]> {
    const database = await getDb();
    if (!database) return [];

    const conditions = [];
    if (options.deviceId) {
      conditions.push(eq(dataAggregations.deviceId, options.deviceId));
    }
    if (options.sensorId) {
      conditions.push(eq(dataAggregations.sensorId, options.sensorId));
    }
    if (options.metricName) {
      conditions.push(eq(dataAggregations.metricName, options.metricName));
    }
    if (options.startTime) {
      conditions.push(gte(dataAggregations.windowStart, new Date(options.startTime)));
    }
    if (options.endTime) {
      conditions.push(lte(dataAggregations.windowEnd, new Date(options.endTime)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return database.select()
      .from(dataAggregations)
      .where(whereClause)
      .orderBy(desc(dataAggregations.windowEnd))
      .limit(options.limit || 100);
  }
}

// 导出单例
export const kafkaStreamProcessor = new KafkaStreamProcessor();

// 导出类型
export type { DataPoint, AnomalyResult, AggregationResult };
