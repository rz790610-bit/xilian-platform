/**
 * Kafka 管理路由
 * 提供 Kafka 集群管理、主题管理、消费者组管理等 API
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { config } from '../core/config';
import { kafkaClient, KAFKA_TOPICS } from '../lib/clients/kafka.client';
import { kafkaEventBus } from '../lib/clients/kafkaEventBus';
import { kafkaStreamProcessor } from '../services/kafkaStream.processor';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('kafka');

export const kafkaRouter = router({
  // ============ 集群状态 ============

  /**
   * 获取 Kafka 集群状态
   */

  getClusterStatus: publicProcedure.query(async () => {
    const kafkaBrokers = config.kafka.brokers.join(',');
    const isConfigured = config.kafka.brokers.length > 0 && config.kafka.brokers[0] !== 'localhost:9092';

    let clusterInfo = null;
    let health = null;
    let statusMessage = '';

    if (isConfigured) {
      try {
        await kafkaClient.initialize();
        clusterInfo = await kafkaClient.getClusterInfo();
        health = await kafkaClient.healthCheck();
        statusMessage = health?.connected ? 'Kafka 集群运行正常' : 'Kafka 集群无法连接';
      } catch (error) {
        log.warn('[KafkaRouter] 获取集群状态失败:', error);
        statusMessage = 'Kafka 连接失败，请检查 Broker 配置';
      }
    } else {
      statusMessage = '未配置 KAFKA_BROKERS 环境变量，当前使用内存模式';
    }

    return {
      isConfigured,
      brokers: kafkaBrokers.split(','),
      mode: isConfigured && health?.connected ? 'kafka' : 'memory',
      cluster: clusterInfo,
      health,
      statusMessage,
    };
  }),

  /**
   * 获取 Kafka 健康状态
   */
  healthCheck: publicProcedure.query(async () => {
    try {
      const health = await kafkaClient.healthCheck();
      return {
        ...health,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        connected: false,
        brokers: 0,
        topics: 0,
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date().toISOString(),
      };
    }
  }),

  // ============ 主题管理 ============

  /**
   * 列出所有主题
   */
  listTopics: publicProcedure.query(async () => {
    try {
      if (!kafkaClient.getConnectionStatus()) {
        // 返回预定义的主题列表
        return {
          topics: Object.values(KAFKA_TOPICS),
          source: 'predefined',
        };
      }

      const topics = await kafkaClient.listTopics();
      return {
        topics,
        source: 'kafka',
      };
    } catch (error) {
      return {
        topics: Object.values(KAFKA_TOPICS),
        source: 'predefined',
        error: error instanceof Error ? error.message : '获取主题失败',
      };
    }
  }),

  /**
   * 获取主题元数据
   */
  getTopicMetadata: publicProcedure
    .input(z.object({
      topics: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      try {
        if (!kafkaClient.getConnectionStatus()) {
          return {
            topics: [],
            error: 'Kafka 未连接',
          };
        }

        const metadata = await kafkaClient.getTopicMetadata(input.topics);
        return {
          topics: metadata.topics,
        };
      } catch (error) {
        return {
          topics: [],
          error: error instanceof Error ? error.message : '获取元数据失败',
        };
      }
    }),

  /**
   * 创建主题
   */
  createTopic: protectedProcedure
    .input(z.object({
      topic: z.string().min(1).max(255),
      numPartitions: z.number().min(1).max(100).default(3),
      replicationFactor: z.number().min(1).max(10).default(1),
    }))
    .mutation(async ({ input }) => {
      try {
        if (!kafkaClient.getConnectionStatus()) {
          throw new Error('Kafka 未连接');
        }

        await kafkaClient.createTopic(
          input.topic,
          input.numPartitions,
          input.replicationFactor
        );

        return {
          success: true,
          topic: input.topic,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '创建主题失败',
        };
      }
    }),

  /**
   * 删除主题
   */
  deleteTopic: protectedProcedure
    .input(z.object({
      topic: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      try {
        if (!kafkaClient.getConnectionStatus()) {
          throw new Error('Kafka 未连接');
        }

        await kafkaClient.deleteTopic(input.topic);

        return {
          success: true,
          topic: input.topic,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '删除主题失败',
        };
      }
    }),

  // ============ 预定义主题 ============

  /**
   * 获取预定义主题列表
   */
  getPredefinedTopics: publicProcedure.query(() => {
    return Object.entries(KAFKA_TOPICS).map(([key, value]) => ({
      key,
      topic: value,
      description: getTopicDescription(key),
    }));
  }),

  /**
   * 初始化所有预定义主题
   */
  initializeTopics: protectedProcedure.mutation(async () => {
    try {
      if (!kafkaClient.getConnectionStatus()) {
        await kafkaClient.initialize();
      }

      const results: { topic: string; success: boolean; error?: string }[] = [];

      for (const topic of Object.values(KAFKA_TOPICS)) {
        try {
          await kafkaClient.createTopic(topic, 3, 1);
          results.push({ topic, success: true });
        } catch (error) {
          results.push({
            topic,
            success: false,
            error: error instanceof Error ? error.message : '创建失败',
          });
        }
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      };
    }
  }),

  // ============ 事件总线 ============

  /**
   * 获取事件总线状态
   */
  getEventBusStatus: publicProcedure.query(async () => {
    return kafkaEventBus.getKafkaStatus();
  }),

  /**
   * 获取事件统计
   */
  getEventBusStats: publicProcedure
    .input(z.object({
      startTime: z.number().optional(),
      endTime: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const timeRange = input?.startTime && input?.endTime
        ? { start: input.startTime, end: input.endTime }
        : undefined;
      return kafkaEventBus.getEventStats(timeRange);
    }),

  // ============ 流处理器 ============

  /**
   * 获取流处理器状态
   */
  getStreamProcessorStatus: publicProcedure.query(() => {
    return kafkaStreamProcessor.getStatus();
  }),

  /**
   * 获取窗口统计
   */
  getWindowStats: publicProcedure.query(() => {
    return kafkaStreamProcessor.getWindowStats();
  }),

  /**
   * 启动流处理器
   */
  startStreamProcessor: protectedProcedure.mutation(async () => {
    try {
      await kafkaStreamProcessor.start();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '启动失败',
      };
    }
  }),

  /**
   * 停止流处理器
   */
  stopStreamProcessor: protectedProcedure.mutation(async () => {
    try {
      await kafkaStreamProcessor.stop();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '停止失败',
      };
    }
  }),

  // ============ 异常检测 ============

  /**
   * 查询异常检测结果
   */
  queryAnomalies: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      sensorId: z.string().optional(),
      severity: z.string().optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      return kafkaStreamProcessor.queryAnomalies(input);
    }),

  /**
   * 查询聚合数据
   */
  queryAggregations: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      sensorId: z.string().optional(),
      metricName: z.string().optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      return kafkaStreamProcessor.queryAggregations(input);
    }),

  // ============ 测试功能 ============

  /**
   * 发送测试数据点
   */
  pushTestDataPoint: protectedProcedure
    .input(z.object({
      nodeId: z.string(),
      sensorId: z.string(),
      value: z.number(),
      metricName: z.string().default('temperature'),
    }))
    .mutation(async ({ input }) => {
      const result = await kafkaStreamProcessor.pushDataPoint({
        timestamp: Date.now(),
        value: input.value,
        deviceCode: input.nodeId, // nodeId as deviceCode
        sensorId: input.sensorId,
        metricName: input.metricName,
      });

      return {
        success: true,
        result,
      };
    }),
});

/**
 * 获取主题描述
 */
function getTopicDescription(key: string): string {
  const descriptions: Record<string, string> = {
    SENSOR_READINGS: '传感器读数数据流',
    TELEMETRY: '设备遥测数据流',
    DEVICE_EVENTS: '设备事件（状态变化、错误等）',
    ANOMALY_ALERTS: '异常告警通知',
    ANOMALIES: '异常检测结果',
    AGGREGATIONS: '数据聚合结果',
    DIAGNOSIS_TASKS: '诊断任务队列',
    WORKFLOW_EVENTS: '工作流事件',
    SYSTEM_LOGS: '系统日志',
  };
  return descriptions[key] || '未知主题';
}

export type KafkaRouter = typeof kafkaRouter;
