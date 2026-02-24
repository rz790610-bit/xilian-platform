/**
 * ============================================================================
 * 进化引擎自愈与自优化闭环 — Phase 4
 * ============================================================================
 * 4 个 Tab: 自动回滚 | 参数自调优 | 代码飞轮 | 自愈策略
 * 后端路由: evoEvolution.selfHealing.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, EmptyState, DataTable, ConfirmDialog } from '@/components/evolution';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check,
  ChevronDown, ChevronRight, ChevronUp, Clock, Code, Code2, Copy,
  Database, Eye, Filter, GitBranch, Layers, Play, Plus, RefreshCw,
  RotateCcw, Search, Settings, Shield, ShieldCheck, Sliders, Target,
  TrendingDown, TrendingUp, Undo2, X, Zap, FlaskConical, Cpu,
  FileCode, CheckCircle, XCircle, Rocket, Pause, Trash2, BarChart3,
} from 'lucide-react';

// ============================================================================
// 常量
// ============================================================================
const ENGINE_MODULES = [
  'shadow_evaluator', 'champion_challenger', 'canary_deployer', 'ota_fleet_canary',
  'intervention_rate_engine', 'simulation_engine', 'data_engine', 'dual_flywheel',
  'dojo_training_scheduler', 'auto_labeling_pipeline', 'domain_router', 'meta_learner',
  'fleet_neural_planner', 'e2e_evolution_agent', 'closed_loop_tracker',
] as const;

const MODULE_LABELS: Record<string, string> = {
  shadow_evaluator: '影子评估器', champion_challenger: '冠军挑战者',
  canary_deployer: '金丝雀部署', ota_fleet_canary: 'OTA 车队',
  intervention_rate_engine: '干预率引擎', simulation_engine: '仿真引擎',
  data_engine: '数据引擎', dual_flywheel: '双飞轮',
  dojo_training_scheduler: 'Dojo 训练', auto_labeling_pipeline: '自动标注',
  domain_router: '领域路由', meta_learner: '元学习器',
  fleet_neural_planner: '车队规划', e2e_evolution_agent: 'E2E Agent',
  closed_loop_tracker: '闭环追踪',
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  auto_rollback: '自动回滚', param_tuning: '参数自调优',
  codegen: '代码飞轮', circuit_breaker: '熔断器',
};

const POLICY_TYPE_COLORS: Record<string, string> = {
  auto_rollback: 'bg-red-500/10 text-red-400 border-red-500/20',
  param_tuning: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  codegen: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  circuit_breaker: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  executing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  validated: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  deployed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  skipped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  generating: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  generated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  validating: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  passed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中', executing: '执行中', running: '运行中',
  success: '成功', completed: '已完成', validated: '已验证',
  deployed: '已部署', failed: '失败', cancelled: '已取消',
  skipped: '已跳过', draft: '草稿', generating: '生成中',
  generated: '已生成', validating: '验证中', passed: '通过',
};

const SEARCH_STRATEGY_LABELS: Record<string, string> = {
  bayesian: '贝叶斯优化', grid: '网格搜索',
  random: '随机搜索', evolutionary: '进化算法',
};

const CODE_TYPE_LABELS: Record<string, string> = {
  feature_extractor: '特征提取器', detection_rule: '检测规则',
  transform_pipeline: '转换管线', aggregation: '聚合函数', custom: '自定义',
};

const CHART_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

// ============================================================================
// 辅助函数
// ============================================================================
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// ============================================================================
// Tab 1: 自动回滚
// ============================================================================
function RollbackTab() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    rollbackType: 'deployment' as 'deployment' | 'model' | 'config' | 'full_chain',
    reason: '',
    modelVersion: '',
  });

  const rollbackList = trpc.evoEvolution.selfHealing.rollback.list.useQuery(
    typeFilter !== 'all' ? { rollbackType: typeFilter as 'deployment' | 'model' | 'config' | 'full_chain' } : undefined
  );
  const rollbackStats = trpc.evoEvolution.selfHealing.rollback.stats.useQuery();
  const createMut = trpc.evoEvolution.selfHealing.rollback.create.useMutation({ onSuccess: () => { rollbackList.refetch(); rollbackStats.refetch(); setShowCreate(false); } });
  const executeMut = trpc.evoEvolution.selfHealing.rollback.execute.useMutation({ onSuccess: () => { rollbackList.refetch(); rollbackStats.refetch(); } });
  const cancelMut = trpc.evoEvolution.selfHealing.rollback.cancel.useMutation({ onSuccess: () => { rollbackList.refetch(); rollbackStats.refetch(); } });

  const stats = rollbackStats.data;
  const records = rollbackList.data ?? [];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总回滚次数" value={stats?.total ?? 0} icon={<RotateCcw className="w-4 h-4" />} compact />
        <StatCard label="成功回滚" value={stats?.completed ?? 0} icon={<CheckCircle className="w-4 h-4" />} compact />
        <StatCard label="失败回滚" value={stats?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} compact />
        <StatCard label="回滚类型" value={Object.keys(stats?.byType ?? {}).length} icon={<Layers className="w-4 h-4" />} compact />
      </div>

      {/* 类型分布饼图 + 操作 */}
      <div className="grid grid-cols-3 gap-4">
        <PageCard title="回滚类型分布" className="col-span-1">
          {stats?.byType && Object.keys(stats.byType).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={Object.entries(stats.byType).map(([k, v]) => ({ name: k === 'deployment' ? '部署回滚' : k === 'model' ? '模型回滚' : k === 'config' ? '配置回滚' : '全链路', value: v }))}
                  cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                >
                  {Object.keys(stats.byType).map((_: string, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState message="暂无回滚记录" />}
        </PageCard>

        <PageCard title="回滚操作" className="col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="deployment">部署回滚</SelectItem>
                <SelectItem value="model">模型回滚</SelectItem>
                <SelectItem value="config">配置回滚</SelectItem>
                <SelectItem value="full_chain">全链路回滚</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建回滚
            </Button>
            <Button size="sm" variant="outline" onClick={() => rollbackList.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[340px]">
            {records.length === 0 ? <EmptyState message="暂无回滚记录" /> : (
              <div className="space-y-2">
                {records.map((r: Record<string, unknown>) => (
                  <div key={r.id as number} className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[r.status as string] ?? 'bg-gray-500/10 text-gray-400'}>
                          {STATUS_LABELS[r.status as string] ?? r.status}
                        </Badge>
                        <Badge variant="outline">
                          {r.rollbackType === 'deployment' ? '部署回滚' : r.rollbackType === 'model' ? '模型回滚' : r.rollbackType === 'config' ? '配置回滚' : '全链路'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(r.createdAt as string)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {r.status === 'pending' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => executeMut.mutate({ id: r.id as number })}>
                              <Play className="w-3 h-3 mr-1" /> 执行
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate({ id: r.id as number })}>
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {Boolean(r.durationMs) && <span className="text-xs text-muted-foreground">{formatDuration(r.durationMs as number)}</span>}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80">{r.reason as string}</p>
                    {Boolean(r.modelVersion) && <p className="text-xs text-muted-foreground mt-1">模型版本: {r.modelVersion as string}</p>}
                    {Boolean(r.verificationResult) && (
                      <div className="mt-2 space-y-1">
                        {((r.verificationResult as { checks: Array<{ name: string; passed: boolean; message: string }> }).checks ?? []).map((c: { name: string; passed: boolean; message: string }, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {c.passed ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                            <span className="text-muted-foreground">{c.name}: {c.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PageCard>
      </div>

      {/* 创建回滚对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建回滚</DialogTitle>
            <DialogDescription>创建一个新的回滚操作</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>回滚类型</Label>
              <Select value={form.rollbackType} onValueChange={(v: string) => setForm({ ...form, rollbackType: v as 'deployment' | 'model' | 'config' | 'full_chain' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deployment">部署回滚</SelectItem>
                  <SelectItem value="model">模型回滚</SelectItem>
                  <SelectItem value="config">配置回滚</SelectItem>
                  <SelectItem value="full_chain">全链路回滚</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>回滚原因</Label>
              <Textarea value={form.reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, reason: e.target.value })} placeholder="描述回滚原因..." />
            </div>
            {form.rollbackType === 'model' && (
              <div>
                <Label>目标模型版本</Label>
                <Input value={form.modelVersion} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, modelVersion: e.target.value })} placeholder="v1.2.3" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({
              rollbackType: form.rollbackType,
              reason: form.reason,
              modelVersion: form.modelVersion || undefined,
              fromState: { version: 'current' },
              toState: { version: form.modelVersion || 'previous' },
            })} disabled={!form.reason}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Tab 2: 参数自调优
// ============================================================================
function ParamTuningTab() {
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    engineModule: 'shadow_evaluator',
    searchStrategy: 'bayesian' as 'bayesian' | 'grid' | 'random' | 'evolutionary',
    objectiveMetric: 'accuracy',
    objectiveDirection: 'maximize' as 'maximize' | 'minimize',
    maxTrials: 50,
    autoApply: false,
  });

  const jobList = trpc.evoEvolution.selfHealing.paramTuning.list.useQuery(
    moduleFilter !== 'all' ? { engineModule: moduleFilter } : undefined
  );
  const tuningStats = trpc.evoEvolution.selfHealing.paramTuning.stats.useQuery();
  const trials = trpc.evoEvolution.selfHealing.paramTuning.getTrials.useQuery(
    { jobId: selectedJob! },
    { enabled: selectedJob !== null }
  );
  const createMut = trpc.evoEvolution.selfHealing.paramTuning.create.useMutation({ onSuccess: () => { jobList.refetch(); setShowCreate(false); } });
  const startMut = trpc.evoEvolution.selfHealing.paramTuning.start.useMutation({ onSuccess: () => { jobList.refetch(); tuningStats.refetch(); } });
  const applyMut = trpc.evoEvolution.selfHealing.paramTuning.applyBest.useMutation({ onSuccess: () => { jobList.refetch(); } });
  const cancelMut = trpc.evoEvolution.selfHealing.paramTuning.cancel.useMutation({ onSuccess: () => { jobList.refetch(); tuningStats.refetch(); } });

  const stats = tuningStats.data;
  const jobs = jobList.data ?? [];
  const trialData = trials.data ?? [];

  // 试验散点图数据
  const scatterData = trialData.map((t: Record<string, unknown>) => ({
    trial: t.trialNumber,
    value: t.objectiveValue,
    duration: t.durationMs,
  }));

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总调优任务" value={stats?.total ?? 0} icon={<Sliders className="w-4 h-4" />} compact />
        <StatCard label="运行中" value={stats?.running ?? 0} icon={<Activity className="w-4 h-4" />} compact />
        <StatCard label="已完成" value={stats?.completed ?? 0} icon={<CheckCircle className="w-4 h-4" />} compact />
        <StatCard label="覆盖模块" value={Object.keys(stats?.byModule ?? {}).length} icon={<Cpu className="w-4 h-4" />} compact />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 任务列表 */}
        <PageCard title="调优任务" className="col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                {ENGINE_MODULES.map((m: string) => <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建调优
            </Button>
            <Button size="sm" variant="outline" onClick={() => jobList.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[400px]">
            {jobs.length === 0 ? <EmptyState message="暂无调优任务" /> : (
              <div className="space-y-2">
                {jobs.map((j: Record<string, unknown>) => (
                  <div
                    key={j.id as number}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${selectedJob === j.id ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border/50 hover:border-border'}`}
                    onClick={() => setSelectedJob(j.id as number)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{j.name as string}</span>
                        <Badge className={STATUS_COLORS[j.status as string] ?? ''}>{STATUS_LABELS[j.status as string] ?? j.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {j.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); startMut.mutate({ id: j.id as number }); }}>
                            <Play className="w-3 h-3 mr-1" /> 启动
                          </Button>
                        )}
                        {j.status === 'completed' && !(j.applied as number) && (
                          <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); applyMut.mutate({ jobId: j.id as number }); }}>
                            <Rocket className="w-3 h-3 mr-1" /> 应用最佳
                          </Button>
                        )}
                        {j.applied === 1 && <Badge className="bg-emerald-500/10 text-emerald-400">已应用</Badge>}
                        {(j.status === 'pending' || j.status === 'running') && (
                          <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); cancelMut.mutate({ id: j.id as number }); }}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{MODULE_LABELS[j.engineModule as string] ?? j.engineModule}</span>
                      <span>{SEARCH_STRATEGY_LABELS[j.searchStrategy as string] ?? j.searchStrategy}</span>
                      <span>试验: {j.completedTrials as number}/{j.maxTrials as number}</span>
                      {j.bestObjectiveValue !== null && <span className="text-emerald-400">最佳: {(j.bestObjectiveValue as number).toFixed(4)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PageCard>

        {/* 试验详情 */}
        <PageCard title={selectedJob ? `试验详情 #${selectedJob}` : '试验详情'} className="col-span-1">
          {!selectedJob ? <EmptyState message="选择一个调优任务查看试验" /> : trialData.length === 0 ? <EmptyState message="暂无试验数据" /> : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="trial" name="试验" type="number" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="value" name="目标值" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Scatter data={scatterData} fill="#06b6d4" />
                </ScatterChart>
              </ResponsiveContainer>
              <ScrollArea className="h-[250px]">
                <div className="space-y-1">
                  {trialData.map((t: Record<string, unknown>) => (
                    <div key={t.id as number} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
                      <span>#{t.trialNumber as number}</span>
                      <span className="text-cyan-400">{(t.objectiveValue as number)?.toFixed(4) ?? '-'}</span>
                      <span className="text-muted-foreground">{formatDuration(t.durationMs as number)}</span>
                      <Badge className={STATUS_COLORS[t.status as string] ?? ''} variant="outline">
                        {STATUS_LABELS[t.status as string] ?? t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </PageCard>
      </div>

      {/* 创建调优对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建参数调优任务</DialogTitle>
            <DialogDescription>配置搜索策略和参数空间</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>任务名称</Label>
              <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} placeholder="例: 影子评估器准确率优化" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>目标引擎模块</Label>
                <Select value={form.engineModule} onValueChange={(v: string) => setForm({ ...form, engineModule: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENGINE_MODULES.map((m: string) => <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>搜索策略</Label>
                <Select value={form.searchStrategy} onValueChange={(v: string) => setForm({ ...form, searchStrategy: v as 'bayesian' | 'grid' | 'random' | 'evolutionary' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bayesian">贝叶斯优化</SelectItem>
                    <SelectItem value="grid">网格搜索</SelectItem>
                    <SelectItem value="random">随机搜索</SelectItem>
                    <SelectItem value="evolutionary">进化算法</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>优化目标指标</Label>
                <Input value={form.objectiveMetric} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, objectiveMetric: e.target.value })} placeholder="accuracy" />
              </div>
              <div>
                <Label>优化方向</Label>
                <Select value={form.objectiveDirection} onValueChange={(v: string) => setForm({ ...form, objectiveDirection: v as 'maximize' | 'minimize' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maximize">最大化</SelectItem>
                    <SelectItem value="minimize">最小化</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>最大试验次数</Label>
                <Input type="number" value={form.maxTrials} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, maxTrials: parseInt(e.target.value) || 50 })} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.autoApply} onCheckedChange={(v: boolean) => setForm({ ...form, autoApply: v })} />
                <Label>自动应用最佳参数</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({
              name: form.name,
              engineModule: form.engineModule,
              searchStrategy: form.searchStrategy,
              objectiveMetric: form.objectiveMetric,
              objectiveDirection: form.objectiveDirection,
              maxTrials: form.maxTrials,
              autoApply: form.autoApply,
              searchSpace: [
                { name: 'learning_rate', type: 'float', min: 0.001, max: 0.1 },
                { name: 'batch_size', type: 'int', min: 16, max: 256 },
                { name: 'dropout', type: 'float', min: 0.0, max: 0.5 },
              ],
            })} disabled={!form.name}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Tab 3: 代码飞轮
// ============================================================================
function CodegenTab() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    name: '',
    codeType: 'feature_extractor' as 'feature_extractor' | 'detection_rule' | 'transform_pipeline' | 'aggregation' | 'custom',
    description: '',
    inputSchemaStr: '{"temperature": "number", "vibration": "number", "pressure": "number"}',
    outputSchemaStr: '{"anomalyScore": "number", "features": "Record<string, number>"}',
  });

  const codegenList = trpc.evoEvolution.selfHealing.codegen.list.useQuery(
    typeFilter !== 'all' ? { codeType: typeFilter as 'feature_extractor' | 'detection_rule' | 'transform_pipeline' | 'aggregation' | 'custom' } : undefined
  );
  const codegenStats = trpc.evoEvolution.selfHealing.codegen.stats.useQuery();
  const createMut = trpc.evoEvolution.selfHealing.codegen.create.useMutation({ onSuccess: () => { codegenList.refetch(); setShowCreate(false); } });
  const generateMut = trpc.evoEvolution.selfHealing.codegen.generate.useMutation({ onSuccess: () => { codegenList.refetch(); codegenStats.refetch(); } });
  const validateMut = trpc.evoEvolution.selfHealing.codegen.validate.useMutation({ onSuccess: () => { codegenList.refetch(); codegenStats.refetch(); } });
  const deployMut = trpc.evoEvolution.selfHealing.codegen.deploy.useMutation({ onSuccess: () => { codegenList.refetch(); codegenStats.refetch(); } });
  const deleteMut = trpc.evoEvolution.selfHealing.codegen.delete.useMutation({ onSuccess: () => { codegenList.refetch(); codegenStats.refetch(); } });

  const stats = codegenStats.data;
  const jobs = codegenList.data ?? [];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总代码任务" value={stats?.total ?? 0} icon={<Code2 className="w-4 h-4" />} compact />
        <StatCard label="已验证" value={stats?.validated ?? 0} icon={<ShieldCheck className="w-4 h-4" />} compact />
        <StatCard label="已部署" value={stats?.deployed ?? 0} icon={<Rocket className="w-4 h-4" />} compact />
        <StatCard label="失败" value={stats?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} compact />
      </div>

      {/* 飞轮流程图 */}
      <PageCard title="代码生成/验证飞轮流程">
        <div className="flex items-center justify-center gap-2 py-4">
          {['草稿', '生成中', '已生成', '验证中', '已验证', '已部署'].map((step: string, i: number) => (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${i <= 1 ? 'bg-gray-500/20 text-gray-400' : i <= 3 ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {i + 1}
                </div>
                <span className="text-xs text-muted-foreground">{step}</span>
              </div>
              {i < 5 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </React.Fragment>
          ))}
        </div>
      </PageCard>

      {/* 任务列表 + 代码预览 */}
      <div className="grid grid-cols-5 gap-4">
        <PageCard title="代码生成任务" className="col-span-3">
          <div className="flex items-center gap-3 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(CODE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建任务
            </Button>
            <Button size="sm" variant="outline" onClick={() => codegenList.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[400px]">
            {jobs.length === 0 ? <EmptyState message="暂无代码生成任务" /> : (
              <div className="space-y-2">
                {jobs.map((j: Record<string, unknown>) => (
                  <div
                    key={j.id as number}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${selectedJob?.id === j.id ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border/50 hover:border-border'}`}
                    onClick={() => setSelectedJob(j)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-purple-400" />
                        <span className="font-medium text-sm">{j.name as string}</span>
                        <Badge className={STATUS_COLORS[j.status as string] ?? ''}>{STATUS_LABELS[j.status as string] ?? j.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {j.status === 'draft' && (
                          <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); generateMut.mutate({ id: j.id as number }); }}>
                            <Zap className="w-3 h-3 mr-1" /> 生成
                          </Button>
                        )}
                        {j.status === 'generated' && (
                          <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); validateMut.mutate({ id: j.id as number }); }}>
                            <ShieldCheck className="w-3 h-3 mr-1" /> 验证
                          </Button>
                        )}
                        {j.status === 'validated' && (
                          <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deployMut.mutate({ id: j.id as number }); }}>
                            <Rocket className="w-3 h-3 mr-1" /> 部署
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteMut.mutate({ id: j.id as number }); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="outline">{CODE_TYPE_LABELS[j.codeType as string] ?? j.codeType}</Badge>
                      <span>v{j.version as number}</span>
                      <span>{formatDate(j.createdAt as string)}</span>
                      {j.validationStatus === 'passed' && <Badge className="bg-emerald-500/10 text-emerald-400 text-[10px]">验证通过</Badge>}
                      {j.deployed === 1 && <Badge className="bg-cyan-500/10 text-cyan-400 text-[10px]">已部署</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{j.description as string}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PageCard>

        {/* 代码预览 */}
        <PageCard title="代码预览" className="col-span-2">
          {!selectedJob ? <EmptyState message="选择一个任务查看代码" /> : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Code className="w-3.5 h-3.5" />
                <span>{(selectedJob.language as string) ?? 'typescript'}</span>
                {Boolean(selectedJob.signature) && <span className="text-cyan-400 truncate">{selectedJob.signature as string}</span>}
              </div>
              {selectedJob.generatedCode ? (
                <ScrollArea className="h-[300px]">
                  <pre className="p-3 rounded-lg bg-black/30 text-xs font-mono text-emerald-300 whitespace-pre-wrap overflow-x-auto">
                    {selectedJob.generatedCode as string}
                  </pre>
                </ScrollArea>
              ) : <EmptyState message="代码尚未生成" />}
              {Boolean(selectedJob.validationResult) && (
                <div className="p-3 rounded-lg bg-muted/20 space-y-1">
                  <SectionHeader title="验证结果" />
                  {(() => {
                    const vr = selectedJob.validationResult as { syntaxValid: boolean; typeCheckPassed: boolean; testsPassed: number; testsFailed: number; securityIssues: string[]; performanceMs: number };
                    return (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          {vr.syntaxValid ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                          语法检查
                        </div>
                        <div className="flex items-center gap-1">
                          {vr.typeCheckPassed ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                          类型检查
                        </div>
                        <div>测试通过: {vr.testsPassed}/{vr.testsPassed + vr.testsFailed}</div>
                        <div>性能: {vr.performanceMs}ms</div>
                        {vr.securityIssues.length > 0 && (
                          <div className="col-span-2 text-red-400">
                            安全问题: {vr.securityIssues.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </PageCard>
      </div>

      {/* 创建代码生成对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建代码生成任务</DialogTitle>
            <DialogDescription>描述需求，自动生成并验证代码</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>任务名称</Label>
              <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} placeholder="例: 温度异常特征提取器" />
            </div>
            <div>
              <Label>代码类型</Label>
              <Select value={form.codeType} onValueChange={(v: string) => setForm({ ...form, codeType: v as 'feature_extractor' | 'detection_rule' | 'transform_pipeline' | 'aggregation' | 'custom' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CODE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>功能描述</Label>
              <Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, description: e.target.value })} placeholder="描述代码需要实现的功能..." rows={3} />
            </div>
            <div>
              <Label>输入 Schema (JSON)</Label>
              <Textarea value={form.inputSchemaStr} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, inputSchemaStr: e.target.value })} rows={2} className="font-mono text-xs" />
            </div>
            <div>
              <Label>输出 Schema (JSON)</Label>
              <Textarea value={form.outputSchemaStr} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, outputSchemaStr: e.target.value })} rows={2} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => {
              let inputSchema: Record<string, string> = {};
              let outputSchema: Record<string, string> = {};
              try { inputSchema = JSON.parse(form.inputSchemaStr); } catch { /* ignore */ }
              try { outputSchema = JSON.parse(form.outputSchemaStr); } catch { /* ignore */ }
              createMut.mutate({
                name: form.name,
                codeType: form.codeType,
                description: form.description,
                inputSchema,
                outputSchema,
              });
            }} disabled={!form.name || !form.description}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Tab 4: 自愈策略
// ============================================================================
function PolicyTab() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    policyType: 'auto_rollback' as 'auto_rollback' | 'param_tuning' | 'codegen' | 'circuit_breaker',
    metricName: 'model_accuracy',
    operator: 'lt' as 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq',
    threshold: 0.85,
    durationSeconds: 600,
    engineModule: '',
    priority: 50,
    cooldownSeconds: 600,
  });

  const policyList = trpc.evoEvolution.selfHealing.policy.list.useQuery(
    typeFilter !== 'all' ? { policyType: typeFilter as 'auto_rollback' | 'param_tuning' | 'codegen' | 'circuit_breaker' } : undefined
  );
  const healingLogs = trpc.evoEvolution.selfHealing.healingLog.list.useQuery();
  const healingStats = trpc.evoEvolution.selfHealing.healingLog.stats.useQuery();
  const createMut = trpc.evoEvolution.selfHealing.policy.create.useMutation({ onSuccess: () => { policyList.refetch(); } });
  const toggleMut = trpc.evoEvolution.selfHealing.policy.toggle.useMutation({ onSuccess: () => { policyList.refetch(); } });
  const deleteMut = trpc.evoEvolution.selfHealing.policy.delete.useMutation({ onSuccess: () => { policyList.refetch(); } });
  const executeMut = trpc.evoEvolution.selfHealing.policy.execute.useMutation({ onSuccess: () => { policyList.refetch(); healingLogs.refetch(); healingStats.refetch(); } });
  const seedMut = trpc.evoEvolution.selfHealing.policy.seed.useMutation({ onSuccess: () => { policyList.refetch(); } });

  const policies = policyList.data ?? [];
  const logs = healingLogs.data ?? [];
  const hStats = healingStats.data;

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="策略总数" value={policies.length} icon={<Shield className="w-4 h-4" />} compact />
        <StatCard label="总执行次数" value={hStats?.total ?? 0} icon={<Activity className="w-4 h-4" />} compact />
        <StatCard label="成功" value={hStats?.success ?? 0} icon={<CheckCircle className="w-4 h-4" />} compact />
        <StatCard label="失败" value={hStats?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} compact />
        <StatCard label="执行中" value={hStats?.executing ?? 0} icon={<Zap className="w-4 h-4" />} compact />
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 策略列表 */}
        <PageCard title="自愈策略" className="col-span-3">
          <div className="flex items-center gap-3 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(POLICY_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建策略
            </Button>
            <Button size="sm" variant="outline" onClick={() => seedMut.mutate()}>
              <Database className="w-3.5 h-3.5 mr-1" /> 种子化默认策略
            </Button>
            <Button size="sm" variant="outline" onClick={() => policyList.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[420px]">
            {policies.length === 0 ? <EmptyState message="暂无自愈策略，点击「种子化默认策略」初始化" /> : (
              <div className="space-y-2">
                {policies.map((p: Record<string, unknown>) => (
                  <div key={p.id as number} className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={(p.enabled as number) === 1}
                          onCheckedChange={(v: boolean) => toggleMut.mutate({ id: p.id as number, enabled: v })}
                        />
                        <span className="font-medium text-sm">{p.name as string}</span>
                        <Badge className={POLICY_TYPE_COLORS[p.policyType as string] ?? ''}>
                          {POLICY_TYPE_LABELS[p.policyType as string] ?? p.policyType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => executeMut.mutate({ id: p.id as number })}>
                          <Play className="w-3 h-3 mr-1" /> 手动执行
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate({ id: p.id as number })}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {Boolean(p.description) && <p className="text-xs text-muted-foreground mb-2">{p.description as string}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {Boolean(p.engineModule) && <span>{MODULE_LABELS[p.engineModule as string] ?? (p.engineModule as string)}</span>}
                      <span>优先级: {p.priority as number}</span>
                      <span>冷却: {p.cooldownSeconds as number}s</span>
                      <span>执行: {p.totalExecutions as number}次</span>
                      {Boolean(p.lastExecutedAt) && <span>最近: {formatDate(p.lastExecutedAt as string)}</span>}
                    </div>
                    {Boolean(p.triggerCondition) && (() => {
                      const tc = p.triggerCondition as { metricName: string; operator: string; threshold: number; durationSeconds: number };
                      return (
                        <div className="mt-2 p-2 rounded bg-muted/20 text-xs">
                          <span className="text-cyan-400">{tc.metricName}</span>
                          <span className="text-muted-foreground"> {tc.operator} </span>
                          <span className="text-amber-400">{tc.threshold}</span>
                          <span className="text-muted-foreground"> (持续 {tc.durationSeconds}s)</span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PageCard>

        {/* 执行日志 */}
        <PageCard title="执行日志" className="col-span-2">
          <ScrollArea className="h-[480px]">
            {logs.length === 0 ? <EmptyState message="暂无执行日志" /> : (
              <div className="space-y-2">
                {logs.map((l: Record<string, unknown>) => (
                  <div key={l.id as number} className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[l.status as string] ?? ''} variant="outline">
                          {STATUS_LABELS[l.status as string] ?? l.status}
                        </Badge>
                        <Badge className={POLICY_TYPE_COLORS[l.policyType as string] ?? ''} variant="outline">
                          {POLICY_TYPE_LABELS[l.policyType as string] ?? l.policyType}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(l.executedAt as string)}</span>
                    </div>
                    <p className="text-xs font-medium">{l.policyName as string}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{l.triggerReason as string}</p>
                    {Boolean(l.durationMs) && <span className="text-xs text-muted-foreground">{formatDuration(l.durationMs as number)}</span>}
                    {Boolean(l.errorMessage) && <p className="text-xs text-red-400 mt-1">{l.errorMessage as string}</p>}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PageCard>
      </div>

      {/* 创建策略对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建自愈策略</DialogTitle>
            <DialogDescription>配置触发条件和执行动作</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>策略名称</Label>
              <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} placeholder="例: 模型准确率下降自动回滚" />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, description: e.target.value })} placeholder="策略描述..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>策略类型</Label>
                <Select value={form.policyType} onValueChange={(v: string) => setForm({ ...form, policyType: v as 'auto_rollback' | 'param_tuning' | 'codegen' | 'circuit_breaker' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(POLICY_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>适用引擎模块</Label>
                <Select value={form.engineModule || 'none'} onValueChange={(v: string) => setForm({ ...form, engineModule: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">全部模块</SelectItem>
                    {ENGINE_MODULES.map((m: string) => <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>触发指标</Label>
                <Input value={form.metricName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, metricName: e.target.value })} placeholder="model_accuracy" />
              </div>
              <div>
                <Label>比较运算符</Label>
                <Select value={form.operator} onValueChange={(v: string) => setForm({ ...form, operator: v as 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">大于 (&gt;)</SelectItem>
                    <SelectItem value="gte">大于等于 (&gt;=)</SelectItem>
                    <SelectItem value="lt">小于 (&lt;)</SelectItem>
                    <SelectItem value="lte">小于等于 (&lt;=)</SelectItem>
                    <SelectItem value="eq">等于 (=)</SelectItem>
                    <SelectItem value="neq">不等于 (!=)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>阈值</Label>
                <Input type="number" step="0.01" value={form.threshold} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>持续时间(秒)</Label>
                <Input type="number" value={form.durationSeconds} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, durationSeconds: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>优先级</Label>
                <Input type="number" value={form.priority} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({
              name: form.name,
              description: form.description || undefined,
              policyType: form.policyType,
              triggerCondition: {
                metricName: form.metricName,
                operator: form.operator,
                threshold: form.threshold,
                durationSeconds: form.durationSeconds,
                engineModule: form.engineModule || undefined,
              },
              action: {
                type: form.policyType === 'auto_rollback' ? 'rollback_deployment' : form.policyType === 'param_tuning' ? 'trigger_param_tuning' : form.policyType === 'codegen' ? 'trigger_codegen' : 'circuit_break',
                params: { autoExecute: true },
              },
              engineModule: form.engineModule || undefined,
              priority: form.priority,
              cooldownSeconds: form.cooldownSeconds,
            })} disabled={!form.name || !form.metricName}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 主页面
// ============================================================================
export default function EvolutionSelfHealing() {
  const [activeTab, setActiveTab] = useState('rollback');

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              自愈与自优化闭环
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              自动回滚 · 参数自调优 · 代码生成/验证飞轮 · 自愈策略引擎
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="rollback" className="flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> 自动回滚
            </TabsTrigger>
            <TabsTrigger value="tuning" className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> 参数自调优
            </TabsTrigger>
            <TabsTrigger value="codegen" className="flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" /> 代码飞轮
            </TabsTrigger>
            <TabsTrigger value="policy" className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> 自愈策略
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rollback"><RollbackTab /></TabsContent>
          <TabsContent value="tuning"><ParamTuningTab /></TabsContent>
          <TabsContent value="codegen"><CodegenTab /></TabsContent>
          <TabsContent value="policy"><PolicyTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
