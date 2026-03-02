import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

export default function Dashboard() {
  const { systemStatus, setSystemStatus } = useAppStore();
  const [, setLocation] = useLocation();

  // ============ tRPC 实时数据查询 ============

  // 1. Ollama 模型状态（已有）
  const { data: ollamaStatus } = trpc.model.getOllamaStatus.useQuery(undefined, {
    refetchInterval: 15000,
  });

  // 2. 观测中枢状态视图 — 设备统计 + 平台KPI
  const { data: statusView, isLoading: statusLoading } =
    trpc.observabilityHub.getStatusView.useQuery(undefined, {
      refetchInterval: 30000,
    });

  // 3. 微服务列表 — 服务数量及健康状态
  const { data: services, isLoading: servicesLoading } =
    trpc.microservice.getServices.useQuery(undefined, {
      refetchInterval: 30000,
    });

  // 4. 平台模块列表 — 已注册模块数量
  const { data: modules, isLoading: modulesLoading } =
    trpc.platformHealth.listModules.useQuery(undefined, {
      refetchInterval: 60000,
    });

  // 5. 系统资源 — CPU/内存/运行时间
  const { data: sysResources } =
    trpc.microservice.getSystemResources.useQuery(undefined, {
      refetchInterval: 15000,
    });

  // 当 Ollama 状态更新时同步到 appStore
  useEffect(() => {
    if (ollamaStatus) {
      setSystemStatus({
        ollama: ollamaStatus.online ? 'connected' : 'disconnected',
        currentModel: ollamaStatus.currentModel || systemStatus.currentModel,
      });
    }
  }, [ollamaStatus]);

  const quickActions = [
    { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents', variant: 'default' as const },
    { id: 'pipeline', label: 'Pipeline', icon: '🔗', path: '/pipeline', variant: 'secondary' as const },
    { id: 'chat', label: 'AI对话', icon: '💬', path: '/chat', variant: 'secondary' as const },
    { id: 'docs', label: '文档管理', icon: '📄', path: '/docs', variant: 'secondary' as const }
  ];

  // ============ 从实时数据派生统计值 ============

  // 设备统计（来自观测中枢）
  const totalDevices = statusView?.devices.totalDevices ?? 0;
  const onlineDevices = statusView?.devices.onlineDevices ?? 0;

  // 微服务统计
  const totalServices = services?.length ?? 0;
  const healthyServices = services?.filter(s => s.status === 'healthy').length ?? 0;

  // 平台模块统计
  const totalModules = modules?.length ?? 0;

  // 模型数量（来自 Ollama）
  const ollamaConnected = ollamaStatus ? ollamaStatus.online : systemStatus.ollama === 'connected';
  const currentModel = ollamaStatus?.currentModel || systemStatus.currentModel;
  const modelCount = ollamaStatus?.modelCount ?? 0;

  // 格式化运行时间
  const formatUptime = (seconds: number): string => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  };

  // 加载中占位符
  const loadingValue = (loading: boolean, value: number | string): number | string =>
    loading ? '...' : value;

  return (
    <MainLayout title="系统总览">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-4">
          <h2 className="text-base font-bold mb-1">系统总览</h2>
          <p className="text-xs text-muted-foreground">平台运行状态和快捷入口</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          <StatCard
            value={loadingValue(statusLoading, totalDevices)}
            label={`设备总数 (在线 ${onlineDevices})`}
            icon="🏗️"
            trend={totalDevices > 0 ? {
              value: Math.round((onlineDevices / totalDevices) * 100),
              isPositive: (onlineDevices / totalDevices) >= 0.8,
            } : undefined}
            onClick={() => setLocation('/device')}
          />
          <StatCard
            value={loadingValue(servicesLoading, totalServices)}
            label={`微服务 (健康 ${healthyServices})`}
            icon="🧩"
            trend={totalServices > 0 ? {
              value: Math.round((healthyServices / totalServices) * 100),
              isPositive: healthyServices === totalServices,
            } : undefined}
            onClick={() => setLocation('/microservices')}
          />
          <StatCard
            value={loadingValue(modulesLoading, totalModules)}
            label="平台模块"
            icon="📦"
            onClick={() => setLocation('/platform-health')}
          />
          <StatCard
            value={modelCount}
            label="AI 模型"
            icon="🧠"
            onClick={() => setLocation('/models')}
          />
        </div>

        {/* Quick actions and status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PageCard title="快捷入口" icon="⚡">
            <div className="grid grid-cols-2 gap-2">
              {(quickActions || []).map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant}
                  className="h-auto py-2 justify-start gap-1.5 text-[11px]"
                  onClick={() => setLocation(action.path)}
                >
                  <span className="text-sm">{action.icon}</span>
                  {action.label}
                </Button>
              ))}
            </div>
          </PageCard>

          <PageCard title="系统状态" icon="📊">
            <div className="space-y-0 text-[11px]">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">API服务</span>
                <Badge variant={systemStatus.api === 'running' ? 'success' : 'danger'} dot>
                  {systemStatus.api === 'running' ? '运行中' : '已停止'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Ollama</span>
                <Badge variant={ollamaConnected ? 'success' : 'danger'} dot>
                  {ollamaConnected ? '已连接' : '未连接'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">当前模型</span>
                <span className="text-foreground font-medium">{currentModel || '无'}</span>
              </div>
              {sysResources && (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-muted-foreground">CPU / 内存</span>
                    <span className="text-foreground font-medium">
                      {sysResources.cpu.usage}% / {sysResources.memory.usagePercent}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-muted-foreground">运行时间</span>
                    <span className="text-foreground font-medium">
                      {formatUptime(sysResources.processUptime)}
                    </span>
                  </div>
                </>
              )}
              {ollamaStatus?.runningModels && ollamaStatus.runningModels.length > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">运行中模型</span>
                  <div className="flex flex-col items-end gap-0.5">
                    {ollamaStatus.runningModels.map((rm, i) => (
                      <Badge key={i} variant="success" className="text-[10px]">
                        {rm.name} ({rm.parameterSize})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {ollamaStatus && !ollamaStatus.online && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Ollama 版本</span>
                  <span className="text-muted-foreground">-</span>
                </div>
              )}
              {ollamaStatus?.version && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Ollama 版本</span>
                  <span className="text-foreground">{ollamaStatus.version}</span>
                </div>
              )}
            </div>
          </PageCard>
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
          <PageCard title="最近诊断" icon="🔬" className="lg:col-span-2">
            <div className="text-center py-4 text-muted-foreground text-[11px]">
              <span className="text-2xl block mb-2">📋</span>
              暂无诊断记录
            </div>
          </PageCard>

          <PageCard title="系统通知" icon="🔔">
            <div className="space-y-2">
              {statusView && (
                <div className="p-2 bg-secondary rounded-md">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className={
                      statusView.overallStatus === 'operational' ? 'text-success' :
                      statusView.overallStatus === 'degraded' ? 'text-warning' : 'text-danger'
                    }>●</span>
                    <span>{statusView.overallMessage}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">实时</div>
                </div>
              )}
              {!statusView && (
                <div className="p-2 bg-secondary rounded-md">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-success">●</span>
                    <span>系统运行正常</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">刚刚</div>
                </div>
              )}
              {ollamaStatus?.runningModels && ollamaStatus.runningModels.length > 0 && (
                <div className="p-2 bg-secondary rounded-md">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-primary">●</span>
                    <span>{ollamaStatus.runningModels[0].name} 运行中</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">实时</div>
                </div>
              )}
              {(!ollamaStatus?.runningModels || ollamaStatus.runningModels.length === 0) && (
                <div className="p-2 bg-secondary rounded-md">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-primary">●</span>
                    <span>模型已加载</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">2分钟前</div>
                </div>
              )}
            </div>
          </PageCard>
        </div>
      </div>
    </MainLayout>
  );
}
