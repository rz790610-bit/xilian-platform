/**
 * ============================================================================
 * 进化引擎可观测性 — Phase 3
 * ============================================================================
 * 3 个 Tab: 全链路追踪 | 性能指标仪表盘 | 告警规则引擎
 * 后端路由: evoEvolution.observability.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, EmptyState, DataTable, ConfirmDialog } from '@/components/evolution';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  Activity, AlertTriangle, Bell, BellOff, Check, ChevronRight, Clock,
  Eye, Filter, Layers, Play, Plus, RefreshCw, Search, Settings, Shield,
  TrendingDown, TrendingUp, Zap, X, ChevronDown, ChevronUp,
} from 'lucide-react';

// ============================================================================
// 常量
// ============================================================================
const ENGINE_MODULES = [
  'shadowEvaluator', 'championChallenger', 'canaryDeployer', 'otaFleet',
  'fsdIntervention', 'simulationEngine', 'dataEngine', 'dualFlywheel',
  'dojoTrainer', 'autoLabeler', 'domainRouter', 'metaLearner',
  'fleetPlanner', 'e2eAgent', 'closedLoopTracker',
] as const;

const MODULE_LABELS: Record<string, string> = {
  shadowEvaluator: '影子评估器',
  championChallenger: '冠军挑战者',
  canaryDeployer: '金丝雀部署',
  otaFleet: 'OTA 车队',
  fsdIntervention: 'FSD 干预',
  simulationEngine: '仿真引擎',
  dataEngine: '数据引擎',
  dualFlywheel: '双飞轮',
  dojoTrainer: 'Dojo 训练',
  autoLabeler: '自动标注',
  domainRouter: '领域路由',
  metaLearner: '元学习器',
  fleetPlanner: '车队规划',
  e2eAgent: 'E2E Agent',
  closedLoopTracker: '闭环追踪',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  fatal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  timeout: 'bg-amber-500/20 text-amber-400',
  firing: 'bg-red-500/20 text-red-400',
  acknowledged: 'bg-amber-500/20 text-amber-400',
  resolved: 'bg-emerald-500/20 text-emerald-400',
  silenced: 'bg-zinc-500/20 text-zinc-400',
  healthy: 'bg-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-500/20 text-amber-400',
  critical: 'bg-red-500/20 text-red-400',
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================================================
// Tab 1: 全链路追踪
// ============================================================================
function TracePanel() {
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const tracesQuery = trpc.evoEvolution.observability.listTraces.useQuery(
    {
      operationType: filterType || undefined,
      status: (filterStatus || undefined) as any,
      limit: 50,
    },
    { refetchInterval: 8000, retry: 1 }
  );
  const statsQuery = trpc.evoEvolution.observability.getTraceStats.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const traceDetailQuery = trpc.evoEvolution.observability.getTrace.useQuery(
    { traceId: expandedTrace ?? '' },
    { enabled: !!expandedTrace, refetchInterval: 5000 }
  );

  const stats = statsQuery.data;
  const traces = tracesQuery.data?.traces ?? [];

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard value={stats?.total ?? 0} label="总追踪数" icon={<Layers className="w-4 h-4" />} compact />
        <StatCard value={stats?.running ?? 0} label="运行中" icon={<Play className="w-4 h-4 text-blue-400" />} compact />
        <StatCard value={stats?.completed ?? 0} label="已完成" icon={<Check className="w-4 h-4 text-emerald-400" />} compact />
        <StatCard value={stats?.failed ?? 0} label="失败" icon={<X className="w-4 h-4 text-red-400" />} compact />
        <StatCard value={formatDuration(stats?.avgDurationMs)} label="平均耗时" icon={<Clock className="w-4 h-4 text-amber-400" />} compact />
      </div>

      {/* 按操作类型分布 */}
      {stats?.byType && stats.byType.length > 0 && (
        <PageCard title="操作类型分布" compact>
          <div className="flex flex-wrap gap-2">
            {stats.byType.map((t: { type: string; count: number }) => (
              <Badge key={t.type} variant="outline" className="text-xs px-2 py-1 bg-zinc-800/50 border-zinc-700">
                {t.type}: <span className="text-white ml-1 font-mono">{t.count}</span>
              </Badge>
            ))}
          </div>
        </PageCard>
      )}

      {/* 过滤器 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="w-4 h-4 text-zinc-500" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="操作类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="evolution_cycle">进化周期</SelectItem>
              <SelectItem value="shadow_eval">影子评估</SelectItem>
              <SelectItem value="champion_challenge">冠军挑战</SelectItem>
              <SelectItem value="canary_deploy">金丝雀部署</SelectItem>
              <SelectItem value="dojo_training">Dojo 训练</SelectItem>
              <SelectItem value="knowledge_crystal">知识结晶</SelectItem>
              <SelectItem value="ota_rollout">OTA 发布</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="running">运行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="timeout">超时</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => tracesQuery.refetch()}>
          <RefreshCw className="w-3 h-3 mr-1" /> 刷新
        </Button>
      </div>

      {/* 追踪列表 */}
      <div className="space-y-2">
        {traces.length === 0 ? (
          <EmptyState message="暂无追踪记录" icon="🔍" />
        ) : (
          traces.map((trace: any) => (
            <div key={trace.traceId} className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
              {/* 追踪头部 */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                onClick={() => setExpandedTrace(expandedTrace === trace.traceId ? null : trace.traceId)}
              >
                <div className="flex-shrink-0">
                  {expandedTrace === trace.traceId ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">{trace.name}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[trace.status ?? 'running']}`}>
                      {trace.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-zinc-800/50 border-zinc-700 text-zinc-400">
                      {trace.operationType}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                    <span className="font-mono">{trace.traceId}</span>
                    <span>·</span>
                    <span>{formatTime(trace.startedAt)}</span>
                    {trace.trigger && <><span>·</span><span>触发: {trace.trigger}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span title="耗时"><Clock className="w-3 h-3 inline mr-1" />{formatDuration(trace.durationMs)}</span>
                  <span title="Span 数"><Layers className="w-3 h-3 inline mr-1" />{trace.spanCount ?? 0}</span>
                  {(trace.errorCount ?? 0) > 0 && (
                    <span className="text-red-400" title="错误数"><AlertTriangle className="w-3 h-3 inline mr-1" />{trace.errorCount}</span>
                  )}
                </div>
              </div>

              {/* 展开详情 - Span 瀑布图 */}
              {expandedTrace === trace.traceId && traceDetailQuery.data && (
                <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/40">
                  <div className="text-xs text-zinc-500 mb-2 font-medium">Span 瀑布图 ({traceDetailQuery.data.spans?.length ?? 0} spans)</div>
                  {(!traceDetailQuery.data.spans || traceDetailQuery.data.spans.length === 0) ? (
                    <div className="text-xs text-zinc-600 py-2">暂无 Span 数据</div>
                  ) : (
                    <SpanWaterfall spans={traceDetailQuery.data.spans} traceStart={trace.startedAt} traceDuration={trace.durationMs} />
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Span 瀑布图组件 */
function SpanWaterfall({ spans, traceStart, traceDuration }: {
  spans: Array<any>;
  traceStart: any;
  traceDuration: number | null | undefined;
}) {
  const traceStartMs = new Date(traceStart).getTime();
  const totalDuration = traceDuration ?? 1;

  // 构建树结构
  const rootSpans = spans.filter(s => !s.parentSpanId);
  const childMap = new Map<string, typeof spans>();
  for (const s of spans) {
    if (s.parentSpanId) {
      const arr = childMap.get(s.parentSpanId) ?? [];
      arr.push(s);
      childMap.set(s.parentSpanId, arr);
    }
  }

  function renderSpan(span: any, depth: number) {
    const spanStart = new Date(span.startedAt).getTime();
    const offset = ((spanStart - traceStartMs) / totalDuration) * 100;
    const width = Math.max(((span.durationMs ?? 0) / totalDuration) * 100, 1);
    const children = childMap.get(span.spanId) ?? [];

    return (
      <div key={span.spanId}>
        <div className="flex items-center gap-2 py-1 group hover:bg-zinc-800/30 rounded px-1">
          <div className="w-[180px] flex-shrink-0 flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
            {children.length > 0 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
            <span className="text-[11px] text-zinc-300 truncate" title={span.name}>{span.name}</span>
          </div>
          <div className="w-[80px] flex-shrink-0">
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[span.status ?? 'running']}`}>
              {span.status}
            </Badge>
          </div>
          <div className="flex-1 relative h-5 bg-zinc-800/30 rounded-sm overflow-hidden">
            <div
              className={`absolute top-0.5 bottom-0.5 rounded-sm ${
                span.status === 'failed' ? 'bg-red-500/60' :
                span.status === 'timeout' ? 'bg-amber-500/60' :
                span.status === 'completed' ? 'bg-emerald-500/50' : 'bg-blue-500/50'
              }`}
              style={{ left: `${Math.min(offset, 99)}%`, width: `${Math.min(width, 100 - offset)}%` }}
            />
          </div>
          <div className="w-[60px] flex-shrink-0 text-right text-[11px] text-zinc-500 font-mono">
            {formatDuration(span.durationMs)}
          </div>
        </div>
        {children.map(c => renderSpan(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* 头部 */}
      <div className="flex items-center gap-2 py-1 text-[10px] text-zinc-600 uppercase tracking-wider border-b border-zinc-800/50 mb-1">
        <div className="w-[180px] flex-shrink-0">Span</div>
        <div className="w-[80px] flex-shrink-0">状态</div>
        <div className="flex-1">时间线</div>
        <div className="w-[60px] flex-shrink-0 text-right">耗时</div>
      </div>
      <ScrollArea className="max-h-[300px]">
        {rootSpans.map(s => renderSpan(s, 0))}
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Tab 2: 性能指标仪表盘
// ============================================================================
function MetricsPanel() {
  const [selectedModule, setSelectedModule] = useState<string>('');

  const healthQuery = trpc.evoEvolution.observability.getEngineHealth.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const metricsQuery = trpc.evoEvolution.observability.getLatestMetrics.useQuery(
    selectedModule ? { engineModule: selectedModule } : undefined,
    { refetchInterval: 10000, retry: 1 }
  );

  const health = healthQuery.data;
  const metrics = metricsQuery.data?.metrics ?? [];

  // 按模块分组指标
  const metricsByModule = useMemo(() => {
    const map = new Map<string, typeof metrics>();
    for (const m of metrics) {
      const arr = map.get(m.engineModule) ?? [];
      arr.push(m);
      map.set(m.engineModule, arr);
    }
    return map;
  }, [metrics]);

  // 引擎健康度饼图数据
  const healthPieData = useMemo(() => {
    if (!health?.engines) return [];
    const counts = { healthy: 0, warning: 0, critical: 0 };
    for (const e of health.engines) {
      counts[e.status as keyof typeof counts]++;
    }
    return [
      { name: '健康', value: counts.healthy, color: '#10b981' },
      { name: '告警', value: counts.warning, color: '#f59e0b' },
      { name: '严重', value: counts.critical, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [health]);

  return (
    <div className="space-y-4">
      {/* 顶部概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={health?.summary?.totalTraces ?? 0} label="总追踪数" icon={<Layers className="w-4 h-4" />} compact />
        <StatCard value={health?.summary?.firingAlerts ?? 0} label="活跃告警" icon={<AlertTriangle className="w-4 h-4 text-red-400" />} compact />
        <StatCard
          value={health?.recent24h?.traceCount ?? 0}
          label="24h 追踪"
          icon={<Activity className="w-4 h-4 text-blue-400" />}
          compact
        />
        <StatCard
          value={`${((health?.recent24h?.errorRate ?? 0) * 100).toFixed(1)}%`}
          label="24h 错误率"
          icon={<TrendingDown className="w-4 h-4 text-amber-400" />}
          compact
        />
      </div>

      {/* 引擎健康度 + 24h 统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 引擎健康度 */}
        <PageCard title="引擎健康度" compact>
          <div className="flex items-center justify-center h-[160px]">
            {healthPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {healthPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v} 个模块`, name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-zinc-500">加载中...</div>
            )}
          </div>
          <div className="flex justify-center gap-4 mt-1">
            {healthPieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}: {d.value}
              </div>
            ))}
          </div>
        </PageCard>

        {/* 系统摘要 */}
        <PageCard title="系统摘要" compact className="col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '进化周期', value: health?.summary?.totalCycles ?? 0, icon: '🔄' },
              { label: '影子评估', value: health?.summary?.totalEvals ?? 0, icon: '👻' },
              { label: '冠军实验', value: health?.summary?.totalExperiments ?? 0, icon: '🏆' },
              { label: '金丝雀部署', value: health?.summary?.totalDeployments ?? 0, icon: '🐦' },
              { label: 'Dojo 任务', value: health?.summary?.totalDojoJobs ?? 0, icon: '⚡' },
              { label: '知识结晶', value: health?.summary?.totalCrystals ?? 0, icon: '💎' },
              { label: '干预记录', value: health?.summary?.totalInterventions ?? 0, icon: '🎮' },
              { label: '追踪记录', value: health?.summary?.totalTraces ?? 0, icon: '📊' },
              { label: '活跃告警', value: health?.summary?.firingAlerts ?? 0, icon: '🔔' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 px-2 py-1.5 bg-zinc-800/30 rounded">
                <span className="text-sm">{item.icon}</span>
                <div>
                  <div className="text-[11px] text-zinc-500">{item.label}</div>
                  <div className="text-sm font-mono text-zinc-200">{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      </div>

      {/* 引擎模块状态 */}
      <PageCard title="引擎模块状态" compact>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {(health?.engines ?? []).map((eng: { module: string; status: string; activeAlerts: number }) => (
            <div
              key={eng.module}
              className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                selectedModule === eng.module ? 'border-blue-500/50 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40'
              }`}
              onClick={() => setSelectedModule(selectedModule === eng.module ? '' : eng.module)}
            >
              <div className={`w-2 h-2 rounded-full ${
                eng.status === 'healthy' ? 'bg-emerald-400' :
                eng.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-zinc-300 truncate">{MODULE_LABELS[eng.module] ?? eng.module}</div>
                {eng.activeAlerts > 0 && (
                  <div className="text-[10px] text-red-400">{eng.activeAlerts} 告警</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PageCard>

      {/* 指标列表 */}
      {metrics.length > 0 && (
        <PageCard title={selectedModule ? `${MODULE_LABELS[selectedModule] ?? selectedModule} 指标` : '最新指标快照'} compact>
          <DataTable
            data={metrics}
            columns={[
              { key: 'metricName', label: '指标名称', render: (r) => <span className="font-mono text-xs">{r.metricName}</span> },
              { key: 'engineModule', label: '模块', render: (r) => <span className="text-xs">{MODULE_LABELS[r.engineModule] ?? r.engineModule}</span> },
              { key: 'metricType', label: '类型', render: (r) => <Badge variant="outline" className="text-[10px] px-1 py-0">{r.metricType}</Badge> },
              { key: 'value', label: '值', render: (r) => <span className="font-mono text-xs text-white">{typeof r.value === 'number' ? r.value.toFixed(4) : r.value}</span> },
              { key: 'collectedAt', label: '采集时间', render: (r) => <span className="text-xs text-zinc-500">{formatTime(r.collectedAt)}</span> },
            ]}
            emptyMessage="暂无指标数据"
          />
        </PageCard>
      )}
    </div>
  );
}

// ============================================================================
// Tab 3: 告警规则引擎
// ============================================================================
function AlertsPanel() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'rules'>('alerts');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showCreateRule, setShowCreateRule] = useState(false);

  // 告警事件
  const alertsQuery = trpc.evoEvolution.observability.listAlerts.useQuery(
    {
      severity: (filterSeverity || undefined) as any,
      status: (filterStatus || undefined) as any,
      limit: 50,
    },
    { refetchInterval: 5000, retry: 1 }
  );
  const alertStatsQuery = trpc.evoEvolution.observability.getAlertStats.useQuery(undefined, { refetchInterval: 8000, retry: 1 });

  // 告警规则
  const rulesQuery = trpc.evoEvolution.observability.listAlertRules.useQuery(undefined, { refetchInterval: 15000, retry: 1 });

  // 操作 mutations
  const ackAlert = trpc.evoEvolution.observability.acknowledgeAlert.useMutation({ onSuccess: () => alertsQuery.refetch() });
  const resolveAlert = trpc.evoEvolution.observability.resolveAlert.useMutation({ onSuccess: () => alertsQuery.refetch() });
  const silenceAlert = trpc.evoEvolution.observability.silenceAlert.useMutation({ onSuccess: () => alertsQuery.refetch() });
  const toggleRule = trpc.evoEvolution.observability.updateAlertRule.useMutation({ onSuccess: () => rulesQuery.refetch() });
  const deleteRule = trpc.evoEvolution.observability.deleteAlertRule.useMutation({ onSuccess: () => rulesQuery.refetch() });
  const seedRules = trpc.evoEvolution.observability.seedAlertRules.useMutation({ onSuccess: () => rulesQuery.refetch() });

  const alertStats = alertStatsQuery.data;
  const alerts = alertsQuery.data?.alerts ?? [];
  const rules = rulesQuery.data?.rules ?? [];

  return (
    <div className="space-y-4">
      {/* 告警统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard value={alertStats?.total ?? 0} label="总告警数" icon={<Bell className="w-4 h-4" />} compact />
        <StatCard value={alertStats?.firing ?? 0} label="触发中" icon={<AlertTriangle className="w-4 h-4 text-red-400" />} compact />
        <StatCard value={alertStats?.acknowledged ?? 0} label="已确认" icon={<Eye className="w-4 h-4 text-amber-400" />} compact />
        <StatCard value={alertStats?.resolved ?? 0} label="已解决" icon={<Check className="w-4 h-4 text-emerald-400" />} compact />
        <StatCard value={alertStats?.silenced ?? 0} label="已静默" icon={<BellOff className="w-4 h-4 text-zinc-400" />} compact />
      </div>

      {/* 严重级别分布 */}
      {alertStats?.bySeverity && alertStats.bySeverity.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">活跃告警分布:</span>
          {alertStats.bySeverity.map((s: { severity: string | null; count: number }) => (
            <Badge key={s.severity} className={`text-[10px] ${SEVERITY_COLORS[s.severity ?? 'warning']}`}>
              {s.severity}: {s.count}
            </Badge>
          ))}
        </div>
      )}

      {/* 子 Tab: 告警事件 / 告警规则 */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <Button
          variant={activeTab === 'alerts' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setActiveTab('alerts')}
        >
          <Bell className="w-3 h-3 mr-1" /> 告警事件 ({alertStats?.firing ?? 0})
        </Button>
        <Button
          variant={activeTab === 'rules' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setActiveTab('rules')}
        >
          <Settings className="w-3 h-3 mr-1" /> 告警规则 ({rules.length})
        </Button>
      </div>

      {activeTab === 'alerts' ? (
        <>
          {/* 过滤器 */}
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-zinc-500" />
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-900 border-zinc-700">
                <SelectValue placeholder="严重级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="fatal">Fatal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-900 border-zinc-700">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="firing">触发中</SelectItem>
                <SelectItem value="acknowledged">已确认</SelectItem>
                <SelectItem value="resolved">已解决</SelectItem>
                <SelectItem value="silenced">已静默</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs ml-auto" onClick={() => alertsQuery.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> 刷新
            </Button>
          </div>

          {/* 告警列表 */}
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <EmptyState message="暂无告警事件" icon="🔔" />
            ) : (
              alerts.map((alert: any) => (
                <div key={alert.id} className={`border rounded-lg px-4 py-3 ${
                  alert.status === 'firing' ? 'border-red-500/30 bg-red-500/5' :
                  alert.status === 'acknowledged' ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-zinc-800 bg-zinc-900/40'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {alert.severity === 'critical' || alert.severity === 'fatal' ? (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      ) : alert.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Bell className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{alert.alertName}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${SEVERITY_COLORS[alert.severity ?? 'warning']}`}>
                          {alert.severity}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[alert.status ?? 'firing']}`}>
                          {alert.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        模块: {MODULE_LABELS[alert.engineModule] ?? alert.engineModule}
                        {' · '}值: <span className="font-mono text-zinc-300">{alert.metricValue}</span>
                        {' · '}阈值: <span className="font-mono text-zinc-300">{alert.threshold}</span>
                        {' · '}{formatTime(alert.firedAt)}
                      </div>
                      {alert.message && <div className="text-xs text-zinc-400 mt-1">{alert.message}</div>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {alert.status === 'firing' && (
                        <>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => ackAlert.mutate({ id: alert.id })}>
                            确认
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => silenceAlert.mutate({ id: alert.id })}>
                            静默
                          </Button>
                        </>
                      )}
                      {(alert.status === 'firing' || alert.status === 'acknowledged') && (
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 text-emerald-400" onClick={() => resolveAlert.mutate({ id: alert.id })}>
                          解决
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* 告警规则 */}
          <div className="flex items-center gap-2 mb-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => seedRules.mutate()}>
              <Zap className="w-3 h-3 mr-1" /> 种子化默认规则
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowCreateRule(true)}>
              <Plus className="w-3 h-3 mr-1" /> 新建规则
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs ml-auto" onClick={() => rulesQuery.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> 刷新
            </Button>
          </div>

          <div className="space-y-2">
            {rules.length === 0 ? (
              <EmptyState message="暂无告警规则，点击「种子化默认规则」创建" icon="⚙️" />
            ) : (
              rules.map((rule: any) => (
                <div key={rule.id} className={`border rounded-lg px-4 py-3 ${
                  rule.enabled ? 'border-zinc-800 bg-zinc-900/40' : 'border-zinc-800/50 bg-zinc-900/20 opacity-60'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{rule.name}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${SEVERITY_COLORS[rule.severity ?? 'warning']}`}>
                          {rule.severity}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {MODULE_LABELS[rule.engineModule] ?? rule.engineModule}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        <span className="font-mono">{rule.metricName}</span>
                        {' '}{OPERATOR_LABELS[rule.operator] ?? rule.operator}{' '}
                        <span className="font-mono text-zinc-300">{rule.threshold}</span>
                        {rule.description && <span className="ml-2 text-zinc-600">— {rule.description}</span>}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        持续 {rule.durationSeconds}s · 冷却 {rule.cooldownSeconds}s
                        {rule.triggerCount ? ` · 已触发 ${rule.triggerCount} 次` : ''}
                        {rule.lastTriggeredAt && ` · 上次触发: ${formatTime(rule.lastTriggeredAt)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={!!rule.enabled}
                        onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, enabled: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                        onClick={() => deleteRule.mutate({ id: rule.id })}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 创建规则对话框 */}
          <CreateRuleDialog open={showCreateRule} onClose={() => setShowCreateRule(false)} onCreated={() => rulesQuery.refetch()} />
        </>
      )}
    </div>
  );
}

/** 创建告警规则对话框 */
function CreateRuleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    engineModule: 'shadowEvaluator',
    metricName: '',
    operator: 'gt' as 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq',
    threshold: 0,
    severity: 'warning' as 'info' | 'warning' | 'critical' | 'fatal',
    description: '',
    durationSeconds: 60,
    cooldownSeconds: 300,
  });

  const createRule = trpc.evoEvolution.observability.createAlertRule.useMutation({
    onSuccess: () => {
      onCreated();
      onClose();
      setForm({ name: '', engineModule: 'shadowEvaluator', metricName: '', operator: 'gt', threshold: 0, severity: 'warning', description: '', durationSeconds: 60, cooldownSeconds: 300 });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建告警规则</DialogTitle>
          <DialogDescription>配置告警条件和通知策略</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">规则名称</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例: 影子评估失败率过高" className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">引擎模块</label>
              <Select value={form.engineModule} onValueChange={v => setForm({ ...form, engineModule: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENGINE_MODULES.map(m => <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">严重级别</label>
              <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="fatal">Fatal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">指标名称</label>
            <Input value={form.metricName} onChange={e => setForm({ ...form, metricName: e.target.value })} placeholder="例: shadow_eval.failure_rate" className="h-8 text-sm font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">运算符</label>
              <Select value={form.operator} onValueChange={v => setForm({ ...form, operator: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">阈值</label>
              <Input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })} className="h-8 text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">持续时间 (秒)</label>
              <Input type="number" value={form.durationSeconds} onChange={e => setForm({ ...form, durationSeconds: parseInt(e.target.value) || 60 })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">冷却时间 (秒)</label>
              <Input type="number" value={form.cooldownSeconds} onChange={e => setForm({ ...form, cooldownSeconds: parseInt(e.target.value) || 300 })} className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">描述</label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="规则描述..." className="h-8 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={() => createRule.mutate(form)} disabled={!form.name || !form.metricName}>
            创建规则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 主页面
// ============================================================================
export default function EvolutionObservability() {
  return (
    <MainLayout title="可观测性中心">
      <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold text-zinc-100">可观测性中心</h1>
          </div>
          <Badge variant="outline" className="text-[10px] px-2 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
            Phase 3
          </Badge>
          <span className="text-xs text-zinc-500">全链路追踪 · 性能指标 · 告警规则引擎</span>
        </div>

        <Tabs defaultValue="traces" className="w-full">
          <TabsList className="bg-zinc-900/80 border border-zinc-800 mb-4">
            <TabsTrigger value="traces" className="text-xs gap-1.5">
              <Layers className="w-3.5 h-3.5" /> 全链路追踪
            </TabsTrigger>
            <TabsTrigger value="metrics" className="text-xs gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 性能指标
            </TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs gap-1.5">
              <Bell className="w-3.5 h-3.5" /> 告警规则
            </TabsTrigger>
          </TabsList>

          <TabsContent value="traces">
            <TracePanel />
          </TabsContent>
          <TabsContent value="metrics">
            <MetricsPanel />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
