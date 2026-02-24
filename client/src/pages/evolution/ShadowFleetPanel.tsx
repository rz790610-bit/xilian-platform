/**
 * 影子车队监控面板
 * 对接 API: evoEvolution.shadowEval.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { StatusBadge, MetricCard, SectionHeader, DataTable, EmptyState, ConfirmDialog } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/* ─── 创建影子评估对话框 ─── */
function CreateShadowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const [challengerModel, setChallengerModel] = useState('');
  const [championModel, setChampionModel] = useState('');
  const [trafficPercent, setTrafficPercent] = useState('10');
  const utils = trpc.useUtils();
  const createMutation = trpc.evoEvolution.shadowEval.create.useMutation({
    onSuccess: () => {
      utils.evoEvolution.shadowEval.list.invalidate();
      onOpenChange(false);
      setName(''); setChallengerModel(''); setChampionModel(''); setTrafficPercent('10');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">创建影子评估</DialogTitle>
          <DialogDescription className="text-zinc-400">创建新的影子评估实验，对比挑战者模型与冠军模型的表现</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300 text-xs">实验名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例：v3.2 vs v3.1 影子评估"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">挑战者模型 ID</Label>
              <Input value={challengerModel} onChange={e => setChallengerModel(e.target.value)} placeholder="model-v3.2"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">冠军模型 ID</Label>
              <Input value={championModel} onChange={e => setChampionModel(e.target.value)} placeholder="model-v3.1"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-zinc-300 text-xs">流量百分比 (%)</Label>
            <Input type="number" value={trafficPercent} onChange={e => setTrafficPercent(e.target.value)} min={1} max={100}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1 w-32" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({
              name, challengerModelId: challengerModel, championModelId: championModel,
              trafficPercent: Number(trafficPercent),
            })}
            disabled={!name || !challengerModel || !championModel || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建实验'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 详情面板 ─── */
function ShadowDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const detail = trpc.evoEvolution.shadowEval.get.useQuery({ id });
  const utils = trpc.useUtils();
  const startMutation = trpc.evoEvolution.shadowEval.start.useMutation({
    onSuccess: () => { utils.evoEvolution.shadowEval.get.invalidate({ id }); utils.evoEvolution.shadowEval.list.invalidate(); },
  });
  const d = detail.data?.evaluation;
  if (!d) return <div className="p-6 text-zinc-500">加载中...</div>;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{d.name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">ID: {d.id} · 创建于 {d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status ?? 'pending'} />
          {d.status === 'pending' && (
            <Button size="sm" onClick={() => startMutation.mutate({ id })} disabled={startMutation.isPending}>
              {startMutation.isPending ? '启动中...' : '启动评估'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700 text-zinc-400">关闭</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="挑战者模型" value={d.challengerModelId ?? '-'} />
        <MetricCard label="冠军模型" value={d.championModelId ?? '-'} />
        <MetricCard label="流量比例" value={`${d.trafficPercent ?? 0}%`} />
      </div>

      {d.metrics && typeof d.metrics === 'object' && (
        <div className="bg-zinc-800/40 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">评估指标</h4>
          <pre className="text-xs text-zinc-300 overflow-x-auto">{JSON.stringify(d.metrics, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

/* ─── 主页面 ─── */
export default function ShadowFleetPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = trpc.evoEvolution.shadowEval.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });

  const evaluations = listQuery.data?.evaluations ?? [];

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">影子车队监控</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Shadow Fleet · 影子评估实验管理</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ 创建影子评估</Button>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总实验数" value={evaluations.length} />
        <MetricCard label="进行中" value={evaluations.filter(e => e.status === 'running').length} />
        <MetricCard label="已完成" value={evaluations.filter(e => e.status === 'completed').length} />
        <MetricCard label="待启动" value={evaluations.filter(e => e.status === 'pending').length} />
      </div>

      {/* 详情面板 */}
      {selectedId && <ShadowDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      {/* 实验列表 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="影子评估实验" />
        <DataTable
          data={evaluations}
          onRowClick={(row) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'name', label: '实验名称', render: (r) => <span className="text-zinc-200 font-medium">{r.name}</span> },
            { key: 'challengerModelId', label: '挑战者模型' },
            { key: 'championModelId', label: '冠军模型' },
            { key: 'trafficPercent', label: '流量%', width: '80px', render: (r) => <span className="tabular-nums">{r.trafficPercent}%</span> },
            { key: 'status', label: '状态', width: '100px', render: (r) => <StatusBadge status={r.status ?? 'pending'} /> },
            { key: 'createdAt', label: '创建时间', render: (r) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无影子评估实验"
        />
      </div>

      <CreateShadowDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
