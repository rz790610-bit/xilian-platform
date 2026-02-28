/**
 * OperationsDashboard — 技术运维仪表盘
 *
 * 路由: /monitoring/operations
 * 数据源: trpc.observabilityHub.getOperationsView (30 秒轮询)
 *
 * 布局:
 * - 6 个指标卡片 (系统状态/CPU/内存/请求率/错误率/设备在线率)
 * - 5 个 Tab (告警/熔断器/EventBus/评估/指标)
 */

import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Activity,
  Cpu,
  HardDrive,
  Zap,
  AlertTriangle,
  Server,
  RefreshCw,
  Shield,
  Radio,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ── Severity badge helper ──

function severityBadge(severity: string) {
  const variant =
    severity === 'critical' || severity === 'high'
      ? 'destructive' as const
      : severity === 'medium' || severity === 'low' || severity === 'warning'
        ? 'warning' as const
        : 'secondary' as const;
  return <Badge variant={variant}>{severity}</Badge>;
}

// ── Status helpers ──

const STATUS_COLOR: Record<string, string> = {
  healthy: 'text-green-500',
  degraded: 'text-yellow-500',
  critical: 'text-red-500',
  unknown: 'text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  healthy: '正常',
  degraded: '降级',
  critical: '故障',
  unknown: '未知',
};

// ── Component ──

export default function OperationsDashboard() {
  const { data, isLoading, refetch } = trpc.observabilityHub.getOperationsView.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  const refreshMut = trpc.observabilityHub.refresh.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading || !data) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </MainLayout>
    );
  }

  const statusColor = STATUS_COLOR[data.systemHealth.status] ?? 'text-gray-500';
  const statusLabel = STATUS_LABEL[data.systemHealth.status] ?? '未知';

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageCard
          title="运维监控中枢"
          icon={<Activity className="w-5 h-5" />}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          }
        >
          {/* ── 指标卡片 ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              value={statusLabel}
              label="系统状态"
              icon={<Shield className={`w-5 h-5 ${statusColor}`} />}
            />
            <StatCard
              value={`${(data.performance.cpuUsage ?? 0).toFixed(1)}%`}
              label="CPU 使用率"
              icon={<Cpu className="w-5 h-5" />}
            />
            <StatCard
              value={`${(data.performance.memoryUsage ?? 0).toFixed(1)}%`}
              label="内存使用率"
              icon={<HardDrive className="w-5 h-5" />}
            />
            <StatCard
              value={`${(data.performance.requestRate ?? 0).toFixed(0)}/s`}
              label="请求率"
              icon={<Zap className="w-5 h-5" />}
            />
            <StatCard
              value={`${((data.performance.errorRate ?? 0) * 100).toFixed(2)}%`}
              label="错误率"
              icon={<AlertTriangle className="w-5 h-5" />}
            />
            <StatCard
              value={`${data.devices.onlineRate}%`}
              label="设备在线率"
              icon={<Server className="w-5 h-5" />}
            />
          </div>

          {/* ── Tab 区域 ── */}
          <Tabs defaultValue="alerts" className="mt-6">
            <TabsList>
              <TabsTrigger value="alerts">
                告警
                {data.alerts.critical > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs">
                    {data.alerts.critical}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="circuit-breakers">熔断器</TabsTrigger>
              <TabsTrigger value="eventbus">EventBus</TabsTrigger>
              <TabsTrigger value="evaluation">评估</TabsTrigger>
              <TabsTrigger value="metrics">指标</TabsTrigger>
            </TabsList>

            {/* ── 告警 Tab ── */}
            <TabsContent value="alerts">
              <Card>
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4 border-b">
                    <Badge variant="destructive">严重 {data.alerts.critical}</Badge>
                    <Badge variant="warning">警告 {data.alerts.warning}</Badge>
                    <Badge variant="secondary">信息 {data.alerts.info}</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>级别</TableHead>
                        <TableHead>标题</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.alerts.recentAlerts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            暂无告警
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.alerts.recentAlerts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>{severityBadge(a.severity)}</TableCell>
                            <TableCell>{a.title}</TableCell>
                            <TableCell className="text-muted-foreground">{a.source}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(a.createdAt).toLocaleString('zh-CN')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── 熔断器 Tab ── */}
            <TabsContent value="circuit-breakers">
              <Card>
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4 border-b text-sm text-muted-foreground">
                    共 {data.circuitBreakers.total} 个
                    <span className="text-green-500">{data.circuitBreakers.closed} 闭合</span>
                    <span className="text-yellow-500">{data.circuitBreakers.halfOpen} 半开</span>
                    <span className="text-red-500">{data.circuitBreakers.open} 断开</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>调用次数</TableHead>
                        <TableHead>失败次数</TableHead>
                        <TableHead>平均延迟</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.circuitBreakers.entries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            暂无熔断器数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.circuitBreakers.entries.map((cb) => (
                          <TableRow key={cb.name}>
                            <TableCell className="font-mono text-sm">{cb.name}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  cb.state === 'open'
                                    ? 'destructive'
                                    : cb.state === 'halfOpen'
                                      ? 'warning'
                                      : 'success'
                                }
                              >
                                {cb.state === 'closed' ? '闭合' : cb.state === 'open' ? '断开' : '半开'}
                              </Badge>
                            </TableCell>
                            <TableCell>{cb.fires}</TableCell>
                            <TableCell>{cb.failures}</TableCell>
                            <TableCell>{cb.latencyMean.toFixed(1)} ms</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── EventBus Tab ── */}
            <TabsContent value="eventbus">
              <Card>
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4 border-b text-sm text-muted-foreground">
                    <span>
                      <Radio className="w-4 h-4 inline mr-1" />
                      发布 {data.eventBus.totalPublished} 条
                    </span>
                    <span>失败 {data.eventBus.totalFailed} 条</span>
                    <span>活跃主题 {data.eventBus.activeTopics} 个</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>事件ID</TableHead>
                        <TableHead>主题</TableHead>
                        <TableHead>级别</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.eventBus.recentEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            暂无事件
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.eventBus.recentEvents.map((e) => (
                          <TableRow key={e.eventId}>
                            <TableCell className="font-mono text-xs">
                              {e.eventId.slice(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{e.topic}</Badge>
                            </TableCell>
                            <TableCell>{severityBadge(e.severity)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {e.source ?? '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(e.timestamp).toLocaleString('zh-CN')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── 评估 Tab ── */}
            <TabsContent value="evaluation">
              <Card>
                <CardContent className="p-6">
                  {data.evaluation ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <div className="text-2xl font-bold">
                          {data.evaluation.avgScore.toFixed(1)}
                        </div>
                        <div className="text-sm text-muted-foreground">平均评分</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-500">
                          {data.evaluation.improvingCount}
                        </div>
                        <div className="text-sm text-muted-foreground">改善中模块</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-500">
                          {data.evaluation.regressingCount}
                        </div>
                        <div className="text-sm text-muted-foreground">退化中模块</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {data.evaluation.topRecommendation ?? '暂无推荐'}
                        </div>
                        <div className="text-sm text-muted-foreground">最佳推荐</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      评估模块未就绪
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── 指标 Tab ── */}
            <TabsContent value="metrics">
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-8 h-8 text-blue-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {data.metrics.nexusMetricsCount}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Nexus 指标数量
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-purple-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {data.metrics.evoMetricsCount}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          进化引擎指标数量
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* ── 页脚时间 ── */}
          <div className="mt-4 text-xs text-muted-foreground text-right">
            更新时间: {new Date(data.generatedAt).toLocaleString('zh-CN')}
          </div>
        </PageCard>
      </div>
    </MainLayout>
  );
}
