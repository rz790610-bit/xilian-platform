/**
 * 基础设施层类型定义
 * 涵盖 K8s 集群、网络策略、存储管理、安全体系、CI/CD 流水线
 */

// ============ K8s 集群管理 ============

/** 节点类型 */
export type NodeType = 'gpu' | 'cpu' | 'storage';

/** 节点状态 */
export type NodeStatus = 'ready' | 'not_ready' | 'scheduling_disabled' | 'unknown';

/** GPU 类型 */
export type GpuType = 'nvidia-a100' | 'nvidia-v100' | 'nvidia-t4' | 'nvidia-3090';

/** K8s 节点配置 */
export interface K8sNode {
  id: string;
  name: string;
  type: NodeType;
  status: NodeStatus;
  labels: Record<string, string>;
  taints: NodeTaint[];
  resources: NodeResources;
  gpuInfo?: GpuInfo;
  conditions: NodeCondition[];
  createdAt: number;
  lastHeartbeat: number;
}

/** 节点污点 */
export interface NodeTaint {
  key: string;
  value: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

/** 节点资源 */
export interface NodeResources {
  cpu: {
    capacity: number;      // 核心数
    allocatable: number;
    used: number;
  };
  memory: {
    capacity: number;      // 字节
    allocatable: number;
    used: number;
  };
  storage: {
    capacity: number;      // 字节
    allocatable: number;
    used: number;
  };
  pods: {
    capacity: number;
    allocatable: number;
    used: number;
  };
}

/** GPU 信息 */
export interface GpuInfo {
  type: GpuType;
  count: number;
  memory: number;          // 单卡显存（字节）
  driver: string;
  cuda: string;
  utilization: number[];   // 每卡利用率
  temperature: number[];   // 每卡温度
}

/** 节点状态条件 */
export interface NodeCondition {
  type: 'Ready' | 'MemoryPressure' | 'DiskPressure' | 'PIDPressure' | 'NetworkUnavailable';
  status: 'True' | 'False' | 'Unknown';
  lastTransition: number;
  reason: string;
  message: string;
}

/** 集群概览 */
export interface ClusterOverview {
  name: string;
  version: string;
  nodeCount: number;
  podCount: number;
  namespaceCount: number;
  totalCpu: number;
  usedCpu: number;
  totalMemory: number;
  usedMemory: number;
  totalGpu: number;
  usedGpu: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

// ============ 网络策略（Calico CNI）============

/** 网络策略类型 */
export type NetworkPolicyType = 'ingress' | 'egress' | 'both';

/** 网络策略 */
export interface NetworkPolicy {
  id: string;
  name: string;
  namespace: string;
  type: NetworkPolicyType;
  podSelector: Record<string, string>;
  ingressRules: NetworkRule[];
  egressRules: NetworkRule[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 网络规则 */
export interface NetworkRule {
  id: string;
  from?: PodSelector[];
  to?: PodSelector[];
  ports: NetworkPort[];
}

/** Pod 选择器 */
export interface PodSelector {
  podSelector?: Record<string, string>;
  namespaceSelector?: Record<string, string>;
  ipBlock?: {
    cidr: string;
    except?: string[];
  };
}

/** 网络端口 */
export interface NetworkPort {
  protocol: 'TCP' | 'UDP' | 'SCTP';
  port: number;
  endPort?: number;
}

/** Calico 配置 */
export interface CalicoConfig {
  ipipMode: 'Always' | 'CrossSubnet' | 'Never';
  vxlanMode: 'Always' | 'CrossSubnet' | 'Never';
  natOutgoing: boolean;
  mtu: number;
  ipPools: IpPool[];
}

/** IP 池 */
export interface IpPool {
  name: string;
  cidr: string;
  blockSize: number;
  nodeSelector: string;
  disabled: boolean;
}

/** Ingress 配置 */
export interface IngressConfig {
  id: string;
  name: string;
  namespace: string;
  host: string;
  paths: IngressPath[];
  tls?: IngressTls;
  annotations: Record<string, string>;
  createdAt: number;
}

/** Ingress 路径 */
export interface IngressPath {
  path: string;
  pathType: 'Prefix' | 'Exact' | 'ImplementationSpecific';
  backend: {
    serviceName: string;
    servicePort: number;
  };
}

/** Ingress TLS */
export interface IngressTls {
  hosts: string[];
  secretName: string;
}

// ============ 存储管理（Rook-Ceph）============

/** 存储类型 */
export type StorageClassType = 'ssd-fast' | 'hdd-standard' | 'nvme-ultra';

/** 存储类 */
export interface StorageClass {
  id: string;
  name: string;
  type: StorageClassType;
  provisioner: string;
  reclaimPolicy: 'Delete' | 'Retain' | 'Recycle';
  volumeBindingMode: 'Immediate' | 'WaitForFirstConsumer';
  allowVolumeExpansion: boolean;
  parameters: Record<string, string>;
  isDefault: boolean;
}

/** PV 状态 */
export type PVStatus = 'Available' | 'Bound' | 'Released' | 'Failed';

/** 持久卷 */
export interface PersistentVolume {
  id: string;
  name: string;
  capacity: number;        // 字节
  accessModes: ('ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany')[];
  storageClassName: string;
  status: PVStatus;
  claimRef?: {
    namespace: string;
    name: string;
  };
  createdAt: number;
}

/** PVC 状态 */
export type PVCStatus = 'Pending' | 'Bound' | 'Lost';

/** 持久卷声明 */
export interface PersistentVolumeClaim {
  id: string;
  name: string;
  namespace: string;
  storageClassName: string;
  accessModes: ('ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany')[];
  requestedCapacity: number;
  actualCapacity: number;
  status: PVCStatus;
  volumeName?: string;
  createdAt: number;
}

/** Ceph 集群状态 */
export interface CephClusterStatus {
  health: 'HEALTH_OK' | 'HEALTH_WARN' | 'HEALTH_ERR';
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  osdCount: number;
  osdUp: number;
  osdIn: number;
  pgCount: number;
  pgActive: number;
  pools: CephPool[];
}

/** Ceph 存储池 */
export interface CephPool {
  name: string;
  size: number;
  minSize: number;
  pgNum: number;
  usedBytes: number;
  maxAvailBytes: number;
}

// ============ 安全体系 ============

/** RBAC 角色 */
export interface RbacRole {
  id: string;
  name: string;
  namespace?: string;      // null 表示 ClusterRole
  rules: RbacRule[];
  createdAt: number;
}

/** RBAC 规则 */
export interface RbacRule {
  apiGroups: string[];
  resources: string[];
  verbs: ('get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete' | '*')[];
  resourceNames?: string[];
}

/** RBAC 绑定 */
export interface RbacBinding {
  id: string;
  name: string;
  namespace?: string;
  roleRef: {
    kind: 'Role' | 'ClusterRole';
    name: string;
  };
  subjects: RbacSubject[];
  createdAt: number;
}

/** RBAC 主体 */
export interface RbacSubject {
  kind: 'User' | 'Group' | 'ServiceAccount';
  name: string;
  namespace?: string;
}

/** OPA 策略 */
export interface OpaPolicy {
  id: string;
  name: string;
  description: string;
  rego: string;            // Rego 策略代码
  enabled: boolean;
  enforcementAction: 'deny' | 'warn' | 'dryrun';
  targets: string[];       // 目标资源类型
  violations: number;
  lastEvaluated: number;
  createdAt: number;
}

/** Vault 密钥 */
export interface VaultSecret {
  id: string;
  path: string;
  version: number;
  metadata: {
    createdTime: number;
    deletionTime?: number;
    destroyed: boolean;
    customMetadata: Record<string, string>;
  };
  rotationPolicy?: {
    enabled: boolean;
    interval: number;      // 秒
    lastRotation: number;
    nextRotation: number;
  };
}

/** Trivy 扫描结果 */
export interface TrivyScanResult {
  id: string;
  target: string;          // 镜像名称
  scanTime: number;
  vulnerabilities: TrivyVulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
}

/** Trivy 漏洞 */
export interface TrivyVulnerability {
  id: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  title: string;
  description: string;
  references: string[];
}

/** Falco 告警 */
export interface FalcoAlert {
  id: string;
  time: number;
  rule: string;
  priority: 'Emergency' | 'Alert' | 'Critical' | 'Error' | 'Warning' | 'Notice' | 'Info' | 'Debug';
  output: string;
  outputFields: Record<string, unknown>;
  source: string;
  hostname: string;
  containerInfo?: {
    id: string;
    name: string;
    image: string;
  };
}

/** Falco 规则 */
export interface FalcoRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  output: string;
  priority: FalcoAlert['priority'];
  enabled: boolean;
  tags: string[];
}

// ============ CI/CD 流水线 ============

/** 流水线状态 */
export type PipelineStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled';

/** GitLab Runner */
export interface GitLabRunner {
  id: string;
  name: string;
  description: string;
  active: boolean;
  online: boolean;
  locked: boolean;
  runUntagged: boolean;
  tagList: string[];
  version: string;
  revision: string;
  platform: string;
  architecture: string;
  ipAddress: string;
  contactedAt: number;
}

/** CI/CD 流水线 */
export interface CicdPipeline {
  id: string;
  projectId: string;
  projectName: string;
  ref: string;             // 分支/标签
  sha: string;             // commit SHA
  status: PipelineStatus;
  stages: PipelineStage[];
  source: 'push' | 'web' | 'trigger' | 'schedule' | 'api' | 'merge_request';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  duration?: number;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
}

/** 流水线阶段 */
export interface PipelineStage {
  name: string;
  status: PipelineStatus;
  jobs: PipelineJob[];
}

/** 流水线任务 */
export interface PipelineJob {
  id: string;
  name: string;
  stage: string;
  status: PipelineStatus;
  startedAt?: number;
  finishedAt?: number;
  duration?: number;
  runner?: string;
  artifacts?: JobArtifact[];
  logs?: string;
}

/** 任务产物 */
export interface JobArtifact {
  filename: string;
  size: number;
  fileType: string;
  expireAt?: number;
}

/** ArgoCD 应用 */
export interface ArgoCdApp {
  id: string;
  name: string;
  namespace: string;
  project: string;
  source: {
    repoUrl: string;
    path: string;
    targetRevision: string;
  };
  destination: {
    server: string;
    namespace: string;
  };
  syncStatus: 'Synced' | 'OutOfSync' | 'Unknown';
  healthStatus: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown';
  syncPolicy?: {
    automated?: {
      prune: boolean;
      selfHeal: boolean;
    };
  };
  history: SyncHistory[];
  createdAt: number;
}

/** 同步历史 */
export interface SyncHistory {
  id: string;
  revision: string;
  deployedAt: number;
  source: ArgoCdApp['source'];
}

/** Harbor 镜像 */
export interface HarborImage {
  id: string;
  name: string;
  projectName: string;
  digest: string;
  tags: HarborTag[];
  size: number;
  pushTime: number;
  pullTime?: number;
  signed: boolean;
  signatureInfo?: {
    signer: string;
    signedAt: number;
    verified: boolean;
  };
  scanStatus?: 'not_scanned' | 'scanning' | 'finished' | 'error';
  vulnerabilities?: TrivyScanResult['summary'];
}

/** Harbor 标签 */
export interface HarborTag {
  name: string;
  pushTime: number;
  pullTime?: number;
  immutable: boolean;
}

// ============ 预定义配置 ============

/** 预定义的 5 节点集群配置 */
export const CLUSTER_NODES_CONFIG: Omit<K8sNode, 'id' | 'createdAt' | 'lastHeartbeat' | 'conditions'>[] = [
  {
    name: 'gpu-node-01',
    type: 'gpu',
    status: 'ready',
    labels: { 'node-role.kubernetes.io/gpu': 'true', 'nvidia.com/gpu.product': 'A100-SXM4-80GB' },
    taints: [{ key: 'nvidia.com/gpu', value: 'true', effect: 'NoSchedule' }],
    resources: {
      cpu: { capacity: 128, allocatable: 120, used: 0 },
      memory: { capacity: 1024 * 1024 * 1024 * 1024, allocatable: 1000 * 1024 * 1024 * 1024, used: 0 },
      storage: { capacity: 10 * 1024 * 1024 * 1024 * 1024, allocatable: 9.5 * 1024 * 1024 * 1024 * 1024, used: 0 },
      pods: { capacity: 250, allocatable: 250, used: 0 },
    },
    gpuInfo: {
      type: 'nvidia-a100',
      count: 8,
      memory: 80 * 1024 * 1024 * 1024,
      driver: '535.104.05',
      cuda: '12.2',
      utilization: [0, 0, 0, 0, 0, 0, 0, 0],
      temperature: [35, 36, 35, 37, 36, 35, 36, 35],
    },
  },
  {
    name: 'gpu-node-02',
    type: 'gpu',
    status: 'ready',
    labels: { 'node-role.kubernetes.io/gpu': 'true', 'nvidia.com/gpu.product': 'A100-SXM4-80GB' },
    taints: [{ key: 'nvidia.com/gpu', value: 'true', effect: 'NoSchedule' }],
    resources: {
      cpu: { capacity: 128, allocatable: 120, used: 0 },
      memory: { capacity: 1024 * 1024 * 1024 * 1024, allocatable: 1000 * 1024 * 1024 * 1024, used: 0 },
      storage: { capacity: 10 * 1024 * 1024 * 1024 * 1024, allocatable: 9.5 * 1024 * 1024 * 1024 * 1024, used: 0 },
      pods: { capacity: 250, allocatable: 250, used: 0 },
    },
    gpuInfo: {
      type: 'nvidia-a100',
      count: 8,
      memory: 80 * 1024 * 1024 * 1024,
      driver: '535.104.05',
      cuda: '12.2',
      utilization: [0, 0, 0, 0, 0, 0, 0, 0],
      temperature: [34, 35, 36, 35, 34, 36, 35, 34],
    },
  },
  {
    name: 'cpu-node-01',
    type: 'cpu',
    status: 'ready',
    labels: { 'node-role.kubernetes.io/worker': 'true', 'node.kubernetes.io/instance-type': 'cpu-64c-256g' },
    taints: [],
    resources: {
      cpu: { capacity: 64, allocatable: 60, used: 0 },
      memory: { capacity: 256 * 1024 * 1024 * 1024, allocatable: 250 * 1024 * 1024 * 1024, used: 0 },
      storage: { capacity: 10 * 1024 * 1024 * 1024 * 1024, allocatable: 9.5 * 1024 * 1024 * 1024 * 1024, used: 0 },
      pods: { capacity: 250, allocatable: 250, used: 0 },
    },
  },
  {
    name: 'cpu-node-02',
    type: 'cpu',
    status: 'ready',
    labels: { 'node-role.kubernetes.io/worker': 'true', 'node.kubernetes.io/instance-type': 'cpu-64c-256g' },
    taints: [],
    resources: {
      cpu: { capacity: 64, allocatable: 60, used: 0 },
      memory: { capacity: 256 * 1024 * 1024 * 1024, allocatable: 250 * 1024 * 1024 * 1024, used: 0 },
      storage: { capacity: 10 * 1024 * 1024 * 1024 * 1024, allocatable: 9.5 * 1024 * 1024 * 1024 * 1024, used: 0 },
      pods: { capacity: 250, allocatable: 250, used: 0 },
    },
  },
  {
    name: 'cpu-node-03',
    type: 'cpu',
    status: 'ready',
    labels: { 'node-role.kubernetes.io/worker': 'true', 'node.kubernetes.io/instance-type': 'cpu-64c-256g' },
    taints: [],
    resources: {
      cpu: { capacity: 64, allocatable: 60, used: 0 },
      memory: { capacity: 256 * 1024 * 1024 * 1024, allocatable: 250 * 1024 * 1024 * 1024, used: 0 },
      storage: { capacity: 10 * 1024 * 1024 * 1024 * 1024, allocatable: 9.5 * 1024 * 1024 * 1024 * 1024, used: 0 },
      pods: { capacity: 250, allocatable: 250, used: 0 },
    },
  },
];

/** 预定义的存储类 */
export const STORAGE_CLASSES_CONFIG: Omit<StorageClass, 'id'>[] = [
  {
    name: 'ssd-fast',
    type: 'ssd-fast',
    provisioner: 'rook-ceph.rbd.csi.ceph.com',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
    parameters: {
      clusterID: 'rook-ceph',
      pool: 'ssd-pool',
      imageFormat: '2',
      imageFeatures: 'layering',
    },
    isDefault: false,
  },
  {
    name: 'hdd-standard',
    type: 'hdd-standard',
    provisioner: 'rook-ceph.rbd.csi.ceph.com',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'WaitForFirstConsumer',
    allowVolumeExpansion: true,
    parameters: {
      clusterID: 'rook-ceph',
      pool: 'hdd-pool',
      imageFormat: '2',
      imageFeatures: 'layering',
    },
    isDefault: true,
  },
  {
    name: 'nvme-ultra',
    type: 'nvme-ultra',
    provisioner: 'rook-ceph.rbd.csi.ceph.com',
    reclaimPolicy: 'Retain',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
    parameters: {
      clusterID: 'rook-ceph',
      pool: 'nvme-pool',
      imageFormat: '2',
      imageFeatures: 'layering,fast-diff,object-map,deep-flatten',
    },
    isDefault: false,
  },
];

/** CI/CD 流水线阶段模板 */
export const CICD_STAGES_TEMPLATE: string[] = ['lint', 'test', 'build', 'scan', 'push'];

/** 工具函数：格式化字节 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/** 工具函数：计算资源使用率 */
export function calculateUsagePercent(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

/** 工具函数：获取健康状态颜色 */
export function getHealthColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'ready':
    case 'HEALTH_OK':
    case 'Synced':
    case 'Healthy':
      return 'oklch(0.65 0.18 145)'; // green
    case 'degraded':
    case 'HEALTH_WARN':
    case 'Progressing':
      return 'oklch(0.65 0.18 60)';  // yellow
    case 'critical':
    case 'not_ready':
    case 'HEALTH_ERR':
    case 'Degraded':
    case 'OutOfSync':
      return 'oklch(0.65 0.18 25)';  // red
    default:
      return 'oklch(0.65 0.18 240)'; // blue
  }
}
