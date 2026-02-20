/**
 * ============================================================================
 * 存储路由工具 — StorageRouter
 * ============================================================================
 *
 * 通用赋能平台：智能存储路由
 *
 * 职责：
 *   1. 根据数据类型自动路由到最优存储引擎
 *   2. 时序数据 → ClickHouse（高吞吐分析）
 *   3. 原始文件 → MinIO/S3（对象存储）
 *   4. 关系数据 → MySQL/PostgreSQL（事务一致性）
 *   5. 缓存数据 → Redis（低延迟读取）
 *   6. 支持自定义路由规则
 *
 * 设计原则：
 *   - 存储无关：上层不关心数据存在哪里
 *   - 配置驱动：路由规则可热更新
 *   - 可扩展：插件式添加新存储后端
 */

// ============================================================================
// 存储后端类型
// ============================================================================

export type StorageBackend = 'clickhouse' | 'minio' | 'mysql' | 'redis' | 'elasticsearch' | 'custom';

export type DataCategory =
  | 'timeseries'      // 时序数据（传感器读数、指标）
  | 'raw_file'        // 原始文件（图纸、日志、图片）
  | 'relational'      // 关系数据（配置、元数据、业务记录）
  | 'cache'           // 缓存数据（热数据、会话）
  | 'search_index'    // 搜索索引（日志、文档全文检索）
  | 'event'           // 事件数据（事件溯源）
  | 'knowledge';      // 知识数据（图谱、特征）

// ============================================================================
// 路由规则
// ============================================================================

export interface StorageRoutingRule {
  /** 规则 ID */
  id: string;
  /** 数据类别 */
  category: DataCategory;
  /** 目标存储后端 */
  backend: StorageBackend;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 条件匹配（可选） */
  condition?: {
    /** 数据源 ID 匹配模式 */
    sourcePattern?: string;
    /** 最小数据大小（字节） */
    minSizeBytes?: number;
    /** 最大数据大小（字节） */
    maxSizeBytes?: number;
    /** 数据保留天数 */
    retentionDays?: number;
    /** 自定义条件函数 */
    customPredicate?: (data: StorageRequest) => boolean;
  };
  /** 存储参数 */
  params: Record<string, unknown>;
  /** 是否启用 */
  enabled: boolean;
}

// ============================================================================
// 存储请求/响应
// ============================================================================

export interface StorageRequest {
  /** 请求 ID */
  requestId: string;
  /** 数据类别 */
  category: DataCategory;
  /** 数据源 ID */
  sourceId: string;
  /** 数据键 */
  key: string;
  /** 数据内容 */
  data: unknown;
  /** 数据大小（字节） */
  sizeBytes: number;
  /** 时间戳 */
  timestamp: number;
  /** 保留天数（-1 表示永久） */
  retentionDays: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

export interface StorageResponse {
  /** 请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 路由到的存储后端 */
  backend: StorageBackend;
  /** 存储位置标识 */
  location: string;
  /** 耗时（ms） */
  durationMs: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 存储后端接口
// ============================================================================

export interface StorageBackendDriver {
  /** 后端类型 */
  type: StorageBackend;
  /** 写入数据 */
  write(request: StorageRequest, params: Record<string, unknown>): Promise<StorageResponse>;
  /** 读取数据 */
  read(key: string, params: Record<string, unknown>): Promise<unknown>;
  /** 删除数据 */
  delete(key: string, params: Record<string, unknown>): Promise<boolean>;
  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// 内置存储后端驱动
// ============================================================================

/** ClickHouse 时序存储驱动 */
class ClickHouseDriver implements StorageBackendDriver {
  type: StorageBackend = 'clickhouse';

  async write(request: StorageRequest, params: Record<string, unknown>): Promise<StorageResponse> {
    const start = Date.now();
    const table = (params.table as string) || 'sensor_data';

    try {
      // 框架实现：实际部署时通过 ClickHouse HTTP 接口或 clickhouse-client 写入
      const location = `clickhouse://${table}/${request.key}`;

      return {
        requestId: request.requestId,
        success: true,
        backend: 'clickhouse',
        location,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        requestId: request.requestId,
        success: false,
        backend: 'clickhouse',
        location: '',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async read(key: string, params: Record<string, unknown>): Promise<unknown> {
    const table = (params.table as string) || 'sensor_data';
    // 框架实现：实际部署时执行 ClickHouse 查询
    return { table, key, rows: [] };
  }

  async delete(key: string, params: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/** MinIO 对象存储驱动 */
class MinIODriver implements StorageBackendDriver {
  type: StorageBackend = 'minio';

  async write(request: StorageRequest, params: Record<string, unknown>): Promise<StorageResponse> {
    const start = Date.now();
    const bucket = (params.bucket as string) || 'platform-data';

    try {
      const objectKey = `${request.sourceId}/${new Date(request.timestamp).toISOString().slice(0, 10)}/${request.key}`;
      const location = `minio://${bucket}/${objectKey}`;

      return {
        requestId: request.requestId,
        success: true,
        backend: 'minio',
        location,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        requestId: request.requestId,
        success: false,
        backend: 'minio',
        location: '',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async read(key: string, params: Record<string, unknown>): Promise<unknown> {
    return { bucket: params.bucket, key };
  }

  async delete(key: string, params: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/** MySQL 关系存储驱动 */
class MySQLDriver implements StorageBackendDriver {
  type: StorageBackend = 'mysql';

  async write(request: StorageRequest, params: Record<string, unknown>): Promise<StorageResponse> {
    const start = Date.now();
    const table = (params.table as string) || 'platform_data';

    try {
      const location = `mysql://${table}/${request.key}`;

      return {
        requestId: request.requestId,
        success: true,
        backend: 'mysql',
        location,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        requestId: request.requestId,
        success: false,
        backend: 'mysql',
        location: '',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async read(key: string, params: Record<string, unknown>): Promise<unknown> {
    return { table: params.table, key };
  }

  async delete(key: string, params: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/** Redis 缓存驱动 */
class RedisDriver implements StorageBackendDriver {
  type: StorageBackend = 'redis';

  async write(request: StorageRequest, params: Record<string, unknown>): Promise<StorageResponse> {
    const start = Date.now();
    const prefix = (params.prefix as string) || 'platform';

    try {
      const redisKey = `${prefix}:${request.category}:${request.key}`;
      const location = `redis://${redisKey}`;

      return {
        requestId: request.requestId,
        success: true,
        backend: 'redis',
        location,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        requestId: request.requestId,
        success: false,
        backend: 'redis',
        location: '',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async read(key: string, params: Record<string, unknown>): Promise<unknown> {
    return null;
  }

  async delete(key: string, params: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// 存储路由器实现
// ============================================================================

export class StorageRouter {
  private rules: StorageRoutingRule[] = [];
  private drivers = new Map<StorageBackend, StorageBackendDriver>();
  private metrics = {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    byBackend: new Map<StorageBackend, number>(),
    avgDurationMs: 0,
  };

  constructor() {
    // 注册内置驱动
    this.registerDriver(new ClickHouseDriver());
    this.registerDriver(new MinIODriver());
    this.registerDriver(new MySQLDriver());
    this.registerDriver(new RedisDriver());

    // 加载默认路由规则
    this.loadDefaultRules();
  }

  /** 注册存储驱动 */
  registerDriver(driver: StorageBackendDriver): void {
    this.drivers.set(driver.type, driver);
  }

  /** 添加路由规则 */
  addRule(rule: StorageRoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /** 路由并写入 */
  async route(request: StorageRequest): Promise<StorageResponse> {
    this.metrics.totalRequests++;

    // 1. 匹配路由规则
    const rule = this.matchRule(request);
    if (!rule) {
      this.metrics.failureCount++;
      return {
        requestId: request.requestId,
        success: false,
        backend: 'custom',
        location: '',
        durationMs: 0,
        error: `No routing rule matched for category: ${request.category}`,
      };
    }

    // 2. 获取驱动
    const driver = this.drivers.get(rule.backend);
    if (!driver) {
      this.metrics.failureCount++;
      return {
        requestId: request.requestId,
        success: false,
        backend: rule.backend,
        location: '',
        durationMs: 0,
        error: `No driver registered for backend: ${rule.backend}`,
      };
    }

    // 3. 执行写入
    const response = await driver.write(request, rule.params);

    // 4. 更新指标
    if (response.success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }
    const count = this.metrics.byBackend.get(rule.backend) || 0;
    this.metrics.byBackend.set(rule.backend, count + 1);

    return response;
  }

  /** 批量路由 */
  async routeBatch(requests: StorageRequest[]): Promise<StorageResponse[]> {
    return Promise.all(requests.map(r => this.route(r)));
  }

  /** 获取路由指标 */
  getMetrics(): { totalRequests: number; successCount: number; failureCount: number; byBackend: Record<string, number> } {
    return {
      totalRequests: this.metrics.totalRequests,
      successCount: this.metrics.successCount,
      failureCount: this.metrics.failureCount,
      byBackend: Object.fromEntries(this.metrics.byBackend),
    };
  }

  /** 获取所有规则 */
  getRules(): StorageRoutingRule[] {
    return [...this.rules];
  }

  /** 健康检查所有后端 */
  async healthCheckAll(): Promise<Map<StorageBackend, boolean>> {
    const results = new Map<StorageBackend, boolean>();
    for (const [type, driver] of this.drivers) {
      try {
        results.set(type, await driver.healthCheck());
      } catch {
        results.set(type, false);
      }
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private matchRule(request: StorageRequest): StorageRoutingRule | null {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.category !== request.category) continue;

      if (rule.condition) {
        const { sourcePattern, minSizeBytes, maxSizeBytes, customPredicate } = rule.condition;

        if (sourcePattern && !new RegExp(sourcePattern).test(request.sourceId)) continue;
        if (minSizeBytes !== undefined && request.sizeBytes < minSizeBytes) continue;
        if (maxSizeBytes !== undefined && request.sizeBytes > maxSizeBytes) continue;
        if (customPredicate && !customPredicate(request)) continue;
      }

      return rule;
    }
    return null;
  }

  private loadDefaultRules(): void {
    const defaults: StorageRoutingRule[] = [
      {
        id: 'ts-to-clickhouse',
        category: 'timeseries',
        backend: 'clickhouse',
        priority: 10,
        params: { table: 'sensor_data' },
        enabled: true,
      },
      {
        id: 'raw-to-minio',
        category: 'raw_file',
        backend: 'minio',
        priority: 10,
        params: { bucket: 'platform-raw' },
        enabled: true,
      },
      {
        id: 'relational-to-mysql',
        category: 'relational',
        backend: 'mysql',
        priority: 10,
        params: { table: 'platform_data' },
        enabled: true,
      },
      {
        id: 'cache-to-redis',
        category: 'cache',
        backend: 'redis',
        priority: 10,
        params: { prefix: 'platform', ttlSeconds: 3600 },
        enabled: true,
      },
      {
        id: 'event-to-clickhouse',
        category: 'event',
        backend: 'clickhouse',
        priority: 10,
        params: { table: 'platform_events' },
        enabled: true,
      },
      {
        id: 'knowledge-to-mysql',
        category: 'knowledge',
        backend: 'mysql',
        priority: 10,
        params: { table: 'knowledge_store' },
        enabled: true,
      },
    ];

    for (const rule of defaults) {
      this.addRule(rule);
    }
  }
}
