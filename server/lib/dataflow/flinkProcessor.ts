/**
 * Flink 风格的有状态流处理服务
 * 
 * 处理器：
 * - anomaly-detector: 1分钟窗口 Z-Score 异常检测
 * - KG-builder: CDC 实体抽取
 * - metrics-aggregator: 1min/1h 聚合
 */

import { kafkaCluster, XILIAN_TOPICS } from './kafkaCluster';
import { SensorReading, AnomalyResult, WindowConfig } from "../../core/types/domain";
export { SensorReading, AnomalyResult, WindowConfig };

// ============ 类型定义 ============

export interface AnomalyDetectorConfig {
  window: WindowConfig;
  threshold: number; // Z-Score 阈值
  minDataPoints: number;
  algorithms: ('zscore' | 'mad' | 'iqr')[];
}

export interface MetricsAggregatorConfig {
  windows: {
    '1m': WindowConfig;
    '1h': WindowConfig;
  };
  metrics: string[];
}

export interface CDCConfig {
  sourceTopics: string[];
  entityTypes: string[];
  batchSize: number;
  flushIntervalMs: number;
}

// ============ 数据结构 ============

export interface AggregationResult {
  deviceId: string;
  sensorId: string;
  metricName: string;
  windowStart: number;
  windowEnd: number;
  windowType: '1m' | '1h';
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface CDCEvent {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: number;
  transactionId?: string;
}

export interface KGEntity {
  id: string;
  type: 'Equipment' | 'Component' | 'Fault' | 'Solution' | 'Vessel' | 'Berth';
  properties: Record<string, unknown>;
  source: string;
  timestamp: number;
}

export interface KGRelation {
  sourceId: string;
  targetId: string;
  type: 'HAS_PART' | 'CAUSES' | 'SIMILAR_TO' | 'RESOLVED_BY' | 'AFFECTS';
  properties: Record<string, unknown>;
  timestamp: number;
}

// ============ 窗口状态管理 ============

class WindowState<T> {
  private windows: Map<string, { data: T[]; startTime: number; endTime: number }> = new Map();
  private config: WindowConfig;

  constructor(config: WindowConfig) {
    this.config = config;
  }

  add(key: string, item: T, timestamp: number): void {
    if (!this.windows.has(key)) {
      const windowStart = Math.floor(timestamp / this.config.sizeMs) * this.config.sizeMs;
      this.windows.set(key, {
        data: [],
        startTime: windowStart,
        endTime: windowStart + this.config.sizeMs,
      });
    }

    const window = this.windows.get(key)!;
    window.data.push(item);
  }

  getWindow(key: string): { data: T[]; startTime: number; endTime: number } | null {
    return this.windows.get(key) || null;
  }

  getAllWindows(): Array<{ key: string; data: T[]; startTime: number; endTime: number }> {
    return Array.from(this.windows.entries()).map(([key, window]) => ({
      key,
      ...window,
    }));
  }

  evict(currentTime: number): Array<{ key: string; data: T[]; startTime: number; endTime: number }> {
    const evicted: Array<{ key: string; data: T[]; startTime: number; endTime: number }> = [];
    const cutoff = currentTime - this.config.sizeMs - (this.config.allowedLatenessMs || 0);

    for (const [key, window] of Array.from(this.windows.entries())) {
      if (window.endTime < cutoff) {
        evicted.push({ key, ...window });
        this.windows.delete(key);
      }
    }

    return evicted;
  }

  clear(): void {
    this.windows.clear();
  }

  size(): number {
    return this.windows.size;
  }
}

// ============ 异常检测器 ============

export class AnomalyDetector {
  private config: AnomalyDetectorConfig;
  private windowState: WindowState<SensorReading>;
  private isRunning: boolean = false;
  private consumerId: string | null = null;
  private handlers: ((result: AnomalyResult) => void)[] = [];
  private slideTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AnomalyDetectorConfig>) {
    this.config = {
      window: {
        type: 'sliding' as const,
        sizeMs: 60000, // 1分钟
        slideMs: 10000, // 10秒滑动
        allowedLatenessMs: 5000,
      },
      threshold: 3.0, // 3个标准差
      minDataPoints: 10,
      algorithms: ['zscore'],
      ...config,
    };

    this.windowState = new WindowState(this.config.window);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[AnomalyDetector] Already running');
      return;
    }

    console.log('[AnomalyDetector] Starting anomaly detector...');
    this.isRunning = true;

    try {
      // 订阅传感器数据 Topic
      this.consumerId = await kafkaCluster.createConsumer(
        'anomaly-detector-group',
        [XILIAN_TOPICS.SENSOR_DATA.name],
        this.handleMessage.bind(this),
        { autoCommit: true }
      );

      // 启动滑动窗口定时器
      this.slideTimer = setInterval(() => {
        this.slideWindows();
      }, this.config.window.slideMs);

      console.log('[AnomalyDetector] Anomaly detector started');
    } catch (error) {
      console.error('[AnomalyDetector] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[AnomalyDetector] Stopping anomaly detector...');
    this.isRunning = false;

    if (this.slideTimer) {
      clearInterval(this.slideTimer);
      this.slideTimer = null;
    }

    if (this.consumerId) {
      await kafkaCluster.stopConsumer(this.consumerId);
      this.consumerId = null;
    }

    this.windowState.clear();
    console.log('[AnomalyDetector] Anomaly detector stopped');
  }

  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    if (!message.value) return;

    try {
      const reading: SensorReading = JSON.parse(message.value);
      const key = `${reading.deviceId}:${reading.sensorId}:${reading.metricName}`;

      // 添加到窗口
      this.windowState.add(key, reading, Number(reading.timestamp));

      // 实时检测
      const result = this.detectAnomaly(key, reading);
      if (result && result.isAnomaly) {
        await this.emitAnomaly(result);
      }
    } catch (error) {
      console.error('[AnomalyDetector] Error processing message:', error);
    }
  }

  private detectAnomaly(key: string, reading: SensorReading): AnomalyResult | null {
    const window = this.windowState.getWindow(key);
    if (!window || window.data.length < this.config.minDataPoints) {
      return null;
    }

    const values = window.data.map(r => r.value);
    const result: AnomalyResult = {
      deviceId: reading.deviceId,
      sensorId: reading.sensorId,
      metricName: reading.metricName,
      value: reading.value,
      timestamp: reading.timestamp,
      isAnomaly: false,
      algorithm: 'zscore',
      score: 0,
      threshold: this.config.threshold,
      mean: 0,
      stdDev: 0,
      severity: 'low',
      windowStart: window.startTime,
      windowEnd: window.endTime,
    };

    // Z-Score 检测
    if (this.config.algorithms.includes('zscore')) {
      const { mean, stdDev, zScore } = this.calculateZScore(values, reading.value);
      result.mean = mean;
      result.stdDev = stdDev;
      result.score = zScore;
      result.isAnomaly = zScore > this.config.threshold;
    }

    // 确定严重程度
    if (result.isAnomaly) {
      if (result.score > 5) {
        result.severity = 'critical';
      } else if (result.score > 4) {
        result.severity = 'high';
      } else if (result.score > 3) {
        result.severity = 'medium';
      } else {
        result.severity = 'low';
      }
    }

    return result;
  }

  private calculateZScore(values: number[], currentValue: number): {
    mean: number;
    stdDev: number;
    zScore: number;
  } {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev > 0 ? Math.abs((currentValue - mean) / stdDev) : 0;

    return { mean, stdDev, zScore };
  }

  private slideWindows(): void {
    const now = Date.now();
    const evicted = this.windowState.evict(now);

    // 处理已关闭的窗口
    for (const window of evicted) {
      // 可以在这里进行窗口级别的聚合分析
      console.log(`[AnomalyDetector] Window closed: ${window.key}, points: ${window.data.length}`);
    }
  }

  private async emitAnomaly(result: AnomalyResult): Promise<void> {
    console.log(`[AnomalyDetector] Anomaly detected: ${result.deviceId}/${result.sensorId} score=${result.score.toFixed(2)}`);

    // 发送到 Kafka
    try {
      await kafkaCluster.produce(XILIAN_TOPICS.ANOMALY_RESULTS.name, [{
        key: `${result.deviceId}:${result.sensorId}`,
        value: JSON.stringify(result),
      }]);
    } catch (error) {
      console.error('[AnomalyDetector] Failed to emit anomaly:', error);
    }

    // 通知处理器
    for (const handler of this.handlers) {
      try {
        handler(result);
      } catch (error) {
        console.error('[AnomalyDetector] Handler error:', error);
      }
    }
  }

  onAnomaly(handler: (result: AnomalyResult) => void): void {
    this.handlers.push(handler);
  }

  getStatus(): {
    isRunning: boolean;
    windowCount: number;
    config: AnomalyDetectorConfig;
  } {
    return {
      isRunning: this.isRunning,
      windowCount: this.windowState.size(),
      config: this.config,
    };
  }

  /**
   * 手动推送数据点（用于测试）
   */
  async pushReading(reading: SensorReading): Promise<AnomalyResult | null> {
    const key = `${reading.deviceId}:${reading.sensorId}:${reading.metricName}`;
    this.windowState.add(key, reading, Number(reading.timestamp));
    
    const result = this.detectAnomaly(key, reading);
    if (result && result.isAnomaly) {
      await this.emitAnomaly(result);
    }
    
    return result;
  }
}

// ============ 指标聚合器 ============

export class MetricsAggregator {
  private config: MetricsAggregatorConfig;
  private window1m: WindowState<SensorReading>;
  private window1h: WindowState<SensorReading>;
  private isRunning: boolean = false;
  private consumerId: string | null = null;
  private handlers: ((result: AggregationResult) => void)[] = [];
  private flush1mTimer: NodeJS.Timeout | null = null;
  private flush1hTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MetricsAggregatorConfig>) {
    this.config = {
      windows: {
        '1m': {
          type: 'tumbling' as const,
          sizeMs: 60000,
          slideMs: 60000,
          allowedLatenessMs: 5000,
        },
        '1h': {
          type: 'tumbling' as const,
          sizeMs: 3600000,
          slideMs: 3600000,
          allowedLatenessMs: 60000,
        },
      },
      metrics: ['value', 'temperature', 'pressure', 'vibration', 'speed'],
      ...config,
    };

    this.window1m = new WindowState(this.config.windows['1m']);
    this.window1h = new WindowState(this.config.windows['1h']);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MetricsAggregator] Already running');
      return;
    }

    console.log('[MetricsAggregator] Starting metrics aggregator...');
    this.isRunning = true;

    try {
      // 订阅传感器数据 Topic
      this.consumerId = await kafkaCluster.createConsumer(
        'metrics-aggregator-group',
        [XILIAN_TOPICS.SENSOR_DATA.name],
        this.handleMessage.bind(this),
        { autoCommit: true }
      );

      // 启动 1 分钟聚合定时器
      this.flush1mTimer = setInterval(() => {
        this.flushAggregations('1m');
      }, this.config.windows['1m'].sizeMs);

      // 启动 1 小时聚合定时器
      this.flush1hTimer = setInterval(() => {
        this.flushAggregations('1h');
      }, this.config.windows['1h'].sizeMs);

      console.log('[MetricsAggregator] Metrics aggregator started');
    } catch (error) {
      console.error('[MetricsAggregator] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[MetricsAggregator] Stopping metrics aggregator...');
    this.isRunning = false;

    if (this.flush1mTimer) {
      clearInterval(this.flush1mTimer);
      this.flush1mTimer = null;
    }

    if (this.flush1hTimer) {
      clearInterval(this.flush1hTimer);
      this.flush1hTimer = null;
    }

    if (this.consumerId) {
      await kafkaCluster.stopConsumer(this.consumerId);
      this.consumerId = null;
    }

    // 最后一次刷新
    await this.flushAggregations('1m');
    await this.flushAggregations('1h');

    this.window1m.clear();
    this.window1h.clear();
    console.log('[MetricsAggregator] Metrics aggregator stopped');
  }

  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    if (!message.value) return;

    try {
      const reading: SensorReading = JSON.parse(message.value);
      const key = `${reading.deviceId}:${reading.sensorId}:${reading.metricName}`;

      // 添加到两个窗口
      this.window1m.add(key, reading, Number(reading.timestamp));
      this.window1h.add(key, reading, Number(reading.timestamp));
    } catch (error) {
      console.error('[MetricsAggregator] Error processing message:', error);
    }
  }

  private async flushAggregations(windowType: '1m' | '1h'): Promise<void> {
    const windowState = windowType === '1m' ? this.window1m : this.window1h;
    const now = Date.now();
    const evicted = windowState.evict(now);

    for (const window of evicted) {
      if (window.data.length === 0) continue;

      const [deviceId, sensorId, metricName] = window.key.split(':');
      const result = this.calculateAggregation(
        deviceId,
        sensorId,
        metricName,
        window.data,
        window.startTime,
        window.endTime,
        windowType
      );

      await this.emitAggregation(result, windowType);
    }
  }

  private calculateAggregation(
    deviceId: string,
    sensorId: string,
    metricName: string,
    data: SensorReading[],
    windowStart: number,
    windowEnd: number,
    windowType: '1m' | '1h'
  ): AggregationResult {
    const values = data.map(r => r.value).sort((a, b) => a - b);
    const n = values.length;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      deviceId,
      sensorId,
      metricName,
      windowStart,
      windowEnd,
      windowType,
      count: n,
      sum,
      min: values[0],
      max: values[n - 1],
      avg,
      stdDev,
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private async emitAggregation(result: AggregationResult, windowType: '1m' | '1h'): Promise<void> {
    const topic = windowType === '1m' 
      ? XILIAN_TOPICS.AGGREGATIONS_1M.name 
      : XILIAN_TOPICS.AGGREGATIONS_1H.name;

    try {
      await kafkaCluster.produce(topic, [{
        key: `${result.deviceId}:${result.sensorId}:${result.metricName}`,
        value: JSON.stringify(result),
      }]);
    } catch (error) {
      console.error('[MetricsAggregator] Failed to emit aggregation:', error);
    }

    // 通知处理器
    for (const handler of this.handlers) {
      try {
        handler(result);
      } catch (error) {
        console.error('[MetricsAggregator] Handler error:', error);
      }
    }
  }

  onAggregation(handler: (result: AggregationResult) => void): void {
    this.handlers.push(handler);
  }

  getStatus(): {
    isRunning: boolean;
    window1mCount: number;
    window1hCount: number;
    config: MetricsAggregatorConfig;
  } {
    return {
      isRunning: this.isRunning,
      window1mCount: this.window1m.size(),
      window1hCount: this.window1h.size(),
      config: this.config,
    };
  }

  /**
   * 手动推送数据点（用于测试）
   */
  pushReading(reading: SensorReading): void {
    const key = `${reading.deviceId}:${reading.sensorId}:${reading.metricName}`;
    this.window1m.add(key, reading, Number(reading.timestamp));
    this.window1h.add(key, reading, Number(reading.timestamp));
  }

  /**
   * 手动触发聚合（用于测试）
   */
  async triggerFlush(windowType: '1m' | '1h'): Promise<void> {
    await this.flushAggregations(windowType);
  }
}

// ============ CDC 实体抽取器（知识图谱构建） ============

export class KGBuilder {
  private config: CDCConfig;
  private isRunning: boolean = false;
  private consumerId: string | null = null;
  private entityBuffer: KGEntity[] = [];
  private relationBuffer: KGRelation[] = [];
  private entityHandlers: ((entity: KGEntity) => void)[] = [];
  private relationHandlers: ((relation: KGRelation) => void)[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CDCConfig>) {
    this.config = {
      sourceTopics: [XILIAN_TOPICS.CDC_EVENTS.name],
      entityTypes: ['Equipment', 'Component', 'Fault', 'Solution', 'Vessel', 'Berth'],
      batchSize: 100,
      flushIntervalMs: 5000,
      ...config,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[KGBuilder] Already running');
      return;
    }

    console.log('[KGBuilder] Starting KG builder...');
    this.isRunning = true;

    try {
      // 订阅 CDC 事件 Topic
      this.consumerId = await kafkaCluster.createConsumer(
        'kg-builder-group',
        this.config.sourceTopics,
        this.handleMessage.bind(this),
        { autoCommit: true }
      );

      // 启动刷新定时器
      this.flushTimer = setInterval(() => {
        this.flushBuffers();
      }, this.config.flushIntervalMs);

      console.log('[KGBuilder] KG builder started');
    } catch (error) {
      console.error('[KGBuilder] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[KGBuilder] Stopping KG builder...');
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.consumerId) {
      await kafkaCluster.stopConsumer(this.consumerId);
      this.consumerId = null;
    }

    // 最后一次刷新
    await this.flushBuffers();

    this.entityBuffer = [];
    this.relationBuffer = [];
    console.log('[KGBuilder] KG builder stopped');
  }

  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    if (!message.value) return;

    try {
      const cdcEvent: CDCEvent = JSON.parse(message.value);
      await this.processCDCEvent(cdcEvent);
    } catch (error) {
      console.error('[KGBuilder] Error processing message:', error);
    }
  }

  private async processCDCEvent(event: CDCEvent): Promise<void> {
    // 根据表名确定实体类型
    const entityType = this.mapTableToEntityType(event.table);
    if (!entityType) return;

    const data = event.operation === 'DELETE' ? event.before : event.after;
    if (!data) return;

    // 创建实体
    const entity: KGEntity = {
      id: `${entityType}:${data.id || Date.now()}`,
      type: entityType,
      properties: data,
      source: event.table,
      timestamp: event.timestamp,
    };

    this.entityBuffer.push(entity);

    // 提取关系
    const relations = this.extractRelations(entity, data);
    this.relationBuffer.push(...relations);

    // 检查是否需要刷新
    if (this.entityBuffer.length >= this.config.batchSize) {
      await this.flushBuffers();
    }
  }

  private mapTableToEntityType(table: string): KGEntity['type'] | null {
    const mapping: Record<string, KGEntity['type']> = {
      'devices': 'Equipment',
      'equipment': 'Equipment',
      'components': 'Component',
      'faults': 'Fault',
      'fault_events': 'Fault',
      'solutions': 'Solution',
      'vessels': 'Vessel',
      'berths': 'Berth',
    };

    return mapping[table.toLowerCase()] || null;
  }

  private extractRelations(entity: KGEntity, data: Record<string, unknown>): KGRelation[] {
    const relations: KGRelation[] = [];

    // 设备-组件关系
    if (entity.type === 'Component' && data.deviceId) {
      relations.push({
        sourceId: `Equipment:${data.deviceId}`,
        targetId: entity.id,
        type: 'HAS_PART',
        properties: {},
        timestamp: entity.timestamp,
      });
    }

    // 故障-设备关系
    if (entity.type === 'Fault' && data.deviceId) {
      relations.push({
        sourceId: entity.id,
        targetId: `Equipment:${data.deviceId}`,
        type: 'AFFECTS',
        properties: {},
        timestamp: entity.timestamp,
      });
    }

    // 故障-解决方案关系
    if (entity.type === 'Solution' && data.faultId) {
      relations.push({
        sourceId: `Fault:${data.faultId}`,
        targetId: entity.id,
        type: 'RESOLVED_BY',
        properties: {},
        timestamp: entity.timestamp,
      });
    }

    // 船舶-泊位关系
    if (entity.type === 'Vessel' && data.berthId) {
      relations.push({
        sourceId: entity.id,
        targetId: `Berth:${data.berthId}`,
        type: 'AFFECTS',
        properties: {},
        timestamp: entity.timestamp,
      });
    }

    return relations;
  }

  private async flushBuffers(): Promise<void> {
    if (this.entityBuffer.length === 0 && this.relationBuffer.length === 0) {
      return;
    }

    // 发送实体到 Kafka
    if (this.entityBuffer.length > 0) {
      try {
        await kafkaCluster.produce(XILIAN_TOPICS.KG_ENTITIES.name, 
          this.entityBuffer.map(entity => ({
            key: entity.id,
            value: JSON.stringify(entity),
          }))
        );

        // 通知处理器
        for (const entity of this.entityBuffer) {
          for (const handler of this.entityHandlers) {
            try {
              handler(entity);
            } catch (error) {
              console.error('[KGBuilder] Entity handler error:', error);
            }
          }
        }

        console.log(`[KGBuilder] Flushed ${this.entityBuffer.length} entities`);
      } catch (error) {
        console.error('[KGBuilder] Failed to flush entities:', error);
      }
    }

    // 通知关系处理器
    for (const relation of this.relationBuffer) {
      for (const handler of this.relationHandlers) {
        try {
          handler(relation);
        } catch (error) {
          console.error('[KGBuilder] Relation handler error:', error);
        }
      }
    }

    this.entityBuffer = [];
    this.relationBuffer = [];
  }

  onEntity(handler: (entity: KGEntity) => void): void {
    this.entityHandlers.push(handler);
  }

  onRelation(handler: (relation: KGRelation) => void): void {
    this.relationHandlers.push(handler);
  }

  getStatus(): {
    isRunning: boolean;
    entityBufferSize: number;
    relationBufferSize: number;
    config: CDCConfig;
  } {
    return {
      isRunning: this.isRunning,
      entityBufferSize: this.entityBuffer.length,
      relationBufferSize: this.relationBuffer.length,
      config: this.config,
    };
  }

  /**
   * 手动推送 CDC 事件（用于测试）
   */
  async pushCDCEvent(event: CDCEvent): Promise<void> {
    await this.processCDCEvent(event);
  }

  /**
   * 手动触发刷新（用于测试）
   */
  async triggerFlush(): Promise<void> {
    await this.flushBuffers();
  }
}

// ============ 导出单例 ============

export const anomalyDetector = new AnomalyDetector();
export const metricsAggregator = new MetricsAggregator();
export const kgBuilder = new KGBuilder();

export default {
  anomalyDetector,
  metricsAggregator,
  kgBuilder,
};
