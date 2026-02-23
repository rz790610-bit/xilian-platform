/**
 * 服务健康检查客户端
 * 检测各个服务的真实运行状态
 *
 * 配置来源：统一从 config.ts 读取，不直接引用 process.env
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { config } from '../../core/config';
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

// 预定义服务配置 — 使用 getter 确保读取时获取最新 config 值
function getServiceConfigs(): HealthCheckConfig[] {
  return [
    {
      name: 'Ollama',
      type: 'http',
      host: config.ollama.host,
      port: config.ollama.port,
      path: '/api/version',
      timeout: 5000,
      expectedStatus: 200,
    },
    {
      name: 'Qdrant',
      type: 'http',
      host: config.qdrant.host,
      port: config.qdrant.port,
      path: '/collections',
      timeout: 5000,
      expectedStatus: 200,
    },
    {
      name: 'Redis',
      type: 'tcp',
      host: config.redis.host,
      port: config.redis.port,
      timeout: 3000,
    },
    {
      name: 'MySQL',
      type: 'tcp',
      host: config.mysql.hostAlias,
      port: config.mysql.portAlias,
      timeout: 3000,
    },
    {
      name: 'ClickHouse',
      type: 'http',
      host: config.clickhouse.host,
      port: config.clickhouse.port,
      path: '/ping',
      timeout: 5000,
      expectedStatus: 200,
    },
    {
      name: 'Kafka',
      type: 'tcp',
      host: config.kafka.broker.split(':')[0] || 'localhost',
      port: parseInt(config.kafka.broker.split(':')[1] || '9092'),
      timeout: 3000,
    },
    {
      name: 'Zookeeper',
      type: 'tcp',
      host: config.zookeeper.host,
      port: config.zookeeper.port,
      timeout: 3000,
    },
  ];
}

// 可变的服务配置列表（支持运行时添加自定义检查）
const customServiceConfigs: HealthCheckConfig[] = [];

/**
 * HTTP 健康检查
 */
async function httpHealthCheck(checkConfig: HealthCheckConfig): Promise<{
  healthy: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const protocol = checkConfig.port === 443 ? https : http;
  
  return new Promise((resolve) => {
    const req = protocol.request(
      {
        hostname: checkConfig.host,
        port: checkConfig.port,
        path: checkConfig.path || '/',
        method: 'GET',
        timeout: checkConfig.timeout || 5000,
      },
      (res) => {
        const latencyMs = Date.now() - startTime;
        const healthy = checkConfig.expectedStatus 
          ? res.statusCode === checkConfig.expectedStatus
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
        latencyMs: checkConfig.timeout || 5000,
        error: 'Timeout',
      });
    });

    req.end();
  });
}

/**
 * TCP 健康检查
 */
async function tcpHealthCheck(checkConfig: HealthCheckConfig): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(checkConfig.timeout || 3000);
    
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
        latencyMs: checkConfig.timeout || 3000,
        error: 'Timeout',
      });
    });

    socket.connect(checkConfig.port, checkConfig.host);
  });
}

/**
 * 执行单个服务健康检查
 */
export async function checkServiceHealth(checkConfig: HealthCheckConfig): Promise<ServiceHealth> {
  let result: { healthy: boolean; latencyMs: number; statusCode?: number; error?: string };

  if (checkConfig.type === 'http') {
    result = await httpHealthCheck(checkConfig);
  } else if (checkConfig.type === 'tcp') {
    result = await tcpHealthCheck(checkConfig);
  } else if (checkConfig.type === 'custom' && checkConfig.customCheck) {
    const startTime = Date.now();
    try {
      const healthy = await checkConfig.customCheck();
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
    name: checkConfig.name,
    status: result.healthy ? 'healthy' : 'unhealthy',
    endpoint: `${checkConfig.host}:${checkConfig.port}${checkConfig.path || ''}`,
    lastCheck: new Date(),
    responseTimeMs: result.latencyMs,
    checks: [
      {
        name: checkConfig.type === 'http' ? 'HTTP Response' : 'TCP Connection',
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
  const allConfigs = [...getServiceConfigs(), ...customServiceConfigs];
  const results = await Promise.all(
    allConfigs.map(c => checkServiceHealth(c))
  );
  return results;
}

/**
 * 检查指定服务
 */
export async function checkService(serviceName: string): Promise<ServiceHealth | null> {
  const allConfigs = [...getServiceConfigs(), ...customServiceConfigs];
  const found = allConfigs.find(c => c.name.toLowerCase() === serviceName.toLowerCase());
  if (!found) {
    return null;
  }
  return checkServiceHealth(found);
}

/**
 * 添加自定义服务检查
 * P1-HC-1: 添加 URL 校验，防止注入恶意地址
 */
export function addServiceConfig(checkConfig: HealthCheckConfig): void {
  // 校验地址格式
  try {
    const protocol = checkConfig.port === 443 ? 'https' : 'http';
    const url = `${protocol}://${checkConfig.host}:${checkConfig.port}${checkConfig.path || '/'}`;
    const parsed = new URL(url);
    // 阻止内网地址注入（可根据实际需求调整）
    const hostname = parsed.hostname;
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      throw new Error('Cloud metadata endpoint is not allowed');
    }
  } catch (e) {
    throw new Error(`Invalid service config for ${checkConfig.name}: ${(e as Error).message}`);
  }

  const existingIndex = customServiceConfigs.findIndex(c => c.name === checkConfig.name);
  if (existingIndex >= 0) {
    customServiceConfigs[existingIndex] = checkConfig;
  } else {
    customServiceConfigs.push(checkConfig);
  }
}

/**
 * 获取服务配置列表（导出函数名保持不变，兼容已有调用）
 */
export { getServiceConfigs };

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
      batch.map(c => checkServiceHealth(c))
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
    private configs: HealthCheckConfig[] = getServiceConfigs(),
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
