import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('cacheService');

/**
 * 多级缓存服务
 * 实现 L1 (内存) + L2 (Redis) 缓存策略
 */

// 缓存配置

interface CacheConfig {
  l1: {
    maxSize: number;
    ttl: number; // 秒
  };
  l2: {
    enabled: boolean;
    ttl: number; // 秒
    keyPrefix: string;
  };
}

// 缓存条目
interface CacheEntry<T> {
  value: T;
  expireAt: number;
  createdAt: number;
  hits: number;
}

// 缓存统计
interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l1Size: number;
  l1HitRate: number;
  l2HitRate: number;
  totalHitRate: number;
}

/**
 * LRU 缓存实现
 */
class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number, defaultTTL: number) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // 检查过期
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问顺序（LRU）
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 检查容量
    if (this.cache.size >= this.maxSize) {
      // 删除最老的条目（Map 保持插入顺序）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry<T> = {
      value,
      expireAt: Date.now() + (ttl || this.defaultTTL) * 1000,
      createdAt: Date.now(),
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // 清理过期条目
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now > entry.expireAt) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      cleaned++;
    });
    
    return cleaned;
  }

  // 获取所有键
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // 获取统计信息
  getStats(): { size: number; entries: Array<{ key: string; hits: number; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      hits: entry.hits,
      age: Math.floor((now - entry.createdAt) / 1000),
    }));

    return {
      size: this.cache.size,
      entries: entries.sort((a, b) => b.hits - a.hits).slice(0, 20),
    };
  }
}

/**
 * 多级缓存服务
 */
export class MultiLevelCache {
  private l1Cache: LRUCache<any>;
  private config: CacheConfig;
  private stats: {
    l1Hits: number;
    l1Misses: number;
    l2Hits: number;
    l2Misses: number;
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      l1: {
        maxSize: config?.l1?.maxSize || 10000,
        ttl: config?.l1?.ttl || 60,
      },
      l2: {
        enabled: config?.l2?.enabled ?? false,
        ttl: config?.l2?.ttl || 300,
        keyPrefix: config?.l2?.keyPrefix || 'cache:',
      },
    };

    this.l1Cache = new LRUCache(this.config.l1.maxSize, this.config.l1.ttl);
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
    };

    // 启动定期清理
    this.startCleanup();
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | undefined> {
    // 尝试 L1 缓存
    const l1Value = this.l1Cache.get(key);
    if (l1Value !== undefined) {
      this.stats.l1Hits++;
      return l1Value as T;
    }
    this.stats.l1Misses++;

    // L2 缓存暂不实现（需要 Redis 连接）
    // 这里预留接口，实际使用时可以集成 Redis
    this.stats.l2Misses++;

    return undefined;
  }

  /**
   * 设置缓存值
   */
  async set<T>(key: string, value: T, options?: { l1TTL?: number; l2TTL?: number }): Promise<void> {
    // 设置 L1 缓存
    this.l1Cache.set(key, value, options?.l1TTL);

    // L2 缓存暂不实现
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    this.l1Cache.delete(key);
    // L2 缓存暂不实现
  }

  /**
   * 批量删除（按模式）
   */
  async deletePattern(pattern: string): Promise<number> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let deleted = 0;

    for (const key of this.l1Cache.keys()) {
      if (regex.test(key)) {
        this.l1Cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    return this.l1Cache.has(key);
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    // L2 缓存暂不实现
  }

  /**
   * 获取或设置缓存（带回调）
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: { l1TTL?: number; l2TTL?: number }
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const totalL1 = this.stats.l1Hits + this.stats.l1Misses;
    const totalL2 = this.stats.l2Hits + this.stats.l2Misses;
    const total = totalL1 + this.stats.l2Hits;

    return {
      l1Hits: this.stats.l1Hits,
      l1Misses: this.stats.l1Misses,
      l2Hits: this.stats.l2Hits,
      l2Misses: this.stats.l2Misses,
      l1Size: this.l1Cache.size(),
      l1HitRate: totalL1 > 0 ? this.stats.l1Hits / totalL1 : 0,
      l2HitRate: totalL2 > 0 ? this.stats.l2Hits / totalL2 : 0,
      totalHitRate: total > 0 ? (this.stats.l1Hits + this.stats.l2Hits) / total : 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
    };
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.l1Cache.cleanup();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 获取 L1 缓存详情
   */
  getL1Details(): { size: number; entries: Array<{ key: string; hits: number; age: number }> } {
    return this.l1Cache.getStats();
  }
}

/**
 * 缓存装饰器工厂
 */
export function createCacheDecorator(cache: MultiLevelCache) {
  return function cached(options?: { key?: string; ttl?: number }) {
    return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const cacheKey = options?.key || `${propertyKey}:${JSON.stringify(args)}`;
        
        const cachedValue = await cache.get(cacheKey);
        if (cachedValue !== undefined) {
          return cachedValue;
        }

        const result = await originalMethod.apply(this, args);
        await cache.set(cacheKey, result, { l1TTL: options?.ttl });
        return result;
      };

      return descriptor;
    };
  };
}

/**
 * 缓存键生成器
 */
export const CacheKeys = {
  // 设备相关
  device: (id: string) => `device:${id}`,
  deviceList: (page: number, limit: number) => `devices:list:${page}:${limit}`,
  deviceStats: (id: string) => `device:stats:${id}`,
  
  // 传感器相关
  sensor: (deviceId: string, sensorId: string) => `sensor:${deviceId}:${sensorId}`,
  sensorReadings: (sensorId: string, start: number, end: number) => 
    `sensor:readings:${sensorId}:${start}:${end}`,
  
  // 聚合数据
  aggregation: (deviceId: string, window: string) => `agg:${deviceId}:${window}`,
  
  // 用户相关
  user: (id: string) => `user:${id}`,
  userPermissions: (id: string) => `user:perms:${id}`,
  
  // 知识库相关
  kbCollection: (id: number) => `kb:collection:${id}`,
  kbPoints: (collectionId: number) => `kb:points:${collectionId}`,
  kgNodes: (collectionId: number) => `kg:nodes:${collectionId}`,
};

/**
 * 缓存失效策略
 */
export const CacheInvalidation = {
  // 设备更新时失效相关缓存
  onDeviceUpdate: async (cache: MultiLevelCache, deviceId: string) => {
    await cache.delete(CacheKeys.device(deviceId));
    await cache.delete(CacheKeys.deviceStats(deviceId));
    await cache.deletePattern(`devices:list:*`);
  },

  // 传感器数据更新时失效相关缓存
  onSensorDataUpdate: async (cache: MultiLevelCache, deviceId: string, sensorId: string) => {
    await cache.deletePattern(`sensor:readings:${sensorId}:*`);
    await cache.deletePattern(`agg:${deviceId}:*`);
  },

  // 用户更新时失效相关缓存
  onUserUpdate: async (cache: MultiLevelCache, userId: string) => {
    await cache.delete(CacheKeys.user(userId));
    await cache.delete(CacheKeys.userPermissions(userId));
  },

  // 知识库更新时失效相关缓存
  onKbUpdate: async (cache: MultiLevelCache, collectionId: number) => {
    await cache.delete(CacheKeys.kbCollection(collectionId));
    await cache.delete(CacheKeys.kbPoints(collectionId));
    await cache.delete(CacheKeys.kgNodes(collectionId));
  },
};

// 导出默认缓存实例
export const defaultCache = new MultiLevelCache({
  l1: {
    maxSize: 10000,
    ttl: 60,
  },
  l2: {
    enabled: false,
    ttl: 300,
    keyPrefix: 'xilian:cache:',
  },
});

// 缓存预热
export async function warmupCache(cache: MultiLevelCache): Promise<void> {
  log.debug('[Cache] Starting cache warmup...');
  
  // 这里可以预加载常用数据
  // 例如：热门设备列表、系统配置等
  
  log.debug('[Cache] Cache warmup completed');
}
