/**
 * Redis 企业级缓存集群服务
 * 
 * 架构：6节点集群（3主3从）
 * 特性：
 * - API 缓存（5min TTL）
 * - 会话存储（24h）
 * - Redlock 分布式锁
 * - Sliding Window 限流
 * - Pub/Sub 事件总线
 */

import Redis, { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import Redlock from 'redlock';

// ============ 配置类型 ============

export interface RedisClusterConfig {
  nodes: Array<{
    host: string;
    port: number;
  }>;
  password?: string;
  keyPrefix?: string;
  enableReadyCheck: boolean;
  maxRedirections: number;
  retryDelayOnFailover: number;
  retryDelayOnClusterDown: number;
  scaleReads: 'master' | 'slave' | 'all';
}

// 默认集群配置（6节点）
const DEFAULT_CLUSTER_CONFIG: RedisClusterConfig = {
  nodes: [
    { host: process.env.REDIS_NODE1_HOST || 'localhost', port: 7000 },
    { host: process.env.REDIS_NODE2_HOST || 'localhost', port: 7001 },
    { host: process.env.REDIS_NODE3_HOST || 'localhost', port: 7002 },
    { host: process.env.REDIS_NODE4_HOST || 'localhost', port: 7003 },
    { host: process.env.REDIS_NODE5_HOST || 'localhost', port: 7004 },
    { host: process.env.REDIS_NODE6_HOST || 'localhost', port: 7005 },
  ],
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'xilian:',
  enableReadyCheck: true,
  maxRedirections: 16,
  retryDelayOnFailover: 100,
  retryDelayOnClusterDown: 100,
  scaleReads: 'slave',
};

// 单节点开发配置
const SINGLE_NODE_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'xilian:',
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

// ============ 缓存配置 ============

export interface CacheConfig {
  namespace: string;
  ttl: number; // 秒
  maxSize?: number;
}

// 预定义缓存配置
const CACHE_CONFIGS: Record<string, CacheConfig> = {
  api: {
    namespace: 'api',
    ttl: 300, // 5分钟
    maxSize: 10000,
  },
  session: {
    namespace: 'session',
    ttl: 86400, // 24小时
    maxSize: 100000,
  },
  device: {
    namespace: 'device',
    ttl: 60, // 1分钟
    maxSize: 5000,
  },
  sensor: {
    namespace: 'sensor',
    ttl: 30, // 30秒
    maxSize: 50000,
  },
  diagnosis: {
    namespace: 'diagnosis',
    ttl: 600, // 10分钟
    maxSize: 1000,
  },
};

// ============ 限流配置 ============

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// 预定义限流配置
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  api: {
    windowMs: 60000, // 1分钟
    maxRequests: 100,
  },
  auth: {
    windowMs: 300000, // 5分钟
    maxRequests: 10,
  },
  diagnosis: {
    windowMs: 60000, // 1分钟
    maxRequests: 20,
  },
};

// ============ 事件类型 ============

export type EventChannel = 
  | 'device:status'
  | 'device:alert'
  | 'sensor:data'
  | 'diagnosis:result'
  | 'system:notification'
  | 'user:activity';

export interface EventMessage {
  channel: EventChannel;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source?: string;
}

// ============ Redis 存储服务类 ============

export class RedisStorage {
  private client: Redis | Cluster | null = null;
  private subscriber: Redis | Cluster | null = null;
  private redlock: Redlock | null = null;
  private isClusterMode: boolean;
  private clusterConfig: RedisClusterConfig;
  private singleConfig: RedisOptions;
  private isInitialized: boolean = false;
  private eventHandlers: Map<EventChannel, Set<(message: EventMessage) => void>> = new Map();

  constructor(clusterMode?: boolean) {
    this.isClusterMode = clusterMode ?? (process.env.REDIS_CLUSTER_MODE === 'true');
    this.clusterConfig = DEFAULT_CLUSTER_CONFIG;
    this.singleConfig = SINGLE_NODE_CONFIG;
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log(`[Redis] Initializing ${this.isClusterMode ? 'cluster' : 'single node'} connection...`);

    try {
      if (this.isClusterMode) {
        const clusterOptions: ClusterOptions = {
          redisOptions: {
            password: this.clusterConfig.password,
          },
          enableReadyCheck: this.clusterConfig.enableReadyCheck,
          maxRedirections: this.clusterConfig.maxRedirections,
          retryDelayOnFailover: this.clusterConfig.retryDelayOnFailover,
          retryDelayOnClusterDown: this.clusterConfig.retryDelayOnClusterDown,
          scaleReads: this.clusterConfig.scaleReads,
        };

        this.client = new Cluster(this.clusterConfig.nodes, clusterOptions);
        this.subscriber = new Cluster(this.clusterConfig.nodes, clusterOptions);
      } else {
        this.client = new Redis(this.singleConfig);
        this.subscriber = new Redis(this.singleConfig);
      }

      // 等待连接就绪
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        this.client!.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.client!.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // 初始化 Redlock
      this.redlock = new Redlock([this.client as any], {
        driftFactor: 0.01,
        retryCount: 10,
        retryDelay: 200,
        retryJitter: 200,
      });

      // 设置 Pub/Sub 消息处理
      this.setupSubscriber();

      this.isInitialized = true;
      console.log('[Redis] Connection established');
    } catch (error) {
      console.error('[Redis] Connection failed:', error);
      throw error;
    }
  }

  /**
   * 设置订阅者
   */
  private setupSubscriber(): void {
    if (!this.subscriber) return;

    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        const eventMessage: EventMessage = JSON.parse(message);
        const handlers = this.eventHandlers.get(channel as EventChannel);
        if (handlers) {
          handlers.forEach(handler => handler(eventMessage));
        }
      } catch (error) {
        console.error('[Redis] Error processing message:', error);
      }
    });
  }

  /**
   * 获取客户端
   */
  private getClient(): Redis | Cluster {
    if (!this.client) {
      throw new Error('[Redis] Client not initialized');
    }
    return this.client;
  }

  // ============ 基础缓存操作 ============

  /**
   * 设置缓存
   */
  async set(
    namespace: string,
    key: string,
    value: unknown,
    ttl?: number
  ): Promise<boolean> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;
    const config = CACHE_CONFIGS[namespace];
    const expiry = ttl || config?.ttl || 300;

    try {
      const serialized = JSON.stringify(value);
      await client.setex(fullKey, expiry, serialized);
      return true;
    } catch (error) {
      console.error('[Redis] Set error:', error);
      return false;
    }
  }

  /**
   * 获取缓存
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      const value = await client.get(fullKey);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      console.error('[Redis] Get error:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  async delete(namespace: string, key: string): Promise<boolean> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      await client.del(fullKey);
      return true;
    } catch (error) {
      console.error('[Redis] Delete error:', error);
      return false;
    }
  }

  /**
   * 批量删除
   */
  async deletePattern(pattern: string): Promise<number> {
    const client = this.getClient();

    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        return await client.del(...keys);
      }
      return 0;
    } catch (error) {
      console.error('[Redis] Delete pattern error:', error);
      return 0;
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(namespace: string, key: string): Promise<boolean> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      return (await client.exists(fullKey)) === 1;
    } catch (error) {
      console.error('[Redis] Exists error:', error);
      return false;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(namespace: string, key: string, ttl: number): Promise<boolean> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      return (await client.expire(fullKey, ttl)) === 1;
    } catch (error) {
      console.error('[Redis] Expire error:', error);
      return false;
    }
  }

  // ============ 哈希操作 ============

  /**
   * 设置哈希字段
   */
  async hset(
    namespace: string,
    key: string,
    field: string,
    value: unknown
  ): Promise<boolean> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      await client.hset(fullKey, field, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[Redis] Hset error:', error);
      return false;
    }
  }

  /**
   * 获取哈希字段
   */
  async hget<T>(namespace: string, key: string, field: string): Promise<T | null> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      const value = await client.hget(fullKey, field);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      console.error('[Redis] Hget error:', error);
      return null;
    }
  }

  /**
   * 获取所有哈希字段
   */
  async hgetall<T>(namespace: string, key: string): Promise<Record<string, T>> {
    const client = this.getClient();
    const fullKey = `${namespace}:${key}`;

    try {
      const result = await client.hgetall(fullKey);
      const parsed: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        try {
          parsed[field] = JSON.parse(value) as T;
        } catch {
          parsed[field] = value as unknown as T;
        }
      }
      return parsed;
    } catch (error) {
      console.error('[Redis] Hgetall error:', error);
      return {};
    }
  }

  // ============ 分布式锁（Redlock）============

  /**
   * 获取分布式锁
   */
  async acquireLock(
    resource: string,
    ttl: number = 10000
  ): Promise<{ lock: any; acquired: boolean }> {
    if (!this.redlock) {
      return { lock: null, acquired: false };
    }

    try {
      const lock = await this.redlock.acquire([`lock:${resource}`], ttl);
      return { lock, acquired: true };
    } catch (error) {
      console.error('[Redis] Acquire lock error:', error);
      return { lock: null, acquired: false };
    }
  }

  /**
   * 释放分布式锁
   */
  async releaseLock(lock: any): Promise<boolean> {
    if (!lock) return false;

    try {
      await lock.release();
      return true;
    } catch (error) {
      console.error('[Redis] Release lock error:', error);
      return false;
    }
  }

  /**
   * 使用锁执行操作
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = 10000
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const { lock, acquired } = await this.acquireLock(resource, ttl);

    if (!acquired) {
      return { success: false, error: 'Failed to acquire lock' };
    }

    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      await this.releaseLock(lock);
    }
  }

  // ============ 滑动窗口限流 ============

  /**
   * 检查限流
   */
  async checkRateLimit(
    type: string,
    identifier: string
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const client = this.getClient();
    const config = RATE_LIMIT_CONFIGS[type] || RATE_LIMIT_CONFIGS.api;
    const key = `ratelimit:${type}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // 使用 Lua 脚本保证原子性
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local max_requests = tonumber(ARGV[3])
        local window_ms = tonumber(ARGV[4])
        
        -- 移除过期的请求
        redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
        
        -- 获取当前窗口内的请求数
        local current = redis.call('ZCARD', key)
        
        if current < max_requests then
          -- 添加新请求
          redis.call('ZADD', key, now, now .. ':' .. math.random())
          redis.call('PEXPIRE', key, window_ms)
          return {1, max_requests - current - 1, now + window_ms}
        else
          -- 获取最早的请求时间
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
          local reset_at = oldest[2] and (tonumber(oldest[2]) + window_ms) or (now + window_ms)
          return {0, 0, reset_at}
        end
      `;

      const result = await client.eval(
        script,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        config.maxRequests.toString(),
        config.windowMs.toString()
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: result[2],
      };
    } catch (error) {
      console.error('[Redis] Rate limit check error:', error);
      // 出错时默认允许
      return { allowed: true, remaining: config.maxRequests, resetAt: now + config.windowMs };
    }
  }

  /**
   * 重置限流计数
   */
  async resetRateLimit(type: string, identifier: string): Promise<boolean> {
    const client = this.getClient();
    const key = `ratelimit:${type}:${identifier}`;

    try {
      await client.del(key);
      return true;
    } catch (error) {
      console.error('[Redis] Reset rate limit error:', error);
      return false;
    }
  }

  // ============ Pub/Sub 事件总线 ============

  /**
   * 发布事件
   */
  async publish(message: Omit<EventMessage, 'timestamp'>): Promise<boolean> {
    const client = this.getClient();

    try {
      const fullMessage: EventMessage = {
        ...message,
        timestamp: Date.now(),
      };

      await client.publish(message.channel, JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      console.error('[Redis] Publish error:', error);
      return false;
    }
  }

  /**
   * 订阅事件
   */
  async subscribe(
    channel: EventChannel,
    handler: (message: EventMessage) => void
  ): Promise<boolean> {
    if (!this.subscriber) return false;

    try {
      // 添加处理器
      if (!this.eventHandlers.has(channel)) {
        this.eventHandlers.set(channel, new Set());
        await this.subscriber.subscribe(channel);
      }
      this.eventHandlers.get(channel)!.add(handler);

      return true;
    } catch (error) {
      console.error('[Redis] Subscribe error:', error);
      return false;
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(
    channel: EventChannel,
    handler?: (message: EventMessage) => void
  ): Promise<boolean> {
    if (!this.subscriber) return false;

    try {
      const handlers = this.eventHandlers.get(channel);
      if (handlers) {
        if (handler) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.eventHandlers.delete(channel);
            await this.subscriber.unsubscribe(channel);
          }
        } else {
          this.eventHandlers.delete(channel);
          await this.subscriber.unsubscribe(channel);
        }
      }

      return true;
    } catch (error) {
      console.error('[Redis] Unsubscribe error:', error);
      return false;
    }
  }

  // ============ 会话管理 ============

  /**
   * 创建会话
   */
  async createSession(
    sessionId: string,
    data: Record<string, unknown>,
    ttl: number = 86400
  ): Promise<boolean> {
    return this.set('session', sessionId, {
      ...data,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    }, ttl);
  }

  /**
   * 获取会话
   */
  async getSession<T extends Record<string, unknown>>(sessionId: string): Promise<T | null> {
    return this.get<T>('session', sessionId);
  }

  /**
   * 更新会话活动时间
   */
  async touchSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    return this.set('session', sessionId, {
      ...session,
      lastActivity: Date.now(),
    });
  }

  /**
   * 销毁会话
   */
  async destroySession(sessionId: string): Promise<boolean> {
    return this.delete('session', sessionId);
  }

  // ============ API 缓存便捷方法 ============

  /**
   * 缓存 API 响应
   */
  async cacheApiResponse<T>(
    endpoint: string,
    params: Record<string, unknown>,
    response: T,
    ttl?: number
  ): Promise<boolean> {
    const key = this.generateCacheKey(endpoint, params);
    return this.set('api', key, response, ttl);
  }

  /**
   * 获取缓存的 API 响应
   */
  async getCachedApiResponse<T>(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<T | null> {
    const key = this.generateCacheKey(endpoint, params);
    return this.get<T>('api', key);
  }

  /**
   * 使缓存失效
   */
  async invalidateApiCache(endpoint: string): Promise<number> {
    return this.deletePattern(`api:${endpoint}:*`);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(endpoint: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${JSON.stringify(params[k])}`)
      .join('&');
    return `${endpoint}:${Buffer.from(sortedParams).toString('base64').slice(0, 32)}`;
  }

  // ============ 统计和管理 ============

  /**
   * 获取缓存统计
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
    namespaceStats: Record<string, number>;
  }> {
    const client = this.getClient();

    try {
      const info = await client.info('memory');
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

      // 统计各命名空间的键数量
      const namespaceStats: Record<string, number> = {};
      for (const namespace of Object.keys(CACHE_CONFIGS)) {
        const keys = await client.keys(`${namespace}:*`);
        namespaceStats[namespace] = keys.length;
      }

      const totalKeys = Object.values(namespaceStats).reduce((a, b) => a + b, 0);

      return {
        totalKeys,
        memoryUsage,
        namespaceStats,
      };
    } catch (error) {
      console.error('[Redis] Get cache stats error:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
        namespaceStats: {},
      };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    mode: 'cluster' | 'standalone';
    nodes?: Array<{ host: string; status: string }>;
    error?: string;
  }> {
    const start = Date.now();

    if (!this.client) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        mode: this.isClusterMode ? 'cluster' : 'standalone',
        error: 'Client not initialized',
      };
    }

    try {
      await this.client.ping();

      const result: {
        connected: boolean;
        latencyMs: number;
        mode: 'cluster' | 'standalone';
        nodes?: Array<{ host: string; status: string }>;
      } = {
        connected: true,
        latencyMs: Date.now() - start,
        mode: this.isClusterMode ? 'cluster' : 'standalone',
      };

      if (this.isClusterMode && this.client instanceof Cluster) {
        const nodes = this.client.nodes('all');
        result.nodes = nodes.map(node => ({
          host: `${node.options.host}:${node.options.port}`,
          status: node.status,
        }));
      }

      return result;
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        mode: this.isClusterMode ? 'cluster' : 'standalone',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 清空命名空间
   */
  async flushNamespace(namespace: string): Promise<number> {
    return this.deletePattern(`${namespace}:*`);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.redlock = null;
    this.isInitialized = false;
    this.eventHandlers.clear();

    console.log('[Redis] Connections closed');
  }
}

// 导出单例
export const redisStorage = new RedisStorage();
export default redisStorage;
