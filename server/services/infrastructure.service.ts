/**
 * PortAI Nexus - 增强版基础设施服务
 * K8s → Docker Engine API（读取真实容器状态）
 * Vault → 环境变量管理（脱敏展示）
 * ArgoCD → 未来规划（返回未连接+配置引导）
 */
import { dockerManager } from './docker/dockerManager.service';

// ============================================================
// 环境变量管理（替代 Vault）
// ============================================================
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
  'VAULT_ADDR', 'VAULT_TOKEN',
  'ARGOCD_SERVER', 'ARGOCD_AUTH_TOKEN',
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
    JWT: '认证', SESSION: '认证', VAULT: '密钥管理', ARGOCD: 'GitOps',
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
// ArgoCD stub — 未来规划
// ============================================================
const argoCDClient = {
  async checkConnection() { return false; },
  async getVersion() { return null; },
  async listApplications() { return []; },
  async getApplication(_name: string) { return null; },
  async syncApplication(_name: string) { return { status: 'unknown' }; },
  async listProjects() { return []; },
  async listRepositories() { return []; },
  async getCICDPipelines() { return []; },
} as any;

// ============================================================
// 类型定义
// ============================================================

export interface InfrastructureOverview {
  kubernetes: {
    connected: boolean;
    mode: 'docker' | 'kubernetes';
    nodes: { total: number; ready: number };
    pods: { total: number; running: number; pending: number; failed: number };
    deployments: { total: number; available: number };
    services: number;
    namespaces: number;
  };
  vault: {
    connected: boolean;
    mode: 'env' | 'vault';
    sealed: boolean;
    version: string | null;
    mounts: number;
    policies: number;
  };
  argocd: {
    connected: boolean;
    version: string | null;
    applications: { total: number; synced: number; healthy: number };
    projects: number;
    repositories: number;
  };
}

// ============================================================
// 增强基础设施服务类
// ============================================================

export class EnhancedInfrastructureService {
  private static instance: EnhancedInfrastructureService;
  private connectionStatus = {
    kubernetes: false, // 实际代表 Docker 是否连接
    vault: true,       // 环境变量模式始终可用
    argocd: false,
  };

  private constructor() {
    this.checkConnections();
    console.log('[EnhancedInfrastructure] 基础设施服务已初始化 (Docker + 环境变量模式)');
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
    kubernetes: boolean;
    vault: boolean;
    argocd: boolean;
  }> {
    let dockerConnected = false;
    try {
      const result = await dockerManager.checkConnection();
      dockerConnected = result.connected;
    } catch { dockerConnected = false; }

    this.connectionStatus = {
      kubernetes: dockerConnected,
      vault: true, // 环境变量模式始终可用
      argocd: false,
    };
    return this.connectionStatus;
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  // ============================================================
  // 容器管理（Docker Engine 替代 K8s）
  // ============================================================

  async getKubernetesOverview() {
    try {
      const engines = await dockerManager.listEngines();
      const running = engines.filter((e: any) => e.status === 'running');
      return {
        mode: 'docker',
        nodes: { total: 1, ready: this.connectionStatus.kubernetes ? 1 : 0 },
        pods: {
          total: engines.length,
          running: running.length,
          pending: engines.filter((e: any) => e.status === 'created' || e.status === 'restarting').length,
          failed: engines.filter((e: any) => e.status === 'exited' || e.status === 'dead').length,
        },
        deployments: { total: engines.length, available: running.length },
        services: running.length,
        namespaces: 1,
      };
    } catch {
      return { mode: 'docker', nodes: { total: 0, ready: 0 }, pods: { total: 0, running: 0, pending: 0, failed: 0 }, deployments: { total: 0, available: 0 }, services: 0, namespaces: 0 };
    }
  }

  async getNodes() {
    const connected = this.connectionStatus.kubernetes;
    if (!connected) return [];
    try {
      const conn = await dockerManager.checkConnection();
      return [{
        name: 'mac-studio-docker',
        status: 'Ready',
        roles: ['master'],
        version: conn.version || 'unknown',
        os: 'darwin/arm64',
        cpu: { capacity: '10', allocatable: '10' },
        memory: { capacity: '64Gi', allocatable: '60Gi' },
        conditions: [{ type: 'Ready', status: 'True' }, { type: 'DiskPressure', status: 'False' }, { type: 'MemoryPressure', status: 'False' }],
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      }];
    } catch { return []; }
  }

  async getNamespaces() {
    return [{ name: 'xilian-platform', status: 'Active', labels: { app: 'xilian' }, createdAt: new Date().toISOString() }];
  }

  async createNamespace(name: string, labels?: Record<string, string>) {
    return { name, labels, status: 'Active', message: 'Docker 模式下命名空间为虚拟概念' };
  }

  async deleteNamespace(name: string) {
    return { name, deleted: false, message: 'Docker 模式下不支持删除命名空间' };
  }

  async getPods(namespace?: string) {
    try {
      const engines = await dockerManager.listEngines();
      return engines.map((e: any) => ({
        name: e.containerName || e.name,
        namespace: namespace || 'xilian-platform',
        status: e.status === 'running' ? 'Running' : e.status === 'exited' ? 'Failed' : 'Pending',
        ready: e.status === 'running',
        restarts: 0,
        age: e.uptime || '-',
        node: 'mac-studio-docker',
        ip: e.ip || '-',
        image: e.image || '-',
        cpu: e.cpu || '0m',
        memory: e.memory || '0Mi',
        containers: [{ name: e.containerName || e.name, image: e.image, ready: e.status === 'running', restarts: 0 }],
      }));
    } catch { return []; }
  }

  async deletePod(name: string, _namespace: string) {
    try {
      return await dockerManager.restartEngine(name);
    } catch (e: any) { return { success: false, error: e.message }; }
  }

  async getPodLogs(name: string, _namespace: string, _container?: string, tailLines?: number) {
    try {
      return await dockerManager.getEngineLogs(name, tailLines || 100);
    } catch { return ''; }
  }

  async getDeployments(namespace?: string) {
    try {
      const engines = await dockerManager.listEngines();
      return engines.map((e: any) => ({
        name: e.containerName || e.name,
        namespace: namespace || 'xilian-platform',
        replicas: { desired: 1, ready: e.status === 'running' ? 1 : 0, available: e.status === 'running' ? 1 : 0 },
        image: e.image || '-',
        strategy: 'Recreate',
        conditions: [{ type: e.status === 'running' ? 'Available' : 'Progressing', status: 'True' }],
        createdAt: e.createdAt || new Date().toISOString(),
      }));
    } catch { return []; }
  }

  async scaleDeployment(name: string, _namespace: string, replicas: number) {
    if (replicas === 0) {
      return await dockerManager.stopEngine(name);
    } else {
      return await dockerManager.startEngine(name);
    }
  }

  async restartDeployment(name: string, _namespace: string) {
    return await dockerManager.restartEngine(name);
  }

  async getServices(namespace?: string) {
    try {
      const engines = await dockerManager.listEngines();
      return engines.filter((e: any) => e.status === 'running').map((e: any) => ({
        name: e.containerName || e.name,
        namespace: namespace || 'xilian-platform',
        type: 'ClusterIP',
        clusterIP: e.ip || '-',
        ports: e.ports || [],
        selector: { app: e.containerName || e.name },
      }));
    } catch { return []; }
  }

  async getConfigMaps(_namespace?: string) {
    // 返回实际的环境变量配置（非敏感）
    const configKeys = ENV_SECRET_KEYS.filter(k => !k.includes('PASSWORD') && !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('KEY'));
    return configKeys.filter(k => process.env[k]).map(k => ({
      name: k.toLowerCase().replace(/_/g, '-'),
      namespace: 'xilian-platform',
      data: { [k]: process.env[k] || '' },
      createdAt: new Date().toISOString(),
    }));
  }

  async getSecrets(_namespace?: string) {
    return getEnvSecrets().filter(s => s.type === 'secret' && s.configured);
  }

  async getEvents(_namespace?: string, _limit?: number) {
    // 返回 Docker 事件概要
    return [];
  }

  // ============================================================
  // Vault 操作 → 环境变量管理
  // ============================================================

  async getVaultHealth() {
    return {
      initialized: true,
      sealed: false,
      version: '环境变量模式',
      mode: 'env',
      message: '当前使用环境变量管理密钥。如需 Vault，请部署 HashiCorp Vault 并配置 VAULT_ADDR 和 VAULT_TOKEN。',
    };
  }

  async getVaultOverview() {
    const secrets = getEnvSecrets();
    const categories = [...new Set(secrets.map(s => s.category))];
    return {
      mode: 'env',
      mounts: categories.length,
      totalSecrets: secrets.length,
      configured: secrets.filter(s => s.configured).length,
      unconfigured: secrets.filter(s => !s.configured).length,
      categories,
    };
  }

  async listSecrets(mount: string, _path?: string) {
    const secrets = getEnvSecrets();
    if (mount === 'all' || !mount) return secrets;
    return secrets.filter(s => s.category === mount || s.name.toLowerCase().startsWith(mount.toLowerCase()));
  }

  async readSecret(_mount: string, path: string) {
    const key = path.replace('env/', '');
    const value = process.env[key];
    if (!value) return null;
    return {
      path: `env/${key}`,
      data: { [key]: maskValue(value) },
      metadata: { created_time: new Date().toISOString(), version: 1 },
    };
  }

  async writeSecret(_mount: string, _path: string, _data: Record<string, unknown>) {
    return { success: false, message: '环境变量模式下不支持动态写入。请修改 .env 文件或系统环境变量后重启服务。' };
  }

  async deleteSecret(_mount: string, _path: string) {
    return { success: false, message: '环境变量模式下不支持动态删除。请修改 .env 文件后重启服务。' };
  }

  async listVaultPolicies() {
    return [
      { name: 'env-readonly', description: '环境变量只读策略（默认）', rules: 'path "env/*" { capabilities = ["read", "list"] }' },
    ];
  }

  async listVaultMounts() {
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
  // ArgoCD 操作 — 未来规划
  // ============================================================

  async getArgoCDOverview() {
    return {
      connected: false,
      message: '未部署 ArgoCD。如需 GitOps 持续部署，请安装 ArgoCD 并配置 ARGOCD_SERVER 和 ARGOCD_AUTH_TOKEN。',
      guide: 'https://argo-cd.readthedocs.io/en/stable/getting_started/',
    };
  }

  async listApplications(_project?: string) { return []; }
  async getApplication(_name: string) { return null; }
  async createApplication(_app: any) { return { success: false, message: 'ArgoCD 未部署' }; }
  async deleteApplication(_name: string, _cascade?: boolean) { return { success: false, message: 'ArgoCD 未部署' }; }
  async syncApplication(_name: string, _options?: any) { return { success: false, message: 'ArgoCD 未部署' }; }
  async rollbackApplication(_name: string, _id: number) { return { success: false, message: 'ArgoCD 未部署' }; }
  async refreshApplication(_name: string, _hard?: boolean) { return { success: false, message: 'ArgoCD 未部署' }; }
  async listProjects() { return []; }
  async listRepositories() { return []; }
  async listClusters() { return []; }

  // ============================================================
  // 综合概览
  // ============================================================

  async getOverview(): Promise<InfrastructureOverview> {
    const k8sOverview = await this.getKubernetesOverview();
    const vaultOverview = await this.getVaultOverview();

    return {
      kubernetes: {
        connected: this.connectionStatus.kubernetes,
        mode: 'docker',
        nodes: k8sOverview.nodes,
        pods: k8sOverview.pods,
        deployments: k8sOverview.deployments,
        services: k8sOverview.services,
        namespaces: k8sOverview.namespaces,
      },
      vault: {
        connected: true,
        mode: 'env',
        sealed: false,
        version: '环境变量模式',
        mounts: vaultOverview.mounts,
        policies: 1,
      },
      argocd: {
        connected: false,
        version: null,
        applications: { total: 0, synced: 0, healthy: 0 },
        projects: 0,
        repositories: 0,
      },
    };
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      kubernetes: { status: string; mode: string; nodes?: number; containers?: number };
      vault: { status: string; mode: string; configured?: number };
      argocd: { status: string; message?: string };
    };
  }> {
    await this.checkConnections();

    let containerCount = 0;
    if (this.connectionStatus.kubernetes) {
      try {
        const engines = await dockerManager.listEngines();
        containerCount = engines.length;
      } catch {}
    }

    const envSecrets = getEnvSecrets();
    const configuredCount = envSecrets.filter(s => s.configured).length;

    const components = {
      kubernetes: {
        status: this.connectionStatus.kubernetes ? 'connected' : 'disconnected',
        mode: 'docker',
        nodes: this.connectionStatus.kubernetes ? 1 : 0,
        containers: containerCount,
      },
      vault: {
        status: 'connected',
        mode: 'env',
        configured: configuredCount,
      },
      argocd: {
        status: 'disconnected',
        message: '未部署 — 如需 GitOps 请安装 ArgoCD',
      },
    };

    // Docker 连接 + 环境变量可用 = degraded（因为 ArgoCD 未连接）
    // Docker 未连接 = unhealthy
    const status = this.connectionStatus.kubernetes ? 'degraded' : 'unhealthy';

    return { status, components };
  }

  // ============================================================
  // 节点管理（Docker 模式下为单节点）
  // ============================================================

  async getNode(name: string) {
    const nodes = await this.getNodes();
    return nodes.find((n: any) => n.name === name) || null;
  }

  async setNodeStatus(_name: string, _schedulable: boolean) {
    return { message: 'Docker 模式下不支持节点调度管理' };
  }

  async updateNodeLabels(_name: string, _labels: Record<string, string>) {
    return { message: 'Docker 模式下不支持节点标签管理' };
  }

  async addNodeTaint(_name: string, _taint: { key: string; value?: string; effect: string }) {
    return { message: 'Docker 模式下不支持节点污点管理' };
  }

  async removeNodeTaint(_name: string, _taintKey: string) {
    return { message: 'Docker 模式下不支持节点污点管理' };
  }

  // ============================================================
  // 存储管理（Docker volumes）
  // ============================================================

  async getStorageClasses(): Promise<any[]> {
    return [{ id: 'docker-local', name: 'docker-local', provisioner: 'docker.io/local', reclaimPolicy: 'Retain', volumeBindingMode: 'Immediate', allowVolumeExpansion: true, isDefault: true, type: 'local' }];
  }

  async getPersistentVolumes() {
    try {
      const engines = await dockerManager.listEngines();
      return engines.map((e: any) => ({
        name: `${(e.containerName || e.name)}-data`,
        capacity: '-',
        accessModes: ['ReadWriteOnce'],
        status: e.status === 'running' ? 'Bound' : 'Released',
        storageClass: 'docker-local',
        claim: e.containerName || e.name,
      }));
    } catch { return []; }
  }

  async getPersistentVolumeClaims(_namespace?: string) {
    return this.getPersistentVolumes();
  }

  // ============================================================
  // 网络策略（Docker 模式简化）
  // ============================================================

  async getNetworkPolicies(_namespace?: string) {
    return [{ name: 'xilian-net', namespace: 'xilian-platform', type: 'bridge', driver: 'bridge', scope: 'local' }];
  }

  async createNetworkPolicy(_namespace: string, _policy: any) {
    return { message: 'Docker 模式下请使用 docker network 命令管理网络' };
  }

  async deleteNetworkPolicy(_namespace: string, _name: string) {
    return { message: 'Docker 模式下请使用 docker network 命令管理网络' };
  }

  // ============================================================
  // 集群概览与安全
  // ============================================================

  async getClusterOverview() {
    const overview = await this.getOverview();
    return {
      ...overview,
      storageClasses: await this.getStorageClasses(),
      persistentVolumes: await this.getPersistentVolumes(),
    };
  }

  async getOpaPolicies() {
    return [];
  }

  async getRbacRoles(_namespace?: string) {
    return [];
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
