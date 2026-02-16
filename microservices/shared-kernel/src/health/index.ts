/**
 * @xilian/shared-kernel - 健康检查
 *
 * 为所有微服务提供标准化的 /healthz 和 /ready 端点。
 * 映射: server/services/healthCheck.job.ts
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  latency?: number;
  message?: string;
  lastChecked: string;
}

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  version: string;
  uptime: number;
  checks: HealthCheckResult[];
  timestamp: string;
}

type HealthCheckFn = () => Promise<{ status: HealthStatus; message?: string }>;

export class HealthChecker {
  private checks = new Map<string, HealthCheckFn>();
  private startTime = Date.now();

  constructor(
    private serviceName: string,
    private serviceVersion: string = '1.0.0',
  ) {}

  /**
   * 注册健康检查项
   */
  register(name: string, check: HealthCheckFn): this {
    this.checks.set(name, check);
    return this;
  }

  /**
   * 执行所有检查（/healthz）
   */
  async check(): Promise<ServiceHealth> {
    const results: HealthCheckResult[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const [name, checkFn] of this.checks) {
      const start = performance.now();
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<{ status: HealthStatus; message: string }>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 5000),
          ),
        ]);
        const latency = Math.round(performance.now() - start);
        results.push({
          name,
          status: result.status,
          latency,
          message: result.message,
          lastChecked: new Date().toISOString(),
        });

        if (result.status === 'unhealthy') overallStatus = 'unhealthy';
        else if (result.status === 'degraded' && overallStatus !== 'unhealthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        const latency = Math.round(performance.now() - start);
        results.push({
          name,
          status: 'unhealthy',
          latency,
          message: error instanceof Error ? error.message : String(error),
          lastChecked: new Date().toISOString(),
        });
        overallStatus = 'unhealthy';
      }
    }

    return {
      service: this.serviceName,
      status: overallStatus,
      version: this.serviceVersion,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      checks: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 就绪检查（/ready）— 只检查关键依赖
   */
  async ready(): Promise<boolean> {
    const health = await this.check();
    return health.status !== 'unhealthy';
  }
}

// ============================================================
// 预定义健康检查工厂函数
// ============================================================

/** MySQL 健康检查 */
export function mysqlHealthCheck(pool: { query: (sql: string) => Promise<unknown> }): HealthCheckFn {
  return async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** Redis 健康检查 */
export function redisHealthCheck(client: { ping: () => Promise<string> }): HealthCheckFn {
  return async () => {
    try {
      const result = await client.ping();
      return { status: result === 'PONG' ? 'healthy' : 'degraded' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** Kafka 健康检查 */
export function kafkaHealthCheck(admin: { listTopics: () => Promise<string[]> }): HealthCheckFn {
  return async () => {
    try {
      await admin.listTopics();
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** ClickHouse 健康检查 */
export function clickhouseHealthCheck(client: { query: (opts: { query: string }) => Promise<unknown> }): HealthCheckFn {
  return async () => {
    try {
      await client.query({ query: 'SELECT 1' });
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** Qdrant 健康检查 */
export function qdrantHealthCheck(client: { getCollections: () => Promise<unknown> }): HealthCheckFn {
  return async () => {
    try {
      await client.getCollections();
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** Neo4j 健康检查 */
export function neo4jHealthCheck(driver: { verifyConnectivity: () => Promise<unknown> }): HealthCheckFn {
  return async () => {
    try {
      await driver.verifyConnectivity();
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** MinIO 健康检查 */
export function minioHealthCheck(client: { listBuckets: () => Promise<unknown> }): HealthCheckFn {
  return async () => {
    try {
      await client.listBuckets();
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}

/** Ollama 健康检查 */
export function ollamaHealthCheck(baseUrl: string): HealthCheckFn {
  return async () => {
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      return { status: response.ok ? 'healthy' : 'degraded', message: `HTTP ${response.status}` };
    } catch (error) {
      return { status: 'unhealthy', message: (error as Error).message };
    }
  };
}
