/**
 * MySQL 状态监控页面
 * 简单明了展示 MySQL 真实连接状态，顶部一键启动按钮
 * 
 * API 依赖:
 * - platformSystem.health.check → 快速健康检查
 * - database.workbench.connection.getStatus → 连接详情
 * - database.workbench.connection.testConnection → 测试连接
 * - docker.startEngine → 启动 MySQL 容器 (portai-mysql)
 * - docker.listEngines → 检查容器状态
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

export default function MySQLStatus() {
  const [starting, setStarting] = useState(false);

  // 1. 快速健康检查
  const { data: health, isLoading: loadingHealth, refetch: refetchHealth } =
    trpc.platformSystem.health.check.useQuery(undefined, { refetchInterval: 15000 });

  // 2. 连接详情
  const { data: connStatus, isLoading: loadingConn, refetch: refetchConn } =
    trpc.database.workbench.connection.getStatus.useQuery(undefined, { refetchInterval: 15000 });

  // 3. Docker 容器列表 — 查看 MySQL 容器状态
  const { data: engines, refetch: refetchEngines } =
    trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 15000 });

  // 4. 启动 MySQL 容器
  const startMutation = trpc.docker.startEngine.useMutation({
    onSuccess: (result: any) => {
      if (result?.success) {
        toast.success('MySQL 容器启动成功，等待服务就绪...');
        // 延迟刷新，等 MySQL 启动
        setTimeout(() => {
          refetchHealth();
          refetchConn();
          refetchEngines();
        }, 3000);
      } else {
        toast.error(`启动失败: ${result?.error || '未知错误'}`);
      }
      setStarting(false);
    },
    onError: (err: any) => {
      toast.error(`启动失败: ${err.message}`);
      setStarting(false);
    },
  });

  // 5. 测试连接
  const testMutation = trpc.database.workbench.connection.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`连接正常，延迟 ${result.latency}ms`);
      } else {
        toast.error(`连接失败: ${result.error || '未知错误'}`);
      }
    },
    onError: (err: any) => {
      toast.error(`测试失败: ${err.message}`);
    },
  });

  const handleStart = () => {
    setStarting(true);
    startMutation.mutate({ containerName: 'portai-mysql' });
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
  const containerState = mysqlContainer?.state || mysqlContainer?.status || '未知';

  return (
    <MainLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* 标题栏 + 操作按钮 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MySQL 状态</h1>
            <p className="text-sm text-muted-foreground mt-1">
              实时监控 MySQL 数据库连接状态
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors"
            >
              🔄 刷新
            </button>
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="px-4 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
            >
              🔍 测试连接
            </button>
            <button
              onClick={handleStart}
              disabled={starting || isOnline}
              className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
                isOnline
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30 cursor-default'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
              }`}
            >
              {starting ? '⏳ 启动中...' : isOnline ? '✅ 运行中' : '🚀 一键启动 MySQL'}
            </button>
          </div>
        </div>

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
                      ? `延迟 ${mysqlHealth?.latency ?? '-'}ms · 容器状态: ${containerState}`
                      : `容器状态: ${containerState} · 请检查 DATABASE_URL 环境变量或启动 MySQL 容器`
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
