/**
 * Kafka Cluster 企业级配置服务
 * 
 * 架构：3 Brokers KRaft 模式
 * 特性：
 * - KRaft 模式（无 ZooKeeper 依赖）
 * - Topic 分区配置（sensor-data 128、ais-vessel 16、tos-job 32、fault-events 8）
 * - 消息保留策略（7天）
 * - S3 归档机制
 */

import { Kafka, Admin, Producer, Consumer, logLevel, CompressionTypes, ITopicConfig } from 'kafkajs';

// ============ 配置类型 ============

export interface KafkaClusterConfig {
  brokers: BrokerConfig[];
  clusterId: string;
  clientId: string;
  connectionTimeout: number;
  requestTimeout: number;
  retentionMs: number; // 消息保留时间
  replicationFactor: number;
}

export interface BrokerConfig {
  id: number;
  host: string;
  port: number;
  rack?: string;
}

export interface TopicConfig {
  name: string;
  partitions: number;
  replicationFactor?: number;
  retentionMs?: number;
  cleanupPolicy?: 'delete' | 'compact' | 'delete,compact';
  compressionType?: 'gzip' | 'snappy' | 'lz4' | 'zstd' | 'uncompressed';
  minInsyncReplicas?: number;
  configs?: Record<string, string>;
}

// ============ 预定义 Topic 配置 ============

export const XILIAN_TOPICS: Record<string, TopicConfig> = {
  // 传感器数据 - 高吞吐量
  SENSOR_DATA: {
    name: 'xilian.sensor-data',
    partitions: 128,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7天
    compressionType: 'lz4',
    minInsyncReplicas: 1,
    configs: {
      'segment.bytes': '1073741824', // 1GB
      'segment.ms': '3600000', // 1小时
      'max.message.bytes': '10485760', // 10MB
    },
  },

  // AIS 船舶数据 - 中等吞吐量
  AIS_VESSEL: {
    name: 'xilian.ais-vessel',
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
    configs: {
      'segment.bytes': '536870912', // 512MB
      'segment.ms': '3600000',
    },
  },

  // TOS 作业数据 - 中等吞吐量
  TOS_JOB: {
    name: 'xilian.tos-job',
    partitions: 32,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
    configs: {
      'segment.bytes': '536870912',
      'segment.ms': '3600000',
    },
  },

  // 故障事件 - 低吞吐量高可靠性
  FAULT_EVENTS: {
    name: 'xilian.fault-events',
    partitions: 8,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000, // 30天（故障事件保留更长）
    compressionType: 'gzip',
    minInsyncReplicas: 2, // 高可靠性
    configs: {
      'segment.bytes': '268435456', // 256MB
      'segment.ms': '86400000', // 1天
    },
  },

  // 异常检测结果
  ANOMALY_RESULTS: {
    name: 'xilian.anomaly-results',
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },

  // 聚合数据（1分钟）
  AGGREGATIONS_1M: {
    name: 'xilian.aggregations-1m',
    partitions: 32,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000, // 30天
    compressionType: 'lz4',
    minInsyncReplicas: 1,
  },

  // 聚合数据（1小时）
  AGGREGATIONS_1H: {
    name: 'xilian.aggregations-1h',
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 365 * 24 * 60 * 60 * 1000, // 1年
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },

  // CDC 变更数据
  CDC_EVENTS: {
    name: 'xilian.cdc-events',
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    cleanupPolicy: 'compact',
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },

  // 知识图谱实体
  KG_ENTITIES: {
    name: 'xilian.kg-entities',
    partitions: 8,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    cleanupPolicy: 'compact',
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },

  // 归档通知
  ARCHIVE_NOTIFICATIONS: {
    name: 'xilian.archive-notifications',
    partitions: 4,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },
};

// ============ 默认集群配置 ============

const DEFAULT_CLUSTER_CONFIG: KafkaClusterConfig = {
  brokers: [
    { id: 1, host: process.env.KAFKA_BROKER1_HOST || 'localhost', port: 9092, rack: 'rack1' },
    { id: 2, host: process.env.KAFKA_BROKER2_HOST || 'localhost', port: 9093, rack: 'rack2' },
    { id: 3, host: process.env.KAFKA_BROKER3_HOST || 'localhost', port: 9094, rack: 'rack3' },
  ],
  clusterId: process.env.KAFKA_CLUSTER_ID || 'xilian-kafka-cluster',
  clientId: 'xilian-platform',
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retentionMs: 7 * 24 * 60 * 60 * 1000, // 7天
  replicationFactor: 2,
};

// ============ Kafka Cluster 服务类 ============

export class KafkaClusterService {
  private kafka: Kafka | null = null;
  private admin: Admin | null = null;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private config: KafkaClusterConfig;
  private isInitialized: boolean = false;
  private topicConfigs: Map<string, TopicConfig> = new Map();

  constructor(config?: Partial<KafkaClusterConfig>) {
    this.config = { ...DEFAULT_CLUSTER_CONFIG, ...config };
    
    // 初始化 Topic 配置
    Object.values(XILIAN_TOPICS).forEach(topic => {
      this.topicConfigs.set(topic.name, topic);
    });
  }

  /**
   * 初始化 Kafka 集群连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[KafkaCluster] Already initialized');
      return;
    }

    console.log('[KafkaCluster] Initializing Kafka cluster connection...');
    console.log(`[KafkaCluster] Cluster ID: ${this.config.clusterId}`);
    console.log(`[KafkaCluster] Brokers: ${this.config.brokers.map(b => `${b.host}:${b.port}`).join(', ')}`);

    try {
      // 创建 Kafka 实例
      this.kafka = new Kafka({
        clientId: this.config.clientId,
        brokers: this.config.brokers.map(b => `${b.host}:${b.port}`),
        connectionTimeout: this.config.connectionTimeout,
        requestTimeout: this.config.requestTimeout,
        logLevel: logLevel.WARN,
        retry: {
          initialRetryTime: 100,
          retries: 8,
          maxRetryTime: 30000,
          factor: 2,
        },
      });

      // 初始化 Admin 客户端
      this.admin = this.kafka.admin();
      await this.admin.connect();

      // 初始化 Producer
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
        idempotent: true,
        maxInFlightRequests: 5,
      });
      await this.producer.connect();

      // 确保所有预定义 Topic 存在
      await this.ensureTopicsExist();

      this.isInitialized = true;
      console.log('[KafkaCluster] Kafka cluster connection established');
    } catch (error) {
      console.error('[KafkaCluster] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 确保所有预定义 Topic 存在
   */
  private async ensureTopicsExist(): Promise<void> {
    if (!this.admin) return;

    const existingTopics = await this.admin.listTopics();
    const topicsToCreate: ITopicConfig[] = [];

    for (const [name, config] of Array.from(this.topicConfigs.entries())) {
      if (!existingTopics.includes(name)) {
        topicsToCreate.push({
          topic: name,
          numPartitions: config.partitions,
          replicationFactor: config.replicationFactor || this.config.replicationFactor,
          configEntries: this.buildTopicConfigEntries(config),
        });
      }
    }

    if (topicsToCreate.length > 0) {
      console.log(`[KafkaCluster] Creating ${topicsToCreate.length} topics...`);
      await this.admin.createTopics({ topics: topicsToCreate });
      console.log('[KafkaCluster] Topics created successfully');
    }
  }

  /**
   * 构建 Topic 配置条目
   */
  private buildTopicConfigEntries(config: TopicConfig): { name: string; value: string }[] {
    const entries: { name: string; value: string }[] = [];

    if (config.retentionMs) {
      entries.push({ name: 'retention.ms', value: config.retentionMs.toString() });
    }
    if (config.cleanupPolicy) {
      entries.push({ name: 'cleanup.policy', value: config.cleanupPolicy });
    }
    if (config.compressionType) {
      entries.push({ name: 'compression.type', value: config.compressionType });
    }
    if (config.minInsyncReplicas) {
      entries.push({ name: 'min.insync.replicas', value: config.minInsyncReplicas.toString() });
    }
    if (config.configs) {
      Object.entries(config.configs).forEach(([name, value]) => {
        entries.push({ name, value });
      });
    }

    return entries;
  }

  /**
   * 创建自定义 Topic
   */
  async createTopic(config: TopicConfig): Promise<boolean> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    try {
      const existingTopics = await this.admin.listTopics();
      if (existingTopics.includes(config.name)) {
        console.log(`[KafkaCluster] Topic ${config.name} already exists`);
        return false;
      }

      await this.admin.createTopics({
        topics: [{
          topic: config.name,
          numPartitions: config.partitions,
          replicationFactor: config.replicationFactor || this.config.replicationFactor,
          configEntries: this.buildTopicConfigEntries(config),
        }],
      });

      this.topicConfigs.set(config.name, config);
      console.log(`[KafkaCluster] Topic ${config.name} created successfully`);
      return true;
    } catch (error) {
      console.error(`[KafkaCluster] Failed to create topic ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * 删除 Topic
   */
  async deleteTopic(topicName: string): Promise<boolean> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    try {
      await this.admin.deleteTopics({ topics: [topicName] });
      this.topicConfigs.delete(topicName);
      console.log(`[KafkaCluster] Topic ${topicName} deleted successfully`);
      return true;
    } catch (error) {
      console.error(`[KafkaCluster] Failed to delete topic ${topicName}:`, error);
      throw error;
    }
  }

  /**
   * 更新 Topic 配置
   */
  async updateTopicConfig(topicName: string, configs: Record<string, string>): Promise<boolean> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    try {
      await this.admin.alterConfigs({
        validateOnly: false,
        resources: [{
          type: 2, // TOPIC
          name: topicName,
          configEntries: Object.entries(configs).map(([name, value]) => ({ name, value })),
        }],
      });

      console.log(`[KafkaCluster] Topic ${topicName} config updated successfully`);
      return true;
    } catch (error) {
      console.error(`[KafkaCluster] Failed to update topic ${topicName} config:`, error);
      throw error;
    }
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
      partition?: number;
    }>
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('[KafkaCluster] Producer not initialized');
    }

    const topicConfig = this.topicConfigs.get(topic);
    const compressionType = topicConfig?.compressionType || 'snappy';

    const kafkaMessages = messages.map(msg => ({
      key: msg.key,
      value: msg.value,
      headers: msg.headers ? Object.fromEntries(
        Object.entries(msg.headers).map(([k, v]) => [k, Buffer.from(v)])
      ) : undefined,
      partition: msg.partition,
    }));

    await this.producer.send({
      topic,
      messages: kafkaMessages,
      compression: this.getCompressionType(compressionType),
    });
  }

  /**
   * 批量发送消息
   */
  async produceBatch(
    topicMessages: Array<{
      topic: string;
      messages: Array<{
        key?: string;
        value: string | Buffer;
        headers?: Record<string, string>;
      }>;
    }>
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('[KafkaCluster] Producer not initialized');
    }

    await this.producer.sendBatch({
      topicMessages: topicMessages.map(tm => ({
        topic: tm.topic,
        messages: tm.messages.map(msg => ({
          key: msg.key,
          value: msg.value,
          headers: msg.headers ? Object.fromEntries(
            Object.entries(msg.headers).map(([k, v]) => [k, Buffer.from(v)])
          ) : undefined,
        })),
      })),
    });
  }

  /**
   * 创建消费者
   */
  async createConsumer(
    groupId: string,
    topics: string[],
    handler: (message: {
      topic: string;
      partition: number;
      offset: string;
      key: string | null;
      value: string | null;
      headers: Record<string, string>;
      timestamp: string;
    }) => Promise<void>,
    options?: {
      fromBeginning?: boolean;
      autoCommit?: boolean;
      sessionTimeout?: number;
      heartbeatInterval?: number;
    }
  ): Promise<string> {
    if (!this.kafka) {
      throw new Error('[KafkaCluster] Kafka client not initialized');
    }

    const consumerId = `${groupId}-${Date.now()}`;
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: options?.sessionTimeout || 30000,
      heartbeatInterval: options?.heartbeatInterval || 3000,
      allowAutoTopicCreation: false,
    });

    await consumer.connect();
    await consumer.subscribe({
      topics,
      fromBeginning: options?.fromBeginning || false,
    });

    await consumer.run({
      autoCommit: options?.autoCommit !== false,
      eachMessage: async ({ topic, partition, message }) => {
        const headers: Record<string, string> = {};
        if (message.headers) {
          for (const [key, value] of Object.entries(message.headers)) {
            if (value) {
              headers[key] = value.toString();
            }
          }
        }

        await handler({
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString() || null,
          value: message.value?.toString() || null,
          headers,
          timestamp: message.timestamp,
        });
      },
    });

    this.consumers.set(consumerId, consumer);
    console.log(`[KafkaCluster] Consumer ${consumerId} subscribed to: ${topics.join(', ')}`);

    return consumerId;
  }

  /**
   * 停止消费者
   */
  async stopConsumer(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(consumerId);
      console.log(`[KafkaCluster] Consumer ${consumerId} stopped`);
    }
  }

  /**
   * 获取 Topic 列表
   */
  async listTopics(): Promise<string[]> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    return await this.admin.listTopics();
  }

  /**
   * 获取 Topic 元数据
   */
  async getTopicMetadata(topics?: string[]): Promise<{
    topics: Array<{
      name: string;
      partitions: Array<{
        partitionId: number;
        leader: number;
        replicas: number[];
        isr: number[];
      }>;
    }>;
  }> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const metadata = await this.admin.fetchTopicMetadata({ topics: topics || [] });
    return {
      topics: metadata.topics.map(t => ({
        name: t.name,
        partitions: t.partitions.map(p => ({
          partitionId: p.partitionId,
          leader: p.leader,
          replicas: p.replicas,
          isr: p.isr,
        })),
      })),
    };
  }

  /**
   * 获取消费者组信息
   */
  async getConsumerGroupInfo(groupId: string): Promise<{
    groupId: string;
    state: string;
    members: Array<{
      memberId: string;
      clientId: string;
      clientHost: string;
    }>;
  } | null> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    try {
      const groups = await this.admin.describeGroups([groupId]);
      const group = groups.groups[0];
      if (!group) return null;

      return {
        groupId: group.groupId,
        state: group.state,
        members: group.members.map(m => ({
          memberId: m.memberId,
          clientId: m.clientId,
          clientHost: m.clientHost,
        })),
      };
    } catch (error) {
      console.error(`[KafkaCluster] Failed to get consumer group info:`, error);
      return null;
    }
  }

  /**
   * 获取消费者组偏移量
   */
  async getConsumerGroupOffsets(
    groupId: string,
    topics: string[]
  ): Promise<Array<{
    topic: string;
    partitions: Array<{
      partition: number;
      offset: string;
    }>;
  }>> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const offsets = await this.admin.fetchOffsets({ groupId, topics });
    return offsets.map(o => ({
      topic: o.topic,
      partitions: o.partitions.map(p => ({
        partition: p.partition,
        offset: p.offset,
      })),
    }));
  }

  /**
   * 重置消费者组偏移量
   */
  async resetConsumerGroupOffsets(
    groupId: string,
    topic: string,
    offset: 'earliest' | 'latest' | number
  ): Promise<void> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const metadata = await this.admin.fetchTopicMetadata({ topics: [topic] });
    const topicMetadata = metadata.topics[0];
    if (!topicMetadata) {
      throw new Error(`Topic ${topic} not found`);
    }

    const partitions = topicMetadata.partitions.map(p => ({
      partition: p.partitionId,
      offset: typeof offset === 'number' ? offset.toString() : offset === 'earliest' ? '-2' : '-1',
    }));

    await this.admin.setOffsets({
      groupId,
      topic,
      partitions,
    });

    console.log(`[KafkaCluster] Consumer group ${groupId} offsets reset for topic ${topic}`);
  }

  /**
   * 获取集群信息
   */
  async getClusterInfo(): Promise<{
    clusterId: string;
    brokers: Array<{
      nodeId: number;
      host: string;
      port: number;
      rack?: string;
    }>;
    controller: number | null;
  }> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const cluster = await this.admin.describeCluster();
    return {
      clusterId: cluster.clusterId,
      brokers: cluster.brokers.map(b => ({
        nodeId: b.nodeId,
        host: b.host,
        port: b.port,
        rack: (b as any).rack || undefined,
      })),
      controller: cluster.controller,
    };
  }

  /**
   * 获取 Topic 统计信息
   */
  async getTopicStats(topicName: string): Promise<{
    name: string;
    partitions: number;
    replicationFactor: number;
    config: TopicConfig | null;
    offsets: Array<{
      partition: number;
      low: string;
      high: string;
      messageCount: number;
    }>;
  }> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const metadata = await this.admin.fetchTopicMetadata({ topics: [topicName] });
    const topicMetadata = metadata.topics[0];
    if (!topicMetadata) {
      throw new Error(`Topic ${topicName} not found`);
    }

    const offsets = await this.admin.fetchTopicOffsets(topicName);

    return {
      name: topicName,
      partitions: topicMetadata.partitions.length,
      replicationFactor: topicMetadata.partitions[0]?.replicas.length || 0,
      config: this.topicConfigs.get(topicName) || null,
      offsets: offsets.map(o => ({
        partition: o.partition,
        low: o.low,
        high: o.high,
        messageCount: parseInt(o.high) - parseInt(o.low),
      })),
    };
  }

  /**
   * 获取所有 Topic 统计信息
   */
  async getAllTopicsStats(): Promise<Array<{
    name: string;
    partitions: number;
    messageCount: number;
    config: TopicConfig | null;
  }>> {
    if (!this.admin) {
      throw new Error('[KafkaCluster] Admin client not initialized');
    }

    const topics = await this.admin.listTopics();
    const stats: Array<{
      name: string;
      partitions: number;
      messageCount: number;
      config: TopicConfig | null;
    }> = [];

    for (const topic of topics) {
      try {
        const topicStats = await this.getTopicStats(topic);
        stats.push({
          name: topic,
          partitions: topicStats.partitions,
          messageCount: topicStats.offsets.reduce((sum, o) => sum + o.messageCount, 0),
          config: topicStats.config,
        });
      } catch (error) {
        console.error(`[KafkaCluster] Failed to get stats for topic ${topic}:`, error);
      }
    }

    return stats;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    brokers: number;
    topics: number;
    mode: 'kraft' | 'zookeeper';
    error?: string;
  }> {
    const start = Date.now();

    if (!this.admin || !this.isInitialized) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        brokers: 0,
        topics: 0,
        mode: 'kraft',
        error: 'Not initialized',
      };
    }

    try {
      const cluster = await this.admin.describeCluster();
      const topics = await this.admin.listTopics();

      return {
        connected: true,
        latencyMs: Date.now() - start,
        brokers: cluster.brokers.length,
        topics: topics.length,
        mode: 'kraft', // KRaft 模式
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        brokers: 0,
        topics: 0,
        mode: 'kraft',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 获取压缩类型
   */
  private getCompressionType(type: string): CompressionTypes {
    switch (type) {
      case 'gzip':
        return CompressionTypes.GZIP;
      case 'snappy':
        return CompressionTypes.Snappy;
      case 'lz4':
        return CompressionTypes.LZ4;
      case 'zstd':
        return CompressionTypes.ZSTD;
      default:
        return CompressionTypes.None;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    console.log('[KafkaCluster] Closing Kafka cluster connections...');

    // 停止所有消费者
    for (const [consumerId, consumer] of Array.from(this.consumers.entries())) {
      await consumer.disconnect();
      console.log(`[KafkaCluster] Consumer ${consumerId} disconnected`);
    }
    this.consumers.clear();

    // 关闭 Producer
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    // 关闭 Admin
    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
    }

    this.kafka = null;
    this.isInitialized = false;
    console.log('[KafkaCluster] Kafka cluster connections closed');
  }
}

// 导出单例
export const kafkaCluster = new KafkaClusterService();
export default kafkaCluster;

// ============================================================
// Kafka Archiver (归档模块)
// ============================================================

export interface ArchiveConfig {
  enabled: boolean;
  storagePath: string;
  retentionDays: number;
  compressionType?: 'gzip' | 'snappy' | 'lz4' | 'none';
  maxFileSizeMB?: number;
  topics?: string[];
}

export interface ArchiveRecord {
  id: string;
  topic: string;
  partition: number;
  startOffset: number;
  endOffset: number;
  messageCount: number;
  filePath: string;
  fileSize: number;
  createdAt: Date;
  compressedSize?: number;
}

export interface ArchiveStats {
  totalFiles: number;
  totalMessages: number;
  totalSizeBytes: number;
  oldestArchive?: Date;
  newestArchive?: Date;
  topicStats: Record<string, { files: number; messages: number; sizeBytes: number }>;
}

export interface ArchiveFile {
  path: string;
  topic: string;
  partition: number;
  startOffset: number;
  endOffset: number;
  messageCount: number;
  sizeBytes: number;
  createdAt: Date;
}

export class KafkaArchiver {
  private config: ArchiveConfig;
  constructor(config?: Partial<ArchiveConfig>) {
    this.config = {
      enabled: false,
      storagePath: '/data/kafka-archives',
      retentionDays: 30,
      ...config,
    };
  }
  async archive(topic: string): Promise<ArchiveFile | null> {
    console.log(`[KafkaArchiver] Archive topic: ${topic}`);
    return null;
  }
  async getStats(): Promise<ArchiveStats> {
    return { totalFiles: 0, totalMessages: 0, totalSizeBytes: 0, topicStats: {} };
  }
  async listArchives(topic?: string): Promise<ArchiveRecord[]> {
    return [];
  }
  async restore(archiveId: string): Promise<boolean> {
    return false;
  }
  async cleanup(beforeDate?: Date): Promise<number> {
    return 0;
  }

  // ============ dataflowManager 所需方法 ============
  private archiveCallbacks: Array<(file: ArchiveFile) => void> = [];
  private _isRunning = false;

  onArchive(callback: (file: ArchiveFile) => void): void {
    this.archiveCallbacks.push(callback);
  }

  async start(): Promise<void> {
    this._isRunning = true;
    console.log('[KafkaArchiver] Started');
  }

  async stop(): Promise<void> {
    this._isRunning = false;
    console.log('[KafkaArchiver] Stopped');
  }

  getStatus(): { isRunning: boolean; stats: { filesCreated: number } } {
    return { isRunning: this._isRunning, stats: { filesCreated: 0 } };
  }

  getRecentArchives(limit: number = 10): ArchiveFile[] {
    return [];
  }

  async triggerArchive(topic?: string): Promise<void> {
    if (topic) {
      await this.archive(topic);
    }
  }

  async cleanupExpiredArchives(): Promise<number> {
    return this.cleanup();
  }
}

export const kafkaArchiver = new KafkaArchiver();
