/**
 * Redis Connector - 代理到真实的 ioredis 客户端
 * 替换原有的内存 Map 模拟实现
 */
import { redisClient, CACHE_KEYS } from "../../lib/clients/redis.client";

export class RedisConnector {
  private static instance: RedisConnector;

  static getInstance(): RedisConnector {
    if (!this.instance) this.instance = new RedisConnector();
    return this.instance;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await redisClient.get<string>(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      await redisClient.set(key, value, ttl);
    } catch {
      // Redis 不可用时静默失败，不影响主流程
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch {
      // 静默失败
    }
  }

  async healthCheck() {
    try {
      const result = await redisClient.healthCheck();
      return { status: result.connected ? "healthy" : "unhealthy", engine: "ioredis", latencyMs: result.latencyMs };
    } catch (e: unknown) {
      return { status: "unhealthy", error: e instanceof Error ? e.message : String(e), engine: "ioredis" };
    }
  }
}

export const redisConnector = RedisConnector.getInstance();
export { CACHE_KEYS };
