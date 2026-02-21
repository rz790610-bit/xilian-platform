/**
 * ============================================================================
 * 数字孪生可视化 — DigitalTwinView
 * ============================================================================
 *
 * 完整功能：设备孪生状态 + 仿真场景CRUD + 参数配置 + 历史回放管理
 * 通过 tRPC 接入后端 evoPipeline 域路由
 */

import { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface TwinState {
  equipmentId: string;
  equipmentName: string;
  syncStatus: 'synced' | 'stale' | 'disconnected';
  lastSyncAt: string;
  stateVector: {
    vibrationRMS: number;
    temperature: number;
    loadRatio: number;
    speed: number;
    fatigueDamage: number;
    remainingLifeDays: number;
  };
  healthScore: number;
  safetyScore: number;
  efficiencyScore: number;
}

interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, number>;
  status: 'idle' | 'running' | 'completed';
  result?: {
    predictedState: Record<string, number>;
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
}

interface ReplaySession {
  id: string;
  startTime: string;
  endTime: string;
  equipmentId: string;
  eventCount: number;
  status: 'ready' | 'playing' | 'paused' | 'completed';
  progress: number;
}

// ============================================================================
// 创建仿真场景对话框
// ============================================================================

function CreateSimulationDialog({
  open, onOpenChange, equipmentId, currentState, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  currentState: TwinState['stateVector'] | null;
  onSubmit: (data: { name: string; description: string; parameters: Record<string, number> }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [params, setParams] = useState({
    vibrationRMS: currentState?.vibrationRMS ?? 3.0,
    temperature: currentState?.temperature ?? 65,
    loadRatio: currentState?.loadRatio ?? 0.75,
    speed: currentState?.speed ?? 3000,
  });

  const paramLabels: Record<string, { label: string; min: number; max: number; step: number; unit: string }> = {
    vibrationRMS: { label: '振动 RMS', min: 0, max: 20, step: 0.1, unit: 'mm/s' },
    temperature: { label: '温度', min: 0, max: 200, step: 1, unit: '°C' },
    loadRatio: { label: '负载率', min: 0, max: 1.5, step: 0.01, unit: '' },
    speed: { label: '转速', min: 0, max: 10000, step: 100, unit: 'rpm' },
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('请输入场景名称'); return; }
    onSubmit({ name, description, parameters: params });
    setName(''); setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>创建仿真场景 — {equipmentId}</DialogTitle>
          <DialogDescription>设置仿真参数，系统将预测设备在该工况下的状态</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>场景名称 *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：极端负载测试" />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="场景描述..." />
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">仿真参数</h4>
            {Object.entries(paramLabels).map(([key, cfg]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{cfg.label}</Label>
                  <span className="text-sm font-mono">{params[key as keyof typeof params]}{cfg.unit && ` ${cfg.unit}`}</span>
                </div>
                <Slider
                  value={[params[key as keyof typeof params]]}
                  onValueChange={v => setParams(prev => ({ ...prev, [key]: v[0] }))}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '创建并运行'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 创建回放对话框
// ============================================================================

function CreateReplayDialog({
  open, onOpenChange, equipmentId, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  onSubmit: (data: { startTime: string; endTime: string; speed: number }) => void;
  isSubmitting: boolean;
}) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const [startTime, setStartTime] = useState(oneHourAgo.toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(now.toISOString().slice(0, 16));
  const [speed, setSpeed] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), speed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建回放 — {equipmentId}</DialogTitle>
          <DialogDescription>选择时间范围回放设备历史数据</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>开始时间</Label>
            <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>结束时间</Label>
            <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>回放速度: {speed}x</Label>
            <Select value={String(speed)} onValueChange={v => setSpeed(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">0.5x (慢速)</SelectItem>
                <SelectItem value="1">1x (实时)</SelectItem>
                <SelectItem value="2">2x</SelectItem>
                <SelectItem value="5">5x</SelectItem>
                <SelectItem value="10">10x (快速)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '开始回放'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 评分环
// ============================================================================

function ScoreGauge({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${pct}, 100`} className={color} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{pct}</div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function DigitalTwinView() {
  const [selectedTwin, setSelectedTwin] = useState<string>('');
  const [activeTab, setActiveTab] = useState('status');
  const [createSimOpen, setCreateSimOpen] = useState(false);
  const [createReplayOpen, setCreateReplayOpen] = useState(false);

  // ---- tRPC 数据查询 ----
  const twinsQuery = trpc.evoPipeline.listDigitalTwins.useQuery(undefined, {
    refetchInterval: 5000, retry: 2,
  });

  // 自动选择第一个设备
  const twins: TwinState[] = (twinsQuery.data as TwinState[]) ?? [];
  useEffect(() => {
    if (!selectedTwin && twins.length > 0) {
      setSelectedTwin(twins[0].equipmentId);
    }
  }, [twins, selectedTwin]);

  const scenariosQuery = trpc.evoPipeline.listSimulationScenarios.useQuery(
    { equipmentId: selectedTwin },
    { enabled: !!selectedTwin, retry: 2 }
  );

  const replaysQuery = trpc.evoPipeline.listReplaySessions.useQuery(
    { equipmentId: selectedTwin },
    { enabled: !!selectedTwin, retry: 2 }
  );

  // ---- Mutations ----
  const runSimulationMutation = trpc.evoPipeline.runSimulation.useMutation({
    onSuccess: () => { scenariosQuery.refetch(); toast.success('仿真已启动'); },
    onError: (e) => toast.error(`仿真失败: ${e.message}`),
  });

  const startReplayMutation = trpc.evoPipeline.startReplay.useMutation({
    onSuccess: () => { replaysQuery.refetch(); toast.success('回放已启动'); },
    onError: (e) => toast.error(`回放失败: ${e.message}`),
  });

  // ---- 数据解构 ----
  const scenarios: SimulationScenario[] = (scenariosQuery.data as SimulationScenario[]) ?? [];
  const replays: ReplaySession[] = (replaysQuery.data as ReplaySession[]) ?? [];
  const currentTwin = twins.find(t => t.equipmentId === selectedTwin) || twins[0];

  const syncVariant = (s: string) => s === 'synced' ? 'default' as const : s === 'stale' ? 'secondary' as const : 'destructive' as const;
  const syncLabel = (s: string) => s === 'synced' ? '已同步' : s === 'stale' ? '过期' : '断开';

  const stateLabels: Record<string, string> = { vibrationRMS: '振动 RMS', temperature: '温度', loadRatio: '负载率', speed: '转速', fatigueDamage: '疲劳损伤', remainingLifeDays: '剩余寿命' };
  const stateUnits: Record<string, string> = { vibrationRMS: 'mm/s', temperature: '°C', loadRatio: '', speed: 'rpm', fatigueDamage: '', remainingLifeDays: '天' };

  const handleCreateSim = useCallback((data: { name: string; description: string; parameters: Record<string, number> }) => {
    runSimulationMutation.mutate({ scenarioId: `sim-${Date.now()}`, equipmentId: selectedTwin, ...data });
    setCreateSimOpen(false);
  }, [runSimulationMutation, selectedTwin]);

  const handleCreateReplay = useCallback((data: { startTime: string; endTime: string; speed: number }) => {
    startReplayMutation.mutate({ replayId: `replay-${Date.now()}`, ...data });
    setCreateReplayOpen(false);
  }, [startReplayMutation]);

  return (
    <MainLayout title="数字孪生">
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">数字孪生</h1>
          <p className="text-sm text-muted-foreground mt-1">设备状态 · 仿真推演 · 历史回放</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">{twins.length} 台设备</Badge>
        </div>
      </div>

      {twinsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      ) : twins.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">暂无数字孪生设备</div>
      ) : (
        <>
          {/* 设备选择 */}
          <div className="flex gap-2 flex-wrap">
            {twins.map(t => (
              <Button
                key={t.equipmentId}
                variant={selectedTwin === t.equipmentId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTwin(t.equipmentId)}
              >
                {t.equipmentName}
                <Badge variant={syncVariant(t.syncStatus)} className="ml-2 text-xs">{syncLabel(t.syncStatus)}</Badge>
              </Button>
            ))}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="status">实时状态</TabsTrigger>
                <TabsTrigger value="simulate">仿真推演</TabsTrigger>
                <TabsTrigger value="replay">历史回放</TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                {activeTab === 'simulate' && (
                  <Button size="sm" onClick={() => setCreateSimOpen(true)}>+ 创建仿真</Button>
                )}
                {activeTab === 'replay' && (
                  <Button size="sm" onClick={() => setCreateReplayOpen(true)}>+ 创建回放</Button>
                )}
              </div>
            </div>

            {/* ===== 实时状态 Tab ===== */}
            <TabsContent value="status" className="mt-4 space-y-4">
              {currentTwin && (
                <>
                  <div className="flex items-center gap-4">
                    <Badge variant={syncVariant(currentTwin.syncStatus)}>{syncLabel(currentTwin.syncStatus)}</Badge>
                    <span className="text-xs text-muted-foreground">最后同步: {new Date(currentTwin.lastSyncAt).toLocaleString()}</span>
                  </div>

                  <Card>
                    <CardHeader><CardTitle className="text-base">综合评分</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex justify-around">
                        <ScoreGauge label="安全" score={currentTwin.safetyScore} color="text-green-500" />
                        <ScoreGauge label="健康" score={currentTwin.healthScore} color="text-blue-500" />
                        <ScoreGauge label="效率" score={currentTwin.efficiencyScore} color="text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">状态向量</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>参数</TableHead>
                            <TableHead className="text-right">当前值</TableHead>
                            <TableHead className="text-right">单位</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(currentTwin.stateVector).map(([key, value]) => (
                            <TableRow key={key}>
                              <TableCell className="font-medium">{stateLabels[key] || key}</TableCell>
                              <TableCell className="text-right font-mono">{typeof value === 'number' ? value.toFixed(2) : value}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{stateUnits[key]}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ===== 仿真推演 Tab ===== */}
            <TabsContent value="simulate" className="mt-4">
              {scenarios.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">暂无仿真场景</p>
                  <Button className="mt-4" onClick={() => setCreateSimOpen(true)}>创建第一个仿真</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {scenarios.map(s => (
                    <Card key={s.id}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-sm font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.description}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.status === 'completed' ? 'default' : s.status === 'running' ? 'secondary' : 'outline'}>
                              {s.status === 'completed' ? '已完成' : s.status === 'running' ? '运行中' : '待运行'}
                            </Badge>
                            {s.status === 'idle' && (
                              <Button size="sm" onClick={() => runSimulationMutation.mutate({ scenarioId: s.id, equipmentId: selectedTwin })}>
                                运行
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* 参数 */}
                        <div className="flex gap-3 flex-wrap mb-2">
                          {Object.entries(s.parameters).map(([k, v]) => (
                            <Badge key={k} variant="outline" className="text-xs font-mono">
                              {stateLabels[k] || k}: {v}{stateUnits[k] ? ` ${stateUnits[k]}` : ''}
                            </Badge>
                          ))}
                        </div>

                        {/* 结果 */}
                        {s.result && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-muted-foreground">风险等级:</span>
                              <Badge variant={s.result.riskLevel === 'high' ? 'destructive' : s.result.riskLevel === 'medium' ? 'secondary' : 'default'}>
                                {s.result.riskLevel === 'high' ? '高风险' : s.result.riskLevel === 'medium' ? '中风险' : '低风险'}
                              </Badge>
                            </div>
                            {s.result.recommendations.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">建议:</span>
                                {s.result.recommendations.map((r, i) => (
                                  <div key={i} className="text-xs text-foreground pl-3">• {r}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ===== 历史回放 Tab ===== */}
            <TabsContent value="replay" className="mt-4">
              {replays.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">暂无回放记录</p>
                  <Button className="mt-4" onClick={() => setCreateReplayOpen(true)}>创建第一个回放</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>设备</TableHead>
                      <TableHead>时间范围</TableHead>
                      <TableHead>事件数</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>进度</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replays.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">{r.equipmentId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(r.startTime).toLocaleString()} → {new Date(r.endTime).toLocaleString()}
                        </TableCell>
                        <TableCell>{r.eventCount}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'completed' ? 'default' : r.status === 'playing' ? 'secondary' : 'outline'}>
                            {r.status === 'completed' ? '已完成' : r.status === 'playing' ? '播放中' : r.status === 'paused' ? '暂停' : '就绪'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={r.progress} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{r.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === 'ready' && (
                            <Button variant="ghost" size="sm" onClick={() => startReplayMutation.mutate({ replayId: r.id })}>
                              播放
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>

          {/* 创建仿真对话框 */}
          <CreateSimulationDialog
            open={createSimOpen}
            onOpenChange={setCreateSimOpen}
            equipmentId={selectedTwin}
            currentState={currentTwin?.stateVector ?? null}
            onSubmit={handleCreateSim}
            isSubmitting={runSimulationMutation.isPending}
          />

          {/* 创建回放对话框 */}
          <CreateReplayDialog
            open={createReplayOpen}
            onOpenChange={setCreateReplayOpen}
            equipmentId={selectedTwin}
            onSubmit={handleCreateReplay}
            isSubmitting={startReplayMutation.isPending}
          />
        </>
      )}
    </div>
    </MainLayout>
  );
}
