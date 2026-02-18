/**
 * ============================================================================
 * v3.1 平台诊断代理 — 前端 UI
 * ============================================================================
 * 
 * 位置: 状态监控 → 平台诊断
 * 功能:
 *   1. 平台健康总览（模块完整度、桩函数、Feature Flags、数据流）
 *   2. 交互式诊断（支持 Grok / 本地规则引擎双模式）
 *   3. 模块注册表浏览（28 模块 Manifest）
 *   4. 桩函数热点分析
 *   5. Feature Flag 管理
 *   6. 数据流 & 依赖图谱
 * 
 * tRPC 端点:
 *   - platformHealth.overview
 *   - platformHealth.diagnose
 *   - platformHealth.agentStatus
 *   - platformHealth.listModules
 *   - platformHealth.completenessReport
 *   - platformHealth.stubStats
 *   - platformHealth.featureFlags
 *   - platformHealth.setModuleEnabled
 *   - platformHealth.dataFlowSummary
 *   - platformHealth.dependencyGraph
 */
import { useState, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  BarChart3, Bot, Brain,
  ChevronDown, ChevronRight,
  FileCode2, Flag, GitBranch, Layers,
  Loader2, MessageSquare, Network,
  RefreshCw, Search, Send, Sparkles,
  Terminal, ToggleLeft, TrendingUp, Zap,
} from 'lucide-react';

// ============ 预设诊断问题 ============
const PRESET_QUESTIONS = [
  { label: '全面诊断', question: '请对平台进行全面诊断，报告各模块完整度和优先修复建议。', icon: '🔍' },
  { label: '桩函数热点', question: '哪些桩函数被调用最频繁？需要优先实现哪些？', icon: '🔥' },
  { label: '基础设施健康', question: '检查所有基础设施组件（MySQL、Redis、Kafka等）的健康状态。', icon: '🏥' },
  { label: '模块依赖分析', question: '分析模块间的依赖关系，是否存在循环依赖或孤立模块？', icon: '🕸️' },
  { label: '功能开关审计', question: '当前哪些模块被禁用？禁用原因和影响是什么？', icon: '🚦' },
  { label: '数据流异常', question: '数据流中是否存在瓶颈或异常路径？', icon: '⚡' },
];

// ============ 完整度颜色映射 ============
function getCompletenessColor(pct: number): string {
  if (pct >= 80) return 'text-green-400';
  if (pct >= 60) return 'text-cyan-400';
  if (pct >= 40) return 'text-yellow-400';
  if (pct >= 20) return 'text-orange-400';
  return 'text-red-400';
}

function getCompletenessBg(pct: number): string {
  if (pct >= 80) return 'bg-green-500/20 border-green-500/30';
  if (pct >= 60) return 'bg-cyan-500/20 border-cyan-500/30';
  if (pct >= 40) return 'bg-yellow-500/20 border-yellow-500/30';
  if (pct >= 20) return 'bg-orange-500/20 border-orange-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

function getStatusBadge(mode: string) {
  if (mode === 'grok') {
    return <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">🤖 Grok API</Badge>;
  }
  return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">⚙️ 本地规则引擎</Badge>;
}

// ============ 主组件 ============
export default function PlatformDiagnostic() {
  const toast = useToast();

  // ---- 诊断交互状态 ----
  const [diagQuestion, setDiagQuestion] = useState('');
  const [diagHistory, setDiagHistory] = useState<Array<{
    question: string;
    answer: string;
    mode: string;
    toolCallCount: number;
    timestamp: Date;
  }>>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // ---- 模块搜索 ----
  const [moduleSearch, setModuleSearch] = useState('');
  // ---- 展开的域 ----
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  // ============ tRPC 查询 ============
  const overviewQuery = trpc.platformHealth.overview.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const agentStatusQuery = trpc.platformHealth.agentStatus.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const modulesQuery = trpc.platformHealth.listModules.useQuery();
  const completenessQuery = trpc.platformHealth.completenessReport.useQuery();
  const stubStatsQuery = trpc.platformHealth.stubStats.useQuery({ topN: 20 });
  const featureFlagsQuery = trpc.platformHealth.featureFlags.useQuery();
  const dataFlowQuery = trpc.platformHealth.dataFlowSummary.useQuery();
  const depGraphQuery = trpc.platformHealth.dependencyGraph.useQuery();

  // ============ tRPC Mutations ============
  const diagnoseMutation = trpc.platformHealth.diagnose.useMutation();
  const setModuleEnabledMutation = trpc.platformHealth.setModuleEnabled.useMutation();

  // ============ 诊断执行 ============
  const runDiagnosis = useCallback(async (question?: string) => {
    const q = question || diagQuestion || undefined;
    setIsDiagnosing(true);
    try {
      const result = await diagnoseMutation.mutateAsync({ question: q });
      setDiagHistory(prev => [{
        question: q || '全面诊断',
        answer: result.diagnosis,
        mode: result.mode,
        toolCallCount: result.toolCallCount,
        timestamp: result.timestamp,
      }, ...prev]);
      setDiagQuestion('');
      toast.success(`诊断完成 (${result.mode} 模式, ${result.toolCallCount} 次工具调用)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '诊断失败';
      toast.error(msg);
    } finally {
      setIsDiagnosing(false);
    }
  }, [diagQuestion, diagnoseMutation, toast]);

  // ============ 切换模块开关 ============
  const toggleModule = useCallback(async (moduleId: string, enabled: boolean) => {
    try {
      await setModuleEnabledMutation.mutateAsync({ moduleId, enabled });
      featureFlagsQuery.refetch();
      toast.success(`模块 ${moduleId} 已${enabled ? '启用' : '禁用'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast.error(msg);
    }
  }, [setModuleEnabledMutation, featureFlagsQuery, toast]);

  // ============ 过滤模块 ============
  const filteredModules = useMemo(() => {
    const modules = modulesQuery.data || [];
    if (!moduleSearch) return modules;
    const lower = moduleSearch.toLowerCase();
    return modules.filter((m) =>
      m.id.toLowerCase().includes(lower) ||
      m.label.toLowerCase().includes(lower) ||
      m.domain.toLowerCase().includes(lower)
    );
  }, [modulesQuery.data, moduleSearch]);

  // ============ 域展开/折叠 ============
  const toggleDomain = useCallback((domain: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  // ============ 数据提取 ============
  const overview = overviewQuery.data;
  const agentStatus = agentStatusQuery.data;
  const completenessReport = completenessQuery.data;
  const stubStats = stubStatsQuery.data;
  const featureFlags = featureFlagsQuery.data;
  const dataFlow = dataFlowQuery.data;
  const depGraph = depGraphQuery.data;

  return (
    <MainLayout title="平台诊断代理">
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* ━━━ 顶部状态栏 ━━━ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border border-purple-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">平台诊断代理</h1>
              <p className="text-xs text-muted-foreground">v3.1 L2 自省层 · 多模型诊断 · 实时健康监控</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {agentStatus && getStatusBadge(agentStatus.mode)}
            {agentStatus && (
              <Badge variant="outline" className="text-xs">
                模型: {agentStatus.model}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overviewQuery.refetch();
                modulesQuery.refetch();
                completenessQuery.refetch();
                stubStatsQuery.refetch();
                featureFlagsQuery.refetch();
                dataFlowQuery.refetch();
              }}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", overviewQuery.isFetching && "animate-spin")} />
              刷新
            </Button>
          </div>
        </div>

        {/* ━━━ 健康概览卡片 ━━━ */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            icon="📦"
            label="注册模块"
            value={overview?.modules?.total ?? '-'}
            compact
          />
          <StatCard
            icon="📊"
            label="总体完整度"
            value={overview?.modules?.overall?.percentage != null ? `${overview.modules.overall.percentage}%` : '-'}
            compact
          />
          <StatCard
            icon="🔧"
            label="桩函数数"
            value={overview?.stubs?.registered ?? '-'}
            compact
          />
          <StatCard
            icon="📞"
            label="桩调用次数"
            value={overview?.stubs?.totalCalls ?? '-'}
            compact
          />
          <StatCard
            icon="🚦"
            label="已启用模块"
            value={overview?.featureFlags?.enabled ?? '-'}
            compact
          />
          <StatCard
            icon="📡"
            label="数据流消息"
            value={dataFlow?.totalMessages ?? '-'}
            compact
          />
        </div>

        {/* ━━━ 主内容区 Tabs ━━━ */}
        <Tabs defaultValue="diagnose" className="flex-1">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="diagnose" className="gap-1.5">
              <Bot className="w-3.5 h-3.5" /> 智能诊断
            </TabsTrigger>
            <TabsTrigger value="modules" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" /> 模块注册表
            </TabsTrigger>
            <TabsTrigger value="stubs" className="gap-1.5">
              <FileCode2 className="w-3.5 h-3.5" /> 桩函数热点
            </TabsTrigger>
            <TabsTrigger value="flags" className="gap-1.5">
              <Flag className="w-3.5 h-3.5" /> 功能开关
            </TabsTrigger>
            <TabsTrigger value="dataflow" className="gap-1.5">
              <Network className="w-3.5 h-3.5" /> 依赖图谱
            </TabsTrigger>
          </TabsList>

          {/* ━━━ Tab 1: 智能诊断 ━━━ */}
          <TabsContent value="diagnose" className="mt-3 space-y-3">
            {/* 预设问题 */}
            <PageCard title="快速诊断" icon={<Sparkles className="w-4 h-4 text-purple-400" />}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {PRESET_QUESTIONS.map((pq, i) => (
                  <button
                    key={i}
                    onClick={() => runDiagnosis(pq.question)}
                    disabled={isDiagnosing}
                    className={cn(
                      "text-left p-2.5 rounded-lg border border-border/50 bg-card/50",
                      "hover:bg-primary/10 hover:border-primary/30 transition-all duration-200",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{pq.icon}</span>
                      <span className="text-sm font-medium text-foreground">{pq.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pq.question}</p>
                  </button>
                ))}
              </div>
            </PageCard>

            {/* 自定义诊断输入 */}
            <PageCard title="自定义诊断" icon={<MessageSquare className="w-4 h-4 text-cyan-400" />}>
              <div className="flex gap-2 mt-2">
                <Textarea
                  placeholder="输入诊断问题，例如：检查 M05 数据管理模块的完整度和依赖关系..."
                  value={diagQuestion}
                  onChange={(e) => setDiagQuestion(e.target.value)}
                  className="flex-1 min-h-[60px] max-h-[120px] bg-background/50 border-border/50 text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      runDiagnosis();
                    }
                  }}
                />
                <Button
                  onClick={() => runDiagnosis()}
                  disabled={isDiagnosing || !diagQuestion.trim()}
                  className="self-end"
                >
                  {isDiagnosing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {isDiagnosing && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>正在执行诊断，Agent 可能调用多个工具...</span>
                </div>
              )}
            </PageCard>

            {/* 诊断历史 */}
            {diagHistory.length > 0 && (
              <PageCard title="诊断结果" icon={<Terminal className="w-4 h-4 text-green-400" />}>
                <ScrollArea className="max-h-[500px] mt-2">
                  <div className="space-y-3">
                    {diagHistory.map((item, i) => (
                      <div key={i} className="border border-border/50 rounded-lg overflow-hidden">
                        {/* 问题头 */}
                        <div className="flex items-center justify-between px-3 py-2 bg-card/80 border-b border-border/30">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-sm font-medium text-foreground">{item.question}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(item.mode)}
                            <Badge variant="outline" className="text-xs">
                              {item.toolCallCount} 次工具调用
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        {/* 诊断内容 */}
                        <div className="p-3 bg-background/30">
                          <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed">
                            {item.answer}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PageCard>
            )}
          </TabsContent>

          {/* ━━━ Tab 2: 模块注册表 ━━━ */}
          <TabsContent value="modules" className="mt-3 space-y-3">
            {/* 搜索栏 */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索模块 ID、名称或域..."
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-background/50"
                />
              </div>
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                {filteredModules.length} / {modulesQuery.data?.length ?? 0} 模块
              </Badge>
            </div>

            {/* 按域分组的完整度报告 */}
            {completenessReport && (
              <PageCard
                title="域完整度报告"
                icon={<BarChart3 className="w-4 h-4 text-cyan-400" />}
                action={
                  <Badge variant="outline" className="text-xs">
                    总体: {completenessReport.overall?.percentage ?? 0}%
                  </Badge>
                }
              >
                <div className="space-y-2 mt-2">
                  {completenessReport.byDomain?.map((domain) => (
                    <div key={domain.domain} className="border border-border/30 rounded-lg overflow-hidden">
                      {/* 域头部 */}
                      <button
                        onClick={() => toggleDomain(domain.domain)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-card/50 hover:bg-card/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {expandedDomains.has(domain.domain) ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium text-foreground">{domain.domainLabel}</span>
                          <Badge variant="outline" className="text-xs">{domain.moduleCount} 模块</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-mono font-bold", getCompletenessColor(domain.avgCompleteness))}>
                            {domain.avgCompleteness}%
                          </span>
                          <div className="w-24">
                            <Progress value={domain.avgCompleteness} className="h-1.5" />
                          </div>
                        </div>
                      </button>

                      {/* 域内模块列表 */}
                      {expandedDomains.has(domain.domain) && (
                        <div className="border-t border-border/20">
                          {domain.modules?.map((mod) => (
                            <div
                              key={mod.id}
                              className="flex items-center justify-between px-4 py-1.5 hover:bg-card/30 transition-colors border-b border-border/10 last:border-b-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground w-12">{mod.id}</span>
                                <span className="text-sm text-foreground">{mod.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {mod.stubCount > 0 && (
                                  <span className="text-xs text-yellow-400">{mod.stubCount} 个桩函数</span>
                                )}
                                {mod.plannedCount > 0 && (
                                  <span className="text-xs text-blue-400">{mod.plannedCount} 个规划中</span>
                                )}
                                <span className={cn("text-xs font-mono font-bold w-10 text-right", getCompletenessColor(mod.completeness))}>
                                  {mod.completeness}%
                                </span>
                                <div className="w-16">
                                  <Progress value={mod.completeness} className="h-1" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </PageCard>
            )}

            {/* 模块列表（平铺） */}
            <PageCard
              title="模块 Manifest 列表"
              icon={<Layers className="w-4 h-4 text-purple-400" />}
              action={
                <Button variant="outline" size="sm" onClick={() => modulesQuery.refetch()}>
                  <RefreshCw className={cn("w-3 h-3 mr-1", modulesQuery.isFetching && "animate-spin")} />
                  刷新
                </Button>
              }
            >
              <ScrollArea className="max-h-[600px] mt-2">
                <div className="space-y-1">
                  {filteredModules.map((mod) => (
                    <div
                      key={mod.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-lg border transition-colors",
                        getCompletenessBg(mod.completeness ?? 0)
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{mod.id}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{mod.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {mod.domain} · v{mod.version} · {mod.capabilities?.length ?? 0} 个能力 · {mod.dependencies?.length ?? 0} 个依赖
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-sm font-mono font-bold", getCompletenessColor(mod.completeness ?? 0))}>
                          {mod.completeness ?? 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PageCard>
          </TabsContent>

          {/* ━━━ Tab 3: 桩函数热点 ━━━ */}
          <TabsContent value="stubs" className="mt-3 space-y-3">
            <PageCard
              title="桩函数调用热点 Top 20"
              icon={<TrendingUp className="w-4 h-4 text-orange-400" />}
              action={
                <Button variant="outline" size="sm" onClick={() => stubStatsQuery.refetch()}>
                  <RefreshCw className={cn("w-3 h-3 mr-1", stubStatsQuery.isFetching && "animate-spin")} />
                  刷新
                </Button>
              }
            >
              {stubStats && (
                <div className="mt-2">
                  {/* 统计概览 */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-card/50 border border-border/30 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-foreground">{stubStats.totalStubs}</div>
                      <div className="text-xs text-muted-foreground">注册桩函数</div>
                    </div>
                    <div className="bg-card/50 border border-border/30 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-orange-400">{stubStats.totalCalls}</div>
                      <div className="text-xs text-muted-foreground">总调用次数</div>
                    </div>
                    <div className="bg-card/50 border border-border/30 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-red-400">{stubStats.calledStubs}</div>
                      <div className="text-xs text-muted-foreground">已调用桩函数</div>
                    </div>
                  </div>

                  {/* 热点列表 */}
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-1">
                      {stubStats.topCalled?.map((stub, i) => {
                        const maxCalls = stubStats.topCalled?.[0]?.callCount || 1;
                        const barWidth = (stub.callCount / maxCalls) * 100;
                        return (
                          <div
                            key={i}
                            className="relative flex items-center justify-between px-3 py-2 rounded-lg border border-border/30 overflow-hidden"
                          >
                            {/* 热度条背景 */}
                            <div
                              className="absolute inset-y-0 left-0 bg-orange-500/10"
                              style={{ width: `${barWidth}%` }}
                            />
                            <div className="relative flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">#{i + 1}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-mono text-foreground truncate">{stub.functionName}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {stub.filePath}
                                </div>
                              </div>
                            </div>
                            <div className="relative flex items-center gap-2 shrink-0">
                              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                                {stub.callCount} 次调用
                              </Badge>
                              {stub.lastCalledAt && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(stub.lastCalledAt).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {(!stubStats.topCalled || stubStats.topCalled.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          暂无桩函数调用记录
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* 从未调用的桩函数 */}
                  {stubStats.neverCalledStubs > 0 && (
                    <div className="mt-3 border-t border-border/20 pt-3">
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                        从未调用的桩函数 ({stubStats.neverCalledStubs})
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {stubStats.all
                          .filter(s => s.callCount === 0)
                          .slice(0, 20)
                          .map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono">
                              {s.functionName}
                            </Badge>
                          ))}
                        {stubStats.neverCalledStubs > 20 && (
                          <Badge variant="outline" className="text-xs">
                            +{stubStats.neverCalledStubs - 20} 更多
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </PageCard>
          </TabsContent>

          {/* ━━━ Tab 4: 功能开关 ━━━ */}
          <TabsContent value="flags" className="mt-3 space-y-3">
            <PageCard
              title="模块功能开关"
              icon={<ToggleLeft className="w-4 h-4 text-green-400" />}
              action={
                <div className="flex items-center gap-2">
                  {featureFlags && (
                    <Badge variant="outline" className="text-xs">
                      {featureFlags.summary?.enabled ?? 0} 启用 / {featureFlags.summary?.total ?? 0} 总计
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={() => featureFlagsQuery.refetch()}>
                    <RefreshCw className={cn("w-3 h-3 mr-1", featureFlagsQuery.isFetching && "animate-spin")} />
                    刷新
                  </Button>
                </div>
              }
            >
              {featureFlags && (
                <ScrollArea className="max-h-[500px] mt-2">
                  <div className="space-y-1">
                    {featureFlags.flags?.map((flag) => (
                      <div
                        key={flag.moduleId}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg border transition-colors",
                          flag.enabled
                            ? "border-green-500/20 bg-green-500/5"
                            : "border-red-500/20 bg-red-500/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-20">{flag.moduleId}</span>
                          <span className="text-sm text-foreground">{flag.source}</span>
                          <span className="text-xs text-muted-foreground">
                            更新者: {flag.updatedBy} · {new Date(flag.updatedAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "text-xs",
                            flag.enabled
                              ? "bg-green-500/20 text-green-300 border-green-500/30"
                              : "bg-red-500/20 text-red-300 border-red-500/30"
                          )}>
                            {flag.enabled ? '已启用' : '已禁用'}
                          </Badge>
                          <Switch
                            checked={flag.enabled}
                            onCheckedChange={(checked) => toggleModule(flag.moduleId, checked)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </PageCard>
          </TabsContent>

          {/* ━━━ Tab 5: 依赖图谱 ━━━ */}
          <TabsContent value="dataflow" className="mt-3 space-y-3">
            {/* 数据流摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon="📡"
                label="总消息数"
                value={dataFlow?.totalMessages ?? '-'}
                compact
              />
              <StatCard
                icon="🔗"
                label="活跃边数"
                value={dataFlow?.edgeCount ?? '-'}
                compact
              />
              <StatCard
                icon="⚠️"
                label="异常数"
                value={dataFlow?.anomalyCount ?? '-'}
                compact
              />
              <StatCard
                icon="📦"
                label="活跃模块"
                value={dataFlow?.activeModules ?? '-'}
                compact
              />
            </div>

            {/* 依赖图谱 */}
            {depGraph && (
              <PageCard
                title="模块依赖图谱"
                icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
                action={
                  <div className="flex items-center gap-2">
                    {depGraph.orphans?.length > 0 && (
                      <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                        {depGraph.orphans.length} 孤立模块
                      </Badge>
                    )}
                    {depGraph.cycles?.length > 0 && (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">
                        {depGraph.cycles.length} 循环依赖
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => depGraphQuery.refetch()}>
                      <RefreshCw className={cn("w-3 h-3 mr-1", depGraphQuery.isFetching && "animate-spin")} />
                      刷新
                    </Button>
                  </div>
                }
              >
                <ScrollArea className="max-h-[400px] mt-2">
                  <div className="space-y-1">
                    {depGraph.nodes?.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded border border-border/20 hover:bg-card/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-12">{node.id}</span>
                          <span className="text-sm text-foreground">{node.label}</span>
                          <Badge variant="outline" className="text-xs">{node.domain}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-mono font-bold", getCompletenessColor(node.completeness))}>
                            {node.completeness}%
                          </span>
                          <div className="w-16">
                            <Progress value={node.completeness} className="h-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* 边列表 */}
                {depGraph.edges?.length > 0 && (
                  <div className="mt-3 border-t border-border/20 pt-3">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                      依赖关系 ({depGraph.edges.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {depGraph.edges.map((edge, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs font-mono"
                        >
                          {edge.source} → {edge.target}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 孤立模块 */}
                {depGraph.orphans?.length > 0 && (
                  <div className="mt-3 border-t border-border/20 pt-3">
                    <h4 className="text-xs font-medium text-yellow-400 mb-2">
                      孤立模块 ({depGraph.orphans.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {depGraph.orphans.map((orphan, i) => (
                        <Badge
                          key={i}
                          className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs font-mono"
                        >
                          {orphan}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 循环依赖 */}
                {depGraph.cycles?.length > 0 && (
                  <div className="mt-3 border-t border-border/20 pt-3">
                    <h4 className="text-xs font-medium text-red-400 mb-2">
                      循环依赖 ({depGraph.cycles.length})
                    </h4>
                    <div className="space-y-1">
                      {depGraph.cycles.map((cycle, i) => (
                        <Badge
                          key={i}
                          className="bg-red-500/20 text-red-300 border-red-500/30 text-xs font-mono"
                        >
                          {cycle.join(' → ')} → {cycle[0]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </PageCard>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
