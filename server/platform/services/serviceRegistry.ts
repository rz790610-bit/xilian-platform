import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('service-registry');

/**
 * 服务注册与发现 - 平台基础设施层
 * 
 * 基于 Redis 实现轻量级服务注册/发现（适合中小规模部署）。
 * K8s 环境下可切换为 K8s Service Discovery（通过 DNS）。
 * 
 * 功能：
 * - 服务实例注册（带 TTL 心跳）
 * - 服务发现（支持负载均衡策略）
 * - 健康状态追踪
 * - 服务拓扑查询
 * 
 * 架构位置: server/platform/services/ (平台服务层)
 * 依赖: server/lib/clients/redis.client, server/core/logger
 */



// ============================================================
// 类型定义
// ============================================================

export interface ServiceInstance {
  /** 服务名称 */
  serviceName: string;
  /** 实例 ID（唯一） */
  instanceId: string;
  /** 主机地址 */
  host: string;
  /** 端口 */
  port: number;
  /** 协议 */
  protocol: 'http' | 'grpc' | 'ws';
  /** 健康状态 */
  status: 'healthy' | 'unhealthy' | 'draining';
  /** 元数据 */
  metadata: Record<string, string>;
  /** 注册时间 */
  registeredAt: Date;
  /** 最后心跳时间 */
  lastHeartbeat: Date;
  /** 权重（负载均衡用） */
  weight: number;
  /** 版本 */
  version: string;
}

export type LoadBalanceStrategy = 'round-robin' | 'random' | 'weighted' | 'least-connections';

// ============================================================
// 服务注册中心
// ============================================================

class ServiceRegistry {
  private localInstances = new Map<string, ServiceInstance>();
  private remoteCache = new Map<string, ServiceInstance[]>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private roundRobinCounters = new Map<string, number>();
  private connectionCounts = new Map<string, number>();
  private cacheRefreshTimer: NodeJS.Timeout | null = null;
  private isK8s = false;

  constructor() {
    this.isK8s = !!process.env.KUBERNETES_SERVICE_HOST;
  }

  /**
   * 初始化注册中心
   */
  async initialize(): Promise<void> {
    if (this.isK8s) {
      log.info('Running in Kubernetes - using DNS-based service discovery');
    } else {
      log.info('Running standalone - using Redis-based service discovery');
    }

    // 定期刷新远程服务缓存
    this.cacheRefreshTimer = setInterval(() => this.refreshCache(), 10000);
    this.cacheRefreshTimer.unref();

    log.info('Service registry initialized');
  }

  /**
   * 注册服务实例
   */
  async register(instance: Omit<ServiceInstance, 'registeredAt' | 'lastHeartbeat'>): Promise<void> {
    const fullInstance: ServiceInstance = {
      ...instance,
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
    };

    const key = `${instance.serviceName}:${instance.instanceId}`;
    this.localInstances.set(key, fullInstance);

    // 同步到 Redis
    await this.syncToRedis(fullInstance);

    // 启动心跳
    this.startHeartbeat(key, fullInstance);

    log.info(`Service registered: ${instance.serviceName}@${instance.host}:${instance.port} (id=${instance.instanceId})`);
  }

  /**
   * 注销服务实例
   */
  async deregister(serviceName: string, instanceId: string): Promise<void> {
    const key = `${serviceName}:${instanceId}`;

    // 停止心跳
    const timer = this.heartbeatTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(key);
    }

    this.localInstances.delete(key);

    // 从 Redis 删除
    await this.removeFromRedis(serviceName, instanceId);

    log.info(`Service deregistered: ${serviceName} (id=${instanceId})`);
  }

  /**
   * 发现服务实例
   */
  async discover(serviceName: string, strategy: LoadBalanceStrategy = 'round-robin'): Promise<ServiceInstance | null> {
    const instances = await this.getHealthyInstances(serviceName);

    if (instances.length === 0) {
      log.warn(`No healthy instances found for service: ${serviceName}`);
      return null;
    }

    return this.selectInstance(serviceName, instances, strategy);
  }

  /**
   * 获取服务的所有健康实例
   */
  async getHealthyInstances(serviceName: string): Promise<ServiceInstance[]> {
    // K8s 环境使用 DNS 发现
    if (this.isK8s) {
      return this.discoverViaK8sDns(serviceName);
    }

    // 优先使用缓存
    const cached = this.remoteCache.get(serviceName);
    if (cached && cached.length > 0) {
      return cached.filter(i => i.status === 'healthy');
    }

    // 从 Redis 加载
    return this.loadFromRedis(serviceName);
  }

  /**
   * 获取所有注册的服务拓扑
   */
  async getTopology(): Promise<Map<string, ServiceInstance[]>> {
    const topology = new Map<string, ServiceInstance[]>();

    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return topology;

      const keys = await client.keys('svc:*');
      for (const key of keys) {
        const raw = await client.get(key);
        if (!raw) continue;

        try {
          const instance = JSON.parse(raw) as ServiceInstance;
          const existing = topology.get(instance.serviceName) || [];
          existing.push(instance);
          topology.set(instance.serviceName, existing);
        } catch { /* skip invalid */ }
      }
    } catch (err) {
      log.warn('Failed to load topology from Redis:', (err as Error).message);
    }

    return topology;
  }

  /**
   * 标记连接开始（用于 least-connections 策略）
   */
  markConnectionStart(instanceId: string): void {
    const count = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, count + 1);
  }

  /**
   * 标记连接结束
   */
  markConnectionEnd(instanceId: string): void {
    const count = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, Math.max(0, count - 1));
  }

  /**
   * 关闭注册中心
   */
  async shutdown(): Promise<void> {
    // 停止所有心跳
    this.heartbeatTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.heartbeatTimers.clear();

    if (this.cacheRefreshTimer) {
      clearInterval(this.cacheRefreshTimer);
      this.cacheRefreshTimer = null;
    }

    // 注销所有本地实例
    const localEntries = Array.from(this.localInstances.values());
    for (const instance of localEntries) {
      await this.removeFromRedis(instance.serviceName, instance.instanceId);
    }
    this.localInstances.clear();

    log.info('Service registry shutdown');
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private selectInstance(
    serviceName: string,
    instances: ServiceInstance[],
    strategy: LoadBalanceStrategy,
  ): ServiceInstance {
    switch (strategy) {
      case 'round-robin': {
        const counter = (this.roundRobinCounters.get(serviceName) || 0) % instances.length;
        this.roundRobinCounters.set(serviceName, counter + 1);
        return instances[counter];
      }

      case 'random': {
        return instances[Math.floor(Math.random() * instances.length)];
      }

      case 'weighted': {
        const totalWeight = instances.reduce((sum, i) => sum + i.weight, 0);
        let random = Math.random() * totalWeight;
        for (const instance of instances) {
          random -= instance.weight;
          if (random <= 0) return instance;
        }
        return instances[0];
      }

      case 'least-connections': {
        let minConnections = Infinity;
        let selected = instances[0];
        for (const instance of instances) {
          const connections = this.connectionCounts.get(instance.instanceId) || 0;
          if (connections < minConnections) {
            minConnections = connections;
            selected = instance;
          }
        }
        return selected;
      }

      default:
        return instances[0];
    }
  }

  private async discoverViaK8sDns(serviceName: string): Promise<ServiceInstance[]> {
    // K8s 中，服务名直接作为 DNS 名称解析
    // 例如: sensor-ingestion.xilian.svc.cluster.local
    const namespace = process.env.POD_NAMESPACE || 'xilian';
    const host = `${serviceName}.${namespace}.svc.cluster.local`;

    return [{
      serviceName,
      instanceId: `k8s-${serviceName}`,
      host,
      port: 3000,
      protocol: 'http',
      status: 'healthy',
      metadata: { discovery: 'k8s-dns' },
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      weight: 1,
      version: process.env.APP_VERSION || '4.0.0',
    }];
  }

  private startHeartbeat(key: string, instance: ServiceInstance): void {
    const timer = setInterval(async () => {
      instance.lastHeartbeat = new Date();
      await this.syncToRedis(instance);
    }, 10000); // 每 10 秒心跳
    timer.unref();
    this.heartbeatTimers.set(key, timer);
  }

  private async syncToRedis(instance: ServiceInstance): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return;

      const key = `svc:${instance.serviceName}:${instance.instanceId}`;
      await client.set(key, JSON.stringify(instance), 'EX', 30); // 30 秒 TTL
    } catch (err) {
      log.debug(`Failed to sync service to Redis: ${(err as Error).message}`);
    }
  }

  private async removeFromRedis(serviceName: string, instanceId: string): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return;

      await client.del(`svc:${serviceName}:${instanceId}`);
    } catch (err) {
      log.debug(`Failed to remove service from Redis: ${(err as Error).message}`);
    }
  }

  private async loadFromRedis(serviceName: string): Promise<ServiceInstance[]> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return [];

      const keys = await client.keys(`svc:${serviceName}:*`);
      const instances: ServiceInstance[] = [];

      for (const key of keys) {
        const raw = await client.get(key);
        if (!raw) continue;
        try {
          const instance = JSON.parse(raw) as ServiceInstance;
          if (instance.status === 'healthy') {
            instances.push(instance);
          }
        } catch { /* skip */ }
      }

      // 更新缓存
      this.remoteCache.set(serviceName, instances);
      return instances;
    } catch (err) {
      log.warn(`Failed to load service from Redis: ${(err as Error).message}`);
      return [];
    }
  }

  private async refreshCache(): Promise<void> {
    const serviceNames = Array.from(this.remoteCache.keys());
    for (const serviceName of serviceNames) {
      await this.loadFromRedis(serviceName);
    }
  }
}

// ============================================================
// 单例导出
// ============================================================

export const serviceRegistry = new ServiceRegistry();
