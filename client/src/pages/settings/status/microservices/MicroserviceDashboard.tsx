/**
 * 微服务监控面板 — 所有数据从后端 trpc API 获取真实数据
 * 
 * 数据来源：
 * - 服务总览 → trpc.microservice.getServices（从 OS + circuitBreaker + metricsCollector 采集）
 * - 服务拓扑 → trpc.microservice.getTopology（从 SERVICE_REGISTRY + circuitBreaker 推导）
 * - 断路器状态 → trpc.microservice.getCircuitBreakers（从 opossum circuitBreakerRegistry 读取）
 * - Prometheus 指标 → trpc.microservice.getPrometheusMetrics（从 prom-client registry 读取）
 */
import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';

// ============================================================
// 工具函数
// ============================================================
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  switch (status) {
    case 'healthy': case 'closed': return 'success';
    case 'degraded': case 'halfOpen': return 'warning';
    case 'down': case 'open': return 'danger';
    default: return 'default';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy': return '健康';
    case 'degraded': return '降级';
    case 'down': return '故障';
    case 'closed': return '闭合';
    case 'halfOpen': return '半开';
    case 'open': return '断开';
    default: return status;
  }
}

// ============================================================
// 服务总览 Tab
// ============================================================
function ServiceOverviewTab() {
  const { data: services, isLoading, refetch } = trpc.microservice.getServices.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: sysRes } = trpc.microservice.getSystemResources.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const svcList = services || [];
  const healthyCount = svcList.filter(s => s.status === 'healthy').length;
  const degradedCount = svcList.filter(s => s.status === 'degraded').length;
  const downCount = svcList.filter(s => s.status === 'down').length;

  return (
    <div className="space-y-3">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={svcList.length} label="服务总数" icon="🔧" compact />
        <StatCard value={healthyCount} label="健康服务" icon="✅" compact />
        <StatCard value={degradedCount} label="降级服务" icon="⚠️" compact />
        <StatCard value={downCount} label="故障服务" icon="❌" compact />
      </div>

      {/* 系统资源 */}
      {sysRes && (
        <PageCard title="系统资源" icon={<span>📊</span>} compact>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">CPU 使用率</div>
              <div className="font-mono font-semibold text-sm">{sysRes.cpu.usage}%</div>
              <Progress value={sysRes.cpu.usage} className="mt-1 h-1.5" />
              <div className="text-muted-foreground mt-0.5">{sysRes.cpu.cores} 核心 · {sysRes.cpu.model.split(' ').slice(0, 3).join(' ')}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">内存使用率</div>
              <div className="font-mono font-semibold text-sm">{sysRes.memory.usagePercent}%</div>
              <Progress value={sysRes.memory.usagePercent} className="mt-1 h-1.5" />
              <div className="text-muted-foreground mt-0.5">{formatBytes(sysRes.memory.used)} / {formatBytes(sysRes.memory.total)}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">系统运行时间</div>
              <div className="font-mono font-semibold text-sm">{formatUptime(sysRes.uptime)}</div>
              <div className="text-muted-foreground mt-1">进程: {formatUptime(sysRes.processUptime)}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">负载均值</div>
              <div className="font-mono font-semibold text-sm">{sysRes.loadAverage.map((v: number) => v.toFixed(2)).join(' / ')}</div>
              <div className="text-muted-foreground mt-1">{sysRes.platform} · Node {sysRes.nodeVersion}</div>
            </div>
          </div>
        </PageCard>
      )}

      {/* 服务列表 */}
      <PageCard
        title="服务实例"
        icon={<span>🔧</span>}
        action={
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
            刷新
          </button>
        }
        compact
      >
        <div className="space-y-2">
          {svcList.map(svc => (
            <div key={svc.id} className="border border-border rounded-md p-2.5 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(svc.status)} dot>{statusLabel(svc.status)}</Badge>
                  <span className="font-medium text-sm">{svc.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">v{svc.version}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>端口: {svc.port}</span>
                  {svc.grpcPort && <span>gRPC: {svc.grpcPort}</span>}
                  <span>运行: {formatUptime(svc.uptime)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">请求率</span>
                  <div className="font-mono font-semibold">{svc.requestRate}/s</div>
                </div>
                <div>
                  <span className="text-muted-foreground">P99 延迟</span>
                  <div className="font-mono font-semibold">{svc.p99Latency}ms</div>
                </div>
                <div>
                  <span className="text-muted-foreground">错误率</span>
                  <div className={`font-mono font-semibold ${svc.errorRate > 5 ? 'text-destructive' : ''}`}>{svc.errorRate}%</div>
                </div>
                <div>
                  <span className="text-muted-foreground">CPU</span>
                  <div className="flex items-center gap-1">
                    <Progress value={svc.cpu} className="h-1 flex-1" />
                    <span className="font-mono">{svc.cpu}%</span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">内存</span>
                  <div className="flex items-center gap-1">
                    <Progress value={svc.memory} className="h-1 flex-1" />
                    <span className="font-mono">{svc.memory}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  );
}

// ============================================================
// 服务拓扑 Tab
// ============================================================
function ServiceTopologyTab() {
  const { data: topology, isLoading } = trpc.microservice.getTopology.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const { data: selectedDetail } = trpc.microservice.getServiceDetail.useQuery(
    { serviceId: selectedNode || '' },
    { enabled: !!selectedNode }
  );

  if (isLoading || !topology) {
    return <Skeleton className="h-96" />;
  }

  // 布局计算 — 放射状布局
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const coreNodes = topology.nodes.filter((n: any) => n.type === 'core');
  const businessNodes = topology.nodes.filter((n: any) => n.type === 'business');
  const infraNodes = topology.nodes.filter((n: any) => n.type === 'infrastructure');

  const gateway = topology.nodes.find((n: any) => n.id === 'api-gateway');
  if (gateway) nodePositions[gateway.id] = { x: 50, y: 25 };

  coreNodes.filter((n: any) => n.id !== 'api-gateway').forEach((n: any, i: number, arr: any[]) => {
    const angle = (Math.PI * 0.3) + (i / Math.max(arr.length - 1, 1)) * Math.PI * 0.4;
    nodePositions[n.id] = { x: 50 + Math.cos(angle) * 30, y: 25 - Math.sin(angle) * 15 };
  });

  businessNodes.forEach((n: any, i: number) => {
    const angle = (Math.PI * 0.15) + (i / businessNodes.length) * Math.PI * 0.7;
    nodePositions[n.id] = { x: 50 + Math.cos(angle) * 35, y: 55 - Math.sin(angle) * 20 };
  });

  infraNodes.forEach((n: any, i: number, arr: any[]) => {
    nodePositions[n.id] = { x: 15 + (i / Math.max(arr.length - 1, 1)) * 70, y: 85 };
  });

  const relatedConnections = hoveredNode
    ? topology.connections.filter((c: any) => c.source === hoveredNode || c.target === hoveredNode)
    : [];
  const relatedNodeIds = new Set(relatedConnections.flatMap((c: any) => [c.source, c.target]));

  return (
    <div className="relative" style={{ minHeight: '500px' }}>
      {/* SVG 连线层 */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none', zIndex: 1 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <marker id="arrow-healthy" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.7 0.15 150)" />
          </marker>
          <marker id="arrow-degraded" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.75 0.15 60)" />
          </marker>
          <marker id="arrow-down" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.65 0.2 25)" />
          </marker>
        </defs>
        {topology.connections.map((conn: any, i: number) => {
          const from = nodePositions[conn.source];
          const to = nodePositions[conn.target];
          if (!from || !to) return null;
          const isHighlighted = relatedConnections.some(
            (c: any) => c.source === conn.source && c.target === conn.target
          );
          const isHovering = hoveredNode !== null;
          const colors: Record<string, string> = {
            healthy: 'oklch(0.7 0.15 150 / 0.8)',
            degraded: 'oklch(0.75 0.15 60 / 0.9)',
            down: 'oklch(0.65 0.2 25 / 0.9)',
          };
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={colors[conn.status] || colors.healthy}
              strokeWidth={isHighlighted ? 0.6 : 0.3}
              strokeDasharray={conn.status === 'degraded' ? '1.5,1' : conn.status === 'down' ? '0.8,0.8' : 'none'}
              opacity={isHovering ? (isHighlighted ? 1 : 0.15) : 0.7}
              markerEnd={`url(#arrow-${conn.status || 'healthy'})`}
            />
          );
        })}
      </svg>

      {/* HTML 节点层 */}
      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        {topology.nodes.map((node: any) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const isRelated = relatedNodeIds.has(node.id);
          const isHovering = hoveredNode !== null;
          const dimmed = isHovering && !isHovered && !isRelated;

          const bgColors: Record<string, string> = {
            healthy: 'bg-emerald-500/20 border-emerald-500/50',
            degraded: 'bg-amber-500/20 border-amber-500/50',
            down: 'bg-red-500/20 border-red-500/50',
          };

          return (
            <button
              key={node.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-xs transition-all duration-200 cursor-pointer
                ${bgColors[node.status] || bgColors.healthy}
                ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
                ${isHovered ? 'scale-110 shadow-lg z-10' : ''}
                ${dimmed ? 'opacity-20' : 'opacity-100'}
              `}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : node.id); }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <div className="font-medium whitespace-nowrap">{node.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                :{node.port} {node.grpcPort ? `· gRPC:${node.grpcPort}` : ''}
              </div>
            </button>
          );
        })}
      </div>

      {/* 点击空白关闭详情 */}
      <div className="absolute inset-0" style={{ zIndex: 0 }} onClick={() => setSelectedNode(null)} />

      {/* 详情面板 */}
      {selectedNode && selectedDetail && (
        <div className="absolute top-2 right-2 w-64 bg-card border border-border rounded-lg p-3 shadow-xl" style={{ zIndex: 30 }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{selectedDetail.name}</span>
            <Badge variant={statusVariant(selectedDetail.status)} dot>{statusLabel(selectedDetail.status)}</Badge>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">版本</span><span className="font-mono">v{selectedDetail.version}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">运行时间</span><span className="font-mono">{formatUptime(selectedDetail.uptime)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">请求率</span><span className="font-mono">{selectedDetail.requestRate}/s</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">P99 延迟</span><span className="font-mono">{selectedDetail.p99Latency}ms</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">错误率</span><span className={`font-mono ${selectedDetail.errorRate > 5 ? 'text-destructive' : ''}`}>{selectedDetail.errorRate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">活跃连接</span><span className="font-mono">{selectedDetail.activeConnections}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">端口</span><span className="font-mono">{selectedDetail.port}</span></div>
            {selectedDetail.grpcPort && (
              <div className="flex justify-between"><span className="text-muted-foreground">gRPC</span><span className="font-mono">{selectedDetail.grpcPort}</span></div>
            )}
            <div className="pt-1 border-t border-border">
              <span className="text-muted-foreground">依赖服务</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedDetail.dependencies.map((dep: string) => (
                  <Badge key={dep} variant="default">{dep}</Badge>
                ))}
              </div>
            </div>
          </div>
          <button className="mt-2 w-full text-xs text-center text-muted-foreground hover:text-foreground" onClick={() => setSelectedNode(null)}>
            关闭
          </button>
        </div>
      )}

      {/* 图例 */}
      <div className="absolute bottom-2 left-2 flex items-center gap-3 text-[10px] text-muted-foreground bg-card/80 backdrop-blur-sm rounded px-2 py-1 border border-border" style={{ zIndex: 20 }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />健康</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />降级</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />故障</span>
        <span>|</span>
        <span>实线=正常 虚线=降级/故障</span>
      </div>
    </div>
  );
}

// ============================================================
// 断路器 Tab
// ============================================================
function CircuitBreakerTab() {
  const { data: breakers, isLoading, refetch } = trpc.microservice.getCircuitBreakers.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const controlMutation = trpc.microservice.controlCircuitBreaker.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  const breakerList = breakers || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          共 {breakerList.length} 个断路器 ·{' '}
          <span className="text-emerald-500">{breakerList.filter((b: any) => b.state === 'closed').length} 闭合</span> ·{' '}
          <span className="text-amber-500">{breakerList.filter((b: any) => b.state === 'halfOpen').length} 半开</span> ·{' '}
          <span className="text-red-500">{breakerList.filter((b: any) => b.state === 'open').length} 断开</span>
        </div>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">刷新</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {breakerList.map((breaker: any) => (
          <PageCard key={breaker.name} compact>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm capitalize">{breaker.name}</span>
                <Badge variant={statusVariant(breaker.state)} dot>{statusLabel(breaker.state)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">总请求</span>
                  <span className="font-mono">{breaker.fires}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">成功</span>
                  <span className="font-mono text-emerald-500">{breaker.successes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">失败</span>
                  <span className="font-mono text-red-500">{breaker.failures}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">拒绝</span>
                  <span className="font-mono text-amber-500">{breaker.rejects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">超时</span>
                  <span className="font-mono">{breaker.timeouts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">降级</span>
                  <span className="font-mono">{breaker.fallbacks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">成功率</span>
                  <span className={`font-mono font-semibold ${breaker.successRate < 90 ? 'text-red-500' : breaker.successRate < 99 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {breaker.successRate}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">平均延迟</span>
                  <span className="font-mono">{breaker.latencyMean}ms</span>
                </div>
              </div>
              {/* 操作按钮 */}
              <div className="flex gap-1.5 pt-1 border-t border-border">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex-1 text-xs py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        disabled={breaker.state === 'open' || controlMutation.isPending}
                        onClick={() => controlMutation.mutate({ name: breaker.name, action: 'open' })}
                      >
                        强制断开
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>手动打开断路器（维护模式）</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex-1 text-xs py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        disabled={breaker.state === 'closed' || controlMutation.isPending}
                        onClick={() => controlMutation.mutate({ name: breaker.name, action: 'close' })}
                      >
                        强制闭合
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>手动关闭断路器（恢复服务）</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </PageCard>
        ))}
      </div>
      {breakerList.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          暂无已注册的断路器。断路器会在首次访问外部服务时自动创建。
        </div>
      )}
    </div>
  );
}

// ============================================================
// Prometheus 指标 Tab
// ============================================================
function PrometheusMetricsTab() {
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  const { data: metricsData, isLoading, refetch } = trpc.microservice.getPrometheusMetrics.useQuery(
    { timeRange, service: serviceFilter === 'all' ? undefined : serviceFilter },
    { refetchInterval: 30000 }
  );

  // 迷你折线图 SVG
  const MiniSparkline = useCallback(({ data, color }: { data: Array<{ timestamp: number; value: number }>; color: string }) => {
    if (!data || data.length < 2) return <div className="h-8 w-full bg-muted/30 rounded" />;
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 120;
    const h = 32;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={w} height={h} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  const metrics = metricsData?.metrics || [];
  const metricTypeColors: Record<string, string> = {
    counter: 'oklch(0.7 0.15 200)',
    gauge: 'oklch(0.7 0.15 150)',
    histogram: 'oklch(0.7 0.15 280)',
    summary: 'oklch(0.7 0.15 60)',
  };
  const metricTypeLabels: Record<string, string> = {
    counter: '计数器',
    gauge: '仪表',
    histogram: '直方图',
    summary: '摘要',
  };

  return (
    <div className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15m">15 分钟</SelectItem>
              <SelectItem value="1h">1 小时</SelectItem>
              <SelectItem value="6h">6 小时</SelectItem>
              <SelectItem value="24h">24 小时</SelectItem>
              <SelectItem value="7d">7 天</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部指标</SelectItem>
              <SelectItem value="http">HTTP 请求</SelectItem>
              <SelectItem value="algorithm">算法执行</SelectItem>
              <SelectItem value="pipeline">管道执行</SelectItem>
              <SelectItem value="circuit_breaker">断路器</SelectItem>
              <SelectItem value="kafka">Kafka</SelectItem>
              <SelectItem value="db_pool">数据库连接池</SelectItem>
              <SelectItem value="saga">Saga 事务</SelectItem>
              <SelectItem value="outbox">Outbox 事件</SelectItem>
              <SelectItem value="websocket">WebSocket</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>共 {metricsData?.totalMetrics || 0} 个指标</span>
          {metricsData?.lastScrape && (
            <span>· 最后采集: {new Date(metricsData.lastScrape).toLocaleTimeString()}</span>
          )}
          <button onClick={() => refetch()} className="text-primary hover:underline">刷新</button>
        </div>
      </div>

      {/* 指标列表 */}
      <div className="space-y-2">
        {metrics.map((metric: any) => (
          <PageCard key={metric.name} compact>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-sm font-medium truncate">{metric.name}</span>
                  <Badge variant="info">
                    {metricTypeLabels[metric.type] || metric.type}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{metric.help}</div>
                <div className="font-mono text-lg font-bold mt-1">
                  {typeof metric.currentValue === 'number'
                    ? metric.currentValue > 1000000
                      ? `${(metric.currentValue / 1000000).toFixed(2)}M`
                      : metric.currentValue > 1000
                        ? `${(metric.currentValue / 1000).toFixed(2)}K`
                        : metric.currentValue.toFixed(3)
                    : metric.currentValue}
                </div>
              </div>
              <div className="ml-3 flex-shrink-0">
                <MiniSparkline
                  data={metric.sparkline}
                  color={metricTypeColors[metric.type] || 'oklch(0.7 0.1 200)'}
                />
              </div>
            </div>
          </PageCard>
        ))}
      </div>

      {metrics.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          {metricsData?.totalMetrics === 0
            ? '暂无 Prometheus 指标。指标会在首次 HTTP 请求后自动注册。'
            : '没有匹配的指标。请调整筛选条件。'}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function MicroserviceDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <MainLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">微服务监控</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              实时监控平台微服务状态、断路器健康度和 Prometheus 指标
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">服务总览</TabsTrigger>
            <TabsTrigger value="topology">服务拓扑</TabsTrigger>
            <TabsTrigger value="circuit-breaker">断路器</TabsTrigger>
            <TabsTrigger value="prometheus">Prometheus 指标</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ServiceOverviewTab />
          </TabsContent>
          <TabsContent value="topology">
            <ServiceTopologyTab />
          </TabsContent>
          <TabsContent value="circuit-breaker">
            <CircuitBreakerTab />
          </TabsContent>
          <TabsContent value="prometheus">
            <PrometheusMetricsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
