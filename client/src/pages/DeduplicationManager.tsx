/**
 * 事件去重管理页面
 * Redis 辅助去重 + 异步刷盘，热路径检查延迟 0.5ms
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Trash2, Search, Shield, Database,
  CheckCircle, XCircle
} from 'lucide-react';

export default function DeduplicationManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('status');
  const [checkEventId, setCheckEventId] = useState('');
  const [checkGroup, setCheckGroup] = useState('default');

  // tRPC 查询
  // getStatus 返回: { totalChecks, duplicatesFound, redisHits, mysqlHits, flushedToDb, flushErrors, isRunning, pendingFlush, hitRate }
  const { data: status, refetch: refetchStatus } = trpc.deduplication.getStatus.useQuery();
  const { data: processedEvents, refetch: refetchProcessed } = trpc.deduplication.listProcessedEvents.useQuery({
    limit: 50,
    offset: 0,
  });
  const { data: idempotentRecords, refetch: refetchIdempotent } = trpc.deduplication.listIdempotentRecords.useQuery({
    limit: 50,
    offset: 0,
  });

  // checkDuplicate 是 query，不是 mutation；但前端需要手动触发，所以用 useQuery + enabled
  const [checkEnabled, setCheckEnabled] = useState(false);
  const { data: checkResult, refetch: refetchCheck } = trpc.deduplication.checkDuplicate.useQuery(
    { eventId: checkEventId, consumerGroup: checkGroup },
    { enabled: checkEnabled && !!checkEventId }
  );

  const cleanupMutation = trpc.deduplication.cleanupExpired.useMutation({
    onSuccess: (data: { deletedEvents: number; deletedRecords: number }) => {
      toast.success(`已清理 ${data.deletedEvents} 个过期事件，${data.deletedRecords} 条幂等记录`);
      refetchProcessed();
      refetchIdempotent();
    },
    onError: (err: { message: string }) => toast.error(`清理失败: ${err.message}`),
  });

  const handleCheck = () => {
    if (!checkEventId) return;
    setCheckEnabled(true);
    refetchCheck().then(({ data }) => {
      if (data?.isDuplicate) {
        toast.error(`事件 ${checkEventId} 是重复的`);
      } else {
        toast.success(`事件 ${checkEventId} 不是重复的`);
      }
    });
  };

  const handleRefresh = () => {
    refetchStatus();
    refetchProcessed();
    refetchIdempotent();
    toast.success('数据已刷新');
  };

  return (
    <MainLayout title="事件去重">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="服务状态" value={status?.isRunning ? '运行中' : '已停止'} icon="🔒" />
        <StatCard label="总检查" value={status?.totalChecks || 0} icon="🔍" />
        <StatCard label="重复发现" value={status?.duplicatesFound || 0} icon="🔄" />
        <StatCard label="命中率" value={status?.hitRate || '0%'} icon="🎯" />
        <StatCard label="Redis 命中" value={status?.redisHits || 0} icon="💾" />
        <StatCard label="MySQL 命中" value={status?.mysqlHits || 0} icon="📊" />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={status?.isRunning ? 'success' : 'danger'}>
            {status?.isRunning ? '去重服务运行中' : '去重服务已停止'}
          </Badge>
          <Badge variant="info">
            待刷盘: {status?.pendingFlush || 0}
          </Badge>
          <Badge variant="info">
            已刷盘: {status?.flushedToDb || 0}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => cleanupMutation.mutate()}>
            <Trash2 className="w-4 h-4 mr-1" />
            清理过期
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="status">运行状态</TabsTrigger>
          <TabsTrigger value="check">去重检查</TabsTrigger>
          <TabsTrigger value="events">已处理事件</TabsTrigger>
          <TabsTrigger value="idempotent">幂等记录</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 去重架构 */}
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  去重架构
                </h3>
                <div className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">热路径 (Redis)</h4>
                    <div className="text-sm text-muted-foreground">
                      <p>Bloom Filter + SET 双层检查</p>
                      <p>检查延迟: ~0.5ms</p>
                      <p>Redis 命中: {status?.redisHits || 0}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">冷路径 (MySQL)</h4>
                    <div className="text-sm text-muted-foreground">
                      <p>异步刷盘 + 唯一索引保证</p>
                      <p>MySQL 命中: {status?.mysqlHits || 0}</p>
                      <p>已刷盘: {status?.flushedToDb || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            </PageCard>

            {/* 性能指标 */}
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  性能指标
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">去重命中率</span>
                      <span className="text-sm font-mono">{status?.hitRate || '0%'}</span>
                    </div>
                    <Progress value={parseFloat(status?.hitRate || '0')} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">总检查次数</div>
                      <div className="text-lg font-semibold">{status?.totalChecks || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">重复发现</div>
                      <div className="text-lg font-semibold">{status?.duplicatesFound || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">待刷盘数量</div>
                      <div className="text-lg font-semibold">{status?.pendingFlush || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">刷盘错误</div>
                      <div className="text-lg font-semibold">{status?.flushErrors || 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </PageCard>
          </div>
        </TabsContent>

        <TabsContent value="check">
          <PageCard>
            <div className="p-4">
              <h3 className="font-semibold mb-4">手动去重检查</h3>
              <div className="flex gap-4 mb-4">
                <Input
                  placeholder="输入事件 ID"
                  value={checkEventId}
                  onChange={(e) => setCheckEventId(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="消费者组"
                  value={checkGroup}
                  onChange={(e) => setCheckGroup(e.target.value)}
                  className="w-[200px]"
                />
                <Button
                  onClick={handleCheck}
                  disabled={!checkEventId}
                >
                  <Search className="w-4 h-4 mr-1" />
                  检查
                </Button>
              </div>
              {checkResult && (
                <div className={`p-4 rounded-lg ${checkResult.isDuplicate ? 'bg-danger/10 border border-danger/20' : 'bg-success/10 border border-success/20'}`}>
                  <div className="flex items-center gap-2">
                    {checkResult.isDuplicate ? (
                      <XCircle className="w-5 h-5 text-danger" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-success" />
                    )}
                    <span className="font-medium">
                      {checkResult.isDuplicate ? '重复事件' : '非重复事件'}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    检查来源: {checkResult.source} |
                    耗时: {checkResult.checkTimeMs}ms
                  </div>
                </div>
              )}
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="events">
          <PageCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">事件 ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">消费者组</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">处理时间</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">过期时间</th>
                  </tr>
                </thead>
                <tbody>
                  {processedEvents?.events?.map((event: any) => (
                    <tr key={event.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{event.eventId}</td>
                      <td className="p-3">{event.consumerGroup}</td>
                      <td className="p-3 text-muted-foreground">
                        {event.processedAt ? new Date(event.processedAt).toLocaleString() : '-'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {event.expiresAt ? new Date(event.expiresAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {(!processedEvents?.events || processedEvents.events.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        暂无已处理事件
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="idempotent">
          <PageCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">幂等键</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">操作</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">状态</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {idempotentRecords?.records?.map((record: any) => (
                    <tr key={record.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{record.idempotencyKey}</td>
                      <td className="p-3">{record.operationType}</td>
                      <td className="p-3">
                        <Badge variant={record.status === 'completed' ? 'success' : record.status === 'failed' ? 'danger' : 'warning'}>
                          {record.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {record.createdAt ? new Date(record.createdAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {(!idempotentRecords?.records || idempotentRecords.records.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        暂无幂等记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
