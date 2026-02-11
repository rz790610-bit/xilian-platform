export class RedisConnector {
  private static instance: RedisConnector;
  private cache = new Map<string, { value: string; expiry: number }>();
  static getInstance(): RedisConnector {
    if (!this.instance) this.instance = new RedisConnector();
    return this.instance;
  }
  async get(key: string): Promise<string | null> {
    const e = this.cache.get(key);
    if (!e) return null;
    if (e.expiry && Date.now() > e.expiry) { this.cache.delete(key); return null; }
    return e.value;
  }
  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.cache.set(key, { value, expiry: ttl ? Date.now() + ttl * 1000 : 0 });
  }
  async del(key: string): Promise<void> { this.cache.delete(key); }
  async healthCheck() { return { status: "healthy" }; }
}
export const redisConnector = RedisConnector.getInstance();
