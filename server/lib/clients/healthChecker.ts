/**
 * 服务健康检查客户端
 * 检测各个服务的真实运行状态
 */

import http from 'http';
import https from 'https';
import net from 'net';
import type { ServiceHealth } from '../../core/types/domain';

export interface HealthCheckConfig {
  name: string;
  type: 'http' | 'tcp' | 'custom';
  host: string;
  port: number;
  path?: string;
  timeout?: number;
  expectedStatus?: number;
  customCheck?: () => Promise<boolean>;
}

// 预定义服务配置
const SERVICE_CONFIGS: HealthCheckConfig[] = [
  {
    name: 'Ollama',
    type: 'http',
    host: process.env.OLLAMA_HOST || 'localhost',
    port: parseInt(process.env.OLLAMA_PORT || '11434'),
    path: '/api/version',
    timeout: 5000,
    expectedStatus: 200,
  },
  {
    name: 'Qdrant',
    type: 'http',
    host: process.env.QDRANT_HOST || 'localhost',
    port: parseInt(process.env.QDRANT_PORT || '6333'),
    path: '/collections',
    timeout: 5000,
    expectedStatus: 200,
  },
  {
    name: 'Redis',
    type: 'tcp',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    timeout: 3000,
  },
  {
    name: 'MySQL',
    type: 'tcp',
    host: process.env.DATABASE_HOST || process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || process.env.MYSQL_PORT || '3306'),
    timeout: 3000,
  },
  {
    name: 'ClickHouse',
    type: 'http',
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
    path: '/ping',
    timeout: 5000,
    expectedStatus: 200,
  },
  {
    name: 'Kafka',
    type: 'tcp',
    host: process.env.KAFKA_BROKER?.split(':')[0] || 'localhost',
    port: parseInt(process.env.KAFKA_BROKER?.split(':')[1] || '9092'),
    timeout: 3000,
  },
  {
    name: 'Zookeeper',
    type: 'tcp',
    host: process.env.ZOOKEEPER_HOST || 'localhost',
    port: parseInt(process.env.ZOOKEEPER_PORT || '2181'),
    timeout: 3000,
  },
];

/**
 * HTTP 健康检查
 */
async function httpHealthCheck(config: HealthCheckConfig): Promise<{
  healthy: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const protocol = config.port === 443 ? https : http;
  
  return new Promise((resolve) => {
    const req = protocol.request(
      {
        hostname: config.host,
        port: config.port,
        path: config.path || '/',
        method: 'GET',
        timeout: config.timeout || 5000,
      },
      (res) => {
        const latencyMs = Date.now() - startTime;
        const healthy = config.expectedStatus 
          ? res.statusCode === config.expectedStatus
          : (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400;
        
        // 消费响应体
        res.on('data', () => {});
        res.on('end', () => {
          resolve({
            healthy,
            latencyMs,
            statusCode: res.statusCode,
          });
        });
      }
    );

    req.on('error', (error) => {
      resolve({
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        healthy: false,
        latencyMs: config.timeout || 5000,
        error: 'Timeout',
      });
    });

    req.end();
  });
}

/**
 * TCP 健康检查
 */
async function tcpHealthCheck(config: HealthCheckConfig): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(config.timeout || 3000);
    
    socket.on('connect', () => {
      const latencyMs = Date.now() - startTime;
      socket.destroy();
      resolve({
        healthy: true,
        latencyMs,
      });
    });

    socket.on('error', (error) => {
      socket.destroy();
      resolve({
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        healthy: false,
        latencyMs: config.timeout || 3000,
        error: 'Timeout',
      });
    });

    socket.connect(config.port, config.host);
  });
}

/**
 * 执行单个服务健康检查
 */
export async function checkServiceHealth(config: HealthCheckConfig): Promise<ServiceHealth> {
  let result: { healthy: boolean; latencyMs: number; statusCode?: number; error?: string };

  if (config.type === 'http') {
    result = await httpHealthCheck(config);
  } else if (config.type === 'tcp') {
    result = await tcpHealthCheck(config);
  } else if (config.type === 'custom' && config.customCheck) {
    const startTime = Date.now();
    try {
      const healthy = await config.customCheck();
      result = {
        healthy,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      result = {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      };
    }
  } else {
    result = {
      healthy: false,
      latencyMs: 0,
      error: 'Unknown check type',
    };
  }

  return {
    name: config.name,
    status: result.healthy ? 'healthy' : 'unhealthy',
    endpoint: `${config.host}:${config.port}${config.path || ''}`,
    lastCheck: new Date(),
    responseTimeMs: result.latencyMs,
    checks: [
      {
        name: config.type === 'http' ? 'HTTP Response' : 'TCP Connection',
        status: result.healthy ? 'pass' : 'fail',
        message: result.error || (result.healthy ? 'OK' : 'Failed'),
      },
      ...(result.statusCode ? [{
        name: 'Status Code',
        status: (result.statusCode >= 200 && result.statusCode < 400) ? 'pass' as const : 'fail' as const,
        message: `HTTP ${result.statusCode}`,
      }] : []),
    ],
  };
}

/**
 * 检查所有预定义服务
 */
export async function checkAllServices(): Promise<ServiceHealth[]> {
  const results = await Promise.all(
    SERVICE_CONFIGS.map(config => checkServiceHealth(config))
  );
  return results;
}

/**
 * 检查指定服务
 */
export async function checkService(serviceName: string): Promise<ServiceHealth | null> {
  const config = SERVICE_CONFIGS.find(c => c.name.toLowerCase() === serviceName.toLowerCase());
  if (!config) {
    return null;
  }
  return checkServiceHealth(config);
}

/**
 * 添加自定义服务检查
 */
export function addServiceConfig(config: HealthCheckConfig): void {
  const existingIndex = SERVICE_CONFIGS.findIndex(c => c.name === config.name);
  if (existingIndex >= 0) {
    SERVICE_CONFIGS[existingIndex] = config;
  } else {
    SERVICE_CONFIGS.push(config);
  }
}

/**
 * 获取服务配置列表
 */
export function getServiceConfigs(): HealthCheckConfig[] {
  return [...SERVICE_CONFIGS];
}

/**
 * 批量健康检查（带并发控制）
 */
export async function batchHealthCheck(
  configs: HealthCheckConfig[],
  concurrency: number = 5
): Promise<ServiceHealth[]> {
  const results: ServiceHealth[] = [];
  
  for (let i = 0; i < configs.length; i += concurrency) {
    const batch = configs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(config => checkServiceHealth(config))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 持续健康检查（返回健康状态变化）
 */
export class HealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private lastStatus: Map<string, boolean> = new Map();
  private onStatusChange?: (service: string, healthy: boolean, previous: boolean) => void;

  constructor(
    private configs: HealthCheckConfig[] = SERVICE_CONFIGS,
    private intervalMs: number = 30000
  ) {}

  start(onStatusChange?: (service: string, healthy: boolean, previous: boolean) => void): void {
    this.onStatusChange = onStatusChange;
    this.check();
    this.intervalId = setInterval(() => this.check(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async check(): Promise<void> {
    const results = await batchHealthCheck(this.configs);
    
    for (const result of results) {
      const previous = this.lastStatus.get(result.name);
      const current = result.status === 'healthy';
      
      if (previous !== undefined && previous !== current && this.onStatusChange) {
        this.onStatusChange(result.name, current, previous);
      }
      
      this.lastStatus.set(result.name, current);
    }
  }

  getLastStatus(): Map<string, boolean> {
    return new Map(this.lastStatus);
  }
}
