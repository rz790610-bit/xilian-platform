/**
 * 西联智能平台 - 真实系统监控服务
 * XiLian Intelligent Platform - Real System Monitoring Service
 * 
 * 提供真实的数据库连接、系统资源、服务健康检查
 */

import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import * as os from 'os';

// ============================================================
// 类型定义
// ============================================================

export interface RealDatabaseStatus {
  name: string;
  type: string;
  status: 'online' | 'offline' | 'error';
  version?: string;
  connections?: {
    active: number;
    max: number;
  };
  uptime?: number;
  lastCheck: Date;
  error?: string;
}

export interface RealSystemResource {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    loadAvg: number[];
  };
  memory: {
    usedMB: number;
    totalMB: number;
    freeMB: number;
    usagePercent: number;
  };
  disk: {
    usedGB: number;
    totalGB: number;
    freeGB: number;
    usagePercent: number;
  };
  network: {
    hostname: string;
    interfaces: { name: string; address: string }[];
  };
  process: {
    pid: number;
    uptime: number;
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  timestamp: Date;
}

export interface ServiceHealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  endpoint: string;
  responseTimeMs: number;
  lastCheck: Date;
  details?: string;
}

// ============================================================
// 真实系统监控服务
// ============================================================

export class RealMonitoringService {
  private static instance: RealMonitoringService;

  private constructor() {
    console.log('[RealMonitoring] 真实系统监控服务已初始化');
  }

  static getInstance(): RealMonitoringService {
    if (!RealMonitoringService.instance) {
      RealMonitoringService.instance = new RealMonitoringService();
    }
    return RealMonitoringService.instance;
  }

  // ============================================================
  // 真实数据库状态检查
  // ============================================================

  async checkMySQLStatus(): Promise<RealDatabaseStatus> {
    const startTime = Date.now();
    try {
      const db = await getDb();
      if (!db) {
        return {
          name: 'MySQL',
          type: 'mysql',
          status: 'offline',
          lastCheck: new Date(),
          error: '数据库连接未配置'
        };
      }

      // 执行真实查询检查连接
      const versionResult = await db.execute(sql`SELECT VERSION() as version`);
      const statusResult = await db.execute(sql`SHOW STATUS LIKE 'Threads_connected'`);
      const maxConnResult = await db.execute(sql`SHOW VARIABLES LIKE 'max_connections'`);
      const uptimeResult = await db.execute(sql`SHOW STATUS LIKE 'Uptime'`);

      const version = (versionResult as any)[0]?.[0]?.version || 'unknown';
      const activeConnections = parseInt((statusResult as any)[0]?.[0]?.Value || '0');
      const maxConnections = parseInt((maxConnResult as any)[0]?.[0]?.Value || '100');
      const uptime = parseInt((uptimeResult as any)[0]?.[0]?.Value || '0');

      return {
        name: 'MySQL',
        type: 'mysql',
        status: 'online',
        version,
        connections: {
          active: activeConnections,
          max: maxConnections
        },
        uptime,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        name: 'MySQL',
        type: 'mysql',
        status: 'error',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : '连接失败'
      };
    }
  }

  async getAllDatabaseStatus(): Promise<RealDatabaseStatus[]> {
    const results: RealDatabaseStatus[] = [];
    
    // MySQL 状态
    results.push(await this.checkMySQLStatus());
    
    // 其他数据库状态（如果配置了的话）
    // Redis, ClickHouse 等可以在这里添加真实检查
    
    return results;
  }

  // ============================================================
  // 真实系统资源监控
  // ============================================================

  getSystemResources(): RealSystemResource {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // 计算 CPU 使用率
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });
    const cpuUsage = 100 - (totalIdle / totalTick * 100);

    // 获取网络接口
    const networkInterfaces = os.networkInterfaces();
    const interfaces: { name: string; address: string }[] = [];
    for (const [name, nets] of Object.entries(networkInterfaces)) {
      if (nets) {
        for (const net of nets) {
          if (net.family === 'IPv4' && !net.internal) {
            interfaces.push({ name, address: net.address });
          }
        }
      }
    }

    return {
      cpu: {
        usage: Math.round(cpuUsage * 100) / 100,
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAvg: os.loadavg()
      },
      memory: {
        usedMB: Math.round(usedMemory / 1024 / 1024),
        totalMB: Math.round(totalMemory / 1024 / 1024),
        freeMB: Math.round(freeMemory / 1024 / 1024),
        usagePercent: Math.round((usedMemory / totalMemory) * 100 * 100) / 100
      },
      disk: {
        // 磁盘信息需要额外的系统调用，这里提供基本信息
        usedGB: 0,
        totalGB: 0,
        freeGB: 0,
        usagePercent: 0
      },
      network: {
        hostname: os.hostname(),
        interfaces
      },
      process: {
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch()
      },
      timestamp: new Date()
    };
  }

  // ============================================================
  // 服务健康检查
  // ============================================================

  async checkServiceHealth(name: string, endpoint: string): Promise<ServiceHealthCheck> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      return {
        name,
        status: response.ok ? 'healthy' : 'unhealthy',
        endpoint,
        responseTimeMs: responseTime,
        lastCheck: new Date(),
        details: `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        endpoint,
        responseTimeMs: Date.now() - startTime,
        lastCheck: new Date(),
        details: error instanceof Error ? error.message : '连接失败'
      };
    }
  }

  async checkAllServices(): Promise<ServiceHealthCheck[]> {
    const services = [
      { name: 'API Server', endpoint: 'http://localhost:3000/api/trpc' },
    ];
    
    const results: ServiceHealthCheck[] = [];
    for (const service of services) {
      results.push(await this.checkServiceHealth(service.name, service.endpoint));
    }
    
    return results;
  }

  // ============================================================
  // 综合仪表盘数据
  // ============================================================

  async getDashboardData() {
    const [databases, system, services] = await Promise.all([
      this.getAllDatabaseStatus(),
      this.getSystemResources(),
      this.checkAllServices()
    ]);

    return {
      databases,
      system,
      services,
      summary: {
        totalDatabases: databases.length,
        onlineDatabases: databases.filter(d => d.status === 'online').length,
        healthyServices: services.filter(s => s.status === 'healthy').length,
        totalServices: services.length,
        cpuUsage: system.cpu.usage,
        memoryUsage: system.memory.usagePercent
      },
      lastUpdated: new Date()
    };
  }
}
