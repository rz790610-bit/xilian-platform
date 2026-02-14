/**
 * 微服务监控总览页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Server, Activity, RefreshCw, Zap, ArrowUpRight, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function ServicesOverview() {
  const [refreshing, setRefreshing] = useState(false);
  const [services] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 服务注册」中配置微服务集群连接');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">微服务监控</h1>
            <p className="text-muted-foreground">Go 高并发微服务集群状态</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshing(!refreshing)}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        {services.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Server className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无微服务</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  配置服务注册中心连接后，Go 微服务集群状态将实时显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置服务注册
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map((s: any) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    <Badge variant={s.status === 'healthy' ? 'default' : 'destructive'} className={s.status === 'healthy' ? 'bg-green-500' : ''}>
                      {s.status === 'healthy' ? '健康' : '告警'}
                    </Badge>
                  </div>
                  <CardDescription>副本: {s.replicas}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">QPS</p>
                      <p className="text-lg font-bold">{(s.qps / 1000).toFixed(1)}K</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P99 延迟</p>
                      <p className="text-lg font-bold">{s.latency}ms</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">错误率</p>
                      <p className="text-lg font-bold">{s.errorRate}%</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span>CPU</span><span>{s.cpu}%</span></div>
                    <Progress value={s.cpu} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span>Memory</span><span>{s.memory}%</span></div>
                    <Progress value={s.memory} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
