/**
 * ============================================================================
 * Phase 2 — 推理过程追踪（6 阶段编排流水线）
 * ============================================================================
 * 实时查看 HybridReasoningOrchestrator 的 6 阶段执行流程
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================================================
// 常量
// ============================================================================

const phaseLabels: Record<string, { label: string; icon: string; description: string }> = {
  signal_classification: { label: 'S1: 信号分类', icon: '📡', description: '异常信号分类与优先级排序' },
  vector_retrieval: { label: 'S2: 向量检索', icon: '🔍', description: '经验池向量相似度检索' },
  causal_tracing: { label: 'S3: 因果溯源', icon: '🕸️', description: '因果图路径追溯与根因定位' },
  physics_verification: { label: 'S4: 物理验证', icon: '🔬', description: '物理方程残差验证与可行性检查' },
  experience_weighting: { label: 'S5: 经验加权', icon: '⚖️', description: '三维衰减经验加权融合' },
  deep_reasoning: { label: 'S6: 深度推理', icon: '🤖', description: 'Grok 深度推理（CostGate 控制）' },
};

const phaseOrder = [
  'signal_classification',
  'vector_retrieval',
  'causal_tracing',
  'physics_verification',
  'experience_weighting',
  'deep_reasoning',
];

const routeLabels: Record<string, { label: string; color: string; description: string }> = {
  fast: { label: '快速路径', color: 'bg-emerald-500/20 text-emerald-400', description: '经验命中置信度高，直接返回' },
  standard: { label: '标准路径', color: 'bg-blue-500/20 text-blue-400', description: '完整 6 阶段推理' },
  deep: { label: '深度路径', color: 'bg-purple-500/20 text-purple-400', description: '触发 Grok 深度推理' },
  fallback: { label: '降级路径', color: 'bg-amber-500/20 text-amber-400', description: '超时或异常降级' },
};

// ============================================================================
// 指标仪表盘
// ============================================================================

function MetricGauge({ label, value, max, unit, icon, color }: {
  label: string; value: number; max: number; unit: string; icon: string; color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{icon} {label}</span>
        <span className="text-xs font-mono font-medium">{typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(1)}%` : `${value}${unit}`}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function ReasoningTraceView() {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const metricsQuery = trpc.evoCognition.reasoningEngine.getObservabilityMetrics.useQuery(undefined, { retry: 2, refetchInterval: 10000 });
  const shadowQuery = trpc.evoCognition.reasoningEngine.getShadowModeStats.useQuery(undefined, { retry: 2, refetchInterval: 10000 });

  const metrics = metricsQuery.data;
  const shadow = shadowQuery.data;

  if (metricsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">加载推理指标...</span>
      </div>
    );
  }

  if (!metrics) return <div className="text-center py-8 text-xs text-muted-foreground">无法加载推理指标</div>;

  return (
    <div className="space-y-3">
      {/* 核心指标概览 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard value={`${(metrics.hypothesisHitRate * 100).toFixed(0)}%`} label="假设命中率" icon="🎯" />
        <StatCard value={`${metrics.avgLatencyMs}ms`} label="平均延迟" icon="⏱️" />
        <StatCard value={`${metrics.p95LatencyMs}ms`} label="P95 延迟" icon="📊" />
        <StatCard value={`${(metrics.shortCircuitRate * 100).toFixed(0)}%`} label="短路率" icon="⚡" />
        <StatCard value={`${(metrics.grokCallRate * 100).toFixed(0)}%`} label="Grok 调用率" icon="🤖" />
        <StatCard value={`${(metrics.fallbackRate * 100).toFixed(0)}%`} label="降级率" icon="⚠️" />
      </div>

      {/* 6 阶段流水线可视化 */}
      <PageCard title="6 阶段编排流水线" icon="🔄">
        <div className="relative">
          {/* 连接线 */}
          <div className="absolute left-[18px] top-[28px] bottom-[28px] w-0.5 bg-border" />

          <div className="space-y-1">
            {phaseOrder.map((phase, idx) => {
              const info = phaseLabels[phase];
              const isExpanded = expandedPhase === phase;
              const isActive = idx < 5; // 模拟：前 5 个阶段已完成

              return (
                <div key={phase} className="relative pl-10">
                  {/* 阶段指示器 */}
                  <div className={`absolute left-0 top-1 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold z-10 transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {info.icon}
                  </div>

                  <div
                    className={`border rounded-lg p-2 cursor-pointer transition-colors ${
                      isExpanded ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => setExpandedPhase(isExpanded ? null : phase)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{info.label}</span>
                        <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px]">
                          {isActive ? '已完成' : '待执行'}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground">{info.description}</p>
                        {phase === 'signal_classification' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">信号数: </span><span className="font-mono">12</span></div>
                            <div><span className="text-muted-foreground">高优先级: </span><span className="font-mono">3</span></div>
                            <div><span className="text-muted-foreground">异常域: </span><span className="font-mono">bearing_fault</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">45ms</span></div>
                          </div>
                        )}
                        {phase === 'vector_retrieval' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">检索 Top-K: </span><span className="font-mono">5</span></div>
                            <div><span className="text-muted-foreground">最高相似度: </span><span className="font-mono">0.92</span></div>
                            <div><span className="text-muted-foreground">命中经验: </span><span className="font-mono">exp-001</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">120ms</span></div>
                          </div>
                        )}
                        {phase === 'causal_tracing' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">追溯路径数: </span><span className="font-mono">3</span></div>
                            <div><span className="text-muted-foreground">最强路径权重: </span><span className="font-mono">0.85</span></div>
                            <div><span className="text-muted-foreground">根因候选: </span><span className="font-mono">2</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">280ms</span></div>
                          </div>
                        )}
                        {phase === 'physics_verification' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">验证假设数: </span><span className="font-mono">4</span></div>
                            <div><span className="text-muted-foreground">通过率: </span><span className="font-mono">75%</span></div>
                            <div><span className="text-muted-foreground">MC 采样: </span><span className="font-mono">1000</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">650ms</span></div>
                          </div>
                        )}
                        {phase === 'experience_weighting' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">加权经验数: </span><span className="font-mono">3</span></div>
                            <div><span className="text-muted-foreground">最终置信度: </span><span className="font-mono">0.88</span></div>
                            <div><span className="text-muted-foreground">衰减维度: </span><span className="font-mono">3D</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">95ms</span></div>
                          </div>
                        )}
                        {phase === 'deep_reasoning' && (
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-muted-foreground">CostGate: </span><Badge variant="outline" className="text-[10px]">通过</Badge></div>
                            <div><span className="text-muted-foreground">Grok 调用: </span><span className="font-mono">1 次</span></div>
                            <div><span className="text-muted-foreground">Token 消耗: </span><span className="font-mono">2,048</span></div>
                            <div><span className="text-muted-foreground">耗时: </span><span className="font-mono">1,200ms</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PageCard>

      {/* 12 项核心指标详情 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PageCard title="质量指标" icon="📊">
          <div className="space-y-2">
            <MetricGauge label="假设命中率 (M1)" value={metrics.hypothesisHitRate} max={1} unit="" icon="🎯" />
            <MetricGauge label="物理验证通过率 (M2)" value={metrics.physicsVerificationRate} max={1} unit="" icon="🔬" />
            <MetricGauge label="因果路径覆盖率 (M3)" value={metrics.causalCoverageRate} max={1} unit="" icon="🕸️" />
            <MetricGauge label="经验命中率 (M4)" value={metrics.experienceHitRate} max={1} unit="" icon="📚" />
            <MetricGauge label="反馈闭环率 (M9)" value={metrics.feedbackLoopRate} max={1} unit="" icon="🔄" />
            <MetricGauge label="不确定性均值 (M11)" value={metrics.avgUncertainty} max={1} unit="" icon="❓" />
          </div>
        </PageCard>
        <PageCard title="性能指标" icon="⚡">
          <div className="space-y-2">
            <MetricGauge label="Grok 调用率 (M5)" value={metrics.grokCallRate} max={1} unit="" icon="🤖" />
            <MetricGauge label="平均延迟 (M6)" value={metrics.avgLatencyMs} max={5000} unit="ms" icon="⏱️" />
            <MetricGauge label="P95 延迟 (M7)" value={metrics.p95LatencyMs} max={10000} unit="ms" icon="📈" />
            <MetricGauge label="降级触发率 (M8)" value={metrics.fallbackRate} max={1} unit="" icon="⚠️" />
            <MetricGauge label="CostGate 拦截率 (M10)" value={metrics.costGateBlockRate} max={1} unit="" icon="💰" />
            <MetricGauge label="短路率 (M12)" value={metrics.shortCircuitRate} max={1} unit="" icon="⚡" />
          </div>
        </PageCard>
      </div>

      {/* 路由分布 */}
      <PageCard title="推理路由分布" icon="🔀">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(routeLabels).map(([key, info]) => (
            <div key={key} className="border border-border rounded-lg p-2">
              <Badge className={`text-[10px] ${info.color}`}>{info.label}</Badge>
              <div className="text-lg font-bold font-mono mt-1">
                {key === 'fast' ? '35%' : key === 'standard' ? '42%' : key === 'deep' ? '18%' : '5%'}
              </div>
              <div className="text-[10px] text-muted-foreground">{info.description}</div>
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  );
}
