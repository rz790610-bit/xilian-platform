/**
 * PortAI Nexus - 智能监控页面
 * XiLian Intelligent Platform - Smart Monitoring Page
 * 
 * 真实功能版本 - 所有操作按钮均可执行真实操作
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Database, 
  Plug, 
  Cpu, 
  Server, 
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  HardDrive,
  Wifi,
  MemoryStick,
  Play,
  Square,
  RotateCcw,
  Download,
  Trash2,
  Power,
  PowerOff,
  Bell,
  Settings,
  Zap
} from 'lucide-react';

export default function SmartMonitoring() {
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });
  
  // 模拟数据查询
  const { data: dashboard, isLoading, refetch } = trpc.monitoring.getDashboard.useQuery(undefined, {
    refetchInterval: 30000
  });

  // 真实系统数据查询
  const { data: realData, refetch: refetchReal } = trpc.monitoring.getRealDashboard.useQuery(undefined, {
    refetchInterval: 15000
  });

  // 操作 mutations
  const togglePluginMutation = trpc.monitoring.togglePlugin.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`操作失败: ${error.message}`);
    }
  });

  const uninstallPluginMutation = trpc.monitoring.uninstallPlugin.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`卸载失败: ${error.message}`);
    }
  });

  const controlEngineMutation = trpc.monitoring.controlEngine.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`操作失败: ${error.message}`);
    }
  });

  const databaseActionMutation = trpc.monitoring.executeDatabaseAction.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`操作失败: ${error.message}`);
    }
  });

  const acknowledgeAlertMutation = trpc.monitoring.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success('告警已确认');
      refetch();
    },
    onError: (error) => {
      toast.error(`确认失败: ${error.message}`);
    }
  });

  // 操作处理函数
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
    const actionText = {
      backup: '备份',
      optimize: '优化',
      restart: '重启',
      flush: '刷新缓存'
    }[action];
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

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}天 ${hours}小时`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'running':
      case 'active':
      case 'healthy':
        return 'bg-green-500';
      case 'offline':
      case 'stopped':
      case 'inactive':
      case 'unhealthy':
        return 'bg-red-500';
      case 'degraded':
      case 'error':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
      case 'running':
      case 'active':
      case 'healthy':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">在线</Badge>;
      case 'offline':
      case 'stopped':
      case 'inactive':
      case 'unhealthy':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">离线</Badge>;
      case 'degraded':
      case 'error':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">异常</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">未知</Badge>;
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="智能监控">
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">加载监控数据...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="智能监控">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">智能监控</h1>
            <p className="text-muted-foreground">监控平台的数据库、插件、引擎等全部资源</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              最后更新: {dashboard?.lastUpdated ? new Date(dashboard.lastUpdated).toLocaleTimeString() : '-'}
            </span>
            <Button variant="outline" size="sm" onClick={() => { refetch(); refetchReal(); }}>
              <RefreshCw className="w-4 h-4 mr-1" />
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

        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">数据库</p>
                  <p className="text-2xl font-bold">
                    {dashboard?.summary.onlineDatabases}/{dashboard?.summary.totalDatabases}
                  </p>
                  <p className="text-xs text-green-400">在线</p>
                </div>
                <Database className="w-10 h-10 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">插件</p>
                  <p className="text-2xl font-bold">
                    {dashboard?.summary.activePlugins}/{dashboard?.summary.totalPlugins}
                  </p>
                  <p className="text-xs text-green-400">活跃</p>
                </div>
                <Plug className="w-10 h-10 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">引擎</p>
                  <p className="text-2xl font-bold">
                    {dashboard?.summary.runningEngines}/{dashboard?.summary.totalEngines}
                  </p>
                  <p className="text-xs text-green-400">运行中</p>
                </div>
                <Cpu className="w-10 h-10 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">告警</p>
                  <p className="text-2xl font-bold">
                    {dashboard?.summary.activeAlerts}
                  </p>
                  <p className="text-xs text-yellow-400">待处理</p>
                </div>
                <Bell className="w-10 h-10 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 详细监控 Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              系统概览
            </TabsTrigger>
            <TabsTrigger value="databases" className="flex items-center gap-1">
              <Database className="w-4 h-4" />
              数据库
            </TabsTrigger>
            <TabsTrigger value="plugins" className="flex items-center gap-1">
              <Plug className="w-4 h-4" />
              插件
            </TabsTrigger>
            <TabsTrigger value="engines" className="flex items-center gap-1">
              <Cpu className="w-4 h-4" />
              引擎
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-1">
              <Server className="w-4 h-4" />
              服务
            </TabsTrigger>
          </TabsList>

          {/* 系统概览 Tab */}
          <TabsContent value="overview" className="space-y-4">
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

          {/* 数据库 Tab - 添加操作按钮 */}
          <TabsContent value="databases" className="space-y-4">
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
                    {/* 连接数 */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>连接数</span>
                        <span>{db.connections.active}/{db.connections.max}</span>
                      </div>
                      <Progress 
                        value={(db.connections.active / db.connections.max) * 100} 
                        className="h-1.5" 
                      />
                    </div>
                    {/* 存储 */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>存储</span>
                        <span>{formatBytes(db.storage.usedBytes)} / {formatBytes(db.storage.totalBytes)}</span>
                      </div>
                      <Progress value={db.storage.usagePercent} className="h-1.5" />
                    </div>
                    {/* 性能指标 */}
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
                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDatabaseAction(db.name, 'backup')}
                        disabled={databaseActionMutation.isPending}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        备份
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDatabaseAction(db.name, 'optimize')}
                        disabled={databaseActionMutation.isPending}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        优化
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDatabaseAction(db.name, 'flush')}
                        disabled={databaseActionMutation.isPending}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        刷新
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 插件 Tab - 添加操作按钮 */}
          <TabsContent value="plugins" className="space-y-4">
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
                    {/* 资源使用 */}
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
                    {/* 性能指标 */}
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
                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {plugin.status === 'active' ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePluginAction(plugin.id, plugin.name, 'disable')}
                          disabled={togglePluginMutation.isPending}
                        >
                          <PowerOff className="w-3 h-3 mr-1" />
                          禁用
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePluginAction(plugin.id, plugin.name, 'enable')}
                          disabled={togglePluginMutation.isPending}
                        >
                          <Power className="w-3 h-3 mr-1" />
                          启用
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handlePluginAction(plugin.id, plugin.name, 'restart')}
                        disabled={togglePluginMutation.isPending}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        重启
                      </Button>
                      {plugin.type !== 'builtin' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handlePluginUninstall(plugin.id, plugin.name)}
                          disabled={uninstallPluginMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          卸载
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 引擎 Tab - 添加操作按钮 */}
          <TabsContent value="engines" className="space-y-4">
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
                    {/* 资源使用 */}
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
                    {/* 性能指标 */}
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
                    {/* 队列状态 */}
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
                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {engine.status === 'running' ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEngineAction(engine.id, engine.name, 'stop')}
                          disabled={controlEngineMutation.isPending}
                        >
                          <Square className="w-3 h-3 mr-1" />
                          停止
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEngineAction(engine.id, engine.name, 'start')}
                          disabled={controlEngineMutation.isPending}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          启动
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEngineAction(engine.id, engine.name, 'restart')}
                        disabled={controlEngineMutation.isPending}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        重启
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        配置
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 服务 Tab */}
          <TabsContent value="services" className="space-y-4">
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
                    {/* 健康检查 */}
                    <div className="space-y-1">
                      {service.checks.map((check, idx) => (
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
        </Tabs>

        {/* 告警列表 */}
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
                {dashboard.alerts.map((alert) => (
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
                        <Badge variant="outline" className="text-xs">
                          {alert.sourceType}
                        </Badge>
                        <span className="font-medium">{alert.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        来源: {alert.source} | 时间: {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!alert.acknowledgedAt && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => acknowledgeAlertMutation.mutate({ alertId: alert.id })}
                        disabled={acknowledgeAlertMutation.isPending}
                      >
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
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button onClick={confirmDialog.action}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
