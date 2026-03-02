/**
 * 自动训练 — 进化引擎
 *
 * 功能：
 * 1. 训练任务管理（创建/监控/终止训练任务）
 * 2. 训练流水线可视化（数据准备 → 特征工程 → 模型训练 → 评估 → 部署）
 * 3. 超参数配置（AutoML / 手动配置）
 * 4. 训练日志和指标实时展示
 * 5. 模型版本对比
 *
 * 数据源: trpc.evoEvolution.dojo.* 端点
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Zap, Play, Square, RotateCcw, CheckCircle2, XCircle,
  Clock, Cpu, Settings2, GitBranch,
  ArrowRight, Loader2, AlertTriangle, Rocket, FileText,
  ChevronRight, BarChart3
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ==================== 类型（从DB映射到UI的辅助类型） ====================

/** DB status -> UI status 映射 */
const dbStatusToUi: Record<string, string> = {
  pending: 'queued',
  scheduled: 'preparing',
  running: 'training',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** UI filter status -> DB status 映射 */
const uiStatusToDb: Record<string, string> = {
  queued: 'pending',
  preparing: 'scheduled',
  training: 'running',
  evaluating: 'running', // evaluating is a sub-state of running
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

// ==================== 工具 ====================

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: '排队中', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', icon: <Clock className="w-3 h-3" /> },
  preparing: { label: '准备中', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <Settings2 className="w-3 h-3" /> },
  training: { label: '训练中', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  evaluating: { label: '评估中', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: <BarChart3 className="w-3 h-3" /> },
  completed: { label: '已完成', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: '失败', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  cancelled: { label: '已取消', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', icon: <Square className="w-3 h-3" /> },
};

const pipelineStages = [
  { id: 'data', label: '数据准备', icon: '\u{1F4E6}' },
  { id: 'feature', label: '特征工程', icon: '\u{2699}\u{FE0F}' },
  { id: 'train', label: '模型训练', icon: '\u{1F9E0}' },
  { id: 'eval', label: '模型评估', icon: '\u{1F4CA}' },
  { id: 'deploy', label: '模型部署', icon: '\u{1F680}' },
];

/** Map a DB job status to a pipeline stage index */
function getStageIndexFromStatus(status: string | null): number {
  switch (status) {
    case 'pending': return -1;
    case 'scheduled': return 0;
    case 'running': return 2;
    case 'completed': return 4;
    case 'failed': return 2;
    case 'cancelled': return -1;
    default: return -1;
  }
}

/** Map DB status to UI display status string */
function mapDbStatusToUi(dbStatus: string | null): string {
  return dbStatusToUi[dbStatus ?? 'pending'] ?? dbStatus ?? 'queued';
}

function formatTime(ts: Date | string | null): string {
  if (!ts) return '--';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '--';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Safely extract a numeric value from a config/result JSON object */
function safeNum(obj: Record<string, unknown> | null, key: string): number | undefined {
  if (!obj || obj[key] === undefined || obj[key] === null) return undefined;
  const v = Number(obj[key]);
  return isNaN(v) ? undefined : v;
}

/** Safely extract a string value from a config/result JSON object */
function safeStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj || obj[key] === undefined || obj[key] === null) return '--';
  return String(obj[key]);
}

// ==================== 主组件 ====================

export default function AutoTrain() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState('jobs');
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // ---- New job form state ----
  const [newJobName, setNewJobName] = useState('');
  const [newJobModelId, setNewJobModelId] = useState('bearing-fault-v3.2');
  const [newJobLr, setNewJobLr] = useState('0.001');
  const [newJobBatchSize, setNewJobBatchSize] = useState('64');
  const [newJobEpochs, setNewJobEpochs] = useState('100');
  const [newJobOptimizer, setNewJobOptimizer] = useState('adamw');
  const [newJobAugmentation, setNewJobAugmentation] = useState(true);
  const [newJobAutoML, setNewJobAutoML] = useState(false);
  const [newJobGpuCount, setNewJobGpuCount] = useState(1);
  const [newJobUseSpot, setNewJobUseSpot] = useState(false);

  // ---- tRPC queries ----
  const dbFilterStatus = filterStatus === 'all'
    ? undefined
    : (uiStatusToDb[filterStatus] ?? filterStatus) as 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

  const jobsQuery = trpc.evoEvolution.dojo.list.useQuery(
    { status: dbFilterStatus, limit: 50 },
    { refetchInterval: 10000 }
  );

  const statsQuery = trpc.evoEvolution.dojo.getStats.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const selectedJobQuery = trpc.evoEvolution.dojo.get.useQuery(
    { id: selectedJobId! },
    { enabled: selectedJobId !== null }
  );

  // ---- tRPC mutations ----
  const createJob = trpc.evoEvolution.dojo.create.useMutation({
    onSuccess: (data) => {
      toast.success(`训练任务已创建 (ID: ${data.jobId})`);
      setShowNewDialog(false);
      resetNewJobForm();
      utils.evoEvolution.dojo.list.invalidate();
      utils.evoEvolution.dojo.getStats.invalidate();
    },
    onError: (err) => toast.error(`创建失败: ${err.message}`),
  });

  const cancelJob = trpc.evoEvolution.dojo.cancel.useMutation({
    onSuccess: () => {
      toast.warning('训练已终止');
      utils.evoEvolution.dojo.list.invalidate();
      utils.evoEvolution.dojo.getStats.invalidate();
    },
    onError: (err) => toast.error(`终止失败: ${err.message}`),
  });

  function resetNewJobForm() {
    setNewJobName('');
    setNewJobModelId('bearing-fault-v3.2');
    setNewJobLr('0.001');
    setNewJobBatchSize('64');
    setNewJobEpochs('100');
    setNewJobOptimizer('adamw');
    setNewJobAugmentation(true);
    setNewJobAutoML(false);
    setNewJobGpuCount(1);
    setNewJobUseSpot(false);
  }

  function handleCreateJob() {
    if (!newJobName.trim()) {
      toast.error('请输入任务名称');
      return;
    }
    createJob.mutate({
      name: newJobName.trim(),
      modelId: newJobModelId,
      priority: 5,
      gpuCount: newJobGpuCount,
      useSpot: newJobUseSpot,
      config: {
        learningRate: parseFloat(newJobLr) || 0.001,
        batchSize: parseInt(newJobBatchSize) || 64,
        epochs: parseInt(newJobEpochs) || 100,
        optimizer: newJobOptimizer,
        augmentation: newJobAugmentation,
        autoML: newJobAutoML,
      },
    });
  }

  function handleCancelJob(jobId: number, e: React.MouseEvent) {
    e.stopPropagation();
    cancelJob.mutate({ id: jobId });
  }

  // ---- Derived data ----
  const jobs = jobsQuery.data?.jobs ?? [];
  const stats = statsQuery.data;

  const isLoading = jobsQuery.isLoading;

  // Find the selected job from the list (for the dialog)
  const selectedJob = selectedJobQuery.data?.job ?? null;

  return (
    <MainLayout title="自动训练">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">⚡ 自动训练</h2>
            <p className="text-xs text-muted-foreground">自动化模型训练流程，从数据准备到模型部署</p>
          </div>
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowNewDialog(true)}>
            <Zap className="w-3.5 h-3.5" /> 新建训练
          </Button>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard value={stats ? (stats.running + stats.pending) : '--'} label="进行中" icon="🔄" />
          <StatCard value={stats?.completed ?? '--'} label="已完成" icon="✅" />
          <StatCard value={stats?.failed ?? '--'} label="失败" icon="❌" />
          <StatCard value={stats ? `${stats.totalGpuHours.toFixed(1)}h` : '--'} label="GPU 总时长" icon="🏆" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="jobs" className="text-xs gap-1"><Cpu className="w-3 h-3" /> 训练任务</TabsTrigger>
            <TabsTrigger value="compare" className="text-xs gap-1"><GitBranch className="w-3 h-3" /> 版本对比</TabsTrigger>
            <TabsTrigger value="automl" className="text-xs gap-1"><Settings2 className="w-3 h-3" /> AutoML</TabsTrigger>
          </TabsList>

          {/* ==================== 训练任务 ==================== */}
          <TabsContent value="jobs">
            <PageCard className="mb-3">
              <div className="flex items-center gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  共 {jobsQuery.data?.total ?? jobs.length} 个任务
                </span>
              </div>
            </PageCard>

            {isLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">暂无训练任务</div>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => {
                  const uiStatus = mapDbStatusToUi(job.status);
                  const stageIdx = getStageIndexFromStatus(job.status);
                  const config = job.config as Record<string, unknown> | null;
                  const result = job.result as Record<string, unknown> | null;
                  const metrics = {
                    trainLoss: safeNum(result, 'trainLoss'),
                    valLoss: safeNum(result, 'valLoss'),
                    accuracy: safeNum(result, 'accuracy'),
                    f1: safeNum(result, 'f1'),
                    precision: safeNum(result, 'precision'),
                    recall: safeNum(result, 'recall'),
                  };
                  // Progress: completed=100, failed uses retry logic, otherwise estimate from config
                  const progress = job.status === 'completed' ? 100
                    : job.status === 'failed' ? safeNum(result, 'progress') ?? 0
                    : job.status === 'cancelled' ? 0
                    : safeNum(result, 'progress') ?? (job.status === 'running' ? 50 : 0);
                  // Epoch info from result JSON
                  const epochCurrent = safeNum(result, 'epochCurrent') ?? safeNum(result, 'epoch') ?? 0;
                  const epochTotal = safeNum(config, 'epochs') ?? 0;
                  // Duration
                  const duration = job.startedAt && job.completedAt
                    ? formatDuration(new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime())
                    : job.startedAt
                      ? formatDuration(Date.now() - new Date(job.startedAt).getTime())
                      : '--';
                  const estimatedRemaining = job.estimatedDurationMs && job.startedAt
                    ? formatDuration(Math.max(0, job.estimatedDurationMs - (Date.now() - new Date(job.startedAt).getTime())))
                    : '--';

                  return (
                    <PageCard
                      key={job.id}
                      className="cursor-pointer hover:border-primary/30 transition-all"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className="space-y-3">
                        {/* 头部 */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-foreground">{job.name}</span>
                              <Badge variant="outline" className={cn("text-[10px] gap-0.5", statusConfig[uiStatus]?.color)}>
                                {statusConfig[uiStatus]?.icon}
                                {statusConfig[uiStatus]?.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>模型: {job.modelId}</span>
                              <span>优先级: {job.priority ?? '--'}</span>
                              <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatTime(job.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {(job.status === 'running' || job.status === 'scheduled') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 text-red-400 border-red-500/30"
                                disabled={cancelJob.isPending}
                                onClick={(e) => handleCancelJob(job.id, e)}
                              >
                                <Square className="w-2.5 h-2.5" /> 终止
                              </Button>
                            )}
                            {job.status === 'completed' && (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-emerald-400 border-emerald-500/30" onClick={(e) => { e.stopPropagation(); toast.success('模型已部署'); }}>
                                <Rocket className="w-2.5 h-2.5" /> 部署
                              </Button>
                            )}
                            {job.status === 'failed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  createJob.mutate({
                                    name: job.name + ' (重试)',
                                    modelId: job.modelId,
                                    priority: job.priority ?? undefined,
                                    gpuCount: job.gpuCount ?? undefined,
                                    useSpot: job.useSpot ? true : false,
                                    config: config ?? undefined,
                                  });
                                }}
                              >
                                <RotateCcw className="w-2.5 h-2.5" /> 重试
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* 流水线进度 */}
                        <div className="flex items-center gap-1">
                          {pipelineStages.map((stage, i) => (
                            <div key={stage.id} className="flex items-center flex-1">
                              <div className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-[10px] flex-1 justify-center transition-all",
                                i < stageIdx ? 'bg-emerald-500/15 text-emerald-400' :
                                i === stageIdx ? (job.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-cyan-500/15 text-cyan-400') :
                                'bg-secondary/50 text-muted-foreground'
                              )}>
                                <span>{stage.icon}</span>
                                <span className="hidden md:inline">{stage.label}</span>
                              </div>
                              {i < pipelineStages.length - 1 && (
                                <ChevronRight className={cn(
                                  "w-3 h-3 shrink-0 mx-0.5",
                                  i < stageIdx ? 'text-emerald-500' : 'text-muted-foreground/30'
                                )} />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* 进度条 + 指标 */}
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Progress value={progress} className="h-1.5 flex-1" />
                              <span className="text-[10px] font-mono text-muted-foreground">{progress}%</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              {epochTotal > 0 && <span>Epoch {epochCurrent}/{epochTotal}</span>}
                              <span>⏱ {duration}</span>
                              {estimatedRemaining !== '--' && (
                                <span>剩余 {estimatedRemaining}</span>
                              )}
                            </div>
                          </div>

                          {/* 关键指标 */}
                          {(metrics.accuracy !== undefined || metrics.trainLoss !== undefined) && (
                            <div className="flex gap-3 shrink-0 text-[10px]">
                              {metrics.accuracy !== undefined && (
                                <div className="text-center">
                                  <div className="text-emerald-400 font-mono font-semibold">{metrics.accuracy}%</div>
                                  <div className="text-muted-foreground">准确率</div>
                                </div>
                              )}
                              {metrics.f1 !== undefined && (
                                <div className="text-center">
                                  <div className="text-cyan-400 font-mono font-semibold">{metrics.f1}%</div>
                                  <div className="text-muted-foreground">F1</div>
                                </div>
                              )}
                              {metrics.trainLoss !== undefined && (
                                <div className="text-center">
                                  <div className={cn("font-mono font-semibold", metrics.trainLoss > 1 ? 'text-red-400' : 'text-blue-400')}>
                                    {metrics.trainLoss.toFixed(4)}
                                  </div>
                                  <div className="text-muted-foreground">Loss</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </PageCard>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ==================== 版本对比 ==================== */}
          <TabsContent value="compare">
            <PageCard title="模型版本对比" icon="📊">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">模型</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">版本</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">准确率</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">F1</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">精确率</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">召回率</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">数据量</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">训练时间</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { model: '轴承故障分类器', ver: 'v3.2', acc: 88.5, f1: 86.2, prec: 87.1, rec: 85.3, data: '4,000', time: '1h 50m', status: 'deployed', isCurrent: true },
                      { model: '轴承故障分类器', ver: 'v3.3', acc: 91.2, f1: 89.5, prec: 90.1, rec: 88.9, data: '4,500', time: '2h 15m*', status: 'training', isCurrent: false },
                      { model: '异常检测模型', ver: 'v4.1', acc: 91.5, f1: 89.8, prec: 91.2, rec: 88.5, data: '7,800', time: '3h 45m', status: 'deployed', isCurrent: true },
                      { model: '异常检测模型', ver: 'v4.2', acc: 93.8, f1: 92.1, prec: 93.5, rec: 90.8, data: '8,200', time: '4h 30m', status: 'evaluating', isCurrent: false },
                      { model: '齿轮箱诊断', ver: 'v2.5', acc: 92.1, f1: 90.5, prec: 91.8, rec: 89.3, data: '2,800', time: '1h 20m', status: 'deployed', isCurrent: true },
                      { model: '齿轮箱诊断', ver: 'v2.6', acc: 94.5, f1: 93.2, prec: 94.8, rec: 91.7, data: '3,200', time: '1h 45m', status: 'ready', isCurrent: false },
                    ].map((row, i) => (
                      <tr key={i} className={cn("border-b border-border/50 hover:bg-secondary/30", row.isCurrent && "bg-primary/5")}>
                        <td className="py-2 px-2 text-foreground">{row.model}</td>
                        <td className="py-2 px-2 font-mono">
                          {row.ver}
                          {row.isCurrent && <Badge variant="outline" className="ml-1 text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">当前</Badge>}
                        </td>
                        <td className="text-center py-2 px-2 font-mono text-emerald-400">{row.acc}%</td>
                        <td className="text-center py-2 px-2 font-mono text-cyan-400">{row.f1}%</td>
                        <td className="text-center py-2 px-2 font-mono text-blue-400">{row.prec}%</td>
                        <td className="text-center py-2 px-2 font-mono text-purple-400">{row.rec}%</td>
                        <td className="text-center py-2 px-2 font-mono text-muted-foreground">{row.data}</td>
                        <td className="text-center py-2 px-2 font-mono text-muted-foreground">{row.time}</td>
                        <td className="text-center py-2 px-2">
                          <Badge variant="outline" className={cn("text-[10px]",
                            row.status === 'deployed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                            row.status === 'ready' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
                            row.status === 'training' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                            'bg-purple-500/15 text-purple-400 border-purple-500/30'
                          )}>
                            {row.status === 'deployed' ? '已部署' : row.status === 'ready' ? '待部署' : row.status === 'training' ? '训练中' : '评估中'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PageCard>

            {/* 版本提升趋势 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {[
                { model: '轴承故障分类器', from: 'v3.2', to: 'v3.3', accDelta: '+2.7%', f1Delta: '+3.3%', trigger: '主动学习' },
                { model: '异常检测模型', from: 'v4.1', to: 'v4.2', accDelta: '+2.3%', f1Delta: '+2.3%', trigger: '漏检修复' },
                { model: '齿轮箱诊断', from: 'v2.5', to: 'v2.6', accDelta: '+2.4%', f1Delta: '+2.7%', trigger: '标签修正' },
              ].map(item => (
                <PageCard key={item.model}>
                  <div className="text-xs font-semibold text-foreground mb-2">{item.model}</div>
                  <div className="flex items-center gap-2 mb-2 text-[11px]">
                    <span className="font-mono text-muted-foreground">{item.from}</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <span className="font-mono text-foreground font-semibold">{item.to}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] mb-2">
                    <span className="text-emerald-400">准确率 {item.accDelta}</span>
                    <span className="text-cyan-400">F1 {item.f1Delta}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">触发: {item.trigger}</div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          {/* ==================== AutoML ==================== */}
          <TabsContent value="automl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PageCard title="AutoML 配置" icon="🤖">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-foreground font-medium">搜索空间</span>
                    </div>
                    {[
                      { param: '学习率', range: '1e-5 ~ 1e-2', type: 'log-uniform' },
                      { param: '批大小', range: '16, 32, 64, 128', type: 'categorical' },
                      { param: '优化器', range: 'Adam, AdamW, SGD', type: 'categorical' },
                      { param: '调度器', range: 'Cosine, OneCycle, ReduceLR', type: 'categorical' },
                      { param: 'Dropout', range: '0.0 ~ 0.5', type: 'uniform' },
                      { param: '隐藏层维度', range: '64, 128, 256, 512', type: 'categorical' },
                    ].map(item => (
                      <div key={item.param} className="flex items-center justify-between p-2 bg-secondary/30 rounded text-[11px]">
                        <span className="text-foreground">{item.param}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">{item.range}</span>
                          <Badge variant="outline" className="text-[9px] bg-secondary text-muted-foreground">{item.type}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-secondary/30 rounded text-[11px]">
                    <span className="text-foreground">搜索策略</span>
                    <span className="font-mono text-cyan-400">Bayesian (TPE)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-secondary/30 rounded text-[11px]">
                    <span className="text-foreground">最大试验数</span>
                    <span className="font-mono text-foreground">50</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-secondary/30 rounded text-[11px]">
                    <span className="text-foreground">早停耐心</span>
                    <span className="font-mono text-foreground">10 epochs</span>
                  </div>

                  <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={() => toast.success('AutoML 搜索已启动')}>
                    <Zap className="w-3 h-3" /> 启动搜索
                  </Button>
                </div>
              </PageCard>

              <PageCard title="历史搜索结果" icon="📋">
                <div className="space-y-2">
                  {[
                    { trial: 1, lr: '5e-4', batch: 32, opt: 'AdamW', acc: 93.8, f1: 92.1, status: 'best' },
                    { trial: 2, lr: '1e-3', batch: 64, opt: 'Adam', acc: 92.5, f1: 90.8, status: 'good' },
                    { trial: 3, lr: '1e-3', batch: 48, opt: 'AdamW', acc: 91.2, f1: 89.5, status: 'good' },
                    { trial: 4, lr: '1e-2', batch: 128, opt: 'SGD', acc: 78.3, f1: 74.2, status: 'poor' },
                    { trial: 5, lr: '5e-5', batch: 16, opt: 'Adam', acc: 89.7, f1: 87.3, status: 'good' },
                  ].map(t => (
                    <div key={t.trial} className={cn(
                      "flex items-center gap-3 p-2 rounded text-[11px]",
                      t.status === 'best' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-secondary/30'
                    )}>
                      <span className="text-muted-foreground w-8">#{t.trial}</span>
                      <span className="font-mono text-muted-foreground w-12">lr={t.lr}</span>
                      <span className="font-mono text-muted-foreground w-12">bs={t.batch}</span>
                      <span className="text-muted-foreground w-14">{t.opt}</span>
                      <span className="font-mono text-emerald-400 w-14 text-right">{t.acc}%</span>
                      <span className="font-mono text-cyan-400 w-14 text-right">{t.f1}%</span>
                      {t.status === 'best' && <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ml-auto">最佳</Badge>}
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* 任务详情弹窗 */}
        <Dialog open={selectedJobId !== null} onOpenChange={() => setSelectedJobId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> 训练详情
              </DialogTitle>
            </DialogHeader>
            {selectedJobQuery.isLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
            ) : selectedJob ? (() => {
              const uiStatus = mapDbStatusToUi(selectedJob.status);
              const config = selectedJob.config as Record<string, unknown> | null;
              const result = selectedJob.result as Record<string, unknown> | null;
              const metrics = {
                trainLoss: safeNum(result, 'trainLoss'),
                valLoss: safeNum(result, 'valLoss'),
                accuracy: safeNum(result, 'accuracy'),
                f1: safeNum(result, 'f1'),
                precision: safeNum(result, 'precision'),
                recall: safeNum(result, 'recall'),
              };
              const duration = selectedJob.startedAt && selectedJob.completedAt
                ? formatDuration(new Date(selectedJob.completedAt).getTime() - new Date(selectedJob.startedAt).getTime())
                : selectedJob.startedAt
                  ? formatDuration(Date.now() - new Date(selectedJob.startedAt).getTime())
                  : '--';
              const estimatedRemaining = selectedJob.estimatedDurationMs && selectedJob.startedAt
                ? formatDuration(Math.max(0, selectedJob.estimatedDurationMs - (Date.now() - new Date(selectedJob.startedAt).getTime())))
                : '--';
              const hasMetrics = Object.values(metrics).some(v => v !== undefined);

              return (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{selectedJob.name}</span>
                    <Badge variant="outline" className={cn("text-[10px] gap-0.5", statusConfig[uiStatus]?.color)}>
                      {statusConfig[uiStatus]?.icon}
                      {statusConfig[uiStatus]?.label}
                    </Badge>
                  </div>

                  {/* 基本信息 */}
                  <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                    <div className="text-xs font-semibold mb-2">基本信息</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="flex justify-between"><span className="text-muted-foreground">任务ID</span><span className="font-mono">{selectedJob.jobId}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">模型ID</span><span className="font-mono">{selectedJob.modelId}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">优先级</span><span className="font-mono">{selectedJob.priority ?? '--'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">GPU</span><span className="font-mono">{selectedJob.gpuCount ?? '--'} 卡</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">竞价实例</span><span>{selectedJob.useSpot ? '是' : '否'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">重试次数</span><span className="font-mono">{selectedJob.retryCount ?? 0}</span></div>
                    </div>
                  </div>

                  {/* 训练配置 */}
                  {config && Object.keys(config).length > 0 && (
                    <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                      <div className="text-xs font-semibold mb-2">训练配置</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex justify-between"><span className="text-muted-foreground">学习率</span><span className="font-mono">{safeStr(config, 'learningRate')}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">批大小</span><span className="font-mono">{safeStr(config, 'batchSize')}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Epochs</span><span className="font-mono">{safeStr(config, 'epochs')}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">优化器</span><span className="font-mono">{safeStr(config, 'optimizer')}</span></div>
                        {safeStr(config, 'scheduler') !== '--' && <div className="flex justify-between"><span className="text-muted-foreground">调度器</span><span className="font-mono">{safeStr(config, 'scheduler')}</span></div>}
                        {safeNum(config, 'datasetSize') != null && <div className="flex justify-between"><span className="text-muted-foreground">数据量</span><span className="font-mono">{safeNum(config, 'datasetSize')?.toLocaleString()}</span></div>}
                        {safeStr(config, 'augmentation') !== '--' && <div className="flex justify-between"><span className="text-muted-foreground">数据增强</span><span>{config.augmentation ? '✅' : '❌'}</span></div>}
                      </div>
                    </div>
                  )}

                  {/* 资源使用 */}
                  <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                    <div className="text-xs font-semibold mb-2">资源与时间</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between"><span className="text-muted-foreground">GPU 数量</span><span className="font-mono">{selectedJob.gpuCount ?? '--'} 卡</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">已用时间</span><span className="font-mono">{duration}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">预计剩余</span><span className="font-mono">{estimatedRemaining}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">创建时间</span><span className="font-mono">{formatTime(selectedJob.createdAt)}</span></div>
                      {selectedJob.startedAt && <div className="flex justify-between"><span className="text-muted-foreground">开始时间</span><span className="font-mono">{formatTime(selectedJob.startedAt)}</span></div>}
                      {selectedJob.completedAt && <div className="flex justify-between"><span className="text-muted-foreground">完成时间</span><span className="font-mono">{formatTime(selectedJob.completedAt)}</span></div>}
                    </div>
                  </div>

                  {/* 训练指标 */}
                  {hasMetrics && (
                    <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                      <div className="text-xs font-semibold mb-2">训练指标</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {metrics.trainLoss !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">训练损失</span><span className="font-mono">{metrics.trainLoss.toFixed(4)}</span></div>
                        )}
                        {metrics.valLoss !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">验证损失</span><span className="font-mono">{metrics.valLoss.toFixed(4)}</span></div>
                        )}
                        {metrics.accuracy !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">准确率</span><span className="font-mono text-emerald-400">{metrics.accuracy}%</span></div>
                        )}
                        {metrics.f1 !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">F1</span><span className="font-mono text-cyan-400">{metrics.f1}%</span></div>
                        )}
                        {metrics.precision !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">精确率</span><span className="font-mono text-blue-400">{metrics.precision}%</span></div>
                        )}
                        {metrics.recall !== undefined && (
                          <div className="flex justify-between"><span className="text-muted-foreground">召回率</span><span className="font-mono text-purple-400">{metrics.recall}%</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 错误信息 */}
                  {selectedJob.errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[11px]">
                      <div className="text-xs font-semibold mb-1 text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 错误信息
                      </div>
                      <div className="text-red-300 font-mono break-all">{selectedJob.errorMessage}</div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-center py-8 text-sm text-muted-foreground">任务不存在</div>
            )}
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedJobId(null)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建训练弹窗 */}
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" /> 新建训练任务
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">任务名称</label>
                <Input
                  className="h-7 text-xs"
                  placeholder="例: 轴承故障分类器 v3.4"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">基线模型</label>
                <Select value={newJobModelId} onValueChange={setNewJobModelId}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearing-fault-v3.2">bearing-fault-v3.2</SelectItem>
                    <SelectItem value="anomaly-v4.1">anomaly-v4.1</SelectItem>
                    <SelectItem value="gearbox-v2.5">gearbox-v2.5</SelectItem>
                    <SelectItem value="rotating-v1.8">rotating-v1.8</SelectItem>
                    <SelectItem value="scratch">(从零训练)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">学习率</label>
                  <Input
                    className="h-7 text-xs"
                    value={newJobLr}
                    onChange={(e) => setNewJobLr(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">批大小</label>
                  <Select value={newJobBatchSize} onValueChange={setNewJobBatchSize}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16">16</SelectItem>
                      <SelectItem value="32">32</SelectItem>
                      <SelectItem value="64">64</SelectItem>
                      <SelectItem value="128">128</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Epochs</label>
                  <Input
                    className="h-7 text-xs"
                    value={newJobEpochs}
                    onChange={(e) => setNewJobEpochs(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">优化器</label>
                  <Select value={newJobOptimizer} onValueChange={setNewJobOptimizer}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adam">Adam</SelectItem>
                      <SelectItem value="adamw">AdamW</SelectItem>
                      <SelectItem value="sgd">SGD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                <span className="text-[11px] text-foreground">数据增强</span>
                <Switch checked={newJobAugmentation} onCheckedChange={setNewJobAugmentation} />
              </div>
              <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                <span className="text-[11px] text-foreground">使用 AutoML 搜索</span>
                <Switch checked={newJobAutoML} onCheckedChange={setNewJobAutoML} />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setShowNewDialog(false)}>取消</Button>
              <Button
                size="sm"
                className="text-xs h-7 gap-1"
                disabled={createJob.isPending}
                onClick={handleCreateJob}
              >
                {createJob.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                开始训练
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
