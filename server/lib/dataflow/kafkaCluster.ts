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
import { KAFKA_TOPICS, KAFKA_TOPIC_CLUSTER_CONFIGS, type TopicClusterConfig } from '../../shared/constants/kafka-topics.const';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('kafkaCluster');

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

// ============ Topic 配置（从统一定义桥接） ============

/**
 * XILIAN_TOPICS 桥接层
 * 将统一的 KAFKA_TOPIC_CLUSTER_CONFIGS 转换为本模块使用的 TopicConfig 格式
 */
export const XILIAN_TOPICS: Record<string, TopicConfig> = Object.fromEntries(
  Object.entries(KAFKA_TOPIC_CLUSTER_CONFIGS).map(([key, cfg]) => [
    key,
    {
      name: cfg.name,
      partitions: cfg.partitions,
      replicationFactor: cfg.replicationFactor,
      retentionMs: cfg.retentionMs,
      compressionType: cfg.compressionType,
      cleanupPolicy: cfg.cleanupPolicy,
      minInsyncReplicas: cfg.minInsyncReplicas,
      configs: cfg.configs,
    } as TopicConfig,
  ])
);

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
      log.debug('[KafkaCluster] Already initialized');
      return;
    }

    log.debug('[KafkaCluster] Initializing Kafka cluster connection...');
    log.debug(`[KafkaCluster] Cluster ID: ${this.config.clusterId}`);
    log.debug(`[KafkaCluster] Brokers: ${this.config.brokers.map(b => `${b.host}:${b.port}`).join(', ')}`);

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
      log.debug('[KafkaCluster] Kafka cluster connection established');
    } catch (error) {
      log.warn('[KafkaCluster] Initialization failed:', error);
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
      log.debug(`[KafkaCluster] Creating ${topicsToCreate.length} topics...`);
      await this.admin.createTopics({ topics: topicsToCreate });
      log.debug('[KafkaCluster] Topics created successfully');
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
        log.debug(`[KafkaCluster] Topic ${config.name} already exists`);
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
      log.debug(`[KafkaCluster] Topic ${config.name} created successfully`);
      return true;
    } catch (error) {
      log.warn(`[KafkaCluster] Failed to create topic ${config.name}:`, error);
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
      log.debug(`[KafkaCluster] Topic ${topicName} deleted successfully`);
      return true;
    } catch (error) {
      log.warn(`[KafkaCluster] Failed to delete topic ${topicName}:`, error);
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

      log.debug(`[KafkaCluster] Topic ${topicName} config updated successfully`);
      return true;
    } catch (error) {
      log.warn(`[KafkaCluster] Failed to update topic ${topicName} config:`, error);
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
    log.debug(`[KafkaCluster] Consumer ${consumerId} subscribed to: ${topics.join(', ')}`);

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
      log.debug(`[KafkaCluster] Consumer ${consumerId} stopped`);
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
      log.warn(`[KafkaCluster] Failed to get consumer group info:`, error);
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

    log.debug(`[KafkaCluster] Consumer group ${groupId} offsets reset for topic ${topic}`);
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
        log.warn(`[KafkaCluster] Failed to get stats for topic ${topic}:`, error);
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
    log.debug('[KafkaCluster] Closing Kafka cluster connections...');

    // 停止所有消费者
    for (const [consumerId, consumer] of Array.from(this.consumers.entries())) {
      await consumer.disconnect();
      log.debug(`[KafkaCluster] Consumer ${consumerId} disconnected`);
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
    log.debug('[KafkaCluster] Kafka cluster connections closed');
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
  private archiveRecords: ArchiveRecord[] = [];
  private recentFiles: ArchiveFile[] = [];
  private archiveCallbacks: Array<(file: ArchiveFile) => void> = [];
  private _isRunning = false;
  private _filesCreated = 0;
  private scheduledTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<ArchiveConfig>) {
    this.config = {
      enabled: false,
      storagePath: process.env.KAFKA_ARCHIVE_PATH || '/data/kafka-archives',
      retentionDays: 30,
      compressionType: 'gzip',
      maxFileSizeMB: 256,
      ...config,
    };
  }

  /**
   * 归档指定 Topic 的消息到文件系统
   * 通过 KafkaCluster 消费消息，写入 NDJSON + gzip 压缩文件
   */
  async archive(topic: string): Promise<ArchiveFile | null> {
    if (!this.config.enabled) {
      log.warn('[KafkaArchiver] Archiver is disabled');
      return null;
    }

    const fs = await import('fs');
    const path = await import('path');
    const zlib = await import('zlib');
    const { promisify } = await import('util');
    const gzip = promisify(zlib.gzip);

    const partition = 0;
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const topicDir = path.join(this.config.storagePath, topic);
    const fileName = `${topic}-p${partition}-${dateStr}.ndjson${this.config.compressionType === 'gzip' ? '.gz' : ''}`;
    const filePath = path.join(topicDir, fileName);

    try {
      // 确保目录存在
      fs.mkdirSync(topicDir, { recursive: true });

      // 从 Kafka 消费消息（批量拉取，最多 10000 条或 maxFileSizeMB）
      const messages: Array<{ offset: string; key: string | null; value: string | null; timestamp: string; headers: Record<string, string> }> = [];
      const maxMessages = 10000;
      const maxBytes = (this.config.maxFileSizeMB || 256) * 1024 * 1024;
      let totalBytes = 0;

      // 尝试通过 kafkaCluster 消费，如果不可用则创建空归档文件
      try {
        const consumerId = await kafkaCluster.createConsumer(
          `archiver-${topic}-${Date.now()}`,
          [topic],
          async (msg) => {
            if (messages.length < maxMessages && totalBytes < maxBytes) {
              const line = JSON.stringify({
                offset: msg.offset,
                key: msg.key,
                value: msg.value,
                timestamp: msg.timestamp,
                headers: msg.headers,
              });
              messages.push(msg);
              totalBytes += Buffer.byteLength(line);
            }
          },
          { fromBeginning: false, autoCommit: true }
        );

        // 等待消费一段时间（最多 30 秒）
        await new Promise(resolve => setTimeout(resolve, Math.min(30000, 5000)));
        await kafkaCluster.stopConsumer(consumerId);
      } catch (kafkaErr) {
        log.warn(`[KafkaArchiver] Kafka not available for topic ${topic}, creating empty archive:`, kafkaErr);
      }

      if (messages.length === 0) {
        log.debug(`[KafkaArchiver] No messages to archive for topic: ${topic}`);
        return null;
      }

      // 序列化为 NDJSON
      const ndjson = messages.map(m => JSON.stringify({
        offset: m.offset,
        key: m.key,
        value: m.value,
        timestamp: m.timestamp,
        headers: m.headers,
      })).join('\n') + '\n';

      // 压缩并写入
      let fileContent: Buffer;
      if (this.config.compressionType === 'gzip') {
        fileContent = await gzip(Buffer.from(ndjson));
      } else {
        fileContent = Buffer.from(ndjson);
      }

      fs.writeFileSync(filePath, fileContent);
      const fileStats = fs.statSync(filePath);

      const startOffset = parseInt(messages[0]?.offset || '0');
      const endOffset = parseInt(messages[messages.length - 1]?.offset || '0');

      const archiveFile: ArchiveFile = {
        path: filePath,
        topic,
        partition,
        startOffset,
        endOffset,
        messageCount: messages.length,
        sizeBytes: fileStats.size,
        createdAt: timestamp,
      };

      // 记录元数据
      const record: ArchiveRecord = {
        id: `archive-${topic}-${dateStr}`,
        topic,
        partition,
        startOffset,
        endOffset,
        messageCount: messages.length,
        filePath,
        fileSize: totalBytes,
        createdAt: timestamp,
        compressedSize: fileStats.size,
      };
      this.archiveRecords.push(record);
      this.recentFiles.unshift(archiveFile);
      if (this.recentFiles.length > 100) this.recentFiles.pop();
      this._filesCreated++;

      // 触发回调
      for (const cb of this.archiveCallbacks) {
        try { cb(archiveFile); } catch (e) { log.warn('[KafkaArchiver] Callback error:', e); }
      }

      // 保存元数据到 JSON 索引文件
      const indexPath = path.join(this.config.storagePath, 'archive-index.json');
      try {
        let index: ArchiveRecord[] = [];
        if (fs.existsSync(indexPath)) {
          index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        }
        index.push(record);
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
      } catch (e) {
        log.warn('[KafkaArchiver] Failed to update index:', e);
      }

      log.debug(`[KafkaArchiver] Archived ${messages.length} messages from ${topic} to ${filePath} (${(fileStats.size / 1024).toFixed(1)} KB)`);
      return archiveFile;
    } catch (error) {
      log.warn(`[KafkaArchiver] Archive failed for topic ${topic}:`, error);
      return null;
    }
  }

  /**
   * 获取归档统计信息
   */
  async getStats(): Promise<ArchiveStats> {
    const fs = await import('fs');
    const path = await import('path');

    const stats: ArchiveStats = {
      totalFiles: 0,
      totalMessages: 0,
      totalSizeBytes: 0,
      topicStats: {},
    };

    // 从内存记录和索引文件中汇总
    const indexPath = path.join(this.config.storagePath, 'archive-index.json');
    let allRecords = [...this.archiveRecords];
    try {
      if (fs.existsSync(indexPath)) {
        const diskRecords: ArchiveRecord[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        // 合并去重
        const seenIds = new Set(allRecords.map(r => r.id));
        for (const r of diskRecords) {
          if (!seenIds.has(r.id)) {
            allRecords.push(r);
            seenIds.add(r.id);
          }
        }
      }
    } catch (e) {
      // 索引文件不存在或损坏，仅使用内存记录
    }

    for (const record of allRecords) {
      stats.totalFiles++;
      stats.totalMessages += record.messageCount;
      stats.totalSizeBytes += record.compressedSize || record.fileSize;

      if (!stats.topicStats[record.topic]) {
        stats.topicStats[record.topic] = { files: 0, messages: 0, sizeBytes: 0 };
      }
      stats.topicStats[record.topic].files++;
      stats.topicStats[record.topic].messages += record.messageCount;
      stats.topicStats[record.topic].sizeBytes += record.compressedSize || record.fileSize;

      const createdAt = new Date(record.createdAt);
      if (!stats.oldestArchive || createdAt < stats.oldestArchive) stats.oldestArchive = createdAt;
      if (!stats.newestArchive || createdAt > stats.newestArchive) stats.newestArchive = createdAt;
    }

    return stats;
  }

  /**
   * 列出归档记录
   */
  async listArchives(topic?: string): Promise<ArchiveRecord[]> {
    const fs = await import('fs');
    const path = await import('path');

    let allRecords = [...this.archiveRecords];
    const indexPath = path.join(this.config.storagePath, 'archive-index.json');
    try {
      if (fs.existsSync(indexPath)) {
        const diskRecords: ArchiveRecord[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const seenIds = new Set(allRecords.map(r => r.id));
        for (const r of diskRecords) {
          if (!seenIds.has(r.id)) {
            allRecords.push(r);
            seenIds.add(r.id);
          }
        }
      }
    } catch (e) { /* ignore */ }

    if (topic) {
      allRecords = allRecords.filter(r => r.topic === topic);
    }

    return allRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 从归档文件恢复消息到 Kafka Topic
   */
  async restore(archiveId: string): Promise<boolean> {
    const fs = await import('fs');
    const zlib = await import('zlib');
    const { promisify } = await import('util');
    const gunzip = promisify(zlib.gunzip);

    const record = this.archiveRecords.find(r => r.id === archiveId)
      || (await this.listArchives()).find(r => r.id === archiveId);

    if (!record) {
      log.warn(`[KafkaArchiver] Archive not found: ${archiveId}`);
      return false;
    }

    try {
      if (!fs.existsSync(record.filePath)) {
        log.warn(`[KafkaArchiver] Archive file not found: ${record.filePath}`);
        return false;
      }

      const raw = fs.readFileSync(record.filePath);
      let content: string;
      if (record.filePath.endsWith('.gz')) {
        const decompressed = await gunzip(raw);
        content = decompressed.toString('utf-8');
      } else {
        content = raw.toString('utf-8');
      }

      const lines = content.trim().split('\n').filter(Boolean);
      const messages = lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          key: parsed.key || undefined,
          value: parsed.value || '',
          headers: parsed.headers || {},
        };
      });

      if (messages.length > 0) {
        try {
          await kafkaCluster.produce(record.topic, messages);
          log.debug(`[KafkaArchiver] Restored ${messages.length} messages to topic ${record.topic}`);
        } catch (kafkaErr) {
          log.warn(`[KafkaArchiver] Failed to produce restored messages:`, kafkaErr);
          return false;
        }
      }

      return true;
    } catch (error) {
      log.warn(`[KafkaArchiver] Restore failed for ${archiveId}:`, error);
      return false;
    }
  }

  /**
   * 清理过期归档文件
   */
  async cleanup(beforeDate?: Date): Promise<number> {
    const fs = await import('fs');
    const path = await import('path');

    const cutoff = beforeDate || new Date(Date.now() - this.config.retentionDays * 86400000);
    let cleaned = 0;

    const allRecords = await this.listArchives();
    const toRemove: string[] = [];

    for (const record of allRecords) {
      if (new Date(record.createdAt) < cutoff) {
        try {
          if (fs.existsSync(record.filePath)) {
            fs.unlinkSync(record.filePath);
          }
          toRemove.push(record.id);
          cleaned++;
        } catch (e) {
          log.warn(`[KafkaArchiver] Failed to delete ${record.filePath}:`, e);
        }
      }
    }

    // 更新内存记录
    this.archiveRecords = this.archiveRecords.filter(r => !toRemove.includes(r.id));
    this.recentFiles = this.recentFiles.filter(f => {
      const matchRecord = allRecords.find(r => r.filePath === f.path);
      return !matchRecord || !toRemove.includes(matchRecord.id);
    });

    // 更新索引文件
    const indexPath = path.join(this.config.storagePath, 'archive-index.json');
    try {
      if (fs.existsSync(indexPath)) {
        const diskRecords: ArchiveRecord[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const filtered = diskRecords.filter(r => !toRemove.includes(r.id));
        fs.writeFileSync(indexPath, JSON.stringify(filtered, null, 2));
      }
    } catch (e) { /* ignore */ }

    log.debug(`[KafkaArchiver] Cleaned up ${cleaned} expired archives (before ${cutoff.toISOString()})`);
    return cleaned;
  }

  // ============ dataflowManager 所需方法 ============

  onArchive(callback: (file: ArchiveFile) => void): void {
    this.archiveCallbacks.push(callback);
  }

  async start(): Promise<void> {
    this._isRunning = true;
    log.debug('[KafkaArchiver] Started');

    // 启动定时归档（每小时归档一次配置的 topics）
    if (this.config.enabled && this.config.topics && this.config.topics.length > 0) {
      this.scheduledTimer = setInterval(async () => {
        for (const topic of this.config.topics || []) {
          try {
            await this.archive(topic);
          } catch (e) {
            log.warn(`[KafkaArchiver] Scheduled archive failed for ${topic}:`, e);
          }
        }
      }, 3600000); // 每小时
    }
  }

  async stop(): Promise<void> {
    this._isRunning = false;
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    log.debug('[KafkaArchiver] Stopped');
  }

  getStatus(): { isRunning: boolean; stats: { filesCreated: number } } {
    return { isRunning: this._isRunning, stats: { filesCreated: this._filesCreated } };
  }

  getRecentArchives(limit: number = 10): ArchiveFile[] {
    return this.recentFiles.slice(0, limit);
  }

  async triggerArchive(topic?: string): Promise<void> {
    if (topic) {
      await this.archive(topic);
    } else if (this.config.topics) {
      for (const t of this.config.topics) {
        await this.archive(t);
      }
    }
  }

  async cleanupExpiredArchives(): Promise<number> {
    return this.cleanup();
  }
}

export const kafkaArchiver = new KafkaArchiver();
