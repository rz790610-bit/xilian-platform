import { redisConnector } from "../connectors/redis.connector";

export class CacheManagerService {
  private readonly TTL: Record<string, number> = { config: 3600, device: 300, model: 1800, session: 86400, metric: 60 };
  async getConfig(key: string) { const v = await redisConnector.get(`config:${key}`); return v ? JSON.parse(v) : null; }
  async setConfig(key: string, value: any) { await redisConnector.set(`config:${key}`, JSON.stringify(value), this.TTL.config); }
  async getDeviceStatus(code: string) { const v = await redisConnector.get(`device:${code}`); return v ? JSON.parse(v) : null; }
  async setDeviceStatus(code: string, status: any) { await redisConnector.set(`device:${code}`, JSON.stringify(status), this.TTL.device); }
  async invalidate(pattern: string) { await redisConnector.del(pattern); }
}
export const cacheManager = new CacheManagerService();
