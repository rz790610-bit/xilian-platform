/**
 * Kafka 客户端服务
 * 提供 Kafka 连接、生产者、消费者的统一管理
 */

import { Kafka, Producer, Consumer, Admin, logLevel, CompressionTypes } from 'kafkajs';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('kafka');

// Kafka 配置接口

interface KafkaConfig {
  clientId: string;
  brokers: string[];
  connectionTimeout?: number;
  requestTimeout?: number;
  retry?: {
    initialRetryTime?: number;
    retries?: number;
  };
}

// 消息接口
export interface KafkaMessage {
  key?: string;
  value: string | Buffer;
  headers?: Record<string, string>;
  timestamp?: string;
  partition?: number;
}

// 消费者回调
export type MessageHandler = (message: {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string>;
  timestamp: string;
}) => Promise<void>;

// 默认配置
const DEFAULT_CONFIG: KafkaConfig = {
  clientId: 'xilian-platform',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 3,  // 降低重试次数，避免本地开发时大量错误日志
  },
};

// Kafka Topics 统一从 kafka-topics.const.ts 导入
export { KAFKA_TOPICS } from '../../shared/constants/kafka-topics.const';

// Kafka 客户端单例
class KafkaClientManager {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private isConnected: boolean = false;
  private config: KafkaConfig;

  constructor(config: KafkaConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * 初始化 Kafka 客户端
   */
  async initialize(): Promise<void> {
    if (this.kafka) {
      return;
    }
    log.debug('[Kafka] 正在初始化 Kafka 客户端...');
    log.debug(`[Kafka] Brokers: ${this.config.brokers.join(', ')}`);
    
    try {
      // P0-13: Kafka SASL/SSL 认证支持
      // 通过环境变量 KAFKA_SASL_MECHANISM / KAFKA_SASL_USERNAME / KAFKA_SASL_PASSWORD 配置
      const kafkaOptions: any = {
        clientId: this.config.clientId,
        brokers: this.config.brokers,
        connectionTimeout: this.config.connectionTimeout,
        requestTimeout: this.config.requestTimeout,
        retry: this.config.retry,
        logLevel: logLevel.WARN,
      };
      const saslMechanism = process.env.KAFKA_SASL_MECHANISM as 'plain' | 'scram-sha-256' | 'scram-sha-512' | undefined;
      const saslUsername = process.env.KAFKA_SASL_USERNAME;
      const saslPassword = process.env.KAFKA_SASL_PASSWORD;
      if (saslMechanism && saslUsername && saslPassword) {
        kafkaOptions.sasl = {
          mechanism: saslMechanism,
          username: saslUsername,
          password: saslPassword,
        };
        kafkaOptions.ssl = true;
        log.debug('[Kafka] SASL authentication enabled');
      } else if (process.env.NODE_ENV === 'production') {
        log.warn('[Kafka] WARNING: No SASL credentials configured in production');
      }
      // 单独的 SSL 配置（无 SASL 时也可启用 SSL）
      if (process.env.KAFKA_SSL === 'true' && !kafkaOptions.ssl) {
        kafkaOptions.ssl = true;
      }
      this.kafka = new Kafka(kafkaOptions);
      // 初始化 Admin 客户端
      this.admin = this.kafka.admin();
      await this.admin.connect();
      // 初始化 Producer
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });
      await this.producer.connect();
      this.isConnected = true;
      log.debug('[Kafka] Kafka 客户端初始化完成');
    } catch (error: any) {
      this.isConnected = false;
      log.error(`[Kafka] 初始化失败 (服务将以降级模式运行): ${error.message}`);
      // 不抛出异常，允许平台在没有 Kafka 的情况下启动
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * 发送消息到指定主题
   */
  async produce(topic: string, messages: KafkaMessage[]): Promise<void> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka Producer 未连接');
    }

    const kafkaMessages = messages.map(msg => ({
      key: msg.key,
      value: typeof msg.value === 'string' ? msg.value : msg.value,
      headers: msg.headers ? Object.fromEntries(
        Object.entries(msg.headers).map(([k, v]) => [k, Buffer.from(v)])
      ) : undefined,
      timestamp: msg.timestamp,
      partition: msg.partition,
    }));

    await this.producer.send({
      topic,
      messages: kafkaMessages,
      compression: CompressionTypes.GZIP,
    });
  }

  /**
   * 批量发送消息
   */
  async produceBatch(topicMessages: { topic: string; messages: KafkaMessage[] }[]): Promise<void> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka Producer 未连接');
    }

    await this.producer.sendBatch({
      topicMessages: topicMessages.map(tm => ({
        topic: tm.topic,
        messages: tm.messages.map(msg => ({
          key: msg.key,
          value: typeof msg.value === 'string' ? msg.value : msg.value,
          headers: msg.headers ? Object.fromEntries(
            Object.entries(msg.headers).map(([k, v]) => [k, Buffer.from(v)])
          ) : undefined,
        })),
      })),
      compression: CompressionTypes.GZIP,
    });
  }

  /**
   * 创建消费者并订阅主题
   */
  async subscribe(
    groupId: string,
    topics: string[],
    handler: MessageHandler,
    fromBeginning: boolean = false
  ): Promise<string> {
    if (!this.kafka) {
      throw new Error('Kafka 客户端未初始化');
    }

    const consumerId = `${groupId}-${Date.now()}`;
    const consumer = this.kafka.consumer({ groupId });

    await consumer.connect();
    await consumer.subscribe({ topics, fromBeginning });

    await consumer.run({
      // P1-KAFKA-1: 添加异常处理，防止单条消息处理失败导致消费者崩溃
      eachMessage: async ({ topic, partition, message }) => {
        try {
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
        } catch (err) {
          log.error(`[Kafka] 消息处理失败 topic=${topic} partition=${partition} offset=${message.offset}:`, err);
          // 不抛出异常，避免消费者崩溃，消息将被跳过
        }
      },
    });

    this.consumers.set(consumerId, consumer);
    log.debug(`[Kafka] 消费者 ${consumerId} 已订阅主题: ${topics.join(', ')}`);

    return consumerId;
  }

  /**
   * 取消订阅并断开消费者
   */
  async unsubscribe(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(consumerId);
      log.debug(`[Kafka] 消费者 ${consumerId} 已断开`);
    }
  }

  /**
   * 创建主题
   */
  async createTopic(
    topic: string,
    numPartitions: number = 3,
    replicationFactor: number = 1
  ): Promise<void> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    const existingTopics = await this.admin.listTopics();
    if (existingTopics.includes(topic)) {
      log.debug(`[Kafka] 主题 ${topic} 已存在`);
      return;
    }

    await this.admin.createTopics({
      topics: [{
        topic,
        numPartitions,
        replicationFactor,
      }],
    });

    log.debug(`[Kafka] 主题 ${topic} 创建成功`);
  }

  /**
   * 删除主题
   */
  async deleteTopic(topic: string): Promise<void> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    await this.admin.deleteTopics({ topics: [topic] });
    log.debug(`[Kafka] 主题 ${topic} 已删除`);
  }

  /**
   * 列出所有主题
   */
  async listTopics(): Promise<string[]> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    return await this.admin.listTopics();
  }

  /**
   * 获取主题元数据
   */
  async getTopicMetadata(topics?: string[]): Promise<any> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    return await this.admin.fetchTopicMetadata({ topics: topics || [] });
  }

  /**
   * 获取消费者组偏移量
   */
  async getConsumerGroupOffsets(groupId: string, topics: string[]): Promise<any> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    return await this.admin.fetchOffsets({ groupId, topics: topics || [] });
  }

  /**
   * 获取集群信息
   */
  async getClusterInfo(): Promise<{
    brokers: { nodeId: number; host: string; port: number }[];
    controller: number | null;
    clusterId: string;
  }> {
    if (!this.admin) {
      throw new Error('Kafka Admin 未连接');
    }

    const cluster = await this.admin.describeCluster();
    return {
      brokers: cluster.brokers,
      controller: cluster.controller,
      clusterId: cluster.clusterId,
    };
  }

  /**
   * 关闭所有连接
   */
  async shutdown(): Promise<void> {
    log.debug('[Kafka] 正在关闭 Kafka 连接...');

    // 关闭所有消费者
    for (const [consumerId, consumer] of Array.from(this.consumers.entries())) {
      await consumer.disconnect();
      log.debug(`[Kafka] 消费者 ${consumerId} 已断开`);
    }
    this.consumers.clear();

    // 关闭生产者
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
    this.isConnected = false;
    log.debug('[Kafka] Kafka 连接已关闭');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    brokers: number;
    topics: number;
    error?: string;
  }> {
    try {
      if (!this.isConnected || !this.admin) {
        return { connected: false, brokers: 0, topics: 0, error: '未连接' };
      }

      const cluster = await this.admin.describeCluster();
      const topics = await this.admin.listTopics();

      return {
        connected: true,
        brokers: cluster.brokers.length,
        topics: topics.length,
      };
    } catch (error) {
      return {
        connected: false,
        brokers: 0,
        topics: 0,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }
}

// 导出单例实例
export const kafkaClient = new KafkaClientManager();

// 导出类型
export type { KafkaConfig };
