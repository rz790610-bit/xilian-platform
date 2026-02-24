/**
 * ============================================================================
 * 多模型横向对比 — Phase 5
 * ============================================================================
 * 2 个 Tab: 模型注册表 | 对比分析
 * 后端路由: evoEvolution.deepAI.modelComparison.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, SectionHeader, EmptyState, DataTable } from '@/components/evolution';
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
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import {
  BarChart3, GitCompare, Layers, Plus, Play, RefreshCw, Settings,
  Trash2, TrendingUp, Zap, CheckCircle, Clock, Eye, Star,
  ArrowUpDown, Target, Activity, Shield,
} from 'lucide-react';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  registered: { label: '已注册', variant: 'secondary' },
  evaluating: { label: '评估中', variant: 'outline' },
  active: { label: '活跃', variant: 'default' },
  champion: { label: '冠军', variant: 'default' },
  retired: { label: '已退役', variant: 'destructive' },
};

const COMP_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待执行', variant: 'secondary' },
  running: { label: '运行中', variant: 'outline' },
  completed: { label: '已完成', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模型注册表 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ModelRegistryTab() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    modelName: '', modelType: 'perception', version: '1.0.0',
    framework: 'PyTorch', description: '',
    accuracy: '', latencyMs: '', interventionRate: '', stabilityScore: '',
  });

  const modelsQuery = trpc.evoEvolution.deepAI.modelRegistry.list.useQuery({
    status: statusFilter !== 'all' ? statusFilter : undefined,
  }, { retry: 1 });

  const createMut = trpc.evoEvolution.deepAI.modelRegistry.register.useMutation({
    onSuccess: () => { modelsQuery.refetch(); setShowCreate(false); },
  });
  const updateMut = trpc.evoEvolution.deepAI.modelRegistry.updateStatus.useMutation({
    onSuccess: () => { modelsQuery.refetch(); },
  });
  const deleteMut = trpc.evoEvolution.deepAI.modelRegistry.delete.useMutation({
    onSuccess: () => { modelsQuery.refetch(); },
  });

  const models = ((modelsQuery.data as any)?.items ?? []) as any[];

  // 模型类型统计
  const typeStats = useMemo(() => {
    const map: Record<string, number> = {};
    models.forEach((m: any) => { map[m.modelType as string] = (map[m.modelType as string] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [models]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="注册模型总数" value={models.length} icon={<Layers className="w-4 h-4" />} />
        <StatCard label="冠军模型" value={models.filter((m: any) => m.status === 'champion').length} icon={<Star className="w-4 h-4 text-amber-500" />} />
        <StatCard label="活跃模型" value={models.filter((m: any) => m.status === 'active').length} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard label="评估中" value={models.filter((m: any) => m.status === 'evaluating').length} icon={<Clock className="w-4 h-4 text-blue-500" />} />
      </div>

      <div className="flex items-center justify-between">
        <SectionHeader title="模型注册表" />
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
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />注册模型
          </Button>
        </div>
      </div>

      {models.length === 0 ? (
        <EmptyState message="暂无注册模型，点击「注册模型」添加第一个模型到注册表" />
      ) : (
        <div className="space-y-2">
          {models.map((m: any) => (
            <div key={m.id} className="p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.status === 'champion' ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                    {m.status === 'champion' ? <Star className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {String(m.modelName)}
                      <Badge variant="outline" className="text-xs">{String(m.modelType)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      v{String(m.version)} · {String(m.framework)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* 性能指标 */}
                  <div className="flex gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">精度</div>
                      <div className="font-medium">{m.accuracy != null ? `${(Number(m.accuracy) * 100).toFixed(1)}%` : '-'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">延迟</div>
                      <div className="font-medium">{m.latencyMs != null ? `${Number(m.latencyMs).toFixed(0)}ms` : '-'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">干预率</div>
                      <div className="font-medium">{m.interventionRate != null ? `${(Number(m.interventionRate) * 100).toFixed(1)}%` : '-'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">稳定性</div>
                      <div className="font-medium">{m.stabilityScore != null ? Number(m.stabilityScore).toFixed(2) : '-'}</div>
                    </div>
                  </div>
                  <Badge variant={STATUS_MAP[m.status as string]?.variant ?? 'secondary'}>
                    {STATUS_MAP[m.status as string]?.label ?? String(m.status)}
                  </Badge>
                  <div className="flex gap-1">
                    {m.status !== 'champion' && m.status !== 'retired' && (
                      <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: m.id as number, status: 'champion' })}>
                        <Star className="w-3 h-3 mr-1" />设为冠军
                      </Button>
                    )}
                    {m.status !== 'retired' && (
                      <Button size="sm" variant="ghost" onClick={() => updateMut.mutate({ id: m.id as number, status: 'retired' })}>
                        退役
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate({ id: m.id as number })}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 注册模型对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>注册新模型</DialogTitle>
            <DialogDescription>将模型添加到注册表以进行横向对比</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">模型名称 *</label>
                <Input value={form.modelName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, modelName: e.target.value }))} placeholder="例: PerceptionNet-v3" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">版本 *</label>
                <Input value={form.version} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, version: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模型类型</label>
                <Select value={form.modelType} onValueChange={(v: string) => setForm(f => ({ ...f, modelType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perception">感知模型</SelectItem>
                    <SelectItem value="prediction">预测模型</SelectItem>
                    <SelectItem value="planning">规划模型</SelectItem>
                    <SelectItem value="control">控制模型</SelectItem>
                    <SelectItem value="world_model">世界模型</SelectItem>
                    <SelectItem value="fusion">融合模型</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">框架</label>
                <Select value={form.framework} onValueChange={(v: string) => setForm(f => ({ ...f, framework: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PyTorch">PyTorch</SelectItem>
                    <SelectItem value="TensorFlow">TensorFlow</SelectItem>
                    <SelectItem value="JAX">JAX</SelectItem>
                    <SelectItem value="ONNX">ONNX</SelectItem>
                    <SelectItem value="TensorRT">TensorRT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">性能指标（可选）</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">精度 (0~1)</label>
                  <Input type="number" step="0.01" value={form.accuracy} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, accuracy: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">延迟 (ms)</label>
                  <Input type="number" value={form.latencyMs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, latencyMs: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">干预率 (0~1)</label>
                  <Input type="number" step="0.01" value={form.interventionRate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, interventionRate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">稳定性 (0~1)</label>
                  <Input type="number" step="0.01" value={form.stabilityScore} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, stabilityScore: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({
              modelName: form.modelName,
              modelVersion: form.version,
              modelType: form.modelType,
              framework: form.framework,
              description: form.description || undefined,
              metrics: {
                accuracy: form.accuracy ? Number(form.accuracy) : undefined,
                latencyP50Ms: form.latencyMs ? Number(form.latencyMs) : undefined,
                interventionRate: form.interventionRate ? Number(form.interventionRate) : undefined,
                stabilityScore: form.stabilityScore ? Number(form.stabilityScore) : undefined,
              },
            })} disabled={!form.modelName || createMut.isPending}>
              {createMut.isPending ? '注册中...' : '注册'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 对比分析 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ComparisonAnalysisTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', modelIds: '' });

  const comparisonsQuery = trpc.evoEvolution.deepAI.modelRegistry.listComparisons.useQuery(undefined, { retry: 1 });
  const modelsQuery = trpc.evoEvolution.deepAI.modelRegistry.list.useQuery(undefined, { retry: 1 });
  const detailQuery = trpc.evoEvolution.deepAI.modelRegistry.getComparison.useQuery(
    { id: selectedId! }, { enabled: Boolean(selectedId), retry: 1 }
  );

  const createMut = trpc.evoEvolution.deepAI.modelRegistry.createComparison.useMutation({
    onSuccess: () => { comparisonsQuery.refetch(); setShowCreate(false); },
  });
  // runComparison 不存在，对比在 createComparison 时自动执行
  // 使用 deleteComparison + 重新创建来模拟重新执行
  const deleteMut = trpc.evoEvolution.deepAI.modelRegistry.deleteComparison.useMutation({
    onSuccess: () => { comparisonsQuery.refetch(); setSelectedId(null); },
  });

  const comparisons = (comparisonsQuery.data ?? []) as any[];
  const models = ((modelsQuery.data as any)?.items ?? []) as any[];
  const detail = detailQuery.data;

  // 雷达图数据
  const radarData = useMemo(() => {
    if (!detail?.results) return [];
    const results = detail.results as any;
    if (!results.models || !Array.isArray(results.models)) return [];
    const dimensions = ['accuracy', 'latency', 'interventionRate', 'stability', 'overall'];
    const dimLabels: Record<string, string> = {
      accuracy: '精度', latency: '延迟(反)', interventionRate: '干预率(反)',
      stability: '稳定性', overall: '综合',
    };
    return dimensions.map(dim => {
      const point: Record<string, unknown> = { dimension: dimLabels[dim] || dim };
      (results.models as any[]).forEach((m: any, i: number) => {
        let val = m.scores?.[dim] ?? 0;
        // 反转延迟和干预率（越低越好）
        if (dim === 'latency' || dim === 'interventionRate') val = 1 - val;
        point[`model_${i}`] = (Number(val) * 100).toFixed(1);
      });
      return point;
    });
  }, [detail]);

  // 柱状图数据
  const barData = useMemo(() => {
    if (!detail?.results) return [];
    const results = detail.results as any;
    if (!results.models || !Array.isArray(results.models)) return [];
    return (results.models as any[]).map((m: any) => ({
      name: String(m.modelName ?? '').substring(0, 15),
      accuracy: ((m.scores?.accuracy ?? 0) * 100).toFixed(1),
      latency: m.scores?.latency ?? 0,
      stability: ((m.scores?.stability ?? 0) * 100).toFixed(1),
      overall: ((m.scores?.overall ?? 0) * 100).toFixed(1),
    }));
  }, [detail]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="对比分析" />
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />新建对比
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：对比列表 */}
        <div className="space-y-2">
          {comparisons.length === 0 ? (
            <EmptyState message="暂无对比任务，创建对比任务以分析模型差异" />
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {comparisons.map((c: any) => (
                  <div
                    key={c.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === c.id ? 'border-primary bg-muted/30' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-sm">{String(c.name)}</div>
                      <Badge variant={COMP_STATUS[c.status as string]?.variant ?? 'secondary'} className="text-xs">
                        {COMP_STATUS[c.status as string]?.label ?? String(c.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Array.isArray(c.modelIds) ? `${(c.modelIds as number[]).length} 个模型` : '-'}
                      {c.winnerId ? ` · 胜出: #${String(c.winnerId)}` : ''}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {c.status === 'pending' && (
                        <Badge variant="outline" className="text-xs">待处理</Badge>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteMut.mutate({ id: c.id as number }); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* 右侧：对比结果 */}
        <div className="col-span-2 space-y-4">
          {detail && detail.status === 'completed' && detail.results ? (
            <>
              {/* 雷达图 */}
              {radarData.length > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium mb-3">多维度对比雷达图</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} />
                      {((detail.results as any).models as any[] || []).map((_: any, i: number) => (
                        <Radar
                          key={i}
                          name={String(_.modelName ?? `模型${i + 1}`)}
                          dataKey={`model_${i}`}
                          stroke={COLORS[i % COLORS.length]}
                          fill={COLORS[i % COLORS.length]}
                          fillOpacity={0.15}
                        />
                      ))}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 综合得分柱状图 */}
              {barData.length > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium mb-3">综合得分对比</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="overall" name="综合得分" fill="#6366f1" />
                      <Bar dataKey="accuracy" name="精度" fill="#22c55e" />
                      <Bar dataKey="stability" name="稳定性" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 胜出者 */}
              {(detail.results as any).winner && (
                <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    <span className="font-medium">胜出模型: {String((detail.results as any).winner?.modelName ?? '-')}</span>
                    <Badge variant="default">综合得分: {((detail.results as any).winner?.overallScore * 100)?.toFixed(1) ?? '-'}%</Badge>
                  </div>
                  {(detail.results as any).recommendation && (
                    <p className="text-sm text-muted-foreground mt-2">{String((detail.results as any).recommendation)}</p>
                  )}
                </div>
              )}
            </>
          ) : detail ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              {detail.status === 'pending' ? '对比任务待执行，请点击「执行」按钮' :
               detail.status === 'running' ? '对比分析运行中...' : '暂无对比结果'}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              选择左侧对比任务查看结果
            </div>
          )}
        </div>
      </div>

      {/* 新建对比对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建对比分析</DialogTitle>
            <DialogDescription>选择多个模型进行横向对比</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">对比名称 *</label>
              <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: Q1 感知模型对比" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">参与模型（勾选）</label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {models.map((m: any) => {
                  const ids = form.modelIds ? form.modelIds.split(',').filter(Boolean) : [];
                  const checked = ids.includes(String(m.id));
                  return (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            setForm(f => ({ ...f, modelIds: ids.filter(id => id !== String(m.id)).join(',') }));
                          } else {
                            setForm(f => ({ ...f, modelIds: [...ids, String(m.id)].join(',') }));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{String(m.modelName)} v{String(m.version)}</span>
                      <Badge variant="outline" className="text-xs">{String(m.modelType)}</Badge>
                    </label>
                  );
                })}
                {models.length === 0 && <div className="text-sm text-muted-foreground">请先在「模型注册表」中注册模型</div>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => {
              const ids = form.modelIds.split(',').filter(Boolean).map(Number);
              createMut.mutate({ reportName: form.name, modelIds: ids, dimensions: ['accuracy', 'latency', 'stability', 'interventionRate'] });
            }} disabled={!form.name || !form.modelIds || createMut.isPending}>
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
export default function EvolutionModelComparison() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-violet-500" />
            多模型横向对比
          </h1>
          <p className="text-muted-foreground mt-1">
            注册模型、执行多维度对比分析，识别最优模型组合
          </p>
        </div>

        <Tabs defaultValue="registry" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registry">
              <Layers className="w-4 h-4 mr-1" />模型注册表
            </TabsTrigger>
            <TabsTrigger value="comparison">
              <BarChart3 className="w-4 h-4 mr-1" />对比分析
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registry"><ModelRegistryTab /></TabsContent>
          <TabsContent value="comparison"><ComparisonAnalysisTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
