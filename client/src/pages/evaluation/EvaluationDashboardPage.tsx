/**
 * P2-10 评估与组合优化体系 — EvaluationDashboardPage
 *
 * 功能：
 * 1. 平台概览 — 改进/稳定/退步模块数 + 最佳/最差 + 平均分
 * 2. 四维评估 — 模块评分卡排行（技术/业务/进化/成本 + 综合总分）
 * 3. 退步告警 — 退步模块列表 + 退步维度
 * 4. 组合优化 — 输入约束条件 → 推荐最优算法组合
 * 5. 业务 KPI — 预警提前/误报率/采纳率/避免停机
 * 6. 评估配置 — 查看维度权重和系统参数
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  BarChart3, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Loader2, Play, Target, Shield, Zap, DollarSign,
  ArrowUpRight, ArrowDownRight, Trophy, Brain, Cpu,
  CheckCircle2, XCircle, RefreshCw, Settings2, Layers,
} from 'lucide-react';

// ==================== 常量 ====================

const TREND_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  improving: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-green-400', label: '改进中' },
  stable: { icon: <Minus className="w-4 h-4" />, color: 'text-blue-400', label: '稳定' },
  regressing: { icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-400', label: '退步' },
};

const DIMENSION_CONFIG = [
  { key: 'technical', label: '技术', icon: <Cpu className="w-3.5 h-3.5" />, color: 'bg-blue-500' },
  { key: 'business', label: '业务', icon: <Target className="w-3.5 h-3.5" />, color: 'bg-green-500' },
  { key: 'evolution', label: '进化', icon: <RefreshCw className="w-3.5 h-3.5" />, color: 'bg-purple-500' },
  { key: 'cost', label: '成本', icon: <DollarSign className="w-3.5 h-3.5" />, color: 'bg-orange-500' },
] as const;

const DEVICE_TYPES = [
  { value: 'STS', label: '岸桥 (STS)' },
  { value: 'RTG', label: '轮胎吊 (RTG)' },
  { value: 'RMG', label: '轨道吊 (RMG)' },
  { value: 'MHC', label: '门座起重机 (MHC)' },
  { value: 'AGV', label: '自动导引车 (AGV)' },
  { value: 'OTHER', label: '其他' },
];

const QUALITY_GRADES = [
  { value: 'A', label: 'A (>=90)' },
  { value: 'B', label: 'B (>=75)' },
  { value: 'C', label: 'C (>=60)' },
  { value: 'D', label: 'D (>=40)' },
  { value: 'F', label: 'F (<40)' },
];

const LATENCY_OPTIONS = [
  { value: 'realtime', label: '实时' },
  { value: 'near-realtime', label: '准实时' },
  { value: 'batch', label: '批处理' },
];

// ==================== 辅助函数 ====================

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBadgeColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20 text-green-400';
  if (score >= 60) return 'bg-yellow-500/20 text-yellow-400';
  if (score >= 40) return 'bg-orange-500/20 text-orange-400';
  return 'bg-red-500/20 text-red-400';
}

// ==================== 主组件 ====================

export default function EvaluationDashboardPage() {
  const { toast } = useToast();

  // 组合优化表单状态
  const [deviceType, setDeviceType] = useState<string>('STS');
  const [dataQualityGrade, setDataQualityGrade] = useState<string>('B');
  const [latencyRequirement, setLatencyRequirement] = useState<string>('near-realtime');

  // 排序状态
  const [sortBy, setSortBy] = useState<string>('overallScore');

  // tRPC queries
  const dashboardQuery = trpc.evaluation.dashboard.getData.useQuery();
  const latestScorecardsQuery = trpc.evaluation.modules.getLatest.useQuery();
  const regressingQuery = trpc.evaluation.modules.getRegressing.useQuery();
  const businessKpiQuery = trpc.evaluation.business.computeKPIs.useQuery();
  const configQuery = trpc.evaluation.getConfig.useQuery();

  // tRPC mutations
  const evaluateAllMut = trpc.evaluation.modules.evaluateAll.useMutation({
    onSuccess: (data) => {
      toast({ title: '全量评估完成', description: `评估了 ${data.length} 个模块`, variant: 'success' });
      latestScorecardsQuery.refetch();
      regressingQuery.refetch();
      dashboardQuery.refetch();
    },
    onError: (err) => toast({ title: '评估失败', description: err.message, variant: 'destructive' }),
  });

  const optimizeMut = trpc.evaluation.combination.optimize.useMutation({
    onSuccess: () => toast({ title: '组合优化完成', variant: 'success' }),
    onError: (err) => toast({ title: '优化失败', description: err.message, variant: 'destructive' }),
  });

  // 派生数据
  const dashboard = dashboardQuery.data;
  const scorecards = latestScorecardsQuery.data ?? [];
  const regressing = regressingQuery.data ?? [];
  const kpi = businessKpiQuery.data;

  // 排序后的评分卡
  const sortedScorecards = useMemo(() => {
    return [...scorecards].sort((a: any, b: any) => {
      if (sortBy === 'overallScore') return b.overallScore - a.overallScore;
      if (sortBy === 'technical') return b.technical.overall - a.technical.overall;
      if (sortBy === 'business') return b.business.overall - a.business.overall;
      if (sortBy === 'evolution') return b.evolution.overall - a.evolution.overall;
      if (sortBy === 'cost') return b.cost.overall - a.cost.overall;
      return 0;
    });
  }, [scorecards, sortBy]);

  const summary = dashboard?.platformSummary;

  return (
    <MainLayout title="评估与组合优化">
      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard
          label="平均分"
          value={summary?.avgOverallScore?.toFixed(1) ?? '-'}
          icon={<BarChart3 className="w-5 h-5" />}
        />
        <StatCard
          label="改进中"
          value={summary?.improvingCount ?? 0}
          icon={<TrendingUp className="w-5 h-5 text-green-400" />}
        />
        <StatCard
          label="稳定"
          value={summary?.stableCount ?? 0}
          icon={<Minus className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          label="退步"
          value={summary?.regressingCount ?? 0}
          icon={<TrendingDown className="w-5 h-5 text-red-400" />}
        />
        <StatCard
          label="模块总数"
          value={scorecards.length}
          icon={<Layers className="w-5 h-5" />}
        />
      </div>

      {/* 最佳/最差模块 */}
      {summary && (summary.bestModule || summary.worstModule) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {summary.bestModule && (
            <PageCard title="最佳模块" icon={<Trophy className="w-4 h-4 text-yellow-400" />}>
              <div className="flex items-center justify-between">
                <span className="text-sm">{summary.bestModule.moduleName}</span>
                <Badge className={scoreBadgeColor(summary.bestModule.score)}>
                  {summary.bestModule.score.toFixed(1)}
                </Badge>
              </div>
            </PageCard>
          )}
          {summary.worstModule && (
            <PageCard title="需改进模块" icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}>
              <div className="flex items-center justify-between">
                <span className="text-sm">{summary.worstModule.moduleName}</span>
                <Badge className={scoreBadgeColor(summary.worstModule.score)}>
                  {summary.worstModule.score.toFixed(1)}
                </Badge>
              </div>
            </PageCard>
          )}
        </div>
      )}

      {/* AI 摘要 */}
      {dashboard?.aiSummary && (
        <PageCard title="AI 评估摘要" icon={<Brain className="w-4 h-4" />} className="mb-6">
          <p className="text-sm text-zinc-300">{dashboard.aiSummary}</p>
        </PageCard>
      )}

      <Tabs defaultValue="scorecards" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scorecards">四维评估排行</TabsTrigger>
          <TabsTrigger value="regressing">退步告警</TabsTrigger>
          <TabsTrigger value="combination">组合优化</TabsTrigger>
          <TabsTrigger value="kpi">业务 KPI</TabsTrigger>
          <TabsTrigger value="config">评估配置</TabsTrigger>
        </TabsList>

        {/* ━━━ Tab1: 四维评估排行 ━━━ */}
        <TabsContent value="scorecards">
          <PageCard
            title={`模块评分卡 (${scorecards.length})`}
            action={
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overallScore">综合总分</SelectItem>
                    <SelectItem value="technical">技术维度</SelectItem>
                    <SelectItem value="business">业务维度</SelectItem>
                    <SelectItem value="evolution">进化维度</SelectItem>
                    <SelectItem value="cost">成本维度</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => evaluateAllMut.mutate({ trigger: 'manual' })}
                  disabled={evaluateAllMut.isPending}
                >
                  {evaluateAllMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Play className="w-3 h-3 mr-1" />评估</>
                  )}
                </Button>
              </div>
            }
          >
            {latestScorecardsQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : sortedScorecards.length > 0 ? (
              <ScrollArea className="h-[calc(100vh-420px)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900/90 backdrop-blur">
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th className="text-left py-2 px-3 w-8">#</th>
                        <th className="text-left py-2 px-3">模块</th>
                        <th className="text-left py-2 px-3">分类</th>
                        <th className="text-center py-2 px-3">技术</th>
                        <th className="text-center py-2 px-3">业务</th>
                        <th className="text-center py-2 px-3">进化</th>
                        <th className="text-center py-2 px-3">成本</th>
                        <th className="text-center py-2 px-3">综合</th>
                        <th className="text-center py-2 px-3">趋势</th>
                        <th className="text-center py-2 px-3">变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedScorecards.map((sc: any, idx: number) => {
                        const trend = TREND_CONFIG[sc.trend] ?? TREND_CONFIG.stable;
                        const delta = sc.previousScore != null ? sc.overallScore - sc.previousScore : null;
                        return (
                          <tr key={sc.moduleId} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                            <td className="py-2 px-3 text-zinc-500 font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-medium max-w-[200px] truncate">{sc.moduleName}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">{sc.category}</Badge>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn('font-mono', scoreColor(sc.technical.overall))}>
                                {sc.technical.overall.toFixed(0)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn('font-mono', scoreColor(sc.business.overall))}>
                                {sc.business.overall.toFixed(0)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn('font-mono', scoreColor(sc.evolution.overall))}>
                                {sc.evolution.overall.toFixed(0)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn('font-mono', scoreColor(sc.cost.overall))}>
                                {sc.cost.overall.toFixed(0)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge className={cn('font-mono text-xs', scoreBadgeColor(sc.overallScore))}>
                                {sc.overallScore.toFixed(1)}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={cn('flex items-center justify-center gap-1', trend.color)}>
                                {trend.icon}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {delta != null ? (
                                <span className={cn('text-xs font-mono', delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-zinc-400')}>
                                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-600">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-zinc-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无评分数据，点击"评估"触发全量评估</p>
              </div>
            )}
          </PageCard>
        </TabsContent>

        {/* ━━━ Tab2: 退步告警 ━━━ */}
        <TabsContent value="regressing">
          <PageCard title={`退步模块告警 (${regressing.length})`}>
            {regressingQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : regressing.length > 0 ? (
              <div className="space-y-3">
                {regressing.map((m: any) => (
                  <div key={m.moduleId} className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="font-medium">{m.moduleName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-zinc-400">
                          {m.previousScore.toFixed(1)} <ArrowDownRight className="w-3 h-3 inline text-red-400" /> {m.currentScore.toFixed(1)}
                        </span>
                        <Badge className="bg-red-500/20 text-red-400 text-xs">
                          {m.delta > 0 ? '+' : ''}{m.delta.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {m.regressingDimensions?.map((dim: string) => (
                        <Badge key={dim} variant="outline" className="text-[10px] text-orange-400 border-orange-400/30">
                          {dim === 'technical' ? '技术' : dim === 'business' ? '业务' : dim === 'evolution' ? '进化' : dim === 'cost' ? '成本' : dim}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-green-400" />
                <p>所有模块表现稳定，无退步告警</p>
              </div>
            )}
          </PageCard>
        </TabsContent>

        {/* ━━━ Tab3: 组合优化 ━━━ */}
        <TabsContent value="combination">
          <div className="space-y-4">
            <PageCard title="约束条件">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">设备类型</Label>
                  <Select value={deviceType} onValueChange={setDeviceType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPES.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">数据质量等级</Label>
                  <Select value={dataQualityGrade} onValueChange={setDataQualityGrade}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUALITY_GRADES.map(g => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">延迟要求</Label>
                  <Select value={latencyRequirement} onValueChange={setLatencyRequirement}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LATENCY_OPTIONS.map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() => optimizeMut.mutate({
                      deviceType: deviceType as any,
                      dataQualityGrade: dataQualityGrade as any,
                      latencyRequirement: latencyRequirement as any,
                    })}
                    disabled={optimizeMut.isPending}
                  >
                    {optimizeMut.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />优化中...</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" />推荐组合</>
                    )}
                  </Button>
                </div>
              </div>
            </PageCard>

            {/* 优化结果 */}
            {optimizeMut.data && (
              <>
                {/* 概述 */}
                <PageCard title="优化报告">
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-zinc-400">候选组合: <span className="text-white font-mono">{optimizeMut.data.totalCandidates}</span></span>
                    <span className="text-zinc-400">推荐 Top-{optimizeMut.data.recommendations?.length ?? 0}</span>
                    {optimizeMut.data.dataQualityWarnings?.length > 0 && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {optimizeMut.data.dataQualityWarnings.length} 个质量告警
                      </Badge>
                    )}
                  </div>
                  {optimizeMut.data.dataQualityWarnings?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {optimizeMut.data.dataQualityWarnings.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-yellow-400/80">{w}</p>
                      ))}
                    </div>
                  )}
                </PageCard>

                {/* 推荐组合 */}
                {optimizeMut.data.recommendations?.map((rec: any, idx: number) => (
                  <PageCard key={idx} title={`推荐 #${idx + 1}`} icon={
                    idx === 0 ? <Trophy className="w-4 h-4 text-yellow-400" /> : undefined
                  }>
                    <div className="space-y-3">
                      {/* 算法列表 */}
                      <div className="flex flex-wrap gap-2">
                        {rec.combination.algorithmNames.map((name: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>

                      {/* 覆盖分类 */}
                      <div className="flex gap-1 flex-wrap">
                        {rec.combination.coveredCategories.map((cat: string) => (
                          <Badge key={cat} className="text-[10px] bg-blue-500/10 text-blue-400">{cat}</Badge>
                        ))}
                      </div>

                      {/* 评分条 */}
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { label: '准确率', value: rec.accuracy, color: 'bg-green-500' },
                          { label: '覆盖率', value: rec.coverage, color: 'bg-blue-500' },
                          { label: '延迟', value: rec.latencyScore, color: 'bg-purple-500' },
                          { label: '成本', value: rec.costScore, color: 'bg-orange-500' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-400">{label}</span>
                              <span className="font-mono">{value.toFixed(0)}</span>
                            </div>
                            <Progress value={value} className={cn('h-1.5', `[&>div]:${color}`)} />
                          </div>
                        ))}
                      </div>

                      {/* 综合分 + 置信度 */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                          <span>综合: <span className={cn('font-mono font-bold', scoreColor(rec.score))}>{rec.score.toFixed(1)}</span></span>
                          <span className="text-zinc-400">置信度: {(rec.confidence * 100).toFixed(0)}%</span>
                          <span className="text-zinc-500 text-xs">
                            CI [{rec.confidenceInterval.lower.toFixed(1)}, {rec.confidenceInterval.upper.toFixed(1)}]
                          </span>
                        </div>
                        {rec.replayStats && (
                          <span className="text-xs text-zinc-400">
                            回放 {rec.replayStats.totalCases} 案例，正确 {rec.replayStats.correctDiagnoses}，
                            均耗 {rec.replayStats.avgExecutionTimeMs.toFixed(0)}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </PageCard>
                ))}
              </>
            )}

            {/* 仪表盘中已有的组合推荐 */}
            {!optimizeMut.data && (dashboard?.combinationRecommendations?.length ?? 0) > 0 && (
              <PageCard title="已缓存的组合推荐">
                <div className="space-y-2">
                  {dashboard!.combinationRecommendations!.map((report: any) => (
                    <div key={report.reportId} className="p-3 rounded-lg border border-zinc-700">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{report.constraints.deviceType}</Badge>
                        <Badge variant="outline" className="text-[10px]">{report.constraints.dataQualityGrade}</Badge>
                        <span className="text-zinc-400">{report.recommendations?.length ?? 0} 个推荐</span>
                        <span className="text-xs text-zinc-500 ml-auto">
                          {new Date(report.generatedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>
            )}
          </div>
        </TabsContent>

        {/* ━━━ Tab4: 业务 KPI ━━━ */}
        <TabsContent value="kpi">
          <PageCard title="业务价值 KPI">
            {businessKpiQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : kpi ? (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border border-zinc-700 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <Shield className="w-4 h-4" />预警提前 (天)
                    </div>
                    <p className="text-2xl font-mono font-bold text-green-400">
                      {kpi.earlyWarningLeadTimeDays.toFixed(1)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-zinc-700 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <CheckCircle2 className="w-4 h-4" />避免停机 (次)
                    </div>
                    <p className="text-2xl font-mono font-bold text-blue-400">
                      {kpi.avoidedDowntimeCount}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-zinc-700 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <XCircle className="w-4 h-4" />误报率
                    </div>
                    <p className={cn('text-2xl font-mono font-bold', kpi.falseAlarmRate < 0.1 ? 'text-green-400' : kpi.falseAlarmRate < 0.2 ? 'text-yellow-400' : 'text-red-400')}>
                      {(kpi.falseAlarmRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-zinc-700 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <Target className="w-4 h-4" />采纳率
                    </div>
                    <p className={cn('text-2xl font-mono font-bold', kpi.adoptionRate > 0.8 ? 'text-green-400' : kpi.adoptionRate > 0.5 ? 'text-yellow-400' : 'text-red-400')}>
                      {(kpi.adoptionRate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* 样本量明细 */}
                {kpi.sampleSizes && (
                  <div className="p-4 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-400 mb-3">样本量明细</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-zinc-500">已确认故障</span>
                        <p className="font-mono">{kpi.sampleSizes.confirmedFailures}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">预测性维护</span>
                        <p className="font-mono">{kpi.sampleSizes.predictiveMaintenances}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">总告警数</span>
                        <p className="font-mono">{kpi.sampleSizes.totalAlerts}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">误报告警</span>
                        <p className="font-mono">{kpi.sampleSizes.falsePositiveAlerts}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">总建议数</span>
                        <p className="font-mono">{kpi.sampleSizes.totalRecommendations}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">已采纳建议</span>
                        <p className="font-mono">{kpi.sampleSizes.followedRecommendations}</p>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-zinc-500">
                  统计窗口: {new Date(kpi.windowStartMs).toLocaleDateString()} ~ {new Date(kpi.windowEndMs).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <p className="text-zinc-500 text-center py-8">无法加载业务 KPI</p>
            )}
          </PageCard>
        </TabsContent>

        {/* ━━━ Tab5: 评估配置 ━━━ */}
        <TabsContent value="config">
          <div className="grid grid-cols-2 gap-4">
            <PageCard title="四维权重" icon={<Settings2 className="w-4 h-4" />}>
              {configQuery.data?.dimensionWeights ? (
                <div className="space-y-3">
                  {DIMENSION_CONFIG.map(({ key, label, icon, color }) => {
                    const weight = (configQuery.data!.dimensionWeights as any)[key] as number;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          {icon}
                          <span>{label}维度</span>
                          <span className="ml-auto font-mono">{(weight * 100).toFixed(0)}%</span>
                        </div>
                        <Progress value={weight * 100} className={cn('h-2', `[&>div]:${color}`)} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
              )}
            </PageCard>

            <PageCard title="系统参数" icon={<Settings2 className="w-4 h-4" />}>
              {configQuery.data ? (
                <div className="space-y-2">
                  {[
                    { label: '评估间隔', value: `${(configQuery.data.scheduledIntervalMs / 3_600_000).toFixed(0)}h` },
                    { label: '统计窗口', value: `${(configQuery.data.evaluationWindowMs / 86_400_000).toFixed(0)}d` },
                    { label: '退步阈值', value: `${configQuery.data.regressionThreshold}` },
                    { label: '最大组合数/设备', value: `${configQuery.data.combinationOptimizer.maxCombinationsPerDeviceType}` },
                    { label: 'Top-N 推荐', value: `${configQuery.data.combinationOptimizer.topN}` },
                    { label: '最少历史案例', value: `${configQuery.data.combinationOptimizer.minHistoricalCases}` },
                    { label: 'Bootstrap 样本', value: `${configQuery.data.combinationOptimizer.bootstrapSamples}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between p-2 rounded border border-zinc-700/50">
                      <span className="text-sm text-zinc-400">{label}</span>
                      <span className="text-sm font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
              )}
            </PageCard>

            <PageCard title="技术维度子权重">
              {configQuery.data?.technicalWeights ? (
                <div className="space-y-2">
                  {Object.entries(configQuery.data.technicalWeights).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between p-2 rounded border border-zinc-700/50">
                      <span className="text-sm text-zinc-400">{k}</span>
                      <span className="text-sm font-mono">{((v as number) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </PageCard>

            <PageCard title="组合评分权重">
              {configQuery.data?.combinationScoringWeights ? (
                <div className="space-y-2">
                  {Object.entries(configQuery.data.combinationScoringWeights).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between p-2 rounded border border-zinc-700/50">
                      <span className="text-sm text-zinc-400">{k}</span>
                      <span className="text-sm font-mono">{((v as number) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </PageCard>
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
