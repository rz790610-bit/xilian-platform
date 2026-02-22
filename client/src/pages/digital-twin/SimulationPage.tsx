/**
 * 数字孪生 — 仿真推演页面
 *
 * Phase 3 增强：
 *   ✅ P5-P95 带状置信区间图（仿真结果可视化）
 *   ✅ 蒙特卡洛标准差热力条
 *   ✅ 审计日志集成（后端）
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { stateLabels, riskLevelMap } from './constants';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Title, Tooltip, Legend);

// ============================================================================
// P5-P95 仿真结果置信区间图
// ============================================================================

function SimulationConfidenceBand({ result }: { result: any }) {
  const meanTraj = result?.meanTrajectory as Array<{ timestamp?: string; values: Record<string, number> }> | undefined;
  const p5Traj = result?.p5Trajectory as Array<{ values: Record<string, number> }> | undefined;
  const p95Traj = result?.p95Trajectory as Array<{ values: Record<string, number> }> | undefined;

  const dimensions = useMemo(() => {
    if (!meanTraj || meanTraj.length === 0) return [];
    return Object.keys(meanTraj[0].values);
  }, [meanTraj]);

  const [selectedDim, setSelectedDim] = useState('');

  useEffect(() => {
    if (dimensions.length > 0 && !selectedDim) setSelectedDim(dimensions[0]);
  }, [dimensions, selectedDim]);

  if (!meanTraj || !p5Traj || !p95Traj || dimensions.length === 0) return null;

  const labels = meanTraj.map((_, i) => `T+${i}`);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium">置信区间</span>
        <select
          className="text-[10px] bg-background border border-border rounded px-1 h-5"
          value={selectedDim}
          onChange={e => setSelectedDim(e.target.value)}
        >
          {dimensions.map(d => (
            <option key={d} value={d}>{stateLabels[d] ?? d}</option>
          ))}
        </select>
      </div>
      <div style={{ height: '180px' }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'P95',
                data: p95Traj.map(t => t.values[selectedDim] ?? 0),
                borderColor: 'rgba(239, 68, 68, 0.3)',
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                fill: '+1',
                tension: 0.3, pointRadius: 0, borderWidth: 1, borderDash: [3, 2],
              },
              {
                label: 'P5',
                data: p5Traj.map(t => t.values[selectedDim] ?? 0),
                borderColor: 'rgba(59, 130, 246, 0.3)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3, pointRadius: 0, borderWidth: 1, borderDash: [3, 2],
              },
              {
                label: '均值',
                data: meanTraj.map(t => t.values[selectedDim] ?? 0),
                borderColor: 'rgba(34, 197, 94, 0.8)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3, pointRadius: 0, borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { font: { size: 8 }, usePointStyle: true } },
              tooltip: { mode: 'index', intersect: false },
            },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 8 } }, grid: { display: false } },
              y: { ticks: { font: { size: 8 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 主页面
// ============================================================================

export default function SimulationPage({ equipmentId }: { equipmentId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const scenariosQuery = trpc.evoPipeline.simulation.list.useQuery(
    { machineId: equipmentId }, { refetchInterval: 5000, retry: 2 },
  );

  const compareQuery = trpc.evoPipeline.simulation.compare.useQuery(
    { scenarioIds: compareIds },
    { enabled: showCompare && compareIds.length >= 2 },
  );

  const createMutation = trpc.evoPipeline.simulation.create.useMutation({
    onSuccess: () => { scenariosQuery.refetch(); toast.success('仿真场景创建成功'); setCreateOpen(false); },
    onError: (e: any) => toast.error(`创建失败: ${e.message}`),
  });

  const executeMutation = trpc.evoPipeline.simulation.execute.useMutation({
    onSuccess: (data: any) => { scenariosQuery.refetch(); toast.success(`仿真任务已入队: ${data.taskId}`); },
    onError: (e: any) => toast.error(`执行失败: ${e.message}`),
  });

  const deleteMutation = trpc.evoPipeline.simulation.delete.useMutation({
    onSuccess: () => { scenariosQuery.refetch(); toast.success('场景已删除'); },
    onError: (e: any) => toast.error(`删除失败: ${e.message}`),
  });

  const scenarios: any[] = scenariosQuery.data ?? [];

  const toggleCompare = useCallback((id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) { toast.warning('最多选择 5 个场景对比'); return prev; }
      return [...prev, id];
    });
  }, []);

  // 获取选中场景的详细结果
  const detailScenario = detailId ? scenarios.find((s: any) => s.id === detailId) : null;

  return (
    <div className="space-y-2">
      {/* 操作栏 */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>+ 创建场景</Button>
        {compareIds.length >= 2 && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCompare(true)}>
            对比 ({compareIds.length})
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">共 {scenarios.length} 个场景</span>
      </div>

      {/* 场景列表 */}
      {scenarios.length === 0 ? (
        <PageCard>
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">暂无仿真场景</p>
            <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setCreateOpen(true)}>创建第一个仿真场景</Button>
          </div>
        </PageCard>
      ) : (
        <PageCard noPadding>
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1 w-8">对比</TableHead>
                  <TableHead className="text-[10px] py-1">名称</TableHead>
                  <TableHead className="text-[10px] py-1">设备</TableHead>
                  <TableHead className="text-[10px] py-1">状态</TableHead>
                  <TableHead className="text-[10px] py-1">风险</TableHead>
                  <TableHead className="text-[10px] py-1">MC 采样</TableHead>
                  <TableHead className="text-[10px] py-1">创建时间</TableHead>
                  <TableHead className="text-right text-[10px] py-1">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((s: any) => (
                  <TableRow key={s.id} className={detailId === s.id ? 'bg-muted/50' : ''}>
                    <TableCell className="py-0.5">
                      <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} className="w-3 h-3" disabled={s.status !== 'completed'} />
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 font-medium">
                      <button className="hover:underline text-left" onClick={() => setDetailId(detailId === s.id ? null : s.id)}>
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 font-mono">{s.machineId}</TableCell>
                    <TableCell className="py-0.5">
                      <Badge
                        variant={s.status === 'completed' ? 'default' : s.status === 'running' ? 'secondary' : s.status === 'failed' ? 'destructive' : 'outline'}
                        className="text-[9px]"
                      >
                        {s.status === 'completed' ? '已完成' : s.status === 'running' ? '运行中' : s.status === 'failed' ? '失败' : '草稿'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-0.5">
                      {s.latestResult ? (
                        <Badge variant={riskLevelMap[s.latestResult.riskLevel]?.color ?? 'default'} className="text-[9px]">
                          {riskLevelMap[s.latestResult.riskLevel]?.label ?? s.latestResult.riskLevel}
                        </Badge>
                      ) : <span className="text-[10px] text-muted-foreground">--</span>}
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 font-mono">{s.monteCarloRuns ?? '--'}</TableCell>
                    <TableCell className="text-[10px] py-0.5 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right py-0.5">
                      <div className="flex gap-0.5 justify-end">
                        {(s.status === 'draft' || s.status === 'completed' || s.status === 'failed') && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5"
                            onClick={() => executeMutation.mutate({ scenarioId: s.id })}
                            disabled={executeMutation.isPending}
                          >
                            {s.status === 'draft' ? '执行' : '重新执行'}
                          </Button>
                        )}
                        {s.status !== 'running' && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-destructive"
                            onClick={() => { if (confirm(`确定删除场景 "${s.name}"？`)) deleteMutation.mutate({ scenarioId: s.id }); }}
                          >
                            删除
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </PageCard>
      )}

      {/* 场景详情 — P5-P95 置信区间 */}
      {detailScenario?.latestResult && (
        <PageCard title={`场景详情: ${detailScenario.name}`} compact
          action={<Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setDetailId(null)}>关闭</Button>}
        >
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <span className="text-muted-foreground">风险等级: </span>
                <Badge variant={riskLevelMap[detailScenario.latestResult.riskLevel]?.color ?? 'default'} className="text-[8px]">
                  {riskLevelMap[detailScenario.latestResult.riskLevel]?.label ?? detailScenario.latestResult.riskLevel}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">蒙特卡洛: </span>
                <span className="font-mono">{detailScenario.latestResult.monteCarloRuns ?? detailScenario.monteCarloRuns} runs</span>
              </div>
              <div>
                <span className="text-muted-foreground">方法: </span>
                <span className="font-mono">{detailScenario.latestResult.method ?? detailScenario.method}</span>
              </div>
            </div>

            {/* P5-P95 带状图 */}
            <SimulationConfidenceBand result={detailScenario.latestResult} />

            {/* 标准差热力条 */}
            {detailScenario.latestResult.stdDevByDimension && (
              <div className="mt-2">
                <span className="text-[10px] font-medium">各维度不确定性（末步标准差）</span>
                <div className="space-y-0.5 mt-1">
                  {Object.entries(detailScenario.latestResult.stdDevByDimension as Record<string, number[]>).map(([dim, values]) => {
                    const lastStd = Array.isArray(values) ? values[values.length - 1] : 0;
                    const maxStd = Array.isArray(values) ? Math.max(...values) : 1;
                    const pct = maxStd > 0 ? Math.min(100, (lastStd / maxStd) * 100) : 0;
                    return (
                      <div key={dim} className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground w-16 truncate">{stateLabels[dim] ?? dim}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct > 70 ? 'hsl(0, 80%, 55%)' : pct > 40 ? 'hsl(45, 90%, 50%)' : 'hsl(120, 60%, 45%)',
                            }}
                          />
                        </div>
                        <span className="text-[8px] font-mono w-12 text-right">{lastStd.toFixed(4)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </PageCard>
      )}

      {/* 对比结果 */}
      {showCompare && compareQuery.data && (
        <CompareResultPanel data={compareQuery.data as any} onClose={() => { setShowCompare(false); setCompareIds([]); }} />
      )}

      {/* 创建仿真对话框 */}
      <CreateSimulationDialog
        open={createOpen} onOpenChange={setCreateOpen} equipmentId={equipmentId}
        onSubmit={(data) => createMutation.mutate(data)} isSubmitting={createMutation.isPending}
      />
    </div>
  );
}

// ============================================================================
// 仿真对比结果面板
// ============================================================================

function CompareResultPanel({ data, onClose }: { data: any; onClose: () => void }) {
  const scenarios = (data.scenarios ?? []).filter((s: any) => s.result != null);
  if (scenarios.length === 0) {
    return (
      <PageCard title="场景对比" action={<Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={onClose}>关闭</Button>}>
        <p className="text-xs text-muted-foreground text-center py-4">所选场景暂无结果数据</p>
      </PageCard>
    );
  }

  const colors = ['hsl(210, 80%, 55%)', 'hsl(340, 80%, 55%)', 'hsl(120, 60%, 45%)', 'hsl(45, 90%, 50%)', 'hsl(280, 70%, 55%)'];
  const result0 = scenarios[0].result;
  const meanTraj = result0.meanTrajectory as Array<{ values: Record<string, number> }> | undefined;
  const dimensions = meanTraj && meanTraj.length > 0 ? Object.keys(meanTraj[0].values) : [];

  return (
    <PageCard
      title={`场景对比 (${scenarios.length} 个)`}
      action={<Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={onClose}>关闭</Button>}
    >
      <div className="flex gap-2 mb-2 flex-wrap">
        {scenarios.map((s: any, i: number) => (
          <div key={s.scenarioId} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-[10px] font-medium">{s.scenarioName}</span>
            <Badge variant={riskLevelMap[s.result.riskLevel]?.color ?? 'default'} className="text-[9px]">
              {riskLevelMap[s.result.riskLevel]?.label ?? s.result.riskLevel}
            </Badge>
          </div>
        ))}
      </div>
      {dimensions.length > 0 && (
        <div style={{ height: '200px' }}>
          <Bar
            data={{
              labels: dimensions.map(d => stateLabels[d] ?? d),
              datasets: scenarios.map((s: any, i: number) => {
                const stdDev = (s.result.stdDevByDimension ?? {}) as Record<string, number[]>;
                return {
                  label: s.scenarioName,
                  data: dimensions.map(d => { const arr = stdDev[d]; return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : 0; }),
                  backgroundColor: colors[i % colors.length] + '80',
                  borderColor: colors[i % colors.length], borderWidth: 1,
                };
              }),
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'top', labels: { font: { size: 9 } } } },
              scales: { x: { ticks: { font: { size: 9 } } }, y: { title: { display: true, text: '标准差', font: { size: 9 } }, ticks: { font: { size: 9 } } } },
            }}
          />
        </div>
      )}
    </PageCard>
  );
}

// ============================================================================
// 创建仿真对话框
// ============================================================================

function CreateSimulationDialog({ open, onOpenChange, equipmentId, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void; equipmentId: string;
  onSubmit: (data: any) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [horizonSteps, setHorizonSteps] = useState(30);
  const [monteCarloRuns, setMonteCarloRuns] = useState(50);
  const [method, setMethod] = useState<'sobol_qmc' | 'random' | 'latin_hypercube'>('sobol_qmc');
  const [aiDescription, setAiDescription] = useState('');

  const aiGenerateMutation = trpc.evoPipeline.ai.generateScenarioParams.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.params) toast.success(data.fallbackUsed ? '参数生成成功（使用降级策略）' : '参数生成成功');
      else toast.warning(data.message ?? '参数生成失败');
    },
    onError: (e: any) => toast.error(`AI 生成失败: ${e.message}`),
  });

  const handleSubmit = useCallback(() => {
    if (!name.trim()) { toast.error('请输入场景名称'); return; }
    onSubmit({
      machineId: equipmentId,
      name: name.trim(),
      description: description.trim() || undefined,
      horizonSteps,
      monteCarloRuns,
      method,
    });
    setName(''); setDescription('');
  }, [name, description, horizonSteps, monteCarloRuns, method, equipmentId, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">创建仿真场景 — {equipmentId}</DialogTitle>
          <DialogDescription className="text-[10px]">配置仿真参数，支持蒙特卡洛不确定性量化</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">场景名称 *</Label>
              <Input className="h-7 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="如：极端负载测试" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">描述</Label>
              <Input className="h-7 text-xs" value={description} onChange={e => setDescription(e.target.value)} placeholder="场景描述..." />
            </div>
          </div>
          <div className="border border-border rounded p-2 space-y-1.5">
            <h4 className="text-[10px] font-semibold text-foreground">仿真配置</h4>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">预测步数</Label>
                <Input className="h-7 text-xs" type="number" value={horizonSteps} onChange={e => setHorizonSteps(Number(e.target.value))} min={1} max={1000} />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">蒙特卡洛采样</Label>
                <Input className="h-7 text-xs" type="number" value={monteCarloRuns} onChange={e => setMonteCarloRuns(Number(e.target.value))} min={10} max={500} />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">采样方法</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sobol_qmc">Sobol QMC</SelectItem>
                    <SelectItem value="random">随机</SelectItem>
                    <SelectItem value="latin_hypercube">拉丁超立方</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* AI 辅助 */}
          <div className="border border-border rounded p-2 space-y-1">
            <h4 className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              🤖 AI 辅助参数生成 <Badge variant="outline" className="text-[8px]">Grok</Badge>
            </h4>
            <div className="flex gap-1">
              <Input className="h-7 text-xs flex-1" value={aiDescription} onChange={e => setAiDescription(e.target.value)} placeholder="描述仿真场景，如：模拟台风天气下的极端工况..." />
              <Button size="sm" className="h-7 text-xs"
                onClick={() => aiGenerateMutation.mutate({ description: aiDescription, equipmentId })}
                disabled={!aiDescription.trim() || aiGenerateMutation.isPending}
              >
                {aiGenerateMutation.isPending ? '生成中...' : '生成'}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '创建中...' : '创建场景'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
