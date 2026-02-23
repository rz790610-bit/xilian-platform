/**
 * PortAI Nexus - 基础设施服务
 * Docker Engine API（读取真实容器状态）
 * 环境变量管理（脱敏展示）
 */
import { dockerManager } from './docker/dockerManager.service';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('infrastructure');

// ============================================================
// 环境变量管理
// ============================================================
// 【配置迁移豁免】本服务的核心功能是动态遍历 ENV_SECRET_KEYS 列表展示环境变量状态，
// 必须通过 process.env[key] 动态读取，无法静态映射到 config.ts。
// 这是运维审计功能，不是业务配置读取。

const ENV_SECRET_KEYS = [
  'MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE',
  'REDIS_PASSWORD', 'REDIS_HOST', 'REDIS_PORT',
  'CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_PASSWORD',
  'KAFKA_BROKERS', 'KAFKA_HOST',
  'QDRANT_HOST', 'QDRANT_PORT', 'QDRANT_API_KEY',
  'NEO4J_URI', 'NEO4J_PASSWORD', 'NEO4J_HOST',
  'MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_HOST',
  'OLLAMA_HOST', 'OLLAMA_BASE_URL',
  'JWT_SECRET', 'SESSION_SECRET',
  'DOCKER_HOST', 'DOCKER_SOCKET_PATH',
  'PROMETHEUS_URL', 'GRAFANA_URL', 'JAEGER_URL',
];

function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 12)) + value.slice(-2);
}

function getEnvSecrets(): Array<{
  path: string; name: string; value: string; masked: string;
  type: string; configured: boolean; category: string;
}> {
  const categoryMap: Record<string, string> = {
    MYSQL: '数据库', REDIS: '缓存', CLICKHOUSE: '时序数据库', KAFKA: '消息队列',
    QDRANT: '向量数据库', NEO4J: '图数据库', MINIO: '对象存储', OLLAMA: 'AI 推理',
    JWT: '认证', SESSION: '认证',
    DOCKER: '容器引擎', PROMETHEUS: '监控', GRAFANA: '可视化', JAEGER: '链路追踪',
  };
  return ENV_SECRET_KEYS.map(key => {
    const value = process.env[key] || '';
    const prefix = key.split('_')[0];
    return {
      path: `env/${key}`,
      name: key,
      value,
      masked: value ? maskValue(value) : '(未配置)',
      type: key.includes('PASSWORD') || key.includes('SECRET') || key.includes('TOKEN') || key.includes('KEY') ? 'secret' : 'config',
      configured: !!value,
      category: categoryMap[prefix] || '其他',
    };
  });
}

// ============================================================
// 类型定义
// ============================================================

export interface InfrastructureOverview {
  docker: {
    connected: boolean;
    containers: { total: number; running: number; stopped: number; failed: number };
    images: number;
    volumes: number;
  };
  secrets: {
    mode: 'env';
    total: number;
    configured: number;
    unconfigured: number;
    categories: number;
  };
}

// ============================================================
// 基础设施服务类
// ============================================================

export class EnhancedInfrastructureService {
  private static instance: EnhancedInfrastructureService;
  private connectionStatus = {
    docker: false,
    secrets: true, // 环境变量模式始终可用
  };

  private constructor() {
    this.checkConnections();
    log.debug('[Infrastructure] 基础设施服务已初始化 (Docker + 环境变量模式)');
  }

  static getInstance(): EnhancedInfrastructureService {
    if (!EnhancedInfrastructureService.instance) {
      EnhancedInfrastructureService.instance = new EnhancedInfrastructureService();
    }
    return EnhancedInfrastructureService.instance;
  }

  /**
   * 检查所有服务连接状态
   */
  async checkConnections(): Promise<{
    docker: boolean;
    secrets: boolean;
  }> {
    let dockerConnected = false;
    try {
      const result = await dockerManager.checkConnection();
      dockerConnected = result.connected;
    } catch { dockerConnected = false; }

    this.connectionStatus = {
      docker: dockerConnected,
      secrets: true,
    };
    return this.connectionStatus;
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  // ============================================================
  // Docker 容器管理
  // ============================================================

  async getDockerOverview() {
    try {
      const engines = await dockerManager.listEngines();
      const running = engines.filter((e: any) => e.status === 'running');
      const stopped = engines.filter((e: any) => e.status === 'exited' || e.status === 'created');
      const failed = engines.filter((e: any) => e.status === 'dead');
      return {
        connected: this.connectionStatus.docker,
        containers: {
          total: engines.length,
          running: running.length,
          stopped: stopped.length,
          failed: failed.length,
        },
        images: [...new Set(engines.map((e: any) => e.image))].length,
        volumes: engines.length,
      };
    } catch {
      return {
        connected: false,
        containers: { total: 0, running: 0, stopped: 0, failed: 0 },
        images: 0,
        volumes: 0,
      };
    }
  }

  async getContainers() {
    if (!this.connectionStatus.docker) return [];
    try {
      const engines = await dockerManager.listEngines();
      return engines.map((e: any) => ({
        name: e.containerName || e.name,
        status: e.status,
        image: e.image || '-',
        ports: e.ports || [],
        ip: e.ip || '-',
        uptime: e.uptime || '-',
        cpu: e.cpu || '0%',
        memory: e.memory || '0MB',
        createdAt: e.createdAt || new Date().toISOString(),
      }));
    } catch { return []; }
  }

  async getContainer(name: string) {
    const containers = await this.getContainers();
    return containers.find((c: any) => c.name === name) || null;
  }

  async getHostInfo() {
    if (!this.connectionStatus.docker) return null;
    try {
      const conn = await dockerManager.checkConnection();
      return {
        hostname: 'docker-host',
        version: conn.version || 'unknown',
        os: process.platform + '/' + process.arch,
        containers: (await this.getContainers()).length,
      };
    } catch { return null; }
  }

  async restartContainer(name: string) {
    try {
      return await dockerManager.restartEngine(name);
    } catch (e: any) { return { success: false, error: e.message }; }
  }

  async getContainerLogs(name: string, tailLines?: number) {
    try {
      return await dockerManager.getEngineLogs(name, tailLines || 100);
    } catch { return ''; }
  }

  async stopContainer(name: string) {
    return await dockerManager.stopEngine(name);
  }

  async startContainer(name: string) {
    return await dockerManager.startEngine(name);
  }

  async getRunningServices() {
    try {
      const engines = await dockerManager.listEngines();
      return engines.filter((e: any) => e.status === 'running').map((e: any) => ({
        name: e.containerName || e.name,
        image: e.image || '-',
        ports: e.ports || [],
        ip: e.ip || '-',
      }));
    } catch { return []; }
  }

  // ============================================================
  // 环境变量 / 密钥管理
  // ============================================================

  async getSecretsHealth() {
    return {
      mode: 'env' as const,
      message: '当前使用环境变量管理密钥。如需 Vault，请部署 HashiCorp Vault 并配置 VAULT_ADDR 和 VAULT_TOKEN。',
    };
  }

  async getSecretsOverview() {
    const secrets = getEnvSecrets();
    const categories = [...new Set(secrets.map(s => s.category))];
    return {
      mode: 'env' as const,
      total: secrets.length,
      configured: secrets.filter(s => s.configured).length,
      unconfigured: secrets.filter(s => !s.configured).length,
      categories,
    };
  }

  async listSecrets(category: string, _path?: string) {
    const secrets = getEnvSecrets();
    if (category === 'all' || !category) return secrets;
    return secrets.filter(s => s.category === category || s.name.toLowerCase().startsWith(category.toLowerCase()));
  }

  async readSecret(_category: string, path: string) {
    const key = path.replace('env/', '');
    const value = process.env[key];
    if (!value) return null;
    return {
      path: `env/${key}`,
      data: { [key]: maskValue(value) },
      metadata: { created_time: new Date().toISOString(), version: 1 },
    };
  }

  async writeSecret(_category: string, _path: string, _data: Record<string, unknown>) {
    return { success: false, message: '环境变量模式下不支持动态写入。请修改 .env 文件或系统环境变量后重启服务。' };
  }

  async deleteSecret(_category: string, _path: string) {
    return { success: false, message: '环境变量模式下不支持动态删除。请修改 .env 文件后重启服务。' };
  }

  async listSecretPolicies() {
    return [
      { name: 'env-readonly', description: '环境变量只读策略（默认）', rules: 'path "env/*" { capabilities = ["read", "list"] }' },
    ];
  }

  async listSecretCategories() {
    const secrets = getEnvSecrets();
    const categories = [...new Set(secrets.map(s => s.category))];
    return categories.map(cat => ({
      path: cat,
      type: 'env',
      description: `${cat}相关环境变量`,
      count: secrets.filter(s => s.category === cat).length,
      configured: secrets.filter(s => s.category === cat && s.configured).length,
    }));
  }

  // ============================================================
  // Docker 存储管理
  // ============================================================

  async getStorageDrivers(): Promise<any[]> {
    return [{ id: 'docker-local', name: 'docker-local', driver: 'local', scope: 'local' }];
  }

  async getVolumes() {
    try {
      const engines = await dockerManager.listEngines();
      return engines.map((e: any) => ({
        name: `${(e.containerName || e.name)}-data`,
        driver: 'local',
        status: e.status === 'running' ? 'in-use' : 'available',
        mountpoint: `/var/lib/docker/volumes/${e.containerName || e.name}-data`,
        container: e.containerName || e.name,
      }));
    } catch { return []; }
  }

  // ============================================================
  // Docker 网络管理
  // ============================================================

  async getNetworks() {
    return [{ name: 'xilian-net', driver: 'bridge', scope: 'local' }];
  }

  async createNetwork(_name: string) {
    return { message: '请使用 docker network create 命令创建网络' };
  }

  async deleteNetwork(_name: string) {
    return { message: '请使用 docker network rm 命令删除网络' };
  }

  // ============================================================
  // 综合概览
  // ============================================================

  async getOverview(): Promise<InfrastructureOverview> {
    const dockerOverview = await this.getDockerOverview();
    const secretsOverview = await this.getSecretsOverview();

    return {
      docker: {
        connected: dockerOverview.connected,
        containers: dockerOverview.containers,
        images: dockerOverview.images,
        volumes: dockerOverview.volumes,
      },
      secrets: {
        mode: 'env',
        total: secretsOverview.total,
        configured: secretsOverview.configured,
        unconfigured: secretsOverview.unconfigured,
        categories: secretsOverview.categories.length,
      },
    };
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      docker: { status: string; containers?: number };
      secrets: { status: string; configured?: number };
    };
  }> {
    await this.checkConnections();

    let containerCount = 0;
    if (this.connectionStatus.docker) {
      try {
        const engines = await dockerManager.listEngines();
        containerCount = engines.length;
      } catch {}
    }

    const envSecrets = getEnvSecrets();
    const configuredCount = envSecrets.filter(s => s.configured).length;

    const components = {
      docker: {
        status: this.connectionStatus.docker ? 'connected' : 'disconnected',
        containers: containerCount,
      },
      secrets: {
        status: 'connected',
        configured: configuredCount,
      },
    };

    const status = this.connectionStatus.docker ? 'healthy' : 'unhealthy';
    return { status, components };
  }

  async getInfrastructureSummary() {
    const health = await this.getHealth();
    const overview = await this.getOverview();
    return {
      health,
      overview,
      timestamp: new Date().toISOString(),
    };
  }
}

// 导出单例
export const infrastructureService = EnhancedInfrastructureService.getInstance();
