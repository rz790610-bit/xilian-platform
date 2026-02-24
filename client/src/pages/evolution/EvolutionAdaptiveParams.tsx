/**
 * ============================================================================
 * 自适应参数推荐 — Phase 5
 * ============================================================================
 * 基于历史数据和元学习器的参数推荐引擎
 * 后端路由: evoEvolution.deepAI.adaptiveParams.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, SectionHeader, EmptyState } from '@/components/evolution';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  Sliders, Wand2, Play, Plus, RefreshCw, CheckCircle, Clock,
  AlertTriangle, XCircle, Undo2, TrendingUp, Zap, Target,
  ArrowRight, Settings, Eye,
} from 'lucide-react';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待分析', variant: 'secondary' },
  analyzing: { label: '分析中', variant: 'outline' },
  ready: { label: '推荐就绪', variant: 'default' },
  applied: { label: '已应用', variant: 'default' },
  rolled_back: { label: '已回滚', variant: 'destructive' },
  rejected: { label: '已拒绝', variant: 'secondary' },
};

const ENGINE_MODULES = [
  'orchestrator', 'causalGraph', 'experiencePool', 'physicsVerifier',
  'feedbackLoop', 'shadowEvaluator', 'championChallenger', 'canaryDeployment',
  'otaFleet', 'dojoTraining', 'dataEngine', 'metaLearner',
  'autoCodeGen', 'closedLoopTracker', 'worldModel',
];

export default function EvolutionAdaptiveParams() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    engineModule: 'orchestrator', reason: '', targetMetric: 'accuracy',
  });

  const listQuery = trpc.evoEvolution.deepAI.adaptiveRecommend.list.useQuery({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    engineModule: moduleFilter !== 'all' ? moduleFilter : undefined,
  }, { retry: 1 });
  const statsQuery = trpc.evoEvolution.deepAI.adaptiveRecommend.getStats.useQuery(undefined, { retry: 1 });

  const generateMut = trpc.evoEvolution.deepAI.adaptiveRecommend.triggerRecommendation.useMutation({
    onSuccess: () => { listQuery.refetch(); statsQuery.refetch(); setShowCreate(false); },
  });
  const applyMut = trpc.evoEvolution.deepAI.adaptiveRecommend.apply.useMutation({
    onSuccess: () => { listQuery.refetch(); statsQuery.refetch(); },
  });
  const rollbackMut = trpc.evoEvolution.deepAI.adaptiveRecommend.revert.useMutation({
    onSuccess: () => { listQuery.refetch(); statsQuery.refetch(); },
  });
  const rejectMut = trpc.evoEvolution.deepAI.adaptiveRecommend.reject.useMutation({
    onSuccess: () => { listQuery.refetch(); statsQuery.refetch(); },
  });

  const items = (listQuery.data ?? []) as any[];
  const stats = statsQuery.data;

  // 模块分布饼图
  const moduleDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((item: any) => { map[item.engineModule as string] = (map[item.engineModule as string] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [items]);

  // 置信度趋势
  const confidenceTrend = useMemo(() => {
    return items
      .filter((i: any) => i.confidenceScore != null)
      .slice(0, 20)
      .reverse()
      .map((i: any, idx: number) => ({
        index: idx + 1,
        confidence: (Number(i.confidenceScore) * 100).toFixed(1),
        module: String(i.engineModule),
      }));
  }, [items]);

  const selectedItem = items.find((i: any) => i.id === selectedId);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-violet-500" />
            自适应参数推荐
          </h1>
          <p className="text-muted-foreground mt-1">
            基于历史数据和元学习器，自动推荐最优引擎参数配置
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="推荐总数" value={stats?.total ?? 0} icon={<Sliders className="w-4 h-4" />} />
          <StatCard label="已应用" value={stats?.applied ?? 0} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
          <StatCard label="推荐就绪" value={stats?.pending ?? 0} icon={<Target className="w-4 h-4 text-blue-500" />} />
          <StatCard label="已回滚" value={stats?.reverted ?? 0} icon={<Undo2 className="w-4 h-4 text-amber-500" />} />
          <StatCard label="平均置信度" value={stats?.avgConfidence != null ? `${(Number(stats.avgConfidence) * 100).toFixed(1)}%` : '-'} icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左侧：推荐列表 */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeader title="参数推荐记录" />
              <div className="flex gap-2">
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部模块</SelectItem>
                    {ENGINE_MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4 mr-1" />生成推荐
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <EmptyState message="暂无推荐记录，点击「生成推荐」为引擎模块生成最优参数推荐" />
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {items.map((item: any) => (
                    <div
                      key={item.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === item.id ? 'border-primary bg-muted/30' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Sliders className="w-5 h-5 text-violet-500" />
                          <div>
                            <div className="font-medium">{String(item.engineModule)}</div>
                            <div className="text-xs text-muted-foreground">
                              置信度: {item.confidenceScore != null ? `${(Number(item.confidenceScore) * 100).toFixed(1)}%` : '-'}
                              {item.expectedImprovement != null ? ` · 预期提升: ${(Number(item.expectedImprovement) * 100).toFixed(1)}%` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_MAP[item.status as string]?.variant ?? 'secondary'}>
                            {STATUS_MAP[item.status as string]?.label ?? String(item.status)}
                          </Badge>
                          <div className="flex gap-1">
                            {item.status === 'ready' && (
                              <>
                                <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); applyMut.mutate({ id: item.id as number }); }}>
                                  <CheckCircle className="w-3 h-3 mr-1" />应用
                                </Button>
                                <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); rejectMut.mutate({ id: item.id as number }); }}>
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {item.status === 'applied' && (
                              <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); rollbackMut.mutate({ id: item.id as number }); }}>
                                <Undo2 className="w-3 h-3 mr-1" />回滚
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* 右侧：详情 + 图表 */}
          <div className="space-y-4">
            {/* 模块分布 */}
            {moduleDistribution.length > 0 && (
              <div className="border rounded-lg p-4">
                <div className="text-sm font-medium mb-3">模块分布</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={moduleDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }: { name: string; percent: number }) => `${String(name).substring(0, 8)} ${(percent * 100).toFixed(0)}%`}>
                      {moduleDistribution.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 置信度趋势 */}
            {confidenceTrend.length > 0 && (
              <div className="border rounded-lg p-4">
                <div className="text-sm font-medium mb-3">置信度趋势</div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={confidenceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="index" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="confidence" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 选中项详情 */}
            {selectedItem && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium">推荐详情</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">模块</span><span>{String(selectedItem.engineModule)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">状态</span><Badge variant={STATUS_MAP[selectedItem.status as string]?.variant ?? 'secondary'}>{STATUS_MAP[selectedItem.status as string]?.label ?? String(selectedItem.status)}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">置信度</span><span>{selectedItem.confidenceScore != null ? `${(Number(selectedItem.confidenceScore) * 100).toFixed(1)}%` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">预期提升</span><span>{selectedItem.expectedImprovement != null ? `${(Number(selectedItem.expectedImprovement) * 100).toFixed(1)}%` : '-'}</span></div>
                  {selectedItem.reason && <div className="text-xs text-muted-foreground border-t pt-2">{String(selectedItem.reason)}</div>}

                  {/* 参数对比 */}
                  {selectedItem.currentParams && selectedItem.recommendedParams && (
                    <div className="border-t pt-2 mt-2">
                      <div className="font-medium mb-2">参数对比</div>
                      <div className="space-y-1">
                        {Object.keys(selectedItem.recommendedParams as Record<string, unknown>).map((key: string) => {
                          const current = (selectedItem.currentParams as Record<string, unknown>)?.[key];
                          const recommended = (selectedItem.recommendedParams as Record<string, unknown>)?.[key];
                          const changed = JSON.stringify(current) !== JSON.stringify(recommended);
                          return (
                            <div key={key} className={`flex items-center gap-1 text-xs ${changed ? 'text-amber-600 font-medium' : ''}`}>
                              <span className="w-24 truncate">{key}</span>
                              <span className="text-muted-foreground">{String(current ?? '-')}</span>
                              <ArrowRight className="w-3 h-3" />
                              <span>{String(recommended ?? '-')}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 生成推荐对话框 */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>生成参数推荐</DialogTitle>
              <DialogDescription>基于历史数据和元学习器为指定引擎模块生成最优参数推荐</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">目标引擎模块 *</label>
                <Select value={form.engineModule} onValueChange={(v: string) => setForm(f => ({ ...f, engineModule: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENGINE_MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">目标指标</label>
                <Select value={form.targetMetric} onValueChange={(v: string) => setForm(f => ({ ...f, targetMetric: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accuracy">精度</SelectItem>
                    <SelectItem value="latency">延迟</SelectItem>
                    <SelectItem value="throughput">吞吐量</SelectItem>
                    <SelectItem value="stability">稳定性</SelectItem>
                    <SelectItem value="cost">成本</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">推荐原因</label>
                <Textarea value={form.reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="描述为什么需要参数调整..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={() => generateMut.mutate({
                engineModule: form.engineModule,
                recommendationType: form.targetMetric,
              })} disabled={generateMut.isPending}>
                <Wand2 className="w-4 h-4 mr-1" />
                {generateMut.isPending ? '生成中...' : '生成推荐'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
