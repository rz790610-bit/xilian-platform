/**
 * Kubernetes 真实客户端
 * 使用官方 @kubernetes/client-node 库连接 K8s API
 */

import * as k8s from '@kubernetes/client-node';

// ============================================================
// 配置
// ============================================================

const K8S_CONFIG = {
  // 支持多种配置方式
  configType: process.env.K8S_CONFIG_TYPE || 'default', // 'default' | 'incluster' | 'kubeconfig'
  kubeconfigPath: process.env.KUBECONFIG || undefined,
  context: process.env.K8S_CONTEXT || undefined,
};

// ============================================================
// 类型定义
// ============================================================

export interface K8sNode {
  name: string;
  status: 'Ready' | 'NotReady' | 'Unknown';
  roles: string[];
  version: string;
  internalIP: string;
  externalIP?: string;
  os: string;
  arch: string;
  cpu: {
    capacity: string;
    allocatable: string;
  };
  memory: {
    capacity: string;
    allocatable: string;
  };
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  createdAt: Date;
}

export interface K8sNamespace {
  name: string;
  status: string;
  labels: Record<string, string>;
  createdAt: Date;
}

export interface K8sPod {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  nodeName?: string;
  ip?: string;
  containers: Array<{
    name: string;
    image: string;
    ready: boolean;
    restartCount: number;
    state: string;
  }>;
  labels: Record<string, string>;
  createdAt: Date;
}

export interface K8sDeployment {
  name: string;
  namespace: string;
  replicas: {
    desired: number;
    ready: number;
    available: number;
    updated: number;
  };
  strategy: string;
  selector: Record<string, string>;
  labels: Record<string, string>;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  createdAt: Date;
}

export interface K8sService {
  name: string;
  namespace: string;
  type: string;
  clusterIP?: string;
  externalIP?: string;
  ports: Array<{
    name?: string;
    port: number;
    targetPort: number | string;
    protocol: string;
    nodePort?: number;
  }>;
  selector: Record<string, string>;
  createdAt: Date;
}

export interface K8sConfigMap {
  name: string;
  namespace: string;
  data: Record<string, string>;
  labels: Record<string, string>;
  createdAt: Date;
}

export interface K8sSecret {
  name: string;
  namespace: string;
  type: string;
  keys: string[];
  labels: Record<string, string>;
  createdAt: Date;
}

export interface K8sEvent {
  name: string;
  namespace: string;
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace?: string;
  };
  count: number;
  firstTimestamp?: Date;
  lastTimestamp?: Date;
}

// ============================================================
// Kubernetes 客户端类
// ============================================================

export class KubernetesClient {
  private static instance: KubernetesClient;
  private kc: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private connected: boolean = false;

  private constructor() {
    this.kc = new k8s.KubeConfig();
    
    try {
      switch (K8S_CONFIG.configType) {
        case 'incluster':
          this.kc.loadFromCluster();
          break;
        case 'kubeconfig':
          if (K8S_CONFIG.kubeconfigPath) {
            this.kc.loadFromFile(K8S_CONFIG.kubeconfigPath);
          } else {
            this.kc.loadFromDefault();
          }
          break;
        default:
          this.kc.loadFromDefault();
      }
      
      if (K8S_CONFIG.context) {
        this.kc.setCurrentContext(K8S_CONFIG.context);
      }
      
      this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
      this.connected = true;
      
      console.log('[Kubernetes] Client initialized');
    } catch (error) {
      console.warn('[Kubernetes] Failed to initialize:', error);
      this.coreApi = null as any;
      this.appsApi = null as any;
    }
  }

  static getInstance(): KubernetesClient {
    if (!KubernetesClient.instance) {
      KubernetesClient.instance = new KubernetesClient();
    }
    return KubernetesClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.coreApi.listNamespace();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取集群信息
   */
  async getClusterInfo(): Promise<{
    server: string;
    context: string;
    user: string;
  } | null> {
    if (!this.connected) return null;
    
    const currentContext = this.kc.getCurrentContext();
    const context = this.kc.getContextObject(currentContext);
    const cluster = context ? this.kc.getCluster(context.cluster) : null;
    
    return {
      server: cluster?.server || 'unknown',
      context: currentContext,
      user: context?.user || 'unknown',
    };
  }

  // ============================================================
  // 节点管理
  // ============================================================

  /**
   * 获取所有节点
   */
  async getNodes(): Promise<K8sNode[]> {
    if (!this.connected) return [];
    
    try {
      const response = await this.coreApi.listNode();
      
      return response.items.map((node) => {
        const conditions = node.status?.conditions || [];
        const readyCondition = conditions.find((c) => c.type === 'Ready');
        const roles = Object.keys(node.metadata?.labels || {})
          .filter((l) => l.startsWith('node-role.kubernetes.io/'))
          .map((l) => l.replace('node-role.kubernetes.io/', ''));
        
        return {
          name: node.metadata?.name || '',
          status: readyCondition?.status === 'True' ? 'Ready' : 'NotReady',
          roles: roles.length > 0 ? roles : ['worker'],
          version: node.status?.nodeInfo?.kubeletVersion || '',
          internalIP: node.status?.addresses?.find((a) => a.type === 'InternalIP')?.address || '',
          externalIP: node.status?.addresses?.find((a) => a.type === 'ExternalIP')?.address,
          os: node.status?.nodeInfo?.osImage || '',
          arch: node.status?.nodeInfo?.architecture || '',
          cpu: {
            capacity: node.status?.capacity?.cpu || '0',
            allocatable: node.status?.allocatable?.cpu || '0',
          },
          memory: {
            capacity: node.status?.capacity?.memory || '0',
            allocatable: node.status?.allocatable?.memory || '0',
          },
          conditions: conditions.map((c) => ({
            type: c.type,
            status: c.status,
            reason: c.reason,
            message: c.message,
          })),
          createdAt: new Date(node.metadata?.creationTimestamp || 0),
        };
      });
    } catch (error) {
      console.error('[Kubernetes] Failed to get nodes:', error);
      return [];
    }
  }

  // ============================================================
  // 命名空间管理
  // ============================================================

  /**
   * 获取所有命名空间
   */
  async getNamespaces(): Promise<K8sNamespace[]> {
    if (!this.connected) return [];
    
    try {
      const response = await this.coreApi.listNamespace();
      
      return response.items.map((ns) => ({
        name: ns.metadata?.name || '',
        status: ns.status?.phase || 'Unknown',
        labels: ns.metadata?.labels || {},
        createdAt: new Date(ns.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get namespaces:', error);
      return [];
    }
  }

  /**
   * 创建命名空间
   */
  async createNamespace(name: string, labels?: Record<string, string>): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.coreApi.createNamespace({
        body: {
          metadata: {
            name,
            labels,
          },
        },
      });
      return true;
    } catch (error) {
      console.error('[Kubernetes] Failed to create namespace:', error);
      return false;
    }
  }

  /**
   * 删除命名空间
   */
  async deleteNamespace(name: string): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.coreApi.deleteNamespace({ name });
      return true;
    } catch (error) {
      console.error('[Kubernetes] Failed to delete namespace:', error);
      return false;
    }
  }

  // ============================================================
  // Pod 管理
  // ============================================================

  /**
   * 获取 Pod 列表
   */
  async getPods(namespace?: string): Promise<K8sPod[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.coreApi.listNamespacedPod({ namespace })
        : await this.coreApi.listPodForAllNamespaces();
      
      return response.items.map((pod) => ({
        name: pod.metadata?.name || '',
        namespace: pod.metadata?.namespace || '',
        status: this.getPodStatus(pod),
        phase: pod.status?.phase || 'Unknown',
        nodeName: pod.spec?.nodeName,
        ip: pod.status?.podIP,
        containers: (pod.spec?.containers || []).map((c, i) => {
          const status = pod.status?.containerStatuses?.[i];
          return {
            name: c.name,
            image: c.image || '',
            ready: status?.ready || false,
            restartCount: status?.restartCount || 0,
            state: Object.keys(status?.state || {})[0] || 'unknown',
          };
        }),
        labels: pod.metadata?.labels || {},
        createdAt: new Date(pod.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get pods:', error);
      return [];
    }
  }

  private getPodStatus(pod: k8s.V1Pod): string {
    const phase = pod.status?.phase;
    if (phase === 'Running') {
      const allReady = pod.status?.containerStatuses?.every((c) => c.ready);
      return allReady ? 'Running' : 'NotReady';
    }
    return phase || 'Unknown';
  }

  /**
   * 删除 Pod
   */
  async deletePod(name: string, namespace: string): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.coreApi.deleteNamespacedPod({ name, namespace });
      return true;
    } catch (error) {
      console.error('[Kubernetes] Failed to delete pod:', error);
      return false;
    }
  }

  /**
   * 获取 Pod 日志
   */
  async getPodLogs(
    name: string,
    namespace: string,
    container?: string,
    tailLines?: number
  ): Promise<string> {
    if (!this.connected) return '';
    
    try {
      const response = await this.coreApi.readNamespacedPodLog({
        name,
        namespace,
        container,
        tailLines,
      });
      return response || '';
    } catch (error) {
      console.error('[Kubernetes] Failed to get pod logs:', error);
      return '';
    }
  }

  // ============================================================
  // Deployment 管理
  // ============================================================

  /**
   * 获取 Deployment 列表
   */
  async getDeployments(namespace?: string): Promise<K8sDeployment[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.appsApi.listNamespacedDeployment({ namespace })
        : await this.appsApi.listDeploymentForAllNamespaces();
      
      return response.items.map((dep) => ({
        name: dep.metadata?.name || '',
        namespace: dep.metadata?.namespace || '',
        replicas: {
          desired: dep.spec?.replicas || 0,
          ready: dep.status?.readyReplicas || 0,
          available: dep.status?.availableReplicas || 0,
          updated: dep.status?.updatedReplicas || 0,
        },
        strategy: dep.spec?.strategy?.type || 'RollingUpdate',
        selector: dep.spec?.selector?.matchLabels || {},
        labels: dep.metadata?.labels || {},
        conditions: (dep.status?.conditions || []).map((c) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
        })),
        createdAt: new Date(dep.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get deployments:', error);
      return [];
    }
  }

  /**
   * 扩缩容 Deployment
   */
  async scaleDeployment(
    name: string,
    namespace: string,
    replicas: number
  ): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.appsApi.patchNamespacedDeploymentScale({
        name,
        namespace,
        body: {
          spec: { replicas },
        },
      });
      return true;
    } catch (error) {
      console.error('[Kubernetes] Failed to scale deployment:', error);
      return false;
    }
  }

  /**
   * 重启 Deployment
   */
  async restartDeployment(name: string, namespace: string): Promise<boolean> {
    if (!this.connected) return false;
    
    try {
      await this.appsApi.patchNamespacedDeployment({
        name,
        namespace,
        body: {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
                },
              },
            },
          },
        },
      });
      return true;
    } catch (error) {
      console.error('[Kubernetes] Failed to restart deployment:', error);
      return false;
    }
  }

  // ============================================================
  // Service 管理
  // ============================================================

  /**
   * 获取 Service 列表
   */
  async getServices(namespace?: string): Promise<K8sService[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.coreApi.listNamespacedService({ namespace })
        : await this.coreApi.listServiceForAllNamespaces();
      
      return response.items.map((svc) => ({
        name: svc.metadata?.name || '',
        namespace: svc.metadata?.namespace || '',
        type: svc.spec?.type || 'ClusterIP',
        clusterIP: svc.spec?.clusterIP,
        externalIP: svc.status?.loadBalancer?.ingress?.[0]?.ip,
        ports: (svc.spec?.ports || []).map((p) => ({
          name: p.name,
          port: p.port,
          targetPort: p.targetPort as number | string,
          protocol: p.protocol || 'TCP',
          nodePort: p.nodePort,
        })),
        selector: svc.spec?.selector || {},
        createdAt: new Date(svc.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get services:', error);
      return [];
    }
  }

  // ============================================================
  // ConfigMap 和 Secret 管理
  // ============================================================

  /**
   * 获取 ConfigMap 列表
   */
  async getConfigMaps(namespace?: string): Promise<K8sConfigMap[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.coreApi.listNamespacedConfigMap({ namespace })
        : await this.coreApi.listConfigMapForAllNamespaces();
      
      return response.items.map((cm) => ({
        name: cm.metadata?.name || '',
        namespace: cm.metadata?.namespace || '',
        data: cm.data || {},
        labels: cm.metadata?.labels || {},
        createdAt: new Date(cm.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get configmaps:', error);
      return [];
    }
  }

  /**
   * 获取 Secret 列表（不返回实际值）
   */
  async getSecrets(namespace?: string): Promise<K8sSecret[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.coreApi.listNamespacedSecret({ namespace })
        : await this.coreApi.listSecretForAllNamespaces();
      
      return response.items.map((secret) => ({
        name: secret.metadata?.name || '',
        namespace: secret.metadata?.namespace || '',
        type: secret.type || 'Opaque',
        keys: Object.keys(secret.data || {}),
        labels: secret.metadata?.labels || {},
        createdAt: new Date(secret.metadata?.creationTimestamp || 0),
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get secrets:', error);
      return [];
    }
  }

  // ============================================================
  // 事件管理
  // ============================================================

  /**
   * 获取事件列表
   */
  async getEvents(namespace?: string, limit?: number): Promise<K8sEvent[]> {
    if (!this.connected) return [];
    
    try {
      const response = namespace
        ? await this.coreApi.listNamespacedEvent({ namespace })
        : await this.coreApi.listEventForAllNamespaces();
      
      const events = response.items
        .sort((a, b) => {
          const aTime = a.lastTimestamp?.getTime() || 0;
          const bTime = b.lastTimestamp?.getTime() || 0;
          return bTime - aTime;
        })
        .slice(0, limit || 100);
      
      return events.map((event) => ({
        name: event.metadata?.name || '',
        namespace: event.metadata?.namespace || '',
        type: (event.type as 'Normal' | 'Warning') || 'Normal',
        reason: event.reason || '',
        message: event.message || '',
        involvedObject: {
          kind: event.involvedObject?.kind || '',
          name: event.involvedObject?.name || '',
          namespace: event.involvedObject?.namespace,
        },
        count: event.count || 1,
        firstTimestamp: event.firstTimestamp ? new Date(event.firstTimestamp) : undefined,
        lastTimestamp: event.lastTimestamp ? new Date(event.lastTimestamp) : undefined,
      }));
    } catch (error) {
      console.error('[Kubernetes] Failed to get events:', error);
      return [];
    }
  }

  // ============================================================
  // 集群概览
  // ============================================================

  /**
   * 获取集群概览
   */
  async getClusterOverview(): Promise<{
    nodes: { total: number; ready: number };
    namespaces: number;
    pods: { total: number; running: number; pending: number; failed: number };
    deployments: { total: number; available: number };
    services: number;
    events: { warnings: number; normal: number };
  }> {
    if (!this.connected) {
      return {
        nodes: { total: 0, ready: 0 },
        namespaces: 0,
        pods: { total: 0, running: 0, pending: 0, failed: 0 },
        deployments: { total: 0, available: 0 },
        services: 0,
        events: { warnings: 0, normal: 0 },
      };
    }
    
    const [nodes, namespaces, pods, deployments, services, events] = await Promise.all([
      this.getNodes(),
      this.getNamespaces(),
      this.getPods(),
      this.getDeployments(),
      this.getServices(),
      this.getEvents(undefined, 200),
    ]);
    
    return {
      nodes: {
        total: nodes.length,
        ready: nodes.filter((n) => n.status === 'Ready').length,
      },
      namespaces: namespaces.length,
      pods: {
        total: pods.length,
        running: pods.filter((p) => p.phase === 'Running').length,
        pending: pods.filter((p) => p.phase === 'Pending').length,
        failed: pods.filter((p) => p.phase === 'Failed').length,
      },
      deployments: {
        total: deployments.length,
        available: deployments.filter((d) => d.replicas.available === d.replicas.desired).length,
      },
      services: services.length,
      events: {
        warnings: events.filter((e) => e.type === 'Warning').length,
        normal: events.filter((e) => e.type === 'Normal').length,
      },
    };
  }
}

// 导出单例
export const kubernetesClient = KubernetesClient.getInstance();
