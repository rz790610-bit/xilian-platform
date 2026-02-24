/**
 * 冠军挑战者实验管理
 * 对接 API: evoEvolution.championChallenger.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { StatusBadge, MetricCard, SectionHeader, DataTable, ConfirmDialog } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/* ─── 创建实验对话框 ─── */
function CreateExperimentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const [championId, setChampionId] = useState('');
  const [challengerId, setChallengerId] = useState('');
  const [metric, setMetric] = useState('accuracy');
  const [threshold, setThreshold] = useState('0.05');
  const utils = trpc.useUtils();
  const createMutation = trpc.evoEvolution.championChallenger.create.useMutation({
    onSuccess: () => {
      utils.evoEvolution.championChallenger.list.invalidate();
      onOpenChange(false);
      setName(''); setChampionId(''); setChallengerId('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">创建冠军挑战者实验</DialogTitle>
          <DialogDescription className="text-zinc-400">配置模型对比实验参数</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300 text-xs">实验名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例：v3.2 挑战 v3.1"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">冠军模型 ID</Label>
              <Input value={championId} onChange={e => setChampionId(e.target.value)} placeholder="model-v3.1"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">挑战者模型 ID</Label>
              <Input value={challengerId} onChange={e => setChallengerId(e.target.value)} placeholder="model-v3.2"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">评估指标</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="accuracy">准确率</SelectItem>
                  <SelectItem value="latency">延迟</SelectItem>
                  <SelectItem value="intervention_rate">干预率</SelectItem>
                  <SelectItem value="composite">综合评分</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">胜出阈值</Label>
              <Input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} step="0.01"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({
              name, championModelId: championId, challengerModelId: challengerId,
              primaryMetric: metric, minImprovementThreshold: Number(threshold),
            })}
            disabled={!name || !championId || !challengerId || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建实验'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 详情面板 ─── */
function ExperimentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const detail = trpc.evoEvolution.championChallenger.get.useQuery({ id });
  const utils = trpc.useUtils();
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [verdictType, setVerdictType] = useState<'PROMOTE' | 'REJECT'>('PROMOTE');
  const verdictMutation = trpc.evoEvolution.championChallenger.verdict.useMutation({
    onSuccess: () => {
      utils.evoEvolution.championChallenger.get.invalidate({ id });
      utils.evoEvolution.championChallenger.list.invalidate();
    },
  });

  const d = detail.data?.experiment;
  if (!d) return <div className="p-6 text-zinc-500">加载中...</div>;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{d.name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">ID: {d.id} · {d.primaryMetric} · 阈值 {d.minImprovementThreshold}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.verdict ?? d.status ?? 'PENDING'} />
          {(!d.verdict || d.verdict === 'PENDING') && (
            <>
              <Button size="sm" onClick={() => { setVerdictType('PROMOTE'); setVerdictOpen(true); }}
                className="bg-emerald-600 hover:bg-emerald-700">提升</Button>
              <Button size="sm" variant="destructive" onClick={() => { setVerdictType('REJECT'); setVerdictOpen(true); }}>
                拒绝
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700 text-zinc-400">关闭</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="冠军模型" value={d.championModelId ?? '-'} />
        <MetricCard label="挑战者模型" value={d.challengerModelId ?? '-'} />
        <MetricCard label="评估指标" value={d.primaryMetric ?? '-'} />
        <MetricCard label="裁决" value={d.verdict ?? 'PENDING'} />
      </div>

      {d.results && typeof d.results === 'object' && (
        <div className="bg-zinc-800/40 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">实验结果</h4>
          <pre className="text-xs text-zinc-300 overflow-x-auto">{JSON.stringify(d.results, null, 2)}</pre>
        </div>
      )}

      <ConfirmDialog
        open={verdictOpen}
        onOpenChange={setVerdictOpen}
        title={verdictType === 'PROMOTE' ? '确认提升挑战者' : '确认拒绝挑战者'}
        description={verdictType === 'PROMOTE'
          ? `将 ${d.challengerModelId} 提升为新冠军，替换 ${d.championModelId}`
          : `拒绝 ${d.challengerModelId}，保留 ${d.championModelId} 为冠军`}
        confirmLabel={verdictType === 'PROMOTE' ? '确认提升' : '确认拒绝'}
        variant={verdictType === 'REJECT' ? 'destructive' : 'default'}
        requireReason
        onConfirm={(reason) => verdictMutation.mutate({ id, verdict: verdictType, reason: reason ?? '' })}
      />
    </div>
  );
}

/* ─── 主页面 ─── */
export default function ChampionChallengerPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = trpc.evoEvolution.championChallenger.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });

  const experiments = listQuery.data?.experiments ?? [];

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">冠军挑战者管理</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Champion Challenger · 模型对比实验与裁决</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ 创建实验</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总实验数" value={experiments.length} />
        <MetricCard label="待裁决" value={experiments.filter(e => !e.verdict || e.verdict === 'PENDING').length} />
        <MetricCard label="已提升" value={experiments.filter(e => e.verdict === 'PROMOTE').length} />
        <MetricCard label="已拒绝" value={experiments.filter(e => e.verdict === 'REJECT').length} />
      </div>

      {selectedId && <ExperimentDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="实验列表" />
        <DataTable
          data={experiments}
          onRowClick={(row) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'name', label: '实验名称', render: (r) => <span className="text-zinc-200 font-medium">{r.name}</span> },
            { key: 'championModelId', label: '冠军模型' },
            { key: 'challengerModelId', label: '挑战者模型' },
            { key: 'primaryMetric', label: '评估指标', width: '100px' },
            { key: 'verdict', label: '裁决', width: '120px', render: (r) => <StatusBadge status={r.verdict ?? 'PENDING'} /> },
            { key: 'createdAt', label: '创建时间', render: (r) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无冠军挑战者实验"
        />
      </div>

      <CreateExperimentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
