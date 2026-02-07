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

  // tRPC 查询 - 汇总各模块统计
  const { data: assetStats, refetch: refetchAssets, isLoading: la } = trpc.database.asset.getStats.useQuery();
  const { data: sliceStats, refetch: refetchSlices, isLoading: ls } = trpc.database.slice.getSliceStats.useQuery();
  const { data: eventStats, refetch: refetchEvents, isLoading: le } = trpc.database.event.getEventStats.useQuery();
  const { data: qualityStats, refetch: refetchQuality, isLoading: lq } = trpc.database.clean.getQualityStats.useQuery();

  const handleRefresh = () => {
    refetchAssets(); refetchSlices(); refetchEvents(); refetchQuality();
    toast.success('存储状态已刷新');
  };

  const isLoading = la || ls || le || lq;

  // 存储引擎列表（前端预留，后续可对接 ClickHouse/MinIO 等）
  const storageEngines = [
    {
      name: 'MySQL 8.0',
      type: 'RDBMS',
      status: 'online',
      icon: '🐬',
      description: '关系型主数据库，存储资产树、配置、事件等结构化数据',
      tables: assetStats?.total !== undefined ? '已连接' : '未连接',
      metrics: {
        '资产节点': assetStats?.total ?? 0,
        '数据切片': sliceStats?.total ?? 0,
        '事件记录': eventStats?.totalEvents ?? 0,
        '质量报告': qualityStats?.totalReports ?? 0,
      }
    },
    {
      name: 'ClickHouse',
      type: 'TSDB',
      status: 'standby',
      icon: '⚡',
      description: '时序数据库，用于存储高频传感器数据和聚合指标',
      tables: '待部署',
      metrics: { '时序表': '-', '数据点': '-', '压缩率': '-', '查询延迟': '-' }
    },
    {
      name: 'MinIO / S3',
      type: 'Object Store',
      status: 'standby',
      icon: '📦',
      description: '对象存储，用于存储波形文件、频谱图、模型文件等大文件',
      tables: '待部署',
      metrics: { '存储桶': '-', '对象数': '-', '总容量': '-', '可用空间': '-' }
    },
    {
      name: 'Redis 7',
      type: 'Cache',
      status: 'online',
      icon: '🔴',
      description: '缓存层，用于设备状态缓存、会话管理、事件去重',
      tables: '已连接',
      metrics: { '缓存键': '-', '内存使用': '-', '命中率': '-', '连接数': '-' }
    },
    {
      name: 'NebulaGraph',
      type: 'Graph DB',
      status: 'standby',
      icon: '🕸️',
      description: '图数据库，用于知识图谱和设备关系拓扑',
      tables: '待部署',
      metrics: { '顶点数': '-', '边数': '-', '图空间': '-', '查询延迟': '-' }
    },
    {
      name: 'Qdrant',
      type: 'Vector DB',
      status: 'standby',
      icon: '🧮',
      description: '向量数据库，用于相似故障检索和语义搜索',
      tables: '待部署',
      metrics: { '集合数': '-', '向量数': '-', '维度': '-', '索引状态': '-' }
    },
  ];

  return (
    <MainLayout title="存储状态">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">存储引擎状态</h2>
            <p className="text-xs text-muted-foreground mt-0.5">MySQL · ClickHouse · MinIO · Redis · NebulaGraph · Qdrant</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} className="text-xs" disabled={isLoading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? '加载中...' : '刷新状态'}
          </Button>
        </div>

        {/* 总览统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={storageEngines.filter(e => e.status === 'online').length} label="在线引擎" icon="✅" />
          <StatCard value={storageEngines.filter(e => e.status === 'standby').length} label="待部署" icon="⏳" />
          <StatCard value={assetStats?.total ?? 0} label="MySQL 记录数" icon="🐬" />
          <StatCard value={eventStats?.totalEvents ?? 0} label="事件存储量" icon="📝" />
        </div>

        {/* 存储引擎卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {storageEngines.map(engine => (
            <PageCard key={engine.name} className="relative">
              <div className="flex items-start gap-3">
                <div className="text-2xl flex-shrink-0">{engine.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-foreground">{engine.name}</span>
                    <Badge variant={engine.status === 'online' ? 'success' : engine.status === 'standby' ? 'warning' : 'danger'} dot className="text-[9px]">
                      {engine.status === 'online' ? '在线' : engine.status === 'standby' ? '待部署' : '离线'}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{engine.type} · {engine.tables}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{engine.description}</div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                    {Object.entries(engine.metrics).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono text-foreground">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PageCard>
          ))}
        </div>

        {/* MySQL 表统计 */}
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
      </div>
    </MainLayout>
  );
}
