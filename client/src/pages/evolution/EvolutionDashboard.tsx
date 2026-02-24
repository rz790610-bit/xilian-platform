/**
 * 进化引擎总览仪表盘 (Phase 2 - 闭环串联)
 * 对接 API: evoEvolution.getOverview / getFlywheelStatus / cycle.* / dataEngine.triggerAnalysis / audit.list / dojo.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MetricCard, StatusBadge, SectionHeader } from '@/components/evolution';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import EvolutionConfigPanel from '@/components/evolution/EvolutionConfigPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';

/* ─── 进化闭环状态环（增强版：可交互） ─── */
const LOOP_STAGES = [
  { key: 'discovering', label: '数据发现', icon: '🔍', stepNumber: 1 },
  { key: 'hypothesizing', label: '假设生成', icon: '💡', stepNumber: 2 },
  { key: 'evaluating', label: '影子评估', icon: '⚖️', stepNumber: 3 },
  { key: 'deploying', label: '金丝雀部署', icon: '🐤', stepNumber: 4 },
  { key: 'crystallizing', label: '知识结晶', icon: '💎', stepNumber: 5 },
];

function EvolutionLoop({ currentStatus, stepLogs }: {
  currentStatus: string;
  stepLogs?: Array<{ stepNumber: number; stepName: string; status: string; startedAt?: string | null; completedAt?: string | null; durationMs?: number | null; metrics?: Record<string, number> | null }>;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="进化闭环状态" />
      <div className="flex items-center justify-between gap-2">
        {LOOP_STAGES.map((s, i) => {
          const log = stepLogs?.find(l => l.stepNumber === s.stepNumber);
          const stepStatus = log?.status ?? 'pending';
          const isActive = stepStatus === 'running';
          const isCompleted = stepStatus === 'completed';
          const isFailed = stepStatus === 'failed';
          return (
            <React.Fragment key={s.key}>
              <div className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg transition-all relative ${
                isActive ? 'bg-indigo-500/15 border border-indigo-500/30 scale-105' :
                isCompleted ? 'bg-emerald-500/10 border border-emerald-500/20' :
                isFailed ? 'bg-red-500/10 border border-red-500/20' :
                'opacity-40 border border-transparent'
              }`}>
                <span className="text-xl">{s.icon}</span>
                <span className={`text-[10px] font-medium ${
                  isActive ? 'text-indigo-300' :
                  isCompleted ? 'text-emerald-400' :
                  isFailed ? 'text-red-400' :
                  'text-zinc-500'
                }`}>{s.label}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                {isCompleted && <span className="text-[8px] text-emerald-500">✓</span>}
                {isFailed && <span className="text-[8px] text-red-500">✗</span>}
                {log?.durationMs && (
                  <span className="text-[8px] text-zinc-600">{(log.durationMs / 1000).toFixed(1)}s</span>
                )}
              </div>
              {i < LOOP_STAGES.length - 1 && (
                <div className={`flex-1 h-px ${
                  isCompleted ? 'bg-emerald-500/40' :
                  isActive ? 'bg-indigo-500/40' : 'bg-zinc-700'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 快捷入口 ─── */
const QUICK_LINKS = [
  { label: '影子评估', path: '/evolution/shadow', icon: '👻', desc: '创建影子评估实验' },
  { label: '冠军挑战者', path: '/evolution/champion', icon: '🏆', desc: '模型对比与裁决' },
  { label: '金丝雀部署', path: '/evolution/canary', icon: '🐤', desc: '渐进式模型发布' },
  { label: 'OTA 车队', path: '/evolution/ota', icon: '🚗', desc: '车队 OTA 部署管理' },
  { label: '飞轮周期', path: '/evolution/flywheel', icon: '🔄', desc: '进化周期与调度' },
  { label: '领域路由', path: '/evolution/domain-router', icon: '🧭', desc: '干预率趋势分析' },
  { label: 'FSD 干预', path: '/evolution/fsd', icon: '🎯', desc: '干预记录与视频轨迹' },
  { label: '知识结晶', path: '/evolution/crystals', icon: '💎', desc: '结晶库与验证' },
];

function QuickLinks() {
  const [, setLocation] = useLocation();
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="快捷入口" />
      <div className="grid grid-cols-4 gap-3">
        {QUICK_LINKS.map(l => (
          <button
            key={l.path}
            onClick={() => setLocation(l.path)}
            className="flex flex-col items-start gap-1 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/70 transition-all text-left group"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{l.icon}</span>
              <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100">{l.label}</span>
            </div>
            <span className="text-[10px] text-zinc-500">{l.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── 趋势图 ─── */
function TrendSection({ trend }: { trend: Array<{ cycleNumber: number; accuracyAfter?: number | null; improvementPercent?: number | null }> }) {
  const chartData = trend.map(t => ({
    name: `#${t.cycleNumber}`,
    accuracy: t.accuracyAfter ?? 0,
    improvement: t.improvementPercent ?? 0,
  }));

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="进化趋势" />
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Area type="monotone" dataKey="accuracy" stroke="#6366f1" fill="url(#colorAcc)" strokeWidth={2} name="准确率" />
            <Line type="monotone" dataKey="improvement" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="提升率%" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[220px] text-zinc-500 text-sm">
          暂无足够数据绘制趋势图
        </div>
      )}
    </div>
  );
}

/* ─── 触发数据分析对话框 ─── */
function TriggerAnalysisDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const trigger = trpc.evoEvolution.dataEngine.triggerAnalysis.useMutation({
    onSuccess: (data) => {
      alert(`数据分析已触发！新建进化周期 #${data.cycleId}，发现 ${data.edgeCasesFound} 个边缘案例`);
      onOpenChange(false);
    },
    onError: (err) => alert(`触发失败: ${err.message}`),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">触发数据引擎分析</DialogTitle>
          <DialogDescription className="text-zinc-400">选择数据范围，启动边缘案例发现与自动标注流程</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">开始日期</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-200" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">结束日期</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-200" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => trigger.mutate({ dataRangeStart: startDate, dataRangeEnd: endDate })}
            disabled={trigger.isPending}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            {trigger.isPending ? '分析中...' : '启动分析'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 一键启动进化周期对话框 ─── */
function StartCycleDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [trigger, setTrigger] = useState<'manual' | 'auto' | 'scheduled' | 'event'>('manual');
  const startCycle = trpc.evoEvolution.cycle.startCycle.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        alert(`启动失败: ${data.error}`);
      } else {
        alert(`进化周期 #${data.cycleNumber} 已启动！`);
        onOpenChange(false);
        onSuccess();
      }
    },
    onError: (err) => alert(`启动失败: ${err.message}`),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">🚀 启动进化周期</DialogTitle>
          <DialogDescription className="text-zinc-400">
            将自动创建新的进化周期并依次执行 5 个闭环步骤：数据发现 → 假设生成 → 影子评估 → 金丝雀部署 → 知识结晶
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">触发方式</label>
            <Select value={trigger} onValueChange={v => setTrigger(v as typeof trigger)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="manual">手动触发</SelectItem>
                <SelectItem value="auto">自动触发</SelectItem>
                <SelectItem value="scheduled">定时调度</SelectItem>
                <SelectItem value="event">事件驱动</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 mb-2">闭环步骤预览</p>
            <div className="flex items-center gap-1.5">
              {LOOP_STAGES.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </div>
                  {i < LOOP_STAGES.length - 1 && <span className="text-zinc-600 text-[10px]">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => startCycle.mutate({ trigger })}
            disabled={startCycle.isPending}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            {startCycle.isPending ? '启动中...' : '🚀 启动周期'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 当前周期实时进度面板 ─── */
function CycleProgressPanel() {
  const currentCycle = trpc.evoEvolution.cycle.getCurrent.useQuery(undefined, {
    refetchInterval: 5000,
    retry: 1,
  });
  const c = currentCycle.data?.cycle;
  const stepLogsQuery = trpc.evoEvolution.cycle.getStepLogs.useQuery(
    { cycleId: c?.id ?? 0 },
    { enabled: !!c, refetchInterval: 5000, retry: 1 }
  );
  const stepLogs = stepLogsQuery.data?.stepLogs ?? [];

  const advanceStep = trpc.evoEvolution.cycle.advanceStep.useMutation({
    onSuccess: () => currentCycle.refetch(),
    onError: (err) => alert(`操作失败: ${err.message}`),
  });

  const pauseCycle = trpc.evoEvolution.cycle.pauseCycle.useMutation({
    onSuccess: () => currentCycle.refetch(),
  });

  const resumeCycle = trpc.evoEvolution.cycle.resumeCycle.useMutation({
    onSuccess: () => currentCycle.refetch(),
  });

  if (!c) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="当前进化周期" />
        <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
          暂无运行中的进化周期
        </div>
      </div>
    );
  }

  const runningStep = stepLogs.find((s: Record<string, unknown>) => s.status === 'running');
  const completedCount = stepLogs.filter((s: Record<string, unknown>) => s.status === 'completed').length;
  const progress = (completedCount / 5) * 100;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <SectionHeader title={`进化周期 #${c.cycleNumber}`} />
          <StatusBadge status={c.status} className="text-[10px] px-2 py-0.5" />
        </div>
        <div className="flex items-center gap-2">
          {c.status === 'running' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => pauseCycle.mutate({ cycleId: c.id })}
              className="text-[10px] border-yellow-600/30 text-yellow-400 hover:bg-yellow-600/10"
            >
              ⏸ 暂停
            </Button>
          )}
          {c.status === 'paused' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => resumeCycle.mutate({ cycleId: c.id })}
              className="text-[10px] border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10"
            >
              ▶ 恢复
            </Button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
          <span>闭环进度</span>
          <span>{completedCount}/5 步骤完成 ({progress.toFixed(0)}%)</span>
        </div>
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 步骤详情 */}
      <div className="space-y-2">
        {stepLogs.map((log: Record<string, unknown>) => {
          const status = log.status as string;
          const stepNumber = log.stepNumber as number;
          const stepName = log.stepName as string;
          const durationMs = log.durationMs as number | null;
          return (
            <div key={stepNumber} className={`flex items-center justify-between p-2.5 rounded-lg border ${
              status === 'running' ? 'bg-indigo-500/10 border-indigo-500/20' :
              status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/15' :
              status === 'failed' ? 'bg-red-500/5 border-red-500/15' :
              'bg-zinc-800/30 border-zinc-800'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  status === 'running' ? 'bg-indigo-500/20 text-indigo-400' :
                  status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-zinc-700 text-zinc-500'
                }`}>
                  {status === 'completed' ? '✓' : status === 'failed' ? '✗' : stepNumber}
                </span>
                <div>
                  <span className={`text-xs font-medium ${
                    status === 'running' ? 'text-indigo-300' :
                    status === 'completed' ? 'text-emerald-400' :
                    status === 'failed' ? 'text-red-400' :
                    'text-zinc-500'
                  }`}>{stepName}</span>
                  {durationMs && (
                    <span className="text-[9px] text-zinc-600 ml-2">{(durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status === 'running' && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advanceStep.mutate({ cycleId: c.id, stepNumber, status: 'completed' })}
                      disabled={advanceStep.isPending}
                      className="text-[9px] h-6 px-2 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10"
                    >
                      标记完成
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advanceStep.mutate({ cycleId: c.id, stepNumber, status: 'failed', errorMessage: '手动标记失败' })}
                      disabled={advanceStep.isPending}
                      className="text-[9px] h-6 px-2 border-red-600/30 text-red-400 hover:bg-red-600/10"
                    >
                      标记失败
                    </Button>
                  </>
                )}
                {status === 'completed' && <span className="text-[9px] text-emerald-500">已完成</span>}
                {status === 'failed' && <span className="text-[9px] text-red-500">已失败</span>}
                {status === 'pending' && <span className="text-[9px] text-zinc-600">等待中</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 审计日志面板 ─── */
function AuditLogPanel() {
  const [eventType, setEventType] = useState('');
  const [severity, setSeverity] = useState('');
  const logs = trpc.evoEvolution.audit.list.useQuery({
    eventType: eventType || undefined,
    severity: (severity || undefined) as 'info' | 'warn' | 'error' | 'critical' | undefined,
    limit: 50,
  }, { refetchInterval: 10000, retry: 1 });

  const severityColors: Record<string, string> = {
    info: 'text-blue-400 bg-blue-500/10',
    warn: 'text-yellow-400 bg-yellow-500/10',
    error: 'text-red-400 bg-red-500/10',
    critical: 'text-red-500 bg-red-500/20 font-bold',
  };

  return (
    <div className="space-y-4">
      {/* 过滤器 */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="按事件类型过滤 (如 cycle.started)"
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-200 text-xs max-w-xs"
        />
        <Select value={severity || 'all'} onValueChange={v => setSeverity(v === 'all' ? '' : v)}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 text-xs w-32">
            <SelectValue placeholder="严重级别" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-zinc-500">共 {logs.data?.total ?? 0} 条记录</span>
      </div>

      {/* 日志列表 */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {(logs.data?.logs ?? []).length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">暂无审计日志</div>
        ) : (
          (logs.data?.logs ?? []).map((log: Record<string, unknown>, i: number) => (
            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors">
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${severityColors[log.severity as string] ?? 'text-zinc-400 bg-zinc-700'}`}>
                {(log.severity as string ?? '').toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-200">{log.eventType as string}</span>
                  <span className="text-[9px] text-zinc-600">{String(log.eventSource ?? '')}</span>
                </div>
                {log.eventData ? (
                  <pre className="text-[9px] text-zinc-500 mt-0.5 truncate max-w-full">
                    {JSON.stringify(log.eventData, null, 0).slice(0, 120)}
                  </pre>
                ) : null}
              </div>
              <span className="text-[9px] text-zinc-600 whitespace-nowrap">
                {log.createdAt ? new Date(log.createdAt as string).toLocaleString('zh-CN') : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Dojo 训练任务面板 ─── */
function DojoTrainingPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({ name: '', modelId: '', priority: 5, gpuCount: 8, useSpot: true });
  const stats = trpc.evoEvolution.dojo.getStats.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const jobs = trpc.evoEvolution.dojo.list.useQuery({ limit: 30 }, { refetchInterval: 10000, retry: 1 });
  const createJob = trpc.evoEvolution.dojo.create.useMutation({
    onSuccess: (data) => {
      if (data.jobId) {
        alert(`训练任务已创建 (ID: ${data.jobId})`);
        setShowCreate(false);
        setNewJob({ name: '', modelId: '', priority: 5, gpuCount: 8, useSpot: true });
        jobs.refetch();
        stats.refetch();
      }
    },
    onError: (err) => alert(`创建失败: ${err.message}`),
  });
  const cancelJob = trpc.evoEvolution.dojo.cancel.useMutation({
    onSuccess: () => { jobs.refetch(); stats.refetch(); },
  });

  const s = stats.data;
  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-500/10',
    scheduled: 'text-blue-400 bg-blue-500/10',
    running: 'text-indigo-400 bg-indigo-500/10',
    completed: 'text-emerald-400 bg-emerald-500/10',
    failed: 'text-red-400 bg-red-500/10',
    cancelled: 'text-zinc-400 bg-zinc-500/10',
  };

  return (
    <div className="space-y-4">
      {/* 统计概览 */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="总任务" value={s?.total ?? 0} />
        <MetricCard label="运行中" value={s?.running ?? 0} />
        <MetricCard label="已完成" value={s?.completed ?? 0} />
        <MetricCard label="失败" value={s?.failed ?? 0} />
        <MetricCard label="等待中" value={s?.pending ?? 0} />
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">训练任务列表</span>
        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-xs">
          + 创建训练任务
        </Button>
      </div>

      {/* 任务列表 */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {(jobs.data?.jobs ?? []).length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">暂无训练任务</div>
        ) : (
          (jobs.data?.jobs ?? []).map((job: Record<string, unknown>) => (
            <div key={job.id as number} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColors[job.status as string] ?? ''}`}>
                  {(job.status as string ?? '').toUpperCase()}
                </span>
                <div>
                  <span className="text-xs font-medium text-zinc-200">{job.name as string || `Job #${job.id}`}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-zinc-500">模型: {job.modelId as string || '-'}</span>
                    <span className="text-[9px] text-zinc-600">GPU: {Number(job.gpuCount ?? 0)}</span>
                    {job.useSpot ? <span className="text-[9px] text-cyan-500">Spot</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {job.createdAt ? (
                  <span className="text-[9px] text-zinc-600">{new Date(String(job.createdAt)).toLocaleString('zh-CN')}</span>
                ) : null}
                {(job.status === 'pending' || job.status === 'running' || job.status === 'scheduled') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelJob.mutate({ id: job.id as number })}
                    className="text-[9px] h-6 px-2 border-red-600/30 text-red-400 hover:bg-red-600/10"
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 创建训练任务对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">创建 Dojo 训练任务</DialogTitle>
            <DialogDescription className="text-zinc-400">配置训练参数并提交到 Dojo 训练集群</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">任务名称</label>
              <Input value={newJob.name} onChange={e => setNewJob(p => ({ ...p, name: e.target.value }))} placeholder="如：v2.1-finetune-edge-cases" className="bg-zinc-800 border-zinc-700 text-zinc-200" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">模型 ID</label>
              <Input value={newJob.modelId} onChange={e => setNewJob(p => ({ ...p, modelId: e.target.value }))} placeholder="如：model-v2.0-base" className="bg-zinc-800 border-zinc-700 text-zinc-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">GPU 数量</label>
                <Input type="number" value={newJob.gpuCount} onChange={e => setNewJob(p => ({ ...p, gpuCount: Number(e.target.value) }))} className="bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">优先级 (1-10)</label>
                <Input type="number" value={newJob.priority} onChange={e => setNewJob(p => ({ ...p, priority: Number(e.target.value) }))} min={1} max={10} className="bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newJob.useSpot} onChange={e => setNewJob(p => ({ ...p, useSpot: e.target.checked }))} className="rounded border-zinc-600" />
              <span className="text-xs text-zinc-300">使用 Spot 实例（节省成本）</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-zinc-700 text-zinc-300">取消</Button>
            <Button
              onClick={() => createJob.mutate(newJob)}
              disabled={createJob.isPending || !newJob.name || !newJob.modelId}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {createJob.isPending ? '创建中...' : '创建任务'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── 主页面 ─── */
export default function EvolutionDashboard() {
  const [showTrigger, setShowTrigger] = useState(false);
  const [showStartCycle, setShowStartCycle] = useState(false);
  const overview = trpc.evoEvolution.getOverview.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const flywheel = trpc.evoEvolution.getFlywheelStatus.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const trendQuery = trpc.evoEvolution.cycle.getTrend.useQuery({ weeks: 12 }, { retry: 1 });
  const currentCycle = trpc.evoEvolution.cycle.getCurrent.useQuery(undefined, {
    refetchInterval: 5000,
    retry: 1,
  });

  const o = overview.data;
  const f = flywheel.data;

  return (
    <MainLayout title="进化引擎总览">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">进化引擎总览</h1>
          <p className="text-xs text-zinc-500 mt-0.5">自主进化闭环 · 实时监控 · 一键赋能</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowStartCycle(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-xs"
          >
            🚀 启动进化周期
          </Button>
          <Button
            size="sm"
            onClick={() => setShowTrigger(true)}
            variant="outline"
            className="border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10 text-xs"
          >
            🔬 触发数据分析
          </Button>
          <StatusBadge status={f?.status ?? 'idle'} className="text-xs px-3 py-1" />
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-zinc-800/60 border border-zinc-700">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            总览
          </TabsTrigger>
          <TabsTrigger value="cycle" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            🔄 进化周期
          </TabsTrigger>
          <TabsTrigger value="dojo" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            🏋️ Dojo 训练
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            📋 审计日志
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            ⚙️ 全局引擎配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          {/* 指标卡片 */}
          <div className="grid grid-cols-5 gap-3">
            <MetricCard label="进化周期" value={o?.totalCycles ?? 0} sub={`${o?.activeCycles ?? 0} 活跃`} />
            <MetricCard label="挑战实验" value={o?.totalExperiments ?? 0} sub={`${o?.activeDeployments ?? 0} 部署中`} />
            <MetricCard
              label="干预率"
              value={o?.interventionRate ? `${(o.interventionRate * 100).toFixed(2)}%` : '0%'}
              sub={`${o?.totalInterventions ?? 0} 总决策`}
              trend={o?.interventionRate && o.interventionRate < 0.05 ? 'down' : 'stable'}
            />
            <MetricCard label="仿真场景" value={o?.totalSimulations ?? 0} />
            <MetricCard label="知识结晶" value={o?.totalCrystals ?? 0} sub={`${o?.activeSchedules ?? 0} 调度活跃`} />
          </div>

          {/* 进化闭环状态（增强版） */}
          <EvolutionLoop
            currentStatus={f?.status ?? 'idle'}
            stepLogs={[]}
          />

          {/* 当前周期实时进度 */}
          <CycleProgressPanel />

          {/* 趋势图 */}
          <TrendSection trend={trendQuery.data?.trend ?? []} />

          {/* 快捷入口 */}
          <QuickLinks />
        </TabsContent>

        <TabsContent value="cycle" className="mt-4 space-y-5">
          <CycleProgressPanel />
          <TrendSection trend={trendQuery.data?.trend ?? []} />
        </TabsContent>

        <TabsContent value="dojo" className="mt-4">
          <DojoTrainingPanel />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <EvolutionConfigPanel
            modules={['shadowEval', 'championChallenger', 'canaryRelease', 'otaFleet', 'fsdIntervention', 'simulationEngine', 'dataEngine', 'dualFlywheel', 'dojoTrainer', 'autoLabeler', 'domainRouter']}
            title="进化引擎全局配置中心"
          />
        </TabsContent>
      </Tabs>
    </div>
    <TriggerAnalysisDialog open={showTrigger} onOpenChange={setShowTrigger} />
    <StartCycleDialog open={showStartCycle} onOpenChange={setShowStartCycle} onSuccess={() => { overview.refetch(); currentCycle.refetch(); }} />
    </MainLayout>
  );
}
