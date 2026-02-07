import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { RefreshCw, Database, HardDrive, Server, Activity, Clock, Layers } from 'lucide-react';

export default function StorageStatus() {
  const toast = useToast();

  // tRPC 查询 - 存储引擎健康检查（实时检测）
  const { data: storageData, refetch: refetchStorage, isLoading: loadingStorage } =
    trpc.database.workbench.storage.healthCheck.useQuery(undefined, {
      refetchInterval: 30000, // 每30秒自动刷新
    });

  // tRPC 查询 - 汇总各模块统计
  const { data: assetStats, refetch: refetchAssets } = trpc.database.asset.getStats.useQuery();
  const { data: sliceStats, refetch: refetchSlices } = trpc.database.slice.getSliceStats.useQuery();
  const { data: eventStats, refetch: refetchEvents } = trpc.database.event.getEventStats.useQuery();
  const { data: qualityStats, refetch: refetchQuality } = trpc.database.clean.getQualityStats.useQuery();

  const handleRefresh = () => {
    refetchStorage();
    refetchAssets(); refetchSlices(); refetchEvents(); refetchQuality();
    toast.success('存储状态已刷新');
  };

  const engines = storageData?.engines ?? [];
  const summary = storageData?.summary;

  return (
    <MainLayout title="存储状态">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">存储引擎状态</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              MySQL · ClickHouse · MinIO · Redis · Kafka · NebulaGraph · Qdrant
              {summary?.checkedAt && (
                <span className="ml-2 text-[10px]">
                  最后检测: {new Date(summary.checkedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} className="text-xs" disabled={loadingStorage}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loadingStorage ? 'animate-spin' : ''}`} />
            {loadingStorage ? '检测中...' : '刷新状态'}
          </Button>
        </div>

        {/* 总览统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={summary?.online ?? 0} label="在线引擎" icon="✅" />
          <StatCard value={summary?.offline ?? 0} label="离线引擎" icon="⏳" />
          <StatCard value={summary?.total ?? 0} label="总引擎数" icon="🗄️" />
          <StatCard
            value={summary?.online && summary?.total ? `${Math.round((summary.online / summary.total) * 100)}%` : '-'}
            label="可用率"
            icon="📊"
          />
        </div>

        {/* 存储引擎卡片 - 实时状态 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {engines.length > 0 ? engines.map(engine => (
            <PageCard key={engine.name} className="relative">
              <div className="flex items-start gap-3">
                <div className="text-2xl flex-shrink-0">{engine.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-foreground">{engine.name}</span>
                    <Badge
                      variant={engine.status === 'online' ? 'success' : engine.status === 'standby' ? 'warning' : 'danger'}
                      dot
                      className="text-[9px]"
                    >
                      {engine.status === 'online' ? '在线' : engine.status === 'standby' ? '待部署' : '离线'}
                    </Badge>
                    {engine.status === 'online' && engine.latency > 0 && (
                      <span className="text-[9px] text-muted-foreground font-mono">{engine.latency}ms</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {engine.type} · {engine.connectionInfo}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{engine.description}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                    {Object.entries(engine.metrics).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono text-foreground">{val}</span>
                      </div>
                    ))}
                  </div>
                  {engine.error && (
                    <div className="mt-2 text-[9px] text-red-500 truncate" title={engine.error}>
                      错误: {engine.error}
                    </div>
                  )}
                </div>
              </div>
            </PageCard>
          )) : (
            // 加载中的骨架屏
            Array.from({ length: 7 }).map((_, i) => (
              <PageCard key={i} className="animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-secondary rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary rounded w-1/3" />
                    <div className="h-3 bg-secondary rounded w-2/3" />
                    <div className="h-3 bg-secondary rounded w-full" />
                  </div>
                </div>
              </PageCard>
            ))
          )}
        </div>

        {/* MySQL 数据表统计 */}
        <PageCard title="MySQL 数据表统计" icon={<Database className="w-3.5 h-3.5" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { name: '资产节点', table: 'asset_tree_nodes', count: assetStats?.total ?? 0 },
              { name: '测点配置', table: 'measurement_points', count: '-' },
              { name: '传感器', table: 'sensor_configs', count: '-' },
              { name: '编码规则', table: 'code_rules', count: '-' },
              { name: '节点模板', table: 'node_type_templates', count: '-' },
              { name: '测点模板', table: 'mp_type_templates', count: '-' },
              { name: '标注维度', table: 'label_dimensions', count: '-' },
              { name: '数据字典', table: 'dict_categories', count: '-' },
              { name: '切片规则', table: 'slice_rules', count: '-' },
              { name: '数据切片', table: 'data_slices', count: sliceStats?.total ?? 0 },
              { name: '切片标注', table: 'slice_labels', count: '-' },
              { name: '清洗规则', table: 'clean_rules', count: '-' },
              { name: '清洗任务', table: 'clean_tasks', count: '-' },
              { name: '质量报告', table: 'quality_reports', count: qualityStats?.totalReports ?? 0 },
              { name: '事件存储', table: 'event_store', count: eventStats?.totalEvents ?? 0 },
              { name: '状态快照', table: 'event_snapshots', count: eventStats?.totalSnapshots ?? 0 },
            ].map(t => (
              <div key={t.table} className="p-2 rounded bg-secondary/50 text-center">
                <div className="font-mono text-sm text-foreground">{t.count}</div>
                <div className="text-[9px] text-muted-foreground">{t.name}</div>
                <div className="text-[8px] text-muted-foreground/60 font-mono">{t.table}</div>
              </div>
            ))}
          </div>
        </PageCard>

        {/* Docker 一键部署提示 */}
        <PageCard title="一键部署" icon={<Server className="w-3.5 h-3.5" />}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              使用 Docker Compose 一键启动所有存储引擎：
            </p>
            <div className="bg-secondary/80 rounded-lg p-3 font-mono text-xs space-y-1">
              <div className="text-muted-foreground"># 启动全部服务</div>
              <div className="text-foreground">docker-compose up -d</div>
              <div className="text-muted-foreground mt-2"># 仅启动核心服务 (MySQL + Redis)</div>
              <div className="text-foreground">docker-compose up -d mysql redis</div>
              <div className="text-muted-foreground mt-2"># 启动核心数据库集群</div>
              <div className="text-foreground">docker-compose up -d mysql redis clickhouse qdrant minio</div>
              <div className="text-muted-foreground mt-2"># 查看服务状态</div>
              <div className="text-foreground">docker-compose ps</div>
            </div>
          </div>
        </PageCard>
      </div>
    </MainLayout>
  );
}
