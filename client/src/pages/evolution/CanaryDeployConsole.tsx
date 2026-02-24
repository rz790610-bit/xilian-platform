/**
 * 金丝雀部署控制台
 * 对接 API: evoEvolution.canary.*
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { StatusBadge, MetricCard, SectionHeader, DataTable, StageTimeline, HealthCheckTable, ConfirmDialog } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/* ─── 创建部署对话框 ─── */
function CreateDeployDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [modelId, setModelId] = useState('');
  const [targetVersion, setTargetVersion] = useState('');
  const [initialPercent, setInitialPercent] = useState('5');
  const utils = trpc.useUtils();
  const createMutation = trpc.evoEvolution.canary.create.useMutation({
    onSuccess: () => {
      utils.evoEvolution.canary.list.invalidate();
      onOpenChange(false);
      setModelId(''); setTargetVersion(''); setInitialPercent('5');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">创建金丝雀部署</DialogTitle>
          <DialogDescription className="text-zinc-400">渐进式发布新模型版本到生产环境</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 text-xs">模型 ID</Label>
              <Input value={modelId} onChange={e => setModelId(e.target.value)} placeholder="model-v3.2"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-300 text-xs">目标版本</Label>
              <Input value={targetVersion} onChange={e => setTargetVersion(e.target.value)} placeholder="v3.2.0"
                className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-zinc-300 text-xs">初始流量百分比 (%)</Label>
            <Input type="number" value={initialPercent} onChange={e => setInitialPercent(e.target.value)} min={1} max={50}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 mt-1 w-32" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">取消</Button>
          <Button
            onClick={() => createMutation.mutate({
              modelId, targetVersion, initialTrafficPercent: Number(initialPercent),
            })}
            disabled={!modelId || !targetVersion || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建部署'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 部署详情面板 ─── */
function DeploymentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const detail = trpc.evoEvolution.canary.get.useQuery({ id });
  const utils = trpc.useUtils();
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const rollbackMutation = trpc.evoEvolution.canary.rollback.useMutation({
    onSuccess: () => { utils.evoEvolution.canary.get.invalidate({ id }); utils.evoEvolution.canary.list.invalidate(); },
  });
  const promoteMutation = trpc.evoEvolution.canary.promote.useMutation({
    onSuccess: () => { utils.evoEvolution.canary.get.invalidate({ id }); utils.evoEvolution.canary.list.invalidate(); },
  });

  const d = detail.data?.deployment;
  const stages = detail.data?.stages ?? [];
  const healthChecks = detail.data?.healthChecks ?? [];

  if (!d) return <div className="p-6 text-zinc-500">加载中...</div>;

  const stageData = stages.map((s: any) => ({
    name: s.stageName ?? s.stage ?? `阶段 ${s.stageNumber}`,
    status: s.status ?? 'pending',
    startedAt: s.startedAt,
    completedAt: s.completedAt,
  }));

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">部署 #{d.id}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{d.modelId} → {d.targetVersion} · 创建于 {d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status ?? 'pending'} />
          {d.status === 'active' && (
            <>
              <Button size="sm" onClick={() => setPromoteOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                全量提升
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRollbackOpen(true)}>回滚</Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700 text-zinc-400">关闭</Button>
        </div>
      </div>

      {/* 指标 */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="模型 ID" value={d.modelId ?? '-'} />
        <MetricCard label="目标版本" value={d.targetVersion ?? '-'} />
        <MetricCard label="当前流量" value={`${d.currentTrafficPercent ?? 0}%`} />
        <MetricCard label="当前阶段" value={d.currentStage ?? '-'} />
      </div>

      {/* 阶段时间线 */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 mb-3">部署阶段</h4>
        <StageTimeline stages={stageData} />
      </div>

      {/* 健康检查 */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 mb-3">健康检查记录</h4>
        <HealthCheckTable checks={healthChecks} />
      </div>

      <ConfirmDialog
        open={rollbackOpen} onOpenChange={setRollbackOpen}
        title="确认回滚部署" description={`将回滚部署 #${d.id}（${d.modelId} ${d.targetVersion}），恢复到之前的版本`}
        confirmLabel="确认回滚" variant="destructive" requireReason
        onConfirm={(reason) => rollbackMutation.mutate({ id, reason: reason ?? '' })}
      />
      <ConfirmDialog
        open={promoteOpen} onOpenChange={setPromoteOpen}
        title="确认全量提升" description={`将 ${d.modelId} ${d.targetVersion} 提升为 100% 流量`}
        confirmLabel="确认提升"
        onConfirm={() => promoteMutation.mutate({ id })}
      />
    </div>
  );
}

/* ─── 主页面 ─── */
export default function CanaryDeployConsole() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = trpc.evoEvolution.canary.list.useQuery({ limit: 50 }, { refetchInterval: 10000 });

  const deployments = listQuery.data?.deployments ?? [];

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">金丝雀部署控制台</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Canary Deploy · 渐进式模型发布与回滚</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ 创建部署</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总部署数" value={deployments.length} />
        <MetricCard label="活跃部署" value={deployments.filter(d => d.status === 'active').length} />
        <MetricCard label="已完成" value={deployments.filter(d => d.status === 'completed').length} />
        <MetricCard label="已回滚" value={deployments.filter(d => d.status === 'rolled_back').length} />
      </div>

      {selectedId && <DeploymentDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="部署列表" />
        <DataTable
          data={deployments}
          onRowClick={(row) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'modelId', label: '模型', render: (r) => <span className="text-zinc-200 font-medium">{r.modelId}</span> },
            { key: 'targetVersion', label: '目标版本' },
            { key: 'currentStage', label: '当前阶段', width: '100px' },
            { key: 'currentTrafficPercent', label: '流量%', width: '80px', render: (r) => <span className="tabular-nums">{r.currentTrafficPercent ?? 0}%</span> },
            { key: 'status', label: '状态', width: '100px', render: (r) => <StatusBadge status={r.status ?? 'pending'} /> },
            { key: 'createdAt', label: '创建时间', render: (r) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无金丝雀部署"
        />
      </div>

      <CreateDeployDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
