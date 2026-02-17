/**
 * 自动训练 — 进化引擎
 * 
 * 功能：
 * 1. 训练任务管理（创建/监控/终止训练任务）
 * 2. 训练流水线可视化（数据准备 → 特征工程 → 模型训练 → 评估 → 部署）
 * 3. 超参数配置（AutoML / 手动配置）
 * 4. 训练日志和指标实时展示
 * 5. 模型版本对比
 */
import { useState, useMemo } from 'react';
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
  Clock, Cpu, HardDrive, TrendingUp, Settings2, GitBranch,
  ArrowRight, Loader2, AlertTriangle, Rocket, FileText,
  ChevronRight, BarChart3
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

// ==================== 类型 ====================

interface TrainJob {
  id: string;
  name: string;
  modelType: string;
  baseModel: string;
  status: 'queued' | 'preparing' | 'training' | 'evaluating' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStage: string;
  epoch: { current: number; total: number };
  metrics: {
    trainLoss?: number;
    valLoss?: number;
    accuracy?: number;
    f1?: number;
    precision?: number;
    recall?: number;
  };
  config: {
    learningRate: number;
    batchSize: number;
    epochs: number;
    optimizer: string;
    scheduler: string;
    datasetSize: number;
    augmentation: boolean;
  };
  resources: {
    gpu: string;
    gpuMemory: string;
    cpuUsage: string;
    duration: string;
    estimatedRemaining: string;
  };
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  outputModelVersion?: string;
}

// ==================== Mock 数据 ====================

const mockJobs: TrainJob[] = [
  {
    id: 'train-001', name: '轴承故障分类器 v3.3', modelType: 'bearing-fault-classifier',
    baseModel: 'bearing-fault-v3.2', status: 'training', progress: 67,
    currentStage: '模型训练', epoch: { current: 67, total: 100 },
    metrics: { trainLoss: 0.0823, valLoss: 0.1245, accuracy: 91.2, f1: 89.5, precision: 90.1, recall: 88.9 },
    config: { learningRate: 0.001, batchSize: 64, epochs: 100, optimizer: 'AdamW', scheduler: 'CosineAnnealing', datasetSize: 4500, augmentation: true },
    resources: { gpu: 'NVIDIA A100 40GB', gpuMemory: '18.2/40 GB', cpuUsage: '45%', duration: '2h 15m', estimatedRemaining: '1h 05m' },
    triggeredBy: '主动学习 Round 8', startedAt: '2026-02-17T07:00:00Z',
  },
  {
    id: 'train-002', name: '异常检测模型 v4.2', modelType: 'anomaly-detector',
    baseModel: 'anomaly-v4.1', status: 'evaluating', progress: 92,
    currentStage: '模型评估', epoch: { current: 80, total: 80 },
    metrics: { trainLoss: 0.0456, valLoss: 0.0678, accuracy: 93.8, f1: 92.1, precision: 93.5, recall: 90.8 },
    config: { learningRate: 0.0005, batchSize: 32, epochs: 80, optimizer: 'Adam', scheduler: 'ReduceLROnPlateau', datasetSize: 8200, augmentation: true },
    resources: { gpu: 'NVIDIA A100 40GB', gpuMemory: '24.5/40 GB', cpuUsage: '38%', duration: '4h 30m', estimatedRemaining: '20m' },
    triggeredBy: '反馈驱动（漏检修复）', startedAt: '2026-02-17T04:30:00Z',
  },
  {
    id: 'train-003', name: '齿轮箱诊断 v2.6', modelType: 'gearbox-diagnosis',
    baseModel: 'gearbox-v2.5', status: 'completed', progress: 100,
    currentStage: '已完成', epoch: { current: 60, total: 60 },
    metrics: { trainLoss: 0.0312, valLoss: 0.0589, accuracy: 94.5, f1: 93.2, precision: 94.8, recall: 91.7 },
    config: { learningRate: 0.001, batchSize: 48, epochs: 60, optimizer: 'AdamW', scheduler: 'CosineAnnealing', datasetSize: 3200, augmentation: false },
    resources: { gpu: 'NVIDIA A100 40GB', gpuMemory: '12.8/40 GB', cpuUsage: '32%', duration: '1h 45m', estimatedRemaining: '—' },
    triggeredBy: '手动触发（标签修正）', startedAt: '2026-02-16T20:00:00Z', completedAt: '2026-02-16T21:45:00Z',
    outputModelVersion: 'gearbox-v2.6',
  },
  {
    id: 'train-004', name: '旋转机械通用模型 v2.0', modelType: 'rotating-machinery',
    baseModel: 'rotating-v1.8', status: 'failed', progress: 34,
    currentStage: '训练失败', epoch: { current: 34, total: 100 },
    metrics: { trainLoss: 2.345, valLoss: 3.567 },
    config: { learningRate: 0.01, batchSize: 128, epochs: 100, optimizer: 'SGD', scheduler: 'StepLR', datasetSize: 6800, augmentation: true },
    resources: { gpu: 'NVIDIA A100 40GB', gpuMemory: '35.2/40 GB', cpuUsage: '78%', duration: '0h 52m', estimatedRemaining: '—' },
    triggeredBy: 'AutoML 搜索', startedAt: '2026-02-16T15:00:00Z',
  },
  {
    id: 'train-005', name: '电机故障预测 v1.0', modelType: 'motor-fault-prediction',
    baseModel: '(从零训练)', status: 'queued', progress: 0,
    currentStage: '排队中', epoch: { current: 0, total: 120 },
    metrics: {},
    config: { learningRate: 0.001, batchSize: 32, epochs: 120, optimizer: 'AdamW', scheduler: 'OneCycleLR', datasetSize: 5600, augmentation: true },
    resources: { gpu: '待分配', gpuMemory: '—', cpuUsage: '—', duration: '—', estimatedRemaining: '预计 3h' },
    triggeredBy: '计划任务', startedAt: '2026-02-17T10:00:00Z',
  },
];

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
  { id: 'data', label: '数据准备', icon: '📦' },
  { id: 'feature', label: '特征工程', icon: '⚙️' },
  { id: 'train', label: '模型训练', icon: '🧠' },
  { id: 'eval', label: '模型评估', icon: '📊' },
  { id: 'deploy', label: '模型部署', icon: '🚀' },
];

function getStageIndex(stage: string): number {
  if (stage.includes('准备') || stage.includes('数据')) return 0;
  if (stage.includes('特征')) return 1;
  if (stage.includes('训练')) return 2;
  if (stage.includes('评估')) return 3;
  if (stage.includes('完成') || stage.includes('部署')) return 4;
  return -1;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==================== 主组件 ====================

export default function AutoTrain() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('jobs');
  const [selectedJob, setSelectedJob] = useState<TrainJob | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredJobs = useMemo(() => {
    if (filterStatus === 'all') return mockJobs;
    return mockJobs.filter(j => j.status === filterStatus);
  }, [filterStatus]);

  const activeJobs = mockJobs.filter(j => j.status === 'training' || j.status === 'evaluating' || j.status === 'preparing');
  const completedJobs = mockJobs.filter(j => j.status === 'completed');

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
          <StatCard value={activeJobs.length} label="进行中" icon="🔄" />
          <StatCard value={completedJobs.length} label="已完成" icon="✅" />
          <StatCard value={mockJobs.filter(j => j.status === 'failed').length} label="失败" icon="❌" />
          <StatCard value="93.8%" label="最佳准确率" icon="🏆" />
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
                <span className="text-[10px] text-muted-foreground ml-auto">共 {filteredJobs.length} 个任务</span>
              </div>
            </PageCard>

            <div className="space-y-2">
              {filteredJobs.map(job => {
                const stageIdx = getStageIndex(job.currentStage);
                return (
                  <PageCard
                    key={job.id}
                    className="cursor-pointer hover:border-primary/30 transition-all"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div className="space-y-3">
                      {/* 头部 */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground">{job.name}</span>
                            <Badge variant="outline" className={cn("text-[10px] gap-0.5", statusConfig[job.status]?.color)}>
                              {statusConfig[job.status]?.icon}
                              {statusConfig[job.status]?.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>基线: {job.baseModel}</span>
                            <span>触发: {job.triggeredBy}</span>
                            <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatTime(job.startedAt)}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(job.status === 'training' || job.status === 'evaluating') && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-red-400 border-red-500/30" onClick={(e) => { e.stopPropagation(); toast.warning('训练已终止'); }}>
                              <Square className="w-2.5 h-2.5" /> 终止
                            </Button>
                          )}
                          {job.status === 'completed' && job.outputModelVersion && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-emerald-400 border-emerald-500/30" onClick={(e) => { e.stopPropagation(); toast.success('模型已部署'); }}>
                              <Rocket className="w-2.5 h-2.5" /> 部署
                            </Button>
                          )}
                          {job.status === 'failed' && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); toast.success('重新训练已提交'); }}>
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
                            <Progress value={job.progress} className="h-1.5 flex-1" />
                            <span className="text-[10px] font-mono text-muted-foreground">{job.progress}%</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Epoch {job.epoch.current}/{job.epoch.total}</span>
                            <span>⏱ {job.resources.duration}</span>
                            {job.resources.estimatedRemaining !== '—' && (
                              <span>剩余 {job.resources.estimatedRemaining}</span>
                            )}
                          </div>
                        </div>

                        {/* 关键指标 */}
                        {(job.metrics.accuracy || job.metrics.trainLoss) && (
                          <div className="flex gap-3 shrink-0 text-[10px]">
                            {job.metrics.accuracy && (
                              <div className="text-center">
                                <div className="text-emerald-400 font-mono font-semibold">{job.metrics.accuracy}%</div>
                                <div className="text-muted-foreground">准确率</div>
                              </div>
                            )}
                            {job.metrics.f1 && (
                              <div className="text-center">
                                <div className="text-cyan-400 font-mono font-semibold">{job.metrics.f1}%</div>
                                <div className="text-muted-foreground">F1</div>
                              </div>
                            )}
                            {job.metrics.trainLoss !== undefined && (
                              <div className="text-center">
                                <div className={cn("font-mono font-semibold", job.metrics.trainLoss > 1 ? 'text-red-400' : 'text-blue-400')}>
                                  {job.metrics.trainLoss.toFixed(4)}
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
        <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> 训练详情
              </DialogTitle>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{selectedJob.name}</span>
                  <Badge variant="outline" className={cn("text-[10px] gap-0.5", statusConfig[selectedJob.status]?.color)}>
                    {statusConfig[selectedJob.status]?.icon}
                    {statusConfig[selectedJob.status]?.label}
                  </Badge>
                </div>

                {/* 训练配置 */}
                <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                  <div className="text-xs font-semibold mb-2">训练配置</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">学习率</span><span className="font-mono">{selectedJob.config.learningRate}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">批大小</span><span className="font-mono">{selectedJob.config.batchSize}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Epochs</span><span className="font-mono">{selectedJob.config.epochs}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">优化器</span><span className="font-mono">{selectedJob.config.optimizer}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">调度器</span><span className="font-mono">{selectedJob.config.scheduler}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">数据量</span><span className="font-mono">{selectedJob.config.datasetSize.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">数据增强</span><span>{selectedJob.config.augmentation ? '✅' : '❌'}</span></div>
                  </div>
                </div>

                {/* 资源使用 */}
                <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                  <div className="text-xs font-semibold mb-2">资源使用</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">GPU</span><span className="font-mono">{selectedJob.resources.gpu}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">显存</span><span className="font-mono">{selectedJob.resources.gpuMemory}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">CPU</span><span className="font-mono">{selectedJob.resources.cpuUsage}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">已用时间</span><span className="font-mono">{selectedJob.resources.duration}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">预计剩余</span><span className="font-mono">{selectedJob.resources.estimatedRemaining}</span></div>
                  </div>
                </div>

                {/* 训练指标 */}
                {Object.keys(selectedJob.metrics).length > 0 && (
                  <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                    <div className="text-xs font-semibold mb-2">训练指标</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {selectedJob.metrics.trainLoss !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">训练损失</span><span className="font-mono">{selectedJob.metrics.trainLoss.toFixed(4)}</span></div>
                      )}
                      {selectedJob.metrics.valLoss !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">验证损失</span><span className="font-mono">{selectedJob.metrics.valLoss.toFixed(4)}</span></div>
                      )}
                      {selectedJob.metrics.accuracy !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">准确率</span><span className="font-mono text-emerald-400">{selectedJob.metrics.accuracy}%</span></div>
                      )}
                      {selectedJob.metrics.f1 !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">F1</span><span className="font-mono text-cyan-400">{selectedJob.metrics.f1}%</span></div>
                      )}
                      {selectedJob.metrics.precision !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">精确率</span><span className="font-mono text-blue-400">{selectedJob.metrics.precision}%</span></div>
                      )}
                      {selectedJob.metrics.recall !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">召回率</span><span className="font-mono text-purple-400">{selectedJob.metrics.recall}%</span></div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedJob(null)}>关闭</Button>
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
                <Input className="h-7 text-xs" placeholder="例: 轴承故障分类器 v3.4" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">基线模型</label>
                <Select defaultValue="bearing-fault-v3.2">
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
                  <Input className="h-7 text-xs" defaultValue="0.001" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">批大小</label>
                  <Select defaultValue="64">
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
                  <Input className="h-7 text-xs" defaultValue="100" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">优化器</label>
                  <Select defaultValue="adamw">
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
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                <span className="text-[11px] text-foreground">使用 AutoML 搜索</span>
                <Switch />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setShowNewDialog(false)}>取消</Button>
              <Button size="sm" className="text-xs h-7 gap-1" onClick={() => { toast.success('训练任务已创建'); setShowNewDialog(false); }}>
                <Play className="w-3 h-3" /> 开始训练
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
