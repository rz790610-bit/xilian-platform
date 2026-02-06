/**
 * 读写分离管理页面
 * 只读副本分离，主库负载降低 50%
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Database
} from 'lucide-react';

export default function ReadReplicaManager() {
  const toast = useToast();

  // tRPC 查询
  // getStats 返回: ReadWriteStats & { isRunning, replicaCount, healthyCount }
  const { data: stats, refetch: refetchStats } = trpc.readReplica.getStats.useQuery();
  // listReplicas 返回: ReplicaStatus[]
  const { data: replicas, refetch: refetchReplicas } = trpc.readReplica.listReplicas.useQuery();

  const handleRefresh = () => {
    refetchStats();
    refetchReplicas();
    toast.success('数据已刷新');
  };

  return (
    <MainLayout title="读写分离">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        <StatCard label="服务状态" value={stats?.isRunning ? '运行中' : '已停止'} icon="🔀" />
        <StatCard label="副本数" value={stats?.replicaCount || 0} icon="📦" />
        <StatCard label="健康副本" value={stats?.healthyCount || 0} icon="✅" />
        <StatCard label="总读取" value={stats?.totalReads || 0} icon="📖" />
        <StatCard label="总写入" value={stats?.totalWrites || 0} icon="✏️" />
        <StatCard label="副本读取" value={stats?.replicaReads || 0} icon="📋" />
        <StatCard label="主库读取" value={stats?.primaryReads || 0} icon="🏠" />
        <StatCard label="读取比例" value={stats?.readRatio || '0%'} icon="📊" />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={stats?.isRunning ? 'success' : 'danger'}>
            {stats?.isRunning ? '读写分离运行中' : '读写分离已停止'}
          </Badge>
          <Badge variant="info">
            平均读延迟: {stats?.avgReadLatencyMs || 0}ms
          </Badge>
          <Badge variant="info">
            平均写延迟: {stats?.avgWriteLatencyMs || 0}ms
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 读写分布 */}
        <PageCard>
          <div className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              读写分布
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm">副本读取占比</span>
                  <span className="text-sm font-mono">{stats?.readRatio || '0%'}</span>
                </div>
                <Progress value={parseFloat(stats?.readRatio || '0')} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">总读取</div>
                  <div className="text-lg font-semibold">{stats?.totalReads || 0}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">总写入</div>
                  <div className="text-lg font-semibold">{stats?.totalWrites || 0}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">副本读取</div>
                  <div className="text-lg font-semibold">{stats?.replicaReads || 0}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">主库读取</div>
                  <div className="text-lg font-semibold">{stats?.primaryReads || 0}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">平均读延迟</div>
                  <div className="text-lg font-semibold">{stats?.avgReadLatencyMs || 0}ms</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">平均写延迟</div>
                  <div className="text-lg font-semibold">{stats?.avgWriteLatencyMs || 0}ms</div>
                </div>
              </div>
            </div>
          </div>
        </PageCard>

        {/* 副本状态 */}
        <PageCard>
          <div className="p-4">
            <h3 className="font-semibold mb-4">只读副本状态</h3>
            <div className="space-y-3">
              {replicas?.map((replica: any) => (
                <div key={replica.id} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{replica.id}</span>
                      <Badge variant={replica.isHealthy ? 'success' : 'danger'}>
                        {replica.isHealthy ? '健康' : '异常'}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{replica.host}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">延迟: </span>
                      <span className="font-mono">{replica.lagSeconds}s</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">连接: </span>
                      <span className="font-mono">{replica.activeConnections}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">查询: </span>
                      <span className="font-mono">{replica.totalQueries}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">响应: </span>
                      <span className="font-mono">{replica.avgResponseTimeMs}ms</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">复制延迟</span>
                      <span className="text-xs font-mono">{replica.lagSeconds}s</span>
                    </div>
                    <Progress
                      value={Math.min((replica.lagSeconds / 10) * 100, 100)}
                      className="h-1.5"
                    />
                  </div>
                </div>
              ))}
              {(!replicas || replicas.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  暂无只读副本配置
                </div>
              )}
            </div>
          </div>
        </PageCard>
      </div>
    </MainLayout>
  );
}
