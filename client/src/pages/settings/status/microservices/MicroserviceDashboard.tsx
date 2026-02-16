/**
 * 微服务监控面板
 * 与「系统拓扑」和「状态监测」并行的独立监控页面
 * 包含：服务总览、服务拓扑图、断路器状态、Prometheus 指标
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Server, Zap, Shield, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Network, Cpu, MemoryStick, Timer, Eye, Box, GitBranch, BarChart3
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface MicroService {
  id: string;
  name: string;
  description: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'starting';
  version: string;
  replicas: { ready: number; total: number };
  uptime: string;
  endpoints: { grpc: string; http: string; metrics: string };
  resources: { cpu: number; memory: number; disk: number };
  metrics: {
    requestRate: number;
    errorRate: number;
    latencyP50: number;
    latencyP99: number;
    activeConnections: number;
  };
  dependencies: string[];
}

interface CircuitBreakerState {
  serviceId: string;
  serviceName: string;
  targetService: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  failureThreshold: number;
  lastFailure: string | null;
  lastStateChange: string;
  timeout: number;
  metrics: {
    totalRequests: number;
    failedRequests: number;
    successRate: number;
    avgResponseTime: number;
  };
}

interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  value: number;
  labels: Record<string, string>;
  history: number[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模拟数据
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SERVICES: MicroService[] = [
  {
    id: 'api-gateway', name: 'API Gateway', description: 'Strangler Fig 智能路由网关',
    status: 'healthy', version: 'v1.2.0', replicas: { ready: 3, total: 3 }, uptime: '14d 6h 32m',
    endpoints: { grpc: ':50050', http: ':3000', metrics: ':9090/metrics' },
    resources: { cpu: 35, memory: 42, disk: 15 },
    metrics: { requestRate: 12500, errorRate: 0.02, latencyP50: 3.2, latencyP99: 18.5, activeConnections: 856 },
    dependencies: ['device-service', 'algorithm-service', 'data-pipeline', 'knowledge-service', 'monitoring-service']
  },
  {
    id: 'device-service', name: 'Device Service', description: '设备管理与协议适配',
    status: 'healthy', version: 'v1.1.3', replicas: { ready: 2, total: 2 }, uptime: '14d 6h 30m',
    endpoints: { grpc: ':50051', http: ':3001', metrics: ':9091/metrics' },
    resources: { cpu: 48, memory: 55, disk: 22 },
    metrics: { requestRate: 8200, errorRate: 0.01, latencyP50: 5.1, latencyP99: 25.3, activeConnections: 342 },
    dependencies: ['infra-service']
  },
  {
    id: 'algorithm-service', name: 'Algorithm Service', description: '算法执行引擎（FFT/包络/趋势）',
    status: 'healthy', version: 'v1.3.0', replicas: { ready: 4, total: 4 }, uptime: '12d 18h 15m',
    endpoints: { grpc: ':50052', http: ':3002', metrics: ':9092/metrics' },
    resources: { cpu: 78, memory: 82, disk: 35 },
    metrics: { requestRate: 5600, errorRate: 0.03, latencyP50: 45.2, latencyP99: 180.5, activeConnections: 128 },
    dependencies: ['device-service', 'data-pipeline', 'infra-service']
  },
  {
    id: 'data-pipeline', name: 'Data Pipeline', description: '数据管道与流处理引擎',
    status: 'degraded', version: 'v1.2.1', replicas: { ready: 2, total: 3 }, uptime: '14d 6h 30m',
    endpoints: { grpc: ':50053', http: ':3003', metrics: ':9093/metrics' },
    resources: { cpu: 65, memory: 71, disk: 58 },
    metrics: { requestRate: 32000, errorRate: 0.15, latencyP50: 8.5, latencyP99: 42.1, activeConnections: 512 },
    dependencies: ['infra-service']
  },
  {
    id: 'knowledge-service', name: 'Knowledge Service', description: '知识图谱与向量检索',
    status: 'healthy', version: 'v1.0.8', replicas: { ready: 2, total: 2 }, uptime: '10d 3h 45m',
    endpoints: { grpc: ':50054', http: ':3004', metrics: ':9094/metrics' },
    resources: { cpu: 42, memory: 68, disk: 45 },
    metrics: { requestRate: 2100, errorRate: 0.01, latencyP50: 12.3, latencyP99: 65.8, activeConnections: 86 },
    dependencies: ['infra-service']
  },
  {
    id: 'monitoring-service', name: 'Monitoring Service', description: '监控告警与 SLO 管理',
    status: 'healthy', version: 'v1.1.0', replicas: { ready: 2, total: 2 }, uptime: '14d 6h 30m',
    endpoints: { grpc: ':50055', http: ':3005', metrics: ':9095/metrics' },
    resources: { cpu: 28, memory: 35, disk: 20 },
    metrics: { requestRate: 4500, errorRate: 0.005, latencyP50: 2.1, latencyP99: 10.2, activeConnections: 156 },
    dependencies: ['infra-service']
  },
  {
    id: 'infra-service', name: 'Infra Service', description: '基础设施（Kafka/Redis/DB/Saga/Outbox）',
    status: 'healthy', version: 'v1.2.0', replicas: { ready: 2, total: 2 }, uptime: '14d 6h 32m',
    endpoints: { grpc: ':50056', http: ':3006', metrics: ':9096/metrics' },
    resources: { cpu: 52, memory: 60, disk: 30 },
    metrics: { requestRate: 18500, errorRate: 0.008, latencyP50: 1.8, latencyP99: 8.5, activeConnections: 1024 },
    dependencies: []
  }
];

const CIRCUIT_BREAKERS: CircuitBreakerState[] = [
  { serviceId: 'api-gateway', serviceName: 'API Gateway', targetService: 'MySQL', state: 'closed', failureCount: 0, successCount: 15823, failureThreshold: 5, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 30000, metrics: { totalRequests: 15823, failedRequests: 2, successRate: 99.99, avgResponseTime: 3.2 } },
  { serviceId: 'api-gateway', serviceName: 'API Gateway', targetService: 'Redis', state: 'closed', failureCount: 0, successCount: 45210, failureThreshold: 5, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 5000, metrics: { totalRequests: 45210, failedRequests: 0, successRate: 100, avgResponseTime: 0.8 } },
  { serviceId: 'algorithm-service', serviceName: 'Algorithm Service', targetService: 'Ollama (LLM)', state: 'half-open', failureCount: 3, successCount: 1205, failureThreshold: 3, lastFailure: '2026-02-16T00:05:12Z', lastStateChange: '2026-02-16T00:05:42Z', timeout: 60000, metrics: { totalRequests: 1520, failedRequests: 315, successRate: 79.3, avgResponseTime: 2850 } },
  { serviceId: 'data-pipeline', serviceName: 'Data Pipeline', targetService: 'Kafka', state: 'closed', failureCount: 1, successCount: 89200, failureThreshold: 5, lastFailure: '2026-02-15T22:10:05Z', lastStateChange: '2026-02-15T10:30:00Z', timeout: 15000, metrics: { totalRequests: 89500, failedRequests: 300, successRate: 99.66, avgResponseTime: 5.2 } },
  { serviceId: 'data-pipeline', serviceName: 'Data Pipeline', targetService: 'ClickHouse', state: 'open', failureCount: 5, successCount: 3200, failureThreshold: 5, lastFailure: '2026-02-16T00:08:30Z', lastStateChange: '2026-02-16T00:08:30Z', timeout: 30000, metrics: { totalRequests: 3850, failedRequests: 650, successRate: 83.1, avgResponseTime: 12500 } },
  { serviceId: 'knowledge-service', serviceName: 'Knowledge Service', targetService: 'Qdrant', state: 'closed', failureCount: 0, successCount: 5600, failureThreshold: 3, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 10000, metrics: { totalRequests: 5600, failedRequests: 8, successRate: 99.86, avgResponseTime: 15.3 } },
  { serviceId: 'knowledge-service', serviceName: 'Knowledge Service', targetService: 'Neo4j', state: 'closed', failureCount: 0, successCount: 3400, failureThreshold: 3, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 15000, metrics: { totalRequests: 3400, failedRequests: 5, successRate: 99.85, avgResponseTime: 22.1 } },
  { serviceId: 'monitoring-service', serviceName: 'Monitoring Service', targetService: 'Jaeger', state: 'closed', failureCount: 0, successCount: 12000, failureThreshold: 5, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 10000, metrics: { totalRequests: 12000, failedRequests: 3, successRate: 99.98, avgResponseTime: 4.5 } },
  { serviceId: 'infra-service', serviceName: 'Infra Service', targetService: 'MinIO', state: 'closed', failureCount: 0, successCount: 2800, failureThreshold: 5, lastFailure: null, lastStateChange: '2026-02-15T10:30:00Z', timeout: 20000, metrics: { totalRequests: 2800, failedRequests: 1, successRate: 99.96, avgResponseTime: 35.2 } }
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 状态配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const serviceStatusConfig: Record<string, { label: string; color: string; textColor: string; badgeVariant: 'success' | 'warning' | 'danger' | 'info' }> = {
  healthy:   { label: '健康',   color: 'bg-emerald-500', textColor: 'text-emerald-400', badgeVariant: 'success' },
  degraded:  { label: '降级',   color: 'bg-amber-500',   textColor: 'text-amber-400',   badgeVariant: 'warning' },
  unhealthy: { label: '异常',   color: 'bg-red-500',     textColor: 'text-red-400',     badgeVariant: 'danger' },
  starting:  { label: '启动中', color: 'bg-blue-500',    textColor: 'text-blue-400',    badgeVariant: 'info' }
};

const cbStateConfig: Record<string, { label: string; color: string; textColor: string; desc: string }> = {
  closed:      { label: '闭合', color: 'bg-emerald-500/20 border-emerald-500/50', textColor: 'text-emerald-400', desc: '正常通行' },
  open:        { label: '断开', color: 'bg-red-500/20 border-red-500/50',         textColor: 'text-red-400',     desc: '请求被拒绝' },
  'half-open': { label: '半开', color: 'bg-amber-500/20 border-amber-500/50',     textColor: 'text-amber-400',   desc: '探测恢复中' }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}
function formatLatency(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms.toFixed(1) + 'ms';
}
function getTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 1: 服务总览
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ServicesOverviewTab({ services }: { services: MicroService[] }) {
  const totalReplicas = services.reduce((a, s) => a + s.replicas.total, 0);
  const readyReplicas = services.reduce((a, s) => a + s.replicas.ready, 0);
  const totalRPS = services.reduce((a, s) => a + s.metrics.requestRate, 0);
  const avgErrorRate = services.reduce((a, s) => a + s.metrics.errorRate, 0) / services.length;
  const healthyCount = services.filter(s => s.status === 'healthy').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={`${healthyCount}/${services.length}`} label="服务健康" icon="🟢" compact />
        <StatCard value={`${readyReplicas}/${totalReplicas}`} label="实例就绪" icon="📦" compact />
        <StatCard value={formatNumber(totalRPS)} label="总请求/秒" icon="⚡" compact />
        <StatCard value={`${avgErrorRate.toFixed(2)}%`} label="平均错误率" icon="🔴" compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {services.map(service => {
          const statusCfg = serviceStatusConfig[service.status];
          return (
            <PageCard key={service.id} compact>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', statusCfg.color)} />
                    <div>
                      <h3 className="text-sm font-semibold">{service.name}</h3>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{service.version}</span>
                    <Badge variant={statusCfg.badgeVariant}>{statusCfg.label}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" />请求/秒</div>
                    <div className="font-mono font-medium">{formatNumber(service.metrics.requestRate)}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" />P99延迟</div>
                    <div className="font-mono font-medium">{formatLatency(service.metrics.latencyP99)}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" />错误率</div>
                    <div className={cn('font-mono font-medium', service.metrics.errorRate > 0.1 ? 'text-red-400' : 'text-emerald-400')}>
                      {service.metrics.errorRate}%
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground flex items-center gap-1"><Box className="w-3 h-3" />实例</div>
                    <div className="font-mono font-medium">{service.replicas.ready}/{service.replicas.total}</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Cpu className="w-3 h-3 text-muted-foreground" />
                    <span className="w-8 text-muted-foreground">CPU</span>
                    <Progress value={service.resources.cpu} className="flex-1 h-1.5" />
                    <span className="w-8 text-right font-mono text-muted-foreground">{service.resources.cpu}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <MemoryStick className="w-3 h-3 text-muted-foreground" />
                    <span className="w-8 text-muted-foreground">内存</span>
                    <Progress value={service.resources.memory} className="flex-1 h-1.5" />
                    <span className="w-8 text-right font-mono text-muted-foreground">{service.resources.memory}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <span>运行 {service.uptime}</span>
                  <span>{service.metrics.activeConnections} 活跃连接</span>
                </div>
              </div>
            </PageCard>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 2: 服务拓扑图 — HTML div 绝对定位 + SVG 连线混合方案（解决 SVG 交互兼容性问题）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ServiceTopologyTab({ services }: { services: MicroService[] }) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // 使用百分比定位，让节点在容器内自适应
  const nodeLayout: Record<string, { left: string; top: string }> = useMemo(() => ({
    'api-gateway':        { left: '50%', top: '8%' },
    'monitoring-service':  { left: '20%', top: '28%' },
    'device-service':     { left: '80%', top: '28%' },
    'knowledge-service':  { left: '20%', top: '55%' },
    'algorithm-service':  { left: '80%', top: '55%' },
    'data-pipeline':      { left: '60%', top: '72%' },
    'infra-service':      { left: '50%', top: '90%' },
  }), []);

  const edges = useMemo(() => {
    const result: { from: string; to: string; status: 'active' | 'degraded' }[] = [];
    services.forEach(s => {
      s.dependencies.forEach(dep => {
        const depSvc = services.find(d => d.id === dep);
        result.push({ from: s.id, to: dep, status: depSvc?.status === 'degraded' || s.status === 'degraded' ? 'degraded' : 'active' });
      });
    });
    return result;
  }, [services]);

  const emojis: Record<string, string> = {
    'api-gateway': '🌐', 'device-service': '🔧', 'algorithm-service': '🧮',
    'data-pipeline': '🔄', 'knowledge-service': '📚', 'monitoring-service': '📡', 'infra-service': '🏗️'
  };

  const pctVal = (s: string) => parseFloat(s);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />健康</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />降级</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />异常</span>
        <span className="flex items-center gap-1">
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
          依赖关系
        </span>
      </div>

      {/* 拓扑容器：HTML 节点 + SVG 连线 */}
      <div
        className="relative rounded-lg border border-border/50"
        style={{
          height: 560,
          background: 'repeating-conic-gradient(oklch(0.18 0 0) 0% 25%, oklch(0.16 0 0) 0% 50%) 0 0 / 30px 30px',
        }}
        onClick={() => setSelectedNode(null)}
      >
        {/* SVG 连线层 — 仅绘制线条，不处理交互 */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none', zIndex: 1 }}
        >
          <defs>
            <marker id="arr-n" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.5 0.08 240 / 0.6)" />
            </marker>
            <marker id="arr-d" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.65 0.12 60 / 0.6)" />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const fp = nodeLayout[edge.from], tp = nodeLayout[edge.to];
            if (!fp || !tp) return null;
            const x1 = pctVal(fp.left), y1 = pctVal(fp.top);
            const x2 = pctVal(tp.left), y2 = pctVal(tp.top);
            const hl = hoveredNode === edge.from || hoveredNode === edge.to;
            const deg = edge.status === 'degraded';
            return (
              <line key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={deg ? 'oklch(0.65 0.12 60 / 0.4)' : 'oklch(0.5 0.08 240 / 0.3)'}
                strokeWidth={hl ? 0.5 : 0.25}
                strokeDasharray={deg ? '1.2,0.8' : '0.8,0.6'}
                markerEnd={deg ? 'url(#arr-d)' : 'url(#arr-n)'}
                opacity={hoveredNode && !hl ? 0.15 : 1}
                style={{ transition: 'all 0.3s' }}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* HTML 节点层 — 标准 button 元素，交互完全可靠 */}
        {services.map(svc => {
          const pos = nodeLayout[svc.id];
          if (!pos) return null;
          const hov = hoveredNode === svc.id;
          const sel = selectedNode === svc.id;
          const deg = svc.status === 'degraded';
          const dotColor = deg ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <button
              key={svc.id}
              type="button"
              className={cn(
                'absolute flex flex-col items-center gap-0.5 cursor-pointer',
                'transition-all duration-300 ease-out outline-none',
                hoveredNode && !hov ? 'opacity-30' : 'opacity-100'
              )}
              style={{
                left: pos.left,
                top: pos.top,
                transform: 'translate(-50%, -50%)',
                zIndex: sel ? 20 : hov ? 15 : 10,
              }}
              onMouseEnter={() => setHoveredNode(svc.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={(e) => { e.stopPropagation(); setSelectedNode(sel ? null : svc.id); }}
            >
              {/* 节点圆形 */}
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center text-2xl',
                  'border-2 transition-all duration-300',
                  deg ? 'border-amber-500/60' : 'border-emerald-500/60',
                  (hov || sel) && (deg ? 'shadow-lg shadow-amber-500/30 scale-110' : 'shadow-lg shadow-emerald-500/30 scale-110'),
                  deg
                    ? 'bg-gradient-to-br from-amber-950/80 to-amber-900/40'
                    : 'bg-gradient-to-br from-emerald-950/80 to-emerald-900/40'
                )}
              >
                {emojis[svc.id] || '📦'}
              </div>
              {/* 服务名 */}
              <span className="text-[11px] font-medium text-foreground/90 whitespace-nowrap mt-0.5">
                {svc.name}
              </span>
              {/* 请求率 */}
              <span className="text-[9px] font-mono text-muted-foreground">
                {formatNumber(svc.metrics.requestRate)} req/s
              </span>
              {/* 副本指示点 */}
              <div className="flex gap-1 mt-0.5">
                {Array.from({ length: svc.replicas.total }).map((_, ri) => (
                  <span
                    key={ri}
                    className={cn('w-1.5 h-1.5 rounded-full', ri < svc.replicas.ready ? dotColor : 'bg-muted-foreground/30')}
                  />
                ))}
              </div>
            </button>
          );
        })}

        {/* 选中节点的详情面板 */}
        {selectedNode && (() => {
          const s = services.find(sv => sv.id === selectedNode);
          if (!s) return null;
          const cfg = serviceStatusConfig[s.status];
          return (
            <div
              className="absolute top-3 right-3 w-64 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-xl"
              style={{ zIndex: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">{s.name}</h4>
                <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">版本</span><div className="font-mono">{s.version}</div></div>
                  <div><span className="text-muted-foreground">运行时间</span><div className="font-mono">{s.uptime}</div></div>
                  <div><span className="text-muted-foreground">请求/秒</span><div className="font-mono">{formatNumber(s.metrics.requestRate)}</div></div>
                  <div><span className="text-muted-foreground">P99 延迟</span><div className="font-mono">{formatLatency(s.metrics.latencyP99)}</div></div>
                  <div><span className="text-muted-foreground">错误率</span><div className={cn('font-mono', s.metrics.errorRate > 0.1 ? 'text-red-400' : 'text-emerald-400')}>{s.metrics.errorRate}%</div></div>
                  <div><span className="text-muted-foreground">连接数</span><div className="font-mono">{s.metrics.activeConnections}</div></div>
                </div>
                <div className="pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">gRPC</span> <span className="font-mono">{s.endpoints.grpc}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">依赖</span> <span className="font-mono">{s.dependencies.length > 0 ? s.dependencies.join(', ') : '无'}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 3: 断路器状态
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CircuitBreakerTab({ breakers }: { breakers: CircuitBreakerState[] }) {
  const closedCount = breakers.filter(b => b.state === 'closed').length;
  const openCount = breakers.filter(b => b.state === 'open').length;
  const halfOpenCount = breakers.filter(b => b.state === 'half-open').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <PageCard compact>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-400" /></div>
            <div><div className="text-xl font-bold">{closedCount}</div><div className="text-xs text-muted-foreground">闭合（正常）</div></div>
          </div>
        </PageCard>
        <PageCard compact>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-400" /></div>
            <div><div className="text-xl font-bold">{halfOpenCount}</div><div className="text-xs text-muted-foreground">半开（探测中）</div></div>
          </div>
        </PageCard>
        <PageCard compact>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center"><XCircle className="w-5 h-5 text-red-400" /></div>
            <div><div className="text-xl font-bold">{openCount}</div><div className="text-xs text-muted-foreground">断开（熔断）</div></div>
          </div>
        </PageCard>
      </div>

      <div className="space-y-2">
        {breakers.map((cb, i) => {
          const cfg = cbStateConfig[cb.state];
          const Icon = cb.state === 'closed' ? CheckCircle : cb.state === 'open' ? XCircle : AlertTriangle;
          return (
            <PageCard key={i} compact>
              <div className="flex items-center gap-4">
                <div className={cn('w-12 h-12 rounded-lg border flex flex-col items-center justify-center', cfg.color)}>
                  <Icon className={cn('w-4 h-4', cfg.textColor)} />
                  <span className={cn('text-[9px] mt-0.5 font-medium', cfg.textColor)}>{cfg.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{cb.serviceName}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-sm font-mono text-muted-foreground truncate">{cb.targetService}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>失败 {cb.failureCount}/{cb.failureThreshold}</span>
                    <span>成功率 {cb.metrics.successRate}%</span>
                    <span>平均 {formatLatency(cb.metrics.avgResponseTime)}</span>
                    {cb.lastFailure && <span className="text-red-400/70">最后失败 {getTimeAgo(cb.lastFailure)}</span>}
                  </div>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <div className="font-mono">{formatNumber(cb.metrics.totalRequests)} 请求</div>
                  <div className="text-muted-foreground">超时 {cb.timeout / 1000}s</div>
                </div>
              </div>
            </PageCard>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 4: Prometheus 指标
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PrometheusMetricsTab({ services }: { services: MicroService[] }) {
  const [selectedService, setSelectedService] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('1h');

  const metrics = useMemo<PrometheusMetric[]>(() => [
    { name: 'http_requests_total', type: 'counter', help: 'HTTP 请求总数', value: 1258300, labels: {}, history: [1200000, 1210000, 1225000, 1238000, 1245000, 1258300] },
    { name: 'http_request_duration_seconds', type: 'histogram', help: 'HTTP 请求延迟分布', value: 0.0152, labels: { quantile: '0.99' }, history: [0.018, 0.016, 0.015, 0.017, 0.014, 0.0152] },
    { name: 'process_cpu_seconds_total', type: 'counter', help: 'CPU 使用时间', value: 45230, labels: {}, history: [44800, 44900, 45000, 45080, 45150, 45230] },
    { name: 'process_resident_memory_bytes', type: 'gauge', help: '常驻内存', value: 524288000, labels: {}, history: [510e6, 515e6, 518e6, 520e6, 522e6, 524288000] },
    { name: 'grpc_server_handled_total', type: 'counter', help: 'gRPC 处理总数', value: 856200, labels: {}, history: [830000, 838000, 842000, 848000, 852000, 856200] },
    { name: 'circuit_breaker_state', type: 'gauge', help: '断路器状态 (0=closed, 1=open, 0.5=half-open)', value: 0, labels: {}, history: [0, 0, 0, 0, 0.5, 0] },
    { name: 'kafka_consumer_lag', type: 'gauge', help: 'Kafka 消费延迟', value: 1250, labels: { topic: 'sensor-data' }, history: [800, 950, 1100, 1300, 1200, 1250] },
    { name: 'db_pool_active_connections', type: 'gauge', help: '数据库活跃连接数', value: 18, labels: {}, history: [15, 16, 18, 20, 17, 18] },
    { name: 'saga_transactions_total', type: 'counter', help: 'Saga 事务总数', value: 3420, labels: {}, history: [3200, 3250, 3300, 3350, 3390, 3420] },
    { name: 'outbox_published_total', type: 'counter', help: 'Outbox 已发布消息数', value: 28500, labels: {}, history: [27000, 27300, 27800, 28000, 28300, 28500] },
  ], []);

  const typeColors: Record<string, string> = {
    counter: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    gauge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    histogram: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    summary: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedService} onValueChange={setSelectedService}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="选择服务" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部服务</SelectItem>
            {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5m">5 分钟</SelectItem>
            <SelectItem value="15m">15 分钟</SelectItem>
            <SelectItem value="1h">1 小时</SelectItem>
            <SelectItem value="6h">6 小时</SelectItem>
            <SelectItem value="24h">24 小时</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {metrics.map((metric, i) => {
          const tc = typeColors[metric.type] || typeColors.gauge;
          const sMax = Math.max(...metric.history), sMin = Math.min(...metric.history), sR = sMax - sMin || 1;
          const pts = metric.history.map((v, idx) => `${idx * 40},${30 - ((v - sMin) / sR) * 28}`).join(' ');
          return (
            <PageCard key={i} compact>
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-mono', tc)}>{metric.type}</span>
                      <h4 className="text-xs font-mono font-medium truncate">{metric.name}</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{metric.help}</p>
                  </div>
                  <div className="text-right ml-3">
                    <div className="text-sm font-mono font-bold">
                      {metric.type === 'histogram' ? metric.value.toFixed(4) : metric.value >= 1000000 ? formatNumber(metric.value) : metric.value.toLocaleString()}
                    </div>
                    {Object.keys(metric.labels).length > 0 && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(' ')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="h-8 w-full">
                  <svg width="100%" height="100%" viewBox="0 0 200 32" preserveAspectRatio="none">
                    <polyline points={pts} fill="none" stroke="oklch(0.7 0.12 240)" strokeWidth="1.5" strokeLinejoin="round" />
                    <polyline points={`0,32 ${pts} 200,32`} fill="oklch(0.7 0.12 240 / 0.08)" stroke="none" />
                  </svg>
                </div>
              </div>
            </PageCard>
          );
        })}
      </div>

      <PageCard compact>
        <div className="flex items-center gap-3 text-xs">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Prometheus 端点：</span>
          <code className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">/api/metrics</code>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">抓取间隔：15s</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">指标数：{metrics.length}</span>
        </div>
      </PageCard>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function MicroserviceDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLastRefresh(new Date());
    setTimeout(() => { setRefreshing(false); toast.success('数据已刷新'); }, 800);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => { setLastRefresh(new Date()); }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  return (
    <MainLayout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" />微服务监控
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">7 个微服务集群实时状态 · 断路器 · Prometheus 指标</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>自动刷新</span>
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />刷新
            </Button>
            <span className="text-[10px] text-muted-foreground">{lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="overview" className="text-xs gap-1"><Server className="w-3.5 h-3.5" />服务总览</TabsTrigger>
            <TabsTrigger value="topology" className="text-xs gap-1"><GitBranch className="w-3.5 h-3.5" />服务拓扑</TabsTrigger>
            <TabsTrigger value="circuit-breaker" className="text-xs gap-1"><Shield className="w-3.5 h-3.5" />断路器</TabsTrigger>
            <TabsTrigger value="prometheus" className="text-xs gap-1"><BarChart3 className="w-3.5 h-3.5" />指标</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-3"><ServicesOverviewTab services={SERVICES} /></TabsContent>
          <TabsContent value="topology" className="mt-3"><ServiceTopologyTab services={SERVICES} /></TabsContent>
          <TabsContent value="circuit-breaker" className="mt-3"><CircuitBreakerTab breakers={CIRCUIT_BREAKERS} /></TabsContent>
          <TabsContent value="prometheus" className="mt-3"><PrometheusMetricsTab services={SERVICES} /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
