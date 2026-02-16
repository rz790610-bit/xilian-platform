/**
 * 数据库管理页面
 * 数据源: trpc.monitoring.getDatabaseStatus（真实数据库连接状态）
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, RefreshCw, Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

const statusIcon = (status: string) => {
  if (status === 'healthy' || status === 'connected' || status === 'online') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === 'degraded' || status === 'warning') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
};

const statusLabel = (status: string) => {
  const map: Record<string, { label: string; color: string }> = {
    healthy: { label: '健康', color: 'bg-green-600' },
    connected: { label: '已连接', color: 'bg-green-600' },
    online: { label: '在线', color: 'bg-green-600' },
    degraded: { label: '降级', color: 'bg-yellow-600' },
    warning: { label: '警告', color: 'bg-yellow-600' },
    disconnected: { label: '未连接', color: 'bg-red-600' },
    offline: { label: '离线', color: 'bg-red-600' },
    error: { label: '错误', color: 'bg-red-600' },
  };
  return map[status] || { label: status, color: '' };
};

export default function DbManagement() {
  const { data: databases, isLoading, refetch } = trpc.monitoring.getDatabaseStatus.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const actionMutation = trpc.monitoring.executeDatabaseAction.useMutation({
    onSuccess: (r) => { toast.success(r.message || '操作成功'); refetch(); },
    onError: (e) => toast.error('操作失败: ' + e.message),
  });

  const dbList = Array.isArray(databases) ? databases : [];
  const onlineCount = dbList.filter((d: any) => d.status === 'healthy' || d.status === 'connected' || d.status === 'online').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">数据库管理</h1>
            <p className="text-muted-foreground">管理和监控所有数据库实例 · {dbList.length} 个实例 · {onlineCount} 个在线</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新状态
          </Button>
        </div>

        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总实例</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : dbList.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>在线</CardDescription>
              <CardTitle className="text-2xl text-green-500">{isLoading ? <Skeleton className="h-8 w-12" /> : onlineCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>离线</CardDescription>
              <CardTitle className="text-2xl text-red-500">{isLoading ? <Skeleton className="h-8 w-12" /> : dbList.length - onlineCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>数据源</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : <Badge variant="outline">实时监控</Badge>}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 数据库列表 */}
        <Card>
          <CardHeader>
            <CardTitle>数据库实例</CardTitle>
            <CardDescription>当前已注册的数据库连接</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : dbList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无数据库实例</h3>
                <p className="text-xs text-muted-foreground max-w-sm">监控服务未检测到数据库连接</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>主机</TableHead>
                    <TableHead>延迟</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbList.map((db: any) => {
                    const s = statusLabel(db.status);
                    return (
                      <TableRow key={db.name || db.type}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {statusIcon(db.status)}
                            {db.name || db.type}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{db.type || '-'}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{db.host || db.connection?.host || '-'}:{db.port || db.connection?.port || '-'}</TableCell>
                        <TableCell>{db.latency ? `${db.latency}ms` : db.responseTime ? `${db.responseTime}ms` : '-'}</TableCell>
                        <TableCell>
                          <Badge className={s.color}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm"
                              onClick={() => actionMutation.mutate({ databaseName: db.name || db.type, action: 'optimize' })}
                              disabled={actionMutation.isPending}>
                              优化
                            </Button>
                            <Button variant="ghost" size="sm"
                              onClick={() => actionMutation.mutate({ databaseName: db.name || db.type, action: 'backup' })}
                              disabled={actionMutation.isPending}>
                              备份
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
