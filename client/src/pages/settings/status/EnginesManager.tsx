/**
 * 引擎模块页面
 * 数据源: trpc.docker.listEngines + trpc.docker.checkConnection
 * 显示 Docker 容器引擎的真实运行状态
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Cog, RefreshCw, Play, Square, RotateCcw, Loader2, Container, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function EnginesManager() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: connection, isLoading: connLoading } = trpc.docker.checkConnection.useQuery(undefined, { refetchInterval: 30000 });
  const { data: enginesData, isLoading, refetch } = trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 10000 });

  const startMutation = trpc.docker.startEngine.useMutation({
    onSuccess: (r) => { toast.success(r.message || '引擎已启动'); refetch(); setActionLoading(null); },
    onError: (e) => { toast.error('启动失败: ' + e.message); setActionLoading(null); },
  });
  const stopMutation = trpc.docker.stopEngine.useMutation({
    onSuccess: (r) => { toast.success(r.message || '引擎已停止'); refetch(); setActionLoading(null); },
    onError: (e) => { toast.error('停止失败: ' + e.message); setActionLoading(null); },
  });
  const restartMutation = trpc.docker.restartEngine.useMutation({
    onSuccess: (r) => { toast.success(r.message || '引擎已重启'); refetch(); setActionLoading(null); },
    onError: (e) => { toast.error('重启失败: ' + e.message); setActionLoading(null); },
  });
  const startAllMutation = trpc.docker.startAll.useMutation({
    onSuccess: (r) => { toast.success(`已启动 ${r.started}/${r.total} 个引擎`); refetch(); },
    onError: (e) => toast.error('批量启动失败: ' + e.message),
  });

  const engines = enginesData?.engines || [];
  const runningCount = engines.filter((e: any) => e.status === 'running').length;

  const handleAction = (name: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${name}-${action}`);
    if (action === 'start') startMutation.mutate({ containerName: name });
    else if (action === 'stop') stopMutation.mutate({ containerName: name });
    else restartMutation.mutate({ containerName: name });
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
      running: { label: '运行中', variant: 'default' },
      exited: { label: '已停止', variant: 'secondary' },
      created: { label: '已创建', variant: 'secondary' },
      restarting: { label: '重启中', variant: 'default' },
      dead: { label: '异常', variant: 'destructive' },
    };
    return map[status] || { label: status, variant: 'secondary' as const };
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">引擎模块</h1>
            <p className="text-muted-foreground">管理和监控 Docker 容器引擎</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => startAllMutation.mutate()} disabled={startAllMutation.isPending}>
              <Play className="h-4 w-4 mr-2" />
              全部启动
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </Button>
          </div>
        </div>

        {/* 连接状态 */}
        <div className="flex items-center gap-4">
          {connLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : connection?.connected ? (
            <Badge variant="outline" className="text-green-400 border-green-400/30">
              <Wifi className="h-3 w-3 mr-1" />
              Docker Engine 已连接 (v{connection.version})
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-400 border-red-400/30">
              <WifiOff className="h-3 w-3 mr-1" />
              Docker Engine 未连接
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {engines.length} 个引擎 · {runningCount} 个运行中
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-32" /></CardContent></Card>
            ))}
          </div>
        ) : engines.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Container className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无容器引擎</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  Docker Engine 中没有发现 PortAI 相关容器。请确认容器已创建。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {engines.map((e: any) => {
              const s = statusLabel(e.status);
              const isActionLoading = actionLoading?.startsWith(e.containerName || e.name);
              return (
                <Card key={e.containerName || e.name}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base truncate">{e.containerName || e.name}</CardTitle>
                      <Badge variant={s.variant} className={e.status === 'running' ? 'bg-green-600' : ''}>
                        {s.label}
                      </Badge>
                    </div>
                    <CardDescription className="truncate text-xs">{e.image || '-'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">端口</span>
                        <p className="font-mono">{e.ports?.length > 0 ? e.ports.map((p: any) => typeof p === 'string' ? p : `${p.hostPort || '?'}→${p.containerPort || '?'}`).join(', ') : '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">运行时间</span>
                        <p>{e.uptime || '-'}</p>
                      </div>
                    </div>
                    {e.health && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">健康状态: </span>
                        <Badge variant="outline" className={e.health === 'healthy' ? 'text-green-400' : 'text-yellow-400'}>
                          {e.health}
                        </Badge>
                      </div>
                    )}
                    <div className="flex gap-1">
                      {e.status !== 'running' ? (
                        <Button variant="outline" size="sm" className="flex-1" disabled={!!isActionLoading}
                          onClick={() => handleAction(e.containerName || e.name, 'start')}>
                          {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                          启动
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="flex-1" disabled={!!isActionLoading}
                          onClick={() => handleAction(e.containerName || e.name, 'stop')}>
                          {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 mr-1" />}
                          停止
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="flex-1" disabled={!!isActionLoading}
                        onClick={() => handleAction(e.containerName || e.name, 'restart')}>
                        {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                        重启
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
