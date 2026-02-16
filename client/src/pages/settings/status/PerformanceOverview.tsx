/**
 * 性能优化总览页面
 * 展示所有 v1.9 性能优化模块的综合状态
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Activity, ArrowUpRight
} from 'lucide-react';

export default function PerformanceOverview() {
  const toast = useToast();

  // 获取各模块状态
  const { data: outboxStats, refetch: refetchOutbox } = trpc.outbox.getStats.useQuery();
  const { data: sagaStats, refetch: refetchSaga } = trpc.saga.getStats.useQuery();
  const { data: samplingStatus, refetch: refetchSampling } = trpc.adaptiveSampling.getStatus.useQuery();
  const { data: dedupStatus, refetch: refetchDedup } = trpc.deduplication.getStatus.useQuery();
  const { data: replicaStats, refetch: refetchReplica } = trpc.readReplica.getStats.useQuery();
  const { data: graphStats, refetch: refetchGraph } = trpc.graphQuery.getStats.useQuery();

  const handleRefreshAll = () => {
    refetchOutbox();
    refetchSaga();
    refetchSampling();
    refetchDedup();
    refetchReplica();
    refetchGraph();
    toast.success('所有模块数据已刷新');
  };

  // 计算模块健康状态
  const modules = [
    {
      name: 'Outbox 发布器',
      icon: '📤',
      status: outboxStats?.publisherMetrics?.isRunning ? 'healthy' : 'stopped',
      metrics: outboxStats ? [
        { label: '待处理', value: outboxStats.pending },
        { label: '已发布', value: outboxStats.published },
        { label: '失败', value: outboxStats.failed },
      ] : [],
      path: '/settings/status/performance/outbox',
    },
    {
      name: 'Saga 补偿',
      icon: '🔄',
      status: sagaStats?.orchestratorMetrics?.isRunning ? 'healthy' : 'stopped',
      metrics: sagaStats ? [
        { label: '运行中', value: sagaStats.running },
        { label: '已完成', value: sagaStats.completed },
        { label: '死信', value: sagaStats.deadLetters },
      ] : [],
      path: '/settings/status/performance/saga',
    },
    {
      name: '自适应采样',
      icon: '📉',
      status: samplingStatus?.isRunning ? 'healthy' : 'stopped',
      metrics: samplingStatus ? [
        { label: '检查次数', value: samplingStatus.totalChecks },
        { label: '调整次数', value: samplingStatus.adjustmentsMade },
        { label: '状态', value: samplingStatus.currentOverallStatus },
      ] : [],
      path: '/settings/status/performance/sampling',
    },
    {
      name: '事件去重',
      icon: '🔒',
      status: dedupStatus?.isRunning ? 'healthy' : 'stopped',
      metrics: dedupStatus ? [
        { label: '检查总数', value: dedupStatus.totalChecks },
        { label: '重复发现', value: dedupStatus.duplicatesFound },
        { label: '命中率', value: dedupStatus.hitRate },
      ] : [],
      path: '/settings/status/performance/dedup',
    },
    {
      name: '读写分离',
      icon: '📊',
      status: replicaStats?.isRunning ? 'healthy' : 'stopped',
      metrics: replicaStats ? [
        { label: '总读取', value: replicaStats.totalReads },
        { label: '总写入', value: replicaStats.totalWrites },
        { label: '副本数', value: replicaStats.replicaCount },
      ] : [],
      path: '/settings/status/performance/replica',
    },
    {
      name: '图查询优化',
      icon: '🗂️',
      status: graphStats?.isRunning ? 'healthy' : 'stopped',
      metrics: graphStats ? [
        { label: '总查询', value: graphStats.totalQueries },
        { label: '缓存命中', value: graphStats.cacheHits },
        { label: '索引数', value: graphStats.indexCount },
      ] : [],
      path: '/settings/status/performance/graph',
    },
  ];

  const healthyCount = modules.filter(m => m.status === 'healthy').length;
  const totalCount = modules.length;

  return (
    <MainLayout title="性能优化总览">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="模块总数" value={totalCount} icon="⚡" />
        <StatCard label="运行中" value={healthyCount} icon="✅" />
        <StatCard label="已停止" value={totalCount - healthyCount} icon="⏸️" />
        <StatCard
          label="Outbox 待处理"
          value={outboxStats?.pending || 0}
          icon="📤"
        />
        <StatCard
          label="Saga 运行中"
          value={sagaStats?.running || 0}
          icon="🔄"
        />
        <StatCard
          label="去重命中率"
          value={dedupStatus?.hitRate || '0%'}
          icon="🔒"
        />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={healthyCount === totalCount ? 'success' : 'warning'}>
            {healthyCount}/{totalCount} 模块运行中
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll}>
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新全部
        </Button>
      </div>

      {/* 模块卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {modules.map((module) => (
          <PageCard key={module.name}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{module.icon}</span>
                  <h3 className="font-semibold">{module.name}</h3>
                </div>
                <Badge variant={module.status === 'healthy' ? 'success' : 'danger'}>
                  {module.status === 'healthy' ? '运行中' : '已停止'}
                </Badge>
              </div>

              {module.metrics.length > 0 && (
                <div className="space-y-2">
                  {module.metrics.map((metric) => (
                    <div key={metric.label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{metric.label}</span>
                      <span className="font-mono font-medium">{metric.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => window.location.href = module.path}
                >
                  查看详情
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          </PageCard>
        ))}
      </div>

      {/* 系统架构说明 */}
      <PageCard>
        <div className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            v1.9 性能优化架构
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium text-primary">数据可靠性</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• CDC + 轮询混合发布：延迟 &lt;100ms，故障自动切换</li>
                <li>• Saga 补偿机制：分批回滚 + 检查点恢复</li>
                <li>• Redis 辅助去重：热路径检查延迟 0.5ms</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-primary">性能优化</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 自适应采样：容量问题 1 分钟内响应</li>
                <li>• 读写分离：主库负载降低 50%</li>
                <li>• 图查询优化：Neo4j Cypher 查询快 10 倍</li>
              </ul>
            </div>
          </div>
        </div>
      </PageCard>
    </MainLayout>
  );
}
