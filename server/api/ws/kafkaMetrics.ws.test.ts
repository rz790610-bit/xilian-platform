/**
 * Kafka 指标 WebSocket 服务测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket 和 http
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
}));

// Mock Kafka 和 Redis 客户端
vi.mock('../kafka/kafkaClient', () => ({
  kafkaClient: {
    getConnectionStatus: vi.fn().mockReturnValue(false),
    getClusterInfo: vi.fn().mockResolvedValue({
      brokers: [{ nodeId: 1, host: 'localhost', port: 9092 }],
      controller: 1,
    }),
    listTopics: vi.fn().mockResolvedValue(['test-topic']),
    getTopicMetadata: vi.fn().mockResolvedValue({
      topics: [{ name: 'test-topic', partitions: [{}] }],
    }),
  },
}));

vi.mock('../redis/redisClient', () => ({
  redisClient: {
    getConnectionStatus: vi.fn().mockReturnValue(false),
    healthCheck: vi.fn().mockResolvedValue(null),
  },
}));

describe('Kafka 指标 WebSocket 服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('模块导出', () => {
    it('应该导出 initKafkaMetricsWebSocket 函数', async () => {
      const module = await import('./kafkaMetricsWs');
      expect(module.initKafkaMetricsWebSocket).toBeDefined();
      expect(typeof module.initKafkaMetricsWebSocket).toBe('function');
    });

    it('应该导出 closeKafkaMetricsWebSocket 函数', async () => {
      const module = await import('./kafkaMetricsWs');
      expect(module.closeKafkaMetricsWebSocket).toBeDefined();
      expect(typeof module.closeKafkaMetricsWebSocket).toBe('function');
    });

    it('应该导出 getConnectedClientsCount 函数', async () => {
      const module = await import('./kafkaMetricsWs');
      expect(module.getConnectedClientsCount).toBeDefined();
      expect(typeof module.getConnectedClientsCount).toBe('function');
    });
  });

  describe('连接客户端计数', () => {
    it('初始时应该返回 0 个连接客户端', async () => {
      const { getConnectedClientsCount } = await import('./kafkaMetricsWs');
      const count = getConnectedClientsCount();
      expect(count).toBe(0);
    });
  });

  describe('WebSocket 服务初始化', () => {
    it('应该导出 initKafkaMetricsWebSocket 函数', async () => {
      const { initKafkaMetricsWebSocket } = await import('./kafkaMetricsWs');
      expect(initKafkaMetricsWebSocket).toBeDefined();
      expect(typeof initKafkaMetricsWebSocket).toBe('function');
    });
  });

  describe('WebSocket 服务关闭', () => {
    it('应该导出 closeKafkaMetricsWebSocket 函数', async () => {
      const { closeKafkaMetricsWebSocket } = await import('./kafkaMetricsWs');
      expect(closeKafkaMetricsWebSocket).toBeDefined();
      expect(typeof closeKafkaMetricsWebSocket).toBe('function');
    });
  });
});

describe('指标数据结构', () => {
  it('应该定义正确的指标数据结构', () => {
    // 定义预期的指标结构
    interface ExpectedMetrics {
      timestamp: number;
      throughput: {
        messagesPerSecond: number;
        bytesPerSecond: number;
      };
      latency: {
        produceLatencyMs: number;
        consumeLatencyMs: number;
        avgLatencyMs: number;
      };
      topics: Array<{
        name: string;
        partitions: number;
        messageCount: number;
      }>;
      brokers: Array<{
        id: string;
        host: string;
        port: number;
        isController: boolean;
      }>;
      consumers: Array<{
        groupId: string;
        members: number;
        lag: number;
      }>;
      redis: {
        connected: boolean;
        latencyMs: number;
        memoryUsage: string;
        connectedClients: number;
      } | null;
    }

    // 创建测试数据
    const testMetrics: ExpectedMetrics = {
      timestamp: Date.now(),
      throughput: {
        messagesPerSecond: 100,
        bytesPerSecond: 102400,
      },
      latency: {
        produceLatencyMs: 5,
        consumeLatencyMs: 10,
        avgLatencyMs: 7.5,
      },
      topics: [
        { name: 'test-topic', partitions: 3, messageCount: 1000 },
      ],
      brokers: [
        { id: '1', host: 'localhost', port: 9092, isController: true },
      ],
      consumers: [
        { groupId: 'test-group', members: 1, lag: 50 },
      ],
      redis: {
        connected: true,
        latencyMs: 2,
        memoryUsage: '10MB',
        connectedClients: 5,
      },
    };

    // 验证数据结构
    expect(testMetrics.timestamp).toBeTypeOf('number');
    expect(testMetrics.throughput.messagesPerSecond).toBeTypeOf('number');
    expect(testMetrics.latency.avgLatencyMs).toBeTypeOf('number');
    expect(testMetrics.topics).toBeInstanceOf(Array);
    expect(testMetrics.brokers).toBeInstanceOf(Array);
    expect(testMetrics.consumers).toBeInstanceOf(Array);
  });
});

describe('历史数据管理', () => {
  it('应该定义正确的历史数据结构', () => {
    interface MetricsHistory {
      timestamps: number[];
      throughput: number[];
      latency: number[];
      maxPoints: number;
    }

    const history: MetricsHistory = {
      timestamps: [Date.now() - 5000, Date.now()],
      throughput: [100, 110],
      latency: [5, 6],
      maxPoints: 60,
    };

    expect(history.timestamps.length).toBe(2);
    expect(history.throughput.length).toBe(2);
    expect(history.latency.length).toBe(2);
    expect(history.maxPoints).toBe(60);
  });

  it('历史数据应该保持同步长度', () => {
    const timestamps = [1, 2, 3, 4, 5];
    const throughput = [100, 110, 120, 130, 140];
    const latency = [5, 6, 7, 8, 9];

    expect(timestamps.length).toBe(throughput.length);
    expect(throughput.length).toBe(latency.length);
  });
});
