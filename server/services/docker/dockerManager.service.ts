/**
 * Docker 引擎生命周期管理服务
 * 通过 Docker Engine API (Unix Socket / TCP) 管理容器
 * 
 * 连接方式:
 *   - Unix Socket: /var/run/docker.sock (默认，Linux/Mac)
 *   - TCP: http://host:2375 (远程/Windows)
 * 
 * 环境变量:
 *   DOCKER_HOST: Docker Engine 地址 (默认 unix:///var/run/docker.sock)
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';

// ============ 类型定义 ============

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created' | 'removing';
  status: string;           // "Up 2 hours", "Exited (0) 3 minutes ago"
  ports: DockerPort[];
  created: number;          // Unix timestamp
  labels: Record<string, string>;
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
}

export interface DockerPort {
  privatePort: number;
  publicPort?: number;
  type: string;
}

export interface EngineInfo {
  containerId: string;
  containerName: string;
  serviceName: string;       // docker-compose service name
  displayName: string;       // 中文显示名
  engineType: string;        // RDBMS, Cache, TSDB, etc.
  icon: string;
  description: string;
  image: string;
  state: DockerContainer['state'];
  status: string;
  health?: string;
  ports: DockerPort[];
  uptime?: string;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
}

export interface DockerActionResult {
  success: boolean;
  containerId: string;
  containerName: string;
  action: string;
  message: string;
  error?: string;
}

// ============ 引擎映射配置 ============

/** 容器名 → 引擎元数据 */
export const ENGINE_REGISTRY: Record<string, {
  serviceName: string;
  displayName: string;
  engineType: string;
  icon: string;
  description: string;
  order: number;
}> = {
  'portai-mysql': {
    serviceName: 'mysql',
    displayName: 'MySQL 8.0',
    engineType: 'RDBMS',
    icon: '🐬',
    description: '关系型主数据库，存储资产树、配置、事件等结构化数据',
    order: 1,
  },
  'portai-redis': {
    serviceName: 'redis',
    displayName: 'Redis 7',
    engineType: 'Cache',
    icon: '🔴',
    description: '缓存层，用于设备状态缓存、会话管理、事件去重',
    order: 2,
  },
  'portai-clickhouse': {
    serviceName: 'clickhouse',
    displayName: 'ClickHouse',
    engineType: 'TSDB',
    icon: '⚡',
    description: '时序数据库，用于存储高频传感器数据和聚合指标',
    order: 3,
  },
  'portai-minio': {
    serviceName: 'minio',
    displayName: 'MinIO / S3',
    engineType: 'Object Store',
    icon: '📦',
    description: '对象存储，用于存储波形文件、频谱图、模型文件等大文件',
    order: 4,
  },
  'portai-qdrant': {
    serviceName: 'qdrant',
    displayName: 'Qdrant',
    engineType: 'Vector DB',
    icon: '🧮',
    description: '向量数据库，用于相似故障检索和语义搜索',
    order: 5,
  },
  'portai-kafka': {
    serviceName: 'kafka',
    displayName: 'Kafka',
    engineType: 'Message Queue',
    icon: '📨',
    description: '消息队列，用于事件总线、数据流处理和异步通信',
    order: 6,
  },
  'portai-neo4j': {
    serviceName: 'neo4j',
    displayName: 'Neo4j',
    engineType: 'Graph DB',
    icon: '🕸️',
    description: '图数据库，用于知识图谱和设备关系拓扑',
    order: 7,
  },
  'portai-ollama': {
    serviceName: 'ollama',
    displayName: 'Ollama',
    engineType: 'LLM Runtime',
    icon: '🤖',
    description: '大语言模型推理引擎，支持本地 LLM 部署',
    order: 8,
  },
  'portai-prometheus': {
    serviceName: 'prometheus',
    displayName: 'Prometheus',
    engineType: 'Monitoring',
    icon: '📊',
    description: '监控指标采集与存储，时序指标数据库',
    order: 9,
  },
  'portai-grafana': {
    serviceName: 'grafana',
    displayName: 'Grafana',
    engineType: 'Dashboard',
    icon: '📈',
    description: '可视化监控仪表盘，数据分析与告警',
    order: 10,
  },
  'portai-nexus': {
    serviceName: 'app',
    displayName: 'PortAI Nexus',
    engineType: 'Application',
    icon: '🚀',
    description: '平台主应用服务',
    order: 0,
  },
};

// ============ Docker Engine API 客户端 ============

class DockerClient {
  private socketPath: string;
  private tcpHost: string | null;
  private tcpPort: number | null;
  private useSocket: boolean;

  constructor() {
    const dockerHost = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';
    
    if (dockerHost.startsWith('unix://')) {
      this.socketPath = dockerHost.replace('unix://', '');
      this.tcpHost = null;
      this.tcpPort = null;
      this.useSocket = true;
    } else if (dockerHost.startsWith('tcp://')) {
      const url = new URL(dockerHost.replace('tcp://', 'http://'));
      this.socketPath = '';
      this.tcpHost = url.hostname;
      this.tcpPort = parseInt(url.port) || 2375;
      this.useSocket = false;
    } else {
      // 默认 Unix Socket
      this.socketPath = '/var/run/docker.sock';
      this.tcpHost = null;
      this.tcpPort = null;
      this.useSocket = true;
    }
  }

  /**
   * 发送 HTTP 请求到 Docker Engine API
   */
  private request(method: string, path: string, body?: any, timeout = 30000): Promise<{ statusCode: number; body: any }> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        method,
        path: `/v1.46${path}`,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout,
      };

      if (this.useSocket) {
        options.socketPath = this.socketPath;
      } else {
        options.hostname = this.tcpHost!;
        options.port = this.tcpPort!;
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          resolve({ statusCode: res.statusCode || 500, body: parsed });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Docker API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * 检查 Docker Engine 是否可达
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/_ping', undefined, 5000);
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }

  /**
   * 获取 Docker 版本信息
   */
  async version(): Promise<any> {
    const res = await this.request('GET', '/version');
    return res.body;
  }

  /**
   * 列出所有容器（包括已停止的）
   */
  async listContainers(all = true): Promise<any[]> {
    const res = await this.request('GET', `/containers/json?all=${all}`);
    if (res.statusCode !== 200) {
      throw new Error(`Failed to list containers: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  /**
   * 获取单个容器详情
   */
  async inspectContainer(id: string): Promise<any> {
    const res = await this.request('GET', `/containers/${id}/json`);
    if (res.statusCode !== 200) {
      throw new Error(`Failed to inspect container ${id}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  /**
   * 启动容器
   */
  async startContainer(id: string): Promise<void> {
    const res = await this.request('POST', `/containers/${id}/start`);
    // 204 = started, 304 = already running
    if (res.statusCode !== 204 && res.statusCode !== 304) {
      throw new Error(`Failed to start container ${id}: ${JSON.stringify(res.body)}`);
    }
  }

  /**
   * 停止容器
   */
  async stopContainer(id: string, timeout = 10): Promise<void> {
    const res = await this.request('POST', `/containers/${id}/stop?t=${timeout}`, undefined, 30000);
    // 204 = stopped, 304 = already stopped
    if (res.statusCode !== 204 && res.statusCode !== 304) {
      throw new Error(`Failed to stop container ${id}: ${JSON.stringify(res.body)}`);
    }
  }

  /**
   * 重启容器
   */
  async restartContainer(id: string, timeout = 10): Promise<void> {
    const res = await this.request('POST', `/containers/${id}/restart?t=${timeout}`, undefined, 60000);
    if (res.statusCode !== 204) {
      throw new Error(`Failed to restart container ${id}: ${JSON.stringify(res.body)}`);
    }
  }

  /**
   * 获取容器日志（最后 N 行）
   */
  async containerLogs(id: string, tail = 50): Promise<string> {
    const res = await this.request('GET', `/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`);
    return typeof res.body === 'string' ? res.body : (res.body?.raw || JSON.stringify(res.body));
  }

  /**
   * 获取容器资源统计（CPU/内存）
   */
  async containerStats(id: string): Promise<any> {
    const res = await this.request('GET', `/containers/${id}/stats?stream=false`, undefined, 10000);
    return res.body;
  }
}

// ============ Docker Manager Service ============

class DockerManagerService {
  private client: DockerClient;

  constructor() {
    this.client = new DockerClient();
  }

  /**
   * 检查 Docker Engine 连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const ok = await this.client.ping();
      if (!ok) return { connected: false, error: 'Docker Engine not responding' };
      
      const ver = await this.client.version();
      return {
        connected: true,
        version: `Docker ${ver.Version} (API ${ver.ApiVersion})`,
      };
    } catch (e: any) {
      return {
        connected: false,
        error: e.code === 'ENOENT'
          ? 'Docker socket not found. Ensure Docker is running and /var/run/docker.sock is accessible.'
          : e.code === 'EACCES'
          ? 'Permission denied. Add the current user to the docker group or run with sudo.'
          : `Connection failed: ${e.message}`,
      };
    }
  }

  /**
   * 列出所有 PortAI 引擎容器
   */
  async listEngines(): Promise<EngineInfo[]> {
    const containers = await this.client.listContainers(true);
    
    const engines: EngineInfo[] = [];

    for (const c of containers) {
      // 容器名格式: ["/portai-mysql"]
      const rawName = (c.Names?.[0] || '').replace(/^\//, '');
      const meta = ENGINE_REGISTRY[rawName];
      
      if (!meta) continue; // 不是 PortAI 管理的容器

      const state = (c.State || 'unknown').toLowerCase() as DockerContainer['state'];
      const healthStatus = c.Status?.includes('healthy') ? 'healthy'
        : c.Status?.includes('unhealthy') ? 'unhealthy'
        : c.Status?.includes('starting') ? 'starting'
        : 'none';

      engines.push({
        containerId: c.Id?.substring(0, 12) || '',
        containerName: rawName,
        serviceName: meta.serviceName,
        displayName: meta.displayName,
        engineType: meta.engineType,
        icon: meta.icon,
        description: meta.description,
        image: c.Image || '',
        state,
        status: c.Status || '',
        health: healthStatus,
        ports: (c.Ports || []).map((p: any) => ({
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort,
          type: p.Type,
        })),
        uptime: state === 'running' ? c.Status : undefined,
        canStart: state !== 'running' && state !== 'restarting',
        canStop: state === 'running' || state === 'restarting',
        canRestart: state === 'running',
      });
    }

    // 按 order 排序
    engines.sort((a, b) => {
      const orderA = ENGINE_REGISTRY[a.containerName]?.order ?? 99;
      const orderB = ENGINE_REGISTRY[b.containerName]?.order ?? 99;
      return orderA - orderB;
    });

    return engines;
  }

  /**
   * 启动引擎
   */
  async startEngine(containerName: string): Promise<DockerActionResult> {
    try {
      const containers = await this.client.listContainers(true);
      const target = containers.find((c: any) => 
        (c.Names?.[0] || '').replace(/^\//, '') === containerName
      );
      
      if (!target) {
        return {
          success: false,
          containerId: '',
          containerName,
          action: 'start',
          message: `Container ${containerName} not found`,
          error: 'NOT_FOUND',
        };
      }

      await this.client.startContainer(target.Id);
      return {
        success: true,
        containerId: target.Id.substring(0, 12),
        containerName,
        action: 'start',
        message: `${containerName} started successfully`,
      };
    } catch (e: any) {
      return {
        success: false,
        containerId: '',
        containerName,
        action: 'start',
        message: `Failed to start ${containerName}`,
        error: e.message,
      };
    }
  }

  /**
   * 停止引擎
   */
  async stopEngine(containerName: string): Promise<DockerActionResult> {
    try {
      const containers = await this.client.listContainers(true);
      const target = containers.find((c: any) => 
        (c.Names?.[0] || '').replace(/^\//, '') === containerName
      );
      
      if (!target) {
        return {
          success: false,
          containerId: '',
          containerName,
          action: 'stop',
          message: `Container ${containerName} not found`,
          error: 'NOT_FOUND',
        };
      }

      await this.client.stopContainer(target.Id);
      return {
        success: true,
        containerId: target.Id.substring(0, 12),
        containerName,
        action: 'stop',
        message: `${containerName} stopped successfully`,
      };
    } catch (e: any) {
      return {
        success: false,
        containerId: '',
        containerName,
        action: 'stop',
        message: `Failed to stop ${containerName}`,
        error: e.message,
      };
    }
  }

  /**
   * 重启引擎
   */
  async restartEngine(containerName: string): Promise<DockerActionResult> {
    try {
      const containers = await this.client.listContainers(true);
      const target = containers.find((c: any) => 
        (c.Names?.[0] || '').replace(/^\//, '') === containerName
      );
      
      if (!target) {
        return {
          success: false,
          containerId: '',
          containerName,
          action: 'restart',
          message: `Container ${containerName} not found`,
          error: 'NOT_FOUND',
        };
      }

      await this.client.restartContainer(target.Id);
      return {
        success: true,
        containerId: target.Id.substring(0, 12),
        containerName,
        action: 'restart',
        message: `${containerName} restarted successfully`,
      };
    } catch (e: any) {
      return {
        success: false,
        containerId: '',
        containerName,
        action: 'restart',
        message: `Failed to restart ${containerName}`,
        error: e.message,
      };
    }
  }

  /**
   * 批量启动所有引擎
   */
  async startAll(): Promise<DockerActionResult[]> {
    const engines = await this.listEngines();
    const stopped = engines.filter(e => e.canStart && e.serviceName !== 'app');
    const results: DockerActionResult[] = [];
    
    for (const engine of stopped) {
      const result = await this.startEngine(engine.containerName);
      results.push(result);
    }
    return results;
  }

  /**
   * 批量停止所有引擎（保留 MySQL）
   */
  async stopAll(keepMySQL = true): Promise<DockerActionResult[]> {
    const engines = await this.listEngines();
    const running = engines.filter(e => 
      e.canStop && 
      e.serviceName !== 'app' && 
      (!keepMySQL || e.serviceName !== 'mysql')
    );
    const results: DockerActionResult[] = [];
    
    for (const engine of running) {
      const result = await this.stopEngine(engine.containerName);
      results.push(result);
    }
    return results;
  }

  /**
   * 获取容器日志
   */
  async getEngineLogs(containerName: string, tail = 100): Promise<string> {
    const containers = await this.client.listContainers(true);
    const target = containers.find((c: any) => 
      (c.Names?.[0] || '').replace(/^\//, '') === containerName
    );
    if (!target) throw new Error(`Container ${containerName} not found`);
    return this.client.containerLogs(target.Id, tail);
  }

  /**
   * 获取容器资源使用统计
   */
  async getEngineStats(containerName: string): Promise<{ cpu: string; memory: string; memoryLimit: string; netIO: string }> {
    try {
      const containers = await this.client.listContainers(false); // only running
      const target = containers.find((c: any) => 
        (c.Names?.[0] || '').replace(/^\//, '') === containerName
      );
      if (!target) return { cpu: '-', memory: '-', memoryLimit: '-', netIO: '-' };

      const stats = await this.client.containerStats(target.Id);
      
      // CPU 计算
      const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0);
      const cpuCount = stats.cpu_stats?.online_cpus || 1;
      const cpuPercent = systemDelta > 0 ? ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(1) : '0.0';

      // 内存
      const memUsage = stats.memory_stats?.usage || 0;
      const memLimit = stats.memory_stats?.limit || 0;
      const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

      return {
        cpu: `${cpuPercent}%`,
        memory: formatMB(memUsage),
        memoryLimit: formatMB(memLimit),
        netIO: '-',
      };
    } catch {
      return { cpu: '-', memory: '-', memoryLimit: '-', netIO: '-' };
    }
  }
}

// 单例导出
export const dockerManager = new DockerManagerService();
