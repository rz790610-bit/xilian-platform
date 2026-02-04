/**
 * 统一监控仪表盘服务
 * 提供集群概览、存储监控、数据流监控、API 网关、安全态势等仪表盘
 */

// ==================== 类型定义 ====================

export interface MetricValue {
  value: number;
  unit: string;
  timestamp: number;
  trend?: 'up' | 'down' | 'stable';
  changePercent?: number;
}

export interface TimeSeriesData {
  timestamps: number[];
  values: number[];
  label: string;
  color?: string;
}

export interface AlertSummary {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  uptime: number;
  lastCheck: number;
  metrics: Record<string, MetricValue>;
}

// ==================== 集群概览仪表盘 ====================

export interface ClusterOverviewData {
  summary: {
    totalNodes: number;
    healthyNodes: number;
    totalPods: number;
    runningPods: number;
    totalServices: number;
    healthyServices: number;
  };
  resources: {
    cpu: {
      used: number;
      total: number;
      percent: number;
    };
    memory: {
      used: number;
      total: number;
      percent: number;
    };
    storage: {
      used: number;
      total: number;
      percent: number;
    };
    gpu: {
      used: number;
      total: number;
      percent: number;
    };
  };
  namespaces: Array<{
    name: string;
    pods: number;
    cpu: number;
    memory: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  nodes: Array<{
    name: string;
    role: 'master' | 'worker' | 'edge';
    status: 'Ready' | 'NotReady' | 'Unknown';
    cpu: MetricValue;
    memory: MetricValue;
    pods: number;
    conditions: Array<{
      type: string;
      status: boolean;
    }>;
  }>;
  alerts: AlertSummary;
  events: Array<{
    type: 'Normal' | 'Warning';
    reason: string;
    message: string;
    timestamp: number;
    namespace: string;
    object: string;
  }>;
  trends: {
    cpuHistory: TimeSeriesData;
    memoryHistory: TimeSeriesData;
    podCountHistory: TimeSeriesData;
  };
}

// ==================== 存储监控仪表盘 ====================

export interface StorageOverviewData {
  databases: {
    clickhouse: {
      status: ServiceStatus;
      nodes: Array<{
        name: string;
        shard: number;
        replica: number;
        status: 'healthy' | 'degraded' | 'unhealthy';
        diskUsed: number;
        diskTotal: number;
        queries: number;
        insertRate: number;
      }>;
      tables: Array<{
        name: string;
        rows: number;
        size: number;
        partitions: number;
        compressionRatio: number;
      }>;
      metrics: {
        queriesPerSecond: MetricValue;
        insertRowsPerSecond: MetricValue;
        mergeRate: MetricValue;
        replicationLag: MetricValue;
      };
    };
    postgresql: {
      status: ServiceStatus;
      cluster: {
        leader: string;
        replicas: string[];
        timeline: number;
        lag: number;
      };
      connections: {
        active: number;
        idle: number;
        waiting: number;
        max: number;
      };
      metrics: {
        transactionsPerSecond: MetricValue;
        tuplesReturned: MetricValue;
        cacheHitRatio: MetricValue;
        deadlocks: MetricValue;
      };
      tables: Array<{
        name: string;
        rows: number;
        size: number;
        indexSize: number;
        bloat: number;
      }>;
    };
    neo4j: {
      status: ServiceStatus;
      cluster: {
        leader: string;
        followers: string[];
        readReplicas: string[];
      };
      metrics: {
        nodeCount: MetricValue;
        relationshipCount: MetricValue;
        queriesPerSecond: MetricValue;
        cacheHitRatio: MetricValue;
      };
      indexes: Array<{
        name: string;
        type: string;
        state: 'ONLINE' | 'POPULATING' | 'FAILED';
        populationPercent: number;
      }>;
    };
    qdrant: {
      status: ServiceStatus;
      collections: Array<{
        name: string;
        vectorCount: number;
        segmentCount: number;
        diskSize: number;
        indexStatus: 'indexed' | 'indexing' | 'pending';
      }>;
      metrics: {
        searchLatency: MetricValue;
        indexingRate: MetricValue;
        memoryUsage: MetricValue;
      };
    };
    redis: {
      status: ServiceStatus;
      cluster: {
        nodes: number;
        slots: number;
        replicating: number;
      };
      metrics: {
        opsPerSecond: MetricValue;
        hitRate: MetricValue;
        memoryUsed: MetricValue;
        connectedClients: MetricValue;
      };
      keyspaces: Array<{
        db: number;
        keys: number;
        expires: number;
        avgTtl: number;
      }>;
    };
    minio: {
      status: ServiceStatus;
      buckets: Array<{
        name: string;
        objects: number;
        size: number;
        tier: 'hot' | 'warm' | 'cold';
      }>;
      metrics: {
        totalObjects: MetricValue;
        totalSize: MetricValue;
        requestsPerSecond: MetricValue;
        bandwidth: MetricValue;
      };
    };
  };
  alerts: AlertSummary;
  trends: {
    diskUsageHistory: TimeSeriesData[];
    queryRateHistory: TimeSeriesData[];
  };
}

// ==================== 数据流监控仪表盘 ====================

export interface DataFlowOverviewData {
  kafka: {
    status: ServiceStatus;
    brokers: Array<{
      id: number;
      host: string;
      status: 'online' | 'offline';
      partitions: number;
      leaders: number;
      bytesIn: number;
      bytesOut: number;
    }>;
    topics: Array<{
      name: string;
      partitions: number;
      replicationFactor: number;
      messagesPerSecond: number;
      bytesPerSecond: number;
      consumerLag: number;
    }>;
    consumerGroups: Array<{
      name: string;
      state: 'Stable' | 'Rebalancing' | 'Dead';
      members: number;
      lag: number;
      topics: string[];
    }>;
    metrics: {
      messagesPerSecond: MetricValue;
      bytesInPerSecond: MetricValue;
      bytesOutPerSecond: MetricValue;
      totalLag: MetricValue;
    };
  };
  flink: {
    status: ServiceStatus;
    jobs: Array<{
      id: string;
      name: string;
      status: 'RUNNING' | 'FAILED' | 'CANCELED' | 'FINISHED';
      startTime: number;
      duration: number;
      parallelism: number;
      checkpoints: {
        completed: number;
        failed: number;
        lastDuration: number;
      };
      metrics: {
        recordsIn: number;
        recordsOut: number;
        bytesIn: number;
        bytesOut: number;
      };
    }>;
    taskManagers: Array<{
      id: string;
      host: string;
      status: 'RUNNING' | 'IDLE';
      slots: {
        total: number;
        available: number;
      };
      memory: {
        used: number;
        total: number;
      };
    }>;
    metrics: {
      runningJobs: MetricValue;
      completedCheckpoints: MetricValue;
      failedCheckpoints: MetricValue;
      uptime: MetricValue;
    };
  };
  airflow: {
    status: ServiceStatus;
    dags: Array<{
      dagId: string;
      isPaused: boolean;
      isActive: boolean;
      lastRun: {
        state: 'success' | 'failed' | 'running';
        startDate: number;
        endDate?: number;
        duration?: number;
      };
      nextRun?: number;
      schedule: string;
      successRate: number;
    }>;
    pools: Array<{
      name: string;
      slots: number;
      usedSlots: number;
      queuedSlots: number;
    }>;
    metrics: {
      activeDags: MetricValue;
      runningTasks: MetricValue;
      queuedTasks: MetricValue;
      successRate: MetricValue;
    };
  };
  connectors: {
    status: ServiceStatus;
    list: Array<{
      name: string;
      type: 'source' | 'sink';
      connector: string;
      status: 'RUNNING' | 'PAUSED' | 'FAILED';
      tasks: {
        total: number;
        running: number;
        failed: number;
      };
      metrics: {
        recordsProcessed: number;
        bytesProcessed: number;
        errorRate: number;
      };
    }>;
  };
  alerts: AlertSummary;
  trends: {
    throughputHistory: TimeSeriesData[];
    lagHistory: TimeSeriesData[];
  };
}

// ==================== API 网关仪表盘 ====================

export interface ApiGatewayOverviewData {
  kong: {
    status: ServiceStatus;
    routes: Array<{
      name: string;
      service: string;
      methods: string[];
      paths: string[];
      requestsPerSecond: number;
      latencyP50: number;
      latencyP99: number;
      errorRate: number;
    }>;
    services: Array<{
      name: string;
      host: string;
      port: number;
      protocol: string;
      status: 'healthy' | 'unhealthy';
      upstreams: number;
    }>;
    plugins: Array<{
      name: string;
      enabled: boolean;
      scope: 'global' | 'service' | 'route';
      config: Record<string, unknown>;
    }>;
    consumers: Array<{
      username: string;
      customId?: string;
      createdAt: number;
      plugins: string[];
    }>;
    metrics: {
      totalRequests: MetricValue;
      requestsPerSecond: MetricValue;
      latencyP50: MetricValue;
      latencyP99: MetricValue;
      errorRate: MetricValue;
      bandwidth: MetricValue;
    };
  };
  istio: {
    status: ServiceStatus;
    services: Array<{
      name: string;
      namespace: string;
      virtualServices: number;
      destinationRules: number;
      requestsPerSecond: number;
      successRate: number;
      latencyP50: number;
    }>;
    gateways: Array<{
      name: string;
      servers: Array<{
        port: number;
        protocol: string;
        hosts: string[];
      }>;
    }>;
    policies: {
      peerAuthentication: number;
      authorizationPolicies: number;
      requestAuthentication: number;
    };
    metrics: {
      meshRequestsPerSecond: MetricValue;
      meshSuccessRate: MetricValue;
      meshLatencyP50: MetricValue;
      mtlsEnabled: MetricValue;
    };
  };
  rateLimit: {
    global: {
      limit: number;
      current: number;
      remaining: number;
    };
    byConsumer: Array<{
      consumer: string;
      limit: number;
      current: number;
      blocked: number;
    }>;
    byRoute: Array<{
      route: string;
      limit: number;
      current: number;
      blocked: number;
    }>;
  };
  alerts: AlertSummary;
  trends: {
    requestsHistory: TimeSeriesData[];
    latencyHistory: TimeSeriesData[];
    errorRateHistory: TimeSeriesData[];
  };
}

// ==================== 安全态势仪表盘 ====================

export interface SecurityPostureData {
  overview: {
    score: number; // 0-100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    trend: 'improving' | 'stable' | 'degrading';
    lastAssessment: number;
  };
  vulnerabilities: {
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    byCategory: Record<string, number>;
    recentScans: Array<{
      id: string;
      type: 'image' | 'code' | 'dependency' | 'secret';
      target: string;
      timestamp: number;
      findings: number;
      status: 'completed' | 'failed';
    }>;
    topVulnerabilities: Array<{
      id: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      affectedAssets: number;
      cve?: string;
      remediation?: string;
    }>;
  };
  compliance: {
    frameworks: Array<{
      name: string;
      score: number;
      controls: {
        total: number;
        passed: number;
        failed: number;
        notApplicable: number;
      };
      lastAudit: number;
    }>;
    policies: Array<{
      name: string;
      status: 'compliant' | 'non-compliant' | 'partial';
      violations: number;
      lastCheck: number;
    }>;
  };
  runtime: {
    falco: {
      status: ServiceStatus;
      events: {
        total: number;
        byPriority: Record<string, number>;
        byCategory: Record<string, number>;
      };
      recentAlerts: Array<{
        id: string;
        priority: string;
        rule: string;
        output: string;
        timestamp: number;
        container?: string;
        pod?: string;
      }>;
    };
    networkPolicies: {
      total: number;
      enforced: number;
      violations: number;
    };
    podSecurityPolicies: {
      total: number;
      violations: number;
      privilegedPods: number;
    };
  };
  secrets: {
    vault: {
      status: ServiceStatus;
      secrets: {
        total: number;
        byEngine: Record<string, number>;
      };
      leases: {
        active: number;
        expiringSoon: number;
      };
      certificates: {
        total: number;
        expiringSoon: number;
        expired: number;
      };
    };
    leaks: {
      detected: number;
      resolved: number;
      byType: Record<string, number>;
    };
  };
  access: {
    authentication: {
      totalLogins: number;
      failedLogins: number;
      mfaEnabled: number;
      mfaTotal: number;
    };
    authorization: {
      totalRequests: number;
      deniedRequests: number;
      byRole: Record<string, number>;
    };
    sessions: {
      active: number;
      expired: number;
      suspicious: number;
    };
  };
  alerts: AlertSummary;
  trends: {
    securityScoreHistory: TimeSeriesData;
    vulnerabilityHistory: TimeSeriesData;
    incidentHistory: TimeSeriesData;
  };
}

// ==================== 仪表盘服务 ====================

export class DashboardService {
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds

  constructor() {
    console.log('[Dashboard] 仪表盘服务已初始化');
  }

  // ==================== 集群概览 ====================

  async getClusterOverview(): Promise<ClusterOverviewData> {
    const cached = this.getFromCache<ClusterOverviewData>('cluster-overview');
    if (cached) return cached;

    // 模拟数据获取
    const data: ClusterOverviewData = {
      summary: {
        totalNodes: 12,
        healthyNodes: 11,
        totalPods: 156,
        runningPods: 148,
        totalServices: 45,
        healthyServices: 43,
      },
      resources: {
        cpu: { used: 68.5, total: 96, percent: 71.4 },
        memory: { used: 245.8, total: 384, percent: 64.0 },
        storage: { used: 2.8, total: 10, percent: 28.0 },
        gpu: { used: 6, total: 8, percent: 75.0 },
      },
      namespaces: [
        { name: 'xilian-prod', pods: 45, cpu: 25.5, memory: 85.2, status: 'healthy' },
        { name: 'xilian-data', pods: 32, cpu: 18.3, memory: 62.1, status: 'healthy' },
        { name: 'monitoring', pods: 18, cpu: 8.2, memory: 24.5, status: 'healthy' },
        { name: 'security', pods: 12, cpu: 5.1, memory: 18.3, status: 'warning' },
        { name: 'istio-system', pods: 15, cpu: 6.8, memory: 22.1, status: 'healthy' },
      ],
      nodes: [
        {
          name: 'master-1',
          role: 'master',
          status: 'Ready',
          cpu: { value: 45.2, unit: '%', timestamp: Date.now(), trend: 'stable' },
          memory: { value: 62.1, unit: '%', timestamp: Date.now(), trend: 'up', changePercent: 2.3 },
          pods: 28,
          conditions: [
            { type: 'Ready', status: true },
            { type: 'MemoryPressure', status: false },
            { type: 'DiskPressure', status: false },
          ],
        },
        {
          name: 'worker-1',
          role: 'worker',
          status: 'Ready',
          cpu: { value: 78.5, unit: '%', timestamp: Date.now(), trend: 'up', changePercent: 5.2 },
          memory: { value: 71.3, unit: '%', timestamp: Date.now(), trend: 'stable' },
          pods: 35,
          conditions: [
            { type: 'Ready', status: true },
            { type: 'MemoryPressure', status: false },
            { type: 'DiskPressure', status: false },
          ],
        },
        {
          name: 'worker-2',
          role: 'worker',
          status: 'Ready',
          cpu: { value: 65.8, unit: '%', timestamp: Date.now(), trend: 'down', changePercent: -3.1 },
          memory: { value: 58.9, unit: '%', timestamp: Date.now(), trend: 'stable' },
          pods: 32,
          conditions: [
            { type: 'Ready', status: true },
            { type: 'MemoryPressure', status: false },
            { type: 'DiskPressure', status: false },
          ],
        },
        {
          name: 'gpu-1',
          role: 'worker',
          status: 'Ready',
          cpu: { value: 82.1, unit: '%', timestamp: Date.now(), trend: 'up', changePercent: 8.5 },
          memory: { value: 85.2, unit: '%', timestamp: Date.now(), trend: 'up', changePercent: 4.2 },
          pods: 12,
          conditions: [
            { type: 'Ready', status: true },
            { type: 'MemoryPressure', status: true },
            { type: 'DiskPressure', status: false },
          ],
        },
        {
          name: 'edge-1',
          role: 'edge',
          status: 'NotReady',
          cpu: { value: 0, unit: '%', timestamp: Date.now(), trend: 'stable' },
          memory: { value: 0, unit: '%', timestamp: Date.now(), trend: 'stable' },
          pods: 0,
          conditions: [
            { type: 'Ready', status: false },
            { type: 'NetworkUnavailable', status: true },
          ],
        },
      ],
      alerts: {
        critical: 1,
        warning: 3,
        info: 8,
        total: 12,
      },
      events: [
        {
          type: 'Warning',
          reason: 'NodeNotReady',
          message: 'Node edge-1 is not ready',
          timestamp: Date.now() - 300000,
          namespace: 'default',
          object: 'node/edge-1',
        },
        {
          type: 'Warning',
          reason: 'HighMemoryUsage',
          message: 'Memory usage above 80% on gpu-1',
          timestamp: Date.now() - 600000,
          namespace: 'default',
          object: 'node/gpu-1',
        },
        {
          type: 'Normal',
          reason: 'Scheduled',
          message: 'Successfully assigned pod to worker-1',
          timestamp: Date.now() - 900000,
          namespace: 'xilian-prod',
          object: 'pod/api-gateway-abc123',
        },
      ],
      trends: {
        cpuHistory: this.generateTimeSeriesData('CPU Usage', 24, 60, 80),
        memoryHistory: this.generateTimeSeriesData('Memory Usage', 24, 55, 75),
        podCountHistory: this.generateTimeSeriesData('Pod Count', 24, 140, 160),
      },
    };

    this.setCache('cluster-overview', data);
    return data;
  }

  // ==================== 存储监控 ====================

  async getStorageOverview(): Promise<StorageOverviewData> {
    const cached = this.getFromCache<StorageOverviewData>('storage-overview');
    if (cached) return cached;

    const data: StorageOverviewData = {
      databases: {
        clickhouse: {
          status: this.createServiceStatus('ClickHouse', 'healthy'),
          nodes: [
            { name: 'ch-1', shard: 1, replica: 1, status: 'healthy', diskUsed: 850, diskTotal: 2000, queries: 1250, insertRate: 45000 },
            { name: 'ch-2', shard: 1, replica: 2, status: 'healthy', diskUsed: 845, diskTotal: 2000, queries: 1180, insertRate: 44500 },
            { name: 'ch-3', shard: 2, replica: 1, status: 'healthy', diskUsed: 920, diskTotal: 2000, queries: 1320, insertRate: 46000 },
          ],
          tables: [
            { name: 'sensor_readings_raw', rows: 15000000000, size: 450, partitions: 128, compressionRatio: 8.5 },
            { name: 'sensor_readings_1m', rows: 250000000, size: 85, partitions: 64, compressionRatio: 6.2 },
            { name: 'sensor_readings_1h', rows: 4200000, size: 12, partitions: 32, compressionRatio: 5.8 },
            { name: 'fault_events', rows: 125000, size: 2.5, partitions: 8, compressionRatio: 4.2 },
          ],
          metrics: {
            queriesPerSecond: { value: 3750, unit: 'qps', timestamp: Date.now(), trend: 'up', changePercent: 5.2 },
            insertRowsPerSecond: { value: 135500, unit: 'rows/s', timestamp: Date.now(), trend: 'stable' },
            mergeRate: { value: 12.5, unit: 'MB/s', timestamp: Date.now(), trend: 'stable' },
            replicationLag: { value: 0.8, unit: 's', timestamp: Date.now(), trend: 'down', changePercent: -15.2 },
          },
        },
        postgresql: {
          status: this.createServiceStatus('PostgreSQL', 'healthy'),
          cluster: {
            leader: 'pg-1',
            replicas: ['pg-2', 'pg-3'],
            timeline: 15,
            lag: 0.2,
          },
          connections: {
            active: 85,
            idle: 42,
            waiting: 3,
            max: 200,
          },
          metrics: {
            transactionsPerSecond: { value: 2850, unit: 'tps', timestamp: Date.now(), trend: 'up', changePercent: 3.5 },
            tuplesReturned: { value: 125000, unit: 'rows/s', timestamp: Date.now(), trend: 'stable' },
            cacheHitRatio: { value: 99.2, unit: '%', timestamp: Date.now(), trend: 'stable' },
            deadlocks: { value: 0, unit: 'count', timestamp: Date.now(), trend: 'stable' },
          },
          tables: [
            { name: 'devices', rows: 15000, size: 125, indexSize: 45, bloat: 2.1 },
            { name: 'users', rows: 850, size: 8, indexSize: 3, bloat: 1.5 },
            { name: 'conversations', rows: 125000, size: 450, indexSize: 85, bloat: 3.2 },
            { name: 'maintenance_logs', rows: 2500000, size: 1200, indexSize: 350, bloat: 4.5 },
          ],
        },
        neo4j: {
          status: this.createServiceStatus('Neo4j', 'healthy'),
          cluster: {
            leader: 'neo4j-1',
            followers: ['neo4j-2'],
            readReplicas: ['neo4j-3'],
          },
          metrics: {
            nodeCount: { value: 2500000, unit: 'nodes', timestamp: Date.now(), trend: 'up', changePercent: 1.2 },
            relationshipCount: { value: 8500000, unit: 'rels', timestamp: Date.now(), trend: 'up', changePercent: 1.5 },
            queriesPerSecond: { value: 850, unit: 'qps', timestamp: Date.now(), trend: 'stable' },
            cacheHitRatio: { value: 97.5, unit: '%', timestamp: Date.now(), trend: 'stable' },
          },
          indexes: [
            { name: 'equipment_id', type: 'BTREE', state: 'ONLINE', populationPercent: 100 },
            { name: 'fault_vector', type: 'VECTOR', state: 'ONLINE', populationPercent: 100 },
            { name: 'component_name', type: 'FULLTEXT', state: 'ONLINE', populationPercent: 100 },
          ],
        },
        qdrant: {
          status: this.createServiceStatus('Qdrant', 'healthy'),
          collections: [
            { name: 'diagnostic_docs', vectorCount: 98500, segmentCount: 12, diskSize: 2.5, indexStatus: 'indexed' },
            { name: 'fault_patterns', vectorCount: 4850, segmentCount: 4, diskSize: 0.15, indexStatus: 'indexed' },
            { name: 'manuals', vectorCount: 185000, segmentCount: 18, diskSize: 4.8, indexStatus: 'indexed' },
          ],
          metrics: {
            searchLatency: { value: 12.5, unit: 'ms', timestamp: Date.now(), trend: 'stable' },
            indexingRate: { value: 1250, unit: 'vec/s', timestamp: Date.now(), trend: 'stable' },
            memoryUsage: { value: 8.5, unit: 'GB', timestamp: Date.now(), trend: 'stable' },
          },
        },
        redis: {
          status: this.createServiceStatus('Redis', 'healthy'),
          cluster: {
            nodes: 6,
            slots: 16384,
            replicating: 3,
          },
          metrics: {
            opsPerSecond: { value: 125000, unit: 'ops/s', timestamp: Date.now(), trend: 'up', changePercent: 8.5 },
            hitRate: { value: 98.5, unit: '%', timestamp: Date.now(), trend: 'stable' },
            memoryUsed: { value: 12.5, unit: 'GB', timestamp: Date.now(), trend: 'up', changePercent: 2.1 },
            connectedClients: { value: 285, unit: 'clients', timestamp: Date.now(), trend: 'stable' },
          },
          keyspaces: [
            { db: 0, keys: 1250000, expires: 850000, avgTtl: 300 },
            { db: 1, keys: 85000, expires: 85000, avgTtl: 86400 },
          ],
        },
        minio: {
          status: this.createServiceStatus('MinIO', 'healthy'),
          buckets: [
            { name: 'raw-documents', objects: 125000, size: 850, tier: 'hot' },
            { name: 'processed', objects: 85000, size: 450, tier: 'hot' },
            { name: 'model-artifacts', objects: 250, size: 125, tier: 'warm' },
            { name: 'backups', objects: 1500, size: 2500, tier: 'cold' },
          ],
          metrics: {
            totalObjects: { value: 211750, unit: 'objects', timestamp: Date.now(), trend: 'up', changePercent: 1.5 },
            totalSize: { value: 3925, unit: 'GB', timestamp: Date.now(), trend: 'up', changePercent: 2.1 },
            requestsPerSecond: { value: 850, unit: 'req/s', timestamp: Date.now(), trend: 'stable' },
            bandwidth: { value: 125, unit: 'MB/s', timestamp: Date.now(), trend: 'stable' },
          },
        },
      },
      alerts: {
        critical: 0,
        warning: 2,
        info: 5,
        total: 7,
      },
      trends: {
        diskUsageHistory: [
          this.generateTimeSeriesData('ClickHouse', 24, 40, 45),
          this.generateTimeSeriesData('PostgreSQL', 24, 35, 40),
          this.generateTimeSeriesData('Neo4j', 24, 25, 30),
        ],
        queryRateHistory: [
          this.generateTimeSeriesData('ClickHouse QPS', 24, 3500, 4000),
          this.generateTimeSeriesData('PostgreSQL TPS', 24, 2500, 3000),
        ],
      },
    };

    this.setCache('storage-overview', data);
    return data;
  }

  // ==================== 数据流监控 ====================

  async getDataFlowOverview(): Promise<DataFlowOverviewData> {
    const cached = this.getFromCache<DataFlowOverviewData>('dataflow-overview');
    if (cached) return cached;

    const data: DataFlowOverviewData = {
      kafka: {
        status: this.createServiceStatus('Kafka', 'healthy'),
        brokers: [
          { id: 1, host: 'kafka-1', status: 'online', partitions: 128, leaders: 45, bytesIn: 125000000, bytesOut: 85000000 },
          { id: 2, host: 'kafka-2', status: 'online', partitions: 128, leaders: 42, bytesIn: 118000000, bytesOut: 82000000 },
          { id: 3, host: 'kafka-3', status: 'online', partitions: 128, leaders: 41, bytesIn: 122000000, bytesOut: 84000000 },
        ],
        topics: [
          { name: 'sensor-data', partitions: 128, replicationFactor: 2, messagesPerSecond: 85000, bytesPerSecond: 125000000, consumerLag: 150 },
          { name: 'ais-vessel', partitions: 16, replicationFactor: 2, messagesPerSecond: 2500, bytesPerSecond: 8500000, consumerLag: 25 },
          { name: 'tos-job', partitions: 32, replicationFactor: 2, messagesPerSecond: 1200, bytesPerSecond: 4500000, consumerLag: 10 },
          { name: 'fault-events', partitions: 8, replicationFactor: 3, messagesPerSecond: 150, bytesPerSecond: 850000, consumerLag: 0 },
        ],
        consumerGroups: [
          { name: 'flink-anomaly-detector', state: 'Stable', members: 8, lag: 150, topics: ['sensor-data'] },
          { name: 'flink-kg-builder', state: 'Stable', members: 4, lag: 25, topics: ['ais-vessel', 'tos-job'] },
          { name: 'clickhouse-sink', state: 'Stable', members: 16, lag: 0, topics: ['sensor-data'] },
        ],
        metrics: {
          messagesPerSecond: { value: 88850, unit: 'msg/s', timestamp: Date.now(), trend: 'up', changePercent: 5.2 },
          bytesInPerSecond: { value: 365, unit: 'MB/s', timestamp: Date.now(), trend: 'stable' },
          bytesOutPerSecond: { value: 251, unit: 'MB/s', timestamp: Date.now(), trend: 'stable' },
          totalLag: { value: 185, unit: 'msgs', timestamp: Date.now(), trend: 'down', changePercent: -12.5 },
        },
      },
      flink: {
        status: this.createServiceStatus('Flink', 'healthy'),
        jobs: [
          {
            id: 'job-1',
            name: 'anomaly-detector',
            status: 'RUNNING',
            startTime: Date.now() - 86400000 * 7,
            duration: 86400000 * 7,
            parallelism: 8,
            checkpoints: { completed: 10080, failed: 2, lastDuration: 1250 },
            metrics: { recordsIn: 85000, recordsOut: 150, bytesIn: 125000000, bytesOut: 250000 },
          },
          {
            id: 'job-2',
            name: 'kg-builder',
            status: 'RUNNING',
            startTime: Date.now() - 86400000 * 7,
            duration: 86400000 * 7,
            parallelism: 4,
            checkpoints: { completed: 10080, failed: 0, lastDuration: 850 },
            metrics: { recordsIn: 3700, recordsOut: 1200, bytesIn: 13000000, bytesOut: 4500000 },
          },
          {
            id: 'job-3',
            name: 'metrics-aggregator',
            status: 'RUNNING',
            startTime: Date.now() - 86400000 * 7,
            duration: 86400000 * 7,
            parallelism: 4,
            checkpoints: { completed: 10080, failed: 1, lastDuration: 650 },
            metrics: { recordsIn: 85000, recordsOut: 1420, bytesIn: 125000000, bytesOut: 2500000 },
          },
        ],
        taskManagers: [
          { id: 'tm-1', host: 'flink-tm-1', status: 'RUNNING', slots: { total: 4, available: 0 }, memory: { used: 12.5, total: 16 } },
          { id: 'tm-2', host: 'flink-tm-2', status: 'RUNNING', slots: { total: 4, available: 0 }, memory: { used: 11.8, total: 16 } },
          { id: 'tm-3', host: 'flink-tm-3', status: 'RUNNING', slots: { total: 4, available: 0 }, memory: { used: 12.1, total: 16 } },
          { id: 'tm-4', host: 'flink-tm-4', status: 'RUNNING', slots: { total: 4, available: 0 }, memory: { used: 11.5, total: 16 } },
        ],
        metrics: {
          runningJobs: { value: 3, unit: 'jobs', timestamp: Date.now(), trend: 'stable' },
          completedCheckpoints: { value: 30240, unit: 'checkpoints', timestamp: Date.now(), trend: 'up', changePercent: 0.1 },
          failedCheckpoints: { value: 3, unit: 'checkpoints', timestamp: Date.now(), trend: 'stable' },
          uptime: { value: 99.98, unit: '%', timestamp: Date.now(), trend: 'stable' },
        },
      },
      airflow: {
        status: this.createServiceStatus('Airflow', 'healthy'),
        dags: [
          {
            dagId: 'daily_kg_optimization',
            isPaused: false,
            isActive: true,
            lastRun: { state: 'success', startDate: Date.now() - 3600000, endDate: Date.now() - 1800000, duration: 1800000 },
            nextRun: Date.now() + 82800000,
            schedule: '0 2 * * *',
            successRate: 98.5,
          },
          {
            dagId: 'weekly_vector_rebuild',
            isPaused: false,
            isActive: true,
            lastRun: { state: 'success', startDate: Date.now() - 86400000 * 3, endDate: Date.now() - 86400000 * 3 + 14400000, duration: 14400000 },
            nextRun: Date.now() + 86400000 * 4,
            schedule: '0 0 * * 0',
            successRate: 100,
          },
          {
            dagId: 'model_retraining',
            isPaused: false,
            isActive: true,
            lastRun: { state: 'running', startDate: Date.now() - 3600000 },
            schedule: '0 4 * * 1',
            successRate: 95.2,
          },
          {
            dagId: 'backup',
            isPaused: false,
            isActive: true,
            lastRun: { state: 'success', startDate: Date.now() - 7200000, endDate: Date.now() - 5400000, duration: 1800000 },
            nextRun: Date.now() + 79200000,
            schedule: '0 3 * * *',
            successRate: 99.8,
          },
        ],
        pools: [
          { name: 'default_pool', slots: 128, usedSlots: 45, queuedSlots: 0 },
          { name: 'gpu_pool', slots: 8, usedSlots: 4, queuedSlots: 2 },
        ],
        metrics: {
          activeDags: { value: 4, unit: 'dags', timestamp: Date.now(), trend: 'stable' },
          runningTasks: { value: 12, unit: 'tasks', timestamp: Date.now(), trend: 'up', changePercent: 50 },
          queuedTasks: { value: 2, unit: 'tasks', timestamp: Date.now(), trend: 'stable' },
          successRate: { value: 98.4, unit: '%', timestamp: Date.now(), trend: 'stable' },
        },
      },
      connectors: {
        status: this.createServiceStatus('Kafka Connect', 'healthy'),
        list: [
          {
            name: 'debezium-postgresql',
            type: 'source',
            connector: 'io.debezium.connector.postgresql.PostgresConnector',
            status: 'RUNNING',
            tasks: { total: 1, running: 1, failed: 0 },
            metrics: { recordsProcessed: 2500000, bytesProcessed: 850000000, errorRate: 0 },
          },
          {
            name: 'neo4j-sink',
            type: 'sink',
            connector: 'streams.kafka.connect.sink.Neo4jSinkConnector',
            status: 'RUNNING',
            tasks: { total: 4, running: 4, failed: 0 },
            metrics: { recordsProcessed: 1200000, bytesProcessed: 450000000, errorRate: 0.01 },
          },
          {
            name: 'clickhouse-sink',
            type: 'sink',
            connector: 'com.clickhouse.kafka.connect.ClickHouseSinkConnector',
            status: 'RUNNING',
            tasks: { total: 16, running: 16, failed: 0 },
            metrics: { recordsProcessed: 15000000000, bytesProcessed: 4500000000000, errorRate: 0 },
          },
        ],
      },
      alerts: {
        critical: 0,
        warning: 1,
        info: 3,
        total: 4,
      },
      trends: {
        throughputHistory: [
          this.generateTimeSeriesData('Kafka Messages/s', 24, 80000, 95000),
          this.generateTimeSeriesData('Flink Records/s', 24, 85000, 90000),
        ],
        lagHistory: [
          this.generateTimeSeriesData('Consumer Lag', 24, 100, 300),
        ],
      },
    };

    this.setCache('dataflow-overview', data);
    return data;
  }

  // ==================== API 网关 ====================

  async getApiGatewayOverview(): Promise<ApiGatewayOverviewData> {
    const cached = this.getFromCache<ApiGatewayOverviewData>('apigateway-overview');
    if (cached) return cached;

    const data: ApiGatewayOverviewData = {
      kong: {
        status: this.createServiceStatus('Kong', 'healthy'),
        routes: [
          { name: 'api-v1', service: 'api-service', methods: ['GET', 'POST', 'PUT', 'DELETE'], paths: ['/api/v1/*'], requestsPerSecond: 2500, latencyP50: 25, latencyP99: 150, errorRate: 0.1 },
          { name: 'graphql', service: 'graphql-gateway', methods: ['POST'], paths: ['/graphql'], requestsPerSecond: 850, latencyP50: 45, latencyP99: 250, errorRate: 0.05 },
          { name: 'websocket', service: 'realtime-service', methods: ['GET'], paths: ['/ws/*'], requestsPerSecond: 150, latencyP50: 5, latencyP99: 25, errorRate: 0 },
          { name: 'static', service: 'cdn-service', methods: ['GET'], paths: ['/static/*'], requestsPerSecond: 5000, latencyP50: 5, latencyP99: 15, errorRate: 0 },
        ],
        services: [
          { name: 'api-service', host: 'api.xilian.svc', port: 8080, protocol: 'http', status: 'healthy', upstreams: 4 },
          { name: 'graphql-gateway', host: 'graphql.xilian.svc', port: 4000, protocol: 'http', status: 'healthy', upstreams: 2 },
          { name: 'realtime-service', host: 'realtime.xilian.svc', port: 8081, protocol: 'http', status: 'healthy', upstreams: 2 },
          { name: 'cdn-service', host: 'cdn.xilian.io', port: 443, protocol: 'https', status: 'healthy', upstreams: 1 },
        ],
        plugins: [
          { name: 'jwt', enabled: true, scope: 'global', config: { algorithm: 'RS256' } },
          { name: 'rate-limiting', enabled: true, scope: 'global', config: { minute: 1000 } },
          { name: 'cors', enabled: true, scope: 'global', config: { origins: ['*'] } },
          { name: 'prometheus', enabled: true, scope: 'global', config: {} },
        ],
        consumers: [
          { username: 'mobile-app', customId: 'app-001', createdAt: Date.now() - 86400000 * 365, plugins: ['jwt', 'rate-limiting'] },
          { username: 'web-portal', customId: 'web-001', createdAt: Date.now() - 86400000 * 365, plugins: ['jwt', 'rate-limiting'] },
          { username: 'partner-api', customId: 'partner-001', createdAt: Date.now() - 86400000 * 180, plugins: ['jwt', 'rate-limiting', 'acl'] },
        ],
        metrics: {
          totalRequests: { value: 125000000, unit: 'requests', timestamp: Date.now(), trend: 'up', changePercent: 5.2 },
          requestsPerSecond: { value: 8500, unit: 'req/s', timestamp: Date.now(), trend: 'up', changePercent: 3.5 },
          latencyP50: { value: 22, unit: 'ms', timestamp: Date.now(), trend: 'stable' },
          latencyP99: { value: 125, unit: 'ms', timestamp: Date.now(), trend: 'down', changePercent: -5.2 },
          errorRate: { value: 0.08, unit: '%', timestamp: Date.now(), trend: 'stable' },
          bandwidth: { value: 850, unit: 'MB/s', timestamp: Date.now(), trend: 'up', changePercent: 2.1 },
        },
      },
      istio: {
        status: this.createServiceStatus('Istio', 'healthy'),
        services: [
          { name: 'api-service', namespace: 'xilian-prod', virtualServices: 2, destinationRules: 1, requestsPerSecond: 2500, successRate: 99.9, latencyP50: 25 },
          { name: 'device-service', namespace: 'xilian-prod', virtualServices: 1, destinationRules: 1, requestsPerSecond: 1200, successRate: 99.95, latencyP50: 18 },
          { name: 'ai-service', namespace: 'xilian-prod', virtualServices: 1, destinationRules: 1, requestsPerSecond: 450, successRate: 99.8, latencyP50: 85 },
        ],
        gateways: [
          { name: 'xilian-gateway', servers: [{ port: 443, protocol: 'HTTPS', hosts: ['api.xilian.io', 'www.xilian.io'] }] },
        ],
        policies: {
          peerAuthentication: 5,
          authorizationPolicies: 12,
          requestAuthentication: 3,
        },
        metrics: {
          meshRequestsPerSecond: { value: 15000, unit: 'req/s', timestamp: Date.now(), trend: 'up', changePercent: 4.5 },
          meshSuccessRate: { value: 99.92, unit: '%', timestamp: Date.now(), trend: 'stable' },
          meshLatencyP50: { value: 28, unit: 'ms', timestamp: Date.now(), trend: 'stable' },
          mtlsEnabled: { value: 100, unit: '%', timestamp: Date.now(), trend: 'stable' },
        },
      },
      rateLimit: {
        global: { limit: 100000, current: 8500, remaining: 91500 },
        byConsumer: [
          { consumer: 'mobile-app', limit: 50000, current: 4500, blocked: 12 },
          { consumer: 'web-portal', limit: 30000, current: 2800, blocked: 5 },
          { consumer: 'partner-api', limit: 10000, current: 1200, blocked: 0 },
        ],
        byRoute: [
          { route: 'api-v1', limit: 50000, current: 2500, blocked: 8 },
          { route: 'graphql', limit: 20000, current: 850, blocked: 2 },
        ],
      },
      alerts: {
        critical: 0,
        warning: 1,
        info: 2,
        total: 3,
      },
      trends: {
        requestsHistory: [this.generateTimeSeriesData('Requests/s', 24, 7500, 9500)],
        latencyHistory: [this.generateTimeSeriesData('P99 Latency', 24, 100, 150)],
        errorRateHistory: [this.generateTimeSeriesData('Error Rate %', 24, 0.05, 0.15)],
      },
    };

    this.setCache('apigateway-overview', data);
    return data;
  }

  // ==================== 安全态势 ====================

  async getSecurityPosture(): Promise<SecurityPostureData> {
    const cached = this.getFromCache<SecurityPostureData>('security-posture');
    if (cached) return cached;

    const data: SecurityPostureData = {
      overview: {
        score: 87,
        grade: 'B',
        trend: 'improving',
        lastAssessment: Date.now() - 3600000,
      },
      vulnerabilities: {
        summary: {
          critical: 0,
          high: 3,
          medium: 12,
          low: 28,
          total: 43,
        },
        byCategory: {
          'container-image': 18,
          'dependency': 15,
          'code': 8,
          'configuration': 2,
        },
        recentScans: [
          { id: 'scan-1', type: 'image', target: 'xilian/api:v2.1.0', timestamp: Date.now() - 1800000, findings: 5, status: 'completed' },
          { id: 'scan-2', type: 'code', target: '/app/src', timestamp: Date.now() - 3600000, findings: 8, status: 'completed' },
          { id: 'scan-3', type: 'dependency', target: 'package.json', timestamp: Date.now() - 7200000, findings: 15, status: 'completed' },
          { id: 'scan-4', type: 'secret', target: '/app', timestamp: Date.now() - 10800000, findings: 0, status: 'completed' },
        ],
        topVulnerabilities: [
          { id: 'vuln-1', severity: 'HIGH', title: 'OpenSSL Buffer Overflow', affectedAssets: 3, cve: 'CVE-2024-0001', remediation: 'Upgrade to OpenSSL 3.1.5' },
          { id: 'vuln-2', severity: 'HIGH', title: 'Node.js HTTP/2 DoS', affectedAssets: 2, cve: 'CVE-2024-0002', remediation: 'Upgrade to Node.js 20.11.0' },
          { id: 'vuln-3', severity: 'HIGH', title: 'Prototype Pollution in lodash', affectedAssets: 5, cve: 'CVE-2024-0003', remediation: 'Upgrade to lodash 4.17.22' },
        ],
      },
      compliance: {
        frameworks: [
          { name: 'CIS Kubernetes Benchmark', score: 92, controls: { total: 120, passed: 110, failed: 8, notApplicable: 2 }, lastAudit: Date.now() - 86400000 },
          { name: 'SOC 2 Type II', score: 88, controls: { total: 64, passed: 56, failed: 6, notApplicable: 2 }, lastAudit: Date.now() - 86400000 * 7 },
          { name: 'ISO 27001', score: 85, controls: { total: 114, passed: 97, failed: 12, notApplicable: 5 }, lastAudit: Date.now() - 86400000 * 30 },
        ],
        policies: [
          { name: 'Pod Security Standards', status: 'compliant', violations: 0, lastCheck: Date.now() - 3600000 },
          { name: 'Network Policies', status: 'compliant', violations: 0, lastCheck: Date.now() - 3600000 },
          { name: 'Secret Management', status: 'compliant', violations: 0, lastCheck: Date.now() - 3600000 },
          { name: 'Image Signing', status: 'partial', violations: 2, lastCheck: Date.now() - 3600000 },
        ],
      },
      runtime: {
        falco: {
          status: this.createServiceStatus('Falco', 'healthy'),
          events: {
            total: 1250,
            byPriority: { CRITICAL: 0, WARNING: 15, NOTICE: 85, INFORMATIONAL: 1150 },
            byCategory: { container: 450, network: 380, file: 320, process: 100 },
          },
          recentAlerts: [
            { id: 'alert-1', priority: 'WARNING', rule: 'Sensitive file access', output: 'Sensitive file opened for reading', timestamp: Date.now() - 1800000, container: 'api-pod', pod: 'api-deployment-abc123' },
            { id: 'alert-2', priority: 'NOTICE', rule: 'Outbound connection', output: 'Unexpected outbound connection', timestamp: Date.now() - 3600000, container: 'worker-pod', pod: 'worker-deployment-def456' },
          ],
        },
        networkPolicies: {
          total: 25,
          enforced: 25,
          violations: 0,
        },
        podSecurityPolicies: {
          total: 12,
          violations: 2,
          privilegedPods: 3,
        },
      },
      secrets: {
        vault: {
          status: this.createServiceStatus('Vault', 'healthy'),
          secrets: {
            total: 156,
            byEngine: { kv: 85, database: 45, pki: 18, transit: 8 },
          },
          leases: {
            active: 125,
            expiringSoon: 8,
          },
          certificates: {
            total: 18,
            expiringSoon: 2,
            expired: 0,
          },
        },
        leaks: {
          detected: 0,
          resolved: 5,
          byType: { 'aws-access-key': 2, 'github-token': 2, 'private-key': 1 },
        },
      },
      access: {
        authentication: {
          totalLogins: 12500,
          failedLogins: 85,
          mfaEnabled: 42,
          mfaTotal: 50,
        },
        authorization: {
          totalRequests: 2500000,
          deniedRequests: 1250,
          byRole: { admin: 5000, operator: 45000, viewer: 2450000 },
        },
        sessions: {
          active: 85,
          expired: 12500,
          suspicious: 2,
        },
      },
      alerts: {
        critical: 0,
        warning: 2,
        info: 5,
        total: 7,
      },
      trends: {
        securityScoreHistory: this.generateTimeSeriesData('Security Score', 30, 82, 90),
        vulnerabilityHistory: this.generateTimeSeriesData('Vulnerabilities', 30, 35, 50),
        incidentHistory: this.generateTimeSeriesData('Incidents', 30, 0, 5),
      },
    };

    this.setCache('security-posture', data);
    return data;
  }

  // ==================== 辅助方法 ====================

  private createServiceStatus(name: string, status: 'healthy' | 'degraded' | 'unhealthy'): ServiceStatus {
    return {
      name,
      status,
      uptime: status === 'healthy' ? 99.99 : status === 'degraded' ? 95.5 : 0,
      lastCheck: Date.now(),
      metrics: {},
    };
  }

  private generateTimeSeriesData(label: string, hours: number, min: number, max: number): TimeSeriesData {
    const now = Date.now();
    const timestamps: number[] = [];
    const values: number[] = [];

    for (let i = hours; i >= 0; i--) {
      timestamps.push(now - i * 3600000);
      values.push(min + Math.random() * (max - min));
    }

    return { timestamps, values, label };
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // ==================== 实时更新 ====================

  startAutoRefresh(dashboard: string, callback: (data: unknown) => void, interval = 30000): void {
    if (this.refreshIntervals.has(dashboard)) {
      this.stopAutoRefresh(dashboard);
    }

    const refresh = async () => {
      let data: unknown;
      switch (dashboard) {
        case 'cluster':
          data = await this.getClusterOverview();
          break;
        case 'storage':
          data = await this.getStorageOverview();
          break;
        case 'dataflow':
          data = await this.getDataFlowOverview();
          break;
        case 'apigateway':
          data = await this.getApiGatewayOverview();
          break;
        case 'security':
          data = await this.getSecurityPosture();
          break;
      }
      callback(data);
    };

    refresh();
    const timer = setInterval(refresh, interval);
    this.refreshIntervals.set(dashboard, timer);
  }

  stopAutoRefresh(dashboard: string): void {
    const timer = this.refreshIntervals.get(dashboard);
    if (timer) {
      clearInterval(timer);
      this.refreshIntervals.delete(dashboard);
    }
  }

  cleanup(): void {
    const keys = Array.from(this.refreshIntervals.keys());
    for (const key of keys) {
      this.stopAutoRefresh(key);
    }
    this.cache.clear();
  }
}

// 导出单例
export const dashboardService = new DashboardService();
