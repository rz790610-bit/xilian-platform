/**
 * Saga 补偿管理页面
 * 分批回滚 + 检查点恢复，支持部分成功、断点续传
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Play, RotateCcw
} from 'lucide-react';

export default function SagaManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('instances');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [rollbackForm, setRollbackForm] = useState({
    triggerId: `rollback_${Date.now()}`,
    targetType: 'config' as 'rule' | 'model' | 'config' | 'firmware',
    targetId: '',
    fromVersion: '',
    toVersion: '',
    reason: '',
  });

  // tRPC 查询
  const { data: stats, refetch: refetchStats } = trpc.saga.getStats.useQuery();
  const { data: sagas, refetch: refetchSagas } = trpc.saga.listSagas.useQuery({
    status: filterStatus === 'all' ? undefined : filterStatus as any,
    limit: 50,
    offset: 0,
  });
  const { data: deadLetters, refetch: refetchDeadLetters } = trpc.saga.listDeadLetters.useQuery({
    limit: 20,
    offset: 0,
  });

  // tRPC mutations
  const executeRollbackMutation = trpc.saga.executeRollback.useMutation({
    onSuccess: (data: { sagaId: string }) => {
      toast.success(`回滚 Saga 已启动: ${data.sagaId}`);
      setShowRollbackDialog(false);
      refetchStats();
      refetchSagas();
    },
    onError: (err: { message: string }) => toast.error(`启动失败: ${err.message}`),
  });

  const resumeSagaMutation = trpc.saga.resumeSaga.useMutation({
    onSuccess: () => {
      toast.success('Saga 恢复执行已触发');
      refetchStats();
      refetchSagas();
    },
    onError: (err: { message: string }) => toast.error(`恢复失败: ${err.message}`),
  });

  const retryDeadLetterMutation = trpc.saga.retryDeadLetter.useMutation({
    onSuccess: () => {
      toast.success('死信重试已触发');
      refetchDeadLetters();
    },
    onError: (err: { message: string }) => toast.error(`重试失败: ${err.message}`),
  });

  const handleRefresh = () => {
    refetchStats();
    refetchSagas();
    refetchDeadLetters();
    toast.success('数据已刷新');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge variant="info">运行中</Badge>;
      case 'completed': return <Badge variant="success">已完成</Badge>;
      case 'failed': return <Badge variant="danger">失败</Badge>;
      case 'compensating': return <Badge variant="warning">补偿中</Badge>;
      case 'compensated': return <Badge variant="default">已补偿</Badge>;
      case 'partial': return <Badge variant="warning">部分完成</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <MainLayout title="Saga 补偿管理">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <StatCard label="总数" value={stats?.total || 0} icon="🔄" />
        <StatCard label="运行中" value={stats?.running || 0} icon="▶️" />
        <StatCard label="已完成" value={stats?.completed || 0} icon="✅" />
        <StatCard label="失败" value={stats?.failed || 0} icon="❌" />
        <StatCard label="已补偿" value={stats?.compensated || 0} icon="↩️" />
        <StatCard label="部分完成" value={stats?.partial || 0} icon="⚠️" />
        <StatCard label="死信队列" value={stats?.deadLetters || 0} icon="💀" />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <Badge variant={stats?.orchestratorMetrics?.isRunning ? 'success' : 'danger'}>
          编排器 {stats?.orchestratorMetrics?.isRunning ? '运行中' : '已停止'}
        </Badge>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => setShowRollbackDialog(true)}>
            <RotateCcw className="w-4 h-4 mr-1" />
            新建回滚
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="instances">Saga 实例</TabsTrigger>
          <TabsTrigger value="deadletters">
            死信队列
            {(stats?.deadLetters || 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-danger/20 text-danger rounded-full">
                {stats?.deadLetters}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="metrics">编排器指标</TabsTrigger>
        </TabsList>

        <TabsContent value="instances">
          <PageCard>
            {/* 过滤器 */}
            <div className="flex gap-4 p-4 border-b border-border">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="状态过滤" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="running">运行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                  <SelectItem value="compensating">补偿中</SelectItem>
                  <SelectItem value="compensated">已补偿</SelectItem>
                  <SelectItem value="partial">部分完成</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Saga 列表 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Saga ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">名称</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">状态</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">步骤进度</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">创建时间</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sagas?.sagas?.map((saga: any) => (
                    <tr key={saga.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{saga.sagaId?.substring(0, 16)}...</td>
                      <td className="p-3">{saga.sagaName}</td>
                      <td className="p-3">{getStatusBadge(saga.status)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={(saga.currentStep / saga.totalSteps) * 100} className="w-20 h-2" />
                          <span className="text-xs text-muted-foreground">
                            {saga.currentStep}/{saga.totalSteps}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {saga.createdAt ? new Date(saga.createdAt).toLocaleString() : '-'}
                      </td>
                      <td className="p-3">
                        {(saga.status === 'failed' || saga.status === 'partial') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resumeSagaMutation.mutate({ sagaId: saga.sagaId })}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            恢复
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!sagas?.sagas || sagas.sagas.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        暂无 Saga 实例
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="deadletters">
          <PageCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Saga ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">步骤</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">错误</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">重试次数</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">时间</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetters?.deadLetters?.map((dl: any) => (
                    <tr key={dl.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{dl.sagaId?.substring(0, 16)}...</td>
                      <td className="p-3">{dl.stepName}</td>
                      <td className="p-3 text-danger max-w-[300px] truncate">{dl.errorMessage}</td>
                      <td className="p-3">{dl.retryCount}</td>
                      <td className="p-3 text-muted-foreground">
                        {dl.createdAt ? new Date(dl.createdAt).toLocaleString() : '-'}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryDeadLetterMutation.mutate({ deadLetterId: dl.id })}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          重试
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!deadLetters?.deadLetters || deadLetters.deadLetters.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        死信队列为空
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="metrics">
          <PageCard>
            <div className="p-4">
              <h3 className="font-semibold mb-4">编排器运行指标</h3>
              {stats?.orchestratorMetrics && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">运行状态</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.isRunning ? '运行中' : '已停止'}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">注册 Saga 数</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.registeredSagas}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">总执行次数</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.totalExecuted}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">已完成</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.completed}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">已补偿</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.compensated}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">失败</div>
                    <div className="text-lg font-semibold">{stats.orchestratorMetrics.failed}</div>
                  </div>
                </div>
              )}
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>

      {/* 新建回滚对话框 */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建批量回滚</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">目标类型</label>
              <Select
                value={rollbackForm.targetType}
                onValueChange={(v) => setRollbackForm(f => ({ ...f, targetType: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule">规则</SelectItem>
                  <SelectItem value="model">模型</SelectItem>
                  <SelectItem value="config">配置</SelectItem>
                  <SelectItem value="firmware">固件</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">目标 ID</label>
              <Input
                value={rollbackForm.targetId}
                onChange={(e) => setRollbackForm(f => ({ ...f, targetId: e.target.value }))}
                placeholder="输入目标 ID"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">源版本</label>
                <Input
                  value={rollbackForm.fromVersion}
                  onChange={(e) => setRollbackForm(f => ({ ...f, fromVersion: e.target.value }))}
                  placeholder="v2.0.0"
                />
              </div>
              <div>
                <label className="text-sm font-medium">目标版本</label>
                <Input
                  value={rollbackForm.toVersion}
                  onChange={(e) => setRollbackForm(f => ({ ...f, toVersion: e.target.value }))}
                  placeholder="v1.9.0"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">回滚原因</label>
              <Input
                value={rollbackForm.reason}
                onChange={(e) => setRollbackForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="输入回滚原因"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>取消</Button>
            <Button
              onClick={() => executeRollbackMutation.mutate(rollbackForm)}
              disabled={!rollbackForm.targetId || !rollbackForm.fromVersion || !rollbackForm.toVersion}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              启动回滚
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
