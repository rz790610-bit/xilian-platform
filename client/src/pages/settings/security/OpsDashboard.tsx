/**
 * PortAI Nexus - 运维中心
 * 
 * 5-Tab 运维概览：集群 / 存储 / 数据流 / 网关 / 安全
 * 
 * 数据源融合策略：
 *   集群 Tab: ops.getClusterOverview (K8s Mock) + monitoring.getRealDashboard (真实 CPU/内存/磁盘)
 *   存储 Tab: ops.getStorageOverview (6 数据库 Mock) + monitoring.getDashboard.databases (真实状态) + monitoring.executeDatabaseAction
 *   数据流 Tab: ops.getDataFlowOverview (Kafka/Flink Mock) + monitoring.getDashboard.plugins/engines (真实状态) + monitoring.togglePlugin/controlEngine
 *   网关 Tab: ops.getApiGatewayOverview (Kong/Istio Mock) + monitoring.getDashboard.services (真实健康检查)
 *   安全 Tab: ops.getSecurityPosture (Falco/Trivy/Vault Mock) + monitoring.getDashboard.alerts (真实告警) + monitoring.acknowledgeAlert
 * 
 * 后端依赖: ops.router.ts + monitoring.router.ts (均保留不动)
 * 数据库依赖: monitoring 连接真实 MySQL/Redis/ClickHouse/Qdrant
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Box,
  CheckCircle,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Play,
  Plug,
  RefreshCw,
  Router,
  Server,
  Settings,
  Shield,
  Square,
  Zap,
  XCircle,
} from 'lucide-react';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('cluster');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });

  // ━━━ ops.* 查询 (5 个基础设施 Tab 的 Mock 数据) ━━━
  const { data: clusterData, refetch: refetchCluster } = trpc.ops.getClusterOverview.useQuery();
  const { data: storageData, refetch: refetchStorage } = trpc.ops.getStorageOverview.useQuery();
  const { data: dataflowData, refetch: refetchDataflow } = trpc.ops.getDataFlowOverview.useQuery();
  const { data: gatewayData, refetch: refetchGateway } = trpc.ops.getApiGatewayOverview.useQuery();
  const { data: securityData, refetch: refetchSecurity } = trpc.ops.getSecurityPosture.useQuery();

  // ━━━ monitoring.* 查询 (真实数据，嵌入各 Tab) ━━━
  const { data: dashboard, refetch: refetchDashboard } = trpc.monitoring.getDashboard.useQuery(undefined, {
    refetchInterval: 30000
  });
  const { data: realData, refetch: refetchReal } = trpc.monitoring.getRealDashboard.useQuery(undefined, {
    refetchInterval: 15000
  });

  // ━━━ monitoring.* Mutations (真实操作) ━━━
  const togglePluginMutation = trpc.monitoring.togglePlugin.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetchDashboard(); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const uninstallPluginMutation = trpc.monitoring.uninstallPlugin.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetchDashboard(); },
    onError: (error) => { toast.error(`卸载失败: ${error.message}`); }
  });
  const controlEngineMutation = trpc.monitoring.controlEngine.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetchDashboard(); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const databaseActionMutation = trpc.monitoring.executeDatabaseAction.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetchDashboard(); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const acknowledgeAlertMutation = trpc.monitoring.acknowledgeAlert.useMutation({
    onSuccess: () => { toast.success('告警已确认'); refetchDashboard(); },
    onError: (error) => { toast.error(`确认失败: ${error.message}`); }
  });

  // ━━━ 刷新所有数据 ━━━
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchCluster(), refetchStorage(), refetchDataflow(),
      refetchGateway(), refetchSecurity(), refetchDashboard(), refetchReal(),
    ]);
    setRefreshing(false);
  };

  // ━━━ monitoring 操作处理函数 ━━━
  const handlePluginAction = (pluginId: string, pluginName: string, action: 'enable' | 'disable' | 'restart') => {
    const actionText = action === 'enable' ? '启用' : action === 'disable' ? '禁用' : '重启';
    setConfirmDialog({
      open: true,
      title: `确认${actionText}插件`,
      description: `您确定要${actionText}插件 "${pluginName}" 吗？`,
      action: () => {
        togglePluginMutation.mutate({ pluginId, action });
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  const handlePluginUninstall = (pluginId: string, pluginName: string) => {
    setConfirmDialog({
      open: true,
      title: '确认卸载插件',
      description: `您确定要卸载插件 "${pluginName}" 吗？此操作不可撤销。`,
      action: () => {
        uninstallPluginMutation.mutate({ pluginId });
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  const handleEngineAction = (engineId: string, engineName: string, action: 'start' | 'stop' | 'restart') => {
    const actionText = action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启';
    setConfirmDialog({
      open: true,
      title: `确认${actionText}引擎`,
      description: `您确定要${actionText}引擎 "${engineName}" 吗？`,
      action: () => {
        controlEngineMutation.mutate({ engineId, action });
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  const handleDatabaseAction = (dbName: string, action: 'backup' | 'optimize' | 'restart' | 'flush') => {
    const actionText = { backup: '备份', optimize: '优化', restart: '重启', flush: '刷新缓存' }[action];
    setConfirmDialog({
      open: true,
      title: `确认${actionText}数据库`,
      description: `您确定要对数据库 "${dbName}" 执行${actionText}操作吗？`,
      action: () => {
        databaseActionMutation.mutate({ databaseName: dbName, action });
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  // ━━━ 工具函数 ━━━
  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': case 'online': case 'Ready': case 'RUNNING':
      case 'connected': case 'active': case 'running':
        return 'bg-green-500';
      case 'degraded': case 'warning': case 'error':
        return 'bg-yellow-500';
      case 'unhealthy': case 'offline': case 'NotReady': case 'FAILED':
      case 'disconnected': case 'stopped': case 'inactive':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': case 'running': case 'active': case 'healthy':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">在线</Badge>;
      case 'offline': case 'stopped': case 'inactive': case 'unhealthy':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">离线</Badge>;
      case 'degraded': case 'error':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">异常</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">未知</Badge>;
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'up') return <ArrowUp className="h-3 w-3 text-green-500" />;
    if (trend === 'down') return <ArrowDown className="h-3 w-3 text-red-500" />;
    return null;
  };

  return (
    <MainLayout title="运维中心">
      <div className="space-y-6">
        {/* 顶部操作栏 */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">运维中心</h2>
            <Badge variant="outline" className="text-green-600">系统正常</Badge>
            {realData && (
              <Badge variant="outline" className="text-blue-600">
                真实监控已连接
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              最后更新: {dashboard?.lastUpdated ? new Date(dashboard.lastUpdated).toLocaleTimeString() : '-'}
            </span>
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>

        {/* 概览卡片 - 合并 ops + monitoring 关键指标 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">集群节点</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clusterData?.summary.healthyNodes || 0}/{clusterData?.summary.totalNodes || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {clusterData?.summary.runningPods || 0} Pods 运行中
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">数据库</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboard?.summary.onlineDatabases || 0}/{dashboard?.summary.totalDatabases || 0}
              </div>
              <p className="text-xs text-green-400">在线（真实）</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU / 内存</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {realData?.system.cpu.usage.toFixed(0) || dashboard?.summary.cpuUsage?.toFixed(0) || 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                内存 {realData?.system.memory.usagePercent.toFixed(0) || dashboard?.summary.memoryUsage?.toFixed(0) || 0}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API 网关</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(gatewayData?.kong.metrics.requestsPerSecond.value || 0)}
              </div>
              <p className="text-xs text-muted-foreground">请求/秒</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">插件/引擎</CardTitle>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboard?.summary.activePlugins || 0}/{dashboard?.summary.runningEngines || 0}
              </div>
              <p className="text-xs text-green-400">活跃/运行</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">告警</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {dashboard?.summary.activeAlerts || 0}
              </div>
              <p className="text-xs text-red-400">
                {dashboard?.summary.criticalAlerts || 0} 严重
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ━━━ 5-Tab 主内容 ━━━ */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="cluster" className="flex items-center gap-1">
              <Layers className="w-4 h-4" />集群
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-1">
              <HardDrive className="w-4 h-4" />存储
            </TabsTrigger>
            <TabsTrigger value="dataflow" className="flex items-center gap-1">
              <Activity className="w-4 h-4" />数据流
            </TabsTrigger>
            <TabsTrigger value="gateway" className="flex items-center gap-1">
              <Globe className="w-4 h-4" />网关
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1">
              <Shield className="w-4 h-4" />安全
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 集群 Tab: ops.getClusterOverview + monitoring 真实系统资源   */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="cluster" className="space-y-4">
            {/* 真实系统资源 (来自 monitoring) */}
            {realData && (
              <Card className="border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    真实系统资源
                    <Badge variant="outline" className="text-blue-400 text-xs">实时</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</span>
                        <span className="font-medium">{realData.system.cpu.usage.toFixed(1)}%</span>
                      </div>
                      <Progress value={realData.system.cpu.usage} />
                      <p className="text-xs text-muted-foreground">{realData.system.cpu.cores} 核</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" /> 内存</span>
                        <span className="font-medium">{realData.system.memory.usagePercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={realData.system.memory.usagePercent} />
                      <p className="text-xs text-muted-foreground">
                        {(realData.system.memory.usedMB / 1024 / 1024 / 1024).toFixed(1)} / {(realData.system.memory.totalMB / 1024 / 1024 / 1024).toFixed(1)} GB
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> 磁盘</span>
                        <span className="font-medium">{realData.system.disk.usagePercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={realData.system.disk.usagePercent} />
                      <p className="text-xs text-muted-foreground">
                        {(realData.system.disk.usedGB / 1024 / 1024 / 1024).toFixed(1)} / {(realData.system.disk.totalGB / 1024 / 1024 / 1024).toFixed(1)} GB
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><Server className="h-3 w-3" /> 运行时间</span>
                      </div>
                      <div className="text-lg font-bold">{Math.floor(realData.system.process.uptime / 86400)}天</div>
                      <p className="text-xs text-muted-foreground">
                        负载: {realData.system.cpu.loadAvg?.[0]?.toFixed(2) || '-'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* K8s 集群资源 (来自 ops) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    K8s 集群资源
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU</span>
                      <span>{clusterData?.resources.cpu.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.cpu.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2"><MemoryStick className="h-4 w-4" /> 内存</span>
                      <span>{clusterData?.resources.memory.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.memory.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> 存储</span>
                      <span>{clusterData?.resources.storage.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.storage.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2"><Zap className="h-4 w-4" /> GPU</span>
                      <span>{clusterData?.resources.gpu.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.gpu.percent || 0} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    节点状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>节点</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clusterData?.nodes.slice(0, 5).map((node) => (
                        <TableRow key={node.name}>
                          <TableCell className="font-medium">{node.name}</TableCell>
                          <TableCell><Badge variant="outline">{node.role}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(node.status)}`} />
                              {node.status}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {node.cpu.value.toFixed(0)}%
                              {getTrendIcon(node.cpu.trend)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {node.memory.value.toFixed(0)}%
                              {getTrendIcon(node.memory.trend)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    告警摘要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-red-500">{clusterData?.alerts.critical || 0}</div>
                      <div className="text-xs text-muted-foreground">严重</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-500">{clusterData?.alerts.warning || 0}</div>
                      <div className="text-xs text-muted-foreground">警告</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-500">{clusterData?.alerts.info || 0}</div>
                      <div className="text-xs text-muted-foreground">信息</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{clusterData?.alerts.total || 0}</div>
                      <div className="text-xs text-muted-foreground">总计</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    最近事件
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {clusterData?.events.slice(0, 3).map((event, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Badge variant={event.type === 'Warning' ? 'destructive' : 'secondary'}>{event.type}</Badge>
                        <div className="flex-1">
                          <div className="font-medium">{event.reason}</div>
                          <div className="text-muted-foreground text-xs">{event.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 存储 Tab: ops.getStorageOverview + monitoring 真实数据库状态 */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="storage" className="space-y-4">
            {/* 真实数据库状态 (来自 monitoring) */}
            {dashboard?.databases && dashboard.databases.length > 0 && (
              <Card className="border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-400" />
                    真实数据库状态
                    <Badge variant="outline" className="text-blue-400 text-xs">实时</Badge>
                  </CardTitle>
                  <CardDescription>来自 monitoring 服务的真实连接状态</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>数据库</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>连接数</TableHead>
                        <TableHead>延迟</TableHead>
                        <TableHead>版本</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard.databases || []).map((db) => (
                        <TableRow key={db.name}>
                          <TableCell className="font-medium">{db.name}</TableCell>
                          <TableCell>{getStatusBadge(db.status)}</TableCell>
                          <TableCell>{db.connections.active || '-'}</TableCell>
                          <TableCell>
                            <span className={(db.performance?.queryLatencyMs || 0) > 100 ? 'text-yellow-500' : 'text-green-500'}>
                              {db.performance?.queryLatencyMs?.toFixed(1) || '-'}ms
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{db.version || '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleDatabaseAction(db.name, 'backup')}>
                                备份
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDatabaseAction(db.name, 'optimize')}>
                                优化
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDatabaseAction(db.name, 'restart')}>
                                重启
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* 存储引擎详情 (来自 ops) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-yellow-500" />ClickHouse
                  </CardTitle>
                  <CardDescription>时序数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.clickhouse.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">QPS</span><span className="font-medium">{formatNumber(storageData?.databases.clickhouse.metrics.queriesPerSecond.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">写入速率</span><span className="font-medium">{formatNumber(storageData?.databases.clickhouse.metrics.insertRowsPerSecond.value || 0)} rows/s</span></div>
                  <div className="flex justify-between"><span className="text-sm">复制延迟</span><span className="font-medium">{storageData?.databases.clickhouse.metrics.replicationLag.value.toFixed(2)}s</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />PostgreSQL
                  </CardTitle>
                  <CardDescription>关系型数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.postgresql.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">TPS</span><span className="font-medium">{formatNumber(storageData?.databases.postgresql.metrics.transactionsPerSecond.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">缓存命中率</span><span className="font-medium">{storageData?.databases.postgresql.metrics.cacheHitRatio.value.toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-sm">连接数</span><span className="font-medium">{storageData?.databases.postgresql.connections.active}/{storageData?.databases.postgresql.connections.max}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-green-500" />Neo4j
                  </CardTitle>
                  <CardDescription>图数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.neo4j.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">节点数</span><span className="font-medium">{formatNumber(storageData?.databases.neo4j.metrics.nodeCount.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">关系数</span><span className="font-medium">{formatNumber(storageData?.databases.neo4j.metrics.relationshipCount.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">QPS</span><span className="font-medium">{formatNumber(storageData?.databases.neo4j.metrics.queriesPerSecond.value || 0)}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Box className="h-5 w-5 text-purple-500" />Qdrant
                  </CardTitle>
                  <CardDescription>向量数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.qdrant.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">搜索延迟</span><span className="font-medium">{storageData?.databases.qdrant.metrics.searchLatency.value.toFixed(1)}ms</span></div>
                  <div className="flex justify-between"><span className="text-sm">内存使用</span><span className="font-medium">{storageData?.databases.qdrant.metrics.memoryUsage.value.toFixed(1)} GB</span></div>
                  <div className="flex justify-between"><span className="text-sm">Collections</span><span className="font-medium">{storageData?.databases.qdrant.collections.length || 0}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-red-500" />Redis
                  </CardTitle>
                  <CardDescription>缓存集群</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.redis.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">OPS</span><span className="font-medium">{formatNumber(storageData?.databases.redis.metrics.opsPerSecond.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">命中率</span><span className="font-medium">{storageData?.databases.redis.metrics.hitRate.value.toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-sm">内存使用</span><span className="font-medium">{storageData?.databases.redis.metrics.memoryUsed.value.toFixed(1)} GB</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-orange-500" />MinIO
                  </CardTitle>
                  <CardDescription>对象存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm">状态</span><Badge variant="outline" className="text-green-600">{storageData?.databases.minio.status.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm">对象数</span><span className="font-medium">{formatNumber(storageData?.databases.minio.metrics.totalObjects.value || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-sm">总大小</span><span className="font-medium">{storageData?.databases.minio.metrics.totalSize.value.toFixed(0)} GB</span></div>
                  <div className="flex justify-between"><span className="text-sm">带宽</span><span className="font-medium">{storageData?.databases.minio.metrics.bandwidth.value.toFixed(0)} MB/s</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 数据流 Tab: ops.getDataFlowOverview + monitoring 插件/引擎  */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="dataflow" className="space-y-4">
            {/* 真实插件状态 (来自 monitoring) */}
            {dashboard?.plugins && dashboard.plugins.length > 0 && (
              <Card className="border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plug className="w-5 h-5 text-blue-400" />
                    平台插件
                    <Badge variant="outline" className="text-blue-400 text-xs">实时</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>插件名称</TableHead>
                        <TableHead>版本</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard.plugins || []).map((plugin) => (
                        <TableRow key={plugin.id}>
                          <TableCell className="font-medium">{plugin.name}</TableCell>
                          <TableCell className="text-xs">{plugin.version}</TableCell>
                          <TableCell>{getStatusBadge(plugin.status)}</TableCell>
                          <TableCell><Badge variant="outline">{plugin.type}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {plugin.status === 'active' ? (
                                <Button variant="ghost" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'disable')}>
                                  <Square className="h-3 w-3 mr-1" />禁用
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'enable')}>
                                  <Play className="h-3 w-3 mr-1" />启用
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'restart')}>
                                <RefreshCw className="h-3 w-3 mr-1" />重启
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handlePluginUninstall(plugin.id, plugin.name)}>
                                <XCircle className="h-3 w-3 mr-1" />卸载
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* 真实引擎状态 (来自 monitoring) */}
            {dashboard?.engines && dashboard.engines.length > 0 && (
              <Card className="border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-purple-400" />
                    计算引擎
                    <Badge variant="outline" className="text-purple-400 text-xs">实时</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>引擎名称</TableHead>
                        <TableHead>版本</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard.engines || []).map((engine) => (
                        <TableRow key={engine.id}>
                          <TableCell className="font-medium">{engine.name}</TableCell>
                          <TableCell className="text-xs">{engine.version}</TableCell>
                          <TableCell>{getStatusBadge(engine.status)}</TableCell>
                          <TableCell><Badge variant="outline">{engine.type}</Badge></TableCell>
                          <TableCell>{engine.resources?.cpuPercent?.toFixed(1) || '-'}%</TableCell>
                          <TableCell>{engine.resources?.memoryMB?.toFixed(0) || '-'} MB</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {engine.status === 'running' ? (
                                <Button variant="ghost" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'stop')}>
                                  <Square className="h-3 w-3 mr-1" />停止
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'start')}>
                                  <Play className="h-3 w-3 mr-1" />启动
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'restart')}>
                                <RefreshCw className="h-3 w-3 mr-1" />重启
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Kafka / Flink / Airflow / Connectors (来自 ops) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Kafka 集群</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{formatNumber(dataflowData?.kafka.metrics.messagesPerSecond.value || 0)}</div>
                      <div className="text-xs text-muted-foreground">消息/秒</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{dataflowData?.kafka.metrics.totalLag.value || 0}</div>
                      <div className="text-xs text-muted-foreground">消费延迟</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>分区</TableHead><TableHead>消息/秒</TableHead><TableHead>Lag</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dataflowData?.kafka.topics.slice(0, 4).map((topic) => (
                        <TableRow key={topic.name}>
                          <TableCell className="font-medium">{topic.name}</TableCell>
                          <TableCell>{topic.partitions}</TableCell>
                          <TableCell>{formatNumber(topic.messagesPerSecond)}</TableCell>
                          <TableCell>{topic.consumerLag}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" />Flink 作业</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-green-500">{dataflowData?.flink.metrics.runningJobs.value || 0}</div>
                      <div className="text-xs text-muted-foreground">运行中</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{dataflowData?.flink.metrics.uptime.value.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">可用性</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>作业名称</TableHead><TableHead>状态</TableHead><TableHead>并行度</TableHead><TableHead>检查点</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dataflowData?.flink.jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">{job.name}</TableCell>
                          <TableCell><Badge variant={job.status === 'RUNNING' ? 'default' : 'destructive'}>{job.status}</Badge></TableCell>
                          <TableCell>{job.parallelism}</TableCell>
                          <TableCell>{job.checkpoints.completed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Airflow DAGs</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>DAG ID</TableHead><TableHead>状态</TableHead><TableHead>成功率</TableHead><TableHead>调度</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dataflowData?.airflow.dags.map((dag) => (
                        <TableRow key={dag.dagId}>
                          <TableCell className="font-medium">{dag.dagId}</TableCell>
                          <TableCell><Badge variant={dag.lastRun.state === 'success' ? 'default' : dag.lastRun.state === 'running' ? 'secondary' : 'destructive'}>{dag.lastRun.state}</Badge></TableCell>
                          <TableCell>{dag.successRate.toFixed(1)}%</TableCell>
                          <TableCell className="text-xs">{dag.schedule}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Router className="h-5 w-5" />Kafka Connectors</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>任务</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dataflowData?.connectors.list.map((conn) => (
                        <TableRow key={conn.name}>
                          <TableCell className="font-medium">{conn.name}</TableCell>
                          <TableCell><Badge variant="outline">{conn.type}</Badge></TableCell>
                          <TableCell><Badge variant={conn.status === 'RUNNING' ? 'default' : 'destructive'}>{conn.status}</Badge></TableCell>
                          <TableCell>{conn.tasks.running}/{conn.tasks.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 网关 Tab: ops.getApiGatewayOverview + monitoring 服务健康   */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="gateway" className="space-y-4">
            {/* 真实服务健康 (来自 monitoring) */}
            {dashboard?.services && dashboard.services.length > 0 && (
              <Card className="border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    服务健康检查
                    <Badge variant="outline" className="text-blue-400 text-xs">实时</Badge>
                  </CardTitle>
                  <CardDescription>来自 monitoring 服务的真实健康检查结果</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(dashboard.services || []).map((service) => (
                      <div key={service.name} className={`p-3 rounded-lg border ${
                        service.status === 'healthy' ? 'bg-green-500/10 border-green-500/30' :
                        service.status === 'degraded' ? 'bg-yellow-500/10 border-yellow-500/30' :
                        'bg-red-500/10 border-red-500/30'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{service.name}</span>
                          {getStatusBadge(service.status)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {service.responseTimeMs ? `${service.responseTimeMs.toFixed(0)}ms` : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Kong / Istio (来自 ops) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Kong 网关</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">{formatNumber(gatewayData?.kong.metrics.requestsPerSecond.value || 0)}</div>
                      <div className="text-xs text-muted-foreground">请求/秒</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">{gatewayData?.kong.metrics.latencyP99.value || 0}ms</div>
                      <div className="text-xs text-muted-foreground">P99 延迟</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">{gatewayData?.kong.metrics.errorRate.value.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">错误率</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>路由</TableHead><TableHead>QPS</TableHead><TableHead>P50</TableHead><TableHead>错误率</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {gatewayData?.kong.routes.map((route) => (
                        <TableRow key={route.name}>
                          <TableCell className="font-medium">{route.name}</TableCell>
                          <TableCell>{formatNumber(route.requestsPerSecond)}</TableCell>
                          <TableCell>{route.latencyP50}ms</TableCell>
                          <TableCell>{route.errorRate.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" />Istio 服务网格</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">{formatNumber(gatewayData?.istio.metrics.meshRequestsPerSecond.value || 0)}</div>
                      <div className="text-xs text-muted-foreground">网格 QPS</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold text-green-500">{gatewayData?.istio.metrics.meshSuccessRate.value.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">成功率</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold text-green-500">{gatewayData?.istio.metrics.mtlsEnabled.value}%</div>
                      <div className="text-xs text-muted-foreground">mTLS</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>服务</TableHead><TableHead>命名空间</TableHead><TableHead>QPS</TableHead><TableHead>成功率</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {gatewayData?.istio.services.map((svc) => (
                        <TableRow key={svc.name}>
                          <TableCell className="font-medium">{svc.name}</TableCell>
                          <TableCell>{svc.namespace}</TableCell>
                          <TableCell>{formatNumber(svc.requestsPerSecond)}</TableCell>
                          <TableCell>{svc.successRate.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 安全 Tab: ops.getSecurityPosture + monitoring 真实告警      */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="security" className="space-y-4">
            {/* 真实告警列表 (来自 monitoring) */}
            {dashboard?.alerts && dashboard.alerts.length > 0 && (
              <Card className="border-yellow-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    实时告警
                    <Badge variant="outline" className="text-yellow-400 text-xs">
                      {dashboard.alerts.length} 条
                    </Badge>
                  </CardTitle>
                  <CardDescription>来自 monitoring 服务的真实告警</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(dashboard.alerts || []).map((alert) => (
                      <div 
                        key={alert.id} 
                        className={`p-3 rounded-lg border flex items-start justify-between ${
                          alert.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                          alert.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                          alert.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
                          'bg-blue-500/10 border-blue-500/30'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{alert.sourceType}</Badge>
                            <span className="font-medium">{alert.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            来源: {alert.source} | 时间: {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {!alert.acknowledgedAt && (
                          <Button variant="ghost" size="sm" onClick={() => acknowledgeAlertMutation.mutate({ alertId: alert.id })} disabled={acknowledgeAlertMutation.isPending}>
                            确认
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 安全态势 (来自 ops) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />安全评分</CardTitle></CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl font-bold mb-2">{securityData?.overview.score || 0}</div>
                  <Badge variant={securityData?.overview.grade === 'A' ? 'default' : securityData?.overview.grade === 'B' ? 'secondary' : 'destructive'}>
                    等级 {securityData?.overview.grade}
                  </Badge>
                  <div className="mt-4 text-sm text-muted-foreground">
                    趋势: {securityData?.overview.trend === 'improving' ? '↑ 改善中' : securityData?.overview.trend === 'stable' ? '→ 稳定' : '↓ 下降'}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />漏洞摘要</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-2 bg-red-500/10 rounded"><div className="text-2xl font-bold text-red-500">{securityData?.vulnerabilities.summary.critical || 0}</div><div className="text-xs">严重</div></div>
                    <div className="text-center p-2 bg-orange-500/10 rounded"><div className="text-2xl font-bold text-orange-500">{securityData?.vulnerabilities.summary.high || 0}</div><div className="text-xs">高危</div></div>
                    <div className="text-center p-2 bg-yellow-500/10 rounded"><div className="text-2xl font-bold text-yellow-500">{securityData?.vulnerabilities.summary.medium || 0}</div><div className="text-xs">中危</div></div>
                    <div className="text-center p-2 bg-blue-500/10 rounded"><div className="text-2xl font-bold text-blue-500">{securityData?.vulnerabilities.summary.low || 0}</div><div className="text-xs">低危</div></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />合规框架</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {securityData?.compliance.frameworks.slice(0, 3).map((fw) => (
                    <div key={fw.name} className="space-y-1">
                      <div className="flex justify-between text-sm"><span>{fw.name}</span><span className="font-medium">{fw.score}%</span></div>
                      <Progress value={fw.score} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Falco 运行时安全</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div><div className="text-xl font-bold text-red-500">{securityData?.runtime.falco.events.byPriority.CRITICAL || 0}</div><div className="text-xs">严重</div></div>
                    <div><div className="text-xl font-bold text-yellow-500">{securityData?.runtime.falco.events.byPriority.WARNING || 0}</div><div className="text-xs">警告</div></div>
                    <div><div className="text-xl font-bold text-blue-500">{securityData?.runtime.falco.events.byPriority.NOTICE || 0}</div><div className="text-xs">通知</div></div>
                    <div><div className="text-xl font-bold">{securityData?.runtime.falco.events.total || 0}</div><div className="text-xs">总计</div></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Vault 密钥管理</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><div className="text-xl font-bold">{securityData?.secrets.vault.secrets.total || 0}</div><div className="text-xs">密钥总数</div></div>
                    <div><div className="text-xl font-bold text-yellow-500">{securityData?.secrets.vault.certificates.expiringSoon || 0}</div><div className="text-xs">即将过期</div></div>
                    <div><div className="text-xl font-bold text-green-500">{securityData?.secrets.vault.leases.active || 0}</div><div className="text-xs">活跃租约</div></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 确认对话框 */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>取消</Button>
            <Button onClick={confirmDialog.action}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
