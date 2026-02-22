/**
 * ============================================================================
 * 数字孪生可视化 — DigitalTwinView (Phase 3 重建)
 * ============================================================================
 *
 * Phase 3 v1.3 — 世界模型增强 / 数字孪生系统工程重建
 *
 * 4 个 Tab 面板：
 *   1. 设备状态 — 设备选择器 + 传感器实时数据 + 健康仪表盘 + 告警 + RUL
 *   2. 仿真推演 — 场景列表 + 参数配置 + 异步执行 + 结果可视化 + 多方案对比
 *   3. 历史回放 — 时间轴控制器 + 多通道折线图 + 事件标注
 *   4. 世界模型 — 物理方程 + 参数配置 + 预测验证 + 不确定性可视化
 *
 * 数据源：全部来自 tRPC 端点（evoPipeline.*），零 Math.random()
 * 状态管理：Zustand (twinStore) + TanStack Query v5
 */
import { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useTwinStore, type TwinTab } from '@/stores/twinStore';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Title, Tooltip, Legend);

// ============================================================================
// 常量
// ============================================================================

const stateLabels: Record<string, string> = {
  vibrationRMS: '振动 RMS', temperature: '温度', loadRatio: '负载率',
  speed: '转速', fatigueDamage: '疲劳损伤', remainingLifeDays: '剩余寿命',
  pressure: '压力', current: '电流', humidity: '湿度',
};
const stateUnits: Record<string, string> = {
  vibrationRMS: 'mm/s', temperature: '°C', loadRatio: '%',
  speed: 'rpm', fatigueDamage: '', remainingLifeDays: '天',
  pressure: 'MPa', current: 'A', humidity: '%',
};

const syncStatusMap: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' }> = {
  synced: { label: '已同步', color: 'default' },
  stale: { label: '延迟', color: 'secondary' },
  disconnected: { label: '断连', color: 'destructive' },
};

const riskLevelMap: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' }> = {
  low: { label: '低', color: 'default' },
  medium: { label: '中', color: 'secondary' },
  high: { label: '高', color: 'destructive' },
  critical: { label: '严重', color: 'destructive' },
};

// ============================================================================
// 评分环（紧凑）
// ============================================================================

function ScoreGauge({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round(score);
  return (
    <div className="text-center">
      <div className="relative w-12 h-12 mx-auto">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${pct}, 100`} className={color} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">{pct}</div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function DigitalTwinView() {
  const {
    selectedEquipmentId, setSelectedEquipment,
    activeTab, setActiveTab,
  } = useTwinStore();

  // ===== tRPC Queries =====
  const twinsQuery = trpc.evoPipeline.listEquipmentTwins.useQuery(undefined, {
    refetchInterval: 10000, retry: 2,
  });

  const twins = twinsQuery.data ?? [];
  const selectedTwin = selectedEquipmentId ?? (twins.length > 0 ? (twins[0] as any).equipmentId : null);

  // 自动选择第一个设备
  useEffect(() => {
    if (!selectedEquipmentId && twins.length > 0) {
      setSelectedEquipment((twins[0] as any).equipmentId);
    }
  }, [twins, selectedEquipmentId, setSelectedEquipment]);

  return (
    <MainLayout title="数字孪生">
      <div className="space-y-2 p-2">
        {/* 顶部：设备选择器 + 概览统计 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedTwin ?? ''} onValueChange={(v) => setSelectedEquipment(v)}>
            <SelectTrigger className="w-56 h-7 text-xs">
              <SelectValue placeholder="选择设备..." />
            </SelectTrigger>
            <SelectContent>
              {twins.map((t: any) => (
                <SelectItem key={t.equipmentId} value={t.equipmentId}>
                  <span className="font-mono text-[10px] mr-1">{t.equipmentId}</span>
                  <span className="text-xs">{t.equipmentName}</span>
                  <Badge variant={syncStatusMap[t.syncStatus]?.color ?? 'default'} className="ml-1.5 text-[9px] px-1">
                    {syncStatusMap[t.syncStatus]?.label ?? t.syncStatus}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 概览统计卡片 */}
          <div className="flex gap-1.5 flex-1">
            <StatCard compact value={twins.length} label="设备总数" icon="🏭" />
            <StatCard compact value={twins.filter((t: any) => t.syncStatus === 'synced').length} label="在线" icon="🟢" />
            <StatCard compact
              value={twins.filter((t: any) => t.healthScore != null && t.healthScore < 60).length}
              label="需关注" icon="⚠️"
            />
          </div>
        </div>

        {/* 4 Tab 面板 */}
        {selectedTwin && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TwinTab)}>
            <TabsList className="h-7">
              <TabsTrigger value="status" className="text-xs h-6 px-3">设备状态</TabsTrigger>
              <TabsTrigger value="simulation" className="text-xs h-6 px-3">仿真推演</TabsTrigger>
              <TabsTrigger value="replay" className="text-xs h-6 px-3">历史回放</TabsTrigger>
              <TabsTrigger value="worldmodel" className="text-xs h-6 px-3">世界模型</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="mt-2">
              <EquipmentStatusPanel equipmentId={selectedTwin} />
            </TabsContent>
            <TabsContent value="simulation" className="mt-2">
              <SimulationPanel equipmentId={selectedTwin} />
            </TabsContent>
            <TabsContent value="replay" className="mt-2">
              <ReplayPanel equipmentId={selectedTwin} />
            </TabsContent>
            <TabsContent value="worldmodel" className="mt-2">
              <WorldModelPanel equipmentId={selectedTwin} />
            </TabsContent>
          </Tabs>
        )}

        {!selectedTwin && twins.length === 0 && (
          <PageCard title="数字孪生" icon={<span>🔮</span>}>
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                {twinsQuery.isLoading ? '正在加载设备列表...' : '暂无设备数据，请确保 equipment_profiles 表已有数据'}
              </p>
            </div>
          </PageCard>
        )}
      </div>
    </MainLayout>
  );
}

// ============================================================================
// Tab 1: 设备状态面板
// ============================================================================

function EquipmentStatusPanel({ equipmentId }: { equipmentId: string }) {
  const stateQuery = trpc.evoPipeline.getEquipmentTwinState.useQuery(
    { equipmentId },
    { refetchInterval: 5000, retry: 2 },
  );

  const data = stateQuery.data as any;
  if (!data) {
    return (
      <PageCard>
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">
            {stateQuery.isLoading ? '加载中...' : '暂无设备状态数据'}
          </p>
        </div>
      </PageCard>
    );
  }

  const stateVector = data.stateVector ?? {};
  const health = data.health ?? {};

  return (
    <div className="space-y-2">
      {/* 健康评分 */}
      <PageCard title="综合评分" icon={<span>📊</span>} compact>
        <div className="flex justify-around">
          <ScoreGauge label="安全" score={health.safetyScore ?? 0} color="text-green-500" />
          <ScoreGauge label="健康" score={health.healthScore ?? 0} color="text-blue-500" />
          <ScoreGauge label="效率" score={health.efficiencyScore ?? 0} color="text-purple-500" />
          <ScoreGauge label="综合" score={health.overallScore ?? 0} color="text-primary" />
        </div>
      </PageCard>

      <div className="grid grid-cols-2 gap-2">
        {/* 左侧：传感器数据 + RUL */}
        <div className="space-y-2">
          {/* 传感器数据表格 */}
          <PageCard title="传感器数据" icon={<span>📊</span>} compact>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1">通道</TableHead>
                  <TableHead className="text-[10px] py-1">当前值</TableHead>
                  <TableHead className="text-[10px] py-1">单位</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stateVector).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="text-[10px] py-0.5 font-medium">{stateLabels[key] ?? key}</TableCell>
                    <TableCell className="text-[10px] py-0.5 font-mono">
                      {typeof value === 'number' ? value.toFixed(3) : String(value)}
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 text-muted-foreground">{stateUnits[key] ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageCard>

          {/* RUL 卡片 */}
          {data.rul && (
            <PageCard title="剩余使用寿命 (RUL)" icon={<span>⏳</span>} compact>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">{data.rul.estimatedDays}</span>
                  <span className="text-xs text-muted-foreground">天</span>
                  <Badge variant="outline" className="text-[9px]">
                    ±{data.rul.confidenceIntervalDays} 天
                  </Badge>
                </div>
                <Progress value={Math.min(100, (data.rul.estimatedDays / 365) * 100)} className="h-1.5" />
                {data.rul.topDegradationFactors && data.rul.topDegradationFactors.length > 0 && (
                  <div className="mt-1">
                    <span className="text-[10px] text-muted-foreground">主要退化因素：</span>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {data.rul.topDegradationFactors.map((f: { factor: string; contribution: number }, i: number) => (
                        <Badge key={i} variant="outline" className="text-[9px]">
                          {stateLabels[f.factor] ?? f.factor} ({(f.contribution * 100).toFixed(0)}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PageCard>
          )}
        </div>

        {/* 右侧：趋势图 + 告警 */}
        <div className="space-y-2">
          {/* 24h 健康趋势图 */}
          {data.trend && data.trend.length > 0 && (
            <PageCard title="24h 健康趋势" icon={<span>📈</span>} compact>
              <div style={{ height: '160px' }}>
                <Line
                  data={{
                    labels: data.trend.map((t: any) =>
                      new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                    ),
                    datasets: [{
                      label: '健康指数',
                      data: data.trend.map((t: any) => t.healthIndex),
                      borderColor: 'hsl(210, 80%, 55%)',
                      backgroundColor: 'hsl(210, 80%, 55%, 0.1)',
                      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                    scales: {
                      x: { display: true, ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
                      y: { display: true, min: 0, max: 100, ticks: { font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
                    },
                  }}
                />
              </div>
            </PageCard>
          )}

          {/* 活跃告警 */}
          <PageCard title="活跃告警" icon={<span>🚨</span>} compact
            action={<Badge variant="outline" className="text-[9px]">{data.activeAlerts?.length ?? 0}</Badge>}
          >
            {(!data.activeAlerts || data.activeAlerts.length === 0) ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">无活跃告警</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.activeAlerts.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                    <Badge variant={a.severity === 'critical' || a.severity === 'error' ? 'destructive' : 'secondary'} className="text-[9px] px-1">
                      {a.severity}
                    </Badge>
                    <span className="flex-1 truncate">{a.title}</span>
                    <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        </div>
      </div>

      {/* 同步状态 */}
      <PageCard compact>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-muted-foreground">同步状态:</span>
          <Badge variant={syncStatusMap[data.syncStatus]?.color ?? 'default'} className="text-[9px]">
            {syncStatusMap[data.syncStatus]?.label ?? data.syncStatus}
          </Badge>
          <span className="text-muted-foreground">模式: {data.syncMode}</span>
          <span className="text-muted-foreground">最后同步: {new Date(data.lastSyncAt).toLocaleString('zh-CN')}</span>
          {data.diagnostics && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <span className="text-muted-foreground">最近诊断: {data.diagnostics.status}</span>
              <span className="text-muted-foreground">{data.diagnostics.processingTimeMs}ms</span>
            </>
          )}
        </div>
      </PageCard>
    </div>
  );
}

// ============================================================================
// Tab 2: 仿真推演面板
// ============================================================================

function SimulationPanel({ equipmentId }: { equipmentId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const scenariosQuery = trpc.evoPipeline.simulation.list.useQuery(
    { machineId: equipmentId }, { refetchInterval: 5000, retry: 2 },
  );

  const compareQuery = trpc.evoPipeline.simulation.compare.useQuery(
    { scenarioIds: compareIds },
    { enabled: showCompare && compareIds.length >= 2 },
  );

  const createMutation = trpc.evoPipeline.simulation.create.useMutation({
    onSuccess: () => { scenariosQuery.refetch(); toast.success('仿真场景创建成功'); setCreateOpen(false); },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const executeMutation = trpc.evoPipeline.simulation.execute.useMutation({
    onSuccess: (data: any) => { scenariosQuery.refetch(); toast.success(`仿真任务已入队: ${data.taskId}`); },
    onError: (e) => toast.error(`执行失败: ${e.message}`),
  });

  const deleteMutation = trpc.evoPipeline.simulation.delete.useMutation({
    onSuccess: () => { scenariosQuery.refetch(); toast.success('场景已删除'); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const scenarios: any[] = scenariosQuery.data ?? [];

  const toggleCompare = useCallback((id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) { toast.warning('最多选择 5 个场景对比'); return prev; }
      return [...prev, id];
    });
  }, []);

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
                  <TableHead className="text-[10px] py-1">创建时间</TableHead>
                  <TableHead className="text-right text-[10px] py-1">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="py-0.5">
                      <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} className="w-3 h-3" disabled={s.status !== 'completed'} />
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 font-medium">{s.name}</TableCell>
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
      <div className="flex gap-2 mb-2">
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
    onError: (e) => toast.error(`AI 生成失败: ${e.message}`),
  });

  const handleSubmit = useCallback(() => {
    if (!name.trim()) { toast.error('请输入场景名称'); return; }
    onSubmit({ machineId: equipmentId, name: name.trim(), description: description || undefined, horizonSteps, monteCarloRuns, method });
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

// ============================================================================
// Tab 3: 历史回放面板
// ============================================================================

function ReplayPanel({ equipmentId }: { equipmentId: string }) {
  const { replayTimeRange, setReplayTimeRange, replayResolution, setReplayResolution } = useTwinStore();

  const timeRangeQuery = trpc.evoPipeline.replay.getTimeRange.useQuery({ equipmentId }, { retry: 2 });

  const replayDataQuery = trpc.evoPipeline.replay.getData.useQuery(
    { equipmentId, startTime: replayTimeRange?.start ?? '', endTime: replayTimeRange?.end ?? '' },
    { enabled: !!replayTimeRange?.start && !!replayTimeRange?.end },
  );

  const timeRange = timeRangeQuery.data as any;
  const replayData = replayDataQuery.data as any;

  // 自动设置时间范围（最近 24h）
  useEffect(() => {
    if (timeRange?.available && !replayTimeRange) {
      const end = timeRange.endTime!;
      const start = new Date(new Date(end).getTime() - 86400000).toISOString();
      setReplayTimeRange({ start, end });
    }
  }, [timeRange, replayTimeRange, setReplayTimeRange]);

  return (
    <div className="space-y-2">
      {/* 时间控制器 */}
      <PageCard compact>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">开始:</Label>
            <Input type="datetime-local" className="h-7 text-xs w-44"
              value={replayTimeRange?.start ? replayTimeRange.start.slice(0, 16) : ''}
              onChange={e => { const v = e.target.value; if (v) setReplayTimeRange({ start: new Date(v).toISOString(), end: replayTimeRange?.end ?? new Date().toISOString() }); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">结束:</Label>
            <Input type="datetime-local" className="h-7 text-xs w-44"
              value={replayTimeRange?.end ? replayTimeRange.end.slice(0, 16) : ''}
              onChange={e => { const v = e.target.value; if (v) setReplayTimeRange({ start: replayTimeRange?.start ?? new Date(Date.now() - 86400000).toISOString(), end: new Date(v).toISOString() }); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">分辨率:</Label>
            <Select value={String(replayResolution)} onValueChange={v => setReplayResolution(Number(v))}>
              <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">1min</SelectItem>
                <SelectItem value="300">5min</SelectItem>
                <SelectItem value="600">10min</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {timeRange?.available && (
              <span className="text-[9px] text-muted-foreground">可回放: {timeRange.snapshotCount} 个快照</span>
            )}
          </div>
        </div>
      </PageCard>

      {/* 回放数据可视化 */}
      {replayData && replayData.timeline && replayData.timeline.length > 0 ? (
        <div className="space-y-2">
          <PageCard title="健康指数回放" icon={<span>📈</span>} compact>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: replayData.timeline.map((t: any) => new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
                  datasets: [{
                    label: '健康指数', data: replayData.timeline.map((t: any) => t.healthIndex),
                    borderColor: 'hsl(210, 80%, 55%)', backgroundColor: 'hsl(210, 80%, 55%, 0.1)',
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 12, font: { size: 9 } }, grid: { display: false } },
                    y: { min: 0, max: 100, ticks: { font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
                  },
                }}
              />
            </div>
          </PageCard>

          <div className="grid grid-cols-2 gap-2">
            <PageCard title={`认知事件 (${replayData.events?.length ?? 0})`} icon={<span>🧠</span>} compact>
              {(!replayData.events || replayData.events.length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无认知事件</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.events.slice(0, 20).map((e: any) => (
                    <div key={e.id} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-[8px]">{e.type}</Badge>
                      <Badge variant={e.status === 'completed' ? 'default' : 'secondary'} className="text-[8px]">{e.status}</Badge>
                      {e.healthScore != null && <span className="text-muted-foreground">H:{Number(e.healthScore).toFixed(0)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </PageCard>

            <PageCard title={`告警事件 (${replayData.alerts?.length ?? 0})`} icon={<span>🚨</span>} compact>
              {(!replayData.alerts || replayData.alerts.length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无告警</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.alerts.slice(0, 20).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(a.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[8px]">{a.severity}</Badge>
                      <span className="truncate">{a.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </PageCard>
          </div>
        </div>
      ) : (
        <PageCard>
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">
              {replayDataQuery.isLoading ? '加载回放数据...' : !replayTimeRange ? '请选择时间范围' : '所选时间范围内无数据'}
            </p>
          </div>
        </PageCard>
      )}
    </div>
  );
}

// ============================================================================
// Tab 4: 世界模型面板
// ============================================================================

function WorldModelPanel({ equipmentId }: { equipmentId: string }) {
  const [predictHorizon, setPredictHorizon] = useState(60);
  const [includeUncertainty, setIncludeUncertainty] = useState(true);
  const [monteCarloRuns, setMonteCarloRuns] = useState(50);

  const configQuery = trpc.evoPipeline.worldmodel.getConfig.useQuery({ equipmentId }, { retry: 2 });
  const equationsQuery = trpc.evoPipeline.worldmodel.getEquations.useQuery({ equipmentId }, { retry: 2 });

  const predictMutation = trpc.evoPipeline.worldmodel.predict.useMutation({
    onSuccess: () => toast.success('预测完成'),
    onError: (e) => toast.error(`预测失败: ${e.message}`),
  });

  const config = configQuery.data as any;
  const equations: any[] = equationsQuery.data ?? [];
  const prediction = predictMutation.data as any;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* 左侧：配置 + 物理方程 */}
        <div className="space-y-2">
          <PageCard title="世界模型配置" icon={<span>⚙️</span>} compact>
            {config ? (
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">设备类型</span><span className="font-mono">{config.equipmentType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">制造商</span><span>{config.manufacturer}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">型号</span><span>{config.model}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registry 状态</span>
                  <Badge variant={config.registryStatus?.registered ? 'default' : 'secondary'} className="text-[8px]">
                    {config.registryStatus?.registered ? '已注册' : '未注册'}
                  </Badge>
                </div>
                {config.registryStatus?.registered && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">同步模式</span><span className="font-mono">{config.registryStatus.syncMode}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">状态维度</span><span>{config.registryStatus.stateVectorDimensions}</span></div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{configQuery.isLoading ? '加载中...' : '无配置数据'}</p>
            )}
          </PageCard>

          <PageCard title={`物理方程 (${equations.length})`} icon={<span>📐</span>} compact>
            {equations.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{equationsQuery.isLoading ? '加载中...' : '无物理方程数据'}</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {equations.map((eq: any) => (
                  <div key={eq.id} className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Badge variant="outline" className="text-[8px]">{eq.category}</Badge>
                      <span className="text-[10px] font-medium">{eq.name}</span>
                    </div>
                    <div className="bg-muted/50 rounded px-1.5 py-0.5 font-mono text-[10px] text-foreground overflow-x-auto">
                      {eq.formula}
                    </div>
                    {eq.source && <span className="text-[8px] text-muted-foreground mt-0.5 block">来源: {eq.source}</span>}
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        </div>

        {/* 右侧：预测控制 + 结果 */}
        <div className="space-y-2">
          <PageCard title="预测控制" icon={<span>🔮</span>} compact>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-20">预测时长</Label>
                <Slider value={[predictHorizon]} onValueChange={([v]) => setPredictHorizon(v)} min={5} max={1440} step={5} className="flex-1" />
                <span className="text-[10px] font-mono w-16 text-right">{predictHorizon} min</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-20">不确定性</Label>
                <Switch checked={includeUncertainty} onCheckedChange={setIncludeUncertainty} />
                <span className="text-[10px] text-muted-foreground">{includeUncertainty ? '启用蒙特卡洛' : '关闭'}</span>
              </div>
              {includeUncertainty && (
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground w-20">采样次数</Label>
                  <Input className="h-6 text-xs w-20" type="number" value={monteCarloRuns} onChange={e => setMonteCarloRuns(Number(e.target.value))} min={10} max={500} />
                </div>
              )}
              <Button size="sm" className="h-7 text-xs w-full"
                onClick={() => predictMutation.mutate({ equipmentId, horizonMinutes: predictHorizon, includeUncertainty, monteCarloRuns })}
                disabled={predictMutation.isPending}
              >
                {predictMutation.isPending ? '预测中...' : '执行预测'}
              </Button>
            </div>
          </PageCard>

          {/* 预测结果 */}
          {prediction && (
            <PageCard title="预测结果" icon={<span>📊</span>} compact>
              <div className="space-y-1.5">
                <div className="text-[10px]">
                  <span className="text-muted-foreground">预测时长: </span><span className="font-mono">{prediction.horizonMinutes} min</span>
                  <span className="text-muted-foreground ml-2">耗时: </span><span className="font-mono">{prediction.durationMs} ms</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-0.5">维度</TableHead>
                      <TableHead className="text-[9px] py-0.5">预测值</TableHead>
                      {prediction.uncertainty && (
                        <>
                          <TableHead className="text-[9px] py-0.5">P5</TableHead>
                          <TableHead className="text-[9px] py-0.5">P95</TableHead>
                          <TableHead className="text-[9px] py-0.5">σ</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(prediction.basePrediction ?? {}).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="text-[9px] py-0.5">{stateLabels[key] ?? key}</TableCell>
                        <TableCell className="text-[9px] py-0.5 font-mono">{(value as number).toFixed(4)}</TableCell>
                        {prediction.uncertainty && (
                          <>
                            <TableCell className="text-[9px] py-0.5 font-mono text-blue-500">{prediction.uncertainty.p5?.[key]?.toFixed(4) ?? '--'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 font-mono text-red-500">{prediction.uncertainty.p95?.[key]?.toFixed(4) ?? '--'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 font-mono">{prediction.uncertainty.stdDev?.[key]?.toFixed(4) ?? '--'}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* RUL */}
                {prediction.rul && (
                  <div className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground">RUL:</span>
                      <span className="font-bold text-sm">{prediction.rul.estimatedDays}</span>
                      <span className="text-muted-foreground">天</span>
                      <Badge variant="outline" className="text-[8px]">±{prediction.rul.confidenceIntervalDays}天</Badge>
                    </div>
                  </div>
                )}

                {/* 物理校验 */}
                {prediction.physicsValidation && (
                  <div className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground">物理校验:</span>
                      <Badge variant={prediction.physicsValidation.isValid ? 'default' : 'destructive'} className="text-[8px]">
                        {prediction.physicsValidation.isValid ? '通过' : `${prediction.physicsValidation.violations?.length ?? 0} 个违规`}
                      </Badge>
                      <span className="text-muted-foreground ml-1">置信度: {((prediction.physicsValidation.confidence ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                    {prediction.physicsValidation.violations && prediction.physicsValidation.violations.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {prediction.physicsValidation.violations.map((v: any, i: number) => (
                          <div key={i} className="text-[9px] text-destructive">• [{v.type}] {v.message}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* AI 解释 */}
                {prediction.aiExplanation && (
                  <div className="border border-border rounded p-1.5">
                    <div className="text-[10px] font-medium mb-0.5 flex items-center gap-1">
                      🤖 AI 分析 <Badge variant="outline" className="text-[8px]">Grok</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{prediction.aiExplanation}</p>
                  </div>
                )}

                {/* 不确定性可视化 */}
                {prediction.uncertainty && (
                  <div style={{ height: '180px' }}>
                    <Bar
                      data={{
                        labels: Object.keys(prediction.basePrediction ?? {}).map(k => stateLabels[k] ?? k),
                        datasets: [
                          { label: 'P5', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.p5?.[k] ?? 0), backgroundColor: 'hsl(210, 80%, 55%, 0.3)', borderColor: 'hsl(210, 80%, 55%)', borderWidth: 1 },
                          { label: '均值', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.mean?.[k] ?? 0), backgroundColor: 'hsl(120, 60%, 45%, 0.5)', borderColor: 'hsl(120, 60%, 45%)', borderWidth: 1 },
                          { label: 'P95', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.p95?.[k] ?? 0), backgroundColor: 'hsl(340, 80%, 55%, 0.3)', borderColor: 'hsl(340, 80%, 55%)', borderWidth: 1 },
                        ],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'top', labels: { font: { size: 9 } } }, title: { display: true, text: '不确定性量化 (P5-P95)', font: { size: 10 } } },
                        scales: { x: { ticks: { font: { size: 8 } } }, y: { ticks: { font: { size: 8 } } } },
                      }}
                    />
                  </div>
                )}
              </div>
            </PageCard>
          )}
        </div>
      </div>
    </div>
  );
}
