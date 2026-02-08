/**
 * PortAI Nexus - 运维中心
 * 
 * 合并原 OpsDashboard (7 Tab, ops.* Mock) + SmartMonitoring (5 Tab, monitoring.* 真实)
 * 
 * 数据源:
 *   - trpc.ops.*: Mock 数据 (集群/存储/数据流/网关/安全/自动化/边缘)
 *   - trpc.monitoring.*: 真实数据 (系统/数据库/插件/引擎/服务)
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
import { Switch } from '@/components/ui/switch';
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
  Download,
  Globe,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Play,
  Plug,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Router,
  Server,
  Settings,
  Shield,
  Square,
  Trash2,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('monitor-overview');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });

  // ━━━ ops.* Mock 数据查询 ━━━
  const { data: clusterData, refetch: refetchCluster } = trpc.ops.getClusterOverview.useQuery();
  const { data: storageData, refetch: refetchStorage } = trpc.ops.getStorageOverview.useQuery();
  const { data: dataflowData, refetch: refetchDataflow } = trpc.ops.getDataFlowOverview.useQuery();
  const { data: gatewayData, refetch: refetchGateway } = trpc.ops.getApiGatewayOverview.useQuery();
  const { data: securityData, refetch: refetchSecurity } = trpc.ops.getSecurityPosture.useQuery();
  const { data: scalingPolicies } = trpc.ops.listScalingPolicies.useQuery();
  const { data: healingRules } = trpc.ops.listHealingRules.useQuery();
  const { data: backupPolicies } = trpc.ops.listBackupPolicies.useQuery();
  const { data: rollbackPolicies } = trpc.ops.listRollbackPolicies.useQuery();
  const { data: edgeNodes } = trpc.ops.listEdgeNodes.useQuery();
  const { data: edgeModels } = trpc.ops.listEdgeModels.useQuery();
  const { data: edgeGateways } = trpc.ops.listEdgeGateways.useQuery();

  // ━━━ monitoring.* 真实数据查询 ━━━
  const { data: dashboard, refetch: refetchDashboard } = trpc.monitoring.getDashboard.useQuery(undefined, {
    refetchInterval: 30000
  });
  const { data: realData, refetch: refetchReal } = trpc.monitoring.getRealDashboard.useQuery(undefined, {
    refetchInterval: 15000
  });

  // ━━━ ops.* Mutations ━━━
  const triggerScalingMutation = trpc.ops.triggerScaling.useMutation({
    onSuccess: () => { toast.success('扩缩容操作已触发'); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const triggerHealingMutation = trpc.ops.triggerHealing.useMutation({
    onSuccess: () => { toast.success('自愈操作已触发'); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const triggerBackupMutation = trpc.ops.triggerBackup.useMutation({
    onSuccess: () => { toast.success('备份操作已触发'); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
  });
  const triggerRollbackMutation = trpc.ops.triggerRollback.useMutation({
    onSuccess: () => { toast.success('回滚操作已触发'); },
    onError: (error) => { toast.error(`操作失败: ${error.message}`); }
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
  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}天 ${hours}小时`;
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

        {/* 真实系统状态提示 */}
        {realData && (
          <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <p className="font-medium">真实系统监控已连接</p>
                  <p className="text-sm text-muted-foreground">
                    MySQL: {realData.databases.find(d => d.name === 'MySQL')?.status || '未知'} | 
                    CPU: {realData.system.cpu.usage.toFixed(1)}% | 
                    内存: {realData.system.memory.usagePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 概览卡片 - 合并 ops + monitoring */}
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
              <p className="text-xs text-green-400">在线</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">插件</CardTitle>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboard?.summary.activePlugins || 0}/{dashboard?.summary.totalPlugins || 0}
              </div>
              <p className="text-xs text-green-400">活跃</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">引擎</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboard?.summary.runningEngines || 0}/{dashboard?.summary.totalEngines || 0}
              </div>
              <p className="text-xs text-green-400">运行中</p>
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
              <CardTitle className="text-sm font-medium">告警</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {dashboard?.summary.activeAlerts || 0}
              </div>
              <p className="text-xs text-muted-foreground">待处理</p>
            </CardContent>
          </Card>
        </div>

        {/* ━━━ 主内容 Tabs ━━━ */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* 分组 Tab 导航 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">实时监控</span>
              <span>|</span>
              <span className="font-medium">基础设施</span>
              <span>|</span>
              <span className="font-medium">运维自动化</span>
            </div>
            <TabsList className="grid w-full grid-cols-6 lg:grid-cols-12">
              {/* 实时监控组 (来自 SmartMonitoring 真实数据) */}
              <TabsTrigger value="monitor-overview" className="text-xs">
                <Activity className="w-3 h-3 mr-1" />系统
              </TabsTrigger>
              <TabsTrigger value="monitor-databases" className="text-xs">
                <Database className="w-3 h-3 mr-1" />数据库
              </TabsTrigger>
              <TabsTrigger value="monitor-plugins" className="text-xs">
                <Plug className="w-3 h-3 mr-1" />插件
              </TabsTrigger>
              <TabsTrigger value="monitor-engines" className="text-xs">
                <Cpu className="w-3 h-3 mr-1" />引擎
              </TabsTrigger>
              <TabsTrigger value="monitor-services" className="text-xs">
                <Server className="w-3 h-3 mr-1" />服务
              </TabsTrigger>
              {/* 基础设施组 (来自 ops Mock 数据) */}
              <TabsTrigger value="cluster" className="text-xs">
                <Layers className="w-3 h-3 mr-1" />集群
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs">
                <HardDrive className="w-3 h-3 mr-1" />存储
              </TabsTrigger>
              <TabsTrigger value="dataflow" className="text-xs">
                <Activity className="w-3 h-3 mr-1" />数据流
              </TabsTrigger>
              <TabsTrigger value="gateway" className="text-xs">
                <Globe className="w-3 h-3 mr-1" />网关
              </TabsTrigger>
              <TabsTrigger value="security" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />安全
              </TabsTrigger>
              {/* 运维自动化组 */}
              <TabsTrigger value="automation" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />自动化
              </TabsTrigger>
              <TabsTrigger value="edge" className="text-xs">
                <Router className="w-3 h-3 mr-1" />边缘
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 实时监控组 - 来自 SmartMonitoring (monitoring.* 真实数据)    */}
          {/* ════════════════════════════════════════════════════════════ */}

          {/* 系统概览 Tab */}
          <TabsContent value="monitor-overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CPU - 使用真实数据 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-400" />
                    CPU 使用率
                    {realData && <Badge variant="outline" className="ml-2 text-xs">真实数据</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>使用率</span>
                      <span>{(realData?.system.cpu.usage || dashboard?.system.cpu.usage || 0).toFixed(1)}%</span>
                    </div>
                    <Progress value={realData?.system.cpu.usage || dashboard?.system.cpu.usage || 0} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                      <div>核心数: {realData?.system.cpu.cores || dashboard?.system.cpu.cores}</div>
                      <div>1分钟负载: {(realData?.system.cpu.loadAvg[0] || dashboard?.system.cpu.loadAvg[0] || 0).toFixed(2)}</div>
                      <div>5分钟负载: {(realData?.system.cpu.loadAvg[1] || dashboard?.system.cpu.loadAvg[1] || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 内存 - 使用真实数据 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MemoryStick className="w-5 h-5 text-purple-400" />
                    内存使用率
                    {realData && <Badge variant="outline" className="ml-2 text-xs">真实数据</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>使用率</span>
                      <span>{(realData?.system.memory.usagePercent || dashboard?.system.memory.usagePercent || 0).toFixed(1)}%</span>
                    </div>
                    <Progress value={realData?.system.memory.usagePercent || dashboard?.system.memory.usagePercent || 0} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                      <div>已用: {((realData?.system.memory.usedMB || dashboard?.system.memory.usedMB || 0) / 1024).toFixed(1)} GB</div>
                      <div>总量: {((realData?.system.memory.totalMB || dashboard?.system.memory.totalMB || 0) / 1024).toFixed(1)} GB</div>
                      <div>空闲: {(((realData?.system.memory.totalMB || 0) - (realData?.system.memory.usedMB || 0)) / 1024).toFixed(1)} GB</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 磁盘 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-green-400" />
                    磁盘使用率
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>使用率</span>
                      <span>{(dashboard?.system.disk.usagePercent || 0).toFixed(1)}%</span>
                    </div>
                    <Progress value={dashboard?.system.disk.usagePercent || 0} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                      <div>已用: {dashboard?.system.disk.usedGB} GB</div>
                      <div>读取: {(dashboard?.system.disk.readMBps || 0).toFixed(1)} MB/s</div>
                      <div>写入: {(dashboard?.system.disk.writeMBps || 0).toFixed(1)} MB/s</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 网络 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-orange-400" />
                    网络信息
                    {realData && <Badge variant="outline" className="ml-2 text-xs">真实数据</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">主机名: </span>
                      <span className="font-medium">{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Node.js: </span>
                      <span className="font-medium">{process.env.NODE_ENV || 'production'}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">进程运行时间: </span>
                      <span className="font-medium">{formatUptime(realData?.system.process.uptime || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 数据库监控 Tab - 真实操作 */}
          <TabsContent value="monitor-databases" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboard?.databases.map((db) => (
                <Card key={db.name} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${getStatusColor(db.status)}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        {db.name}
                      </CardTitle>
                      {getStatusBadge(db.status)}
                    </div>
                    <CardDescription>v{db.version} | {db.host}:{db.port}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>连接数</span>
                        <span>{db.connections.active}/{db.connections.max}</span>
                      </div>
                      <Progress value={(db.connections.active / db.connections.max) * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>存储</span>
                        <span>{formatBytes(db.storage.usedBytes)} / {formatBytes(db.storage.totalBytes)}</span>
                      </div>
                      <Progress value={db.storage.usagePercent} className="h-1.5" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-2 border-t">
                      <div className="text-center">
                        <div className="font-medium text-foreground">{db.performance.queryLatencyMs.toFixed(1)}ms</div>
                        <div>延迟</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{db.performance.throughputQps}</div>
                        <div>QPS</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{formatUptime(db.uptime)}</div>
                        <div>运行时间</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => handleDatabaseAction(db.name, 'backup')} disabled={databaseActionMutation.isPending}>
                        <Download className="w-3 h-3 mr-1" />备份
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDatabaseAction(db.name, 'optimize')} disabled={databaseActionMutation.isPending}>
                        <Zap className="w-3 h-3 mr-1" />优化
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDatabaseAction(db.name, 'flush')} disabled={databaseActionMutation.isPending}>
                        <RefreshCw className="w-3 h-3 mr-1" />刷新
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 插件管理 Tab - 真实操作 */}
          <TabsContent value="monitor-plugins" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboard?.plugins.map((plugin) => (
                <Card key={plugin.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${getStatusColor(plugin.status)}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Plug className="w-5 h-5" />
                        {plugin.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{plugin.type}</Badge>
                        {getStatusBadge(plugin.status)}
                      </div>
                    </div>
                    <CardDescription>{plugin.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-sm font-medium">{plugin.resources.cpuPercent.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">CPU</div>
                      </div>
                      <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-sm font-medium">{plugin.resources.memoryMB} MB</div>
                        <div className="text-xs text-muted-foreground">内存</div>
                      </div>
                      <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-sm font-medium">{plugin.resources.diskMB} MB</div>
                        <div className="text-xs text-muted-foreground">磁盘</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-2 border-t">
                      <div className="text-center">
                        <div className="font-medium text-foreground">{plugin.metrics.invocations.toLocaleString()}</div>
                        <div>调用次数</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{plugin.metrics.successRate.toFixed(1)}%</div>
                        <div>成功率</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{plugin.metrics.avgLatencyMs.toFixed(1)}ms</div>
                        <div>平均延迟</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {plugin.status === 'active' ? (
                        <Button variant="outline" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'disable')} disabled={togglePluginMutation.isPending}>
                          <PowerOff className="w-3 h-3 mr-1" />禁用
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'enable')} disabled={togglePluginMutation.isPending}>
                          <Power className="w-3 h-3 mr-1" />启用
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handlePluginAction(plugin.id, plugin.name, 'restart')} disabled={togglePluginMutation.isPending}>
                        <RotateCcw className="w-3 h-3 mr-1" />重启
                      </Button>
                      {plugin.type !== 'builtin' && (
                        <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handlePluginUninstall(plugin.id, plugin.name)} disabled={uninstallPluginMutation.isPending}>
                          <Trash2 className="w-3 h-3 mr-1" />卸载
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 引擎管理 Tab - 真实操作 */}
          <TabsContent value="monitor-engines" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {dashboard?.engines.map((engine) => (
                <Card key={engine.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${getStatusColor(engine.status)}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Cpu className="w-5 h-5" />
                        {engine.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{engine.instances} 实例</Badge>
                        {getStatusBadge(engine.status)}
                      </div>
                    </div>
                    <CardDescription>v{engine.version} | 类型: {engine.type}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-sm font-medium">{engine.resources.cpuPercent.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">CPU</div>
                      </div>
                      <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-sm font-medium">{(engine.resources.memoryMB / 1024).toFixed(1)} GB</div>
                        <div className="text-xs text-muted-foreground">内存</div>
                      </div>
                      {engine.resources.gpuPercent !== undefined && (
                        <>
                          <div className="text-center p-2 bg-muted/50 rounded">
                            <div className="text-sm font-medium">{engine.resources.gpuPercent.toFixed(1)}%</div>
                            <div className="text-xs text-muted-foreground">GPU</div>
                          </div>
                          <div className="text-center p-2 bg-muted/50 rounded">
                            <div className="text-sm font-medium">{((engine.resources.gpuMemoryMB || 0) / 1024).toFixed(1)} GB</div>
                            <div className="text-xs text-muted-foreground">GPU内存</div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pt-2 border-t">
                      <div className="text-center">
                        <div className="font-medium text-foreground">{engine.performance.requestsPerSecond}</div>
                        <div>RPS</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{engine.performance.avgLatencyMs.toFixed(0)}ms</div>
                        <div>平均延迟</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{engine.performance.p99LatencyMs.toFixed(0)}ms</div>
                        <div>P99延迟</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{(engine.performance.errorRate * 100).toFixed(2)}%</div>
                        <div>错误率</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                      <div className="text-center p-2 bg-yellow-500/10 rounded">
                        <div className="font-medium text-yellow-400">{engine.queue.pending}</div>
                        <div className="text-muted-foreground">等待中</div>
                      </div>
                      <div className="text-center p-2 bg-blue-500/10 rounded">
                        <div className="font-medium text-blue-400">{engine.queue.processing}</div>
                        <div className="text-muted-foreground">处理中</div>
                      </div>
                      <div className="text-center p-2 bg-green-500/10 rounded">
                        <div className="font-medium text-green-400">{engine.queue.completed.toLocaleString()}</div>
                        <div className="text-muted-foreground">已完成</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {engine.status === 'running' ? (
                        <Button variant="outline" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'stop')} disabled={controlEngineMutation.isPending}>
                          <Square className="w-3 h-3 mr-1" />停止
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'start')} disabled={controlEngineMutation.isPending}>
                          <Play className="w-3 h-3 mr-1" />启动
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleEngineAction(engine.id, engine.name, 'restart')} disabled={controlEngineMutation.isPending}>
                        <RotateCcw className="w-3 h-3 mr-1" />重启
                      </Button>
                      <Button variant="outline" size="sm">
                        <Settings className="w-3 h-3 mr-1" />配置
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 服务健康 Tab */}
          <TabsContent value="monitor-services" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboard?.services.map((service) => (
                <Card key={service.name} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${getStatusColor(service.status)}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Server className="w-5 h-5" />
                        {service.name}
                      </CardTitle>
                      {getStatusBadge(service.status)}
                    </div>
                    <CardDescription>{service.endpoint}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">响应时间</span>
                      <span className="font-medium">{service.responseTimeMs.toFixed(1)}ms</span>
                    </div>
                    <div className="space-y-1">
                      {(service.checks || []).map((check, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1">
                            {check.status === 'pass' ? (
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : check.status === 'warn' ? (
                              <AlertTriangle className="w-3 h-3 text-yellow-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-400" />
                            )}
                            {check.name}
                          </span>
                          <span className="text-muted-foreground">{check.message}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 基础设施组 - 来自原 OpsDashboard (ops.* Mock 数据)          */}
          {/* ════════════════════════════════════════════════════════════ */}

          {/* 集群概览 Tab */}
          <TabsContent value="cluster" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    资源使用
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

          {/* 存储监控 Tab */}
          <TabsContent value="storage" className="space-y-4">
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

          {/* 数据流监控 Tab */}
          <TabsContent value="dataflow" className="space-y-4">
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

          {/* API 网关 Tab */}
          <TabsContent value="gateway" className="space-y-4">
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

          {/* 安全态势 Tab */}
          <TabsContent value="security" className="space-y-4">
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

          {/* 自动化运维 Tab */}
          <TabsContent value="automation" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />自动扩缩容策略</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>目标</TableHead><TableHead>副本范围</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {scalingPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.target.name}</TableCell>
                          <TableCell>{policy.minReplicas}-{policy.maxReplicas}</TableCell>
                          <TableCell><Switch checked={policy.enabled} disabled /></TableCell>
                        </TableRow>
                      ))}
                      {(!scalingPolicies || scalingPolicies.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">暂无扩缩容策略</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" />故障自愈规则</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>条件</TableHead><TableHead>动作</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {healingRules?.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>{rule.condition.type}</TableCell>
                          <TableCell>{rule.action.type}</TableCell>
                          <TableCell><Switch checked={rule.enabled} disabled /></TableCell>
                        </TableRow>
                      ))}
                      {(!healingRules || healingRules.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">暂无自愈规则</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" />备份策略</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>源</TableHead><TableHead>调度</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {backupPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.source.name}</TableCell>
                          <TableCell className="text-xs">{policy.schedule}</TableCell>
                          <TableCell><Switch checked={policy.enabled} disabled /></TableCell>
                        </TableRow>
                      ))}
                      {(!backupPolicies || backupPolicies.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">暂无备份策略</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Play className="h-5 w-5 rotate-180" />版本回滚策略</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>目标</TableHead><TableHead>自动回滚</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {rollbackPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.target.name}</TableCell>
                          <TableCell><Badge variant={policy.strategy.autoRollback ? 'default' : 'outline'}>{policy.strategy.autoRollback ? '启用' : '禁用'}</Badge></TableCell>
                          <TableCell><Switch checked={policy.enabled} disabled /></TableCell>
                        </TableRow>
                      ))}
                      {(!rollbackPolicies || rollbackPolicies.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">暂无回滚策略</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 边缘计算 Tab */}
          <TabsContent value="edge" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />边缘节点</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>区域</TableHead><TableHead>状态</TableHead><TableHead>CPU</TableHead><TableHead>内存</TableHead><TableHead>GPU</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {edgeNodes?.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell className="font-medium">{node.name}</TableCell>
                          <TableCell>{node.location.zone}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(node.status)}`} />
                              {node.status}
                            </div>
                          </TableCell>
                          <TableCell>{node.metrics.cpu.toFixed(0)}%</TableCell>
                          <TableCell>{node.metrics.memory.toFixed(0)}%</TableCell>
                          <TableCell>{node.metrics.gpu?.toFixed(0) || '-'}%</TableCell>
                        </TableRow>
                      ))}
                      {(!edgeNodes || edgeNodes.length === 0) && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">暂无边缘节点</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />部署模型</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {edgeModels?.map((model) => (
                    <div key={model.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{model.name}</span>
                        <Badge variant={model.status === 'ready' ? 'default' : 'secondary'}>{model.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>版本: {model.version}</div>
                        <div>类型: {model.type}</div>
                        <div>延迟: {model.performance.latency}ms</div>
                      </div>
                    </div>
                  ))}
                  {(!edgeModels || edgeModels.length === 0) && (
                    <div className="text-center text-muted-foreground py-4">暂无部署模型</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Router className="h-5 w-5" />边缘网关</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类型</TableHead><TableHead>端点</TableHead><TableHead>状态</TableHead><TableHead>设备数</TableHead><TableHead>消息收/发</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {edgeGateways?.map((gw) => (
                      <TableRow key={gw.id}>
                        <TableCell className="font-medium">{gw.name}</TableCell>
                        <TableCell><Badge variant="outline">{gw.type.toUpperCase()}</Badge></TableCell>
                        <TableCell className="text-xs">{gw.endpoint}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(gw.status)}`} />
                            {gw.status}
                          </div>
                        </TableCell>
                        <TableCell>{gw.connectedDevices}</TableCell>
                        <TableCell>{formatNumber(gw.metrics.messagesReceived)}/{formatNumber(gw.metrics.messagesSent)}</TableCell>
                      </TableRow>
                    ))}
                    {(!edgeGateways || edgeGateways.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">暂无边缘网关</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 告警列表 (来自 monitoring 真实数据) */}
        {dashboard?.alerts && dashboard.alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                最近告警
              </CardTitle>
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
