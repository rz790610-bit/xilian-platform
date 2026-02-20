/**
 * ============================================================================
 * 认知仪表盘 — CognitiveDashboard
 * ============================================================================
 *
 * 四维认知可视化 + Grok 推理链 + 进化飞轮状态 + 护栏告警
 * 通过 tRPC 接入后端 evoCognition / evoEvolution / evoGuardrail 域路由
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';

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
  steps: Array<{
    type: string;
    tool: string;
    input: string;
    output: string;
    durationMs: number;
  }>;
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

// ============================================================================
// 默认空状态（API 未返回时的安全兜底）
// ============================================================================

const emptyMetrics: CognitionMetrics = {
  activeSessionCount: 0,
  totalDiagnosisToday: 0,
  avgDiagnosisTimeMs: 0,
  convergenceRate: 0,
  dimensions: {
    perception: { accuracy: 0, latencyMs: 0, dataPoints: 0 },
    reasoning: { accuracy: 0, latencyMs: 0, grokCalls: 0 },
    fusion: { accuracy: 0, latencyMs: 0, conflictRate: 0 },
    decision: { accuracy: 0, latencyMs: 0, guardrailTriggers: 0 },
  },
};

const emptyEvolution: EvolutionStatus = {
  currentCycle: null,
  status: 'idle',
  totalCycles: 0,
  totalImprovements: 0,
  lastCycleAt: null,
  crystalCount: 0,
};

// ============================================================================
// 子组件
// ============================================================================

function MetricCard({ title, value, unit, trend, color }: {
  title: string; value: string | number; unit?: string; trend?: 'up' | 'down' | 'stable'; color: string;
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        {trend && <span className={`text-sm ${trendColor}`}>{trendIcon}</span>}
      </div>
    </div>
  );
}

function DimensionBar({ name, accuracy, latencyMs, extra }: {
  name: string; accuracy: number; latencyMs: number; extra: string;
}) {
  const pct = Math.round(accuracy * 100);
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-20 text-sm font-medium text-foreground">{name}</div>
      <div className="flex-1">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="w-16 text-right text-sm font-mono text-foreground">{pct}%</div>
      <div className="w-20 text-right text-xs text-muted-foreground">{latencyMs}ms</div>
      <div className="w-32 text-right text-xs text-muted-foreground">{extra}</div>
    </div>
  );
}

function ReasoningChainView({ chain }: { chain: ReasoningChainEntry }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = chain.status === 'completed' ? 'text-green-500' : chain.status === 'failed' ? 'text-red-500' : 'text-yellow-500';

  return (
    <div className="border border-border rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${statusColor}`}>{chain.status}</span>
          <span className="text-sm text-foreground">{chain.equipmentId}</span>
          <span className="text-xs text-muted-foreground">触发: {chain.trigger}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{chain.totalDurationMs}ms</span>
          <span className="text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pl-4 border-l-2 border-muted">
          {chain.steps.map((step, i) => (
            <div key={i} className="mb-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{step.tool}</span>
                <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">输入: {step.input}</div>
              <div className="text-xs text-foreground mt-0.5">输出: {step.output}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onAcknowledge }: { alert: GuardrailAlert; onAcknowledge: (id: string) => void }) {
  const severityColors: Record<string, string> = {
    critical: 'bg-red-500 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-blue-500 text-white',
  };
  const categoryLabels: Record<string, string> = { safety: '安全', health: '健康', efficiency: '高效' };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${alert.acknowledged ? 'border-border opacity-60' : 'border-orange-300 bg-orange-50/5'}`}>
      <span className={`text-xs px-2 py-0.5 rounded ${severityColors[alert.severity]}`}>{alert.severity}</span>
      <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{categoryLabels[alert.category]}</span>
      <span className="text-sm text-foreground flex-1">{alert.message}</span>
      <span className="text-xs text-muted-foreground">{alert.equipmentId}</span>
      {!alert.acknowledged && (
        <button
          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-80"
          onClick={() => onAcknowledge(alert.id)}
        >
          确认
        </button>
      )}
    </div>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-3">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between">
      <span className="text-sm text-destructive">{message}</span>
      {onRetry && (
        <button className="text-xs px-3 py-1 bg-destructive text-destructive-foreground rounded" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function CognitiveDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'reasoning' | 'evolution' | 'guardrail'>('overview');

  // ---- tRPC 数据查询 ----
  const [pollInterval] = useState(10000); // 10s 轮询

  const metricsQuery = trpc.evoCognition.getDashboardMetrics.useQuery(undefined, {
    refetchInterval: pollInterval,
    retry: 2,
  });

  const chainsQuery = trpc.evoCognition.listReasoningChains.useQuery(
    { limit: 20, offset: 0 },
    { refetchInterval: pollInterval, retry: 2, enabled: activeTab === 'reasoning' }
  );

  const evolutionQuery = trpc.evoEvolution.getFlywheelStatus.useQuery(undefined, {
    refetchInterval: pollInterval,
    retry: 2,
    enabled: activeTab === 'evolution',
  });

  const alertsQuery = trpc.evoGuardrail.listAlerts.useQuery(
    { limit: 50, acknowledged: false },
    { refetchInterval: pollInterval, retry: 2, enabled: activeTab === 'guardrail' }
  );

  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({
    onSuccess: () => alertsQuery.refetch(),
  });

  // ---- 数据解构（带安全兜底）----
  const metrics: CognitionMetrics = (metricsQuery.data as CognitionMetrics) ?? emptyMetrics;
  const chains: ReasoningChainEntry[] = (chainsQuery.data as ReasoningChainEntry[]) ?? [];
  const evolution: EvolutionStatus = (evolutionQuery.data as EvolutionStatus) ?? emptyEvolution;
  const alerts: GuardrailAlert[] = (alertsQuery.data as GuardrailAlert[]) ?? [];

  const handleAcknowledge = useCallback((alertId: string) => {
    acknowledgeMutation.mutate({ alertId });
  }, [acknowledgeMutation]);

  const tabs = [
    { key: 'overview' as const, label: '总览' },
    { key: 'reasoning' as const, label: 'Grok 推理链' },
    { key: 'evolution' as const, label: '进化飞轮' },
    { key: 'guardrail' as const, label: '护栏告警' },
  ];

  const isLoading = activeTab === 'overview' ? metricsQuery.isLoading :
    activeTab === 'reasoning' ? chainsQuery.isLoading :
    activeTab === 'evolution' ? evolutionQuery.isLoading :
    alertsQuery.isLoading;

  const error = activeTab === 'overview' ? metricsQuery.error :
    activeTab === 'reasoning' ? chainsQuery.error :
    activeTab === 'evolution' ? evolutionQuery.error :
    alertsQuery.error;

  const refetch = activeTab === 'overview' ? metricsQuery.refetch :
    activeTab === 'reasoning' ? chainsQuery.refetch :
    activeTab === 'evolution' ? evolutionQuery.refetch :
    alertsQuery.refetch;

  return (
    <MainLayout title="认知仪表盘">
    <div className="p-6 space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">认知仪表盘</h1>
        <p className="text-sm text-muted-foreground mt-1">四维认知状态 · Grok 推理链 · 进化飞轮 · 安全护栏</p>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 加载/错误状态 */}
      {isLoading && <LoadingSpinner text="正在加载数据..." />}
      {error && <ErrorBanner message={`数据加载失败: ${error.message}`} onRetry={() => refetch()} />}

      {/* 总览 */}
      {activeTab === 'overview' && !isLoading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="活跃诊断会话" value={metrics.activeSessionCount} trend="stable" color="text-blue-500" />
            <MetricCard title="今日诊断总数" value={metrics.totalDiagnosisToday} trend="up" color="text-green-500" />
            <MetricCard title="平均诊断耗时" value={metrics.avgDiagnosisTimeMs} unit="ms" trend="down" color="text-purple-500" />
            <MetricCard title="四维收敛率" value={`${Math.round(metrics.convergenceRate * 100)}%`} trend="up" color="text-orange-500" />
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">四维认知准确度</h3>
            <DimensionBar name="感知" accuracy={metrics.dimensions.perception.accuracy} latencyMs={metrics.dimensions.perception.latencyMs} extra={`${metrics.dimensions.perception.dataPoints} 数据点`} />
            <DimensionBar name="推理" accuracy={metrics.dimensions.reasoning.accuracy} latencyMs={metrics.dimensions.reasoning.latencyMs} extra={`${metrics.dimensions.reasoning.grokCalls} Grok调用`} />
            <DimensionBar name="融合" accuracy={metrics.dimensions.fusion.accuracy} latencyMs={metrics.dimensions.fusion.latencyMs} extra={`冲突率 ${Math.round(metrics.dimensions.fusion.conflictRate * 100)}%`} />
            <DimensionBar name="决策" accuracy={metrics.dimensions.decision.accuracy} latencyMs={metrics.dimensions.decision.latencyMs} extra={`${metrics.dimensions.decision.guardrailTriggers} 护栏触发`} />
          </div>
        </div>
      )}

      {/* Grok 推理链 */}
      {activeTab === 'reasoning' && !isLoading && !error && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">推理链历史</h3>
            <span className="text-xs text-muted-foreground">共 {chains.length} 条</span>
          </div>
          {chains.map(chain => (
            <ReasoningChainView key={chain.id} chain={chain} />
          ))}
          {chains.length === 0 && (
            <div className="text-center text-muted-foreground py-12">暂无推理链记录</div>
          )}
        </div>
      )}

      {/* 进化飞轮 */}
      {activeTab === 'evolution' && !isLoading && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="飞轮状态" value={evolution.status === 'idle' ? '空闲' : '运行中'} color={evolution.status === 'idle' ? 'text-gray-500' : 'text-green-500'} />
            <MetricCard title="累计周期" value={evolution.totalCycles} color="text-blue-500" />
            <MetricCard title="累计改进" value={evolution.totalImprovements} color="text-purple-500" />
            <MetricCard title="知识结晶" value={evolution.crystalCount} color="text-orange-500" />
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">飞轮五步闭环</h3>
            <div className="flex items-center justify-between">
              {['数据发现', '假设生成', '影子评估', '金丝雀部署', '知识结晶'].map((step, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 && evolution.status === 'discovering' ? 'bg-green-500 text-white' :
                    i === 1 && evolution.status === 'hypothesizing' ? 'bg-green-500 text-white' :
                    i === 2 && evolution.status === 'evaluating' ? 'bg-green-500 text-white' :
                    i === 3 && evolution.status === 'deploying' ? 'bg-green-500 text-white' :
                    i === 4 && evolution.status === 'crystallizing' ? 'bg-green-500 text-white' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  <span className="text-xs text-muted-foreground">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 护栏告警 */}
      {activeTab === 'guardrail' && !isLoading && !error && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">活跃告警</h3>
            <span className="text-xs text-muted-foreground">{alerts.filter(a => !a.acknowledged).length} 未确认</span>
          </div>
          {alerts.map(alert => (
            <AlertRow key={alert.id} alert={alert} onAcknowledge={handleAcknowledge} />
          ))}
          {alerts.length === 0 && (
            <div className="text-center text-muted-foreground py-12">暂无告警</div>
          )}
        </div>
      )}
    </div>
    </MainLayout>
  );
}
