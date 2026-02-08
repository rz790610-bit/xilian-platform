/**
 * Outbox 发布器管理页面
 * CDC + 轮询混合发布，延迟 <100ms，故障自动切换
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Play, Trash2
} from 'lucide-react';

export default function OutboxManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState('');

  // tRPC 查询
  const { data: stats, refetch: refetchStats } = trpc.outbox.getStats.useQuery();
  const { data: events, refetch: refetchEvents } = trpc.outbox.listEvents.useQuery({
    status: filterStatus === 'all' ? undefined : filterStatus as any,
    eventType: filterType || undefined,
    limit: 50,
    offset: 0,
  });
  const { data: routingConfigs } = trpc.outbox.listRoutingConfigs.useQuery();

  // tRPC mutations
  const retryMutation = trpc.outbox.retryAllFailed.useMutation({
    onSuccess: (data: { success: boolean; affected: number }) => {
      toast.success(`已重试 ${data.affected} 个失败事件`);
      refetchStats();
      refetchEvents();
    },
    onError: (err: { message: string }) => toast.error(`重试失败: ${err.message}`),
  });

  const cleanupMutation = trpc.outbox.cleanupPublished.useMutation({
    onSuccess: (data: { deleted: number }) => {
      toast.success(`已清理 ${data.deleted} 个旧事件`);
      refetchStats();
      refetchEvents();
    },
    onError: (err: { message: string }) => toast.error(`清理失败: ${err.message}`),
  });

  const handleRefresh = () => {
    refetchStats();
    refetchEvents();
    toast.success('数据已刷新');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="warning">待处理</Badge>;
      case 'processing': return <Badge variant="info">处理中</Badge>;
      case 'published': return <Badge variant="success">已发布</Badge>;
      case 'failed': return <Badge variant="danger">失败</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <MainLayout title="Outbox 发布器">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="总事件" value={stats?.total || 0} icon="📤" />
        <StatCard label="待处理" value={stats?.pending || 0} icon="⏳" />
        <StatCard label="处理中" value={stats?.processing || 0} icon="⚡" />
        <StatCard label="已发布" value={stats?.published || 0} icon="✅" />
        <StatCard label="失败" value={stats?.failed || 0} icon="❌" />
        <StatCard
          label="CDC 状态"
          value={stats?.publisherMetrics?.cdcHealthy ? '健康' : '不可用'}
          icon="🔄"
        />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={stats?.publisherMetrics?.isRunning ? 'success' : 'danger'}>
            {stats?.publisherMetrics?.isRunning ? '发布器运行中' : '发布器已停止'}
          </Badge>
          {stats?.publisherMetrics && (
            <Badge variant="info">
              CDC {stats.publisherMetrics.cdcHealthy ? '可用' : '不可用'} | 已配置 {stats.publisherMetrics.configuredEventTypes} 种事件
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => retryMutation.mutate()}>
            <Play className="w-4 h-4 mr-1" />
            重试失败
          </Button>
          <Button variant="outline" size="sm" onClick={() => cleanupMutation.mutate({ retentionDays: 30 })}>
            <Trash2 className="w-4 h-4 mr-1" />
            清理旧事件
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">事件列表</TabsTrigger>
          <TabsTrigger value="routing">路由配置</TabsTrigger>
          <TabsTrigger value="metrics">发布器指标</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <PageCard>
            {/* 过滤器 */}
            <div className="flex gap-4 p-4 border-b border-border">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="状态过滤" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="processing">处理中</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="按事件类型过滤..."
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-[200px]"
              />
            </div>

            {/* 事件表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">事件ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">类型</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">聚合</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">状态</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">重试</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {events?.events?.map((event: any) => (
                    <tr key={event.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{event.eventId?.substring(0, 16)}...</td>
                      <td className="p-3">{event.eventType}</td>
                      <td className="p-3">{event.aggregateType}/{event.aggregateId}</td>
                      <td className="p-3">{getStatusBadge(event.status)}</td>
                      <td className="p-3">{event.retryCount || 0}</td>
                      <td className="p-3 text-muted-foreground">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {(!events?.events || events.events.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        暂无事件数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="routing">
          <PageCard>
            <div className="p-4">
              <h3 className="font-semibold mb-4">事件路由配置</h3>
              <div className="space-y-3">
                {routingConfigs?.map((config: any) => (
                  <div key={config.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{config.eventPattern}</div>
                      <div className="text-sm text-muted-foreground">
                        目标: {config.targetTopic} | 策略: {config.publishStrategy}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={config.isActive ? 'success' : 'danger'}>
                        {config.isActive ? '启用' : '禁用'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        优先级: {config.priority}
                      </span>
                    </div>
                  </div>
                ))}
                {(!routingConfigs || routingConfigs.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无路由配置，系统使用默认路由策略
                  </div>
                )}
              </div>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="metrics">
          <PageCard>
            <div className="p-4">
              <h3 className="font-semibold mb-4">发布器运行指标</h3>
              {stats?.publisherMetrics && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">运行状态</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.isRunning ? '运行中' : '已停止'}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">CDC 健康</div>
                    <div className="text-lg font-semibold">
                      {stats.publisherMetrics.cdcHealthy ? '是' : '否'}
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">配置事件类型</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.configuredEventTypes}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">已发布总数</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.publishedCount}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">失败总数</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.failedCount}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">CDC 发布</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.cdcPublished}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">轮询发布</div>
                    <div className="text-lg font-semibold">{stats.publisherMetrics.pollingPublished}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">最后发布时间</div>
                    <div className="text-lg font-semibold">
                      {stats.publisherMetrics.lastPublishTime
                        ? new Date(stats.publisherMetrics.lastPublishTime).toLocaleString()
                        : '无'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
