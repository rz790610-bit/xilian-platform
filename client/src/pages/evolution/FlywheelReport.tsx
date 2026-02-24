/**
 * 进化飞轮周期报告
 * 对接 API: evoEvolution.cycle.* + evoEvolution.schedule.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, DataTable } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/* ─── 创建调度对话框 ─── */
function CreateScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 0 2 * * *');
  const [minInterval, setMinInterval] = useState(24);
  const utils = trpc.useUtils();
  const createMutation = trpc.evoEvolution.schedule.create.useMutation({
    onSuccess: () => {
      utils.evoEvolution.schedule.list.invalidate();
      onOpenChange(false);
      setName(''); setCron('0 0 2 * * *');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">创建飞轮调度</DialogTitle>
          <DialogDescription className="text-zinc-400">配置自动进化飞轮调度计划</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300 text-xs">调度名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="每日凌晨进化"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
          </div>
          <div>
            <Label className="text-zinc-300 text-xs">Cron 表达式（6 字段，支持秒级）</Label>
            <Input value={cron} onChange={e => setCron(e.target.value)} placeholder="0 0 2 * * *"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1 font-mono" />
          </div>
          <div>
            <Label className="text-zinc-300 text-xs">最小间隔（小时）</Label>
            <Input type="number" value={minInterval} onChange={e => setMinInterval(Number(e.target.value))} min={1}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1 w-32" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({ name, cronExpression: cron, config: {}, minIntervalHours: minInterval })}
            disabled={!name || !cron || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建调度'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 周期详情面板 ─── */
function CycleDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const stepLogs = trpc.evoEvolution.cycle.getStepLogs.useQuery({ cycleId: id });
  const current = trpc.evoEvolution.cycle.getCurrent.useQuery();
  const d = current.data?.cycle;
  const logs = stepLogs.data?.stepLogs ?? [];

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">飞轮周期 #{id}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{d?.startedAt ? new Date(d.startedAt).toLocaleString('zh-CN') : '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d?.status ?? 'pending'} />
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700 text-zinc-400">关闭</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="周期号" value={d?.cycleNumber ?? id} />
        <MetricCard label="精度(前)" value={d?.accuracyBefore != null ? `${(d.accuracyBefore * 100).toFixed(2)}%` : '-'} />
        <MetricCard label="精度(后)" value={d?.accuracyAfter != null ? `${(d.accuracyAfter * 100).toFixed(2)}%` : '-'} />
        <MetricCard label="提升" value={d?.improvementPercent != null ? `${d.improvementPercent.toFixed(2)}%` : '-'}
          trend={d?.improvementPercent && d.improvementPercent > 0 ? 'up' : 'stable'} />
      </div>

      {/* 步骤日志 */}
      {logs.length > 0 && (
        <div className="bg-zinc-800/40 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">执行步骤</h4>
          <div className="space-y-1">
            {logs.map((step: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${step.status === 'completed' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="text-zinc-300 font-mono">{step.stepName ?? `Step ${step.stepNumber}`}</span>
                <span className="text-zinc-500 ml-auto">{step.durationMs ? `${step.durationMs}ms` : '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 趋势图 ─── */
function FlywheelTrend() {
  const trendQuery = trpc.evoEvolution.cycle.getTrend.useQuery({ weeks: 20 }, { retry: 1 });
  const trend = trendQuery.data?.trend ?? [];
  const direction = trendQuery.data?.direction ?? 'stable';
  const slope = trendQuery.data?.slope ?? 0;

  if (!trend.length) return null;

  const chartData = trend.map((t: any) => ({
    cycle: `#${t.cycleNumber}`,
    before: t.accuracyBefore != null ? (t.accuracyBefore * 100).toFixed(2) : null,
    after: t.accuracyAfter != null ? (t.accuracyAfter * 100).toFixed(2) : null,
    improvement: t.improvementPercent?.toFixed(2) ?? 0,
    edgeCases: t.edgeCasesFound ?? 0,
  }));

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="进化趋势" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">方向:</span>
          <span className={direction === 'improving' ? 'text-emerald-400' : direction === 'degrading' ? 'text-red-400' : 'text-zinc-400'}>
            {direction === 'improving' ? '↑ 改善中' : direction === 'degrading' ? '↓ 恶化中' : '→ 稳定'}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-500">斜率: {slope.toFixed(4)}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="cycle" tick={{ fontSize: 10, fill: '#71717a' }} />
          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="before" stroke="#6366f1" name="精度(前)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="after" stroke="#22d3ee" name="精度(后)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── 调度管理 ─── */
function SchedulePanel() {
  const schedules = trpc.evoEvolution.schedule.list.useQuery(undefined, { refetchInterval: 30000 });
  const utils = trpc.useUtils();
  const toggleMutation = trpc.evoEvolution.schedule.toggle.useMutation({
    onSuccess: () => utils.evoEvolution.schedule.list.invalidate(),
  });

  const list = schedules.data?.schedules ?? [];
  if (!list.length) return null;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="飞轮调度配置" />
      <DataTable
        data={list}
        columns={[
          { key: 'id', label: 'ID', width: '50px' },
          { key: 'name', label: '名称', render: (r) => <span className="text-zinc-200 font-medium">{r.name}</span> },
          { key: 'cronExpression', label: 'Cron', render: (r) => <code className="text-xs text-cyan-400 bg-zinc-800 px-1.5 py-0.5 rounded">{r.cronExpression}</code> },
          { key: 'minIntervalHours', label: '最小间隔', width: '90px', render: (r) => <span className="tabular-nums">{r.minIntervalHours}h</span> },
          { key: 'enabled', label: '状态', width: '80px', render: (r) => (
            <Button variant="outline" size="sm"
              className={`h-6 text-xs ${r.enabled ? 'border-emerald-700 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}
              onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: r.id, enabled: !r.enabled }); }}
            >
              {r.enabled ? '启用' : '禁用'}
            </Button>
          )},
        ]}
        emptyMessage="暂无调度配置"
      />
    </div>
  );
}

/* ─── 主页面 ─── */
export default function FlywheelReport() {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = trpc.evoEvolution.cycle.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });

  const cycles = listQuery.data?.cycles ?? [];

  return (
    <MainLayout title="进化飞轮">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">进化飞轮报告</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Flywheel · 自主进化周期执行与趋势分析</p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>⚡ 创建调度</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总周期数" value={cycles.length} />
        <MetricCard label="进行中" value={cycles.filter((c: any) => c.status === 'running').length} />
        <MetricCard label="已完成" value={cycles.filter((c: any) => c.status === 'completed').length} />
        <MetricCard label="失败" value={cycles.filter((c: any) => c.status === 'failed').length} />
      </div>

      <FlywheelTrend />

      {selectedId && <CycleDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="飞轮周期列表" />
        <DataTable
          data={cycles}
          onRowClick={(row: any) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'cycleNumber', label: '周期号', width: '80px', render: (r: any) => <span className="font-medium text-zinc-200">#{r.cycleNumber}</span> },
            { key: 'accuracyBefore', label: '精度(前)', width: '90px', render: (r: any) => <span className="tabular-nums">{r.accuracyBefore != null ? `${(r.accuracyBefore * 100).toFixed(2)}%` : '-'}</span> },
            { key: 'accuracyAfter', label: '精度(后)', width: '90px', render: (r: any) => <span className="tabular-nums text-cyan-400">{r.accuracyAfter != null ? `${(r.accuracyAfter * 100).toFixed(2)}%` : '-'}</span> },
            { key: 'improvementPercent', label: '提升', width: '80px', render: (r: any) => {
              const v = r.improvementPercent;
              if (v == null) return <span className="text-zinc-500">-</span>;
              return <span className={`tabular-nums ${v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>;
            }},
            { key: 'edgeCasesFound', label: '边界案例', width: '80px', render: (r: any) => <span className="tabular-nums">{r.edgeCasesFound ?? 0}</span> },
            { key: 'status', label: '状态', width: '80px', render: (r: any) => <StatusBadge status={r.status ?? 'pending'} /> },
            { key: 'startedAt', label: '开始时间', render: (r: any) => <span className="text-zinc-500 text-xs">{r.startedAt ? new Date(r.startedAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无飞轮周期记录"
        />
      </div>

       <SchedulePanel />
      <CreateScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </div>
    </MainLayout>
  );
}
