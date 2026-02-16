/**
 * 微服务监控总览页面
 * 数据源: trpc.microservice.getServiceHealth + trpc.docker.listEngines
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Activity, RefreshCw, CheckCircle, XCircle, Container } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function ServicesOverview() {
  const { data: services, isLoading: servicesLoading, refetch: refetchServices } = trpc.microservice.getServiceHealth.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: dockerData, isLoading: dockerLoading } = trpc.docker.listEngines.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const serviceList = Array.isArray(services) ? services : services?.services ? services.services : [];
  const containers = dockerData?.engines || [];
  const healthyCount = serviceList.filter((s: any) => s.status === 'healthy' || s.status === 'connected').length;
  const runningContainers = containers.filter((c: any) => c.status === 'running').length;
  const isLoading = servicesLoading || dockerLoading;

  const handleRefresh = () => {
    refetchServices();
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">微服务监控</h1>
            <p className="text-muted-foreground">服务集群与容器运行状态总览</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>服务总数</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : serviceList.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>健康服务</CardDescription>
              <CardTitle className="text-2xl text-green-500">{isLoading ? <Skeleton className="h-8 w-12" /> : healthyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>容器总数</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : containers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>运行中容器</CardDescription>
              <CardTitle className="text-2xl text-green-500">{isLoading ? <Skeleton className="h-8 w-12" /> : runningContainers}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-32" /></CardContent></Card>
            ))}
          </div>
        ) : serviceList.length === 0 && containers.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Server className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无服务数据</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  后端服务和 Docker 容器均未检测到。请确认服务正常运行。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 后端服务健康状态 */}
            {serviceList.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-5 w-5" /> 后端服务
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {serviceList.map((s: any) => (
                    <Card key={s.name || s.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{s.name || s.id}</CardTitle>
                          <Badge variant={s.status === 'healthy' || s.status === 'connected' ? 'default' : 'destructive'}
                            className={s.status === 'healthy' || s.status === 'connected' ? 'bg-green-500' : ''}>
                            {s.status === 'healthy' || s.status === 'connected' ? '健康' : s.status}
                          </Badge>
                        </div>
                        <CardDescription>{s.type || s.protocol || '-'}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">延迟</p>
                            <p className="text-lg font-bold">{s.latency || '-'}ms</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">端口</p>
                            <p className="text-lg font-bold">{s.port || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">版本</p>
                            <p className="text-sm font-bold truncate">{s.version || '-'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Docker 容器状态 */}
            {containers.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Container className="h-5 w-5" /> Docker 容器
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {containers.map((c: any) => (
                    <Card key={c.containerName || c.name}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base truncate">{c.containerName || c.name}</CardTitle>
                          {c.status === 'running' ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <CardDescription className="truncate text-xs">{c.image || '-'}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-xs">
                          <Badge variant={c.status === 'running' ? 'default' : 'secondary'} className={c.status === 'running' ? 'bg-green-600' : ''}>
                            {c.status === 'running' ? '运行中' : c.status}
                          </Badge>
                          <span className="text-muted-foreground">{c.uptime || '-'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
