import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import {
  Server, Cpu, HardDrive, Network, Shield, GitBranch,
  RefreshCw, Plus, Settings2, Activity, Database, Lock,
  Eye, Play, Square, AlertTriangle, CheckCircle, XCircle,
  Layers, Box, Container, Cloud, Key, Scan, Bell
} from 'lucide-react';

// 格式化字节
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 计算百分比
function calcPercent(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

export default function Infrastructure() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('cluster');
  const [showCreatePolicyDialog, setShowCreatePolicyDialog] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    namespace: 'default',
    type: 'ingress' as 'ingress' | 'egress' | 'both',
  });

  // tRPC 查询
  const { data: summary, refetch: refetchSummary } = trpc.infrastructure.getSummary.useQuery();
  const { data: nodes, refetch: refetchNodes } = trpc.infrastructure.getNodes.useQuery();
  const { data: storageClasses } = trpc.infrastructure.getStorageClasses.useQuery();
  const cephStatus: any = null;
  const { data: networkPolicies } = trpc.infrastructure.getNetworkPolicies.useQuery();
  const calicoConfig: any = null;
  const ingressConfigs: any[] = [];
  const { data: rbacRoles } = trpc.infrastructure.getRBACRoles.useQuery();
  const { data: opaPolicies } = trpc.infrastructure.getSecurityPolicies.useQuery();
  // 以下查询在真实服务中尚未实现，使用空数据
  const vaultSecrets: any[] = [];
  const trivyScans: any[] = [];
  const falcoAlerts: any[] = [];
  const runners: any[] = [];
  const { data: pipelines } = trpc.infrastructure.getCICDPipelines.useQuery();
  const { data: argoCdApps } = trpc.infrastructure.listApplications.useQuery();

  // Mutations
  const createNetworkPolicyMutation = trpc.infrastructure.createNetworkPolicy.useMutation({
    onSuccess: () => {
      toast.success('网络策略已创建');
      setShowCreatePolicyDialog(false);
      setNewPolicy({ name: '', namespace: 'default', type: 'ingress' });
    },
    onError: (error: any) => {
      toast.error(`创建失败: ${error.message}`);
    }
  });

  const deleteNetworkPolicyMutation = trpc.infrastructure.deleteNetworkPolicy.useMutation({
    onSuccess: () => {
      toast.success('网络策略已删除');
    },
    onError: (error: any) => {
      toast.error(`删除失败: ${error.message}`);
    }
  });

  const syncArgoCdAppMutation = trpc.infrastructure.syncApplication.useMutation({
    onSuccess: () => {
      toast.success('ArgoCD 应用已同步');
    },
    onError: (error: any) => {
      toast.error(`同步失败: ${error.message}`);
    }
  });

  const toggleRunnerMutation = trpc.infrastructure.triggerPipeline.useMutation({
    onSuccess: () => {
      toast.success('Runner 状态已更新');
    },
    onError: (error: any) => {
      toast.error(`更新失败: ${error.message}`);
    }
  });

  // 刷新所有数据
  const handleRefresh = () => {
    refetchSummary();
    refetchNodes();
    toast.success('数据已刷新');
  };

  // 创建网络策略
  const handleCreatePolicy = () => {
    if (!newPolicy.name) {
      toast.error('请输入策略名称');
      return;
    }
    createNetworkPolicyMutation.mutate({
      name: newPolicy.name,
      namespace: newPolicy.namespace,
      type: newPolicy.type,
      podSelector: {},
      ingressRules: [],
      egressRules: [],
    } as any);
  };

  const cluster = summary?.cluster;

  return (
    <MainLayout title="基础设施管理">
      {/* 概览统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          label="节点"
          value={(summary as any)?.nodes?.total ?? (summary?.cluster as any)?.nodes ?? 0}
          icon="🖥️"
        />
        <StatCard
          label="GPU 节点"
          value={(summary as any)?.nodes?.gpu ?? 0}
          icon="🎮"
        />
        <StatCard
          label="存储类"
          value={summary?.storage.classes || 0}
          icon="💾"
        />
        <StatCard
          label="安全策略"
          value={summary?.security.policies || 0}
          icon="🛡️"
        />
        <StatCard
          label="Runner"
          value={(summary?.cicd as any)?.runners || 0}
          icon="⚡"
        />
        <StatCard
          label="ArgoCD 应用"
          value={(summary?.cicd as any)?.apps || 0}
          icon="☁️"
        />
      </div>

      {/* 主要内容区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="cluster">
            <Server className="w-4 h-4 mr-2" />
            集群
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network className="w-4 h-4 mr-2" />
            网络
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="w-4 h-4 mr-2" />
            存储
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="w-4 h-4 mr-2" />
            安全
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <GitBranch className="w-4 h-4 mr-2" />
            CI/CD
          </TabsTrigger>
        </TabsList>

        {/* 集群管理 */}
        <TabsContent value="cluster">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 集群概览 */}
            <PageCard title="集群概览" icon={<Activity className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">集群名称</span>
                  <span className="font-medium">{(cluster as any)?.name || 'xilian-cluster'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">K8s 版本</span>
                  <span className="font-medium">{(cluster as any)?.version || 'v1.28.4'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">健康状态</span>
                  <Badge variant={(cluster as any)?.healthStatus === 'healthy' ? 'success' : 'warning'}>
                    {(cluster as any)?.healthStatus === 'healthy' ? '健康' : '降级'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>CPU 使用率</span>
                    <span>{calcPercent((cluster as any)?.usedCpu || 0, (cluster as any)?.totalCpu || 1)}%</span>
                  </div>
                  <Progress value={calcPercent((cluster as any)?.usedCpu || 0, (cluster as any)?.totalCpu || 1)} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>内存使用率</span>
                    <span>{calcPercent((cluster as any)?.usedMemory || 0, (cluster as any)?.totalMemory || 1)}%</span>
                  </div>
                  <Progress value={calcPercent((cluster as any)?.usedMemory || 0, (cluster as any)?.totalMemory || 1)} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>GPU 使用率</span>
                    <span>{calcPercent((cluster as any)?.usedGpu || 0, (cluster as any)?.totalGpu || 1)}%</span>
                  </div>
                  <Progress value={calcPercent((cluster as any)?.usedGpu || 0, (cluster as any)?.totalGpu || 1)} className="bg-purple-100" />
                </div>
              </div>
            </PageCard>

            {/* 节点列表 */}
            <PageCard title="节点列表" icon={<Server className="w-5 h-5" />}>
              <div className="space-y-3">
                {nodes?.map((node: any) => (
                  <div key={node.id} className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {node.type === 'gpu' ? (
                          <Cpu className="w-4 h-4 text-purple-500" />
                        ) : (
                          <Server className="w-4 h-4 text-blue-500" />
                        )}
                        <span className="font-medium">{node.name}</span>
                      </div>
                      <Badge variant={node.status === 'ready' ? 'success' : 'warning'}>
                        {node.status === 'ready' ? '就绪' : '未就绪'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span>CPU: </span>
                        <span className="text-foreground">
                          {node.resources?.cpu?.used ?? node.cpu?.used ?? 0}/{node.resources?.cpu?.allocatable ?? node.cpu?.allocatable ?? 0}
                        </span>
                      </div>
                      <div>
                        <span>内存: </span>
                        <span className="text-foreground">
                          {formatBytes(node.resources?.memory?.used ?? node.memory?.used ?? 0)}/{formatBytes(node.resources?.memory?.allocatable ?? node.memory?.allocatable ?? 0)}
                        </span>
                      </div>
                      {(node as any).gpuInfo && (
                        <div>
                          <span>GPU: </span>
                          <span className="text-foreground">{(node as any).gpuInfo.count}x A100</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 网络管理 */}
        <TabsContent value="network">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Calico CNI 配置 */}
            <PageCard title="Calico CNI 配置" icon={<Network className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">IPIP 模式</span>
                  <Badge>{calicoConfig?.ipipMode || 'CrossSubnet'}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">VXLAN 模式</span>
                  <Badge variant="default">{calicoConfig?.vxlanMode || 'Never'}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">NAT Outgoing</span>
                  <Switch checked={calicoConfig?.natOutgoing} disabled />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">MTU</span>
                  <span className="font-medium">{calicoConfig?.mtu || 1440}</span>
                </div>
                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium mb-2">IP 池</h4>
                  {calicoConfig?.ipPools?.map((pool: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{pool.name}</span>
                      <span className="text-muted-foreground">{pool.cidr}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PageCard>

            {/* Ingress 配置 */}
            <PageCard title="NGINX Ingress" icon={<Layers className="w-5 h-5" />}>
              <div className="space-y-3">
                {ingressConfigs?.map((ingress: any) => (
                  <div key={ingress.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{ingress.name}</span>
                      <Badge variant="default">{ingress.namespace}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Host: <span className="text-foreground">{ingress.host}</span>
                    </div>
                    <div className="space-y-1">
                      {ingress.paths.map((path: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span>{path.path}</span>
                          <span className="text-muted-foreground">
                            → {path.backend.serviceName}:{path.backend.servicePort}
                          </span>
                        </div>
                      ))}
                    </div>
                    {ingress.tls && (
                      <div className="mt-2 pt-2 border-t flex items-center gap-1 text-xs text-green-600">
                        <Lock className="w-3 h-3" />
                        TLS 已启用
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </PageCard>

            {/* NetworkPolicy */}
            <PageCard title="NetworkPolicy 微隔离" icon={<Shield className="w-5 h-5" />} className="lg:col-span-2">
              <div className="text-center py-8 text-muted-foreground">
                {networkPolicies?.length === 0 ? (
                  <div>
                    <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无网络策略</p>
                    <Button variant="default" size="sm" className="mt-4" onClick={() => setShowCreatePolicyDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      创建策略
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {networkPolicies?.map((policy: any) => (
                      <div key={policy.id} className="p-4 rounded-lg border text-left">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{policy.name}</span>
                          <Badge variant={policy.enabled ? 'success' : 'default'}>
                            {policy.enabled ? '启用' : '禁用'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          命名空间: {policy.namespace}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 存储管理 */}
        <TabsContent value="storage">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ceph 集群状态 */}
            <PageCard title="Rook-Ceph 集群" icon={<Database className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">集群健康</span>
                  <Badge variant={cephStatus?.health === 'HEALTH_OK' ? 'success' : 'warning'}>
                    {cephStatus?.health || 'HEALTH_OK'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>存储使用</span>
                    <span>
                      {formatBytes(cephStatus?.usedCapacity || 0)} / {formatBytes(cephStatus?.totalCapacity || 0)}
                    </span>
                  </div>
                  <Progress 
                    value={calcPercent(cephStatus?.usedCapacity || 0, cephStatus?.totalCapacity || 1)} 
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center pt-2 border-t">
                  <div>
                    <div className="text-2xl font-bold">{cephStatus?.osdCount || 0}</div>
                    <div className="text-xs text-muted-foreground">OSD 总数</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{cephStatus?.osdUp || 0}</div>
                    <div className="text-xs text-muted-foreground">OSD Up</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{cephStatus?.pgCount || 0}</div>
                    <div className="text-xs text-muted-foreground">PG 总数</div>
                  </div>
                </div>
              </div>
            </PageCard>

            {/* 存储类 */}
            <PageCard title="StorageClass" icon={<HardDrive className="w-5 h-5" />}>
              <div className="space-y-3">
                {storageClasses?.map(sc => (
                  <div key={sc.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Box className="w-4 h-4" />
                        <span className="font-medium">{sc.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sc.isDefault && <Badge variant="success">默认</Badge>}
                        <Badge variant="default">{sc.reclaimPolicy}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Provisioner: {sc.provisioner.split('/').pop()}</div>
                      <div>绑定模式: {sc.volumeBindingMode}</div>
                      <div>动态扩容: {sc.allowVolumeExpansion ? '✓' : '✗'}</div>
                      <div>类型: {sc.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* Ceph 存储池 */}
            <PageCard title="存储池" icon={<Container className="w-5 h-5" />} className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cephStatus?.pools?.map((pool: any) => (
                  <div key={pool.name} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{pool.name}</span>
                      <Badge variant="default">副本 x{pool.size}</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">已用</span>
                        <span>{formatBytes(pool.usedBytes)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">可用</span>
                        <span>{formatBytes(pool.maxAvailBytes)}</span>
                      </div>
                      <Progress value={calcPercent(pool.usedBytes, pool.usedBytes + pool.maxAvailBytes)} />
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 安全管理 */}
        <TabsContent value="security">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* RBAC 角色 */}
            <PageCard title="RBAC 角色" icon={<Lock className="w-5 h-5" />}>
              <div className="space-y-3">
                {rbacRoles?.map((role: any) => (
                  <div key={role.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{role.name}</span>
                      <Badge variant={role.namespace ? 'default' : 'default'}>
                        {role.namespace || 'ClusterRole'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {role.rules.length} 条规则
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* OPA 策略 */}
            <PageCard title="OPA 策略" icon={<Shield className="w-5 h-5" />}>
              <div className="space-y-3">
                {opaPolicies?.map((policy: any) => (
                  <div key={policy.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{policy.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={policy.enabled ? 'success' : 'default'}>
                          {policy.enabled ? '启用' : '禁用'}
                        </Badge>
                        <Badge variant={
                          policy.enforcementAction === 'deny' ? 'danger' :
                          policy.enforcementAction === 'warn' ? 'warning' : 'default'
                        }>
                          {policy.enforcementAction}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{policy.description}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span>目标: {policy.targets.join(', ')}</span>
                      <span className="text-red-500">违规: {policy.violations}</span>
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* Vault 密钥 */}
            <PageCard title="Vault 密钥管理" icon={<Key className="w-5 h-5" />}>
              <div className="space-y-3">
                {vaultSecrets?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无密钥</p>
                  </div>
                ) : (
                  vaultSecrets?.map((secret: any) => (
                    <div key={secret.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium font-mono text-sm">{secret.path}</span>
                        <Badge variant="default">v{secret.version}</Badge>
                      </div>
                      {secret.rotationPolicy?.enabled && (
                        <div className="text-xs text-muted-foreground">
                          自动轮换: 每 {secret.rotationPolicy.interval / 3600} 小时
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </PageCard>

            {/* Trivy 扫描 */}
            <PageCard title="Trivy 镜像扫描" icon={<Scan className="w-5 h-5" />}>
              <div className="space-y-3">
                {trivyScans?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Scan className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无扫描记录</p>
                    <Button variant="default" size="sm" className="mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      扫描镜像
                    </Button>
                  </div>
                ) : (
                  trivyScans?.map((scan: any) => (
                    <div key={scan.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium font-mono text-sm">{scan.target}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {scan.summary.critical > 0 && (
                          <Badge variant="danger">严重 {scan.summary.critical}</Badge>
                        )}
                        {scan.summary.high > 0 && (
                          <Badge variant="warning">高危 {scan.summary.high}</Badge>
                        )}
                        {scan.summary.medium > 0 && (
                          <Badge variant="default">中危 {scan.summary.medium}</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PageCard>

            {/* Falco 告警 */}
            <PageCard title="Falco 运行时监控" icon={<Bell className="w-5 h-5" />} className="lg:col-span-2">
              <div className="space-y-3">
                {falcoAlerts?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                    <p>无安全告警</p>
                  </div>
                ) : (
                  falcoAlerts?.slice(0, 5).map((alert: any) => (
                    <div key={alert.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{alert.rule}</span>
                        <Badge variant={
                          ['Emergency', 'Alert', 'Critical'].includes(alert.priority) ? 'danger' :
                          ['Error', 'Warning'].includes(alert.priority) ? 'warning' : 'default'
                        }>
                          {alert.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.output}</p>
                    </div>
                  ))
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* CI/CD 管理 */}
        <TabsContent value="cicd">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GitLab Runner */}
            <PageCard title="GitLab Runner" icon={<Play className="w-5 h-5" />}>
              <div className="space-y-3">
                {runners?.map((runner: any) => (
                  <div key={runner.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          runner.online ? "bg-green-500" : "bg-gray-400"
                        )} />
                        <span className="font-medium">{runner.name}</span>
                      </div>
                      <Badge variant={runner.active ? 'success' : 'default'}>
                        {runner.active ? '活跃' : '暂停'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>版本: {runner.version}</div>
                      <div>平台: {runner.platform}/{runner.architecture}</div>
                      <div className="col-span-2">
                        标签: {runner.tagList.join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* ArgoCD 应用 */}
            <PageCard title="ArgoCD GitOps" icon={<Cloud className="w-5 h-5" />}>
              <div className="space-y-3">
                {argoCdApps?.map((app: any) => (
                  <div key={app.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{app.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={app.syncStatus === 'Synced' ? 'success' : 'warning'}>
                          {app.syncStatus}
                        </Badge>
                        <Badge variant={app.healthStatus === 'Healthy' ? 'success' : 'warning'}>
                          {app.healthStatus}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>仓库: {app.source.repoUrl}</div>
                      <div>路径: {app.source.path}</div>
                      <div>目标: {app.destination.namespace}</div>
                    </div>
                    {app.syncPolicy?.automated && (
                      <div className="mt-2 pt-2 border-t flex items-center gap-2 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        自动同步已启用
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </PageCard>

            {/* 流水线 */}
            <PageCard title="CI/CD 流水线" icon={<GitBranch className="w-5 h-5" />} className="lg:col-span-2">
              <div className="space-y-3">
                {pipelines?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无流水线</p>
                    <p className="text-xs mt-2">流水线阶段: Lint → Test → Build → Scan → Push</p>
                  </div>
                ) : (
                  pipelines?.map((pipeline: any) => (
                    <div key={pipeline.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{pipeline.projectName}</span>
                          <Badge variant="default">{pipeline.ref}</Badge>
                        </div>
                        <Badge variant={
                          pipeline.status === 'success' ? 'success' :
                          pipeline.status === 'failed' ? 'danger' :
                          pipeline.status === 'running' ? 'default' : 'default'
                        }>
                          {pipeline.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {pipeline.stages.map((stage: any, i: number) => (
                          <div key={stage.name} className="flex items-center gap-2">
                            <div className={cn(
                              "px-3 py-1 rounded text-xs",
                              stage.status === 'success' ? 'bg-green-100 text-green-700' :
                              stage.status === 'failed' ? 'bg-red-100 text-red-700' :
                              stage.status === 'running' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            )}>
                              {stage.name}
                            </div>
                            {i < pipeline.stages.length - 1 && (
                              <span className="text-muted-foreground">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建网络策略对话框 */}
      <Dialog open={showCreatePolicyDialog} onOpenChange={setShowCreatePolicyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建网络策略</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">策略名称</label>
              <Input
                value={newPolicy.name}
                onChange={(e) => setNewPolicy(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入策略名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">命名空间</label>
              <Input
                value={newPolicy.namespace}
                onChange={(e) => setNewPolicy(prev => ({ ...prev, namespace: e.target.value }))}
                placeholder="default"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">策略类型</label>
              <Select
                value={newPolicy.type}
                onValueChange={(value: 'ingress' | 'egress' | 'both') => setNewPolicy(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingress">入站策略 (Ingress)</SelectItem>
                  <SelectItem value="egress">出站策略 (Egress)</SelectItem>
                  <SelectItem value="both">双向策略</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePolicyDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreatePolicy} disabled={createNetworkPolicyMutation.isPending}>
              {createNetworkPolicyMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
