/**
 * 资源总览页面
 * 数据源: 待接入后端 API（系统监控服务）
 * 当前状态: 优雅降级 — 显示空状态 + 连接提示
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Server, RefreshCw, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function ResourcesOverview() {
  const [refreshing, setRefreshing] = useState(false);
  const [resources] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 监控」中配置 Prometheus / Grafana 连接');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">资源总览</h1>
            <p className="text-muted-foreground">系统资源使用情况监控</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleConnect}>
              <PlugZap className="h-4 w-4 mr-2" />
              连接监控
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>

        {resources.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Server className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无资源数据</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  连接 Prometheus 或系统监控服务后，CPU、内存、磁盘、网络等资源使用情况将实时显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置监控服务
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {resources.map((r: any) => (
              <Card key={r.name}>
                <CardHeader className="pb-2">
                  <CardDescription>{r.name}</CardDescription>
                  <CardTitle className="text-2xl">{r.value} {r.unit}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={(r.value / r.max) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">总量: {r.max} {r.unit}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
