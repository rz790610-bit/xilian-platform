import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { useTableSchema } from '@/hooks/useTableSchema';
import { DOMAINS } from '@/data/domains';
import {
  RefreshCw, Database, Server, HardDrive, Activity,
  Layers, GitBranch, Shield, BarChart3, Clock, BookOpen
} from 'lucide-react';

export default function DatabaseOverview() {
  const toast = useToast();

  // tRPC 查询
  const { data: assetStats, refetch: refetchAssets, isLoading: loadingAssets } = trpc.database.asset.getStats.useQuery();
  const { data: sliceStats, refetch: refetchSlices, isLoading: loadingSlices } = trpc.database.slice.getSliceStats.useQuery();
  const { data: eventStats, refetch: refetchEvents, isLoading: loadingEvents } = trpc.database.event.getEventStats.useQuery();
  const { data: qualityStats, refetch: refetchQuality, isLoading: loadingQuality } = trpc.database.clean.getQualityStats.useQuery();

  const handleRefreshAll = () => {
    refetchAssets();
    refetchSlices();
    refetchEvents();
    refetchQuality();
    toast.success('数据已刷新');
  };

  return (
    <MainLayout title="数据库总览">
      <div className="p-4 space-y-4">
        {/* 顶部操作栏 */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">数据库管理中心</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              资产档案 · 基础配置 · 数据切片 · 数据清洗 · 事件溯源
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefreshAll} className="text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />
            刷新全部
          </Button>
        </div>

        {/* 核心指标卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            value={assetStats?.total ?? 0}
            label="资产节点总数"
            icon="🏭"
          />
          <StatCard
            value={sliceStats?.total ?? 0}
            label="数据切片总数"
            icon="📊"
          />
          <StatCard
            value={eventStats?.totalEvents ?? 0}
            label="事件存储总数"
            icon="📝"
          />
          <StatCard
            value={qualityStats?.avgScore ?? '-'}
            label="平均质量分数"
            icon="✅"
          />
        </div>

        {/* 详细统计 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 资产状态分布 */}
          <PageCard title="资产状态分布" icon={<Server className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {assetStats?.byStatus && Object.entries(assetStats.byStatus).length > 0 ? (
                Object.entries(assetStats.byStatus).map(([status, cnt]) => (
                  <div key={status} className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5">
                      <Badge variant={
                        status === 'online' ? 'success' :
                        status === 'offline' ? 'danger' :
                        status === 'maintenance' ? 'warning' : 'default'
                      } dot>{status}</Badge>
                    </span>
                    <span className="font-mono text-foreground">{cnt}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {loadingAssets ? '加载中...' : '暂无数据，请先创建资产节点'}
                </div>
              )}
            </div>
          </PageCard>

          {/* 资产类型分布 */}
          <PageCard title="资产类型分布" icon={<Layers className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {assetStats?.byType && Object.entries(assetStats.byType).length > 0 ? (
                Object.entries(assetStats.byType).map(([type, cnt]) => (
                  <div key={type} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{type}</span>
                    <span className="font-mono text-foreground">{cnt}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {loadingAssets ? '加载中...' : '暂无数据'}
                </div>
              )}
            </div>
          </PageCard>

          {/* 切片状态分布 */}
          <PageCard title="切片状态分布" icon={<GitBranch className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {sliceStats?.byStatus && Object.entries(sliceStats.byStatus).length > 0 ? (
                Object.entries(sliceStats.byStatus).map(([status, cnt]) => (
                  <div key={status} className="flex justify-between items-center text-xs">
                    <Badge variant={
                      status === 'completed' ? 'success' :
                      status === 'recording' ? 'info' :
                      status === 'error' ? 'danger' : 'default'
                    } dot>{status}</Badge>
                    <span className="font-mono text-foreground">{cnt}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {loadingSlices ? '加载中...' : '暂无切片数据'}
                </div>
              )}
            </div>
          </PageCard>

          {/* 事件类型分布 */}
          <PageCard title="事件类型分布" icon={<Activity className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {eventStats?.byType && Object.entries(eventStats.byType).length > 0 ? (
                Object.entries(eventStats.byType).map(([type, cnt]) => (
                  <div key={type} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground truncate max-w-[140px]">{type}</span>
                    <span className="font-mono text-foreground">{cnt}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {loadingEvents ? '加载中...' : '暂无事件数据'}
                </div>
              )}
            </div>
          </PageCard>

          {/* 标注状态分布 */}
          <PageCard title="标注状态分布" icon={<Shield className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {sliceStats?.byLabelStatus && Object.entries(sliceStats.byLabelStatus).length > 0 ? (
                Object.entries(sliceStats.byLabelStatus).map(([status, cnt]) => (
                  <div key={status} className="flex justify-between items-center text-xs">
                    <Badge variant={
                      status === 'manual_verified' ? 'success' :
                      status === 'auto_only' ? 'info' : 'warning'
                    } dot>{status}</Badge>
                    <span className="font-mono text-foreground">{cnt}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {loadingSlices ? '加载中...' : '暂无标注数据'}
                </div>
              )}
            </div>
          </PageCard>

          {/* 质量报告统计 */}
          <PageCard title="数据质量概况" icon={<BarChart3 className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">质量报告数</span>
                <span className="font-mono text-foreground">{qualityStats?.totalReports ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">平均质量分</span>
                <span className="font-mono text-foreground">{qualityStats?.avgScore ?? '-'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">最新报告日期</span>
                <span className="font-mono text-foreground text-[10px]">{qualityStats?.latestDate ?? '-'}</span>
              </div>
            </div>
          </PageCard>
        </div>

        {/* Schema Registry 统计 */}
        <SchemaRegistryCard />

        {/* 模块入口 */}
        <PageCard title="快速入口" icon={<Database className="w-3.5 h-3.5" />}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: '设备档案', icon: '🏭', path: '/database/assets', desc: '资产树管理' },
              { label: '基础配置', icon: '⚙️', path: '/database/config', desc: '模板/编码/字典' },
              { label: '数据切片', icon: '✂️', path: '/database/slices', desc: '切片规则与实例' },
              { label: '数据清洗', icon: '🧹', path: '/database/clean', desc: '清洗规则与任务' },
              { label: '事件溯源', icon: '📜', path: '/database/events', desc: '事件存储与快照' },
              { label: '存储状态', icon: '💾', path: '/database/storage', desc: '存储引擎状态' },
              { label: 'Schema 设计', icon: '📐', path: '/settings/design/database', desc: 'V4 架构设计' },
              { label: 'ER 关系图', icon: '📈', path: '/settings/design/database', desc: '实体关系可视化' },
            ].map(item => (
              <a
                key={item.path}
                href={item.path}
                className="flex flex-col items-center gap-1 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border border-transparent hover:border-border"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs font-medium text-foreground">{item.label}</span>
                <span className="text-[10px] text-muted-foreground">{item.desc}</span>
              </a>
            ))}
          </div>
        </PageCard>
      </div>
    </MainLayout>
  );
}

// Schema Registry 统计卡片组件
function SchemaRegistryCard() {
  const { totalCount, totalFieldCount, domainStats } = useTableSchema();
  return (
    <PageCard title="V4 Schema Registry" icon={<BookOpen className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="p-2 rounded bg-secondary/50 text-center">
            <div className="text-lg font-bold text-foreground">{totalCount}</div>
            <div className="text-[10px] text-muted-foreground">数据表</div>
          </div>
          <div className="p-2 rounded bg-secondary/50 text-center">
            <div className="text-lg font-bold text-foreground">{totalFieldCount}</div>
            <div className="text-[10px] text-muted-foreground">字段总数</div>
          </div>
          <div className="p-2 rounded bg-secondary/50 text-center">
            <div className="text-lg font-bold text-foreground">{DOMAINS.length}</div>
            <div className="text-[10px] text-muted-foreground">业务域</div>
          </div>
          <div className="p-2 rounded bg-secondary/50 text-center">
            <div className="text-lg font-bold text-foreground">28</div>
            <div className="text-[10px] text-muted-foreground">外键关系</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {domainStats.map(d => (
            <div key={d.domainId} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#6366f1" }} />
              <span className="w-28 truncate text-foreground">{d.domainId}</span>
              <div className="flex-1 bg-secondary rounded-full h-1.5">
                <div className="rounded-full h-1.5 transition-all" style={{ width: `${(d.count / totalCount) * 100}%`, backgroundColor: "#6366f1" }} />
              </div>
              <span className="text-muted-foreground w-8 text-right">{d.count} 表</span>
            </div>
          ))}
        </div>
      </div>
    </PageCard>
  );
}
