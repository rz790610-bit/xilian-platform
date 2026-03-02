/**
 * P2-9 进化实验室页面 — EvolutionLabPage
 *
 * 功能：
 * 1. 实验列表 — 所有实验及其状态，支持行操作（影子验证/提交审核/批准）
 * 2. 新建实验 — 提交洞察 → 设计实验
 * 3. 运行周期 — 触发完整实验周期 + 报告展示
 * 4. 周期历史 — 历史周期记录
 */
import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  FlaskConical, Play, Loader2, Eye, CheckCircle2, XCircle,
  ChevronRight, Clock, Shield, TestTube, Rocket, History,
  Plus, Send, RefreshCw, AlertTriangle, TrendingUp,
} from 'lucide-react';

// ==================== 常量 ====================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-zinc-500/20 text-zinc-400', icon: <Clock className="w-3 h-3" /> },
  designed: { label: '已设计', color: 'bg-blue-500/20 text-blue-400', icon: <FlaskConical className="w-3 h-3" /> },
  validating: { label: '验证中', color: 'bg-yellow-500/20 text-yellow-400', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  validated: { label: '已验证', color: 'bg-emerald-500/20 text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
  review_pending: { label: '待审核', color: 'bg-purple-500/20 text-purple-400', icon: <Eye className="w-3 h-3" /> },
  approved: { label: '已批准', color: 'bg-green-500/20 text-green-400', icon: <Shield className="w-3 h-3" /> },
  deploying: { label: '部署中', color: 'bg-cyan-500/20 text-cyan-400', icon: <Rocket className="w-3 h-3" /> },
  deployed: { label: '已部署', color: 'bg-green-600/20 text-green-300', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: '已拒绝', color: 'bg-red-500/20 text-red-400', icon: <XCircle className="w-3 h-3" /> },
  failed: { label: '失败', color: 'bg-red-600/20 text-red-300', icon: <AlertTriangle className="w-3 h-3" /> },
};

const LIFECYCLE_STAGES = ['draft', 'designed', 'validating', 'validated', 'review_pending', 'approved', 'deploying', 'deployed'];

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  scheduled: '定时触发', intelligence: '情报触发', feedback: '反馈触发',
  performance: '性能触发', manual: '手动触发',
};

// ==================== 主组件 ====================

export default function EvolutionLabPage() {
  const { toast } = useToast();

  // 表单状态
  const [insightSource, setInsightSource] = useState<string>('manual');
  const [insightTitle, setInsightTitle] = useState('');
  const [insightDescription, setInsightDescription] = useState('');
  const [insightPriority, setInsightPriority] = useState(5);
  const [lastInsightId, setLastInsightId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<any>(null);

  // 周期触发
  const [cycleTriggerType, setCycleTriggerType] = useState<string>('manual');
  const [cycleTriggerDesc, setCycleTriggerDesc] = useState('手动触发实验周期');

  // tRPC queries
  const experimentsQuery = trpc.ai.lab.listExperiments.useQuery();
  const cycleHistoryQuery = trpc.ai.lab.getCycleHistory.useQuery();

  // tRPC mutations
  const submitInsightMut = trpc.ai.lab.submitInsight.useMutation({
    onSuccess: (data) => {
      setLastInsightId(data.insightId);
      toast({ title: '洞察已提交', description: `ID: ${data.insightId}`, variant: 'success' });
    },
    onError: (err) => toast({ title: '提交失败', description: err.message, variant: 'destructive' }),
  });

  const designExperimentMut = trpc.ai.lab.designExperiment.useMutation({
    onSuccess: () => {
      toast({ title: '实验设计完成', variant: 'success' });
      experimentsQuery.refetch();
    },
    onError: (err) => toast({ title: '设计失败', description: err.message, variant: 'destructive' }),
  });

  const shadowValidationMut = trpc.ai.lab.runShadowValidation.useMutation({
    onSuccess: () => {
      toast({ title: '影子验证完成', variant: 'success' });
      experimentsQuery.refetch();
    },
    onError: (err) => toast({ title: '验证失败', description: err.message, variant: 'destructive' }),
  });

  const submitForReviewMut = trpc.ai.lab.submitForReview.useMutation({
    onSuccess: () => {
      toast({ title: '已提交审核', variant: 'success' });
      experimentsQuery.refetch();
    },
    onError: (err) => toast({ title: '提交审核失败', description: err.message, variant: 'destructive' }),
  });

  const applyExperimentMut = trpc.ai.lab.applyExperiment.useMutation({
    onSuccess: () => {
      toast({ title: '实验已批准并应用', variant: 'success' });
      experimentsQuery.refetch();
    },
    onError: (err) => toast({ title: '应用失败', description: err.message, variant: 'destructive' }),
  });

  const runCycleMut = trpc.ai.lab.runCycle.useMutation({
    onSuccess: () => {
      toast({ title: '实验周期完成', variant: 'success' });
      experimentsQuery.refetch();
      cycleHistoryQuery.refetch();
    },
    onError: (err) => toast({ title: '周期执行失败', description: err.message, variant: 'destructive' }),
  });

  // 派生数据
  const experiments = experimentsQuery.data ?? [];
  const filteredExperiments = statusFilter === 'all'
    ? experiments
    : experiments.filter((e: any) => e.status === statusFilter);

  const experimentCounts = {
    total: experiments.length,
    active: experiments.filter((e: any) => !['deployed', 'rejected', 'failed'].includes(e.status)).length,
    deployed: experiments.filter((e: any) => e.status === 'deployed').length,
    cycles: cycleHistoryQuery.data?.length ?? 0,
  };

  // 操作
  const handleSubmitInsight = useCallback(() => {
    if (!insightTitle.trim()) return;
    submitInsightMut.mutate({
      source: insightSource as any,
      title: insightTitle.trim(),
      description: insightDescription.trim(),
      priority: insightPriority,
      metadata: {},
    });
  }, [insightSource, insightTitle, insightDescription, insightPriority, submitInsightMut]);

  const handleDesignExperiment = useCallback(() => {
    if (!lastInsightId) return;
    designExperimentMut.mutate({ insightId: lastInsightId });
  }, [lastInsightId, designExperimentMut]);

  const handleApprove = useCallback((experimentId: string) => {
    applyExperimentMut.mutate({
      experimentId,
      approval: {
        reviewId: crypto.randomUUID(),
        approved: true,
        approvedBy: 'admin',
        comment: '前端批准',
        approvedAt: Date.now(),
      },
    });
  }, [applyExperimentMut]);

  const handleRunCycle = useCallback(() => {
    const trigger = cycleTriggerType === 'manual'
      ? { type: 'manual' as const, description: cycleTriggerDesc, userId: 'admin' }
      : { type: 'scheduled' as const, cycleId: crypto.randomUUID() };
    runCycleMut.mutate({ trigger });
  }, [cycleTriggerType, cycleTriggerDesc, runCycleMut]);

  const isAnyMutationLoading = submitInsightMut.isPending || designExperimentMut.isPending
    || shadowValidationMut.isPending || submitForReviewMut.isPending
    || applyExperimentMut.isPending || runCycleMut.isPending;

  return (
    <MainLayout title="AI 进化实验室">
      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="总实验数" value={experimentCounts.total} icon={<FlaskConical className="w-5 h-5" />} />
        <StatCard label="活跃实验" value={experimentCounts.active} icon={<TestTube className="w-5 h-5" />} />
        <StatCard label="已部署" value={experimentCounts.deployed} icon={<Rocket className="w-5 h-5" />} />
        <StatCard label="实验周期" value={experimentCounts.cycles} icon={<RefreshCw className="w-5 h-5" />} />
        <StatCard label="最新洞察" value={lastInsightId ? lastInsightId.slice(0, 8) : '-'} icon={<TrendingUp className="w-5 h-5" />} />
      </div>

      {/* 生命周期流水线 */}
      <PageCard title="实验生命周期" className="mb-6">
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          {LIFECYCLE_STAGES.map((stage, i) => {
            const cfg = STATUS_CONFIG[stage];
            const count = experiments.filter((e: any) => e.status === stage).length;
            return (
              <div key={stage} className="flex items-center">
                {i > 0 && <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0 mx-1" />}
                <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap', cfg.color)}>
                  {cfg.icon}
                  <span>{cfg.label}</span>
                  {count > 0 && <Badge className="text-[10px] h-4 px-1">{count}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </PageCard>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">实验列表</TabsTrigger>
          <TabsTrigger value="new">新建实验</TabsTrigger>
          <TabsTrigger value="cycle">运行周期</TabsTrigger>
          <TabsTrigger value="history">周期历史</TabsTrigger>
        </TabsList>

        {/* ━━━ Tab1: 实验列表 ━━━ */}
        <TabsContent value="list">
          <PageCard title="实验管理" action={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }>
            {experimentsQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : filteredExperiments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="text-left py-2 px-3">实验 ID</th>
                      <th className="text-left py-2 px-3">标题</th>
                      <th className="text-center py-2 px-3">状态</th>
                      <th className="text-center py-2 px-3">设计者</th>
                      <th className="text-center py-2 px-3">预期改善</th>
                      <th className="text-center py-2 px-3">更新时间</th>
                      <th className="text-right py-2 px-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExperiments.map((exp: any) => {
                      const cfg = STATUS_CONFIG[exp.status] ?? STATUS_CONFIG.draft;
                      return (
                        <tr key={exp.experimentId} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                          <td className="py-2 px-3 font-mono text-xs">{exp.experimentId.slice(0, 8)}...</td>
                          <td className="py-2 px-3">
                            <Button variant="link" className="p-0 h-auto text-sm" onClick={() => { setSelectedExperiment(exp); setDetailDialogOpen(true); }}>
                              {exp.title}
                            </Button>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge className={cn('text-xs', cfg.color)}>
                              {cfg.icon}<span className="ml-1">{cfg.label}</span>
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center text-xs text-zinc-400">{exp.designedBy}</td>
                          <td className="py-2 px-3 text-center text-green-400">
                            +{(exp.expectedImprovement * 100).toFixed(0)}%
                          </td>
                          <td className="py-2 px-3 text-center text-xs text-zinc-400">
                            {new Date(exp.updatedAt).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {exp.status === 'designed' && (
                                <Button size="sm" variant="outline" className="text-xs h-7"
                                  disabled={shadowValidationMut.isPending}
                                  onClick={() => shadowValidationMut.mutate({ experimentId: exp.experimentId })}
                                >
                                  <TestTube className="w-3 h-3 mr-1" />影子验证
                                </Button>
                              )}
                              {exp.status === 'validated' && (
                                <Button size="sm" variant="outline" className="text-xs h-7"
                                  disabled={submitForReviewMut.isPending}
                                  onClick={() => submitForReviewMut.mutate({ experimentId: exp.experimentId })}
                                >
                                  <Send className="w-3 h-3 mr-1" />提交审核
                                </Button>
                              )}
                              {exp.status === 'review_pending' && (
                                <Button size="sm" variant="default" className="text-xs h-7"
                                  disabled={applyExperimentMut.isPending}
                                  onClick={() => handleApprove(exp.experimentId)}
                                >
                                  <Shield className="w-3 h-3 mr-1" />批准
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-zinc-500 text-center py-8">暂无实验记录</p>
            )}
          </PageCard>
        </TabsContent>

        {/* ━━━ Tab2: 新建实验 ━━━ */}
        <TabsContent value="new">
          <div className="grid grid-cols-2 gap-6">
            {/* Step 1: 提交洞察 */}
            <PageCard title="Step 1 — 提交洞察">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>来源</Label>
                  <Select value={insightSource} onValueChange={setInsightSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input
                    placeholder="如: 轴承故障检测改进"
                    value={insightTitle}
                    onChange={e => setInsightTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    placeholder="详细描述洞察内容和改进方向..."
                    value={insightDescription}
                    onChange={e => setInsightDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>优先级 (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={insightPriority}
                    onChange={e => setInsightPriority(parseInt(e.target.value) || 5)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmitInsight}
                  disabled={submitInsightMut.isPending || !insightTitle.trim()}
                >
                  {submitInsightMut.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />提交中...</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-2" />提交洞察</>
                  )}
                </Button>

                {lastInsightId && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 inline mr-2" />
                    洞察已提交，ID: <span className="font-mono">{lastInsightId.slice(0, 12)}...</span>
                  </div>
                )}
              </div>
            </PageCard>

            {/* Step 2: 设计实验 */}
            <PageCard title="Step 2 — 设计实验">
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  基于提交的洞察，AI 将自动设计实验方案，包括假设、参数、预期改善和物理约束校验。
                </p>

                {!lastInsightId ? (
                  <div className="flex items-center justify-center h-32 text-zinc-500">
                    <p className="text-sm">请先提交洞察（Step 1）</p>
                  </div>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      onClick={handleDesignExperiment}
                      disabled={designExperimentMut.isPending}
                    >
                      {designExperimentMut.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />设计中...</>
                      ) : (
                        <><FlaskConical className="w-4 h-4 mr-2" />设计实验</>
                      )}
                    </Button>

                    {designExperimentMut.data && (
                      <div className="p-4 rounded-lg border border-zinc-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{designExperimentMut.data.title}</span>
                          <Badge className={cn('text-xs', STATUS_CONFIG[designExperimentMut.data.status]?.color)}>
                            {STATUS_CONFIG[designExperimentMut.data.status]?.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-300">假设: {designExperimentMut.data.hypothesis}</p>
                        <p className="text-sm text-zinc-400">设计者: {designExperimentMut.data.designedBy}</p>
                        <p className="text-sm text-green-400">
                          预期改善: +{(designExperimentMut.data.expectedImprovement * 100).toFixed(0)}%
                        </p>
                        {Object.keys(designExperimentMut.data.parameters).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs text-zinc-400">参数:</span>
                            <pre className="text-xs bg-zinc-800 p-2 rounded overflow-x-auto">
                              {JSON.stringify(designExperimentMut.data.parameters, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* ━━━ Tab3: 运行周期 ━━━ */}
        <TabsContent value="cycle">
          <div className="space-y-4">
            <PageCard title="触发实验周期">
              <div className="flex items-end gap-4">
                <div className="space-y-2">
                  <Label>触发类型</Label>
                  <Select value={cycleTriggerType} onValueChange={setCycleTriggerType}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动触发</SelectItem>
                      <SelectItem value="scheduled">定时触发</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cycleTriggerType === 'manual' && (
                  <div className="flex-1 space-y-2">
                    <Label>描述</Label>
                    <Input
                      value={cycleTriggerDesc}
                      onChange={e => setCycleTriggerDesc(e.target.value)}
                      placeholder="手动触发实验周期"
                    />
                  </div>
                )}
                <Button onClick={handleRunCycle} disabled={runCycleMut.isPending}>
                  {runCycleMut.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />运行中...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" />触发周期</>
                  )}
                </Button>
              </div>
            </PageCard>

            {/* 周期报告 */}
            {runCycleMut.data && (
              <PageCard title="周期报告">
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-zinc-800">
                      <p className="text-xs text-zinc-400">收集洞察</p>
                      <p className="text-lg font-mono">{runCycleMut.data.insightsCollected}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800">
                      <p className="text-xs text-zinc-400">设计实验</p>
                      <p className="text-lg font-mono">{runCycleMut.data.experimentsDesigned}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800">
                      <p className="text-xs text-zinc-400">通过验证</p>
                      <p className="text-lg font-mono text-green-400">{runCycleMut.data.experimentsPassed}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800">
                      <p className="text-xs text-zinc-400">已部署</p>
                      <p className="text-lg font-mono text-blue-400">{runCycleMut.data.experimentsDeployed}</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300">{runCycleMut.data.summary}</p>
                  <p className="text-xs text-zinc-500">
                    耗时: {(runCycleMut.data.durationMs / 1000).toFixed(1)}s |
                    周期 ID: {runCycleMut.data.cycleId.slice(0, 12)}...
                  </p>
                </div>
              </PageCard>
            )}
          </div>
        </TabsContent>

        {/* ━━━ Tab4: 周期历史 ━━━ */}
        <TabsContent value="history">
          <PageCard title="周期历史">
            {cycleHistoryQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : (cycleHistoryQuery.data?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="text-left py-2 px-3">周期 ID</th>
                      <th className="text-center py-2 px-3">触发类型</th>
                      <th className="text-center py-2 px-3">洞察</th>
                      <th className="text-center py-2 px-3">设计</th>
                      <th className="text-center py-2 px-3">通过</th>
                      <th className="text-center py-2 px-3">部署</th>
                      <th className="text-center py-2 px-3">耗时</th>
                      <th className="text-center py-2 px-3">完成时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(cycleHistoryQuery.data ?? [])].reverse().map((c: any) => (
                      <tr key={c.cycleId} className="border-b border-zinc-800">
                        <td className="py-2 px-3 font-mono text-xs">{c.cycleId.slice(0, 8)}...</td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant="outline" className="text-xs">
                            {TRIGGER_TYPE_LABELS[c.trigger?.type] ?? c.trigger?.type}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-center">{c.insightsCollected}</td>
                        <td className="py-2 px-3 text-center">{c.experimentsDesigned}</td>
                        <td className="py-2 px-3 text-center text-green-400">{c.experimentsPassed}</td>
                        <td className="py-2 px-3 text-center text-blue-400">{c.experimentsDeployed}</td>
                        <td className="py-2 px-3 text-center text-xs text-zinc-400">{(c.durationMs / 1000).toFixed(1)}s</td>
                        <td className="py-2 px-3 text-center text-xs text-zinc-400">
                          {new Date(c.completedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-zinc-500 text-center py-8">暂无周期记录</p>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>

      {/* 实验详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedExperiment?.title ?? '实验详情'}</DialogTitle>
          </DialogHeader>
          {selectedExperiment && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-zinc-400">实验 ID</Label>
                    <p className="text-sm font-mono">{selectedExperiment.experimentId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">洞察 ID</Label>
                    <p className="text-sm font-mono">{selectedExperiment.insightId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">状态</Label>
                    <Badge className={cn('text-xs', STATUS_CONFIG[selectedExperiment.status]?.color)}>
                      {STATUS_CONFIG[selectedExperiment.status]?.label}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">设计者</Label>
                    <p className="text-sm">{selectedExperiment.designedBy}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">假设</Label>
                  <p className="text-sm">{selectedExperiment.hypothesis}</p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">预期改善</Label>
                  <p className="text-sm text-green-400">+{(selectedExperiment.expectedImprovement * 100).toFixed(0)}%</p>
                </div>
                {Object.keys(selectedExperiment.parameters ?? {}).length > 0 && (
                  <div>
                    <Label className="text-xs text-zinc-400">参数</Label>
                    <pre className="text-xs bg-zinc-800 p-3 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(selectedExperiment.parameters, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-xs text-zinc-400">
                  <div>创建: {new Date(selectedExperiment.createdAt).toLocaleString()}</div>
                  <div>更新: {new Date(selectedExperiment.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
