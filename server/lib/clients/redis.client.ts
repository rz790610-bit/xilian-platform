/**
 * Redis 客户端服务
 * 提供 Redis 连接管理、缓存操作、限流等功能
 */

import Redis from 'ioredis';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('redis');

// Redis 配置接口

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayMs?: number;
}

// 默认配置
const DEFAULT_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'xilian:',
  maxRetriesPerRequest: 3,
  retryDelayMs: 100,
};

// 缓存键前缀
export const CACHE_KEYS = {
  SESSION: 'session:',
  RATE_LIMIT: 'ratelimit:',
  SENSOR_DATA: 'sensor:',
  DEVICE_STATUS: 'device:status:',
  AGGREGATION: 'agg:',
  LOCK: 'lock:',
  KAFKA_METRICS: 'kafka:metrics:',
} as const;

// Redis 客户端管理器
class RedisClientManager {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected: boolean = false;
  private config: RedisConfig;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 5;

  constructor(config: RedisConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize(): Promise<void> {
    if (this.client && this.isConnected) {
      return;
    }

    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl && !process.env.REDIS_HOST) {
      log.debug('[Redis] No Redis configuration found, using memory fallback');
      return;
    }

    log.debug('[Redis] Initializing Redis client...');

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryStrategy: (times) => {
            if (times > this.maxConnectionAttempts) {
              log.error('[Redis] Max connection attempts reached');
              return null;
            }
            return Math.min(times * this.config.retryDelayMs!, 3000);
          },
        });
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryStrategy: (times) => {
            if (times > this.maxConnectionAttempts) {
              return null;
            }
            return Math.min(times * this.config.retryDelayMs!, 3000);
          },
        });
      }

      this.client.on('connect', () => {
        log.debug('[Redis] Connected to Redis server');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on('error', (err) => {
        log.error('[Redis] Connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        log.debug('[Redis] Connection closed');
        this.isConnected = false;
      });

      // 等待连接就绪
      await this.client.ping();
      log.debug('[Redis] Redis client initialized successfully');
    } catch (error) {
      log.error('[Redis] Failed to initialize:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 获取 Redis 客户端实例
   */
  getClient(): Redis | null {
    return this.client;
  }

  // ============ 基础操作 ============

  /**
   * 设置缓存值
   */
  async set(key: string, value: string | number | object, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) return false;

    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      log.error('[Redis] Set error:', error);
      return false;
    }
  }

  /**
   * 获取缓存值
   */
  async get<T = string>(key: string, parse: boolean = false): Promise<T | null> {
    if (!this.client) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      if (parse) {
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      }
      return value as unknown as T;
    } catch (error) {
      log.error('[Redis] Get error:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string | string[]): Promise<number> {
    if (!this.client) return 0;

    try {
      const keys = Array.isArray(key) ? key : [key];
      return await this.client.del(...keys);
    } catch (error) {
      log.error('[Redis] Del error:', error);
      return 0;
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      log.error('[Redis] Exists error:', error);
      return false;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) return false;

    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      log.error('[Redis] Expire error:', error);
      return false;
    }
  }

  /**
   * 获取剩余过期时间
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) return -2;

    try {
      return await this.client.ttl(key);
    } catch (error) {
      log.error('[Redis] TTL error:', error);
      return -2;
    }
  }

  // ============ 会话缓存 ============

  /**
   * 设置会话数据
   */
  async setSession(sessionId: string, data: object, ttlSeconds: number = 86400): Promise<boolean> {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    return this.set(key, data, ttlSeconds);
  }

  /**
   * 获取会话数据
   */
  async getSession<T = object>(sessionId: string): Promise<T | null> {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    return this.get<T>(key, true);
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    const result = await this.del(key);
    return result > 0;
  }

  /**
   * 刷新会话过期时间
   */
  async refreshSession(sessionId: string, ttlSeconds: number = 86400): Promise<boolean> {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    return this.expire(key, ttlSeconds);
  }

  // ============ 限流功能 ============

  /**
   * 检查并增加限流计数
   * 使用滑动窗口算法
   */
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.client) {
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
    }

    const key = `${CACHE_KEYS.RATE_LIMIT}${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    try {
      // 使用 Redis 事务
      const pipeline = this.client.pipeline();
      
      // 移除过期的请求记录
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // 获取当前窗口内的请求数
      pipeline.zcard(key);
      
      // 添加当前请求
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // 设置过期时间
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();
      
      if (!results) {
        return { allowed: true, remaining: limit, resetAt: now + windowSeconds * 1000 };
      }

      const currentCount = (results[1]?.[1] as number) || 0;
      const allowed = currentCount < limit;
      const remaining = Math.max(0, limit - currentCount - 1);

      if (!allowed) {
        // 如果超限，移除刚添加的记录
        await this.client.zremrangebyscore(key, now, now);
      }

      return {
        allowed,
        remaining,
        resetAt: now + windowSeconds * 1000,
      };
    } catch (error) {
      log.error('[Redis] Rate limit error:', error);
      return { allowed: true, remaining: limit, resetAt: now + windowSeconds * 1000 };
    }
  }

  /**
   * 简单计数器限流
   */
  async incrementCounter(key: string, ttlSeconds: number = 60): Promise<number> {
    if (!this.client) return 0;

    try {
      const fullKey = `${CACHE_KEYS.RATE_LIMIT}counter:${key}`;
      const count = await this.client.incr(fullKey);
      
      if (count === 1) {
        await this.client.expire(fullKey, ttlSeconds);
      }
      
      return count;
    } catch (error) {
      log.error('[Redis] Increment error:', error);
      return 0;
    }
  }

  // ============ 实时数据缓存 ============

  /**
   * 缓存传感器数据
   */
  async cacheSensorData(
    deviceId: string,
    sensorId: string,
    data: { value: number; timestamp: number; unit?: string },
    ttlSeconds: number = 300
  ): Promise<boolean> {
    const key = `${CACHE_KEYS.SENSOR_DATA}${deviceId}:${sensorId}`;
    return this.set(key, data, ttlSeconds);
  }

  /**
   * 获取传感器数据
   */
  async getSensorData(deviceId: string, sensorId: string): Promise<{
    value: number;
    timestamp: number;
    unit?: string;
  } | null> {
    const key = `${CACHE_KEYS.SENSOR_DATA}${deviceId}:${sensorId}`;
    return this.get(key, true);
  }

  /**
   * 缓存设备状态
   */
  async cacheDeviceStatus(
    deviceId: string,
    status: { online: boolean; lastSeen: number; metadata?: object },
    ttlSeconds: number = 60
  ): Promise<boolean> {
    const key = `${CACHE_KEYS.DEVICE_STATUS}${deviceId}`;
    return this.set(key, status, ttlSeconds);
  }

  /**
   * 获取设备状态
   */
  async getDeviceStatus(deviceId: string): Promise<{
    online: boolean;
    lastSeen: number;
    metadata?: object;
  } | null> {
    const key = `${CACHE_KEYS.DEVICE_STATUS}${deviceId}`;
    return this.get(key, true);
  }

  /**
   * 批量获取设备状态
   */
  async getMultipleDeviceStatus(deviceIds: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    
    if (!this.client || deviceIds.length === 0) {
      return result;
    }

    try {
      const keys = deviceIds.map(id => `${CACHE_KEYS.DEVICE_STATUS}${id}`);
      const values = await this.client.mget(...keys);

      deviceIds.forEach((id, index) => {
        const value = values[index];
        if (value) {
          try {
            result.set(id, JSON.parse(value));
          } catch {
            result.set(id, value);
          }
        }
      });
    } catch (error) {
      log.error('[Redis] Multi get error:', error);
    }

    return result;
  }

  // ============ Kafka 指标缓存 ============

  /**
   * 缓存 Kafka 指标
   */
  async cacheKafkaMetrics(metrics: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    consumerLag: number;
    activeTopics: number;
    timestamp: number;
  }): Promise<boolean> {
    const key = `${CACHE_KEYS.KAFKA_METRICS}current`;
    return this.set(key, metrics, 60);
  }

  /**
   * 获取 Kafka 指标
   */
  async getKafkaMetrics(): Promise<{
    messagesPerSecond: number;
    bytesPerSecond: number;
    consumerLag: number;
    activeTopics: number;
    timestamp: number;
  } | null> {
    const key = `${CACHE_KEYS.KAFKA_METRICS}current`;
    return this.get(key, true);
  }

  /**
   * 添加 Kafka 指标到时间序列
   */
  async addKafkaMetricsToTimeSeries(metrics: object): Promise<void> {
    if (!this.client) return;

    const key = `${CACHE_KEYS.KAFKA_METRICS}history`;
    const timestamp = Date.now();

    try {
      await this.client.zadd(key, timestamp, JSON.stringify({ ...metrics, timestamp }));
      // 只保留最近 1 小时的数据
      await this.client.zremrangebyscore(key, 0, timestamp - 3600000);
    } catch (error) {
      log.error('[Redis] Add metrics error:', error);
    }
  }

  /**
   * 获取 Kafka 指标历史
   */
  async getKafkaMetricsHistory(minutes: number = 60): Promise<any[]> {
    if (!this.client) return [];

    const key = `${CACHE_KEYS.KAFKA_METRICS}history`;
    const now = Date.now();
    const start = now - minutes * 60 * 1000;

    try {
      const results = await this.client.zrangebyscore(key, start, now);
      return results.map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      log.error('[Redis] Get metrics history error:', error);
      return [];
    }
  }

  // ============ 分布式锁 ============

  /**
   * 获取分布式锁
   */
  async acquireLock(lockName: string, ttlSeconds: number = 30): Promise<string | null> {
    if (!this.client) return `memory-lock-${Date.now()}`;

    const key = `${CACHE_KEYS.LOCK}${lockName}`;
    const lockId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await this.client.set(key, lockId, 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? lockId : null;
    } catch (error) {
      log.error('[Redis] Acquire lock error:', error);
      return null;
    }
  }

  /**
   * 释放分布式锁
   */
  async releaseLock(lockName: string, lockId: string): Promise<boolean> {
    if (!this.client) return true;

    const key = `${CACHE_KEYS.LOCK}${lockName}`;

    try {
      // 使用 Lua 脚本确保原子性
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.client.eval(script, 1, key, lockId);
      return result === 1;
    } catch (error) {
      log.error('[Redis] Release lock error:', error);
      return false;
    }
  }

  // ============ Redis Streams API ============

  /**
   * XADD — 向 Stream 追加消息
   * @param stream  Stream 键名
   * @param fields  消息字段 { field: value, ... }
   * @param id      消息 ID，默认 '*' 自动生成
   * @param maxLen  可选 MAXLEN 截断（近似 ~）
   * @returns 消息 ID 或 null
   */
  async xadd(
    stream: string,
    fields: Record<string, string | number>,
    id: string = '*',
    maxLen?: number
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const args: (string | number)[] = [stream];
      if (maxLen !== undefined) {
        args.push('MAXLEN', '~', maxLen);
      }
      args.push(id);
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, String(v));
      }
      return await (this.client as any).xadd(...args);
    } catch (error) {
      log.error('[Redis] XADD error:', error);
      return null;
    }
  }

  /**
   * XLEN — 获取 Stream 长度
   */
  async xlen(stream: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await (this.client as any).xlen(stream);
    } catch (error) {
      log.error('[Redis] XLEN error:', error);
      return 0;
    }
  }

  /**
   * XRANGE — 按 ID 范围读取消息
   * @param start  起始 ID（'-' 表示最小）
   * @param end    结束 ID（'+' 表示最大）
   * @param count  最大返回条数
   */
  async xrange(
    stream: string,
    start: string = '-',
    end: string = '+',
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    if (!this.client) return [];
    try {
      const args: (string | number)[] = [stream, start, end];
      if (count !== undefined) {
        args.push('COUNT', count);
      }
      const raw: [string, string[]][] = await (this.client as any).xrange(...args);
      return (raw || []).map(([id, flat]) => {
        const fields: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) {
          fields[flat[i]] = flat[i + 1];
        }
        return { id, fields };
      });
    } catch (error) {
      log.error('[Redis] XRANGE error:', error);
      return [];
    }
  }

  /**
   * XREVRANGE — 按 ID 范围逆序读取
   */
  async xrevrange(
    stream: string,
    end: string = '+',
    start: string = '-',
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    if (!this.client) return [];
    try {
      const args: (string | number)[] = [stream, end, start];
      if (count !== undefined) {
        args.push('COUNT', count);
      }
      const raw: [string, string[]][] = await (this.client as any).xrevrange(...args);
      return (raw || []).map(([id, flat]) => {
        const fields: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) {
          fields[flat[i]] = flat[i + 1];
        }
        return { id, fields };
      });
    } catch (error) {
      log.error('[Redis] XREVRANGE error:', error);
      return [];
    }
  }

  /**
   * XREAD — 阻塞/非阻塞读取一个或多个 Stream
   * @param streams  { streamKey: lastId } 映射
   * @param count    每个 Stream 最大返回条数
   * @param blockMs  阻塞毫秒数（0 = 永久阻塞，undefined = 非阻塞）
   */
  async xread(
    streams: Record<string, string>,
    count?: number,
    blockMs?: number
  ): Promise<Array<{ stream: string; messages: Array<{ id: string; fields: Record<string, string> }> }>> {
    if (!this.client) return [];
    try {
      const args: (string | number)[] = [];
      if (count !== undefined) {
        args.push('COUNT', count);
      }
      if (blockMs !== undefined) {
        args.push('BLOCK', blockMs);
      }
      args.push('STREAMS');
      const keys = Object.keys(streams);
      const ids = Object.values(streams);
      args.push(...keys, ...ids);
      const raw = await (this.client as any).xread(...args);
      if (!raw) return [];
      return raw.map(([streamKey, entries]: [string, [string, string[]][]]) => ({
        stream: streamKey,
        messages: entries.map(([id, flat]) => {
          const fields: Record<string, string> = {};
          for (let i = 0; i < flat.length; i += 2) {
            fields[flat[i]] = flat[i + 1];
          }
          return { id, fields };
        }),
      }));
    } catch (error) {
      log.error('[Redis] XREAD error:', error);
      return [];
    }
  }

  /**
   * XGROUP CREATE — 创建消费者组
   * @param mkstream  如果 Stream 不存在则自动创建
   */
  async xgroupCreate(
    stream: string,
    group: string,
    startId: string = '$',
    mkstream: boolean = true
  ): Promise<boolean> {
    if (!this.client) return false;
    try {
      const args: string[] = ['CREATE', stream, group, startId];
      if (mkstream) args.push('MKSTREAM');
      await (this.client as any).xgroup(...args);
      return true;
    } catch (error: any) {
      if (error.message?.includes('BUSYGROUP')) {
        // 消费者组已存在，视为成功
        return true;
      }
      log.error('[Redis] XGROUP CREATE error:', error);
      return false;
    }
  }

  /**
   * XGROUP DELCONSUMER — 删除消费者组中的消费者
   */
  async xgroupDelConsumer(
    stream: string,
    group: string,
    consumer: string
  ): Promise<number> {
    if (!this.client) return 0;
    try {
      return await (this.client as any).xgroup('DELCONSUMER', stream, group, consumer);
    } catch (error) {
      log.error('[Redis] XGROUP DELCONSUMER error:', error);
      return 0;
    }
  }

  /**
   * XGROUP DESTROY — 删除消费者组
   */
  async xgroupDestroy(stream: string, group: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await (this.client as any).xgroup('DESTROY', stream, group);
      return result === 1;
    } catch (error) {
      log.error('[Redis] XGROUP DESTROY error:', error);
      return false;
    }
  }

  /**
   * XREADGROUP — 消费者组读取
   * @param group     消费者组名
   * @param consumer  消费者名
   * @param streams   { streamKey: '>' 或 lastId }
   * @param count     最大返回条数
   * @param blockMs   阻塞毫秒数
   * @param noAck     是否不需要 ACK
   */
  async xreadgroup(
    group: string,
    consumer: string,
    streams: Record<string, string>,
    count?: number,
    blockMs?: number,
    noAck?: boolean
  ): Promise<Array<{ stream: string; messages: Array<{ id: string; fields: Record<string, string> }> }>> {
    if (!this.client) return [];
    try {
      const args: (string | number)[] = ['GROUP', group, consumer];
      if (count !== undefined) {
        args.push('COUNT', count);
      }
      if (blockMs !== undefined) {
        args.push('BLOCK', blockMs);
      }
      if (noAck) {
        args.push('NOACK');
      }
      args.push('STREAMS');
      const keys = Object.keys(streams);
      const ids = Object.values(streams);
      args.push(...keys, ...ids);
      const raw = await (this.client as any).xreadgroup(...args);
      if (!raw) return [];
      return raw.map(([streamKey, entries]: [string, [string, string[]][]]) => ({
        stream: streamKey,
        messages: entries.map(([id, flat]) => {
          const fields: Record<string, string> = {};
          for (let i = 0; i < flat.length; i += 2) {
            fields[flat[i]] = flat[i + 1];
          }
          return { id, fields };
        }),
      }));
    } catch (error) {
      log.error('[Redis] XREADGROUP error:', error);
      return [];
    }
  }

  /**
   * XACK — 确认消息已处理
   */
  async xack(stream: string, group: string, ...ids: string[]): Promise<number> {
    if (!this.client) return 0;
    try {
      return await (this.client as any).xack(stream, group, ...ids);
    } catch (error) {
      log.error('[Redis] XACK error:', error);
      return 0;
    }
  }

  /**
   * XPENDING — 查询待处理消息摘要
   */
  async xpending(
    stream: string,
    group: string
  ): Promise<{ count: number; minId: string | null; maxId: string | null; consumers: Array<{ name: string; pending: number }> }> {
    if (!this.client) return { count: 0, minId: null, maxId: null, consumers: [] };
    try {
      const raw = await (this.client as any).xpending(stream, group);
      if (!raw || !Array.isArray(raw)) return { count: 0, minId: null, maxId: null, consumers: [] };
      return {
        count: raw[0] || 0,
        minId: raw[1] || null,
        maxId: raw[2] || null,
        consumers: (raw[3] || []).map(([name, pending]: [string, string]) => ({
          name,
          pending: parseInt(pending),
        })),
      };
    } catch (error) {
      log.error('[Redis] XPENDING error:', error);
      return { count: 0, minId: null, maxId: null, consumers: [] };
    }
  }

  /**
   * XTRIM — 截断 Stream
   * @param strategy  'MAXLEN' 或 'MINID'
   * @param threshold 最大长度或最小 ID
   * @param approximate 是否使用近似截断 (~)
   */
  async xtrim(
    stream: string,
    strategy: 'MAXLEN' | 'MINID',
    threshold: number | string,
    approximate: boolean = true
  ): Promise<number> {
    if (!this.client) return 0;
    try {
      const args: (string | number)[] = [stream, strategy];
      if (approximate) args.push('~');
      args.push(threshold);
      return await (this.client as any).xtrim(...args);
    } catch (error) {
      log.error('[Redis] XTRIM error:', error);
      return 0;
    }
  }

  /**
   * XINFO STREAM — 获取 Stream 信息
   */
  async xinfoStream(stream: string): Promise<Record<string, any> | null> {
    if (!this.client) return null;
    try {
      const raw = await (this.client as any).xinfo('STREAM', stream);
      if (!raw || !Array.isArray(raw)) return null;
      const result: Record<string, any> = {};
      for (let i = 0; i < raw.length; i += 2) {
        result[raw[i]] = raw[i + 1];
      }
      return result;
    } catch (error) {
      log.error('[Redis] XINFO STREAM error:', error);
      return null;
    }
  }

  /**
   * XINFO GROUPS — 获取 Stream 的消费者组信息
   */
  async xinfoGroups(stream: string): Promise<Array<Record<string, any>>> {
    if (!this.client) return [];
    try {
      const raw = await (this.client as any).xinfo('GROUPS', stream);
      if (!raw || !Array.isArray(raw)) return [];
      return raw.map((group: any[]) => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < group.length; i += 2) {
          obj[group[i]] = group[i + 1];
        }
        return obj;
      });
    } catch (error) {
      log.error('[Redis] XINFO GROUPS error:', error);
      return [];
    }
  }

  // ============ Pub/Sub API ============

  /**
   * 初始化 Subscriber 客户端（用于 Pub/Sub）
   */
  private async ensureSubscriber(): Promise<Redis | null> {
    if (this.subscriber) return this.subscriber;
    if (!this.client) return null;
    try {
      this.subscriber = this.client.duplicate();
      await this.subscriber.ping();
      return this.subscriber;
    } catch (error) {
      log.error('[Redis] Subscriber init error:', error);
      this.subscriber = null;
      return null;
    }
  }

  /**
   * PUBLISH — 发布消息到频道
   */
  async publish(channel: string, message: string | object): Promise<number> {
    if (!this.client) return 0;
    try {
      const payload = typeof message === 'object' ? JSON.stringify(message) : message;
      return await this.client.publish(channel, payload);
    } catch (error) {
      log.error('[Redis] PUBLISH error:', error);
      return 0;
    }
  }

  /**
   * SUBSCRIBE — 订阅频道
   */
  async subscribe(
    channels: string | string[],
    handler: (channel: string, message: string) => void
  ): Promise<boolean> {
    const sub = await this.ensureSubscriber();
    if (!sub) return false;
    try {
      const chans = Array.isArray(channels) ? channels : [channels];
      await sub.subscribe(...chans);
      sub.on('message', handler);
      return true;
    } catch (error) {
      log.error('[Redis] SUBSCRIBE error:', error);
      return false;
    }
  }

  /**
   * PSUBSCRIBE — 模式订阅
   */
  async psubscribe(
    patterns: string | string[],
    handler: (pattern: string, channel: string, message: string) => void
  ): Promise<boolean> {
    const sub = await this.ensureSubscriber();
    if (!sub) return false;
    try {
      const pats = Array.isArray(patterns) ? patterns : [patterns];
      await sub.psubscribe(...pats);
      sub.on('pmessage', handler);
      return true;
    } catch (error) {
      log.error('[Redis] PSUBSCRIBE error:', error);
      return false;
    }
  }

  /**
   * UNSUBSCRIBE — 取消订阅
   */
  async unsubscribe(...channels: string[]): Promise<boolean> {
    if (!this.subscriber) return false;
    try {
      await this.subscriber.unsubscribe(...channels);
      return true;
    } catch (error) {
      log.error('[Redis] UNSUBSCRIBE error:', error);
      return false;
    }
  }

  // ============ Hash 操作 ============

  /**
   * HSET — 设置 Hash 字段
   */
  async hset(key: string, field: string, value: string | number): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.hset(key, field, String(value));
    } catch (error) {
      log.error('[Redis] HSET error:', error);
      return 0;
    }
  }

  /**
   * HMSET — 批量设置 Hash 字段
   */
  async hmset(key: string, fields: Record<string, string | number>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const flat: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        flat.push(k, String(v));
      }
      await this.client.hmset(key, ...flat);
      return true;
    } catch (error) {
      log.error('[Redis] HMSET error:', error);
      return false;
    }
  }

  /**
   * HGET — 获取 Hash 字段
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      log.error('[Redis] HGET error:', error);
      return null;
    }
  }

  /**
   * HGETALL — 获取 Hash 所有字段
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      log.error('[Redis] HGETALL error:', error);
      return {};
    }
  }

  /**
   * HDEL — 删除 Hash 字段
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.hdel(key, ...fields);
    } catch (error) {
      log.error('[Redis] HDEL error:', error);
      return 0;
    }
  }

  // ============ 健康检查 ============

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    memoryUsage?: string;
    connectedClients?: number;
    error?: string;
  }> {
    if (!this.client) {
      return { connected: false, latencyMs: -1, error: 'Client not initialized' };
    }

    const start = Date.now();

    try {
      await this.client.ping();
      const latencyMs = Date.now() - start;

      const info = await this.client.info('memory');
      const clientInfo = await this.client.info('clients');

      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const clientsMatch = clientInfo.match(/connected_clients:(\d+)/);

      return {
        connected: true,
        latencyMs,
        memoryUsage: memoryMatch?.[1],
        connectedClients: clientsMatch ? parseInt(clientsMatch[1]) : undefined,
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 添加集合成员
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.client) return 0;

    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      log.error('[Redis] Sadd error:', error);
      return 0;
    }
  }

  /**
   * 获取集合所有成员
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.client) return [];

    try {
      return await this.client.smembers(key);
    } catch (error) {
      log.error('[Redis] Smembers error:', error);
      return [];
    }
  }

  /**
   * 按模式获取键
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) return [];

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      log.error('[Redis] Keys error:', error);
      return [];
    }
  }

  /**
   * 获取 Redis 信息
   */
  async getInfo(): Promise<Record<string, string>> {
    if (!this.client) return {};

    try {
      const info = await this.client.info();
      const result: Record<string, string> = {};

      info.split('\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      });

      return result;
    } catch (error) {
      log.error('[Redis] Get info error:', error);
      return {};
    }
  }

  /**
   * 关闭连接
   */
  async shutdown(): Promise<void> {
    log.debug('[Redis] Shutting down Redis connections...');

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.isConnected = false;
    log.debug('[Redis] Redis connections closed');
  }
}

// 导出单例
export const redisClient = new RedisClientManager();
export type { RedisConfig };
