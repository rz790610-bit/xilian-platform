/**
 * 插件管理页面
 * 数据源: trpc.plugin.list（真实插件引擎数据）
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Puzzle, RefreshCw, Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const typeLabels: Record<string, string> = {
  source: '数据源',
  processor: '处理器',
  sink: '输出',
  analyzer: '分析器',
  visualizer: '可视化',
  integration: '集成',
  utility: '工具',
};

export default function PluginsManager() {
  const { data: plugins, isLoading, refetch } = trpc.plugin.list.useQuery(undefined, { refetchInterval: 15000 });
  const enableMutation = trpc.plugin.enable.useMutation({
    onSuccess: () => { toast.success('插件已启用'); refetch(); },
    onError: (e) => toast.error('操作失败: ' + e.message),
  });
  const disableMutation = trpc.plugin.disable.useMutation({
    onSuccess: () => { toast.success('插件已禁用'); refetch(); },
    onError: (e) => toast.error('操作失败: ' + e.message),
  });

  const pluginList = Array.isArray(plugins) ? plugins : [];

  const handleToggle = (id: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      disableMutation.mutate({ id });
    } else {
      enableMutation.mutate({ id });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">插件管理</h1>
            <p className="text-muted-foreground">管理系统扩展插件 · {pluginList.length} 个已注册</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24" /></CardContent></Card>
            ))}
          </div>
        ) : pluginList.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Puzzle className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无插件</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  插件引擎中没有注册的插件。系统启动时会自动注册内置插件。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pluginList.map((p: any) => {
              const isActive = p.status === 'active' || p.enabled;
              const isMutating = enableMutation.isPending || disableMutation.isPending;
              return (
                <Card key={p.id || p.name}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base truncate">{p.name || p.id}</CardTitle>
                      <Switch
                        checked={isActive}
                        disabled={isMutating}
                        onCheckedChange={() => handleToggle(p.id || p.name, isActive)}
                      />
                    </div>
                    <CardDescription className="line-clamp-2">{p.description || '-'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <Badge variant="outline">{typeLabels[p.type] || p.type || '-'}</Badge>
                        {p.version && <Badge variant="outline">v{p.version}</Badge>}
                      </div>
                      <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-600' : ''}>
                        {isActive ? '已启用' : '已禁用'}
                      </Badge>
                    </div>
                    {p.metrics && (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        <span>处理: {p.metrics.processed || 0}</span>
                        <span>错误: {p.metrics.errors || 0}</span>
                      </div>
                    )}
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
