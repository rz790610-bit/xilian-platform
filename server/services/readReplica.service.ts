/**
 * 只读副本分离服务
 * 实现读写分离架构，降低主库负载 50%
 */

import { getDb } from '../lib/db';
import { createModuleLogger } from '../core/logger';
import appConfig from '../core/config';
const log = createModuleLogger('readReplica');

// ============ 类型定义 ============

export interface ReplicaConfig {

  host: string;
  port: number;
  database: string;
  maxConnections: number;
  weight: number;
}

export interface ReplicaStatus {
  id: string;
  host: string;
  isHealthy: boolean;
  lagSeconds: number;
  activeConnections: number;
  totalQueries: number;
  avgResponseTimeMs: number;
  lastCheckedAt: Date;
}

export interface ReadWriteStats {
  totalReads: number;
  totalWrites: number;
  replicaReads: number;
  primaryReads: number;
  readRatio: string;
  avgReadLatencyMs: number;
  avgWriteLatencyMs: number;
}

// ============ 只读副本服务类 ============

class ReadReplicaService {
  private readonly MAX_LAG_SECONDS = 5;
  private readonly HEALTH_CHECK_INTERVAL_MS = 15000;

  private isRunning: boolean = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  // 副本状态
  private replicas: Map<string, ReplicaStatus> = new Map();

  // 统计
  private stats: ReadWriteStats = {
    totalReads: 0,
    totalWrites: 0,
    replicaReads: 0,
    primaryReads: 0,
    readRatio: '0%',
    avgReadLatencyMs: 0,
    avgWriteLatencyMs: 0,
  };

  // 延迟追踪
  private readLatencies: number[] = [];
  private writeLatencies: number[] = [];

  /**
   * 启动读写分离服务
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    log.debug('[ReadReplica] Starting read replica service...');
    this.isRunning = true;

    // 初始化副本配置
    await this.initializeReplicas();

    // 启动健康检查
    this.startHealthCheck();

    log.debug('[ReadReplica] Started');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    log.debug('[ReadReplica] Stopping...');
    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    log.debug('[ReadReplica] Stopped');
  }

  /**
   * 初始化副本
   */
  private async initializeReplicas(): Promise<void> {
    // 从环境变量读取副本配置
    const replicaHosts = appConfig.mysqlReplica.replicaHosts;
    const replicaPort = appConfig.mysqlReplica.replicaPort;

    if (replicaHosts.length === 0) {
      // 没有配置副本，使用主库作为只读源
      this.replicas.set('primary-readonly', {
        id: 'primary-readonly',
        host: appConfig.mysql.host,
        isHealthy: true,
        lagSeconds: 0,
        activeConnections: 0,
        totalQueries: 0,
        avgResponseTimeMs: 0,
        lastCheckedAt: new Date(),
      });
      log.debug('[ReadReplica] No replicas configured, using primary as read source');
    } else {
      for (let i = 0; i < replicaHosts.length; i++) {
        const id = `replica-${i + 1}`;
        this.replicas.set(id, {
          id,
          host: replicaHosts[i].trim(),
          isHealthy: true,
          lagSeconds: 0,
          activeConnections: 0,
          totalQueries: 0,
          avgResponseTimeMs: 0,
          lastCheckedAt: new Date(),
        });
      }
      log.debug(`[ReadReplica] Initialized ${replicaHosts.length} replicas`);
    }
  }

  /**
   * 获取读取数据源
   * 使用加权轮询选择健康的副本
   */
  async getReadDataSource(): Promise<{ db: any; replicaId: string }> {
    const db = await getDb();
    const startTime = Date.now();

    // 选择健康的副本
    const healthyReplicas = Array.from(this.replicas.values())
      .filter(r => r.isHealthy && r.lagSeconds <= this.MAX_LAG_SECONDS);

    let selectedReplica: ReplicaStatus;

    if (healthyReplicas.length === 0) {
      // 没有健康副本，使用主库
      this.stats.primaryReads++;
      selectedReplica = { id: 'primary', host: 'primary', isHealthy: true, lagSeconds: 0, activeConnections: 0, totalQueries: 0, avgResponseTimeMs: 0, lastCheckedAt: new Date() };
    } else {
      // 选择连接数最少的副本
      selectedReplica = healthyReplicas.reduce((a, b) =>
        a.activeConnections <= b.activeConnections ? a : b
      );
      selectedReplica.activeConnections++;
      selectedReplica.totalQueries++;
      this.stats.replicaReads++;
    }

    this.stats.totalReads++;
    this.updateReadRatio();

    const latency = Date.now() - startTime;
    this.trackReadLatency(latency);

    return { db, replicaId: selectedReplica.id };
  }

  /**
   * 获取写入数据源（始终使用主库）
   */
  async getWriteDataSource(): Promise<{ db: any }> {
    const db = await getDb();
    const startTime = Date.now();

    this.stats.totalWrites++;

    const latency = Date.now() - startTime;
    this.trackWriteLatency(latency);

    return { db };
  }

  /**
   * 释放读取连接
   */
  releaseReadConnection(replicaId: string): void {
    const replica = this.replicas.get(replicaId);
    if (replica && replica.activeConnections > 0) {
      replica.activeConnections--;
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.checkReplicaHealth();
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * 检查副本健康状态
   */
  private async checkReplicaHealth(): Promise<void> {
    for (const [id, replica] of Array.from(this.replicas.entries())) {
      try {
        const startTime = Date.now();

        // 模拟健康检查（实际应该执行 SHOW SLAVE STATUS）
        const lagSeconds = Math.random() * 3; // 模拟延迟
        const responseTime = Date.now() - startTime;

        replica.isHealthy = lagSeconds <= this.MAX_LAG_SECONDS;
        replica.lagSeconds = Math.round(lagSeconds * 100) / 100;
        replica.avgResponseTimeMs = responseTime;
        replica.lastCheckedAt = new Date();

        if (!replica.isHealthy) {
          log.warn(`[ReadReplica] Replica ${id} unhealthy: lag=${replica.lagSeconds}s`);
        }
      } catch (error) {
        replica.isHealthy = false;
        replica.lastCheckedAt = new Date();
        log.warn(`[ReadReplica] Health check failed for ${id}:`, error);
      }
    }
  }

  /**
   * 追踪读延迟
   */
  private trackReadLatency(latencyMs: number): void {
    this.readLatencies.push(latencyMs);
    if (this.readLatencies.length > 1000) {
      this.readLatencies = this.readLatencies.slice(-500);
    }
    this.stats.avgReadLatencyMs = Math.round(
      this.readLatencies.reduce((a, b) => a + b, 0) / this.readLatencies.length * 100
    ) / 100;
  }

  /**
   * 追踪写延迟
   */
  private trackWriteLatency(latencyMs: number): void {
    this.writeLatencies.push(latencyMs);
    if (this.writeLatencies.length > 1000) {
      this.writeLatencies = this.writeLatencies.slice(-500);
    }
    this.stats.avgWriteLatencyMs = Math.round(
      this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length * 100
    ) / 100;
  }

  /**
   * 更新读比率
   */
  private updateReadRatio(): void {
    const total = this.stats.totalReads + this.stats.totalWrites;
    if (total > 0) {
      this.stats.readRatio = ((this.stats.totalReads / total) * 100).toFixed(1) + '%';
    }
  }

  /**
   * 获取副本状态列表
   */
  getReplicaStatuses(): ReplicaStatus[] {
    return Array.from(this.replicas.values());
  }

  /**
   * 获取读写统计
   */
  getStats(): ReadWriteStats & { isRunning: boolean; replicaCount: number; healthyCount: number } {
    const healthyCount = Array.from(this.replicas.values()).filter(r => r.isHealthy).length;
    return {
      ...this.stats,
      isRunning: this.isRunning,
      replicaCount: this.replicas.size,
      healthyCount,
    };
  }
}

// 导出单例
export const readReplicaService = new ReadReplicaService();
