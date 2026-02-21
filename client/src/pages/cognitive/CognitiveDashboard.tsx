/**
 * ============================================================================
 * 认知仪表盘 — CognitiveDashboard
 * ============================================================================
 *
 * 完整功能：四维认知可视化 + 触发会话 + 会话管理 + Grok推理链 + 进化飞轮 + 护栏告警
 * 通过 tRPC 接入后端 evoCognition / evoEvolution / evoGuardrail 域路由
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CognitiveTopology } from '@/components/cognitive/CognitiveTopology';

// ============================================================================
// 类型定义
// ============================================================================

interface CognitionMetrics {
  activeSessionCount: number;
  totalDiagnosisToday: number;
  avgDiagnosisTimeMs: number;
  convergenceRate: number;
  dimensions: {
    perception: { accuracy: number; latencyMs: number; dataPoints: number };
    reasoning: { accuracy: number; latencyMs: number; grokCalls: number };
    fusion: { accuracy: number; latencyMs: number; conflictRate: number };
    decision: { accuracy: number; latencyMs: number; guardrailTriggers: number };
  };
}

interface ReasoningChainEntry {
  id: string;
  equipmentId: string;
  trigger: string;
  status: 'running' | 'completed' | 'failed';
  steps: Array<{ type: string; tool: string; input: string; output: string; durationMs: number }>;
  totalDurationMs: number;
  createdAt: string;
}

interface EvolutionStatus {
  currentCycle: string | null;
  status: 'idle' | 'discovering' | 'hypothesizing' | 'evaluating' | 'deploying' | 'crystallizing';
  totalCycles: number;
  totalImprovements: number;
  lastCycleAt: string | null;
  crystalCount: number;
}

interface GuardrailAlert {
  id: string;
  ruleId: string;
  category: 'safety' | 'health' | 'efficiency';
  severity: 'critical' | 'high' | 'medium' | 'low';
  equipmentId: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

const emptyMetrics: CognitionMetrics = {
  activeSessionCount: 0, totalDiagnosisToday: 0, avgDiagnosisTimeMs: 0, convergenceRate: 0,
  dimensions: {
    perception: { accuracy: 0, latencyMs: 0, dataPoints: 0 },
    reasoning: { accuracy: 0, latencyMs: 0, grokCalls: 0 },
    fusion: { accuracy: 0, latencyMs: 0, conflictRate: 0 },
    decision: { accuracy: 0, latencyMs: 0, guardrailTriggers: 0 },
  },
};

const emptyEvolution: EvolutionStatus = {
  currentCycle: null, status: 'idle', totalCycles: 0, totalImprovements: 0, lastCycleAt: null, crystalCount: 0,
};

// ============================================================================
// 触发会话对话框
// ============================================================================

function TriggerSessionDialog({
  open, onOpenChange, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { machineId: string; triggerType: string; priority: string }) => void;
  isSubmitting: boolean;
}) {
  const [machineId, setMachineId] = useState('EQ-001');
  const [triggerType, setTriggerType] = useState('manual');
  const [priority, setPriority] = useState('normal');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ machineId, triggerType, priority });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>触发认知会话</DialogTitle>
          <DialogDescription>手动触发一次认知诊断会话，系统将执行四维诊断流程</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>目标设备</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EQ-001">EQ-001 (主泵)</SelectItem>
                <SelectItem value="EQ-002">EQ-002 (压缩机)</SelectItem>
                <SelectItem value="EQ-003">EQ-003 (涡轮)</SelectItem>
                <SelectItem value="EQ-004">EQ-004 (电机)</SelectItem>
                <SelectItem value="EQ-005">EQ-005 (齿轮箱)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>触发类型</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动触发</SelectItem>
                <SelectItem value="anomaly">异常检测</SelectItem>
                <SelectItem value="scheduled">定时调度</SelectItem>
                <SelectItem value="drift">漂移检测</SelectItem>
                <SelectItem value="guardrail_feedback">护栏反馈</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>优先级</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">紧急</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="normal">普通</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '触发中...' : '触发会话'}
            </Button>
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
    <Card className="mb-2">
      <CardContent className="py-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant}>{chain.status === 'completed' ? '完成' : chain.status === 'failed' ? '失败' : '运行中'}</Badge>
            <span className="text-sm font-medium text-foreground">{chain.equipmentId}</span>
            <Badge variant="outline">{chain.trigger}</Badge>
            <span className="text-xs text-muted-foreground">{chain.steps.length} 步</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">{chain.totalDurationMs}ms</span>
            <span className="text-xs text-muted-foreground">{new Date(chain.createdAt).toLocaleString()}</span>
            <span className="text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {expanded && chain.steps.length > 0 && (
          <div className="mt-3 pl-4 border-l-2 border-muted space-y-2">
            {chain.steps.map((step, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{step.tool}</Badge>
                  <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">输入: {step.input}</div>
                <div className="text-xs text-foreground mt-0.5 font-mono truncate">输出: {step.output}</div>
              </div>
            ))}
          </div>
        )}
        {expanded && chain.steps.length === 0 && (
          <div className="mt-3 text-xs text-muted-foreground">暂无推理步骤记录</div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function CognitiveDashboard() {
  const [activeTab, setActiveTab] = useState('topology');
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<{ status?: string; machineId?: string }>({});

  // ---- tRPC 数据查询 ----
  const pollInterval = 10000;

  const metricsQuery = trpc.evoCognition.getDashboardMetrics.useQuery(undefined, {
    refetchInterval: pollInterval, retry: 2,
  });

  const chainsQuery = trpc.evoCognition.listReasoningChains.useQuery(
    { limit: 20, offset: 0 },
    { refetchInterval: pollInterval, retry: 2 }
  );

  const sessionsQuery = trpc.evoCognition.session.list.useQuery(
    {
      limit: 50, offset: 0,
      status: sessionFilter.status as any || undefined,
      machineId: sessionFilter.machineId || undefined,
    },
    { refetchInterval: pollInterval, retry: 2 }
  );

  const evolutionQuery = trpc.evoEvolution.getFlywheelStatus.useQuery(undefined, {
    refetchInterval: pollInterval, retry: 2,
  });

  const alertsQuery = trpc.evoGuardrail.listAlerts.useQuery(
    { limit: 50, acknowledged: false },
    { refetchInterval: pollInterval, retry: 2 }
  );

  // ---- Mutations ----
  const triggerSessionMutation = trpc.evoCognition.session.trigger.useMutation({
    onSuccess: (data) => {
      sessionsQuery.refetch();
      metricsQuery.refetch();
      setTriggerDialogOpen(false);
      toast.success(`会话已触发: ${data.sessionId}`);
    },
    onError: (e) => toast.error(`触发失败: ${e.message}`),
  });

  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({
    onSuccess: () => { alertsQuery.refetch(); toast.success('告警已确认'); },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  // ---- 数据解构 ----
  const metrics: CognitionMetrics = (metricsQuery.data as CognitionMetrics) ?? emptyMetrics;
  const chains: ReasoningChainEntry[] = (chainsQuery.data as ReasoningChainEntry[]) ?? [];
  const sessions = sessionsQuery.data ?? { sessions: [], total: 0 };
  const evolution: EvolutionStatus = (evolutionQuery.data as EvolutionStatus) ?? emptyEvolution;
  const alerts: GuardrailAlert[] = (alertsQuery.data as GuardrailAlert[]) ?? [];

  const handleTriggerSubmit = useCallback((data: { machineId: string; triggerType: string; priority: string }) => {
    triggerSessionMutation.mutate({
      machineId: data.machineId,
      triggerType: data.triggerType as any,
      priority: data.priority as any,
    });
  }, [triggerSessionMutation]);

  const dimLabels: Record<string, string> = { perception: '感知', reasoning: '推理', fusion: '融合', decision: '决策' };
  const statusLabels: Record<string, string> = {
    idle: '空闲', discovering: '数据发现', hypothesizing: '假设生成',
    evaluating: '影子评估', deploying: '金丝雀部署', crystallizing: '知识结晶',
  };

  return (
    <MainLayout title="认知仪表盘">
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">认知仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">四维认知状态 · 会话管理 · 推理链 · 进化飞轮</p>
        </div>
        <div className="flex items-center gap-3">
          {alerts.length > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">{alerts.length} 条告警</Badge>
          )}
          <Button onClick={() => setTriggerDialogOpen(true)}>
            + 触发会话
          </Button>
        </div>
      </div>

      {/* 概览指标卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">活跃会话</div>
            <div className="text-2xl font-bold text-blue-500 mt-1">{metrics.activeSessionCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">今日诊断</div>
            <div className="text-2xl font-bold text-green-500 mt-1">{metrics.totalDiagnosisToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">平均耗时</div>
            <div className="text-2xl font-bold text-purple-500 mt-1">{metrics.avgDiagnosisTimeMs}<span className="text-sm font-normal text-muted-foreground ml-1">ms</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">收敛率</div>
            <div className="text-2xl font-bold text-orange-500 mt-1">{Math.round(metrics.convergenceRate * 100)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">飞轮状态</div>
            <div className="text-lg font-bold text-foreground mt-1">{statusLabels[evolution.status]}</div>
            <div className="text-xs text-muted-foreground">{evolution.totalCycles} 周期 · {evolution.crystalCount} 结晶</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="topology">实时拓扑</TabsTrigger>
          <TabsTrigger value="overview">四维认知</TabsTrigger>
          <TabsTrigger value="sessions">会话管理</TabsTrigger>
          <TabsTrigger value="reasoning">Grok 推理链</TabsTrigger>
          <TabsTrigger value="evolution">进化飞轮</TabsTrigger>
          <TabsTrigger value="guardrail">
            护栏告警
            {alerts.length > 0 && <span className="ml-1.5 text-xs bg-red-500 text-white rounded-full px-1.5">{alerts.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ===== 实时拓扑 Tab ===== */}
        <TabsContent value="topology" className="mt-4">
          <CognitiveTopology />
        </TabsContent>

        {/* ===== 四维认知 Tab ===== */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">四维认知准确度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(['perception', 'reasoning', 'fusion', 'decision'] as const).map(dim => {
                const d = metrics.dimensions[dim];
                const pct = Math.round(d.accuracy * 100);
                return (
                  <div key={dim} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{dimLabels[dim]}</span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>准确度 {pct}%</span>
                        <span>延迟 {d.latencyMs}ms</span>
                        <span>
                          {dim === 'perception' ? `${d.dataPoints} 数据点` :
                           dim === 'reasoning' ? `${(d as any).grokCalls} Grok调用` :
                           dim === 'fusion' ? `冲突率 ${Math.round((d as any).conflictRate * 100)}%` :
                           `${(d as any).guardrailTriggers} 护栏触发`}
                        </span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 会话管理 Tab ===== */}
        <TabsContent value="sessions" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={sessionFilter.status || 'all'} onValueChange={v => setSessionFilter(prev => ({ ...prev, status: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="状态筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="timeout">超时</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sessionFilter.machineId || 'all'} onValueChange={v => setSessionFilter(prev => ({ ...prev, machineId: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="设备筛选" /></SelectTrigger>
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
            <span className="text-sm text-muted-foreground">共 {sessions.total} 条会话</span>
            <Button onClick={() => setTriggerDialogOpen(true)}>+ 触发会话</Button>
          </div>

          {sessionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : (sessions.sessions as any[]).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无会话记录</p>
              <Button className="mt-4" onClick={() => setTriggerDialogOpen(true)}>触发第一次诊断</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会话 ID</TableHead>
                  <TableHead>设备</TableHead>
                  <TableHead>触发类型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>安全评分</TableHead>
                  <TableHead>健康评分</TableHead>
                  <TableHead>效率评分</TableHead>
                  <TableHead>开始时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions.sessions as any[]).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell>{s.machineId}</TableCell>
                    <TableCell><Badge variant="outline">{s.triggerType}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={s.priority === 'critical' ? 'destructive' : 'secondary'}>{s.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'completed' ? 'default' : s.status === 'failed' ? 'destructive' : 'secondary'}>
                        {s.status === 'completed' ? '完成' : s.status === 'running' ? '运行中' : s.status === 'failed' ? '失败' : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{s.safetyScore ?? '-'}</TableCell>
                    <TableCell className="font-mono">{s.healthScore ?? '-'}</TableCell>
                    <TableCell className="font-mono">{s.efficiencyScore ?? '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== Grok 推理链 Tab ===== */}
        <TabsContent value="reasoning" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">共 {chains.length} 条推理链</span>
            <Button variant="outline" size="sm" onClick={() => chainsQuery.refetch()}>刷新</Button>
          </div>
          {chains.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无推理链记录</div>
          ) : chains.map(chain => (
            <ReasoningChainView key={chain.id} chain={chain} />
          ))}
        </TabsContent>

        {/* ===== 进化飞轮 Tab ===== */}
        <TabsContent value="evolution" className="mt-4 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">当前状态</div>
                <div className="text-lg font-bold text-foreground mt-1">{statusLabels[evolution.status]}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">累计周期</div>
                <div className="text-2xl font-bold text-blue-500 mt-1">{evolution.totalCycles}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">累计改进</div>
                <div className="text-2xl font-bold text-purple-500 mt-1">{evolution.totalImprovements}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">知识结晶</div>
                <div className="text-2xl font-bold text-orange-500 mt-1">{evolution.crystalCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">飞轮五步闭环</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {[
                  { key: 'discovering', label: '数据发现' },
                  { key: 'hypothesizing', label: '假设生成' },
                  { key: 'evaluating', label: '影子评估' },
                  { key: 'deploying', label: '金丝雀部署' },
                  { key: 'crystallizing', label: '知识结晶' },
                ].map((step, i) => (
                  <div key={step.key} className="flex flex-col items-center gap-2">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      evolution.status === step.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <span className={`text-xs ${evolution.status === step.key ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{step.label}</span>
                  </div>
                ))}
              </div>
              {evolution.lastCycleAt && (
                <div className="text-xs text-muted-foreground mt-4 text-center">
                  最近周期: {new Date(evolution.lastCycleAt).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 护栏告警 Tab ===== */}
        <TabsContent value="guardrail" className="mt-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">✓ 当前无待处理告警</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{alerts.length} 条待处理</span>
                <Button variant="outline" size="sm" onClick={() => {
                  alerts.forEach(a => acknowledgeMutation.mutate({ alertId: a.id }));
                }}>全部确认</Button>
              </div>
              {alerts.map(alert => (
                <Card key={alert.id} className="border-orange-300/50">
                  <CardContent className="flex items-center gap-4 py-3">
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>{alert.severity}</Badge>
                    <Badge variant="outline">{alert.category === 'safety' ? '安全' : alert.category === 'health' ? '健康' : '效率'}</Badge>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{alert.message}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">设备: {alert.equipmentId} · {new Date(alert.createdAt).toLocaleString()}</div>
                    </div>
                    <Button size="sm" onClick={() => acknowledgeMutation.mutate({ alertId: alert.id })}>确认处理</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 触发会话对话框 */}
      <TriggerSessionDialog
        open={triggerDialogOpen}
        onOpenChange={setTriggerDialogOpen}
        onSubmit={handleTriggerSubmit}
        isSubmitting={triggerSessionMutation.isPending}
      />
    </div>
    </MainLayout>
  );
}
