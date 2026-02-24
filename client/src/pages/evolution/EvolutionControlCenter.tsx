/**
 * ============================================================================
 * 进化引擎总控中心 — Phase 5
 * ============================================================================
 * 3 个 Tab: 引擎总览 | 模块拓扑 | 系统资源
 * 后端路由: evoEvolution.deepAI.controlCenter.*
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, SectionHeader, EmptyState } from '@/components/evolution';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import {
  Activity, AlertTriangle, Box, CheckCircle, Clock, Cpu, Database,
  Gauge, Globe, HardDrive, Layers, Monitor, Network, Play, Power,
  RefreshCw, Server, Settings, Shield, Square, TrendingUp, Zap,
  MemoryStick, Wifi,
} from 'lucide-react';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const MODULE_ICONS: Record<string, React.ReactNode> = {
  orchestrator: <Network className="w-4 h-4" />,
  causalGraph: <Globe className="w-4 h-4" />,
  experiencePool: <Database className="w-4 h-4" />,
  physicsVerifier: <Shield className="w-4 h-4" />,
  feedbackLoop: <RefreshCw className="w-4 h-4" />,
  shadowEvaluator: <Monitor className="w-4 h-4" />,
  championChallenger: <Zap className="w-4 h-4" />,
  canaryDeployment: <Layers className="w-4 h-4" />,
  otaFleet: <Wifi className="w-4 h-4" />,
  dojoTraining: <Cpu className="w-4 h-4" />,
  dataEngine: <HardDrive className="w-4 h-4" />,
  metaLearner: <Activity className="w-4 h-4" />,
  autoCodeGen: <Box className="w-4 h-4" />,
  closedLoopTracker: <TrendingUp className="w-4 h-4" />,
  worldModel: <Globe className="w-4 h-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  critical: 'bg-red-500',
  offline: 'bg-gray-400',
  starting: 'bg-blue-500',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 引擎总览 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EngineOverviewTab() {
  const overviewQuery = trpc.evoEvolution.deepAI.controlCenter.listInstances.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const toggleMut = trpc.evoEvolution.deepAI.controlCenter.startEngine.useMutation({
    onSuccess: () => { overviewQuery.refetch(); },
  });
  const emergencyStopMut = trpc.evoEvolution.deepAI.controlCenter.stopAll.useMutation({
    onSuccess: () => { overviewQuery.refetch(); },
  });
  const startAllMut = trpc.evoEvolution.deepAI.controlCenter.startAll.useMutation({
    onSuccess: () => { overviewQuery.refetch(); },
  });

  const instances = overviewQuery.data;
  if (!instances) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  const modules = (instances ?? []) as any[];
  const healthyCount = modules.filter((m: any) => m.status === 'running').length;
  const degradedCount = modules.filter((m: any) => m.status === 'degraded').length;
  const criticalCount = modules.filter((m: any) => m.status === 'error').length;
  const offlineCount = modules.filter((m: any) => m.status === 'stopped').length;

  // 状态分布饼图
  const statusDistribution = [
    { name: '运行中', value: healthyCount, color: '#22c55e' },
    { name: '降级', value: degradedCount, color: '#f59e0b' },
    { name: '错误', value: criticalCount, color: '#ef4444' },
    { name: '已停止', value: offlineCount, color: '#9ca3af' },
  ].filter(s => s.value > 0);

  return (
    <div className="space-y-6">
      {/* 全局控制 */}
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${healthyCount > criticalCount ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <div>
            <div className="font-medium">进化引擎全局状态</div>
            <div className="text-sm text-muted-foreground">
              {healthyCount} 运行中 · {degradedCount} 降级 · {criticalCount} 错误 · {offlineCount} 已停止
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => startAllMut.mutate()} disabled={startAllMut.isPending}>
            <Play className="w-4 h-4 mr-1" />全部启动
          </Button>
          <Button variant="destructive" size="sm" onClick={() => emergencyStopMut.mutate()} disabled={emergencyStopMut.isPending}>
            <Square className="w-4 h-4 mr-1" />紧急停止
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <StatCard label="总模块数" value={modules.length} icon={<Layers className="w-4 h-4" />} />
        <StatCard label="运行中" value={healthyCount} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard label="降级" value={degradedCount} icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} />
        <StatCard label="错误" value={criticalCount} icon={<AlertTriangle className="w-4 h-4 text-red-500" />} />
        <StatCard label="已停止" value={offlineCount} icon={<Clock className="w-4 h-4 text-gray-500" />} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 模块网格 */}
        <div className="col-span-2">
          <SectionHeader title="引擎模块状态" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            {modules.map((m: any) => (
              <div key={m.module} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[m.status as string] || 'bg-gray-400'}`} />
                    {MODULE_ICONS[m.module as string] || MODULE_ICONS[m.engineModule as string] || <Box className="w-4 h-4" />}
                    <span className="text-sm font-medium">{String(m.module ?? m.engineModule)}</span>
                  </div>
                  <Switch
                    checked={m.status === 'running'}
                    onCheckedChange={(checked: boolean) => {
                      if (checked) toggleMut.mutate({ engineModule: String(m.module ?? m.engineModule) });
                      else emergencyStopMut.mutate();
                    }}
                  />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {m.cpu != null && (
                    <div className="flex justify-between">
                      <span>CPU</span>
                      <span>{Number(m.cpu).toFixed(1)}%</span>
                    </div>
                  )}
                  {m.memory != null && (
                    <div className="flex justify-between">
                      <span>内存</span>
                      <span>{Number(m.memory).toFixed(0)} MB</span>
                    </div>
                  )}
                  {m.latency != null && (
                    <div className="flex justify-between">
                      <span>延迟</span>
                      <span>{Number(m.latency).toFixed(0)} ms</span>
                    </div>
                  )}
                  {m.throughput != null && (
                    <div className="flex justify-between">
                      <span>吞吐</span>
                      <span>{Number(m.throughput).toFixed(0)} req/s</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 状态分布 */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm font-medium mb-3">状态分布</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusDistribution.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 最近事件 */}
          <div className="border rounded-lg p-4">
            <div className="text-sm font-medium mb-3">最近事件</div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">模块状态实时监控中</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模块拓扑 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ModuleTopologyTab() {
  const topologyQuery = trpc.evoEvolution.deepAI.controlCenter.getTopology.useQuery(undefined, { retry: 1 });
  const topology = topologyQuery.data as { nodes: any[]; edges: any[] } | undefined;

  // 定义模块层级
  const layers = [
    { name: '数据层', modules: ['dataEngine', 'experiencePool'] },
    { name: '分析层', modules: ['causalGraph', 'physicsVerifier', 'metaLearner'] },
    { name: '评估层', modules: ['shadowEvaluator', 'championChallenger'] },
    { name: '部署层', modules: ['canaryDeployment', 'otaFleet'] },
    { name: '训练层', modules: ['dojoTraining', 'worldModel'] },
    { name: '自愈层', modules: ['autoCodeGen', 'closedLoopTracker'] },
    { name: '编排层', modules: ['orchestrator', 'feedbackLoop'] },
  ];

  const moduleStatusMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (topology?.nodes) {
      (topology.nodes as any[]).forEach((m: any) => { map[m.id as string] = m; });
    }
    return map;
  }, [topology]);

  return (
    <div className="space-y-6">
      <SectionHeader title="模块拓扑图" />

      <div className="space-y-4">
        {layers.map((layer, li) => (
          <div key={layer.name} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">L{li}</Badge>
              <span className="text-sm font-medium">{layer.name}</span>
            </div>
            <div className="flex gap-3 pl-8">
              {layer.modules.map(mod => {
                const info = moduleStatusMap[mod];
                const status = info?.status || 'stopped';
                return (
                  <div key={mod} className="flex-1 p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
                      {MODULE_ICONS[mod] || <Box className="w-4 h-4" />}
                      <span className="text-sm font-medium">{mod}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <div>CPU: {info?.cpu != null ? `${Number(info.cpu).toFixed(1)}%` : '-'}</div>
                      <div>内存: {info?.memory != null ? `${Number(info.memory).toFixed(0)}MB` : '-'}</div>
                      <div>延迟: {info?.latency != null ? `${Number(info.latency).toFixed(0)}ms` : '-'}</div>
                      <div>错误: {info?.errorCount ?? 0}</div>
                    </div>
                    {/* 依赖关系 */}
                    {info?.dependencies && (info.dependencies as string[]).length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="text-xs text-muted-foreground">
                          依赖: {(info.dependencies as string[]).join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {li < layers.length - 1 && (
              <div className="flex justify-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统资源 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SystemResourcesTab() {
  const statsQuery = trpc.evoEvolution.deepAI.controlCenter.getStats.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const instancesQuery = trpc.evoEvolution.deepAI.controlCenter.listInstances.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const stats = statsQuery.data;
  const instances = (instancesQuery.data ?? []) as any[];

  if (!stats) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  // 模块资源消耗柱状图（基于实例的 resourceUsage 字段）
  const moduleResources = instances
    .filter((m: any) => m.resourceUsage)
    .map((m: any) => ({
      name: String(m.module ?? m.engineModule ?? '').substring(0, 12),
      cpu: Number((m.resourceUsage as any)?.cpu ?? 0),
      memory: Number((m.resourceUsage as any)?.memoryMb ?? 0),
    }));

  // 模块健康度柱状图
  const healthData = instances.map((m: any) => ({
    name: String(m.module ?? m.engineModule ?? '').substring(0, 12),
    health: Number(m.healthScore ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* 资源概览 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总引擎数" value={stats.totalEngines} icon={<Layers className="w-4 h-4" />} />
        <StatCard label="运行中" value={stats.running} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard label="平均健康度" value={`${Number(stats.avgHealth).toFixed(1)}%`} icon={<Gauge className="w-4 h-4 text-amber-500" />} />
        <StatCard label="异常模块" value={stats.error + stats.degraded} icon={<AlertTriangle className="w-4 h-4 text-red-500" />} />
      </div>

      {/* 引擎运行状态进度条 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium">引擎运行率</div>
          <Progress value={stats.totalEngines > 0 ? (stats.running / stats.totalEngines) * 100 : 0} className="h-3" />
          <div className="text-xs text-muted-foreground">{stats.running} / {stats.totalEngines} 模块运行中</div>
        </div>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium">平均健康度</div>
          <Progress value={Number(stats.avgHealth)} className="h-3" />
          <div className="text-xs text-muted-foreground">当前平均健康度: {Number(stats.avgHealth).toFixed(1)}%</div>
        </div>
      </div>

      {/* 模块健康度柱状图 */}
      {healthData.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="text-sm font-medium mb-3">模块健康度</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={healthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="health" name="健康度 %" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 模块资源消耗 */}
      {moduleResources.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="text-sm font-medium mb-3">模块资源消耗</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={moduleResources}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cpu" name="CPU %" fill="#6366f1" />
              <Bar dataKey="memory" name="内存 MB" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function EvolutionControlCenter() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6 text-indigo-500" />
            进化引擎总控中心
          </h1>
          <p className="text-muted-foreground mt-1">
            全局引擎状态监控、模块拓扑管理、系统资源监控
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">
              <Monitor className="w-4 h-4 mr-1" />引擎总览
            </TabsTrigger>
            <TabsTrigger value="topology">
              <Network className="w-4 h-4 mr-1" />模块拓扑
            </TabsTrigger>
            <TabsTrigger value="resources">
              <Server className="w-4 h-4 mr-1" />系统资源
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><EngineOverviewTab /></TabsContent>
          <TabsContent value="topology"><ModuleTopologyTab /></TabsContent>
          <TabsContent value="resources"><SystemResourcesTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
