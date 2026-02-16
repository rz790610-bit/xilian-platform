/**
 * Falco 运行时安全监控页面
 * 数据源: Falco 未部署 → 显示 Docker 容器安全概览 + 部署引导
 * 容器数据来自: trpc.docker.listEngines
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, AlertTriangle, Activity, Eye, RefreshCw, Download, Bell,
  CheckCircle, XCircle, Clock, Container, Info
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function FalcoMonitor() {
  const { data: dockerData, isLoading, refetch } = trpc.docker.listEngines.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const { data: connection } = trpc.docker.checkConnection.useQuery(undefined, { refetchInterval: 30000 });

  const containers = dockerData?.engines || [];
  const runningCount = containers.filter((c: any) => c.status === 'running').length;
  const unhealthyCount = containers.filter((c: any) => c.health && c.health !== 'healthy').length;

  return (
    <MainLayout title="Falco 监控">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              运行时安全监控
            </h1>
            <p className="text-sm text-muted-foreground">容器运行时安全事件监控</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>

        {/* Falco 未部署提示 */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-400">Falco 运行时安全引擎未部署</p>
                <p className="text-xs text-muted-foreground mt-1">
                  当前显示 Docker 容器安全概览。如需完整的运行时安全监控（容器逃逸检测、异常进程检测、敏感文件访问告警等），
                  请部署 <a href="https://falco.org/docs/getting-started/" target="_blank" rel="noopener" className="text-blue-400 underline">Falco</a> 并配置 gRPC 输出。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 概览统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>容器总数</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : containers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>运行中</CardDescription>
              <CardTitle className="text-2xl text-green-500">{isLoading ? <Skeleton className="h-8 w-12" /> : runningCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>异常容器</CardDescription>
              <CardTitle className="text-2xl text-red-500">{isLoading ? <Skeleton className="h-8 w-12" /> : unhealthyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Docker 引擎</CardDescription>
              <CardTitle className="text-2xl">
                {connection?.connected ? (
                  <Badge variant="outline" className="text-green-400">已连接</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-400">未连接</Badge>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="containers">
          <TabsList>
            <TabsTrigger value="containers">
              <Container className="h-4 w-4 mr-1" />
              容器安全概览
            </TabsTrigger>
            <TabsTrigger value="events">
              <Bell className="h-4 w-4 mr-1" />
              安全事件
            </TabsTrigger>
          </TabsList>

          <TabsContent value="containers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>容器运行状态</CardTitle>
                <CardDescription>Docker 容器健康与安全状态</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : containers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Container className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>未检测到 Docker 容器</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>容器名称</TableHead>
                        <TableHead>镜像</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>健康检查</TableHead>
                        <TableHead>运行时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containers.map((c: any) => (
                        <TableRow key={c.containerName || c.name}>
                          <TableCell className="font-medium">{c.containerName || c.name}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{c.image || '-'}</TableCell>
                          <TableCell>
                            {c.status === 'running' ? (
                              <Badge className="bg-green-600">运行中</Badge>
                            ) : (
                              <Badge variant="secondary">{c.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {c.health ? (
                              <Badge variant="outline" className={c.health === 'healthy' ? 'text-green-400' : 'text-yellow-400'}>
                                {c.health === 'healthy' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                {c.health}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">无健康检查</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{c.uptime || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center">
                  <Shield className="h-16 w-16 text-muted-foreground mb-4 opacity-30" />
                  <h3 className="text-sm font-medium mb-1">安全事件需要 Falco</h3>
                  <p className="text-xs text-muted-foreground max-w-md mb-4">
                    运行时安全事件（容器逃逸、权限提升、异常网络连接、加密挖矿检测等）需要部署 Falco 安全引擎。
                    Falco 通过 eBPF 内核探针实时监控系统调用，无需修改容器镜像。
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://falco.org/docs/getting-started/" target="_blank" rel="noopener">
                      查看 Falco 部署指南
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
