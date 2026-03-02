import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Activity, Bell, Search as SearchIcon,
  Server, FileText, GitBranch, Shield, Eye,
  Wifi, WifiOff, AlertTriangle, BarChart3,
} from "lucide-react";

type TabId = "overview" | "metrics" | "logs" | "traces" | "alerts";

export default function ObservabilityDetail() {
  const [tab, setTab] = useState<TabId>("overview");
  const [logQuery, setLogQuery] = useState("");
  const [traceService, setTraceService] = useState("");

  const summaryQuery = trpc.observability.getSummary.useQuery();
  const summary = summaryQuery.data as any;
  const health = trpc.observability.getHealth.useQuery();
  const connections = trpc.observability.getConnectionStatus.useQuery();
  const nodeMetrics = trpc.observability.getNodeMetrics.useQuery(undefined, { enabled: tab === "metrics" });
  const containerMetrics = trpc.observability.getContainerMetrics.useQuery(undefined, { enabled: tab === "metrics" });
  const logs = trpc.observability.searchLogs.useQuery(
    logQuery ? { message: logQuery, limit: 50 } : { limit: 50 },
    { enabled: tab === "logs", retry: false },
  );
  const logStats = trpc.observability.getLogStats.useQuery(undefined, { enabled: tab === "logs" });
  const tracingServices = trpc.observability.getTracingServices.useQuery(undefined, { enabled: tab === "traces", retry: false });
  const traces = trpc.observability.searchTraces.useQuery(
    traceService ? { service: traceService, limit: 20 } : undefined,
    { enabled: tab === "traces" && !!traceService, retry: false },
  );
  const alerts = trpc.observability.getAlerts.useQuery(undefined, { enabled: tab === "alerts" });
  const alertStats = trpc.observability.getAlertStats.useQuery(undefined, { enabled: tab === "alerts" });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "概览", icon: <Eye className="w-4 h-4" /> },
    { id: "metrics", label: "指标", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "logs", label: "日志", icon: <FileText className="w-4 h-4" /> },
    { id: "traces", label: "链路追踪", icon: <GitBranch className="w-4 h-4" /> },
    { id: "alerts", label: "告警", icon: <Bell className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="可观测性详情">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">可观测性详情</h2>
            <p className="text-muted-foreground">Prometheus / ELK / Jaeger / Alertmanager 统一视图</p>
          </div>
          <Button variant="outline" onClick={() => { summaryQuery.refetch(); health.refetch(); connections.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 概览 Tab */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="text-2xl font-bold">
                        <Badge variant={summary?.prometheus?.status === "connected" ? "default" : "secondary"}>
                          {summary?.prometheus?.status || "unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Prometheus</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold">
                        <Badge variant={summary?.elasticsearch?.status === "connected" ? "default" : "secondary"}>
                          {summary?.elasticsearch?.status || "unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Elasticsearch</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-purple-500" />
                    <div>
                      <div className="text-2xl font-bold">
                        <Badge variant={summary?.jaeger?.status === "connected" ? "default" : "secondary"}>
                          {summary?.jaeger?.status || "unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Jaeger</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-orange-500" />
                    <div>
                      <div className="text-2xl font-bold">{summary?.alerts?.total ?? 0}</div>
                      <p className="text-xs text-muted-foreground">活跃告警 (危急: {summary?.alerts?.critical ?? 0})</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 连接状态 */}
            <Card>
              <CardHeader><CardTitle>服务连接状态</CardTitle></CardHeader>
              <CardContent>
                {connections.data ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(connections.data as Record<string, any>).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                        {(val as any)?.connected || val === true ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                        <span className="text-sm font-medium">{key}</span>
                        <Badge variant={(val as any)?.connected || val === true ? "default" : "secondary"} className="ml-auto">
                          {(val as any)?.connected || val === true ? "连接" : "断开"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">加载中...</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 指标 Tab */}
        {tab === "metrics" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>节点指标</CardTitle></CardHeader>
              <CardContent>
                {nodeMetrics.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left p-2">主机</th>
                          <th className="text-right p-2">CPU %</th>
                          <th className="text-right p-2">内存 %</th>
                          <th className="text-right p-2">磁盘 %</th>
                          <th className="text-left p-2">来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(nodeMetrics.data) ? nodeMetrics.data : []).map((n: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="p-2">{n.hostname || "-"}</td>
                            <td className="p-2 text-right font-mono">{typeof n.cpuUsage === "number" ? n.cpuUsage.toFixed(1) : "-"}%</td>
                            <td className="p-2 text-right font-mono">{typeof n.memoryUsage === "number" ? n.memoryUsage.toFixed(1) : "-"}%</td>
                            <td className="p-2 text-right font-mono">{typeof n.diskUsage === "number" ? n.diskUsage.toFixed(1) : "-"}%</td>
                            <td className="p-2"><Badge variant="outline">{n._source || "unknown"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!nodeMetrics.data || (Array.isArray(nodeMetrics.data) && nodeMetrics.data.length === 0)) && (
                      <p className="text-center py-4 text-muted-foreground">暂无节点指标</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>容器指标</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-[300px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left p-2">容器</th>
                        <th className="text-right p-2">CPU %</th>
                        <th className="text-right p-2">内存 MB</th>
                        <th className="text-left p-2">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(containerMetrics.data) ? containerMetrics.data : []).map((c: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-mono text-xs">{c.containerName || c.name || "-"}</td>
                          <td className="p-2 text-right font-mono">{typeof c.cpuUsage === "number" ? c.cpuUsage.toFixed(2) : "-"}%</td>
                          <td className="p-2 text-right font-mono">{typeof c.memoryUsageMb === "number" ? c.memoryUsageMb.toFixed(0) : "-"}</td>
                          <td className="p-2"><Badge variant={c.status === "running" ? "default" : "secondary"}>{c.status || "-"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!containerMetrics.data || (Array.isArray(containerMetrics.data) && containerMetrics.data.length === 0)) && (
                    <p className="text-center py-4 text-muted-foreground">暂无容器指标</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 日志 Tab */}
        {tab === "logs" && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              {logStats.data && Object.entries((logStats.data as any).levels || logStats.data).map(([level, count]: [string, any]) => {
                if (typeof count !== "number") return null;
                return (
                  <Card key={level}>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xl font-bold">{count}</div>
                      <Badge variant={level === "ERROR" || level === "FATAL" ? "destructive" : level === "WARN" ? "secondary" : "outline"}>
                        {level}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>日志搜索</CardTitle>
                  <div className="flex gap-2">
                    <Input placeholder="搜索日志..." value={logQuery} onChange={e => setLogQuery(e.target.value)} className="w-64" />
                    <Button size="sm" variant="outline" onClick={() => logs.refetch()}><SearchIcon className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-[500px]">
                  {(Array.isArray(logs.data) ? logs.data : (logs.data as any)?.logs || []).map((log: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 border-b text-xs font-mono hover:bg-muted/50">
                      <Badge variant={log.level === "ERROR" || log.level === "FATAL" ? "destructive" : log.level === "WARN" ? "secondary" : "outline"} className="text-xs shrink-0">
                        {log.level || "INFO"}
                      </Badge>
                      <span className="text-muted-foreground shrink-0">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString("zh-CN") : "-"}</span>
                      <span className="text-muted-foreground shrink-0">[{log.service || "-"}]</span>
                      <span className="break-all">{log.message || log.msg || "-"}</span>
                    </div>
                  ))}
                  {logs.data && (Array.isArray(logs.data) ? logs.data : (logs.data as any)?.logs || []).length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">暂无日志记录</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 链路追踪 Tab */}
        {tab === "traces" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>链路追踪</CardTitle>
                  <div className="flex gap-2">
                    <select className="border rounded px-2 py-1 text-sm bg-background" value={traceService} onChange={e => setTraceService(e.target.value)}>
                      <option value="">选择服务...</option>
                      {(Array.isArray(tracingServices.data) ? tracingServices.data : (tracingServices.data as any)?.services || []).map((s: any) => (
                        <option key={typeof s === "string" ? s : s.name} value={typeof s === "string" ? s : s.name}>
                          {typeof s === "string" ? s : s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!traceService ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>请选择服务查看链路</p>
                  </div>
                ) : traces.isLoading ? (
                  <p className="text-center py-4 text-muted-foreground">加载中...</p>
                ) : (
                  <div className="space-y-2">
                    {(Array.isArray(traces.data) ? traces.data : (traces.data as any)?.traces || []).map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{t.traceId || t.traceID || "-"}</span>
                        <Badge variant="outline">{t.operationName || t.operation || "-"}</Badge>
                        <span className="ml-auto text-xs">{t.duration ? `${t.duration}ms` : "-"}</span>
                        <Badge variant={t.status === "error" ? "destructive" : "default"}>{t.status || "ok"}</Badge>
                      </div>
                    ))}
                    {(Array.isArray(traces.data) ? traces.data : (traces.data as any)?.traces || []).length === 0 && (
                      <p className="text-center py-4 text-muted-foreground">暂无追踪数据</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 告警 Tab */}
        {tab === "alerts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {alertStats.data && (
                <>
                  <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{(alertStats.data as any).total ?? 0}</div><p className="text-xs text-muted-foreground">总告警</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-red-500">{(alertStats.data as any).firing ?? 0}</div><p className="text-xs text-muted-foreground">触发中</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-green-500">{(alertStats.data as any).resolved ?? 0}</div><p className="text-xs text-muted-foreground">已恢复</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-yellow-500">{(alertStats.data as any).silenced ?? 0}</div><p className="text-xs text-muted-foreground">已静默</p></CardContent></Card>
                </>
              )}
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> 告警列表</CardTitle></CardHeader>
              <CardContent>
                {(Array.isArray(alerts.data) ? alerts.data : []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>暂无活跃告警</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(Array.isArray(alerts.data) ? alerts.data : []).map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-3 rounded bg-muted/30">
                        <Badge variant={a.severity === "P0" || a.severity === "critical" ? "destructive" : "secondary"}>
                          {a.severity || "unknown"}
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.alertname || a.name || "未命名告警"}</p>
                          <p className="text-xs text-muted-foreground">{a.summary || a.description || a.annotations?.summary || "-"}</p>
                        </div>
                        <Badge variant={a.state === "firing" ? "destructive" : a.state === "resolved" ? "default" : "secondary"}>
                          {a.state || "unknown"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
