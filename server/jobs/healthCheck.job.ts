/**
 * 服务健康检查模块
 * 自动检测系统中各服务的状态并更新拓扑
 */

import { updateTopoNodeStatus, updateTopoNodeMetrics, getTopoNodes, createTopoNode, getTopoNodeById } from '../services/topology.service';
import { redisClient } from '../lib/clients/redis.client';
import { kafkaClient } from '../lib/clients/kafka.client';

// 服务配置类型
interface ServiceConfig {
  nodeId: string;
  name: string;
  type: 'source' | 'plugin' | 'engine' | 'agent' | 'output' | 'database' | 'service';
  icon: string;
  description: string;
  checkUrl?: string;
  checkMethod?: 'GET' | 'POST';
  checkTimeout: number;
  expectedStatus?: number;
  parseResponse?: (data: any) => { online: boolean; metrics?: Record<string, number> };
  // 自定义检查函数（用于非 HTTP 服务）
  customCheck?: () => Promise<{ online: boolean; latency: number; metrics?: Record<string, number>; error?: string }>;
}

// 预定义的系统服务配置
const SYSTEM_SERVICES: ServiceConfig[] = [
  {
    nodeId: 'ollama',
    name: 'Ollama',
    type: 'service',
    icon: '🦙',
    description: '本地大模型服务',
    checkUrl: 'http://localhost:11434/api/tags',
    checkMethod: 'GET',
    checkTimeout: 5000,
    parseResponse: (data) => ({
      online: Array.isArray(data?.models),
      metrics: { modelCount: data?.models?.length || 0 }
    })
  },
  {
    nodeId: 'qdrant',
    name: 'Qdrant',
    type: 'database',
    icon: '🔴',
    description: '向量数据库',
    checkUrl: 'http://localhost:6333/collections',
    checkMethod: 'GET',
    checkTimeout: 5000,
    parseResponse: (data) => ({
      online: data?.result !== undefined,
      metrics: { collectionCount: data?.result?.collections?.length || 0 }
    })
  },
  {
    nodeId: 'redis',
    name: 'Redis',
    type: 'database',
    icon: '🔴',
    description: 'Redis 缓存服务',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const health = await redisClient.healthCheck();
        const latency = Date.now() - startTime;
        return {
          online: health.connected,
          latency: health.latencyMs > 0 ? health.latencyMs : latency,
          metrics: { latency: health.latencyMs > 0 ? health.latencyMs : latency },
          error: health.error
        };
      } catch (error: any) {
        return {
          online: false,
          latency: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    nodeId: 'kafka',
    name: 'Kafka',
    type: 'service',
    icon: '📨',
    description: 'Kafka 消息队列',
    checkTimeout: 5000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const isConnected = kafkaClient.getConnectionStatus();
        const latency = Date.now() - startTime;
        return {
          online: isConnected,
          latency,
          metrics: { 
            latency,
            connected: isConnected ? 1 : 0
          }
        };
      } catch (error: any) {
        return {
          online: false,
          latency: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    nodeId: 'api_server',
    name: 'API服务',
    type: 'service',
    icon: '🌐',
    description: 'PortAI NexusAPI服务',
    checkUrl: '/api/trpc/system.health',
    checkMethod: 'GET',
    checkTimeout: 3000,
    parseResponse: () => ({ online: true })
  },

  // ============ v1.9 性能优化服务 ============
  {
    nodeId: 'outbox_publisher',
    name: 'Outbox发布器',
    type: 'service',
    icon: '📤',
    description: 'CDC+轮询混合事件发布',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { outboxPublisher } = await import('./outbox');
        const metrics = outboxPublisher.getMetrics();
        return {
          online: metrics.isRunning,
          latency: Date.now() - startTime,
          metrics: {
            publishedCount: metrics.publishedCount,
            failedCount: metrics.failedCount,
            cdcHealthy: metrics.cdcHealthy ? 1 : 0,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
  {
    nodeId: 'saga_orchestrator',
    name: 'Saga编排器',
    type: 'service',
    icon: '🔄',
    description: '分布式事务补偿机制',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { sagaOrchestrator } = await import('./saga');
        const metrics = sagaOrchestrator.getMetrics();
        return {
          online: metrics.isRunning,
          latency: Date.now() - startTime,
          metrics: {
            totalExecuted: metrics.totalExecuted,
            completed: metrics.completed,
            failed: metrics.failed,
            compensated: metrics.compensated,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
  {
    nodeId: 'adaptive_sampling',
    name: '自适应采样',
    type: 'service',
    icon: '📉',
    description: '实时监控触发采样调整',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { adaptiveSamplingService } = await import('./monitoring');
        const metrics = adaptiveSamplingService.getMetrics();
        return {
          online: metrics.isRunning,
          latency: Date.now() - startTime,
          metrics: {
            adjustmentsMade: metrics.adjustmentsMade,
            totalChecks: metrics.totalChecks,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
  {
    nodeId: 'dedup_service',
    name: 'Redis去重',
    type: 'service',
    icon: '🔒',
    description: 'Redis辅助去重+异步刷盘',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { deduplicationService } = await import('./redis/deduplicationService');
        const metrics = deduplicationService.getMetrics();
        return {
          online: true,
          latency: Date.now() - startTime,
          metrics: {
            totalChecks: metrics.totalChecks,
            duplicatesFound: metrics.duplicatesFound,
            pendingFlush: metrics.pendingFlush,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
  {
    nodeId: 'read_replica',
    name: '读写分离',
    type: 'service',
    icon: '📊',
    description: '只读副本分离服务',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { readReplicaService } = await import('./db/readReplicaService');
        const stats = readReplicaService.getStats();
        return {
          online: stats.isRunning,
          latency: Date.now() - startTime,
          metrics: {
            totalReads: stats.totalReads,
            totalWrites: stats.totalWrites,
            replicaCount: stats.replicaCount,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
  {
    nodeId: 'graph_optimizer',
    name: '图查询优化',
    type: 'service',
    icon: '🗂️',
    description: 'Nebula索引+LOOKUP查询优化',
    checkTimeout: 3000,
    customCheck: async () => {
      const startTime = Date.now();
      try {
        const { graphQueryOptimizer } = await import('./knowledge/graphQueryOptimizer');
        const stats = graphQueryOptimizer.getStats();
        return {
          online: stats.isRunning,
          latency: Date.now() - startTime,
          metrics: {
            totalQueries: stats.totalQueries,
            cacheHits: stats.cacheHits,
            indexCount: stats.indexCount,
          },
        };
      } catch (error: any) {
        return { online: false, latency: Date.now() - startTime, error: error.message };
      }
    }
  },
];

// 检查单个服务状态
async function checkServiceHealth(config: ServiceConfig): Promise<{
  online: boolean;
  latency: number;
  metrics?: Record<string, number>;
  error?: string;
}> {
  // 如果有自定义检查函数，使用它
  if (config.customCheck) {
    try {
      return await config.customCheck();
    } catch (error: any) {
      return {
        online: false,
        latency: 0,
        error: error.message
      };
    }
  }

  // 否则使用 HTTP 检查
  if (!config.checkUrl) {
    return { online: false, latency: 0, error: 'No check URL or custom check defined' };
  }

  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.checkTimeout);
    
    const response = await fetch(config.checkUrl, {
      method: config.checkMethod || 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    
    if (config.expectedStatus && response.status !== config.expectedStatus) {
      return { online: false, latency, error: `Unexpected status: ${response.status}` };
    }
    
    if (!response.ok && !config.expectedStatus) {
      return { online: false, latency, error: `HTTP ${response.status}` };
    }
    
    let data = null;
    try {
      data = await response.json();
    } catch {
      // 某些服务可能不返回 JSON
    }
    
    if (config.parseResponse && data) {
      const result = config.parseResponse(data);
      return { 
        online: result.online, 
        latency,
        metrics: { ...result.metrics, latency }
      };
    }
    
    return { online: true, latency, metrics: { latency } };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return { 
      online: false, 
      latency,
      error: error.name === 'AbortError' ? 'Timeout' : error.message 
    };
  }
}

// 检查所有系统服务并更新拓扑状态
export async function checkAllServicesAndUpdateTopology(): Promise<{
  timestamp: Date;
  results: Array<{
    nodeId: string;
    name: string;
    online: boolean;
    latency: number;
    error?: string;
  }>;
}> {
  const results: Array<{
    nodeId: string;
    name: string;
    online: boolean;
    latency: number;
    error?: string;
  }> = [];
  
  for (const service of SYSTEM_SERVICES) {
    // 检查服务状态
    const health = await checkServiceHealth(service);
    
    // 确保节点存在
    const existingNode = await getTopoNodeById(service.nodeId);
    if (!existingNode) {
      // 自动创建节点
      await createTopoNode({
        nodeId: service.nodeId,
        name: service.name,
        type: service.type,
        icon: service.icon,
        description: service.description,
        status: health.online ? 'online' : 'offline',
        x: getDefaultX(service.type),
        y: getDefaultY(service.nodeId),
      });
    } else {
      // 更新节点状态
      await updateTopoNodeStatus(
        service.nodeId, 
        health.online ? 'online' : 'offline'
      );
      
      // 更新指标
      if (health.metrics) {
        await updateTopoNodeMetrics(service.nodeId, health.metrics);
      }
    }
    
    results.push({
      nodeId: service.nodeId,
      name: service.name,
      online: health.online,
      latency: health.latency,
      error: health.error,
    });
  }
  
  return {
    timestamp: new Date(),
    results
  };
}

// 获取节点默认 X 坐标
function getDefaultX(type: string): number {
  const typeX: Record<string, number> = {
    source: 50,
    plugin: 200,
    engine: 350,
    agent: 350,
    output: 500,
    database: 500,
    service: 500,
  };
  return typeX[type] || 300;
}

// 获取节点默认 Y 坐标
function getDefaultY(nodeId: string): number {
  const nodeY: Record<string, number> = {
    ollama: 180,
    qdrant: 80,
    redis: 130,
    kafka: 230,
    api_server: 280,
    outbox_publisher: 330,
    saga_orchestrator: 380,
    adaptive_sampling: 430,
    dedup_service: 480,
    read_replica: 530,
    graph_optimizer: 580,
  };
  return nodeY[nodeId] || 100;
}

// 获取系统服务状态摘要
export async function getSystemServicesSummary(): Promise<{
  total: number;
  online: number;
  offline: number;
  services: Array<{
    nodeId: string;
    name: string;
    status: 'online' | 'offline' | 'error' | 'maintenance';
    lastCheck: Date | null;
  }>;
}> {
  const nodes = await getTopoNodes();
  const serviceNodeIds = SYSTEM_SERVICES.map(s => s.nodeId);
  const serviceNodes = nodes.filter(n => serviceNodeIds.includes(n.nodeId));
  
  return {
    total: serviceNodes.length,
    online: serviceNodes.filter(n => n.status === 'online').length,
    offline: serviceNodes.filter(n => n.status !== 'online').length,
    services: serviceNodes.map(n => ({
      nodeId: n.nodeId,
      name: n.name,
      status: n.status,
      lastCheck: n.lastHeartbeat,
    }))
  };
}

// 添加自定义服务监控
export function addCustomService(config: ServiceConfig): void {
  // 检查是否已存在
  const existing = SYSTEM_SERVICES.find(s => s.nodeId === config.nodeId);
  if (!existing) {
    SYSTEM_SERVICES.push(config);
  }
}

// 移除服务监控
export function removeCustomService(nodeId: string): boolean {
  const index = SYSTEM_SERVICES.findIndex(s => s.nodeId === nodeId);
  if (index > -1) {
    SYSTEM_SERVICES.splice(index, 1);
    return true;
  }
  return false;
}

// 获取所有监控的服务配置
export function getMonitoredServices(): ServiceConfig[] {
  return [...SYSTEM_SERVICES];
}

// 启动定时健康检查
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startPeriodicHealthCheck(intervalMs: number = 30000): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  // 立即执行一次
  checkAllServicesAndUpdateTopology().catch(err => {
    console.error('[HealthCheck] Initial check failed:', err);
  });
  
  // 设置定时任务
  healthCheckInterval = setInterval(async () => {
    try {
      const result = await checkAllServicesAndUpdateTopology();
      console.log(`[HealthCheck] ${result.results.filter(r => r.online).length}/${result.results.length} services online`);
    } catch (err) {
      console.error('[HealthCheck] Periodic check failed:', err);
    }
  }, intervalMs);
  
  console.log(`[HealthCheck] Started periodic health check every ${intervalMs}ms`);
}

export function stopPeriodicHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[HealthCheck] Stopped periodic health check');
  }
}
