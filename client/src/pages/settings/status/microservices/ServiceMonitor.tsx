/**
 * 微服务详细监控页面
 * 数据源: trpc.microservice.getServiceHealth + trpc.microservice.getSystemResources
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock, Wifi } from 'lucide-react';
import { trpc } from '@/lib/trpc';

const statusConfig: Record<string, { icon: any; label: string; color: string }> = {
  healthy: { icon: CheckCircle, label: '健康', color: 'text-green-500' },
  connected: { icon: CheckCircle, label: '已连接', color: 'text-green-500' },
  degraded: { icon: AlertTriangle, label: '降级', color: 'text-yellow-500' },
  unhealthy: { icon: XCircle, label: '异常', color: 'text-red-500' },
  disconnected: { icon: XCircle, label: '未连接', color: 'text-red-500' },
};

function getResourceColor(value: number): string {
  if (value >= 90) return 'text-red-500';
  if (value >= 70) return 'text-yellow-500';
  return 'text-green-500';
}

export default function ServiceMonitor() {
  const { data: services, isLoading, refetch } = trpc.microservice.getServiceHealth.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: sysResources } = trpc.microservice.getSystemResources.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const serviceList = Array.isArray(services) ? services : services?.services ? services.services : [];
  const healthyCount = serviceList.filter((s: any) => s.status === 'healthy' || s.status === 'connected').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" />
              服务详细监控
            </h1>
            <p className="text-muted-foreground">
              {serviceList.length} 个服务 · {healthyCount} 个健康
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 系统资源概览 */}
        {sysResources && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CPU</CardDescription>
                <CardTitle className={`text-xl ${getResourceColor(sysResources.cpu.usage)}`}>
                  {sysResources.cpu.usage}%
                </CardTitle>
              </CardHeader>
              <CardContent><Progress value={sysResources.cpu.usage} className="h-1.5" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>内存</CardDescription>
                <CardTitle className={`text-xl ${getResourceColor(sysResources.memory.usagePercent)}`}>
                  {sysResources.memory.usagePercent}%
                </CardTitle>
              </CardHeader>
              <CardContent><Progress value={sysResources.memory.usagePercent} className="h-1.5" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Node.js</CardDescription>
                <CardTitle className="text-xl">{sysResources.nodeVersion}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>负载均值</CardDescription>
                <CardTitle className="text-xl">{sysResources.loadAverage?.[0]?.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* 服务列表 */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-40" /></CardContent></Card>
            ))}
          </div>
        ) : serviceList.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Server className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无服务数据</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  后端服务健康检查未返回数据。请确认服务正常运行。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceList.map((service: any) => {
              const cfg = statusConfig[service.status] || statusConfig.disconnected;
              const StatusIcon = cfg.icon;
              return (
                <Card key={service.name || service.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base truncate">{service.name || service.id}</CardTitle>
                      <Badge variant={service.status === 'healthy' || service.status === 'connected' ? 'default' : 'destructive'}
                        className={service.status === 'healthy' || service.status === 'connected' ? 'bg-green-600' : ''}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <CardDescription>{service.type || service.protocol || '-'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {service.latency != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> 延迟</span>
                        <span className="font-medium">{service.latency}ms</span>
                      </div>
                    )}
                    {service.host && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1"><Wifi className="h-3 w-3" /> 地址</span>
                        <span className="font-mono text-xs">{service.host}:{service.port || '-'}</span>
                      </div>
                    )}
                    {service.resources && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">CPU</span>
                          <span className={`font-medium ${getResourceColor(service.resources.cpu)}`}>
                            {service.resources.cpu}%
                          </span>
                        </div>
                        <Progress value={service.resources.cpu} className="h-1.5" />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">内存</span>
                          <span className={`font-medium ${getResourceColor(service.resources.memory)}`}>
                            {service.resources.memory}%
                          </span>
                        </div>
                        <Progress value={service.resources.memory} className="h-1.5" />
                      </div>
                    )}
                    {service.version && (
                      <div className="text-xs text-muted-foreground pt-1">版本: {service.version}</div>
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
