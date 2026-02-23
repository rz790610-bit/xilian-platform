/**
 * Redis 管理路由
 * 提供 Redis 状态查询、缓存管理等 API
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { config } from '../core/config';
import { redisClient, CACHE_KEYS } from '../lib/clients/redis.client';

export const redisRouter = router({
  // ============ 状态查询 ============

  /**
   * 获取 Redis 连接状态
   */
  getStatus: publicProcedure.query(async () => {
    const isConnected = redisClient.getConnectionStatus();
    const health = await redisClient.healthCheck();

    return {
      isConfigured: config.redis.enabled,
      isConnected,
      mode: isConnected ? 'redis' : 'memory',
      host: config.redis.host,
      port: config.redis.port,
      health,
    };
  }),

  /**
   * 健康检查
   */
  healthCheck: publicProcedure.query(async () => {
    return redisClient.healthCheck();
  }),

  /**
   * 获取 Redis 详细信息
   */
  getInfo: publicProcedure.query(async () => {
    const info = await redisClient.getInfo();
    return {
      version: info.redis_version,
      mode: info.redis_mode,
      os: info.os,
      uptime: info.uptime_in_seconds,
      connectedClients: info.connected_clients,
      usedMemory: info.used_memory_human,
      peakMemory: info.used_memory_peak_human,
      totalKeys: info.db0 ? info.db0.split(',')[0]?.split('=')[1] : '0',
    };
  }),

  // ============ 缓存管理 ============

  /**
   * 获取缓存键列表
   */
  listKeys: protectedProcedure
    .input(z.object({
      pattern: z.string().default('*'),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      const client = redisClient.getClient();
      if (!client) {
        return { keys: [], total: 0 };
      }

      try {
        const keys = await client.keys(input.pattern);
        return {
          keys: keys.slice(0, input.limit),
          total: keys.length,
        };
      } catch (error) {
        return { keys: [], total: 0, error: String(error) };
      }
    }),

  /**
   * 获取缓存值
   */
  getValue: protectedProcedure
    .input(z.object({
      key: z.string(),
    }))
    .query(async ({ input }) => {
      const value = await redisClient.get(input.key, true);
      const ttl = await redisClient.ttl(input.key);

      return {
        key: input.key,
        value,
        ttl,
        exists: value !== null,
      };
    }),

  /**
   * 设置缓存值
   */
  setValue: protectedProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
      ttl: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const success = await redisClient.set(input.key, input.value, input.ttl);
      return { success };
    }),

  /**
   * 删除缓存
   */
  deleteKey: protectedProcedure
    .input(z.object({
      key: z.string(),
    }))
    .mutation(async ({ input }) => {
      const deleted = await redisClient.del(input.key);
      return { deleted: deleted > 0 };
    }),

  /**
   * 批量删除缓存
   */
  deleteKeys: protectedProcedure
    .input(z.object({
      pattern: z.string(),
    }))
    .mutation(async ({ input }) => {
      const client = redisClient.getClient();
      if (!client) {
        return { deleted: 0 };
      }

      try {
        const keys = await client.keys(input.pattern);
        if (keys.length === 0) {
          return { deleted: 0 };
        }
        const deleted = await redisClient.del(keys);
        return { deleted };
      } catch (error) {
        return { deleted: 0, error: String(error) };
      }
    }),

  // ============ 限流管理 ============

  /**
   * 检查限流状态
   */
  checkRateLimit: publicProcedure
    .input(z.object({
      identifier: z.string(),
      limit: z.number().default(100),
      windowSeconds: z.number().default(60),
    }))
    .query(async ({ input }) => {
      return redisClient.checkRateLimit(
        input.identifier,
        input.limit,
        input.windowSeconds
      );
    }),

  /**
   * 获取限流统计
   */
  getRateLimitStats: protectedProcedure
    .input(z.object({
      identifier: z.string(),
    }))
    .query(async ({ input }) => {
      const client = redisClient.getClient();
      if (!client) {
        return { count: 0, windowStart: 0, windowEnd: 0 };
      }

      const key = `${CACHE_KEYS.RATE_LIMIT}${input.identifier}`;
      const now = Date.now();

      try {
        const count = await client.zcard(key);
        const oldest = await client.zrange(key, 0, 0, 'WITHSCORES');
        const newest = await client.zrange(key, -1, -1, 'WITHSCORES');

        return {
          count,
          windowStart: oldest[1] ? parseInt(oldest[1]) : now,
          windowEnd: newest[1] ? parseInt(newest[1]) : now,
        };
      } catch (error) {
        return { count: 0, windowStart: 0, windowEnd: 0 };
      }
    }),

  // ============ Kafka 指标 ============

  /**
   * 获取 Kafka 指标
   */
  getKafkaMetrics: publicProcedure.query(async () => {
    return redisClient.getKafkaMetrics();
  }),

  /**
   * 获取 Kafka 指标历史
   */
  getKafkaMetricsHistory: publicProcedure
    .input(z.object({
      minutes: z.number().min(1).max(1440).default(60),
    }))
    .query(async ({ input }) => {
      return redisClient.getKafkaMetricsHistory(input.minutes);
    }),

  // ============ 会话管理 ============

  /**
   * 获取会话信息
   */
  getSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(async ({ input }) => {
      const session = await redisClient.getSession(input.sessionId);
      return { session };
    }),

  /**
   * 删除会话
   */
  deleteSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const deleted = await redisClient.deleteSession(input.sessionId);
      return { deleted };
    }),

  // ============ 设备状态缓存 ============

  /**
   * 获取设备状态
   */
  getDeviceStatus: publicProcedure
    .input(z.object({
      nodeId: z.string(),
    }))
    .query(async ({ input }) => {
      return redisClient.getDeviceStatus(input.nodeId);
    }),

  /**
   * 批量获取设备状态
   */
  getMultipleDeviceStatus: publicProcedure
    .input(z.object({
      nodeIds: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      const statusMap = await redisClient.getMultipleDeviceStatus(input.nodeIds);
      return Object.fromEntries(statusMap);
    }),

  /**
   * 更新设备状态
   */
  updateDeviceStatus: protectedProcedure
    .input(z.object({
      nodeId: z.string(),
      online: z.boolean(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const success = await redisClient.cacheDeviceStatus(input.nodeId, {
        online: input.online,
        lastSeen: Date.now(),
        metadata: input.metadata,
      });
      return { success };
    }),

  // ============ 分布式锁 ============

  /**
   * 获取锁
   */
  acquireLock: protectedProcedure
    .input(z.object({
      lockName: z.string(),
      ttlSeconds: z.number().default(30),
    }))
    .mutation(async ({ input }) => {
      const lockId = await redisClient.acquireLock(input.lockName, input.ttlSeconds);
      return { lockId, acquired: lockId !== null };
    }),

  /**
   * 释放锁
   */
  releaseLock: protectedProcedure
    .input(z.object({
      lockName: z.string(),
      lockId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const released = await redisClient.releaseLock(input.lockName, input.lockId);
      return { released };
    }),
});

export type RedisRouter = typeof redisRouter;
