/**
 * XPE v1.1 — PluginContext
 *
 * 每个插件实例持有一个隔离的 PluginContext，提供：
 *  - logger: 带 pluginId 前缀的结构化日志
 *  - config: 当前插件的配置快照
 *  - cache: 进程内 Map + TTL（审查修正 A：不再叫 storage）
 *  - plugins: 查询其他已激活插件的 API
 *  - events: 进程内事件发射/监听
 */
import { EventEmitter } from 'events';
import type { PluginManifest } from './manifest.schema';

// ── Cache 服务（进程内 Map + TTL） ──────────────────────────
interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Date.now() + ttlMs, 0 = 永不过期
}

export class PluginCache {
  private store = new Map<string, CacheEntry>();
  private readonly prefix: string;

  constructor(pluginId: string) {
    this.prefix = `${pluginId}:`;
  }

  set<T>(key: string, value: T, ttlMs = 0): void {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
    this.store.set(this.prefix + key, { value, expiresAt });
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(this.prefix + key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(this.prefix + key);
      return undefined;
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(this.prefix + key);
  }

  clear(): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(this.prefix)) {
        this.store.delete(k);
      }
    }
  }

  /** 清理所有过期条目 */
  gc(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [k, entry] of this.store) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.store.delete(k);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// ── PluginContext 接口 ──────────────────────────────────────
export interface PluginContext {
  /** 插件 ID */
  readonly pluginId: string;
  /** 插件 Manifest */
  readonly manifest: PluginManifest;
  /** 带 pluginId 前缀的结构化日志 */
  readonly logger: PluginLogger;
  /** 进程内 cache（Map + TTL） */
  readonly cache: PluginCache;
  /** 进程内事件总线 */
  readonly events: PluginEventBus;
  /** 查询其他已激活插件 */
  readonly plugins: PluginQueryAPI;
  /** 当前插件的配置快照 */
  getConfig<T = Record<string, unknown>>(): T;
  /** 更新配置快照 */
  setConfig(config: Record<string, unknown>): void;
}

// ── Logger 接口 ─────────────────────────────────────────────
export interface PluginLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ── 事件总线接口 ────────────────────────────────────────────
export interface PluginEventBus {
  emit(event: string, data?: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
  once(event: string, handler: (data: unknown) => void): void;
}

// ── 插件查询 API ────────────────────────────────────────────
export interface PluginQueryAPI {
  /** 获取指定 ID 的已激活插件实例 */
  get<T = unknown>(pluginId: string): T | undefined;
  /** 按类型查询所有已激活插件 */
  getByType(type: string): unknown[];
  /** 按 tag 查询所有已激活插件 */
  getByTag(tag: string): unknown[];
  /** 检查插件是否已激活 */
  isActive(pluginId: string): boolean;
}

// ── PluginContext 工厂 ──────────────────────────────────────

/** 外部注入的依赖（由 PluginEngine 提供） */
export interface ContextDependencies {
  getPlugin: (id: string) => unknown | undefined;
  getPluginsByType: (type: string) => unknown[];
  getPluginsByTag: (tag: string) => unknown[];
  isPluginActive: (id: string) => boolean;
  parentLogger?: PluginLogger;
}

export function createPluginContext(
  manifest: PluginManifest,
  deps: ContextDependencies,
): PluginContext {
  const pluginId = manifest.id;

  // Logger: 带 pluginId 前缀
  const logger = createPrefixedLogger(pluginId, deps.parentLogger);

  // Cache: 隔离的进程内 Map
  const cache = new PluginCache(pluginId);

  // EventBus: 进程内 EventEmitter
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const events: PluginEventBus = {
    emit: (event, data) => emitter.emit(`${pluginId}:${event}`, data),
    on: (event, handler) => emitter.on(`${pluginId}:${event}`, handler),
    off: (event, handler) => emitter.off(`${pluginId}:${event}`, handler),
    once: (event, handler) => emitter.once(`${pluginId}:${event}`, handler),
  };

  // 插件查询 API
  const plugins: PluginQueryAPI = {
    get: <T = unknown>(id: string) => deps.getPlugin(id) as T | undefined,
    getByType: (type: string) => deps.getPluginsByType(type),
    getByTag: (tag: string) => deps.getPluginsByTag(tag),
    isActive: (id: string) => deps.isPluginActive(id),
  };

  // 配置快照
  let configSnapshot: Record<string, unknown> = {};

  return {
    pluginId,
    manifest,
    logger,
    cache,
    events,
    plugins,
    getConfig: <T = Record<string, unknown>>() => configSnapshot as T,
    setConfig: (config: Record<string, unknown>) => {
      configSnapshot = { ...config };
    },
  };
}

// ── 辅助：带前缀的 Logger ──────────────────────────────────
function createPrefixedLogger(pluginId: string, parent?: PluginLogger): PluginLogger {
  const prefix = `[XPE:${pluginId}]`;

  if (parent) {
    return {
      debug: (msg, meta) => parent.debug(`${prefix} ${msg}`, meta),
      info: (msg, meta) => parent.info(`${prefix} ${msg}`, meta),
      warn: (msg, meta) => parent.warn(`${prefix} ${msg}`, meta),
      error: (msg, meta) => parent.error(`${prefix} ${msg}`, meta),
    };
  }

  // Fallback: console
  return {
    debug: (msg, meta) => console.debug(`${prefix} ${msg}`, meta ?? ''),
    info: (msg, meta) => console.info(`${prefix} ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`${prefix} ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`${prefix} ${msg}`, meta ?? ''),
  };
}
