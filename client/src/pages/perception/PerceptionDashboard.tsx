/**
 * ============================================================================
 * 感知层增强仪表盘 — PerceptionDashboard (紧凑风格)
 * ============================================================================
 */

import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

// ============================================================================
// 辅助组件
// ============================================================================

function FuzzyFunctionBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    trapezoidal: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    triangular: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    gaussian: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  const labels: Record<string, string> = {
    trapezoidal: '梯形',
    triangular: '三角形',
    gaussian: '高斯',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[type] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[type] ?? type}
    </span>
  );
}

function HypothesisBadge({ hypothesis }: { hypothesis: string }) {
  const colors: Record<string, string> = {
    normal: 'bg-emerald-500/15 text-emerald-400',
    degraded: 'bg-yellow-500/15 text-yellow-400',
    fault: 'bg-orange-500/15 text-orange-400',
    critical: 'bg-red-500/15 text-red-400',
  };
  const labels: Record<string, string> = {
    normal: '正常',
    degraded: '退化',
    fault: '故障',
    critical: '严重',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[hypothesis] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[hypothesis] ?? hypothesis}
    </span>
  );
}

function DimensionGroupBadge({ group }: { group: string }) {
  const colors: Record<string, string> = {
    cycle_features: 'bg-cyan-500/15 text-cyan-400',
    uncertainty_factors: 'bg-amber-500/15 text-amber-400',
    cumulative_metrics: 'bg-rose-500/15 text-rose-400',
  };
  const labels: Record<string, string> = {
    cycle_features: '周期特征',
    uncertainty_factors: '不确定性因子',
    cumulative_metrics: '累积退化',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[group] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[group] ?? group}
    </span>
  );
}

function UncertaintyBar({ value, className }: { value: number; className?: string }) {
  const color = value > 0.85 ? 'bg-red-500' : value > 0.7 ? 'bg-amber-500' : value > 0.5 ? 'bg-blue-500' : 'bg-emerald-500';
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function PerceptionDashboardContent() {
  const [activeTab, setActiveTab] = useState('overview');

  // API 调用
  const statsQuery = trpc.evoPerception.getPerceptionEnhancementStats.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const fusionQuery = trpc.evoPerception.getFusionQuality.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const bpaListQuery = trpc.evoPerception.bpaConfig.list.useQuery({});
  const dimListQuery = trpc.evoPerception.dimension.list.useQuery({});
  const logsQuery = trpc.evoPerception.stateVector.getLogs.useQuery(
    { machineId: 'ALL', limit: 20 },
  );

  const seedMutation = trpc.evoPerception.bpaConfig.seedDefaults.useMutation({
    onSuccess: () => {
      toast.success('种子数据初始化成功');
      bpaListQuery.refetch();
      dimListQuery.refetch();
      statsQuery.refetch();
    },
    onError: () => toast.error('种子数据初始化失败'),
  });

  const stats = statsQuery.data;
  const fusion = fusionQuery.data;
  const bpaConfigs = bpaListQuery.data ?? [];
  const dimensions = dimListQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  const bpaRuleCount = useMemo(() => {
    if (!Array.isArray(bpaConfigs)) return 0;
    return bpaConfigs.reduce((sum: number, cfg: any) => {
      const rules = cfg.rules;
      return sum + (Array.isArray(rules) ? rules.length : 0);
    }, 0);
  }, [bpaConfigs]);

  const enabledDimCount = useMemo(() => {
    if (!Array.isArray(dimensions)) return 0;
    return dimensions.filter((d: any) => d.enabled).length;
  }, [dimensions]);

  return (
    <div className="animate-fade-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold mb-0.5">🔬 感知层增强</h2>
          <p className="text-xs text-muted-foreground">Phase 1 — BPA 构建器 / 21D 状态向量 / DS 融合引擎</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? '初始化中...' : '🌱 种子数据'}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            statsQuery.refetch(); fusionQuery.refetch(); bpaListQuery.refetch(); dimListQuery.refetch(); logsQuery.refetch();
            toast.success('数据已刷新');
          }}>
            🔄 刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard value={stats?.bpaConfigCount ?? 0} label="BPA 配置" icon="📐" />
        <StatCard value={stats?.dimensionCount ?? 0} label={`维度 (${enabledDimCount} 启用)`} icon="📊" />
        <StatCard value={stats?.logCount ?? 0} label="合成日志" icon="📝" />
        <StatCard
          value={fusion?.overallConfidence ? `${(fusion.overallConfidence * 100).toFixed(0)}%` : '—'}
          label={`冲突率: ${fusion?.conflictRate ? (fusion.conflictRate * 100).toFixed(0) + '%' : '—'}`}
          icon="🔬"
        />
      </div>

      {/* 快捷入口 */}
      <PageCard className="mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href="/v5/perception/bpa-config">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">📐 BPA 配置管理</Button>
          </Link>
          <Link href="/v5/perception/dimensions">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">📊 维度定义管理</Button>
          </Link>
          <Link href="/v5/perception">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">📡 感知层监控</Button>
          </Link>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {bpaRuleCount} 条规则 · {enabledDimCount}/{dimensions.length} 维度
          </span>
        </div>
      </PageCard>

      {/* 主内容区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="overview" className="text-xs">总览</TabsTrigger>
          <TabsTrigger value="bpa-preview" className="text-xs">BPA 配置</TabsTrigger>
          <TabsTrigger value="dim-preview" className="text-xs">维度预览</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">合成日志</TabsTrigger>
        </TabsList>

        {/* 总览 */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
            {/* DS 融合质量 */}
            <PageCard title="DS 融合质量" icon="🎯">
              <div className="space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">整体置信度</span>
                    <span className="font-mono">{fusion?.overallConfidence ? (fusion.overallConfidence * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={fusion?.overallConfidence ?? 0} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">冲突率</span>
                    <span className="font-mono">{fusion?.conflictRate ? (fusion.conflictRate * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={fusion?.conflictRate ?? 0} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">不确定性</span>
                    <span className="font-mono">{fusion?.uncertaintyLevel ? (fusion.uncertaintyLevel * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={fusion?.uncertaintyLevel ?? 0} />
                </div>
                <div className="flex justify-between text-[10px] pt-1.5 border-t border-border/50">
                  <span className="text-muted-foreground">证据源数量</span>
                  <span className="font-mono">{fusion?.evidenceSources ?? 0}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">最近融合</span>
                  <span className="font-mono">{fusion?.lastFusionAt ? new Date(fusion.lastFusionAt).toLocaleString('zh-CN') : '—'}</span>
                </div>
              </div>
            </PageCard>

            {/* Phase 1 架构图 */}
            <PageCard title="Phase 1 数据流架构" icon="🏗️">
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-muted-foreground">边缘层 (100kHz)</span>
                </div>
                <div className="ml-2.5 border-l border-border/50 pl-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-cyan-400">→</span>
                    <span>RingBuffer → AdaptiveSampler</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-muted-foreground">汇聚层</span>
                </div>
                <div className="ml-2.5 border-l border-border/50 pl-2.5 space-y-1">
                  <div className="flex items-center gap-1.5"><span className="text-blue-400">→</span><span>ClickHouse → StateVectorSynthesizer (21D)</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-blue-400">→</span><span>BPABuilder (模糊隶属度 → BPA)</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-blue-400">→</span><span>DSFusionEngine (DS 融合 → 决策)</span></div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-muted-foreground">平台层</span>
                </div>
                <div className="ml-2.5 border-l border-border/50 pl-2.5 space-y-1">
                  <div className="flex items-center gap-1.5"><span className="text-purple-400">→</span><span>EvidenceLearner (Bayesian 自学习)</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-purple-400">→</span><span>StateVectorEncoder → EventBus → 认知层</span></div>
                </div>
              </div>
            </PageCard>
          </div>

          {/* 模糊隶属度函数说明 */}
          <PageCard title="模糊隶属度函数类型" icon="📐">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1 p-2 rounded bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-1.5">
                  <FuzzyFunctionBadge type="trapezoidal" />
                  <span className="text-[10px] font-medium">梯形函数</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  μ(x) 在 [a,b] 上升、[b,c] 为1、[c,d] 下降。适用于有明确正常范围的传感器。
                </p>
                <div className="text-[10px] font-mono text-muted-foreground">参数: a, b, c, d</div>
              </div>
              <div className="space-y-1 p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-1.5">
                  <FuzzyFunctionBadge type="triangular" />
                  <span className="text-[10px] font-medium">三角形函数</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  μ(x) 在 [a,c] 上升到峰值、[c,b] 下降。适用于单峰值特征。
                </p>
                <div className="text-[10px] font-mono text-muted-foreground">参数: a, b, c (peak)</div>
              </div>
              <div className="space-y-1 p-2 rounded bg-purple-500/5 border border-purple-500/20">
                <div className="flex items-center gap-1.5">
                  <FuzzyFunctionBadge type="gaussian" />
                  <span className="text-[10px] font-medium">高斯函数</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  μ(x) = exp(-(x-c)²/2σ²)。适用于连续平滑分布的指标。
                </p>
                <div className="text-[10px] font-mono text-muted-foreground">参数: center, sigma</div>
              </div>
            </div>
          </PageCard>
        </TabsContent>

        {/* BPA 配置预览 */}
        <TabsContent value="bpa-preview">
          <PageCard
            title="BPA 配置列表"
            icon="📐"
            action={
              <Link href="/v5/perception/bpa-config">
                <Button variant="outline" size="sm" className="h-6 text-[10px]">前往管理 →</Button>
              </Link>
            }
          >
            {!Array.isArray(bpaConfigs) || bpaConfigs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-[10px]">
                <p>暂无 BPA 配置</p>
                <p className="mt-0.5">点击"种子数据"按钮创建默认岸桥配置</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-[10px]">ID</TableHead>
                    <TableHead className="text-[10px]">名称</TableHead>
                    <TableHead className="text-[10px]">设备类型</TableHead>
                    <TableHead className="text-[10px]">假设集</TableHead>
                    <TableHead className="text-[10px]">规则</TableHead>
                    <TableHead className="text-[10px]">版本</TableHead>
                    <TableHead className="text-[10px]">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bpaConfigs as any[]).map((cfg: any) => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-mono text-[10px]">{cfg.id}</TableCell>
                      <TableCell className="text-xs font-medium">{cfg.name}</TableCell>
                      <TableCell className="text-[10px]">{cfg.equipmentType}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-0.5">
                          {(cfg.hypotheses as string[] ?? []).map((h: string) => (
                            <HypothesisBadge key={h} hypothesis={h} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {Array.isArray(cfg.rules) ? cfg.rules.length : 0}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{cfg.version ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {cfg.enabled ? '启用' : '禁用'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PageCard>
        </TabsContent>

        {/* 维度预览 */}
        <TabsContent value="dim-preview">
          <PageCard
            title="状态向量维度定义"
            icon="📊"
            action={
              <Link href="/v5/perception/dimensions">
                <Button variant="outline" size="sm" className="h-6 text-[10px]">前往管理 →</Button>
              </Link>
            }
          >
            {!Array.isArray(dimensions) || dimensions.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-[10px]">
                <p>暂无维度定义</p>
                <p className="mt-0.5">前往维度管理页面配置 21 维状态向量</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-[10px]">索引</TableHead>
                    <TableHead className="text-[10px]">标识</TableHead>
                    <TableHead className="text-[10px]">标签</TableHead>
                    <TableHead className="text-[10px]">分组</TableHead>
                    <TableHead className="text-[10px]">聚合</TableHead>
                    <TableHead className="text-[10px]">归一化</TableHead>
                    <TableHead className="text-[10px]">数据源</TableHead>
                    <TableHead className="text-[10px]">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dimensions as any[]).map((dim: any) => (
                    <TableRow key={dim.id}>
                      <TableCell className="font-mono text-[10px]">{dim.dimensionIndex}</TableCell>
                      <TableCell className="font-mono text-[10px]">{dim.dimensionKey}</TableCell>
                      <TableCell className="text-xs">{dim.label}</TableCell>
                      <TableCell><DimensionGroupBadge group={dim.dimensionGroup} /></TableCell>
                      <TableCell className="text-[10px] font-mono">{dim.aggregation}</TableCell>
                      <TableCell className="text-[10px] font-mono">
                        [{(dim.normalizeRange as number[])?.[0] ?? 0}, {(dim.normalizeRange as number[])?.[1] ?? 1}]
                      </TableCell>
                      <TableCell className="text-[10px]">{dim.source}</TableCell>
                      <TableCell>
                        <Badge variant={dim.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {dim.enabled ? '启用' : '禁用'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PageCard>
        </TabsContent>

        {/* 合成日志 */}
        <TabsContent value="logs">
          <PageCard title="最近状态向量合成日志" icon="📝">
            {!Array.isArray(logs) || logs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-[10px]">
                <p>暂无合成日志</p>
                <p className="mt-0.5">当感知管线运行并合成状态向量时，日志将自动记录</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-[10px]">ID</TableHead>
                    <TableHead className="text-[10px]">设备</TableHead>
                    <TableHead className="text-[10px]">完整度</TableHead>
                    <TableHead className="text-[10px]">融合决策</TableHead>
                    <TableHead className="text-[10px]">置信度</TableHead>
                    <TableHead className="text-[10px]">冲突因子</TableHead>
                    <TableHead className="text-[10px]">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs as any[]).map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-[10px]">{log.id}</TableCell>
                      <TableCell className="text-[10px]">{log.machineId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={(log.completeness ?? 0) * 100} className="h-1 w-12" />
                          <span className="text-[10px] font-mono">{((log.completeness ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.fusionDecision ? <HypothesisBadge hypothesis={log.fusionDecision} /> : '—'}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {log.fusionConfidence != null ? (log.fusionConfidence * 100).toFixed(1) + '%' : '—'}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {log.fusionConflict != null ? log.fusionConflict.toFixed(3) : '—'}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {log.synthesizedAt ? new Date(log.synthesizedAt).toLocaleString('zh-CN') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PerceptionDashboard() {
  return (
    <MainLayout title="感知层增强仪表盘">
      <PerceptionDashboardContent />
    </MainLayout>
  );
}
