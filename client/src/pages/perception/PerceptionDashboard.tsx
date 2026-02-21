/**
 * ============================================================================
 * 感知层增强仪表盘 — PerceptionDashboard
 * ============================================================================
 *
 * Phase 1 感知层增强总览：
 *   - BPA 配置统计
 *   - 状态向量维度统计
 *   - 融合日志统计
 *   - 最近融合结果预览
 *   - 快捷入口：BPA 配置管理、维度管理
 */

import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Link } from 'wouter';

// ============================================================================
// 辅助组件
// ============================================================================

function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="text-2xl opacity-60">{icon}</div>
        </div>
        {trend && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5">
            <div className={`h-full ${
              trend === 'up' ? 'bg-emerald-500' : trend === 'down' ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[type] ?? 'bg-muted text-muted-foreground'}`}>
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[hypothesis] ?? 'bg-muted text-muted-foreground'}`}>
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[group] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[group] ?? group}
    </span>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function PerceptionDashboard() {
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

  // 统计计算
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
    <MainLayout title="感知层增强仪表盘">
      <div className="space-y-4">
        {/* 顶部统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="BPA 配置"
            value={stats?.bpaConfigCount ?? 0}
            subtitle={`${bpaRuleCount} 条规则`}
            icon="📐"
            trend="neutral"
          />
          <StatCard
            title="状态向量维度"
            value={stats?.dimensionCount ?? 0}
            subtitle={`${enabledDimCount} 个已启用`}
            icon="📊"
            trend="neutral"
          />
          <StatCard
            title="合成日志"
            value={stats?.logCount ?? 0}
            subtitle={stats?.latestLogAt ? `最近: ${new Date(stats.latestLogAt).toLocaleString('zh-CN')}` : '暂无'}
            icon="📝"
            trend="neutral"
          />
          <StatCard
            title="融合置信度"
            value={fusion?.overallConfidence ? `${(fusion.overallConfidence * 100).toFixed(1)}%` : '—'}
            subtitle={`冲突率: ${fusion?.conflictRate ? (fusion.conflictRate * 100).toFixed(1) + '%' : '—'}`}
            icon="🔬"
            trend={fusion?.overallConfidence && fusion.overallConfidence > 0.7 ? 'up' : fusion?.overallConfidence ? 'down' : 'neutral'}
          />
        </div>

        {/* 快捷操作 */}
        <div className="flex items-center gap-2">
          <Link href="/v5/perception/bpa-config">
            <Button variant="outline" size="sm">
              📐 BPA 配置管理
            </Button>
          </Link>
          <Link href="/v5/perception/dimensions">
            <Button variant="outline" size="sm">
              📊 维度定义管理
            </Button>
          </Link>
          <Link href="/v5/perception">
            <Button variant="outline" size="sm">
              📡 感知层监控
            </Button>
          </Link>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? '初始化中...' : '🌱 初始化种子数据'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              statsQuery.refetch();
              fusionQuery.refetch();
              bpaListQuery.refetch();
              dimListQuery.refetch();
              logsQuery.refetch();
              toast.success('数据已刷新');
            }}
          >
            🔄 刷新
          </Button>
        </div>

        {/* 主内容区 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">总览</TabsTrigger>
            <TabsTrigger value="bpa-preview">BPA 配置预览</TabsTrigger>
            <TabsTrigger value="dim-preview">维度预览</TabsTrigger>
            <TabsTrigger value="logs">合成日志</TabsTrigger>
          </TabsList>

          {/* 总览 */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* DS 融合质量 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">DS 融合质量</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">整体置信度</span>
                      <span className="font-medium">{fusion?.overallConfidence ? (fusion.overallConfidence * 100).toFixed(1) + '%' : '—'}</span>
                    </div>
                    <Progress value={(fusion?.overallConfidence ?? 0) * 100} className="h-1.5" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">冲突率</span>
                      <span className="font-medium">{fusion?.conflictRate ? (fusion.conflictRate * 100).toFixed(1) + '%' : '—'}</span>
                    </div>
                    <Progress value={(fusion?.conflictRate ?? 0) * 100} className="h-1.5" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">不确定性</span>
                      <span className="font-medium">{fusion?.uncertaintyLevel ? (fusion.uncertaintyLevel * 100).toFixed(1) + '%' : '—'}</span>
                    </div>
                    <Progress value={(fusion?.uncertaintyLevel ?? 0) * 100} className="h-1.5" />
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">证据源数量</span>
                    <span className="font-medium">{fusion?.evidenceSources ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">最近融合时间</span>
                    <span className="font-medium">{fusion?.lastFusionAt ? new Date(fusion.lastFusionAt).toLocaleString('zh-CN') : '—'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Phase 1 架构图 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Phase 1 数据流架构</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                      <span className="text-muted-foreground">边缘层 (100kHz)</span>
                    </div>
                    <div className="ml-3 border-l border-border/50 pl-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400">→</span>
                        <span>RingBuffer → AdaptiveSampler</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-muted-foreground">汇聚层</span>
                    </div>
                    <div className="ml-3 border-l border-border/50 pl-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">→</span>
                        <span>ClickHouse → StateVectorSynthesizer (21D)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">→</span>
                        <span>BPABuilder (模糊隶属度 → BPA)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">→</span>
                        <span>DSFusionEngine (DS 融合 → 决策)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      <span className="text-muted-foreground">平台层</span>
                    </div>
                    <div className="ml-3 border-l border-border/50 pl-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">→</span>
                        <span>EvidenceLearner (Bayesian 权重自学习)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">→</span>
                        <span>StateVectorEncoder → EventBus → 认知层</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 模糊隶属度函数说明 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">模糊隶属度函数类型</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <div className="flex items-center gap-2">
                      <FuzzyFunctionBadge type="trapezoidal" />
                      <span className="text-xs font-medium">梯形函数</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      μ(x) 在 [a,b] 上升、[b,c] 为1、[c,d] 下降。适用于有明确正常范围的传感器（如温度、电流）。
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      参数: a, b, c, d
                    </div>
                  </div>
                  <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <FuzzyFunctionBadge type="triangular" />
                      <span className="text-xs font-medium">三角形函数</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      μ(x) 在 [a,c] 上升到峰值 c、[c,b] 下降。适用于单峰值特征（如振动 RMS）。
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      参数: a, b, c (peak)
                    </div>
                  </div>
                  <div className="space-y-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <div className="flex items-center gap-2">
                      <FuzzyFunctionBadge type="gaussian" />
                      <span className="text-xs font-medium">高斯函数</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      μ(x) = exp(-(x-c)²/2σ²)。适用于连续平滑分布的指标（如风速、应力）。
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      参数: center, sigma
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BPA 配置预览 */}
          <TabsContent value="bpa-preview" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">BPA 配置列表</CardTitle>
                  <Link href="/v5/perception/bpa-config">
                    <Button variant="outline" size="sm">前往管理 →</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {!Array.isArray(bpaConfigs) || bpaConfigs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>暂无 BPA 配置</p>
                    <p className="text-xs mt-1">点击"初始化种子数据"按钮创建默认岸桥配置</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">ID</TableHead>
                        <TableHead>名称</TableHead>
                        <TableHead>设备类型</TableHead>
                        <TableHead>假设集</TableHead>
                        <TableHead>规则数</TableHead>
                        <TableHead>版本</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bpaConfigs as any[]).map((cfg: any) => (
                        <TableRow key={cfg.id}>
                          <TableCell className="font-mono text-xs">{cfg.id}</TableCell>
                          <TableCell className="font-medium text-sm">{cfg.name}</TableCell>
                          <TableCell className="text-xs">{cfg.equipmentType}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(cfg.hypotheses as string[] ?? []).map((h: string) => (
                                <HypothesisBadge key={h} hypothesis={h} />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {Array.isArray(cfg.rules) ? cfg.rules.length : 0}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{cfg.version ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="text-xs">
                              {cfg.enabled ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 维度预览 */}
          <TabsContent value="dim-preview" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">状态向量维度定义</CardTitle>
                  <Link href="/v5/perception/dimensions">
                    <Button variant="outline" size="sm">前往管理 →</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {!Array.isArray(dimensions) || dimensions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>暂无维度定义</p>
                    <p className="text-xs mt-1">前往维度管理页面配置 21 维状态向量</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">索引</TableHead>
                        <TableHead>标识</TableHead>
                        <TableHead>标签</TableHead>
                        <TableHead>分组</TableHead>
                        <TableHead>聚合</TableHead>
                        <TableHead>归一化范围</TableHead>
                        <TableHead>数据源</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dimensions as any[]).map((dim: any) => (
                        <TableRow key={dim.id}>
                          <TableCell className="font-mono text-xs">{dim.dimensionIndex}</TableCell>
                          <TableCell className="font-mono text-xs">{dim.dimensionKey}</TableCell>
                          <TableCell className="text-sm">{dim.label}</TableCell>
                          <TableCell>
                            <DimensionGroupBadge group={dim.dimensionGroup} />
                          </TableCell>
                          <TableCell className="text-xs font-mono">{dim.aggregation}</TableCell>
                          <TableCell className="text-xs font-mono">
                            [{(dim.normalizeRange as number[])?.[0] ?? 0}, {(dim.normalizeRange as number[])?.[1] ?? 1}]
                          </TableCell>
                          <TableCell className="text-xs">{dim.source}</TableCell>
                          <TableCell>
                            <Badge variant={dim.enabled ? 'default' : 'secondary'} className="text-xs">
                              {dim.enabled ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 合成日志 */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">最近状态向量合成日志</CardTitle>
              </CardHeader>
              <CardContent>
                {!Array.isArray(logs) || logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>暂无合成日志</p>
                    <p className="text-xs mt-1">当感知管线运行并合成状态向量时，日志将自动记录</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">ID</TableHead>
                        <TableHead>设备</TableHead>
                        <TableHead>完整度</TableHead>
                        <TableHead>融合决策</TableHead>
                        <TableHead>置信度</TableHead>
                        <TableHead>冲突因子</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(logs as any[]).map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{log.id}</TableCell>
                          <TableCell className="text-xs">{log.machineId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={(log.completeness ?? 0) * 100} className="h-1.5 w-16" />
                              <span className="text-xs font-mono">{((log.completeness ?? 0) * 100).toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.fusionDecision ? (
                              <HypothesisBadge hypothesis={log.fusionDecision} />
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {log.fusionConfidence != null ? (log.fusionConfidence * 100).toFixed(1) + '%' : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {log.fusionConflict != null ? log.fusionConflict.toFixed(3) : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.synthesizedAt ? new Date(log.synthesizedAt).toLocaleString('zh-CN') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
