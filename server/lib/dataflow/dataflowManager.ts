/**
 * 数据流层统一管理服务
 * 
 * 功能：
 * - 统一管理 Kafka Cluster、Flink 处理器、S3 归档
 * - 提供健康检查和监控
 * - 支持动态配置和扩展
 */

import { kafkaCluster, XILIAN_TOPICS, TopicConfig } from './kafkaCluster';
import { anomalyDetector, metricsAggregator, kgBuilder, AnomalyResult, AggregationResult, KGEntity, KGRelation } from './flinkProcessor';
import { kafkaArchiver, ArchiveFile, ArchiveStats } from './kafkaCluster';

// ============ 类型定义 ============

export interface DataflowStatus {
  kafka: {
    connected: boolean;
    brokers: number;
    topics: number;
    mode: 'kraft' | 'zookeeper';
    latencyMs: number;
  };
  processors: {
    anomalyDetector: {
      running: boolean;
      windowCount: number;
    };
    metricsAggregator: {
      running: boolean;
      window1mCount: number;
      window1hCount: number;
    };
    kgBuilder: {
      running: boolean;
      entityBufferSize: number;
      relationBufferSize: number;
    };
  };
  archiver: {
    running: boolean;
    totalMessages: number;
    totalBytes: number;
    filesCreated: number;
  };
}

export interface DataflowMetrics {
  kafka: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    consumerLag: number;
  };
  processors: {
    anomaliesDetected: number;
    aggregationsCreated: number;
    entitiesExtracted: number;
  };
  archiver: {
    messagesArchived: number;
    bytesArchived: number;
    filesCreated: number;
  };
}

export interface DataflowConfig {
  kafka: {
    enabled: boolean;
    brokers: string[];
  };
  processors: {
    anomalyDetector: {
      enabled: boolean;
      windowSizeMs: number;
      threshold: number;
    };
    metricsAggregator: {
      enabled: boolean;
    };
    kgBuilder: {
      enabled: boolean;
    };
  };
  archiver: {
    enabled: boolean;
    topics: string[];
    batchSize: number;
    flushIntervalMs: number;
  };
}

// ============ 事件类型 ============

export type DataflowEventType = 
  | 'anomaly_detected'
  | 'aggregation_created'
  | 'entity_extracted'
  | 'relation_extracted'
  | 'archive_created'
  | 'error';

export interface DataflowEvent {
  type: DataflowEventType;
  timestamp: number;
  data: unknown;
}

// ============ 数据流管理器 ============

export class DataflowManager {
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private eventHandlers: Map<DataflowEventType, ((event: DataflowEvent) => void)[]> = new Map();
  private metrics: DataflowMetrics = {
    kafka: {
      messagesPerSecond: 0,
      bytesPerSecond: 0,
      consumerLag: 0,
    },
    processors: {
      anomaliesDetected: 0,
      aggregationsCreated: 0,
      entitiesExtracted: 0,
    },
    archiver: {
      messagesArchived: 0,
      bytesArchived: 0,
      filesCreated: 0,
    },
  };

  constructor() {
    // 初始化事件处理器映射
    const eventTypes: DataflowEventType[] = [
      'anomaly_detected',
      'aggregation_created',
      'entity_extracted',
      'relation_extracted',
      'archive_created',
      'error',
    ];
    eventTypes.forEach(type => this.eventHandlers.set(type, []));
  }

  /**
   * 初始化数据流层
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[DataflowManager] Already initialized');
      return;
    }

    console.log('[DataflowManager] Initializing dataflow layer...');

    try {
      // 初始化 Kafka 集群
      await kafkaCluster.initialize();

      // 注册事件处理器
      this.registerEventHandlers();

      this.isInitialized = true;
      console.log('[DataflowManager] Dataflow layer initialized');
    } catch (error) {
      console.error('[DataflowManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 注册内部事件处理器
   */
  private registerEventHandlers(): void {
    // 异常检测事件
    anomalyDetector.onAnomaly((result: AnomalyResult) => {
      this.metrics.processors.anomaliesDetected++;
      this.emitEvent('anomaly_detected', result);
    });

    // 聚合事件
    metricsAggregator.onAggregation((result: AggregationResult) => {
      this.metrics.processors.aggregationsCreated++;
      this.emitEvent('aggregation_created', result);
    });

    // 实体抽取事件
    kgBuilder.onEntity((entity: KGEntity) => {
      this.metrics.processors.entitiesExtracted++;
      this.emitEvent('entity_extracted', entity);
    });

    // 关系抽取事件
    kgBuilder.onRelation((relation: KGRelation) => {
      this.emitEvent('relation_extracted', relation);
    });

    // 归档事件
    kafkaArchiver.onArchive((file: ArchiveFile) => {
      this.metrics.archiver.filesCreated++;
      this.metrics.archiver.messagesArchived += file.messageCount;
      this.metrics.archiver.bytesArchived += file.sizeBytes;
      this.emitEvent('archive_created', file);
    });
  }

  /**
   * 启动所有处理器
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      console.log('[DataflowManager] Already running');
      return;
    }

    console.log('[DataflowManager] Starting all processors...');
    this.isRunning = true;

    try {
      // 启动异常检测器
      await anomalyDetector.start();

      // 启动指标聚合器
      await metricsAggregator.start();

      // 启动知识图谱构建器
      await kgBuilder.start();

      // 启动归档服务
      await kafkaArchiver.start();

      console.log('[DataflowManager] All processors started');
    } catch (error) {
      console.error('[DataflowManager] Failed to start processors:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * 停止所有处理器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[DataflowManager] Stopping all processors...');
    this.isRunning = false;

    try {
      await anomalyDetector.stop();
      await metricsAggregator.stop();
      await kgBuilder.stop();
      await kafkaArchiver.stop();

      console.log('[DataflowManager] All processors stopped');
    } catch (error) {
      console.error('[DataflowManager] Error stopping processors:', error);
      throw error;
    }
  }

  /**
   * 关闭数据流层
   */
  async close(): Promise<void> {
    console.log('[DataflowManager] Closing dataflow layer...');

    await this.stop();
    await kafkaCluster.close();

    this.isInitialized = false;
    console.log('[DataflowManager] Dataflow layer closed');
  }

  /**
   * 获取状态
   */
  async getStatus(): Promise<DataflowStatus> {
    const kafkaHealth = await kafkaCluster.healthCheck();
    const anomalyStatus = anomalyDetector.getStatus();
    const aggregatorStatus = metricsAggregator.getStatus();
    const kgStatus = kgBuilder.getStatus();
    const archiverStatus = kafkaArchiver.getStatus();

    return {
      kafka: {
        connected: kafkaHealth.connected,
        brokers: kafkaHealth.brokers,
        topics: kafkaHealth.topics,
        mode: kafkaHealth.mode,
        latencyMs: kafkaHealth.latencyMs,
      },
      processors: {
        anomalyDetector: {
          running: anomalyStatus.isRunning,
          windowCount: anomalyStatus.windowCount,
        },
        metricsAggregator: {
          running: aggregatorStatus.isRunning,
          window1mCount: aggregatorStatus.window1mCount,
          window1hCount: aggregatorStatus.window1hCount,
        },
        kgBuilder: {
          running: kgStatus.isRunning,
          entityBufferSize: kgStatus.entityBufferSize,
          relationBufferSize: kgStatus.relationBufferSize,
        },
      },
      archiver: {
        running: archiverStatus.isRunning,
        totalMessages: archiverStatus.stats.totalMessages,
        totalBytes: archiverStatus.stats.totalBytes,
        filesCreated: archiverStatus.stats.filesCreated,
      },
    };
  }

  /**
   * 获取指标
   */
  getMetrics(): DataflowMetrics {
    return { ...this.metrics };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    components: Record<string, { healthy: boolean; message: string }>;
  }> {
    const components: Record<string, { healthy: boolean; message: string }> = {};

    // Kafka 健康检查
    const kafkaHealth = await kafkaCluster.healthCheck();
    components['kafka'] = {
      healthy: kafkaHealth.connected,
      message: kafkaHealth.connected 
        ? `Connected to ${kafkaHealth.brokers} brokers, ${kafkaHealth.topics} topics`
        : kafkaHealth.error || 'Not connected',
    };

    // 处理器健康检查
    const anomalyStatus = anomalyDetector.getStatus();
    components['anomalyDetector'] = {
      healthy: anomalyStatus.isRunning,
      message: anomalyStatus.isRunning 
        ? `Running with ${anomalyStatus.windowCount} windows`
        : 'Not running',
    };

    const aggregatorStatus = metricsAggregator.getStatus();
    components['metricsAggregator'] = {
      healthy: aggregatorStatus.isRunning,
      message: aggregatorStatus.isRunning 
        ? `Running with ${aggregatorStatus.window1mCount} 1m windows, ${aggregatorStatus.window1hCount} 1h windows`
        : 'Not running',
    };

    const kgStatus = kgBuilder.getStatus();
    components['kgBuilder'] = {
      healthy: kgStatus.isRunning,
      message: kgStatus.isRunning 
        ? `Running with ${kgStatus.entityBufferSize} entities, ${kgStatus.relationBufferSize} relations buffered`
        : 'Not running',
    };

    const archiverStatus = kafkaArchiver.getStatus();
    components['archiver'] = {
      healthy: archiverStatus.isRunning,
      message: archiverStatus.isRunning 
        ? `Running, ${archiverStatus.stats.filesCreated} files created`
        : 'Not running',
    };

    const healthy = Object.values(components).every(c => c.healthy);

    return { healthy, components };
  }

  /**
   * 创建 Topic
   */
  async createTopic(config: TopicConfig): Promise<boolean> {
    return await kafkaCluster.createTopic(config);
  }

  /**
   * 删除 Topic
   */
  async deleteTopic(topicName: string): Promise<boolean> {
    return await kafkaCluster.deleteTopic(topicName);
  }

  /**
   * 获取 Topic 列表
   */
  async listTopics(): Promise<string[]> {
    return await kafkaCluster.listTopics();
  }

  /**
   * 获取 Topic 统计
   */
  async getTopicStats(topicName: string): Promise<{
    name: string;
    partitions: number;
    messageCount: number;
  }> {
    const stats = await kafkaCluster.getTopicStats(topicName);
    return {
      name: stats.name,
      partitions: stats.partitions,
      messageCount: stats.offsets.reduce((sum, o) => sum + o.messageCount, 0),
    };
  }

  /**
   * 获取所有 Topic 统计
   */
  async getAllTopicsStats(): Promise<Array<{
    name: string;
    partitions: number;
    messageCount: number;
  }>> {
    return await kafkaCluster.getAllTopicsStats();
  }

  /**
   * 发送消息
   */
  async produce(
    topic: string,
    messages: Array<{
      key?: string;
      value: string | Buffer;
      headers?: Record<string, string>;
    }>
  ): Promise<void> {
    await kafkaCluster.produce(topic, messages);
  }

  /**
   * 获取预定义 Topic 配置
   */
  getTopicConfigs(): Record<string, TopicConfig> {
    return { ...XILIAN_TOPICS };
  }

  /**
   * 获取归档统计
   */
  getArchiveStats(): ArchiveStats {
    return kafkaArchiver.getStats();
  }

  /**
   * 获取最近归档文件
   */
  getRecentArchives(limit: number = 10): ArchiveFile[] {
    return kafkaArchiver.getRecentArchives(limit);
  }

  /**
   * 触发归档
   */
  async triggerArchive(topic?: string): Promise<void> {
    await kafkaArchiver.triggerArchive(topic);
  }

  /**
   * 清理过期归档
   */
  async cleanupExpiredArchives(): Promise<number> {
    return await kafkaArchiver.cleanupExpiredArchives();
  }

  /**
   * 注册事件处理器
   */
  on(eventType: DataflowEventType, handler: (event: DataflowEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.push(handler);
    }
  }

  /**
   * 移除事件处理器
   */
  off(eventType: DataflowEventType, handler: (event: DataflowEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 发送事件
   */
  private emitEvent(type: DataflowEventType, data: unknown): void {
    const event: DataflowEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[DataflowManager] Event handler error for ${type}:`, error);
        }
      }
    }
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      kafka: {
        messagesPerSecond: 0,
        bytesPerSecond: 0,
        consumerLag: 0,
      },
      processors: {
        anomaliesDetected: 0,
        aggregationsCreated: 0,
        entitiesExtracted: 0,
      },
      archiver: {
        messagesArchived: 0,
        bytesArchived: 0,
        filesCreated: 0,
      },
    };
  }
}

// 导出单例
export const dataflowManager = new DataflowManager();
export default dataflowManager;
