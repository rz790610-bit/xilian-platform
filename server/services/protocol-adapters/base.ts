/**
 * 协议适配器基础设施层
 * 
 * 提供所有协议适配器的公共能力：
 * - BaseAdapter 抽象类：统一生命周期管理（connect → healthCheck → disconnect）
 * - ConnectionPool：连接池管理（复用连接、自动清理、最大连接数控制）
 * - AdapterError：统一错误分类体系（CONNECTION / AUTH / TIMEOUT / PROTOCOL / RESOURCE_NOT_FOUND / INTERNAL）
 * - AdapterMetrics：运行指标收集（连接次数、延迟、错误率、最后活跃时间）
 * - RetryPolicy：指数退避重试策略
 * - withTimeout：统一超时控制包装器
 */

import type {
  ProtocolType,
  ConnectionTestResult,
  DiscoveredEndpoint,
  ProtocolConfigSchema,
  HealthCheckResult,
} from '../../../shared/accessLayerTypes';

// ============ 统一错误体系 ============

export enum AdapterErrorCode {
  CONNECTION = 'CONNECTION',
  AUTH = 'AUTH',
  TIMEOUT = 'TIMEOUT',
  PROTOCOL = 'PROTOCOL',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL',
}

export class AdapterError extends Error {
  public readonly code: AdapterErrorCode;
  public readonly protocolType: ProtocolType;
  public readonly recoverable: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: AdapterErrorCode,
    protocolType: ProtocolType,
    message: string,
    options?: {
      recoverable?: boolean;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.protocolType = protocolType;
    this.recoverable = options?.recoverable ?? false;
    this.details = options?.details;
    this.timestamp = new Date().toISOString();
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      protocolType: this.protocolType,
      message: this.message,
      recoverable: this.recoverable,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/** 将未知错误标准化为 AdapterError */
export function normalizeError(
  err: unknown,
  protocolType: ProtocolType,
  defaultCode: AdapterErrorCode = AdapterErrorCode.INTERNAL
): AdapterError {
  if (err instanceof AdapterError) return err;

  const raw = err instanceof Error ? err : new Error(String(err));
  const msg = raw.message.toLowerCase();

  // 自动分类常见错误模式
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('connection refused') || msg.includes('connect failed')) {
    return new AdapterError(AdapterErrorCode.CONNECTION, protocolType, `连接被拒绝: ${raw.message}`, { recoverable: true, cause: raw });
  }
  if (msg.includes('etimedout') || msg.includes('timeout') || msg.includes('timed out')) {
    return new AdapterError(AdapterErrorCode.TIMEOUT, protocolType, `连接超时: ${raw.message}`, { recoverable: true, cause: raw });
  }
  if (msg.includes('auth') || msg.includes('password') || msg.includes('credential') || msg.includes('access denied') || msg.includes('unauthorized')) {
    return new AdapterError(AdapterErrorCode.AUTH, protocolType, `认证失败: ${raw.message}`, { recoverable: false, cause: raw });
  }
  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('not allowed')) {
    return new AdapterError(AdapterErrorCode.PERMISSION_DENIED, protocolType, `权限不足: ${raw.message}`, { recoverable: false, cause: raw });
  }
  if (msg.includes('not found') || msg.includes('no such') || msg.includes('does not exist')) {
    return new AdapterError(AdapterErrorCode.RESOURCE_NOT_FOUND, protocolType, `资源不存在: ${raw.message}`, { recoverable: false, cause: raw });
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return new AdapterError(AdapterErrorCode.RATE_LIMITED, protocolType, `请求频率限制: ${raw.message}`, { recoverable: true, cause: raw });
  }

  return new AdapterError(defaultCode, protocolType, raw.message, { recoverable: false, cause: raw });
}

// ============ 运行指标 ============

export interface AdapterMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  totalQueries: number;
  failedQueries: number;
  avgLatencyMs: number;
  lastConnectedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  uptime: number; // 秒
}

class MetricsCollector {
  private _totalConnections = 0;
  private _activeConnections = 0;
  private _failedConnections = 0;
  private _totalQueries = 0;
  private _failedQueries = 0;
  private _latencySum = 0;
  private _latencyCount = 0;
  private _lastConnectedAt: string | null = null;
  private _lastErrorAt: string | null = null;
  private _lastError: string | null = null;
  private _startTime = Date.now();

  recordConnection(success: boolean) {
    this._totalConnections++;
    if (success) {
      this._activeConnections++;
      this._lastConnectedAt = new Date().toISOString();
    } else {
      this._failedConnections++;
    }
  }

  recordDisconnection() {
    if (this._activeConnections > 0) this._activeConnections--;
  }

  recordQuery(latencyMs: number, success: boolean) {
    this._totalQueries++;
    this._latencySum += latencyMs;
    this._latencyCount++;
    if (!success) this._failedQueries++;
  }

  recordError(error: string) {
    this._lastErrorAt = new Date().toISOString();
    this._lastError = error;
  }

  getMetrics(): AdapterMetrics {
    return {
      totalConnections: this._totalConnections,
      activeConnections: this._activeConnections,
      failedConnections: this._failedConnections,
      totalQueries: this._totalQueries,
      failedQueries: this._failedQueries,
      avgLatencyMs: this._latencyCount > 0 ? Math.round(this._latencySum / this._latencyCount) : 0,
      lastConnectedAt: this._lastConnectedAt,
      lastErrorAt: this._lastErrorAt,
      lastError: this._lastError,
      uptime: Math.round((Date.now() - this._startTime) / 1000),
    };
  }

  reset() {
    this._totalConnections = 0;
    this._activeConnections = 0;
    this._failedConnections = 0;
    this._totalQueries = 0;
    this._failedQueries = 0;
    this._latencySum = 0;
    this._latencyCount = 0;
    this._lastConnectedAt = null;
    this._lastErrorAt = null;
    this._lastError = null;
    this._startTime = Date.now();
  }
}

// ============ 超时控制 ============

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  protocolType: ProtocolType,
  operation: string = 'operation'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AdapterError(
        AdapterErrorCode.TIMEOUT,
        protocolType,
        `${operation} 超时 (${timeoutMs}ms)`,
        { recoverable: true }
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

// ============ 重试策略 ============

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: AdapterErrorCode[];
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [AdapterErrorCode.CONNECTION, AdapterErrorCode.TIMEOUT, AdapterErrorCode.RATE_LIMITED],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  protocolType: ProtocolType,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const adapterErr = normalizeError(err, protocolType);

      // 如果错误不可重试，直接抛出
      if (opts.retryableErrors && !opts.retryableErrors.includes(adapterErr.code)) {
        throw adapterErr;
      }

      if (attempt < opts.maxRetries) {
        const jitter = delay * 0.1 * Math.random();
        await new Promise(r => setTimeout(r, delay + jitter));
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw normalizeError(lastError, protocolType);
}

// ============ 连接池 ============

interface PoolEntry<T> {
  connection: T;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
}

export interface PoolConfig {
  minSize: number;
  maxSize: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
  evictionIntervalMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  minSize: 1,
  maxSize: 10,
  acquireTimeoutMs: 10000,
  idleTimeoutMs: 300000,      // 5 分钟
  maxLifetimeMs: 1800000,     // 30 分钟
  evictionIntervalMs: 60000,  // 1 分钟
};

export class ConnectionPool<T> {
  private pool: PoolEntry<T>[] = [];
  private config: PoolConfig;
  private createFn: () => Promise<T>;
  private destroyFn: (conn: T) => Promise<void>;
  private validateFn: (conn: T) => Promise<boolean>;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;
  private _closed = false;

  constructor(
    createFn: () => Promise<T>,
    destroyFn: (conn: T) => Promise<void>,
    validateFn: (conn: T) => Promise<boolean>,
    config: Partial<PoolConfig> = {}
  ) {
    this.createFn = createFn;
    this.destroyFn = destroyFn;
    this.validateFn = validateFn;
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    // 预热最小连接数
    for (let i = 0; i < this.config.minSize; i++) {
      try {
        const conn = await this.createFn();
        this.pool.push({
          connection: conn,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          inUse: false,
        });
      } catch {
        // 预热失败不阻塞启动
        break;
      }
    }

    // 启动空闲连接回收
    this.evictionTimer = setInterval(() => this.evict(), this.config.evictionIntervalMs);
  }

  async acquire(): Promise<T> {
    if (this._closed) throw new Error('连接池已关闭');

    // 尝试获取空闲连接
    for (const entry of this.pool) {
      if (!entry.inUse) {
        // 检查连接是否过期
        if (Date.now() - entry.createdAt > this.config.maxLifetimeMs) {
          await this.removeEntry(entry);
          continue;
        }
        // 验证连接有效性
        try {
          const valid = await this.validateFn(entry.connection);
          if (valid) {
            entry.inUse = true;
            entry.lastUsedAt = Date.now();
            return entry.connection;
          }
        } catch {
          await this.removeEntry(entry);
          continue;
        }
      }
    }

    // 没有空闲连接，创建新连接
    if (this.pool.length < this.config.maxSize) {
      const conn = await withTimeout(
        this.createFn(),
        this.config.acquireTimeoutMs,
        'internal' as ProtocolType,
        '获取连接'
      );
      const entry: PoolEntry<T> = {
        connection: conn,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        inUse: true,
      };
      this.pool.push(entry);
      return conn;
    }

    // 连接池已满，等待
    throw new Error(`连接池已满 (${this.config.maxSize})，无法获取新连接`);
  }

  release(conn: T): void {
    const entry = this.pool.find(e => e.connection === conn);
    if (entry) {
      entry.inUse = false;
      entry.lastUsedAt = Date.now();
    }
  }

  private async removeEntry(entry: PoolEntry<T>): Promise<void> {
    const idx = this.pool.indexOf(entry);
    if (idx >= 0) {
      this.pool.splice(idx, 1);
      try { await this.destroyFn(entry.connection); } catch { /* ignore */ }
    }
  }

  private async evict(): Promise<void> {
    const now = Date.now();
    const toRemove: PoolEntry<T>[] = [];

    for (const entry of this.pool) {
      if (entry.inUse) continue;
      // 空闲超时
      if (now - entry.lastUsedAt > this.config.idleTimeoutMs && this.pool.length > this.config.minSize) {
        toRemove.push(entry);
      }
      // 生命周期超时
      if (now - entry.createdAt > this.config.maxLifetimeMs) {
        toRemove.push(entry);
      }
    }

    for (const entry of toRemove) {
      await this.removeEntry(entry);
    }
  }

  async close(): Promise<void> {
    this._closed = true;
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    for (const entry of this.pool) {
      try { await this.destroyFn(entry.connection); } catch { /* ignore */ }
    }
    this.pool = [];
  }

  get size(): number { return this.pool.length; }
  get activeCount(): number { return this.pool.filter(e => e.inUse).length; }
  get idleCount(): number { return this.pool.filter(e => !e.inUse).length; }
}

// ============ BaseAdapter 抽象类 ============

export interface ProtocolAdapter {
  readonly protocolType: ProtocolType;
  readonly configSchema: ProtocolConfigSchema;
  testConnection(params: Record<string, unknown>, auth?: Record<string, unknown>): Promise<ConnectionTestResult>;
  discoverResources?(params: Record<string, unknown>, auth?: Record<string, unknown>): Promise<DiscoveredEndpoint[]>;
  healthCheck?(params: Record<string, unknown>, auth?: Record<string, unknown>): Promise<HealthCheckResult>;
  disconnect?(params: Record<string, unknown>): Promise<void>;
  getMetrics?(): AdapterMetrics;
}

export abstract class BaseAdapter implements ProtocolAdapter {
  abstract readonly protocolType: ProtocolType;
  abstract readonly configSchema: ProtocolConfigSchema;

  protected metrics = new MetricsCollector();
  protected defaultTimeoutMs = 10000;

  async testConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const result = await withTimeout(
        this.doTestConnection(params, auth),
        this.defaultTimeoutMs,
        this.protocolType,
        '连接测试'
      );
      this.metrics.recordConnection(result.success);
      this.metrics.recordQuery(Date.now() - start, result.success);
      if (!result.success) {
        this.metrics.recordError(result.message);
      }
      return {
        ...result,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const latency = Date.now() - start;
      const adapterErr = normalizeError(err, this.protocolType);
      this.metrics.recordConnection(false);
      this.metrics.recordQuery(latency, false);
      this.metrics.recordError(adapterErr.message);
      return {
        success: false,
        latencyMs: latency,
        message: adapterErr.message,
        details: adapterErr.toJSON(),
      };
    }
  }

  async discoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const start = Date.now();
    try {
      const result = await withTimeout(
        this.doDiscoverResources(params, auth),
        this.defaultTimeoutMs * 3, // 资源发现允许更长时间
        this.protocolType,
        '资源发现'
      );
      this.metrics.recordQuery(Date.now() - start, true);
      return result;
    } catch (err) {
      this.metrics.recordQuery(Date.now() - start, false);
      const adapterErr = normalizeError(err, this.protocolType);
      this.metrics.recordError(adapterErr.message);
      throw adapterErr;
    }
  }

  async healthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const result = await withTimeout(
        this.doHealthCheck(params, auth),
        this.defaultTimeoutMs,
        this.protocolType,
        '健康检查'
      );
      return {
        ...result,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      const adapterErr = normalizeError(err, this.protocolType);
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: adapterErr.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  getMetrics(): AdapterMetrics {
    return this.metrics.getMetrics();
  }

  // 子类必须实现的真实连接逻辑
  protected abstract doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult>;

  protected abstract doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]>;

  // 默认健康检查 = 连接测试
  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const testResult = await this.doTestConnection(params, auth);
    return {
      status: testResult.success ? 'healthy' : 'unhealthy',
      message: testResult.message,
      metrics: testResult.details,
    };
  }

  /** 工具方法：构建连接 URL */
  protected buildUrl(params: Record<string, unknown>, defaultPort: number, protocol: string = 'tcp'): string {
    const host = (params.host as string) || 'localhost';
    const port = (params.port as number) || defaultPort;
    return `${protocol}://${host}:${port}`;
  }
}
