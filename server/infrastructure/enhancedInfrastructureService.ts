/**
 * PortAI Nexus - 增强版基础设施服务
 * 整合 Kubernetes、Vault、ArgoCD 真实客户端
 */

import { kubernetesClient } from './clients/kubernetesClient';
import { vaultClient } from './clients/vaultClient';
import { argoCDClient } from './clients/argoCDClient';

// ============================================================
// 类型定义
// ============================================================

export interface InfrastructureOverview {
  kubernetes: {
    connected: boolean;
    nodes: { total: number; ready: number };
    pods: { total: number; running: number; pending: number; failed: number };
    deployments: { total: number; available: number };
    services: number;
    namespaces: number;
  };
  vault: {
    connected: boolean;
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
    kubernetes: false,
    vault: false,
    argocd: false,
  };

  private constructor() {
    this.checkConnections();
    console.log('[EnhancedInfrastructure] 增强版基础设施服务已初始化');
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
    const [kubernetes, vault, argocd] = await Promise.all([
      kubernetesClient.checkConnection(),
      vaultClient.checkConnection(),
      argoCDClient.checkConnection(),
    ]);

    this.connectionStatus = { kubernetes, vault, argocd };
    return this.connectionStatus;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.connectionStatus;
  }

  // ============================================================
  // Kubernetes 操作
  // ============================================================

  /**
   * 获取 K8s 集群概览
   */
  async getKubernetesOverview() {
    return kubernetesClient.getClusterOverview();
  }

  /**
   * 获取节点列表
   */
  async getNodes() {
    return kubernetesClient.getNodes();
  }

  /**
   * 获取命名空间列表
   */
  async getNamespaces() {
    return kubernetesClient.getNamespaces();
  }

  /**
   * 创建命名空间
   */
  async createNamespace(name: string, labels?: Record<string, string>) {
    return kubernetesClient.createNamespace(name, labels);
  }

  /**
   * 删除命名空间
   */
  async deleteNamespace(name: string) {
    return kubernetesClient.deleteNamespace(name);
  }

  /**
   * 获取 Pod 列表
   */
  async getPods(namespace?: string) {
    return kubernetesClient.getPods(namespace);
  }

  /**
   * 删除 Pod
   */
  async deletePod(name: string, namespace: string) {
    return kubernetesClient.deletePod(name, namespace);
  }

  /**
   * 获取 Pod 日志
   */
  async getPodLogs(name: string, namespace: string, container?: string, tailLines?: number) {
    return kubernetesClient.getPodLogs(name, namespace, container, tailLines);
  }

  /**
   * 获取 Deployment 列表
   */
  async getDeployments(namespace?: string) {
    return kubernetesClient.getDeployments(namespace);
  }

  /**
   * 扩缩容 Deployment
   */
  async scaleDeployment(name: string, namespace: string, replicas: number) {
    return kubernetesClient.scaleDeployment(name, namespace, replicas);
  }

  /**
   * 重启 Deployment
   */
  async restartDeployment(name: string, namespace: string) {
    return kubernetesClient.restartDeployment(name, namespace);
  }

  /**
   * 获取 Service 列表
   */
  async getServices(namespace?: string) {
    return kubernetesClient.getServices(namespace);
  }

  /**
   * 获取 ConfigMap 列表
   */
  async getConfigMaps(namespace?: string) {
    return kubernetesClient.getConfigMaps(namespace);
  }

  /**
   * 获取 Secret 列表
   */
  async getSecrets(namespace?: string) {
    return kubernetesClient.getSecrets(namespace);
  }

  /**
   * 获取事件列表
   */
  async getEvents(namespace?: string, limit?: number) {
    return kubernetesClient.getEvents(namespace, limit);
  }

  // ============================================================
  // Vault 操作
  // ============================================================

  /**
   * 获取 Vault 健康状态
   */
  async getVaultHealth() {
    return vaultClient.getHealth();
  }

  /**
   * 获取 Vault 概览
   */
  async getVaultOverview() {
    return vaultClient.getOverview();
  }

  /**
   * 列出密钥路径
   */
  async listSecrets(mount: string, path?: string) {
    return vaultClient.listSecrets(mount, path);
  }

  /**
   * 读取密钥
   */
  async readSecret(mount: string, path: string) {
    return vaultClient.readSecret(mount, path);
  }

  /**
   * 写入密钥
   */
  async writeSecret(mount: string, path: string, data: Record<string, unknown>) {
    return vaultClient.writeSecret(mount, path, data);
  }

  /**
   * 删除密钥
   */
  async deleteSecret(mount: string, path: string) {
    return vaultClient.deleteSecret(mount, path);
  }

  /**
   * 列出策略
   */
  async listVaultPolicies() {
    return vaultClient.listPolicies();
  }

  /**
   * 列出 Secrets Engines
   */
  async listVaultMounts() {
    return vaultClient.listMounts();
  }

  // ============================================================
  // ArgoCD 操作
  // ============================================================

  /**
   * 获取 ArgoCD 概览
   */
  async getArgoCDOverview() {
    return argoCDClient.getOverview();
  }

  /**
   * 列出应用
   */
  async listApplications(project?: string) {
    return argoCDClient.listApplications(project);
  }

  /**
   * 获取应用详情
   */
  async getApplication(name: string) {
    return argoCDClient.getApplication(name);
  }

  /**
   * 创建应用
   */
  async createApplication(app: {
    name: string;
    project: string;
    repoURL: string;
    path: string;
    targetRevision: string;
    destServer: string;
    destNamespace: string;
    autoSync?: boolean;
  }) {
    return argoCDClient.createApplication(app);
  }

  /**
   * 删除应用
   */
  async deleteApplication(name: string, cascade?: boolean) {
    return argoCDClient.deleteApplication(name, cascade);
  }

  /**
   * 同步应用
   */
  async syncApplication(name: string, options?: { revision?: string; prune?: boolean }) {
    return argoCDClient.syncApplication(name, options);
  }

  /**
   * 回滚应用
   */
  async rollbackApplication(name: string, id: number) {
    return argoCDClient.rollbackApplication(name, id);
  }

  /**
   * 刷新应用
   */
  async refreshApplication(name: string, hard?: boolean) {
    return argoCDClient.refreshApplication(name, hard);
  }

  /**
   * 列出项目
   */
  async listProjects() {
    return argoCDClient.listProjects();
  }

  /**
   * 列出仓库
   */
  async listRepositories() {
    return argoCDClient.listRepositories();
  }

  /**
   * 列出集群
   */
  async listClusters() {
    return argoCDClient.listClusters();
  }

  // ============================================================
  // 综合概览
  // ============================================================

  /**
   * 获取基础设施综合概览
   */
  async getOverview(): Promise<InfrastructureOverview> {
    const [k8sOverview, vaultOverview, argoOverview] = await Promise.all([
      kubernetesClient.getClusterOverview(),
      vaultClient.getOverview(),
      argoCDClient.getOverview(),
    ]);

    return {
      kubernetes: {
        connected: this.connectionStatus.kubernetes,
        nodes: k8sOverview.nodes,
        pods: k8sOverview.pods,
        deployments: k8sOverview.deployments,
        services: k8sOverview.services,
        namespaces: k8sOverview.namespaces,
      },
      vault: {
        connected: this.connectionStatus.vault,
        sealed: vaultOverview.health?.sealed || true,
        version: vaultOverview.health?.version || null,
        mounts: vaultOverview.mounts,
        policies: vaultOverview.policies,
      },
      argocd: {
        connected: this.connectionStatus.argocd,
        version: argoOverview.version,
        applications: {
          total: argoOverview.applications.total,
          synced: argoOverview.applications.synced,
          healthy: argoOverview.applications.healthy,
        },
        projects: argoOverview.projects,
        repositories: argoOverview.repositories,
      },
    };
  }

  /**
   * 获取健康状态
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      kubernetes: { status: string; nodes?: number };
      vault: { status: string; sealed?: boolean };
      argocd: { status: string; applications?: number };
    };
  }> {
    await this.checkConnections();

    const components = {
      kubernetes: {
        status: this.connectionStatus.kubernetes ? 'connected' : 'disconnected',
        nodes: this.connectionStatus.kubernetes 
          ? (await kubernetesClient.getNodes()).length 
          : undefined,
      },
      vault: {
        status: this.connectionStatus.vault ? 'connected' : 'disconnected',
        sealed: this.connectionStatus.vault 
          ? (await vaultClient.getHealth())?.sealed 
          : undefined,
      },
      argocd: {
        status: this.connectionStatus.argocd ? 'connected' : 'disconnected',
        applications: this.connectionStatus.argocd 
          ? (await argoCDClient.listApplications()).length 
          : undefined,
      },
    };

    const connectedCount = Object.values(this.connectionStatus).filter(Boolean).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (connectedCount === 3) {
      status = 'healthy';
    } else if (connectedCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, components };
  }
}

// 导出单例
export const enhancedInfrastructureService = EnhancedInfrastructureService.getInstance();
