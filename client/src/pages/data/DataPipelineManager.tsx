import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, GitBranch, Play, Pause, Wifi, WifiOff,
  Activity, Clock, Plug, BarChart3,
} from "lucide-react";

type TabId = "overview" | "dags" | "connectors";

export default function DataPipelineManager() {
  const [tab, setTab] = useState<TabId>("overview");

  const summary = trpc.dataPipeline.getSummary.useQuery();
  const connections = trpc.dataPipeline.checkConnections.useQuery();
  const dags = trpc.dataPipeline.getDags.useQuery(undefined, { enabled: tab === "dags", retry: false });
  const connectors = trpc.dataPipeline.getConnectors.useQuery(undefined, { enabled: tab === "connectors", retry: false });
  const triggerDag = trpc.dataPipeline.triggerDag.useMutation({ onSuccess: () => dags.refetch() });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "概览", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "dags", label: "Airflow DAGs", icon: <GitBranch className="w-4 h-4" /> },
    { id: "connectors", label: "Kafka Connect", icon: <Plug className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="数据管道编排">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">数据管道编排</h2>
            <p className="text-muted-foreground">Airflow DAG 任务管理 + Kafka Connect 连接器管理</p>
          </div>
          <Button variant="outline" onClick={() => { summary.refetch(); connections.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* Tab */}
        <div className="flex gap-1 border-b pb-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 概览 */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="text-2xl font-bold">{(summary.data as any)?.airflow?.dagCount ?? "-"}</div>
                      <p className="text-xs text-muted-foreground">DAG 数量</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Plug className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold">{(summary.data as any)?.kafkaConnect?.connectorCount ?? "-"}</div>
                      <p className="text-xs text-muted-foreground">连接器数量</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-500" />
                    <div>
                      <div className="text-2xl font-bold">{(summary.data as any)?.airflow?.activeRuns ?? "-"}</div>
                      <p className="text-xs text-muted-foreground">活跃运行</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    {(connections.data as any)?.airflow?.connected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-red-500" />}
                    <div>
                      <Badge variant={(connections.data as any)?.airflow?.connected ? "default" : "secondary"}>
                        {(connections.data as any)?.airflow?.connected ? "Airflow 在线" : "Airflow 离线"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(connections.data as any)?.kafkaConnect?.connected ? "KafkaConnect 在线" : "KafkaConnect 离线"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Airflow DAGs */}
        {tab === "dags" && (
          <Card>
            <CardHeader><CardTitle>Airflow DAGs</CardTitle></CardHeader>
            <CardContent>
              {dags.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(dags.data) ? dags.data : (dags.data as any)?.dags || []).map((dag: any) => (
                    <div key={dag.dagId || dag.dag_id} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                      <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{dag.dagId || dag.dag_id}</p>
                        <p className="text-xs text-muted-foreground truncate">{dag.description || "No description"}</p>
                      </div>
                      <Badge variant={dag.isPaused || dag.is_paused ? "secondary" : "default"}>
                        {dag.isPaused || dag.is_paused ? "已暂停" : "运行中"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{dag.scheduleInterval || dag.schedule_interval || "-"}</span>
                      <Button size="sm" variant="outline" onClick={() => triggerDag.mutate({ dagId: dag.dagId || dag.dag_id })} disabled={triggerDag.isPending}>
                        <Play className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {(Array.isArray(dags.data) ? dags.data : (dags.data as any)?.dags || []).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无 DAG</p>
                      <p className="text-xs mt-1">请确认 Airflow 已配置并连接</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kafka Connectors */}
        {tab === "connectors" && (
          <Card>
            <CardHeader><CardTitle>Kafka Connect 连接器</CardTitle></CardHeader>
            <CardContent>
              {connectors.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(connectors.data) ? connectors.data : (connectors.data as any)?.connectors || []).map((c: any, i: number) => (
                    <div key={typeof c === "string" ? c : c.name || i} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                      <Plug className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{typeof c === "string" ? c : c.name || "-"}</p>
                        <p className="text-xs text-muted-foreground">{c.type || c.connector?.type || "-"}</p>
                      </div>
                      <Badge variant={c.status === "RUNNING" || c.state === "RUNNING" ? "default" : "secondary"}>
                        {c.status || c.state || "unknown"}
                      </Badge>
                    </div>
                  ))}
                  {(Array.isArray(connectors.data) ? connectors.data : (connectors.data as any)?.connectors || []).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Plug className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无连接器</p>
                      <p className="text-xs mt-1">请确认 Kafka Connect 已配置</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
