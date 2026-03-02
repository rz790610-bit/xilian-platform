/**
 * 数据洞察页面
 * 数据质量分析、分布统计、趋势可视化
 *
 * 数据源:
 *   - trpc.database.slice.listSlices — 数据切片列表
 *   - trpc.database.slice.getSliceStats — 切片统计汇总
 *   - trpc.observabilityHub.getStatusView — 平台状态概览
 *   - trpc.evoPerception.getFusionQuality — 融合质量指标
 *   - trpc.evoPerception.getPerceptionEnhancementStats — 感知增强统计
 */

import { useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import {
  RefreshCw, Download, CheckCircle, AlertTriangle, XCircle,
  Info, Database, Loader2,
} from 'lucide-react';

// ── Quality grade helpers ──

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-500',
  B: 'bg-blue-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

function qualityGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ── Distribution bar colors ──

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-400',
  pending: 'bg-yellow-500',
  error: 'bg-red-500',
};

const LABEL_COLORS: Record<string, string> = {
  auto_labeled: 'bg-blue-500',
  manual_verified: 'bg-green-500',
  unlabeled: 'bg-gray-400',
  disputed: 'bg-orange-500',
};

const LABEL_DISPLAY: Record<string, string> = {
  auto_labeled: '自动标注',
  manual_verified: '人工验证',
  unlabeled: '未标注',
  disputed: '有争议',
};

export default function DataInsight() {
  // ── tRPC queries ──

  const slicesQuery = trpc.database.slice.listSlices.useQuery(
    { pageSize: 50 },
    { retry: false },
  );
  const sliceStatsQuery = trpc.database.slice.getSliceStats.useQuery(
    undefined,
    { retry: false },
  );
  const statusViewQuery = trpc.observabilityHub.getStatusView.useQuery(
    undefined,
    { retry: false },
  );
  const fusionQualityQuery = trpc.evoPerception.getFusionQuality.useQuery(
    undefined,
    { retry: false },
  );
  const perceptionStatsQuery = trpc.evoPerception.getPerceptionEnhancementStats.useQuery(
    undefined,
    { retry: false },
  );

  // ── Derived data ──

  const slices = slicesQuery.data?.items ?? [];
  const sliceStats = sliceStatsQuery.data;
  const statusView = statusViewQuery.data;
  const fusionQuality = fusionQualityQuery.data;
  const perceptionStats = perceptionStatsQuery.data;

  const hasData = slices.length > 0 || (sliceStats?.total ?? 0) > 0;

  const isLoading =
    slicesQuery.isLoading ||
    sliceStatsQuery.isLoading ||
    statusViewQuery.isLoading;

  // Derive status distribution from sliceStats.byStatus
  const statusDistribution = useMemo(() => {
    const byStatus = sliceStats?.byStatus;
    if (!byStatus || typeof byStatus !== 'object') return [];
    const total = sliceStats?.total ?? 0;
    if (total === 0) return [];
    return Object.entries(byStatus as Record<string, number>).map(([status, count]) => ({
      type: status,
      count,
      percent: Math.round((count / total) * 100),
      color: STATUS_COLORS[status] ?? 'bg-gray-400',
    }));
  }, [sliceStats]);

  // Derive label distribution from sliceStats.byLabelStatus
  const labelDistribution = useMemo(() => {
    const byLabel = sliceStats?.byLabelStatus;
    if (!byLabel || typeof byLabel !== 'object') return [];
    const total = sliceStats?.total ?? 0;
    if (total === 0) return [];
    return Object.entries(byLabel as Record<string, number>).map(([status, count]) => ({
      status: LABEL_DISPLAY[status] ?? status,
      count,
      percent: Math.round((count / total) * 100),
      color: LABEL_COLORS[status] ?? 'bg-gray-400',
    }));
  }, [sliceStats]);

  // Derive condition (workCondition) stats from slices
  const conditionStats = useMemo(() => {
    if (slices.length === 0) return [];
    const counts = new Map<string, number>();
    for (const s of slices) {
      const wc = (s.workConditionCode as string | null) ?? 'unknown';
      counts.set(wc, (counts.get(wc) ?? 0) + 1);
    }
    const total = slices.length;
    const palette = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-orange-500', 'bg-cyan-500'];
    let idx = 0;
    return Array.from(counts.entries()).map(([condition, count]) => ({
      condition: condition === 'unknown' ? '未标记工况' : condition,
      count,
      percent: Math.round((count / total) * 100),
      color: palette[idx++ % palette.length],
    }));
  }, [slices]);

  // Build quality check items from fusionQuality
  const qualityItems = useMemo(() => {
    if (!fusionQuality) return null;
    const conf = fusionQuality.overallConfidence;
    const overallPct = Math.round(conf * 100);

    const items = [
      {
        name: '融合置信度',
        score: overallPct,
        status: overallPct >= 75 ? 'good' : overallPct >= 50 ? 'warning' : 'error',
        message: `多源融合置信度 ${overallPct}%`,
      },
      {
        name: '冲突率',
        score: Math.round((1 - fusionQuality.conflictRate) * 100),
        status: fusionQuality.conflictRate <= 0.1 ? 'good' : fusionQuality.conflictRate <= 0.3 ? 'warning' : 'error',
        message: `证据冲突率 ${(fusionQuality.conflictRate * 100).toFixed(1)}%`,
      },
      {
        name: '不确定度',
        score: Math.round((1 - fusionQuality.uncertaintyLevel) * 100),
        status: fusionQuality.uncertaintyLevel <= 0.2 ? 'good' : fusionQuality.uncertaintyLevel <= 0.4 ? 'warning' : 'error',
        message: `不确定度 ${(fusionQuality.uncertaintyLevel * 100).toFixed(1)}%`,
      },
      {
        name: '证据源数量',
        score: fusionQuality.evidenceSources,
        status: fusionQuality.evidenceSources >= 4 ? 'good' : fusionQuality.evidenceSources >= 2 ? 'warning' : 'error',
        message: `${fusionQuality.evidenceSources} 个独立证据源`,
      },
    ];

    return { overall: overallPct, items };
  }, [fusionQuality]);

  // ── Actions ──

  const refetchAll = () => {
    slicesQuery.refetch();
    sliceStatsQuery.refetch();
    statusViewQuery.refetch();
    fusionQualityQuery.refetch();
    perceptionStatsQuery.refetch();
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      sliceStats,
      statusView,
      fusionQuality,
      perceptionStats,
      statusDistribution,
      labelDistribution,
      conditionStats,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_insight_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render helpers ──

  const avgQuality = sliceStats?.avgQualityScore ?? 0;
  const grade = qualityGrade(avgQuality);

  return (
    <MainLayout title="数据洞察">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">数据洞察</h2>
            <p className="text-muted-foreground">数据质量分析、分布统计、趋势可视化</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportReport} disabled={!hasData}>
              <Download className="w-4 h-4 mr-2" />
              导出报告
            </Button>
            <Button onClick={refetchAll}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新数据
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">加载数据中...</span>
          </div>
        )}

        {/* Error state */}
        {!isLoading && (slicesQuery.isError || sliceStatsQuery.isError) && (
          <div className="text-center py-16 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-warning opacity-70" />
            <h3 className="text-sm font-medium mb-1">数据加载异常</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              {slicesQuery.error?.message || sliceStatsQuery.error?.message || '无法连接数据服务，请稍后重试。'}
            </p>
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="w-4 h-4 mr-1" />
              重试
            </Button>
          </div>
        )}

        {/* Main content (only render after loading completes) */}
        {!isLoading && !slicesQuery.isError && !sliceStatsQuery.isError && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
              <StatCard
                value={sliceStats?.total ?? '--'}
                label="数据切片总数"
                icon={<Database className="w-5 h-5" />}
              />
              <StatCard
                value={avgQuality > 0 ? avgQuality.toFixed(1) : '--'}
                label="平均质量评分"
                icon={
                  <span className={cn('w-3 h-3 rounded-full inline-block', GRADE_COLORS[grade] ?? 'bg-gray-400')} />
                }
              />
              <StatCard
                value={statusView?.devices?.onlineDevices ?? '--'}
                label="在线设备"
                icon={<CheckCircle className="w-5 h-5 text-green-500" />}
              />
              <StatCard
                value={
                  statusView?.devices?.onlineRate != null
                    ? `${(statusView.devices.onlineRate * 100).toFixed(0)}%`
                    : '--'
                }
                label="设备在线率"
                icon={<Info className="w-5 h-5 text-blue-500" />}
              />
            </div>

            {/* Perception enhancement stats row */}
            {perceptionStats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                <StatCard
                  value={perceptionStats.bpaConfigCount}
                  label="BPA 配置数"
                  icon={<span className="text-lg">BPA</span>}
                />
                <StatCard
                  value={perceptionStats.dimensionCount}
                  label="状态向量维度"
                  icon={<span className="text-lg">DIM</span>}
                />
                <StatCard
                  value={perceptionStats.logCount}
                  label="状态向量日志"
                  icon={<span className="text-lg">LOG</span>}
                />
                <StatCard
                  value={
                    perceptionStats.latestLogAt
                      ? new Date(perceptionStats.latestLogAt).toLocaleDateString('zh-CN')
                      : '--'
                  }
                  label="最新日志时间"
                  icon={<span className="text-lg">T</span>}
                />
              </div>
            )}

            {hasData ? (
              <>
                {/* Distribution charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                  <PageCard title="切片状态分布" icon="📊">
                    {statusDistribution.length > 0 ? (
                      <div className="space-y-4">
                        {statusDistribution.map((item) => (
                          <div key={item.type} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>{item.type}</span>
                              <span className="text-muted-foreground">
                                {item.count} 个 ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-3 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={cn('h-full transition-all', item.color)}
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">暂无状态分布数据</div>
                    )}
                  </PageCard>

                  <PageCard title="标注状态分布" icon="🏷️">
                    {labelDistribution.length > 0 ? (
                      <div className="space-y-4">
                        {labelDistribution.map((item) => (
                          <div key={item.status} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>{item.status}</span>
                              <span className="text-muted-foreground">
                                {item.count} 个 ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-3 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={cn('h-full transition-all', item.color)}
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">暂无标注分布数据</div>
                    )}
                  </PageCard>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                  <PageCard title="工况类型统计" icon="📋">
                    {conditionStats.length > 0 ? (
                      <div className="space-y-4">
                        {conditionStats.map((item) => (
                          <div key={item.condition} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center gap-2">
                                <span className={cn('w-3 h-3 rounded-full', item.color)} />
                                {item.condition}
                              </span>
                              <span className="text-muted-foreground">
                                {item.count} 个 ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-3 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={cn('h-full transition-all', item.color)}
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">暂无工况统计数据</div>
                    )}
                  </PageCard>

                  <PageCard
                    title="数据质量检查"
                    icon="🔍"
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fusionQualityQuery.refetch()}
                        disabled={fusionQualityQuery.isFetching}
                      >
                        {fusionQualityQuery.isFetching ? '检查中...' : '刷新质量'}
                      </Button>
                    }
                  >
                    {fusionQualityQuery.isLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : qualityItems ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-secondary rounded-xl">
                          <div className="text-4xl font-bold text-primary">{qualityItems.overall}</div>
                          <div>
                            <div className="font-medium">融合质量评分</div>
                            <div className="text-sm text-muted-foreground">
                              等级{' '}
                              <Badge variant={qualityItems.overall >= 75 ? 'success' : qualityItems.overall >= 50 ? 'warning' : 'danger'}>
                                {qualityGrade(qualityItems.overall)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {qualityItems.items.map((item) => (
                            <div key={item.name} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                {item.status === 'good' ? (
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                                ) : item.status === 'warning' ? (
                                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-500" />
                                )}
                                <div>
                                  <div className="font-medium text-sm">{item.name}</div>
                                  <div className="text-xs text-muted-foreground">{item.message}</div>
                                </div>
                              </div>
                              <div className="text-lg font-semibold">{item.score}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>暂无融合质量数据</p>
                      </div>
                    )}
                  </PageCard>
                </div>

                {/* Slice list */}
                <PageCard
                  title="数据切片列表"
                  icon="📁"
                  action={
                    <Button variant="secondary" size="sm" onClick={exportReport}>
                      <Download className="w-4 h-4 mr-2" />
                      导出报告
                    </Button>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">切片 ID</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">设备编码</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">开始时间</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">状态</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">质量评分</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">标注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slices.map((slice) => {
                          const qScore = (slice.qualityScore as number | null) ?? 0;
                          const sliceGrade = qualityGrade(qScore);
                          return (
                            <tr key={slice.sliceId} className="border-b border-border/50 hover:bg-secondary/50">
                              <td className="py-3 px-4 font-mono text-sm">{slice.sliceId}</td>
                              <td className="py-3 px-4">{slice.deviceCode}</td>
                              <td className="py-3 px-4 font-mono text-xs">
                                {slice.startTime
                                  ? new Date(slice.startTime).toLocaleString('zh-CN')
                                  : '-'}
                              </td>
                              <td className="py-3 px-4">
                                <Badge
                                  variant={
                                    slice.status === 'completed'
                                      ? 'success'
                                      : slice.status === 'active'
                                        ? 'info'
                                        : slice.status === 'error'
                                          ? 'danger'
                                          : 'secondary'
                                  }
                                >
                                  {slice.status ?? '未知'}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                {qScore > 0 ? (
                                  <span className="flex items-center gap-2">
                                    <span className={cn('w-2 h-2 rounded-full', GRADE_COLORS[sliceGrade])} />
                                    {qScore.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <Badge
                                  variant={
                                    slice.labelStatus === 'manual_verified'
                                      ? 'success'
                                      : slice.labelStatus === 'auto_labeled'
                                        ? 'info'
                                        : 'secondary'
                                  }
                                >
                                  {LABEL_DISPLAY[slice.labelStatus ?? ''] ?? slice.labelStatus ?? '未标注'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </PageCard>
              </>
            ) : (
              /* ── Empty state ── */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <PageCard title="数据概览" icon="📊">
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Database className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-sm font-medium mb-1">暂无数据切片</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mb-4">
                      数据切片由感知管线自动生成。当设备接入并产生数据后，切片状态分布、标注统计、工况分析等洞察将自动呈现。
                    </p>
                    <Button variant="outline" size="sm" onClick={refetchAll}>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      刷新
                    </Button>
                  </div>
                </PageCard>

                <PageCard
                  title="数据质量检查"
                  icon="🔍"
                  action={
                    <Button
                      size="sm"
                      onClick={() => fusionQualityQuery.refetch()}
                      disabled={fusionQualityQuery.isFetching || !hasData}
                    >
                      {fusionQualityQuery.isFetching ? '检查中...' : '开始检查'}
                    </Button>
                  }
                >
                  <div className="text-center py-16 text-muted-foreground">
                    <Info className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-sm font-medium mb-1">等待数据</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      设备数据接入后，可查看融合质量评分、证据冲突率、不确定度等质量指标。
                    </p>
                  </div>
                </PageCard>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
