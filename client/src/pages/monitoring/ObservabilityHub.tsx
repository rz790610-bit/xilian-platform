/**
 * ObservabilityHub — 统一观测中枢
 *
 * 路由: /monitoring/hub
 * 双视图:
 *   1. 运营视图 (内部) — 模块使用率、放弃率、误报率、性能瓶颈
 *   2. 状态视图 (客户) — 设备健康总览、系统运行状态、今日告警、关键指标
 *
 * 数据源:
 *   trpc.observabilityHub.getOperationsView (30s)
 *   trpc.observabilityHub.getStatusView     (15s)
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import {
  Activity,
  Cpu,
  HardDrive,
  Zap,
  AlertTriangle,
  Server,
  RefreshCw,
  Shield,
  Radio,
  BarChart3,
  TrendingUp,
  CheckCircle,
  XCircle,
  Bell,
  Wrench,
  Clock,
  Eye,
  Settings2,
  Loader2,
  Gauge,
  Ban,
  ThumbsDown,
  Timer,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

type HubView = 'operations' | 'status';

/** 客户端类型 — 匹配 server/platform/observability/observability-hub.ts */
interface AlertEntry {
  id: string;
  severity: string;
  title: string;
  source: string;
  createdAt: number;
}

interface CircuitBreakerEntry {
  name: string;
  state: 'closed' | 'open' | 'halfOpen';
  fires: number;
  failures: number;
  latencyMean: number;
}

interface ServiceHealthEntry {
  name: string;
  status: string;
  latency: number;
  lastCheck: number;
}

interface OperationsViewData {
  systemHealth: {
    status: string;
    uptime: number;
    services: ServiceHealthEntry[];
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    requestRate: number;
    avgLatency: number;
    errorRate: number;
    p95Latency: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
    recentAlerts: AlertEntry[];
  };
  circuitBreakers: {
    total: number;
    open: number;
    halfOpen: number;
    closed: number;
    entries: CircuitBreakerEntry[];
  };
  eventBus: {
    totalPublished: number;
    totalFailed: number;
    activeTopics: number;
    recentEvents: unknown[];
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    onlineRate: number;
  };
  evaluation: {
    avgScore: number;
    improvingCount: number;
    regressingCount: number;
    topRecommendation: string | null;
  } | null;
  metrics: {
    nexusMetricsCount: number;
    evoMetricsCount: number;
  };
  generatedAt: number;
}

interface StatusViewData {
  overallStatus: string;
  overallMessage: string;
  devices: {
    totalDevices: number;
    onlineDevices: number;
    onlineRate: number;
    statusLabel: string;
  };
  kpis: {
    earlyWarningDays: number;
    avoidedDowntimes: number;
    falseAlarmRate: number;
    platformScore: number;
  };
  recentSummary: {
    alertsHandled: number;
    diagnosesCompleted: number;
    maintenancesScheduled: number;
  };
  generatedAt: number;
}

// ── Status Configs ─────────────────────────────────────

const SYSTEM_STATUS: Record<string, { label: string; color: string }> = {
  healthy:  { label: '正常', color: 'text-emerald-500' },
  degraded: { label: '降级', color: 'text-yellow-500' },
  critical: { label: '故障', color: 'text-red-500' },
  unknown:  { label: '未知', color: 'text-muted-foreground' },
};

const OVERALL_STATUS: Record<string, { color: string; bg: string; Icon: typeof CheckCircle }> = {
  operational: { color: 'text-emerald-500', bg: 'bg-emerald-500', Icon: CheckCircle },
  degraded:    { color: 'text-yellow-500',  bg: 'bg-yellow-500',  Icon: AlertTriangle },
  outage:      { color: 'text-red-500',     bg: 'bg-red-500',     Icon: XCircle },
};

function severityBadge(severity: string) {
  const v =
    severity === 'critical' || severity === 'high'
      ? 'destructive' as const
      : severity === 'medium' || severity === 'low' || severity === 'warning'
        ? 'warning' as const
        : 'secondary' as const;
  return <Badge variant={v}>{severity}</Badge>;
}

// ── Main Component ─────────────────────────────────────

export default function ObservabilityHub() {
  const [view, setView] = useState<HubView>('status');

  const opsQuery = trpc.observabilityHub.getOperationsView.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: view === 'operations',
  });

  const statusQuery = trpc.observabilityHub.getStatusView.useQuery(undefined, {
    refetchInterval: 15_000,
    enabled: view === 'status',
  });

  const refreshMut = trpc.observabilityHub.refresh.useMutation({
    onSuccess: () => {
      opsQuery.refetch();
      statusQuery.refetch();
    },
  });

  return (
    <MainLayout title="统一观测中枢">
      <div className="space-y-4">
        {/* ── 视图切换 + 刷新 ─────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-card border rounded-lg p-1">
            <button
              onClick={() => setView('status')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                view === 'status'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <Eye className="h-4 w-4" />
              状态视图
            </button>
            <button
              onClick={() => setView('operations')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                view === 'operations'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <Settings2 className="h-4 w-4" />
              运营视图
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', refreshMut.isPending && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {/* ── 视图内容 ─────────────────────────────── */}
        {view === 'status' ? (
          <StatusViewPanel data={statusQuery.data as StatusViewData | undefined} isLoading={statusQuery.isLoading} />
        ) : (
          <OperationsViewPanel data={opsQuery.data as OperationsViewData | undefined} isLoading={opsQuery.isLoading} />
        )}
      </div>
    </MainLayout>
  );
}

// ═══════════════════════════════════════════════════════
// 状态视图 — 面向客户
// ═══════════════════════════════════════════════════════

function StatusViewPanel({
  data,
  isLoading,
}: {
  data: StatusViewData | undefined;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return <LoadingPlaceholder />;
  }

  const cfg = OVERALL_STATUS[data.overallStatus] ?? OVERALL_STATUS.operational;
  const StatusIcon = cfg.Icon;

  return (
    <div className="space-y-4">
      {/* ── 整体状态横幅 ────────────────────────── */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-3">
            <span className={cn('w-3 h-3 rounded-full animate-pulse', cfg.bg)} />
            <StatusIcon className={cn('h-6 w-6', cfg.color)} />
            <span className={cn('text-xl font-bold', cfg.color)}>
              {data.overallMessage}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── 设备健康总览 ────────────────────────── */}
      <PageCard title="设备健康总览" icon={<Server className="w-4 h-4" />} compact>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            value={data.devices.totalDevices}
            label="设备总数"
            icon={<Server className="w-5 h-5 text-blue-500" />}
            compact
          />
          <StatCard
            value={data.devices.onlineDevices}
            label="在线设备"
            icon={<Activity className="w-5 h-5 text-emerald-500" />}
            compact
          />
          <StatCard
            value={`${data.devices.onlineRate}%`}
            label="在线率"
            icon={<Gauge className="w-5 h-5 text-cyan-500" />}
            compact
          />
          <StatCard
            value={data.devices.statusLabel ?? '运行中'}
            label="设备状态"
            icon={
              <Shield
                className={cn(
                  'w-5 h-5',
                  data.devices.onlineRate >= 95
                    ? 'text-emerald-500'
                    : data.devices.onlineRate >= 80
                      ? 'text-yellow-500'
                      : 'text-red-500',
                )}
              />
            }
            compact
          />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>设备在线率</span>
            <Badge
              variant={
                data.devices.onlineRate >= 95
                  ? 'success'
                  : data.devices.onlineRate >= 80
                    ? 'warning'
                    : 'destructive'
              }
            >
              {data.devices.onlineRate}%
            </Badge>
          </div>
          <Progress value={data.devices.onlineRate} className="h-2" />
        </div>
      </PageCard>

      {/* ── 关键指标 ────────────────────────────── */}
      <PageCard title="关键运营指标" icon={<TrendingUp className="w-4 h-4" />} compact>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            value={`${data.kpis.earlyWarningDays.toFixed(1)}天`}
            label="预警提前天数"
            icon={<Clock className="w-5 h-5 text-emerald-500" />}
            compact
          />
          <StatCard
            value={`${data.kpis.avoidedDowntimes}次`}
            label="避免停机次数"
            icon={<Shield className="w-5 h-5 text-purple-500" />}
            compact
          />
          <StatCard
            value={`${(data.kpis.falseAlarmRate * 100).toFixed(1)}%`}
            label="误报率"
            icon={<Bell className="w-5 h-5 text-orange-500" />}
            compact
          />
          <StatCard
            value={`${data.kpis.platformScore.toFixed(0)}分`}
            label="平台综合评分"
            icon={<TrendingUp className="w-5 h-5 text-cyan-500" />}
            compact
          />
        </div>
      </PageCard>

      {/* ── 今日告警摘要 ────────────────────────── */}
      <PageCard title="今日事件摘要" icon={<Bell className="w-4 h-4" />} compact>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Bell className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {data.recentSummary.alertsHandled}
              </div>
              <div className="text-xs text-muted-foreground">处理告警</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Wrench className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {data.recentSummary.diagnosesCompleted}
              </div>
              <div className="text-xs text-muted-foreground">完成诊断</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Clock className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {data.recentSummary.maintenancesScheduled}
              </div>
              <div className="text-xs text-muted-foreground">安排维护</div>
            </div>
          </div>
        </div>
      </PageCard>

      <div className="text-xs text-muted-foreground text-right">
        更新时间: {new Date(data.generatedAt).toLocaleString('zh-CN')}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 运营视图 — 面向内部运维
// ═══════════════════════════════════════════════════════

function OperationsViewPanel({
  data,
  isLoading,
}: {
  data: OperationsViewData | undefined;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return <LoadingPlaceholder />;
  }

  const sysStatus = SYSTEM_STATUS[data.systemHealth.status] ?? SYSTEM_STATUS.unknown;

  return (
    <div className="space-y-4">
      {/* ── 核心性能指标 ────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          value={sysStatus.label}
          label="系统状态"
          icon={<Shield className={cn('w-5 h-5', sysStatus.color)} />}
          compact
        />
        <StatCard
          value={`${(data.performance.cpuUsage ?? 0).toFixed(1)}%`}
          label="CPU 使用率"
          icon={<Cpu className="w-5 h-5 text-blue-500" />}
          compact
        />
        <StatCard
          value={`${(data.performance.memoryUsage ?? 0).toFixed(1)}%`}
          label="内存使用率"
          icon={<HardDrive className="w-5 h-5 text-purple-500" />}
          compact
        />
        <StatCard
          value={`${(data.performance.requestRate ?? 0).toFixed(0)}/s`}
          label="请求率"
          icon={<Zap className="w-5 h-5 text-yellow-500" />}
          compact
        />
        <StatCard
          value={`${((data.performance.errorRate ?? 0) * 100).toFixed(2)}%`}
          label="错误率"
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          compact
        />
        <StatCard
          value={`${data.devices.onlineRate}%`}
          label="设备在线率"
          icon={<Server className="w-5 h-5 text-emerald-500" />}
          compact
        />
      </div>

      {/* ── 模块使用率 + 性能瓶颈 (双列) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 模块使用率排行 */}
        <PageCard title="模块使用率排行" icon={<BarChart3 className="w-4 h-4" />} compact>
          <ModuleUsageRanking data={data} />
        </PageCard>

        {/* 性能瓶颈 */}
        <PageCard title="性能瓶颈分析" icon={<Timer className="w-4 h-4" />} compact>
          <PerformanceBottlenecks data={data} />
        </PageCard>
      </div>

      {/* ── 放弃率 + 误报率 (双列) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 放弃率 — 基于熔断器断开次数推算 */}
        <PageCard title="放弃率（熔断器状态）" icon={<Ban className="w-4 h-4" />} compact>
          <AbandonmentMetrics data={data} />
        </PageCard>

        {/* 误报率 — 基于告警统计推算 */}
        <PageCard title="误报率（告警质量）" icon={<ThumbsDown className="w-4 h-4" />} compact>
          <FalseAlarmMetrics data={data} />
        </PageCard>
      </div>

      {/* ── 告警列表 ────────────────────────────── */}
      <PageCard title="最近告警" icon={<Bell className="w-4 h-4" />} compact>
        <div className="flex gap-3 mb-3">
          <Badge variant="destructive">严重 {data.alerts.critical}</Badge>
          <Badge variant="warning">警告 {data.alerts.warning}</Badge>
          <Badge variant="secondary">信息 {data.alerts.info}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">级别</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className="w-[120px]">来源</TableHead>
              <TableHead className="w-[160px]">时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.alerts.recentAlerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  暂无告警
                </TableCell>
              </TableRow>
            ) : (
              data.alerts.recentAlerts.slice(0, 10).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{severityBadge(a.severity)}</TableCell>
                  <TableCell className="text-sm">{a.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(a.createdAt).toLocaleString('zh-CN')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PageCard>

      {/* ── EventBus + 指标 (双列) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PageCard title="EventBus 状态" icon={<Radio className="w-4 h-4" />} compact>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded bg-card border">
              <div className="text-xl font-bold tabular-nums">{data.eventBus.totalPublished}</div>
              <div className="text-xs text-muted-foreground">发布消息</div>
            </div>
            <div className="text-center p-2 rounded bg-card border">
              <div className={cn('text-xl font-bold tabular-nums', data.eventBus.totalFailed > 0 && 'text-red-500')}>
                {data.eventBus.totalFailed}
              </div>
              <div className="text-xs text-muted-foreground">失败消息</div>
            </div>
            <div className="text-center p-2 rounded bg-card border">
              <div className="text-xl font-bold tabular-nums">{data.eventBus.activeTopics}</div>
              <div className="text-xs text-muted-foreground">活跃主题</div>
            </div>
          </div>
        </PageCard>

        <PageCard title="平台指标" icon={<BarChart3 className="w-4 h-4" />} compact>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded bg-card border">
              <BarChart3 className="w-6 h-6 text-blue-500 shrink-0" />
              <div>
                <div className="text-xl font-bold">{data.metrics.nexusMetricsCount}</div>
                <div className="text-xs text-muted-foreground">Nexus 指标</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded bg-card border">
              <TrendingUp className="w-6 h-6 text-purple-500 shrink-0" />
              <div>
                <div className="text-xl font-bold">{data.metrics.evoMetricsCount}</div>
                <div className="text-xs text-muted-foreground">进化引擎指标</div>
              </div>
            </div>
          </div>
        </PageCard>
      </div>

      <div className="text-xs text-muted-foreground text-right">
        更新时间: {new Date(data.generatedAt).toLocaleString('zh-CN')}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 子组件
// ═══════════════════════════════════════════════════════

/** 模块使用率排行 — 基于 EventBus 活跃主题和服务调用 */
function ModuleUsageRanking({
  data,
}: {
  data: OperationsViewData;
}) {
  // 从 services + circuitBreakers 推算模块调用排行
  const modules = data.circuitBreakers.entries
    .map((cb: CircuitBreakerEntry) => ({
      name: cb.name,
      calls: cb.fires,
      failures: cb.failures,
      usageRate: cb.fires > 0 ? ((cb.fires - cb.failures) / cb.fires * 100) : 0,
    }))
    .sort((a: { calls: number }, b: { calls: number }) => b.calls - a.calls)
    .slice(0, 8);

  if (modules.length === 0) {
    // 没有真实数据时展示服务概况
    const services = data.systemHealth.services ?? [];
    if (services.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-6 text-sm">
          暂无模块调用数据
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {services.map((svc: ServiceHealthEntry, i: number) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <span className="text-sm truncate">{svc.name ?? `服务 ${i + 1}`}</span>
            <Badge variant="success" className="text-xs">运行中</Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {modules.map((m: { name: string; calls: number; failures: number; usageRate: number }, i: number) => (
        <div key={m.name} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-4 tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-sm font-medium truncate">{m.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {m.calls} 次调用
              </span>
            </div>
            <Progress value={m.usageRate} className="h-1.5" />
          </div>
          <span className={cn(
            'text-xs font-medium tabular-nums w-12 text-right',
            m.usageRate >= 95 ? 'text-emerald-500' : m.usageRate >= 80 ? 'text-yellow-500' : 'text-red-500',
          )}>
            {m.usageRate.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** 性能瓶颈 — 基于 P95 延迟和熔断器延迟数据 */
function PerformanceBottlenecks({
  data,
}: {
  data: OperationsViewData;
}) {
  // P95 延迟总览
  const p95 = data.performance.p95Latency ?? 0;

  // 从熔断器提取各服务延迟，找出瓶颈
  const bottlenecks = data.circuitBreakers.entries
    .filter((cb: CircuitBreakerEntry) => cb.latencyMean > 0)
    .sort((a: CircuitBreakerEntry, b: CircuitBreakerEntry) => b.latencyMean - a.latencyMean)
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
        <span className="text-sm">P95 响应延迟</span>
        <span className={cn(
          'text-lg font-bold tabular-nums',
          p95 > 1000 ? 'text-red-500' : p95 > 500 ? 'text-yellow-500' : 'text-emerald-500',
        )}>
          {p95.toFixed(0)} ms
        </span>
      </div>

      {bottlenecks.length === 0 ? (
        <div className="text-center text-muted-foreground py-4 text-sm">
          暂无延迟瓶颈数据
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>服务</TableHead>
              <TableHead className="text-right w-[100px]">平均延迟</TableHead>
              <TableHead className="text-right w-[80px]">失败数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bottlenecks.map((cb: CircuitBreakerEntry) => (
              <TableRow key={cb.name}>
                <TableCell className="text-sm font-mono truncate max-w-[200px]">{cb.name}</TableCell>
                <TableCell className={cn(
                  'text-right tabular-nums',
                  cb.latencyMean > 500 ? 'text-red-500' : cb.latencyMean > 200 ? 'text-yellow-500' : '',
                )}>
                  {cb.latencyMean.toFixed(1)} ms
                </TableCell>
                <TableCell className={cn('text-right tabular-nums', cb.failures > 0 && 'text-red-500')}>
                  {cb.failures}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** 放弃率 — 基于熔断器开/半开状态 */
function AbandonmentMetrics({
  data,
}: {
  data: OperationsViewData;
}) {
  const { total, open, halfOpen, closed } = data.circuitBreakers;
  const abandonRate = total > 0 ? ((open + halfOpen) / total * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums">{total}</div>
          <div className="text-xs text-muted-foreground">总服务</div>
        </div>
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-emerald-500">{closed}</div>
          <div className="text-xs text-muted-foreground">正常</div>
        </div>
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-yellow-500">{halfOpen}</div>
          <div className="text-xs text-muted-foreground">半开</div>
        </div>
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-red-500">{open}</div>
          <div className="text-xs text-muted-foreground">熔断</div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>服务放弃率</span>
          <span className={cn(
            'font-medium',
            abandonRate > 10 ? 'text-red-500' : abandonRate > 0 ? 'text-yellow-500' : 'text-emerald-500',
          )}>
            {abandonRate.toFixed(1)}%
          </span>
        </div>
        <Progress
          value={100 - abandonRate}
          className="h-2"
        />
      </div>
    </div>
  );
}

/** 误报率 — 基于告警数据推算 */
function FalseAlarmMetrics({
  data,
}: {
  data: OperationsViewData;
}) {
  const totalAlerts = data.alerts.critical + data.alerts.warning + data.alerts.info;
  // info 级别告警大部分是低价值/可能误报
  const estimatedFalseRate = totalAlerts > 0
    ? (data.alerts.info / totalAlerts * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-red-500">{data.alerts.critical}</div>
          <div className="text-xs text-muted-foreground">严重告警</div>
        </div>
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-yellow-500">{data.alerts.warning}</div>
          <div className="text-xs text-muted-foreground">警告</div>
        </div>
        <div className="p-2 rounded bg-card border">
          <div className="text-lg font-bold tabular-nums text-muted-foreground">{data.alerts.info}</div>
          <div className="text-xs text-muted-foreground">信息级</div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>告警精准率（估算）</span>
          <span className={cn(
            'font-medium',
            estimatedFalseRate > 50 ? 'text-red-500' : estimatedFalseRate > 20 ? 'text-yellow-500' : 'text-emerald-500',
          )}>
            {(100 - estimatedFalseRate).toFixed(1)}%
          </span>
        </div>
        <Progress value={100 - estimatedFalseRate} className="h-2" />
      </div>
      {data.evaluation && (
        <div className="flex items-center justify-between p-2 rounded bg-card border text-sm">
          <span className="text-muted-foreground">模型平均评分</span>
          <span className="font-bold tabular-nums">{data.evaluation.avgScore.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// ── Loading 占位 ────────────────────────────────────────

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>加载观测数据...</span>
    </div>
  );
}
