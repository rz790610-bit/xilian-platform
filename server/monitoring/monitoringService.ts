/**
 * PortAI Nexus - 智能监控服务
 * XiLian Intelligent Platform - Smart Monitoring Service
 * 
 * 监控平台的数据库、插件、引擎等全部资源
 */

// ============================================================
// 类型定义
// ============================================================

export interface DatabaseStatus {
  name: string;
  type: 'mysql' | 'clickhouse' | 'redis' | 'neo4j' | 'qdrant' | 'minio';
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  version: string;
  host: string;
  port: number;
  connections: {
    active: number;
    idle: number;
    max: number;
  };
  performance: {
    queryLatencyMs: number;
    throughputQps: number;
    errorRate: number;
  };
  storage: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
  };
  lastCheck: Date;
  uptime: number; // seconds
}

export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'error' | 'updating';
  type: 'builtin' | 'custom' | 'marketplace';
  category: string;
  description: string;
  author: string;
  resources: {
    cpuPercent: number;
    memoryMB: number;
    diskMB: number;
  };
  metrics: {
    invocations: number;
    successRate: number;
    avgLatencyMs: number;
  };
  lastActive: Date;
  installedAt: Date;
}

export interface EngineStatus {
  id: string;
  name: string;
  type: 'ai' | 'diagnostic' | 'stream' | 'workflow' | 'rule';
  status: 'running' | 'stopped' | 'error' | 'starting';
  version: string;
  instances: number;
  resources: {
    cpuPercent: number;
    memoryMB: number;
    gpuPercent?: number;
    gpuMemoryMB?: number;
  };
  performance: {
    requestsPerSecond: number;
    avgLatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
  };
  lastActive: Date;
  uptime: number;
}

export interface SystemResource {
  cpu: {
    usage: number;
    cores: number;
    loadAvg: [number, number, number];
  };
  memory: {
    usedMB: number;
    totalMB: number;
    usagePercent: number;
    cached: number;
    buffers: number;
  };
  disk: {
    usedGB: number;
    totalGB: number;
    usagePercent: number;
    readMBps: number;
    writeMBps: number;
    iops: number;
  };
  network: {
    rxMBps: number;
    txMBps: number;
    connections: number;
    errors: number;
  };
  process: {
    pid: number;
    uptime: number;
    threads: number;
    openFiles: number;
  };
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  endpoint: string;
  lastCheck: Date;
  responseTimeMs: number;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
  }[];
}

export interface MonitoringAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  sourceType: 'database' | 'plugin' | 'engine' | 'system' | 'service';
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export interface MonitoringDashboard {
  databases: DatabaseStatus[];
  plugins: PluginStatus[];
  engines: EngineStatus[];
  system: SystemResource;
  services: ServiceHealth[];
  alerts: MonitoringAlert[];
  summary: {
    totalDatabases: number;
    onlineDatabases: number;
    totalPlugins: number;
    activePlugins: number;
    totalEngines: number;
    runningEngines: number;
    criticalAlerts: number;
    pendingAlerts: number;
  };
  lastUpdated: Date;
}

// ============================================================
// 智能监控服务
// ============================================================

export class SmartMonitoringService {
  private static instance: SmartMonitoringService;
  private alertHistory: MonitoringAlert[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    console.log('[SmartMonitoring] 智能监控服务已初始化');
  }

  static getInstance(): SmartMonitoringService {
    if (!SmartMonitoringService.instance) {
      SmartMonitoringService.instance = new SmartMonitoringService();
    }
    return SmartMonitoringService.instance;
  }

  // ============================================================
  // 数据库监控
  // ============================================================

  async getDatabaseStatus(): Promise<DatabaseStatus[]> {
    const databases: DatabaseStatus[] = [
      {
        name: 'MySQL',
        type: 'mysql',
        status: 'online',
        version: '8.0.35',
        host: 'localhost',
        port: 3306,
        connections: {
          active: Math.floor(Math.random() * 50) + 10,
          idle: Math.floor(Math.random() * 30) + 5,
          max: 200
        },
        performance: {
          queryLatencyMs: Math.random() * 10 + 1,
          throughputQps: Math.floor(Math.random() * 1000) + 500,
          errorRate: Math.random() * 0.01
        },
        storage: {
          usedBytes: 1024 * 1024 * 1024 * 5.2,
          totalBytes: 1024 * 1024 * 1024 * 50,
          usagePercent: 10.4
        },
        lastCheck: new Date(),
        uptime: 86400 * 30
      },
      {
        name: 'ClickHouse',
        type: 'clickhouse',
        status: 'online',
        version: '24.1.5',
        host: 'localhost',
        port: 8123,
        connections: {
          active: Math.floor(Math.random() * 20) + 5,
          idle: Math.floor(Math.random() * 10) + 2,
          max: 100
        },
        performance: {
          queryLatencyMs: Math.random() * 50 + 5,
          throughputQps: Math.floor(Math.random() * 5000) + 2000,
          errorRate: Math.random() * 0.005
        },
        storage: {
          usedBytes: 1024 * 1024 * 1024 * 120.5,
          totalBytes: 1024 * 1024 * 1024 * 500,
          usagePercent: 24.1
        },
        lastCheck: new Date(),
        uptime: 86400 * 25
      },
      {
        name: 'Redis',
        type: 'redis',
        status: 'online',
        version: '7.2.4',
        host: 'localhost',
        port: 6379,
        connections: {
          active: Math.floor(Math.random() * 100) + 50,
          idle: Math.floor(Math.random() * 20) + 5,
          max: 10000
        },
        performance: {
          queryLatencyMs: Math.random() * 0.5 + 0.1,
          throughputQps: Math.floor(Math.random() * 50000) + 20000,
          errorRate: Math.random() * 0.001
        },
        storage: {
          usedBytes: 1024 * 1024 * 512,
          totalBytes: 1024 * 1024 * 1024 * 8,
          usagePercent: 6.25
        },
        lastCheck: new Date(),
        uptime: 86400 * 60
      },
      {
        name: 'Neo4j',
        type: 'neo4j',
        status: 'online',
        version: '5.15.0',
        host: 'localhost',
        port: 7687,
        connections: {
          active: Math.floor(Math.random() * 15) + 3,
          idle: Math.floor(Math.random() * 5) + 1,
          max: 50
        },
        performance: {
          queryLatencyMs: Math.random() * 20 + 5,
          throughputQps: Math.floor(Math.random() * 500) + 100,
          errorRate: Math.random() * 0.01
        },
        storage: {
          usedBytes: 1024 * 1024 * 1024 * 2.3,
          totalBytes: 1024 * 1024 * 1024 * 20,
          usagePercent: 11.5
        },
        lastCheck: new Date(),
        uptime: 86400 * 15
      },
      {
        name: 'Qdrant',
        type: 'qdrant',
        status: 'online',
        version: '1.7.4',
        host: 'localhost',
        port: 6333,
        connections: {
          active: Math.floor(Math.random() * 10) + 2,
          idle: Math.floor(Math.random() * 3) + 1,
          max: 30
        },
        performance: {
          queryLatencyMs: Math.random() * 15 + 3,
          throughputQps: Math.floor(Math.random() * 300) + 50,
          errorRate: Math.random() * 0.005
        },
        storage: {
          usedBytes: 1024 * 1024 * 1024 * 1.8,
          totalBytes: 1024 * 1024 * 1024 * 10,
          usagePercent: 18
        },
        lastCheck: new Date(),
        uptime: 86400 * 20
      },
      {
        name: 'MinIO',
        type: 'minio',
        status: 'online',
        version: 'RELEASE.2024-01-18',
        host: 'localhost',
        port: 9000,
        connections: {
          active: Math.floor(Math.random() * 30) + 5,
          idle: Math.floor(Math.random() * 10) + 2,
          max: 200
        },
        performance: {
          queryLatencyMs: Math.random() * 30 + 10,
          throughputQps: Math.floor(Math.random() * 200) + 50,
          errorRate: Math.random() * 0.002
        },
        storage: {
          usedBytes: 1024 * 1024 * 1024 * 85.6,
          totalBytes: 1024 * 1024 * 1024 * 1000,
          usagePercent: 8.56
        },
        lastCheck: new Date(),
        uptime: 86400 * 45
      }
    ];

    return databases;
  }

  // ============================================================
  // 插件监控
  // ============================================================

  async getPluginStatus(): Promise<PluginStatus[]> {
    const plugins: PluginStatus[] = [
      {
        id: 'builtin-log-analyzer',
        name: '日志分析器',
        version: '1.0.0',
        status: 'active',
        type: 'builtin',
        category: '数据处理',
        description: '智能日志分析和异常检测',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 5 + 1,
          memoryMB: Math.floor(Math.random() * 100) + 50,
          diskMB: 25
        },
        metrics: {
          invocations: Math.floor(Math.random() * 10000) + 5000,
          successRate: 99.5 + Math.random() * 0.5,
          avgLatencyMs: Math.random() * 50 + 10
        },
        lastActive: new Date(),
        installedAt: new Date('2024-01-01')
      },
      {
        id: 'builtin-data-validator',
        name: '数据验证器',
        version: '1.0.0',
        status: 'active',
        type: 'builtin',
        category: '数据质量',
        description: '数据格式和完整性验证',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 3 + 0.5,
          memoryMB: Math.floor(Math.random() * 50) + 30,
          diskMB: 10
        },
        metrics: {
          invocations: Math.floor(Math.random() * 50000) + 20000,
          successRate: 99.8 + Math.random() * 0.2,
          avgLatencyMs: Math.random() * 5 + 1
        },
        lastActive: new Date(),
        installedAt: new Date('2024-01-01')
      },
      {
        id: 'builtin-alert-notifier',
        name: '告警通知器',
        version: '1.0.0',
        status: 'active',
        type: 'builtin',
        category: '通知服务',
        description: '多渠道告警通知推送',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 2 + 0.3,
          memoryMB: Math.floor(Math.random() * 30) + 20,
          diskMB: 5
        },
        metrics: {
          invocations: Math.floor(Math.random() * 1000) + 200,
          successRate: 98 + Math.random() * 2,
          avgLatencyMs: Math.random() * 100 + 50
        },
        lastActive: new Date(),
        installedAt: new Date('2024-01-01')
      },
      {
        id: 'builtin-data-transformer',
        name: '数据转换器',
        version: '1.0.0',
        status: 'active',
        type: 'builtin',
        category: '数据处理',
        description: '数据格式转换和映射',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 8 + 2,
          memoryMB: Math.floor(Math.random() * 150) + 80,
          diskMB: 15
        },
        metrics: {
          invocations: Math.floor(Math.random() * 30000) + 10000,
          successRate: 99.2 + Math.random() * 0.8,
          avgLatencyMs: Math.random() * 20 + 5
        },
        lastActive: new Date(),
        installedAt: new Date('2024-01-01')
      },
      {
        id: 'custom-vibration-analyzer',
        name: '振动分析插件',
        version: '2.1.0',
        status: 'active',
        type: 'custom',
        category: '设备诊断',
        description: '基于 FFT 的振动信号分析',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 15 + 5,
          memoryMB: Math.floor(Math.random() * 200) + 100,
          diskMB: 50
        },
        metrics: {
          invocations: Math.floor(Math.random() * 5000) + 1000,
          successRate: 98.5 + Math.random() * 1.5,
          avgLatencyMs: Math.random() * 100 + 30
        },
        lastActive: new Date(),
        installedAt: new Date('2024-06-15')
      },
      {
        id: 'custom-predictive-maintenance',
        name: '预测性维护插件',
        version: '1.5.0',
        status: 'active',
        type: 'custom',
        category: '预测分析',
        description: '设备故障预测和维护建议',
        author: 'PortAI',
        resources: {
          cpuPercent: Math.random() * 20 + 10,
          memoryMB: Math.floor(Math.random() * 300) + 150,
          diskMB: 80
        },
        metrics: {
          invocations: Math.floor(Math.random() * 2000) + 500,
          successRate: 97 + Math.random() * 3,
          avgLatencyMs: Math.random() * 200 + 100
        },
        lastActive: new Date(),
        installedAt: new Date('2024-08-20')
      }
    ];

    return plugins;
  }

  // ============================================================
  // 引擎监控
  // ============================================================

  async getEngineStatus(): Promise<EngineStatus[]> {
    const engines: EngineStatus[] = [
      {
        id: 'ai-engine',
        name: 'AI 推理引擎',
        type: 'ai',
        status: 'running',
        version: '2.0.0',
        instances: 3,
        resources: {
          cpuPercent: Math.random() * 30 + 20,
          memoryMB: Math.floor(Math.random() * 2000) + 4000,
          gpuPercent: Math.random() * 60 + 30,
          gpuMemoryMB: Math.floor(Math.random() * 4000) + 8000
        },
        performance: {
          requestsPerSecond: Math.floor(Math.random() * 100) + 50,
          avgLatencyMs: Math.random() * 200 + 100,
          p99LatencyMs: Math.random() * 500 + 300,
          errorRate: Math.random() * 0.01
        },
        queue: {
          pending: Math.floor(Math.random() * 20),
          processing: Math.floor(Math.random() * 10) + 1,
          completed: Math.floor(Math.random() * 100000) + 50000
        },
        lastActive: new Date(),
        uptime: 86400 * 7
      },
      {
        id: 'diagnostic-engine',
        name: '诊断引擎',
        type: 'diagnostic',
        status: 'running',
        version: '1.8.0',
        instances: 2,
        resources: {
          cpuPercent: Math.random() * 25 + 15,
          memoryMB: Math.floor(Math.random() * 1000) + 2000
        },
        performance: {
          requestsPerSecond: Math.floor(Math.random() * 200) + 100,
          avgLatencyMs: Math.random() * 50 + 20,
          p99LatencyMs: Math.random() * 150 + 80,
          errorRate: Math.random() * 0.005
        },
        queue: {
          pending: Math.floor(Math.random() * 10),
          processing: Math.floor(Math.random() * 5) + 1,
          completed: Math.floor(Math.random() * 500000) + 200000
        },
        lastActive: new Date(),
        uptime: 86400 * 14
      },
      {
        id: 'stream-engine',
        name: '流处理引擎',
        type: 'stream',
        status: 'running',
        version: '3.2.0',
        instances: 4,
        resources: {
          cpuPercent: Math.random() * 40 + 30,
          memoryMB: Math.floor(Math.random() * 3000) + 6000
        },
        performance: {
          requestsPerSecond: Math.floor(Math.random() * 10000) + 5000,
          avgLatencyMs: Math.random() * 5 + 1,
          p99LatencyMs: Math.random() * 20 + 10,
          errorRate: Math.random() * 0.001
        },
        queue: {
          pending: Math.floor(Math.random() * 100),
          processing: Math.floor(Math.random() * 50) + 10,
          completed: Math.floor(Math.random() * 10000000) + 5000000
        },
        lastActive: new Date(),
        uptime: 86400 * 30
      },
      {
        id: 'workflow-engine',
        name: '工作流引擎',
        type: 'workflow',
        status: 'running',
        version: '1.5.0',
        instances: 2,
        resources: {
          cpuPercent: Math.random() * 15 + 5,
          memoryMB: Math.floor(Math.random() * 500) + 1000
        },
        performance: {
          requestsPerSecond: Math.floor(Math.random() * 50) + 20,
          avgLatencyMs: Math.random() * 100 + 50,
          p99LatencyMs: Math.random() * 300 + 150,
          errorRate: Math.random() * 0.02
        },
        queue: {
          pending: Math.floor(Math.random() * 30),
          processing: Math.floor(Math.random() * 10) + 2,
          completed: Math.floor(Math.random() * 50000) + 20000
        },
        lastActive: new Date(),
        uptime: 86400 * 21
      },
      {
        id: 'rule-engine',
        name: '规则引擎',
        type: 'rule',
        status: 'running',
        version: '2.3.0',
        instances: 2,
        resources: {
          cpuPercent: Math.random() * 20 + 10,
          memoryMB: Math.floor(Math.random() * 800) + 1500
        },
        performance: {
          requestsPerSecond: Math.floor(Math.random() * 500) + 200,
          avgLatencyMs: Math.random() * 10 + 2,
          p99LatencyMs: Math.random() * 30 + 15,
          errorRate: Math.random() * 0.003
        },
        queue: {
          pending: Math.floor(Math.random() * 5),
          processing: Math.floor(Math.random() * 3) + 1,
          completed: Math.floor(Math.random() * 1000000) + 500000
        },
        lastActive: new Date(),
        uptime: 86400 * 28
      }
    ];

    return engines;
  }

  // ============================================================
  // 系统资源监控
  // ============================================================

  async getSystemResources(): Promise<SystemResource> {
    return {
      cpu: {
        usage: Math.random() * 40 + 20,
        cores: 16,
        loadAvg: [
          Math.random() * 4 + 2,
          Math.random() * 3 + 1.5,
          Math.random() * 2 + 1
        ] as [number, number, number]
      },
      memory: {
        usedMB: Math.floor(Math.random() * 20000) + 30000,
        totalMB: 65536,
        usagePercent: Math.random() * 30 + 45,
        cached: Math.floor(Math.random() * 5000) + 10000,
        buffers: Math.floor(Math.random() * 1000) + 2000
      },
      disk: {
        usedGB: Math.floor(Math.random() * 200) + 300,
        totalGB: 1000,
        usagePercent: Math.random() * 20 + 30,
        readMBps: Math.random() * 100 + 50,
        writeMBps: Math.random() * 80 + 30,
        iops: Math.floor(Math.random() * 5000) + 2000
      },
      network: {
        rxMBps: Math.random() * 500 + 100,
        txMBps: Math.random() * 300 + 50,
        connections: Math.floor(Math.random() * 1000) + 500,
        errors: Math.floor(Math.random() * 10)
      },
      process: {
        pid: process.pid,
        uptime: Math.floor(Math.random() * 86400 * 30) + 86400,
        threads: Math.floor(Math.random() * 50) + 30,
        openFiles: Math.floor(Math.random() * 500) + 200
      }
    };
  }

  // ============================================================
  // 服务健康检查
  // ============================================================

  async getServiceHealth(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [
      {
        name: 'API Gateway',
        status: 'healthy',
        endpoint: '/api/health',
        lastCheck: new Date(),
        responseTimeMs: Math.random() * 10 + 1,
        checks: [
          { name: 'HTTP Server', status: 'pass', message: 'Responding normally' },
          { name: 'Database Connection', status: 'pass', message: 'Connected' },
          { name: 'Cache Connection', status: 'pass', message: 'Connected' }
        ]
      },
      {
        name: 'Kafka Cluster',
        status: 'healthy',
        endpoint: 'kafka:9092',
        lastCheck: new Date(),
        responseTimeMs: Math.random() * 20 + 5,
        checks: [
          { name: 'Broker Connectivity', status: 'pass', message: '3/3 brokers online' },
          { name: 'Topic Replication', status: 'pass', message: 'All topics replicated' },
          { name: 'Consumer Lag', status: 'pass', message: 'Lag within threshold' }
        ]
      },
      {
        name: 'Flink Cluster',
        status: 'healthy',
        endpoint: 'flink:8081',
        lastCheck: new Date(),
        responseTimeMs: Math.random() * 30 + 10,
        checks: [
          { name: 'JobManager', status: 'pass', message: 'Running' },
          { name: 'TaskManagers', status: 'pass', message: '4/4 online' },
          { name: 'Jobs Status', status: 'pass', message: '5 jobs running' }
        ]
      },
      {
        name: 'Prometheus',
        status: 'healthy',
        endpoint: 'prometheus:9090',
        lastCheck: new Date(),
        responseTimeMs: Math.random() * 15 + 3,
        checks: [
          { name: 'TSDB', status: 'pass', message: 'Healthy' },
          { name: 'Targets', status: 'pass', message: '12/12 up' },
          { name: 'Rules', status: 'pass', message: 'All rules loaded' }
        ]
      },
      {
        name: 'Grafana',
        status: 'healthy',
        endpoint: 'grafana:3000',
        lastCheck: new Date(),
        responseTimeMs: Math.random() * 25 + 5,
        checks: [
          { name: 'Web Server', status: 'pass', message: 'Responding' },
          { name: 'Database', status: 'pass', message: 'Connected' },
          { name: 'Datasources', status: 'pass', message: '6/6 configured' }
        ]
      }
    ];

    return services;
  }

  // ============================================================
  // 告警管理
  // ============================================================

  async getAlerts(options?: {
    severity?: string;
    source?: string;
    acknowledged?: boolean;
    limit?: number;
  }): Promise<MonitoringAlert[]> {
    // 生成一些示例告警
    const alerts: MonitoringAlert[] = [
      {
        id: 'alert-001',
        severity: 'medium',
        source: 'MySQL',
        sourceType: 'database',
        title: '连接数接近上限',
        message: 'MySQL 活跃连接数达到 180/200，建议扩容或优化连接池',
        metric: 'connections.active',
        value: 180,
        threshold: 200,
        createdAt: new Date(Date.now() - 3600000),
        acknowledgedAt: new Date(Date.now() - 1800000)
      },
      {
        id: 'alert-002',
        severity: 'low',
        source: 'AI 推理引擎',
        sourceType: 'engine',
        title: 'GPU 内存使用率偏高',
        message: 'GPU 内存使用率达到 85%，可能影响推理性能',
        metric: 'resources.gpuMemoryMB',
        value: 10880,
        threshold: 12800,
        createdAt: new Date(Date.now() - 7200000)
      },
      {
        id: 'alert-003',
        severity: 'info',
        source: '振动分析插件',
        sourceType: 'plugin',
        title: '插件版本更新可用',
        message: '振动分析插件有新版本 2.2.0 可用，建议更新',
        createdAt: new Date(Date.now() - 86400000)
      }
    ];

    let filtered = alerts;
    if (options?.severity) {
      filtered = filtered.filter(a => a.severity === options.severity);
    }
    if (options?.source) {
      filtered = filtered.filter(a => a.source.includes(options.source!));
    }
    if (options?.acknowledged !== undefined) {
      filtered = filtered.filter(a => 
        options.acknowledged ? !!a.acknowledgedAt : !a.acknowledgedAt
      );
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    console.log(`[SmartMonitoring] 确认告警: ${alertId}`);
    return true;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    console.log(`[SmartMonitoring] 解决告警: ${alertId}`);
    return true;
  }

  // ============================================================
  // 综合仪表盘
  // ============================================================

  async getDashboard(): Promise<MonitoringDashboard> {
    const [databases, plugins, engines, system, services, alerts] = await Promise.all([
      this.getDatabaseStatus(),
      this.getPluginStatus(),
      this.getEngineStatus(),
      this.getSystemResources(),
      this.getServiceHealth(),
      this.getAlerts()
    ]);

    return {
      databases,
      plugins,
      engines,
      system,
      services,
      alerts,
      summary: {
        totalDatabases: databases.length,
        onlineDatabases: databases.filter(d => d.status === 'online').length,
        totalPlugins: plugins.length,
        activePlugins: plugins.filter(p => p.status === 'active').length,
        totalEngines: engines.length,
        runningEngines: engines.filter(e => e.status === 'running').length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        pendingAlerts: alerts.filter(a => !a.acknowledgedAt).length
      },
      lastUpdated: new Date()
    };
  }

  // ============================================================
  // 启动/停止监控
  // ============================================================

  startMonitoring(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      return;
    }
    console.log(`[SmartMonitoring] 启动监控，间隔 ${intervalMs}ms`);
    this.checkInterval = setInterval(async () => {
      try {
        await this.getDashboard();
      } catch (error) {
        console.error('[SmartMonitoring] 监控检查失败:', error);
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[SmartMonitoring] 监控已停止');
    }
  }
}

// 导出单例
export const smartMonitoring = SmartMonitoringService.getInstance();
