/**
 * 冠军挑战者实验管理
 * 对接 API: evoEvolution.championChallenger.*
 *
 * 后端 schema 字段：
 *   id, name, championId, challengerId, gate1Passed, gate2Passed, gate3Passed,
 *   tasScore, verdict (PROMOTE|CANARY_EXTENDED|REJECT|PENDING), promotedAt,
 *   shadowEvalId, createdAt, updatedAt
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, DataTable, ConfirmDialog } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/* ─── 创建实验对话框 ─── */
function CreateExperimentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('');
  const [championId, setChampionId] = useState('');
  const [challengerId, setChallengerId] = useState('');
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
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({ name, championId, challengerId })}
            disabled={!name || !championId || !challengerId || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建实验'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 三门控状态 ─── */
function GateStatus({ label, passed }: { label: string; passed: boolean | null }) {
  const color = passed === true ? 'text-emerald-400' : passed === false ? 'text-red-400' : 'text-zinc-500';
  const icon = passed === true ? '✓' : passed === false ? '✗' : '—';
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`font-mono ${color}`}>{icon}</span>
      <span className="text-zinc-400">{label}</span>
    </div>
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
          <p className="text-xs text-zinc-500 mt-0.5">ID: {d.id} · 创建于 {d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.verdict ?? 'PENDING'} />
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
        <MetricCard label="冠军模型" value={d.championId ?? '-'} />
        <MetricCard label="挑战者模型" value={d.challengerId ?? '-'} />
        <MetricCard label="TAS 评分" value={d.tasScore != null ? d.tasScore.toFixed(3) : '-'} />
        <MetricCard label="裁决" value={d.verdict ?? 'PENDING'} />
      </div>

      {/* 三门控状态 */}
      <div className="bg-zinc-800/40 rounded-lg p-4">
        <h4 className="text-xs font-medium text-zinc-400 mb-3">三门控检查</h4>
        <div className="flex items-center gap-6">
          <GateStatus label="Gate 1 (统计显著性)" passed={d.gate1Passed} />
          <GateStatus label="Gate 2 (安全性)" passed={d.gate2Passed} />
          <GateStatus label="Gate 3 (业务指标)" passed={d.gate3Passed} />
        </div>
      </div>

      <ConfirmDialog
        open={verdictOpen}
        onOpenChange={setVerdictOpen}
        title={verdictType === 'PROMOTE' ? '确认提升挑战者' : '确认拒绝挑战者'}
        description={verdictType === 'PROMOTE'
          ? `将 ${d.challengerId} 提升为新冠军，替换 ${d.championId}`
          : `拒绝 ${d.challengerId}，保留 ${d.championId} 为冠军`}
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
    <MainLayout title="冠军挑战者">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">冠军挑战者管理</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Champion Challenger · 模型对比实验与裁决</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ 创建实验</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总实验数" value={experiments.length} />
        <MetricCard label="待裁决" value={experiments.filter((e: any) => !e.verdict || e.verdict === 'PENDING').length} />
        <MetricCard label="已提升" value={experiments.filter((e: any) => e.verdict === 'PROMOTE').length} />
        <MetricCard label="已拒绝" value={experiments.filter((e: any) => e.verdict === 'REJECT').length} />
      </div>

      {selectedId && <ExperimentDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="实验列表" />
        <DataTable
          data={experiments}
          onRowClick={(row) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'name', label: '实验名称', render: (r: any) => <span className="text-zinc-200 font-medium">{r.name}</span> },
            { key: 'championId', label: '冠军模型' },
            { key: 'challengerId', label: '挑战者模型' },
            { key: 'tasScore', label: 'TAS', width: '80px', render: (r: any) => <span className="tabular-nums">{r.tasScore != null ? r.tasScore.toFixed(3) : '-'}</span> },
            { key: 'verdict', label: '裁决', width: '120px', render: (r: any) => <StatusBadge status={r.verdict ?? 'PENDING'} /> },
            { key: 'createdAt', label: '创建时间', render: (r: any) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无冠军挑战者实验"
        />
      </div>

      <CreateExperimentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
    </MainLayout>
  );
}
