/**
 * 配置中心远程客户端
 *
 * 微服务模式下消费 Config Center 服务（HTTP + Redis Pub/Sub）。
 * 实现 IConfigProvider 接口，对调用方完全透明。
 *
 * 数据流:
 *   初始化: HTTP GET /api/v1/config/snapshot → 全量快照写入本地缓存
 *   实时:   Redis SUB config:changed → 增量更新本地缓存
 *   降级:   HTTP 失败 → process.env 回退
 *           Redis 不可用 → HTTP 轮询
 *
 * 单例工厂: getConfigCenterClient() / resetConfigCenterClient()
 */

import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';
import type { IConfigProvider } from './config-proxy';
import type { ConfigChangeListener, ConfigChangeEvent } from '../services/configCenter';

const log = createModuleLogger('config-center-client');

// ============================================================
// 缓存条目
// ============================================================

interface CachedEntry {
  value: string;
  version: number;
  fetchedAt: number;
}

// ============================================================
// ConfigCenterClient
// ============================================================

export class ConfigCenterClient implements IConfigProvider {
  private cache = new Map<string, CachedEntry>();
  private listeners = new Map<string, Set<ConfigChangeListener>>();
  private baseUrl: string;
  private cacheTtlMs: number;
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private redisAvailable = false;
  private initialized = false;

  constructor(
    baseUrl?: string,
    cacheTtlMs?: number,
    pollIntervalMs?: number,
  ) {
    this.baseUrl = baseUrl || config.configCenter.url;
    this.cacheTtlMs = cacheTtlMs || config.configCenter.cacheTtlMs;
    this.pollIntervalMs = pollIntervalMs || config.configCenter.pollIntervalMs;
  }

  // ─── 读取方法 ────────────────────────────────────

  get(key: string, defaultValue?: string): string {
    const entry = this.cache.get(key);
    if (entry) {
      // 缓存未过期，直接返回
      if (Date.now() - entry.fetchedAt < this.cacheTtlMs) {
        return entry.value;
      }
      // 过期：后台刷新，但仍然返回旧值（stale-while-revalidate）
      this.refreshKeyInBackground(key);
      return entry.value;
    }
    // 缓存未命中 → 回退 process.env
    const envValue = process.env[key];
    if (envValue !== undefined) return envValue;
    return defaultValue || '';
  }

  getInt(key: string, defaultValue: number): number {
    const v = this.get(key);
    if (!v) return defaultValue;
    const parsed = parseInt(v, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getBool(key: string, defaultValue: boolean): boolean {
    const v = this.get(key);
    if (!v) return defaultValue;
    return v === 'true' || v === '1' || v === 'yes';
  }

  // ─── 写入方法 ────────────────────────────────────

  async set(key: string, value: string, updatedBy?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/config/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, updatedBy: updatedBy || 'remote-client' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        log.warn(`Config set failed for "${key}": HTTP ${res.status}`);
        return false;
      }
      // 更新本地缓存
      const old = this.cache.get(key);
      this.cache.set(key, {
        value,
        version: (old?.version ?? 0) + 1,
        fetchedAt: Date.now(),
      });
      return true;
    } catch (err: any) {
      log.warn(`Config set failed for "${key}": ${err.message}`);
      return false;
    }
  }

  // ─── 监听方法 ────────────────────────────────────

  watch(key: string, handler: ConfigChangeListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(handler);
    return () => { this.listeners.get(key)?.delete(handler); };
  }

  // ─── 生命周期 ────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. HTTP 拉全量快照
    await this.fetchSnapshot();

    // 2. 尝试 Redis Pub/Sub 订阅
    await this.startRedisSubscription();

    // 3. 如果 Redis 不可用，启动 HTTP 轮询
    if (!this.redisAvailable) {
      this.startHttpPolling();
    }

    this.initialized = true;
    log.info(`ConfigCenterClient initialized (${this.cache.size} entries, redis=${this.redisAvailable})`);
  }

  shutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listeners.clear();
    this.cache.clear();
    this.initialized = false;
    log.info('ConfigCenterClient shutdown');
  }

  // ─── 内部方法 ────────────────────────────────────

  private async fetchSnapshot(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/config/snapshot`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        log.warn(`Snapshot fetch failed: HTTP ${res.status}`);
        return;
      }
      const snapshot = await res.json() as Record<string, {
        value: string;
        version: number;
      }>;
      for (const [key, entry] of Object.entries(snapshot)) {
        this.cache.set(key, {
          value: entry.value,
          version: entry.version,
          fetchedAt: Date.now(),
        });
      }
      log.debug(`Loaded ${Object.keys(snapshot).length} entries from snapshot`);
    } catch (err: any) {
      log.warn(`Snapshot fetch failed: ${err.message} — continuing with env fallback`);
    }
  }

  private async startRedisSubscription(): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      await redisClient.psubscribe('config:changed', async (_pattern, _channel, message) => {
        try {
          const { key, version } = JSON.parse(message);
          const existing = this.cache.get(key);
          if (existing && existing.version >= version) return;

          // 从远程重新获取该 key
          await this.refreshKey(key);
        } catch (err: any) {
          log.warn(`Redis config change handler error: ${err.message}`);
        }
      });
      this.redisAvailable = true;
      log.debug('Redis Pub/Sub subscription active for config:changed');
    } catch (err: any) {
      this.redisAvailable = false;
      log.warn(`Redis subscription failed: ${err.message} — falling back to HTTP polling`);
    }
  }

  private startHttpPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      await this.fetchSnapshot();
    }, this.pollIntervalMs);
    log.debug(`HTTP polling started (interval=${this.pollIntervalMs}ms)`);
  }

  private async refreshKey(key: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/config/${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const data = await res.json() as { value: string; version: number };
      const old = this.cache.get(key);
      this.cache.set(key, {
        value: data.value,
        version: data.version,
        fetchedAt: Date.now(),
      });

      // 通知监听者
      if (old && old.value !== data.value) {
        await this.notifyListeners(key, {
          key,
          oldValue: old.value,
          newValue: data.value,
          source: 'remote',
          version: data.version,
          timestamp: new Date(),
        });
      }
    } catch (err: any) {
      log.debug(`Refresh key "${key}" failed: ${err.message}`);
    }
  }

  private refreshKeyInBackground(key: string): void {
    this.refreshKey(key).catch(() => { /* stale-while-revalidate: 静默失败 */ });
  }

  private async notifyListeners(key: string, event: ConfigChangeEvent): Promise<void> {
    const keyListeners = this.listeners.get(key);
    if (!keyListeners) return;
    for (const listener of Array.from(keyListeners)) {
      try {
        await listener(event);
      } catch (err: any) {
        log.warn(`Config change listener error for "${key}": ${err.message}`);
      }
    }
  }
}

// ============================================================
// 单例工厂
// ============================================================

let instance: ConfigCenterClient | null = null;

export function getConfigCenterClient(): ConfigCenterClient {
  if (!instance) {
    instance = new ConfigCenterClient();
  }
  return instance;
}

export function resetConfigCenterClient(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
