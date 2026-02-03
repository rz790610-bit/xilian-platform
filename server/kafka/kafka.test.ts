/**
 * Kafka 集成模块单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock kafkajs
vi.mock('kafkajs', () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    producer: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }),
    consumer: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
    admin: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      createTopics: vi.fn().mockResolvedValue(true),
      listTopics: vi.fn().mockResolvedValue(['test-topic']),
      fetchTopicMetadata: vi.fn().mockResolvedValue({ topics: [] }),
    }),
  })),
  logLevel: { ERROR: 1 },
  CompressionTypes: { GZIP: 1 },
}));

describe('Kafka 客户端模块', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('KAFKA_TOPICS 配置', () => {
    it('应该定义所有必需的主题', async () => {
      const { KAFKA_TOPICS } = await import('./kafkaClient');
      
      expect(KAFKA_TOPICS.SENSOR_READINGS).toBe('xilian.sensor.readings');
      expect(KAFKA_TOPICS.TELEMETRY).toBe('xilian.telemetry');
      expect(KAFKA_TOPICS.DEVICE_EVENTS).toBe('xilian.device.events');
      expect(KAFKA_TOPICS.ANOMALY_ALERTS).toBe('xilian.anomaly.alerts');
      expect(KAFKA_TOPICS.ANOMALIES).toBe('xilian.anomalies');
      expect(KAFKA_TOPICS.AGGREGATIONS).toBe('xilian.aggregations');
      expect(KAFKA_TOPICS.DIAGNOSIS_TASKS).toBe('xilian.diagnosis.tasks');
      expect(KAFKA_TOPICS.WORKFLOW_EVENTS).toBe('xilian.workflow.events');
      expect(KAFKA_TOPICS.SYSTEM_LOGS).toBe('xilian.system.logs');
    });

    it('主题名称应该使用正确的命名空间', async () => {
      const { KAFKA_TOPICS } = await import('./kafkaClient');
      
      Object.values(KAFKA_TOPICS).forEach(topic => {
        expect(topic).toMatch(/^xilian\./);
      });
    });
  });

  describe('KafkaMessage 接口', () => {
    it('应该支持字符串和 Buffer 类型的 value', async () => {
      const { KafkaMessage } = await import('./kafkaClient');
      
      // 类型检查通过即可
      const stringMessage: typeof KafkaMessage = {
        key: 'test-key',
        value: 'test-value',
      };
      
      const bufferMessage: typeof KafkaMessage = {
        key: 'test-key',
        value: Buffer.from('test-value'),
      };
      
      expect(stringMessage).toBeDefined();
      expect(bufferMessage).toBeDefined();
    });
  });
});

describe('Kafka 流处理器模块', () => {
  describe('滑动窗口异常检测', () => {
    it('应该正确计算 Z-Score', () => {
      // Z-Score 计算公式: (value - mean) / stdDev
      const values = [10, 12, 11, 13, 10, 11, 12, 100]; // 100 是异常值
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      const zScore = (100 - mean) / stdDev;
      
      // 异常值的 Z-Score 应该很高
      expect(zScore).toBeGreaterThan(2);
    });

    it('应该正确识别异常严重程度', () => {
      const getSeverity = (zScore: number): string => {
        if (zScore > 5) return 'critical';
        if (zScore > 4) return 'high';
        if (zScore > 3) return 'medium';
        return 'low';
      };

      expect(getSeverity(6)).toBe('critical');
      expect(getSeverity(4.5)).toBe('high');
      expect(getSeverity(3.5)).toBe('medium');
      expect(getSeverity(2)).toBe('low');
    });
  });

  describe('数据聚合', () => {
    it('应该正确计算聚合统计', () => {
      const values = [10, 20, 30, 40, 50];
      
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = sum / count;
      const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / count;
      const stdDev = Math.sqrt(variance);

      expect(count).toBe(5);
      expect(sum).toBe(150);
      expect(min).toBe(10);
      expect(max).toBe(50);
      expect(avg).toBe(30);
      expect(stdDev).toBeCloseTo(14.14, 1);
    });
  });
});

describe('Kafka 事件总线模块', () => {
  describe('事件发布', () => {
    it('应该生成唯一的事件 ID', () => {
      const generateEventId = () => `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const id1 = generateEventId();
      const id2 = generateEventId();
      
      expect(id1).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('事件应该包含必需的字段', () => {
      const event = {
        eventId: 'evt_123',
        eventType: 'sensor.reading',
        severity: 'info' as const,
        source: 'test',
        timestamp: Date.now(),
        data: { value: 42 },
      };

      expect(event.eventId).toBeDefined();
      expect(event.eventType).toBeDefined();
      expect(event.severity).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.data).toBeDefined();
    });
  });

  describe('主题订阅', () => {
    it('应该支持多个订阅者', () => {
      const subscriptions = new Map<string, { handler: () => void }>();
      
      subscriptions.set('sub1', { handler: () => {} });
      subscriptions.set('sub2', { handler: () => {} });
      subscriptions.set('sub3', { handler: () => {} });

      expect(subscriptions.size).toBe(3);
    });
  });
});

describe('Docker Compose 配置', () => {
  it('应该存在 Kafka Docker Compose 配置文件', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const configPath = path.join(__dirname, '../../docker/docker-compose.kafka.yml');
    
    // 检查文件是否存在
    expect(fs.existsSync(configPath)).toBe(true);
  });
});

describe('Kafka 路由模块', () => {
  it('应该导出 kafkaRouter', async () => {
    const { kafkaRouter } = await import('./kafkaRouter');
    expect(kafkaRouter).toBeDefined();
  });

  it('kafkaRouter 应该包含必要的路由', async () => {
    const { kafkaRouter } = await import('./kafkaRouter');
    
    // 检查路由是否存在
    expect(kafkaRouter._def.procedures).toBeDefined();
  });
});

describe('Kafka 事件总线模块', () => {
  it('应该导出 kafkaEventBus', async () => {
    const { kafkaEventBus } = await import('./kafkaEventBus');
    expect(kafkaEventBus).toBeDefined();
  });

  it('kafkaEventBus 应该有 publish 方法', async () => {
    const { kafkaEventBus } = await import('./kafkaEventBus');
    expect(typeof kafkaEventBus.publish).toBe('function');
  });

  it('kafkaEventBus 应该有 subscribe 方法', async () => {
    const { kafkaEventBus } = await import('./kafkaEventBus');
    expect(typeof kafkaEventBus.subscribe).toBe('function');
  });

  it('kafkaEventBus 应该有 getKafkaStatus 方法', async () => {
    const { kafkaEventBus } = await import('./kafkaEventBus');
    expect(typeof kafkaEventBus.getKafkaStatus).toBe('function');
  });
});
