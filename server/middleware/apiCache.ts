/**
 * API 响应缓存中间件
 * 支持基于路由和参数的缓存策略
 */

import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../redis/redisClient';

// 缓存配置接口
interface CacheConfig {
  ttlSeconds: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  tags?: string[];
}

// 默认缓存配置
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlSeconds: 300, // 5 分钟
};

// 缓存键前缀
const CACHE_PREFIX = 'api:cache:';

/**
 * 生成缓存键
 */
function generateCacheKey(req: Request, customGenerator?: (req: Request) => string): string {
  if (customGenerator) {
    return `${CACHE_PREFIX}${customGenerator(req)}`;
  }

  // 默认使用路径 + 查询参数
  const path = req.path;
  const query = JSON.stringify(req.query || {});
  const body = req.method === 'GET' ? '' : JSON.stringify(req.body || {});
  
  // 简单哈希
  const hash = Buffer.from(`${path}:${query}:${body}`).toString('base64').slice(0, 32);
  return `${CACHE_PREFIX}${req.method}:${hash}`;
}

/**
 * API 缓存中间件工厂
 */
export function apiCache(config: Partial<CacheConfig> = {}) {
  const finalConfig = { ...DEFAULT_CACHE_CONFIG, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    // 只缓存 GET 请求（除非明确指定）
    if (req.method !== 'GET' && !config.keyGenerator) {
      return next();
    }

    // 检查条件
    if (finalConfig.condition && !finalConfig.condition(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req, finalConfig.keyGenerator);

    try {
      // 尝试从缓存获取
      const cached = await redisClient.get<string>(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        return res.json(data);
      }

      // 缓存未命中，拦截响应
      const originalJson = res.json.bind(res);
      
      res.json = function(body: any) {
        // 只缓存成功响应
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.set(cacheKey, JSON.stringify(body), finalConfig.ttlSeconds).catch(err => {
            console.error('[ApiCache] Failed to cache response:', err);
          });

          // 如果有标签，记录标签关联
          if (finalConfig.tags && finalConfig.tags.length > 0) {
            finalConfig.tags.forEach(tag => {
              redisClient.sadd(`${CACHE_PREFIX}tag:${tag}`, cacheKey).catch(err => {
                console.error('[ApiCache] Failed to add tag:', err);
              });
            });
          }
        }

        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('[ApiCache] Cache error:', error);
      next();
    }
  };
}

/**
 * 清除指定标签的缓存
 */
export async function invalidateCacheByTag(tag: string): Promise<number> {
  const tagKey = `${CACHE_PREFIX}tag:${tag}`;
  
  try {
    const keys = await redisClient.smembers(tagKey);
    
    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    await redisClient.del([tagKey]);
    
    console.log(`[ApiCache] Invalidated ${deleted} cache entries for tag: ${tag}`);
    return deleted;
  } catch (error) {
    console.error('[ApiCache] Failed to invalidate cache:', error);
    return 0;
  }
}

/**
 * 清除指定模式的缓存
 */
export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}${pattern}`);
    
    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    console.log(`[ApiCache] Invalidated ${deleted} cache entries matching: ${pattern}`);
    return deleted;
  } catch (error) {
    console.error('[ApiCache] Failed to invalidate cache:', error);
    return 0;
  }
}

/**
 * 缓存装饰器（用于 tRPC procedures）
 */
export function withCache<T>(
  key: string,
  ttlSeconds: number = 300,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const cacheKey = `${CACHE_PREFIX}trpc:${key}`;

    try {
      // 尝试从缓存获取
      const cached = await redisClient.get<string>(cacheKey);
      
      if (cached) {
        resolve(JSON.parse(cached) as T);
        return;
      }

      // 执行函数
      const result = await fn();

      // 缓存结果
      await redisClient.set(cacheKey, JSON.stringify(result), ttlSeconds);

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 预定义的缓存策略
 */
export const CacheStrategies = {
  // 短期缓存（1 分钟）- 适用于频繁变化的数据
  SHORT: { ttlSeconds: 60 },
  
  // 中期缓存（5 分钟）- 适用于一般数据
  MEDIUM: { ttlSeconds: 300 },
  
  // 长期缓存（30 分钟）- 适用于不常变化的数据
  LONG: { ttlSeconds: 1800 },
  
  // 静态缓存（1 小时）- 适用于静态配置
  STATIC: { ttlSeconds: 3600 },
  
  // 设备状态缓存
  DEVICE_STATUS: {
    ttlSeconds: 30,
    tags: ['device', 'status'],
  },
  
  // 传感器数据缓存
  SENSOR_DATA: {
    ttlSeconds: 10,
    tags: ['sensor', 'data'],
  },
  
  // 知识库缓存
  KNOWLEDGE: {
    ttlSeconds: 600,
    tags: ['knowledge'],
  },
  
  // 系统配置缓存
  CONFIG: {
    ttlSeconds: 3600,
    tags: ['config'],
  },
};

export default apiCache;
