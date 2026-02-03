/**
 * Redis 客户端测试
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { redisClient, CACHE_KEYS } from './redisClient';

describe('Redis Client', () => {
  describe('CACHE_KEYS', () => {
    it('should have all required cache key prefixes', () => {
      expect(CACHE_KEYS.SESSION).toBe('session:');
      expect(CACHE_KEYS.RATE_LIMIT).toBe('ratelimit:');
      expect(CACHE_KEYS.SENSOR_DATA).toBe('sensor:');
      expect(CACHE_KEYS.DEVICE_STATUS).toBe('device:status:');
      expect(CACHE_KEYS.AGGREGATION).toBe('agg:');
      expect(CACHE_KEYS.LOCK).toBe('lock:');
      expect(CACHE_KEYS.KAFKA_METRICS).toBe('kafka:metrics:');
    });
  });

  describe('Connection Status', () => {
    it('should report connection status', () => {
      const status = redisClient.getConnectionStatus();
      expect(typeof status).toBe('boolean');
    });
  });

  describe('Health Check', () => {
    it('should return health check result', async () => {
      const health = await redisClient.healthCheck();
      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('latencyMs');
      expect(typeof health.connected).toBe('boolean');
      expect(typeof health.latencyMs).toBe('number');
    });
  });

  describe('Memory Fallback Mode', () => {
    // 在没有 Redis 连接时，应该优雅降级

    it('should handle set operation in memory mode', async () => {
      const result = await redisClient.set('test-key', 'test-value');
      // 在内存模式下返回 false
      expect(typeof result).toBe('boolean');
    });

    it('should handle get operation in memory mode', async () => {
      const result = await redisClient.get('test-key');
      // 在内存模式下返回 null
      expect(result).toBeNull();
    });

    it('should handle exists operation in memory mode', async () => {
      const result = await redisClient.exists('test-key');
      expect(result).toBe(false);
    });

    it('should handle del operation in memory mode', async () => {
      const result = await redisClient.del('test-key');
      expect(result).toBe(0);
    });

    it('should handle ttl operation in memory mode', async () => {
      const result = await redisClient.ttl('test-key');
      expect(result).toBe(-2);
    });
  });

  describe('Session Cache', () => {
    it('should handle setSession in memory mode', async () => {
      const result = await redisClient.setSession('session-123', { userId: 'user-1' });
      expect(typeof result).toBe('boolean');
    });

    it('should handle getSession in memory mode', async () => {
      const result = await redisClient.getSession('session-123');
      expect(result).toBeNull();
    });

    it('should handle deleteSession in memory mode', async () => {
      const result = await redisClient.deleteSession('session-123');
      expect(typeof result).toBe('boolean');
    });

    it('should handle refreshSession in memory mode', async () => {
      const result = await redisClient.refreshSession('session-123');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Rate Limiting', () => {
    it('should return rate limit result in memory mode', async () => {
      const result = await redisClient.checkRateLimit('test-user', 100, 60);
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
      // 内存模式下总是允许
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });

    it('should handle incrementCounter in memory mode', async () => {
      const result = await redisClient.incrementCounter('test-counter');
      expect(result).toBe(0);
    });
  });

  describe('Sensor Data Cache', () => {
    it('should handle cacheSensorData in memory mode', async () => {
      const result = await redisClient.cacheSensorData('device-1', 'sensor-1', {
        value: 25.5,
        timestamp: Date.now(),
        unit: '°C',
      });
      expect(typeof result).toBe('boolean');
    });

    it('should handle getSensorData in memory mode', async () => {
      const result = await redisClient.getSensorData('device-1', 'sensor-1');
      expect(result).toBeNull();
    });
  });

  describe('Device Status Cache', () => {
    it('should handle cacheDeviceStatus in memory mode', async () => {
      const result = await redisClient.cacheDeviceStatus('device-1', {
        online: true,
        lastSeen: Date.now(),
      });
      expect(typeof result).toBe('boolean');
    });

    it('should handle getDeviceStatus in memory mode', async () => {
      const result = await redisClient.getDeviceStatus('device-1');
      expect(result).toBeNull();
    });

    it('should handle getMultipleDeviceStatus in memory mode', async () => {
      const result = await redisClient.getMultipleDeviceStatus(['device-1', 'device-2']);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('Kafka Metrics Cache', () => {
    it('should handle cacheKafkaMetrics in memory mode', async () => {
      const result = await redisClient.cacheKafkaMetrics({
        messagesPerSecond: 100,
        bytesPerSecond: 1024,
        consumerLag: 0,
        activeTopics: 5,
        timestamp: Date.now(),
      });
      expect(typeof result).toBe('boolean');
    });

    it('should handle getKafkaMetrics in memory mode', async () => {
      const result = await redisClient.getKafkaMetrics();
      expect(result).toBeNull();
    });

    it('should handle getKafkaMetricsHistory in memory mode', async () => {
      const result = await redisClient.getKafkaMetricsHistory(60);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('Distributed Lock', () => {
    it('should return lock id in memory mode', async () => {
      const lockId = await redisClient.acquireLock('test-lock');
      expect(lockId).not.toBeNull();
      expect(typeof lockId).toBe('string');
      expect(lockId).toContain('memory-lock-');
    });

    it('should release lock in memory mode', async () => {
      const result = await redisClient.releaseLock('test-lock', 'any-id');
      expect(result).toBe(true);
    });
  });
});
