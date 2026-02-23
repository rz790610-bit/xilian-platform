/**
 * ============================================================================
 * 可观测性 — 独立页面
 * ============================================================================
 * 展示认知推理引擎的 OTel 指标、延迟分布、错误率、资源使用
 * 后端路由: evoCognition.getDashboardMetrics / .getTopologyStatus
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================================================
// OTel 指标定义（与后端 OTelMetricsPanel 对齐）
// ============================================================================
const COGNITION_METRICS = [
  { name: 'cognition.reasoning.latency', label: '推理延迟', type: 'histogram', unit: 'ms', module: 'ReasoningEngine' },
  { name: 'cognition.reasoning.total', label: '推理总次数', type: 'counter', unit: '次', module: 'ReasoningEngine' },
  { name: 'cognition.reasoning.errors', label: '推理错误数', type: 'counter', unit: '次', module: 'ReasoningEngine' },
  { name: 'cognition.causal.nodes', label: '因果图节点数', type: 'gauge', unit: '个', module: 'CausalGraph' },
  { name: 'cognition.causal.edges', label: '因果图边数', type: 'gauge', unit: '条', module: 'CausalGraph' },
  { name: 'cognition.experience.entries', label: '经验池条目', type: 'gauge', unit: '条', module: 'ExperiencePool' },
  { name: 'cognition.experience.hit_rate', label: '经验命中率', type: 'gauge', unit: '%', module: 'ExperiencePool' },
  { name: 'cognition.physics.validations', label: '物理验证次数', type: 'counter', unit: '次', module: 'PhysicsVerifier' },
  { name: 'cognition.physics.violations', label: '物理违规次数', type: 'counter', unit: '次', module: 'PhysicsVerifier' },
  { name: 'cognition.orchestrator.routing', label: '路由决策次数', type: 'counter', unit: '次', module: 'Orchestrator' },
  { name: 'cognition.feedback.events', label: '反馈事件数', type: 'counter', unit: '条', module: 'FeedbackLoop' },
  { name: 'cognition.feedback.revisions', label: '知识修订数', type: 'counter', unit: '条', module: 'FeedbackLoop' },
] as const;

const MODULE_GROUPS = ['ReasoningEngine', 'CausalGraph', 'ExperiencePool', 'PhysicsVerifier', 'Orchestrator', 'FeedbackLoop'] as const;

export function ObservabilityContent() {
  const [activeTab, setActiveTab] = useState('metrics');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const dashboardQuery = trpc.evoCognition.getDashboardMetrics.useQuery(undefined, {
    refetchInterval: 10000, retry: 2
  });
  const topologyQuery = trpc.evoCognition.getTopologyStatus.useQuery(undefined, {
    refetchInterval: 15000, retry: 2
  });

  const dashboard = dashboardQuery.data as any;
  const topology = topologyQuery.data as any;

  const filteredMetrics = moduleFilter === 'all'
    ? COGNITION_METRICS
    : COGNITION_METRICS.filter(m => m.module === moduleFilter);

  return (
    <div className="space-y-3">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          value={dashboard?.totalSessions ?? 0}
          label="推理会话总数"
          icon="🔗"
        />
        <StatCard
          value={dashboard?.avgConfidence ? `${(dashboard.avgConfidence * 100).toFixed(1)}%` : '—'}
          label="平均置信度"
          icon="🎯"
        />
        <StatCard
          value={dashboard?.avgLatency ? `${dashboard.avgLatency}ms` : '—'}
          label="平均延迟"
          icon="⏱️"
        />
        <StatCard
          value={dashboard?.errorRate ? `${(dashboard.errorRate * 100).toFixed(1)}%` : '0%'}
          label="错误率"
          icon="⚠️"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="metrics" className="text-xs">指标面板</TabsTrigger>
          <TabsTrigger value="modules" className="text-xs">模块健康</TabsTrigger>
          <TabsTrigger value="traces" className="text-xs">追踪日志</TabsTrigger>
        </TabsList>

        {/* 指标面板 */}
        <TabsContent value="metrics">
          <PageCard title="OTel 指标" icon="📊">
            <div className="flex items-center gap-2 mb-2">
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="h-7 text-xs bg-background border border-border rounded px-2"
              >
                <option value="all">全部模块</option>
                {MODULE_GROUPS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground ml-auto">
                共 {filteredMetrics.length} 个指标
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {filteredMetrics.map(metric => (
                <div key={metric.name} className="p-2 rounded bg-muted/30 border border-border/30">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-medium">{metric.label}</span>
                    <Badge variant="outline" className="text-[9px]">{metric.type}</Badge>
                  </div>
                  <div className="text-sm font-semibold font-mono">—</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9px] text-muted-foreground">{metric.module}</span>
                    <span className="text-[9px] text-muted-foreground">{metric.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </PageCard>
        </TabsContent>

        {/* 模块健康 */}
        <TabsContent value="modules">
          <PageCard title="模块健康状态" icon="💚">
            <div className="space-y-1.5">
              {MODULE_GROUPS.map(mod => {
                const modMetrics = COGNITION_METRICS.filter(m => m.module === mod);
                return (
                  <div key={mod} className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{mod}</span>
                      <Badge variant="default" className="text-[10px]">正常</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {modMetrics.map(m => (
                        <span key={m.name} className="text-[9px] px-1.5 py-0.5 rounded bg-background/50 text-muted-foreground">
                          {m.label}: —
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </PageCard>
        </TabsContent>

        {/* 追踪日志 */}
        <TabsContent value="traces">
          <PageCard title="推理追踪日志" icon="📝">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">时间</TableHead>
                    <TableHead className="text-[10px]">Trace ID</TableHead>
                    <TableHead className="text-[10px]">模块</TableHead>
                    <TableHead className="text-[10px]">操作</TableHead>
                    <TableHead className="text-[10px]">延迟</TableHead>
                    <TableHead className="text-[10px]">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[10px] text-muted-foreground py-4">
                      推理追踪日志通过认知会话触发后自动记录
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ScrollArea>
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ObservabilityPage() {
  return (
    <MainLayout title="可观测性" subtitle="认知推理引擎运行时指标与追踪">
      <ObservabilityContent />
    </MainLayout>
  );
}
