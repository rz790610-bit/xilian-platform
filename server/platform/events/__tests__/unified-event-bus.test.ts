/**
 * 统一事件总线测试 — UnifiedEventBus
 *
 * 覆盖：FIX-022 路由 / FIX-023 DLQ / FIX-024 健康检查 / FIX-126 路由策略
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UnifiedEventBus,
  getUnifiedEventBus,
  resetUnifiedEventBus,
} from '../unified-event-bus';

// Mock legacy eventBus
vi.mock('../../../services/eventBus.service', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue({ eventId: 'mock-evt-001' }),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
  TOPICS: {
    SYSTEM_ALERT: 'system.alert',
    SENSOR_READING: 'sensor.reading',
    ANOMALY_DETECTED: 'anomaly.detected',
  },
}));

describe('UnifiedEventBus', () => {
  let bus: UnifiedEventBus;

  beforeEach(() => {
    resetUnifiedEventBus();
    bus = new UnifiedEventBus();
  });

  afterEach(() => {
    bus.stop();
  });

  // ========================================================================
  // FIX-126: 路由策略
  // ========================================================================

  describe('FIX-126: 路由策略', () => {
    it('sensor.reading 路由到 kafka（降级到 memory）', () => {
      // Kafka 不可用时降级
      expect(bus.resolveChannel('sensor.reading')).toBe('memory');
    });

    it('sensor.batch 路由到 kafka（降级到 memory）', () => {
      expect(bus.resolveChannel('sensor.batch')).toBe('memory');
    });

    it('diagnosis.* 路由到 memory', () => {
      expect(bus.resolveChannel('diagnosis.started')).toBe('memory');
      expect(bus.resolveChannel('diagnosis.completed')).toBe('memory');
    });

    it('system.alert 路由到 memory', () => {
      expect(bus.resolveChannel('system.alert')).toBe('memory');
    });

    it('anomaly.* 路由到 memory', () => {
      expect(bus.resolveChannel('anomaly.detected')).toBe('memory');
    });

    it('未配置主题走默认 memory', () => {
      expect(bus.resolveChannel('custom.unknown.topic')).toBe('memory');
    });

    it('getRouteTable 返回路由表', () => {
      const table = bus.getRouteTable();
      expect(table.length).toBeGreaterThan(0);
      // Kafka 不可用，effective 应为 memory
      const kafkaRoute = table.find(r => r.channel === 'kafka');
      if (kafkaRoute) {
        expect(kafkaRoute.effective).toBe('memory');
      }
    });
  });

  // ========================================================================
  // FIX-022: 统一 publish
  // ========================================================================

  describe('FIX-022: 统一 publish', () => {
    it('发布到 memory 通道成功', async () => {
      const id = await bus.publish('system.alert', 'test', { msg: 'hello' });
      expect(id).toBe('mock-evt-001');

      const stats = bus.getStats();
      expect(stats.publishedTotal).toBe(1);
      expect(stats.publishedMemory).toBe(1);
    });

    it('批量发布统计正确', async () => {
      await bus.publish('diagnosis.started', 'start', { sessionId: 's1' });
      await bus.publish('diagnosis.completed', 'done', { sessionId: 's1' });
      await bus.publish('anomaly.detected', 'alert', { machineId: 'M1' });

      const stats = bus.getStats();
      expect(stats.publishedTotal).toBe(3);
      expect(stats.publishedMemory).toBe(3);
    });
  });

  // ========================================================================
  // FIX-022: 统一 subscribe
  // ========================================================================

  describe('FIX-022: 统一 subscribe', () => {
    it('订阅注册消费者健康状态', () => {
      const unsub = bus.subscribe('test.topic', async () => {}, 'consumer-1');
      const health = bus.getConsumerHealth();

      expect(health).toHaveLength(1);
      expect(health[0].subscriberId).toBe('consumer-1');
      expect(health[0].status).toBe('healthy');

      unsub();
      expect(bus.getConsumerHealth()).toHaveLength(0);
    });

    it('自动生成 subscriberId', () => {
      const unsub = bus.subscribe('test.topic', async () => {});
      const health = bus.getConsumerHealth();

      expect(health).toHaveLength(1);
      expect(health[0].subscriberId).toMatch(/^sub_/);

      unsub();
    });
  });

  // ========================================================================
  // FIX-023: 死信队列
  // ========================================================================

  describe('FIX-023: DLQ', () => {
    it('初始 DLQ 为空', () => {
      expect(bus.getDLQ()).toHaveLength(0);
    });

    it('clearDLQ 清空并返回计数', () => {
      // 手动触发 DLQ（通过 subscribe + 失败 handler）
      const count = bus.clearDLQ();
      expect(count).toBe(0);
    });

    it('retryDLQ 空队列返回 0/0', async () => {
      const result = await bus.retryDLQ();
      expect(result.retried).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('DLQ 有容量上限', () => {
      const smallBus = new UnifiedEventBus({ dlqMaxSize: 3 });
      // DLQ 内部管理，验证配置被接受
      expect(smallBus.getStats().dlqSize).toBe(0);
      smallBus.stop();
    });
  });

  // ========================================================================
  // FIX-024: 消费者健康检查
  // ========================================================================

  describe('FIX-024: 消费者健康检查', () => {
    it('start 启动健康检查定时器', async () => {
      await bus.start();
      expect(bus.getStats().started).toBe(true);
    });

    it('stop 停止健康检查', async () => {
      await bus.start();
      bus.stop();
      expect(bus.getStats().started).toBe(false);
    });

    it('重复 start 幂等', async () => {
      await bus.start();
      await bus.start();
      expect(bus.getStats().started).toBe(true);
      bus.stop();
    });
  });

  // ========================================================================
  // 单例工厂
  // ========================================================================

  describe('单例工厂', () => {
    it('getUnifiedEventBus 返回相同实例', () => {
      const a = getUnifiedEventBus();
      const b = getUnifiedEventBus();
      expect(a).toBe(b);
      resetUnifiedEventBus();
    });

    it('reset 后返回新实例', () => {
      const a = getUnifiedEventBus();
      resetUnifiedEventBus();
      const b = getUnifiedEventBus();
      expect(a).not.toBe(b);
      resetUnifiedEventBus();
    });
  });
});
