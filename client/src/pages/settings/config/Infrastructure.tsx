import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import {
  Server, HardDrive, Network, Shield,
  RefreshCw, Plus, Activity, Database, Lock,
  AlertTriangle, CheckCircle, XCircle,
  Box, Container, Key, Trash2,
  RotateCcw, StopCircle, PlayCircle, Loader2, Terminal
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

// ============ Docker 引擎管理面板 ============
function DockerEnginePanel() {
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [logsTarget, setLogsTarget] = useState('');
  const [logsTargetName, setLogsTargetName] = useState('');

  const { data: dockerConn, refetch: refetchConn } = trpc.docker.checkConnection.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: engineData, refetch: refetchEngines } = trpc.docker.listEngines.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: logsData } = trpc.docker.getEngineLogs.useQuery(
    { containerName: logsTarget, tail: 100 },
    { enabled: !!logsTarget && showLogsDialog }
  );

  const startMut = trpc.docker.startEngine.useMutation({
    onSuccess: (res: any) => {
      if (res.success) toast.success(`${res.containerName} 启动成功`);
      else toast.error(`启动失败: ${res.error}`);
      refetchEngines(); setActionLoading(null);
    },
    onError: (e: any) => { toast.error(e.message); setActionLoading(null); },
  });
  const stopMut = trpc.docker.stopEngine.useMutation({
    onSuccess: (res: any) => {
      if (res.success) toast.success(`${res.containerName} 已停止`);
      else toast.error(`停止失败: ${res.error}`);
      refetchEngines(); setActionLoading(null);
    },
    onError: (e: any) => { toast.error(e.message); setActionLoading(null); },
  });
  const restartMut = trpc.docker.restartEngine.useMutation({
    onSuccess: (res: any) => {
      if (res.success) toast.success(`${res.containerName} 重启成功`);
      else toast.error(`重启失败: ${res.error}`);
      refetchEngines(); setActionLoading(null);
    },
    onError: (e: any) => { toast.error(e.message); setActionLoading(null); },
  });
  const startAllMut = trpc.docker.startAll.useMutation({
    onSuccess: (res: any) => {
      toast.success(`批量启动完成: ${res.started}成功 / ${res.failed}失败`);
      refetchEngines(); setActionLoading(null);
    },
    onError: (e: any) => { toast.error(e.message); setActionLoading(null); },
  });
  const stopAllMut = trpc.docker.stopAll.useMutation({
    onSuccess: (res: any) => {
      toast.success(`批量停止完成: ${res.stopped}成功 / ${res.failed}失败`);
      refetchEngines(); setActionLoading(null);
    },
    onError: (e: any) => { toast.error(e.message); setActionLoading(null); },
  });

  const handleStart = (name: string) => { setActionLoading(`start-${name}`); startMut.mutate({ containerName: name }); };
  const handleStop = (name: string) => { setActionLoading(`stop-${name}`); stopMut.mutate({ containerName: name }); };
  const handleRestart = (name: string) => { setActionLoading(`restart-${name}`); restartMut.mutate({ containerName: name }); };
  const handleStartAll = () => { setActionLoading('start-all'); startAllMut.mutate(); };
  const handleStopAll = () => { setActionLoading('stop-all'); stopAllMut.mutate(); };
  const handleViewLogs = (containerName: string, displayName: string) => {
    setLogsTarget(containerName);
    setLogsTargetName(displayName);
    setShowLogsDialog(true);
  };

  const engines = engineData?.engines || [];
  const runningCount = engines.filter((e: any) => e.state === 'running').length;
  const totalCount = engines.length;
  const dockerConnected = dockerConn?.connected ?? false;

  const stateColors: Record<string, string> = {
    running: 'bg-emerald-500', exited: 'bg-red-500', paused: 'bg-amber-500',
    restarting: 'bg-blue-500', created: 'bg-gray-400', dead: 'bg-red-700', removing: 'bg-orange-500',
  };
  const stateLabels: Record<string, string> = {
    running: '运行中', exited: '已停止', paused: '已暂停',
    restarting: '重启中', created: '已创建', dead: '已崩溃', removing: '删除中',
  };

  return (
    <div className="space-y-6">
      {/* Docker 连接状态 + 批量操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", dockerConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            <span className="text-sm font-medium">
              {dockerConnected ? 'Docker Engine 已连接' : 'Docker Engine 未连接'}
            </span>
            {dockerConn?.version && <span className="text-xs text-muted-foreground">({dockerConn.version})</span>}
          </div>
          {dockerConnected && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-emerald-500 font-medium">{runningCount}</span>
              <span className="text-muted-foreground">/</span>
              <span>{totalCount}</span>
              <span className="text-muted-foreground">引擎运行中</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchConn(); refetchEngines(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
          {dockerConnected && (
            <>
              <Button size="sm" onClick={handleStartAll} disabled={!!actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                {actionLoading === 'start-all' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                一键启动全部
              </Button>
              <Button size="sm" variant="destructive" onClick={handleStopAll} disabled={!!actionLoading}>
                {actionLoading === 'stop-all' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <StopCircle className="w-4 h-4 mr-1" />}
                全部停止
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Docker 未连接提示 */}
      {!dockerConnected && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-amber-500">Docker Engine 未连接</p>
              <p className="text-sm text-muted-foreground">
                {dockerConn?.error || '无法连接到 Docker Engine。请确保 Docker Desktop 正在运行。'}
              </p>
              <div className="text-xs text-muted-foreground space-y-1 mt-3 font-mono bg-background/50 rounded p-3">
                <p># 检查 Docker 是否运行</p>
                <p>docker info</p>
                <p># 如果使用远程 Docker，设置环境变量</p>
                <p>DOCKER_HOST=tcp://your-docker-host:2375</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 引擎列表 */}
      {dockerConnected && (
        <div className="grid grid-cols-1 gap-4">
          {engines.map((engine: any) => {
            const isLoading = actionLoading?.includes(engine.containerName);
            return (
              <div key={engine.containerId} className={cn(
                "rounded-lg border p-4 transition-all",
                engine.state === 'running' ? "border-emerald-500/30 bg-emerald-500/5" :
                engine.state === 'exited' ? "border-red-500/20 bg-red-500/5" : "border-border bg-card"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-2xl">{engine.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{engine.displayName}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{engine.engineType}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-2 h-2 rounded-full", stateColors[engine.state] || 'bg-gray-400')} />
                          <span className={cn("text-xs font-medium", engine.state === 'running' ? 'text-emerald-500' : 'text-red-400')}>
                            {stateLabels[engine.state] || engine.state}
                          </span>
                        </div>
                        {engine.health && engine.health !== 'none' && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded",
                            engine.health === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' :
                            engine.health === 'unhealthy' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                          )}>{engine.health}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{engine.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>镜像: {engine.image}</span>
                        <span>ID: {engine.containerId}</span>
                        {engine.ports.length > 0 && (
                          <span>端口: {engine.ports.filter((p: any) => p.publicPort).map((p: any) => `${p.publicPort}→${p.privatePort}`).join(', ') || '-'}</span>
                        )}
                        {engine.uptime && <span>{engine.status}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleViewLogs(engine.containerName, engine.displayName)} title="查看日志">
                      <Terminal className="w-4 h-4" />
                    </Button>
                    {engine.canStart && (
                      <Button size="sm" onClick={() => handleStart(engine.containerName)} disabled={!!actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                        {isLoading && actionLoading?.startsWith('start') ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                        启动
                      </Button>
                    )}
                    {engine.canRestart && (
                      <Button variant="outline" size="sm" onClick={() => handleRestart(engine.containerName)} disabled={!!actionLoading}>
                        {isLoading && actionLoading?.startsWith('restart') ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                        重启
                      </Button>
                    )}
                    {engine.canStop && (
                      <Button variant="destructive" size="sm" onClick={() => {
                        if (engine.serviceName === 'mysql') { if (!confirm('❗ 停止 MySQL 将导致平台数据库不可用，确定继续？')) return; }
                        handleStop(engine.containerName);
                      }} disabled={!!actionLoading}>
                        {isLoading && actionLoading?.startsWith('stop') ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <StopCircle className="w-4 h-4 mr-1" />}
                        停止
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {engines.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Container className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>未发现 PortAI 引擎容器</p>
              <p className="text-xs mt-1">请确保已执行 docker-compose up -d</p>
            </div>
          )}
        </div>
      )}

      {/* 日志对话框 */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>容器日志 - {logsTargetName}</DialogTitle>
          </DialogHeader>
          <div className="bg-black/90 rounded-lg p-4 font-mono text-xs text-green-400 overflow-auto max-h-[60vh] whitespace-pre-wrap">
            {logsData?.success ? (logsData.logs || '(无日志)') : (<span className="text-red-400">{logsData?.error || '加载中...'}</span>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogsDialog(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ 主页面 ============
export default function Infrastructure() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [showCreateNetworkDialog, setShowCreateNetworkDialog] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');

  // tRPC 查询 — 全部基于 Docker API
  const { data: summary, refetch: refetchSummary } = trpc.infrastructure.getSummary.useQuery();
  const { data: overview } = trpc.infrastructure.getOverview.useQuery();
  const { data: health } = trpc.infrastructure.getHealth.useQuery();
  const { data: containers } = trpc.infrastructure.getContainers.useQuery();
  const { data: networks, refetch: refetchNetworks } = trpc.infrastructure.getNetworks.useQuery();
  const { data: volumes } = trpc.infrastructure.getVolumes.useQuery();
  const { data: storageDrivers } = trpc.infrastructure.getStorageDrivers.useQuery();
  const { data: secretsOverview } = trpc.infrastructure.getSecretsOverview.useQuery();
  const { data: secretCategories } = trpc.infrastructure.listSecretCategories.useQuery();

  const createNetworkMut = trpc.infrastructure.createNetwork.useMutation({
    onSuccess: () => {
      toast.success('Docker 网络已创建');
      refetchNetworks();
      setShowCreateNetworkDialog(false);
      setNewNetworkName('');
    },
    onError: (e: any) => toast.error(`创建失败: ${e.message}`),
  });
  const deleteNetworkMut = trpc.infrastructure.deleteNetwork.useMutation({
    onSuccess: () => { toast.success('Docker 网络已删除'); refetchNetworks(); },
    onError: (e: any) => toast.error(`删除失败: ${e.message}`),
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchNetworks();
    toast.success('数据已刷新');
  };

  const dockerData = summary?.docker ?? (overview as any)?.docker;
  const secretsData = summary?.secrets ?? (overview as any)?.secrets;

  return (
    <MainLayout title="基础设施管理">
      {/* 概览统计 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="容器总数" value={dockerData?.containers ?? 0} icon="📦" />
        <StatCard label="运行中" value={dockerData?.running ?? 0} icon="✅" />
        <StatCard label="镜像" value={dockerData?.images ?? 0} icon="💿" />
        <StatCard label="数据卷" value={dockerData?.volumes ?? 0} icon="💾" />
        <StatCard label="网络" value={summary?.networks ?? 0} icon="🌐" />
        <StatCard label="密钥配置" value={secretsData?.configured ?? 0} icon="🔑" />
      </div>

      {/* 主要内容区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">
            <Activity className="w-4 h-4 mr-2" />
            概览
          </TabsTrigger>
          <TabsTrigger value="engines">
            <Container className="w-4 h-4 mr-2" />
            引擎管理
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network className="w-4 h-4 mr-2" />
            网络
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="w-4 h-4 mr-2" />
            存储
          </TabsTrigger>
          <TabsTrigger value="secrets">
            <Key className="w-4 h-4 mr-2" />
            密钥管理
          </TabsTrigger>
        </TabsList>

        {/* Docker 概览 */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PageCard title="Docker 状态" icon={<Activity className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">连接状态</span>
                  <Badge variant={dockerData?.connected !== false ? 'success' : 'danger'}>
                    {dockerData?.connected !== false ? '已连接' : '未连接'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">容器总数</span>
                  <span className="font-medium">{dockerData?.containers ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">运行中</span>
                  <span className="font-medium text-green-600">{dockerData?.running ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">镜像数量</span>
                  <span className="font-medium">{dockerData?.images ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">数据卷</span>
                  <span className="font-medium">{dockerData?.volumes ?? 0}</span>
                </div>
              </div>
            </PageCard>

            <PageCard title="组件健康" icon={<Shield className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">整体状态</span>
                  <Badge variant={health?.status === 'healthy' ? 'success' : 'warning'}>
                    {health?.status === 'healthy' ? '健康' : (health as any)?.status ?? '检查中'}
                  </Badge>
                </div>
                {(health as any)?.components && Object.entries((health as any).components).map(([name, comp]: [string, any]) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-muted-foreground capitalize">{name}</span>
                    <Badge variant={comp?.status === 'connected' || comp?.status === 'healthy' ? 'success' : 'warning'}>
                      {comp?.status ?? '未知'}
                    </Badge>
                  </div>
                ))}
              </div>
            </PageCard>

            <PageCard title="容器列表" icon={<Box className="w-5 h-5" />} className="lg:col-span-2">
              <div className="space-y-3">
                {(containers as any[])?.map((c: any) => (
                  <div key={c.id || c.name} className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", c.state === 'running' ? "bg-green-500" : "bg-gray-400")} />
                        <span className="font-medium">{c.name}</span>
                      </div>
                      <Badge variant={c.state === 'running' ? 'success' : 'default'}>{c.state}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      镜像: {c.image} | 创建: {c.created ? new Date(c.created).toLocaleString() : '-'}
                    </div>
                  </div>
                )) ?? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Container className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>无容器数据</p>
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* Docker 引擎管理 */}
        <TabsContent value="engines">
          <DockerEnginePanel />
        </TabsContent>

        {/* Docker 网络 */}
        <TabsContent value="network">
          <PageCard title="Docker 网络" icon={<Network className="w-5 h-5" />}>
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => setShowCreateNetworkDialog(true)}>
                <Plus className="w-4 h-4 mr-2" /> 创建网络
              </Button>
            </div>
            <div className="space-y-3">
              {(networks as any[])?.map((net: any) => (
                <div key={net.id || net.name} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4" />
                      <span className="font-medium">{net.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{net.driver || 'bridge'}</Badge>
                      {net.scope && <Badge variant="default">{net.scope}</Badge>}
                      {!['bridge', 'host', 'none'].includes(net.name) && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          if (confirm(`确定删除网络 "${net.name}"？`)) deleteNetworkMut.mutate({ name: net.name });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {net.subnet && <div>子网: {net.subnet}</div>}
                    {net.gateway && <div>网关: {net.gateway}</div>}
                    {net.containers !== undefined && <div>容器数: {net.containers}</div>}
                    {net.internal !== undefined && <div>内部网络: {net.internal ? '是' : '否'}</div>}
                  </div>
                </div>
              )) ?? (
                <div className="text-center py-8 text-muted-foreground">
                  <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>无网络数据</p>
                </div>
              )}
            </div>
          </PageCard>
        </TabsContent>

        {/* Docker 存储 */}
        <TabsContent value="storage">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PageCard title="存储驱动" icon={<Database className="w-5 h-5" />}>
              <div className="space-y-4">
                {storageDrivers ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">驱动类型</span>
                      <span className="font-medium">{(storageDrivers as any)?.driver || 'overlay2'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">存储根目录</span>
                      <span className="font-mono text-sm">{(storageDrivers as any)?.root || '/var/lib/docker'}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">加载中...</p>
                  </div>
                )}
              </div>
            </PageCard>

            <PageCard title="Docker 数据卷" icon={<HardDrive className="w-5 h-5" />}>
              <div className="space-y-3">
                {(volumes as any[])?.map((vol: any) => (
                  <div key={vol.name} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium font-mono text-sm truncate">{vol.name}</span>
                      <Badge variant="default">{vol.driver || 'local'}</Badge>
                    </div>
                    {vol.mountpoint && (
                      <div className="text-xs text-muted-foreground truncate">挂载点: {vol.mountpoint}</div>
                    )}
                  </div>
                )) ?? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">无数据卷</p>
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 密钥管理 */}
        <TabsContent value="secrets">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PageCard title="密钥概览" icon={<Key className="w-5 h-5" />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">管理模式</span>
                  <Badge variant="default">{(secretsOverview as any)?.mode || '环境变量'}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">总密钥数</span>
                  <span className="font-medium">{(secretsOverview as any)?.total ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">已配置</span>
                  <span className="font-medium text-green-600">{(secretsOverview as any)?.configured ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">未配置</span>
                  <span className="font-medium text-yellow-600">{(secretsOverview as any)?.unconfigured ?? 0}</span>
                </div>
              </div>
            </PageCard>

            <PageCard title="密钥分类" icon={<Lock className="w-5 h-5" />}>
              <div className="space-y-3">
                {(secretCategories as any[])?.map((cat: any) => (
                  <div key={cat.id || cat.name} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{cat.name || cat.label}</span>
                      <Badge variant="default">{cat.count ?? 0} 项</Badge>
                    </div>
                    {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                  </div>
                )) ?? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">无分类数据</p>
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建网络对话框 */}
      <Dialog open={showCreateNetworkDialog} onOpenChange={setShowCreateNetworkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 Docker 网络</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">网络名称</label>
              <Input value={newNetworkName} onChange={(e) => setNewNetworkName(e.target.value)} placeholder="输入网络名称" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateNetworkDialog(false)}>取消</Button>
            <Button onClick={() => {
              if (!newNetworkName) { toast.error('请输入网络名称'); return; }
              createNetworkMut.mutate({ name: newNetworkName });
            }} disabled={createNetworkMut.isPending}>
              {createNetworkMut.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
