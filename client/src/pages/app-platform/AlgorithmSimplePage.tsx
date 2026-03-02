/**
 * 算法工具简化版（客户版）
 * 流程卡片: 选算法 → 配参 → 执行 → 看结论
 * 用客户语言展示结果，不暴露内部参数
 */
import { useState, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Clock,
  Target,
  Lightbulb,
  Shield,
  Zap,
} from 'lucide-react';

// ── 客户友好的诊断场景 ──────────────────────────────
const CUSTOMER_SCENARIOS = [
  { id: 'bearing_damage', label: '轴承健康检测', description: '检测起升电机轴承的外圈损伤特征' },
  { id: 'electrical_fault', label: '电气系统检查', description: '分析电流波动，排查电气故障' },
  { id: 'normal', label: '常规体检', description: '全面检查设备运行状态是否正常' },
  { id: 'physics_violation', label: '传感器校验', description: '验证传感器数据是否符合物理规律' },
  { id: 'overload_idle', label: '负载异常检测', description: '排查空载过电流等负载异常问题' },
] as const;

// ── 步骤定义 ──────────────────────────────────────────
const STEPS = [
  { key: 'select', label: '选择场景', icon: Target },
  { key: 'run', label: '智能分析', icon: Zap },
  { key: 'result', label: '查看结论', icon: CheckCircle2 },
] as const;

// ── 故障类型中文映射 ──────────────────────────────
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

// ── 紧急程度客户化标签 ──────────────────────────────
const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  monitoring: { label: '无需处理，持续监控即可', color: 'text-blue-400' },
  scheduled: { label: '建议安排计划维护', color: 'text-yellow-500' },
  priority: { label: '需要优先安排检修', color: 'text-orange-500' },
  immediate: { label: '请立即停机检修', color: 'text-red-500' },
};

export default function AlgorithmSimplePage() {
  const toast = useToast();

  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0); // 0=select, 1=running, 2=result
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // ── 算法列表查询 ────────────────────────────────────
  const algoQuery = trpc.algorithm.listDefinitions.useQuery(
    { pageSize: 50 },
    { retry: 2 },
  );
  const algoCount = algoQuery.data?.total ?? 0;

  // ── HDE 诊断 mutation ──────────────────────────────
  const diagnoseMut = trpc.hdeDiagnostic.diagnosePreset.useMutation();

  // ── 执行诊断 ────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!selectedScenario) {
      toast.warning('请先选择分析场景');
      return;
    }

    setCurrentStep(1);
    setResult(null);

    try {
      const resp = await diagnoseMut.mutateAsync({ presetId: selectedScenario });
      if (resp.success && resp.data) {
        setResult(resp as unknown as Record<string, unknown>);
        setCurrentStep(2);
        toast.success('分析完成');
      } else {
        toast.error('分析失败，请稍后重试');
        setCurrentStep(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast.error(`分析异常: ${msg}`);
      setCurrentStep(0);
    }
  }, [selectedScenario, diagnoseMut, toast]);

  // ── 重新开始 ────────────────────────────────────────
  const resetFlow = useCallback(() => {
    setCurrentStep(0);
    setResult(null);
    setSelectedScenario('');
  }, []);

  // ── 解析结果 ────────────────────────────────────────
  const parsedResult = useMemo(() => {
    if (!result) return null;
    const data = result.data as Record<string, unknown> | undefined;
    const diagnosis = data?.diagnosis as Record<string, unknown> | undefined;
    const physicsValidation = data?.physicsValidation as Record<string, unknown> | undefined;
    const recommendations = data?.recommendations as Array<Record<string, unknown>> | undefined;

    return {
      faultType: diagnosis?.faultType as string | undefined,
      confidence: diagnosis?.confidence as number | undefined,
      severity: diagnosis?.severity as string | undefined,
      urgency: diagnosis?.urgency as string | undefined,
      physicsExplanation: diagnosis?.physicsExplanation as string | undefined,
      physicsValid: physicsValidation?.isValid as boolean | undefined,
      durationMs: data?.durationMs as number | undefined,
      recommendations: recommendations ?? [],
    };
  }, [result]);

  const isRunning = diagnoseMut.isPending;
  const scenarioInfo = CUSTOMER_SCENARIOS.find((s) => s.id === selectedScenario);

  return (
    <div className="space-y-6">
      {/* ── 顶部信息 ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            智能分析工具
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            选择分析场景，一键执行智能诊断，获取设备健康结论
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {algoCount} 个算法可用
        </Badge>
      </div>

      {/* ── 步骤指示器 ──────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = currentStep > idx;
          const active = currentStep === idx;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {idx > 0 && (
                <div className={cn('h-px w-12', done ? 'bg-emerald-500' : 'bg-border')} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                  done && 'bg-emerald-500/15 text-emerald-500',
                  active && !isRunning && 'bg-primary/15 text-primary',
                  active && isRunning && 'bg-primary/15 text-primary animate-pulse',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : active && isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: 选择场景 ──────────────────────────── */}
      {currentStep === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CUSTOMER_SCENARIOS.map((scenario) => (
              <Card
                key={scenario.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
                  selectedScenario === scenario.id && 'border-primary ring-1 ring-primary/30',
                )}
                onClick={() => setSelectedScenario(scenario.id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'rounded-lg p-2',
                      selectedScenario === scenario.id ? 'bg-primary/15' : 'bg-muted',
                    )}>
                      <Target className={cn(
                        'h-5 w-5',
                        selectedScenario === scenario.id ? 'text-primary' : 'text-muted-foreground',
                      )} />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">{scenario.label}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{scenario.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={runAnalysis}
              disabled={!selectedScenario}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              开始分析
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: 分析中 ──────────────────────────────── */}
      {currentStep === 1 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <h3 className="text-lg font-medium">正在分析...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {scenarioInfo?.label} — {scenarioInfo?.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                HDE 双轨诊断引擎运行中，物理优先轨 + 数据驱动轨融合分析
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: 结果展示 ──────────────────────────── */}
      {currentStep === 2 && parsedResult && (
        <div className="space-y-4">
          {/* 主结论 */}
          <Card className="border-l-4" style={{
            borderLeftColor:
              parsedResult.severity === 'critical' || parsedResult.severity === 'high'
                ? '#ef4444'
                : parsedResult.severity === 'medium'
                  ? '#eab308'
                  : '#10b981',
          }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {parsedResult.severity === 'critical' || parsedResult.severity === 'high' ? (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                ) : parsedResult.severity === 'medium' ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
                分析结论
                {parsedResult.confidence != null && (
                  <span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
                    可信度
                    <Progress value={parsedResult.confidence * 100} className="w-20 h-2" />
                    <span className="tabular-nums font-medium text-foreground">
                      {Math.round(parsedResult.confidence * 100)}%
                    </span>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 诊断结论 */}
              <div className="text-base">
                <span className="font-medium">{parsedResult.faultType ? faultTypeCN(parsedResult.faultType) : '设备状态正常'}</span>
              </div>

              {/* 紧急程度 */}
              {parsedResult.urgency && URGENCY_LABELS[parsedResult.urgency] && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={cn('text-sm font-medium', URGENCY_LABELS[parsedResult.urgency].color)}>
                    {URGENCY_LABELS[parsedResult.urgency].label}
                  </span>
                </div>
              )}

              {/* 物理机理说明 */}
              {parsedResult.physicsExplanation && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">原因分析</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {parsedResult.physicsExplanation}
                  </p>
                </div>
              )}

              {/* 物理校验 */}
              <div className="flex items-center gap-2 text-sm">
                <Shield className={cn('h-4 w-4', parsedResult.physicsValid ? 'text-emerald-500' : 'text-red-500')} />
                <span className="text-muted-foreground">数据物理校验:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    parsedResult.physicsValid
                      ? 'text-emerald-500 border-emerald-500/30'
                      : 'text-red-500 border-red-500/30',
                  )}
                >
                  {parsedResult.physicsValid ? '数据可信' : '数据存疑'}
                </Badge>
              </div>

              {/* 处置建议 */}
              {parsedResult.recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">建议操作</span>
                  </div>
                  <ul className="space-y-2">
                    {parsedResult.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5 shrink-0">{i + 1}.</span>
                        <div>
                          <span>{rec.action as string}</span>
                          {typeof rec.rationale === 'string' && rec.rationale && (
                            <span className="text-muted-foreground/70 ml-1">
                              — {rec.rationale}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 分析耗时 */}
              {parsedResult.durationMs != null && (
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  分析耗时: {parsedResult.durationMs}ms | 引擎: HDE 双轨诊断
                </div>
              )}
            </CardContent>
          </Card>

          {/* 重新分析 */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={resetFlow} className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              重新选择场景
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
