/**
 * ============================================================================
 * 认知仪表盘 — CognitiveDashboard (紧凑风格)
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CognitiveTopology } from '@/components/cognitive/CognitiveTopology';
import { PerceptionDashboardContent } from '@/pages/perception/PerceptionDashboard';
import { BPAConfigContent } from '@/pages/perception/BPAConfigManager';
import { DimensionManagerContent } from '@/pages/perception/DimensionManager';
import { ReasoningEngineConfig } from '@/components/cognitive/ReasoningEngineConfig';
import { CausalGraphView } from '@/components/cognitive/CausalGraphView';
import { ExperiencePoolView } from '@/components/cognitive/ExperiencePoolView';
import { ReasoningTraceView } from '@/components/cognitive/ReasoningTraceView';
import { FeedbackMonitorView } from '@/components/cognitive/FeedbackMonitorView';

// ============================================================================
// 类型定义
// ============================================================================

interface CognitionMetrics {
  activeSessionCount: number; totalDiagnosisToday: number; avgDiagnosisTimeMs: number; convergenceRate: number;
  dimensions: {
    perception: { accuracy: number; latencyMs: number; dataPoints: number };
    reasoning: { accuracy: number; latencyMs: number; grokCalls: number };
    fusion: { accuracy: number; latencyMs: number; conflictRate: number };
    decision: { accuracy: number; latencyMs: number; guardrailTriggers: number };
  };
}

interface ReasoningChainEntry {
  id: string; equipmentId: string; trigger: string; status: 'running' | 'completed' | 'failed';
  steps: Array<{ type: string; tool: string; input: string; output: string; durationMs: number }>;
  totalDurationMs: number; createdAt: string;
}

interface EvolutionStatus {
  currentCycle: string | null; status: 'idle' | 'discovering' | 'hypothesizing' | 'evaluating' | 'deploying' | 'crystallizing';
  totalCycles: number; totalImprovements: number; lastCycleAt: string | null; crystalCount: number;
}

interface GuardrailAlert {
  id: string; ruleId: string; category: 'safety' | 'health' | 'efficiency'; severity: 'critical' | 'high' | 'medium' | 'low';
  equipmentId: string; message: string; acknowledged: boolean; createdAt: string;
}

const emptyMetrics: CognitionMetrics = {
  activeSessionCount: 0, totalDiagnosisToday: 0, avgDiagnosisTimeMs: 0, convergenceRate: 0,
  dimensions: {
    perception: { accuracy: 0, latencyMs: 0, dataPoints: 0 }, reasoning: { accuracy: 0, latencyMs: 0, grokCalls: 0 },
    fusion: { accuracy: 0, latencyMs: 0, conflictRate: 0 }, decision: { accuracy: 0, latencyMs: 0, guardrailTriggers: 0 },
  },
};

const emptyEvolution: EvolutionStatus = { currentCycle: null, status: 'idle', totalCycles: 0, totalImprovements: 0, lastCycleAt: null, crystalCount: 0 };

// ============================================================================
// 触发会话对话框
// ============================================================================

function TriggerSessionDialog({ open, onOpenChange, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: { machineId: string; triggerType: string; priority: string }) => void; isSubmitting: boolean;
}) {
  const [machineId, setMachineId] = useState('EQ-001');
  const [triggerType, setTriggerType] = useState('manual');
  const [priority, setPriority] = useState('normal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">触发认知会话</DialogTitle>
          <DialogDescription className="text-[10px]">手动触发认知诊断会话</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ machineId, triggerType, priority }); }} className="space-y-1.5">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">目标设备</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EQ-001">EQ-001 (主泵)</SelectItem>
                <SelectItem value="EQ-002">EQ-002 (压缩机)</SelectItem>
                <SelectItem value="EQ-003">EQ-003 (涡轮)</SelectItem>
                <SelectItem value="EQ-004">EQ-004 (电机)</SelectItem>
                <SelectItem value="EQ-005">EQ-005 (齿轮箱)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">触发类型</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动触发</SelectItem>
                <SelectItem value="anomaly">异常检测</SelectItem>
                <SelectItem value="scheduled">定时调度</SelectItem>
                <SelectItem value="drift">漂移检测</SelectItem>
                <SelectItem value="guardrail_feedback">护栏反馈</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">优先级</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">紧急</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="normal">普通</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '触发中...' : '触发会话'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 推理链展开视图
// ============================================================================

function ReasoningChainView({ chain }: { chain: ReasoningChainEntry }) {
  const [expanded, setExpanded] = useState(false);
  const statusVariant = chain.status === 'completed' ? 'default' as const : chain.status === 'failed' ? 'destructive' as const : 'secondary' as const;

  return (
    <PageCard className="mb-1.5">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} className="text-[10px]">{chain.status === 'completed' ? '完成' : chain.status === 'failed' ? '失败' : '运行中'}</Badge>
          <span className="text-xs font-medium text-foreground">{chain.equipmentId}</span>
          <Badge variant="outline" className="text-[10px]">{chain.trigger}</Badge>
          <span className="text-[10px] text-muted-foreground">{chain.steps.length} 步</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{chain.totalDurationMs}ms</span>
          <span className="text-[10px] text-muted-foreground">{new Date(chain.createdAt).toLocaleString()}</span>
          <span className="text-[10px]">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && chain.steps.length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-muted space-y-1.5">
          {chain.steps.map((step, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{step.tool}</Badge>
                <span className="text-[10px] text-muted-foreground">{step.durationMs}ms</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">输入: {step.input}</div>
              <div className="text-[10px] text-foreground mt-0.5 font-mono truncate">输出: {step.output}</div>
            </div>
          ))}
        </div>
      )}
      {expanded && chain.steps.length === 0 && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">暂无推理步骤记录</div>
      )}
    </PageCard>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function CognitiveDashboard() {
  const [activeTab, setActiveTab] = useState('topology');
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<{ status?: string; machineId?: string }>({});

  const pollInterval = 10000;

  const metricsQuery = trpc.evoCognition.getDashboardMetrics.useQuery(undefined, { refetchInterval: pollInterval, retry: 2 });
  const chainsQuery = trpc.evoCognition.listReasoningChains.useQuery({ limit: 20, offset: 0 }, { refetchInterval: pollInterval, retry: 2 });
  const sessionsQuery = trpc.evoCognition.session.list.useQuery(
    { limit: 50, offset: 0, status: sessionFilter.status as any || undefined, machineId: sessionFilter.machineId || undefined },
    { refetchInterval: pollInterval, retry: 2 }
  );
  const evolutionQuery = trpc.evoEvolution.getFlywheelStatus.useQuery(undefined, { refetchInterval: pollInterval, retry: 2 });
  const alertsQuery = trpc.evoGuardrail.listAlerts.useQuery({ limit: 50, acknowledged: false }, { refetchInterval: pollInterval, retry: 2 });

  const triggerSessionMutation = trpc.evoCognition.session.trigger.useMutation({
    onSuccess: (data) => { sessionsQuery.refetch(); metricsQuery.refetch(); setTriggerDialogOpen(false); toast.success(`会话已触发: ${data.sessionId}`); },
    onError: (e) => toast.error(`触发失败: ${e.message}`),
  });
  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({
    onSuccess: () => { alertsQuery.refetch(); toast.success('告警已确认'); },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  const metrics: CognitionMetrics = (metricsQuery.data as CognitionMetrics) ?? emptyMetrics;
  const chains: ReasoningChainEntry[] = (chainsQuery.data as ReasoningChainEntry[]) ?? [];
  const sessions = sessionsQuery.data ?? { sessions: [], total: 0 };
  const evolution: EvolutionStatus = (evolutionQuery.data as EvolutionStatus) ?? emptyEvolution;
  const alerts: GuardrailAlert[] = (alertsQuery.data as GuardrailAlert[]) ?? [];

  const handleTriggerSubmit = useCallback((data: { machineId: string; triggerType: string; priority: string }) => {
    triggerSessionMutation.mutate({ machineId: data.machineId, triggerType: data.triggerType as any, priority: data.priority as any });
  }, [triggerSessionMutation]);

  const dimLabels: Record<string, string> = { perception: '感知', reasoning: '推理', fusion: '融合', decision: '决策' };
  const statusLabels: Record<string, string> = { idle: '空闲', discovering: '数据发现', hypothesizing: '假设生成', evaluating: '影子评估', deploying: '金丝雀部署', crystallizing: '知识结晶' };

  return (
    <MainLayout title="认知仪表盘">
    <div className="animate-fade-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold">🧠 认知仪表盘</h2>
          <p className="text-xs text-muted-foreground">四维认知 · 会话管理 · 推理链 · 进化飞轮</p>
        </div>
        <div className="flex items-center gap-1.5">
          {alerts.length > 0 && <Badge variant="destructive" className="text-[10px]">{alerts.length} 条告警</Badge>}
          <Button size="sm" className="h-7 text-xs" onClick={() => setTriggerDialogOpen(true)}>+ 触发会话</Button>
        </div>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <StatCard value={metrics.activeSessionCount} label="活跃会话" icon="🔵" />
        <StatCard value={metrics.totalDiagnosisToday} label="今日诊断" icon="📋" />
        <StatCard value={`${metrics.avgDiagnosisTimeMs}ms`} label="平均耗时" icon="⏱️" />
        <StatCard value={`${Math.round(metrics.convergenceRate * 100)}%`} label="收敛率" icon="🎯" />
        <StatCard value={statusLabels[evolution.status]} label={`${evolution.totalCycles} 周期 · ${evolution.crystalCount} 结晶`} icon="🔄" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="topology" className="text-xs">实时拓扑</TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">四维认知</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs">会话管理</TabsTrigger>
          <TabsTrigger value="reasoning" className="text-xs">Grok 推理链</TabsTrigger>
          <TabsTrigger value="evolution" className="text-xs">进化飞轮</TabsTrigger>
          <TabsTrigger value="guardrail" className="text-xs">
            护栏告警
            {alerts.length > 0 && <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1">{alerts.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="perception-dashboard" className="text-xs">感知增强</TabsTrigger>
          <TabsTrigger value="bpa-config" className="text-xs">BPA 配置</TabsTrigger>
          <TabsTrigger value="dimension-manager" className="text-xs">维度管理</TabsTrigger>
          <TabsTrigger value="engine-config" className="text-xs">🔧 引擎配置</TabsTrigger>
          <TabsTrigger value="causal-graph" className="text-xs">🕸️ 因果图</TabsTrigger>
          <TabsTrigger value="experience-pool" className="text-xs">🧠 经验池</TabsTrigger>
          <TabsTrigger value="reasoning-trace" className="text-xs">📡 推理追踪</TabsTrigger>
          <TabsTrigger value="feedback-monitor" className="text-xs">🔄 反馈监控</TabsTrigger>
        </TabsList>

        {/* ===== 实时拓扑 ===== */}
        <TabsContent value="topology" className="mt-2">
          <CognitiveTopology />
        </TabsContent>

        {/* ===== 四维认知 ===== */}
        <TabsContent value="overview" className="mt-2">
          <PageCard title="四维认知准确度" icon="📊">
            <div className="space-y-2">
              {(['perception', 'reasoning', 'fusion', 'decision'] as const).map(dim => {
                const d = metrics.dimensions[dim];
                const pct = Math.round(d.accuracy * 100);
                return (
                  <div key={dim} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{dimLabels[dim]}</span>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>准确度 {pct}%</span>
                        <span>延迟 {d.latencyMs}ms</span>
                        <span>
                          {dim === 'perception' ? `${(d as any).dataPoints} 数据点` :
                           dim === 'reasoning' ? `${(d as any).grokCalls} Grok调用` :
                           dim === 'fusion' ? `冲突率 ${Math.round((d as any).conflictRate * 100)}%` :
                           `${(d as any).guardrailTriggers} 护栏触发`}
                        </span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </PageCard>
        </TabsContent>

        {/* ===== 会话管理 ===== */}
        <TabsContent value="sessions" className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Select value={sessionFilter.status || 'all'} onValueChange={v => setSessionFilter(prev => ({ ...prev, status: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue placeholder="状态筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="timeout">超时</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sessionFilter.machineId || 'all'} onValueChange={v => setSessionFilter(prev => ({ ...prev, machineId: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue placeholder="设备筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部设备</SelectItem>
                <SelectItem value="EQ-001">EQ-001</SelectItem>
                <SelectItem value="EQ-002">EQ-002</SelectItem>
                <SelectItem value="EQ-003">EQ-003</SelectItem>
                <SelectItem value="EQ-004">EQ-004</SelectItem>
                <SelectItem value="EQ-005">EQ-005</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <span className="text-[10px] text-muted-foreground">共 {sessions.total} 条</span>
            <Button size="sm" className="h-7 text-xs" onClick={() => setTriggerDialogOpen(true)}>+ 触发会话</Button>
          </div>

          {sessionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">加载中...</span>
            </div>
          ) : (sessions.sessions as any[]).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">暂无会话记录</p>
              <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setTriggerDialogOpen(true)}>触发第一次诊断</Button>
            </div>
          ) : (
            <PageCard noPadding>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] py-1">会话 ID</TableHead>
                    <TableHead className="text-[10px] py-1">设备</TableHead>
                    <TableHead className="text-[10px] py-1">触发类型</TableHead>
                    <TableHead className="text-[10px] py-1">优先级</TableHead>
                    <TableHead className="text-[10px] py-1">状态</TableHead>
                    <TableHead className="text-[10px] py-1">安全</TableHead>
                    <TableHead className="text-[10px] py-1">健康</TableHead>
                    <TableHead className="text-[10px] py-1">效率</TableHead>
                    <TableHead className="text-[10px] py-1">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sessions.sessions as any[]).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-[10px] py-1">{s.id}</TableCell>
                      <TableCell className="text-xs py-1">{s.machineId}</TableCell>
                      <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{s.triggerType}</Badge></TableCell>
                      <TableCell className="py-1"><Badge variant={s.priority === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{s.priority}</Badge></TableCell>
                      <TableCell className="py-1">
                        <Badge variant={s.status === 'completed' ? 'default' : s.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {s.status === 'completed' ? '完成' : s.status === 'running' ? '运行中' : s.status === 'failed' ? '失败' : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] py-1">{s.safetyScore ?? '-'}</TableCell>
                      <TableCell className="font-mono text-[10px] py-1">{s.healthScore ?? '-'}</TableCell>
                      <TableCell className="font-mono text-[10px] py-1">{s.efficiencyScore ?? '-'}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground py-1">{new Date(s.startedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== Grok 推理链 ===== */}
        <TabsContent value="reasoning" className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground">共 {chains.length} 条推理链</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => chainsQuery.refetch()}>刷新</Button>
          </div>
          {chains.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-xs">暂无推理链记录</div>
          ) : chains.map(chain => (
            <ReasoningChainView key={chain.id} chain={chain} />
          ))}
        </TabsContent>

        {/* ===== 进化飞轮 ===== */}
        <TabsContent value="evolution" className="mt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <StatCard value={statusLabels[evolution.status]} label="当前状态" icon="🔄" />
            <StatCard value={evolution.totalCycles} label="累计周期" icon="🔵" />
            <StatCard value={evolution.totalImprovements} label="累计改进" icon="📈" />
            <StatCard value={evolution.crystalCount} label="知识结晶" icon="💎" />
          </div>
          <PageCard title="飞轮五步闭环" icon="⚙️">
            <div className="flex items-center justify-between">
              {[
                { key: 'discovering', label: '数据发现' },
                { key: 'hypothesizing', label: '假设生成' },
                { key: 'evaluating', label: '影子评估' },
                { key: 'deploying', label: '金丝雀部署' },
                { key: 'crystallizing', label: '知识结晶' },
              ].map((step, i) => (
                <div key={step.key} className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    evolution.status === step.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>{i + 1}</div>
                  <span className={`text-[10px] ${evolution.status === step.key ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{step.label}</span>
                </div>
              ))}
            </div>
            {evolution.lastCycleAt && (
              <div className="text-[10px] text-muted-foreground mt-2 text-center">最近周期: {new Date(evolution.lastCycleAt).toLocaleString()}</div>
            )}
          </PageCard>
        </TabsContent>

        {/* ===== 感知增强仪表盘 ===== */}
        <TabsContent value="perception-dashboard" className="mt-2">
          <PerceptionDashboardContent />
        </TabsContent>

        {/* ===== BPA 配置管理 ===== */}
        <TabsContent value="bpa-config" className="mt-2">
          <BPAConfigContent />
        </TabsContent>

        {/* ===== 维度定义管理 ===== */}
        <TabsContent value="dimension-manager" className="mt-2">
          <DimensionManagerContent />
        </TabsContent>

        {/* ===== Phase 2: 引擎配置 ===== */}
        <TabsContent value="engine-config" className="mt-2">
          <ReasoningEngineConfig />
        </TabsContent>

        {/* ===== Phase 2: 因果图 ===== */}
        <TabsContent value="causal-graph" className="mt-2">
          <CausalGraphView />
        </TabsContent>

        {/* ===== Phase 2: 经验池 ===== */}
        <TabsContent value="experience-pool" className="mt-2">
          <ExperiencePoolView />
        </TabsContent>

        {/* ===== Phase 2: 推理追踪 ===== */}
        <TabsContent value="reasoning-trace" className="mt-2">
          <ReasoningTraceView />
        </TabsContent>

        {/* ===== Phase 2: 反馈监控 ===== */}
        <TabsContent value="feedback-monitor" className="mt-2">
          <FeedbackMonitorView />
        </TabsContent>

        {/* ===== 护栏告警 ===== */}
        <TabsContent value="guardrail" className="mt-2">
          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">✓ 当前无待处理告警</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground">{alerts.length} 条待处理</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { alerts.forEach(a => acknowledgeMutation.mutate({ alertId: a.id })); }}>全部确认</Button>
              </div>
              <div className="space-y-1.5">
                {alerts.map(alert => (
                  <PageCard key={alert.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{alert.severity}</Badge>
                      <Badge variant="outline" className="text-[10px]">{alert.category === 'safety' ? '安全' : alert.category === 'health' ? '健康' : '效率'}</Badge>
                      <div className="flex-1">
                        <div className="text-xs font-medium">{alert.message}</div>
                        <div className="text-[10px] text-muted-foreground">设备: {alert.equipmentId} · {new Date(alert.createdAt).toLocaleString()}</div>
                      </div>
                      <Button size="sm" className="h-6 text-[10px]" onClick={() => acknowledgeMutation.mutate({ alertId: alert.id })}>确认</Button>
                    </div>
                  </PageCard>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 触发会话对话框 */}
      <TriggerSessionDialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen} onSubmit={handleTriggerSubmit} isSubmitting={triggerSessionMutation.isPending} />
    </div>
    </MainLayout>
  );
}
