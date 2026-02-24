/**
 * 影子车队监控面板
 * 对接 API: evoEvolution.shadowEval.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, DataTable, EmptyState, ConfirmDialog } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import EvolutionConfigPanel from '@/components/evolution/EvolutionConfigPanel';

/* ─── 创建影子评估对话框 ─── */
function CreateShadowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [experimentName, setExperimentName] = useState('');
  const [challengerModelId, setChallengerModelId] = useState('');
  const [baselineModelId, setBaselineModelId] = useState('');
  const [dataRangeStart, setDataRangeStart] = useState('');
  const [dataRangeEnd, setDataRangeEnd] = useState('');
  const utils = trpc.useUtils();
  const createMutation = trpc.evoEvolution.shadowEval.create.useMutation({
    onSuccess: () => {
      utils.evoEvolution.shadowEval.list.invalidate();
      onOpenChange(false);
      setExperimentName(''); setChallengerModelId(''); setBaselineModelId('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">创建影子评估</DialogTitle>
          <DialogDescription className="text-zinc-400">创建新的影子评估实验，对比挑战者模型与基线模型的表现</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300 text-xs">实验名称</Label>
            <Input value={experimentName} onChange={e => setExperimentName(e.target.value)} placeholder="例：v3.2 vs v3.1 影子评估"
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">挑战者模型 ID</Label>
              <Input value={challengerModelId} onChange={e => setChallengerModelId(e.target.value)} placeholder="model-v3.2"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">基线模型 ID</Label>
              <Input value={baselineModelId} onChange={e => setBaselineModelId(e.target.value)} placeholder="model-v3.1"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">数据范围起始</Label>
              <Input type="date" value={dataRangeStart} onChange={e => setDataRangeStart(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">数据范围结束</Label>
              <Input type="date" value={dataRangeEnd} onChange={e => setDataRangeEnd(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({
              experimentName,
              challengerModelId,
              baselineModelId,
              dataRangeStart: dataRangeStart || new Date().toISOString(),
              dataRangeEnd: dataRangeEnd || new Date().toISOString(),
            })}
            disabled={!experimentName || !challengerModelId || !baselineModelId || createMutation.isPending}
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
  const d = detail.data?.record;
  if (!d) return <div className="p-6 text-zinc-500">加载中...</div>;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{d.experimentName}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">ID: {d.id} · 创建于 {d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status ?? 'pending'} />
          {d.status === 'pending' && (
            <Button size="sm" onClick={() => startMutation.mutate({ id })} disabled={startMutation.isPending}>
              {startMutation.isPending ? '启动中...' : '🚀 启动评估'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700 text-zinc-400">关闭</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="挑战者模型" value={d.challengerModelId ?? '-'} />
        <MetricCard label="基线模型" value={d.baselineModelId ?? '-'} />
        <MetricCard label="数据范围" value={`${d.dataRangeStart ? new Date(d.dataRangeStart).toLocaleDateString('zh-CN') : '-'} ~ ${d.dataRangeEnd ? new Date(d.dataRangeEnd).toLocaleDateString('zh-CN') : '-'}`} />
      </div>

      {detail.data?.metrics && detail.data.metrics.length > 0 && (
        <div className="bg-zinc-800/40 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">评估指标</h4>
          <pre className="text-xs text-zinc-300 overflow-x-auto">{JSON.stringify(detail.data.metrics, null, 2)}</pre>
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

  const records = listQuery.data?.records ?? [];

  return (
    <MainLayout title="影子车队">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">影子车队监控</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Shadow Fleet · 影子评估实验管理</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ 创建影子评估</Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-zinc-800/60 border border-zinc-700">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            📊 实验管理
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            ⚙️ 引擎配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          {/* 概览指标 */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="总实验数" value={records.length} />
            <MetricCard label="进行中" value={records.filter((e: any) => e.status === 'running').length} />
            <MetricCard label="已完成" value={records.filter((e: any) => e.status === 'completed').length} />
            <MetricCard label="待启动" value={records.filter((e: any) => e.status === 'pending').length} />
          </div>

          {/* 详情面板 */}
          {selectedId && <ShadowDetail id={selectedId} onClose={() => setSelectedId(null)} />}

          {/* 实验列表 */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <SectionHeader title="影子评估实验" />
            <DataTable
              data={records}
              onRowClick={(row) => setSelectedId(row.id)}
              columns={[
                { key: 'id', label: 'ID', width: '60px' },
                { key: 'experimentName', label: '实验名称', render: (r: any) => <span className="text-zinc-200 font-medium">{r.experimentName}</span> },
                { key: 'challengerModelId', label: '挑战者模型' },
                { key: 'baselineModelId', label: '基线模型' },
                { key: 'status', label: '状态', width: '100px', render: (r: any) => <StatusBadge status={r.status ?? 'pending'} /> },
                { key: 'createdAt', label: '创建时间', render: (r: any) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
              ]}
              emptyMessage="暂无影子评估实验"
            />
          </div>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <EvolutionConfigPanel modules={['shadowEvaluator']} title="影子评估器配置" />
        </TabsContent>
      </Tabs>

      <CreateShadowDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
    </MainLayout>
  );
}
