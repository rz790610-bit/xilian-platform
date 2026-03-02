/**
 * 智能诊断页面 — P1-5 数字孪生集成版
 *
 * 完整链路: 选择设备 → 16 传感器实时状态 → HDE 双轨诊断 → 三维模型定位
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useAppPlatformStore } from '@/stores/appPlatformStore';
import { useTwinStore } from '@/stores/twinStore';
import { useToast } from '@/components/common/Toast';
import {
  RTG_SENSORS,
  getSensorStatus,
  STATUS_COLORS,
  type SensorStatus,
} from '@/components/digital-twin/rtg-model/rtg-constants';
import {
  healthColor,
  severityInfo,
  DIAGNOSIS_STEPS,
  SYNC_STATUS_MAP,
  formatTime,
  withDemoFallback,
} from './constants';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Target,
  Lightbulb,
  Clock,
  History,
  Thermometer,
  Waves,
  Eye,
  Shield,
  Zap,
  ArrowRight,
} from 'lucide-react';

// ── 传感器组中文标签 ──────────────────────────────────────
const GROUP_LABELS: Record<string, { label: string; icon: typeof Waves }> = {
  hoist: { label: '起升机构', icon: Waves },
  trolley: { label: '小车运行', icon: Activity },
  gantry: { label: '大车电机', icon: Zap },
};

// ── Tailwind 状态色 ──────────────────────────────────────
const STATUS_TW: Record<SensorStatus, { bg: string; text: string; border: string }> = {
  normal: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/30' },
  alarm: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

// ── HDE 预设映射 ──────────────────────────────────────────
const HDE_PRESET_OPTIONS = [
  { value: 'normal', label: '正常运行' },
  { value: 'bearing_damage', label: '轴承损伤' },
  { value: 'electrical_fault', label: '电气故障' },
  { value: 'physics_violation', label: '物理异常 (传感器)' },
  { value: 'overload_idle', label: '空载过电流' },
] as const;

// ── 故障类型中文映射 ──────────────────────────────────────
const FAULT_TYPE_CN: Record<string, string> = {
  bearing_damage: '轴承损伤',
  gear_wear: '齿轮磨损',
  electrical_fault: '电气故障',
  imbalance: '不平衡',
  normal: '正常',
  looseness: '松动',
  misalignment: '不对中',
  overload: '过载',
  overload_idle: '空载过电流',
  physics_violation: '物理异常',
};
const faultTypeCN = (key: string) => FAULT_TYPE_CN[key] ?? key;

// ── 证据来源中文映射 ──────────────────────────────────────
const EVIDENCE_SOURCE_CN: Record<string, string> = {
  physics_track: '物理轨',
  data_track: '数据轨',
  expert: '专家',
  sensor: '传感器',
};
const evidenceSourceCN = (key: string) => EVIDENCE_SOURCE_CN[key] ?? key;

// ── 紧急程度标签 ──────────────────────────────────────────
const URGENCY_MAP: Record<string, { label: string; color: string }> = {
  monitoring: { label: '持续监控', color: 'text-blue-400' },
  scheduled: { label: '计划维护', color: 'text-yellow-500' },
  priority: { label: '优先处理', color: 'text-orange-500' },
  immediate: { label: '立即处理', color: 'text-red-500' },
};

export default function DiagnosisPage() {
  const params = useParams<{ deviceCode?: string }>();
  const [, navigate] = useLocation();
  const toast = useToast();
  const { selectedDeviceCode, setSelectedDeviceCode } = useAppPlatformStore();
  const { setSelectedEquipment, setSelectedSensorId } = useTwinStore();

  // URL 参数预选设备
  useEffect(() => {
    if (params.deviceCode && params.deviceCode !== selectedDeviceCode) {
      setSelectedDeviceCode(params.deviceCode);
    }
  }, [params.deviceCode, selectedDeviceCode, setSelectedDeviceCode]);

  const effectiveDevice = params.deviceCode ?? selectedDeviceCode;

  // ── 状态 ───────────────────────────────────────────────
  const [description, setDescription] = useState('');
  const [presetId, setPresetId] = useState<string>('bearing_damage');
  const [activeStep, setActiveStep] = useState(-1);
  const [diagTab, setDiagTab] = useState<string>('run');

  // ── tRPC 查询 ──────────────────────────────────────────
  const twinsQuery = trpc.evoPipeline.listEquipmentTwins.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const twins = twinsQuery.data ?? [];

  const twinStateQuery = trpc.evoPipeline.getEquipmentTwinState.useQuery(
    { equipmentId: effectiveDevice ?? '' },
    { enabled: !!effectiveDevice, refetchInterval: 10_000 },
  );
  const twinState = twinStateQuery.data;

  const historyQuery = trpc.database.diagnosisDb.listDiagnosisResults.useQuery(
    { deviceCode: effectiveDevice ?? undefined, page: 1, pageSize: 10 },
    { enabled: !!effectiveDevice },
  );

  // ── HDE 双轨诊断 mutation ─────────────────────────────
  const hdePresetMutation = trpc.hdeDiagnostic.diagnosePreset.useMutation();

  // ── 传感器数据映射 ─────────────────────────────────────
  // 从 twinState.stateVector 提取 16 个传感器值
  const sensorValues = useMemo(() => {
    const vals: Record<string, number | null> = {};
    const sv = twinState?.stateVector;
    if (Array.isArray(sv) && sv.length > 0) {
      RTG_SENSORS.forEach((sensor, idx) => {
        vals[sensor.id] = typeof sv[idx] === 'number' ? sv[idx] : null;
      });
    } else {
      // Demo: 生成确定性演示值
      RTG_SENSORS.forEach((sensor) => {
        let base: number;
        if (sensor.measurementType === 'temperature') {
          base = 52 + (sensor.id.charCodeAt(3) % 20);
        } else {
          base = 1.5 + (sensor.id.charCodeAt(3) % 5) * 0.8;
        }
        vals[sensor.id] = base;
      });
    }
    return vals;
  }, [twinState?.stateVector]);

  // 按组分组
  const sensorGroups = useMemo(() => {
    const groups: Record<string, typeof RTG_SENSORS> = {};
    for (const s of RTG_SENSORS) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    }
    return groups;
  }, []);

  // 异常传感器
  const anomalySensors = useMemo(() => {
    return RTG_SENSORS.filter((s) => {
      const v = sensorValues[s.id];
      const st = getSensorStatus(s, v);
      return st === 'warning' || st === 'alarm';
    });
  }, [sensorValues]);

  // ── HDE 诊断结果 ──────────────────────────────────────
  const [hdeResult, setHdeResult] = useState<Record<string, unknown> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 诊断完成后自动滚动到结果区域
  useEffect(() => {
    if (hdeResult && resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [hdeResult]);

  // ── 步骤动画 ──────────────────────────────────────────
  const animateSteps = useCallback(() => {
    setActiveStep(0);
    const t1 = setTimeout(() => setActiveStep(1), 1200);
    const t2 = setTimeout(() => setActiveStep(2), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── 触发 HDE 双轨诊断 ─────────────────────────────────
  const runDiagnosis = useCallback(async () => {
    if (!effectiveDevice) {
      toast.warning('请先选择设备');
      return;
    }

    setHdeResult(null);
    const cleanup = animateSteps();

    try {
      const resp = await hdePresetMutation.mutateAsync({ presetId });
      if (resp.success && resp.data) {
        setHdeResult(resp as unknown as Record<string, unknown>);
        setActiveStep(3);
        toast.success('HDE 双轨诊断完成');
        historyQuery.refetch();
      } else {
        toast.error('诊断失败，请稍后重试');
        setActiveStep(-1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast.error(`诊断异常: ${msg}`);
      setActiveStep(-1);
    } finally {
      cleanup();
    }
  }, [effectiveDevice, presetId, hdePresetMutation, animateSteps, toast, historyQuery]);

  const isRunning = hdePresetMutation.isPending;

  // ── 提取 HDE 结果字段 ─────────────────────────────────
  const hdeData = (hdeResult as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const diagnosis = hdeData?.diagnosis as Record<string, unknown> | undefined;
  const trackResults = hdeData?.trackResults as Record<string, unknown> | undefined;
  const fusionResult = hdeData?.fusionResult as Record<string, unknown> | undefined;
  const physicsValidation = hdeData?.physicsValidation as Record<string, unknown> | undefined;
  const recommendations = hdeData?.recommendations as Array<Record<string, unknown>> | undefined;
  const presetInfo = (hdeResult as Record<string, unknown>)?.preset as Record<string, unknown> | undefined;

  const faultType = diagnosis?.faultType as string | undefined;
  const confidence = diagnosis?.confidence as number | undefined;
  const severity = diagnosis?.severity as string | undefined;
  const urgency = diagnosis?.urgency as string | undefined;
  const physicsExplanation = diagnosis?.physicsExplanation as string | undefined;
  const evidenceChain = diagnosis?.evidenceChain as Array<Record<string, unknown>> | undefined;
  const conflict = fusionResult?.conflict as number | undefined;
  const physicsValid = physicsValidation?.isValid as boolean | undefined;
  const physicsExpl = physicsValidation?.physicsExplanation as string | undefined;
  const durationMs = hdeData?.durationMs as number | undefined;

  // ── 跳转三维模型 ──────────────────────────────────────
  const goToTwin3D = useCallback(() => {
    if (effectiveDevice) {
      setSelectedEquipment(effectiveDevice);
      // 选中第一个异常传感器
      if (anomalySensors.length > 0) {
        setSelectedSensorId(anomalySensors[0].id);
      }
      navigate('/digital-twin');
    }
  }, [effectiveDevice, anomalySensors, setSelectedEquipment, setSelectedSensorId, navigate]);

  return (
    <div className="space-y-4">
      {/* ── 设备选择 + 状态 ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={effectiveDevice ?? ''}
          onValueChange={(v) => setSelectedDeviceCode(v)}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="选择设备..." />
          </SelectTrigger>
          <SelectContent>
            {twins.map((t) => (
              <SelectItem key={t.equipmentId} value={t.equipmentId}>
                {t.equipmentName} ({t.equipmentId})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {twinState && effectiveDevice && (
          <div className="flex items-center gap-4 text-sm">
            {(() => {
              const hs = withDemoFallback(twinState.health?.overallScore ?? null, effectiveDevice, 'health');
              return (
                <span className="flex items-center gap-1.5">
                  <Activity className={cn('h-4 w-4', healthColor(hs))} />
                  <span>健康</span>
                  <span className={cn('font-bold', healthColor(hs))}>
                    {Math.round(hs)}
                  </span>
                </span>
              );
            })()}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  SYNC_STATUS_MAP[twinState.syncStatus]?.dot ?? 'bg-gray-400',
                )}
              />
              <span>{SYNC_STATUS_MAP[twinState.syncStatus]?.label ?? twinState.syncStatus}</span>
            </span>
            {anomalySensors.length > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 gap-1">
                <AlertTriangle className="h-3 w-3" />
                {anomalySensors.length} 个传感器异常
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── 16 传感器实时状态面板 ────────────────────────── */}
      {effectiveDevice && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Waves className="h-4 w-4 text-primary" />
              实时传感器状态
              <span className="text-xs text-muted-foreground font-normal ml-auto">
                16 个 VT 传感器
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(['hoist', 'trolley', 'gantry'] as const).map((groupKey) => {
                const sensors = sensorGroups[groupKey] ?? [];
                const info = GROUP_LABELS[groupKey];
                const Icon = info?.icon ?? Waves;
                return (
                  <div key={groupKey}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {info?.label ?? groupKey}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                      {sensors.map((sensor) => {
                        const val = sensorValues[sensor.id];
                        const status = getSensorStatus(sensor, val);
                        const tw = STATUS_TW[status];
                        const isTemp = sensor.measurementType === 'temperature';
                        return (
                          <div
                            key={sensor.id}
                            className={cn(
                              'rounded-lg border px-2.5 py-2 transition-all',
                              tw.bg, tw.border,
                              status === 'alarm' && 'ring-1 ring-red-500/40',
                            )}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {isTemp ? (
                                <Thermometer className={cn('h-3 w-3', tw.text)} />
                              ) : (
                                <Waves className={cn('h-3 w-3', tw.text)} />
                              )}
                              <span className="text-[10px] text-muted-foreground truncate">
                                {sensor.id}
                              </span>
                            </div>
                            <div className={cn('text-lg font-bold tabular-nums leading-none', tw.text)}>
                              {val != null ? val.toFixed(1) : '-'}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {sensor.label}
                            </div>
                            <div className="text-[9px] text-muted-foreground/60">
                              {sensor.unit} | W:{sensor.thresholds.warning} A:{sensor.thresholds.alarm}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs: 执行诊断 / 历史记录 ───────────────────── */}
      <Tabs value={diagTab} onValueChange={setDiagTab}>
        <TabsList>
          <TabsTrigger value="run" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            HDE 双轨诊断
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            诊断历史
          </TabsTrigger>
        </TabsList>

        {/* ── 执行诊断 ──────────────────────────────────── */}
        <TabsContent value="run" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">故障描述 (可选)</label>
                <Textarea
                  placeholder="描述设备异常表现，如: 起升电机振动增大，伴有异响..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={isRunning}
                />
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">诊断场景</label>
                  <Select value={presetId} onValueChange={setPresetId} disabled={isRunning}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HDE_PRESET_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={runDiagnosis}
                  disabled={isRunning || !effectiveDevice}
                  className="gap-2"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isRunning ? '诊断中...' : '开始诊断'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 诊断步骤指示器 */}
          {activeStep >= 0 && (
            <div className="flex items-center gap-2">
              {DIAGNOSIS_STEPS.map((step, idx) => {
                const done = activeStep > idx;
                const active = activeStep === idx;
                return (
                  <div key={step.key} className="flex items-center gap-2">
                    {idx > 0 && (
                      <div className={cn('h-px w-8', done ? 'bg-emerald-500' : 'bg-border')} />
                    )}
                    <div
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                        done && 'bg-emerald-500/15 text-emerald-500',
                        active && 'bg-primary/15 text-primary animate-pulse',
                        !done && !active && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── HDE 诊断结果 ──────────────────────────── */}
          {hdeResult && diagnosis && (
            <div ref={resultRef} className="space-y-3">
              {/* 主结论卡 */}
              <Card className="border-l-4" style={{
                borderLeftColor: severity === 'critical' || severity === 'high'
                  ? '#ef4444'
                  : severity === 'medium'
                    ? '#eab308'
                    : '#10b981',
              }}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className={cn('h-5 w-5', severityInfo(severity ?? 'medium').color)} />
                    <Badge className={cn('text-xs', severityInfo(severity ?? 'medium').badge)}>
                      {severityInfo(severity ?? 'medium').label}
                    </Badge>
                    <span>{faultType ? faultTypeCN(faultType) : '诊断结论'}</span>
                    {confidence != null && (
                      <span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
                        置信度
                        <Progress value={confidence * 100} className="w-20 h-2" />
                        <span className="tabular-nums font-medium text-foreground">
                          {Math.round(confidence * 100)}%
                        </span>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 紧急程度 + 预设信息 */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {urgency && URGENCY_MAP[urgency] && (
                      <Badge variant="outline" className={cn('gap-1', URGENCY_MAP[urgency].color)}>
                        <Clock className="h-3 w-3" />
                        {URGENCY_MAP[urgency].label}
                      </Badge>
                    )}
                    {presetInfo && (
                      <Badge variant="outline" className="text-muted-foreground gap-1">
                        <Target className="h-3 w-3" />
                        场景: {presetInfo.name as string}
                      </Badge>
                    )}
                    {durationMs != null && (
                      <Badge variant="outline" className="text-muted-foreground gap-1">
                        <Zap className="h-3 w-3" />
                        {durationMs}ms
                      </Badge>
                    )}
                  </div>

                  {/* 物理解释 */}
                  {physicsExplanation && (
                    <div className="flex gap-2">
                      <Target className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div>
                        <div className="text-sm font-medium">物理机理分析</div>
                        <div className="text-sm text-muted-foreground">{physicsExplanation}</div>
                      </div>
                    </div>
                  )}

                  {/* 物理校验状态 */}
                  {physicsValidation && (
                    <div className="flex gap-2">
                      <Shield className={cn('h-4 w-4 mt-0.5 shrink-0', physicsValid ? 'text-emerald-500' : 'text-red-500')} />
                      <div>
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          物理约束校验
                          <Badge variant="outline" className={cn('text-[10px]',
                            physicsValid ? 'text-emerald-500 border-emerald-500/30' : 'text-red-500 border-red-500/30'
                          )}>
                            {physicsValid ? '通过' : '未通过'}
                          </Badge>
                        </div>
                        {physicsExpl && (
                          <div className="text-sm text-muted-foreground">{physicsExpl}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 双轨融合信息 */}
                  {fusionResult && (
                    <div className="flex gap-2">
                      <Zap className="h-4 w-4 mt-0.5 text-purple-500 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">DS 融合结果</div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            策略: {fusionResult.strategyUsed as string}
                          </Badge>
                          {conflict != null && (
                            <Badge variant="outline" className={cn('text-[10px]',
                              conflict > 0.5 ? 'text-red-500 border-red-500/30' : 'text-emerald-500 border-emerald-500/30'
                            )}>
                              冲突度: {(conflict * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 证据链 */}
                  {evidenceChain && evidenceChain.length > 0 && (
                    <div className="flex gap-2">
                      <Eye className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">证据链</div>
                        <div className="space-y-1 mt-1">
                          {evidenceChain.map((ev, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {evidenceSourceCN(ev.source as string)}
                              </Badge>
                              <span className="text-muted-foreground truncate">{ev.description as string}</span>
                              <span className="tabular-nums text-muted-foreground shrink-0">
                                {Math.round((ev.strength as number) * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 双轨详情 */}
                  {trackResults && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      <TrackCard
                        title="物理优先轨"
                        icon={<Shield className="h-3.5 w-3.5 text-blue-500" />}
                        track={trackResults.physics as Record<string, unknown> | null}
                      />
                      <TrackCard
                        title="数据驱动轨"
                        icon={<Activity className="h-3.5 w-3.5 text-purple-500" />}
                        track={trackResults.data as Record<string, unknown> | null}
                      />
                    </div>
                  )}

                  {/* 建议 */}
                  {recommendations && recommendations.length > 0 && (
                    <div className="flex gap-2">
                      <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">处置建议</div>
                        <ul className="text-sm text-muted-foreground list-none space-y-1 mt-1">
                          {recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5',
                                severityInfo((rec.priority as string) ?? 'medium').badge
                              )}>
                                {severityInfo((rec.priority as string) ?? 'medium').label}
                              </Badge>
                              <div>
                                <span>{rec.action as string}</span>
                                {typeof rec.rationale === 'string' && rec.rationale && (
                                  <span className="text-muted-foreground/60 ml-1">— {rec.rationale}</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* 查看详情按钮 → 数字孪生三维模型 */}
                  <div className="pt-2 border-t flex justify-end">
                    <Button variant="outline" onClick={goToTwin3D} className="gap-2">
                      <Eye className="h-4 w-4" />
                      查看三维模型
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── 诊断历史 ──────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <HistoryList data={historyQuery.data} isLoading={historyQuery.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── 双轨详情子卡 ──────────────────────────────────────────
function TrackCard({
  title,
  icon,
  track,
}: {
  title: string;
  icon: React.ReactNode;
  track: Record<string, unknown> | null;
}) {
  if (!track) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
        {title} — 未执行
      </div>
    );
  }

  const conf = track.confidence as number | undefined;
  const hypotheses = track.faultHypotheses as Array<Record<string, unknown>> | undefined;
  const execTime = track.executionTimeMs as number | undefined;

  return (
    <div className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
        {execTime != null && (
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{execTime}ms</span>
        )}
      </div>
      {conf != null && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">置信度</span>
          <Progress value={conf * 100} className="flex-1 h-1.5" />
          <span className="tabular-nums">{Math.round(conf * 100)}%</span>
        </div>
      )}
      {hypotheses && hypotheses.length > 0 && (
        <div className="space-y-0.5">
          {hypotheses.slice(0, 3).map((h, i) => (
            <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="truncate">{faultTypeCN(h.faultType as string)}</span>
              <span className="tabular-nums ml-auto">
                p={((h.priorProbability as number) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 诊断历史子组件 ────────────────────────────────────────
function HistoryList({
  data,
  isLoading,
}: {
  data: unknown;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载历史记录...
      </div>
    );
  }

  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.items)
      ? ((data as Record<string, unknown>).items as unknown[])
      : [];

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        暂无诊断历史记录
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const r = item as Record<string, unknown>;
        const sev = severityInfo((r.severity as string) ?? 'medium');
        return (
          <Card key={(r.id as string) ?? idx} className="p-3">
            <div className="flex items-center gap-3">
              <Badge className={cn('text-xs shrink-0', sev.badge)}>
                {sev.label}
              </Badge>
              <span className="text-sm font-medium truncate flex-1">
                {(r.diagnosisType as string) ?? (r.description as string) ?? '诊断记录'}
              </span>
              {r.confidence != null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round((r.confidence as number) * 100)}%
                </span>
              )}
              <span className="text-xs text-muted-foreground shrink-0">
                {formatTime(r.createdAt as string)}
              </span>
            </div>
            {typeof r.rootCause === 'string' && r.rootCause && (
              <div className="text-xs text-muted-foreground mt-1 pl-[52px] line-clamp-1">
                {r.rootCause}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
