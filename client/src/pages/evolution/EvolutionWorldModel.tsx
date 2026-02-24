/**
 * ============================================================================
 * 神经世界模型管理 — Phase 5
 * ============================================================================
 * 2 个 Tab: 模型版本管理 | 训练任务
 * 后端路由: evoEvolution.deepAI.worldModel.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, SectionHeader, EmptyState, DataTable, ConfirmDialog } from '@/components/evolution';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  Brain, Box, Cpu, Database, GitBranch, Layers, Play, Plus, RefreshCw,
  Settings, Trash2, TrendingUp, Zap, Archive, CheckCircle, Clock,
  AlertTriangle, XCircle, Eye,
} from 'lucide-react';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  training: { label: '训练中', variant: 'default' },
  validating: { label: '验证中', variant: 'outline' },
  active: { label: '已激活', variant: 'default' },
  deprecated: { label: '已弃用', variant: 'destructive' },
  archived: { label: '已归档', variant: 'secondary' },
};

const ARCH_MAP: Record<string, string> = {
  transformer: 'Transformer',
  ssm: 'SSM (Mamba)',
  hybrid: 'Hybrid',
  diffusion: 'Diffusion',
};

const TRAINING_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: '排队中', variant: 'secondary' },
  running: { label: '运行中', variant: 'default' },
  completed: { label: '已完成', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
  cancelled: { label: '已取消', variant: 'secondary' },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模型版本管理 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ModelVersionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [archFilter, setArchFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    modelName: '', version: '1.0.0', architecture: 'transformer',
    description: '', parameterCount: '', trainingDataSize: '',
    inputDimensions: '', outputDimensions: '',
    predictionHorizonMin: '', predictionHorizonMax: '',
    learningRate: '0.001', batchSize: '32', epochs: '100',
    optimizer: 'AdamW', lossFunction: 'MSE',
  });

  const versionsQuery = trpc.evoEvolution.deepAI.worldModel.listVersions.useQuery({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    architecture: archFilter !== 'all' ? archFilter : undefined,
    limit: 50,
  }, { retry: 1 });
  const statsQuery = trpc.evoEvolution.deepAI.worldModel.getStats.useQuery(undefined, { retry: 1 });
  const detailQuery = trpc.evoEvolution.deepAI.worldModel.getVersion.useQuery(
    { id: selectedId! }, { enabled: Boolean(selectedId), retry: 1 }
  );

  const createMut = trpc.evoEvolution.deepAI.worldModel.createVersion.useMutation({
    onSuccess: () => { versionsQuery.refetch(); statsQuery.refetch(); setShowCreate(false); },
  });
  const updateStatusMut = trpc.evoEvolution.deepAI.worldModel.updateStatus.useMutation({
    onSuccess: () => { versionsQuery.refetch(); statsQuery.refetch(); },
  });
  const deleteMut = trpc.evoEvolution.deepAI.worldModel.deleteVersion.useMutation({
    onSuccess: () => { versionsQuery.refetch(); statsQuery.refetch(); setSelectedId(null); },
  });

  const stats = statsQuery.data;
  const versions = versionsQuery.data?.items ?? [];
  const detail = detailQuery.data;

  // 架构分布饼图数据
  const archChartData = useMemo(() => {
    if (!stats?.architectures) return [];
    return Object.entries(stats.architectures).map(([name, value]) => ({
      name: ARCH_MAP[name] || name, value,
    }));
  }, [stats]);

  const handleCreate = () => {
    createMut.mutate({
      modelName: form.modelName,
      version: form.version,
      architecture: form.architecture,
      description: form.description || undefined,
      parameterCount: form.parameterCount ? Number(form.parameterCount) : undefined,
      trainingDataSize: form.trainingDataSize ? Number(form.trainingDataSize) : undefined,
      inputDimensions: form.inputDimensions ? Number(form.inputDimensions) : undefined,
      outputDimensions: form.outputDimensions ? Number(form.outputDimensions) : undefined,
      predictionHorizonMin: form.predictionHorizonMin ? Number(form.predictionHorizonMin) : undefined,
      predictionHorizonMax: form.predictionHorizonMax ? Number(form.predictionHorizonMax) : undefined,
      trainingConfig: {
        learningRate: Number(form.learningRate),
        batchSize: Number(form.batchSize),
        epochs: Number(form.epochs),
        optimizer: form.optimizer,
        lossFunction: form.lossFunction,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="模型版本总数" value={stats?.totalVersions ?? 0} icon={<Layers className="w-4 h-4" />} />
        <StatCard label="已激活版本" value={stats?.activeVersions ?? 0} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard label="训练任务" value={stats?.trainingJobs ?? 0} icon={<Cpu className="w-4 h-4 text-blue-500" />} />
        <StatCard label="运行中训练" value={stats?.runningJobs ?? 0} icon={<Play className="w-4 h-4 text-amber-500" />} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：模型列表 */}
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader title="模型版本" />
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={archFilter} onValueChange={setArchFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部架构</SelectItem>
                  {Object.entries(ARCH_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-1" />新建版本
              </Button>
            </div>
          </div>

          {versions.length === 0 ? (
            <EmptyState message="暂无模型版本，点击「新建版本」创建第一个神经世界模型" />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {versions.map((v: any) => (
                  <div
                    key={v.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === v.id ? 'border-primary bg-muted/30' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Brain className="w-5 h-5 text-indigo-500" />
                        <div>
                          <div className="font-medium">{String(v.modelName)}</div>
                          <div className="text-xs text-muted-foreground">
                            v{String(v.version)} · {ARCH_MAP[v.architecture as string] || String(v.architecture)}
                            {v.parameterCount ? ` · ${(Number(v.parameterCount) / 1e6).toFixed(1)}M 参数` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_MAP[v.status as string]?.variant ?? 'secondary'}>
                          {STATUS_MAP[v.status as string]?.label ?? String(v.status)}
                        </Badge>
                        <div className="flex gap-1">
                          {v.status === 'draft' && (
                            <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); updateStatusMut.mutate({ id: v.id as number, status: 'active' }); }}>
                              <CheckCircle className="w-3 h-3 mr-1" />激活
                            </Button>
                          )}
                          {v.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={(e: React.MouseEvent) => { e.stopPropagation(); updateStatusMut.mutate({ id: v.id as number, status: 'deprecated' }); }}>
                              <Archive className="w-3 h-3 mr-1" />弃用
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteMut.mutate({ id: v.id as number }); }}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* 右侧：详情 + 架构分布 */}
        <div className="space-y-4">
          {archChartData.length > 0 && (
            <div className="border rounded-lg p-4">
              <div className="text-sm font-medium mb-3">架构分布</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={archChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {archChartData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {detail && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="text-sm font-medium">模型详情</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">名称</span><span>{String(detail.modelName)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">版本</span><span>v{String(detail.version)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">架构</span><span>{ARCH_MAP[detail.architecture as string] || String(detail.architecture)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">参数量</span><span>{detail.parameterCount ? `${(Number(detail.parameterCount) / 1e6).toFixed(1)}M` : '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">训练数据</span><span>{detail.trainingDataSize ? `${(Number(detail.trainingDataSize) / 1e6).toFixed(1)}M` : '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">输入维度</span><span>{detail.inputDimensions ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">输出维度</span><span>{detail.outputDimensions ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">预测步长</span><span>{detail.predictionHorizonMin ?? '-'} ~ {detail.predictionHorizonMax ?? '-'} min</span></div>
                {detail.performanceMetrics && (
                  <>
                    <div className="border-t pt-2 mt-2 font-medium">性能指标</div>
                    {Object.entries(detail.performanceMetrics as Record<string, number>).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span>{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                      </div>
                    ))}
                  </>
                )}
                {detail.trainingConfig && (
                  <>
                    <div className="border-t pt-2 mt-2 font-medium">训练配置</div>
                    {Object.entries(detail.trainingConfig as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </>
                )}
                {Boolean(detail.tags) && (detail.tags as string[]).length > 0 && (
                  <div className="flex gap-1 flex-wrap pt-2">
                    {(detail.tags as string[]).map((t: string) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 新建模型版本对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建神经世界模型版本</DialogTitle>
            <DialogDescription>定义模型架构、参数和训练配置</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-2 gap-4 p-1">
              <div className="space-y-2">
                <label className="text-sm font-medium">模型名称 *</label>
                <Input value={form.modelName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, modelName: e.target.value }))} placeholder="例: IndustrialWorldModel" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">版本号 *</label>
                <Input value={form.version} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, version: e.target.value }))} placeholder="例: 1.0.0" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">架构 *</label>
                <Select value={form.architecture} onValueChange={(v: string) => setForm(f => ({ ...f, architecture: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ARCH_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">参数量</label>
                <Input type="number" value={form.parameterCount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, parameterCount: e.target.value }))} placeholder="例: 100000000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">训练数据量</label>
                <Input type="number" value={form.trainingDataSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, trainingDataSize: e.target.value }))} placeholder="例: 50000000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">输入维度</label>
                <Input type="number" value={form.inputDimensions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, inputDimensions: e.target.value }))} placeholder="例: 256" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">输出维度</label>
                <Input type="number" value={form.outputDimensions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, outputDimensions: e.target.value }))} placeholder="例: 128" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">预测步长 (min)</label>
                <div className="flex gap-2">
                  <Input type="number" value={form.predictionHorizonMin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, predictionHorizonMin: e.target.value }))} placeholder="最小" />
                  <Input type="number" value={form.predictionHorizonMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, predictionHorizonMax: e.target.value }))} placeholder="最大" />
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">描述</label>
                <Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="模型描述..." />
              </div>
              <div className="col-span-2 border-t pt-3 mt-2">
                <div className="text-sm font-medium mb-3">训练配置</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">学习率</label>
                    <Input value={form.learningRate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, learningRate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Batch Size</label>
                    <Input value={form.batchSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, batchSize: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Epochs</label>
                    <Input value={form.epochs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, epochs: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">优化器</label>
                    <Select value={form.optimizer} onValueChange={(v: string) => setForm(f => ({ ...f, optimizer: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AdamW">AdamW</SelectItem>
                        <SelectItem value="Adam">Adam</SelectItem>
                        <SelectItem value="SGD">SGD</SelectItem>
                        <SelectItem value="LAMB">LAMB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">损失函数</label>
                    <Select value={form.lossFunction} onValueChange={(v: string) => setForm(f => ({ ...f, lossFunction: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MSE">MSE</SelectItem>
                        <SelectItem value="MAE">MAE</SelectItem>
                        <SelectItem value="Huber">Huber</SelectItem>
                        <SelectItem value="CrossEntropy">CrossEntropy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!form.modelName || !form.version || createMut.isPending}>
              {createMut.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 训练任务 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TrainingJobsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    modelVersionId: '', trainingType: 'full', gpuCount: '1', gpuType: 'A100', totalEpochs: '100',
  });

  const jobsQuery = trpc.evoEvolution.deepAI.worldModel.listTrainingJobs.useQuery({
    status: statusFilter !== 'all' ? statusFilter : undefined,
  }, { retry: 1 });
  const versionsQuery = trpc.evoEvolution.deepAI.worldModel.listVersions.useQuery(undefined, { retry: 1 });

  const createMut = trpc.evoEvolution.deepAI.worldModel.createTrainingJob.useMutation({
    onSuccess: () => { jobsQuery.refetch(); setShowCreate(false); },
  });
  const updateMut = trpc.evoEvolution.deepAI.worldModel.updateTrainingJob.useMutation({
    onSuccess: () => { jobsQuery.refetch(); },
  });

  const jobs = jobsQuery.data ?? [];
  const versions = versionsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="训练任务" />
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(TRAINING_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />新建训练
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState message="暂无训练任务，点击「新建训练」启动世界模型训练" />
      ) : (
        <div className="space-y-3">
          {jobs.map((j: any) => {
            const version = versions.find((v: any) => v.id === j.modelVersionId);
            return (
              <div key={j.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="font-medium">训练任务 #{String(j.id)}</div>
                      <div className="text-xs text-muted-foreground">
                        模型: {version ? String(version.modelName) : `ID:${String(j.modelVersionId)}`}
                        {' · '}{String(j.trainingType)}
                        {j.gpuType ? ` · ${String(j.gpuCount)}x ${String(j.gpuType)}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={TRAINING_STATUS[j.status as string]?.variant ?? 'secondary'}>
                      {TRAINING_STATUS[j.status as string]?.label ?? String(j.status)}
                    </Badge>
                    {j.status === 'queued' && (
                      <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: j.id as number, status: 'running' })}>
                        <Play className="w-3 h-3 mr-1" />启动
                      </Button>
                    )}
                    {j.status === 'running' && (
                      <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: j.id as number, status: 'cancelled' })}>
                        <XCircle className="w-3 h-3 mr-1" />取消
                      </Button>
                    )}
                  </div>
                </div>
                {/* 进度条 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>进度: {j.currentEpoch ?? 0}/{j.totalEpochs ?? '?'} epochs</span>
                    <span>{j.progress ?? 0}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${Math.min(j.progress ?? 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>当前 Loss: {j.currentLoss != null ? Number(j.currentLoss).toFixed(6) : '-'}</span>
                    <span>最佳 Loss: {j.bestLoss != null ? Number(j.bestLoss).toFixed(6) : '-'}</span>
                  </div>
                </div>
                {j.errorMessage && (
                  <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">{String(j.errorMessage)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新建训练对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建训练任务</DialogTitle>
            <DialogDescription>选择模型版本和训练配置</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">目标模型版本 *</label>
              <Select value={form.modelVersionId} onValueChange={(v: string) => setForm(f => ({ ...f, modelVersionId: v }))}>
                <SelectTrigger><SelectValue placeholder="选择模型版本" /></SelectTrigger>
                <SelectContent>
                  {versions.map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{String(v.modelName)} v{String(v.version)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">训练类型</label>
              <Select value={form.trainingType} onValueChange={(v: string) => setForm(f => ({ ...f, trainingType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">全量训练</SelectItem>
                  <SelectItem value="finetune">微调</SelectItem>
                  <SelectItem value="incremental">增量训练</SelectItem>
                  <SelectItem value="distillation">蒸馏</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">GPU 数量</label>
                <Input type="number" value={form.gpuCount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, gpuCount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GPU 类型</label>
                <Select value={form.gpuType} onValueChange={(v: string) => setForm(f => ({ ...f, gpuType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A100">A100 80GB</SelectItem>
                    <SelectItem value="H100">H100 80GB</SelectItem>
                    <SelectItem value="V100">V100 32GB</SelectItem>
                    <SelectItem value="RTX4090">RTX 4090 24GB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">总 Epochs</label>
              <Input type="number" value={form.totalEpochs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, totalEpochs: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({
              modelVersionId: Number(form.modelVersionId),
              trainingType: form.trainingType,
              gpuCount: Number(form.gpuCount),
              gpuType: form.gpuType,
              totalEpochs: Number(form.totalEpochs),
            })} disabled={!form.modelVersionId || createMut.isPending}>
              {createMut.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function EvolutionWorldModel() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-indigo-500" />
            神经世界模型管理
          </h1>
          <p className="text-muted-foreground mt-1">
            管理神经世界模型的版本、训练和部署生命周期
          </p>
        </div>

        <Tabs defaultValue="versions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="versions">
              <Layers className="w-4 h-4 mr-1" />模型版本
            </TabsTrigger>
            <TabsTrigger value="training">
              <Cpu className="w-4 h-4 mr-1" />训练任务
            </TabsTrigger>
          </TabsList>

          <TabsContent value="versions"><ModelVersionsTab /></TabsContent>
          <TabsContent value="training"><TrainingJobsTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
