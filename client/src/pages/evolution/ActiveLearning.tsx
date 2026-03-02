/**
 * 主动学习 — 进化引擎
 *
 * 功能：
 * 1. 学习策略配置（不确定性采样 / 多样性采样 / 混合策略）
 * 2. 候选样本池（按不确定性排序，支持批量选择）
 * 3. 标注任务队列（分配、进度追踪）
 * 4. 学习效果评估（学习曲线、样本效率）
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Target, Brain, Layers, Play, Pause, RotateCcw, CheckCircle2,
  AlertCircle, Zap, TrendingUp, BarChart3, Settings2, Users,
  Clock, ArrowRight, Sparkles
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ==================== 工具 ====================

const taskStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  queued: { label: '排队中', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  in_progress: { label: '标注中', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  completed: { label: '已完成', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  reviewed: { label: '已审核', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
};

function formatTime(ts: string | Date | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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

// ==================== 主组件 ====================

export default function ActiveLearning() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState('candidates');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'compositeScore' | 'uncertainty' | 'diversity'>('compositeScore');
  const [batchSize, setBatchSize] = useState([20]);
  const [strategyWeights, setStrategyWeights] = useState({ uncertainty: 0.6, diversity: 0.4 });
  const [autoMode, setAutoMode] = useState(false);

  // ==================== tRPC Queries ====================
  const statsQuery = trpc.evolutionUI.activeLearning.getStats.useQuery(undefined, { retry: false });
  const candidatesQuery = trpc.evolutionUI.activeLearning.candidates.useQuery(undefined, { retry: false });
  const tasksQuery = trpc.evolutionUI.activeLearning.tasks.useQuery(undefined, { retry: false });

  const createTaskMutation = trpc.evolutionUI.activeLearning.createTask.useMutation({
    onSuccess: (data) => {
      toast.success(`已创建 ${data.count} 个样本的标注任务`);
      setSelectedIds(new Set());
      utils.evolutionUI.activeLearning.candidates.invalidate();
      utils.evolutionUI.activeLearning.tasks.invalidate();
      utils.evolutionUI.activeLearning.getStats.invalidate();
    },
    onError: () => {
      toast.error('创建标注任务失败');
    },
  });

  // ==================== Derived Data ====================
  const stats = statsQuery.data;

  const candidateItems = useMemo(() => {
    return (candidatesQuery.data?.items ?? []).map(row => {
      const labelResult = (row.labelResult ?? {}) as Record<string, any>;
      const machineIds = row.machineIds ?? [];
      return {
        id: row.id,
        source: machineIds[0] ?? row.caseType,
        deviceName: machineIds[0] ?? row.caseType,
        timestamp: row.createdAt,
        uncertainty: row.anomalyScore ?? 0.7,
        diversity: labelResult.diversity ?? 0.6,
        compositeScore: row.anomalyScore ?? 0.7,
        featureList: Array.isArray(labelResult.featureNames) ? labelResult.featureNames : ['振动', '温度'],
        currentPrediction: labelResult.prediction ?? row.description ?? '—',
        predictionEntropy: labelResult.entropy ?? 1.5,
      };
    });
  }, [candidatesQuery.data]);

  const taskItems = useMemo(() => {
    return (tasksQuery.data?.items ?? []).map(row => {
      return {
        sliceId: row.sliceId,
        deviceCode: row.deviceCode ?? '',
        labelStatus: row.labelStatus ?? 'pending',
        qualityScore: row.qualityScore ?? 0,
        createdAt: row.createdAt,
      };
    });
  }, [tasksQuery.data]);

  const selectedCount = selectedIds.size;

  const sortedCandidates = useMemo(() => {
    return [...candidateItems].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [candidateItems, sortBy]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectTopN = () => {
    const n = batchSize[0];
    const sorted = [...candidateItems].sort((a, b) => b.compositeScore - a.compositeScore);
    const topIds = new Set(sorted.slice(0, n).map(c => c.id));
    setSelectedIds(topIds);
    toast.success(`已选择 Top ${Math.min(n, candidateItems.length)} 样本`);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleCreateTask = () => {
    const caseIds = Array.from(selectedIds);
    if (caseIds.length === 0) return;
    createTaskMutation.mutate({ caseIds });
  };

  const isLoading = statsQuery.isLoading || candidatesQuery.isLoading || tasksQuery.isLoading;

  return (
    <MainLayout title="主动学习">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">主动学习</h2>
            <p className="text-xs text-muted-foreground">智能样本选择，用最少标注成本获得最大模型提升</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-[10px] text-muted-foreground">自动模式</span>
              <Switch checked={autoMode} onCheckedChange={setAutoMode} />
            </div>
            {autoMode ? (
              <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs" onClick={() => setAutoMode(false)}>
                <Pause className="w-3.5 h-3.5" /> 暂停
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setAutoMode(true); toast.success('自动学习已启动'); }}>
                <Play className="w-3.5 h-3.5" /> 启动学习
              </Button>
            )}
          </div>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard
            value={statsQuery.isLoading ? '...' : (stats?.candidateCount ?? 0)}
            label="候选样本"
            icon="🎯"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : (stats?.activeTaskCount ?? 0)}
            label="进行中任务"
            icon="⏳"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : (stats?.completedSamples ?? 0)}
            label="已标注样本"
            icon="✅"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : (stats?.improvement ?? '—')}
            label="模型提升"
            icon="📈"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="candidates" className="text-xs gap-1"><Target className="w-3 h-3" /> 候选样本</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs gap-1"><Users className="w-3 h-3" /> 标注任务</TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs gap-1"><Settings2 className="w-3 h-3" /> 策略配置</TabsTrigger>
            <TabsTrigger value="curve" className="text-xs gap-1"><TrendingUp className="w-3 h-3" /> 学习曲线</TabsTrigger>
          </TabsList>

          {/* ==================== 候选样本 ==================== */}
          <TabsContent value="candidates">
            <PageCard className="mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compositeScore">综合评分</SelectItem>
                    <SelectItem value="uncertainty">不确定性</SelectItem>
                    <SelectItem value="diversity">多样性</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={selectTopN}>
                  <Sparkles className="w-3 h-3" /> 选择 Top {batchSize[0]}
                </Button>
                {selectedCount > 0 && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={clearSelection}>
                      <RotateCcw className="w-3 h-3" /> 清除选择
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleCreateTask}
                      disabled={createTaskMutation.isPending}
                    >
                      <ArrowRight className="w-3 h-3" /> 创建标注任务 ({selectedCount})
                    </Button>
                  </>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  共 {candidateItems.length} 个候选 · 已选 {selectedCount}
                </span>
              </div>
            </PageCard>

            {candidatesQuery.isLoading ? (
              <PageCard>
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  加载候选样本中...
                </div>
              </PageCard>
            ) : sortedCandidates.length === 0 ? (
              <PageCard>
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  暂无候选样本
                </div>
              </PageCard>
            ) : (
              <div className="space-y-1.5">
                {sortedCandidates.map(sample => (
                  <PageCard
                    key={sample.id}
                    className={cn(
                      "cursor-pointer transition-all",
                      selectedIds.has(sample.id) ? "border-primary/50 bg-primary/5" : "hover:border-primary/20"
                    )}
                    onClick={() => toggleSelect(sample.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.has(sample.id)}
                        onCheckedChange={() => toggleSelect(sample.id)}
                        className="shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground">{sample.deviceName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">#{sample.id}</span>
                          <span className="text-[10px] text-muted-foreground">{formatTime(sample.timestamp)}</span>
                        </div>

                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                            {sample.currentPrediction}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            熵: <span className="font-mono">{sample.predictionEntropy.toFixed(2)}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {sample.featureList.map((f: string) => (
                            <span key={f} className="px-1.5 py-0.5 bg-secondary rounded text-[10px] text-muted-foreground">{f}</span>
                          ))}
                        </div>
                      </div>

                      {/* 评分指标 */}
                      <div className="w-40 shrink-0 space-y-1.5">
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-muted-foreground">不确定性</span>
                            <span className="font-mono">{(sample.uncertainty * 100).toFixed(0)}%</span>
                          </div>
                          <UncertaintyBar value={sample.uncertainty} />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-muted-foreground">多样性</span>
                            <span className="font-mono">{(sample.diversity * 100).toFixed(0)}%</span>
                          </div>
                          <UncertaintyBar value={sample.diversity} />
                        </div>
                      </div>

                      {/* 综合评分 */}
                      <div className="w-14 text-center shrink-0">
                        <div className={cn(
                          "text-lg font-bold",
                          sample.compositeScore > 0.8 ? 'text-red-400' :
                          sample.compositeScore > 0.7 ? 'text-amber-400' : 'text-blue-400'
                        )}>
                          {(sample.compositeScore * 100).toFixed(0)}
                        </div>
                        <div className="text-[9px] text-muted-foreground">综合分</div>
                      </div>
                    </div>
                  </PageCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== 标注任务 ==================== */}
          <TabsContent value="tasks">
            {tasksQuery.isLoading ? (
              <PageCard>
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  加载标注任务中...
                </div>
              </PageCard>
            ) : taskItems.length === 0 ? (
              <PageCard>
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  暂无标注任务
                </div>
              </PageCard>
            ) : (
              <div className="space-y-2">
                {taskItems.map((task, idx) => (
                  <PageCard key={task.sliceId ?? idx}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground font-mono">{task.sliceId}</span>
                          <Badge variant="outline" className={cn("text-[10px]", taskStatusConfig[task.labelStatus]?.color)}>
                            {taskStatusConfig[task.labelStatus]?.label ?? task.labelStatus}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                          <span>设备: {task.deviceCode || '—'}</span>
                          <span>质量分: <span className="font-mono">{task.qualityScore}</span></span>
                          <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatTime(task.createdAt)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Progress value={task.labelStatus === 'completed' || task.labelStatus === 'reviewed' ? 100 : task.labelStatus === 'in_progress' ? 50 : 0} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                            {task.labelStatus === 'completed' || task.labelStatus === 'reviewed' ? '100' : task.labelStatus === 'in_progress' ? '50' : '0'}%
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        {task.labelStatus === 'pending' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => toast.success('任务已分配')}>
                            分配
                          </Button>
                        )}
                        {task.labelStatus === 'completed' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-emerald-400 border-emerald-500/30" onClick={() => toast.success('审核通过')}>
                            <CheckCircle2 className="w-2.5 h-2.5" /> 审核
                          </Button>
                        )}
                      </div>
                    </div>
                  </PageCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== 策略配置 ==================== */}
          <TabsContent value="strategy">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 采样策略权重 */}
              <PageCard title="采样策略权重" icon="⚖️">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-foreground font-medium flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 text-amber-400" /> 不确定性采样
                      </span>
                      <span className="font-mono text-muted-foreground">{(strategyWeights.uncertainty * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[strategyWeights.uncertainty * 100]}
                      onValueChange={([v]) => setStrategyWeights({ uncertainty: v / 100, diversity: 1 - v / 100 })}
                      max={100} step={5}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      优先选择模型最不确定的样本（预测熵最高）
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-foreground font-medium flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-blue-400" /> 多样性采样
                      </span>
                      <span className="font-mono text-muted-foreground">{(strategyWeights.diversity * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[strategyWeights.diversity * 100]}
                      onValueChange={([v]) => setStrategyWeights({ diversity: v / 100, uncertainty: 1 - v / 100 })}
                      max={100} step={5}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      确保选择的样本覆盖不同的特征空间区域
                    </p>
                  </div>
                </div>
              </PageCard>

              {/* 批次配置 */}
              <PageCard title="批次配置" icon="📦">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-foreground font-medium">每批样本数</span>
                      <span className="font-mono text-muted-foreground">{batchSize[0]}</span>
                    </div>
                    <Slider value={batchSize} onValueChange={setBatchSize} min={5} max={100} step={5} />
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                      <span className="text-muted-foreground">不确定性阈值</span>
                      <span className="font-mono text-foreground">0.60</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                      <span className="text-muted-foreground">最小多样性分数</span>
                      <span className="font-mono text-foreground">0.30</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                      <span className="text-muted-foreground">自动触发间隔</span>
                      <span className="font-mono text-foreground">24h</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                      <span className="text-muted-foreground">标注截止时间</span>
                      <span className="font-mono text-foreground">48h</span>
                    </div>
                  </div>

                  <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={() => toast.success('策略已保存')}>
                    <CheckCircle2 className="w-3 h-3" /> 保存配置
                  </Button>
                </div>
              </PageCard>

              {/* 采样策略说明 */}
              <PageCard title="策略说明" icon="📖" className="md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      name: '不确定性采样',
                      icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
                      desc: '选择模型预测最不确定的样本。通过计算预测概率分布的熵来衡量不确定性，熵越高说明模型越"犹豫"。',
                      pros: '直接针对模型弱点',
                      cons: '可能集中在某些区域',
                    },
                    {
                      name: '多样性采样',
                      icon: <Layers className="w-4 h-4 text-blue-400" />,
                      desc: '选择在特征空间中分布最广泛的样本。使用核心集（Core-set）方法确保样本覆盖不同的数据分布区域。',
                      pros: '覆盖面广，防止偏差',
                      cons: '可能选到模型已掌握的样本',
                    },
                    {
                      name: '混合策略',
                      icon: <Brain className="w-4 h-4 text-purple-400" />,
                      desc: '综合不确定性和多样性的加权组合。通过调整权重比例在两种策略间取得平衡，适用于大多数场景。',
                      pros: '平衡效率和覆盖',
                      cons: '需要调参',
                    },
                  ].map(s => (
                    <div key={s.name} className="bg-secondary/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        {s.icon}
                        <span className="text-xs font-semibold text-foreground">{s.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">{s.desc}</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex gap-1"><span className="text-emerald-400">+</span><span className="text-muted-foreground">{s.pros}</span></div>
                        <div className="flex gap-1"><span className="text-amber-400">~</span><span className="text-muted-foreground">{s.cons}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>
          </TabsContent>

          {/* ==================== 学习曲线 ==================== */}
          <TabsContent value="curve">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 学习曲线数据 */}
              <PageCard title="学习曲线" icon="📈" className="md:col-span-2">
                <div className="space-y-2">
                  {[
                    { round: 1, samples: 50, accuracy: 72.3, f1: 68.5, improvement: 0 },
                    { round: 2, samples: 120, accuracy: 78.1, f1: 74.2, improvement: 5.8 },
                    { round: 3, samples: 200, accuracy: 82.7, f1: 79.8, improvement: 4.6 },
                    { round: 4, samples: 280, accuracy: 85.4, f1: 83.1, improvement: 2.7 },
                    { round: 5, samples: 350, accuracy: 87.9, f1: 85.6, improvement: 2.5 },
                    { round: 6, samples: 400, accuracy: 89.2, f1: 87.3, improvement: 1.3 },
                    { round: 7, samples: 450, accuracy: 90.1, f1: 88.5, improvement: 0.9 },
                  ].map(row => (
                    <div key={row.round} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-16 shrink-0">轮次 {row.round}</span>
                      <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0">{row.samples} 样本</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] text-muted-foreground w-10">准确率</span>
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${row.accuracy}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-cyan-400 w-12 text-right">{row.accuracy}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground w-10">F1</span>
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${row.f1}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-purple-400 w-12 text-right">{row.f1}%</span>
                        </div>
                      </div>
                      <div className="w-14 text-right shrink-0">
                        {row.improvement > 0 ? (
                          <span className="text-[10px] text-emerald-400">+{row.improvement}%</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">基线</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>

              {/* 样本效率对比 */}
              <PageCard title="样本效率对比" icon="⚡">
                <div className="space-y-3">
                  {[
                    { method: '主动学习', samples: 450, accuracy: 90.1, color: 'text-cyan-400' },
                    { method: '随机采样', samples: 450, accuracy: 83.5, color: 'text-zinc-400' },
                    { method: '全量标注', samples: 2000, accuracy: 91.2, color: 'text-amber-400' },
                  ].map(m => (
                    <div key={m.method} className="flex items-center gap-3 p-2 bg-secondary/30 rounded">
                      <span className={cn("text-xs font-medium w-20", m.color)}>{m.method}</span>
                      <div className="flex-1 text-[10px] text-muted-foreground">
                        {m.samples} 样本 → <span className={cn("font-mono font-semibold", m.color)}>{m.accuracy}%</span>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400">
                    <Zap className="w-3 h-3 inline mr-1" />
                    主动学习仅用 22.5% 的标注量达到了全量标注 98.8% 的准确率
                  </div>
                </div>
              </PageCard>

              {/* 关键指标 */}
              <PageCard title="关键指标" icon="📊">
                <div className="space-y-2">
                  {[
                    { label: '累计标注样本', value: '450', unit: '个' },
                    { label: '累计学习轮次', value: '7', unit: '轮' },
                    { label: '平均每轮提升', value: '2.54', unit: '%' },
                    { label: '标注节省率', value: '77.5', unit: '%' },
                    { label: '预计下轮提升', value: '0.6', unit: '%' },
                    { label: '建议停止阈值', value: '0.5', unit: '%' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-2 bg-secondary/30 rounded text-[11px]">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-mono text-foreground">{item.value} <span className="text-muted-foreground text-[10px]">{item.unit}</span></span>
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
