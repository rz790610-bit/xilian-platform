import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Server, Shield, Database, Activity,
  Wifi, WifiOff, Settings, Layers,
} from "lucide-react";

export default function PlatformDomainPage() {
  // 从平台域聚合路由获取各子系统状态
  const systemHealth = trpc.evoPlatform.platformHealth.overview.useQuery(undefined, { retry: false });
  const registryStats = trpc.evoPlatform.registry.listRegistries.useQuery(undefined, { retry: false });
  const orchestratorStatus = trpc.evoPlatform.orchestratorHub.getStatus.useQuery(undefined, { retry: false });

  // 独立路由直接查询
  const infraHealth = trpc.infrastructure.getOverview.useQuery(undefined, { retry: false });
  const kafkaStatus = trpc.kafka.getClusterStatus.useQuery(undefined, { retry: false });
  const redisStatus = trpc.redis.getInfo.useQuery(undefined, { retry: false });
  const clickhouseHealth = trpc.clickhouse.healthCheck.useQuery(undefined, { retry: false });

  function refetchAll() {
    systemHealth.refetch();
    registryStats.refetch();
    orchestratorStatus.refetch();
    infraHealth.refetch();
    kafkaStatus.refetch();
    redisStatus.refetch();
    clickhouseHealth.refetch();
  }

  const services = [
    { name: "基础设施", icon: <Server className="w-4 h-4" />, connected: !infraHealth.isError, data: infraHealth.data },
    { name: "Kafka", icon: <Activity className="w-4 h-4" />, connected: !kafkaStatus.isError && !!(kafkaStatus.data as any)?.connected, data: kafkaStatus.data },
    { name: "Redis", icon: <Database className="w-4 h-4" />, connected: !redisStatus.isError, data: redisStatus.data },
    { name: "ClickHouse", icon: <Database className="w-4 h-4" />, connected: clickhouseHealth.data?.connected ?? false, data: clickhouseHealth.data },
  ];

  return (
    <MainLayout title="平台域">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">平台域总览</h2>
            <p className="text-muted-foreground">系统管理、认证、数据库、基础设施聚合视图</p>
          </div>
          <Button variant="outline" onClick={refetchAll}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* 服务连接状态 */}
        <div className="grid grid-cols-4 gap-4">
          {services.map(s => (
            <Card key={s.name}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  {s.connected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-red-500" />}
                  <div>
                    <div className="flex items-center gap-1">
                      {s.icon}
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <Badge variant={s.connected ? "default" : "destructive"} className="mt-1">
                      {s.connected ? "在线" : "离线"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 平台健康 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> 平台健康状态</CardTitle></CardHeader>
          <CardContent>
            {systemHealth.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : systemHealth.data ? (
              <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[300px]">
                {JSON.stringify(systemHealth.data, null, 2)}
              </pre>
            ) : <p className="text-center py-4 text-muted-foreground">平台健康数据不可用</p>}
          </CardContent>
        </Card>

        {/* 注册中心统计 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> 注册中心概览</CardTitle></CardHeader>
          <CardContent>
            {registryStats.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : registryStats.data ? (
              <div className="grid grid-cols-3 gap-3">
                {(Array.isArray(registryStats.data) ? registryStats.data : Object.entries(registryStats.data || {}).map(([k, v]) => ({ name: k, ...(typeof v === "object" && v ? v : { count: v }) }))).map((r: any, i: number) => (
                  <div key={i} className="p-3 bg-muted/30 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.name || r.id}</span>
                      <Badge variant="outline">{r.count ?? r.total ?? "-"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-center py-4 text-muted-foreground">注册中心数据不可用</p>}
          </CardContent>
        </Card>

        {/* 编排器状态 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> 编排器状态</CardTitle></CardHeader>
          <CardContent>
            {orchestratorStatus.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : orchestratorStatus.data ? (
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(orchestratorStatus.data as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="p-3 bg-muted/30 rounded flex items-center justify-between">
                    <span className="text-sm">{k}</span>
                    <Badge variant="outline">{typeof v === "boolean" ? (v ? "启用" : "禁用") : String(v)}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-center py-4 text-muted-foreground">编排器数据不可用</p>}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
