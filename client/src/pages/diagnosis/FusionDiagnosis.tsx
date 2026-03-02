/**
 * 融合诊断 — Fusion Diagnosis
 *
 * 功能：
 * 1. 诊断控制台 — 输入传感器数据，执行融合诊断
 * 2. 专家管理 — 查看/注册/注销/调权
 * 3. 结果可视化 — DS 信念质量分布、冲突分析、证据链
 * 4. 诊断历史 — 查看历史诊断记录
 * 5. 引擎配置 — 故障类型映射、辨识框架
 */
import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  ConfigSection, ConfigSlider, ConfigInput, ConfigSelect, ConfigKV, ConfigActions, ApiDocBlock,
} from '@/components/common/AlgorithmConfigPanel';
import {
  Activity, Zap, Thermometer, Gauge, Play, Settings2, Users, History,
  AlertTriangle, CheckCircle2, XCircle, Info, ChevronRight, RefreshCw,
  Plus, Trash2, Weight, Brain, BarChart3, PieChart, Target, Shield,
  ArrowUpRight, ArrowDownRight, Minus, Eye, Download, Layers, GitBranch,
  Cpu, ShieldCheck, Timer, Loader2,
} from 'lucide-react';

// ==================== 类型 ====================

interface SensorInput {
  vibrationRms: number;
  dominantFrequency: number;
  temperature: number;
  temperatureRise: number;
  currentImbalance: number;
  thd: number;
  component: string;
}

interface DiagnosisResultData {
  faultType: string;
  confidence: number;
  severity: string;
  evidenceSummary: Array<{
    expert: string;
    diagnosis: string;
    confidence: number;
    evidence: Record<string, any>;
  }>;
  recommendations: string[];
  conflictInfo: {
    hasConflict: boolean;
    conflictDegree: number;
    conflicts: Array<{
      expert1: string;
      expert2: string;
      diagnosis1: string;
      diagnosis2: string;
    }>;
  };
  fusionDetails: {
    beliefMass: Record<string, number>;
    conflict: number;
  };
  diagnosisId: string;
  timestamp: string;
  duration: number;
  faultLabel: { zh: string; en: string; icon: string; color: string };
  severityLabel: { zh: string; color: string };
}

// ==================== 常量 ====================

const FAULT_TYPE_LABELS: Record<string, { zh: string; icon: string; color: string }> = {
  bearing_damage:   { zh: '轴承损伤', icon: '🔴', color: '#ef4444' },
  gear_wear:        { zh: '齿轮磨损', icon: '🟠', color: '#f97316' },
  misalignment:     { zh: '不对中',   icon: '🟡', color: '#eab308' },
  imbalance:        { zh: '不平衡',   icon: '🔵', color: '#3b82f6' },
  looseness:        { zh: '松动',     icon: '🟣', color: '#8b5cf6' },
  electrical_fault: { zh: '电气故障', icon: '⚡', color: '#ec4899' },
  normal:           { zh: '正常',     icon: '🟢', color: '#22c55e' },
  unknown:          { zh: '未知',     icon: '⚪', color: '#6b7280' },
  error:            { zh: '错误',     icon: '❌', color: '#dc2626' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
  normal: '#22c55e',
  unknown: '#6b7280',
};

const SEVERITY_ZH: Record<string, string> = {
  critical: '危急',
  high: '严重',
  medium: '中等',
  low: '轻微',
  normal: '正常',
  unknown: '未知',
};

const DEFAULT_SENSOR: SensorInput = {
  vibrationRms: 8.5,
  dominantFrequency: 156,
  temperature: 72,
  temperatureRise: 28,
  currentImbalance: 6.2,
  thd: 8.5,
  component: 'main_motor',
};

const PRESET_SCENARIOS: Array<{ name: string; desc: string; data: SensorInput }> = [
  {
    name: '正常运行',
    desc: '各项指标正常',
    data: { vibrationRms: 3.2, dominantFrequency: 50, temperature: 45, temperatureRise: 10, currentImbalance: 1.5, thd: 3.0, component: 'main_motor' },
  },
  {
    name: '轴承早期故障',
    desc: '高频振动 + 温升偏高',
    data: { vibrationRms: 9.5, dominantFrequency: 320, temperature: 78, temperatureRise: 35, currentImbalance: 3.0, thd: 5.0, component: 'bearing_01' },
  },
  {
    name: '电气故障',
    desc: '电流不平衡 + 谐波畸变',
    data: { vibrationRms: 5.0, dominantFrequency: 100, temperature: 55, temperatureRise: 15, currentImbalance: 12.5, thd: 18.0, component: 'motor_drive' },
  },
  {
    name: '严重松动',
    desc: '高振动 + 宽频噪声',
    data: { vibrationRms: 18.0, dominantFrequency: 80, temperature: 60, temperatureRise: 20, currentImbalance: 4.0, thd: 6.0, component: 'foundation' },
  },
  {
    name: '齿轮磨损',
    desc: '中频振动 + 电流波动',
    data: { vibrationRms: 7.5, dominantFrequency: 180, temperature: 65, temperatureRise: 22, currentImbalance: 7.0, thd: 4.5, component: 'gearbox' },
  },
];

const COMPONENT_OPTIONS = [
  { value: 'main_motor', label: '主电机' },
  { value: 'bearing_01', label: '轴承 #1' },
  { value: 'bearing_02', label: '轴承 #2' },
  { value: 'gearbox', label: '齿轮箱' },
  { value: 'motor_drive', label: '驱动器' },
  { value: 'foundation', label: '基础结构' },
  { value: 'coupling', label: '联轴器' },
];

// ==================== HDE 双轨诊断结果类型 ====================

interface HDETrackResult {
  trackType: string;
  faultHypotheses: Array<{
    id: string;
    faultType: string;
    priorProbability: number;
    supportingEvidence: string[];
    physicsMechanism?: string;
  }>;
  beliefMass: Record<string, number>;
  confidence: number;
  physicsConstraints: Array<{
    id: string;
    name: string;
    type: string;
    expression: string;
    satisfied?: boolean;
    violationDegree?: number;
    explanation: string;
  }>;
  executionTimeMs: number;
}

interface HDEDiagnosisResult {
  sessionId: string;
  machineId: string;
  timestamp: number;
  diagnosis: {
    faultType: string;
    confidence: number;
    severity: string;
    urgency: string;
    physicsExplanation?: string;
    evidenceChain?: Array<{
      source: string;
      type: string;
      description: string;
      strength: number;
    }>;
  };
  trackResults: {
    physics: HDETrackResult | null;
    data: HDETrackResult | null;
  };
  fusionResult: {
    fusedMass: Record<string, number>;
    conflict: number;
    strategyUsed: string;
  };
  physicsValidation: {
    isValid: boolean;
    violations: Array<{ id: string; name: string; explanation: string; violationDegree?: number }>;
    adjustedConfidence: number;
    physicsExplanation: string;
  };
  recommendations: Array<{
    priority: string;
    action: string;
    rationale: string;
  }>;
  durationMs: number;
  metadata: Record<string, unknown>;
}

// ==================== HDE 双轨诊断 Tab ====================

const HDE_PRESET_SCENARIOS = [
  { id: 'normal', name: '正常运行', desc: '各项指标正常', icon: '🟢' },
  { id: 'bearing_damage', name: '轴承外圈损伤', desc: '冲击脉冲，峰值因子>4', icon: '🔴' },
  { id: 'electrical_fault', name: '电气故障', desc: '电流不稳定 CV>0.3', icon: '⚡' },
  { id: 'physics_violation', name: '物理异常', desc: '振动负值，传感器故障', icon: '🚫' },
  { id: 'overload_idle', name: '空载过电流', desc: '机械卡阻嫌疑', icon: '⚠️' },
];

const URGENCY_LABELS: Record<string, { zh: string; color: string }> = {
  monitoring: { zh: '持续监测', color: '#22c55e' },
  scheduled: { zh: '计划维修', color: '#eab308' },
  priority: { zh: '优先处理', color: '#f97316' },
  immediate: { zh: '立即停机', color: '#ef4444' },
};

const STRATEGY_LABELS: Record<string, string> = {
  dempster: 'Dempster',
  murphy: 'Murphy (高冲突)',
  yager: 'Yager (极端冲突)',
};

function DualTrackDiagnosisTab() {
  const [, navigate] = useLocation();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [hdeResult, setHdeResult] = useState<HDEDiagnosisResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const toast = useToast();
  const diagnoseMutation = trpc.hdeDiagnostic.diagnosePreset.useMutation();

  const runDiagnosis = useCallback(async (presetId: string) => {
    setSelectedPreset(presetId);
    setIsRunning(true);
    setHdeResult(null);
    try {
      const resp = await diagnoseMutation.mutateAsync({ presetId });
      if (resp.success && resp.data) {
        setHdeResult(resp.data as unknown as HDEDiagnosisResult);
        toast.success(`双轨诊断完成: ${resp.data.durationMs}ms`);
      } else {
        toast.error('诊断失败: ' + ((resp as any).error || 'unknown'));
      }
    } catch (err: any) {
      toast.error(`诊断异常: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [diagnoseMutation, toast]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* 左侧: 场景选择 */}
      <div className="col-span-4 space-y-3">
        <PageCard title="诊断场景" icon={<Target className="w-4 h-4" />} compact>
          <p className="text-[10px] text-muted-foreground mt-1 mb-2">
            物理约束轨 + 数据驱动轨 → DS 融合 → 物理校验
          </p>
          <div className="space-y-1.5">
            {HDE_PRESET_SCENARIOS.map(p => (
              <button
                key={p.id}
                onClick={() => runDiagnosis(p.id)}
                disabled={isRunning}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md border transition-all text-left',
                  selectedPreset === p.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5',
                  isRunning && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className="text-base">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{p.desc}</div>
                </div>
                {isRunning && selectedPreset === p.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </PageCard>

        {/* 流程示意 */}
        <PageCard title="双轨架构" icon={<GitBranch className="w-4 h-4" />} compact>
          <div className="mt-2 space-y-1 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">物理约束轨</span>
              <span className="ml-auto text-blue-400">力学/材料/能量</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">数据驱动轨</span>
              <span className="ml-auto text-emerald-400">FFT/峰值/自相关</span>
            </div>
            <div className="border-l border-dashed border-muted-foreground/30 ml-1 pl-2.5 py-1">
              <span className="text-muted-foreground">↓ DS 融合 (Dempster/Murphy)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">物理约束校验</span>
              <span className="ml-auto text-amber-400">否决/调整</span>
            </div>
            <div className="border-l border-dashed border-muted-foreground/30 ml-1 pl-2.5 py-1">
              <span className="text-muted-foreground">↓ 诊断结论 + 建议</span>
            </div>
          </div>
        </PageCard>
      </div>

      {/* 右侧: 诊断结果 */}
      <div className="col-span-8 space-y-3">
        {!hdeResult && !isRunning && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GitBranch className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">双轨诊断引擎</p>
            <p className="text-xs mt-1">选择左侧场景执行物理轨 + 数据轨并行诊断</p>
          </div>
        )}

        {isRunning && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">双轨并行诊断中...</p>
            <p className="text-[10px] text-muted-foreground mt-1">物理约束轨 + 数据驱动轨 → DS 融合</p>
          </div>
        )}

        {hdeResult && !isRunning && (
          <>
            {/* 诊断结论卡片 */}
            <div className="grid grid-cols-4 gap-2">
              <div className={cn(
                'rounded-lg border p-3',
                hdeResult.diagnosis.severity === 'low' ? 'border-emerald-500/30 bg-emerald-500/5' :
                hdeResult.diagnosis.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                hdeResult.diagnosis.severity === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                'border-red-500/30 bg-red-500/5',
              )}>
                <div className="text-[10px] text-muted-foreground">故障类型</div>
                <div className="text-sm font-bold mt-0.5 flex items-center gap-1.5">
                  <span>{(FAULT_TYPE_LABELS[hdeResult.diagnosis.faultType] || FAULT_TYPE_LABELS.unknown).icon}</span>
                  {(FAULT_TYPE_LABELS[hdeResult.diagnosis.faultType] || FAULT_TYPE_LABELS.unknown).zh}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] text-muted-foreground">置信度</div>
                <div className="text-sm font-bold font-mono mt-0.5">
                  {(hdeResult.diagnosis.confidence * 100).toFixed(1)}%
                </div>
                <Progress value={hdeResult.diagnosis.confidence * 100} className="h-1 mt-1" />
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] text-muted-foreground">紧急程度</div>
                <div className="text-sm font-bold mt-0.5" style={{
                  color: URGENCY_LABELS[hdeResult.diagnosis.urgency]?.color || '#6b7280',
                }}>
                  {URGENCY_LABELS[hdeResult.diagnosis.urgency]?.zh || hdeResult.diagnosis.urgency}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] text-muted-foreground">耗时 / 融合策略</div>
                <div className="text-sm font-bold font-mono mt-0.5">{hdeResult.durationMs}ms</div>
                <div className="text-[10px] text-muted-foreground">
                  {STRATEGY_LABELS[hdeResult.fusionResult.strategyUsed] || hdeResult.fusionResult.strategyUsed}
                </div>
              </div>
            </div>

            {/* 双轨对比 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 物理轨 */}
              <PageCard
                title="物理约束轨" icon={<ShieldCheck className="w-3.5 h-3.5 text-blue-400" />}
                compact
              >
                {hdeResult.trackResults.physics ? (
                  <div className="space-y-2 mt-2">
                    <div className="text-[10px] text-muted-foreground">
                      执行耗时: {hdeResult.trackResults.physics.executionTimeMs}ms |
                      假设数: {hdeResult.trackResults.physics.faultHypotheses.length}
                    </div>
                    {/* 物理约束检查 */}
                    {hdeResult.trackResults.physics.physicsConstraints.map(c => (
                      <div key={c.id} className={cn(
                        'flex items-start gap-2 px-2 py-1.5 rounded text-[11px]',
                        c.satisfied ? 'bg-emerald-500/10' : 'bg-red-500/10',
                      )}>
                        {c.satisfied ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted-foreground text-[10px]">{c.explanation}</div>
                        </div>
                      </div>
                    ))}
                    {/* 信念质量 */}
                    <div className="text-[10px] text-muted-foreground mt-1 font-medium">信念质量分布:</div>
                    <HDEBeliefBars mass={hdeResult.trackResults.physics.beliefMass} />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">未启用</div>
                )}
              </PageCard>

              {/* 数据轨 */}
              <PageCard
                title="数据驱动轨" icon={<Cpu className="w-3.5 h-3.5 text-emerald-400" />}
                compact
              >
                {hdeResult.trackResults.data ? (
                  <div className="space-y-2 mt-2">
                    <div className="text-[10px] text-muted-foreground">
                      执行耗时: {hdeResult.trackResults.data.executionTimeMs}ms |
                      假设数: {hdeResult.trackResults.data.faultHypotheses.length}
                    </div>
                    {/* 故障假设 */}
                    {hdeResult.trackResults.data.faultHypotheses.map(h => (
                      <div key={h.id} className="px-2 py-1.5 rounded bg-muted/50 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span>{(FAULT_TYPE_LABELS[h.faultType] || FAULT_TYPE_LABELS.unknown).icon}</span>
                          <span className="font-medium">
                            {(FAULT_TYPE_LABELS[h.faultType] || FAULT_TYPE_LABELS.unknown).zh}
                          </span>
                          <span className="text-muted-foreground ml-auto font-mono">
                            p={h.priorProbability.toFixed(2)}
                          </span>
                        </div>
                        {h.supportingEvidence.map((e, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground mt-0.5 pl-5">
                            {e}
                          </div>
                        ))}
                      </div>
                    ))}
                    {hdeResult.trackResults.data.faultHypotheses.length === 0 && (
                      <div className="text-xs text-emerald-500 flex items-center gap-1 py-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 未检出异常模式
                      </div>
                    )}
                    {/* 信念质量 */}
                    <div className="text-[10px] text-muted-foreground mt-1 font-medium">信念质量分布:</div>
                    <HDEBeliefBars mass={hdeResult.trackResults.data.beliefMass} />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">未启用</div>
                )}
              </PageCard>
            </div>

            {/* DS 融合结果 */}
            <PageCard
              title="DS 融合结果" icon={<Brain className="w-3.5 h-3.5 text-purple-400" />}
              compact
            >
              <div className="grid grid-cols-12 gap-4 mt-2">
                <div className="col-span-8">
                  <div className="text-[10px] text-muted-foreground mb-1">融合后信念质量 (9 假设):</div>
                  <HDEBeliefBars mass={hdeResult.fusionResult.fusedMass} showAll />
                </div>
                <div className="col-span-4 space-y-2">
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="text-[10px] text-muted-foreground">冲突度</div>
                    <div className={cn(
                      'text-lg font-bold font-mono',
                      hdeResult.fusionResult.conflict > 0.7 ? 'text-red-400' :
                      hdeResult.fusionResult.conflict > 0.3 ? 'text-amber-400' : 'text-emerald-400',
                    )}>
                      {hdeResult.fusionResult.conflict.toFixed(3)}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="text-[10px] text-muted-foreground">融合策略</div>
                    <div className="text-sm font-medium">
                      {STRATEGY_LABELS[hdeResult.fusionResult.strategyUsed] || hdeResult.fusionResult.strategyUsed}
                    </div>
                  </div>
                  <div className={cn(
                    'rounded-md p-2',
                    hdeResult.physicsValidation.isValid ? 'bg-emerald-500/10' : 'bg-red-500/10',
                  )}>
                    <div className="text-[10px] text-muted-foreground">物理校验</div>
                    <div className={cn(
                      'text-sm font-medium flex items-center gap-1',
                      hdeResult.physicsValidation.isValid ? 'text-emerald-400' : 'text-red-400',
                    )}>
                      {hdeResult.physicsValidation.isValid ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> 通过</>
                      ) : (
                        <><XCircle className="w-3.5 h-3.5" /> 否决</>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </PageCard>

            {/* 建议 */}
            {hdeResult.recommendations.length > 0 && (
              <PageCard
                title="诊断建议" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                compact
              >
                <div className="space-y-1.5 mt-2">
                  {hdeResult.recommendations.map((r, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-2 px-2.5 py-2 rounded text-[11px]',
                      r.priority === 'critical' ? 'bg-red-500/10 border border-red-500/20' :
                      r.priority === 'high' ? 'bg-orange-500/10 border border-orange-500/20' :
                      r.priority === 'medium' ? 'bg-amber-500/10 border border-amber-500/20' :
                      'bg-muted/50',
                    )}>
                      <Badge variant="outline" className={cn(
                        'text-[9px] shrink-0',
                        r.priority === 'critical' ? 'border-red-500 text-red-400' :
                        r.priority === 'high' ? 'border-orange-500 text-orange-400' :
                        r.priority === 'medium' ? 'border-amber-500 text-amber-400' :
                        'text-muted-foreground',
                      )}>
                        {r.priority}
                      </Badge>
                      <div>
                        <div className="font-medium">{r.action}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">{r.rationale}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>
            )}

            {/* 元数据 + 跳转三维模型 */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>Session: {hdeResult.sessionId}</span>
              <span>|</span>
              <span>版本: {String(hdeResult.metadata.version)}</span>
              <span>|</span>
              <span>阶段: {String(hdeResult.metadata.phase)}</span>
              <span className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] gap-1"
                  onClick={() => navigate('/digital-twin/3d')}
                >
                  <Eye className="w-3 h-3" />
                  查看三维模型
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** HDE 信念质量条形图（简化版） */
function HDEBeliefBars({ mass, showAll }: { mass: Record<string, number>; showAll?: boolean }) {
  const entries = Object.entries(mass)
    .filter(([k]) => k !== 'theta')
    .sort((a, b) => b[1] - a[1]);
  const display = showAll ? entries : entries.slice(0, 4);
  const maxVal = Math.max(...display.map(([, v]) => v), 0.01);
  const theta = mass.theta || 0;

  return (
    <div className="space-y-1">
      {display.map(([key, value]) => {
        const label = FAULT_TYPE_LABELS[key] || FAULT_TYPE_LABELS.unknown;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] w-16 truncate" title={label.zh}>
              {label.icon} {label.zh}
            </span>
            <div className="flex-1 h-3.5 bg-muted rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${(value / maxVal) * 100}%`, backgroundColor: label.color, opacity: 0.8 }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-1 text-[9px] font-mono text-foreground/70">
                {(value * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
      {theta > 0.01 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-16 text-muted-foreground">&#952; 不确定</span>
          <div className="flex-1 h-3.5 bg-muted rounded-sm overflow-hidden relative">
            <div
              className="h-full rounded-sm bg-gray-500/50 transition-all duration-500"
              style={{ width: `${(theta / maxVal) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-end pr-1 text-[9px] font-mono text-foreground/50">
              {(theta * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 子组件 ====================

/** 信念质量柱状图 */
function BeliefMassChart({ beliefMass }: { beliefMass: Record<string, number> }) {
  const entries = Object.entries(beliefMass)
    .filter(([k]) => k !== 'theta')
    .sort((a, b) => b[1] - a[1]);
  const theta = beliefMass.theta || 0;
  const maxVal = Math.max(...entries.map(([, v]) => v), 0.01);
  // [P2-F1 修复] 归一化校验：检查信念质量总和是否约等于 1
  const totalMass = entries.reduce((sum, [, v]) => sum + v, 0) + theta;
  const isAbnormal = Math.abs(totalMass - 1) > 0.05;

  return (
    <div className="space-y-2">
      {isAbnormal && (
        <div className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded flex items-center gap-1">
          ⚠️ 信念质量总和 = {totalMass.toFixed(3)}，偏离 1.0（差值 {Math.abs(totalMass - 1).toFixed(3)}），融合结果可能异常
        </div>
      )}
      {entries.map(([key, value]) => {
        const label = FAULT_TYPE_LABELS[key] || FAULT_TYPE_LABELS.unknown;
        const pct = (value * 100).toFixed(1);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs w-20 truncate" title={label.zh}>
              {label.icon} {label.zh}
            </span>
            <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{
                  width: `${(value / maxVal) * 100}%`,
                  backgroundColor: label.color,
                  opacity: 0.85,
                }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-1 text-[10px] font-mono text-foreground/70">
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2 opacity-60">
        <span className="text-xs w-20">θ 不确定</span>
        <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
          <div
            className="h-full rounded-sm bg-muted-foreground/30 transition-all duration-500"
            style={{ width: `${(theta / maxVal) * 100}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-end pr-1 text-[10px] font-mono text-foreground/50">
            {(theta * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/** 冲突指示器 */
function ConflictIndicator({ conflictInfo }: { conflictInfo: DiagnosisResultData['conflictInfo'] }) {
  const degree = conflictInfo.conflictDegree;
  const color = degree > 0.5 ? '#ef4444' : degree > 0.2 ? '#f97316' : '#22c55e';
  const label = degree > 0.5 ? '高冲突' : degree > 0.2 ? '中冲突' : '低冲突';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">冲突度</span>
        <Badge variant="outline" style={{ borderColor: color, color }}>
          {label} ({(degree * 100).toFixed(0)}%)
        </Badge>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${degree * 100}%`, backgroundColor: color }}
        />
      </div>
      {conflictInfo.conflicts.length > 0 && (
        <div className="space-y-1.5 mt-2">
          <span className="text-xs text-muted-foreground">冲突详情：</span>
          {conflictInfo.conflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1">
              <span className="font-medium">{c.expert1}</span>
              <span className="text-muted-foreground">→</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {FAULT_TYPE_LABELS[c.diagnosis1]?.zh || c.diagnosis1}
              </Badge>
              <span className="text-destructive mx-1">≠</span>
              <span className="font-medium">{c.expert2}</span>
              <span className="text-muted-foreground">→</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {FAULT_TYPE_LABELS[c.diagnosis2]?.zh || c.diagnosis2}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 证据链面板 */
function EvidenceChain({ evidenceSummary }: { evidenceSummary: DiagnosisResultData['evidenceSummary'] }) {
  return (
    <div className="space-y-2">
      {evidenceSummary.map((e, i) => {
        const faultLabel = FAULT_TYPE_LABELS[e.diagnosis] || FAULT_TYPE_LABELS.unknown;
        return (
          <div key={i} className="border border-border rounded-md p-2.5 bg-card/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </div>
                <span className="text-sm font-medium">{e.expert}</span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{ borderColor: faultLabel.color, color: faultLabel.color }}
              >
                {faultLabel.icon} {faultLabel.zh} ({(e.confidence * 100).toFixed(0)}%)
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              {Object.entries(e.evidence).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="opacity-60">{k}:</span>
                  <span className="font-mono">
                    {typeof v === 'number' ? v.toFixed(2) : JSON.stringify(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== 主组件 ====================

export default function FusionDiagnosis() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('console');
  const [sensorInput, setSensorInput] = useState<SensorInput>({ ...DEFAULT_SENSOR });
  const [diagResult, setDiagResult] = useState<DiagnosisResultData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<any>(null);

  // tRPC queries
  const expertsQuery = trpc.fusionDiagnosis.getExperts.useQuery();
  const configQuery = trpc.fusionDiagnosis.getConfig.useQuery();
  const historyQuery = trpc.fusionDiagnosis.getHistory.useQuery({ limit: 50 });
  const faultTypesQuery = trpc.fusionDiagnosis.getFaultTypes.useQuery();

  // tRPC mutations
  const diagnoseMutation = trpc.fusionDiagnosis.diagnose.useMutation();
  const updateWeightMutation = trpc.fusionDiagnosis.updateWeight.useMutation();
  const unregisterMutation = trpc.fusionDiagnosis.unregisterExpert.useMutation();
  const setPenaltyMutation = trpc.fusionDiagnosis.setConflictPenalty.useMutation();

  // 执行诊断
  const runDiagnosis = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await diagnoseMutation.mutateAsync({
        sensorData: {
          vibration_rms: sensorInput.vibrationRms,
          dominant_frequency: sensorInput.dominantFrequency,
          temperature: sensorInput.temperature,
          temperature_rise: sensorInput.temperatureRise,
          current_imbalance: sensorInput.currentImbalance,
          thd: sensorInput.thd,
        },
        component: sensorInput.component,
        deviceCode: 'DEV-001',
      });
      if (res.success) {
        setDiagResult(res.data as DiagnosisResultData);
        historyQuery.refetch();
        toast.success(`诊断完成: ${(res.data as any).faultLabel?.zh || res.data.faultType} (${(res.data.confidence * 100).toFixed(1)}%)`);
      }
    } catch (err: any) {
      toast.error(`诊断失败: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [sensorInput, diagnoseMutation, historyQuery, toast]);

  // 更新专家权重
  const handleUpdateWeight = useCallback(async (name: string, weight: number) => {
    try {
      await updateWeightMutation.mutateAsync({ expertName: name, weight });
      expertsQuery.refetch();
      toast.success(`${name} 权重已更新为 ${weight.toFixed(1)}`);
    } catch (err: any) {
      toast.error(`更新失败: ${err.message}`);
    }
  }, [updateWeightMutation, expertsQuery, toast]);

  // 注销专家
  const handleUnregister = useCallback(async (name: string) => {
    try {
      await unregisterMutation.mutateAsync({ expertName: name });
      expertsQuery.refetch();
      toast.success(`${name} 已注销`);
    } catch (err: any) {
      toast.error(`注销失败: ${err.message}`);
    }
  }, [unregisterMutation, expertsQuery, toast]);

  // 加载预设场景
  const loadPreset = useCallback((preset: typeof PRESET_SCENARIOS[0]) => {
    setSensorInput({ ...preset.data });
    toast.info(`已加载预设: ${preset.name}`);
  }, [toast]);

  // 统计数据
  const stats = useMemo(() => {
    const history = historyQuery.data?.items || [];
    const total = history.length;
    const faultCount = history.filter(h => h.result.faultType !== 'normal' && h.result.faultType !== 'error').length;
    const avgConf = total > 0 ? history.reduce((s, h) => s + h.result.confidence, 0) / total : 0;
    const avgDuration = total > 0 ? history.reduce((s, h) => s + h.duration, 0) / total : 0;
    return { total, faultCount, avgConf, avgDuration };
  }, [historyQuery.data]);

  return (
    <MainLayout title="融合诊断">
      <div className="space-y-4 animate-fade-up">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              融合诊断引擎
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              基于 Dempster-Shafer 证据理论的多专家融合诊断系统
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {expertsQuery.data?.count ?? 0} 个专家在线
            </Badge>
            <Badge variant="outline" className="text-xs">
              DS 证据融合
            </Badge>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard value={stats.total} label="诊断次数" icon="🧪" compact />
          <StatCard
            value={stats.faultCount}
            label="故障检出"
            icon="⚠️"
            trend={stats.total > 0 ? { value: Math.round((stats.faultCount / stats.total) * 100), isPositive: false } : undefined}
            compact
          />
          <StatCard value={`${(stats.avgConf * 100).toFixed(0)}%`} label="平均置信度" icon="🎯" compact />
          <StatCard value={`${stats.avgDuration.toFixed(0)}ms`} label="平均耗时" icon="⚡" compact />
        </div>

        {/* 主 Tab */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="console" className="text-xs gap-1">
              <Play className="w-3.5 h-3.5" /> 诊断控制台
            </TabsTrigger>
            <TabsTrigger value="experts" className="text-xs gap-1">
              <Users className="w-3.5 h-3.5" /> 专家管理
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <History className="w-3.5 h-3.5" /> 诊断历史
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs gap-1">
              <Settings2 className="w-3.5 h-3.5" /> 引擎配置
            </TabsTrigger>
            <TabsTrigger value="dual-track" className="text-xs gap-1">
              <GitBranch className="w-3.5 h-3.5" /> 双轨诊断
            </TabsTrigger>
          </TabsList>

          {/* ============ Tab 1: 诊断控制台 ============ */}
          <TabsContent value="console" className="space-y-4 mt-3">
            <div className="grid grid-cols-12 gap-4">
              {/* 左侧：输入面板 */}
              <div className="col-span-5 space-y-3">
                {/* 预设场景 */}
                <PageCard title="预设场景" icon={<Target className="w-4 h-4" />} compact>
                  <div className="grid grid-cols-1 gap-1.5 mt-2">
                    {PRESET_SCENARIOS.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => loadPreset(p)}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                      >
                        <div>
                          <span className="text-xs font-medium">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{p.desc}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </PageCard>

                {/* 传感器输入 */}
                <PageCard title="传感器数据" icon={<Activity className="w-4 h-4" />} compact>
                  <div className="space-y-3 mt-2">
                    {/* 组件选择 */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs w-24 shrink-0">监测组件</Label>
                      <Select
                        value={sensorInput.component}
                        onValueChange={(v) => setSensorInput(p => ({ ...p, component: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPONENT_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 振动 RMS */}
                    <SensorSlider
                      label="振动 RMS"
                      icon={<Activity className="w-3.5 h-3.5" />}
                      value={sensorInput.vibrationRms}
                      onChange={(v) => setSensorInput(p => ({ ...p, vibrationRms: v }))}
                      min={0} max={30} step={0.1} unit="mm/s"
                      zones={[
                        { max: 4.5, color: '#22c55e', label: '良好' },
                        { max: 7.1, color: '#eab308', label: '注意' },
                        { max: 11.2, color: '#f97316', label: '警告' },
                        { max: 30, color: '#ef4444', label: '危险' },
                      ]}
                    />

                    {/* 主频 */}
                    <SensorSlider
                      label="主频率"
                      icon={<BarChart3 className="w-3.5 h-3.5" />}
                      value={sensorInput.dominantFrequency}
                      onChange={(v) => setSensorInput(p => ({ ...p, dominantFrequency: v }))}
                      min={0} max={500} step={1} unit="Hz"
                    />

                    {/* 温度 */}
                    <SensorSlider
                      label="温度"
                      icon={<Thermometer className="w-3.5 h-3.5" />}
                      value={sensorInput.temperature}
                      onChange={(v) => setSensorInput(p => ({ ...p, temperature: v }))}
                      min={20} max={120} step={0.5} unit="°C"
                      zones={[
                        { max: 60, color: '#22c55e', label: '正常' },
                        { max: 75, color: '#eab308', label: '偏高' },
                        { max: 90, color: '#f97316', label: '过热' },
                        { max: 120, color: '#ef4444', label: '危险' },
                      ]}
                    />

                    {/* 温升 */}
                    <SensorSlider
                      label="温升"
                      icon={<ArrowUpRight className="w-3.5 h-3.5" />}
                      value={sensorInput.temperatureRise}
                      onChange={(v) => setSensorInput(p => ({ ...p, temperatureRise: v }))}
                      min={0} max={60} step={0.5} unit="°C"
                    />

                    {/* 电流不平衡 */}
                    <SensorSlider
                      label="电流不平衡"
                      icon={<Zap className="w-3.5 h-3.5" />}
                      value={sensorInput.currentImbalance}
                      onChange={(v) => setSensorInput(p => ({ ...p, currentImbalance: v }))}
                      min={0} max={20} step={0.1} unit="%"
                      zones={[
                        { max: 3, color: '#22c55e', label: '正常' },
                        { max: 7, color: '#eab308', label: '偏高' },
                        { max: 12, color: '#f97316', label: '异常' },
                        { max: 20, color: '#ef4444', label: '严重' },
                      ]}
                    />

                    {/* THD */}
                    <SensorSlider
                      label="谐波畸变"
                      icon={<Gauge className="w-3.5 h-3.5" />}
                      value={sensorInput.thd}
                      onChange={(v) => setSensorInput(p => ({ ...p, thd: v }))}
                      min={0} max={30} step={0.1} unit="%"
                    />
                  </div>

                  {/* 执行按钮 */}
                  <div className="mt-4 flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={runDiagnosis}
                      disabled={isRunning}
                    >
                      {isRunning ? (
                        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-1.5" />
                      )}
                      {isRunning ? '诊断中...' : '执行融合诊断'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSensorInput({ ...DEFAULT_SENSOR })}
                    >
                      重置
                    </Button>
                  </div>
                </PageCard>
              </div>

              {/* 右侧：结果面板 */}
              <div className="col-span-7 space-y-3">
                {diagResult ? (
                  <>
                    {/* 诊断结论 */}
                    <PageCard compact>
                      <div className="flex items-start gap-4">
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shrink-0"
                          style={{ backgroundColor: `${diagResult.faultLabel.color}15` }}
                        >
                          {diagResult.faultLabel.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold">{diagResult.faultLabel.zh}</h3>
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: diagResult.severityLabel.color,
                                color: diagResult.severityLabel.color,
                              }}
                            >
                              {diagResult.severityLabel.zh}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">
                              置信度:
                              <span className="font-mono font-bold ml-1" style={{ color: diagResult.faultLabel.color }}>
                                {(diagResult.confidence * 100).toFixed(1)}%
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              耗时: <span className="font-mono">{diagResult.duration}ms</span>
                            </span>
                            <span className="text-muted-foreground text-xs">
                              ID: {diagResult.diagnosisId}
                            </span>
                          </div>
                          {/* 置信度进度条 */}
                          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${diagResult.confidence * 100}%`,
                                backgroundColor: diagResult.faultLabel.color,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </PageCard>

                    {/* DS 信念质量 + 冲突分析 */}
                    <div className="grid grid-cols-2 gap-3">
                      <PageCard title="DS 信念质量分布" icon={<PieChart className="w-4 h-4" />} compact>
                        <div className="mt-2">
                          <BeliefMassChart beliefMass={diagResult.fusionDetails.beliefMass} />
                        </div>
                        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          DS 融合冲突度: {(diagResult.fusionDetails.conflict * 100).toFixed(1)}%
                        </div>
                      </PageCard>

                      <PageCard title="冲突分析" icon={<Shield className="w-4 h-4" />} compact>
                        <div className="mt-2">
                          <ConflictIndicator conflictInfo={diagResult.conflictInfo} />
                        </div>
                      </PageCard>
                    </div>

                    {/* 证据链 */}
                    <PageCard title="专家证据链" icon={<Layers className="w-4 h-4" />} compact>
                      <div className="mt-2">
                        <EvidenceChain evidenceSummary={diagResult.evidenceSummary} />
                      </div>
                    </PageCard>

                    {/* 建议措施 */}
                    {diagResult.recommendations.length > 0 && (
                      <PageCard title="建议措施" icon={<CheckCircle2 className="w-4 h-4" />} compact>
                        <div className="mt-2 space-y-1">
                          {diagResult.recommendations.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </PageCard>
                    )}
                  </>
                ) : (
                  <PageCard>
                    <div className="text-center py-16">
                      <Brain className="w-16 h-16 mx-auto mb-4 text-primary/30" />
                      <h3 className="text-lg font-semibold mb-2">等待诊断</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        配置传感器参数后点击「执行融合诊断」，<br />
                        系统将调用 {expertsQuery.data?.count ?? 0} 个专家进行 DS 证据融合
                      </p>
                      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> 振动分析</span>
                        <span>+</span>
                        <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" /> 温度分析</span>
                        <span>+</span>
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> 电流分析</span>
                        <span>=</span>
                        <span className="flex items-center gap-1 text-primary font-medium"><Brain className="w-3 h-3" /> 融合决策</span>
                      </div>
                    </div>
                  </PageCard>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ============ Tab 2: 专家管理 ============ */}
          <TabsContent value="experts" className="space-y-4 mt-3">
            <PageCard title="已注册专家" icon={<Users className="w-4 h-4" />} compact>
              {expertsQuery.data?.experts && expertsQuery.data.experts.length > 0 ? (
                <div className="space-y-3 mt-3">
                  {expertsQuery.data.experts.map((expert) => (
                    <div
                      key={expert.name}
                      className="border border-border rounded-lg p-3 bg-card/50 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            {expert.name.includes('Vibration') ? <Activity className="w-4 h-4 text-primary" /> :
                             expert.name.includes('Temperature') ? <Thermometer className="w-4 h-4 text-orange-500" /> :
                             expert.name.includes('Current') ? <Zap className="w-4 h-4 text-yellow-500" /> :
                             <Brain className="w-4 h-4 text-purple-500" />}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{expert.name}</span>
                            <div className="text-[10px] text-muted-foreground">
                              {expert.name.includes('Vibration') ? '振动信号分析 · ISO 10816' :
                               expert.name.includes('Temperature') ? '温度特征分析 · 热力学模型' :
                               expert.name.includes('Current') ? '电流信号分析 · 谐波检测' :
                               '自定义专家'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            权重: {expert.weight.toFixed(1)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleUnregister(expert.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* 权重滑块 */}
                      <div className="flex items-center gap-3">
                        <Weight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Slider
                          value={[expert.weight]}
                          min={0}
                          max={3}
                          step={0.1}
                          onValueCommit={(v) => handleUpdateWeight(expert.name, v[0])}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{expert.weight.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  暂无注册专家
                </div>
              )}
            </PageCard>

            {/* 专家说明 */}
            <PageCard title="专家接口规范" icon={<Info className="w-4 h-4" />} compact>
              <div className="mt-2 text-xs text-muted-foreground space-y-2">
                <p>每个诊断专家需实现两个核心方法：</p>
                <div className="bg-muted/50 rounded-md p-2 font-mono text-[11px]">
                  <div className="text-primary">diagnose(data) → DiagnosisResult</div>
                  <div className="text-muted-foreground ml-2">返回故障类型、置信度、严重等级、证据、建议</div>
                  <div className="text-primary mt-1">getBeliefMass(data) → {'{'} [faultType]: number, theta: number {'}'}</div>
                  <div className="text-muted-foreground ml-2">返回 DS 证据理论所需的信念质量函数</div>
                </div>
                <p>
                  Python 端通过 <code className="bg-muted px-1 rounded">BaseExpert</code> 抽象类实现，
                  TypeScript 端通过 <code className="bg-muted px-1 rounded">BaseExpert</code> 抽象类实现。
                  两端接口完全对齐，支持跨语言专家注册。
                </p>
              </div>
            </PageCard>
          </TabsContent>

          {/* ============ Tab 3: 诊断历史 ============ */}
          <TabsContent value="history" className="space-y-4 mt-3">
            <PageCard
              title={`诊断历史 (${historyQuery.data?.total ?? 0})`}
              icon={<History className="w-4 h-4" />}
              action={
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => historyQuery.refetch()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> 刷新
                </Button>
              }
              compact
            >
              {historyQuery.data?.items && historyQuery.data.items.length > 0 ? (
                <div className="space-y-1.5 mt-2">
                  {historyQuery.data.items.map((item: any) => {
                    const faultLabel = FAULT_TYPE_LABELS[item.result.faultType] || FAULT_TYPE_LABELS.unknown;
                    const sevColor = SEVERITY_COLORS[item.result.severity] || SEVERITY_COLORS.unknown;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setSelectedHistory(item); setShowDetailDialog(true); }}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                      >
                        <span className="text-lg">{faultLabel.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{faultLabel.zh}</span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                              style={{ borderColor: sevColor, color: sevColor }}
                            >
                              {SEVERITY_ZH[item.result.severity] || item.result.severity}
                            </Badge>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {(item.result.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(item.timestamp).toLocaleString('zh-CN')} · {item.duration}ms · {item.result.evidenceSummary?.length || 0} 专家
                          </div>
                        </div>
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  暂无诊断记录，请先执行诊断
                </div>
              )}
            </PageCard>
          </TabsContent>

          {/* ============ Tab 4: 引擎配置 ============ */}
          <TabsContent value="config" className="space-y-4 mt-3">
            <FusionConfigTab
              configQuery={configQuery}
              expertsQuery={expertsQuery}
              setPenaltyMutation={setPenaltyMutation}
              updateWeightMutation={updateWeightMutation}
              toast={toast}
            />
          </TabsContent>

          {/* ============ Tab 5: 双轨诊断 ============ */}
          <TabsContent value="dual-track" className="space-y-4 mt-3">
            <DualTrackDiagnosisTab />
          </TabsContent>
        </Tabs>

        {/* 历史详情弹窗 */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                诊断详情
              </DialogTitle>
            </DialogHeader>
            {selectedHistory && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {(FAULT_TYPE_LABELS[selectedHistory.result.faultType] || FAULT_TYPE_LABELS.unknown).icon}
                  </span>
                  <div>
                    <div className="font-bold">
                      {(FAULT_TYPE_LABELS[selectedHistory.result.faultType] || FAULT_TYPE_LABELS.unknown).zh}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(selectedHistory.timestamp).toLocaleString('zh-CN')} · {selectedHistory.duration}ms
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="ml-auto"
                    style={{
                      borderColor: SEVERITY_COLORS[selectedHistory.result.severity],
                      color: SEVERITY_COLORS[selectedHistory.result.severity],
                    }}
                  >
                    {SEVERITY_ZH[selectedHistory.result.severity] || selectedHistory.result.severity}
                  </Badge>
                </div>

                <div className="text-sm">
                  <span className="text-muted-foreground">置信度: </span>
                  <span className="font-mono font-bold">
                    {(selectedHistory.result.confidence * 100).toFixed(1)}%
                  </span>
                </div>

                {selectedHistory.result.fusionDetails && (
                  <>
                    <div className="text-xs font-medium">DS 信念质量</div>
                    <BeliefMassChart beliefMass={selectedHistory.result.fusionDetails.beliefMass} />
                  </>
                )}

                {selectedHistory.result.conflictInfo && (
                  <>
                    <div className="text-xs font-medium">冲突分析</div>
                    <ConflictIndicator conflictInfo={selectedHistory.result.conflictInfo} />
                  </>
                )}

                {selectedHistory.result.evidenceSummary && (
                  <>
                    <div className="text-xs font-medium">证据链</div>
                    <EvidenceChain evidenceSummary={selectedHistory.result.evidenceSummary} />
                  </>
                )}

                {selectedHistory.result.recommendations?.length > 0 && (
                  <>
                    <div className="text-xs font-medium">建议措施</div>
                    <div className="space-y-1">
                      {selectedHistory.result.recommendations.map((r: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

// ==================== 融合诊断系统配置 Tab ====================

function FusionConfigTab({ configQuery, expertsQuery, setPenaltyMutation, updateWeightMutation, toast }: any) {
  const [penaltyFactor, setPenaltyFactor] = useState(configQuery.data?.conflictPenaltyFactor ?? 0.3);
  const [expertWeights, setExpertWeights] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 初始化专家权重
  const experts = expertsQuery.data?.experts ?? [];
  if (experts.length > 0 && Object.keys(expertWeights).length === 0) {
    const w: Record<string, number> = {};
    experts.forEach((e: any) => { w[e.id] = e.weight; });
    if (Object.keys(w).length > 0) setExpertWeights(w);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      // 保存冲突惩罚因子
      await setPenaltyMutation.mutateAsync({ factor: penaltyFactor });
      // 保存专家权重
      for (const [id, weight] of Object.entries(expertWeights)) {
        await updateWeightMutation.mutateAsync({ expertId: id, weight });
      }
      configQuery.refetch();
      expertsQuery.refetch();
      setDirty(false);
      toast.success('配置已保存');
    } catch (err: any) {
      toast.error(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPenaltyFactor(0.3);
    const w: Record<string, number> = {};
    experts.forEach((e: any) => { w[e.id] = 1.0; });
    setExpertWeights(w);
    setDirty(true);
  };

  const handleExport = () => {
    const config = {
      conflictPenaltyFactor: penaltyFactor,
      expertWeights,
      faultTypes: configQuery.data?.faultTypes ?? [],
      fusionMethod: 'dempster_combination',
      conflictResolution: 'weighted_vote',
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fusion-diagnosis-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左列：核心参数 */}
        <div className="space-y-4">
          <ConfigSection title="融合引擎参数" icon={<Settings2 className="w-4 h-4" />} description="DS 证据理论核心配置">
            <ConfigSlider
              label="冲突惩罚因子"
              value={penaltyFactor}
              onChange={v => { setPenaltyFactor(v); setDirty(true); }}
              min={0}
              max={1}
              step={0.05}
              description="冲突度高时对融合结果的惩罚力度，越大惩罚越重"
            />
            <ConfigKV label="融合方法" value={<Badge variant="secondary" className="text-[10px]">Dempster 组合规则</Badge>} />
            <ConfigKV label="冲突解决策略" value={<Badge variant="secondary" className="text-[10px]">加权投票</Badge>} />
            <ConfigKV label="在线专家数" value={<span className="font-mono">{expertsQuery.data?.count ?? 0}</span>} mono />
          </ConfigSection>

          <ConfigSection title="辨识框架" icon={<Target className="w-4 h-4" />} description="故障类型定义（θ = 全集不确定性）">
            <div className="space-y-1.5">
              {(configQuery.data?.faultTypes ?? []).map((ft: string) => {
                const label = FAULT_TYPE_LABELS[ft] || FAULT_TYPE_LABELS.unknown;
                return (
                  <div key={ft} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center">{label.icon}</span>
                    <span className="font-medium text-foreground">{label.zh}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">({ft})</span>
                  </div>
                );
              })}
            </div>
          </ConfigSection>
        </div>

        {/* 右列：专家权重 */}
        <div className="space-y-4">
          <ConfigSection title="专家权重配置" icon={<Users className="w-4 h-4" />} description="调整各专家在融合中的权重">
            {experts.length > 0 ? (
              <div className="space-y-3">
                {experts.map((e: any) => (
                  <ConfigSlider
                    key={e.id}
                    label={e.name || e.id}
                    value={expertWeights[e.id] ?? e.weight}
                    onChange={v => {
                      setExpertWeights(prev => ({ ...prev, [e.id]: v }));
                      setDirty(true);
                    }}
                    min={0}
                    max={2}
                    step={0.1}
                    description={`类型: ${e.type || '内置'}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无已注册专家</p>
            )}
          </ConfigSection>
        </div>
      </div>

      {/* API 文档 */}
      <ApiDocBlock
        title="Python 算法对接"
        icon={<Brain className="w-4 h-4" />}
        endpoints={[
          { method: 'POST', path: '/api/trpc/fusionDiagnosis.diagnose', description: '执行融合诊断', body: '{ sensorData: { vibration_rms, temperature, ... } }' },
          { method: 'GET', path: '/api/trpc/fusionDiagnosis.getExperts', description: '获取专家列表及权重' },
          { method: 'POST', path: '/api/trpc/fusionDiagnosis.updateWeight', description: '更新专家权重', body: '{ expertId, weight }' },
          { method: 'POST', path: '/api/trpc/fusionDiagnosis.setConflictPenalty', description: '设置冲突惩罚因子', body: '{ factor: 0.3 }' },
          { method: 'GET', path: '/api/trpc/fusionDiagnosis.getFaultTypes', description: '获取故障类型映射' },
          { method: 'GET', path: '/api/trpc/fusionDiagnosis.getConfig', description: '获取完整引擎配置' },
          { method: 'GET', path: '/api/trpc/fusionDiagnosis.getHistory', description: '获取诊断历史' },
        ]}
        pythonExample={`import requests\n\nBASE = "http://localhost:3000/api/trpc"\n\n# 1. 执行融合诊断\nres = requests.post(f"{BASE}/fusionDiagnosis.diagnose", json={\n    "sensorData": {\n        "vibration_rms": 9.5,\n        "dominant_frequency": 320,\n        "temperature": 78,\n        "temperature_rise": 35,\n        "current_imbalance": 3.0,\n        "thd": 5.0\n    },\n    "component": "bearing_01"\n})\nprint(res.json())\n\n# 2. 更新冲突惩罚因子\nrequests.post(f"{BASE}/fusionDiagnosis.setConflictPenalty",\n    json={"factor": 0.5})\n\n# 3. 更新专家权重\nrequests.post(f"{BASE}/fusionDiagnosis.updateWeight",\n    json={"expertId": "vibration", "weight": 1.2})`}
        note="核心算法（DS 组合规则、冲突惩罚、加权投票）已在 TypeScript 端 1:1 实现，与 Python 端完全一致。"
      />

      {/* 保存/重置/导出 */}
      <ConfigActions
        onSave={handleSave}
        onReset={handleReset}
        onExport={handleExport}
        saving={saving}
        dirty={dirty}
      />
    </div>
  );
}

// ==================== 传感器滑块组件 ====================

interface SensorSliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  zones?: Array<{ max: number; color: string; label: string }>;
}

function SensorSlider({ label, icon, value, onChange, min, max, step, unit, zones }: SensorSliderProps) {
  const currentZone = zones?.find(z => value <= z.max);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {currentZone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${currentZone.color}20`, color: currentZone.color }}>
              {currentZone.label}
            </span>
          )}
          <span className="text-xs font-mono font-medium w-16 text-right">
            {value.toFixed(step < 1 ? 1 : 0)} {unit}
          </span>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="py-0"
      />
      {zones && (
        <div className="flex h-1 rounded-full overflow-hidden">
          {zones.map((z, i) => {
            const prevMax = i > 0 ? zones[i - 1].max : min;
            const width = ((z.max - prevMax) / (max - min)) * 100;
            return (
              <div
                key={i}
                className="h-full"
                style={{ width: `${width}%`, backgroundColor: z.color, opacity: 0.3 }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
