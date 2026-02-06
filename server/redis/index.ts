/**
 * Redis 模块索引
 * 导出所有 Redis 相关的服务和路由
 */

// 客户端
export { redisClient, CACHE_KEYS } from './redisClient';
export type { RedisConfig } from './redisClient';

// 去重服务
export { deduplicationService } from './deduplicationService';

// 路由
export { redisRouter } from './redisRouter';
export type { RedisRouter } from './redisRouter';
export { deduplicationRouter } from './deduplicationRouter';
export type { DeduplicationRouter } from './deduplicationRouter';
