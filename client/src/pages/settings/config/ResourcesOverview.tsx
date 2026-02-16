/**
 * 资源总览页面
 * 数据源: trpc.microservice.getSystemResources（真实 OS 数据）
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Cpu, MemoryStick, HardDrive, RefreshCw, Clock, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

export default function ResourcesOverview() {
  const { data: resources, isLoading, refetch } = trpc.microservice.getSystemResources.useQuery(undefined, {
    refetchInterval: 5000,
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">资源总览</h1>
            <p className="text-muted-foreground">系统资源实时监控</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24" /></CardContent></Card>
            ))}
          </div>
        ) : !resources ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Server className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">无法获取资源数据</h3>
                <p className="text-xs text-muted-foreground max-w-sm">请检查后端服务是否正常运行</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 核心资源卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> CPU 使用率
                  </CardDescription>
                  <CardTitle className="text-2xl">{resources.cpu.usage}%</CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={resources.cpu.usage} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{resources.cpu.cores} 核 · {resources.cpu.model}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <MemoryStick className="h-3 w-3" /> 内存使用率
                  </CardDescription>
                  <CardTitle className="text-2xl">{resources.memory.usagePercent}%</CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={resources.memory.usagePercent} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(resources.memory.used)} / {formatBytes(resources.memory.total)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 系统运行时间
                  </CardDescription>
                  <CardTitle className="text-2xl">{formatUptime(resources.uptime)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">进程运行: {formatUptime(resources.processUptime)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Activity className="h-3 w-3" /> 系统负载
                  </CardDescription>
                  <CardTitle className="text-2xl">
                    {resources.loadAverage?.[0]?.toFixed(2) || '-'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    1m: {resources.loadAverage?.[0]?.toFixed(2)} · 5m: {resources.loadAverage?.[1]?.toFixed(2)} · 15m: {resources.loadAverage?.[2]?.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 系统信息 */}
            <Card>
              <CardHeader>
                <CardTitle>系统信息</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">主机名</span>
                    <p className="font-medium">{resources.hostname}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">平台</span>
                    <p className="font-medium">{resources.platform}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Node.js</span>
                    <p className="font-medium">{resources.nodeVersion}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">可用内存</span>
                    <p className="font-medium">{formatBytes(resources.memory.free)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
