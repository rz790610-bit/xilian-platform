/**
 * 基础设施服务层
 * 提供 K8s 集群、网络、存储、安全、CI/CD 的管理功能
 */

import {
  K8sNode,
  NodeStatus,
  NodeCondition,
  ClusterOverview,
  NetworkPolicy,
  StorageClass,
  PersistentVolume,
  PersistentVolumeClaim,
  CephClusterStatus,
  RbacRole,
  RbacBinding,
  OpaPolicy,
  VaultSecret,
  TrivyScanResult,
  FalcoAlert,
  FalcoRule,
  GitLabRunner,
  CicdPipeline,
  ArgoCdApp,
  HarborImage,
  CalicoConfig,
  IngressConfig,
  CLUSTER_NODES_CONFIG,
  STORAGE_CLASSES_CONFIG,
  CICD_STAGES_TEMPLATE,
  formatBytes,
  calculateUsagePercent,
} from '@shared/infrastructureTypes';

// ============ 内存存储（模拟 K8s API）============

const k8sNodes: Map<string, K8sNode> = new Map();
const networkPolicies: Map<string, NetworkPolicy> = new Map();
const storageClasses: Map<string, StorageClass> = new Map();
const persistentVolumes: Map<string, PersistentVolume> = new Map();
const persistentVolumeClaims: Map<string, PersistentVolumeClaim> = new Map();
const rbacRoles: Map<string, RbacRole> = new Map();
const rbacBindings: Map<string, RbacBinding> = new Map();
const opaPolicies: Map<string, OpaPolicy> = new Map();
const vaultSecrets: Map<string, VaultSecret> = new Map();
const trivyScans: Map<string, TrivyScanResult> = new Map();
const falcoAlerts: FalcoAlert[] = [];
const falcoRules: Map<string, FalcoRule> = new Map();
const gitlabRunners: Map<string, GitLabRunner> = new Map();
const cicdPipelines: Map<string, CicdPipeline> = new Map();
const argoCdApps: Map<string, ArgoCdApp> = new Map();
const harborImages: Map<string, HarborImage> = new Map();

// Calico 和 Ingress 配置
let calicoConfig: CalicoConfig = {
  ipipMode: 'CrossSubnet',
  vxlanMode: 'Never',
  natOutgoing: true,
  mtu: 1440,
  ipPools: [
    { name: 'default-ipv4-ippool', cidr: '10.244.0.0/16', blockSize: 26, nodeSelector: 'all()', disabled: false },
  ],
};

const ingressConfigs: Map<string, IngressConfig> = new Map();

// ============ 初始化默认数据 ============

function initializeDefaultData() {
  // 初始化 K8s 节点
  CLUSTER_NODES_CONFIG.forEach((nodeConfig, index) => {
    const node: K8sNode = {
      ...nodeConfig,
      id: `node-${index + 1}`,
      createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      lastHeartbeat: Date.now(),
      conditions: [
        { type: 'Ready', status: 'True', lastTransition: Date.now(), reason: 'KubeletReady', message: 'kubelet is posting ready status' },
        { type: 'MemoryPressure', status: 'False', lastTransition: Date.now(), reason: 'KubeletHasSufficientMemory', message: 'kubelet has sufficient memory available' },
        { type: 'DiskPressure', status: 'False', lastTransition: Date.now(), reason: 'KubeletHasNoDiskPressure', message: 'kubelet has no disk pressure' },
        { type: 'PIDPressure', status: 'False', lastTransition: Date.now(), reason: 'KubeletHasSufficientPID', message: 'kubelet has sufficient PID available' },
        { type: 'NetworkUnavailable', status: 'False', lastTransition: Date.now(), reason: 'CalicoIsUp', message: 'Calico is running on this node' },
      ],
    };
    k8sNodes.set(node.id, node);
  });

  // 初始化存储类
  STORAGE_CLASSES_CONFIG.forEach((scConfig, index) => {
    const sc: StorageClass = {
      ...scConfig,
      id: `sc-${index + 1}`,
    };
    storageClasses.set(sc.id, sc);
  });

  // 初始化默认 RBAC 角色
  const adminRole: RbacRole = {
    id: 'role-admin',
    name: 'cluster-admin',
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    createdAt: Date.now(),
  };
  rbacRoles.set(adminRole.id, adminRole);

  const viewerRole: RbacRole = {
    id: 'role-viewer',
    name: 'cluster-viewer',
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['get', 'list', 'watch'] }],
    createdAt: Date.now(),
  };
  rbacRoles.set(viewerRole.id, viewerRole);

  // 初始化默认 OPA 策略
  const requiredLabelsPolicy: OpaPolicy = {
    id: 'opa-required-labels',
    name: 'required-labels',
    description: '要求所有 Pod 必须包含 app 和 version 标签',
    rego: `
package kubernetes.admission
deny[msg] {
  input.request.kind.kind == "Pod"
  not input.request.object.metadata.labels.app
  msg := "Pod 必须包含 app 标签"
}
deny[msg] {
  input.request.kind.kind == "Pod"
  not input.request.object.metadata.labels.version
  msg := "Pod 必须包含 version 标签"
}`,
    enabled: true,
    enforcementAction: 'deny',
    targets: ['Pod'],
    violations: 0,
    lastEvaluated: Date.now(),
    createdAt: Date.now(),
  };
  opaPolicies.set(requiredLabelsPolicy.id, requiredLabelsPolicy);

  // 初始化默认 Falco 规则
  const shellInContainerRule: FalcoRule = {
    id: 'falco-shell-in-container',
    name: 'Terminal shell in container',
    description: '检测容器内的 shell 执行',
    condition: 'spawned_process and container and shell_procs and proc.tty != 0',
    output: 'A shell was spawned in a container (user=%user.name container=%container.name shell=%proc.name)',
    priority: 'Warning',
    enabled: true,
    tags: ['container', 'shell', 'mitre_execution'],
  };
  falcoRules.set(shellInContainerRule.id, shellInContainerRule);

  // 初始化 GitLab Runner
  const defaultRunner: GitLabRunner = {
    id: 'runner-1',
    name: 'shared-runner-01',
    description: '共享 CI/CD Runner',
    active: true,
    online: true,
    locked: false,
    runUntagged: true,
    tagList: ['docker', 'linux', 'amd64'],
    version: '16.5.0',
    revision: 'abc123',
    platform: 'linux',
    architecture: 'amd64',
    ipAddress: '10.0.0.100',
    contactedAt: Date.now(),
  };
  gitlabRunners.set(defaultRunner.id, defaultRunner);

  // 初始化 ArgoCD 应用
  const defaultApp: ArgoCdApp = {
    id: 'argocd-app-1',
    name: 'xilian-platform',
    namespace: 'argocd',
    project: 'default',
    source: {
      repoUrl: 'https://gitlab.xilian.local/platform/xilian-platform.git',
      path: 'k8s/overlays/production',
      targetRevision: 'main',
    },
    destination: {
      server: 'https://kubernetes.default.svc',
      namespace: 'xilian',
    },
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    syncPolicy: {
      automated: {
        prune: true,
        selfHeal: true,
      },
    },
    history: [],
    createdAt: Date.now(),
  };
  argoCdApps.set(defaultApp.id, defaultApp);

  // 初始化默认 Ingress
  const defaultIngress: IngressConfig = {
    id: 'ingress-1',
    name: 'xilian-ingress',
    namespace: 'xilian',
    host: 'xilian.local',
    paths: [
      { path: '/', pathType: 'Prefix', backend: { serviceName: 'xilian-frontend', servicePort: 80 } },
      { path: '/api', pathType: 'Prefix', backend: { serviceName: 'xilian-backend', servicePort: 8000 } },
    ],
    tls: {
      hosts: ['xilian.local'],
      secretName: 'xilian-tls',
    },
    annotations: {
      'kubernetes.io/ingress.class': 'nginx',
      'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
    },
    createdAt: Date.now(),
  };
  ingressConfigs.set(defaultIngress.id, defaultIngress);
}

// 初始化
initializeDefaultData();

// ============ K8s 集群管理 ============

export class InfrastructureService {
  // 获取集群概览
  static getClusterOverview(): ClusterOverview {
    const nodes = Array.from(k8sNodes.values());
    let totalCpu = 0, usedCpu = 0;
    let totalMemory = 0, usedMemory = 0;
    let totalGpu = 0, usedGpu = 0;

    nodes.forEach(node => {
      totalCpu += node.resources.cpu.allocatable;
      usedCpu += node.resources.cpu.used;
      totalMemory += node.resources.memory.allocatable;
      usedMemory += node.resources.memory.used;
      if (node.gpuInfo) {
        totalGpu += node.gpuInfo.count;
        usedGpu += node.gpuInfo.utilization.filter(u => u > 0).length;
      }
    });

    const readyNodes = nodes.filter(n => n.status === 'ready').length;
    const healthStatus = readyNodes === nodes.length ? 'healthy' : 
                        readyNodes >= nodes.length * 0.8 ? 'degraded' : 'critical';

    return {
      name: 'xilian-cluster',
      version: 'v1.28.4',
      nodeCount: nodes.length,
      podCount: nodes.reduce((sum, n) => sum + n.resources.pods.used, 0),
      namespaceCount: 12,
      totalCpu,
      usedCpu,
      totalMemory,
      usedMemory,
      totalGpu,
      usedGpu,
      healthStatus,
    };
  }

  // 获取所有节点
  static getNodes(): K8sNode[] {
    return Array.from(k8sNodes.values());
  }

  // 获取单个节点
  static getNode(id: string): K8sNode | undefined {
    return k8sNodes.get(id);
  }

  // 更新节点标签
  static updateNodeLabels(id: string, labels: Record<string, string>): K8sNode | null {
    const node = k8sNodes.get(id);
    if (!node) return null;
    node.labels = { ...node.labels, ...labels };
    return node;
  }

  // 添加节点污点
  static addNodeTaint(id: string, taint: K8sNode['taints'][0]): K8sNode | null {
    const node = k8sNodes.get(id);
    if (!node) return null;
    node.taints.push(taint);
    return node;
  }

  // 移除节点污点
  static removeNodeTaint(id: string, key: string): K8sNode | null {
    const node = k8sNodes.get(id);
    if (!node) return null;
    node.taints = node.taints.filter(t => t.key !== key);
    return node;
  }

  // 设置节点状态
  static setNodeStatus(id: string, status: NodeStatus): K8sNode | null {
    const node = k8sNodes.get(id);
    if (!node) return null;
    node.status = status;
    return node;
  }

  // 模拟资源使用更新
  static updateNodeMetrics(id: string, metrics: Partial<K8sNode['resources']>): K8sNode | null {
    const node = k8sNodes.get(id);
    if (!node) return null;
    if (metrics.cpu) node.resources.cpu = { ...node.resources.cpu, ...metrics.cpu };
    if (metrics.memory) node.resources.memory = { ...node.resources.memory, ...metrics.memory };
    if (metrics.storage) node.resources.storage = { ...node.resources.storage, ...metrics.storage };
    if (metrics.pods) node.resources.pods = { ...node.resources.pods, ...metrics.pods };
    node.lastHeartbeat = Date.now();
    return node;
  }

  // ============ 网络策略管理 ============

  static getNetworkPolicies(): NetworkPolicy[] {
    return Array.from(networkPolicies.values());
  }

  static createNetworkPolicy(policy: Omit<NetworkPolicy, 'id' | 'createdAt' | 'updatedAt'>): NetworkPolicy {
    const newPolicy: NetworkPolicy = {
      ...policy,
      id: `np-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    networkPolicies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  static deleteNetworkPolicy(id: string): boolean {
    return networkPolicies.delete(id);
  }

  static getCalicoConfig(): CalicoConfig {
    return calicoConfig;
  }

  static updateCalicoConfig(config: Partial<CalicoConfig>): CalicoConfig {
    calicoConfig = { ...calicoConfig, ...config };
    return calicoConfig;
  }

  static getIngressConfigs(): IngressConfig[] {
    return Array.from(ingressConfigs.values());
  }

  static createIngress(config: Omit<IngressConfig, 'id' | 'createdAt'>): IngressConfig {
    const newIngress: IngressConfig = {
      ...config,
      id: `ingress-${Date.now()}`,
      createdAt: Date.now(),
    };
    ingressConfigs.set(newIngress.id, newIngress);
    return newIngress;
  }

  // ============ 存储管理 ============

  static getStorageClasses(): StorageClass[] {
    return Array.from(storageClasses.values());
  }

  static createStorageClass(sc: Omit<StorageClass, 'id'>): StorageClass {
    const newSc: StorageClass = {
      ...sc,
      id: `sc-${Date.now()}`,
    };
    storageClasses.set(newSc.id, newSc);
    return newSc;
  }

  static setDefaultStorageClass(id: string): boolean {
    const sc = storageClasses.get(id);
    if (!sc) return false;
    storageClasses.forEach(s => s.isDefault = false);
    sc.isDefault = true;
    return true;
  }

  static getPersistentVolumes(): PersistentVolume[] {
    return Array.from(persistentVolumes.values());
  }

  static getPersistentVolumeClaims(): PersistentVolumeClaim[] {
    return Array.from(persistentVolumeClaims.values());
  }

  static createPVC(pvc: Omit<PersistentVolumeClaim, 'id' | 'status' | 'actualCapacity' | 'createdAt'>): PersistentVolumeClaim {
    const newPvc: PersistentVolumeClaim = {
      ...pvc,
      id: `pvc-${Date.now()}`,
      status: 'Pending',
      actualCapacity: 0,
      createdAt: Date.now(),
    };
    persistentVolumeClaims.set(newPvc.id, newPvc);
    return newPvc;
  }

  static expandPVC(id: string, newCapacity: number): PersistentVolumeClaim | null {
    const pvc = persistentVolumeClaims.get(id);
    if (!pvc) return null;
    const sc = Array.from(storageClasses.values()).find(s => s.name === pvc.storageClassName);
    if (!sc?.allowVolumeExpansion) return null;
    if (newCapacity <= pvc.requestedCapacity) return null;
    pvc.requestedCapacity = newCapacity;
    return pvc;
  }

  static getCephStatus(): CephClusterStatus {
    return {
      health: 'HEALTH_OK',
      totalCapacity: 50 * 1024 * 1024 * 1024 * 1024,
      usedCapacity: 12 * 1024 * 1024 * 1024 * 1024,
      availableCapacity: 38 * 1024 * 1024 * 1024 * 1024,
      osdCount: 15,
      osdUp: 15,
      osdIn: 15,
      pgCount: 256,
      pgActive: 256,
      pools: [
        { name: 'ssd-pool', size: 3, minSize: 2, pgNum: 64, usedBytes: 4 * 1024 * 1024 * 1024 * 1024, maxAvailBytes: 10 * 1024 * 1024 * 1024 * 1024 },
        { name: 'hdd-pool', size: 3, minSize: 2, pgNum: 128, usedBytes: 6 * 1024 * 1024 * 1024 * 1024, maxAvailBytes: 20 * 1024 * 1024 * 1024 * 1024 },
        { name: 'nvme-pool', size: 2, minSize: 1, pgNum: 64, usedBytes: 2 * 1024 * 1024 * 1024 * 1024, maxAvailBytes: 8 * 1024 * 1024 * 1024 * 1024 },
      ],
    };
  }

  // ============ 安全管理 ============

  static getRbacRoles(): RbacRole[] {
    return Array.from(rbacRoles.values());
  }

  static createRbacRole(role: Omit<RbacRole, 'id' | 'createdAt'>): RbacRole {
    const newRole: RbacRole = {
      ...role,
      id: `role-${Date.now()}`,
      createdAt: Date.now(),
    };
    rbacRoles.set(newRole.id, newRole);
    return newRole;
  }

  static getRbacBindings(): RbacBinding[] {
    return Array.from(rbacBindings.values());
  }

  static createRbacBinding(binding: Omit<RbacBinding, 'id' | 'createdAt'>): RbacBinding {
    const newBinding: RbacBinding = {
      ...binding,
      id: `binding-${Date.now()}`,
      createdAt: Date.now(),
    };
    rbacBindings.set(newBinding.id, newBinding);
    return newBinding;
  }

  static getOpaPolicies(): OpaPolicy[] {
    return Array.from(opaPolicies.values());
  }

  static createOpaPolicy(policy: Omit<OpaPolicy, 'id' | 'violations' | 'lastEvaluated' | 'createdAt'>): OpaPolicy {
    const newPolicy: OpaPolicy = {
      ...policy,
      id: `opa-${Date.now()}`,
      violations: 0,
      lastEvaluated: Date.now(),
      createdAt: Date.now(),
    };
    opaPolicies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  static toggleOpaPolicy(id: string, enabled: boolean): OpaPolicy | null {
    const policy = opaPolicies.get(id);
    if (!policy) return null;
    policy.enabled = enabled;
    return policy;
  }

  static getVaultSecrets(): VaultSecret[] {
    return Array.from(vaultSecrets.values());
  }

  static createVaultSecret(path: string, metadata: VaultSecret['metadata']['customMetadata']): VaultSecret {
    const existing = Array.from(vaultSecrets.values()).find(s => s.path === path);
    const version = existing ? existing.version + 1 : 1;
    
    const secret: VaultSecret = {
      id: `vault-${Date.now()}`,
      path,
      version,
      metadata: {
        createdTime: Date.now(),
        destroyed: false,
        customMetadata: metadata,
      },
    };
    vaultSecrets.set(secret.id, secret);
    return secret;
  }

  static setSecretRotation(id: string, interval: number): VaultSecret | null {
    const secret = vaultSecrets.get(id);
    if (!secret) return null;
    secret.rotationPolicy = {
      enabled: true,
      interval,
      lastRotation: Date.now(),
      nextRotation: Date.now() + interval * 1000,
    };
    return secret;
  }

  static getTrivyScans(): TrivyScanResult[] {
    return Array.from(trivyScans.values());
  }

  static scanImage(target: string): TrivyScanResult {
    // 模拟扫描结果
    const result: TrivyScanResult = {
      id: `scan-${Date.now()}`,
      target,
      scanTime: Date.now(),
      vulnerabilities: [
        {
          id: 'CVE-2024-0001',
          pkgName: 'openssl',
          installedVersion: '1.1.1k',
          fixedVersion: '1.1.1l',
          severity: 'HIGH',
          title: 'OpenSSL Buffer Overflow',
          description: 'A buffer overflow vulnerability in OpenSSL...',
          references: ['https://nvd.nist.gov/vuln/detail/CVE-2024-0001'],
        },
      ],
      summary: {
        critical: 0,
        high: 1,
        medium: 3,
        low: 5,
        unknown: 0,
      },
    };
    trivyScans.set(result.id, result);
    return result;
  }

  static getFalcoAlerts(limit = 100): FalcoAlert[] {
    return falcoAlerts.slice(-limit);
  }

  static addFalcoAlert(alert: Omit<FalcoAlert, 'id' | 'time'>): FalcoAlert {
    const newAlert: FalcoAlert = {
      ...alert,
      id: `alert-${Date.now()}`,
      time: Date.now(),
    };
    falcoAlerts.push(newAlert);
    if (falcoAlerts.length > 1000) {
      falcoAlerts.shift();
    }
    return newAlert;
  }

  static getFalcoRules(): FalcoRule[] {
    return Array.from(falcoRules.values());
  }

  static toggleFalcoRule(id: string, enabled: boolean): FalcoRule | null {
    const rule = falcoRules.get(id);
    if (!rule) return null;
    rule.enabled = enabled;
    return rule;
  }

  // ============ CI/CD 管理 ============

  static getGitLabRunners(): GitLabRunner[] {
    return Array.from(gitlabRunners.values());
  }

  static toggleRunner(id: string, active: boolean): GitLabRunner | null {
    const runner = gitlabRunners.get(id);
    if (!runner) return null;
    runner.active = active;
    return runner;
  }

  static getCicdPipelines(): CicdPipeline[] {
    return Array.from(cicdPipelines.values());
  }

  static createPipeline(pipeline: Omit<CicdPipeline, 'id' | 'status' | 'stages' | 'createdAt'>): CicdPipeline {
    const stages = CICD_STAGES_TEMPLATE.map(name => ({
      name,
      status: 'pending' as const,
      jobs: [{ id: `job-${name}-${Date.now()}`, name, stage: name, status: 'pending' as const }],
    }));

    const newPipeline: CicdPipeline = {
      ...pipeline,
      id: `pipeline-${Date.now()}`,
      status: 'pending',
      stages,
      createdAt: Date.now(),
    };
    cicdPipelines.set(newPipeline.id, newPipeline);
    return newPipeline;
  }

  static updatePipelineStatus(id: string, status: CicdPipeline['status']): CicdPipeline | null {
    const pipeline = cicdPipelines.get(id);
    if (!pipeline) return null;
    pipeline.status = status;
    if (status === 'running' && !pipeline.startedAt) {
      pipeline.startedAt = Date.now();
    }
    if (['success', 'failed', 'canceled'].includes(status)) {
      pipeline.finishedAt = Date.now();
      pipeline.duration = pipeline.finishedAt - (pipeline.startedAt || pipeline.createdAt);
    }
    return pipeline;
  }

  static getArgoCdApps(): ArgoCdApp[] {
    return Array.from(argoCdApps.values());
  }

  static syncArgoCdApp(id: string): ArgoCdApp | null {
    const app = argoCdApps.get(id);
    if (!app) return null;
    app.syncStatus = 'Synced';
    app.history.push({
      id: `sync-${Date.now()}`,
      revision: app.source.targetRevision,
      deployedAt: Date.now(),
      source: app.source,
    });
    return app;
  }

  static getHarborImages(): HarborImage[] {
    return Array.from(harborImages.values());
  }

  static signImage(id: string, signer: string): HarborImage | null {
    const image = harborImages.get(id);
    if (!image) return null;
    image.signed = true;
    image.signatureInfo = {
      signer,
      signedAt: Date.now(),
      verified: true,
    };
    return image;
  }

  // ============ 统计和报告 ============

  static getInfrastructureSummary() {
    const nodes = this.getNodes();
    const gpuNodes = nodes.filter(n => n.type === 'gpu');
    const cpuNodes = nodes.filter(n => n.type === 'cpu');

    return {
      cluster: this.getClusterOverview(),
      nodes: {
        total: nodes.length,
        gpu: gpuNodes.length,
        cpu: cpuNodes.length,
        ready: nodes.filter(n => n.status === 'ready').length,
      },
      storage: {
        classes: this.getStorageClasses().length,
        pvs: this.getPersistentVolumes().length,
        pvcs: this.getPersistentVolumeClaims().length,
        ceph: this.getCephStatus(),
      },
      security: {
        roles: this.getRbacRoles().length,
        bindings: this.getRbacBindings().length,
        policies: this.getOpaPolicies().length,
        secrets: this.getVaultSecrets().length,
        alerts: this.getFalcoAlerts().length,
      },
      cicd: {
        runners: this.getGitLabRunners().length,
        pipelines: this.getCicdPipelines().length,
        apps: this.getArgoCdApps().length,
        images: this.getHarborImages().length,
      },
    };
  }
}

export default InfrastructureService;
