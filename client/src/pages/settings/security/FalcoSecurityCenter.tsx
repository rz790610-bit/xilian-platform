/**
 * 安全中心
 * 数据源: Docker 容器概览（trpc.docker.listEngines）+ 安全工具部署状态
 * Falco / Trivy / Semgrep / Gitleaks 均未部署 → 显示配置引导
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, AlertTriangle, Activity, RefreshCw, CheckCircle, XCircle,
  Bug, Code, Key, FileSearch, Info, Container, ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

function ToolCard({ name, description, icon: Icon, docUrl, status }: {
  name: string; description: string; icon: any; docUrl: string; status: 'not_deployed' | 'connected';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {name}
          </CardTitle>
          <Badge variant={status === 'connected' ? 'default' : 'secondary'}
            className={status === 'connected' ? 'bg-green-600' : ''}>
            {status === 'connected' ? '已连接' : '未部署'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={docUrl} target="_blank" rel="noopener">
            <ExternalLink className="h-3 w-3 mr-1" />
            部署指南
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function FalcoSecurityCenter() {
  const { data: dockerData, isLoading, refetch } = trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 15000 });
  const { data: connection } = trpc.docker.checkConnection.useQuery(undefined, { refetchInterval: 30000 });

  const containers = dockerData?.engines || [];
  const runningCount = containers.filter((c: any) => c.status === 'running').length;
  const unhealthyCount = containers.filter((c: any) => c.health && c.health !== 'healthy').length;
  const stoppedCount = containers.filter((c: any) => c.status !== 'running').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-500" />
              安全中心
            </h1>
            <p className="text-muted-foreground">容器安全 · 漏洞扫描 · 代码审计 · 密钥泄露检测</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 安全概览 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <CardDescription>已停止</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">{isLoading ? <Skeleton className="h-8 w-12" /> : stoppedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>异常</CardDescription>
              <CardTitle className="text-2xl text-red-500">{isLoading ? <Skeleton className="h-8 w-12" /> : unhealthyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>安全工具</CardDescription>
              <CardTitle className="text-2xl text-amber-500">0/4</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">安全概览</TabsTrigger>
            <TabsTrigger value="containers">容器状态</TabsTrigger>
            <TabsTrigger value="tools">安全工具</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* 部署状态提示 */}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">安全工具待部署</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      当前安全中心显示 Docker 容器基础安全状态。完整安全能力需要部署以下工具：
                      Falco（运行时安全）、Trivy（漏洞扫描）、Semgrep（代码审计）、Gitleaks（密钥泄露检测）。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 安全评分 */}
            <Card>
              <CardHeader>
                <CardTitle>安全评估</CardTitle>
                <CardDescription>基于当前容器运行状态的安全评估</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-3xl font-bold text-green-500">{runningCount}</p>
                    <p className="text-sm text-muted-foreground">正常运行容器</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-3xl font-bold text-amber-500">{unhealthyCount}</p>
                    <p className="text-sm text-muted-foreground">健康检查异常</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-3xl font-bold text-muted-foreground">{stoppedCount}</p>
                    <p className="text-sm text-muted-foreground">已停止容器</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="containers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>容器安全状态</CardTitle>
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
                        <TableHead>容器</TableHead>
                        <TableHead>镜像</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>健康检查</TableHead>
                        <TableHead>运行时间</TableHead>
                        <TableHead>风险</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containers.map((c: any) => {
                        const hasHealthIssue = c.health && c.health !== 'healthy';
                        const isStopped = c.status !== 'running';
                        return (
                          <TableRow key={c.containerName || c.name}>
                            <TableCell className="font-medium">{c.containerName || c.name}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[180px] truncate">{c.image || '-'}</TableCell>
                            <TableCell>
                              <Badge className={c.status === 'running' ? 'bg-green-600' : ''} variant={c.status === 'running' ? 'default' : 'secondary'}>
                                {c.status === 'running' ? '运行中' : c.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {c.health ? (
                                <Badge variant="outline" className={c.health === 'healthy' ? 'text-green-400' : 'text-red-400'}>
                                  {c.health}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.uptime || '-'}</TableCell>
                            <TableCell>
                              {hasHealthIssue ? (
                                <Badge variant="destructive">高</Badge>
                              ) : isStopped ? (
                                <Badge variant="secondary">中</Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-400">低</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tools" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ToolCard
                name="Falco"
                description="基于 eBPF 的运行时安全引擎，实时检测容器逃逸、权限提升、异常进程、加密挖矿等威胁。"
                icon={Shield}
                docUrl="https://falco.org/docs/getting-started/"
                status="not_deployed"
              />
              <ToolCard
                name="Trivy"
                description="全面的容器镜像漏洞扫描器，支持 OS 包、语言依赖、IaC 配置、密钥泄露检测。"
                icon={Bug}
                docUrl="https://aquasecurity.github.io/trivy/"
                status="not_deployed"
              />
              <ToolCard
                name="Semgrep"
                description="轻量级静态代码分析工具，支持 30+ 编程语言的安全规则扫描和自定义规则。"
                icon={Code}
                docUrl="https://semgrep.dev/docs/getting-started/"
                status="not_deployed"
              />
              <ToolCard
                name="Gitleaks"
                description="Git 仓库密钥泄露检测工具，扫描提交历史中的 API 密钥、密码、令牌等敏感信息。"
                icon={Key}
                docUrl="https://github.com/gitleaks/gitleaks"
                status="not_deployed"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
