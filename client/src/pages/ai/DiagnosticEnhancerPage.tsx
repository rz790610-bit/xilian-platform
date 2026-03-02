/**
 * P2-9 诊断增强页面 — DiagnosticEnhancerPage
 *
 * 功能：
 * 1. 增强控制台 — 输入设备/算法结果/传感器特征 → 执行 AI 增强诊断
 * 2. 报告展示 — 风险等级/三维评分/证据链/诊断条目/维护建议/预测趋势
 * 3. 配置查看 — 诊断增强引擎参数
 */
import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  Activity, Brain, Shield, Zap, Plus, Trash2, Loader2, Play,
  AlertTriangle, CheckCircle2, ChevronRight, Settings2,
  TrendingUp, TrendingDown, Minus, Wrench, Target, Eye,
} from 'lucide-react';

// ==================== 类型 ====================

interface AlgorithmInput {
  algorithmId: string;
  algorithmName: string;
  confidence: number;
  output: string; // JSON string for free-form
}

interface SensorInput {
  sensorId: string;
  sensorType: string;
  value: number;
  unit: string;
}

// ==================== 常量 ====================

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  negligible: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const RISK_LABELS: Record<string, string> = {
  critical: '严重', high: '高', medium: '中', low: '低', negligible: '可忽略',
};

const PRIORITY_LABELS: Record<string, string> = {
  immediate: '立即处理', planned: '计划维护', monitor: '持续监测', defer: '延后处理',
};

const PRIORITY_COLORS: Record<string, string> = {
  immediate: 'bg-red-500/20 text-red-400',
  planned: 'bg-yellow-500/20 text-yellow-400',
  monitor: 'bg-blue-500/20 text-blue-400',
  defer: 'bg-zinc-500/20 text-zinc-400',
};

const TREND_ICONS: Record<string, React.ReactNode> = {
  improving: <TrendingUp className="w-4 h-4 text-green-400" />,
  stable: <Minus className="w-4 h-4 text-blue-400" />,
  degrading: <TrendingDown className="w-4 h-4 text-orange-400" />,
  critical: <AlertTriangle className="w-4 h-4 text-red-400" />,
};

const DEPTH_OPTIONS = [
  { value: 'quick', label: '快速诊断', desc: '~10s，基础证据综合' },
  { value: 'standard', label: '标准诊断', desc: '~30s，含 KG + 根因' },
  { value: 'deep', label: '深度诊断', desc: '~60s，全链路分析' },
] as const;

const DEFAULT_ALGORITHMS: AlgorithmInput[] = [
  { algorithmId: 'vib-rms-001', algorithmName: '振动 RMS 分析', confidence: 0.85, output: '{"rms": 4.2, "peak": 12.5}' },
];

const DEFAULT_SENSORS: SensorInput[] = [
  { sensorId: 'VIB-001', sensorType: 'vibration', value: 4.2, unit: 'mm/s' },
  { sensorId: 'TEMP-001', sensorType: 'temperature', value: 65, unit: '°C' },
];

// ==================== 组件 ====================

export default function DiagnosticEnhancerPage() {
  const { toast } = useToast();

  // 表单状态
  const [machineId, setMachineId] = useState('GJM12');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [algorithms, setAlgorithms] = useState<AlgorithmInput[]>(DEFAULT_ALGORITHMS);
  const [sensors, setSensors] = useState<SensorInput[]>(DEFAULT_SENSORS);

  // 报告状态
  const [report, setReport] = useState<any>(null);

  // tRPC
  const enhanceMutation = trpc.ai.diagnostic.enhance.useMutation({
    onSuccess: (data) => {
      setReport(data);
      toast({ title: '诊断增强完成', description: `报告 ID: ${data.reportId}`, variant: 'success' });
    },
    onError: (err) => {
      toast({ title: '诊断增强失败', description: err.message, variant: 'destructive' });
    },
  });

  const configQuery = trpc.ai.diagnostic.getConfig.useQuery();

  // 操作
  const handleEnhance = useCallback(() => {
    const now = Date.now();
    enhanceMutation.mutate({
      machineId,
      depth,
      algorithmResults: algorithms.map(a => ({
        algorithmId: a.algorithmId,
        algorithmName: a.algorithmName,
        confidence: a.confidence,
        output: JSON.parse(a.output || '{}'),
        executedAt: now,
      })),
      sensorFeatures: sensors.map(s => ({
        sensorId: s.sensorId,
        sensorType: s.sensorType,
        value: s.value,
        unit: s.unit,
        timestamp: now,
      })),
    });
  }, [machineId, depth, algorithms, sensors, enhanceMutation]);

  const addAlgorithm = () => {
    setAlgorithms(prev => [...prev, { algorithmId: '', algorithmName: '', confidence: 0.5, output: '{}' }]);
  };

  const removeAlgorithm = (idx: number) => {
    setAlgorithms(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAlgorithm = (idx: number, field: keyof AlgorithmInput, value: string | number) => {
    setAlgorithms(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addSensor = () => {
    setSensors(prev => [...prev, { sensorId: '', sensorType: '', value: 0, unit: '' }]);
  };

  const removeSensor = (idx: number) => {
    setSensors(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSensor = (idx: number, field: keyof SensorInput, value: string | number) => {
    setSensors(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  return (
    <MainLayout title="AI 诊断增强">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="当前设备" value={machineId} icon={<Activity className="w-5 h-5" />} />
        <StatCard label="诊断深度" value={DEPTH_OPTIONS.find(d => d.value === depth)?.label ?? depth} icon={<Target className="w-5 h-5" />} />
        <StatCard label="算法输入" value={`${algorithms.length} 个`} icon={<Brain className="w-5 h-5" />} />
        <StatCard label="传感器" value={`${sensors.length} 个`} icon={<Zap className="w-5 h-5" />} />
      </div>

      <Tabs defaultValue="console" className="space-y-4">
        <TabsList>
          <TabsTrigger value="console">增强控制台</TabsTrigger>
          <TabsTrigger value="config">引擎配置</TabsTrigger>
        </TabsList>

        {/* ━━━ Tab1: 增强控制台 ━━━ */}
        <TabsContent value="console">
          <div className="grid grid-cols-5 gap-6">
            {/* 左侧：输入表单 (40%) */}
            <div className="col-span-2 space-y-4">
              <PageCard title="诊断参数">
                <div className="space-y-4">
                  {/* 设备选择 */}
                  <div className="space-y-2">
                    <Label>设备 ID</Label>
                    <Input value={machineId} onChange={e => setMachineId(e.target.value)} placeholder="如 GJM12" />
                  </div>

                  {/* 深度选择 */}
                  <div className="space-y-2">
                    <Label>诊断深度</Label>
                    <Select value={depth} onValueChange={(v) => setDepth(v as typeof depth)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPTH_OPTIONS.map(d => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label} — {d.desc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PageCard>

              {/* 算法结果 */}
              <PageCard title="算法结果" action={
                <Button variant="ghost" size="sm" onClick={addAlgorithm}><Plus className="w-4 h-4 mr-1" />添加</Button>
              }>
                <div className="space-y-3">
                  {algorithms.map((a, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-zinc-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">算法 #{idx + 1}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeAlgorithm(idx)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="算法 ID" value={a.algorithmId} onChange={e => updateAlgorithm(idx, 'algorithmId', e.target.value)} className="text-sm" />
                        <Input placeholder="算法名称" value={a.algorithmName} onChange={e => updateAlgorithm(idx, 'algorithmName', e.target.value)} className="text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">置信度</Label>
                          <Input type="number" min={0} max={1} step={0.05} value={a.confidence} onChange={e => updateAlgorithm(idx, 'confidence', parseFloat(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">输出 (JSON)</Label>
                          <Input placeholder='{"rms": 4.2}' value={a.output} onChange={e => updateAlgorithm(idx, 'output', e.target.value)} className="text-sm font-mono" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>

              {/* 传感器特征 */}
              <PageCard title="传感器特征" action={
                <Button variant="ghost" size="sm" onClick={addSensor}><Plus className="w-4 h-4 mr-1" />添加</Button>
              }>
                <div className="space-y-3">
                  {sensors.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-zinc-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">传感器 #{idx + 1}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeSensor(idx)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="传感器 ID" value={s.sensorId} onChange={e => updateSensor(idx, 'sensorId', e.target.value)} className="text-sm" />
                        <Input placeholder="类型 (vibration/temperature...)" value={s.sensorType} onChange={e => updateSensor(idx, 'sensorType', e.target.value)} className="text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" placeholder="值" value={s.value} onChange={e => updateSensor(idx, 'value', parseFloat(e.target.value) || 0)} className="text-sm" />
                        <Input placeholder="单位" value={s.unit} onChange={e => updateSensor(idx, 'unit', e.target.value)} className="text-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>

              {/* 执行按钮 */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleEnhance}
                disabled={enhanceMutation.isPending || !machineId}
              >
                {enhanceMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />诊断增强中...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" />执行增强诊断</>
                )}
              </Button>
            </div>

            {/* 右侧：报告展示 (60%) */}
            <div className="col-span-3">
              {!report ? (
                <PageCard title="增强报告">
                  <div className="flex items-center justify-center h-64 text-zinc-500">
                    <div className="text-center">
                      <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>配置参数并执行诊断增强后，报告将在此处展示</p>
                    </div>
                  </div>
                </PageCard>
              ) : (
                <ScrollArea className="h-[calc(100vh-240px)]">
                  <div className="space-y-4 pr-4">
                    {/* 风险等级 + 报告ID */}
                    <PageCard title="诊断总览">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-sm text-zinc-400">报告 ID: {report.reportId}</span>
                          <p className="text-sm text-zinc-400 mt-1">{report.summary}</p>
                        </div>
                        <Badge className={cn('text-sm px-3 py-1', RISK_COLORS[report.riskLevel])}>
                          {RISK_LABELS[report.riskLevel] ?? report.riskLevel}
                        </Badge>
                      </div>

                      {/* 三维评分 */}
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { key: 'safety', label: '安全性', icon: <Shield className="w-4 h-4" />, color: 'bg-red-500' },
                          { key: 'health', label: '健康度', icon: <Activity className="w-4 h-4" />, color: 'bg-green-500' },
                          { key: 'efficiency', label: '效率', icon: <Zap className="w-4 h-4" />, color: 'bg-blue-500' },
                        ].map(({ key, label, icon, color }) => (
                          <div key={key} className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              {icon}
                              <span>{label}</span>
                              <span className="ml-auto font-mono">{Math.round(report.scores[key])}%</span>
                            </div>
                            <Progress value={report.scores[key]} className={cn('h-2', `[&>div]:${color}`)} />
                          </div>
                        ))}
                      </div>
                    </PageCard>

                    {/* 预测趋势 */}
                    {report.prediction && (
                      <PageCard title="预测趋势">
                        <div className="flex items-center gap-4">
                          {TREND_ICONS[report.prediction.trend]}
                          <div>
                            <span className="text-sm capitalize">{report.prediction.trend}</span>
                            {report.prediction.remainingLifeHours != null && (
                              <p className="text-xs text-zinc-400">预估剩余寿命: {report.prediction.remainingLifeHours.toFixed(0)} 小时</p>
                            )}
                            {report.prediction.nextMilestone && (
                              <p className="text-xs text-zinc-400">下一里程碑: {report.prediction.nextMilestone}</p>
                            )}
                          </div>
                        </div>
                      </PageCard>
                    )}

                    {/* 证据链 */}
                    {report.evidenceChain?.length > 0 && (
                      <PageCard title={`证据链 (${report.evidenceChain.length} 项)`}>
                        <div className="space-y-2">
                          {report.evidenceChain.map((ev: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 p-2 rounded border border-zinc-700/50">
                              <Badge variant="outline" className="text-xs shrink-0">{ev.source}</Badge>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm">{ev.description}</p>
                                {ev.physicalBasis && (
                                  <p className="text-xs text-zinc-400 mt-1">物理依据: {ev.physicalBasis}</p>
                                )}
                              </div>
                              <span className="text-xs text-zinc-400 shrink-0">{(ev.confidence * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      </PageCard>
                    )}

                    {/* 诊断条目 */}
                    {report.diagnoses?.length > 0 && (
                      <PageCard title={`诊断条目 (${report.diagnoses.length})`}>
                        <div className="space-y-3">
                          {report.diagnoses.map((d: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg border border-zinc-700">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-zinc-400">{d.faultCode}</span>
                                  <span className="text-sm font-medium">{d.faultName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={cn('text-xs', RISK_COLORS[d.severity])}>{RISK_LABELS[d.severity]}</Badge>
                                  <span className="text-sm font-mono">{(d.probability * 100).toFixed(0)}%</span>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-400">{d.physicalExplanation}</p>
                            </div>
                          ))}
                        </div>
                      </PageCard>
                    )}

                    {/* 维护建议 */}
                    {report.recommendations?.length > 0 && (
                      <PageCard title={`维护建议 (${report.recommendations.length})`}>
                        <div className="space-y-3">
                          {report.recommendations.map((r: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg border border-zinc-700">
                              <div className="flex items-center gap-2 mb-2">
                                <Wrench className="w-4 h-4 text-zinc-400" />
                                <Badge className={cn('text-xs', PRIORITY_COLORS[r.priority])}>
                                  {PRIORITY_LABELS[r.priority] ?? r.priority}
                                </Badge>
                                {r.estimatedCostHours > 0 && (
                                  <span className="text-xs text-zinc-400 ml-auto">~{r.estimatedCostHours}h</span>
                                )}
                              </div>
                              <p className="text-sm font-medium">{r.action}</p>
                              <p className="text-xs text-zinc-400 mt-1">{r.rationale}</p>
                              {r.riskIfDeferred && (
                                <p className="text-xs text-orange-400 mt-1">延迟风险: {r.riskIfDeferred}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </PageCard>
                    )}

                    {/* 根因分析 */}
                    {report.rootCause && (
                      <PageCard title="根因分析">
                        <div className="space-y-3">
                          {report.rootCause.rootCauses?.map((rc: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg border border-zinc-700">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{rc.cause}</span>
                                <span className="text-sm font-mono">{(rc.probability * 100).toFixed(0)}%</span>
                              </div>
                              <p className="text-xs text-zinc-400">{rc.physicalMechanism}</p>
                              {rc.causalChain?.length > 0 && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-zinc-500">
                                  {rc.causalChain.map((step: string, j: number) => (
                                    <span key={j} className="flex items-center gap-1">
                                      {j > 0 && <ChevronRight className="w-3 h-3" />}
                                      {step}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </PageCard>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ━━━ Tab2: 配置 ━━━ */}
        <TabsContent value="config">
          <PageCard title="诊断增强引擎配置">
            {configQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : configQuery.data ? (
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(configQuery.data).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded border border-zinc-700">
                    <span className="text-sm text-zinc-400">{key}</span>
                    <span className="text-sm font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500">无法加载配置</p>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
