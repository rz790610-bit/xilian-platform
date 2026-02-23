/**
 * ============================================================================
 * 混合编排器 — 独立页面
 * ============================================================================
 * 展示 HybridOrchestrator 的路由策略、成本门控、并发控制、执行统计
 * 后端路由: evoCognition.getTopologyStatus / .listReasoningChains
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
// 路由策略配置（与后端 HybridOrchestrator 对齐）
// ============================================================================
const ROUTING_STRATEGIES = [
  { id: 'rule_first', label: '规则优先', description: '先执行规则引擎，置信度不足时回退到 LLM', icon: '📋' },
  { id: 'llm_first', label: 'LLM 优先', description: '先使用 LLM 推理，规则引擎做验证', icon: '🤖' },
  { id: 'parallel', label: '并行执行', description: '规则引擎和 LLM 并行，融合结果', icon: '⚡' },
  { id: 'cost_aware', label: '成本感知', description: '根据成本预算动态选择路由', icon: '💰' },
  { id: 'adaptive', label: '自适应', description: '根据历史表现自动调整路由权重', icon: '🎯' },
];

const EXECUTOR_TYPES = [
  { type: 'rule_engine', label: '规则引擎', color: 'bg-blue-500/15 text-blue-400' },
  { type: 'llm_grok', label: 'Grok LLM', color: 'bg-purple-500/15 text-purple-400' },
  { type: 'physics', label: '物理验证', color: 'bg-emerald-500/15 text-emerald-400' },
  { type: 'causal', label: '因果推理', color: 'bg-orange-500/15 text-orange-400' },
  { type: 'experience', label: '经验匹配', color: 'bg-yellow-500/15 text-yellow-400' },
];

export function OrchestratorContent() {
  const [activeTab, setActiveTab] = useState('overview');

  const topologyQuery = trpc.evoCognition.getTopologyStatus.useQuery(undefined, {
    refetchInterval: 15000, retry: 2
  });
  const chainsQuery = trpc.evoCognition.listReasoningChains.useQuery(
    { limit: 20 },
    { refetchInterval: 15000, retry: 2 }
  );

  const topology = topologyQuery.data as any;
  const chains = (chainsQuery.data as any[]) ?? [];

  return (
    <div className="space-y-3">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard value={topology?.activeExecutors ?? 5} label="活跃执行器" icon="⚡" />
        <StatCard value={chains.length} label="推理链路" icon="🔗" />
        <StatCard
          value={topology?.avgLatency ? `${topology.avgLatency}ms` : '—'}
          label="平均延迟"
          icon="⏱️"
        />
        <StatCard
          value={topology?.routingStrategy ?? 'adaptive'}
          label="当前策略"
          icon="🎯"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="overview" className="text-xs">编排总览</TabsTrigger>
          <TabsTrigger value="strategies" className="text-xs">路由策略</TabsTrigger>
          <TabsTrigger value="executors" className="text-xs">执行器</TabsTrigger>
          <TabsTrigger value="chains" className="text-xs">推理链路</TabsTrigger>
        </TabsList>

        {/* 编排总览 */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <PageCard title="编排拓扑" icon="🎼">
              <div className="space-y-2">
                <div className="p-2 rounded bg-muted/30 border border-border/30">
                  <div className="text-[10px] text-muted-foreground mb-1">执行流程</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge className="text-[10px] bg-primary/20 text-primary">输入</Badge>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Badge className="text-[10px] bg-blue-500/20 text-blue-400">路由决策</Badge>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Badge className="text-[10px] bg-purple-500/20 text-purple-400">执行器组</Badge>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400">结果融合</Badge>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Badge className="text-[10px] bg-orange-500/20 text-orange-400">物理验证</Badge>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400">输出</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-1.5 rounded bg-muted/20 border border-border/20">
                    <div className="text-[10px] text-muted-foreground">并发上限</div>
                    <div className="text-xs font-semibold font-mono">{topology?.maxConcurrency ?? 10}</div>
                  </div>
                  <div className="p-1.5 rounded bg-muted/20 border border-border/20">
                    <div className="text-[10px] text-muted-foreground">超时阈值</div>
                    <div className="text-xs font-semibold font-mono">{topology?.timeoutMs ?? 30000}ms</div>
                  </div>
                  <div className="p-1.5 rounded bg-muted/20 border border-border/20">
                    <div className="text-[10px] text-muted-foreground">成本预算</div>
                    <div className="text-xs font-semibold font-mono">{topology?.costBudget ?? '无限制'}</div>
                  </div>
                  <div className="p-1.5 rounded bg-muted/20 border border-border/20">
                    <div className="text-[10px] text-muted-foreground">熔断状态</div>
                    <Badge variant={topology?.circuitOpen ? 'destructive' : 'default'} className="text-[10px]">
                      {topology?.circuitOpen ? '已熔断' : '正常'}
                    </Badge>
                  </div>
                </div>
              </div>
            </PageCard>

            <PageCard title="执行器状态" icon="⚡">
              <div className="space-y-1.5">
                {EXECUTOR_TYPES.map(exec => (
                  <div key={exec.type} className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/20">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${exec.color}`}>
                        {exec.label}
                      </span>
                    </div>
                    <Badge variant="default" className="text-[10px]">在线</Badge>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 路由策略 */}
        <TabsContent value="strategies">
          <PageCard title="路由策略配置" icon="🎯">
            <div className="space-y-1.5">
              {ROUTING_STRATEGIES.map(strategy => (
                <div
                  key={strategy.id}
                  className={`p-2 rounded border transition-all ${
                    (topology?.routingStrategy ?? 'adaptive') === strategy.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border/30 bg-muted/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{strategy.icon}</span>
                      <span className="text-xs font-medium">{strategy.label}</span>
                      {(topology?.routingStrategy ?? 'adaptive') === strategy.id && (
                        <Badge variant="default" className="text-[10px]">当前</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">{strategy.description}</p>
                </div>
              ))}
            </div>
          </PageCard>
        </TabsContent>

        {/* 执行器 */}
        <TabsContent value="executors">
          <PageCard title="执行器详情" icon="⚙️">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {EXECUTOR_TYPES.map(exec => (
                <div key={exec.type} className="p-2 rounded bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${exec.color}`}>
                      {exec.label}
                    </span>
                    <Badge variant="default" className="text-[10px] ml-auto">在线</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div className="p-1 rounded bg-background/50">
                      <span className="text-muted-foreground">调用次数: </span>
                      <span className="font-mono">—</span>
                    </div>
                    <div className="p-1 rounded bg-background/50">
                      <span className="text-muted-foreground">平均延迟: </span>
                      <span className="font-mono">—</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PageCard>
        </TabsContent>

        {/* 推理链路 */}
        <TabsContent value="chains">
          <PageCard title="最近推理链路" icon="🔗">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">时间</TableHead>
                    <TableHead className="text-[10px]">会话 ID</TableHead>
                    <TableHead className="text-[10px]">策略</TableHead>
                    <TableHead className="text-[10px]">执行器</TableHead>
                    <TableHead className="text-[10px]">延迟</TableHead>
                    <TableHead className="text-[10px]">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chains.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[10px] text-muted-foreground py-4">
                        暂无推理链路数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    chains.map((chain: any, idx: number) => (
                      <TableRow key={chain.id ?? idx}>
                        <TableCell className="text-[10px] font-mono">
                          {chain.createdAt ? new Date(chain.createdAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">{chain.sessionId ?? '—'}</TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant="outline" className="text-[10px]">{chain.strategy ?? '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex flex-wrap gap-0.5">
                            {(chain.executors ?? []).map((e: string) => (
                              <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">{chain.latencyMs ?? '—'}ms</TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant={chain.success ? 'default' : 'destructive'} className="text-[10px]">
                            {chain.success ? '成功' : '失败'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function OrchestratorPage() {
  return (
    <MainLayout title="混合编排器" subtitle="多引擎路由策略与执行编排">
      <OrchestratorContent />
    </MainLayout>
  );
}
