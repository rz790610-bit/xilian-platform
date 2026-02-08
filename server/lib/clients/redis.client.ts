/**
 * Redis 客户端服务
 * 提供 Redis 连接管理、缓存操作、限流等功能
 */

import Redis from 'ioredis';

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
      console.log('[Redis] No Redis configuration found, using memory fallback');
      return;
    }

    console.log('[Redis] Initializing Redis client...');

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryStrategy: (times) => {
            if (times > this.maxConnectionAttempts) {
              console.error('[Redis] Max connection attempts reached');
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
        console.log('[Redis] Connected to Redis server');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('[Redis] Connection closed');
        this.isConnected = false;
      });

      // 等待连接就绪
      await this.client.ping();
      console.log('[Redis] Redis client initialized successfully');
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error);
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
      console.error('[Redis] Set error:', error);
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
      console.error('[Redis] Get error:', error);
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
      console.error('[Redis] Del error:', error);
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
      console.error('[Redis] Exists error:', error);
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
      console.error('[Redis] Expire error:', error);
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
      console.error('[Redis] TTL error:', error);
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
      console.error('[Redis] Rate limit error:', error);
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
      console.error('[Redis] Increment error:', error);
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
      console.error('[Redis] Multi get error:', error);
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
      console.error('[Redis] Add metrics error:', error);
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
      console.error('[Redis] Get metrics history error:', error);
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
      console.error('[Redis] Acquire lock error:', error);
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
      console.error('[Redis] Release lock error:', error);
      return false;
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
      console.error('[Redis] Sadd error:', error);
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
      console.error('[Redis] Smembers error:', error);
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
      console.error('[Redis] Keys error:', error);
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
      console.error('[Redis] Get info error:', error);
      return {};
    }
  }

  /**
   * 关闭连接
   */
  async shutdown(): Promise<void> {
    console.log('[Redis] Shutting down Redis connections...');

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.isConnected = false;
    console.log('[Redis] Redis connections closed');
  }
}

// 导出单例
export const redisClient = new RedisClientManager();
export type { RedisConfig };
