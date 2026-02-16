/**
 * MySQL 状态监控页面
 * 真实展示 MySQL 连接状态 + 一键启动（容器+配置+迁移+重连）
 * 
 * API 依赖:
 * - platformSystem.health.check → 快速健康检查
 * - database.workbench.connection.getStatus → 连接详情
 * - docker.bootstrapMySQL → 一键启动闭环
 * - docker.listEngines → 容器状态
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { toast } from 'sonner';

function formatUptime(seconds: number): string {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时 ${m}分钟`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

type BootstrapStep = { step: string; status: 'ok' | 'fail' | 'skip'; detail?: string };

export default function MySQLStatus() {
  const [bootstrapping, setBootstrapping] = useState(false);
  const [steps, setSteps] = useState<BootstrapStep[]>([]);

  // 1. 快速健康检查
  const { data: health, isLoading: loadingHealth, refetch: refetchHealth } =
    trpc.platformSystem.health.check.useQuery(undefined, { refetchInterval: 15000 });

  // 2. 连接详情
  const { data: connStatus, isLoading: loadingConn, refetch: refetchConn } =
    trpc.database.workbench.connection.getStatus.useQuery(undefined, { refetchInterval: 15000 });

  // 3. Docker 容器列表
  const { data: engines, refetch: refetchEngines } =
    trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 15000 });

  // 4. 一键启动 MySQL（完整闭环）
  const bootstrapMutation = trpc.docker.bootstrapMySQL.useMutation({
    onSuccess: (result: any) => {
      setSteps(result.steps || []);
      if (result.success) {
        toast.success('MySQL 一键启动完成，数据库已就绪');
      } else {
        toast.error(`启动未完全成功: ${result.error || '部分步骤失败'}`);
      }
      // 刷新所有状态
      setTimeout(() => {
        refetchHealth();
        refetchConn();
        refetchEngines();
      }, 1000);
      setBootstrapping(false);
    },
    onError: (err: any) => {
      toast.error(`启动失败: ${err.message}`);
      setBootstrapping(false);
    },
  });

  const handleBootstrap = () => {
    setBootstrapping(true);
    setSteps([]);
    bootstrapMutation.mutate();
  };

  const handleRefresh = () => {
    refetchHealth();
    refetchConn();
    refetchEngines();
    toast.info('刷新中...');
  };

  // 解析状态
  const mysqlHealth = health?.mysql;
  const isOnline = mysqlHealth?.status === 'healthy' && connStatus?.connected;
  const isLoading = loadingHealth || loadingConn;

  // 找到 MySQL 容器
  const mysqlContainer = engines?.engines?.find(
    (e: any) => e.containerName === 'portai-mysql' || e.serviceName === 'mysql'
  );
  const containerState = mysqlContainer?.state || mysqlContainer?.status || '未检测到';

  return (
    <MainLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* 标题栏 + 操作按钮 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MySQL 状态</h1>
            <p className="text-sm text-muted-foreground mt-1">
              实时监控 · 一键启动容器 + 配置 + 建表 + 连接
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors"
            >
              刷新
            </button>
            <button
              onClick={handleBootstrap}
              disabled={bootstrapping || isOnline}
              className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
                isOnline
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30 cursor-default'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
              }`}
            >
              {bootstrapping ? '⏳ 启动中...' : isOnline ? '✅ 运行中' : '🚀 一键启动 MySQL'}
            </button>
          </div>
        </div>

        {/* 启动步骤进度 */}
        {steps.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="text-sm font-medium text-foreground mb-2">启动流程</div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.status === 'ok' ? 'bg-green-600/20 text-green-400' :
                  s.status === 'skip' ? 'bg-yellow-600/20 text-yellow-400' :
                  'bg-red-600/20 text-red-400'
                }`}>
                  {s.status === 'ok' ? '✓' : s.status === 'skip' ? '—' : '✗'}
                </span>
                <span className="text-foreground font-medium w-36">{s.step}</span>
                <span className="text-muted-foreground">{s.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* 状态总览 */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        ) : (
          <>
            {/* 连接状态大卡片 */}
            <div className={`rounded-lg border p-6 ${
              isOnline
                ? 'border-green-600/30 bg-green-950/20'
                : 'border-red-600/30 bg-red-950/20'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${
                  isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                }`} />
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    {isOnline ? 'MySQL 已连接' : 'MySQL 未连接'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isOnline
                      ? `延迟 ${mysqlHealth?.latency ?? '-'}ms · 容器: ${containerState}`
                      : `容器: ${containerState} · 点击「一键启动 MySQL」自动完成全部配置`
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* 详情网格 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatusCard label="主机" value={connStatus?.host || '-'} />
              <StatusCard label="端口" value={connStatus?.port ? String(connStatus.port) : '-'} />
              <StatusCard label="数据库" value={connStatus?.database || '-'} />
              <StatusCard label="版本" value={connStatus?.version || '-'} />
              <StatusCard label="字符集" value={connStatus?.charset || '-'} />
              <StatusCard label="运行时间" value={formatUptime(connStatus?.uptime || 0)} />
              <StatusCard
                label="连接数"
                value={connStatus?.connected
                  ? `${connStatus.currentConnections} / ${connStatus.maxConnections}`
                  : '-'
                }
              />
              <StatusCard label="数据大小" value={connStatus?.dataSize || '-'} />
              <StatusCard label="索引大小" value={connStatus?.indexSize || '-'} />
              <StatusCard label="表数量" value={connStatus?.totalTables != null ? String(connStatus.totalTables) : '-'} />
              <StatusCard label="容器名" value={mysqlContainer?.containerName || 'portai-mysql'} />
              <StatusCard label="检查时间" value={health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '-'} />
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium text-foreground truncate" title={value}>{value}</div>
    </div>
  );
}
